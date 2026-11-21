// Receptionist permissions (plan RPW-r2) local equivalence check, adapted from the Batch G
// harness (test-speed-as-the-centre-grows-local.mjs). Destructive: synthetic data only.
//   supabase db reset --local --no-seed --version 130
//   node scripts/test-receptionist-permissions-equivalence-local.mjs   (SCG_PORT=54322 by default)
// Seeds the Batch G equivalence fixture, records for eleven identities what every public RLS table
// returns, what a representative INSERT, UPDATE and DELETE on every policy-bearing table does and
// what search_students_page returns; applies migrations 131-135 (the files; the ledger stays at
// 130) and requires that only the receptionist observes a difference (the messages.channel column
// changes every reader's row digest of messages, not its count); then applies the restore script
// and requires the 130 catalogue and the same observations again.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';


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

{
  assert.equal(sql('select max(version) from supabase_migrations.schema_migrations'), '130', 'run on a database at migration 130');
  ok(sql("select to_regprocedure('operational_security.capability_roles()') is null"), '131 must not be applied yet');
  applyFile('scripts/test-speed-as-the-centre-grows-fixture.sql');

  // Every public table that carries a policy holds rows.
  const policyTables = json(`select jsonb_agg(distinct tablename order by tablename) from pg_policies where schemaname = 'public'`);
  const empty = json(`select coalesce(jsonb_agg(t), '[]') from jsonb_array_elements_text('${JSON.stringify(policyTables)}') t
    where not (xpath('/row/c/text()', query_to_xml(format('select count(*) > 0 as c from public.%I', t), false, true, '')))[1]::text::boolean`);
  ok(empty.length === 0, `every policy-bearing table is populated (empty: ${empty.join(', ')})`);

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


  for (const n of [131, 132, 133, 134, 135]) {
    const file = execFileSync('bash', ['-c', `ls supabase/migrations/${n}_*.sql`], { encoding: 'utf8' }).trim();
    applyFile(file);
  }
  const after = catalog();
  observe('after');
  const changed = differences('before', 'after');
  const byIdentity = {};
  for (const d of changed) (byIdentity[d.identity] ||= []).push(d);
  console.log('differences per identity:', Object.fromEntries(Object.entries(byIdentity).map(([k, v]) => [k, v.length])));
  // messages gains the channel column: its row digest changes for every identity that reads it; the count must not.
  const count = o => String(o || '').split(':')[0];
  const others = changed.filter(d => d.identity !== 'receptionist'
    && !(d.kind === 'read' && d.key === 'messages' && count(d.before) === count(d.after)));
  console.log('non-receptionist differences:', JSON.stringify(others, null, 1));
  console.log('receptionist differences:', JSON.stringify((byIdentity.receptionist || []).map(d => `${d.kind} ${d.key}: ${d.before} -> ${d.after}`), null, 1));
  ok(others.length === 0, 'only the receptionist observes a difference (and the messages.channel column)');
  for (const key of ['triggers', 'constraints', 'tables', 'columns', 'cron', 'indexes'])
    console.log(key, 'changed:', diffKeys(before[key], after[key]).join(', ') || 'none');
  applyFile('scripts/rollback/131_135_receptionist_permissions_restore.sql');
  const restored = catalog();
  const KEPT = [];
  const leftover = diffKeys(before, restored).flatMap(k => diffKeys(before[k], restored[k]).map(x => `${k}:${x}`)).filter(x => !KEPT.some(kept => x.endsWith(':' + kept)));
  ok(leftover.length === 0, `restore returns the 130 catalog except messages.channel: ${leftover.join(', ')}`);
  observe('restored');
  const back = differences('before', 'restored').filter(d => !(d.kind === 'read' && d.key === 'messages' && count(d.before) === count(d.after)));
  ok(back.length === 0, `no observation differs after the restore: ${JSON.stringify(back.slice(0, 5))}`);
  sql('drop schema scg_test cascade;');
  console.log(`PASS RPW equivalence 130 → 135 → restore (${checks} checks)`);
}
