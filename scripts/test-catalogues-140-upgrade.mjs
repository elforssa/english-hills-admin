// Destructive LOCAL synthetic upgrade rehearsal 139 → 140 (catalogues, plan RWR-r5 PR B2,
// M-B2). Run after `supabase db reset --local --version 139 --no-seed`:
//   1. seeds, at 139, prospects with a programme, one closed NOT_QUALIFIED « Doublon »
//      and a learner with an old « Comment connu le centre » answer;
//   2. applies the 140 file (the ledger stays at 139) and proves no existing row changed
//      (the new columns are null), the catalogues are seeded with no price (owner
//      decision replacing OD-16), the FK and closure checks are valid, and D4 is present
//      but neither run nor granted;
//   3. under 140, closes one prospect « Mauvais numéro » (NOT_QUALIFIED) and gives one an
//      online programme, both outside the 139 checks; the restore then brings the 139
//      bodies back with those checks NOT VALID (rows kept), keeps the additive tables
//      and columns, and a second run refuses;
//   4. applies 140 again on top of the restore: same catalog as the first 140; restores
//      again, so the lane ends on the 139 functions.
//   node scripts/test-catalogues-140-upgrade.mjs
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const port = process.env.CATALOGUES_UPGRADE_PORT || '54322';
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
const MIGRATION = 'supabase/migrations/140_catalogues.sql';
const RESTORE = 'scripts/rollback/140_catalogues_restore.sql';
assert.equal(sql('select max(version) from supabase_migrations.schema_migrations'), '139', 'run on a database at migration 139');

const catalog = () => json(`select jsonb_build_object(
 'functions',(select jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_array(md5(p.prosrc),p.prosecdef,p.provolatile,p.proconfig,p.proowner::regrole::text,p.proacl::text,p.prorettype::regtype::text)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname not in ('pg_catalog','information_schema') and not exists (select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')),
 'tables',(select jsonb_object_agg(relnamespace::regnamespace::text||'.'||relname,jsonb_build_array(relrowsecurity,relforcerowsecurity,relacl::text)) from pg_class where relkind='r' and relnamespace in ('public'::regnamespace,'crm_security'::regnamespace,'maintenance'::regnamespace)),
 'columns',(select jsonb_object_agg(table_schema||'.'||table_name||'.'||column_name,jsonb_build_array(data_type,is_nullable,column_default)) from information_schema.columns where table_schema in ('public','crm_security')),
 'constraints',(select jsonb_object_agg(conrelid::regclass::text||'.'||conname,pg_get_constraintdef(oid)) from pg_constraint where connamespace='public'::regnamespace),
 'indexes',(select jsonb_object_agg(schemaname||'.'||indexname,indexdef) from pg_indexes where schemaname in ('public','crm_security')),
 'policies',(select jsonb_object_agg(schemaname||'.'||tablename||'.'||policyname,to_jsonb(p)) from pg_policies p),
 'triggers',(select jsonb_object_agg(c.relname||'.'||t.tgname,jsonb_build_array(t.tgenabled,pg_get_triggerdef(t.oid))) from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace='public'::regnamespace and not t.tgisinternal))::text`);
const diff = (a, b) => [...new Set([...Object.keys(a || {}), ...Object.keys(b || {})])].filter(k => JSON.stringify(a?.[k]) !== JSON.stringify(b?.[k])).sort();
// Row hashes over the columns that existed at 139 (140 adds origin_code and the referrer).
const NEW_COLUMNS = ['origin_code', 'referrer_text', 'referrer_student_id', 'referrer_lead_id'];
const hashes = () => Object.fromEntries(['students', 'crm_contacts', 'crm_leads', 'crm_tasks', 'crm_submissions', 'enrollments', 'receipts', 'charges'].map(t =>
  [t, sql(`select count(*)||':'||md5(coalesce(string_agg((to_jsonb(x)-array[${NEW_COLUMNS.map(c => `'${c}'`).join(',')}])::text,'' order by to_jsonb(x)::text),'')) from public.${t} x`)]));

const staff = n => `b2140000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const as = (who, body) => `begin; select set_config('request.jwt.claim.sub','${who}',true); ${body}; commit;`;
const create = payload => sql(as(staff(3), `select public.crm_create_prospect(gen_random_uuid(),jsonb_build_object('source_label','Manuel · Appel entrant')||'${JSON.stringify(payload)}'::jsonb)->'lead'->>'id'`)).split('\n').filter(l => /^[0-9a-f-]{36}$/.test(l)).at(-1);
const version = lead => sql(`select version from public.crm_leads where id='${lead}'`);

// 1. Seed at 139 (synthetic; invented numbers only).
sql(`insert into auth.users(id,email,aud,role,created_at,updated_at) values
 ('${staff(1)}','upg140-director@example.invalid','authenticated','authenticated',now(),now()),
 ('${staff(3)}','upg140-reception@example.invalid','authenticated','authenticated',now(),now());
 update public.profiles set role='director',full_name='Upgrade director' where id='${staff(1)}';
 update public.profiles set role='receptionist',full_name='Upgrade reception' where id='${staff(3)}';`);
const hours = Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map(d => [d, [['09:00', '20:00']]]));
sql(as(staff(1), `select public.crm_create_followup_policy(gen_random_uuid(),'${JSON.stringify({ weekly_hours: hours, attempt_offsets: [0, 0, 1, 3, 5] })}'::jsonb)`));
const adults = create({ display_name: 'Upgrade adultes', phone: '0612140001', learner_name: 'Upgrade adulte', session_type: 'Adults', program_interest_text: 'Anglais adultes' });
const dup = create({ display_name: 'Upgrade doublon', phone: '0612140002', learner_name: 'Upgrade doublon' });
sql(as(staff(3), `select public.crm_close_prospect(gen_random_uuid(),jsonb_build_object('lead_id','${dup}','expected_version',${version(dup)},'status','NOT_QUALIFIED','reason','duplicate'))`));
const wrong = create({ display_name: 'Upgrade mauvais numéro', phone: '0612140003', learner_name: 'Upgrade numéro' });
const online = create({ display_name: 'Upgrade en ligne', phone: '0612140004', learner_name: 'Upgrade en ligne', session_type: 'Yearly' });
const learner = 'b2140000-0000-4000-8000-0000000000a1';
sql(`insert into public.students(id,full_name,telephone,status,session_type,referral_source) values('${learner}','Upgrade apprenant','0612140010','Prospect','Yearly','Famille / Ami(e)')`);
const before = catalog(), rows = hashes();

// 2. Apply 140.
psql(['-1', '-f', MIGRATION]);
assert.equal(sql('select max(version) from supabase_migrations.schema_migrations'), '139', 'the file only, the ledger stays');
assert.deepEqual(hashes(), rows, '140 writes no existing row');
assert.equal(sql(`select count(*) from public.crm_leads where origin_code is not null or referrer_text is not null or referrer_student_id is not null or referrer_lead_id is not null`), '0');
assert.equal(sql(`select count(*) from public.students where origin_code is not null`), '0', 'no learner origin until D4');
assert.equal(sql(`select (select count(*) from public.programmes)||'|'||(select count(*) from public.programme_levels)||'|'||(select count(*) from public.programme_prices)||'|'||(select count(*) from public.acquisition_sources)||'|'||(select count(*) from public.crm_close_reasons)`),
  '10|78|0|11|14', 'catalogues seeded, with no programme price');
assert.equal(sql(`select string_agg(conname||':'||convalidated,',' order by conname) from pg_constraint where conrelid='public.crm_leads'::regclass and conname in ('crm_leads_session_type_fkey','crm_leads_session_type_check','crm_leads_closure')`),
  'crm_leads_closure:true,crm_leads_session_type_fkey:true', 'FK replaces the 8-value check; both checks valid on the existing rows');
const after = catalog();
assert.deepEqual(diff(before.policies, after.policies).filter(k => !/programmes|programme_levels|programme_prices|acquisition_sources|crm_close_reasons|report_exclusions/.test(k)), [], 'no existing policy changed');
assert.deepEqual(diff(before.triggers, after.triggers), [], 'no trigger changed');
assert.equal(sql(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='crm_security' and p.proname ~ '^d4_'
  and (has_function_privilege('authenticated',p.oid,'execute') or has_function_privilege('anon',p.oid,'execute') or has_function_privilege('service_role',p.oid,'execute'))`), '0', 'D4 not granted');
assert.equal(sql(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='crm_security' and p.proname ~ '^d4_'`), '4', 'D4 present');
assert.equal(sql(`select count(*) from public.crm_data_step_journal where step in ('d4','d4_revert')`), '0', 'D4 not run');
// D6 (owner decision 2026-11-26): shipped in 140, not run, granted to no API role; report_exclusions empty, no API access.
assert.equal(sql(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='crm_security' and p.proname ~ '^d6_'
  and (has_function_privilege('authenticated',p.oid,'execute') or has_function_privilege('anon',p.oid,'execute') or has_function_privilege('service_role',p.oid,'execute'))`), '0', 'D6 not granted');
assert.equal(sql(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='crm_security' and p.proname ~ '^d6_'`), '5', 'D6 present');
assert.equal(sql(`select (select count(*) from public.crm_data_step_journal where step in ('d6','d6_revert'))||'|'||(select count(*) from public.report_exclusions)`), '0|0', 'D6 not run');
assert.equal(sql(`select has_table_privilege('authenticated','public.report_exclusions','select') or has_table_privilege('service_role','public.report_exclusions','select')`), 'f', 'report_exclusions: no API access');
console.log('PASS 139 → 140: no row written, catalogues seeded without prices, checks valid, D4 and D6 present but not run or granted');

// 3. Under 140: values the 139 checks refuse; then the restore.
sql(as(staff(3), `select public.crm_log_exchange(gen_random_uuid(),jsonb_build_object('lead_id','${wrong}','expected_version',${version(wrong)},'channel','phone','result','wrong_number','next',jsonb_build_object('close',jsonb_build_object('reason','wrong_number'))))`));
sql(as(staff(3), `select public.crm_update_prospect(gen_random_uuid(),jsonb_build_object('lead_id','${online}','expected_version',${version(online)},'session_type','Online','origin_code','walk_by'))`));
assert.equal(sql(`select status||':'||closure_reason from public.crm_leads where id='${wrong}'`), 'NOT_QUALIFIED:wrong_number');
// Rollback order: B1's restore refuses while 140 is applied (it would leave 140's bodies).
assert.match(fails(readFileSync('scripts/rollback/139_people_identity_restore.sql', 'utf8')), /migration 140 is applied; run scripts\/rollback\/140_catalogues_restore\.sql first/, '139 restore refuses before 140 is restored');
sql(readFileSync(RESTORE, 'utf8'));
const restored = catalog();
assert.deepEqual(diff(before.functions, restored.functions), [], 'functions are the 139 ones');
assert.deepEqual(diff(before.triggers, restored.triggers), [], 'triggers are the 139 ones');
assert.deepEqual(diff(before.policies, restored.policies).filter(k => !/programmes|programme_levels|programme_prices|acquisition_sources|crm_close_reasons|report_exclusions/.test(k)), [], 'policies are the 139 ones');
const additive = /programmes|programme_levels|programme_prices|acquisition_sources|crm_close_reasons|report_exclusions|origin_code|referrer_|crm_leads_one_referrer/;
const notValid = ['crm_leads.crm_leads_closure', 'crm_leads.crm_leads_session_type_check'];
for (const part of ['tables', 'columns', 'indexes']) {
  assert.deepEqual(diff(before[part], restored[part]).filter(k => !additive.test(k)), [], `${part}: only the additive tables and columns stay`);
}
assert.deepEqual(diff(before.constraints, restored.constraints).filter(k => !additive.test(k)), notValid, 'constraints: only the two checks differ (restored NOT VALID)');
for (const k of notValid) assert.equal(restored.constraints[k], `${before.constraints[k]} NOT VALID`, `${k}: the 139 definition, NOT VALID`);
assert.equal(sql(`select status||':'||closure_reason from public.crm_leads where id='${wrong}'`), 'NOT_QUALIFIED:wrong_number', 'the « Mauvais numéro » close is kept');
assert.equal(sql(`select session_type from public.crm_leads where id='${online}'`), 'Online', 'the online programme is kept');
assert.match(fails(readFileSync(RESTORE, 'utf8')), /migration 140 is not applied/, 'a second restore refuses');
console.log('PASS restore 140: the 139 functions and triggers; the two checks back NOT VALID with the rows kept; additive tables and columns kept; second run refused');

// 4. Re-apply after the restore, then restore again.
psql(['-1', '-f', MIGRATION]);
const reapplied = catalog();
for (const part of ['functions', 'triggers', 'policies', 'tables', 'columns', 'constraints', 'indexes']) {
  assert.deepEqual(diff(after[part], reapplied[part]), [], `${part}: the re-applied 140 equals the first one`);
}
assert.equal(sql(`select origin_code from public.crm_leads where id='${online}'`), 'walk_by', 'a value written under 140 survives the restore and the re-apply');
sql(readFileSync(RESTORE, 'utf8'));
assert.deepEqual(diff(before.functions, catalog().functions), [], 'restored again: the 139 functions');
console.log('PASS re-apply 140 after its restore: same catalog as the first 140, kept rows survive; restored again');
