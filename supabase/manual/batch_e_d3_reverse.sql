-- REVERSE OF D3. Only with the owner's explicit approval; plain SQL, one call, dry run first.
-- Restores discount_amount from each D3 event's "before" value and records the reversal as a
-- 'charge_terms_corrected' event with step 'D3-reverse'. Targets charges whose latest D3-family
-- event is a forward D3 correction and whose discount still equals that correction's "after".
-- No journal needed.
begin;
-- PARAMETERS (transaction-local).
select set_config('batch_e.d3_expected_rows', '17', true);
select set_config('batch_e.d3_actor', '<director profile id>', true);
select set_config('batch_e.dry_run', 'on', true);

lock table public.charges in share row exclusive mode;
create temp table d3_reverse on commit drop as
select distinct on (e.charge_id) e.charge_id, e.id as event_id, e.metadata
from public.financial_events e
where e.event_type = 'charge_terms_corrected' and e.metadata->>'step' in ('D3', 'D3-reverse')
order by e.charge_id, e.created_at desc, e.id desc;
delete from d3_reverse r where r.metadata->>'step' <> 'D3'
  or (select c.discount_amount from public.charges c where c.id = r.charge_id) is distinct from (r.metadata#>>'{after,discount_amount}')::numeric;

do $$ begin
  if (select count(*) from d3_reverse) <> current_setting('batch_e.d3_expected_rows')::integer then
    raise exception 'D3 reverse refused: expected % charges, found %', current_setting('batch_e.d3_expected_rows'), (select count(*) from d3_reverse);
  end if;
  if (select role from public.profiles where id = current_setting('batch_e.d3_actor')::uuid) is distinct from 'director' then
    raise exception 'D3 reverse refused: batch_e.d3_actor must be a director profile';
  end if;
end $$;
insert into public.financial_events(event_type, charge_id, actor_id, metadata)
select 'charge_terms_corrected', r.charge_id, current_setting('batch_e.d3_actor')::uuid,
  jsonb_build_object('step', 'D3-reverse', 'reverses', r.event_id, 'before', r.metadata->'after', 'after', r.metadata->'before',
    'reason', 'Reprise D3 annulée.')
from d3_reverse r;
update public.charges c set discount_amount = (r.metadata#>>'{before,discount_amount}')::numeric, updated_at = now()
from d3_reverse r where c.id = r.charge_id;
do $$ begin
  if exists (select 1 from d3_reverse r join public.charges c on c.id = r.charge_id
             where c.discount_amount <> (r.metadata#>>'{before,discount_amount}')::numeric) then
    raise exception 'D3 reverse after-check failed';
  end if;
  if current_setting('batch_e.dry_run') = 'on' then raise exception 'DRYRUN_OK D3 reverse rows=%', (select count(*) from d3_reverse); end if;
end $$;
commit;
