-- RWR-r5 R0 Q16 — invariant 12: learners with an unlinked commitment and a linked charge for the same programme and year
-- Source: docs/architecture/evidence/receptionist-workflow-audit-2026-11-21.md §7 (Q16).
-- Read-only: every returned row carries read_only = on. Output: ids, codes, counts and hashes only.
set transaction read only;
with q as (
select count(distinct a.student_id) learners, (array_agg(distinct a.student_id))[1:5] sample
from public.charge_balances a join public.charge_balances b on a.student_id=b.student_id and a.id<>b.id
 and a.session_type=b.session_type and a.school_year is not distinct from b.school_year
where a.voided_at is null and b.voided_at is null and a.enrollment_id is null and b.enrollment_id is not null and not a.legacy
)
select current_setting('transaction_read_only') as read_only, q.* from (select 1) one left join q on true;
