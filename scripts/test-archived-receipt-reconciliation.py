#!/usr/bin/env python3
"""Exercise migration 056 with synthetic records; fixed local DB, all rolled back."""
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parent.parent
migration = (root / 'supabase/migrations/056_archived_student_receipt_reconciliation.sql').read_text()
assert migration.count('\nbegin;') == migration.count('\ncommit;') == 1
body = migration.replace('\nbegin;', '').replace('\ncommit;', '')
setup = r"""
\set ON_ERROR_STOP on
begin;
insert into public.students(id,full_name,status,deleted_at)
values ('96000000-0000-0000-0000-000000000001','Synthetic archived reconciliation','Inactive','2025-01-01');
insert into public.receipts(id,receipt_number,student_id,date,nom_prenom,
  montant_total,montant_paye,remise,mode_paiement,statut_paiement,session_type,
  deleted_at,email_delivery_status)
values
 ('97000000-0000-0000-0000-000000000001','SYNTHETIC-ARCHIVE-1','96000000-0000-0000-0000-000000000001',
 '2025-01-01','Synthetic archived reconciliation',120,120,0,'Espèces','Soldé','Summer Camp',null,'unknown'),
 ('97000000-0000-0000-0000-000000000002','SYNTHETIC-ARCHIVE-2','96000000-0000-0000-0000-000000000001',
 '2025-01-02','Synthetic archived reconciliation',250,30,10,'Espèces','Acompte versé','Adults','2025-01-03','unknown'),
 ('97000000-0000-0000-0000-000000000003','SYNTHETIC-ARCHIVE-3','96000000-0000-0000-0000-000000000001',
 '2025-01-03','Synthetic archived reconciliation',80,20,0,'Espèces','Acompte versé','Adults',null,'unknown');
-- Model a director-voided legacy receipt with no charge yet.
insert into auth.users(id,email,aud,role,created_at,updated_at)
values ('98000000-0000-0000-0000-000000000001','reconcile@example.test','authenticated','authenticated',now(),now());
update public.receipts set voided_at='2025-02-01',voided_by='98000000-0000-0000-0000-000000000001',
  void_reason='Synthetic audited cancellation' where id='97000000-0000-0000-0000-000000000003';
create temp table original_students as select to_jsonb(s) value from public.students s;
create temp table original_receipts as select id, to_jsonb(r) - array[
 'charge_id','service_description','gross_amount_snapshot','discount_amount_snapshot','net_amount_snapshot',
 'paid_before_snapshot','balance_after_snapshot','legacy','updated_at'] value from public.receipts r;
create temp table original_total as select sum(montant_paye) amount from public.receipts where deleted_at is null and voided_at is null;
"""
checks = r"""
do $$ begin
 if (select count(*) from public.charges where student_id='96000000-0000-0000-0000-000000000001') <> 3 then
   raise exception 'Expected exactly three separate legacy charges'; end if;
 if exists(select 1 from public.receipts where student_id='96000000-0000-0000-0000-000000000001'
   and (charge_id is null or not legacy or email_delivery_status <> 'unknown' or actor_id is not null)) then
   raise exception 'Link, legacy, delivery, or actor preservation failed'; end if;
 if exists(select 1 from public.charges c join public.receipts r on r.charge_id=c.id
   where c.student_id='96000000-0000-0000-0000-000000000001'
   and (c.session_type <> r.session_type or c.created_by is not null or c.voided_by is not null
     or c.voided_at is distinct from coalesce(r.deleted_at,r.voided_at))) then
   raise exception 'Charge classification or historical cancellation incorrect'; end if;
 if (select discount_amount from public.charges where legacy_receipt_id='97000000-0000-0000-0000-000000000002') <> 25 then
   raise exception 'Discount not preserved'; end if;
 if (select balance from public.charge_balances where legacy_receipt_id='97000000-0000-0000-0000-000000000001') <> 0 then
   raise exception 'Paid receipt did not settle charge'; end if;
 if exists(select value from original_students except select to_jsonb(s) from public.students s) then
   raise exception 'Student changed'; end if;
 if exists(select id,value from original_receipts except select id,to_jsonb(r) - array[
   'charge_id','service_description','gross_amount_snapshot','discount_amount_snapshot','net_amount_snapshot',
   'paid_before_snapshot','balance_after_snapshot','legacy','updated_at'] from public.receipts r) then
   raise exception 'Original receipt fields changed'; end if;
 if (select amount from original_total) is distinct from
   (select sum(montant_paye) from public.receipts where deleted_at is null and voided_at is null) then
   raise exception 'Collected total changed'; end if;
end $$;
"""
# Replay twice to verify safe re-entry without duplicate charges or changed snapshots.
result = subprocess.run(['psql','postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  '-X','-v','ON_ERROR_STOP=1'], input=setup+body+checks+body+checks+'\nrollback;\n', text=True)
raise SystemExit(result.returncode)
