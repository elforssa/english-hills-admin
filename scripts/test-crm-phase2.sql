-- Local Supabase only. Synthetic records and all changes roll back.
\set ON_ERROR_STOP on
begin;
create function pg_temp.check_true(ok boolean,label text) returns void language plpgsql as $$ begin
 if ok is not true then raise exception 'FAIL: %',label; end if;
end $$;
create function pg_temp.rejects(statement text, expected text) returns void language plpgsql as $$ begin
 begin
  execute statement;
  set constraints all immediate;
 exception when others then
  if sqlstate=expected then return; end if;
  raise exception 'Unexpected SQLSTATE %, expected %: %',sqlstate,expected,sqlerrm;
 end;
 raise exception 'Expected rejection %: %',expected,statement;
end $$;

-- Assert the eight Phase 2 tables explicitly; later phases may add protected tables.
select pg_temp.check_true((select count(*)=8 and bool_and(relrowsecurity)
 from pg_class where relnamespace='public'::regnamespace and relkind='r' and relname in ('crm_contacts','crm_leads','crm_submissions','crm_submission_attribution','crm_activities','crm_tasks','crm_command_requests','crm_followup_policies')),'eight tables with RLS');
select pg_temp.check_true((select count(*)=8 from pg_constraint where contype='p'
 and conrelid in (select oid from pg_class where relnamespace='public'::regnamespace and relname in ('crm_contacts','crm_leads','crm_submissions','crm_submission_attribution','crm_activities','crm_tasks','crm_command_requests','crm_followup_policies'))),'eight primary keys');
select pg_temp.check_true((select count(*)>=35 from pg_constraint where contype='f'
 and conrelid in (select oid from pg_class where relnamespace='public'::regnamespace and relname like 'crm_%')),'business foreign keys');
select pg_temp.check_true((select count(*)>=40 from pg_constraint where contype='c'
 and conrelid in (select oid from pg_class where relnamespace='public'::regnamespace and relname like 'crm_%')),'check constraints');
select pg_temp.check_true((select count(*)=7 from pg_indexes where schemaname='public' and indexname in
 ('crm_tasks_open_owner_idx','crm_tasks_open_lead_idx','crm_tasks_attempt_key','crm_activities_timeline_idx',
 'crm_activities_attempt_key','crm_leads_strict_match_key','crm_attribution_external_key')),'required query and uniqueness indexes');
select pg_temp.check_true(not exists(select 1 from pg_extension where extname in ('pg_trgm','pg_cron')),'no new extension dependency');
do $$ declare t text; r text; begin
 foreach t in array array['crm_contacts','crm_leads','crm_submissions','crm_submission_attribution','crm_activities','crm_tasks','crm_command_requests','crm_followup_policies'] loop
  foreach r in array array['anon','authenticated','service_role'] loop
   perform pg_temp.check_true(not has_table_privilege(r,'public.'||t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),t||' grants '||r);
  end loop;
 end loop;
end $$;

insert into auth.users(id,email,aud,role,created_at,updated_at)
select ('78000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'phase2-'||i||'@example.invalid','authenticated','authenticated',now(),now()
from generate_series(1,7) i;
update public.profiles set role=(array['director','admin','receptionist','teacher','parent','student','pending'])[right(id::text,1)::integer]
where id::text like '78000000-%';
-- Deliberately synthetic empty windows; no active policy is seeded by migrations.
insert into public.crm_followup_policies(id,version,weekly_hours,date_exceptions,stale_contacting_minutes,effective_from,created_by)
values ('78000000-0000-0000-0000-000000000010',1,'{}','[]',1440,now(),'78000000-0000-0000-0000-000000000001');
insert into public.crm_contacts(id,contact_kind,display_name,phone_e164) values
 ('78000000-0000-0000-0000-000000000011','guardian','Synthetic contact','+212600000000'),
 ('78000000-0000-0000-0000-000000000012','adult_learner','Shared family phone','+212600000000');
-- Lead-first insertion proves required circular relationships are not impossible.
insert into public.crm_leads(id,contact_id,first_submission_id,latest_submission_id,followup_policy_id,learner_name,created_at,strict_match_key)
values
 ('78000000-0000-0000-0000-000000000021','78000000-0000-0000-0000-000000000011','78000000-0000-0000-0000-000000000031','78000000-0000-0000-0000-000000000031','78000000-0000-0000-0000-000000000010','Learner one','2026-01-01','synthetic-one'),
 ('78000000-0000-0000-0000-000000000022','78000000-0000-0000-0000-000000000011','78000000-0000-0000-0000-000000000032','78000000-0000-0000-0000-000000000032','78000000-0000-0000-0000-000000000010','Learner two','2026-01-02','synthetic-two');
insert into public.crm_submissions(id,lead_id,channel,received_at,occurred_at,time_source,core_fields,form_answers,source_label,match_status,resolved_at,payload_hash)
values
 ('78000000-0000-0000-0000-000000000031','78000000-0000-0000-0000-000000000021','meta_instant_form',now(),now(),'provider','{"campaign_id":"SECRET_TECH"}',
 '[{"key":"technical","label":"Provider answer","value":"SECRET_TECH","value_type":"string","label_source":"provider"}]','Open day','resolved',now(),repeat('a',64)),
 ('78000000-0000-0000-0000-000000000032','78000000-0000-0000-0000-000000000022','manual',now(),now(),'server','{}','[]','Walk in','resolved',now(),repeat('b',64)),
 ('78000000-0000-0000-0000-000000000033',null,'website',now(),now(),'client','{}','[]','Website','needs_review',null,repeat('c',64)),
 ('78000000-0000-0000-0000-000000000034','78000000-0000-0000-0000-000000000021','manual',now(),now(),'server','{}','[]','Repeat inquiry','resolved',now(),repeat('d',64));
update public.crm_leads set latest_submission_id='78000000-0000-0000-0000-000000000034' where id='78000000-0000-0000-0000-000000000021';
insert into public.crm_submission_attribution(submission_id,provider,external_scope,external_submission_id,campaign_id,raw_payload,fbclid,fbc,fbp,attribution_status)
values ('78000000-0000-0000-0000-000000000031','meta','scope','900719925474099399999','SECRET_TECH','{"raw_payload":"SECRET_TECH"}','SECRET_TECH','SECRET_TECH','SECRET_TECH','partial');
insert into public.crm_activities(id,lead_id,occurred_at,actor_kind,event_type,source_key,task_id,outreach_cycle,attempt_ordinal)
values
 ('78000000-0000-0000-0000-000000000041','78000000-0000-0000-0000-000000000021','2026-01-01','system','test_note','phase2-a1','78000000-0000-0000-0000-000000000051',1,1),
 ('78000000-0000-0000-0000-000000000042','78000000-0000-0000-0000-000000000021','2026-01-01','system','test_note','phase2-a2',null,null,null);
insert into public.crm_tasks(id,lead_id,task_type,due_at,source_kind,source_key,source_activity_id,outreach_cycle,attempt_ordinal,policy_id)
values
 ('78000000-0000-0000-0000-000000000051','78000000-0000-0000-0000-000000000021','contact_attempt','2026-01-03','attempt_sequence','phase2-t1','78000000-0000-0000-0000-000000000041',1,1,'78000000-0000-0000-0000-000000000010'),
 ('78000000-0000-0000-0000-000000000052','78000000-0000-0000-0000-000000000021','callback','2026-01-02','manual','phase2-t2',null,null,null,null);
insert into public.crm_command_requests(actor_scope,command_name,request_key,payload_hash,result)
values('synthetic','fixture',gen_random_uuid(),repeat('a',64),'{"raw_payload":"SECRET_TECH"}');
set constraints all immediate;
set constraints all deferred;
\echo PASS schema, grants, shared phones, unresolved submissions and circular insertion

select pg_temp.rejects($q$update public.crm_contacts set merged_into_contact_id=id$q$,'23514');
select pg_temp.rejects($q$update public.crm_contacts set phone_e164='0600000000'$q$,'23514');
select pg_temp.rejects($q$update public.crm_leads set status='INVALID'$q$,'23514');
select pg_temp.rejects($q$update public.crm_leads set contact_id=gen_random_uuid()$q$,'23503');
select pg_temp.rejects($q$update public.crm_leads set owner_id=gen_random_uuid()$q$,'23503');
select pg_temp.rejects($q$update public.crm_leads set closure_reason='price'$q$,'23514');
select pg_temp.rejects($q$update public.crm_leads set status='LOST',closed_at=now(),closure_reason='invalid_spam'$q$,'23514');
select pg_temp.rejects($q$update public.crm_leads set status='NOT_QUALIFIED',closed_at=now(),closure_reason='price'$q$,'23514');
select pg_temp.rejects($q$update public.crm_leads set status='LOST',closed_at=now(),closure_reason='other',closure_note=' '$q$,'23514');
select pg_temp.rejects($q$update public.crm_leads set status='LOST',closed_at=now(),closure_reason=null$q$,'23514');
select pg_temp.rejects($q$update public.crm_leads set status='CONVERTED'$q$,'23514');
select pg_temp.rejects($q$update public.crm_leads set strict_match_key='duplicate-key'$q$,'23505');
select pg_temp.rejects($q$update public.crm_leads set first_submission_id='78000000-0000-0000-0000-000000000034'$q$,'42501');
select pg_temp.rejects($q$update public.crm_leads set latest_submission_id='78000000-0000-0000-0000-000000000032' where id='78000000-0000-0000-0000-000000000021'$q$,'23503');
-- Closed reasons and "other" notes are structurally valid with complete evidence.
savepoint closure_cases;
update public.crm_leads set status='LOST',closed_at=now(),closure_reason='price';
update public.crm_leads set status='NOT_QUALIFIED',closure_reason='age_not_suitable';
update public.crm_leads set closure_reason='other',closure_note='Synthetic reason';
rollback to closure_cases;
select pg_temp.rejects($q$update public.crm_submissions set core_fields='{"changed":true}' where match_status='resolved'$q$,'42501');
select pg_temp.rejects($q$update public.crm_submissions set form_answers='[]' where id='78000000-0000-0000-0000-000000000031'$q$,'42501');
select pg_temp.rejects($q$insert into public.crm_submissions(channel,received_at,occurred_at,time_source,core_fields,form_answers,source_label,match_status,payload_hash)
 values('manual',now(),now(),'server','{}','[{"key":"x"}]','test','needs_review',repeat('a',64))$q$,'23514');
select pg_temp.rejects($q$insert into public.crm_submissions(channel,received_at,occurred_at,time_source,core_fields,form_answers,source_label,match_status,payload_hash)
 values('manual',now(),now(),'server','{}','[{"key":"x","label":"x","value":1,"value_type":"string","label_source":"manual"}]','test','needs_review',repeat('a',64))$q$,'23514');
select pg_temp.rejects($q$insert into public.crm_submission_attribution(submission_id,provider,external_scope,external_submission_id,attribution_status)
 values('78000000-0000-0000-0000-000000000032','meta','scope','900719925474099399999','partial')$q$,'23505');
select pg_temp.rejects($q$update public.crm_submission_attribution set campaign_id='overwrite'$q$,'42501');
update public.crm_submission_attribution set form_id='enriched-missing-field';
-- Retention transitions preserve every durable field and cannot be reversed.
savepoint attribution_redaction;
update public.crm_submission_attribution set campaign_name_snapshot='Annual English September',
 consent_evidence='{"synthetic":true}';
select pg_temp.check_true((select campaign_name_snapshot='Annual English September' from public.crm_submission_attribution),'missing snapshot enrichment');
select pg_temp.rejects($q$update public.crm_submission_attribution set campaign_name_snapshot='Different Campaign'$q$,'42501');
select pg_temp.rejects($q$update public.crm_submission_attribution set external_submission_id='different'$q$,'42501');
select pg_temp.rejects($q$update public.crm_submission_attribution set external_scope='different'$q$,'42501');
do $$ declare c text; begin
 foreach c in array array['raw_payload','fbclid','fbc','fbp','consent_evidence'] loop
  perform pg_temp.rejects(format('update public.crm_submission_attribution set %I=null',c),'42501');
 end loop;
end $$;
select pg_temp.rejects($q$update public.crm_submission_attribution set redacted_at=now()$q$,'42501');
select pg_temp.rejects($q$update public.crm_submission_attribution set raw_payload=null,fbclid=null,fbc=null,fbp=null,consent_evidence=null,redacted_at=now(),campaign_id='replacement'$q$,'42501');
select pg_temp.rejects($q$update public.crm_submission_attribution set raw_payload=null,fbclid=null,fbc=null,fbp=null,consent_evidence=null,redacted_at=now(),ad_id='simultaneous enrichment'$q$,'42501');
select pg_temp.rejects($q$update public.crm_submission_attribution set raw_payload='null'::jsonb,fbclid=null,fbc=null,fbp=null,consent_evidence=null,redacted_at=now()$q$,'42501');
update public.crm_submission_attribution set raw_payload=null,fbclid=null,fbc=null,fbp=null,consent_evidence=null,redacted_at=now();
select pg_temp.check_true((select raw_payload is null and fbclid is null and fbc is null and fbp is null
 and consent_evidence is null and redacted_at is not null and campaign_id='SECRET_TECH'
 and campaign_name_snapshot='Annual English September' and external_submission_id='900719925474099399999'
 from public.crm_submission_attribution),'redaction clears all five sensitive fields and preserves identity');
select pg_temp.rejects($q$update public.crm_submission_attribution set redacted_at=null$q$,'42501');
select pg_temp.rejects($q$update public.crm_submission_attribution set redacted_at=redacted_at+interval '1 second'$q$,'42501');
do $$ declare c text; begin
 foreach c in array array['raw_payload','consent_evidence'] loop
  perform pg_temp.rejects(format('update public.crm_submission_attribution set %I=%L::jsonb',c,'{"restored":true}'),'42501');
 end loop;
 foreach c in array array['fbclid','fbc','fbp'] loop
  perform pg_temp.rejects(format('update public.crm_submission_attribution set %I=%L',c,'restored'),'42501');
 end loop;
end $$;
select pg_temp.rejects($q$update public.crm_submission_attribution set campaign_id='replacement'$q$,'42501');
select pg_temp.rejects($q$delete from public.crm_submission_attribution$q$,'42501');
rollback to attribution_redaction;
-- Initially absent sensitive material must stay absent after redaction too.
insert into public.crm_submission_attribution(submission_id,provider,attribution_status)
 values('78000000-0000-0000-0000-000000000033','website','unavailable');
update public.crm_submission_attribution set redacted_at=now() where provider='website';
select pg_temp.rejects($q$update public.crm_submission_attribution set fbc='new-sensitive-data' where provider='website'$q$,'42501');
rollback to attribution_redaction;
\echo PASS attribution enrichment, immutable identity, controlled redaction and restoration denial

select pg_temp.rejects($q$update public.crm_activities set body='edited'$q$,'42501');
select pg_temp.rejects($q$delete from public.crm_activities$q$,'42501');
select pg_temp.rejects($q$truncate public.crm_command_requests$q$,'42501');
select pg_temp.rejects($q$update public.crm_command_requests set result='{}'$q$,'42501');
select pg_temp.rejects($q$update public.crm_followup_policies set weekly_hours='{"invented":true}'$q$,'42501');
select pg_temp.rejects($q$insert into public.crm_activities(lead_id,occurred_at,actor_kind,event_type,source_key)
 values('78000000-0000-0000-0000-000000000021',now(),'system','test_note','phase2-a1')$q$,'23505');
select pg_temp.rejects($q$insert into public.crm_activities(lead_id,occurred_at,actor_kind,event_type,source_key,outreach_cycle,attempt_ordinal)
 values('78000000-0000-0000-0000-000000000021',now(),'system','test_note','duplicate-attempt',1,1)$q$,'23505');
select pg_temp.rejects($q$insert into public.crm_activities(lead_id,occurred_at,actor_kind,event_type,source_key,details)
 values('78000000-0000-0000-0000-000000000021',now(),'system','test_note','technical-leak','{"nested":[{"campaign_id":"secret"}]}')$q$,'23514');
select pg_temp.rejects($q$update public.crm_tasks set status='completed'$q$,'23514');
select pg_temp.rejects($q$update public.crm_tasks set status='cancelled',cancelled_at=now()$q$,'23514');
select pg_temp.rejects($q$update public.crm_tasks set scheduled_end_at=due_at$q$,'23514');
select pg_temp.rejects($q$update public.crm_tasks set source_key='changed'$q$,'42501');
select pg_temp.rejects($q$insert into public.crm_tasks(lead_id,task_type,due_at,source_kind,source_key,outreach_cycle,attempt_ordinal,policy_id)
 values('78000000-0000-0000-0000-000000000021','contact_attempt',now(),'attempt_sequence','duplicate-task',1,1,'78000000-0000-0000-0000-000000000010')$q$,'23505');
select pg_temp.rejects($q$insert into public.crm_tasks(lead_id,task_type,due_at,source_kind,source_key,outreach_cycle,attempt_ordinal)
 values('78000000-0000-0000-0000-000000000021','contact_attempt',now(),'intake','alternate-generator',1,1)$q$,'23505');
select pg_temp.rejects($q$insert into public.crm_tasks(lead_id,task_type,due_at,source_kind,source_key)
 values('78000000-0000-0000-0000-000000000021','callback',now(),'manual','phase2-t1')$q$,'23505');
savepoint terminal_cases;
update public.crm_tasks set status='completed',completed_at=now(),completion_activity_id='78000000-0000-0000-0000-000000000042' where id='78000000-0000-0000-0000-000000000051';
update public.crm_tasks set status='cancelled',cancelled_at=now(),cancellation_reason='Synthetic cancellation' where id='78000000-0000-0000-0000-000000000052';
set constraints all immediate;
rollback to terminal_cases;
\echo PASS lifecycle checks, history immutability, attribution enrichment and task integrity

-- Structural conversion fixtures only. No conversion command/trigger is installed.
savepoint conversion_cases;
insert into public.students(id,full_name,status) values
 ('78000000-0000-0000-0000-000000000061','Synthetic official learner','Prospect'),
 ('78000000-0000-0000-0000-000000000062','Other official learner','Prospect');
insert into public.enrollments(id,student_id,status) values
 ('78000000-0000-0000-0000-000000000063','78000000-0000-0000-0000-000000000061','Submitted');
insert into public.crm_activities(id,lead_id,occurred_at,actor_kind,event_type,source_key,enrollment_id) values
 ('78000000-0000-0000-0000-000000000064','78000000-0000-0000-0000-000000000021',now(),'system','test_evidence','conversion-1','78000000-0000-0000-0000-000000000063'),
 ('78000000-0000-0000-0000-000000000065','78000000-0000-0000-0000-000000000022',now(),'system','test_evidence','conversion-2','78000000-0000-0000-0000-000000000063');
select pg_temp.rejects($q$update public.crm_leads set status='CONVERTED',student_id='78000000-0000-0000-0000-000000000062',enrollment_id='78000000-0000-0000-0000-000000000063',converted_at=now(),conversion_activity_id='78000000-0000-0000-0000-000000000064' where id='78000000-0000-0000-0000-000000000021'$q$,'23514');
update public.crm_leads set status='CONVERTED',student_id='78000000-0000-0000-0000-000000000061',enrollment_id='78000000-0000-0000-0000-000000000063',converted_at=now(),conversion_activity_id='78000000-0000-0000-0000-000000000064' where id='78000000-0000-0000-0000-000000000021';
set constraints all immediate;
select pg_temp.rejects($q$update public.crm_leads set status='CONVERTED',student_id='78000000-0000-0000-0000-000000000061',enrollment_id='78000000-0000-0000-0000-000000000063',converted_at=now(),conversion_activity_id='78000000-0000-0000-0000-000000000065' where id='78000000-0000-0000-0000-000000000022'$q$,'23505');
rollback to conversion_cases;
\echo PASS conversion evidence, enrollment uniqueness and student/enrollment identity

-- Real profile roles with JWT identity, including forged client role metadata.
set local role authenticated;
do $$ declare i integer; result jsonb; t text; begin
 for i in 1..7 loop
  perform set_config('request.jwt.claim.sub','78000000-0000-0000-0000-'||lpad(i::text,12,'0'),true);
  perform set_config('request.jwt.claims','{"user_metadata":{"role":"director"}}',true);
  if i<=3 then
   result := public.crm_list_leads(100,0);
   perform pg_temp.check_true(jsonb_array_length(result)=2 and result->0->>'learner_name'='Learner two','lead read ordering');
   result := result || jsonb_build_array(public.crm_get_lead_detail('78000000-0000-0000-0000-000000000021'))
     || public.crm_list_activities('78000000-0000-0000-0000-000000000021') || public.crm_list_open_tasks();
   perform pg_temp.check_true(result::text !~ 'SECRET_TECH|"(campaign_id|adset_id|ad_id|raw_payload|fbclid|fbc|fbp|technical_attribution)"|900719925474099399999','operational leakage');
   perform pg_temp.check_true(public.crm_list_activities('78000000-0000-0000-0000-000000000021',1,0)->0->>'id'='78000000-0000-0000-0000-000000000041','timeline tie ordering');
   perform pg_temp.check_true(public.crm_list_activities('78000000-0000-0000-0000-000000000021',1,1)->0->>'id'='78000000-0000-0000-0000-000000000042','timeline pagination');
   perform pg_temp.check_true(public.crm_list_open_tasks()->0->>'id'='78000000-0000-0000-0000-000000000052','task due ordering');
   perform pg_temp.rejects('select public.crm_list_leads(101,0)','22023');
   perform pg_temp.rejects('select public.crm_list_leads(1,-1)','22023');
   perform pg_temp.rejects('select public.crm_list_leads(null,0)','22023');
   perform pg_temp.rejects('select public.crm_list_open_tasks(null,null,50,10001)','22023');
  else
   perform pg_temp.rejects('select public.crm_list_leads()','42501');
   perform pg_temp.rejects($q$select public.crm_get_lead_detail('78000000-0000-0000-0000-000000000021')$q$,'42501');
   perform pg_temp.rejects($q$select public.crm_list_activities('78000000-0000-0000-0000-000000000021')$q$,'42501');
   perform pg_temp.rejects('select public.crm_list_open_tasks()','42501');
  end if;
  if i=1 then
   result := public.crm_get_submission_attribution('78000000-0000-0000-0000-000000000031');
   perform pg_temp.check_true(result->>'external_submission_id'='900719925474099399999' and result->>'campaign_id'='SECRET_TECH','director technical boundary');
   perform pg_temp.check_true(not(result ?| array['raw_payload','fbclid','fbc','fbp','consent_evidence']),'director summary excludes raw evidence');
  else
   perform pg_temp.rejects($q$select public.crm_get_submission_attribution('78000000-0000-0000-0000-000000000031')$q$,'42501');
  end if;
  foreach t in array array['crm_contacts','crm_leads','crm_submissions','crm_submission_attribution','crm_activities','crm_tasks','crm_command_requests','crm_followup_policies'] loop
   perform pg_temp.rejects(format('select 1 from public.%I',t),'42501');
   perform pg_temp.rejects(format('insert into public.%I default values',t),'42501');
   perform pg_temp.rejects(format('update public.%I set %I=%I',t,case when t='crm_submission_attribution' then 'submission_id' else 'id' end,case when t='crm_submission_attribution' then 'submission_id' else 'id' end),'42501');
   perform pg_temp.rejects(format('delete from public.%I',t),'42501');
   perform pg_temp.rejects(format('truncate public.%I cascade',t),'42501');
  end loop;
 end loop;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role anon;
select pg_temp.rejects('select public.crm_list_leads()','42501');
select pg_temp.rejects('select public.crm_list_open_tasks()','42501');
select pg_temp.rejects($q$select public.crm_get_lead_detail('78000000-0000-0000-0000-000000000021')$q$,'42501');
select pg_temp.rejects($q$select public.crm_list_activities('78000000-0000-0000-0000-000000000021')$q$,'42501');
select pg_temp.rejects($q$select public.crm_get_submission_attribution('78000000-0000-0000-0000-000000000031')$q$,'42501');
reset role;
set local role authenticated;
select pg_temp.rejects('select public.crm_list_leads()','42501');
reset role;
set local role service_role;
select pg_temp.rejects('select public.crm_list_leads()','42501');
select pg_temp.rejects('select 1 from public.crm_submission_attribution','42501');
reset role;
set constraints all immediate;
rollback;
\echo PASS Phase 2 schema, lifecycle, circular FKs, immutability, eight-role security and leakage tests
