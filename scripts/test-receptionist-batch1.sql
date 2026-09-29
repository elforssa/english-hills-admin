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
insert into public.students(id,full_name,status,session_type,niveau_cefr) values
 ('96000000-0000-0000-0000-000000000022','Submitted learner','Enrolled','Yearly','Child 1'),
 ('96000000-0000-0000-0000-000000000023','Review learner','Enrolled','Yearly','Child 1'),
 ('96000000-0000-0000-0000-000000000024','Unset level learner','Enrolled','Yearly',null),
 ('96000000-0000-0000-0000-000000000025','Inherited Child learner','Enrolled','Yearly','Child 1'),
 ('96000000-0000-0000-0000-000000000026','Inherited Adult learner','Enrolled','Adults','Beginning 1'),
 ('96000000-0000-0000-0000-000000000027','Unset paid learner','Enrolled','Yearly',null),
 ('96000000-0000-0000-0000-000000000028','Rejected learner','Enrolled','Yearly','Child 1');
insert into public.groups(id,name,session_type,niveau) values
 ('96000000-0000-0000-0000-000000000032','Submitted group','Yearly','Child 1'),
 ('96000000-0000-0000-0000-000000000033','Review group','Yearly','Child 1'),
 ('96000000-0000-0000-0000-000000000035','Rejected group','Yearly','Child 1');
insert into public.enrollments(id,student_id,group_id,status,session_type,level,school_year) values
 ('96000000-0000-0000-0000-000000000042','96000000-0000-0000-0000-000000000022',
  '96000000-0000-0000-0000-000000000032','Submitted','Yearly','Child 1','2026/2027'),
 ('96000000-0000-0000-0000-000000000043','96000000-0000-0000-0000-000000000023',
  '96000000-0000-0000-0000-000000000033','Under Review','Yearly','Child 1','2026/2027'),
 ('96000000-0000-0000-0000-000000000044','96000000-0000-0000-0000-000000000027',
  null,'Confirmed','Yearly',null,'2026/2027'),
 ('96000000-0000-0000-0000-000000000045','96000000-0000-0000-0000-000000000028',
  '96000000-0000-0000-0000-000000000035','Rejected','Yearly','Child 1','2026/2027');
insert into public.assessments(id,student_id,group_id,commentaire) values
 ('96000000-0000-0000-0000-000000000060','96000000-0000-0000-0000-000000000020',
  '96000000-0000-0000-0000-000000000030','Read only assessment');
insert into public.authorized_adults(id,student_id,full_name,telephone,relation) values
 ('96000000-0000-0000-0000-000000000061','96000000-0000-0000-0000-000000000020',
  'Synthetic adult','0600000000','Parent');

create function pg_temp.denied(statement text) returns void language plpgsql as $$ begin
 begin execute statement; exception when insufficient_privilege then return; end;
 raise exception 'Expected permission denial: %',statement;
end $$;
create function pg_temp.invalid(statement text) returns void language plpgsql as $$ begin
 begin execute statement; exception when check_violation or invalid_parameter_value or serialization_failure then return; end;
 raise exception 'Expected validation rejection: %',statement;
end $$;
create function pg_temp.no_direct_write(table_name text, fixture_id uuid) returns void language plpgsql as $$
declare before_row jsonb; after_row jsonb; affected bigint; before_count bigint;
  after_count bigint; insert_allowed boolean:=false; insert_columns text;
  insert_values text; rejection_code text; begin
 if not exists(select 1 from pg_policies where schemaname='public' and tablename=table_name
   and policyname='receptionist_insert_deny' and permissive='RESTRICTIVE'
   and cmd='INSERT' and position('receptionist' in coalesce(with_check,''))>0) then
   raise exception 'Missing restrictive INSERT boundary: %',table_name; end if;
 execute format('select count(*) from public.%I',table_name) into before_count;
 execute format('select to_jsonb(t) from public.%I t where id=$1',table_name)
   into before_row using fixture_id;
 if before_row is null then raise exception 'Missing readable fixture: %',table_name; end if;
 select string_agg(format('%I',a.attname),',' order by a.attnum),
   string_agg(case when a.attname='id' then '$2' else format('t.%I',a.attname) end,
     ',' order by a.attnum) into insert_columns,insert_values
 from pg_attribute a join pg_class c on c.oid=a.attrelid
   join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relname=table_name and a.attnum>0
   and not a.attisdropped and a.attgenerated='' and a.attidentity='';
 begin
   execute format('insert into public.%I(%s) select %s from public.%I t where t.id=$1',
     table_name,insert_columns,insert_values,table_name) using fixture_id,gen_random_uuid();
   insert_allowed:=true;
 exception when others then get stacked diagnostics rejection_code=returned_sqlstate; end;
 if insert_allowed then raise exception 'Direct INSERT allowed: %',table_name; end if;
 if rejection_code<>'42501' then
   raise exception 'Direct INSERT rejected by non-permission rule on %: %',table_name,rejection_code; end if;
 begin
   execute format('update public.%I set updated_at=updated_at where id=$1',table_name) using fixture_id;
   get diagnostics affected=row_count;
   if affected<>0 then raise exception 'Direct UPDATE allowed: %',table_name; end if;
 exception when insufficient_privilege then null; end;
 begin
   execute format('delete from public.%I where id=$1',table_name) using fixture_id;
   get diagnostics affected=row_count;
   if affected<>0 then raise exception 'Direct DELETE allowed: %',table_name; end if;
 exception when insufficient_privilege then null; end;
 execute format('select to_jsonb(t) from public.%I t where id=$1',table_name)
   into after_row using fixture_id;
 execute format('select count(*) from public.%I',table_name) into after_count;
 if after_count<>before_count then raise exception 'Direct-write row count changed: %',table_name; end if;
 if after_row is distinct from before_row then
   raise exception 'Direct-write probe persisted a change: %',table_name; end if;
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

-- Every assigned enrollment, including pre-confirmation, holds the group's
-- session/level fixed. Rejected commands must leave both sides unchanged.
do $$ declare v_group uuid; v_enrollment uuid; before_group jsonb; before_enrollment jsonb;
  v_version timestamptz; v_student_version timestamptz; v_enrollment_version timestamptz;
  v_new uuid; before_student jsonb; begin
 foreach v_group in array array['96000000-0000-0000-0000-000000000032'::uuid,
   '96000000-0000-0000-0000-000000000033'::uuid,
   '96000000-0000-0000-0000-000000000035'::uuid] loop
   v_enrollment:=case when v_group='96000000-0000-0000-0000-000000000032'
     then '96000000-0000-0000-0000-000000000042'::uuid
     when v_group='96000000-0000-0000-0000-000000000033'
       then '96000000-0000-0000-0000-000000000043'::uuid
     else '96000000-0000-0000-0000-000000000045'::uuid end;
   select to_jsonb(g),g.updated_at into before_group,v_version from public.groups g where g.id=v_group;
   select to_jsonb(e) into before_enrollment from public.enrollments e where e.id=v_enrollment;
   perform pg_temp.invalid(format('select public.save_receptionist_group(%L,%L,%L::jsonb)',
     v_group,v_version,'{"session_type":"Adults","niveau":"Beginning 1"}'));
   if (select to_jsonb(g) from public.groups g where g.id=v_group) is distinct from before_group
     or (select to_jsonb(e) from public.enrollments e where e.id=v_enrollment)
       is distinct from before_enrollment then
     raise exception 'Rejected pre-confirmation group mutation persisted'; end if;
   perform public.save_receptionist_group(v_group,v_version,'{"salle":"Compatible room"}');
   if not exists(select 1 from public.groups where id=v_group and salle='Compatible room'
     and session_type='Yearly' and niveau='Child 1') then
     raise exception 'Compatible group edit failed'; end if;
 end loop;
 -- An empty group can still be changed to another valid programme.
 perform public.save_receptionist_group('96000000-0000-0000-0000-000000000034',null,
   '{"name":"Empty programme group","session_type":"Yearly","niveau":"Child 1"}');
 select updated_at into v_version from public.groups where id='96000000-0000-0000-0000-000000000034';
 perform public.save_receptionist_group('96000000-0000-0000-0000-000000000034',v_version,
   '{"session_type":"Adults","niveau":"Beginning 1"}');
 if not exists(select 1 from public.groups where id='96000000-0000-0000-0000-000000000034'
   and session_type='Adults' and niveau='Beginning 1') then
   raise exception 'Empty group programme change failed'; end if;

 -- An explicit Child 1/Adults combination is rejected with no new row.
 perform pg_temp.invalid($q$select public.save_receptionist_enrollment(
   '96000000-0000-0000-0000-000000000025',null,null,'Submitted','Child 1',current_date,null,
   'Adults','2026/2027')$q$);
 if exists(select 1 from public.enrollments where student_id='96000000-0000-0000-0000-000000000025') then
   raise exception 'Rejected explicit level persisted'; end if;
 -- Choosing another session without a level clears incompatible dossier
 -- inheritance, as the enrollment form's empty-level option promises.
 v_new:=public.save_receptionist_enrollment('96000000-0000-0000-0000-000000000025',
   null,null,'Submitted',null,current_date,null,'Adults','2026/2027');
 if not exists(select 1 from public.enrollments where id=v_new and session_type='Adults'
   and level is null) or exists(select 1 from public.enrollments where id=v_new
     and level='Child 1') then raise exception 'Incompatible inherited level was copied'; end if;
 v_new:=public.save_receptionist_enrollment('96000000-0000-0000-0000-000000000025',
   null,null,'Submitted',null,current_date,null,'Yearly','2026/2027');
 if not exists(select 1 from public.enrollments where id=v_new and session_type='Yearly'
   and level='Child 1') then raise exception 'Compatible Yearly inheritance failed'; end if;
 v_new:=public.save_receptionist_enrollment('96000000-0000-0000-0000-000000000026',
   null,null,'Submitted',null,current_date,null,'Adults','2026/2027');
 if not exists(select 1 from public.enrollments where id=v_new and session_type='Adults'
   and level='Beginning 1') then raise exception 'Compatible Adults inheritance failed'; end if;

 -- No dossier or paid-enrollment assignment silently supplies an unset level.
 select updated_at into v_student_version from public.students
   where id='96000000-0000-0000-0000-000000000024';
 select to_jsonb(s) into before_student from public.students s
   where id='96000000-0000-0000-0000-000000000024';
 perform pg_temp.invalid(format('select public.assign_receptionist_student_group(%L,null,%L,%L,null)',
   '96000000-0000-0000-0000-000000000024',
   '96000000-0000-0000-0000-000000000030',v_student_version));
 if (select to_jsonb(s) from public.students s
   where id='96000000-0000-0000-0000-000000000024') is distinct from before_student then
   raise exception 'Unset dossier level changed after rejection'; end if;
 select updated_at into v_student_version from public.students
   where id='96000000-0000-0000-0000-000000000027';
 select to_jsonb(s) into before_student from public.students s
   where id='96000000-0000-0000-0000-000000000027';
 select updated_at into v_enrollment_version from public.enrollments
   where id='96000000-0000-0000-0000-000000000044';
 select to_jsonb(e) into before_enrollment from public.enrollments e
   where id='96000000-0000-0000-0000-000000000044';
 perform pg_temp.invalid(format('select public.assign_receptionist_student_group(%L,%L,%L,%L,%L)',
   '96000000-0000-0000-0000-000000000027','96000000-0000-0000-0000-000000000044',
   '96000000-0000-0000-0000-000000000030',v_student_version,v_enrollment_version));
 if (select to_jsonb(e) from public.enrollments e
   where id='96000000-0000-0000-0000-000000000044') is distinct from before_enrollment or
   (select to_jsonb(s) from public.students s
     where id='96000000-0000-0000-0000-000000000027') is distinct from before_student then
   raise exception 'Unset paid level changed after rejection'; end if;
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

-- Readable operational tables remain non-writable except through bounded RPCs.
-- Probe INSERT, UPDATE and DELETE as receptionist, and compare each readable
-- fixture before/after so a silent RLS zero-row result is also verified.
do $$ declare v_charge uuid; v_receipt uuid; v_premium_attendance uuid; begin
 select id into v_charge from public.charges
   where student_id='96000000-0000-0000-0000-000000000020' limit 1;
 select id into v_receipt from public.receipts where email='newpayer@example.test' limit 1;
 select id into v_premium_attendance from public.premium_attendance
   where premium_session_id='96000000-0000-0000-0000-000000000052' limit 1;
 perform pg_temp.no_direct_write('receipts',v_receipt);
 perform pg_temp.no_direct_write('charges',v_charge);
 perform pg_temp.no_direct_write('assessments','96000000-0000-0000-0000-000000000060');
 perform pg_temp.no_direct_write('authorized_adults','96000000-0000-0000-0000-000000000061');
 perform pg_temp.no_direct_write('premium_groups','96000000-0000-0000-0000-000000000050');
 perform pg_temp.no_direct_write('premium_group_memberships','96000000-0000-0000-0000-000000000051');
 perform pg_temp.no_direct_write('premium_sessions','96000000-0000-0000-0000-000000000052');
 perform pg_temp.no_direct_write('premium_attendance',v_premium_attendance);
end $$;

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
