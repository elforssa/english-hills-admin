-- RWR-r5 R0 Q08 — invariant 3: overlapping appointments or tests per person
-- Source: docs/architecture/evidence/receptionist-workflow-audit-2026-11-21.md §7 (Q08).
-- Read-only: every returned row carries read_only = on. Output: ids, codes, counts and hashes only.
set transaction read only;
with q as (
with ev as (
 select t.lead_id, l.student_id, t.id, t.due_at s, coalesce(t.scheduled_end_at, t.due_at+interval '60 min') e
 from public.crm_tasks t join public.crm_leads l on l.id=t.lead_id where t.status='open' and t.task_type='center_visit'
 union all
 select p.crm_lead_id, p.student_id, p.id, (p.date_test+p.heure::time) at time zone public.centre_utc_offset(),
        (p.date_test+p.heure::time) at time zone public.centre_utc_offset()+interval '45 min'
 from public.placement_tests p where p.status='Planifié' and p.heure ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
select count(*) overlapping_pairs, (array_agg(a.id))[1:5] sample
from ev a join ev b on a.id<b.id and ((a.lead_id is not null and a.lead_id=b.lead_id) or (a.student_id is not null and a.student_id=b.student_id))
 and a.s<b.e and b.s<a.e
)
select current_setting('transaction_read_only') as read_only, q.* from (select 1) one left join q on true;
