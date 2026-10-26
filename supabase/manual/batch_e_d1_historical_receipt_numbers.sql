-- MANUAL, SEPARATELY APPROVED PRODUCTION DATA STEP D1 (plan payment-corrections-receipts.md,
-- PCR-r2 P2.6, owner decision Q6 = B). Not run by any release step or CI.
-- Run only after migration 122 is applied, the E-2 application is verified and the
-- owner has approved D1 with the counted target.
--
-- What it changes: receipts.receipt_number of the receipts that still have none
-- (the 54 receipts imported on 2026-09-13), numbered EH-HIST-2026-0001.. in
-- (date, created_at, id) order; then adds and validates receipts_number_required.
-- Nothing else. Each update is logged by log_activity_t.
--
-- Execution path: the documented `supabase db query --linked` wrapper (session user
-- cli_login_postgres, a member of postgres). R0, through that same path:
--   select session_user, pg_has_role(session_user, 'postgres', 'MEMBER');   -- must be true
--
-- Mandatory private journal, taken immediately before, kept outside the repository
-- (ids only, no names):
--   \copy (select id, date, created_at from public.receipts where receipt_number is null
--          order by date, created_at, id) to 'd1_journal.csv' with (format csv, header)
--   shasum -a 256 d1_journal.csv
-- Then, in the same session:
--   set batch_e.d1_expected_rows = '<rows in the journal, 54 on 2026-10-24>';
--   \i supabase/manual/batch_e_d1_historical_receipt_numbers.sql
-- A second run finds zero targets and raises without changing anything.
-- Reverse: supabase/manual/batch_e_d1_reverse.sql.
\set ON_ERROR_STOP on
begin;
lock table public.receipts in share row exclusive mode;

do $$
declare
  v_expected integer := nullif(current_setting('batch_e.d1_expected_rows', true), '')::integer;
  v_found integer;
begin
  if not pg_has_role(session_user, 'postgres', 'MEMBER') then
    raise exception 'D1 refused: session user % is not a member of postgres', session_user;
  end if;
  select count(*) into v_found from public.receipts where receipt_number is null;
  if v_expected is null or v_found <> v_expected or v_found = 0 or v_found > 9999 then
    raise exception 'D1 refused: expected % unnumbered receipts, found %', v_expected, v_found;
  end if;
end $$;

set local english_hills.historical_receipt_numbering = 'on';
with ordered as (
  select id, row_number() over (order by date, created_at, id) as n
  from public.receipts where receipt_number is null)
update public.receipts r set receipt_number = 'EH-HIST-2026-' || lpad(o.n::text, 4, '0')
from ordered o where r.id = o.id;
set local english_hills.historical_receipt_numbering = 'off';

do $$ begin
  if exists (select 1 from public.receipts where receipt_number is null) then
    raise exception 'D1 after-check failed: an unnumbered receipt remains';
  end if;
  if (select count(*) from public.receipts where receipt_number ~ '^EH-HIST-2026-[0-9]{4}$')
     <> current_setting('batch_e.d1_expected_rows')::integer then
    raise exception 'D1 after-check failed: historical series count differs from the target';
  end if;
end $$;

-- Added here, not by the migration: a NOT VALID check would block later updates of
-- unnumbered rows (a void, for example) until D1 had run.
alter table public.receipts add constraint receipts_number_required check (receipt_number is not null) not valid;
alter table public.receipts validate constraint receipts_number_required;
commit;
