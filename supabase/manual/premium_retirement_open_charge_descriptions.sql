-- MANUAL, SEPARATELY APPROVED PRODUCTION DATA STEP (plan premium-retirement.md, D5a / step A4).
-- Do not run during rollout. Run only after migration 113 is applied and the
-- Release A application is verified, and only with the owner's explicit approval
-- of this step and of the counted target.
--
-- What it changes: only charges.service_description of open, non-voided,
-- non-legacy Yearly charges (balance > 0 in charge_balances) whose text still
-- contains the retired plan word, e.g. 'Yearly · Premium · 2026/2027' becomes
-- 'Yearly · 2026/2027' and an undated 'Yearly · Standard' becomes 'Yearly'.
-- Issued receipts, settled, voided and legacy charges, plan_type, amounts,
-- dates, ids and statuses are never changed (owner decision Q1).
--
-- Mandatory before-change export (kept in owner-controlled private storage,
-- never in the repository, PR, logs or chat), taken immediately before the run:
--
--   \copy (select c.id, c.service_description from public.charges c
--          join public.charge_balances b on b.id = c.id
--          where c.session_type = 'Yearly' and c.voided_at is null and not c.legacy
--            and b.balance > 0 and c.service_description ~ ' · (Standard|Premium)( · |$)'
--          order by c.id) to 'open_charge_descriptions_export.csv' with (format csv, header)
--   shasum -a 256 open_charge_descriptions_export.csv
--
-- Then, in the same psql session, declare the export's data-row count and checksum:
--
--   set premium_retirement.open_charge_export_rows = '<rows in the export>';
--   set premium_retirement.open_charge_export_sha256 = '<64 hex characters>';
--   \i supabase/manual/premium_retirement_open_charge_descriptions.sql
--
-- The step raises and changes nothing when a setting is missing or malformed,
-- when the declared row count differs from the current target, or when any
-- after-check fails. A second run finds zero targets and changes nothing.
-- The release record keeps only counts and the checksum.
--
-- Rollback (restores the only changed column from the export):
--   create temp table d5a_export(id uuid primary key, service_description text not null);
--   \copy d5a_export from 'open_charge_descriptions_export.csv' with (format csv, header)
--   update public.charges c set service_description = e.service_description
--     from d5a_export e
--    where c.id = e.id
--      and c.service_description = regexp_replace(e.service_description, ' · (Standard|Premium)( · |$)', '\2');
\set ON_ERROR_STOP on
begin;

-- Payments lock their charge and insert receipts; hold both tables still so the
-- open/settled classification cannot change between selection and update.
lock table public.charges, public.receipts in share row exclusive mode;

create temp table d5a_target on commit drop as
select c.id,
       c.service_description as old_description,
       substring(c.service_description from ' · (Standard|Premium)(?: · |$)') as plan_word,
       md5((to_jsonb(c) - 'service_description')::text) as other_columns_md5
  from public.charges c
  join public.charge_balances b on b.id = c.id
 where c.session_type = 'Yearly'
   and c.voided_at is null
   and not c.legacy
   and b.balance > 0
   and c.service_description ~ ' · (Standard|Premium)( · |$)';

create temp table d5a_before on commit drop as
select (select md5(coalesce(string_agg(to_jsonb(c)::text, '|' order by c.id), ''))
          from public.charges c where c.id not in (select id from d5a_target)) as untouched_charges_md5,
       (select md5(coalesce(string_agg(to_jsonb(r)::text, '|' order by r.id), ''))
          from public.receipts r) as receipts_md5,
       (select row(count(*), sum(net_amount), sum(paid_amount), sum(balance))::text
          from public.charge_balances) as balance_totals;

do $$
declare
  v_targets integer := (select count(*) from d5a_target);
  v_declared_rows text := nullif(btrim(current_setting('premium_retirement.open_charge_export_rows', true)), '');
  v_declared_sha text := nullif(btrim(current_setting('premium_retirement.open_charge_export_sha256', true)), '');
  v_updated integer;
  v_before d5a_before%rowtype;
begin
  raise notice 'D5a targets: % (Standard: %, Premium: %)', v_targets,
    (select count(*) from d5a_target where plan_word = 'Standard'),
    (select count(*) from d5a_target where plan_word = 'Premium');

  if v_targets = 0 then
    raise notice 'D5a: no open Yearly charge text contains a plan word; nothing changed.';
    return;
  end if;

  if v_declared_rows is null or v_declared_rows !~ '^[0-9]+$' then
    raise exception 'D5a refused: set premium_retirement.open_charge_export_rows to the before-change export row count.';
  end if;
  if v_declared_sha is null or v_declared_sha !~ '^[0-9a-f]{64}$' then
    raise exception 'D5a refused: set premium_retirement.open_charge_export_sha256 to the export SHA-256 (64 lowercase hex).';
  end if;
  if v_declared_rows::integer <> v_targets then
    raise exception 'D5a refused: declared export rows % differ from the % current targets.', v_declared_rows, v_targets;
  end if;

  update public.charges c
     set service_description = regexp_replace(c.service_description, ' · (Standard|Premium)( · |$)', '\2')
    from d5a_target t
   where c.id = t.id;
  get diagnostics v_updated = row_count;
  if v_updated <> v_targets then
    raise exception 'D5a failed: updated % rows, expected %.', v_updated, v_targets;
  end if;

  select * into v_before from d5a_before;
  if exists(select 1 from public.charges c join d5a_target t on t.id = c.id
             where c.service_description ~ ' · (Standard|Premium)( · |$)'
                or c.service_description is not distinct from t.old_description
                or md5((to_jsonb(c) - 'service_description')::text) <> t.other_columns_md5) then
    raise exception 'D5a failed: a target kept its plan word or another column changed.';
  end if;
  if (select md5(coalesce(string_agg(to_jsonb(c)::text, '|' order by c.id), ''))
        from public.charges c where c.id not in (select id from d5a_target)) <> v_before.untouched_charges_md5 then
    raise exception 'D5a failed: a non-target charge changed.';
  end if;
  if (select md5(coalesce(string_agg(to_jsonb(r)::text, '|' order by r.id), ''))
        from public.receipts r) <> v_before.receipts_md5 then
    raise exception 'D5a failed: a receipt changed.';
  end if;
  if (select row(count(*), sum(net_amount), sum(paid_amount), sum(balance))::text
        from public.charge_balances) <> v_before.balance_totals then
    raise exception 'D5a failed: charge balance totals changed.';
  end if;

  raise notice 'D5a: updated % open Yearly charge descriptions; other columns, other charges, receipts and balance totals unchanged; declared export checksum %.',
    v_updated, v_declared_sha;
end $$;

commit;
