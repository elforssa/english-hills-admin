-- RWR-r5 PR C2 (migration 141), §6.3 attendance, §7 invariant 5 and data step D7
-- (shipped, NOT run here against real data). Rolled back; synthetic data only.
-- Dates come from the server: the Casablanca business date, its ISO weekday, and a closed
-- date written into the published hours version two days ago, so every case holds on
-- any weekday and at any time of day.
--  1. groups.class_days: ISO weekdays only, stored sorted without repeats, empty = NULL.
--  2. New attendance rows (staff and teachers, save_attendance and direct writes): never a
--     future date, never a day outside class_days (when set), never a closed date unless
--     the director overrides; the override is refused for any other role; corrections of
--     an existing row are unchanged; system writes (no profile) are not refused.
--  3. save_receptionist_group: class_days validated and stored; an online group refused
--     (OD-9 A, NF-16), on create and on a move to an online programme; editing an online
--     group's other fields stays allowed.
--  4. D7: the parser against the shared fixture (:class_days_cases, the JS twin reads the
--     same file); d7_plan counts and lists ids and hashes only; d7_apply refuses other
--     counts, writes the parsed days and journals them; a second run is refused; d7_revert
--     restores NULL where the value is still D7's and skips edited groups; nothing is
--     executable by an API role.
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
 perform set_config('request.jwt.claim.sub',case when i is null then '' else 'a7141100-0000-4000-8000-'||lpad(i::text,12,'0') end,true);
end $$;
create function pg_temp.today() returns date language sql as $$ select (now() at time zone public.centre_utc_offset())::date $$;
create function pg_temp.dow(d date) returns smallint language sql as $$ select extract(isodow from d)::smallint $$;
create temp table ids(k text primary key, id uuid);
grant select on ids to authenticated;
create function pg_temp.id(name text) returns uuid language sql as $$ select id from ids where k=name $$;

insert into auth.users(id,email,aud,role,created_at,updated_at)
select ('a7141100-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'attendance-rules-'||i||'@example.invalid','authenticated','authenticated',now(),now() from generate_series(1,4)i;
update public.profiles set role=(array['director','admin','receptionist','teacher'])[right(id::text,1)::integer],full_name='Attendance staff '||right(id::text,1)
 where id::text like 'a7141100-%';
insert into ids values ('teacher',gen_random_uuid()),('g_today',gen_random_uuid()),('g_other',gen_random_uuid()),('g_free',gen_random_uuid()),('s1',gen_random_uuid()),('s2',gen_random_uuid()),('s3',gen_random_uuid());
insert into public.teachers(id,full_name,email) values (pg_temp.id('teacher'),'Synthetic attendance teacher','attendance-teacher@example.invalid');
update public.profiles set linked_teacher_id=pg_temp.id('teacher') where id='a7141100-0000-4000-8000-000000000004';
-- Published hours: open every day, and the centre was closed two days ago (§4.5).
do $p$ begin perform pg_temp.actor(1); perform public.crm_create_followup_policy(gen_random_uuid(),
 '{"weekly_hours":{"1":[["08:00","21:00"]],"2":[["08:00","21:00"]],"3":[["08:00","21:00"]],"4":[["08:00","21:00"]],"5":[["08:00","21:00"]],"6":[["08:00","21:00"]],"7":[["08:00","21:00"]]},
   "attempt_offsets":[0,0,1,3,5]}'::jsonb||jsonb_build_object('date_exceptions',jsonb_build_array((pg_temp.today()-2)::text))); end $p$;
select pg_temp.ok(crm_security.closed_dates(crm_security.current_policy_id())=array[pg_temp.today()-2],'the closed date is published');
-- Groups: one meeting today and two days ago, one never today, one without class days.
insert into public.groups(id,name,session_type,niveau,teacher_id,class_days) values
 (pg_temp.id('g_today'),'Synthetic today group','Yearly','Child 1',pg_temp.id('teacher'),array[pg_temp.dow(pg_temp.today()),pg_temp.dow(pg_temp.today()-2),pg_temp.dow(pg_temp.today()-1)]),
 (pg_temp.id('g_other'),'Synthetic other-day group','Yearly','Child 1',null,array[pg_temp.dow(pg_temp.today()+3)]),
 (pg_temp.id('g_free'),'Synthetic free group','Yearly','Child 1',null,null);
-- One learner per group (one active enrolment per programme and year).
insert into public.students(id,full_name,status,session_type,niveau_cefr) select pg_temp.id(k),'Synthetic attendance learner '||k,'Enrolled','Yearly','Child 1' from unnest(array['s1','s2','s3']) k;
select set_config('eh.membership_sync','on',true), set_config('eh.enrollment_command','on',true);
insert into public.enrollments(student_id,group_id,status,session_type,level,school_year)
select pg_temp.id(x.s),pg_temp.id(x.g),'Validated','Yearly','Child 1','2026/2027' from (values ('s1','g_today'),('s2','g_other'),('s3','g_free')) x(s,g);
select set_config('eh.membership_sync','',true), set_config('eh.enrollment_command','',true);

-- ===== 1. class_days.
do $$ begin
 perform pg_temp.ok((select class_days=array(select distinct x from unnest(array[pg_temp.dow(pg_temp.today()),pg_temp.dow(pg_temp.today()-2),pg_temp.dow(pg_temp.today()-1)]) x order by 1)::smallint[]
  from public.groups where id=pg_temp.id('g_today')),'stored sorted without repeats');
 update public.groups set class_days=array[5,1,5,3]::smallint[] where id=pg_temp.id('g_free');
 perform pg_temp.ok((select class_days='{1,3,5}' from public.groups where id=pg_temp.id('g_free')),'normalised on update');
 update public.groups set class_days='{}' where id=pg_temp.id('g_free');
 perform pg_temp.ok((select class_days is null from public.groups where id=pg_temp.id('g_free')),'empty becomes NULL');
 perform pg_temp.denied(format($q$update public.groups set class_days='{0,2}' where id=%L$q$,pg_temp.id('g_free')),'23514');
 perform pg_temp.denied(format($q$update public.groups set class_days='{8}' where id=%L$q$,pg_temp.id('g_free')),'23514');
end $$;
\echo PASS 1 class_days: ISO weekdays, sorted, no repeats, empty is NULL

-- ===== 2. Attendance date rules.
do $$ declare who integer; a uuid; begin
 foreach who in array array[1,2,3] loop
  perform pg_temp.actor(who); execute 'set local role authenticated';
  perform pg_temp.denied(format('select public.save_attendance(%L,%L,%L,%L)',pg_temp.id('s1'),pg_temp.id('g_today'),pg_temp.today()+1,'Présent'),'22023','attendance.future_date');
  perform pg_temp.denied(format('select public.save_attendance(%L,%L,%L,%L)',pg_temp.id('s2'),pg_temp.id('g_other'),pg_temp.today(),'Présent'),'22023','attendance.not_class_day');
  perform pg_temp.denied(format('select public.save_attendance(%L,%L,%L,%L)',pg_temp.id('s1'),pg_temp.id('g_today'),pg_temp.today()-2,'Présent'),'22023','attendance.closed_date');
  execute 'reset role';
 end loop;
 -- Direct table writes meet the same trigger (receptionist policy).
 perform pg_temp.actor(3); execute 'set local role authenticated';
 perform pg_temp.denied(format($q$insert into public.attendance(student_id,group_id,session_date,status) values(%L,%L,%L,'Présent')$q$,pg_temp.id('s1'),pg_temp.id('g_today'),pg_temp.today()+1),
  '22023','attendance.future_date');
 -- The override is the director's only.
 perform pg_temp.denied(format('select public.save_attendance(%L,%L,%L,%L,true)',pg_temp.id('s1'),pg_temp.id('g_today'),pg_temp.today()-2,'Présent'),'42501','attendance.override_director');
 execute 'reset role';
 perform pg_temp.actor(2); execute 'set local role authenticated';
 perform pg_temp.denied(format('select public.save_attendance(%L,%L,%L,%L,true)',pg_temp.id('s1'),pg_temp.id('g_today'),pg_temp.today()-2,'Présent'),'42501','attendance.override_director');
 execute 'reset role';
 perform pg_temp.actor(1); execute 'set local role authenticated';
 a:=public.save_attendance(pg_temp.id('s1'),pg_temp.id('g_today'),pg_temp.today()-2,'Présent',true);
 perform pg_temp.ok(a is not null,'the director records a closed date with the override');
 -- The override does not lift the other rules.
 perform pg_temp.denied(format('select public.save_attendance(%L,%L,%L,%L,true)',pg_temp.id('s1'),pg_temp.id('g_today'),pg_temp.today()+1,'Présent'),'22023','attendance.future_date');
 execute 'reset role';
 -- Today on a class day: accepted for staff and the group's teacher; corrections unchanged.
 perform pg_temp.actor(3); execute 'set local role authenticated';
 a:=public.save_attendance(pg_temp.id('s1'),pg_temp.id('g_today'),pg_temp.today(),'Retard');
 perform pg_temp.ok(public.save_attendance(pg_temp.id('s1'),pg_temp.id('g_today'),pg_temp.today(),'Présent')=a,'today: recorded, then corrected on the same row');
 a:=public.save_attendance(pg_temp.id('s3'),pg_temp.id('g_free'),pg_temp.today()-1,'Absent');
 perform pg_temp.ok(a is not null,'a group without class days: any past or present day');
 execute 'reset role';
 perform pg_temp.actor(4); execute 'set local role authenticated';
 perform pg_temp.denied(format($q$insert into public.attendance(student_id,group_id,session_date,status) values(%L,%L,%L,'Présent')$q$,pg_temp.id('s1'),pg_temp.id('g_today'),pg_temp.today()+1),
  '22023','attendance.future_date');
 a:=public.save_attendance(pg_temp.id('s1'),pg_temp.id('g_today'),pg_temp.today()-1,'Présent');
 perform pg_temp.ok(a is not null,'the group''s teacher records yesterday (a class day)');
 execute 'reset role';
 -- A correction of an existing row on a day the rules now refuse stays possible (history).
 perform pg_temp.actor(null);
 insert into public.attendance(student_id,group_id,session_date,status) values(pg_temp.id('s2'),pg_temp.id('g_other'),pg_temp.today()+1,'Présent') returning id into a;
 perform pg_temp.ok(a is not null,'a system write (no profile) is not refused');
 perform pg_temp.actor(3); execute 'set local role authenticated';
 perform pg_temp.ok(public.save_attendance(pg_temp.id('s2'),pg_temp.id('g_other'),pg_temp.today()+1,'Absent')=a,'an existing row is still corrected');
 execute 'reset role';
end $$;
\echo PASS 2 attendance: no future date, class days only, closed dates need the director override, corrections unchanged

-- ===== 3. save_receptionist_group.
do $$ declare g uuid:=gen_random_uuid(); r record; online uuid:=gen_random_uuid(); begin
 perform pg_temp.actor(3);
 select * into r from public.save_receptionist_group(g,null,'{"name":"Synthetic reception group","session_type":"Yearly","niveau":"Child 2","jours":"Lun, Mer","class_days":[3,1,3]}');
 perform pg_temp.ok((select class_days='{1,3}' and jours='Lun, Mer' from public.groups where id=g),'class days stored, sorted');
 select * into r from public.save_receptionist_group(g,null,'{"name":"Synthetic reception group","session_type":"Yearly","niveau":"Child 2","jours":"Lun, Mer","class_days":[3,1,3]}');
 perform pg_temp.ok(r.id=g,'create replay with the same class days');
 perform pg_temp.denied(format($q$select * from public.save_receptionist_group(%L,null,'{"name":"Synthetic reception group","session_type":"Yearly","niveau":"Child 2","jours":"Lun, Mer","class_days":[2]}')$q$,g),'23505');
 perform pg_temp.denied(format($q$select * from public.save_receptionist_group(%L,%L,'{"class_days":[0]}')$q$,g,(select updated_at from public.groups where id=g)),'22023','group.class_days_invalid');
 perform pg_temp.denied(format($q$select * from public.save_receptionist_group(%L,%L,'{"class_days":"Lun"}')$q$,g,(select updated_at from public.groups where id=g)),'22023','group.class_days_invalid');
 select * into r from public.save_receptionist_group(g,(select updated_at from public.groups where id=g),'{"class_days":[5],"jours":"Ven"}');
 perform pg_temp.ok((select class_days='{5}' and jours='Ven' from public.groups where id=g),'class days edited');
 select * into r from public.save_receptionist_group(g,(select updated_at from public.groups where id=g),'{"class_days":null}');
 perform pg_temp.ok((select class_days is null from public.groups where id=g),'class days cleared');
 -- OD-9 A (NF-16): no online group from reception.
 perform pg_temp.denied(format($q$select * from public.save_receptionist_group(%L,null,'{"name":"Synthetic online","session_type":"Online","niveau":"B1"}')$q$,gen_random_uuid()),'42501','group.online_management_only');
 perform pg_temp.denied(format($q$select * from public.save_receptionist_group(%L,null,'{"name":"Synthetic one to one","session_type":"Online One-to-One","niveau":"B1"}')$q$,gen_random_uuid()),'42501','group.online_management_only');
 perform pg_temp.denied(format($q$select * from public.save_receptionist_group(%L,%L,'{"session_type":"Online","niveau":"B1"}')$q$,g,(select updated_at from public.groups where id=g)),'42501','group.online_management_only');
 perform pg_temp.actor(null);
 insert into public.groups(id,name,session_type,niveau) values(online,'Synthetic online group','Online','B1');
 perform pg_temp.actor(3);
 select * into r from public.save_receptionist_group(online,(select updated_at from public.groups where id=online),'{"salle":"Salle 2"}');
 perform pg_temp.ok((select salle='Salle 2' and session_type='Online' from public.groups where id=online),'an online group''s other fields stay editable (RPW-r2)');
end $$;
\echo PASS 3 reception group command: class days, no online group (OD-9 A)

-- ===== 4. D7 (group class days), shipped and not run.
create temp table class_days_fixture as select :'class_days_cases'::jsonb doc;
do $$ declare c jsonb; days smallint[]; begin
 for c in select * from jsonb_array_elements((select doc from class_days_fixture)) loop
  days:=academic_security.parse_class_days(c->>'input');
  perform pg_temp.ok(to_jsonb(days) is not distinct from (case when jsonb_typeof(c->'days')='null' then null else c->'days' end),
   format('parse %s → %s (got %s)',c->'input',c->'days',to_jsonb(days)));
 end loop;
 perform pg_temp.ok(jsonb_array_length((select doc from class_days_fixture))>=20,'the shared fixture is read');
end $$;
do $$ declare fn text; r text; begin
 foreach fn in array array['crm_security.d7_rows()','crm_security.d7_plan()','crm_security.d7_apply(jsonb)','crm_security.d7_revert()','academic_security.parse_class_days(text)'] loop
  foreach r in array array['anon','authenticated','service_role'] loop perform pg_temp.ok(not has_function_privilege(r,fn,'execute'),fn||' private from '||r); end loop;
 end loop;
 perform pg_temp.ok(not exists(select 1 from public.crm_data_step_journal where step in ('d7','d7_revert')),'D7 not run');
end $$;
-- Fixtures: three parsed, one unparseable, one empty, one online (out of scope), one already set.
-- The plan is computed over this database's groups; the counts below are the deltas.
create temp table d7_before as select crm_security.d7_plan()->'counts' c;
insert into ids values ('d7_a',gen_random_uuid()),('d7_b',gen_random_uuid()),('d7_c',gen_random_uuid()),('d7_bad',gen_random_uuid()),('d7_empty',gen_random_uuid()),('d7_online',gen_random_uuid()),('d7_set',gen_random_uuid());
insert into public.groups(id,name,session_type,niveau,jours,class_days) values
 (pg_temp.id('d7_a'),'D7 a','Yearly','Child 1','Lun, Mer',null),(pg_temp.id('d7_b'),'D7 b','Yearly','Child 1','Samedi',null),
 (pg_temp.id('d7_c'),'D7 c','Yearly','Child 2','mardi et jeudi',null),(pg_temp.id('d7_bad'),'D7 bad','Yearly','Child 1','Lun-Ven 18h',null),
 (pg_temp.id('d7_empty'),'D7 empty','Yearly','Child 1',null,null),(pg_temp.id('d7_online'),'D7 online','Online','B1','Lun, Mar',null),
 (pg_temp.id('d7_set'),'D7 set','Yearly','Child 1','Lun','{2}');
do $$ declare p jsonb:=crm_security.d7_plan(); b jsonb:=(select c from d7_before); r jsonb; begin
 perform pg_temp.ok((p->'counts'->>'parsed')::int=(b->>'parsed')::int+3 and (p->'counts'->>'unparseable')::int=(b->>'unparseable')::int+1
  and (p->'counts'->>'empty')::int=(b->>'empty')::int+1,'dry run counts');
 perform pg_temp.ok(exists(select 1 from jsonb_array_elements(p->'unparseable') x where x->>'group_id'=pg_temp.id('d7_bad')::text and length(x->>'hash')=8)
  and p::text not like '%Lun-Ven%' and p::text not like '%18h%','unparseable listed by id and hash, never the text');
 perform pg_temp.ok(not exists(select 1 from crm_security.d7_rows() where group_id in (pg_temp.id('d7_online'),pg_temp.id('d7_set'))),'online and already-set groups out of scope');
 perform pg_temp.denied(format('select crm_security.d7_apply(%L)',jsonb_build_object('parsed',0,'unparseable',0,'empty',0)),'22023','d7.counts');
 r:=crm_security.d7_apply(p->'counts');
 perform pg_temp.ok((r->>'updated')::int=(p->'counts'->>'parsed')::int,'applied the parsed groups');
 perform pg_temp.ok((select class_days='{1,3}' from public.groups where id=pg_temp.id('d7_a')) and (select class_days='{6}' from public.groups where id=pg_temp.id('d7_b'))
  and (select class_days='{2,4}' from public.groups where id=pg_temp.id('d7_c')) and (select class_days is null from public.groups where id=pg_temp.id('d7_bad'))
  and (select class_days is null from public.groups where id=pg_temp.id('d7_empty')) and (select class_days='{2}' from public.groups where id=pg_temp.id('d7_set'))
  and (select class_days is null from public.groups where id=pg_temp.id('d7_online')),'values written; the rest untouched');
 perform pg_temp.ok((select count(*)=(p->'counts'->>'parsed')::int from public.crm_data_step_journal where step='d7')
  and exists(select 1 from public.crm_data_step_journal where step='d7' and entity='groups' and entity_id=pg_temp.id('d7_a') and after->'class_days'='[1,3]'::jsonb and before->'class_days'='null'::jsonb),'journaled');
 perform pg_temp.denied(format('select crm_security.d7_apply(%L)',p->'counts'),'55000','d7.already_run');
 -- An edit after D7 is kept by the revert.
 update public.groups set class_days='{4}' where id=pg_temp.id('d7_b');
 r:=crm_security.d7_revert();
 perform pg_temp.ok((r->>'restored')::int=(p->'counts'->>'parsed')::int-1 and r->'skipped' @> to_jsonb(array[pg_temp.id('d7_b')]),'revert: restored, edited group skipped');
 perform pg_temp.ok((select class_days is null from public.groups where id=pg_temp.id('d7_a')) and (select class_days='{4}' from public.groups where id=pg_temp.id('d7_b')),'revert values');
 perform pg_temp.denied('select crm_security.d7_revert()','55000','d7.already_reverted');
end $$;
\echo PASS 4 D7: parser against the shared fixture, private, dry run by id and hash, counts gate, journal, one run, revert keeps later edits
rollback;
