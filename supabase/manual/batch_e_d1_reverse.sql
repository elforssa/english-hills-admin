-- REVERSE OF D1 (plan payment-corrections-receipts.md). Only with the owner's explicit
-- approval, from the D1 journal. Issued numbers are immutable by trigger; this reverse
-- briefly disables that one trigger (owner-level DDL) inside its own transaction and
-- clears only numbers of the EH-HIST-2026 series whose ids are in the journal.
--   create temp table d1_journal(id uuid primary key, date date, created_at timestamptz);
--   \copy d1_journal from 'd1_journal.csv' with (format csv, header)
--   set batch_e.d1_expected_rows = '<rows in the journal>';
--   \i supabase/manual/batch_e_d1_reverse.sql
\set ON_ERROR_STOP on
begin;
lock table public.receipts in share row exclusive mode;
do $$ begin
  if (select count(*) from d1_journal) <> current_setting('batch_e.d1_expected_rows')::integer
     or exists (select 1 from d1_journal j join public.receipts r on r.id = j.id where r.receipt_number !~ '^EH-HIST-2026-[0-9]{4}$') then
    raise exception 'D1 reverse refused: journal and numbers do not match';
  end if;
end $$;
alter table public.receipts drop constraint if exists receipts_number_required;
alter table public.receipts disable trigger receipts_number_immutable;
update public.receipts r set receipt_number = null from d1_journal j where r.id = j.id;
alter table public.receipts enable trigger receipts_number_immutable;
commit;
