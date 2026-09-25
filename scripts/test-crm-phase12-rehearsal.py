#!/usr/bin/env python3
"""Exact historical replay in two application-empty disposable Supabase databases.
Bootstrap platform schemas with the Supabase CLI first; never target development.
No Git commands, migration edits, resets, copied application data or live network.
"""
import argparse,json,subprocess,time,hashlib
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--container',default='supabase_db_hills-phase12-platform');p.add_argument('--output',default='/private/tmp/phase12-rehearsal');p.add_argument('--bootstrap',action='store_true');p.add_argument('--only',choices=['fresh','upgrade']);a=p.parse_args()
databases=['phase12_'+a.only] if a.only else ['phase12_fresh','phase12_upgrade']
assert a.container=='supabase_db_hills-phase12-platform','Refusing any other container'
assert Path('.git/HEAD').read_text().strip()=='ref: refs/heads/codex/director-receipt-deletion'
out=Path(a.output);out.mkdir(parents=True,exist_ok=True)
files=sorted(Path('supabase/migrations').glob('*.sql'));files=[f for f in files if int(f.name[:3])<=90]
assert [f.name[:3] for f in files]==[f'{i:03}' for i in range(1,91)]
def sql(db,s):
 assert db in ['phase12_fresh','phase12_upgrade']
 return subprocess.run(['docker','exec','-i',a.container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d',db],input=s,text=True,capture_output=True,timeout=180)
if a.bootstrap:
 base=['docker','exec',a.container]
 platform=subprocess.run(base+['psql','-X','-qAt','-U','postgres','-d','postgres','-c',"select (select count(*) from auth.users)+(select count(*) from pg_tables where schemaname='public')"],capture_output=True,text=True,check=True)
 assert platform.stdout.strip()=='0','Platform must contain no application schema/data'
 dump=subprocess.run(base+['pg_dump','-U','postgres','-d','postgres','--schema-only'],capture_output=True,text=True,check=True).stdout
 for db in databases:
  subprocess.run(base+['createdb','-U','supabase_admin','-O','postgres','-T','template0',db],check=True)
  restored=subprocess.run(['docker','exec','-i',a.container,'psql','-X','-q','-vON_ERROR_STOP=1','-U','supabase_admin','-d',db],input=dump,capture_output=True,text=True)
  (out/(db+'-bootstrap.log')).write_text(restored.stdout+restored.stderr)
  assert restored.returncode==0,'Platform bootstrap failed; do not replay application migrations'
report={}
for db in databases:
 assert sql(db,"select count(*) from pg_tables where schemaname='public'").stdout.strip()=='0','Refusing nonempty rehearsal database'
 assert sql(db,"select to_regnamespace('public') is not null and to_regclass('auth.users') is not null and to_regclass('storage.objects') is not null").stdout.strip()=='t','Platform bootstrap incomplete'
 assert sql(db,"select count(*) from auth.users").stdout.strip()=='0'
 report[db]={'migrations':[],'passed':False};start=time.monotonic()
 for f in files:
  t=time.monotonic();r=sql(db,f.read_text());(out/(db+'-'+f.name+'.log')).write_text(r.stdout+r.stderr)
  report[db]['migrations'].append({'file':f.name,'sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'seconds':round(time.monotonic()-t,3),'passed':r.returncode==0,'notices':r.stderr.count('NOTICE'),'warnings':r.stderr.count('WARNING')})
  print(db,f.name,'PASS' if r.returncode==0 else 'FAIL',flush=True)
  if r.returncode:report[db]['error']=r.stderr;break
  if db=='phase12_upgrade' and f.name.startswith('076_'):
   fixture="""insert into students(id,full_name,status,session_type) values('8c000000-0000-0000-0000-000000000101','Phase12 preserved student','Prospect','Yearly');
   insert into enrollments(id,student_id,status,session_type,school_year) values('8c000000-0000-0000-0000-000000000102','8c000000-0000-0000-0000-000000000101','Submitted','Yearly','2026/2027');
   insert into auth.users(id,email,aud,role) values('8c000000-0000-0000-0000-000000000103','phase12-upgrade@example.invalid','authenticated','authenticated');
   update profiles set role='director' where id='8c000000-0000-0000-0000-000000000103';
   set request.jwt.claim.sub='8c000000-0000-0000-0000-000000000103';
   select create_charge_payment(jsonb_build_object('student_id','8c000000-0000-0000-0000-000000000101','enrollment_id','8c000000-0000-0000-0000-000000000102','session_type','Yearly','school_year','2026/2027','plan_type','Standard','gross_amount',1500,'payment_amount',500,'payment_method','Espèces','idempotency_key',gen_random_uuid()));"""
   r=sql(db,fixture);assert r.returncode==0,r.stderr
   snapshot="select jsonb_build_object('student',(select to_jsonb(s) from students s where id='8c000000-0000-0000-0000-000000000101'),'enrollment',(select to_jsonb(e) from enrollments e where id='8c000000-0000-0000-0000-000000000102'),'charges',(select jsonb_agg(to_jsonb(c) order by id) from charges c),'receipts',(select jsonb_agg(to_jsonb(r) order by id) from receipts r),'events',(select jsonb_agg(to_jsonb(e) order by id) from financial_events e),'profile',(select to_jsonb(p) from profiles p where id='8c000000-0000-0000-0000-000000000103'))"
   report[db]['baseline076']=sql(db,snapshot).stdout.strip();upgrade_start=time.monotonic()
 else:
  report[db]['passed']=True
  if db=='phase12_upgrade':
   report[db]['upgrade_seconds']=round(time.monotonic()-upgrade_start,3)
   report[db]['preserved']=sql(db,snapshot).stdout.strip()==report[db]['baseline076'];assert report[db]['preserved']
  r=sql(db,"select tablename from pg_tables where schemaname='public' and tablename like 'crm_%' order by 1")
  for table in r.stdout.splitlines():assert sql(db,'select count(*) from '+table).stdout.strip()=='0',table
  report[db]['crm_empty']=True
 report[db]['seconds']=round(time.monotonic()-start,3)
 (out/'result.json').write_text(json.dumps(report,indent=2))
print(json.dumps({k:{f:v for f,v in x.items() if f not in ['migrations','baseline076']} for k,x in report.items()},indent=2))
raise SystemExit(0 if all(x['passed'] for x in report.values()) else 1)
