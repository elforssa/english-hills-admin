#!/usr/bin/env python3
"""Local real-session Meta/website race. No network providers; scoped fixture cleanup."""
import concurrent.futures,json,os,subprocess,uuid
from pathlib import Path
assert Path('.git/HEAD').read_text().startswith('ref: refs/heads/codex/')
actor=str(uuid.uuid4());meta=str(uuid.uuid4());site=str(uuid.uuid4());mm=str(uuid.uuid4());wm=str(uuid.uuid4());request=str(uuid.uuid4());page=str(uuid.uuid4().int)[:24]
args=['psql','-X','-qAt','-h','127.0.0.1','-p','54322','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1']
def sql(s,check=True):
 r=subprocess.run(args,input=s,text=True,capture_output=True,env={**os.environ,'PGPASSWORD':'postgres'},timeout=60)
 if check and r.returncode:raise AssertionError(r.stderr)
 return r

def q(s):return "'"+str(s).replace("'","''")+"'"
def worker(s,check=True):return sql("begin;set local request.jwt.claim.role='service_role';set local request.jwt.claim.sub='';"+s+';commit;',check)
def parallel(fn):
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:return list(pool.map(fn,range(2)))
assert sql("select count(*) from vault.secrets where name in ('crm_meta_worker_url','crm_meta_worker_token')").stdout.strip()=='0'
created=False
try:
 sql(f"""begin;insert into auth.users(id,email,aud,role) values('{actor}','phase9-{actor}@example.invalid','authenticated','authenticated');update profiles set role='director' where id='{actor}';
 insert into crm_integration_connections(id,connection_key,page_id,api_version,enabled,created_by,updated_by) values('{meta}','meta-{actor}','{page}','v99.0',true,'{actor}','{actor}');
 insert into crm_integration_connections(id,provider,connection_key,settings,enabled,created_by,updated_by) values('{site}','website','site-{actor}','{{"origin":"https://school.example"}}',true,'{actor}','{actor}');
 insert into crm_form_mappings(id,connection_id,channel,form_key,version,field_map,effective_from,created_by) values('{mm}','{meta}','meta_instant_form','3',1,'{{}}','2020-01-01','{actor}'),('{wm}','{site}','website','annual',1,'{{}}','2020-01-01','{actor}');
 set local request.jwt.claim.sub='{actor}';select crm_create_followup_policy(gen_random_uuid(),'{{"weekly_hours":{{"1":[["10:00","20:00"]],"2":[["10:00","20:00"]],"3":[["10:00","20:00"]],"4":[["10:00","20:00"]],"5":[["10:00","20:00"]],"6":[["10:00","20:00"]],"7":[]}}}}');commit;""");created=True
 payload=dict(form_key='annual',contact=dict(name='Sara cross-channel',phone='0612345678'),answers=dict(child='Adam'),attribution={},consent=True)
 parallel(lambda _:worker(f"select crm_accept_website_inquiry('site-{actor}','annual','{request}',{q(json.dumps(payload))})"))
 worker(f"select crm_accept_meta_events({q(json.dumps([dict(page_id=page,leadgen_id='2',form_id='3',created_time=1700000000)]))})")
 claims=[json.loads(r.stdout.strip()) for r in parallel(lambda _:worker('select crm_claim_ingestion_jobs(1)'))]
 assert list(map(len,claims))==[1,1];jobs=[x[0] for x in claims];assert len(set(j['id'] for j in jobs))==2
 core=dict(contact_name='Sara cross-channel',phone='0612345678',learner_name='Adam',program_interest_text='Annual',session_type='Yearly')
 def finish(i):
  j=jobs[i];data=dict(core_fields=core,form_answers=[],source_label='Site web')
  if j['connection']['provider']=='website':fn='crm_finalize_website_job';mapping=wm
  else:
   fn='crm_finalize_meta_job';mapping=mm;data.update(occurred_at='2026-09-01T10:00:00Z',source_label='Meta',attribution=dict(external_submission_id='2',page_id=page,form_id='3',attribution_status='partial'))
  return worker(f"select {fn}('{j['id']}','{j['lease_token']}','{mapping}',{q(json.dumps(data))})")
 results=parallel(finish);lead_ids=[json.loads(r.stdout.strip())['lead_id'] for r in results];assert lead_ids[0]==lead_ids[1]
 lead=lead_ids[0]
 result=json.loads(sql(f"select json_build_object('submissions',(select count(*) from crm_submissions where lead_id='{lead}'),'tasks',(select count(*) from crm_tasks where lead_id='{lead}' and task_type='first_contact'),'first',first_submission_id,'latest_channel',(select channel from crm_submissions where id=l.latest_submission_id)) from crm_leads l where id='{lead}'").stdout.strip())
 assert result['submissions']==2 and result['tasks']==1 and result['latest_channel']=='website',result
 assert worker('select crm_claim_ingestion_jobs()').stdout.strip()=='[]'
 parallel(lambda _:worker(f"select crm_accept_website_inquiry('site-{actor}','annual','{request}',{q(json.dumps(payload))})"))
 assert sql(f"select first_submission_id from crm_leads where id='{lead}'").stdout.strip()==result['first']
 print('PASS concurrent website retries, parallel Meta/website finalization: one lead, two submissions, one task, chronological latest and frozen first',flush=True)
finally:
 if created:
  sql(f"""begin;lock table crm_ingestion_jobs,crm_submissions,crm_submission_attribution,crm_leads,crm_tasks,crm_activities,crm_followup_policies,crm_form_mappings in access exclusive mode;
 create temp table cleanup_leads as select id,contact_id from crm_leads where first_submission_id in(select id from crm_submissions where form_mapping_id in('{mm}','{wm}'));
 delete from crm_ingestion_jobs where connection_id in('{meta}','{site}');
 alter table crm_submission_attribution disable trigger crm_attribution_immutable;delete from crm_submission_attribution where submission_id in(select id from crm_submissions where form_mapping_id in('{mm}','{wm}'));alter table crm_submission_attribution enable trigger crm_attribution_immutable;
 alter table crm_activities disable trigger crm_activities_immutable;alter table crm_submissions disable trigger crm_submission_immutable;
 with t as(delete from crm_tasks where lead_id in(select id from cleanup_leads)),a as(delete from crm_activities where lead_id in(select id from cleanup_leads)),s as(delete from crm_submissions where form_mapping_id in('{mm}','{wm}')) delete from crm_leads where id in(select id from cleanup_leads);
 alter table crm_activities enable trigger crm_activities_immutable;alter table crm_submissions enable trigger crm_submission_immutable;delete from crm_contacts where id in(select contact_id from cleanup_leads);
 alter table crm_followup_policies disable trigger crm_policy_immutable;delete from crm_followup_policies where created_by='{actor}';alter table crm_followup_policies enable trigger crm_policy_immutable;
 alter table crm_command_requests disable trigger crm_requests_immutable;delete from crm_command_requests where actor_scope='{actor}';alter table crm_command_requests enable trigger crm_requests_immutable;
 alter table crm_form_mappings disable trigger crm_mapping_immutable;delete from crm_form_mappings where connection_id in('{meta}','{site}');alter table crm_form_mappings enable trigger crm_mapping_immutable;
 delete from crm_integration_connections where id in('{meta}','{site}');delete from auth.users where id='{actor}';commit;""")
  print('PASS synthetic cross-channel fixtures removed; guards restored',flush=True)
