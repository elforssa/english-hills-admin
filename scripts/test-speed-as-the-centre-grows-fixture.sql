-- Batch G equivalence fixture (synthetic): every public table that carries a
-- policy holds rows that some identity can see and rows it cannot. Triggers and
-- FK checks are skipped (replica role); the rows are consistent anyway.
-- Identities: c0…01 director, 02 admin, 03 receptionist, 04 linked teacher (T1),
-- 05 unlinked teacher, 06 parent (L1, L2), 07 student (self L3), 08 pending,
-- 09 an account without a profile, 10 a teacher account bound to an archived
-- teacher record (T3); anon has no claims.
begin;
set local session_replication_role = replica;

create temporary table ids on commit drop as
select n, ('c0000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid as id from generate_series(1, 120) n;
create function pg_temp.i(n integer) returns uuid language sql immutable as $$
  select ('c0000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid $$;

insert into auth.users (id, email, aud, role, instance_id)
select pg_temp.i(n), r || '@scg.test', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'
from (values (1,'director'),(2,'admin'),(3,'receptionist'),(4,'teacher'),(5,'teacher2'),(6,'parent'),(7,'student'),(8,'pending'),(9,'noprofile'),(10,'teacher3')) v(n, r);

insert into public.teachers (id, full_name, email, contract_type) values
  (pg_temp.i(11), 'Scg Teacher One', 'teacher@scg.test', 'Employé'),
  (pg_temp.i(12), 'Scg Teacher Two', 'teacher-two@scg.test', 'Freelance');
insert into public.teachers (id, full_name, email, contract_type, deleted_at) values
  (pg_temp.i(13), 'Scg Teacher Archived', 'teacher-three@scg.test', 'Freelance', now());
insert into public.profiles (id, email, full_name, role, linked_teacher_id) values
  (pg_temp.i(1), 'director@scg.test', 'Scg Director', 'director', null),
  (pg_temp.i(2), 'admin@scg.test', 'Scg Admin', 'admin', null),
  (pg_temp.i(3), 'receptionist@scg.test', 'Scg Reception', 'receptionist', null),
  (pg_temp.i(4), 'teacher@scg.test', 'Scg Teacher One', 'teacher', pg_temp.i(11)),
  (pg_temp.i(5), 'teacher2@scg.test', 'Scg Teacher Unlinked', 'teacher', null),
  (pg_temp.i(6), 'parent@scg.test', 'Scg Parent', 'parent', null),
  (pg_temp.i(7), 'student@scg.test', 'Scg Student', 'student', null),
  (pg_temp.i(8), 'pending@scg.test', 'Scg Pending', 'pending', null),
  (pg_temp.i(10), 'teacher3@scg.test', 'Scg Teacher Archived', 'teacher', pg_temp.i(13));

insert into public.groups (id, name, niveau, teacher_id, session_type, categorie, capacite_max) values
  (pg_temp.i(21), 'Scg G1', 'A1', pg_temp.i(11), 'Yearly', 'Adultes', 10),
  (pg_temp.i(22), 'Scg G2', 'A2', pg_temp.i(12), 'Adults', 'Adultes', 10),
  (pg_temp.i(23), 'Scg G3', 'A1', pg_temp.i(13), 'Summer Camp', 'Adultes', 10);

insert into public.students (id, full_name, email, parent_email, status, age_category, session_type, groupe_id, deleted_at) values
  (pg_temp.i(31), 'Scg Learner One', 'l1@scg.test', 'parent@scg.test', 'Enrolled', 'Young Learners (6-12)', 'Yearly', pg_temp.i(21), null),
  (pg_temp.i(32), 'Scg Learner Two', 'l2@scg.test', 'parent@scg.test', 'Enrolled', 'Teens (13-17)', 'Adults', pg_temp.i(22), null),
  (pg_temp.i(33), 'Scg Learner Three', 'student@scg.test', null, 'Trial', 'Adults (18+)', 'Yearly', pg_temp.i(21), null),
  (pg_temp.i(34), 'Scg Learner Archived', 'l4@scg.test', null, 'Inactive', 'Adults (18+)', 'Yearly', null, now()),
  (pg_temp.i(35), 'Scg Learner Prospect', null, null, 'Prospect', 'Adults (18+)', 'Yearly', null, null),
  (pg_temp.i(36), 'Scg Learner Six', 'l6@scg.test', null, 'Enrolled', 'Adults (18+)', 'Yearly', pg_temp.i(21), null);

insert into public.family_links (student_id, relation, profile_id, invite_email, status, activated_at) values
  (pg_temp.i(31), 'parent', pg_temp.i(6), 'parent@scg.test', 'active', now()),
  (pg_temp.i(32), 'parent', pg_temp.i(6), 'parent@scg.test', 'active', now()),
  (pg_temp.i(33), 'self', pg_temp.i(7), 'student@scg.test', 'active', now());

insert into public.enrollments (id, student_id, group_id, status, session_type, school_year) values
  (pg_temp.i(41), pg_temp.i(31), pg_temp.i(21), 'Validated', 'Yearly', '2026/2027'),
  (pg_temp.i(42), pg_temp.i(32), pg_temp.i(22), 'Validated', 'Adults', '2026/2027'),
  (pg_temp.i(43), pg_temp.i(33), pg_temp.i(21), 'Trial', 'Yearly', '2026/2027'),
  (pg_temp.i(45), pg_temp.i(35), null, 'Confirmed', 'Yearly', '2026/2027'),
  (pg_temp.i(46), pg_temp.i(36), pg_temp.i(21), 'Validated', 'Yearly', '2026/2027'),
  (pg_temp.i(47), pg_temp.i(35), null, 'Submitted', 'Adults', '2027/2028'),
  (pg_temp.i(48), pg_temp.i(36), pg_temp.i(23), 'Validated', 'Summer Camp', '2026/2027');

insert into public.charges (id, student_id, enrollment_id, session_type, service_description, plan_type, gross_amount, discount_amount, due_date, legacy, school_year) values
  (pg_temp.i(51), pg_temp.i(31), pg_temp.i(41), 'Yearly', 'Formation annuelle', 'Standard', 6000, 500, current_date - 10, true, '2026/2027'),
  (pg_temp.i(52), pg_temp.i(32), pg_temp.i(42), 'Adults', 'Cours adultes', null, 3000, 0, current_date + 20, true, '2026/2027'),
  (pg_temp.i(53), pg_temp.i(33), pg_temp.i(43), 'Yearly', 'Formation annuelle', 'Standard', 6000, 0, current_date + 20, true, '2026/2027'),
  (pg_temp.i(54), pg_temp.i(34), null, 'Other', 'Frais de dossier', null, 200, 0, current_date - 40, true, null),
  -- "En attente": a balance, not yet due, nothing paid.
  (pg_temp.i(55), pg_temp.i(36), pg_temp.i(46), 'Yearly', 'Formation annuelle', 'Standard', 5000, 0, current_date + 40, true, '2026/2027');
insert into public.receipts (id, student_id, receipt_number, date, nom_prenom, montant_total, montant_paye, mode_paiement, charge_id, legacy, deleted_at) values
  (pg_temp.i(61), pg_temp.i(31), 'SCG-1', current_date, 'Scg Learner One', 5500, 2000, 'Espèces', pg_temp.i(51), true, null),
  (pg_temp.i(62), pg_temp.i(32), 'SCG-2', current_date, 'Scg Learner Two', 3000, 3000, 'Virement', pg_temp.i(52), true, null),
  (pg_temp.i(63), pg_temp.i(33), 'SCG-3', current_date - 3, 'Scg Learner Three', 6000, 1000, 'Chèque', pg_temp.i(53), true, null),
  (pg_temp.i(64), pg_temp.i(31), 'SCG-4', current_date - 5, 'Scg Learner One', 5500, 500, 'Espèces', pg_temp.i(51), true, now());
insert into public.charge_discount_reasons (charge_id, reason_code) values (pg_temp.i(51), 'sibling');
insert into public.financial_events (event_type, charge_id, actor_id) values ('charge_created', pg_temp.i(51), pg_temp.i(1));
insert into public.financial_requests (idempotency_key, actor_id, request_fingerprint, charge_id) values
  (pg_temp.i(71), pg_temp.i(1), repeat('ab', 32), pg_temp.i(51));

insert into public.attendance (student_id, group_id, session_date, status, notes) values
  (pg_temp.i(31), pg_temp.i(21), current_date - 1, 'Présent', 'note one'),
  (pg_temp.i(33), pg_temp.i(21), current_date - 1, 'Absent', null),
  (pg_temp.i(36), pg_temp.i(21), current_date - 1, 'Présent', null),
  (pg_temp.i(32), pg_temp.i(22), current_date - 2, 'Retard', 'note two'),
  (pg_temp.i(36), pg_temp.i(23), current_date - 2, 'Absent', null),
  (pg_temp.i(31), null, current_date - 3, 'Justifié', null);
insert into public.assessments (student_id, group_id, terme, note_finale) values
  (pg_temp.i(31), pg_temp.i(21), 'Sept–Déc', 14), (pg_temp.i(33), pg_temp.i(21), 'Sept–Déc', 12),
  (pg_temp.i(32), pg_temp.i(22), 'Sept–Déc', 16);
insert into public.learning_assessments (student_id, student_name, date_assessment, kolb_style) values
  (pg_temp.i(31), 'Scg Learner One', current_date, 'Diverging'), (pg_temp.i(32), 'Scg Learner Two', current_date, null),
  (pg_temp.i(33), 'Scg Learner Three', current_date, 'Converging');
insert into public.placement_tests (student_id, student_name, date_test, status) values
  (pg_temp.i(31), 'Scg Learner One', current_date, 'Passé'), (pg_temp.i(32), 'Scg Learner Two', current_date, 'Affecté'),
  (pg_temp.i(35), 'Scg Learner Prospect', current_date, 'Planifié');
insert into public.portfolios (id, student_id, student_name, terme, project_type, title, teacher_id, visible_to_parent, visible_to_student, created_by) values
  (pg_temp.i(81), pg_temp.i(31), 'Scg Learner One', 'Sept–Déc', 'Written Essay', 'Essay one', pg_temp.i(11), true, false, pg_temp.i(4)),
  (pg_temp.i(82), pg_temp.i(32), 'Scg Learner Two', 'Sept–Déc', 'Other', 'Project two', pg_temp.i(12), false, false, pg_temp.i(1)),
  (pg_temp.i(83), pg_temp.i(33), 'Scg Learner Three', 'Jan–Mar', 'Oral Presentation', 'Talk three', pg_temp.i(11), false, true, pg_temp.i(7));
insert into public.certificates (student_id, student_name, niveau_complete, date_emission, issued) values
  (pg_temp.i(31), 'Scg Learner One', 'A1', current_date, true), (pg_temp.i(32), 'Scg Learner Two', 'A2', current_date, false),
  (pg_temp.i(33), 'Scg Learner Three', 'A1', current_date, true);
insert into public.authorized_adults (student_id, full_name, telephone, relation) values
  (pg_temp.i(31), 'Scg Adult One', '0600000001', 'Parent'), (pg_temp.i(32), 'Scg Adult Two', '0600000002', 'Chauffeur');
insert into public.dismissal_logs (student_id, student_name, adult_name, staff_name) values
  (pg_temp.i(31), 'Scg Learner One', 'Scg Adult One', 'Scg Reception'), (pg_temp.i(32), 'Scg Learner Two', 'Scg Adult Two', 'Scg Reception');

insert into public.announcements (title, body, audience, group_id) values
  ('Scg all', 'Body', 'all', null), ('Scg parents', 'Body', 'parents', null), ('Scg teachers', 'Body', 'teachers', null),
  ('Scg group', 'Body', 'group', pg_temp.i(21));
insert into public.app_config (key, value, label) values ('scg_key', 'scg value', 'Scg');
insert into public.anon_rate_limits (ip_key, scope) values ('scg-ip', 'scg');
insert into public.rate_limits (user_id, scope) values (pg_temp.i(1), 'scg');
insert into public.leave_requests (teacher_id, teacher_name, date_debut, date_fin, type_conge, status) values
  (pg_temp.i(11), 'Scg Teacher One', current_date + 5, current_date + 6, 'Personnel', 'En attente'),
  (pg_temp.i(12), 'Scg Teacher Two', current_date + 5, current_date + 6, 'Maladie', 'Approuvé');
insert into public.messages (from_user_email, to_user_email, subject, body, type, student_id) values
  ('director@scg.test', 'admin@scg.test', 'Scg one', 'Body', 'message', null),
  ('parent@scg.test', 'director@scg.test', 'Scg two', 'Body', 'message', pg_temp.i(31)),
  ('admin@scg.test', 'teacher@scg.test', 'Scg three', 'Body', 'document_request', null);
insert into public.notifications (type, recipient_email, subject, message, student_id, recipient_profile_id) values
  ('general', 'director@scg.test', 'Scg n1', 'Msg', null, null),
  ('absence', 'teacher@scg.test', 'Scg n2', 'Msg', pg_temp.i(31), pg_temp.i(4)),
  ('absence', 'teacher@scg.test', 'Scg n3', 'Msg', pg_temp.i(32), pg_temp.i(4)),
  ('payment_reminder', 'parent@scg.test', 'Scg n4', 'Msg', pg_temp.i(31), pg_temp.i(6)),
  ('report_card', 'student@scg.test', 'Scg n5', 'Msg', pg_temp.i(33), pg_temp.i(7)),
  ('general', 'admin@scg.test', 'Scg n6', 'Msg', null, pg_temp.i(2));
insert into public.payroll (teacher_id, teacher_name, mois, annee, contract_type, salaire_brut, salaire_net, statut) values
  (pg_temp.i(11), 'Scg Teacher One', 'Septembre', '2026', 'Employé', 8000, 7000, 'Validé'),
  (pg_temp.i(12), 'Scg Teacher Two', 'Septembre', '2026', 'Freelance', 3000, 3000, 'Brouillon');
insert into public.pending_roles (email, role, invited_by) values ('invitee@scg.test', 'parent', pg_temp.i(1));

insert into public.online_courses (group_id, teacher_id, audience, status, term_start, term_end) values
  (pg_temp.i(21), pg_temp.i(11), 'adult', 'draft', current_date, current_date + 90);
insert into public.online_lesson_patterns (id, group_id, weekday, start_time, minutes, valid_from, valid_to) values
  (pg_temp.i(91), pg_temp.i(21), 2, '18:00', 60, current_date, current_date + 90);
insert into public.online_lessons (id, group_id, pattern_id, starts_at, ends_at, status, teacher_id) values
  (pg_temp.i(92), pg_temp.i(21), pg_temp.i(91), now() + interval '1 day', now() + interval '1 day 1 hour', 'scheduled', pg_temp.i(11));
insert into public.online_lesson_guests (lesson_id, student_id, kind, added_by) values (pg_temp.i(92), pg_temp.i(35), 'trial', pg_temp.i(1));
insert into public.online_attendance (lesson_id, student_id, status, marked_by) values (pg_temp.i(92), pg_temp.i(31), 'Présent', pg_temp.i(4));
insert into public.online_consents (student_id, kind, recorded_by) values (pg_temp.i(31), 'video_minor', pg_temp.i(1));

insert into public.premium_groups (id, name, teacher_id, weekday, start_time, target_size) values
  (pg_temp.i(101), 'Scg Premium', pg_temp.i(11), 6, '10:00', 4);
insert into public.premium_group_memberships (premium_group_id, student_id, start_date) values (pg_temp.i(101), pg_temp.i(31), current_date);
insert into public.premium_sessions (id, teacher_id, premium_group_id, student_id, scheduled_date, start_time, status) values
  (pg_temp.i(102), pg_temp.i(11), pg_temp.i(101), null, date '2026-10-24', '10:00', 'Completed'),
  (pg_temp.i(103), pg_temp.i(12), null, pg_temp.i(32), date '2026-10-25', '11:00', 'Scheduled');
insert into public.premium_attendance (premium_session_id, student_id, status) values (pg_temp.i(102), pg_temp.i(31), 'Present');
insert into public.premium_homework_submissions (premium_session_id, student_id, teacher_id, title, status) values
  (pg_temp.i(102), pg_temp.i(31), pg_temp.i(11), 'Scg homework', 'Submitted');

insert into public.storage_assets (id, bucket_id, object_path, purpose, student_id, uploader_id, state) values
  (pg_temp.i(111), 'documents', 'scg/students/l1.jpg', 'student_photo', pg_temp.i(31), pg_temp.i(1), 'active'),
  (pg_temp.i(112), 'portfolios', 'scg/portfolios/p1.pdf', 'portfolio', pg_temp.i(31), pg_temp.i(4), 'active');
insert into public.storage_asset_bindings (asset_id, student_photo_id, bound_by) values (pg_temp.i(111), pg_temp.i(31), pg_temp.i(1));
insert into public.storage_asset_bindings (asset_id, portfolio_id, bound_by) values (pg_temp.i(112), pg_temp.i(81), pg_temp.i(4));

insert into public.activity_log (actor_id, actor_email, action, target_table, target_id, changed_columns, before, after) values
  (pg_temp.i(1), 'director@scg.test', 'UPDATE', 'students', pg_temp.i(31), array['status'], '{"status":"Trial"}', '{"status":"Enrolled"}'),
  (pg_temp.i(3), 'receptionist@scg.test', 'INSERT', 'receipts', pg_temp.i(61), null, null, '{"montant_paye":2000}');
commit;
