-- Local synthetic 097 search/filter regression. Fixture and legacy probe roll back.
\set ON_ERROR_STOP on
begin;

insert into auth.users(id,email,aud,role,created_at,updated_at) values
 ('97000000-0000-0000-0000-000000000001','group-filter-reception@example.test','authenticated','authenticated',now(),now()),
 ('97000000-0000-0000-0000-000000000002','group-filter-director@example.test','authenticated','authenticated',now(),now());
update public.profiles set role='receptionist' where id='97000000-0000-0000-0000-000000000001';
update public.profiles set role='director' where id='97000000-0000-0000-0000-000000000002';

insert into public.groups(id,name,session_type,niveau)
values('97000000-0000-0000-0000-000000000100','Filter Child 1','Yearly','Child 1');
insert into public.students(id,full_name,status,session_type,niveau_cefr,groupe_id) values
 ('97000000-0000-0000-0000-000000000201','Filter 097 dossier','Enrolled','Yearly','Child 1',null),
 ('97000000-0000-0000-0000-000000000202','Filter 097 submitted','Enrolled','Yearly','Child 1','97000000-0000-0000-0000-000000000100'),
 ('97000000-0000-0000-0000-000000000203','Filter 097 review','Enrolled','Yearly','Child 1','97000000-0000-0000-0000-000000000100'),
 ('97000000-0000-0000-0000-000000000204','Filter 097 confirmed','Enrolled','Yearly','Child 1','97000000-0000-0000-0000-000000000100'),
 ('97000000-0000-0000-0000-000000000205','Filter 097 validated legacy','Enrolled','Yearly','Child 1','97000000-0000-0000-0000-000000000100'),
 ('97000000-0000-0000-0000-000000000206','Filter 097 already assigned','Enrolled','Yearly','Child 1',null),
 ('97000000-0000-0000-0000-000000000207','Filter 097 rejected with dossier group','Enrolled','Yearly','Child 1','97000000-0000-0000-0000-000000000100'),
 ('97000000-0000-0000-0000-000000000208','Filter 097 rejected dossier only','Enrolled','Yearly','Child 1',null);
insert into public.enrollments(id,student_id,group_id,status,session_type,level,school_year) values
 ('97000000-0000-0000-0000-000000000302','97000000-0000-0000-0000-000000000202',null,'Submitted','Yearly','Child 1','2026/2027'),
 ('97000000-0000-0000-0000-000000000303','97000000-0000-0000-0000-000000000203',null,'Under Review','Yearly','Child 1','2026/2027'),
 ('97000000-0000-0000-0000-000000000304','97000000-0000-0000-0000-000000000204',null,'Confirmed','Yearly','Child 1','2026/2027'),
 ('97000000-0000-0000-0000-000000000306','97000000-0000-0000-0000-000000000206','97000000-0000-0000-0000-000000000100','Submitted','Yearly','Child 1','2026/2027'),
 ('97000000-0000-0000-0000-000000000307','97000000-0000-0000-0000-000000000207',null,'Rejected','Yearly','Child 1','2026/2027'),
 ('97000000-0000-0000-0000-000000000308','97000000-0000-0000-0000-000000000208',null,'Rejected','Yearly','Child 1','2026/2027');

-- A legacy unassigned Validated row cannot be created through today's guard.
-- Bypass triggers only in this local fixture session to prove the read path
-- surfaces it for repair through the existing checked assignment command.
set local session_replication_role = replica;
insert into public.enrollments(id,student_id,group_id,status,session_type,level,school_year)
values('97000000-0000-0000-0000-000000000305','97000000-0000-0000-0000-000000000205',null,
  'Validated','Yearly','Child 1','2026/2027');
set local session_replication_role = origin;

select set_config('request.jwt.claim.sub','97000000-0000-0000-0000-000000000001',true);
set local role authenticated;
do $$ declare result jsonb; actual uuid[]; begin
  result := public.search_students_page(p_search=>'Filter 097',p_status=>'all_shown',
    p_group=>'unassigned',p_page_size=>20);
  select array_agg((r->>'id')::uuid order by (r->>'id')::uuid) into actual
  from jsonb_array_elements(result->'rows') r;
  if actual is distinct from array[
    '97000000-0000-0000-0000-000000000201'::uuid,
    '97000000-0000-0000-0000-000000000202'::uuid,
    '97000000-0000-0000-0000-000000000203'::uuid,
    '97000000-0000-0000-0000-000000000204'::uuid,
    '97000000-0000-0000-0000-000000000205'::uuid,
    '97000000-0000-0000-0000-000000000208'::uuid] or (result->>'count')::integer<>6 then
    raise exception 'Receptionist filter disagrees with assignment actions: %',actual;
  end if;
end $$;
reset role;

select set_config('request.jwt.claim.sub','97000000-0000-0000-0000-000000000002',true);
set local role authenticated;
do $$ declare result jsonb; actual uuid[]; begin
  result := public.search_students_page(p_search=>'Filter 097',p_status=>'all_shown',
    p_group=>'unassigned',p_page_size=>20);
  select array_agg((r->>'id')::uuid order by (r->>'id')::uuid) into actual
  from jsonb_array_elements(result->'rows') r;
  if actual is distinct from array[
    '97000000-0000-0000-0000-000000000201'::uuid,
    '97000000-0000-0000-0000-000000000204'::uuid,
    '97000000-0000-0000-0000-000000000206'::uuid,
    '97000000-0000-0000-0000-000000000208'::uuid] or (result->>'count')::integer<>4 then
    raise exception 'Management filter behavior changed: %',actual;
  end if;
end $$;
rollback;
\echo PASS 097 receptionist filter matches enrollment and dossier actions; management behavior preserved
