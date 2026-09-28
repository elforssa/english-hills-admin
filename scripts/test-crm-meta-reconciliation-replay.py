#!/usr/bin/env python3
"""Local-only fresh 001–094 and retained-data 093→094 replay in disposable databases."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import subprocess
import sys
import time

platform = Path(sys.argv[1]).read_text()
assert 'CREATE TABLE auth.users' in platform and 'CREATE TABLE storage.objects' in platform
assert 'CREATE TABLE public.' not in platform and '\nCOPY ' not in platform
files = sorted(Path('supabase/migrations').glob('*.sql'))
assert [f.name[:3] for f in files] == [f'{i:03}' for i in range(1, 95)]
container = 'supabase_db_hills-admin-next'

def run(args, data=''):
    result = subprocess.run(['docker', 'exec', '-i', '-e', 'PGPASSWORD=postgres', container, *args],
                            input=data, text=True, capture_output=True, timeout=180)
    if result.returncode: raise AssertionError(result.stderr)
    return result.stdout.strip()

def sql(db, data, user='postgres'):
    return run(['psql', '-X', '-qAt', '-vON_ERROR_STOP=1', '-U', user, '-d', db], data)

for db in ('reconcile94_fresh', 'reconcile94_upgrade'):
    run(['createdb', '-U', 'supabase_admin', '-O', 'postgres', '-T', 'template0', db])
    try:
        sql(db, platform, 'supabase_admin')
        assert sql(db, 'select count(*) from auth.users') == '0'
        for migration in files:
            if db.endswith('upgrade') and migration.name.startswith('094'):
                sql(db, """
insert into auth.users(id,email,aud,role) values('94000000-0000-0000-0000-000000000001','upgrade@example.invalid','authenticated','authenticated');
update profiles set role='director' where id='94000000-0000-0000-0000-000000000001';
set request.jwt.claim.sub='94000000-0000-0000-0000-000000000001';
insert into crm_integration_connections(id,connection_key,page_id,api_version,access_token_secret_ref,created_by,updated_by)
values('94000000-0000-0000-0000-000000000002','upgrade-meta-94','94001','v26.0','CRM_META_PAGE_TOKEN_TEST','94000000-0000-0000-0000-000000000001','94000000-0000-0000-0000-000000000001');
select crm_publish_meta_form_mapping('94000000-0000-0000-0000-000000000002','{"form_key":"94002","field_map":{},"effective_from":"2020-01-01Z"}');
insert into crm_ingestion_jobs(connection_id,external_key,event_kind,payload,payload_hash,status)
values('94000000-0000-0000-0000-000000000002','94001:94003','leadgen','{"page_id":"94001","form_id":"94002","leadgen_id":"94003","created_time":1700000000}',repeat('a',64),'blocked');
""")
                before = sql(db, "select jsonb_build_object('connection',(select to_jsonb(c) from crm_integration_connections c),'mapping',(select to_jsonb(m) from crm_form_mappings m),'job',(select to_jsonb(j) from crm_ingestion_jobs j))")
            sql(db, migration.read_text())
        if db.endswith('upgrade'):
            assert sql(db, "select settings='{}'::jsonb and enabled=false from crm_integration_connections") == 't'
            assert sql(db, 'select option_labels=\'{}\'::jsonb from crm_form_mappings') == 't'
            assert sql(db, 'select reconciliation_started_at is null and status=\'blocked\' from crm_ingestion_jobs') == 't'
            assert before and sql(db, 'select count(*) from crm_meta_reconciliation_state') == '0'
            print('PASS 093→094 retained connection, mapping, job, disabled defaults', flush=True)
        else:
            for test in ('test-crm-phase8.sql', 'test-crm-phase9.sql', 'test-crm-no-learner-website.sql',
                         'test-crm-mapping-learner-policy.sql', 'test-crm-meta-reconciliation.sql'):
                sql(db, Path('scripts', test).read_text())
            assert sql(db, 'select (select count(*) from crm_form_mappings)+(select count(*) from crm_submissions)+(select count(*) from auth.users)') == '0'
            sql(db, """
insert into auth.users(id,email,aud,role) values('94000000-0000-0000-0000-000000000001','parallel@example.invalid','authenticated','authenticated');
update profiles set role='director' where id='94000000-0000-0000-0000-000000000001';
insert into crm_integration_connections(id,connection_key,page_id,api_version,access_token_secret_ref,settings,created_by,updated_by)
values('94000000-0000-0000-0000-000000000002','parallel-meta-94','94001','v26.0','CRM_META_PAGE_TOKEN_TEST',
 jsonb_build_object('meta_reconciliation',jsonb_build_object('enabled',true,'started_at',now()-interval '1 minute','lookback_minutes',60)),
 '94000000-0000-0000-0000-000000000001','94000000-0000-0000-0000-000000000001');
insert into crm_form_mappings(connection_id,form_key,version,field_map,effective_from,created_by)
values('94000000-0000-0000-0000-000000000002','94002',1,'{}','2020-01-01','94000000-0000-0000-0000-000000000001');
set request.jwt.claim.role='service_role';
""")
            lease = sql(db, "set request.jwt.claim.role='service_role';select crm_claim_meta_reconciliation()")
            import json
            lease = json.loads(lease)['lease_token']
            event = json.dumps([dict(page_id='94001', form_id='94002', leadgen_id='94003', created_time=int(time.time()))])
            webhook = f"set request.jwt.claim.role='service_role';select crm_accept_meta_events('{event}');"
            poll = f"set request.jwt.claim.role='service_role';select crm_enqueue_meta_reconciled('94000000-0000-0000-0000-000000000002','94002','{lease}','{event}');"
            with ThreadPoolExecutor(max_workers=2) as pool:
                list(pool.map(lambda statement: sql(db, statement), (webhook, poll)))
            assert sql(db, "select count(*) from crm_ingestion_jobs where external_key='94001:94003'") == '1'
            assert sql(db, "select status='pending' and reconciliation_started_at is not null from crm_ingestion_jobs where external_key='94001:94003'") == 't'
            assert sql(db, 'select count(*) from crm_submissions') == '0'
            print('PASS concurrent webhook/reconciliation one authorized job and no submission', flush=True)
            print('PASS fresh 001–094 and five rollback-clean SQL suites', flush=True)
    finally:
        run(['dropdb', '-U', 'supabase_admin', db])
        print(f'PASS removed disposable database {db}', flush=True)
