#!/usr/bin/env python3
"""Compare local and two disposable replay catalogs, without writes or Git.
OIDs, row data, statistics and sequence counters are deliberately excluded.
"""
import json,os,subprocess
from pathlib import Path
assert Path('.git/HEAD').read_text().startswith('ref: refs/heads/codex/')
query="""begin isolation level repeatable read read only;
with critical as (
 select oid,relname,relrowsecurity,relforcerowsecurity,relacl from pg_class
 where relnamespace='public'::regnamespace and relkind='r'
 and (relname like 'crm_%' or relname in ('profiles','pending_roles','students','enrollments','placement_tests','charges','receipts','financial_events'))
), evidence as (
 select 'table:'||relname key,jsonb_build_array(relrowsecurity,relforcerowsecurity,
   (select jsonb_agg(jsonb_build_array(grantee::regrole::text,privilege_type,is_grantable) order by grantee::regrole::text,privilege_type) from aclexplode(relacl))) value from critical
 union all select 'column:'||c.relname||'.'||a.attname,jsonb_build_array(format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid))
 from critical c join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
 union all select 'constraint:'||c.relname||'.'||conname,to_jsonb(pg_get_constraintdef(x.oid)) from critical c join pg_constraint x on x.conrelid=c.oid
 union all select 'index:'||c.relname||'.'||i.indexrelid::regclass::text,to_jsonb(pg_get_indexdef(i.indexrelid)) from critical c join pg_index i on i.indrelid=c.oid
 union all select 'trigger:'||c.relname||'.'||t.tgname,jsonb_build_array(pg_get_triggerdef(t.oid),t.tgenabled) from critical c join pg_trigger t on t.tgrelid=c.oid where not t.tgisinternal
 union all select 'policy:'||c.relname||'.'||p.polname,jsonb_build_array(p.polcmd,p.polpermissive,(select jsonb_agg(r::regrole::text order by r::regrole::text) from unnest(p.polroles)r),pg_get_expr(p.polqual,p.polrelid),pg_get_expr(p.polwithcheck,p.polrelid)) from critical c join pg_policy p on p.polrelid=c.oid
 union all select 'function:'||n.nspname||'.'||p.oid::regprocedure::text,jsonb_build_array(p.prosrc,p.prosecdef,p.proconfig,
 (select jsonb_agg(jsonb_build_array(grantee::regrole::text,privilege_type,is_grantable) order by grantee::regrole::text,privilege_type) from aclexplode(p.proacl)))
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('crm_security','role_security') or (n.nspname='public' and (p.proname like 'crm_%' or p.proname in ('delete_mistaken_receipt','create_charge_payment','save_receptionist_enrollment','sync_student_from_enrollments','enforce_enrollment_student_sync','sync_enrollments_from_student','remove_student_group','teacher_can_see_student','search_students_page','profiles_prevent_self_elevation','get_my_role','apply_pending_role','set_user_role')))
) select jsonb_object_agg(key,value) from evidence;
rollback;"""
def read(command):
 r=subprocess.run(command,input=query,text=True,capture_output=True,env={**os.environ,'PGPASSWORD':'postgres'},check=True)
 return json.loads(r.stdout)
local=read(['psql','-X','-qAt','-h','127.0.0.1','-p','54322','-U','postgres','-d','postgres','-vON_ERROR_STOP=1'])
for db in ['phase12_fresh','phase12_upgrade']:
 replay=read(['docker','exec','-i','supabase_db_hills-phase12-platform','psql','-X','-qAt','-U','postgres','-d',db,'-vON_ERROR_STOP=1'])
 different=[k for k in sorted(local.keys()|replay.keys()) if local.get(k)!=replay.get(k)]
 assert not different,{'database':db,'different_objects':different}
 print(f'PASS {db}: {len(local)} local/replay catalog definitions, roles, RLS, grants, columns, indexes, constraints, triggers and functions match')
