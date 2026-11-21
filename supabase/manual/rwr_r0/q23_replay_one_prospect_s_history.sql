-- RWR-r5 R0 Q23 — replay one prospect's history
-- Source: docs/architecture/evidence/receptionist-workflow-audit-2026-11-21.md §7 (Q23).
-- Read-only: every returned row carries read_only = on. Output: ids, codes, counts and hashes only.
-- Parameter: replace :'lead_id' with one quoted lead id from Q04 or Q06. Output stays out of the repository.
set transaction read only;
with q as (
select a.occurred_at, a.event_type, a.channel, a.outcome, a.from_status, a.to_status, a.task_id,
       split_part(a.source_key,':',3) command, left(md5(coalesce(a.body,'')),8) body_hash,
       t.task_type, t.due_at, t.status task_status, t.schedule_kind
from public.crm_activities a left join public.crm_tasks t on t.id=a.task_id
where a.lead_id = :'lead_id' order by a.occurred_at, a.id
)
select current_setting('transaction_read_only') as read_only, q.* from (select 1) one left join q on true;
