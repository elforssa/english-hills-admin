-- Structured school years and explicit receipt-email delivery for the
-- reception workflow. Historical charge descriptions remain untouched.
begin;

alter table public.charges
  add column if not exists school_year text;
alter table public.charges
  add constraint charges_school_year_format_check
  check (school_year is null or school_year ~ '^[0-9]{4}/[0-9]{4}$') not valid;
alter table public.charges validate constraint charges_school_year_format_check;

alter table public.receipts
  add column if not exists school_year_snapshot text;
alter table public.receipts
  add constraint receipts_school_year_snapshot_format_check
  check (school_year_snapshot is null or school_year_snapshot ~ '^[0-9]{4}/[0-9]{4}$') not valid;
alter table public.receipts validate constraint receipts_school_year_snapshot_format_check;

create or replace function public.create_charge_payment(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_student public.students%rowtype;
  v_charge public.charges%rowtype;
  v_receipt public.receipts%rowtype;
  v_existing public.financial_requests%rowtype;
  v_student_id uuid := nullif(p_payload->>'student_id','')::uuid;
  v_charge_id uuid := nullif(p_payload->>'charge_id','')::uuid;
  v_key uuid := (p_payload->>'idempotency_key')::uuid;
  v_session text := nullif(btrim(p_payload->>'session_type'),'');
  v_school_year text := nullif(btrim(p_payload->>'school_year'),'');
  v_service_detail text := nullif(btrim(p_payload->>'service_detail'),'');
  v_service text;
  v_plan text := nullif(btrim(p_payload->>'plan_type'),'');
  v_level text := nullif(btrim(p_payload->>'level'),'');
  v_student_name text := nullif(btrim(p_payload->>'student_name'),'');
  v_phone text := nullif(btrim(p_payload->>'phone'),'');
  v_student_email text := nullif(lower(btrim(p_payload->>'student_email')),'');
  v_parent_email text := nullif(lower(btrim(p_payload->>'parent_email')),'');
  v_update_contacts boolean := coalesce((p_payload->>'update_contacts')::boolean, false);
  v_request_email boolean := coalesce((p_payload->>'request_email')::boolean, false);
  v_email_recipient text := nullif(lower(btrim(p_payload->>'email_recipient')),'');
  v_gross numeric(12,2) := round(coalesce(nullif(p_payload->>'gross_amount','')::numeric, 0), 2);
  v_discount numeric(12,2) := round(coalesce(nullif(p_payload->>'discount_amount','')::numeric, 0), 2);
  v_payment numeric(12,2) := round(coalesce(nullif(p_payload->>'payment_amount','')::numeric, 0), 2);
  v_due_date date := nullif(p_payload->>'due_date','')::date;
  v_payment_date date := coalesce(nullif(p_payload->>'payment_date','')::date,current_date);
  v_payment_method text := nullif(btrim(p_payload->>'payment_method'),'');
  v_transaction_reference text := nullif(btrim(p_payload->>'transaction_reference'),'');
  v_note text := nullif(btrim(p_payload->>'note'),'');
  v_normalized_request jsonb;
  v_request_fingerprint text;
  v_paid numeric(12,2);
  v_net numeric(12,2);
  v_balance numeric(12,2);
  v_status text;
  v_actor_name text;
  v_new_charge boolean := false;
begin
  if v_actor is null or (public.get_my_role() in ('admin','director')) is not true then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if v_key is null then raise exception 'An idempotency key is required.'; end if;
  if v_payment < 0 then raise exception 'Payment amount cannot be negative.'; end if;
  if v_payment = 0 then
    v_request_email := false;
    v_email_recipient := null;
  end if;
  if v_request_email and (
    v_email_recipient is null
    or v_email_recipient !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ) then
    raise exception 'A valid email recipient is required when email delivery is requested.';
  end if;
  if v_charge_id is null and v_session <> 'Yearly' and v_plan <> 'Premium' then
    v_plan := null;
  end if;

  v_normalized_request := jsonb_strip_nulls(jsonb_build_object(
    'student_id',v_student_id,
    'student_name',case when v_student_id is null then v_student_name end,
    'phone',case when v_student_id is null or v_update_contacts then v_phone end,
    'student_email',case when v_student_id is null or v_update_contacts then v_student_email end,
    'parent_email',case when v_student_id is null or v_update_contacts then v_parent_email end,
    'update_contacts',case when v_student_id is not null then v_update_contacts else false end,
    'charge_id',v_charge_id,
    'session_type',case when v_charge_id is null then v_session end,
    'school_year',case when v_charge_id is null then v_school_year end,
    'service_detail',case when v_charge_id is null and v_session = 'Other' then v_service_detail end,
    'plan_type',case when v_charge_id is null then v_plan end,
    'level',case when v_charge_id is null then v_level end,
    'gross_amount',case when v_charge_id is null then v_gross end,
    'discount_amount',case when v_charge_id is null then v_discount end,
    'due_date',case when v_charge_id is null then v_due_date end,
    'payment_amount',v_payment,
    'payment_date',v_payment_date,
    'payment_method',v_payment_method,
    'transaction_reference',v_transaction_reference,
    'note',v_note,
    'request_email',v_request_email,
    'email_recipient',case when v_request_email then v_email_recipient end
  ));
  v_request_fingerprint := encode(extensions.digest(v_normalized_request::text, 'sha256'), 'hex');

  perform pg_advisory_xact_lock(hashtext(v_key::text));
  select * into v_existing from public.financial_requests where idempotency_key = v_key;
  if found then
    if v_existing.actor_id is distinct from v_actor then
      raise exception 'Idempotency key conflict: this key belongs to another actor.';
    end if;
    if v_existing.request_fingerprint is distinct from v_request_fingerprint then
      raise exception 'Idempotency key conflict: request contents changed.';
    end if;
    return jsonb_build_object('charge_id',v_existing.charge_id,'receipt_id',v_existing.receipt_id,'replayed',true);
  end if;

  if v_student_id is null then
    if char_length(coalesce(v_student_name,'')) < 2 then raise exception 'Student name is required.'; end if;
    insert into public.students(full_name, telephone, email, parent_email, status)
    values (v_student_name, v_phone, v_student_email, v_parent_email, 'Prospect')
    returning * into v_student;
    v_student_id := v_student.id;
  else
    select * into v_student from public.students where id = v_student_id and deleted_at is null;
    if not found then raise exception 'Student not found.'; end if;
    if v_update_contacts then
      update public.students set telephone=v_phone,email=v_student_email,parent_email=v_parent_email
      where id=v_student_id returning * into v_student;
    end if;
  end if;

  if v_charge_id is null then
    if v_session is null or v_school_year is null then
      raise exception 'Session and school year are required for a new charge.';
    end if;
    if v_school_year !~ '^[0-9]{4}/[0-9]{4}$' then raise exception 'Invalid school year.'; end if;
    if v_session = 'Yearly' and v_plan not in ('Standard','Premium') then
      raise exception 'A Yearly charge requires Standard or Premium.';
    elsif v_session <> 'Yearly' and v_plan = 'Premium' then
      raise exception 'Premium is available only for Yearly charges.';
    elsif v_session <> 'Yearly' then
      v_plan := null;
    end if;
    if v_session = 'Other' and char_length(coalesce(v_service_detail,'')) < 3 then
      raise exception 'A service description is required for Other.';
    end if;
    if char_length(coalesce(v_service_detail,'')) > 120 then raise exception 'Service description is too long.'; end if;
    if v_gross < 0 or v_discount < 0 or v_discount > v_gross then raise exception 'Invalid price or discount.'; end if;

    v_service := case
      when v_session = 'Other' then concat_ws(' · ', 'Autre', v_service_detail, v_school_year)
      when v_session = 'Yearly' then concat_ws(' · ', v_session, v_plan, v_school_year)
      else concat_ws(' · ', v_session, v_school_year)
    end;
    insert into public.charges(student_id,session_type,school_year,service_description,plan_type,
      level,gross_amount,discount_amount,due_date,created_by)
    values (v_student_id,v_session,v_school_year,v_service,v_plan,v_level,v_gross,v_discount,v_due_date,v_actor)
    returning * into v_charge;
    v_new_charge := true;
  else
    select * into v_charge from public.charges
    where id=v_charge_id and student_id=v_student_id and voided_at is null for update;
    if not found then raise exception 'Open charge not found for this student.'; end if;
  end if;

  v_net := v_charge.gross_amount - v_charge.discount_amount;
  select coalesce(sum(montant_paye),0) into v_paid from public.receipts
  where charge_id=v_charge.id and voided_at is null and deleted_at is null;
  v_balance := round(v_net-v_paid,2);
  if v_payment > v_balance then raise exception 'Payment exceeds the remaining balance of % MAD.', v_balance; end if;

  insert into public.financial_requests(idempotency_key,actor_id,request_fingerprint,charge_id)
  values (v_key,v_actor,v_request_fingerprint,v_charge.id);
  if v_new_charge then
    insert into public.financial_events(event_type,charge_id,actor_id,metadata)
    values ('charge_created',v_charge.id,v_actor,jsonb_build_object('gross_amount',v_charge.gross_amount,'discount_amount',v_charge.discount_amount,'school_year',v_charge.school_year));
  end if;
  if v_payment = 0 then
    return jsonb_build_object('charge_id',v_charge.id,'receipt_id',null,'balance',v_balance,'replayed',false);
  end if;

  v_balance := round(v_balance-v_payment,2);
  v_status := case when v_balance=0 then 'Soldé' when v_charge.due_date<current_date then 'En retard' else 'Acompte versé' end;
  select coalesce(full_name,email) into v_actor_name from public.profiles where id=v_actor;
  insert into public.receipts(
    student_id,charge_id,date,nom_prenom,telephone,email,date_naissance,
    session_type,plan_type,niveau,school_year_snapshot,service_description,montant_total,remise,
    montant_paye,mode_paiement,statut_paiement,transaction_reference,payment_note,observation,
    actor_id,actor_name,gross_amount_snapshot,discount_amount_snapshot,net_amount_snapshot,
    paid_before_snapshot,balance_after_snapshot,idempotency_key,email_delivery_status
  ) values (
    v_student.id,v_charge.id,v_payment_date,v_student.full_name,v_student.telephone,
    coalesce(v_email_recipient,v_student.parent_email,v_student.email),v_student.date_naissance,
    v_charge.session_type,v_charge.plan_type,v_charge.level,v_charge.school_year,v_charge.service_description,
    v_charge.gross_amount,case when v_charge.gross_amount=0 then 0 else round(v_charge.discount_amount*100/v_charge.gross_amount,2) end,
    v_payment,v_payment_method,v_status,v_transaction_reference,v_note,v_note,v_actor,v_actor_name,
    v_charge.gross_amount,v_charge.discount_amount,v_net,v_paid,v_balance,v_key,
    case when v_request_email then 'pending' else 'skipped' end
  ) returning * into v_receipt;
  update public.financial_requests set receipt_id=v_receipt.id where idempotency_key=v_key;
  insert into public.financial_events(event_type,charge_id,receipt_id,actor_id,metadata)
  values ('payment_recorded',v_charge.id,v_receipt.id,v_actor,jsonb_build_object('amount',v_payment,'balance_after',v_balance,'email_requested',v_request_email));
  return jsonb_build_object('charge_id',v_charge.id,'receipt_id',v_receipt.id,'balance',v_balance,'replayed',false);
end;
$$;

-- Only an explicit delivery request leaves a new receipt in pending state.
create or replace function public.handle_new_receipt()
returns trigger language plpgsql security definer set search_path=public,extensions as $$
declare edge_url text; auth_token text; request_id bigint;
begin
  if new.email_delivery_status <> 'pending' or new.email is null then return new; end if;
  select decrypted_secret into auth_token from vault.decrypted_secrets where name='receipt_webhook_token';
  select decrypted_secret into edge_url from vault.decrypted_secrets where name='receipt_webhook_url';
  if nullif(auth_token,'') is null or nullif(edge_url,'') is null then
    update public.receipts set email_delivery_status='failed',email_last_error='Receipt email webhook is not configured.' where id=new.id;
    return new;
  end if;
  select net.http_post(url=>edge_url,
    headers=>jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||auth_token),
    body=>jsonb_build_object('type','INSERT','table','receipts','schema','public','record',row_to_json(new))) into request_id;
  update public.receipts set email_delivery_status='queued',email_request_id=request_id,
    email_attempt_count=email_attempt_count+1,email_last_attempted_at=now(),email_last_error=null where id=new.id;
  return new;
exception when others then
  update public.receipts set email_delivery_status='failed',email_last_error=left(sqlerrm,500) where id=new.id;
  return new;
end $$;

notify pgrst, 'reload schema';
commit;
