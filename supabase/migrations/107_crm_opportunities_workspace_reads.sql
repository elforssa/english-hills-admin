-- O3-r2 / Batch 1. Additive operational reads; existing commands/grants unchanged.
begin;
create function crm_security.o3_cursor(c jsonb, kind text, fingerprint text) returns void
language plpgsql immutable set search_path=pg_catalog,pg_temp as $$ begin
 if c is null then return; end if;
 if jsonb_typeof(c) is distinct from 'object' or octet_length(c::text)>2048
 or c->'v' is distinct from '1'::jsonb or c->>'kind' is distinct from kind
 or c->>'filter' is distinct from fingerprint then
 raise exception 'Invalid cursor' using errcode='22023'; end if;
end $$;

create function crm_security.opportunity_ids(v text,q text,contact uuid,owner_mode text,owner uuid,
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
      and not exists(select 1 from public.placement_tests p where p.crm_lead_id=l.id and p.status='Planifié' and (p.date_test+p.heure::time) at time zone 'Africa/Casablanca'>=$10)
   or l.status='CONTACTING' and coalesce(l.last_attempt_at,l.created_at)<$10-make_interval(mins=>(select p.stale_contacting_minutes from public.crm_followup_policies p where p.id=l.followup_policy_id)))
 else false end;
end
$$;

-- Called only for a bounded page; no full operational_card/placement notes.
create function crm_security.opportunity_card(lead uuid) returns jsonb
language sql stable set search_path=pg_catalog,pg_temp as $$
 select jsonb_build_object('id',l.id,'contact_id',l.contact_id,'contact_name',c.display_name,
 'learner_name',l.learner_name,'learner_age',l.learner_age,'program',coalesce(nullif(l.session_type,''),nullif(l.program_interest_text,'')),
 'status',l.status,'version',l.version,'created_at',l.created_at,'owner_id',l.owner_id,
 'owner_name',case when l.owner_id is not null then coalesce(nullif(o.full_name,''),'Équipe accueil') end,
 'source_label',s.source_label,'channel',s.channel,'failed_attempts',crm_security.failed_count(l),
 'closure_reason',l.closure_reason,'closed_at',l.closed_at,
 'next_task',case when t.id is not null then jsonb_build_object('id',t.id,'task_type',t.task_type,'due_at',t.due_at,
 'version',t.version,'assigned_to',t.assigned_to,'attempt_ordinal',t.attempt_ordinal) end,
 'next_placement',case when p.id is not null then jsonb_build_object('id',p.id,'scheduled_for',(p.date_test+p.heure::time) at time zone 'Africa/Casablanca','status',p.status) end,
 'last_activity_at',(select a.occurred_at from public.crm_activities a where a.lead_id=l.id order by a.occurred_at desc,a.id desc limit 1))
 from public.crm_leads l join public.crm_contacts c on c.id=l.contact_id
 join public.crm_submissions s on s.id=l.first_submission_id left join public.profiles o on o.id=l.owner_id
 left join lateral(select t.id,t.task_type,t.due_at,t.version,t.assigned_to,t.attempt_ordinal from public.crm_tasks t where t.lead_id=l.id and t.status='open' order by t.due_at,t.id limit 1)t on true
 left join lateral(select p.id,p.date_test,p.heure,p.status from public.placement_tests p where p.crm_lead_id=l.id and p.status='Planifié' limit 1)p on true
 where l.id=lead
$$;

create function public.crm_get_opportunities(p_view text default 'all',p_query text default '',p_contact uuid default null,
 p_owner_mode text default 'all',p_owner uuid default null,p_channel text default null,p_source_label text default null,
 p_program_kind text default 'all',p_program text default null,p_layout text default 'board',p_stage text default null,
 p_limit integer default 25,p_cursor jsonb default null)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare result jsonb; q text:=btrim(coalesce(p_query,'')); fingerprint text; stamp timestamptz; cid uuid; at_time timestamptz:=now();
begin
 perform crm_security.require_reader(false);
 if p_view is null or p_view not in ('all','mine','new_today','attention','follow_up_today','placement','qualified','no_response','closed')
 or length(q)>120 or p_owner_mode is null or p_owner_mode not in ('all','me','unassigned','staff')
 or (p_owner_mode='staff')<>(p_owner is not null)
 or p_channel is not null and p_channel not in ('manual','meta_instant_form','website')
 or p_source_label is not null and (length(p_source_label)>200 or p_source_label='')
 or p_program_kind is null or p_program_kind not in ('all','session','interest','unspecified')
 or (p_program_kind in ('session','interest'))<>(p_program is not null)
 or p_program is not null and (length(p_program)>200 or p_program='')
 or p_layout is null or p_layout not in ('board','list') or p_view='closed' and p_layout<>'list'
 or p_stage is not null and p_stage not in ('NEW','CONTACTING','ENGAGED','QUALIFIED','CONVERTED','LOST','NOT_QUALIFIED')
 or p_layout='board' and p_stage in ('LOST','NOT_QUALIFIED')
 or p_limit is null or p_limit not between 1 and 25 or p_cursor is not null and p_layout='board' and p_stage is null
 then raise exception 'Invalid opportunity filters' using errcode='22023'; end if;
 fingerprint:=md5(jsonb_build_array(auth.uid(),p_view,q,p_contact,p_owner_mode,p_owner,p_channel,p_source_label,p_program_kind,p_program,p_layout,p_stage)::text);
 perform crm_security.o3_cursor(p_cursor,'opportunities',fingerprint);
 if p_cursor is not null then
  if p_cursor-array['v','kind','filter','at','id','stage']<>'{}'::jsonb or p_cursor->'stage' is distinct from coalesce(to_jsonb(p_stage),'null'::jsonb) or jsonb_typeof(p_cursor->'at') is distinct from 'string' or jsonb_typeof(p_cursor->'id') is distinct from 'string' then raise exception 'Invalid cursor' using errcode='22023'; end if;
  stamp:=(p_cursor->>'at')::timestamptz; cid:=(p_cursor->>'id')::uuid;
  if not isfinite(stamp) then raise exception 'Invalid cursor' using errcode='22023'; end if;
 end if;
 with matching as materialized(select * from crm_security.opportunity_ids(p_view,q,p_contact,p_owner_mode,p_owner,p_channel,p_source_label,p_program_kind,p_program,at_time)),
 stages as(select unnest(case when p_layout='board' and p_stage is null then array['NEW','CONTACTING','ENGAGED','QUALIFIED','CONVERTED'] else array[coalesce(p_stage,'list')] end) stage),
 pages as(select stages.stage, x.* from stages cross join lateral(
   select m.* from matching m where (stages.stage='list' or m.status=stages.stage)
   and (stamp is null or (m.created_at,m.id)<(stamp,cid)) order by m.created_at desc,m.id desc limit p_limit+1)x),
 payloads as(select st.stage,jsonb_build_object('rows',coalesce((select jsonb_agg(crm_security.opportunity_card(b.id) order by b.created_at desc,b.id desc) from (select * from pages where stage=st.stage order by created_at desc,id desc limit p_limit)b),'[]'::jsonb),
 'has_more',(select count(*)>p_limit from pages where stage=st.stage),
 'next_cursor',case when (select count(*)>p_limit from pages where stage=st.stage) then (select jsonb_build_object('v',1,'kind','opportunities','stage',case when st.stage='list' then null else st.stage end,'filter',
 md5(jsonb_build_array(auth.uid(),p_view,q,p_contact,p_owner_mode,p_owner,p_channel,p_source_label,p_program_kind,p_program,p_layout,case when st.stage='list' then null else st.stage end)::text),'at',b.created_at,'id',b.id)
 from (select * from pages where stage=st.stage order by created_at desc,id desc limit p_limit)b order by b.created_at,b.id limit 1) end) payload from stages st)
 select jsonb_build_object('as_of',at_time,'timezone','Africa/Casablanca','total',(select count(*) from matching),
 'counts',(select jsonb_object_agg(s,coalesce(n,0)) from unnest(array['NEW','CONTACTING','ENGAGED','QUALIFIED','CONVERTED','LOST','NOT_QUALIFIED'])s left join (select status,count(*) n from matching group by status)c on c.status=s),
 'pages',(select jsonb_object_agg(stage,payload) from payloads)) into result;
 return result;
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then raise exception 'Invalid cursor' using errcode='22023';
end $$;

create function public.crm_get_operational_acquisition_summary(p_lead uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$ declare result jsonb; begin
 perform crm_security.require_reader(false);
 if p_lead is null then raise exception 'Lead required' using errcode='22023'; end if;
 select jsonb_build_object('first_inquiry',jsonb_build_object('channel',f.channel,'source_label',f.source_label,'occurred_at',f.occurred_at),
 'latest_inquiry',jsonb_build_object('channel',s.channel,'source_label',s.source_label,'occurred_at',s.occurred_at)) into result
 from public.crm_leads l join public.crm_submissions f on f.id=l.first_submission_id join public.crm_submissions s on s.id=l.latest_submission_id where l.id=p_lead;
 return result;
end $$;

create function public.crm_get_timeline(p_lead uuid,p_cursor jsonb default null,p_limit integer default 20) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare result jsonb; fingerprint text:=md5(jsonb_build_array(p_lead)::text); stamp timestamptz; cid uuid;
begin
 perform crm_security.require_reader(false);
 if p_lead is null or p_limit is null or p_limit not between 1 and 50 then raise exception 'Invalid timeline input' using errcode='22023'; end if;
 perform crm_security.o3_cursor(p_cursor,'timeline',fingerprint);
 if p_cursor is not null then
  if p_cursor-array['v','kind','filter','at','id']<>'{}'::jsonb or jsonb_typeof(p_cursor->'at') is distinct from 'string' or jsonb_typeof(p_cursor->'id') is distinct from 'string' then raise exception 'Invalid cursor' using errcode='22023'; end if;
  stamp:=(p_cursor->>'at')::timestamptz; cid:=(p_cursor->>'id')::uuid;
  if not isfinite(stamp) then raise exception 'Invalid cursor' using errcode='22023'; end if;
 end if;
 with page as materialized(select a.id,a.occurred_at,a.event_type,a.body,a.outcome,a.actor_id,a.actor_kind from public.crm_activities a
 where a.lead_id=p_lead and (stamp is null or (a.occurred_at,a.id)<(stamp,cid)) order by a.occurred_at desc,a.id desc limit p_limit+1),
 shown as(select * from page order by occurred_at desc,id desc limit p_limit)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'occurred_at',a.occurred_at,'event_type',a.event_type,'body',a.body,'outcome',a.outcome,
 'actor_name',coalesce(p.full_name,case when a.actor_kind='user' then 'Équipe accueil' else 'Système' end)) order by a.occurred_at desc,a.id desc) from shown a left join public.profiles p on p.id=a.actor_id),'[]'::jsonb),
 'has_more',(select count(*)>p_limit from page),'next_cursor',case when (select count(*)>p_limit from page) then
 (select jsonb_build_object('v',1,'kind','timeline','filter',fingerprint,'at',a.occurred_at,'id',a.id) from shown a order by a.occurred_at,a.id limit 1) end) into result;
 return result;
exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then raise exception 'Invalid cursor' using errcode='22023';
end $$;

create function public.crm_get_opportunity_filter_options(p_kind text,p_query text default '',p_cursor jsonb default null,p_limit integer default 50) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare result jsonb; q text:=btrim(coalesce(p_query,'')); fingerprint text; after_key text;
begin
 perform crm_security.require_reader(false);
 if p_kind is null or p_kind not in ('source','program') or length(q)>120 or p_limit is null or p_limit not between 1 and 50 then raise exception 'Invalid facet' using errcode='22023'; end if;
 fingerprint:=md5(jsonb_build_array(p_kind,q)::text); perform crm_security.o3_cursor(p_cursor,'facet',fingerprint);
 if p_cursor is not null then
  if p_cursor-array['v','kind','filter','key']<>'{}'::jsonb or jsonb_typeof(p_cursor->'key') is distinct from 'string' or length(p_cursor->>'key')>500 then raise exception 'Invalid facet cursor' using errcode='22023'; end if;
  after_key:=p_cursor->>'key';
 end if;
 with options as (
 select distinct case when p_kind='source' then s.channel when nullif(l.session_type,'') is not null then 'session' when nullif(l.program_interest_text,'') is not null then 'interest' else 'unspecified' end kind,
 case when p_kind='source' then s.source_label else coalesce(nullif(l.session_type,''),nullif(l.program_interest_text,''),'') end value
 from public.crm_leads l join public.crm_submissions s on s.id=l.first_submission_id where l.merged_into_lead_id is null),
 keyed as(select *,jsonb_build_array(kind,value)::text collate "C" key from options where length(value)<=200 and (q='' or strpos(lower(value),lower(q))>0)),
 page as materialized(select * from keyed where after_key is null or key>after_key collate "C" order by key limit p_limit+1),
 shown as(select * from page order by key limit p_limit)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(jsonb_build_object('kind',kind,'value',value) order by key) from shown),'[]'::jsonb),
 'has_more',(select count(*)>p_limit from page),'next_cursor',case when (select count(*)>p_limit from page) then
 (select jsonb_build_object('v',1,'kind','facet','filter',fingerprint,'key',key) from shown order by key desc limit 1) end) into result;
 return result;
end $$;

revoke all on function crm_security.o3_cursor(jsonb,text,text),crm_security.opportunity_ids(text,text,uuid,text,uuid,text,text,text,text,timestamptz),crm_security.opportunity_card(uuid) from public,anon,authenticated,service_role;
revoke all on function public.crm_get_opportunities(text,text,uuid,text,uuid,text,text,text,text,text,text,integer,jsonb),public.crm_get_opportunity_filter_options(text,text,jsonb,integer),public.crm_get_operational_acquisition_summary(uuid),public.crm_get_timeline(uuid,jsonb,integer) from public,anon,authenticated,service_role;
grant execute on function public.crm_get_opportunities(text,text,uuid,text,uuid,text,text,text,text,text,text,integer,jsonb),public.crm_get_opportunity_filter_options(text,text,jsonb,integer),public.crm_get_operational_acquisition_summary(uuid),public.crm_get_timeline(uuid,jsonb,integer) to authenticated;
notify pgrst,'reload schema';
commit;
