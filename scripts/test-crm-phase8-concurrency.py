#!/usr/bin/env python3
"""Local-only committed fixtures, concurrent real sessions, transactional cleanup."""
import concurrent.futures
import json
import os
from pathlib import Path
import subprocess
import uuid
assert (Path('.git/HEAD').read_text().strip().startswith('ref: refs/heads/codex/'))
actor=str(uuid.uuid4()); connection=str(uuid.uuid4()); mapping=str(uuid.uuid4()); page=str(uuid.uuid4().int)[:24]
args=['psql','-X','-qAt','-h','127.0.0.1','-p','54322','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1']
def sql(s,check=True):
 r=subprocess.run(args,input=s,text=True,capture_output=True,env={**os.environ,'PGPASSWORD':'postgres'},timeout=60)
 if check and r.returncode: raise AssertionError(r.stderr)
 return r

def q(s):return "'"+str(s).replace("'","''")+"'"
def worker(s,check=True):return sql("begin;set local request.jwt.claim.role='service_role';set local request.jwt.claim.sub='';"+s+';commit;',check)
def parallel(fn):
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:return list(pool.map(fn,range(2)))
assert sql("select count(*) from vault.secrets where name in ('crm_meta_worker_url','crm_meta_worker_token')").stdout.strip()=='0'
created=False
try:
 sql(f"""begin;insert into auth.users(id,email,aud,role) values('{actor}','phase8-{actor}@example.invalid','authenticated','authenticated');
 update profiles set role='director' where id='{actor}';
 insert into crm_integration_connections(id,connection_key,page_id,api_version,enabled,created_by,updated_by) values('{connection}','test-{actor}','{page}','v99.0',true,'{actor}','{actor}');
 insert into crm_form_mappings(id,connection_id,form_key,version,field_map,effective_from,created_by) values('{mapping}','{connection}','3',1,'{{}}','2020-01-01','{actor}');
 set local request.jwt.claim.sub='{actor}';select public.crm_create_followup_policy(gen_random_uuid(),'{{"weekly_hours":{{"1":[["10:00","20:00"]],"2":[["10:00","20:00"]],"3":[["10:00","20:00"]],"4":[["10:00","20:00"]],"5":[["10:00","20:00"]],"6":[["10:00","20:00"]],"7":[]}}}}');commit;""");created=True
 event=json.dumps([dict(page_id=page,leadgen_id='2',form_id='3',created_time=1700000000)])
 parallel(lambda _:worker(f'select public.crm_accept_meta_events({q(event)})'))
 assert sql(f"select count(*) from crm_ingestion_jobs where connection_id='{connection}'").stdout.strip()=='1'
 claims=[json.loads(r.stdout.strip()) for r in parallel(lambda _:worker('select public.crm_claim_meta_jobs(1)'))]
 assert sorted(map(len,claims))==[0,1],claims
 claimed=next(x[0] for x in claims if x);job=claimed['id'];lease=claimed['lease_token']
 sql(f"update crm_ingestion_jobs set lease_until=now()-interval '1 second' where id='{job}'")
 newer=json.loads(worker('select public.crm_claim_meta_jobs(1)').stdout.strip())[0]
 assert newer['lease_token']!=lease
 assert worker(f"select public.crm_fail_meta_job('{job}','{lease}','network')",False).returncode!=0
 data=dict(occurred_at='2026-09-01T10:00:00Z',core_fields=dict(contact_name='Synthetic concurrent parent',phone='0612345678',learner_name='Synthetic child',program_interest_text='Annual'),form_answers=[],source_label='Meta',attribution=dict(external_submission_id='2',page_id=page,form_id='3',attribution_status='partial'))
 cmd=f"select public.crm_finalize_meta_job('{job}','{newer['lease_token']}','{mapping}',{q(json.dumps(data))})"
 results=parallel(lambda _:worker(cmd,False))
 assert sorted(r.returncode for r in results)==[0,3],[r.stderr for r in results]
 assert sql(f"select count(*) from crm_submissions where form_mapping_id='{mapping}'").stdout.strip()=='1'
 assert sql(f"select count(*) from crm_tasks where lead_id in(select lead_id from crm_submissions where form_mapping_id='{mapping}') and task_type='first_contact'").stdout.strip()=='1'
 print('PASS duplicate callbacks, concurrent claims, crash recovery, stale worker fencing, concurrent finalization exactly once',flush=True)
finally:
 if created:
  sql(f"""begin;
 lock table crm_ingestion_jobs,crm_submissions,crm_submission_attribution,crm_leads,crm_tasks,crm_activities,crm_followup_policies,crm_form_mappings in access exclusive mode;
 create temp table cleanup_leads as select l.id,l.contact_id from crm_leads l where first_submission_id in(select id from crm_submissions where form_mapping_id='{mapping}');
 delete from crm_ingestion_jobs where connection_id='{connection}';
 alter table crm_submission_attribution disable trigger crm_attribution_immutable;
 delete from crm_submission_attribution where submission_id in(select id from crm_submissions where form_mapping_id='{mapping}');
 alter table crm_submission_attribution enable trigger crm_attribution_immutable;
 alter table crm_activities disable trigger crm_activities_immutable;alter table crm_submissions disable trigger crm_submission_immutable;
 with t as(delete from crm_tasks where lead_id in(select id from cleanup_leads)),a as(delete from crm_activities where lead_id in(select id from cleanup_leads)),s as(delete from crm_submissions where form_mapping_id='{mapping}') delete from crm_leads where id in(select id from cleanup_leads);
 alter table crm_activities enable trigger crm_activities_immutable;alter table crm_submissions enable trigger crm_submission_immutable;
 delete from crm_contacts where id in(select contact_id from cleanup_leads);
 alter table crm_followup_policies disable trigger crm_policy_immutable;delete from crm_followup_policies where created_by='{actor}';alter table crm_followup_policies enable trigger crm_policy_immutable;
 delete from crm_command_requests where false;
 alter table crm_command_requests disable trigger crm_requests_immutable;delete from crm_command_requests where actor_scope='{actor}';alter table crm_command_requests enable trigger crm_requests_immutable;
 alter table crm_form_mappings disable trigger crm_mapping_immutable;delete from crm_form_mappings where connection_id='{connection}';alter table crm_form_mappings enable trigger crm_mapping_immutable;
 delete from crm_integration_connections where id='{connection}';delete from auth.users where id='{actor}';commit;""")
  print('PASS fixtures removed and guards restored',flush=True)
