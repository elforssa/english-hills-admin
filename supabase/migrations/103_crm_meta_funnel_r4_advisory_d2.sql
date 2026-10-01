-- Owner-approved advisory-D2 R4. Forward only, dormant, no provider seed or activation.
begin;

-- This deployment contract is deliberately limited to the dormant inventory.
do $$begin
 if exists(select 1 from public.crm_lifecycle_activation_epochs where ended_at is null)
  or exists(select 1 from public.crm_lifecycle_producer_boundaries)
  or exists(select 1 from public.crm_lifecycle_producer_ownership)
  or exists(select 1 from public.crm_external_deliveries where delivery_mode='live') then
  raise exception 'Advisory upgrade requires a separate active-inventory plan' using errcode='55000';
 end if;
end $$;

alter table public.crm_lifecycle_eligibility_policies
 add column d2_requirement text not null default 'required' check(d2_requirement in ('required','advisory')),
 alter column adult_field_key drop not null, alter column adult_accepted_values drop not null,
 alter column sharing_field_key drop not null, alter column sharing_accepted_values drop not null,
 alter column notice_version drop not null, alter column notice_text_digest drop not null;
alter table public.crm_lifecycle_eligibility_policies add constraint crm_policy_d2_manifest check(
 (d2_requirement='required' and adult_field_key is not null and sharing_field_key is not null
   and adult_accepted_values is not null and sharing_accepted_values is not null
   and notice_version is not null and notice_text_digest is not null)
 or (d2_requirement='advisory' and lifecycle_model='r4_stage_entry')),
 add constraint crm_policy_d2_groups check(
 ((adult_field_key is null)=(adult_accepted_values is null))
 and ((sharing_field_key is null)=(sharing_accepted_values is null))
 and ((notice_version is null)=(notice_text_digest is null))
 and (adult_accepted_values is null or crm_security.valid_lifecycle_values(adult_accepted_values))
 and (sharing_accepted_values is null or crm_security.valid_lifecycle_values(sharing_accepted_values))
 and (notice_accepted_values is null or crm_security.valid_lifecycle_values(notice_accepted_values)));
alter table public.crm_lifecycle_producer_boundaries
 alter column notice_version drop not null, alter column notice_text_digest drop not null,
 add constraint crm_boundary_notice_pair check((notice_version is null)=(notice_text_digest is null));

-- No grant FK and no PII/provider matching. Every subject survives erasure.
create table public.crm_lifecycle_sharing_stops (
 id uuid primary key default gen_random_uuid(),
 scope text not null check(scope in ('opportunity','contact','submission_pending')),
 lead_id uuid references public.crm_leads(id) on delete restrict,
 contact_id uuid references public.crm_contacts(id) on delete restrict,
 pending_submission_id uuid references public.crm_submissions(id) on delete restrict,
 connection_id uuid references public.crm_integration_connections(id) on delete restrict,
 effective_at timestamptz not null default clock_timestamp(),
 reason_class text not null check(reason_class in ('inquiry_refusal','privacy_request','source_restriction')),
 tombstone_version integer not null default 1 check(tombstone_version=1),
 check((scope='opportunity' and lead_id is not null and contact_id is null and pending_submission_id is null and connection_id is not null)
 or (scope='contact' and contact_id is not null and lead_id is null and pending_submission_id is null)
 or (scope='submission_pending' and pending_submission_id is not null and lead_id is null and contact_id is null and connection_id is not null))
);
create unique index crm_stop_opportunity on public.crm_lifecycle_sharing_stops(lead_id,connection_id) where scope='opportunity';
create unique index crm_stop_contact on public.crm_lifecycle_sharing_stops(contact_id,connection_id) nulls not distinct where scope='contact';
create unique index crm_stop_pending on public.crm_lifecycle_sharing_stops(pending_submission_id,connection_id) where scope='submission_pending';
create table public.crm_lifecycle_sharing_stop_audit (
 stop_id uuid primary key references public.crm_lifecycle_sharing_stops(id) on delete restrict,
 request_id uuid unique,
 actor_id uuid references public.profiles(id) on delete restrict,
 source_class text check(source_class in ('director','form_choice','evidence_revoke','identity_handoff')),
 source_submission_id uuid references public.crm_submissions(id) on delete restrict,
 decision_reference text check(decision_reference ~ '^[A-Za-z0-9:_-]{8,100}$'),
 recorded_at timestamptz,
 closure_basis text check(closure_basis in ('epoch_ended','permanent_source_exclusion','verified_handoff')),
 closed_at timestamptz,
 redacted_at timestamptz,
 check((closed_at is null)=(closure_basis is null)),
 check(redacted_at is null or (request_id is null and actor_id is null and source_class is null
   and source_submission_id is null and decision_reference is null and recorded_at is null and closed_at is null and closure_basis is null))
);
create table public.crm_lifecycle_stop_handoffs (
 pending_stop_id uuid primary key references public.crm_lifecycle_sharing_stops(id) on delete restrict,
 final_stop_id uuid not null references public.crm_lifecycle_sharing_stops(id) on delete restrict,
 committed_at timestamptz not null default clock_timestamp()
);
-- Internal alias links carry suppression, not matching values or request audit.
create table public.crm_lifecycle_stop_carries (
 prior_stop_id uuid not null references public.crm_lifecycle_sharing_stops(id) on delete restrict,
 final_stop_id uuid not null references public.crm_lifecycle_sharing_stops(id) on delete restrict,
 primary key(prior_stop_id,final_stop_id)
);
alter table public.crm_lifecycle_sharing_stops enable row level security;
alter table public.crm_lifecycle_sharing_stop_audit enable row level security;
alter table public.crm_lifecycle_stop_handoffs enable row level security;
alter table public.crm_lifecycle_stop_carries enable row level security;
revoke all on public.crm_lifecycle_sharing_stops,public.crm_lifecycle_sharing_stop_audit,
 public.crm_lifecycle_stop_handoffs,public.crm_lifecycle_stop_carries from public,anon,authenticated,service_role;
create trigger crm_stop_immutable before update or delete on public.crm_lifecycle_sharing_stops for each row execute function crm_security.protect_lifecycle_append_only();
create trigger crm_stop_no_truncate before truncate on public.crm_lifecycle_sharing_stops for each statement execute function crm_security.reject_history_mutation();
create trigger crm_handoff_immutable before update or delete on public.crm_lifecycle_stop_handoffs for each row execute function crm_security.protect_lifecycle_append_only();
create trigger crm_handoff_no_truncate before truncate on public.crm_lifecycle_stop_handoffs for each statement execute function crm_security.reject_history_mutation();
create trigger crm_carry_immutable before update or delete on public.crm_lifecycle_stop_carries for each row execute function crm_security.protect_lifecycle_append_only();
create trigger crm_carry_no_truncate before truncate on public.crm_lifecycle_stop_carries for each statement execute function crm_security.reject_history_mutation();

-- Exact transaction-level keys reserved by the owner-approved contract.
create function crm_security.lifecycle_barrier(p_exclusive boolean default false) returns void
language plpgsql set search_path=pg_catalog,pg_temp as $$
begin
 if current_setting('transaction_isolation')<>'read committed' then
  raise exception 'Lifecycle requires READ COMMITTED transaction restart' using errcode='40001';
 end if;
 if p_exclusive and crm_security.lifecycle_has_barrier() and not crm_security.lifecycle_has_barrier(true) then
  raise exception 'Identity barrier upgrade requires transaction restart' using errcode='40001';end if;
 if p_exclusive then perform pg_advisory_xact_lock(460046,0);
 else perform pg_advisory_xact_lock_shared(460046,0);end if;
end $$;
create function crm_security.lifecycle_has_barrier(p_exclusive boolean default false) returns boolean
language sql volatile set search_path=pg_catalog,pg_temp as $$
 select exists(select 1 from pg_locks where pid=pg_backend_pid() and locktype='advisory'
  and classid=460046 and objid=0 and objsubid=2 and granted
  and (not p_exclusive or mode='ExclusiveLock'))
$$;
create function crm_security.lifecycle_scope_keys(p_scopes jsonb,p_try boolean default false) returns jsonb
language plpgsql set search_path=pg_catalog,pg_temp as $$
declare k record;allowed_l bigint[]:='{}';allowed_o integer[]:='{}';result jsonb;
begin
 if not crm_security.lifecycle_has_barrier() then raise exception 'Outermost lifecycle barrier required' using errcode='42501';end if;
 if exists(select 1 from jsonb_array_elements(p_scopes) x where x->>'lead' is null) then raise exception 'Verified resolved scope required' using errcode='22023';end if;
 for k in select distinct hashtextextended('crm:lifecycle:lead:'||(x->>'lead')::uuid::text,0) key
  from jsonb_array_elements(p_scopes) x order by key loop
  if not p_try then perform pg_advisory_xact_lock(k.key);allowed_l:=array_append(allowed_l,k.key);
  elsif pg_try_advisory_xact_lock(k.key) then allowed_l:=array_append(allowed_l,k.key);end if;
 end loop;
 for k in select distinct hashtext('crm:lifecycle:r4:opportunity:'||(x->>'connection')::uuid::text||':'||(x->>'lead')::uuid::text) key
  from jsonb_array_elements(p_scopes) x where x->>'connection' is not null
  and hashtextextended('crm:lifecycle:lead:'||(x->>'lead')::uuid::text,0)=any(allowed_l) order by key loop
  if not p_try then perform pg_advisory_xact_lock(460047,k.key);allowed_o:=array_append(allowed_o,k.key);
  elsif pg_try_advisory_xact_lock(460047,k.key) then allowed_o:=array_append(allowed_o,k.key);end if;
 end loop;
 select coalesce(jsonb_agg(x),'[]') into result from (select distinct x from jsonb_array_elements(p_scopes) x
  where hashtextextended('crm:lifecycle:lead:'||(x->>'lead')::uuid::text,0)=any(allowed_l)
  and (x->>'connection' is null or hashtext('crm:lifecycle:r4:opportunity:'||(x->>'connection')::uuid::text||':'||(x->>'lead')::uuid::text)=any(allowed_o))) admitted;
 return result;
end $$;

-- Complete rank 1 set before rank 2. FK reference locks count in this set.
-- All callers discover and acquire the complete advisory set before calling.
create function crm_security.lifecycle_scope_rows(p_scopes jsonb,p_evidence boolean default true,p_sources uuid[] default '{}') returns void
language plpgsql set search_path=pg_catalog,pg_temp as $$
declare leads uuid[];connections uuid[];sources uuid[];mappings uuid[];boundaries uuid[];policies uuid[];epochs uuid[];contracts uuid[];contacts uuid[];scope_item jsonb;
begin
 if not crm_security.lifecycle_has_barrier() then raise exception 'Lifecycle barrier required' using errcode='42501';end if;
 for scope_item in select * from jsonb_array_elements(p_scopes) loop
  if not crm_security.lifecycle_has_scope((scope_item->>'lead')::uuid,(scope_item->>'connection')::uuid) then raise exception 'Complete prelocked scope set required' using errcode='42501';end if;
 end loop;
 -- Bound source/control references to this materialized batch. Additional later
 -- evidence/objection sources must be explicitly supplied before rank1 starts.
 select array_agg(distinct (x->>'lead')::uuid),array_agg(distinct (x->>'connection')::uuid)
 into leads,connections from jsonb_array_elements(p_scopes) x;
 select array_agg(distinct id) into sources from (select first_submission_id id from public.crm_leads where id=any(leads) union select unnest(p_sources)) x where id is not null;
 select array_agg(distinct form_mapping_id) into mappings from public.crm_submissions where id=any(sources);
 select array_agg(distinct id) into boundaries from public.crm_lifecycle_producer_boundaries b where b.id in
  (select boundary_id from public.crm_lifecycle_producer_ownership where lead_id=any(leads) and connection_id=any(connections))
  or (b.form_mapping_id=any(mappings) and b.connection_id=any(connections) and exists(select 1 from public.crm_submissions ss where ss.id=any(sources) and ss.form_mapping_id=b.form_mapping_id and ss.occurred_at>=b.valid_from and ss.occurred_at<b.valid_until));
 select array_agg(distinct id) into policies from public.crm_lifecycle_eligibility_policies p where p.id in(select eligibility_policy_id from public.crm_lifecycle_producer_boundaries where id=any(boundaries))
  or (p.form_mapping_id=any(mappings) and exists(select 1 from public.crm_submissions ss where ss.id=any(sources) and ss.form_mapping_id=p.form_mapping_id and ss.occurred_at>=p.effective_from and ss.occurred_at<p.effective_until));
 select array_agg(distinct id) into epochs from public.crm_lifecycle_activation_epochs where id in(select activation_epoch_id from public.crm_lifecycle_producer_ownership where lead_id=any(leads) and connection_id=any(connections)) or (connection_id=any(connections) and ended_at is null);
 select array_agg(distinct id) into contracts from public.crm_lifecycle_provider_contracts where id in(select provider_contract_id from public.crm_lifecycle_activation_epochs where id=any(epochs)) or id in(select provider_contract_id from public.crm_lifecycle_producer_boundaries where id=any(boundaries));
 select array_agg(distinct id) into contacts from (select contact_id id from public.crm_leads where id=any(leads) union select crm_security.lifecycle_contact_root(contact_id) from public.crm_leads where id=any(leads)) x;
 perform 1 from public.crm_integration_connections where id=any(connections) order by id for key share;
 perform 1 from public.crm_lifecycle_provider_contracts where id=any(contracts) order by id for key share;
 perform 1 from public.crm_lifecycle_activation_epochs where id=any(epochs) order by id for key share;
 perform 1 from public.crm_form_mappings where id=any(mappings) order by id for key share;
 perform 1 from public.crm_lifecycle_eligibility_policies where id=any(policies) order by id for key share;
 perform 1 from public.crm_contacts where id=any(contacts) order by id for key share;
 perform 1 from public.crm_leads where id=any(leads) order by id for key share;
 perform 1 from public.crm_submissions where id=any(sources) order by id for key share;
 perform 1 from public.crm_submission_attribution where submission_id=any(sources) order by submission_id for key share;
 perform 1 from public.crm_lifecycle_producer_boundaries where id=any(boundaries) order by id for key share;
 perform 1 from public.crm_lifecycle_producer_ownership where lead_id=any(leads) and connection_id=any(connections) order by id for key share;
 if not p_evidence then return;end if;
 perform 1 from public.crm_lifecycle_eligibility_checks where submission_id=any(sources) order by id for update;
 perform 1 from public.crm_lifecycle_eligibility_evidence where submission_id=any(sources) or supersedes_evidence_id in(select id from public.crm_lifecycle_eligibility_evidence where submission_id=any(sources)) order by id for update;
 perform 1 from public.crm_lifecycle_sharing_stops where lead_id=any(leads) or crm_security.lifecycle_contact_root(contact_id)=any(contacts) or pending_submission_id=any(sources) order by id for key share;
 perform 1 from public.crm_lifecycle_sharing_stop_audit where stop_id in(select id from public.crm_lifecycle_sharing_stops where lead_id=any(leads) or crm_security.lifecycle_contact_root(contact_id)=any(contacts) or pending_submission_id=any(sources)) order by stop_id for key share;
end $$;
create function crm_security.lifecycle_lock_delivery(p_delivery uuid,p_finish boolean default false) returns void
language plpgsql set search_path=pg_catalog,pg_temp as $$
declare scopes jsonb;
begin
 perform crm_security.lifecycle_barrier(false);
 select jsonb_build_array(jsonb_build_object('lead',lead_id,'connection',connection_id)) into scopes
 from public.crm_external_deliveries where id=p_delivery;
 if scopes is null then raise exception 'Delivery missing' using errcode='40001';end if;
 perform crm_security.lifecycle_scope_keys(scopes);
 if not p_finish then perform crm_security.lifecycle_scope_rows(scopes);end if;
 -- Finish needs only ranks 3/4 and must record an actual response after stop.
 perform 1 from public.crm_external_deliveries where id=p_delivery for update;
end $$;

create function crm_security.lifecycle_contact_root(p_contact uuid) returns uuid
language plpgsql stable set search_path=pg_catalog,pg_temp as $$
declare current_id uuid:=p_contact;next_id uuid;seen uuid[]:='{}';
begin
 loop
  if current_id is null or current_id=any(seen) or cardinality(seen)>=32 then return null;end if;
  seen:=array_append(seen,current_id);
  select merged_into_contact_id into next_id from public.crm_contacts where id=current_id;
  if not found then return null;end if;
  if next_id is null then return current_id;end if;
  if not exists(select 1 from public.crm_lifecycle_identity_links where prior_contact_id=current_id and next_contact_id=next_id) then return null;end if;current_id:=next_id;
 end loop;
end $$;
create function crm_security.lifecycle_lead_root(p_lead uuid) returns uuid
language plpgsql stable set search_path=pg_catalog,pg_temp as $$
declare current_id uuid:=p_lead;next_id uuid;seen uuid[]:='{}';
begin
 loop
  if current_id is null or current_id=any(seen) or cardinality(seen)>=32 then return null;end if;
  seen:=array_append(seen,current_id);
  select merged_into_lead_id into next_id from public.crm_leads where id=current_id;
  if not found then return null;end if;
  if next_id is null then return current_id;end if;
  if not exists(select 1 from public.crm_lifecycle_identity_links where prior_lead_id=current_id and next_lead_id=next_id) then return null;end if;current_id:=next_id;
 end loop;
end $$;
create function crm_security.lifecycle_stop_hold(p_lead uuid,p_connection uuid) returns text
language plpgsql stable set search_path=pg_catalog,pg_temp as $$
declare root uuid;contact uuid;
begin
 root:=crm_security.lifecycle_lead_root(p_lead);
 select crm_security.lifecycle_contact_root(contact_id) into contact from public.crm_leads where id=p_lead;
 if root is null or contact is null then return 'identity_unverified';end if;
 if exists(select 1 from public.crm_lifecycle_sharing_stops t where
  (t.scope='opportunity' and t.connection_id=p_connection and crm_security.lifecycle_lead_root(t.lead_id)=root)
  or (t.scope='contact' and (t.connection_id is null or t.connection_id=p_connection) and crm_security.lifecycle_contact_root(t.contact_id)=contact)
  or (t.scope='submission_pending' and t.connection_id=p_connection and exists(select 1 from public.crm_submissions s
    where s.id=t.pending_submission_id and s.lead_id=p_lead))) then return 'sharing_stopped';end if;
 return null;
end $$;

create function crm_security.lifecycle_insert_stop(p_scope text,p_subject uuid,p_connection uuid,p_reason text,
 p_request uuid,p_source text,p_submission uuid default null,p_reference text default null) returns uuid
language plpgsql set search_path=pg_catalog,pg_temp as $$
declare result uuid;prior public.crm_lifecycle_sharing_stops;
begin
 if not crm_security.lifecycle_has_barrier() or (p_scope in ('contact','submission_pending') and not crm_security.lifecycle_has_barrier(true)) then
  raise exception 'Prelocked stop scope required' using errcode='42501';end if;
 if p_scope='opportunity' and not crm_security.lifecycle_has_barrier(true) and not crm_security.lifecycle_has_scope(p_subject,p_connection) then
  raise exception 'Exact prelocked opportunity required' using errcode='42501';end if;
 select t.* into prior from public.crm_lifecycle_sharing_stop_audit a join public.crm_lifecycle_sharing_stops t on t.id=a.stop_id where a.request_id=p_request;
 if found then
  if prior.scope is distinct from p_scope or coalesce(prior.lead_id,prior.contact_id,prior.pending_submission_id) is distinct from p_subject
   or prior.connection_id is distinct from p_connection or prior.reason_class is distinct from p_reason then
   raise exception 'Stop request identity conflict' using errcode='22023';end if;return prior.id;
 end if;
 insert into public.crm_lifecycle_sharing_stops(scope,lead_id,contact_id,pending_submission_id,connection_id,reason_class)
 values(p_scope,case when p_scope='opportunity' then p_subject end,case when p_scope='contact' then p_subject end,
  case when p_scope='submission_pending' then p_subject end,p_connection,p_reason) on conflict do nothing returning id into result;
 if result is null then
  select id into strict result from public.crm_lifecycle_sharing_stops where scope=p_scope
   and coalesce(lead_id,contact_id,pending_submission_id)=p_subject and connection_id is not distinct from p_connection;
  return result;
 end if;
 insert into public.crm_lifecycle_sharing_stop_audit(stop_id,request_id,actor_id,source_class,source_submission_id,decision_reference,recorded_at)
 values(result,p_request,auth.uid(),p_source,p_submission,p_reference,clock_timestamp());
 return result;
end $$;

create function public.crm_stop_lifecycle_sharing(p_request uuid,p_scope text,p_subject uuid,p_connection uuid,
 p_reason text,p_source_submission uuid default null,p_decision_reference text default null,p_pending_contact_review boolean default false) returns uuid
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare subject uuid;scopes jsonb;linked uuid;source_connection uuid;result_stop uuid;
begin
 perform crm_security.require_reader(true);
 if p_pending_contact_review is null or p_request is null or p_subject is null or (p_scope is null or p_scope not in ('opportunity','contact','submission_pending'))
  or (p_reason is null or p_reason not in ('inquiry_refusal','privacy_request','source_restriction')) then raise exception 'Controlled sharing stop required' using errcode='22023';end if;
 perform crm_security.lifecycle_barrier(p_scope<>'opportunity');
 if p_connection is not null and not exists(select 1 from public.crm_integration_connections where id=p_connection and provider='meta') then
  raise exception 'Meta destination required' using errcode='22023';end if;
 if p_scope='contact' then
  if p_decision_reference is null or p_decision_reference!~'^[A-Za-z0-9:_-]{8,100}$' then
   raise exception 'Verified scope decision reference required' using errcode='22023';end if;
  subject:=crm_security.lifecycle_contact_root(p_subject);
 elsif p_scope='opportunity' then
  subject:=crm_security.lifecycle_lead_root(p_subject);
  if p_connection is null then raise exception 'Exact destination required' using errcode='22023';end if;
  scopes:=jsonb_build_array(jsonb_build_object('lead',subject,'connection',p_connection));
  perform crm_security.lifecycle_scope_keys(scopes);perform crm_security.lifecycle_scope_rows(scopes,true,array[p_source_submission]);
 else
  if p_connection is null then raise exception 'Exact destination required' using errcode='22023';end if;
  -- The requested outbound scope may differ from a later inbound source.
  -- Resolver prelocks every pending destination plus immutable source provenance.
  perform pg_advisory_xact_lock(460048,hashtext('crm:lifecycle:r4:submission:'||p_connection::text||':'||p_subject::text));
  select s.lead_id,m.connection_id into linked,source_connection from public.crm_submissions s join public.crm_form_mappings m on m.id=s.form_mapping_id where s.id=p_subject for update of s;
  if not found then raise exception 'Durable source provenance required' using errcode='22023';end if;
  if linked is not null then
   if p_pending_contact_review then raise exception 'Resolved broad request requires verified contact scope' using errcode='22023';end if;
   subject:=crm_security.lifecycle_lead_root(linked);
   -- Exclusive G excludes all resolved paths: never acquire L/O after S.
   return crm_security.lifecycle_insert_stop('opportunity',subject,p_connection,p_reason,p_request,'director',p_subject,p_decision_reference);
  end if;
  subject:=p_subject;
 end if;
 if subject is null then raise exception 'Verified canonical identity required' using errcode='22023';end if;
 if p_source_submission is not null and not exists(select 1 from public.crm_submissions s where s.id=p_source_submission
  and ((p_scope='opportunity' and crm_security.lifecycle_lead_root(s.lead_id)=subject)
   or (p_scope='contact' and exists(select 1 from public.crm_leads l where l.id=s.lead_id and crm_security.lifecycle_contact_root(l.contact_id)=subject)))) then
  raise exception 'Objection source link differs from verified subject' using errcode='22023';end if;
 result_stop:=crm_security.lifecycle_insert_stop(p_scope,subject,p_connection,p_reason,p_request,'director',p_source_submission,p_decision_reference);
 if p_scope='submission_pending' then
  insert into public.crm_lifecycle_pending_intents(stop_id,scope_intent) values(result_stop,case when p_pending_contact_review then 'contact_review' else 'opportunity' end) on conflict do nothing;
  if (select scope_intent from public.crm_lifecycle_pending_intents where public.crm_lifecycle_pending_intents.stop_id=result_stop) is distinct from (case when p_pending_contact_review then 'contact_review' else 'opportunity' end) then raise exception 'Pending intent is immutable' using errcode='22023';end if;
 end if;
 return result_stop;
end $$;

create function crm_security.lifecycle_pending_handoff(p_submission uuid) returns void
language plpgsql set search_path=pg_catalog,pg_temp as $$
declare t record;lead uuid;final_id uuid;final_stop public.crm_lifecycle_sharing_stops;
begin
 if not crm_security.lifecycle_has_barrier(true) then raise exception 'Identity barrier required before resolution' using errcode='42501';end if;
 select crm_security.lifecycle_lead_root(lead_id) into lead from public.crm_submissions where id=p_submission;
 if lead is null then return;end if;
 for t in select * from public.crm_lifecycle_sharing_stops where pending_submission_id=p_submission order by id loop
  if exists(select 1 from public.crm_lifecycle_pending_intents where stop_id=t.id and scope_intent='contact_review') then
   select fs.* into final_stop from public.crm_lifecycle_stop_handoffs h join public.crm_lifecycle_sharing_stops fs on fs.id=h.final_stop_id where h.pending_stop_id=t.id;
   if final_stop.id is null or final_stop.scope<>'contact' or final_stop.contact_id is distinct from (select crm_security.lifecycle_contact_root(contact_id) from public.crm_leads where id=lead) then
    raise exception 'Broad request needs verified contact handoff before resolution' using errcode='22023';end if;
   continue;
  end if;
  final_id:=crm_security.lifecycle_insert_stop('opportunity',lead,t.connection_id,t.reason_class,gen_random_uuid(),'identity_handoff');
  insert into public.crm_lifecycle_stop_handoffs(pending_stop_id,final_stop_id) values(t.id,final_id) on conflict do nothing;
 end loop;
 -- Actual source choices are mandatory handoff facts, independent of optional D2.
 perform crm_security.lifecycle_materialize_submission_safety(p_submission);
end $$;

-- Typed safety mappings are explicit director-reviewed declarations; no label,
-- phone, parent-field, Meta-origin or absent-checkbox inference is permitted.
alter table public.crm_lifecycle_eligibility_policies
 add column sharing_refused_values jsonb,
 add column prohibited_field_key text check(length(btrim(prohibited_field_key)) between 1 and 100),
 add column prohibited_values jsonb,
 add column safety_decision_reference text check(safety_decision_reference ~ '^[A-Za-z0-9:_-]{8,100}$'),
 add constraint crm_policy_safety_groups check(
  (sharing_refused_values is null or (sharing_field_key is not null and crm_security.valid_lifecycle_values(sharing_refused_values)))
  and ((prohibited_field_key is null)=(prohibited_values is null))
  and (prohibited_values is null or crm_security.valid_lifecycle_values(prohibited_values))
  and ((sharing_refused_values is null and prohibited_values is null) or safety_decision_reference is not null)
  and (d2_requirement<>'advisory' or sharing_field_key is null or sharing_refused_values is not null));
create function crm_security.lifecycle_disjoint_values(a jsonb,b jsonb) returns boolean
language sql immutable set search_path=pg_catalog,pg_temp as $$
 select not exists(select 1 from jsonb_array_elements(a) av,jsonb_array_elements(b) bv where av=bv)
$$;
alter table public.crm_lifecycle_eligibility_policies add constraint crm_policy_disjoint_safety
 check(crm_security.lifecycle_disjoint_values(sharing_accepted_values,sharing_refused_values));
create function crm_security.lifecycle_safety_hold(p_submission uuid,p_policy uuid) returns text
language plpgsql stable set search_path=pg_catalog,pg_temp as $$
declare p public.crm_lifecycle_eligibility_policies;answers jsonb;
begin
 select * into p from public.crm_lifecycle_eligibility_policies where id=p_policy;
 select form_answers into answers from public.crm_submissions where id=p_submission;
 if p.id is null or answers is null then return 'source_unverified';end if;
 if exists(select 1 from jsonb_array_elements(answers) a,jsonb_array_elements(p.sharing_refused_values) v
  where a->>'key'=p.sharing_field_key and a->'value'=v) then return 'inquiry_refusal';end if;
 if exists(select 1 from jsonb_array_elements(answers) a,jsonb_array_elements(p.prohibited_values) v
  where a->>'key'=p.prohibited_field_key and a->'value'=v) then return 'source_restriction';end if;
 return null;
end $$;
-- Trusted identity resolution holds exclusive G before any source/identity rows.
-- This preidentity branch commits stops with canonical binding, without L/O or
-- owner/delivery/attempt mutation. Source-specific maps never imply broad scope.
create function crm_security.lifecycle_materialize_submission_safety(p_submission uuid) returns void
language plpgsql set search_path=pg_catalog,pg_temp as $$
declare s public.crm_submissions;subject uuid;p record;reason text;
begin
 if not crm_security.lifecycle_has_barrier(true) then
  raise exception 'Safety handoff requires outermost exclusive barrier' using errcode='42501';end if;
 select * into s from public.crm_submissions where id=p_submission;
 if s.id is null or s.match_status<>'resolved' or s.lead_id is null then
  raise exception 'Committed canonical source binding required' using errcode='22023';end if;
 subject:=crm_security.lifecycle_lead_root(s.lead_id);
 if subject is null then raise exception 'Verified canonical safety scope required' using errcode='22023';end if;
 for p in select pol.id,pol.connection_id,pol.safety_decision_reference
  from public.crm_lifecycle_eligibility_policies pol
  join public.crm_form_mappings m on m.id=pol.form_mapping_id and m.connection_id=pol.connection_id
  join public.crm_integration_connections c on c.id=pol.connection_id and c.provider='meta'
  join public.crm_submission_attribution a on a.submission_id=s.id and a.provider='meta'
   and a.page_id=c.page_id and a.form_id=m.form_key and a.redacted_at is null
  where s.channel='meta_instant_form' and pol.form_mapping_id=s.form_mapping_id
   and s.occurred_at>=pol.effective_from and s.occurred_at<pol.effective_until
   and (pol.retired_at is null or s.occurred_at<pol.retired_at)
   and pol.safety_decision_reference is not null
   and (pol.sharing_refused_values is not null or pol.prohibited_values is not null)
  order by pol.id loop
  reason:=crm_security.lifecycle_safety_hold(s.id,p.id);
  if reason in ('inquiry_refusal','source_restriction') then
   perform crm_security.lifecycle_insert_stop('opportunity',subject,p.connection_id,reason,
    gen_random_uuid(),'form_choice',s.id,p.safety_decision_reference);
  end if;
 end loop;
end $$;
create function crm_security.lifecycle_evidence_reason(p_submission uuid,p_policy uuid) returns text
language plpgsql stable set search_path=pg_catalog,pg_temp as $$
declare p public.crm_lifecycle_eligibility_policies;answers jsonb;key text;values_doc jsonb;n integer;i integer;configured integer:=0;
begin
 select * into p from public.crm_lifecycle_eligibility_policies where id=p_policy;
 select form_answers into answers from public.crm_submissions where id=p_submission;
 if p.id is null or answers is null then return 'source_mismatch';end if;
 for i in 1..3 loop
  key:=case i when 1 then p.adult_field_key when 2 then p.sharing_field_key else p.notice_field_key end;
  values_doc:=case i when 1 then p.adult_accepted_values when 2 then p.sharing_accepted_values else p.notice_accepted_values end;
  if key is null then continue;end if;configured:=configured+1;
  select count(*) into n from jsonb_array_elements(answers) a where a->>'key'=key;
  if n<>1 then return case i when 1 then case when n>1 then 'adult_ambiguous' else 'adult_missing' end
   when 2 then case when n>1 then 'sharing_ambiguous' else 'sharing_missing' end else 'notice_mismatch' end;end if;
  if not exists(select 1 from jsonb_array_elements(answers) a,jsonb_array_elements(values_doc) v where a->>'key'=key and a->'value'=v) then
   return case i when 1 then 'adult_missing' when 2 then 'sharing_missing' else 'notice_mismatch' end;end if;
 end loop;
 -- An empty optional manifest cannot mint a grant.
 if configured=0 then return 'adult_missing';end if;
 return 'eligible';
end $$;

create function crm_security.lifecycle_guard_live_insert() returns trigger
language plpgsql set search_path=pg_catalog,pg_temp as $$
declare o public.crm_lifecycle_producer_ownership;b public.crm_lifecycle_producer_boundaries;p public.crm_lifecycle_eligibility_policies;l public.crm_leads;
begin
 if new.delivery_mode<>'live' then return new;end if;
 if new.lifecycle_model<>'r4_stage_entry' then
  if new.eligibility_evidence_id is null and not (new.status in ('blocked','suppressed') and new.payload is null) then raise exception 'Required proof missing' using errcode='23514';end if;
  return new;
 end if;
 select * into o from public.crm_lifecycle_producer_ownership where id=new.producer_ownership_id;
 select * into b from public.crm_lifecycle_producer_boundaries where id=o.boundary_id;
 select * into p from public.crm_lifecycle_eligibility_policies where id=b.eligibility_policy_id;
 select * into l from public.crm_leads where id=new.lead_id;
 if o.id is null or p.id is null or o.producer<>'eh_native' or o.lead_id is distinct from new.lead_id
  or o.connection_id is distinct from new.connection_id or o.activation_epoch_id is distinct from new.activation_epoch_id
  or b.provider_contract_id is distinct from new.provider_contract_id or b.policy_version is distinct from p.version
  or b.notice_version is distinct from p.notice_version or b.notice_text_digest is distinct from p.notice_text_digest
  or new.attribution_submission_id is distinct from l.first_submission_id or new.matching_submission_id is distinct from l.first_submission_id
  or (new.eligibility_evidence_id is null and p.d2_requirement<>'advisory' and new.status not in ('blocked','suppressed'))
  or (new.eligibility_evidence_id is not null and not exists(select 1 from public.crm_lifecycle_eligibility_evidence e where e.id=new.eligibility_evidence_id
     and e.policy_id=p.id and e.connection_id=new.connection_id and e.submission_id=l.first_submission_id and e.event_type='grant')) then
  raise exception 'Frozen live references differ' using errcode='23514';end if;
 return new;
end $$;
create trigger crm_delivery_live_insert before insert on public.crm_external_deliveries for each row execute function crm_security.lifecycle_guard_live_insert();
alter table public.crm_external_deliveries drop constraint crm_delivery_live_refs;
alter table public.crm_external_deliveries add constraint crm_delivery_live_refs check(
 delivery_mode<>'live' or (provider_contract_id is not null and activation_epoch_id is not null and send_deadline is not null
  and (eligibility_evidence_id is not null or (lifecycle_model='r4_stage_entry' and producer_ownership_id is not null)))
 or (status in ('blocked','suppressed') and payload is null));

-- No general alias/identity mutation service was present in 102. Deny a raw
-- reassociation unless its outermost caller already entered exclusive G. The
-- trigger never acquires a lock; it only carries already-verified suppression.
create function crm_security.lifecycle_identity_guard() returns trigger
language plpgsql set search_path=pg_catalog,pg_temp as $$
declare t record;target uuid;final_id uuid;changed boolean;
begin
 if tg_table_name='crm_contacts' then
  changed:=tg_op='UPDATE' and new.merged_into_contact_id is distinct from old.merged_into_contact_id;
 else
  changed:=tg_op='UPDATE' and (new.contact_id is distinct from old.contact_id or new.merged_into_lead_id is distinct from old.merged_into_lead_id);
 end if;
 if not changed then return new;end if;
 if not crm_security.lifecycle_has_barrier(true) then raise exception 'Identity mutation requires outermost exclusive barrier' using errcode='42501';end if;
 if tg_table_name='crm_contacts' then
  if old.merged_into_contact_id is not null or new.merged_into_contact_id is null then raise exception 'Alias links are monotonic' using errcode='42501';end if;
  target:=crm_security.lifecycle_contact_root(new.merged_into_contact_id);
  if target is null or target=old.id then raise exception 'Unsupported alias chain' using errcode='22023';end if;
  insert into public.crm_lifecycle_identity_links(prior_contact_id,next_contact_id) values(old.id,new.merged_into_contact_id);
  for t in select * from public.crm_lifecycle_sharing_stops where scope='contact' and crm_security.lifecycle_contact_root(contact_id)=old.id order by id loop
   final_id:=crm_security.lifecycle_insert_stop('contact',target,t.connection_id,t.reason_class,gen_random_uuid(),'identity_handoff');
   insert into public.crm_lifecycle_stop_carries values(t.id,final_id) on conflict do nothing;
  end loop;
 else
  if new.contact_id is distinct from old.contact_id then
   target:=crm_security.lifecycle_contact_root(new.contact_id);
   if target is null then raise exception 'Unsupported reassociation' using errcode='22023';end if;
   for t in select * from public.crm_lifecycle_sharing_stops where scope='contact' and crm_security.lifecycle_contact_root(contact_id)=crm_security.lifecycle_contact_root(old.contact_id) order by id loop
    final_id:=crm_security.lifecycle_insert_stop('contact',target,t.connection_id,t.reason_class,gen_random_uuid(),'identity_handoff');
    insert into public.crm_lifecycle_stop_carries values(t.id,final_id) on conflict do nothing;
   end loop;
  end if;
  if new.merged_into_lead_id is distinct from old.merged_into_lead_id then
   if old.merged_into_lead_id is not null or new.merged_into_lead_id is null then raise exception 'Lead aliases are monotonic' using errcode='42501';end if;
   target:=crm_security.lifecycle_lead_root(new.merged_into_lead_id);
   if target is null or target=old.id then raise exception 'Unsupported lead alias chain' using errcode='22023';end if;
   insert into public.crm_lifecycle_identity_links(prior_lead_id,next_lead_id) values(old.id,new.merged_into_lead_id);
   for t in select * from public.crm_lifecycle_sharing_stops where scope='opportunity' and crm_security.lifecycle_lead_root(lead_id)=old.id order by id loop
    final_id:=crm_security.lifecycle_insert_stop('opportunity',target,t.connection_id,t.reason_class,gen_random_uuid(),'identity_handoff');
    insert into public.crm_lifecycle_stop_carries values(t.id,final_id) on conflict do nothing;
   end loop;
  end if;
 end if;
 return new;
end $$;
create trigger crm_contact_lifecycle_identity before update on public.crm_contacts for each row execute function crm_security.lifecycle_identity_guard();
create trigger crm_lead_lifecycle_identity before update on public.crm_leads for each row execute function crm_security.lifecycle_identity_guard();

create table public.crm_lifecycle_stop_exclusions (
 stop_id uuid primary key references public.crm_lifecycle_sharing_stops(id) on delete restrict,
 certified_at timestamptz not null default clock_timestamp(),
 exclusion_class text not null check(exclusion_class in ('non_meta_first_source','legacy_yearly_source'))
);
alter table public.crm_lifecycle_stop_exclusions enable row level security;
revoke all on public.crm_lifecycle_stop_exclusions from public,anon,authenticated,service_role;
create trigger crm_stop_exclusion_immutable before update or delete on public.crm_lifecycle_stop_exclusions for each row execute function crm_security.protect_lifecycle_append_only();
create trigger crm_stop_exclusion_no_truncate before truncate on public.crm_lifecycle_stop_exclusions for each statement execute function crm_security.reject_history_mutation();

create function crm_security.lifecycle_stop_closed_at(p_stop uuid) returns timestamptz
language plpgsql stable set search_path=pg_catalog,pg_temp as $$
declare t public.crm_lifecycle_sharing_stops;epoch_end timestamptz;final_at timestamptz;certification timestamptz;
begin
 select * into t from public.crm_lifecycle_sharing_stops where id=p_stop;
 if t.scope='contact' then return null;end if;
 if t.scope='submission_pending' then
  select committed_at into final_at from public.crm_lifecycle_stop_handoffs where pending_stop_id=t.id;
  if final_at is not null then return final_at;end if;
  -- An excluded acquisition source can still object to an eligible lead/contact.
  -- There is no immutable no-handoff retirement mechanism in this architecture.
  return null;
 end if;
 select e.ended_at into epoch_end from public.crm_lifecycle_producer_ownership o
 join public.crm_lifecycle_activation_epochs e on e.id=o.activation_epoch_id
 where o.lead_id=t.lead_id and o.connection_id=t.connection_id and o.producer='eh_native';
 select certified_at into certification from public.crm_lifecycle_stop_exclusions where stop_id=t.id;
 if epoch_end is null and certification is null then return null;end if;
 if exists(select 1 from public.crm_external_deliveries d where d.lead_id=t.lead_id and d.connection_id=t.connection_id
  and ((d.status='sending' and d.lease_until>clock_timestamp())
   or exists(select 1 from public.crm_external_delivery_attempts a where a.delivery_id=d.id and a.finished_at is null and a.diagnostics_erased_at is null)
   or (d.status not in ('sent','dead','suppressed') and d.attempt_boundary_state not in ('unknown','confirmed'))
   or (d.attempt_boundary_state='started'))) then return null;end if;
 select greatest(max(coalesce(d.terminal_at,d.attempt_boundary_at)),(select max(a.finished_at) from public.crm_external_delivery_attempts a join public.crm_external_deliveries dd on dd.id=a.delivery_id where dd.lead_id=t.lead_id and dd.connection_id=t.connection_id),max(d.lease_until)) into final_at
 from public.crm_external_deliveries d where d.lead_id=t.lead_id and d.connection_id=t.connection_id;
 return greatest(epoch_end,certification,final_at);
end $$;

create function crm_security.lifecycle_stop_audit_guard() returns trigger
language plpgsql set search_path=pg_catalog,pg_temp as $$
declare t public.crm_lifecycle_sharing_stops;due timestamptz;basis timestamptz;
begin
 if tg_op='DELETE' or not crm_security.lifecycle_has_barrier(true) then raise exception 'Protected audit retention path required' using errcode='42501';end if;
 select * into t from public.crm_lifecycle_sharing_stops where id=old.stop_id;
 if new.redacted_at is not null and old.redacted_at is null then
  due:=case when t.scope='contact' then t.effective_at else coalesce(old.closed_at,crm_security.lifecycle_stop_closed_at(t.id)) end;
  if due is null or due>clock_timestamp()-interval '90 days' or new.request_id is not null or new.actor_id is not null
   or new.source_class is not null or new.source_submission_id is not null or new.decision_reference is not null
   or new.recorded_at is not null or new.closed_at is not null or new.closure_basis is not null or new.stop_id<>old.stop_id then
   raise exception 'Audit redaction deadline/predicate not met' using errcode='42501';end if;
  new.redacted_at:=clock_timestamp();return new;
 end if;
 basis:=crm_security.lifecycle_stop_closed_at(t.id);
 if old.closed_at is null and new.closed_at is not null and basis is not null and new.closed_at=basis
  and new.closure_basis=(case when exists(select 1 from public.crm_lifecycle_stop_handoffs where pending_stop_id=t.id) then 'verified_handoff'
   when exists(select 1 from public.crm_lifecycle_stop_exclusions where stop_id=t.id) then 'permanent_source_exclusion' else 'epoch_ended' end)
  and (to_jsonb(new)-array['closed_at','closure_basis'])=(to_jsonb(old)-array['closed_at','closure_basis']) then return new;end if;
 raise exception 'Stop audit immutable outside guarded closure/redaction' using errcode='42501';
end $$;
create trigger crm_stop_audit_guard before update or delete on public.crm_lifecycle_sharing_stop_audit for each row execute function crm_security.lifecycle_stop_audit_guard();
create trigger crm_stop_audit_no_truncate before truncate on public.crm_lifecycle_sharing_stop_audit for each statement execute function crm_security.reject_history_mutation();

create function crm_security.lifecycle_cleanup_stop_audit(p_limit integer) returns integer
language plpgsql set search_path=pg_catalog,pg_temp as $$
declare r record;closed timestamptz;n integer:=0;
begin
 if not crm_security.lifecycle_has_barrier(true) then raise exception 'Maintenance barrier required' using errcode='42501';end if;
 -- Only immutable first-source exclusions can certify permanent inadmissibility.
 insert into public.crm_lifecycle_stop_exclusions(stop_id,exclusion_class)
 select t.id,case when s.channel<>'meta_instant_form' then 'non_meta_first_source' else 'legacy_yearly_source' end
 from public.crm_lifecycle_sharing_stops t left join public.crm_leads l on l.id=t.lead_id
 join public.crm_submissions s on s.id=l.first_submission_id
 left join public.crm_form_mappings m on m.id=s.form_mapping_id
 where t.scope='opportunity' and (s.channel<>'meta_instant_form' or m.form_key='1086266294126723')
  and not exists(select 1 from public.crm_lifecycle_stop_exclusions x where x.stop_id=t.id)
 order by t.id limit p_limit on conflict do nothing;
 for r in select a.*,t.scope,t.effective_at from public.crm_lifecycle_sharing_stop_audit a
 join public.crm_lifecycle_sharing_stops t on t.id=a.stop_id where a.redacted_at is null and ((t.scope='contact' and t.effective_at<=clock_timestamp()-interval '90 days')
 or (t.scope<>'contact' and (a.closed_at is null and crm_security.lifecycle_stop_closed_at(t.id) is not null
 or coalesce(a.closed_at,crm_security.lifecycle_stop_closed_at(t.id))<=clock_timestamp()-interval '90 days'))) order by a.stop_id limit p_limit for update of a loop
  closed:=coalesce(r.closed_at,crm_security.lifecycle_stop_closed_at(r.stop_id));
  if r.scope<>'contact' and r.closed_at is null and closed is not null then
   update public.crm_lifecycle_sharing_stop_audit set closed_at=closed,closure_basis=case when exists(select 1 from public.crm_lifecycle_stop_handoffs where pending_stop_id=r.stop_id) then 'verified_handoff'
    when exists(select 1 from public.crm_lifecycle_stop_exclusions where stop_id=r.stop_id) then 'permanent_source_exclusion' else 'epoch_ended' end where stop_id=r.stop_id;
  end if;
  if (case when r.scope='contact' then r.effective_at else closed end)<=clock_timestamp()-interval '90 days' then
   update public.crm_lifecycle_sharing_stop_audit set request_id=null,actor_id=null,source_class=null,source_submission_id=null,
    decision_reference=null,recorded_at=null,closed_at=null,closure_basis=null,redacted_at=clock_timestamp() where stop_id=r.stop_id;n:=n+1;
  end if;
 end loop;
 return n;
end $$;


create function crm_security.lifecycle_has_intake(p_submission uuid) returns boolean
language sql volatile set search_path=pg_catalog,pg_temp as $$
 select crm_security.lifecycle_has_barrier(true) and exists(select 1 from pg_locks where pid=pg_backend_pid()
  and locktype='advisory' and objsubid=1 and granted and mode='ExclusiveLock'
  and (classid::bigint::bit(32)||objid::bigint::bit(32))::bit(64)::bigint=hashtextextended('crm:meta:intake',0))
 and exists(select 1 from public.crm_submissions ss join public.crm_form_mappings fm on fm.id=ss.form_mapping_id
  join pg_locks lk on lk.pid=pg_backend_pid() and lk.locktype='advisory' and lk.classid=460048 and lk.objsubid=2 and lk.granted and lk.mode='ExclusiveLock'
  and lk.objid=((hashtext('crm:lifecycle:r4:submission:'||fm.connection_id::text||':'||ss.id::text)::bigint & 4294967295)::oid)
  where ss.id=p_submission)
$$;

create function crm_security.lifecycle_has_scope(p_lead uuid,p_connection uuid) returns boolean
language sql volatile set search_path=pg_catalog,pg_temp as $$
 select crm_security.lifecycle_has_barrier() and exists(select 1 from pg_locks where pid=pg_backend_pid() and locktype='advisory'
  and objsubid=1 and granted and mode='ExclusiveLock'
  and (classid::bigint::bit(32)||objid::bigint::bit(32))::bit(64)::bigint=hashtextextended('crm:lifecycle:lead:'||p_lead::text,0))
 and (p_connection is null or exists(select 1 from pg_locks where pid=pg_backend_pid() and locktype='advisory'
  and classid=460047 and objsubid=2 and granted and mode='ExclusiveLock'
  and objid=((hashtext('crm:lifecycle:r4:opportunity:'||p_connection::text||':'||p_lead::text)::bigint & 4294967295)::oid)))
$$;

create function crm_security.lifecycle_preidentity_keys(p_submission uuid,p_connection uuid) returns void
language plpgsql set search_path=pg_catalog,pg_temp as $$
declare k integer;
begin
 if not crm_security.lifecycle_has_barrier(true) then raise exception 'Outermost identity barrier required' using errcode='42501';end if;
 -- Called only before rows at the outermost boundary, including every known
 -- pending destination as well as immutable source connection provenance.
 perform pg_advisory_xact_lock(hashtextextended('crm:meta:intake',0));
 for k in select distinct hashtext('crm:lifecycle:r4:submission:'||x.connection_id::text||':'||p_submission::text)
  from (select p_connection connection_id union select connection_id from public.crm_lifecycle_sharing_stops where pending_submission_id=p_submission) x
  where x.connection_id is not null order by 1 loop perform pg_advisory_xact_lock(460048,k);end loop;
end $$;

create function crm_security.lifecycle_source_redaction_guard() returns trigger
language plpgsql set search_path=pg_catalog,pg_temp as $$
begin
 if new.redacted_at is distinct from old.redacted_at and not crm_security.lifecycle_has_barrier(true) then
  raise exception 'Outermost source-redaction barrier required' using errcode='42501';end if;
 return new;
end $$;
create trigger crm_lifecycle_source_redaction before update on public.crm_submission_attribution for each row execute function crm_security.lifecycle_source_redaction_guard();

create table public.crm_lifecycle_identity_links (
 id uuid primary key default gen_random_uuid(),
 prior_contact_id uuid references public.crm_contacts(id) on delete restrict,
 next_contact_id uuid references public.crm_contacts(id) on delete restrict,
 prior_lead_id uuid references public.crm_leads(id) on delete restrict,
 next_lead_id uuid references public.crm_leads(id) on delete restrict,
 check((prior_contact_id is not null and next_contact_id is not null and prior_lead_id is null and next_lead_id is null)
  or (prior_lead_id is not null and next_lead_id is not null and prior_contact_id is null and next_contact_id is null)),
 unique(prior_contact_id),unique(prior_lead_id)
);
alter table public.crm_lifecycle_identity_links enable row level security;
revoke all on public.crm_lifecycle_identity_links from public,anon,authenticated,service_role;
create trigger crm_identity_link_immutable before update or delete on public.crm_lifecycle_identity_links for each row execute function crm_security.protect_lifecycle_append_only();
create trigger crm_identity_link_no_truncate before truncate on public.crm_lifecycle_identity_links for each statement execute function crm_security.reject_history_mutation();

-- Unverified broad intent cannot be narrowed by automated resolution.

create function public.crm_bind_pending_lifecycle_stop(p_request uuid,p_pending_stop uuid,p_contact uuid,
 p_connection uuid,p_decision_reference text) returns uuid
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare pending public.crm_lifecycle_sharing_stops;root uuid;result uuid;
begin
 perform crm_security.require_reader(true);perform crm_security.lifecycle_barrier(true);
 select * into pending from public.crm_lifecycle_sharing_stops where id=p_pending_stop and scope='submission_pending';
 if pending.id is null or p_request is null or p_decision_reference is null or p_decision_reference!~'^[A-Za-z0-9:_-]{8,100}$' then
  raise exception 'Verified broad-request binding required' using errcode='22023';end if;
 if p_connection is not null and not exists(select 1 from public.crm_integration_connections where id=p_connection and provider='meta') then
  raise exception 'Exact Meta destination required' using errcode='22023';end if;
 perform pg_advisory_xact_lock(460048,hashtext('crm:lifecycle:r4:submission:'||pending.connection_id::text||':'||pending.pending_submission_id::text));
 root:=crm_security.lifecycle_contact_root(p_contact);
 select fs.id into result from public.crm_lifecycle_stop_handoffs h join public.crm_lifecycle_sharing_stops fs on fs.id=h.final_stop_id
 where h.pending_stop_id=pending.id and fs.scope='contact' and crm_security.lifecycle_contact_root(fs.contact_id)=root and fs.connection_id is not distinct from p_connection;
 if result is not null then return result;end if;
 if root is null or not exists(select 1 from public.crm_lifecycle_sharing_stop_audit where stop_id=pending.id and exists(select 1 from public.crm_lifecycle_pending_intents pi where pi.stop_id=pending.id and pi.scope_intent='contact_review') and redacted_at is null) then
  raise exception 'Unresolved broad-request review required' using errcode='22023';end if;
 result:=crm_security.lifecycle_insert_stop('contact',root,p_connection,'privacy_request',p_request,'director',null,p_decision_reference);
 if exists(select 1 from public.crm_lifecycle_stop_handoffs where pending_stop_id=pending.id and final_stop_id<>result) then
  raise exception 'Pending stop already bound' using errcode='22023';end if;
 insert into public.crm_lifecycle_stop_handoffs(pending_stop_id,final_stop_id) values(pending.id,result) on conflict do nothing;
 return result;
end $$;


create table public.crm_lifecycle_pending_intents (
 stop_id uuid primary key references public.crm_lifecycle_sharing_stops(id) on delete restrict,
 scope_intent text not null check(scope_intent in ('opportunity','contact_review'))
);
alter table public.crm_lifecycle_pending_intents enable row level security;
revoke all on public.crm_lifecycle_pending_intents from public,anon,authenticated,service_role;
create trigger crm_pending_intent_immutable before update or delete on public.crm_lifecycle_pending_intents for each row execute function crm_security.protect_lifecycle_append_only();
create trigger crm_pending_intent_no_truncate before truncate on public.crm_lifecycle_pending_intents for each statement execute function crm_security.reject_history_mutation();


CREATE OR REPLACE FUNCTION public.crm_publish_lifecycle_policy(p_connection uuid, p_connection_version bigint, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare c public.crm_integration_connections;m public.crm_form_mappings;p public.crm_lifecycle_eligibility_policies;next_version integer;effective timestamptz;
begin
 perform crm_security.lifecycle_barrier(true);
 perform crm_security.require_reader(true);
 select * into c from public.crm_integration_connections where id=p_connection and provider='meta' for update;
 if not found or c.version is distinct from p_connection_version then raise exception 'Refresh connection' using errcode='40001';end if;
 if jsonb_typeof(p_data) is distinct from 'object' or p_data-array['form_mapping_id','notice_version','notice_text_digest','adult_field_key','adult_accepted_values','sharing_field_key','sharing_accepted_values','notice_field_key','notice_accepted_values','effective_from','effective_until','d2_requirement','sharing_refused_values','prohibited_field_key','prohibited_values','safety_decision_reference']<>'{}'::jsonb then
  raise exception 'Invalid policy fields' using errcode='22023';end if;
 select * into m from public.crm_form_mappings where id=(p_data->>'form_mapping_id')::uuid and connection_id=c.id and channel='meta_instant_form';
 if not found or m.form_key='1086266294126723' then raise exception 'Separately compliant Meta form mapping required' using errcode='22023';end if;
 effective:=(p_data->>'effective_from')::timestamptz;
 if effective<clock_timestamp() or (p_data->>'effective_until')::timestamptz<=effective then raise exception 'Prospective policy interval required' using errcode='22023';end if;
 if p_data ? 'd2_requirement' and (jsonb_typeof(p_data->'d2_requirement') is distinct from 'string' or p_data->>'d2_requirement' not in ('required','advisory')) then
  raise exception 'Future publisher is advisory only' using errcode='22023';end if;
 if ((p_data->>'notice_version') is null)<>((p_data->>'notice_text_digest') is null)
  or ((p_data->>'adult_field_key') is null)<>((p_data->'adult_accepted_values') is null)
  or ((p_data->>'sharing_field_key') is null)<>((p_data->'sharing_accepted_values') is null)
  or ((p_data->>'notice_field_key') is null)<>((p_data->'notice_accepted_values') is null)
  or (p_data->>'d2_requirement'='advisory' and p_data->>'sharing_field_key' is not null and p_data->'sharing_refused_values' is null) then
  raise exception 'Complete optional proof and reviewed safety groups required' using errcode='22023';end if;
 if exists(select 1 from jsonb_array_elements(p_data->'sharing_accepted_values') yes_value,
  jsonb_array_elements(p_data->'sharing_refused_values') no_value where yes_value=no_value) then
  raise exception 'Accept/refuse maps must be disjoint' using errcode='22023';end if;
 select coalesce(max(version),0)+1 into next_version from public.crm_lifecycle_eligibility_policies where connection_id=c.id and form_mapping_id=m.id;
 insert into public.crm_lifecycle_eligibility_policies(connection_id,form_mapping_id,version,notice_version,notice_text_digest,adult_field_key,adult_accepted_values,
  sharing_field_key,sharing_accepted_values,notice_field_key,notice_accepted_values,effective_from,effective_until,created_by,lifecycle_model,allowed_event_kinds,d2_requirement,sharing_refused_values,prohibited_field_key,prohibited_values,safety_decision_reference)
 values(c.id,m.id,next_version,p_data->>'notice_version',p_data->>'notice_text_digest',p_data->>'adult_field_key',p_data->'adult_accepted_values',p_data->>'sharing_field_key',
  p_data->'sharing_accepted_values',p_data->>'notice_field_key',p_data->'notice_accepted_values',effective,(p_data->>'effective_until')::timestamptz,auth.uid(),
  'r4_stage_entry','["intake","not_qualified","lost","qualified","converted"]'::jsonb,coalesce(p_data->>'d2_requirement','required'),p_data->'sharing_refused_values',p_data->>'prohibited_field_key',p_data->'prohibited_values',p_data->>'safety_decision_reference') returning * into p;
 update public.crm_integration_connections set version=version+1,updated_by=auth.uid(),updated_at=now() where id=c.id;
 return to_jsonb(p)-array['adult_accepted_values','sharing_accepted_values','notice_accepted_values','sharing_refused_values','prohibited_values'];
end $function$;

CREATE OR REPLACE FUNCTION public.crm_publish_lifecycle_producer_boundary(p_connection uuid, p_mapping uuid, p_valid_from timestamp with time zone, p_valid_until timestamp with time zone, p_exclusion_valid_until timestamp with time zone, p_exclusion_reference text, p_verified_by text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare c public.crm_integration_connections;m public.crm_form_mappings;contract public.crm_lifecycle_provider_contracts;
 policy public.crm_lifecycle_eligibility_policies;cfg jsonb;result uuid;
begin
 perform crm_security.lifecycle_barrier(true);
 perform crm_security.require_meta_worker();
 select * into c from public.crm_integration_connections where id=p_connection and provider='meta' for update;
 select * into m from public.crm_form_mappings where id=p_mapping and connection_id=p_connection and channel='meta_instant_form' for share;
 cfg:=c.lifecycle_settings;
 select * into contract from public.crm_lifecycle_provider_contracts where id=(cfg->>'contract_id')::uuid and active
  and lifecycle_model='r4_stage_entry' and uncertainty_policy='no_uncertain_replay' and action_source='system_generated'
  and maximum_event_age_seconds between 1 and 604800 for share;
 select * into policy from public.crm_lifecycle_eligibility_policies where connection_id=p_connection and form_mapping_id=p_mapping
  and lifecycle_model='r4_stage_entry' and retired_at is null and effective_from<=p_valid_from and effective_until>=p_valid_until
  order by version desc limit 1 for share;
 if c.id is null or m.id is null or m.form_key='1086266294126723' or p_valid_from<clock_timestamp()
  or p_valid_until<=p_valid_from or p_exclusion_valid_until<p_valid_until
  or c.page_id!~'^[0-9]{1,32}$' or cfg->>'mode' is distinct from 'live' or coalesce((cfg->>'enabled')::boolean,false)
  or cfg->>'dataset_id'!~'^[0-9]{1,32}$' or contract.id is null or policy.id is null
  or contract.required_constants is distinct from '{"event_source":"crm","lead_event_source":"English Hills CRM"}'::jsonb
  or contract.event_map is distinct from '{"intake":"Intake","not_qualified":"Not qualified","lost":"Lost","qualified":"Qualified","converted":"Converted"}'::jsonb
  or length(btrim(coalesce(p_exclusion_reference,''))) not between 8 and 200
  or length(btrim(coalesce(p_verified_by,''))) not between 3 and 100 then
  raise exception 'Verified prospective producer boundary required' using errcode='22023';end if;
 insert into public.crm_lifecycle_producer_boundaries(connection_id,form_mapping_id,form_key,page_id,dataset_id,provider_contract_id,eligibility_policy_id,
  policy_version,notice_version,notice_text_digest,lifecycle_model,permitted_producer,valid_from,valid_until,
  legacy_exclusion_verified,legacy_exclusion_reference,legacy_exclusion_verified_at,legacy_exclusion_valid_until,verified_by)
 values(c.id,m.id,m.form_key,c.page_id,cfg->>'dataset_id',contract.id,policy.id,policy.version,policy.notice_version,policy.notice_text_digest,
  'r4_stage_entry','eh_native',p_valid_from,p_valid_until,true,btrim(p_exclusion_reference),clock_timestamp(),p_exclusion_valid_until,btrim(p_verified_by))
 returning id into result;
 return result;
end $function$;

CREATE OR REPLACE FUNCTION public.crm_activate_lifecycle_destination(p_connection uuid, p_version bigint, p_contract uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare c public.crm_integration_connections;contract public.crm_lifecycle_provider_contracts;epoch uuid;started timestamptz:=clock_timestamp();
begin
 perform crm_security.lifecycle_barrier(true);
 perform crm_security.require_meta_worker();
 select * into c from public.crm_integration_connections where id=p_connection and provider='meta' for update;
 select * into contract from public.crm_lifecycle_provider_contracts where id=p_contract and active and lifecycle_model='r4_stage_entry' and uncertainty_policy='no_uncertain_replay' for share;
 if c.id is null or c.version is distinct from p_version or contract.id is null or c.lifecycle_settings->>'mode' is distinct from 'live'
  or (c.lifecycle_settings->>'contract_id')::uuid is distinct from contract.id or coalesce((c.lifecycle_settings->>'enabled')::boolean,false)
  or exists(select 1 from public.crm_lifecycle_activation_epochs where connection_id=c.id and ended_at is null)
  or contract.action_source<>'system_generated' or contract.maximum_event_age_seconds not between 1 and 604800
  or not exists(select 1 from public.crm_lifecycle_producer_boundaries b join public.crm_lifecycle_eligibility_policies p on p.id=b.eligibility_policy_id
    where b.connection_id=c.id and b.revoked_at is null and b.legacy_exclusion_verified and b.form_key<>'1086266294126723'
      and b.page_id=c.page_id and b.dataset_id=c.lifecycle_settings->>'dataset_id' and b.provider_contract_id=contract.id
      and b.policy_version=p.version and b.notice_version is not distinct from p.notice_version and b.notice_text_digest is not distinct from p.notice_text_digest
      and b.valid_from<=started and b.valid_until>started and b.legacy_exclusion_valid_until>started and p.lifecycle_model='r4_stage_entry'
      and p.effective_from<=started and p.effective_until>started and p.retired_at is null) then
  raise exception 'Destination is not ready for prospective revision-4 activation' using errcode='22023';end if;
 insert into public.crm_lifecycle_activation_epochs(connection_id,provider_contract_id,started_at,activated_by)
 values(c.id,contract.id,started,'release_operator') returning id into epoch;
 update public.crm_integration_connections set lifecycle_settings=lifecycle_settings||jsonb_build_object('enabled',true,'live_started_at',started,'activation_epoch_id',epoch),
  version=version+1,updated_at=now() where id=c.id;
 return epoch;
end $function$;

CREATE OR REPLACE FUNCTION public.crm_configure_lifecycle(p_connection uuid, p_version bigint, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare c public.crm_integration_connections;k text;cfg jsonb;contract public.crm_lifecycle_provider_contracts;
begin
 perform crm_security.lifecycle_barrier(true);
 perform crm_security.require_reader(true);
 select * into c from public.crm_integration_connections where id=p_connection for update;
 if not found or c.version is distinct from p_version then raise exception 'Refresh connection' using errcode='40001';end if;
 if c.provider='website' then
  if jsonb_typeof(p_data) is distinct from 'object' or p_data-array['destination_id']<>'{}' then raise exception 'Invalid destination' using errcode='22023';end if;
  if not exists(select 1 from public.crm_integration_connections where id=(p_data->>'destination_id')::uuid and provider='meta') then raise exception 'Meta destination required' using errcode='22023';end if;
  update public.crm_integration_connections set lifecycle_destination_id=(p_data->>'destination_id')::uuid,version=version+1,updated_by=auth.uid(),updated_at=now() where id=c.id returning * into c;
 elsif p_data->>'mode'='mock' then
  if jsonb_typeof(p_data) is distinct from 'object' or p_data-array['enabled','mode','dataset_id','api_version','secret_ref','events','action_source','allow_later_meta','max_attempts']<>'{}'
   or coalesce(p_data->>'dataset_id','')!~'^[0-9]{1,32}$' or coalesce(p_data->>'api_version','')!~'^v[0-9]{1,3}\.0$'
   or coalesce(p_data->>'secret_ref','')!~'^CRM_META_LIFECYCLE_TOKEN_[A-Z0-9_]{1,64}$'
   or jsonb_typeof(p_data->'events') is distinct from 'object' or (p_data->'events')-array['qualified','converted']<>'{}'
   or coalesce(p_data->>'action_source','') not in ('system_generated','phone_call','physical_store','other')
   or coalesce((p_data->>'max_attempts')::integer,5) not between 1 and 8 then raise exception 'Invalid fixture mapping' using errcode='22023';end if;
  foreach k in array array['qualified','converted'] loop
   if coalesce(p_data->'events'->>k,'')!~'^[A-Za-z][A-Za-z0-9_ ]{0,63}$' or lower(p_data->'events'->>k) in ('purchase','revenue','payment') then raise exception 'Explicit lifecycle mapping required' using errcode='22023';end if;
  end loop;
  cfg:=p_data||jsonb_build_object('version',coalesce((c.lifecycle_settings->>'version')::int,0)+1,'enabled',coalesce((p_data->>'enabled')::boolean,false),
   'not_before',case when coalesce((p_data->>'enabled')::boolean,false) and not coalesce((c.lifecycle_settings->>'enabled')::boolean,false) then clock_timestamp() else coalesce((c.lifecycle_settings->>'not_before')::timestamptz,clock_timestamp()) end,
   'lifecycle_model','legacy_first_attainment');
  update public.crm_integration_connections set lifecycle_settings=cfg,version=version+1,updated_by=auth.uid(),updated_at=now() where id=c.id returning * into c;
 elsif p_data->>'mode'='live' then
  if jsonb_typeof(p_data) is distinct from 'object' or p_data-array['enabled','mode','dataset_id','secret_ref','contract_id','max_attempts']<>'{}'
   or coalesce((p_data->>'enabled')::boolean,false) or coalesce(p_data->>'dataset_id','')!~'^[0-9]{1,32}$'
   or coalesce(p_data->>'secret_ref','')!~'^CRM_META_LIFECYCLE_TOKEN_[A-Z0-9_]{1,64}$'
   or coalesce((p_data->>'max_attempts')::integer,5) not between 1 and 8 then raise exception 'Disabled verified live mapping required' using errcode='22023';end if;
  select * into contract from public.crm_lifecycle_provider_contracts where id=(p_data->>'contract_id')::uuid and active for share;
  if not found or not contract.lead_id_only or contract.lifecycle_model<>'r4_stage_entry' or contract.uncertainty_policy<>'no_uncertain_replay'
   or contract.deduplication_window_seconds is not null
   or contract.action_source<>'system_generated' or contract.maximum_event_age_seconds not between 1 and 604800
   or contract.required_constants is distinct from '{"event_source":"crm","lead_event_source":"English Hills CRM"}'::jsonb
   or contract.event_map is distinct from '{"intake":"Intake","not_qualified":"Not qualified","lost":"Lost","qualified":"Qualified","converted":"Converted"}'::jsonb then
   raise exception 'Verified revision-4 provider contract required' using errcode='22023';end if;
  cfg:=jsonb_build_object('mode','live','enabled',false,'dataset_id',p_data->>'dataset_id','secret_ref',p_data->>'secret_ref','contract_id',contract.id,
   'contract_key',contract.contract_key,'contract_revision',contract.revision,'api_version',contract.api_version,'events',contract.event_map,
   'action_source',contract.action_source,'maximum_event_age_seconds',contract.maximum_event_age_seconds,
   'accepted_response_field',contract.accepted_response_field,'accepted_response_count',contract.accepted_response_count,
   'required_constants',contract.required_constants,'lifecycle_model',contract.lifecycle_model,'uncertainty_policy',contract.uncertainty_policy,
   'max_attempts',coalesce((p_data->>'max_attempts')::integer,5),'version',coalesce((c.lifecycle_settings->>'version')::int,0)+1);
  update public.crm_integration_connections set lifecycle_settings=cfg,version=version+1,updated_by=auth.uid(),updated_at=now() where id=c.id returning * into c;
 else raise exception 'Invalid lifecycle mode' using errcode='22023';end if;
 return jsonb_build_object('id',c.id,'version',c.version,'lifecycle',c.lifecycle_settings-'secret_ref','destination_id',c.lifecycle_destination_id,
  'live_available',exists(select 1 from public.crm_lifecycle_provider_contracts where active and lifecycle_model='r4_stage_entry'));
end $function$;

CREATE OR REPLACE FUNCTION public.crm_disable_lifecycle(p_connection uuid, p_version bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare c public.crm_integration_connections;
begin
 perform crm_security.lifecycle_barrier(true);
 perform crm_security.require_reader(true);
 select * into c from public.crm_integration_connections where id=p_connection and provider='meta' for update;
 if not found or c.version is distinct from p_version then raise exception 'Refresh connection' using errcode='40001';end if;
 update public.crm_lifecycle_activation_epochs set ended_at=clock_timestamp(),ended_by=auth.uid(),end_reason='director_disabled'
  where connection_id=c.id and ended_at is null;
 update public.crm_integration_connections set lifecycle_settings=lifecycle_settings||jsonb_build_object('enabled',false),version=version+1,updated_by=auth.uid(),updated_at=now() where id=c.id;
end $function$;

CREATE OR REPLACE FUNCTION public.crm_retire_lifecycle_policy(p_policy uuid, p_version integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare policy public.crm_lifecycle_eligibility_policies;
begin
 perform crm_security.lifecycle_barrier(true);
  perform crm_security.require_reader(true);
  select * into policy from public.crm_lifecycle_eligibility_policies where id=p_policy for update;
  if not found or policy.retired_at is not null then raise exception 'Active policy required' using errcode = '22023'; end if;
  if policy.version is distinct from p_version then raise exception 'Refresh policy version' using errcode = '40001'; end if;
  update public.crm_lifecycle_eligibility_policies
     set retired_at=greatest(clock_timestamp(),effective_from+interval '1 microsecond'),retired_by=auth.uid()
   where id=policy.id;
end $function$;

CREATE OR REPLACE FUNCTION crm_security.lifecycle_producer_eligible(p_lead uuid, p_connection uuid, p_boundary uuid, p_epoch uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare l public.crm_leads;s public.crm_submissions;a public.crm_submission_attribution;m public.crm_form_mappings;c public.crm_integration_connections;b public.crm_lifecycle_producer_boundaries;
 e public.crm_lifecycle_activation_epochs;p public.crm_lifecycle_eligibility_policies;g public.crm_lifecycle_eligibility_evidence;o public.crm_lifecycle_producer_ownership;
begin
 if not crm_security.lifecycle_has_scope(p_lead,p_connection) then raise exception 'Prelocked admission required' using errcode='42501';end if;
 perform crm_security.require_meta_worker();
 select * into l from public.crm_leads where id=p_lead;
 select * into s from public.crm_submissions where id=l.first_submission_id;
 select * into a from public.crm_submission_attribution where submission_id=s.id;
 select * into m from public.crm_form_mappings where id=s.form_mapping_id;
 select * into c from public.crm_integration_connections where id=p_connection and provider='meta';
 select * into b from public.crm_lifecycle_producer_boundaries where id=p_boundary and connection_id=p_connection;
 select * into e from public.crm_lifecycle_activation_epochs where id=p_epoch and connection_id=p_connection and ended_at is null;
 select * into p from public.crm_lifecycle_eligibility_policies where connection_id=p_connection and form_mapping_id=m.id and lifecycle_model='r4_stage_entry'
  and s.occurred_at>=effective_from and s.occurred_at<effective_until and (retired_at is null or s.occurred_at<retired_at);
 select * into g from public.crm_lifecycle_eligibility_evidence g0 where g0.submission_id=s.id and g0.connection_id=p_connection and g0.policy_id=p.id and g0.event_type='grant'
  and g0.redacted_at is null and not exists(select 1 from public.crm_lifecycle_eligibility_evidence r where r.supersedes_evidence_id=g0.id);
 if l.id is null or s.id is null or a.submission_id is null or m.id is null or c.id is null or b.id is null or e.id is null or p.id is null or (p.d2_requirement='required' and g.id is null)
  or l.merged_into_lead_id is not null or s.channel<>'meta_instant_form' or s.match_status<>'resolved' or s.lead_id is distinct from l.id or a.provider<>'meta' or a.redacted_at is not null
  or a.external_submission_id!~'^[0-9]{1,32}$' or a.page_id is distinct from c.page_id
  or a.form_id is distinct from b.form_key or m.id is distinct from b.form_mapping_id or m.form_key is distinct from b.form_key or b.form_key='1086266294126723'
  or b.page_id is distinct from c.page_id or b.dataset_id is distinct from c.lifecycle_settings->>'dataset_id'
  or b.provider_contract_id is distinct from e.provider_contract_id or b.provider_contract_id is distinct from (c.lifecycle_settings->>'contract_id')::uuid
  or b.eligibility_policy_id is distinct from p.id or b.policy_version is distinct from p.version
  or b.notice_version is distinct from p.notice_version or b.notice_text_digest is distinct from p.notice_text_digest
  or b.revoked_at is not null or not b.legacy_exclusion_verified or clock_timestamp()>=b.legacy_exclusion_valid_until
  or s.occurred_at<greatest(b.valid_from,e.started_at,p.effective_from,m.effective_from)
  or s.occurred_at>=least(b.valid_until,p.effective_until,coalesce(m.retired_at,b.valid_until)) then
  raise exception 'Producer ownership admission held' using errcode='22023';end if;
 if crm_security.lifecycle_stop_hold(p_lead,p_connection) is not null or crm_security.lifecycle_safety_hold(s.id,p.id) is not null then
  raise exception 'Sharing stopped or safety unverified' using errcode='22023';end if;
 select * into o from public.crm_lifecycle_producer_ownership where lead_id=l.id and connection_id=p_connection;
 if found then
  if o.producer<>'eh_native' or o.boundary_id is distinct from b.id or o.activation_epoch_id is distinct from e.id then
   raise exception 'Immutable producer ownership conflict' using errcode='42501';end if;
  return o.id;
 end if;
 insert into public.crm_lifecycle_producer_ownership(lead_id,connection_id,boundary_id,activation_epoch_id,producer)
 values(l.id,p_connection,b.id,e.id,'eh_native') returning id into o.id;
 return o.id;
end $function$;

CREATE OR REPLACE FUNCTION crm_security.lifecycle_route(p_lead uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare l public.crm_leads;s public.crm_submissions;a public.crm_submission_attribution;m public.crm_form_mappings;c public.crm_integration_connections;source public.crm_integration_connections;
 cfg jsonb;grant_row public.crm_lifecycle_eligibility_evidence;policy public.crm_lifecycle_eligibility_policies;epoch public.crm_lifecycle_activation_epochs;
 contract public.crm_lifecycle_provider_contracts;boundary public.crm_lifecycle_producer_boundaries;ownership public.crm_lifecycle_producer_ownership;
begin
 select * into strict l from public.crm_leads where id=p_lead;
 select * into s from public.crm_submissions where id=l.first_submission_id;
 select * into m from public.crm_form_mappings where id=s.form_mapping_id;
 select * into source from public.crm_integration_connections where id=m.connection_id;
 if s.channel='meta_instant_form' and source.provider='meta' then c:=source;
 elsif s.channel='website' and source.provider='website' then select * into c from public.crm_integration_connections where id=source.lifecycle_destination_id and provider='meta';
 else return jsonb_build_object('reason','no_destination');end if;
 if c.id is null then return jsonb_build_object('reason','no_destination');end if;
 cfg:=c.lifecycle_settings;
 if cfg->>'mode'='live' then
  if s.channel<>'meta_instant_form' or source.id is distinct from c.id then return jsonb_build_object('connection_id',c.id,'reason','scope_excluded');end if;
  select * into a from public.crm_submission_attribution where submission_id=s.id;
  select * into epoch from public.crm_lifecycle_activation_epochs where id=(cfg->>'activation_epoch_id')::uuid and connection_id=c.id and ended_at is null;
  select * into contract from public.crm_lifecycle_provider_contracts where id=(cfg->>'contract_id')::uuid and active and lifecycle_model='r4_stage_entry';
  select * into ownership from public.crm_lifecycle_producer_ownership o where o.lead_id=l.id and o.connection_id=c.id;
  if ownership.id is not null then
   select * into boundary from public.crm_lifecycle_producer_boundaries where id=ownership.boundary_id;
   select * into policy from public.crm_lifecycle_eligibility_policies where id=boundary.eligibility_policy_id;
   select * into epoch from public.crm_lifecycle_activation_epochs where id=ownership.activation_epoch_id;
   select * into contract from public.crm_lifecycle_provider_contracts where id=boundary.provider_contract_id;
  else
  select * into policy from public.crm_lifecycle_eligibility_policies p where p.connection_id=c.id and p.form_mapping_id=m.id and p.lifecycle_model='r4_stage_entry'
   and s.occurred_at>=p.effective_from and s.occurred_at<p.effective_until and (p.retired_at is null or s.occurred_at<p.retired_at) order by p.version desc limit 1;
  select * into boundary from public.crm_lifecycle_producer_boundaries b where b.connection_id=c.id and b.form_mapping_id=m.id
   and b.form_key=m.form_key and b.page_id=c.page_id and b.dataset_id=cfg->>'dataset_id' and b.provider_contract_id=contract.id
   and b.eligibility_policy_id=policy.id and b.policy_version=policy.version and b.notice_version is not distinct from policy.notice_version
   and b.notice_text_digest is not distinct from policy.notice_text_digest and b.lifecycle_model='r4_stage_entry' and b.permitted_producer='eh_native'
   and s.occurred_at>=b.valid_from and s.occurred_at<b.valid_until order by b.valid_from desc limit 1;
  end if;
  select e.* into grant_row from public.crm_lifecycle_eligibility_evidence e where e.submission_id=s.id and e.connection_id=c.id and e.policy_id=policy.id
   and e.event_type='grant' and e.redacted_at is null and not exists(select 1 from public.crm_lifecycle_eligibility_evidence r where r.supersedes_evidence_id=e.id and r.event_type='revoke') limit 1;
  select * into ownership from public.crm_lifecycle_producer_ownership o where o.lead_id=l.id and o.connection_id=c.id;
  return jsonb_build_object('connection_id',c.id,'submission_id',s.id,'source_generated_at',s.occurred_at,'mapping',cfg,'epoch_id',epoch.id,'epoch_started_at',epoch.started_at,
   'contract_id',contract.id,'evidence_id',grant_row.id,'evidence_effective_at',grant_row.effective_at,'policy_id',policy.id,'boundary_id',boundary.id,'ownership_id',ownership.id,
   'reason',case when l.merged_into_lead_id is not null then 'scope_excluded'
    when a.redacted_at is not null then 'identity_redacted'
    when a.submission_id is null or s.match_status<>'resolved' or s.lead_id is distinct from l.id or a.provider<>'meta' or a.external_submission_id!~'^[0-9]{1,32}$' or a.page_id is distinct from c.page_id or a.form_id is distinct from m.form_key then 'no_matching_identity'
    when m.form_key='1086266294126723' then 'scope_excluded'
    when epoch.id is null then 'outbound_disabled'
    when epoch.ended_at is not null or (cfg->>'activation_epoch_id')::uuid is distinct from epoch.id then 'activation_ended'
    when contract.id is null or not contract.active then 'provider_contract_unverified'
    when policy.id is null then 'policy_missing'
    when policy.d2_requirement='required' and grant_row.id is null then 'sharing_evidence_missing'
    when crm_security.lifecycle_stop_hold(l.id,c.id) is not null then crm_security.lifecycle_stop_hold(l.id,c.id)
    when crm_security.lifecycle_safety_hold(s.id,policy.id) is not null then crm_security.lifecycle_safety_hold(s.id,policy.id)
    when boundary.id is null or boundary.page_id is distinct from c.page_id or boundary.dataset_id is distinct from cfg->>'dataset_id' or boundary.provider_contract_id is distinct from contract.id then 'producer_boundary_missing'
    when boundary.revoked_at is not null or not boundary.legacy_exclusion_verified or clock_timestamp()<boundary.valid_from
      or clock_timestamp()>=least(boundary.valid_until,boundary.legacy_exclusion_valid_until) then 'producer_boundary_invalid'
    when s.occurred_at<greatest(boundary.valid_from,epoch.started_at,policy.effective_from,m.effective_from)
      or s.occurred_at>=least(boundary.valid_until,policy.effective_until,coalesce(m.retired_at,boundary.valid_until)) then 'historical_event'
    when ownership.id is null then 'producer_ownership_unknown'
    when ownership.producer<>'eh_native' then 'legacy_owned'
    when ownership.boundary_id is distinct from boundary.id or ownership.activation_epoch_id is distinct from epoch.id then 'producer_ownership_mismatch'
    else null end);
 end if;
 if s.channel='website' and coalesce((cfg->>'allow_later_meta')::boolean,false) then
  select s0.* into s from public.crm_submissions s0 join public.crm_form_mappings m0 on m0.id=s0.form_mapping_id
   where s0.lead_id=l.id and s0.match_status='resolved' and s0.channel='meta_instant_form' and m0.connection_id=c.id order by s0.occurred_at,s0.received_at,s0.id limit 1;
  if not found then select * into s from public.crm_submissions where id=l.first_submission_id;end if;
 end if;
 select * into a from public.crm_submission_attribution where submission_id=s.id;
 return jsonb_build_object('connection_id',c.id,'submission_id',s.id,'source_generated_at',s.occurred_at,'mapping',cfg,'reason',case when a.redacted_at is not null then 'identity_redacted'
  when a.provider='meta' and (a.external_submission_id is null or a.page_id is distinct from c.page_id) then 'no_matching_identity'
  when a.provider='website' and nullif(a.fbc,'') is null and nullif(a.fbp,'') is null then 'no_matching_identity'
  when a.provider not in ('meta','website') or a.provider is null then 'no_matching_identity'
  when a.consent_evidence->'meta_lifecycle_sharing' is distinct from 'true'::jsonb or a.consent_evidence->'adult_contact' is distinct from 'true'::jsonb then 'sharing_evidence_missing' else null end);
end $function$;

CREATE OR REPLACE FUNCTION crm_security.lifecycle_hold(d crm_external_deliveries)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare c public.crm_integration_connections;a public.crm_submission_attribution;e public.crm_lifecycle_eligibility_evidence;epoch public.crm_lifecycle_activation_epochs;
 o public.crm_lifecycle_producer_ownership;b public.crm_lifecycle_producer_boundaries;p public.crm_lifecycle_eligibility_policies;r jsonb;ordering text;
begin
 if d.lifecycle_model='r4_stage_entry' and d.last_error_code='contradictory_chronology' then return 'contradictory_chronology';end if;
 if d.payload_erased_at is not null then return 'payload_erased';end if;
 if d.lifecycle_model='r4_stage_entry' and d.attempt_boundary_state in ('unknown','confirmed') then return 'replay_forbidden';end if;
 select * into c from public.crm_integration_connections where id=d.connection_id;
 if not coalesce((c.lifecycle_settings->>'enabled')::boolean,false) then return 'outbound_disabled';end if;
 if d.event_kind='converted' and exists(select 1 from public.crm_leads where id=d.lead_id and conversion_review_required) then return 'conversion_review_required';end if;
 if d.delivery_mode='live' then
  if d.lifecycle_model<>'r4_stage_entry' or c.lifecycle_settings->>'mode' is distinct from 'live'
   or c.lifecycle_settings->>'lifecycle_model' is distinct from 'r4_stage_entry' or c.lifecycle_settings->>'uncertainty_policy' is distinct from 'no_uncertain_replay'
   or (c.lifecycle_settings->>'activation_epoch_id')::uuid is distinct from d.activation_epoch_id
   or (c.lifecycle_settings->>'contract_id')::uuid is distinct from d.provider_contract_id then return 'activation_ended';end if;
  select * into epoch from public.crm_lifecycle_activation_epochs where id=d.activation_epoch_id;
  if epoch.id is null or epoch.ended_at is not null or d.event_time<epoch.started_at then return 'activation_ended';end if;
  if d.send_deadline is null or d.send_deadline<=clock_timestamp()+interval '8 seconds' then return 'provider_age_expired';end if;
  select * into o from public.crm_lifecycle_producer_ownership where id=d.producer_ownership_id and lead_id=d.lead_id and connection_id=d.connection_id;
  if o.id is null then return 'producer_ownership_unknown';elsif o.producer<>'eh_native' then return 'legacy_owned';end if;
  select * into b from public.crm_lifecycle_producer_boundaries where id=o.boundary_id and connection_id=d.connection_id;
  if b.id is null or b.revoked_at is not null or not b.legacy_exclusion_verified or clock_timestamp()<b.valid_from
   or clock_timestamp()>=least(b.valid_until,b.legacy_exclusion_valid_until) then return 'producer_boundary_invalid';end if;
  select * into e from public.crm_lifecycle_eligibility_evidence where id=d.eligibility_evidence_id and event_type='grant';
  select * into p from public.crm_lifecycle_eligibility_policies where id=b.eligibility_policy_id and lifecycle_model='r4_stage_entry';
  if p.id is null or not (p.allowed_event_kinds ? d.event_kind) then return 'policy_missing';end if;
  if p.d2_requirement='required' and (e.id is null or e.redacted_at is not null or e.effective_at>d.event_time
    or exists(select 1 from public.crm_lifecycle_eligibility_evidence rv where rv.supersedes_evidence_id=e.id and rv.event_type='revoke')) then return 'sharing_revoked';end if;
  if crm_security.lifecycle_stop_hold(d.lead_id,d.connection_id) is not null then return crm_security.lifecycle_stop_hold(d.lead_id,d.connection_id);end if;
  if p.d2_requirement not in ('required','advisory') then return 'policy_missing';end if;
  if d.eligibility_evidence_id is not null and (e.id is null or e.policy_id is distinct from p.id or e.connection_id is distinct from d.connection_id) then return 'producer_boundary_invalid';end if;
  if b.page_id is distinct from c.page_id or b.dataset_id is distinct from c.lifecycle_settings->>'dataset_id'
   or b.provider_contract_id is distinct from d.provider_contract_id or b.provider_contract_id is distinct from epoch.provider_contract_id
   or b.eligibility_policy_id is distinct from p.id or b.policy_version is distinct from p.version
   or b.notice_version is distinct from p.notice_version or b.notice_text_digest is distinct from p.notice_text_digest then return 'producer_boundary_invalid';end if;
  select * into a from public.crm_submission_attribution where submission_id=(select first_submission_id from public.crm_leads where id=d.lead_id);
  if a.submission_id is null or a.redacted_at is not null then return 'identity_redacted';end if;
  if crm_security.lifecycle_safety_hold(a.submission_id,p.id) is not null then return crm_security.lifecycle_safety_hold(a.submission_id,p.id);end if;
  if d.attribution_submission_id is distinct from a.submission_id or d.matching_submission_id is distinct from a.submission_id then return 'no_matching_identity';end if;
  if d.mapping_snapshot->>'mode' is distinct from 'live' or d.mapping_snapshot->>'action_source' is distinct from 'system_generated'
   or coalesce((d.mapping_snapshot->>'maximum_event_age_seconds')::integer,0) not between 1 and 604800
   or d.mapping_snapshot->'required_constants' is distinct from '{"event_source":"crm","lead_event_source":"English Hills CRM"}'::jsonb
   or d.mapping_snapshot->'events' is distinct from '{"intake":"Intake","not_qualified":"Not qualified","lost":"Lost","qualified":"Qualified","converted":"Converted"}'::jsonb then return 'configuration_missing';end if;
  r:=crm_security.lifecycle_route(d.lead_id);
  if (r->>'reason') is not null or (r->>'ownership_id')::uuid is distinct from d.producer_ownership_id
   or (r->>'boundary_id')::uuid is distinct from o.boundary_id or (r->>'epoch_id')::uuid is distinct from d.activation_epoch_id
   or (r->>'contract_id')::uuid is distinct from d.provider_contract_id then return coalesce(r->>'reason','producer_ownership_mismatch');end if;
  ordering:=crm_security.lifecycle_predecessor_hold(d);if ordering is not null then return ordering;end if;
 else
  if c.lifecycle_settings->>'mode' is distinct from 'mock' then return 'live_not_available';end if;
  if not coalesce((d.mapping_snapshot->>'enabled')::boolean,false) then return 'outbound_disabled';end if;
  select * into a from public.crm_submission_attribution where submission_id=d.matching_submission_id;
  if a.submission_id is null or a.redacted_at is not null then return 'identity_redacted';end if;
  if a.consent_evidence->'meta_lifecycle_sharing' is distinct from 'true'::jsonb or a.consent_evidence->'adult_contact' is distinct from 'true'::jsonb then return 'sharing_evidence_missing';end if;
  if d.mapping_snapshot->>'mode' is distinct from 'mock' then return 'configuration_missing';end if;
 end if;
 return null;
end $function$;

CREATE OR REPLACE FUNCTION public.crm_get_external_delivery(p_delivery uuid, p_lease uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare d public.crm_external_deliveries;s public.crm_submissions;a public.crm_submission_attribution;e public.crm_lifecycle_eligibility_evidence;reason text;lead_id text;
begin
 perform crm_security.lifecycle_lock_delivery(p_delivery,false);
 perform crm_security.require_meta_worker();select * into d from public.crm_external_deliveries where id=p_delivery and status='sending' and lease_token=p_lease and lease_until>now();
 if not found then raise exception 'Stale lease' using errcode='40001';end if;reason:=crm_security.lifecycle_hold(d);if reason is not null then raise exception 'Delivery held' using errcode='42501';end if;
 if d.delivery_mode='live' then select * into a from public.crm_submission_attribution where submission_id=(select first_submission_id from public.crm_leads where id=d.lead_id);lead_id:=a.external_submission_id;
 else select * into s from public.crm_submissions where id=d.matching_submission_id;select * into a from public.crm_submission_attribution where submission_id=s.id;end if;
 select * into s from public.crm_submissions where id=d.attribution_submission_id;
 return jsonb_build_object('id',d.id,'event_kind',d.event_kind,'event_time',floor(extract(epoch from d.event_time))::bigint,
  'source_generated_time',floor(extract(epoch from s.occurred_at))::bigint,'event_id',d.provider_event_id,'mode',d.delivery_mode,
  'mapping',d.mapping_snapshot,'payload',d.payload,'matching',case when d.payload is not null then null when d.delivery_mode='live' then jsonb_build_object('lead_id',lead_id)
  else jsonb_strip_nulls(jsonb_build_object('lead_id',case when a.provider='meta' then a.external_submission_id end,'fbc',case when a.provider='website' then a.fbc end,
   'fbp',case when a.provider='website' then a.fbp end,'email',s.core_fields->>'email','phone',crm_security.normalize_phone(s.core_fields->>'phone'),'adult_contact',true)) end);
end $function$;

CREATE OR REPLACE FUNCTION public.crm_prepare_external_delivery(p_delivery uuid, p_lease uuid, p_payload jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare d public.crm_external_deliveries;e jsonb;u jsonb;item record;hash text;a public.crm_submission_attribution;source public.crm_submissions;phone text;email text;evidence public.crm_lifecycle_eligibility_evidence;
begin
 perform crm_security.lifecycle_lock_delivery(p_delivery,false);
 perform crm_security.require_meta_worker();select * into d from public.crm_external_deliveries where id=p_delivery for update;
 if not found or d.status<>'sending' or d.lease_token is distinct from p_lease or d.lease_until<=now() or d.payload_erased_at is not null then raise exception 'Stale lease' using errcode='40001';end if;
 if crm_security.lifecycle_hold(d) is not null then raise exception 'Delivery held' using errcode='42501';end if;
 if jsonb_typeof(p_payload) is distinct from 'object' or p_payload-array['data']<>'{}' or jsonb_typeof(p_payload->'data') is distinct from 'array' or jsonb_array_length(p_payload->'data')<>1 or octet_length(p_payload::text)>8192 then raise exception 'Invalid payload' using errcode='22023';end if;
 e:=p_payload->'data'->0;u:=e->'user_data';
 if e->>'event_id' is distinct from d.provider_event_id or e->>'event_name' is distinct from d.mapping_snapshot->'events'->>d.event_kind
  or (e->>'event_time')::bigint is distinct from floor(extract(epoch from d.event_time))::bigint or e->>'action_source' is distinct from d.mapping_snapshot->>'action_source'
  or jsonb_typeof(u) is distinct from 'object' or u='{}' then raise exception 'Invalid event identity' using errcode='22023';end if;
 if d.delivery_mode='live' then
  if e-array['event_name','event_time','event_id','action_source','user_data','custom_data']<>'{}'
   or e->'custom_data' is distinct from '{"event_source":"crm","lead_event_source":"English Hills CRM"}'::jsonb then raise exception 'Closed CRM payload required' using errcode='22023';end if;
  select * into a from public.crm_submission_attribution where submission_id=(select first_submission_id from public.crm_leads where id=d.lead_id);
  if u-array['lead_id']<>'{}' or jsonb_typeof(u->'lead_id')<>'string' or u->>'lead_id' is distinct from a.external_submission_id
   or u->>'lead_id'!~'^[0-9]{1,32}$' then raise exception 'Lossless lead ID only contract required' using errcode='22023';end if;
 else
  if e-array['event_name','event_time','event_id','action_source','user_data']<>'{}' or u-array['lead_id','em','ph','fbc','fbp']<>'{}' then raise exception 'Invalid fixture payload' using errcode='22023';end if;
  for item in select * from jsonb_each(u) loop
   if item.key in ('em','ph') then if jsonb_typeof(item.value) is distinct from 'array' or jsonb_array_length(item.value)<>1 or coalesce(item.value->>0,'')!~'^[a-f0-9]{64}$' then raise exception 'Hash required' using errcode='22023';end if;
   elsif jsonb_typeof(item.value) is distinct from 'string' or length(item.value#>>'{}') not between 1 and 256 then raise exception 'Invalid match field' using errcode='22023';end if;
  end loop;
  select * into source from public.crm_submissions where id=d.matching_submission_id;select * into a from public.crm_submission_attribution where submission_id=source.id;
  phone:=crm_security.normalize_phone(source.core_fields->>'phone');email:=nullif(lower(btrim(source.core_fields->>'email')),'');
  if (u?'lead_id' and (a.provider<>'meta' or u->>'lead_id' is distinct from a.external_submission_id)) or (u?'fbc' and (a.provider<>'website' or u->>'fbc' is distinct from a.fbc))
   or (u?'fbp' and (a.provider<>'website' or u->>'fbp' is distinct from a.fbp)) or not (u ?| array['lead_id','fbc','fbp'])
   or (u?'em' and u->'em'->>0 is distinct from encode(sha256(convert_to(email,'UTF8')),'hex'))
   or (u?'ph' and u->'ph'->>0 is distinct from encode(sha256(convert_to(substr(phone,2),'UTF8')),'hex')) then raise exception 'Matching identity differs from protected evidence' using errcode='22023';end if;
 end if;
 hash:=encode(sha256(convert_to(p_payload::text,'UTF8')),'hex');
 if d.payload is not null then if d.payload_hash<>hash then raise exception 'Frozen payload conflict' using errcode='40001';end if;return hash;end if;
 update public.crm_external_deliveries set payload=p_payload,payload_hash=hash,provider_event_name=e->>'event_name',updated_at=now() where id=d.id;return hash;
end $function$;

CREATE OR REPLACE FUNCTION public.crm_begin_external_attempt(p_delivery uuid, p_lease uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare d public.crm_external_deliveries;n integer;ordering text;boundary_at timestamptz:=clock_timestamp();
begin
 perform crm_security.lifecycle_lock_delivery(p_delivery,false);
 perform crm_security.require_meta_worker();
 select * into d from public.crm_external_deliveries where id=p_delivery;
 if not found then raise exception 'Stale/unprepared delivery' using errcode='40001';end if;

 select * into d from public.crm_external_deliveries where id=p_delivery for update;
 if d.status<>'sending' or d.lease_token is distinct from p_lease or d.lease_until<=now() or d.payload is null or d.payload_erased_at is not null
  or (d.lifecycle_model='r4_stage_entry' and d.attempt_boundary_state<>'not_started') then raise exception 'Stale/unprepared delivery' using errcode='40001';end if;
 if d.delivery_mode='live' then
  perform 1 from public.crm_lifecycle_producer_ownership where id=d.producer_ownership_id;
  perform 1 from public.crm_lifecycle_eligibility_evidence where id=d.eligibility_evidence_id;
 end if;
 if crm_security.lifecycle_hold(d) is not null then raise exception 'Delivery held' using errcode='42501';end if;
 ordering:=crm_security.lifecycle_predecessor_hold(d);if ordering is not null then raise exception 'Chronological attempt held' using errcode='42501';end if;
 if exists(select 1 from public.crm_external_delivery_attempts where delivery_id=d.id and lease_token=p_lease) then raise exception 'Attempt already begun' using errcode='40001';end if;
 n:=d.attempt_count+1;if n>d.max_attempts then raise exception 'Attempts exhausted' using errcode='40001';end if;
 insert into public.crm_external_delivery_attempts(delivery_id,attempt_number,lease_token) values(d.id,n,p_lease);
 update public.crm_external_deliveries set attempt_count=n,
  attempt_boundary_state=case when lifecycle_model='r4_stage_entry' then 'started' else attempt_boundary_state end,
  attempt_boundary_at=case when lifecycle_model='r4_stage_entry' then boundary_at else attempt_boundary_at end,updated_at=now() where id=d.id;
 return n;
end $function$;

CREATE OR REPLACE FUNCTION public.crm_finish_external_attempt(p_delivery uuid, p_lease uuid, p_result jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare d public.crm_external_deliveries;state text;code text;delay integer;retry_at timestamptz;boundary_state text;
begin
 perform crm_security.lifecycle_lock_delivery(p_delivery,true);
 perform crm_security.require_meta_worker();select * into d from public.crm_external_deliveries where id=p_delivery for update;
 if not found or d.status<>'sending' or d.lease_token is distinct from p_lease or d.lease_until<=now()
  or (d.lifecycle_model='r4_stage_entry' and d.attempt_boundary_state<>'started') then raise exception 'Stale lease' using errcode='40001';end if;
 state:=p_result->>'outcome';code:=p_result->>'error_code';
 if jsonb_typeof(p_result) is distinct from 'object' or p_result-array['outcome','error_code','http_status','request_id','retry_after']<>'{}'
  or state is null or state not in ('sent','retry','blocked','dead','unknown')
  or (code is not null and code not in ('rate_limit','provider_unavailable','provider_auth','validation','timeout','network','malformed_response'))
  or (state='sent' and (coalesce((p_result->>'http_status')::int,0) not between 200 and 299 or code is not null))
  or (p_result->>'request_id' is not null and p_result->>'request_id'!~'^[A-Za-z0-9_-]{1,100}$') then raise exception 'Invalid attempt result' using errcode='22023';end if;
 if d.lifecycle_model='r4_stage_entry' then
  -- A provider response that may have been accepted can never be reduced to a
  -- replayable or confirmed failure. Normalize contradictory/uncertain result
  -- envelopes at the durable boundary even if a caller bypasses the adapter.
  if state='sent' then boundary_state:='confirmed';
  elsif state='blocked' and code='provider_auth' and (p_result->>'http_status')::int in (400,401,403) then boundary_state:='confirmed';
  elsif state='dead' and code='validation' and (p_result->>'http_status')::int=400 then boundary_state:='confirmed';
  else
   code:=case
    when coalesce((p_result->>'http_status')::int,0) between 200 and 299 then 'malformed_response'
    when (p_result->>'http_status')::int=429 then 'rate_limit'
    when (p_result->>'http_status')::int>=500 then 'provider_unavailable'
    when code in ('rate_limit','provider_unavailable','timeout','network','malformed_response') then code
    else 'malformed_response' end;
   state:='unknown';boundary_state:='unknown';
  end if;
  retry_at:=null;
 else
  boundary_state:=d.attempt_boundary_state;
  delay:=least(86400,greatest(30,coalesce((p_result->>'retry_after')::int,0),least(21600,30*power(2,d.attempt_count)::int)+(random()*30)::int));
  retry_at:=case when state in ('retry','unknown') then now()+make_interval(secs=>delay) end;
  if state in ('retry','unknown') and d.attempt_count>=d.max_attempts then state:='dead';code:='attempts_exhausted';retry_at:=null;end if;
 end if;
 update public.crm_external_delivery_attempts set outcome=state,finished_at=clock_timestamp(),http_status=(p_result->>'http_status')::int,
  provider_request_id=p_result->>'request_id',response_summary=case when state='sent' then '{"accepted":true}'::jsonb else null end,error_code=code
  where delivery_id=d.id and lease_token=p_lease and finished_at is null;
 if not found then raise exception 'Attempt missing' using errcode='40001';end if;
 update public.crm_external_deliveries set status=state,attempt_boundary_state=boundary_state,lease_token=null,lease_until=null,updated_at=now(),last_error_code=code,
  next_attempt_at=retry_at,sent_at=case when state='sent' then now() else sent_at end,
  terminal_at=case when state in ('sent','dead') then coalesce(terminal_at,clock_timestamp()) else terminal_at end where id=d.id;
end $function$;

CREATE OR REPLACE FUNCTION public.crm_retry_external_delivery(p_delivery uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare d public.crm_external_deliveries;cfg jsonb;hold text;
begin
 perform crm_security.lifecycle_lock_delivery(p_delivery,false);
 perform crm_security.require_reader(true);select * into d from public.crm_external_deliveries where id=p_delivery for update;
 if not found then raise exception 'Delivery not eligible for retry' using errcode='22023';end if;
 hold:=crm_security.lifecycle_retry_hold(d);if hold is not null then raise exception 'Delivery still held: %',hold using errcode='22023';end if;
 if d.payload is null then select lifecycle_settings into cfg from public.crm_integration_connections where id=d.connection_id;
  d.mapping_snapshot:=cfg;d.mapping_version:=coalesce((cfg->>'version')::int,0);d.max_attempts:=coalesce((cfg->>'max_attempts')::int,5);
 end if;
 insert into public.crm_lifecycle_retry_audit(delivery_id,requested_by,reason_code,prior_status) values(d.id,auth.uid(),'configuration_repaired',d.status);
 update public.crm_external_deliveries set status='pending',next_attempt_at=now(),last_error_code=null,updated_at=now(),mapping_snapshot=d.mapping_snapshot,mapping_version=d.mapping_version,max_attempts=d.max_attempts where id=d.id;
end $function$;

CREATE OR REPLACE FUNCTION public.crm_block_external_delivery(p_delivery uuid, p_lease uuid, p_code text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$ begin
 perform crm_security.lifecycle_lock_delivery(p_delivery,false);
 perform crm_security.require_meta_worker();
 if p_code is null or p_code not in ('missing_secret','configuration_missing','delivery_held','live_not_available','invalid_identity') then raise exception 'Invalid hold' using errcode='22023';end if;
 update public.crm_external_deliveries set status='blocked',lease_token=null,lease_until=null,last_error_code=p_code,updated_at=now()
 where id=p_delivery and status='sending' and lease_token=p_lease and lease_until>now()
 and not exists(select 1 from public.crm_external_delivery_attempts where delivery_id=p_delivery and lease_token=p_lease);
 if not found then raise exception 'Stale/started lease' using errcode='40001';end if;
end $function$;

CREATE OR REPLACE FUNCTION crm_security.repair_lifecycle_evidence(p_delivery uuid, p_evidence uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare d public.crm_external_deliveries;e public.crm_lifecycle_eligibility_evidence;r jsonb;
begin
 perform crm_security.lifecycle_lock_delivery(p_delivery,false);
 if exists(select 1 from public.crm_external_deliveries dd join public.crm_lifecycle_producer_ownership oo on oo.id=dd.producer_ownership_id
  join public.crm_lifecycle_producer_boundaries bb on bb.id=oo.boundary_id join public.crm_lifecycle_eligibility_policies pp on pp.id=bb.eligibility_policy_id
  where dd.id=p_delivery and pp.d2_requirement='advisory') then return false;end if;
 select * into d from public.crm_external_deliveries where id=p_delivery for update;
 if d.id is null or d.delivery_mode<>'live' or d.status<>'blocked' or d.last_error_code<>'sharing_evidence_missing'
  or d.eligibility_evidence_id is not null or d.attempt_count<>0 or d.payload is not null or d.payload_hash is not null or d.provider_event_name is not null
  or d.lease_token is not null or d.lease_until is not null or d.sent_at is not null or d.terminal_at is not null or d.payload_erased_at is not null
  or exists(select 1 from public.crm_external_delivery_attempts a where a.delivery_id=d.id) then return false;end if;
 select * into e from public.crm_lifecycle_eligibility_evidence where id=p_evidence and event_type='grant';
 if e.id is null or e.redacted_at is not null or e.submission_id is distinct from d.matching_submission_id or e.connection_id is distinct from d.connection_id
  or e.effective_at>d.event_time or exists(select 1 from public.crm_lifecycle_eligibility_evidence rv where rv.supersedes_evidence_id=e.id and rv.event_type='revoke') then return false;end if;
 r:=crm_security.lifecycle_route(d.lead_id);
 if (r->>'reason') is not null or (r->>'submission_id')::uuid is distinct from d.matching_submission_id
  or (r->>'connection_id')::uuid is distinct from d.connection_id or (r->>'epoch_id')::uuid is distinct from d.activation_epoch_id
  or (r->>'contract_id')::uuid is distinct from d.provider_contract_id or (r->>'evidence_id')::uuid is distinct from e.id
  or (r->>'epoch_started_at')::timestamptz>d.event_time or (r->>'evidence_effective_at')::timestamptz>d.event_time
  or d.send_deadline is null or d.send_deadline<=clock_timestamp() then return false;end if;
 update public.crm_external_deliveries set eligibility_evidence_id=e.id,status='pending',next_attempt_at=now(),last_error_code=null,updated_at=now() where id=d.id;
 return found;
end $function$;

CREATE OR REPLACE FUNCTION public.crm_reconcile_external_deliveries(p_limit integer DEFAULT 100)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare candidate record;admit record;r jsonb;cfg jsonb;reason text;state text;n integer:=0;l public.crm_leads;deadline timestamptz;kind text;
 new_delivery public.crm_external_deliveries;ordering text;scopes jsonb;admission_set jsonb;candidate_set jsonb;safety_fact text;
begin
 if auth.role() is distinct from 'service_role' then perform crm_security.require_reader(true);end if;
 if p_limit is null or p_limit not between 1 and 200 then raise exception 'Invalid limit' using errcode='22023';end if;
 perform crm_security.lifecycle_barrier(false);
 perform pg_advisory_xact_lock(460049,0);

 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into admission_set from (
select lead_source.id lead_id,b.connection_id,b.id boundary_id,e.id epoch_id
   from public.crm_leads lead_source join public.crm_submissions s on s.id=lead_source.first_submission_id
   join public.crm_submission_attribution a on a.submission_id=s.id and a.provider='meta' and a.redacted_at is null
   join public.crm_form_mappings m on m.id=s.form_mapping_id
   join public.crm_lifecycle_producer_boundaries b on b.form_mapping_id=m.id and b.connection_id=m.connection_id and b.form_key=m.form_key
   join public.crm_integration_connections c on c.id=b.connection_id and c.provider='meta' and c.page_id=b.page_id
    and c.lifecycle_settings->>'mode'='live' and coalesce((c.lifecycle_settings->>'enabled')::boolean,false)
    and c.lifecycle_settings->>'dataset_id'=b.dataset_id and (c.lifecycle_settings->>'contract_id')::uuid=b.provider_contract_id
   join public.crm_lifecycle_activation_epochs e on e.connection_id=b.connection_id and e.provider_contract_id=b.provider_contract_id and e.ended_at is null
   join public.crm_lifecycle_eligibility_policies p on p.id=b.eligibility_policy_id and p.connection_id=b.connection_id and p.form_mapping_id=m.id
    and p.lifecycle_model='r4_stage_entry' and p.version=b.policy_version and p.notice_version is not distinct from b.notice_version and p.notice_text_digest is not distinct from b.notice_text_digest
    and s.occurred_at>=p.effective_from and s.occurred_at<p.effective_until and (p.retired_at is null or s.occurred_at<p.retired_at)
   left join public.crm_lifecycle_eligibility_evidence g on g.submission_id=s.id and g.connection_id=b.connection_id and g.policy_id=p.id
    and g.event_type='grant' and g.redacted_at is null
   where s.channel='meta_instant_form' and s.match_status='resolved' and s.occurred_at>=greatest(b.valid_from,e.started_at,m.effective_from)
    and s.occurred_at<b.valid_until and b.revoked_at is null and b.legacy_exclusion_valid_until>clock_timestamp()
    and a.page_id=(select page_id from public.crm_integration_connections where id=b.connection_id) and a.form_id=b.form_key
    and (p.d2_requirement='advisory' or (g.id is not null and not exists(select 1 from public.crm_lifecycle_eligibility_evidence rv where rv.supersedes_evidence_id=g.id and rv.event_type='revoke')))
    and not exists(select 1 from public.crm_lifecycle_producer_ownership o where o.lead_id=lead_source.id and o.connection_id=b.connection_id)
   order by s.occurred_at,s.id limit p_limit
 ) x;
 select coalesce(jsonb_agg(jsonb_build_object('lead',x.lead_id,'connection',x.connection_id)),'[]') into scopes from (
  select (a->>'lead_id')::uuid lead_id,(a->>'connection_id')::uuid connection_id from jsonb_array_elements(admission_set) a
  union select pending_scope.lead_id,pending_scope.connection_id from (
   select ac.lead_id,coalesce(oo.connection_id,(legacy.projection->>'connection_id')::uuid) connection_id,min(ac.occurred_at) first_event
   from public.crm_activities ac join public.crm_leads sl on sl.id=ac.lead_id
   left join public.crm_submissions ss on ss.id=sl.first_submission_id
   left join public.crm_form_mappings fm on fm.id=ss.form_mapping_id
   left join public.crm_integration_connections cc on cc.id=fm.connection_id
   left join public.crm_lifecycle_producer_ownership oo on oo.lead_id=sl.id and oo.producer='eh_native'
   left join lateral(select crm_security.lifecycle_route(sl.id) projection) legacy on oo.id is null
   where ac.event_type in ('lead_created','lead_not_qualified','lead_lost','lead_qualified','lead_converted')
    and (oo.id is not null or legacy.projection->'mapping'->>'mode' is distinct from 'live')
    and not exists(select 1 from public.crm_external_deliveries dd where dd.activity_id=ac.id)
   group by ac.lead_id,coalesce(oo.connection_id,(legacy.projection->>'connection_id')::uuid)
   order by first_event,ac.lead_id,connection_id limit p_limit
  ) pending_scope
 ) x;
 -- Complete set before any row lock; candidate processing remains chronological.
 perform crm_security.lifecycle_scope_keys(scopes);
 perform crm_security.lifecycle_scope_rows(scopes,false);
 -- Admit only a separately compliant prospective first-submission cohort. No
 -- row is created for historical/current-Yearly, website or later-Meta leads.
 if auth.role()='service_role' then
  for admit in select * from jsonb_to_recordset(admission_set) x(lead_id uuid,connection_id uuid,boundary_id uuid,epoch_id uuid) loop
   begin perform crm_security.lifecycle_producer_eligible(admit.lead_id,admit.connection_id,admit.boundary_id,admit.epoch_id);n:=n+1;
   exception when sqlstate '22023' then null;end;
  end loop;
 end if;
 perform crm_security.lifecycle_scope_rows(scopes,true);
 for admit in select (x->>'lead_id')::uuid lead_id,(x->>'connection_id')::uuid connection_id,(x->>'boundary_id')::uuid boundary_id
  from jsonb_array_elements(admission_set) x loop
  select crm_security.lifecycle_safety_hold(safety_lead.first_submission_id,b.eligibility_policy_id) into safety_fact
   from public.crm_leads safety_lead join public.crm_lifecycle_producer_boundaries b on b.id=admit.boundary_id where safety_lead.id=admit.lead_id;
  if safety_fact in ('inquiry_refusal','source_restriction') then
   perform crm_security.lifecycle_insert_stop('opportunity',admit.lead_id,admit.connection_id,safety_fact,gen_random_uuid(),'form_choice',
    (select first_submission_id from public.crm_leads where id=admit.lead_id),
    (select p.safety_decision_reference from public.crm_lifecycle_producer_boundaries b join public.crm_lifecycle_eligibility_policies p on p.id=b.eligibility_policy_id where b.id=admit.boundary_id));
  end if;
 end loop;
 if n>=p_limit then return n;end if;

 for candidate in select c.* from crm_security.lifecycle_event_candidates() c
  where exists(select 1 from jsonb_array_elements(scopes) sc where (sc->>'lead')::uuid=c.lead_id)
   and not exists(select 1 from public.crm_external_deliveries d where d.activity_id=c.activity_id and d.lifecycle_model='r4_stage_entry')
  order by c.event_time,c.activity_created_at,c.activity_id limit (p_limit-n) loop
  select * into l from public.crm_leads where id=candidate.lead_id;
  r:=crm_security.lifecycle_route(candidate.lead_id);cfg:=coalesce(r->'mapping','{}');reason:=r->>'reason';state:='pending';kind:=candidate.event_kind;
  if kind='converted' and (candidate.activity_id is distinct from l.conversion_activity_id
    or (select enrollment_id from public.crm_activities where id=candidate.activity_id) is distinct from l.enrollment_id
    or not exists(select 1 from public.enrollments e where e.id=l.enrollment_id and e.student_id=l.student_id and e.status in ('Confirmed','Validated'))) then
   reason:='invalid_conversion_evidence';
  end if;
  if kind='converted' and l.conversion_review_required then reason:='conversion_review_required';end if;
  if candidate.event_time<(r->>'source_generated_at')::timestamptz then reason:='contradictory_chronology';end if;
  deadline:=candidate.event_time+make_interval(secs=>(cfg->>'maximum_event_age_seconds')::integer);
  if reason in ('no_destination','no_matching_identity','identity_redacted','invalid_conversion_evidence','scope_excluded','historical_event','legacy_owned','producer_ownership_mismatch','contradictory_chronology') then state:='suppressed';
  elsif reason is not null then state:='blocked';
  elsif not coalesce((cfg->>'enabled')::boolean,false) then state:='blocked';reason:='outbound_disabled';
  elsif deadline<=clock_timestamp()+interval '8 seconds' then state:='suppressed';reason:='provider_age_expired';
  elsif exists(select 1 from public.crm_external_deliveries later join public.crm_activities la on la.id=later.activity_id
    where later.lead_id=candidate.lead_id and later.lifecycle_model='r4_stage_entry' and later.attempt_boundary_state<>'not_started'
      and row(later.event_time,la.created_at,later.activity_id)>row(candidate.event_time,candidate.activity_created_at,candidate.activity_id)) then
   state:='suppressed';reason:='contradictory_chronology';end if;
  new_delivery:=null;
  insert into public.crm_external_deliveries(activity_id,lead_id,connection_id,event_kind,event_time,provider_event_id,mapping_version,mapping_snapshot,
   attribution_submission_id,matching_submission_id,status,next_attempt_at,last_error_code,max_attempts,delivery_mode,provider_contract_id,activation_epoch_id,
   eligibility_evidence_id,send_deadline,terminal_at,lifecycle_model,producer_ownership_id)
  values(candidate.activity_id,candidate.lead_id,(r->>'connection_id')::uuid,kind,candidate.event_time,
   'eh:r4:'||candidate.activity_id||':'||(r->>'connection_id'),coalesce((cfg->>'version')::int,0),cfg,l.first_submission_id,(r->>'submission_id')::uuid,
   state,case when state in ('pending','blocked') then now() end,reason,coalesce((cfg->>'max_attempts')::int,5),'live',(r->>'contract_id')::uuid,
   (r->>'epoch_id')::uuid,(r->>'evidence_id')::uuid,deadline,case when state='suppressed' then clock_timestamp() end,'r4_stage_entry',(r->>'ownership_id')::uuid)
  on conflict do nothing returning * into new_delivery;
  if new_delivery.id is not null then
   n:=n+1;ordering:=crm_security.lifecycle_predecessor_hold(new_delivery);
   if ordering='contradictory_chronology' and new_delivery.status not in ('sent','dead','suppressed') then
    update public.crm_external_deliveries set status='suppressed',next_attempt_at=null,last_error_code=ordering,terminal_at=clock_timestamp(),updated_at=now()
    where id=new_delivery.id;
   end if;
  end if;
 end loop;

 -- Preserve the historical mock/fixture first-attainment path unchanged.
 if n<p_limit then
  for candidate in select distinct on (x.lead_id,x.event_type) x.id activity_id,x.lead_id,
    case x.event_type when 'lead_qualified' then 'qualified' else 'converted' end event_kind,x.occurred_at event_time,x.created_at activity_created_at
   from public.crm_activities x where exists(select 1 from jsonb_array_elements(scopes) sc where (sc->>'lead')::uuid=x.lead_id) and x.event_type in ('lead_qualified','lead_converted')
    and not exists(select 1 from public.crm_lifecycle_producer_ownership o where o.lead_id=x.lead_id and o.producer='eh_native')
    and not exists(select 1 from public.crm_external_deliveries d where d.lead_id=x.lead_id and d.event_kind=case x.event_type when 'lead_qualified' then 'qualified' else 'converted' end and d.lifecycle_model='legacy_first_attainment')
   order by x.lead_id,x.event_type,x.occurred_at,x.created_at,x.id limit (p_limit-n) loop
   select * into l from public.crm_leads where id=candidate.lead_id;r:=crm_security.lifecycle_route(l.id);cfg:=coalesce(r->'mapping','{}');reason:=r->>'reason';state:='pending';
   if cfg->>'mode' is distinct from 'mock' and reason is distinct from 'no_destination' then continue;end if;
   if candidate.event_kind='converted' and candidate.activity_id is distinct from l.conversion_activity_id then reason:='invalid_conversion_evidence';
   elsif candidate.event_kind='converted' and l.conversion_review_required then reason:='conversion_review_required';end if;
   if reason in ('no_destination','no_matching_identity','identity_redacted','invalid_conversion_evidence','scope_excluded') then state:='suppressed';
   elsif reason is not null then state:='blocked';
   elsif not coalesce((cfg->>'enabled')::boolean,false) then state:='blocked';reason:='outbound_disabled';
   elsif candidate.event_time<(cfg->>'not_before')::timestamptz then state:='suppressed';reason:='historical_event';end if;
   insert into public.crm_external_deliveries(activity_id,lead_id,connection_id,event_kind,event_time,provider_event_id,mapping_version,mapping_snapshot,attribution_submission_id,matching_submission_id,
    status,next_attempt_at,last_error_code,max_attempts,delivery_mode,lifecycle_model,terminal_at)
   values(candidate.activity_id,l.id,(r->>'connection_id')::uuid,candidate.event_kind,candidate.event_time,'eh:'||candidate.activity_id||':'||coalesce(r->>'connection_id','none'),
    coalesce((cfg->>'version')::int,0),cfg,l.first_submission_id,(r->>'submission_id')::uuid,state,now(),reason,coalesce((cfg->>'max_attempts')::int,5),'mock','legacy_first_attainment',
    case when state='suppressed' then clock_timestamp() end) on conflict do nothing;if found then n:=n+1;end if;
  end loop;
 end if;
 return n;
end $function$;

CREATE OR REPLACE FUNCTION crm_security.claim_lifecycle_deliveries(p_limit integer, p_live boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare candidate record;d public.crm_external_deliveries;reason text;ids uuid[]:=array[]::uuid[];terminal_reason boolean;attempt_started boolean;candidates jsonb;scopes jsonb;locked_ids uuid[];
begin
 perform crm_security.lifecycle_barrier(false);
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into candidates from (
select id,lead_id,connection_id from public.crm_external_deliveries where (delivery_mode='live')=p_live and payload_erased_at is null
  and (((status in ('pending','retry') or (status='blocked' and lifecycle_model='r4_stage_entry'
      and last_error_code in ('unattempted_predecessor','active_predecessor'))
      or (status='unknown' and lifecycle_model='legacy_first_attainment')) and next_attempt_at<=now())
    or (status='sending' and lease_until<=now()))
  order by event_time,created_at,id limit least(100,greatest(20,p_limit*20))
 ) x;
 select coalesce(jsonb_agg(jsonb_build_object('lead',x->>'lead_id','connection',x->>'connection_id')),'[]') into scopes from jsonb_array_elements(candidates) x;
 scopes:=crm_security.lifecycle_scope_keys(scopes,true);
 perform crm_security.lifecycle_scope_rows(scopes);
 -- Materialize and lock all admitted deliveries at rank3 before attempt rank4.
 select array_agg(id) into locked_ids from (
  select locked_delivery.id from public.crm_external_deliveries locked_delivery where locked_delivery.id in(select (x->>'id')::uuid from jsonb_array_elements(candidates) x)
   and exists(select 1 from jsonb_array_elements(scopes) x where (x->>'lead')::uuid=locked_delivery.lead_id and (x->>'connection')::uuid is not distinct from locked_delivery.connection_id)
  order by locked_delivery.id for update skip locked
 ) locked;
 perform 1 from public.crm_external_delivery_attempts where delivery_id=any(coalesce(locked_ids,'{}')) order by delivery_id,attempt_number,id for update;
 for candidate in select * from jsonb_to_recordset(candidates) x(id uuid,lead_id uuid,connection_id uuid) where id=any(locked_ids)
 loop
  -- Begin takes the same lead advisory lock before the delivery/ownership rows.
  -- A competing same-lead worker is skipped instead of creating an inverted
  -- row-lock/advisory-lock wait cycle.

  select * into d from public.crm_external_deliveries where id=candidate.id and (delivery_mode='live')=p_live and payload_erased_at is null
   and (((status in ('pending','retry') or (status='blocked' and lifecycle_model='r4_stage_entry'
       and last_error_code in ('unattempted_predecessor','active_predecessor'))
       or (status='unknown' and lifecycle_model='legacy_first_attainment')) and next_attempt_at<=now())
     or (status='sending' and lease_until<=now())) for update skip locked;
  if not found then continue;end if;
  if d.status='sending' then
   select exists(select 1 from public.crm_external_delivery_attempts x where x.delivery_id=d.id and x.lease_token=d.lease_token) into attempt_started;
   if not attempt_started then
    update public.crm_external_deliveries set status='pending',lease_token=null,lease_until=null,next_attempt_at=now(),last_error_code=null,updated_at=now() where id=d.id;
    d.status:='pending';d.lease_token:=null;d.lease_until:=null;
   elsif d.lifecycle_model='r4_stage_entry' then
    update public.crm_external_delivery_attempts set outcome='unknown',finished_at=clock_timestamp(),error_code='lease_expired'
     where delivery_id=d.id and lease_token=d.lease_token and finished_at is null;
    update public.crm_external_deliveries set status='unknown',attempt_boundary_state='unknown',lease_token=null,lease_until=null,next_attempt_at=null,
     last_error_code='lease_expired_after_dispatch',updated_at=now() where id=d.id;
    continue;
   elsif d.delivery_mode='mock' then
    update public.crm_external_delivery_attempts set outcome='unknown',finished_at=clock_timestamp(),error_code='lease_expired'
     where delivery_id=d.id and lease_token=d.lease_token and finished_at is null;
   else
    update public.crm_external_delivery_attempts set outcome='unknown',finished_at=clock_timestamp(),error_code='lease_expired'
     where delivery_id=d.id and lease_token=d.lease_token and finished_at is null;
    update public.crm_external_deliveries set status='unknown',lease_token=null,lease_until=null,next_attempt_at=now()+interval '30 seconds',last_error_code='lease_expired',updated_at=now() where id=d.id;
    continue;
   end if;
  end if;
  reason:=crm_security.lifecycle_hold(d);terminal_reason:=reason in ('activation_ended','provider_age_expired','identity_redacted','scope_excluded','historical_event','payload_erased','sharing_revoked','sharing_stopped','inquiry_refusal','source_restriction','legacy_owned','producer_ownership_mismatch','contradictory_chronology');
  if d.attempt_count>=d.max_attempts then
   update public.crm_external_deliveries set status='dead',terminal_at=coalesce(terminal_at,clock_timestamp()),lease_token=null,lease_until=null,next_attempt_at=null,last_error_code='attempts_exhausted',updated_at=now() where id=d.id;
  elsif terminal_reason then
   update public.crm_external_deliveries set status='suppressed',terminal_at=coalesce(terminal_at,clock_timestamp()),lease_token=null,lease_until=null,next_attempt_at=null,last_error_code=reason,updated_at=now() where id=d.id;
  elsif reason is not null then
   update public.crm_external_deliveries set status='blocked',lease_token=null,lease_until=null,last_error_code=reason,updated_at=now() where id=d.id;
  else
   update public.crm_external_deliveries set status='sending',lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes',updated_at=now() where id=d.id;
   ids:=array_append(ids,d.id);if cardinality(ids)>=p_limit then exit;end if;
  end if;
 end loop;
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'lease_token',lease_token) order by event_time,created_at,id) from public.crm_external_deliveries where id=any(ids)),'[]');
end $function$;

CREATE OR REPLACE FUNCTION public.crm_claim_lifecycle_evidence(p_limit integer DEFAULT 25)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare result jsonb;scopes jsonb;
begin
 perform crm_security.lifecycle_barrier(false);
  perform crm_security.require_meta_worker();
  if p_limit is null or p_limit not between 1 and 100 then raise exception 'Invalid evidence batch' using errcode = '22023'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'd2_requirement',x.d2_requirement,'submission_id',x.submission_id,'policy_id',x.policy_id,'occurred_at',x.occurred_at,
    'adult_field_key',x.adult_field_key,'adult_accepted_values',x.adult_accepted_values,
    'sharing_field_key',x.sharing_field_key,'sharing_accepted_values',x.sharing_accepted_values,
    'notice_field_key',x.notice_field_key,'notice_accepted_values',x.notice_accepted_values,
    'notice_version',x.notice_version,'answers',x.answers
  ) order by x.occurred_at,x.submission_id),'[]'::jsonb) into result
  from (
    select p.d2_requirement,s.id submission_id,p.id policy_id,s.occurred_at,p.adult_field_key,p.adult_accepted_values,
      p.sharing_field_key,p.sharing_accepted_values,p.notice_field_key,p.notice_accepted_values,p.notice_version,
      coalesce((select jsonb_agg(answer order by answer->>'key') from jsonb_array_elements(s.form_answers) answer
        where answer->>'key' in (p.adult_field_key,p.sharing_field_key,coalesce(p.notice_field_key,''),p.prohibited_field_key)),'[]'::jsonb) answers
    from public.crm_submissions s
    join public.crm_submission_attribution a on a.submission_id = s.id
    join public.crm_form_mappings m on m.id = s.form_mapping_id
    join public.crm_lifecycle_eligibility_policies p on p.form_mapping_id = m.id and p.connection_id = m.connection_id
      and s.occurred_at >= p.effective_from and s.occurred_at < p.effective_until
      and (p.retired_at is null or s.occurred_at < p.retired_at)
    where p.d2_requirement='required' and (p.adult_field_key is not null or p.sharing_field_key is not null or p.notice_field_key is not null or p.prohibited_field_key is not null) and s.channel = 'meta_instant_form' and s.match_status = 'resolved' and a.provider = 'meta' and a.redacted_at is null
      and a.page_id = (select c.page_id from public.crm_integration_connections c where c.id = p.connection_id)
      and a.form_id = m.form_key and a.external_submission_id ~ '^[0-9]{1,32}$'
      and not exists(select 1 from public.crm_lifecycle_eligibility_checks e where e.policy_id=p.id
        and e.source_marker=encode(sha256(convert_to('crm:lifecycle:eligibility:'||s.id||':'||p.id,'UTF8')),'hex'))
    order by s.occurred_at,s.id limit p_limit
  ) x;
  select coalesce(jsonb_agg(jsonb_build_object('lead',crm_security.lifecycle_lead_root(s.lead_id),'connection',p.connection_id)),'[]') into scopes
  from jsonb_array_elements(result) x join public.crm_submissions s on s.id=(x->>'submission_id')::uuid
  join public.crm_lifecycle_eligibility_policies p on p.id=(x->>'policy_id')::uuid;
  perform crm_security.lifecycle_scope_keys(scopes);perform crm_security.lifecycle_scope_rows(scopes,true,array(select (x->>'submission_id')::uuid from jsonb_array_elements(result) x));
  return result;
end $function$;

CREATE OR REPLACE FUNCTION public.crm_claim_lifecycle_evidence(p_limit integer,p_requirement text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare result jsonb;scopes jsonb;
begin
 if p_requirement not in ('required','advisory') or p_requirement is null then raise exception 'Invalid evidence mode' using errcode='22023';end if;
 perform crm_security.lifecycle_barrier(false);
  perform crm_security.require_meta_worker();
  if p_limit is null or p_limit not between 1 and 100 then raise exception 'Invalid evidence batch' using errcode = '22023'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'd2_requirement',x.d2_requirement,'submission_id',x.submission_id,'policy_id',x.policy_id,'occurred_at',x.occurred_at,
    'adult_field_key',x.adult_field_key,'adult_accepted_values',x.adult_accepted_values,
    'sharing_field_key',x.sharing_field_key,'sharing_accepted_values',x.sharing_accepted_values,
    'notice_field_key',x.notice_field_key,'notice_accepted_values',x.notice_accepted_values,
    'notice_version',x.notice_version,'answers',x.answers
  ) order by x.occurred_at,x.submission_id),'[]'::jsonb) into result
  from (
    select p.d2_requirement,s.id submission_id,p.id policy_id,s.occurred_at,p.adult_field_key,p.adult_accepted_values,
      p.sharing_field_key,p.sharing_accepted_values,p.notice_field_key,p.notice_accepted_values,p.notice_version,
      coalesce((select jsonb_agg(answer order by answer->>'key') from jsonb_array_elements(s.form_answers) answer
        where answer->>'key' in (p.adult_field_key,p.sharing_field_key,coalesce(p.notice_field_key,''),p.prohibited_field_key)),'[]'::jsonb) answers
    from public.crm_submissions s
    join public.crm_submission_attribution a on a.submission_id = s.id
    join public.crm_form_mappings m on m.id = s.form_mapping_id
    join public.crm_lifecycle_eligibility_policies p on p.form_mapping_id = m.id and p.connection_id = m.connection_id
      and s.occurred_at >= p.effective_from and s.occurred_at < p.effective_until
      and (p.retired_at is null or s.occurred_at < p.retired_at)
    where p.d2_requirement=p_requirement and (p.adult_field_key is not null or p.sharing_field_key is not null or p.notice_field_key is not null or p.prohibited_field_key is not null) and s.channel = 'meta_instant_form' and s.match_status = 'resolved' and a.provider = 'meta' and a.redacted_at is null
      and a.page_id = (select c.page_id from public.crm_integration_connections c where c.id = p.connection_id)
      and a.form_id = m.form_key and a.external_submission_id ~ '^[0-9]{1,32}$'
      and not exists(select 1 from public.crm_lifecycle_eligibility_checks e where e.policy_id=p.id
        and e.source_marker=encode(sha256(convert_to('crm:lifecycle:eligibility:'||s.id||':'||p.id,'UTF8')),'hex'))
    order by s.occurred_at,s.id limit p_limit
  ) x;
  select coalesce(jsonb_agg(jsonb_build_object('lead',crm_security.lifecycle_lead_root(s.lead_id),'connection',p.connection_id)),'[]') into scopes
  from jsonb_array_elements(result) x join public.crm_submissions s on s.id=(x->>'submission_id')::uuid
  join public.crm_lifecycle_eligibility_policies p on p.id=(x->>'policy_id')::uuid;
  perform crm_security.lifecycle_scope_keys(scopes);perform crm_security.lifecycle_scope_rows(scopes,true,array(select (x->>'submission_id')::uuid from jsonb_array_elements(result) x));
  return result;
end $function$;

CREATE OR REPLACE FUNCTION public.crm_record_lifecycle_evidence_check(p_submission uuid, p_policy uuid, p_eligible boolean, p_reason text, p_digest text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare s public.crm_submissions;a public.crm_submission_attribution;p public.crm_lifecycle_eligibility_policies;m public.crm_form_mappings;check_id uuid;evidence_id uuid;projection jsonb;marker text;check_redacted timestamptz;scopes jsonb;safety text;subject uuid;
begin
 perform crm_security.lifecycle_barrier(false);
 select jsonb_build_array(jsonb_build_object('lead',crm_security.lifecycle_lead_root(src.lead_id),'connection',pol.connection_id)) into scopes
 from public.crm_submissions src cross join public.crm_lifecycle_eligibility_policies pol where src.id=p_submission and pol.id=p_policy and src.lead_id is not null;
 if scopes is null then raise exception 'Committed resolved evidence scope required' using errcode='22023';end if;
 perform crm_security.lifecycle_scope_keys(scopes);perform crm_security.lifecycle_scope_rows(scopes,true,array[p_submission]);

  perform crm_security.require_meta_worker();
  if p_reason not in ('eligible','adult_missing','adult_ambiguous','sharing_missing','sharing_ambiguous','notice_mismatch','source_mismatch','source_redacted')
     or p_eligible is distinct from (p_reason = 'eligible') or p_digest !~ '^[a-f0-9]{64}$' then raise exception 'Invalid evidence result' using errcode = '22023'; end if;
  select * into s from public.crm_submissions where id = p_submission;
  select * into a from public.crm_submission_attribution where submission_id = p_submission;
  select * into p from public.crm_lifecycle_eligibility_policies where id = p_policy;
  select * into m from public.crm_form_mappings where id = p.form_mapping_id;
  if s.id is null or p.id is null or m.id is null or s.form_mapping_id is distinct from m.id or m.connection_id is distinct from p.connection_id
     or s.channel <> 'meta_instant_form' or s.occurred_at < p.effective_from or s.occurred_at >= p.effective_until
     or (p.retired_at is not null and s.occurred_at >= p.retired_at) or a.provider <> 'meta' or a.form_id is distinct from m.form_key
     or a.page_id is distinct from (select page_id from public.crm_integration_connections where id = p.connection_id) then
    p_eligible := false; p_reason := 'source_mismatch';
  elsif a.redacted_at is not null then p_eligible := false; p_reason := 'source_redacted'; end if;
  if p_reason not in ('source_mismatch','source_redacted') then
   p_reason:=crm_security.lifecycle_evidence_reason(p_submission,p_policy);p_eligible:=(p_reason='eligible');
  end if;
  safety:=crm_security.lifecycle_safety_hold(p_submission,p_policy);
  marker:=encode(sha256(convert_to('crm:lifecycle:eligibility:'||p_submission||':'||p_policy,'UTF8')),'hex');
  insert into public.crm_lifecycle_eligibility_checks(submission_id,policy_id,eligible,reason_code,evidence_digest,source_marker)
  values(p_submission,p_policy,p_eligible,p_reason,p_digest,marker) on conflict(policy_id,source_marker) do nothing returning id into check_id;
  if check_id is null then select id into check_id from public.crm_lifecycle_eligibility_checks where policy_id=p_policy and source_marker=marker; end if;
  select eligible,reason_code,redacted_at into p_eligible,p_reason,check_redacted from public.crm_lifecycle_eligibility_checks where id=check_id;
  if check_redacted is not null then return jsonb_build_object('check_id',check_id,'eligible',false,'evidence_id',null); end if;
  if p_eligible then
    projection := jsonb_build_object('page_id',a.page_id,'form_id',a.form_id,'notice_version',p.notice_version,'captured_at',s.occurred_at);
    insert into public.crm_lifecycle_eligibility_evidence(submission_id,connection_id,policy_id,event_type,effective_at,source_kind,reason_code,
      source_external_id,source_projection,source_request_key)
    values(s.id,p.connection_id,p.id,'grant',s.occurred_at,'form_response','explicit_form_evidence',a.external_submission_id,projection,
      gen_random_uuid())
    on conflict do nothing returning id into evidence_id;
    if evidence_id is null then select id into evidence_id from public.crm_lifecycle_eligibility_evidence where submission_id=s.id and policy_id=p.id and event_type='grant'; end if;
  end if;
  if safety in ('inquiry_refusal','source_restriction') then
   subject:=crm_security.lifecycle_lead_root(s.lead_id);
   perform crm_security.lifecycle_insert_stop('opportunity',subject,p.connection_id,safety,gen_random_uuid(),'form_choice',s.id,p.safety_decision_reference);
  end if;
  return jsonb_build_object('check_id',check_id,'eligible',p_eligible,'evidence_id',evidence_id);
end $function$;

CREATE OR REPLACE FUNCTION public.crm_revoke_lifecycle_evidence(p_request uuid, p_evidence uuid, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare grant_row public.crm_lifecycle_eligibility_evidence; result uuid;scopes jsonb;subject uuid;
begin
 perform crm_security.lifecycle_barrier(false);
 select jsonb_build_array(jsonb_build_object('lead',crm_security.lifecycle_lead_root(s.lead_id),'connection',e.connection_id)) into scopes
 from public.crm_lifecycle_eligibility_evidence e join public.crm_submissions s on s.id=e.submission_id
 where e.id=p_evidence and s.lead_id is not null;
 if scopes is null then raise exception 'Detached scope requires a verified sharing stop' using errcode='22023';end if;
 perform crm_security.lifecycle_scope_keys(scopes);perform crm_security.lifecycle_scope_rows(scopes,true,array(select submission_id from public.crm_lifecycle_eligibility_evidence where id=p_evidence));

  perform crm_security.require_reader(true);
  if p_request is null or p_reason not in ('contact_request','policy_withdrawn','source_corrected','privacy_request') then raise exception 'Controlled revocation required' using errcode='22023'; end if;
  select * into grant_row from public.crm_lifecycle_eligibility_evidence where id=p_evidence and event_type='grant' for update;
  if not found then raise exception 'Grant required' using errcode='22023'; end if;
  insert into public.crm_lifecycle_eligibility_evidence(submission_id,connection_id,policy_id,event_type,effective_at,source_kind,reason_code,source_request_key,actor_id,supersedes_evidence_id)
  values(grant_row.submission_id,grant_row.connection_id,grant_row.policy_id,'revoke',clock_timestamp(),'director_revocation',p_reason,p_request,auth.uid(),grant_row.id)
  on conflict(connection_id,source_request_key) do nothing returning id into result;
  if result is null then select id into result from public.crm_lifecycle_eligibility_evidence where connection_id=grant_row.connection_id and source_request_key=p_request; end if;
  select crm_security.lifecycle_lead_root(lead_id) into subject from public.crm_submissions where id=grant_row.submission_id;
  perform crm_security.lifecycle_insert_stop('opportunity',subject,grant_row.connection_id,
   case when p_reason in ('contact_request','privacy_request') then 'privacy_request' else 'source_restriction' end,
   p_request,'evidence_revoke',grant_row.submission_id);
  return result;
end $function$;

CREATE OR REPLACE FUNCTION public.crm_list_external_deliveries(p_limit integer DEFAULT 25, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare result jsonb;
begin
 perform crm_security.require_reader(true);if p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset<0 then raise exception 'Invalid page' using errcode='22023';end if;
 select jsonb_build_object('total',(select count(*) from public.crm_external_deliveries),
  'live_available',exists(select 1 from public.crm_lifecycle_provider_contracts where active and lifecycle_model='r4_stage_entry'
    and uncertainty_policy='no_uncertain_replay' and action_source='system_generated' and maximum_event_age_seconds between 1 and 604800
    and required_constants='{"event_source":"crm","lead_event_source":"English Hills CRM"}'::jsonb
    and event_map='{"intake":"Intake","not_qualified":"Not qualified","lost":"Lost","qualified":"Qualified","converted":"Converted"}'::jsonb),
  'counts',(select coalesce(jsonb_object_agg(status,n),'{}') from (select status,count(*) n from public.crm_external_deliveries group by status)c),
  'oldest_pending_at',(select min(event_time) from public.crm_external_deliveries where status in ('pending','retry','unknown','blocked')),
  'rows',coalesce(jsonb_agg(to_jsonb(x)),'[]')) into result from
 (select d.id,d.lead_id,d.connection_id,(select contact_id from public.crm_leads where id=d.lead_id) contact_id,d.event_kind,d.delivery_mode,d.lifecycle_model,d.status,d.attempt_boundary_state,d.attempt_count,d.max_attempts,d.created_at,d.event_time,
  d.next_attempt_at,d.sent_at,d.last_error_code,d.mapping_version,d.eligibility_evidence_id,d.payload_erased_at,p.d2_requirement,
  case when d.eligibility_evidence_id is not null and exists(select 1 from public.crm_lifecycle_eligibility_evidence ge where ge.id=d.eligibility_evidence_id and ge.redacted_at is null) then 'available'
   when exists(select 1 from public.crm_lifecycle_eligibility_checks ck where ck.policy_id=p.id and ck.submission_id=d.attribution_submission_id and ck.reason_code in ('adult_ambiguous','sharing_ambiguous','notice_mismatch')) then 'ambiguous' else 'missing' end d2_evidence_state,
  crm_security.lifecycle_stop_hold(d.lead_id,d.connection_id) privacy_hold,c.connection_key as destination_label,
  pc.contract_key,pc.revision as contract_revision,ep.started_at as activation_started_at,
  case when d.lifecycle_model='r4_stage_entry' then o.producer else null end producer_owner,
  case when d.lifecycle_model='r4_stage_entry' then crm_security.lifecycle_predecessor_hold(d) end ordering_hold,
  retry.retry_hold,(retry.retry_hold is null) retry_eligible,
  (select jsonb_agg(jsonb_build_object('number',a.attempt_number,'started_at',a.started_at,'finished_at',a.finished_at,'outcome',a.outcome,
    'http_status',a.http_status,'error_code',a.error_code,'erased_at',a.diagnostics_erased_at) order by a.attempt_number)
   from public.crm_external_delivery_attempts a where a.delivery_id=d.id) attempts
  from public.crm_external_deliveries d left join public.crm_integration_connections c on c.id=d.connection_id
  left join public.crm_lifecycle_provider_contracts pc on pc.id=d.provider_contract_id
  left join public.crm_lifecycle_activation_epochs ep on ep.id=d.activation_epoch_id
  left join public.crm_lifecycle_producer_ownership o on o.id=d.producer_ownership_id
  left join public.crm_lifecycle_producer_boundaries b on b.id=o.boundary_id
  left join public.crm_lifecycle_eligibility_policies p on p.id=b.eligibility_policy_id
  left join lateral (select crm_security.lifecycle_retry_hold(d) retry_hold) retry on true
  order by d.created_at desc,d.id limit p_limit offset p_offset)x;
 return result;
end $function$;

CREATE OR REPLACE FUNCTION public.crm_lifecycle_diagnostics()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare result jsonb;
begin
 perform crm_security.require_reader(true);
 select jsonb_build_object(
  'provider_contract_ready',exists(select 1 from public.crm_lifecycle_provider_contracts where active and lifecycle_model='r4_stage_entry'
    and uncertainty_policy='no_uncertain_replay' and deduplication_window_seconds is null and lead_id_only
    and action_source='system_generated' and maximum_event_age_seconds between 1 and 604800
    and required_constants='{"event_source":"crm","lead_event_source":"English Hills CRM"}'::jsonb
    and event_map='{"intake":"Intake","not_qualified":"Not qualified","lost":"Lost","qualified":"Qualified","converted":"Converted"}'::jsonb),
  'producer_controls',jsonb_build_object(
    'valid_boundaries',(select count(*) from public.crm_lifecycle_producer_boundaries b
      join public.crm_integration_connections c on c.id=b.connection_id and c.page_id=b.page_id and c.lifecycle_settings->>'dataset_id'=b.dataset_id
       and (c.lifecycle_settings->>'contract_id')::uuid=b.provider_contract_id
      join public.crm_lifecycle_provider_contracts pc on pc.id=b.provider_contract_id and pc.active and pc.lifecycle_model='r4_stage_entry'
       and pc.uncertainty_policy='no_uncertain_replay' and pc.action_source='system_generated' and pc.maximum_event_age_seconds between 1 and 604800
      join public.crm_lifecycle_eligibility_policies p on p.id=b.eligibility_policy_id and p.version=b.policy_version
       and p.notice_version is not distinct from b.notice_version and p.notice_text_digest is not distinct from b.notice_text_digest and p.lifecycle_model='r4_stage_entry' and p.retired_at is null
      where b.revoked_at is null and b.valid_from<=clock_timestamp() and b.valid_until>clock_timestamp() and b.legacy_exclusion_valid_until>clock_timestamp()),
    'revoked_or_expired_boundaries',(select count(*) from public.crm_lifecycle_producer_boundaries
      where revoked_at is not null or valid_until<=clock_timestamp() or legacy_exclusion_valid_until<=clock_timestamp()),
    'native_owned_opportunities',(select count(*) from public.crm_lifecycle_producer_ownership where producer='eh_native'),
    'legacy_owned_opportunities',(select count(*) from public.crm_lifecycle_producer_ownership where producer='legacy')),
  'ordering_holds',jsonb_build_object(
    'unattempted_predecessor',(select count(*) from public.crm_external_deliveries d where d.last_error_code='unattempted_predecessor'),
    'active_predecessor',(select count(*) from public.crm_external_deliveries d where d.last_error_code='active_predecessor'),
    'contradictory_chronology',(select count(*) from public.crm_external_deliveries d where d.last_error_code='contradictory_chronology')),
  'uncertain_unreplayable',(select count(*) from public.crm_external_deliveries where lifecycle_model='r4_stage_entry' and attempt_boundary_state='unknown'),
  'destinations',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'version',c.version,'label',c.connection_key,
    'configured_mode',c.lifecycle_settings->>'mode','enabled',coalesce((c.lifecycle_settings->>'enabled')::boolean,false),'contract_key',c.lifecycle_settings->>'contract_key',
    'lifecycle_model',c.lifecycle_settings->>'lifecycle_model','activation_started_at',c.lifecycle_settings->>'live_started_at') order by c.connection_key)
    from public.crm_integration_connections c where c.provider='meta'),'[]'),
  'forms',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'connection_id',m.connection_id,'form_key',m.form_key,'form_name',m.form_name,'version',m.version) order by m.created_at desc)
    from public.crm_form_mappings m where m.channel='meta_instant_form' and m.retired_at is null),'[]'),
  'policies',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'connection_id',p.connection_id,'form_mapping_id',p.form_mapping_id,'version',p.version,
    'd2_requirement',p.d2_requirement,'lifecycle_model',p.lifecycle_model,'notice_version',p.notice_version,'notice_text_digest',p.notice_text_digest,'effective_from',p.effective_from,'effective_until',p.effective_until,
    'retired_at',p.retired_at,'grants',(select count(*) from public.crm_lifecycle_eligibility_evidence e where e.policy_id=p.id and e.event_type='grant'),
    'revocations',(select count(*) from public.crm_lifecycle_eligibility_evidence e where e.policy_id=p.id and e.event_type='revoke')) order by p.created_at desc)
    from public.crm_lifecycle_eligibility_policies p),'[]'),
  'sharing_stops',(select count(*) from public.crm_lifecycle_sharing_stops),'scheduler',(select to_jsonb(h) from public.crm_lifecycle_scheduler_health h where singleton),
  'activation_prerequisites',jsonb_build_array('official_provider_contract','h4_prospective_source_and_platform_privacy_review','legacy_producer_exclusion','producer_boundary','destination_entitlement','release_approval')
 ) into result;return result;
end $function$;

CREATE OR REPLACE FUNCTION public.crm_finalize_meta_job(p_job uuid, p_lease uuid, p_mapping uuid, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare source_id uuid;source_connection uuid;j public.crm_ingestion_jobs;c public.crm_integration_connections;m public.crm_form_mappings;s public.crm_submissions;
 d jsonb;a jsonb;phone text;email text;contacts uuid[];leads uuid[];contact uuid;lead uuid;occurred timestamptz;ambiguous boolean:=false;begin
 perform crm_security.lifecycle_barrier(true);

 select coalesce(submission_id,gen_random_uuid()),connection_id into source_id,source_connection from public.crm_ingestion_jobs where id=p_job;
 if source_id is not null then perform crm_security.lifecycle_preidentity_keys(source_id,source_connection);end if;
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

 if j.submission_id is null then
  insert into public.crm_submissions(id,channel,received_at,occurred_at,time_source,core_fields,form_answers,source_label,match_status,payload_hash,form_mapping_id)
  values(source_id,'meta_instant_form',j.created_at,occurred,'provider',d,p_data->'form_answers',left(coalesce(nullif(p_data->>'source_label',''),'Meta'),200),'needs_review',encode(sha256(convert_to(p_data::text,'UTF8')),'hex'),m.id) returning * into s;
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
end $function$;

CREATE OR REPLACE FUNCTION public.crm_finalize_website_job(p_job uuid, p_lease uuid, p_mapping uuid, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$ declare source_id uuid;source_connection uuid;j public.crm_ingestion_jobs;c public.crm_integration_connections;s public.crm_submissions;m public.crm_form_mappings;d jsonb;a jsonb;lead uuid;begin
 perform crm_security.lifecycle_barrier(true);

 select coalesce(submission_id,gen_random_uuid()),connection_id into source_id,source_connection from public.crm_ingestion_jobs where id=p_job;
 if source_id is not null then perform crm_security.lifecycle_preidentity_keys(source_id,source_connection);end if;
 perform crm_security.require_meta_worker();
 select c0.* into c from public.crm_integration_connections c0 join public.crm_ingestion_jobs j0 on j0.connection_id=c0.id where j0.id=p_job and c0.provider='website' for share of c0;
 if not found then raise exception 'Website job required' using errcode='22023';end if;
 select * into j from public.crm_ingestion_jobs where id=p_job for update;
 if j.status<>'processing' or j.lease_token is distinct from p_lease or j.lease_until<=now() then raise exception 'Stale lease' using errcode='40001';end if;
 if not c.enabled then perform public.crm_fail_meta_job(p_job,p_lease,'connection_disabled');return jsonb_build_object('status','blocked');end if;
 if jsonb_typeof(p_data) is distinct from 'object' or p_data-array['core_fields','form_answers','source_label']<>'{}' or octet_length(p_data::text)>65536 or not crm_security.valid_answers(p_data->'form_answers') then raise exception 'Invalid normalized inquiry' using errcode='22023';end if;
 select * into m from public.crm_form_mappings where id=p_mapping and connection_id=c.id and channel='website' and form_key=j.payload->>'form_key';
 if not found or p_mapping is distinct from (public.crm_get_website_job_mapping(p_job,p_lease)->>'id')::uuid then raise exception 'Invalid mapping' using errcode='22023';end if;

 if j.submission_id is null then
  d:=p_data->'core_fields';a:=j.payload->'attribution';
  insert into public.crm_submissions(id,channel,received_at,occurred_at,time_source,core_fields,form_answers,source_label,match_status,payload_hash,form_mapping_id)
  values(source_id,'website',j.created_at,j.created_at,'server',d,p_data->'form_answers',left(coalesce(nullif(p_data->>'source_label',''),'Site web'),200),'needs_review',j.payload_hash,m.id) returning * into s;
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
end $function$;

CREATE OR REPLACE FUNCTION public.crm_resolve_meta_intake(p_request uuid, p_submission uuid, p_action text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$ declare s public.crm_submissions;l public.crm_leads;prior public.crm_command_requests;
 digest text;result jsonb;lead uuid;begin
 perform crm_security.lifecycle_barrier(true);
 perform crm_security.require_reader();
 if p_request is null or p_action is null or p_action not in ('attach','new','reject') or jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>8192
 or p_data-array['lead_id','expected_version','contact_id','contact_version','contact_name','learner_name','program_interest_text']<>'{}' then raise exception 'Invalid resolution' using errcode='22023';end if;
 digest:=encode(sha256(convert_to(jsonb_build_array(p_submission,p_action,p_data)::text,'UTF8')),'hex');

 perform crm_security.lifecycle_preidentity_keys(src.id,fm.connection_id)
 from public.crm_submissions src join public.crm_form_mappings fm on fm.id=src.form_mapping_id where src.id=p_submission;
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
end $function$;

CREATE OR REPLACE FUNCTION crm_security.resolve_external_submission(sid uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare s public.crm_submissions;d jsonb;phone text;email text;contacts uuid[];leads uuid[];contact uuid;lead uuid;ambiguous boolean:=false;begin
 if not crm_security.lifecycle_has_barrier(true) then raise exception 'Outermost identity barrier required' using errcode='42501';end if;
 if not crm_security.lifecycle_has_intake(sid) then raise exception 'Prelocked intake scope required' using errcode='42501';end if;
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
 elsif crm_security.mapping_learner_optional(s.id) and nullif(btrim(d->>'learner_name'),'') is null
  and nullif(btrim(d->>'contact_name'),'') is not null and nullif(btrim(d->>'program_interest_text'),'') is not null
  and (phone is not null or email is not null) and (contacts is null or contact is not null) then
  -- An unnamed opportunity may only reuse one corroborated, still unnamed
  -- active opportunity for the same program/session. A named child or any
  -- competing active opportunity remains in review.
  if contact is null then
   lead:=crm_security.accept_external_submission(s.id);
  else
   select array_agg(id order by id) into leads from public.crm_leads where contact_id=contact and merged_into_lead_id is null
    and status in ('NEW','CONTACTING','ENGAGED','QUALIFIED');
   if coalesce(cardinality(leads),0)=0 then
    lead:=crm_security.accept_external_submission(s.id,contact);
   elsif cardinality(leads)=1 and exists(select 1 from public.crm_leads l where l.id=leads[1]
    and l.learner_name is null and l.learner_name_normalized is null
    and lower(btrim(l.program_interest_text))=lower(btrim(d->>'program_interest_text'))
    and l.session_type is not distinct from d->>'session_type'
    and l.student_id is null and l.enrollment_id is null) then
    lead:=crm_security.accept_external_submission(s.id,contact,leads[1]);
   end if;
  end if;
 end if;
 if lead is null then
  update public.crm_submissions set candidate_lead_ids=coalesce((select array_agg(id) from (select id from public.crm_leads where contact_id=any(contacts) and merged_into_lead_id is null and status in ('NEW','CONTACTING','ENGAGED','QUALIFIED') order by id limit 50)x),'{}') where id=s.id;
 end if;
 return lead;
end $function$;

CREATE OR REPLACE FUNCTION crm_security.accept_external_submission(sid uuid, contact uuid DEFAULT NULL::uuid, lead uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$ declare s public.crm_submissions;l public.crm_leads;p public.crm_followup_policies;
 d jsonb;due timestamptz;tid uuid;actor_kind text:=case when auth.uid() is null then 'integration' else 'user' end;begin
 if not crm_security.lifecycle_has_barrier(true) then raise exception 'Outermost identity barrier required' using errcode='42501';end if;
 select * into strict s from public.crm_submissions where id=sid for update;
 if s.match_status<>'needs_review' then raise exception 'Unresolved intake required' using errcode='40001';end if;
 d:=s.core_fields;
 if lead is null then
  select * into p from public.crm_followup_policies where effective_from<=now() and (retired_at is null or retired_at>now()) order by version desc limit 1;
  if not found then raise exception 'missing_policy' using errcode='P0001';end if;
  if nullif(btrim(d->>'contact_name'),'') is null or nullif(btrim(d->>'program_interest_text'),'') is null
   or (nullif(btrim(d->>'learner_name'),'') is null and not crm_security.mapping_learner_optional(s.id))
   then raise exception 'Contact, program and permitted learner identity required' using errcode='22023';end if;
  if nullif(btrim(d->>'learner_name'),'') is null and crm_security.normalize_phone(d->>'phone') is null and nullif(lower(btrim(d->>'email')),'') is null
   then raise exception 'Contact method required' using errcode='22023';end if;
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
  values(contact,case when nullif(btrim(d->>'learner_name'),'') is null then null else d->>'learner_name' end,
   lower(nullif(btrim(d->>'learner_name'),'')),(d->>'learner_age')::integer,case when d->>'learner_age' is not null then s.received_at end,
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
 perform crm_security.lifecycle_pending_handoff(s.id);
 return l.id;
end $function$;

CREATE OR REPLACE FUNCTION crm_security.command(cmd text, request uuid, data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare actor uuid:=auth.uid(); digest text; prior public.crm_command_requests%rowtype; result jsonb;
 l public.crm_leads%rowtype; t public.crm_tasks%rowtype; p public.crm_followup_policies%rowtype;
 contact uuid; submission uuid; aid uuid; tid uuid; source text; allowed text[]; offsets integer[];
 phone text; email text; candidates jsonb; count_failed integer; ordinal smallint;
 due timestamptz; happened timestamptz; outcome text; meaningful boolean:=false; needs_next boolean:=false;
 reason text; target text; initial_status text; next_spec jsonb; policy_version integer;
begin
 if cmd in ('create_manual_lead','resolve_submission') then
  perform crm_security.lifecycle_barrier(true);
  if cmd='resolve_submission' then

   perform crm_security.lifecycle_preidentity_keys(src.id,fm.connection_id)
   from public.crm_submissions src join public.crm_form_mappings fm on fm.id=src.form_mapping_id where src.id=(data->>'submission_id')::uuid;
  end if;
 end if;

 perform crm_security.require_reader(cmd='create_followup_policy');
 if request is null or jsonb_typeof(data) is distinct from 'object' or octet_length(data::text)>32768 then
  raise exception 'Request key and bounded object payload required' using errcode='22023'; end if;
 allowed:=case cmd
 when 'create_followup_policy' then array['weekly_hours','timezone','attempt_offsets','minimum_attempt_gap_minutes','first_contact_sla_minutes','post_test_sla_minutes','stale_contacting_minutes','effective_from']
 when 'create_manual_lead' then array['display_name','contact_kind','phone','whatsapp','email','preferred_channel','learner_name','learner_age','learner_birth_date','session_type','program_interest_text','source_label','owner_id']
 when 'resolve_submission' then array['lead_id','expected_version','submission_id']
 when 'add_note' then array['lead_id','expected_version','note']
 when 'record_call_outcome' then array['lead_id','expected_version','task_id','expected_task_version','outcome','occurred_at','note','next_task']
 when 'record_whatsapp' then array['lead_id','expected_version','kind','occurred_at','note','next_task']
 when 'record_conversation' then array['lead_id','expected_version','channel','occurred_at','note','next_task']
 when 'schedule_task' then array['lead_id','expected_version','task_id','expected_task_version','task','note']
 when 'complete_task' then array['lead_id','expected_version','task_id','expected_task_version','outcome','note','next_task']
 when 'cancel_task' then array['lead_id','expected_version','task_id','expected_task_version','reason','next_task']
 when 'qualify_lead' then array['lead_id','expected_version','qualification_step','note','conversation_channel','next_task']
 when 'close_lost' then array['lead_id','expected_version','reason','note']
 when 'close_not_qualified' then array['lead_id','expected_version','reason','note']
 when 'reopen_lead' then array['lead_id','expected_version','reason','next_task']
 when 'reassign' then array['lead_id','expected_version','owner_id','task_id','expected_task_version','assigned_to','note']
 else null end;
 if allowed is null or data-allowed<>'{}'::jsonb then raise exception 'Unsupported command fields' using errcode='22023'; end if;
 digest:=encode(sha256(convert_to(data::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('crm:request:'||actor||':'||cmd||':'||request,0));
 select * into prior from public.crm_command_requests where actor_scope=actor::text and command_name=cmd and request_key=request;
 if found then
  if prior.payload_hash<>digest then raise exception 'Request key payload conflict' using errcode='22023'; end if;
  return prior.result;
 end if;
 source:='command:'||actor||':'||cmd||':'||request;

 if cmd='create_followup_policy' then
  if coalesce(data->>'timezone','Africa/Casablanca')<>'Africa/Casablanca' then raise exception 'Timezone must be Africa/Casablanca' using errcode='22023'; end if;
  if data ? 'attempt_offsets' then select array_agg(value::integer order by ord) into offsets from jsonb_array_elements_text(data->'attempt_offsets') with ordinality a(value,ord);
  else offsets:=array[0,0,1,3,5]; end if;
  perform crm_security.validate_policy(data->'weekly_hours',offsets);
  if coalesce((data->>'minimum_attempt_gap_minutes')::integer,180) not between 180 and 10080
   or coalesce((data->>'first_contact_sla_minutes')::integer,15) not between 1 and 1440
   or coalesce((data->>'post_test_sla_minutes')::integer,120) not between 1 and 10080
   or coalesce((data->>'stale_contacting_minutes')::integer,2880) not between 60 and 43200 then
   raise exception 'Invalid policy timing' using errcode='22023'; end if;
  happened:=coalesce((data->>'effective_from')::timestamptz,now());
  if not isfinite(happened) or happened<now()-interval '1 minute' then raise exception 'Policy cannot be backdated' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('crm:policy:publish',0));
  select coalesce(max(version),0)+1 into policy_version from public.crm_followup_policies;
  insert into public.crm_followup_policies(version,weekly_hours,date_exceptions,attempt_offsets,minimum_attempt_gap_minutes,
   first_contact_sla_minutes,post_test_sla_minutes,stale_contacting_minutes,effective_from,created_by)
  values(policy_version,data->'weekly_hours','[]',offsets,coalesce((data->>'minimum_attempt_gap_minutes')::integer,180),
   coalesce((data->>'first_contact_sla_minutes')::integer,15),coalesce((data->>'post_test_sla_minutes')::integer,120),
   coalesce((data->>'stale_contacting_minutes')::integer,2880),happened,actor) returning * into p;
  result:=jsonb_build_object('policy_id',p.id,'version',p.version,'timezone',p.timezone,'weekly_hours',p.weekly_hours,'effective_from',p.effective_from);

 elsif cmd='create_manual_lead' then
  select * into p from public.crm_followup_policies where effective_from<=now() and (retired_at is null or retired_at>now()) order by version desc limit 1;
  if not found then raise exception 'No effective follow-up policy; ask a director to publish one' using errcode='22023'; end if;
  if nullif(btrim(data->>'learner_name'),'') is null or length(data->>'learner_name')>200
   or nullif(btrim(data->>'display_name'),'') is null or length(data->>'display_name')>200
   or nullif(btrim(data->>'source_label'),'') is null or length(data->>'source_label')>200 then
   raise exception 'Contact, learner and source label required (maximum 200 characters)' using errcode='22023'; end if;
  if (data->>'learner_birth_date')::date>current_date then raise exception 'Birth date cannot be in the future' using errcode='22023'; end if;
  perform crm_security.assert_staff((data->>'owner_id')::uuid);
  phone:=crm_security.normalize_phone(data->>'phone'); email:=nullif(lower(btrim(data->>'email')),'');
  if email is not null and (length(email)>254 or email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then raise exception 'Invalid email' using errcode='22023'; end if;
  -- No automatic reuse, including a unique phone/email match: shared family
  -- identifiers are not proof of contact identity. Return bounded suggestions.
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'display_name',c.display_name,'version',c.version)),'[]'::jsonb) into candidates
  from (select id,display_name,version from public.crm_contacts where merged_into_contact_id is null
   and ((phone is not null and phone_e164=phone) or (email is not null and email_normalized=email)) order by id limit 10) c;
  insert into public.crm_contacts(display_name,contact_kind,phone_raw,phone_e164,whatsapp_raw,whatsapp_e164,email_raw,email_normalized,preferred_channel,created_by)
  values(btrim(data->>'display_name'),coalesce(data->>'contact_kind','unknown'),data->>'phone',phone,data->>'whatsapp',crm_security.normalize_phone(data->>'whatsapp'),
   data->>'email',email,data->>'preferred_channel',actor) returning id into contact;
  submission:=gen_random_uuid(); l.id:=gen_random_uuid();
  due:=crm_security.next_window(p.id,now()+make_interval(mins=>p.first_contact_sla_minutes));
  insert into public.crm_leads(id,contact_id,learner_name,learner_name_normalized,learner_age,age_recorded_at,learner_birth_date,session_type,program_interest_text,
    owner_id,first_submission_id,latest_submission_id,followup_policy_id,outreach_anchor_date)
  values(l.id,contact,btrim(data->>'learner_name'),lower(btrim(data->>'learner_name')),(data->>'learner_age')::integer,
   case when data->>'learner_age' is not null then now() end,(data->>'learner_birth_date')::date,data->>'session_type',data->>'program_interest_text',
   (data->>'owner_id')::uuid,submission,submission,p.id,(due at time zone p.timezone)::date) returning * into l;
  insert into public.crm_submissions(id,lead_id,channel,received_at,occurred_at,time_source,core_fields,form_answers,source_label,match_status,resolved_by,resolved_at,payload_hash)
  values(submission,l.id,'manual',now(),now(),'server',data,'[]',btrim(data->>'source_label'),'resolved',actor,now(),digest);
  perform crm_security.event(l.id,'lead_created',source||':lead',null,null,null,null,null,null,null,null,'NEW');
  aid:=crm_security.event(l.id,'submission_received',source||':submission',submission=>submission);
  -- Activity ownership FK is satisfied; acquisition snapshots are never edited.
  tid:=crm_security.new_task(l,jsonb_build_object('task_type','first_contact','due_at',due),'attempt:'||l.id||':1:1','intake',1::smallint,source||':initial-task');
  result:=crm_security.result(l.id,source)||jsonb_build_object('submission_id',submission,'contact_candidates',candidates,'contact_version',1);

 else
  select * into l from public.crm_leads where id=(data->>'lead_id')::uuid for update;
  if not found then raise exception 'Lead not found' using errcode='22023'; end if;
  if (data->>'expected_version')::bigint is distinct from l.version then raise exception 'Stale lead version; refresh and retry' using errcode='40001'; end if;
  if l.merged_into_lead_id is not null or l.status='CONVERTED' then raise exception 'Lead is not operationally editable' using errcode='22023'; end if;
  if cmd not in ('add_note','reopen_lead','reassign') and l.status in ('LOST','NOT_QUALIFIED') then raise exception 'Reopen lead before this operation' using errcode='22023'; end if;
  initial_status:=l.status;
  if data->>'task_id' is not null then
   select * into t from public.crm_tasks where id=(data->>'task_id')::uuid and lead_id=l.id for update;
   if not found or t.status<>'open' then raise exception 'Open task not found on this lead' using errcode='40001'; end if;
   if (data->>'expected_task_version')::bigint is distinct from t.version then raise exception 'Stale task version; refresh and retry' using errcode='40001'; end if;
  end if;
  if cmd in ('complete_task','cancel_task') and t.id is null then raise exception 'Task required' using errcode='22023'; end if;
  happened:=coalesce((data->>'occurred_at')::timestamptz,now());
  if not isfinite(happened) or happened>now() or happened<l.created_at then raise exception 'Occurrence time must be between lead creation and now' using errcode='22023'; end if;
  if happened<(select max(occurred_at) from public.crm_activities where lead_id=l.id and event_type='lead_reopened') then
   raise exception 'Activity predates the latest reopening' using errcode='22023'; end if;

  if cmd='resolve_submission' then
   -- Private only: future trusted intake can attach an unresolved acquisition
   -- without rewriting accepted snapshots or the lead's original first touch.
   perform 1 from public.crm_submissions where id=(data->>'submission_id')::uuid and match_status='needs_review' and lead_id is null for update;
   if not found then raise exception 'Unresolved submission required' using errcode='22023'; end if;
   update public.crm_submissions set lead_id=l.id,match_status='resolved',resolved_by=actor,resolved_at=now()
    where id=(data->>'submission_id')::uuid;
   update public.crm_leads set latest_submission_id=(data->>'submission_id')::uuid where id=l.id
    and (select row(occurred_at,id) from public.crm_submissions where id=(data->>'submission_id')::uuid)>
        (select row(occurred_at,id) from public.crm_submissions where id=l.latest_submission_id);
   perform crm_security.lifecycle_pending_handoff((data->>'submission_id')::uuid);
   perform crm_security.event(l.id,'submission_received',source||':submission',submission=>(data->>'submission_id')::uuid);
  elsif cmd='add_note' then
   if nullif(btrim(data->>'note'),'') is null then raise exception 'Note required' using errcode='22023'; end if;
   perform crm_security.event(l.id,'note_added',source||':note',data->>'note');

  elsif cmd='record_call_outcome' then
   outcome:=data->>'outcome';
   if outcome is null or outcome<>all(array['no_answer','busy','declined','unreachable','spoke_with_contact','wrong_number']) then raise exception 'Invalid phone outcome' using errcode='22023'; end if;
   if t.id is not null and t.task_type not in ('first_contact','contact_attempt','callback') then raise exception 'Phone outcome requires a call task' using errcode='22023'; end if;
   if l.last_attempt_at is not null and happened<l.last_attempt_at then raise exception 'Call time predates last recorded attempt' using errcode='22023'; end if;
   if outcome='spoke_with_contact' then
    meaningful:=true;
    perform crm_security.event(l.id,'conversation_recorded',source||':conversation',data->>'note','phone',outcome,t.id,happened);
   elsif outcome in ('no_answer','busy','declined','unreachable') and l.status in ('NEW','CONTACTING','ENGAGED','QUALIFIED') then
    select * into strict p from public.crm_followup_policies where id=l.followup_policy_id;
    if l.last_attempt_at is not null and happened<l.last_attempt_at+make_interval(mins=>p.minimum_attempt_gap_minutes) then
     raise exception 'Failed calls must respect the policy minimum spacing' using errcode='22023'; end if;
    if l.last_conversation_at is not null and happened<l.last_conversation_at then
     raise exception 'Failed call predates the latest meaningful conversation' using errcode='22023'; end if;
    count_failed:=crm_security.failed_count(l); ordinal:=(count_failed+1)::smallint;
    -- Each uninterrupted sequence anchors to its first actual failed call,
    -- independently of lifecycle and any earlier intake/conversation dates.
    if count_failed=0 then l.outreach_anchor_date:=(happened at time zone 'Africa/Casablanca')::date; end if;
    -- The first five need not have a task supplied, but consume the current
    -- sequence slot exactly once. An explicit call after five is still possible.
    if t.id is null then
     select * into t from public.crm_tasks where lead_id=l.id and status='open' and outreach_cycle=l.outreach_cycle and attempt_ordinal=ordinal order by id limit 1 for update;
    elsif t.attempt_ordinal is not null and (t.outreach_cycle<>l.outreach_cycle or t.attempt_ordinal<>ordinal) then
     raise exception 'Task is not the current attempt' using errcode='40001';
    end if;
    perform crm_security.event(l.id,'contact_attempted',source||':attempt',data->>'note','phone',outcome,t.id,happened,l.outreach_cycle,ordinal);
    perform crm_security.event(l.id,'call_'||outcome,source||':outcome',null,'phone',outcome,t.id,happened);
    if l.status='NEW' then l.status:='CONTACTING'; end if;
    l.last_attempt_at:=happened;
    if t.id is not null then perform crm_security.finish_task(t,false,data->>'note',source||':complete'); end if;
    -- Cancel any obsolete call slot if the operator used a different callback.
    perform crm_security.cancel_tasks(l.id,'Attempt recorded',source||':obsolete',true);
    t.id:=null;
    if ordinal<5 then
     due:=crm_security.attempt_due(l.followup_policy_id,l.outreach_anchor_date,ordinal+1,happened,now());
     tid:=crm_security.new_task(l,jsonb_build_object('task_type','contact_attempt','due_at',due),'attempt:'||l.id||':'||l.outreach_cycle||':'||(ordinal+1),'attempt_sequence',(ordinal+1)::smallint,source||':next-attempt');
    end if;
   else
    -- Wrong number never counts as an unreachable attempt.
    perform crm_security.event(l.id,'call_'||outcome,source||':outcome',data->>'note','phone',outcome,t.id,happened);
    needs_next:=true;
   end if;
   if t.id is not null then perform crm_security.finish_task(t,false,data->>'note',source||':complete'); end if;

  elsif cmd='record_whatsapp' then
   if (data->>'kind') is null or data->>'kind' not in ('whatsapp_sent','meaningful_whatsapp_conversation') then raise exception 'Invalid WhatsApp activity' using errcode='22023'; end if;
   meaningful:=data->>'kind'='meaningful_whatsapp_conversation';
   perform crm_security.event(l.id,case when meaningful then 'whatsapp_conversation' else 'whatsapp_sent' end,source||':whatsapp',data->>'note','whatsapp',null,null,happened);
   if not meaningful and data ? 'next_task' then raise exception 'WhatsApp sent is activity-only' using errcode='22023'; end if;

  elsif cmd='record_conversation' then
   if coalesce(data->>'channel','') not in ('phone','whatsapp','in_person') or nullif(btrim(data->>'note'),'') is null then raise exception 'Conversation channel and evidence required' using errcode='22023'; end if;
   meaningful:=true;
   perform crm_security.event(l.id,'conversation_recorded',source||':conversation',data->>'note',data->>'channel',null,null,happened);

  elsif cmd='schedule_task' then
   next_spec:=data->'task';
   if t.id is null then tid:=crm_security.new_task(l,next_spec,source||':task');
   else
    if jsonb_typeof(next_spec) is distinct from 'object' or next_spec-array['due_at','instructions']<>'{}'::jsonb then raise exception 'Reschedule accepts due_at and instructions only' using errcode='22023'; end if;
    due:=(next_spec->>'due_at')::timestamptz;
    if due is null or not isfinite(due) or due<now() then raise exception 'Future due time required' using errcode='22023'; end if;
    if t.task_type in ('first_contact','contact_attempt','callback') then due:=crm_security.next_window(l.followup_policy_id,due); end if;
    if length(next_spec->>'instructions')>4000 then raise exception 'Instructions too long' using errcode='22023'; end if;
    update public.crm_tasks set due_at=due,scheduled_end_at=null,instructions=case when next_spec ? 'instructions' then next_spec->>'instructions' else instructions end,
     updated_at=now(),version=version+1 where id=t.id;
    perform crm_security.event(l.id,'task_rescheduled',source||':rescheduled',data->>'note',null,null,t.id);
   end if;

  elsif cmd in ('complete_task','cancel_task') then
   if cmd='complete_task' then
    if t.task_type in ('first_contact','contact_attempt','callback') then raise exception 'Complete call tasks through record_call_outcome' using errcode='22023'; end if;
    if nullif(btrim(data->>'outcome'),'') is null or length(data->>'outcome')>200 then raise exception 'Completion outcome required' using errcode='22023'; end if;
    perform crm_security.finish_task(t,false,data->>'outcome',source||':complete');
   else perform crm_security.finish_task(t,true,data->>'reason',source||':cancel'); end if;
   needs_next:=true;

  elsif cmd='qualify_lead' then
   if l.status not in ('NEW','CONTACTING','ENGAGED') then raise exception 'Lead must be unqualified and active' using errcode='22023'; end if;
   if data->>'conversation_channel' is not null then
    if data->>'conversation_channel' not in ('phone','whatsapp','in_person') or nullif(btrim(data->>'note'),'') is null then raise exception 'Conversation evidence required' using errcode='22023'; end if;
    perform crm_security.event(l.id,'conversation_recorded',source||':conversation',data->>'note',data->>'conversation_channel');
    meaningful:=true;
   elsif l.last_conversation_at is null or not exists(select 1 from public.crm_activities where lead_id=l.id and event_type in ('conversation_recorded','whatsapp_conversation')) then
    raise exception 'Qualification requires meaningful conversation evidence' using errcode='22023';
   end if;
   target:=data->>'qualification_step';
   if target is null or target not in ('placement_test','center_visit','enrollment','other') or (target='other' and nullif(btrim(data->>'note'),'') is null) then raise exception 'Valid qualification step and explanation required' using errcode='22023'; end if;
   if data->'next_task' is null or data->'next_task'='null'::jsonb then raise exception 'Qualification next task required' using errcode='22023'; end if;
   if (target='placement_test' and data->'next_task'->>'task_type' is distinct from 'confirm_placement_test')
    or (target='center_visit' and data->'next_task'->>'task_type' is distinct from 'center_visit')
    or (target='enrollment' and data->'next_task'->>'task_type' is distinct from 'enrollment_followup') then raise exception 'Task must match qualification step' using errcode='22023'; end if;
   l.qualification_step:=target;

  elsif cmd in ('close_lost','close_not_qualified') then
   reason:=data->>'reason'; target:=case when cmd='close_lost' then 'LOST' else 'NOT_QUALIFIED' end;
   if reason is null or (target='LOST' and reason<>all(array['unreachable','not_interested','price','schedule','location','chose_competitor','postponed','other']))
    or (target='NOT_QUALIFIED' and reason<>all(array['age_not_suitable','program_not_suitable','invalid_spam','duplicate','outside_scope','other']))
    or (reason='other' and nullif(btrim(data->>'note'),'') is null) then raise exception 'Valid closure reason and explanation required' using errcode='22023'; end if;
   if reason='unreachable' and (l.status not in ('CONTACTING','ENGAGED','QUALIFIED') or crm_security.failed_count(l)<5) then raise exception 'Unreachable requires five current-cycle failed phone calls' using errcode='22023'; end if;
   perform crm_security.event(l.id,case when target='LOST' then 'lead_lost' else 'lead_not_qualified' end,source||':closed',data->>'note',null,reason,null,null,null,null,l.status,target);
   l.status:=target;l.closure_reason:=reason;l.closure_note:=data->>'note';l.closed_at:=now();
   perform crm_security.cancel_tasks(l.id,'Lead closed: '||reason,source||':cancel');

  elsif cmd='reopen_lead' then
   if l.status not in ('LOST','NOT_QUALIFIED') or nullif(btrim(data->>'reason'),'') is null then raise exception 'Closed lead and reopen reason required' using errcode='22023'; end if;
   l.status:=case when exists(select 1 from public.crm_activities where lead_id=l.id and event_type in ('conversation_recorded','whatsapp_conversation')) then 'ENGAGED' else 'CONTACTING' end;
   l.outreach_cycle:=l.outreach_cycle+1;l.outreach_anchor_date:=null;l.last_attempt_at:=null;
   l.closure_reason:=null;l.closure_note:=null;l.closed_at:=null;l.qualification_step:=null;
   if data->'next_task' is null or data->'next_task'='null'::jsonb then raise exception 'Explicit reopen task required' using errcode='22023'; end if;
   perform crm_security.event(l.id,'lead_reopened',source||':reopened',data->>'reason',null,null,null,null,null,null,initial_status,l.status);
   needs_next:=true;

  elsif cmd='reassign' then
   if not(data ? 'owner_id') and not(data ? 'assigned_to') then raise exception 'Explicit reassignment required' using errcode='22023'; end if;
   if data ? 'owner_id' then
    perform crm_security.assert_staff((data->>'owner_id')::uuid);l.owner_id:=(data->>'owner_id')::uuid;
    perform crm_security.event(l.id,'lead_reassigned',source||':lead-owner',data->>'note');
   end if;
   if data ? 'assigned_to' then
    if t.id is null then raise exception 'Task required for task reassignment' using errcode='22023'; end if;
    perform crm_security.assert_staff((data->>'assigned_to')::uuid);
    update public.crm_tasks set assigned_to=(data->>'assigned_to')::uuid,version=version+1,updated_at=now() where id=t.id;
    perform crm_security.event(l.id,'task_reassigned',source||':task-owner',data->>'note',null,null,t.id);
   end if;
  end if;

  if meaningful then
   if happened<greatest(l.last_conversation_at,l.last_attempt_at) then
    raise exception 'Conversation predates the latest outreach evidence' using errcode='22023'; end if;
   l.last_conversation_at:=happened;
   -- A conversation interrupts outreach even for an already qualified lead.
   l.outreach_cycle:=l.outreach_cycle+1;l.outreach_anchor_date:=null;l.last_attempt_at:=null;
   if l.status in ('NEW','CONTACTING') then
    perform crm_security.event(l.id,'lead_engaged',source||':engaged',null,null,null,null,null,null,null,l.status,'ENGAGED');
    l.status:='ENGAGED';
   end if;
   perform crm_security.cancel_tasks(l.id,'Meaningful conversation ended outreach',source||':cancel-attempt',true);
   needs_next:=true;
  end if;
  if cmd='qualify_lead' then
   perform crm_security.event(l.id,'lead_qualified',source||':qualified',data->>'note',null,null,null,null,null,null,'ENGAGED','QUALIFIED');
   l.status:='QUALIFIED';needs_next:=true;
  end if;
  if data ? 'next_task' and data->'next_task'<>'null'::jsonb then tid:=crm_security.new_task(l,data->'next_task',source||':next-task'); end if;
  if needs_next and not exists(select 1 from public.crm_tasks where lead_id=l.id and status='open') then raise exception 'Active lead requires a next actionable task' using errcode='22023'; end if;
  update public.crm_leads set status=l.status,owner_id=l.owner_id,qualification_step=l.qualification_step,
   closure_reason=l.closure_reason,closure_note=l.closure_note,closed_at=l.closed_at,outreach_cycle=l.outreach_cycle,
   outreach_anchor_date=l.outreach_anchor_date,last_attempt_at=l.last_attempt_at,last_conversation_at=l.last_conversation_at,
   version=version+1,updated_at=now() where id=l.id;
  result:=crm_security.result(l.id,source);
 end if;
 insert into public.crm_command_requests(actor_scope,command_name,request_key,payload_hash,result) values(actor::text,cmd,request,digest,result);
 return result;
exception
 when deadlock_detected then raise exception 'Concurrent CRM change; refresh and retry' using errcode='40001';
 when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range or check_violation then
  raise exception 'Invalid CRM command input' using errcode='22023';
end $function$;

CREATE OR REPLACE FUNCTION public.crm_save_meta_connection(p_data jsonb, p_id uuid DEFAULT NULL::uuid, p_version bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$ declare c public.crm_integration_connections; r jsonb; old_enabled boolean; new_enabled boolean; lookback integer; begin
 perform crm_security.lifecycle_barrier(true);
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
end $function$;

CREATE OR REPLACE FUNCTION public.crm_save_website_connection(p_data jsonb, p_id uuid DEFAULT NULL::uuid, p_version bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$ declare c public.crm_integration_connections;begin
 perform crm_security.lifecycle_barrier(true);
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
 end if;return to_jsonb(c)-array['lifecycle_settings','lifecycle_destination_id','insights_settings'];
end $function$;

CREATE OR REPLACE FUNCTION public.crm_publish_meta_form_mapping(p_connection uuid, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$ declare m public.crm_form_mappings;kv record;n integer;begin
 perform crm_security.lifecycle_barrier(true);
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
end $function$;

CREATE OR REPLACE FUNCTION public.crm_publish_website_form_mapping(p_connection uuid, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$ declare m public.crm_form_mappings;kv record;n integer;begin
 perform crm_security.lifecycle_barrier(true);
 perform crm_security.require_reader(true);
 if jsonb_typeof(p_data) is distinct from 'object' or p_data-array['form_key','form_name','field_map','question_labels','default_session_type','default_program_interest_text','effective_from','learner_policy']<>'{}' then raise exception 'Invalid mapping fields' using errcode='22023'; end if;
 if p_data ? 'learner_policy' and (jsonb_typeof(p_data->'learner_policy') is distinct from 'string' or p_data->>'learner_policy' not in ('required','optional')) then raise exception 'Invalid learner policy' using errcode='22023'; end if;
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
 insert into public.crm_form_mappings(channel,connection_id,form_key,version,form_name,field_map,question_labels,default_session_type,default_program_interest_text,effective_from,created_by,learner_policy)
 values('website',p_connection,p_data->>'form_key',n,p_data->>'form_name',p_data->'field_map',coalesce(p_data->'question_labels','{}'),p_data->>'default_session_type',p_data->>'default_program_interest_text',coalesce((p_data->>'effective_from')::timestamptz,now()),auth.uid(),coalesce(p_data->>'learner_policy','required')) returning * into m;
 return to_jsonb(m);
end $function$;

CREATE OR REPLACE FUNCTION public.crm_retire_meta_form_mapping(p_mapping uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$ begin
 perform crm_security.lifecycle_barrier(true);
 perform crm_security.require_reader(true);
 update public.crm_form_mappings set retired_at=greatest(clock_timestamp(),effective_from+interval '1 microsecond') where id=p_mapping and retired_at is null;
 if not found then raise exception 'Active mapping required' using errcode='22023'; end if;
end $function$;

CREATE OR REPLACE FUNCTION public.crm_cleanup_lifecycle_retention(p_limit integer default 100) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare expired uuid[];payload_ids uuid[];attempt_ids uuid[];delivery_ids uuid[];grant_ids uuid[];revoke_ids uuid[];check_ids uuid[];
 scopes jsonb;r public.crm_external_deliveries;n integer;terminated integer:=0;payloads integer:=0;attempts integer:=0;evidence integer:=0;checks integer:=0;
begin
 perform crm_security.require_meta_worker();perform crm_security.lifecycle_barrier(true);
 if p_limit is null or p_limit not between 1 and 500 then raise exception 'Invalid cleanup limit' using errcode='22023';end if;
 -- Every candidate set is discovered before advisory/row locks. Each D6 pass
 -- is bounded, and references for selected native state enter ranks 1/2 first.
 select array_agg(id) into expired from (
  select id from public.crm_external_deliveries where status in ('pending','blocked','retry','unknown','sending') and terminal_at is null
   and not (status='sending' and lease_until>clock_timestamp())
   and ((send_deadline is not null and send_deadline<=clock_timestamp())
    or exists(select 1 from public.crm_lifecycle_activation_epochs ep where ep.id=activation_epoch_id and ep.ended_at is not null)
    or (lifecycle_model='r4_stage_entry' and status='sending' and lease_until<=clock_timestamp())
    or (delivery_mode in ('mock','mock_legacy') and created_at<=clock_timestamp()-interval '90 days'))
  order by updated_at,id limit p_limit) x;
 select array_agg(id) into payload_ids from (select id from public.crm_external_deliveries
  where terminal_at<=clock_timestamp()-interval '30 days' and payload_erased_at is null order by terminal_at,id limit p_limit) x;
 select array_agg(id) into attempt_ids from (select id from public.crm_external_delivery_attempts
  where finished_at<=clock_timestamp()-interval '90 days' and diagnostics_erased_at is null order by finished_at,id limit p_limit) x;
 select array_agg(distinct id) into delivery_ids from public.crm_external_deliveries where id=any(coalesce(expired,'{}'))
  or id=any(coalesce(payload_ids,'{}')) or id in(select delivery_id from public.crm_external_delivery_attempts where id=any(coalesce(attempt_ids,'{}')));
 select coalesce(jsonb_agg(jsonb_build_object('lead',lead_id,'connection',connection_id)),'[]') into scopes from public.crm_external_deliveries where id=any(coalesce(delivery_ids,'{}'));
 select array_agg(id) into grant_ids from (
  select ge.id from public.crm_lifecycle_eligibility_evidence ge where ge.event_type='grant' and ge.redacted_at is null and (
   (exists(select 1 from public.crm_external_deliveries dd where dd.eligibility_evidence_id=ge.id)
    and not exists(select 1 from public.crm_external_deliveries dd where dd.eligibility_evidence_id=ge.id and (dd.terminal_at is null or dd.terminal_at>clock_timestamp()-interval '90 days')))
   or (not exists(select 1 from public.crm_external_deliveries dd where dd.eligibility_evidence_id=ge.id)
    and (select least(pp.effective_until,coalesce(pp.retired_at,pp.effective_until),
      ge.recorded_at+make_interval(secs=>coalesce((cc.lifecycle_settings->>'maximum_event_age_seconds')::integer,7776000)),
      coalesce((select min(rv.effective_at) from public.crm_lifecycle_eligibility_evidence rv where rv.supersedes_evidence_id=ge.id and rv.event_type='revoke'),pp.effective_until))
     from public.crm_lifecycle_eligibility_policies pp join public.crm_integration_connections cc on cc.id=pp.connection_id where pp.id=ge.policy_id)<=clock_timestamp()-interval '90 days'))
  order by ge.recorded_at,ge.id limit p_limit) x;
 select array_agg(id) into revoke_ids from (select id from public.crm_lifecycle_eligibility_evidence where supersedes_evidence_id=any(coalesce(grant_ids,'{}')) and redacted_at is null order by id limit p_limit) x;
 select array_agg(distinct id) into check_ids from (
  (select ck.id from public.crm_lifecycle_eligibility_checks ck join public.crm_lifecycle_eligibility_policies pp on pp.id=ck.policy_id
   where not ck.eligible and ck.redacted_at is null and least(pp.effective_until,coalesce(pp.retired_at,pp.effective_until))<=clock_timestamp()-interval '90 days'
   order by ck.checked_at,ck.id limit p_limit)
  union select ck.id from public.crm_lifecycle_eligibility_checks ck join public.crm_lifecycle_eligibility_evidence ge on ge.policy_id=ck.policy_id and ge.submission_id=ck.submission_id
   where ge.id=any(coalesce(grant_ids,'{}')) and ck.redacted_at is null) x;
 perform crm_security.lifecycle_scope_keys(scopes);perform crm_security.lifecycle_scope_rows(scopes,false);
 perform 1 from public.crm_lifecycle_eligibility_checks where id=any(coalesce(check_ids,'{}')) order by id for update;
 perform 1 from public.crm_lifecycle_eligibility_evidence where id=any(coalesce(grant_ids,'{}')) or id=any(coalesce(revoke_ids,'{}')) order by id for update;
 perform 1 from public.crm_external_deliveries where id=any(coalesce(delivery_ids,'{}')) order by id for update;
 perform 1 from public.crm_external_delivery_attempts where id=any(coalesce(attempt_ids,'{}')) or delivery_id=any(coalesce(expired,'{}')) order by delivery_id,attempt_number,id for update;
 -- Mutations below only use these complete prelocked sets. No lower-ranked
 -- advisory acquisition or discovery occurs after the first row lock.
 for r in select * from public.crm_external_deliveries where id=any(coalesce(expired,'{}')) order by id loop
  if r.status='sending' then
   update public.crm_external_delivery_attempts set outcome='unknown',finished_at=clock_timestamp(),error_code='lease_expired'
    where delivery_id=r.id and finished_at is null;
  end if;
  update public.crm_external_deliveries set status=case when r.lifecycle_model='r4_stage_entry' and r.attempt_boundary_state in ('started','unknown') then 'unknown' else 'suppressed' end,terminal_at=coalesce(terminal_at,clock_timestamp()),lease_token=null,lease_until=null,next_attempt_at=null,
   attempt_boundary_state=case when lifecycle_model='r4_stage_entry' and attempt_boundary_state='started' then 'unknown' else attempt_boundary_state end,
   last_error_code=case when r.lifecycle_model='r4_stage_entry' and r.attempt_boundary_state='started' then 'lease_expired_after_dispatch'
    when r.send_deadline is not null and r.send_deadline<=clock_timestamp() then 'provider_age_expired'
    when r.delivery_mode in ('mock','mock_legacy') then 'retention_expired' else 'activation_ended' end,updated_at=now() where id=r.id;
  terminated:=terminated+1;
 end loop;
 update public.crm_external_deliveries set payload=null,payload_hash=null,matching_submission_id=null,payload_erased_at=clock_timestamp(),updated_at=now()
  where id=any(coalesce(payload_ids,'{}'));get diagnostics payloads=row_count;
 update public.crm_external_delivery_attempts set started_at=null,finished_at=null,outcome=null,http_status=null,provider_request_id=null,
  response_summary=null,error_code=null,diagnostics_erased_at=clock_timestamp() where id=any(coalesce(attempt_ids,'{}'));get diagnostics attempts=row_count;
 update public.crm_lifecycle_eligibility_checks set submission_id=null,evidence_digest=null,redacted_at=clock_timestamp() where id=any(coalesce(check_ids,'{}'));get diagnostics checks=row_count;
 update public.crm_lifecycle_eligibility_evidence set submission_id=null,source_external_id=null,source_projection=null,redacted_at=clock_timestamp()
  where id=any(coalesce(revoke_ids,'{}'));get diagnostics evidence=row_count;
 -- Finish large revocation families in bounded passes; grant redaction cannot
 -- strand unredacted child audit details or remove a stop/uncertainty marker.
 update public.crm_lifecycle_eligibility_evidence ge set submission_id=null,source_external_id=null,source_projection=null,redacted_at=clock_timestamp()
  where ge.id=any(coalesce(grant_ids,'{}')) and not exists(select 1 from public.crm_lifecycle_eligibility_evidence rv where rv.supersedes_evidence_id=ge.id and rv.redacted_at is null);
 get diagnostics n=row_count;evidence:=evidence+n;
 return jsonb_build_object('terminated',terminated,'payloads_erased',payloads,'attempts_erased',attempts,'checks_erased',checks,'evidence_erased',evidence);
end $$;

create function public.crm_cleanup_lifecycle_stop_audit(p_limit integer default 100) returns integer
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
 perform crm_security.require_meta_worker();perform crm_security.lifecycle_barrier(true);
 if p_limit is null or p_limit not between 1 and 500 then raise exception 'Invalid audit cleanup limit' using errcode='22023';end if;
 return crm_security.lifecycle_cleanup_stop_audit(p_limit);
end $$;

-- Safe deferred-review retrieval: opaque CRM scope only, no request/proof data.
create function public.crm_list_pending_lifecycle_stops(p_limit integer default 25,p_offset integer default 0) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare result jsonb;
begin
 perform crm_security.require_reader(true);
 if p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset<0 then
  raise exception 'Invalid pending-stop page' using errcode='22023';end if;
 select jsonb_build_object('total',(select count(*) from public.crm_lifecycle_sharing_stops t
  where t.scope='submission_pending' and not exists(select 1 from public.crm_lifecycle_stop_handoffs h where h.pending_stop_id=t.id)),
  'rows',coalesce(jsonb_agg(to_jsonb(x) order by x.effective_at,x.id),'[]'::jsonb)) into result from (
  select t.id,t.pending_submission_id,t.connection_id,t.reason_class,t.effective_at,i.scope_intent
  from public.crm_lifecycle_sharing_stops t join public.crm_lifecycle_pending_intents i on i.stop_id=t.id
  where t.scope='submission_pending' and not exists(select 1 from public.crm_lifecycle_stop_handoffs h where h.pending_stop_id=t.id)
  order by t.effective_at,t.id limit p_limit offset p_offset
 ) x;
 return result;
end $$;

revoke all on all functions in schema crm_security from public,anon,authenticated,service_role;
revoke all on function public.crm_claim_lifecycle_evidence(integer,text) from public,anon,authenticated,service_role;
grant execute on function public.crm_claim_lifecycle_evidence(integer,text) to service_role;
revoke all on function public.crm_stop_lifecycle_sharing(uuid,text,uuid,uuid,text,uuid,text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.crm_stop_lifecycle_sharing(uuid,text,uuid,uuid,text,uuid,text,boolean) to authenticated;
revoke all on function public.crm_bind_pending_lifecycle_stop(uuid,uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.crm_bind_pending_lifecycle_stop(uuid,uuid,uuid,uuid,text) to authenticated;
revoke all on function public.crm_cleanup_lifecycle_stop_audit(integer) from public,anon,authenticated,service_role;
grant execute on function public.crm_cleanup_lifecycle_stop_audit(integer) to service_role;
revoke all on function public.crm_list_pending_lifecycle_stops(integer,integer) from public,anon,authenticated,service_role;
grant execute on function public.crm_list_pending_lifecycle_stops(integer,integer) to authenticated;
notify pgrst,'reload schema';
commit;
