-- Same rollback-only fixture as Work/Calendar acceptance.
-- Isolate the time-oracle probes from the high-volume agenda pages tested above.
update public.crm_tasks set due_at=now()+interval '100 days',scheduled_end_at=null where task_type='center_visit';
do $$ declare l uuid:=(select lead from fixture where i=2); t uuid; stamp timestamptz;
 civil jsonb; detail jsonb; tasks jsonb; queue jsonb; calendar jsonb; card jsonb; item jsonb;
 day date; bucket text; first_page jsonb; second_page jsonb; labels text[];
begin
 perform set_config('request.jwt.claim.sub','a3000000-0000-0000-0000-000000000003',true);
 for stamp in select unnest(array['2026-10-07 09:35Z'::timestamptz,'2026-02-15 02:35Z'::timestamptz,'2026-03-22 02:35Z'::timestamptz]) loop
  insert into public.crm_tasks(lead_id,task_type,due_at,assigned_to,source_kind,source_key)
  values(l,'center_visit',stamp,'a3000000-0000-0000-0000-000000000001','manual','ux-display:'||stamp) returning id into t;
  day:=(stamp at time zone 'Africa/Casablanca')::date;
  bucket:=case when stamp<now() then 'overdue' when stamp<(select d1 from crm_security.work_boundaries(now())) then 'today'
    when stamp<(select d2 from crm_security.work_boundaries(now())) then 'tomorrow' else 'upcoming' end;
  civil:=crm_security.scheduled_civil(stamp);
  perform pg_temp.ok(civil->>'local_date'=day::text and civil->>'local_time'=((stamp at time zone 'Africa/Casablanca')::time)::text,'PostgreSQL business oracle');
  tasks:=public.crm_list_open_tasks(l,null,100,0);
  select x into item from jsonb_array_elements(tasks)x where x->>'id'=t::text;
  perform pg_temp.ok(item @> civil and (item->>'due_at')::timestamptz=stamp,'open tasks civil fields, raw UTC preserved');
  detail:=public.crm_get_workspace_detail(l);
  perform pg_temp.ok(exists(select 1 from jsonb_array_elements(detail->'open_tasks')x where x->>'id'=t::text and x @> civil),'drawer open tasks same oracle');
  perform pg_temp.ok(detail->'next_task' @> crm_security.scheduled_civil((detail->'next_task'->>'due_at')::timestamptz),'drawer next task projection');
  card:=crm_security.opportunity_card(l);
  perform pg_temp.ok(card->'next_task' @> crm_security.scheduled_civil((card->'next_task'->>'due_at')::timestamptz),'opportunity scheduled projection');
  queue:=public.crm_get_work_queue(p_bucket=>bucket,p_assignee_mode=>'staff',p_assignee=>'a3000000-0000-0000-0000-000000000001',p_owner_mode=>'unassigned',p_limit=>50);
  select x into item from jsonb_array_elements(queue->'rows')x where x->>'id'=t::text;
  perform pg_temp.ok(item @> civil and (item->>'due_at')::timestamptz=stamp,'Tasks same server civil time');
  calendar:=public.crm_get_admissions_calendar(day,day+1,p_kind=>'center_visit');
  select x into item from jsonb_array_elements(calendar->'rows')x where x->>'id'=t::text;
  perform pg_temp.ok(item @> civil and (item->>'starts_at')::timestamptz=stamp,'Calendar same instant and civil time');
  delete from public.crm_tasks where id=t;
 end loop;
 -- Missing/invalid legacy time keeps its known date, never fabricated midnight.
 select crm_security.placement_summary(p) into detail from public.placement_tests p where p.crm_lead_id is null and p.heure='invalid' limit 1;
 perform pg_temp.ok(detail->>'local_date' is not null and detail->'local_time'='null'::jsonb and detail->'scheduled_for'='null'::jsonb,'unknown legacy time is truthful in drawer summary');
end $$;
-- Duplicate role/name groups cross the staff page boundary; no private fields.
insert into auth.users(id,email,aud,role)
select ('a3100000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'ux-staff-'||i||'@example.invalid','authenticated','authenticated' from generate_series(1,54)i;
update public.profiles set role='receptionist',full_name='Équipe accueil' where id::text like 'a3100000-%';
update public.profiles set full_name='Équipe accueil' where id='a3000000-0000-0000-0000-000000000001';
update public.profiles set full_name='Nom opérationnel unique' where id='a3000000-0000-0000-0000-000000000002';
do $$ declare a jsonb:=public.crm_list_staff(50,0); b jsonb:=public.crm_list_staff(50,50); row jsonb; labels text[]:=array[]::text[];
begin
 for row in select x from jsonb_array_elements((a->'rows')||(b->'rows'))x loop
  perform pg_temp.ok((select array_agg(k order by k) from jsonb_object_keys(row)k)=array['display_label','id','name','role'],'fixed staff response: no email/private metadata');
  perform pg_temp.ok(not row->>'display_label'=any(labels),'globally distinguishable staff labels across pages');
  labels:=array_append(labels,row->>'display_label');
  perform pg_temp.ok((public.crm_list_staff(100,0)->'rows') @> jsonb_build_array(row),'same identity label independent of pagination');
  if row->>'name'='Nom opérationnel unique' then perform pg_temp.ok(row->>'display_label'=row->>'name','unique full name remains plain'); end if;
  if row->>'role'='receptionist' and row->>'name'='Équipe accueil' then
   perform pg_temp.ok(row->>'display_label' like 'Équipe accueil · Accueil · Réf. %' and strpos(row->>'display_label',row->>'id')=0,'approved non-UUID reference only');
  end if;
 end loop;
end $$;

\echo PASS receptionist server-oracle displays and staff references across pages

-- UIF-r1a: identities from picker page 2 are projected by existing bounded reads.
do $$ declare staff jsonb:=public.crm_list_staff(50,50); owner jsonb:=staff->'rows'->0;
 assignee jsonb:=staff->'rows'->1; l uuid:=(select lead from fixture where i=2);
 t uuid; card jsonb; detail jsonb; queue jsonb; item jsonb;
begin
 perform pg_temp.ok(owner is not null and assignee is not null,'two outside-page-1 staff identities');
 update public.crm_leads set owner_id=(owner->>'id')::uuid where id=l;
 select id into t from public.crm_tasks where lead_id=l and status='open' order by due_at,id limit 1;
 update public.crm_tasks set assigned_to=(assignee->>'id')::uuid,due_at=now()-interval '1 hour' where id=t;
 card:=crm_security.opportunity_card(l);detail:=public.crm_get_workspace_detail(l);
 perform pg_temp.ok(card->>'owner_display_label'=owner->>'display_label','opportunity owner uses exact safe picker authority');
 perform pg_temp.ok(detail->>'owner_display_label'=owner->>'display_label','drawer owner outside page 1');
 perform pg_temp.ok(detail->'next_task'->>'assignee_display_label'=assignee->>'display_label','drawer next task outside page 1');
 select x into item from jsonb_array_elements(detail->'open_tasks')x where x->>'id'=t::text;
 perform pg_temp.ok(item->>'assignee_display_label'=assignee->>'display_label','open-task current identity');
 queue:=public.crm_get_work_queue(p_bucket=>'overdue',p_assignee_mode=>'staff',p_assignee=>(assignee->>'id')::uuid,p_owner_mode=>'staff',p_owner=>(owner->>'id')::uuid);
 select x into item from jsonb_array_elements(queue->'rows')x where x->>'id'=t::text;
 perform pg_temp.ok(item->>'assignee_display_label'=assignee->>'display_label' and item->'lead'->>'owner_display_label'=owner->>'display_label','task assignee and prospect owner independent safe labels');
 perform pg_temp.ok(item->>'assigned_to'<>item->'lead'->>'owner_id','assignee never falls back to owner');
 perform pg_temp.ok((select array_agg(k order by k) from jsonb_object_keys(item->'lead')k)=array['contact_name','id','learner_name','owner_display_label','owner_id','owner_name','program','status','version'],'fixed nested lead projection: no private staff fields');
 perform pg_temp.ok(crm_security.staff_display_label(null) is null,'unassigned label remains null');
 perform pg_temp.ok(not has_function_privilege('authenticated','crm_security.staff_display_label(uuid)','execute') and not has_function_privilege('anon','crm_security.staff_display_label(uuid)','execute') and not has_function_privilege('service_role','crm_security.staff_display_label(uuid)','execute'),'private label helper denied to API roles');
end $$;
\echo PASS UIF-r1a outside-picker-page row identity, fixed safe fields and private helper denial
