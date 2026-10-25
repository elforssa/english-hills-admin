-- Local synthetic "Groupe à affecter" regression (097, rule replaced by EGC M2).
-- After the clean-up and M2 the filter is the same for every role: a Confirmed
-- enrollment without a group, or an Enrolled/Trial learner with no membership and
-- no Submitted/Under Review/Confirmed enrollment. Fixtures roll back.
\set ON_ERROR_STOP on
begin;

insert into auth.users(id,email,aud,role,created_at,updated_at) values
 ('97000000-0000-0000-0000-000000000001','group-filter-reception@example.test','authenticated','authenticated',now(),now()),
 ('97000000-0000-0000-0000-000000000002','group-filter-director@example.test','authenticated','authenticated',now(),now());
update public.profiles set role='receptionist' where id='97000000-0000-0000-0000-000000000001';
update public.profiles set role='director' where id='97000000-0000-0000-0000-000000000002';

insert into public.groups(id,name,session_type,niveau) values
 ('97000000-0000-0000-0000-000000000100','Filter Child 1','Yearly','Child 1'),
 ('97000000-0000-0000-0000-000000000101','Filter MAN A1','Mise à niveau','A1');
insert into public.students(id,full_name,status,session_type,niveau_cefr) values
 ('97000000-0000-0000-0000-000000000202','Filter 097 submitted','Prospect','Yearly','Child 1'),
 ('97000000-0000-0000-0000-000000000203','Filter 097 review','Prospect','Yearly','Child 1'),
 ('97000000-0000-0000-0000-000000000204','Filter 097 confirmed','Prospect','Yearly','Child 1'),
 ('97000000-0000-0000-0000-000000000205','Filter 097 ended','Prospect','Yearly','Child 1'),
 ('97000000-0000-0000-0000-000000000206','Filter 097 submitted with group','Prospect','Yearly','Child 1'),
 ('97000000-0000-0000-0000-000000000207','Filter 097 rejected then placed','Prospect','Yearly','Child 1'),
 ('97000000-0000-0000-0000-000000000209','Filter 097 second programme','Prospect','Yearly','Child 1'),
 ('97000000-0000-0000-0000-000000000210','Filter 097 trial member','Prospect','Yearly','Child 1');
-- Enrolled files without any enrollment (paid on a historical receipt, not a
-- former learner) remain possible after the clean-up; the learner file no longer
-- takes an enrolled status directly, so they are seeded with triggers bypassed.
set local session_replication_role = replica;
insert into public.students(id,full_name,status,session_type,niveau_cefr) values
 ('97000000-0000-0000-0000-000000000201','Filter 097 dossier','Enrolled','Yearly','Child 1'),
 ('97000000-0000-0000-0000-000000000208','Filter 097 rejected dossier only','Enrolled','Yearly','Child 1'),
 ('97000000-0000-0000-0000-000000000211','Filter 097 former learner','Alumni','Yearly','Child 1');
set local session_replication_role = origin;
insert into public.enrollments(id,student_id,group_id,status,session_type,level,school_year) values
 ('97000000-0000-0000-0000-000000000302','97000000-0000-0000-0000-000000000202',null,'Submitted','Yearly','Child 1','2026/2027'),
 ('97000000-0000-0000-0000-000000000303','97000000-0000-0000-0000-000000000203',null,'Under Review','Yearly','Child 1','2026/2027'),
 ('97000000-0000-0000-0000-000000000304','97000000-0000-0000-0000-000000000204',null,'Confirmed','Yearly','Child 1','2026/2027'),
 ('97000000-0000-0000-0000-000000000305','97000000-0000-0000-0000-000000000205','97000000-0000-0000-0000-000000000100','Validated','Yearly','Child 1','2026/2027'),
 ('97000000-0000-0000-0000-000000000306','97000000-0000-0000-0000-000000000206','97000000-0000-0000-0000-000000000100','Submitted','Yearly','Child 1','2026/2027'),
 ('97000000-0000-0000-0000-000000000307','97000000-0000-0000-0000-000000000207',null,'Rejected','Yearly','Child 1','2025/2026'),
 ('97000000-0000-0000-0000-000000000317','97000000-0000-0000-0000-000000000207','97000000-0000-0000-0000-000000000100','Validated','Yearly','Child 1','2026/2027'),
 ('97000000-0000-0000-0000-000000000308','97000000-0000-0000-0000-000000000208',null,'Rejected','Yearly','Child 1','2026/2027'),
 ('97000000-0000-0000-0000-000000000309','97000000-0000-0000-0000-000000000209','97000000-0000-0000-0000-000000000100','Validated','Yearly','Child 1','2026/2027'),
 ('97000000-0000-0000-0000-000000000319','97000000-0000-0000-0000-000000000209',null,'Confirmed','Mise à niveau',null,'2026/2027'),
 ('97000000-0000-0000-0000-000000000310','97000000-0000-0000-0000-000000000210','97000000-0000-0000-0000-000000000100','Trial','Yearly','Child 1','2026/2027');
-- 205 leaves through the leaver core (Ancien apprenant).
select academic_security.leave('97000000-0000-0000-0000-000000000205','Alumni','Synthetic leaver',null);

create function pg_temp.unassigned() returns uuid[] language plpgsql as $$
declare result jsonb; actual uuid[]; begin
  result := public.search_students_page(p_search=>'Filter 097',p_status=>'all_shown',p_group=>'unassigned',p_page_size=>20);
  select array_agg((r->>'id')::uuid order by (r->>'id')::uuid) into actual from jsonb_array_elements(result->'rows') r;
  if (result->>'count')::integer <> coalesce(cardinality(actual),0) then raise exception 'Count disagrees with rows'; end if;
  return actual;
end $$;
create temp table expected_unassigned(ids uuid[]);
insert into expected_unassigned values (array[
  '97000000-0000-0000-0000-000000000201'::uuid,
  '97000000-0000-0000-0000-000000000204'::uuid,
  '97000000-0000-0000-0000-000000000208'::uuid,
  '97000000-0000-0000-0000-000000000209'::uuid]);
grant select on expected_unassigned to public;

select set_config('request.jwt.claim.sub','97000000-0000-0000-0000-000000000001',true);
set local role authenticated;
do $$ begin
  if pg_temp.unassigned() is distinct from (select ids from expected_unassigned) then
    raise exception 'Receptionist "Groupe à affecter" disagrees with the EGC rule: %', pg_temp.unassigned();
  end if;
end $$;
reset role;

select set_config('request.jwt.claim.sub','97000000-0000-0000-0000-000000000002',true);
set local role authenticated;
do $$ declare result jsonb; begin
  if pg_temp.unassigned() is distinct from (select ids from expected_unassigned) then
    raise exception 'Management "Groupe à affecter" disagrees with the EGC rule: %', pg_temp.unassigned();
  end if;
  -- Main group plus a count of further memberships; the default list drops Alumni.
  result := public.search_students_page(p_search=>'Filter 097 second programme',p_page_size=>20);
  if result->'rows'->0->>'group_name' <> 'Filter Child 1' or (result->'rows'->0->>'extra_group_count')::integer <> 0 then
    raise exception 'Main group display wrong: %', result->'rows'->0; end if;
  result := public.search_students_page(p_search=>'Filter 097',p_page_size=>20);
  if exists (select 1 from jsonb_array_elements(result->'rows') r where r->>'status' not in ('Enrolled','Trial')) then
    raise exception 'Default list shows a non-active learner'; end if;
end $$;
reset role;
-- A learner in two groups shows its main group plus one.
update public.enrollments set group_id='97000000-0000-0000-0000-000000000101',level='A1'
 where id='97000000-0000-0000-0000-000000000319';
select set_config('request.jwt.claim.sub','97000000-0000-0000-0000-000000000002',true);
set local role authenticated;
do $$ declare result jsonb; begin
  result := public.search_students_page(p_search=>'Filter 097 second programme',p_page_size=>20);
  if result->'rows'->0->>'group_name' <> 'Filter Child 1' or (result->'rows'->0->>'extra_group_count')::integer <> 1 then
    raise exception 'Second programme display wrong: %', result->'rows'->0; end if;
  if '97000000-0000-0000-0000-000000000209'::uuid = any(pg_temp.unassigned()) then
    raise exception 'Placed second programme still awaits a group'; end if;
end $$;
rollback;
\echo PASS "Groupe à affecter" follows enrollments for every role; main group plus extra memberships
