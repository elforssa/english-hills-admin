-- Batch E (plan PCR-r2, ADR-012), release E-2: payment corrections stay visible,
-- gap-free immutable receipt numbering, desk guardrails and Casablanca business
-- dates. The number 122 is provisional; it is allocated just before merge.
--
-- Re-created from their latest definitions (pg_get_functiondef at ledger 121),
-- changing only what the plan states; each definition lists its changes:
--   create_charge_payment (120), create_charge_payment_financial (113),
--   void_financial_receipt (055), delete_mistaken_receipt (076),
--   set_receipt_number (026), view charge_balances (057),
--   get_monthly_finance_summary and get_finance_year_months (055).
-- New: schema finance_security, finance_security.review_enrollment_without_live_payment,
--   finance_security.guard_receipt_number / guard_receipt_delete,
--   public.receipt_number_counters, public.business_date,
--   public.get_finance_review_queue, charges.discount_reason(_code),
--   financial_events type charge_terms_corrected (for data step D3).
-- Dropped: public.get_finance_summary(), public.get_unpaid_receipts(integer).
-- Conflicts raise PT409 (ADR-009); this file contains no other conflict code.
begin;

-- Numbering is seeded from issued numbers: no receipt may be inserted until commit.
lock table public.receipts in share row exclusive mode;

create schema if not exists finance_security;
revoke all on schema finance_security from public, anon, authenticated, service_role;

-- FIN-8/REL-7: the centre's business day, by zone name (never a fixed offset).
create or replace function public.business_date(p_at timestamptz default now())
returns date language sql stable
set search_path = pg_catalog, pg_temp
as $$ select (p_at at time zone 'Africa/Casablanca')::date $$;
revoke all on function public.business_date(timestamptz) from public;
-- anon keeps reading the security-invoker charge_balances view (0 rows) without an error.
grant execute on function public.business_date(timestamptz) to anon, authenticated, service_role;

-- P2.1: one counter row per series, no API privilege of any kind.
create table public.receipt_number_counters (
  series text primary key,
  last_value bigint not null check (last_value >= 0),
  updated_at timestamptz not null default now()
);
alter table public.receipt_number_counters enable row level security;
revoke all on table public.receipt_number_counters from public, anon, authenticated, service_role;
-- Seed: the greater of the last sequence value handed out and the largest issued
-- main-series suffix (computed, never hard-coded). The sequence stays, unused.
insert into public.receipt_number_counters(series, last_value)
select 'EH', greatest(
  (select case when is_called then last_value else last_value - 1 end from public.receipt_number_seq),
  coalesce((select max((substring(receipt_number from '^EH-[0-9]{4}-([0-9]+)$'))::bigint)
            from public.receipts), 0));
comment on sequence public.receipt_number_seq is
  'Retired by Batch E (PCR-r2): receipt numbers come from receipt_number_counters. Kept as a rollback aid.';

-- P2.2 (026 + E-2): a supplied number is refused; the number comes from the locked
-- counter row, held to commit, so a rollback gives it back; the year is the
-- Casablanca date of clock_timestamp() read after the counter update (Q7 = A);
-- the suffix keeps at least five digits and never truncates.
create or replace function public.set_receipt_number()
returns trigger language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $function$
declare v_next bigint;
begin
  if new.receipt_number is not null then
    raise exception 'Receipt numbers are assigned by the database.' using errcode = '22023';
  end if;
  update public.receipt_number_counters set last_value = last_value + 1, updated_at = now()
  where series = 'EH' returning last_value into v_next;
  if v_next is null then
    raise exception 'Receipt number counter is missing.' using errcode = '55000';
  end if;
  new.receipt_number := 'EH-' || to_char(public.business_date(clock_timestamp()), 'YYYY')
    || '-' || lpad(v_next::text, greatest(5, length(v_next::text)), '0');
  return new;
end
$function$;
revoke all on function public.set_receipt_number() from public, anon, authenticated, service_role;

-- P2.3: issued numbers never change; receipts are voided or soft-deleted, never
-- removed. The two narrow exceptions need a transaction-local setting AND a session
-- user that is a member of postgres (P2.3b): no API request can provide both.
create or replace function finance_security.guard_receipt_number()
returns trigger language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $function$
begin
  if new.receipt_number is not distinct from old.receipt_number then return new; end if;
  -- D1 (Q6 = B): number the historical import once, in its own series.
  if old.receipt_number is null
    and current_setting('english_hills.historical_receipt_numbering', true) = 'on'
    and pg_has_role(session_user, 'postgres', 'MEMBER')
    and new.receipt_number ~ '^EH-HIST-2026-[0-9]{4}$' then
    return new;
  end if;
  raise exception 'Receipt numbers cannot be changed.' using errcode = '42501';
end
$function$;

create or replace function finance_security.guard_receipt_delete()
returns trigger language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $function$
begin
  -- P2.3a: local test clean-up only; forbidden in Production.
  if current_setting('english_hills.receipt_test_cleanup', true) = 'on'
    and pg_has_role(session_user, 'postgres', 'MEMBER') then
    return case when tg_level = 'ROW' then old end;
  end if;
  raise exception 'Receipts are never deleted: void them instead.' using errcode = '42501';
end
$function$;
revoke all on function finance_security.guard_receipt_number() from public, anon, authenticated, service_role;
revoke all on function finance_security.guard_receipt_delete() from public, anon, authenticated, service_role;

create trigger receipts_number_immutable before update of receipt_number on public.receipts
  for each row execute function finance_security.guard_receipt_number();
create trigger receipts_no_hard_delete before delete on public.receipts
  for each row execute function finance_security.guard_receipt_delete();
create trigger receipts_no_truncate before truncate on public.receipts
  for each statement execute function finance_security.guard_receipt_delete();

-- P3.1 (Q2 = A): a reason for a new discount, required by the function, not by a
-- table constraint (existing discounted charges have none and stay voidable).
alter table public.charges
  add column discount_reason_code text,
  add column discount_reason text,
  add constraint charges_discount_reason_code_check check (discount_reason_code is null
    or discount_reason_code in ('sibling', 'former_student', 'promotion', 'director_approval', 'other')),
  add constraint charges_discount_reason_length check (discount_reason is null or char_length(discount_reason) <= 200);

-- P4 FIN-7 (Q8 = A): the event type data step D3 writes.
alter table public.financial_events drop constraint financial_events_event_type_check;
alter table public.financial_events add constraint financial_events_event_type_check check (event_type = any (array[
  'charge_created', 'charge_voided', 'payment_recorded', 'payment_voided', 'email_retry_queued', 'charge_terms_corrected']));

-- P1.2: called with the enrollment locked. When a Confirmed or Validated enrollment
-- has no live receipt left, flag its CONVERTED, unflagged, unmerged lead once and
-- report true. Never changes enrollment, learner or lead status.
create or replace function finance_security.review_enrollment_without_live_payment(
  p_enrollment uuid, p_source_key text, p_details jsonb)
returns boolean language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $function$
declare
  v_enrollment public.enrollments%rowtype;
  v_lead public.crm_leads%rowtype;
begin
  select * into v_enrollment from public.enrollments where id = p_enrollment;
  if not found or v_enrollment.status not in ('Confirmed', 'Validated') then return false; end if;
  if exists (select 1 from public.receipts r
    where r.voided_at is null and r.deleted_at is null
      and (r.enrollment_id = p_enrollment
        or r.charge_id in (select c.id from public.charges c where c.enrollment_id = p_enrollment))) then
    return false;
  end if;
  -- A lead already flagged, for any reason, is left alone: no second activity.
  for v_lead in select * from public.crm_leads
    where enrollment_id = p_enrollment and merged_into_lead_id is null
      and status = 'CONVERTED' and not conversion_review_required
    order by id for update
  loop
    insert into public.crm_activities(lead_id, enrollment_id, occurred_at, actor_id, actor_kind,
      event_type, source_key, body, details)
    values (v_lead.id, p_enrollment, clock_timestamp(), auth.uid(),
      case when auth.uid() is null then 'system' else 'user' end,
      'conversion_review_required', p_source_key,
      'Paiement annulé : l’inscription confirmée n’a plus de paiement actif. Vérification par la direction.',
      coalesce(p_details, '{}'::jsonb) || jsonb_build_object('reason', 'payment_voided', 'enrollment_status', v_enrollment.status));
    update public.crm_leads set conversion_review_required = true, version = version + 1, updated_at = now()
    where id = v_lead.id;
  end loop;
  return true;
end
$function$;
revoke all on function finance_security.review_enrollment_without_live_payment(uuid, text, jsonb)
  from public, anon, authenticated, service_role;

-- 055 + E-2 (P1.1, P1.3): locks in payment order before any write (shared
-- enrollment-intent lock, PT409 when a CRM linkage holds it; student; charge;
-- receipt; enrollment; lead last); after the void, the enrollment review (P1.2)
-- and its result in the payment_voided metadata. A replay of a voided receipt does nothing.
CREATE OR REPLACE FUNCTION public.void_financial_receipt(p_receipt_id uuid, p_reason text, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_receipt public.receipts%rowtype;
  v_charge public.charges%rowtype;
  v_student_id uuid;
  v_charge_id uuid;
  v_enrollment_id uuid;
  v_unpaid boolean := false;
begin
  if auth.uid() is null or public.get_my_role() is distinct from 'director' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if p_idempotency_key is null then raise exception 'An idempotency key is required.'; end if;
  if char_length(btrim(coalesce(p_reason,''))) < 3 then raise exception 'A correction reason is required.'; end if;
  perform pg_advisory_xact_lock(hashtext(p_idempotency_key::text));
  select student_id, charge_id into v_student_id, v_charge_id from public.receipts where id = p_receipt_id;
  if not found then raise exception 'Receipt not found.'; end if;
  if v_student_id is not null then
    if not pg_try_advisory_xact_lock_shared(hashtextextended('crm:enrollment-intent:'||v_student_id,0)) then
      raise exception 'Inscription ou paiement en cours. Actualisez les inscriptions puis réessayez.' using errcode='PT409';
    end if;
    perform 1 from public.students where id = v_student_id for update;
  end if;
  if v_charge_id is not null then
    select * into v_charge from public.charges where id = v_charge_id for update;
  end if;
  select * into v_receipt from public.receipts where id = p_receipt_id for update;
  if v_receipt.student_id is distinct from v_student_id or v_receipt.charge_id is distinct from v_charge_id then
    raise exception 'Le reçu a changé. Rechargez la page.';
  end if;
  if v_receipt.voided_at is not null then
    return jsonb_build_object('receipt_id',v_receipt.id,'already_voided',true);
  end if;
  update public.receipts set voided_at=now(), voided_by=auth.uid(), void_reason=btrim(p_reason),
    email_delivery_status='skipped'
  where id=p_receipt_id;
  v_enrollment_id := coalesce(v_receipt.enrollment_id, v_charge.enrollment_id);
  if v_student_id is not null and v_enrollment_id is not null then
    perform 1 from public.enrollments where id = v_enrollment_id for update;
    v_unpaid := finance_security.review_enrollment_without_live_payment(v_enrollment_id,
      'payment-void-review:'||p_receipt_id,
      jsonb_build_object('receipt_id',p_receipt_id,'action','void_financial_receipt'));
  end if;
  insert into public.financial_events(event_type,charge_id,receipt_id,actor_id,metadata)
  values ('payment_voided',v_receipt.charge_id,v_receipt.id,auth.uid(),
    jsonb_build_object('amount',v_receipt.montant_paye,'reason',btrim(p_reason))
    || case when v_unpaid then jsonb_build_object('enrollment_id',v_enrollment_id,'enrollment_without_live_payment',true)
       else '{}'::jsonb end);
  return jsonb_build_object('receipt_id',p_receipt_id,'charge_id',v_receipt.charge_id,'already_voided',false,
    'enrollment_without_live_payment',v_unpaid);
end;
$function$;

-- 076 + E-2 (P1.1, P1.3): the same lock order as a payment ahead of 076's own
-- charge-before-receipt order; after the receipt write, the enrollment review
-- (P1.2) and its result in the payment_voided metadata. A replay does nothing.
CREATE OR REPLACE FUNCTION public.delete_mistaken_receipt(p_receipt_id uuid, p_reason text, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_receipt public.receipts%rowtype;
  v_charge public.charges%rowtype;
  v_charge_id uuid;
  v_student_id uuid;
  v_enrollment_id uuid;
  v_unpaid boolean := false;
begin
  if auth.uid() is null or public.get_my_role() is distinct from 'director' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if p_idempotency_key is null then raise exception 'An idempotency key is required.'; end if;
  if char_length(btrim(coalesce(p_reason,''))) < 3 then raise exception 'Indiquez le motif de suppression.'; end if;
  perform pg_advisory_xact_lock(hashtext(p_idempotency_key::text));

  select charge_id, student_id into v_charge_id, v_student_id from public.receipts where id=p_receipt_id;
  if not found then raise exception 'Reçu introuvable.'; end if;
  -- A receipt without a learner (historical, unreconciled) skips the learner locks and the review.
  if v_student_id is not null then
    if not pg_try_advisory_xact_lock_shared(hashtextextended('crm:enrollment-intent:'||v_student_id,0)) then
      raise exception 'Inscription ou paiement en cours. Actualisez les inscriptions puis réessayez.' using errcode='PT409';
    end if;
    perform 1 from public.students where id = v_student_id for update;
  end if;
  -- Payments lock the charge before inserting a receipt. Use the same lock order
  -- so a concurrent installment cannot be silently cancelled or orphaned.
  if v_charge_id is not null then
    select * into v_charge from public.charges where id=v_charge_id for update;
  end if;
  select * into v_receipt from public.receipts where id=p_receipt_id for update;
  if v_receipt.charge_id is distinct from v_charge_id or v_receipt.student_id is distinct from v_student_id then
    raise exception 'Le reçu a changé. Rechargez la page.';
  end if;
  if v_receipt.deleted_at is not null and (v_charge_id is null or v_charge.voided_at is not null) then
    return jsonb_build_object('receipt_id',p_receipt_id,'already_deleted',true);
  end if;
  if exists (select 1 from public.receipts where charge_id=v_charge_id
    and id<>p_receipt_id and voided_at is null and deleted_at is null) then
    raise exception 'D’autres paiements actifs sont liés à cet engagement. Utilisez la correction du paiement uniquement.';
  end if;

  update public.receipts set deleted_at=coalesce(deleted_at,now()),
    voided_at=coalesce(voided_at,now()), voided_by=coalesce(voided_by,auth.uid()),
    void_reason=coalesce(void_reason,btrim(p_reason)), email_delivery_status='skipped'
  where id=p_receipt_id;
  v_enrollment_id := coalesce(v_receipt.enrollment_id, v_charge.enrollment_id);
  if v_student_id is not null and v_enrollment_id is not null then
    perform 1 from public.enrollments where id = v_enrollment_id for update;
    v_unpaid := finance_security.review_enrollment_without_live_payment(v_enrollment_id,
      'payment-void-review:'||p_receipt_id,
      jsonb_build_object('receipt_id',p_receipt_id,'action','delete_mistaken_receipt'));
  end if;
  insert into public.financial_events(event_type,charge_id,receipt_id,actor_id,metadata)
  values ('payment_voided',v_charge_id,p_receipt_id,auth.uid(),jsonb_build_object(
    'action','delete_mistaken_receipt','reason',btrim(p_reason),
    'idempotency_key',p_idempotency_key,'receipt_number',v_receipt.receipt_number,
    'amount',v_receipt.montant_paye,
    'removed_from_collected',case when v_receipt.voided_at is null and v_receipt.deleted_at is null then v_receipt.montant_paye else 0 end)
    || case when v_unpaid then jsonb_build_object('enrollment_id',v_enrollment_id,'enrollment_without_live_payment',true)
       else '{}'::jsonb end);
  if v_charge_id is not null and v_charge.voided_at is null then
    update public.charges set voided_at=now(),voided_by=auth.uid(),
      void_reason=btrim(p_reason),updated_at=now() where id=v_charge_id;
    insert into public.financial_events(event_type,charge_id,receipt_id,actor_id,metadata)
    values ('charge_voided',v_charge_id,p_receipt_id,auth.uid(),jsonb_build_object(
      'action','delete_mistaken_receipt','reason',btrim(p_reason),'idempotency_key',p_idempotency_key));
  end if;
  return jsonb_build_object('receipt_id',p_receipt_id,'charge_id',v_charge_id,'already_deleted',false,
    'enrollment_without_live_payment',v_unpaid);
end;
$function$;

-- 113 + E-2: guards P3.1–P3.3 after the idempotent replay (P3.6), so a committed
-- request always replays; the discount reason enters the fingerprint only when
-- present (pre-migration requests replay); reason copied to the charge and its
-- charge_created event; current_date replaced by public.business_date().
CREATE OR REPLACE FUNCTION public.create_charge_payment_financial(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
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
  v_receipt_service text;
  -- Replay compatibility only: the payload plan value, normalized exactly as
  -- migration 096 did, feeds the request fingerprint of a new Yearly charge so
  -- a request committed before 113 replays. It is never stored or validated.
  v_fingerprint_plan text := nullif(btrim(p_payload->>'plan_type'),'');
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
  v_payment_date date := coalesce(nullif(p_payload->>'payment_date','')::date,public.business_date());
  v_payment_method text := nullif(btrim(p_payload->>'payment_method'),'');
  v_transaction_reference text := nullif(btrim(p_payload->>'transaction_reference'),'');
  v_note text := nullif(btrim(p_payload->>'note'),'');
  v_reason_code text := nullif(btrim(p_payload->>'discount_reason_code'),'');
  v_reason text := nullif(btrim(p_payload->>'discount_reason'),'');
  v_role text;
  v_today date := public.business_date();
  v_back_days integer;
  v_normalized_request jsonb;
  v_request_fingerprint text;
  v_paid numeric(12,2);
  v_net numeric(12,2);
  v_balance numeric(12,2);
  v_status text;
  v_actor_name text;
  v_new_charge boolean := false;
begin
  perform operational_security.require_capability('manage_finance_operations');
  if v_key is null then raise exception 'An idempotency key is required.'; end if;
  if v_payment < 0 then raise exception 'Payment amount cannot be negative.'; end if;
  if v_payment = 0 then
    v_request_email := false;
    v_email_recipient := null;
  end if;
  if not v_request_email then v_email_recipient := null; end if;
  if v_request_email and (
    v_email_recipient is null
    or v_email_recipient !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ) then
    raise exception 'A valid email recipient is required when email delivery is requested.';
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
    'plan_type',case when v_charge_id is null and v_session = 'Yearly' then v_fingerprint_plan end,
    'level',case when v_charge_id is null then v_level end,
    'gross_amount',case when v_charge_id is null then v_gross end,
    'discount_amount',case when v_charge_id is null then v_discount end,
    'discount_reason_code',case when v_charge_id is null then v_reason_code end,
    'discount_reason',case when v_charge_id is null then v_reason end,
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

  -- E-2 desk guardrails (P3.1–P3.3), after the replay above. The role is the stored one.
  v_role := public.get_my_role();
  if v_charge_id is null and v_discount > 0 then
    -- Q2 = A: a reason from the short list; free text for "Autre".
    if v_reason_code is null then
      raise exception 'Indiquez le motif de la remise.' using errcode = '22023';
    end if;
    if v_reason_code not in ('sibling','former_student','promotion','director_approval','other') then
      raise exception 'Motif de remise inconnu.' using errcode = '22023';
    end if;
    if v_reason_code = 'other' and char_length(coalesce(v_reason,'')) < 3 then
      raise exception 'Précisez le motif de la remise « Autre ».' using errcode = '22023';
    end if;
    if char_length(coalesce(v_reason,'')) > 200 then
      raise exception 'Le motif de la remise ne doit pas dépasser 200 caractères.' using errcode = '22023';
    end if;
    -- Q3 = B: reception gives at most 10 % without the director.
    if v_role = 'receptionist' and v_gross > 0 and v_discount > 0.10 * v_gross then
      raise exception 'Remise supérieure à 10 %% : demandez au directeur.' using errcode = '22023';
    end if;
  end if;
  if v_charge_id is not null or v_discount = 0 then
    -- A reason belongs to a new discount only.
    v_reason_code := null; v_reason := null;
  end if;
  if v_payment > 0 then
    -- Q4 = A: never in the future; reception 7 days back, admin and director 31.
    if v_payment_date > v_today then
      raise exception 'La date du paiement ne peut pas être dans le futur.' using errcode = '22023';
    end if;
    v_back_days := case when v_role = 'receptionist' then 7 else 31 end;
    if v_payment_date < v_today - v_back_days then
      raise exception 'La date du paiement ne peut pas être antérieure de plus de % jours.', v_back_days
        using errcode = '22023';
    end if;
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
      if public.get_my_role()='receptionist' and
        (v_student_email is distinct from v_student.email or v_parent_email is distinct from v_student.parent_email) then
        raise exception 'Contact identity cannot be changed' using errcode='42501';
      end if;
      update public.students set telephone=v_phone,email=v_student_email,parent_email=v_parent_email
      where id=v_student_id returning * into v_student;
    end if;
  end if;

  if v_charge_id is null then
    if v_session is null or v_school_year is null then
      raise exception 'Session and school year are required for a new charge.';
    end if;
    if v_school_year !~ '^[0-9]{4}/[0-9]{4}$' then raise exception 'Invalid school year.'; end if;
    if v_session = 'Other' and char_length(coalesce(v_service_detail,'')) < 3 then
      raise exception 'A service description is required for Other.';
    end if;
    if char_length(coalesce(v_service_detail,'')) > 120 then raise exception 'Service description is too long.'; end if;
    if v_gross < 0 or v_discount < 0 or v_discount > v_gross then raise exception 'Invalid price or discount.'; end if;

    v_service := case
      when v_session = 'Other' then concat_ws(' · ', 'Autre', v_service_detail, v_school_year)
      else concat_ws(' · ', v_session, v_school_year)
    end;
    insert into public.charges(student_id,session_type,school_year,service_description,plan_type,
      level,gross_amount,discount_amount,due_date,created_by,discount_reason_code,discount_reason)
    -- charges_yearly_formula_check still requires a value for Yearly; it is a
    -- fixed, inert server value that no screen reads.
    values (v_student_id,v_session,v_school_year,v_service,
      case when v_session = 'Yearly' then 'Standard' end,
      v_level,v_gross,v_discount,v_due_date,v_actor,v_reason_code,v_reason)
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
    values ('charge_created',v_charge.id,v_actor,jsonb_build_object('gross_amount',v_charge.gross_amount,'discount_amount',v_charge.discount_amount,'school_year',v_charge.school_year)
      || jsonb_strip_nulls(jsonb_build_object('discount_reason_code',v_charge.discount_reason_code,'discount_reason',v_charge.discount_reason)));
  end if;
  if v_payment = 0 then
    return jsonb_build_object('charge_id',v_charge.id,'receipt_id',null,'balance',v_balance,'replayed',false);
  end if;

  v_balance := round(v_balance-v_payment,2);
  v_status := case when v_balance=0 then 'Soldé' when v_charge.due_date<v_today then 'En retard' else 'Acompte versé' end;
  select coalesce(full_name,email) into v_actor_name from public.profiles where id=v_actor;
  -- A receipt on a dated non-legacy Yearly charge gets its text from session
  -- type and school year, never from the charge text; every other charge
  -- (undated Yearly, legacy balance, other sessions) keeps copying its own
  -- text. Receipts never store a plan.
  v_receipt_service := case
    when v_charge.session_type = 'Yearly' and not v_charge.legacy and v_charge.school_year is not null
      then concat_ws(' · ', 'Yearly', v_charge.school_year)
    else v_charge.service_description
  end;
  insert into public.receipts(
    student_id,charge_id,date,nom_prenom,telephone,email,date_naissance,
    session_type,plan_type,niveau,school_year_snapshot,service_description,montant_total,remise,
    montant_paye,mode_paiement,statut_paiement,transaction_reference,payment_note,observation,
    actor_id,actor_name,gross_amount_snapshot,discount_amount_snapshot,net_amount_snapshot,
    paid_before_snapshot,balance_after_snapshot,idempotency_key,email_delivery_status
  ) values (
    v_student.id,v_charge.id,v_payment_date,v_student.full_name,v_student.telephone,
    coalesce(v_email_recipient,v_student.parent_email,v_student.email),v_student.date_naissance,
    v_charge.session_type,null,v_charge.level,v_charge.school_year,v_receipt_service,
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
$function$;

-- 120 + E-2: the checks keep their order and stay after the inner call (P2.4);
-- P3.4 (Q5 = B 10 %): below the threshold a reception payment leaves a linked
-- Submitted/Under Review/Trial enrollment as it is and creates a new one as
-- Under Review (enrollment_confirmation_pending); P1.4 (Q1 = B): after the
-- enrollment lock and the receipt link, a flag raised only by payment
-- cancellations is cleared on its linked leads (locked last); current_date
-- replaced by public.business_date().
CREATE OR REPLACE FUNCTION public.create_charge_payment(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare
  v_result jsonb;
  v_charge public.charges%rowtype;
  v_enrollment public.enrollments%rowtype;
  v_requested_id uuid := nullif(p_payload->>'enrollment_id','')::uuid;
  v_enrollment_id uuid;
  v_prior_request public.financial_requests%rowtype;
  v_crm_matches integer;
  v_matches uuid[];
  v_year text;
  v_constraint text;
  v_confirmation_pending boolean := false;
  v_paid numeric(12,2);
  v_lead public.crm_leads%rowtype;
  v_last_clear timestamptz;
begin
  -- Same staff boundary as the inner financial command; never trust caller roles.
  perform operational_security.require_capability('manage_finance_operations');
  -- Payments share this lock with other payments, preserving the existing
  -- financial idempotency/charge serialization. CRM linkage takes it exclusively.
  if nullif(p_payload->>'student_id','') is not null and not pg_try_advisory_xact_lock_shared(
    hashtextextended('crm:enrollment-intent:'||(p_payload->>'student_id')::uuid,0)) then
    raise exception 'Inscription ou paiement en cours. Actualisez les inscriptions puis réessayez.' using errcode='PT409';
  end if;
  -- Lock before inner charge/receipt foreign-key reads to avoid lock upgrades
  -- between simultaneous payments for the same student. Existing locks remain.
  perform 1 from public.students where id=nullif(p_payload->>'student_id','')::uuid for update;
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
  -- EGC (D3-A, FIN-10): a receipt no longer sets the learner's status; an Other
  -- or legacy receipt changes none, a tuition receipt confirms an enrollment.
  if v_charge.session_type = 'Other' or v_charge.legacy then
    if v_requested_id is not null then
      raise exception 'This service cannot be linked to a tuition enrollment.';
    end if;
    return v_result || jsonb_build_object('student_enrolled', false);
  end if;

  -- Lock the student across different charges in the same request period.
  perform 1 from public.students where id = v_charge.student_id for update;
  if v_charge.enrollment_id is not null and v_requested_id is not null
    and v_charge.enrollment_id <> v_requested_id then
    raise exception 'Charge is already linked to another enrollment.';
  end if;
  v_enrollment_id := coalesce(v_charge.enrollment_id, v_requested_id);

  if v_enrollment_id is null then
    -- Guard only the implicit tuition-enrollment creation branch. Explicit charge
    -- or request links retain 074 validation. Exceptions roll back the entire
    -- inner financial transaction, including receipt/event/student side effects.
    select count(*) into v_crm_matches
    from public.crm_leads l join public.enrollments e on e.id=l.enrollment_id
    join public.students s on s.id=e.student_id
    where e.student_id=v_charge.student_id and s.deleted_at is null
      and e.status is distinct from 'Rejected' and e.status is distinct from 'Ended' and l.merged_into_lead_id is null
      and coalesce(e.session_type,s.session_type)=v_charge.session_type
      -- Unknown year on an old charge cannot establish a distinct intent.
      and (v_charge.school_year is null or crm_security.enrollment_year(e)=v_charge.school_year);
    if v_crm_matches>0 then
      raise exception '%',case when v_crm_matches=1
        then 'Une inscription CRM existe pour ce programme et cette année. Sélectionnez-la avant d’enregistrer le paiement.'
        else 'Plusieurs inscriptions CRM correspondent. Sélectionnez explicitement l’inscription à payer.' end
        using errcode='22023';
    end if;
    -- EGC (D-5, I3): reuse the learner's single active enrollment of this
    -- programme and year that is not CRM-linked. An undated (pre-057) charge
    -- matches an undated enrollment or one of the current school year, which
    -- the new or confirmed enrollment receives (I9).
    v_year := coalesce(v_charge.school_year, academic_security.school_year_on(academic_security.today()));
    select array_agg(e.id order by e.id) into v_matches from public.enrollments e
    where e.student_id = v_charge.student_id and e.session_type = v_charge.session_type
      and e.status in ('Submitted','Under Review','Confirmed','Validated','Trial')
      and (e.school_year = v_charge.school_year
        or (v_charge.school_year is null and (e.school_year is null or e.school_year = v_year)))
      and not exists (select 1 from public.crm_leads l where l.enrollment_id = e.id);
    if cardinality(v_matches) > 1 then
      raise exception 'Plusieurs inscriptions correspondent. Sélectionnez l’inscription à payer.' using errcode='22023';
    end if;
    v_enrollment_id := v_matches[1];
  end if;

  -- E-2 (P3.4, Q5 = B 10 %): a reception payment confirms only when the live
  -- payments on this charge, this one included, reach 10 % of its net price.
  if public.get_my_role() = 'receptionist' then
    select coalesce(sum(montant_paye),0) into v_paid from public.receipts
    where charge_id = v_charge.id and voided_at is null and deleted_at is null;
    v_confirmation_pending := v_paid < 0.10 * (v_charge.gross_amount - v_charge.discount_amount);
  end if;

  begin
  if v_enrollment_id is not null then
    select * into v_enrollment from public.enrollments
    where id = v_enrollment_id for update;
    if not found or v_enrollment.student_id is distinct from v_charge.student_id
      or v_enrollment.status = 'Rejected'
      -- An ended enrollment only takes payments on its own charge (an old balance).
      or (v_enrollment.status = 'Ended' and v_charge.enrollment_id is distinct from v_enrollment.id)
      or (v_enrollment.session_type is not null
          and v_enrollment.session_type <> v_charge.session_type)
      or (v_enrollment.school_year is not null and v_charge.school_year is not null
          and v_enrollment.school_year <> v_charge.school_year) then
      raise exception 'Selected enrollment does not match this student, session and school year.';
    end if;
    if v_enrollment.status is distinct from 'Ended' then
      update public.enrollments set
        session_type = v_charge.session_type,
        school_year = coalesce(v_charge.school_year, v_enrollment.school_year, crm_security.enrollment_year(v_enrollment)),
        level = coalesce(v_enrollment.level, v_charge.level),
        status = case
          when v_confirmation_pending then status
          when status in ('Submitted','Under Review') then
            case when group_id is null then 'Confirmed' else 'Validated' end
          when status = 'Trial' then 'Validated'
          else status end
      where id = v_enrollment_id;
    end if;
  else
    insert into public.enrollments
      (student_id, status, date_inscription, session_type, school_year, level)
    values (v_charge.student_id, case when v_confirmation_pending then 'Under Review' else 'Confirmed' end,
            public.business_date(), v_charge.session_type, v_year, v_charge.level)
    returning id into v_enrollment_id;
  end if;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'enrollments_one_active_programme_year' then perform academic_security.duplicate(); end if;
    raise;
  end;

  update public.charges set enrollment_id = v_enrollment_id
  where id = v_charge.id and enrollment_id is distinct from v_enrollment_id;
  update public.receipts set enrollment_id = v_enrollment_id
  where id = (v_result->>'receipt_id')::uuid;
  select * into v_enrollment from public.enrollments where id = v_enrollment_id;

  -- E-2 (P1.4, Q1 = B): this payment is live and linked; clear a review flag only
  -- when every review since the last clear came from a payment cancellation and
  -- the conversion was not from LOST/NOT_QUALIFIED. Leads are locked last.
  if v_enrollment.status in ('Confirmed','Validated') then
    for v_lead in select * from public.crm_leads
      where enrollment_id = v_enrollment_id and merged_into_lead_id is null and conversion_review_required
      order by id for update
    loop
      select max(occurred_at) into v_last_clear from public.crm_activities
      where lead_id = v_lead.id and event_type = 'conversion_review_cleared';
      if exists (select 1 from public.crm_activities a where a.lead_id = v_lead.id
          and a.event_type = 'conversion_review_required' and (v_last_clear is null or a.occurred_at > v_last_clear))
        and not exists (select 1 from public.crm_activities a where a.lead_id = v_lead.id
          and a.event_type = 'conversion_review_required' and (v_last_clear is null or a.occurred_at > v_last_clear)
          and a.details->>'reason' is distinct from 'payment_voided')
        and not exists (select 1 from public.crm_activities c where c.id = v_lead.conversion_activity_id
          and c.from_status in ('LOST','NOT_QUALIFIED')) then
        insert into public.crm_activities(lead_id, enrollment_id, receipt_id, occurred_at, actor_id, actor_kind,
          event_type, source_key, body, details)
        values (v_lead.id, v_enrollment_id, (v_result->>'receipt_id')::uuid, clock_timestamp(), auth.uid(),
          case when auth.uid() is null then 'system' else 'user' end, 'conversion_review_cleared',
          'payment-review-cleared:'||(v_result->>'receipt_id'),
          'Paiement de remplacement enregistré : vérification levée.',
          jsonb_build_object('receipt_id', v_result->>'receipt_id'));
        update public.crm_leads set conversion_review_required = false, version = version + 1, updated_at = now()
        where id = v_lead.id;
      end if;
    end loop;
  end if;

  return v_result || jsonb_build_object('enrollment_id', v_enrollment_id,
                                       'enrollment_confirmed', v_enrollment.status in ('Confirmed','Validated'),
                                       'enrollment_confirmation_pending', v_confirmation_pending
                                         and v_enrollment.status in ('Submitted','Under Review','Trial'),
                                       'group_pending', v_enrollment.status = 'Confirmed' and v_enrollment.group_id is null,
                                       'student_enrolled', v_enrollment.status in ('Confirmed','Validated'));
end;
$function$;

-- 057 + E-2: "En retard" against the Casablanca business date; same columns and order.
create or replace view public.charge_balances with (security_invoker = true) as
 SELECT c.id,
    c.created_at,
    c.updated_at,
    c.student_id,
    c.enrollment_id,
    c.session_type,
    c.service_description,
    c.plan_type,
    c.level,
    c.gross_amount,
    c.discount_amount,
    c.due_date,
    c.created_by,
    c.legacy,
    c.legacy_receipt_id,
    c.voided_at,
    c.voided_by,
    c.void_reason,
    (c.gross_amount - c.discount_amount)::numeric(12,2) AS net_amount,
    COALESCE(sum(r.montant_paye) FILTER (WHERE r.voided_at IS NULL AND r.deleted_at IS NULL), 0::numeric)::numeric(12,2) AS paid_amount,
    GREATEST(0::numeric, c.gross_amount - c.discount_amount - COALESCE(sum(r.montant_paye) FILTER (WHERE r.voided_at IS NULL AND r.deleted_at IS NULL), 0::numeric))::numeric(12,2) AS balance,
        CASE
            WHEN c.voided_at IS NOT NULL THEN 'Annulée'::text
            WHEN (c.gross_amount - c.discount_amount - COALESCE(sum(r.montant_paye) FILTER (WHERE r.voided_at IS NULL AND r.deleted_at IS NULL), 0::numeric)) <= 0::numeric THEN 'Soldé'::text
            WHEN c.due_date < public.business_date() THEN 'En retard'::text
            WHEN COALESCE(sum(r.montant_paye) FILTER (WHERE r.voided_at IS NULL AND r.deleted_at IS NULL), 0::numeric) > 0::numeric THEN 'Acompte versé'::text
            ELSE 'En attente'::text
        END AS settlement_status,
    c.school_year
   FROM charges c
     LEFT JOIN receipts r ON r.charge_id = c.id
  GROUP BY c.id;

-- 055 + E-2: charges are counted in the Casablanca month of their creation.
CREATE OR REPLACE FUNCTION public.get_monthly_finance_summary(p_month_start date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare result jsonb;
begin
  perform public.require_finance_staff();
  select jsonb_build_object(
    'encaisse',coalesce((select sum(montant_paye) from receipts where voided_at is null and deleted_at is null and date>=p_month_start and date<(p_month_start+interval '1 month')::date),0),
    'total',coalesce((select sum(net_amount) from charge_balances where voided_at is null and public.business_date(created_at)>=p_month_start and public.business_date(created_at)<(p_month_start+interval '1 month')::date),0),
    'restant',coalesce((select sum(balance) from charge_balances where voided_at is null and public.business_date(created_at)>=p_month_start and public.business_date(created_at)<(p_month_start+interval '1 month')::date),0),
    'count',coalesce((select count(*) from receipts where voided_at is null and deleted_at is null and date>=p_month_start and date<(p_month_start+interval '1 month')::date),0)
  ) into result;
  return result;
end
$function$;

-- 055 + E-2: charges are counted in the Casablanca month and year of their creation.
CREATE OR REPLACE FUNCTION public.get_finance_year_months(p_year integer)
 RETURNS TABLE(month_idx integer, encaisse numeric, facture numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  perform public.require_finance_staff();
  return query
  with months as (select generate_series(0,11)::int month_idx),
  paid as (select extract(month from date)::int-1 month_idx,sum(montant_paye) encaisse from receipts where voided_at is null and deleted_at is null and extract(year from date)=p_year group by 1),
  billed as (select extract(month from public.business_date(created_at))::int-1 month_idx,sum(gross_amount-discount_amount) facture from charges where voided_at is null and extract(year from public.business_date(created_at))=p_year group by 1)
  select m.month_idx,coalesce(p.encaisse,0),coalesce(b.facture,0) from months m left join paid p using(month_idx) left join billed b using(month_idx)
  order by m.month_idx;
end
$function$;

-- P1.6: the director's review list. Section (a) is always current; (b)–(d) cover
-- the period from p_since (default 30 days). Each section is capped at 200 rows.
create or replace function public.get_finance_review_queue(p_since date default null)
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, pg_temp
as $function$
declare v_since date := coalesce(p_since, public.business_date() - 30);
begin
  if auth.uid() is null or public.get_my_role() is distinct from 'director' then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'since', v_since,
    -- (a) Confirmed or Validated enrollments that had a receipt and have no live one.
    'unpaid_confirmed', coalesce((select jsonb_agg(row_data order by row_data->>'learner_name', row_data->>'enrollment_id') from (
      select jsonb_build_object('enrollment_id', e.id, 'student_id', s.id, 'learner_name', s.full_name,
        'learner_archived', s.deleted_at is not null, 'learner_status', s.status, 'enrollment_status', e.status,
        'session_type', e.session_type, 'school_year', e.school_year,
        'lead_status', l.status, 'lead_review_required', l.conversion_review_required) row_data
      from public.enrollments e join public.students s on s.id = e.student_id
      left join public.crm_leads l on l.enrollment_id = e.id and l.merged_into_lead_id is null
      where e.status in ('Confirmed','Validated')
        and exists (select 1 from public.receipts r where r.enrollment_id = e.id
          or r.charge_id in (select c.id from public.charges c where c.enrollment_id = e.id))
        and not exists (select 1 from public.receipts r where r.voided_at is null and r.deleted_at is null
          and (r.enrollment_id = e.id or r.charge_id in (select c.id from public.charges c where c.enrollment_id = e.id)))
      order by s.full_name, e.id limit 200) q), '[]'::jsonb),
    -- (b) New charges with a discount.
    'discounts', coalesce((select jsonb_agg(row_data order by row_data->>'created_on' desc, row_data->>'charge_id') from (
      select jsonb_build_object('charge_id', c.id, 'student_id', c.student_id, 'learner_name', s.full_name,
        'created_on', public.business_date(c.created_at), 'session_type', c.session_type,
        'gross_amount', c.gross_amount, 'discount_amount', c.discount_amount,
        'discount_percent', case when c.gross_amount > 0 then round(c.discount_amount * 100 / c.gross_amount, 1) end,
        'reason_code', c.discount_reason_code, 'reason', c.discount_reason, 'author_role', p.role,
        'voided', c.voided_at is not null) row_data
      from public.charges c join public.students s on s.id = c.student_id
      left join public.profiles p on p.id = c.created_by
      where not c.legacy and c.discount_amount > 0 and public.business_date(c.created_at) >= v_since
      order by c.created_at desc, c.id limit 200) q), '[]'::jsonb),
    -- (c) Receipts dated before their Casablanca issue date.
    'backdated', coalesce((select jsonb_agg(row_data order by row_data->>'issued_on' desc, row_data->>'receipt_id') from (
      select jsonb_build_object('receipt_id', r.id, 'receipt_number', r.receipt_number, 'student_id', r.student_id,
        'learner_name', r.nom_prenom, 'payment_date', r.date, 'issued_on', public.business_date(r.created_at),
        'days_back', public.business_date(r.created_at) - r.date, 'amount', r.montant_paye,
        'author_role', p.role, 'voided', r.voided_at is not null) row_data
      from public.receipts r left join public.profiles p on p.id = r.actor_id
      where r.date < public.business_date(r.created_at) and public.business_date(r.created_at) >= v_since
      order by r.created_at desc, r.id limit 200) q), '[]'::jsonb),
    -- (d) Enrollments left unconfirmed by a below-threshold reception payment (P3.4).
    'pending_confirmation', coalesce((select jsonb_agg(row_data order by row_data->>'last_payment_date' desc, row_data->>'enrollment_id') from (
      select jsonb_build_object('enrollment_id', e.id, 'student_id', s.id, 'learner_name', s.full_name,
        'enrollment_status', e.status, 'session_type', e.session_type, 'school_year', e.school_year,
        'paid', pay.paid, 'net', pay.net, 'last_payment_date', pay.last_date) row_data
      from public.enrollments e join public.students s on s.id = e.student_id
      cross join lateral (
        select sum(r.montant_paye) paid, max(r.date) last_date,
          (select sum(c.gross_amount - c.discount_amount) from public.charges c
            where c.enrollment_id = e.id and c.voided_at is null) net
        from public.receipts r
        where r.voided_at is null and r.deleted_at is null
          and (r.enrollment_id = e.id or r.charge_id in (select c.id from public.charges c where c.enrollment_id = e.id))) pay
      where e.status in ('Submitted','Under Review','Trial') and pay.paid > 0 and pay.last_date >= v_since
      order by pay.last_date desc, e.id limit 200) q), '[]'::jsonb));
end
$function$;
revoke all on function public.get_finance_review_queue(date) from public, anon;
grant execute on function public.get_finance_review_queue(date) to authenticated;

-- FIN-12: pre-charge formulas executable by anon, no caller.
drop function public.get_finance_summary();
drop function public.get_unpaid_receipts(integer);

commit;
