-- REVERSE OF D2. Only with the owner's explicit approval; plain SQL, one call, dry run first.
-- Review activities are append-only and stay as history; the reverse clears the flags D2
-- raised and records why. Target: leads still flagged whose only review since conversion is
-- D2's backfill activity (key 'payment-void-review-backfill:<enrollment id>'). No journal needed.
begin;
-- PARAMETERS (transaction-local): expected = leads D2 flagged.
select set_config('batch_e.d2_expected_flags', '1', true);
select set_config('batch_e.dry_run', 'on', true);

create temp table d2_reverse on commit drop as
select l.id as lead_id, l.enrollment_id
from public.crm_leads l
where l.conversion_review_required and l.merged_into_lead_id is null
  and exists (select 1 from public.crm_activities a where a.lead_id = l.id
    and a.source_key = 'payment-void-review-backfill:' || l.enrollment_id)
  and not exists (select 1 from public.crm_activities a where a.lead_id = l.id
    and a.event_type = 'conversion_review_required' and a.source_key <> 'payment-void-review-backfill:' || l.enrollment_id)
  and not exists (select 1 from public.crm_activities a where a.lead_id = l.id
    and a.source_key = 'payment-void-review-backfill-reverse:' || l.enrollment_id);
do $$ begin
  if (select count(*) from d2_reverse) <> current_setting('batch_e.d2_expected_flags')::integer then
    raise exception 'D2 reverse refused: expected % leads, found %', current_setting('batch_e.d2_expected_flags'), (select count(*) from d2_reverse);
  end if;
end $$;
select 1 from public.crm_leads where id in (select lead_id from d2_reverse) order by id for update;
insert into public.crm_activities(lead_id, enrollment_id, occurred_at, actor_kind, event_type, source_key, body, details)
select lead_id, enrollment_id, clock_timestamp(), 'system', 'conversion_review_cleared',
  'payment-void-review-backfill-reverse:' || enrollment_id, 'Reprise D2 annulée : vérification levée.',
  jsonb_build_object('action', 'backfill_d2_reverse')
from d2_reverse;
update public.crm_leads l set conversion_review_required = false, version = version + 1, updated_at = now()
from d2_reverse r where l.id = r.lead_id;
do $$ begin
  if exists (select 1 from public.crm_leads l join d2_reverse r on r.lead_id = l.id where l.conversion_review_required) then
    raise exception 'D2 reverse after-check failed';
  end if;
  if current_setting('batch_e.dry_run') = 'on' then raise exception 'DRYRUN_OK D2 reverse leads=%', (select count(*) from d2_reverse); end if;
end $$;
commit;
