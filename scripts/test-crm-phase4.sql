-- Phase 4 read model: local-only synthetic fixtures, fully rolled back.
\set ON_ERROR_STOP on
begin;
create function pg_temp.ok(value boolean,label text) returns void language plpgsql as $$ begin
 if value is not true then raise exception 'FAIL: %',label; end if;
end $$;
create function pg_temp.denied(statement text,code text default '22023') returns void language plpgsql as $$ begin
 begin execute statement; exception when others then
  if sqlstate=code then return; end if;
  raise exception 'Expected %, got %: %',code,sqlstate,sqlerrm;
 end;
 raise exception 'Unexpected success: %',statement;
end $$;
create function pg_temp.actor(i integer) returns void language plpgsql as $$ begin
 perform set_config('request.jwt.claim.sub','80000000-0000-0000-0000-'||lpad(i::text,12,'0'),true);
end $$;
-- Trusted fixture driver only; production callers must provide their versions.
create function pg_temp.act(cmd text,lead uuid,payload jsonb default '{}',request uuid default gen_random_uuid()) returns jsonb
language plpgsql as $$ declare data jsonb; result jsonb; begin
 data:=jsonb_build_object('lead_id',lead,'expected_version',(select version from public.crm_leads where id=lead))||payload;
 if payload->>'task_id' is not null and not(payload ? 'expected_task_version') then
  data:=data||jsonb_build_object('expected_task_version',(select version from public.crm_tasks where id=(payload->>'task_id')::uuid)); end if;
 execute format('select public.crm_%I($1,$2)',cmd) into result using request,data; return result;
end $$;
create function pg_temp.intake() returns uuid language plpgsql as $$ declare r jsonb; begin
 r:=public.crm_create_manual_lead(gen_random_uuid(),'{"display_name":"Synthetic guardian","learner_name":"Synthetic learner","phone":"0612345678","source_label":"Manual"}');
 return (r->'lead'->>'id')::uuid;
end $$;
create function pg_temp.next_task(typ text default 'callback') returns jsonb language sql as $$
 select jsonb_build_object('task_type',typ,'due_at',now()+interval '1 day')
$$;
insert into auth.users(id,email,aud,role,created_at,updated_at)
select ('80000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'phase3-'||i||'@example.invalid','authenticated','authenticated',now(),now() from generate_series(1,7)i;
update public.profiles set role=(array['director','admin','receptionist','teacher','parent','student','pending'])[right(id::text,1)::integer] where id::text like '80000000-%';
select pg_temp.actor(1);
select pg_temp.ok(not exists(select 1 from public.crm_followup_policies),'unseeded policy baseline');
select pg_temp.denied($q$select pg_temp.intake()$q$);

create temp table phase3_policy(id uuid);
insert into phase3_policy select (public.crm_create_followup_policy('80000000-0000-0000-0000-000000000100',
 '{"weekly_hours":{"1":[["15:00","20:00"]],"2":[["10:00","12:30"],["15:20","20:00"]],"3":[["10:00","12:30"],["15:20","20:00"]],"4":[["10:00","12:30"],["15:20","20:00"]],"5":[["10:00","12:30"],["15:20","20:00"]],"6":[["10:00","12:30"],["15:20","20:00"]],"7":[]},"attempt_offsets":[0,0,1,3,5]}')->>'policy_id')::uuid;
select pg_temp.actor(3);
create temp table queue_fixture(kind text,id uuid);
insert into queue_fixture select name,pg_temp.intake() from unnest(array['overdue','new','due','taskless','stale','closed']) name;
-- Trusted synthetic fixture adjustments to exercise observational exceptions.
update public.crm_leads set status='ENGAGED' where id in(select id from queue_fixture where kind in ('overdue','due','taskless'));
update public.crm_leads set status='CONTACTING',created_at=now()-interval '4 days' where id in(select id from queue_fixture where kind='stale');
update public.crm_tasks set task_type='callback',due_at=now()-interval '2 hours' where lead_id in(select id from queue_fixture where kind='overdue');
update public.crm_tasks set task_type='center_visit',due_at=(((now() at time zone 'Africa/Casablanca')::date)+1)::timestamp at time zone 'Africa/Casablanca'-interval '1 second' where lead_id in(select id from queue_fixture where kind='due');
update public.crm_tasks set due_at=now()+interval '2 days' where lead_id in(select id from queue_fixture where kind in ('new','stale'));
-- Model a legacy missing-action exception without weakening production commands.
do $$ declare t public.crm_tasks%rowtype; begin for t in select * from public.crm_tasks where lead_id in(select id from queue_fixture where kind='taskless') loop perform crm_security.finish_task(t,true,'Synthetic missing-action fixture',gen_random_uuid()::text);end loop;end $$;
select pg_temp.act('close_lost',id,'{"reason":"price"}') from queue_fixture where kind='closed';

do $$ declare result jsonb; l uuid:=(select id from queue_fixture where kind='new'); before_state text; after_state text; i integer; fn record; statement text; begin
 select md5(string_agg(to_jsonb(t)::text,'' order by t.id)) into before_state from public.crm_leads t;
 result:=public.crm_get_today(100,0,0);
 perform pg_temp.ok((result->>'attention_total')::integer=5,'five attention exceptions');
 perform pg_temp.ok((select array_agg((x->>'priority')::integer order by n) from jsonb_array_elements(result->'needs_attention') with ordinality a(x,n))=array[1,2,3,4,5],'deterministic priority order');
 perform pg_temp.ok((result->'counts'->>'overdue')::integer=1,'overdue count');
 perform pg_temp.ok((result->'counts'->>'new')::integer=1,'new count');
 perform pg_temp.ok((result->'counts'->>'due_today')::integer=(select count(*) from public.crm_tasks where status='open' and due_at>=((now() at time zone 'Africa/Casablanca')::date)::timestamp at time zone 'Africa/Casablanca' and due_at<(((now() at time zone 'Africa/Casablanca')::date)+1)::timestamp at time zone 'Africa/Casablanca'),'Casablanca calendar bounds');
 perform pg_temp.ok(jsonb_array_length(public.crm_get_today(1,1,0)->'needs_attention')=1,'bounded queue page');
 perform pg_temp.ok((public.crm_search_leads('0612345678')->>'total')::integer=6,'Moroccan normalized phone search');
 perform pg_temp.ok((public.crm_search_leads('Synthetic learner')->>'total')::integer=6,'learner name search');
 perform pg_temp.ok((public.crm_search_leads('guardian','LOST')->>'total')::integer=1,'contact and status search');
 perform pg_temp.ok(jsonb_array_length(public.crm_search_leads('',null,null,2,1)->'rows')=2,'bounded search page');
 perform pg_temp.ok((public.crm_search_leads('',null,(select contact_id from public.crm_leads where id=l))->>'total')::integer=1,'candidate contact search');
 perform pg_temp.ok(public.crm_get_workspace_detail(l)->>'status'='NEW','safe detail');
 perform pg_temp.ok(jsonb_array_length(public.crm_get_history(l,1,0)->'rows')=1,'bounded timeline');
 perform pg_temp.ok(jsonb_array_length(public.crm_get_form_answers(l,1,0)->'rows')=1,'bounded forms');
 perform pg_temp.ok(not (public.crm_get_workspace_detail(l)::text ~ '(campaign_id|adset_id|fbclid|raw_payload|payload_hash|source_key)'),'detail no technical attribution');
 perform pg_temp.ok((select bool_and((x-array['id','name','role'])='{}'::jsonb) from jsonb_array_elements(public.crm_list_staff()->'rows') x),'staff only id name role');
 perform pg_temp.ok((select bool_and(x->>'role' in ('receptionist','admin','director')) from jsonb_array_elements(public.crm_list_staff()->'rows')x),'eligible staff only');
 perform pg_temp.denied('select public.crm_get_today(101,0,0)');
 perform pg_temp.denied('select public.crm_search_leads('''',null,null,25,-1)');
 perform pg_temp.denied('select public.crm_get_history(null,0,0)');
 select md5(string_agg(to_jsonb(t)::text,'' order by t.id)) into after_state from public.crm_leads t;
 perform pg_temp.ok(before_state=after_state,'reads never mutate lead state');
 for fn in select p.oid,p.proname,p.proconfig,p.provolatile,p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('crm_get_today','crm_search_leads','crm_get_workspace_detail','crm_get_history','crm_get_form_answers','crm_list_staff') loop
  perform pg_temp.ok(fn.provolatile='s' and fn.prosecdef and fn.proconfig=array['search_path=pg_catalog, pg_temp'],'read-only pinned definer '||fn.proname);
  perform pg_temp.ok(not has_function_privilege('anon',fn.oid,'execute') and not has_function_privilege('service_role',fn.oid,'execute') and has_function_privilege('authenticated',fn.oid,'execute'),'execution ACL '||fn.proname);
 end loop;
 for i in 1..7 loop
  perform pg_temp.actor(i);
  foreach statement in array array['select public.crm_get_today()','select public.crm_search_leads()',format('select public.crm_get_workspace_detail(%L)',l),format('select public.crm_get_history(%L)',l),format('select public.crm_get_form_answers(%L)',l),'select public.crm_list_staff()'] loop
   if i<=3 then execute statement;else perform pg_temp.denied(statement,'42501');end if;
  end loop;
 end loop;
 perform set_config('request.jwt.claim.sub','',true);
 perform pg_temp.denied('select public.crm_get_today()','42501');
end $$;
select pg_temp.ok(crm_security.operational_answers('[{"key":"age","label":"Âge","value":8},{"key":"days","label":"Jours","value":["mercredi","samedi"]},{"key":"ready","label":"Disponible","value":true},{"key":"campaign_id","label":"Campagne","value":"secret"},{"key":"fbclid","value":"secret"},{"key":"answer","value":{"raw_payload":"secret"}}]')='[{"key":"age","label":"Âge","value":8},{"key":"days","label":"Jours","value":["mercredi","samedi"]},{"key":"ready","label":"Disponible","value":true}]','safe answer values and excluded technical/object fields');
select pg_temp.actor(3);
do $$ declare k text; answer jsonb; l uuid; newer uuid; older uuid; r jsonb; r2 jsonb; d jsonb; req uuid; task uuid; before_count integer; decision text; fn regprocedure:='public.crm_record_conversation_decision(uuid,jsonb)'::regprocedure; begin
 foreach k in array array['metaCampaignName','METACAMPAIGNNAME','customFinancialAmount','PasswordHash','campaign_id','Campaign-ID','CAMPAIGN ID','ad','ad_id','adset_id','account_id','page_id','form_id','leadgen_id','meta_lead_id','external_submission_id','external_id','provider.id','fbclid','fbc','fbp','utm_source','raw_payload','financial_balance','balance_due','charge_total','receipt_number','payment_amount','revenue_total','roas','spend','cpl','cpql','cac'] loop
  answer:=jsonb_build_array(jsonb_build_object('key',k,'label','Réponse','value','PROTECTED'));
  perform pg_temp.ok(crm_security.operational_answers(answer)='[]','reserved key '||k);
  answer:=jsonb_build_array(jsonb_build_object('key','custom','label',k,'value','PROTECTED'));
  perform pg_temp.ok(crm_security.operational_answers(answer)='[]','reserved label '||k);
 end loop;
 foreach k in array array['child_age','english_level','preferred_days','main_difficulty','school','start_date'] loop
  answer:=jsonb_build_array(jsonb_build_object('key',k,'label','Question','value',jsonb_build_array('Lundi','Mercredi')));
  perform pg_temp.ok(crm_security.operational_answers(answer)=answer,'ordinary multichoice '||k);
 end loop;
 older:=pg_temp.intake(); newer:=pg_temp.intake();
 update public.crm_leads set created_at=now()-interval '3 days' where id=older;
 update public.crm_leads set created_at=now()-interval '2 days' where id=newer;
 update public.crm_tasks set due_at=(((now() at time zone 'Africa/Casablanca')::date)+1)::timestamp at time zone 'Africa/Casablanca'-interval '1 microsecond' where lead_id=older;
 update public.crm_tasks set due_at=now()+interval '2 days' where lead_id=newer;
 r:=public.crm_get_today(100,0,0);
 perform pg_temp.ok((select array_agg(x->>'id' order by n) from jsonb_array_elements(r->'needs_attention') with ordinality a(x,n) where x->>'id' in(older::text,newer::text))=array[older::text,newer::text],'NEW oldest first independent of due time');
 perform pg_temp.act('schedule_task',older,jsonb_build_object('task',pg_temp.next_task('center_visit')));
 r:=public.crm_get_today(100,0,0);
 perform pg_temp.ok((select count(*)=count(distinct x->>'id') from jsonb_array_elements(r->'needs_attention')x),'one lead once with multiple tasks');
 foreach decision in array array['callback','qualify','lost','not_qualified'] loop
  -- Existing callbacks are superseded even when the caller supplies no task.
 l:=pg_temp.intake();
 perform pg_temp.act('schedule_task',l,jsonb_build_object('task',pg_temp.next_task()));
 perform pg_temp.act('schedule_task',l,jsonb_build_object('task',pg_temp.next_task()));
 r:=pg_temp.act('record_conversation_decision',l,jsonb_build_object('decision','qualify','note','Projet confirmé','qualification_step','center_visit','next_task',pg_temp.next_task('center_visit')));
 perform pg_temp.ok(jsonb_array_length(r->'open_tasks')=1 and r->'open_tasks'->0->>'task_type'='center_visit','qualification replaces prior callbacks even without task selection');
 l:=pg_temp.intake();select id into task from public.crm_tasks where lead_id=l and status='open';req:=gen_random_uuid();
  d:=jsonb_build_object('lead_id',l,'expected_version',1,'task_id',task,'expected_task_version',1,'decision',decision,'note','Parent conversation evidence');
  if decision='callback' then d:=d||jsonb_build_object('next_task',pg_temp.next_task());
  elsif decision='qualify' then d:=d||jsonb_build_object('qualification_step','placement_test','next_task',pg_temp.next_task('confirm_placement_test'));
  else d:=d||jsonb_build_object('reason',case when decision='lost' then 'not_interested' else 'program_not_suitable' end);end if;
  r:=public.crm_record_conversation_decision(req,d);
  perform pg_temp.ok(r->'lead'->>'status'=case decision when 'callback' then 'ENGAGED' when 'qualify' then 'QUALIFIED' when 'lost' then 'LOST' else 'NOT_QUALIFIED' end,'decision status '||decision);
  perform pg_temp.ok((select count(*)=1 from public.crm_activities where lead_id=l and event_type='conversation_recorded'),'one conversation '||decision);
  perform pg_temp.ok((select count(*)=case when decision in('callback','qualify') then 1 else 0 end from public.crm_tasks where lead_id=l and status='open'),'exact followup count '||decision);
  if decision='qualify' then perform pg_temp.ok(not exists(select 1 from public.crm_tasks where lead_id=l and status='open' and task_type='callback'),'no redundant callback');end if;
  select count(*) into before_count from public.crm_activities where lead_id=l;
  r2:=public.crm_record_conversation_decision(req,d);
  perform pg_temp.ok(r=r2 and before_count=(select count(*) from public.crm_activities where lead_id=l),'exact network replay '||decision);
  perform pg_temp.denied(format('select public.crm_record_conversation_decision(%L,%L)',req,d||'{"note":"changed"}'),'22023');
 end loop;
 l:=pg_temp.intake();select id into task from public.crm_tasks where lead_id=l and status='open';
 d:=jsonb_build_object('lead_id',l,'expected_version',1,'task_id',task,'expected_task_version',1,'decision','qualify','note','Evidence','qualification_step','placement_test','next_task',pg_temp.next_task('callback'));
 select count(*) into before_count from public.crm_activities where lead_id=l;
 perform pg_temp.denied(format('select public.crm_record_conversation_decision(%L,%L)',gen_random_uuid(),d));
 perform pg_temp.ok((select status='NEW' and version=1 from public.crm_leads where id=l) and before_count=(select count(*) from public.crm_activities where lead_id=l) and (select status='open' from public.crm_tasks where id=task),'failed decision rolls back task, evidence and lifecycle');
 perform pg_temp.denied(format('select public.crm_record_conversation_decision(%L,%L)',gen_random_uuid(),d||'{"expected_version":999}'),'40001');
 perform pg_temp.denied(format('select public.crm_record_conversation_decision(%L,%L)',gen_random_uuid(),d||'{"expected_task_version":999}'),'40001');
 for i in 4..7 loop
  perform pg_temp.actor(i);perform pg_temp.denied(format('select public.crm_record_conversation_decision(%L,%L)',gen_random_uuid(),d),'42501');
 end loop;
 perform pg_temp.ok(not has_function_privilege('anon',fn,'execute') and not has_function_privilege('service_role',fn,'execute') and has_function_privilege('authenticated',fn,'execute'),'decision grants');
 perform pg_temp.ok((select prosecdef and proconfig=array['search_path=pg_catalog, pg_temp'] from pg_proc where oid=fn),'decision pinned definer');
end $$;

-- Authorized staff and invalid closure exercise the trusted transaction directly.
do $$ declare l uuid; d jsonb; before_state jsonb; begin
 for i in 1..3 loop
  perform pg_temp.actor(i);l:=pg_temp.intake();
  perform pg_temp.act('record_conversation_decision',l,jsonb_build_object('decision','callback','note','Conversation confirmée','next_task',pg_temp.next_task()));
  perform pg_temp.ok((select status='ENGAGED' from public.crm_leads where id=l),'authorized staff decision '||i);
 end loop;
 l:=pg_temp.intake();select to_jsonb(x) into before_state from public.crm_leads x where id=l;
 d:=jsonb_build_object('lead_id',l,'expected_version',1,'decision','not_qualified','reason','price','note','Conversation confirmée');
 perform pg_temp.denied(format('select public.crm_record_conversation_decision(%L,%L)',gen_random_uuid(),d));
 perform pg_temp.ok(before_state=(select to_jsonb(x) from public.crm_leads x where id=l) and not exists(select 1 from public.crm_activities where lead_id=l and event_type='conversation_recorded'),'invalid closure rolls back evidence and lead state');
 perform set_config('request.jwt.claim.sub','',true);
 perform pg_temp.denied(format('select public.crm_record_conversation_decision(%L,%L)',gen_random_uuid(),d),'42501');
end $$;
rollback;
\echo PASS Phase 4 priority, counts, calendar bounds, pagination, search, safe shapes, no mutation, role and execution boundaries
