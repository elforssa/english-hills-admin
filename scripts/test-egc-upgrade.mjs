// Destructive LOCAL synthetic upgrade rehearsal for Batch D (plan EGC-r2): run
// after `supabase db reset --local --version 119 --no-seed`, once per mode.
//   node scripts/test-egc-upgrade.mjs full
//     seeds the Production patterns on 119, applies M1 (the file directly; the
//     ledger stays at 119), proves the catalog changed only in the M1 manifest and
//     that every union reader answers as before, places a dossier-only Yearly
//     learner in a second programme (DAT-1 before M2), runs the clean-up cores
//     C1, C1b, C2-C5 with the counts the dry-run queries read, checks C6, applies
//     M2 and proves the enrollment-only readers and the validated invariants;
//   node scripts/test-egc-upgrade.mjs skip-c1b
//     the same without C1b: M2 refuses on I9 and changes nothing;
//   node scripts/test-egc-upgrade.mjs revert-m1
//     applies M1, uses the leaver command, then the prepared revert
//     (scripts/egc-revert-m1.sql): the catalog is the 119 catalog again, apart from
//     the kept Ended value and columns.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const mode = process.argv[2];
assert(['full', 'skip-c1b', 'revert-m1'].includes(mode), 'usage: full | skip-c1b | revert-m1');
const port = process.env.EGC_UPGRADE_PORT || '54322';
const psql = (input, extra = []) => execFileSync('psql', ['-X', '-qAt', '-h', '127.0.0.1', '-p', port, '-U', 'postgres', '-d', 'postgres',
  '-v', 'ON_ERROR_STOP=1', ...extra], { input, encoding: 'utf8', env: { ...process.env, PGPASSWORD: 'postgres' },
  maxBuffer: 64 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const sql = input => psql(input);
const json = input => JSON.parse(sql(input));
const applyFile = path => psql(readFileSync(path, 'utf8'));
const failsFile = path => { try { applyFile(path); return null; } catch (error) { return String(error.stderr || error.message); } };
const M1 = 'supabase/migrations/120_enrollment_group_consistency.sql';
const M2 = 'supabase/migrations/121_enrollment_group_consistency_enforce.sql';
const REVERT = 'scripts/egc-revert-m1.sql';
assert.equal(sql('select max(version) from supabase_migrations.schema_migrations'), '119', 'run on a database at migration 119');
assert.equal(sql("select count(*) from pg_namespace where nspname = 'academic_security'"), '0');

const id = n => `e9d00000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const q = v => `'${String(v).replaceAll("'", "''")}'`;

// Whole application catalog: function bodies and attributes, triggers, constraints, indexes, policies.
const catalog = () => json(`select jsonb_build_object(
  'functions', (select jsonb_object_agg(p.oid::regprocedure::text, jsonb_build_array(md5(p.prosrc), p.prosecdef, p.provolatile,
      p.proconfig, p.proowner::regrole::text, p.proacl::text)) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public','crm_security','role_security','operational_security','storage_security','online_security','academic_security')
      and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')),
  'triggers', (select jsonb_object_agg(tgrelid::regclass::text || '.' || tgname, pg_get_triggerdef(oid)) from pg_trigger where not tgisinternal
    and tgrelid::regclass::text not like 'pg_%'),
  'constraints', (select jsonb_object_agg(conrelid::regclass::text || '.' || conname, pg_get_constraintdef(oid) || ':' || convalidated)
    from pg_constraint where connamespace = 'public'::regnamespace),
  'indexes', (select jsonb_object_agg(indexrelid::regclass::text, pg_get_indexdef(indexrelid)) from pg_index i join pg_class c on c.oid = i.indrelid
    where c.relnamespace = 'public'::regnamespace),
  'policies', (select jsonb_object_agg(schemaname || '.' || tablename || '.' || policyname, jsonb_build_array(qual, with_check, roles::text, cmd))
    from pg_policies),
  'columns', (select jsonb_object_agg(table_name || '.' || column_name, data_type) from information_schema.columns where table_schema = 'public'))`);
const diffKeys = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k])).sort();

// ---------------------------------------------------------------------------
// Production patterns at 119 (synthetic): dossier-only members with attendance,
// legacy Validated rows without programme, year or group, a grouped Validated
// row without year, former learners with a legacy balance, an archived learner
// with a Confirmed enrollment, Mise à niveau learners paid on a legacy charge,
// regular members, a teacher and a parent.
// ---------------------------------------------------------------------------
const seed = () => sql(`
insert into auth.users(id, email, aud, role, email_confirmed_at, created_at, updated_at) values
  (${q(id(1))}, 'egc-up-director@example.test', 'authenticated', 'authenticated', now(), now(), now()),
  (${q(id(2))}, 'egc-up-reception@example.test', 'authenticated', 'authenticated', now(), now(), now()),
  (${q(id(3))}, 'egc-up-teacher-a@example.test', 'authenticated', 'authenticated', now(), now(), now()),
  (${q(id(4))}, 'egc-up-teacher-b@example.test', 'authenticated', 'authenticated', now(), now(), now()),
  (${q(id(5))}, 'egc-up-parent@example.test', 'authenticated', 'authenticated', now(), now(), now());
update public.profiles set role = case id when ${q(id(1))} then 'director' when ${q(id(2))} then 'receptionist'
  when ${q(id(5))} then 'parent' else 'teacher' end where id in (${[1, 2, 3, 4, 5].map(n => q(id(n))).join(',')});
insert into public.teachers(id, full_name, email, contract_type) values
  (${q(id(11))}, 'Up Teacher A', 'egc-up-teacher-a@example.test', 'Freelance'),
  (${q(id(12))}, 'Up Teacher B', 'egc-up-teacher-b@example.test', 'Freelance');
insert into public.groups(id, name, session_type, niveau, teacher_id, annee, capacite_max) values
  (${q(id(21))}, 'Up Yearly C1', 'Yearly', 'Child 1', ${q(id(11))}, '2026-2027', 15),
  (${q(id(22))}, 'Up MAN A1', 'Mise à niveau', 'A1', ${q(id(12))}, '2026-2027', 15);
set session_replication_role = replica;
insert into public.students(id, full_name, email, parent_email, status, session_type, niveau_cefr, groupe_id, created_at, deleted_at) values
  (${q(id(101))}, 'Up dossier member', null, 'egc-up-parent@example.test', 'Enrolled', 'Yearly', 'Child 1', ${q(id(21))}, '2026-07-01', null),
  (${q(id(102))}, 'Up dossier second programme', null, null, 'Enrolled', 'Yearly', 'Child 1', ${q(id(21))}, '2026-07-01', null),
  (${q(id(103))}, 'Up enrolled member', null, null, 'Enrolled', 'Yearly', 'Child 1', ${q(id(21))}, '2026-07-01', null),
  (${q(id(104))}, 'Up past programme', null, null, 'Enrolled', 'Summer Camp', null, null, '2026-05-01', null),
  (${q(id(105))}, 'Up grouped legacy row', null, null, 'Enrolled', 'Yearly', 'Child 1', ${q(id(21))}, '2026-05-01', null),
  (${q(id(106))}, 'Up no school year', null, null, 'Enrolled', 'Yearly', 'Child 1', ${q(id(21))}, '2026-05-01', null),
  (${q(id(107))}, 'Up former learner', null, null, 'Enrolled', 'Communication Adult', null, null, '2026-02-01', null),
  (${q(id(108))}, 'Up archived', null, null, 'Enrolled', 'Adults', null, null, '2026-02-01', now()),
  (${q(id(109))}, 'Up MAN legacy payer', null, null, 'Enrolled', 'Mise à niveau', null, null, '2026-08-20', null);
insert into public.enrollments(id, student_id, group_id, status, session_type, school_year, level, date_inscription) values
  (${q(id(203))}, ${q(id(103))}, ${q(id(21))}, 'Validated', 'Yearly', '2026/2027', 'Child 1', '2026-09-01'),
  (${q(id(204))}, ${q(id(104))}, null, 'Validated', null, null, null, '2026-05-24'),
  (${q(id(205))}, ${q(id(105))}, null, 'Validated', null, null, null, '2026-05-24'),
  (${q(id(206))}, ${q(id(106))}, ${q(id(21))}, 'Validated', 'Yearly', null, 'Child 1', '2026-05-24'),
  (${q(id(208))}, ${q(id(108))}, null, 'Confirmed', 'Adults', '2026/2027', null, '2026-09-01'),
  (${q(id(212))}, ${q(id(102))}, null, 'Confirmed', 'Mise à niveau', '2026/2027', null, '2026-09-10');
insert into public.attendance(student_id, group_id, session_date, status) values
  (${q(id(101))}, ${q(id(21))}, current_date - 30, 'Présent'), (${q(id(103))}, ${q(id(21))}, current_date - 30, 'Présent');
insert into public.charges(id, student_id, session_type, school_year, service_description, plan_type, gross_amount, legacy, created_by) values
  (${q(id(301))}, ${q(id(101))}, 'Yearly', '2026/2027', 'Yearly · 2026/2027', 'Standard', 5000, false, ${q(id(1))}),
  (${q(id(307))}, ${q(id(107))}, 'Legacy', null, 'Reçu historique UP1', null, 700, true, null),
  (${q(id(309))}, ${q(id(109))}, 'Legacy', null, 'Reçu historique UP2', null, 1500, true, null);
insert into public.receipts(id, student_id, charge_id, date, nom_prenom, montant_total, montant_paye, mode_paiement, session_type, legacy, actor_id)
values (${q(id(409))}, ${q(id(109))}, ${q(id(309))}, current_date - 5, 'Up MAN legacy payer', 1500, 500, 'Espèces', 'Legacy', true, ${q(id(1))});
insert into public.announcements(id, title, body, group_id, audience) values
  (${q(id(501))}, 'Up Yearly', 'Y', ${q(id(21))}, 'group'), (${q(id(502))}, 'Up MAN', 'M', ${q(id(22))}, 'group');
set session_replication_role = origin;`);

// The readers' answers as each role (union readers before M2).
const as = (user, query) => `begin; set local request.jwt.claim.sub = ${q(user)};
  set local request.jwt.claims = ${q(JSON.stringify({ sub: user, role: 'authenticated' }))};
  set local role authenticated; ${query}; rollback;`;
const readers = () => ({
  attendance: sql(`select string_agg(s.id || ':' || g.id || ':' || public.attendance_student_in_group(s.id, g.id), ',' order by s.id, g.id)
    from public.students s, public.groups g where s.id::text like 'e9d00000-%' and g.id::text like 'e9d00000-%'`),
  teacherA: sql(as(id(3), `select string_agg(s.id || ':' || public.teacher_can_access_student_group(s.id, null), ',' order by s.id)
    from (select id from public.students where id::text like 'e9d00000-%' and deleted_at is null) s`)),
  parentAnnouncements: sql(as(id(5), `select coalesce(string_agg(id::text, ',' order by id), '') from public.announcements where id::text like 'e9d00000-%'`)),
  parentMessages: sql(as(id(5), `select public.can_message_recipient('egc-up-teacher-a@example.test') || ',' || public.can_message_recipient('egc-up-teacher-b@example.test')`)),
  // M1 adds null ended_* keys to enrollment rows; compare the list's projection.
  directorList: sql(as(id(1), `select jsonb_agg(jsonb_build_object('id', r->>'id', 'group', r->>'group_name', 'status', r->>'status',
      'pending', (select jsonb_agg(p->>'id' order by p->>'id') from jsonb_array_elements(r->'pending_enrollments') p)) order by r->>'id')::text
    from jsonb_array_elements(public.search_students_page(p_search => 'Up ', p_status => 'all_shown', p_page_size => 50)->'rows') r`)),
  directorUnassigned: sql(as(id(1), `select r from (select (public.search_students_page(p_search => 'Up ', p_status => 'all_shown', p_group => 'unassigned', p_page_size => 50)->'count')::text r) x`)),
  receptionUnassigned: sql(as(id(2), `select r from (select (public.search_students_page(p_search => 'Up ', p_status => 'all_shown', p_group => 'unassigned', p_page_size => 50)->'count')::text r) x`)),
});

if (mode === 'revert-m1') {
  const before = catalog();
  applyFile(M1);
  sql(`insert into auth.users(id, email, aud, role, created_at, updated_at) values (${q(id(1))}, 'egc-up-director@example.test', 'authenticated', 'authenticated', now(), now());
    update public.profiles set role = 'director' where id = ${q(id(1))};
    insert into public.groups(id, name, session_type, niveau, annee) values (${q(id(21))}, 'Up Yearly C1', 'Yearly', 'Child 1', '2026-2027');
    insert into public.students(id, full_name) values (${q(id(101))}, 'Up leaver');`);
  sql(as(id(1), `select public.place_learner_in_group(${q(id(101))}, ${q(id(21))}, (select updated_at from public.students where id = ${q(id(101))}));
    select public.end_learner(${q(id(101))}, (select updated_at from public.students where id = ${q(id(101))}), 'Alumni', 'Fin')`).replace('rollback;', 'commit;'));
  assert.equal(sql(`select status from public.enrollments where student_id = ${q(id(101))}`), 'Ended');
  applyFile(REVERT);
  const after = catalog();
  const changed = { functions: diffKeys(before.functions, after.functions), triggers: diffKeys(before.triggers, after.triggers),
    constraints: diffKeys(before.constraints, after.constraints), indexes: diffKeys(before.indexes, after.indexes),
    policies: diffKeys(before.policies, after.policies), columns: diffKeys(before.columns, after.columns) };
  assert.deepEqual(changed, {
    functions: [], triggers: [], policies: [],
    constraints: ['enrollments.enrollments_end_reason_length', 'enrollments.enrollments_ended_group_id_fkey', 'enrollments.enrollments_status_check'],
    indexes: ['enrollments_ended_group_idx'],
    columns: ['enrollments.end_reason', 'enrollments.ended_at', 'enrollments.ended_by', 'enrollments.ended_group_id'],
  }, 'the revert restores the 119 catalog except the kept Ended value and columns');
  assert.equal(sql("select count(*) from pg_namespace where nspname in ('academic_security','maintenance')"), '0');
  assert.equal(sql(`select status from public.enrollments where student_id = ${q(id(101))}`), 'Ended', 'command-ended rows stay Ended');
  console.log('PASS M1 → prepared revert: functions, triggers, policies and checks back to 119; Ended value and columns kept');
  process.exit(0);
}

seed();
const before = catalog();
const readersBefore = readers();
// Every row of the tables M1 touches, as text (the new columns are ignored).
const rows = () => sql(`select md5(string_agg(t, '|' order by t)) from (
  select (to_jsonb(s) - 'updated_at')::text t from public.students s union all
  select (to_jsonb(e) - array['ended_at','ended_by','end_reason','ended_group_id'])::text from public.enrollments e union all
  select to_jsonb(c)::text from public.charges c union all select to_jsonb(r)::text from public.receipts r union all
  select to_jsonb(a)::text from public.attendance a union all select to_jsonb(g)::text from public.groups g) x`);
const rowsBefore = rows();
applyFile(M1);
assert.equal(rows(), rowsBefore, 'M1 changes no existing row');
const afterM1 = catalog();
assert.equal(sql('select max(version) from supabase_migrations.schema_migrations'), '119', 'M1 applied as a file; ledger unchanged');
// The catalog changed only in the M1 manifest.
// enforce_enrollment_student_sync() is re-created byte-identical (072 already treats Ended as a downgrade).
const RECREATED = ['sync_student_from_enrollments(uuid,boolean,uuid)',
  'check_enrollment_student_sync()', 'create_charge_payment(jsonb)',
  'assign_receptionist_student_group(uuid,uuid,uuid,timestamp with time zone,timestamp with time zone)',
  'save_receptionist_student(uuid,timestamp with time zone,jsonb)',
  'save_receptionist_enrollment(uuid,uuid,uuid,text,text,date,text,text,text)', 'soft_delete_student(uuid)',
  'remove_student_group(uuid,uuid)', 'crm_security.evaluate_conversion(uuid,timestamp with time zone,text,text)',
  'crm_start_enrollment(uuid,jsonb)', 'online_close_course(uuid,bigint)'];
const NEW_PUBLIC = ['place_learner_in_group(uuid,uuid,timestamp with time zone,uuid,text,timestamp with time zone,text)',
  'remove_learner_from_group(uuid,uuid,timestamp with time zone,uuid,timestamp with time zone)',
  'end_learner(uuid,timestamp with time zone,text,text,uuid[])', 'close_school_year(text,integer,text)',
  'reopen_enrollment(uuid,timestamp with time zone)', 'restore_student(uuid)', 'list_archived_students(integer,integer)',
  'create_enrollment(uuid,jsonb)', 'save_enrollment_changes(uuid,timestamp with time zone,jsonb)', 'my_member_group_ids()'];
const fnChanged = diffKeys(before.functions, afterM1.functions);
const added = fnChanged.filter(k => !(k in before.functions)), dropped = fnChanged.filter(k => !(k in afterM1.functions));
const modified = fnChanged.filter(k => k in before.functions && k in afterM1.functions);
assert.deepEqual(dropped, ['sync_enrollments_from_student()'], 'only the 074 student-form sync is dropped');
assert.deepEqual(modified, [...RECREATED].sort(), 'exactly the M1 manifest is re-created');
assert.deepEqual(afterM1.functions['enforce_enrollment_student_sync()'], before.functions['enforce_enrollment_student_sync()'], 'enforce unchanged');
assert.deepEqual(added.filter(k => !k.startsWith('academic_security.')), [...NEW_PUBLIC].sort(), 'new public commands');
for (const name of [...RECREATED, ...NEW_PUBLIC]) {
  const [, definer, , config, owner, acl] = afterM1.functions[name];
  if (name in before.functions) {
    const old = before.functions[name];
    // remove_student_group becomes SECURITY DEFINER (plan D-1); owner and ACL never change.
    assert.equal(owner, old[4], name); assert.equal(acl, old[5], name);
    if (name !== 'remove_student_group(uuid,uuid)') { assert.equal(definer, old[1], name); assert.deepEqual(config, old[3], name); }
  } else {
    assert.equal(definer, true, name);
    assert.deepEqual(config, ['search_path=pg_catalog, pg_temp'], name);
    assert(!/[{,](anon)?=X\//.test(acl || ''), `${name}: no anon or PUBLIC execute (${acl})`);
  }
}
assert.deepEqual(diffKeys(before.policies, afterM1.policies), [], 'M1 changes no policy');
assert.deepEqual(diffKeys(before.triggers, afterM1.triggers), ['enrollments.enrollment_group_capacity', 'enrollments.enrollments_history_guard',
  'groups.groups_membership_level_guard', 'students.student_enrollment_assignment_sync', 'students.students_membership_guard'], 'M1 triggers');
assert.deepEqual(readers(), readersBefore, 'every union reader answers exactly as before M1');
console.log('PASS 119 → M1: only the manifest changed, no existing row rewritten, union readers unchanged');

// DAT-1 before M2: a dossier-only Yearly learner placed in a second programme stays in the Yearly roster.
sql(as(id(1), `select public.place_learner_in_group(${q(id(102))}, ${q(id(22))}, (select updated_at from public.students where id = ${q(id(102))}))`).replace('rollback;', 'commit;'));
assert.equal(sql(`select groupe_id from public.students where id = ${q(id(102))}`), id(21), 'the dossier group stays the main group (M1 transition)');
assert.equal(sql(`select public.attendance_student_in_group(${q(id(102))}, ${q(id(21))}) and public.attendance_student_in_group(${q(id(102))}, ${q(id(22))})`), 't',
  'both rosters before the clean-up');
console.log('PASS DAT-1 under M1: a dossier-only member placed in a second programme keeps the Yearly roster');

// B1 (review): before M2, a notes edit, a rejection and a deletion of non-member
// enrollments that carry the file group keep it; the explicit removal of the
// dossier-only placement clears it and keeps the status. Rolled back.
assert.equal(sql(`begin;
set local session_replication_role = replica;
insert into public.students(id, full_name, status, session_type, niveau_cefr, groupe_id) values
  (${q(id(110))}, 'Up B1 dossier', 'Enrolled', 'Yearly', 'Child 1', ${q(id(21))});
set local session_replication_role = origin;
insert into public.enrollments(id, student_id, group_id, status, session_type, school_year, level) values
  (${q(id(220))}, ${q(id(110))}, ${q(id(21))}, 'Submitted', 'Yearly', '2026/2027', 'Child 1'),
  (${q(id(221))}, ${q(id(110))}, ${q(id(21))}, 'Under Review', 'Yearly', '2027/2028', 'Child 1');
create temp table b1_steps(step text, file_group uuid, status text);
update public.enrollments set notes = 'Appel du parent' where id = ${q(id(220))};
insert into b1_steps select 'notes', groupe_id, status from public.students where id = ${q(id(110))};
update public.enrollments set status = 'Rejected' where id = ${q(id(220))};
insert into b1_steps select 'rejected', groupe_id, status from public.students where id = ${q(id(110))};
delete from public.enrollments where id = ${q(id(221))};
insert into b1_steps select 'deleted', groupe_id, status from public.students where id = ${q(id(110))};
set local request.jwt.claim.sub = ${q(id(1))};
set local request.jwt.claims = ${q(JSON.stringify({ sub: id(1), role: 'authenticated' }))};
set local role authenticated;
select public.remove_learner_from_group(${q(id(110))}, ${q(id(21))}, (select updated_at from public.students where id = ${q(id(110))}));
reset role;
insert into b1_steps select 'removed', groupe_id, status from public.students where id = ${q(id(110))};
select string_agg(step || ':' || coalesce(file_group::text, 'none') || ':' || status, ',' order by ctid) from b1_steps;
rollback;`).split('\n').pop(), [`notes:${id(21)}:Enrolled`, `rejected:${id(21)}:Enrolled`, `deleted:${id(21)}:Enrolled`, 'removed:none:Enrolled'].join(','),
  'non-member edits keep the file group; the explicit removal clears it and keeps the status');
console.log('PASS B1 under M1: notes edit, rejection and deletion keep the file group; explicit removal clears it');

// DS1 (review): a dossier-only learner pays the unlinked Yearly charge between M1
// and the clean-up; the payment creates one Confirmed enrollment, which C1 places.
sql(as(id(1), `select public.create_charge_payment(jsonb_build_object('student_id', ${q(id(101))}, 'charge_id', ${q(id(301))},
  'payment_amount', 500, 'payment_date', current_date, 'payment_method', 'Espèces', 'idempotency_key', ${q(id(901))}))`).replace('rollback;', 'commit;'));
const paid = sql(`select string_agg(e.status || ':' || coalesce(e.group_id::text, 'none') || ':' || e.school_year, ',') || '|' || (select groupe_id from public.students where id = ${q(id(101))})
  from public.enrollments e join public.charges c on c.enrollment_id = e.id and c.id = ${q(id(301))} where e.student_id = ${q(id(101))}`);
assert.equal(paid, `Confirmed:none:2026/2027|${id(21)}`, 'the payment confirms one enrollment; the file group stays');
const paidEnrollment = sql(`select enrollment_id from public.charges where id = ${q(id(301))}`);

// Clean-up with the counts the plan's dry-run queries read on the day.
const counts = json(`select jsonb_build_object(
  'c1', (select count(*) from students s where s.deleted_at is null and s.groupe_id is not null
    and not exists(select 1 from enrollments e where e.student_id=s.id and e.group_id=s.groupe_id and e.status in ('Validated','Trial'))),
  'c1links', (select count(*) filter (where n=1) from (select s.id, (select count(*) from charges c where c.student_id=s.id and c.voided_at is null and not c.legacy
    and c.session_type='Yearly' and c.school_year='2026/2027' and c.enrollment_id is null) n from students s where s.deleted_at is null and s.groupe_id is not null
    and not exists(select 1 from enrollments e where e.student_id=s.id and e.group_id=s.groupe_id and e.status in ('Validated','Trial'))) x where n>0),
  'c1b', (select count(*) from enrollments e where e.status in ('Confirmed','Validated','Trial') and e.group_id is not null and (e.session_type is null or e.school_year is null)),
  'c2', (select count(*) from enrollments e where e.status='Validated' and e.group_id is null),
  'c4', (select count(*) from enrollments e join students st on st.id=e.student_id where st.deleted_at is not null and e.status in ('Submitted','Under Review','Confirmed','Validated','Trial')),
  'c1existing', (select jsonb_build_array(count(*) filter (where live=1 and placeable), count(*) filter (where live>0 and not (live=1 and placeable))) from (
    select s.id, count(e.id) live, bool_and(e.status='Confirmed' and e.group_id is null and (e.level is null or e.level=g.niveau)) placeable
    from students s join groups g on g.id=s.groupe_id
    join enrollments e on e.student_id=s.id and e.session_type=g.session_type and e.school_year=replace(g.annee,'-','/') and e.status not in ('Rejected','Ended')
    where s.deleted_at is null and not exists(select 1 from enrollments m where m.student_id=s.id and m.group_id=s.groupe_id and m.status in ('Validated','Trial'))
    group by s.id) x))`);
// The payment linked the dossier member's only charge, so C1 has no charge left to link (DS1).
assert.deepEqual(counts, { c1: 3, c1links: 0, c1b: 1, c2: 2, c4: 1, c1existing: [1, 0] }, 'synthetic dry-run counts');
const stages = [`select academic_security.egc_cleanup_c1(${counts.c1}, ${counts.c1links})`];
if (mode === 'full') stages.push(`select academic_security.egc_cleanup_c1b(${counts.c1b})`);
stages.push(`select academic_security.egc_cleanup_c2(${counts.c2})`, `select academic_security.egc_cleanup_c3(2, 'Alumni', current_date - 60)`,
  `select academic_security.egc_cleanup_c4(${counts.c4})`, `select academic_security.egc_cleanup_c5(1, '2026/2027', current_date - 60)`);
for (const stage of stages) sql(`begin; ${stage}; commit;`);
assert.equal(sql(`select count(*) || ':' || bool_and(id = ${q(paidEnrollment)} and status = 'Validated' and group_id = ${q(id(21))})
  from public.enrollments where student_id = ${q(id(101))} and status not in ('Rejected','Ended')`), '1:true',
  'C1 placed the paid enrollment instead of inserting a second one (DS1)');
const c6 = json('select academic_security.egc_cleanup_c6()');

if (mode === 'skip-c1b') {
  assert.equal(c6.confirmed_without_programme, 1, 'C6 shows the I9 row');
  const refusal = failsFile(M2);
  assert.match(refusal || '', /EGC M2 refused: I9/, 'M2 refuses without C1b');
  assert.equal(sql("select count(*) from pg_proc where proname = 'egc_enforcement_failures'"), '0', 'the refused M2 changed nothing');
  assert.equal(sql("select bool_or(convalidated) from pg_constraint where conname in ('enrollments_active_requires_group','enrollments_confirmed_has_programme')"), 'f');
  assert.equal(sql(`select public.attendance_student_in_group(${q(id(102))}, ${q(id(21))})`), 't', 'readers unchanged after the refusal');
  console.log('PASS clean-up without C1b: M2 refuses on I9 and changes nothing');
  process.exit(0);
}

for (const key of ['unbacked_file_groups', 'active_without_group', 'confirmed_without_programme', 'ended_shape', 'archived_with_active', 'group_mismatches']) {
  assert.equal(c6[key], 0, `C6 ${key}`);
}
assert.equal(c6.enrolled_or_trial, 6, 'Enrolled + Trial after the clean-up');
applyFile(M2);
assert.equal(sql("select bool_and(convalidated) from pg_constraint where conname in ('enrollments_active_requires_group','enrollments_ended_shape','enrollments_confirmed_has_programme')"), 't');
const afterM2 = catalog();
assert.deepEqual(diffKeys(afterM1.policies, afterM2.policies), ['public.announcements.announcements audience read'], 'M2 re-creates one policy');
assert.deepEqual(diffKeys(afterM1.functions, afterM2.functions), ['academic_security.egc_enforcement_failures()', 'attendance_student_in_group(uuid,uuid)',
  'attendance_student_in_group(uuid,uuid,date)', 'can_message_recipient(text)', 'enforce_attendance_integrity()',
  'resolve_storage_asset(uuid)', 'search_students_page(text,text,text,text,text,boolean,text,text,integer,integer,text,text)',
  'sync_student_from_enrollments(uuid,boolean,uuid)', 'teacher_can_access_student_group(uuid,uuid)',
  'storage_security.can_write(uuid,text,uuid,uuid,uuid)'].sort(), 'M2 manifest');
// Enrollment-only readers: the back-filled learners stay in their rosters; the
// second-programme learner is in both groups for the teacher and the parent;
// leavers and the archived learner are nobody's members.
assert.equal(sql(`select public.attendance_student_in_group(${q(id(101))}, ${q(id(21))}) and public.attendance_student_in_group(${q(id(102))}, ${q(id(21))})
  and public.attendance_student_in_group(${q(id(102))}, ${q(id(22))}) and not public.attendance_student_in_group(${q(id(104))}, ${q(id(21))})`), 't');
assert.equal(sql(as(id(4), `select public.teacher_can_access_student_group(${q(id(102))}, ${q(id(22))})`)), 't', 'teacher B through the second programme');
assert.equal(sql(as(id(5), `select coalesce(string_agg(id::text, ',' order by id), '') from public.announcements where id::text like 'e9d00000-%'`)), id(501),
  'the parent of a Yearly-only learner sees the Yearly announcement');
assert.equal(sql(`select string_agg(status, ',' order by id) from public.students where id in (${q(id(104))}, ${q(id(107))}, ${q(id(109))})`),
  'Alumni,Alumni,Enrolled', 'C3 former learners Alumni; the MAN payer stays Enrolled');
assert.equal(sql(as(id(1), `select (public.search_students_page(p_search => 'Up ', p_group => 'unassigned', p_page_size => 50)->>'count')`)),
  sql(as(id(2), `select (public.search_students_page(p_search => 'Up ', p_group => 'unassigned', p_page_size => 50)->>'count')`)),
  'one "Groupe à affecter" rule for every role');
assert.equal(sql(as(id(1), `select (public.search_students_page(p_search => 'Up ', p_group => 'unassigned', p_page_size => 50)->>'count')`)), String(c6.awaiting_group),
  '"Groupe à affecter" equals the C6 count');
console.log('PASS clean-up → M2: invariants validated, enrollment-only readers, one placement filter');
