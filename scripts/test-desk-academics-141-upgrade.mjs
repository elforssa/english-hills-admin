// Destructive LOCAL synthetic upgrade rehearsal 140 → 141 (desk academics, plan RWR-r5
// PR C2, M-C1 academic part). Run after `supabase db reset --local --version 140 --no-seed`:
//   1. seeds, at 140, staff, the hours, a learner with a planned test and one with a past
//      result, a prospect with its appointment and test, a group with « jours » text and
//      attendance, and a learner whose category does not fit its programme (an old row);
//   2. applies the 141 file (the ledger stays at 140) and proves no existing row changed
//      (groups.class_days is new and NULL), the age bounds come from the audience, the
//      placement policies are the commands' set, and D7 is present but neither run nor
//      granted; an old file still saves an unrelated edit;
//   3. under 141, cancels the learner's test with a reason and gives a group class days;
//      the 140 restore refuses while 141 is applied; the 141 restore brings the 140
//      functions, triggers, policies and columns back, keeps every row, and a second run
//      refuses;
//   4. applies 141 again on top of the restore: same catalog as the first 141; restores
//      again, so the lane ends on the 140 functions.
//   node scripts/test-desk-academics-141-upgrade.mjs
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const port = process.env.DESK_ACADEMICS_UPGRADE_PORT || '54322';
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
const MIGRATION = 'supabase/migrations/141_desk_academics.sql';
const RESTORE = 'scripts/rollback/141_desk_academics_restore.sql';
assert.equal(sql('select max(version) from supabase_migrations.schema_migrations'), '140', 'run on a database at migration 140');

const catalog = () => json(`select jsonb_build_object(
 'functions',(select jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_array(md5(p.prosrc),p.prosecdef,p.provolatile,p.proconfig,p.proowner::regrole::text,p.proacl::text,p.prorettype::regtype::text)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname not in ('pg_catalog','information_schema') and not exists (select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')),
 'tables',(select jsonb_object_agg(relnamespace::regnamespace::text||'.'||relname,jsonb_build_array(relrowsecurity,relforcerowsecurity,relacl::text)) from pg_class where relkind='r' and relnamespace in ('public'::regnamespace,'crm_security'::regnamespace,'maintenance'::regnamespace)),
 'columns',(select jsonb_object_agg(table_schema||'.'||table_name||'.'||column_name,jsonb_build_array(data_type,is_nullable,column_default)) from information_schema.columns where table_schema in ('public','crm_security')),
 'constraints',(select jsonb_object_agg(conrelid::regclass::text||'.'||conname,pg_get_constraintdef(oid)) from pg_constraint where connamespace='public'::regnamespace),
 'indexes',(select jsonb_object_agg(schemaname||'.'||indexname,indexdef) from pg_indexes where schemaname in ('public','crm_security')),
 'policies',(select jsonb_object_agg(schemaname||'.'||tablename||'.'||policyname,to_jsonb(p)) from pg_policies p),
 'triggers',(select jsonb_object_agg(c.relname||'.'||t.tgname,jsonb_build_array(t.tgenabled,pg_get_triggerdef(t.oid))) from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace='public'::regnamespace and not t.tgisinternal),
 'levels',(select jsonb_object_agg(programme_code||':'||level,jsonb_build_array(min_age,max_age)) from public.programme_levels))::text`);
const diff = (a, b) => [...new Set([...Object.keys(a || {}), ...Object.keys(b || {})])].filter(k => JSON.stringify(a?.[k]) !== JSON.stringify(b?.[k])).sort();
const NEW_COLUMNS = ['class_days'];
const hashes = () => Object.fromEntries(['students', 'placement_tests', 'attendance', 'groups', 'enrollments', 'crm_leads', 'crm_tasks'].map(t =>
  [t, sql(`select count(*)||':'||md5(coalesce(string_agg((to_jsonb(x)-array[${NEW_COLUMNS.map(c => `'${c}'`).join(',')}])::text,'' order by to_jsonb(x)::text),'')) from public.${t} x`)]));

const staff = n => `c2141000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const as = (who, body) => `begin; select set_config('request.jwt.claim.sub','${who}',true); ${body}; commit;`;
const today = "(now() at time zone public.centre_utc_offset())::date";

// 1. Seed at 140 (synthetic; invented names only).
sql(`insert into auth.users(id,email,aud,role,created_at,updated_at) values
 ('${staff(1)}','upg141-director@example.invalid','authenticated','authenticated',now(),now()),
 ('${staff(3)}','upg141-reception@example.invalid','authenticated','authenticated',now(),now());
 update public.profiles set role='director',full_name='Upgrade director' where id='${staff(1)}';
 update public.profiles set role='receptionist',full_name='Upgrade reception' where id='${staff(3)}';`);
const hours = Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map(d => [d, [['08:00', '21:00']]]));
sql(as(staff(1), `select public.crm_create_followup_policy(gen_random_uuid(),'${JSON.stringify({ weekly_hours: hours, attempt_offsets: [0, 0, 1, 3, 5] })}'::jsonb)`));
const learner = staff(101), mismatch = staff(102), group = staff(201), planned = staff(301), done = staff(302);
sql(`insert into public.students(id,full_name,status,session_type,niveau_cefr,date_naissance) values
  ('${learner}','Upgrade learner','Enrolled','Yearly','Child 1',(${today}-interval '9 years')::date),
  ('${mismatch}','Upgrade old category','Prospect','Yearly',null,null);
 update public.students set age_category='Adults (18+)' where id='${mismatch}';
 insert into public.groups(id,name,session_type,niveau,jours) values('${group}','Upgrade group','Yearly','Child 1','Lun, Mer');
 select set_config('eh.membership_sync','on',false), set_config('eh.enrollment_command','on',false);
 insert into public.enrollments(student_id,group_id,status,session_type,level,school_year) values('${learner}','${group}','Validated','Yearly','Child 1','2026/2027');
 select set_config('eh.membership_sync','',false), set_config('eh.enrollment_command','',false);
 insert into public.placement_tests(id,student_id,student_name,date_test,heure,status) values
  ('${planned}','${learner}','Upgrade learner',${today}+2,'10:00','Planifié'),
  ('${done}','${mismatch}','Upgrade old category',${today}-3,'10:00','Résultat saisi');
 update public.placement_tests set niveau_recommande='A1' where id='${done}';`);
sql(as(staff(3), `select public.save_attendance('${learner}','${group}',${today}-1,'Présent')`));
const lead = sql(as(staff(3), `select public.crm_create_prospect(gen_random_uuid(),jsonb_build_object('source_label','Manuel · Appel entrant','display_name','Upgrade prospect','phone','0612141001','learner_name','Upgrade prospect child'))->'lead'->>'id'`))
  .split('\n').filter(l => /^[0-9a-f-]{36}$/.test(l)).at(-1);
sql(as(staff(3), `select public.crm_log_exchange(gen_random_uuid(),jsonb_build_object('lead_id','${lead}','expected_version',(select version from public.crm_leads where id='${lead}'),'channel','phone','result','spoke',
  'next',jsonb_build_object('task_type','center_visit','with_test',true,'due_at',((${today}+3)+time '11:00') at time zone public.centre_utc_offset())))`));
assert.equal(sql(`select count(*) from public.placement_tests where crm_lead_id='${lead}' and status='Planifié'`), '1', 'the prospect carries a planned test');
const before = catalog(), rows = hashes();

// 2. Apply 141.
psql(['-1', '-f', MIGRATION]);
assert.equal(sql('select max(version) from supabase_migrations.schema_migrations'), '140', 'the file only, the ledger stays');
assert.deepEqual(hashes(), rows, '141 writes no existing row');
assert.equal(sql('select count(*) from public.groups where class_days is not null'), '0', 'no class days until D7 or an edit');
const after = catalog();
assert.deepEqual(diff(before.levels, after.levels).length > 0 && diff(before.levels, after.levels).every(k => !/^(Other|One-to-One|Mise à niveau|Online)/.test(k)), true,
  'age bounds set for the adults, children and teenagers programmes only');
assert.equal(sql(`select string_agg(distinct coalesce(pl.min_age::text,'-')||'/'||coalesce(pl.max_age::text,'-')||':'||p.audience, ',' order by coalesce(pl.min_age::text,'-')||'/'||coalesce(pl.max_age::text,'-')||':'||p.audience)
  from public.programme_levels pl join public.programmes p on p.code=pl.programme_code`), '-/-:tous,-/17:ados,-/17:enfants,18/-:adultes', 'bounds by audience');
assert.deepEqual(diff(before.policies, after.policies), ['public.placement_tests.placement admin all', 'public.placement_tests.placement admin delete',
  'public.placement_tests.placement admin read', 'public.placement_tests.receptionist_placement_insert', 'public.placement_tests.receptionist_placement_update'], 'only the placement policies change');
assert.deepEqual(diff(before.triggers, after.triggers), ['groups.groups_class_days_normalize', 'placement_tests.placement_tests_rules', 'students.students_rules_guard'], 'three new triggers');
assert.deepEqual(diff(before.columns, after.columns), ['public.groups.class_days'], 'one new column');
assert.equal(sql(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='crm_security' and p.proname ~ '^d7_'
  and (has_function_privilege('authenticated',p.oid,'execute') or has_function_privilege('anon',p.oid,'execute') or has_function_privilege('service_role',p.oid,'execute'))`), '0', 'D7 not granted');
assert.equal(sql(`select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='crm_security' and p.proname ~ '^d7_'`), '4', 'D7 present');
assert.equal(sql(`select count(*) from public.crm_data_step_journal where step in ('d7','d7_revert')`), '0', 'D7 not run');
// An old file keeps saving unrelated edits; the deployed (pre-C2) build's four-argument save_attendance call still resolves.
sql(as(staff(3), `select public.save_receptionist_student('${mismatch}',(select updated_at from public.students where id='${mismatch}'),'{"notes":"Appel du parent"}')`));
sql(as(staff(3), `select public.save_attendance('${learner}','${group}',${today}-1,'Retard')`));
assert.equal(sql(`select status from public.attendance where student_id='${learner}' and group_id='${group}' and session_date=${today}-1`), 'Retard', 'the old call corrects a row');
console.log('PASS 140 → 141: no row written, bounds from the audience, placement policies and three triggers, D7 present but not run or granted, old calls still work');

// 3. Under 141, then the restores.
sql(as(staff(3), `select public.update_placement_test_result('${planned}',(select updated_at from public.placement_tests where id='${planned}'),'{"status":"Annulé","cancel_reason":"Famille absente"}')`));
sql(as(staff(3), `select * from public.save_receptionist_group('${group}',(select updated_at from public.groups where id='${group}'),'{"class_days":[1,3]}')`));
assert.equal(sql(`select status||':'||cancel_reason from public.placement_tests where id='${planned}'`), 'Annulé:Famille absente');
assert.match(fails(readFileSync('scripts/rollback/140_catalogues_restore.sql', 'utf8')), /migration 141 is applied; run scripts\/rollback\/141_desk_academics_restore\.sql first/, '140 restore refuses before 141 is restored');
sql(readFileSync(RESTORE, 'utf8'));
const restored = catalog();
for (const part of ['functions', 'triggers', 'policies', 'columns', 'constraints', 'indexes', 'tables', 'levels']) {
  assert.deepEqual(diff(before[part], restored[part]), [], `${part}: the 140 ones`);
}
assert.equal(sql(`select status||':'||cancel_reason from public.placement_tests where id='${planned}'`), 'Annulé:Famille absente', 'a test cancelled under 141 is kept');
assert.match(fails(readFileSync(RESTORE, 'utf8')), /migration 141 is not applied/, 'a second restore refuses');
console.log('PASS restore 141: the 140 functions, triggers, policies, columns and bounds; rows kept; 140 restore refused first; second run refused');

// 4. Re-apply after the restore, then restore again.
psql(['-1', '-f', MIGRATION]);
const reapplied = catalog();
for (const part of ['functions', 'triggers', 'policies', 'tables', 'columns', 'constraints', 'indexes', 'levels']) {
  assert.deepEqual(diff(after[part], reapplied[part]), [], `${part}: the re-applied 141 equals the first one`);
}
sql(readFileSync(RESTORE, 'utf8'));
assert.deepEqual(diff(before.functions, catalog().functions), [], 'restored again: the 140 functions');
console.log('PASS re-apply 141 after its restore: same catalog as the first 141; restored again');
