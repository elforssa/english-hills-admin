-- Local Supabase only; all fixtures are synthetic and rolled back.
\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email,aud,role,created_at,updated_at)
values ('73000000-0000-0000-0000-000000000001','placement-staff@example.test','authenticated','authenticated',now(),now());
update public.profiles set role='director' where id='73000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claim.sub','73000000-0000-0000-0000-000000000001',true);
set local role authenticated;
insert into public.students(full_name,status,session_type)
select 'Placement regression ' || i,'Enrolled','Yearly' from generate_series(1,25) i;
insert into public.students(full_name,status) values ('Placement regression prospect','Prospect');
insert into public.groups(id,name,session_type,niveau)
values ('73000000-0000-0000-0000-000000000002','Placement regression group','Yearly','Child 1');
insert into public.enrollments(student_id,status,session_type,school_year)
select id,'Confirmed','Yearly','2026/2027' from public.students where full_name='Placement regression 1';
do $$ declare result jsonb; begin
  result := public.search_students_page(p_search=>'Placement regression',p_group=>'unassigned');
  if (result->>'count')::int <> 25 or jsonb_array_length(result->'rows') <> 20 then
    raise exception 'Unassigned filtering/pagination lost enrolled students';
  end if;
  result := public.search_students_page(p_search=>'Placement regression',p_group=>'unassigned',p_page=>2);
  if jsonb_array_length(result->'rows') <> 5 then raise exception 'Second page incorrect'; end if;
  result := public.search_students_page(p_search=>'Placement regression',p_group=>'unassigned',p_page_size=>0);
  if jsonb_array_length(result->'rows') <> 25 then raise exception 'Export incomplete'; end if;
  if not exists(select 1 from jsonb_array_elements(result->'rows') r
    where r->>'full_name'='Placement regression 1' and jsonb_array_length(r->'pending_enrollments')=1)
  then raise exception 'Paid enrollment unavailable for placement'; end if;
end $$;
update public.enrollments set group_id='73000000-0000-0000-0000-000000000002',level='Child 1'
where student_id=(select id from public.students where full_name='Placement regression 1');
do $$ declare result jsonb; begin
  result := public.search_students_page(p_search=>'Placement regression',p_group=>'unassigned',p_page_size=>0);
  if (result->>'count')::int <> 24 then raise exception 'Assigned student still unassigned'; end if;
  result := public.search_students_page(p_search=>'Placement regression',p_page_size=>0);
  if not exists(select 1 from jsonb_array_elements(result->'rows') r
    where r->>'full_name'='Placement regression 1' and r->>'group_name'='Placement regression group'
      and r->>'status'='Enrolled' and r->'pending_enrollments'='[]'::jsonb)
  then raise exception 'Assignment did not preserve enrolled student/group display'; end if;
end $$;
-- Another paid session still needs placement even if the dossier already has a group.
insert into public.enrollments(student_id,status,session_type,school_year)
select id,'Confirmed','Adults','2026/2027' from public.students where full_name='Placement regression 1';
do $$ declare result jsonb; begin
  result := public.search_students_page(p_search=>'Placement regression',p_group=>'unassigned',p_page_size=>0);
  if (result->>'count')::int <> 25 then raise exception 'Additional session placement was hidden'; end if;
end $$;
rollback;
\echo student placement pagination and assignment tests passed
