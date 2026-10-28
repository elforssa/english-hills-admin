-- Batch G budget fixture (synthetic, plan SCG-r1): a school at scale :k (default 5),
-- where 1 is about today's size from recorded counts (300 learners, about 450
-- charges and 330 receipts; 30,000 activity entries is an assumption). Triggers
-- and FK checks are skipped (replica role); rows are referentially consistent.
\set ON_ERROR_STOP on
\if :{?k}
\else
\set k 5
\endif
begin;
set local session_replication_role = replica;
truncate public.payroll, public.activity_log, public.attendance, public.assessments, public.placement_tests,
  public.receipts, public.charges, public.enrollments, public.family_links, public.students,
  public.groups, public.teachers cascade;
delete from public.profiles where email like '%@batchg.test' or email like '%@scg.test';
delete from auth.users where email like '%@batchg.test' or email like '%@scg.test';

-- Seven role fixtures (fixed ids so the probes can impersonate them).
insert into auth.users (id, email, aud, role, instance_id)
select ('c0000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, r || '@batchg.test', 'authenticated', 'authenticated',
       '00000000-0000-0000-0000-000000000000'
from (values (1,'director'),(2,'admin'),(3,'receptionist'),(4,'teacher'),(5,'parent'),(6,'student'),(7,'pending')) v(n, r);
insert into public.teachers (id, full_name, email, contract_type)
select gen_random_uuid(), 'Teacher ' || i, 'teacher' || i || '@batchg.test', 'Employé' from generate_series(1, 15 * :k) i;
insert into public.profiles (id, email, full_name, role, linked_teacher_id)
select ('c0000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, r || '@batchg.test', initcap(r), r,
       case when r = 'teacher' then (select id from public.teachers order by full_name limit 1) end
from (values (1,'director'),(2,'admin'),(3,'receptionist'),(4,'teacher'),(5,'parent'),(6,'student'),(7,'pending')) v(n, r);

insert into public.groups (id, name, niveau, teacher_id, session_type, categorie)
select gen_random_uuid(), 'G' || i, 'A1', (select id from public.teachers order by full_name offset (i % (15 * :k)) limit 1), 'Yearly', 'Adultes'
from generate_series(1, 30 * :k) i;

insert into public.students (id, created_at, full_name, email, status, age_category, session_type, niveau_cefr, deleted_at)
select gen_random_uuid(), now() - (i || ' hours')::interval, 'Learner ' || i, 'learner' || i || '@batchg.test',
       (array['Enrolled','Enrolled','Enrolled','Trial','Prospect','Inactive','Alumni'])[1 + i % 7],
       'Adults (18+)', 'Yearly', 'A1', case when i % 50 = 0 then now() end
from generate_series(1, 300 * :k) i;

-- One active membership per learner, plus a confirmed-without-group enrollment for every 10th.
insert into public.enrollments (id, created_at, student_id, group_id, status, session_type, school_year)
select gen_random_uuid(), s.created_at, s.id, g.id, 'Validated', 'Yearly', '2026/2027'
from (select id, created_at, row_number() over (order by id) rn from public.students) s
join (select id, row_number() over (order by id) - 1 gn from public.groups) g on g.gn = s.rn % (30 * :k);
update public.students s set groupe_id = e.group_id from public.enrollments e where e.student_id = s.id;
insert into public.enrollments (id, student_id, status, session_type, school_year)
select gen_random_uuid(), id, 'Confirmed', 'Yearly', '2027/2028' from public.students where ('x' || left(id::text, 1))::bit(4)::int = 0;

insert into public.charges (id, created_at, student_id, session_type, service_description, plan_type, gross_amount, discount_amount, due_date, legacy, school_year)
select gen_random_uuid(), s.created_at, s.id, 'Yearly', 'Formation annuelle', 'Standard', 6000, 0,
       current_date + ((n * 30) - 45), true, '2026/2027'
from public.students s cross join generate_series(1, 2) n where n = 1 or ('x' || left(s.id::text, 1))::bit(4)::int < 8;

insert into public.receipts (id, created_at, student_id, receipt_number, date, nom_prenom, montant_total, montant_paye, mode_paiement, charge_id, legacy)
select gen_random_uuid(), c.created_at, c.student_id, 'G' || row_number() over (), current_date, 'Learner', 6000,
       (array[2000, 3000, 6000])[1 + (row_number() over ()) % 3], 'Espèces', c.id, true
from public.charges c where ('x' || left(c.id::text, 1))::bit(4)::int < 12;

insert into public.attendance (student_id, group_id, session_date, status, created_at)
select s.id, s.groupe_id, current_date - d, 'Présent', now() - (d || ' days')::interval
from public.students s cross join generate_series(1, 60) d where s.groupe_id is not null;

insert into public.assessments (student_id, group_id, terme, note_finale)
select s.id, s.groupe_id, t, 15 from public.students s cross join unnest(array['Sept–Déc','Jan–Mar','Avr–Juin']) t;
insert into public.placement_tests (student_id, student_name, date_test, status)
select id, full_name, current_date, 'Passé' from public.students;

insert into public.family_links (student_id, relation, profile_id, invite_email, status, activated_at)
select id, r, p::uuid, 'fam@batchg.test', 'active', now() from (select id, row_number() over (order by full_name) rn from public.students where deleted_at is null) s
join (values (1,'parent','c0000000-0000-4000-8000-000000000005'),(2,'parent','c0000000-0000-4000-8000-000000000005'),(3,'self','c0000000-0000-4000-8000-000000000006')) v(rn, r, p) using (rn);

insert into public.payroll (teacher_id, teacher_name, mois, annee, contract_type, salaire_brut, salaire_net, statut)
select t.id, t.full_name, m, '2026', 'Employé', 8000, 7000, 'Validé' from public.teachers t cross join unnest(array['Janvier','Février','Mars','Avril','Mai','Juin','Septembre','Octobre']) m;
insert into public.activity_log (created_at, actor_id, actor_email, action, target_table, target_id, changed_columns, before, after)
select now() - (i || ' minutes')::interval, 'c0000000-0000-4000-8000-000000000001', 'director@batchg.test',
       (array['INSERT','UPDATE','UPDATE','DELETE'])[1 + i % 4], (array['students','receipts','enrollments','charges'])[1 + i % 4],
       gen_random_uuid(), array['status','notes'],
       jsonb_build_object('status','Prospect','notes', repeat('x', 400)), jsonb_build_object('status','Enrolled','notes', repeat('y', 400))
from generate_series(1, 30000 * :k) i;
commit;
analyze public.students, public.enrollments, public.charges, public.receipts, public.attendance, public.assessments,
  public.placement_tests, public.activity_log, public.payroll, public.groups, public.teachers, public.profiles, public.family_links;
select 'students', count(*) from public.students union all select 'enrollments', count(*) from public.enrollments
union all select 'charges', count(*) from public.charges union all select 'receipts', count(*) from public.receipts
union all select 'attendance', count(*) from public.attendance union all select 'activity_log', count(*) from public.activity_log;
