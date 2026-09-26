-- Permit unnamed learners for reviewed website general/adult forms while retaining named-learner matching.
begin;
-- Only these website forms intentionally accept an inquiry without a distinct learner.
-- Parent campaigns and Meta intake retain their existing learner requirement.
create or replace function crm_security.website_learner_optional(p_submission uuid) returns boolean
language sql stable set search_path=pg_catalog,pg_temp as $$
 select exists(select 1 from public.crm_submissions s join public.crm_form_mappings m on m.id=s.form_mapping_id
  where s.id=p_submission and s.channel='website' and m.channel='website'
   and m.form_key in ('general_contact_v1','campaign_adult_lead_v1'))
$$;

create or replace function crm_security.accept_external_submission(sid uuid,contact uuid default null,lead uuid default null) returns uuid
language plpgsql set search_path=pg_catalog,pg_temp as $$ declare s public.crm_submissions;l public.crm_leads;p public.crm_followup_policies;
 d jsonb;due timestamptz;tid uuid;actor_kind text:=case when auth.uid() is null then 'integration' else 'user' end;begin
 select * into strict s from public.crm_submissions where id=sid for update;
 if s.match_status<>'needs_review' then raise exception 'Unresolved intake required' using errcode='40001';end if;
 d:=s.core_fields;
 if lead is null then
  select * into p from public.crm_followup_policies where effective_from<=now() and (retired_at is null or retired_at>now()) order by version desc limit 1;
  if not found then raise exception 'missing_policy' using errcode='P0001';end if;
  if nullif(btrim(d->>'contact_name'),'') is null or nullif(btrim(d->>'program_interest_text'),'') is null
   or (nullif(btrim(d->>'learner_name'),'') is null and not crm_security.website_learner_optional(s.id))
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
 return l.id;
end $$;
create or replace function crm_security.resolve_external_submission(sid uuid) returns uuid language plpgsql set search_path=pg_catalog,pg_temp as $$
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
 elsif crm_security.website_learner_optional(s.id) and nullif(btrim(d->>'learner_name'),'') is null
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
end $$;
create or replace function public.crm_list_intake_review(p_limit integer default 25,p_offset integer default 0) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$ declare result jsonb;begin
 perform crm_security.require_reader();perform crm_security.check_page(p_limit,p_offset);
 select jsonb_build_object('total',(select count(*) from public.crm_submissions s join public.crm_ingestion_jobs j on j.submission_id=s.id where s.match_status='needs_review' and j.status='done'),
 'rows',coalesce(jsonb_agg(jsonb_build_object('id',s.id,'received_at',s.received_at,'contact_name',s.core_fields->>'contact_name','phone',s.core_fields->>'phone','email',s.core_fields->>'email',
 'learner_name',s.core_fields->>'learner_name','program_interest_text',s.core_fields->>'program_interest_text',
 'learner_optional',crm_security.website_learner_optional(s.id),
 'contact_candidates',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'version',c.version,'name',c.display_name)) from (select id,version,display_name from public.crm_contacts where merged_into_contact_id is null and ((phone_e164 is not null and phone_e164=crm_security.normalize_phone(s.core_fields->>'phone')) or (email_normalized is not null and email_normalized=lower(btrim(s.core_fields->>'email')))) order by id limit 25)c),'[]'::jsonb),'answers',crm_security.operational_answers(s.form_answers),
 'candidates',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'version',l.version,'contact_id',l.contact_id,'contact_name',c.display_name,'learner_name',l.learner_name,'program',l.program_interest_text)) from public.crm_leads l join public.crm_contacts c on c.id=l.contact_id where l.id=any(s.candidate_lead_ids) and l.status in ('NEW','CONTACTING','ENGAGED','QUALIFIED') and l.merged_into_lead_id is null),'[]'::jsonb)) order by s.received_at,s.id),'[]')) into result
 from (select s.* from public.crm_submissions s join public.crm_ingestion_jobs j on j.submission_id=s.id where s.match_status='needs_review' and j.status='done' order by s.received_at,s.id limit p_limit offset p_offset)s;
 return result;
end $$;
revoke all on all functions in schema crm_security from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
