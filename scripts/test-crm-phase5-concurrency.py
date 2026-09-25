#!/usr/bin/env python3
"""Local-only concurrent RPC tests. Removes this run's synthetic fixtures.

Uses separate PostgreSQL sessions, not simulated sequential retries. The fixture
must be committed to be visible across sessions. Cleanup locks CRM tables and
briefly disables only their append-only DELETE guards inside one transaction;
foreign keys stay enabled. No existing records are deleted or changed.
"""
import concurrent.futures
import json
import os
from pathlib import Path
import subprocess
import uuid

ROOT = Path(__file__).resolve().parents[1]
head = (ROOT / '.git/HEAD').read_text().strip()
assert head.startswith('ref: refs/heads/codex/') or head == 'ref: refs/heads/codex-migration'
ARGS = ['psql', '-X', '-qAt', '-h', '127.0.0.1', '-p', '54322', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']
ENV = {**os.environ, 'PGPASSWORD': 'postgres'}
actor = str(uuid.uuid4())

def sql(text, check=True):
    result = subprocess.run(ARGS, input=text, text=True, capture_output=True, env=ENV, timeout=60)
    if check and result.returncode:
        raise AssertionError(result.stderr)
    return result

def quote(value):
    return "'" + str(value).replace("'", "''") + "'"

def command(name, key, payload):
    # UUIDs and a locally serialized JSON object only; never shell interpolation.
    statement = f"""begin;
set local request.jwt.claim.sub={quote(actor)};
set local role authenticated;
select public.crm_{name}({quote(key)}::uuid,{quote(json.dumps(payload))}::jsonb);
commit;"""
    result = sql(statement, False)
    if result.returncode:
        return {'error': result.stderr}
    return json.loads(result.stdout.strip())

def race(name, requests):
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        return list(pool.map(lambda item: command(name, *item), requests))

hours = {str(i): [['10:00', '12:30'], ['15:20', '20:00']] for i in range(2, 7)}
hours.update({'1': [['15:00', '20:00']], '7': []})
students = [str(uuid.uuid4()), str(uuid.uuid4())]
created = False
try:
    assert sql("select count(*) from supabase_migrations.schema_migrations where version='083';").stdout.strip() == '1'
    sql(f"""begin;
insert into auth.users(id,email,aud,role,created_at,updated_at)
values('{actor}','crm-phase5-concurrency-{actor}@example.invalid','authenticated','authenticated',now(),now());
update public.profiles set role='director' where id='{actor}';
commit;""")
    created = True
    policies = race('create_followup_policy', [(str(uuid.uuid4()), {'weekly_hours': hours}) for _ in range(2)])
    assert all('error' not in p for p in policies), policies
    assert abs(policies[0]['version'] - policies[1]['version']) == 1
    print('PASS concurrent policy publication uses distinct increasing versions', flush=True)

    def qualified():
        intake = command('create_manual_lead', str(uuid.uuid4()), {'display_name': 'Placement race', 'learner_name': 'Synthetic learner', 'source_label': 'Manual'})
        lead = intake['lead']['id']
        due = sql("select (now()+interval '1 day')::text").stdout.strip()
        result = command('qualify_lead', str(uuid.uuid4()), {'lead_id': lead, 'expected_version': 1, 'conversation_channel': 'phone', 'note': 'Placement agreed', 'qualification_step': 'placement_test', 'next_task': {'task_type': 'confirm_placement_test', 'due_at': due}})
        assert 'error' not in result, result
        task = result['open_tasks'][0]
        return {'lead_id': lead, 'expected_version': result['lead']['version'], 'task_id': task['id'], 'expected_task_version': task['version'], 'date_test': sql("select (current_date+2)::text").stdout.strip(), 'heure': '10:30'}
    for same_key in (True, False):
        payload = qualified();key = str(uuid.uuid4())
        results = race('book_placement_test', [(key,payload), (key if same_key else str(uuid.uuid4()),payload)])
        if same_key:
            assert results[0] == results[1] and 'error' not in results[0], results
            assert command('book_placement_test',key,payload) == results[0]
            assert 'Request key payload conflict' in command('book_placement_test',key,payload|{'heure':'11:00'}).get('error','')
        else:
            assert sum('error' in r for r in results) == 1, results
        lead=payload['lead_id']
        assert sql(f"select count(*) from public.placement_tests where crm_lead_id='{lead}'").stdout.strip()=='1'
        placement=next(r['placement'] for r in results if 'placement' in r)
        pid=placement['id']
        def result_edit(level):
            return sql(f"begin;set local request.jwt.claim.sub='{actor}';set local role authenticated;update public.placement_tests set status='Résultat saisi',niveau_recommande='{level}' where id='{pid}';commit;",False)
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            outcomes=list(pool.map(result_edit,['A2','B1']))
        assert all(r.returncode==0 for r in outcomes), [r.stderr for r in outcomes]
        for event in ('placement_test_attended','placement_result_entered'):
            assert sql(f"select count(*) from public.crm_activities where placement_test_id='{pid}' and event_type='{event}'").stdout.strip()=='1'
        assert sql(f"select count(*) from public.crm_tasks where placement_test_id='{pid}' and task_type='post_test_followup'").stdout.strip()=='1'
        print('PASS booking race, exact replay/conflict, concurrent result milestones and one followup; same_key='+str(same_key),flush=True)


    # The future student-consistency invariant survives two different table writes.
    payload=qualified();lead=payload['lead_id']
    placement=command('book_placement_test',str(uuid.uuid4()),payload)['placement']['id']
    sql(f"insert into public.students(id,full_name,status) values('{students[0]}','Phase5 consistency A','Prospect'),('{students[1]}','Phase5 consistency B','Prospect');update public.crm_leads set student_id='{students[0]}' where id='{lead}';")
    statements=[f"update public.crm_leads set student_id='{students[1]}' where id='{lead}'",f"update public.placement_tests set student_id='{students[0]}' where id='{placement}'"]
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        outcomes=list(pool.map(lambda statement:sql(f"begin;set local request.jwt.claim.sub='{actor}';{statement};select pg_sleep(0.15);commit;",False),statements))
    assert sum(r.returncode==0 for r in outcomes)==1,[r.stderr for r in outcomes]
    assert sql(f"select p.student_id is null or p.student_id=l.student_id from public.placement_tests p join public.crm_leads l on l.id=p.crm_lead_id where p.id='{placement}'").stdout.strip()=='t'
    print('PASS concurrent lead/placement student edits cannot create inconsistent links',flush=True)

finally:
    if created:
        # The single data-modifying CTE removes both sides of circular FKs in
        # one statement. No FK triggers or role guards are disabled.
        sql(f"""begin;
lock table public.placement_tests,public.crm_activities,public.crm_command_requests,public.crm_contacts,
 public.crm_followup_policies,public.crm_leads,public.crm_submission_attribution,
 public.crm_submissions,public.crm_tasks in access exclusive mode;
alter table public.placement_tests disable trigger crm_placement_integrity;
alter table public.crm_activities disable trigger crm_activities_immutable;
alter table public.crm_submissions disable trigger crm_submission_immutable;
alter table public.crm_command_requests disable trigger crm_requests_immutable;
alter table public.crm_followup_policies disable trigger crm_policy_immutable;
with removed_placements as(delete from public.placement_tests where crm_lead_id in(select id from public.crm_leads where contact_id in(select id from public.crm_contacts where created_by='{actor}')) returning id),
removed_tasks as (delete from public.crm_tasks where lead_id in
 (select id from public.crm_leads where contact_id in(select id from public.crm_contacts where created_by='{actor}')) returning id),
removed_activities as (delete from public.crm_activities where actor_id='{actor}' returning id),
removed_submissions as (delete from public.crm_submissions where resolved_by='{actor}' returning id),
removed_leads as (delete from public.crm_leads where contact_id in
 (select id from public.crm_contacts where created_by='{actor}') returning id)
select count(*) from removed_leads;
delete from public.crm_contacts where created_by='{actor}';
delete from public.crm_command_requests where actor_scope='{actor}';
delete from public.crm_followup_policies where created_by='{actor}';
alter table public.placement_tests enable trigger crm_placement_integrity;
alter table public.crm_activities enable trigger crm_activities_immutable;
alter table public.crm_submissions enable trigger crm_submission_immutable;
alter table public.crm_command_requests enable trigger crm_requests_immutable;
alter table public.crm_followup_policies enable trigger crm_policy_immutable;
delete from public.students where id in('{students[0]}','{students[1]}');
delete from auth.users where id='{actor}';
commit;""")
        assert sql(f"select count(*) from public.profiles where id='{actor}';").stdout.strip() == '0'
        print('PASS synthetic concurrency fixtures removed; guards restored', flush=True)
