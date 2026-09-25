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
created = False
try:
    assert sql("select count(*) from supabase_migrations.schema_migrations where version='080';").stdout.strip() == '1'
    sql(f"""begin;
insert into auth.users(id,email,aud,role,created_at,updated_at)
values('{actor}','crm-phase3-concurrency-{actor}@example.invalid','authenticated','authenticated',now(),now());
update public.profiles set role='director' where id='{actor}';
commit;""")
    created = True
    policies = race('create_followup_policy', [(str(uuid.uuid4()), {'weekly_hours': hours}) for _ in range(2)])
    assert all('error' not in p for p in policies), policies
    assert abs(policies[0]['version'] - policies[1]['version']) == 1
    print('PASS concurrent policy publication uses distinct increasing versions', flush=True)

    key = str(uuid.uuid4())
    payload = {'display_name': 'Concurrency synthetic', 'learner_name': 'Concurrency learner', 'source_label': 'Manual'}
    results = race('create_manual_lead', [(key, payload), (key, payload)])
    assert results[0] == results[1] and 'error' not in results[0], results
    lead = results[0]['lead']['id']
    assert sql(f"select count(*) from public.crm_leads where id='{lead}';").stdout.strip() == '1'
    print('PASS simultaneous intake replay returns the identical committed result', flush=True)

    payload = {'lead_id': lead, 'expected_version': 1, 'outcome': 'no_answer'}
    key = str(uuid.uuid4())
    results = race('record_call_outcome', [(key, payload), (key, payload)])
    assert results[0] == results[1] and results[0].get('failed_attempts') == 1, results
    assert len(results[0]['open_tasks']) == 1
    print('PASS simultaneous failed-call replay: one attempt, one next task', flush=True)

    version = results[0]['lead']['version']
    results = race('add_note', [(str(uuid.uuid4()), {'lead_id': lead, 'expected_version': version, 'note': n}) for n in ('First', 'Second')])
    assert sum('error' in r for r in results) == 1, results
    assert 'Stale lead version' in next(r['error'] for r in results if 'error' in r)
    print('PASS independent simultaneous mutations reject the stale version', flush=True)

    # Finish a non-call task through competing independent completion requests.
    version = int(sql(f"select version from public.crm_leads where id='{lead}';").stdout)
    due = sql("select (now()+interval '1 day')::text;").stdout.strip()
    scheduled = command('schedule_task', str(uuid.uuid4()), {'lead_id': lead, 'expected_version': version, 'task': {'task_type': 'whatsapp_followup', 'due_at': due}})
    task = next(t for t in scheduled['open_tasks'] if t['task_type'] == 'whatsapp_followup')
    data = {'lead_id': lead, 'expected_version': scheduled['lead']['version'], 'task_id': task['id'], 'expected_task_version': task['version'], 'outcome': 'Sent'}
    results = race('complete_task', [(str(uuid.uuid4()), data), (str(uuid.uuid4()), data)])
    assert sum('error' in r for r in results) == 1, results
    assert 'Stale lead version' in next(r['error'] for r in results if 'error' in r)
    assert sql(f"select count(*) from public.crm_activities where task_id='{task['id']}' and event_type='task_completed';").stdout.strip() == '1'
    print('PASS concurrent task completion writes exactly one completion event', flush=True)

    # Changed payload cannot reuse an already committed request key.
    conflict = command('record_call_outcome', key, payload | {'outcome': 'busy'})
    assert 'Request key payload conflict' in conflict.get('error', ''), conflict
    print('PASS changed-payload request replay is rejected', flush=True)
finally:
    if created:
        # The single data-modifying CTE removes both sides of circular FKs in
        # one statement. No FK triggers or role guards are disabled.
        sql(f"""begin;
lock table public.crm_activities,public.crm_command_requests,public.crm_contacts,
 public.crm_followup_policies,public.crm_leads,public.crm_submission_attribution,
 public.crm_submissions,public.crm_tasks in access exclusive mode;
alter table public.crm_activities disable trigger crm_activities_immutable;
alter table public.crm_submissions disable trigger crm_submission_immutable;
alter table public.crm_command_requests disable trigger crm_requests_immutable;
alter table public.crm_followup_policies disable trigger crm_policy_immutable;
with removed_tasks as (delete from public.crm_tasks where lead_id in
 (select id from public.crm_leads where contact_id in(select id from public.crm_contacts where created_by='{actor}')) returning id),
removed_activities as (delete from public.crm_activities where actor_id='{actor}' returning id),
removed_submissions as (delete from public.crm_submissions where resolved_by='{actor}' returning id),
removed_leads as (delete from public.crm_leads where contact_id in
 (select id from public.crm_contacts where created_by='{actor}') returning id)
select count(*) from removed_leads;
delete from public.crm_contacts where created_by='{actor}';
delete from public.crm_command_requests where actor_scope='{actor}';
delete from public.crm_followup_policies where created_by='{actor}';
alter table public.crm_activities enable trigger crm_activities_immutable;
alter table public.crm_submissions enable trigger crm_submission_immutable;
alter table public.crm_command_requests enable trigger crm_requests_immutable;
alter table public.crm_followup_policies enable trigger crm_policy_immutable;
delete from auth.users where id='{actor}';
commit;""")
        assert sql(f"select count(*) from public.profiles where id='{actor}';").stdout.strip() == '0'
        print('PASS synthetic concurrency fixtures removed; guards restored', flush=True)
