-- Migration 113 finance contract (plan premium-retirement.md D1, Q7 option A).
-- Run only against local Supabase. Synthetic rows are rolled back.
\set ON_ERROR_STOP on
begin;
alter table public.receipts disable trigger on_receipt_created;

-- Access rights, security mode and search_path equal migration 112's.
do $$ begin
 if (select array_agg(format('%s|%s|%s|%s|%s', p.oid::regprocedure, pg_get_userbyid(p.proowner), p.prosecdef, p.proconfig, p.proacl)
      order by p.oid::regprocedure::text collate "C")
     from pg_proc p where p.oid in ('public.create_charge_payment(jsonb)'::regprocedure,'public.create_charge_payment_financial(jsonb)'::regprocedure))
   <> array['create_charge_payment(jsonb)|postgres|t|{"search_path=pg_catalog, pg_temp"}|{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}',
            'create_charge_payment_financial(jsonb)|postgres|t|{"search_path=pg_catalog, pg_temp"}|{postgres=X/postgres}'] then
  raise exception 'Finance command access rights differ from migration 112';
 end if;
 -- Release B's catalog scan treats any occurrence of the retired word as a failure.
 if exists(select 1 from pg_proc where oid in ('public.create_charge_payment(jsonb)'::regprocedure,'public.create_charge_payment_financial(jsonb)'::regprocedure)
            and prosrc ~* 'premium') then
  raise exception 'A finance command body still names the retired plan';
 end if;
end $$;

insert into auth.users(id,email,aud,role,created_at,updated_at)
values ('b1131000-0000-0000-0000-000000000001','retirement-staff@example.test','authenticated','authenticated',now(),now()),
       ('b1131000-0000-0000-0000-000000000002','retirement-parent@example.test','authenticated','authenticated',now(),now());
update public.profiles set role='director' where id='b1131000-0000-0000-0000-000000000001';
update public.profiles set role='parent' where id='b1131000-0000-0000-0000-000000000002';
insert into public.students(id,full_name,status,session_type)
select ('b1131000-0000-0000-0000-0000000000a'||n)::uuid, 'Synthetic retirement learner '||n, 'Prospect', 'Yearly'
from generate_series(1,6) n;

-- Pre-113 charge shapes by direct insert: dated with the plan word, undated, and legacy.
insert into public.charges(id,student_id,session_type,school_year,service_description,plan_type,gross_amount,created_by)
values ('b1131000-0000-0000-0000-0000000000b1','b1131000-0000-0000-0000-0000000000a4','Yearly','2026/2027','Yearly · Premium · 2026/2027','Premium',3000,'b1131000-0000-0000-0000-000000000001'),
       ('b1131000-0000-0000-0000-0000000000b2','b1131000-0000-0000-0000-0000000000a5','Yearly',null,'Yearly · Standard','Standard',1000,'b1131000-0000-0000-0000-000000000001');
insert into public.receipts(id,student_id,date,nom_prenom,session_type,plan_type,montant_total,montant_paye,mode_paiement,
  statut_paiement,legacy,actor_id,gross_amount_snapshot,discount_amount_snapshot,net_amount_snapshot,paid_before_snapshot,
  balance_after_snapshot,email_delivery_status)
values ('b1131000-0000-0000-0000-0000000000d6','b1131000-0000-0000-0000-0000000000a6','2025-10-01','Synthetic retirement learner 6',
  'Yearly','Premium',2000,800,'Espèces','Acompte versé',true,null,2000,0,2000,0,1200,'unknown');
insert into public.charges(id,student_id,session_type,service_description,plan_type,gross_amount,discount_amount,created_by,legacy,legacy_receipt_id)
select 'b1131000-0000-0000-0000-0000000000b6','b1131000-0000-0000-0000-0000000000a6','Yearly',
  concat('Reçu historique ', receipt_number),'Premium',2000,0,null,true,id
from public.receipts where id='b1131000-0000-0000-0000-0000000000d6';
update public.receipts set charge_id='b1131000-0000-0000-0000-0000000000b6' where id='b1131000-0000-0000-0000-0000000000d6';
create temp table pre_charges as select id, to_jsonb(c) row from public.charges c where id::text like 'b1131000-%';

select set_config('request.jwt.claim.sub','b1131000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
create temp table r(k text primary key, payload jsonb, result jsonb);

-- New Yearly charges: no payload plan, a stale Premium or Standard plan all give the same records.
insert into r values
 ('yearly',  '{"student_id":"b1131000-0000-0000-0000-0000000000a1"}', null),
 ('premium', '{"student_id":"b1131000-0000-0000-0000-0000000000a2","plan_type":"Premium"}', null),
 ('standard','{"student_id":"b1131000-0000-0000-0000-0000000000a3","plan_type":" Standard "}', null);
update r set payload = payload || jsonb_build_object('session_type','Yearly','school_year','2026/2027','gross_amount',2000,
  'payment_amount',500,'payment_date','2026-09-15','payment_method','Espèces','idempotency_key',gen_random_uuid());
update r set result = public.create_charge_payment(payload);
do $$ declare v record; begin
 for v in select r.k, c.service_description c_text, c.plan_type c_plan, x.service_description r_text, x.plan_type r_plan,
             x.school_year_snapshot from r join public.charges c on c.id=(r.result->>'charge_id')::uuid
             join public.receipts x on x.id=(r.result->>'receipt_id')::uuid loop
  if v.c_text <> 'Yearly · 2026/2027' or v.c_plan <> 'Standard' or v.r_text <> 'Yearly · 2026/2027'
     or v.r_plan is not null or v.school_year_snapshot <> '2026/2027' then
   raise exception 'New Yearly charge % stored a plan word: %', v.k, row_to_json(v);
  end if;
 end loop;
 if (select count(*) from r where result->>'receipt_id' is not null) <> 3 then raise exception 'Expected three Yearly receipts'; end if;
end $$;

reset role;
-- Q7 option A: the fingerprint of a new Yearly request equals migration 112's byte for byte.
do $$ declare v_payload jsonb := (select payload from r where k='premium'); begin
 if (select request_fingerprint from public.financial_requests where idempotency_key=(v_payload->>'idempotency_key')::uuid)
   <> encode(extensions.digest(jsonb_strip_nulls(jsonb_build_object(
        'student_id',v_payload->>'student_id','update_contacts',false,'session_type','Yearly','school_year','2026/2027',
        'plan_type','Premium','gross_amount',2000.00::numeric(12,2),'discount_amount',0.00::numeric(12,2),
        'payment_amount',500.00::numeric(12,2),'payment_date','2026-09-15'::date,'payment_method','Espèces',
        'request_email',false))::text,'sha256'),'hex') then
  raise exception 'Fingerprint of a new Yearly request differs from migration 112';
 end if;
end $$;
set local role authenticated;

-- Replay and the defined safe failures.
do $$ declare v_payload jsonb; v_result jsonb; v_receipts bigint := (select count(*) from public.receipts); begin
 for v_payload, v_result in select payload, result from r loop
  if (public.create_charge_payment(v_payload)->>'receipt_id') is distinct from v_result->>'receipt_id' then
   raise exception 'Identical retry did not replay';
  end if;
 end loop;
 foreach v_payload in array array[
   (select payload from r where k='premium') - 'plan_type',
   (select payload from r where k='premium') || '{"plan_type":"Standard"}',
   (select payload from r where k='yearly') || '{"plan_type":"Standard"}',
   (select payload from r where k='yearly') || '{"payment_amount":499}'] loop
  begin
   perform public.create_charge_payment(v_payload);
   raise exception 'Changed request replayed';
  exception when others then
   if sqlerrm not like 'Idempotency key conflict:%' then raise; end if;
  end;
 end loop;
 if (select count(*) from public.receipts) <> v_receipts then raise exception 'Replay or conflict wrote a receipt'; end if;
end $$;

-- Zero-payment Yearly commitment and non-Yearly sessions (a stale plan value is ignored).
insert into r values
 ('commitment', jsonb_build_object('student_id','b1131000-0000-0000-0000-0000000000a1','session_type','Yearly','school_year','2027/2028',
   'gross_amount',1500,'payment_amount',0,'payment_method','Espèces','idempotency_key',gen_random_uuid()), null),
 ('adults', jsonb_build_object('student_id','b1131000-0000-0000-0000-0000000000a2','session_type','Adults','school_year','2026/2027',
   'plan_type','Premium','level','Beginning 1','gross_amount',600,'payment_amount',100,'payment_method','Espèces','idempotency_key',gen_random_uuid()), null),
 ('other', jsonb_build_object('student_id','b1131000-0000-0000-0000-0000000000a3','session_type','Other','school_year','2026/2027',
   'service_detail','Atelier synthétique','plan_type','Standard','gross_amount',50,'payment_amount',50,'payment_method','Espèces','idempotency_key',gen_random_uuid()), null);
update r set result = public.create_charge_payment(payload) where result is null;
do $$ begin
 if (select service_description||'|'||plan_type from public.charges where id=(select (result->>'charge_id')::uuid from r where k='commitment')) <> 'Yearly · 2027/2028|Standard'
  or (select result->>'receipt_id' from r where k='commitment') is not null then
  raise exception 'Yearly commitment failed';
 end if;
 if exists(select 1 from r join public.charges c on c.id=(r.result->>'charge_id')::uuid
            join public.receipts x on x.id=(r.result->>'receipt_id')::uuid
           where r.k in ('adults','other') and (c.plan_type is not null or x.plan_type is not null
             or x.service_description is distinct from c.service_description or c.service_description ~* '(standard|premium)'))
  or (select service_description from public.charges where id=(select (result->>'charge_id')::uuid from r where k='adults')) <> 'Adults · 2026/2027'
  or (select service_description from public.charges where id=(select (result->>'charge_id')::uuid from r where k='other')) <> 'Autre · Atelier synthétique · 2026/2027' then
  raise exception 'Non-Yearly receipt text is not the charge text';
 end if;
end $$;

-- Instalments on pre-113 shapes: dated, undated, and a legacy balance.
insert into r values
 ('dated',   '{"student_id":"b1131000-0000-0000-0000-0000000000a4","charge_id":"b1131000-0000-0000-0000-0000000000b1"}', null),
 ('undated', '{"student_id":"b1131000-0000-0000-0000-0000000000a5","charge_id":"b1131000-0000-0000-0000-0000000000b2"}', null),
 ('legacy',  '{"student_id":"b1131000-0000-0000-0000-0000000000a6","charge_id":"b1131000-0000-0000-0000-0000000000b6"}', null);
update r set payload = payload || jsonb_build_object('payment_amount',100,'payment_method','Espèces','idempotency_key',gen_random_uuid())
where k in ('dated','undated','legacy');
update r set result = public.create_charge_payment(payload) where k in ('dated','undated','legacy');
reset role;
do $$ declare v_dated public.receipts; v_undated public.receipts; v_legacy public.receipts; begin
 select * into v_dated from public.receipts where id=(select (result->>'receipt_id')::uuid from r where k='dated');
 select * into v_undated from public.receipts where id=(select (result->>'receipt_id')::uuid from r where k='undated');
 select * into v_legacy from public.receipts where id=(select (result->>'receipt_id')::uuid from r where k='legacy');
 if v_dated.service_description <> 'Yearly · 2026/2027' or v_dated.plan_type is not null or v_dated.school_year_snapshot <> '2026/2027' then
  raise exception 'Instalment on a dated pre-113 charge: %', v_dated.service_description; end if;
 if v_undated.service_description <> 'Yearly' or v_undated.plan_type is not null or v_undated.school_year_snapshot is not null then
  raise exception 'Instalment on an undated pre-113 charge: %', v_undated.service_description; end if;
 if v_legacy.service_description is distinct from (select service_description from public.charges where id='b1131000-0000-0000-0000-0000000000b6')
  or v_legacy.service_description not like 'Reçu historique EH-%' or v_legacy.plan_type is not null or v_legacy.school_year_snapshot is not null then
  raise exception 'Legacy balance payment: %', v_legacy.service_description; end if;
 if v_dated.balance_after_snapshot <> 2900 or v_undated.balance_after_snapshot <> 900 or v_legacy.balance_after_snapshot <> 1100 then
  raise exception 'Instalment arithmetic changed'; end if;
 -- The wrapper may link an enrollment; nothing else on a pre-113 charge changes.
 if exists(select 1 from pre_charges p join public.charges c on c.id=p.id
            where (to_jsonb(c) - 'enrollment_id' - 'updated_at') is distinct from (p.row - 'enrollment_id' - 'updated_at')) then
  raise exception 'A payment changed a pre-113 charge';
 end if;
 -- Numbering stays consecutive.
 if (select count(distinct receipt_number) from public.receipts where id in (select (result->>'receipt_id')::uuid from r where result->>'receipt_id' is not null))
    <> (select count(*) from r where result->>'receipt_id' is not null) then
  raise exception 'Duplicate receipt numbers';
 end if;
end $$;

-- Other roles remain denied.
select set_config('request.jwt.claim.sub','b1131000-0000-0000-0000-000000000002',true);
set local role authenticated;
do $$ begin
 begin perform public.create_charge_payment((select payload from r where k='yearly')); raise exception 'parent payment accepted';
 exception when insufficient_privilege then null; end;
 begin perform public.create_charge_payment_financial('{}'); raise exception 'parent inner command accepted';
 exception when insufficient_privilege then null; end;
end $$;
reset role;

rollback;
\echo 'PASS premium retirement finance contract (113): Yearly text, receipt plan, instalments, legacy balance, fingerprint, replay, ACLs'
