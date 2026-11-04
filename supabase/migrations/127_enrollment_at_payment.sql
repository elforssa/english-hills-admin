-- 127: Enrollment at payment (plan EAP-r4, approved by the owner on 2026-11-04 with
-- Q1–Q13 answered A, except Q3 = B). An enrollment now exists only once it is paid:
-- reception enrolls and collects in one step (« Inscrire et encaisser »), any payment
-- above zero confirms, and « pré-inscription » and « essai » are retired, never
-- dropped. Forward-only and transactional. No table, column, constraint value or RLS
-- policy is dropped or changed; the old statuses stay readable for history.
--
-- 1. D1: academic_security.guard_retired_enrollment_status() and the trigger
--    enrollments_retired_status_guard refuse, for every role, any new row or
--    transition into Submitted, Under Review, Trial or Rejected (Q5), except under
--    the two-flag exemption of the Batch D revert (eh.membership_sync and
--    eh.enrollment_command both 'on'), used by the archive revert.
-- 2. D2: create_charge_payment (122) without the 10 % reception branch; a new
--    tuition charge at a 100 % discount with its reason confirms the enrollment
--    without a receipt (Q1 = A, free_enrollment); the zero-payment early return stays.
-- 3. D3: crm_start_enrollment (125) creates only Confirmed enrollments, refuses a
--    group and loses its API grant; the new crm_enroll_and_collect wrapper runs it
--    and the payment in one transaction, with a payment key derived from the caller
--    and the request key, and never commits an enrollment without its receipt, its
--    100 % discount or (Q12) an already paid linked enrollment.
-- 4. Q3 = B: academic_security.place and public.place_learner_in_group (120) are
--    dropped by their 120 signatures and re-created with a last parameter
--    p_without_enrollment_reason: reception places only a paid (Confirmed or
--    Validated) enrollment; director and admin may create one with a logged reason.
-- 5. D4: save_receptionist_enrollment (125), create_enrollment, save_enrollment_changes
--    (120), create_public_registration and portal_request_reenrollment (125) refuse
--    their pre-enrollment branches; reopen_enrollment (120) refuses rows the archive
--    step ended (Q11), read from maintenance.eap_archive_journal.
-- 6. D5: get_finance_review_queue (122): section (d) becomes unpaid_never and the
--    informational section (e) paid_unlinked is added, both through
--    finance_security.unlinked_payment_count (the R0 K1–K3/L2 rule).
-- 7. D7: crm_security.protect_enrollment_link (084) admits, under eh.crm_detach, the
--    detach of a non-converted lead from an Ended or Rejected enrollment (Q6; the
--    LIR-r1 2e rule); maintenance.eap_archive_journal is created empty.
-- The data step is supabase/manual/enrollment_at_payment_archive.sql (separately
-- approved); the restore is scripts/rollback/127_enrollment_at_payment_restore.sql
-- (not run without its own approval).
begin;

-- ── Archive journal (D7): ids, statuses and actions only, never names or contacts ──
create table maintenance.eap_archive_journal (
  id bigint generated always as identity primary key,
  run_id uuid not null,
  action text not null check (action in ('confirmed','ended','detached','resynced','reverted')),
  entity text not null check (entity in ('enrollments','crm_leads','students')),
  row_id uuid not null,
  before jsonb,
  after jsonb,
  reverts_id bigint references maintenance.eap_archive_journal(id),
  at timestamptz not null default now(),
  check ((action = 'reverted') = (reverts_id is not null))
);
create index eap_archive_journal_row on maintenance.eap_archive_journal (row_id, action);
alter table maintenance.eap_archive_journal enable row level security;
revoke all on table maintenance.eap_archive_journal from public, anon, authenticated, service_role;

-- ── D1: the retired statuses are never created or re-entered ──────────────────
create function academic_security.guard_retired_enrollment_status() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  if new.status in ('Submitted','Under Review','Trial','Rejected')
     and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    -- Only a journalled revert (Batch D, enrollment at payment) sets both flags.
    if current_setting('eh.membership_sync', true) = 'on' and current_setting('eh.enrollment_command', true) = 'on' then
      return new;
    end if;
    raise exception 'La pré-inscription et l’essai n’existent plus : l’inscription se confirme à l’encaissement.'
      using errcode = '23514', hint = 'eap.status_retired';
  end if;
  return new;
end $$;
create trigger enrollments_retired_status_guard before insert or update of status on public.enrollments
  for each row execute function academic_security.guard_retired_enrollment_status();
revoke all on function academic_security.guard_retired_enrollment_status() from public, anon, authenticated, service_role;

-- ── D5: one rule for "paid elsewhere" (R0 K1–K3 and L2, Contrôles (d) and (e)) ──
-- Live receipts with an amount, on a charge linked to no enrollment, of the
-- learner: a dated non-legacy charge of the same programme and school year, or a
-- legacy or undated (pre-057) charge whose receipt date falls in the school-year
-- window (1 June to 31 August, the Batch D C1 window), of the same programme when
-- it is not legacy.
create function finance_security.unlinked_payment_count(p_student uuid, p_session text, p_year text)
returns integer language sql stable set search_path = pg_catalog, pg_temp as $$
  select count(*)::integer from public.receipts r join public.charges c on c.id = r.charge_id
  where r.student_id = p_student and r.voided_at is null and r.deleted_at is null and r.montant_paye > 0
    and r.enrollment_id is null and c.enrollment_id is null
    and ((not c.legacy and c.school_year is not null and c.session_type = p_session and c.school_year = p_year)
      or ((c.legacy or c.school_year is null) and (c.legacy or c.session_type = p_session)
        and p_year is not null
        and r.date between make_date(left(p_year, 4)::integer, 6, 1) and make_date(left(p_year, 4)::integer + 1, 8, 31)))
$$;
revoke all on function finance_security.unlinked_payment_count(uuid, text, text) from public, anon, authenticated, service_role;

-- ── D2: any payment confirms; free enrollment (122 + EAP) ─────────────────────
-- 122 + EAP: the reception 10 % branch (Batch E Q5 = B) is withdrawn by owner
-- decision 2; any live payment confirms (Validated with a group). Q1 = A: a new
-- tuition charge at a 100 % discount with its reason confirms without a receipt
-- (free_enrollment). The legacy mapping of the retired statuses stays for old rows.
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

-- ── D5: the director's review list (122 + EAP) ───────────────────────────────
-- P1.6 + EAP: sections (a) and (d)–(e) are always current; (b) and (c) cover the
-- period from p_since (default 30 days). Each section is capped at 200 rows.
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
        'reason_code', dr.reason_code, 'reason', dr.reason, 'author_role', p.role,
        'voided', c.voided_at is not null) row_data
      from public.charges c join public.students s on s.id = c.student_id
      left join public.charge_discount_reasons dr on dr.charge_id = c.id
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
    -- (d) EAP (D5, Q3, Q11, Q13): Confirmed or Validated enrollments that never had
    -- any receipt (live or voided; (a) covers "had one, none live"), no fully
    -- discounted charge, and whose learner was not paid elsewhere on an unlinked or
    -- legacy receipt (finance_security.unlinked_payment_count, the R0 K1-K3/L2 rule),
    -- whatever their creation date, with their origin when the academic log knows it.
    'unpaid_never', coalesce((select jsonb_agg(row_data order by row_data->>'created_at' desc, row_data->>'enrollment_id') from (
      select jsonb_build_object('enrollment_id', e.id, 'student_id', s.id, 'learner_name', s.full_name,
        'learner_archived', s.deleted_at is not null, 'enrollment_status', e.status,
        'session_type', e.session_type, 'school_year', e.school_year,
        'created_at', e.created_at, 'created_on', public.business_date(e.created_at),
        'origin', o.origin) row_data
      from public.enrollments e join public.students s on s.id = e.student_id
      left join lateral (
        select jsonb_build_object('kind', a.after->>'kind', 'reason', a.after->>'reason',
          'author_role', coalesce(a.after->>'author_role', p.role), 'at', a.created_at) origin
        from public.activity_log a left join public.profiles p on p.id = a.actor_id
        where a.target_table = 'enrollments' and a.target_id = e.id
          and a.after->>'kind' in ('placement_without_enrollment','reopen','capacity_override')
        order by a.created_at desc, a.id desc limit 1) o on true
      where e.status in ('Confirmed','Validated')
        and not exists (select 1 from public.receipts r where r.enrollment_id = e.id
          or r.charge_id in (select c.id from public.charges c where c.enrollment_id = e.id))
        and not exists (select 1 from public.charges c where c.enrollment_id = e.id and c.voided_at is null
          and c.gross_amount > 0 and c.discount_amount = c.gross_amount)
        and finance_security.unlinked_payment_count(e.student_id, e.session_type, e.school_year) = 0
      order by e.created_at desc, e.id limit 200) q), '[]'::jsonb),
    -- (e) Informational: the same enrollments without a linked receipt whose learner
    -- paid on an unlinked or legacy receipt (Batch D C1/C5 rows among them). No action.
    'paid_unlinked', coalesce((select jsonb_agg(row_data order by row_data->>'learner_name', row_data->>'enrollment_id') from (
      select jsonb_build_object('enrollment_id', e.id, 'student_id', s.id, 'learner_name', s.full_name,
        'learner_archived', s.deleted_at is not null, 'enrollment_status', e.status,
        'session_type', e.session_type, 'school_year', e.school_year,
        'created_on', public.business_date(e.created_at), 'receipt_count', x.n) row_data
      from public.enrollments e join public.students s on s.id = e.student_id
      cross join lateral (select finance_security.unlinked_payment_count(e.student_id, e.session_type, e.school_year) n) x
      where e.status in ('Confirmed','Validated')
        and not exists (select 1 from public.receipts r where r.enrollment_id = e.id
          or r.charge_id in (select c.id from public.charges c where c.enrollment_id = e.id))
        and x.n > 0
      order by s.full_name, e.id limit 200) q), '[]'::jsonb));
end
$function$;

-- ── D3: the CRM enrollment command (125 + EAP) ───────────────────────────────
-- 125 + EAP: the enrollment is created Confirmed, without a group; reached only
-- through public.crm_enroll_and_collect (its API grant is revoked below).
CREATE OR REPLACE FUNCTION public.crm_start_enrollment(p_request_key uuid, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare actor uuid:=auth.uid(); digest text; prior public.crm_command_requests%rowtype; l public.crm_leads%rowtype; c public.crm_contacts%rowtype;
 s public.students%rowtype; e public.enrollments%rowtype; g public.groups%rowtype; a uuid; t public.crm_tasks%rowtype; keep_task uuid;
 learner text; birth date; session text; year text; level text; initial_status text; due timestamptz; result jsonb;
 followup_at timestamptz; followup_task uuid; followup jsonb; begin
 perform crm_security.require_reader(false);
 if p_request_key is null or jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>16000
 or p_data-array['lead_id','expected_version','student_choice','student_id','learner_name','birth_date','candidate_review','confirm_new','enrollment_id','expected_enrollment_updated_at','session_type','school_year','level','group_id','initial_status','followup_at','notes']<>'{}'::jsonb then
  raise exception 'Valid bounded enrollment request required' using errcode='22023',hint='crm_enrollment.request_invalid'; end if;
 -- EAP (D3): the enrollment is created Confirmed and placed after the payment.
 if p_data->>'group_id' is not null then
  raise exception 'Valid bounded enrollment request required' using errcode='22023',hint='crm_enrollment.request_invalid'; end if;
 -- E9: hint only the helper's own lock collision, at its original position.
 -- Every other error, including a malformed student_id cast, propagates as before.
 begin
  perform crm_security.lock_enrollment_intent(nullif(p_data->>'student_id','')::uuid);
 exception when sqlstate 'PT409' then
  if sqlerrm='Inscription ou paiement en cours. Actualisez les inscriptions puis réessayez.' then
   raise exception 'Inscription ou paiement en cours. Actualisez les inscriptions puis réessayez.' using errcode='PT409',hint='crm_enrollment.enrollment_in_progress'; end if;
  raise;
 end;
 digest:=encode(sha256(convert_to(p_data::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('crm:request:'||actor||':start_enrollment:'||p_request_key,0));
 select * into prior from public.crm_command_requests where actor_scope=actor::text and command_name='start_enrollment' and request_key=p_request_key;
 if found then
  if prior.payload_hash<>digest then raise exception 'Request key payload conflict' using errcode='22023',hint='crm_enrollment.request_conflict'; end if;return prior.result;
 end if;
 select * into l from public.crm_leads where id=(p_data->>'lead_id')::uuid for update;
 -- E1: one reason per condition of the former combined lead check.
 if not found or l.merged_into_lead_id is not null then raise exception 'Qualified unlinked lead required' using errcode='22023',hint='crm_enrollment.lead_unavailable'; end if;
 if l.enrollment_id is not null then raise exception 'Qualified unlinked lead required' using errcode='22023',hint='crm_enrollment.lead_already_enrolled'; end if;
 if l.status<>'QUALIFIED' then raise exception 'Qualified unlinked lead required' using errcode='22023',hint='crm_enrollment.lead_not_qualified'; end if;
 if l.version is distinct from (p_data->>'expected_version')::bigint then raise exception 'Stale lead version; refresh and retry' using errcode='PT409',hint='crm_enrollment.lead_changed'; end if;
 select * into strict c from public.crm_contacts where id=l.contact_id;
 learner:=btrim(p_data->>'learner_name');
 -- E3: same cast at the same position; only its cast errors gain a reason.
 begin
  birth:=nullif(p_data->>'birth_date','')::date;
 exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
  raise exception 'Invalid enrollment fields or incompatible group' using errcode='22023',hint='crm_enrollment.birth_date_invalid';
 end;
 session:=p_data->>'session_type';year:=p_data->>'school_year';level:=nullif(p_data->>'level','');initial_status:=coalesce(p_data->>'initial_status','Submitted');
 -- E2: the former combined program/year/notes check, split in its original order.
 if session is null or session<>all(array['Yearly','Adults','Summer Camp','Communication Junior','Communication Adult','One-to-One','Mise à niveau','Other','Online','Online One-to-One']) then
  raise exception 'Invalid enrollment program or school year' using errcode='22023',hint='crm_enrollment.program_invalid'; end if;
 if year is null or year!~'^[0-9]{4}/[0-9]{4}$' or right(year,4)::integer<>left(year,4)::integer+1 then
  raise exception 'Invalid enrollment program or school year' using errcode='22023',hint='crm_enrollment.school_year_invalid'; end if;
 if length(p_data->>'notes')>2000 then raise exception 'Invalid enrollment program or school year' using errcode='22023',hint='crm_enrollment.notes_too_long'; end if;
 if initial_status is distinct from 'Confirmed' then raise exception 'Only pre-confirmation enrollment initiation is permitted' using errcode='42501',hint='crm_enrollment.initial_status_not_permitted'; end if;
 if p_data->>'student_choice'='new' then
  -- E3: the same rejected set as 084, one reason per condition. A birth date is
  -- bounded by the Casablanca civil date (enrollment initiation only).
  if l.student_id is not null then raise exception 'Invalid new learner' using errcode='22023',hint='crm_enrollment.learner_already_linked'; end if;
  if p_data->>'student_id' is not null or p_data->>'enrollment_id' is not null then raise exception 'Invalid new learner' using errcode='22023',hint='crm_enrollment.request_invalid'; end if;
  if learner is null or length(learner) not between 2 and 120 then raise exception 'Invalid new learner' using errcode='22023',hint='crm_enrollment.learner_name_invalid'; end if;
  if not isfinite(birth) then raise exception 'Invalid new learner' using errcode='22023',hint='crm_enrollment.birth_date_invalid'; end if;
  if birth>public.business_date() then raise exception 'Invalid new learner' using errcode='22023',hint='crm_enrollment.birth_date_future'; end if;
  -- Serializes new-student decisions for equal names, including separate leads.
  perform pg_advisory_xact_lock(hashtextextended('crm:new-student:'||lower(learner),0));
  if p_data->>'candidate_review' is distinct from crm_security.candidate_token(l.id,learner,birth) then raise exception 'Student candidates changed; review again' using errcode='PT409',hint='crm_enrollment.candidates_changed'; end if;
  if exists(select 1 from crm_security.student_candidates(l.id,learner,birth)) and coalesce((p_data->>'confirm_new')::boolean,false) is not true then raise exception 'Explicit new learner decision required' using errcode='22023',hint='crm_enrollment.new_learner_confirmation_required'; end if;
  insert into public.students(full_name,date_naissance,telephone,email,parent_email,status,session_type,niveau_cefr,notes)
  values(learner,birth,coalesce(c.phone_e164,c.phone_raw),case when c.contact_kind='adult_learner' then c.email_normalized end,
   case when c.contact_kind<>'adult_learner' then c.email_normalized end,'Prospect',session,level,
   case when c.contact_kind<>'adult_learner' then 'Contact : '||coalesce(c.display_name,'Non renseigné') end) returning * into s;
 elsif p_data->>'student_choice'='existing' then
  select * into s from public.students where id=(p_data->>'student_id')::uuid and deleted_at is null for update;
  -- E4: the former combined check, split by linkage.
  if not found then
   if l.student_id is not null and l.student_id=(p_data->>'student_id')::uuid then raise exception 'Student unavailable or inconsistent' using errcode='22023',hint='crm_enrollment.linked_learner_unavailable'; end if;
   if l.student_id is not null then raise exception 'Student unavailable or inconsistent' using errcode='22023',hint='crm_enrollment.learner_link_mismatch'; end if;
   raise exception 'Student unavailable or inconsistent' using errcode='22023',hint='crm_enrollment.learner_unavailable';
  end if;
  if l.student_id is not null and l.student_id<>s.id then raise exception 'Student unavailable or inconsistent' using errcode='22023',hint='crm_enrollment.learner_link_mismatch'; end if;
 else raise exception 'Explicit student choice required' using errcode='22023',hint='crm_enrollment.learner_choice_required'; end if;
 if p_data->>'enrollment_id' is not null then
  select * into e from public.enrollments where id=(p_data->>'enrollment_id')::uuid for update;
  -- E5: the former combined check, split into incompatibility and linkage.
  if not found or e.student_id is distinct from s.id or e.status is null or e.status in ('Rejected','Ended')
  or coalesce(e.session_type,s.session_type) is distinct from session or crm_security.enrollment_year(e) is distinct from year then
   raise exception 'Enrollment unavailable or incompatible' using errcode='22023',hint='crm_enrollment.enrollment_incompatible'; end if;
  if exists(select 1 from public.crm_leads where enrollment_id=e.id) then raise exception 'Enrollment unavailable or incompatible' using errcode='22023',hint='crm_enrollment.enrollment_already_linked'; end if;
  if e.group_id is not null then
   select * into g from public.groups where id=e.group_id for share;
   if not found or g.session_type is distinct from session or (e.level is not null and g.niveau is distinct from e.level) then
    raise exception 'Enrollment group must match session and level' using errcode='22023',hint='crm_enrollment.enrollment_group_incompatible'; end if;
  end if;
  if e.updated_at is distinct from (p_data->>'expected_enrollment_updated_at')::timestamptz then raise exception 'Stale enrollment; refresh and retry' using errcode='PT409',hint='crm_enrollment.enrollment_changed'; end if;
 else
  if exists(select 1 from public.enrollments x where x.student_id=s.id and x.status is null and coalesce(x.session_type,s.session_type)=session and crm_security.enrollment_year(x)=year) then
   raise exception 'Existing enrollment status requires review' using errcode='22023',hint='crm_enrollment.existing_enrollment_needs_review'; end if;
  -- E6: same condition and message; the hint says whether any match is still selectable.
  if exists(select 1 from public.enrollments x where x.student_id=s.id and x.status not in ('Rejected','Ended') and coalesce(x.session_type,s.session_type)=session and crm_security.enrollment_year(x)=year) then
   raise exception 'Existing enrollment requires explicit selection' using errcode='22023',hint=case when exists(select 1 from public.enrollments x where x.student_id=s.id and x.status not in ('Rejected','Ended')
    and coalesce(x.session_type,s.session_type)=session and crm_security.enrollment_year(x)=year and not exists(select 1 from public.crm_leads where enrollment_id=x.id))
    then 'crm_enrollment.existing_enrollment_requires_selection' else 'crm_enrollment.existing_enrollment_linked_elsewhere' end; end if;
  if p_data->>'group_id' is not null then
   select * into g from public.groups where id=(p_data->>'group_id')::uuid for share;
   if not found or g.session_type is distinct from session or (level is not null and g.niveau is distinct from level) then raise exception 'Enrollment group must match session and level' using errcode='22023',hint='crm_enrollment.group_incompatible'; end if;
   level:=g.niveau;
   -- Batch H (H5): the enrollment year must be the group's (22023: the handler
   -- below turns 23514 into a generic refusal).
   perform academic_security.check_group_year(g.annee, year, '22023');
  end if;
  if not crm_security.valid_enrollment_level(session,level) and not coalesce(g.id is not null or s.session_type=session and s.niveau_cefr=level and p_data->>'student_choice'='existing',false) then raise exception 'Invalid level for selected program' using errcode='22023',hint='crm_enrollment.level_invalid'; end if;
  -- EGC (I3): a concurrent duplicate on the one-live-enrollment index is a
  -- record conflict (PT409, egc.duplicate_enrollment), not a raw 23505.
  begin
   insert into public.enrollments(student_id,session_type,school_year,level,group_id,status,date_inscription,notes)
   values(s.id,session,year,level,g.id,initial_status,public.business_date(),p_data->>'notes') returning * into e;
  exception when unique_violation then
   perform academic_security.duplicate();
  end;
 end if;
 update public.crm_leads set student_id=s.id,enrollment_id=e.id,version=version+1,updated_at=now() where id=l.id;
 insert into public.crm_activities(lead_id,enrollment_id,occurred_at,actor_id,actor_kind,event_type,source_key,body)
 values(l.id,e.id,now(),actor,'user','enrollment_started','enrollment-started:'||l.id||':'||e.id,'Inscription rattachée à l’apprenant.') returning id into a;
 perform crm_security.evaluate_conversion(l.id,statement_timestamp());
 if (select status from public.crm_leads where id=l.id)<>'CONVERTED' then
  -- Keep the earliest appropriate follow-up, cancel only redundant enrollment tasks.
  select * into t from public.crm_tasks where lead_id=l.id and task_type='enrollment_followup' and status='open' order by due_at,id limit 1 for update;
  if t.id is null then
   -- E7: pre-checks logically identical to next_window and new_task, in their
   -- order; new_task still validates. An empty string stays a parse error.
   begin
    followup_at:=(p_data->>'followup_at')::timestamptz;
   exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    raise exception 'Invalid enrollment fields or incompatible group' using errcode='22023',hint='crm_enrollment.followup_invalid';
   end;
   if not isfinite(followup_at) then raise exception 'Finite due time required' using errcode='22023',hint='crm_enrollment.followup_invalid'; end if;
   begin
    due:=crm_security.next_window(l.followup_policy_id,coalesce(followup_at,now()+interval '1 day'));
   exception when invalid_parameter_value then
    if sqlerrm='Policy has no available calling window' then
     raise exception 'Policy has no available calling window' using errcode='22023',hint='crm_enrollment.followup_policy_unavailable'; end if;
    raise;
   end;
   if due<now() then raise exception 'Valid future task required' using errcode='22023',hint='crm_enrollment.followup_in_past'; end if;
   if l.owner_id is not null and not exists(select 1 from public.profiles where id=l.owner_id and role in ('director','admin','receptionist')) then
    raise exception 'Assignee must be operational staff' using errcode='22023',hint='crm_enrollment.owner_not_operational'; end if;
   followup_task:=crm_security.new_task(l,jsonb_build_object('task_type','enrollment_followup','due_at',due,'instructions','Finaliser l’inscription avec le parent.'),'enrollment-followup:'||l.id||':'||e.id,'enrollment');
   followup:=jsonb_build_object('id',followup_task,'created',true);
  else
   keep_task:=t.id;
   for t in select * from public.crm_tasks where lead_id=l.id and task_type='enrollment_followup' and status='open' and id<>keep_task order by id for update loop
    perform crm_security.finish_task(t,true,'Suivi de cette inscription déjà prévu','enrollment-duplicate:'||e.id||':'||t.id);
   end loop;
   followup_task:=keep_task;followup:=jsonb_build_object('id',keep_task,'created',false);
  end if;
  -- E8: the created or retained task, read by id; never the loop variable.
  followup:=followup||crm_security.scheduled_civil((select due_at from public.crm_tasks where id=followup_task));
 end if;
 result:=crm_security.result(l.id,'enrollment-started:'||l.id||':'||e.id)||jsonb_build_object('enrollment',crm_security.enrollment_summary(e),'enrollment_followup',followup);
 insert into public.crm_command_requests(actor_scope,command_name,request_key,payload_hash,result) values(actor::text,'start_enrollment',p_request_key,digest,result);
 return result;
exception
 when deadlock_detected or unique_violation then raise exception 'Concurrent enrollment change; refresh and retry' using errcode='PT409',hint='crm_enrollment.concurrent_change';
 when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or check_violation or not_null_violation then raise exception 'Invalid enrollment fields or incompatible group' using errcode='22023',hint='crm_enrollment.record_rejected';
end $function$;
revoke execute on function public.crm_start_enrollment(uuid, jsonb) from public, anon, authenticated, service_role;

-- D3: « Inscrire et encaisser » for a CRM prospect. One transaction: the existing
-- CRM command (lead lock, learner, Confirmed enrollment, link, conversion) then the
-- existing payment command, each with its own idempotency. The payment key is
-- derived from the caller and the request key, never taken from the client. On a
-- first run the wrapper raises unless a receipt was issued, the enrollment is free
-- (100 % with a reason, Q1) or, without a payment object, the linked enrollment is
-- already paid (Q12); a raise rolls everything back. A replay skips that check.
create function public.crm_enroll_and_collect(p_request_key uuid, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
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
  -- (ii) The payment on that enrollment, from the stored enrollment summary so a
  -- replay sends the same request.
  if v_payment is not null then
    v_bytes := substring(sha256(convert_to('eap:payment:'||v_actor::text||':'||p_request_key::text, 'UTF8')) from 1 for 16);
    v_bytes := set_byte(v_bytes, 6, (get_byte(v_bytes, 6) & 15) | 80);
    v_bytes := set_byte(v_bytes, 8, (get_byte(v_bytes, 8) & 63) | 128);
    v_key := encode(v_bytes, 'hex')::uuid;
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
end $$;
revoke all on function public.crm_enroll_and_collect(uuid, jsonb) from public, anon, service_role;
grant execute on function public.crm_enroll_and_collect(uuid, jsonb) to authenticated;

-- ── D4: the other creation paths refuse (125 / 120 + EAP) ────────────────────
-- 125 + EAP: the group-assignment branch on a Confirmed or Validated row is unchanged.
CREATE OR REPLACE FUNCTION public.save_receptionist_enrollment(p_student uuid, p_enrollment uuid DEFAULT NULL::uuid, p_group uuid DEFAULT NULL::uuid, p_status text DEFAULT 'Submitted'::text, p_level text DEFAULT NULL::text, p_date date DEFAULT public.business_date(), p_notes text DEFAULT NULL::text, p_session text DEFAULT NULL::text, p_school_year text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare s public.students%rowtype; e public.enrollments%rowtype; g public.groups%rowtype;
  result uuid; effective_session text; effective_level text; effective_year text; v_constraint text;
begin
  perform operational_security.require_receptionist();
  select * into s from public.students where id=p_student and deleted_at is null for update;
  if not found then raise exception 'Student unavailable' using errcode='23514'; end if;
  if p_enrollment is not null then
    select * into e from public.enrollments where id=p_enrollment for update;
    if not found or e.student_id is distinct from p_student then
      raise exception 'Enrollment unavailable' using errcode='23514'; end if;
  end if;
  if e.id is not null and (
    (e.session_type is not null and p_session is not null and p_session<>e.session_type) or
    (e.school_year is not null and p_school_year is not null and p_school_year<>e.school_year)) then
    raise exception 'Existing enrollment session/year is immutable' using errcode='42501'; end if;
  effective_session:=coalesce(e.session_type,p_session,s.session_type);
  effective_year:=coalesce(e.school_year,p_school_year);
  effective_level:=coalesce(p_level,e.level,case
    when operational_security.valid_session_level(effective_session,s.niveau_cefr)
    then s.niveau_cefr end);
  if effective_session not in ('Yearly','Adults','Summer Camp','Communication Junior',
      'Communication Adult','One-to-One','Mise à niveau','Other','Online','Online One-to-One') or
    (effective_year is not null and effective_year !~ '^[0-9]{4}/[0-9]{4}$') then
    raise exception 'Invalid enrollment session/year' using errcode='22023'; end if;
  if operational_security.valid_session_level(effective_session,effective_level) is not true then
    raise exception 'Invalid enrollment session/level' using errcode='23514'; end if;
  if p_group is not null then
    select * into g from public.groups where id=p_group for share;
    if not found or g.session_type is distinct from effective_session then
      raise exception 'Enrollment group must match its session and level' using errcode='23514'; end if;
    effective_level:=coalesce(effective_level,g.niveau);
    if g.niveau is distinct from effective_level then
      raise exception 'Enrollment group must match its session and level' using errcode='23514'; end if;
    -- Batch H (H5): the year comes from the group when none is given, and must match it.
    effective_year:=coalesce(effective_year,academic_security.school_year_of(g.annee));
    perform academic_security.check_group_year(g.annee, effective_year);
  end if;
  if effective_year is not null and exists(select 1 from public.enrollments x where x.student_id=p_student
    and x.session_type=effective_session and x.school_year=effective_year and x.status not in ('Rejected','Ended')
    and x.id is distinct from e.id) then
    perform academic_security.duplicate(); end if;
  begin
  if e.status in ('Confirmed','Validated') then
    if p_group is null or p_status not in ('Confirmed','Validated') then
      raise exception 'Only group assignment is permitted' using errcode='42501'; end if;
    update public.enrollments set group_id=p_group,level=effective_level,
      session_type=effective_session,status='Validated'
    where id=e.id returning id into result;
  else
    -- EAP (D4): no pre-enrollment any more; an enrollment is born at the payment.
    raise exception 'La pré-inscription et l’essai n’existent plus : l’inscription se confirme à l’encaissement.'
      using errcode='42501', hint='eap.status_retired';
  end if;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'enrollments_one_active_programme_year' then perform academic_security.duplicate(); end if;
    raise;
  end;
  return result;
end $function$;

-- 120 + EAP: kept (not dropped) so an old build gets the French message.
create or replace function public.create_enrollment(p_student uuid, p_changes jsonb)
returns uuid language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_status text; v_session text; v_year text; v_level text; v_id uuid; v_constraint text;
begin
  if coalesce(public.get_my_role(), '') not in ('director','admin') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  -- EAP (D4): a new enrollment is born at the payment (« Inscrire et encaisser »).
  raise exception 'La pré-inscription et l’essai n’existent plus : l’inscription se confirme à l’encaissement.'
    using errcode = '42501', hint = 'eap.status_retired';
  perform operational_security.assert_keys(p_changes, array['status','level','date_inscription','notes','session_type','school_year']);
  perform academic_security.lock_learner(p_student, null, false);
  v_status := coalesce(nullif(p_changes->>'status', ''), 'Submitted');
  v_session := nullif(p_changes->>'session_type', '');
  v_year := nullif(p_changes->>'school_year', '');
  v_level := nullif(p_changes->>'level', '');
  if v_status not in ('Submitted','Under Review') then
    raise exception 'Une nouvelle inscription est soumise ou en cours d’examen ; l’essai et la validation passent par le groupe.'
      using errcode = '22023', hint = 'egc.status_not_permitted';
  end if;
  if v_session is null or operational_security.valid_session_level(v_session, null) is not true
     or not academic_security.valid_school_year(v_year) then
    raise exception 'Programme et année scolaire requis.' using errcode = '22023', hint = 'egc.programme_required';
  end if;
  if operational_security.valid_session_level(v_session, v_level) is not true then
    raise exception 'Niveau incompatible avec le programme.' using errcode = '22023', hint = 'egc.level_invalid';
  end if;
  if char_length(coalesce(p_changes->>'notes', '')) > 2000 then
    raise exception 'Notes trop longues.' using errcode = '22023';
  end if;
  if exists (select 1 from public.enrollments x where x.student_id = p_student and x.session_type = v_session
      and x.school_year = v_year and x.status not in ('Rejected','Ended')) then
    perform academic_security.duplicate();
  end if;
  begin
    insert into public.enrollments(student_id, status, session_type, school_year, level, date_inscription, notes)
    values (p_student, v_status, v_session, v_year, v_level,
      coalesce(nullif(p_changes->>'date_inscription', '')::date, academic_security.today()), nullif(p_changes->>'notes', ''))
    returning id into v_id;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'enrollments_one_active_programme_year' then perform academic_security.duplicate(); end if;
    raise;
  end;
  return v_id;
end $$;

-- 120 + EAP (Q5): level, date and notes only; Ended rows unchanged.
create or replace function public.save_enrollment_changes(p_enrollment uuid, p_expected_updated_at timestamptz, p_changes jsonb)
returns uuid language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare e public.enrollments; g public.groups; v_student uuid; v_status text; v_session text; v_year text;
  v_level text; v_constraint text;
begin
  if coalesce(public.get_my_role(), '') not in ('director','admin') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  perform operational_security.assert_keys(p_changes, array['status','level','date_inscription','notes','session_type','school_year']);
  if p_changes = '{}'::jsonb then raise exception 'Aucune modification.' using errcode = '22023'; end if;
  select x.student_id into v_student from public.enrollments x where x.id = p_enrollment;
  if not found then perform academic_security.stale(); end if;
  perform academic_security.lock_learner(v_student, null, false);
  select * into e from public.enrollments where id = p_enrollment for update;
  if not found or p_expected_updated_at is null or e.updated_at is distinct from p_expected_updated_at then
    perform academic_security.stale();
  end if;
  if e.status = 'Ended' and exists (select 1 from jsonb_object_keys(p_changes) k where k <> 'notes') then
    raise exception 'Une inscription terminée ne se modifie que par ses notes.' using errcode = '23514', hint = 'egc.ended_read_only';
  end if;
  v_status := case when p_changes ? 'status' then p_changes->>'status' else e.status end;
  v_session := case when p_changes ? 'session_type' then nullif(p_changes->>'session_type', '') else e.session_type end;
  v_year := case when p_changes ? 'school_year' then nullif(p_changes->>'school_year', '') else e.school_year end;
  v_level := case when p_changes ? 'level' then nullif(p_changes->>'level', '') else e.level end;
  -- EAP (D4, Q5): no status change here any more; an unchanged status key passes.
  if v_status is distinct from e.status then
    raise exception 'Ce changement de statut passe par le paiement, l’affectation ou « Ancien apprenant ».'
      using errcode = '23514', hint = 'egc.status_not_permitted';
  end if;
  if (e.session_type is not null and v_session is distinct from e.session_type)
     or (e.school_year is not null and v_year is distinct from e.school_year) then
    raise exception 'Le programme et l’année scolaire ne changent plus une fois fixés.' using errcode = '23514', hint = 'egc.programme_fixed';
  end if;
  if (v_session is not null and operational_security.valid_session_level(v_session, v_level) is not true)
     or (v_year is not null and not academic_security.valid_school_year(v_year)) then
    raise exception 'Programme, niveau ou année scolaire invalide.' using errcode = '22023', hint = 'egc.level_invalid';
  end if;
  if e.group_id is not null then
    select * into g from public.groups where id = e.group_id for share;
    if (v_session is not null and v_session is distinct from g.session_type)
       or (v_level is not null and v_level is distinct from g.niveau) then
      raise exception 'Le groupe doit correspondre au programme et au niveau de l’inscription.'
        using errcode = '23514', hint = 'egc.group_mismatch';
    end if;
  end if;
  if v_status not in ('Rejected','Ended') and v_session is not null and v_year is not null and exists (
      select 1 from public.enrollments x where x.student_id = e.student_id and x.id <> e.id
        and x.session_type = v_session and x.school_year = v_year and x.status not in ('Rejected','Ended')) then
    perform academic_security.duplicate();
  end if;
  begin
    update public.enrollments set status = v_status, session_type = v_session, school_year = v_year, level = v_level,
      date_inscription = case when p_changes ? 'date_inscription' then nullif(p_changes->>'date_inscription', '')::date else date_inscription end,
      notes = case when p_changes ? 'notes' then nullif(p_changes->>'notes', '') else notes end
    where id = e.id;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'enrollments_one_active_programme_year' then perform academic_security.duplicate(); end if;
    raise;
  end;
  return e.id;
end $$;

-- 120 + EAP (Q11).
create or replace function public.reopen_enrollment(p_enrollment uuid, p_expected_updated_at timestamptz)
returns uuid language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare e public.enrollments; v_student uuid; v_flag text; v_constraint text;
begin
  if coalesce(public.get_my_role(), '') not in ('director','admin') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  select x.student_id into v_student from public.enrollments x where x.id = p_enrollment;
  if not found then perform academic_security.stale(); end if;
  perform academic_security.lock_learner(v_student, null, false);
  select * into e from public.enrollments where id = p_enrollment for update;
  if not found or p_expected_updated_at is null or e.updated_at is distinct from p_expected_updated_at then
    perform academic_security.stale();
  end if;
  if e.status is distinct from 'Ended' then
    raise exception 'Seule une inscription terminée peut être rouverte.' using errcode = '23514', hint = 'egc.not_ended';
  end if;
  -- EAP (Q11): a row the archive step ended (journal membership, never the text of
  -- end_reason) does not reopen unless the archive revert restored it.
  if exists (select 1 from maintenance.eap_archive_journal j where j.entity = 'enrollments' and j.row_id = e.id
      and j.action = 'ended' and not exists (select 1 from maintenance.eap_archive_journal r
        where r.action = 'reverted' and r.reverts_id = j.id)) then
    raise exception 'Une pré-inscription archivée ne se rouvre pas : inscrivez et encaissez.'
      using errcode = '23514', hint = 'eap.archived_not_reopenable';
  end if;
  if e.session_type is null or e.school_year is null then
    raise exception 'Programme et année scolaire requis pour rouvrir cette inscription.'
      using errcode = '22023', hint = 'egc.programme_required';
  end if;
  if exists (select 1 from public.enrollments x where x.student_id = e.student_id and x.id <> e.id
      and x.session_type = e.session_type and x.school_year = e.school_year and x.status not in ('Rejected','Ended')) then
    perform academic_security.duplicate();
  end if;
  v_flag := academic_security.set_flag('eh.enrollment_command', 'on');
  begin
    update public.enrollments set status = 'Confirmed', group_id = null, ended_at = null, ended_by = null,
      end_reason = null, ended_group_id = null
    where id = e.id;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'enrollments_one_active_programme_year' then perform academic_security.duplicate(); end if;
    raise;
  end;
  perform academic_security.set_flag('eh.enrollment_command', v_flag);
  perform academic_security.log('reopen', e.id, e.student_id, null, null);
  return e.id;
end $$;

-- 125 + EAP: the service_role grant is kept; nothing else can call it.
CREATE OR REPLACE FUNCTION public.create_public_registration(p_payload jsonb, p_request_id uuid, p_hash text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare
  v_existing record;
  v_student_id uuid;
begin
  -- EAP (D4): the public self sign-up is closed; the route answers 410 first.
  raise exception 'Les inscriptions en ligne sont fermées. Contactez le centre.'
    using errcode = '42501', hint = 'eap.public_registration_retired';
  if p_request_id is null or p_hash !~ '^[0-9a-f]{64}$'
    or p_payload->>'consent' <> 'true'
    or coalesce(pg_catalog.btrim(p_payload->>'full_name'), '') = ''
    or coalesce(pg_catalog.btrim(p_payload->>'telephone'), '') = ''
    or (coalesce(p_payload->>'email','') = '' and coalesce(p_payload->>'parent_email','') = '') then
    raise exception 'Invalid public registration' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('registration:' || p_request_id::text, 0));
  select e.student_id, e.registration_payload_hash into v_existing
  from public.enrollments e where e.registration_request_id = p_request_id;
  if found then
    if v_existing.registration_payload_hash <> p_hash then
      raise exception 'Registration request key reused with changed data' using errcode = '23505';
    end if;
    return v_existing.student_id;
  end if;
  insert into public.students
    (full_name, date_naissance, telephone, email, parent_email, age_category,
     session_type, niveau_cefr, notes, status)
  values
    (p_payload->>'full_name', nullif(p_payload->>'date_naissance','')::date,
     p_payload->>'telephone', nullif(p_payload->>'email',''),
     nullif(p_payload->>'parent_email',''), nullif(p_payload->>'age_category',''),
     coalesce(nullif(p_payload->>'session_type',''),'Yearly'),
     nullif(p_payload->>'niveau_cefr',''), nullif(p_payload->>'notes',''), 'Prospect')
  returning id into v_student_id;
  insert into public.enrollments
    (student_id, status, date_inscription, documents_urls, notes,
     registration_request_id, registration_payload_hash, consent_at,
     consent_policy_version, consent_source)
  values
    (v_student_id, 'Submitted', (pg_catalog.clock_timestamp() at time zone public.centre_utc_offset())::date,
     array[]::text[], nullif(p_payload->>'notes',''), p_request_id, p_hash,
     pg_catalog.clock_timestamp(), 'public-privacy-2026-09-17', 'public_inscription');
  return v_student_id;
end;
$function$;

-- 125 + EAP (Q8 = A).
CREATE OR REPLACE FUNCTION public.portal_request_reenrollment(p_student_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare v_id uuid;
begin
  if public.get_my_role() is distinct from 'parent' then
    perform portal_security.fail('forbidden', '42501', 'Réservé aux parents.');
  end if;
  if p_student_id is null or p_student_id not in (select public.get_visible_student_ids()) then
    perform portal_security.fail('not_linked', '42501', 'Cet apprenant n’est pas lié à votre compte.');
  end if;
  -- EAP (D4, Q8 = A): a re-enrollment goes through reception (« Inscrire et encaisser »).
  raise exception 'La pré-inscription et l’essai n’existent plus : l’inscription se confirme à l’encaissement.'
    using errcode = '42501', hint = 'eap.status_retired';
  insert into public.enrollments(student_id, status, date_inscription, notes)
  values (p_student_id, 'Submitted', (now() at time zone public.centre_utc_offset())::date,
    'Demande de réinscription envoyée depuis l’espace parent.')
  returning id into v_id;
  return v_id;
end $function$;

-- ── Q3 = B: placement follows a paid enrollment (120 + EAP) ──────────────────
-- The added parameter changes both identities: drop the 120 signatures so the
-- existing positional callers (place_learner_in_group, and
-- assign_receptionist_student_group with eight arguments) resolve to the single
-- new signature through its default.
drop function public.place_learner_in_group(uuid, uuid, timestamptz, uuid, text, timestamptz, text);
drop function academic_security.place(uuid, uuid, uuid, text, timestamptz, timestamptz, text, boolean);
create function academic_security.place(p_student uuid, p_group uuid, p_enrollment uuid, p_school_year text,
  p_student_updated_at timestamptz, p_enrollment_updated_at timestamptz, p_override_reason text, p_require_fresh boolean,
  p_without_enrollment_reason text default null)
returns uuid language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare s public.students; e public.enrollments; g public.groups; v_locked public.groups;
  v_ids uuid[]; v_year text; v_id uuid; v_full boolean := false; v_flag text; v_constraint text;
  v_reason text := nullif(btrim(p_override_reason), '');
  v_role text := public.get_my_role();
begin
  s := academic_security.lock_learner(p_student, p_student_updated_at, p_require_fresh);
  select * into g from public.groups where id = p_group;
  if not found then raise exception 'Groupe introuvable.' using errcode = '23514', hint = 'egc.group_unavailable'; end if;
  if p_enrollment is not null then
    select * into e from public.enrollments where id = p_enrollment for update;
    if not found or e.student_id is distinct from p_student or (p_require_fresh
        and (p_enrollment_updated_at is null or e.updated_at is distinct from p_enrollment_updated_at)) then
      perform academic_security.stale();
    end if;
  else
    -- DAT-1: only the enrollment of this group's programme; others stay untouched.
    v_year := coalesce(nullif(btrim(p_school_year), ''), academic_security.school_year_of(g.annee));
    if not academic_security.valid_school_year(v_year) then
      raise exception 'Année scolaire requise pour cette affectation.' using errcode = '22023', hint = 'egc.school_year_required';
    end if;
    select array_agg(x.id order by x.id) into v_ids from public.enrollments x
    where x.student_id = p_student and x.session_type = g.session_type and x.school_year = v_year
      and x.status in ('Submitted','Under Review','Confirmed','Validated','Trial');
    if cardinality(v_ids) > 1 or (v_ids is null and exists (select 1 from public.enrollments x
        where x.student_id = p_student and coalesce(x.session_type, g.session_type) = g.session_type
          and x.school_year is distinct from v_year and x.group_id is null
          and x.status in ('Submitted','Under Review','Confirmed'))) then
      raise exception 'Sélectionnez l’inscription à affecter.' using errcode = '23514', hint = 'egc.select_enrollment';
    end if;
    if v_ids is not null then
      select * into e from public.enrollments where id = v_ids[1] for update;
      -- D1: one group per programme and year; moving needs the enrollment named.
      if e.group_id is not null and e.group_id <> p_group then
        raise exception 'Cet apprenant est déjà dans un autre groupe de ce programme pour cette année.'
          using errcode = '23514', hint = 'egc.already_placed';
      end if;
    end if;
  end if;
  -- The group last: the share lock holds its programme and level (I5) for the write.
  select * into v_locked from public.groups where id = p_group for share;
  if not found or v_locked.session_type is distinct from g.session_type or v_locked.niveau is distinct from g.niveau
     or v_locked.annee is distinct from g.annee then
    perform academic_security.stale();
  end if;
  if e.id is not null then
    if e.status not in ('Submitted','Under Review','Confirmed','Validated','Trial') then
      raise exception 'Cette inscription ne peut pas être affectée.' using errcode = '23514', hint = 'egc.enrollment_not_placeable';
    end if;
    -- While placed, an enrollment's level is its group's (I4): a move takes the
    -- new group's level; an unplaced enrollment with a level must match.
    if coalesce(e.session_type, g.session_type) is distinct from g.session_type
       or (e.group_id is null and e.level is not null and e.level is distinct from g.niveau) then
      raise exception 'Le groupe doit correspondre au programme et au niveau de l’inscription.'
        using errcode = '23514', hint = 'egc.group_mismatch';
    end if;
    if e.group_id is not distinct from p_group then return e.id; end if;
    v_year := coalesce(e.school_year, nullif(btrim(p_school_year), ''), academic_security.school_year_of(g.annee));
    if e.status in ('Confirmed','Validated','Trial') and not academic_security.valid_school_year(v_year) then
      raise exception 'Année scolaire requise pour cette affectation.' using errcode = '22023', hint = 'egc.school_year_required';
    end if;
  end if;
  -- EAP (Q3 = B): a placement follows a paid enrollment. Reception places only a
  -- Confirmed or Validated enrollment of the group's programme and year; director
  -- and admin may place a learner without one (creating the enrollment, or placing
  -- a legacy unpaid row) with a dedicated reason, distinct from the capacity
  -- override, logged and listed in Contrôles.
  if e.id is null or e.status not in ('Confirmed','Validated') then
    if coalesce(v_role, '') = 'receptionist' then
      raise exception 'Inscrivez et encaissez d’abord : l’affectation suit une inscription payée.'
        using errcode = '23514', hint = 'eap.paid_enrollment_required';
    end if;
    if not academic_security.valid_reason(p_without_enrollment_reason) then
      raise exception 'Motif requis pour affecter sans inscription payée (200 caractères au plus).'
        using errcode = '23514', hint = 'eap.placement_reason_required';
    end if;
  end if;
  -- I6: capacity, overridable by director/admin with a reason (D4-A).
  if not online_security.is_online_type(g.session_type) and g.capacite_max is not null then
    perform pg_advisory_xact_lock(hashtextextended('group:seats:' || p_group::text, 0));
    v_full := academic_security.seats_taken(p_group, p_student) >= g.capacite_max;
    if v_full and v_reason is null then
      raise exception 'Ce groupe est complet.' using errcode = '23514', hint = 'egc.capacity';
    end if;
    if v_full and (coalesce(public.get_my_role(), '') not in ('director','admin') or char_length(v_reason) > 200) then
      raise exception 'Seule la direction peut dépasser la capacité, avec un motif de 200 caractères au plus.'
        using errcode = '42501', hint = 'egc.capacity_override_forbidden';
    end if;
  end if;
  v_flag := academic_security.set_flag('eh.capacity_override', case when v_full then 'on' else '' end);
  begin
    if e.id is not null then
      update public.enrollments set group_id = p_group, session_type = g.session_type,
        level = case when e.group_id is null then coalesce(e.level, g.niveau) else g.niveau end, school_year = v_year
      where id = e.id returning id into v_id;
    else
      insert into public.enrollments(student_id, group_id, status, level, session_type, school_year, date_inscription)
      values (p_student, p_group, 'Validated', g.niveau, g.session_type, v_year, academic_security.today())
      returning id into v_id;
    end if;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'enrollments_one_active_programme_year' then perform academic_security.duplicate(); end if;
    raise;
  end;
  perform academic_security.set_flag('eh.capacity_override', v_flag);
  if v_full then
    perform academic_security.log('capacity_override', v_id, p_student, p_group, jsonb_build_object('reason', btrim(v_reason)));
  end if;
  if e.id is null or e.status not in ('Confirmed','Validated') then
    perform academic_security.log('placement_without_enrollment', v_id, p_student, p_group,
      jsonb_build_object('reason', btrim(p_without_enrollment_reason), 'author_role', v_role));
  end if;
  return v_id;
end $$;

create function public.place_learner_in_group(p_student uuid, p_group uuid, p_student_updated_at timestamptz,
  p_enrollment uuid default null, p_school_year text default null, p_enrollment_updated_at timestamptz default null,
  p_capacity_override_reason text default null, p_without_enrollment_reason text default null)
returns uuid language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  perform operational_security.require_capability('assign_group');
  return academic_security.place(p_student, p_group, p_enrollment, p_school_year, p_student_updated_at,
    p_enrollment_updated_at, p_capacity_override_reason, true, p_without_enrollment_reason);
end $$;
revoke all on function academic_security.place(uuid, uuid, uuid, text, timestamptz, timestamptz, text, boolean, text)
  from public, anon, authenticated, service_role;
revoke all on function public.place_learner_in_group(uuid, uuid, timestamptz, uuid, text, timestamptz, text, text)
  from public, anon, service_role;
grant execute on function public.place_learner_in_group(uuid, uuid, timestamptz, uuid, text, timestamptz, text, text)
  to authenticated;

-- ── D7: detach exemption (084 + EAP; LIR-r1 2e reuses it) ────────────────────
create or replace function crm_security.protect_enrollment_link() returns trigger
language plpgsql set search_path=pg_catalog,pg_temp as $$ begin
 if old.enrollment_id is not null and (new.enrollment_id is distinct from old.enrollment_id or new.student_id is distinct from old.student_id)
 -- EAP (D7, Q6) and LIR-r1 2e: under the transaction-local flag eh.crm_detach, a
 -- non-converted lead's link to an Ended or Rejected enrollment may be cleared
 -- (learner kept). Nothing else changes; conversions stay immutable below.
 and not (current_setting('eh.crm_detach', true) = 'on' and new.enrollment_id is null
  and new.student_id is not distinct from old.student_id and old.status<>'CONVERTED' and old.converted_at is null
  and exists (select 1 from public.enrollments x where x.id=old.enrollment_id and x.status in ('Ended','Rejected'))) then
  raise exception 'CRM enrollment link is immutable' using errcode='42501'; end if;
 if old.converted_at is not null and (new.converted_at is distinct from old.converted_at or new.conversion_activity_id is distinct from old.conversion_activity_id or new.status<>'CONVERTED') then
  raise exception 'Historical conversion is immutable' using errcode='42501'; end if;
 return new;
end $$;

notify pgrst, 'reload schema';
commit;
