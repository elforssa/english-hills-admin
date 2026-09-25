#!/usr/bin/env python3
"""Read-only EXPLAIN ANALYZE on disposable synthetic data; claims roll back."""
import json,subprocess,time,argparse
p=argparse.ArgumentParser();p.add_argument("--nested",action="store_true");args=p.parse_args()
from pathlib import Path
out=Path('/private/tmp/phase12-plans');out.mkdir(exist_ok=True)
queries={
 'today':'select crm_get_today(30,0,0)',
 'search':"select crm_search_leads('Synthetic learner 99',null,null,25,0)",
 'detail':'select crm_get_workspace_detail((select id from crm_leads order by id limit 1))',
 'history':'select crm_get_history((select id from crm_leads order by id limit 1),30,0)',
 'intake':'select crm_list_intake_review(25,0)',
 'analytics':"select crm_get_marketing_cohort(current_date-30,current_date,null,'8c000000-0000-0000-0000-000000000020','campaign')",
 'revenue_queue':'select crm_get_revenue_reconciliation_queue(50,0)',
 'diagnostics':'select crm_get_meta_diagnostics(25,0)',
 'delivery_diagnostics':'select crm_list_external_deliveries(25,0)',
 'job_claim':'select crm_claim_ingestion_jobs(5)',
 'delivery_claim':'select crm_claim_external_deliveries(5)',
 'insights_claim':'select crm_claim_insights_sync()',
 'task_history':"select l.id,(select max(greatest(t.completed_at,t.cancelled_at)) from crm_tasks t where t.lead_id=l.id and t.status<>'open') from crm_leads l where l.status in ('NEW','CONTACTING','ENGAGED','QUALIFIED')",
}
results={}
for name,q in queries.items():
 worker='claim' in name
 statement="begin;set local statement_timeout='15s';set local request.jwt.claim.sub='8c000000-0000-0000-0000-000000000001';set local request.jwt.claim.role='"+('service_role' if worker else 'authenticated')+"';explain (analyze,buffers,format json) "+q+';rollback;'
 r=subprocess.run(['docker','exec','-i','supabase_db_hills-phase12-platform','psql','-X','-qAt','-vON_ERROR_STOP=1','-U','postgres','-d','phase12_fresh'],input=statement,text=True,capture_output=True,timeout=30)
 (out/(name+'.json')).write_text(r.stdout if r.returncode==0 else r.stderr)
 results[name]={'passed':r.returncode==0,'execution_ms':json.loads(r.stdout)[0]['Execution Time'] if r.returncode==0 else None}
 print(name,results[name],flush=True)
if args.nested:
 import re
 for name,q in queries.items():
  if name=='task_history':continue
  worker='claim' in name
  statement="load 'auto_explain';set auto_explain.log_min_duration=0;set auto_explain.log_analyze=on;set auto_explain.log_buffers=on;set auto_explain.log_nested_statements=on;set client_min_messages=log;set role postgres;begin;set local statement_timeout='30s';set local request.jwt.claim.sub='8c000000-0000-0000-0000-000000000001';set local request.jwt.claim.role='"+('service_role' if worker else 'authenticated')+"';"+q+';rollback;'
  r=subprocess.run(['docker','exec','-i','supabase_db_hills-phase12-platform','psql','-X','-qAt','-vON_ERROR_STOP=1','-U','supabase_admin','-d','phase12_fresh'],input=statement,text=True,capture_output=True,timeout=45)
  (out/(name+'-nested.log')).write_text(r.stderr)
  results[name]['nested_passed']=r.returncode==0
  results[name]['nested_indexes']=sorted(set(re.findall(r'(?:Index(?: Only)? Scan using|Bitmap Index Scan on) (\w+)',r.stderr)))
  print(name,'nested',r.returncode,results[name]['nested_indexes'],flush=True)
(out/'summary.json').write_text(json.dumps(results,indent=2))
