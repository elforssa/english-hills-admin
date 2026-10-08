-- D5a rehearsal assertions over the 112 -> 113 upgrade fixture. Run with -v phase=:
--  unchanged  a refused run changed nothing (state equals the pre_d5a snapshot);
--  first      after the approved run: only open non-legacy Yearly charge text changed;
--  second     after a second run: nothing changed again, and the 113 replay and
--             instalment behavior still holds on the cleaned charges.
\set ON_ERROR_STOP on
select :'phase' = 'unchanged' as phase_unchanged, :'phase' = 'first' as phase_first, :'phase' = 'second' as phase_second \gset
begin;

create or replace function pg_temp.id(p_key text) returns uuid language sql as $$
 select (v#>>'{}')::uuid from rehearsal113.fx where k=p_key;
$$;
create or replace function pg_temp.balances() returns jsonb language sql as $$
 select jsonb_build_object('n',count(*),'net',sum(net_amount),'paid',sum(paid_amount),'balance',sum(balance)) from public.charge_balances;
$$;

\if :phase_unchanged
do $$ begin
 if exists(select 1 from rehearsal113.snapshot s left join public.charges c on c.id=s.id
            where s.stage='pre_d5a' and s.kind='charge' and to_jsonb(c) is distinct from s.row)
  or exists(select 1 from rehearsal113.snapshot s left join public.receipts r on r.id=s.id
            where s.stage='pre_d5a' and s.kind='receipt' and to_jsonb(r) is distinct from s.row)
  or (select count(*) from public.charges) <> (select count(*) from rehearsal113.snapshot where stage='pre_d5a' and kind='charge') then
  raise exception 'A refused D5a run changed data';
 end if;
end $$;
\echo 'PASS refused D5a run changed nothing'
\endif

\if :phase_first
do $$
declare v_targets uuid[] := array[pg_temp.id('charge_a'),pg_temp.id('charge_b'),pg_temp.id('charge_c'),pg_temp.id('charge_u')];
begin
 if (select array_agg(c.service_description order by c.service_description) from public.charges c where c.id = any(v_targets))
    <> array['Yearly','Yearly · 2026/2027','Yearly · 2026/2027','Yearly · 2026/2027'] then
  raise exception 'Open Yearly charge text was not cleaned as expected';
 end if;
 -- Undated open charges: the plan word is removed; free text without one is not a target.
 if (select service_description from public.charges where id=pg_temp.id('charge_u')) <> 'Yearly'
  or (select service_description from public.charges where id=pg_temp.id('charge_t')) <> 'Année 2025–2026, module 1' then
  raise exception 'Undated open charge text was not handled as expected';
 end if;
 -- Only the description changed on the targets; plan_type keeps its historical value.
 if exists(select 1 from rehearsal113.snapshot s join public.charges c on c.id=s.id
            where s.stage='pre_d5a' and s.kind='charge' and c.id = any(v_targets)
              and (to_jsonb(c) - 'service_description') is distinct from (s.row - 'service_description'))
  or (select plan_type from public.charges where id=pg_temp.id('charge_b')) <> 'Premium' then
  raise exception 'D5a changed a column other than service_description';
 end if;
 -- Settled, voided, legacy, non-Yearly and post-113 charges and every receipt are untouched.
 if exists(select 1 from rehearsal113.snapshot s left join public.charges c on c.id=s.id
            where s.stage='pre_d5a' and s.kind='charge' and s.id <> all(v_targets) and to_jsonb(c) is distinct from s.row)
  or exists(select 1 from rehearsal113.snapshot s left join public.receipts r on r.id=s.id
            where s.stage='pre_d5a' and s.kind='receipt' and to_jsonb(r) is distinct from s.row) then
  raise exception 'D5a changed a non-target charge or a receipt';
 end if;
 if (select service_description from public.charges where id=pg_temp.id('charge_f')) <> 'Yearly · Standard · 2026/2027'
  or (select service_description from public.charges where id=pg_temp.id('charge_v')) <> 'Yearly · Premium · 2026/2027'
  or (select service_description from public.charges where id=pg_temp.id('charge_l')) not like 'Reçu historique EH-%' then
  raise exception 'Settled, voided or legacy charge text changed';
 end if;
 if pg_temp.balances() <> (select v from rehearsal113.fx where k='pre_d5a_balances') then
  raise exception 'Charge balance totals changed';
 end if;
end $$;
insert into rehearsal113.snapshot select 'post_d5a','charge',id,to_jsonb(c) from public.charges c;
insert into rehearsal113.snapshot select 'post_d5a','receipt',id,to_jsonb(r) from public.receipts r;
\echo 'PASS D5a changed only open non-legacy Yearly charge text'
\endif

\if :phase_second
do $$ begin
 if exists(select 1 from rehearsal113.snapshot s left join public.charges c on c.id=s.id
            where s.stage='post_d5a' and s.kind='charge' and to_jsonb(c) is distinct from s.row)
  or exists(select 1 from rehearsal113.snapshot s left join public.receipts r on r.id=s.id
            where s.stage='post_d5a' and s.kind='receipt' and to_jsonb(r) is distinct from s.row) then
  raise exception 'The second D5a run changed data';
 end if;
end $$;

-- The 113 assertions still hold after D5a: 112 requests replay, a new instalment is clean.
select set_config('request.jwt.claim.sub','b1130000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
create temp table d5a_after(k text primary key, payload jsonb, original jsonb, result jsonb);
insert into d5a_after select right(p.k,1), p.v, r.v, null from rehearsal113.fx p join rehearsal113.fx r on r.k='result_'||right(p.k,1)
 where p.k like 'payload_%';
insert into d5a_after values ('instalment', jsonb_build_object('student_id','b1130000-0000-0000-0000-0000000000a2',
 'charge_id',pg_temp.id('charge_b'),'payment_amount',100,'payment_date','2026-10-02','payment_method','Espèces',
 'idempotency_key',gen_random_uuid()), null, null);
grant select, update on d5a_after to authenticated;
set local role authenticated;
update d5a_after set result = public.create_charge_payment(payload);
reset role;
do $$ begin
 if exists(select 1 from d5a_after where k <> 'instalment' and ((result->>'replayed')::boolean is not true
     or result->>'charge_id' is distinct from original->>'charge_id' or result->>'receipt_id' is distinct from original->>'receipt_id'))
  or (select count(*) from d5a_after where k <> 'instalment') <> 6 then
  raise exception 'A 112 request no longer replays after D5a';
 end if;
 if (select service_description||'|'||coalesce(plan_type,'NULL') from public.receipts
      where id=(select (result->>'receipt_id')::uuid from d5a_after where k='instalment')) <> 'Yearly · 2026/2027|NULL' then
  raise exception 'Instalment after D5a is not clean';
 end if;
end $$;
\echo 'PASS second D5a run changed nothing; replays and clean instalments hold after D5a'
\endif

commit;
