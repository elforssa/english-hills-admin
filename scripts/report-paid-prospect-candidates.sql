-- Read-only review queue for older payments. No changes or automatic backfill.
-- Run only on a deliberately selected database; output IDs and aggregates,
-- not names, contacts, or receipt details. Review each candidate manually.
with paid_tuition as (
  select r.student_id, count(*) as receipt_count,
         sum(r.montant_paye) as amount_paid,
         count(distinct c.id) as charge_count,
         count(distinct c.session_type) as session_count
  from public.receipts r
  join public.charges c on c.id = r.charge_id
  where r.voided_at is null and r.deleted_at is null
    and c.voided_at is null and c.session_type not in ('Other','Legacy')
    and r.montant_paye > 0
  group by r.student_id
)
select s.id as student_id, p.receipt_count, p.charge_count,
       p.session_count, p.amount_paid,
       (select count(*) from public.enrollments e
        where e.student_id = s.id and e.status in ('Confirmed','Validated','Trial'))
         as active_enrollment_count
from paid_tuition p
join public.students s on s.id = p.student_id
where s.status = 'Prospect' and s.deleted_at is null
order by p.receipt_count desc, s.id;
