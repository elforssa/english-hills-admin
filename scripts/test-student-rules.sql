-- RWR-r5 PR C2 (migration 141), §6.4 learner files. Rolled back; synthetic data only.
-- Dates are relative to the Casablanca business date, so every case holds on any day.
--  1. Birth date, for every writer (staff, reception command, system): never after today,
--     and at least one year ago; an unchanged date is not re-checked.
--  2. Age category vs programme and level (programme_levels age bounds), for staff
--     writes: the admin's direct write (RLS) and the reception command. A system write
--     (security-definer paths such as the enrolment sync) is never refused for the
--     category, and an existing file is re-checked only when one of the three changes.
\set ON_ERROR_STOP on
begin;
create function pg_temp.ok(value boolean,label text) returns void language plpgsql as $$ begin
 if value is not true then raise exception 'FAIL: %',label; end if;
end $$;
create function pg_temp.denied(statement text,code text default '22023',expected_hint text default null) returns void language plpgsql as $$
declare h text; begin
 begin execute statement; exception when others then
  get stacked diagnostics h=pg_exception_hint;
  if sqlstate=code and (expected_hint is null or h=expected_hint) then return; end if;
  raise exception 'Expected % %, got % % (%): %',code,coalesce(expected_hint,''),sqlstate,sqlerrm,h,statement;
 end;
 raise exception 'Unexpected success: %',statement;
end $$;
create function pg_temp.actor(i integer) returns void language plpgsql as $$ begin
 perform set_config('request.jwt.claim.sub','a7141200-0000-4000-8000-'||lpad(i::text,12,'0'),true);
end $$;
create function pg_temp.today() returns date language sql as $$ select (now() at time zone public.centre_utc_offset())::date $$;
create temp table ids(k text primary key, id uuid);
grant select on ids to authenticated;
create function pg_temp.id(name text) returns uuid language sql as $$ select id from ids where k=name $$;
insert into auth.users(id,email,aud,role,created_at,updated_at)
select ('a7141200-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'student-rules-'||i||'@example.invalid','authenticated','authenticated',now(),now() from generate_series(1,3)i;
update public.profiles set role=(array['director','admin','receptionist'])[right(id::text,1)::integer],full_name='Student rules staff '||right(id::text,1)
 where id::text like 'a7141200-%';
do $$ begin
 perform pg_temp.ok(exists(select 1 from pg_trigger where tgrelid='public.students'::regclass and tgname='students_rules_guard' and tgenabled='O'),'students_rules_guard enabled');
end $$;

-- ===== 1. Birth date, every writer.
do $$ declare s uuid; begin
 -- System write (postgres).
 perform pg_temp.denied(format($q$insert into public.students(full_name,status,date_naissance) values('Future birth','Prospect',%L)$q$,pg_temp.today()+1),'22023','student.birth_date_future');
 perform pg_temp.denied(format($q$insert into public.students(full_name,status,date_naissance) values('Recent birth','Prospect',%L)$q$,pg_temp.today()-100),'22023','student.birth_date_too_recent');
 perform pg_temp.denied(format($q$insert into public.students(full_name,status,date_naissance) values('Today birth','Prospect',%L)$q$,pg_temp.today()),'22023','student.birth_date_too_recent');
 insert into public.students(full_name,status,date_naissance) values('A year ago','Prospect',(pg_temp.today()-interval '1 year')::date) returning id into s;
 perform pg_temp.ok(s is not null,'exactly one year ago accepted');
 -- An old row with an out-of-range date (written before 141) keeps working until the date changes.
 set local session_replication_role=replica;
 insert into public.students(full_name,status,date_naissance) values('Legacy recent','Prospect',pg_temp.today()-10) returning id into s;
 set local session_replication_role=origin;
 insert into ids values('legacy',s);
 update public.students set notes='Edited' where id=s;
 perform pg_temp.denied(format($q$update public.students set date_naissance=%L where id=%L$q$,pg_temp.today()-20,s),'22023','student.birth_date_too_recent');
 -- The reception command.
 perform pg_temp.actor(3);
 perform pg_temp.denied(format($q$select * from public.save_receptionist_student(%L,null,jsonb_build_object('full_name','Reception future','date_naissance',%L))$q$,gen_random_uuid(),pg_temp.today()+3),
  '22023','student.birth_date_future');
end $$;
\echo PASS 1 birth date: never after today, at least a year ago, for every writer; unchanged dates not re-checked

-- ===== 2. Category vs programme and level.
do $$ declare s uuid; r record; begin
 -- System write: never refused for the category.
 insert into public.students(full_name,status,session_type,age_category) values('System mismatch','Prospect','Yearly','Adults (18+)') returning id into s;
 insert into ids values('mismatch',s);
 perform pg_temp.ok(s is not null,'a system write is not refused for the category');
 -- The admin's direct write (RLS).
 perform pg_temp.actor(2); execute 'set local role authenticated';
 perform pg_temp.denied($q$insert into public.students(full_name,status,session_type,age_category) values('Admin mismatch','Prospect','Yearly','Adults (18+)')$q$,'22023','student.category_level');
 perform pg_temp.denied($q$insert into public.students(full_name,status,session_type,age_category) values('Admin teen adult','Prospect','Adults','Teens (13-17)')$q$,'22023','student.category_level');
 perform pg_temp.denied($q$insert into public.students(full_name,status,session_type,niveau_cefr,age_category) values('Admin level','Prospect','Communication Junior','A1','Corporate')$q$,'22023','student.category_level');
 insert into public.students(full_name,status,session_type,niveau_cefr,age_category) values('Admin child','Prospect','Yearly','Child 1','Young Learners (6-12)') returning id into s;
 insert into public.students(full_name,status,session_type,age_category) values('Admin teen yearly','Prospect','Yearly','Teens (13-17)') returning id into s;
 insert into public.students(full_name,status,session_type,niveau_cefr,age_category) values('Admin corporate','Prospect','Adults','Beginning 1','Corporate') returning id into s;
 insert into public.students(full_name,status,session_type,age_category) values('Admin other','Prospect','Other','Young Learners (6-12)') returning id into s;
 insert into public.students(full_name,status,session_type) values('Admin no category','Prospect','Yearly') returning id into s;
 perform pg_temp.ok(s is not null,'fitting combinations and an empty category accepted');
 -- An existing mismatch: other edits pass, changing one of the three is checked.
 update public.students set notes='Phone call noted' where id=pg_temp.id('mismatch');
 perform pg_temp.ok(found,'an edit of other fields passes on an existing mismatch');
 perform pg_temp.denied(format($q$update public.students set niveau_cefr='Child 2' where id=%L$q$,pg_temp.id('mismatch')),'22023','student.category_level');
 update public.students set age_category='Teens (13-17)' where id=pg_temp.id('mismatch');
 perform pg_temp.ok((select age_category='Teens (13-17)' from public.students where id=pg_temp.id('mismatch')),'the mismatch corrected');
 execute 'reset role';
 -- The reception command.
 perform pg_temp.actor(3);
 perform pg_temp.denied(format($q$select * from public.save_receptionist_student(%L,null,'{"full_name":"Reception mismatch","session_type":"Yearly","age_category":"Adults (18+)"}')$q$,gen_random_uuid()),
  '22023','student.category_level');
 s:=gen_random_uuid();
 select * into r from public.save_receptionist_student(s,null,'{"full_name":"Reception adult","session_type":"Adults","age_category":"Adults (18+)"}');
 perform pg_temp.denied(format($q$select * from public.save_receptionist_student(%L,%L,'{"age_category":"Young Learners (6-12)"}')$q$,s,r.updated_at),'22023','student.category_level');
 select * into r from public.save_receptionist_student(s,r.updated_at,'{"age_category":"Corporate"}');
 perform pg_temp.ok((select age_category='Corporate' from public.students where id=s),'reception edit with a fitting category');
 -- The flag is for the command only: a later system write in the same transaction is exempt.
 perform pg_temp.actor(null);
 insert into public.students(full_name,status,session_type,age_category) values('System after command','Prospect','Yearly','Corporate') returning id into s;
 perform pg_temp.ok(s is not null,'system write after the command still exempt');
end $$;
\echo PASS 2 category vs programme and level: staff writes checked, system writes exempt, existing files re-checked only on change
rollback;
