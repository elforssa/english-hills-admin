-- UIF-r1a: compatible bounded CRM row presentation fields only.
-- No business writes, public RPC, permission/RLS or membership change.
begin;

-- Extract migration 109's label rule unchanged; global collisions are checked on
-- the server, but callers receive only identities already in their bounded rows.
create function crm_security.staff_display_label(account uuid) returns text
language sql stable strict set search_path=pg_catalog,pg_temp as $$
 with staff as materialized (
  select id,coalesce(nullif(btrim(full_name),''),'Équipe accueil') name,role,
  crm_security.staff_reference(id) reference from public.profiles where role in ('director','admin','receptionist')
 ), labelled as (
  select s.*,s.name||case when (select count(*) from staff o where lower(o.name)=lower(s.name))>1 then
   ' · '||case s.role when 'director' then 'Direction' when 'admin' then 'Administration' else 'Accueil' end||
   case when (select count(*) from staff o where lower(o.name)=lower(s.name) and o.role=s.role)>1 then
    ' · Réf. '||left(s.reference,(select min(n) from generate_series(6,26)n where not exists(
     select 1 from staff o where o.id<>s.id and lower(o.name)=lower(s.name) and o.role=s.role
      and left(o.reference,n)=left(s.reference,n)))) else '' end
   else '' end display_label from staff s where s.id=account

 ) select display_label from labelled
$$;
revoke all on function crm_security.staff_display_label(uuid) from public,anon,authenticated,service_role;

create or replace function public.crm_list_staff(p_limit integer default 50,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare result jsonb;
begin
 perform crm_security.require_reader(false);perform crm_security.check_page(p_limit,p_offset);
 with staff as materialized (
  select id,coalesce(nullif(btrim(full_name),''),'Équipe accueil') name,role
  from public.profiles where role in ('director','admin','receptionist')
 ), page as (select * from staff order by name collate "C",id limit p_limit offset p_offset)
 select jsonb_build_object('total',(select count(*) from staff),
 'rows',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'role',role,'display_label',crm_security.staff_display_label(id))
  order by name collate "C",id) from page),'[]'::jsonb)) into result;
 return result;
end $$;

create or replace function public.crm_list_open_tasks(p_lead uuid default null,p_assigned_to uuid default null,p_limit integer default 50,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare result jsonb;
begin
  perform crm_security.require_reader(false);
  perform crm_security.check_page(p_limit,p_offset);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'lead_id',r.lead_id,'task_type',r.task_type,'status',r.status,
    'assigned_to',r.assigned_to,'assignee_display_label',crm_security.staff_display_label(r.assigned_to),'due_at',r.due_at,'scheduled_end_at',r.scheduled_end_at,
    'local_date',crm_security.scheduled_civil(r.due_at)->'local_date',
    'local_time',crm_security.scheduled_civil(r.due_at)->'local_time','timezone',r.timezone,'priority',r.priority,'instructions',r.instructions,'version',r.version
  ) order by r.due_at,r.id),'[]'::jsonb) into result
  from (select t.id,t.lead_id,t.task_type,t.status,t.assigned_to,t.due_at,t.scheduled_end_at,
    t.timezone,t.priority,t.instructions,t.version from public.crm_tasks t
    where t.status='open' and (p_lead is null or t.lead_id=p_lead)
      and (p_assigned_to is null or t.assigned_to=p_assigned_to)
    order by t.due_at,t.id limit p_limit offset p_offset) r;
  return result;
end $$;

create or replace function crm_security.operational_card(lead uuid) returns jsonb
language sql stable set search_path=pg_catalog,pg_temp as $$
 select jsonb_build_object('id',l.id,'contact_id',c.id,'contact_name',c.display_name,
 'phone',coalesce(c.phone_e164,c.phone_raw),'phone_e164',c.phone_e164,'whatsapp_e164',coalesce(c.whatsapp_e164,c.phone_e164),
 'learner_name',l.learner_name,'learner_age',l.learner_age,'program',coalesce(l.session_type,l.program_interest_text),
 'failed_attempts',crm_security.failed_count(l),'status',l.status,'version',l.version,'owner_id',l.owner_id,'owner_display_label',crm_security.staff_display_label(l.owner_id),'source_label',s.source_label,
 'next_task',case when t.id is not null then jsonb_build_object('id',t.id,'task_type',t.task_type,'due_at',t.due_at,'version',t.version,'assignee_display_label',crm_security.staff_display_label(t.assigned_to))||crm_security.scheduled_civil(t.due_at) end,
 'next_placement',(select crm_security.placement_summary(p) from public.placement_tests p where p.crm_lead_id=l.id and p.status='Planifié' order by p.date_test,p.heure,p.id limit 1),
 'post_test_result',(select crm_security.placement_summary(p) from public.placement_tests p where p.id=t.placement_test_id and p.crm_lead_id=l.id and p.status in ('Résultat saisi','Affecté')),
 'last_activity',case when a.id is not null then jsonb_build_object('event_type',a.event_type,'occurred_at',a.occurred_at) end)
 from public.crm_leads l join public.crm_contacts c on c.id=l.contact_id
 join public.crm_submissions s on s.id=l.first_submission_id
 left join lateral(select t.id,t.task_type,t.due_at,t.version,t.assigned_to,t.placement_test_id from public.crm_tasks t where t.lead_id=l.id and t.status='open' order by t.due_at,t.id limit 1)t on true
 left join lateral(select a.id,a.event_type,a.occurred_at from public.crm_activities a where a.lead_id=l.id order by a.occurred_at desc,a.id desc limit 1)a on true
 where l.id=lead
$$;

create or replace function crm_security.opportunity_card(lead uuid) returns jsonb
language sql stable set search_path=pg_catalog,pg_temp as $$
 select jsonb_build_object('id',l.id,'contact_id',l.contact_id,'contact_name',c.display_name,
 'learner_name',l.learner_name,'learner_age',l.learner_age,'program',coalesce(nullif(l.session_type,''),nullif(l.program_interest_text,'')),
 'status',l.status,'version',l.version,'created_at',l.created_at,'owner_id',l.owner_id,
 'owner_display_label',crm_security.staff_display_label(l.owner_id),
 'owner_name',case when l.owner_id is not null then coalesce(nullif(o.full_name,''),'Équipe accueil') end,
 'source_label',s.source_label,'channel',s.channel,'failed_attempts',crm_security.failed_count(l),
 'closure_reason',l.closure_reason,'closed_at',l.closed_at,
 'next_task',case when t.id is not null then jsonb_build_object('id',t.id,'task_type',t.task_type,'due_at',t.due_at,
 'version',t.version,'assigned_to',t.assigned_to,'assignee_display_label',crm_security.staff_display_label(t.assigned_to),'attempt_ordinal',t.attempt_ordinal)||crm_security.scheduled_civil(t.due_at) end,
 'next_placement',case when p.id is not null then jsonb_build_object('id',p.id,'scheduled_for',(p.date_test+crm_security.calendar_time(p.heure)) at time zone 'Africa/Casablanca','status',p.status,'local_date',p.date_test,'local_time',crm_security.calendar_time(p.heure)) end,
 'last_activity_at',(select a.occurred_at from public.crm_activities a where a.lead_id=l.id order by a.occurred_at desc,a.id desc limit 1))
 from public.crm_leads l join public.crm_contacts c on c.id=l.contact_id
 join public.crm_submissions s on s.id=l.first_submission_id left join public.profiles o on o.id=l.owner_id
 left join lateral(select t.id,t.task_type,t.due_at,t.version,t.assigned_to,t.attempt_ordinal from public.crm_tasks t where t.lead_id=l.id and t.status='open' order by t.due_at,t.id limit 1)t on true
 left join lateral(select p.id,p.date_test,p.heure,p.status from public.placement_tests p where p.crm_lead_id=l.id and p.status='Planifié' limit 1)p on true
 where l.id=lead
$$;

create or replace function public.crm_get_work_queue(p_bucket text default 'today',
 p_assignee_mode text default 'me',p_assignee uuid default null,
 p_owner_mode text default 'all',p_owner uuid default null,
 p_cursor jsonb default null,p_limit integer default 25)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,pg_temp set plan_cache_mode=force_custom_plan as $$
declare stamp timestamptz:=now(); bounds record; fingerprint text; after_due timestamptz; after_id uuid; result jsonb;
begin
 perform crm_security.require_reader(false);
 if p_bucket is null or p_bucket not in ('overdue','today','tomorrow','upcoming')
 or p_assignee_mode is null or p_assignee_mode not in ('all','me','unassigned','staff')
 or (p_assignee_mode='staff')<>(p_assignee is not null)
 or p_owner_mode is null or p_owner_mode not in ('all','me','unassigned','staff')
 or (p_owner_mode='staff')<>(p_owner is not null)
 or p_limit is null or p_limit not between 1 and 50 then
 raise exception 'Invalid work filters' using errcode='22023'; end if;
 fingerprint:=md5(jsonb_build_array(auth.uid(),p_bucket,p_assignee_mode,p_assignee,p_owner_mode,p_owner)::text);
 perform crm_security.o3_cursor(p_cursor,'work',fingerprint);
 if p_cursor is not null then
  if p_cursor-array['v','kind','filter','due','id']<>'{}'::jsonb
  or jsonb_typeof(p_cursor->'due') is distinct from 'string'
  or jsonb_typeof(p_cursor->'id') is distinct from 'string' then
  raise exception 'Invalid work cursor' using errcode='22023'; end if;
  after_due:=(p_cursor->>'due')::timestamptz; after_id:=(p_cursor->>'id')::uuid;
  if not isfinite(after_due) then raise exception 'Invalid work cursor' using errcode='22023'; end if;
 end if;
 select * into bounds from crm_security.work_boundaries(stamp);
 -- Counts and the selected page share a single statement snapshot; only page IDs
 -- are enriched. A task's assignee never falls back to its lead's owner.
 with matching as materialized (
  select t.id,t.lead_id,t.due_at,case when t.due_at<stamp then 'overdue' when t.due_at<bounds.d1 then 'today' when t.due_at<bounds.d2 then 'tomorrow' else 'upcoming' end bucket
  from public.crm_tasks t join public.crm_leads l on l.id=t.lead_id
  where t.status='open' and l.merged_into_lead_id is null
  and l.status in ('NEW','CONTACTING','ENGAGED','QUALIFIED')
  and (p_assignee_mode='all' or p_assignee_mode='me' and t.assigned_to=auth.uid()
   or p_assignee_mode='unassigned' and t.assigned_to is null or p_assignee_mode='staff' and t.assigned_to=p_assignee)
  and (p_owner_mode='all' or p_owner_mode='me' and l.owner_id=auth.uid()
   or p_owner_mode='unassigned' and l.owner_id is null or p_owner_mode='staff' and l.owner_id=p_owner)),
 page as materialized(select * from matching where bucket=p_bucket
  and (after_due is null or (due_at,id)>(after_due,after_id)) order by due_at,id limit p_limit+1),
 shown as(select * from page order by due_at,id limit p_limit)
 select jsonb_build_object('as_of',stamp,'timezone','Africa/Casablanca',
 'boundaries',jsonb_build_object('d0',bounds.d0,'d1',bounds.d1,'d2',bounds.d2),
 'counts',(select jsonb_object_agg(b,coalesce(n,0)) from unnest(array['overdue','today','tomorrow','upcoming'])b
  left join(select bucket,count(*) n from matching group by bucket)x on x.bucket=b),
 'rows',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'lead_id',t.lead_id,
  'task_type',t.task_type,'local_date',crm_security.scheduled_civil(t.due_at)->'local_date',
  'local_time',crm_security.scheduled_civil(t.due_at)->'local_time','due_at',t.due_at,'scheduled_end_at',t.scheduled_end_at,
  'version',t.version,'assigned_to',t.assigned_to,'assignee_name',a.full_name,'assignee_display_label',crm_security.staff_display_label(t.assigned_to),'attempt_ordinal',t.attempt_ordinal,
  'lead',jsonb_build_object('id',l.id,'version',l.version,'contact_name',c.display_name,
  'learner_name',l.learner_name,'program',coalesce(nullif(l.session_type,''),nullif(l.program_interest_text,'')),
  'status',l.status,'owner_id',l.owner_id,'owner_name',o.full_name,'owner_display_label',crm_security.staff_display_label(l.owner_id))) order by s.due_at,s.id)
  from shown s join public.crm_tasks t on t.id=s.id join public.crm_leads l on l.id=s.lead_id
  join public.crm_contacts c on c.id=l.contact_id left join public.profiles a on a.id=t.assigned_to
  left join public.profiles o on o.id=l.owner_id),'[]'::jsonb),
 'has_more',(select count(*)>p_limit from page),
 'next_cursor',case when (select count(*)>p_limit from page) then
  (select jsonb_build_object('v',1,'kind','work','filter',fingerprint,'due',due_at,'id',id)
   from shown order by due_at desc,id desc limit 1) end) into result;
 return result;
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
 raise exception 'Invalid work cursor' using errcode='22023';
end $$;

notify pgrst,'reload schema';
commit;
