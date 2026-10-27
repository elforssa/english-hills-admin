-- MANUAL, SEPARATELY APPROVED PRODUCTION DATA STEP D1 (plan payment-corrections-receipts.md,
-- PCR-r2 P2.6, owner decision Q6 = B). Not run by any release step or CI.
-- Run only after migration 122 is applied, the E-2 application is verified and the
-- owner has approved D1 with the counted target.
--
-- What it changes: receipts.receipt_number of the receipts that still have none (the 54
-- receipts imported on 2026-09-13), numbered EH-HIST-2026-0001.. in (date, created_at, id)
-- order, then adds and validates receipts_number_required. Nothing else. Each update is
-- logged by log_activity_t.
--
-- Plain SQL, one call, through the documented path (session user cli_login_postgres, a
-- member of postgres; the step refuses any other session user):
--   1. Private journal, kept outside the repository (ids only, no names):
--        supabase db query --linked --project-ref <ref> --output-format json -f supabase/manual/batch_e_d1_journal.sql
--   2. Set the parameters below (expected rows = journal rows) and run with dry_run 'on':
--        supabase db query --linked --project-ref <ref> -f supabase/manual/batch_e_d1_historical_receipt_numbers.sql
--      It must end with "DRYRUN_OK D1 rows=<n>" and change nothing.
--   3. With the owner's go, set dry_run 'off' and run again. A second run finds no target
--      and refuses without changing anything.
-- Reverse: supabase/manual/batch_e_d1_reverse.sql.
begin;
-- PARAMETERS (transaction-local).
select set_config('batch_e.d1_expected_rows', '54', true);
select set_config('batch_e.dry_run', 'on', true);

lock table public.receipts in share row exclusive mode;

do $$
declare
  v_expected integer := current_setting('batch_e.d1_expected_rows')::integer;
  v_found integer;
begin
  if not pg_has_role(session_user, 'postgres', 'MEMBER') then
    raise exception 'D1 refused: session user % is not a member of postgres', session_user;
  end if;
  select count(*) into v_found from public.receipts where receipt_number is null;
  if v_found <> v_expected or v_found = 0 or v_found > 9999 then
    raise exception 'D1 refused: expected % unnumbered receipts, found %', v_expected, v_found;
  end if;
  if exists (select 1 from public.receipts where receipt_number like 'EH-HIST-%') then
    raise exception 'D1 refused: the historical series already exists';
  end if;
end $$;

set local english_hills.historical_receipt_numbering = 'on';
with ordered as (
  select id, row_number() over (order by date, created_at, id) as n
  from public.receipts where receipt_number is null)
update public.receipts r set receipt_number = 'EH-HIST-2026-' || lpad(o.n::text, 4, '0')
from ordered o where r.id = o.id;
set local english_hills.historical_receipt_numbering = 'off';

-- Added here, not by the migration: a NOT VALID check would block later updates of
-- unnumbered rows (a void, for example) until D1 had run.
alter table public.receipts add constraint receipts_number_required check (receipt_number is not null) not valid;
alter table public.receipts validate constraint receipts_number_required;

do $$
declare v_numbered integer := (select count(*) from public.receipts where receipt_number ~ '^EH-HIST-2026-[0-9]{4}$');
begin
  if exists (select 1 from public.receipts where receipt_number is null)
     or v_numbered <> current_setting('batch_e.d1_expected_rows')::integer then
    raise exception 'D1 after-check failed: % numbered, an unnumbered receipt may remain', v_numbered;
  end if;
  if current_setting('batch_e.dry_run') = 'on' then
    raise exception 'DRYRUN_OK D1 rows=%', v_numbered;
  end if;
end $$;
commit;
