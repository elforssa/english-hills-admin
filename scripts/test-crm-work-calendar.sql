-- A14–A19. The harness supplies the rollback-only synthetic fixture.
do $$ declare r jsonb; b jsonb; c jsonb; v text; n bigint; bounds record;
 seen uuid[]:=array[]::uuid[]; ids uuid[]; keys text[]:=array[]::text[]; page_keys text[]; i integer;
 appointment uuid; scheduling_day date; future_found boolean:=false;
 day date:=(now() at time zone 'Africa/Casablanca')::date; stamp timestamptz;
begin
 perform set_config('request.jwt.claim.sub','a3000000-0000-0000-0000-000000000003',true);
 r:=public.crm_get_work_queue(p_assignee_mode=>'all');
 perform pg_temp.ok(r->>'timezone'='Africa/Casablanca' and (r->>'as_of')::timestamptz=now(),'server as_of and timezone');
 select * into bounds from crm_security.work_boundaries(now());
 perform pg_temp.ok(r->'boundaries'->>'d1'=to_jsonb(bounds.d1)#>>'{}','server independent midnights');
 for v in select unnest(array['overdue','today','tomorrow','upcoming']) loop
  b:=public.crm_get_work_queue(p_bucket=>v,p_assignee_mode=>'all');
  select count(*) into n from public.crm_tasks t join public.crm_leads l on l.id=t.lead_id where t.status='open' and l.status in ('NEW','CONTACTING','ENGAGED','QUALIFIED') and l.merged_into_lead_id is null
   and case v when 'overdue' then t.due_at<now() when 'today' then t.due_at>=now() and t.due_at<bounds.d1 when 'tomorrow' then t.due_at>=bounds.d1 and t.due_at<bounds.d2 else t.due_at>=bounds.d2 end;
  perform pg_temp.ok((b->'counts'->>v)::bigint=n and jsonb_array_length(b->'rows')<=25,'exact bucket count and page '||v);
  perform pg_temp.ok(b->'counts'=r->'counts','counts share predicates across buckets');
 end loop;
 perform pg_temp.ok((select sum(value::bigint) from jsonb_each_text(r->'counts'))=(select count(*) from public.crm_tasks t join public.crm_leads l on l.id=t.lead_id where t.status='open' and l.status in ('NEW','CONTACTING','ENGAGED','QUALIFIED') and l.merged_into_lead_id is null),'bucket partition exhaustive');
 -- Real public-read edge fixtures: exactly as_of, D1, D2 and earlier today.
 insert into public.crm_tasks(lead_id,task_type,due_at,assigned_to,source_kind,source_key)
 select (select f.lead from fixture f where f.i=2),'callback',edge,'a3000000-0000-0000-0000-000000000002','manual','boundary:'||ordinal
 from unnest(array[now()-interval '1 second',now(),bounds.d1,bounds.d2]) with ordinality x(edge,ordinal);
 b:=public.crm_get_work_queue(p_assignee_mode=>'staff',p_assignee=>'a3000000-0000-0000-0000-000000000002',p_owner_mode=>'unassigned');
 perform pg_temp.ok(b->'counts'='{"overdue":1,"today":1,"tomorrow":1,"upcoming":1}'::jsonb,'real read half-open boundaries and overdue earlier today');
 delete from public.crm_tasks where source_key like 'boundary:%';
 -- SQL is the timezone oracle, independent of Node/browser ICU and host TZ.
 for stamp in select unnest(array['2026-02-15 00:00+01'::timestamptz,'2026-03-22 00:00+00'::timestamptz]) loop
  select * into bounds from crm_security.work_boundaries(stamp);
  perform pg_temp.ok((bounds.d0 at time zone 'Africa/Casablanca')::time='00:00' and (bounds.d1 at time zone 'Africa/Casablanca')::time='00:00' and (bounds.d2 at time zone 'Africa/Casablanca')::time='00:00','midnights around offset transition');
  perform pg_temp.ok(extract(epoch from bounds.d1-bounds.d0) in (82800,90000),'23/25 hour Casablanca day');
 end loop;
 r:=public.crm_get_work_queue();
 perform pg_temp.ok(not exists(select 1 from jsonb_array_elements(r->'rows')x where x->>'assigned_to'<>'a3000000-0000-0000-0000-000000000003'),'default task assignee me');
 r:=public.crm_get_work_queue(p_assignee_mode=>'me',p_owner_mode=>'me');
 perform pg_temp.ok((select sum(value::bigint) from jsonb_each_text(r->'counts'))=0,'assignee AND owner, no fallback');
 r:=public.crm_get_work_queue(p_assignee_mode=>'unassigned',p_owner_mode=>'unassigned');
 perform pg_temp.ok(not exists(select 1 from jsonb_array_elements(r->'rows')x where x->'assigned_to'<>'null'::jsonb or x->'lead'->'owner_id'<>'null'::jsonb),'unassigned task AND owner');
 r:=public.crm_get_work_queue(p_assignee_mode=>'staff',p_assignee=>'a3000000-0000-0000-0000-000000000002',p_owner_mode=>'me');
 perform pg_temp.ok(jsonb_array_length(r->'rows')>0,'specific staff with separate owner');
 -- Drain a bounded subset to prove stable ordering/tie-breaking, then reset.
 r:=public.crm_get_work_queue(p_bucket=>'overdue',p_assignee_mode=>'all',p_limit=>7);
 c:=r->'next_cursor';b:=public.crm_get_work_queue(p_bucket=>'overdue',p_assignee_mode=>'all',p_limit=>7,p_cursor=>c);
 perform pg_temp.ok(not exists(select 1 from jsonb_array_elements(r->'rows')x join jsonb_array_elements(b->'rows')y on x->>'id'=y->>'id'),'task cursor disjoint');
 perform pg_temp.ok((r->'rows'->6->>'due_at',r->'rows'->6->>'id')<(b->'rows'->0->>'due_at',b->'rows'->0->>'id'),'due then ID ascending');
 perform pg_temp.denied(format('select public.crm_get_work_queue(p_cursor=>%L::jsonb)',c));
 perform pg_temp.denied(format('select public.crm_get_work_queue(p_bucket=>''tomorrow'',p_assignee_mode=>''all'',p_cursor=>%L::jsonb)',c));
 perform pg_temp.denied('select public.crm_get_work_queue(p_bucket=>''invalid'')');
 perform pg_temp.denied('select public.crm_get_work_queue(p_assignee_mode=>null)');
 perform pg_temp.denied('select public.crm_get_work_queue(p_assignee_mode=>''staff'')');
 perform pg_temp.denied('select public.crm_get_work_queue(p_owner_mode=>''staff'')');
 perform pg_temp.denied('select public.crm_get_work_queue(p_limit=>51)');
 perform pg_temp.denied('select public.crm_get_work_queue(p_cursor=>''{"v":1}'')');
 perform pg_temp.ok((select count(distinct task_type)=8 from public.crm_tasks where status='open'),'eight task types in fixture');
 -- Exact fixed shape, no technical attribution, notes, scores or finance.
 perform pg_temp.ok((select array_agg(k order by k) from jsonb_object_keys(r->'rows'->0)k)=array['assigned_to','assignee_display_label','assignee_name','attempt_ordinal','due_at','id','lead','lead_id','local_date','local_time','scheduled_end_at','task_type','version'],'fixed task projection');
 perform pg_temp.ok((select array_agg(k order by k) from jsonb_object_keys(r->'rows'->0->'lead')k)=array['contact_name','id','learner_name','owner_display_label','owner_id','owner_name','program','status','version'],'fixed lead projection');
 r:=public.crm_get_admissions_calendar(day,day+7);i:=0;
 loop
  perform pg_temp.ok(jsonb_array_length(r->'rows')<=100,'bounded agenda');
  select array_agg(x->>'kind'||':'||(x->>'id')) into page_keys from jsonb_array_elements(r->'rows')x;
  perform pg_temp.ok(not keys&&coalesce(page_keys,array[]::text[]),'calendar cursor stable identity no duplicates');keys:=keys||coalesce(page_keys,array[]::text[]);i:=i+1;
  exit when not (r->>'has_more')::boolean;
  r:=public.crm_get_admissions_calendar(day,day+7,p_cursor=>r->'next_cursor');
 end loop;
 perform pg_temp.ok(i>1,'calendar continuation beyond 100');
 select count(*) into n from public.placement_tests p where p.date_test>=day and p.date_test<day+7 and p.status='Planifié';
 select n+count(*) into n from public.crm_tasks t join public.crm_leads l on l.id=t.lead_id where t.task_type='center_visit' and t.status='open' and l.merged_into_lead_id is null and l.status in ('NEW','CONTACTING','ENGAGED','QUALIFIED') and t.due_at>=day::timestamp at time zone 'Africa/Casablanca' and t.due_at<(day+7)::timestamp at time zone 'Africa/Casablanca';
 perform pg_temp.ok(cardinality(keys)=n,'exact sources, no preparation/result/callback appointments');
 r:=public.crm_get_admissions_calendar(day,day+7,p_kind=>'placement',p_include_completed=>true);
 perform pg_temp.ok((select array_agg(k order by k) from jsonb_object_keys(r->'rows'->0)k)=array['assigned_to','assignee_name','display_name','end_local_date','end_local_time','ends_at','examiner_label','id','kind','lead_id','local_date','local_time','placement_status','stage','starts_at','student_id','task_type','task_version','updated_at'],'fixed event projection');
 perform pg_temp.ok(exists(select 1 from jsonb_array_elements(r->'rows')x where x->>'placement_status'<>'Planifié'),'completed toggle');
 perform pg_temp.ok(exists(select 1 from jsonb_array_elements(r->'rows')x where x->'starts_at'='null'::jsonb and x->'local_time'='null'::jsonb),'truthful unspecified lane');
 perform pg_temp.ok(not exists(select 1 from jsonb_array_elements(r->'rows')x where x->'ends_at'<>'null'::jsonb),'no invented placement duration');
 b:=public.crm_get_admissions_calendar(day,day+1,p_kind=>'center_visit');
 perform pg_temp.ok(exists(select 1 from jsonb_array_elements(b->'rows')x where x->'ends_at'<>'null'::jsonb and (x->>'ends_at')::timestamptz>(x->>'starts_at')::timestamptz),'genuine visit duration preserved');
 b:=public.crm_get_admissions_calendar(day+1,day+2,p_kind=>'placement');
 perform pg_temp.ok(exists(select 1 from jsonb_array_elements(b->'rows')x where x->>'display_name'='Closed synthetic appointment' and x->>'stage'='LOST'),'closed planned appointment stays visible');
 perform pg_temp.ok(not exists(select 1 from jsonb_array_elements(b->'rows')x where (x->>'local_date')::date<>day+1),'exclusive end date');
 c:=public.crm_get_admissions_calendar(day,day+7,p_limit=>1)->'next_cursor';
 perform pg_temp.denied(format('select public.crm_get_admissions_calendar(%L,%L,p_include_completed=>true,p_cursor=>%L::jsonb)',day,day+7,c));
 perform pg_temp.denied(format('select public.crm_get_admissions_calendar(%L,%L,p_kind=>''placement'',p_cursor=>%L::jsonb)',day,day+7,c));
 perform pg_temp.denied('select public.crm_get_admissions_calendar(null,current_date)');
 perform pg_temp.denied('select public.crm_get_admissions_calendar(current_date,current_date+43)');
 perform pg_temp.denied('select public.crm_get_admissions_calendar(current_date,current_date)');
 perform pg_temp.denied('select public.crm_get_admissions_calendar(current_date,current_date+1,p_include_completed=>null)');
 perform pg_temp.denied('select public.crm_get_admissions_calendar(current_date,current_date+1,p_kind=>''callback'')');
 perform pg_temp.denied('select public.crm_get_admissions_calendar(current_date,current_date+1,p_limit=>101)');
 perform pg_temp.denied('select public.crm_get_admissions_calendar(current_date,current_date+1,p_cursor=>''{}'')');
 for i in 4..7 loop
  perform set_config('request.jwt.claim.sub','a3000000-0000-0000-0000-'||lpad(i::text,12,'0'),true);
  perform pg_temp.denied('select public.crm_get_work_queue()','42501');
  perform pg_temp.denied('select public.crm_get_admissions_calendar(current_date,current_date+1)','42501');
 end loop;
 for v in select unnest(array['anon','service_role']) loop
  perform pg_temp.ok(not has_function_privilege(v,'public.crm_get_work_queue(text,text,uuid,text,uuid,jsonb,integer)','EXECUTE'),'forbidden execute work '||v);
  perform pg_temp.ok(not has_function_privilege(v,'public.crm_get_admissions_calendar(date,date,text,boolean,jsonb,integer)','EXECUTE'),'forbidden execute calendar '||v);
 end loop;
 perform pg_temp.ok(not has_function_privilege('authenticated','crm_security.work_boundaries(timestamptz)','EXECUTE') and not has_function_privilege('authenticated','crm_security.calendar_time(text)','EXECUTE'),'helpers private');
 -- Legacy text must never establish a guessed midnight or crash membership.
 perform set_config('request.jwt.claim.sub','a3000000-0000-0000-0000-000000000003',true);
 perform pg_temp.ok(exists(select 1 from public.placement_tests where crm_lead_id is null and heure='invalid')
  and exists(select 1 from public.placement_tests where crm_lead_id is null and heure is null),'unrelated malformed and missing legacy rows actually present');
 b:=public.crm_get_opportunities(p_view=>'attention',p_contact=>(select contact_id from public.crm_leads where id=(select f.lead from fixture f where f.i=4)),p_layout=>'list');
 perform pg_temp.ok(exists(select 1 from jsonb_array_elements(b->'pages'->'list'->'rows')x where x->>'id'=(select f.lead::text from fixture f where f.i=4)),'unrelated malformed legacy time cannot crash public Opportunities');
 perform pg_temp.ok(not exists(select 1 from unnest(array[null,'','invalid','25:61','24:00'])x where crm_security.calendar_time(x) is not null),'missing and malformed never guessed as midnight');
 perform pg_temp.ok(crm_security.calendar_time('00:00')='00:00'::time and crm_security.calendar_time(' 10:30:15.123456 ')='10:30:15.123456'::time,'known midnight and canonical valid time preserved');
 -- Public Calendar projection uses the same parser across Casablanca transitions.
 for scheduling_day in select unnest(array['2026-02-15'::date,'2026-03-22'::date]) loop
  insert into public.placement_tests(student_name,date_test,heure,status)
  select 'Safe-time regression',scheduling_day,x,'Planifié' from unnest(array[null,'','invalid','25:61','10:30'])x;
  r:=public.crm_get_admissions_calendar(scheduling_day,scheduling_day+1,p_kind=>'placement');
  perform pg_temp.ok((select count(*) from jsonb_array_elements(r->'rows')x where x->>'display_name'='Safe-time regression' and x->'local_time'='null'::jsonb and x->'starts_at'='null'::jsonb)=4,'each unknown time remains truthful Calendar Time unspecified');
  perform pg_temp.ok(exists(select 1 from jsonb_array_elements(r->'rows')x where x->>'display_name'='Safe-time regression' and (x->>'local_time')::time='10:30'::time
   and (x->>'starts_at')::timestamptz=(scheduling_day+'10:30'::time) at time zone 'Africa/Casablanca'
   and (x->>'starts_at')::timestamptz=case scheduling_day when '2026-02-15'::date then '2026-02-15 10:30+00'::timestamptz else '2026-03-22 09:30+00'::timestamptz end),'valid Casablanca appointment unchanged across offsets');
 end loop;
 -- Cross-surface regression remains mandatory after the new-read assertions.
 raise notice 'PASS new work/calendar read assertions; required Needs Attention regression follows';
 perform set_config('request.jwt.claim.sub','a3000000-0000-0000-0000-000000000003',true);
 b:=public.crm_get_opportunities(p_view=>'attention',p_contact=>(select contact_id from public.crm_leads where id=(select f.lead from fixture f where f.i=4)),p_layout=>'list');
 perform pg_temp.ok(exists(select 1 from jsonb_array_elements(b->'pages'->'list'->'rows')x where x->>'id'=(select f.lead::text from fixture f where f.i=4) and x->'next_task'='null'::jsonb and (x->>'failed_attempts')::int=5),'taskless exhausted prospect attention retained');
 -- A real, known future placement still suppresses the taskless condition.
 insert into public.placement_tests(student_name,date_test,heure,status,crm_lead_id)
 select 'Known future regression',day+1,'13:15','Planifié',f.lead from fixture f where f.i=4 returning id into appointment;
 b:=public.crm_get_opportunities(p_view=>'attention',p_contact=>(select contact_id from public.crm_leads where id=(select f.lead from fixture f where f.i=4)),p_layout=>'list');
 perform pg_temp.ok(not exists(select 1 from jsonb_array_elements(b->'pages'->'list'->'rows')x where x->>'id'=(select f.lead::text from fixture f where f.i=4)),'valid future planned placement still suppresses taskless Needs Attention');
 r:=public.crm_get_admissions_calendar(day+1,day+2,p_kind=>'placement');
 loop
  future_found:=future_found or exists(select 1 from jsonb_array_elements(r->'rows')x where x->>'id'=appointment::text and (x->>'starts_at')::timestamptz=((day+1)+'13:15'::time) at time zone 'Africa/Casablanca');
  exit when not (r->>'has_more')::boolean;
  r:=public.crm_get_admissions_calendar(day+1,day+2,p_kind=>'placement',p_cursor=>r->'next_cursor');
 end loop;
 perform pg_temp.ok(future_found,'future placement uses Casablanca scheduling across bounded Calendar pages');
end $$;
\echo PASS A14-A19 work/calendar buckets, filters, cursors, roles and fixed projections
rollback;
