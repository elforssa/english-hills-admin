-- Receptionist permissions, stage 2 (migration 132, plan RPW-r2, table A items 9-13, C2-1):
-- synthetic local fixtures, fully rolled back. The receptionist uses the management
-- enrollment commands: a move to a group of another level, the level, date and notes of a
-- paid unplaced enrollment, a full group with a reason, a placement without a paid enrollment
-- with a reason (both logged); a teacher stays refused; a capacity change is logged for
-- every role; director and admin keep their answers.
\set ON_ERROR_STOP on
begin;
alter table public.receipts disable trigger on_receipt_created;

create function pg_temp.ok(v boolean, label text) returns void language plpgsql as $$ begin
  if v is not true then raise exception 'FAIL: %', label; end if;
end $$;
create function pg_temp.id(i integer) returns uuid language sql immutable as $$
  select ('7b700000-0000-4000-8000-' || lpad(to_hex(i), 12, '0'))::uuid $$;
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
create function pg_temp.upd(s uuid) returns timestamptz language sql security definer as $$
  select updated_at from public.students where id = s $$;
create function pg_temp.eupd(e uuid) returns timestamptz language sql security definer as $$
  select updated_at from public.enrollments where id = e $$;
create function pg_temp.enr(s uuid) returns public.enrollments language sql security definer as $$
  select * from public.enrollments where student_id = s and status not in ('Rejected','Ended') order by created_at desc limit 1 $$;
create function pg_temp.logs(k text, s uuid) returns bigint language sql security definer as $$
  select count(*) from public.activity_log where after->>'kind' = k and after->>'student_id' = s::text $$;

-- ── Fixture ───────────────────────────────────────────────────────────────
insert into auth.users(id, email, aud, role, email_confirmed_at, created_at, updated_at)
select pg_temp.id(i), 'rpw-g-' || i || '@example.test', 'authenticated', 'authenticated', now(), now(), now()
from generate_series(1, 4) i;
update public.profiles p set role = r.role
from (values (1, 'director'), (2, 'admin'), (3, 'receptionist'), (4, 'teacher')) r(i, role)
where p.id = pg_temp.id(r.i);
insert into public.groups(id, name, session_type, niveau, annee, capacite_max) values
  (pg_temp.id(100), 'RPW G Yearly C2', 'Yearly', 'Child 2', '2026-2027', 10),
  (pg_temp.id(101), 'RPW G Yearly C3', 'Yearly', 'Child 3', '2026-2027', 10),
  (pg_temp.id(102), 'RPW G Yearly C2 full', 'Yearly', 'Child 2', '2026-2027', 1);
insert into public.students(id, full_name, status, session_type) values
  (pg_temp.id(200), 'RPW G move', 'Prospect', 'Yearly'),
  (pg_temp.id(201), 'RPW G level', 'Prospect', 'Yearly'),
  (pg_temp.id(202), 'RPW G full', 'Prospect', 'Yearly'),
  (pg_temp.id(203), 'RPW G unpaid', 'Prospect', 'Yearly'),
  (pg_temp.id(204), 'RPW G occupant', 'Prospect', 'Yearly'),
  (pg_temp.id(205), 'RPW G teacher', 'Prospect', 'Yearly');
-- Paid enrollments (payment at the desk, as the director).
select pg_temp.act(1);
select public.create_charge_payment(jsonb_build_object('student_id', pg_temp.id(i), 'session_type', 'Yearly',
  'school_year', '2026/2027', 'gross_amount', 1000, 'payment_amount', 100, 'payment_method', 'Espèces',
  'idempotency_key', pg_temp.id(1000 + i)))
from unnest(array[200, 201, 202, 204, 205]) i;
select pg_temp.owner();
select pg_temp.ok((select count(*) = 5 from public.enrollments where student_id in (pg_temp.id(200), pg_temp.id(201), pg_temp.id(202),
  pg_temp.id(204), pg_temp.id(205)) and status = 'Confirmed' and group_id is null), 'fixture: five paid unplaced enrollments');
-- The occupant fills the one-seat group; the mover starts in Child 2.
select pg_temp.act(1);
select public.place_learner_in_group(pg_temp.id(204), pg_temp.id(102), pg_temp.upd(pg_temp.id(204)),
  (pg_temp.enr(pg_temp.id(204))).id, null, (pg_temp.enr(pg_temp.id(204))).updated_at);
select public.place_learner_in_group(pg_temp.id(200), pg_temp.id(100), pg_temp.upd(pg_temp.id(200)),
  (pg_temp.enr(pg_temp.id(200))).id, null, (pg_temp.enr(pg_temp.id(200))).updated_at);

-- ── The capability list ───────────────────────────────────────────────────
select pg_temp.owner();
select pg_temp.ok((select bool_and(operational_security.role_has_capability(r, c) = (r in ('director','admin','receptionist')))
  from unnest(array['director','admin','receptionist','teacher','parent','student','pending']) r,
       unnest(array['edit_enrollment','override_capacity','place_without_paid_enrollment']) c), 'stage 2 capabilities are ops');

-- ── Item 9: a move to a group of another level takes the new group's level ──
select pg_temp.act(3);
select public.place_learner_in_group(pg_temp.id(200), pg_temp.id(101), pg_temp.upd(pg_temp.id(200)),
  (pg_temp.enr(pg_temp.id(200))).id, null, (pg_temp.enr(pg_temp.id(200))).updated_at);
select pg_temp.owner();
select pg_temp.ok((select group_id = pg_temp.id(101) and level = 'Child 3' and status = 'Validated'
  from public.enrollments where id = (pg_temp.enr(pg_temp.id(200))).id), 'item 9: cross-level move by reception');
select pg_temp.ok((select groupe_id = pg_temp.id(101) from public.students where id = pg_temp.id(200)), 'item 9: the file follows');

-- ── Items 10 and 13: level, date and notes of a paid unplaced enrollment ──
select pg_temp.act(3);
select public.save_enrollment_changes((pg_temp.enr(pg_temp.id(201))).id, (pg_temp.enr(pg_temp.id(201))).updated_at,
  '{"level":"Child 2","date_inscription":"2026-09-15","notes":"RPW note"}');
select pg_temp.owner();
select pg_temp.ok((select level = 'Child 2' and date_inscription = '2026-09-15' and notes = 'RPW note' and group_id is null
  from public.enrollments where id = (pg_temp.enr(pg_temp.id(201))).id), 'items 10, 13: reception edits level, date and notes');
-- The refusals that stay for everyone stay for her.
select pg_temp.act(3);
select pg_temp.refused(format($q$select public.save_enrollment_changes(%L, %L, '{"status":"Trial"}')$q$,
  (pg_temp.enr(pg_temp.id(201))).id, (pg_temp.enr(pg_temp.id(201))).updated_at), '23514', 'egc.status_not_permitted', 'status change refused');
select pg_temp.refused(format($q$select public.save_enrollment_changes(%L, %L, '{"school_year":"2027/2028"}')$q$,
  (pg_temp.enr(pg_temp.id(201))).id, (pg_temp.enr(pg_temp.id(201))).updated_at), '23514', 'egc.programme_fixed', 'programme fixed');
select pg_temp.refused(format($q$select public.save_enrollment_changes(%L, %L, '{"notes":"stale"}')$q$,
  (pg_temp.enr(pg_temp.id(201))).id, '2000-01-01T00:00:00Z'), 'PT409', null, 'stale version');
select pg_temp.refused(format($q$select public.save_enrollment_changes(%L, %L, '{"group_id":null}')$q$,
  (pg_temp.enr(pg_temp.id(201))).id, (pg_temp.enr(pg_temp.id(201))).updated_at), '22023', null, 'unknown key');

-- ── Item 11: a full group with a reason, logged ───────────────────────────
select pg_temp.refused(format('select public.place_learner_in_group(%L, %L, %L, %L, null, %L)', pg_temp.id(202), pg_temp.id(102),
  pg_temp.upd(pg_temp.id(202)), (pg_temp.enr(pg_temp.id(202))).id, (pg_temp.enr(pg_temp.id(202))).updated_at),
  '23514', 'egc.capacity', 'full group without a reason');
select pg_temp.refused(format('select public.place_learner_in_group(%L, %L, %L, %L, null, %L, %L)', pg_temp.id(202), pg_temp.id(102),
  pg_temp.upd(pg_temp.id(202)), (pg_temp.enr(pg_temp.id(202))).id, (pg_temp.enr(pg_temp.id(202))).updated_at, repeat('x', 201)),
  '42501', 'egc.capacity_override_forbidden', 'reason over 200 characters');
select public.place_learner_in_group(pg_temp.id(202), pg_temp.id(102), pg_temp.upd(pg_temp.id(202)),
  (pg_temp.enr(pg_temp.id(202))).id, null, (pg_temp.enr(pg_temp.id(202))).updated_at, 'Accord famille');
select pg_temp.owner();
select pg_temp.ok((select group_id = pg_temp.id(102) from public.enrollments where id = (pg_temp.enr(pg_temp.id(202))).id),
  'item 11: placed over capacity');
select pg_temp.ok(pg_temp.logs('capacity_override', pg_temp.id(202)) = 1, 'item 11: override logged');
select pg_temp.ok((select actor_id = pg_temp.id(3) and after->>'reason' = 'Accord famille' from public.activity_log
  where after->>'kind' = 'capacity_override' and after->>'student_id' = pg_temp.id(202)::text), 'item 11: who and why');

-- ── Item 12: no paid enrollment, with a reason, logged ────────────────────
select pg_temp.act(3);
select pg_temp.refused(format('select public.place_learner_in_group(p_student => %L, p_group => %L, p_student_updated_at => %L)',
  pg_temp.id(203), pg_temp.id(100), pg_temp.upd(pg_temp.id(203))), '23514', 'eap.placement_reason_required', 'unpaid without a reason');
select public.place_learner_in_group(p_student => pg_temp.id(203), p_group => pg_temp.id(100),
  p_student_updated_at => pg_temp.upd(pg_temp.id(203)), p_without_enrollment_reason => 'Paiement promis lundi');
select pg_temp.owner();
select pg_temp.ok((select status = 'Validated' and group_id = pg_temp.id(100) from public.enrollments where student_id = pg_temp.id(203)),
  'item 12: placed without a paid enrollment');
select pg_temp.ok((select actor_id = pg_temp.id(3) and after->>'reason' = 'Paiement promis lundi' and after->>'author_role' = 'receptionist'
  from public.activity_log where after->>'kind' = 'placement_without_enrollment' and after->>'student_id' = pg_temp.id(203)::text),
  'item 12: logged with her role');
-- The retired reception command passes no reason: it refuses, now asking for one.
insert into public.students(id, full_name, status, session_type) values (pg_temp.id(206), 'RPW G retired', 'Prospect', 'Yearly');
select pg_temp.act(3);
select pg_temp.refused(format('select public.assign_receptionist_student_group(%L, null, %L, %L, null)', pg_temp.id(206), pg_temp.id(100),
  pg_temp.upd(pg_temp.id(206))), '23514', 'eap.placement_reason_required', 'retired command without a paid enrollment');

-- ── Teacher: still refused ────────────────────────────────────────────────
select pg_temp.act(4);
select pg_temp.refused(format($q$select public.save_enrollment_changes(%L, %L, '{"notes":"x"}')$q$,
  (pg_temp.enr(pg_temp.id(205))).id, (pg_temp.enr(pg_temp.id(205))).updated_at), '42501', null, 'teacher edits an enrollment');
select pg_temp.refused(format('select public.place_learner_in_group(%L, %L, %L, %L, null, %L, %L)', pg_temp.id(205), pg_temp.id(102),
  pg_temp.upd(pg_temp.id(205)), (pg_temp.enr(pg_temp.id(205))).id, (pg_temp.enr(pg_temp.id(205))).updated_at, 'x'),
  '42501', null, 'teacher places');

-- ── Director and admin keep their answers ─────────────────────────────────
select pg_temp.act(2);
select public.save_enrollment_changes((pg_temp.enr(pg_temp.id(205))).id, (pg_temp.enr(pg_temp.id(205))).updated_at, '{"notes":"admin note"}');
select pg_temp.refused(format('select public.place_learner_in_group(%L, %L, %L, %L, null, %L)', pg_temp.id(205), pg_temp.id(102),
  pg_temp.upd(pg_temp.id(205)), (pg_temp.enr(pg_temp.id(205))).id, (pg_temp.enr(pg_temp.id(205))).updated_at),
  '23514', 'egc.capacity', 'admin: full group without a reason');

-- ── C2-1: every capacity change is logged, a no-change update is not ─────
select pg_temp.act(3);
select public.save_receptionist_group(pg_temp.id(100), (select updated_at from public.groups where id = pg_temp.id(100)), '{"capacite_max":12}');
select pg_temp.act(1);
update public.groups set capacite_max = 14 where id = pg_temp.id(100);
update public.groups set capacite_max = 14, salle = 'RPW 2' where id = pg_temp.id(100);
select pg_temp.owner();
select pg_temp.ok((select count(*) = 2 from public.activity_log where target_table = 'groups' and target_id = pg_temp.id(100)
  and after->>'kind' = 'group_capacity'), 'C2-1: two capacity changes, two rows');
select pg_temp.ok((select actor_id = pg_temp.id(3) and before->>'capacite_max' = '10' and after->>'capacite_max' = '12'
  and after->>'author_role' = 'receptionist' from public.activity_log where target_table = 'groups' and target_id = pg_temp.id(100)
  and after->>'kind' = 'group_capacity' and after->>'capacite_max' = '12'), 'C2-1: reception 10 -> 12');
select pg_temp.ok((select actor_id = pg_temp.id(1) and before->>'capacite_max' = '12' from public.activity_log
  where target_table = 'groups' and target_id = pg_temp.id(100) and after->>'capacite_max' = '14'), 'C2-1: director 12 -> 14');
-- The log trigger is not callable through the API.
select pg_temp.ok(not has_function_privilege('authenticated', 'academic_security.log_group_capacity()', 'execute')
  and not has_function_privilege('anon', 'academic_security.log_group_capacity()', 'execute'), 'C2-1: no API grant');

rollback;
\echo PASS receptionist groups (stage 2)
