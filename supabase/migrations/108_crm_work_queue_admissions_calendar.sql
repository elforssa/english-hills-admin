-- O3-r2 Batch 2: bounded reads and authorized legacy-time read correction.
-- No writes, RLS or existing grants change.
begin;

-- Independent local midnights: Casablanca days need not contain 24 hours.
create function crm_security.work_boundaries(stamp timestamptz)
returns table(d0 timestamptz,d1 timestamptz,d2 timestamptz)
language sql stable set search_path=pg_catalog,pg_temp as $$
 select local_day::timestamp at time zone 'Africa/Casablanca',
 (local_day+1)::timestamp at time zone 'Africa/Casablanca',
 (local_day+2)::timestamp at time zone 'Africa/Casablanca'
 from (select (stamp at time zone 'Africa/Casablanca')::date as local_day)x
$$;

create function public.crm_get_work_queue(p_bucket text default 'today',
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
  'task_type',t.task_type,'due_at',t.due_at,'scheduled_end_at',t.scheduled_end_at,
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

-- Text time is legacy input. Missing/malformed values remain unspecified.
create function crm_security.calendar_time(value text) returns time
language sql immutable set search_path=pg_catalog,pg_temp as $$
 select case when btrim(value) ~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9](\.[0-9]{1,6})?)?$'
 then btrim(value)::time end
$$;

-- Forward compatibility correction: retain the 107 predicates and existing ACL.
-- An unknown legacy time cannot establish a known future appointment.
create or replace function crm_security.opportunity_ids(v text,q text,contact uuid,owner_mode text,owner uuid,
 channel text,source text,program_kind text,program text,as_of timestamptz)
returns table(id uuid,status text,created_at timestamptz)
language plpgsql stable set search_path=pg_catalog,pg_temp set plan_cache_mode=force_custom_plan as $$
begin return query
 select l.id,l.status,l.created_at from public.crm_leads l
 join public.crm_contacts c on c.id=l.contact_id
 join public.crm_submissions s on s.id=l.first_submission_id
 where l.merged_into_lead_id is null
 and ($3 is null or l.contact_id=$3)
 and ($4='all' or $4='me' and l.owner_id=auth.uid()
   or $4='unassigned' and l.owner_id is null or $4='staff' and l.owner_id=$5)
 and ($6 is null or s.channel=$6) and ($7 is null or s.source_label=$7)
 and ($8='all' or $8='session' and nullif(l.session_type,'')=$9
   or $8='interest' and nullif(l.session_type,'') is null and nullif(l.program_interest_text,'')=$9
   or $8='unspecified' and nullif(l.session_type,'') is null and nullif(l.program_interest_text,'') is null)
 and ($2='' or strpos(lower(c.display_name),lower($2))>0 or strpos(lower(coalesce(l.learner_name,'')),lower($2))>0
   or (crm_security.normalize_phone($2) is not null and (c.phone_e164=crm_security.normalize_phone($2) or c.whatsapp_e164=crm_security.normalize_phone($2)))
   or (length(regexp_replace($2,'[^0-9]','','g'))>=3 and strpos(coalesce(c.phone_e164,c.phone_raw,''),regexp_replace($2,'[^0-9]','','g'))>0))
 and case $1
 when 'all' then true
 when 'mine' then l.owner_id=auth.uid()
 when 'new_today' then l.created_at>=(($10 at time zone 'Africa/Casablanca')::date)::timestamp at time zone 'Africa/Casablanca'
   and l.created_at<((($10 at time zone 'Africa/Casablanca')::date)+1)::timestamp at time zone 'Africa/Casablanca'
 when 'qualified' then l.status='QUALIFIED'
 when 'closed' then l.status in ('LOST','NOT_QUALIFIED')
 when 'no_response' then l.status in ('NEW','CONTACTING','ENGAGED','QUALIFIED') and crm_security.failed_count(l)>0
 when 'follow_up_today' then l.status in ('NEW','CONTACTING','ENGAGED','QUALIFIED') and exists(
   select 1 from public.crm_tasks t where t.lead_id=l.id and t.status='open'
   and t.due_at>=(($10 at time zone 'Africa/Casablanca')::date)::timestamp at time zone 'Africa/Casablanca'
   and t.due_at<((($10 at time zone 'Africa/Casablanca')::date)+1)::timestamp at time zone 'Africa/Casablanca')
 when 'placement' then l.status in ('NEW','CONTACTING','ENGAGED','QUALIFIED') and
   (exists(select 1 from public.placement_tests p where p.crm_lead_id=l.id and p.status='Planifié')
    or exists(select 1 from public.crm_tasks t where t.lead_id=l.id and t.status='open' and t.task_type in ('confirm_placement_test','post_test_followup')))
 when 'attention' then l.status in ('NEW','CONTACTING','ENGAGED','QUALIFIED') and (
   exists(select 1 from public.crm_tasks t where t.lead_id=l.id and t.status='open' and t.due_at<$10)
   or l.status='NEW' and exists(select 1 from public.crm_tasks t where t.lead_id=l.id and t.status='open' and t.task_type='first_contact')
   or (select t.due_at from public.crm_tasks t where t.lead_id=l.id and t.status='open' order by t.due_at,t.id limit 1)
      <((($10 at time zone 'Africa/Casablanca')::date)+1)::timestamp at time zone 'Africa/Casablanca'
   or not exists(select 1 from public.crm_tasks t where t.lead_id=l.id and t.status='open')
      and not exists(select 1 from public.placement_tests p where p.crm_lead_id=l.id and p.status='Planifié' and (p.date_test+crm_security.calendar_time(p.heure)) at time zone 'Africa/Casablanca'>=$10)
   or l.status='CONTACTING' and coalesce(l.last_attempt_at,l.created_at)<$10-make_interval(mins=>(select p.stale_contacting_minutes from public.crm_followup_policies p where p.id=l.followup_policy_id)))
 else false end;
end
$$;

create function public.crm_get_admissions_calendar(p_start date,p_end date,
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
 'updated_at',updated_at,'task_version',task_version)
 order by local_date,coalesce(local_time,'24:00:00'::time),kind collate "C",id) from shown),'[]'::jsonb),
 'has_more',(select count(*)>p_limit from page),'next_cursor',case when (select count(*)>p_limit from page) then
 (select jsonb_build_object('v',1,'kind','calendar','filter',fingerprint,'date',local_date,
 'time',coalesce(local_time,'24:00:00'::time),'event_kind',kind,'id',id)
 from shown order by local_date desc,coalesce(local_time,'24:00:00'::time) desc,kind collate "C" desc,id desc limit 1) end) into result;
 return result;
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
 raise exception 'Invalid calendar cursor' using errcode='22023';
end $$;

revoke all on function crm_security.work_boundaries(timestamptz),crm_security.calendar_time(text) from public,anon,authenticated,service_role;
revoke all on function public.crm_get_work_queue(text,text,uuid,text,uuid,jsonb,integer),public.crm_get_admissions_calendar(date,date,text,boolean,jsonb,integer) from public,anon,authenticated,service_role;
grant execute on function public.crm_get_work_queue(text,text,uuid,text,uuid,jsonb,integer),public.crm_get_admissions_calendar(date,date,text,boolean,jsonb,integer) to authenticated;
notify pgrst,'reload schema';
commit;
