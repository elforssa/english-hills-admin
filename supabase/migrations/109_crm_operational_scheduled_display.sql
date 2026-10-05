-- Post-Outcome-3 compatible scheduled-time read projections. No stored instant,
-- predicate, command, grant, RLS, trigger or business-data change.
begin;

-- PostgreSQL tzdata is the operational oracle. UTC remains the write/order key.
create function crm_security.scheduled_civil(stamp timestamptz) returns jsonb
language sql stable set search_path=pg_catalog,pg_temp as $$
 select jsonb_build_object('local_date',(stamp at time zone 'Africa/Casablanca')::date,
 'local_time',(stamp at time zone 'Africa/Casablanca')::time)
$$;
revoke all on function crm_security.scheduled_civil(timestamptz) from public,anon,authenticated,service_role;


create or replace function public.crm_list_open_tasks(p_lead uuid default null,p_assigned_to uuid default null,p_limit integer default 50,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare result jsonb;
begin
  perform crm_security.require_reader(false);
  perform crm_security.check_page(p_limit,p_offset);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'lead_id',r.lead_id,'task_type',r.task_type,'status',r.status,
    'assigned_to',r.assigned_to,'due_at',r.due_at,'scheduled_end_at',r.scheduled_end_at,
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

create or replace function crm_security.placement_summary(p public.placement_tests) returns jsonb
language sql stable set search_path=pg_catalog,pg_temp as $$
 select jsonb_build_object('id',p.id,'is_crm',true,'student_name',p.student_name,'date_test',p.date_test,'heure',p.heure,
 'scheduled_for',(p.date_test+crm_security.calendar_time(p.heure)) at time zone 'Africa/Casablanca','local_date',p.date_test,'local_time',crm_security.calendar_time(p.heure),
 'examinateur',p.examinateur,'status',p.status,
 'niveau_recommande',case when p.status in ('Résultat saisi','Affecté') then p.niveau_recommande end,
 'score',case when p.status in ('Résultat saisi','Affecté') then p.score end,'notes',p.notes,'updated_at',p.updated_at)
$$;

create or replace function crm_security.operational_card(lead uuid) returns jsonb
language sql stable set search_path=pg_catalog,pg_temp as $$
 select jsonb_build_object('id',l.id,'contact_id',c.id,'contact_name',c.display_name,
 'phone',coalesce(c.phone_e164,c.phone_raw),'phone_e164',c.phone_e164,'whatsapp_e164',coalesce(c.whatsapp_e164,c.phone_e164),
 'learner_name',l.learner_name,'learner_age',l.learner_age,'program',coalesce(l.session_type,l.program_interest_text),
 'failed_attempts',crm_security.failed_count(l),'status',l.status,'version',l.version,'owner_id',l.owner_id,'source_label',s.source_label,
 'next_task',case when t.id is not null then jsonb_build_object('id',t.id,'task_type',t.task_type,'due_at',t.due_at,'version',t.version)||crm_security.scheduled_civil(t.due_at) end,
 'next_placement',(select crm_security.placement_summary(p) from public.placement_tests p where p.crm_lead_id=l.id and p.status='Planifié' order by p.date_test,p.heure,p.id limit 1),
 'post_test_result',(select crm_security.placement_summary(p) from public.placement_tests p where p.id=t.placement_test_id and p.crm_lead_id=l.id and p.status in ('Résultat saisi','Affecté')),
 'last_activity',case when a.id is not null then jsonb_build_object('event_type',a.event_type,'occurred_at',a.occurred_at) end)
 from public.crm_leads l join public.crm_contacts c on c.id=l.contact_id
 join public.crm_submissions s on s.id=l.first_submission_id
 left join lateral(select t.id,t.task_type,t.due_at,t.version,t.placement_test_id from public.crm_tasks t where t.lead_id=l.id and t.status='open' order by t.due_at,t.id limit 1)t on true
 left join lateral(select a.id,a.event_type,a.occurred_at from public.crm_activities a where a.lead_id=l.id order by a.occurred_at desc,a.id desc limit 1)a on true
 where l.id=lead
$$;

create or replace function crm_security.opportunity_card(lead uuid) returns jsonb
language sql stable set search_path=pg_catalog,pg_temp as $$
 select jsonb_build_object('id',l.id,'contact_id',l.contact_id,'contact_name',c.display_name,
 'learner_name',l.learner_name,'learner_age',l.learner_age,'program',coalesce(nullif(l.session_type,''),nullif(l.program_interest_text,'')),
 'status',l.status,'version',l.version,'created_at',l.created_at,'owner_id',l.owner_id,
 'owner_name',case when l.owner_id is not null then coalesce(nullif(o.full_name,''),'Équipe accueil') end,
 'source_label',s.source_label,'channel',s.channel,'failed_attempts',crm_security.failed_count(l),
 'closure_reason',l.closure_reason,'closed_at',l.closed_at,
 'next_task',case when t.id is not null then jsonb_build_object('id',t.id,'task_type',t.task_type,'due_at',t.due_at,
 'version',t.version,'assigned_to',t.assigned_to,'attempt_ordinal',t.attempt_ordinal)||crm_security.scheduled_civil(t.due_at) end,
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
  'version',t.version,'assigned_to',t.assigned_to,'assignee_name',a.full_name,'attempt_ordinal',t.attempt_ordinal,
  'lead',jsonb_build_object('id',l.id,'version',l.version,'contact_name',c.display_name,
  'learner_name',l.learner_name,'program',coalesce(nullif(l.session_type,''),nullif(l.program_interest_text,'')),
  'status',l.status,'owner_id',l.owner_id,'owner_name',o.full_name)) order by s.due_at,s.id)
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

create or replace function public.crm_get_admissions_calendar(p_start date,p_end date,
 p_kind text default 'all',p_include_completed boolean default false,
 p_cursor jsonb default null,p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare fingerprint text; after_date date; after_time time; after_kind text; after_id uuid; result jsonb;
begin
 perform crm_security.require_reader(false);
 if p_start is null or p_end is null or not isfinite(p_start) or not isfinite(p_end)
 or p_end<=p_start or p_end-p_start>42
 or p_kind is null or p_kind not in ('all','placement','center_visit')
 or p_include_completed is null or p_limit is null or p_limit not between 1 and 100 then
 raise exception 'Invalid calendar range or filters' using errcode='22023'; end if;
 fingerprint:=md5(jsonb_build_array(auth.uid(),p_start,p_end,p_kind,p_include_completed)::text);
 perform crm_security.o3_cursor(p_cursor,'calendar',fingerprint);
 if p_cursor is not null then
  if p_cursor-array['v','kind','filter','date','time','event_kind','id']<>'{}'::jsonb
  or jsonb_typeof(p_cursor->'date') is distinct from 'string'
  or jsonb_typeof(p_cursor->'time') is distinct from 'string'
  or jsonb_typeof(p_cursor->'id') is distinct from 'string'
  or p_cursor->>'event_kind' is null or p_cursor->>'event_kind' not in ('placement','center_visit') then
  raise exception 'Invalid calendar cursor' using errcode='22023'; end if;
  after_date:=(p_cursor->>'date')::date; after_time:=(p_cursor->>'time')::time;
  after_kind:=p_cursor->>'event_kind'; after_id:=(p_cursor->>'id')::uuid;
  if not isfinite(after_date) or after_date<p_start or after_date>=p_end
  or (p_cursor->>'time')!~ '^(([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,6})?|24:00:00)$' then
  raise exception 'Invalid calendar cursor' using errcode='22023'; end if;
 end if;
 -- Cumulative RLS: admin/director have placement reads; 077 grants receptionist
 -- all placement reads, with 083 restricting linked reads to these same roles.
 -- This projection adds no role or row authority and does not join student data.
 with events as (
  select 'placement'::text kind,p.id,p.crm_lead_id lead_id,p.student_id,p.student_name display_name,
  l.status stage,p.status placement_status,null::text task_type,p.date_test local_date,
  crm_security.calendar_time(p.heure) local_time,
  (p.date_test+crm_security.calendar_time(p.heure)) at time zone 'Africa/Casablanca' starts_at,
  null::timestamptz ends_at,p.examinateur examiner_label,null::uuid assigned_to,
  null::text assignee_name,p.updated_at,null::bigint task_version
  from public.placement_tests p left join public.crm_leads l on l.id=p.crm_lead_id
  where p_kind in ('all','placement') and p.date_test>=p_start and p.date_test<p_end
  and (p.status='Planifié' or p_include_completed and p.status in ('Passé','Résultat saisi','Affecté'))
  union all
  select 'center_visit',t.id,t.lead_id,l.student_id,coalesce(l.learner_name,c.display_name),
  l.status,null,t.task_type,(t.due_at at time zone 'Africa/Casablanca')::date,
  (t.due_at at time zone 'Africa/Casablanca')::time,t.due_at,t.scheduled_end_at,null,t.assigned_to,
  a.full_name,t.updated_at,t.version
  from public.crm_tasks t join public.crm_leads l on l.id=t.lead_id
  join public.crm_contacts c on c.id=l.contact_id left join public.profiles a on a.id=t.assigned_to
  where p_kind in ('all','center_visit') and t.task_type='center_visit' and t.status='open'
  and l.merged_into_lead_id is null and l.status in ('NEW','CONTACTING','ENGAGED','QUALIFIED')
  and t.due_at>=p_start::timestamp at time zone 'Africa/Casablanca'
  and t.due_at<p_end::timestamp at time zone 'Africa/Casablanca'),
 page as materialized(select * from events where after_date is null or
  (local_date,coalesce(local_time,'24:00:00'::time),kind collate "C",id)>(after_date,after_time,after_kind collate "C",after_id)
  order by local_date,coalesce(local_time,'24:00:00'::time),kind collate "C",id limit p_limit+1),
 shown as(select * from page order by local_date,coalesce(local_time,'24:00:00'::time),kind collate "C",id limit p_limit)
 select jsonb_build_object('as_of',now(),'timezone','Africa/Casablanca','start_date',p_start,'end_date',p_end,
 'rows',coalesce((select jsonb_agg(jsonb_build_object('kind',kind,'id',id,'lead_id',lead_id,
 'student_id',student_id,'display_name',display_name,'stage',stage,'placement_status',placement_status,
 'task_type',task_type,'local_date',local_date,'local_time',local_time,'starts_at',starts_at,'ends_at',ends_at,
 'examiner_label',examiner_label,'assigned_to',assigned_to,'assignee_name',assignee_name,
 'updated_at',updated_at,'task_version',task_version,
 'end_local_date',crm_security.scheduled_civil(ends_at)->'local_date',
 'end_local_time',crm_security.scheduled_civil(ends_at)->'local_time')
 order by local_date,coalesce(local_time,'24:00:00'::time),kind collate "C",id) from shown),'[]'::jsonb),
 'has_more',(select count(*)>p_limit from page),'next_cursor',case when (select count(*)>p_limit from page) then
 (select jsonb_build_object('v',1,'kind','calendar','filter',fingerprint,'date',local_date,
 'time',coalesce(local_time,'24:00:00'::time),'event_kind',kind,'id',id)
 from shown order by local_date desc,coalesce(local_time,'24:00:00'::time) desc,kind collate "C" desc,id desc limit 1) end) into result;
 return result;
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
 raise exception 'Invalid calendar cursor' using errcode='22023';
end $$;

-- Owner-authorized presentation reference derived solely from the existing ID.
-- Base32 encodes all ID bits; select the shortest globally unique prefix so
-- same-name/same-role identities remain distinct across staff pages.
create function crm_security.staff_reference(account uuid) returns text
language plpgsql immutable strict set search_path=pg_catalog,pg_temp as $$
declare bits bit(130):=('x'||replace(account::text,'-',''))::bit(128)||B'00';
 reference text:=''; i integer;
begin
 for i in 0..25 loop
  reference:=reference||substr('0123456789ABCDEFGHJKMNPQRSTVWXYZ',substring(bits from i*5+1 for 5)::integer+1,1);
 end loop;
 return reference;
end $$;
revoke all on function crm_security.staff_reference(uuid) from public,anon,authenticated,service_role;

create or replace function public.crm_list_staff(p_limit integer default 50,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare result jsonb;
begin
 perform crm_security.require_reader(false);perform crm_security.check_page(p_limit,p_offset);
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
   else '' end display_label from staff s
 ), page as (select * from labelled order by name collate "C",id limit p_limit offset p_offset)
 select jsonb_build_object('total',(select count(*) from staff),
 'rows',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'role',role,'display_label',display_label)
  order by name collate "C",id) from page),'[]'::jsonb)) into result;
 return result;
end $$;

notify pgrst,'reload schema';
commit;
