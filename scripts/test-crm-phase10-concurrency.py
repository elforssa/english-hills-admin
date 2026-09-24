#!/usr/bin/env python3
"""Local committed synthetic milestones, competing workers, fencing and cleanup. No HTTP."""
import concurrent.futures,json,os,subprocess
from pathlib import Path
assert Path('.git/HEAD').read_text().startswith('ref: refs/heads/codex/')
args=['psql','-X','-qAt','-h','127.0.0.1','-p','54322','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1']
def sql(s,check=True):
 r=subprocess.run(args,input=s,text=True,capture_output=True,env={**os.environ,'PGPASSWORD':'postgres'},timeout=60)
 if check and r.returncode:raise AssertionError(r.stderr)
 return r

def worker(s,check=True):return sql("begin;set local request.jwt.claim.role='service_role';set local request.jwt.claim.sub='';"+s+';commit;',check)
def director(s,check=True):return sql("begin;set local request.jwt.claim.role='authenticated';set local request.jwt.claim.sub='8a000000-0000-0000-0000-000000000001';"+s+';commit;',check)
def parallel(fn):
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:return list(pool.map(fn,range(2)))
def quote(s):return "'"+s.replace("'","''")+"'"
assert sql("select count(*) from auth.users where id::text like '8a000000-%'").stdout.strip()=='0'
created=False
try:
 prefix=Path('scripts/test-crm-phase10.sql').read_text().split("select pg_temp.ok((select count(*)=0 from crm_external_deliveries)")[0]
 sql(prefix+'\nset constraints all immediate;commit;');created=True
 parallel(lambda _:worker('select crm_reconcile_external_deliveries()'))
 assert sql('select count(*) from crm_external_deliveries').stdout.strip()=='1'
 claims=[json.loads(r.stdout.strip()) for r in parallel(lambda _:worker('select crm_claim_external_deliveries(1)'))]
 assert sorted(map(len,claims))==[0,1];claim=next(c[0] for c in claims if c);did=claim['id'];lease=claim['lease_token']
 delivery=json.loads(worker(f"select crm_get_external_delivery('{did}','{lease}')").stdout.strip())
 payload=dict(data=[dict(event_name=delivery['mapping']['events']['qualified'],event_id=delivery['event_id'],event_time=delivery['event_time'],action_source=delivery['mapping']['action_source'],user_data=dict(lead_id=delivery['matching']['lead_id']))])
 worker(f"select crm_prepare_external_delivery('{did}','{lease}',{quote(json.dumps(payload))})")
 starts=parallel(lambda _:worker(f"select crm_begin_external_attempt('{did}','{lease}')",False));assert sorted(r.returncode==0 for r in starts)==[False,True]
 frozen=sql(f"select payload_hash||provider_event_id||event_time::text from crm_external_deliveries where id='{did}'").stdout.strip()
 sql(f"update crm_external_deliveries set lease_until=now()-interval '1 second' where id='{did}'")
 reclaimed=json.loads(worker('select crm_claim_external_deliveries(1)').stdout.strip())[0];newlease=reclaimed['lease_token'];assert newlease!=lease
 assert worker(f"select crm_finish_external_attempt('{did}','{lease}','{{\"outcome\":\"sent\",\"http_status\":200}}')",False).returncode!=0
 assert sql(f"select outcome from crm_external_delivery_attempts where delivery_id='{did}' and attempt_number=1").stdout.strip()=='unknown'
 worker(f"select crm_begin_external_attempt('{did}','{newlease}');select crm_finish_external_attempt('{did}','{newlease}','{{\"outcome\":\"retry\",\"error_code\":\"rate_limit\",\"http_status\":429,\"retry_after\":120}}')")
 assert sql(f"select next_attempt_at>=now()+interval '110 seconds' from crm_external_deliveries where id='{did}'").stdout.strip()=='t'
 director(f"select crm_retry_external_delivery('{did}')")
 last=json.loads(worker('select crm_claim_external_deliveries(1)').stdout.strip())[0]
 worker(f"select crm_begin_external_attempt('{did}','{last['lease_token']}');select crm_finish_external_attempt('{did}','{last['lease_token']}','{{\"outcome\":\"retry\",\"error_code\":\"provider_unavailable\",\"http_status\":500}}')")
 assert sql(f"select status||':'||attempt_count from crm_external_deliveries where id='{did}'").stdout.strip()=='dead:3'
 assert sql(f"select payload_hash||provider_event_id||event_time::text from crm_external_deliveries where id='{did}'").stdout.strip()==frozen
 assert director(f"select crm_retry_external_delivery('{did}')",False).returncode!=0
 assert sql(f"select count(*) from crm_external_delivery_attempts where delivery_id='{did}' and finished_at is not null").stdout.strip()=='3'
 print('PASS concurrent reconciliation/claims/attempt start, expired lease uncertainty, stale finalize denial, stable frozen identity, provider-guided backoff and max attempts',flush=True)
finally:
 if created:
  sql("""begin;
  create temp table cleanup_leads as select id,contact_id from crm_leads where contact_id in(select id from crm_contacts where created_by::text like '8a000000-%');
  lock table crm_external_deliveries,crm_external_delivery_attempts,crm_activities,crm_submissions,crm_submission_attribution,crm_followup_policies,crm_form_mappings,crm_command_requests in access exclusive mode;
  alter table crm_external_delivery_attempts disable trigger crm_delivery_attempt_immutable;delete from crm_external_delivery_attempts where delivery_id in(select id from crm_external_deliveries where lead_id in(select id from cleanup_leads));alter table crm_external_delivery_attempts enable trigger crm_delivery_attempt_immutable;
  alter table crm_external_deliveries disable trigger crm_delivery_immutable;delete from crm_external_deliveries where lead_id in(select id from cleanup_leads);alter table crm_external_deliveries enable trigger crm_delivery_immutable;
  alter table crm_submission_attribution disable trigger crm_attribution_immutable;delete from crm_submission_attribution where submission_id in(select id from crm_submissions where lead_id in(select id from cleanup_leads));alter table crm_submission_attribution enable trigger crm_attribution_immutable;
  alter table crm_activities disable trigger crm_activities_immutable;alter table crm_submissions disable trigger crm_submission_immutable;
  with t as(delete from crm_tasks where lead_id in(select id from cleanup_leads)),a as(delete from crm_activities where lead_id in(select id from cleanup_leads)),s as(delete from crm_submissions where lead_id in(select id from cleanup_leads)) delete from crm_leads where id in(select id from cleanup_leads);
  alter table crm_activities enable trigger crm_activities_immutable;alter table crm_submissions enable trigger crm_submission_immutable;delete from crm_contacts where id in(select contact_id from cleanup_leads);
  alter table crm_followup_policies disable trigger crm_policy_immutable;delete from crm_followup_policies where created_by::text like '8a000000-%';alter table crm_followup_policies enable trigger crm_policy_immutable;
  alter table crm_command_requests disable trigger crm_requests_immutable;delete from crm_command_requests where actor_scope like '8a000000-%';alter table crm_command_requests enable trigger crm_requests_immutable;
  alter table crm_form_mappings disable trigger crm_mapping_immutable;delete from crm_form_mappings where created_by::text like '8a000000-%';alter table crm_form_mappings enable trigger crm_mapping_immutable;
  update crm_integration_connections set lifecycle_destination_id=null where created_by::text like '8a000000-%';delete from crm_integration_connections where created_by::text like '8a000000-%';
  delete from auth.users where id::text like '8a000000-%';delete from activity_log where actor_id::text like '8a000000-%' or target_id::text like '8a000000-%';commit;""")
  print('PASS scoped fixtures removed; all guards restored',flush=True)
