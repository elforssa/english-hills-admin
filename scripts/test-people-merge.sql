-- RWR-r5 PR B1 (§5.3, OD-8 = A « link, don't move »): prospect, contact and student
-- merges. A merge writes no enrollment, charge, receipt, attendance or level-test
-- row (row hashes before and after); unmerge restores the re-pointed links.
-- Local-only synthetic fixtures (invented numbers), fully rolled back.
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
 perform set_config('request.jwt.claim.sub','a8138000-0000-0000-0000-'||lpad(i::text,12,'0'),true);
end $$;
create function pg_temp.create(payload jsonb) returns uuid language sql as $$
 select (public.crm_create_prospect(gen_random_uuid(),jsonb_build_object('source_label','Manuel · Appel entrant')||payload)->'lead'->>'id')::uuid
$$;
create function pg_temp.v(lead uuid) returns bigint language sql as $$ select version from public.crm_leads where id=lead $$;
create function pg_temp.merge(src uuid,tgt uuid,k uuid default gen_random_uuid()) returns jsonb language sql as $$
 select public.crm_merge_prospects(k,src,tgt,pg_temp.v(src),pg_temp.v(tgt))
$$;
create function pg_temp.cv(c uuid) returns bigint language sql as $$ select version from public.crm_contacts where id=c $$;
create function pg_temp.su(p uuid) returns timestamptz language sql as $$ select updated_at from public.students where id=p $$;
-- Everything a merge must never write, for these students.
create function pg_temp.history(ids uuid[]) returns text language sql as $$
 select md5(concat_ws('|',
  (select string_agg(md5(e::text),',' order by e.id) from public.enrollments e where e.student_id=any(ids)),
  (select string_agg(md5(c::text),',' order by c.id) from public.charges c where c.student_id=any(ids)),
  (select string_agg(md5(r::text),',' order by r.id) from public.receipts r where r.student_id=any(ids)),
  (select string_agg(md5(a::text),',' order by a.id) from public.attendance a where a.student_id=any(ids)),
  (select string_agg(md5(p::text),',' order by p.id) from public.placement_tests p where p.student_id=any(ids))))
$$;
create function pg_temp.seed_enrollment(s uuid,st text,g uuid default null) returns uuid language plpgsql as $$
declare e uuid; begin
 perform set_config('eh.membership_sync','on',true),set_config('eh.enrollment_command','on',true);
 insert into public.enrollments(student_id,group_id,status,session_type,level,school_year,ended_at,end_reason)
 values(s,g,st,'Yearly','Child 1','2026/2027',case when st='Ended' then now()-interval '30 days' end,case when st='Ended' then 'Fin de parcours' end) returning id into e;
 perform set_config('eh.membership_sync','',true),set_config('eh.enrollment_command','',true);
 return e;
end $$;
create function pg_temp.pay(s uuid,e uuid default null) returns jsonb language sql as $$
 select public.create_charge_payment(jsonb_build_object('idempotency_key',gen_random_uuid(),'student_id',s,'session_type','Yearly','school_year','2026/2027',
  'level','Child 1','gross_amount',1000,'discount_amount',0,'payment_amount',400,'payment_method','Espèces')||case when e is null then '{}'::jsonb else jsonb_build_object('enrollment_id',e) end)
$$;

insert into auth.users(id,email,aud,role,created_at,updated_at)
select ('a8138000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'people-merge-'||i||'@example.invalid','authenticated','authenticated',now(),now() from generate_series(1,5)i;
update public.profiles set role=(array['director','admin','receptionist','parent','parent'])[right(id::text,1)::integer],full_name='Synthetic person '||right(id::text,1)
 where id::text like 'a8138000-%';
do $$ begin perform pg_temp.actor(1); end $$;
do $p$ begin perform public.crm_create_followup_policy(gen_random_uuid(),
 '{"weekly_hours":{"1":[["09:00","20:00"]],"2":[["09:00","20:00"]],"3":[["09:00","20:00"]],"4":[["09:00","20:00"]],"5":[["09:00","20:00"]],"6":[["09:00","20:00"]],"7":[["09:00","20:00"]]},
   "attempt_offsets":[0,0,1,3,5]}'); end $p$;
insert into public.groups(id,name,session_type,niveau,annee) values('a8138000-0000-0000-0000-000000000030','Merge group','Yearly','Child 1','2026-2027');
create temp table ids(k text primary key, id uuid);

-- 1. Prospect merge: link, don't move.
do $$ declare src uuid; tgt uuid; r jsonb; r2 jsonb; k uuid:=gen_random_uuid(); acts integer; vs bigint; vt bigint; begin
 perform pg_temp.actor(3);
 src:=pg_temp.create('{"display_name":"Merge source","phone":"0612340801","learner_name":"Ilyas Merge"}');
 tgt:=pg_temp.create('{"display_name":"Merge target","phone":"0612340802","learner_name":"Ilyas Merge B"}');
 perform public.crm_add_note(gen_random_uuid(),jsonb_build_object('lead_id',src,'expected_version',pg_temp.v(src),'note','Synthetic note on the source'));
 acts:=(select count(*) from public.crm_activities where lead_id=src);
 perform pg_temp.denied(format('select pg_temp.merge(%L,%L)',src,tgt),'42501');
 perform pg_temp.actor(1);
 vs:=pg_temp.v(src); vt:=pg_temp.v(tgt);
 r:=public.crm_merge_prospects(k,src,tgt,vs,vt);
 perform pg_temp.ok((select merged_into_lead_id from public.crm_leads where id=src)=tgt,'source linked to target');
 perform pg_temp.ok(not exists(select 1 from public.crm_tasks where lead_id=src and status='open'),'source holds no action');
 perform pg_temp.ok((select count(*) from public.crm_tasks where lead_id=tgt and status='open')=1,'target keeps its one action');
 perform pg_temp.ok((select cancellation_reason from public.crm_tasks where lead_id=src order by created_at desc,id desc limit 1)='Prospect fusionné','« Prospect fusionné »');
 perform pg_temp.ok((select count(*) from public.crm_activities where lead_id=src)>=acts and not exists(select 1 from public.crm_activities where lead_id=tgt and body='Synthetic note on the source'),
  'source history stays on the source');
 perform pg_temp.ok(exists(select 1 from jsonb_array_elements(public.crm_get_timeline(tgt,null,50,true)->'rows') x where x->>'merged_from'=src::text and x->>'body'='Synthetic note on the source'),
  'target timeline reads the source history');
 perform pg_temp.ok((public.crm_get_workspace_detail(tgt)->'merged_from') @> jsonb_build_array(jsonb_build_object('id',src)),'detail lists the merged prospect');
 perform pg_temp.ok((public.crm_get_workspace_detail(src)->>'merged_into_lead_id')=tgt::text,'detail of the source points to the target');
 r2:=public.crm_merge_prospects(k,src,tgt,vs,vt);
 perform pg_temp.ok(r2=r,'replay returns the first result');
 perform pg_temp.denied(format('select public.crm_merge_prospects(%L,%L,%L,%s,%s)',k,src,tgt,vs+1,vt),'22023');
 perform pg_temp.denied(format('select public.crm_merge_prospects(%L,%L,%L,1,1)',gen_random_uuid(),src,tgt),'22023','people.merge_already');
 perform pg_temp.ok(not exists(select 1 from jsonb_array_elements(public.crm_search_leads('Ilyas Merge')->'rows') x where x->>'id'=src::text),'merged prospect not listed');
 insert into ids values('tgt',tgt);
end $$;
\echo PASS prospect merge: source linked, no action left, history read on the target

-- Refusals: an appointment on the source; an enrolled source; a closed target.
do $$ declare a uuid; tgt uuid:=(select id from ids where k='tgt'); c uuid; n uuid; begin
 perform pg_temp.actor(3);
 a:=pg_temp.create('{"display_name":"Appointment source","phone":"0612340803","learner_name":"Appointment learner"}');
 perform public.crm_log_exchange(gen_random_uuid(),jsonb_build_object('lead_id',a,'expected_version',pg_temp.v(a),'channel','phone','result','spoke',
  'next',jsonb_build_object('task_type','center_visit','due_at',crm_security.window_at(crm_security.current_policy_id(),'opening',
   (((now() at time zone public.centre_utc_offset())::date+2)::timestamp+'11:00'::time) at time zone public.centre_utc_offset()),'with_test',true)));
 c:=pg_temp.create('{"display_name":"Closed target","phone":"0612340804","learner_name":"Closed learner"}');
 perform public.crm_close_prospect(gen_random_uuid(),jsonb_build_object('lead_id',c,'expected_version',pg_temp.v(c),'status','NOT_QUALIFIED','reason','duplicate'));
 n:=pg_temp.create('{"display_name":"Active source","phone":"0612340805","learner_name":"Active learner"}');
 perform pg_temp.actor(1);
 perform pg_temp.denied(format('select pg_temp.merge(%L,%L)',a,tgt),'22023','people.merge_source_appointment');
 perform pg_temp.denied(format('select pg_temp.merge(%L,%L)',n,c),'22023','people.merge_target_closed');
 perform pg_temp.denied(format('select pg_temp.merge(%L,%L)',n,n),'22023');
 perform pg_temp.merge(c,tgt);
 perform pg_temp.ok((select merged_into_lead_id from public.crm_leads where id=c)=tgt,'a closed prospect merges into an active one');
end $$;
\echo PASS prospect merge refusals: appointment on the source, closed target, same prospect

-- 2. Contact merge: two contacts entered for one family become one.
do $$ declare l1 uuid; l2 uuid; c1 uuid; c2 uuid; r jsonb; begin
 perform pg_temp.actor(3);
 l1:=pg_temp.create('{"display_name":"Maman Alaoui","phone":"0612340811","learner_name":"Aya Alaoui"}');
 l2:=pg_temp.create('{"display_name":"Mme Alaoui","phone":"0612340812","learner_name":"Ali Alaoui"}');
 c1:=(select contact_id from public.crm_leads where id=l1); c2:=(select contact_id from public.crm_leads where id=l2);
 perform pg_temp.denied(format('select public.crm_merge_contacts(%L,%L,%L,%s,%s)',gen_random_uuid(),c2,c1,pg_temp.cv(c2),pg_temp.cv(c1)),'42501');
 perform pg_temp.actor(2);
 -- Version-checked on both contacts (review of #217): a stale screen is refused, nothing moves.
 perform pg_temp.denied(format('select public.crm_merge_contacts(%L,%L,%L,%s,%s)',gen_random_uuid(),c2,c1,pg_temp.cv(c2)-1,pg_temp.cv(c1)),'PT409');
 perform pg_temp.denied(format('select public.crm_merge_contacts(%L,%L,%L,%s,%s)',gen_random_uuid(),c2,c1,pg_temp.cv(c2),pg_temp.cv(c1)+1),'PT409');
 perform pg_temp.ok((select contact_id from public.crm_leads where id=l2)=c2,'stale merge moved nothing');
 r:=public.crm_merge_contacts(gen_random_uuid(),c2,c1,pg_temp.cv(c2),pg_temp.cv(c1));
 perform pg_temp.ok((select contact_id from public.crm_leads where id=l2)=c1 and (select merged_into_contact_id from public.crm_contacts where id=c2)=c1,'one family contact');
 perform pg_temp.ok((r->>'moved_prospects')::int=1 and (select count(*) from public.crm_tasks where lead_id=l2 and status='open')=1,'prospect moved with its action');
 perform pg_temp.ok(exists(select 1 from public.crm_activities where lead_id=l2 and is_primary and details->>'command'='merge_contacts'),'history entry');
end $$;
\echo PASS contact merge: version-checked, one contact, prospects re-pointed with their action

-- 3. Student merge with history on both sides.
do $$ declare s uuid; t uuid; e uuid; l uuid; lc uuid; r jsonb; h text; bal numeric; st text; grp uuid; begin
 perform pg_temp.actor(1);
 insert into public.students(id,full_name,date_naissance,telephone,status,session_type,niveau_cefr) values
  ('a8138000-0000-0000-0000-000000000041','Merge duplicate','2014-02-02','0612340841','Prospect','Yearly','Child 1'),
  ('a8138000-0000-0000-0000-000000000042','Merge kept','2014-02-02','0612340842','Prospect','Yearly','Child 1');
 s:='a8138000-0000-0000-0000-000000000041'; t:='a8138000-0000-0000-0000-000000000042';
 -- A converted prospect on the source (enrolment start on a legacy enrollment, then payment).
 perform pg_temp.actor(3);
 lc:=pg_temp.create('{"display_name":"Converted parent","phone":"0612340843","learner_name":"Merge duplicate"}');
 e:=pg_temp.seed_enrollment(s,'Submitted');
 perform public.crm_log_exchange(gen_random_uuid(),jsonb_build_object('lead_id',lc,'expected_version',pg_temp.v(lc),'channel','phone','result','spoke','next',jsonb_build_object('enrol','{}'::jsonb)));
 perform public.crm_start_enrollment(gen_random_uuid(),jsonb_build_object('lead_id',lc,'expected_version',pg_temp.v(lc),'student_choice','existing','student_id',s,
  'session_type','Yearly','school_year','2026/2027','enrollment_id',e,'expected_enrollment_updated_at',(select updated_at from public.enrollments where id=e),
  'followup_at',null,'initial_status','Confirmed'));
 perform pg_temp.actor(2);
 perform pg_temp.pay(s,e);
 perform pg_temp.ok((select status from public.crm_leads where id=lc)='CONVERTED','converted prospect on the source');
 -- History on the target too; attendance and level tests on both; both leave (Ended).
 perform pg_temp.pay(t);
 -- Past attendance rows (history seeded as stored, the membership check off for the seed only).
 alter table public.attendance disable trigger enforce_attendance_integrity;
 insert into public.attendance(student_id,group_id,session_date,status) values
  (s,'a8138000-0000-0000-0000-000000000030',current_date-20,'Présent'),(t,'a8138000-0000-0000-0000-000000000030',current_date-20,'Absent');
 alter table public.attendance enable trigger enforce_attendance_integrity;
 insert into public.placement_tests(student_id,student_name,date_test,heure,status) values
  (s,'Merge duplicate',current_date-30,'10:00','Passé'),(t,'Merge kept',current_date-30,'11:00','Passé');
 perform pg_temp.actor(1);
 perform public.end_learner(s,pg_temp.su(s),'Alumni','Fin de parcours',null);
 perform public.end_learner(t,pg_temp.su(t),'Alumni','Fin de parcours',null);
 -- Links that move: an authorized adult, an unconverted prospect, a family link.
 insert into public.authorized_adults(id,student_id,full_name,telephone,relation) values('a8138000-0000-0000-0000-000000000051',s,'Merge adult','0612340851','Parent');
 perform pg_temp.actor(3);
 l:=pg_temp.create('{"display_name":"Linked parent","phone":"0612340852","learner_name":"Merge duplicate bis"}');
 update public.crm_leads set student_id=s where id=l;
 insert into public.family_links(id,student_id,relation,profile_id,invite_email,status,activated_at)
  values('a8138000-0000-0000-0000-000000000061',s,'parent','a8138000-0000-0000-0000-000000000004','people-merge-4@example.invalid','active',now());
 perform pg_temp.actor(1);
 -- The source still owes 600 on a partly paid charge: refused, also in the D5 plan
 -- (review of #217: its « Encaisser » would send the wrong student once merged).
 r:=public.student_merge_preview(s,t);
 perform pg_temp.ok(r->>'refusal'='people.merge_source_balance' and (r->>'source_open_balance')::numeric=600,'preview names the open balance: '||r::text);
 perform pg_temp.denied(format('select public.merge_students(%L,%L)',s,t),'22023','people.merge_source_balance');
 perform pg_temp.ok(crm_security.d5_plan(jsonb_build_array(jsonb_build_object('source',s,'target',t)))->0->>'refusal'='people.merge_source_balance','D5 plan reports the open balance');
 -- Settled on the same charge: the merge is accepted.
 perform pg_temp.actor(2);
 perform public.create_charge_payment(jsonb_build_object('idempotency_key',gen_random_uuid(),'student_id',s,
  'charge_id',(select id from public.charges where student_id=s and voided_at is null),'payment_amount',600,'payment_method','Espèces'));
 perform pg_temp.actor(1);
 perform pg_temp.ok((select coalesce(sum(balance),0) from public.charge_balances where student_id=s and voided_at is null)=0,'source settled');
 h:=pg_temp.history(array[s,t]);
 bal:=(select sum(balance) from public.charge_balances where student_id in (s,t) and voided_at is null);
 select status,groupe_id into st,grp from public.students where id=t;
 r:=public.student_merge_preview(s,t);
 perform pg_temp.ok(r->>'refusal' is null and (r->>'prospects')::int=1 and (r->>'prospects_kept')::int=1,'preview: '||r::text);
 perform pg_temp.actor(3);
 perform pg_temp.denied(format('select public.merge_students(%L,%L)',s,t),'42501');
 perform pg_temp.actor(1);
 r:=public.merge_students(s,t);
 perform pg_temp.ok(pg_temp.history(array[s,t])=h,'no enrollment, charge, receipt, attendance or test row changed');
 perform pg_temp.ok((select merged_into_student_id from public.students where id=s)=t,'source linked');
 perform pg_temp.ok(public.student_merge_set(t) @> array[s,t] and cardinality(public.student_merge_set(t))=2,'merge set');
 perform pg_temp.ok((select sum(balance) from public.charge_balances where student_id=any(public.student_merge_set(t)) and voided_at is null)=bal,'target balance = both');
 perform pg_temp.ok((select student_id from public.authorized_adults where id='a8138000-0000-0000-0000-000000000051')=t,'authorized adult re-pointed');
 perform pg_temp.ok((select student_id from public.family_links where id='a8138000-0000-0000-0000-000000000061')=t,'family link re-pointed');
 perform pg_temp.ok((select student_id from public.crm_leads where id=l)=t,'unconverted prospect re-pointed');
 perform pg_temp.ok((select student_id from public.crm_leads where id=lc)=s,'converted prospect stays on the source');
 perform pg_temp.ok((select (status,groupe_id) is not distinct from (st,grp) from public.students where id=t),'target status and group unchanged');
 perform pg_temp.ok(not ((public.search_students_page('Merge duplicate',p_status=>'all_shown')->'rows') @> jsonb_build_array(jsonb_build_object('id',s))),'source hidden from the list');
 perform pg_temp.ok(not ((public.find_people('Merge duplicate')->'rows') @> jsonb_build_array(jsonb_build_object('id',s))),'source hidden from the search');
 perform pg_temp.ok(not exists(select 1 from crm_security.student_candidates(l,'Merge duplicate',null) c where c.id=s)
  and exists(select 1 from crm_security.student_candidates(l,'Merge kept',null) c where c.id=t),'enrollment candidates offer the kept file, not the source');
 perform pg_temp.denied(format('select public.merge_students(%L,%L)',s,t),'22023','people.merge_already');
 -- Undo
 r:=public.unmerge_student(s);
 perform pg_temp.ok((r->>'restored')::int=3 and (select merged_into_student_id from public.students where id=s) is null,'unmerge: '||r::text);
 perform pg_temp.ok((select student_id from public.authorized_adults where id='a8138000-0000-0000-0000-000000000051')=s
  and (select student_id from public.family_links where id='a8138000-0000-0000-0000-000000000061')=s
  and (select student_id from public.crm_leads where id=l)=s,'links restored');
 perform pg_temp.ok(pg_temp.history(array[s,t])=h,'history untouched by the undo');
 perform pg_temp.denied(format('select public.unmerge_student(%L)',s),'22023','people.unmerge_not_merged');
end $$;
\echo PASS student merge: refused while the source owes (preview, D5 plan), then no history row changed, balance of both, links re-pointed, converted prospect kept, source out of lists and enrollment candidates, undo

-- 4. Direction: the student with a live enrollment (any status but Rejected and Ended) is the one kept.
do $$ declare st text; s uuid; t uuid; i integer:=0; begin
 perform pg_temp.actor(1);
 foreach st in array array['Confirmed','Trial','Submitted'] loop
  i:=i+1;
  s:=('a8138000-0000-0000-0000-0000000001'||i||'1')::uuid; t:=('a8138000-0000-0000-0000-0000000001'||i||'2')::uuid;
  insert into public.students(id,full_name,status,session_type,niveau_cefr) values(s,'Live '||st,'Enrolled','Yearly','Child 1'),(t,'Plain '||st,'Prospect','Yearly','Child 1');
  perform pg_temp.seed_enrollment(s,st,case when st='Trial' then 'a8138000-0000-0000-0000-000000000030'::uuid end);
  perform pg_temp.denied(format('select public.merge_students(%L,%L)',s,t),'22023','people.merge_direction');
  perform pg_temp.ok(public.student_merge_preview(s,t)->>'refusal'='people.merge_direction','preview names the direction ('||st||')');
  perform public.merge_students(t,s);
  perform pg_temp.ok((select merged_into_student_id from public.students where id=t)=s,'swapped merge accepted ('||st||')');
 end loop;
 -- Both live: refused.
 insert into public.students(id,full_name,status,session_type,niveau_cefr) values
  ('a8138000-0000-0000-0000-000000000201','Both live A','Enrolled','Yearly','Child 1'),('a8138000-0000-0000-0000-000000000202','Both live B','Enrolled','Yearly','Child 1');
 perform pg_temp.seed_enrollment('a8138000-0000-0000-0000-000000000201','Confirmed');
 perform pg_temp.seed_enrollment('a8138000-0000-0000-0000-000000000202','Submitted');
 perform pg_temp.denied($q$select public.merge_students('a8138000-0000-0000-0000-000000000201','a8138000-0000-0000-0000-000000000202')$q$,'22023','people.merge_both_live');
 -- Only Rejected and Ended on the source: merged as the source.
 insert into public.students(id,full_name,status,session_type,niveau_cefr) values
  ('a8138000-0000-0000-0000-000000000211','Old enrollments','Prospect','Yearly','Child 1'),('a8138000-0000-0000-0000-000000000212','Kept live','Enrolled','Yearly','Child 1');
 perform pg_temp.seed_enrollment('a8138000-0000-0000-0000-000000000211','Rejected');
 perform pg_temp.seed_enrollment('a8138000-0000-0000-0000-000000000211','Ended');
 perform pg_temp.seed_enrollment('a8138000-0000-0000-0000-000000000212','Confirmed');
 perform public.merge_students('a8138000-0000-0000-0000-000000000211','a8138000-0000-0000-0000-000000000212');
 -- Both with a portal access: refused.
 insert into public.students(id,full_name,status,session_type) values
  ('a8138000-0000-0000-0000-000000000221','Portal A','Prospect','Yearly'),('a8138000-0000-0000-0000-000000000222','Portal B','Prospect','Yearly');
 insert into public.family_links(student_id,relation,profile_id,invite_email,status,activated_at) values
  ('a8138000-0000-0000-0000-000000000221','parent','a8138000-0000-0000-0000-000000000004','people-merge-4@example.invalid','active',now()),
  ('a8138000-0000-0000-0000-000000000222','parent','a8138000-0000-0000-0000-000000000005','people-merge-5@example.invalid','active',now());
 perform pg_temp.denied($q$select public.merge_students('a8138000-0000-0000-0000-000000000221','a8138000-0000-0000-0000-000000000222')$q$,'22023','people.merge_both_portal');
end $$;
\echo PASS student merge direction: Confirmed, Trial and Submitted sources swapped; both live and both portal refused; Rejected/Ended source merged

-- 4b. Open balance on the merged-away file (review of #217): an unpaid charge refuses;
--     a voided charge and a charge on the kept file do not.
do $$ declare s uuid:='a8138000-0000-0000-0000-000000000231'; t uuid:='a8138000-0000-0000-0000-000000000232'; begin
 perform pg_temp.actor(1);
 insert into public.students(id,full_name,status,session_type) values(s,'Owes source','Prospect','Yearly'),(t,'Owes kept','Prospect','Yearly');
 insert into public.charges(id,student_id,session_type,school_year,service_description,plan_type,gross_amount,created_by) values
  ('a8138000-0000-0000-0000-000000000241',s,'Yearly','2026/2027','Yearly · 2026/2027','Standard',1200,'a8138000-0000-0000-0000-000000000002'),
  ('a8138000-0000-0000-0000-000000000242',t,'Yearly','2026/2027','Yearly · 2026/2027','Standard',900,'a8138000-0000-0000-0000-000000000002');
 perform pg_temp.denied(format('select public.merge_students(%L,%L)',s,t),'22023','people.merge_source_balance');
 perform pg_temp.ok((public.student_merge_preview(s,t)->>'source_open_balance')::numeric=1200,'unpaid charge counted');
 perform pg_temp.ok(public.student_merge_preview(t,s)->>'refusal'='people.merge_source_balance','the other direction is refused too while the kept file owes');
 update public.charges set voided_at=now(),voided_by='a8138000-0000-0000-0000-000000000002',void_reason='Synthetic void' where id='a8138000-0000-0000-0000-000000000241';
 perform pg_temp.ok(public.student_merge_preview(s,t)->>'refusal' is null and (public.student_merge_preview(s,t)->>'source_open_balance')::numeric=0,'a voided charge does not refuse');
 perform public.merge_students(s,t);
 perform pg_temp.ok((select merged_into_student_id from public.students where id=s)=t,'merged once the source owes nothing (the kept file may owe)');
end $$;
\echo PASS student merge: an unpaid charge on the merged-away file refuses; a voided one does not; the kept file may owe

-- 4c. Reservations (138, C1; rebase as 139): an open reservation refuses the student merge
--     of its learner even without a balance, and the prospect merge of its prospect whatever
--     its next action; a voided reservation charge does not.
do $$ declare s uuid:='a8138000-0000-0000-0000-000000000251'; t uuid:='a8138000-0000-0000-0000-000000000252';
 c uuid:='a8138000-0000-0000-0000-000000000261'; l uuid; l2 uuid; begin
 perform pg_temp.actor(3);
 l:=pg_temp.create('{"display_name":"Reserved parent","phone":"0612340861","learner_name":"Reserved child"}');
 l2:=pg_temp.create('{"display_name":"Reserved parent bis","phone":"0612340862","learner_name":"Reserved child bis"}');
 perform pg_temp.actor(1);
 insert into public.students(id,full_name,status,session_type) values(s,'Reserved source','Prospect','Yearly'),(t,'Reserved kept','Prospect','Yearly');
 -- Fully discounted: no balance, the reservation alone refuses.
 insert into public.charges(id,student_id,session_type,school_year,service_description,plan_type,gross_amount,discount_amount,created_by)
  values(c,s,'Yearly','2026/2027','Yearly · 2026/2027','Standard',800,800,'a8138000-0000-0000-0000-000000000002');
 insert into public.crm_charge_reservations(lead_id,charge_id,student_id,created_by,request_key) values(l,c,s,'a8138000-0000-0000-0000-000000000003',gen_random_uuid());
 perform pg_temp.ok((public.student_merge_preview(s,t)->>'source_open_balance')::numeric=0
  and (public.student_merge_preview(s,t)->>'source_open_reservations')::int=1
  and public.student_merge_preview(s,t)->>'refusal'='people.merge_source_balance','an open reservation refuses the student merge without a balance');
 perform pg_temp.denied(format('select public.merge_students(%L,%L)',s,t),'22023','people.merge_source_balance');
 perform pg_temp.ok(crm_security.d5_plan(jsonb_build_array(jsonb_build_object('source',s,'target',t)))->0->>'refusal'='people.merge_source_balance','D5 plan reports it');
 -- The reserving prospect's next action is a call (not an enrolment action): refused all the same.
 perform pg_temp.ok((select task_type from public.crm_tasks where id=crm_security.next_action_id(l))<>'enrollment_followup','next action is not the enrolment step');
 perform pg_temp.denied(format('select pg_temp.merge(%L,%L)',l,l2),'22023','people.merge_source_reservation');
 -- The other way round, the reserving prospect is the one kept: allowed.
 perform pg_temp.merge(l2,l);
 perform pg_temp.ok((select merged_into_lead_id from public.crm_leads where id=l2)=l,'merge into the reserving prospect');
 -- A voided reservation charge is no longer an open reservation.
 update public.charges set voided_at=now(),voided_by='a8138000-0000-0000-0000-000000000002',void_reason='Synthetic void' where id=c;
 perform pg_temp.ok(public.student_merge_preview(s,t)->>'refusal' is null,'voided: the student merge is allowed');
 perform public.merge_students(s,t);
end $$;
\echo PASS reservations: an open one refuses the student merge (no balance needed) and the prospect merge (any next action); a voided one does not

-- 5. D3 and D5 exist and are not run: no journal rows, plans read-only.
do $$ declare p jsonb; begin
 perform pg_temp.ok(not exists(select 1 from public.crm_data_step_journal where step in ('d3','d5')),'D3 and D5 not run');
 p:=crm_security.d3_plan();
 perform pg_temp.ok(p ? 'counts' and p ? 'samples','d3_plan shape');
 perform pg_temp.denied($q$select crm_security.d3_apply('{"counts":{}}')$q$,'22023','people.d3_counts');
 p:=crm_security.d5_plan('[{"source":"a8138000-0000-0000-0000-000000000201","target":"a8138000-0000-0000-0000-000000000202"}]');
 perform pg_temp.ok(p->0->>'refusal'='people.merge_both_live','d5_plan reports the refusal');
 perform pg_temp.denied(format('select crm_security.d5_apply(%L,%L)',
  '[{"source":"a8138000-0000-0000-0000-000000000201","target":"a8138000-0000-0000-0000-000000000202"}]',p),'22023','people.d5_refused');
end $$;
\echo PASS D3 and D5: plans only, apply refuses a plan that differs or holds a refusal

rollback;
