-- Phase 13: bounded Meta discovery into the existing durable intake queue.
begin;
-- Configuration remains on the versioned Meta connection. Existing rows remain disabled.
alter table public.crm_integration_connections drop constraint crm_connection_provider_shape;
alter table public.crm_integration_connections add constraint crm_connection_provider_shape check(
 (provider='meta' and page_id is not null and api_version is not null
  and jsonb_typeof(settings)='object' and octet_length(settings::text)<=2048
  and settings-array['meta_reconciliation']='{}'::jsonb
  and (not settings ? 'meta_reconciliation' or (
    jsonb_typeof(settings->'meta_reconciliation')='object'
    and (settings->'meta_reconciliation')-array['enabled','started_at','lookback_minutes']='{}'::jsonb
    and jsonb_typeof(settings #> '{meta_reconciliation,enabled}')='boolean'
    and (settings #>> '{meta_reconciliation,lookback_minutes}')::integer between 10 and 1440
    and ((settings #>> '{meta_reconciliation,enabled}')='true')=(settings #>> '{meta_reconciliation,started_at}' is not null))))
 or (provider='website' and page_id is null and api_version is null and account_id is null and access_token_secret_ref is null
 and settings ? 'origin' and jsonb_typeof(settings->'origin')='string' and settings-array['origin']='{}'::jsonb
 and settings->>'origin' ~ '^(https://[a-zA-Z0-9.-]+(:[0-9]{1,5})?|http://(localhost|127\.0\.0\.1)(:[0-9]{1,5})?)$'));
alter table public.crm_form_mappings add column option_labels jsonb not null default '{}'::jsonb
 check (jsonb_typeof(option_labels)='object' and octet_length(option_labels::text)<=16384);
alter table public.crm_ingestion_jobs add column reconciliation_started_at timestamptz;
create table public.crm_meta_reconciliation_state (
 connection_id uuid not null references public.crm_integration_connections(id),
 form_key text not null check (form_key ~ '^[0-9]{1,32}$'),
 next_due_at timestamptz not null default now(),
 lease_token uuid, lease_until timestamptz,
 last_error_code text, updated_at timestamptz not null default now(),
 primary key(connection_id,form_key),
 check ((lease_token is null)=(lease_until is null))
);
alter table public.crm_meta_reconciliation_state enable row level security;
revoke all on public.crm_meta_reconciliation_state from public,anon,authenticated,service_role;

create function crm_security.meta_reconciliation_started(c public.crm_integration_connections) returns timestamptz
language sql stable set search_path=pg_catalog,pg_temp as $$
 select case when c.provider='meta' and c.settings #>> '{meta_reconciliation,enabled}'='true'
 then nullif(c.settings #>> '{meta_reconciliation,started_at}','')::timestamptz end
$$;
create function crm_security.meta_job_allowed(c public.crm_integration_connections,j public.crm_ingestion_jobs) returns boolean
language sql stable set search_path=pg_catalog,pg_temp as $$
 select c.enabled or coalesce((c.provider='meta' and j.reconciliation_started_at is not null
  and j.reconciliation_started_at=crm_security.meta_reconciliation_started(c)
  and (j.payload->>'created_time')::bigint >= extract(epoch from j.reconciliation_started_at)::bigint),false)
$$;

create or replace function public.crm_save_meta_connection(p_data jsonb,p_id uuid default null,p_version bigint default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ declare c public.crm_integration_connections; r jsonb; old_enabled boolean; new_enabled boolean; lookback integer; begin
 perform crm_security.require_reader(true);
 if jsonb_typeof(p_data) is distinct from 'object' or p_data-array['connection_key','page_id','account_id','api_version','access_token_secret_ref','enabled','meta_reconciliation']<>'{}' then raise exception 'Invalid connection fields' using errcode='22023'; end if;
 if p_data ? 'meta_reconciliation' then
  r:=p_data->'meta_reconciliation';
  if jsonb_typeof(r) is distinct from 'object' or r-array['enabled','lookback_minutes']<>'{}'::jsonb
   or jsonb_typeof(r->'enabled') is distinct from 'boolean'
   or (r ? 'lookback_minutes' and (jsonb_typeof(r->'lookback_minutes') is distinct from 'number' or (r->>'lookback_minutes') !~ '^[0-9]{1,4}$'))
   then raise exception 'Invalid reconciliation configuration' using errcode='22023'; end if;
  lookback:=coalesce((r->>'lookback_minutes')::integer,60);
  if lookback not between 10 and 1440 then raise exception 'Invalid reconciliation lookback' using errcode='22023'; end if;
 end if;
 if p_data ? 'enabled' and jsonb_typeof(p_data->'enabled') is distinct from 'boolean' then raise exception 'Invalid realtime setting' using errcode='22023'; end if;
 if p_id is null and r->>'enabled'='true' and nullif(p_data->>'access_token_secret_ref','') is null then raise exception 'Meta token reference required' using errcode='22023'; end if;
 if p_id is null then
  insert into public.crm_integration_connections(connection_key,page_id,account_id,api_version,access_token_secret_ref,settings,created_by,updated_by)
  values(p_data->>'connection_key',p_data->>'page_id',p_data->>'account_id',p_data->>'api_version',p_data->>'access_token_secret_ref',case when r is null then '{}'::jsonb else jsonb_build_object('meta_reconciliation',jsonb_build_object('enabled',r->'enabled','started_at',case when r->>'enabled'='true' then to_jsonb(clock_timestamp()) else 'null'::jsonb end,'lookback_minutes',lookback)) end,auth.uid(),auth.uid()) returning * into c;
 else
  select * into c from public.crm_integration_connections where id=p_id for update;
  if not found or c.version is distinct from p_version then raise exception 'Refresh connection version' using errcode='40001'; end if;
  if p_data->>'page_id' is distinct from c.page_id or p_data->>'connection_key' is distinct from c.connection_key then raise exception 'Connection identity immutable' using errcode='22023'; end if;
  old_enabled:=coalesce(c.settings #>> '{meta_reconciliation,enabled}'='true',false);
  new_enabled:=coalesce((r->>'enabled')::boolean,old_enabled);
  if new_enabled and nullif(coalesce(p_data->>'access_token_secret_ref',c.access_token_secret_ref),'') is null then raise exception 'Meta token reference required' using errcode='22023'; end if;
  update public.crm_integration_connections set account_id=p_data->>'account_id',api_version=p_data->>'api_version',access_token_secret_ref=p_data->>'access_token_secret_ref',
   enabled=coalesce((p_data->>'enabled')::boolean,c.enabled),settings=case when r is null then c.settings else jsonb_build_object('meta_reconciliation',jsonb_build_object('enabled',new_enabled,'started_at',case when not new_enabled then 'null'::jsonb when not old_enabled then to_jsonb(clock_timestamp()) else c.settings #> '{meta_reconciliation,started_at}' end,'lookback_minutes',lookback)) end,updated_at=now(),updated_by=auth.uid(),version=version+1 where id=p_id returning * into c;
 end if;
 return to_jsonb(c);
end $$;

create or replace function public.crm_publish_meta_form_mapping(p_connection uuid,p_data jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ declare m public.crm_form_mappings;kv record;n integer;begin
 perform crm_security.require_reader(true);
 if jsonb_typeof(p_data) is distinct from 'object' or p_data-array['form_key','form_name','field_map','question_labels','default_session_type','default_program_interest_text','effective_from','learner_policy','option_labels']<>'{}' then raise exception 'Invalid mapping fields' using errcode='22023'; end if;
 if p_data ? 'learner_policy' and (jsonb_typeof(p_data->'learner_policy') is distinct from 'string' or p_data->>'learner_policy' not in ('required','optional')) then raise exception 'Invalid learner policy' using errcode='22023'; end if;
 if jsonb_typeof(p_data->'field_map') is distinct from 'object' or (p_data->'field_map')-array['contact_name','phone','whatsapp','email','learner_name','learner_age','learner_birth_date','session_type','program_interest_text']<>'{}' then raise exception 'Invalid canonical mapping' using errcode='22023'; end if;
 for kv in select * from jsonb_each(p_data->'field_map') loop
  if jsonb_typeof(kv.value)<>'string' or length(kv.value#>>'{}') not between 1 and 100 then raise exception 'Invalid field key' using errcode='22023'; end if;
 end loop;
 for kv in select * from jsonb_each(coalesce(p_data->'question_labels','{}')) loop
  if length(kv.key)>100 or jsonb_typeof(kv.value)<>'string' or length(kv.value#>>'{}') not between 1 and 200 then raise exception 'Invalid question label' using errcode='22023'; end if;
 end loop;
 if jsonb_typeof(coalesce(p_data->'option_labels','{}'::jsonb)) is distinct from 'object' or octet_length(coalesce(p_data->'option_labels','{}'::jsonb)::text)>16384 then raise exception 'Invalid option labels' using errcode='22023'; end if;
 for kv in select key,value from jsonb_each(coalesce(p_data->'option_labels','{}'::jsonb)) loop
  if length(kv.key) not between 1 and 100 or jsonb_typeof(kv.value) is distinct from 'object' then raise exception 'Invalid option question' using errcode='22023'; end if;
  if exists(select 1 from jsonb_each(kv.value) o where length(o.key) not between 1 and 200 or jsonb_typeof(o.value) is distinct from 'string' or length(btrim(o.value#>>'{}')) not between 1 and 200) then raise exception 'Invalid option value' using errcode='22023'; end if;
 end loop;
 perform 1 from public.crm_integration_connections where id=p_connection for update;
 if not found then raise exception 'Connection not found' using errcode='22023'; end if;
 select coalesce(max(version),0)+1 into n from public.crm_form_mappings where connection_id=p_connection and form_key=p_data->>'form_key';
 insert into public.crm_form_mappings(connection_id,form_key,version,form_name,field_map,question_labels,default_session_type,default_program_interest_text,effective_from,created_by,learner_policy,option_labels)
 values(p_connection,p_data->>'form_key',n,p_data->>'form_name',p_data->'field_map',coalesce(p_data->'question_labels','{}'),p_data->>'default_session_type',p_data->>'default_program_interest_text',coalesce((p_data->>'effective_from')::timestamptz,now()),auth.uid(),coalesce(p_data->>'learner_policy','required'),coalesce(p_data->'option_labels','{}'::jsonb)) returning * into m;
 return to_jsonb(m);
end $$;

create or replace function crm_security.valid_answers(answers jsonb) returns boolean
language plpgsql immutable set search_path=pg_catalog,pg_temp as $$
declare a jsonb;
begin
  if jsonb_typeof(answers) is distinct from 'array' then return false; end if;
  for a in select value from jsonb_array_elements(answers) loop
    if jsonb_typeof(a) is distinct from 'object'
      or not (a ?& array['key','label','value','value_type','label_source'])
      or (a - array['key','label','value','value_type','label_source','display_value']) <> '{}'::jsonb
      or jsonb_typeof(a->'key') is distinct from 'string' or length(btrim(a->>'key'))=0
      or jsonb_typeof(a->'label') is distinct from 'string'
      or jsonb_typeof(a->'label_source') is distinct from 'string' or length(btrim(a->>'label_source'))=0
      or jsonb_typeof(a->'value_type') is distinct from 'string'
      or (a->>'value_type') is distinct from jsonb_typeof(a->'value')
      or (a ? 'display_value' and (jsonb_typeof(a->'display_value') is distinct from jsonb_typeof(a->'value')
       or jsonb_typeof(a->'display_value') not in ('string','array') or octet_length((a->'display_value')::text)>8192
       or exists (select 1 from jsonb_array_elements(
         case when jsonb_typeof(a->'display_value')='array' then a->'display_value' else '[]'::jsonb end
        ) x where jsonb_typeof(x.value)<>'string'))) then return false; end if;
  end loop;
  return true;
end $$;

create or replace function crm_security.operational_answers(answers jsonb) returns jsonb
language sql immutable set search_path=pg_catalog,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object('key',a->>'key','label',a->>'label','value',a->'value','display_value',a->'display_value') order by n),'[]'::jsonb)
 from jsonb_array_elements(answers) with ordinality x(a,n)
 where not crm_security.reserved_answer_key(a->>'key')
 and not crm_security.reserved_answer_key(a->>'label') and jsonb_typeof(a->'value') in ('string','number','boolean','array','null')
 and not exists(select 1 from jsonb_array_elements(case when jsonb_typeof(a->'value')='array' then a->'value' else '[]'::jsonb end)v where jsonb_typeof(v) not in ('string','number','boolean','null'))
$$;

create or replace function public.crm_claim_ingestion_jobs(p_limit integer default 5,p_provider text default null) returns jsonb language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ declare ids uuid[];result jsonb;begin
 perform crm_security.require_meta_worker();
 if p_provider is not null and p_provider not in ('meta','website') then raise exception 'Invalid provider' using errcode='22023';end if;
 if p_limit is null or p_limit not between 1 and 10 then raise exception 'Invalid batch size' using errcode='22023';end if;
 with due as (select j.id from public.crm_ingestion_jobs j join public.crm_integration_connections c on c.id=j.connection_id
  where crm_security.meta_job_allowed(c,j) and (p_provider is null or c.provider=p_provider) and ((j.status in ('pending','retry') and j.next_attempt_at<=now()) or (j.status='processing' and j.lease_until<=now()))
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

create or replace function public.crm_finalize_meta_job(p_job uuid,p_lease uuid,p_mapping uuid,p_data jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare j public.crm_ingestion_jobs;c public.crm_integration_connections;m public.crm_form_mappings;s public.crm_submissions;
 d jsonb;a jsonb;phone text;email text;contacts uuid[];leads uuid[];contact uuid;lead uuid;occurred timestamptz;ambiguous boolean:=false;begin
 perform crm_security.require_meta_worker();
 -- Connection before job: configuration changes cannot race finalization.
 select c0.* into c from public.crm_integration_connections c0 join public.crm_ingestion_jobs j0 on j0.connection_id=c0.id where j0.id=p_job for share of c0;
 select * into j from public.crm_ingestion_jobs where id=p_job for update;
 if not found or j.status<>'processing' or j.lease_token is distinct from p_lease or j.lease_until<=now() then raise exception 'Stale lease' using errcode='40001';end if;
 if not crm_security.meta_job_allowed(c,j) then perform public.crm_fail_meta_job(p_job,p_lease,'connection_disabled');return jsonb_build_object('status','blocked');end if;
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

create function public.crm_claim_meta_reconciliation() returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare s public.crm_meta_reconciliation_state; connection_row public.crm_integration_connections; result jsonb; begin
 perform crm_security.require_meta_worker();
 insert into public.crm_meta_reconciliation_state(connection_id,form_key)
 select distinct on (m.connection_id,m.form_key) m.connection_id,m.form_key
 from public.crm_form_mappings m join public.crm_integration_connections c on c.id=m.connection_id
 where c.provider='meta' and crm_security.meta_reconciliation_started(c) is not null
 and m.channel='meta_instant_form' and m.effective_from<=now() and (m.retired_at is null or m.retired_at>now())
 order by m.connection_id,m.form_key,m.effective_from desc
 on conflict do nothing;
 select s0.* into s from public.crm_meta_reconciliation_state s0
 join public.crm_integration_connections c0 on c0.id=s0.connection_id
 where s0.next_due_at<=now() and (s0.lease_until is null or s0.lease_until<=now())
 and crm_security.meta_reconciliation_started(c0) is not null
 and exists(select 1 from public.crm_form_mappings m where m.connection_id=s0.connection_id and m.form_key=s0.form_key
  and m.channel='meta_instant_form' and m.effective_from<=now() and (m.retired_at is null or m.retired_at>now()))
 order by s0.next_due_at,s0.updated_at,s0.connection_id,s0.form_key limit 1 for update of s0 skip locked;
 if not found then return null; end if;
 update public.crm_meta_reconciliation_state set lease_token=gen_random_uuid(),lease_until=now()+interval '55 seconds',updated_at=now()
 where connection_id=s.connection_id and form_key=s.form_key returning * into s;
 select * into connection_row from public.crm_integration_connections where id=s.connection_id;
 result:=jsonb_build_object('connection_id',connection_row.id,'page_id',connection_row.page_id,'form_key',s.form_key,'api_version',connection_row.api_version,
  'access_token_secret_ref',connection_row.access_token_secret_ref,'started_at',crm_security.meta_reconciliation_started(connection_row),
  'lookback_minutes',(connection_row.settings #>> '{meta_reconciliation,lookback_minutes}')::integer,'lease_token',s.lease_token);
 return result;
end $$;

create function public.crm_enqueue_meta_reconciled(p_connection uuid,p_form text,p_lease uuid,p_events jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare c public.crm_integration_connections;s public.crm_meta_reconciliation_state;e jsonb; started timestamptz; lower_bound timestamptz; occurred timestamptz; added integer:=0; existing integer:=0; inserted_id uuid; begin
 perform crm_security.require_meta_worker();
 if jsonb_typeof(p_events) is distinct from 'array' or jsonb_array_length(p_events)>50 or octet_length(p_events::text)>16384 then raise exception 'Bounded events required' using errcode='22023'; end if;
 select * into c from public.crm_integration_connections where id=p_connection for share;
 select * into s from public.crm_meta_reconciliation_state where connection_id=p_connection and form_key=p_form and lease_token=p_lease and lease_until>now() for update;
 started:=crm_security.meta_reconciliation_started(c);
 if not found or started is null then raise exception 'Stale reconciliation lease' using errcode='40001'; end if;
 lower_bound:=greatest(started,now()-make_interval(mins=>(c.settings #>> '{meta_reconciliation,lookback_minutes}')::integer));
 if not exists(select 1 from public.crm_form_mappings m where m.connection_id=p_connection and m.form_key=p_form and m.effective_from<=now() and (m.retired_at is null or m.retired_at>now())) then raise exception 'Form inactive' using errcode='40001'; end if;
 for e in select value from jsonb_array_elements(p_events) loop
  if jsonb_typeof(e) is distinct from 'object' or e-array['page_id','leadgen_id','form_id','created_time']<>'{}'::jsonb
   or coalesce(e->>'page_id','') !~ '^[0-9]{1,32}$' or e->>'page_id' is distinct from c.page_id
   or coalesce(e->>'leadgen_id','') !~ '^[0-9]{1,32}$' or e->>'form_id' is distinct from p_form
   or jsonb_typeof(e->'created_time') is distinct from 'number' or (e->>'created_time') !~ '^[0-9]{1,12}$'
   then raise exception 'Invalid discovered lead' using errcode='22023'; end if;
  occurred:=to_timestamp((e->>'created_time')::bigint);
  if occurred<lower_bound or occurred>now()+interval '5 minutes' then raise exception 'Outside reconciliation window' using errcode='22023'; end if;
  insert into public.crm_ingestion_jobs(connection_id,external_key,event_kind,payload,payload_hash,status,reconciliation_started_at)
  values(c.id,c.page_id||':'||(e->>'leadgen_id'),'leadgen',e,encode(sha256(convert_to(e::text,'UTF8')),'hex'),'pending',started)
  on conflict(connection_id,event_kind,external_key) do update set status='pending',reconciliation_started_at=started,
   payload=e,payload_hash=encode(sha256(convert_to(e::text,'UTF8')),'hex'),
   last_error_code=null,last_error_summary=null,updated_at=now()
  where public.crm_ingestion_jobs.status='blocked' and public.crm_ingestion_jobs.last_error_code='connection_disabled'
   and public.crm_ingestion_jobs.payload->>'form_id'=p_form
  returning id into inserted_id;
  if found then added:=added+1; else existing:=existing+1; end if;
 end loop;
 return jsonb_build_object('enqueued',added,'existing',existing);
end $$;

create function public.crm_finish_meta_reconciliation(p_connection uuid,p_form text,p_lease uuid,p_error text default null) returns void
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ begin
 perform crm_security.require_meta_worker();
 if p_error is not null and p_error not in ('rate_limit','provider_unavailable','provider_auth','timeout','network','invalid_provider_data','missing_secret','storage_unavailable') then raise exception 'Invalid error code' using errcode='22023';end if;
 update public.crm_meta_reconciliation_state set lease_token=null,lease_until=null,
 next_due_at=now()+case when p_error='rate_limit' then interval '15 minutes' when p_error is null then interval '10 minutes' else interval '5 minutes' end,
 last_error_code=p_error,updated_at=now()
 where connection_id=p_connection and form_key=p_form and lease_token=p_lease and lease_until>now();
 if not found then raise exception 'Stale reconciliation lease' using errcode='40001';end if;
end $$;
revoke all on function public.crm_claim_meta_reconciliation(),public.crm_enqueue_meta_reconciled(uuid,text,uuid,jsonb),public.crm_finish_meta_reconciliation(uuid,text,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.crm_claim_meta_reconciliation(),public.crm_enqueue_meta_reconciled(uuid,text,uuid,jsonb),public.crm_finish_meta_reconciliation(uuid,text,uuid,text) to service_role;
commit;
