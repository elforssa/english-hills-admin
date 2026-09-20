begin;

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
  v_session text;
  v_level text;
begin
  if p_student is null or pg_trigger_depth() > 1 then return; end if;
  select * into v_current from public.students where id = p_student for update;
  if not found then return; end if;

  select e.status, e.group_id, e.session_type, e.level into v_status, v_group, v_session, v_level
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
    session_type = case when v_group is not null and v_status in ('Validated','Trial') then coalesce(v_session, s.session_type) else s.session_type end,
    niveau_cefr = case when v_group is not null and v_status in ('Validated','Trial') then coalesce(v_level, s.niveau_cefr) else s.niveau_cefr end,
    groupe_id = case
      when v_status in ('Validated','Trial') then v_group
      when p_force_downgrade and s.groupe_id is not distinct from p_previous_group then null
      else s.groupe_id end
  where s.id = p_student
    and (s.status is distinct from v_student_status
      or (v_group is not null and v_status in ('Validated','Trial') and (s.session_type is distinct from coalesce(v_session,s.session_type)
        or s.niveau_cefr is distinct from coalesce(v_level,s.niveau_cefr)))
      or s.groupe_id is distinct from case
        when v_status in ('Validated','Trial') then v_group
        when p_force_downgrade and s.groupe_id is not distinct from p_previous_group then null
        else s.groupe_id end);
end;
$$;


-- Direct dossier edits must keep the corresponding academic membership in sync.
-- Nested calls originate from enrollment synchronization and must not loop back.
create or replace function public.sync_enrollments_from_student()
returns trigger language plpgsql security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
  v_ids uuid[];
  v_session text;
  v_level text;
begin
  if pg_trigger_depth() > 1 then return new; end if;
  if new.groupe_id is not distinct from old.groupe_id
    and new.session_type is not distinct from old.session_type
    and new.niveau_cefr is not distinct from old.niveau_cefr then return new; end if;

  select array_agg(e.id) into v_ids from public.enrollments e
  where e.student_id = new.id and e.status in ('Confirmed','Validated','Trial')
    and old.groupe_id is not null and e.group_id = old.groupe_id;
  if v_ids is null and new.groupe_id is not null then
    select array_agg(e.id) into v_ids from public.enrollments e
    where e.student_id=new.id and e.status='Confirmed' and e.group_id is null
      and coalesce(e.session_type,old.session_type)=new.session_type;
  end if;
  if coalesce(array_length(v_ids,1),0) > 1 then
    raise exception 'Plusieurs inscriptions sont concernées. Modifiez chaque inscription depuis la fiche apprenant.' using errcode='23514';
  end if;
  if new.groupe_id is not null then
    select session_type,niveau into v_session,v_level from public.groups where id=new.groupe_id;
    if v_session is distinct from new.session_type or v_level is distinct from new.niveau_cefr then
      raise exception 'Le groupe doit correspondre à la session et au niveau.' using errcode='23514';
    end if;
  end if;
  if v_ids is not null then
    if exists(select 1 from public.enrollments where id=any(v_ids)
      and coalesce(session_type,old.session_type) is distinct from new.session_type) then
      raise exception 'Modifiez la session depuis son inscription dans la fiche apprenant.' using errcode='23514';
    end if;
    update public.enrollments set group_id=new.groupe_id,
      level=new.niveau_cefr,
      status=case when new.groupe_id is null then
        case when status='Trial' then 'Under Review' else 'Confirmed' end
        when status='Confirmed' then 'Validated' else status end
    where id=any(v_ids);
    if exists(select 1 from public.enrollments where id=any(v_ids) and status in ('Confirmed','Validated')) then
      new.status := 'Enrolled';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.sync_enrollments_from_student() from public,anon,authenticated;
drop trigger if exists student_enrollment_assignment_sync on public.students;
create trigger student_enrollment_assignment_sync before update of groupe_id,session_type,niveau_cefr on public.students
for each row execute function public.sync_enrollments_from_student();

-- Remove a membership (including secondary sessions) atomically, preserving
-- registration/payment records. RLS applies to every statement.
create or replace function public.remove_student_group(p_student uuid,p_group uuid)
returns void language plpgsql security invoker
set search_path = pg_catalog, pg_temp
as $$
begin
  perform 1 from public.students where id=p_student for update;
  update public.enrollments set group_id=null,
    status=case when status='Trial' then 'Under Review' else 'Confirmed' end
  where student_id=p_student and group_id=p_group and status in ('Validated','Trial');
  update public.students set groupe_id=null where id=p_student and groupe_id=p_group;
end;
$$;
revoke all on function public.remove_student_group(uuid,uuid) from public,anon;
grant execute on function public.remove_student_group(uuid,uuid) to authenticated;

create or replace function public.create_charge_payment(p_payload jsonb)
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
  -- Every newly issued receipt enrolls its student. Historical receipts and
  -- idempotent retries are not rewritten or used to reactivate archived records.
  update public.students set status = 'Enrolled' where id = v_charge.student_id;
  v_result := v_result || jsonb_build_object('student_enrolled', true);
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
