-- RWR-r5 R0 Q09 — invariant 4: open items outside hours
-- Source: docs/architecture/evidence/receptionist-workflow-audit-2026-11-21.md §7 (Q09).
-- Read-only: every returned row carries read_only = on. Output: ids, codes, counts and hashes only.
set transaction read only;
with q as (
select t.task_type, count(*) n, (array_agg(t.id))[1:5] sample
from public.crm_tasks t join public.crm_leads l on l.id=t.lead_id
where t.status='open' and t.due_at>now() and crm_security.next_window(l.followup_policy_id,t.due_at)<>t.due_at
group by 1
union all
select 'placement_test', count(*), (array_agg(p.id))[1:5]
from public.placement_tests p join public.crm_leads l on l.id=p.crm_lead_id
where p.status='Planifié' and p.heure ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
 and crm_security.next_window(l.followup_policy_id,(p.date_test+p.heure::time) at time zone public.centre_utc_offset())
     <> (p.date_test+p.heure::time) at time zone public.centre_utc_offset()
)
select current_setting('transaction_read_only') as read_only, q.* from (select 1) one left join q on true;
