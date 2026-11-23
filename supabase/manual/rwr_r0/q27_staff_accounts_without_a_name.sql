-- RWR-r5 R0 Q27 — staff accounts without a name
-- Source: docs/architecture/evidence/receptionist-workflow-audit-2026-11-21.md §7 (Q27).
-- Read-only: every returned row carries read_only = on. Output: ids, codes, counts and hashes only.
set transaction read only;
with q as (
select role, count(*) filter (where coalesce(btrim(full_name),'')='') unnamed, count(*) total
from public.profiles where role in ('director','admin','receptionist') group by role
)
select current_setting('transaction_read_only') as read_only, q.* from (select 1) one left join q on true;
