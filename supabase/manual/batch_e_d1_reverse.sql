-- REVERSE OF D1 (plan payment-corrections-receipts.md). Only with the owner's explicit
-- approval. Plain SQL, one call, same path as D1 (dry run first, then dry_run 'off').
-- Issued numbers are immutable by trigger; this reverse briefly disables that one trigger
-- (owner-level DDL) inside its own transaction and clears only the EH-HIST-2026 series,
-- which only D1 writes. It needs no journal.
begin;
-- PARAMETERS (transaction-local): expected = the D1 journal's row count.
select set_config('batch_e.d1_expected_rows', '54', true);
select set_config('batch_e.dry_run', 'on', true);

lock table public.receipts in share row exclusive mode;
do $$ begin
  if not pg_has_role(session_user, 'postgres', 'MEMBER') then
    raise exception 'D1 reverse refused: session user % is not a member of postgres', session_user;
  end if;
  if (select count(*) from public.receipts where receipt_number ~ '^EH-HIST-2026-[0-9]{4}$')
     <> current_setting('batch_e.d1_expected_rows')::integer then
    raise exception 'D1 reverse refused: the historical series does not have the expected size';
  end if;
end $$;
alter table public.receipts drop constraint if exists receipts_number_required;
alter table public.receipts disable trigger receipts_number_immutable;
update public.receipts set receipt_number = null where receipt_number ~ '^EH-HIST-2026-[0-9]{4}$';
alter table public.receipts enable trigger receipts_number_immutable;
do $$
declare v_cleared integer := (select count(*) from public.receipts where receipt_number is null);
begin
  if v_cleared <> current_setting('batch_e.d1_expected_rows')::integer
     or exists (select 1 from public.receipts where receipt_number like 'EH-HIST-%') then
    raise exception 'D1 reverse after-check failed: % unnumbered', v_cleared;
  end if;
  if current_setting('batch_e.dry_run') = 'on' then raise exception 'DRYRUN_OK D1 reverse rows=%', v_cleared; end if;
end $$;
commit;
