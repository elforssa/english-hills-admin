-- Batch H (plan AFU-r1): the group school year and the placement year check (H5) on
-- every path and for every role, the centre clock (H7) and the reception discount
-- (H1, also in test-finance-batch-e.sql). Local Supabase only; synthetic fixtures;
-- everything rolls back.
\set ON_ERROR_STOP on
begin;

create function pg_temp.ok(value boolean, label text) returns void language plpgsql as $$ begin
  if value is not true then raise exception 'FAIL: %', label; end if;
end $$;
create function pg_temp.id(i integer) returns uuid language sql immutable as $$
  select ('af500000-0000-4000-8000-' || lpad(to_hex(i), 12, '0'))::uuid
$$;
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
create function pg_temp.enr(p uuid) returns public.enrollments language sql security definer as $$
  select * from public.enrollments where id = p $$;
create function pg_temp.su(p uuid) returns timestamptz language sql security definer as $$
  select updated_at from public.students where id = p $$;
create function pg_temp.eu(p uuid) returns timestamptz language sql security definer as $$
  select updated_at from public.enrollments where id = p $$;

-- Users: 1 director, 2 admin, 3 receptionist.
insert into auth.users(id, email, aud, role, email_confirmed_at, created_at, updated_at)
select pg_temp.id(i), 'afu-user-' || i || '@example.test', 'authenticated', 'authenticated', now(), now(), now()
from generate_series(1, 3) i;
update public.profiles set role = (array['director','admin','receptionist'])[right(id::text, 1)::integer]
  where id in (pg_temp.id(1), pg_temp.id(2), pg_temp.id(3));

-- ===========================================================================
-- H7: the centre clock
-- ===========================================================================
select pg_temp.ok(public.centre_utc_offset() = interval '0', 'UTC+0');
select pg_temp.ok(public.business_date(timestamptz '2026-10-29 23:30:00+00') = date '2026-10-29', '23:30 UTC is still today');
select pg_temp.ok(public.business_date(timestamptz '2026-10-30 00:00:00+00') = date '2026-10-30', 'midnight UTC is tomorrow');
select pg_temp.ok(public.centre_school_year(date '2026-08-31') = '2025/2026' and public.centre_school_year(date '2026-09-01') = '2026/2027'
  and public.centre_school_year(date '2027-07-10') = '2026/2027', 'school year: 1 September to 31 August');
select pg_temp.ok(public.centre_school_year() = public.centre_school_year(public.business_date()), 'default: today');
select pg_temp.ok(crm_security.scheduled_civil(timestamptz '2026-10-29 10:00:00+00')
  = jsonb_build_object('local_date', date '2026-10-29', 'local_time', time '10:00'), 'a 10:00Z task reads 10:00');
select pg_temp.ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname not in ('pg_catalog','information_schema') and n.nspname || '.' || p.proname <> 'academic_security.egc_cleanup_c1'
    and (p.prosrc ~* 'at time zone\s+''Africa/Casablanca''' or p.prosrc ~* 'at time zone\s+p\.timezone'
      or p.prosrc ~* 'timezone\(''Africa/Casablanca''')), 'no time computation reads the zone name');
-- Who may call the clock: the callers of business_date, nobody else.
select pg_temp.ok(has_function_privilege('authenticated', 'public.centre_utc_offset()', 'execute')
  and has_function_privilege('anon', 'public.centre_school_year(date)', 'execute'), 'clock callable like business_date');
select pg_temp.ok(not has_function_privilege('authenticated', 'academic_security.check_group_year(text,text,text)', 'execute')
  and not has_function_privilege('service_role', 'academic_security.guard_group_year()', 'execute')
  and not has_function_privilege('anon', 'academic_security.guard_enrollment_group_year()', 'execute'), 'the guards have no API grant');

-- ===========================================================================
-- H5: the group year
-- ===========================================================================
insert into public.groups(id, name, session_type, niveau) values (pg_temp.id(301), 'AFU default year', 'Yearly', 'Child 1');
select pg_temp.ok((select annee from public.groups where id = pg_temp.id(301)) = replace(public.centre_school_year(), '/', '-'),
  'D-H5a: a new group without a year takes the current school year');
insert into public.groups(id, name, session_type, niveau, annee) values
  (pg_temp.id(302), 'AFU 2026 slash', 'Yearly', 'Child 1', '2026/2027'),
  (pg_temp.id(303), 'AFU 2027', 'Yearly', 'Child 1', '2027-2028'),
  (pg_temp.id(304), 'AFU Adults 2026', 'Adults', 'Beginning 1', '2026-2027'),
  (pg_temp.id(305), 'AFU explicit null', 'Yearly', 'Child 2', null);
select pg_temp.ok((select annee from public.groups where id = pg_temp.id(305)) = replace(public.centre_school_year(), '/', '-'),
  'an explicit NULL also takes the current school year');
select pg_temp.fails($$insert into public.groups(name, session_type, niveau, annee) values ('Bad', 'Yearly', 'Child 1', '2026')$$,
  '22023', 'egc.group_year_invalid');
select pg_temp.fails($$insert into public.groups(name, session_type, niveau, annee) values ('Bad', 'Yearly', 'Child 1', '2026-2028')$$,
  '22023', 'egc.group_year_invalid');
select pg_temp.fails(format($$update public.groups set annee = '26-27' where id = %L$$, pg_temp.id(302)), '22023', 'egc.group_year_invalid');
-- A legacy group without a year (none in Production on 2026-10-29) refuses placement.
alter table public.groups disable trigger groups_year_guard;
insert into public.groups(id, name, session_type, niveau, annee) values (pg_temp.id(306), 'AFU legacy no year', 'Yearly', 'Child 1', null);
alter table public.groups enable trigger groups_year_guard;

insert into public.students(id, full_name, status, session_type, niveau_cefr)
select pg_temp.id(i), 'AFU learner ' || i, 'Prospect', 'Yearly', 'Child 1' from generate_series(201, 212) i;
insert into public.enrollments(id, student_id, status, session_type, school_year, level) values
  (pg_temp.id(401), pg_temp.id(201), 'Confirmed', 'Yearly', '2026/2027', 'Child 1'),
  (pg_temp.id(402), pg_temp.id(202), 'Confirmed', 'Yearly', '2025/2026', 'Child 1'),
  (pg_temp.id(403), pg_temp.id(203), 'Confirmed', 'Yearly', '2027/2028', 'Child 1'),
  (pg_temp.id(404), pg_temp.id(204), 'Confirmed', 'Yearly', '2026/2027', 'Child 1');

-- Direct writes, every role that can write (here the owner): 2026/2027 = 2026-2027 = 2026/2027 (slash group).
insert into public.enrollments(id, student_id, group_id, status, session_type, school_year, level) values
  (pg_temp.id(410), pg_temp.id(205), pg_temp.id(302), 'Validated', 'Yearly', '2026/2027', 'Child 1');
select pg_temp.fails(format($$insert into public.enrollments(student_id, group_id, status, session_type, school_year, level)
  values (%L, %L, 'Validated', 'Yearly', '2025/2026', 'Child 1')$$, pg_temp.id(206), pg_temp.id(302)), '23514', 'egc.school_year_mismatch');
select pg_temp.fails(format($$insert into public.enrollments(student_id, group_id, status, session_type, school_year, level)
  values (%L, %L, 'Validated', 'Yearly', '2026/2027', 'Child 1')$$, pg_temp.id(206), pg_temp.id(306)), '23514', 'egc.group_year_missing');
-- A placement without a year takes its group's.
insert into public.enrollments(id, student_id, group_id, status, session_type, school_year, level) values
  (pg_temp.id(411), pg_temp.id(207), pg_temp.id(303), 'Trial', 'Yearly', null, 'Child 1');
select pg_temp.ok((pg_temp.enr(pg_temp.id(411))).school_year = '2027/2028', 'the year comes from the group');
-- Changing an enrollment's year away from its group's is refused; a status change is not checked.
select pg_temp.fails(format($$update public.enrollments set school_year = '2027/2028' where id = %L$$, pg_temp.id(410)),
  '23514', 'egc.school_year_mismatch');

-- The message names both years.
do $$ declare msg text; begin
  begin
    insert into public.enrollments(student_id, group_id, status, session_type, school_year, level)
      values (pg_temp.id(206), pg_temp.id(302), 'Validated', 'Yearly', '2025/2026', 'Child 1');
  exception when check_violation then get stacked diagnostics msg = message_text;
  end;
  perform pg_temp.ok(msg = 'L’année scolaire de l’inscription (2025/2026) ne correspond pas à celle du groupe (2026/2027).', msg);
end $$;

-- D-H5b: the group year is locked while a live learner of another year is in it.
select pg_temp.fails(format($$update public.groups set annee = '2027-2028' where id = %L$$, pg_temp.id(302)), '23514', 'egc.group_year_locked');
select pg_temp.fails(format($$update public.groups set annee = null where id = %L$$, pg_temp.id(302)), '23514', 'egc.group_year_locked');
update public.groups set annee = '2026-2027' where id = pg_temp.id(302);
select pg_temp.ok((select annee from public.groups where id = pg_temp.id(302)) = '2026-2027', 'the same year in the other form is accepted');
update public.groups set annee = '2028-2029' where id = pg_temp.id(304);
select pg_temp.ok((select annee from public.groups where id = pg_temp.id(304)) = '2028-2029', 'an empty group changes year');
update public.groups set annee = '2026-2027' where id = pg_temp.id(304);

-- place_learner_in_group (director, admin) and assign_receptionist_student_group (reception).
select pg_temp.act(1);
select pg_temp.fails(format($$select public.place_learner_in_group(%L, %L, %L, %L, null, %L, null)$$, pg_temp.id(202), pg_temp.id(301),
  pg_temp.su(pg_temp.id(202)), pg_temp.id(402), pg_temp.eu(pg_temp.id(402))), '23514', 'egc.school_year_mismatch');
select public.place_learner_in_group(pg_temp.id(201), pg_temp.id(301), pg_temp.su(pg_temp.id(201)), pg_temp.id(401), null,
  pg_temp.eu(pg_temp.id(401)), null);
select pg_temp.ok((pg_temp.enr(pg_temp.id(401))).group_id = pg_temp.id(301), 'director places the same year');
select pg_temp.act(2);
select pg_temp.fails(format($$select public.place_learner_in_group(%L, %L, %L, %L, null, %L, null)$$, pg_temp.id(203), pg_temp.id(301),
  pg_temp.su(pg_temp.id(203)), pg_temp.id(403), pg_temp.eu(pg_temp.id(403))), '23514', 'egc.school_year_mismatch');
select public.place_learner_in_group(pg_temp.id(203), pg_temp.id(303), pg_temp.su(pg_temp.id(203)), pg_temp.id(403), null,
  pg_temp.eu(pg_temp.id(403)), null);
select pg_temp.ok((pg_temp.enr(pg_temp.id(403))).group_id = pg_temp.id(303), 'admin places 2027/2028 in the 2027-2028 group');
select pg_temp.act(3);
select pg_temp.fails(format($$select public.assign_receptionist_student_group(%L, %L, %L, %L, %L)$$, pg_temp.id(202), pg_temp.id(402),
  pg_temp.id(301), pg_temp.su(pg_temp.id(202)), pg_temp.eu(pg_temp.id(402))), '23514', 'egc.school_year_mismatch');
select public.assign_receptionist_student_group(pg_temp.id(204), pg_temp.id(404), pg_temp.id(301), pg_temp.su(pg_temp.id(204)),
  pg_temp.eu(pg_temp.id(404)));
select pg_temp.ok((pg_temp.enr(pg_temp.id(404))).group_id = pg_temp.id(301), 'reception places the same year');
-- save_receptionist_enrollment: a trial without a year takes the group's; another year is refused.
select pg_temp.fails(format($$select public.save_receptionist_enrollment(%L, null, %L, 'Trial', 'Child 1', current_date, null, 'Yearly', '2025/2026')$$,
  pg_temp.id(208), pg_temp.id(301)), '23514', 'egc.school_year_mismatch');
create temp table afu_trial as select public.save_receptionist_enrollment(pg_temp.id(209), null, pg_temp.id(303), 'Trial', 'Child 1',
  current_date, null, 'Yearly', null) id;
select pg_temp.owner();
select pg_temp.ok((pg_temp.enr((select id from afu_trial))).school_year = '2027/2028', 'reception trial takes the group year');
select pg_temp.act(3);
select pg_temp.fails(format($$select public.save_receptionist_enrollment(%L, null, %L, 'Trial', 'Child 1', current_date, null, 'Yearly', null)$$,
  pg_temp.id(210), pg_temp.id(306)), '23514', 'egc.group_year_missing');
select pg_temp.owner();

-- crm_start_enrollment refuses another year with 22023 (its handler maps 23514 to a
-- generic refusal); the check sits right after the group is read.
select pg_temp.ok(pg_get_functiondef('public.crm_start_enrollment(uuid,jsonb)'::regprocedure)
  ~ 'level:=g\.niveau;\s+-- Batch H \(H5\)[^\n]*\n[^\n]*\n\s+perform academic_security\.check_group_year\(g\.annee, year, ''22023''\);', 'CRM path checks the year');
select pg_temp.fails($$select academic_security.check_group_year('2026-2027', '2025/2026', '22023')$$, '22023', 'egc.school_year_mismatch');
select pg_temp.fails($$select academic_security.check_group_year(null, '2025/2026', '22023')$$, '22023', 'egc.group_year_missing');
select academic_security.check_group_year('2026-2027', '2026/2027');
select academic_security.check_group_year(' 2026/2027 ', '2026/2027');
-- The CRM group picker returns each group's year.
select pg_temp.ok(pg_get_functiondef('public.crm_enrollment_groups'::regproc) ~ 'select id,name,niveau,session_type,annee from public\.groups',
  'crm_enrollment_groups returns the year');

-- Status changes, ends and the year close are not year checks.
alter table public.enrollments disable trigger enrollment_group_year_guard;
insert into public.enrollments(id, student_id, group_id, status, session_type, school_year, level) values
  (pg_temp.id(420), pg_temp.id(211), pg_temp.id(304), 'Validated', 'Adults', '2025/2026', 'Beginning 1');
alter table public.enrollments enable trigger enrollment_group_year_guard;
update public.enrollments set notes = 'legacy mismatch kept' where id = pg_temp.id(420);
select pg_temp.ok((pg_temp.enr(pg_temp.id(420))).notes = 'legacy mismatch kept', 'an unrelated update of a legacy mismatch is not refused');
select pg_temp.act(1);
select public.end_learner(pg_temp.id(211), pg_temp.su(pg_temp.id(211)), 'Alumni', 'Fin de parcours', array[pg_temp.id(420)]);
select pg_temp.owner();
select pg_temp.ok((pg_temp.enr(pg_temp.id(420))).status = 'Ended', 'a legacy mismatch can still end');

rollback;
\echo 'PASS Batch H: centre clock, group year and placement year check on every path'
