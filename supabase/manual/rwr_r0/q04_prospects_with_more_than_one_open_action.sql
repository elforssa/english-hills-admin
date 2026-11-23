-- RWR-r5 R0 Q04 — invariant 1: prospects with more than one open action
-- Source: docs/architecture/evidence/receptionist-workflow-audit-2026-11-21.md §7 (Q04).
-- Read-only: every returned row carries read_only = on. Output: ids, codes, counts and hashes only.
set transaction read only;
with q as (
with m as (select lead_id, count(*) n from public.crm_tasks where status='open' group by lead_id having count(*)>1)
select count(*) leads, sum(n) tasks, (select array_agg(lead_id) from (select lead_id from m order by n desc, lead_id limit 5) s) sample from m
)
select current_setting('transaction_read_only') as read_only, q.* from (select 1) one left join q on true;
