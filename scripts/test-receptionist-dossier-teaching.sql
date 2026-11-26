-- Receptionist permissions, stage 3 (migration 133, plan RPW-r2, table A items 1-6, 14, 16, 17,
-- 17c, 18, 18p, 19 and L): synthetic local fixtures, fully rolled back. The reception command
-- creates a learner and changes programme, level, source and both e-mails (refused while an
-- active or pending family link uses the old address; every change logged for every role);
-- pick-up adults, « Sortie des jeunes » (no edit, no delete), « Ancien apprenant » and reopening;
-- grades (no delete), portfolios and learning profiles (create only), certificates and leave
-- requests (read only); teachers created without pay, e-mail locked by a login or a live
-- invitation; storage purposes. A teacher stays refused; director and admin keep their answers.
\set ON_ERROR_STOP on
begin;
alter table public.receipts disable trigger on_receipt_created;

create function pg_temp.ok(v boolean, label text) returns void language plpgsql as $$ begin
  if v is not true then raise exception 'FAIL: %', label; end if;
end $$;
create function pg_temp.id(i integer) returns uuid language sql immutable as $$
  select ('7b733000-0000-4000-8000-' || lpad(to_hex(i), 12, '0'))::uuid $$;
create function pg_temp.act(i integer) returns void language plpgsql as $$ begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', pg_temp.id(i)::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.id(i), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.owner() returns void language plpgsql as $$ begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
end $$;
create function pg_temp.refused(q text, st text, h text, label text) returns void language plpgsql as $$
declare s text; hh text; m text; begin
  begin
    execute q;
  exception when others then
    get stacked diagnostics s = returned_sqlstate, hh = pg_exception_hint, m = message_text;
    if s is distinct from st or (h is not null and hh is distinct from h) then
      raise exception 'FAIL: % raised % / % / %', label, s, hh, m;
    end if;
    return;
  end;
  raise exception 'FAIL: % was accepted', label;
end $$;
-- Rows a statement touched (a restrictive deny filters rows: 0, no error).
create function pg_temp.touched(q text) returns bigint language plpgsql as $$
declare n bigint; begin execute q; get diagnostics n = row_count; return n; end $$;
create function pg_temp.upd(s uuid) returns timestamptz language sql security definer as $$
  select updated_at from public.students where id = s $$;
create function pg_temp.tupd(t uuid) returns timestamptz language sql security definer as $$
  select updated_at from public.teachers where id = t $$;
create function pg_temp.st(s uuid) returns public.students language sql security definer as $$
  select * from public.students where id = s $$;
create function pg_temp.enr(s uuid) returns public.enrollments language sql security definer as $$
  select * from public.enrollments where student_id = s order by created_at desc limit 1 $$;
create function pg_temp.email_logs(s uuid, col text, r text) returns bigint language sql security definer as $$
  select count(*) from public.activity_log where target_table = 'students' and target_id = s
    and after->>'kind' = 'student_email_change' and changed_columns = array[col] and after->>'author_role' = r $$;
create function pg_temp.exists_row(t text, i uuid) returns boolean language plpgsql security definer as $$
declare v boolean; begin execute format('select exists(select 1 from public.%I where id = $1)', t) into v using i; return v; end $$;

-- ── Fixture ───────────────────────────────────────────────────────────────
insert into auth.users(id, email, aud, role, email_confirmed_at, created_at, updated_at)
select pg_temp.id(i), 'rpw-d-' || i || '@example.test', 'authenticated', 'authenticated', now(), now(), now()
from generate_series(1, 6) i;
update public.profiles p set role = r.role, full_name = r.name
from (values (1, 'director', 'RPW D director'), (2, 'admin', 'RPW D admin'), (3, 'receptionist', 'RPW D reception'),
  (4, 'teacher', 'RPW D teacher'), (5, 'parent', 'RPW D parent'), (6, 'parent', 'RPW D revoked parent')) r(i, role, name)
where p.id = pg_temp.id(r.i);
insert into public.groups(id, name, session_type, niveau, annee, capacite_max) values
  (pg_temp.id(100), 'RPW D Yearly C2', 'Yearly', 'Child 2', '2026-2027', 10);
insert into public.students(id, full_name, status, session_type, niveau_cefr, email, parent_email) values
  (pg_temp.id(300), 'RPW D programme', 'Prospect', 'Yearly', 'Child 2', null, null),
  (pg_temp.id(301), 'RPW D placed', 'Prospect', 'Yearly', 'Child 2', null, null),
  (pg_temp.id(302), 'RPW D free e-mail', 'Prospect', 'Yearly', null, 'free.302@example.test', null),
  (pg_temp.id(303), 'RPW D active link', 'Prospect', 'Yearly', null, null, 'rpw-d-5@example.test'),
  (pg_temp.id(304), 'RPW D pending link', 'Prospect', 'Yearly', null, 'pending.304@example.test', null),
  (pg_temp.id(305), 'RPW D revoked link', 'Prospect', 'Yearly', null, null, 'rpw-d-6@example.test'),
  (pg_temp.id(306), 'RPW D management e-mail', 'Prospect', 'Yearly', null, 'mgmt.306@example.test', null),
  (pg_temp.id(307), 'RPW D leaver', 'Prospect', 'Yearly', null, null, null);
insert into public.pending_roles(id, email, role) values (pg_temp.id(400), 'pending.304@example.test', 'student');
insert into public.family_links(student_id, relation, profile_id, invite_email, status, activated_at) values
  (pg_temp.id(303), 'parent', pg_temp.id(5), 'rpw-d-5@example.test', 'active', now());
insert into public.family_links(student_id, relation, pending_role_id, invite_email, status) values
  (pg_temp.id(304), 'self', pg_temp.id(400), 'pending.304@example.test', 'pending');
insert into public.family_links(student_id, relation, profile_id, invite_email, status, activated_at, revoked_at, revoked_by, revoke_reason) values
  (pg_temp.id(305), 'parent', pg_temp.id(6), 'rpw-d-6@example.test', 'revoked', now(), now(), pg_temp.id(1), 'RPW D test');
-- 301 sits in a group (director, without a paid enrollment, with its reason); 307 has a paid enrollment.
select pg_temp.act(1);
select public.place_learner_in_group(p_student => pg_temp.id(301), p_group => pg_temp.id(100),
  p_student_updated_at => pg_temp.upd(pg_temp.id(301)), p_enrollment => null, p_school_year => '2026/2027',
  p_enrollment_updated_at => null, p_capacity_override_reason => null, p_without_enrollment_reason => 'RPW D fixture');
select public.create_charge_payment(jsonb_build_object('student_id', pg_temp.id(307), 'session_type', 'Yearly',
  'school_year', '2026/2027', 'gross_amount', 1000, 'payment_amount', 100, 'payment_method', 'Espèces',
  'idempotency_key', pg_temp.id(1307)));
select pg_temp.owner();
select pg_temp.ok((pg_temp.st(pg_temp.id(301))).groupe_id = pg_temp.id(100), 'fixture: 301 placed');

-- ── Item 1: create through the command, then place with the reason ──────────
select pg_temp.act(3);
select public.save_receptionist_student(pg_temp.id(310), null, jsonb_build_object('full_name', 'RPW D created',
  'session_type', 'Yearly', 'niveau_cefr', 'Child 2', 'email', 'created.310@example.test'));
select public.place_learner_in_group(p_student => pg_temp.id(310), p_group => pg_temp.id(100),
  p_student_updated_at => pg_temp.upd(pg_temp.id(310)), p_enrollment => null, p_school_year => '2026/2027',
  p_enrollment_updated_at => null, p_capacity_override_reason => null, p_without_enrollment_reason => 'RPW D unpaid at creation');
select pg_temp.owner();
select pg_temp.ok((pg_temp.st(pg_temp.id(310))).groupe_id = pg_temp.id(100), 'item 1: created then placed by her');

-- ── Item 2: programme, level and source (the admin rule) ───────────────────
select pg_temp.act(3);
select public.save_receptionist_student(pg_temp.id(300), pg_temp.upd(pg_temp.id(300)),
  jsonb_build_object('session_type', 'Adults', 'niveau_cefr', 'Beginning 2', 'referral_source', 'Recherche Google'));
select pg_temp.ok((select session_type = 'Adults' and niveau_cefr = 'Beginning 2' and referral_source = 'Recherche Google'
  from pg_temp.st(pg_temp.id(300))), 'item 2: unplaced programme, level and source saved');
select pg_temp.refused(format($q$select public.save_receptionist_student(%L, %L, '{"niveau_cefr":"Child 2"}')$q$,
  pg_temp.id(300), pg_temp.upd(pg_temp.id(300))), '22023', 'rpw.level_invalid', 'item 2: a level of another programme');
select pg_temp.refused(format($q$select public.save_receptionist_student(%L, %L, '{"niveau_cefr":"Child 3"}')$q$,
  pg_temp.id(301), pg_temp.upd(pg_temp.id(301))), '23514', 'egc.programme_follows_group', 'item 2: placed learner (admin rule)');
select pg_temp.owner();

-- ── Item 3: e-mails, the family-link lock and the log ──────────────────────
select pg_temp.act(3);
select public.save_receptionist_student(pg_temp.id(302), pg_temp.upd(pg_temp.id(302)),
  jsonb_build_object('email', 'new.302@example.test', 'parent_email', 'parent.302@example.test'));
select pg_temp.refused(format($q$select public.save_receptionist_student(%L, %L, '{"parent_email":"other@example.test"}')$q$,
  pg_temp.id(303), pg_temp.upd(pg_temp.id(303))), '42501', 'rpw.family_email_locked', 'item 3: active parent link');
-- The same address with the key present is no change: accepted.
select public.save_receptionist_student(pg_temp.id(303), pg_temp.upd(pg_temp.id(303)),
  jsonb_build_object('parent_email', 'rpw-d-5@example.test', 'telephone', '0600000303'));
select pg_temp.refused(format($q$select public.save_receptionist_student(%L, %L, '{"email":"other@example.test"}')$q$,
  pg_temp.id(304), pg_temp.upd(pg_temp.id(304))), '42501', 'rpw.family_email_locked', 'item 3: pending learner link');
select public.save_receptionist_student(pg_temp.id(305), pg_temp.upd(pg_temp.id(305)),
  jsonb_build_object('parent_email', 'new.305@example.test'));
select pg_temp.owner();
select pg_temp.ok((select email = 'new.302@example.test' and parent_email = 'parent.302@example.test' from pg_temp.st(pg_temp.id(302))),
  'item 3: free e-mails changed');
select pg_temp.ok((pg_temp.st(pg_temp.id(303))).parent_email = 'rpw-d-5@example.test', 'item 3: linked parent e-mail kept');
select pg_temp.ok((pg_temp.st(pg_temp.id(305))).parent_email = 'new.305@example.test', 'item 3: revoked link does not lock');
select pg_temp.ok(pg_temp.email_logs(pg_temp.id(302), 'email', 'receptionist') = 1
  and pg_temp.email_logs(pg_temp.id(302), 'parent_email', 'receptionist') = 1
  and pg_temp.email_logs(pg_temp.id(305), 'parent_email', 'receptionist') = 1
  and pg_temp.email_logs(pg_temp.id(303), 'parent_email', 'receptionist') = 0, 'item 3: one log row per changed column, none for no change');
select pg_temp.ok((select before->>'email' = 'free.302@example.test' and after->>'email' = 'new.302@example.test'
  and actor_id = pg_temp.id(3) from public.activity_log where target_id = pg_temp.id(302)
  and after->>'kind' = 'student_email_change' and changed_columns = array['email']), 'item 3: log keeps old -> new and the author');
-- Every role is logged (management writes the table directly).
select pg_temp.act(1);
update public.students set email = 'director.306@example.test' where id = pg_temp.id(306);
select pg_temp.act(2);
update public.students set email = 'admin.306@example.test' where id = pg_temp.id(306);
select pg_temp.owner();
select pg_temp.ok(pg_temp.email_logs(pg_temp.id(306), 'email', 'director') = 1 and pg_temp.email_logs(pg_temp.id(306), 'email', 'admin') = 1,
  'item 3: director and admin changes logged');

-- ── Item 4: pick-up adults ────────────────────────────────────────────────
select pg_temp.act(3);
insert into public.authorized_adults(id, student_id, full_name, telephone, relation)
values (pg_temp.id(500), pg_temp.id(300), 'RPW D adult', '0600000500', 'Parent'),
       (pg_temp.id(501), pg_temp.id(300), 'RPW D driver', '0600000501', 'Chauffeur');
select pg_temp.ok(pg_temp.touched(format($q$update public.authorized_adults set telephone = '0611111500' where id = %L$q$, pg_temp.id(500))) = 1,
  'item 4: she edits an adult');
select pg_temp.ok(pg_temp.touched(format($q$delete from public.authorized_adults where id = %L$q$, pg_temp.id(501))) = 1,
  'item 4: she removes an adult');
select pg_temp.act(4);
select pg_temp.refused(format($q$insert into public.authorized_adults(student_id, full_name, telephone, relation) values (%L, 'x', '0612340162', 'Autre')$q$,
  pg_temp.id(300)), '42501', null, 'item 4: teacher refused');
select pg_temp.owner();

-- ── Item 5: « Sortie des jeunes » ─────────────────────────────────────────
select pg_temp.act(3);
insert into public.dismissal_logs(id, student_id, adult_id, adult_name, confirmed)
values (pg_temp.id(600), pg_temp.id(300), pg_temp.id(500), 'ignored', true);
select pg_temp.ok((select count(*) = 1 from public.dismissal_logs where id = pg_temp.id(600)), 'item 5: she records and reads');
select pg_temp.ok(pg_temp.touched(format($q$update public.dismissal_logs set confirmed = false where id = %L$q$, pg_temp.id(600))) = 0,
  'item 5: edit refused');
select pg_temp.ok(pg_temp.touched(format($q$delete from public.dismissal_logs where id = %L$q$, pg_temp.id(600))) = 0,
  'item 5: delete refused');
-- An adult in the dismissal history stays: the history refuses the cleared reference.
select pg_temp.refused(format($q$delete from public.authorized_adults where id = %L$q$, pg_temp.id(500)), '42501', null,
  'item 5: adult in the history not removable');
select pg_temp.owner();
select pg_temp.ok(pg_temp.exists_row('dismissal_logs', pg_temp.id(600)), 'item 5: history row intact');

-- ── Items 6 and 14: « Ancien apprenant » and reopening ─────────────────────
select pg_temp.act(4);
select pg_temp.refused(format($q$select public.end_learner(%L, %L, 'Alumni', 'x', null)$q$, pg_temp.id(307), pg_temp.upd(pg_temp.id(307))),
  '42501', null, 'item 6: teacher refused');
select pg_temp.act(3);
select public.end_learner(pg_temp.id(307), pg_temp.upd(pg_temp.id(307)), 'Alumni', 'RPW D finished', null);
select pg_temp.owner();
select pg_temp.ok((pg_temp.enr(pg_temp.id(307))).status = 'Ended', 'item 6: she ends the enrollment');
select pg_temp.act(3);
select public.reopen_enrollment((pg_temp.enr(pg_temp.id(307))).id, (pg_temp.enr(pg_temp.id(307))).updated_at);
select pg_temp.owner();
select pg_temp.ok((pg_temp.enr(pg_temp.id(307))).status <> 'Ended', 'item 14: she reopens it');

-- ── Item 16: grades, no delete ────────────────────────────────────────────
select pg_temp.act(3);
insert into public.assessments(id, student_id, group_id, terme, note_oral) values (pg_temp.id(700), pg_temp.id(300), pg_temp.id(100), 'Sept–Déc', 12);
select pg_temp.ok(pg_temp.touched(format($q$update public.assessments set note_oral = 14 where id = %L$q$, pg_temp.id(700))) = 1,
  'item 16: she corrects a grade');
select pg_temp.ok(pg_temp.touched(format($q$delete from public.assessments where id = %L$q$, pg_temp.id(700))) = 0,
  'item 16: delete refused');
select pg_temp.owner();
select pg_temp.ok(pg_temp.exists_row('assessments', pg_temp.id(700)), 'item 16: grade kept');

-- ── Item 17: portfolios and learning profiles, create only ─────────────────
select pg_temp.act(3);
insert into public.portfolios(id, student_id, student_name, title, project_type) values (pg_temp.id(710), pg_temp.id(300), 'RPW D programme', 'RPW D project', 'Other');
insert into public.learning_assessments(id, student_id, student_name, date_assessment) values (pg_temp.id(711), pg_temp.id(300), 'RPW D programme', current_date);
select pg_temp.ok(pg_temp.touched(format($q$update public.portfolios set title = 'x' where id = %L$q$, pg_temp.id(710))) = 0
  and pg_temp.touched(format($q$delete from public.portfolios where id = %L$q$, pg_temp.id(710))) = 0
  and pg_temp.touched(format($q$update public.learning_assessments set teacher_notes = 'x' where id = %L$q$, pg_temp.id(711))) = 0
  and pg_temp.touched(format($q$delete from public.learning_assessments where id = %L$q$, pg_temp.id(711))) = 0,
  'item 17: no edit, no delete');
select pg_temp.ok((select count(*) = 1 from public.portfolios where id = pg_temp.id(710))
  and (select count(*) = 1 from public.learning_assessments where id = pg_temp.id(711)), 'item 17: she reads what she created');
select pg_temp.owner();

-- ── Item 17c and L: certificates and leave requests, read only ─────────────
insert into public.teachers(id, full_name, email, contract_type) values (pg_temp.id(800), 'RPW D teacher record', 'rpw.d.800@example.test', 'Freelance');
insert into public.certificates(id, student_id, student_name, niveau_complete, date_emission) values (pg_temp.id(720), pg_temp.id(300), 'RPW D programme', 'A2', current_date);
insert into public.leave_requests(id, teacher_id, teacher_name, date_debut, date_fin, type_conge) values
  (pg_temp.id(730), pg_temp.id(800), 'RPW D teacher record', current_date, current_date + 1, 'Maladie');
select pg_temp.act(3);
select pg_temp.ok((select count(*) = 1 from public.certificates where id = pg_temp.id(720)), 'item 17c: she reads certificates');
select pg_temp.refused(format($q$insert into public.certificates(student_id, student_name, niveau_complete, date_emission) values (%L, 'x', 'A2', current_date)$q$,
  pg_temp.id(300)), '42501', null, 'item 17c: certificate insert refused');
select pg_temp.ok(pg_temp.touched(format($q$update public.certificates set notes = 'x' where id = %L$q$, pg_temp.id(720))) = 0
  and pg_temp.touched(format($q$delete from public.certificates where id = %L$q$, pg_temp.id(720))) = 0, 'item 17c: no edit, no delete');
select pg_temp.ok((select count(*) = 1 from public.leave_requests where id = pg_temp.id(730)), 'L: she reads leave requests');
select pg_temp.refused(format($q$insert into public.leave_requests(teacher_id, teacher_name, date_debut, date_fin, type_conge) values (%L, 'x', current_date, current_date, 'Maladie')$q$,
  pg_temp.id(800)), '42501', null, 'L: leave request insert refused');
select pg_temp.ok(pg_temp.touched(format($q$update public.leave_requests set status = 'Approuvé' where id = %L$q$, pg_temp.id(730))) = 0
  and pg_temp.touched(format($q$delete from public.leave_requests where id = %L$q$, pg_temp.id(730))) = 0, 'L: no decision, no delete');
select pg_temp.owner();

-- ── Items 18, 18p and 19: teachers ────────────────────────────────────────
select pg_temp.act(3);
select public.save_receptionist_teacher_operations(pg_temp.id(810), null, jsonb_build_object('full_name', 'RPW D new teacher',
  'email', ' New.810@Example.test ', 'telephone', '0600000810', 'niveaux_autorises', jsonb_build_array('A1', 'A2'), 'notes', 'RPW D note'));
-- A resend of the same create answers with the record (REL-4); another identity conflicts.
select pg_temp.ok((select id = pg_temp.id(810) from public.save_receptionist_teacher_operations(pg_temp.id(810), null,
  jsonb_build_object('full_name', 'RPW D new teacher', 'email', 'new.810@example.test'))), 'item 18: resend answers with the record');
select pg_temp.refused(format($q$select public.save_receptionist_teacher_operations(%L, null, '{"full_name":"Other","email":"new.810@example.test"}')$q$,
  pg_temp.id(810)), '23505', null, 'item 18: same id, other identity');
select pg_temp.refused(format($q$select public.save_receptionist_teacher_operations(%L, null, '{"full_name":"No mail"}')$q$,
  pg_temp.id(811)), '22023', 'rpw.teacher_identity_required', 'item 18: e-mail required');
select pg_temp.refused(format($q$select public.save_receptionist_teacher_operations(%L, null, '{"full_name":"Pay","email":"pay@example.test","taux_horaire":100}')$q$,
  pg_temp.id(812)), '22023', null, 'item 18: pay key refused at creation');
select pg_temp.refused(format($q$select public.save_receptionist_teacher_operations(%L, %L, '{"contract_type":"Freelance"}')$q$,
  pg_temp.id(810), pg_temp.tupd(pg_temp.id(810))), '22023', null, 'item 18: contract key refused at update');
select pg_temp.refused($q$insert into public.teachers(full_name, email) values ('Direct', 'direct@example.test')$q$, '42501', null,
  'item 18: direct insert refused');
select pg_temp.ok((select notes = 'RPW D note' and email = 'new.810@example.test' from public.get_teacher_operations(pg_temp.id(810))),
  'item 19: the operations read returns notes and the normalised e-mail');
-- E-mail and notes while no login and no live invitation.
select public.save_receptionist_teacher_operations(pg_temp.id(810), pg_temp.tupd(pg_temp.id(810)),
  jsonb_build_object('email', 'changed.810@example.test', 'notes', 'RPW D note 2'));
select pg_temp.owner();
select pg_temp.ok((select email = 'changed.810@example.test' and notes = 'RPW D note 2' and contract_type is null
  and taux_horaire is null and salaire_mensuel is null and iban is null from public.teachers where id = pg_temp.id(810)),
  'items 18-19: saved, never a pay field');
-- A live invitation locks the e-mail; an expired one does not; a linked login locks it.
insert into public.pending_roles(id, email, role, teacher_id, expires_at) values (pg_temp.id(410), 'changed.810@example.test', 'teacher', pg_temp.id(810), now() + interval '1 day');
select pg_temp.act(3);
select pg_temp.refused(format($q$select public.save_receptionist_teacher_operations(%L, %L, '{"email":"again.810@example.test"}')$q$,
  pg_temp.id(810), pg_temp.tupd(pg_temp.id(810))), '42501', 'rpw.teacher_email_locked', 'N2 = A: live invitation locks the e-mail');
select public.save_receptionist_teacher_operations(pg_temp.id(810), pg_temp.tupd(pg_temp.id(810)), '{"notes":"RPW D note 3"}');
select pg_temp.owner();
update public.pending_roles set expires_at = now() - interval '1 minute' where id = pg_temp.id(410);
select pg_temp.act(3);
select public.save_receptionist_teacher_operations(pg_temp.id(810), pg_temp.tupd(pg_temp.id(810)), '{"email":"again.810@example.test"}');
select pg_temp.owner();
update public.profiles set linked_teacher_id = pg_temp.id(810) where id = pg_temp.id(4);
select pg_temp.act(3);
select pg_temp.refused(format($q$select public.save_receptionist_teacher_operations(%L, %L, '{"email":"third.810@example.test"}')$q$,
  pg_temp.id(810), pg_temp.tupd(pg_temp.id(810))), '42501', 'rpw.teacher_email_locked', 'N2 = A: linked login locks the e-mail');
select pg_temp.act(4);
select pg_temp.refused(format($q$select public.save_receptionist_teacher_operations(%L, null, '{"full_name":"T","email":"t@example.test"}')$q$,
  pg_temp.id(813)), '42501', null, 'item 18: teacher role refused');
select pg_temp.owner();

-- ── Storage purposes (items 17 and 18p) ───────────────────────────────────
select pg_temp.ok(storage_security.can_write(pg_temp.id(3), 'portfolio', pg_temp.id(300), null, null), 'storage: her portfolio of a learner');
select pg_temp.ok(not storage_security.can_write(pg_temp.id(3), 'portfolio', null, null, null), 'storage: no portfolio without a learner');
select pg_temp.ok(storage_security.can_write(pg_temp.id(3), 'teacher_photo', null, null, null)
  and storage_security.can_write(pg_temp.id(3), 'teacher_photo', null, pg_temp.id(810), null), 'storage: her teacher photo');
select pg_temp.ok(not storage_security.can_write(pg_temp.id(3), 'premium_homework', pg_temp.id(300), null, null), 'storage: premium homework refused');
select pg_temp.ok(not storage_security.can_write(pg_temp.id(4), 'teacher_photo', null, null, null), 'storage: a teacher refused');

-- ── Management unchanged ──────────────────────────────────────────────────
select pg_temp.act(2);
select pg_temp.ok(pg_temp.touched(format($q$delete from public.assessments where id = %L$q$, pg_temp.id(700))) = 1, 'admin still deletes a grade');
select pg_temp.ok(pg_temp.touched(format($q$update public.leave_requests set status = 'Approuvé' where id = %L$q$, pg_temp.id(730))) = 1,
  'admin still decides a leave request');
select pg_temp.owner();

rollback;
\echo PASS receptionist dossier and teaching (stage 3)
