#!/usr/bin/env python3
"""R4 same-lead lock ordering and stale-worker fencing; no provider HTTP."""
import concurrent.futures
import json
import os
import subprocess
import time
from pathlib import Path

branch = subprocess.run(['git', 'branch', '--show-current'], capture_output=True, text=True, check=True).stdout.strip()
assert branch.startswith('codex/') or (os.getenv('GITHUB_ACTIONS') == 'true' and os.getenv('GITHUB_EVENT_NAME') == 'pull_request')
args = ['psql', '-X', '-qAt', '-h', '127.0.0.1', '-p', '54322', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']


def sql(statement, check=True, timeout=60):
    result = subprocess.run(args, input=statement, text=True, capture_output=True,
                            env={**os.environ, 'PGPASSWORD': 'postgres'}, timeout=timeout)
    if check and result.returncode:
        raise AssertionError(result.stderr)
    return result


def worker(statement, check=True, timeout=15):
    return sql("begin;set local request.jwt.claim.role='service_role';set local request.jwt.claim.sub='';" + statement + ';commit;', check, timeout)


def parse_claim(result):
    lines = [line for line in result.stdout.splitlines() if line.strip()]
    return json.loads(lines[-1]) if lines else []


def lead_for(external_id):
    return sql(f"""select l.id from public.crm_leads l join public.crm_submissions s on s.id=l.first_submission_id
      join public.crm_submission_attribution a on a.submission_id=s.id where a.external_submission_id='{external_id}'""").stdout.strip()


def prepare(delivery_id, lease):
    worker(f"""select public.crm_prepare_external_delivery(d.id,'{lease}',jsonb_build_object('data',jsonb_build_array(jsonb_build_object(
      'event_name',d.mapping_snapshot->'events'->>d.event_kind,'event_id',d.provider_event_id,
      'event_time',floor(extract(epoch from d.event_time))::bigint,'action_source','system_generated',
      'user_data',jsonb_build_object('lead_id',e.source_external_id),
      'custom_data',jsonb_build_object('event_source','crm','lead_event_source','English Hills CRM')))))
      from public.crm_external_deliveries d join public.crm_lifecycle_eligibility_evidence e on e.id=d.eligibility_evidence_id
      where d.id='{delivery_id}'""")


created = False
try:
    source = Path('scripts/test-crm-meta-funnel-r4.sql').read_text()
    prefix = source.split('create temp table claim1 as', 1)[0]
    sql(prefix + '\nset constraints all immediate;commit;')
    created = True
    history_lead = lead_for('882010')
    direct_lead = lead_for('882011')
    history = sql(f"""select id||':'||event_kind from public.crm_external_deliveries where lead_id='{history_lead}'
      order by event_time,created_at,id""").stdout.splitlines()
    intake_id = next(row.split(':')[0] for row in history if row.endswith(':intake'))
    successor_id = next(row.split(':')[0] for row in history if not row.endswith(':intake'))

    sql("update public.crm_external_deliveries set next_attempt_at=now()+interval '1 day' where status in ('pending','retry','blocked')")
    sql(f"update public.crm_external_deliveries set next_attempt_at=now() where id='{intake_id}'")
    started = time.monotonic()
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(worker, 'select public.crm_claim_external_deliveries(1,true)') for _ in range(2)]
        claims = [parse_claim(f.result(timeout=20)) for f in futures]
    assert time.monotonic() - started < 15
    claimed = [item for batch in claims for item in batch]
    assert len(claimed) == 1 and claimed[0]['id'] == intake_id
    intake_lease = claimed[0]['lease_token']
    prepare(intake_id, intake_lease)

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        begins = [pool.submit(worker, f"select public.crm_begin_external_attempt('{intake_id}','{intake_lease}')", False) for _ in range(2)]
        begin_results = [f.result(timeout=20) for f in begins]
    assert sum(result.returncode == 0 for result in begin_results) == 1
    assert sql(f"select count(*) from public.crm_external_delivery_attempts where delivery_id='{intake_id}'").stdout.strip() == '1'

    sql(f"update public.crm_external_deliveries set next_attempt_at=now() where id='{successor_id}'")
    active_finish = f"""select pg_advisory_xact_lock_shared(460046,0);select pg_advisory_xact_lock(hashtextextended('crm:lifecycle:lead:{history_lead}',0));
      select pg_sleep(0.5);
      select public.crm_finish_external_attempt('{intake_id}','{intake_lease}','{{"outcome":"sent","http_status":200}}')"""
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        finishing = pool.submit(worker, active_finish)
        time.sleep(0.1)
        overtaking = pool.submit(worker, 'select public.crm_claim_external_deliveries(1,true)')
        overtake_claim = parse_claim(overtaking.result(timeout=20))
        finish_result = finishing.result(timeout=20)
    assert finish_result.returncode == 0 and overtake_claim == []
    successor_claim = parse_claim(worker('select public.crm_claim_external_deliveries(1,true)'))
    assert len(successor_claim) == 1 and successor_claim[0]['id'] == successor_id

    direct_intake = sql(f"select id from public.crm_external_deliveries where lead_id='{direct_lead}' and event_kind='intake'").stdout.strip()
    sql("update public.crm_external_deliveries set next_attempt_at=now()+interval '1 day' where status in ('pending','retry','blocked')")
    sql(f"update public.crm_external_deliveries set next_attempt_at=now() where id='{direct_intake}'")
    stale_claim = parse_claim(worker('select public.crm_claim_external_deliveries(1,true)'))
    assert len(stale_claim) == 1 and stale_claim[0]['id'] == direct_intake
    stale_lease = stale_claim[0]['lease_token']
    prepare(direct_intake, stale_lease)
    worker(f"select public.crm_begin_external_attempt('{direct_intake}','{stale_lease}')")
    sql(f"update public.crm_external_deliveries set lease_until=now()-interval '1 second' where id='{direct_intake}'")
    parse_claim(worker('select public.crm_claim_external_deliveries(1,true)'))
    stale_finish = worker(
        f"""select public.crm_finish_external_attempt('{direct_intake}','{stale_lease}','{{"outcome":"sent","http_status":200}}')""",
        False)
    assert stale_finish.returncode != 0
    fenced = sql(f"""select d.status||':'||d.attempt_boundary_state||':'||a.outcome||':'||coalesce(d.last_error_code,'')
      from public.crm_external_deliveries d join public.crm_external_delivery_attempts a on a.delivery_id=d.id
      where d.id='{direct_intake}'""").stdout.strip()
    assert fenced == 'unknown:unknown:unknown:lease_expired_after_dispatch'
    print('PASS R4 concurrent same-lead claims/begins serialize without deadlock; a started predecessor cannot be overtaken; stale finalize loses after fencing', flush=True)
finally:
    if created:
        subprocess.run(['npx', 'supabase', 'db', 'reset', '--local', '--no-seed'], check=True, timeout=180)
        print('PASS isolated R4 concurrency fixtures removed by local database rebuild', flush=True)
