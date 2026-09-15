\set ON_ERROR_STOP on

do $$
declare known_charge uuid;
begin
  if (select count(*) from public.receipts where id in (
    '93000000-0000-0000-0000-000000000001','93000000-0000-0000-0000-000000000002',
    '93000000-0000-0000-0000-000000000003','93000000-0000-0000-0000-000000000004'
  )) <> 4 then raise exception 'Historical receipt IDs were not preserved'; end if;
  if not exists(select 1 from public.receipts where id='93000000-0000-0000-0000-000000000001'
    and receipt_number='LEGACY-KNOWN-001' and date='2025-02-03'
    and montant_total=100.25 and montant_paye=40.10) then
    raise exception 'Historical number/date/amount values changed';
  end if;
  if not exists(select 1 from public.charges where legacy_receipt_id='93000000-0000-0000-0000-000000000001'
    and session_type='Adults' and created_by is null) then
    raise exception 'Known historical session or unknown actor was not preserved';
  end if;
  if not exists(select 1 from public.charges where legacy_receipt_id='93000000-0000-0000-0000-000000000002'
    and session_type='Legacy') then raise exception 'Unknown historical session was not explicit'; end if;
  if exists(select 1 from public.charges where legacy_receipt_id='93000000-0000-0000-0000-000000000003') then
    raise exception 'Archived student received a fabricated charge';
  end if;
  if not exists(select 1 from public.legacy_receipt_reconciliation where id='93000000-0000-0000-0000-000000000003') then
    raise exception 'Archived-student receipt is absent from reconciliation';
  end if;
  if not exists(select 1 from public.charges where legacy_receipt_id='93000000-0000-0000-0000-000000000004'
    and voided_at='2025-06-01 10:00:00+00') then raise exception 'Soft-deleted receipt history was lost'; end if;
  if exists(select 1 from public.receipts where id in (
    '93000000-0000-0000-0000-000000000001','93000000-0000-0000-0000-000000000002',
    '93000000-0000-0000-0000-000000000003','93000000-0000-0000-0000-000000000004'
  ) and (actor_id is not null or email_delivery_status <> 'unknown')) then
    raise exception 'Migration invented actor or delivery history';
  end if;
  select charge_id into known_charge from public.receipts where id='93000000-0000-0000-0000-000000000001';
  if not exists(select 1 from public.charge_balances where id=known_charge
    and net_amount=100.25 and paid_amount=40.10 and balance=60.15) then
    raise exception 'Migrated balance is incorrect';
  end if;
end $$;

select set_config('request.jwt.claim.sub','91000000-0000-0000-0000-000000000001',false);
set role authenticated;
select public.create_charge_payment(jsonb_build_object(
  'student_id','92000000-0000-0000-0000-000000000001',
  'charge_id',(select charge_id from public.receipts where id='93000000-0000-0000-0000-000000000001'),
  'payment_amount','60.15','payment_date','2025-07-07','payment_method','Espèces',
  'idempotency_key','94000000-0000-0000-0000-000000000001'
));
reset role;

do $$ declare known_charge uuid; begin
  select charge_id into known_charge from public.receipts where id='93000000-0000-0000-0000-000000000001';
  if not exists(select 1 from public.charge_balances where id=known_charge
    and paid_amount=100.25 and balance=0 and settlement_status='Soldé') then
    raise exception 'Subsequent installment did not settle the migrated charge';
  end if;
  if (select count(*) from public.receipts where charge_id=known_charge and deleted_at is null) <> 2 then
    raise exception 'Subsequent installment did not create exactly one receipt';
  end if;
  if not exists(select 1 from public.receipts where charge_id=known_charge and legacy=false
    and session_type='Adults' and montant_paye=60.15 and date='2025-07-07') then
    raise exception 'Subsequent installment snapshot is incorrect';
  end if;
end $$;

\echo 'receipt migration 054-to-055 rehearsal passed'
