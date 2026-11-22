-- Receptionist permissions, stage 5 (plan RPW-r2, "Locked-item checks"): synthetic local fixtures,
-- fully rolled back. Run with the classification fixture as a variable:
--   psql -v fixture="$(cat scripts/fixtures/receptionist-function-classification.json)" -f this-file
-- 1. Every public function the fixture marks « locked » for her refuses with 42501 when she calls
--    it (null arguments), with three documented exceptions below.
-- 2. A DELETE as receptionist on every public table, each seeded with one synthetic row, removes
--    nothing (authorized_adults is the one table where her policy may delete: item 4, tested in
--    test-receptionist-dossier-teaching.sql).
\set ON_ERROR_STOP on
begin;

create function pg_temp.ok(v boolean, label text) returns void language plpgsql as $$ begin
  if v is not true then raise exception 'FAIL: %', label; end if;
end $$;
create function pg_temp.act() returns void language plpgsql as $$ begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '7b736000-0000-4000-8000-000000000001', true);
  perform set_config('request.jwt.claims', '{"sub":"7b736000-0000-4000-8000-000000000001","role":"authenticated"}', true);
  execute 'set local role authenticated';
end $$;

insert into auth.users(id, email, aud, role, email_confirmed_at, created_at, updated_at)
  values ('7b736000-0000-4000-8000-000000000001', 'rpw-locked@example.test', 'authenticated', 'authenticated', now(), now(), now());
update public.profiles set role = 'receptionist' where id = '7b736000-0000-4000-8000-000000000001';
create temp table locked_fn(fn text, code text, msg text, answer text);
create temp table delete_probe(tab text, removed bigint, code text);
grant all on locked_fn, delete_probe to authenticated;

-- ── 1. Locked functions ───────────────────────────────────────────────────
create temp table locked as
  select p.oid, k.key from jsonb_each(:'fixture'::jsonb) k
  join pg_proc p on p.pronamespace = 'public'::regnamespace and p.proname = split_part(k.key, '(', 1)
    and p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' = k.key
  where k.value->>'receptionist' = 'locked';
select pg_temp.ok((select count(*) from locked) = (select count(*) from jsonb_each(:'fixture'::jsonb) k where k.value->>'receptionist' = 'locked'),
  'every locked fixture entry resolves to a function');
grant select on locked to authenticated;
select pg_temp.act();
do $$ declare r record; q text; c text; m text; a text; begin
  for r in select * from locked order by key loop
    select 'select (public.' || quote_ident(p.proname) || '(' || coalesce(string_agg('null::' || format_type(t, null), ',' order by o), '') || '))::text'
      into q from pg_proc p left join unnest(p.proargtypes::oid[]) with ordinality u(t, o) on true where p.oid = r.oid group by p.proname;
    begin
      execute q into a;
      insert into locked_fn values (r.key, 'ACCEPTED', null, a);
    exception when others then
      get stacked diagnostics c = returned_sqlstate, m = message_text;
      insert into locked_fn values (r.key, c, left(m, 120), null);
    end;
  end loop;
end $$;
reset role;
select pg_temp.ok(count(*) > 60, 'locked functions probed: ' || count(*)) from locked_fn;
-- Documented exceptions (unchanged since 130): a predicate that answers false for her, and two
-- director CRM commands whose lock or scope step refuses a null id before require_reader(true);
-- neither writes before that gate.
select pg_temp.ok((select answer from locked_fn where fn = 'can_access_premium_group(p_group_id uuid)') = 'false',
  'can_access_premium_group answers false');
select pg_temp.ok(not exists (select 1 from locked_fn where code <> '42501' and fn not in (
    'can_access_premium_group(p_group_id uuid)',
    'crm_retry_external_delivery(p_delivery uuid)',
    'crm_revoke_lifecycle_evidence(p_request uuid, p_evidence uuid, p_reason text)')),
  'locked functions refuse with 42501: ' || coalesce((select string_agg(fn || ' ' || code || ' ' || coalesce(msg, answer, ''), '; ')
    from locked_fn where code <> '42501' and fn not in ('can_access_premium_group(p_group_id uuid)',
      'crm_retry_external_delivery(p_delivery uuid)', 'crm_revoke_lifecycle_evidence(p_request uuid, p_evidence uuid, p_reason text)')), ''));

-- ── 2. DELETE on every public table ───────────────────────────────────────
-- At least one row per table (a synthetic one where the table is empty). Check and unique constraints are dropped inside this rolled-back
-- transaction (they do not decide who may delete; rows, grants, policies and triggers do),
-- foreign keys and triggers are off while seeding only.
do $$ declare r record; begin
  for r in select c.conrelid::regclass t, c.conname from pg_constraint c join pg_class k on k.oid = c.conrelid
    where k.relnamespace = 'public'::regnamespace and c.contype in ('c', 'u', 'x') loop
    execute format('alter table %s drop constraint if exists %I cascade', r.t, r.conname);
  end loop;
end $$;
create function pg_temp.val(typ oid) returns text language plpgsql as $$
declare e text; t regtype := typ::regtype; begin
  select quote_literal(enumlabel) into e from pg_enum where enumtypid = typ order by enumsortorder limit 1;
  if e is not null then return e || '::' || t::text; end if;
  return case
    when t = 'uuid'::regtype then 'gen_random_uuid()'
    when t in ('text'::regtype, 'character varying'::regtype) then quote_literal('rpw-locked')
    when t in ('integer'::regtype, 'bigint'::regtype, 'smallint'::regtype, 'numeric'::regtype, 'real'::regtype, 'double precision'::regtype) then '1'
    when t = 'boolean'::regtype then 'false'
    when t = 'date'::regtype then 'current_date'
    when t in ('timestamp with time zone'::regtype, 'timestamp without time zone'::regtype) then 'now()'
    when t = 'time without time zone'::regtype then '''10:00'''
    when t in ('jsonb'::regtype, 'json'::regtype) then '''{}'''
    when t = 'inet'::regtype then '''127.0.0.1'''
    when t = 'interval'::regtype then '''1 hour'''
    when t = 'bytea'::regtype then '''\x00'''
    when t::text like '%[]' then '''{}'''
    else 'null' end;
end $$;
set local session_replication_role = replica;
do $$ declare r record; cols text; vals text; present boolean; begin
  for r in select c.oid, c.relname from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' order by 2 loop
    execute format('select exists (select 1 from public.%I)', r.relname) into present;
    continue when present;  -- a singleton or configuration row is already there
    select string_agg(format('%I', a.attname), ',' order by a.attnum), string_agg(pg_temp.val(a.atttypid), ',' order by a.attnum)
      into cols, vals from pg_attribute a where a.attrelid = r.oid and a.attnum > 0 and not a.attisdropped
      and a.attgenerated = '' and a.attidentity = '' and a.attnotnull and not a.atthasdef;
    if cols is null then execute format('insert into public.%I default values', r.relname);
    else execute format('insert into public.%I(%s) values (%s)', r.relname, cols, vals); end if;
  end loop;
end $$;
set local session_replication_role = origin;
select pg_temp.act();
do $$ declare r record; n bigint; c text; begin
  for r in select c.relname from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' order by 1 loop
    begin
      execute format('delete from public.%I', r.relname);
      get diagnostics n = row_count;
      insert into delete_probe values (r.relname, n, null);
    exception when others then
      get stacked diagnostics c = returned_sqlstate;
      insert into delete_probe values (r.relname, null, c);
    end;
  end loop;
end $$;
reset role;
select pg_temp.ok(count(*) = (select count(*) from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'),
  'every public table probed') from delete_probe;
select pg_temp.ok(not exists (select 1 from delete_probe where removed > 0 and tab <> 'authorized_adults'),
  'DELETE as receptionist removed rows from: ' || coalesce((select string_agg(tab || '=' || removed, ', ') from delete_probe
    where removed > 0 and tab <> 'authorized_adults'), ''));
select pg_temp.ok(not exists (select 1 from delete_probe where code is not null and code <> '42501'),
  'DELETE refusals are 42501: ' || coalesce((select string_agg(tab || ' ' || code, ', ') from delete_probe where code is not null and code <> '42501'), ''));

select format('PASS receptionist locked items (stage 5): %s locked functions refused, DELETE removes nothing on %s public tables',
  (select count(*) from locked_fn), (select count(*) from delete_probe)) \gset
\echo :format
rollback;
