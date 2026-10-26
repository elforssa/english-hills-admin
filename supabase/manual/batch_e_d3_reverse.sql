-- REVERSE OF D3, from the D3 journal: restores discount_amount and records the reversal.
--   create temp table d3_journal(id uuid primary key, gross_amount numeric, discount_amount numeric, paid_amount numeric);
--   \copy d3_journal from 'd3_journal.csv' with (format csv, header)
--   set batch_e.d3_actor = '<director profile id>';
--   \i supabase/manual/batch_e_d3_reverse.sql
\set ON_ERROR_STOP on
begin;
lock table public.charges in share row exclusive mode;
insert into public.financial_events(event_type, charge_id, actor_id, metadata)
select 'charge_terms_corrected', c.id, current_setting('batch_e.d3_actor')::uuid,
  jsonb_build_object('before', jsonb_build_object('discount_amount', c.discount_amount),
    'after', jsonb_build_object('discount_amount', j.discount_amount), 'reason', 'Reprise D3 annulée.')
from public.charges c join d3_journal j on j.id = c.id
where exists (select 1 from public.financial_events e where e.charge_id = c.id and e.event_type = 'charge_terms_corrected');
update public.charges c set discount_amount = j.discount_amount, updated_at = now()
from d3_journal j where c.id = j.id
  and exists (select 1 from public.financial_events e where e.charge_id = c.id and e.event_type = 'charge_terms_corrected');
commit;
