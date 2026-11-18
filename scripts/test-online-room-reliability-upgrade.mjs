// Local synthetic 128→129 stateful upgrade (online room reliability, plan ORR-r2,
// reliability PR). Run after `supabase db reset --local --version 128 --no-seed`:
//   1. seeds, as the owner, one active online course with one lesson and one pass issued
//      under the 128 definitions (no provider, no superseded mark exist yet);
//   2. fingerprints the catalog and every public row, applies the 129 file directly (the
//      ledger stays at 128; `supabase migration up` would also apply any later file);
//   3. proves that online_issue_join and online_resolve_join differ from their 117 bodies
//      by exactly the intended lines (same signature, posture, owner and grants), that
//      exactly two public functions (authenticated only) and one private helper (no
//      API grant) are added, that online_join_tokens gains exactly two nullable columns
//      and two checks, that nothing else in the catalog moved and that no existing row
//      changed (the two new columns are empty on the old pass);
//   4. proves that the old pass still resolves (an empty provider reads as the course's)
//      and the old application calls keep their signatures, then runs the rollback-only
//      SQL acceptance on the upgraded state.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const port = process.env.OL_UPGRADE_PORT || '54322';
const psql = (args, input) => execFileSync('psql', ['-X', '-h', '127.0.0.1', '-p', port, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', ...args],
  { input, encoding: 'utf8', env: { ...process.env, PGPASSWORD: 'postgres' }, maxBuffer: 64 * 1024 * 1024 });
const sql = input => psql(['-qAt'], input).trim();
assert.equal(sql('select max(version) from supabase_migrations.schema_migrations'), '128', 'run on a database at migration 128');

const RECREATED = ['public.online_issue_join(uuid,uuid)', 'public.online_resolve_join(uuid)'];
const ADDED_PUBLIC = ['online_check_pass(uuid)', 'online_confirm_pass(uuid)'];
const ADDED_PRIVATE = 'online_security.own_pass_state(uuid)';
const NEW_COLUMNS = ['public.online_join_tokens.superseded_at', 'public.online_join_tokens.provider'];
const NEW_CONSTRAINTS = ['online_join_tokens.online_join_tokens_provider_check', 'online_join_tokens.online_join_tokens_superseded_check'];

const definition = name => sql(`select pg_get_functiondef('${name}'::regprocedure)`).split('\n');
const catalog = () => JSON.parse(sql(`select jsonb_build_object(
 'functions',(select jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_array(md5(p.prosrc),p.prosecdef,p.provolatile,p.proconfig,p.proowner::regrole::text,p.proacl::text,p.prorettype::regtype::text,pg_get_function_arguments(p.oid))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname not in ('pg_catalog','information_schema') and not exists (select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')),
 'tables',(select jsonb_object_agg(relnamespace::regnamespace::text||'.'||relname,jsonb_build_array(relrowsecurity,relforcerowsecurity,relacl::text)) from pg_class where relkind in ('r','v') and relnamespace not in ('pg_catalog'::regnamespace,'information_schema'::regnamespace)),
 'columns',(select jsonb_object_agg(table_schema||'.'||table_name||'.'||column_name,jsonb_build_array(data_type,is_nullable,column_default)) from information_schema.columns where table_schema not in ('pg_catalog','information_schema')),
 'constraints',(select jsonb_object_agg(conrelid::regclass::text||'.'||conname,pg_get_constraintdef(oid)) from pg_constraint where connamespace='public'::regnamespace),
 'indexes',(select jsonb_object_agg(schemaname||'.'||indexname,indexdef) from pg_indexes where schemaname not in ('pg_catalog','information_schema')),
 'policies',(select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname) from pg_policies p),
 'triggers',(select jsonb_agg(jsonb_build_array(c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid)) order by c.relname,t.tgname) from pg_trigger t join pg_class c on c.oid=t.tgrelid where not t.tgisinternal),
 'privileges',(select jsonb_agg(jsonb_build_array(table_schema,table_name,grantee,privilege_type) order by table_schema,table_name,grantee,privilege_type) from information_schema.role_table_grants where table_schema='public'),
 'jobs',(select jsonb_agg(jsonb_build_array(jobname,schedule,command,active) order by jobname) from cron.job))::text`));
const tables = sql("select tablename from pg_tables where schemaname='public' order by tablename").split('\n');
// Rows as they were: the two new columns of online_join_tokens are left out of its hash
// and checked empty separately.
const data = () => Object.fromEntries(tables.map(table => {
  assert(/^[a-z_0-9]+$/.test(table));
  const row = table === 'online_join_tokens' ? `(to_jsonb(t) - 'superseded_at' - 'provider')` : 'to_jsonb(t)';
  return [table, sql(`select count(*)||':'||md5(coalesce(string_agg(${row}::text,'' order by ${row}::text),'')) from public.${table} t`)];
}));

// 1. State on 128: one active course, one open lesson, one pass issued under 128.
const id = n => `12900000-0000-4000-8000-${String(n).padStart(12, '0')}`;
sql(`insert into public.teachers(id, full_name, email, contract_type) values ('${id(1)}', 'Sara Upgrade', 'orr-upgrade-teacher@example.test', 'Freelance');
  insert into public.groups(id, name, session_type, niveau) values ('${id(2)}', 'ORR upgrade', 'Online', 'B1');
  insert into public.online_courses(group_id, teacher_id, audience, capacity, status, provider, provider_room_ref, term_start, term_end)
    values ('${id(2)}', '${id(1)}', 'adult', 8, 'active', 'fake', 'fake-room-orr129', current_date - 1, current_date + 30);
  insert into public.online_lessons(id, group_id, starts_at, ends_at, teacher_id) values ('${id(3)}', '${id(2)}', now() + interval '5 minutes', now() + interval '65 minutes', '${id(1)}');
  insert into public.online_join_tokens(id, jti, lesson_id, participant_kind, teacher_id, profile_id, display_label, expires_at)
    values ('${id(4)}', '${id(5)}', '${id(3)}', 'host', '${id(1)}', '${id(6)}', 'Sara U.', now() + interval '75 minutes');`);
assert.deepEqual(Object.keys(JSON.parse(sql(`select to_jsonb(t)::text from public.online_join_tokens t where id='${id(4)}'`))).filter(k => ['superseded_at', 'provider'].includes(k)), [], 'no new column on 128');

// 2. Fingerprint, then apply the file.
const before = catalog(), beforeData = data();
const beforeDefinitions = Object.fromEntries(RECREATED.map(name => [name, definition(name)]));
for (const name of ADDED_PUBLIC) assert(!(name in before.functions), `${name} absent at 128`);
sql(readFileSync('supabase/migrations/129_online_room_reliability.sql', 'utf8'));
assert.equal(sql('select max(version) from supabase_migrations.schema_migrations'), '128', 'the file alone does not touch the ledger');
const after = catalog();

// 3a. The two re-created bodies: exactly the intended lines, nothing else.
const lineDiff = (a, b) => ({ removed: a.filter(line => !b.includes(line)), added: b.filter(line => !a.includes(line)) });
const issue = lineDiff(beforeDefinitions[RECREATED[0]], definition(RECREATED[0]));
assert.deepEqual(issue.removed.map(l => l.trim()), [
  'insert into public.online_join_tokens(lesson_id, participant_kind, student_id, teacher_id, profile_id, display_label, expires_at)',
  '(v->>\'expires_at\')::timestamptz)'], 'online_issue_join: only the insert column list and its last value line are replaced');
assert.deepEqual(issue.added.map(l => l.trim()), [
  '-- 129: issued_at after the lock (the order of issue), and the course\'s provider on the pass.',
  'insert into public.online_join_tokens(lesson_id, participant_kind, student_id, teacher_id, profile_id, display_label, expires_at, issued_at, provider)',
  '(v->>\'expires_at\')::timestamptz, clock_timestamp(), (select c.provider from public.online_lessons l join public.online_courses c on c.group_id = l.group_id where l.id = p_lesson))'],
'online_issue_join: issued_at from clock_timestamp() after the lock and the course\'s provider, nothing else');
const resolve = lineDiff(beforeDefinitions[RECREATED[1]], definition(RECREATED[1]));
assert.deepEqual(resolve.removed.map(l => l.trim()), [
  'select t.display_label, t.participant_kind, t.expires_at, t.revoked_at, t.issued_at, c.provider,',
  'c.provider_room_ref, c.status as course_status, l.status as lesson_status'], 'online_resolve_join: only the select list is replaced');
assert.deepEqual(resolve.added.map(l => l.trim()), [
  'select t.display_label, t.participant_kind, t.expires_at, t.revoked_at, t.issued_at, coalesce(t.provider, c.provider) as provider,',
  'c.provider_room_ref, c.status as course_status, l.status as lesson_status, t.superseded_at',
  '-- 129: a newer pass of the same person was confirmed inside the room.',
  'if found and r.revoked_at is null and r.superseded_at is not null then',
  'perform online_security.fail(\'superseded\', \'42501\', \'Accès au cours refusé.\');'], 'online_resolve_join: the pass\'s provider and the superseded refusal, nothing else');
// The set difference cannot see a repeated line: the counts close it (four lines added
// to resolve: comment, if, fail, end if; one to issue: the comment).
assert.equal(definition(RECREATED[1]).length, beforeDefinitions[RECREATED[1]].length + 4, 'online_resolve_join: four lines added');
assert.equal(definition(RECREATED[0]).length, beforeDefinitions[RECREATED[0]].length + 1, 'online_issue_join: one comment line added');
for (const name of RECREATED) {
  const key = name.replace(/^public\./, '');
  assert.notEqual(after.functions[key][0], before.functions[key][0], `${name}: body changed`);
  assert.deepEqual(after.functions[key].slice(1), before.functions[key].slice(1), `${name}: same posture, search_path, owner, grants, return type and arguments`);
  after.functions[key] = before.functions[key];
}
assert.deepEqual(before.functions['online_issue_join(uuid,uuid)'].slice(1, 6), [true, 'v', ['search_path=pg_catalog, pg_temp'], 'postgres', '{postgres=X/postgres,authenticated=X/postgres}']);
assert.deepEqual(before.functions['online_resolve_join(uuid)'].slice(1, 6), [true, 's', ['search_path=pg_catalog, pg_temp'], 'postgres', '{postgres=X/postgres,service_role=X/postgres}']);

// 3b. Added functions with their exact posture.
for (const name of ADDED_PUBLIC) {
  assert(name in after.functions, `${name} added`);
  assert.deepEqual(after.functions[name].slice(1, 7), [true, name === 'online_confirm_pass(uuid)' ? 'v' : 's', ['search_path=pg_catalog, pg_temp'], 'postgres',
    '{postgres=X/postgres,authenticated=X/postgres}', 'jsonb'], `${name}: security definer, fixed search_path, authenticated only`);
  delete after.functions[name];
}
assert.deepEqual(after.functions[ADDED_PRIVATE].slice(1, 7), [false, 's', ['search_path=pg_catalog, pg_temp'], 'postgres', '{postgres=X/postgres}', 'jsonb'], 'private helper: no API grant');
delete after.functions[ADDED_PRIVATE];

// 3c. Two nullable columns without default and two checks on online_join_tokens.
for (const column of NEW_COLUMNS) {
  assert.deepEqual(after.columns[column], [column.endsWith('provider') ? 'text' : 'timestamp with time zone', 'YES', null], `${column}: nullable, no default`);
  delete after.columns[column];
}
assert.equal(after.constraints[NEW_CONSTRAINTS[0]], "CHECK (((provider IS NULL) OR (provider ~ '^[a-z][a-z0-9-]{1,31}$'::text)))");
assert.equal(after.constraints[NEW_CONSTRAINTS[1]], 'CHECK (((superseded_at IS NULL) OR (superseded_at >= issued_at)))');
assert.equal(after.constraints[NEW_CONSTRAINTS[0]], before.constraints['online_courses.online_courses_provider_check'],
  'the same pattern check as the course column');
for (const name of NEW_CONSTRAINTS) delete after.constraints[name];
assert.deepEqual(after, before, 'nothing else in the catalog changed: no table, other column, constraint, index, policy, trigger, grant, job or function');
assert.deepEqual(data(), beforeData, 'no existing row rewritten');
assert.equal(sql(`select (superseded_at is null and provider is null)::text from public.online_join_tokens where id='${id(4)}'`), 'true', 'the old pass keeps both new columns empty');

// 4. The old pass still resolves, with the course's provider; the old calls keep their signatures.
const resolved = JSON.parse(sql(`begin; set local role service_role; select public.online_resolve_join('${id(5)}')::text; rollback;`).split('\n').find(line => line.startsWith('{')));
assert.equal(resolved.provider, 'fake', 'an old pass without provider reads as the course\'s');
assert.equal(resolved.room_ref, 'fake-room-orr129');
assert.ok(['online_check_join(uuid,uuid)', 'online_issue_join(uuid,uuid)', 'online_resolve_join(uuid)', 'online_record_join_event(uuid,text,timestamp with time zone,text)'].every(f => f in after.functions),
  'the calls of the code already deployed exist with the same signatures');
const acceptance = psql(['-q', '-f', 'scripts/test-online-learning.sql']);
assert.match(acceptance, /PASS online learning SQL acceptance/);
assert.deepEqual(data(), beforeData, 'the acceptance left no row');
sql(`delete from public.online_join_tokens where id='${id(4)}'; delete from public.online_lessons where id='${id(3)}';
  delete from public.online_courses where group_id='${id(2)}'; delete from public.groups where id='${id(2)}'; delete from public.teachers where id='${id(1)}';`);
console.log(`PASS stateful 128→129 (online room reliability): two bodies differ by exactly their intended lines with posture and grants intact, two authenticated functions and one private helper added, two nullable columns and two checks on online_join_tokens, ${tables.length} table hashes unchanged, the old pass resolves with the course's provider, acceptance green on the upgraded state`);
