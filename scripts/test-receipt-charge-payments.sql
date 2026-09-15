-- Synthetic local-only regression test for migration 055. Everything rolls back.
\set ON_ERROR_STOP on
begin;

-- Email delivery is verified with JavaScript mocks. Keep this SQL suite fully
-- local and prevent any configured webhook from making an outbound request.
alter table public.receipts disable trigger on_receipt_created;

insert into auth.users(id,email,aud,role,created_at,updated_at)
values
 ('10000000-0000-0000-0000-000000000001','finance-director@example.test','authenticated','authenticated',now(),now()),
 ('10000000-0000-0000-0000-000000000002','parent@example.test','authenticated','authenticated',now(),now()),
 ('10000000-0000-0000-0000-000000000003','student@example.test','authenticated','authenticated',now(),now()),
 ('10000000-0000-0000-0000-000000000004','missing-profile@example.test','authenticated','authenticated',now(),now()),
 ('10000000-0000-0000-0000-000000000005','second-admin@example.test','authenticated','authenticated',now(),now());
update public.profiles set role='director',full_name='Synthetic Director' where id='10000000-0000-0000-0000-000000000001';
update public.profiles set role='student' where id='10000000-0000-0000-0000-000000000003';
update public.profiles set role='admin' where id='10000000-0000-0000-0000-000000000005';
delete from public.profiles where id='10000000-0000-0000-0000-000000000004';

insert into public.students(id,full_name,telephone,email,parent_email,status,session_type,plan_type,premium_start_date)
values ('20000000-0000-0000-0000-000000000001','Synthetic Premium','0600000000','student@example.test','parent@example.test','Enrolled','Yearly','Premium',current_date-30);
insert into public.students(id,full_name,telephone,status)
values ('20000000-0000-0000-0000-000000000003','Second Synthetic','0611111111','Prospect');
update public.profiles set role='parent',linked_student_id='20000000-0000-0000-0000-000000000001' where id='10000000-0000-0000-0000-000000000002';

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;

-- 3,000 MAD charge, two installments. The retry replays the first receipt.
create temp table test_results(name text primary key, result jsonb);
insert into test_results values ('first', public.create_charge_payment(jsonb_build_object(
  'student_id','20000000-0000-0000-0000-000000000001','session_type','Yearly','school_year','2026/2027',
  'plan_type','Premium','gross_amount','3000','discount_amount','0','payment_amount','1500.00','payment_date',current_date,
  'payment_method','Espèces','request_email',true,'email_recipient','parent@example.test','idempotency_key','30000000-0000-0000-0000-000000000001')));
insert into test_results values ('retry', public.create_charge_payment(jsonb_build_object(
  'student_id','20000000-0000-0000-0000-000000000001','session_type','Yearly','school_year','2026/2027',
  'plan_type','Premium','gross_amount','3000.00','discount_amount','','payment_amount','1500','payment_date',current_date,
  'payment_method','Espèces','phone','ignored while contacts are not updated','request_email',true,'email_recipient','PARENT@example.test',
  'idempotency_key','30000000-0000-0000-0000-000000000001')));

-- A successful response can be lost: equivalent retries replay, while any
-- meaningful content or actor change is an explicit conflict before writes.
do $$
declare
  before_charges bigint := (select count(*) from public.charges);
  before_receipts bigint := (select count(*) from public.receipts);
  before_students bigint := (select count(*) from public.students);
  original_phone text := (select telephone from public.students where id='20000000-0000-0000-0000-000000000001');
  conflict_payload jsonb;
begin
  foreach conflict_payload in array array[
    jsonb_build_object('student_id','20000000-0000-0000-0000-000000000001','session_type','Yearly','school_year','2026/2027','plan_type','Premium','gross_amount','3000','discount_amount','0','payment_amount','1400','payment_date',current_date,'payment_method','Espèces','request_email',true,'email_recipient','parent@example.test','idempotency_key','30000000-0000-0000-0000-000000000001'),
    jsonb_build_object('student_id','20000000-0000-0000-0000-000000000003','session_type','Yearly','school_year','2026/2027','plan_type','Premium','gross_amount','3000','discount_amount','0','payment_amount','1500','payment_date',current_date,'payment_method','Espèces','request_email',true,'email_recipient','parent@example.test','idempotency_key','30000000-0000-0000-0000-000000000001'),
    jsonb_build_object('student_id','20000000-0000-0000-0000-000000000001','charge_id','70000000-0000-0000-0000-000000000001','payment_amount','1500','payment_date',current_date,'payment_method','Espèces','idempotency_key','30000000-0000-0000-0000-000000000001'),
    jsonb_build_object('student_id','20000000-0000-0000-0000-000000000001','session_type','Yearly','school_year','2026/2027','plan_type','Premium','gross_amount','3000','discount_amount','0','payment_amount','1500','payment_date',current_date,'payment_method','Espèces','update_contacts',true,'phone','0699999999','request_email',true,'email_recipient','parent@example.test','idempotency_key','30000000-0000-0000-0000-000000000001'),
    jsonb_build_object('student_id','20000000-0000-0000-0000-000000000001','session_type','Yearly','school_year','2027/2028','plan_type','Premium','gross_amount','3000','discount_amount','0','payment_amount','1500','payment_date',current_date,'payment_method','Espèces','request_email',true,'email_recipient','parent@example.test','idempotency_key','30000000-0000-0000-0000-000000000001')
  ] loop
    begin
      perform public.create_charge_payment(conflict_payload);
      raise exception 'Changed request unexpectedly replayed';
    exception when others then
      if sqlerrm not like 'Idempotency key conflict:%' then raise; end if;
    end;
  end loop;
  if (select count(*) from public.charges) <> before_charges
     or (select count(*) from public.receipts) <> before_receipts
     or (select count(*) from public.students) <> before_students
     or (select telephone from public.students where id='20000000-0000-0000-0000-000000000001') is distinct from original_phone then
    raise exception 'An idempotency conflict changed financial, student, or contact data';
  end if;
end $$;

reset role;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000005',true);
set local role authenticated;
do $$ declare before_charges bigint := (select count(*) from public.charges); before_receipts bigint := (select count(*) from public.receipts); begin
  begin
    perform public.create_charge_payment(jsonb_build_object(
      'student_id','20000000-0000-0000-0000-000000000001','session_type','Yearly','school_year','2026/2027',
      'plan_type','Premium','gross_amount','3000',
      'discount_amount','0','payment_amount','1500','payment_date',current_date,
      'payment_method','Espèces','request_email',true,'email_recipient','parent@example.test','idempotency_key','30000000-0000-0000-0000-000000000001'));
    raise exception 'Another actor reused an idempotency key';
  exception when others then
    if sqlerrm not like 'Idempotency key conflict:%another actor%' then raise; end if;
  end;
  if (select count(*) from public.charges) <> before_charges
     or (select count(*) from public.receipts) <> before_receipts then
    raise exception 'Cross-actor key conflict created financial rows';
  end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
set local role authenticated;

-- Inline creation is also bound to its normalized identity/contact payload.
insert into test_results values ('inline', public.create_charge_payment(jsonb_build_object(
  'student_name','  Inline Synthetic  ','phone',' 0622222222 ','student_email','INLINE@EXAMPLE.TEST',
  'session_type','Other','school_year','2026/2027','service_detail','Inline service','gross_amount','25.00',
  'payment_amount','0.00','payment_method','Espèces',
  'idempotency_key','30000000-0000-0000-0000-000000000013')));
do $$ declare student_count bigint := (select count(*) from public.students where full_name like 'Inline Synthetic%'); begin
  begin
    perform public.create_charge_payment(jsonb_build_object(
      'student_name','Different Inline','phone','0622222222','student_email','inline@example.test',
      'session_type','Other','school_year','2026/2027','service_detail','Inline service','gross_amount','25',
      'payment_amount','0','payment_method','Espèces',
      'idempotency_key','30000000-0000-0000-0000-000000000013'));
    raise exception 'Changed inline request unexpectedly replayed';
  exception when others then
    if sqlerrm not like 'Idempotency key conflict:%' then raise; end if;
  end;
  if (select count(*) from public.students where full_name like '%Inline%') <> student_count then
    raise exception 'Inline idempotency conflict created another student';
  end if;
end $$;
insert into test_results values ('second', public.create_charge_payment(jsonb_build_object(
  'student_id','20000000-0000-0000-0000-000000000001','charge_id',(select result->>'charge_id' from test_results where name='first'),
  'payment_amount','1500','payment_date',current_date,'payment_method','Virement',
  'idempotency_key','30000000-0000-0000-0000-000000000002')));

do $$ declare c record; begin
  select * into c from public.charge_balances where id = (select (result->>'charge_id')::uuid from test_results where name='first');
  if c.paid_amount <> 3000 or c.balance <> 0 or c.settlement_status <> 'Soldé' then raise exception 'Installment totals failed: %',row_to_json(c); end if;
  if (select school_year from public.charge_balances where id=c.id) is distinct from '2026/2027' then raise exception 'Balance view lost school year'; end if;
  if c.school_year <> '2026/2027' or c.service_description <> 'Yearly · Premium · 2026/2027' then raise exception 'Structured school year/service failed'; end if;
  if (select count(*) from public.receipts where charge_id=c.id) <> 2 then raise exception 'Expected exactly two receipts'; end if;
  if exists(select 1 from public.receipts where charge_id=c.id and school_year_snapshot <> '2026/2027') then raise exception 'Receipt school-year snapshot failed'; end if;
  if (select count(*) from public.financial_events where charge_id=c.id and event_type='charge_created') <> 1 then raise exception 'Charge audit event missing/duplicated'; end if;
  if (select count(*) from public.financial_events where charge_id=c.id and event_type='payment_recorded') <> 2 then raise exception 'Payment audit events missing'; end if;
  if coalesce((select (result->>'replayed')::boolean from test_results where name='retry'),false) is not true then raise exception 'Idempotent retry did not replay'; end if;
end $$;

-- Every current catalog session accepts a charge without level/group.
do $$ declare session_name text; result jsonb; begin
  foreach session_name in array array['Yearly','Adults','Summer Camp','Communication Junior','Communication Adult','One-to-One','Mise à niveau','Other'] loop
    result := public.create_charge_payment(jsonb_build_object(
      'student_id','20000000-0000-0000-0000-000000000001','session_type',session_name,'school_year','2026/2027',
      'service_detail',case when session_name='Other' then 'Autre service synthétique' else null end,
      'plan_type','Standard','gross_amount','1.25','discount_amount','0.25','payment_amount','0',
      'payment_method','Espèces','idempotency_key',gen_random_uuid()));
    if result->>'charge_id' is null or result->>'receipt_id' is not null then raise exception 'Catalog session failed: %',session_name; end if;
  end loop;
end $$;

-- Decimal discount and zero-payment owed charge (no zero-value receipt).
insert into test_results values ('decimal', public.create_charge_payment(jsonb_build_object(
  'student_id','20000000-0000-0000-0000-000000000001','session_type','Adults','school_year','2026/2027',
  'plan_type','Standard','gross_amount','100.01','discount_amount','0.01','payment_amount','40.00','payment_date',current_date,
  'due_date',current_date-1,'payment_method','Carte bancaire','idempotency_key','30000000-0000-0000-0000-000000000003')));
insert into test_results values ('zero', public.create_charge_payment(jsonb_build_object(
  'student_id','20000000-0000-0000-0000-000000000001','session_type','Summer Camp','school_year','2026/2027',
  'gross_amount','500','payment_amount','0','payment_date',current_date,'payment_method','Espèces',
  'idempotency_key','30000000-0000-0000-0000-000000000004')));
do $$ declare c record; begin
  select * into c from public.charge_balances where id=(select (result->>'charge_id')::uuid from test_results where name='decimal');
  if c.net_amount<>100 or c.paid_amount<>40 or c.balance<>60 or c.settlement_status<>'En retard' then raise exception 'Decimal/overdue test failed'; end if;
  if (select result->>'receipt_id' from test_results where name='zero') is not null then raise exception 'Zero payment issued a receipt'; end if;
end $$;

-- A missing Yearly formula must fail closed (SQL NULL is not a valid plan).
do $$ begin
  begin
    perform public.create_charge_payment(jsonb_build_object(
      'student_id','20000000-0000-0000-0000-000000000001','session_type','Yearly',
      'school_year','2026/2027','gross_amount','10','payment_amount','1',
      'payment_method','Espèces','idempotency_key',gen_random_uuid()));
    raise exception 'Missing Yearly formula accepted';
  exception when others then
    if sqlerrm <> 'A Yearly charge requires Standard or Premium.' then raise; end if;
  end;
end $$;

-- Unrequested email inputs are ignored both in the fingerprint and snapshot.
do $$ declare k uuid := gen_random_uuid(); first_result jsonb; retry_result jsonb; payload jsonb; begin
  payload := jsonb_build_object('student_id','20000000-0000-0000-0000-000000000001',
    'session_type','Adults','school_year','2026/2027','gross_amount','10','payment_amount','1',
    'payment_method','Espèces','request_email',false,'email_recipient','ignored-one@example.test','idempotency_key',k);
  first_result := public.create_charge_payment(payload);
  retry_result := public.create_charge_payment(payload || jsonb_build_object('email_recipient','ignored-two@example.test'));
  if first_result->>'receipt_id' is distinct from retry_result->>'receipt_id' then raise exception 'Ignored email changed replay'; end if;
  if (select email from public.receipts where id=(first_result->>'receipt_id')::uuid) is distinct from 'parent@example.test' then raise exception 'Unrequested recipient affected snapshot'; end if;
end $$;

-- Invalid/excess/Premium misuse fail atomically.
do $$ begin
  begin perform public.create_charge_payment(jsonb_build_object('student_id','20000000-0000-0000-0000-000000000001','charge_id',(select result->>'charge_id' from test_results where name='decimal'),'payment_amount','60.01','payment_date',current_date,'payment_method','Espèces','idempotency_key','30000000-0000-0000-0000-000000000005')); raise exception 'overpayment accepted'; exception when others then if sqlerrm='overpayment accepted' then raise; end if; end;
  begin perform public.create_charge_payment(jsonb_build_object('student_id','20000000-0000-0000-0000-000000000001','session_type','Adults','school_year','2026/2027','plan_type','Premium','gross_amount','10','payment_amount','1','payment_method','Espèces','idempotency_key','30000000-0000-0000-0000-000000000006')); raise exception 'non-Yearly Premium accepted'; exception when others then if sqlerrm='non-Yearly Premium accepted' then raise; end if; end;
  begin perform public.create_charge_payment(jsonb_build_object('student_name','Should Roll Back','session_type','Other','school_year','2026/2027','service_detail','x','gross_amount','10','payment_amount','-1','payment_method','Espèces','idempotency_key','30000000-0000-0000-0000-000000000007')); raise exception 'negative accepted'; exception when others then if sqlerrm='negative accepted' then raise; end if; end;
  begin perform public.create_charge_payment(jsonb_build_object('student_id','20000000-0000-0000-0000-000000000001','session_type','Other','school_year','2026/2027','gross_amount','10','payment_amount','1','payment_method','Espèces','idempotency_key',gen_random_uuid())); raise exception 'Other without description accepted'; exception when others then if sqlerrm='Other without description accepted' then raise; end if; end;
  begin perform public.create_charge_payment(jsonb_build_object('student_id','20000000-0000-0000-0000-000000000001','session_type','Adults','school_year','2026/2027','gross_amount','10','payment_amount','1','payment_method','Espèces','request_email',true,'idempotency_key',gen_random_uuid())); raise exception 'Email request without recipient accepted'; exception when others then if sqlerrm='Email request without recipient accepted' then raise; end if; end;
  if exists(select 1 from public.students where full_name='Should Roll Back') then raise exception 'Failed transaction left a student'; end if;
end $$;

-- Financial writes never alter academic identity or Premium entitlement.
do $$ declare s record; begin select * into s from public.students where id='20000000-0000-0000-0000-000000000001'; if s.session_type<>'Yearly' or s.plan_type<>'Premium' or s.premium_start_date is null then raise exception 'Academic Premium identity changed'; end if; end $$;

-- A migrated charge preserves its historical program, unknown audit fields,
-- and accepts a later balance payment without violating receipt constraints.
reset role;
insert into public.receipts(id,student_id,date,nom_prenom,session_type,service_description,
  montant_total,montant_paye,mode_paiement,statut_paiement,legacy,actor_id,
  gross_amount_snapshot,discount_amount_snapshot,net_amount_snapshot,
  paid_before_snapshot,balance_after_snapshot,email_delivery_status)
values('60000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',
  current_date-100,'Synthetic Premium','Adults','Module historique',100,40,'Espèces',
  'Acompte versé',true,null,100,0,100,0,60,'unknown');
insert into public.charges(id,student_id,session_type,service_description,gross_amount,
  discount_amount,created_by,legacy,legacy_receipt_id)
values('60000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001',
  'Adults','Module historique',100,0,null,true,'60000000-0000-0000-0000-000000000001');
update public.receipts set charge_id='60000000-0000-0000-0000-000000000002'
where id='60000000-0000-0000-0000-000000000001';

insert into public.students(id,full_name,status,deleted_at)
values('20000000-0000-0000-0000-000000000002','Archived Synthetic','Inactive',now());
insert into public.receipts(id,student_id,date,nom_prenom,session_type,montant_total,
  montant_paye,mode_paiement,legacy,actor_id,email_delivery_status)
values('60000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000002',
  current_date-100,'Archived Synthetic','Adults',50,50,'Espèces',true,null,'unknown');

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
set local role authenticated;
insert into test_results values ('legacy_balance', public.create_charge_payment(jsonb_build_object(
  'student_id','20000000-0000-0000-0000-000000000001',
  'charge_id','60000000-0000-0000-0000-000000000002','payment_amount','60',
  'payment_date',current_date,'payment_method','Espèces',
  'idempotency_key','30000000-0000-0000-0000-000000000009')));
do $$ begin
  if (select session_type from public.charges where id='60000000-0000-0000-0000-000000000002') <> 'Adults' then raise exception 'Legacy program classification was lost'; end if;
  if (select school_year from public.charges where id='60000000-0000-0000-0000-000000000002') is not null then raise exception 'Historical charge was assigned a school year'; end if;
  if (select session_type from public.receipts where id=(select (result->>'receipt_id')::uuid from test_results where name='legacy_balance')) <> 'Adults' then raise exception 'Legacy balance payment copied an invalid program'; end if;
  if (select school_year_snapshot from public.receipts where id=(select (result->>'receipt_id')::uuid from test_results where name='legacy_balance')) is not null then raise exception 'Historical charge payment invented a school year'; end if;
  if (select actor_id is not null or email_delivery_status <> 'unknown' from public.receipts where id='60000000-0000-0000-0000-000000000001') then raise exception 'Historical actor or delivery state was invented'; end if;
  if exists(select 1 from public.charges where student_id='20000000-0000-0000-0000-000000000002') then raise exception 'Archived student received a fabricated charge'; end if;
  if not exists(select 1 from public.legacy_receipt_reconciliation where id='60000000-0000-0000-0000-000000000003') then raise exception 'Archived student receipt missing from reconciliation'; end if;
  begin
    perform public.retry_receipt_email('60000000-0000-0000-0000-000000000001');
    raise exception 'Unknown historical delivery was made retryable';
  exception when others then
    if sqlerrm not like 'Historical delivery is unknown%' then raise; end if;
  end;
  if (select email_delivery_status from public.receipts where id='60000000-0000-0000-0000-000000000001') <> 'unknown' then
    raise exception 'Historical retry attempt changed unknown delivery status';
  end if;
end $$;
insert into test_results values ('unreconciled_void', public.void_financial_receipt(
  '60000000-0000-0000-0000-000000000003','Cancel unreconciled legacy receipt',
  '30000000-0000-0000-0000-000000000012'));
do $$ begin
  if not exists(select 1 from public.financial_events where receipt_id='60000000-0000-0000-0000-000000000003' and charge_id is null and event_type='payment_voided') then raise exception 'Unreconciled receipt void audit is missing'; end if;
end $$;

-- Voiding preserves the row and restores the balance exactly once.
insert into test_results values ('void', public.void_financial_receipt((select (result->>'receipt_id')::uuid from test_results where name='second'),'Synthetic correction','30000000-0000-0000-0000-000000000008'));
insert into test_results values ('void_retry', public.void_financial_receipt((select (result->>'receipt_id')::uuid from test_results where name='second'),'Synthetic correction retry','30000000-0000-0000-0000-000000000008'));
do $$ declare c record; begin select * into c from public.charge_balances where id=(select (result->>'charge_id')::uuid from test_results where name='first'); if c.balance<>1500 or c.paid_amount<>1500 then raise exception 'Void balance failed'; end if; if (select (result->>'already_voided')::boolean from test_results where name='void_retry') is not true then raise exception 'Void retry failed'; end if; if (select count(*) from public.financial_events where receipt_id=(select (result->>'receipt_id')::uuid from test_results where name='second') and event_type='payment_voided')<>1 then raise exception 'Void audit event missing/duplicated'; end if; end $$;

-- Zero-payment and otherwise payment-free charges can be cancelled with an
-- audited reason; charges with active receipts cannot be hidden underneath them.
insert into test_results values ('charge_void', public.void_financial_charge(
  (select (result->>'charge_id')::uuid from test_results where name='zero'),
  'Incorrect synthetic charge','30000000-0000-0000-0000-000000000010'));
insert into test_results values ('charge_void_retry', public.void_financial_charge(
  (select (result->>'charge_id')::uuid from test_results where name='zero'),
  'Incorrect synthetic charge retry','30000000-0000-0000-0000-000000000010'));
do $$ begin
  if (select (result->>'already_voided')::boolean from test_results where name='charge_void_retry') is not true then raise exception 'Charge void retry failed'; end if;
  if (select count(*) from public.financial_events where charge_id=(select (result->>'charge_id')::uuid from test_results where name='zero') and event_type='charge_voided') <> 1 then raise exception 'Charge void audit event missing/duplicated'; end if;
  begin perform public.void_financial_charge((select (result->>'charge_id')::uuid from test_results where name='first'),'Must void payments first','30000000-0000-0000-0000-000000000011'); raise exception 'Charge with active payment was voided'; exception when others then if sqlerrm='Charge with active payment was voided' then raise; end if; end;
end $$;

-- Email is explicit: requested delivery is pending for the mocked worker,
-- while an ordinary payment with a saved contact is skipped.
do $$ begin
  if (select email_delivery_status from public.receipts where id=(select (result->>'receipt_id')::uuid from test_results where name='first')) <> 'pending' then raise exception 'Explicit email request was not marked pending'; end if;
  if (select email_delivery_status from public.receipts where id=(select (result->>'receipt_id')::uuid from test_results where name='second')) <> 'skipped' then raise exception 'Unrequested email was not skipped'; end if;
end $$;

-- The legacy deletion entry point is gone; only void RPCs remain.
do $$ begin if to_regprocedure('public.soft_delete_receipt(uuid)') is not null then raise exception 'Legacy receipt deletion RPC still exists'; end if; end $$;

-- Direct authenticated mutation is blocked at the database boundary.
do $$ begin begin insert into public.charges(student_id,session_type,service_description,plan_type,gross_amount,created_by) values('20000000-0000-0000-0000-000000000001','Yearly','Bypass','Standard',1,'10000000-0000-0000-0000-000000000001'); raise exception 'direct write accepted'; exception when insufficient_privilege then null; end; end $$;

reset role;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
set local role authenticated;
do $$ begin if (select count(*) from public.charge_balances where student_id='20000000-0000-0000-0000-000000000001') < 1 then raise exception 'Parent cannot read linked balances'; end if; begin perform public.create_charge_payment('{}'); raise exception 'parent mutation accepted'; exception when insufficient_privilege then null; end; end $$;

reset role;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
set local role authenticated;
do $$ declare c record; begin
  if (select count(*) from public.receipts where charge_id=(select (result->>'charge_id')::uuid from test_results where name='first')) <> 2 then raise exception 'Student cannot read own receipt history'; end if;
  select * into c from public.charge_balances where id=(select (result->>'charge_id')::uuid from test_results where name='first');
  if c.paid_amount <> 1500 or c.balance <> 1500 then raise exception 'Student balance cannot see own payments: %',row_to_json(c); end if;
end $$;

reset role;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000004',true);
set local role authenticated;
do $$ begin
  begin perform public.create_charge_payment('{}'); raise exception 'Missing profile created payment'; exception when insufficient_privilege then null; end;
  begin perform public.get_finance_charge_summary(); raise exception 'Missing profile read finance summary'; exception when insufficient_privilege then null; end;
  begin perform public.get_monthly_finance_summary(date_trunc('month',current_date)::date); raise exception 'Missing profile read monthly summary'; exception when insufficient_privilege then null; end;
  begin perform * from public.get_unpaid_charges(1); raise exception 'Missing profile read unpaid charges'; exception when insufficient_privilege then null; end;
  begin perform * from public.get_finance_year_months(extract(year from current_date)::int); raise exception 'Missing profile read yearly summary'; exception when insufficient_privilege then null; end;
end $$;

rollback;
\echo 'receipt charge/payment synthetic tests passed'
