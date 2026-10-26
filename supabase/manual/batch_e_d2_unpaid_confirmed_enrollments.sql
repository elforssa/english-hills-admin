-- MANUAL, SEPARATELY APPROVED PRODUCTION DATA STEP D2 (plan payment-corrections-receipts.md,
-- PCR-r2 data clean-up). Not run by any release step or CI. Run only after migration 122,
-- with the owner's approval of the counts re-read on the day (2 enrollments, 1 lead on
-- 2026-10-24; 0 if Plan D's C4 has already ended them).
--
-- What it changes: for each Confirmed or Validated enrollment that once had a receipt and
-- has no live one, it takes the P1.1 locks (shared enrollment-intent lock, learner,
-- enrollment) and calls finance_security.review_enrollment_without_live_payment with the
-- key 'payment-void-review-backfill:<enrollment id>'. A CONVERTED, unflagged, unmerged linked
-- lead is flagged with one review activity. Enrollment, learner and lead statuses never
-- change. A flagged lead is skipped, so a rerun changes nothing.
--
-- Plain SQL, one call: journal first (batch_e_d2_journal.sql, read-only, save the JSON
-- privately), set the parameters from it, dry run, then dry_run 'off' with the owner's go:
--   supabase db query --linked --project-ref <ref> -f supabase/manual/batch_e_d2_unpaid_confirmed_enrollments.sql
-- Reverse: supabase/manual/batch_e_d2_reverse.sql.
begin;
-- PARAMETERS (transaction-local).
select set_config('batch_e.d2_expected_enrollments', '2', true);
select set_config('batch_e.d2_expected_flags', '1', true);
select set_config('batch_e.dry_run', 'on', true);

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
  v_expected_enrollments integer := current_setting('batch_e.d2_expected_enrollments')::integer;
  v_expected_flags integer := current_setting('batch_e.d2_expected_flags')::integer;
  v_flaggable integer;
  v_flagged integer;
  v_activities integer;
begin
  if (select count(*) from d2_target) <> v_expected_enrollments then
    raise exception 'D2 refused: expected % enrollments, found %', v_expected_enrollments, (select count(*) from d2_target);
  end if;
  select count(*) into v_flaggable from public.crm_leads l join d2_target t on t.enrollment_id = l.enrollment_id
  where l.merged_into_lead_id is null and l.status = 'CONVERTED' and not l.conversion_review_required;
  if v_flaggable <> v_expected_flags then
    raise exception 'D2 refused: expected % leads to flag, found %', v_expected_flags, v_flaggable;
  end if;
  for v_target in select * from d2_target order by enrollment_id loop
    if not pg_try_advisory_xact_lock_shared(hashtextextended('crm:enrollment-intent:' || v_target.student_id, 0)) then
      raise exception 'D2 refused: enrollment or payment in progress for a learner; retry later' using errcode = 'PT409';
    end if;
    perform 1 from public.students where id = v_target.student_id for update;
    perform 1 from public.enrollments where id = v_target.enrollment_id for update;
    perform finance_security.review_enrollment_without_live_payment(v_target.enrollment_id,
      'payment-void-review-backfill:' || v_target.enrollment_id, jsonb_build_object('action', 'backfill_d2'));
  end loop;
  select count(*) into v_flagged from public.crm_leads l join d2_target t on t.enrollment_id = l.enrollment_id
  where l.merged_into_lead_id is null and l.conversion_review_required;
  select count(*) into v_activities from public.crm_activities a join d2_target t on t.enrollment_id = a.enrollment_id
  where a.source_key = 'payment-void-review-backfill:' || t.enrollment_id;
  if v_activities <> v_expected_flags or v_flagged < v_expected_flags
     or exists (select 1 from d2_target t join public.enrollments e on e.id = t.enrollment_id where e.status not in ('Confirmed','Validated')) then
    raise exception 'D2 after-check failed: % activities, % flagged leads', v_activities, v_flagged;
  end if;
  if current_setting('batch_e.dry_run') = 'on' then
    raise exception 'DRYRUN_OK D2 enrollments=% flags=%', v_expected_enrollments, v_activities;
  end if;
end $$;
commit;
