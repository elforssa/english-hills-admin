-- RWR-r5 §9 « Enforced writers », rehearsed in A1: with M-A2's one-open-action
-- unique index in place (PR A2 ships the real index and presence triggers), every
-- writer of the §4.2 inventory still succeeds through the command-driven suites:
-- new commands and old wrappers (test-crm-next-action, rcc-a1), test results from
-- the CRM, Admissions table updates and teachers (phase5, student-placement),
-- enrolment start, « Inscrire et encaisser » and conversion (phase6, enrollment-at-
-- payment, course-dates-close), Meta and website intake and resubmission (phase8,
-- phase9, lead-ad-source, dgi-b, dgi-b2), lifecycle and advisory (phase10, batch2,
-- meta-funnel-r4, r4-advisory), insights (phase11), the end-to-end day (phase12-e2e).
-- test-crm-rcc-a2 is left out on purpose: its fixture writes pre-D1 duplicates
-- directly to prove the legacy enrolment de-duplication.
-- Each included suite rolls itself back; the rehearsal index is dropped at the end
-- (and first, if an earlier failed run left it).
\set ON_ERROR_STOP on
drop index if exists public.crm_tasks_one_open_rehearsal;
create unique index crm_tasks_one_open_rehearsal on public.crm_tasks(lead_id) where status='open';
\ir test-crm-next-action.sql
\ir test-crm-rcc-a1.sql
\ir test-crm-phase5.sql
\ir test-student-placement.sql
\ir test-crm-phase6.sql
\ir test-crm-phase7.sql
\ir test-enrollment-at-payment.sql
\ir test-course-dates-close.sql
\ir test-crm-phase8.sql
\ir test-crm-phase9.sql
\ir test-crm-lead-ad-source.sql
\ir test-crm-dgi-b.sql
\ir test-crm-dgi-b2.sql
\ir test-crm-phase10.sql
\ir test-crm-batch2.sql
\ir test-crm-meta-funnel-r4.sql
\ir test-crm-r4-advisory.sql
\ir test-crm-phase11.sql
\ir test-crm-phase12-e2e.sql
do $$ begin
 if exists(select 1 from public.crm_tasks where status='open' group by lead_id having count(*)>1) then
  raise exception 'FAIL: two open actions on one prospect after the enforced run'; end if;
end $$;
drop index public.crm_tasks_one_open_rehearsal;
\echo PASS enforced writers: every inventory writer succeeds under the one-open-action index
