-- RWR-r5 R0 Q18 — prospects rescheduled or replaced 3+ times
-- Source: docs/architecture/evidence/receptionist-workflow-audit-2026-11-21.md §7 (Q18).
-- Read-only: every returned row carries read_only = on. Output: ids, codes, counts and hashes only.
set transaction read only;
with q as (
select count(*) leads, (array_agg(lead_id))[1:5] sample from (
 select lead_id from public.crm_activities where event_type in ('task_rescheduled','task_cancelled','task_created')
 group by lead_id having count(*) filter (where event_type='task_rescheduled')+count(*) filter (where event_type='task_cancelled')>=3) x
)
select current_setting('transaction_read_only') as read_only, q.* from (select 1) one left join q on true;
