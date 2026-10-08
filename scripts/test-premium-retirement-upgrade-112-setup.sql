-- Persistent synthetic migration-112 finance state for the 112 -> 113 upgrade
-- (plan premium-retirement.md D1/D5a). Local Supabase only; CI resets afterwards.
\set ON_ERROR_STOP on
begin;

do $$
begin
 if (select max(version::integer) from supabase_migrations.schema_migrations) <> 112 then
  raise exception 'Expected migration 112 as the upgrade starting point';
 end if;
end $$;

-- Fixture ids, payloads, results and row snapshots survive into the 113 session.
create schema rehearsal113;
create table rehearsal113.fx(k text primary key, v jsonb not null);
create table rehearsal113.snapshot(stage text, kind text, id uuid, row jsonb not null, primary key(stage, kind, id));
-- Test-only schema: the synthetic staff session records its own call results.
grant usage on schema rehearsal113 to authenticated;
grant select, insert on rehearsal113.fx to authenticated;

insert into auth.users(id,email,aud,role,created_at,updated_at)
values ('b1130000-0000-0000-0000-000000000001','retirement-upgrade@example.invalid','authenticated','authenticated',now(),now());
update public.profiles set role='director',full_name='Synthetic Upgrade Director' where id='b1130000-0000-0000-0000-000000000001';

insert into public.students(id,full_name,status,session_type)
select ('b1130000-0000-0000-0000-0000000000a'||n)::uuid, 'Synthetic upgrade learner '||n, 'Prospect', 'Yearly'
from generate_series(1,9) n;
insert into public.students(id,full_name,status,session_type)
values ('b1130000-0000-0000-0000-0000000000aa','Synthetic upgrade learner 10','Prospect','Yearly');

-- Case payloads (a)-(e) of the plan's lost-response retry test, plus fixtures.
-- The 112-era client sent plan_type 'Standard' on every new request, including
-- non-Yearly ones (d) and (o); 096 left it out of their fingerprint.
insert into rehearsal113.fx values
 ('payload_a', jsonb_build_object('student_id','b1130000-0000-0000-0000-0000000000a1','session_type','Yearly','school_year','2026/2027',
   'plan_type','Standard','gross_amount',2000,'payment_amount',500,'payment_date','2026-09-15','payment_method','Espèces',
   'idempotency_key','b1130000-0000-0000-0000-0000000000c1')),
 ('payload_b', jsonb_build_object('student_id','b1130000-0000-0000-0000-0000000000a2','session_type','Yearly','school_year','2026/2027',
   'plan_type','Premium','gross_amount',3000,'payment_amount',1000,'payment_date','2026-09-15','payment_method','Espèces',
   'idempotency_key','b1130000-0000-0000-0000-0000000000c2')),
 ('payload_c', jsonb_build_object('student_id','b1130000-0000-0000-0000-0000000000a3','session_type','Yearly','school_year','2026/2027',
   'plan_type','Standard','gross_amount',1500,'payment_amount',0,'payment_date','2026-09-15','payment_method','Espèces',
   'idempotency_key','b1130000-0000-0000-0000-0000000000c3')),
 ('payload_d', jsonb_build_object('student_id','b1130000-0000-0000-0000-0000000000a4','session_type','Adults','school_year','2026/2027',
   'plan_type','Standard','level','Beginning 1','gross_amount',600,'payment_amount',100,'payment_date','2026-09-15','payment_method','Espèces',
   'idempotency_key','b1130000-0000-0000-0000-0000000000c4')),
 ('payload_o', jsonb_build_object('student_id','b1130000-0000-0000-0000-0000000000a9','session_type','Other','school_year','2026/2027',
   'service_detail','Atelier synthétique','plan_type','Standard','gross_amount',50,'payment_amount',50,'payment_date','2026-09-15',
   'payment_method','Espèces','idempotency_key','b1130000-0000-0000-0000-0000000000ca'));

select set_config('request.jwt.claim.sub','b1130000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;

insert into rehearsal113.fx select 'result_'||right(k,1), public.create_charge_payment(v)
from rehearsal113.fx where k in ('payload_a','payload_b','payload_c','payload_d','payload_o') order by k;

-- (e) an instalment on an existing charge.
insert into rehearsal113.fx values ('payload_e', jsonb_build_object('student_id','b1130000-0000-0000-0000-0000000000a4',
  'charge_id',(select v->>'charge_id' from rehearsal113.fx where k='result_d'),'payment_amount',50,'payment_date','2026-09-16',
  'payment_method','Espèces','idempotency_key','b1130000-0000-0000-0000-0000000000c5'));
insert into rehearsal113.fx select 'result_e', public.create_charge_payment(v) from rehearsal113.fx where k='payload_e';

-- Settled and voided dated Yearly charges keep their plan word under D5a (Q1).
insert into rehearsal113.fx values ('result_f', public.create_charge_payment(jsonb_build_object(
  'student_id','b1130000-0000-0000-0000-0000000000a7','session_type','Yearly','school_year','2026/2027','plan_type','Standard',
  'gross_amount',800,'payment_amount',800,'payment_date','2026-09-15','payment_method','Espèces',
  'idempotency_key','b1130000-0000-0000-0000-0000000000c7')));
insert into rehearsal113.fx values ('result_v', public.create_charge_payment(jsonb_build_object(
  'student_id','b1130000-0000-0000-0000-0000000000a8','session_type','Yearly','school_year','2026/2027','plan_type','Premium',
  'gross_amount',900,'payment_amount',0,'payment_date','2026-09-15','payment_method','Espèces',
  'idempotency_key','b1130000-0000-0000-0000-0000000000c8')));
select public.void_financial_charge((select (v->>'charge_id')::uuid from rehearsal113.fx where k='result_v'),
  'Synthetic voided charge','b1130000-0000-0000-0000-0000000000c9');

-- Undated non-legacy Yearly charges, as pre-057 history left them, by direct
-- insert: one with the plan word and one with free text.
reset role;
insert into public.charges(id,student_id,session_type,service_description,plan_type,gross_amount,created_by)
values ('b1130000-0000-0000-0000-0000000000b5','b1130000-0000-0000-0000-0000000000a5','Yearly','Yearly · Standard','Standard',1000,
  'b1130000-0000-0000-0000-000000000001'),
       ('b1130000-0000-0000-0000-0000000000b7','b1130000-0000-0000-0000-0000000000aa','Yearly','Année 2025–2026, module 1','Standard',900,
  'b1130000-0000-0000-0000-000000000001');

-- A legacy Yearly balance, shaped as migrations 055/056 created them.
insert into public.receipts(id,student_id,date,nom_prenom,session_type,plan_type,montant_total,montant_paye,mode_paiement,
  statut_paiement,legacy,actor_id,gross_amount_snapshot,discount_amount_snapshot,net_amount_snapshot,paid_before_snapshot,
  balance_after_snapshot,email_delivery_status)
values ('b1130000-0000-0000-0000-0000000000d6','b1130000-0000-0000-0000-0000000000a6','2025-10-01','Synthetic upgrade learner 6',
  'Yearly','Premium',2000,800,'Espèces','Acompte versé',true,null,2000,0,2000,0,1200,'unknown');
insert into public.charges(id,student_id,session_type,service_description,plan_type,gross_amount,discount_amount,created_by,legacy,legacy_receipt_id)
select 'b1130000-0000-0000-0000-0000000000b6','b1130000-0000-0000-0000-0000000000a6','Yearly',
  concat('Reçu historique ', receipt_number),'Premium',2000,0,null,true,id
from public.receipts where id='b1130000-0000-0000-0000-0000000000d6';
update public.receipts r set charge_id=c.id, service_description=c.service_description
from public.charges c where c.id='b1130000-0000-0000-0000-0000000000b6' and r.id='b1130000-0000-0000-0000-0000000000d6';

select set_config('request.jwt.claim.sub','b1130000-0000-0000-0000-000000000001',true);
set local role authenticated;
insert into rehearsal113.fx values ('result_u', public.create_charge_payment(jsonb_build_object(
  'student_id','b1130000-0000-0000-0000-0000000000a5','charge_id','b1130000-0000-0000-0000-0000000000b5','payment_amount',300,
  'payment_date','2026-09-15','payment_method','Espèces','idempotency_key','b1130000-0000-0000-0000-0000000000c6')));
insert into rehearsal113.fx values ('result_t', public.create_charge_payment(jsonb_build_object(
  'student_id','b1130000-0000-0000-0000-0000000000aa','charge_id','b1130000-0000-0000-0000-0000000000b7','payment_amount',200,
  'payment_date','2026-09-15','payment_method','Espèces','idempotency_key','b1130000-0000-0000-0000-0000000000cb')));
reset role;

insert into rehearsal113.fx values
 ('charge_a',(select v->'charge_id' from rehearsal113.fx where k='result_a')),
 ('charge_b',(select v->'charge_id' from rehearsal113.fx where k='result_b')),
 ('charge_c',(select v->'charge_id' from rehearsal113.fx where k='result_c')),
 ('charge_d',(select v->'charge_id' from rehearsal113.fx where k='result_d')),
 ('charge_f',(select v->'charge_id' from rehearsal113.fx where k='result_f')),
 ('charge_v',(select v->'charge_id' from rehearsal113.fx where k='result_v')),
 ('charge_u','"b1130000-0000-0000-0000-0000000000b5"'),
 ('charge_t','"b1130000-0000-0000-0000-0000000000b7"'),
 ('charge_l','"b1130000-0000-0000-0000-0000000000b6"');

-- The 112 baseline really carries the plan word on charges and receipts.
do $$
declare c_b uuid := (select (v#>>'{}')::uuid from rehearsal113.fx where k='charge_b');
 c_a uuid := (select (v#>>'{}')::uuid from rehearsal113.fx where k='charge_a');
begin
 if (select service_description||'|'||plan_type from public.charges where id=c_b) <> 'Yearly · Premium · 2026/2027|Premium'
  or (select service_description||'|'||plan_type from public.receipts where charge_id=c_b) <> 'Yearly · Premium · 2026/2027|Premium'
  or (select service_description||'|'||plan_type from public.charges where id=c_a) <> 'Yearly · Standard · 2026/2027|Standard'
  or (select service_description||'|'||plan_type from public.receipts where charge_id='b1130000-0000-0000-0000-0000000000b5') <> 'Yearly · Standard|Standard'
  or (select voided_at is null from public.charges where id=(select (v#>>'{}')::uuid from rehearsal113.fx where k='charge_v'))
  or (select balance from public.charge_balances where id=(select (v#>>'{}')::uuid from rehearsal113.fx where k='charge_f')) <> 0
  or (select balance from public.charge_balances where id='b1130000-0000-0000-0000-0000000000b6') <> 1200 then
  raise exception 'Migration-112 baseline fixture is not as expected';
 end if;
end $$;

insert into rehearsal113.snapshot select 'setup','charge',id,to_jsonb(c) from public.charges c;
insert into rehearsal113.snapshot select 'setup','receipt',id,to_jsonb(r) from public.receipts r;
insert into rehearsal113.fx values ('setup_counts', jsonb_build_object(
 'charges',(select count(*) from public.charges),'receipts',(select count(*) from public.receipts),
 'requests',(select count(*) from public.financial_requests),
 'receipt_seq',(select last_value from public.receipt_number_seq)));

commit;
\echo 'PASS premium retirement migration-112 finance fixture seeded'
