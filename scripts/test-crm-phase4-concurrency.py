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
    assert sql("select count(*) from supabase_migrations.schema_migrations where version='082';").stdout.strip() == '1'
    sql(f"""begin;
insert into auth.users(id,email,aud,role,created_at,updated_at)
values('{actor}','crm-phase4-concurrency-{actor}@example.invalid','authenticated','authenticated',now(),now());
update public.profiles set role='director' where id='{actor}';
commit;""")
    created = True
    policies = race('create_followup_policy', [(str(uuid.uuid4()), {'weekly_hours': hours}) for _ in range(2)])
    assert all('error' not in p for p in policies), policies
    assert abs(policies[0]['version'] - policies[1]['version']) == 1
    print('PASS concurrent policy publication uses distinct increasing versions', flush=True)

    for decision in ('callback', 'qualify', 'lost', 'not_qualified'):
        intake = command('create_manual_lead', str(uuid.uuid4()), {'display_name': 'Decision test', 'learner_name': 'Synthetic learner', 'source_label': 'Manual'})
        lead = intake['lead']['id']
        task = intake['open_tasks'][0]
        payload = {'lead_id': lead, 'expected_version': 1, 'task_id': task['id'], 'expected_task_version': task['version'], 'decision': decision, 'note': 'Parent conversation'}
        if decision in ('callback', 'qualify'):
            payload['next_task'] = {'task_type': 'callback' if decision == 'callback' else 'confirm_placement_test', 'due_at': sql("select (now()+interval '1 day')::text").stdout.strip()}
            if decision == 'qualify':
                payload['qualification_step'] = 'placement_test'
        else:
            payload['reason'] = 'not_interested' if decision == 'lost' else 'program_not_suitable'
        key = str(uuid.uuid4())
        results = race('record_conversation_decision', [(key, payload), (key, payload)])
        assert results[0] == results[1] and 'error' not in results[0], results
        assert len(results[0]['open_tasks']) == (1 if decision in ('callback', 'qualify') else 0), results
        assert sql(f"select count(*) from public.crm_activities where lead_id='{lead}' and event_type='conversation_recorded'").stdout.strip() == '1'
        assert command('record_conversation_decision', key, payload) == results[0]
        assert 'Request key payload conflict' in command('record_conversation_decision', key, payload | {'note': 'Changed'}).get('error', '')
        print('PASS concurrent + network replay: ' + decision, flush=True)
    intake = command('create_manual_lead', str(uuid.uuid4()), {'display_name': 'Decision race', 'learner_name': 'Synthetic learner', 'source_label': 'Manual'})
    lead = intake['lead']['id']
    payload = {'lead_id': lead, 'expected_version': 1, 'decision': 'lost', 'reason': 'not_interested', 'note': 'Parent conversation'}
    results = race('record_conversation_decision', [(str(uuid.uuid4()), payload), (str(uuid.uuid4()), payload)])
    assert sum('error' in r for r in results) == 1, results
    assert 'Stale lead version' in next(r['error'] for r in results if 'error' in r)
    print('PASS competing decisions: one commit, one stale rejection', flush=True)

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
