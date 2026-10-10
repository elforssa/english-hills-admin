#!/usr/bin/env python3
"""Local synthetic accounts: overlapping requests, competing claims, lease fencing and
rolling-refresh enqueue races (DGI-A D3)."""
import concurrent.futures,json,os,subprocess,time,uuid
# Same guard as the Phase 12 matrix: a local codex/ or claude/ branch, or a GitHub Actions pull request.
branch=subprocess.run(['git','branch','--show-current'],text=True,capture_output=True,check=True).stdout.strip()
assert branch.startswith(('codex/','claude/')) or (os.environ.get('GITHUB_ACTIONS')=='true' and os.environ.get('GITHUB_EVENT_NAME')=='pull_request'), 'Refusing to run outside a feature branch'
uid=str(uuid.uuid4());conn=str(uuid.uuid4());live=str(uuid.uuid4())
def sql(s,check=True):
 r=subprocess.run(['psql','-X','-qAt','-h','127.0.0.1','-p','54322','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],input=s,text=True,capture_output=True,env={**os.environ,'PGPASSWORD':'postgres'},timeout=45)
 if check and r.returncode:raise AssertionError(r.stderr)
 return r

def director(s,check=True):return sql(f"begin;set local request.jwt.claim.sub='{uid}';set local request.jwt.claim.role='authenticated';"+s+';commit;',check)
def worker(s,check=True):return sql("begin;set local request.jwt.claim.sub='';set local request.jwt.claim.role='service_role';"+s+';commit;',check)
def parallel(fn):
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as p:return list(p.map(fn,range(2)))
assert sql("select count(*) from crm_meta_sync_runs where status in ('pending','running')").stdout.strip()=='0', 'Refusing an existing local synchronization queue'
assert sql("select count(*) from crm_integration_connections where insights_settings->>'mode'='live'").stdout.strip()=='0', 'Refusing an existing live Insights connection'
try:
 sql(f"insert into auth.users(id,email,aud,role) values('{uid}','phase11-{uid}@example.invalid','authenticated','authenticated');update profiles set role='director' where id='{uid}';insert into crm_integration_connections(id,provider,connection_key,page_id,api_version,created_by,updated_by) values('{conn}','meta','phase11-{conn}','110099','v99.0','{uid}','{uid}');")
 director(f"select crm_configure_insights('{conn}',1,'{{\"mode\":\"mock\",\"enabled\":true,\"account_id\":\"110099\",\"currency\":\"MAD\",\"timezone\":\"Africa/Casablanca\",\"api_version\":\"v99.0\",\"secret_ref\":\"CRM_META_INSIGHTS_TOKEN_FIXTURE\"}}')")
 requests=parallel(lambda _:director(f"select crm_request_insights_sync('{conn}',gen_random_uuid(),'2026-01-01','2026-01-02')",False));assert sorted(r.returncode==0 for r in requests)==[False,True]
 claims=[r.stdout.strip() for r in parallel(lambda _:worker('select crm_claim_insights_sync()'))];assert sum(bool(c) for c in claims)==1
 claim=json.loads(next(c for c in claims if c));rid=claim['id'];lease=claim['lease_token']
 sql(f"update crm_meta_sync_runs set lease_until=now()-interval '1 second' where id='{rid}'")
 new=json.loads(worker('select crm_claim_insights_sync()').stdout.strip());assert new['lease_token']!=lease
 assert worker(f"select crm_fail_insights_sync('{rid}','{lease}','network')",False).returncode!=0
 worker(f"select crm_fail_insights_sync('{rid}','{new['lease_token']}','network',1)")
 director(f"select crm_retry_insights_sync('{rid}')")
 last=json.loads(worker('select crm_claim_insights_sync()').stdout.strip())
 worker(f"select crm_fail_insights_sync('{rid}','{last['lease_token']}','network')")
 assert director(f"select crm_retry_insights_sync('{rid}')",False).returncode!=0
 assert sql(f"select attempt_count from crm_meta_sync_runs where id='{rid}'").stdout.strip()=='3'
 # D3: competing enqueue ticks and an enqueue tick racing a director rolling request.
 sql(f"insert into crm_integration_connections(id,provider,connection_key,page_id,api_version,created_by,updated_by) values('{live}','meta','phase11-{live}','110098','v99.0','{uid}','{uid}');")
 director(f"select crm_configure_insights('{live}',1,'{{\"mode\":\"live\",\"enabled\":true,\"account_id\":\"110098\",\"currency\":\"USD\",\"timezone\":\"Africa/Casablanca\",\"api_version\":\"v25.0\",\"secret_ref\":\"CRM_META_INSIGHTS_TOKEN_FIXTURE\"}}')")
 runs=lambda:int(sql(f"select count(*) from crm_meta_sync_runs where connection_id='{live}'").stdout)
 reset=lambda:sql(f"delete from crm_meta_sync_runs where connection_id='{live}'")
 ticks=parallel(lambda _:worker('select crm_enqueue_insights_refresh()'))
 assert sorted(int(r.stdout.strip()) for r in ticks)==[0,1] and runs()==1, 'competing ticks enqueue once'
 def staggered(first,second):
  # The first transaction holds the connection row lock for 0.6 s; the second starts inside that window.
  def go(i):
   if i:time.sleep(0.2);return second()
   return first()
  return parallel(go)
 tick=lambda hold=False:worker('select crm_enqueue_insights_refresh()'+(';select pg_sleep(0.6)' if hold else ''),False)
 request=lambda hold=False:director(f"select crm_request_insights_sync('{live}',gen_random_uuid())"+(';select pg_sleep(0.6)' if hold else ''),False)
 for first,second in [(lambda:tick(True),request),(lambda:request(True),tick)]:
  reset();results=staggered(first,second)
  assert runs()==1, 'an enqueue tick and a director request create one run for the window'
  assert sql(f"select count(*) from crm_meta_sync_runs where connection_id='{live}' and status='pending' and date_to-date_from=27").stdout.strip()=='1'
 for _ in range(5):
  reset();results=parallel(lambda i:tick() if i else request())
  assert runs()==1, 'unstaggered race still creates one run'
 reset()
 print('PASS Phase11 overlapping queue serialization, exclusive claims, stale lease rejection, bounded retries and serialized rolling-refresh enqueue')
finally:
 sql(f"begin;delete from crm_meta_daily_insights where connection_id='{conn}';delete from crm_meta_objects where connection_id='{conn}';delete from crm_meta_sync_runs where connection_id in ('{conn}','{live}');delete from crm_integration_connections where id in ('{conn}','{live}');delete from activity_log where actor_id='{uid}' or target_id='{uid}';"
  # The synthetic director may be the only one: remove it the way the Phase 12 matrix does.
  f"alter table profiles disable trigger role_security_guard;delete from profiles where id='{uid}';update role_security.director_guard set director_count=(select count(*) from profiles where role='director');alter table profiles enable trigger role_security_guard;"
  f"delete from auth.users where id='{uid}';commit;")
