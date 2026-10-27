// Destructive LOCAL synthetic upgrade rehearsal for Batch F (plan PRF-r2): run after
// `supabase db reset --local --version 122 --no-seed`, once per mode.
//   node scripts/test-portal-readiness-upgrade.mjs full
//     seeds the Production patterns on 122 (the migration before this one) (staff only, no portal account, a
//     placeholder learner address, addresses differing only by case or spaces, a
//     teacher with an empty address, receipts, portfolios), applies migration 123
//     and edits, archives and creates a teacher with an empty address (NOT NULL),
//     (the file directly; the ledger stays at 122), proves that no existing row
//     changed, that the catalog changed only in the plan's manifest and that the
//     new constraints are NOT VALID; then runs the clean-up script with wrong
//     counts (refused, nothing changed) and with the right counts (C0 before-image,
//     C1, C2, constraints validated, receipts untouched), and proves it runs once;
//   node scripts/test-portal-readiness-upgrade.mjs corrective
//     applies 123 then the prepared corrective (scripts/portal-readiness-corrective.sql):
//     every RLS policy is the 122 policy again.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const mode = process.argv[2];
assert(['full', 'corrective'].includes(mode), 'usage: full | corrective');
const port = process.env.PORTAL_UPGRADE_PORT || '54322';
const psql = (input, extra = []) => execFileSync('psql', ['-X', '-qAt', '-h', '127.0.0.1', '-p', port, '-U', 'postgres', '-d', 'postgres',
  '-v', 'ON_ERROR_STOP=1', ...extra], { input, encoding: 'utf8', env: { ...process.env, PGPASSWORD: 'postgres' },
  maxBuffer: 64 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const sql = input => psql(input);
const json = input => JSON.parse(sql(input));
const applyFile = (path, extra) => psql(readFileSync(path, 'utf8'), extra);
const failsFile = (path, extra) => { try { applyFile(path, extra); return null; } catch (error) { return String(error.stderr || error.message); } };
const MIGRATION = 'supabase/migrations/123_portal_readiness.sql';
const CLEANUP = 'scripts/portal-readiness-cleanup.sql';
const CORRECTIVE = 'scripts/portal-readiness-corrective.sql';
assert.equal(sql('select max(version) from supabase_migrations.schema_migrations'), '122', 'run on a database at migration 122');
assert.equal(sql("select count(*) from pg_namespace where nspname = 'portal_security'"), '0');
let checks = 0;

const id = n => `f2200000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const catalog = () => json(`select jsonb_build_object(
  'functions', (select jsonb_object_agg(p.oid::regprocedure::text, jsonb_build_array(md5(p.prosrc), p.prosecdef, p.provolatile,
      p.proconfig, p.proowner::regrole::text, p.proacl::text)) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public','crm_security','role_security','operational_security','storage_security','online_security','academic_security','portal_security')
      and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')),
  'triggers', (select jsonb_object_agg(tgrelid::regclass::text || '.' || tgname, pg_get_triggerdef(oid)) from pg_trigger where not tgisinternal
    and tgrelid::regclass::text not like 'pg_%'),
  'constraints', (select jsonb_object_agg(conrelid::regclass::text || '.' || conname, pg_get_constraintdef(oid) || ':' || convalidated)
    from pg_constraint where connamespace = 'public'::regnamespace),
  'policies', (select jsonb_object_agg(schemaname || '.' || tablename || '.' || policyname, jsonb_build_array(qual, with_check, roles::text, cmd, permissive))
    from pg_policies),
  'columns', (select jsonb_object_agg(table_name || '.' || column_name, data_type) from information_schema.columns where table_schema = 'public'))`);
const diffKeys = (a = {}, b = {}) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k])).sort();
// Every existing row of the touched tables, minus the columns 123 adds.
const TABLES = ['students', 'teachers', 'profiles', 'groups', 'enrollments', 'receipts', 'charges', 'portfolios', 'notifications', 'messages',
  'pending_roles', 'attendance', 'assessments', 'placement_tests', 'certificates', 'app_config', 'activity_log'];
const ADDED = { portfolios: ['created_by'], notifications: ['recipient_profile_id'], messages: ['recipient_profile_id', 'sender_profile_id', 'notified_at'],
  pending_roles: ['teacher_id'] };
const rows = () => json(`select jsonb_build_object(${TABLES.map(t => `'${t}', (select coalesce(jsonb_object_agg(x.id::text,
  md5((to_jsonb(x) - '{${(ADDED[t] || []).join(',')}}'::text[])::text)), '{}') from public.${t} x)`).join(', ')})`);

// Production patterns at 122 (synthetic): staff accounts only; one learner address on
// 12 files of different families (also the parent address of 3); addresses that differ
// only by case or spaces; a teacher in mixed case, one with an empty address, one archived.
sql(`begin;
insert into auth.users(id, email, aud, role, email_confirmed_at, created_at, updated_at)
select ('f2200000-0000-4000-8000-' || lpad(to_hex(i), 12, '0'))::uuid, 'pr-up-' || i || '@example.test',
  'authenticated', 'authenticated', now(), now(), now() from generate_series(1, 3) i;
update public.profiles set role = (array['director','admin','receptionist'])[('x' || right(id::text, 4))::bit(16)::integer]
  where id::text like 'f2200000-%';
insert into public.teachers(id, full_name, email, contract_type, deleted_at) values
  ('${id(101)}', 'Up Teacher Mixed', 'Up.Teacher@Example.TEST', 'Freelance', null),
  ('${id(102)}', 'Up Teacher Empty', '', 'Freelance', null),
  ('${id(103)}', 'Up Teacher Archived', 'up-archived@example.test', 'Freelance', now());
insert into public.groups(id, name, session_type, niveau, teacher_id, annee) values ('${id(301)}', 'Up G1', 'Yearly', 'Child 1', '${id(101)}', '2026-2027');
insert into public.students(id, full_name, email, parent_email, status, age_category, session_type)
select ('f2200000-0000-4000-8000-' || lpad(to_hex(200 + i), 12, '0'))::uuid, 'Up Family' || i, 'up-placeholder@example.test',
  case when i <= 3 then 'up-placeholder@example.test' else 'up-parent-' || i || '@example.test' end,
  'Prospect', 'Young Learners (6-12)', 'Yearly' from generate_series(1, 12) i;
insert into public.students(id, full_name, email, parent_email, status, age_category, session_type) values
  ('${id(221)}', 'Up Case One', null, 'Up.Parent@Example.test', 'Prospect', 'Young Learners (6-12)', 'Yearly'),
  ('${id(222)}', 'Up Case Two', null, ' up-space@example.test ', 'Prospect', 'Young Learners (6-12)', 'Yearly'),
  ('${id(223)}', 'Up Case Adult', 'Up.Adult@Example.TEST', null, 'Prospect', 'Adults (18+)', 'Adults'),
  ('${id(224)}', 'Up Empty Address', '', '', 'Prospect', 'Adults (18+)', 'Adults');
insert into public.enrollments(student_id, group_id, status, session_type, school_year, level) values
  ('${id(201)}', '${id(301)}', 'Validated', 'Yearly', '2026/2027', 'Child 1'),
  ('${id(221)}', '${id(301)}', 'Validated', 'Yearly', '2026/2027', 'Child 1');
set local session_replication_role = replica;
insert into public.receipts(id, student_id, receipt_number, date, nom_prenom, email, montant_total, montant_paye, mode_paiement,
  email_delivery_status) values ('${id(401)}', '${id(201)}', 'EH-UP-1', current_date, 'Up Family1', 'up-placeholder@example.test', 100, 100,
  'Espèces', 'sent');
set local session_replication_role = origin;
insert into public.portfolios(id, student_id, title, project_type, teacher_id, teacher_note) values
  ('${id(501)}', '${id(201)}', 'Up project', 'Other', '${id(101)}', 'feedback'),
  ('${id(502)}', '${id(221)}', 'Up project 2', 'Other', null, null);
insert into public.notifications(id, type, recipient_email, student_id, subject, message, sent)
  values ('${id(601)}', 'general', 'up.parent@example.test', '${id(221)}', 'Up notice', 'x', true),
  -- Re-review N3: a staff notice and a message whose addresses differ only by case or spaces.
  ('${id(602)}', 'general', 'PR-UP-1@Example.test', null, 'Up staff notice', 'x', true);
insert into public.messages(id, from_user_email, to_user_email, subject, body, student_id)
  values ('${id(701)}', 'PR-UP-2@Example.test', ' Up.Parent@Example.test ', 'Up message', 'x', '${id(221)}');
commit;`);

const beforeCatalog = catalog();
const beforeRows = rows();
applyFile(MIGRATION);
const afterCatalog = catalog();
assert.deepEqual(rows(), beforeRows, 'migration 123 changes no existing row');
checks++;

if (mode === 'corrective') {
  applyFile(CORRECTIVE);
  assert.deepEqual(diffKeys(beforeCatalog.policies, catalog().policies), [], 'every policy is the 122 policy again');
  assert.deepEqual(rows(), beforeRows, 'the corrective changes no row');
  console.log('PASS corrective: every RLS policy is back at its pre-123 definition; no row changed');
  process.exit(0);
}

// The catalog changed only in the plan's manifest.
const RECREATED = ['public.get_visible_student_ids()', 'public.get_my_teacher_id()', 'public.get_my_email()',
  'public.teacher_can_access_student_group(uuid,uuid)', 'public.can_message_recipient(text)', 'public.get_teacher_directory(uuid)',
  'public.resolve_storage_asset(uuid)', 'storage_security.can_write(uuid,text,uuid,uuid,uuid)', 'public.prepare_role_invitation(text,text)',
  'public.apply_pending_role()', 'public.log_activity()', 'public.mark_my_notifications_read()', 'public.mark_message_read(uuid)',
  'online_security.caller_teacher_id()'];
const GRANTS_ONLY = ['public.get_my_role()', 'public.get_my_student_id()', 'public.handle_new_auth_user()', 'public.handle_new_receipt()',
  'public.notify_premium_homework_teacher()', 'public.sync_premium_membership_entitlement()'];
const NEW_PUBLIC = ['portal_teacher_roster(uuid)', 'portal_my_learners()', 'portal_learner_record(uuid)', 'portal_request_reenrollment(uuid)',
  'portal_message_recipients()', 'portal_send_message(text,text,text,uuid,uuid)', 'portal_my_messages(text,timestamp with time zone)',
  'preview_family_invitation(text,text)', 'prepare_family_invitation(text,text,uuid[])', 'prepare_teacher_invitation(text,uuid)',
  'link_family_student(uuid,uuid)', 'link_teacher_account(uuid,uuid)', 'revoke_family_link(uuid,text)', 'list_family_links(uuid)'].map(f => 'public.' + f);
// regprocedure prints public functions without their schema (public is on the search path).
const bare = f => f.replace(/^public\./, '');
for (const list of [RECREATED, GRANTS_ONLY, NEW_PUBLIC]) list.splice(0, list.length, ...list.map(bare));
const changedFunctions = diffKeys(beforeCatalog.functions, afterCatalog.functions);
{
  const actual = changedFunctions.filter(f => !f.startsWith('portal_security.')), expected = [...RECREATED, ...GRANTS_ONLY, ...NEW_PUBLIC];
  assert.deepEqual({ unexpected: actual.filter(f => !expected.includes(f)), missing: expected.filter(f => !actual.includes(f)) },
    { unexpected: [], missing: [] }, 'functions: the manifest only');
}
for (const f of GRANTS_ONLY) assert.equal(beforeCatalog.functions[f][0], afterCatalog.functions[f][0], f + ': body unchanged');
for (const f of ['get_my_role()', 'get_my_student_id()'])
  assert.equal(afterCatalog.functions[f][5], '{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}', f + ' grants');
const changedPolicies = diffKeys(beforeCatalog.policies, afterCatalog.policies);
const EXPECTED_POLICIES = [
  ...['students parent read self', 'students student read self', 'students teacher read groups'].map(p => 'public.students.' + p),
  ...['enrollments parent select', 'enrollments parent insert', 'enrollments teacher read'].map(p => 'public.enrollments.' + p),
  'public.receipts.receipts parent read', 'public.receipts.receipts student financial read', 'public.charges.charges family read',
  ...['placement parent read', 'placement student read', 'placement teacher rw', 'placement teacher select', 'placement teacher insert',
    'placement teacher update'].map(p => 'public.placement_tests.' + p),
  ...['attendance parent read', 'attendance student read', 'attendance teacher delete', 'attendance teacher insert', 'attendance teacher select',
    'attendance teacher update'].map(p => 'public.attendance.' + p),
  'public.certificates.certificates parent read', 'public.certificates.certificates student read',
  ...['assessments teacher rw', 'assessments teacher select', 'assessments teacher insert', 'assessments teacher update'].map(p => 'public.assessments.' + p),
  ...['learnassess teacher rw', 'learnassess teacher select', 'learnassess teacher insert', 'learnassess teacher update'].map(p => 'public.learning_assessments.' + p),
  ...['portfolios teacher rw', 'portfolios teacher select', 'portfolios teacher insert', 'portfolios teacher update', 'portfolios student update',
    'portfolios student delete'].map(p => 'public.portfolios.' + p),
  'public.notifications.notifications self read', 'public.messages.messages self read', 'public.messages.messages self insert',
  'public.groups.groups read all auth', 'public.app_config.appconfig auth read', 'public.announcements.announcements audience read',
  'public.family_links.' /* none: RLS on, no policy */].filter(p => !p.endsWith('.'));
assert.deepEqual(changedPolicies, EXPECTED_POLICIES.sort(), 'policies: the manifest only; staff policies untouched');
assert.ok(changedPolicies.every(p => !/admin|staff|receptionist|director/.test(p.split('.').pop())), 'no staff policy changed');
const newConstraints = diffKeys(beforeCatalog.constraints, afterCatalog.constraints);
assert.ok(['students.students_email_normalized', 'students.students_parent_email_normalized', 'teachers.teachers_email_normalized',
  'messages.messages_emails_normalized', 'notifications.notifications_recipient_email_normalized']
  .every(c => newConstraints.includes(c) && afterCatalog.constraints[c].endsWith(':false')), 'D9 constraints added NOT VALID');
assert.deepEqual(diffKeys(beforeCatalog.columns, afterCatalog.columns), ['family_links.activated_at', 'family_links.created_at',
  'family_links.created_by', 'family_links.id', 'family_links.invite_email', 'family_links.pending_role_id', 'family_links.profile_id',
  'family_links.relation', 'family_links.revoke_reason', 'family_links.revoked_at', 'family_links.revoked_by', 'family_links.status',
  'family_links.student_id', 'messages.notified_at', 'messages.recipient_profile_id', 'messages.sender_profile_id', 'notifications.recipient_profile_id',
  'pending_roles.teacher_id', 'portfolios.created_by'], 'columns: the manifest only');
assert.deepEqual(json(`select to_jsonb(portal_security.readiness_failures())`), ['office recipient is not configured',
  'an address is on more than 10 learner files', 'e-mail normalisation constraints are not validated']);
checks += 8;
console.log('PASS 122 → 123: no existing row changed; functions, policies, constraints and columns exactly the manifest');

// Clean-up: wrong counts are refused and change nothing; the right counts run C0–C2 once.
const counts = { c1_parent: 2, c1_email: 1, c1_teacher: 1, c1_message: 1, c1_notification: 1, c2_email: 12, c2_parent: 3 };
const vars = c => Object.entries(c).flatMap(([k, v]) => ['-v', `${k}=${v}`]);
const refused = failsFile(CLEANUP, vars({ ...counts, c2_email: 33 }));
assert.match(refused, /C2: expected 33 learner files/);
assert.deepEqual(rows(), beforeRows, 'a refused clean-up changes nothing');
assert.equal(sql(`select to_regclass('maintenance.portal_cleanup_before') is null`), 't', 'nor creates the before-image');
assert.match(failsFile(CLEANUP, vars({ ...counts, c1_parent: 4 })), /C1: expected 4 parent addresses/);
assert.match(failsFile(CLEANUP, vars({ ...counts, c1_message: 0 })), /C1: expected 0 message rows/);
assert.match(failsFile(CLEANUP, vars({ ...counts, c1_notification: 0 })), /C1: expected 0 notification rows/);
// Re-review N2: an archived record that differs from the mixed-case active teacher only by
// case is found by the pre-check, not as a raw unique violation during the update.
sql(`insert into public.teachers(id, full_name, email, contract_type, deleted_at) values
  ('${id(105)}', 'Up Teacher Archived Twin', 'up.teacher@example.test', 'Freelance', now());`);
assert.match(failsFile(CLEANUP, vars(counts)), /C1: a teacher address differs from another teacher record \(active or archived\)/);
sql(`delete from public.teachers where id = '${id(105)}';`);
assert.deepEqual(rows(), beforeRows, 'the refused clean-ups changed nothing');
const result = JSON.parse(applyFile(CLEANUP, vars(counts)).split('\n').filter(Boolean).pop());
assert.equal(result.c2_rows, 12); assert.equal(result.c1_rows, 6); assert.equal(result.placeholder_left, 0);
assert.deepEqual(result.readiness_failures, ['office recipient is not configured']);
assert.equal(sql(`select string_agg(conname || ':' || convalidated, ',' order by conname) from pg_constraint where conname like '%email%normalized'`),
  'messages_emails_normalized:true,notifications_recipient_email_normalized:true,students_email_normalized:true,'
  + 'students_parent_email_normalized:true,teachers_email_normalized:true');
assert.equal(sql(`select parent_email || '|' || (select parent_email from public.students where id = '${id(222)}') || '|' ||
  (select email from public.students where id = '${id(223)}') || '|' || (select email from public.teachers where id = '${id(101)}')
  from public.students where id = '${id(221)}'`), 'up.parent@example.test|up-space@example.test|up.adult@example.test|up.teacher@example.test');
assert.equal(sql(`select count(*) from public.students where email = 'up-placeholder@example.test' or parent_email = 'up-placeholder@example.test'`), '0');
assert.equal(sql(`select email from public.receipts where id = '${id(401)}'`), 'up-placeholder@example.test', 'issued receipts unchanged');
assert.equal(sql(`select count(*) from maintenance.portal_cleanup_before`), '18');
assert.equal(sql(`select (select from_user_email || '|' || to_user_email || '|' || (recipient_profile_id is null) from public.messages where id = '${id(701)}')
  || '|' || (select recipient_email || '|' || (recipient_profile_id = '${id(1)}') from public.notifications where id = '${id(602)}')`),
  'pr-up-2@example.test|up.parent@example.test|true|pr-up-1@example.test|true',
  'messages and notifications normalised; no family account named, the staff notice names its staff account');
assert.equal(sql(`select has_table_privilege('authenticated', 'maintenance.portal_cleanup_before', 'SELECT')
  or has_table_privilege('service_role', 'maintenance.portal_cleanup_before', 'SELECT')`), 'f', 'the before-image has no API grant');
assert.match(failsFile(CLEANUP, vars({ ...counts, c2_email: 0, c2_parent: 0, c1_parent: 0, c1_email: 0, c1_teacher: 0, c1_message: 0, c1_notification: 0 })), /already ran/);
checks += 17;
console.log('PASS clean-up: wrong counts refused with no change; C0 before-image, C1, C2, constraints validated, receipts untouched, runs once');
// Review B1: teachers.email is NOT NULL. A teacher with an empty address (one exists
// in Production) can still be edited, archived and created after 123 and the clean-up
// (constraints validated); '' stays ''.
sql(`update public.teachers set full_name = 'Up Teacher Empty Edited' where id = '${id(102)}';
  update public.teachers set deleted_at = now() where id = '${id(102)}';`);
// A blank value is kept as stored: the unique teachers_email_key already holds ''
// (teacher 102), so a second blank teacher must not be rewritten to ''.
sql(`insert into public.teachers(id, full_name, email, contract_type) values ('${id(104)}', 'Up Teacher New Blank', '  ', 'Freelance');
  update public.teachers set full_name = 'Up Teacher Blank Edited' where id = '${id(104)}';`);
assert.equal(sql(`select string_agg(quote_literal(email) || ':' || (deleted_at is not null), ',' order by id) from public.teachers
  where id in ('${id(102)}', '${id(104)}')`), "'':true,'  ':false");
checks++;
console.log('PASS a teacher with an empty address is edited, archived and created after 123 (NOT NULL kept)');

console.log(`PASS portal readiness upgrade rehearsal (${mode}): ${checks} checks`);
