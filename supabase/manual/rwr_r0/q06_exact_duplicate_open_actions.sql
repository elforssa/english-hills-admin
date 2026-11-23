-- RWR-r5 R0 Q06 — exact duplicate open actions
-- Source: docs/architecture/evidence/receptionist-workflow-audit-2026-11-21.md §7 (Q06).
-- Read-only: every returned row carries read_only = on. Output: ids, codes, counts and hashes only.
set transaction read only;
with q as (
with d as (select lead_id, task_type, due_at, count(*) n from public.crm_tasks where status='open' group by 1,2,3 having count(*)>1)
select count(distinct lead_id) leads, count(*) groups,
       count(*) filter (where (due_at at time zone public.centre_utc_offset())::time in (select distinct (w->>0)::time from public.crm_followup_policies p, jsonb_each(p.weekly_hours) d2, jsonb_array_elements(d2.value) w)) at_window_opening,
       (select array_agg(lead_id) from (select distinct lead_id from d order by lead_id limit 5) s) sample from d
)
select current_setting('transaction_read_only') as read_only, q.* from (select 1) one left join q on true;
