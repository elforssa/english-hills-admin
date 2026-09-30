#!/usr/bin/env python3
"""R4 stale-worker/reclaim race on the isolated local database; no HTTP."""
import concurrent.futures
import json
import os
import subprocess
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


def worker(statement, check=True):
    return sql("begin;set local request.jwt.claim.role='service_role';set local request.jwt.claim.sub='';" + statement + ';commit;', check, 15)


created = False
try:
    source = Path('scripts/test-crm-meta-funnel-r4.sql').read_text()
    prefix = source.split('create temp table claim1 as', 1)[0]
    sql(prefix + '\nset constraints all immediate;commit;')
    created = True
    claim = json.loads(worker('select public.crm_claim_external_deliveries(1,true)').stdout.strip())[0]
    delivery_id, old_lease = claim['id'], claim['lease_token']
    worker(f"""select public.crm_prepare_external_delivery(d.id,d.lease_token,jsonb_build_object('data',jsonb_build_array(jsonb_build_object(
      'event_name',d.mapping_snapshot->'events'->>d.event_kind,'event_id',d.provider_event_id,
      'event_time',floor(extract(epoch from d.event_time))::bigint,'action_source','system_generated',
      'user_data',jsonb_build_object('lead_id',e.source_external_id),
      'custom_data',jsonb_build_object('event_source','crm','lead_event_source','English Hills CRM')))))
      from public.crm_external_deliveries d join public.crm_lifecycle_eligibility_evidence e on e.id=d.eligibility_evidence_id
      where d.id='{delivery_id}'""")
    sql(f"update public.crm_external_deliveries set lease_until=now()-interval '1 second' where id='{delivery_id}'")

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        stale_future = pool.submit(worker, f"select public.crm_begin_external_attempt('{delivery_id}','{old_lease}')", False)
        reclaim_future = pool.submit(worker, 'select public.crm_claim_external_deliveries(1,true)', True)
        stale, reclaimed_result = stale_future.result(timeout=20), reclaim_future.result(timeout=20)

    assert stale.returncode != 0
    reclaimed = json.loads(reclaimed_result.stdout.strip())
    assert len(reclaimed) == 1 and reclaimed[0]['id'] == delivery_id and reclaimed[0]['lease_token'] != old_lease
    state = sql(f"select status||':'||attempt_count||':'||attempt_boundary_state from public.crm_external_deliveries where id='{delivery_id}'").stdout.strip()
    assert state == 'sending:0:not_started'
    print('PASS R4 stale begin races expired pre-send reclaim without deadlock; old fence loses and no attempt boundary is crossed', flush=True)
finally:
    if created:
        subprocess.run(['npx', 'supabase', 'db', 'reset', '--local', '--no-seed'], check=True, timeout=180)
        print('PASS isolated R4 concurrency fixtures removed by local database rebuild', flush=True)
