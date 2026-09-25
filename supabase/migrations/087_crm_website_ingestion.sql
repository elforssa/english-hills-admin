-- Phase 9: website inquiries share durable jobs and the conservative CRM resolver.
begin;
alter table public.crm_integration_connections drop constraint crm_integration_connections_provider_check;
alter table public.crm_integration_connections add check(provider in ('meta','website'));
alter table public.crm_integration_connections alter column page_id drop not null;
alter table public.crm_integration_connections alter column api_version drop not null;
alter table public.crm_integration_connections drop constraint crm_integration_connections_settings_check;
alter table public.crm_integration_connections add constraint crm_connection_provider_shape check(
 (provider='meta' and page_id is not null and api_version is not null and settings='{}'::jsonb)
 or (provider='website' and page_id is null and api_version is null and account_id is null and access_token_secret_ref is null
 and settings ? 'origin' and jsonb_typeof(settings->'origin')='string' and settings-array['origin']='{}'::jsonb
 and settings->>'origin' ~ '^(https://[a-zA-Z0-9.-]+(:[0-9]{1,5})?|http://(localhost|127\.0\.0\.1)(:[0-9]{1,5})?)$'));
alter table public.crm_form_mappings drop constraint crm_form_mappings_channel_check;
alter table public.crm_form_mappings drop constraint crm_form_mappings_form_key_check;
alter table public.crm_form_mappings add constraint crm_mapping_channel_form check(
 (channel='meta_instant_form' and form_key ~ '^[0-9]{1,32}$') or (channel='website' and form_key ~ '^[a-z][a-z0-9_-]{0,63}$'));
alter table public.crm_ingestion_jobs drop constraint crm_ingestion_jobs_event_kind_check;
alter table public.crm_ingestion_jobs drop constraint crm_ingestion_jobs_external_key_check;
alter table public.crm_ingestion_jobs drop constraint crm_ingestion_jobs_payload_check;
alter table public.crm_ingestion_jobs add constraint crm_job_channel_shape check(
 (event_kind='leadgen' and external_key ~ '^[0-9]{1,32}:[0-9]{1,32}$' and jsonb_typeof(payload)='object' and octet_length(payload::text)<=8192)
 or (event_kind='website_inquiry' and external_key ~ '^[a-z][a-z0-9_-]{0,63}:[0-9a-f-]{36}$' and jsonb_typeof(payload)='object' and octet_length(payload::text)<=65536));

-- The provider boundary also holds for privileged configuration mistakes.
create function crm_security.check_ingestion_provider() returns trigger language plpgsql set search_path=pg_catalog,pg_temp as $$ declare provider text;begin
 select c.provider into provider from public.crm_integration_connections c where c.id=new.connection_id;
 if tg_table_name='crm_form_mappings' then
  if (provider='meta' and new.channel<>'meta_instant_form') or (provider='website' and new.channel<>'website') then raise exception 'Mapping provider mismatch' using errcode='23514';end if;
 else
  if (provider='meta' and new.event_kind<>'leadgen') or (provider='website' and new.event_kind<>'website_inquiry') then raise exception 'Job provider mismatch' using errcode='23514';end if;
 end if;
 return new;
end $$;
create trigger crm_mapping_provider before insert or update on public.crm_form_mappings for each row execute function crm_security.check_ingestion_provider();
create trigger crm_job_provider before insert or update on public.crm_ingestion_jobs for each row execute function crm_security.check_ingestion_provider();

create function crm_security.accept_external_submission(sid uuid,contact uuid default null,lead uuid default null) returns uuid
language plpgsql set search_path=pg_catalog,pg_temp as $$ declare s public.crm_submissions;l public.crm_leads;p public.crm_followup_policies;
 d jsonb;due timestamptz;tid uuid;actor_kind text:=case when auth.uid() is null then 'integration' else 'user' end;begin
 select * into strict s from public.crm_submissions where id=sid for update;
 if s.match_status<>'needs_review' then raise exception 'Unresolved intake required' using errcode='40001';end if;
 d:=s.core_fields;
 if lead is null then
  select * into p from public.crm_followup_policies where effective_from<=now() and (retired_at is null or retired_at>now()) order by version desc limit 1;
  if not found then raise exception 'missing_policy' using errcode='P0001';end if;
  if nullif(btrim(d->>'contact_name'),'') is null or nullif(btrim(d->>'learner_name'),'') is null
   or nullif(btrim(d->>'program_interest_text'),'') is null then raise exception 'Contact, learner and program required' using errcode='22023';end if;
  if contact is null then
   insert into public.crm_contacts(display_name,contact_kind,phone_raw,phone_e164,whatsapp_raw,whatsapp_e164,email_raw,email_normalized,created_by)
   values(d->>'contact_name','unknown',d->>'phone',crm_security.normalize_phone(d->>'phone'),d->>'whatsapp',crm_security.normalize_phone(d->>'whatsapp'),d->>'email',nullif(lower(btrim(d->>'email')),''),auth.uid()) returning id into contact;
  else
   perform 1 from public.crm_contacts where id=contact and merged_into_contact_id is null for update;
   if not found then raise exception 'Contact unavailable' using errcode='40001';end if;
  end if;
  due:=crm_security.next_window(p.id,greatest(now(),s.received_at+make_interval(mins=>p.first_contact_sla_minutes)));
  insert into public.crm_leads(contact_id,learner_name,learner_name_normalized,learner_age,age_recorded_at,learner_birth_date,session_type,program_interest_text,
   first_submission_id,latest_submission_id,followup_policy_id,outreach_anchor_date)
  values(contact,d->>'learner_name',lower(btrim(d->>'learner_name')),(d->>'learner_age')::integer,case when d->>'learner_age' is not null then s.received_at end,
   (d->>'learner_birth_date')::date,d->>'session_type',d->>'program_interest_text',s.id,s.id,p.id,(due at time zone p.timezone)::date) returning * into l;
  insert into public.crm_activities(lead_id,occurred_at,actor_id,actor_kind,event_type,source_key,to_status)
  values(l.id,now(),auth.uid(),actor_kind,'lead_created','external-intake:'||s.id||':lead','NEW');
  insert into public.crm_tasks(lead_id,task_type,due_at,source_kind,source_key,policy_id,outreach_cycle,attempt_ordinal)
  values(l.id,'first_contact',due,'intake','attempt:'||l.id||':1:1',p.id,1,1) returning id into tid;
  insert into public.crm_activities(lead_id,occurred_at,actor_id,actor_kind,event_type,source_key,task_id)
  values(l.id,now(),auth.uid(),actor_kind,'task_created','external-intake:'||s.id||':task',tid);
 else
  select * into l from public.crm_leads where id=lead for update;
  if not found or l.merged_into_lead_id is not null or l.status not in ('NEW','CONTACTING','ENGAGED','QUALIFIED') then raise exception 'Active lead required' using errcode='40001';end if;
  update public.crm_leads set latest_submission_id=case when row(s.occurred_at,s.received_at,s.id)>
   (select x.occurred_at,x.received_at,x.id from public.crm_submissions x where x.id=l.latest_submission_id) then s.id else latest_submission_id end,
   version=version+1,updated_at=now() where id=l.id;
 end if;
 update public.crm_submissions set lead_id=l.id,match_status='resolved',resolved_by=auth.uid(),resolved_at=now() where id=s.id;
 insert into public.crm_activities(lead_id,occurred_at,actor_id,actor_kind,event_type,source_key,submission_id)
 values(l.id,now(),auth.uid(),actor_kind,'submission_received','external-intake:'||s.id||':submission',s.id);
 return l.id;
end $$;
create function crm_security.resolve_external_submission(sid uuid) returns uuid language plpgsql set search_path=pg_catalog,pg_temp as $$
declare s public.crm_submissions;d jsonb;phone text;email text;contacts uuid[];leads uuid[];contact uuid;lead uuid;ambiguous boolean:=false;begin
 perform pg_advisory_xact_lock(hashtextextended('crm:meta:intake',0));
 select * into strict s from public.crm_submissions where id=sid for update;
 if s.match_status<>'needs_review' then return s.lead_id;end if;
 d:=s.core_fields;
 phone:=crm_security.normalize_phone(d->>'phone');email:=nullif(lower(btrim(d->>'email')),'');
 select array_agg(id order by id) into contacts from public.crm_contacts where merged_into_contact_id is null
 and ((phone is not null and phone_e164=phone) or (email is not null and email_normalized=email));
 -- Name corroboration is required as well as phone/email. Never merge contacts.
 if cardinality(contacts)=1 and exists(select 1 from public.crm_contacts where id=contacts[1] and lower(btrim(display_name))=lower(btrim(d->>'contact_name'))
 and (phone_e164 is null or phone is null or phone_e164=phone) and (email_normalized is null or email is null or email_normalized=email)) then contact:=contacts[1];end if;
 if nullif(btrim(d->>'learner_name'),'') is not null and nullif(btrim(d->>'contact_name'),'') is not null
 and nullif(btrim(d->>'program_interest_text'),'') is not null and (phone is not null or email is not null) and (contacts is null or contact is not null) then
  if contact is not null then
   select array_agg(id order by id) into leads from public.crm_leads where contact_id=contact and merged_into_lead_id is null
    and status in ('NEW','CONTACTING','ENGAGED','QUALIFIED') and learner_name_normalized=lower(btrim(d->>'learner_name'))
    and lower(btrim(program_interest_text))=lower(btrim(d->>'program_interest_text')) and session_type is not distinct from d->>'session_type';
   -- Contradictory learner birth evidence is never silently attached.
   if cardinality(leads)=1 and exists(select 1 from public.crm_leads where id=leads[1] and learner_birth_date is not null and d->>'learner_birth_date' is not null and learner_birth_date<>(d->>'learner_birth_date')::date) then
    ambiguous:=true;
   end if;
  end if;
  -- Incomplete existing opportunity context is review, not a new duplicate.
  if contact is not null and exists(select 1 from public.crm_leads where contact_id=contact and merged_into_lead_id is null
   and status in ('NEW','CONTACTING','ENGAGED','QUALIFIED') and (learner_name_normalized is null or learner_name_normalized=lower(btrim(d->>'learner_name')))
   and (nullif(btrim(program_interest_text),'') is null or (lower(btrim(program_interest_text))=lower(btrim(d->>'program_interest_text')) and (session_type is null)<>(d->>'session_type' is null)))) then
   ambiguous:=true;
  end if;
  if not ambiguous and coalesce(cardinality(leads),0)<=1 then lead:=crm_security.accept_external_submission(s.id,contact,leads[1]);end if;
 end if;
 if lead is null then
  update public.crm_submissions set candidate_lead_ids=coalesce((select array_agg(id) from (select id from public.crm_leads where contact_id=any(contacts) and merged_into_lead_id is null and status in ('NEW','CONTACTING','ENGAGED','QUALIFIED') order by id limit 50)x),'{}') where id=s.id;
 end if;
 return lead;
end $$;
create or replace function public.crm_finalize_meta_job(p_job uuid,p_lease uuid,p_mapping uuid,p_data jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare j public.crm_ingestion_jobs;c public.crm_integration_connections;m public.crm_form_mappings;s public.crm_submissions;
 d jsonb;a jsonb;phone text;email text;contacts uuid[];leads uuid[];contact uuid;lead uuid;occurred timestamptz;ambiguous boolean:=false;begin
 perform crm_security.require_meta_worker();
 -- Connection before job: configuration changes cannot race finalization.
 select c0.* into c from public.crm_integration_connections c0 join public.crm_ingestion_jobs j0 on j0.connection_id=c0.id where j0.id=p_job for share of c0;
 select * into j from public.crm_ingestion_jobs where id=p_job for update;
 if not found or j.status<>'processing' or j.lease_token is distinct from p_lease or j.lease_until<=now() then raise exception 'Stale lease' using errcode='40001';end if;
 if not c.enabled then perform public.crm_fail_meta_job(p_job,p_lease,'connection_disabled');return jsonb_build_object('status','blocked');end if;
 if jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>131072 or p_data-array['core_fields','form_answers','attribution','occurred_at','source_label']<>'{}' then raise exception 'Invalid normalized payload' using errcode='22023';end if;
 d:=p_data->'core_fields';a:=p_data->'attribution';occurred:=(p_data->>'occurred_at')::timestamptz;
 if d-array['contact_name','phone','whatsapp','email','learner_name','learner_age','learner_birth_date','session_type','program_interest_text']<>'{}'
 or jsonb_typeof(d) is distinct from 'object' or not crm_security.valid_answers(p_data->'form_answers') or not isfinite(occurred) or occurred>now()+interval '5 minutes'
 or a->>'external_submission_id' is distinct from j.payload->>'leadgen_id' or a->>'page_id' is distinct from c.page_id or a->>'form_id' is distinct from j.payload->>'form_id' then raise exception 'Invalid normalized identity' using errcode='22023';end if;
 select * into m from public.crm_form_mappings where id=p_mapping and connection_id=c.id and form_key=j.payload->>'form_id'
 and (j.submission_id is not null or (effective_from<=occurred and (retired_at is null or retired_at>occurred)));
 if not found then raise exception 'Invalid mapping version' using errcode='22023';end if;
 -- Serialize all provider intake contact resolution, including shared phones and
 -- disjoint phone/email combinations. Bounded transaction, no network under lock.
 perform pg_advisory_xact_lock(hashtextextended('crm:meta:intake',0));
 if j.submission_id is null then
  insert into public.crm_submissions(channel,received_at,occurred_at,time_source,core_fields,form_answers,source_label,match_status,payload_hash,form_mapping_id)
  values('meta_instant_form',j.created_at,occurred,'provider',d,p_data->'form_answers',left(coalesce(nullif(p_data->>'source_label',''),'Meta'),200),'needs_review',encode(sha256(convert_to(p_data::text,'UTF8')),'hex'),m.id) returning * into s;
  insert into public.crm_submission_attribution(submission_id,provider,external_submission_id,external_scope,page_id,form_id,form_name_snapshot,
   campaign_id,campaign_name_snapshot,adset_id,adset_name_snapshot,ad_id,ad_name_snapshot,platform,provider_created_at,raw_payload,consent_evidence,attribution_status)
  values(s.id,'meta',j.payload->>'leadgen_id','page:'||c.page_id,c.page_id,j.payload->>'form_id',a->>'form_name_snapshot',
   a->>'campaign_id',a->>'campaign_name_snapshot',a->>'adset_id',a->>'adset_name_snapshot',a->>'ad_id',a->>'ad_name_snapshot',a->>'platform',occurred,a->'raw_payload',a->'consent_evidence',a->>'attribution_status');
  update public.crm_ingestion_jobs set submission_id=s.id where id=j.id;
 else
  select * into strict s from public.crm_submissions where id=j.submission_id for update;
  d:=s.core_fields; -- A retry never reinterprets the accepted acquisition snapshot.
 end if;
 if s.match_status<>'needs_review' then
  update public.crm_ingestion_jobs set status='done',lease_token=null,lease_until=null,updated_at=now(),last_error_code=null,last_error_summary=null where id=j.id;
  return jsonb_build_object('status','done','submission_id',s.id,'lead_id',s.lead_id);
 end if;
 if not exists(select 1 from public.crm_followup_policies where effective_from<=now() and (retired_at is null or retired_at>now())) then
  perform public.crm_fail_meta_job(p_job,p_lease,'missing_policy');return jsonb_build_object('status','blocked','submission_id',s.id);
 end if;
 lead:=crm_security.resolve_external_submission(s.id);
 update public.crm_ingestion_jobs set status='done',lease_token=null,lease_until=null,updated_at=now(),last_error_code=null,last_error_summary=null where id=j.id;
 return jsonb_build_object('status','done','submission_id',s.id,'lead_id',lead,'needs_review',lead is null);
end $$;
create or replace function public.crm_resolve_meta_intake(p_request uuid,p_submission uuid,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ declare s public.crm_submissions;l public.crm_leads;prior public.crm_command_requests;
 digest text;result jsonb;lead uuid;begin
 perform crm_security.require_reader();
 if p_request is null or p_action is null or p_action not in ('attach','new','reject') or jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>8192
 or p_data-array['lead_id','expected_version','contact_id','contact_version','contact_name','learner_name','program_interest_text']<>'{}' then raise exception 'Invalid resolution' using errcode='22023';end if;
 digest:=encode(sha256(convert_to(jsonb_build_array(p_submission,p_action,p_data)::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('crm:meta:intake',0));
 select * into prior from public.crm_command_requests where actor_scope=auth.uid()::text and command_name='resolve_meta_intake' and request_key=p_request;
 if found then
  if prior.payload_hash<>digest then raise exception 'Request payload conflict' using errcode='22023';end if;return prior.result;
 end if;
 select * into s from public.crm_submissions where id=p_submission and channel in ('meta_instant_form','website') for update;
 if not found or s.match_status<>'needs_review' or not exists(select 1 from public.crm_ingestion_jobs where submission_id=s.id and status='done') then raise exception 'Intake already resolved or configuration blocked' using errcode='40001';end if;
 if p_action='reject' then update public.crm_submissions set match_status='rejected' where id=s.id;
 elsif p_action='attach' then
  select * into l from public.crm_leads where id=(p_data->>'lead_id')::uuid for update;
  if not found or l.version is distinct from (p_data->>'expected_version')::bigint then raise exception 'Refresh lead version' using errcode='40001';end if;
  lead:=crm_security.accept_external_submission(s.id,null,l.id);
 else
  if p_data->>'contact_id' is not null then
   perform 1 from public.crm_contacts where id=(p_data->>'contact_id')::uuid and version=(p_data->>'contact_version')::bigint and merged_into_contact_id is null for update;
   if not found then raise exception 'Refresh contact version' using errcode='40001';end if;
  end if;
  if exists(select 1 from jsonb_each_text(p_data) where key in ('contact_name','learner_name','program_interest_text') and length(value) not between 1 and 200) then raise exception 'Invalid resolution fields' using errcode='22023';end if;
  update public.crm_submissions set core_fields=core_fields||(p_data-array['lead_id','expected_version','contact_id','contact_version']) where id=s.id;
  lead:=crm_security.accept_external_submission(s.id,(p_data->>'contact_id')::uuid);
 end if;
 result:=jsonb_build_object('submission_id',s.id,'lead_id',lead,'status',case when p_action='reject' then 'rejected' else 'resolved' end);
 insert into public.crm_command_requests(actor_scope,command_name,request_key,payload_hash,result) values(auth.uid()::text,'resolve_meta_intake',p_request,digest,result);
 return result;
end $$;
create function public.crm_claim_ingestion_jobs(p_limit integer default 5,p_provider text default null) returns jsonb language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ declare ids uuid[];result jsonb;begin
 perform crm_security.require_meta_worker();
 if p_provider is not null and p_provider not in ('meta','website') then raise exception 'Invalid provider' using errcode='22023';end if;
 if p_limit is null or p_limit not between 1 and 10 then raise exception 'Invalid batch size' using errcode='22023';end if;
 with due as (select j.id from public.crm_ingestion_jobs j join public.crm_integration_connections c on c.id=j.connection_id
  where c.enabled and (p_provider is null or c.provider=p_provider) and ((j.status in ('pending','retry') and j.next_attempt_at<=now()) or (j.status='processing' and j.lease_until<=now()))
  order by j.next_attempt_at,j.created_at,j.id limit p_limit for update of j skip locked), claimed as (
 update public.crm_ingestion_jobs j set status=case when attempt_count>=8 then 'dead' else 'processing' end,
  attempt_count=attempt_count+case when attempt_count<8 then 1 else 0 end,lease_token=case when attempt_count<8 then gen_random_uuid() end,lease_until=case when attempt_count<8 then now()+interval '2 minutes' end,
  updated_at=now(),last_error_code=case when attempt_count>=8 then 'attempts_exhausted' end,last_error_summary=null
 where j.id in(select id from due) returning j.id) select array_agg(id) into ids from claimed;
 select coalesce(jsonb_agg(jsonb_build_object('id',j.id,'lease_token',j.lease_token,'payload',j.payload,'received_at',j.created_at,'connection',jsonb_build_object('id',c.id,'provider',c.provider,'page_id',c.page_id,'api_version',c.api_version,'access_token_secret_ref',c.access_token_secret_ref)) order by j.created_at,j.id),'[]') into result
 from public.crm_ingestion_jobs j join public.crm_integration_connections c on c.id=j.connection_id
 where j.status='processing' and j.id=any(ids);
 return result;
end $$;
create or replace function public.crm_claim_meta_jobs(p_limit integer default 5) returns jsonb language sql security definer set search_path=pg_catalog,pg_temp as $$
 select public.crm_claim_ingestion_jobs(p_limit,'meta')
$$;
create or replace function crm_security.accept_meta_submission(sid uuid,contact uuid default null,lead uuid default null) returns uuid language sql set search_path=pg_catalog,pg_temp as $$
 select crm_security.accept_external_submission(sid,contact,lead)
$$;
create function public.crm_resolve_external_intake(p_request uuid,p_submission uuid,p_action text,p_data jsonb default '{}') returns jsonb language sql security definer set search_path=pg_catalog,pg_temp as $$
 select public.crm_resolve_meta_intake(p_request,p_submission,p_action,p_data)
$$;
create function public.crm_save_website_connection(p_data jsonb,p_id uuid default null,p_version bigint default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ declare c public.crm_integration_connections;begin
 perform crm_security.require_reader(true);
 if jsonb_typeof(p_data) is distinct from 'object' or p_data-array['connection_key','origin','enabled']<>'{}' then raise exception 'Invalid website settings' using errcode='22023';end if;
 if p_id is null then
  insert into public.crm_integration_connections(provider,connection_key,settings,created_by,updated_by)
  values('website',p_data->>'connection_key',jsonb_build_object('origin',p_data->>'origin'),auth.uid(),auth.uid()) returning * into c;
 else
  select * into c from public.crm_integration_connections where id=p_id and provider='website' for update;
  if not found or c.version is distinct from p_version then raise exception 'Refresh connection version' using errcode='40001';end if;
  if p_data->>'connection_key' is distinct from c.connection_key or p_data->>'origin' is distinct from c.settings->>'origin' then raise exception 'Site identity immutable; create a separate connection' using errcode='22023';end if;
  update public.crm_integration_connections set enabled=coalesce((p_data->>'enabled')::boolean,false),version=version+1,updated_by=auth.uid(),updated_at=now() where id=p_id returning * into c;
 end if;return to_jsonb(c);
end $$;
create function public.crm_get_website_site(p_key text,p_origin text) returns boolean language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ begin
 perform crm_security.require_meta_worker();
 return exists(select 1 from public.crm_integration_connections where provider='website' and enabled and (p_key is null or connection_key=p_key) and settings->>'origin'=p_origin);
end $$;
create function public.crm_check_website_rate_limit(p_key text) returns boolean language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ declare hits integer;begin
 perform crm_security.require_meta_worker();
 if p_key is null or p_key !~ '^[0-9a-f]{64}$' then raise exception 'Invalid limiter key' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('crm:website:rate:'||p_key,0));
 -- Only pseudonymous website limiter rows; never retain visitor IP addresses.
 delete from public.anon_rate_limits where scope='crm_inquiry:hour' and created_at<clock_timestamp()-interval '1 hour';
 select count(*) into hits from public.anon_rate_limits where scope='crm_inquiry:hour' and ip_key=p_key;
 if hits>=10 then return false;end if;
 insert into public.anon_rate_limits(ip_key,scope) values(p_key,'crm_inquiry:hour');return true;
end $$;
create function public.crm_website_inquiry_status(p_site text,p_form text,p_request uuid,p_payload jsonb) returns text
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ declare j public.crm_ingestion_jobs;begin
 perform crm_security.require_meta_worker();
 select j0.* into j from public.crm_ingestion_jobs j0 join public.crm_integration_connections c on c.id=j0.connection_id
 where c.provider='website' and c.connection_key=p_site and j0.event_kind='website_inquiry' and j0.external_key=p_form||':'||p_request;
 if not found then return 'absent';end if;
 return case when j.payload_hash=encode(sha256(convert_to(p_payload::text,'UTF8')),'hex') then 'received' else 'conflict' end;
end $$;
create function public.crm_accept_website_inquiry(p_site text,p_form text,p_request uuid,p_payload jsonb) returns void
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ declare c public.crm_integration_connections;state text;begin
 perform crm_security.require_meta_worker();
 if p_request is null or p_form is null or p_form !~ '^[a-z][a-z0-9_-]{0,63}$' or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>65536
 or p_payload-array['contact','answers','attribution','consent','form_key']<>'{}' or p_payload->>'form_key' is distinct from p_form or p_payload->'consent' is distinct from 'true'::jsonb then raise exception 'Invalid inquiry' using errcode='22023';end if;
 if crm_security.normalize_phone(p_payload->'contact'->>'phone') is null and coalesce(p_payload->'contact'->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Contact method required' using errcode='22023';end if;
 select * into c from public.crm_integration_connections where provider='website' and connection_key=p_site and enabled for share;
 if not found then raise exception 'Site unavailable' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('crm:website:request:'||c.id||':'||p_form||':'||p_request,0));
 state:=public.crm_website_inquiry_status(p_site,p_form,p_request,p_payload);
 if state='conflict' then raise exception 'Request payload conflict' using errcode='23505';end if;
 if state='received' then return;end if;
 insert into public.crm_ingestion_jobs(connection_id,event_kind,external_key,payload,payload_hash)
 values(c.id,'website_inquiry',p_form||':'||p_request,p_payload,encode(sha256(convert_to(p_payload::text,'UTF8')),'hex'));
end $$;
create function public.crm_get_website_job_mapping(p_job uuid,p_lease uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ declare j public.crm_ingestion_jobs;m public.crm_form_mappings;begin
 perform crm_security.require_meta_worker();
 select * into j from public.crm_ingestion_jobs where id=p_job and event_kind='website_inquiry' and status='processing' and lease_token=p_lease and lease_until>now();
 if not found then raise exception 'Stale lease' using errcode='40001';end if;
 if j.submission_id is not null then select m0.* into m from public.crm_form_mappings m0 join public.crm_submissions s on s.form_mapping_id=m0.id where s.id=j.submission_id;return to_jsonb(m);end if;
 select * into m from public.crm_form_mappings where connection_id=j.connection_id and channel='website' and form_key=j.payload->>'form_key' and effective_from<=j.created_at order by effective_from desc,version desc limit 1;
 if m.id is null or (m.retired_at is not null and m.retired_at<=j.created_at) then return null;end if;return to_jsonb(m);
end $$;
create function public.crm_finalize_website_job(p_job uuid,p_lease uuid,p_mapping uuid,p_data jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ declare j public.crm_ingestion_jobs;c public.crm_integration_connections;s public.crm_submissions;m public.crm_form_mappings;d jsonb;a jsonb;lead uuid;begin
 perform crm_security.require_meta_worker();
 select c0.* into c from public.crm_integration_connections c0 join public.crm_ingestion_jobs j0 on j0.connection_id=c0.id where j0.id=p_job and c0.provider='website' for share of c0;
 if not found then raise exception 'Website job required' using errcode='22023';end if;
 select * into j from public.crm_ingestion_jobs where id=p_job for update;
 if j.status<>'processing' or j.lease_token is distinct from p_lease or j.lease_until<=now() then raise exception 'Stale lease' using errcode='40001';end if;
 if not c.enabled then perform public.crm_fail_meta_job(p_job,p_lease,'connection_disabled');return jsonb_build_object('status','blocked');end if;
 if jsonb_typeof(p_data) is distinct from 'object' or p_data-array['core_fields','form_answers','source_label']<>'{}' or octet_length(p_data::text)>65536 or not crm_security.valid_answers(p_data->'form_answers') then raise exception 'Invalid normalized inquiry' using errcode='22023';end if;
 select * into m from public.crm_form_mappings where id=p_mapping and connection_id=c.id and channel='website' and form_key=j.payload->>'form_key';
 if not found or p_mapping is distinct from (public.crm_get_website_job_mapping(p_job,p_lease)->>'id')::uuid then raise exception 'Invalid mapping' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('crm:meta:intake',0));
 if j.submission_id is null then
  d:=p_data->'core_fields';a:=j.payload->'attribution';
  insert into public.crm_submissions(channel,received_at,occurred_at,time_source,core_fields,form_answers,source_label,match_status,payload_hash,form_mapping_id)
  values('website',j.created_at,j.created_at,'server',d,p_data->'form_answers',left(coalesce(nullif(p_data->>'source_label',''),'Site web'),200),'needs_review',j.payload_hash,m.id) returning * into s;
  -- Website values are observations, never verified Meta campaign identities.
  insert into public.crm_submission_attribution(submission_id,provider,external_submission_id,external_scope,form_name_snapshot,
   landing_page,referrer,utm_source,utm_medium,utm_campaign,utm_content,utm_term,fbclid,fbc,fbp,captured_at,consent_evidence,attribution_status)
  values(s.id,'website',split_part(j.external_key,':',2),'site:'||c.connection_key||':form:'||(j.payload->>'form_key'),m.form_name,
   a->>'landing_page',a->>'referrer',a->>'utm_source',a->>'utm_medium',a->>'utm_campaign',a->>'utm_content',a->>'utm_term',a->>'fbclid',a->>'fbc',a->>'fbp',j.created_at,
   jsonb_build_object('accepted',true,'recorded_at',j.created_at,'source','website'),case when a='{}'::jsonb then 'unavailable' else 'partial' end);
  update public.crm_ingestion_jobs set submission_id=s.id where id=j.id;
 else select * into strict s from public.crm_submissions where id=j.submission_id for update;
 end if;
 if s.match_status='needs_review' then
  if not exists(select 1 from public.crm_followup_policies where effective_from<=now() and (retired_at is null or retired_at>now())) then
   perform public.crm_fail_meta_job(p_job,p_lease,'missing_policy');return jsonb_build_object('status','blocked','submission_id',s.id);
  end if;
  lead:=crm_security.resolve_external_submission(s.id);
 else lead:=s.lead_id;end if;
 update public.crm_ingestion_jobs set status='done',lease_token=null,lease_until=null,last_error_code=null,last_error_summary=null,updated_at=now() where id=j.id;
 return jsonb_build_object('status','done','submission_id',s.id,'lead_id',lead,'needs_review',lead is null);
end $$;

create function public.crm_publish_website_form_mapping(p_connection uuid,p_data jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ declare m public.crm_form_mappings;kv record;n integer;begin
 perform crm_security.require_reader(true);
 if jsonb_typeof(p_data) is distinct from 'object' or p_data-array['form_key','form_name','field_map','question_labels','default_session_type','default_program_interest_text','effective_from']<>'{}' then raise exception 'Invalid mapping fields' using errcode='22023'; end if;
 if jsonb_typeof(p_data->'field_map') is distinct from 'object' or (p_data->'field_map')-array['contact_name','phone','whatsapp','email','learner_name','learner_age','learner_birth_date','session_type','program_interest_text']<>'{}' then raise exception 'Invalid canonical mapping' using errcode='22023'; end if;
 for kv in select * from jsonb_each(p_data->'field_map') loop
  if jsonb_typeof(kv.value)<>'string' or length(kv.value#>>'{}') not between 1 and 100 then raise exception 'Invalid field key' using errcode='22023'; end if;
 end loop;
 for kv in select * from jsonb_each(coalesce(p_data->'question_labels','{}')) loop
  if length(kv.key)>100 or jsonb_typeof(kv.value)<>'string' or length(kv.value#>>'{}') not between 1 and 200 then raise exception 'Invalid question label' using errcode='22023'; end if;
 end loop;
 perform 1 from public.crm_integration_connections where id=p_connection and provider='website' for update;
 if not found then raise exception 'Connection not found' using errcode='22023'; end if;
 select coalesce(max(version),0)+1 into n from public.crm_form_mappings where connection_id=p_connection and form_key=p_data->>'form_key';
 insert into public.crm_form_mappings(channel,connection_id,form_key,version,form_name,field_map,question_labels,default_session_type,default_program_interest_text,effective_from,created_by)
 values('website',p_connection,p_data->>'form_key',n,p_data->>'form_name',p_data->'field_map',coalesce(p_data->'question_labels','{}'),p_data->>'default_session_type',p_data->>'default_program_interest_text',coalesce((p_data->>'effective_from')::timestamptz,now()),auth.uid()) returning * into m;
 return to_jsonb(m);
end $$;
-- Keep the existing Meta worker route as a compatible trigger target; it now
-- dispatches both provider branches through the same bounded leased worker.
revoke all on all functions in schema crm_security from public,anon,authenticated,service_role;
revoke all on function public.crm_save_website_connection(jsonb,uuid,bigint),public.crm_publish_website_form_mapping(uuid,jsonb),public.crm_resolve_external_intake(uuid,uuid,text,jsonb),
 public.crm_get_website_site(text,text),public.crm_check_website_rate_limit(text),public.crm_website_inquiry_status(text,text,uuid,jsonb),public.crm_accept_website_inquiry(text,text,uuid,jsonb),
 public.crm_get_website_job_mapping(uuid,uuid),public.crm_finalize_website_job(uuid,uuid,uuid,jsonb),public.crm_claim_ingestion_jobs(integer,text) from public,anon,authenticated,service_role;
grant execute on function public.crm_save_website_connection(jsonb,uuid,bigint),public.crm_publish_website_form_mapping(uuid,jsonb),public.crm_resolve_external_intake(uuid,uuid,text,jsonb) to authenticated;
grant execute on function public.crm_get_website_site(text,text),public.crm_check_website_rate_limit(text),public.crm_website_inquiry_status(text,text,uuid,jsonb),public.crm_accept_website_inquiry(text,text,uuid,jsonb),
 public.crm_get_website_job_mapping(uuid,uuid),public.crm_finalize_website_job(uuid,uuid,uuid,jsonb),public.crm_claim_ingestion_jobs(integer,text) to service_role;
create or replace function public.crm_get_meta_job_mapping(p_job uuid,p_lease uuid,p_form text,p_occurred timestamptz) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ declare j public.crm_ingestion_jobs;m public.crm_form_mappings;begin
 perform crm_security.require_meta_worker();
 select * into j from public.crm_ingestion_jobs where id=p_job and status='processing' and lease_token=p_lease and lease_until>now();
 if not found then raise exception 'Stale lease' using errcode='40001';end if;
 if p_form is distinct from j.payload->>'form_id' or p_occurred is null or not isfinite(p_occurred) or p_occurred>now()+interval '5 minutes' then raise exception 'Invalid provider identity' using errcode='22023';end if;
 if j.submission_id is not null then
  select m0.* into m from public.crm_form_mappings m0 join public.crm_submissions s0 on s0.form_mapping_id=m0.id where s0.id=j.submission_id;return to_jsonb(m);
 end if;
 select * into m from public.crm_form_mappings where connection_id=j.connection_id and form_key=p_form and effective_from<=p_occurred
 order by effective_from desc,version desc limit 1;
 if m.id is null or (m.retired_at is not null and m.retired_at<=p_occurred) then return null;end if;
 return to_jsonb(m);
end $$;
notify pgrst,'reload schema';
commit;
