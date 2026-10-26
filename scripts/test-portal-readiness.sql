-- Portal readiness (migration 122, plan PRF-r2, ADR-011): cross-role denial suite.
-- Synthetic local fixtures, fully rolled back. Numbered tests follow the plan's
-- "Cross-role denial test suite design": T-01..T-08 column and value denial,
-- T-09..T-16 family isolation, T-17..T-22 invitation, T-23..T-27 teacher,
-- T-28..T-30 portfolio, T-31..T-35 messaging, T-39..T-40 grants and sign-in,
-- T-41..T-46 inboxes by account, T-47 Premium guard, T-48 family to teacher.
-- T-22's concurrent half is scripts/test-portal-readiness-concurrency.py; T-36..T-38
-- (origin guard) and the REST/value scans are scripts/test-portal-readiness.mjs.
\set ON_ERROR_STOP on
begin;
alter table public.receipts disable trigger on_receipt_created;

create function pg_temp.ok(value boolean, label text) returns void language plpgsql as $$ begin
  if value is not true then raise exception 'FAIL: %', label; end if;
end $$;
create function pg_temp.id(i integer) returns uuid language sql immutable as $$
  select ('12200000-0000-4000-8000-' || lpad(to_hex(i), 12, '0'))::uuid
$$;
-- Act as a stored-role user (or anonymous) through the API role, as PostgREST does.
create function pg_temp.act(i integer) returns void language plpgsql as $$ begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', case when i is null then '' else pg_temp.id(i)::text end, true);
  perform set_config('request.jwt.claims', case when i is null then '{"role":"anon"}'
    else json_build_object('sub', pg_temp.id(i), 'role', 'authenticated')::text end, true);
  execute case when i is null then 'set local role anon' else 'set local role authenticated' end;
end $$;
create function pg_temp.owner() returns void language plpgsql as $$ begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
end $$;
-- Expects one SQLSTATE and, when given, one exact hint; the statement's effects roll back.
create function pg_temp.fails(statement text, code text, hint text default null) returns void language plpgsql as $$
declare st text; h text; msg text; begin
  begin execute statement;
  exception when others then
    get stacked diagnostics st = returned_sqlstate, h = pg_exception_hint, msg = message_text;
    if st is distinct from code or (hint is not null and nullif(h, '') is distinct from hint) then
      raise exception 'FAIL: expected %/% from %, got %/% (%)', code, hint, statement, st, h, msg;
    end if;
    return;
  end;
  raise exception 'FAIL: expected %/% from %', code, hint, statement;
end $$;
-- A statement that must be refused or return nothing, never rows.
create function pg_temp.none(statement text) returns boolean language plpgsql as $$
declare n bigint; begin
  begin execute 'select count(*) from (' || statement || ') x' into n;
  exception when insufficient_privilege then return true; end;
  return n = 0;
end $$;
-- Every key at any depth of a JSON value.
create function pg_temp.keys(v jsonb) returns setof text language sql immutable as $$
  with recursive walk(j) as (select v union all
    select coalesce(e.value, a.value) from walk w
    left join lateral jsonb_each(case when jsonb_typeof(w.j) = 'object' then w.j end) e on true
    left join lateral jsonb_array_elements(case when jsonb_typeof(w.j) = 'array' then w.j end) a on true
    where coalesce(e.value, a.value) is not null)
  select distinct k from walk, lateral jsonb_object_keys(case when jsonb_typeof(j) = 'object' then j else '{}'::jsonb end) k
$$;
-- Fixture readers run as the owner whatever the acting role.
create function pg_temp.link_status(p uuid) returns text language sql security definer as $$
  select status from public.family_links where id = p $$;
create function pg_temp.pending_links(p_email text) returns bigint language sql security definer as $$
  select count(*) from public.family_links fl join public.pending_roles pr on pr.id = fl.pending_role_id
  where lower(pr.email) = p_email and fl.status = 'pending' $$;
create function pg_temp.recipient(p_table text, p uuid) returns uuid language plpgsql security definer as $$
declare r uuid; begin
  execute format('select recipient_profile_id from public.%I where id = %L', p_table, p) into r; return r;
end $$;
-- Staff-only and contact keys a portal response must never contain (D1).
create function pg_temp.staff_keys() returns text[] language sql immutable as $$
  select array['notes','referral_source','photo_consent_at','plan_type','premium_start_date','premium_end_date',
    'deleted_at','documents_urls','registration_request_id','registration_payload_hash','consent_at',
    'consent_policy_version','consent_source','payment_note','void_reason','voided_by','actor_id','actor_name',
    'email_delivery_status','email_request_id','email_attempt_count','email_last_attempted_at','email_last_error',
    'idempotency_key','legacy','photo_consent','created_by','legacy_receipt_id','examinateur','crm_lead_id',
    'email','telephone','parent_email','date_naissance','to_user_email','from_user_email','recipient_email']
$$;

-- ===========================================================================
-- Fixtures. Users: 1 director, 2 admin, 3 receptionist, 4 teacher T1 (group G1),
-- 5 teacher T2 (no group), 6 teacher T3 (record archived, still teacher and
-- linked), 7 parent A (linked to 201 and 202), 8 parent whose login equals A's
-- dossier address but is unlinked, 9 parent B (linked to 203, same surname),
-- 10 adult student (self link to 204), 11 pending, 12 office login (admin, Q6),
-- 13 teacher without a record.
-- ===========================================================================
insert into auth.users(id, email, aud, role, email_confirmed_at, created_at, updated_at)
select pg_temp.id(i), (array['pr-director','pr-admin','pr-reception','pr-t1','pr-t2','pr-t3','pr-parent-a',
  'pr-family-a','pr-parent-b','pr-adult','pr-pending','pr-office','pr-t4'])[i] || '@example.test',
  'authenticated', 'authenticated', now(), now(), now()
from generate_series(1, 13) i;
update public.profiles set role = (array['director','admin','receptionist','teacher','teacher','teacher','parent',
  'parent','parent','student','pending','admin','teacher'])[('x' || right(id::text, 4))::bit(16)::integer],
  full_name = 'PR User ' || right(id::text, 2)
where id::text like '12200000-%';
insert into public.app_config(key, value, label) values ('portal_office_profile_id', pg_temp.id(12)::text, 'Accueil portail');

insert into public.teachers(id, full_name, email, contract_type, telephone, notes, deleted_at) values
  (pg_temp.id(101), 'Teacher One', 'pr-t1@example.test', 'Freelance', '0600000101', 'hr note', null),
  (pg_temp.id(102), 'Teacher Two', 'pr-t2@example.test', 'Freelance', '0600000102', null, null),
  (pg_temp.id(103), 'Teacher Three', 'pr-t3@example.test', 'Freelance', '0600000103', null, now());
update public.profiles set linked_teacher_id = pg_temp.id(97 + ('x' || right(id::text, 1))::bit(4)::integer)
  where id in (pg_temp.id(4), pg_temp.id(5), pg_temp.id(6));
insert into public.groups(id, name, session_type, niveau, teacher_id, annee, jours, horaire, salle) values
  (pg_temp.id(301), 'PR G1', 'Yearly', 'Child 1', pg_temp.id(101), '2026-2027', 'Lun', '17:00', 'S1'),
  (pg_temp.id(302), 'PR G2', 'Yearly', 'Child 1', null, '2026-2027', 'Mar', '17:00', 'S2'),
  (pg_temp.id(303), 'PR G3 archived teacher', 'Adults', 'Beginning 1', pg_temp.id(103), '2026-2027', 'Mer', '18:00', 'S3');

-- Learners. 201/202 family A (D9: the second address arrives in mixed case and
-- spaces); 203 family B with the same surname; 204 adult whose own address is a
-- sibling's parent address (205); 206 Young Learner with an own address;
-- 207..212 six families sharing one placeholder; 213 a former learner (Ended
-- enrollment in G1); 214 a teen member of G3.
insert into public.students(id, full_name, email, parent_email, telephone, date_naissance, status, notes,
  referral_source, age_category, session_type, niveau_cefr) values
  (pg_temp.id(201), 'Sara Alami', null, 'pr-family-a@example.test', '0611000201', '2016-01-01', 'Prospect', 'staff note A',
    'Recherche Google', 'Young Learners (6-12)', 'Yearly', null),
  (pg_temp.id(202), 'Omar Alami', null, '  PR-Family-A@Example.TEST ', '0622000202', '2017-01-01', 'Prospect', 'staff note B',
    null, 'Young Learners (6-12)', 'Yearly', null),
  (pg_temp.id(203), 'Lina Alami', null, 'pr-family-b@example.test', '0611000203', '2016-03-01', 'Prospect', null,
    null, 'Young Learners (6-12)', 'Yearly', null),
  (pg_temp.id(204), 'Karim Idrissi', 'pr-adult@example.test', null, '0611000204', '1990-01-01', 'Prospect', 'adult note',
    null, 'Adults (18+)', 'Adults', null),
  (pg_temp.id(205), 'Nora Idrissi', null, 'pr-adult@example.test', '0611000205', '2016-05-01', 'Prospect', null,
    null, 'Young Learners (6-12)', 'Yearly', null),
  (pg_temp.id(206), 'Yasmine Bennis', 'pr-yasmine@example.test', 'pr-bennis@example.test', '0611000206', '2015-01-01',
    'Prospect', null, null, 'Young Learners (6-12)', 'Yearly', null),
  (pg_temp.id(213), 'Former Learner', null, 'pr-former@example.test', '0611000213', '2014-01-01', 'Prospect', null,
    null, 'Young Learners (6-12)', 'Yearly', null),
  (pg_temp.id(214), 'Teen Member', 'pr-teen@example.test', 'pr-teen-parent@example.test', '0611000214', '2010-01-01',
    'Prospect', null, null, 'Teens (13-17)', 'Adults', null);
insert into public.students(id, full_name, email, parent_email, telephone, status, age_category, session_type)
select pg_temp.id(206 + i), 'Shared Family' || i || ' Child', 'pr-shared@example.test', 'pr-shared@example.test',
  '06330002' || lpad(i::text, 2, '0'), 'Prospect', 'Young Learners (6-12)', 'Yearly'
from generate_series(1, 6) i;
select pg_temp.ok((select parent_email from public.students where id = pg_temp.id(202)) = 'pr-family-a@example.test',
  'D9: a stored address is lower-case and trimmed');

-- Memberships through Validated enrollments (EGC): 201, 202, 203, 204, 213 in G1;
-- 214 in G3 (archived teacher); 213 is then ended (former learner).
insert into public.enrollments(id, student_id, group_id, status, session_type, school_year, level, notes) values
  (pg_temp.id(401), pg_temp.id(201), pg_temp.id(301), 'Validated', 'Yearly', '2026/2027', 'Child 1', 'enrollment staff note'),
  (pg_temp.id(402), pg_temp.id(202), pg_temp.id(301), 'Validated', 'Yearly', '2026/2027', 'Child 1', null),
  (pg_temp.id(403), pg_temp.id(203), pg_temp.id(301), 'Validated', 'Yearly', '2026/2027', 'Child 1', null),
  (pg_temp.id(404), pg_temp.id(204), pg_temp.id(301), 'Validated', 'Yearly', '2026/2027', 'Child 1', null),
  (pg_temp.id(413), pg_temp.id(213), pg_temp.id(301), 'Validated', 'Yearly', '2025/2026', 'Child 1', null),
  (pg_temp.id(414), pg_temp.id(214), pg_temp.id(303), 'Validated', 'Adults', '2026/2027', 'Beginning 1', null);
select pg_temp.act(1);
select public.end_learner(pg_temp.id(213), (select updated_at from public.students where id = pg_temp.id(213)), 'Alumni',
  'Fin de parcours', array[pg_temp.id(413)]);
select pg_temp.owner();
select pg_temp.ok(not academic_security.is_group_member(pg_temp.id(213), pg_temp.id(301)), 'fixture: 213 is a former learner');

-- Explicit links (as the invitation functions leave them; T-17..T-22 create them through the functions).
insert into public.family_links(id, student_id, relation, profile_id, invite_email, status, activated_at) values
  (pg_temp.id(601), pg_temp.id(201), 'parent', pg_temp.id(7), 'pr-family-a@example.test', 'active', now()),
  (pg_temp.id(602), pg_temp.id(202), 'parent', pg_temp.id(7), 'pr-family-a@example.test', 'active', now()),
  (pg_temp.id(603), pg_temp.id(203), 'parent', pg_temp.id(9), 'pr-family-b@example.test', 'active', now()),
  (pg_temp.id(604), pg_temp.id(204), 'self', pg_temp.id(10), 'pr-adult@example.test', 'active', now());

-- Finance: a receipt carrying staff fields and another family's contact snapshot, a
-- legacy receipt, a voided receipt, a live and a voided charge.
set local session_replication_role = replica;
insert into public.charges(id, student_id, session_type, service_description, gross_amount, discount_amount, due_date,
  created_by, legacy, voided_at, voided_by, void_reason, school_year, plan_type) values
  (pg_temp.id(701), pg_temp.id(201), 'Yearly', 'Yearly · 2026/2027', 3000, 0, current_date + 30, pg_temp.id(2), false,
    null, null, null, '2026/2027', 'Standard'),
  (pg_temp.id(702), pg_temp.id(201), 'Yearly', 'Erreur', 999, 0, current_date, pg_temp.id(2), false,
    now(), pg_temp.id(1), 'charge void reason', '2026/2027', 'Standard');
insert into public.receipts(id, student_id, charge_id, receipt_number, date, nom_prenom, telephone, email, montant_total,
  montant_paye, mode_paiement, payment_note, actor_id, actor_name, legacy, voided_at, voided_by, void_reason,
  email_delivery_status, email_last_error, idempotency_key, referral_source, school_year_snapshot, session_type,
  gross_amount_snapshot, net_amount_snapshot, paid_before_snapshot, balance_after_snapshot, statut_paiement) values
  (pg_temp.id(801), pg_temp.id(201), pg_temp.id(701), 'EH-PR-0001', current_date, 'Sara Alami', '0699000203',
    'pr-family-b@example.test', 3000, 1000, 'Espèces', 'internal payment note', pg_temp.id(2), 'PR User 02', false,
    null, null, null, 'failed', 'smtp detail', gen_random_uuid(), 'Recherche Google', '2026/2027', 'Yearly',
    3000, 3000, 0, 2000, 'Acompte versé'),
  (pg_temp.id(802), pg_temp.id(201), null, 'EH-PR-0002', current_date - 400, 'Sara Alami', null, null, 500, 500,
    'Espèces', null, null, null, true, null, null, null, 'skipped', null, null, null, null, null,
    null, null, null, null, 'Soldé'),
  (pg_temp.id(803), pg_temp.id(201), pg_temp.id(701), 'EH-PR-0003', current_date, 'Sara Alami', null, null, 3000, 100,
    'Espèces', null, pg_temp.id(2), 'PR User 02', false, now(), pg_temp.id(1), 'receipt void reason', 'skipped', null,
    gen_random_uuid(), null, '2026/2027', 'Yearly', 3000, 3000, 1000, 1900, 'Acompte versé');
-- Academic rows with staff free text; a CRM-linked placement test.
insert into public.placement_tests(id, student_id, student_name, date_test, examinateur, score, niveau_recommande, status, notes, crm_lead_id) values
  (pg_temp.id(901), pg_temp.id(201), 'Sara Alami', current_date - 30, 'Examiner Name', 14, 'Child 1', 'Résultat saisi', 'placement note', null),
  (pg_temp.id(902), pg_temp.id(201), 'Sara Alami', current_date - 60, 'Examiner Name', 9, 'Pre-Child', 'Résultat saisi', 'crm note', gen_random_uuid());
insert into public.certificates(id, student_id, student_name, niveau_complete, terme, annee, date_emission, directeur, notes, issued) values
  (pg_temp.id(911), pg_temp.id(201), 'Sara Alami', 'Child 1', 'Sept–Déc', '2026', current_date, 'Direction', 'certificate note', true),
  (pg_temp.id(912), pg_temp.id(201), 'Sara Alami', 'Child 2', 'Sept–Déc', '2027', current_date, 'Direction', 'draft note', false);
insert into public.attendance(id, student_id, group_id, session_date, status, notes) values
  (pg_temp.id(921), pg_temp.id(201), pg_temp.id(301), current_date - 7, 'Absent', 'attendance staff note');
-- One row in each Premium table, with free text in the notes fields (T-47).
insert into public.premium_groups(id, name, teacher_id, start_time, notes) values
  (pg_temp.id(931), 'PR premium', pg_temp.id(101), '10:00', 'premium group staff note');
insert into public.premium_group_memberships(id, premium_group_id, student_id, start_date) values
  (pg_temp.id(932), pg_temp.id(931), pg_temp.id(201), current_date - 1);
insert into public.premium_sessions(id, teacher_id, scheduled_date, start_time, focus_note, teacher_note, premium_group_id) values
  (pg_temp.id(933), pg_temp.id(101), current_date + (6 - extract(isodow from current_date)::integer + 7) % 7, '10:00',
    'premium focus note', 'premium teacher note', pg_temp.id(931));
insert into public.premium_attendance(id, premium_session_id, student_id, notes) values (pg_temp.id(934), pg_temp.id(933), pg_temp.id(201), 'premium attendance note');
insert into public.premium_homework_submissions(id, premium_session_id, student_id, teacher_id, title, teacher_note) values
  (pg_temp.id(935), pg_temp.id(933), pg_temp.id(201), pg_temp.id(101), 'PR homework', 'premium homework note');
set local session_replication_role = origin;

-- ===========================================================================
-- T-01..T-08 Column and value denial.
-- ===========================================================================
do $$ declare i integer; t text; begin
  foreach i in array array[4, 5, 6, 7, 8, 9, 10, 13] loop
    perform pg_temp.act(i);
    foreach t in array array['students','enrollments','receipts','charges','charge_balances','placement_tests',
        'attendance','certificates','legacy_receipt_reconciliation'] loop
      -- Teachers keep group-scoped attendance, placement and certificate rows (no contact data).
      continue when i in (4, 5, 6, 13) and t in ('attendance','placement_tests','certificates');
      perform pg_temp.ok(pg_temp.none('select * from public.' || t), 'T-01 user ' || i || ' reads no ' || t || ' row directly');
    end loop;
  end loop;
  perform pg_temp.owner();
end $$;
-- T-02: teacher rows on the academic tables carry no family contact column.
select pg_temp.act(4);
select pg_temp.ok((select count(*) from public.attendance) = 1 and (select count(*) from public.placement_tests) = 1
  and (select count(*) from public.certificates) = 2, 'T-02 T1 keeps group-scoped academic rows, never the CRM-linked test');
-- T-03: key scan of every portal function output.
select pg_temp.act(4);
select pg_temp.ok(not exists (select 1 from pg_temp.keys((select jsonb_agg(to_jsonb(r)) from public.portal_teacher_roster() r)) k
  where k = any(pg_temp.staff_keys())), 'T-03 the class list carries no staff-only or contact key');
select pg_temp.ok((select array_agg(k order by k) from pg_temp.keys((select jsonb_agg(to_jsonb(r)) from public.portal_teacher_roster() r)) k)
  = array['age_category','enrollment_status','full_name','group_id','niveau_cefr','photo_url','session_type','status','student_id'],
  'T-03 the class list carries exactly the Q1 = A fields');
select pg_temp.act(7);
select pg_temp.ok(not exists (select 1 from pg_temp.keys((select jsonb_agg(to_jsonb(r)) from public.portal_my_learners() r)
    || jsonb_build_array(public.portal_learner_record(pg_temp.id(201)))) k
  where k = any(pg_temp.staff_keys())), 'T-03 the family projections carry no staff-only or contact key');
select pg_temp.act(10);
select pg_temp.ok(not exists (select 1 from pg_temp.keys(jsonb_build_array(public.portal_learner_record(pg_temp.id(204)))) k
  where k = any(pg_temp.staff_keys())), 'T-03 the student projection carries no staff-only or contact key');
-- T-04: value scan — no fixture address or phone other than the caller's own.
create temp table pr_contacts on commit drop as
  select distinct v from (select email v from public.students where id::text like '12200000-%' union all
    select parent_email from public.students where id::text like '12200000-%' union all
    select telephone from public.students where id::text like '12200000-%' union all
    select telephone from public.receipts where id::text like '12200000-%' union all
    select email from public.receipts where id::text like '12200000-%' union all
    select email from public.teachers where id::text like '12200000-%' union all
    select telephone from public.teachers where id::text like '12200000-%') x where v is not null;
grant select on pr_contacts to authenticated;
select pg_temp.act(7);
select pg_temp.ok(not exists (select 1 from pr_contacts c where
  (select jsonb_agg(to_jsonb(r)) from public.portal_my_learners() r)::text like '%' || c.v || '%'
  or public.portal_learner_record(pg_temp.id(201))::text like '%' || c.v || '%'
  or public.portal_learner_record(pg_temp.id(202))::text like '%' || c.v || '%'),
  'T-04 parent A''s portal responses hold no fixture address or phone (receipt snapshot included)');
select pg_temp.act(4);
select pg_temp.ok(not exists (select 1 from pr_contacts c where
  (select jsonb_agg(to_jsonb(r)) from public.portal_teacher_roster() r)::text like '%' || c.v || '%'),
  'T-04 the class list holds no address or phone');
-- T-05/T-06: the family receipt carries is_legacy, never legacy, and no contact snapshot.
select pg_temp.act(7);
select pg_temp.ok((select bool_and(r ? 'is_legacy' and not r ? 'legacy' and not r ? 'email' and not r ? 'telephone')
  from jsonb_array_elements(public.portal_learner_record(pg_temp.id(201))->'receipts') r), 'T-05 receipts: is_legacy, no legacy, no contact');
select pg_temp.ok((select count(*) filter (where (r->>'is_legacy')::boolean) = 1 and count(*) = 3
  from jsonb_array_elements(public.portal_learner_record(pg_temp.id(201))->'receipts') r), 'T-05 three live receipts, one legacy');
-- T-06: balances from all live receipts; voided charge flagged; attendance without notes (Q7 = A).
select pg_temp.ok((select (c->>'balance')::numeric = 2000 and (c->>'paid_amount')::numeric = 1000
  from jsonb_array_elements(public.portal_learner_record(pg_temp.id(201))->'charges') c where c->>'id' = pg_temp.id(701)::text),
  'T-06 the family balance counts every live receipt');
select pg_temp.ok((select (c->>'voided')::boolean from jsonb_array_elements(public.portal_learner_record(pg_temp.id(201))->'charges') c
  where c->>'id' = pg_temp.id(702)::text), 'T-06 a voided charge is flagged, its reason is not returned');
select pg_temp.ok((select count(*) = 1 from jsonb_array_elements(public.portal_learner_record(pg_temp.id(201))->'placement_tests'))
  and (select count(*) = 1 from jsonb_array_elements(public.portal_learner_record(pg_temp.id(201))->'certificates')),
  'T-07 families get operational placement tests and issued certificates only');
select pg_temp.ok((public.portal_learner_record(pg_temp.id(201))->>'truncated')::boolean = false, 'T-07 no section was truncated');
-- T-08: legacy reconciliation view: no anonymous grant.
select pg_temp.owner();
select pg_temp.ok(not has_table_privilege('anon', 'public.legacy_receipt_reconciliation', 'SELECT'), 'T-08 anon has no grant on the legacy view');

-- ===========================================================================
-- T-09..T-16 Family isolation.
-- ===========================================================================
select pg_temp.act(7);
select pg_temp.ok((select array_agg(student_id order by student_id) from public.portal_my_learners())
  = array[pg_temp.id(201), pg_temp.id(202)], 'T-09 parent A sees exactly the linked children');
select pg_temp.ok((select array_agg(x order by x) from public.get_visible_student_ids() x) = array[pg_temp.id(201), pg_temp.id(202)],
  'T-09 visibility helper: the links only');
select pg_temp.fails(format('select public.portal_learner_record(%L)', pg_temp.id(203)), '42501', 'portal.not_linked');
select pg_temp.act(8);
select pg_temp.ok(not exists (select 1 from public.portal_my_learners()) and not exists (select 1 from public.get_visible_student_ids()),
  'T-10 the unlinked account with A''s dossier address sees nothing');
select pg_temp.fails(format('select public.portal_learner_record(%L)', pg_temp.id(201)), '42501', 'portal.not_linked');
select pg_temp.act(9);
select pg_temp.ok((select array_agg(student_id) from public.portal_my_learners()) = array[pg_temp.id(203)],
  'T-11 parent B sees only B''s child despite the shared surname');
select pg_temp.ok(not exists (select 1 from public.assessments where student_id = pg_temp.id(201))
  and not exists (select 1 from public.authorized_adults where student_id = pg_temp.id(201)), 'T-11 parent B reads none of A');
-- T-12/T-13: revoking and archiving remove access at once.
savepoint t12;
select pg_temp.act(2);
select public.revoke_family_link(pg_temp.id(602), 'Test retrait');
select pg_temp.act(7);
select pg_temp.ok((select array_agg(student_id) from public.portal_my_learners()) = array[pg_temp.id(201)], 'T-12 a revoked link ends access at once');
select pg_temp.fails(format('select public.portal_learner_record(%L)', pg_temp.id(202)), '42501', 'portal.not_linked');
select pg_temp.act(2);
select pg_temp.fails(format('select public.revoke_family_link(%L, %L)', pg_temp.id(602), 'encore'), 'PT409', 'portal.link_not_active');
rollback to savepoint t12;
savepoint t13;
select pg_temp.act(1);
select public.soft_delete_student(pg_temp.id(202));
select pg_temp.act(7);
select pg_temp.ok((select array_agg(student_id) from public.portal_my_learners()) = array[pg_temp.id(201)], 'T-13 archiving hides the learner from linked accounts');
rollback to savepoint t13;
-- T-14: a dossier e-mail edit neither grants nor removes access.
savepoint t14;
select pg_temp.owner();
update public.students set parent_email = 'pr-parent-b@example.test' where id = pg_temp.id(201);
update public.students set parent_email = 'pr-family-a@example.test' where id = pg_temp.id(203);
select pg_temp.act(7);
select pg_temp.ok((select array_agg(student_id order by student_id) from public.portal_my_learners()) = array[pg_temp.id(201), pg_temp.id(202)],
  'T-14 an edited dossier address does not remove access');
select pg_temp.act(9);
select pg_temp.ok((select array_agg(student_id) from public.portal_my_learners()) = array[pg_temp.id(203)], 'T-14 nor grant it');
select pg_temp.act(8);
select pg_temp.ok(not exists (select 1 from public.portal_my_learners()), 'T-14 nor open it to the matching address');
rollback to savepoint t14;
-- T-15: staff screens unchanged: the receptionist and admin still read whole rows.
select pg_temp.act(3);
select pg_temp.ok((select notes from public.students where id = pg_temp.id(201)) = 'staff note A', 'T-15 receptionist reads the learner file');
select pg_temp.act(2);
select pg_temp.ok((select count(*) from public.receipts where student_id = pg_temp.id(201)) = 3
  and (select payment_note from public.receipts where id = pg_temp.id(801)) = 'internal payment note', 'T-15 admin reads receipts with staff fields');
-- T-16: online learning follows the links (get_visible_student_ids is its family test).
select pg_temp.act(8);
select pg_temp.ok(not exists (select 1 from public.my_member_group_ids()), 'T-16 an unlinked account has no member group');
select pg_temp.act(7);
select pg_temp.ok((select array_agg(x) from public.my_member_group_ids() x) = array[pg_temp.id(301)], 'T-16 the linked parent''s groups');

-- ===========================================================================
-- T-17..T-22 Invitation.
-- ===========================================================================
select pg_temp.act(2);
-- T-17: the placeholder pattern and the student address of a parent are refused.
select pg_temp.ok((public.preview_family_invitation('pr-shared@example.test', 'parent')->'refusal'->>'reason') = 'portal.shared_address',
  'T-17 preview refuses the placeholder for a parent');
select pg_temp.fails($$select public.prepare_family_invitation('pr-shared@example.test', 'parent', array['12200000-0000-4000-8000-0000000000cf'::uuid])$$,
  '42501', 'portal.shared_address');
select pg_temp.fails(format('select public.prepare_family_invitation(%L, %L, %L)', 'pr-shared@example.test', 'student', array[pg_temp.id(207)]),
  '42501', 'portal.shared_address');
select pg_temp.fails(format('select public.prepare_family_invitation(%L, %L, %L)', 'pr-adult@example.test', 'student', array[pg_temp.id(204)]),
  '42501', 'portal.address_is_parent');
select pg_temp.fails(format('select public.prepare_family_invitation(%L, %L, %L)', 'pr-t1@example.test', 'parent', array[pg_temp.id(201)]),
  '42501', 'portal.staff_address');
select pg_temp.fails(format('select public.prepare_family_invitation(%L, %L, %L)', 'office@english-hills.com', 'parent', array[pg_temp.id(201)]),
  '42501', 'portal.centre_address');
-- T-18: a Young Learner gets no student account (Q8 = A).
select pg_temp.fails(format('select public.prepare_family_invitation(%L, %L, %L)', 'pr-yasmine@example.test', 'student', array[pg_temp.id(206)]),
  '42501', 'portal.young_learner_self');
select pg_temp.ok((public.preview_family_invitation('pr-yasmine@example.test', 'student')->'refusal'->>'reason') = 'portal.young_learner_self',
  'T-18 preview names the Young Learner refusal');
-- T-19: only matched learners; mixed surnames and phones are flagged; no address echoed.
select pg_temp.fails(format('select public.prepare_family_invitation(%L, %L, %L)', 'pr-family-a@example.test', 'parent', array[pg_temp.id(203)]),
  '22023', 'portal.not_matched');
select pg_temp.fails(format('select public.prepare_family_invitation(%L, %L, %L)', 'pr-family-a@example.test', 'parent', '{}'::uuid[]),
  '22023', 'portal.no_learner');
select pg_temp.ok((public.preview_family_invitation('pr-family-a@example.test', 'parent')->>'mixed_phones')::boolean
  and not (public.preview_family_invitation('pr-family-a@example.test', 'parent')->>'mixed_surnames')::boolean
  and jsonb_array_length(public.preview_family_invitation('pr-family-a@example.test', 'parent')->'matches') = 2,
  'T-19 the preview lists both matches and flags the mixed phones');
select pg_temp.ok(public.preview_family_invitation('pr-family-a@example.test', 'parent')::text not like '%@%',
  'T-19 the preview echoes no address');
-- T-20: the receptionist cannot invite, preview, link or revoke (Q4 = A).
select pg_temp.act(3);
select pg_temp.fails(format('select public.prepare_family_invitation(%L, %L, %L)', 'pr-new-family@example.test', 'parent', array[pg_temp.id(213)]),
  '42501', 'portal.forbidden');
select pg_temp.fails($$select public.preview_family_invitation('pr-family-a@example.test', 'parent')$$, '42501', 'portal.forbidden');
select pg_temp.fails(format('select public.link_family_student(%L, %L)', pg_temp.id(8), pg_temp.id(201)), '42501', 'portal.forbidden');
select pg_temp.fails(format('select public.revoke_family_link(%L, %L)', pg_temp.id(601), 'x'), '42501', 'portal.forbidden');
select pg_temp.ok((select count(*) from public.list_family_links(pg_temp.id(201))) = 1, 'T-20 the receptionist reads the learner''s links');
select pg_temp.act(7);
select pg_temp.fails(format('select * from public.list_family_links(%L)', pg_temp.id(201)), '42501', 'portal.forbidden');
-- T-21: the old path refuses portal roles; staff roles still queue.
select pg_temp.act(1);
select pg_temp.fails($$select public.prepare_role_invitation('pr-x@example.test', 'parent')$$, '42501', 'portal.use_portal_invitation');
select pg_temp.fails($$select public.prepare_role_invitation('pr-x@example.test', 'student')$$, '42501', 'portal.use_portal_invitation');
select pg_temp.fails($$select public.prepare_role_invitation('pr-x@example.test', 'teacher')$$, '42501', 'portal.use_portal_invitation');
select pg_temp.ok((public.prepare_role_invitation('pr-new-admin@example.test', 'admin')->>'role') = 'admin'
  and not (public.prepare_role_invitation('pr-new-admin@example.test', 'admin') ? 'queueId'), 'T-21 staff invitations keep their shape');
-- T-22: invitation lifecycle. Queue with links; re-invitation replaces them; activation order.
select pg_temp.act(2);
select pg_temp.ok(jsonb_array_length(public.prepare_family_invitation('pr-former@example.test', 'parent', array[pg_temp.id(213)])->'links') = 1,
  'T-22 one pending link with the queue row');
select pg_temp.ok(pg_temp.pending_links('pr-former@example.test') = 1, 'T-22 the pending link is stored');
-- A Young Learner dossier carries a second learner at this address; a re-invitation with
-- another child leaves only the new pending link.
select pg_temp.owner();
update public.students set parent_email = 'pr-former@example.test' where id = pg_temp.id(206);
select pg_temp.act(2);
select public.prepare_family_invitation('pr-former@example.test', 'parent', array[pg_temp.id(206)]);
select pg_temp.ok(pg_temp.none('select * from public.family_links'), 'T-22 staff read links only through list_family_links');
select pg_temp.owner();
select pg_temp.ok((select array_agg(fl.student_id) from public.family_links fl join public.pending_roles pr on pr.id = fl.pending_role_id
    where lower(pr.email) = 'pr-former@example.test') = array[pg_temp.id(206)], 'T-22 a re-invitation with other children keeps only the new links');
-- Another role on the same address drops the pending links.
select pg_temp.act(1);
select public.prepare_role_invitation('pr-former@example.test', 'admin');
select pg_temp.ok(pg_temp.pending_links('pr-former@example.test') = 0, 'T-22 a re-invitation with another role drops the pending links');
-- Activation: the account confirms its address and applies the role.
select pg_temp.act(2);
select public.prepare_family_invitation('pr-former@example.test', 'parent', array[pg_temp.id(206), pg_temp.id(213)]);
select pg_temp.owner();
insert into auth.users(id, email, aud, role, email_confirmed_at, created_at, updated_at)
values (pg_temp.id(14), 'pr-former@example.test', 'authenticated', 'authenticated', now(), now(), now());
select pg_temp.act(14);
select pg_temp.ok(public.apply_pending_role() = 'parent', 'T-22 the parent role is applied');
select pg_temp.ok((select array_agg(student_id order by student_id) from public.portal_my_learners()) = array[pg_temp.id(206), pg_temp.id(213)],
  'T-22 activation creates exactly the pending links');
select pg_temp.owner();
select pg_temp.ok((select count(*) from public.pending_roles where lower(email) = 'pr-former@example.test') = 0
  and (select count(*) from public.family_links where profile_id = pg_temp.id(14) and status = 'active' and pending_role_id is null) = 2,
  'T-22 the links survive the queue-row delete (activation order)');
-- An expired invitation leaves no link.
update public.students set parent_email = 'pr-bennis@example.test' where id = pg_temp.id(206);
select pg_temp.act(2);
select public.prepare_family_invitation('pr-bennis@example.test', 'parent', array[pg_temp.id(206)]);
select pg_temp.owner();
update public.pending_roles set expires_at = now() - interval '1 minute' where lower(email) = 'pr-bennis@example.test';
insert into auth.users(id, email, aud, role, email_confirmed_at, created_at, updated_at)
values (pg_temp.id(15), 'pr-bennis@example.test', 'authenticated', 'authenticated', now(), now(), now());
select pg_temp.act(15);
select pg_temp.ok(public.apply_pending_role() is null, 'T-22 an expired invitation is refused');
select pg_temp.owner();
select pg_temp.ok(not exists (select 1 from public.family_links where invite_email = 'pr-bennis@example.test'),
  'T-22 an expired or refused activation leaves no link');
-- Teacher invitation stores the record; activation binds it.
select pg_temp.owner();
insert into public.teachers(id, full_name, email, contract_type) values (pg_temp.id(104), 'Teacher Four', 'pr-t5@example.test', 'Freelance');
select pg_temp.act(2);
select pg_temp.fails(format('select public.prepare_teacher_invitation(%L, %L)', 'pr-t5@example.test', pg_temp.id(101)), '22023', 'portal.teacher_mismatch');
select pg_temp.fails(format('select public.prepare_teacher_invitation(%L, %L)', 'pr-t1@example.test', pg_temp.id(101)), 'PT409', 'portal.link_exists');
savepoint t22t;
select pg_temp.owner();
update public.teachers set email = 'pr-t2-new@example.test' where id = pg_temp.id(102);
select pg_temp.act(2);
select pg_temp.fails(format('select public.prepare_teacher_invitation(%L, %L)', 'pr-t2-new@example.test', pg_temp.id(102)), 'PT409', 'portal.teacher_already_linked');
rollback to savepoint t22t;
select pg_temp.ok(not (public.prepare_teacher_invitation('pr-t5@example.test', pg_temp.id(104))->>'teacherHasGroup')::boolean,
  'T-22 a teacher invitation warns when the record has no group');
select pg_temp.owner();
select pg_temp.ok((select teacher_id from public.pending_roles where lower(email) = 'pr-t5@example.test') = pg_temp.id(104),
  'T-22 the queue row stores the teacher record');
insert into auth.users(id, email, aud, role, email_confirmed_at, created_at, updated_at)
values (pg_temp.id(16), 'pr-t5@example.test', 'authenticated', 'authenticated', now(), now(), now());
select pg_temp.act(16);
select pg_temp.ok(public.apply_pending_role() = 'teacher', 'T-22 the teacher role is applied');
select pg_temp.ok(public.get_my_teacher_id() = pg_temp.id(104), 'T-22 activation binds linked_teacher_id');
-- Later links for an existing account follow the same refusals.
select pg_temp.act(2);
-- The account's login must be the dossier address: parent A's login is not.
select pg_temp.fails(format('select public.link_family_student(%L, %L)', pg_temp.id(7), pg_temp.id(201)), '22023', 'portal.no_match');
select pg_temp.fails(format('select public.link_family_student(%L, %L)', pg_temp.id(8), pg_temp.id(203)), '22023', 'portal.not_matched');
select pg_temp.fails(format('select public.link_family_student(%L, %L)', pg_temp.id(4), pg_temp.id(201)), '22023', 'portal.not_family_account');
select pg_temp.ok((public.link_family_student(pg_temp.id(8), pg_temp.id(201))->>'status') = 'active', 'T-22 a later link for the matching account');
select pg_temp.fails(format('select public.link_family_student(%L, %L)', pg_temp.id(8), pg_temp.id(201)), 'PT409', 'portal.link_exists');
select pg_temp.fails(format('select public.link_teacher_account(%L, %L)', pg_temp.id(13), pg_temp.id(102)), '22023', 'portal.teacher_mismatch');
select pg_temp.owner();
delete from public.family_links where profile_id = pg_temp.id(8);
-- Every invitation write is logged with ids and relation only.
select pg_temp.ok((select count(*) from public.activity_log where target_table = 'family_links') >= 4
  and not exists (select 1 from public.activity_log where target_table = 'family_links' and after::text like '%@%'),
  'T-22 link writes are logged without any address');

-- ===========================================================================
-- T-23..T-27 Teacher.
-- ===========================================================================
select pg_temp.act(4);
select pg_temp.ok((select array_agg(distinct student_id order by student_id) from public.portal_teacher_roster())
  = array[pg_temp.id(201), pg_temp.id(202), pg_temp.id(203), pg_temp.id(204)], 'T-23 T1 sees G1''s class list only');
select pg_temp.fails(format('select * from public.portal_teacher_roster(%L)', pg_temp.id(302)), '42501', 'portal.not_your_group');
select pg_temp.act(5);
select pg_temp.ok(not exists (select 1 from public.portal_teacher_roster()), 'T-24 T2 (no group) sees nothing');
select pg_temp.act(6);
select pg_temp.ok(public.get_my_teacher_id() is null and not exists (select 1 from public.portal_teacher_roster())
  and not public.teacher_can_access_student_group(pg_temp.id(214), pg_temp.id(303)), 'T-25 T3 (archived record) sees nothing');
select pg_temp.act(13);
select pg_temp.ok(public.get_my_teacher_id() is null and not exists (select 1 from public.portal_teacher_roster()), 'T-25 a teacher without a record sees nothing');
-- T-26: an ended or archived learner is not visible; the NULL school-year membership is.
select pg_temp.act(4);
select pg_temp.ok(not public.teacher_can_access_student_group(pg_temp.id(213), null), 'T-26 a former learner is not visible');
savepoint t26;
select pg_temp.act(1);
select public.soft_delete_student(pg_temp.id(203));
select pg_temp.act(4);
select pg_temp.ok(not public.teacher_can_access_student_group(pg_temp.id(203), null)
  and not exists (select 1 from public.portal_teacher_roster() where student_id = pg_temp.id(203)), 'T-26 an archived learner is not visible');
rollback to savepoint t26;
savepoint t26b;
select pg_temp.owner();
-- Synthetic pre-clean-up state: the one grouped Validated enrollment without a school year.
alter table public.enrollments drop constraint enrollments_confirmed_has_programme;
insert into public.students(id, full_name, status, age_category, session_type) values
  (pg_temp.id(215), 'Null Year Learner', 'Prospect', 'Young Learners (6-12)', 'Yearly');
insert into public.enrollments(student_id, group_id, status, session_type, school_year, level)
  values (pg_temp.id(215), pg_temp.id(301), 'Validated', 'Yearly', null, 'Child 1');
select pg_temp.act(4);
select pg_temp.ok(exists (select 1 from public.portal_teacher_roster() where student_id = pg_temp.id(215))
  and public.teacher_can_access_student_group(pg_temp.id(215), pg_temp.id(301)), 'T-26 the NULL school-year membership is visible');
rollback to savepoint t26b;
-- T-27: one membership answer from roster, group helper, storage and attendance; no delete; audited.
select pg_temp.act(4);
select pg_temp.ok((select bool_and(public.teacher_can_access_student_group(student_id, group_id)) from public.portal_teacher_roster())
  and not public.teacher_can_access_student_group(pg_temp.id(214), null), 'T-27 roster and helper agree');
select pg_temp.owner();
select pg_temp.ok(storage_security.can_write(pg_temp.id(4), 'portfolio', pg_temp.id(201), null, null)
  and not storage_security.can_write(pg_temp.id(4), 'portfolio', pg_temp.id(214), null, null)
  and not storage_security.can_write(pg_temp.id(6), 'portfolio', pg_temp.id(214), null, null)
  and not storage_security.can_write(pg_temp.id(5), 'portfolio', pg_temp.id(201), null, null), 'T-27 storage writes follow the same membership');
select pg_temp.act(4);
select public.save_attendance(pg_temp.id(201), pg_temp.id(301), current_date - 1, 'Présent');
select pg_temp.fails(format($$select public.save_attendance(%L, %L, current_date - 1, 'Présent')$$, pg_temp.id(213), pg_temp.id(301)), '42501');
select pg_temp.act(5);
select pg_temp.fails(format($$select public.save_attendance(%L, %L, current_date - 1, 'Absent')$$, pg_temp.id(201), pg_temp.id(301)), '42501');
select pg_temp.act(4);
insert into public.assessments(id, student_id, group_id, terme, note_oral, note_finale, commentaire)
  values (pg_temp.id(941), pg_temp.id(201), pg_temp.id(301), 'Sept–Déc', 14, 13.5, 'teacher free text');
update public.assessments set note_finale = 15 where id = pg_temp.id(941);
insert into public.learning_assessments(id, student_id, student_name, date_assessment, kolb_style, teacher_notes)
  values (pg_temp.id(942), pg_temp.id(201), 'Sara Alami', current_date, 'Diverging', 'learning free text');
insert into public.portfolios(id, student_id, student_name, title, project_type, teacher_id, teacher_note)
  values (pg_temp.id(943), pg_temp.id(201), 'Sara Alami', 'T1 project', 'Other', pg_temp.id(101), 'teacher feedback');
update public.placement_tests set score = 15 where id = pg_temp.id(901);
do $$ declare t text; n integer; begin
  foreach t in array array['assessments','learning_assessments','placement_tests','portfolios','attendance'] loop
    execute format('delete from public.%I where student_id = %L', t, pg_temp.id(201));
    get diagnostics n = row_count;
    perform pg_temp.ok(n = 0, 'T-27 a teacher deletes no ' || t || ' row');
  end loop;
end $$;
select pg_temp.owner();
select pg_temp.ok((select count(*) from public.assessments where id = pg_temp.id(941)) = 1, 'T-27 the grade survives the delete attempt');
select pg_temp.ok((select count(distinct target_table) from public.activity_log where actor_id = pg_temp.id(4)
  and target_table in ('assessments','learning_assessments','placement_tests','portfolios','attendance')) = 5,
  'T-27 every teacher write on the five tables is logged');
select pg_temp.ok((select (after->>'note_finale')::numeric = 15 and after->>'commentaire' = '<redacted>' from public.activity_log
  where target_table = 'assessments' and target_id = pg_temp.id(941) and action = 'UPDATE'), 'T-27 grade values kept, free text redacted');
select pg_temp.act(2);
delete from public.assessments where id = pg_temp.id(941);
select pg_temp.owner();
select pg_temp.ok((select (before->>'note_finale')::numeric = 15 from public.activity_log where target_table = 'assessments'
  and target_id = pg_temp.id(941) and action = 'DELETE'), 'T-27 a deleted grade can be restored from the log');

-- ===========================================================================
-- T-28..T-30 Portfolio boundary.
-- ===========================================================================
select pg_temp.act(10);
insert into public.portfolios(id, student_id, student_name, title, project_type, teacher_id, teacher_note, visible_to_parent,
  visible_to_student, created_by) values
  (pg_temp.id(951), pg_temp.id(204), 'Karim Idrissi', 'My essay', 'Written Essay', pg_temp.id(101), 'forged feedback', false, false, pg_temp.id(1));
select pg_temp.owner();
select pg_temp.ok((select teacher_id is null and teacher_note is null and visible_to_parent and visible_to_student
  and created_by = pg_temp.id(10) from public.portfolios where id = pg_temp.id(951)),
  'T-28 a student cannot set teacher fields or hide an entry; created_by is forced');
insert into public.portfolios(id, student_id, student_name, title, project_type, teacher_id, teacher_note)
  values (pg_temp.id(952), pg_temp.id(204), 'Karim Idrissi', 'Teacher project', 'Other', pg_temp.id(101), 'teacher feedback');
select pg_temp.act(10);
update public.portfolios set teacher_note = 'rewritten', visible_to_parent = false, title = 'Mine now' where id = pg_temp.id(952);
delete from public.portfolios where id = pg_temp.id(952);
update public.portfolios set teacher_note = 'self feedback', visible_to_parent = false, title = 'My essay v2' where id = pg_temp.id(951);
select pg_temp.owner();
select pg_temp.ok((select title = 'Teacher project' and teacher_note = 'teacher feedback' from public.portfolios where id = pg_temp.id(952)),
  'T-29 a student cannot change or delete the teacher''s entry');
select pg_temp.ok((select title = 'My essay v2' and teacher_note is null and visible_to_parent from public.portfolios where id = pg_temp.id(951)),
  'T-29 on the own entry, teacher fields and visibility stay unchanged');
select pg_temp.fails(format('update public.portfolios set created_by = %L where id = %L', pg_temp.id(1), pg_temp.id(951)), '42501', 'portal.immutable_author');
select pg_temp.act(10);
delete from public.portfolios where id = pg_temp.id(951);
select pg_temp.owner();
select pg_temp.ok(not exists (select 1 from public.portfolios where id = pg_temp.id(951)), 'T-30 a student deletes the own entry');

-- ===========================================================================
-- T-31..T-35 Messaging.
-- ===========================================================================
select pg_temp.act(7);
select pg_temp.ok((select array_agg(recipient_key order by recipient_key) from public.portal_message_recipients())
  = array['office', 'teacher:' || pg_temp.id(101)], 'T-31 family recipients: the office and the children''s teacher');
select pg_temp.ok((select jsonb_agg(to_jsonb(r))::text not like '%@%' from public.portal_message_recipients() r), 'T-31 no address in recipients');
select pg_temp.act(4);
select pg_temp.ok((select array_agg(recipient_key order by recipient_key) from public.portal_message_recipients())
  = array['learner:' || pg_temp.id(204), 'office', 'parent:' || pg_temp.id(201), 'parent:' || pg_temp.id(202), 'parent:' || pg_temp.id(203)],
  'T-31 teacher recipients: linked accounts of the class list only');
-- T-32: a family cannot address another family's teacher; sender names are server-set.
select pg_temp.act(9);
select pg_temp.fails(format($$select public.portal_send_message(%L, 's', 'b')$$, 'teacher:' || pg_temp.id(102)), '42501', 'portal.invalid_recipient');
select pg_temp.act(7);
select pg_temp.fails($$select public.portal_send_message('office', 's', 'b')$$, '22023', 'portal.student_required');
select pg_temp.fails(format($$select public.portal_send_message('office', 's', 'b', null, %L)$$, pg_temp.id(203)), '42501', 'portal.not_linked');
create temp table pr_ids(name text primary key, ids uuid[]) on commit drop;
grant all on pr_ids to authenticated;
insert into pr_ids select 'family_to_office', public.portal_send_message('office', 'Absence', 'Sara sera absente.', null, pg_temp.id(201));
insert into pr_ids select 'family_to_teacher', public.portal_send_message('teacher:' || pg_temp.id(101), 'Devoirs', 'Question.', null, pg_temp.id(202));
select pg_temp.owner();
select pg_temp.ok((select from_name = 'Parent de Sara' and sender_profile_id = pg_temp.id(7) and recipient_profile_id = pg_temp.id(12)
  and student_id = pg_temp.id(201) from public.messages where id = (select ids[1] from pr_ids where name = 'family_to_office')),
  'T-32 from_name is server-set and the office account receives');
-- T-33: get_teacher_directory: families refused; a teacher reads only the own row.
select pg_temp.act(7);
select pg_temp.fails('select * from public.get_teacher_directory()', '42501');
select pg_temp.act(10);
select pg_temp.fails('select * from public.get_teacher_directory()', '42501');
select pg_temp.act(4);
select pg_temp.ok((select array_agg(id) from public.get_teacher_directory()) = array[pg_temp.id(101)], 'T-33 a teacher reads only the own row');
select pg_temp.act(3);
select pg_temp.ok((select count(*) from public.get_teacher_directory() where id in (pg_temp.id(101), pg_temp.id(102))) = 2,
  'T-33 the receptionist keeps the safe directory');
-- T-34: parent:<id> resolves to every active parent link and is refused without one.
select pg_temp.owner();
insert into public.family_links(student_id, relation, profile_id, invite_email, status, activated_at) values
  (pg_temp.id(201), 'parent', pg_temp.id(8), 'pr-family-a@example.test', 'active', now());
select pg_temp.act(4);
select pg_temp.ok(cardinality(public.portal_send_message('parent:' || pg_temp.id(201), 'Bravo', 'Très bien.')) = 2,
  'T-34 parent:<id> reaches every active parent link');
select pg_temp.fails(format($$select public.portal_send_message(%L, 's', 'b')$$, 'parent:' || pg_temp.id(204)), '42501', 'portal.no_linked_account');
select pg_temp.fails(format($$select public.portal_send_message(%L, 's', 'b')$$, 'learner:' || pg_temp.id(213)), '42501', 'portal.not_linked');
select pg_temp.owner();
delete from public.family_links where profile_id = pg_temp.id(8);
-- T-35: office resolves only to the Q6 account; without it the office key is refused.
savepoint t35;
delete from public.app_config where key = 'portal_office_profile_id';
select pg_temp.act(7);
select pg_temp.ok(not exists (select 1 from public.portal_message_recipients() where recipient_key = 'office'), 'T-35 no office key without the Q6 account');
select pg_temp.fails(format($$select public.portal_send_message('office', 's', 'b', null, %L)$$, pg_temp.id(201)), '42501', 'portal.office_not_configured');
rollback to savepoint t35;
savepoint t35b;
update public.app_config set value = pg_temp.id(1)::text where key = 'portal_office_profile_id';
select pg_temp.act(7);
select pg_temp.fails(format($$select public.portal_send_message('office', 's', 'b', null, %L)$$, pg_temp.id(201)), '42501', 'portal.office_not_configured');
rollback to savepoint t35b;

-- ===========================================================================
-- T-39..T-40 Grants and sign-in.
-- ===========================================================================
select pg_temp.owner();
do $$ declare f text; begin
  foreach f in array array['public.get_my_email()','public.get_my_role()','public.get_my_student_id()','public.get_my_teacher_id()',
    'public.get_visible_student_ids()','public.mark_my_notifications_read()','public.handle_new_auth_user()',
    'public.handle_new_receipt()','public.log_activity()','public.notify_premium_homework_teacher()',
    'public.sync_premium_membership_entitlement()'] loop
    perform pg_temp.ok(not has_function_privilege('anon', f, 'EXECUTE'), 'T-39 anon cannot execute ' || f);
  end loop;
  foreach f in array array['public.handle_new_auth_user()','public.handle_new_receipt()','public.log_activity()',
    'public.notify_premium_homework_teacher()','public.sync_premium_membership_entitlement()'] loop
    perform pg_temp.ok(not has_function_privilege('authenticated', f, 'EXECUTE'), 'T-39 authenticated cannot execute trigger ' || f);
  end loop;
  foreach f in array array['public.portal_teacher_roster(uuid)','public.portal_my_learners()','public.portal_learner_record(uuid)',
    'public.portal_request_reenrollment(uuid)','public.portal_message_recipients()','public.portal_send_message(text,text,text,uuid,uuid)',
    'public.portal_my_messages(text,timestamptz)','public.preview_family_invitation(text,text)',
    'public.prepare_family_invitation(text,text,uuid[])','public.prepare_teacher_invitation(text,uuid)',
    'public.link_family_student(uuid,uuid)','public.link_teacher_account(uuid,uuid)','public.revoke_family_link(uuid,text)',
    'public.list_family_links(uuid)'] loop
    perform pg_temp.ok(has_function_privilege('authenticated', f, 'EXECUTE') and not has_function_privilege('anon', f, 'EXECUTE')
      and not has_function_privilege('service_role', f, 'EXECUTE'), 'T-39 authenticated-only ' || f);
    perform pg_temp.ok((select prosecdef and proconfig = array['search_path=pg_catalog, pg_temp'] from pg_proc where oid = f::regprocedure),
      'T-39 definer with fixed search_path ' || f);
  end loop;
  foreach f in array array['public.get_visible_student_ids()','public.get_my_teacher_id()','public.get_my_email()','public.log_activity()',
    'public.mark_my_notifications_read()','public.teacher_can_access_student_group(uuid,uuid)'] loop
    perform pg_temp.ok((select proconfig = array['search_path=pg_catalog, pg_temp'] from pg_proc where oid = f::regprocedure),
      'T-39 hardened search_path ' || f);
  end loop;
  perform pg_temp.ok(not has_schema_privilege('authenticated', 'portal_security', 'USAGE')
    and not has_schema_privilege('anon', 'portal_security', 'USAGE')
    and not has_table_privilege('authenticated', 'public.family_links', 'SELECT')
    and not has_table_privilege('anon', 'public.family_links', 'SELECT'), 'T-39 the private schema and the link table have no API grant');
end $$;
select pg_temp.act(null);
do $$ declare t text; begin
  foreach t in array array['students','enrollments','receipts','charges','placement_tests','attendance','certificates',
      'assessments','learning_assessments','portfolios','messages','notifications','groups','app_config','announcements',
      'authorized_adults','profiles','family_links','legacy_receipt_reconciliation','premium_groups','premium_sessions'] loop
    perform pg_temp.ok(pg_temp.none('select * from public.' || t), 'T-39 anonymous read of ' || t || ': error or 0 rows');
  end loop;
end $$;
select pg_temp.owner();
insert into public.announcements(id, title, body, audience) values (pg_temp.id(961), 'PR notice', 'Pour tous', 'all');
select pg_temp.act(11);
select pg_temp.ok(not exists (select 1 from public.groups) and not exists (select 1 from public.app_config)
  and not exists (select 1 from public.announcements where id = pg_temp.id(961)), 'T-40 a pending session reads no group, setting or announcement');
select pg_temp.act(7);
select pg_temp.ok(exists (select 1 from public.announcements where id = pg_temp.id(961)) and exists (select 1 from public.groups),
  'T-40 a real role still reads them');

-- ===========================================================================
-- T-41..T-46 Inboxes by account.
-- ===========================================================================
-- Rows about learner 203 (family B) addressed to the shared address A also uses,
-- from the staff form, the D8 fallback and an online-style service write.
select pg_temp.act(2);
insert into public.notifications(id, type, recipient_email, student_id, subject, message, sent)
values (pg_temp.id(971), 'general', 'pr-parent-a@example.test', pg_temp.id(203), 'About B', 'x', true),
  (pg_temp.id(972), 'general', 'pr-parent-a@example.test', pg_temp.id(201), 'About A', 'x', true),
  (pg_temp.id(973), 'general', 'pr-parent-a@example.test', null, 'General', 'x', true),
  (pg_temp.id(974), 'absence', 'pr-family-a@example.test', pg_temp.id(201), 'Dossier address', 'x', true);
insert into public.messages(id, from_user_email, from_name, to_user_email, to_name, subject, body, type, student_id, read)
values (pg_temp.id(981), 'pr-admin@example.test', 'Admin', 'pr-parent-a@example.test', 'A', 'Staff about B', 'x', 'message', pg_temp.id(203), false),
  (pg_temp.id(982), 'pr-admin@example.test', 'Admin', 'pr-parent-a@example.test', 'A', 'Staff about A', 'x', 'message', pg_temp.id(201), false);
select pg_temp.owner();
insert into public.notifications(id, type, recipient_email, recipient_name, student_id, subject, message, sent, recipient_profile_id)
values (pg_temp.id(975), 'online_lesson_cancelled', 'pr-parent-a@example.test', 'Parent de Lina', pg_temp.id(203), 'Online B', 'x', false, pg_temp.id(7));
select pg_temp.ok(pg_temp.recipient('notifications', pg_temp.id(971)) is null and pg_temp.recipient('notifications', pg_temp.id(975)) is null
  and pg_temp.recipient('messages', pg_temp.id(981)) is null, 'T-41 rows about another family''s learner get no recipient account');
select pg_temp.ok(pg_temp.recipient('notifications', pg_temp.id(972)) = pg_temp.id(7) and pg_temp.recipient('notifications', pg_temp.id(973)) is null
  and pg_temp.recipient('notifications', pg_temp.id(974)) is null, 'T-41 own learner: the account; general or bare-address rows: none');
select pg_temp.act(7);
select pg_temp.ok((select array_agg(id) from public.notifications) = array[pg_temp.id(972)], 'T-41 parent A sees only the row about A''s child');
select pg_temp.ok(not exists (select 1 from public.portal_my_messages('inbox') where student_id = pg_temp.id(203))
  and exists (select 1 from public.portal_my_messages('inbox') where id = pg_temp.id(982)), 'T-41 inbox likewise');
select pg_temp.act(8);
select pg_temp.ok(not exists (select 1 from public.notifications) and not exists (select 1 from public.portal_my_messages('inbox')),
  'T-42 the unlinked same-address account sees none (e-mail only)');
-- T-43: a client-supplied recipient is overwritten.
select pg_temp.act(2);
insert into public.notifications(id, type, recipient_email, student_id, subject, message, sent, recipient_profile_id)
values (pg_temp.id(976), 'general', 'pr-family-a@example.test', pg_temp.id(201), 'Forged', 'x', true, pg_temp.id(7));
update public.messages set recipient_profile_id = pg_temp.id(7) where id = pg_temp.id(981);
select pg_temp.ok(pg_temp.recipient('notifications', pg_temp.id(976)) is null and pg_temp.recipient('messages', pg_temp.id(981)) is null,
  'T-43 a client-supplied recipient_profile_id is overwritten on insert and update');
-- T-44: after revoking P's link to the child, every row about it disappears; general rows remain.
savepoint t44;
select public.revoke_family_link(pg_temp.id(601), 'Test inbox');
select pg_temp.act(7);
select pg_temp.ok(not exists (select 1 from public.notifications) and not exists (select 1 from public.portal_my_messages('inbox')),
  'T-44 rows about the revoked learner disappear');
select pg_temp.owner();
update public.notifications set recipient_email = 'pr-parent-a@example.test' where id = pg_temp.id(973);
select pg_temp.act(7);
rollback to savepoint t44;
-- A general row addressed to a parent account is not attributed (learner-less rows: staff or teacher only).
select pg_temp.ok(pg_temp.recipient('notifications', pg_temp.id(973)) is null, 'T-44 a learner-less row never reaches a family account');
-- T-45: mark_my_notifications_read and mark_message_read touch only the caller's rows.
select pg_temp.act(7);
select pg_temp.ok(public.mark_my_notifications_read() = 1, 'T-45 marks exactly the caller''s visible row');
select pg_temp.fails(format('select public.mark_message_read(%L)', pg_temp.id(981)), '42501');
select pg_temp.ok(public.mark_message_read(pg_temp.id(982)), 'T-45 the own message is marked read');
select pg_temp.owner();
select pg_temp.ok((select read_at is null from public.notifications where id = pg_temp.id(971))
  and (select read is false from public.messages where id = pg_temp.id(981)), 'T-45 other rows untouched');
-- T-46: e-mail-only rows never appear in any portal.
select pg_temp.ok(not exists (select 1 from public.notifications where id in (pg_temp.id(974), pg_temp.id(976)) and recipient_profile_id is not null),
  'T-46 e-mail-only rows have no recipient account');
-- Staff keep their e-mail-based view.
select pg_temp.act(12);
select pg_temp.ok(exists (select 1 from public.messages where id = (select ids[1] from pr_ids where name = 'family_to_office')),
  'T-46 the office login reads its messages as staff');

-- ===========================================================================
-- T-48 Family to teacher.
-- ===========================================================================
select pg_temp.owner();
select pg_temp.ok((select recipient_profile_id = pg_temp.id(4) from public.messages where id = (select ids[1] from pr_ids where name = 'family_to_teacher')),
  'T-48 the message about X reaches T1''s account');
select pg_temp.act(4);
select pg_temp.ok(exists (select 1 from public.portal_my_messages('inbox') where id = (select ids[1] from pr_ids where name = 'family_to_teacher')),
  'T-48 it appears in T1''s inbox');
select pg_temp.act(5);
select pg_temp.ok(not exists (select 1 from public.portal_my_messages('inbox')), 'T-48 T2''s inbox stays empty');
select pg_temp.act(2);
insert into public.messages(id, from_user_email, from_name, to_user_email, subject, body, type, student_id, read)
values (pg_temp.id(983), 'pr-admin@example.test', 'Admin', 'pr-t2@example.test', 'x', 'x', 'message', pg_temp.id(202), false);
select pg_temp.ok(pg_temp.recipient('messages', pg_temp.id(983)) is null, 'T-48 addressing T2''s account about X gets no recipient');
update public.messages set to_user_email = 'pr-t1@example.test' where id = pg_temp.id(983);
select pg_temp.ok(pg_temp.recipient('messages', pg_temp.id(983)) = pg_temp.id(4), 'T-48 an update recomputes the recipient');
savepoint t48;
select pg_temp.act(2);
select public.remove_learner_from_group(pg_temp.id(202), pg_temp.id(301), (select updated_at from public.students where id = pg_temp.id(202)), null);
select pg_temp.act(4);
select pg_temp.ok(not exists (select 1 from public.portal_my_messages('inbox') where student_id = pg_temp.id(202)),
  'T-48 once X leaves G1 the message no longer shows in T1''s inbox');
rollback to savepoint t48;
-- Replies go to the original sender's account.
select pg_temp.act(4);
insert into pr_ids select 'teacher_reply', public.portal_send_message(null, 'Re: Devoirs', 'Réponse.',
  (select ids[1] from pr_ids where name = 'family_to_teacher'));
select pg_temp.owner();
select pg_temp.ok((select recipient_profile_id = pg_temp.id(7) and student_id = pg_temp.id(202) and from_name = 'Teacher One'
  from public.messages where id = (select ids[1] from pr_ids where name = 'teacher_reply')),
  'T-48 a teacher reply reaches the parent''s account about the same learner');

-- ===========================================================================
-- T-47 Premium guard and the R0 readiness check.
-- ===========================================================================
select pg_temp.owner();
select pg_temp.ok('premium tables are not empty' = any(portal_security.readiness_failures()), 'T-47 non-empty Premium tables block readiness');
select pg_temp.ok('an address is on more than 10 learner files' <> all(portal_security.readiness_failures()), 'T-47 no placeholder above 10 in fixtures');
-- The matrix records the exposure Release B or the empty-table check must cover.
select pg_temp.act(7);
select pg_temp.ok((select count(*) from public.premium_group_memberships) = 1 and (select count(*) from public.premium_sessions) = 1
  and (select count(*) from public.premium_attendance) = 1 and (select count(*) from public.premium_homework_submissions) = 1,
  'T-47 matrix: linked parent A reads the Premium rows of a linked child (free text included)');
select pg_temp.act(8);
select pg_temp.ok((select count(*) from public.premium_sessions) = 0 and (select count(*) from public.premium_attendance) = 0,
  'T-47 matrix: an unlinked account reads no Premium row');
select pg_temp.act(4);
select pg_temp.ok((select count(*) from public.premium_sessions) = 1 and (select count(*) from public.premium_groups) = 1,
  'T-47 matrix: the Premium teacher reads the session and group rows');
select pg_temp.owner();
delete from public.premium_homework_submissions where id = pg_temp.id(935);
delete from public.premium_attendance where id = pg_temp.id(934);
delete from public.premium_sessions where id = pg_temp.id(933);
delete from public.premium_group_memberships where id = pg_temp.id(932);
delete from public.premium_groups where id = pg_temp.id(931);
select pg_temp.ok('premium tables are not empty' <> all(portal_security.readiness_failures()), 'T-47 empty Premium tables pass');

-- Re-enrollment request replaces the parent insert policy.
select pg_temp.act(7);
insert into pr_ids select 'reenrollment', array[public.portal_request_reenrollment(pg_temp.id(201))];
select pg_temp.ok(pg_temp.none(format('select * from public.enrollments where id = %L', (select ids[1] from pr_ids where name = 'reenrollment'))),
  'the parent cannot read the enrollment it requested');
select pg_temp.owner();
select pg_temp.ok((select count(*) from public.enrollments where student_id = pg_temp.id(201) and status = 'Submitted' and group_id is null) = 1,
  'portal_request_reenrollment inserts one Submitted request');
select pg_temp.act(9);
select pg_temp.fails(format('select public.portal_request_reenrollment(%L)', pg_temp.id(201)), '42501', 'portal.not_linked');
select pg_temp.act(10);
select pg_temp.fails(format('select public.portal_request_reenrollment(%L)', pg_temp.id(204)), '42501', 'portal.forbidden');
select pg_temp.act(7);
select pg_temp.fails(format($$insert into public.enrollments(student_id, status) values (%L, 'Submitted')$$, pg_temp.id(201)), '42501');

-- Re-created functions keep their signatures, owner, security mode and grants.
select pg_temp.owner();
do $$ declare r record; begin
  for r in select f, acl from (values
    ('public.get_visible_student_ids()', 'authenticated,postgres,service_role'),
    ('public.get_my_teacher_id()', 'authenticated,postgres,service_role'),
    ('public.get_my_email()', 'authenticated,postgres,service_role'),
    ('public.teacher_can_access_student_group(uuid,uuid)', 'authenticated,postgres,service_role'),
    ('public.can_message_recipient(text)', 'authenticated,postgres,service_role'),
    ('public.get_teacher_directory(uuid)', 'authenticated,postgres'),
    ('public.resolve_storage_asset(uuid)', 'authenticated,postgres'),
    ('storage_security.can_write(uuid,text,uuid,uuid,uuid)', 'postgres'),
    ('public.prepare_role_invitation(text,text)', 'authenticated,postgres'),
    ('public.apply_pending_role()', 'authenticated,postgres'),
    ('public.mark_message_read(uuid)', 'authenticated,postgres'),
    ('public.mark_my_notifications_read()', 'authenticated,postgres,service_role')) v(f, acl) loop
    perform pg_temp.ok((select pg_get_userbyid(proowner) = 'postgres' and prosecdef from pg_proc where oid = r.f::regprocedure),
      'owner and definer kept: ' || r.f);
    perform pg_temp.ok((select string_agg(distinct coalesce(nullif(split_part(a, '=', 1), ''), 'PUBLIC'), ',' order by
      coalesce(nullif(split_part(a, '=', 1), ''), 'PUBLIC')) from pg_proc, unnest(proacl::text[]) a where oid = r.f::regprocedure) = r.acl,
      'grants: ' || r.f);
  end loop;
end $$;

rollback;
\echo 'portal readiness cross-role denial suite passed'
