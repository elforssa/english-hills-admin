-- Local only; synthetic fixtures and all test changes roll back.
\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email,aud,role,email_confirmed_at,created_at,updated_at) values
 ('77000000-0000-0000-0000-000000000001','phase1-director@example.test','authenticated','authenticated',now(),now(),now()),
 ('77000000-0000-0000-0000-000000000002','phase1-admin@example.test','authenticated','authenticated',now(),now(),now()),
 ('77000000-0000-0000-0000-000000000003','phase1-receptionist@example.test','authenticated','authenticated',now(),now(),now()),
 ('77000000-0000-0000-0000-000000000004','phase1-invite@example.test','authenticated','authenticated',now(),now(),now());
update public.profiles set role=case right(id::text,1) when '1' then 'director' when '2' then 'admin' when '3' then 'receptionist' else 'pending' end
 where id::text like '77000000-%';
insert into public.groups(id,name,session_type,niveau) values
 ('77000000-0000-0000-0000-000000000010','Receptionist test group','Yearly','Child 1');
-- Batch H (H5): last year's trial runs in last year's group.
insert into public.groups(id,name,session_type,niveau,annee) values
 ('77000000-0000-0000-0000-000000000019','Receptionist last-year group','Yearly','Child 1','2025-2026');
insert into public.students(id,full_name,status,session_type) values
 ('77000000-0000-0000-0000-000000000020','Receptionist test student','Prospect','Yearly');
insert into public.enrollments(id,student_id,status,session_type,school_year) values
 ('77000000-0000-0000-0000-000000000030','77000000-0000-0000-0000-000000000020','Confirmed','Yearly','2026/2027');
insert into public.charges(student_id,session_type,service_description,gross_amount,legacy)
 values('77000000-0000-0000-0000-000000000020','Legacy','Phase 1 synthetic balance',100,true);
insert into public.app_config(key,value) values('phase1-secret-fixture','never-visible-to-receptionist');

create function pg_temp.denied(statement text) returns void language plpgsql as $$ begin
  begin execute statement; exception when insufficient_privilege then return; end;
  raise exception 'Expected permission denial: %',statement;
end $$;

select set_config('request.jwt.claim.sub','77000000-0000-0000-0000-000000000001',true);
set local role authenticated;
select public.change_user_role('77000000-0000-0000-0000-000000000004','receptionist');
select public.change_user_role('77000000-0000-0000-0000-000000000004','student');
reset role;
update public.profiles set role='pending' where id='77000000-0000-0000-0000-000000000004';
set local role authenticated;
select public.prepare_role_invitation('phase1-invite@example.test','receptionist');
reset role;
select set_config('request.jwt.claim.sub','77000000-0000-0000-0000-000000000002',true);
set local role authenticated;
select pg_temp.denied($q$select public.change_user_role('77000000-0000-0000-0000-000000000003','student')$q$);
select pg_temp.denied($q$select public.change_user_role('77000000-0000-0000-0000-000000000004','receptionist')$q$);
select pg_temp.denied($q$select public.change_user_role('77000000-0000-0000-0000-000000000004','student')$q$);
select pg_temp.denied($q$select public.prepare_role_invitation('phase1-invite@example.test','teacher')$q$);
select pg_temp.denied($q$select public.prepare_role_invitation('new-receptionist@example.test','receptionist')$q$);
reset role;
select set_config('request.jwt.claim.sub','77000000-0000-0000-0000-000000000004',true);
set local role authenticated;
do $$ begin
 if public.apply_pending_role() is distinct from 'receptionist' then raise exception 'Invitation activation failed'; end if;
 if public.apply_pending_role() is not null then raise exception 'Invitation replay'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','77000000-0000-0000-0000-000000000003',true);
-- A forged client metadata role must have no effect on the database decision.
select set_config('request.jwt.claims','{"sub":"77000000-0000-0000-0000-000000000003","role":"authenticated","user_metadata":{"role":"director"}}',true);
set local role authenticated;
select pg_temp.denied($q$select public.change_user_role('77000000-0000-0000-0000-000000000003','director')$q$);
select pg_temp.denied($q$update public.profiles set role='director' where id=auth.uid()$q$);
select pg_temp.denied($q$select public.prepare_role_invitation('another@example.test','student')$q$);
select pg_temp.denied($q$select public.create_charge_payment_financial('{}'::jsonb)$q$);
select pg_temp.denied($q$select public.delete_mistaken_receipt(gen_random_uuid(),'test reason',gen_random_uuid())$q$);
select pg_temp.denied($q$select public.void_financial_receipt(gen_random_uuid(),'test reason',gen_random_uuid())$q$);
select pg_temp.denied($q$select public.void_financial_charge(gen_random_uuid(),'test reason',gen_random_uuid())$q$);
select pg_temp.denied($q$select public.get_finance_charge_summary()$q$);
select pg_temp.denied($q$select public.soft_delete_student('77000000-0000-0000-0000-000000000020')$q$);
-- CRM references now reject plain TRUNCATE before authorization is reached.
-- CASCADE must not let a receptionist bypass the table/trigger protections.
select pg_temp.denied($q$truncate public.placement_tests cascade$q$);
select pg_temp.denied($q$truncate public.app_config$q$);
select pg_temp.denied($q$insert into public.enrollments(student_id,status) values('77000000-0000-0000-0000-000000000020','Submitted')$q$);
update public.profiles set full_name='Receptionist self edit',phone='0000000000' where id=auth.uid();
do $$ begin
 if not exists(select 1 from public.students where id='77000000-0000-0000-0000-000000000020') then raise exception 'Student read missing'; end if;
 if not exists(select 1 from public.charges) or exists(select 1 from public.app_config) or exists(select 1 from public.pending_roles)
   or exists(select 1 from public.financial_events) then raise exception 'Unauthorized read'; end if;
 update public.students set full_name='forged mutation' where id='77000000-0000-0000-0000-000000000020';
 if found then raise exception 'Student dossier write allowed'; end if;
 update public.enrollments set status='Rejected' where id='77000000-0000-0000-0000-000000000030';
 if found then raise exception 'Direct enrollment write allowed'; end if;
end $$;
insert into public.placement_tests(id,student_name,date_test,status) values
 ('77000000-0000-0000-0000-000000000040','Prospect without student',current_date,'Planifié');
update public.placement_tests set status='Passé' where id='77000000-0000-0000-0000-000000000040';
do $$ begin
 delete from public.placement_tests where id='77000000-0000-0000-0000-000000000040';
 if found then raise exception 'Placement deletion allowed'; end if;
end $$;
select public.save_receptionist_enrollment('77000000-0000-0000-0000-000000000020');
-- A trial needs a school year (EGC I9) and one live enrollment per programme and year (I3).
select public.save_receptionist_enrollment('77000000-0000-0000-0000-000000000020','77000000-0000-0000-0000-000000000030','77000000-0000-0000-0000-000000000010','Validated','Child 1');
select public.save_receptionist_enrollment('77000000-0000-0000-0000-000000000020',null,'77000000-0000-0000-0000-000000000019','Trial','Child 1',current_date,null,null,'2025/2026');
select pg_temp.denied($q$select public.save_receptionist_enrollment('77000000-0000-0000-0000-000000000020',null,null,'Confirmed')$q$);
select pg_temp.denied($q$select public.save_receptionist_enrollment('77000000-0000-0000-0000-000000000020','77000000-0000-0000-0000-000000000030',null,'Submitted')$q$);
do $$ begin
 begin
  perform public.save_receptionist_enrollment('77000000-0000-0000-0000-000000000020',null,null,'Trial');
  raise exception 'Trial without group accepted';
 exception when check_violation then null; end;
 if not exists(select 1 from public.enrollments where id='77000000-0000-0000-0000-000000000030' and status='Validated') then
  raise exception 'Confirmed assignment failed'; end if;
end $$;
reset role;
do $$ begin
 if exists(select 1 from public.financial_events where actor_id::text like '77000000-%') then raise exception 'Operational workflow wrote financial events'; end if;
 if not exists(select 1 from public.students where id='77000000-0000-0000-0000-000000000020' and status='Enrolled' and groupe_id='77000000-0000-0000-0000-000000000010') then raise exception 'Enrollment synchronization failed'; end if;
end $$;
-- Direct RPC regressions: nullable legacy fields must not disable compatibility.
insert into public.groups(id,name,session_type,niveau) values
 ('77000000-0000-0000-0000-000000000011','RPC Adults','Adults','Beginning 1'),
 ('77000000-0000-0000-0000-000000000012','RPC Child 2','Yearly','Child 2');
-- Batch H (H5): one Child 1 group per later school year (a placement takes its group's year).
insert into public.groups(id,name,session_type,niveau,annee) values
 ('77000000-0000-0000-0000-000000000013','RPC Child 1 2027','Yearly','Child 1','2027-2028'),
 ('77000000-0000-0000-0000-000000000014','RPC Child 1 2028','Yearly','Child 1','2028-2029'),
 ('77000000-0000-0000-0000-000000000015','RPC Child 1 2029','Yearly','Child 1','2029-2030');
-- The Child 2 group receives the 2029/2030 row's level change below.
update public.groups set annee='2029-2030' where id='77000000-0000-0000-0000-000000000012';
insert into public.students(id,full_name,status,session_type,niveau_cefr) values
 ('77000000-0000-0000-0000-000000000021','RPC known learner','Prospect','Yearly','Child 1'),
 ('77000000-0000-0000-0000-000000000022','RPC unknown level','Prospect','Yearly',null),
 ('77000000-0000-0000-0000-000000000024','RPC other learner','Prospect','Yearly','Child 1'),
 ('77000000-0000-0000-0000-000000000025','RPC secondary session','Prospect','Yearly','Child 1');
-- Legacy rows that predate the EGC programme/year check (NOT VALID): seeded as
-- Production holds them, before the check existed.
create temp table egc_i9_def as select pg_get_constraintdef(oid) def, convalidated from pg_constraint
  where conrelid = 'public.enrollments'::regclass and conname = 'enrollments_confirmed_has_programme';
alter table public.enrollments drop constraint enrollments_confirmed_has_programme;
-- ... and before Batch H's group year check (H5), which would give row 34 its group's year.
alter table public.enrollments disable trigger enrollment_group_year_guard;
insert into public.enrollments(id,student_id,status,session_type,level,group_id) values
 ('77000000-0000-0000-0000-000000000031','77000000-0000-0000-0000-000000000021','Submitted','Yearly','Child 1',null),
 ('77000000-0000-0000-0000-000000000032','77000000-0000-0000-0000-000000000021','Under Review',null,null,null),
 ('77000000-0000-0000-0000-000000000033','77000000-0000-0000-0000-000000000021','Confirmed',null,null,null),
 ('77000000-0000-0000-0000-000000000034','77000000-0000-0000-0000-000000000021','Validated','Yearly','Child 1','77000000-0000-0000-0000-000000000010'),
 ('77000000-0000-0000-0000-000000000035','77000000-0000-0000-0000-000000000025','Confirmed','Adults','Beginning 1',null);
update public.enrollments set school_year='2026/2027' where id='77000000-0000-0000-0000-000000000035';
alter table public.enrollments enable trigger enrollment_group_year_guard;
-- A Confirmed legacy row that can still exist after the check: programme and year
-- set, level unknown.
insert into public.enrollments(id,student_id,status,session_type,school_year,level,group_id) values
 ('77000000-0000-0000-0000-000000000036','77000000-0000-0000-0000-000000000021','Confirmed','Yearly','2029/2030',null,null);
alter table public.enrollments add constraint enrollments_confirmed_has_programme
  check (coalesce(status, '') not in ('Confirmed','Validated','Trial') or (session_type is not null and school_year is not null)) not valid;
-- The re-added check has exactly the migration's expression (this fixture re-adds
-- it NOT VALID, as M1 does; M2 may have validated the original).
do $$ begin
  if (select count(*) from egc_i9_def) <> 1 or (select regexp_replace(def, ' NOT VALID$', '') from egc_i9_def)
      is distinct from (select regexp_replace(pg_get_constraintdef(oid), ' NOT VALID$', '') from pg_constraint
      where conrelid = 'public.enrollments'::regclass and conname = 'enrollments_confirmed_has_programme') then
    raise exception 'I9 check re-added with another definition'; end if;
end $$;
create function pg_temp.incompatible(statement text) returns void language plpgsql as $$ begin
  begin execute statement; exception when check_violation then return; end;
  raise exception 'Expected compatibility/identity rejection: %',statement;
end $$;
set local role authenticated;
do $$ declare
  learner uuid := '77000000-0000-0000-0000-000000000021';
  compatible uuid := '77000000-0000-0000-0000-000000000010';
  adults uuid := '77000000-0000-0000-0000-000000000011';
  other_level uuid := '77000000-0000-0000-0000-000000000012';
  enrollment_id uuid; desired text; result uuid; before_rows jsonb; year integer := 2026; in_year uuid;
begin
  select jsonb_agg(to_jsonb(e) order by id) into before_rows from public.enrollments e where student_id=learner;
  -- New, normal, NULL-session/level, confirmed legacy and validated records.
  foreach enrollment_id in array array[null::uuid,
    '77000000-0000-0000-0000-000000000031'::uuid,
    '77000000-0000-0000-0000-000000000032'::uuid,
    '77000000-0000-0000-0000-000000000033'::uuid,
    '77000000-0000-0000-0000-000000000034'::uuid] loop
    desired := case when right(enrollment_id::text,2) in ('33','34') then 'Validated' else 'Trial' end;
    perform pg_temp.incompatible(format('select public.save_receptionist_enrollment(%L,%L,%L,%L,null)',learner,enrollment_id,adults,desired));
    perform pg_temp.incompatible(format('select public.save_receptionist_enrollment(%L,%L,%L,%L,null)',learner,enrollment_id,other_level,desired));
    perform pg_temp.incompatible(format('select public.save_receptionist_enrollment(%L,%L,%L,%L,%L)',learner,enrollment_id,compatible,desired,'Child 2'));
    if enrollment_id is not null then
      perform pg_temp.incompatible(format('select public.save_receptionist_enrollment(%L,%L,%L,%L,null)',
        '77000000-0000-0000-0000-000000000024',enrollment_id,compatible,desired));
    end if;
    if desired='Trial' then
      perform pg_temp.denied(format('select public.save_receptionist_enrollment(%L,%L,%L,%L,null)',learner,enrollment_id,compatible,'Confirmed'));
      perform pg_temp.denied(format('select public.save_receptionist_enrollment(%L,%L,%L,%L,null)',learner,enrollment_id,compatible,'Validated'));
    end if;
  end loop;
  if before_rows is distinct from (select jsonb_agg(to_jsonb(e) order by id) from public.enrollments e where student_id=learner) then
    raise exception 'Rejected RPC changed enrollments'; end if;
  -- EGC I9: a Validated legacy row without a school year cannot be assigned until the
  -- clean-up gives it one (C1b) or ends it (C2); the refusal leaves it unchanged.
  -- Batch H (H5): a Confirmed legacy row placed in a group takes the group's year
  -- (asserted, then undone).
  begin
    perform public.save_receptionist_enrollment(learner,'77000000-0000-0000-0000-000000000033',compatible,'Validated',null);
    if not exists(select 1 from public.enrollments where id='77000000-0000-0000-0000-000000000033'
        and status='Validated' and school_year='2026/2027' and group_id=compatible) then
      raise exception 'H5: a legacy row did not take its group''s year'; end if;
    raise exception using errcode = 'P0099', message = 'undo';
  exception when sqlstate 'P0099' then null;
  end;
  perform pg_temp.incompatible(format('select public.save_receptionist_enrollment(%L,%L,%L,%L,null)',learner,
    '77000000-0000-0000-0000-000000000034',compatible,'Validated'));
  if before_rows is distinct from (select jsonb_agg(to_jsonb(e) order by id) from public.enrollments e where student_id=learner) then
    raise exception 'Refused legacy assignment changed enrollments'; end if;
  -- Successful NULL-level calls resolve and persist known session/level values.
  foreach enrollment_id in array array[null::uuid,
    '77000000-0000-0000-0000-000000000031'::uuid,
    '77000000-0000-0000-0000-000000000032'::uuid,
    '77000000-0000-0000-0000-000000000036'::uuid] loop
    desired := case when right(enrollment_id::text,2) in ('33','34','36') then 'Validated' else 'Trial' end;
    -- Each live row needs its own school year (EGC I3, I9); legacy rows receive it,
    -- in a group of that year (H5).
    in_year := case year when 2026 then compatible else ('77000000-0000-0000-0000-0000000000' || (year - 2014))::uuid end;
    result := public.save_receptionist_enrollment(learner,enrollment_id,in_year,desired,null,current_date,null,null,
      year||'/'||(year+1));
    year := year + 1;
    if not exists(select 1 from public.enrollments where id=result and student_id=learner
      and session_type='Yearly' and level='Child 1' and group_id=in_year and status=desired) then
      raise exception 'Compatible normal/legacy assignment lost resolved fields'; end if;
  end loop;
  result := public.save_receptionist_enrollment('77000000-0000-0000-0000-000000000022',null,compatible,'Trial',null,current_date,null,null,'2026/2027');
  if not exists(select 1 from public.enrollments where id=result and level='Child 1' and session_type='Yearly')
    or not exists(select 1 from public.students where id='77000000-0000-0000-0000-000000000022'
      and niveau_cefr='Child 1' and groupe_id=compatible and status='Trial') then
    raise exception 'Unknown level did not resolve from compatible group and synchronize'; end if;
  perform pg_temp.incompatible(format('select public.save_receptionist_enrollment(%L,null,%L,%L,null)',
    learner,'77000000-0000-0000-0000-000000000099','Trial'));
  -- Enrollment session/level take precedence over a different dossier session.
  result := public.save_receptionist_enrollment('77000000-0000-0000-0000-000000000025',
    '77000000-0000-0000-0000-000000000035',adults,'Validated',null,current_date,null,null,'2026/2027');
  if not exists(select 1 from public.enrollments where id=result and session_type='Adults' and level='Beginning 1') then
    raise exception 'Authoritative secondary enrollment ignored'; end if;
  -- Explicit compatible level changes remain part of the assignment workflow.
  result := public.save_receptionist_enrollment(learner,'77000000-0000-0000-0000-000000000036',other_level,'Validated','Child 2');
  if not exists(select 1 from public.enrollments where id=result and level='Child 2' and group_id=other_level) then
    raise exception 'Explicit compatible level change rejected'; end if;
end $$;
reset role;
do $$ begin
 if exists(select 1 from public.financial_events where actor_id::text like '77000000-%') then
   raise exception 'Compatibility RPC wrote financial events'; end if;
end $$;
\echo PASS direct RPC compatibility, NULL/legacy resolution, identity and confirmation boundaries

-- Exercise the unchanged last-director guard with an isolated counter fixture.
-- SAVEPOINT restores the counter without changing any pre-existing director.
savepoint last_director_fixture;
update role_security.director_guard set director_count=1 where singleton;
select set_config('request.jwt.claim.sub','77000000-0000-0000-0000-000000000001',true);
set local role authenticated;
do $$ begin
 begin
  perform public.change_user_role('77000000-0000-0000-0000-000000000001','receptionist');
  raise exception 'Last director removal accepted';
 exception when check_violation then null; end;
end $$;
reset role;
rollback to savepoint last_director_fixture;
rollback;
\echo PASS receptionist role, invitation, operational RLS/RPC, self-service, restricted finance and TRUNCATE guards
