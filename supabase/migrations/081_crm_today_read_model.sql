-- Phase 4: bounded, operational reads only. No mutations or integrations.
begin;
create function crm_security.operational_card(lead uuid) returns jsonb
language sql stable set search_path=pg_catalog,pg_temp as $$
 select jsonb_build_object('id',l.id,'contact_id',c.id,'contact_name',c.display_name,
 'phone',coalesce(c.phone_e164,c.phone_raw),'phone_e164',c.phone_e164,'whatsapp_e164',coalesce(c.whatsapp_e164,c.phone_e164),
 'learner_name',l.learner_name,'learner_age',l.learner_age,'program',coalesce(l.session_type,l.program_interest_text),
 'failed_attempts',crm_security.failed_count(l),'status',l.status,'version',l.version,'owner_id',l.owner_id,'source_label',s.source_label,
 'next_task',case when t.id is not null then jsonb_build_object('id',t.id,'task_type',t.task_type,'due_at',t.due_at,'version',t.version) end,
 'last_activity',case when a.id is not null then jsonb_build_object('event_type',a.event_type,'occurred_at',a.occurred_at) end)
 from public.crm_leads l join public.crm_contacts c on c.id=l.contact_id
 join public.crm_submissions s on s.id=l.first_submission_id
 left join lateral(select t.id,t.task_type,t.due_at,t.version from public.crm_tasks t where t.lead_id=l.id and t.status='open' order by t.due_at,t.id limit 1)t on true
 left join lateral(select a.id,a.event_type,a.occurred_at from public.crm_activities a where a.lead_id=l.id order by a.occurred_at desc,a.id desc limit 1)a on true
 where l.id=lead
$$;

create function public.crm_search_leads(p_query text default '',p_status text default null,p_contact uuid default null,p_limit integer default 25,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare result jsonb; q text:=btrim(coalesce(p_query,'')); canonical text;
begin
 perform crm_security.require_reader(false);perform crm_security.check_page(p_limit,p_offset);
 if length(q)>120 or (p_status is not null and p_status not in ('NEW','CONTACTING','ENGAGED','QUALIFIED','LOST','NOT_QUALIFIED','CONVERTED')) then raise exception 'Invalid search' using errcode='22023'; end if;
 canonical:=crm_security.normalize_phone(q);
 with matching as (
 select l.id,l.created_at from public.crm_leads l join public.crm_contacts c on c.id=l.contact_id
 where l.merged_into_lead_id is null and (p_status is null or l.status=p_status) and (p_contact is null or c.id=p_contact)
 and (q='' or strpos(lower(coalesce(c.display_name,'')),lower(q))>0 or strpos(lower(coalesce(l.learner_name,'')),lower(q))>0
 or (canonical is not null and (c.phone_e164=canonical or c.whatsapp_e164=canonical))
 or (length(regexp_replace(q,'[^0-9]','','g'))>=3 and (strpos(coalesce(c.phone_e164,c.phone_raw,''),regexp_replace(q,'[^0-9]','','g'))>0)))
 ), page as(select id,created_at from matching order by created_at desc,id desc limit p_limit offset p_offset)
 select jsonb_build_object('total',(select count(*) from matching),'rows',coalesce((select jsonb_agg(crm_security.operational_card(id) order by created_at desc,id desc) from page),'[]'::jsonb)) into result;
 return result;
end $$;

create function public.crm_get_today(p_limit integer default 30,p_offset integer default 0,p_schedule_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare result jsonb; start_at timestamptz:=((now() at time zone 'Africa/Casablanca')::date)::timestamp at time zone 'Africa/Casablanca'; end_at timestamptz;
begin
 perform crm_security.require_reader(false);perform crm_security.check_page(p_limit,p_offset);perform crm_security.check_page(p_limit,p_schedule_offset);
 end_at:=(((now() at time zone 'Africa/Casablanca')::date)+1)::timestamp at time zone 'Africa/Casablanca';
 with active as (
 select l.id,l.status,l.created_at,coalesce(l.last_attempt_at,l.created_at) last_contact,
 coalesce((select max(greatest(f.completed_at,f.cancelled_at)) from public.crm_tasks f where f.lead_id=l.id and f.status<>'open'),l.created_at) unattended_since,
 p.stale_contacting_minutes,t.id task_id,t.due_at,
 exists(select 1 from public.crm_tasks f where f.lead_id=l.id and f.status='open' and f.task_type='first_contact') first_contact
 from public.crm_leads l join public.crm_followup_policies p on p.id=l.followup_policy_id
 left join lateral(select t.id,t.due_at from public.crm_tasks t where t.lead_id=l.id and t.status='open' order by t.due_at,t.id limit 1)t on true
 where l.status in ('NEW','CONTACTING','ENGAGED','QUALIFIED') and l.merged_into_lead_id is null
 ), ranked as (
 select id,case when due_at<now() then 1 when status='NEW' and first_contact then 2 when due_at>=start_at and due_at<end_at then 3
 when task_id is null then 4 when status='CONTACTING' and last_contact<now()-make_interval(mins=>stale_contacting_minutes) then 5 end priority,
 case when due_at<now() then due_at
 when status='NEW' and first_contact then created_at
 when due_at>=start_at and due_at<end_at then due_at
 when task_id is null then unattended_since else last_contact end sort_at,
 status='CONTACTING' and last_contact<now()-make_interval(mins=>stale_contacting_minutes) stale
 from active
 ), attention as(select id,priority,sort_at,stale from ranked where priority is not null order by priority,sort_at,id limit p_limit offset p_offset),
 schedule as (
 select t.id,t.lead_id,t.task_type,t.due_at,t.version from public.crm_tasks t join active l on l.id=t.lead_id
 where t.status='open' and t.due_at>=start_at and t.due_at<end_at order by t.due_at,t.id limit p_limit offset p_schedule_offset
 )
 select jsonb_build_object('as_of',now(),'timezone','Africa/Casablanca',
 'counts',jsonb_build_object('new',(select count(*) from active where status='NEW' and first_contact),
 'overdue',(select count(*) from public.crm_tasks t join active a on a.id=t.lead_id where t.status='open' and t.due_at<now()),
 'callbacks',(select count(*) from public.crm_tasks t join active a on a.id=t.lead_id where t.status='open' and t.task_type='callback' and t.due_at>=start_at and t.due_at<end_at),
 'due_today',(select count(*) from public.crm_tasks t join active a on a.id=t.lead_id where t.status='open' and t.due_at>=start_at and t.due_at<end_at)),
 'attention_total',(select count(*) from ranked where priority is not null),
 'needs_attention',coalesce((select jsonb_agg(crm_security.operational_card(id)||jsonb_build_object('priority',priority,'stale',stale) order by priority,sort_at,id) from attention),'[]'::jsonb),
 'schedule_total',(select count(*) from public.crm_tasks t join active a on a.id=t.lead_id where t.status='open' and t.due_at>=start_at and t.due_at<end_at),
 'today_schedule',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'task_type',s.task_type,'due_at',s.due_at,'version',s.version,'lead',crm_security.operational_card(s.lead_id)) order by s.due_at,s.id) from schedule s),'[]'::jsonb)) into result;
 return result;
end $$;

-- Plain scalar answers only. Provider/attribution diagnostics are not operational
-- answers even if placed into the flexible answer envelope. No object JSON.
-- Normalize each key/label independently: joining them can hide word boundaries.
-- Reserved metadata namespaces are suppressed even in an otherwise valid answer.
create function crm_security.reserved_answer_key(value text) returns boolean
language sql immutable set search_path=pg_catalog,pg_temp as $$
 with normalized as (
 select regexp_replace(lower(coalesce(value,'')),'[^a-z0-9]','','g') compact,
 regexp_replace(lower(regexp_replace(coalesce(value,''),'([a-z0-9])([A-Z])','\1 \2','g')),'[^a-z0-9]+',' ','g') words
 )
 select compact ~ '^(campaign|campagne|adset|leadgen|metalead|external|provider|utm|financial|balance|charge|receipt|payment|revenue|tracking|payload|rawpayload|spend|roas|cpql|cpl|cac|fbclid|fbc|fbp)'
 or compact ~ '(campaign|campagne|adset|leadgen|financial|balance|charge|receipt|payment|revenue|tracking|payload|attribution|fbclid)'
 or compact ~ '(token|hash)$'
 or compact ~ '(campaignid|adsetid|adid|accountid|pageid|formid|leadid|submissionid|externalid|providerid|rawpayload|financialbalance)'
 or compact in ('ad','ads','account','pixel','token','hash','attribution','technical','technique')
 or words ~ '(^| )(ad|ads|campaign|adset|leadgen|provider|external|utm|financial|balance|charge|receipt|payment|revenue|tracking|payload|spend|roas|cpl|cpql|cac|fbclid|fbc|fbp|token|hash|attribution)( |$)'
 from normalized
$$;

create function crm_security.operational_answers(answers jsonb) returns jsonb
language sql immutable set search_path=pg_catalog,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object('key',a->>'key','label',a->>'label','value',a->'value') order by n),'[]'::jsonb)
 from jsonb_array_elements(answers) with ordinality x(a,n)
 where not crm_security.reserved_answer_key(a->>'key')
 and not crm_security.reserved_answer_key(a->>'label') and jsonb_typeof(a->'value') in ('string','number','boolean','array','null')
 and not exists(select 1 from jsonb_array_elements(case when jsonb_typeof(a->'value')='array' then a->'value' else '[]'::jsonb end)v where jsonb_typeof(v) not in ('string','number','boolean','null'))
$$;

create function public.crm_get_workspace_detail(p_lead uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$ declare result jsonb; begin
 perform crm_security.require_reader(false);
 select crm_security.operational_card(l.id)||jsonb_build_object('contact',jsonb_build_object('display_name',c.display_name,'phone',coalesce(c.phone_e164,c.phone_raw),
 'phone_e164',c.phone_e164,'whatsapp_e164',coalesce(c.whatsapp_e164,c.phone_e164),'email',c.email_normalized),
 'qualification_step',l.qualification_step,'closure_reason',l.closure_reason,'closure_note',l.closure_note,'last_conversation_at',l.last_conversation_at,
 'outreach_cycle',l.outreach_cycle,'failed_attempts',crm_security.failed_count(l),
 'unreachable_eligible',l.status in ('CONTACTING','ENGAGED','QUALIFIED') and crm_security.failed_count(l)>=5,
 'open_tasks',public.crm_list_open_tasks(l.id,null,100,0),
 'open_task_count',(select count(*) from public.crm_tasks where lead_id=l.id and status='open')) into result
 from public.crm_leads l join public.crm_contacts c on c.id=l.contact_id where l.id=p_lead;
 return result;
end $$;

create function public.crm_get_history(p_lead uuid,p_limit integer default 30,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$ declare result jsonb; begin
 perform crm_security.require_reader(false);perform crm_security.check_page(p_limit,p_offset);
 select jsonb_build_object('total',(select count(*) from public.crm_activities where lead_id=p_lead),
 'rows',coalesce(jsonb_agg(jsonb_build_object('id',a.id,'occurred_at',a.occurred_at,'event_type',a.event_type,'body',a.body,'outcome',a.outcome,
 'actor_name',coalesce(p.full_name,case when a.actor_kind='user' then 'Équipe accueil' else 'Système' end)) order by a.occurred_at,a.id),'[]'::jsonb)) into result
 from(select id,occurred_at,event_type,body,outcome,actor_id,actor_kind from public.crm_activities where lead_id=p_lead order by occurred_at,id limit p_limit offset p_offset)a
 left join public.profiles p on p.id=a.actor_id;
 return result;
end $$;

create function public.crm_get_form_answers(p_lead uuid,p_limit integer default 10,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$ declare result jsonb; begin
 perform crm_security.require_reader(false);perform crm_security.check_page(p_limit,p_offset);
 select jsonb_build_object('total',(select count(*) from public.crm_submissions where lead_id=p_lead),'rows',coalesce(jsonb_agg(jsonb_build_object(
 'id',s.id,'occurred_at',s.occurred_at,'source_label',s.source_label,'answers',crm_security.operational_answers(s.form_answers)) order by s.occurred_at,s.id),'[]'::jsonb)) into result
 from(select id,occurred_at,source_label,form_answers from public.crm_submissions where lead_id=p_lead order by occurred_at,id limit p_limit offset p_offset)s;
 return result;
end $$;

create function public.crm_list_staff(p_limit integer default 50,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$ declare result jsonb; begin
 perform crm_security.require_reader(false);perform crm_security.check_page(p_limit,p_offset);
 select jsonb_build_object('total',(select count(*) from public.profiles where role in ('director','admin','receptionist')),
 'rows',coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',coalesce(nullif(p.full_name,''),'Équipe accueil'),'role',p.role) order by p.full_name nulls last,p.id),'[]'::jsonb)) into result
 from(select id,full_name,role from public.profiles where role in ('director','admin','receptionist') order by full_name nulls last,id limit p_limit offset p_offset)p;
 return result;
end $$;
revoke all on function crm_security.operational_card(uuid),crm_security.operational_answers(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.crm_search_leads(text,text,uuid,integer,integer),public.crm_get_today(integer,integer,integer),public.crm_get_workspace_detail(uuid),public.crm_get_history(uuid,integer,integer),public.crm_get_form_answers(uuid,integer,integer),public.crm_list_staff(integer,integer) from public,anon,authenticated,service_role;
grant execute on function public.crm_search_leads(text,text,uuid,integer,integer),public.crm_get_today(integer,integer,integer),public.crm_get_workspace_detail(uuid),public.crm_get_history(uuid,integer,integer),public.crm_get_form_answers(uuid,integer,integer),public.crm_list_staff(integer,integer) to authenticated;
notify pgrst,'reload schema';
commit;
