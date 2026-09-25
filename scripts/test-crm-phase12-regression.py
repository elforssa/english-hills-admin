#!/usr/bin/env python3
"""Serial release regression runner. One host-wide lock prevents fixture overlap.
Run browser groups against a normal local build (3101 and placement 3017).
Middleware owns/rebuilds .next: stop app servers before that group, then rebuild.
"""
import argparse,fcntl,json,os,subprocess,time
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('group',choices=['sql','concurrency','unit','browser','batch2','middleware','security']);p.add_argument('--reverse',action='store_true');p.add_argument('--only');a=p.parse_args()
assert Path('.git/HEAD').read_text().startswith('ref: refs/heads/codex/')
lock=open('/private/tmp/hills-crm-release-tests.lock','w')
try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
except BlockingIOError:raise SystemExit('Another release regression group owns the local fixtures/build. Run groups serially.')
env={**os.environ,'PGPASSWORD':'postgres'}
psql=['psql','-X','-qAt','-h','127.0.0.1','-p','54322','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1']
def read(q):return subprocess.check_output(psql+['-c',q],env={**env,'PGOPTIONS':'-c default_transaction_read_only=on'},text=True).strip()
def health():
 tables=read("select tablename from pg_tables where schemaname='public' and tablename like 'crm_%' order by 1").splitlines()
 return {'crm':read(' union all '.join("select '"+t+"',count(*) from "+t for t in tables)),
 'users':read("select count(*),md5(coalesce(string_agg(id::text,',' order by id),'')) from auth.users"),
 'guards':read("select md5(string_agg(pg_get_triggerdef(oid)||tgenabled::text,'|' order by tgrelid::regclass::text,tgname)) from pg_trigger where not tgisinternal and tgrelid in(select oid from pg_class where relnamespace='public'::regnamespace)"),
 'rls':read("select md5(string_agg(relname||relrowsecurity::text||coalesce(relacl::text,''),'|' order by relname)) from pg_class where relnamespace='public'::regnamespace and relkind='r'"),
 'disabled':read("select count(*) from pg_trigger where not tgisinternal and tgenabled='D'")}
node=['node','--import',str(Path('scripts/lib/no-git-branch-probe.mjs').resolve())]
if a.group=='sql':jobs=[('phase'+str(i),psql+['-f',f'scripts/test-crm-phase{i}.sql']) for i in range(2,12)]+[(s,psql+['-f','scripts/test-'+s+'.sql']) for s in ['receptionist-security','enrollment-workflow','paid-enrollment','student-placement','receipt-charge-payments','delete-mistaken-receipt']]
if a.group=='sql':jobs.append(('phase12-analytics',['python3','scripts/test-crm-phase12-analytics.py']))
if a.group=='concurrency':jobs=[('phase'+str(i),['python3',f'scripts/test-crm-phase{i}-concurrency.py']) for i in range(3,12)]
elif a.group=='unit':jobs=[('phase'+str(i),node+[f'scripts/test-crm-phase{i}.mjs']) for i in [4,8,9,10,11]]+[(s,['npm','run',s]) for s in ['test','test:navigation','lint','build']]
elif a.group=='browser':jobs=[(s,node+['scripts/test-'+s+'-browser.mjs']) for s in ['crm-phase4','crm-phase5','crm-phase6','crm-phase8','crm-phase9','crm-phase11','receptionist','student-placement','crm-phase12']]
elif a.group=='batch2':jobs=[('batch2',node+['scripts/test-batch2-security.mjs','--preserve-directors'])]
elif a.group=='security':jobs=[('role-matrix',node+['scripts/test-crm-phase12-security.mjs'])]
elif a.group=='middleware':jobs=[('middleware',node+['scripts/test-middleware-security.mjs'])]
if a.only:
 jobs=[j for j in jobs if j[0]==a.only]
 assert jobs,'Unknown suite for group'
if a.reverse:jobs.reverse()
out=Path('/private/tmp/phase12-regression');out.mkdir(exist_ok=True);baseline=health();assert baseline['disabled']=='0';results=[]
for name,cmd in jobs:
 start=time.monotonic();log=out/(a.group+'-'+('reverse-' if a.reverse else '')+name+'.log')
 with log.open('w') as f:r=subprocess.run(cmd,env=env,stdout=f,stderr=subprocess.STDOUT)
 after=health();clean=after==baseline
 item={'suite':name,'exit':r.returncode,'health_restored':clean,'seconds':round(time.monotonic()-start,2),'log':str(log)};results.append(item);print(json.dumps(item),flush=True)
 (out/(a.group+('-reverse' if a.reverse else '')+('-'+a.only if a.only else '')+'.json')).write_text(json.dumps(results,indent=2))
 if r.returncode or not clean:
  if not clean:print('Changed health fields:',[k for k in baseline if baseline[k]!=after[k]])
  raise SystemExit('Regression/cleanup failed. Stop; inspect the log instead of retrying blindly.')
print('PASS serial group; users, CRM fixture counts, trigger states and table RLS/grants restored')
