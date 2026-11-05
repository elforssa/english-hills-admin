set transaction read only;
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
