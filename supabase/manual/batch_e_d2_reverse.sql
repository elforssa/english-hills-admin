-- REVERSE OF D2. Review activities are append-only and stay as history; the reverse
-- clears the flags D2 raised (from the D2 journal) and records why.
--   create temp table d2_journal(enrollment_id uuid, lead_id uuid, conversion_review_required boolean, version bigint);
--   \copy d2_journal from 'd2_journal.csv' with (format csv, header)
--   \i supabase/manual/batch_e_d2_reverse.sql
\set ON_ERROR_STOP on
begin;
insert into public.crm_activities(lead_id, enrollment_id, occurred_at, actor_kind, event_type, source_key, body, details)
select l.id, l.enrollment_id, clock_timestamp(), 'system', 'conversion_review_cleared', 'payment-void-review-backfill-reverse:' || l.enrollment_id,
  'Reprise D2 annulée : vérification levée.', jsonb_build_object('action', 'backfill_d2_reverse')
from public.crm_leads l join d2_journal j on j.lead_id = l.id
where not j.conversion_review_required and l.conversion_review_required
  and exists (select 1 from public.crm_activities a where a.lead_id = l.id and a.source_key = 'payment-void-review-backfill:' || l.enrollment_id);
update public.crm_leads l set conversion_review_required = false, version = version + 1, updated_at = now()
from d2_journal j
where j.lead_id = l.id and not j.conversion_review_required and l.conversion_review_required
  and exists (select 1 from public.crm_activities a where a.lead_id = l.id and a.source_key = 'payment-void-review-backfill:' || l.enrollment_id);
commit;
