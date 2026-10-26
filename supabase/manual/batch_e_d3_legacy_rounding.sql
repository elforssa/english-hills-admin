-- MANUAL, SEPARATELY APPROVED PRODUCTION DATA STEP D3 (plan payment-corrections-receipts.md,
-- P4 FIN-7, owner decision Q8 = A). Not run by any release step or CI. Run only after
-- migration 122 and the owner's approval of the counted target; the 25 MAD case only
-- after the director has checked its paper receipt (hold it with batch_e.d3_hold_ids).
--
-- What it changes: for live legacy charges that are overpaid, or owe between 0 and 1 MAD,
-- charges.discount_amount so that the net price equals what was paid, with one
-- financial_events row 'charge_terms_corrected' per charge (before, after, reason).
-- Receipts, amounts paid, gross prices and every other column stay as they are.
--
-- Private journal first (ids and before values only):
--   \copy (select c.id, c.gross_amount, c.discount_amount, b.paid_amount from public.charges c
--          join public.charge_balances b on b.id = c.id where c.legacy and c.voided_at is null
--            and (b.paid_amount > b.net_amount or (b.balance > 0 and b.balance < 1)))
--     to 'd3_journal.csv' with (format csv, header)
--   set batch_e.d3_expected_rows = '<rows, 17 on 2026-10-24, minus held ones>';
--   set batch_e.d3_hold_ids = '<comma-separated charge ids to leave out, or empty>';
--   set batch_e.d3_actor = '<director profile id recorded as the actor>';
--   \i supabase/manual/batch_e_d3_legacy_rounding.sql
-- Reverse: supabase/manual/batch_e_d3_reverse.sql.
\set ON_ERROR_STOP on
begin;
lock table public.charges, public.receipts in share row exclusive mode;
create temp table d3_target on commit drop as
select c.id, c.gross_amount, c.discount_amount as before_discount, b.paid_amount,
       (c.gross_amount - b.paid_amount)::numeric(12,2) as after_discount
from public.charges c join public.charge_balances b on b.id = c.id
where c.legacy and c.voided_at is null
  and (b.paid_amount > b.net_amount or (b.balance > 0 and b.balance < 1))
  and c.id <> all (coalesce(nullif(current_setting('batch_e.d3_hold_ids', true), ''), '{}')::uuid[]);
-- batch_e.d3_hold_ids is written as a Postgres array literal, e.g. '{<uuid>}'.

do $$ begin
  if (select count(*) from d3_target) is distinct from nullif(current_setting('batch_e.d3_expected_rows', true), '')::integer then
    raise exception 'D3 refused: expected % charges, found %', current_setting('batch_e.d3_expected_rows', true), (select count(*) from d3_target);
  end if;
  if exists (select 1 from d3_target where after_discount < 0 or after_discount > gross_amount) then
    raise exception 'D3 refused: a charge was paid above its gross price; review it by hand';
  end if;
  if (select role from public.profiles where id = nullif(current_setting('batch_e.d3_actor', true), '')::uuid) is distinct from 'director' then
    raise exception 'D3 refused: batch_e.d3_actor must be a director profile';
  end if;
end $$;

update public.charges c set discount_amount = t.after_discount, updated_at = now() from d3_target t where c.id = t.id;
insert into public.financial_events(event_type, charge_id, actor_id, metadata)
select 'charge_terms_corrected', t.id, current_setting('batch_e.d3_actor')::uuid,
  jsonb_build_object('before', jsonb_build_object('discount_amount', t.before_discount),
    'after', jsonb_build_object('discount_amount', t.after_discount),
    'paid_amount', t.paid_amount, 'reason', 'Arrondi historique (Q8 = A) : prix net aligné sur le montant payé.')
from d3_target t;

do $$ begin
  if exists (select 1 from d3_target t join public.charge_balances b on b.id = t.id where b.net_amount <> b.paid_amount) then
    raise exception 'D3 after-check failed: a corrected charge does not net to what was paid';
  end if;
end $$;
commit;
