#!/usr/bin/env python3
"""Replay 001–093 in disposable local databases using a schema-only Supabase platform dump.
Usage: python3 scripts/test-crm-mapping-policy-replay.py /path/to/platform-schema.sql
The dump must be from an application-empty Supabase database; never use production data.
"""
from pathlib import Path
import subprocess
import sys

container = 'supabase_db_hills-admin-next'
platform = Path(sys.argv[1]).read_text()
assert 'CREATE TABLE auth.users' in platform and 'CREATE TABLE storage.objects' in platform
assert 'CREATE TABLE public.' not in platform and '\nCOPY ' not in platform
files = sorted(Path('supabase/migrations').glob('*.sql'))
assert [f.name[:3] for f in files] == [f'{i:03}' for i in range(1, 94)]

def run(args, data=None):
    result = subprocess.run(['docker', 'exec', '-i', '-e', 'PGPASSWORD=postgres', container, *args], input=data or '',
                            text=True, capture_output=True, timeout=180)
    if result.returncode:
        raise AssertionError(result.stderr)
    return result.stdout.strip()

def sql(db, data, user='postgres'):
    assert db in ('policy93_fresh', 'policy93_upgrade')
    return run(['psql', '-X', '-qAt', '-vON_ERROR_STOP=1', '-U', user, '-d', db], data)

for db in ('policy93_fresh', 'policy93_upgrade'):
    run(['createdb', '-U', 'supabase_admin', '-O', 'postgres', '-T', 'template0', db])
    try:
        sql(db, platform, 'supabase_admin')
        assert sql(db, "select count(*) from pg_tables where schemaname='public'") == '0'
        assert sql(db, 'select count(*) from auth.users') == '0'
        for migration in files:
            if db == 'policy93_upgrade' and migration.name.startswith('093'):
                sql(db, """
insert into auth.users(id,email,aud,role) values('93000000-0000-0000-0000-000000000001','upgrade@example.invalid','authenticated','authenticated');
update profiles set role='director' where id='93000000-0000-0000-0000-000000000001';
set request.jwt.claim.sub='93000000-0000-0000-0000-000000000001';
insert into crm_integration_connections(id,provider,connection_key,settings,created_by,updated_by)
values('93000000-0000-0000-0000-000000000002','website','upgrade-site','{"origin":"https://school.example"}','93000000-0000-0000-0000-000000000001','93000000-0000-0000-0000-000000000001');
select crm_publish_website_form_mapping('93000000-0000-0000-0000-000000000002',jsonb_build_object('form_key',k,'field_map','{}'::jsonb,'effective_from','2020-01-01Z'))
from unnest(array['general_contact_v1','campaign_adult_lead_v1','campaign_parent_lead_v1','custom']) k;
insert into crm_integration_connections(id,connection_key,page_id,api_version,created_by,updated_by)
values('93000000-0000-0000-0000-000000000003','upgrade-meta','93001','v99.0','93000000-0000-0000-0000-000000000001','93000000-0000-0000-0000-000000000001');
select crm_publish_meta_form_mapping('93000000-0000-0000-0000-000000000003','{"form_key":"93002","field_map":{},"effective_from":"2020-01-01Z"}');
select crm_retire_meta_form_mapping(id) from crm_form_mappings where form_key='campaign_adult_lead_v1';
insert into crm_submissions(channel,received_at,occurred_at,time_source,core_fields,form_answers,source_label,match_status,payload_hash,form_mapping_id)
select channel,now(),now(),'server','{"contact_name":"Synthetic retained inquiry","email":"upgrade@example.invalid","program_interest_text":"Annual"}','[]','Upgrade','needs_review',repeat('a',64),id from crm_form_mappings;
""")
                sql(db, """
set request.jwt.claim.sub='93000000-0000-0000-0000-000000000001';
select crm_create_followup_policy(gen_random_uuid(),'{"weekly_hours":{"1":[["10:00","20:00"]],"2":[["10:00","20:00"]],"3":[["10:00","20:00"]],"4":[["10:00","20:00"]],"5":[["10:00","20:00"]],"6":[["10:00","20:00"]],"7":[]}}');
select crm_security.resolve_external_submission(s.id) from crm_submissions s join crm_form_mappings m on m.id=s.form_mapping_id where m.form_key='general_contact_v1';
""")
                snapshot = "select jsonb_build_object('mappings',(select jsonb_agg(to_jsonb(m)-'learner_policy' order by id) from crm_form_mappings m),'submissions',(select jsonb_agg(to_jsonb(s) order by id) from crm_submissions s),'leads',(select jsonb_agg(to_jsonb(l) order by id) from crm_leads l),'tasks',(select jsonb_agg(to_jsonb(t) order by id) from crm_tasks t))"
                before = sql(db, snapshot)
                old_policy = sql(db, "select jsonb_agg(jsonb_build_array(id,crm_security.website_learner_optional(id)) order by id) from crm_submissions")
            sql(db, migration.read_text())
        if db == 'policy93_upgrade':
            assert sql(db, snapshot) == before, 'Historical data changed'
            assert sql(db, "select jsonb_agg(jsonb_build_array(id,crm_security.mapping_learner_optional(id)) order by id) from crm_submissions") == old_policy
            assert sql(db, "select count(*) from crm_form_mappings where learner_policy='optional'") == '2'
            assert sql(db, "select count(*) from crm_form_mappings where learner_policy='required'") == '3'
            assert sql(db, "select tgenabled from pg_trigger where tgname='crm_mapping_immutable'") == 'O'
            print('PASS upgrade 092→093: active/retired mapping backfill, pinned submission semantics and immutable guard', flush=True)
        else:
            for test in ('test-crm-phase8.sql', 'test-crm-phase9.sql', 'test-crm-no-learner-website.sql', 'test-crm-mapping-learner-policy.sql'):
                sql(db, Path('scripts', test).read_text())
            assert sql(db, 'select (select count(*) from crm_form_mappings)+(select count(*) from crm_submissions)+(select count(*) from auth.users)') == '0'
            print('PASS fresh 001–093 replay and four rollback-clean regression suites', flush=True)
    finally:
        run(['dropdb', '-U', 'supabase_admin', db])
        print(f'PASS removed disposable database {db}', flush=True)
