-- MANUAL, SEPARATELY APPROVED PRODUCTION DATA STEP D2 (plan payment-corrections-receipts.md,
-- PCR-r2 data clean-up). Not run by any release step or CI. Run only after migration 122,
-- with the owner's approval of the counts re-read on the day (2 enrollments, 1 lead on
-- 2026-10-24; 0 if Plan D's C4 has already ended them).
--
-- What it changes: for each Confirmed or Validated enrollment that once had a receipt and
-- has no live one, it takes the P1.1 locks (shared enrollment-intent lock, learner,
-- enrollment) and calls finance_security.review_enrollment_without_live_payment with the
-- key 'payment-void-review-backfill:<enrollment id>'. A CONVERTED, unflagged linked lead
-- is flagged with one review activity. Enrollment, learner and lead statuses never change.
-- The key is per enrollment and a flagged lead is skipped, so a rerun changes nothing.
--
-- Private journal first (ids only):
--   \copy (select e.id enrollment_id, l.id lead_id, l.conversion_review_required, l.version
--          from public.enrollments e left join public.crm_leads l on l.enrollment_id = e.id and l.merged_into_lead_id is null
--          where e.status in ('Confirmed','Validated')
--            and exists (select 1 from public.receipts r where r.enrollment_id = e.id or r.charge_id in (select c.id from public.charges c where c.enrollment_id = e.id))
--            and not exists (select 1 from public.receipts r where r.voided_at is null and r.deleted_at is null
--              and (r.enrollment_id = e.id or r.charge_id in (select c.id from public.charges c where c.enrollment_id = e.id))))
--     to 'd2_journal.csv' with (format csv, header)
--   set batch_e.d2_expected_enrollments = '<rows>';
--   set batch_e.d2_expected_flags = '<CONVERTED leads not yet flagged>';
--   \i supabase/manual/batch_e_d2_unpaid_confirmed_enrollments.sql
-- Reverse: supabase/manual/batch_e_d2_reverse.sql.
\set ON_ERROR_STOP on
begin;
create temp table d2_target on commit drop as
select e.id as enrollment_id, e.student_id
from public.enrollments e
where e.status in ('Confirmed','Validated')
  and exists (select 1 from public.receipts r where r.enrollment_id = e.id
    or r.charge_id in (select c.id from public.charges c where c.enrollment_id = e.id))
  and not exists (select 1 from public.receipts r where r.voided_at is null and r.deleted_at is null
    and (r.enrollment_id = e.id or r.charge_id in (select c.id from public.charges c where c.enrollment_id = e.id)));

do $$
declare
  v_target record;
  v_flags_before integer;
  v_expected_flags integer := nullif(current_setting('batch_e.d2_expected_flags', true), '')::integer;
begin
  if (select count(*) from d2_target) is distinct from nullif(current_setting('batch_e.d2_expected_enrollments', true), '')::integer then
    raise exception 'D2 refused: expected % enrollments, found %', current_setting('batch_e.d2_expected_enrollments', true), (select count(*) from d2_target);
  end if;
  select count(*) into v_flags_before from public.crm_leads where conversion_review_required;
  for v_target in select * from d2_target order by enrollment_id loop
    if not pg_try_advisory_xact_lock_shared(hashtextextended('crm:enrollment-intent:' || v_target.student_id, 0)) then
      raise exception 'D2 refused: enrollment or payment in progress for a learner; retry later' using errcode = 'PT409';
    end if;
    perform 1 from public.students where id = v_target.student_id for update;
    perform 1 from public.enrollments where id = v_target.enrollment_id for update;
    perform finance_security.review_enrollment_without_live_payment(v_target.enrollment_id,
      'payment-void-review-backfill:' || v_target.enrollment_id, jsonb_build_object('action', 'backfill_d2'));
  end loop;
  if (select count(*) from public.crm_leads where conversion_review_required) - v_flags_before is distinct from v_expected_flags then
    raise exception 'D2 after-check failed: expected % new flags', v_expected_flags;
  end if;
end $$;
commit;
