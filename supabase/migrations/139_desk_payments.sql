-- RWR-r5 PR C1 — one payment panel, one rule (M-C1, payments part).
-- Plan: docs/architecture/plans/receptionist-workflow.md §6.1, §7 (invariants 12
-- and 13), §8 (PR C1). OD-2 = A, OD-7 = A (owner approval of 2026-11-25).
--
-- PROVISIONAL NUMBER 139 (PR B1 holds 138): renumber at merge.
--
-- What it does:
--  * public.get_open_balances(student): every live charge of a learner with a
--    balance, linked to an enrollment or not, oldest first, read from
--    charge_balances (price − discount − live payments). Both payment screens read
--    it (invariant 12).
--  * public.find_duplicate_receipts(student, charge, amount, date): the §6.1 rule —
--    same learner, same amount, same day and same charge, or any receipt by the
--    same staff member for the same learner within 2 minutes. Both screens show
--    its rows in the in-app panel before saving.
--  * public.crm_enroll_and_collect re-created from its 127 body (unchanged
--    elsewhere): the payment may name an unlinked commitment of the learner
--    (« Encaisser sur cet engagement », payment.charge_id), and a new tuition
--    charge is refused when an unlinked live charge of the same programme and
--    year exists, unless « nouvelle session » is explicit (payment.new_session).
--    No second charge (NF-4).
--  * public.crm_reserve_without_payment (OD-2 = A, « Réserver sans paiement »): a
--    charge with a due date for the prospect's learner, linked to the prospect in
--    crm_charge_reservations, with no enrollment, no seat, no receipt and no
--    conversion. The prospect's next action becomes « Encaisser l'acompte » (an
--    enrolment action, due on the due date) through crm_security.set_next_action,
--    so migration 137's one-action index and deferred triggers apply unchanged.
--  * public.crm_charge_reservations: append-only link table, no API grant.
--  * crm_security.action_label re-created from its 136 body with one change: an
--    enrolment action whose instructions start with « Encaisser l'acompte » is
--    labelled so on the card, the drawer, the Tâches row and the calendar
--    (invariant 9); every other label is unchanged.
--  * Payment guards (section 7): a row trigger on receipts refuses any receipt on a
--    commitment reserved for a prospect that is still open, whatever the path (it is
--    collected only through « Inscrire et encaisser » on that prospect); and
--    public.create_charge_payment, re-created from its 127 body, refuses a new
--    tuition charge without a chosen enrollment next to a live unlinked commitment
--    of the same learner, programme and year (no second charge at « Encaisser »).
--
-- Unchanged: receipt numbering and immutability (ADR-012), the void flow
-- (director only, OD-7 = A), financial_requests idempotency, conversion only from a
-- paid or fully discounted enrollment (ADR-015), set_next_action and every other
-- function, grant and policy. No existing row is written.

-- ---------------------------------------------------------------------------
-- 0. Precondition: crm_enroll_and_collect and create_charge_payment are still the
--    127 bodies and action_label the 136 body this migration re-creates (plan stop
--    condition: a cumulative function that differs).
-- ---------------------------------------------------------------------------
do $$ begin
  if (select md5(prosrc) from pg_proc where oid = 'public.crm_enroll_and_collect(uuid,jsonb)'::regprocedure)
     is distinct from '84babfb6f1305fb2cab565bfdf9e5e07' then
    raise exception 'Migration 139: crm_enroll_and_collect differs from its 127 body; rebuild 139 on the live definition'
      using errcode = '55000';
  end if;
  if (select md5(prosrc) from pg_proc where oid = 'crm_security.action_label(public.crm_tasks)'::regprocedure)
     is distinct from 'fae61b36be35b068532fbd9e29dc10f2' then
    raise exception 'Migration 139: crm_security.action_label differs from its 136 body; rebuild 139 on the live definition'
      using errcode = '55000';
  end if;
  if (select md5(prosrc) from pg_proc where oid = 'public.create_charge_payment(jsonb)'::regprocedure)
     is distinct from '2263c8d7c1ba4b41f0c863c81b82edd8' then
    raise exception 'Migration 139: create_charge_payment differs from its 127 body; rebuild 139 on the live definition'
      using errcode = '55000';
  end if;
  if to_regclass('public.crm_tasks_one_open_per_lead') is null then
    raise exception 'Migration 139: needs migration 137 (one next action enforced)' using errcode = '55000';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Reservations: which prospect a charge without payment was reserved for.
-- ---------------------------------------------------------------------------
create table public.crm_charge_reservations (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.crm_leads(id) on delete restrict,
  charge_id uuid not null unique references public.charges(id) on delete restrict,
  student_id uuid not null references public.students(id) on delete restrict,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete restrict,
  request_key uuid not null
);
create index crm_charge_reservations_lead_idx on public.crm_charge_reservations(lead_id, created_at desc);
alter table public.crm_charge_reservations enable row level security;
revoke all on public.crm_charge_reservations from public, anon, authenticated, service_role;
comment on table public.crm_charge_reservations is
  'RWR-r5 C1 (OD-2 = A): a charge reserved without payment for a prospect. Append-only; written only by crm_reserve_without_payment.';

create function crm_security.charge_reservations_append_only() returns trigger
language plpgsql set search_path = pg_catalog, pg_temp as $$
begin
  raise exception 'Une réservation ne se modifie pas et ne se supprime pas.' using errcode = '42501', hint = 'eap.reservation_append_only';
end $$;
-- No crm_security function is API-executable (functions grant EXECUTE to PUBLIC by default).
revoke all on function crm_security.charge_reservations_append_only() from public, anon, authenticated, service_role;
create trigger crm_charge_reservations_append_only before update or delete on public.crm_charge_reservations
  for each row execute function crm_security.charge_reservations_append_only();

-- ---------------------------------------------------------------------------
-- 2. One read of a learner's open balances (invariant 12).
-- ---------------------------------------------------------------------------
create function public.get_open_balances(p_student uuid) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, pg_temp as $$
declare result jsonb;
begin
  perform operational_security.require_capability('manage_finance_operations');
  if p_student is null then raise exception 'Learner required' using errcode = '22023'; end if;
  -- The receptionist reads charges of learners that are not deleted (receptionist_charge_read).
  if not exists (select 1 from public.students where id = p_student and deleted_at is null) then
    return jsonb_build_object('student_id', p_student, 'rows', '[]'::jsonb, 'total_balance', 0);
  end if;
  select jsonb_build_object('student_id', p_student,
    'rows', coalesce(jsonb_agg(jsonb_build_object(
      'id', b.id, 'created_at', b.created_at, 'session_type', b.session_type, 'school_year', b.school_year,
      'level', b.level, 'service_description', b.service_description, 'gross_amount', b.gross_amount,
      'discount_amount', b.discount_amount, 'net_amount', b.net_amount, 'paid_amount', b.paid_amount,
      'balance', b.balance, 'due_date', b.due_date, 'settlement_status', b.settlement_status, 'legacy', b.legacy,
      'enrollment_id', b.enrollment_id, 'enrollment_status', e.status, 'enrollment_group_id', e.group_id,
      'reserved_lead_id', l.id) order by b.created_at, b.id), '[]'::jsonb),
    'total_balance', coalesce(sum(b.balance), 0))
  into result
  from public.charge_balances b
  left join public.enrollments e on e.id = b.enrollment_id
  left join public.crm_charge_reservations r on r.charge_id = b.id
  -- A reservation is collected from its prospect's card while the prospect is still open.
  left join public.crm_leads l on l.id = r.lead_id and l.merged_into_lead_id is null and l.enrollment_id is null
    and l.status not in ('CONVERTED','LOST','NOT_QUALIFIED')
  where b.student_id = p_student and b.voided_at is null and b.balance > 0;
  return result;
end $$;
revoke all on function public.get_open_balances(uuid) from public, anon;
grant execute on function public.get_open_balances(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Possible duplicate receipt (§6.1 rule), read before saving.
-- ---------------------------------------------------------------------------
create function public.find_duplicate_receipts(p_student uuid, p_charge uuid, p_amount numeric, p_date date)
returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, pg_temp as $$
declare result jsonb;
begin
  perform operational_security.require_capability('manage_finance_operations');
  if p_student is null then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'receipt_number', r.receipt_number, 'date', r.date, 'amount', r.montant_paye,
      'charge_id', r.charge_id, 'service_description', coalesce(c.service_description, r.service_description),
      'created_at', r.created_at,
      'rule', case when p_charge is not null and r.charge_id = p_charge and r.montant_paye = round(p_amount, 2)
        and r.date = p_date then 'same_charge' else 'recent_by_you' end)
    order by r.created_at desc, r.id), '[]'::jsonb)
  into result
  from (select * from public.receipts r
        where r.student_id = p_student and r.voided_at is null and r.deleted_at is null
          and ((p_charge is not null and r.charge_id = p_charge and r.montant_paye = round(p_amount, 2) and r.date = p_date)
            or (r.actor_id = auth.uid() and r.created_at >= now() - interval '2 minutes'))
        order by r.created_at desc, r.id limit 5) r
  left join public.charges c on c.id = r.charge_id;
  return result;
end $$;
revoke all on function public.find_duplicate_receipts(uuid, uuid, numeric, date) from public, anon;
grant execute on function public.find_duplicate_receipts(uuid, uuid, numeric, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. « Inscrire et encaisser »: the 127 body with « Encaisser sur cet
--    engagement » and the no-second-charge guard. Marked « C1 » below.
-- ---------------------------------------------------------------------------
create or replace function public.crm_enroll_and_collect(p_request_key uuid, p_data jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'pg_temp'
as $function$
declare
  v_actor uuid := auth.uid();
  v_enrollment jsonb;
  v_payment jsonb;
  v_replayed boolean;
  v_start jsonb;
  v_row public.enrollments%rowtype;
  v_pay jsonb := '{}'::jsonb;
  v_bytes bytea;
  v_key uuid;
  v_gross numeric(12,2);
  v_discount numeric(12,2);
  v_amount numeric(12,2);
  v_free boolean;
  -- C1
  v_commitment public.charges%rowtype;
  v_commitment_id uuid;
begin
  perform crm_security.require_reader(false);
  perform operational_security.require_capability('manage_finance_operations');
  if p_request_key is null or jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text) > 16000
     or p_data - array['enrollment','payment'] <> '{}'::jsonb
     or jsonb_typeof(p_data->'enrollment') is distinct from 'object'
     or (p_data ? 'payment' and jsonb_typeof(p_data->'payment') is distinct from 'object')
     or p_data->'enrollment' ?| array['initial_status','group_id']
     or coalesce(p_data->'payment', '{}'::jsonb) - array['gross_amount','discount_amount','discount_reason_code',
          'discount_reason','due_date','payment_amount','payment_date','payment_method','transaction_reference',
          'note','request_email','email_recipient','idempotency_key','student_id','enrollment_id','session_type',
          'school_year','level','charge_id','new_session'] <> '{}'::jsonb
     -- C1: « nouvelle session » is an explicit boolean.
     or (p_data->'payment' ? 'new_session' and jsonb_typeof(p_data->'payment'->'new_session') is distinct from 'boolean') then
    raise exception 'Valid bounded enrollment request required' using errcode = '22023', hint = 'crm_enrollment.request_invalid';
  end if;
  v_enrollment := p_data->'enrollment';
  v_payment := p_data->'payment';
  v_commitment_id := nullif(v_payment->>'charge_id', '')::uuid;
  -- An « Autre » receipt never confirms an enrollment (122): not an enrollment programme here.
  if v_enrollment->>'session_type' = 'Other' then
    raise exception 'Choisissez le programme de l’inscription : « Autre » s’encaisse sans inscription.'
      using errcode = '22023', hint = 'eap.program_not_enrollable';
  end if;
  -- (0) The CRM command's own request lock, then the replay test (S4, R1).
  perform pg_advisory_xact_lock(hashtextextended('crm:request:'||v_actor||':start_enrollment:'||p_request_key, 0));
  v_replayed := exists (select 1 from public.crm_command_requests where actor_scope = v_actor::text
    and command_name = 'start_enrollment' and request_key = p_request_key);
  v_bytes := substring(sha256(convert_to('eap:payment:'||v_actor::text||':'||p_request_key::text, 'UTF8')) from 1 for 16);
  v_bytes := set_byte(v_bytes, 6, (get_byte(v_bytes, 6) & 15) | 80);
  v_bytes := set_byte(v_bytes, 8, (get_byte(v_bytes, 8) & 63) | 128);
  v_key := encode(v_bytes, 'hex')::uuid;
  -- A replay carries a payment exactly when the first run did: a Q12 link replayed
  -- with a payment, or a paid request replayed without one, is a payload conflict.
  if v_replayed and (v_payment is not null) is distinct from
      exists (select 1 from public.financial_requests where idempotency_key = v_key) then
    raise exception 'Request key payload conflict' using errcode = '22023', hint = 'crm_enrollment.request_conflict';
  end if;
  if not v_replayed and v_payment is not null then
    v_gross := round(coalesce(nullif(v_payment->>'gross_amount','')::numeric, 0), 2);
    v_discount := round(coalesce(nullif(v_payment->>'discount_amount','')::numeric, 0), 2);
    v_amount := round(coalesce(nullif(v_payment->>'payment_amount','')::numeric, 0), 2);
    -- C1: a payment on an existing commitment always has an amount (its price is stored).
    if v_amount <= 0 and (v_commitment_id is not null or not (v_gross > 0 and v_discount = v_gross)) then
      raise exception 'L’inscription se confirme à l’encaissement : saisissez un paiement.'
        using errcode = '22023', hint = 'eap.payment_required';
    end if;
  end if;
  -- (i) Lead, learner, Confirmed enrollment (or the Q12 link), conversion.
  v_start := public.crm_start_enrollment(p_request_key, v_enrollment || jsonb_build_object('initial_status', 'Confirmed'));
  -- An existing enrollment that already has a live charge or receipt is never charged
  -- again here (first run; the CRM step holds the learner's enrollment lock).
  if not v_replayed and v_payment is not null and nullif(v_enrollment->>'enrollment_id', '') is not null and (
      exists (select 1 from public.charges c where c.enrollment_id = (v_start->'enrollment'->>'id')::uuid and c.voided_at is null)
      or exists (select 1 from public.receipts r where r.enrollment_id = (v_start->'enrollment'->>'id')::uuid
        and r.voided_at is null and r.deleted_at is null)) then
    raise exception 'Cette inscription a déjà un montant enregistré : encaissez sur ce montant depuis le reçu, ou rattachez-la si elle est payée.'
      using errcode = '22023', hint = 'eap.enrollment_already_charged';
  end if;
  -- C1 (§6.1, NF-4), first run only; the CRM step holds the learner's enrollment
  -- lock, which crm_reserve_without_payment takes too.
  if not v_replayed and v_payment is not null then
    if v_commitment_id is not null then
      -- « Encaisser sur cet engagement »: an unlinked live commitment of this
      -- learner, programme and year, paid and linked to the new enrollment.
      select * into v_commitment from public.charges where id = v_commitment_id for update;
      if not found or v_commitment.student_id is distinct from (v_start->'enrollment'->>'student_id')::uuid
         or v_commitment.voided_at is not null or v_commitment.legacy or v_commitment.enrollment_id is not null
         or v_commitment.session_type is distinct from v_start->'enrollment'->>'session_type'
         or v_commitment.school_year is distinct from v_start->'enrollment'->>'school_year' then
        raise exception 'Cet engagement ne correspond plus à cet apprenant, ce programme et cette année. Les soldes sont actualisés.'
          using errcode = '22023', hint = 'eap.commitment_unavailable';
      end if;
    elsif coalesce((v_payment->>'new_session')::boolean, false) is not true and exists (
        select 1 from public.charges c
        where c.student_id = (v_start->'enrollment'->>'student_id')::uuid and c.enrollment_id is null
          and c.voided_at is null and not c.legacy
          and c.session_type = v_start->'enrollment'->>'session_type'
          and c.school_year = v_start->'enrollment'->>'school_year') then
      -- No second charge: the commitment is collected, or « nouvelle session » is explicit.
      raise exception 'Un engagement sans inscription existe déjà pour ce programme et cette année : encaissez sur cet engagement, ou choisissez « Nouvelle session ».'
        using errcode = '22023', hint = 'eap.unlinked_commitment_exists';
    end if;
  end if;
  -- (ii) The payment on that enrollment, from the stored enrollment summary so a
  -- replay sends the same request.
  if v_payment is not null then
    v_pay := public.create_charge_payment((v_payment - 'new_session') || jsonb_build_object(
      'student_id', v_start->'enrollment'->'student_id', 'enrollment_id', v_start->'enrollment'->'id',
      'session_type', v_start->'enrollment'->'session_type', 'school_year', v_start->'enrollment'->'school_year',
      'level', v_start->'enrollment'->'level', 'idempotency_key', v_key));
  end if;
  select * into v_row from public.enrollments where id = (v_start->'enrollment'->>'id')::uuid;
  v_free := (v_pay->>'receipt_id') is null and (v_pay->>'charge_id') is not null and exists (
    select 1 from public.charges c where c.id = (v_pay->>'charge_id')::uuid and c.voided_at is null
      and c.gross_amount > 0 and c.discount_amount = c.gross_amount);
  -- (iii) B1 / Q12, first run only.
  if not v_replayed then
    if v_payment is not null then
      if (v_pay->>'receipt_id') is null and not v_free then
        raise exception 'L’inscription se confirme à l’encaissement : saisissez un paiement.'
          using errcode = '22023', hint = 'eap.payment_required';
      end if;
    elsif not (v_row.status in ('Confirmed','Validated') and (
        exists (select 1 from public.receipts r where r.voided_at is null and r.deleted_at is null and r.montant_paye > 0
          and (r.enrollment_id = v_row.id or r.charge_id in (select c.id from public.charges c where c.enrollment_id = v_row.id)))
        or exists (select 1 from public.charges c where c.enrollment_id = v_row.id and c.voided_at is null
          and c.gross_amount > 0 and c.discount_amount = c.gross_amount))) then
      raise exception 'L’inscription se confirme à l’encaissement : saisissez un paiement.'
        using errcode = '22023', hint = 'eap.payment_required';
    end if;
  end if;
  -- (iv) The lead and its tasks as they are now: the payment may have converted a
  -- lead linked to a legacy row after the CRM step wrote its result.
  v_start := v_start || crm_security.result((v_start->'lead'->>'id')::uuid,
    'enrollment-started:'||(v_start->'lead'->>'id')||':'||v_row.id);
  if v_start->'enrollment_followup' ? 'id' and not exists (select 1 from public.crm_tasks
      where id = (v_start->'enrollment_followup'->>'id')::uuid and status = 'open') then
    v_start := v_start || jsonb_build_object('enrollment_followup', null);
  end if;
  return v_start || jsonb_build_object(
    'enrollment', crm_security.enrollment_summary(v_row),
    'charge_id', v_pay->'charge_id',
    'receipt_id', v_pay->'receipt_id',
    'receipt_number', (select r.receipt_number from public.receipts r where r.id = (v_pay->>'receipt_id')::uuid),
    'balance', (select to_jsonb(b.balance) from public.charge_balances b where b.id = (v_pay->>'charge_id')::uuid),
    'free_enrollment', v_free,
    'replayed_enrollment', v_replayed,
    'replayed_payment', coalesce((v_pay->>'replayed')::boolean, false));
end $function$;
revoke all on function public.crm_enroll_and_collect(uuid, jsonb) from public, anon;
grant execute on function public.crm_enroll_and_collect(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. « Réserver sans paiement » (OD-2 = A).
-- ---------------------------------------------------------------------------
create function public.crm_reserve_without_payment(p_request_key uuid, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  actor uuid := auth.uid(); digest text; prior public.crm_command_requests%rowtype;
  l public.crm_leads%rowtype; c public.crm_contacts%rowtype; s public.students%rowtype; ch public.charge_balances%rowtype;
  learner text; birth date; session text; year text; level text;
  gross numeric(12,2); discount numeric(12,2); due_date date; due timestamptz;
  bytes bytea; pay_key uuid; pay jsonb; task uuid; ckey text; result jsonb;
begin
  perform crm_security.require_reader(false);
  perform operational_security.require_capability('manage_finance_operations');
  if p_request_key is null or jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text) > 16000
     or p_data - array['lead_id','expected_version','student_choice','student_id','learner_name','birth_date',
       'candidate_review','confirm_new','session_type','school_year','level','gross_amount','discount_amount',
       'discount_reason_code','discount_reason','due_date'] <> '{}'::jsonb then
    raise exception 'Valid bounded reservation request required' using errcode = '22023', hint = 'crm_enrollment.request_invalid';
  end if;
  -- The same learner lock as enrolment start and « Inscrire et encaisser »: a
  -- reservation and an enrolment of one learner never interleave (no second charge).
  begin
    perform crm_security.lock_enrollment_intent(nullif(p_data->>'student_id','')::uuid);
  exception when sqlstate 'PT409' then
    raise exception 'Inscription ou paiement en cours. Actualisez les inscriptions puis réessayez.' using errcode = 'PT409', hint = 'crm_enrollment.enrollment_in_progress';
  end;
  digest := encode(sha256(convert_to(p_data::text, 'UTF8')), 'hex');
  perform pg_advisory_xact_lock(hashtextextended('crm:request:'||actor||':reserve_without_payment:'||p_request_key, 0));
  select * into prior from public.crm_command_requests where actor_scope = actor::text
    and command_name = 'reserve_without_payment' and request_key = p_request_key;
  if found then
    if prior.payload_hash <> digest then
      raise exception 'Request key payload conflict' using errcode = '22023', hint = 'crm_enrollment.request_conflict';
    end if;
    return prior.result || jsonb_build_object('replayed', true);
  end if;
  select * into l from public.crm_leads where id = (p_data->>'lead_id')::uuid for update;
  if not found or l.merged_into_lead_id is not null then
    raise exception 'Qualified unlinked lead required' using errcode = '22023', hint = 'crm_enrollment.lead_unavailable'; end if;
  if l.enrollment_id is not null then
    raise exception 'Qualified unlinked lead required' using errcode = '22023', hint = 'crm_enrollment.lead_already_enrolled'; end if;
  if l.status <> 'QUALIFIED' then
    raise exception 'Qualified unlinked lead required' using errcode = '22023', hint = 'crm_enrollment.lead_not_qualified'; end if;
  if l.version is distinct from (p_data->>'expected_version')::bigint then
    raise exception 'Stale lead version; refresh and retry' using errcode = 'PT409', hint = 'crm_enrollment.lead_changed'; end if;
  select * into strict c from public.crm_contacts where id = l.contact_id;
  session := p_data->>'session_type'; year := p_data->>'school_year'; level := nullif(p_data->>'level','');
  if session is null or session <> all(array['Yearly','Adults','Summer Camp','Communication Junior','Communication Adult','One-to-One','Mise à niveau','Online','Online One-to-One']) then
    raise exception 'Choisissez le programme de la réservation.' using errcode = '22023', hint = 'crm_enrollment.program_invalid'; end if;
  if year is null or year !~ '^[0-9]{4}/[0-9]{4}$' or right(year,4)::integer <> left(year,4)::integer + 1 then
    raise exception 'Invalid enrollment program or school year' using errcode = '22023', hint = 'crm_enrollment.school_year_invalid'; end if;
  if not crm_security.valid_enrollment_level(session, level) then
    raise exception 'Invalid level for selected program' using errcode = '22023', hint = 'crm_enrollment.level_invalid'; end if;
  begin
    gross := round(nullif(p_data->>'gross_amount','')::numeric, 2);
    discount := round(coalesce(nullif(p_data->>'discount_amount','')::numeric, 0), 2);
    due_date := nullif(p_data->>'due_date','')::date;
    birth := nullif(p_data->>'birth_date','')::date;
  exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    raise exception 'Invalid reservation fields' using errcode = '22023', hint = 'crm_enrollment.record_rejected';
  end;
  -- Something is left to collect: a price above the discount. A 100 % discount
  -- confirms the enrollment instead (« Inscrire et encaisser »).
  if gross is null or gross <= 0 or discount < 0 or discount > gross then
    raise exception 'Indiquez le prix convenu (supérieur à la remise) pour réserver sans paiement.' using errcode = '22023', hint = 'eap.reservation_price_required'; end if;
  if discount = gross then
    raise exception 'Une remise de 100 %% confirme l’inscription : utilisez « Inscrire et encaisser ».' using errcode = '22023', hint = 'eap.reservation_free'; end if;
  if due_date is null or not isfinite(due_date) then
    raise exception 'Indiquez la date d’échéance de l’acompte.' using errcode = '22023', hint = 'eap.reservation_due_required'; end if;
  if due_date < public.business_date() or due_date > public.business_date() + 366 then
    raise exception 'L’échéance doit être entre aujourd’hui et dans un an.' using errcode = '22023', hint = 'eap.reservation_due_invalid'; end if;
  -- The learner, exactly as enrolment start resolves it (crm_start_enrollment, 136).
  learner := btrim(p_data->>'learner_name');
  if p_data->>'student_choice' = 'new' then
    if l.student_id is not null then raise exception 'Invalid new learner' using errcode = '22023', hint = 'crm_enrollment.learner_already_linked'; end if;
    if p_data->>'student_id' is not null then raise exception 'Invalid new learner' using errcode = '22023', hint = 'crm_enrollment.request_invalid'; end if;
    if learner is null or length(learner) not between 2 and 120 then raise exception 'Invalid new learner' using errcode = '22023', hint = 'crm_enrollment.learner_name_invalid'; end if;
    if not isfinite(birth) then raise exception 'Invalid new learner' using errcode = '22023', hint = 'crm_enrollment.birth_date_invalid'; end if;
    if birth > public.business_date() then raise exception 'Invalid new learner' using errcode = '22023', hint = 'crm_enrollment.birth_date_future'; end if;
    perform pg_advisory_xact_lock(hashtextextended('crm:new-student:'||lower(learner), 0));
    if p_data->>'candidate_review' is distinct from crm_security.candidate_token(l.id, learner, birth) then
      raise exception 'Student candidates changed; review again' using errcode = 'PT409', hint = 'crm_enrollment.candidates_changed'; end if;
    if exists (select 1 from crm_security.student_candidates(l.id, learner, birth)) and coalesce((p_data->>'confirm_new')::boolean, false) is not true then
      raise exception 'Explicit new learner decision required' using errcode = '22023', hint = 'crm_enrollment.new_learner_confirmation_required'; end if;
    insert into public.students(full_name, date_naissance, telephone, email, parent_email, status, session_type, niveau_cefr, notes)
    values (learner, birth, coalesce(c.phone_e164, c.phone_raw), case when c.contact_kind = 'adult_learner' then c.email_normalized end,
      case when c.contact_kind <> 'adult_learner' then c.email_normalized end, 'Prospect', session, level,
      case when c.contact_kind <> 'adult_learner' then 'Contact : '||coalesce(c.display_name, 'Non renseigné') end) returning * into s;
  elsif p_data->>'student_choice' = 'existing' then
    select * into s from public.students where id = (p_data->>'student_id')::uuid and deleted_at is null for update;
    if not found then
      if l.student_id is not null and l.student_id = (p_data->>'student_id')::uuid then
        raise exception 'Student unavailable or inconsistent' using errcode = '22023', hint = 'crm_enrollment.linked_learner_unavailable'; end if;
      if l.student_id is not null then raise exception 'Student unavailable or inconsistent' using errcode = '22023', hint = 'crm_enrollment.learner_link_mismatch'; end if;
      raise exception 'Student unavailable or inconsistent' using errcode = '22023', hint = 'crm_enrollment.learner_unavailable';
    end if;
    if l.student_id is not null and l.student_id <> s.id then
      raise exception 'Student unavailable or inconsistent' using errcode = '22023', hint = 'crm_enrollment.learner_link_mismatch'; end if;
  else
    raise exception 'Explicit student choice required' using errcode = '22023', hint = 'crm_enrollment.learner_choice_required';
  end if;
  -- One commitment per learner, programme and year; never next to a live enrollment.
  if exists (select 1 from public.charges x where x.student_id = s.id and x.enrollment_id is null and x.voided_at is null
      and not x.legacy and x.session_type = session and x.school_year = year) then
    raise exception 'Un engagement sans inscription existe déjà pour ce programme et cette année : encaissez sur cet engagement.'
      using errcode = '22023', hint = 'eap.unlinked_commitment_exists'; end if;
  if exists (select 1 from public.enrollments x where x.student_id = s.id and x.status not in ('Rejected','Ended')
      and coalesce(x.session_type, s.session_type) = session and crm_security.enrollment_year(x) = year) then
    raise exception 'Cet apprenant a déjà une inscription pour ce programme et cette année : encaissez sur son inscription.'
      using errcode = '22023', hint = 'eap.reservation_already_enrolled'; end if;
  -- The charge, through the financial command (capability, discount reasons,
  -- financial_requests idempotency and the charge_created event), with no
  -- payment: no receipt, no enrollment, no conversion.
  bytes := substring(sha256(convert_to('eap:reservation:'||actor::text||':'||p_request_key::text, 'UTF8')) from 1 for 16);
  bytes := set_byte(bytes, 6, (get_byte(bytes, 6) & 15) | 80);
  bytes := set_byte(bytes, 8, (get_byte(bytes, 8) & 63) | 128);
  pay_key := encode(bytes, 'hex')::uuid;
  pay := public.create_charge_payment_financial(jsonb_build_object('student_id', s.id, 'session_type', session,
    'school_year', year, 'level', level, 'gross_amount', gross, 'discount_amount', discount,
    'discount_reason_code', p_data->>'discount_reason_code', 'discount_reason', p_data->>'discount_reason',
    'due_date', due_date, 'payment_amount', 0, 'idempotency_key', pay_key));
  if (pay->>'receipt_id') is not null or (pay->>'charge_id') is null then
    raise exception 'Reservation must create a charge without payment' using errcode = 'XX000'; end if;
  insert into public.crm_charge_reservations(lead_id, charge_id, student_id, created_by, request_key)
  values (l.id, (pay->>'charge_id')::uuid, s.id, actor, p_request_key);
  -- The prospect is linked to its learner, as enrolment start does; nothing else
  -- changes on the prospect (no enrollment, no conversion, status unchanged).
  update public.crm_leads set student_id = s.id, version = version + 1, updated_at = now() where id = l.id returning * into l;
  -- One history entry for the user action (§4.7); the task events carry its key.
  ckey := 'reservation:'||l.id||':'||p_request_key;
  perform set_config('eh.crm_command_key', ckey, true);
  insert into public.crm_activities(lead_id, occurred_at, actor_id, actor_kind, event_type, source_key, body, command_key, is_primary, details)
  values (l.id, now(), actor, 'user', 'charge_reserved', ckey, 'Réservé sans paiement : '||
      to_char(gross - discount, 'FM999G999G990D00')||' MAD à encaisser avant le '||to_char(due_date, 'DD/MM/YYYY')||'.',
    ckey, true, jsonb_build_object('command', 'reserve_without_payment',
      'summary', 'Réservé sans paiement → Encaisser l’acompte '||to_char(due_date, 'DD/MM')));
  -- « Encaisser l'acompte », our step, due on the due date (a reminder: the first
  -- calling window from that date, never earlier than now). The only writer of
  -- next actions does the replacement (an enrolment action, so a kept test moves
  -- with it, §4.8); migration 137's index and deferred triggers check the result.
  due := greatest(now(), due_date::timestamp at time zone public.centre_utc_offset());
  task := crm_security.set_next_action(l, jsonb_build_object('task_type', 'enrollment_followup', 'schedule_kind', 'reminder',
    'due_at', due, 'instructions', 'Encaisser l’acompte',
    '_key', ckey||':next-action', '_kind', 'enrollment', '_replaced_reason', 'Remplacée par « Encaisser l’acompte »'),
    'enrollment', ckey);
  perform set_config('eh.crm_command_key', '', true);
  select * into ch from public.charge_balances where id = (pay->>'charge_id')::uuid;
  result := crm_security.result(l.id, ckey) || jsonb_build_object(
    'charge', jsonb_build_object('id', ch.id, 'student_id', ch.student_id, 'session_type', ch.session_type,
      'school_year', ch.school_year, 'level', ch.level, 'net_amount', ch.net_amount, 'balance', ch.balance,
      'due_date', ch.due_date, 'enrollment_id', ch.enrollment_id),
    'student', jsonb_build_object('id', s.id, 'name', s.full_name),
    'next_action_id', task, 'replayed', false);
  insert into public.crm_command_requests(actor_scope, command_name, request_key, payload_hash, result)
  values (actor::text, 'reserve_without_payment', p_request_key, digest, result);
  return result;
exception
  when deadlock_detected or unique_violation then
    raise exception 'Concurrent enrollment change; refresh and retry' using errcode = 'PT409', hint = 'crm_enrollment.concurrent_change';
  when check_violation or not_null_violation then
    raise exception 'Invalid reservation fields' using errcode = '22023', hint = 'crm_enrollment.record_rejected';
end $$;
revoke all on function public.crm_reserve_without_payment(uuid, jsonb) from public, anon;
grant execute on function public.crm_reserve_without_payment(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. The label of « Encaisser l'acompte » (one label in every view, invariant 9).
--    The 136 body, verbatim except the enrollment_followup line.
-- ---------------------------------------------------------------------------
create or replace function crm_security.action_label(t public.crm_tasks)
 returns text language sql stable set search_path to 'pg_catalog','pg_temp' as $function$
 select case when t.id is null then 'Aucune prochaine action' else
  case t.task_type
   when 'first_contact' then 'Premier contact'
   when 'contact_attempt' then 'Appel de suivi'
   when 'callback' then case when t.schedule_kind='appointment' then 'Rappel convenu' else 'Rappel' end
   when 'whatsapp_followup' then 'À faire par nous (WhatsApp)'
   when 'confirm_placement_test' then 'Confirmer le test de niveau'
   when 'post_test_followup' then 'Proposer l’inscription'
   when 'center_visit' then 'Rendez-vous au centre'
   when 'enrollment_followup' then case when t.instructions like 'Encaisser l’acompte%' then 'Encaisser l’acompte' else 'Finaliser l’inscription' end
   when 'awaiting_prospect' then 'En attente du prospect'
   else t.task_type end
  ||case when t.due_at is null then ''
    when t.task_type='awaiting_prospect' then ' (relance '||to_char(t.due_at at time zone public.centre_utc_offset(),'DD/MM')||')'
    else ' '||to_char(t.due_at at time zone public.centre_utc_offset(),'DD/MM HH24:MI') end
  ||case when t.task_type='center_visit' and t.placement_test_id is not null then ' (avec test)' else '' end
 end
$function$;

-- ---------------------------------------------------------------------------
-- 7. Server guards on every payment path (owner, 2026-11-25, PR #216 review).
--    Every charge and every receipt is written by create_charge_payment_financial,
--    reached through create_charge_payment (Encaisser, and « Inscrire et
--    encaisser » after its CRM step) and crm_reserve_without_payment; no
--    application code writes charges or receipts with the service role.
-- ---------------------------------------------------------------------------
-- (a) A commitment reserved for a prospect is paid only through « Inscrire et
--     encaisser » on that prospect (ADR-015: the payment confirms the prospect's
--     own enrollment and converts it). While the reservation's prospect is open —
--     not merged, no enrollment, not converted, lost or not qualified — no receipt
--     is written on the charge. « Inscrire et encaisser » links the prospect to
--     its new enrollment before paying, so its own receipt passes; a prospect that
--     is closed without enrolling leaves an ordinary commitment.
create function crm_security.reserved_commitment_receipt_guard() returns trigger
language plpgsql set search_path = pg_catalog, pg_temp as $$
begin
  if new.charge_id is not null and exists (
      select 1 from public.crm_charge_reservations r join public.crm_leads l on l.id = r.lead_id
      where r.charge_id = new.charge_id and l.merged_into_lead_id is null and l.enrollment_id is null
        and l.status not in ('CONVERTED','LOST','NOT_QUALIFIED')) then
    raise exception 'Cet engagement est réservé pour un prospect : encaissez-le depuis la fiche du prospect avec « Inscrire et encaisser ».'
      using errcode = '22023', hint = 'eap.reservation_collect_on_prospect';
  end if;
  return new;
end $$;
revoke all on function crm_security.reserved_commitment_receipt_guard() from public, anon, authenticated, service_role;
create trigger receipts_reserved_commitment_guard before insert on public.receipts
  for each row execute function crm_security.reserved_commitment_receipt_guard();

-- (b) No second charge (NF-4) at « Encaisser »: create_charge_payment re-created from
--     its 127 body (prosrc md5 2263c8d7c1ba4b41f0c863c81b82edd8, checked in section 0)
--     with one C1 block, marked below. « Inscrire et encaisser » (section 4) and
--     « Réserver sans paiement » (section 5) hold the same rule before their own charge.
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
  v_free boolean := false;
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
  -- C1 (RWR-r5 NF-4, owner review of PR #216): « Encaisser » never creates a second
  -- tuition charge next to a live unlinked commitment of the learner for the same
  -- programme and year; the payment goes on that commitment. A charge paid onto an
  -- enrollment the staff chose (enrollment_id, as « Inscrire et encaisser » always
  -- sends) is a deliberate link and passes; « Autre » and a replay are outside the rule.
  if nullif(p_payload->>'charge_id','') is null and v_requested_id is null
     and nullif(p_payload->>'student_id','') is not null
     and coalesce(nullif(btrim(p_payload->>'session_type'),''), 'Other') <> 'Other'
     and not exists (select 1 from public.financial_requests
       where idempotency_key = nullif(p_payload->>'idempotency_key','')::uuid)
     and exists (select 1 from public.charges x where x.student_id = (p_payload->>'student_id')::uuid
       and x.enrollment_id is null and x.voided_at is null and not x.legacy
       and x.session_type = btrim(p_payload->>'session_type')
       and x.school_year = nullif(btrim(p_payload->>'school_year'),'')) then
    raise exception 'Un engagement sans inscription existe déjà pour ce programme et cette année : encaissez sur cet engagement.'
      using errcode = '22023', hint = 'eap.unlinked_commitment_exists';
  end if;
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
    -- EAP (D2, Q1 = A): a zero payment stays a commitment without an enrollment,
    -- except when this request created a new tuition charge discounted at 100 %
    -- with its reason: that agreement confirms the enrollment without a receipt
    -- (the director sees it in the discounts section of Contrôles).
    if nullif(p_payload->>'charge_id','') is not null then
      return v_result;
    end if;
    select * into v_charge from public.charges
    where id = (v_result->>'charge_id')::uuid for update;
    if v_charge.session_type = 'Other' or v_charge.legacy or v_charge.gross_amount <= 0
       or v_charge.discount_amount is distinct from v_charge.gross_amount
       or not exists (select 1 from public.charge_discount_reasons dr where dr.charge_id = v_charge.id) then
      return v_result;
    end if;
    v_free := true;
  else
    select * into v_charge from public.charges
    where id = (v_result->>'charge_id')::uuid for update;
  end if;
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
          when status in ('Submitted','Under Review') then
            case when group_id is null then 'Confirmed' else 'Validated' end
          when status = 'Trial' then 'Validated'
          else status end
      where id = v_enrollment_id;
    end if;
  else
    insert into public.enrollments
      (student_id, status, date_inscription, session_type, school_year, level)
    values (v_charge.student_id, 'Confirmed',
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
  -- when a payment-cancellation review follows the last clear, no review of the
  -- lead was ever raised for another reason (all time: an enrollment downgrade's
  -- activity is timestamped at its command start and may predate a later clear),
  -- and the conversion was not from LOST/NOT_QUALIFIED. Leads are locked last.
  if not v_free and v_enrollment.status in ('Confirmed','Validated') then
    for v_lead in select * from public.crm_leads
      where enrollment_id = v_enrollment_id and merged_into_lead_id is null and conversion_review_required
      order by id for update
    loop
      select max(occurred_at) into v_last_clear from public.crm_activities
      where lead_id = v_lead.id and event_type = 'conversion_review_cleared';
      if exists (select 1 from public.crm_activities a where a.lead_id = v_lead.id
          and a.event_type = 'conversion_review_required' and (v_last_clear is null or a.occurred_at > v_last_clear))
        and not exists (select 1 from public.crm_activities a where a.lead_id = v_lead.id
          and a.event_type = 'conversion_review_required' and a.details->>'reason' is distinct from 'payment_voided')
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
                                       'free_enrollment', v_free,
                                       'group_pending', v_enrollment.status = 'Confirmed' and v_enrollment.group_id is null,
                                       'student_enrolled', v_enrollment.status in ('Confirmed','Validated'));
end;
$function$;
revoke all on function public.create_charge_payment(jsonb) from public, anon;
grant execute on function public.create_charge_payment(jsonb) to authenticated;
