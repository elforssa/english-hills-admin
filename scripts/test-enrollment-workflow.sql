-- Local Supabase only. Synthetic records; no persistent data changes.
\set ON_ERROR_STOP on
begin;
alter table public.receipts disable trigger on_receipt_created;
insert into auth.users(id,email,aud,role,created_at,updated_at) values
 ('74000000-0000-0000-0000-000000000001','workflow-staff@example.test','authenticated','authenticated',now(),now()),
 ('74000000-0000-0000-0000-000000000002','workflow-parent@example.test','authenticated','authenticated',now(),now());
update public.profiles set role='admin' where id='74000000-0000-0000-0000-000000000001';
update public.profiles set role='parent' where id='74000000-0000-0000-0000-000000000002';
insert into public.groups(id,name,session_type,niveau) values
 ('74000000-0000-0000-0000-000000000011','Workflow A','Yearly','Child 1'),
 ('74000000-0000-0000-0000-000000000012','Workflow B','Yearly','Child 2'),
 ('74000000-0000-0000-0000-000000000013','Workflow Adult','Adults','Beginning 1');
insert into public.students(id,full_name,status,session_type) values
 ('74000000-0000-0000-0000-000000000021','Workflow student','Enrolled','Yearly'),
 ('74000000-0000-0000-0000-000000000022','Workflow legacy payer','Prospect','Yearly');
insert into public.charges(id,student_id,session_type,service_description,gross_amount,legacy)
values ('74000000-0000-0000-0000-000000000041','74000000-0000-0000-0000-000000000022','Legacy','Synthetic historic balance',1000,true);
select set_config('request.jwt.claim.sub','74000000-0000-0000-0000-000000000001',true);
set local role authenticated;
insert into public.enrollments(id,student_id,status,session_type,school_year) values
 ('74000000-0000-0000-0000-000000000031','74000000-0000-0000-0000-000000000021','Confirmed','Yearly','2026/2027');
-- Student edit / primary group assignment.
update public.students set groupe_id='74000000-0000-0000-0000-000000000011',niveau_cefr='Child 1'
where id='74000000-0000-0000-0000-000000000021';
do $$ begin
 if not exists(select 1 from public.enrollments where id='74000000-0000-0000-0000-000000000031'
   and status='Validated' and group_id='74000000-0000-0000-0000-000000000011') then raise exception 'Student assignment did not sync enrollment'; end if;
end $$;
-- Moving a student updates the same enrollment without changing its identity.
update public.students set groupe_id='74000000-0000-0000-0000-000000000012',niveau_cefr='Child 2'
where id='74000000-0000-0000-0000-000000000021';
do $$ begin
 if not exists(select 1 from public.enrollments where id='74000000-0000-0000-0000-000000000031'
   and status='Validated' and level='Child 2' and group_id='74000000-0000-0000-0000-000000000012') then raise exception 'Move did not sync enrollment'; end if;
end $$;
-- Invalid changes fail atomically.
do $$ begin
 begin
  update public.students set groupe_id='74000000-0000-0000-0000-000000000013' where id='74000000-0000-0000-0000-000000000021';
  raise exception 'Mismatched group accepted';
 exception when check_violation then null; end;
end $$;
-- Add a second session. It must be visible in rosters independently of primary group.
insert into public.enrollments(id,student_id,status,session_type,school_year,group_id,level) values
 ('74000000-0000-0000-0000-000000000032','74000000-0000-0000-0000-000000000021','Validated','Adults','2026/2027','74000000-0000-0000-0000-000000000013','Beginning 1');
select public.remove_student_group('74000000-0000-0000-0000-000000000021','74000000-0000-0000-0000-000000000012');
do $$ begin
 if not exists(select 1 from public.enrollments where id='74000000-0000-0000-0000-000000000031' and status='Confirmed' and group_id is null)
   or not exists(select 1 from public.enrollments where id='74000000-0000-0000-0000-000000000032' and status='Validated' and group_id='74000000-0000-0000-0000-000000000013') then
   raise exception 'Secondary membership removal changed the wrong session'; end if;
end $$;
select public.remove_student_group('74000000-0000-0000-0000-000000000021','74000000-0000-0000-0000-000000000013');
do $$ begin
 if not exists(select 1 from public.students where id='74000000-0000-0000-0000-000000000021' and groupe_id is null and status='Enrolled') then
   raise exception 'Removing final group lost registration or left membership'; end if;
 begin
   insert into public.attendance(student_id,group_id,session_date,status) values
   ('74000000-0000-0000-0000-000000000021','74000000-0000-0000-0000-000000000013',current_date,'Présent');
   raise exception 'Removed student still has attendance membership';
 exception when check_violation then null; end;
end $$;
-- New payment on a legacy balance enrolls the student without rewriting history.
select public.create_charge_payment(jsonb_build_object('student_id','74000000-0000-0000-0000-000000000022',
 'charge_id','74000000-0000-0000-0000-000000000041','payment_amount',100,'payment_method','Espèces',
 'idempotency_key','74000000-0000-0000-0000-000000000051'));
do $$ begin
 if (select status from public.students where id='74000000-0000-0000-0000-000000000022') <> 'Enrolled'
 or (select gross_amount from public.charges where id='74000000-0000-0000-0000-000000000041') <> 1000
 or (select balance from public.charge_balances where id='74000000-0000-0000-0000-000000000041') <> 900 then
  raise exception 'Legacy receipt enrollment or financial balance incorrect'; end if;
end $$;
-- Restore an active membership before testing authorization.
update public.enrollments set group_id='74000000-0000-0000-0000-000000000013'
where id='74000000-0000-0000-0000-000000000032';
-- A parent cannot mutate another student's academic state via the new RPC.
reset role;
select set_config('request.jwt.claim.sub','74000000-0000-0000-0000-000000000002',true);
set local role authenticated;
select public.remove_student_group('74000000-0000-0000-0000-000000000021','74000000-0000-0000-0000-000000000013');
reset role;
do $$ begin
 if not exists(select 1 from public.enrollments where id='74000000-0000-0000-0000-000000000032'
 and group_id='74000000-0000-0000-0000-000000000013' and status='Validated') then raise exception 'Unauthorized mutation'; end if;
end $$;
rollback;
\echo enrollment workflow synchronization tests passed
