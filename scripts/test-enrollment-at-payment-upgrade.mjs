// Destructive LOCAL synthetic stateful upgrade rehearsal 126 → 127 (enrollment at payment,
// plan EAP-r4). Run after `supabase db reset --local --version 126 --no-seed`:
//   1. seeds the Production patterns at 126 through the 126 functions where they exist
//      (CRM Submitted and Trial initiations with linked leads and open follow-ups, a
//      reception pre-enrollment with and without a group, an Under Review row, a paid
//      row below 10 %) and directly where only history can produce them (a public
//      registration, a parent request, a paid row missing its year, a paid Trial, a
//      CONVERTED lead linked to an unpaid row, a Trial file with no Trial enrollment, an
//      unpaid Confirmed row for K1);
//   2. reads the declared counts with the plan's R0 count query;
//   3. applies 127 (the file; the ledger stays at 126) and proves the catalog moved only
//      in the 127 manifest;
//   4. runs the archive step with a wrong count (refuses, changes nothing), as a dry run
//      (DRYRUN_OK, changes nothing), then for real, and asserts every outcome; a second
//      run with zero counts finds nothing;
//   5. runs the revert (dry run, then real) and compares enrollment rows, learner files
//      and lead links with the pre-archive state while the conversions, activities and
//      cancelled tasks stay (B2); a second revert finds nothing;
//   6. applies the forward restore script: the catalog is the 126 catalog again.
//   node scripts/test-enrollment-at-payment-upgrade.mjs
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const port = process.env.EAP_UPGRADE_PORT || '54322';
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
const id = n => `eaf00000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const MIGRATION = 'supabase/migrations/127_enrollment_at_payment.sql';
const ARCHIVE = 'supabase/manual/enrollment_at_payment_archive.sql';
const REVERT = 'supabase/manual/enrollment_at_payment_archive_revert.sql';
const RESTORE = 'scripts/rollback/127_enrollment_at_payment_restore.sql';
assert.equal(sql('select max(version) from supabase_migrations.schema_migrations'), '126', 'run on a database at migration 126');

// The plan's R0 count query, verbatim (the first sql block after "R0 count query").
const plan = readFileSync('docs/architecture/plans/enrollment-at-payment.md', 'utf8');
const r0 = plan.slice(plan.indexOf('**R0 count query**')).match(/```sql\n([\s\S]*?)```/)[1];
assert.match(r0, /^set transaction read only;/);
const counts = () => Object.fromEntries(sql(`begin;\n${r0}\nrollback;`).split('\n').map(line => {
  const [category, count] = line.split('|');
  return [category.split(' ')[0], Number(count)];
}));

// Whole application catalog (functions in every non-extension schema, tables, columns,
// constraints, indexes, policies, triggers).
const catalog = () => json(`select jsonb_build_object(
 'functions',(select jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_array(md5(p.prosrc),p.prosecdef,p.provolatile,p.proconfig,p.proowner::regrole::text,p.proacl::text,p.prorettype::regtype::text)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname not in ('pg_catalog','information_schema') and not exists (select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')),
 'tables',(select jsonb_object_agg(relnamespace::regnamespace::text||'.'||relname,jsonb_build_array(relrowsecurity,relforcerowsecurity,relacl::text)) from pg_class where relkind='r' and relnamespace in ('public'::regnamespace,'crm_security'::regnamespace)),
 'columns',(select jsonb_object_agg(table_schema||'.'||table_name||'.'||column_name,jsonb_build_array(data_type,is_nullable,column_default)) from information_schema.columns where table_schema in ('public','crm_security')),
 'constraints',(select jsonb_object_agg(conrelid::regclass::text||'.'||conname,pg_get_constraintdef(oid)) from pg_constraint where connamespace='public'::regnamespace),
 'indexes',(select jsonb_object_agg(schemaname||'.'||indexname,indexdef) from pg_indexes where schemaname in ('public','crm_security')),
 'policies',(select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname) from pg_policies p),
 'triggers',(select jsonb_agg(jsonb_build_array(c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid)) order by c.relname,t.tgname) from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace='public'::regnamespace and not t.tgisinternal))::text`);
const diffKeys = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k])).sort();
// Rows the archive and the revert may touch, hashed per table.
const touched = ['enrollments', 'students', 'crm_leads', 'crm_activities', 'crm_tasks', 'activity_log'];
const hashes = () => Object.fromEntries(touched.map(t => [t, sql(`select count(*)||':'||md5(coalesce(string_agg(to_jsonb(x)::text,'' order by to_jsonb(x)::text),'')) from public.${t} x`)]));
const journalCount = () => Number(sql("select count(*) from maintenance.eap_archive_journal"));

// ---------------------------------------------------------------------------
// 1. Seed at 126.
// ---------------------------------------------------------------------------
const asUser = (user, body) => sql(`begin; select set_config('request.jwt.claim.sub', ${q(user)}, true); ${body}; commit;`);
sql(`insert into auth.users(id, email, aud, role, email_confirmed_at, created_at, updated_at) values
  (${q(id(1))}, 'eap-up-director@example.test', 'authenticated', 'authenticated', now(), now(), now()),
  (${q(id(2))}, 'eap-up-reception@example.test', 'authenticated', 'authenticated', now(), now(), now());
update public.profiles set role = case id when ${q(id(1))} then 'director' else 'receptionist' end where id in (${q(id(1))}, ${q(id(2))});
insert into public.groups(id, name, session_type, niveau, annee, capacite_max) values
  (${q(id(21))}, 'Up EAP Yearly C2', 'Yearly', 'Child 2', '2026-2027', 15),
  (${q(id(22))}, 'Up EAP Adults B1', 'Adults', 'B1', '2026-2027', 15);`);
asUser(id(1), `select public.crm_create_followup_policy(gen_random_uuid(), '{"weekly_hours":{"1":[["00:00","23:59"]],"2":[["00:00","23:59"]],"3":[["00:00","23:59"]],"4":[["00:00","23:59"]],"5":[["00:00","23:59"]],"6":[["00:00","23:59"]],"7":[["00:00","23:59"]]}}')`);
const lead = (n, learner) => {
  const l = JSON.parse(sql(`begin; select set_config('request.jwt.claim.sub', ${q(id(2))}, true);
    select (public.crm_create_manual_lead(gen_random_uuid(), jsonb_build_object('display_name', 'Up parent ${n}', 'learner_name', ${q(learner)},
      'phone', '06${String(81000000 + n)}', 'source_label', 'Phone'))->'lead')::text; commit;`).split('\n').pop());
  asUser(id(2), `select public.crm_qualify_lead(gen_random_uuid(), jsonb_build_object('lead_id', ${q(l.id)}, 'expected_version',
    (select version from public.crm_leads where id = ${q(l.id)}), 'conversation_channel', 'phone', 'note', 'x', 'qualification_step', 'enrollment',
    'next_task', jsonb_build_object('task_type', 'enrollment_followup', 'due_at', now() + interval '1 day')))`);
  return l.id;
};
const start = (l, learner, status, extra = '{}') => JSON.parse(sql(`begin; select set_config('request.jwt.claim.sub', ${q(id(2))}, true);
  select public.crm_start_enrollment(gen_random_uuid(), jsonb_build_object('lead_id', ${q(l)}, 'expected_version', (select version from public.crm_leads where id = ${q(l)}),
    'student_choice', 'new', 'learner_name', ${q(learner)}, 'birth_date', '2014-05-10', 'session_type', 'Yearly', 'school_year', '2026/2027', 'level', 'Child 2',
    'candidate_review', crm_security.candidate_token(${q(l)}, ${q(learner)}, '2014-05-10'), 'confirm_new', true, 'initial_status', ${q(status)}) || ${q(extra)}::jsonb)::text; commit;`).split('\n').pop());
const leadA = lead(1, 'Up A unpaid'); const startA = start(leadA, 'Up A unpaid', 'Submitted');
const leadB = lead(2, 'Up B trial'); const startB = start(leadB, 'Up B trial', 'Trial', JSON.stringify({ group_id: id(21) }));
const leadC = lead(3, 'Up C below ten'); const startC = start(leadC, 'Up C below ten', 'Submitted');
const leadD = lead(4, 'Up D converted'); const startD = start(leadD, 'Up D converted', 'Submitted');
// C: a reception payment below 10 % (stays Submitted at 126).
asUser(id(2), `select public.create_charge_payment(jsonb_build_object('student_id', ${q(startC.enrollment.student_id)}, 'enrollment_id', ${q(startC.enrollment.id)},
  'session_type', 'Yearly', 'school_year', '2026/2027', 'level', 'Child 2', 'plan_type', 'Standard', 'gross_amount', 3000, 'payment_amount', 100,
  'payment_method', 'Espèces', 'idempotency_key', gen_random_uuid()))`);
assert.equal(sql(`select status from public.enrollments where id = ${q(startC.enrollment.id)}`), 'Submitted', 'B row: paid below 10 % stays Submitted at 126');
// Reception pre-enrollments (126 function) with and without a group, and an Under Review row.
sql(`insert into public.students(id, full_name, status, session_type) values
  (${q(id(101))}, 'Up E reception', 'Prospect', 'Yearly'), (${q(id(102))}, 'Up F reception grouped', 'Prospect', 'Yearly'),
  (${q(id(103))}, 'Up G under review', 'Prospect', 'Yearly'), (${q(id(104))}, 'Up H public', 'Prospect', 'Yearly'),
  (${q(id(105))}, 'Up I parent request', 'Prospect', 'Yearly'), (${q(id(106))}, 'Up J paid no year', 'Prospect', 'Yearly'),
  (${q(id(107))}, 'Up K paid trial', 'Trial', 'Yearly'), (${q(id(108))}, 'Up L trial file', 'Prospect', 'Yearly'),
  (${q(id(109))}, 'Up M unpaid confirmed', 'Prospect', 'Yearly'), (${q(id(110))}, 'Up N two programmes', 'Prospect', 'Yearly');`);
asUser(id(2), `select public.save_receptionist_enrollment(${q(id(101))}, null, null, 'Submitted', 'Child 2', public.business_date(), null, 'Yearly', '2026/2027');
  select public.save_receptionist_enrollment(${q(id(102))}, null, ${q(id(21))}, 'Submitted', 'Child 2', public.business_date(), null, 'Yearly', '2026/2027');
  select public.save_receptionist_enrollment(${q(id(103))}, null, null, 'Under Review', 'Child 2', public.business_date(), null, 'Yearly', '2026/2027')`);
// Rows only history can produce now (public form, parent request, paid without year, paid Trial,
// a converted lead on an unpaid row, a Trial file without a Trial enrollment, an unpaid Confirmed row).
sql(`insert into public.enrollments(id, student_id, status, session_type, school_year, level, consent_source, notes) values
  (${q(id(204))}, ${q(id(104))}, 'Submitted', 'Yearly', '2026/2027', 'Child 2', 'public_inscription', null),
  (${q(id(205))}, ${q(id(105))}, 'Submitted', null, null, null, null, 'Demande de réinscription envoyée depuis l’espace parent.'),
  (${q(id(206))}, ${q(id(106))}, 'Submitted', 'Yearly', null, 'Child 2', null, null),
  (${q(id(209))}, ${q(id(109))}, 'Confirmed', 'Yearly', '2026/2027', 'Child 2', null, null),
  (${q(id(210))}, ${q(id(110))}, 'Submitted', 'Yearly', '2026/2027', 'Child 2', null, null);
insert into public.enrollments(id, student_id, status, session_type, school_year, level, group_id) values
  (${q(id(207))}, ${q(id(107))}, 'Trial', 'Yearly', '2026/2027', 'Child 2', ${q(id(21))});`);
asUser(id(1), `select public.create_charge_payment(jsonb_build_object('student_id', ${q(id(110))}, 'session_type', 'Adults', 'school_year', '2026/2027',
  'level', 'B1', 'gross_amount', 2000, 'payment_amount', 2000, 'payment_method', 'Espèces', 'idempotency_key', gen_random_uuid()))`);
sql(`set session_replication_role = replica;
insert into public.charges(id, student_id, enrollment_id, session_type, school_year, level, plan_type, gross_amount, service_description, created_by) values
  (${q(id(306))}, ${q(id(106))}, ${q(id(206))}, 'Yearly', '2026/2027', 'Child 2', 'Standard', 3000, 'Yearly · 2026/2027', ${q(id(1))}),
  (${q(id(307))}, ${q(id(107))}, ${q(id(207))}, 'Yearly', '2026/2027', 'Child 2', 'Standard', 3000, 'Yearly · 2026/2027', ${q(id(1))});
insert into public.receipts(id, student_id, charge_id, enrollment_id, date, nom_prenom, montant_total, montant_paye, mode_paiement, session_type, actor_id) values
  (${q(id(406))}, ${q(id(106))}, ${q(id(306))}, ${q(id(206))}, current_date - 3, 'Up J paid no year', 3000, 50, 'Espèces', 'Yearly', ${q(id(1))}),
  (${q(id(407))}, ${q(id(107))}, ${q(id(307))}, ${q(id(207))}, current_date - 3, 'Up K paid trial', 3000, 1000, 'Espèces', 'Yearly', ${q(id(1))});
update public.students set status = 'Trial' where id = ${q(id(108))};
insert into public.crm_activities(id, lead_id, enrollment_id, occurred_at, actor_kind, event_type, source_key, from_status, to_status, body)
values (${q(id(504))}, ${q(leadD)}, ${q(startD.enrollment.id)}, now(), 'system', 'lead_converted', 'conversion:' || ${q(leadD)} || ':' || ${q(startD.enrollment.id)},
  'QUALIFIED', 'CONVERTED', 'Inscription confirmée.');
update public.crm_leads set status = 'CONVERTED', converted_at = now(), conversion_activity_id = ${q(id(504))} where id = ${q(leadD)};
set session_replication_role = origin;`);

const declared = counts();
assert.deepEqual([declared.A1, declared.A2, declared.B, declared.C, declared.D, declared.E, declared.G1, declared.G2, declared.G7, declared.H3, declared.K1, declared.F, declared.M],
  [7, 1, 2, 0, 1, 1, 3, 1, 1, 1, 1, 1, 0], 'R0 counts of the seeded patterns');

// ---------------------------------------------------------------------------
// 2. Apply 127; the catalog moves only in the manifest.
// ---------------------------------------------------------------------------
const before = catalog();
sql(readFileSync(MIGRATION, 'utf8'));
assert.equal(sql('select max(version) from supabase_migrations.schema_migrations'), '126', 'the file alone does not touch the ledger');
const after = catalog();
const changed = diffKeys(before.functions, after.functions);
assert.deepEqual(changed, [
  'academic_security.guard_retired_enrollment_status()',
  'academic_security.place(uuid,uuid,uuid,text,timestamp with time zone,timestamp with time zone,text,boolean)',
  'academic_security.place(uuid,uuid,uuid,text,timestamp with time zone,timestamp with time zone,text,boolean,text)',
  'create_charge_payment(jsonb)', 'create_enrollment(uuid,jsonb)', 'create_public_registration(jsonb,uuid,text)',
  'crm_enroll_and_collect(uuid,jsonb)', 'crm_security.protect_enrollment_link()', 'crm_start_enrollment(uuid,jsonb)',
  'finance_security.unlinked_payment_count(uuid,text,text)', 'get_finance_review_queue(date)',
  'place_learner_in_group(uuid,uuid,timestamp with time zone,uuid,text,timestamp with time zone,text)',
  'place_learner_in_group(uuid,uuid,timestamp with time zone,uuid,text,timestamp with time zone,text,text)',
  'portal_request_reenrollment(uuid)', 'reopen_enrollment(uuid,timestamp with time zone)',
  'save_enrollment_changes(uuid,timestamp with time zone,jsonb)', 'save_receptionist_enrollment(uuid,uuid,uuid,text,text,date,text,text,text)',
].sort(), 'functions changed exactly as the manifest');
for (const name of ['create_charge_payment(jsonb)', 'get_finance_review_queue(date)', 'save_receptionist_enrollment(uuid,uuid,uuid,text,text,date,text,text,text)',
  'create_enrollment(uuid,jsonb)', 'save_enrollment_changes(uuid,timestamp with time zone,jsonb)', 'reopen_enrollment(uuid,timestamp with time zone)',
  'create_public_registration(jsonb,uuid,text)', 'portal_request_reenrollment(uuid)', 'crm_security.protect_enrollment_link()']) {
  assert.deepEqual(after.functions[name].slice(1), before.functions[name].slice(1), `${name}: posture, settings, owner, grants unchanged`);
}
assert.equal(after.functions['crm_start_enrollment(uuid,jsonb)'][5], '{postgres=X/postgres}', 'crm_start_enrollment loses its API grant');
for (const key of ['tables', 'columns', 'constraints', 'indexes', 'policies']) assert.deepEqual(after[key], before[key], `${key} unchanged`);
assert.deepEqual(after.triggers.filter(t => !before.triggers.some(b => JSON.stringify(b) === JSON.stringify(t))).map(t => t[1]),
  ['enrollments_retired_status_guard'], 'one new trigger');
assert.equal(after.triggers.length, before.triggers.length + 1);

// ---------------------------------------------------------------------------
// 3. The archive step.
// ---------------------------------------------------------------------------
const archiveText = readFileSync(ARCHIVE, 'utf8');
const withParams = (text, params) => Object.entries(params).reduce((t, [k, v]) => {
  const re = new RegExp(`select set_config\\('${k.replace('.', '\\.')}', '[^']*', true\\);`);
  assert.match(t, re, `parameter ${k} present`);
  return t.replace(re, `select set_config('${k}', '${v}', true);`);
}, text);
const archive = (dry, overrides = {}) => withParams(archiveText, {
  'eap.expected_a1': declared.A1, 'eap.expected_a2': declared.A2, 'eap.expected_b': declared.B, 'eap.expected_c': declared.C,
  'eap.expected_d': declared.D, 'eap.expected_e': declared.E, 'eap.expected_g1': declared.G1, 'eap.expected_g2': declared.G2,
  'eap.expected_g7': declared.G7, 'eap.dry_run': dry ? 'on' : 'off', ...overrides });
const preArchive = hashes();
assert.match(fails(archive(false, { 'eap.expected_a1': declared.A1 + 1 })), /EAP archive refused: counts differ/);
assert.deepEqual(hashes(), preArchive, 'a wrong count changes nothing');
assert.match(fails(archive(true)), /DRYRUN_OK EAP archive run=[0-9a-f-]+ confirmed=3 ended=9 detached=2 review_flags=1/);
assert.deepEqual(hashes(), preArchive, 'the dry run changes nothing');
assert.equal(journalCount(), 0);
const snapshot = json(`select jsonb_build_object(
  'enrollments', (select jsonb_object_agg(id, jsonb_build_array(status, group_id, school_year, ended_at, end_reason)) from public.enrollments),
  'students', (select jsonb_object_agg(id, jsonb_build_array(status, groupe_id)) from public.students),
  'leads', (select jsonb_object_agg(id, jsonb_build_array(enrollment_id, student_id)) from public.crm_leads))::text`);
sql(archive(false));
const enr = n => json(`select to_jsonb(e) from public.enrollments e where id = ${q(n)}`);
const stu = n => sql(`select status from public.students where id = ${q(n)}`);
assert.equal(sql("select count(*) from public.enrollments where status in ('Submitted','Under Review','Trial')"), '0', 'no retired rows remain');
assert.equal(sql("select count(*) from public.enrollments where status = 'Rejected'"), '0');
for (const e of [startA.enrollment.id, startD.enrollment.id, id(204), id(205), id(210)]) {
  assert.equal(enr(e).status, 'Ended'); assert.match(enr(e).end_reason, /^Pré-inscription abandonnée \(retrait des pré-inscriptions, \d\d\/\d\d\/\d{4}\)$/);
}
assert.match(enr(startB.enrollment.id).end_reason, /^Essai terminé \(retrait des essais, /);
assert.equal(enr(startB.enrollment.id).ended_group_id, id(21));
assert.equal(enr(startC.enrollment.id).status, 'Confirmed', 'B row confirmed');
assert.deepEqual([enr(id(206)).status, enr(id(206)).school_year], ['Confirmed', '2026/2027'], 'F row confirmed with the charge year');
assert.equal(enr(id(207)).status, 'Validated', 'E row (paid Trial) validated in its group');
assert.equal(enr(id(209)).status, 'Confirmed', 'K1 row untouched');
assert.deepEqual([stu(startA.enrollment.student_id), stu(startB.enrollment.student_id), stu(id(101)), stu(id(104))], ['Inactive', 'Inactive', 'Inactive', 'Inactive'], 'Q4: unpaid learners Inactive');
assert.deepEqual([stu(startC.enrollment.student_id), stu(id(106)), stu(id(107)), stu(id(110))], ['Enrolled', 'Enrolled', 'Enrolled', 'Enrolled'], 'paid learners and the two-programme learner Enrolled');
assert.notEqual(stu(id(108)), 'Trial', 'S6: the Trial file without a Trial enrollment is resynced');
const leadRow = l => json(`select to_jsonb(l) from public.crm_leads l where id = ${q(l)}`);
assert.equal(leadRow(leadC).status, 'CONVERTED', 'G2: the paid row converts its lead');
assert.equal(sql(`select count(*) from public.crm_activities where lead_id = ${q(leadC)} and event_type = 'lead_converted'`), '1');
assert.equal(sql(`select count(*) from public.crm_tasks where lead_id = ${q(leadC)} and status = 'open'`), '0', 'G2: open tasks cancelled');
assert.equal(leadRow(leadD).conversion_review_required, true, 'G7: the converted lead on an unpaid row is flagged');
assert.equal(leadRow(leadD).enrollment_id, startD.enrollment.id, 'a converted lead is never detached');
for (const [l, s] of [[leadA, startA], [leadB, startB]]) {
  assert.deepEqual([leadRow(l).enrollment_id, leadRow(l).student_id, leadRow(l).status], [null, s.enrollment.student_id, 'QUALIFIED'], 'detached, learner kept');
  assert.equal(sql(`select count(*) from public.crm_activities where lead_id = ${q(l)} and event_type = 'enrollment_detached'
    and body = 'Pré-inscription archivée : le prospect peut être inscrit à l''encaissement.' and details->>'archived_enrollment_id' = ${q(s.enrollment.id)}`), '1');
  assert.equal(sql(`select count(*) from public.crm_tasks where lead_id = ${q(l)} and status = 'open' and task_type = 'enrollment_followup'`), '1', 'follow-up stays open');
}
assert.equal(sql(`select count(*) from public.crm_external_deliveries`), '0', 'lifecycle outbox dormant');
assert.deepEqual(json(`select jsonb_object_agg(action || ':' || entity, n) from (select action, entity, count(*) n from maintenance.eap_archive_journal group by 1, 2) x`),
  { 'confirmed:enrollments': 3, 'ended:enrollments': 9, 'detached:crm_leads': 2, 'resynced:students': 13 }, 'journal');
const after0 = counts();
assert.deepEqual([after0.J4, after0.A1, after0.B, after0.D, after0.E], [0, 0, 0, 0, 0], 'R0 after the archive: no retired rows');
assert.equal(after0.J1 + after0.J2, declared.J1 + declared.J2 + 3); assert.equal(after0.J3, declared.J3 + 9);
// A second run with zero declared counts finds nothing.
const postArchive = hashes(); const journalAfter = journalCount();
sql(archive(false, Object.fromEntries(['a1', 'a2', 'b', 'c', 'd', 'e', 'g1', 'g2', 'g7'].map(k => [`eap.expected_${k}`, 0]))));
assert.deepEqual(hashes(), postArchive, 'a second run changes nothing'); assert.equal(journalCount(), journalAfter);
// The guard stands after the archive.
assert.match(fails(`insert into public.enrollments(student_id, status) values (${q(id(109))}, 'Submitted')`), /La pré-inscription et l’essai n’existent plus/);

// ---------------------------------------------------------------------------
// 4. The revert.
// ---------------------------------------------------------------------------
const runId = sql('select distinct run_id from maintenance.eap_archive_journal');
const revertText = readFileSync(REVERT, 'utf8');
const revert = (dry, overrides = {}) => withParams(revertText, { 'eap.revert_run_id': runId, 'eap.revert_expected_enrollments': 12,
  'eap.revert_expected_leads': 2, 'eap.dry_run': dry ? 'on' : 'off', ...overrides });
assert.match(fails(revert(false, { 'eap.revert_expected_leads': 3 })), /EAP revert refused: found 12 enrollments and 2 lead links/);
assert.match(fails(revert(true)), /DRYRUN_OK EAP revert run=/);
assert.deepEqual(hashes(), postArchive, 'the revert dry run changes nothing');
const activitiesAfterArchive = sql('select string_agg(id::text, \',\' order by id) from public.crm_activities');
sql(revert(false));
const restored = json(`select jsonb_build_object(
  'enrollments', (select jsonb_object_agg(id, jsonb_build_array(status, group_id, school_year, ended_at, end_reason)) from public.enrollments),
  'students', (select jsonb_object_agg(id, jsonb_build_array(status, groupe_id)) from public.students),
  'leads', (select jsonb_object_agg(id, jsonb_build_array(enrollment_id, student_id)) from public.crm_leads))::text`);
assert.deepEqual(restored, snapshot, 'enrollment rows, learner files and lead links are back to the pre-archive state');
assert.equal(leadRow(leadC).status, 'CONVERTED', 'B2: the conversion stays');
assert.equal(sql(`select count(*) from public.crm_tasks where lead_id = ${q(leadC)} and status = 'open'`), '0', 'B2: cancelled tasks stay cancelled');
const activitiesNow = sql('select string_agg(id::text, \',\' order by id) from public.crm_activities').split(',');
assert(activitiesAfterArchive.split(',').every(a => activitiesNow.includes(a)), 'B2: every activity stays (append-only)');
assert.equal(sql("select count(*) from maintenance.eap_archive_journal where action = 'reverted'"), String(journalAfter));
assert.match(fails(revert(false)), /EAP revert refused: run .* has nothing left to revert/, 'a second revert finds nothing');
// A reverted row is no longer archived: reopen's journal test lets it through again.
assert.equal(sql(`select count(*) from maintenance.eap_archive_journal j where j.action = 'ended' and not exists
  (select 1 from maintenance.eap_archive_journal r where r.action = 'reverted' and r.reverts_id = j.id)`), '0');

// ---------------------------------------------------------------------------
// 5. The forward restore returns the 126 catalog.
// ---------------------------------------------------------------------------
sql(readFileSync(RESTORE, 'utf8'));
const restoredCatalog = catalog();
assert.deepEqual(diffKeys(before.functions, restoredCatalog.functions), [], 'every function is back to its 126 body, posture and grants');
for (const key of ['tables', 'columns', 'constraints', 'indexes', 'policies', 'triggers']) assert.deepEqual(restoredCatalog[key], before[key], `${key} back to 126`);
assert.match(fails(readFileSync(RESTORE, 'utf8')), /Restore 127: migration 127 is not applied/, 'the restore refuses a second time');
console.log('PASS stateful 126→127: R0 counts, manifest-only catalog change, archive refusal/dry run/run/no-op re-run, revert (B2 kept) and restore to the 126 catalog');
