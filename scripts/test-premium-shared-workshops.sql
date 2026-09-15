-- Local-only regression checks for migration 054.
-- Run against local Supabase; the transaction always rolls back.

begin;

do $$
declare
  teacher_id uuid;
  workshop_id uuid;
  session_id uuid;
  learner_ids uuid[] := array[]::uuid[];
  learner_id uuid;
  standard_id uuid;
  adult_id uuid;
  outsider_id uuid;
  saturday date := current_date + ((6 - extract(isodow from current_date)::integer + 7) % 7);
  index integer;
begin
  insert into public.teachers (full_name, email)
  values ('Premium Test Teacher', 'premium-workshop-test@local.invalid')
  returning id into teacher_id;

  insert into public.premium_groups (name, teacher_id, weekday, start_time, target_size)
  values ('Mixed NIV Test', teacher_id, 6, '10:00', 5)
  returning id into workshop_id;

  -- Six learners are accepted even though the informational target is five;
  -- NIV 3 and NIV 4 coexist in the same workshop.
  for index in 1..6 loop
    insert into public.students (
      full_name, session_type, plan_type, niveau_cefr, premium_start_date, status
    ) values (
      'Premium Learner ' || index,
      'Yearly',
      'Premium',
      case when index <= 3 then 'Child 3' else 'Child 4' end,
      current_date,
      'Enrolled'
    ) returning id into learner_id;
    learner_ids := array_append(learner_ids, learner_id);
    insert into public.premium_group_memberships (premium_group_id, student_id, start_date)
    values (workshop_id, learner_id, current_date);
  end loop;

  if (select count(*) from public.premium_group_memberships where premium_group_id = workshop_id and active) <> 6 then
    raise exception 'Expected six active workshop members.';
  end if;

  insert into public.students (full_name, session_type, plan_type, premium_start_date)
  values ('Standard Test Learner', 'Yearly', 'Standard', current_date)
  returning id into standard_id;
  begin
    insert into public.premium_group_memberships (premium_group_id, student_id, start_date)
    values (workshop_id, standard_id, current_date);
    raise exception 'Standard learner membership should have failed.';
  exception when raise_exception then
    if sqlerrm = 'Standard learner membership should have failed.' then raise; end if;
  end;

  insert into public.students (full_name, session_type, plan_type, premium_start_date)
  values ('Adult Premium Test Learner', 'Adults', 'Premium', current_date)
  returning id into adult_id;
  begin
    insert into public.premium_group_memberships (premium_group_id, student_id, start_date)
    values (workshop_id, adult_id, current_date);
    raise exception 'Adult-session membership should have failed.';
  exception when raise_exception then
    if sqlerrm = 'Adult-session membership should have failed.' then raise; end if;
  end;

  begin
    insert into public.premium_group_memberships (premium_group_id, student_id, start_date)
    values (workshop_id, learner_ids[1], current_date);
    raise exception 'Duplicate active membership should have failed.';
  exception when unique_violation then null;
  end;

  insert into public.premium_sessions (
    premium_group_id, teacher_id, scheduled_date, start_time, duration_minutes, status
  ) values (workshop_id, teacher_id, saturday, '10:00', 60, 'Scheduled')
  returning id into session_id;

  begin
    insert into public.premium_sessions (
      premium_group_id, teacher_id, scheduled_date, start_time, duration_minutes, status
    ) values (workshop_id, teacher_id, saturday, '11:00', 60, 'Scheduled');
    raise exception 'Duplicate workshop week should have failed.';
  exception when unique_violation then null;
  end;

  insert into public.premium_homework_submissions (
    premium_session_id, student_id, teacher_id, title
  ) values
    (session_id, learner_ids[1], teacher_id, 'Learner one preparation'),
    (session_id, learner_ids[2], teacher_id, 'Learner two preparation');

  if (select count(*) from public.premium_homework_submissions where premium_session_id = session_id) <> 2 then
    raise exception 'Expected independent homework from two workshop members.';
  end if;

  insert into public.students (full_name, session_type, plan_type, premium_start_date)
  values ('Premium Outsider', 'Yearly', 'Premium', current_date)
  returning id into outsider_id;
  begin
    insert into public.premium_homework_submissions (
      premium_session_id, student_id, teacher_id, title
    ) values (session_id, outsider_id, teacher_id, 'Forbidden preparation');
    raise exception 'Non-member homework should have failed.';
  exception when raise_exception then
    if sqlerrm = 'Non-member homework should have failed.' then raise; end if;
  end;

  insert into public.premium_attendance (premium_session_id, student_id, status)
  values (session_id, learner_ids[1], 'Present');
  begin
    insert into public.premium_attendance (premium_session_id, student_id, status)
    values (session_id, outsider_id, 'Present');
    raise exception 'Non-roster attendance should have failed.';
  exception when raise_exception then
    if sqlerrm = 'Non-roster attendance should have failed.' then raise; end if;
  end;

  -- Closing a membership must retain the learner's session history.
  update public.premium_group_memberships
  set active = false, end_date = saturday
  where premium_group_id = workshop_id and student_id = learner_ids[1];
  update public.premium_attendance set status = 'Late'
  where premium_session_id = session_id and student_id = learner_ids[1];
  update public.premium_homework_submissions set title = 'Historical preparation retained'
  where premium_session_id = session_id and student_id = learner_ids[1];

  update public.students set plan_type = 'Standard' where id = learner_ids[2];
  if exists (
    select 1 from public.premium_group_memberships
    where student_id = learner_ids[2] and active
  ) then
    raise exception 'Plan downgrade did not close the active workshop membership.';
  end if;

  raise notice 'PASS: mixed NIV, six learners, eligibility, uniqueness, homework, attendance, retained history, and downgrade cleanup.';
end;
$$;

rollback;
