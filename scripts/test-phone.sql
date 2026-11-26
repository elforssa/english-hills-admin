-- RWR-r5 §5.1 / invariant 6 — migration 138's phone functions against the shared
-- fixture (scripts/fixtures/phone-cases.json, also read by test-phone.mjs), the
-- phone trigger on students and authorized adults, and P-SYS: every system update
-- of a student whose stored number is bad still succeeds and leaves it unchanged.
-- Synthetic data only; every number is invented. Everything rolls back.
--
-- Run: psql -v ON_ERROR_STOP=1 -v phone_cases="$(cat scripts/fixtures/phone-cases.json)" -f scripts/test-phone.sql
\set ON_ERROR_STOP on
begin;

create temp table phone_fixture as select :'phone_cases'::jsonb doc;

create function pg_temp.check_kind(raw text) returns text language plpgsql as $$
declare h text; e text;
begin
 e:=public.require_phone(raw);
 return case when e is null then 'empty' else 'ok' end;
exception when invalid_parameter_value then
 get stacked diagnostics h = pg_exception_hint;
 return case h when 'people.phone_invalid' then 'invalid' when 'people.phone_placeholder' then 'placeholder' else 'other:'||h end;
end $$;

create function pg_temp.refused(statement text, expected_hint text, label text) returns void language plpgsql as $$
declare h text;
begin
 begin execute statement;
 exception when others then
  get stacked diagnostics h = pg_exception_hint;
  if h is distinct from expected_hint then raise exception 'FAIL %: hint % (expected %)', label, h, expected_hint; end if;
  return;
 end;
 raise exception 'FAIL %: accepted', label;
end $$;

-- 1. One normaliser: the SQL functions agree with the fixture (and so with src/lib/phone.mjs).
do $$
declare c jsonb; n integer:=0;
begin
 for c in select jsonb_array_elements(doc->'cases') from phone_fixture loop
  if public.phone_e164(c->>'raw') is distinct from c->>'e164' then raise exception 'FAIL phone_e164(%) = % (expected %)',c->'raw',public.phone_e164(c->>'raw'),c->'e164'; end if;
  if public.phone_key(c->>'raw') is distinct from c->>'key' then raise exception 'FAIL phone_key(%) = % (expected %)',c->'raw',public.phone_key(c->>'raw'),c->'key'; end if;
  if public.phone_is_placeholder(public.phone_e164(c->>'raw')) is distinct from (c->>'placeholder')::boolean then raise exception 'FAIL placeholder(%)',c->'raw'; end if;
  if pg_temp.check_kind(c->>'raw') is distinct from c->>'check' then raise exception 'FAIL require_phone(%) = % (expected %)',c->'raw',pg_temp.check_kind(c->>'raw'),c->'check'; end if;
  -- The CRM normaliser: E.164, and a placeholder is no phone (NF-9, NF-10).
  if crm_security.normalize_phone(c->>'raw') is distinct from (case when (c->>'placeholder')::boolean then null else c->>'e164' end) then
   raise exception 'FAIL crm_security.normalize_phone(%)',c->'raw'; end if;
  n:=n+1;
 end loop;
 for c in select jsonb_array_elements(doc->'search') from phone_fixture loop
  if coalesce(strpos(public.phone_key(c->>'stored'),public.phone_search_key(c->>'query'))>0,false) is distinct from (c->>'match')::boolean then
   raise exception 'FAIL search % in %',c->'query',c->'stored'; end if;
 end loop;
 if n<20 then raise exception 'FAIL fixture not loaded'; end if;
 if public.phone_mask('+212612345678')<>'06 •• •• •• 78' or public.phone_mask('06123')<>'•••' or public.phone_mask('') is not null then
  raise exception 'FAIL phone_mask'; end if;
 if public.person_name_key('  Sara EL-Amrani ')<>public.person_name_key('amrani sara el') or public.person_name_key('Éloïse')<>'eloise' then
  raise exception 'FAIL person_name_key'; end if;
 raise notice 'PASS phone functions: % fixture cases, search pairs, mask, name key', n;
end $$;

-- 2. Users and a group for the real commands.
insert into auth.users(id,email,aud,role,email_confirmed_at,created_at,updated_at) values
 ('9a138000-0000-0000-0000-000000000001','phone-director@example.test','authenticated','authenticated',now(),now(),now());
update public.profiles set role='director' where id='9a138000-0000-0000-0000-000000000001';
insert into public.groups(id,name,session_type,niveau,annee)
 values('9a138000-0000-0000-0000-000000000030','Phone group','Yearly','Child 1','2026-2027');

-- 3. The trigger: normalised on insert; refused when invalid or a placeholder.
do $$ begin
 insert into public.students(id,full_name,telephone,status,session_type) values
  ('9a138000-0000-0000-0000-000000000010','Phone format learner','06 12 34 56 78','Prospect','Yearly'),
  ('9a138000-0000-0000-0000-000000000011','Phone no-plus learner','212798765432','Prospect','Yearly'),
  ('9a138000-0000-0000-0000-000000000012','Phone blank learner','   ','Prospect','Yearly');
 if (select telephone from public.students where id='9a138000-0000-0000-0000-000000000010')<>'+212612345678'
  or (select telephone from public.students where id='9a138000-0000-0000-0000-000000000011')<>'+212798765432'
  or (select telephone from public.students where id='9a138000-0000-0000-0000-000000000012') is not null then
  raise exception 'FAIL insert not normalised'; end if;
end $$;
select pg_temp.refused($q$insert into public.students(full_name,telephone,status,session_type) values('x','0600000000','Prospect','Yearly')$q$,'people.phone_placeholder','student placeholder');
select pg_temp.refused($q$insert into public.students(full_name,telephone,status,session_type) values('x','06123','Prospect','Yearly')$q$,'people.phone_invalid','student invalid');
select pg_temp.refused($q$insert into public.authorized_adults(student_id,full_name,telephone,relation) values('9a138000-0000-0000-0000-000000000010','x','','Parent')$q$,'people.phone_invalid','adult blank');
select pg_temp.refused($q$insert into public.authorized_adults(student_id,full_name,telephone,relation) values('9a138000-0000-0000-0000-000000000010','x','0711111111','Parent')$q$,'people.phone_placeholder','adult placeholder');
do $$ begin
 insert into public.authorized_adults(id,student_id,full_name,telephone,relation)
  values('9a138000-0000-0000-0000-000000000050','9a138000-0000-0000-0000-000000000010','Phone adult','0033 6 12 34 56 78','Parent');
 if (select telephone from public.authorized_adults where id='9a138000-0000-0000-0000-000000000050')<>'+33612345678' then raise exception 'FAIL adult not normalised'; end if;
 raise notice 'PASS trigger: normalised on insert; invalid, placeholder and blank adult refused';
end $$;

-- 4. P-SYS. Rows stored before 138 (the trigger is off only for this seed, as their
--    numbers were written before the rule existed).
alter table public.students disable trigger people_phone_guard;
insert into public.students(id,full_name,telephone,status,session_type,niveau_cefr) values
 ('9a138000-0000-0000-0000-000000000021','Legacy invalid','06 12 34','Prospect','Yearly','Child 1'),
 ('9a138000-0000-0000-0000-000000000022','Legacy placeholder','0600000000','Prospect','Yearly','Child 1'),
 ('9a138000-0000-0000-0000-000000000023','Legacy unparseable','voir maman','Prospect','Yearly','Child 1');
alter table public.students enable trigger people_phone_guard;
create temp table psys_before as select id,telephone from public.students where id::text like '9a138000-0000-0000-0000-00000000002%';
grant select on psys_before to authenticated;

create function pg_temp.su(p uuid) returns timestamptz language sql security definer as $$
 select updated_at from public.students where id=p $$;
create function pg_temp.enrollment(p uuid) returns uuid language sql security definer as $$
 select id from public.enrollments where student_id=p order by created_at desc limit 1 $$;
create function pg_temp.eu(p uuid) returns timestamptz language sql security definer as $$
 select updated_at from public.enrollments where id=p $$;

select set_config('request.jwt.claim.sub','9a138000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"9a138000-0000-0000-0000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$
declare s uuid; begin
 foreach s in array array['9a138000-0000-0000-0000-000000000021','9a138000-0000-0000-0000-000000000022','9a138000-0000-0000-0000-000000000023']::uuid[] loop
  -- a payment (sets the programme on the file)
  perform public.create_charge_payment(jsonb_build_object('idempotency_key',gen_random_uuid(),'student_id',s,'session_type','Yearly',
   'school_year','2026/2027','level','Child 1','gross_amount',100,'discount_amount',0,'payment_amount',50,'payment_method','Espèces'));
  -- a group placement, then a removal
  perform public.place_learner_in_group(s,'9a138000-0000-0000-0000-000000000030',pg_temp.su(s),pg_temp.enrollment(s),null,pg_temp.eu(pg_temp.enrollment(s)));
  perform public.remove_learner_from_group(s,'9a138000-0000-0000-0000-000000000030',pg_temp.su(s));
  -- a status change (the learner leaves), an archive and a restore
  perform public.end_learner(s,pg_temp.su(s),'Inactive','Fin de parcours',null);
  perform public.soft_delete_student(s);
  perform public.restore_student(s);
 end loop;
 if exists(select 1 from public.students x join psys_before b on b.id=x.id where x.telephone is distinct from b.telephone) then
  raise exception 'FAIL P-SYS: a system update changed a stored phone'; end if;
 raise notice 'PASS P-SYS: payment, placement, removal, status change, archive and restore keep a bad stored phone';
end $$;
-- Editing the phone itself is refused until it is valid or empty.
select pg_temp.refused($q$update public.students set telephone='06 12 34 5' where id='9a138000-0000-0000-0000-000000000021'$q$,'people.phone_invalid','edit to invalid');
select pg_temp.refused($q$update public.students set telephone='0622222222' where id='9a138000-0000-0000-0000-000000000022'$q$,'people.phone_placeholder','edit to placeholder');
do $$ begin
 update public.students set telephone='07 98 76 54 31' where id='9a138000-0000-0000-0000-000000000021';
 update public.students set telephone='' where id='9a138000-0000-0000-0000-000000000022';
 if (select telephone from public.students where id='9a138000-0000-0000-0000-000000000021')<>'+212798765431'
  or (select telephone from public.students where id='9a138000-0000-0000-0000-000000000022') is not null then
  raise exception 'FAIL phone edit not normalised'; end if;
 raise notice 'PASS phone edit: refused until valid or empty, then stored in E.164';
end $$;
reset role;

-- 5. Search: the students list and the receipt picker find a phone in any format.
do $$ declare r jsonb; begin
 perform set_config('request.jwt.claim.sub','9a138000-0000-0000-0000-000000000001',true);
 r:=public.search_students_page('06 12 34 56',p_status=>'all_shown');
 if not (r->'rows') @> '[{"id":"9a138000-0000-0000-0000-000000000010"}]' then raise exception 'FAIL students list phone search'; end if;
 r:=public.search_desk_students('+212 6 12 34 56 78',20);
 if not (r->'rows') @> '[{"id":"9a138000-0000-0000-0000-000000000010"}]' then raise exception 'FAIL receipt picker phone search'; end if;
 r:=public.search_desk_students('0612',20);
 if (r->'rows') @> '[{"id":"9a138000-0000-0000-0000-000000000010"}]' then raise exception 'FAIL short phone query matched as a phone'; end if;
 raise notice 'PASS phone search: students list and receipt picker, 6 digits or more';
end $$;

-- 6. D3 rehearsal (shipped, not run on Production): plan, apply with the approved
--    counts, revert. Unnormalisable numbers are never changed.
do $$ declare p jsonb; r jsonb; begin
 alter table public.students disable trigger people_phone_guard;
 insert into public.students(id,full_name,telephone,status,session_type) values
  ('9a138000-0000-0000-0000-000000000061','D3 no plus','212612340061','Prospect','Yearly'),
  ('9a138000-0000-0000-0000-000000000062','D3 no zero','612340062','Prospect','Yearly'),
  ('9a138000-0000-0000-0000-000000000063','D3 separators','06.12.34.00.63','Prospect','Yearly'),
  ('9a138000-0000-0000-0000-000000000064','D3 placeholder','0655555555','Prospect','Yearly'),
  ('9a138000-0000-0000-0000-000000000065','D3 bad','06 12 3','Prospect','Yearly');
 alter table public.students enable trigger people_phone_guard;
 p:=crm_security.d3_plan();
 if not (p->'counts'->'students' ?& array['no_plus','no_leading_zero','separators','placeholder','unnormalisable']) then raise exception 'FAIL d3_plan categories %',p->'counts'; end if;
 r:=crm_security.d3_apply(p);
 if (select telephone from public.students where id='9a138000-0000-0000-0000-000000000061')<>'+212612340061'
  or (select telephone from public.students where id='9a138000-0000-0000-0000-000000000062')<>'+212612340062'
  or (select telephone from public.students where id='9a138000-0000-0000-0000-000000000063')<>'+212612340063'
  or (select telephone from public.students where id='9a138000-0000-0000-0000-000000000064') is not null
  or (select telephone from public.students where id='9a138000-0000-0000-0000-000000000065')<>'06 12 3' then raise exception 'FAIL d3_apply result'; end if;
 if (select count(*) from public.crm_data_step_journal where step='d3')<>(r->>'changed')::int then raise exception 'FAIL d3 journal'; end if;
 p:=crm_security.d3_plan();
 if (p->'counts'->'students') ?| array['no_plus','no_leading_zero','separators','placeholder'] then raise exception 'FAIL d3 left work %',p->'counts'; end if;
 r:=crm_security.d3_revert();
 if (select telephone from public.students where id='9a138000-0000-0000-0000-000000000061')<>'212612340061'
  or (select telephone from public.students where id='9a138000-0000-0000-0000-000000000064')<>'0655555555' then raise exception 'FAIL d3_revert'; end if;
 begin perform crm_security.d3_revert(); raise exception 'FAIL second revert accepted'; exception when invalid_parameter_value then null; end;
 raise notice 'PASS D3 rehearsal: categories, apply with approved counts, unnormalisable untouched, revert';
end $$;

rollback;
