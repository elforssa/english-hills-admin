-- O3-r2 Batch 1: rollback-only bounded reads, exact predicates, roles and cursors.
\set ON_ERROR_STOP on
begin;
set local statement_timeout='45s';
create function pg_temp.ok(v boolean,label text) returns void language plpgsql as $$ begin if v is not true then raise exception 'FAIL %',label; end if; end $$;
create function pg_temp.denied(s text,code text default '22023') returns void language plpgsql as $$ begin
 begin execute s; exception when others then if sqlstate=code then return; end if; raise; end; raise exception 'Unexpected success: %',s; end $$;
insert into auth.users(id,email,aud,role) select ('a3000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'o3-'||i||'@example.invalid','authenticated','authenticated' from generate_series(1,7)i;
update public.profiles set role=(array['director','admin','receptionist','teacher','parent','student','pending'])[right(id::text,1)::integer] where id::text like 'a3000000-%';
set local request.jwt.claim.sub='a3000000-0000-0000-0000-000000000001';
create temp table policy as select (public.crm_create_followup_policy(gen_random_uuid(),'{"weekly_hours":{"1":[["09:00","20:00"]],"2":[["09:00","20:00"]],"3":[["09:00","20:00"]],"4":[["09:00","20:00"]],"5":[["09:00","20:00"]],"6":[["09:00","20:00"]],"7":[["09:00","20:00"]]}}')->>'policy_id')::uuid id;
create temp table fixture as select i,gen_random_uuid() lead,gen_random_uuid() first_touch,gen_random_uuid() last_touch from generate_series(1,10000)i;
create temp table parents as select i,gen_random_uuid() id from generate_series(1,5000)i;
insert into public.crm_contacts(id,contact_kind,display_name,phone_e164) select id,'guardian','O3 synthetic parent '||i,'+2126'||lpad(i::text,8,'0') from parents;
insert into public.crm_leads(id,contact_id,learner_name,learner_name_normalized,session_type,program_interest_text,status,first_submission_id,latest_submission_id,followup_policy_id,created_at,owner_id,closure_reason,closed_at)
select f.lead,p.id,'O3 learner '||f.i,'o3 learner '||f.i,case when f.i%3=0 then 'Yearly' end,case when f.i%3=1 then 'English' end,
 case when f.i<=5000 then 'NEW' when f.i<=6000 then 'CONTACTING' when f.i<=7000 then 'ENGAGED' when f.i<=8000 then 'QUALIFIED' when f.i<=9000 then 'LOST' else 'NOT_QUALIFIED' end,
 f.first_touch,f.last_touch,(select id from policy),case when f.i%2=0 then now() else now()-interval '10 days' end,
 case when f.i%3=0 then 'a3000000-0000-0000-0000-000000000003'::uuid when f.i%3=1 then 'a3000000-0000-0000-0000-000000000002'::uuid end,
 case when f.i>9000 then 'outside_scope' when f.i>8000 then 'price' end,case when f.i>8000 then now() end
from fixture f join parents p on p.i=(f.i+1)/2;
insert into public.crm_submissions(id,lead_id,channel,received_at,occurred_at,time_source,core_fields,form_answers,source_label,match_status,payload_hash,resolved_at)
select first_touch,lead,(array['manual','website','meta_instant_form'])[1+i%3],now(),now(),'server','{}'::jsonb,'[]'::jsonb,'O3 first '||i%3,'resolved',repeat('a',64),now() from fixture
union all select last_touch,lead,'website',now(),now(),'server','{}'::jsonb,'[]'::jsonb,'O3 latest','resolved',repeat('b',64),now() from fixture;
insert into public.crm_submission_attribution(submission_id,provider,attribution_status,campaign_name_snapshot) select first_touch,'meta','partial','Synthetic technical secret' from fixture;
insert into public.crm_tasks(lead_id,task_type,due_at,source_kind,source_key,status,cancelled_at,cancellation_reason)
select f.lead,case when f.i<=5000 then 'first_contact' else 'callback' end,now()+make_interval(days=>case when f.i%3=0 then -1 when f.i%3=1 then 0 else 2 end),
 'manual',f.lead||':o3-task:'||g,case when g=0 and f.i<=8000 then 'open' else 'cancelled' end,
 case when g>0 or f.i>8000 then now() end,case when g>0 or f.i>8000 then 'Synthetic historical cancellation' end from fixture f cross join generate_series(0,4)g;
insert into public.crm_activities(lead_id,occurred_at,actor_kind,event_type,source_key,body)
select lead,now()-make_interval(secs=>g),'system','note_added',lead||':o3-history:'||g,'Synthetic history' from fixture f cross join generate_series(1,2)g;
insert into public.crm_activities(lead_id,occurred_at,actor_kind,event_type,source_key,body)
select lead,now()-make_interval(secs=>g),'system','note_added',lead||':long-history:'||g,'Synthetic long history' from fixture f cross join generate_series(1,10050)g where f.i=1;
insert into public.crm_activities(lead_id,occurred_at,actor_kind,event_type,channel,outcome,outreach_cycle,attempt_ordinal,source_key)
select lead,now(),'system','contact_attempted','phone','no_answer',1,1,lead||':failed' from fixture where i%4=0 and i<=8000;
insert into public.placement_tests(student_name,date_test,heure,status,crm_lead_id) select 'O3 learner '||i,current_date+1,'10:00','Planifié',lead from fixture where i between 7001 and 7120;
analyze public.crm_leads; analyze public.crm_submissions; analyze public.crm_contacts; analyze public.crm_tasks; analyze public.crm_activities; analyze public.placement_tests;
set local request.jwt.claim.sub='a3000000-0000-0000-0000-000000000003';
do $$ declare r jsonb; b jsonb; c jsonb; l uuid:=(select lead from fixture f where f.i=1); v text; n bigint; seen uuid[]:=array[]::uuid[]; ids uuid[]; i int; begin
 raise notice 'starting Board';
 r:=public.crm_get_opportunities();
 raise notice 'Board complete';
 perform pg_temp.ok((r->>'total')::int=10000 and (r->'counts'->>'LOST')::int=1000,'all counts include closures');
 perform pg_temp.ok((select count(*) from jsonb_object_keys(r->'pages'))=5,'five board columns');
 perform pg_temp.ok((select sum(jsonb_array_length(value->'rows')) from jsonb_each(r->'pages'))<=125,'bounded initial board');
 perform pg_temp.ok(not ((r->'pages'->'NEW'->'rows'->0) ?| array['phone','email','notes','conversion_review_required','campaign_id']),'compact projection');
 b:=public.crm_get_opportunities(p_layout=>'list');perform pg_temp.ok(r->'counts'=b->'counts','board/list same counts');
 raise notice 'starting Views';
 for v,n in select * from (values ('all',10000),('mine',3333),('new_today',5000),('qualified',1000),('closed',2000),('no_response',2000),('placement',120))x(v,n) loop
  raise notice 'View % at %',v,clock_timestamp(); r:=public.crm_get_opportunities(p_view=>v,p_layout=>'list');perform pg_temp.ok((r->>'total')::bigint=n,'view '||v);
 end loop;
 r:=public.crm_get_opportunities(p_view=>'attention',p_layout=>'list');
 perform pg_temp.ok((r->>'total')::int=(public.crm_get_today()->>'attention_total')::int,'attention matches current 083 semantics');
 r:=public.crm_get_opportunities(p_view=>'follow_up_today',p_layout=>'list');
 perform pg_temp.ok((r->>'total')::int=(select count(distinct t.lead_id) from public.crm_tasks t join public.crm_leads l on l.id=t.lead_id where t.status='open' and l.status in ('NEW','CONTACTING','ENGAGED','QUALIFIED') and t.due_at>=((now() at time zone 'Africa/Casablanca')::date)::timestamp at time zone 'Africa/Casablanca' and t.due_at<(((now() at time zone 'Africa/Casablanca')::date)+1)::timestamp at time zone 'Africa/Casablanca'),'follow-up includes today only');
 perform pg_temp.ok((public.crm_get_opportunities(p_view=>'mine',p_owner_mode=>'staff',p_owner=>'a3000000-0000-0000-0000-000000000002')->>'total')::int=0,'mine AND other owner zero');
 perform pg_temp.ok((public.crm_get_opportunities(p_owner_mode=>'unassigned')->>'total')::int=3333,'unassigned owner');
 perform pg_temp.ok((public.crm_get_opportunities(p_channel=>'website')->>'total')::int=3334,'first channel exact filter');
 perform pg_temp.ok((public.crm_get_opportunities(p_channel=>'website',p_source_label=>'O3 first 0')->>'total')::int=0,'channel AND source zero intersection');
 perform pg_temp.ok((public.crm_get_opportunities(p_source_label=>'O3 latest')->>'total')::int=0,'first source not latest');
 perform pg_temp.ok((public.crm_get_opportunities(p_program_kind=>'unspecified')->>'total')::int=3333,'unspecified program');
 perform pg_temp.ok((public.crm_get_opportunities(p_program_kind=>'interest',p_program=>'English')->>'total')::int=3334,'exact fallback interest');
 perform pg_temp.ok((public.crm_get_opportunities(p_contact=>(select contact_id from public.crm_leads where id=l))->>'total')::int=2,'siblings share contact not opportunity');
 update public.crm_leads set learner_name=null,learner_name_normalized=null,learner_age=null where id=l;
 r:=public.crm_get_opportunities(p_contact=>(select contact_id from public.crm_leads where id=l),p_layout=>'list');
 perform pg_temp.ok(exists(select 1 from jsonb_array_elements(r->'pages'->'list'->'rows')x where x->>'id'=l::text and x->'learner_name'='null'::jsonb and x->'learner_age'='null'::jsonb and x->>'contact_name'='O3 synthetic parent 1'),'unnamed learner retains null identity and age, not adult identity');
 r:=public.crm_get_opportunities(p_layout=>'list',p_limit=>7);c:=r->'pages'->'list'->'next_cursor';
 b:=public.crm_get_opportunities(p_layout=>'list',p_limit=>7,p_cursor=>c);
 perform pg_temp.ok(not exists(select 1 from jsonb_array_elements(r->'pages'->'list'->'rows')x join jsonb_array_elements(b->'pages'->'list'->'rows')y on x->>'id'=y->>'id'),'cursor pages disjoint');
 perform pg_temp.denied(format('select public.crm_get_opportunities(p_view=>''mine'',p_layout=>''list'',p_cursor=>%L::jsonb)',c::text));
 perform pg_temp.denied('select public.crm_get_opportunities(p_view=>''unknown'')');
 perform pg_temp.denied('select public.crm_get_opportunities(p_limit=>26)');
 perform pg_temp.denied('select public.crm_get_opportunities(p_owner_mode=>null)');
 perform pg_temp.denied('select public.crm_get_opportunities(p_view=>''closed'')');
 perform pg_temp.denied('select public.crm_get_opportunities(p_cursor=>''{}'')');
 perform pg_temp.denied('select public.crm_get_timeline(null)');
 perform pg_temp.denied('select public.crm_get_operational_acquisition_summary(null)');
 update public.crm_leads set conversion_review_required=true where id=l;
 r:=public.crm_get_operational_acquisition_summary(l);
 perform pg_temp.ok((select array_agg(k order by k) from jsonb_object_keys(r)k)=array['first_inquiry','latest_inquiry'],'exact acquisition envelope flagged fixture');
 perform pg_temp.ok((select array_agg(k order by k) from jsonb_object_keys(r->'first_inquiry')k)=array['channel','occurred_at','source_label'] and (select array_agg(k order by k) from jsonb_object_keys(r->'latest_inquiry')k)=array['channel','occurred_at','source_label'],'six allowed inquiry values only');
 perform pg_temp.ok(not (public.crm_get_workspace_detail(l)->>'conversion_review_required')::boolean,'workspace masks flag');
 perform pg_temp.denied(format('select public.crm_get_submission_attribution(%L)',(select first_touch from fixture f where f.i=1)),'42501');
 perform set_config('request.jwt.claim.sub','a3000000-0000-0000-0000-000000000001',true);
 perform pg_temp.ok((public.crm_get_lead_detail(l)->>'conversion_review_required')::boolean,'director true flag retained');
 perform pg_temp.ok(public.crm_get_submission_attribution((select first_touch from fixture f where f.i=1)) is not null,'director attribution unchanged');
 raise notice 'timeline traversal'; r:=public.crm_get_timeline(l,p_limit=>50);i:=0;
 loop
  select array_agg((x->>'id')::uuid) into ids from jsonb_array_elements(r->'rows')x;
  perform pg_temp.ok(not seen && coalesce(ids,array[]::uuid[]),'timeline no repeats'); seen:=seen||coalesce(ids,array[]::uuid[]);i:=i+1;
  exit when not (r->>'has_more')::boolean;
  r:=public.crm_get_timeline(l,r->'next_cursor',50);
 end loop;
 perform pg_temp.ok(cardinality(seen)=10052 and i>200,'history accessible beyond old offset 10k');
 r:=public.crm_get_opportunity_filter_options('source',p_limit=>1);perform pg_temp.ok(jsonb_array_length(r->'rows')=1 and (r->>'has_more')::boolean,'bounded facets');
 b:=public.crm_get_opportunity_filter_options('source',p_cursor=>r->'next_cursor',p_limit=>1);perform pg_temp.ok(r->'rows'<>b->'rows','facet cursor continuation');
 perform pg_temp.denied(format('select public.crm_get_opportunity_filter_options(''program'',p_cursor=>%L::jsonb)',r->'next_cursor'));
 for i in 4..7 loop
  perform set_config('request.jwt.claim.sub','a3000000-0000-0000-0000-'||lpad(i::text,12,'0'),true);
  perform pg_temp.denied('select public.crm_get_opportunities()','42501');
  perform pg_temp.denied('select public.crm_get_opportunity_filter_options(''source'')','42501');
  perform pg_temp.denied(format('select public.crm_get_timeline(%L)',l),'42501');
  perform pg_temp.denied(format('select public.crm_get_operational_acquisition_summary(%L)',l),'42501');
 end loop;
end $$;
rollback;
\echo PASS O3-r2 bounded reads, exact Views, acquisition shape, director regression, cursor and role denial
