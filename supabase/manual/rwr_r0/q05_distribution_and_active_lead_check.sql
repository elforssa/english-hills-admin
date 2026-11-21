-- RWR-r5 R0 Q05 — invariant 1: distribution and active-lead check
-- Source: docs/architecture/evidence/receptionist-workflow-audit-2026-11-21.md §7 (Q05).
-- Read-only: every returned row carries read_only = on. Output: ids, codes, counts and hashes only.
set transaction read only;
with q as (
select coalesce(n,0) open_actions, count(*) leads
from public.crm_leads l left join (select lead_id, count(*) n from public.crm_tasks where status='open' group by lead_id) t on t.lead_id=l.id
where l.status in ('NEW','CONTACTING','ENGAGED','QUALIFIED') and l.merged_into_lead_id is null
group by 1 order by 1
)
select current_setting('transaction_read_only') as read_only, q.* from (select 1) one left join q on true;
