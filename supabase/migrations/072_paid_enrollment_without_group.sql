-- A tuition payment confirms an enrollment before academic group placement.
-- Keep financial writes and academic linkage in the same RPC transaction.
begin;

alter table public.enrollments drop constraint if exists enrollments_status_check;
alter table public.enrollments add constraint enrollments_status_check
  check (status in ('Submitted','Under Review','Confirmed','Validated','Rejected','Trial'));
alter table public.enrollments
  add column session_type text,
  add column school_year text,
  add column level text;
alter table public.enrollments add constraint enrollments_school_year_format_check
  check (school_year is null or school_year ~ '^[0-9]{4}/[0-9]{4}$');
alter table public.enrollments add constraint enrollments_session_type_check
  check (session_type is null or session_type in
    ('Yearly','Adults','Summer Camp','Communication Junior','Communication Adult',
     'One-to-One','Mise à niveau','Other'));
create index enrollments_student_program_idx
  on public.enrollments (student_id, session_type, school_year);
alter table public.financial_requests add column requested_enrollment_id uuid;

create or replace function public.sync_student_from_enrollments(
  p_student uuid, p_force_downgrade boolean, p_previous_group uuid
) returns void language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_current public.students%rowtype;
  v_status text;
  v_group uuid;
  v_student_status text;
begin
  if p_student is null then return; end if;
  select * into v_current from public.students where id = p_student for update;
  if not found then return; end if;

  select e.status, e.group_id into v_status, v_group
  from public.enrollments e where e.student_id = p_student
  order by case e.status
    when 'Validated' then 0 when 'Trial' then 1 when 'Confirmed' then 2
    when 'Under Review' then 3 when 'Submitted' then 4 else 5 end,
    e.updated_at desc, e.created_at desc, e.id desc
  limit 1;

  v_student_status := case v_status
    when 'Validated' then 'Enrolled'
    when 'Confirmed' then 'Enrolled'
    when 'Trial' then 'Trial'
    when 'Rejected' then 'Inactive'
    else 'Prospect' end;
  if not p_force_downgrade and v_status not in ('Validated','Confirmed','Trial')
    and v_current.status in ('Enrolled','Trial','Alumni') then
    v_student_status := v_current.status;
  end if;

  update public.students s set
    status = v_student_status,
    groupe_id = case
      when v_status in ('Validated','Trial') then v_group
      when p_force_downgrade and s.groupe_id is not distinct from p_previous_group then null
      else s.groupe_id end
  where s.id = p_student
    and (s.status is distinct from v_student_status
      or s.groupe_id is distinct from case
        when v_status in ('Validated','Trial') then v_group
        when p_force_downgrade and s.groupe_id is not distinct from p_previous_group then null
        else s.groupe_id end);
end;
$$;

create or replace function public.enforce_enrollment_student_sync()
returns trigger language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_op in ('INSERT','UPDATE') then
    if new.student_id is null then
      raise exception 'Enrollment requires a student' using errcode = '23514';
    end if;
    if new.status in ('Validated','Trial') and new.group_id is null then
      raise exception 'Active enrollment requires a group' using errcode = '23514';
    end if;
    if tg_op = 'UPDATE' and new.student_id is distinct from old.student_id then
      raise exception 'Enrollment student is immutable' using errcode = '23514';
    end if;
  end if;
  if tg_op = 'DELETE' then
    perform public.sync_student_from_enrollments(old.student_id,
      old.status in ('Validated','Trial','Confirmed'), old.group_id);
    return old;
  end if;
  perform public.sync_student_from_enrollments(new.student_id,
    tg_op = 'UPDATE' and (
      (old.status in ('Validated','Trial','Confirmed')
        and new.status not in ('Validated','Trial','Confirmed'))
      or (old.status in ('Validated','Trial') and new.status = 'Confirmed')),
    case when tg_op = 'UPDATE' then old.group_id else null end);
  return new;
end;
$$;

-- Group assignment is the academic validation step. Existing Trial and
-- Validated enrollments still require a group, as before.
create or replace function public.check_enrollment_student_sync()
returns trigger language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_group_session text;
  v_group_level text;
begin
  if new.student_id is null then
    raise exception 'Enrollment requires a student' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and new.student_id is distinct from old.student_id then
    raise exception 'Enrollment student is immutable' using errcode = '23514';
  end if;
  if new.status = 'Confirmed' and new.group_id is not null then
    new.status := 'Validated';
  end if;
  if new.status in ('Validated','Trial') and new.group_id is null then
    raise exception 'Active enrollment requires a group' using errcode = '23514';
  end if;
  if new.group_id is not null and new.session_type is not null then
    select g.session_type, g.niveau into v_group_session, v_group_level
    from public.groups g where g.id = new.group_id;
    if found and (v_group_session is distinct from new.session_type
      or (new.level is not null and v_group_level is distinct from new.level)) then
      raise exception 'Enrollment group must match its session and level' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

-- Retain the existing receipt function as the inner financial transaction.
-- The public RPC now adds enrollment and its links before that transaction
-- commits; any error rolls back the student, charge and receipt as well.
alter function public.create_charge_payment(jsonb) rename to create_charge_payment_financial;
revoke execute on function public.create_charge_payment_financial(jsonb) from public, anon, authenticated;

create function public.create_charge_payment(p_payload jsonb)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_result jsonb;
  v_charge public.charges%rowtype;
  v_enrollment public.enrollments%rowtype;
  v_requested_id uuid := nullif(p_payload->>'enrollment_id','')::uuid;
  v_enrollment_id uuid;
  v_prior_request public.financial_requests%rowtype;
begin
  -- The inner function enforces staff authorization, payment validation and
  -- idempotency before the wrapper makes any academic changes.
  v_result := public.create_charge_payment_financial(p_payload);
  if coalesce((v_result->>'replayed')::boolean, false) then
    select * into v_prior_request from public.financial_requests
    where idempotency_key = (p_payload->>'idempotency_key')::uuid;
    if v_prior_request.requested_enrollment_id is distinct from v_requested_id then
      raise exception 'Idempotency key conflict: selected enrollment changed.';
    end if;
    return v_result;
  end if;
  update public.financial_requests set requested_enrollment_id = v_requested_id
  where idempotency_key = (p_payload->>'idempotency_key')::uuid;
  if (v_result->>'receipt_id') is null then
    return v_result;
  end if;

  select * into v_charge from public.charges
  where id = (v_result->>'charge_id')::uuid for update;
  if nullif(p_payload->>'student_id','') is null then
    update public.students set session_type = v_charge.session_type,
      niveau_cefr = coalesce(v_charge.level, niveau_cefr)
    where id = v_charge.student_id;
  end if;
  if v_charge.session_type = 'Other' or v_charge.legacy then
    if v_requested_id is not null then
      raise exception 'This service cannot be linked to a tuition enrollment.';
    end if;
    return v_result;
  end if;

  -- Lock the student across different charges in the same request period.
  perform 1 from public.students where id = v_charge.student_id for update;
  if v_charge.enrollment_id is not null and v_requested_id is not null
    and v_charge.enrollment_id <> v_requested_id then
    raise exception 'Charge is already linked to another enrollment.';
  end if;
  v_enrollment_id := coalesce(v_charge.enrollment_id, v_requested_id);

  if v_enrollment_id is not null then
    select * into v_enrollment from public.enrollments
    where id = v_enrollment_id for update;
    if not found or v_enrollment.student_id is distinct from v_charge.student_id
      or v_enrollment.status = 'Rejected'
      or (v_enrollment.session_type is not null
          and v_enrollment.session_type <> v_charge.session_type)
      or (v_enrollment.school_year is not null and v_charge.school_year is not null
          and v_enrollment.school_year <> v_charge.school_year) then
      raise exception 'Selected enrollment does not match this student, session and school year.';
    end if;
    update public.enrollments set
      session_type = v_charge.session_type,
      school_year = coalesce(v_charge.school_year, v_enrollment.school_year),
      level = coalesce(v_enrollment.level, v_charge.level),
      status = case
        when status in ('Submitted','Under Review') then
          case when group_id is null then 'Confirmed' else 'Validated' end
        when status = 'Trial' then 'Validated'
        else status end
    where id = v_enrollment_id;
  else
    insert into public.enrollments
      (student_id, status, date_inscription, session_type, school_year, level)
    values (v_charge.student_id, 'Confirmed', current_date,
            v_charge.session_type, v_charge.school_year, v_charge.level)
    returning id into v_enrollment_id;
  end if;

  update public.charges set enrollment_id = v_enrollment_id
  where id = v_charge.id and enrollment_id is distinct from v_enrollment_id;
  update public.receipts set enrollment_id = v_enrollment_id
  where id = (v_result->>'receipt_id')::uuid;
  select * into v_enrollment from public.enrollments where id = v_enrollment_id;
  return v_result || jsonb_build_object('enrollment_id', v_enrollment_id,
                                       'enrollment_confirmed', true,
                                       'group_pending', v_enrollment.group_id is null);
end;
$$;
revoke all on function public.create_charge_payment(jsonb) from public, anon;
grant execute on function public.create_charge_payment(jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;
