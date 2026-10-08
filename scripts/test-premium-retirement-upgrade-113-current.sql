-- Assert the 112 -> 113 upgrade over the persistent fixture of
-- test-premium-retirement-upgrade-112-setup.sql (plan premium-retirement.md D1, Q7 option A).
\set ON_ERROR_STOP on
begin;

do $$
begin
 if (select max(version::integer) from supabase_migrations.schema_migrations) <> 113
  or not exists(select 1 from supabase_migrations.schema_migrations where version='113') then
  raise exception 'Expected migration 113 after upgrade';
 end if;
 -- The migration rewrote no row.
 if exists(select 1 from rehearsal113.snapshot s left join public.charges c on c.id=s.id
            where s.stage='setup' and s.kind='charge' and to_jsonb(c) is distinct from s.row)
  or exists(select 1 from rehearsal113.snapshot s left join public.receipts r on r.id=s.id
            where s.stage='setup' and s.kind='receipt' and to_jsonb(r) is distinct from s.row) then
  raise exception 'Migration 113 changed an existing charge or receipt';
 end if;
end $$;

create or replace function pg_temp.counts() returns jsonb language sql as $$
 select jsonb_build_object('charges',(select count(*) from public.charges),'receipts',(select count(*) from public.receipts),
  'requests',(select count(*) from public.financial_requests),'receipt_seq',(select last_value from public.receipt_number_seq));
$$;
create or replace function pg_temp.fx(p_key text) returns jsonb language sql as $$
 select v from rehearsal113.fx where k=p_key;
$$;
create or replace function pg_temp.id(p_key text) returns uuid language sql as $$
 select (v#>>'{}')::uuid from rehearsal113.fx where k=p_key;
$$;

-- The function call runs as the same synthetic staff actor as under 112.
select set_config('request.jwt.claim.sub','b1130000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

-- Lost-response retries of every request committed under 112 replay the original.
do $$
declare v_case text; v_result jsonb; v_before jsonb := pg_temp.counts(); v_original jsonb;
begin
 if v_before <> pg_temp.fx('setup_counts') then raise exception 'Counts changed across the upgrade: %', v_before; end if;
 foreach v_case in array array['a','b','c','d','e'] loop
  execute 'set local role authenticated';
  v_result := public.create_charge_payment(pg_temp.fx('payload_'||v_case));
  execute 'reset role';
  v_original := pg_temp.fx('result_'||v_case);
  if coalesce((v_result->>'replayed')::boolean,false) is not true
   or v_result->>'charge_id' is distinct from v_original->>'charge_id'
   or v_result->>'receipt_id' is distinct from v_original->>'receipt_id' then
   raise exception 'Case % did not replay the original request: % vs %', v_case, v_result, v_original;
  end if;
 end loop;
 if pg_temp.fx('result_c')->>'receipt_id' is not null then raise exception 'Commitment fixture issued a receipt'; end if;

 -- Defined safe failures: a 112 first-Yearly payload without its plan value, or
 -- with another plan value or amount, is a conflict and writes nothing.
 foreach v_result in array array[
   pg_temp.fx('payload_a') - 'plan_type',
   pg_temp.fx('payload_a') || '{"payment_amount":499}',
   pg_temp.fx('payload_b') || '{"plan_type":"Standard"}'] loop
  begin
   execute 'set local role authenticated';
   perform public.create_charge_payment(v_result);
   raise exception 'Changed request replayed: %', v_result;
  exception when others then
   if sqlerrm not like 'Idempotency key conflict:%' then raise; end if;
  end;
  execute 'reset role';
 end loop;
 if pg_temp.counts() <> v_before then raise exception 'Replay or conflict wrote rows: %', pg_temp.counts(); end if;
end $$;

-- New instalments after 113 on every pre-113 shape.
create temp table instalment(k text primary key, charge_id uuid, student_id uuid, result jsonb);
insert into instalment values
 ('a',pg_temp.id('charge_a'),'b1130000-0000-0000-0000-0000000000a1',null),
 ('b',pg_temp.id('charge_b'),'b1130000-0000-0000-0000-0000000000a2',null),
 ('u',pg_temp.id('charge_u'),'b1130000-0000-0000-0000-0000000000a5',null),
 ('l',pg_temp.id('charge_l'),'b1130000-0000-0000-0000-0000000000a6',null);
grant select, update on instalment to authenticated;
set local role authenticated;
update instalment set result=public.create_charge_payment(jsonb_build_object('student_id',student_id,'charge_id',charge_id,
  'payment_amount',100,'payment_date','2026-10-01','payment_method','Espèces','idempotency_key',gen_random_uuid()))
where k in ('a','b','u','l');
reset role;

do $$
declare v record; v_seq bigint := (pg_temp.fx('setup_counts')->>'receipt_seq')::bigint; v_checked integer := 0;
begin
 for v in select i.k, r.*, c.legacy charge_legacy, c.service_description charge_text, b.balance,
             s.row->>'service_description' first_text
           from instalment i join public.receipts r on r.id=(i.result->>'receipt_id')::uuid
           join public.charges c on c.id=i.charge_id join public.charge_balances b on b.id=c.id
           left join rehearsal113.snapshot s on s.stage='setup' and s.kind='receipt'
             and s.id=(select x.id from public.receipts x where x.charge_id=c.id and x.id<>r.id order by x.created_at limit 1)
 loop
  if v.plan_type is not null then raise exception 'Instalment % stored a plan value', v.k; end if;
  if v.k in ('a','b') and (v.service_description <> 'Yearly · 2026/2027' or v.school_year_snapshot <> '2026/2027') then
   raise exception 'Instalment % on a dated charge kept the old text: %', v.k, v.service_description; end if;
  if v.k = 'u' and (v.service_description <> 'Yearly' or v.school_year_snapshot is not null) then
   raise exception 'Instalment on the undated charge: %', v.service_description; end if;
  if v.k = 'l' and (v.service_description is distinct from v.charge_text or v.charge_text not like 'Reçu historique EH-%'
     or v.school_year_snapshot is not null or not v.charge_legacy) then
   raise exception 'Legacy balance payment changed its text or invented a year: %', v.service_description; end if;
  if v.service_description ~* '(standard|premium)' then raise exception 'Instalment % carries a plan word', v.k; end if;
  if v.k in ('a','b','u') and v.first_text !~ ' · (Standard|Premium)' then raise exception 'First receipt fixture lost its text'; end if;
  v_checked := v_checked + 1;
 end loop;
 if v_checked <> 4 then raise exception 'Expected four instalment receipts, checked %', v_checked; end if;
 -- Arithmetic and numbering as before: four consecutive numbers, balances reduced by 100.
 if (select count(*) from instalment where result->>'receipt_id' is not null) <> 4
  or (select last_value from public.receipt_number_seq) <> v_seq + 4
  or (select balance from public.charge_balances where id=pg_temp.id('charge_a')) <> 1400
  or (select balance from public.charge_balances where id=pg_temp.id('charge_b')) <> 1900
  or (select balance from public.charge_balances where id=pg_temp.id('charge_u')) <> 600
  or (select balance from public.charge_balances where id=pg_temp.id('charge_l')) <> 1100 then
  raise exception 'Instalment numbering or balances differ from the 112 arithmetic';
 end if;
 if (select array_agg(r.receipt_number order by r.receipt_number) from instalment i
      join public.receipts r on r.id=(i.result->>'receipt_id')::uuid)
    <> (select array_agg('EH-2026-'||lpad((v_seq+n)::text,5,'0') order by n) from generate_series(1,4) n) then
  raise exception 'Instalment receipt numbers are not consecutive';
 end if;
 -- Charge rows and every first receipt are byte-identical to before.
 if exists(select 1 from rehearsal113.snapshot s left join public.charges c on c.id=s.id
            where s.stage='setup' and s.kind='charge' and to_jsonb(c) is distinct from s.row)
  or exists(select 1 from rehearsal113.snapshot s left join public.receipts r on r.id=s.id
            where s.stage='setup' and s.kind='receipt' and to_jsonb(r) is distinct from s.row) then
  raise exception 'An instalment changed a charge row or an earlier receipt';
 end if;
end $$;

-- A new Yearly charge after 113 never stores or shows a plan word, whatever the payload says.
set local role authenticated;
do $$
declare v_payload jsonb; r jsonb;
begin
 foreach v_payload in array array['{}'::jsonb, '{"plan_type":"Premium"}', '{"plan_type":"Standard"}'] loop
  r := public.create_charge_payment(jsonb_build_object('student_id','b1130000-0000-0000-0000-0000000000a1','session_type','Yearly',
   'school_year','2027/2028','gross_amount',100,'payment_amount',10,'payment_date','2026-10-01','payment_method','Espèces',
   'idempotency_key',gen_random_uuid()) || v_payload);
  if (select service_description||'|'||plan_type from public.charges where id=(r->>'charge_id')::uuid) <> 'Yearly · 2027/2028|Standard'
   or (select service_description||'|'||coalesce(plan_type,'NULL') from public.receipts where id=(r->>'receipt_id')::uuid) <> 'Yearly · 2027/2028|NULL' then
   raise exception 'Post-113 Yearly charge with payload % stored a plan word', v_payload;
  end if;
 end loop;
end $$;
reset role;

-- Freeze the post-upgrade state for the D5a rehearsal.
insert into rehearsal113.snapshot select 'pre_d5a','charge',id,to_jsonb(c) from public.charges c;
insert into rehearsal113.snapshot select 'pre_d5a','receipt',id,to_jsonb(r) from public.receipts r;
insert into rehearsal113.fx values ('pre_d5a_balances',(select jsonb_build_object('n',count(*),'net',sum(net_amount),
  'paid',sum(paid_amount),'balance',sum(balance)) from public.charge_balances));

commit;
\echo 'PASS premium retirement 112 to 113 upgrade: replays, conflicts, instalment text, legacy balance, numbering and balances'
