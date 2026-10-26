-- MANUAL, SEPARATELY APPROVED PRODUCTION DATA STEP D3 (plan payment-corrections-receipts.md,
-- P4 FIN-7, owner decision Q8 = A). Not run by any release step or CI. Run only after
-- migration 122 and the owner's approval of the counted target; the 25 MAD case only
-- after the director has checked its paper receipt (hold it with batch_e.d3_hold_ids).
--
-- What it changes: for live legacy charges that are overpaid, or owe more than 0 and less
-- than 1 MAD, charges.discount_amount so that the net price equals what was paid, with one
-- financial_events row 'charge_terms_corrected' per charge (before, after, reason). Receipts,
-- amounts paid, gross prices and every other column stay as they are. A charge paid above
-- its gross price cannot be fixed this way: the step refuses and it is reviewed by hand.
--
-- Plain SQL, one call: journal first (batch_e_d3_journal.sql, read-only, save the JSON
-- privately), set the parameters, dry run, then dry_run 'off' with the owner's go:
--   supabase db query --linked --project-ref <ref> -f supabase/manual/batch_e_d3_legacy_rounding.sql
-- Reverse: supabase/manual/batch_e_d3_reverse.sql (uses the events this step writes).
begin;
-- PARAMETERS (transaction-local).
select set_config('batch_e.d3_expected_rows', '17', true);           -- 17 on 2026-10-24, minus held ones
select set_config('batch_e.d3_hold_ids', '{}', true);                -- Postgres array literal of charge ids, e.g. '{<uuid>}'
select set_config('batch_e.d3_actor', '<director profile id>', true); -- recorded as the actor
select set_config('batch_e.dry_run', 'on', true);

lock table public.charges, public.receipts in share row exclusive mode;
create temp table d3_target on commit drop as
select c.id, c.gross_amount, c.discount_amount as before_discount, b.paid_amount,
       (c.gross_amount - b.paid_amount)::numeric(12,2) as after_discount
from public.charges c join public.charge_balances b on b.id = c.id
where c.legacy and c.voided_at is null
  and (b.paid_amount > b.net_amount or (b.balance > 0 and b.balance < 1))
  and c.id <> all (current_setting('batch_e.d3_hold_ids')::uuid[]);

do $$
declare v_actor uuid := current_setting('batch_e.d3_actor')::uuid;
begin
  if (select count(*) from d3_target) <> current_setting('batch_e.d3_expected_rows')::integer then
    raise exception 'D3 refused: expected % charges, found %', current_setting('batch_e.d3_expected_rows'), (select count(*) from d3_target);
  end if;
  if exists (select 1 from d3_target where after_discount < 0 or after_discount > gross_amount) then
    raise exception 'D3 refused: a charge was paid above its gross price; review it by hand';
  end if;
  if (select role from public.profiles where id = v_actor) is distinct from 'director' then
    raise exception 'D3 refused: batch_e.d3_actor must be a director profile';
  end if;
end $$;

update public.charges c set discount_amount = t.after_discount, updated_at = now() from d3_target t where c.id = t.id;
insert into public.financial_events(event_type, charge_id, actor_id, metadata)
select 'charge_terms_corrected', t.id, current_setting('batch_e.d3_actor')::uuid,
  jsonb_build_object('step', 'D3', 'before', jsonb_build_object('discount_amount', t.before_discount),
    'after', jsonb_build_object('discount_amount', t.after_discount), 'paid_amount', t.paid_amount,
    'reason', 'Arrondi historique (Q8 = A) : prix net aligné sur le montant payé.')
from d3_target t;

do $$
declare v_rows integer := (select count(*) from d3_target);
begin
  if exists (select 1 from d3_target t join public.charge_balances b on b.id = t.id where b.net_amount <> b.paid_amount)
     or (select count(*) from public.financial_events e join d3_target t on t.id = e.charge_id
         where e.event_type = 'charge_terms_corrected' and e.metadata->>'step' = 'D3') <> v_rows then
    raise exception 'D3 after-check failed';
  end if;
  if current_setting('batch_e.dry_run') = 'on' then raise exception 'DRYRUN_OK D3 rows=%', v_rows; end if;
end $$;
commit;
