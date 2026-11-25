-- Restore for migration 139 (RWR-r5 PR C1, desk payments; provisional number,
-- renumbered with the migration at merge).
--
-- Run only with its own owner approval, after the application is back on a build
-- without PR C1 (a C1 build calls get_open_balances, find_duplicate_receipts and
-- crm_reserve_without_payment, which this restore drops).
--
-- What it does: re-creates public.crm_enroll_and_collect in its exact 127 body
-- (no « Encaisser sur cet engagement », no no-second-charge guard) with its grants,
-- re-creates crm_security.action_label in its exact 136 body (« Encaisser l'acompte »
-- is labelled « Finaliser l'inscription » again),
-- and drops get_open_balances, find_duplicate_receipts, crm_reserve_without_payment,
-- the crm_charge_reservations table and its append-only trigger function.
--
-- What it keeps on purpose: every charge a reservation created stays (an ordinary
-- open commitment of the learner, still collected from « Encaisser »), and every
-- « Encaisser l'acompte » next action stays open (an ordinary enrolment action).
-- Only the prospect ↔ charge link rows are lost, so the restore refuses, changing
-- nothing, while reservation rows exist, unless the operator has exported them
-- first and sets eh.restore_139_drop_reservations to 'exported' in the session:
--   \copy (select * from public.crm_charge_reservations) to 'reservations-139.csv' csv header
--   set eh.restore_139_drop_reservations = 'exported';
-- It also refuses unless migration 139 is applied. The ledger row 139 is removed by
-- the operator wrapper, not here.
begin;

do $$ begin
  if to_regclass('public.crm_charge_reservations') is null
     or to_regprocedure('public.crm_reserve_without_payment(uuid,jsonb)') is null then
    raise exception 'Restore 139: migration 139 is not applied' using errcode = '55000';
  end if;
  if exists (select 1 from public.crm_charge_reservations)
     and coalesce(current_setting('eh.restore_139_drop_reservations', true), '') <> 'exported' then
    raise exception 'Restore 139: reservation rows exist; export them, then set eh.restore_139_drop_reservations = ''exported'''
      using errcode = '55000';
  end if;
end $$;

drop function public.crm_reserve_without_payment(uuid, jsonb);
drop function public.find_duplicate_receipts(uuid, uuid, numeric, date);
drop function public.get_open_balances(uuid);
drop trigger crm_charge_reservations_append_only on public.crm_charge_reservations;
drop table public.crm_charge_reservations;
drop function crm_security.charge_reservations_append_only();

-- crm_security.action_label: the 136 body, verbatim (prosrc md5 fae61b36be35b068532fbd9e29dc10f2).
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
   when 'enrollment_followup' then 'Finaliser l’inscription'
   when 'awaiting_prospect' then 'En attente du prospect'
   else t.task_type end
  ||case when t.due_at is null then ''
    when t.task_type='awaiting_prospect' then ' (relance '||to_char(t.due_at at time zone public.centre_utc_offset(),'DD/MM')||')'
    else ' '||to_char(t.due_at at time zone public.centre_utc_offset(),'DD/MM HH24:MI') end
  ||case when t.task_type='center_visit' and t.placement_test_id is not null then ' (avec test)' else '' end
 end
$function$;

-- crm_enroll_and_collect: the 127 body, verbatim (prosrc md5 84babfb6f1305fb2cab565bfdf9e5e07).
CREATE OR REPLACE FUNCTION public.crm_enroll_and_collect(p_request_key uuid, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
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
          'school_year','level'] <> '{}'::jsonb then
    raise exception 'Valid bounded enrollment request required' using errcode = '22023', hint = 'crm_enrollment.request_invalid';
  end if;
  v_enrollment := p_data->'enrollment';
  v_payment := p_data->'payment';
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
    if v_amount <= 0 and not (v_gross > 0 and v_discount = v_gross) then
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
  -- (ii) The payment on that enrollment, from the stored enrollment summary so a
  -- replay sends the same request.
  if v_payment is not null then
    v_pay := public.create_charge_payment(v_payment || jsonb_build_object(
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
end $function$

;
revoke all on function public.crm_enroll_and_collect(uuid, jsonb) from public, anon;
grant execute on function public.crm_enroll_and_collect(uuid, jsonb) to authenticated;

do $$ begin
  if (select md5(prosrc) from pg_proc where oid = 'public.crm_enroll_and_collect(uuid,jsonb)'::regprocedure)
     is distinct from '84babfb6f1305fb2cab565bfdf9e5e07' then
    raise exception 'Restore 139: crm_enroll_and_collect is not the 127 body after the restore' using errcode = 'XX000';
  end if;
  if (select md5(prosrc) from pg_proc where oid = 'crm_security.action_label(public.crm_tasks)'::regprocedure)
     is distinct from 'fae61b36be35b068532fbd9e29dc10f2' then
    raise exception 'Restore 139: crm_security.action_label is not the 136 body after the restore' using errcode = 'XX000';
  end if;
end $$;

commit;
