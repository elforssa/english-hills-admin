// Batch G (plan SCG-r1) local database suites. Destructive: synthetic data only.
//   node scripts/test-speed-as-the-centre-grows-local.mjs upgrade
//     after `supabase db reset --local --version 123 --no-seed`: seeds the equivalence
//     fixture, records for eleven identities what every public RLS table returns, what a
//     representative INSERT, UPDATE and DELETE on every policy-bearing table does, and
//     what search_students_page returns over a filter matrix; applies migration 124
//     (the file; the ledger stays at 123) and requires zero differences, the policy
//     text to normalise back to 123, unchanged policy metadata and a catalog change
//     limited to the manifest; then applies the restore script and requires the 123
//     catalog and the same observations again.
//   node scripts/test-speed-as-the-centre-grows-local.mjs budget
//     after `supabase db reset --local --no-seed`: seeds a 5x synthetic school and
//     gates the p95 of the students list and export, the activity log page and the
//     report functions (warm, server time).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { normalise, MIGRATION, RESTORE } from './generate-rls-role-evaluation.mjs';

const mode = process.argv[2];
assert(['upgrade', 'budget'].includes(mode), 'usage: upgrade | budget');
const port = process.env.SCG_PORT || '54322';
const psql = (input, extra = []) => execFileSync('psql', ['-X', '-qAt', '-h', '127.0.0.1', '-p', port, '-U', 'postgres', '-d', 'postgres',
  '-v', 'ON_ERROR_STOP=1', ...extra], { input, encoding: 'utf8', env: { ...process.env, PGPASSWORD: 'postgres' },
  maxBuffer: 256 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const sql = input => psql(input);
const json = input => JSON.parse(sql(input).split('\n').pop());
const applyFile = path => psql(readFileSync(path, 'utf8'));
const id = n => `c0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let checks = 0;
const ok = (condition, message) => { assert(condition, message); checks += 1; };

// Eleven identities: 10 JWT subjects (9 profiles, one bound to an archived teacher
// record, and one account without a profile) and anon.
const IDENTITIES = [
  ['director', 1], ['admin', 2], ['receptionist', 3], ['teacher_linked', 4], ['teacher_unlinked', 5],
  ['parent', 6], ['student', 7], ['pending', 8], ['no_profile', 9], ['teacher_archived_record', 10], ['anon', null]];
const as = (n, body) => n == null
  ? `begin;\nset local role anon;\n${body}\ncommit;`
  : `begin;\nselect set_config('request.jwt.claims', '{"sub":"${id(n)}","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '${id(n)}', true);\nset local role authenticated;\n${body}\ncommit;`;

if (mode === 'upgrade') {
  assert.equal(sql('select max(version) from supabase_migrations.schema_migrations'), '123', 'run on a database at migration 123');
  ok(sql("select to_regprocedure('public.report_years()') is null"), '124 must not be applied yet');
  applyFile('scripts/test-speed-as-the-centre-grows-fixture.sql');

  // Every public table that carries a policy holds rows.
  const policyTables = json(`select jsonb_agg(distinct tablename order by tablename) from pg_policies where schemaname = 'public'`);
  const empty = json(`select coalesce(jsonb_agg(t), '[]') from jsonb_array_elements_text('${JSON.stringify(policyTables)}') t
    where not (xpath('/row/c/text()', query_to_xml(format('select count(*) > 0 as c from public.%I', t), false, true, '')))[1]::text::boolean`);
  ok(policyTables.length === 41 && empty.length === 0, `every policy-bearing table is populated (empty: ${empty.join(', ')})`);

  // Probe objects live in a private schema the catalog digest does not cover.
  sql(`create schema scg_test;
grant usage on schema scg_test to authenticated, anon;
create table scg_test.obs (label text, identity text, kind text, key text, outcome text, primary key (label, identity, kind, key));
grant insert on scg_test.obs to authenticated, anon;
create table scg_test.templates (tbl text primary key, cmds text[], update_col text, row jsonb);
grant select on scg_test.templates to authenticated, anon;
insert into scg_test.templates
select t.tablename, array(select distinct c from pg_policies p, unnest(case p.cmd when 'ALL' then array['INSERT','UPDATE','DELETE'] else array[p.cmd] end) c
    where p.schemaname = 'public' and p.tablename = t.tablename and c <> 'SELECT' order by c),
  (select column_name from information_schema.columns c where c.table_schema = 'public' and c.table_name = t.tablename
    order by (column_name = 'updated_at') desc, (column_name = 'created_at') desc, ordinal_position limit 1),
  null
from (select distinct tablename from pg_policies where schemaname = 'public') t;
-- The INSERT template: a copy of one existing row with fresh unique values.
do $$ declare r record; v jsonb; begin
  for r in select tbl from scg_test.templates loop
    execute format('select to_jsonb(x) from public.%I x order by x::text limit 1', r.tbl) into v;
    if v ? 'id' then v := v || jsonb_build_object('id', md5('scg-insert-' || r.tbl)::uuid); end if;
    v := v || case r.tbl
      when 'app_config' then '{"key":"scg_key_new"}'
      when 'pending_roles' then '{"email":"new-invitee@scg.test"}'
      when 'storage_assets' then '{"object_path":"scg/new/object"}'
      when 'receipts' then '{"receipt_number":null,"idempotency_key":null}'
      when 'online_lessons' then jsonb_build_object('starts_at', now() + interval '8 days', 'ends_at', now() + interval '8 days 1 hour')
      when 'online_attendance' then '{"student_id":"${id(36)}"}'
      when 'premium_attendance' then '{"student_id":"${id(36)}"}'
      when 'storage_asset_bindings' then '{"student_photo_id":"${id(36)}"}'
      when 'charge_discount_reasons' then '{"charge_id":"${id(52)}"}'
      when 'financial_requests' then '{"idempotency_key":"${id(72)}"}'
      when 'enrollments' then '{"school_year":"2029/2030"}'
      when 'online_courses' then '{"group_id":"${id(22)}"}'
      when 'anon_rate_limits' then '{"scope":"scg-new"}'
      when 'rate_limits' then '{"scope":"scg-new"}'
      else '{}' end;
    update scg_test.templates set row = v where tbl = r.tbl;
  end loop;
end $$;

create procedure scg_test.observe(p_label text, p_identity text) language plpgsql as $$
declare t record; c text; n bigint; d text; out text; stmt text;
begin
  -- Reads: visible row count and content digest of every public RLS table.
  for t in select cl.relname from pg_class cl where cl.relnamespace = 'public'::regnamespace and cl.relkind = 'r' and cl.relrowsecurity order by 1 loop
    begin
      execute format('select count(*), md5(coalesce(string_agg(x::text, %L order by x::text), %L)) from public.%I x', '|', '', t.relname) into n, d;
      out := n || ':' || d;
    exception when others then out := 'error:' || sqlstate;
    end;
    insert into scg_test.obs values (p_label, p_identity, 'read', t.relname, out);
  end loop;
  -- Writes: one representative statement per policy command, always rolled back.
  for t in select * from scg_test.templates order by tbl loop
    foreach c in array t.cmds loop
      stmt := case c
        when 'INSERT' then format('insert into public.%I select * from jsonb_populate_record(null::public.%I, %L::jsonb)', t.tbl, t.tbl, t.row)
        when 'UPDATE' then format('update public.%I set %I = %I', t.tbl, t.update_col, t.update_col)
        else format('delete from public.%I', t.tbl) end;
      begin
        execute stmt;
        get diagnostics n = row_count;
        raise exception using errcode = 'SCG01', message = n::text;
      exception when sqlstate 'SCG01' then out := 'ok:' || sqlerrm;
        when others then out := 'error:' || sqlstate;
      end;
      insert into scg_test.obs values (p_label, p_identity, 'write', t.tbl || ' ' || c, out);
    end loop;
  end loop;
  -- search_students_page over a filter matrix (exports included; refusals recorded).
  for t in select * from (select st, pay, q, grp, sz, pg
      from unnest(array['', 'all_shown', 'Prospect', 'Enrolled']) st, unnest(array['', 'due', 'unpaid', 'partial', 'overdue', 'paid', 'none']) pay,
        unnest(array['', 'scg learner t', 'zzz']) q, unnest(array['', 'unassigned']) grp, unnest(array[20, 2, 0]) sz, unnest(array[1, 2]) pg
      where not (sz = 0 and pg <> 1)) m loop
    begin
      out := md5(public.search_students_page(p_search => t.q, p_status => t.st, p_payment => t.pay, p_group => t.grp,
        p_page => t.pg, p_page_size => t.sz)::text);
    exception when others then out := 'error:' || sqlstate;
    end;
    insert into scg_test.obs values (p_label, p_identity, 'students_page', concat_ws('/', t.st, t.pay, t.q, t.grp, t.sz, t.pg), out);
  end loop;
end $$;
grant execute on procedure scg_test.observe(text, text) to authenticated, anon;`);

  const observe = label => { for (const [name, n] of IDENTITIES) sql(as(n, `call scg_test.observe('${label}', '${name}');`)); };
  const differences = (a, b) => json(`select coalesce(jsonb_agg(jsonb_build_object('identity', x.identity, 'kind', x.kind, 'key', x.key,
      'before', x.outcome, 'after', y.outcome) order by x.identity, x.kind, x.key), '[]')
    from scg_test.obs x full join scg_test.obs y on y.label = '${b}' and (y.identity, y.kind, y.key) = (x.identity, x.kind, x.key)
    where x.label = '${a}' and x.outcome is distinct from y.outcome`);

  const catalog = () => json(`select jsonb_build_object(
    'functions', (select jsonb_object_agg(p.oid::regprocedure::text, jsonb_build_array(md5(p.prosrc), p.prosecdef, p.provolatile,
        p.proconfig, p.proowner::regrole::text, p.proacl::text)) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public','crm_security','role_security','operational_security','storage_security','online_security',
        'academic_security','portal_security','finance_security','maintenance')
        and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')),
    'triggers', (select jsonb_object_agg(tgrelid::regclass::text || '.' || tgname, pg_get_triggerdef(oid)) from pg_trigger where not tgisinternal
      and tgrelid::regclass::text not like 'pg_%'),
    'constraints', (select jsonb_object_agg(conrelid::regclass::text || '.' || conname, pg_get_constraintdef(oid) || ':' || convalidated)
      from pg_constraint where connamespace = 'public'::regnamespace),
    'policies', (select jsonb_object_agg(schemaname || '.' || tablename || '.' || policyname, jsonb_build_array(qual, with_check, roles::text, cmd, permissive))
      from pg_policies),
    'indexes', (select jsonb_object_agg(schemaname || '.' || indexname, indexdef) from pg_indexes where schemaname = 'public'),
    'tables', (select jsonb_object_agg(c.oid::regclass::text, jsonb_build_array(c.relrowsecurity, c.relforcerowsecurity, c.relacl::text))
      from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v')),
    'columns', (select jsonb_object_agg(table_name || '.' || column_name, data_type) from information_schema.columns where table_schema = 'public'),
    'cron', (select coalesce(jsonb_object_agg(jobname, md5(schedule || command || active::text)), '{}') from cron.job))`);
  const diffKeys = (a = {}, b = {}) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k])).sort();

  const before = catalog();
  observe('before');
  const counts = json(`select jsonb_object_agg(kind, n) from (select kind, count(*) n from scg_test.obs where label = 'before' group by kind) x`);
  const informative = json(`select jsonb_build_object(
    'reads_nonempty', count(*) filter (where kind = 'read' and outcome ~ '^[1-9]'),
    'writes_ok_nonzero', count(*) filter (where kind = 'write' and outcome ~ '^ok:[1-9]'),
    'writes_refused_rls', count(*) filter (where kind = 'write' and outcome = 'error:42501'),
    'writes_ok_zero', count(*) filter (where kind = 'write' and outcome = 'ok:0'),
    'pages_rows', count(distinct outcome) filter (where kind = 'students_page')) from scg_test.obs where label = 'before'`);
  console.log('observations per identity set:', counts, informative);
  const statuses = json(`select jsonb_agg(distinct r->>'payment_status' order by r->>'payment_status') from jsonb_array_elements((
    select public.search_students_page(p_status => 'all_shown', p_page_size => 0))->'rows') r`);
  ok(JSON.stringify(statuses) === JSON.stringify(['Acompte versé', 'Aucun engagement', 'En attente', 'En retard', 'Soldé']),
    `the fixture produces every payment status (${statuses})`);
  ok(informative.reads_nonempty >= 120 && informative.writes_ok_nonzero >= 80 && informative.writes_refused_rls >= 300,
    'the fixture exercises visible reads, allowed writes and refused writes');

  applyFile(MIGRATION);
  const after = catalog();
  observe('after');
  const changed = differences('before', 'after');
  ok(changed.length === 0, `no observation differs after 124: ${JSON.stringify(changed.slice(0, 5))}`);

  // Policy text and metadata.
  let rewritten = 0;
  for (const key of Object.keys(before.policies)) {
    const [q0, w0, r0, c0, k0] = before.policies[key];
    const [q1, w1, r1, c1, k1] = after.policies[key];
    assert.deepEqual([r1, c1, k1], [r0, c0, k0], `${key}: metadata changed`);
    assert.equal(normalise(q1), q0, `${key}: USING does not normalise to 123`);
    assert.equal(normalise(w1), w0, `${key}: WITH CHECK does not normalise to 123`);
    if (q1 !== q0 || w1 !== w0) rewritten += 1;
  }
  ok(Object.keys(after.policies).length === Object.keys(before.policies).length && rewritten === 157,
    `157 policies rewritten, none added or dropped (${rewritten})`);
  ok(Object.entries(after.policies).every(([k, [q, w]]) => !k.startsWith('public.')
      || !/(?<!SELECT )\b(get_my_role|get_my_teacher_id|get_my_email)\(\)|(?<!SELECT )auth\.uid\(\)/.test(`${q} ${w}`)),
    'no public policy calls a role helper per row');

  // Catalog: only the manifest changed.
  // regprocedure prints public functions unqualified (public is on the search_path).
  const NEW_FUNCTIONS = ['list_activity_log(timestamp with time zone,uuid,text,text,date,date,text,integer)',
    'list_activity_log_tables()', 'report_attendance_daily(integer)', 'report_payroll_by_teacher(integer)',
    'report_student_mix()', 'report_years()'];
  const SSP = 'search_students_page(text,text,text,text,text,boolean,text,text,integer,integer,text,text)';
  ok(JSON.stringify(diffKeys(before.functions, after.functions)) === JSON.stringify([...NEW_FUNCTIONS, SSP].sort()),
    `functions: only the manifest changed (${diffKeys(before.functions, after.functions).join(', ')})`);
  ok(JSON.stringify(before.functions[SSP].slice(1)) === JSON.stringify(after.functions[SSP].slice(1)),
    'search_students_page keeps its security mode, volatility, configuration, owner and ACL');
  for (const f of NEW_FUNCTIONS) {
    const [, definer, volatility, config, , acl] = after.functions[f];
    const expectedConfig = f.startsWith('report_attendance_daily') ? ['search_path=pg_catalog, pg_temp', 'jit=off'] : ['search_path=pg_catalog, pg_temp'];
    ok(!definer && volatility === 's' && JSON.stringify(config) === JSON.stringify(expectedConfig)
      && /authenticated=X/.test(acl) && !/(^|[{,])=X/.test(acl) && !/anon=X/.test(acl), `${f}: invoker, stable, pinned path, authenticated only (${acl})`);
  }
  ok(JSON.stringify(diffKeys(before.indexes, after.indexes)) === JSON.stringify(['public.activity_log_created_id_idx']), 'indexes: one added');
  for (const key of ['triggers', 'constraints', 'tables', 'columns', 'cron']) {
    ok(diffKeys(before[key], after[key]).length === 0, `${key}: unchanged`);
  }
  ok(JSON.stringify(diffKeys(before.policies, after.policies).filter(k => !k.startsWith('public.'))) === '[]', 'non-public policies unchanged');

  // A non-teacher reading a teacher-guarded table tests the role once (InitPlan) before any per-row helper.
  const plan = sql(as(1, `explain (costs off) select * from public.assessments;`));
  // PostgreSQL 17 prints the InitPlan output as (InitPlan n).col1, PostgreSQL 16 as $n.
  ok(/InitPlan/.test(plan) && /(\(InitPlan \d+\)\.col1|\$\d+) = 'teacher'::text\) AND teacher_can_access_student_group/.test(plan),
    `assessments read guards the per-row teacher helper with the once-evaluated role: ${plan}`);

  // The restore refuses when a policy is no longer in its 124 state, changing nothing.
  const probe = sql(`select tablename || '|' || policyname || '|' || qual from pg_policies
    where schemaname = 'public' and tablename = 'students' and policyname = 'students admin select'`).split('|');
  sql(`alter policy "${probe[1]}" on public."${probe[0]}" using (${normalise(probe[2])} and true)`);
  let refused = null;
  try { applyFile(RESTORE); } catch (error) { refused = String(error.stderr || error.message); }
  ok(/policies not in their 124 state: students\.students admin select/.test(refused || ''), `the restore refuses a changed policy: ${refused}`);
  ok(sql("select to_regprocedure('public.report_years()') is not null"), 'a refused restore changes nothing');
  sql(`alter policy "${probe[1]}" on public."${probe[0]}" using (${probe[2]})`);

  // Restore: back to the 123 catalog and the same observations.
  applyFile(RESTORE);
  const restored = catalog();
  ok(diffKeys(before, restored).every(k => diffKeys(before[k], restored[k]).length === 0), 'the restore script returns the 123 catalog');
  observe('restored');
  const back = differences('before', 'restored');
  ok(back.length === 0, `no observation differs after the restore: ${JSON.stringify(back.slice(0, 5))}`);
  sql('drop schema scg_test cascade;');
}

if (mode === 'budget') {
  ok(sql("select to_regprocedure('public.report_years()') is not null"), 'run after migration 124');
  applyFile('scripts/test-speed-as-the-centre-grows-scale.sql');
  sql(`drop schema if exists scg_budget cascade;
create schema scg_budget;
grant usage on schema scg_budget to authenticated;
create table scg_budget.timings (identity text, kind text, ms numeric);
grant insert on scg_budget.timings to authenticated;
create procedure scg_budget.run(p_identity text) language plpgsql as $$
declare k record; t0 timestamptz; i integer; c timestamptz; cid uuid;
begin
  select a.created_at, a.id into c, cid from public.activity_log a order by a.created_at desc, a.id desc offset 5000 limit 1;
  for k in select * from (values
      ('students_list', $q$select public.search_students_page(p_page_size => 20)$q$),
      ('students_list_search', $q$select public.search_students_page(p_search => 'learner 1', p_page_size => 20)$q$),
      ('students_list_overdue', $q$select public.search_students_page(p_payment => 'overdue', p_status => 'all_shown', p_page_size => 20)$q$),
      ('students_export', $q$select public.search_students_page(p_status => 'all_shown', p_page_size => 0)$q$),
      ('activity_first_page', $q$select count(*) from public.list_activity_log()$q$),
      ('activity_deep_page', format($q$select count(*) from public.list_activity_log(%L, %L)$q$, c, cid)),
      ('activity_filtered', $q$select count(*) from public.list_activity_log(p_table => 'receipts', p_search => 'director')$q$),
      ('activity_tables', $q$select count(*) from public.list_activity_log_tables()$q$),
      ('report_attendance_90', $q$select count(*) from public.report_attendance_daily(90)$q$),
      ('report_payroll', $q$select count(*) from public.report_payroll_by_teacher(2026)$q$),
      ('report_student_mix', $q$select count(*) from public.report_student_mix()$q$),
      ('report_years', $q$select count(*) from public.report_years()$q$)) x(kind, q) loop
    continue when k.kind = 'students_export' and p_identity = 'receptionist';
    for i in 1..23 loop
      t0 := clock_timestamp();
      execute k.q;
      if i > 3 then insert into scg_budget.timings values (p_identity, k.kind, extract(epoch from clock_timestamp() - t0) * 1000); end if;
    end loop;
  end loop;
end $$;
grant execute on procedure scg_budget.run(text) to authenticated;`);
  for (const [name, n] of IDENTITIES.slice(0, 3)) sql(as(n, `call scg_budget.run('${name}');`));
  const rows = json(`select jsonb_agg(to_jsonb(x) order by x.kind, x.identity) from (select identity, kind,
      round(percentile_cont(0.5) within group (order by ms)::numeric, 1) as p50, round(percentile_cont(0.95) within group (order by ms)::numeric, 1) as p95
    from scg_budget.timings group by identity, kind) x`);
  console.table(rows);
  const BUDGET = { students_list: 300, students_list_search: 300, students_list_overdue: 300, students_export: 300,
    activity_first_page: 100, activity_deep_page: 100, activity_filtered: 100, activity_tables: 100,
    report_attendance_90: 300, report_payroll: 300, report_student_mix: 300, report_years: 300 };
  // The activity log is a director/admin screen. For a caller RLS gives no row (the
  // receptionist) a call walks the index to its end, like the direct table read it
  // already may issue; it is reported, not gated, and the function adds no role shortcut.
  for (const row of rows) {
    if (row.kind.startsWith('activity_') && !['director', 'admin'].includes(row.identity)) continue;
    ok(Number(row.p95) < BUDGET[row.kind], `${row.kind} as ${row.identity}: p95 ${row.p95} ms < ${BUDGET[row.kind]} ms`);
  }
  sql('drop schema scg_budget cascade;');
}

console.log(`speed-as-the-centre-grows ${mode}: ${checks} checks passed`);
