-- RWR-r5 PR B2 (§5.4, migration 140): the programme, level, price, origin and
-- close-reason catalogues; the catalogue read and director commands; prospect programme,
-- origin and referrer; one close-reason list with the status derived from the reason
-- (« Mauvais numéro » closes NOT_QUALIFIED, « Doublon » LOST); conversion writes the
-- enrollment's programme and the prospect's origin (invariant 11); the learner origin;
-- the source filter and the finance breakdown; data step D4 (shipped, not run).
-- Owner decision (2026-11-26, replacing OD-16): B2 ships with no programme prices.
-- Local-only synthetic fixtures (invented numbers), fully rolled back.
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
 perform set_config('request.jwt.claim.sub','a7140000-0000-0000-0000-'||lpad(i::text,12,'0'),true);
end $$;
create function pg_temp.create(payload jsonb) returns uuid language sql as $$
 select (public.crm_create_prospect(gen_random_uuid(),jsonb_build_object('source_label','Manuel · Appel entrant','learner_name',payload->>'display_name')||payload)->'lead'->>'id')::uuid
$$;
create function pg_temp.v(lead uuid) returns bigint language sql as $$ select version from public.crm_leads where id=lead $$;
create function pg_temp.price(code text,year text) returns jsonb language sql as $$
 select x from jsonb_array_elements(public.get_catalogue()->'programmes') p, jsonb_array_elements(p->'prices') x
 where p->>'code'=code and x->>'school_year'=year
$$;

insert into auth.users(id,email,aud,role,created_at,updated_at)
select ('a7140000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,'catalogues-'||i||'@example.invalid','authenticated','authenticated',now(),now() from generate_series(1,4)i;
update public.profiles set role=(array['director','admin','receptionist','teacher'])[right(id::text,1)::integer],full_name='Synthetic staff '||right(id::text,1)
 where id::text like 'a7140000-%';
do $$ begin perform pg_temp.actor(1); end $$;
do $p$ begin perform public.crm_create_followup_policy(gen_random_uuid(),
 '{"weekly_hours":{"1":[["09:00","20:00"]],"2":[["09:00","20:00"]],"3":[["09:00","20:00"]],"4":[["09:00","20:00"]],"5":[["09:00","20:00"]],"6":[["09:00","20:00"]],"7":[["09:00","20:00"]]},
   "attempt_offsets":[0,0,1,3,5]}'); end $p$;
-- Seed data (if any) is counted before the fixtures.
create temp table base as select coalesce((select (x->>'count')::int from json_array_elements(public.get_referral_breakdown()) x where x->>'code'='google'),0) google;

-- ===== Grants (checklist 6): the three RPCs for authenticated only; helpers and D4 for no API role.
do $$ declare fn text; begin
 foreach fn in array array['public.get_catalogue()','public.catalogue_set_price(text,text,numeric,text,uuid)','public.catalogue_save_programme(text,bigint,jsonb)'] loop
  perform pg_temp.ok(has_function_privilege('authenticated',fn,'execute') and not has_function_privilege('anon',fn,'execute'),'RPC grant '||fn);
 end loop;
 foreach fn in array array['crm_security.close_status(text)','crm_security.close_reason_allowed(text,text)','crm_security.programme_selectable(text)',
  'crm_security.origin_selectable(text)','crm_security.lead_origin(public.crm_leads)','crm_security.referral_origin(text)',
  'crm_security.referrer_fields(text,jsonb,uuid)','crm_security.referrer_label(text,uuid,uuid)','crm_security.programme_price(text,text)',
  'crm_security.d4_rows(jsonb)','crm_security.d4_plan(jsonb)','crm_security.d4_apply(jsonb,jsonb)','crm_security.d4_revert()'] loop
  perform pg_temp.ok(not has_function_privilege('authenticated',fn,'execute') and not has_function_privilege('anon',fn,'execute')
   and not has_function_privilege('service_role',fn,'execute'),'private '||fn);
 end loop;
 foreach fn in array array['public.programmes','public.programme_levels','public.acquisition_sources'] loop
  perform pg_temp.ok(has_table_privilege('authenticated',fn,'select') and not has_table_privilege('authenticated',fn,'insert,update,delete')
   and not has_table_privilege('anon',fn,'select') and not has_table_privilege('service_role',fn,'select'),'read-only labels '||fn);
 end loop;
 perform pg_temp.ok(not has_table_privilege('authenticated','public.programme_prices','select') and not has_table_privilege('service_role','public.programme_prices','select'),
  'prices are read through get_catalogue only');
 -- CRM rule (test-crm-phase12-security.mjs): no crm_* table is read directly.
 perform pg_temp.ok(not has_table_privilege('authenticated','public.crm_close_reasons','select') and not has_table_privilege('anon','public.crm_close_reasons','select')
  and not has_table_privilege('service_role','public.crm_close_reasons','select'),'close reasons are read through get_catalogue only');
 perform pg_temp.ok((select bool_and(relrowsecurity) from pg_class where oid in ('public.programmes'::regclass,'public.programme_levels'::regclass,
  'public.programme_prices'::regclass,'public.acquisition_sources'::regclass,'public.crm_close_reasons'::regclass)),'RLS on the five tables');
end $$;
\echo PASS grants

-- ===== Seed: 10 programmes, their levels (the session-level rule), no price (owner decision).
select pg_temp.ok((select count(*)=10 from public.programmes) and (select count(*)=1 from public.programmes where not enrollable and code='Other'),'10 programmes, Other not enrollable');
select pg_temp.ok((select count(*)=78 from public.programme_levels) and (select bool_and(operational_security.valid_session_level(programme_code,level)) from public.programme_levels),
 'every catalogue level is a valid level of its programme');
select pg_temp.ok((select count(*)=0 from public.programme_prices),'B2 ships with no programme prices (owner decision replacing OD-16)');
select pg_temp.ok((select count(*)=11 from public.acquisition_sources) and (select count(*)=9 from public.acquisition_sources where selectable)
 and (select requires_referrer from public.acquisition_sources where code='recommendation'),'origins: 9 offered, recommendation needs a referrer');
select pg_temp.ok((select count(*)=14 from public.crm_close_reasons) and (select status from public.crm_close_reasons where code='wrong_number')='NOT_QUALIFIED'
 and (select label_fr from public.crm_close_reasons where code='wrong_number')='Mauvais numéro','close reasons with « Mauvais numéro »');
-- The derived status is always allowed by the closure constraint, and nothing else is.
select pg_temp.ok((select bool_and(crm_security.close_reason_allowed(crm_security.close_status(code),code)) from public.crm_close_reasons),'derived status allowed');
select pg_temp.ok(crm_security.close_status('duplicate')='LOST' and crm_security.close_status('wrong_number')='NOT_QUALIFIED' and crm_security.close_status('price')='LOST'
 and crm_security.close_status('nope') is null,'derived statuses');
select pg_temp.ok(crm_security.close_reason_allowed('NOT_QUALIFIED','duplicate') and crm_security.close_reason_allowed('LOST','duplicate')
 and not crm_security.close_reason_allowed('LOST','wrong_number') and not crm_security.close_reason_allowed('NOT_QUALIFIED','price'),'allowed pairs');
\echo PASS seed

-- ===== get_catalogue: staff roles only; the director edits prices (append-only) and the CRM offer.
do $$ declare c jsonb; p jsonb; first uuid; begin
 perform pg_temp.actor(4);
 perform pg_temp.denied('select public.get_catalogue()','42501');
 perform pg_temp.actor(3);
 c:=public.get_catalogue();
 perform pg_temp.ok(jsonb_array_length(c->'programmes')=10 and (select count(*)=9 from jsonb_array_elements(c->'origins') x where (x->>'selectable')::boolean)
  and (select count(*)=13 from jsonb_array_elements(c->'close_reasons') x where (x->>'selectable')::boolean),'catalogue read for reception (offered origins and reasons)');
 perform pg_temp.ok((select jsonb_array_length(x->'levels')=13 and x->>'label'='Programme annuel' and jsonb_array_length(x->'prices')=0 from jsonb_array_elements(c->'programmes') x where x->>'code'='Yearly'),
  'Yearly: French label, 13 levels, no price');
 perform pg_temp.denied($q$select public.catalogue_set_price('Yearly','2026/2027',4500,null,null)$q$,'42501');
 perform pg_temp.actor(2);
 perform pg_temp.denied($q$select public.catalogue_set_price('Yearly','2026/2027',4500,null,null)$q$,'42501');
 perform pg_temp.denied($q$select public.catalogue_save_programme('Other',1,'{"crm_selectable":false}')$q$,'42501');
 perform pg_temp.actor(1);
 perform pg_temp.denied($q$select public.catalogue_set_price('Nope','2026/2027',4500,null,null)$q$,'22023','catalogue.programme_unknown');
 perform pg_temp.denied($q$select public.catalogue_set_price('Yearly','2026/2028',4500,null,null)$q$,'22023','catalogue.school_year_invalid');
 perform pg_temp.denied($q$select public.catalogue_set_price('Yearly','2026/2027',-1,null,null)$q$,'22023','catalogue.price_invalid');
 perform pg_temp.denied($q$select public.catalogue_set_price('Yearly','2026/2027',10.555,null,null)$q$,'22023','catalogue.price_invalid');
 perform pg_temp.denied($q$select public.catalogue_set_price('Yearly','2026/2027',null,null,null)$q$,'22023','catalogue.no_change');
 first:=(public.catalogue_set_price('Yearly','2026/2027',4500,null,null)->>'id')::uuid;
 perform pg_temp.ok((pg_temp.price('Yearly','2026/2027')->>'amount')::numeric=4500 and (pg_temp.price('Yearly','2026/2027')->>'id')::uuid=first,'price read back');
 perform pg_temp.denied($q$select public.catalogue_set_price('Yearly','2026/2027',4800,null,null)$q$,'PT409','catalogue.price_stale');
 perform pg_temp.denied(format($q$select public.catalogue_set_price('Yearly','2026/2027',4500,null,%L)$q$,first),'22023','catalogue.no_change');
 perform public.catalogue_set_price('Yearly','2026/2027',4800,null,first);
 perform pg_temp.ok((pg_temp.price('Yearly','2026/2027')->>'amount')::numeric=4800 and (select count(*)=2 from public.programme_prices where programme_code='Yearly'),'a change is a new row');
 perform public.catalogue_set_price('Yearly','2026/2027',null,null,(pg_temp.price('Yearly','2026/2027')->>'id')::uuid);
 perform pg_temp.ok(pg_temp.price('Yearly','2026/2027')->>'amount' is null and (select count(*)=3 from public.programme_prices),'cleared: empty again, staff type the amount');
 perform pg_temp.ok(pg_temp.price('Yearly','2025/2026') is null,'another year has no price');
 -- The CRM offer.
 p:=(select x from jsonb_array_elements(public.get_catalogue()->'programmes') x where x->>'code'='Other');
 perform pg_temp.denied(format($q$select public.catalogue_save_programme('Other',%s,'{"crm_selectable":false,"label":"x"}')$q$,p->>'version'),'22023','catalogue.unsupported_change');
 perform public.catalogue_save_programme('Other',(p->>'version')::bigint,'{"crm_selectable":false}');
 perform pg_temp.denied(format($q$select public.catalogue_save_programme('Other',%s,'{"crm_selectable":true}')$q$,p->>'version'),'PT409','catalogue.programme_stale');
end $$;
\echo PASS catalogue read, prices and offer

-- ===== Prospects: programme from the catalogue, origin and referrer; origin of a form prospect is its form.
create temp table ids(k text primary key, id uuid);
do $$ declare l uuid; w jsonb; begin
 perform pg_temp.actor(3);
 perform pg_temp.denied($q$select pg_temp.create('{"display_name":"Prog inconnu","phone":"0612340001","session_type":"Nope"}')$q$,'22023','catalogue.programme_unknown');
 perform pg_temp.denied($q$select pg_temp.create('{"display_name":"Prog retiré","phone":"0612340002","session_type":"Other"}')$q$,'22023','catalogue.programme_unknown');
 perform pg_temp.denied($q$select pg_temp.create('{"display_name":"Origine Meta","phone":"0612340003","origin_code":"meta_form"}')$q$,'22023','catalogue.origin_unknown');
 perform pg_temp.denied($q$select pg_temp.create('{"display_name":"Reco sans nom","phone":"0612340004","origin_code":"recommendation"}')$q$,'22023','catalogue.referrer_required');
 perform pg_temp.denied($q$select pg_temp.create('{"display_name":"Deux références","phone":"0612340005","origin_code":"recommendation","referrer":{"name":"Leila","lead_id":"a7140000-0000-0000-0000-000000000099"}}')$q$,'22023','catalogue.referrer_invalid');
 l:=pg_temp.create('{"display_name":"Nadia Reco","phone":"0612340006","learner_name":"Adam Reco","session_type":"Online","origin_code":"recommendation","referrer":{"name":"Leila Amrani"}}');
 insert into ids values('reco',l);
 w:=public.crm_get_workspace_detail(l);
 perform pg_temp.ok(w->>'session_type'='Online' and w->>'origin_code'='recommendation' and (w->>'origin_editable')::boolean
  and w->'referrer'->>'name'='Leila Amrani' and w->'referrer'->>'label'='Leila Amrani','programme, origin and referrer on the prospect');
 -- Edit: origin and referrer (a manual prospect), programme validated.
 perform pg_temp.denied(format($q$select public.crm_update_prospect(gen_random_uuid(),jsonb_build_object('lead_id',%L,'expected_version',%s,'session_type','Nope'))$q$,l,pg_temp.v(l)),'22023','catalogue.programme_unknown');
 perform public.crm_update_prospect(gen_random_uuid(),jsonb_build_object('lead_id',l,'expected_version',pg_temp.v(l),'origin_code','instagram','referrer',null));
 perform pg_temp.ok((select origin_code='instagram' and referrer_text is null from public.crm_leads where id=l),'origin edited, referrer removed');
 perform pg_temp.ok((select count(*)=1 from public.crm_activities where lead_id=l and details->>'summary'='Fiche modifiée : origine, recommandé par'),'the edit is in the history');
 -- A form prospect: its origin is its first touch (OD-10 A).
 l:=pg_temp.create('{"display_name":"Site web","phone":"0612340007","learner_name":"Sara Site"}');
 insert into ids values('site',l);
 set local session_replication_role=replica;
 update public.crm_submissions set channel='website' where id=(select first_submission_id from public.crm_leads where id=l);
 set local session_replication_role=origin;
 perform pg_temp.ok(public.crm_get_workspace_detail(l)->>'origin_code'='website' and not (public.crm_get_workspace_detail(l)->>'origin_editable')::boolean,'a website prospect reads « Site web », not editable');
 perform pg_temp.denied(format($q$select public.crm_update_prospect(gen_random_uuid(),jsonb_build_object('lead_id',%L,'expected_version',%s,'origin_code','google'))$q$,l,pg_temp.v(l)),'22023','catalogue.origin_first_touch');
end $$;
\echo PASS prospect programme, origin and referrer

-- ===== One close-reason list: the status comes from the reason (day script 8 closes in 2).
do $$ declare l uuid; begin
 perform pg_temp.actor(3);
 l:=pg_temp.create('{"display_name":"Mauvais numéro","phone":"0612340010"}');
 perform public.crm_log_exchange(gen_random_uuid(),jsonb_build_object('lead_id',l,'expected_version',pg_temp.v(l),'channel','phone','result','wrong_number','next',jsonb_build_object('close',jsonb_build_object('reason','wrong_number'))));
 perform pg_temp.ok((select status='NOT_QUALIFIED' and closure_reason='wrong_number' from public.crm_leads where id=l),'« Mauvais numéro » closes NOT_QUALIFIED from the exchange');
 perform pg_temp.ok((select count(*)=0 from public.crm_tasks where lead_id=l and status='open'),'closed: no open action');
 l:=pg_temp.create('{"display_name":"Doublon","phone":"0612340011"}');
 perform public.crm_close_prospect(gen_random_uuid(),jsonb_build_object('lead_id',l,'expected_version',pg_temp.v(l),'reason','duplicate'));
 perform pg_temp.ok((select status='LOST' and closure_reason='duplicate' from public.crm_leads where id=l),'« Doublon » alone closes LOST');
 l:=pg_temp.create('{"display_name":"Prix","phone":"0612340012"}');
 perform pg_temp.denied(format($q$select public.crm_close_prospect(gen_random_uuid(),jsonb_build_object('lead_id',%L,'expected_version',%s,'status','NOT_QUALIFIED','reason','price'))$q$,l,pg_temp.v(l)));
 perform pg_temp.denied(format($q$select public.crm_close_prospect(gen_random_uuid(),jsonb_build_object('lead_id',%L,'expected_version',%s,'reason','other'))$q$,l,pg_temp.v(l)));
 perform pg_temp.denied(format($q$select public.crm_close_prospect(gen_random_uuid(),jsonb_build_object('lead_id',%L,'expected_version',%s,'reason','unreachable'))$q$,l,pg_temp.v(l)));
 perform public.crm_close_prospect(gen_random_uuid(),jsonb_build_object('lead_id',l,'expected_version',pg_temp.v(l),'reason','price'));
 perform pg_temp.ok((select status='LOST' and closure_reason='price' from public.crm_leads where id=l),'« Prix » closes LOST');
 -- The explicit status still works when it matches (the older callers).
 l:=pg_temp.create('{"display_name":"Explicite","phone":"0612340013"}');
 perform public.crm_close_prospect(gen_random_uuid(),jsonb_build_object('lead_id',l,'expected_version',pg_temp.v(l),'status','NOT_QUALIFIED','reason','duplicate'));
 perform pg_temp.ok((select status='NOT_QUALIFIED' from public.crm_leads where id=l),'explicit NOT_QUALIFIED « Doublon » kept');
end $$;
\echo PASS close reasons

-- ===== Conversion (invariant 11): the enrollment's programme and the prospect's origin.
alter table public.receipts disable trigger on_receipt_created;
do $$ declare l uuid; r jsonb; s uuid; begin
 perform pg_temp.actor(3);
 l:=pg_temp.create('{"display_name":"Conversion","phone":"0612340020","learner_name":"Yanis Conv","session_type":"Adults","origin_code":"google"}');
 perform public.crm_qualify_lead(gen_random_uuid(),jsonb_build_object('lead_id',l,'expected_version',pg_temp.v(l),'conversation_channel','phone','note','Qualifié',
  'qualification_step','enrollment','next_task',jsonb_build_object('task_type','enrollment_followup','due_at',now()+interval '1 day')));
 r:=public.crm_enroll_and_collect(gen_random_uuid(),jsonb_build_object('enrollment',jsonb_build_object('lead_id',l,'expected_version',pg_temp.v(l),'student_choice','new',
   'learner_name','Yanis Conv','birth_date','2014-05-10','session_type','Yearly','school_year','2026/2027','level','Child 2',
   'candidate_review',crm_security.candidate_token(l,'Yanis Conv','2014-05-10'),'confirm_new',true),
  'payment',jsonb_build_object('gross_amount',1500,'payment_amount',500,'payment_method','Espèces')));
 set constraints all immediate; set constraints all deferred;
 s:=(r->'enrollment'->>'student_id')::uuid;
 insert into ids values('converted',l),('converted_student',s);
 perform pg_temp.ok((select status='CONVERTED' and session_type='Yearly' from public.crm_leads where id=l),'the prospect takes the enrollment''s programme');
 perform pg_temp.ok((select origin_code='google' from public.students where id=s),'the new learner takes the prospect''s origin');
end $$;
\echo PASS conversion

-- ===== Learner origin (reception command), the source filter and the finance breakdown.
do $$ declare s uuid:=gen_random_uuid(); v timestamptz; page jsonb; b jsonb; begin
 perform pg_temp.actor(3);
 perform public.save_receptionist_student(s,null,jsonb_build_object('full_name','Origine Apprenant','telephone','0612340030','origin_code','instagram'));
 perform pg_temp.ok((select origin_code='instagram' from public.students where id=s),'reception saves the learner origin');
 v:=(select updated_at from public.students where id=s);
 perform pg_temp.denied(format($q$select public.save_receptionist_student(%L,%L,'{"origin_code":"meta_form"}')$q$,s,v),'22023','catalogue.origin_unknown');
 perform public.save_receptionist_student(s,v,'{"origin_code":"former_student"}');
 perform pg_temp.ok((select origin_code='former_student' from public.students where id=s),'origin edited');
 -- A learner with only the old answer is found under its origin until D4 maps it.
 insert into public.students(id,full_name,telephone,status,session_type,referral_source)
  values('a7140000-0000-0000-0000-000000000040','Ancienne réponse','0612340040','Prospect','Yearly','Recherche Google');
 -- An enrolled learner from before 140 (the breakdown counts enrolled files only).
 set local session_replication_role=replica;
 update public.students set status='Enrolled' where id='a7140000-0000-0000-0000-000000000040';
 set local session_replication_role=origin;
 perform pg_temp.actor(1);
 page:=public.search_students_page(p_status=>'all_shown',p_source=>'google',p_page_size=>100);
 perform pg_temp.ok((select count(*)=2 from jsonb_array_elements(page->'rows') x where x->>'id' in ('a7140000-0000-0000-0000-000000000040',(select id::text from ids where k='converted_student'))),
  'the source filter reads the origin, and the old answer until D4');
 b:=to_jsonb(public.get_referral_breakdown());
 perform pg_temp.ok((select (x->>'count')::int=(select google from base)+2 and x->>'source'='Google' from jsonb_array_elements(b) x where x->>'code'='google'),'the finance breakdown groups by origin, in French');
end $$;
\echo PASS learner origin, filter and breakdown

-- ===== D4 (shipped, not run here as a release step): plan, apply, revert, journal.
do $$ declare l uuid; m jsonb; plan jsonb; ph text:=left(md5(lower(btrim('Anglais pour adultes'))),8); sh text; res jsonb; begin
 perform pg_temp.actor(1);
 perform pg_temp.ok((select count(*)=0 from public.crm_data_step_journal where step in ('d4','d4_revert')),'D4 not run');
 perform pg_temp.actor(3);
 l:=pg_temp.create('{"display_name":"D4 libre","phone":"0612340050","program_interest_text":"Anglais pour adultes"}');
 insert into ids values('d4',l);
 sh:=(select left(md5(lower(btrim(coalesce(s.source_label,'')))),8) from public.crm_submissions s join public.crm_leads x on x.first_submission_id=s.id where x.id=l);
 perform pg_temp.actor(1);
 perform pg_temp.denied($q$select crm_security.d4_plan('{"program":{"zz":"Adults"}}')$q$,'22023','catalogue.d4_mapping');
 perform pg_temp.denied($q$select crm_security.d4_plan('{"source":{"0123abcd":"meta_form"}}')$q$,'22023','catalogue.d4_mapping');
 m:=jsonb_build_object('program',jsonb_build_object(ph,'Adults'),'source',jsonb_build_object(sh,'inbound_call'));
 plan:=crm_security.d4_plan(m);
 perform pg_temp.ok((plan->'counts'->'program'->>'Adults')::int>=1 and (plan->'counts'->'source'->>'inbound_call')::int>=1
  and (plan->'counts'->'student_referral'->>'google')::int>=1,'plan counts per kind and code');
 perform pg_temp.denied(format($q$select crm_security.d4_apply(%L,'{}')$q$,m),'22023','catalogue.d4_counts');
 res:=crm_security.d4_apply(m,plan);
 perform pg_temp.ok((select session_type='Adults' and origin_code='inbound_call' from public.crm_leads where id=l),'D4 writes the mapped programme and origin');
 perform pg_temp.ok((select origin_code='google' from public.students where id='a7140000-0000-0000-0000-000000000040'),'D4 maps the old learner answer');
 perform pg_temp.ok((select count(*)=(res->>'changed')::int from public.crm_data_step_journal where step='d4'),'every change journalled');
 perform pg_temp.denied(format($q$select crm_security.d4_apply(%L,%L)$q$,m,plan),'22023','catalogue.d4_applied');
 -- A value changed after D4 is kept by the revert.
 perform pg_temp.actor(3);
 perform public.crm_update_prospect(gen_random_uuid(),jsonb_build_object('lead_id',l,'expected_version',pg_temp.v(l),'session_type','Yearly'));
 perform pg_temp.actor(1);
 res:=crm_security.d4_revert();
 perform pg_temp.ok((select session_type='Yearly' and origin_code is null from public.crm_leads where id=l),'revert restores the unchanged origin and keeps the edited programme');
 perform pg_temp.ok(jsonb_array_length(res->'skipped')=1,'the edited value is listed as skipped');
 perform pg_temp.ok((select origin_code is null from public.students where id='a7140000-0000-0000-0000-000000000040'),'learner origin back to empty');
 perform pg_temp.denied('select crm_security.d4_revert()');
end $$;
\echo PASS D4

rollback;
\echo PASS test-catalogues.sql
