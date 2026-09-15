\set ON_ERROR_STOP on

do $$ begin
  if exists(select 1 from supabase_migrations.schema_migrations where version='055') then
    raise exception 'Expected a database migrated only through 054';
  end if;
  if to_regclass('public.charges') is not null then
    raise exception 'charges already exists; refusing non-pre055 fixture setup';
  end if;
end $$;

insert into auth.users(id,email,aud,role,created_at,updated_at)
values ('91000000-0000-0000-0000-000000000001','migration-director@example.test',
  'authenticated','authenticated',now(),now());
update public.profiles set role='director'
where id='91000000-0000-0000-0000-000000000001';

insert into public.students(id,full_name,status,deleted_at)
values
  ('92000000-0000-0000-0000-000000000001','Migration Active','Prospect',null),
  ('92000000-0000-0000-0000-000000000002','Migration Archived','Inactive','2025-01-15 09:00:00+00');

insert into public.receipts(
  id,receipt_number,student_id,date,nom_prenom,categorie,niveau,type_cours,
  plan_type,montant_total,montant_paye,mode_paiement,statut_paiement,
  session_type,deleted_at
)
values
  ('93000000-0000-0000-0000-000000000001','LEGACY-KNOWN-001',
   '92000000-0000-0000-0000-000000000001','2025-02-03','Migration Active',
   'Adultes','Beginning 1','Standard','Standard',100.25,40.10,'Espèces','Acompte versé','Adults',null),
  ('93000000-0000-0000-0000-000000000002','LEGACY-UNKNOWN-002',
   '92000000-0000-0000-0000-000000000001','2025-03-04','Migration Active',
   'Particulier','A1','Standard','Standard',80,80,'Virement','Soldé',null,null),
  ('93000000-0000-0000-0000-000000000003','LEGACY-ARCHIVED-STUDENT-003',
   '92000000-0000-0000-0000-000000000002','2025-04-05','Migration Archived',
   'Adultes','Beginning 1','Standard','Standard',50,50,'Espèces','Soldé','Adults',null),
  ('93000000-0000-0000-0000-000000000004','LEGACY-SOFT-DELETED-004',
   '92000000-0000-0000-0000-000000000001','2025-05-06','Migration Active',
   'Adultes','Beginning 1','Standard','Standard',75,25,'Chèque','Acompte versé','Adults',
   '2025-06-01 10:00:00+00');
