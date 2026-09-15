-- Complete the conservative legacy backfill for archived students omitted by 055.
-- Student identity is already explicit on the receipt: never infer installment
-- relationships, reactivate a student, invent an actor, or send an email.
begin;

insert into public.charges (
  student_id, enrollment_id, session_type, service_description, plan_type, level,
  gross_amount, discount_amount, due_date, created_by, legacy, legacy_receipt_id,
  voided_at, voided_by, void_reason, created_at, updated_at
)
select r.student_id, r.enrollment_id,
       case when r.session_type in (
         'Yearly','Adults','Summer Camp','Communication Junior','Communication Adult',
         'One-to-One','Mise à niveau','Other'
       ) then r.session_type else 'Legacy' end,
       concat('Reçu historique ', coalesce(r.receipt_number, r.id::text)),
       r.plan_type, r.niveau,
       r.montant_total,
       round(r.montant_total * coalesce(r.remise, 0) / 100, 2),
       null,
       null,
       true, r.id, coalesce(r.deleted_at, r.voided_at), null,
       case when r.deleted_at is not null then 'Suppression historique'
            when r.voided_at is not null then r.void_reason else null end,
       r.created_at, r.updated_at
from public.receipts r
where r.student_id is not null
  and r.charge_id is null
  and r.email_delivery_status = 'unknown'
  and exists (
    select 1 from public.students s
    where s.id = r.student_id and s.deleted_at is not null
  )
  and not exists (select 1 from public.charges c where c.legacy_receipt_id = r.id);

update public.receipts r
set charge_id = c.id,
    service_description = coalesce(r.service_description, c.service_description),
    gross_amount_snapshot = coalesce(r.gross_amount_snapshot, c.gross_amount),
    discount_amount_snapshot = coalesce(r.discount_amount_snapshot, c.discount_amount),
    net_amount_snapshot = coalesce(r.net_amount_snapshot, c.gross_amount - c.discount_amount),
    paid_before_snapshot = coalesce(r.paid_before_snapshot, 0),
    balance_after_snapshot = coalesce(r.balance_after_snapshot,
      greatest(0, c.gross_amount - c.discount_amount - r.montant_paye)),
    legacy = true
from public.charges c
where c.legacy_receipt_id = r.id and r.charge_id is null
  and r.email_delivery_status = 'unknown'
  and exists (select 1 from public.students s
              where s.id = r.student_id and s.deleted_at is not null);

commit;
