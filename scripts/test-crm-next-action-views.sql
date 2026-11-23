-- RWR-r5 invariant 9: card, drawer, list, Tâches, Aujourd'hui and the calendar show
-- the same next action. 50 generated prospects (seeded), fully rolled back.
\set ON_ERROR_STOP on
begin;
create function pg_temp.ok(value boolean,label text) returns void language plpgsql as $$ begin
 if value is not true then raise exception 'FAIL: %',label; end if;
end $$;
create function pg_temp.data(lead uuid,payload jsonb) returns jsonb language sql as $$
 select jsonb_build_object('lead_id',lead,'expected_version',(select version from public.crm_leads where id=lead))||payload
$$;
create function pg_temp.act(cmd text,lead uuid,payload jsonb) returns jsonb language plpgsql as $$ declare result jsonb; begin
 execute format('select public.crm_%I($1,$2)',cmd) into result using gen_random_uuid(),pg_temp.data(lead,payload); return result;
end $$;
create function pg_temp.at(kind text,days integer,hhmm text) returns timestamptz language sql as $$
 select crm_security.window_at(crm_security.current_policy_id(),kind,
  (((now() at time zone public.centre_utc_offset())::date+days)::timestamp+hhmm::time) at time zone public.centre_utc_offset())
$$;
insert into auth.users(id,email,aud,role,created_at,updated_at)
select ('a7000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'views-'||i||'@example.invalid','authenticated','authenticated',now(),now() from generate_series(1,3)i;
update public.profiles set role=(array['director','admin','receptionist'])[right(id::text,1)::integer],full_name='Views staff '||right(id::text,1) where id::text like 'a7000000-%';
do $p$ begin
 perform set_config('request.jwt.claim.sub','a7000000-0000-0000-0000-000000000001',true);
 perform public.crm_create_followup_policy(gen_random_uuid(),
 '{"weekly_hours":{"1":[["15:00","20:00"]],"2":[["10:00","12:30"],["15:20","20:00"]],"3":[["10:00","12:30"],["15:20","20:00"]],"4":[["10:00","12:30"],["15:20","20:00"]],"5":[["10:00","12:30"],["15:20","20:00"]],"6":[["10:00","12:30"],["15:20","20:00"]],"7":[]},
   "opening_hours":{"1":[["14:00","20:00"]],"2":[["09:30","20:00"]],"3":[["09:30","20:00"]],"4":[["09:30","20:00"]],"5":[["09:30","20:00"]],"6":[["09:30","20:00"]],"7":[]},
   "attempt_offsets":[0,0,1,3,5]}');
end $p$;
create temp table gen(i integer primary key,lead uuid);
do $$ declare l uuid; step integer; menu integer; t uuid; begin
 perform set_config('request.jwt.claim.sub','a7000000-0000-0000-0000-000000000003',true);
 perform setseed(0.42);
 for i in 1..50 loop
  l:=(public.crm_create_manual_lead(gen_random_uuid(),jsonb_build_object('display_name','Views contact '||i,'learner_name','Views learner '||i,
   'email','views-'||gen_random_uuid()||'@example.invalid','source_label','Manual'))->'lead'->>'id')::uuid;
  insert into gen values(i,l);
  for step in 1..(floor(random()*5))::integer loop
   menu:=floor(random()*8)::integer;
   t:=crm_security.next_action_id(l);
   begin
    case menu
    when 0 then perform pg_temp.act('log_exchange',l,'{"channel":"phone","result":"no_answer","real_attempt_override":true}');
    when 1 then perform pg_temp.act('log_exchange',l,jsonb_build_object('channel','phone','result','spoke','next',jsonb_build_object('task_type','callback','due_preset','tomorrow')));
    -- An appointment is booked by the exchange that qualifies (OD-11, review of #208 B1).
    when 2 then perform pg_temp.act('log_exchange',l,jsonb_build_object('channel','phone','result','spoke','next',jsonb_build_object('task_type','center_visit','due_at',pg_temp.at('opening',1+i%9,'10:00')+make_interval(mins=>(i%6)*61),'with_test',i%2=0,'replace_action_id',t)));
    when 3 then perform pg_temp.act('change_next_action',l,jsonb_build_object('expected_action_id',t,'next',jsonb_build_object('task_type','awaiting_prospect')));
    when 4 then perform pg_temp.act('schedule_task',l,jsonb_build_object('task',jsonb_build_object('task_type','callback','due_preset','in_2_days')));
    when 5 then perform pg_temp.act('log_exchange',l,'{"channel":"phone","result":"spoke","next":{"enrol":{"due_preset":"tomorrow"}}}');
    when 6 then perform pg_temp.act('close_prospect',l,'{"status":"LOST","reason":"price"}');
    else perform pg_temp.act('add_note',l,'{"note":"Note"}');
    end case;
   exception when sqlstate '22023' or sqlstate 'PT409' then null; -- a refused step leaves the prospect as it was
   end;
  end loop;
 end loop;
end $$;

do $$ declare g record; cur uuid; ids jsonb; queue_rows jsonb:='[]'::jsonb; r jsonb; b text; cal jsonb:='[]'::jsonb; day date:=(now() at time zone public.centre_utc_offset())::date; today jsonb; begin
 perform set_config('request.jwt.claim.sub','a7000000-0000-0000-0000-000000000003',true);
 -- Every Tâches row, all buckets, all staff.
 foreach b in array array['overdue','today','tomorrow','upcoming','awaiting'] loop
  r:=public.crm_get_work_queue(p_bucket=>b,p_assignee_mode=>'all',p_limit=>50);
  loop
   queue_rows:=queue_rows||(r->'rows');
   exit when not (r->>'has_more')::boolean;
   r:=public.crm_get_work_queue(p_bucket=>b,p_assignee_mode=>'all',p_limit=>50,p_cursor=>r->'next_cursor');
  end loop;
 end loop;
 r:=public.crm_get_admissions_calendar(day,day+14);
 loop cal:=cal||(r->'rows'); exit when not (r->>'has_more')::boolean; r:=public.crm_get_admissions_calendar(day,day+14,p_cursor=>r->'next_cursor'); end loop;
 today:=public.crm_get_today(100);
 for g in select gen.i,gen.lead,l.status from gen join public.crm_leads l on l.id=gen.lead loop
  cur:=crm_security.next_action_id(g.lead);
  if g.status in ('LOST','NOT_QUALIFIED','CONVERTED') then
   perform pg_temp.ok(cur is null and not exists(select 1 from jsonb_array_elements(queue_rows)x where x->>'lead_id'=g.lead::text),'closed prospect '||g.i||' has no action anywhere');
   continue;
  end if;
  perform pg_temp.ok(cur is not null and (select count(*)=1 from public.crm_tasks where lead_id=g.lead and status='open'),'prospect '||g.i||' has one action');
  ids:=jsonb_build_object(
   'card',crm_security.opportunity_card(g.lead)->'next_action'->>'id',
   'card_task',crm_security.opportunity_card(g.lead)->'next_task'->>'id',
   'operational',crm_security.operational_card(g.lead)->'next_task'->>'id',
   'drawer',public.crm_get_workspace_detail(g.lead)->'next_task'->>'id',
   'check',public.crm_check_action(g.lead)->'next_action'->>'id',
   'queue',(select jsonb_agg(x->>'id') from jsonb_array_elements(queue_rows)x where x->>'lead_id'=g.lead::text));
  perform pg_temp.ok(ids->>'card'=cur::text and ids->>'card_task'=cur::text and ids->>'operational'=cur::text and ids->>'drawer'=cur::text and ids->>'check'=cur::text
   and ids->'queue'=jsonb_build_array(cur::text),'prospect '||g.i||' same action in every reader: '||ids::text);
  if (select task_type='center_visit' and due_at>=day::timestamp at time zone public.centre_utc_offset() and due_at<(day+14)::timestamp at time zone public.centre_utc_offset() from public.crm_tasks where crm_tasks.id=cur) then
   perform pg_temp.ok((select count(*)=1 from jsonb_array_elements(cal)x where x->>'lead_id'=g.lead::text and x->>'kind'='center_visit' and x->>'id'=cur::text)
    and not exists(select 1 from jsonb_array_elements(cal)x where x->>'lead_id'=g.lead::text and x->>'kind'='placement'),'prospect '||g.i||' appointment once in the calendar, test as its badge');
  end if;
  perform pg_temp.ok(not exists(select 1 from jsonb_array_elements(today->'needs_attention')x where x->>'id'=g.lead::text and x->'next_task'->>'id' is distinct from cur::text),'prospect '||g.i||' Aujourd''hui shows the same action');
 end loop;
 perform pg_temp.ok((select count(*) from gen join public.crm_leads l on l.id=gen.lead where l.status in ('NEW','CONTACTING','ENGAGED','QUALIFIED'))>=25,'enough active prospects generated');
 perform pg_temp.ok(exists(select 1 from gen join public.crm_tasks t on t.id=crm_security.next_action_id(gen.lead) where t.task_type='center_visit'),'generator reached appointments');
end $$;
\echo PASS invariant 9: the same next action in every reader for 50 generated prospects
rollback;
