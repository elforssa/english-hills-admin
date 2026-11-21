-- RWR-r5 R0 Q14 — invariant 10: unowned work
-- Source: docs/architecture/evidence/receptionist-workflow-audit-2026-11-21.md §7 (Q14).
-- Read-only: every returned row carries read_only = on. Output: ids, codes, counts and hashes only.
set transaction read only;
with q as (
select count(*) filter (where t.assigned_to is null) unassigned_open_tasks,
       count(distinct l.id) filter (where l.owner_id is null) unowned_active_leads,
       count(*) open_tasks
from public.crm_tasks t join public.crm_leads l on l.id=t.lead_id
where t.status='open' and l.status in ('NEW','CONTACTING','ENGAGED','QUALIFIED')
)
select current_setting('transaction_read_only') as read_only, q.* from (select 1) one left join q on true;
