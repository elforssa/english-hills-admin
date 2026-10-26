-- Enrollment and group consistency (plan EGC-r2, ADR-010; migrations M1 and M2).
-- Local Supabase only; synthetic fixtures; everything rolls back. Covers the
-- clean-up cores and M2's refusal (first, against counts read just before the
-- fixtures), then DAT-1, ACA-1..ACA-9, DAT-2, FIN-10, I1..I10, the leaver and
-- year-close commands, archive and restore, the CRM (D5-A) and online (D8 = A)
-- changes, every caller-rights reader as each role, storage, attendance after a
-- leaver, the nested-write sync and the ADR-009 conflict contract.
\set ON_ERROR_STOP on
begin;
alter table public.receipts disable trigger on_receipt_created;

create function pg_temp.ok(value boolean, label text) returns void language plpgsql as $$ begin
  if value is not true then raise exception 'FAIL: %', label; end if;
end $$;
create function pg_temp.id(i integer) returns uuid language sql immutable as $$
  select ('e9c00000-0000-4000-8000-' || lpad(to_hex(i), 12, '0'))::uuid
$$;
-- Act as a stored-role user through the API role, as PostgREST does.
create function pg_temp.act(i integer) returns void language plpgsql as $$ begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', case when i is null then '' else pg_temp.id(i)::text end, true);
  perform set_config('request.jwt.claims', case when i is null then '{"role":"anon"}'
    else json_build_object('sub', pg_temp.id(i), 'role', 'authenticated')::text end, true);
  execute case when i is null then 'set local role anon' else 'set local role authenticated' end;
end $$;
create function pg_temp.owner() returns void language plpgsql as $$ begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
end $$;
-- Expects one SQLSTATE and, when given, one exact hint; the statement's effects roll back.
create function pg_temp.fails(statement text, code text, hint text default null) returns void language plpgsql as $$
declare st text; h text; msg text; begin
  begin execute statement;
  exception when others then
    get stacked diagnostics st = returned_sqlstate, h = pg_exception_hint, msg = message_text;
    if st is distinct from code or (hint is not null and nullif(h, '') is distinct from hint) then
      raise exception 'FAIL: expected %/% from %, got %/% (%)', code, hint, statement, st, h, msg;
    end if;
    return;
  end;
  raise exception 'FAIL: expected %/% from %', code, hint, statement;
end $$;
-- Fixture readers run as the owner whatever the acting role.
create function pg_temp.su(p uuid) returns timestamptz language sql security definer as $$
  select updated_at from public.students where id = p $$;
create function pg_temp.eu(p uuid) returns timestamptz language sql security definer as $$
  select updated_at from public.enrollments where id = p $$;
create function pg_temp.file(p uuid) returns jsonb language sql security definer as $$
  select jsonb_build_object('status', status, 'groupe_id', groupe_id, 'session_type', session_type, 'niveau_cefr', niveau_cefr,
    'deleted', deleted_at is not null) from public.students where id = p $$;
create function pg_temp.member(p_student uuid, p_group uuid) returns boolean language sql security definer as $$
  select academic_security.is_group_member(p_student, p_group) $$;
create function pg_temp.members(p uuid) returns uuid[] language sql security definer as $$
  select coalesce(array_agg(x order by x), '{}') from academic_security.group_member_ids(p) x $$;
create function pg_temp.enr(p_student uuid, p_session text) returns public.enrollments language sql security definer as $$
  select * from public.enrollments where student_id = p_student and session_type = p_session
  order by (status in ('Rejected','Ended')), created_at desc limit 1 $$;
-- Owner-side seats (fixture setup): a Validated enrollment in a group.
create function pg_temp.seat(p_student uuid, p_group uuid, p_year text default '2026/2027') returns uuid language sql security definer as $$
  insert into public.enrollments(student_id, group_id, status, session_type, level, school_year)
  select p_student, g.id, 'Validated', g.session_type, g.niveau, p_year from public.groups g where g.id = p_group returning id $$;
-- Storage policy helpers as the storage policies call them (definer, caller's JWT).
create function pg_temp.can_insert(b text, o text, w text) returns boolean language sql security definer as $$
  select storage_security.can_insert_reserved_object(b, o, w) $$;
create function pg_temp.can_write(a uuid, p text, s uuid) returns boolean language sql security definer as $$
  select storage_security.can_write(a, p, s, null, null) $$;
create function pg_temp.open_to_api(t text) returns void language plpgsql as $$ begin
  execute format('grant select on %s to public', t);
end $$;

-- Users: 1 director, 2 admin, 3 receptionist, 4 teacher A (Yearly), 5 teacher B
-- (Mise à niveau), 6 parent of child 201, 7 student (adult learner 206), 8 pending,
-- 9 unrelated parent.
insert into auth.users(id, email, aud, role, email_confirmed_at, created_at, updated_at)
select pg_temp.id(i), 'egc-user-' || i || '@example.test', 'authenticated', 'authenticated', now(), now(), now()
from generate_series(1, 9) i;
update public.profiles set role = (array['director','admin','receptionist','teacher','teacher','parent','student','pending','parent'])
  [('x' || right(id::text, 4))::bit(16)::integer] where id::text like 'e9c00000-%';
insert into public.teachers(id, full_name, email, contract_type) values
  (pg_temp.id(101), 'EGC Teacher A', 'egc-user-4@example.test', 'Freelance'),
  (pg_temp.id(102), 'EGC Teacher B', 'egc-user-5@example.test', 'Freelance');
-- Portal readiness (PRF-r2 D4): each teacher account is bound to its record.
update public.profiles set linked_teacher_id = pg_temp.id(97 + right(id::text, 1)::integer)
  where id in (pg_temp.id(4), pg_temp.id(5));

-- ===========================================================================
-- Clean-up cores (R4) and M2's refusal on a synthetic copy of each Production
-- pattern, with the M1 NOT VALID checks; then the exact before-state comes back.
-- ===========================================================================
savepoint cleanup_rehearsal;
create temp table egc_base as select
  (select count(*) from public.students s where s.deleted_at is null and s.groupe_id is not null
    and not exists (select 1 from public.enrollments e where e.student_id = s.id and e.group_id = s.groupe_id and e.status in ('Validated','Trial'))) c1,
  (select count(*) from public.enrollments e where e.status in ('Confirmed','Validated','Trial') and e.group_id is not null
    and (e.session_type is null or e.school_year is null)) c1b,
  (select count(*) from public.enrollments e where e.status = 'Validated' and e.group_id is null) c2,
  (select count(*) from public.enrollments e join public.students st on st.id = e.student_id
    where st.deleted_at is not null and e.status in ('Submitted','Under Review','Confirmed','Validated','Trial')) c4;
-- Back to the M1 state of the checks (NOT VALID), as before the clean-up.
alter table public.enrollments drop constraint enrollments_active_requires_group;
alter table public.enrollments drop constraint enrollments_confirmed_has_programme;
insert into public.groups(id, name, session_type, niveau, annee, capacite_max) values
  (pg_temp.id(390), 'EGC cleanup Yearly', 'Yearly', 'Child 1', '2026-2027', 15);
set local session_replication_role = replica;
insert into public.students(id, full_name, status, session_type, niveau_cefr, groupe_id, created_at) values
  (pg_temp.id(901), 'Cleanup dossier member', 'Enrolled', 'Yearly', 'Child 1', pg_temp.id(390), '2026-07-01'),
  (pg_temp.id(902), 'Cleanup past programme', 'Enrolled', 'Summer Camp', null, null, '2026-05-01'),
  (pg_temp.id(903), 'Cleanup grouped legacy', 'Enrolled', 'Yearly', 'Child 1', pg_temp.id(390), '2026-05-01'),
  (pg_temp.id(904), 'Cleanup no school year', 'Enrolled', 'Yearly', 'Child 1', pg_temp.id(390), '2026-05-01'),
  (pg_temp.id(905), 'Cleanup former balance', 'Enrolled', 'Communication Adult', null, null, '2026-03-01'),
  (pg_temp.id(906), 'Cleanup archived', 'Enrolled', 'Adults', null, null, '2026-03-01'),
  (pg_temp.id(907), 'Cleanup MAN legacy payer', 'Enrolled', 'Mise à niveau', null, null, '2026-08-15'),
  (pg_temp.id(908), 'Cleanup dossier paid after M1', 'Enrolled', 'Yearly', 'Child 1', pg_temp.id(390), '2026-07-01');
insert into public.enrollments(id, student_id, group_id, status, session_type, school_year, level, date_inscription) values
  (pg_temp.id(912), pg_temp.id(902), null, 'Validated', null, null, null, '2026-05-24'),
  (pg_temp.id(913), pg_temp.id(903), null, 'Validated', null, null, null, '2026-05-24'),
  (pg_temp.id(914), pg_temp.id(904), pg_temp.id(390), 'Validated', 'Yearly', null, 'Child 1', '2026-05-24'),
  (pg_temp.id(916), pg_temp.id(906), null, 'Confirmed', 'Adults', '2026/2027', null, '2026-09-01'),
  -- DS1: a payment made between M1 and the clean-up left a Confirmed Yearly enrollment.
  (pg_temp.id(918), pg_temp.id(908), null, 'Confirmed', 'Yearly', '2026/2027', null, '2026-09-20');
update public.students set deleted_at = now() where id = pg_temp.id(906);
-- Attendance recorded through the dossier group before EGC.
insert into public.attendance(student_id, group_id, session_date, status) select pg_temp.id(901), pg_temp.id(390), current_date - 20, 'Présent';
set local session_replication_role = origin;
alter table public.enrollments add constraint enrollments_active_requires_group
  check (coalesce(status, '') not in ('Validated','Trial') or group_id is not null) not valid;
alter table public.enrollments add constraint enrollments_confirmed_has_programme
  check (coalesce(status, '') not in ('Confirmed','Validated','Trial') or (session_type is not null and school_year is not null)) not valid;
insert into public.charges(id, student_id, session_type, school_year, service_description, plan_type, gross_amount, legacy, created_by) values
  (pg_temp.id(921), pg_temp.id(901), 'Yearly', '2026/2027', 'Yearly · 2026/2027', 'Standard', 5000, false, pg_temp.id(2)),
  (pg_temp.id(925), pg_temp.id(905), 'Legacy', null, 'Reçu historique 0001', null, 900, true, null),
  (pg_temp.id(927), pg_temp.id(907), 'Legacy', null, 'Reçu historique 0002', null, 1200, true, null);
select pg_temp.act(2);
select public.create_charge_payment(jsonb_build_object('student_id', pg_temp.id(907), 'charge_id', pg_temp.id(927),
  'payment_amount', 600, 'payment_method', 'Espèces', 'idempotency_key', pg_temp.id(928)));
select pg_temp.owner();
create temp table egc_snapshot as select
  (select jsonb_agg(to_jsonb(s) - 'updated_at' order by s.id) from public.students s where s.id in (select pg_temp.id(i) from generate_series(901, 908) i)) students,
  (select jsonb_agg(to_jsonb(e) - 'updated_at' order by e.id) from public.enrollments e where e.student_id in (select pg_temp.id(i) from generate_series(901, 908) i)) enrollments,
  (select jsonb_agg(jsonb_build_object('id', c.id, 'enrollment_id', c.enrollment_id) order by c.id) from public.charges c where c.student_id in (select pg_temp.id(i) from generate_series(901, 908) i)) charges;
select pg_temp.ok(academic_security.egc_enforcement_failures() @> array[
  'I2: a learner-file group is not backed by a membership',
  'I1: a Validated or Trial enrollment has no group',
  'I9: a Confirmed, Validated or Trial enrollment lacks its programme or school year',
  'I8: an archived learner has an active enrollment'], 'M2 refuses on each unmet invariant before the clean-up');
-- C1, C1b and C5 stop for a decision (P0001, named case) before writing a row
-- that would collide with a live enrollment; each case and its fixture roll back.
create function pg_temp.stops(setup text, statement text, pattern text) returns void language plpgsql as $f$
begin
  begin
    execute setup; execute statement;
  exception when others then
    if sqlstate = 'P0001' and sqlerrm ~ pattern then return; end if;
    raise exception 'expected P0001 /%/, got % %', pattern, sqlstate, sqlerrm;
  end;
  raise exception 'expected P0001 /%/, the stage ran', pattern;
end $f$;
select pg_temp.stops($s$
    set local session_replication_role = replica;
    insert into public.students(id, full_name, status, session_type, niveau_cefr, groupe_id) values
      (pg_temp.id(909), 'Cleanup dossier with a pre-enrollment', 'Enrolled', 'Yearly', 'Child 1', pg_temp.id(390));
    insert into public.enrollments(student_id, status, session_type, school_year) values (pg_temp.id(909), 'Submitted', 'Yearly', '2026/2027');
    set local session_replication_role = origin;$s$,
  $s$select academic_security.egc_cleanup_c1((select c1 from egc_base)::integer + 4, 1)$s$, 'C1: .*cannot be placed');
select pg_temp.stops($s$
    alter table public.enrollments drop constraint enrollments_confirmed_has_programme;
    set local session_replication_role = replica;
    insert into public.students(id, full_name, status, session_type, niveau_cefr) values (pg_temp.id(910), 'Cleanup year collision', 'Enrolled', 'Yearly', 'Child 1');
    insert into public.enrollments(student_id, group_id, status, session_type, school_year, level) values
      (pg_temp.id(910), pg_temp.id(390), 'Validated', 'Yearly', null, 'Child 1'),
      (pg_temp.id(910), null, 'Submitted', 'Yearly', '2026/2027', null);
    set local session_replication_role = origin;
    alter table public.enrollments add constraint enrollments_confirmed_has_programme
      check (coalesce(status, '') not in ('Confirmed','Validated','Trial') or (session_type is not null and school_year is not null)) not valid;$s$,
  $s$select academic_security.egc_cleanup_c1b((select c1b from egc_base)::integer + 2)$s$, 'C1b: .*another live enrollment');
select pg_temp.stops($s$
    set local session_replication_role = replica;
    insert into public.students(id, full_name, status, session_type) values (pg_temp.id(911), 'Cleanup MAN with a pre-enrollment', 'Enrolled', 'Mise à niveau');
    insert into public.enrollments(student_id, status, session_type, school_year) values (pg_temp.id(911), 'Submitted', 'Mise à niveau', '2026/2027');
    insert into public.charges(id, student_id, session_type, service_description, gross_amount, legacy) values
      (pg_temp.id(929), pg_temp.id(911), 'Legacy', 'Reçu historique 0003', 800, true);
    insert into public.receipts(student_id, charge_id, date, nom_prenom, montant_total, montant_paye, mode_paiement, session_type, legacy, actor_id)
      values (pg_temp.id(911), pg_temp.id(929), current_date - 3, 'Cleanup MAN with a pre-enrollment', 800, 400, 'Espèces', 'Legacy', true, pg_temp.id(2));
    set local session_replication_role = origin;$s$,
  $s$select academic_security.egc_cleanup_c5(2, '2026/2027', current_date - 30)$s$, 'C5: .*live Mise à niveau');
-- Each stage refuses a count other than the approved one, and changes nothing.
select pg_temp.fails(format('select academic_security.egc_cleanup_c1(%s, 1)', (select c1 from egc_base) + 4), 'P0001');
select pg_temp.ok(academic_security.egc_cleanup_c1((select c1 from egc_base)::integer + 3, 1) = (select c1 from egc_base) + 3, 'C1 back-fills the dossier groups');
select pg_temp.ok((select status = 'Validated' and group_id = pg_temp.id(390) and level = 'Child 1' from public.enrollments where id = pg_temp.id(918))
  and (select count(*) = 1 from public.enrollments where student_id = pg_temp.id(908) and status not in ('Rejected','Ended')),
  'C1 places the existing Confirmed enrollment instead of inserting a second one (DS1)');
select pg_temp.ok((select count(*) = 1 from public.enrollments e where e.student_id = pg_temp.id(901) and e.group_id = pg_temp.id(390)
    and e.status = 'Validated' and e.school_year = '2026/2027' and e.notes = 'Rattrapage EGC')
  and (select enrollment_id from public.charges where id = pg_temp.id(921)) = (select id from public.enrollments where student_id = pg_temp.id(901) and status = 'Validated')
  and pg_temp.file(pg_temp.id(901))->>'groupe_id' = pg_temp.id(390)::text, 'C1: Validated membership, single Yearly charge linked, file group kept');
select pg_temp.fails('select academic_security.egc_cleanup_c1(0, 0)', 'P0001');
select pg_temp.ok(academic_security.egc_cleanup_c1b((select c1b from egc_base)::integer + 1) >= 1, 'C1b runs');
select pg_temp.ok((select school_year from public.enrollments where id = pg_temp.id(914)) = '2026/2027', 'C1b gives the grouped row its school year');
select pg_temp.ok(academic_security.egc_cleanup_c2((select c2 from egc_base)::integer + 2) >= 2, 'C2 runs');
select pg_temp.ok((select status = 'Ended' and end_reason = 'Inscription historique sans groupe' and group_id is null
       from public.enrollments where id = pg_temp.id(913))
  and pg_temp.file(pg_temp.id(903))->>'groupe_id' = pg_temp.id(390)::text, 'C2 ends legacy rows; the grouped learner keeps its group');
select pg_temp.ok(academic_security.egc_cleanup_c3(2, 'Alumni', current_date - 30) = 2, 'C3 runs');
select pg_temp.ok(pg_temp.file(pg_temp.id(902))->>'status' = 'Alumni' and pg_temp.file(pg_temp.id(905))->>'status' = 'Alumni'
  and (select balance from public.charge_balances where id = pg_temp.id(925)) = 900, 'C3 former learners become Alumni; balances unchanged');
select pg_temp.ok(academic_security.egc_cleanup_c4((select c4 from egc_base)::integer + 1) >= 1, 'C4 runs');
select pg_temp.ok((select status from public.enrollments where id = pg_temp.id(916)) = 'Ended', 'C4 ends the archived learner''s enrollment');
select pg_temp.ok(academic_security.egc_cleanup_c5(1, '2026/2027', current_date - 30) = 1, 'C5 runs');
select pg_temp.ok(exists (select 1 from public.enrollments where student_id = pg_temp.id(907) and status = 'Confirmed'
    and session_type = 'Mise à niveau' and group_id is null and level is null), 'C5 waiting MAN enrollment');
select pg_temp.ok(cardinality(academic_security.egc_enforcement_failures()) = 0, 'C6: every invariant holds, M2 may run');
select pg_temp.ok((academic_security.egc_cleanup_c6()->>'unbacked_file_groups')::integer = 0
  and (academic_security.egc_cleanup_c6()->>'archived_with_active')::integer = 0, 'C6 counts');
select pg_temp.ok(not exists (select 1 from maintenance.egc_cleanup_log l where l.before::text ~* 'cleanup |full_name'
  or l.after::text ~* 'cleanup |full_name'), 'journal holds ids and statuses only');
-- A stage cannot be reverted while a later one is applied (M2 without C1b is
-- proved by the upgrade test's skip-c1b mode).
select pg_temp.fails($$select academic_security.egc_revert_cleanup('C1b')$$, 'P0001');
-- Reversal in reverse order restores the exact before-state.
select academic_security.egc_revert_cleanup(x) from unnest(array['C5','C4','C3','C2','C1b','C1']) x;
select pg_temp.ok((select jsonb_agg(to_jsonb(s) - 'updated_at' order by s.id) from public.students s
    where s.id in (select pg_temp.id(i) from generate_series(901, 908) i)) = (select students from egc_snapshot)
  and (select jsonb_agg(to_jsonb(e) - 'updated_at' order by e.id) from public.enrollments e
    where e.student_id in (select pg_temp.id(i) from generate_series(901, 908) i)) = (select enrollments from egc_snapshot)
  and (select jsonb_agg(jsonb_build_object('id', c.id, 'enrollment_id', c.enrollment_id) order by c.id) from public.charges c
    where c.student_id in (select pg_temp.id(i) from generate_series(901, 908) i)) = (select charges from egc_snapshot)
  and not exists (select 1 from maintenance.egc_cleanup_log), 'revert_cleanup restores the exact before-state');
rollback to savepoint cleanup_rehearsal;
select pg_temp.ok(cardinality(academic_security.egc_enforcement_failures()) = 0, 'enforced database again after the rehearsal');

-- ===========================================================================
-- Fixtures.
-- ===========================================================================
insert into public.groups(id, name, session_type, niveau, teacher_id, annee, capacite_max) values
  (pg_temp.id(301), 'EGC Yearly C1', 'Yearly', 'Child 1', pg_temp.id(101), '2026-2027', 15),
  (pg_temp.id(302), 'EGC MAN A1', 'Mise à niveau', 'A1', pg_temp.id(102), '2026-2027', 10),
  (pg_temp.id(303), 'EGC Yearly C2', 'Yearly', 'Child 2', null, '2026-2027', 15),
  (pg_temp.id(304), 'EGC Adults B1', 'Adults', 'Beginning 1', null, '2026-2027', 2),
  (pg_temp.id(305), 'EGC level lock', 'Yearly', 'Child 1', null, '2026-2027', 15),
  (pg_temp.id(306), 'EGC mismatch', 'Yearly', 'Child 1', null, '2026-2027', 15),
  (pg_temp.id(307), 'EGC Online one', 'Online', 'B1', null, '2026-2027', 15),
  (pg_temp.id(308), 'EGC Online two', 'Online', 'B1', null, '2026-2027', 15);
insert into public.students(id, full_name, email, parent_email, telephone, status, session_type, niveau_cefr)
select pg_temp.id(200 + i), 'EGC Learner ' || i,
  case when i = 6 then 'egc-user-7@example.test' else 'egc-l' || i || '@example.test' end,
  case when i = 1 then 'egc-user-6@example.test' else null end,
  '06' || lpad((80000000 + i)::text, 8, '0'), 'Prospect', 'Yearly', null
from generate_series(1, 40) i;
-- Portal readiness (PRF-r2 D3): the parent and the adult learner see their learner
-- through an explicit active link, not through the matching dossier address.
insert into public.family_links(student_id, relation, profile_id, invite_email, status, activated_at) values
  (pg_temp.id(201), 'parent', pg_temp.id(6), 'egc-user-6@example.test', 'active', now()),
  (pg_temp.id(206), 'self', pg_temp.id(7), 'egc-user-7@example.test', 'active', now());

-- ===========================================================================
-- DAT-1: a second programme never moves the first (every placement path).
-- ===========================================================================
select pg_temp.act(2);
-- Yearly memberships through the placement command (creates a Validated enrollment).
do $$ declare i integer; begin
  foreach i in array array[201, 202, 203, 204, 205] loop
    perform public.place_learner_in_group(pg_temp.id(i), pg_temp.id(301), pg_temp.su(pg_temp.id(i)));
  end loop;
end $$;
select pg_temp.ok(pg_temp.file(pg_temp.id(201)) = jsonb_build_object('status', 'Enrolled', 'groupe_id', pg_temp.id(301), 'session_type', 'Yearly',
  'niveau_cefr', 'Child 1', 'deleted', false) and (pg_temp.enr(pg_temp.id(201), 'Yearly')).status = 'Validated'
  and (pg_temp.enr(pg_temp.id(201), 'Yearly')).school_year = '2026/2027', 'placement without enrollment creates a Validated one (DAT-2)');
-- (a) group page command, (b) reception command, (c) enrollment editor, (d) CRM below, (e) payment then placement.
select public.place_learner_in_group(pg_temp.id(201), pg_temp.id(302), pg_temp.su(pg_temp.id(201)));
select pg_temp.act(3);
select public.assign_receptionist_student_group(pg_temp.id(202), null, pg_temp.id(302), pg_temp.su(pg_temp.id(202)), null);
select pg_temp.act(2);
create temp table egc_ids as select public.create_enrollment(pg_temp.id(203),
  '{"session_type":"Mise à niveau","school_year":"2026/2027"}') e203;
select pg_temp.open_to_api('egc_ids');
select public.place_learner_in_group(pg_temp.id(203), pg_temp.id(302), pg_temp.su(pg_temp.id(203)), (select e203 from egc_ids), null,
  pg_temp.eu((select e203 from egc_ids)));
select pg_temp.ok((select status from public.enrollments where id = (select e203 from egc_ids)) = 'Submitted'
  and not pg_temp.member(pg_temp.id(203), pg_temp.id(302)), 'a placed pre-enrollment reserves the group but is not a member');
select public.save_enrollment_changes((select e203 from egc_ids), pg_temp.eu((select e203 from egc_ids)), '{"status":"Validated"}');
select public.create_charge_payment(jsonb_build_object('student_id', pg_temp.id(205), 'session_type', 'Mise à niveau',
  'school_year', '2026/2027', 'gross_amount', 1000, 'payment_amount', 200, 'payment_method', 'Espèces', 'idempotency_key', pg_temp.id(1205)));
select pg_temp.ok((pg_temp.enr(pg_temp.id(205), 'Mise à niveau')).status = 'Confirmed'
  and pg_temp.file(pg_temp.id(205))->>'groupe_id' = pg_temp.id(301)::text, 'a second-programme payment keeps the Yearly group');
select public.place_learner_in_group(pg_temp.id(205), pg_temp.id(302), pg_temp.su(pg_temp.id(205)));
select pg_temp.owner();
do $$ declare i integer; begin
  foreach i in array array[201, 202, 203, 205] loop
    perform pg_temp.ok(pg_temp.file(pg_temp.id(i)) = jsonb_build_object('status', 'Enrolled', 'groupe_id', pg_temp.id(301),
      'session_type', 'Yearly', 'niveau_cefr', 'Child 1', 'deleted', false), 'main group, programme and level stay Yearly for ' || i);
    perform pg_temp.ok(pg_temp.member(pg_temp.id(i), pg_temp.id(301))
      and pg_temp.member(pg_temp.id(i), pg_temp.id(302)), 'both memberships for ' || i);
  end loop;
end $$;
select pg_temp.ok(pg_temp.members(pg_temp.id(301)) @> array[pg_temp.id(201), pg_temp.id(202), pg_temp.id(203), pg_temp.id(205)]
  and pg_temp.members(pg_temp.id(302)) @> array[pg_temp.id(201), pg_temp.id(202), pg_temp.id(203), pg_temp.id(205)], 'both rosters');
-- Attendance on both groups; teacher access for both teachers; announcements for both groups.
select pg_temp.act(2);
insert into public.attendance(student_id, group_id, session_date, status) values
  (pg_temp.id(201), pg_temp.id(301), current_date - 3, 'Présent'), (pg_temp.id(201), pg_temp.id(302), current_date - 3, 'Présent');
insert into public.announcements(id, title, body, group_id, audience) values
  (pg_temp.id(701), 'EGC Yearly notice', 'Yearly', pg_temp.id(301), 'group'),
  (pg_temp.id(702), 'EGC MAN notice', 'MAN', pg_temp.id(302), 'group'),
  (pg_temp.id(703), 'EGC Adults notice', 'Adults', pg_temp.id(304), 'group');
select pg_temp.act(4);
select pg_temp.ok(public.teacher_can_access_student_group(pg_temp.id(201), pg_temp.id(301))
  and not public.teacher_can_access_student_group(pg_temp.id(201), pg_temp.id(302)), 'teacher A through the Yearly group only');
select pg_temp.ok(exists (select 1 from public.portal_teacher_roster() where student_id = pg_temp.id(201)), 'teacher A reads the learner file');
select pg_temp.act(5);
select pg_temp.ok(public.teacher_can_access_student_group(pg_temp.id(201), pg_temp.id(302)), 'teacher B through the second-programme group');
select pg_temp.ok(exists (select 1 from public.portal_teacher_roster() where student_id = pg_temp.id(201)), 'teacher B reads the learner file');
select pg_temp.ok(public.can_message_recipient('egc-user-6@example.test'), 'teacher B may message the parent');
select pg_temp.act(6);
select pg_temp.ok((select array_agg(id order by id) from public.announcements where id in (pg_temp.id(701), pg_temp.id(702), pg_temp.id(703)))
  = array[pg_temp.id(701), pg_temp.id(702)], 'the parent sees both groups'' announcements, not another group''s');
select pg_temp.ok((select array_agg(x order by x) from public.my_member_group_ids() x) = array[pg_temp.id(301), pg_temp.id(302)],
  'my_member_group_ids: the parent''s own learner''s groups');
select pg_temp.ok(public.can_message_recipient('egc-user-5@example.test') and public.can_message_recipient('egc-user-4@example.test'),
  'the parent may message both teachers');
select pg_temp.act(9);
select pg_temp.ok(not exists (select 1 from public.announcements where id in (pg_temp.id(701), pg_temp.id(702)))
  and not exists (select 1 from public.my_member_group_ids()), 'an unrelated parent sees neither');
select pg_temp.owner();

-- ===========================================================================
-- ACA-1 / I4 / I5: populated groups keep programme and level; payments never fail on a group edit.
-- ===========================================================================
select pg_temp.act(2);
select pg_temp.fails(format('update public.groups set niveau = %L where id = %L', 'Child 2', pg_temp.id(301)), '23514', 'egc.group_level_locked');
select pg_temp.fails(format('update public.groups set session_type = %L, niveau = %L where id = %L', 'Adults', 'Beginning 1', pg_temp.id(301)), '23514', 'egc.group_level_locked');
select pg_temp.act(1);
select pg_temp.fails(format('update public.groups set niveau = %L where id = %L', 'Child 2', pg_temp.id(301)), '23514', 'egc.group_level_locked');
update public.groups set salle = 'Salle EGC' where id = pg_temp.id(301);
select pg_temp.act(3);
select pg_temp.fails(format($$select public.save_receptionist_group(%L, %L, '{"niveau":"Child 2"}')$$, pg_temp.id(301),
  (select updated_at from public.groups where id = pg_temp.id(301))), '23514');
select pg_temp.act(2);
select public.place_learner_in_group(pg_temp.id(206), pg_temp.id(305), pg_temp.su(pg_temp.id(206)));
select pg_temp.fails(format('update public.groups set niveau = %L where id = %L', 'Child 2', pg_temp.id(305)), '23514', 'egc.group_level_locked');
select public.remove_learner_from_group(pg_temp.id(206), pg_temp.id(305), pg_temp.su(pg_temp.id(206)));
update public.groups set niveau = 'Child 2' where id = pg_temp.id(305);
select pg_temp.ok((select niveau from public.groups where id = pg_temp.id(305)) = 'Child 2', 'level changes after the last member leaves');
select pg_temp.fails(format('select public.place_learner_in_group(%L, %L, %L, %L, null, %L)', pg_temp.id(206), pg_temp.id(305),
  pg_temp.su(pg_temp.id(206)), (pg_temp.enr(pg_temp.id(206), 'Yearly')).id, (pg_temp.enr(pg_temp.id(206), 'Yearly')).updated_at),
  '23514', 'egc.group_mismatch');
-- I4 narrowing: a payment on a Validated enrollment whose group drifted (seeded with triggers disabled).
select public.place_learner_in_group(pg_temp.id(207), pg_temp.id(306), pg_temp.su(pg_temp.id(207)));
select pg_temp.owner();
insert into public.charges(id, student_id, enrollment_id, session_type, school_year, service_description, plan_type, gross_amount, created_by)
values (pg_temp.id(1207), pg_temp.id(207), (pg_temp.enr(pg_temp.id(207), 'Yearly')).id, 'Yearly', '2026/2027', 'Yearly · 2026/2027', 'Standard', 4000, pg_temp.id(2));
set local session_replication_role = replica;
update public.groups set niveau = 'Child 3' where id = pg_temp.id(306);
set local session_replication_role = origin;
select pg_temp.act(2);
select pg_temp.ok((public.create_charge_payment(jsonb_build_object('student_id', pg_temp.id(207), 'charge_id', pg_temp.id(1207),
  'payment_amount', 500, 'payment_method', 'Espèces', 'idempotency_key', pg_temp.id(1208))))->>'receipt_id' is not null,
  'a payment succeeds over a pre-existing group mismatch (I4 evaluated only when the assignment changes)');
select pg_temp.owner();

-- ===========================================================================
-- DAT-2 / ACA-7: the file group, programme and level follow enrollments.
-- ===========================================================================
select pg_temp.act(2);
select pg_temp.fails(format($$insert into public.students(full_name, groupe_id) values ('EGC direct', %L)$$, pg_temp.id(301)), '23514', 'egc.group_from_enrollment');
select pg_temp.fails(format('update public.students set groupe_id = %L where id = %L', pg_temp.id(303), pg_temp.id(201)), '23514', 'egc.group_from_enrollment');
select pg_temp.fails(format('update public.students set groupe_id = null where id = %L', pg_temp.id(201)), '23514', 'egc.group_from_enrollment');
select pg_temp.fails(format('update public.students set niveau_cefr = %L where id = %L', 'Child 2', pg_temp.id(201)), '23514', 'egc.programme_follows_group');
select pg_temp.fails(format('update public.students set session_type = %L where id = %L', 'Adults', pg_temp.id(201)), '23514', 'egc.programme_follows_group');
update public.students set session_type = 'Adults', niveau_cefr = 'Beginning 2' where id = pg_temp.id(240);
select pg_temp.ok(pg_temp.file(pg_temp.id(240))->>'session_type' = 'Adults', 'a learner without membership keeps a free intended programme');
-- A whole-row save that leaves the guarded columns unchanged succeeds.
update public.students set notes = 'EGC note', groupe_id = pg_temp.id(301), session_type = 'Yearly', niveau_cefr = 'Child 1', status = 'Enrolled'
 where id = pg_temp.id(201);
-- D3-A: a new file is a Prospect; Enrolled/Trial follow an enrollment.
insert into public.students(id, full_name, status) values (pg_temp.id(241), 'EGC imported', 'Enrolled');
select pg_temp.ok(pg_temp.file(pg_temp.id(241))->>'status' = 'Prospect', 'insert as Enrolled becomes Prospect');
select pg_temp.fails(format('update public.students set status = %L where id = %L', 'Enrolled', pg_temp.id(241)), '23514', 'egc.status_follows_enrollment');
select pg_temp.fails(format('update public.students set status = %L where id = %L', 'Prospect', pg_temp.id(201)), '23514', 'egc.status_follows_enrollment');
select pg_temp.fails(format('update public.students set status = %L where id = %L', 'Alumni', pg_temp.id(201)), '23514', 'egc.use_leaver');
select pg_temp.act(4);
update public.students set groupe_id = null where id = pg_temp.id(201);
select pg_temp.act(3);
update public.students set groupe_id = null where id = pg_temp.id(201);
select pg_temp.act(6);
update public.students set groupe_id = null where id = pg_temp.id(201);
select pg_temp.owner();
select pg_temp.ok(pg_temp.file(pg_temp.id(201))->>'groupe_id' = pg_temp.id(301)::text, 'no role writes the file group directly');
-- Payment implicit branch: reuses the single active enrollment, refuses two, inserts with none.
select pg_temp.act(2);
create temp table egc_pay as select public.create_charge_payment(jsonb_build_object('student_id', pg_temp.id(201),
  'session_type', 'Yearly', 'school_year', '2026/2027', 'gross_amount', 6000, 'payment_amount', 1000,
  'payment_method', 'Espèces', 'idempotency_key', pg_temp.id(1201))) r;
select pg_temp.open_to_api('egc_pay');
select pg_temp.ok((select (r->>'enrollment_id')::uuid from egc_pay) = (pg_temp.enr(pg_temp.id(201), 'Yearly')).id
  and (select count(*) from public.enrollments where student_id = pg_temp.id(201) and session_type = 'Yearly') = 1
  and (select (r->>'student_enrolled')::boolean and (r->>'enrollment_confirmed')::boolean and not (r->>'group_pending')::boolean from egc_pay),
  'an unlinked charge reuses the learner''s single Yearly enrollment');
select pg_temp.owner();
insert into public.enrollments(student_id, status, session_type) values (pg_temp.id(208), 'Submitted', 'Yearly');
insert into public.enrollments(student_id, status, session_type, school_year) values (pg_temp.id(208), 'Under Review', 'Yearly',
  academic_security.school_year_on(academic_security.today()));
insert into public.charges(id, student_id, session_type, service_description, plan_type, gross_amount, created_by)
values (pg_temp.id(1209), pg_temp.id(208), 'Yearly', 'Yearly · Standard', 'Standard', 3000, pg_temp.id(2));
select pg_temp.act(2);
select pg_temp.fails(format($$select public.create_charge_payment(jsonb_build_object('student_id', %L, 'charge_id', %L,
  'payment_amount', 100, 'payment_method', 'Espèces', 'idempotency_key', %L))$$, pg_temp.id(208), pg_temp.id(1209), pg_temp.id(1210)), '22023');
select public.create_charge_payment(jsonb_build_object('student_id', pg_temp.id(209), 'session_type', 'Adults', 'school_year', '2026/2027',
  'level', 'Beginning 1', 'gross_amount', 1000, 'payment_amount', 100, 'payment_method', 'Espèces', 'idempotency_key', pg_temp.id(1211)));
select pg_temp.ok((pg_temp.enr(pg_temp.id(209), 'Adults')).status = 'Confirmed' and pg_temp.file(pg_temp.id(209))->>'status' = 'Enrolled',
  'with no matching enrollment the payment inserts a Confirmed one (FIN-10: the enrollment sets Enrolled)');
-- FIN-10: Other and legacy receipts change no status.
select public.create_charge_payment(jsonb_build_object('student_id', pg_temp.id(210), 'session_type', 'Other', 'school_year', '2026/2027',
  'service_detail', 'Livre EGC', 'gross_amount', 100, 'payment_amount', 100, 'payment_method', 'Espèces', 'idempotency_key', pg_temp.id(1212)));
select pg_temp.ok(pg_temp.file(pg_temp.id(210))->>'status' = 'Prospect', 'an Other receipt changes no status');
select pg_temp.owner();

-- ===========================================================================
-- ACA-4: a legacy Validated row without group never clears the main group.
-- ===========================================================================
alter table public.enrollments drop constraint enrollments_active_requires_group;
alter table public.enrollments drop constraint enrollments_confirmed_has_programme;
set local session_replication_role = replica;
insert into public.enrollments(id, student_id, status) values (pg_temp.id(811), pg_temp.id(204), 'Validated');
set local session_replication_role = origin;
alter table public.enrollments add constraint enrollments_active_requires_group
  check (coalesce(status, '') not in ('Validated','Trial') or group_id is not null) not valid;
alter table public.enrollments add constraint enrollments_confirmed_has_programme
  check (coalesce(status, '') not in ('Confirmed','Validated','Trial') or (session_type is not null and school_year is not null)) not valid;
select pg_temp.act(2);
insert into public.enrollments(id, student_id, status, session_type) values (pg_temp.id(812), pg_temp.id(204), 'Submitted', 'Adults');
delete from public.enrollments where id = pg_temp.id(812);
insert into public.enrollments(id, student_id, status, session_type) values (pg_temp.id(813), pg_temp.id(204), 'Submitted', 'Adults');
update public.enrollments set status = 'Rejected' where id = pg_temp.id(813);
select pg_temp.owner();
select pg_temp.ok(pg_temp.file(pg_temp.id(204))->>'groupe_id' = pg_temp.id(301)::text and pg_temp.file(pg_temp.id(204))->>'status' = 'Enrolled',
  'a legacy Validated row without group never clears the main group (inserts, deletes, rejections)');
-- Fixture removal of the legacy row (a command-only delete, I10), then the
-- enforced checks are valid again.
select set_config('eh.enrollment_command', 'on', true);
delete from public.enrollments where id = pg_temp.id(811);
select set_config('eh.enrollment_command', '', true);
alter table public.enrollments validate constraint enrollments_confirmed_has_programme;
alter table public.enrollments validate constraint enrollments_active_requires_group;

-- ===========================================================================
-- CRM path for DAT-1 (d) and D5-A.
-- ===========================================================================
select set_config('request.jwt.claim.sub', pg_temp.id(1)::text, true);
create temp table egc_policy as select (public.crm_create_followup_policy(gen_random_uuid(),
  '{"weekly_hours":{"1":[["08:00","22:00"]],"2":[["08:00","22:00"]],"3":[["08:00","22:00"]],"4":[["08:00","22:00"]],"5":[["08:00","22:00"]],"6":[["08:00","22:00"]],"7":[["08:00","22:00"]]},"attempt_offsets":[0,0,1,3,5]}')->>'policy_id')::uuid id;
create temp sequence egc_n;
create function pg_temp.qualified_lead() returns uuid language plpgsql as $$ declare l uuid; n bigint := nextval('egc_n'); begin
  perform set_config('request.jwt.claim.sub', pg_temp.id(3)::text, true);
  l := (public.crm_create_manual_lead(gen_random_uuid(), jsonb_build_object('display_name', 'EGC parent ' || n,
    'learner_name', 'EGCn' || n || ' Learner', 'phone', '06' || lpad((71900000 + n)::text, 8, '0'), 'source_label', 'Manual'))->'lead'->>'id')::uuid;
  perform public.crm_qualify_lead(gen_random_uuid(), jsonb_build_object('lead_id', l, 'expected_version', (select version from public.crm_leads where id = l),
    'conversation_channel', 'phone', 'note', 'EGC synthetic', 'qualification_step', 'placement_test',
    'next_task', jsonb_build_object('task_type', 'confirm_placement_test', 'due_at', now() + interval '2 days')));
  return l;
end $$;
create function pg_temp.crm_existing(l uuid, s uuid, session text, grp uuid, initial text default 'Submitted', year text default '2026/2027') returns jsonb
language sql security definer as $$
  select jsonb_build_object('lead_id', l, 'expected_version', x.version, 'student_choice', 'existing', 'student_id', s,
    'session_type', session, 'school_year', year, 'group_id', grp, 'initial_status', initial) from public.crm_leads x where x.id = l
$$;
create function pg_temp.lead_e(l uuid) returns uuid language sql security definer as $$
  select enrollment_id from public.crm_leads where id = l $$;
create function pg_temp.lead_v(l uuid) returns bigint language sql security definer as $$
  select version from public.crm_leads where id = l $$;
create temp table egc_crm as select pg_temp.qualified_lead() trial, pg_temp.qualified_lead() conv, pg_temp.qualified_lead() back,
  pg_temp.qualified_lead() full_group;
select pg_temp.open_to_api('egc_crm');
select pg_temp.act(3);
select public.crm_start_enrollment(gen_random_uuid(), pg_temp.crm_existing((select trial from egc_crm), pg_temp.id(204), 'Mise à niveau', pg_temp.id(302), 'Trial'));
select pg_temp.owner();
select pg_temp.ok(pg_temp.member(pg_temp.id(204), pg_temp.id(302))
  and pg_temp.file(pg_temp.id(204))->>'groupe_id' = pg_temp.id(301)::text, 'CRM start with a group: second membership, main group stays Yearly');
-- D5-A: an ended converted enrollment keeps its conversion; a later lead creates a new enrollment.
select pg_temp.act(3);
select public.crm_start_enrollment(gen_random_uuid(), pg_temp.crm_existing((select conv from egc_crm), pg_temp.id(211), 'Adults', null));
select pg_temp.owner();
select pg_temp.act(2);
select public.create_charge_payment(jsonb_build_object('student_id', pg_temp.id(211), 'enrollment_id',
  pg_temp.lead_e((select conv from egc_crm)), 'session_type', 'Adults', 'school_year', '2026/2027',
  'gross_amount', 1000, 'payment_amount', 100, 'payment_method', 'Espèces', 'idempotency_key', pg_temp.id(1213)));
select pg_temp.owner();
select pg_temp.ok((select status from public.crm_leads where id = (select conv from egc_crm)) = 'CONVERTED', 'payment converts the lead');
select pg_temp.act(1);
select public.end_learner(pg_temp.id(211), pg_temp.su(pg_temp.id(211)), 'Alumni', 'Programme terminé');
select pg_temp.owner();
select pg_temp.ok((select status = 'CONVERTED' and not conversion_review_required from public.crm_leads where id = (select conv from egc_crm))
  and not exists (select 1 from public.crm_activities a where a.lead_id = (select conv from egc_crm) and a.event_type = 'conversion_review_required'),
  'D5-A: leaving after conversion raises no review flag');
select pg_temp.act(3);
select pg_temp.ok((public.crm_start_enrollment(gen_random_uuid(), pg_temp.crm_existing((select back from egc_crm), pg_temp.id(211), 'Adults', null)))
  ->'enrollment'->>'id' is distinct from pg_temp.lead_e((select conv from egc_crm))::text,
  'D5-A: a returning learner''s lead creates a new enrollment (the ended one is not reused)');
select pg_temp.fails(format('select public.crm_start_enrollment(gen_random_uuid(), %L)', jsonb_build_object('lead_id', (select full_group from egc_crm),
  'expected_version', pg_temp.lead_v((select full_group from egc_crm)), 'student_choice', 'existing',
  'student_id', pg_temp.id(211), 'session_type', 'Adults', 'school_year', '2026/2027', 'enrollment_id',
  pg_temp.lead_e((select conv from egc_crm)), 'expected_enrollment_updated_at',
  pg_temp.eu(pg_temp.lead_e((select conv from egc_crm))))), '22023', 'crm_enrollment.enrollment_incompatible');
select pg_temp.owner();

-- ===========================================================================
-- ACA-6 / I6 / D4-A: capacity at assignment on every path; status-only changes never raise.
-- ===========================================================================
select pg_temp.act(2);
select public.place_learner_in_group(pg_temp.id(212), pg_temp.id(304), pg_temp.su(pg_temp.id(212)));
select public.place_learner_in_group(pg_temp.id(213), pg_temp.id(304), pg_temp.su(pg_temp.id(213)));
select pg_temp.fails(format('select public.place_learner_in_group(%L, %L, %L)', pg_temp.id(214), pg_temp.id(304), pg_temp.su(pg_temp.id(214))),
  '23514', 'egc.capacity');
select pg_temp.fails(format($$insert into public.enrollments(student_id, group_id, status, session_type, school_year, level)
  values (%L, %L, 'Submitted', 'Adults', '2026/2027', 'Beginning 1')$$, pg_temp.id(214), pg_temp.id(304)), '23514', 'egc.capacity');
select pg_temp.act(3);
select pg_temp.fails(format('select public.place_learner_in_group(%L, %L, %L)', pg_temp.id(214), pg_temp.id(304), pg_temp.su(pg_temp.id(214))),
  '23514', 'egc.capacity');
select pg_temp.fails(format('select public.place_learner_in_group(%L, %L, %L, p_capacity_override_reason => %L)', pg_temp.id(214), pg_temp.id(304),
  pg_temp.su(pg_temp.id(214)), 'Accord direction'), '42501', 'egc.capacity_override_forbidden');
select pg_temp.fails(format($$select public.save_receptionist_enrollment(%L, null, %L, 'Submitted', 'Beginning 1', current_date, null, 'Adults', '2026/2027')$$,
  pg_temp.id(214), pg_temp.id(304)), '23514', 'egc.capacity');
select pg_temp.fails(format('select public.assign_receptionist_student_group(%L, null, %L, %L, null)', pg_temp.id(214), pg_temp.id(304),
  pg_temp.su(pg_temp.id(214))), '23514', 'egc.capacity');
select pg_temp.fails(format('select public.crm_start_enrollment(gen_random_uuid(), %L)',
  pg_temp.crm_existing((select full_group from egc_crm), pg_temp.id(214), 'Adults', pg_temp.id(304), 'Trial')), '22023', 'crm_enrollment.record_rejected');
select pg_temp.act(1);
select public.place_learner_in_group(pg_temp.id(214), pg_temp.id(304), pg_temp.su(pg_temp.id(214)), p_capacity_override_reason => 'Accord direction');
select pg_temp.owner();
select pg_temp.ok(pg_temp.member(pg_temp.id(214), pg_temp.id(304))
  and exists (select 1 from public.activity_log a where a.changed_columns = array['capacity_override'] and a.actor_id = pg_temp.id(1)
    and a.after->>'reason' = 'Accord direction' and a.after->>'group_id' = pg_temp.id(304)::text
    and a.after::text !~ 'egc-l|06800'), 'director override with a reason, logged without contact data');
-- Status-only transitions never evaluate capacity, even over capacity.
update public.groups set capacite_max = 1 where id = pg_temp.id(304);
select pg_temp.act(2);
select public.create_charge_payment(jsonb_build_object('student_id', pg_temp.id(212), 'session_type', 'Adults', 'school_year', '2026/2027',
  'gross_amount', 1000, 'payment_amount', 100, 'payment_method', 'Espèces', 'idempotency_key', pg_temp.id(1214)));
select pg_temp.ok((pg_temp.enr(pg_temp.id(212), 'Adults')).status = 'Validated', 'a payment over capacity passes');
select public.save_enrollment_changes((pg_temp.enr(pg_temp.id(213), 'Adults')).id, (pg_temp.enr(pg_temp.id(213), 'Adults')).updated_at, '{"notes":"over capacity"}');
select pg_temp.owner();
-- Online groups stay governed by 117 only.
select pg_temp.act(1);
do $$ declare g uuid; begin
  foreach g in array array[pg_temp.id(307), pg_temp.id(308)] loop
    perform public.online_save_course(g, null, jsonb_build_object('teacher_id', pg_temp.id(101), 'audience', 'adult', 'capacity', 1,
      'term_start', (now() at time zone 'Africa/Casablanca')::date - 7, 'term_end', (now() at time zone 'Africa/Casablanca')::date + 60));
  end loop;
end $$;
select pg_temp.owner();
do $$ declare g uuid; begin
  foreach g in array array[pg_temp.id(307), pg_temp.id(308)] loop
    perform set_config('request.jwt.claim.sub', pg_temp.id(1)::text, true);
    perform public.online_activate_course(g, (select version from public.online_courses where group_id = g), 'fake', 'fake-room-' || right(g::text, 4));
  end loop;
end $$;
select pg_temp.act(2);
select public.place_learner_in_group(pg_temp.id(215), pg_temp.id(307), pg_temp.su(pg_temp.id(215)));
select pg_temp.fails(format('select public.place_learner_in_group(%L, %L, %L)', pg_temp.id(216), pg_temp.id(307), pg_temp.su(pg_temp.id(216))),
  '23514', 'online.capacity');
select pg_temp.owner();

-- ===========================================================================
-- D8 = A / I3: one live online enrollment per programme and year; closing the course ends it.
-- ===========================================================================
select pg_temp.act(2);
select pg_temp.fails(format('select public.place_learner_in_group(%L, %L, %L)', pg_temp.id(215), pg_temp.id(308), pg_temp.su(pg_temp.id(215))),
  '23514', 'egc.already_placed');
select pg_temp.fails(format('select public.create_enrollment(%L, %L)', pg_temp.id(215), '{"session_type":"Online","school_year":"2026/2027"}'),
  'PT409', 'egc.duplicate_enrollment');
select pg_temp.fails(format($$insert into public.enrollments(student_id, status, session_type, school_year) values (%L, 'Submitted', 'Online', '2026/2027')$$,
  pg_temp.id(215)), '23505');
select pg_temp.act(3);
select pg_temp.fails(format($$select public.save_receptionist_enrollment(%L, null, null, 'Submitted', 'B1', current_date, null, 'Online', '2026/2027')$$,
  pg_temp.id(215)), 'PT409', 'egc.duplicate_enrollment');
select pg_temp.act(1);
select pg_temp.ok((public.online_close_course(pg_temp.id(307), (select version from public.online_courses where group_id = pg_temp.id(307))))->>'ended' = '1',
  'closing the course ends its enrollment');
select pg_temp.owner();
select pg_temp.ok((pg_temp.enr(pg_temp.id(215), 'Online')).status = 'Ended' and (pg_temp.enr(pg_temp.id(215), 'Online')).end_reason = 'Cours en ligne clôturé'
  and (pg_temp.enr(pg_temp.id(215), 'Online')).ended_group_id = pg_temp.id(307) and pg_temp.file(pg_temp.id(215))->>'status' = 'Alumni'
  and pg_temp.file(pg_temp.id(215))->>'groupe_id' is null, 'ended with the course reason; Alumni with nothing else active');
select pg_temp.act(2);
select public.place_learner_in_group(pg_temp.id(215), pg_temp.id(308), pg_temp.su(pg_temp.id(215)));
select pg_temp.owner();
select pg_temp.ok(pg_temp.member(pg_temp.id(215), pg_temp.id(308)) and pg_temp.file(pg_temp.id(215))->>'status' = 'Enrolled',
  'the second online course of the year succeeds after the close');

-- ===========================================================================
-- ACA-5: admin enrollment commands (allow-list, stale, no regression, create needs programme/year).
-- ===========================================================================
select pg_temp.act(2);
select pg_temp.fails(format('select public.create_enrollment(%L, %L)', pg_temp.id(217), '{"session_type":"Adults"}'), '22023', 'egc.programme_required');
select pg_temp.fails(format('select public.create_enrollment(%L, %L)', pg_temp.id(217), '{"session_type":"Adults","school_year":"2026/2027","group_id":"x"}'), '22023');
select pg_temp.fails(format('select public.create_enrollment(%L, %L)', pg_temp.id(217), '{"session_type":"Adults","school_year":"2026/2027","status":"Confirmed"}'),
  '22023', 'egc.status_not_permitted');
create temp table egc_e217 as select public.create_enrollment(pg_temp.id(217), '{"session_type":"Adults","school_year":"2026/2027","notes":"EGC"}') id;
select pg_temp.open_to_api('egc_e217');
select pg_temp.fails(format('select public.save_enrollment_changes(%L, %L, %L)', (select id from egc_e217), '2000-01-01T00:00:00Z', '{"notes":"x"}'),
  'PT409', 'egc.stale');
select pg_temp.fails(format('select public.save_enrollment_changes(%L, %L, %L)', (select id from egc_e217), pg_temp.eu((select id from egc_e217)), '{"group_id":null}'), '22023');
select pg_temp.fails(format('select public.save_enrollment_changes(%L, %L, %L)', (select id from egc_e217), pg_temp.eu((select id from egc_e217)), '{"school_year":"2027/2028"}'),
  '23514', 'egc.programme_fixed');
select pg_temp.fails(format('select public.save_enrollment_changes(%L, %L, %L)', (select id from egc_e217), pg_temp.eu((select id from egc_e217)), '{"status":"Validated"}'),
  '23514', 'egc.group_required');
select public.save_enrollment_changes((select id from egc_e217), pg_temp.eu((select id from egc_e217)), '{"status":"Under Review","level":"Beginning 1"}');
select pg_temp.ok((select status = 'Under Review' and level = 'Beginning 1' from public.enrollments where id = (select id from egc_e217)), 'changed fields only');
select pg_temp.fails(format('select public.save_enrollment_changes(%L, %L, %L)', (pg_temp.enr(pg_temp.id(209), 'Adults')).id,
  (pg_temp.enr(pg_temp.id(209), 'Adults')).updated_at, '{"status":"Submitted"}'), '23514', 'egc.status_not_permitted');
select pg_temp.act(3);
select pg_temp.fails(format('select public.save_enrollment_changes(%L, %L, %L)', (select id from egc_e217), pg_temp.eu((select id from egc_e217)), '{"notes":"x"}'), '42501');
select pg_temp.fails(format('select public.create_enrollment(%L, %L)', pg_temp.id(217), '{"session_type":"Yearly","school_year":"2026/2027"}'), '42501');
select pg_temp.owner();

-- ===========================================================================
-- ACA-3 / ACA-2: the leaver sticks; I7; attendance after a leaver.
-- ===========================================================================
select pg_temp.act(3);
select pg_temp.fails(format('select public.end_learner(%L, %L, %L, %L)', pg_temp.id(205), pg_temp.su(pg_temp.id(205)), 'Alumni', 'x'), '42501');
select pg_temp.act(2);
select pg_temp.fails(format('select public.end_learner(%L, %L, %L, %L)', pg_temp.id(205), '2000-01-01T00:00:00Z', 'Alumni', 'x'), 'PT409', 'egc.stale');
select pg_temp.fails(format('select public.end_learner(%L, %L, %L, %L)', pg_temp.id(205), pg_temp.su(pg_temp.id(205)), 'Prospect', 'x'), '22023', 'egc.final_status_invalid');
select pg_temp.fails(format('select public.end_learner(%L, %L, %L, %L)', pg_temp.id(205), pg_temp.su(pg_temp.id(205)), 'Inactive', ''), '22023', 'egc.reason_required');
select pg_temp.owner();
insert into public.charges(id, student_id, session_type, service_description, gross_amount, legacy)
select pg_temp.id(1215), pg_temp.id(205), 'Legacy', 'Reçu historique EGC', 300, true;
select pg_temp.act(2);
create temp table egc_leave as select public.end_learner(pg_temp.id(205), pg_temp.su(pg_temp.id(205)), 'Inactive', 'A arrêté en cours de route') r;
select pg_temp.open_to_api('egc_leave');
select pg_temp.owner();
select pg_temp.ok((select (r->>'ended')::integer = 2 and r->>'status' = 'Inactive' and (r->>'open_balance')::numeric = 800 + 300 from egc_leave)
  and not exists (select 1 from public.enrollments where student_id = pg_temp.id(205) and status in ('Submitted','Under Review','Confirmed','Validated','Trial'))
  and pg_temp.file(pg_temp.id(205))->>'groupe_id' is null, 'end_learner ends every active enrollment and returns the open balance');
select pg_temp.ok(not (pg_temp.members(pg_temp.id(301)) @> array[pg_temp.id(205)]) and not (pg_temp.members(pg_temp.id(302)) @> array[pg_temp.id(205)]),
  'off every roster');
select pg_temp.ok((select ended_group_id from public.enrollments where student_id = pg_temp.id(205) and session_type = 'Yearly') = pg_temp.id(301),
  'the group left stays on the row');
select pg_temp.act(4);
select pg_temp.ok(not public.teacher_can_access_student_group(pg_temp.id(205), null), 'teacher access ends');
select pg_temp.owner();
-- Attendance: a correction before the end date succeeds; a new session after it is refused.
select pg_temp.act(2);
insert into public.attendance(student_id, group_id, session_date, status) values (pg_temp.id(201), pg_temp.id(301), current_date - 10, 'Présent');
select pg_temp.owner();
insert into public.enrollments(id, student_id, status, session_type, school_year, group_id, level) values
  (pg_temp.id(819), pg_temp.id(218), 'Validated', 'Yearly', '2026/2027', pg_temp.id(303), 'Child 2');
select pg_temp.act(2);
insert into public.attendance(id, student_id, group_id, session_date, status) values (pg_temp.id(820), pg_temp.id(218), pg_temp.id(303), current_date - 5, 'Présent');
select public.end_learner(pg_temp.id(218), pg_temp.su(pg_temp.id(218)), 'Alumni', 'Programme terminé');
update public.attendance set status = 'Absent' where id = pg_temp.id(820);
select pg_temp.ok((select status from public.attendance where id = pg_temp.id(820)) = 'Absent', 'past attendance of a leaver can be corrected');
select pg_temp.fails(format($$insert into public.attendance(student_id, group_id, session_date, status) values (%L, %L, current_date + 1, 'Présent')$$,
  pg_temp.id(218), pg_temp.id(303)), '23514');
-- The status sticks through an Other payment, a legacy payment, a payment on the ended enrollment and an unrelated edit.
select public.create_charge_payment(jsonb_build_object('student_id', pg_temp.id(205), 'session_type', 'Other', 'school_year', '2026/2027',
  'service_detail', 'Livre EGC', 'gross_amount', 50, 'payment_amount', 50, 'payment_method', 'Espèces', 'idempotency_key', pg_temp.id(1216)));
select public.create_charge_payment(jsonb_build_object('student_id', pg_temp.id(205), 'charge_id', pg_temp.id(1215),
  'payment_amount', 100, 'payment_method', 'Espèces', 'idempotency_key', pg_temp.id(1217)));
select pg_temp.ok((public.create_charge_payment(jsonb_build_object('student_id', pg_temp.id(205), 'charge_id',
  (select c.id from public.charges c where c.student_id = pg_temp.id(205) and c.session_type = 'Mise à niveau'),
  'payment_amount', 100, 'payment_method', 'Espèces', 'idempotency_key', pg_temp.id(1218))))->>'student_enrolled' = 'false',
  'a payment on the ended enrollment''s charge keeps it ended');
select public.save_enrollment_changes((pg_temp.enr(pg_temp.id(205), 'Yearly')).id, (pg_temp.enr(pg_temp.id(205), 'Yearly')).updated_at, '{"notes":"Parti en juin"}');
select pg_temp.fails(format('select public.save_enrollment_changes(%L, %L, %L)', (pg_temp.enr(pg_temp.id(205), 'Yearly')).id,
  (pg_temp.enr(pg_temp.id(205), 'Yearly')).updated_at, '{"level":"Child 2"}'), '23514', 'egc.ended_read_only');
select pg_temp.owner();
select pg_temp.ok(pg_temp.file(pg_temp.id(205))->>'status' = 'Inactive'
  and (select status from public.enrollments where id = (select c.enrollment_id from public.charges c where c.student_id = pg_temp.id(205)
    and c.session_type = 'Mise à niveau')) = 'Ended', 'Inactive sticks; the ended enrollment stays Ended');
-- A new confirmed enrollment makes the learner Enrolled again.
select pg_temp.act(2);
select public.create_charge_payment(jsonb_build_object('student_id', pg_temp.id(205), 'session_type', 'Yearly', 'school_year', '2027/2028',
  'gross_amount', 1000, 'payment_amount', 100, 'payment_method', 'Espèces', 'idempotency_key', pg_temp.id(1219)));
select pg_temp.owner();
select pg_temp.ok(pg_temp.file(pg_temp.id(205))->>'status' = 'Enrolled', 'a new confirmed enrollment makes the learner Enrolled');

-- ===========================================================================
-- Year close (D2-B), reopen (I3), I10 history and the Ended shape.
-- ===========================================================================
insert into public.enrollments(student_id, status, session_type, school_year) values
  (pg_temp.id(219), 'Confirmed', 'Summer Camp', '2025/2026'), (pg_temp.id(220), 'Confirmed', 'Summer Camp', '2025/2026'),
  (pg_temp.id(220), 'Confirmed', 'Adults', '2026/2027');
select pg_temp.act(2);
select pg_temp.fails(format('select public.close_school_year(%L, 2, %L)', '2025/2026', 'Fin d''année'), '42501');
select pg_temp.act(1);
select pg_temp.fails(format('select public.close_school_year(%L, 3, %L)', '2025/2026', 'Fin d''année'), 'PT409', 'egc.stale');
select pg_temp.owner();
create temp table egc_year_live as select count(*)::integer n from public.enrollments where school_year = '2025/2026'
  and status in ('Submitted','Under Review','Confirmed','Validated','Trial');
select pg_temp.open_to_api('egc_year_live');
select pg_temp.act(1);
select pg_temp.ok(public.close_school_year('2025/2026', (select n from egc_year_live), 'Fin d''année 2025/2026') = (select n from egc_year_live)
  and (select n from egc_year_live) >= 2, 'year close returns the number of enrollments it ended');
select pg_temp.owner();
select pg_temp.ok(pg_temp.file(pg_temp.id(219))->>'status' = 'Alumni' and pg_temp.file(pg_temp.id(220))->>'status' = 'Enrolled',
  'learners with nothing else become Alumni; another year keeps them Enrolled');
-- Reopen: Ended → Confirmed without group; refused while another live enrollment exists.
create temp table egc_ended as select (pg_temp.enr(pg_temp.id(219), 'Summer Camp')).id id;
select pg_temp.open_to_api('egc_ended');
select pg_temp.act(3);
select pg_temp.fails(format('select public.reopen_enrollment(%L, %L)', (select id from egc_ended), pg_temp.eu((select id from egc_ended))), '42501');
select pg_temp.act(2);
select pg_temp.fails(format('select public.reopen_enrollment(%L, %L)', (select id from egc_ended), '2000-01-01T00:00:00Z'), 'PT409', 'egc.stale');
select public.reopen_enrollment((select id from egc_ended), pg_temp.eu((select id from egc_ended)));
select pg_temp.owner();
select pg_temp.ok((select status = 'Confirmed' and group_id is null and ended_at is null and end_reason is null from public.enrollments
  where id = (select id from egc_ended)) and pg_temp.file(pg_temp.id(219))->>'status' = 'Enrolled', 'reopened as Confirmed without group');
select pg_temp.act(1);
select public.end_learner(pg_temp.id(219), pg_temp.su(pg_temp.id(219)), 'Alumni', 'Fin');
select pg_temp.owner();
insert into public.enrollments(student_id, status, session_type, school_year) values (pg_temp.id(219), 'Submitted', 'Summer Camp', '2025/2026');
select pg_temp.act(2);
select pg_temp.fails(format('select public.reopen_enrollment(%L, %L)', (select id from egc_ended), pg_temp.eu((select id from egc_ended))), 'PT409', 'egc.duplicate_enrollment');
-- I10: Ended rows are history; Trial/Confirmed/Validated rows are deleted only by the commands.
select pg_temp.fails(format('update public.enrollments set level = %L where id = %L', 'A1', (select id from egc_ended)), '42501', 'egc.history_protected');
select pg_temp.fails(format('update public.enrollments set status = %L, ended_at = null, end_reason = null, ended_by = null, ended_group_id = null where id = %L',
  'Confirmed', (select id from egc_ended)), '42501', 'egc.history_protected');
select pg_temp.fails(format('update public.enrollments set status = %L, ended_at = now() where id = %L', 'Ended', (pg_temp.enr(pg_temp.id(220), 'Adults')).id),
  '42501', 'egc.history_protected');
update public.enrollments set notes = 'EGC note' where id = (select id from egc_ended);
select pg_temp.fails(format('delete from public.enrollments where id = %L', (select id from egc_ended)), '42501', 'egc.history_protected');
select pg_temp.fails(format('delete from public.enrollments where id = %L', (pg_temp.enr(pg_temp.id(220), 'Adults')).id), '42501', 'egc.history_protected');
select pg_temp.fails(format('delete from public.enrollments where id = %L', (pg_temp.enr(pg_temp.id(201), 'Yearly')).id), '42501', 'egc.history_protected');
delete from public.enrollments where student_id = pg_temp.id(219) and status = 'Submitted';
select pg_temp.act(1);
select pg_temp.fails(format('delete from public.enrollments where id = %L', (pg_temp.enr(pg_temp.id(201), 'Mise à niveau')).id), '42501', 'egc.history_protected');
select pg_temp.owner();
select pg_temp.fails(format($$insert into public.enrollments(student_id, status, session_type, school_year) values (%L, 'Ended', 'Adults', '2026/2027')$$,
  pg_temp.id(221)), '23514');
select pg_temp.fails(format($$insert into public.enrollments(student_id, status, session_type, school_year, group_id, level) values (%L, 'Trial', 'Yearly', null, %L, 'Child 1')$$,
  pg_temp.id(221), pg_temp.id(301)), '23514');

-- ===========================================================================
-- ACA-8 / I8: archive ends enrollments; restore keeps them Ended.
-- ===========================================================================
select pg_temp.act(3);
select pg_temp.fails(format('select public.soft_delete_student(%L)', pg_temp.id(202)), '42501');
select pg_temp.act(2);
select public.soft_delete_student(pg_temp.id(202));
select pg_temp.owner();
select pg_temp.ok((pg_temp.file(pg_temp.id(202)))->>'deleted' = 'true' and pg_temp.file(pg_temp.id(202))->>'status' = 'Inactive'
  and not exists (select 1 from public.enrollments where student_id = pg_temp.id(202) and status <> 'Ended')
  and (select bool_and(end_reason = 'Dossier archivé') from public.enrollments where student_id = pg_temp.id(202))
  and not pg_temp.member(pg_temp.id(202), pg_temp.id(301)), 'archive ends active enrollments');
select pg_temp.act(2);
select pg_temp.fails(format('select public.restore_student(%L)', pg_temp.id(202)), '42501');
select pg_temp.fails('select public.list_archived_students(1, 20)', '42501');
select pg_temp.act(1);
select pg_temp.ok((select jsonb_path_exists(public.list_archived_students(1, 20), '$.rows[*] ? (@.id == $id)', jsonb_build_object('id', pg_temp.id(202)))
  and not (public.list_archived_students(1, 20)->'rows'->0 ? 'email')), 'archive list: id, name and date only');
select pg_temp.ok((public.restore_student(pg_temp.id(202)))->>'status' = 'Inactive', 'restore');
select pg_temp.fails(format('select public.restore_student(%L)', pg_temp.id(202)), 'PT409', 'egc.stale');
select pg_temp.owner();
select pg_temp.ok(pg_temp.file(pg_temp.id(202)) @> jsonb_build_object('status', 'Inactive', 'groupe_id', null, 'deleted', false)
  and not exists (select 1 from public.enrollments where student_id = pg_temp.id(202) and status <> 'Ended'),
  'restored file: enrollments stay Ended, Inactive, no group');

-- ===========================================================================
-- Caller-rights readers and wrappers, as each role.
-- ===========================================================================
do $$ declare r integer; v jsonb; begin
  foreach r in array array[1, 2, 3] loop
    perform pg_temp.act(r);
    v := public.search_students_page(p_search => 'EGC Learner', p_page_size => 20);
    perform pg_temp.ok((v->>'count')::integer > 0 and (select bool_and(x ? 'extra_group_count') from jsonb_array_elements(v->'rows') x),
      'search_students_page for role ' || r);
    perform pg_temp.ok(not exists (select 1 from public.my_member_group_ids()), 'staff have no member groups, role ' || r);
  end loop;
  foreach r in array array[4, 6, 7, 8] loop
    perform pg_temp.act(r);
    v := public.search_students_page(p_search => 'EGC Learner', p_page_size => 20);
    perform pg_temp.ok(v is not null, 'search_students_page runs for role ' || r);
  end loop;
  perform pg_temp.owner();
end $$;
select pg_temp.act(7);
select pg_temp.ok(not exists (select 1 from public.my_member_group_ids()), 'a student whose only membership ended has no member group');
select pg_temp.act(8);
select pg_temp.fails(format('select public.remove_student_group(%L, %L)', pg_temp.id(201), pg_temp.id(302)), '42501');
select pg_temp.fails(format('select public.place_learner_in_group(%L, %L, %L)', pg_temp.id(222), pg_temp.id(301), pg_temp.su(pg_temp.id(222))), '42501');
select pg_temp.act(4);
select pg_temp.fails(format('select public.remove_learner_from_group(%L, %L, %L)', pg_temp.id(201), pg_temp.id(301), pg_temp.su(pg_temp.id(201))), '42501');
select pg_temp.act(null);
select pg_temp.fails(format('select public.place_learner_in_group(%L, %L, %L)', pg_temp.id(222), pg_temp.id(301), pg_temp.su(pg_temp.id(222))), '42501');
select pg_temp.fails('select public.my_member_group_ids()', '42501');
select pg_temp.owner();
select pg_temp.ok(not has_schema_privilege('authenticated', 'academic_security', 'USAGE')
  and not has_schema_privilege('anon', 'academic_security', 'USAGE') and not has_schema_privilege('service_role', 'academic_security', 'USAGE')
  and not has_schema_privilege('authenticated', 'maintenance', 'USAGE'), 'private schemas have no API usage');
select pg_temp.ok(not exists (select 1 from information_schema.role_routine_grants g where g.routine_schema = 'academic_security'
  and g.grantee in ('PUBLIC','anon','authenticated','service_role')), 'no API grant on academic_security functions');
select pg_temp.ok(not exists (select 1 from unnest(array['place_learner_in_group','remove_learner_from_group','end_learner','close_school_year',
    'reopen_enrollment','restore_student','list_archived_students','create_enrollment','save_enrollment_changes','my_member_group_ids']) n
  join pg_proc p on p.proname = n and p.pronamespace = 'public'::regnamespace
  where has_function_privilege('service_role', p.oid, 'EXECUTE') or has_function_privilege('anon', p.oid, 'EXECUTE')
    or not has_function_privilege('authenticated', p.oid, 'EXECUTE')), 'new commands: authenticated only, no anon or service_role');
-- The compatibility wrapper removes exactly the learner's membership in that group.
select pg_temp.act(3);
select public.remove_student_group(pg_temp.id(203), pg_temp.id(302));
select pg_temp.owner();
select pg_temp.ok(not pg_temp.member(pg_temp.id(203), pg_temp.id(302)) and pg_temp.member(pg_temp.id(203), pg_temp.id(301))
  and (pg_temp.enr(pg_temp.id(203), 'Mise à niveau')).status = 'Confirmed', 'remove_student_group wrapper (074 semantics)');
-- Leaver visibility for a parent: the former group's announcement disappears.
select pg_temp.act(1);
select public.end_learner(pg_temp.id(201), pg_temp.su(pg_temp.id(201)), 'Alumni', 'Programme terminé',
  array[(pg_temp.enr(pg_temp.id(201), 'Mise à niveau')).id]);
select pg_temp.act(6);
select pg_temp.ok((select array_agg(id order by id) from public.announcements where id in (pg_temp.id(701), pg_temp.id(702)))
  = array[pg_temp.id(701)], 'after leaving the second programme the parent no longer sees its announcements');
select pg_temp.owner();
select pg_temp.ok(pg_temp.file(pg_temp.id(201))->>'status' = 'Enrolled' and pg_temp.file(pg_temp.id(201))->>'groupe_id' = pg_temp.id(301)::text,
  'ending one programme keeps the other');

-- ===========================================================================
-- Storage: the teacher of a second-programme group reserves and resolves a portfolio asset.
-- ===========================================================================
select pg_temp.act(2);
select public.place_learner_in_group(pg_temp.id(223), pg_temp.id(301), pg_temp.su(pg_temp.id(223)));
select public.place_learner_in_group(pg_temp.id(223), pg_temp.id(302), pg_temp.su(pg_temp.id(223)));
select pg_temp.act(5);
create temp table egc_asset as select public.reserve_storage_asset('portfolio', pg_temp.id(223)) a;
select pg_temp.open_to_api('egc_asset');
select pg_temp.ok(pg_temp.can_insert((select a->>'bucket' from egc_asset), (select a->>'path' from egc_asset), pg_temp.id(5)::text),
  'teacher B may upload the reserved portfolio object');
select pg_temp.owner();
insert into storage.objects(bucket_id, name, owner_id, version) select a->>'bucket', a->>'path', pg_temp.id(5)::text, 'v1' from egc_asset;
update public.storage_assets set state = 'active', object_version = 'v1', verified_size = 10, verified_type = 'image/png'
 where id = (select (a->>'id')::uuid from egc_asset);
insert into public.portfolios(id, student_id, project_type, title, file_url) values (pg_temp.id(830), pg_temp.id(223), 'Other', 'EGC', null);
insert into public.storage_asset_bindings(asset_id, portfolio_id, bound_by) select (a->>'id')::uuid, pg_temp.id(830), pg_temp.id(5) from egc_asset;
select pg_temp.act(5);
select pg_temp.ok((public.resolve_storage_asset((select (a->>'id')::uuid from egc_asset)))->>'path' = (select a->>'path' from egc_asset),
  'teacher B resolves the portfolio of a second-programme learner');
select pg_temp.act(1);
select public.end_learner(pg_temp.id(223), pg_temp.su(pg_temp.id(223)), 'Alumni', 'Fin', array[(pg_temp.enr(pg_temp.id(223), 'Mise à niveau')).id]);
select pg_temp.act(5);
select pg_temp.fails(format('select public.resolve_storage_asset(%L)', (select (a->>'id')::uuid from egc_asset)), '42501');
select pg_temp.fails(format('select public.reserve_storage_asset(%L, %L)', 'portfolio', pg_temp.id(223)), '42501');
select pg_temp.ok(not pg_temp.can_write(pg_temp.id(5), 'portfolio', pg_temp.id(223)), 'after leaving, teacher B may not write');
select pg_temp.act(4);
select pg_temp.ok(pg_temp.can_write(pg_temp.id(4), 'portfolio', pg_temp.id(223)), 'the Yearly teacher still may');
select pg_temp.owner();

-- ===========================================================================
-- Nested write: an enrollment write from inside another trigger still resyncs.
-- ===========================================================================
create table pg_temp.egc_nest(enrollment uuid, grp uuid);
create function pg_temp.egc_nest_move() returns trigger language plpgsql as $$ begin
  update public.enrollments set group_id = new.grp, level = 'Child 2' where id = new.enrollment; return new;
end $$;
create trigger egc_nest_move after insert on pg_temp.egc_nest for each row execute function pg_temp.egc_nest_move();
insert into pg_temp.egc_nest values ((pg_temp.enr(pg_temp.id(224), 'Yearly')).id, pg_temp.id(303));
select pg_temp.seat(pg_temp.id(224), pg_temp.id(301));
insert into pg_temp.egc_nest values ((pg_temp.enr(pg_temp.id(224), 'Yearly')).id, pg_temp.id(303));
select pg_temp.ok(pg_temp.file(pg_temp.id(224))->>'groupe_id' = pg_temp.id(303)::text and pg_temp.file(pg_temp.id(224))->>'niveau_cefr' = 'Child 2',
  'a nested enrollment write recomputes the main group (no depth guard)');

-- ===========================================================================
-- ADR-009: every new refusal is PT409 with an egc hint; nothing raises the retryable code.
-- ===========================================================================
select pg_temp.act(2);
select pg_temp.fails(format('select public.place_learner_in_group(%L, %L, %L)', pg_temp.id(225), pg_temp.id(301), '2000-01-01T00:00:00Z'), 'PT409', 'egc.stale');
select pg_temp.fails(format('select public.remove_learner_from_group(%L, %L, %L)', pg_temp.id(223), pg_temp.id(301), '2000-01-01T00:00:00Z'), 'PT409', 'egc.stale');
select pg_temp.fails(format('select public.place_learner_in_group(%L, %L, %L, %L, null, %L)', pg_temp.id(223), pg_temp.id(301), pg_temp.su(pg_temp.id(223)),
  (pg_temp.enr(pg_temp.id(223), 'Yearly')).id, '2000-01-01T00:00:00Z'), 'PT409', 'egc.stale');
select pg_temp.act(3);
select pg_temp.fails(format('select public.assign_receptionist_student_group(%L, null, %L, %L, null)', pg_temp.id(225), pg_temp.id(301), '2000-01-01T00:00:00Z'), 'PT409');
select pg_temp.owner();
select pg_temp.ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where (n.nspname in ('academic_security') or p.proname in ('place_learner_in_group','remove_learner_from_group','end_learner','close_school_year',
    'reopen_enrollment','restore_student','list_archived_students','create_enrollment','save_enrollment_changes','my_member_group_ids',
    'create_charge_payment','assign_receptionist_student_group','save_receptionist_student','save_receptionist_enrollment','soft_delete_student',
    'remove_student_group','crm_start_enrollment','online_close_course','sync_student_from_enrollments','attendance_student_in_group',
    'teacher_can_access_student_group','can_message_recipient','resolve_storage_asset','search_students_page','enforce_attendance_integrity',
    'evaluate_conversion','can_write'))
  and (p.prosrc ~ '''40001''' or p.prosrc ~* '\mserialization_failure\M')), 'no EGC function raises or catches the retryable code');
select pg_temp.ok((select count(*) from pg_constraint where conname in ('enrollments_active_requires_group','enrollments_ended_shape',
  'enrollments_confirmed_has_programme') and convalidated) = 3, 'M2 validated I1 and I9');

rollback;
\echo PASS enrollment and group consistency: clean-up cores, M2 refusal, DAT-1, ACA-1..9, DAT-2, FIN-10, I1..I10, D5-A, D8 = A, readers, storage
