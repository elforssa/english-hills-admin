-- RWR-r5 R0 Q19 — actions done before their due time
-- Source: docs/architecture/evidence/receptionist-workflow-audit-2026-11-21.md §7 (Q19).
-- Read-only: every returned row carries read_only = on. Output: ids, codes, counts and hashes only.
set transaction read only;
with q as (
select task_type, count(*) n, avg(due_at-completed_at) avg_early
from public.crm_tasks where status='completed' and completed_at<due_at group by 1 order by n desc
)
select current_setting('transaction_read_only') as read_only, q.* from (select 1) one left join q on true;
