-- RWR-r5 R0 Q02 — open actions overview
-- Source: docs/architecture/evidence/receptionist-workflow-audit-2026-11-21.md §7 (Q02).
-- Read-only: every returned row carries read_only = on. Output: ids, codes, counts and hashes only.
set transaction read only;
with q as (
select l.status, count(distinct l.id) leads, count(t.id) open_tasks,
       count(t.id) filter (where t.due_at < now()) overdue
from public.crm_leads l left join public.crm_tasks t on t.lead_id=l.id and t.status='open'
where l.merged_into_lead_id is null group by l.status order by l.status
)
select current_setting('transaction_read_only') as read_only, q.* from (select 1) one left join q on true;
