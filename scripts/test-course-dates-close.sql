-- Courses with dates — close a finished course (plan CDC-r3, migration 128). Dates and
-- their window, the reception group command, « Clôturer le cours » with the unplaced
-- paid learners (B1), the charges it links (S6, N-2), the closed mark and the placement
-- guard on every path, « Rouvrir le cours », the finished-course list, « Clôturer
-- l'année » (D5), the group read policies (D6) and the D10 R0 count query on a fixture.
-- Local Supabase only; synthetic fixtures; everything rolls back. Dates are relative to
-- the centre's business date: the course year is the school year of tomorrow, so a day
-- before and a day after today always lie inside its window (1 June – 31 August).
\set ON_ERROR_STOP on
begin;

create function pg_temp.ok(value boolean, label text) returns void language plpgsql as $$ begin
  if value is not true then raise exception 'FAIL: %', label; end if;
end $$;
create function pg_temp.id(i integer) returns uuid language sql immutable as $$
  select ('cdc00000-0000-4000-8000-' || lpad(to_hex(i), 12, '0'))::uuid
$$;
create function pg_temp.act(i integer) returns void language plpgsql as $$ begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', pg_temp.id(i)::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.id(i), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
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
-- Runs a statement and rolls it back, returning its error (or 'ok').
create function pg_temp.try_then_undo(statement text) returns text language plpgsql as $$
declare st text; h text; begin
  begin
    execute statement;
    raise exception 'CDC_UNDO' using errcode = 'P0001';
  exception when others then
    get stacked diagnostics st = returned_sqlstate, h = pg_exception_hint;
    if st = 'P0001' and sqlerrm = 'CDC_UNDO' then return 'ok'; end if;
    return st || '/' || coalesce(nullif(h, ''), '-');
  end;
end $$;
create function pg_temp.su(p uuid) returns timestamptz language sql security definer as $$
  select updated_at from public.students where id = p $$;
create function pg_temp.eu(p uuid) returns timestamptz language sql security definer as $$
  select updated_at from public.enrollments where id = p $$;
create function pg_temp.gu(p uuid) returns timestamptz language sql security definer as $$
  select updated_at from public.groups where id = p $$;
create function pg_temp.closed(p uuid) returns timestamptz language sql security definer as $$
  select closed_at from public.groups where id = p $$;
create function pg_temp.est(p uuid) returns text language sql security definer as $$
  select status from public.enrollments where id = p $$;
create function pg_temp.sst(p uuid) returns text language sql security definer as $$
  select status from public.students where id = p $$;
create function pg_temp.tok(l uuid, n text, b date) returns text language sql security definer as $$
  select crm_security.candidate_token(l, n, b) $$;
create function pg_temp.ver(l uuid) returns bigint language sql security definer as $$
  select version from public.crm_leads where id = l $$;
create temp table fx(k text primary key, v jsonb);
grant all on fx to public;
create function pg_temp.put(k text, v jsonb) returns void language sql as $$
  insert into fx values (k, v) on conflict (k) do update set v = excluded.v $$;
create function pg_temp.get(k text) returns jsonb language sql as $$ select v from fx where fx.k = $1 $$;
create function pg_temp.uid(k text) returns uuid language sql as $$ select (v #>> '{}')::uuid from fx where fx.k = $1 $$;
-- The course year and its neighbours; d(n) is n days from the centre's today.
create function pg_temp.yr() returns text language sql stable as $$ select public.centre_school_year(public.business_date() + 1) $$;
create function pg_temp.an() returns text language sql stable as $$ select replace(pg_temp.yr(), '/', '-') $$;
create function pg_temp.first() returns integer language sql stable as $$ select left(pg_temp.yr(), 4)::integer $$;
create function pg_temp.yr_next() returns text language sql stable as $$ select (pg_temp.first() + 1) || '/' || (pg_temp.first() + 2) $$;
create function pg_temp.yr_prev() returns text language sql stable as $$ select (pg_temp.first() - 1) || '/' || pg_temp.first() $$;
create function pg_temp.d(n integer) returns date language sql stable as $$ select public.business_date() + n $$;
create function pg_temp.logs(kind text, g uuid) returns bigint language sql security definer as $$
  select count(*) from public.activity_log where changed_columns = array[kind] and after->>'group_id' = g::text $$;
create function pg_temp.pay(i integer, payload jsonb) returns jsonb language plpgsql as $$
declare r jsonb; begin
  perform pg_temp.act(i);
  r := public.create_charge_payment(payload || jsonb_build_object('payment_method', 'Espèces',
    'idempotency_key', coalesce(payload->>'idempotency_key', gen_random_uuid()::text)));
  perform pg_temp.owner();
  return r;
end $$;
-- Places a paid enrollment through the director's command.
create function pg_temp.place(st uuid, g uuid, e uuid, reason text default null) returns void language plpgsql as $$ begin
  perform pg_temp.act(1);
  perform public.place_learner_in_group(st, g, pg_temp.su(st), e, null, pg_temp.eu(e), reason, null);
  perform pg_temp.owner();
end $$;
create function pg_temp.r0_delta(label text) returns bigint language plpgsql as $$ begin
  return coalesce((select n from r0_after where category = label), 0) - coalesce((select n from r0_before where category = label), 0);
end $$;

-- Users: 1 director, 2 admin, 3 receptionist, 4 teacher, 5 parent, 6 student, 7 pending.
insert into auth.users(id, email, aud, role, email_confirmed_at, created_at, updated_at)
select pg_temp.id(i), 'cdc-user-' || i || '@example.test', 'authenticated', 'authenticated', now(), now(), now()
from generate_series(1, 7) i;
update public.profiles p set role = r.role
from (values (1, 'director'), (2, 'admin'), (3, 'receptionist'), (4, 'teacher'), (5, 'parent'), (6, 'student'), (7, 'pending')) r(i, role)
where p.id = pg_temp.id(r.i);
insert into public.teachers(id, full_name, email) values (pg_temp.id(90), 'CDC teacher', 'cdc-teacher@example.test');
select pg_temp.act(1);
select crm_create_followup_policy(gen_random_uuid(), '{"weekly_hours":{"1":[["00:00","23:59"]],"2":[["00:00","23:59"]],"3":[["00:00","23:59"]],"4":[["00:00","23:59"]],"5":[["00:00","23:59"]],"6":[["00:00","23:59"]],"7":[["00:00","23:59"]]}}');
select pg_temp.owner();

-- ===========================================================================
-- 0. Manifest: grants, the journal, the policies, the triggers
-- ===========================================================================
select pg_temp.ok(has_function_privilege('authenticated', f, 'execute') and not has_function_privilege('anon', f, 'execute')
  and not has_function_privilege('service_role', f, 'execute'), 'API grant: ' || f)
from unnest(array['public.list_courses_to_close()', 'public.close_course_preview(uuid)',
  'public.close_course(uuid,integer,text,uuid[],uuid[])', 'public.reopen_course(uuid,timestamptz)',
  'public.close_school_year_preview(text)', 'public.family_group_ids()']) f;
select pg_temp.ok(not has_function_privilege(r, f, 'execute'), 'no API grant: ' || f || ' for ' || r)
from unnest(array['academic_security.course_dates_required(text)', 'academic_security.course_of_one_allows(uuid,integer,uuid)',
  'academic_security.course_unplaced(uuid)', 'academic_security.course_link_charges(uuid)', 'academic_security.course_engagements(uuid)',
  'academic_security.course_late_deposits(uuid,date)', 'academic_security.course_close_replay(uuid)',
  'academic_security.year_close_rows(text)', 'academic_security.guard_course_group()', 'academic_security.guard_course_placement()']) f
cross join unnest(array['anon', 'authenticated', 'service_role']) r;
select pg_temp.ok(not has_table_privilege(r, 'maintenance.course_close_journal', p), 'journal closed to ' || r || ' ' || p)
from unnest(array['anon', 'authenticated', 'service_role']) r cross join unnest(array['select', 'insert', 'update', 'delete']) p;
select pg_temp.ok((select relrowsecurity from pg_class where oid = 'maintenance.course_close_journal'::regclass), 'journal RLS on');
select pg_temp.ok(not exists (select 1 from pg_policies where tablename = 'groups' and policyname = 'groups read all auth')
  and exists (select 1 from pg_policies where tablename = 'groups' and policyname = 'groups read staff')
  and exists (select 1 from pg_policies where tablename = 'groups' and policyname = 'groups read family'), 'D6 policies');
select pg_temp.ok((select count(*) from pg_trigger where not tgisinternal and tgname in ('groups_course_guard', 'enrollment_course_guard',
  'groups_year_guard')) = 3, 'course triggers');
select pg_temp.ok(position('for share' in pg_get_functiondef('academic_security.enforce_group_capacity()'::regprocedure)) > 0,
  'N-1: the capacity trigger share-locks the group row');

-- The D10 R0 count query, embedded verbatim from supabase/manual/course_close_r0_counts.sql
-- without its first line (`set transaction read only;`); the node test checks they stay equal.
create function pg_temp.r0() returns table(category text, n bigint) language sql as $r0$
with live as (
  select e.id, e.student_id, e.status, e.group_id, e.session_type, e.school_year, e.level, e.notes, e.date_inscription
  from public.enrollments e
  where e.status in ('Submitted', 'Under Review', 'Confirmed', 'Validated', 'Trial')
), types(st) as (values ('Yearly'), ('Adults'), ('Summer Camp'), ('Communication Junior'), ('Communication Adult'),
  ('One-to-One'), ('Mise à niveau'), ('Other'), ('Online'), ('Online One-to-One'))
, progs(p) as (values ('Mise à niveau'), ('Adults'), ('One-to-One'), ('Online One-to-One'))
, scen(s, ps) as (values
  ('S1 Mise à niveau', array['Mise à niveau']),
  ('S2 Mise à niveau + Adults', array['Mise à niveau', 'Adults']),
  ('S3 Mise à niveau + One-to-One + Online One-to-One', array['Mise à niveau', 'One-to-One', 'Online One-to-One']),
  ('S4 all four programmes', array['Mise à niveau', 'Adults', 'One-to-One', 'Online One-to-One']))
, u as (select x.* from live x where x.status = 'Confirmed' and x.group_id is null)
, ua as (select x.* from u x where exists (select 1 from public.students s where s.id = x.student_id and s.deleted_at is null))
, t as (select x.* from u x where x.session_type in (select p from progs))
, g as (
  select gr.id, gr.name, gr.session_type, gr.niveau, gr.capacite_max, gr.annee,
    replace(btrim(gr.annee), '-', '/') as yr,
    (select count(*) from live x where x.group_id = gr.id) as live_n,
    gr.session_type not in ('Online', 'Online One-to-One')
      or exists (select 1 from public.online_courses c where c.group_id = gr.id and c.status <> 'closed') as open_course
  from public.groups gr
)
, st as (select sc.s, x.id, x.student_id, x.session_type from scen sc join t x on x.session_type = any(sc.ps))
, sl as (
  select d.s, exists (select 1 from live y where y.student_id = d.student_id
    and y.id not in (select z.id from st z where z.s = d.s)) as keeps
  from (select distinct s, student_id from st) d
)
select 'A1 live enrollments · ' || coalesce(session_type, '(none)') || ' · ' || coalesce(school_year, '(none)')
    || ' · ' || status || case when group_id is null then ' · sans groupe' else ' · en groupe' end as category,
  count(*) as n
  from live group by session_type, school_year, status, (group_id is null)
union all select 'A2 card today « Inscrits — groupe à affecter » (Confirmed, no group)', count(*) from u
union all select 'A3 card under OA5 (programmes that use groups: every programme but Other)', count(*) from u
  where session_type <> 'Other'
union all select 'A4 card under OA5 after the one-time step · ' || sc.s,
  (select count(*) from u where session_type <> 'Other') - (select count(*) from st where st.s = sc.s) from scen sc
union all select 'B1 groups · ' || ty.st, count(g.id) from types ty left join g on g.session_type = ty.st group by ty.st
union all select 'B2 groups with live learners · ' || ty.st, count(g.id) filter (where g.live_n > 0)
  from types ty left join g on g.session_type = ty.st group by ty.st
union all select 'B3 live learners in groups · ' || ty.st, coalesce(sum(g.live_n), 0)::bigint
  from types ty left join g on g.session_type = ty.st group by ty.st
union all select 'B4 groups whose year is not a valid school year (expected 0)', count(*) from g
  where coalesce(btrim(annee) ~ '^[0-9]{4}[-/][0-9]{4}$' and right(btrim(annee), 4)::integer = left(btrim(annee), 4)::integer + 1, false) is not true
union all select 'B5 One-to-One groups with a capacity other than 1', count(*) from g
  where session_type = 'One-to-One' and capacite_max is distinct from 1
union all select 'B6 groups whose name contains a learner''s full name (OA3 review)', count(*) from g
  where exists (select 1 from public.students s where length(btrim(s.full_name)) >= 5
    and position(lower(btrim(s.full_name)) in lower(g.name)) > 0)
union all select 'C1 online courses · ' || status, count(*) from public.online_courses group by status
union all select 'C2 online courses past their term end and not closed', count(*) from public.online_courses c
  where c.term_end < public.business_date() and c.status <> 'closed'
union all select 'C3 live enrollments in the C2 courses', count(*) from live x
  where x.group_id in (select c.group_id from public.online_courses c where c.term_end < public.business_date() and c.status <> 'closed')
union all select 'U1 paid without group, learner file not archived · ' || session_type || ' · ' || coalesce(school_year, '(none)') || ' · ' || coalesce(level, '(no level)'),
  count(*) from ua group by session_type, school_year, level
union all select 'U2 of U1: matches a group of the same programme, year and level (online: course not closed) · ' || ty.st, count(x.id)
  from types ty left join ua x on x.session_type = ty.st and exists (select 1 from g where g.open_course
    and g.session_type = x.session_type and g.yr = x.school_year and (x.level is null or x.level = g.niveau))
  group by ty.st
union all select 'U3 groups with at least one matching paid enrollment without group · ' || ty.st, count(g.id)
  from types ty left join g on g.session_type = ty.st and g.open_course and exists (select 1 from ua x
    where x.session_type = g.session_type and x.school_year = g.yr and (x.level is null or x.level = g.niveau))
  group by ty.st
union all select 'T1 one-time step candidates · ' || pr.p || ' · ' || coalesce(x.school_year, '—'), count(x.id)
  from progs pr left join t x on x.session_type = pr.p group by pr.p, x.school_year
union all select 'T2 ' || sc.s || ' · enrollments ended · ' || pr.p, count(x.id)
  from scen sc join progs pr on pr.p = any(sc.ps) left join st x on x.s = sc.s and x.session_type = pr.p
  group by sc.s, pr.p
union all select 'T3 ' || sc.s || ' · learner files that stay Inscrit', count(l.s) filter (where l.keeps)
  from scen sc left join sl l on l.s = sc.s group by sc.s
union all select 'T4 ' || sc.s || ' · learner files that become Ancien apprenant', count(l.s) filter (where not l.keeps)
  from scen sc left join sl l on l.s = sc.s group by sc.s
union all select 'T5 candidates whose learner file is archived (expected 0) · ' || pr.p, count(x.id)
  from progs pr left join t x on x.session_type = pr.p
    and exists (select 1 from public.students s where s.id = x.student_id and s.deleted_at is not null) group by pr.p
union all select 'T6 candidates whose learner file is not Enrolled (expected 0) · ' || pr.p, count(x.id)
  from progs pr left join t x on x.session_type = pr.p
    and exists (select 1 from public.students s where s.id = x.student_id and s.status is distinct from 'Enrolled') group by pr.p
union all select 'T7a candidates with an open balance on a charge linked to the enrollment · ' || pr.p, count(x.id)
  from progs pr left join t x on x.session_type = pr.p
    and exists (select 1 from public.charge_balances b where b.enrollment_id = x.id and b.voided_at is null and b.balance > 0)
  group by pr.p
union all select 'T7b1 candidates with a partly paid open unlinked tuition charge of the same programme and year (linked by the step) · ' || pr.p, count(x.id)
  from progs pr left join t x on x.session_type = pr.p
    and exists (select 1 from public.charge_balances b where b.student_id = x.student_id and b.enrollment_id is null
      and b.voided_at is null and not b.legacy and b.session_type = x.session_type
      and b.balance > 0 and b.paid_amount > 0 and b.school_year = x.school_year)
  group by pr.p
union all select 'T7b2 candidates with an engagement: open unlinked tuition charge of the same programme, that year or no year, nothing paid (never linked) · ' || pr.p, count(x.id)
  from progs pr left join t x on x.session_type = pr.p
    and exists (select 1 from public.charge_balances b where b.student_id = x.student_id and b.enrollment_id is null
      and b.voided_at is null and not b.legacy and b.session_type = x.session_type
      and b.balance > 0 and b.paid_amount = 0 and (b.school_year = x.school_year or b.school_year is null))
  group by pr.p
union all select 'T7b3a candidates with a partly paid open unlinked tuition charge without a year, created during the candidate''s school year, the current one (linked by the step) · ' || pr.p, count(x.id)
  from progs pr left join t x on x.session_type = pr.p
    and exists (select 1 from public.charge_balances b where b.student_id = x.student_id and b.enrollment_id is null
      and b.voided_at is null and not b.legacy and b.session_type = x.session_type
      and b.balance > 0 and b.paid_amount > 0 and b.school_year is null
      and x.school_year = public.centre_school_year()
      and public.centre_school_year(public.business_date(b.created_at)) = x.school_year)
  group by pr.p
union all select 'T7b3b candidates with a partly paid open unlinked tuition charge without a year from an earlier school year (pre-057, never linked) · ' || pr.p, count(x.id)
  from progs pr left join t x on x.session_type = pr.p
    and exists (select 1 from public.charge_balances b where b.student_id = x.student_id and b.enrollment_id is null
      and b.voided_at is null and not b.legacy and b.session_type = x.session_type
      and b.balance > 0 and b.paid_amount > 0 and b.school_year is null
      and not (x.school_year = public.centre_school_year()
        and public.centre_school_year(public.business_date(b.created_at)) = x.school_year))
  group by pr.p
union all select 'T8 candidates with no live receipt on the enrollment or its charges · ' || pr.p, count(x.id)
  from progs pr left join t x on x.session_type = pr.p
    and not exists (select 1 from public.receipts r where r.voided_at is null and r.deleted_at is null
      and (r.enrollment_id = x.id or r.charge_id in (select c.id from public.charges c where c.enrollment_id = x.id)))
  group by pr.p
union all select 'T9 candidates linked to a CRM lead (conversion kept, no review flag) · ' || pr.p, count(x.id)
  from progs pr left join t x on x.session_type = pr.p
    and exists (select 1 from public.crm_leads l where l.enrollment_id = x.id and l.merged_into_lead_id is null)
  group by pr.p
union all select 'T10 candidates created by the Batch D clean-up (notes « Rattrapage EGC … ») · ' || pr.p, count(x.id)
  from progs pr left join t x on x.session_type = pr.p and x.notes like 'Rattrapage EGC%' group by pr.p
union all select 'T11 candidates by enrollment month · ' || x.session_type || ' · ' || coalesce(to_char(x.date_inscription, 'YYYY-MM'), '(none)'),
  count(*) from t x group by x.session_type, to_char(x.date_inscription, 'YYYY-MM')
union all select 'T12 Yearly paid without group (never in the step)', count(*) from u where session_type = 'Yearly'
union all select 'J1 Ended enrollments total', count(*) from public.enrollments where status = 'Ended'
union all select 'J2 learner files Alumni', count(*) from public.students where status = 'Alumni' and deleted_at is null;
$r0$;

-- ===========================================================================
-- 1. The D10 R0 count query on a fixture (next school year, so no course below matches it)
-- ===========================================================================
create temp table r0_before as select * from pg_temp.r0();
insert into public.students(id, full_name, status, session_type) values
  (pg_temp.id(201), 'CDC R0 one', 'Enrolled', 'Mise à niveau'), (pg_temp.id(202), 'CDC R0 two', 'Enrolled', 'Mise à niveau'),
  (pg_temp.id(203), 'CDC R0 three', 'Enrolled', 'Mise à niveau'), (pg_temp.id(204), 'CDC R0 four', 'Enrolled', 'Adults'),
  (pg_temp.id(205), 'CDC R0 five', 'Enrolled', 'One-to-One'), (pg_temp.id(206), 'CDC R0 six', 'Enrolled', 'Online One-to-One');
insert into public.enrollments(id, student_id, status, session_type, school_year, level) values
  (pg_temp.id(401), pg_temp.id(201), 'Confirmed', 'Mise à niveau', pg_temp.yr_next(), null),
  (pg_temp.id(402), pg_temp.id(202), 'Confirmed', 'Mise à niveau', pg_temp.yr_next(), null),
  (pg_temp.id(403), pg_temp.id(202), 'Confirmed', 'Yearly', pg_temp.yr_next(), 'Child 1'),
  (pg_temp.id(404), pg_temp.id(203), 'Confirmed', 'Mise à niveau', pg_temp.yr_next(), null),
  (pg_temp.id(405), pg_temp.id(204), 'Confirmed', 'Adults', pg_temp.yr_next(), null),
  (pg_temp.id(406), pg_temp.id(205), 'Confirmed', 'One-to-One', pg_temp.yr_next(), null),
  (pg_temp.id(407), pg_temp.id(206), 'Confirmed', 'Online One-to-One', pg_temp.yr_next(), null);
create temp table r0_after as select * from pg_temp.r0();
select pg_temp.ok(pg_temp.r0_delta(label) = expected, 'R0 ' || label || ' moved by ' || pg_temp.r0_delta(label) || ', expected ' || expected)
from (values
  ('A2 card today « Inscrits — groupe à affecter » (Confirmed, no group)', 7),
  ('A3 card under OA5 (programmes that use groups: every programme but Other)', 7),
  ('A4 card under OA5 after the one-time step · S1 Mise à niveau', 4),
  ('A4 card under OA5 after the one-time step · S4 all four programmes', 1),
  ('T1 one-time step candidates · Mise à niveau · ' || pg_temp.yr_next(), 3),
  ('T1 one-time step candidates · Adults · ' || pg_temp.yr_next(), 1),
  ('T1 one-time step candidates · One-to-One · ' || pg_temp.yr_next(), 1),
  ('T1 one-time step candidates · Online One-to-One · ' || pg_temp.yr_next(), 1),
  ('T2 S1 Mise à niveau · enrollments ended · Mise à niveau', 3),
  ('T2 S2 Mise à niveau + Adults · enrollments ended · Adults', 1),
  ('T3 S1 Mise à niveau · learner files that stay Inscrit', 1),
  ('T4 S1 Mise à niveau · learner files that become Ancien apprenant', 2),
  ('T3 S4 all four programmes · learner files that stay Inscrit', 1),
  ('T4 S4 all four programmes · learner files that become Ancien apprenant', 5),
  ('T5 candidates whose learner file is archived (expected 0) · Mise à niveau', 0),
  ('T6 candidates whose learner file is not Enrolled (expected 0) · Adults', 0),
  ('T8 candidates with no live receipt on the enrollment or its charges · Mise à niveau', 3),
  ('T12 Yearly paid without group (never in the step)', 1)) x(label, expected);
-- Every per-programme and per-scenario line is present, zero rows included (nit).
select pg_temp.ok((select count(*) from r0_after where category = label) = 1, 'R0 explicit row: ' || label)
from (
  select q.t || ' ' || s || ' · ' || q.q as label
  from unnest(array['S1 Mise à niveau', 'S2 Mise à niveau + Adults', 'S3 Mise à niveau + One-to-One + Online One-to-One',
    'S4 all four programmes']) s
  cross join (values ('T3', 'learner files that stay Inscrit'), ('T4', 'learner files that become Ancien apprenant')) q(t, q)
  union all
  select x || ' · ' || p from unnest(array['T5 candidates whose learner file is archived (expected 0)',
    'T6 candidates whose learner file is not Enrolled (expected 0)',
    'T7a candidates with an open balance on a charge linked to the enrollment',
    'T9 candidates linked to a CRM lead (conversion kept, no review flag)']) x
  cross join unnest(array['Mise à niveau', 'Adults', 'One-to-One', 'Online One-to-One']) p
  union all
  select 'B1 groups · ' || st from unnest(array['Yearly', 'Adults', 'Summer Camp', 'Communication Junior', 'Communication Adult',
    'One-to-One', 'Mise à niveau', 'Other', 'Online', 'Online One-to-One']) st
) l;

-- ===========================================================================
-- 2. Dates (D1, Q1, Q3, S5) and One-to-One (Q4)
-- ===========================================================================
-- The main course of this suite: Mise à niveau A1, finished yesterday.
insert into public.groups(id, name, session_type, niveau, annee, capacite_max, date_debut, date_fin) values
  (pg_temp.id(301), 'CDC MAN A1', 'Mise à niveau', 'A1', pg_temp.an(), 10, pg_temp.d(-30), pg_temp.d(-1)),
  (pg_temp.id(303), 'CDC Yearly', 'Yearly', 'Child 1', pg_temp.an(), 20, null, null);
select pg_temp.fails(format($$insert into public.groups(name, session_type, niveau, annee) values ('x', %L, %L, %L)$$, p, l, pg_temp.an()),
  '23514', 'course.dates_required')
from (values ('Mise à niveau', 'A1'), ('Adults', 'Beginning 1'), ('Summer Camp', 'A1')) x(p, l);
select pg_temp.fails(format($$insert into public.groups(name, session_type, niveau, annee, capacite_max) values ('x', 'One-to-One', 'A1', %L, 1)$$,
  pg_temp.an()), '23514', 'course.dates_required');
select pg_temp.fails(format($$insert into public.groups(name, session_type, niveau, annee, date_debut) values ('x', 'Mise à niveau', 'A1', %L, %L)$$,
  pg_temp.an(), pg_temp.d(-1)), '23514', 'course.dates_required');
-- The window: 1 June of the first year to 31 August of the second, both included.
select pg_temp.fails(format($$insert into public.groups(name, session_type, niveau, annee, date_debut, date_fin)
  values ('x', 'Mise à niveau', 'A1', %L, %L, %L)$$, pg_temp.an(), make_date(pg_temp.first(), 5, 31), pg_temp.d(1)),
  '23514', 'course.dates_outside_year');
select pg_temp.fails(format($$insert into public.groups(name, session_type, niveau, annee, date_debut, date_fin)
  values ('x', 'Mise à niveau', 'A1', %L, %L, %L)$$, pg_temp.an(), pg_temp.d(-1), make_date(pg_temp.first() + 1, 9, 1)),
  '23514', 'course.dates_outside_year');
select pg_temp.ok(pg_temp.try_then_undo(format($$insert into public.groups(name, session_type, niveau, annee, date_debut, date_fin)
  values ('x', 'Mise à niveau', 'A1', %L, %L, %L)$$, pg_temp.an(), make_date(pg_temp.first(), 6, 1), make_date(pg_temp.first() + 1, 8, 31))) = 'ok',
  'the window bounds are accepted');
-- The message names the window.
do $$ begin
  insert into public.groups(name, session_type, niveau, annee, date_debut, date_fin)
  values ('x', 'Mise à niveau', 'A1', pg_temp.an(), make_date(pg_temp.first(), 5, 1), pg_temp.d(1));
  raise exception 'FAIL: outside the window accepted';
exception when check_violation then
  perform pg_temp.ok(sqlerrm = format('Les dates du cours doivent être comprises dans l’année scolaire du groupe (du 1er juin %s au 31 août %s).',
    pg_temp.first(), pg_temp.first() + 1), 'window message: ' || sqlerrm);
end $$;
select pg_temp.fails(format($$insert into public.groups(name, session_type, niveau, annee, date_debut, date_fin)
  values ('x', 'Mise à niveau', 'A1', %L, %L, %L)$$, pg_temp.an(), pg_temp.d(0), pg_temp.d(-1)), '23514');
select pg_temp.ok(pg_temp.try_then_undo(format($$insert into public.groups(name, session_type, niveau, annee, date_debut, date_fin)
  values ('x', 'Yearly', 'Child 1', %L, %L, %L)$$, pg_temp.an(), pg_temp.d(-1), pg_temp.d(1))) = 'ok', 'Yearly may carry dates');
select pg_temp.fails(format($$insert into public.groups(name, session_type, niveau, annee, date_debut, date_fin)
  values ('x', 'Online', 'A1', %L, %L, %L)$$, pg_temp.an(), pg_temp.d(-1), pg_temp.d(1)), '23514', 'course.online_dates');
-- Never cleared; a change into a dated programme needs them.
select pg_temp.fails(format('update public.groups set date_fin = null where id = %L', pg_temp.id(301)), '23514', 'course.dates_required');
select pg_temp.fails(format('update public.groups set date_debut = null where id = %L', pg_temp.id(301)), '23514', 'course.dates_required');
insert into public.groups(id, name, session_type, niveau, annee) values (pg_temp.id(304), 'CDC to MAN', 'Yearly', 'Child 1', pg_temp.an());
select pg_temp.fails(format($$update public.groups set session_type = 'Mise à niveau', niveau = 'A1' where id = %L$$, pg_temp.id(304)),
  '23514', 'course.dates_required');
select pg_temp.ok(pg_temp.try_then_undo(format($$update public.groups set session_type = 'Mise à niveau', niveau = 'A1', date_debut = %L,
  date_fin = %L where id = %L$$, pg_temp.d(1), pg_temp.d(1), pg_temp.id(304))) = 'ok', 'a change into a dated programme with its dates');
delete from public.groups where id = pg_temp.id(304);
-- S5: a create without a year takes the current school year, then the window is checked.
select pg_temp.ok(pg_temp.try_then_undo(format($$insert into public.groups(name, session_type, niveau, date_debut, date_fin)
  values ('x', 'Mise à niveau', 'A1', %L, %L)$$, public.business_date(), public.business_date())) = 'ok', 'S5: default year, dates inside');
select pg_temp.fails(format($$insert into public.groups(name, session_type, niveau, date_debut, date_fin) values ('x', 'Mise à niveau', 'A1', %L, %L)$$,
  make_date(left(public.centre_school_year(), 4)::integer + 2, 1, 10), make_date(left(public.centre_school_year(), 4)::integer + 2, 1, 20)),
  '23514', 'course.dates_outside_year');
-- A year change re-checks the dates; a date change is logged.
insert into public.groups(id, name, session_type, niveau, annee, capacite_max, date_debut, date_fin) values
  (pg_temp.id(305), 'CDC MAN dates log', 'Mise à niveau', 'A2', pg_temp.an(), 10, pg_temp.d(-30), pg_temp.d(5));
select pg_temp.fails(format('update public.groups set annee = %L where id = %L', (pg_temp.first() + 2) || '-' || (pg_temp.first() + 3),
  pg_temp.id(305)), '23514', 'course.dates_outside_year');
select pg_temp.act(1);
update public.groups set date_fin = pg_temp.d(4) where id = pg_temp.id(305);
select pg_temp.owner();
select pg_temp.ok(pg_temp.logs('group_dates_changed', pg_temp.id(305)) = 1
  and (select after->'after'->>'date_fin' = pg_temp.d(4)::text and after->'before'->>'date_fin' = pg_temp.d(5)::text
    and actor_id = pg_temp.id(1) from public.activity_log where changed_columns = array['group_dates_changed']
    and after->>'group_id' = pg_temp.id(305)::text), 'Q6: a date edit is logged with its before and after');
delete from public.groups where id = pg_temp.id(305);
-- Q4 = A: One-to-One has capacity 1.
select pg_temp.fails(format($$insert into public.groups(name, session_type, niveau, annee, capacite_max, date_debut, date_fin)
  values ('x', 'One-to-One', 'A1', %L, %s, %L, %L)$$, pg_temp.an(), c, pg_temp.d(-1), pg_temp.d(1)), '23514', 'course.one_to_one_capacity')
from unnest(array['2', 'null']) c;
insert into public.groups(id, name, session_type, niveau, annee, capacite_max, date_debut, date_fin) values
  (pg_temp.id(309), 'Cours individuel · A1', 'One-to-One', 'A1', pg_temp.an(), 1, pg_temp.d(-10), pg_temp.d(10));
select pg_temp.fails(format('update public.groups set capacite_max = 2 where id = %L', pg_temp.id(309)), '23514', 'course.one_to_one_capacity');
select pg_temp.fails(format($$update public.groups set session_type = 'One-to-One', niveau = 'A1' where id = %L$$, pg_temp.id(303)),
  '23514', 'course.dates_required');

-- ===========================================================================
-- 3. The reception group command with dates (save_receptionist_group)
-- ===========================================================================
select pg_temp.put('rg', jsonb_build_object('name', 'CDC reception MAN', 'session_type', 'Mise à niveau', 'niveau', 'A1',
  'annee', pg_temp.an(), 'capacite_max', 8, 'date_debut', pg_temp.d(2), 'date_fin', pg_temp.d(3)));
select pg_temp.act(3);
select pg_temp.ok((select id from public.save_receptionist_group(pg_temp.id(310), null, pg_temp.get('rg'))) = pg_temp.id(310), 'reception creates with dates');
select pg_temp.ok((select id from public.save_receptionist_group(pg_temp.id(310), null, pg_temp.get('rg'))) = pg_temp.id(310), 'replay: same identity');
select pg_temp.fails(format('select public.save_receptionist_group(%L, null, %L)', pg_temp.id(310),
  pg_temp.get('rg') || jsonb_build_object('date_fin', pg_temp.d(4))), '23505');
select pg_temp.fails(format('select public.save_receptionist_group(%L, null, %L)', pg_temp.id(311),
  pg_temp.get('rg') - 'date_debut' - 'date_fin'), '23514', 'course.dates_required');
select public.save_receptionist_group(pg_temp.id(310), pg_temp.gu(pg_temp.id(310)), jsonb_build_object('date_fin', pg_temp.d(4)));
select pg_temp.fails(format($$select public.save_receptionist_group(%L, %L, '{"date_fin": ""}')$$, pg_temp.id(310), pg_temp.gu(pg_temp.id(310))),
  '23514', 'course.dates_required');
select pg_temp.owner();
select pg_temp.ok((select date_debut = pg_temp.d(2) and date_fin = pg_temp.d(4) from public.groups where id = pg_temp.id(310)), 'reception edits the dates');
delete from public.groups where id = pg_temp.id(310);

-- ===========================================================================
-- 4. « Clôturer le cours » (D3, B1, S1, S6, N-1, N-2)
-- ===========================================================================
insert into public.students(id, full_name, status, session_type, niveau_cefr, deleted_at) values
  (pg_temp.id(211), 'CDC becomes alumni', 'Enrolled', 'Mise à niveau', 'A1', null),
  (pg_temp.id(212), 'CDC keeps Yearly', 'Enrolled', 'Mise à niveau', 'A1', null),
  (pg_temp.id(213), 'CDC attached', 'Enrolled', 'Mise à niveau', 'A1', null),
  (pg_temp.id(215), 'CDC level B2', 'Enrolled', 'Mise à niveau', 'B2', null),
  (pg_temp.id(216), 'CDC Adults waiting', 'Enrolled', 'Adults', null, null),
  (pg_temp.id(217), 'CDC left waiting', 'Enrolled', 'Mise à niveau', 'A1', null),
  (pg_temp.id(218), 'CDC archived', 'Enrolled', 'Mise à niveau', 'A1', now()),
  (pg_temp.id(219), 'CDC in an unfinished course', 'Enrolled', 'Mise à niveau', 'A1', null);
insert into public.enrollments(id, student_id, status, session_type, school_year, level) values
  (pg_temp.id(411), pg_temp.id(211), 'Confirmed', 'Mise à niveau', pg_temp.yr(), 'A1'),
  (pg_temp.id(412), pg_temp.id(212), 'Confirmed', 'Mise à niveau', pg_temp.yr(), 'A1'),
  (pg_temp.id(413), pg_temp.id(212), 'Confirmed', 'Yearly', pg_temp.yr(), 'Child 1'),
  (pg_temp.id(414), pg_temp.id(213), 'Confirmed', 'Mise à niveau', pg_temp.yr(), 'A1'),
  (pg_temp.id(415), pg_temp.id(215), 'Confirmed', 'Mise à niveau', pg_temp.yr(), 'B2'),
  (pg_temp.id(416), pg_temp.id(216), 'Confirmed', 'Adults', pg_temp.yr(), null),
  (pg_temp.id(417), pg_temp.id(217), 'Confirmed', 'Mise à niveau', pg_temp.yr(), 'A1'),
  (pg_temp.id(418), pg_temp.id(218), 'Confirmed', 'Mise à niveau', pg_temp.yr(), 'A1'),
  (pg_temp.id(419), pg_temp.id(219), 'Confirmed', 'Mise à niveau', pg_temp.yr(), 'A1');
select pg_temp.place(pg_temp.id(211), pg_temp.id(301), pg_temp.id(411));
select pg_temp.place(pg_temp.id(212), pg_temp.id(301), pg_temp.id(412));
select pg_temp.place(pg_temp.id(212), pg_temp.id(303), pg_temp.id(413));
-- An unfinished course and an online course.
insert into public.groups(id, name, session_type, niveau, annee, capacite_max, date_debut, date_fin) values
  (pg_temp.id(306), 'CDC MAN A1 ends tomorrow', 'Mise à niveau', 'A1', pg_temp.an(), 10, pg_temp.d(-5), pg_temp.d(1)),
  (pg_temp.id(307), 'CDC online', 'Online', 'A1', pg_temp.an(), null, null, null);
select pg_temp.place(pg_temp.id(219), pg_temp.id(306), pg_temp.id(419));

-- A CRM-converted paid enrollment without a group (ended by « Terminer sans groupe »).
create function pg_temp.lead() returns uuid language plpgsql as $$ declare l uuid; begin
  perform pg_temp.act(3);
  l := (public.crm_create_manual_lead(gen_random_uuid(), jsonb_build_object('display_name', 'CDC parent',
    'learner_name', 'CDC CRM child', 'phone', '0671999001', 'source_label', 'Phone'))->'lead'->>'id')::uuid;
  perform public.crm_qualify_lead(gen_random_uuid(), jsonb_build_object('lead_id', l, 'expected_version', pg_temp.ver(l),
    'conversation_channel', 'phone', 'note', 'x', 'qualification_step', 'enrollment',
    'next_task', jsonb_build_object('task_type', 'enrollment_followup', 'due_at', now() + interval '1 day')));
  perform public.crm_enroll_and_collect(gen_random_uuid(), jsonb_build_object(
    'enrollment', jsonb_build_object('lead_id', l, 'expected_version', pg_temp.ver(l), 'student_choice', 'new',
      'learner_name', 'CDC CRM child', 'birth_date', '2012-03-04', 'session_type', 'Mise à niveau', 'school_year', pg_temp.yr(),
      'level', 'A1', 'candidate_review', pg_temp.tok(l, 'CDC CRM child', '2012-03-04'), 'confirm_new', true),
    'payment', jsonb_build_object('gross_amount', 1500, 'payment_amount', 1500, 'payment_method', 'Espèces',
      'payment_date', public.business_date())));
  perform pg_temp.owner();
  return l;
end $$;
select pg_temp.put('lead', to_jsonb(pg_temp.lead()));
select pg_temp.put('crm_e', to_jsonb((select enrollment_id from public.crm_leads where id = pg_temp.uid('lead'))));
select pg_temp.put('crm_s', to_jsonb((select student_id from public.crm_leads where id = pg_temp.uid('lead'))));
select pg_temp.put('lead_before', (select to_jsonb(l) - 'updated_at' from public.crm_leads l where id = pg_temp.uid('lead')));
select pg_temp.ok(pg_temp.est(pg_temp.uid('crm_e')) = 'Confirmed'
  and (select group_id is null from public.enrollments where id = pg_temp.uid('crm_e')), 'fixture: the CRM enrollment is paid, without group');

-- Charges (S6, N-2).
-- 211: an open balance on its enrollment's own charge, created before the end.
select pg_temp.put('c_own', pg_temp.pay(3, jsonb_build_object('student_id', pg_temp.id(211), 'enrollment_id', pg_temp.id(411),
  'session_type', 'Mise à niveau', 'school_year', pg_temp.yr(), 'level', 'A1', 'gross_amount', 3000, 'payment_amount', 1000)));
-- 211: a partly paid charge of the same programme and year, not linked (the shape S6 links).
select pg_temp.put('c_link', pg_temp.pay(3, jsonb_build_object('student_id', pg_temp.id(211), 'enrollment_id', pg_temp.id(411),
  'session_type', 'Mise à niveau', 'school_year', pg_temp.yr(), 'level', 'A1', 'gross_amount', 500, 'payment_amount', 100)));
-- 211: a partly paid charge without a year from an earlier school year (pre-057): never linked.
select pg_temp.put('c_old', pg_temp.pay(3, jsonb_build_object('student_id', pg_temp.id(211), 'enrollment_id', pg_temp.id(411),
  'session_type', 'Mise à niveau', 'school_year', pg_temp.yr(), 'level', 'A1', 'gross_amount', 700, 'payment_amount', 100)));
-- 212: an « engagement » (nothing paid), never linked; and a payment after the end on its member enrollment.
select pg_temp.put('c_eng', pg_temp.pay(3, jsonb_build_object('student_id', pg_temp.id(212), 'session_type', 'Mise à niveau',
  'school_year', pg_temp.yr(), 'level', 'A1', 'gross_amount', 800, 'payment_amount', 0)));
select pg_temp.put('c_late', pg_temp.pay(3, jsonb_build_object('student_id', pg_temp.id(212), 'enrollment_id', pg_temp.id(412),
  'session_type', 'Mise à niveau', 'school_year', pg_temp.yr(), 'level', 'A1', 'gross_amount', 1000, 'payment_amount', 200)));
-- 213 (attached): a partly paid charge without a year, created during the current school year: linked.
select pg_temp.put('c_cur', pg_temp.pay(3, jsonb_build_object('student_id', pg_temp.id(213), 'enrollment_id', pg_temp.id(414),
  'session_type', 'Mise à niveau', 'school_year', pg_temp.yr(), 'level', 'A1', 'gross_amount', 600, 'payment_amount', 100)));
create function pg_temp.cid(k text) returns uuid language sql as $$ select (pg_temp.get(k)->>'charge_id')::uuid $$;
update public.charges set created_at = pg_temp.d(-20)::timestamptz + interval '10 hours'
where id in (pg_temp.cid('c_own'), pg_temp.cid('c_link'), pg_temp.cid('c_cur'));
update public.charges set enrollment_id = null where id in (pg_temp.cid('c_link'), pg_temp.cid('c_old'), pg_temp.cid('c_cur'));
update public.receipts set enrollment_id = null where charge_id in (pg_temp.cid('c_link'), pg_temp.cid('c_old'), pg_temp.cid('c_cur'));
update public.charges set school_year = null, created_at = make_date(pg_temp.first() - 1, 10, 1)::timestamptz where id = pg_temp.cid('c_old');
update public.charges set school_year = null where id = pg_temp.cid('c_cur');
select pg_temp.ok((select enrollment_id is null and paid_amount = 0 from public.charge_balances where id = pg_temp.cid('c_eng')),
  'fixture: the engagement is unlinked and unpaid');
-- The undated current-year charge is linked only when the course year is the current school year.
select pg_temp.put('cur_links', to_jsonb((pg_temp.yr() = public.centre_school_year())::integer));

-- The preview (director only).
select pg_temp.act(2);
select pg_temp.fails(format('select public.close_course_preview(%L)', pg_temp.id(301)), '42501');
select pg_temp.act(1);
select pg_temp.put('pv', public.close_course_preview(pg_temp.id(301)));
select pg_temp.owner();
select pg_temp.ok((pg_temp.get('pv')->>'live_count')::int = 2 and (pg_temp.get('pv')->>'stay_enrolled')::int = 1
  and (pg_temp.get('pv')->>'become_alumni')::int = 1 and (pg_temp.get('pv')->>'finished')::boolean
  and not (pg_temp.get('pv')->>'empty')::boolean and not (pg_temp.get('pv')->>'online')::boolean, 'preview: members ' || pg_temp.get('pv')::text);
select pg_temp.ok((pg_temp.get('pv')->>'open_balance_count')::int = 2 and (pg_temp.get('pv')->>'open_balance_total')::numeric = 2800,
  'preview: open balances on the members'' charges');
select pg_temp.ok(pg_temp.get('pv')->'charges_to_link' = '{"count": 1, "total": 400}'::jsonb
  and pg_temp.get('pv')->'engagements' = '{"count": 1, "total": 800}'::jsonb
  and pg_temp.get('pv')->'next_session_deposits' = '{"count": 1, "total": 200}'::jsonb, 'preview: S6, N-2 and the late deposit');
select pg_temp.ok((select array_agg((x->>'enrollment_id')::uuid order by x->>'enrollment_id') from jsonb_array_elements(pg_temp.get('pv')->'unplaced') x)
  = (select array_agg(i order by i::text) from unnest(array[pg_temp.id(414), pg_temp.id(417), pg_temp.uid('crm_e')]) i),
  'B1: the unplaced list is the matching paid rows (not B2, Adults or the archived file)');
select pg_temp.ok((select (x->>'charges_to_link')::int = (pg_temp.get('cur_links') #>> '{}')::int
  and (x->>'paid_total')::numeric = 100 * (pg_temp.get('cur_links') #>> '{}')::int and (x->>'created_after_end')::boolean
  and not (x->>'has_other_live')::boolean from jsonb_array_elements(pg_temp.get('pv')->'unplaced') x
  where (x->>'enrollment_id')::uuid = pg_temp.id(414)), 'B1 row: its own charges to link and amount paid');

select pg_temp.ok((select (x->>'paid_total')::numeric = 1500 and (x->>'next_session_deposit')::boolean
  from jsonb_array_elements(pg_temp.get('pv')->'unplaced') x where (x->>'enrollment_id')::uuid = pg_temp.uid('crm_e')),
  'reviewer point: a row paid after the course''s end is flagged as a possible next session');

-- Refusals.
select pg_temp.act(2);
select pg_temp.fails(format('select public.close_course(%L, 2)', pg_temp.id(301)), '42501');
select pg_temp.act(3);
select pg_temp.fails(format('select public.close_course(%L, 2)', pg_temp.id(301)), '42501');
select pg_temp.fails('select * from public.list_courses_to_close()', '42501');
select pg_temp.act(1);
select pg_temp.fails(format('select public.close_course(%L, 1)', pg_temp.id(301)), 'PT409', 'course.count_changed');
select pg_temp.fails(format('select public.close_course(%L, 2, %L, %L, %L)', pg_temp.id(301), 'Cours terminé',
  array[pg_temp.id(414)], array[pg_temp.id(414)]), 'PT409', 'course.unplaced_changed');
select pg_temp.fails(format('select public.close_course(%L, 2, %L, %L)', pg_temp.id(301), 'Cours terminé', array[x]), 'PT409', 'course.unplaced_changed')
from unnest(array[pg_temp.id(415), pg_temp.id(416), pg_temp.id(418)]) x;
select pg_temp.fails(format('select public.close_course(%L, 2, %L)', pg_temp.id(301), '  '), '22023', 'egc.reason_required');
select pg_temp.fails(format('select public.close_course(%L, 1)', pg_temp.id(306)), '23514', 'course.not_finished');
select pg_temp.fails(format('select public.close_course(%L, 0)', pg_temp.id(307)), '23514', 'course.online');
select pg_temp.owner();
select pg_temp.ok(pg_temp.closed(pg_temp.id(301)) is null and not exists (select 1 from maintenance.course_close_journal
  where group_id = pg_temp.id(301)), 'a refused close changes nothing, the mark included');

-- Before-images: payments, attendance, CRM.
select pg_temp.put('receipts_md5', to_jsonb((select md5(coalesce(string_agg(to_jsonb(r)::text, ',' order by r.id), '')) from public.receipts r)));
select pg_temp.put('charges_md5', to_jsonb((select md5(coalesce(string_agg((to_jsonb(c) - 'enrollment_id' - 'updated_at')::text, ',' order by c.id), ''))
  from public.charges c)));
select pg_temp.put('attendance_n', to_jsonb((select count(*) from public.attendance)));

-- The close: one unplaced row attached (« A suivi ce cours »), one ended without group,
-- one left waiting.
select pg_temp.act(1);
select pg_temp.put('cl', public.close_course(pg_temp.id(301), 2, 'Cours terminé', array[pg_temp.id(414)], array[pg_temp.uid('crm_e')]));
select pg_temp.owner();
select pg_temp.ok(not (pg_temp.get('cl')->>'replayed')::boolean and (pg_temp.get('cl')->>'ended')::int = 2
  and (pg_temp.get('cl')->>'attached')::int = 1 and (pg_temp.get('cl')->>'ended_unplaced')::int = 1
  and (pg_temp.get('cl')->>'total_ended')::int = 4 and (pg_temp.get('cl')->>'alumni')::int = 3
  and (pg_temp.get('cl')->>'still_enrolled')::int = 1
  and (pg_temp.get('cl')->>'charges_linked')::int = 1 + (pg_temp.get('cur_links') #>> '{}')::int
  -- The late deposit on 412 and the CRM row paid after the end (both ended by this close).
  and (pg_temp.get('cl')->>'engagements')::int = 1 and (pg_temp.get('cl')->>'next_session_deposits')::int = 2,
  'close result ' || pg_temp.get('cl')::text);
select pg_temp.ok((select closed_at is not null and closed_by = pg_temp.id(1) from public.groups where id = pg_temp.id(301)), 'the course is marked');
select pg_temp.ok((select bool_and(status = 'Ended' and group_id is null and ended_group_id = pg_temp.id(301) and end_reason = 'Cours terminé')
  from public.enrollments where id in (pg_temp.id(411), pg_temp.id(412), pg_temp.id(414))), 'members and the attached row end in the course');
select pg_temp.ok((select status = 'Ended' and ended_group_id is null from public.enrollments where id = pg_temp.uid('crm_e')),
  '« Terminer sans groupe » ends without a group');
select pg_temp.ok(pg_temp.est(pg_temp.id(417)) = 'Confirmed' and pg_temp.est(pg_temp.id(415)) = 'Confirmed'
  and pg_temp.est(pg_temp.id(416)) = 'Confirmed' and pg_temp.est(pg_temp.id(418)) = 'Confirmed', '« Laisser en attente » and the others stay');
select pg_temp.ok(pg_temp.sst(pg_temp.id(211)) = 'Alumni' and pg_temp.sst(pg_temp.id(213)) = 'Alumni'
  and pg_temp.sst(pg_temp.uid('crm_s')) = 'Alumni' and pg_temp.sst(pg_temp.id(212)) = 'Enrolled'
  and (select groupe_id from public.students where id = pg_temp.id(212)) = pg_temp.id(303)
  and (select groupe_id is null from public.students where id = pg_temp.id(211)), 'files resynced; the main group recomputed');
select pg_temp.ok((select jsonb_object_agg(action, n) from (select action, count(*) n from maintenance.course_close_journal
    where run_id = (pg_temp.get('cl')->>'run_id')::uuid group by action) x)
  = jsonb_build_object('run', 1, 'ended', 2, 'attached', 1, 'ended_unplaced', 1, 'resynced', 4)
    || case when (pg_temp.get('cl')->>'charges_linked')::int > 0 then jsonb_build_object('charge_linked', (pg_temp.get('cl')->>'charges_linked')::int)
       else '{}'::jsonb end, 'journal rows');
select pg_temp.ok((select bool_and(after is not null) from maintenance.course_close_journal where run_id = (pg_temp.get('cl')->>'run_id')::uuid
  and entity in ('runs', 'groups', 'enrollments', 'students')), 'journal after-images');
select pg_temp.ok(pg_temp.logs('close_course', pg_temp.id(301)) = 1, 'activity log');
select pg_temp.ok(pg_temp.logs('capacity_override', pg_temp.id(301)) = 0, 'no capacity override on attach');
select pg_temp.ok((select enrollment_id = pg_temp.id(411) from public.charges where id = pg_temp.cid('c_link'))
  and (select enrollment_id is null from public.charges where id = pg_temp.cid('c_old'))
  and (select enrollment_id is null from public.charges where id = pg_temp.cid('c_eng'))
  and (select (enrollment_id is not distinct from pg_temp.id(414)) = ((pg_temp.get('cur_links') #>> '{}')::int = 1)
    from public.charges where id = pg_temp.cid('c_cur')), 'S6/N-2: partly paid linked, engagement and pre-057 charge left');
select pg_temp.ok((select md5(coalesce(string_agg(to_jsonb(r)::text, ',' order by r.id), '')) from public.receipts r) = pg_temp.get('receipts_md5') #>> '{}'
  and (select md5(coalesce(string_agg((to_jsonb(c) - 'enrollment_id' - 'updated_at')::text, ',' order by c.id), '')) from public.charges c)
    = pg_temp.get('charges_md5') #>> '{}'
  and (select count(*) from public.attendance) = (pg_temp.get('attendance_n') #>> '{}')::bigint, 'payments and attendance untouched');
select pg_temp.ok((select to_jsonb(l) - 'updated_at' from public.crm_leads l where id = pg_temp.uid('lead')) = pg_temp.get('lead_before')
  and not (select conversion_review_required from public.crm_leads where id = pg_temp.uid('lead')), 'CRM conversion kept, no review flag');
-- Replay: a second close returns the run and writes nothing.
select pg_temp.put('journal_n', to_jsonb((select count(*) from maintenance.course_close_journal)));
select pg_temp.act(1);
select pg_temp.put('cl2', public.close_course(pg_temp.id(301), 2, 'Cours terminé', array[pg_temp.id(414)], array[pg_temp.uid('crm_e')]));
select pg_temp.owner();
select pg_temp.ok((pg_temp.get('cl2')->>'replayed')::boolean and pg_temp.get('cl2')->>'run_id' = pg_temp.get('cl')->>'run_id'
  and (select count(*) from maintenance.course_close_journal) = (pg_temp.get('journal_n') #>> '{}')::bigint
  and pg_temp.logs('close_course', pg_temp.id(301)) = 1, 'replay after success');
-- An empty group closes at any time, without dates, and replays.
insert into public.groups(id, name, session_type, niveau, annee) values (pg_temp.id(308), 'CDC empty Yearly', 'Yearly', 'Child 2', pg_temp.an());
select pg_temp.act(1);
select pg_temp.put('cl_empty', public.close_course(pg_temp.id(308), 0));
select pg_temp.put('cl_empty2', public.close_course(pg_temp.id(308), 0));
select pg_temp.owner();
select pg_temp.ok(not (pg_temp.get('cl_empty')->>'replayed')::boolean and (pg_temp.get('cl_empty')->>'total_ended')::int = 0
  and (pg_temp.get('cl_empty2')->>'replayed')::boolean and pg_temp.closed(pg_temp.id(308)) is not null, 'OA2: an empty group');

-- After the close (S6, N-2): payments.
-- A payment on the ended enrollment's charges lands on it: nothing revived, no new enrollment.
select pg_temp.pay(3, jsonb_build_object('student_id', pg_temp.id(211), 'charge_id', pg_temp.cid('c_link'), 'payment_amount', 100));
select pg_temp.pay(3, jsonb_build_object('student_id', pg_temp.id(211), 'charge_id', pg_temp.cid('c_own'), 'payment_amount', 100));
select pg_temp.ok(pg_temp.est(pg_temp.id(411)) = 'Ended' and pg_temp.sst(pg_temp.id(211)) = 'Alumni'
  and not exists (select 1 from public.enrollments where student_id = pg_temp.id(211) and status in ('Submitted','Under Review','Confirmed','Validated','Trial')),
  'S6: a payment on an old balance never re-creates an enrollment');
-- A payment on the engagement creates a new paid enrollment (a next session).
select pg_temp.pay(3, jsonb_build_object('student_id', pg_temp.id(212), 'charge_id', pg_temp.cid('c_eng'), 'payment_amount', 300));
select pg_temp.ok((select count(*) from public.enrollments where student_id = pg_temp.id(212) and session_type = 'Mise à niveau'
  and status = 'Confirmed' and group_id is null) = 1, 'N-2: a payment on an engagement starts a new enrollment');
-- A payment on a new charge after the close is a genuine re-enrollment.
select pg_temp.pay(3, jsonb_build_object('student_id', pg_temp.id(213), 'session_type', 'Mise à niveau', 'school_year', pg_temp.yr(),
  'gross_amount', 2000, 'payment_amount', 500));
select pg_temp.ok((select count(*) from public.enrollments where student_id = pg_temp.id(213) and status = 'Confirmed') = 1
  and pg_temp.sst(pg_temp.id(213)) = 'Enrolled', 'a new charge after the close re-enrolls');
-- Attendance before the end date stays insertable for an ended learner.
select pg_temp.act(1);
select public.save_attendance(pg_temp.id(211), pg_temp.id(301), pg_temp.d(-2), 'Présent');
select pg_temp.owner();
select pg_temp.ok(exists (select 1 from public.attendance where student_id = pg_temp.id(211) and group_id = pg_temp.id(301)
  and session_date = pg_temp.d(-2)), 'attendance before the end date');

-- ===========================================================================
-- 5. A closed course: every placement path refused; the exemptions; the mark
-- ===========================================================================
select pg_temp.act(1);
select pg_temp.fails(format('select public.place_learner_in_group(%L, %L, %L, %L, null, %L, null, null)', pg_temp.id(217), pg_temp.id(301),
  pg_temp.su(pg_temp.id(217)), pg_temp.id(417), pg_temp.eu(pg_temp.id(417))), '23514', 'course.closed');
select pg_temp.act(3);
select pg_temp.fails(format('select public.assign_receptionist_student_group(%L, %L, %L, %L, %L)', pg_temp.id(217), pg_temp.id(417),
  pg_temp.id(301), pg_temp.su(pg_temp.id(217)), pg_temp.eu(pg_temp.id(417))), '23514', 'course.closed');
select pg_temp.act(2);
select pg_temp.fails(format($$insert into public.enrollments(student_id, group_id, status, session_type, school_year, level)
  values (%L, %L, 'Validated', 'Mise à niveau', %L, 'A1')$$, pg_temp.id(217), pg_temp.id(301), pg_temp.yr()), '23514', 'course.closed');
select pg_temp.fails(format('update public.enrollments set group_id = %L where id = %L', pg_temp.id(301), pg_temp.id(417)), '23514', 'course.closed');
select pg_temp.owner();
select pg_temp.fails(format($$insert into public.enrollments(student_id, group_id, status, session_type, school_year, level)
  values (%L, %L, 'Validated', 'Mise à niveau', %L, 'A1')$$, pg_temp.id(217), pg_temp.id(301), pg_temp.yr()), '23514', 'course.closed');
-- Exemptions: the Batch D two-flag restore, and the course command.
select pg_temp.ok(pg_temp.try_then_undo(format($$select set_config('eh.membership_sync', 'on', true), set_config('eh.enrollment_command', 'on', true);
  update public.enrollments set status = 'Validated', group_id = %L, ended_at = null, ended_by = null, end_reason = null, ended_group_id = null
  where id = %L$$, pg_temp.id(301), pg_temp.id(411))) = 'ok', 'the two-flag restore enters a closed course');
select pg_temp.ok(pg_temp.try_then_undo(format($$select set_config('eh.course_command', 'on', true);
  insert into public.enrollments(student_id, group_id, status, session_type, school_year, level)
  values (%L, %L, 'Validated', 'Mise à niveau', %L, 'A1')$$, pg_temp.id(216), pg_temp.id(301), pg_temp.yr())) = 'ok',
  'the course command enters its marked course');
-- An undated short-programme group (legacy) refuses placement.
alter table public.groups disable trigger groups_course_guard;
insert into public.groups(id, name, session_type, niveau, annee) values (pg_temp.id(312), 'CDC legacy undated Adults', 'Adults', 'Beginning 1', pg_temp.an());
alter table public.groups enable trigger groups_course_guard;
select pg_temp.fails(format($$insert into public.enrollments(student_id, group_id, status, session_type, school_year, level)
  values (%L, %L, 'Validated', 'Adults', %L, 'Beginning 1')$$, pg_temp.id(216), pg_temp.id(312), pg_temp.yr()), '23514', 'course.dates_required');
do $$ begin
  insert into public.enrollments(student_id, group_id, status, session_type, school_year, level)
  values (pg_temp.id(216), pg_temp.id(312), 'Validated', 'Adults', pg_temp.yr(), 'Beginning 1');
  raise exception 'FAIL: an undated short-programme group accepted a learner';
exception when check_violation then
  perform pg_temp.ok(sqlerrm = 'Renseignez les dates du cours avant d’y affecter un apprenant.', 'placement dates message');
end $$;
delete from public.groups where id = pg_temp.id(312);
-- A closed online course (S3).
insert into public.online_courses(group_id, teacher_id, audience, term_start, term_end, status)
values (pg_temp.id(307), pg_temp.id(90), 'adult', pg_temp.d(-60), pg_temp.d(-1), 'closed');
select pg_temp.fails(format($$insert into public.enrollments(student_id, group_id, status, session_type, school_year, level)
  values (%L, %L, 'Validated', 'Online', %L, 'A1')$$, pg_temp.id(216), pg_temp.id(307), pg_temp.yr()), '23514', 'course.closed');
-- The closed mark: never a direct write, for any role.
select pg_temp.fails(format('update public.groups set closed_at = null where id = %L', pg_temp.id(301)), '42501', 'course.mark_protected');
select pg_temp.fails(format($$insert into public.groups(name, session_type, niveau, annee, closed_at) values ('x', 'Yearly', 'Child 1', %L, now())$$,
  pg_temp.an()), '42501', 'course.mark_protected');
select pg_temp.act(1);
select pg_temp.fails(format('update public.groups set closed_at = now() where id = %L', pg_temp.id(303)), '42501', 'course.mark_protected');
select pg_temp.act(2);
select pg_temp.fails(format('update public.groups set closed_at = now() where id = %L', pg_temp.id(303)), '42501', 'course.mark_protected');
select pg_temp.owner();
set local role service_role;
select pg_temp.fails(format('update public.groups set closed_at = null, closed_by = null where id = %L', pg_temp.id(301)), '42501', 'course.mark_protected');
reset role;
-- A closed course keeps its dates, year, programme, level and capacity; name, teacher, room and schedule stay editable.
select pg_temp.fails(format('update public.groups set %s where id = %L', c, pg_temp.id(301)), '23514', 'course.closed')
from unnest(array[format('date_fin = %L', pg_temp.d(-2)), format('date_debut = %L', pg_temp.d(-29)), 'capacite_max = 5', $$niveau = 'A2'$$,
  format('annee = %L', (pg_temp.first() + 1) || '-' || (pg_temp.first() + 2))]) c;
select pg_temp.act(1);
update public.groups set name = 'CDC MAN A1 (closed)', teacher_id = pg_temp.id(90), salle = 'Salle 9', horaire = '10h' where id = pg_temp.id(301);
select pg_temp.owner();
select pg_temp.ok((select name = 'CDC MAN A1 (closed)' and salle = 'Salle 9' from public.groups where id = pg_temp.id(301)), 'free fields of a closed course');
-- A closed course with ended enrollments cannot be deleted.
select pg_temp.fails(format('delete from public.groups where id = %L', pg_temp.id(301)), '23503');

-- ===========================================================================
-- 6. « Rouvrir le cours » (Q8 = A, S2)
-- ===========================================================================
insert into public.groups(id, name, session_type, niveau, annee, capacite_max, date_debut, date_fin) values
  (pg_temp.id(320), 'CDC MAN B1 full', 'Mise à niveau', 'B1', pg_temp.an(), 2, pg_temp.d(-20), pg_temp.d(-1));
insert into public.students(id, full_name, status, session_type) select pg_temp.id(220 + i), 'CDC reopen ' || i, 'Enrolled', 'Mise à niveau'
from generate_series(1, 6) i;
insert into public.enrollments(id, student_id, status, session_type, school_year, level)
select pg_temp.id(420 + i), pg_temp.id(220 + i), 'Confirmed', 'Mise à niveau', pg_temp.yr(), 'B1' from generate_series(1, 6) i;
select pg_temp.place(pg_temp.id(221), pg_temp.id(320), pg_temp.id(421));
select pg_temp.place(pg_temp.id(222), pg_temp.id(320), pg_temp.id(422));
select pg_temp.place(pg_temp.id(223), pg_temp.id(320), pg_temp.id(423), 'Dépassement de test');
select pg_temp.place(pg_temp.id(224), pg_temp.id(320), pg_temp.id(424), 'Dépassement de test');
select pg_temp.act(1);
select pg_temp.put('cr', public.close_course(pg_temp.id(320), 4, 'Cours terminé', array[pg_temp.id(425)], array[pg_temp.id(426)]));
select pg_temp.owner();
select pg_temp.ok((pg_temp.get('cr')->>'total_ended')::int = 6 and (pg_temp.get('cr')->>'alumni')::int = 6, 'reopen fixture: closed ' || pg_temp.get('cr')::text);
-- One row reopened by hand after the close: the reopen skips it as changed.
select pg_temp.act(1);
select public.reopen_enrollment(pg_temp.id(422), pg_temp.eu(pg_temp.id(422)));
select pg_temp.owner();
select pg_temp.put('override_before', to_jsonb(pg_temp.logs('capacity_override', pg_temp.id(320))));
-- Refusals: admin, a stale mark, a course never closed.
select pg_temp.act(2);
select pg_temp.fails(format('select public.reopen_course(%L, %L)', pg_temp.id(320), pg_temp.closed(pg_temp.id(320))), '42501');
select pg_temp.act(1);
select pg_temp.fails(format('select public.reopen_course(%L, %L)', pg_temp.id(320), pg_temp.closed(pg_temp.id(320)) - interval '1 second'),
  'PT409', 'egc.stale');
select pg_temp.fails(format('select public.reopen_course(%L, %L)', pg_temp.id(306), now()), 'PT409', 'egc.stale');
select pg_temp.put('ro', public.reopen_course(pg_temp.id(320), pg_temp.closed(pg_temp.id(320))));
select pg_temp.owner();
select pg_temp.ok((pg_temp.get('ro')->>'restored')::int = 5 and pg_temp.get('ro')->'skipped'
  = jsonb_build_array(jsonb_build_object('enrollment_id', pg_temp.id(422), 'reason', 'changed')), 'reopen result ' || pg_temp.get('ro')::text);
select pg_temp.ok(pg_temp.closed(pg_temp.id(320)) is null, 'the mark is cleared');
-- A placed paid row is Validated (EAP), as before the close.
select pg_temp.ok((select bool_and(status = 'Validated' and group_id = pg_temp.id(320) and ended_at is null and ended_group_id is null)
  from public.enrollments where id in (pg_temp.id(421), pg_temp.id(423), pg_temp.id(424))), 'members return to the course');
select pg_temp.ok((select bool_and(status = 'Confirmed' and group_id is null) from public.enrollments
  where id in (pg_temp.id(422), pg_temp.id(425), pg_temp.id(426))), 'attached and unplaced rows return to paid without group');
select pg_temp.ok((select bool_and(status = 'Enrolled') from public.students where id in (select pg_temp.id(220 + i) from generate_series(1, 6) i))
  and (select groupe_id from public.students where id = pg_temp.id(221)) = pg_temp.id(320), 'files resynced');
select pg_temp.ok(pg_temp.logs('capacity_override', pg_temp.id(320)) = (pg_temp.get('override_before') #>> '{}')::bigint + 1,
  'the third returning member is logged as a capacity override');
select pg_temp.ok((select jsonb_object_agg(action, n) from (select action, count(*) n from maintenance.course_close_journal
    where run_id = (pg_temp.get('ro')->>'run_id')::uuid group by action) x)
  = '{"reopened": 1, "restored": 5, "skipped": 1}'::jsonb, 'reopen journal');
select pg_temp.ok(pg_temp.logs('reopen_course', pg_temp.id(320)) = 1, 'reopen log');
select pg_temp.act(1);
select pg_temp.fails(format('select public.reopen_course(%L, %L)', pg_temp.id(320), now()), 'PT409', 'egc.stale');
select pg_temp.owner();

-- ===========================================================================
-- 7. « Cours terminés à clôturer » (D2)
-- ===========================================================================
insert into public.groups(id, name, session_type, niveau, annee, capacite_max, date_debut, date_fin) values
  (pg_temp.id(321), 'CDC MAN B2 empty', 'Mise à niveau', 'B2', pg_temp.an(), 10, pg_temp.d(-10), pg_temp.d(-2));
insert into public.groups(id, name, session_type, niveau, annee) values
  (pg_temp.id(332), 'CDC online past term', 'Online', 'A1', pg_temp.an()),
  (pg_temp.id(333), 'CDC online running', 'Online', 'A1', pg_temp.an());
insert into public.online_courses(group_id, teacher_id, audience, term_start, term_end, status) values
  (pg_temp.id(332), pg_temp.id(90), 'adult', pg_temp.d(-40), pg_temp.d(-1), 'draft'),
  (pg_temp.id(333), pg_temp.id(90), 'adult', pg_temp.d(-10), pg_temp.d(30), 'draft');
insert into public.students(id, full_name, status, session_type) values
  (pg_temp.id(232), 'CDC online one', 'Enrolled', 'Online'), (pg_temp.id(233), 'CDC online two', 'Enrolled', 'Online');
insert into public.enrollments(id, student_id, group_id, status, session_type, school_year, level) values
  (pg_temp.id(432), pg_temp.id(232), pg_temp.id(332), 'Validated', 'Online', pg_temp.yr(), 'A1'),
  (pg_temp.id(433), pg_temp.id(233), pg_temp.id(333), 'Validated', 'Online', pg_temp.yr(), 'A1');
select pg_temp.act(1);
create temp table listed as select * from public.list_courses_to_close() where group_id::text like 'cdc00000-%';
select pg_temp.owner();
select pg_temp.ok((select array_agg(group_id order by group_id) from listed) = array[pg_temp.id(320), pg_temp.id(321), pg_temp.id(332)],
  'the finished courses: ' || (select string_agg(name, ', ') from listed));
-- Unplaced: 422, 425, 426, and 213's new paid row without a level (it matches every level).
select pg_temp.ok((select kind = 'in_person' and live_count = 3 and unplaced_count = 4 and not empty and date_fin = pg_temp.d(-1)
  from listed where group_id = pg_temp.id(320)), 'a finished course with learners');
select pg_temp.ok((select empty and live_count = 0 and unplaced_count = 2 from listed where group_id = pg_temp.id(321)),
  'an empty finished course is flagged');
select pg_temp.ok((select kind = 'online' and live_count = 1 and date_fin = pg_temp.d(-1) from listed where group_id = pg_temp.id(332)),
  'an online course past its term');
-- The card counts the courses with learners and the online ones (coursesToCloseCount).
select pg_temp.ok((select count(*) from listed where kind = 'online' or live_count > 0) = 2, 'the card count');

-- ===========================================================================
-- 8. The read policies (D6, OA3)
-- ===========================================================================
insert into public.family_links(id, student_id, relation, profile_id, invite_email, status, activated_at) values
  (gen_random_uuid(), pg_temp.id(211), 'parent', pg_temp.id(5), 'cdc-user-5@example.test', 'active', now()),
  (gen_random_uuid(), pg_temp.id(212), 'parent', pg_temp.id(5), 'cdc-user-5@example.test', 'active', now()),
  (gen_random_uuid(), pg_temp.id(213), 'self', pg_temp.id(6), 'cdc-user-6@example.test', 'active', now());
create function pg_temp.seen(i integer) returns uuid[] language plpgsql as $$ declare r uuid[]; begin
  perform pg_temp.act(i);
  r := array(select g.id from public.groups g where g.id::text like 'cdc00000-%' order by g.id);
  perform pg_temp.owner();
  return r;
end $$;
select pg_temp.ok(pg_temp.seen(5) = array[pg_temp.id(301), pg_temp.id(303)], 'parent: the groups of their children, past included');
select pg_temp.ok(pg_temp.seen(6) = array[pg_temp.id(301)], 'student: their own groups only');
select pg_temp.ok(pg_temp.seen(7) = '{}'::uuid[], 'pending: no group');
select pg_temp.ok(pg_temp.seen(i) @> array[pg_temp.id(301), pg_temp.id(303), pg_temp.id(306), pg_temp.id(320), pg_temp.id(332)], 'staff reads every group: ' || i)
from generate_series(1, 4) i;
do $$ declare n bigint; begin
  execute 'set local role anon';
  begin select count(*) into n from public.groups; exception when insufficient_privilege then n := 0; end;
  execute 'reset role';
  perform pg_temp.ok(n = 0, 'anon reads no group');
end $$;
-- The helper returns only the caller's groups (live, past and the file's group).
select pg_temp.act(5);
select pg_temp.ok((select array_agg(x order by x) from public.family_group_ids() x) = array[pg_temp.id(301), pg_temp.id(303)], 'family_group_ids');
select pg_temp.owner();

-- ===========================================================================
-- 9. « Clôturer l'année » (D5, OA4, OA6, Q16, Q18, N-3, carried-over waiting rows)
-- ===========================================================================
select pg_temp.ok(position('for no key update' in pg_get_functiondef('public.close_school_year(text,integer,text)'::regprocedure)) > 0,
  'N-3: the year close locks its candidate groups for no key update');
insert into public.groups(id, name, session_type, niveau, annee, capacite_max, date_debut, date_fin) values
  (pg_temp.id(330), 'CDC MAN A2 finished', 'Mise à niveau', 'A2', pg_temp.an(), 10, pg_temp.d(-20), pg_temp.d(-5)),
  (pg_temp.id(334), 'CDC Summer Camp running', 'Summer Camp', 'A2', pg_temp.an(), 10, pg_temp.d(-10), pg_temp.d(10)),
  (pg_temp.id(336), 'CDC MAN C1 finished', 'Mise à niveau', 'C1', pg_temp.an(), 10, pg_temp.d(-10), pg_temp.d(-2));
insert into public.groups(id, name, session_type, niveau, annee) values (pg_temp.id(331), 'CDC Yearly empty', 'Yearly', 'Child 3', pg_temp.an());
insert into public.students(id, full_name, status, session_type) values
  (pg_temp.id(235), 'CDC camp waiting', 'Enrolled', 'Summer Camp'), (pg_temp.id(236), 'CDC C1 waiting', 'Enrolled', 'Mise à niveau'),
  (pg_temp.id(237), 'CDC Yearly waiting', 'Enrolled', 'Yearly'), (pg_temp.id(238), 'CDC carried over', 'Enrolled', 'Mise à niveau');
insert into public.enrollments(id, student_id, status, session_type, school_year, level) values
  (pg_temp.id(435), pg_temp.id(235), 'Confirmed', 'Summer Camp', pg_temp.yr(), 'A2'),
  (pg_temp.id(436), pg_temp.id(236), 'Confirmed', 'Mise à niveau', pg_temp.yr(), 'C1'),
  (pg_temp.id(437), pg_temp.id(237), 'Confirmed', 'Yearly', pg_temp.yr(), 'Child 1');
create function pg_temp.outcome(e uuid) returns text language sql as $$
  select outcome from academic_security.year_close_rows(pg_temp.yr()) where enrollment_id = e $$;
select pg_temp.ok(pg_temp.outcome(pg_temp.id(x)) = o, 'year close outcome ' || x || ': ' || coalesce(pg_temp.outcome(pg_temp.id(x)), 'none') || ', expected ' || o)
from (values (419, 'kept_later'), (433, 'kept_later'), (435, 'kept_waiting'), (417, 'kept_waiting'), (416, 'kept_waiting'),
  (436, 'end'), (437, 'end'), (413, 'end'), (421, 'end'), (423, 'end'), (424, 'end'), (432, 'end'), (415, 'end'),
  (422, 'end'), (425, 'end'), (426, 'end')) x(x, o);
-- The preview (director only) and the carried-over rows of an earlier year.
select pg_temp.act(3);
select pg_temp.fails(format('select public.close_school_year_preview(%L)', pg_temp.yr()), '42501');
select pg_temp.act(1);
select pg_temp.put('yp0', public.close_school_year_preview(pg_temp.yr()));
select pg_temp.owner();
insert into public.enrollments(id, student_id, status, session_type, school_year, level) values
  (pg_temp.id(438), pg_temp.id(238), 'Confirmed', 'Mise à niveau', pg_temp.yr_prev(), null);
select pg_temp.act(1);
select pg_temp.put('yp', public.close_school_year_preview(pg_temp.yr()));
select pg_temp.owner();
select pg_temp.ok((pg_temp.get('yp')->'carried_over_waiting'->>'total')::int = (pg_temp.get('yp0')->'carried_over_waiting'->>'total')::int + 1
  and coalesce((pg_temp.get('yp')->'carried_over_waiting'->'by_programme'->>'Mise à niveau')::int, 0)
    = coalesce((pg_temp.get('yp0')->'carried_over_waiting'->'by_programme'->>'Mise à niveau')::int, 0) + 1,
  'reviewer point: a waiting row from an earlier year is flagged ' || (pg_temp.get('yp')->'carried_over_waiting')::text);
select pg_temp.ok((pg_temp.get('yp')->>'to_end')::int = (select count(*) from academic_security.year_close_rows(pg_temp.yr()) where outcome = 'end')
  and (pg_temp.get('yp')->>'kept_in_later_courses')::int = (select count(*) from academic_security.year_close_rows(pg_temp.yr()) where outcome = 'kept_later')
  and (pg_temp.get('yp')->'kept_waiting_unplaced'->>'total')::int
    = (select count(*) from academic_security.year_close_rows(pg_temp.yr()) where outcome = 'kept_waiting')
  and (pg_temp.get('yp')->'kept_waiting_unplaced'->'by_programme'->>'Summer Camp')::int >= 1, 'preview counts ' || pg_temp.get('yp')::text);
select pg_temp.ok((pg_temp.get('yp')->>'groups_to_mark')::int = (select count(*) from public.groups g where g.closed_at is null
  and not online_security.is_online_type(g.session_type) and academic_security.school_year_of(g.annee) = pg_temp.yr()
  and not coalesce(g.date_fin > public.business_date(), false)), 'preview groups to mark');
-- Refusals, then the close.
select pg_temp.act(3);
select pg_temp.fails(format('select public.close_school_year(%L, %s, %L)', pg_temp.yr(), (pg_temp.get('yp')->>'to_end')::int, 'Fin d''année'), '42501');
select pg_temp.act(1);
select pg_temp.fails(format('select public.close_school_year(%L, %s, %L)', pg_temp.yr(), (pg_temp.get('yp')->>'to_end')::int + 1, 'Fin d''année'),
  'PT409', 'egc.stale');
select pg_temp.put('yc', to_jsonb(public.close_school_year(pg_temp.yr(), (pg_temp.get('yp')->>'to_end')::int, 'Fin d''année')));
select pg_temp.owner();
select pg_temp.ok((pg_temp.get('yc') #>> '{}')::int = (pg_temp.get('yp')->>'to_end')::int, 'the year close returns the number ended');
select pg_temp.ok(pg_temp.est(pg_temp.id(419)) = 'Validated' and pg_temp.est(pg_temp.id(433)) = 'Validated'
  and pg_temp.est(pg_temp.id(435)) = 'Confirmed' and pg_temp.est(pg_temp.id(417)) = 'Confirmed' and pg_temp.est(pg_temp.id(438)) = 'Confirmed',
  'OA4/OA6: courses ending later and waiting rows are kept');
select pg_temp.ok((select bool_and(status = 'Ended') from public.enrollments where id in (pg_temp.id(436), pg_temp.id(437), pg_temp.id(413),
  pg_temp.id(421), pg_temp.id(423), pg_temp.id(424), pg_temp.id(432))), 'the rest of the year ends');
select pg_temp.ok((select array_agg(id order by id) from public.groups where id::text like 'cdc00000-%' and closed_at is not null
    and id not in (pg_temp.id(301), pg_temp.id(308)))
  = (select array_agg(x order by x) from unnest(array[pg_temp.id(303), pg_temp.id(320), pg_temp.id(321), pg_temp.id(330), pg_temp.id(331),
    pg_temp.id(336)]) x), 'Q16: the finished and undated groups left empty are marked; 306, 309, 334 and online groups are not');
select pg_temp.put('ylog', (select after from public.activity_log where changed_columns = array['close_school_year']
  and after->>'school_year' = pg_temp.yr()));
select pg_temp.ok((pg_temp.get('ylog')->>'groups_left_open')::int = 0
  and (pg_temp.get('ylog')->>'groups_marked')::int = (pg_temp.get('yp')->>'groups_to_mark')::int
  and (pg_temp.get('ylog')->>'kept_in_later_courses')::int = (pg_temp.get('yp')->>'kept_in_later_courses')::int
  and (pg_temp.get('ylog')->>'kept_waiting')::int = (pg_temp.get('yp')->'kept_waiting_unplaced'->>'total')::int
  and (select count(*) from maintenance.course_close_journal where run_id = (pg_temp.get('ylog')->>'run_id')::uuid and action = 'run'
    and source = 'close_school_year') = (pg_temp.get('ylog')->>'groups_marked')::int, 'year close log and journal ' || pg_temp.get('ylog')::text);
-- A group closed by the year close reopens without restoring anything.
select pg_temp.act(1);
select pg_temp.put('ry', public.reopen_course(pg_temp.id(331), pg_temp.closed(pg_temp.id(331))));
select pg_temp.put('cy', public.close_course(pg_temp.id(330), 0));
select pg_temp.owner();
select pg_temp.ok((pg_temp.get('ry')->>'restored')::int = 0 and pg_temp.get('ry')->'skipped' = '[]'::jsonb
  and pg_temp.closed(pg_temp.id(331)) is null, 'reopen after the year close only clears the mark');
select pg_temp.ok((pg_temp.get('cy')->>'replayed')::boolean, 'a close of a year-closed group replays');

rollback;
