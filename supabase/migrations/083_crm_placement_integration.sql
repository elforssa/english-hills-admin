-- Phase 5: reuse center placement tests for qualified CRM prospects.
begin;
alter table public.placement_tests add column crm_lead_id uuid references public.crm_leads(id) on delete restrict;
create index placement_tests_crm_lead_idx on public.placement_tests(crm_lead_id,date_test,id) where crm_lead_id is not null;
create unique index placement_tests_one_planned_crm on public.placement_tests(crm_lead_id) where crm_lead_id is not null and status='Planifié';

-- Keep existing non-CRM column writes. Only the trusted booking command may
-- supply the new link; a table-wide grant would bypass a column-level revoke.
revoke insert,update on public.placement_tests from public,anon,authenticated,service_role;
grant insert(id,created_at,updated_at,student_id,student_name,date_test,heure,examinateur,score,niveau_recommande,status,groupe_affecte_id,notes),
 update(id,created_at,updated_at,student_id,student_name,date_test,heure,examinateur,score,niveau_recommande,status,groupe_affecte_id,notes)
 on public.placement_tests to anon,authenticated,service_role;
create policy crm_placement_operational_only on public.placement_tests as restrictive for all to authenticated
 using (crm_lead_id is null or public.get_my_role() in ('director','admin','receptionist'))
 with check (crm_lead_id is null or public.get_my_role() in ('director','admin','receptionist'));

create function crm_security.placement_summary(p public.placement_tests) returns jsonb
language sql stable set search_path=pg_catalog,pg_temp as $$
 select jsonb_build_object('id',p.id,'is_crm',true,'student_name',p.student_name,'date_test',p.date_test,'heure',p.heure,
 'scheduled_for',(p.date_test+p.heure::time) at time zone 'Africa/Casablanca','examinateur',p.examinateur,'status',p.status,
 'niveau_recommande',case when p.status in ('Résultat saisi','Affecté') then p.niveau_recommande end,
 'score',case when p.status in ('Résultat saisi','Affecté') then p.score end,'notes',p.notes,'updated_at',p.updated_at)
$$;

create function crm_security.placement_integrity() returns trigger
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ declare student uuid; begin
 if tg_op='DELETE' then
  if old.crm_lead_id is not null then raise exception 'CRM-linked placement history cannot be deleted' using errcode='42501'; end if;
  return old;
 end if;
 if tg_op='UPDATE' and new.crm_lead_id is distinct from old.crm_lead_id then
  raise exception 'CRM placement link is immutable' using errcode='42501'; end if;
 if new.crm_lead_id is null then return new; end if;
 select student_id into student from public.crm_leads where id=new.crm_lead_id for update;
 if new.student_id is not null and new.student_id is distinct from student then
  raise exception 'Placement student must match linked CRM student' using errcode='22023'; end if;
 if new.status is null or new.heure is null or new.heure !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or not isfinite(new.date_test)
 or length(new.examinateur)>200 or length(new.notes)>4000 then raise exception 'Valid placement date, time and bounded notes required' using errcode='22023'; end if;
 if new.status='Planifié' and new.niveau_recommande is not null then
  raise exception 'A planned CRM test must not contain a result' using errcode='22023'; end if;
 if new.status in ('Résultat saisi','Affecté') and nullif(btrim(new.niveau_recommande),'') is null then
  raise exception 'Recommended level required for a placement result' using errcode='22023'; end if;
 if new.status='Planifié' and (tg_op='INSERT' or new.date_test is distinct from old.date_test or new.heure is distinct from old.heure)
 and (new.date_test+new.heure::time) at time zone 'Africa/Casablanca'<=now() then
  raise exception 'Future placement appointment required' using errcode='22023'; end if;
 return new;
end $$;
create trigger crm_placement_integrity before insert or update or delete on public.placement_tests for each row execute function crm_security.placement_integrity();
create function crm_security.placement_student_consistency() returns trigger
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ begin
 if exists(select 1 from public.placement_tests where crm_lead_id=new.id and student_id is not null and student_id is distinct from new.student_id) then
  raise exception 'Linked placement student mismatch' using errcode='22023'; end if;
 return new;
end $$;
create trigger crm_placement_student_consistency after update of student_id on public.crm_leads for each row execute function crm_security.placement_student_consistency();
create function crm_security.placement_no_truncate() returns trigger
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ begin
 if exists(select 1 from public.placement_tests where crm_lead_id is not null) then raise exception 'CRM placement history cannot be truncated' using errcode='42501'; end if;
 return null;
end $$;
create trigger crm_placement_no_truncate before truncate on public.placement_tests for each statement execute function crm_security.placement_no_truncate();

create function crm_security.placement_event(p public.placement_tests,kind text,source text,body text) returns uuid
language plpgsql set search_path=pg_catalog,pg_temp as $$ declare result uuid; begin
 insert into public.crm_activities(lead_id,placement_test_id,occurred_at,actor_id,actor_kind,event_type,source_key,body)
 values(p.crm_lead_id,p.id,now(),auth.uid(),case when auth.uid() is null then 'system' else 'user' end,kind,source,body)
 on conflict(source_key) do nothing returning id into result;
 return result;
end $$;
create function crm_security.placement_followup_due(policy uuid,happened timestamptz) returns timestamptz
language sql stable set search_path=pg_catalog,pg_temp as $$
 select crm_security.next_window(p.id,happened+make_interval(mins=>p.post_test_sla_minutes)) from public.crm_followup_policies p where p.id=policy
$$;
create function crm_security.placement_milestones() returns trigger
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare l public.crm_leads%rowtype; a uuid; t uuid; begin
 if new.crm_lead_id is null then return new; end if;
 -- Serialize against closure/reopening and other results for the same lead.
 select * into strict l from public.crm_leads where id=new.crm_lead_id for update;
 if tg_op='INSERT' then
  perform crm_security.placement_event(new,'placement_test_booked','placement-booked:'||new.id,
   to_char(new.date_test,'DD/MM/YYYY')||' · '||new.heure);
 elsif new.date_test is distinct from old.date_test or new.heure is distinct from old.heure then
  perform crm_security.placement_event(new,'placement_test_rescheduled','placement-rescheduled:'||new.id||':'||gen_random_uuid(),
   to_char(old.date_test,'DD/MM/YYYY')||' · '||old.heure||' → '||to_char(new.date_test,'DD/MM/YYYY')||' · '||new.heure);
 end if;
 if new.status in ('Passé','Résultat saisi','Affecté') then
  perform crm_security.placement_event(new,'placement_test_attended','placement-attended:'||new.id,'Test de niveau passé.');
 end if;
 if new.status in ('Résultat saisi','Affecté') then
  a:=crm_security.placement_event(new,'placement_result_entered','placement-result:'||new.id,'Niveau recommandé : '||new.niveau_recommande);
  -- A closed lead records the result, never a sales task. The immutable milestone
  -- also prevents a later edit/reopen from manufacturing another result follow-up.
  if a is not null and l.status in ('NEW','CONTACTING','ENGAGED','QUALIFIED') then
   t:=crm_security.new_task(l,jsonb_build_object('task_type','post_test_followup',
    'due_at',crm_security.placement_followup_due(l.followup_policy_id,now()),'instructions','Rappeler le parent au sujet du résultat du test.'),
    'placement-post-followup:'||new.id,'placement_result');
   update public.crm_tasks set placement_test_id=new.id,source_activity_id=a where id=t;
  end if;
 end if;
 update public.crm_leads set version=version+1,updated_at=now() where id=l.id;
 return new;
end $$;
create trigger crm_placement_milestones after insert or update on public.placement_tests for each row execute function crm_security.placement_milestones();

create function public.crm_book_placement_test(p_request_key uuid,p_data jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare actor uuid:=auth.uid(); digest text; prior public.crm_command_requests%rowtype;
 l public.crm_leads%rowtype; p public.placement_tests%rowtype; t public.crm_tasks%rowtype; result jsonb; begin
 perform crm_security.require_reader(false);
 if p_request_key is null or jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>12000
 or p_data-array['lead_id','expected_version','date_test','heure','examinateur','notes','task_id','expected_task_version']<>'{}'::jsonb then
  raise exception 'Valid bounded booking required' using errcode='22023'; end if;
 digest:=encode(sha256(convert_to(p_data::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('crm:request:'||actor||':book_placement:'||p_request_key,0));
 select * into prior from public.crm_command_requests where actor_scope=actor::text and command_name='book_placement' and request_key=p_request_key;
 if found then
  if prior.payload_hash<>digest then raise exception 'Request key payload conflict' using errcode='22023'; end if;
  return prior.result;
 end if;
 select * into l from public.crm_leads where id=(p_data->>'lead_id')::uuid for update;
 if not found or l.status<>'QUALIFIED' or l.merged_into_lead_id is not null then raise exception 'Qualified active lead required' using errcode='22023'; end if;
 if l.version is distinct from (p_data->>'expected_version')::bigint then raise exception 'Stale lead version; refresh and retry' using errcode='40001'; end if;
 if exists(select 1 from public.placement_tests where crm_lead_id=l.id and status='Planifié') then raise exception 'Placement already scheduled' using errcode='22023'; end if;
 select * into t from public.crm_tasks where lead_id=l.id and task_type='confirm_placement_test' and status='open' order by due_at,id limit 1 for update;
 if t.id is not null then
  if t.id is distinct from (p_data->>'task_id')::uuid or t.version is distinct from (p_data->>'expected_task_version')::bigint then raise exception 'Stale confirmation task; refresh and retry' using errcode='40001'; end if;
 elsif p_data->>'task_id' is not null then raise exception 'Confirmation task is no longer open' using errcode='40001'; end if;
 insert into public.placement_tests(crm_lead_id,student_id,student_name,date_test,heure,examinateur,notes,status,niveau_recommande)
 values(l.id,l.student_id,l.learner_name,(p_data->>'date_test')::date,p_data->>'heure',nullif(btrim(p_data->>'examinateur'),''),nullif(btrim(p_data->>'notes'),''),'Planifié',null) returning * into p;
 for t in select * from public.crm_tasks where lead_id=l.id and task_type='confirm_placement_test' and status='open' order by id for update loop
  perform crm_security.finish_task(t,false,'Test de niveau réservé','placement-confirmed:'||p.id||':'||t.id);
 end loop;
 result:=crm_security.result(l.id,'placement-booked:'||p.id)||jsonb_build_object('placement',crm_security.placement_summary(p));
 insert into public.crm_command_requests(actor_scope,command_name,request_key,payload_hash,result) values(actor::text,'book_placement',p_request_key,digest,result);
 return result;
exception
 when deadlock_detected then raise exception 'Concurrent placement change; refresh and retry' using errcode='40001';
 when unique_violation then raise exception 'Placement already scheduled; refresh' using errcode='40001';
 when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or check_violation or not_null_violation then raise exception 'Invalid placement booking' using errcode='22023';
end $$;

create function public.crm_update_placement_test(p_request_key uuid,p_data jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare actor uuid:=auth.uid(); digest text; prior public.crm_command_requests%rowtype; p public.placement_tests%rowtype; result jsonb; begin
 perform crm_security.require_reader(false);
 if p_request_key is null or jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>12000
 or p_data-array['placement_id','expected_updated_at','date_test','heure','examinateur','notes','status','score','niveau_recommande']<>'{}'::jsonb then raise exception 'Valid placement edit required' using errcode='22023'; end if;
 digest:=encode(sha256(convert_to(p_data::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('crm:request:'||actor||':update_placement:'||p_request_key,0));
 select * into prior from public.crm_command_requests where actor_scope=actor::text and command_name='update_placement' and request_key=p_request_key;
 if found then
  if prior.payload_hash<>digest then raise exception 'Request key payload conflict' using errcode='22023'; end if;
  return prior.result;
 end if;
 select * into p from public.placement_tests where id=(p_data->>'placement_id')::uuid and crm_lead_id is not null for update;
 if not found then raise exception 'CRM placement not found' using errcode='22023'; end if;
 if p.updated_at is distinct from (p_data->>'expected_updated_at')::timestamptz then raise exception 'Stale placement version; refresh and retry' using errcode='40001'; end if;
 update public.placement_tests set date_test=(p_data->>'date_test')::date,heure=p_data->>'heure',examinateur=p_data->>'examinateur',notes=p_data->>'notes',
 status=p_data->>'status',score=(p_data->>'score')::numeric,niveau_recommande=nullif(p_data->>'niveau_recommande','') where id=p.id returning * into p;
 result:=jsonb_build_object('placement',crm_security.placement_summary(p));
 insert into public.crm_command_requests(actor_scope,command_name,request_key,payload_hash,result) values(actor::text,'update_placement',p_request_key,digest,result);
 return result;
exception
 when deadlock_detected then raise exception 'Concurrent placement change; refresh and retry' using errcode='40001';
 when unique_violation then raise exception 'Placement already scheduled' using errcode='40001';
 when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or check_violation or not_null_violation then raise exception 'Invalid placement edit or missing result' using errcode='22023';
end $$;

create function public.crm_list_placements(p_lead uuid,p_limit integer default 10,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$ declare result jsonb; begin
 perform crm_security.require_reader(false);perform crm_security.check_page(p_limit,p_offset);
 select jsonb_build_object('total',(select count(*) from public.placement_tests where crm_lead_id=p_lead),
 'rows',coalesce(jsonb_agg(crm_security.placement_summary(p) order by p.date_test desc,p.id),'[]'::jsonb)) into result
 from(select * from public.placement_tests where crm_lead_id=p_lead order by date_test desc,id limit p_limit offset p_offset)p;
 return result;
end $$;

create function public.crm_get_placement(p_test uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$ declare result jsonb; begin
 perform crm_security.require_reader(false);
 select crm_security.placement_summary(p) into result from public.placement_tests p where p.id=p_test and p.crm_lead_id is not null;
 return result;
end $$;

-- Extend the committed read models through this forward migration.
create or replace function crm_security.operational_card(lead uuid) returns jsonb
language sql stable set search_path=pg_catalog,pg_temp as $$
 select jsonb_build_object('id',l.id,'contact_id',c.id,'contact_name',c.display_name,
 'phone',coalesce(c.phone_e164,c.phone_raw),'phone_e164',c.phone_e164,'whatsapp_e164',coalesce(c.whatsapp_e164,c.phone_e164),
 'learner_name',l.learner_name,'learner_age',l.learner_age,'program',coalesce(l.session_type,l.program_interest_text),
 'failed_attempts',crm_security.failed_count(l),'status',l.status,'version',l.version,'owner_id',l.owner_id,'source_label',s.source_label,
 'next_task',case when t.id is not null then jsonb_build_object('id',t.id,'task_type',t.task_type,'due_at',t.due_at,'version',t.version) end,
 'next_placement',(select crm_security.placement_summary(p) from public.placement_tests p where p.crm_lead_id=l.id and p.status='Planifié' order by p.date_test,p.heure,p.id limit 1),
 'post_test_result',(select crm_security.placement_summary(p) from public.placement_tests p where p.id=t.placement_test_id and p.crm_lead_id=l.id and p.status in ('Résultat saisi','Affecté')),
 'last_activity',case when a.id is not null then jsonb_build_object('event_type',a.event_type,'occurred_at',a.occurred_at) end)
 from public.crm_leads l join public.crm_contacts c on c.id=l.contact_id
 join public.crm_submissions s on s.id=l.first_submission_id
 left join lateral(select t.id,t.task_type,t.due_at,t.version,t.placement_test_id from public.crm_tasks t where t.lead_id=l.id and t.status='open' order by t.due_at,t.id limit 1)t on true
 left join lateral(select a.id,a.event_type,a.occurred_at from public.crm_activities a where a.lead_id=l.id order by a.occurred_at desc,a.id desc limit 1)a on true
 where l.id=lead
$$;

create or replace function public.crm_get_workspace_detail(p_lead uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$ declare result jsonb; begin
 perform crm_security.require_reader(false);
 select crm_security.operational_card(l.id)||jsonb_build_object('contact',jsonb_build_object('display_name',c.display_name,'phone',coalesce(c.phone_e164,c.phone_raw),
 'phone_e164',c.phone_e164,'whatsapp_e164',coalesce(c.whatsapp_e164,c.phone_e164),'email',c.email_normalized),
 'qualification_step',l.qualification_step,'closure_reason',l.closure_reason,'closure_note',l.closure_note,'last_conversation_at',l.last_conversation_at,
 'outreach_cycle',l.outreach_cycle,'failed_attempts',crm_security.failed_count(l),
 'unreachable_eligible',l.status in ('CONTACTING','ENGAGED','QUALIFIED') and crm_security.failed_count(l)>=5,
 'open_tasks',public.crm_list_open_tasks(l.id,null,100,0),
 'confirm_placement_task',(select jsonb_build_object('id',t.id,'version',t.version) from public.crm_tasks t where t.lead_id=l.id and t.status='open' and t.task_type='confirm_placement_test' order by t.due_at,t.id limit 1),
 'placement_count',(select count(*) from public.placement_tests where crm_lead_id=l.id),
 'open_task_count',(select count(*) from public.crm_tasks where lead_id=l.id and status='open')) into result
 from public.crm_leads l join public.crm_contacts c on c.id=l.contact_id where l.id=p_lead;
 return result;
end $$;

create or replace function public.crm_get_today(p_limit integer default 30,p_offset integer default 0,p_schedule_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare result jsonb; start_at timestamptz:=((now() at time zone 'Africa/Casablanca')::date)::timestamp at time zone 'Africa/Casablanca'; end_at timestamptz;
begin
 perform crm_security.require_reader(false);perform crm_security.check_page(p_limit,p_offset);perform crm_security.check_page(p_limit,p_schedule_offset);
 end_at:=(((now() at time zone 'Africa/Casablanca')::date)+1)::timestamp at time zone 'Africa/Casablanca';
 with active as (
 select l.id,l.status,l.created_at,coalesce(l.last_attempt_at,l.created_at) last_contact,
 coalesce((select max(greatest(f.completed_at,f.cancelled_at)) from public.crm_tasks f where f.lead_id=l.id and f.status<>'open'),l.created_at) unattended_since,
 p.stale_contacting_minutes,t.id task_id,t.due_at,
 exists(select 1 from public.placement_tests x where x.crm_lead_id=l.id and x.status='Planifié' and (x.date_test+x.heure::time) at time zone 'Africa/Casablanca'>=now()) scheduled_test,
 exists(select 1 from public.crm_tasks f where f.lead_id=l.id and f.status='open' and f.task_type='first_contact') first_contact
 from public.crm_leads l join public.crm_followup_policies p on p.id=l.followup_policy_id
 left join lateral(select t.id,t.due_at from public.crm_tasks t where t.lead_id=l.id and t.status='open' order by t.due_at,t.id limit 1)t on true
 where l.status in ('NEW','CONTACTING','ENGAGED','QUALIFIED') and l.merged_into_lead_id is null
 ), ranked as (
 select id,case when due_at<now() then 1 when status='NEW' and first_contact then 2 when due_at>=start_at and due_at<end_at then 3
 when task_id is null and not scheduled_test then 4 when status='CONTACTING' and last_contact<now()-make_interval(mins=>stale_contacting_minutes) then 5 end priority,
 case when due_at<now() then due_at
 when status='NEW' and first_contact then created_at
 when due_at>=start_at and due_at<end_at then due_at
 when task_id is null then unattended_since else last_contact end sort_at,
 status='CONTACTING' and last_contact<now()-make_interval(mins=>stale_contacting_minutes) stale
 from active
 ), attention as(select id,priority,sort_at,stale from ranked where priority is not null order by priority,sort_at,id limit p_limit offset p_offset),
 appointments as (
 select t.id,t.lead_id,t.task_type,t.due_at,t.version,'task'::text kind,null::jsonb placement from public.crm_tasks t join active l on l.id=t.lead_id
 where t.status='open' and t.due_at>=start_at and t.due_at<end_at
 union all
 select p.id,p.crm_lead_id,'placement_test',(p.date_test+p.heure::time) at time zone 'Africa/Casablanca',null::bigint,'placement',crm_security.placement_summary(p)
 from public.placement_tests p where p.crm_lead_id is not null and p.status='Planifié' and p.date_test=(now() at time zone 'Africa/Casablanca')::date
 ), schedule as(select * from appointments order by due_at,kind,id limit p_limit offset p_schedule_offset)
 select jsonb_build_object('as_of',now(),'timezone','Africa/Casablanca',
 'counts',jsonb_build_object('new',(select count(*) from active where status='NEW' and first_contact),
 'overdue',(select count(*) from public.crm_tasks t join active a on a.id=t.lead_id where t.status='open' and t.due_at<now()),
 'callbacks',(select count(*) from public.crm_tasks t join active a on a.id=t.lead_id where t.status='open' and t.task_type='callback' and t.due_at>=start_at and t.due_at<end_at),
 'due_today',(select count(*) from public.crm_tasks t join active a on a.id=t.lead_id where t.status='open' and t.due_at>=start_at and t.due_at<end_at)),
 'attention_total',(select count(*) from ranked where priority is not null),
 'needs_attention',coalesce((select jsonb_agg(crm_security.operational_card(id)||jsonb_build_object('priority',priority,'stale',stale) order by priority,sort_at,id) from attention),'[]'::jsonb),
 'schedule_total',(select count(*) from appointments),
 'today_schedule',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'kind',s.kind,'placement',s.placement,'task_type',s.task_type,'due_at',s.due_at,'version',s.version,'lead',crm_security.operational_card(s.lead_id)) order by s.due_at,s.kind,s.id) from schedule s),'[]'::jsonb)) into result;
 return result;
end $$;

revoke all on all functions in schema crm_security from public,anon,authenticated,service_role;
revoke all on function public.crm_book_placement_test(uuid,jsonb),public.crm_update_placement_test(uuid,jsonb),public.crm_list_placements(uuid,integer,integer),public.crm_get_placement(uuid) from public,anon,authenticated,service_role;
grant execute on function public.crm_book_placement_test(uuid,jsonb),public.crm_update_placement_test(uuid,jsonb),public.crm_list_placements(uuid,integer,integer),public.crm_get_placement(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
