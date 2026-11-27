-- RWR-r5 follow-ups (migration 142; owner approval 2026-11-26): the conversion keeps the
-- prospect's programme when the enrollment has none (item 1); the catalogue functions
-- have no service_role grant (item 2); « Aujourd'hui » survives malformed legacy test
-- times (item 8); crm_create_manual_lead has no API role (item 9); DELETE and TRUNCATE
-- for anon and authenticated, one decision per table, with a catalog ratchet for every
-- later table (item 10). Local-only synthetic fixtures, fully rolled back.
\set ON_ERROR_STOP on
begin;
create function pg_temp.ok(value boolean,label text) returns void language plpgsql as $$ begin
 if value is not true then raise exception 'FAIL: %',label; end if;
end $$;
create function pg_temp.denied(statement text,code text default '42501') returns void language plpgsql as $$ begin
 begin execute statement; exception when others then
  if sqlstate=code then return; end if;
  raise exception 'Expected %, got % (%): %',code,sqlstate,sqlerrm,statement;
 end;
 raise exception 'Unexpected success: %',statement;
end $$;
create function pg_temp.actor(i integer) returns void language plpgsql as $$ begin
 perform set_config('request.jwt.claim.sub','a7142000-0000-0000-0000-'||lpad(i::text,12,'0'),true);
end $$;
create function pg_temp.v(lead uuid) returns bigint language sql as $$ select version from public.crm_leads where id=lead $$;

insert into auth.users(id,email,aud,role,created_at,updated_at)
select ('a7142000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'follow-ups-'||i||'@example.invalid','authenticated','authenticated',now(),now() from generate_series(1,3)i;
update public.profiles set role=(array['director','admin','receptionist'])[right(id::text,1)::integer],full_name='Synthetic staff '||right(id::text,1)
 where id::text like 'a7142000-%';
do $$ begin perform pg_temp.actor(1); end $$;
do $p$ begin perform public.crm_create_followup_policy(gen_random_uuid(),
 '{"weekly_hours":{"1":[["09:00","20:00"]],"2":[["09:00","20:00"]],"3":[["09:00","20:00"]],"4":[["09:00","20:00"]],"5":[["09:00","20:00"]],"6":[["09:00","20:00"]],"7":[["09:00","20:00"]]},
   "attempt_offsets":[0,0,1,3,5]}'); end $p$;

-- ===== Items 2 and 9: function grants.
do $$ declare fn text; begin
 foreach fn in array array['public.get_catalogue()','public.catalogue_set_price(text,text,numeric,text,uuid)','public.catalogue_save_programme(text,bigint,jsonb)'] loop
  perform pg_temp.ok(has_function_privilege('authenticated',fn,'execute') and not has_function_privilege('anon',fn,'execute')
   and not has_function_privilege('service_role',fn,'execute'),'catalogue RPC for authenticated only: '||fn);
 end loop;
 perform pg_temp.ok(not has_function_privilege('authenticated','public.crm_create_manual_lead(uuid,jsonb)','execute')
  and not has_function_privilege('anon','public.crm_create_manual_lead(uuid,jsonb)','execute')
  and not has_function_privilege('service_role','public.crm_create_manual_lead(uuid,jsonb)','execute'),'crm_create_manual_lead: no API role (deviation 3)');
 perform pg_temp.ok(has_function_privilege('authenticated','public.crm_create_prospect(uuid,jsonb)','execute'),'crm_create_prospect stays the screens'' create');
 perform pg_temp.ok(not has_function_privilege('authenticated','crm_security.calendar_time(text)','execute'),'calendar_time stays private');
end $$;
savepoint api;
set local role authenticated;
do $$ begin perform pg_temp.actor(3); end $$;
select pg_temp.denied($q$select public.crm_create_manual_lead(gen_random_uuid(),'{"display_name":"Refusé","phone":"0612342001","source_label":"Manuel · Appel entrant"}')$q$);
do $$ begin perform pg_temp.actor(1); end $$;
select pg_temp.denied($q$select public.crm_create_manual_lead(gen_random_uuid(),'{"display_name":"Refusé","phone":"0612342002","source_label":"Manuel · Appel entrant"}')$q$);
rollback to savepoint api;
\echo PASS function grants: catalogue RPCs for authenticated only, crm_create_manual_lead for no API role

-- ===== Item 10: DELETE and TRUNCATE, one decision per table.
do $$
declare
 keep text[]:=array['announcements','assessments','authorized_adults','certificates','groups','learning_assessments','leave_requests','messages','payroll','portfolios','placement_tests'];
 revoked text[]:=array['activity_log','anon_rate_limits','app_config','attendance','dismissal_logs','enrollments','notifications','premium_attendance',
  'premium_group_memberships','premium_groups','premium_homework_submissions','premium_sessions','students','teachers','charge_balances','legacy_receipt_reconciliation'];
 t text; bad text;
begin
 foreach t in array keep loop
  perform pg_temp.ok(has_table_privilege('authenticated','public.'||t,'delete'),'screen delete kept: '||t);
 end loop;
 foreach t in array revoked loop
  perform pg_temp.ok(not has_table_privilege('authenticated','public.'||t,'delete'),'no screen deletes, revoked: '||t);
 end loop;
 foreach t in array keep||revoked loop
  perform pg_temp.ok(not has_table_privilege('anon','public.'||t,'delete') and not has_table_privilege('anon','public.'||t,'truncate')
   and not has_table_privilege('authenticated','public.'||t,'truncate'),'no anon delete and no API truncate: '||t);
  perform pg_temp.ok(has_table_privilege('service_role','public.'||t,'delete'),'service_role unchanged: '||t);
 end loop;
 -- Ratchet: Supabase's default privileges grant ALL on every new public table, so a later
 -- table fails here until its migration revokes what no screen needs.
 select string_agg(c.relname||':'||r||':'||p,', ' order by c.relname,r,p) into bad
 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 cross join unnest(array['anon','authenticated']) r cross join unnest(array['delete','truncate']) p
 where n.nspname='public' and c.relkind in ('r','p','v','m','f') and has_table_privilege(r,c.oid,p)
  and not (r='authenticated' and p='delete' and c.relname=any(keep));
 perform pg_temp.ok(bad is null,'API DELETE/TRUNCATE outside the reviewed list: '||coalesce(bad,''));
end $$;
-- Behaviour: RLS-gated screen deletes still work; the revoked ones are refused before RLS.
insert into public.groups(id,name,session_type,niveau,annee) values('a7142000-0000-0000-0000-00000000a001','Groupe suivi 142','Yearly','Child 1','2026-2027');
insert into public.announcements(id,title,body) values('a7142000-0000-0000-0000-00000000a002','Annonce suivi 142','Texte');
savepoint deletes;
set local role authenticated;
do $$ begin perform pg_temp.actor(1); end $$;
do $$ declare n integer; begin
 delete from public.groups where id='a7142000-0000-0000-0000-00000000a001'; get diagnostics n=row_count;
 perform pg_temp.ok(n=1,'the director still deletes a group (groups screen)');
 delete from public.announcements where id='a7142000-0000-0000-0000-00000000a002'; get diagnostics n=row_count;
 perform pg_temp.ok(n=1,'the director still deletes an announcement (communications screen)');
end $$;
select pg_temp.denied($q$delete from public.students where id='a7142000-0000-0000-0000-00000000a003'$q$);
select pg_temp.denied($q$delete from public.attendance where id is null$q$);
select pg_temp.denied($q$delete from public.enrollments where id is null$q$);
select pg_temp.denied($q$truncate public.app_config$q$);
do $$ begin perform pg_temp.actor(3); end $$;
select pg_temp.denied($q$truncate public.groups cascade$q$);
reset role;
set local role anon;
select pg_temp.denied($q$delete from public.messages where id is null$q$);
select pg_temp.denied($q$truncate public.messages$q$);
rollback to savepoint deletes;
\echo PASS table privileges: 11 screen deletes kept, 16 revoked, no anon delete, no API truncate, ratchet clean

-- ===== Item 1: a conversion on an enrollment with no programme keeps the prospect's.
-- enrollments_confirmed_has_programme (120, validated) already keeps a Confirmed or
-- Validated enrollment from having no programme, and only those convert, so the case
-- cannot arise today: the coalesce is defence in depth. The fixture drops the check
-- inside a savepoint to build the legacy shape the coalesce is for.
alter table public.receipts disable trigger on_receipt_created;
savepoint no_programme;
alter table public.enrollments drop constraint enrollments_confirmed_has_programme;
do $$ declare l uuid; s uuid:=gen_random_uuid(); e uuid:=gen_random_uuid(); r jsonb; begin
 perform pg_temp.actor(3);
 l:=(public.crm_create_prospect(gen_random_uuid(),jsonb_build_object('source_label','Manuel · Appel entrant','display_name','Parent sans programme',
  'learner_name','Lina Sansprog','phone','0612342010','session_type','Yearly'))->'lead'->>'id')::uuid;
 perform public.crm_qualify_lead(gen_random_uuid(),jsonb_build_object('lead_id',l,'expected_version',pg_temp.v(l),'conversation_channel','phone','note','Qualifié',
  'qualification_step','enrollment','next_task',jsonb_build_object('task_type','enrollment_followup','due_at',now()+interval '1 day')));
 -- An existing learner file carries the programme; its enrollment has none (legacy shape).
 insert into public.students(id,full_name,telephone,status,session_type) values(s,'Lina Sansprog','0612342011','Prospect','Yearly');
 insert into public.enrollments(id,student_id,session_type,school_year,status,date_inscription) values(e,s,null,'2026/2027','Confirmed',current_date);
 perform pg_temp.ok((select session_type is null from public.enrollments where id=e),'fixture: the enrollment has no programme');
 perform pg_temp.actor(1);
 r:=public.crm_start_enrollment(gen_random_uuid(),jsonb_build_object('lead_id',l,'expected_version',pg_temp.v(l),'student_choice','existing','student_id',s,
  'enrollment_id',e,'expected_enrollment_updated_at',(select updated_at from public.enrollments where id=e),'session_type','Yearly','school_year','2026/2027','initial_status','Confirmed'));
 set constraints all immediate; set constraints all deferred;
 perform pg_temp.ok((select status='CONVERTED' and enrollment_id=e from public.crm_leads where id=l),'the prospect converts on the existing enrollment');
 perform pg_temp.ok((select session_type='Yearly' from public.crm_leads where id=l),'the converted prospect keeps its programme (coalesce)');
 perform pg_temp.ok((select session_type is null from public.enrollments where id=e),'the enrollment itself is not changed');
end $$;
rollback to savepoint no_programme;
do $$ begin perform pg_temp.ok(exists(select 1 from pg_constraint where conrelid='public.enrollments'::regclass
 and conname='enrollments_confirmed_has_programme' and convalidated),'the programme check is back after the savepoint'); end $$;
alter table public.receipts enable trigger on_receipt_created;
\echo PASS conversion: an enrollment with no programme keeps the programme of the prospect

-- ===== Item 8: « Aujourd'hui » with malformed legacy test times.
insert into public.placement_tests(id,student_name,date_test,heure,status,crm_lead_id)
select ('a7142000-0000-0000-0000-0000000b000'||i)::uuid,'Test ancien '||i,(now() at time zone public.centre_utc_offset())::date,h,'Planifié',null
from unnest(array['invalid','9h30','25:61',''],array[1,2,3,4]) x(h,i);
do $$ declare t jsonb; begin
 perform pg_temp.actor(3);
 perform public.crm_create_prospect(gen_random_uuid(),jsonb_build_object('source_label','Manuel · Appel entrant','display_name','Parent aujourd''hui',
  'learner_name','Sami Aujourdhui','phone','0612342020'));
 perform pg_temp.ok((select count(*)=4 from public.placement_tests where crm_lead_id is null and status='Planifié' and crm_security.calendar_time(heure) is null
  and id::text like 'a7142000-%'),'fixture: four planned legacy tests with malformed times');
 perform pg_temp.ok((select count(*) from public.crm_leads where status in ('NEW','CONTACTING','ENGAGED','QUALIFIED') and merged_into_lead_id is null)>0,'fixture: active prospects');
 perform pg_temp.actor(3);
 t:=public.crm_get_today(30,0,0);
 perform pg_temp.ok(jsonb_typeof(t->'needs_attention')='array' and jsonb_typeof(t->'today_schedule')='array','crm_get_today answers with malformed legacy times present');
 perform pg_temp.ok(not exists(select 1 from jsonb_array_elements(t->'today_schedule') x where x->>'id' like 'a7142000-%'),'legacy tests with no CRM link stay off the CRM schedule');
end $$;
\echo PASS crm_get_today: malformed legacy times never fail the read

rollback;
\echo PASS RWR follow-ups 142
