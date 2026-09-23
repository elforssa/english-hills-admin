-- Local Supabase only. Synthetic fixtures and all changes roll back.
\set ON_ERROR_STOP on
begin;
alter table public.receipts disable trigger on_receipt_created;
insert into auth.users(id,email,aud,role,created_at,updated_at) values
 ('76000000-0000-0000-0000-000000000001','delete-director@example.test','authenticated','authenticated',now(),now()),
 ('76000000-0000-0000-0000-000000000002','delete-admin@example.test','authenticated','authenticated',now(),now());
update public.profiles set role='director' where id='76000000-0000-0000-0000-000000000001';
update public.profiles set role='admin' where id='76000000-0000-0000-0000-000000000002';
insert into public.students(id,full_name,status) values
 ('76000000-0000-0000-0000-000000000003','Synthetic deletion regression','Prospect');
select set_config('request.jwt.claim.sub','76000000-0000-0000-0000-000000000001',true);
set local role authenticated;
create temp table deletion_cases(name text, result jsonb);
insert into deletion_cases
select label, public.create_charge_payment(jsonb_build_object(
  'student_id','76000000-0000-0000-0000-000000000003','session_type','Other',
  'service_detail','Synthetic deletion test','school_year','2026/2027',
  'gross_amount',100,'payment_amount',40,'payment_date',current_date,
  'payment_method','Espèces','idempotency_key',gen_random_uuid()))
from unnest(array['active','cancelled','siblings','valid']) label;
insert into deletion_cases select 'second_installment',public.create_charge_payment(jsonb_build_object(
  'student_id','76000000-0000-0000-0000-000000000003',
  'charge_id',result->>'charge_id','payment_amount',20,'payment_date',current_date,
  'payment_method','Espèces','idempotency_key',gen_random_uuid())) from deletion_cases where name='siblings';

-- Authorization is enforced by the database, not merely by hiding a button.
select set_config('request.jwt.claim.sub','76000000-0000-0000-0000-000000000002',true);
do $$ begin
  begin
    perform public.delete_mistaken_receipt((select (result->>'receipt_id')::uuid from deletion_cases where name='active'),'mistake',gen_random_uuid());
    raise exception 'Admin unexpectedly deleted receipt';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','76000000-0000-0000-0000-000000000001',true);
do $$
declare
  r uuid := (select (result->>'receipt_id')::uuid from deletion_cases where name='active');
  baseline jsonb := public.get_finance_charge_summary();
  after_total jsonb;
  event_count bigint;
begin
  begin
    perform public.delete_mistaken_receipt(r,' ',gen_random_uuid());
    raise exception 'Blank reason unexpectedly accepted';
  exception when others then if sqlerrm <> 'Indiquez le motif de suppression.' then raise; end if; end;
  perform public.delete_mistaken_receipt(r,'Synthetic mistaken entry',gen_random_uuid());
  after_total := public.get_finance_charge_summary();
  assert (baseline->>'total_encaisse')::numeric - (after_total->>'total_encaisse')::numeric = 40, 'Collected total must decrease by payment only';
  assert (baseline->>'total_restant')::numeric - (after_total->>'total_restant')::numeric = 60, 'Outstanding total must decrease by remaining balance';
  assert not exists(select 1 from public.receipts where id=r), 'Deleted receipt must be hidden by RLS';
  select count(*) into event_count from public.financial_events where receipt_id=r;
  perform public.delete_mistaken_receipt(r,'Synthetic mistaken entry',gen_random_uuid());
  assert (select count(*) from public.financial_events where receipt_id=r)=event_count, 'Retry must not duplicate events';
  assert public.get_finance_charge_summary()=after_total, 'Retry must not change totals';
end $$;

-- Reproduce the reported issue: a voided receipt leaves 100 due. Repair removes
-- that debt without subtracting its payment a second time.
do $$
declare
  r uuid := (select (result->>'receipt_id')::uuid from deletion_cases where name='cancelled');
  c uuid := (select (result->>'charge_id')::uuid from deletion_cases where name='cancelled');
  baseline jsonb;
  after_total jsonb;
begin
  perform public.void_financial_receipt(r,'Original cancellation',gen_random_uuid());
  assert (select balance from public.charge_balances where id=c)=100;
  baseline := public.get_finance_charge_summary();
  perform public.delete_mistaken_receipt(r,'Mistaken old entry',gen_random_uuid());
  after_total := public.get_finance_charge_summary();
  assert baseline->>'total_encaisse'=after_total->>'total_encaisse', 'Already cancelled payment must not be deducted twice';
  assert (baseline->>'total_restant')::numeric - (after_total->>'total_restant')::numeric=100, 'Stale debt must be removed';
  assert not exists(select 1 from public.get_unpaid_charges(10000) where id=c), 'Cancelled charge must leave collection list';
  assert exists(select 1 from public.financial_events where receipt_id=r and metadata->>'action'='delete_mistaken_receipt' and metadata->>'removed_from_collected'='0');
end $$;

-- Other installments must prevent the entire operation, without partial writes.
do $$
declare r uuid := (select (result->>'receipt_id')::uuid from deletion_cases where name='siblings');
begin
  begin
    perform public.delete_mistaken_receipt(r,'Mistaken entry',gen_random_uuid());
    raise exception 'Sibling payment unexpectedly allowed deletion';
  exception when others then if sqlerrm not like 'D’autres paiements actifs%' then raise; end if; end;
  assert exists(select 1 from public.receipts where id=r and voided_at is null);
  assert (select paid_amount=60 and balance=40 and voided_at is null from public.charge_balances where id=(select (result->>'charge_id')::uuid from deletion_cases where name='siblings'));
  assert (select paid_amount=40 and balance=60 and voided_at is null from public.charge_balances where id=(select (result->>'charge_id')::uuid from deletion_cases where name='valid')), 'Unrelated valid payment must remain untouched';
end $$;
reset role;
-- Originals, timestamps, and author remain available to audit even though RLS
-- hides deleted receipts from normal application reads.
do $$ begin
  assert (select count(*)=2 from public.receipts where student_id='76000000-0000-0000-0000-000000000003' and deleted_at is not null and montant_paye=40 and voided_by='76000000-0000-0000-0000-000000000001');
end $$;
rollback;
\echo 'mistaken receipt deletion regression tests passed'
