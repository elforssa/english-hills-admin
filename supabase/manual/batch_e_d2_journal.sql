-- Read-only journal for D2 (ids, statuses and flags only). Save the JSON output privately.
set transaction read only;
select json_agg(json_build_object('enrollment_id', e.id, 'enrollment_status', e.status, 'lead_id', l.id,
  'lead_status', l.status, 'review_required', l.conversion_review_required, 'lead_version', l.version) order by e.id)
from public.enrollments e
left join public.crm_leads l on l.enrollment_id = e.id and l.merged_into_lead_id is null
where e.status in ('Confirmed','Validated')
  and exists (select 1 from public.receipts r where r.enrollment_id = e.id or r.charge_id in (select c.id from public.charges c where c.enrollment_id = e.id))
  and not exists (select 1 from public.receipts r where r.voided_at is null and r.deleted_at is null
    and (r.enrollment_id = e.id or r.charge_id in (select c.id from public.charges c where c.enrollment_id = e.id)));
