// Local synthetic 116→117 stateful upgrade (online learning pilot, plan OL-r4). Run after
// `supabase db reset --local --version 116 --no-seed`, once per landing order with the
// retired-workshop removal release (stop condition S4):
//   node scripts/test-online-learning-upgrade.mjs online-first
//     seeds a workshop-homework notification on 116, applies the 117 file directly (the
//     ledger stays at 116; `supabase migration up` would also apply later files), proves
//     the unchanged-from-112 and unchanged-from-096 one-line diffs with identical
//     signature, owner, security mode, search path and privileges, the verbatim
//     notification carry-over, that no existing row is rewritten and that nothing else in
//     the catalog changed; then rehearses the removal release rebuilding the constraint
//     from the then-current list afterwards (S4 a);
//   node scripts/test-online-learning-upgrade.mjs release-b-first
//     first rebuilds the constraint without the workshop type, as the removal release
//     would, seeds an ordinary notification, applies 117 and proves the post-removal list
//     plus the two online types (S4 b).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const mode = process.argv[2];
assert(['online-first', 'release-b-first'].includes(mode), 'usage: online-first | release-b-first');
const port = process.env.OL_UPGRADE_PORT || '54322';
const sql = input => execFileSync('psql', ['-X', '-qAt', '-h', '127.0.0.1', '-p', port, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
  { input, encoding: 'utf8', env: { ...process.env, PGPASSWORD: 'postgres' }, maxBuffer: 64 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const json = input => JSON.parse(sql(input));
assert.equal(sql('select max(version) from supabase_migrations.schema_migrations'), '116');
assert.equal(sql("select count(*) from pg_namespace where nspname='online_security'"), '0');

const WORKSHOP_TYPE = 'premium_homework';
const RECREATED = {
  crm: 'public.crm_start_enrollment(uuid,jsonb)',
  helper: 'operational_security.valid_session_level(text,text)',
  command: 'public.save_receptionist_enrollment(uuid,uuid,uuid,text,text,date,text,text,text)',
};
const VOCABULARY = ['groups.groups_session_type_check', 'students.students_session_type_check', 'enrollments.enrollments_session_type_check',
  'charges.charges_session_type_check', 'receipts.receipts_session_type_check', 'notifications.notifications_type_check'];
const definition = name => sql(`select pg_get_functiondef('${name}'::regprocedure)`);
const security = name => json(`select jsonb_build_object('identity',p.oid::regprocedure::text,'args',pg_get_function_arguments(p.oid),
  'result',pg_get_function_result(p.oid),'secdef',p.prosecdef,'volatile',p.provolatile,'config',p.proconfig,'owner',p.proowner::regrole::text,
  'acl',p.proacl::text,'language',l.lanname,'privileges',(select coalesce(jsonb_agg(jsonb_build_array(r.grantee,r.privilege_type,r.is_grantable)
    order by r.grantee,r.privilege_type),'[]') from information_schema.routine_privileges r where r.specific_schema=n.nspname and r.specific_name=p.proname||'_'||p.oid))
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang where p.oid='${name}'::regprocedure`);
const constraintValues = () => sql(`select pg_get_constraintdef(oid) from pg_constraint where conname='notifications_type_check'`)
  .match(/'([a-z_]+)'::text/g).map(v => v.slice(1, -7));
// The removal release's own rebuild: the then-current list without the workshop type.
const rebuildWithout = removed => `do $$ declare v text[]; begin
  select array_agg(m.v[1] order by m.n) into v from pg_constraint c,
    regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''::text', 'g') with ordinality as m(v, n)
  where c.conname = 'notifications_type_check';
  alter table public.notifications drop constraint notifications_type_check;
  execute format('alter table public.notifications add constraint notifications_type_check check (type in (%s))',
    (select string_agg(quote_literal(x), ',' order by i) from unnest(v) with ordinality as u(x, i) where x <> '${removed}'));
end $$;`;
// The whole catalog outside the objects this migration may touch, plus every row.
const catalog = () => json(`select jsonb_build_object(
  'functions',(select jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_array(md5(p.prosrc),p.prosecdef,p.provolatile,p.proconfig,p.proowner::regrole::text,p.proacl::text))
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','crm_security','role_security','operational_security','storage_security')),
  'tables',(select jsonb_object_agg(relname,jsonb_build_array(relrowsecurity,relforcerowsecurity,relacl::text)) from pg_class where relnamespace='public'::regnamespace and relkind in ('r','v')),
  'columns',(select jsonb_object_agg(table_name||'.'||column_name,jsonb_build_array(data_type,is_nullable,column_default)) from information_schema.columns where table_schema='public'),
  'constraints',(select jsonb_object_agg(conrelid::regclass::text||'.'||conname,pg_get_constraintdef(oid)) from pg_constraint where connamespace='public'::regnamespace),
  'indexes',(select jsonb_object_agg(indexname,indexdef) from pg_indexes where schemaname='public'),
  'policies',(select jsonb_object_agg(schemaname||'.'||tablename||'.'||policyname,jsonb_build_array(permissive,roles,cmd,qual,with_check)) from pg_policies),
  'triggers',(select jsonb_object_agg(tgrelid::regclass::text||'.'||tgname,pg_get_triggerdef(oid)) from pg_trigger where not tgisinternal),
  'schemas',(select jsonb_object_agg(nspname,nspacl::text) from pg_namespace where nspname not like 'pg_%'))`);
const tables = sql(`select string_agg(relname,' ' order by relname) from pg_class where relnamespace='public'::regnamespace and relkind='r'`).split(' ');
const data = () => Object.fromEntries(tables.map(table => {
  assert(/^[a-z_0-9]+$/.test(table));
  return [table, sql(`select count(*)||':'||md5(coalesce(string_agg(to_jsonb(t)::text,'' order by to_jsonb(t)::text),'')) from public.${table} t`)];
}));
const isNew = key => /(^|[.( ])online_/.test(key) || key.startsWith('online_security') || key.includes('online_security.');

// State on 116 for the chosen landing order.
if (mode === 'online-first') {
  sql(`insert into public.notifications(type,recipient_email,subject,message) values ('${WORKSHOP_TYPE}','upgrade-${mode}@example.test','Devoir','Synthetic')`);
} else {
  sql(rebuildWithout(WORKSHOP_TYPE));
  sql(`insert into public.notifications(type,recipient_email,subject,message) values ('general','upgrade-${mode}@example.test','Info','Synthetic')`);
}
const beforeValues = constraintValues();
assert.equal(beforeValues.includes(WORKSHOP_TYPE), mode === 'online-first');
const beforeDefinitions = Object.fromEntries(Object.entries(RECREATED).map(([k, name]) => [k, definition(name)]));
const beforeSecurity = Object.fromEntries(Object.entries(RECREATED).map(([k, name]) => [k, security(name)]));
const beforeCatalog = catalog(), beforeData = data();

sql(readFileSync('supabase/migrations/117_online_learning_pilot.sql', 'utf8'));
assert.equal(sql('select max(version) from supabase_migrations.schema_migrations'), '116', 'the file was applied directly; the ledger is the release task');

// Unchanged-from-112 and unchanged-from-096: exactly one changed line each, the programme
// list, gaining both values and nothing else; identical signature, owner, mode, search path, grants.
for (const [key, name] of Object.entries(RECREATED)) {
  const before = beforeDefinitions[key].split('\n'), after = definition(name).split('\n');
  assert.equal(after.length, before.length, `${name}: same line count`);
  const changed = after.map((line, i) => line === before[i] ? null : i).filter(i => i !== null);
  assert.equal(changed.length, 1, `${name}: exactly one changed line`);
  const [line] = changed;
  assert.match(before[line], /'Mise à niveau','Other'/, `${name}: the changed line is the programme list`);
  assert.ok(after[line].includes("'Online','Online One-to-One'"), `${name}: both online values`);
  assert.equal(after[line].replace(",'Online','Online One-to-One'", ''), before[line], `${name}: nothing else on that line`);
  assert.deepEqual(security(name), beforeSecurity[key], `${name}: identical signature, owner, security mode, search path and privileges`);
}
assert.equal(beforeSecurity.helper.acl, '{postgres=X/postgres}', 'helper stays non-executable by every API role');
assert.equal(beforeSecurity.helper.secdef, false); assert.equal(beforeSecurity.helper.volatile, 'i');
assert.equal(beforeSecurity.command.acl, '{postgres=X/postgres,authenticated=X/postgres}');
assert.equal(beforeSecurity.crm.acl, '{postgres=X/postgres,authenticated=X/postgres}');

// Verbatim notification carry-over plus the two online types; no existing row rewritten.
assert.deepEqual(constraintValues(), [...beforeValues, 'online_lesson_cancelled', 'online_lesson_rescheduled']);
const afterData = data();
assert.deepEqual(tables.filter(t => afterData[t] !== beforeData[t]), [], 'no existing row rewritten');
sql(`begin; insert into public.notifications(type,recipient_email,subject,message) values
  ('online_lesson_cancelled','a@example.test','s','m'),('online_lesson_rescheduled','b@example.test','s','m'); rollback;`);
// The five course-type constraints: previous list plus both values at the end.
const afterCatalog = catalog();
for (const key of VOCABULARY.filter(k => !k.startsWith('notifications'))) {
  const [before, after] = [beforeCatalog.constraints[key], afterCatalog.constraints[key]];
  assert.equal(after, before.replace(/'(Other|Legacy)'::text\]/, (_, last) => `'${last}'::text, 'Online'::text, 'Online One-to-One'::text]`), `${key} extended only`);
}
// Nothing else changed: every other body, grant, policy, trigger, index, column, constraint and schema.
const strip = (c, skipKeys) => Object.fromEntries(Object.entries(c).map(([section, value]) => [section,
  Object.fromEntries(Object.entries(value || {}).filter(([k]) => !isNew(k) && !skipKeys.includes(k)))]));
const skip = [...Object.values(RECREATED).map(name => name.replace(/^public\./, '')), ...VOCABULARY];
const [kept, base] = [strip(afterCatalog, skip), strip(beforeCatalog, skip)];
const drift = Object.keys(base).flatMap(section => [...new Set([...Object.keys(base[section]), ...Object.keys(kept[section])])]
  .filter(k => JSON.stringify(base[section][k]) !== JSON.stringify(kept[section][k])).map(k => `${section}:${k}`));
assert.deepEqual(drift, [], 'catalog unchanged outside the declared objects');
const added = Object.keys(afterCatalog.functions).filter(k => !(k in beforeCatalog.functions));
assert.ok(added.length === 23 && added.every(isNew), `only the 23 public online functions are added (${added.length})`);
assert.equal(sql(`select count(*) from pg_proc where pronamespace='online_security'::regnamespace`), '31', 'private online helpers');
assert.ok(Object.keys(afterCatalog.triggers).filter(k => !(k in beforeCatalog.triggers)).every(k =>
  ['groups.online_group_guard', 'enrollments.online_enrollment_capacity', 'online_courses.online_course_group_guard'].includes(k) || k.startsWith('online_')),
  'the three new triggers on existing tables, plus online-table internals only');
assert.equal(sql(`select count(*) from information_schema.routine_privileges where routine_schema='online_security' and grantee<>'postgres'`), '0');
// The migration's own scoped scan and teacher assertion re-run cleanly.
assert.equal(sql(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where (n.nspname='online_security' or p.proname like 'online\\_%') and p.prosrc ilike '%prem'||'ium%'`), '0');

if (mode === 'online-first') {
  assert.equal(sql(`select count(*) from public.notifications where type='${WORKSHOP_TYPE}'`), '1', 'the seeded workshop row survives');
  // S4 (a): the removal release, landing second, rebuilds from the then-current list.
  sql(`begin;
    delete from public.notifications where type='${WORKSHOP_TYPE}';
    ${rebuildWithout(WORKSHOP_TYPE)}
    insert into public.notifications(type,recipient_email,subject,message) values ('online_lesson_cancelled','c@example.test','s','m'),
      ('online_lesson_rescheduled','d@example.test','s','m');
    rollback;`);
} else {
  assert.ok(!constraintValues().includes(WORKSHOP_TYPE), 'the post-removal list is copied without the workshop type');
  assert.equal(sql(`select count(*) from public.notifications where type='general' and recipient_email='upgrade-${mode}@example.test'`), '1');
  assert.throws(() => sql(`insert into public.notifications(type,recipient_email,subject,message) values ('${WORKSHOP_TYPE}','d@example.test','s','m')`),
    /notifications_type_check/);
}
console.log(`PASS stateful 116→117 (${mode}): three re-created functions differ by exactly their programme line with identical security and privileges, five vocabulary constraints extended only, notifications_type_check = previous list + 2 online types, ${tables.length} table hashes unchanged, catalog unchanged outside ${added.length} new online functions and the declared objects`);
