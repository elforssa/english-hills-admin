-- RWR-r5 R0 Q13 — invariant 8: the same note text twice within a minute
-- Source: docs/architecture/evidence/receptionist-workflow-audit-2026-11-21.md §7 (Q13).
-- Read-only: every returned row carries read_only = on. Output: ids, codes, counts and hashes only.
set transaction read only;
with q as (
select count(*) pairs, (array_agg(a.lead_id))[1:5] sample
from public.crm_activities a join public.crm_activities b on a.lead_id=b.lead_id and a.id<b.id
 and a.body=b.body and length(btrim(a.body))>0 and abs(extract(epoch from b.occurred_at-a.occurred_at))<=60
)
select current_setting('transaction_read_only') as read_only, q.* from (select 1) one left join q on true;
