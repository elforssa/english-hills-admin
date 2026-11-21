-- RWR-r5 R0 Q20 — prospects stuck in a stage over 14 days
-- Source: docs/architecture/evidence/receptionist-workflow-audit-2026-11-21.md §7 (Q20).
-- Read-only: every returned row carries read_only = on. Output: ids, codes, counts and hashes only.
set transaction read only;
with q as (
select l.status, count(*) n, (array_agg(l.id))[1:5] sample from public.crm_leads l
where l.status in ('NEW','CONTACTING','ENGAGED','QUALIFIED') and l.merged_into_lead_id is null
 and coalesce((select max(a.occurred_at) from public.crm_activities a where a.lead_id=l.id and a.to_status is not null), l.created_at) < now()-interval '14 days'
group by 1
)
select current_setting('transaction_read_only') as read_only, q.* from (select 1) one left join q on true;
