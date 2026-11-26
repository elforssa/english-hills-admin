-- RWR-r5 PR B2 (migration 140), data step D6 (test data; owner decision 2026-11-26:
-- D6's functions ship in 140, NOT run): d6_plan(ids), d6_apply(ids, counts), d6_revert().
-- Fixtures match the release operator's preview: 2 test learners with receipts (3
-- receipts, voided), 9 test prospects (2 converted, 5 not qualified, 2 lost), their 9
-- contacts, 1 test group with a member, and 1 learner with a placeholder phone. A
-- second case (rolled back to a savepoint) covers an open prospect closed « invalid_spam »
-- and an empty group deleted. Dates come from the server (business_date, the slot the
-- server gave the prospect's first action). Local-only synthetic fixtures (invented
-- numbers), fully rolled back.
\set ON_ERROR_STOP on
begin;
create function pg_temp.ok(value boolean,label text) returns void language plpgsql as $$ begin
 if value is not true then raise exception 'FAIL: %',label; end if;
end $$;
create function pg_temp.denied(statement text,code text default '22023',expected_hint text default null) returns void language plpgsql as $$
declare h text; begin
 begin execute statement; exception when others then
  get stacked diagnostics h=pg_exception_hint;
  if sqlstate=code and (expected_hint is null or h=expected_hint) then return; end if;
  raise exception 'Expected % %, got % % (%): %',code,coalesce(expected_hint,''),sqlstate,sqlerrm,h,statement;
 end;
 raise exception 'Unexpected success: %',statement;
end $$;
create function pg_temp.actor(i integer) returns void language plpgsql as $$ begin
 perform set_config('request.jwt.claim.sub','a7140600-0000-0000-0000-'||lpad(i::text,12,'0'),true);
end $$;
create function pg_temp.create(payload jsonb) returns uuid language sql as $$
 select (public.crm_create_prospect(gen_random_uuid(),jsonb_build_object('source_label','Manuel · Appel entrant','learner_name',payload->>'display_name')||payload)->'lead'->>'id')::uuid
$$;
create function pg_temp.v(lead uuid) returns bigint language sql as $$ select version from public.crm_leads where id=lead $$;
create temp table ids(k text, id uuid);
create function pg_temp.id(name text) returns uuid language sql as $$ select id from ids where k=name $$;
create function pg_temp.ids(prefix text) returns jsonb language sql as $$
 select coalesce(jsonb_agg(id order by k),'[]'::jsonb) from ids where k like prefix||'%' $$;
create function pg_temp.cohort_leads() returns integer language sql as $$
 select (public.crm_get_marketing_cohort(public.business_date(),public.business_date())->'summary'->>'leads')::integer $$;

insert into auth.users(id,email,aud,role,created_at,updated_at)
select ('a7140600-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'d6-'||i||'@example.invalid','authenticated','authenticated',now(),now() from generate_series(1,4)i;
update public.profiles set role=(array['director','admin','receptionist','teacher'])[right(id::text,1)::integer],full_name='Synthetic staff '||right(id::text,1)
 where id::text like 'a7140600-%';
do $$ begin perform pg_temp.actor(1); end $$;
do $p$ begin perform public.crm_create_followup_policy(gen_random_uuid(),
 '{"weekly_hours":{"1":[["09:00","20:00"]],"2":[["09:00","20:00"]],"3":[["09:00","20:00"]],"4":[["09:00","20:00"]],"5":[["09:00","20:00"]],"6":[["09:00","20:00"]],"7":[["09:00","20:00"]]},
   "attempt_offsets":[0,0,1,3,5]}'); end $p$;
alter table public.receipts disable trigger on_receipt_created;

-- ===== Grants (checklist 6): D6 is executable by no API role; report_exclusions has no API access.
do $$ declare fn text; begin
 foreach fn in array array['crm_security.d6_references(regclass,uuid)','crm_security.d6_rows(jsonb)','crm_security.d6_plan(jsonb)',
  'crm_security.d6_apply(jsonb,jsonb)','crm_security.d6_revert()'] loop
  perform pg_temp.ok(not has_function_privilege('authenticated',fn,'execute') and not has_function_privilege('anon',fn,'execute')
   and not has_function_privilege('service_role',fn,'execute'),'private '||fn);
 end loop;
 perform pg_temp.ok(not has_table_privilege('authenticated','public.report_exclusions','select,insert,update,delete')
  and not has_table_privilege('anon','public.report_exclusions','select') and not has_table_privilege('service_role','public.report_exclusions','select'),
  'report_exclusions: no API access');
 perform pg_temp.ok((select count(*)=0 from public.crm_data_step_journal where step in ('d6','d6_revert')) and (select count(*)=0 from public.report_exclusions),'D6 not run');
end $$;
\echo PASS D6 grants, not run

-- ===== Fixtures (the operator's preview).
do $$ declare l uuid; r jsonb; s uuid; i integer; due timestamptz; e uuid; st timestamptz; et timestamptz; begin
 perform pg_temp.actor(3);
 for i in 1..9 loop
  l:=pg_temp.create(jsonb_build_object('display_name','Contact D6 '||i,'phone','06123460'||lpad(i::text,2,'0'),'learner_name','Apprenant D6 '||i,'session_type','Adults'));
  insert into ids values('lead'||i,l),('contact'||i,(select contact_id from public.crm_leads where id=l));
 end loop;
 -- 2 converted (« Inscrire et encaisser »), each a new learner file with its receipt.
 for i in 1..2 loop
  l:=pg_temp.id('lead'||i);
  select due_at into due from public.crm_tasks where lead_id=l and status='open';
  perform public.crm_qualify_lead(gen_random_uuid(),jsonb_build_object('lead_id',l,'expected_version',pg_temp.v(l),'conversation_channel','phone','note','Qualifié',
   'qualification_step','enrollment','next_task',jsonb_build_object('task_type','enrollment_followup','due_at',due)));
  r:=public.crm_enroll_and_collect(gen_random_uuid(),jsonb_build_object('enrollment',jsonb_build_object('lead_id',l,'expected_version',pg_temp.v(l),'student_choice','new',
    'learner_name','Apprenant D6 '||i,'birth_date','2014-05-1'||i,'session_type','Yearly','school_year','2026/2027','level','Child 2',
    'candidate_review',crm_security.candidate_token(l,'Apprenant D6 '||i,('2014-05-1'||i)::date),'confirm_new',true),
   'payment',jsonb_build_object('gross_amount',1500,'payment_amount',500,'payment_method','Espèces')));
  set constraints all immediate; set constraints all deferred;
  insert into ids values('student'||i,(r->'enrollment'->>'student_id')::uuid),('receipt'||i,(r->>'receipt_id')::uuid);
 end loop;
 -- 5 not qualified, 2 lost.
 for i in 3..7 loop
  l:=pg_temp.id('lead'||i);
  perform public.crm_close_prospect(gen_random_uuid(),jsonb_build_object('lead_id',l,'expected_version',pg_temp.v(l),
   'reason',(array['wrong_number','invalid_spam','program_not_suitable','outside_scope','wrong_number'])[i-2]));
 end loop;
 for i in 8..9 loop
  l:=pg_temp.id('lead'||i);
  perform public.crm_close_prospect(gen_random_uuid(),jsonb_build_object('lead_id',l,'expected_version',pg_temp.v(l),'reason',(array['price','schedule'])[i-7]));
 end loop;
 -- A second payment (another programme) on the first learner: 3 receipts in all, as EH-2026-00459 to 00461.
 perform pg_temp.actor(1);
 r:=public.create_charge_payment(jsonb_build_object('student_id',pg_temp.id('student1'),'session_type','Adults','school_year','2026/2027','level','Beginning 1',
  'gross_amount',1000,'discount_amount',0,'payment_amount',300,'payment_method','Espèces','idempotency_key',gen_random_uuid()));
 insert into ids values('receipt3',(select id from public.receipts where student_id=pg_temp.id('student1') and id<>pg_temp.id('receipt1')));
 -- The test group, with the first learner as its member.
 insert into public.groups(name,session_type,niveau,annee) values('TEST R4 D6','Yearly','Child 2','2026-2027') returning id into s;
 insert into ids values('group',s);
 perform pg_temp.actor(3);
 select e2.id,e2.updated_at,st2.updated_at into e,et,st from public.enrollments e2 join public.students st2 on st2.id=e2.student_id where e2.student_id=pg_temp.id('student1') and e2.session_type='Yearly';
 perform public.assign_receptionist_student_group(pg_temp.id('student1'),e,s,st,et);
 -- A learner file with a placeholder phone and no history (the guard refuses it today; D6 meets it from before D3).
 alter table public.students disable trigger people_phone_guard;
 insert into public.students(full_name,status,session_type,telephone) values('Apprenant D6 fictif','Prospect','Yearly','0600000000') returning id into s;
 alter table public.students enable trigger people_phone_guard;
 insert into ids values('student3',s);
 -- Controls that D6 is not given: an open prospect and a learner file.
 l:=pg_temp.create('{"display_name":"Contrôle D6","phone":"0612346090","learner_name":"Contrôle D6","session_type":"Adults"}');
 insert into ids values('ctl_lead',l);
 insert into public.students(full_name,status,session_type) values('Contrôle D6 élève','Prospect','Yearly') returning id into s;
 insert into ids values('ctl_student',s);
 -- For the second case: an open test prospect and an empty test group.
 l:=pg_temp.create('{"display_name":"Contact D6 ouvert","phone":"0612346091","learner_name":"Apprenant D6 ouvert","session_type":"Adults"}');
 insert into ids values('open_lead',l),('open_contact',(select contact_id from public.crm_leads where id=l));
 insert into public.groups(name,session_type,niveau,annee) values('TEST R4 D6 vide','Yearly','Child 1','2026-2027') returning id into s;
 insert into ids values('empty_group',s);
 perform pg_temp.ok((select count(*)=2 from public.crm_leads where id in (select id from ids where k like 'lead%') and status='CONVERTED')
  and (select count(*)=5 from public.crm_leads where id in (select id from ids where k like 'lead%') and status='NOT_QUALIFIED')
  and (select count(*)=2 from public.crm_leads where id in (select id from ids where k like 'lead%') and status='LOST'),'fixture: 2 converted, 5 not qualified, 2 lost');
 perform pg_temp.ok((select count(*)=1 from public.enrollments where group_id=pg_temp.id('group') and status in ('Submitted','Under Review','Confirmed','Validated','Trial')),'fixture: the group has a member');
 perform pg_temp.ok((select count(*)=3 from public.receipts where student_id in (pg_temp.id('student1'),pg_temp.id('student2')) and voided_at is null),'fixture: 3 live receipts');
end $$;
create temp table main_ids as select jsonb_build_object('students',pg_temp.ids('student'),'leads',pg_temp.ids('lead'),'contacts',pg_temp.ids('contact'),
 'groups',jsonb_build_array(pg_temp.id('group'))) v;
\echo PASS D6 fixtures

-- ===== Input and blockers: nothing runs while a receipt is live, a member is not listed or an id is missing.
do $$ declare m jsonb:=(select v from main_ids); p jsonb; begin
 perform pg_temp.actor(1);
 perform pg_temp.denied($q$select crm_security.d6_plan('[]')$q$,'22023','d6.ids');
 perform pg_temp.denied($q$select crm_security.d6_plan('{"people":[]}')$q$,'22023','d6.ids');
 perform pg_temp.denied($q$select crm_security.d6_plan('{"students":["x"]}')$q$,'22023','d6.ids');
 perform pg_temp.denied(format($q$select crm_security.d6_plan('{"leads":["%s","%s"]}')$q$,pg_temp.id('lead1'),pg_temp.id('lead1')),'22023','d6.ids');
 p:=crm_security.d6_plan(m);
 perform pg_temp.ok((select count(*)=2 from jsonb_array_elements(p->'blockers') b where b->>'blocker'='live_receipt'),'live receipts block: '||(p->'blockers')::text);
 perform pg_temp.denied(format($q$select crm_security.d6_apply(%L,%L)$q$,m,p->'counts'),'22023','d6.blocked');
 p:=crm_security.d6_plan(jsonb_build_object('students',jsonb_build_array(pg_temp.id('student2')),'groups',jsonb_build_array(pg_temp.id('group')),
  'leads',jsonb_build_array(gen_random_uuid())));
 perform pg_temp.ok(p->'blockers' @> jsonb_build_array(jsonb_build_object('entity','groups','blocker','member_not_listed'),
  jsonb_build_object('entity','crm_leads','blocker','missing')),'unlisted member and missing id block: '||(p->'blockers')::text);
end $$;
-- The owner voided the three test receipts in the app (release record of B1); they stay.
do $$ begin
 perform pg_temp.actor(1);
 perform public.void_financial_receipt(pg_temp.id('receipt'||i),'Test (données D6)',gen_random_uuid()) from generate_series(1,3) i;
end $$;
\echo PASS D6 input checks and blockers

-- ===== Second case (rolled back): an open test prospect is closed « invalid_spam » with
-- the note, an already-closed one is not re-closed, an empty group is deleted; revert.
savepoint open_case;
do $$ declare m jsonb; p jsonb; res jsonb; lv bigint; before_closed jsonb; grow jsonb; begin
 perform pg_temp.actor(1);
 m:=jsonb_build_object('leads',jsonb_build_array(pg_temp.id('open_lead'),pg_temp.id('lead8')),'groups',jsonb_build_array(pg_temp.id('empty_group')));
 p:=crm_security.d6_plan(m);
 perform pg_temp.ok(p->'counts'='{"crm_leads":{"close":1,"already_closed":1},"groups":{"delete":1},"receipts":{"voided":0,"live":0}}'::jsonb,'open case counts: '||(p->'counts')::text);
 lv:=pg_temp.v(pg_temp.id('lead8'));
 select to_jsonb(g) into grow from public.groups g where id=pg_temp.id('empty_group');
 res:=crm_security.d6_apply(m,p->'counts');
 set constraints all immediate; set constraints all deferred;
 perform pg_temp.ok((select status='NOT_QUALIFIED' and closure_reason='invalid_spam' and closure_note='Données de test (D6)' from public.crm_leads where id=pg_temp.id('open_lead')),
  'open prospect closed « invalid_spam » with the note');
 perform pg_temp.ok(not exists(select 1 from public.crm_tasks where lead_id=pg_temp.id('open_lead') and status='open'),'its action is cancelled');
 perform pg_temp.ok(exists(select 1 from public.crm_activities where lead_id=pg_temp.id('open_lead') and event_type='lead_not_qualified' and outcome='invalid_spam'
   and actor_id='a7140600-0000-0000-0000-000000000001'),'the close is in its history, by the director');
 perform pg_temp.ok(pg_temp.v(pg_temp.id('lead8'))=lv and (select status='LOST' and closure_reason='price' from public.crm_leads where id=pg_temp.id('lead8')),'already closed: not re-closed');
 perform pg_temp.ok(not exists(select 1 from public.groups where id=pg_temp.id('empty_group')),'empty group deleted');
 perform pg_temp.ok((select before->'row'=grow from public.crm_data_step_journal where step='d6' and entity_id=pg_temp.id('empty_group')),'the whole row is journalled');
 perform pg_temp.ok((select count(*)=2 from public.report_exclusions where entity='crm_leads' and step='d6'),'both prospects out of reports');
 res:=crm_security.d6_revert();
 perform pg_temp.ok(res->'reopen_by_hand'=jsonb_build_array(pg_temp.id('open_lead')) and (res->'restored'->>'groups_deleted')::int=1,'revert: '||res::text);
 perform pg_temp.ok((select to_jsonb(g)=grow from public.groups g where id=pg_temp.id('empty_group')),'revert: the group comes back exactly');
 perform pg_temp.ok((select status='NOT_QUALIFIED' from public.crm_leads where id=pg_temp.id('open_lead')),'revert: the closed prospect is listed, not reopened');
 perform pg_temp.ok(not exists(select 1 from public.report_exclusions),'revert: exclusions removed');
end $$;
rollback to savepoint open_case;
\echo PASS D6 open prospect closed, empty group deleted, revert

-- ===== The operator's preview: plan, refusals, apply, checks, revert.
create temp table snap as select
 (select jsonb_agg(to_jsonb(l) order by id) from public.crm_leads l where id in (select id from ids where k like 'lead%' or k='ctl_lead')) leads,
 (select jsonb_agg(to_jsonb(c) order by id) from public.crm_contacts c where id in (select id from ids where k like 'contact%')) contacts,
 (select jsonb_agg(to_jsonb(r) order by id) from public.receipts r) receipts,
 (select to_jsonb(s) from public.students s where id=pg_temp.id('student3')) placeholder,
 (select to_jsonb(s)-'updated_at' from public.students s where id=pg_temp.id('ctl_student')) ctl,
 (select count(*) from public.crm_activities) activities,
 pg_temp.cohort_leads() cohort;
do $$ declare m jsonb:=(select v from main_ids); p jsonb; expected jsonb; begin
 perform pg_temp.actor(1);
 expected:='{"students":{"archive":2,"delete":1},"crm_leads":{"already_closed":9},"crm_contacts":{"keep":9},"groups":{"close":1},"receipts":{"voided":3,"live":0}}';
 p:=crm_security.d6_plan(m);
 perform pg_temp.ok(p->'counts'=expected,'preview counts: '||(p->'counts')::text);
 perform pg_temp.ok(p->'blockers'='[]'::jsonb,'no blocker');
 perform pg_temp.ok(jsonb_array_length(p->'receipts_kept')=3 and not exists(select 1 from jsonb_array_elements(p->'receipts_kept') x where not (x->>'voided')::boolean),'the 3 voided receipts are kept');
 perform pg_temp.ok(exists(select 1 from jsonb_array_elements(p->'rows') x where (x->>'entity_id')::uuid=pg_temp.id('student3') and x->>'action'='delete'
  and (x->'detail'->>'placeholder_phone')::boolean),'the placeholder-phone file has no history: deleted');
 perform pg_temp.ok(position('Apprenant D6' in p::text)=0 and position('Contact D6' in p::text)=0 and position('0612346' in p::text)=0,'the plan holds ids, never names or phones');
 perform pg_temp.ok(pg_temp.cohort_leads()=(select cohort from snap),'cohort read');
 -- Refusals: not as the director, wrong counts.
 perform pg_temp.actor(3);
 perform pg_temp.denied(format($q$select crm_security.d6_apply(%L,%L)$q$,m,expected),'42501','d6.run_as_director');
 perform pg_temp.actor(1);
 perform pg_temp.denied(format($q$select crm_security.d6_apply(%L,%L)$q$,m,jsonb_set(expected,'{students,archive}','1')),'22023','d6.counts');
 perform pg_temp.ok((select count(*)=0 from public.crm_data_step_journal where step='d6'),'refusals wrote nothing');
end $$;
\echo PASS D6 preview plan and refusals

do $$ declare m jsonb:=(select v from main_ids); res jsonb; begin
 perform pg_temp.actor(1);
 res:=crm_security.d6_apply(m,crm_security.d6_plan(m)->'counts');
 set constraints all immediate; set constraints all deferred;
 perform pg_temp.ok(res->'written'='{"students":3,"groups":1}'::jsonb and (res->>'excluded')::int=21,'apply: '||(res-'plan')::text);
 -- (b) Prospects already closed or converted: untouched; their contacts kept; all out of reports.
 perform pg_temp.ok((select jsonb_agg(to_jsonb(l) order by id) from public.crm_leads l where id in (select id from ids where k like 'lead%' or k='ctl_lead'))=(select leads from snap),
  'prospects (and the control) unchanged byte for byte');
 perform pg_temp.ok((select jsonb_agg(to_jsonb(c) order by id) from public.crm_contacts c where id in (select id from ids where k like 'contact%'))=(select contacts from snap),'contacts kept unchanged');
 perform pg_temp.ok((select count(*) from public.crm_activities)=(select activities from snap),'no CRM history written');
 perform pg_temp.ok((select count(*)=9 from public.report_exclusions where entity='crm_leads') and (select count(*)=9 from public.report_exclusions where entity='crm_contacts')
  and (select count(*)=2 from public.report_exclusions where entity='students') and (select count(*)=1 from public.report_exclusions where entity='groups'),'exclusions per entity');
 perform pg_temp.ok(pg_temp.cohort_leads()=(select cohort from snap)-9,'the marketing cohort leaves the 9 test prospects out');
 -- (c) Learner files with receipts: archived, enrollments ended; receipts untouched.
 perform pg_temp.ok((select count(*)=2 from public.students where id in (pg_temp.id('student1'),pg_temp.id('student2')) and deleted_at is not null and status='Inactive'),'learners archived, Inactive');
 perform pg_temp.ok(not exists(select 1 from public.enrollments where student_id in (pg_temp.id('student1'),pg_temp.id('student2'))
  and status in ('Submitted','Under Review','Confirmed','Validated','Trial')),'their enrollments ended');
 perform pg_temp.ok((select jsonb_agg(to_jsonb(r) order by id) from public.receipts r)=(select receipts from snap),'every receipt unchanged (the 3 voided stay, numbering intact)');
 -- (c) The test group: closed, not deleted.
 perform pg_temp.ok((select closed_at is not null and closed_by='a7140600-0000-0000-0000-000000000001' from public.groups where id=pg_temp.id('group')),'group closed by the director, kept');
 -- (a) The placeholder-phone file: deleted, its whole row in the journal.
 perform pg_temp.ok(not exists(select 1 from public.students where id=pg_temp.id('student3')),'placeholder-phone file deleted');
 perform pg_temp.ok((select before->'row'=(select placeholder from snap) from public.crm_data_step_journal where step='d6' and entity_id=pg_temp.id('student3')),'its whole row is journalled');
 -- Controls untouched; a second run refused.
 perform pg_temp.ok((select to_jsonb(s)-'updated_at' from public.students s where id=pg_temp.id('ctl_student'))=(select ctl from snap),'control learner unchanged');
 perform pg_temp.denied(format($q$select crm_security.d6_apply(%L,%L)$q$,m,crm_security.d6_plan(m)->'counts'),'22023','d6.applied');
end $$;
-- Archived files are out of the staff screens (the soft-delete policy).
do $$ declare n integer; a uuid:=pg_temp.id('student1'); b uuid:=pg_temp.id('student2'); begin
 perform pg_temp.actor(1);
 set local role authenticated;
 select count(*) into n from public.students where id in (a,b);
 reset role;
 perform pg_temp.ok(n=0,'archived test learners hidden from the director''s lists');
end $$;
\echo PASS D6 apply on the preview

do $$ declare res jsonb; begin
 perform pg_temp.actor(1);
 res:=crm_security.d6_revert();
 set constraints all immediate; set constraints all deferred;
 perform pg_temp.ok(res->'restored'='{"students_deleted":1,"groups_closed":1,"students_archived":2}'::jsonb and res->'reopen_by_hand'='[]'::jsonb
  and jsonb_array_length(res->'enrollments_still_ended')=3 and res->'skipped'='[]'::jsonb,'revert: '||res::text);
 perform pg_temp.ok((select to_jsonb(s) from public.students s where id=pg_temp.id('student3'))=(select placeholder from snap),'placeholder-phone file back exactly (its phone too)');
 perform pg_temp.ok((select count(*)=2 from public.students where id in (pg_temp.id('student1'),pg_temp.id('student2')) and deleted_at is null),'learners restored');
 perform pg_temp.ok((select closed_at is null from public.groups where id=pg_temp.id('group')),'group reopened');
 perform pg_temp.ok(not exists(select 1 from public.report_exclusions) and pg_temp.cohort_leads()=(select cohort from snap),'exclusions removed, cohort as before');
 perform pg_temp.ok((select jsonb_agg(to_jsonb(r) order by id) from public.receipts r)=(select receipts from snap),'receipts still unchanged');
 perform pg_temp.denied('select crm_security.d6_revert()');
 perform pg_temp.denied(format($q$select crm_security.d6_apply(%L,%L)$q$,(select v from main_ids),crm_security.d6_plan((select v from main_ids))->'counts'),'22023','d6.applied');
end $$;
\echo PASS D6 revert

rollback;
