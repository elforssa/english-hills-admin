-- RWR-r5 R0 Q26 — appointments and visits per prospect (calendar duplicates)
-- Source: docs/architecture/evidence/receptionist-workflow-audit-2026-11-21.md §7 (Q26).
-- Read-only: every returned row carries read_only = on. Output: ids, codes, counts and hashes only.
set transaction read only;
with q as (
select count(*) leads, (array_agg(lead_id))[1:5] sample from (
 select lead_id from public.crm_tasks where status='open' and task_type='center_visit' group by 1 having count(*)>1) x
)
select current_setting('transaction_read_only') as read_only, q.* from (select 1) one left join q on true;
