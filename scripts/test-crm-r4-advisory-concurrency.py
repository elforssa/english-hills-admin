#!/usr/bin/env python3
"""Forced local PostgreSQL races. Synthetic source IDs; no HTTP or provider client."""
import concurrent.futures as futures
import json
import os
import subprocess
import time
import uuid
from pathlib import Path

assert subprocess.check_output(['git','branch','--show-current'],text=True).strip().startswith('codex/') or os.getenv('GITHUB_EVENT_NAME')=='pull_request'
ARGS=['psql','-X','-qAt','-h','127.0.0.1','-p','54322','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1']
ENV={**os.environ,'PGPASSWORD':'postgres'}
SET="set local deadlock_timeout='100ms';set local lock_timeout='5s';set local statement_timeout='10s';"
DIRECTOR='8c000000-0000-0000-0000-000000000001'

def sql(q,check=True):
 r=subprocess.run(ARGS,input="\\set VERBOSITY verbose\n"+q,text=True,capture_output=True,env=ENV,timeout=20)
 if check and r.returncode: raise AssertionError(r.stderr)
 return r

def actor(director=False):
 return "set local request.jwt.claim.role='%s';set local request.jwt.claim.sub='%s';" % ('authenticated' if director else 'service_role',DIRECTOR if director else '')

def tx(q,director=False,check=True):
 return sql('begin;'+SET+actor(director)+q+';commit;',check)

def last(r): return r.stdout.strip().splitlines()[-1]
def value(q): return last(sql(q))
def claim(): return json.loads(last(tx('select public.crm_claim_external_deliveries(1,true)')))

def keys(lead,conn,exclusive=False):
 return "select crm_security.lifecycle_barrier(%s);select crm_security.lifecycle_scope_keys('[{\"lead\":\"%s\",\"connection\":\"%s\"}]');" % ('true' if exclusive else 'false',lead,conn)

def force(winner,loser,winner_director=False,loser_director=False):
 """Winner retains its G/L/O or exclusive G after mutation; loser must wait."""
 name='r4-race-'+uuid.uuid4().hex
 p=subprocess.Popen(ARGS,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,env=ENV)
 p.stdin.write('begin;'+SET+actor(winner_director)+winner+";select 'HELD';select pg_sleep(0.6);commit;\n");p.stdin.close()
 while True:
  line=p.stdout.readline()
  if line.strip()=='HELD': break
  if not line: raise AssertionError(p.stderr.read())
 with futures.ThreadPoolExecutor(max_workers=1) as pool:
  f=pool.submit(sql,"set application_name='%s';begin;"%name+SET+actor(loser_director)+loser+';commit;',False)
  waiting=False
  for _ in range(30):
   if value("select exists(select 1 from pg_stat_activity where application_name='%s' and wait_event='advisory')"%name)=='t': waiting=True;break
   if f.done(): break
   time.sleep(0.01)
  result=f.result(timeout=15)
 assert waiting,'interleaving did not establish advisory wait'
 assert p.wait(timeout=15)==0,p.stderr.read()
 assert '40P01' not in result.stderr and '55P03' not in result.stderr,result.stderr
 return result

counter=0

def fresh(conn,mapping,page,form,proof=False,pending=False):
 global counter
 counter+=1;sid=str(uuid.uuid4());external='887'+str(counter).zfill(8)
 q="select crm_security.lifecycle_barrier(true);select crm_security.lifecycle_preidentity_keys('%s','%s');"%(sid,conn)
 q+="""insert into public.crm_submissions(id,channel,received_at,occurred_at,time_source,core_fields,form_answers,source_label,match_status,payload_hash,form_mapping_id)
 values('%s','meta_instant_form',now(),now()-interval '1 second','provider','{"contact_name":"Synthetic race","phone":"0612345678","learner_name":"Synthetic","learner_age":12,"program_interest_text":"Annual","session_type":"Yearly"}',
 '[{"key":"adult_confirmed","label":"Adult","value":"yes","value_type":"string","label_source":"provider"}]','Synthetic race','needs_review','%s','%s');
 insert into public.crm_submission_attribution(submission_id,provider,external_submission_id,external_scope,page_id,form_id,consent_evidence,attribution_status,provider_created_at)
 values('%s','meta','%s','race:%s','%s','%s','{}','partial',now()-interval '1 second');"""%(sid,uuid.uuid4().hex*2,mapping,sid,external,sid,page,form)
 if not pending:q+="select crm_security.accept_external_submission('%s');"%sid
 tx(q)
 if pending:return sid
 lead=value("select lead_id from public.crm_submissions where id='%s'"%sid)
 if proof:tx("select public.crm_record_lifecycle_evidence_check('%s','8c000000-0000-0000-0000-000000000011',true,'eligible',repeat('a',64))"%sid)
 return lead

def materialize():
 tx('select public.crm_reconcile_external_deliveries(100)');tx('select public.crm_reconcile_external_deliveries(100)')

def prepared(lead):
 materialize();did=value("select id from public.crm_external_deliveries where lead_id='%s' and event_kind='intake'"%lead)
 sql("update public.crm_external_deliveries set next_attempt_at=now()+interval '1 day' where status in ('pending','retry','blocked') and attempt_boundary_state='not_started'")
 sql("update public.crm_external_deliveries set next_attempt_at=now() where id='%s'"%did)
 c=claim();assert len(c)==1 and c[0]['id']==did,c
 lease=c[0]['lease_token']
 tx("""select public.crm_prepare_external_delivery(d.id,'%s',jsonb_build_object('data',jsonb_build_array(jsonb_build_object(
 'event_name',d.mapping_snapshot->'events'->>d.event_kind,'event_id',d.provider_event_id,'event_time',floor(extract(epoch from d.event_time))::bigint,
 'action_source','system_generated','user_data',jsonb_build_object('lead_id',a.external_submission_id),
 'custom_data',jsonb_build_object('event_source','crm','lead_event_source','English Hills CRM')))))
 from public.crm_external_deliveries d join public.crm_submission_attribution a on a.submission_id=d.attribution_submission_id where d.id='%s'"""%(lease,did))
 return did,lease

def begin(d,l):return "select public.crm_begin_external_attempt('%s','%s')"%(d,l)
def stop(lead,conn):return "select public.crm_stop_lifecycle_sharing(gen_random_uuid(),'opportunity','%s','%s','privacy_request')"%(lead,conn)
def contact(lead,conn=None):return "select public.crm_stop_lifecycle_sharing(gen_random_uuid(),'contact',(select contact_id from public.crm_leads where id='%s'),%s,'privacy_request',null,'verified-race-001')"%(lead,"'%s'"%conn if conn else 'null')
def finish(d,l):return "select public.crm_finish_external_attempt('%s','%s','{\"outcome\":\"unknown\",\"error_code\":\"timeout\"}')"%(d,l)
def no_attempt(d):assert value("select count(*) from public.crm_external_delivery_attempts where delivery_id='%s'"%d)=='0'
def unknown(d):assert value("select status||':'||attempt_boundary_state from public.crm_external_deliveries where id='%s'"%d)=='unknown:unknown'

created=False
try:
 setup=Path('scripts/test-crm-r4-advisory-setup.sql').read_text()
 setup+="\nset local session_replication_role=replica;update public.crm_lifecycle_eligibility_policies set adult_field_key='adult_confirmed',adult_accepted_values='[\"yes\"]' where id='8c000000-0000-0000-0000-000000000011';set local session_replication_role=origin;select jsonb_object_agg(k,id) from fx;commit;"
 inventory=json.loads(last(sql(setup)));created=True
 c,m=inventory['connection'],inventory['mapping']
 def new(**kw):return fresh(c,m,'882001','882002',**kw)
 # Both stop/begin winners, committed final authority and honest finish.
 lead=new();d,l=prepared(lead)
 assert force(keys(lead,c)+stop(lead,c),begin(d,l),True).returncode!=0;no_attempt(d)
 assert tx("select public.crm_prepare_external_delivery('%s','%s','{}')"%(d,l),check=False).returncode!=0
 assert tx("select public.crm_retry_external_delivery('%s')"%d,True,False).returncode!=0
 lead=new();d,l=prepared(lead)
 assert force(keys(lead,c)+begin(d,l),stop(lead,c),False,True).returncode==0
 tx(finish(d,l));unknown(d)
 assert tx("select public.crm_retry_external_delivery('%s')"%d,True,False).returncode!=0
 print('PASS forced stop/begin and prepare/retry winner boundaries',flush=True)
 # Revoke obtains G/L/O before grant. Pause after scope lookup for begin winner.
 for revoke_first in (True,False):
  lead=new(proof=True);d,l=prepared(lead);grant=value("select eligibility_evidence_id from public.crm_external_deliveries where id='%s'"%d)
  revoke="select public.crm_revoke_lifecycle_evidence(gen_random_uuid(),'%s','privacy_request')"%grant
  if revoke_first:
   assert force(keys(lead,c)+revoke,begin(d,l),True).returncode!=0;no_attempt(d)
  else:
   assert force(keys(lead,c)+begin(d,l),"select submission_id from public.crm_lifecycle_eligibility_evidence where id='%s';"%grant+revoke,False,True).returncode==0
   tx(finish(d,l));unknown(d)
 # Prepared authority and repair remain revocable across separate sessions.
 for stop_first in (True,False):
  lead=new();d,l=prepared(lead)
  prep="select public.crm_prepare_external_delivery('%s','%s',(select payload from public.crm_external_deliveries where id='%s'))"%(d,l,d)
  if stop_first:assert force(keys(lead,c)+stop(lead,c),prep,True).returncode!=0
  else:assert force(keys(lead,c)+prep,stop(lead,c),False,True).returncode==0
  no_attempt(d);assert tx(begin(d,l),check=False).returncode!=0
  assert last(tx("select crm_security.repair_lifecycle_evidence('%s',gen_random_uuid())"%d))=='f'
 print('PASS forced revoke/begin in both orders',flush=True)
 # Admission versus stop in both orders. Ownership is immutable after its winner.
 lead=new();force(keys(lead,c)+stop(lead,c),'select public.crm_reconcile_external_deliveries(100)',True)
 assert value("select count(*) from public.crm_lifecycle_producer_ownership where lead_id='%s'"%lead)=='0'
 lead=new();assert force('select public.crm_reconcile_external_deliveries(100)',stop(lead,c),False,True).returncode==0
 assert value("select count(*) from public.crm_lifecycle_producer_ownership where lead_id='%s'"%lead)=='1'
 d,l=prepared(new()); # separate viable lead proves queue still progresses
 print('PASS forced admission/stop, immutable admission and unrelated progress',flush=True)
 # Unresolved stop/resolver exclusive G/S in both orders; post-lock refresh.
 for stop_first in (True,False):
  sid=new(pending=True)
  pending="select public.crm_stop_lifecycle_sharing(gen_random_uuid(),'submission_pending','%s','%s','privacy_request')"%(sid,c)
  resolve="select crm_security.lifecycle_barrier(true);select crm_security.lifecycle_preidentity_keys('%s','%s');select crm_security.accept_external_submission('%s')"%(sid,c,sid)
  r=force(pending,resolve,True) if stop_first else force(resolve,pending,False,True)
  assert r.returncode==0,r.stderr
  lead=value("select lead_id from public.crm_submissions where id='%s'"%sid)
  assert value("select crm_security.lifecycle_stop_hold('%s','%s')"%(lead,c))=='sharing_stopped'
  materialize();assert value("select count(*) from public.crm_lifecycle_producer_ownership where lead_id='%s'"%lead)=='0'
 print('PASS forced preidentity stop/resolver atomic handoff in both orders',flush=True)
 # Mandatory later safety handoff versus an already-prepared begin. No optional
 # collector runs; commit ordering is exclusive G/S versus shared G/L/O.
 sql("begin;select crm_security.lifecycle_barrier(true);set local session_replication_role=replica;update public.crm_lifecycle_eligibility_policies set sharing_field_key='meta_share',sharing_accepted_values='[true]',sharing_refused_values='[false]',prohibited_field_key='source_safety',prohibited_values='[7]',safety_decision_reference='race-later-reviewed' where id='8c000000-0000-0000-0000-000000000011';commit;")
 for answer,reason in (({'key':'meta_share','label':'Share','value':False,'value_type':'boolean','label_source':'provider'},'inquiry_refusal'),({'key':'source_safety','label':'Safety','value':7,'value_type':'number','label_source':'provider'},'source_restriction')):
  for resolution_first in (True,False):
   lead=new();d,l=prepared(lead);source=new(pending=True)
   original=value("select first_submission_id from public.crm_leads where id='%s'"%lead)
   tx("select crm_security.lifecycle_barrier(true);set local session_replication_role=replica;update public.crm_submissions set form_answers='%s' where id='%s'"%(json.dumps([answer]),source))
   resolution="select crm_security.lifecycle_barrier(true);select crm_security.lifecycle_preidentity_keys('%s','%s');select crm_security.accept_external_submission('%s',null,'%s')"%(source,c,source,lead)
   if resolution_first:
    assert force(resolution,begin(d,l)).returncode!=0;no_attempt(d)
   else:
    assert force(keys(lead,c)+begin(d,l),resolution).returncode==0
    tx(finish(d,l));unknown(d)
   assert value("select count(*) from public.crm_lifecycle_sharing_stops where lead_id='%s' and connection_id='%s' and reason_class='%s'"%(lead,c,reason))=='1'
   assert value("select count(*) from public.crm_lifecycle_eligibility_checks where submission_id='%s'"%source)=='0'
   assert value("select first_submission_id from public.crm_leads where id='%s'"%lead)==original
   assert tx(begin(d,l),check=False).returncode!=0
 sql("begin;select crm_security.lifecycle_barrier(true);set local session_replication_role=replica;update public.crm_lifecycle_eligibility_policies set sharing_field_key=null,sharing_accepted_values=null,sharing_refused_values=null,prohibited_field_key=null,prohibited_values=null,safety_decision_reference=null where id='8c000000-0000-0000-0000-000000000011';commit;")
 print('PASS atomic later refusal/restriction handoff versus prepared begin in both orders without optional collection',flush=True)
 # Two actual native destinations linked by a reviewed identity association.
 second=Path('scripts/test-crm-r4-advisory-setup.sql').read_text().replace('8c000000','8b000000').replace('882001','886001').replace('882002','886002').replace('882003','886003').replace('r4-live','r4-live-second').replace('r4_fixture','r4_fixture_second').replace('@example.invalid','-second@example.invalid')
 inv2=json.loads(last(sql(second+'\nselect jsonb_object_agg(k,id) from fx;commit;')))
 c2,m2=inv2['connection'],inv2['mapping']
 for broad_first in (True,False):
  a=new();b=fresh(c2,m2,'886001','886002');tx("select crm_security.lifecycle_barrier(true);update public.crm_leads set contact_id=(select contact_id from public.crm_leads where id='%s') where id='%s'"%(a,b))
  da,la=prepared(a);db,lb=prepared(b)
  if broad_first:
   assert force(contact(a),begin(da,la),True).returncode!=0;no_attempt(da)
   assert tx(begin(db,lb),check=False).returncode!=0;no_attempt(db)
  else:
   assert force(keys(a,c)+begin(da,la),contact(a),False,True).returncode==0
   tx(finish(da,la));unknown(da);assert tx(begin(db,lb),check=False).returncode!=0;no_attempt(db)
 print('PASS broad contact/multi-opportunity begins across two native destinations',flush=True)
 # Reviewed identity association versus broad request in both winner orders.
 for stop_first in (True,False):
  a=new();b=new()
  merge="select crm_security.lifecycle_barrier(true);update public.crm_contacts set merged_into_contact_id=(select contact_id from public.crm_leads where id='%s') where id=(select contact_id from public.crm_leads where id='%s')"%(b,a)
  r=force(contact(a),merge,True) if stop_first else force(merge,contact(a),False,True)
  assert r.returncode==0,r.stderr
  assert value("select crm_security.lifecycle_stop_hold('%s','%s')"%(b,c))=='sharing_stopped'
 print('PASS forced identity/stop carry and post-lock canonical refresh in both orders',flush=True)
 # Intentional contention: try-L claim skips without waiting for held chronology.
 a=new();d,l=prepared(a);sql("update public.crm_external_deliveries set status='pending',lease_token=null,lease_until=null,next_attempt_at=now() where id='%s'"%d)
 p=subprocess.Popen(ARGS,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,env=ENV)
 p.stdin.write('begin;'+SET+actor()+keys(a,c)+"select 'HELD';select pg_sleep(0.5);commit;");p.stdin.close()
 while p.stdout.readline().strip()!='HELD':pass
 t=time.monotonic();assert claim()==[];assert time.monotonic()-t<0.45;assert p.wait(timeout=10)==0
 # Reverse discovery order batches and maintenance/control/identity participate.
 a=new();b=new();materialize();scopes=json.dumps([{'lead':a,'connection':c},{'lead':b,'connection':c}]);reverse=json.dumps(list(reversed(json.loads(scopes))))
 statements=["select crm_security.lifecycle_barrier(false);select crm_security.lifecycle_scope_keys('%s');select crm_security.lifecycle_scope_rows('%s')"%(scopes,scopes),
 "select crm_security.lifecycle_barrier(false);select crm_security.lifecycle_scope_keys('%s');select crm_security.lifecycle_scope_rows('%s')"%(reverse,reverse),
 'select public.crm_claim_external_deliveries(3,true)','select public.crm_reconcile_external_deliveries(100)',
 'select public.crm_claim_lifecycle_evidence(25,\'advisory\')','select public.crm_cleanup_lifecycle_retention(100)',
 'select public.crm_cleanup_lifecycle_stop_audit(100)',
 "select crm_security.lifecycle_barrier(true);update public.crm_contacts set merged_into_contact_id=(select contact_id from public.crm_leads where id='%s') where id=(select contact_id from public.crm_leads where id='%s')"%(b,a)]
 with futures.ThreadPoolExecutor(max_workers=8) as pool:
  for r in pool.map(tx,statements):assert r.returncode==0
 assert value('select count(*) from pg_locks where locktype=\'advisory\' and classid in (460046,460047,460048,460049)')=='0'
 # Force reversed key sets to overlap, then exercise real entry points in a
 # barrier-started mixed batch. Expected denial is allowed; timeout/deadlock is not.
 r=force("select crm_security.lifecycle_barrier(false);select crm_security.lifecycle_scope_keys('%s');select crm_security.lifecycle_scope_rows('%s')"%(scopes,scopes),
 "select crm_security.lifecycle_barrier(false);select crm_security.lifecycle_scope_keys('%s');select crm_security.lifecycle_scope_rows('%s')"%(reverse,reverse))
 assert r.returncode==0,r.stderr
 a=new();b=new(proof=True);da,la=prepared(a);db,lb=prepared(b)
 grant=value("select eligibility_evidence_id from public.crm_external_deliveries where id='%s'"%db)
 import threading
 operations=[(begin(da,la),False),(begin(db,lb),False),
 ("select public.crm_prepare_external_delivery('%s','%s',(select payload from public.crm_external_deliveries where id='%s'))"%(da,la,da),False),
 ("select public.crm_revoke_lifecycle_evidence(gen_random_uuid(),'%s','privacy_request')"%grant,True),
 (stop(a,c),True),("select public.crm_retry_external_delivery('%s')"%da,True),
 ('select public.crm_claim_external_deliveries(3,true)',False),('select public.crm_claim_lifecycle_evidence(25,\'advisory\')',False),
 ('select public.crm_reconcile_external_deliveries(100)',False),('select public.crm_cleanup_lifecycle_retention(100)',False),
 ("select crm_security.lifecycle_barrier(true);update public.crm_leads set contact_id=(select contact_id from public.crm_leads where id='%s') where id='%s'"%(a,b),False)]
 barrier=threading.Barrier(len(operations))
 def mixed(op):
  barrier.wait(timeout=10);return tx(op[0],op[1],False)
 with futures.ThreadPoolExecutor(max_workers=len(operations)) as pool:
  for r in pool.map(mixed,operations):
   if r.returncode:assert any(code in r.stderr for code in ('42501','22023','40001')),r.stderr
   assert '40P01' not in r.stderr and '55P03' not in r.stderr,r.stderr
 print('PASS barrier-controlled mixed begin/revoke/admission/prepare/retry/stop/evidence/claim/cleanup/identity batch',flush=True)
 # Stale isolation and shared->exclusive upgrade fail closed before mutation.
 assert sql('begin isolation level repeatable read;'+actor()+'select public.crm_claim_external_deliveries(1,true);commit;',False).returncode!=0
 assert tx('select crm_security.lifecycle_barrier(false);select crm_security.lifecycle_barrier(true)',check=False).returncode!=0
 print('PASS claim skip, reversed multi-lead hierarchy batches, identity/cleanup concurrency, released locks and isolation guards',flush=True)
finally:
 if created:
  subprocess.run(['supabase','db','reset','--local','--no-seed'],env={**os.environ,'SUPABASE_TELEMETRY_DISABLED':'1'},stdout=subprocess.DEVNULL,check=True,timeout=180)
  print('PASS concurrency fixture inventory removed by local rebuild',flush=True)
