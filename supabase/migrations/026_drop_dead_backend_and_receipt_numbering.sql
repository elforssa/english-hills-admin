-- =============================================================================
-- 026 — Remove dead backend + add sequential receipt numbers
--
-- Audit follow-up: align the schema with what the product actually uses.
--
-- 1. Drop the `payments` table (and its soft-delete RPC). It has no insert
--    path anywhere in the app or DB — payments are tracked on the `receipts`
--    row (montant_total / montant_paye / statut_paiement). Verified empty
--    (0 rows) before this migration. Dropping the table also removes its
--    policies, index, updated_at trigger and audit trigger.
--
-- 2. Drop vestigial columns the UI never writes:
--      • certificates.pdf_url  — certificates are printed via the browser,
--        never stored as a file.
--      • learning_assessments.kolb_scores — the assessment form records the
--        Kolb style directly; raw per-dimension scores are never captured.
--
-- 3. Give receipts a real sequential number. `receipt_number` existed and the
--    receipt-email template already renders it, but nothing ever set it.
--    Add a sequence + BEFORE INSERT trigger that fills it as EH-YYYY-NNNNN,
--    backfill existing receipts in created_at order, and enforce uniqueness.
-- =============================================================================


-- ── 1 · Drop the dead payments table ────────────────────────────────────────
drop function if exists public.soft_delete_payment(uuid);
drop table if exists public.payments cascade;


-- ── 2 · Drop vestigial columns ──────────────────────────────────────────────
alter table public.certificates          drop column if exists pdf_url;
alter table public.learning_assessments  drop column if exists kolb_scores;


-- ── 3 · Sequential receipt numbers ──────────────────────────────────────────
create sequence if not exists public.receipt_number_seq;

-- Backfill existing receipts (created_at order) before attaching the trigger,
-- so historical receipts get stable numbers too.
with ordered as (
  select id,
         row_number() over (order by created_at, id) as rn,
         coalesce(date, current_date) as d
    from public.receipts
   where receipt_number is null
)
update public.receipts r
   set receipt_number = 'EH-' || to_char(o.d, 'YYYY') || '-' || lpad(o.rn::text, 5, '0')
  from ordered o
 where r.id = o.id;

-- Advance the sequence past the backfilled count so new receipts continue on.
select setval(
  'public.receipt_number_seq',
  greatest((select count(*) from public.receipts), 1),
  true
);

create or replace function public.set_receipt_number()
returns trigger
language plpgsql
as $$
begin
  if new.receipt_number is null or new.receipt_number = '' then
    new.receipt_number :=
      'EH-' || to_char(coalesce(new.date, current_date), 'YYYY')
            || '-' || lpad(nextval('public.receipt_number_seq')::text, 5, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists set_receipt_number_t on public.receipts;
create trigger set_receipt_number_t
  before insert on public.receipts
  for each row execute function public.set_receipt_number();

-- Enforce uniqueness (now that every row has a value).
create unique index if not exists receipts_receipt_number_key
  on public.receipts (receipt_number);
