-- Single writer, grants side (plan RWR-r5 §7 invariant 14, PR A2 acceptance).
-- Rollback-only; reads the catalogue and calls the revoked wrappers as `authenticated`.
--  * No API role (anon, authenticated) holds a table or column write on any crm_* table:
--    CRM rows change only through the security-definer commands.
--  * placement_tests is the known exception (123:284-289 teacher insert and update
--    policies, and the receptionist policies): column INSERT and UPDATE under RLS for
--    authenticated, and table DELETE (the Admissions « Tests de niveau » page deletes a
--    student's own test, RLS: admin and director). Since 137, anon holds nothing on it and
--    authenticated has no TRUNCATE (owner decision 2026-11-23). Students, enrollments and
--    attendance writes belong to PRs B1 and C2.
--  * After M-A2 (migration 137) the twelve old command wrappers are executable by no API
--    role and refused (42501) when called as `authenticated`; their replacements and the
--    commands the screens still use keep their grant; the D1 data-step functions are gone.
\set ON_ERROR_STOP on
begin;
set local statement_timeout = '30s';
create function pg_temp.ok(v boolean, label text) returns void language plpgsql as $$
begin if v is not true then raise exception 'FAIL %', label; end if; end $$;

-- 1. Table and column writes on crm_* tables.
do $$ declare r record; bad text[] := '{}'; begin
  for r in select c.oid, c.relname, rl.rolname from pg_class c join pg_namespace n on n.oid = c.relnamespace
             cross join (values ('anon'), ('authenticated')) rl(rolname)
           where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relname like 'crm\_%' loop
    if has_table_privilege(r.rolname, r.oid, 'INSERT') or has_table_privilege(r.rolname, r.oid, 'UPDATE')
       or has_table_privilege(r.rolname, r.oid, 'DELETE') or has_table_privilege(r.rolname, r.oid, 'TRUNCATE')
       or has_any_column_privilege(r.rolname, r.oid, 'INSERT') or has_any_column_privilege(r.rolname, r.oid, 'UPDATE') then
      bad := bad || (r.rolname || ' on ' || r.relname);
    end if;
  end loop;
  perform pg_temp.ok(cardinality(bad) = 0, 'no API write on crm_* tables: ' || array_to_string(bad, ', '));
  perform pg_temp.ok((select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
                      where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'crm\_%') >= 20, 'the crm_* tables are found');
end $$;

-- 2. placement_tests: the documented exception, pinned.
select pg_temp.ok(
  not has_table_privilege('authenticated', 'public.placement_tests', 'INSERT')
  and not has_table_privilege('authenticated', 'public.placement_tests', 'UPDATE')
  and has_any_column_privilege('authenticated', 'public.placement_tests', 'INSERT')
  and has_any_column_privilege('authenticated', 'public.placement_tests', 'UPDATE'),
  'placement_tests: column insert and update only, under RLS');
select pg_temp.ok((select relrowsecurity from pg_class where oid = 'public.placement_tests'::regclass), 'placement_tests: RLS on');
select pg_temp.ok((select array_agg(polname::text order by polname) from pg_policy
                   where polrelid = 'public.placement_tests'::regclass and polcmd in ('a', 'w', '*'))
  = array['crm_placement_operational_only', 'placement admin all', 'placement teacher insert', 'placement teacher update',
          'receptionist_placement_insert', 'receptionist_placement_update'],
  'placement_tests: the write policies are exactly the known ones');
select pg_temp.ok(has_table_privilege('authenticated', 'public.placement_tests', 'DELETE')
  and not has_table_privilege('authenticated', 'public.placement_tests', 'TRUNCATE'),
  'placement_tests: authenticated keeps DELETE (Admissions page, RLS admin and director), no TRUNCATE');
select pg_temp.ok(not has_table_privilege('anon', 'public.placement_tests', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  and not has_any_column_privilege('anon', 'public.placement_tests', 'SELECT,INSERT,UPDATE,REFERENCES'),
  'placement_tests: anon holds no table or column privilege');
select pg_temp.ok((select pg_get_expr(polqual, polrelid) from pg_policy where polrelid = 'public.placement_tests'::regclass and polname = 'placement admin all')
  like '%admin%director%', 'placement_tests: delete limited by RLS to admin and director');

-- 3. The old wrappers: no API grant, refused for authenticated.
create temp table old_wrappers(fn regprocedure) on commit drop;
insert into old_wrappers values
  ('public.crm_add_note(uuid,jsonb)'), ('public.crm_record_call_outcome(uuid,jsonb)'), ('public.crm_record_whatsapp(uuid,jsonb)'),
  ('public.crm_record_conversation(uuid,jsonb)'), ('public.crm_record_conversation_decision(uuid,jsonb)'), ('public.crm_qualify_lead(uuid,jsonb)'),
  ('public.crm_schedule_task(uuid,jsonb)'), ('public.crm_complete_task(uuid,jsonb)'), ('public.crm_cancel_task(uuid,jsonb)'),
  ('public.crm_close_lost(uuid,jsonb)'), ('public.crm_close_not_qualified(uuid,jsonb)'), ('public.crm_reopen_lead(uuid,jsonb)');
grant select on old_wrappers to authenticated;
select pg_temp.ok(bool_and(not has_function_privilege(r, fn, 'execute')), 'old wrappers: no execute for ' || r)
  from old_wrappers cross join unnest(array['public', 'anon', 'authenticated']) r group by r;
select pg_temp.ok((select bool_and(coalesce(p.proacl::text, '') !~ '(^|[{,])=X') from old_wrappers w join pg_proc p on p.oid = w.fn),
  'old wrappers: no PUBLIC grant');
set local role authenticated;
do $$ declare w record; n integer := 0; begin
  for w in select fn from old_wrappers loop
    begin
      execute format('select %s(gen_random_uuid(), ''{}''::jsonb)', (w.fn::regproc)::text);
      raise exception 'FAIL % ran for authenticated', w.fn;
    exception when insufficient_privilege then n := n + 1;
    end;
  end loop;
  perform pg_temp.ok(n = 12, 'twelve old wrappers refused for authenticated with 42501');
end $$;
reset role;

-- 4. The commands the screens use keep their grant.
select pg_temp.ok(bool_and(has_function_privilege('authenticated', fn, 'execute')), 'current commands executable by authenticated')
  from (values ('public.crm_log_exchange(uuid,jsonb)'::regprocedure), ('public.crm_change_next_action(uuid,jsonb)'),
    ('public.crm_record_appointment_outcome(uuid,jsonb)'), ('public.crm_close_prospect(uuid,jsonb)'), ('public.crm_reopen_prospect(uuid,jsonb)'),
    ('public.crm_check_action(uuid)'), ('public.crm_reassign(uuid,jsonb)'), ('public.crm_book_placement_test(uuid,jsonb)'),
    ('public.crm_update_placement_test(uuid,jsonb)')) v(fn);
select pg_temp.ok(not bool_or(has_function_privilege('anon', fn, 'execute')), 'current commands not executable by anon')
  from (values ('public.crm_log_exchange(uuid,jsonb)'::regprocedure), ('public.crm_close_prospect(uuid,jsonb)'), ('public.crm_reopen_prospect(uuid,jsonb)')) v(fn);

-- 5. M-A2 structure: the index and no data step left.
select pg_temp.ok(i.indisvalid and i.indisunique, 'crm_tasks_one_open_per_lead valid and unique')
  from pg_index i where i.indexrelid = 'public.crm_tasks_one_open_per_lead'::regclass;
select pg_temp.ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                              where n.nspname = 'crm_security' and p.proname like 'd1\_%'), 'no D1 data-step function left');
select pg_temp.ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                              where n.nspname in ('public', 'crm_security') and p.prosrc like '%eh.crm_data_step%'), 'no eh.crm_data_step bypass left');

rollback;
\echo PASS single writer grants: no API write on crm_* tables, placement_tests exception (no anon, no TRUNCATE), twelve old wrappers revoked and refused, current commands granted, index valid, D1 gone
