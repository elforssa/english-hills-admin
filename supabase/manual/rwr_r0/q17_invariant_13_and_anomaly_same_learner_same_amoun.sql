-- RWR-r5 R0 Q17 — invariant 13 and anomaly: same learner, same amount, same day
-- Source: docs/architecture/evidence/receptionist-workflow-audit-2026-11-21.md §7 (Q17).
-- Read-only: every returned row carries read_only = on. Output: ids, codes, counts and hashes only.
set transaction read only;
with q as (
select count(*) groups, sum(n) receipts, (array_agg(student_id))[1:5] sample from (
 select student_id, date, montant_paye, count(*) n from public.receipts
 where voided_at is null and deleted_at is null and student_id is not null
 group by 1,2,3 having count(*)>1) x
)
select current_setting('transaction_read_only') as read_only, q.* from (select 1) one left join q on true;
