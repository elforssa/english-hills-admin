-- RWR-r5 R0 Q15 — invariant 11: converted leads' programme vs enrollment
-- Source: docs/architecture/evidence/receptionist-workflow-audit-2026-11-21.md §7 (Q15).
-- Read-only: every returned row carries read_only = on. Output: ids, codes, counts and hashes only.
set transaction read only;
with q as (
select count(*) filter (where l.session_type is null) no_session_type,
       count(*) filter (where l.session_type is distinct from e.session_type) mismatch,
       (array_agg(l.id) filter (where l.session_type is distinct from e.session_type))[1:5] sample
from public.crm_leads l join public.enrollments e on e.id=l.enrollment_id where l.status='CONVERTED'
)
select current_setting('transaction_read_only') as read_only, q.* from (select 1) one left join q on true;
