-- Synthetic local-only regression test for migration 055. Everything rolls back.
\set ON_ERROR_STOP on
begin;

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
 ('10000000-0000-0000-0000-000000000001','finance-director@example.test','authenticated','authenticated',now(),now()),
 ('10000000-0000-0000-0000-000000000002','parent@example.test','authenticated','authenticated',now(),now());
update public.profiles set role='director',full_name='Synthetic Director' where id='10000000-0000-0000-0000-000000000001';

insert into public.students(id,full_name,telephone,email,parent_email,status,session_type,plan_type,premium_start_date)
values ('20000000-0000-0000-0000-000000000001','Synthetic Premium','0600000000','student@example.test','parent@example.test','Enrolled','Yearly','Premium',current_date-30);
update public.profiles set role='parent',linked_student_id='20000000-0000-0000-0000-000000000001' where id='10000000-0000-0000-0000-000000000002';

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;

-- 3,000 MAD charge, two installments. The retry replays the first receipt.
create temp table test_results(name text primary key, result jsonb);
insert into test_results values ('first', public.create_charge_payment(jsonb_build_object(
  'student_id','20000000-0000-0000-0000-000000000001','session_type','Yearly','service_description','Année synthétique',
  'plan_type','Premium','gross_amount','3000','discount_amount','0','payment_amount','1500.00','payment_date',current_date,
  'payment_method','Espèces','idempotency_key','30000000-0000-0000-0000-000000000001')));
insert into test_results values ('retry', public.create_charge_payment(jsonb_build_object(
  'student_id','20000000-0000-0000-0000-000000000001','session_type','Yearly','service_description','Année synthétique',
  'plan_type','Premium','gross_amount','3000','discount_amount','0','payment_amount','1500.00','payment_date',current_date,
  'payment_method','Espèces','idempotency_key','30000000-0000-0000-0000-000000000001')));
insert into test_results values ('second', public.create_charge_payment(jsonb_build_object(
  'student_id','20000000-0000-0000-0000-000000000001','charge_id',(select result->>'charge_id' from test_results where name='first'),
  'payment_amount','1500','payment_date',current_date,'payment_method','Virement',
  'idempotency_key','30000000-0000-0000-0000-000000000002')));

do $$ declare c record; begin
  select * into c from public.charge_balances where id = (select (result->>'charge_id')::uuid from test_results where name='first');
  if c.paid_amount <> 3000 or c.balance <> 0 or c.settlement_status <> 'Soldé' then raise exception 'Installment totals failed: %',row_to_json(c); end if;
  if (select count(*) from public.receipts where charge_id=c.id) <> 2 then raise exception 'Expected exactly two receipts'; end if;
  if (select count(*) from public.financial_events where charge_id=c.id and event_type='charge_created') <> 1 then raise exception 'Charge audit event missing/duplicated'; end if;
  if (select count(*) from public.financial_events where charge_id=c.id and event_type='payment_recorded') <> 2 then raise exception 'Payment audit events missing'; end if;
  if coalesce((select (result->>'replayed')::boolean from test_results where name='retry'),false) is not true then raise exception 'Idempotent retry did not replay'; end if;
end $$;

-- Every current catalog session accepts a charge without level/group.
do $$ declare session_name text; result jsonb; begin
  foreach session_name in array array['Yearly','Adults','Summer Camp','Communication Junior','Communication Adult','One-to-One','Mise à niveau','Other'] loop
    result := public.create_charge_payment(jsonb_build_object(
      'student_id','20000000-0000-0000-0000-000000000001','session_type',session_name,
      'service_description',case when session_name='Other' then 'Autre service synthétique' else 'Service synthétique' end,
      'plan_type','Standard','gross_amount','1.25','discount_amount','0.25','payment_amount','0',
      'payment_method','Espèces','idempotency_key',gen_random_uuid()));
    if result->>'charge_id' is null or result->>'receipt_id' is not null then raise exception 'Catalog session failed: %',session_name; end if;
  end loop;
end $$;

-- Decimal discount and zero-payment owed charge (no zero-value receipt).
insert into test_results values ('decimal', public.create_charge_payment(jsonb_build_object(
  'student_id','20000000-0000-0000-0000-000000000001','session_type','Adults','service_description','Module décimal',
  'plan_type','Standard','gross_amount','100.01','discount_amount','0.01','payment_amount','40.00','payment_date',current_date,
  'due_date',current_date-1,'payment_method','Carte bancaire','idempotency_key','30000000-0000-0000-0000-000000000003')));
insert into test_results values ('zero', public.create_charge_payment(jsonb_build_object(
  'student_id','20000000-0000-0000-0000-000000000001','session_type','Summer Camp','service_description','Camp synthétique',
  'gross_amount','500','payment_amount','0','payment_date',current_date,'payment_method','Espèces',
  'idempotency_key','30000000-0000-0000-0000-000000000004')));
do $$ declare c record; begin
  select * into c from public.charge_balances where id=(select (result->>'charge_id')::uuid from test_results where name='decimal');
  if c.net_amount<>100 or c.paid_amount<>40 or c.balance<>60 or c.settlement_status<>'En retard' then raise exception 'Decimal/overdue test failed'; end if;
  if (select result->>'receipt_id' from test_results where name='zero') is not null then raise exception 'Zero payment issued a receipt'; end if;
end $$;

-- Invalid/excess/Premium misuse fail atomically.
do $$ begin
  begin perform public.create_charge_payment(jsonb_build_object('student_id','20000000-0000-0000-0000-000000000001','charge_id',(select result->>'charge_id' from test_results where name='decimal'),'payment_amount','60.01','payment_date',current_date,'payment_method','Espèces','idempotency_key','30000000-0000-0000-0000-000000000005')); raise exception 'overpayment accepted'; exception when others then if sqlerrm='overpayment accepted' then raise; end if; end;
  begin perform public.create_charge_payment(jsonb_build_object('student_id','20000000-0000-0000-0000-000000000001','session_type','Adults','service_description','Bad premium','plan_type','Premium','gross_amount','10','payment_amount','1','payment_method','Espèces','idempotency_key','30000000-0000-0000-0000-000000000006')); raise exception 'non-Yearly Premium accepted'; exception when others then if sqlerrm='non-Yearly Premium accepted' then raise; end if; end;
  begin perform public.create_charge_payment(jsonb_build_object('student_name','Should Roll Back','session_type','Other','service_description','x','gross_amount','10','payment_amount','-1','payment_method','Espèces','idempotency_key','30000000-0000-0000-0000-000000000007')); raise exception 'negative accepted'; exception when others then if sqlerrm='negative accepted' then raise; end if; end;
  if exists(select 1 from public.students where full_name='Should Roll Back') then raise exception 'Failed transaction left a student'; end if;
end $$;

-- Financial writes never alter academic identity or Premium entitlement.
do $$ declare s record; begin select * into s from public.students where id='20000000-0000-0000-0000-000000000001'; if s.session_type<>'Yearly' or s.plan_type<>'Premium' or s.premium_start_date is null then raise exception 'Academic Premium identity changed'; end if; end $$;

-- Voiding preserves the row and restores the balance exactly once.
insert into test_results values ('void', public.void_financial_receipt((select (result->>'receipt_id')::uuid from test_results where name='second'),'Synthetic correction','30000000-0000-0000-0000-000000000008'));
insert into test_results values ('void_retry', public.void_financial_receipt((select (result->>'receipt_id')::uuid from test_results where name='second'),'Synthetic correction retry','30000000-0000-0000-0000-000000000008'));
do $$ declare c record; begin select * into c from public.charge_balances where id=(select (result->>'charge_id')::uuid from test_results where name='first'); if c.balance<>1500 or c.paid_amount<>1500 then raise exception 'Void balance failed'; end if; if (select (result->>'already_voided')::boolean from test_results where name='void_retry') is not true then raise exception 'Void retry failed'; end if; if (select count(*) from public.financial_events where receipt_id=(select (result->>'receipt_id')::uuid from test_results where name='second') and event_type='payment_voided')<>1 then raise exception 'Void audit event missing/duplicated'; end if; end $$;

-- Direct authenticated mutation is blocked at the database boundary.
do $$ begin begin insert into public.charges(student_id,session_type,service_description,plan_type,gross_amount,created_by) values('20000000-0000-0000-0000-000000000001','Yearly','Bypass','Standard',1,'10000000-0000-0000-0000-000000000001'); raise exception 'direct write accepted'; exception when insufficient_privilege then null; end; end $$;

reset role;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
set local role authenticated;
do $$ begin if (select count(*) from public.charge_balances where student_id='20000000-0000-0000-0000-000000000001') < 1 then raise exception 'Parent cannot read linked balances'; end if; begin perform public.create_charge_payment('{}'); raise exception 'parent mutation accepted'; exception when insufficient_privilege then null; end; end $$;

rollback;
\echo 'receipt charge/payment synthetic tests passed'
