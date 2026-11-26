// Destructive LOCAL synthetic upgrade rehearsal 140 → 142 (RWR-r5 follow-ups, owner approval
// of 2026-11-26). Run after `supabase db reset --local --version 140 --no-seed`:
//   1. seeds, at 140, an active prospect and a planned legacy placement test (no CRM link)
//      with a malformed time, and proves « Aujourd'hui » (crm_get_today) fails on it;
//   2. applies the 142 file (the ledger stays at 140) and proves no row changed, only the
//      two bodies and the expected grants changed (no policy or trigger), and the read
//      now answers;
//   3. the 140 restore refuses while 142 is applied; the 142 restore brings back exactly
//      the 140 functions and table privileges; a second run refuses;
//   4. applies 142 again on top of the restore: the same catalog as the first 142.
//   node scripts/test-rwr-follow-ups-142-upgrade.mjs
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { assertLocalStack } from './lib/local-stack.mjs';

const port = process.env.FOLLOW_UPS_UPGRADE_PORT || '54322';
assertLocalStack({ dbPort: port }); // follow-ups 142 (item 11): this checkout's stack only, before any statement
const psql = (args, input = '', ok = true) => {
  try {
    const out = execFileSync('psql', ['-X', '-qAt', '-h', '127.0.0.1', '-p', port, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', ...args],
      { input, encoding: 'utf8', env: { ...process.env, PGPASSWORD: 'postgres' }, maxBuffer: 64 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    if (!ok) assert.fail('expected a refusal, the statement succeeded');
    return out;
  } catch (error) {
    if (ok || error.code === 'ERR_ASSERTION') throw error;
    return String(error.stderr || error.message);
  }
};
const sql = input => psql([], input);
const fails = input => psql([], input, false);
const json = input => JSON.parse(sql(input));
const MIGRATION = (() => {
  const file = execFileSync('ls', ['supabase/migrations'], { encoding: 'utf8' }).split('\n').find(f => /^\d{3}_rwr_follow_ups\.sql$/.test(f));
  assert.ok(file, 'the follow-ups migration file');
  return `supabase/migrations/${file}`;
})();
const RESTORE = MIGRATION.replace('supabase/migrations/', 'scripts/rollback/').replace('.sql', '_restore.sql');
assert.equal(sql('select max(version) from supabase_migrations.schema_migrations'), '140', 'run on a database at migration 140');

const catalog = () => json(`select jsonb_build_object(
 'functions',(select jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_array(md5(p.prosrc),p.prosecdef,p.provolatile,p.proconfig,p.proowner::regrole::text,p.proacl::text)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname not in ('pg_catalog','information_schema') and not exists (select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')),
 'relations',(select jsonb_object_agg(relnamespace::regnamespace::text||'.'||relname,jsonb_build_array(relkind,relrowsecurity,relforcerowsecurity,relacl::text)) from pg_class where relkind in ('r','p','v','m') and relnamespace in ('public'::regnamespace,'crm_security'::regnamespace)),
 'policies',(select jsonb_object_agg(schemaname||'.'||tablename||'.'||policyname,to_jsonb(p)) from pg_policies p),
 'triggers',(select jsonb_object_agg(c.relname||'.'||t.tgname,jsonb_build_array(t.tgenabled,pg_get_triggerdef(t.oid))) from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace='public'::regnamespace and not t.tgisinternal))::text`);
const diff = (a, b) => [...new Set([...Object.keys(a || {}), ...Object.keys(b || {})])].filter(k => JSON.stringify(a?.[k]) !== JSON.stringify(b?.[k])).sort();
const hashes = () => Object.fromEntries(['students', 'crm_contacts', 'crm_leads', 'crm_tasks', 'placement_tests', 'enrollments', 'receipts', 'charges'].map(t =>
  [t, sql(`select count(*)||':'||md5(coalesce(string_agg(to_jsonb(x)::text,'' order by to_jsonb(x)::text),'')) from public.${t} x`)]));

const staff = n => `f1420000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const as = (who, body) => `begin; select set_config('request.jwt.claim.sub','${who}',true); ${body}; commit;`;
const today = reception => fails(as(reception, `set local role authenticated; select public.crm_get_today(30,0,0)`));

// 1. Seed at 140 (synthetic; invented numbers only).
sql(`insert into auth.users(id,email,aud,role,created_at,updated_at) values
 ('${staff(1)}','upg142-director@example.invalid','authenticated','authenticated',now(),now()),
 ('${staff(3)}','upg142-reception@example.invalid','authenticated','authenticated',now(),now());
 update public.profiles set role='director',full_name='Upgrade director' where id='${staff(1)}';
 update public.profiles set role='receptionist',full_name='Upgrade reception' where id='${staff(3)}';`);
const hours = Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map(d => [d, [['09:00', '20:00']]]));
sql(as(staff(1), `select public.crm_create_followup_policy(gen_random_uuid(),'${JSON.stringify({ weekly_hours: hours, attempt_offsets: [0, 0, 1, 3, 5] })}'::jsonb)`));
sql(as(staff(3), `select public.crm_create_prospect(gen_random_uuid(),'{"display_name":"Upgrade aujourd''hui","learner_name":"Upgrade apprenant","phone":"0612142001","source_label":"Manuel · Appel entrant"}'::jsonb)`));
sql(`insert into public.placement_tests(id,student_name,date_test,heure,status,crm_lead_id)
 values('f1420000-0000-4000-8000-0000000000b1','Test ancien','${sql(`select (now() at time zone public.centre_utc_offset())::date`)}','10h','Planifié',null)`);
assert.match(today(staff(3)), /invalid input syntax for type time/, 'at 140, a malformed legacy time fails « Aujourd\'hui »');
assert.equal(sql(`select has_function_privilege('authenticated','public.crm_create_manual_lead(uuid,jsonb)','execute')||'|'||has_function_privilege('service_role','public.get_catalogue()','execute')||'|'||has_table_privilege('anon','public.students','delete')`),
  'true|true|true', 'at 140: the grants 142 removes are present');
const before = catalog(), rows = hashes();
console.log('PASS 140: a planned legacy test with a malformed time fails crm_get_today');

// 2. Apply 142 (the file only; the ledger stays).
psql(['-1', '-f', MIGRATION]);
assert.equal(sql('select max(version) from supabase_migrations.schema_migrations'), '140', 'the file only, the ledger stays');
assert.deepEqual(hashes(), rows, '142 writes no row');
const after = catalog();
assert.deepEqual(diff(before.policies, after.policies), [], 'no policy changed');
assert.deepEqual(diff(before.triggers, after.triggers), [], 'no trigger changed');
assert.deepEqual(diff(before.functions, after.functions), [
  'catalogue_save_programme(text,bigint,jsonb)',
  'catalogue_set_price(text,text,numeric,text,uuid)',
  'crm_create_manual_lead(uuid,jsonb)',
  'crm_get_today(integer,integer,integer)',
  'crm_security.evaluate_conversion(uuid,timestamp with time zone,text,text)',
  'get_catalogue()'].sort(), 'only the two bodies and four function grants change');
assert.deepEqual(diff(before.relations, after.relations), ['activity_log', 'announcements', 'anon_rate_limits', 'app_config', 'assessments', 'attendance',
  'authorized_adults', 'certificates', 'charge_balances', 'dismissal_logs', 'enrollments', 'groups', 'learning_assessments', 'leave_requests',
  'legacy_receipt_reconciliation', 'messages', 'notifications', 'payroll', 'portfolios', 'premium_attendance', 'premium_group_memberships', 'premium_groups',
  'premium_homework_submissions', 'premium_sessions', 'students', 'teachers'].map(t => `public.${t}`), 'only the 24 tables and 2 views change privileges');
assert.equal(after.relations['public.placement_tests'][3], before.relations['public.placement_tests'][3], 'placement_tests (137) unchanged');
assert.ok(JSON.parse(sql(as(staff(3), `set local role authenticated; select public.crm_get_today(30,0,0)::text`)).split('\n').at(-1)).needs_attention, 'the read answers on 142');
console.log('PASS 140 → 142: no row written, no policy or trigger changed, two bodies and the expected grants only; « Aujourd\'hui » answers');

// 3. Restore order, then the restore.
assert.match(fails(readFileSync('scripts/rollback/140_catalogues_restore.sql', 'utf8')), /migration 142 is applied; run scripts\/rollback\/142_rwr_follow_ups_restore\.sql first/, '140 restore refuses while 142 is applied');
sql(readFileSync(RESTORE, 'utf8'));
const restored = catalog();
for (const part of ['functions', 'relations', 'policies', 'triggers']) assert.deepEqual(diff(before[part], restored[part]), [], `${part}: back to 140`);
assert.deepEqual(hashes(), rows, 'the restore writes no row');
assert.match(fails(readFileSync(RESTORE, 'utf8')), /migration 142 is not applied/, 'a second restore refuses');
console.log('PASS restore 142: the 140 functions, grants and table privileges exactly; second run refused');

// 4. Re-apply after the restore.
psql(['-1', '-f', MIGRATION]);
const reapplied = catalog();
for (const part of ['functions', 'relations', 'policies', 'triggers']) assert.deepEqual(diff(after[part], reapplied[part]), [], `${part}: the re-applied 142 equals the first one`);
console.log('PASS re-apply 142 after its restore: same catalog as the first 142');
