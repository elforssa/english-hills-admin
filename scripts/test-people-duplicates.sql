-- RWR-r5 PR B1 (§5.2, §5.3; invariant 7): the duplicate gate, siblings, « C'est la
-- même personne », the prospect edit, the wrong-number correction and find_people.
-- Local-only synthetic fixtures (invented numbers), fully rolled back.
\set ON_ERROR_STOP on
begin;
create function pg_temp.ok(value boolean,label text) returns void language plpgsql as $$ begin
 if value is not true then raise exception 'FAIL: %',label; end if;
end $$;
create function pg_temp.denied(statement text,code text default '22023',expected_hint text default null) returns text language plpgsql as $$
declare h text; d text; begin
 begin execute statement; exception when others then
  get stacked diagnostics h=pg_exception_hint, d=pg_exception_detail;
  if sqlstate=code and (expected_hint is null or h=expected_hint) then return d; end if;
  raise exception 'Expected % %, got % % (%): %',code,coalesce(expected_hint,''),sqlstate,sqlerrm,h,statement;
 end;
 raise exception 'Unexpected success: %',statement;
end $$;
create function pg_temp.actor(i integer) returns void language plpgsql as $$ begin
 perform set_config('request.jwt.claim.sub','a7138000-0000-0000-0000-'||lpad(i::text,12,'0'),true);
end $$;
create function pg_temp.create(payload jsonb) returns jsonb language sql as $$
 select public.crm_create_prospect(gen_random_uuid(),jsonb_build_object('source_label','Manuel · Appel entrant')||payload)
$$;
create function pg_temp.lead(r jsonb) returns uuid language sql as $$ select (r->'lead'->>'id')::uuid $$;
create function pg_temp.v(lead uuid) returns bigint language sql as $$ select version from public.crm_leads where id=lead $$;
-- The Tâches bucket of a prospect's next action, as crm_get_work_queue computes it.
create function pg_temp.bucket(lead uuid) returns text language sql as $$
 select case when t.task_type='awaiting_prospect' then 'awaiting' when t.due_at<now() then 'overdue' when t.due_at<b.d1 then 'today' when t.due_at<b.d2 then 'tomorrow' else 'upcoming' end
 from public.crm_tasks t, crm_security.work_boundaries(now()) b where t.id=crm_security.next_action_id(lead)
$$;
create function pg_temp.work_rows() returns jsonb language plpgsql as $$
declare rows jsonb:='[]'; b text; begin
 for b in select unnest(array['overdue','today','tomorrow','upcoming','awaiting']) loop
  rows:=rows||(select coalesce(jsonb_agg(x||jsonb_build_object('bucket',b)),'[]') from jsonb_array_elements(public.crm_get_work_queue(p_bucket=>b,p_assignee_mode=>'all',p_limit=>50)->'rows') x);
 end loop;
 return rows;
end $$;
-- Counts per bucket = contacts with at least one active prospect due in that bucket.
create function pg_temp.counts_ok() returns boolean language sql as $$
 select public.crm_get_work_queue(p_assignee_mode=>'all')->'counts'=(select jsonb_object_agg(b,(select count(distinct l.contact_id) from public.crm_leads l
   where l.status in ('NEW','CONTACTING','ENGAGED','QUALIFIED') and l.merged_into_lead_id is null and pg_temp.bucket(l.id)=b))
  from unnest(array['overdue','today','tomorrow','upcoming','awaiting']) b)
$$;
create function pg_temp.one(lead uuid,label text) returns void language plpgsql as $$ begin
 perform pg_temp.ok((select count(*)=1 from public.crm_tasks where lead_id=lead and status='open'),'one next action: '||label);
end $$;

insert into auth.users(id,email,aud,role,created_at,updated_at)
select ('a7138000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'people-dup-'||i||'@example.invalid','authenticated','authenticated',now(),now() from generate_series(1,3)i;
update public.profiles set role=(array['director','admin','receptionist'])[right(id::text,1)::integer],full_name='Synthetic staff '||right(id::text,1)
 where id::text like 'a7138000-%';
do $$ begin perform pg_temp.actor(1); end $$;
do $p$ begin perform public.crm_create_followup_policy(gen_random_uuid(),
 '{"weekly_hours":{"1":[["09:00","20:00"]],"2":[["09:00","20:00"]],"3":[["09:00","20:00"]],"4":[["09:00","20:00"]],"5":[["09:00","20:00"]],"6":[["09:00","20:00"]],"7":[["09:00","20:00"]]},
   "attempt_offsets":[0,0,1,3,5]}'); end $p$;
do $$ begin perform pg_temp.actor(3); end $$;

-- Grants: the new RPCs for authenticated only; the helpers and D3/D5 for no API role.
do $$ declare fn text; begin
 foreach fn in array array['public.crm_create_prospect(uuid,jsonb)','public.crm_update_prospect(uuid,jsonb)','public.find_people(text,text,text,date,integer)',
  'public.record_person_match_decisions(text,uuid,jsonb)','public.crm_merge_prospects(uuid,uuid,uuid,bigint,bigint)','public.crm_merge_contacts(uuid,uuid,uuid,bigint,bigint)',
  'public.merge_students(uuid,uuid)','public.unmerge_student(uuid)','public.student_merge_preview(uuid,uuid)','public.search_desk_students(text,integer)'] loop
  perform pg_temp.ok(has_function_privilege('authenticated',fn,'execute') and not has_function_privilege('anon',fn,'execute'),'RPC grant '||fn);
 end loop;
 foreach fn in array array['crm_security.person_matches(text[],text,date,uuid,uuid,uuid)','crm_security.d3_apply(jsonb)','crm_security.d3_revert()',
  'crm_security.d3_plan()','crm_security.d5_apply(jsonb,jsonb)','crm_security.d5_plan(jsonb)','academic_security.merge_students_core(uuid,uuid)'] loop
  perform pg_temp.ok(not has_function_privilege('authenticated',fn,'execute') and not has_function_privilege('anon',fn,'execute')
   and not has_function_privilege('service_role',fn,'execute'),'private '||fn);
 end loop;
 perform pg_temp.ok(not has_table_privilege('authenticated','public.person_match_decisions','select'),'decisions table private');
end $$;
\echo PASS grants

-- An existing student (name and birth date) and a first prospect (phone).
insert into public.students(id,full_name,date_naissance,telephone,status,session_type)
 values('a7138000-0000-0000-0000-000000000020','Sara El Amrani','2015-03-01','0661000020','Prospect','Yearly');
create temp table ids(k text primary key, id uuid);
do $$ declare r jsonb; begin
 r:=pg_temp.create('{"display_name":"Nadia Bennani","phone":"0612345601","learner_name":"Yanis Bennani"}');
 insert into ids values('first',pg_temp.lead(r)),('first_contact',(r->'lead'->>'contact_id')::uuid);
 perform pg_temp.one(pg_temp.lead(r),'create');
 perform pg_temp.ok((select phone_e164 from public.crm_contacts where id=(r->'lead'->>'contact_id')::uuid)='+212612345601','phone stored in E.164');
end $$;

-- 1. The gate: the same phone in another format is refused with the match.
do $$ declare d text; begin
 d:=pg_temp.denied($q$select pg_temp.create('{"display_name":"Autre parent","phone":"+212 6 12 34 56 01","learner_name":"Lina"}')$q$,'PT409','people.possible_duplicate');
 perform pg_temp.ok(d::jsonb @> jsonb_build_array(jsonb_build_object('kind','prospect','id',(select id from ids where k='first'),'reason','phone')),'match reported: '||d);
 -- same name and birth date as a student, another phone
 d:=pg_temp.denied($q$select pg_temp.create('{"display_name":"Parent X","phone":"0661000099","learner_name":"amrani  sara el","learner_birth_date":"2015-03-01"}')$q$,'PT409','people.possible_duplicate');
 perform pg_temp.ok(d::jsonb @> '[{"kind":"student","id":"a7138000-0000-0000-0000-000000000020","reason":"name_birth"}]','student name+birth match');
 -- invalid and placeholder numbers are refused on this form
 perform pg_temp.denied($q$select pg_temp.create('{"display_name":"P","phone":"0600000000","learner_name":"L"}')$q$,'22023','people.phone_placeholder');
 perform pg_temp.denied($q$select pg_temp.create('{"display_name":"P","phone":"06 12","learner_name":"L"}')$q$,'22023','people.phone_invalid');
 -- an answer that is not « Même famille » or « Personne différente » is refused
 perform pg_temp.denied(format($q$select pg_temp.create('{"display_name":"Autre parent","phone":"0612345601","learner_name":"Lina","acknowledged_matches":[{"kind":"prospect","id":"%s","decision":"same_person"}]}')$q$,
  (select id from ids where k='first')),'22023');
end $$;
\echo PASS gate: same phone in any format, same name and birth date, invalid and placeholder numbers

-- 2. « Personne différente »: created, the decision recorded, Q12 excludes the pair.
do $$ declare r jsonb; begin
 r:=pg_temp.create(jsonb_build_object('display_name','Autre parent','phone','0612345601','learner_name','Lina Alaoui',
  'acknowledged_matches',jsonb_build_array(jsonb_build_object('kind','prospect','id',(select id from ids where k='first'),'decision','different_people'))));
 insert into ids values('different',pg_temp.lead(r));
 perform pg_temp.ok(exists(select 1 from public.person_match_decisions d where d.decision='different_people'
  and array[d.id_a,d.id_b] @> array[(select id from ids where k='first'),pg_temp.lead(r)]),'decision recorded');
 perform pg_temp.one(pg_temp.lead(r),'acknowledged create');
end $$;
\echo PASS « Personne différente » recorded and created

-- 3. « Ajouter un enfant »: same contact, no gate on the shared phone, contact fields refused.
do $$ declare r jsonb; c uuid:=(select id from ids where k='first_contact'); begin
 r:=pg_temp.create(jsonb_build_object('contact_id',c,'display_name','ignored','learner_name','Adam Bennani','learner_age',9));
 insert into ids values('sibling',pg_temp.lead(r));
 perform pg_temp.ok((r->'lead'->>'contact_id')::uuid=c and (select count(*) from public.crm_contacts where id=c)=1,'one contact');
 perform pg_temp.ok((select count(*) from public.crm_leads where contact_id=c)=2,'two learners on the contact');
 perform pg_temp.ok((select display_name from public.crm_contacts where id=c)='Nadia Bennani','contact kept as it is');
 perform pg_temp.denied(format($q$select pg_temp.create('{"contact_id":"%s","display_name":"x","learner_name":"Z","phone":"0612345699"}')$q$,c),'22023','people.sibling_contact_fields');
 perform pg_temp.one(pg_temp.lead(r),'sibling');
 -- the sibling with the same name and birth date as an existing one is still caught
 perform pg_temp.create(jsonb_build_object('contact_id',c,'learner_name','Rim Bennani','learner_birth_date','2016-05-05'));
 perform pg_temp.denied(format($q$select pg_temp.create('{"contact_id":"%s","learner_name":"rim bennani","learner_birth_date":"2016-05-05"}')$q$,c),'PT409','people.possible_duplicate');
end $$;
\echo PASS « Ajouter un enfant »: one contact, two learners, no false duplicate

-- 3b. Tâches: one row per contact in each bucket (day script 4; review of #217). The
-- siblings keep one action each; a row lists the other learners with their own action.
do $$ declare c uuid:=(select id from ids where k='first_contact'); r jsonb; fam jsonb; begin
 select jsonb_agg(x) into r from jsonb_array_elements(pg_temp.work_rows()) x where (x->>'lead_id')::uuid in (select id from public.crm_leads where contact_id=c);
 perform pg_temp.ok(jsonb_array_length(r)=(select count(distinct pg_temp.bucket(id)) from public.crm_leads where contact_id=c and status in ('NEW','CONTACTING','ENGAGED','QUALIFIED')),
  'one Tâches row for the contact in each of its buckets: '||coalesce(r::text,'none'));
 perform pg_temp.ok(jsonb_array_length(r)=1,'here the siblings fall in one bucket: one row');
 fam:=r->0->'family';
 perform pg_temp.ok(jsonb_array_length(fam)=(select count(*)-1 from public.crm_leads where contact_id=c and status in ('NEW','CONTACTING','ENGAGED','QUALIFIED')),'the other learners are listed');
 perform pg_temp.ok(not exists(select 1 from jsonb_array_elements(fam) f where f->'next_action'->>'id' is distinct from crm_security.next_action_id((f->>'lead_id')::uuid)::text),'each with its own next action');
 perform pg_temp.ok((r->0->>'id')::uuid=(select t.id from public.crm_leads l join public.crm_tasks t on t.id=crm_security.next_action_id(l.id) where l.contact_id=c
   order by coalesce(t.due_at,'9999-12-31'::timestamptz),t.id limit 1),'the row shows the earliest action');
 perform pg_temp.ok(pg_temp.counts_ok(),'counts per contact and bucket');
end $$;
-- 3c. Sibling A overdue, sibling B due today: B keeps its own row and count in
-- « Aujourd'hui »; A's overdue row still lists B (the reviewer's case).
do $$ declare a uuid; b uuid; c uuid; r jsonb; rows jsonb; today_before integer; begin
 a:=pg_temp.lead(pg_temp.create('{"display_name":"Leila Lahlou","phone":"0612345688","learner_name":"Sami Lahlou"}'));
 c:=(select contact_id from public.crm_leads where id=a);
 b:=pg_temp.lead(pg_temp.create(jsonb_build_object('contact_id',c,'learner_name','Nour Lahlou')));
 update public.crm_tasks set due_at=now()-interval '1 day' where id=crm_security.next_action_id(a);
 update public.crm_tasks set due_at=now()+((select d1 from crm_security.work_boundaries(now()))-now())/2 where id=crm_security.next_action_id(b);
 perform pg_temp.ok(pg_temp.bucket(a)='overdue' and pg_temp.bucket(b)='today','fixture: A overdue, B today');
 rows:=pg_temp.work_rows();
 select jsonb_agg(x) into r from jsonb_array_elements(rows) x where (x->>'lead_id')::uuid in (a,b);
 perform pg_temp.ok(jsonb_array_length(r)=2,'two rows, one per bucket: '||r::text);
 perform pg_temp.ok(exists(select 1 from jsonb_array_elements(r) x where x->>'bucket'='overdue' and (x->>'lead_id')::uuid=a
   and (x->>'id')::uuid=crm_security.next_action_id(a) and x->'family' @> jsonb_build_array(jsonb_build_object('lead_id',b))),'A in « En retard », listing B');
 perform pg_temp.ok(exists(select 1 from jsonb_array_elements(r) x where x->>'bucket'='today' and (x->>'lead_id')::uuid=b
   and (x->>'id')::uuid=crm_security.next_action_id(b)),'B keeps its own row in « Aujourd''hui »');
 perform pg_temp.ok(pg_temp.counts_ok(),'B counted in « Aujourd''hui »');
 perform pg_temp.one(a,'A'); perform pg_temp.one(b,'B');
end $$;
\echo PASS Tâches: one row per contact in each bucket, a sibling due in another bucket keeps its own row and count

-- 4. « C'est la même personne »: the learner is the contact, adult learner.
do $$ declare r jsonb; begin
 r:=pg_temp.create('{"display_name":"Karim Idrissi","phone":"0712345602","same_person":true,"first_exchange":{"channel":"in_person","next":{"task_type":"awaiting_prospect"}}}'::jsonb
   ||'{"source_label":"Manuel · Visite au centre"}');
 perform pg_temp.ok((select learner_name from public.crm_leads where id=pg_temp.lead(r))='Karim Idrissi','learner = contact');
 perform pg_temp.ok((select contact_kind from public.crm_contacts where id=(r->'lead'->>'contact_id')::uuid)='adult_learner','adult learner');
 perform pg_temp.ok(r->'next_action'->>'task_type'='awaiting_prospect' and (r->'next_action'->>'due_at') is not null,'« En attente » relance by default');
 perform pg_temp.denied($q$select pg_temp.create('{"display_name":"Karim","same_person":true,"learner_name":"Autre"}')$q$,'22023','people.same_person_name');
 insert into ids values('adult',pg_temp.lead(r));
end $$;
\echo PASS « C’est la même personne »

-- 5. The edit: one « Fiche modifiée » entry, phones masked, version-checked; duplicate candidates refreshed.
do $$ declare r jsonb; l uuid:=(select id from ids where k='adult'); a public.crm_activities%rowtype; begin
 r:=public.crm_update_prospect(gen_random_uuid(),jsonb_build_object('lead_id',l,'expected_version',pg_temp.v(l),'phone','06 12 34 56 01','learner_name','Karim Idrissi B.'));
 select * into a from public.crm_activities where lead_id=l and is_primary and details->>'command'='update_prospect' limit 1;
 perform pg_temp.ok(a.details->>'command'='update_prospect' and a.details->>'summary' like 'Fiche modifiée : téléphone, apprenant%','one primary entry: '||(a.details->>'summary'));
 perform pg_temp.ok(a.details->'changes' @> '[{"field":"phone","before":"07 •• •• •• 02","after":"06 •• •• •• 01"}]','phones masked');
 perform pg_temp.ok(a.details::text !~ '612345601|712345602','no full number in history');
 perform pg_temp.ok((select count(*) from public.crm_activities where command_key=a.command_key and is_primary)=1,'one history entry');
 perform pg_temp.ok(r->'duplicate_candidates' @> jsonb_build_array(jsonb_build_object('kind','prospect','id',(select id from ids where k='first'))),'candidates refreshed');
 perform pg_temp.denied(format($q$select public.crm_update_prospect(gen_random_uuid(),'{"lead_id":"%s","expected_version":1,"learner_name":"x"}')$q$,l),'PT409');
 perform pg_temp.denied(format($q$select public.crm_update_prospect(gen_random_uuid(),'{"lead_id":"%s","expected_version":%s,"learner_name":"Karim Idrissi B."}')$q$,l,pg_temp.v(l)),'22023','people.no_change');
 perform pg_temp.denied(format($q$select public.crm_update_prospect(gen_random_uuid(),'{"lead_id":"%s","expected_version":%s,"phone":"0700000000"}')$q$,l,pg_temp.v(l)),'22023','people.phone_placeholder');
 -- the answers sent with the next edit are recorded; the candidates are then gone
 r:=public.crm_update_prospect(gen_random_uuid(),jsonb_build_object('lead_id',l,'expected_version',pg_temp.v(l),'learner_age',31,
  'acknowledged_matches',(select jsonb_agg(jsonb_build_object('kind',m->>'kind','id',m->>'id','decision','same_family')) from jsonb_array_elements(r->'duplicate_candidates') m)));
 perform pg_temp.ok(jsonb_array_length(r->'duplicate_candidates')=0,'decided candidates gone');
 perform pg_temp.one(l,'after edits');
end $$;
-- A closed prospect can be corrected.
do $$ declare l uuid:=(select id from ids where k='different'); begin
 perform public.crm_close_prospect(gen_random_uuid(),jsonb_build_object('lead_id',l,'expected_version',pg_temp.v(l),'status','NOT_QUALIFIED','reason','duplicate'));
 perform public.crm_update_prospect(gen_random_uuid(),jsonb_build_object('lead_id',l,'expected_version',pg_temp.v(l),'display_name','Autre parent (corrigé)'));
 perform pg_temp.ok((select status from public.crm_leads where id=l)='NOT_QUALIFIED' and not exists(select 1 from public.crm_tasks where lead_id=l and status='open'),'closed stays closed');
end $$;
\echo PASS prospect edit: one masked history entry, version check, closed prospect editable

-- 6. Wrong number corrected: the contact's number changes and calling starts again.
do $$ declare r jsonb; l uuid; c uuid; cyc integer; a public.crm_activities%rowtype; begin
 r:=pg_temp.create('{"display_name":"Hind Tazi","phone":"0612345603","learner_name":"Omar Tazi"}');
 l:=pg_temp.lead(r); c:=(r->'lead'->>'contact_id')::uuid; cyc:=(select outreach_cycle from public.crm_leads where id=l);
 perform pg_temp.denied(format($q$select public.crm_log_exchange(gen_random_uuid(),'{"lead_id":"%s","expected_version":%s,"channel":"phone","result":"wrong_number","corrected_phone":"0612345604","next":{"task_type":"callback","due_preset":"tomorrow"}}')$q$,l,pg_temp.v(l)),'22023','people.corrected_phone_keep');
 perform pg_temp.denied(format($q$select public.crm_log_exchange(gen_random_uuid(),'{"lead_id":"%s","expected_version":%s,"channel":"phone","result":"wrong_number","corrected_phone":"06 12 34 56 03"}')$q$,l,pg_temp.v(l)),'22023','people.phone_unchanged');
 r:=public.crm_log_exchange(gen_random_uuid(),jsonb_build_object('lead_id',l,'expected_version',pg_temp.v(l),'channel','phone','result','wrong_number','corrected_phone','07 98 76 54 03'));
 perform pg_temp.ok((select phone_e164 from public.crm_contacts where id=c)='+212798765403','number corrected');
 perform pg_temp.one(l,'after correction');
 perform pg_temp.ok(r->'next_action'->>'task_type'='contact_attempt' and (select outreach_cycle from public.crm_leads where id=l)=cyc+1
  and (select attempt_ordinal from public.crm_tasks where lead_id=l and status='open')=1,'new call sequence on the new number');
 select * into a from public.crm_activities where lead_id=l and is_primary and details->>'command'='log_exchange' limit 1;
 perform pg_temp.ok(a.details->>'summary' like 'Mauvais numéro · numéro corrigé%' and a.details->'changes' @> '[{"after":"07 •• •• •• 03"}]','history entry: '||(a.details->>'summary'));
 perform pg_temp.ok(crm_security.failed_count((select x from public.crm_leads x where x.id=l))=0,'wrong number is not a failed attempt');
end $$;
-- 6b. The corrected number meets the same duplicate gate as a create (review of #217).
do $$ declare r jsonb; l uuid; c uuid; d text; begin
 r:=pg_temp.create('{"display_name":"Samira Fassi","phone":"0612345606","learner_name":"Reda Fassi"}');
 l:=pg_temp.lead(r); c:=(r->'lead'->>'contact_id')::uuid;
 d:=pg_temp.denied(format($q$select public.crm_log_exchange(gen_random_uuid(),'{"lead_id":"%s","expected_version":%s,"channel":"phone","result":"wrong_number","corrected_phone":"+212 6 12 34 56 01"}')$q$,l,pg_temp.v(l)),'PT409','people.possible_duplicate');
 perform pg_temp.ok(d::jsonb @> jsonb_build_array(jsonb_build_object('kind','prospect','id',(select id from ids where k='first'),'reason','phone')),'match reported: '||d);
 perform pg_temp.ok((select phone_e164 from public.crm_contacts where id=c)='+212612345606','nothing changed before the answers');
 r:=public.crm_log_exchange(gen_random_uuid(),jsonb_build_object('lead_id',l,'expected_version',pg_temp.v(l),'channel','phone','result','wrong_number','corrected_phone','+212 6 12 34 56 01',
  'acknowledged_matches',(select jsonb_agg(jsonb_build_object('kind',m->>'kind','id',m->>'id','decision','different_people')) from jsonb_array_elements(d::jsonb) m)));
 perform pg_temp.ok((select phone_e164 from public.crm_contacts where id=c)='+212612345601','number corrected after the answers');
 perform pg_temp.ok((select count(*) from public.person_match_decisions where (kind_a='prospect' and id_a=l) or (kind_b='prospect' and id_b=l))=jsonb_array_length(d::jsonb),'answers recorded');
 perform pg_temp.one(l,'after the gated correction');
end $$;
\echo PASS wrong number corrected in one step: number fixed, new call sequence, one history entry; a corrected number meets the duplicate gate

-- 7. find_people: one search for prospects and students, any phone format.
do $$ declare r jsonb; begin
 r:=public.find_people('06 12 34 56 01');
 perform pg_temp.ok((r->'rows') @> jsonb_build_array(jsonb_build_object('kind','prospect','id',(select id from ids where k='first'),'reason','phone')),'prospect by phone');
 r:=public.find_people('+212661000020');
 perform pg_temp.ok((r->'rows') @> '[{"kind":"student","id":"a7138000-0000-0000-0000-000000000020","reason":"phone"}]','student by phone');
 r:=public.find_people('amrani');
 perform pg_temp.ok((r->'rows') @> '[{"kind":"student","id":"a7138000-0000-0000-0000-000000000020"}]','student by name');
 r:=public.find_people('',p_phone=>'0661000020');
 perform pg_temp.ok((r->'strong') @> '[{"kind":"student","id":"a7138000-0000-0000-0000-000000000020"}]','strong match for a form');
 r:=public.find_people('Nadia');
 perform pg_temp.ok((select (x->>'siblings')::int from jsonb_array_elements(r->'rows') x where x->>'id'=(select id from ids where k='first')::text)>=2,'siblings counted');
 perform pg_temp.denied($q$select public.find_people(repeat('x',121))$q$,'22023');
 perform pg_temp.actor(1); perform public.find_people('Nadia'); perform pg_temp.actor(3);
end $$;
-- A teacher, parent or anonymous caller cannot search people.
insert into auth.users(id,email,aud,role,created_at,updated_at) values('a7138000-0000-0000-0000-000000000009','people-dup-teacher@example.invalid','authenticated','authenticated',now(),now());
update public.profiles set role='teacher' where id='a7138000-0000-0000-0000-000000000009';
do $$ begin
 perform set_config('request.jwt.claim.sub','a7138000-0000-0000-0000-000000000009',true);
 perform pg_temp.denied($q$select public.find_people('Nadia')$q$,'42501');
 perform pg_temp.denied($q$select public.crm_create_prospect(gen_random_uuid(),'{"display_name":"x","learner_name":"y","source_label":"z"}')$q$,'42501');
 perform pg_temp.actor(3);
end $$;
\echo PASS find_people: prospects and students, any phone format, staff only

-- 8. Student forms record their answers after the create.
do $$ begin
 insert into public.students(id,full_name,telephone,status,session_type) values('a7138000-0000-0000-0000-000000000021','Yanis Bennani','0612345601','Prospect','Yearly');
 -- the form answered every strong match find_people reported for this number
 perform pg_temp.ok(public.record_person_match_decisions('student','a7138000-0000-0000-0000-000000000021',
  (select jsonb_agg(jsonb_build_object('kind',m->>'kind','id',m->>'id','decision','same_family')) from jsonb_array_elements(public.find_people('',p_phone=>'0612345601')->'strong') m
   where m->>'id'<>'a7138000-0000-0000-0000-000000000021'))>=4,'student decisions recorded');
 perform pg_temp.denied($q$select public.record_person_match_decisions('student','a7138000-0000-0000-0000-000000000021','[{"kind":"student","id":"a7138000-0000-0000-0000-000000000021","decision":"different_people"}]')$q$,'22023');
end $$;
\echo PASS student decisions

-- 9. Invariant 7 (Q12 on this fixture): no two active people share a phone key
--    without a confirmed link (same contact, or a decided pair).
do $$ declare n integer; begin
 with people as (
  select 'prospect' kind,l.id,l.contact_id,public.phone_key(c.phone_e164) k from public.crm_leads l join public.crm_contacts c on c.id=l.contact_id
   where l.merged_into_lead_id is null and l.status in ('NEW','CONTACTING','ENGAGED','QUALIFIED') and c.phone_e164 is not null and not public.phone_is_placeholder(c.phone_e164)
  union all
  select 'student',s.id,null,public.phone_key(s.telephone) from public.students s
   where s.deleted_at is null and s.merged_into_student_id is null and public.phone_e164(s.telephone) is not null and not public.phone_is_placeholder(public.phone_e164(s.telephone))
 )
 select count(*) into n from people a join people b on a.k=b.k and (a.kind,a.id::text)<(b.kind,b.id::text)
 where (a.contact_id is null or a.contact_id is distinct from b.contact_id)
  and not exists(select 1 from public.person_match_decisions d,lateral (select crm_security.match_pair(a.kind,a.id,b.kind,b.id) p) x
   where d.kind_a=x.p[1] and d.id_a=x.p[2]::uuid and d.kind_b=x.p[3] and d.id_b=x.p[4]::uuid)
  and (a.id::text like 'a7138000-%' or b.id in (select id from ids) or a.id in (select id from ids));
 perform pg_temp.ok(n=0,'invariant 7: '||n||' unconfirmed shared phones');
end $$;
\echo PASS invariant 7 on the fixture

rollback;
