-- RWR-r5 invariant 14 (§4.2 inventory): only the single writer and its primitives
-- write crm_tasks. d1_revert is the one named, time-boxed exception (§10, until M-A2).
\set ON_ERROR_STOP on
begin;
create function pg_temp.ok(value boolean,label text) returns void language plpgsql as $$ begin
 if value is not true then raise exception 'FAIL: %',label; end if;
end $$;
do $$ declare found text[]; expected text[]:=array[
 'crm_security.d1_revert()',
 'crm_security.finish_task(crm_tasks,boolean,text,text,text,text)',
 'crm_security.new_task(crm_leads,jsonb,text,text,smallint,text,uuid,uuid,uuid,boolean,text)',
 'crm_security.set_next_action(crm_leads,jsonb,text,text)'];
begin
 -- Every function in every non-system schema, static SQL.
 select coalesce(array_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text),'{}') into found
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname not in ('pg_catalog','information_schema') and n.nspname not like 'pg_toast%'
 and p.prosrc ~* '(insert\s+into|update|delete\s+from|merge\s+into)\s+(public\.)?"?crm_tasks"?\M';
 perform pg_temp.ok(found=expected,'crm_tasks writers are exactly the writer, its primitives and d1_revert: '||array_to_string(found,', '));
 -- No function builds a crm_tasks write dynamically.
 perform pg_temp.ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname not in ('pg_catalog','information_schema') and p.prosrc ~* 'execute' and p.prosrc ~* 'crm_tasks' and p.prosrc ~* '(insert|update|delete)'
  and p.oid::regprocedure::text<>all(expected)
  and p.prosrc ~* 'format\s*\([^)]*crm_tasks'),'no dynamic crm_tasks write');
 -- No role reaches the table directly.
 perform pg_temp.ok(not has_table_privilege(r,'public.crm_tasks',priv),'no '||priv||' for '||r)
 from unnest(array['anon','authenticated','service_role']) r cross join unnest(array['insert','update','delete','truncate']) priv;
 -- The writer and primitives are private.
 perform pg_temp.ok(not has_function_privilege(r,fn,'execute'),fn||' private from '||r)
 from unnest(expected) fn cross join unnest(array['anon','authenticated','service_role']) r;
 -- Every function that calls the primitives directly is the writer itself (cancel_tasks goes through finish_task).
 perform pg_temp.ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname not in ('pg_catalog','information_schema') and p.prosrc ~* 'crm_security\.new_task\s*\('
  and p.oid::regprocedure::text not in ('crm_security.set_next_action(crm_leads,jsonb,text,text)')),'only set_next_action opens tasks through new_task');
 perform pg_temp.ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname not in ('pg_catalog','information_schema') and p.prosrc ~* 'crm_security\.(finish_task|cancel_tasks)\s*\('
  and p.oid::regprocedure::text not in ('crm_security.set_next_action(crm_leads,jsonb,text,text)','crm_security.cancel_tasks(uuid,text,text,boolean)')),'only set_next_action closes tasks (cancel_tasks is its own helper)');
end $$;
\echo PASS crm_tasks writer inventory: set_next_action, new_task, finish_task, d1_revert only
rollback;
