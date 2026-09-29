-- Local synthetic Batch 1 permission matrix. Every fixture rolls back.
\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email,aud,role,email_confirmed_at,created_at,updated_at) values
 ('96000000-0000-0000-0000-000000000001','batch1-director@example.test','authenticated','authenticated',now(),now(),now()),
 ('96000000-0000-0000-0000-000000000002','batch1-admin@example.test','authenticated','authenticated',now(),now(),now()),
 ('96000000-0000-0000-0000-000000000003','batch1-reception@example.test','authenticated','authenticated',now(),now(),now()),
 ('96000000-0000-0000-0000-000000000004','batch1-teacher@example.test','authenticated','authenticated',now(),now(),now()),
 ('96000000-0000-0000-0000-000000000005','batch1-parent@example.test','authenticated','authenticated',now(),now(),now()),
 ('96000000-0000-0000-0000-000000000006','batch1-student@example.test','authenticated','authenticated',now(),now(),now());
update public.profiles set role=case right(id::text,1)
 when '1' then 'director' when '2' then 'admin' when '3' then 'receptionist'
 when '4' then 'teacher' when '5' then 'parent' else 'student' end
where id::text like '96000000-%';
insert into public.teachers(id,full_name,email,telephone,contract_type,taux_horaire,salaire_mensuel,iban,notes)
 values('96000000-0000-0000-0000-000000000010','Batch teacher','batch1-teacher@example.test',
 '0611111111','Freelance',900,10000,'PRIVATE-BANK','PRIVATE-HR');
insert into public.students(id,full_name,email,status,session_type,niveau_cefr,plan_type)
 values('96000000-0000-0000-0000-000000000020','Batch learner','batch1-student@example.test',
 'Enrolled','Yearly','Child 1','Premium');
insert into public.groups(id,name,session_type,niveau,teacher_id)
 values('96000000-0000-0000-0000-000000000030','Batch group','Yearly','Child 1',
 '96000000-0000-0000-0000-000000000010');
insert into public.enrollments(id,student_id,status,session_type,level,school_year)
 values('96000000-0000-0000-0000-000000000040',
 '96000000-0000-0000-0000-000000000020','Confirmed','Yearly','Child 1','2026/2027');

create function pg_temp.denied(statement text) returns void language plpgsql as $$ begin
 begin execute statement; exception when insufficient_privilege then return; end;
 raise exception 'Expected permission denial: %',statement;
end $$;
create function pg_temp.invalid(statement text) returns void language plpgsql as $$ begin
 begin execute statement; exception when check_violation or invalid_parameter_value or serialization_failure then return; end;
 raise exception 'Expected validation rejection: %',statement;
end $$;

select set_config('request.jwt.claim.sub','96000000-0000-0000-0000-000000000003',true);
select set_config('request.jwt.claims',
 '{"sub":"96000000-0000-0000-0000-000000000003","role":"authenticated","user_metadata":{"role":"director"}}',true);
set local role authenticated;
do $$ declare row_json jsonb; begin
 if exists(select 1 from public.teachers where id='96000000-0000-0000-0000-000000000010') then
   raise exception 'Teacher base table leaked'; end if;
 select to_jsonb(t) into row_json from public.get_teacher_operations('96000000-0000-0000-0000-000000000010') t;
 if row_json is null or row_json ?| array['contract_type','taux_horaire','salaire_mensuel','iban','notes'] or
   row_json->>'full_name' <> 'Batch teacher' then raise exception 'Unsafe teacher projection'; end if;
 if (select count(*) from public.get_teacher_directory('96000000-0000-0000-0000-000000000010'))<>1 then
   raise exception 'Teacher directory unavailable'; end if;
 if not exists(select 1 from public.charges where student_id='96000000-0000-0000-0000-000000000020') then
   -- This fixture has no charge yet; operational SELECT is checked after payment below.
   null;
 end if;
 if not has_function_privilege('authenticated','public.save_receptionist_student(uuid,timestamptz,jsonb)','EXECUTE')
   or has_function_privilege('authenticated','public.create_charge_payment_financial(jsonb)','EXECUTE')
   or has_schema_privilege('authenticated','operational_security','USAGE') then
   raise exception 'New RPC/private ACL mismatch'; end if;
end $$;
select pg_temp.denied($q$select public.get_finance_summary()$q$);
select pg_temp.denied($q$select public.get_unpaid_receipts()$q$);
select pg_temp.denied($q$select public.get_referral_breakdown()$q$);
select pg_temp.denied($q$select public.get_finance_charge_summary()$q$);
select pg_temp.denied($q$select public.create_charge_payment_financial('{}'::jsonb)$q$);
select pg_temp.denied($q$select public.reserve_storage_asset('teacher_photo',null,'96000000-0000-0000-0000-000000000010',null)$q$);
select pg_temp.denied($q$select public.soft_delete_student('96000000-0000-0000-0000-000000000020')$q$);
select pg_temp.denied($q$select public.void_financial_receipt(gen_random_uuid(),'Correction',gen_random_uuid())$q$);
select pg_temp.denied($q$select public.void_financial_charge(gen_random_uuid(),'Correction',gen_random_uuid())$q$);
select pg_temp.invalid($q$select public.save_receptionist_teacher_operations('96000000-0000-0000-0000-000000000010',now(),'{"iban":"changed"}')$q$);
select pg_temp.invalid($q$select public.save_receptionist_student('96000000-0000-0000-0000-000000000020',now(),'{"email":"changed@example.test"}')$q$);
select pg_temp.invalid($q$select public.save_receptionist_group('96000000-0000-0000-0000-000000000030',now(),'{"deleted_at":"2026-01-01"}')$q$);
select pg_temp.invalid($q$select public.save_receptionist_premium_session(gen_random_uuid(),null,'{"teacher_id":"96000000-0000-0000-0000-000000000010"}')$q$);
do $$ begin
 update public.students set full_name='forged' where id='96000000-0000-0000-0000-000000000020';
 if found then raise exception 'Direct student UPDATE allowed'; end if;
 update public.teachers set iban='forged' where id='96000000-0000-0000-0000-000000000010';
 if found then raise exception 'Direct teacher UPDATE allowed'; end if;
 update public.enrollments set status='Validated' where id='96000000-0000-0000-0000-000000000040';
 if found then raise exception 'Direct confirmation allowed'; end if;
 if exists(select 1 from public.app_config) or exists(select 1 from public.payroll) or
   exists(select 1 from public.financial_events) then raise exception 'Restricted table read'; end if;
end $$;

-- Exact safe writes and optimistic version checks.
do $$ declare v_student uuid:='96000000-0000-0000-0000-000000000021';
  v_version timestamptz; v_teacher_version timestamptz; v_group_version timestamptz;
  v_enrollment_version timestamptz; v_attendance uuid;
  v_new_group uuid:='96000000-0000-0000-0000-000000000031'; begin
 perform public.save_receptionist_student(v_student,null,
   '{"full_name":"New Batch learner","session_type":"Yearly","niveau_cefr":"Child 1","email":"new@example.test"}');
 if not exists(select 1 from public.students where id=v_student and status='Enrolled' and plan_type='Standard') then
   raise exception 'Dossier create failed'; end if;
 select updated_at into v_version from public.students where id=v_student;
 perform public.save_receptionist_student(v_student,v_version,'{"telephone":"0600000000","notes":"Reception note"}');
 perform pg_temp.invalid(format('select public.save_receptionist_student(%L,%L,%L::jsonb)',
   v_student,v_version-interval '1 second','{"telephone":"stale"}'));
 select updated_at into v_teacher_version from public.get_teacher_operations('96000000-0000-0000-0000-000000000010');
 perform public.save_receptionist_teacher_operations('96000000-0000-0000-0000-000000000010',v_teacher_version,
   '{"telephone":"0622222222","certifications":["CELTA"]}');
 perform public.save_receptionist_group(v_new_group,null,
   '{"name":"New Batch group","session_type":"Yearly","niveau":"Child 1","teacher_id":"96000000-0000-0000-0000-000000000010"}');
 select updated_at into v_group_version from public.groups where id=v_new_group;
 perform public.save_receptionist_group(v_new_group,v_group_version,'{"salle":"Room 1"}');
 select updated_at into v_version from public.students where id=v_student;
 perform public.assign_receptionist_student_group(v_student,null,v_new_group,v_version,null);
 if not exists(select 1 from public.students where id=v_student and groupe_id=v_new_group) then
   raise exception 'Dossier-only group assignment failed'; end if;
 select updated_at into v_version from public.students where id='96000000-0000-0000-0000-000000000020';
 select updated_at into v_enrollment_version from public.enrollments where id='96000000-0000-0000-0000-000000000040';
 perform public.assign_receptionist_student_group('96000000-0000-0000-0000-000000000020',
   '96000000-0000-0000-0000-000000000040','96000000-0000-0000-0000-000000000030',v_version,v_enrollment_version);
 if not exists(select 1 from public.enrollments where id='96000000-0000-0000-0000-000000000040' and status='Validated') then
   raise exception 'Confirmed enrollment assignment failed'; end if;
 v_attendance:=public.save_attendance('96000000-0000-0000-0000-000000000020',
   '96000000-0000-0000-0000-000000000030',current_date,'Présent');
 if v_attendance is distinct from public.save_attendance('96000000-0000-0000-0000-000000000020',
   '96000000-0000-0000-0000-000000000030',current_date,'Retard') then
   raise exception 'Attendance correction duplicated history'; end if;
 perform pg_temp.invalid(format('update public.attendance set student_id=%L where id=%L',
   v_student,v_attendance));
 perform pg_temp.denied(format('update public.attendance set notes=%L where id=%L',
   'forged note',v_attendance));
 perform pg_temp.denied(format('update public.attendance set id=%L where id=%L',
   gen_random_uuid(),v_attendance));
end $$;

-- Premium scheduling and roster commands retain the 051-054 entitlement guards.
do $$ declare pg_id uuid:='96000000-0000-0000-0000-000000000050';
  member_id uuid:='96000000-0000-0000-0000-000000000051';
  session_id uuid:='96000000-0000-0000-0000-000000000052';
  session_date date; version timestamptz; attendance_id uuid; begin
  session_date:=current_date + ((6-extract(isodow from current_date)::integer+7)%7);
  perform public.create_receptionist_premium_group(pg_id,'Batch Premium',
    '96000000-0000-0000-0000-000000000010',6::smallint,'10:00',null,null);
  perform public.save_receptionist_premium_membership(member_id,null,pg_id,
    '96000000-0000-0000-0000-000000000020',current_date);
  perform public.save_receptionist_premium_session(session_id,null,
    jsonb_build_object('premium_group_id',pg_id,'scheduled_date',session_date));
  attendance_id:=public.save_receptionist_premium_attendance(session_id,
    '96000000-0000-0000-0000-000000000020','Present');
  if not exists(select 1 from public.premium_attendance where id=attendance_id) then
    raise exception 'Premium attendance unavailable'; end if;
  select updated_at into version from public.premium_sessions where id=session_id;
  perform public.save_receptionist_premium_session(session_id,version,'{"status":"Confirmed"}');
  perform pg_temp.invalid(format('select public.save_receptionist_premium_session(%L,null,%L::jsonb)',
    gen_random_uuid(),'{}'));
  if exists(select 1 from public.premium_homework_submissions) then
    raise exception 'Premium homework leaked'; end if;
end $$;

-- Payment engine remains the sole financial write path. Zero does not issue a receipt.
do $$ declare result jsonb; v_student uuid:='96000000-0000-0000-0000-000000000020'; begin
 result:=public.create_charge_payment(jsonb_build_object('idempotency_key',gen_random_uuid(),
   'student_id',v_student,'session_type','Other','school_year','2026/2027',
   'service_detail','Synthetic material','gross_amount',100,'discount_amount',0,'payment_amount',0,
   'payment_method','Espèces'));
 if result->>'receipt_id' is not null then raise exception 'Zero charge issued receipt'; end if;
 result:=public.create_charge_payment(jsonb_build_object('idempotency_key',gen_random_uuid(),
   'student_name','Synthetic payment learner','student_email','newpayer@example.test',
   'session_type','Yearly','school_year','2026/2027','plan_type','Standard','level','Child 1',
   'gross_amount',100,'discount_amount',0,'payment_amount',50,'payment_method','Espèces'));
 if result->>'receipt_id' is null or result->>'enrollment_id' is null then
   raise exception 'Payment/enrollment engine failed'; end if;
 if not exists(select 1 from public.students s where s.id=(select student_id from public.receipts
   where id=(result->>'receipt_id')::uuid) and s.status='Enrolled') then
   raise exception 'Payment did not enroll learner'; end if;
 if not exists(select 1 from public.charge_balances where student_id=v_student) then
   raise exception 'Operational balance hidden'; end if;
 if not exists(select 1 from public.receipts where id=(result->>'receipt_id')::uuid) then
   raise exception 'Operational receipt hidden'; end if;
end $$;
select pg_temp.denied($q$select public.create_charge_payment(jsonb_build_object('idempotency_key',gen_random_uuid(),
 'student_id','96000000-0000-0000-0000-000000000020','session_type','Other','school_year','2026/2027',
 'service_detail','Synthetic material','gross_amount',100,'payment_amount',0,'payment_method','Espèces',
 'update_contacts',true,'student_email','forged@example.test'))$q$);

-- Existing role scopes are unchanged; new school-wide mutations are reception-only.
reset role;
select set_config('request.jwt.claim.sub','96000000-0000-0000-0000-000000000004',true);
set local role authenticated;
select pg_temp.denied($q$select public.save_receptionist_student(gen_random_uuid(),null,'{"full_name":"Wrong role"}')$q$);
select pg_temp.denied($q$select public.get_teacher_operations()$q$);
reset role;
select set_config('request.jwt.claim.sub','96000000-0000-0000-0000-000000000005',true);
set local role authenticated;
select pg_temp.denied($q$select public.save_receptionist_group(gen_random_uuid(),null,'{"name":"Wrong role"}')$q$);
select pg_temp.denied($q$select public.get_teacher_operations()$q$);
reset role;
select set_config('request.jwt.claim.sub','96000000-0000-0000-0000-000000000006',true);
set local role authenticated;
select pg_temp.denied($q$select public.save_receptionist_teacher_operations(gen_random_uuid(),now(),'{}')$q$);
select pg_temp.denied($q$select public.get_teacher_operations()$q$);
reset role;
select set_config('request.jwt.claim.sub','96000000-0000-0000-0000-000000000001',true);
set local role authenticated;
select pg_temp.denied($q$select public.save_receptionist_student(gen_random_uuid(),null,'{"full_name":"Wrong role"}')$q$);
select public.get_teacher_operations('96000000-0000-0000-0000-000000000010');
reset role;
select set_config('request.jwt.claim.sub','96000000-0000-0000-0000-000000000002',true);
set local role authenticated;
select pg_temp.denied($q$select public.save_receptionist_student(gen_random_uuid(),null,'{"full_name":"Wrong role"}')$q$);
select public.get_teacher_operations('96000000-0000-0000-0000-000000000010');
rollback;
\echo PASS Batch 1 safe projection, bounded RPCs, finance engine, direct denials and role regression
