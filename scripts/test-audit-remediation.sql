-- Run only against the local Supabase database. All synthetic rows roll back.
\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email) values
  ('00000000-0000-4000-8000-00000000a001','audit-admin@example.invalid'),
  ('00000000-0000-4000-8000-00000000a002','audit-teacher@example.invalid'),
  ('00000000-0000-4000-8000-00000000a003','audit-parent@example.invalid'),
  ('00000000-0000-4000-8000-00000000a004','audit-pending@example.invalid');
update public.profiles set role='admin',full_name='Synthetic Admin' where id='00000000-0000-4000-8000-00000000a001';
update public.profiles set role='teacher',full_name='Synthetic Teacher' where id='00000000-0000-4000-8000-00000000a002';
update public.profiles set role='parent',full_name='Synthetic Parent' where id='00000000-0000-4000-8000-00000000a003';
insert into public.teachers(id,full_name,email) values
  ('00000000-0000-4000-8000-00000000b001','Synthetic Teacher','audit-teacher@example.invalid');
insert into public.groups(id,name,niveau,teacher_id) values
  ('00000000-0000-4000-8000-00000000c001','Audit Group','A1','00000000-0000-4000-8000-00000000b001'),
  ('00000000-0000-4000-8000-00000000c002','Unrelated Group','A1',null);
insert into public.students(id,full_name,groupe_id,email,parent_email,status) values
  ('00000000-0000-4000-8000-00000000d001','Synthetic Child','00000000-0000-4000-8000-00000000c001','audit-child@example.invalid','audit-parent@example.invalid','Enrolled'),
  ('00000000-0000-4000-8000-00000000d002','Unrelated Child','00000000-0000-4000-8000-00000000c002','unrelated@example.invalid',null,'Enrolled');
insert into public.students(id,full_name,email,status) values
  ('00000000-0000-4000-8000-00000000d003','Trial Child','trial@example.invalid','Prospect');
insert into public.enrollments(student_id,group_id,status) values
  ('00000000-0000-4000-8000-00000000d003','00000000-0000-4000-8000-00000000c001','Trial');
-- Keep the fixture enrollment-only, as older rows can have no primary group.
update public.students set groupe_id=null where id='00000000-0000-4000-8000-00000000d003';
update public.profiles set linked_student_id='00000000-0000-4000-8000-00000000d001'
where id='00000000-0000-4000-8000-00000000a003';
insert into public.authorized_adults(id,student_id,full_name,telephone,relation) values
  ('00000000-0000-4000-8000-00000000e001','00000000-0000-4000-8000-00000000d001','Synthetic Adult','0000000000','Parent');

do $$ begin
  if has_function_privilege('authenticated','public.check_rate_limit(text,integer,integer)','EXECUTE') then
    raise exception 'Caller-controlled rate limit still executable'; end if;
  if has_function_privilege('anon','public.create_public_registration(jsonb,uuid,text)','EXECUTE') then
    raise exception 'Public registration RPC exposed to anon'; end if;
  if has_function_privilege('anon','public.check_anon_rate_limit(text,text,integer,integer)','EXECUTE')
    or has_function_privilege('authenticated','public.check_anon_rate_limit(text,text,integer,integer)','EXECUTE') then
    raise exception 'Caller-configurable public limiter is exposed'; end if;
  if has_table_privilege('authenticated','public.payroll','INSERT')
    or has_column_privilege('authenticated','public.payroll','salaire_net','UPDATE') then
    raise exception 'Direct payroll amount writes remain allowed'; end if;
  if not has_column_privilege('authenticated','public.payroll','statut','UPDATE') then
    raise exception 'Payroll status workflow lost update grant'; end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000a004',true);
do $$ begin
  if public.can_message_recipient('audit-admin@example.invalid') then raise exception 'Pending user may message'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000a003',true);
do $$ begin
  if not public.can_message_recipient('audit-teacher@example.invalid') then raise exception 'Parent cannot contact own teacher'; end if;
  if public.can_message_recipient('unrelated@example.invalid') then raise exception 'Parent can contact unrelated child'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000a002',true);
do $$ begin
  if (select linked_teacher_id is not null from public.profiles where id=auth.uid()) then
    raise exception 'Teacher fixture unexpectedly has a linked teacher'; end if;
  if public.get_my_teacher_id() <> '00000000-0000-4000-8000-00000000b001'::uuid then
    raise exception 'Email-derived teacher identity failed'; end if;
  if not public.can_message_recipient('audit-parent@example.invalid')
    or not public.can_message_recipient('audit-child@example.invalid') then
    raise exception 'Teacher cannot contact own group'; end if;
  if public.can_message_recipient('unrelated@example.invalid') then
    raise exception 'Teacher can contact unrelated student'; end if;
  if not public.teacher_can_access_student_group('00000000-0000-4000-8000-00000000d003','00000000-0000-4000-8000-00000000c001') then
    raise exception 'Teacher cannot access trial enrollment without primary group'; end if;
  if public.teacher_can_access_student_group('00000000-0000-4000-8000-00000000d003','00000000-0000-4000-8000-00000000c002') then
    raise exception 'Teacher can access trial student in unrelated group'; end if;
  if not public.can_message_recipient('audit-parent@example.invalid') then raise exception 'Teacher cannot contact own parent'; end if;
  if public.can_message_recipient('unrelated@example.invalid') then raise exception 'Teacher can contact unrelated student'; end if;
  begin
    perform public.save_attendance('00000000-0000-4000-8000-00000000d002','00000000-0000-4000-8000-00000000c002',current_date,'Présent');
    raise exception 'Teacher attendance bypass';
  exception when insufficient_privilege then null; end;
end $$;
insert into public.assessments(student_id,group_id,terme)
values('00000000-0000-4000-8000-00000000d003','00000000-0000-4000-8000-00000000c001','Sept–Déc');
do $$ begin
  begin
    insert into public.assessments(student_id,group_id,terme)
    values('00000000-0000-4000-8000-00000000d003','00000000-0000-4000-8000-00000000c002','Sept–Déc');
    raise exception 'Teacher wrote assessment in unrelated group';
  exception when insufficient_privilege then null; end;
end $$;
select public.save_attendance('00000000-0000-4000-8000-00000000d001','00000000-0000-4000-8000-00000000c001',current_date,'Présent');
select public.save_attendance('00000000-0000-4000-8000-00000000d001','00000000-0000-4000-8000-00000000c001',current_date,'Absent');
do $$ begin
  if (select count(*) from public.attendance where student_id='00000000-0000-4000-8000-00000000d001') <> 1 then
    raise exception 'Attendance retry duplicated row'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000a001',true);
update public.students set status='Prospect' where id='00000000-0000-4000-8000-00000000d001';
insert into public.enrollments(id,student_id,status,date_inscription)
values('00000000-0000-4000-8000-00000000f100','00000000-0000-4000-8000-00000000d001','Submitted',current_date);
do $$ begin
  if (select status from public.students where id='00000000-0000-4000-8000-00000000d001') <> 'Prospect' then
    raise exception 'Submitted enrollment status drift'; end if;
  begin
    update public.enrollments set status='Validated'
      where id='00000000-0000-4000-8000-00000000f100';
    raise exception 'Validation without group succeeded';
  exception when check_violation then null; end;
  if (select status from public.students where id='00000000-0000-4000-8000-00000000d001') <> 'Prospect' then
    raise exception 'Failed enrollment update changed student'; end if;
  begin
    update public.enrollments set student_id='00000000-0000-4000-8000-00000000d002'
      where id='00000000-0000-4000-8000-00000000f100';
    raise exception 'Enrollment student changed';
  exception when check_violation then null; end;
end $$;
update public.enrollments set status='Trial',group_id='00000000-0000-4000-8000-00000000c001'
where id='00000000-0000-4000-8000-00000000f100';
do $$ begin
  if (select status from public.students where id='00000000-0000-4000-8000-00000000d001') <> 'Trial' then
    raise exception 'Trial enrollment status drift'; end if;
end $$;
update public.enrollments set status='Validated' where id='00000000-0000-4000-8000-00000000f100';
do $$ begin
  if (select status from public.students where id='00000000-0000-4000-8000-00000000d001') <> 'Enrolled' then
    raise exception 'Validated enrollment status drift'; end if;
end $$;
update public.enrollments set status='Rejected' where id='00000000-0000-4000-8000-00000000f100';
do $$ begin
  if (select status from public.students where id='00000000-0000-4000-8000-00000000d001') <> 'Inactive' then
    raise exception 'Rejected enrollment status drift'; end if;
end $$;
insert into public.dismissal_logs(student_id,adult_id,adult_name)
values('00000000-0000-4000-8000-00000000d001','00000000-0000-4000-8000-00000000e001','Spoofed');
do $$ begin
  if public.count_today_dismissals() < 1 then raise exception 'Casablanca pickup count missing'; end if;
  if (select staff_name from public.dismissal_logs where student_id='00000000-0000-4000-8000-00000000d001') <> 'Synthetic Admin' then
    raise exception 'Staff identity not derived'; end if;
  begin
    insert into public.dismissal_logs(student_id,adult_id,adult_name)
    values('00000000-0000-4000-8000-00000000d001','00000000-0000-4000-8000-00000000e001','Synthetic Adult');
    raise exception 'Duplicate pickup allowed';
  exception when unique_violation then null; end;
  begin
    insert into public.dismissal_logs(student_id,adult_id,adult_name)
    values('00000000-0000-4000-8000-00000000d002','00000000-0000-4000-8000-00000000e001','Synthetic Adult');
    raise exception 'Wrong adult allowed';
  exception when check_violation then null; end;
end $$;
reset role;
set local role service_role;
do $$
declare i integer;
begin
  for i in 1..5 loop
    if not public.check_anon_rate_limit('audit-synthetic-only','inscription:hour',999999,0) then
      raise exception 'Public limiter rejected below fixed threshold'; end if;
  end loop;
  if public.check_anon_rate_limit('audit-synthetic-only','inscription:hour',999999,0) then
    raise exception 'Caller-controlled threshold bypassed public limiter'; end if;
end $$;
do $$
declare first_id uuid; second_id uuid;
begin
  first_id := public.create_public_registration(
    '{"full_name":"Synthetic Registrant","telephone":"0000000000","email":"registration@example.invalid","consent":true}'::jsonb,
    '00000000-0000-4000-8000-00000000f001', repeat('a',64));
  second_id := public.create_public_registration(
    '{"full_name":"Synthetic Registrant","telephone":"0000000000","email":"registration@example.invalid","consent":true}'::jsonb,
    '00000000-0000-4000-8000-00000000f001', repeat('a',64));
  if first_id <> second_id then raise exception 'Registration retry duplicated student'; end if;
  if (select count(*) from public.enrollments where registration_request_id='00000000-0000-4000-8000-00000000f001') <> 1 then
    raise exception 'Registration retry duplicated enrollment'; end if;
  if (select consent_at is null or consent_policy_version is null from public.enrollments where registration_request_id='00000000-0000-4000-8000-00000000f001') then
    raise exception 'Registration consent evidence missing'; end if;
  begin
    perform public.create_public_registration(
      '{"full_name":"Changed","telephone":"0000000000","email":"registration@example.invalid","consent":true}'::jsonb,
      '00000000-0000-4000-8000-00000000f001', repeat('b',64));
    raise exception 'Changed registration request key accepted';
  exception when unique_violation then null; end;
end $$;
insert into public.students(full_name,email,status)
select 'Audit Large Set ' || lpad(i::text,4,'0'),
  'audit-large-' || i::text || '@example.invalid','Enrolled'
from generate_series(1,1005) as i;
do $$
declare first_page jsonb; last_page jsonb; full_export jsonb;
begin
  first_page := public.search_students_page(p_search => 'Audit Large Set', p_status => 'all_shown', p_page => 1, p_page_size => 20);
  last_page := public.search_students_page(p_search => 'Audit Large Set', p_status => 'all_shown', p_page => 51, p_page_size => 20);
  full_export := public.search_students_page(p_search => 'Audit Large Set', p_status => 'all_shown', p_page => 1, p_page_size => 0);
  if (first_page->>'count')::integer <> 1005
    or jsonb_array_length(first_page->'rows') <> 20
    or jsonb_array_length(last_page->'rows') <> 5
    or jsonb_array_length(full_export->'rows') <> 1005 then
    raise exception 'Student pagination/export truncated'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000a003',true);
do $$
declare visible jsonb;
begin
  visible := public.search_students_page(p_search => 'Audit Large Set', p_status => 'all_shown');
  if (visible->>'count')::integer <> 0 then raise exception 'Student search bypassed parent RLS'; end if;
end $$;
reset role;
rollback;
