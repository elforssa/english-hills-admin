-- Phase 8: inbound Meta only. No center records, outbound delivery or analytics.
begin;
create table public.crm_integration_connections (
 id uuid primary key default gen_random_uuid(), provider text not null default 'meta' check(provider='meta'),
 connection_key text not null unique check(connection_key ~ '^[a-z][a-z0-9_-]{2,63}$'),
 enabled boolean not null default false, account_id text check(account_id ~ '^[0-9]{1,32}$'),
 page_id text not null unique check(page_id ~ '^[0-9]{1,32}$'),
 api_version text not null check(api_version ~ '^v[0-9]{1,3}\.0$'),
 access_token_secret_ref text check(access_token_secret_ref ~ '^CRM_META_PAGE_TOKEN_[A-Z0-9_]{1,64}$'),
 settings jsonb not null default '{}' check(settings='{}'::jsonb),
 version bigint not null default 1,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 created_by uuid not null references public.profiles(id),updated_by uuid not null references public.profiles(id)
);
create table public.crm_form_mappings (
 id uuid primary key default gen_random_uuid(), connection_id uuid not null references public.crm_integration_connections(id),
 channel text not null default 'meta_instant_form' check(channel='meta_instant_form'),
 form_key text not null check(form_key ~ '^[0-9]{1,32}$'),version integer not null check(version>0),
 form_name text check(length(form_name)<=200),field_map jsonb not null,question_labels jsonb not null default '{}',
 default_session_type text check(default_session_type in ('Yearly','Adults','Summer Camp','Communication Junior','Communication Adult','One-to-One','Mise à niveau','Other')),
 default_program_interest_text text check(length(default_program_interest_text)<=200),
 effective_from timestamptz not null check(isfinite(effective_from)),retired_at timestamptz,
 created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),
 unique(connection_id,form_key,version),unique(connection_id,form_key,effective_from),
 check(retired_at is null or (isfinite(retired_at) and retired_at>effective_from)),
 check(jsonb_typeof(field_map)='object' and octet_length(field_map::text)<=8192),
 check(jsonb_typeof(question_labels)='object' and octet_length(question_labels::text)<=16384)
);
alter table public.crm_submissions add column form_mapping_id uuid references public.crm_form_mappings(id);
create table public.crm_ingestion_jobs (
 id uuid primary key default gen_random_uuid(), connection_id uuid not null references public.crm_integration_connections(id),
 external_key text not null check(external_key ~ '^[0-9]{1,32}:[0-9]{1,32}$'),event_kind text not null check(event_kind='leadgen'),
 payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=8192),
 payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),
 status text not null default 'pending' check(status in ('pending','processing','retry','done','blocked','dead')),
 attempt_count integer not null default 0 check(attempt_count>=0), next_attempt_at timestamptz not null default now(),
 lease_token uuid,lease_until timestamptz,last_error_code text,last_error_summary text,
 submission_id uuid unique references public.crm_submissions(id),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default now(),
 unique(connection_id,event_kind,external_key),
 check((status='processing')=(lease_token is not null and lease_until is not null)),
 check(status<>'done' or submission_id is not null)
);
create index crm_ingestion_due on public.crm_ingestion_jobs(next_attempt_at,created_at,id) where status in ('pending','retry','processing');
create index crm_mapping_lookup on public.crm_form_mappings(connection_id,form_key,effective_from desc);
create index crm_intake_review on public.crm_submissions(received_at,id) where match_status='needs_review';
alter table public.crm_integration_connections enable row level security;
alter table public.crm_form_mappings enable row level security;
alter table public.crm_ingestion_jobs enable row level security;
revoke all on public.crm_integration_connections,public.crm_form_mappings,public.crm_ingestion_jobs from public,anon,authenticated,service_role;

create function crm_security.require_meta_worker() returns void language plpgsql set search_path=pg_catalog,pg_temp as $$ begin
 if auth.role() is distinct from 'service_role' then raise exception 'Worker required' using errcode='42501'; end if;
end $$;
create function crm_security.protect_mapping() returns trigger language plpgsql set search_path=pg_catalog,pg_temp as $$ begin
 if tg_op='DELETE' then raise exception 'Published mapping is immutable' using errcode='42501'; end if;
 if (to_jsonb(new)-'retired_at') is distinct from (to_jsonb(old)-'retired_at') or old.retired_at is not null or new.retired_at is null or new.retired_at<now() then
 raise exception 'Published mapping is immutable' using errcode='42501'; end if;
 return new;
end $$;
create trigger crm_mapping_immutable before update or delete on public.crm_form_mappings for each row execute function crm_security.protect_mapping();
create trigger crm_mapping_no_truncate before truncate on public.crm_form_mappings for each statement execute function crm_security.reject_history_mutation();

-- Only names for environment secrets enter this API; settings is deliberately closed.
create function public.crm_save_meta_connection(p_data jsonb,p_id uuid default null,p_version bigint default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ declare c public.crm_integration_connections; begin
 perform crm_security.require_reader(true);
 if jsonb_typeof(p_data) is distinct from 'object' or p_data-array['connection_key','page_id','account_id','api_version','access_token_secret_ref','enabled']<>'{}' then raise exception 'Invalid connection fields' using errcode='22023'; end if;
 if p_id is null then
  insert into public.crm_integration_connections(connection_key,page_id,account_id,api_version,access_token_secret_ref,created_by,updated_by)
  values(p_data->>'connection_key',p_data->>'page_id',p_data->>'account_id',p_data->>'api_version',p_data->>'access_token_secret_ref',auth.uid(),auth.uid()) returning * into c;
 else
  select * into c from public.crm_integration_connections where id=p_id for update;
  if not found or c.version is distinct from p_version then raise exception 'Refresh connection version' using errcode='40001'; end if;
  if p_data->>'page_id' is distinct from c.page_id or p_data->>'connection_key' is distinct from c.connection_key then raise exception 'Connection identity immutable' using errcode='22023'; end if;
  update public.crm_integration_connections set account_id=p_data->>'account_id',api_version=p_data->>'api_version',access_token_secret_ref=p_data->>'access_token_secret_ref',
   enabled=coalesce((p_data->>'enabled')::boolean,false),updated_at=now(),updated_by=auth.uid(),version=version+1 where id=p_id returning * into c;
 end if;
 return to_jsonb(c);
end $$;
create function public.crm_publish_meta_form_mapping(p_connection uuid,p_data jsonb) returns jsonb
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
 perform 1 from public.crm_integration_connections where id=p_connection for update;
 if not found then raise exception 'Connection not found' using errcode='22023'; end if;
 select coalesce(max(version),0)+1 into n from public.crm_form_mappings where connection_id=p_connection and form_key=p_data->>'form_key';
 insert into public.crm_form_mappings(connection_id,form_key,version,form_name,field_map,question_labels,default_session_type,default_program_interest_text,effective_from,created_by)
 values(p_connection,p_data->>'form_key',n,p_data->>'form_name',p_data->'field_map',coalesce(p_data->'question_labels','{}'),p_data->>'default_session_type',p_data->>'default_program_interest_text',coalesce((p_data->>'effective_from')::timestamptz,now()),auth.uid()) returning * into m;
 return to_jsonb(m);
end $$;
create function public.crm_retire_meta_form_mapping(p_mapping uuid) returns void language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ begin
 perform crm_security.require_reader(true);
 update public.crm_form_mappings set retired_at=greatest(clock_timestamp(),effective_from+interval '1 microsecond') where id=p_mapping and retired_at is null;
 if not found then raise exception 'Active mapping required' using errcode='22023'; end if;
end $$;

-- Server sends only a verified, allowlisted Page notification, never a token.
create function public.crm_accept_meta_events(p_events jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare e jsonb;c public.crm_integration_connections;j uuid;accepted integer:=0;ignored integer:=0;begin
 perform crm_security.require_meta_worker();
 if jsonb_typeof(p_events) is distinct from 'array' or jsonb_array_length(p_events)>100 or octet_length(p_events::text)>131072 then raise exception 'Bounded events required' using errcode='22023'; end if;
 for e in select value from jsonb_array_elements(p_events) loop
  if e-array['page_id','leadgen_id','form_id','created_time']<>'{}' or coalesce(e->>'page_id','') !~ '^[0-9]{1,32}$' or coalesce(e->>'leadgen_id','') !~ '^[0-9]{1,32}$' or coalesce(e->>'form_id','') !~ '^[0-9]{1,32}$' then raise exception 'Invalid event' using errcode='22023'; end if;
  select * into c from public.crm_integration_connections where page_id=e->>'page_id' for share;
  if not found then ignored:=ignored+1;continue;end if;
  insert into public.crm_ingestion_jobs(connection_id,external_key,event_kind,payload,payload_hash,status,last_error_code,last_error_summary)
  values(c.id,c.page_id||':'||(e->>'leadgen_id'),'leadgen',e,encode(sha256(convert_to(e::text,'UTF8')),'hex'),case when c.enabled then 'pending' else 'blocked' end,
   case when not c.enabled then 'connection_disabled' end,case when not c.enabled then 'Connection disabled' end)
  on conflict(connection_id,event_kind,external_key) do nothing returning id into j;
  accepted:=accepted+1;
 end loop;
 return jsonb_build_object('accepted',accepted,'ignored',ignored);
end $$;
create function public.crm_claim_meta_jobs(p_limit integer default 5) returns jsonb language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ declare ids uuid[];result jsonb;begin
 perform crm_security.require_meta_worker();
 if p_limit is null or p_limit not between 1 and 10 then raise exception 'Invalid batch size' using errcode='22023';end if;
 with due as (select j.id from public.crm_ingestion_jobs j join public.crm_integration_connections c on c.id=j.connection_id
  where c.enabled and ((j.status in ('pending','retry') and j.next_attempt_at<=now()) or (j.status='processing' and j.lease_until<=now()))
  order by j.next_attempt_at,j.created_at,j.id limit p_limit for update of j skip locked), claimed as (
 update public.crm_ingestion_jobs j set status=case when attempt_count>=8 then 'dead' else 'processing' end,
  attempt_count=attempt_count+case when attempt_count<8 then 1 else 0 end,lease_token=case when attempt_count<8 then gen_random_uuid() end,lease_until=case when attempt_count<8 then now()+interval '2 minutes' end,
  updated_at=now(),last_error_code=case when attempt_count>=8 then 'attempts_exhausted' end,last_error_summary=null
 where j.id in(select id from due) returning j.id) select array_agg(id) into ids from claimed;
 select coalesce(jsonb_agg(jsonb_build_object('id',j.id,'lease_token',j.lease_token,'payload',j.payload,'connection',jsonb_build_object('id',c.id,'page_id',c.page_id,'api_version',c.api_version,'access_token_secret_ref',c.access_token_secret_ref)) order by j.created_at,j.id),'[]') into result
 from public.crm_ingestion_jobs j join public.crm_integration_connections c on c.id=j.connection_id
 where j.status='processing' and j.id=any(ids);
 return result;
end $$;
create function public.crm_get_meta_job_mapping(p_job uuid,p_lease uuid,p_form text,p_occurred timestamptz) returns jsonb
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
 if m.retired_at is not null and m.retired_at<=p_occurred then return null;end if;
 return to_jsonb(m);
end $$;
create function public.crm_fail_meta_job(p_job uuid,p_lease uuid,p_code text) returns void
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ declare state text;begin
 perform crm_security.require_meta_worker();
 state:=case when p_code in ('timeout','rate_limit','provider_unavailable','network','storage_unavailable') then 'retry'
 when p_code in ('missing_secret','provider_auth','missing_mapping','missing_policy','connection_disabled') then 'blocked'
 when p_code in ('invalid_provider_data','invalid_mapping','attempts_exhausted') then 'dead' end;
 if state is null then raise exception 'Unsupported error code' using errcode='22023';end if;
 update public.crm_ingestion_jobs set status=case when attempt_count>=8 and state='retry' then 'dead' else state end,
  last_error_code=p_code,last_error_summary=replace(p_code,'_',' '),lease_token=null,lease_until=null,
  next_attempt_at=now()+make_interval(secs=>least(3600,30*power(2,least(attempt_count,7))::integer)),updated_at=now()
 where id=p_job and status='processing' and lease_token=p_lease and lease_until>now();
 if not found then raise exception 'Stale lease' using errcode='40001';end if;
end $$;

-- Shared attachment/new-opportunity primitive. Unlike the Phase 3 user-only
-- dispatcher, it supports integration actors and the full latest-touch ordering.
create function crm_security.accept_meta_submission(sid uuid,contact uuid default null,lead uuid default null) returns uuid
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
  values(l.id,now(),auth.uid(),actor_kind,'lead_created','meta-intake:'||s.id||':lead','NEW');
  insert into public.crm_tasks(lead_id,task_type,due_at,source_kind,source_key,policy_id,outreach_cycle,attempt_ordinal)
  values(l.id,'first_contact',due,'intake','attempt:'||l.id||':1:1',p.id,1,1) returning id into tid;
  insert into public.crm_activities(lead_id,occurred_at,actor_id,actor_kind,event_type,source_key,task_id)
  values(l.id,now(),auth.uid(),actor_kind,'task_created','meta-intake:'||s.id||':task',tid);
 else
  select * into l from public.crm_leads where id=lead for update;
  if not found or l.merged_into_lead_id is not null or l.status not in ('NEW','CONTACTING','ENGAGED','QUALIFIED') then raise exception 'Active lead required' using errcode='40001';end if;
  update public.crm_leads set latest_submission_id=case when row(s.occurred_at,s.received_at,s.id)>
   (select x.occurred_at,x.received_at,x.id from public.crm_submissions x where x.id=l.latest_submission_id) then s.id else latest_submission_id end,
   version=version+1,updated_at=now() where id=l.id;
 end if;
 update public.crm_submissions set lead_id=l.id,match_status='resolved',resolved_by=auth.uid(),resolved_at=now() where id=s.id;
 insert into public.crm_activities(lead_id,occurred_at,actor_id,actor_kind,event_type,source_key,submission_id)
 values(l.id,now(),auth.uid(),actor_kind,'submission_received','meta-intake:'||s.id||':submission',s.id);
 return l.id;
end $$;

create function public.crm_finalize_meta_job(p_job uuid,p_lease uuid,p_mapping uuid,p_data jsonb) returns jsonb
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
  if not ambiguous and coalesce(cardinality(leads),0)<=1 then lead:=crm_security.accept_meta_submission(s.id,contact,leads[1]);end if;
 end if;
 if lead is null then
  update public.crm_submissions set candidate_lead_ids=coalesce((select array_agg(id) from (select id from public.crm_leads where contact_id=any(contacts) and merged_into_lead_id is null and status in ('NEW','CONTACTING','ENGAGED','QUALIFIED') order by id limit 50)x),'{}') where id=s.id;
 end if;
 update public.crm_ingestion_jobs set status='done',lease_token=null,lease_until=null,updated_at=now(),last_error_code=null,last_error_summary=null where id=j.id;
 return jsonb_build_object('status','done','submission_id',s.id,'lead_id',lead,'needs_review',lead is null);
end $$;
create function public.crm_list_intake_review(p_limit integer default 25,p_offset integer default 0) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ declare result jsonb;begin
 perform crm_security.require_reader();perform crm_security.check_page(p_limit,p_offset);
 select jsonb_build_object('total',(select count(*) from public.crm_submissions s join public.crm_ingestion_jobs j on j.submission_id=s.id where s.match_status='needs_review' and j.status='done'),
 'rows',coalesce(jsonb_agg(jsonb_build_object('id',s.id,'received_at',s.received_at,'contact_name',s.core_fields->>'contact_name','phone',s.core_fields->>'phone','email',s.core_fields->>'email',
 'learner_name',s.core_fields->>'learner_name','program_interest_text',s.core_fields->>'program_interest_text',
 'contact_candidates',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'version',c.version,'name',c.display_name)) from (select id,version,display_name from public.crm_contacts where merged_into_contact_id is null and ((phone_e164 is not null and phone_e164=crm_security.normalize_phone(s.core_fields->>'phone')) or (email_normalized is not null and email_normalized=lower(btrim(s.core_fields->>'email')))) order by id limit 25)c),'[]'::jsonb),'answers',crm_security.operational_answers(s.form_answers),
 'candidates',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'version',l.version,'contact_id',l.contact_id,'contact_name',c.display_name,'learner_name',l.learner_name,'program',l.program_interest_text)) from public.crm_leads l join public.crm_contacts c on c.id=l.contact_id where l.id=any(s.candidate_lead_ids) and l.status in ('NEW','CONTACTING','ENGAGED','QUALIFIED') and l.merged_into_lead_id is null),'[]'::jsonb)) order by s.received_at,s.id),'[]')) into result
 from (select s.* from public.crm_submissions s join public.crm_ingestion_jobs j on j.submission_id=s.id where s.match_status='needs_review' and j.status='done' order by s.received_at,s.id limit p_limit offset p_offset)s;
 return result;
end $$;
create function public.crm_resolve_meta_intake(p_request uuid,p_submission uuid,p_action text,p_data jsonb default '{}') returns jsonb
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
 select * into s from public.crm_submissions where id=p_submission and channel='meta_instant_form' for update;
 if not found or s.match_status<>'needs_review' or not exists(select 1 from public.crm_ingestion_jobs where submission_id=s.id and status='done') then raise exception 'Intake already resolved or configuration blocked' using errcode='40001';end if;
 if p_action='reject' then update public.crm_submissions set match_status='rejected' where id=s.id;
 elsif p_action='attach' then
  select * into l from public.crm_leads where id=(p_data->>'lead_id')::uuid for update;
  if not found or l.version is distinct from (p_data->>'expected_version')::bigint then raise exception 'Refresh lead version' using errcode='40001';end if;
  lead:=crm_security.accept_meta_submission(s.id,null,l.id);
 else
  if p_data->>'contact_id' is not null then
   perform 1 from public.crm_contacts where id=(p_data->>'contact_id')::uuid and version=(p_data->>'contact_version')::bigint and merged_into_contact_id is null for update;
   if not found then raise exception 'Refresh contact version' using errcode='40001';end if;
  end if;
  if exists(select 1 from jsonb_each_text(p_data) where key in ('contact_name','learner_name','program_interest_text') and length(value) not between 1 and 200) then raise exception 'Invalid resolution fields' using errcode='22023';end if;
  update public.crm_submissions set core_fields=core_fields||(p_data-array['lead_id','expected_version','contact_id','contact_version']) where id=s.id;
  lead:=crm_security.accept_meta_submission(s.id,(p_data->>'contact_id')::uuid);
 end if;
 result:=jsonb_build_object('submission_id',s.id,'lead_id',lead,'status',case when p_action='reject' then 'rejected' else 'resolved' end);
 insert into public.crm_command_requests(actor_scope,command_name,request_key,payload_hash,result) values(auth.uid()::text,'resolve_meta_intake',p_request,digest,result);
 return result;
end $$;
create function public.crm_get_meta_diagnostics(p_limit integer default 50,p_offset integer default 0) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ declare result jsonb;begin
 perform crm_security.require_reader(true);perform crm_security.check_page(p_limit,p_offset);
 select jsonb_build_object('connections',(select coalesce(jsonb_agg(to_jsonb(c) order by c.connection_key),'[]') from public.crm_integration_connections c),
 'mappings',(select coalesce(jsonb_agg(to_jsonb(m) order by m.connection_id,m.form_key,m.version),'[]') from public.crm_form_mappings m),
 'total',(select count(*) from public.crm_ingestion_jobs),'jobs',coalesce(jsonb_agg(jsonb_build_object('id',j.id,'connection_id',j.connection_id,'status',j.status,'attempt_count',j.attempt_count,
 'received_at',j.created_at,'next_attempt_at',j.next_attempt_at,'last_error_code',j.last_error_code,'submission_id',j.submission_id) order by j.created_at desc,j.id),'[]')) into result
 from(select * from public.crm_ingestion_jobs order by created_at desc,id limit p_limit offset p_offset)j;return result;
end $$;
create function public.crm_retry_meta_job(p_job uuid) returns void language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ begin
 perform crm_security.require_reader(true);
 update public.crm_ingestion_jobs set status='pending',next_attempt_at=now(),last_error_code=null,last_error_summary=null,updated_at=now()
 where id=p_job and status in ('blocked','retry') and attempt_count<8;
 if not found then raise exception 'Retryable job required' using errcode='22023';end if;
end $$;
-- Optional durable wake-up, matching the existing receipt pg_net pattern. Vault
-- holds ONLY worker URL/shared bearer, never Meta account tokens. No secrets seeded.
create function crm_security.kick_meta_worker() returns trigger language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ declare url text;token text;begin
 if new.status<>'pending' then return new;end if;
 select decrypted_secret into url from vault.decrypted_secrets where name='crm_meta_worker_url';
 select decrypted_secret into token from vault.decrypted_secrets where name='crm_meta_worker_token';
 if url is not null and token is not null and url ~ '^https://[^/]+/api/internal/crm/meta/process$' then
  perform net.http_post(url=>url,headers=>jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||token),body=>'{}'::jsonb,timeout_milliseconds=>1000);
 end if;
 return new;
 exception when others then return new; -- Job survives a failed kick; scheduler/manual retry drains it.
end $$;
create trigger crm_meta_job_kick after insert or update of status on public.crm_ingestion_jobs for each row execute function crm_security.kick_meta_worker();

revoke all on all functions in schema crm_security from public,anon,authenticated,service_role;
revoke all on function public.crm_save_meta_connection(jsonb,uuid,bigint),public.crm_publish_meta_form_mapping(uuid,jsonb),public.crm_retire_meta_form_mapping(uuid),
 public.crm_get_meta_diagnostics(integer,integer),public.crm_retry_meta_job(uuid),public.crm_list_intake_review(integer,integer),public.crm_resolve_meta_intake(uuid,uuid,text,jsonb),
 public.crm_accept_meta_events(jsonb),public.crm_claim_meta_jobs(integer),public.crm_get_meta_job_mapping(uuid,uuid,text,timestamptz),public.crm_fail_meta_job(uuid,uuid,text),public.crm_finalize_meta_job(uuid,uuid,uuid,jsonb)
 from public,anon,authenticated,service_role;
grant execute on function public.crm_save_meta_connection(jsonb,uuid,bigint),public.crm_publish_meta_form_mapping(uuid,jsonb),public.crm_retire_meta_form_mapping(uuid),
 public.crm_get_meta_diagnostics(integer,integer),public.crm_retry_meta_job(uuid),public.crm_list_intake_review(integer,integer),public.crm_resolve_meta_intake(uuid,uuid,text,jsonb) to authenticated;
grant execute on function public.crm_accept_meta_events(jsonb),public.crm_claim_meta_jobs(integer),public.crm_get_meta_job_mapping(uuid,uuid,text,timestamptz),public.crm_fail_meta_job(uuid,uuid,text),public.crm_finalize_meta_job(uuid,uuid,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
