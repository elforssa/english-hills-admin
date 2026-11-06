// Destructive LOCAL synthetic stateful upgrade rehearsal 127 → 128 (courses with dates —
// close a finished course, plan CDC-r3). Run after `supabase db reset --local --version 127 --no-seed`:
//   1. seeds the R0 patterns at 127: paid enrollments without a group in Mise à niveau
//      (a learner with nothing else, a learner who stays « Inscrit » through a placed Yearly
//      enrollment, a learner with a partly paid unlinked charge and an engagement), Adults,
//      One-to-One and Online One-to-One (one learner with both), a Yearly row (never in the
//      step) and an Other row (never on the card);
//   2. reads the declared counts with supabase/manual/course_close_r0_counts.sql (the file
//      that ran on Production, read-only);
//   3. applies 128 (the file; the ledger stays at 127) and proves the catalog moved only in
//      the 128 manifest; existing groups keep empty dates and no row changes;
//   4. runs the one-time step S1 (Mise à niveau, the default) with a wrong count and a wrong
//      scenario line (refused, nothing changed), as a dry run (DRYRUN_OK, nothing changed),
//      then for real, and asserts every outcome; a second run with zero counts changes no
//      row; then S4 (Adults and One-to-One switched on) the same way;
//   5. runs the revert: refused while a row was reopened since (« Rouvrir l'inscription »)
//      and no skip is declared; dry run and real run with the declared skip; the S4 run
//      fully; a second revert finds nothing; rows and files match the pre-step state and
//      the step's charge link stays;
//   6. applies the forward restore script: the functions, policies and triggers are the
//      127 ones again; the four group columns, the order check and the journal stay.
//   node scripts/test-course-dates-close-upgrade.mjs
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const port = process.env.CDC_UPGRADE_PORT || '54322';
const run = (input, { ok = true } = {}) => {
  try {
    const out = execFileSync('psql', ['-X', '-qAt', '-h', '127.0.0.1', '-p', port, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
      { input, encoding: 'utf8', env: { ...process.env, PGPASSWORD: 'postgres' }, maxBuffer: 64 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    if (!ok) assert.fail('expected a refusal, the statement succeeded');
    return out;
  } catch (error) {
    if (ok || error.code === 'ERR_ASSERTION') throw error;
    return String(error.stderr || error.message);
  }
};
const sql = input => run(input);
const fails = input => run(input, { ok: false });
const json = input => JSON.parse(sql(input));
const q = v => (v === null ? 'null' : `'${String(v).replaceAll("'", "''")}'`);
const id = n => `cdcf0000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const MIGRATION = 'supabase/migrations/128_course_dates_close.sql';
const STEP = 'supabase/manual/course_close_backlog.sql';
const REVERT = 'supabase/manual/course_close_backlog_revert.sql';
const RESTORE = 'scripts/rollback/128_course_dates_close_restore.sql';
const R0 = 'supabase/manual/course_close_r0_counts.sql';
assert.equal(sql('select max(version) from supabase_migrations.schema_migrations'), '127', 'run on a database at migration 127');

const YEAR = sql('select public.centre_school_year()');
const AN = YEAR.replace('/', '-');
const r0Text = readFileSync(R0, 'utf8');
assert.match(r0Text, /^set transaction read only;\n/);
const counts = () => Object.fromEntries(sql(`begin;\n${r0Text}\nrollback;`).split('\n').map(line => {
  const at = line.lastIndexOf('|');
  return [line.slice(0, at), Number(line.slice(at + 1))];
}));

// Whole application catalog (as the 127 rehearsal reads it).
const catalog = () => json(`select jsonb_build_object(
 'functions',(select jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_array(md5(p.prosrc),p.prosecdef,p.provolatile,p.proconfig,p.proowner::regrole::text,p.proacl::text,p.prorettype::regtype::text)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname not in ('pg_catalog','information_schema') and not exists (select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')),
 'tables',(select jsonb_object_agg(relnamespace::regnamespace::text||'.'||relname,jsonb_build_array(relrowsecurity,relforcerowsecurity,relacl::text)) from pg_class where relkind='r' and relnamespace in ('public'::regnamespace,'crm_security'::regnamespace,'maintenance'::regnamespace)),
 'columns',(select jsonb_object_agg(table_schema||'.'||table_name||'.'||column_name,jsonb_build_array(data_type,is_nullable,column_default)) from information_schema.columns where table_schema in ('public','crm_security')),
 'constraints',(select jsonb_object_agg(conrelid::regclass::text||'.'||conname,pg_get_constraintdef(oid)) from pg_constraint where connamespace='public'::regnamespace),
 'indexes',(select jsonb_object_agg(schemaname||'.'||indexname,indexdef) from pg_indexes where schemaname in ('public','crm_security')),
 'policies',(select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname) from pg_policies p),
 'triggers',(select jsonb_agg(jsonb_build_array(c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid)) order by c.relname,t.tgname) from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace='public'::regnamespace and not t.tgisinternal))::text`);
const diffKeys = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k])).sort();
const touched = ['enrollments', 'students', 'groups', 'charges', 'receipts', 'attendance', 'crm_leads'];
const hashes = () => Object.fromEntries(touched.map(t => [t, sql(`select count(*)||':'||md5(coalesce(string_agg(to_jsonb(x)::text,'' order by to_jsonb(x)::text),'')) from public.${t} x`)]));
const state = () => json(`select jsonb_build_object(
  'enrollments', (select jsonb_object_agg(id, jsonb_build_array(status, group_id, level, school_year, ended_at, end_reason, ended_group_id)) from public.enrollments),
  'students', (select jsonb_object_agg(id, jsonb_build_array(status, groupe_id)) from public.students))::text`);

// ---------------------------------------------------------------------------
// 1. Seed at 127.
// ---------------------------------------------------------------------------
const asUser = (user, body) => sql(`begin; select set_config('request.jwt.claim.sub', ${q(user)}, true); ${body}; commit;`);
sql(`insert into auth.users(id, email, aud, role, email_confirmed_at, created_at, updated_at) values
  (${q(id(1))}, 'cdc-up-director@example.test', 'authenticated', 'authenticated', now(), now(), now()),
  (${q(id(2))}, 'cdc-up-reception@example.test', 'authenticated', 'authenticated', now(), now(), now());
update public.profiles set role = case id when ${q(id(1))} then 'director' else 'receptionist' end where id in (${q(id(1))}, ${q(id(2))});
insert into public.groups(id, name, session_type, niveau, annee, capacite_max) values
  (${q(id(21))}, 'Up CDC Yearly C1', 'Yearly', 'Child 1', ${q(AN)}, 15),
  (${q(id(22))}, 'Up CDC MAN A1 undated', 'Mise à niveau', 'A1', ${q(AN)}, 10);
insert into public.students(id, full_name, status, session_type) values
  (${q(id(101))}, 'Up CDC A only MAN', 'Enrolled', 'Mise à niveau'), (${q(id(102))}, 'Up CDC B MAN and Yearly', 'Enrolled', 'Mise à niveau'),
  (${q(id(103))}, 'Up CDC C partly paid', 'Enrolled', 'Mise à niveau'), (${q(id(104))}, 'Up CDC D Adults', 'Enrolled', 'Adults'),
  (${q(id(105))}, 'Up CDC E individual', 'Enrolled', 'One-to-One'), (${q(id(106))}, 'Up CDC F Yearly waiting', 'Enrolled', 'Yearly'),
  (${q(id(107))}, 'Up CDC G Other', 'Enrolled', 'Other'), (${q(id(108))}, 'Up CDC H placed MAN', 'Enrolled', 'Mise à niveau');
insert into public.enrollments(id, student_id, status, session_type, school_year, level, group_id) values
  (${q(id(201))}, ${q(id(101))}, 'Confirmed', 'Mise à niveau', ${q(YEAR)}, 'A1', null),
  (${q(id(202))}, ${q(id(102))}, 'Confirmed', 'Mise à niveau', ${q(YEAR)}, 'A2', null),
  (${q(id(212))}, ${q(id(102))}, 'Validated', 'Yearly', ${q(YEAR)}, 'Child 1', ${q(id(21))}),
  (${q(id(203))}, ${q(id(103))}, 'Confirmed', 'Mise à niveau', ${q(YEAR)}, null, null),
  (${q(id(204))}, ${q(id(104))}, 'Confirmed', 'Adults', ${q(YEAR)}, null, null),
  (${q(id(205))}, ${q(id(105))}, 'Confirmed', 'One-to-One', ${q(YEAR)}, 'B1', null),
  (${q(id(215))}, ${q(id(105))}, 'Confirmed', 'Online One-to-One', ${q(YEAR)}, 'B1', null),
  (${q(id(206))}, ${q(id(106))}, 'Confirmed', 'Yearly', ${q(YEAR)}, 'Child 2', null),
  (${q(id(207))}, ${q(id(107))}, 'Confirmed', 'Other', ${q(YEAR)}, null, null),
  (${q(id(208))}, ${q(id(108))}, 'Validated', 'Mise à niveau', ${q(YEAR)}, 'A1', ${q(id(22))});`);
// C: a partly paid tuition charge of the same programme and year, then unlinked (the shape
// S6 links), and an « engagement » with nothing paid (never linked).
const pay = payload => JSON.parse(sql(`begin; select set_config('request.jwt.claim.sub', ${q(id(2))}, true);
  select public.create_charge_payment(${q(JSON.stringify({ payment_method: 'Espèces', idempotency_key: crypto.randomUUID(), ...payload }))}::jsonb)::text; commit;`).split('\n').pop());
const partly = pay({ student_id: id(103), enrollment_id: id(203), session_type: 'Mise à niveau', school_year: YEAR, gross_amount: 500, payment_amount: 100 });
const engagement = pay({ student_id: id(103), session_type: 'Mise à niveau', school_year: YEAR, gross_amount: 800, payment_amount: 0 });
sql(`update public.receipts set enrollment_id = null where charge_id = ${q(partly.charge_id)};
update public.charges set enrollment_id = null where id = ${q(partly.charge_id)};`);
assert.equal(sql(`select enrollment_id is null and paid_amount = 0 from public.charge_balances where id = ${q(engagement.charge_id)}`), 't', 'fixture: the engagement');
assert.equal(sql(`select string_agg(status, ',' order by id) from public.enrollments where student_id = ${q(id(103))}`), 'Confirmed',
  'fixture: the payments kept C at one enrollment');

const declared = counts();
const line = (label) => { assert(label in declared, `R0 line ${label}`); return declared[label]; };
assert.equal(line('A2 card today « Inscrits — groupe à affecter » (Confirmed, no group)'), 8);
assert.equal(line('A3 card under OA5 (programmes that use groups: every programme but Other)'), 7);
assert.equal(line('A4 card under OA5 after the one-time step · S1 Mise à niveau'), 4);
assert.equal(line('A4 card under OA5 after the one-time step · S4 all four programmes'), 1);
assert.equal(line('T2 S1 Mise à niveau · enrollments ended · Mise à niveau'), 3);
assert.deepEqual(['S1 Mise à niveau', 'S4 all four programmes'].map(s => [line(`T3 ${s} · learner files that stay Inscrit`),
  line(`T4 ${s} · learner files that become Ancien apprenant`)]), [[1, 2], [1, 4]]);
assert.equal(line('T12 Yearly paid without group (never in the step)'), 1);

// ---------------------------------------------------------------------------
// 2. Apply 128; the catalog moves only in the manifest; no row changes.
// ---------------------------------------------------------------------------
const before = catalog();
const rowsBefore = hashes();
sql(readFileSync(MIGRATION, 'utf8'));
assert.equal(sql('select max(version) from supabase_migrations.schema_migrations'), '127', 'the file alone does not touch the ledger');
assert.deepEqual(hashes(), { ...rowsBefore, groups: hashes().groups }, 'no enrollment, learner, payment, attendance or lead row changes');
assert.equal(sql('select count(*) from public.groups where date_debut is not null or date_fin is not null or closed_at is not null'), '0',
  'existing groups keep empty dates and no closed mark');
const after = catalog();
assert.deepEqual(diffKeys(before.functions, after.functions), [
  'academic_security.course_close_replay(uuid)', 'academic_security.course_dates_required(text)',
  'academic_security.course_engagements(uuid)', 'academic_security.course_late_deposits(uuid,date)',
  'academic_security.course_link_charges(uuid)', 'academic_security.course_of_one_allows(uuid,integer,uuid)',
  'academic_security.course_unplaced(uuid)', 'academic_security.enforce_group_capacity()',
  'academic_security.guard_course_group()', 'academic_security.guard_course_placement()',
  'academic_security.guard_group_year()', 'academic_security.year_close_rows(text)',
  'close_course(uuid,integer,text,uuid[],uuid[])', 'close_course_preview(uuid)', 'close_school_year(text,integer,text)',
  'close_school_year_preview(text)', 'crm_enrollment_groups(text,text,integer,integer)', 'family_group_ids()',
  'list_courses_to_close()', 'reopen_course(uuid,timestamp with time zone)',
  'save_receptionist_group(uuid,timestamp with time zone,jsonb)',
].sort(), 'functions changed exactly as the manifest');
for (const name of ['academic_security.enforce_group_capacity()', 'academic_security.guard_group_year()', 'close_school_year(text,integer,text)',
  'crm_enrollment_groups(text,text,integer,integer)', 'save_receptionist_group(uuid,timestamp with time zone,jsonb)']) {
  assert.deepEqual(after.functions[name].slice(1), before.functions[name].slice(1), `${name}: posture, settings, owner, grants unchanged`);
}
assert.deepEqual(diffKeys(before.columns, after.columns), ['public.groups.closed_at', 'public.groups.closed_by', 'public.groups.date_debut',
  'public.groups.date_fin'], 'four group columns');
assert.deepEqual(diffKeys(before.constraints, after.constraints), ['groups.groups_course_dates_order']);
assert.deepEqual(diffKeys(before.tables, after.tables), ['maintenance.course_close_journal']);
assert.equal(after.tables['maintenance.course_close_journal'][0], true, 'journal: RLS on');
assert.doesNotMatch(String(after.tables['maintenance.course_close_journal'][2]), /anon|authenticated|service_role/, 'journal: no API grant');
assert.deepEqual(after.indexes, before.indexes, 'public indexes unchanged');
const policyNames = p => p.filter(x => x.tablename === 'groups').map(x => x.policyname).sort();
assert.deepEqual(policyNames(after.policies), ['groups admin all', 'groups read family', 'groups read staff']);
assert.deepEqual(after.policies.filter(x => x.tablename !== 'groups'), before.policies.filter(x => x.tablename !== 'groups'), 'other policies unchanged');
const triggerKey = t => t.slice(0, 2).join('.');
assert.deepEqual(after.triggers.filter(t => !before.triggers.some(b => JSON.stringify(b) === JSON.stringify(t))).map(triggerKey).sort(),
  ['enrollments.enrollment_course_guard', 'groups.groups_course_guard', 'groups.groups_year_guard'], 'two new triggers; the year guard fires on the dates');
assert.equal(after.triggers.length, before.triggers.length + 2);

// ---------------------------------------------------------------------------
// 3. The one-time step: S1, then S4.
// ---------------------------------------------------------------------------
const stepText = readFileSync(STEP, 'utf8');
const withParams = (text, params) => Object.entries(params).reduce((t, [k, v]) => {
  const re = new RegExp(`select set_config\\('${k.replace('.', '\\.')}', '[^']*', true\\);`);
  assert.match(t, re, `parameter ${k} present`);
  return t.replace(re, `select set_config('${k}', '${v}', true);`);
}, text);
assert.match(stepText, /select set_config\('cdc\.adults', 'off', true\);/, 'Adults is off by default (Q12)');
assert.match(stepText, /select set_config\('cdc\.one_to_one', 'off', true\);/, 'One-to-One is off by default (Q12)');
assert.match(stepText, /select set_config\('cdc\.dry_run', 'on', true\);/, 'dry run by default');
const step = (overrides = {}) => withParams(stepText, { 'cdc.school_year': YEAR, 'cdc.adults': 'off', 'cdc.one_to_one': 'off',
  'cdc.expected_mise_a_niveau': 3, 'cdc.expected_adults': 1, 'cdc.expected_one_to_one': 1, 'cdc.expected_online_one_to_one': 1,
  'cdc.expected_s1': '1/2/4', 'cdc.expected_s2': '0/0/0', 'cdc.expected_s3': '0/0/0', 'cdc.expected_s4': '1/4/1', 'cdc.dry_run': 'on', ...overrides });
const preStep = hashes();
const preState = state();
const journal = () => Number(sql('select count(*) from maintenance.course_close_journal'));
assert.match(fails(step({ 'cdc.expected_mise_a_niveau': 4, 'cdc.dry_run': 'off' })), /CDC backlog refused: 3 targets of Mise à niveau found, 4 declared/);
assert.match(fails(step({ 'cdc.expected_s1': '1/2/5', 'cdc.dry_run': 'off' })),
  /CDC backlog refused: scenario S1 found T3 1 T4 2 A4 4, declared 1 \/ 2 \/ 5/);
assert.match(fails(step()), /DRYRUN_OK CDC backlog run=[0-9a-f-]+ scenario=S1 ended=3 stay_enrolled=1 alumni=2 charges_linked=1 card=4/);
assert.deepEqual(hashes(), preStep, 'refusals and the dry run change nothing');
assert.equal(journal(), 0);
sql(step({ 'cdc.dry_run': 'off' }));
const enr = n => json(`select to_jsonb(e) from public.enrollments e where id = ${q(n)}`);
const stu = n => sql(`select status from public.students where id = ${q(n)}`);
for (const e of [id(201), id(202), id(203)]) {
  assert.deepEqual([enr(e).status, enr(e).end_reason, enr(e).group_id, enr(e).ended_group_id], ['Ended', 'Mise à niveau terminée', null, null]);
}
assert.deepEqual([stu(id(101)), stu(id(102)), stu(id(103))], ['Alumni', 'Enrolled', 'Alumni'], 'T3/T4 as declared');
assert.equal(sql(`select enrollment_id from public.charges where id = ${q(partly.charge_id)}`), id(203), 'S6: the partly paid charge is linked');
assert.equal(sql(`select enrollment_id is null from public.charges where id = ${q(engagement.charge_id)}`), 't', 'N-2: the engagement is not linked');
assert.deepEqual([id(204), id(205), id(215), id(206), id(207), id(208), id(212)].map(e => enr(e).status),
  ['Confirmed', 'Confirmed', 'Confirmed', 'Confirmed', 'Confirmed', 'Validated', 'Validated'], 'other programmes and placed rows untouched');
assert.deepEqual(json(`select jsonb_object_agg(action || ':' || entity, n) from (select action, entity, count(*) n from maintenance.course_close_journal
  group by 1, 2) x`), { 'run:runs': 1, 'ended:enrollments': 3, 'resynced:students': 3, 'charge_linked:charges': 1 }, 'journal');
const afterS1 = counts();
assert.equal(afterS1['T2 S1 Mise à niveau · enrollments ended · Mise à niveau'], 0);
assert.equal(afterS1['A3 card under OA5 (programmes that use groups: every programme but Other)'], 4, 'the card shows the declared A4');
// A second S1 run with zero counts changes no row and writes no journal row, not even a run row.
const postS1 = hashes();
const journalRows = () => sql('select count(*) from maintenance.course_close_journal');
const journalBefore = journalRows();
assert.match(fails(step({ 'cdc.expected_mise_a_niveau': 0, 'cdc.expected_s1': '0/0/4' })),
  /DRYRUN_OK CDC backlog run=none scenario=S1 ended=0 stay_enrolled=0 alumni=0 charges_linked=0 card=4/);
sql(step({ 'cdc.dry_run': 'off', 'cdc.expected_mise_a_niveau': 0, 'cdc.expected_s1': '0/0/4' }));
assert.deepEqual(hashes(), postS1, 'a second run finds no target');
assert.equal(journalRows(), journalBefore, 'a zero re-run writes no run row');
// A zero re-run still checks its declared counts.
assert.match(fails(step({ 'cdc.dry_run': 'off', 'cdc.expected_mise_a_niveau': 0, 'cdc.expected_s1': '0/0/5' })),
  /CDC backlog refused: scenario S1 found T3 0 T4 0 A4 4, declared 0 \/ 0 \/ 5/);
// S4: Adults and One-to-One switched on after the owner's confirmation.
assert.match(fails(step({ 'cdc.adults': 'on', 'cdc.one_to_one': 'on', 'cdc.expected_mise_a_niveau': 0, 'cdc.expected_s4': '0/2/1' })),
  /DRYRUN_OK CDC backlog run=[0-9a-f-]+ scenario=S4 ended=3 stay_enrolled=0 alumni=2 charges_linked=0 card=1/);
assert.deepEqual(hashes(), postS1);
sql(step({ 'cdc.adults': 'on', 'cdc.one_to_one': 'on', 'cdc.expected_mise_a_niveau': 0, 'cdc.expected_s4': '0/2/1', 'cdc.dry_run': 'off' }));
assert.deepEqual([enr(id(204)).end_reason, enr(id(205)).end_reason, enr(id(215)).end_reason],
  ['Session Adults terminée', 'Cours individuel terminé', 'Cours individuel terminé']);
assert.deepEqual([stu(id(104)), stu(id(105))], ['Alumni', 'Alumni']);
assert.deepEqual([enr(id(206)).status, enr(id(207)).status], ['Confirmed', 'Confirmed'], 'Yearly (T12) and Other never in the step');

// ---------------------------------------------------------------------------
// 4. The revert.
// ---------------------------------------------------------------------------
const runs = sql("select string_agg(run_id::text, ',' order by id) from maintenance.course_close_journal where source = 'backlog_step' and action = 'run'").split(',');
assert.equal(runs.length, 2, 'S1 and S4 (the empty S1 re-run wrote no run row)');
const [s1Run, s4Run] = runs;
// Run rows (nit, entity names): the step's and the revert's run rows are entity 'runs' with
// row_id the run; a command's run row is its group's ('groups'), checked by the SQL suite.
assert.equal(sql("select bool_and(entity = 'runs' and row_id = run_id and group_id is null) from maintenance.course_close_journal where source = 'backlog_step' and action = 'run'"), 't');
// « Rouvrir l'inscription » on one S1 row: the revert must skip it explicitly.
asUser(id(1), `select public.reopen_enrollment(${q(id(201))}, (select updated_at from public.enrollments where id = ${q(id(201))}))`);
const revertText = readFileSync(REVERT, 'utf8');
const revert = (runId, overrides = {}) => withParams(revertText, { 'cdc.revert_run_id': runId, 'cdc.revert_expected_enrollments': 3,
  'cdc.revert_declared_skips': 0, 'cdc.dry_run': 'on', ...overrides });
const preRevert = hashes();
assert.match(fails(revert(s1Run, { 'cdc.dry_run': 'off' })), /CDC revert refused: 1 journalled rows changed since the step \(declared skips 0\)/);
assert.match(fails(revert(s1Run, { 'cdc.revert_expected_enrollments': 2, 'cdc.dry_run': 'off' })), /CDC revert refused: found 3 enrollments, declared 2/);
assert.match(fails(revert(s1Run, { 'cdc.revert_declared_skips': 1 })), /DRYRUN_OK CDC revert run=[0-9a-f-]+ restored=2 skipped=\[\{"reason": "changed", "enrollment_id": "cdcf0000-0000-4000-8000-0000000000c9"\}\]/);
assert.deepEqual(hashes(), preRevert, 'refusals and the dry run change nothing');
sql(revert(s1Run, { 'cdc.revert_declared_skips': 1, 'cdc.dry_run': 'off' }));
assert.deepEqual([enr(id(202)).status, enr(id(203)).status, stu(id(102)), stu(id(103))], ['Confirmed', 'Confirmed', 'Enrolled', 'Enrolled']);
assert.equal(sql(`select enrollment_id from public.charges where id = ${q(partly.charge_id)}`), id(203), "the step's charge link stays");
assert.equal(sql("select count(*) filter (where entity = 'runs' and row_id = run_id) || '/' || count(*) from maintenance.course_close_journal where source = 'backlog_revert' and action = 'run'"),
  '1/1', "the revert's run row is entity 'runs'");
// What remains of S1 is the reopened row only: it never reverts without a declared skip.
assert.match(fails(revert(s1Run, { 'cdc.revert_expected_enrollments': 1, 'cdc.dry_run': 'off' })), /CDC revert refused: 1 journalled rows changed/);
sql(revert(s4Run, { 'cdc.dry_run': 'off' }));
assert.match(fails(revert(s4Run, { 'cdc.dry_run': 'off' })), /CDC revert refused: run .* has nothing left to revert/, 'a second revert finds nothing');
assert.deepEqual(state(), preState, 'rows and learner files are back to the pre-step state');

// ---------------------------------------------------------------------------
// 5. The forward restore returns the 127 functions, policies and triggers.
// ---------------------------------------------------------------------------
sql(readFileSync(RESTORE, 'utf8'));
const restored = catalog();
assert.deepEqual(diffKeys(before.functions, restored.functions), [], 'every function is back to its 127 body, posture and grants');
for (const key of ['policies', 'triggers', 'indexes']) assert.deepEqual(restored[key], before[key], `${key} back to 127`);
assert.deepEqual(diffKeys(before.columns, restored.columns), diffKeys(before.columns, after.columns), 'the four columns stay (inert)');
assert.deepEqual(diffKeys(before.constraints, restored.constraints), ['groups.groups_course_dates_order']);
assert.deepEqual(diffKeys(before.tables, restored.tables), ['maintenance.course_close_journal'], 'the journal stays');
assert.match(fails(readFileSync(RESTORE, 'utf8')), /Restore 128: migration 128 is not applied/, 'the restore refuses a second time');
console.log('PASS stateful 127→128: R0 counts, manifest-only catalog change, step S1/S4 refusal/dry run/run/no-op re-run, revert with a declared skip and restore to the 127 functions');
