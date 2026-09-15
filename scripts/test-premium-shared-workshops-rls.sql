-- Local-only RLS checks for shared Premium workshops. Always rolls back.

begin;

insert into public.teachers (id, full_name, email) values
  ('40000000-0000-0000-0000-000000000001', 'Assigned Premium Teacher', 'assigned-teacher@local.invalid'),
  ('40000000-0000-0000-0000-000000000002', 'Other Premium Teacher', 'other-teacher@local.invalid');

insert into public.students (
  id, full_name, email, parent_email, session_type, plan_type, niveau_cefr, premium_start_date, status
) values (
  '50000000-0000-0000-0000-000000000001', 'Visible Premium Learner', 'premium-learner@local.invalid',
  'premium-parent@local.invalid', 'Yearly', 'Premium', 'Child 3', current_date, 'Enrolled'
);

insert into public.premium_groups (id, name, teacher_id, weekday, start_time) values
  ('60000000-0000-0000-0000-000000000001', 'Visible Premium Workshop', '40000000-0000-0000-0000-000000000001', 6, '10:00'),
  ('60000000-0000-0000-0000-000000000002', 'Hidden Premium Workshop', '40000000-0000-0000-0000-000000000002', 6, '11:00');

insert into public.premium_group_memberships (premium_group_id, student_id, start_date)
values ('60000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', current_date);

insert into public.premium_sessions (
  id, premium_group_id, teacher_id, scheduled_date, start_time, status
) values (
  '70000000-0000-0000-0000-000000000001',
  '60000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  current_date + ((6 - extract(isodow from current_date)::integer + 7) % 7),
  '10:00', 'Scheduled'
);

insert into auth.users (id, email, raw_user_meta_data, created_at, updated_at) values
  ('10000000-0000-0000-0000-000000000001', 'assigned-teacher@local.invalid', '{}'::jsonb, now(), now()),
  ('20000000-0000-0000-0000-000000000001', 'premium-learner@local.invalid', '{}'::jsonb, now(), now()),
  ('30000000-0000-0000-0000-000000000001', 'premium-parent@local.invalid', '{}'::jsonb, now(), now());

insert into public.profiles (id, email, full_name, role, linked_teacher_id) values
  ('10000000-0000-0000-0000-000000000001', 'assigned-teacher@local.invalid', 'Assigned Premium Teacher', 'teacher', '40000000-0000-0000-0000-000000000001')
on conflict (id) do update set role = excluded.role, email = excluded.email, linked_teacher_id = excluded.linked_teacher_id;
insert into public.profiles (id, email, full_name, role, linked_student_id) values
  ('20000000-0000-0000-0000-000000000001', 'premium-learner@local.invalid', 'Visible Premium Learner', 'student', '50000000-0000-0000-0000-000000000001')
on conflict (id) do update set role = excluded.role, email = excluded.email, linked_student_id = excluded.linked_student_id;
insert into public.profiles (id, email, full_name, role) values
  ('30000000-0000-0000-0000-000000000001', 'premium-parent@local.invalid', 'Premium Parent', 'parent')
on conflict (id) do update set role = excluded.role, email = excluded.email;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
do $$ begin
  if not exists (select 1 from public.premium_groups where id = '60000000-0000-0000-0000-000000000001') then raise exception 'Teacher cannot see assigned workshop.'; end if;
  if exists (select 1 from public.premium_groups where id = '60000000-0000-0000-0000-000000000002') then raise exception 'Teacher can see another workshop.'; end if;
  if not exists (select 1 from public.students where id = '50000000-0000-0000-0000-000000000001') then raise exception 'Teacher cannot see workshop learner.'; end if;
  if not exists (select 1 from public.premium_sessions where id = '70000000-0000-0000-0000-000000000001') then raise exception 'Teacher cannot see assigned session.'; end if;
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
do $$ begin
  if not exists (select 1 from public.premium_groups where id = '60000000-0000-0000-0000-000000000001') then raise exception 'Learner cannot see own workshop.'; end if;
  if exists (select 1 from public.premium_groups where id = '60000000-0000-0000-0000-000000000002') then raise exception 'Learner can see another workshop.'; end if;
  if not exists (select 1 from public.premium_sessions where id = '70000000-0000-0000-0000-000000000001') then raise exception 'Learner cannot see own shared session.'; end if;
end $$;
insert into public.premium_homework_submissions (
  id, premium_session_id, student_id, teacher_id, title
) values (
  '80000000-0000-0000-0000-000000000001',
  '70000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  'Student shared-workshop preparation'
);

reset role;
-- Closing the membership must retain the session and homework for authorized
-- users when the class date remains within the membership period.
update public.premium_group_memberships
set active = false,
    end_date = current_date + ((6 - extract(isodow from current_date)::integer + 7) % 7)
where premium_group_id = '60000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"30000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
do $$ begin
  if not exists (select 1 from public.premium_groups where id = '60000000-0000-0000-0000-000000000001') then raise exception 'Parent cannot see child workshop.'; end if;
  if not exists (select 1 from public.premium_sessions where id = '70000000-0000-0000-0000-000000000001') then raise exception 'Parent cannot see child shared session.'; end if;
  if not exists (select 1 from public.premium_homework_submissions where id = '80000000-0000-0000-0000-000000000001') then raise exception 'Parent cannot see child homework.'; end if;
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
update public.premium_homework_submissions
set status = 'Prepared', teacher_note = 'Preparation ready'
where id = '80000000-0000-0000-0000-000000000001';
do $$ begin
  if not exists (
    select 1 from public.premium_homework_submissions
    where id = '80000000-0000-0000-0000-000000000001' and status = 'Prepared'
  ) then raise exception 'Teacher cannot prepare shared-workshop homework.'; end if;
end $$;

reset role;
rollback;

\echo 'PASS: teacher, learner, and parent Premium workshop RLS.'
