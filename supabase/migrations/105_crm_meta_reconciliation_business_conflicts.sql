-- Bounded reconciliation conflicts; preserve existing function identity, owner and ACL.
begin;
create or replace function public.crm_enqueue_meta_reconciled(p_connection uuid,p_form text,p_lease uuid,p_events jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare c public.crm_integration_connections;s public.crm_meta_reconciliation_state;e jsonb; started timestamptz; lower_bound timestamptz; occurred timestamptz; added integer:=0; existing integer:=0; inserted_id uuid; begin
 perform crm_security.require_meta_worker();
 if jsonb_typeof(p_events) is distinct from 'array' or jsonb_array_length(p_events)>50 or octet_length(p_events::text)>16384 then raise exception 'Bounded events required' using errcode='22023'; end if;
 select * into c from public.crm_integration_connections where id=p_connection for share;
 select * into s from public.crm_meta_reconciliation_state where connection_id=p_connection and form_key=p_form and lease_token=p_lease and lease_until>now() for update;
 if not found then raise sqlstate 'PT409' using message='crm_reconciliation_lease_lost'; end if;
 started:=crm_security.meta_reconciliation_started(c);
 if started is null then raise sqlstate 'PT409' using message='crm_reconciliation_disabled'; end if;
 lower_bound:=greatest(started,now()-make_interval(mins=>(c.settings #>> '{meta_reconciliation,lookback_minutes}')::integer));
 if not exists(select 1 from public.crm_form_mappings m where m.connection_id=p_connection and m.form_key=p_form and m.effective_from<=now() and (m.retired_at is null or m.retired_at>now())) then raise sqlstate 'PT409' using message='crm_reconciliation_form_inactive'; end if;
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

create or replace function public.crm_finish_meta_reconciliation(p_connection uuid,p_form text,p_lease uuid,p_error text default null) returns void
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ begin
 perform crm_security.require_meta_worker();
 if p_error is not null and p_error not in ('rate_limit','provider_unavailable','provider_auth','timeout','network','invalid_provider_data','missing_secret','storage_unavailable','reconciliation_disabled','reconciliation_form_inactive') then raise exception 'Invalid error code' using errcode='22023';end if;
 update public.crm_meta_reconciliation_state set lease_token=null,lease_until=null,
 next_due_at=now()+case when p_error='rate_limit' then interval '15 minutes' when p_error is null then interval '10 minutes' else interval '5 minutes' end,
 last_error_code=p_error,updated_at=now()
 where connection_id=p_connection and form_key=p_form and lease_token=p_lease and lease_until>now();
 if not found then raise sqlstate 'PT409' using message='crm_reconciliation_lease_lost';end if;
end $$;
commit;
