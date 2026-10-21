-- Online learning pilot (migration 117, plan OL-r4): synthetic local fixtures, fully
-- rolled back. Covers the vocabulary, the three triggers, course/pattern/lesson
-- commands, capacity on every assignment path, consent, the join matrix (role x
-- window x status), passes and revocation, the teacher boundary, the staff role
-- matrix, the receptionist (096) and CRM (112) paths and anonymous denial.
\set ON_ERROR_STOP on
begin;
alter table public.receipts disable trigger on_receipt_created;

create function pg_temp.ok(value boolean, label text) returns void language plpgsql as $$ begin
  if value is not true then raise exception 'FAIL: %', label; end if;
end $$;
create function pg_temp.id(i integer) returns uuid language sql immutable as $$
  select ('11700000-0000-4000-8000-' || lpad(to_hex(i), 12, '0'))::uuid
$$;
-- Act as a stored-role user (or anonymous) through the API role, as PostgREST does.
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
create function pg_temp.rpc(statement text) returns jsonb language plpgsql as $$
declare r jsonb; begin execute 'select (' || statement || ')::jsonb' into r; return r; end $$;
-- Fixture readers run as the owner whatever the acting role.
create function pg_temp.lesson_version(p uuid) returns bigint language sql security definer as $$
  select version from public.online_lessons where id = p $$;
create function pg_temp.course_version(p uuid) returns bigint language sql security definer as $$
  select version from public.online_courses where group_id = p $$;
create function pg_temp.open_to_api(t text) returns void language plpgsql as $$ begin
  execute format('grant select on %s to public', t);
end $$;

-- Users: 1 director, 2 admin, 3 receptionist, 4 teacher A, 5 teacher B (substitute),
-- 6 mixed teacher, 7 parent of two children, 8 adult student, 9 pending,
-- 10 unrelated parent, 11 trial student, 12 guest student, 13 teacher without a row.
insert into auth.users(id, email, aud, role, email_confirmed_at, created_at, updated_at)
select pg_temp.id(i), 'ol-user-' || i || '@example.test', 'authenticated', 'authenticated', now(), now(), now()
from generate_series(1, 13) i;
update public.profiles set role = (array['director','admin','receptionist','teacher','teacher','teacher','parent',
  'student','pending','parent','student','student','teacher'])[('x' || right(id::text, 4))::bit(16)::integer]
where id::text like '11700000-%';
select pg_temp.ok((select count(*) from public.profiles where id::text like '11700000-%' and role <> 'pending') = 12, 'fixture roles');

insert into public.teachers(id, full_name, email, contract_type) values
  (pg_temp.id(101), 'Sara Lahlou', 'ol-user-4@example.test', 'Freelance'),
  (pg_temp.id(102), 'Karim Naciri', 'ol-user-5@example.test', 'Freelance'),
  (pg_temp.id(103), 'Mona Fassi', 'ol-user-6@example.test', 'Employé');

insert into public.students(id, full_name, email, parent_email, telephone, date_naissance, status, session_type, niveau_cefr) values
  (pg_temp.id(201), 'Amal Bennani', 'ol-user-8@example.test', null, '0611000201', '1990-01-01', 'Enrolled', 'Online', 'B1'),
  (pg_temp.id(202), 'Amal Berrada', 'l202@example.test', null, '0611000202', '1991-01-01', 'Enrolled', 'Online', 'B1'),
  (pg_temp.id(203), 'Youssef Alaoui', 'l203@example.test', 'l203p@example.test', '0611000203', '1992-01-01', 'Enrolled', 'Online One-to-One', 'B2'),
  (pg_temp.id(204), 'Trial Learner', 'ol-user-11@example.test', null, '0611000204', '1993-01-01', 'Trial', 'Online', 'B1'),
  (pg_temp.id(205), 'Guest Person', 'ol-user-12@example.test', null, '0611000205', '1994-01-01', 'Prospect', 'Online', 'B1'),
  (pg_temp.id(206), 'Lina Tazi', null, 'ol-user-7@example.test', '0611000206', '2016-01-01', 'Enrolled', 'Online', 'A1'),
  (pg_temp.id(207), 'Omar Tazi', null, 'ol-user-7@example.test', '0611000207', '2017-01-01', 'Enrolled', 'Online', 'A1'),
  (pg_temp.id(208), 'Other Child', null, 'ol-user-10@example.test', '0611000208', '2016-02-01', 'Enrolled', 'Online', 'A1'),
  (pg_temp.id(209), 'Inperson Kid', 'p209@example.test', 'p209p@example.test', '0611000209', '2015-01-01', 'Enrolled', 'Yearly', 'Child 1'),
  (pg_temp.id(210), 'Inperson Two', 'p210@example.test', null, '0611000210', '2015-02-01', 'Enrolled', 'Yearly', 'Child 1'),
  (pg_temp.id(222), 'Existing Yearly', 'e222@example.test', null, '0611000222', '2014-02-01', 'Prospect', 'Yearly', 'Child 2');
insert into public.students(id, full_name, email, parent_email, status, session_type, niveau_cefr)
select pg_temp.id(210 + i), 'Seat Learner ' || i, 'seat' || i || '@example.test', 'seat' || i || 'p@example.test',
  'Enrolled', 'Online', 'A2' from generate_series(1, 8) i;

-- ---------------------------------------------------------------------------
-- D1 vocabulary: five constraints accept both online values and refuse others.
-- ---------------------------------------------------------------------------
do $$ declare t text; begin
  foreach t in array array['groups_session_type_check','students_session_type_check','enrollments_session_type_check',
    'charges_session_type_check','receipts_session_type_check'] loop
    perform pg_temp.ok((select pg_get_constraintdef(oid) like '%''Other''::text, %''Online''::text, ''Online One-to-One''::text]%'
      or pg_get_constraintdef(oid) like '%''Legacy''::text, ''Online''::text, ''Online One-to-One''::text]%'
      from pg_constraint where conname = t), t || ' lists both online values');
  end loop;
end $$;
select pg_temp.fails($$insert into public.groups(name, session_type, niveau) values ('Bogus', 'Online Plus', 'A1')$$, '23514');
select pg_temp.fails($$insert into public.students(full_name, session_type) values ('Bogus', 'Online Plus')$$, '23514');
select pg_temp.fails($$insert into public.enrollments(student_id, session_type) values ('11700000-0000-4000-8000-0000000000c9', 'Online Plus')$$, '23514');
select pg_temp.ok((select pg_get_constraintdef(oid) from pg_constraint where conname = 'notifications_type_check')
  like '%''general''::text, ''online_lesson_cancelled''::text, ''online_lesson_rescheduled''::text]%', 'notification types appended');

-- ---------------------------------------------------------------------------
-- Groups and courses. D2 triggers.
-- ---------------------------------------------------------------------------
insert into public.groups(id, name, session_type, niveau, teacher_id) values
  (pg_temp.id(304), 'IP Yearly', 'Yearly', 'Child 1', pg_temp.id(103)),
  (pg_temp.id(307), 'Plain Yearly', 'Yearly', 'Child 2', null);
insert into public.groups(id, name, session_type, niveau) values
  (pg_temp.id(301), 'OL Window B1', 'Online', 'B1'),
  (pg_temp.id(302), 'OL Kids A1', 'Online', 'A1'),
  (pg_temp.id(303), 'OL Solo B2', 'Online One-to-One', 'B2'),
  (pg_temp.id(305), 'OL Cap A2', 'Online', 'A2'),
  (pg_temp.id(306), 'OL Pattern B2', 'Online', 'B2'),
  (pg_temp.id(308), 'OL Draft B1', 'Online', 'B1'),
  (pg_temp.id(309), 'OL Closed B1', 'Online', 'B1'),
  (pg_temp.id(310), 'OL CRM B1', 'Online', 'B1'),
  (pg_temp.id(311), 'OL CRM Solo B1', 'Online One-to-One', 'B1'),
  (pg_temp.id(312), 'OL Notices B1', 'Online', 'B1');
select pg_temp.fails(format($$insert into public.groups(name, session_type, niveau, teacher_id) values ('T', 'Online', 'B1', %L)$$, pg_temp.id(101)),
  '23514', 'online.teacher_on_course');
select pg_temp.fails(format($$update public.groups set teacher_id = %L where id = %L$$, pg_temp.id(101), pg_temp.id(301)),
  '23514', 'online.teacher_on_course');
select pg_temp.fails(format($$update public.groups set session_type = 'Online' where id = %L$$, pg_temp.id(304)),
  '23514', 'online.teacher_on_course');
select pg_temp.fails(format($$insert into public.online_courses(group_id, teacher_id, audience, term_start, term_end)
  values (%L, %L, 'adult', current_date, current_date + 30)$$, pg_temp.id(307), pg_temp.id(101)), '23514', 'online.group_not_online');

-- Course commands: management only.
select pg_temp.act(3);
select pg_temp.fails(format($$select public.online_save_course(%L, null, '{"teacher_id":"%s","audience":"adult","term_start":"2026-01-01","term_end":"2026-02-01"}')$$,
  pg_temp.id(306), pg_temp.id(101)), '42501', 'online.forbidden');
select pg_temp.act(4);
select pg_temp.fails(format($$select public.online_save_course(%L, null, '{}')$$, pg_temp.id(306)), '42501', 'online.forbidden');
select pg_temp.act(1);
do $$ declare g uuid; r jsonb; begin
  foreach g in array array[pg_temp.id(301), pg_temp.id(302), pg_temp.id(303), pg_temp.id(305), pg_temp.id(306),
    pg_temp.id(308), pg_temp.id(309), pg_temp.id(310), pg_temp.id(311), pg_temp.id(312)] loop
    r := public.online_save_course(g, null, jsonb_build_object('teacher_id', case when g = pg_temp.id(303) then pg_temp.id(103) else pg_temp.id(101) end,
      'audience', case when g = pg_temp.id(302) then 'child' else 'adult' end,
      'capacity', case when g = pg_temp.id(305) then 2 when g = pg_temp.id(301) then 5 else null end,
      'term_start', (now() at time zone 'Africa/Casablanca')::date - 7, 'term_end', (now() at time zone 'Africa/Casablanca')::date + 70));
    perform pg_temp.ok((r->>'version')::bigint = 1 and r->>'status' = 'draft', 'course created as draft');
  end loop;
end $$;
select pg_temp.ok((select capacity from public.online_courses where group_id = pg_temp.id(303)) = 1, 'one-to-one capacity defaults to 1');
select pg_temp.ok((select capacity from public.online_courses where group_id = pg_temp.id(306)) = 10, 'group capacity defaults to 10');
select pg_temp.fails(format($$select public.online_save_course(%L, null, '{"teacher_id":"%s","audience":"adult","term_start":"2026-01-01","term_end":"2026-02-01"}')$$,
  pg_temp.id(306), pg_temp.id(101)), '23505', 'online.course_exists');
select pg_temp.fails(format($$select public.online_save_course(%L, 1, '{"term_end":"2099-01-01"}')$$, pg_temp.id(306)), '22023', 'online.term_invalid');
select pg_temp.fails(format($$select public.online_save_course(%L, 1, '{"capacity":13}')$$, pg_temp.id(306)), '22023', 'online.invalid_input');
select pg_temp.fails(format($$select public.online_save_course(%L, 7, '{"capacity":8}')$$, pg_temp.id(306)), '40001', 'online.stale');
select pg_temp.owner();
-- A group with a course keeps an online programme; online to online is allowed.
select pg_temp.fails(format($$update public.groups set session_type = 'Yearly', niveau = 'Child 1' where id = %L$$, pg_temp.id(308)),
  '23514', 'online.course_type_locked');
update public.groups set session_type = 'Online One-to-One' where id = pg_temp.id(308);
update public.groups set session_type = 'Online' where id = pg_temp.id(308);

-- Activation (RPC level; the route adds the live gate and provider checks).
select pg_temp.act(3);
select pg_temp.fails(format($$select public.online_activate_course(%L, 1, 'fake', 'fake-room-x')$$, pg_temp.id(301)), '42501', 'online.forbidden');
select pg_temp.act(1);
select pg_temp.fails(format($$select public.online_activate_course(%L, 1, 'fake', 'https://rooms.example/x')$$, pg_temp.id(301)), '22023', 'online.room_ref_invalid');
select pg_temp.fails(format($$select public.online_activate_course(%L, 1, 'fake', 'room/x')$$, pg_temp.id(301)), '22023', 'online.room_ref_invalid');
do $$ declare g uuid; begin
  foreach g in array array[pg_temp.id(301), pg_temp.id(302), pg_temp.id(303), pg_temp.id(305), pg_temp.id(306),
    pg_temp.id(309), pg_temp.id(310), pg_temp.id(311), pg_temp.id(312)] loop
    perform public.online_activate_course(g, pg_temp.course_version(g), 'fake', 'fake-room-' || right(g::text, 4));
  end loop;
end $$;
select pg_temp.fails(format($$select public.online_activate_course(%L, %s, 'fake', 'fake-room-again')$$,
  pg_temp.id(301), pg_temp.course_version(pg_temp.id(301))), '23514', 'online.course_not_draft');
select pg_temp.ok((select provider_room_ref from public.online_courses where group_id = pg_temp.id(301)) = 'fake-room-' || right(pg_temp.id(301)::text, 4), 'opaque room reference stored');
select pg_temp.owner();

-- ---------------------------------------------------------------------------
-- Enrolments and window fixtures (inserted as the owner; commands tested below).
-- Window course 301 (open 15, grace 10, host 30). Lessons are placed relative to
-- the fixed transaction time so every window boundary is a separate lesson.
-- ---------------------------------------------------------------------------
insert into public.enrollments(id, student_id, group_id, status, session_type, school_year, level) values
  (pg_temp.id(401), pg_temp.id(201), pg_temp.id(301), 'Validated', 'Online', '2026/2027', 'B1'),
  (pg_temp.id(402), pg_temp.id(202), pg_temp.id(301), 'Confirmed', 'Online', '2026/2027', 'B1'),
  (pg_temp.id(403), pg_temp.id(204), pg_temp.id(301), 'Trial', 'Online', '2026/2027', 'B1'),
  (pg_temp.id(404), pg_temp.id(206), pg_temp.id(302), 'Validated', 'Online', '2026/2027', 'A1'),
  (pg_temp.id(405), pg_temp.id(207), pg_temp.id(302), 'Validated', 'Online', '2026/2027', 'A1'),
  (pg_temp.id(406), pg_temp.id(203), pg_temp.id(303), 'Validated', 'Online One-to-One', '2026/2027', 'B2'),
  (pg_temp.id(407), pg_temp.id(209), pg_temp.id(304), 'Validated', 'Yearly', '2026/2027', 'Child 1'),
  (pg_temp.id(408), pg_temp.id(210), pg_temp.id(304), 'Validated', 'Yearly', '2026/2027', 'Child 1'),
  (pg_temp.id(409), pg_temp.id(215), pg_temp.id(306), 'Validated', 'Online', '2026/2027', null);
select pg_temp.ok((select status from public.enrollments where id = pg_temp.id(402)) = 'Validated', 'confirmed with a group becomes validated (072)');
insert into public.online_lessons(id, group_id, starts_at, ends_at, teacher_id, status, cancelled_at, completed_at, is_substitute) values
  (pg_temp.id(501), pg_temp.id(301), now() + interval '14 minutes', now() + interval '74 minutes', pg_temp.id(101), 'scheduled', null, null, false),
  (pg_temp.id(502), pg_temp.id(301), now() + interval '20 minutes', now() + interval '80 minutes', pg_temp.id(101), 'scheduled', null, null, false),
  (pg_temp.id(503), pg_temp.id(301), now() + interval '31 minutes', now() + interval '91 minutes', pg_temp.id(101), 'scheduled', null, null, false),
  (pg_temp.id(504), pg_temp.id(301), now() - interval '69 minutes', now() - interval '9 minutes', pg_temp.id(101), 'scheduled', null, null, false),
  (pg_temp.id(505), pg_temp.id(301), now() - interval '71 minutes', now() - interval '11 minutes', pg_temp.id(101), 'scheduled', null, null, false),
  (pg_temp.id(506), pg_temp.id(301), now() + interval '5 minutes', now() + interval '65 minutes', pg_temp.id(101), 'cancelled', now(), null, false),
  (pg_temp.id(507), pg_temp.id(301), now() - interval '30 minutes', now() + interval '30 minutes', pg_temp.id(101), 'completed', null, now(), false),
  (pg_temp.id(508), pg_temp.id(301), now() + interval '10 minutes', now() + interval '70 minutes', pg_temp.id(102), 'scheduled', null, null, true),
  (pg_temp.id(509), pg_temp.id(312), now() + interval '3 days', now() + interval '3 days 1 hour', pg_temp.id(101), 'scheduled', null, null, false),
  (pg_temp.id(511), pg_temp.id(302), now() + interval '10 minutes', now() + interval '70 minutes', pg_temp.id(101), 'scheduled', null, null, false),
  (pg_temp.id(512), pg_temp.id(303), now() + interval '10 minutes', now() + interval '70 minutes', pg_temp.id(103), 'scheduled', null, null, false),
  (pg_temp.id(513), pg_temp.id(308), now() + interval '10 minutes', now() + interval '70 minutes', pg_temp.id(101), 'scheduled', null, null, false),
  (pg_temp.id(514), pg_temp.id(309), now() + interval '10 minutes', now() + interval '70 minutes', pg_temp.id(101), 'scheduled', null, null, false),
  (pg_temp.id(515), pg_temp.id(305), now() + interval '2 days', now() + interval '2 days 1 hour', pg_temp.id(101), 'scheduled', null, null, false);
insert into public.enrollments(student_id, group_id, status, session_type, school_year, level) values
  (pg_temp.id(201), pg_temp.id(312), 'Validated', 'Online', '2026/2027', 'B1'),
  (pg_temp.id(202), pg_temp.id(312), 'Validated', 'Online', '2026/2027', 'B1'),
  (pg_temp.id(204), pg_temp.id(312), 'Trial', 'Online', '2026/2027', 'B1'),
  (pg_temp.id(201), pg_temp.id(308), 'Validated', 'Online', '2026/2027', 'B1'),
  (pg_temp.id(201), pg_temp.id(309), 'Validated', 'Online', '2026/2027', 'B1');
select pg_temp.act(1);
select public.online_close_course(pg_temp.id(309), pg_temp.course_version(pg_temp.id(309)));
select pg_temp.owner();

-- Display labels: first name + last initial, numbered on collision, mirrored in label.mjs.
select pg_temp.ok(online_security.base_label('  amal   el  idrissi ') = 'Amal I.', 'label whitespace and casing');
select pg_temp.ok(online_security.base_label('Élodie') = 'Élodie', 'single-token label keeps diacritics');
select pg_temp.ok(online_security.base_label(E'Ömer\tÇelik') = 'Ömer Ç.', 'tab separator and diacritic initial');
select pg_temp.ok(online_security.base_label('jean-pierre écrivain') = 'Jean-pierre É.', 'diacritic initial');
select pg_temp.ok(online_security.base_label('') = 'Participant' and online_security.base_label(null) = 'Participant', 'empty label');
select pg_temp.ok(online_security.base_label(repeat('b', 40) || ' z') = 'B' || repeat('b', 29) || ' Z.', 'first token capped at 30');
select pg_temp.ok(online_security.student_label(pg_temp.id(201), pg_temp.id(301)) = 'Amal B.'
  and online_security.student_label(pg_temp.id(202), pg_temp.id(301)) = 'Amal B. 2', 'collision suffix inside one course');

-- ---------------------------------------------------------------------------
-- Join matrix: roles x windows x states (D4, D6, Q4, Q6).
-- ---------------------------------------------------------------------------
create function pg_temp.join_reason(who integer, lesson integer, student integer default null) returns text language plpgsql as $$
declare st text; h text; begin
  perform pg_temp.act(who);
  begin
    perform public.online_issue_join(pg_temp.id(lesson), case when student is null then null else pg_temp.id(student) end);
  exception when others then
    get stacked diagnostics st = returned_sqlstate, h = pg_exception_hint;
    perform pg_temp.owner();
    return coalesce(nullif(h, ''), st);
  end;
  perform pg_temp.owner();
  return 'ok';
end $$;
-- Adult learner (student 8 = learner 201, Validated).
select pg_temp.ok(pg_temp.join_reason(8, 501) = 'ok', 'learner inside the open window');
select pg_temp.ok(pg_temp.join_reason(8, 502) = 'online.window_closed', 'learner before the 15-minute opening');
select pg_temp.ok(pg_temp.join_reason(8, 504) = 'ok', 'learner inside the grace period');
select pg_temp.ok(pg_temp.join_reason(8, 505) = 'online.window_closed', 'learner after the grace period');
select pg_temp.ok(pg_temp.join_reason(8, 506) = 'online.lesson_cancelled', 'cancelled lesson');
select pg_temp.ok(pg_temp.join_reason(8, 507) = 'ok', 'a completed lesson stays joinable inside its window');
select pg_temp.ok(pg_temp.join_reason(8, 513) = 'online.course_inactive', 'draft course');
select pg_temp.ok(pg_temp.join_reason(8, 514) = 'online.course_inactive', 'closed course');
select pg_temp.ok(pg_temp.join_reason(8, 511) = 'online.not_eligible', 'not seated in that course');
select pg_temp.ok(pg_temp.join_reason(8, 501, 202) = 'online.not_eligible', 'another learner is not visible to this student');
-- Trial enrolment alone does not open the room (Q4); a guest row does.
select pg_temp.ok(pg_temp.join_reason(11, 501) = 'online.not_eligible', 'trial enrolment alone does not qualify');
select pg_temp.ok(pg_temp.join_reason(12, 501) = 'online.not_eligible', 'no seat before the guest row');
-- Host: the lesson's effective teacher, own 30-minute window.
select pg_temp.ok(pg_temp.join_reason(4, 502) = 'ok', 'host inside the 30-minute opening');
select pg_temp.ok(pg_temp.join_reason(4, 503) = 'online.window_closed', 'host before the 30-minute opening');
select pg_temp.ok(pg_temp.join_reason(4, 508) = 'online.not_eligible', 'course teacher is not the host of a substituted lesson');
select pg_temp.ok(pg_temp.join_reason(5, 508) = 'ok', 'substitute hosts the one lesson');
select pg_temp.ok(pg_temp.join_reason(5, 501) = 'online.not_eligible', 'substitute has no other lesson');
select pg_temp.ok(pg_temp.join_reason(6, 501) = 'online.not_eligible', 'other teacher');
select pg_temp.ok(pg_temp.join_reason(13, 501) = 'online.not_eligible', 'teacher role without a teacher row');
-- Observers (Q6): director and admin; never the receptionist.
select pg_temp.ok(pg_temp.join_reason(1, 501) = 'ok' and pg_temp.join_reason(2, 501) = 'ok', 'management observes');
select pg_temp.ok(pg_temp.join_reason(1, 502) = 'online.window_closed', 'observer uses the learner window');
select pg_temp.ok(pg_temp.join_reason(3, 501) = 'online.not_eligible', 'receptionist does not join');
select pg_temp.ok(pg_temp.join_reason(9, 501) = 'online.forbidden', 'pending role');
select pg_temp.act(null);
select pg_temp.fails(format('select public.online_issue_join(%L)', pg_temp.id(501)), '42501');
select pg_temp.owner();

-- Pass content: per person, per lesson, expiring at the end plus grace; no room reference.
select pg_temp.act(8);
do $$ declare r jsonb; t public.online_join_tokens%rowtype; begin
  r := public.online_issue_join(pg_temp.id(501));
  perform pg_temp.ok(not (r ? 'room_ref') and not (r ? 'provider') and r->>'provider_role' = 'participant'
    and r->>'display_label' = 'Amal B.', 'learner pass shape');
  perform pg_temp.owner();
  select * into t from public.online_join_tokens where jti = (r->>'jti')::uuid;
  perform pg_temp.ok(t.expires_at = (select ends_at + interval '10 minutes' from public.online_lessons where id = pg_temp.id(501))
    and t.participant_kind = 'learner' and t.student_id = pg_temp.id(201) and t.profile_id = pg_temp.id(8), 'pass stored and expires at end + grace');
end $$;
select pg_temp.act(4);
select pg_temp.ok((public.online_issue_join(pg_temp.id(502)))->>'provider_role' = 'host'
  and (public.online_issue_join(pg_temp.id(502)))->>'display_label' = 'Sara L.', 'host pass uses the safe teacher label');
select pg_temp.owner();

-- Resolve is service-role only and refuses expired, stale and revoked passes.
select jti as ol_jti from public.online_join_tokens where lesson_id = pg_temp.id(501) and student_id = pg_temp.id(201) limit 1 \gset
select pg_temp.act(8);
select pg_temp.fails(format('select public.online_resolve_join(%L)', :'ol_jti'), '42501');
select pg_temp.owner();
set local role service_role;
select pg_temp.ok((public.online_resolve_join(:'ol_jti'))->>'room_ref' = 'fake-room-' || right(pg_temp.id(301)::text, 4), 'server resolves the opaque room');
reset role;
select jti as ol_old from public.online_join_tokens where lesson_id = pg_temp.id(504) and student_id = pg_temp.id(201) limit 1 \gset
update public.online_join_tokens set issued_at = now() - interval '6 minutes', expires_at = now() + interval '1 minute' where jti = :'ol_old';
set local role service_role;
select pg_temp.fails(format('select public.online_resolve_join(%L)', :'ol_old'), '42501', 'online.pass_invalid');
reset role;
select pg_temp.act(8);
select (public.online_issue_join(pg_temp.id(504)))->>'jti' as ol_expired \gset
select pg_temp.owner();
update public.online_join_tokens set expires_at = now() - interval '1 second', issued_at = now() - interval '1 minute' where jti = :'ol_expired';
set local role service_role;
select pg_temp.fails(format('select public.online_resolve_join(%L)', :'ol_expired'), '42501', 'online.pass_invalid');
reset role;

-- Guests (Q4): an operations command; the guest joins only that lesson.
select pg_temp.act(3);
create temp table ol_guest as select (public.online_add_guest(pg_temp.id(501), pg_temp.id(205), 'trial', 'Essai gratuit'))->>'guest_id' id;
select pg_temp.open_to_api('ol_guest');
select pg_temp.fails(format($$select public.online_add_guest(%L, %L, 'trial')$$, pg_temp.id(501), pg_temp.id(205)), '23505', 'online.guest_exists');
select pg_temp.fails(format($$select public.online_add_guest(%L, %L, 'override')$$, pg_temp.id(501), pg_temp.id(201)), '23514', 'online.already_enrolled');
select pg_temp.fails(format($$select public.online_add_guest(%L, %L, 'visitor')$$, pg_temp.id(501), pg_temp.id(208)), '22023', 'online.invalid_input');
select pg_temp.ok(pg_temp.join_reason(12, 501) = 'ok', 'guest joins the lesson');
select pg_temp.ok(pg_temp.join_reason(12, 502) = 'online.not_eligible', 'guest row covers one lesson only');
-- Removal revokes the open pass, and the join route's re-issue is refused.
select pg_temp.act(3);
select public.online_remove_guest((select id::uuid from ol_guest));
select pg_temp.owner();
select pg_temp.ok((select bool_and(revoked_at is not null and revoke_reason = 'guest_removed') from public.online_join_tokens
  where lesson_id = pg_temp.id(501) and student_id = pg_temp.id(205)), 'guest removal revokes the pass');
select pg_temp.ok(pg_temp.join_reason(12, 501) = 'online.not_eligible', 're-issue refused after removal');
select jti as ol_guest_jti from public.online_join_tokens where lesson_id = pg_temp.id(501) and student_id = pg_temp.id(205) limit 1 \gset
set local role service_role;
select pg_temp.fails(format('select public.online_resolve_join(%L)', :'ol_guest_jti'), '42501', 'online.pass_invalid');
reset role;

-- ---------------------------------------------------------------------------
-- Children and consent (D10, OL-r4 two-children test).
-- ---------------------------------------------------------------------------
select pg_temp.act(3);
select public.online_record_consent(pg_temp.id(206), 'Ligne signée');
select pg_temp.ok((public.online_record_consent(pg_temp.id(206)))->>'created' = 'false', 'consent recording is idempotent');
select pg_temp.ok(pg_temp.join_reason(7, 511) = 'online.student_required', 'a parent names the child');
select pg_temp.ok(pg_temp.join_reason(7, 511, 206) = 'ok', 'child with consent');
select pg_temp.ok(pg_temp.join_reason(7, 511, 207) = 'online.consent_missing', 'child without consent');
select pg_temp.ok(pg_temp.join_reason(10, 511, 206) = 'online.not_eligible', 'another parent');
select pg_temp.act(3);
select public.online_record_consent(pg_temp.id(207));
select pg_temp.ok(pg_temp.join_reason(7, 511, 206) = 'ok' and pg_temp.join_reason(7, 511, 207) = 'ok', 'both children after consent');
select pg_temp.act(3);
select pg_temp.fails(format('select public.online_revoke_consent(%L)', pg_temp.id(207)), '42501', 'online.forbidden');
select pg_temp.act(1);
select pg_temp.ok((public.online_revoke_consent(pg_temp.id(207)))->>'passes_revoked' = '1', 'consent revocation revokes the open pass');
select pg_temp.ok(pg_temp.join_reason(7, 511, 207) = 'online.consent_missing', 'revoked consent closes the room');
select pg_temp.act(7);
select pg_temp.ok((select count(*) from jsonb_array_elements(public.online_list_lessons_for_my_children())) = 2
  and (select bool_and(not (x ? 'email') and not (x ? 'parent_email') and not (x ? 'telephone'))
       from jsonb_array_elements(public.online_list_lessons_for_my_children()) x), 'parent list: own children, no contact keys');
select pg_temp.fails('select public.online_list_lessons_for_me()', '42501', 'online.forbidden');
select pg_temp.act(8);
select pg_temp.ok((select count(*) from jsonb_array_elements(public.online_list_lessons_for_me())) = 9
  and (select bool_and(x->>'student_id' = pg_temp.id(201)::text) from jsonb_array_elements(public.online_list_lessons_for_me()) x),
  'student list: own active-course lessons only');
select pg_temp.owner();

-- ---------------------------------------------------------------------------
-- Teacher boundary (D5, invariant 2, S3).
-- ---------------------------------------------------------------------------
select pg_temp.act(4);
select pg_temp.ok((select count(*) from public.students) = 0, 'online-only teacher reads zero students rows');
select pg_temp.ok((select count(*) from public.enrollments) = 0 and (select count(*) from public.online_courses) = 0
  and (select count(*) from public.online_lessons) = 0 and (select count(*) from public.online_attendance) = 0,
  'online-only teacher reads no enrolment or online table row');
select pg_temp.fails('select count(*) from public.online_join_tokens', '42501');
select pg_temp.ok(public.can_message_recipient('l202@example.test') is not true
  and public.can_message_recipient('ol-user-7@example.test') is not true, 'no learner or parent message recipient');
select pg_temp.ok((select bool_and(keys = array['attendance_note','attendance_status','display_label','is_guest','niveau_cefr','student_id'])
  and count(*) = 2 from (select array_agg(k order by k) keys from jsonb_array_elements(public.online_get_lesson_roster(pg_temp.id(501))->'roster') r,
  jsonb_object_keys(r) k group by r) x), 'roster rows carry exactly the six projection keys');
select pg_temp.ok((select count(*) from jsonb_array_elements(public.online_get_lesson_roster(pg_temp.id(501))->'roster')) = 2,
  'roster: Confirmed/Validated learners, no trial enrolment, no removed guest');
select pg_temp.ok(public.online_get_lesson_roster(pg_temp.id(508)) is not null, 'course teacher still sees a substituted lesson');
select pg_temp.ok(public.online_get_lesson_roster(pg_temp.id(509)) is null, 'outside the 24-hour window nothing is returned');
select pg_temp.ok(public.online_get_lesson_roster(pg_temp.id(512)) is null, 'other teacher''s course returns nothing');
select pg_temp.ok(public.online_get_lesson_roster(pg_temp.id(513)) is null, 'draft course returns nothing');
select pg_temp.act(5);
select pg_temp.ok((select count(*) from jsonb_array_elements(public.online_list_my_lessons())) = 1, 'substitute lists exactly one lesson');
select pg_temp.ok(public.online_get_lesson_roster(pg_temp.id(508)) is not null and public.online_get_lesson_roster(pg_temp.id(501)) is null,
  'substitute sees exactly one roster');
select pg_temp.ok((select count(*) from public.students) = 0, 'substitute reads zero students rows');
-- Mixed teacher (OL-r4): the 071 policies still open exactly the in-person learners.
select pg_temp.act(6);
select pg_temp.ok((select array_agg(id order by id) from public.students) = array[pg_temp.id(209), pg_temp.id(210)], 'mixed teacher reads exactly the in-person learners');
select pg_temp.ok((select bool_and(keys = array['attendance_note','attendance_status','display_label','is_guest','niveau_cefr','student_id'])
  and count(*) = 1 from (select array_agg(k order by k) keys from jsonb_array_elements(public.online_get_lesson_roster(pg_temp.id(512))->'roster') r,
  jsonb_object_keys(r) k group by r) x)
  and (public.online_get_lesson_roster(pg_temp.id(512))->'roster'->0->>'display_label') = 'Youssef A.', 'mixed teacher: online projection only');
select pg_temp.ok(public.can_message_recipient('l203@example.test') is not true and public.can_message_recipient('l203p@example.test') is not true,
  'mixed teacher cannot message the online learner or parent');
select pg_temp.ok(public.can_message_recipient('p209@example.test') is true, 'in-person teacher messaging unchanged');
-- Teachers write attendance only as the lesson's effective teacher, inside the window.
select pg_temp.act(4);
select pg_temp.fails(format($$select public.online_save_attendance(%L, %s, '[]')$$, pg_temp.id(508), pg_temp.lesson_version(pg_temp.id(508))),
  '42501', 'online.forbidden');
select pg_temp.fails(format($$select public.online_save_attendance(%L, %s, '[]')$$, pg_temp.id(509), pg_temp.lesson_version(pg_temp.id(509))),
  '42501', 'online.forbidden');
select pg_temp.fails(format($$select public.online_save_attendance(%L, %s, '[{"student_id":"%s","status":"Présent"}]')$$,
  pg_temp.id(501), pg_temp.lesson_version(pg_temp.id(501)), pg_temp.id(204)), '23514', 'online.not_on_roster');
select pg_temp.ok((public.online_save_attendance(pg_temp.id(501), pg_temp.lesson_version(pg_temp.id(501)),
  jsonb_build_array(jsonb_build_object('student_id', pg_temp.id(201), 'status', 'Présent', 'note', 'Bien'),
    jsonb_build_object('student_id', pg_temp.id(202), 'status', 'Retard')), 'Leçon 4 vue.'))->>'status' = 'scheduled',
  'attendance before the start keeps the lesson scheduled');
select pg_temp.ok((public.online_save_attendance(pg_temp.id(504), pg_temp.lesson_version(pg_temp.id(504)),
  jsonb_build_array(jsonb_build_object('student_id', pg_temp.id(201), 'status', 'Absent')), 'Révisions.'))->>'status' = 'completed',
  'attendance after the start completes the lesson');
select pg_temp.fails(format($$select public.online_save_attendance(%L, 1, '[]')$$, pg_temp.id(501)), '40001', 'online.stale');
select pg_temp.ok((public.online_get_lesson_roster(pg_temp.id(501))->'roster') @> jsonb_build_array(jsonb_build_object(
  'student_id', pg_temp.id(201), 'attendance_status', 'Présent', 'attendance_note', 'Bien')), 'roster shows the teacher''s own note');
select pg_temp.owner();
select pg_temp.ok((select count(*) from public.attendance where student_id in (pg_temp.id(201), pg_temp.id(202))) = 0, 'in-person attendance untouched');
select pg_temp.ok((select report from public.online_lessons where id = pg_temp.id(504)) = 'Révisions.', 'lesson report stored');

-- ---------------------------------------------------------------------------
-- Staff role matrix (OL-r4): receptionist denials write nothing; operations succeed.
-- ---------------------------------------------------------------------------
create temp table ol_snapshot as select
  (select md5(string_agg(to_jsonb(p)::text, '' order by p.id)) from public.online_lesson_patterns p) patterns,
  (select md5(string_agg(to_jsonb(l)::text, '' order by l.id)) from public.online_lessons l) lessons,
  (select md5(string_agg(to_jsonb(c)::text, '' order by c.group_id)) from public.online_courses c) courses,
  (select md5(string_agg(to_jsonb(c)::text, '' order by c.id)) from public.online_consents c) consents;
select pg_temp.open_to_api('ol_snapshot');
select pg_temp.act(3);
select pg_temp.fails(format($$select public.online_save_pattern(%L, '[{"weekday":1,"start_time":"18:00"}]', null, %s)$$,
  pg_temp.id(306), pg_temp.course_version(pg_temp.id(306))), '42501', 'online.forbidden');
select pg_temp.fails(format($$select public.online_set_lesson_teacher(%L, %s, %L)$$, pg_temp.id(509), pg_temp.lesson_version(pg_temp.id(509)), pg_temp.id(102)),
  '42501', 'online.forbidden');
select pg_temp.fails(format($$select public.online_activate_course(%L, %s, 'fake', 'fake-room-r')$$, pg_temp.id(308), pg_temp.course_version(pg_temp.id(308))),
  '42501', 'online.forbidden');
select pg_temp.fails(format('select public.online_revoke_consent(%L)', pg_temp.id(206)), '42501', 'online.forbidden');
select pg_temp.fails(format($$select public.online_close_course(%L, %s)$$, pg_temp.id(301), pg_temp.course_version(pg_temp.id(301))), '42501', 'online.forbidden');
select pg_temp.fails('select public.online_teacher_lesson_counts(current_date)', '42501', 'online.forbidden');
select pg_temp.owner();
select pg_temp.ok((select patterns from ol_snapshot) is not distinct from (select md5(string_agg(to_jsonb(p)::text, '' order by p.id)) from public.online_lesson_patterns p)
  and (select lessons from ol_snapshot) = (select md5(string_agg(to_jsonb(l)::text, '' order by l.id)) from public.online_lessons l)
  and (select courses from ol_snapshot) = (select md5(string_agg(to_jsonb(c)::text, '' order by c.group_id)) from public.online_courses c)
  and (select consents from ol_snapshot) = (select md5(string_agg(to_jsonb(c)::text, '' order by c.id)) from public.online_consents c),
  'receptionist denials wrote nothing');
select pg_temp.act(3);
select pg_temp.ok((public.online_save_attendance(pg_temp.id(507), pg_temp.lesson_version(pg_temp.id(507)),
  jsonb_build_array(jsonb_build_object('student_id', pg_temp.id(202), 'status', 'Justifié')))) ? 'version', 'receptionist records attendance');
select pg_temp.ok((public.online_update_lesson(pg_temp.id(509), pg_temp.lesson_version(pg_temp.id(509)),
  jsonb_build_object('start_time', to_char((now() + interval '3 days 2 hours') at time zone 'Africa/Casablanca', 'HH24:MI')), 'this')) ? 'version',
  'receptionist moves one lesson');
select pg_temp.fails(format($$select public.online_update_lesson(%L, %s, '{"minutes":60}', 'following')$$, pg_temp.id(509), pg_temp.lesson_version(pg_temp.id(509))),
  '42501', 'online.forbidden');
select pg_temp.ok((select count(*) from public.online_lessons where id = pg_temp.id(509) and detached) = 1, 'moved lesson is detached');
select pg_temp.owner();
select pg_temp.ok((select count(*) from public.notifications where type = 'online_lesson_rescheduled'
  and recipient_email in ('ol-user-8@example.test', 'l202@example.test')) = 2
  and (select bool_and(message like 'Le cours en ligne « OL Notices B1 » du % est déplacé au %.') from public.notifications
    where type = 'online_lesson_rescheduled'), 'rescheduled notices for every seated learner, in French');
select pg_temp.ok(not exists (select 1 from public.notifications where type like 'online_%' and recipient_email = 'ol-user-11@example.test'),
  'trial enrolment receives no lesson notice');
select pg_temp.act(3);
select public.online_add_guest(pg_temp.id(509), pg_temp.id(205), 'override');
select pg_temp.ok((public.online_cancel_lesson(pg_temp.id(509), pg_temp.lesson_version(pg_temp.id(509)), 'Enseignante malade', 'this'))->>'cancelled' = '1',
  'receptionist cancels one lesson');
select pg_temp.fails(format($$select public.online_cancel_lesson(%L, %s, 'x', 'this')$$, pg_temp.id(509), pg_temp.lesson_version(pg_temp.id(509))),
  '23514', 'online.lesson_cancelled');
select pg_temp.fails(format($$select public.online_cancel_lesson(%L, %s, '  ', 'this')$$, pg_temp.id(501), pg_temp.lesson_version(pg_temp.id(501))),
  '22023', 'online.invalid_input');
select pg_temp.owner();
select pg_temp.ok((select count(*) from public.notifications where type = 'online_lesson_cancelled') = 3
  and (select bool_and(message like '% est annulé. Motif : Enseignante malade.') from public.notifications where type = 'online_lesson_cancelled'),
  'cancellation notices include the guest');

-- Cancelling revokes every open pass; the route cannot re-issue.
select pg_temp.act(8);
select public.online_issue_join(pg_temp.id(501));
select pg_temp.act(1);
select public.online_cancel_lesson(pg_temp.id(501), pg_temp.lesson_version(pg_temp.id(501)), 'Coupure', 'this');
select pg_temp.owner();
select pg_temp.ok(not exists (select 1 from public.online_join_tokens where lesson_id = pg_temp.id(501) and revoked_at is null), 'cancel revokes open passes');
select pg_temp.ok(pg_temp.join_reason(8, 501) = 'online.lesson_cancelled', 'no re-issue after cancellation');
-- Course close revokes every open pass of the course.
select pg_temp.act(8);
select public.online_issue_join(pg_temp.id(507));
select pg_temp.act(1);
select pg_temp.ok((public.online_close_course(pg_temp.id(301), pg_temp.course_version(pg_temp.id(301))))->>'room_ref' = 'fake-room-' || right(pg_temp.id(301)::text, 4), 'close returns the room to management');
select pg_temp.owner();
select pg_temp.ok(not exists (select 1 from public.online_join_tokens t join public.online_lessons l on l.id = t.lesson_id
  where l.group_id = pg_temp.id(301) and t.revoked_at is null and t.expires_at > now()), 'course close revokes open passes');
select pg_temp.ok(pg_temp.join_reason(8, 507) = 'online.course_inactive', 'no re-issue after close');

-- ---------------------------------------------------------------------------
-- Pattern → lessons, this-only / following edits, overlap, stale (D3).
-- ---------------------------------------------------------------------------
create temp table ol_dates as select (now() at time zone 'Africa/Casablanca')::date + 1 as from_date,
  (select term_end from public.online_courses where group_id = pg_temp.id(306)) as term_end;
select pg_temp.open_to_api('ol_dates');
select pg_temp.act(1);
select pg_temp.fails(format($$select public.online_save_pattern(%L, '[{"weekday":8,"start_time":"18:00"}]', null, %s)$$,
  pg_temp.id(306), pg_temp.course_version(pg_temp.id(306))), '22023', 'online.pattern_invalid');
select pg_temp.fails(format($$select public.online_save_pattern(%L, '[{"weekday":1,"start_time":"18:00"},{"weekday":1,"start_time":"18:00"}]', null, %s)$$,
  pg_temp.id(306), pg_temp.course_version(pg_temp.id(306))), '22023', 'online.pattern_invalid');
select pg_temp.fails(format($$select public.online_save_pattern(%L, '[{"weekday":1,"start_time":"18:00"},{"weekday":1,"start_time":"19:00"}]', null, %s)$$,
  pg_temp.id(306), pg_temp.course_version(pg_temp.id(306))), '23514', 'online.lesson_overlap');
select public.online_save_pattern(pg_temp.id(306), '[{"weekday":1,"start_time":"18:00","minutes":90},{"weekday":3,"start_time":"18:00"}]',
  (select from_date from ol_dates), pg_temp.course_version(pg_temp.id(306)));
select pg_temp.owner();
select pg_temp.ok((select count(*) from public.online_lessons where group_id = pg_temp.id(306)) =
  (select count(*) from generate_series((select from_date from ol_dates), (select term_end from ol_dates), interval '1 day') d
   where extract(dow from d) in (1, 3)), 'one lesson per Monday and Wednesday of the term');
select pg_temp.ok((select bool_and(to_char(starts_at at time zone 'Africa/Casablanca', 'HH24:MI') = '18:00'
  and ends_at - starts_at = interval '90 minutes' and teacher_id = pg_temp.id(101) and status = 'scheduled')
  from public.online_lessons where group_id = pg_temp.id(306)), '18:00 Casablanca, 90 minutes, course teacher');
select pg_temp.ok((select jours = 'Lun, Mer' and horaire = '18:00–19:30' from public.groups where id = pg_temp.id(306)), 'derived group schedule text');
create temp table ol_first as select array_agg(id order by starts_at) ids from public.online_lessons where group_id = pg_temp.id(306);
select pg_temp.act(1);
select pg_temp.ok((public.online_save_pattern(pg_temp.id(306), '[{"weekday":1,"start_time":"18:00","minutes":90},{"weekday":3,"start_time":"18:00"}]',
  (select from_date from ol_dates), pg_temp.course_version(pg_temp.id(306))))->>'created' = '0', 'pattern save is idempotent');
select pg_temp.owner();
select pg_temp.ok((select ids from ol_first) = (select array_agg(id order by starts_at) from public.online_lessons where group_id = pg_temp.id(306)),
  'same lesson identities after a repeated save');
-- Following: the second Monday moves to Tuesday 17:00 from its date on; Wednesdays keep their rows.
create temp table ol_mon as select l.id, l.starts_at from public.online_lessons l join public.online_lesson_patterns p on p.id = l.pattern_id
  where l.group_id = pg_temp.id(306) and p.weekday = 1 order by l.starts_at offset 1 limit 1;
create temp table ol_wed as select array_agg(l.id order by l.starts_at) ids from public.online_lessons l join public.online_lesson_patterns p on p.id = l.pattern_id
  where l.group_id = pg_temp.id(306) and p.weekday = 3;
select pg_temp.open_to_api('ol_mon'); select pg_temp.open_to_api('ol_wed');
select pg_temp.act(1);
select public.online_update_lesson((select id from ol_mon), pg_temp.lesson_version((select id from ol_mon)),
  jsonb_build_object('date', ((select starts_at from ol_mon) at time zone 'Africa/Casablanca')::date + 1, 'start_time', '17:00'), 'following');
select pg_temp.owner();
select pg_temp.ok(not exists (select 1 from public.online_lessons where group_id = pg_temp.id(306) and starts_at >= (select starts_at from ol_mon)
  and extract(dow from starts_at at time zone 'Africa/Casablanca') = 1), 'no Monday lesson from that date on');
select pg_temp.ok(exists (select 1 from public.online_lessons where group_id = pg_temp.id(306) and starts_at > (select starts_at from ol_mon)
  and extract(dow from starts_at at time zone 'Africa/Casablanca') = 2
  and to_char(starts_at at time zone 'Africa/Casablanca', 'HH24:MI') = '17:00'), 'Tuesday 17:00 lessons generated');
select pg_temp.ok((select count(*) from public.online_lessons where group_id = pg_temp.id(306) and starts_at < (select starts_at from ol_mon)
  and extract(dow from starts_at at time zone 'Africa/Casablanca') = 1) = 1, 'the earlier Monday is kept');
select pg_temp.ok((select ids from ol_wed) <@ (select array_agg(id) from public.online_lessons where group_id = pg_temp.id(306)), 'Wednesday lessons untouched');
select pg_temp.ok((select jours from public.groups where id = pg_temp.id(306)) = 'Lun, Mar, Mer', 'derived text follows the patterns');
select pg_temp.ok((select count(*) from public.notifications where type = 'online_lesson_rescheduled' and recipient_email in ('seat5@example.test', 'seat5p@example.test')) = 2,
  'pattern move notifies learner and parent once');
-- This-only edit next to another lesson is refused (gap shorter than grace + opening).
create temp table ol_wed1 as select id, starts_at from public.online_lessons where id = (select ids[1] from ol_wed);
create temp table ol_following as select count(*) n from public.online_lessons where group_id = pg_temp.id(306) and status = 'scheduled'
  and starts_at >= (select starts_at from public.online_lessons where id = (select ids[3] from ol_wed));
select pg_temp.open_to_api('ol_wed1'); select pg_temp.open_to_api('ol_following');
select pg_temp.act(3);
select pg_temp.fails(format($$select public.online_update_lesson(%L, %s, %L, 'this')$$, (select ids[2] from ol_wed),
  pg_temp.lesson_version((select ids[2] from ol_wed)), jsonb_build_object('date', ((select starts_at from ol_wed1) at time zone 'Africa/Casablanca')::date,
  'start_time', '20:00')), '23514', 'online.lesson_overlap');
select pg_temp.fails(format($$select public.online_update_lesson(%L, %s, '{"date":"2000-01-01"}', 'this')$$,
  (select ids[2] from ol_wed), pg_temp.lesson_version((select ids[2] from ol_wed))), '23514', 'online.lesson_past');
select pg_temp.fails(format($$select public.online_update_lesson(%L, 99, '{"minutes":60}', 'this')$$, (select ids[2] from ol_wed)), '40001', 'online.stale');
-- Following cancellation: this and every later scheduled lesson of the course.
select pg_temp.ok((public.online_cancel_lesson((select ids[3] from ol_wed), pg_temp.lesson_version((select ids[3] from ol_wed)), 'Fin anticipée', 'following'))->>'cancelled'
  = (select n::text from ol_following) and (select n from ol_following) > 1, 'following cancellation');
select pg_temp.act(1);
select public.online_save_pattern(pg_temp.id(306), '[{"weekday":3,"start_time":"18:00"}]', (select from_date from ol_dates), pg_temp.course_version(pg_temp.id(306)));
select pg_temp.owner();
select pg_temp.ok(not exists (select 1 from public.online_lessons where group_id = pg_temp.id(306) and status = 'scheduled'
  and starts_at >= (select starts_at from public.online_lessons where id = (select ids[3] from ol_wed))), 'cancelled lessons are kept, never regenerated');
-- Substitute for one lesson; course teacher change follows future lessons.
select pg_temp.act(1);
select pg_temp.ok((public.online_set_lesson_teacher((select ids[2] from ol_wed), pg_temp.lesson_version((select ids[2] from ol_wed)), pg_temp.id(102)))->>'is_substitute' = 'true',
  'substitute set for one lesson');
select public.online_save_course(pg_temp.id(306), pg_temp.course_version(pg_temp.id(306)), jsonb_build_object('teacher_id', pg_temp.id(103)));
select pg_temp.owner();
select pg_temp.ok((select teacher_id from public.online_lessons where id = (select ids[2] from ol_wed)) = pg_temp.id(102)
  and not exists (select 1 from public.online_lessons where group_id = pg_temp.id(306) and status = 'scheduled' and not is_substitute
    and teacher_id <> pg_temp.id(103)), 'course teacher change keeps the substitute');

-- ---------------------------------------------------------------------------
-- Capacity at group assignment on every path (D4, I1, I7), course 305 = 2 seats.
-- ---------------------------------------------------------------------------
insert into public.enrollments(id, student_id, group_id, status, session_type, school_year, level) values
  (pg_temp.id(601), pg_temp.id(211), pg_temp.id(305), 'Submitted', 'Online', '2026/2027', 'A2'),
  (pg_temp.id(602), pg_temp.id(212), pg_temp.id(305), 'Under Review', 'Online', '2026/2027', 'A2'),
  (pg_temp.id(603), pg_temp.id(213), null, 'Submitted', 'Online', '2026/2027', 'A2'),
  (pg_temp.id(604), pg_temp.id(214), pg_temp.id(305), 'Rejected', 'Online', '2026/2027', 'A2'),
  (pg_temp.id(605), pg_temp.id(216), null, 'Confirmed', 'Online', '2026/2027', 'A2');
select pg_temp.act(2);
do $do$ declare s text; begin
  foreach s in array array['Submitted', 'Under Review', 'Confirmed', 'Validated', 'Trial'] loop
    perform pg_temp.fails(format($$insert into public.enrollments(student_id, group_id, status, session_type, school_year, level)
      values (%L, %L, %L, 'Online', '2026/2027', 'A2')$$, pg_temp.id(217), pg_temp.id(305), s), '23514', 'online.capacity');
  end loop;
end $do$;
insert into public.enrollments(student_id, group_id, status, session_type, school_year, level)
  values (pg_temp.id(217), pg_temp.id(305), 'Rejected', 'Online', '2026/2027', 'A2');
select pg_temp.fails(format('update public.enrollments set group_id = %L where id = %L', pg_temp.id(305), pg_temp.id(603)), '23514', 'online.capacity');
select pg_temp.fails(format($$update public.enrollments set status = 'Submitted' where id = %L$$, pg_temp.id(604)), '23514', 'online.capacity');
-- Student-form placement: the 074 sync write of enrollments.group_id is refused; the row is unchanged.
select pg_temp.fails(format('update public.students set groupe_id = %L where id = %L', pg_temp.id(305), pg_temp.id(216)), '23514', 'online.capacity');
select pg_temp.owner();
select pg_temp.ok((select groupe_id from public.students where id = pg_temp.id(216)) is null
  and (select group_id from public.enrollments where id = pg_temp.id(605)) is null, 'student-form placement left everything unchanged');
-- Reception commands (096).
select pg_temp.act(3);
select pg_temp.fails(format($$select public.save_receptionist_enrollment(%L, null, %L, 'Submitted', 'A2', current_date, null, 'Online', '2026/2027')$$,
  pg_temp.id(218), pg_temp.id(305)), '23514', 'online.capacity');
select pg_temp.fails(format($$select public.assign_receptionist_student_group(%L, %L, %L, %L, %L)$$, pg_temp.id(213), pg_temp.id(603), pg_temp.id(305),
  (select updated_at from public.students where id = pg_temp.id(213)), (select updated_at from public.enrollments where id = pg_temp.id(603))), '23514', 'online.capacity');
-- The guest command counts enrolments plus guests.
select pg_temp.fails(format($$select public.online_add_guest(%L, %L, 'trial')$$, pg_temp.id(515), pg_temp.id(218)), '23514', 'online.capacity');
select pg_temp.owner();
-- Status-only transitions never evaluate capacity, even over capacity.
update public.online_courses set capacity = 1 where group_id = pg_temp.id(305);
select pg_temp.act(2);
update public.enrollments set status = 'Under Review' where id = pg_temp.id(601);
select pg_temp.act(1);
create temp table ol_paid as select public.create_charge_payment(jsonb_build_object('student_id', pg_temp.id(212),
  'enrollment_id', pg_temp.id(602), 'session_type', 'Online', 'school_year', '2026/2027', 'gross_amount', 1200,
  'payment_amount', 300, 'payment_method', 'Espèces', 'idempotency_key', pg_temp.id(699))) r;
select pg_temp.open_to_api('ol_paid');
select pg_temp.owner();
select pg_temp.ok((select status from public.enrollments where id = pg_temp.id(602)) = 'Validated', 'payment-driven confirmation passes over capacity');
select pg_temp.ok((select service_description from public.charges where id = (select (r->>'charge_id')::uuid from ol_paid)) = 'Online · 2026/2027',
  'finance text for an online charge (113, unchanged)');
select pg_temp.ok((select session_type from public.receipts where id = (select (r->>'receipt_id')::uuid from ol_paid)) = 'Online', 'receipt carries the online programme');
update public.online_courses set capacity = 2 where group_id = pg_temp.id(305);

-- ---------------------------------------------------------------------------
-- Receptionist learner-file path (B3, Q16 = A).
-- ---------------------------------------------------------------------------
select pg_temp.act(3);
select public.save_receptionist_student(pg_temp.id(220), null, '{"full_name":"Reception Online","session_type":"Online","niveau_cefr":"B1","email":"r220@example.test"}');
select pg_temp.ok((select session_type = 'Online' and niveau_cefr = 'B1' from public.students where id = pg_temp.id(220)), 'receptionist creates an Online learner');
select pg_temp.fails(format($$select public.save_receptionist_student(%L, null, '{"full_name":"Bad","session_type":"Online","niveau_cefr":"Child 1"}')$$, pg_temp.id(221)),
  '22023');
-- The 096 edit allowlist still excludes programme fields (management-only); an existing learner
-- moves to an online programme through enrolment, whose 070 sync carries programme and level.
select pg_temp.fails(format($$select public.save_receptionist_student(%L, %L, '{"session_type":"Online One-to-One"}')$$,
  pg_temp.id(209), (select updated_at from public.students where id = pg_temp.id(209))), '22023');
select public.save_receptionist_group(pg_temp.id(320), null, '{"name":"Reception Solo","session_type":"Online One-to-One","niveau":"C1"}');
select pg_temp.fails(format($$select public.save_receptionist_group(%L, null, '{"name":"Reception T","session_type":"Online","niveau":"B1","teacher_id":"%s"}')$$,
  pg_temp.id(321), pg_temp.id(101)), '23514', 'online.teacher_on_course');
select public.save_receptionist_group(pg_temp.id(322), null, '{"name":"Reception Group","session_type":"Online","niveau":"B1"}');
select pg_temp.ok((select teacher_id is null and session_type = 'Online' from public.groups where id = pg_temp.id(322)), 'receptionist creates an online group without a teacher');
create temp table ol_rec as select public.save_receptionist_enrollment(pg_temp.id(220), null, pg_temp.id(322), 'Submitted', 'B1',
  current_date, null, 'Online', '2026/2027') submitted;
select pg_temp.open_to_api('ol_rec');
select pg_temp.ok((select status from public.enrollments where id = (select submitted from ol_rec)) = 'Submitted', 'Submitted enrolment into the online group');
select public.save_receptionist_enrollment(pg_temp.id(222), null, pg_temp.id(320), 'Trial', 'C1', current_date, null, 'Online One-to-One', '2026/2027');
select pg_temp.owner();
select pg_temp.ok((select session_type = 'Online One-to-One' and niveau_cefr = 'C1' from public.students where id = pg_temp.id(222)),
  'existing learner moved to Online One-to-One with a CEFR level through enrolment');
update public.enrollments set status = 'Confirmed', group_id = null where id = (select submitted from ol_rec);
select pg_temp.act(3);
select public.save_receptionist_enrollment(pg_temp.id(220), (select submitted from ol_rec), pg_temp.id(322), 'Validated', 'B1',
  current_date, null, 'Online', '2026/2027');
select pg_temp.ok((select status = 'Validated' and group_id = pg_temp.id(322) from public.enrollments where id = (select submitted from ol_rec)),
  'Validated assignment of a Confirmed enrolment');
select pg_temp.fails(format($$select public.save_receptionist_enrollment(%L, null, null, 'Submitted', 'B1', current_date, null, 'Online Plus', '2026/2027')$$,
  pg_temp.id(220)), '22023');
select pg_temp.owner();

-- ---------------------------------------------------------------------------
-- CRM path (Q2 = C1): a qualified lead enrolled into an online group converts as before.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', pg_temp.id(1)::text, true);
create temp table ol_policy as select (public.crm_create_followup_policy(gen_random_uuid(),
  '{"weekly_hours":{"1":[["08:00","22:00"]],"2":[["08:00","22:00"]],"3":[["08:00","22:00"]],"4":[["08:00","22:00"]],"5":[["08:00","22:00"]],"6":[["08:00","22:00"]],"7":[["08:00","22:00"]]},"attempt_offsets":[0,0,1,3,5]}')->>'policy_id')::uuid id;
create temp sequence ol_n;
create function pg_temp.qualified_lead() returns uuid language plpgsql as $$ declare l uuid; n bigint := nextval('ol_n'); begin
  perform set_config('request.jwt.claim.sub', pg_temp.id(3)::text, true);
  l := (public.crm_create_manual_lead(gen_random_uuid(), jsonb_build_object('display_name', 'OL parent ' || n,
    'learner_name', 'OLn' || n || ' Learner', 'phone', '06' || lpad((71700000 + n)::text, 8, '0'), 'source_label', 'Manual'))->'lead'->>'id')::uuid;
  perform public.crm_qualify_lead(gen_random_uuid(), jsonb_build_object('lead_id', l, 'expected_version', (select version from public.crm_leads where id = l),
    'conversation_channel', 'phone', 'note', 'OL synthetic', 'qualification_step', 'placement_test',
    'next_task', jsonb_build_object('task_type', 'confirm_placement_test', 'due_at', now() + interval '2 days')));
  return l;
end $$;
create function pg_temp.crm_data(l uuid, session text, grp uuid) returns jsonb language sql security definer as $$
  select jsonb_build_object('lead_id', l, 'expected_version', x.version, 'student_choice', 'new', 'learner_name', x.learner_name,
    'candidate_review', crm_security.candidate_token(l, x.learner_name, null), 'session_type', session, 'school_year', '2026/2027',
    'group_id', grp) from public.crm_leads x where x.id = l
$$;
create temp table ol_crm as select pg_temp.qualified_lead() lead, pg_temp.qualified_lead() solo, pg_temp.qualified_lead() bad;
select pg_temp.open_to_api('ol_crm');
select pg_temp.act(3);
select public.crm_start_enrollment(gen_random_uuid(), pg_temp.crm_data((select lead from ol_crm), 'Online', pg_temp.id(310)));
select public.crm_start_enrollment(gen_random_uuid(), pg_temp.crm_data((select solo from ol_crm), 'Online One-to-One', pg_temp.id(311)));
select pg_temp.fails(format('select public.crm_start_enrollment(gen_random_uuid(), %L)', pg_temp.crm_data((select bad from ol_crm), 'Adults', pg_temp.id(310))),
  '22023', 'crm_enrollment.group_incompatible');
select pg_temp.fails(format('select public.crm_start_enrollment(gen_random_uuid(), %L)', pg_temp.crm_data((select bad from ol_crm), 'Online', pg_temp.id(307))),
  '22023', 'crm_enrollment.group_incompatible');
select pg_temp.fails(format('select public.crm_start_enrollment(gen_random_uuid(), %L)', pg_temp.crm_data((select bad from ol_crm), 'Online Plus', pg_temp.id(310))),
  '22023', 'crm_enrollment.program_invalid');
-- A full online group refuses the CRM path inside its own closed vocabulary (record_rejected).
select pg_temp.fails(format('select public.crm_start_enrollment(gen_random_uuid(), %L)', pg_temp.crm_data((select bad from ol_crm), 'Online', pg_temp.id(305))),
  '22023', 'crm_enrollment.record_rejected');
select pg_temp.owner();
select pg_temp.ok((select enrollment_id is null from public.crm_leads where id = (select bad from ol_crm)), 'refused CRM attempts wrote nothing');
select pg_temp.ok((select l.status = 'QUALIFIED' and e.group_id = pg_temp.id(310) and e.session_type = 'Online' and e.status = 'Submitted'
  from public.crm_leads l join public.enrollments e on e.id = l.enrollment_id where l.id = (select lead from ol_crm)),
  'lead linked to the online enrolment, still Qualified (Continuer l''inscription)');
select pg_temp.ok((select e.session_type = 'Online One-to-One' from public.crm_leads l join public.enrollments e on e.id = l.enrollment_id
  where l.id = (select solo from ol_crm)), 'one-to-one CRM enrolment');
update public.enrollments set status = 'Confirmed' where id = (select enrollment_id from public.crm_leads where id = (select lead from ol_crm));
select pg_temp.ok((select status from public.crm_leads where id = (select lead from ol_crm)) = 'CONVERTED'
  and exists (select 1 from public.crm_activities where lead_id = (select lead from ol_crm) and event_type = 'lead_converted'),
  'confirmation converts through the unchanged 084 path');

-- ---------------------------------------------------------------------------
-- Anonymous denial and the catalog boundary.
-- ---------------------------------------------------------------------------
select pg_temp.act(null);
do $$ declare f record; begin
  for f in select p.oid::regprocedure sig, p.pronargs from pg_proc p
      where p.pronamespace = 'public'::regnamespace and p.proname like 'online\_%' loop
    perform pg_temp.fails(format('select %s(%s)', split_part(f.sig::text, '(', 1),
      (select string_agg('null', ',') from generate_series(1, f.pronargs))), '42501');
  end loop;
end $$;
select pg_temp.fails('select count(*) from public.online_courses', '42501');
select pg_temp.fails('select count(*) from public.online_join_events', '42501');
select pg_temp.act(8);
select pg_temp.fails('insert into public.online_attendance(lesson_id, student_id, status, marked_by) values (gen_random_uuid(), gen_random_uuid(), ''Présent'', gen_random_uuid())', '42501');
select pg_temp.fails('update public.online_lessons set report = ''x''', '42501');
set local role service_role;
select pg_temp.fails('select count(*) from public.online_join_tokens', '42501');
select pg_temp.owner();
select pg_temp.ok(not exists (select 1 from pg_proc p where p.pronamespace = 'online_security'::regnamespace
  and (p.proacl is null or exists (select 1 from aclexplode(p.proacl) a where a.grantee <> p.proowner))), 'no API role executes a private helper');
select pg_temp.ok((select count(*) from pg_proc p, aclexplode(p.proacl) a where p.pronamespace = 'public'::regnamespace
  and p.proname like 'online\_%' and a.grantee = 'service_role'::regrole) = 2, 'two service-role-only functions');
select pg_temp.ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where (n.nspname = 'online_security' or (n.nspname = 'public' and p.proname like 'online\_%'))
    and (p.prosrc ilike '%prem' || 'ium%' or not p.proconfig @> array['search_path=pg_catalog, pg_temp'])),
  'online functions: fixed search path, no retired workshop reference');
select pg_temp.ok(not exists (select 1 from public.groups where session_type in ('Online', 'Online One-to-One') and teacher_id is not null),
  'no online group carries a group teacher');

rollback;
\echo 'PASS online learning SQL acceptance'
