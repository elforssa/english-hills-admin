// Local synthetic 129→130 stateful upgrade (online session evidence, plan ORR-r2, webhook
// PR). Run after `supabase db reset --local --version 129 --no-seed`:
//   1. seeds, as the owner, one active online course with one lesson, one pass and one
//      join event recorded under the 129 definitions;
//   2. fingerprints the catalog and every public row, applies the 130 file directly (the
//      ledger stays at 129; `supabase migration up` would also apply any later file);
//   3. proves that online_record_join_event and online_get_course differ from their
//      previous bodies by exactly the intended lines (same signature, posture, owner and
//      grants); that exactly five public functions (two service role only, two
//      authenticated only, one with no API grant) and one private helper are added; that
//      exactly two tables (row security on, no API grant), their constraints and three
//      indexes (one on online_join_events) are added, plus the one monthly purge job; that
//      nothing else in the catalog moved and no existing row changed;
//   4. proves that the old row is still read, the old application calls keep their
//      signatures, then runs the rollback-only SQL acceptance on the upgraded state. The
//      acceptance suite is the current one, so any later migration file (131 onward) is
//      applied first, after the 130 proofs (RWR-r5 C2: 141 changes the online-group rules).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';

const port = process.env.OL_UPGRADE_PORT || '54322';
const psql = (args, input) => execFileSync('psql', ['-X', '-h', '127.0.0.1', '-p', port, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', ...args],
  { input, encoding: 'utf8', env: { ...process.env, PGPASSWORD: 'postgres' }, maxBuffer: 64 * 1024 * 1024 });
const sql = input => psql(['-qAt'], input).trim();
assert.equal(sql('select max(version) from supabase_migrations.schema_migrations'), '129', 'run on a database at migration 129');

const RECREATED = ['public.online_record_join_event(uuid,text,timestamp with time zone,text)', 'public.online_get_course(uuid,uuid)'];
const ADDED_PUBLIC = {
  'online_record_session_event(uuid,text,text,timestamp with time zone,text,text)': [true, 'v', '{postgres=X/postgres,service_role=X/postgres}'],
  'online_note_webhook_refusal(text,text)': [true, 'v', '{postgres=X/postgres,service_role=X/postgres}'],
  'online_usage_month(date)': [true, 's', '{postgres=X/postgres,authenticated=X/postgres}'],
  'online_room_status(text)': [true, 's', '{postgres=X/postgres,authenticated=X/postgres}'],
  'online_purge_session_evidence()': [false, 'v', '{postgres=X/postgres}'],
};
const ADDED_PRIVATE = 'online_security.evidence_ceiling_reached()';
const NEW_TABLES = ['public.online_session_events', 'public.online_webhook_refusals'];
const NEW_INDEXES = ['public.online_join_events_received_idx', 'public.online_session_events_received_idx',
  'public.online_session_events_pkey', 'public.online_session_events_once_key', 'public.online_webhook_refusals_pkey'];

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
// RWR-r5 C2 (141): a later migration applied for the acceptance adds groups.class_days, NULL on
// existing rows; it is left out of the groups hash and checked empty on the old group.
const data = () => Object.fromEntries(tables.map(table => {
  assert(/^[a-z_0-9]+$/.test(table));
  const row = table === 'groups' ? `(to_jsonb(t) - 'class_days')` : 'to_jsonb(t)';
  return [table, sql(`select count(*)||':'||md5(coalesce(string_agg(${row}::text,'' order by ${row}::text),'')) from public.${table} t`)];
}));

// 1. State on 129: one active course, one lesson, one pass and one join event.
const id = n => `13000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
sql(`insert into public.teachers(id, full_name, email, contract_type) values ('${id(1)}', 'Sara Upgrade', 'owe-upgrade-teacher@example.test', 'Freelance');
  insert into public.groups(id, name, session_type, niveau) values ('${id(2)}', 'OWE upgrade', 'Online', 'B1');
  insert into public.online_courses(group_id, teacher_id, audience, capacity, status, provider, provider_room_ref, term_start, term_end)
    values ('${id(2)}', '${id(1)}', 'adult', 8, 'active', 'fake', 'fake-room-owe130', current_date - 1, current_date + 30);
  insert into public.online_lessons(id, group_id, starts_at, ends_at, teacher_id) values ('${id(3)}', '${id(2)}', now() - interval '20 minutes', now() + interval '40 minutes', '${id(1)}');
  insert into public.online_join_tokens(id, jti, lesson_id, participant_kind, teacher_id, profile_id, display_label, expires_at, provider)
    values ('${id(4)}', '${id(5)}', '${id(3)}', 'host', '${id(1)}', '${id(6)}', 'Sara U.', now() + interval '50 minutes', 'fake');`);
const recordedOn129 = JSON.parse(sql(`begin; set local role service_role; select public.online_record_join_event('${id(5)}', 'joined', now() - interval '10 minutes')::text; commit;`).split('\n').find(line => line.startsWith('{')));
assert.equal(recordedOn129.recorded, true, 'a join event recorded under 129');

// 2. Fingerprint, then apply the file.
const before = catalog(), beforeData = data();
const beforeDefinitions = Object.fromEntries(RECREATED.map(name => [name, definition(name)]));
for (const name of Object.keys(ADDED_PUBLIC)) assert(!(name in before.functions), `${name} absent at 129`);
for (const table of NEW_TABLES) assert(!(table in before.tables), `${table} absent at 129`);
sql(readFileSync('supabase/migrations/130_online_session_evidence.sql', 'utf8'));
assert.equal(sql('select max(version) from supabase_migrations.schema_migrations'), '129', 'the file alone does not touch the ledger');
const after = catalog();

// 3a. The two re-created bodies: exactly the intended lines, nothing else.
const lineDiff = (a, b) => ({ removed: a.filter(line => !b.includes(line)), added: b.filter(line => !a.includes(line)) });
const record = lineDiff(beforeDefinitions[RECREATED[0]], definition(RECREATED[0]));
assert.deepEqual(record.removed, [], 'online_record_join_event: no line removed');
assert.deepEqual(record.added.map(l => l.trim()), [
  '-- 130: at most 600 evidence rows received in any 60 seconds (plan ORR-r2, N8).',
  'if online_security.evidence_ceiling_reached() then',
  'perform online_security.fail(\'rate_limited\', \'53400\', \'Trop d’événements reçus.\');'], 'online_record_join_event: the write ceiling, nothing else');
assert.equal(definition(RECREATED[0]).length, beforeDefinitions[RECREATED[0]].length + 4, 'online_record_join_event: four lines added (comment, if, fail, end if)');
const course = lineDiff(beforeDefinitions[RECREATED[1]], definition(RECREATED[1]));
assert.deepEqual(course.removed.map(l => l.trim()), [
  'where t.lesson_id = l.id and t.student_id = m.student_id and ev.kind = \'joined\'))'], 'online_get_course: only the closing line of joined_at is replaced');
assert.deepEqual(course.added.map(l => l.trim()), [
  'where t.lesson_id = l.id and t.student_id = m.student_id and ev.kind = \'joined\'),',
  '-- 130: the last leave the provider reported (evidence only, never attendance).',
  '\'left_at\', (select max(ev.at) from public.online_join_events ev join public.online_join_tokens t on t.id = ev.token_id',
  'where t.lesson_id = l.id and t.student_id = m.student_id and ev.kind = \'left\'))'], 'online_get_course: left_at beside joined_at, nothing else');
assert.equal(definition(RECREATED[1]).length, beforeDefinitions[RECREATED[1]].length + 3, 'online_get_course: three lines added');
for (const name of RECREATED) {
  const key = name.replace(/^public\./, '');
  assert.notEqual(after.functions[key][0], before.functions[key][0], `${name}: body changed`);
  assert.deepEqual(after.functions[key].slice(1), before.functions[key].slice(1), `${name}: same posture, search_path, owner, grants, return type and arguments`);
  after.functions[key] = before.functions[key];
}
assert.deepEqual(before.functions['online_record_join_event(uuid,text,timestamp with time zone,text)'].slice(1, 6), [true, 'v', ['search_path=pg_catalog, pg_temp'], 'postgres', '{postgres=X/postgres,service_role=X/postgres}']);
assert.deepEqual(before.functions['online_get_course(uuid,uuid)'].slice(1, 6), [true, 's', ['search_path=pg_catalog, pg_temp'], 'postgres', '{postgres=X/postgres,authenticated=X/postgres}']);

// 3b. Added functions with their exact posture.
for (const [name, [definer, volatility, acl]] of Object.entries(ADDED_PUBLIC)) {
  assert(name in after.functions, `${name} added`);
  assert.deepEqual(after.functions[name].slice(1, 7), [definer, volatility, ['search_path=pg_catalog, pg_temp'], 'postgres', acl, 'jsonb'], `${name}: posture and grants`);
  delete after.functions[name];
}
assert.deepEqual(after.functions[ADDED_PRIVATE].slice(1, 7), [false, 's', ['search_path=pg_catalog, pg_temp'], 'postgres', '{postgres=X/postgres}', 'boolean'], 'private helper: no API grant');
delete after.functions[ADDED_PRIVATE];

// 3c. Two tables with row security and no API grant; their columns and constraints; the indexes; the job.
for (const table of NEW_TABLES) {
  assert.deepEqual(after.tables[table], [true, false, '{postgres=arwdDxtm/postgres}'], `${table}: row security on, no API grant`);
  delete after.tables[table];
  for (const column of Object.keys(after.columns).filter(c => c.startsWith(`${table}.`))) delete after.columns[column];
  for (const constraint of Object.keys(after.constraints).filter(c => c.startsWith(`${table.replace(/^public\./, '')}.`))) delete after.constraints[constraint];
}
for (const index of NEW_INDEXES) { assert(index in after.indexes && !(index in before.indexes), `${index} added`); delete after.indexes[index]; }
const NEW_TABLE_NAMES = ['online_session_events', 'online_webhook_refusals'];
assert.ok(!after.privileges.some(([, table, grantee]) => NEW_TABLE_NAMES.includes(table) && grantee !== 'postgres'), 'no API role holds a table grant on the new tables');
after.privileges = after.privileges.filter(([, table]) => !NEW_TABLE_NAMES.includes(table));
const job = after.jobs.find(([name]) => name === 'online-evidence-purge');
assert.deepEqual(job, ['online-evidence-purge', '17 3 1 * *', 'select public.online_purge_session_evidence()', true], 'the monthly purge job');
after.jobs = after.jobs.filter(([name]) => name !== 'online-evidence-purge');
assert.deepEqual(after, before, 'nothing else in the catalog changed: no other table, column, constraint, index, policy, trigger, grant, job or function');
assert.deepEqual(data(), beforeData, 'no existing row rewritten');

// 4. The old row is read through the new course read; the old calls keep their signatures.
assert.ok(['online_record_join_event(uuid,text,timestamp with time zone,text)', 'online_get_course(uuid,uuid)', 'online_check_pass(uuid)', 'online_confirm_pass(uuid)',
  'online_issue_join(uuid,uuid)', 'online_resolve_join(uuid)'].every(f => f in after.functions), 'the calls of the code already deployed exist with the same signatures');
const oldAt = sql(`select at from public.online_join_events where token_id = '${id(4)}'`);
const replay = JSON.parse(sql(`begin; set local role service_role; select public.online_record_join_event('${id(5)}', 'joined', '${oldAt}')::text; rollback;`).split('\n').find(line => line.startsWith('{')));
assert.equal(replay.recorded, false, 'the old event is still the unique row: a replay writes nothing');
// The current acceptance suite needs every later migration: apply them after the proofs.
for (const file of readdirSync('supabase/migrations').filter(name => /^\d{3}_.*\.sql$/.test(name) && Number(name.slice(0, 3)) > 130).sort()) {
  sql(readFileSync(`supabase/migrations/${file}`, 'utf8'));
}
const acceptance = psql(['-q', '-f', 'scripts/test-online-learning.sql']);
assert.match(acceptance, /PASS online learning SQL acceptance/);
assert.deepEqual(data(), beforeData, 'the acceptance left no row');
assert.equal(sql(`select (class_days is null)::text from public.groups where id='${id(2)}'`), 'true', 'the old group has no class days');
sql(`delete from public.online_join_events where token_id='${id(4)}'; delete from public.online_join_tokens where id='${id(4)}'; delete from public.online_lessons where id='${id(3)}';
  delete from public.online_courses where group_id='${id(2)}'; delete from public.groups where id='${id(2)}'; delete from public.teachers where id='${id(1)}';`);
console.log(`PASS stateful 129→130 (online session evidence): two bodies differ by exactly their intended lines with posture and grants intact, five public functions and one private helper added with their exact grants, two tables with row security and no API grant, three indexes, the monthly purge job, ${tables.length} table hashes unchanged, the old event kept and replay-safe, acceptance green on the upgraded state`);
