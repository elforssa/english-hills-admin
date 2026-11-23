-- RWR-r5 R0 Q22 — groups without a teacher
-- Source: docs/architecture/evidence/receptionist-workflow-audit-2026-11-21.md §7 (Q22).
-- Read-only: every returned row carries read_only = on. Output: ids, codes, counts and hashes only.
set transaction read only;
with q as (
select session_type, count(*) n, (array_agg(id))[1:5] sample from public.groups
where teacher_id is null and closed_at is null group by 1
)
select current_setting('transaction_read_only') as read_only, q.* from (select 1) one left join q on true;
