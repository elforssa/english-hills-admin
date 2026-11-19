-- 130: Online session evidence — Zoom's webhook put into service (plan
-- docs/architecture/plans/online-room-reliability.md, ORR-r2, « webhook PR », section 3,
-- approved by the owner on 2026-11-17 at fc4d44f with the binding corrections of 13df351;
-- decisions D5–D7, D9, D13, and D16 of 2026-11-19 for the refusal counter). The number is
-- the next free number on main when this file was written; it is taken again at merge.
-- Forward-only and transactional. No existing row changes; no backfill.
--
-- Evidence only: nothing here writes, proposes or changes attendance (invariant 1, D7).
-- No payload, no display name and no device data is stored.
--
-- 1. public.online_session_events (new): a session started or ended at the provider, per
--    lesson (lesson, provider, kind, time, the provider's opaque session reference).
--    Unique (lesson, kind, time); index on received_at. Row security on, no API grant.
-- 2. public.online_webhook_refusals (new, owner decision D16 of 2026-11-19): one counter
--    row per deployment and reason (rate_limited → 429, unavailable → 503), so the status
--    line can count refused webhook writes since the last deploy. Bounded: one row per
--    deployment and reason. Row security on, no API grant.
-- 3. public.online_join_events: index on received_at (the write ceiling reads it).
-- 4. online_security.evidence_ceiling_reached() (private helper): true when 600 evidence
--    rows or more were received in the last 60 seconds across both event tables.
-- 5. public.online_record_join_event is re-created from its 117 body (no later
--    re-creation): the write ceiling (online.rate_limited), nothing else.
-- 6. public.online_record_session_event(…) (new, service role): verifies that the lesson
--    exists, that its course has this provider and that the session name is exactly the
--    course's room reference plus the lesson id; idempotent; the same ceiling.
-- 7. public.online_note_webhook_refusal(deployment, reason) (new, service role, D16).
-- 8. public.online_get_course is re-created from its 117 body (no later re-creation): the
--    last leave time per learner beside the first join, nothing else.
-- 9. public.online_usage_month(p_month) (new, director and admin): connected minutes per
--    course and per pass, with the pairing rule of section 3 (estimated part returned).
-- 10. public.online_room_status(p_deployment) (new, director and admin): time of the last
--    event received and the refusals counted for that deployment.
-- 11. public.online_purge_session_evidence() (new, owner only) and the monthly pg_cron
--    job online-evidence-purge: deletes evidence rows older than 12 months (D13).
begin;

create table public.online_session_events (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.online_lessons(id) on delete restrict,
  provider text not null check (provider ~ '^[a-z][a-z0-9-]{1,31}$'),
  kind text not null check (kind in ('started', 'ended')),
  at timestamptz not null,
  provider_session_ref text check (provider_session_ref is null or char_length(provider_session_ref) <= 200),
  received_at timestamptz not null default now(),
  constraint online_session_events_once_key unique (lesson_id, kind, at)
);
create index online_session_events_received_idx on public.online_session_events(received_at);
create index online_join_events_received_idx on public.online_join_events(received_at);

create table public.online_webhook_refusals (
  deployment text not null check (deployment ~ '^[A-Za-z0-9_.-]{1,100}$'),
  reason text not null check (reason in ('rate_limited', 'unavailable')),
  refused bigint not null default 1 check (refused > 0),
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  constraint online_webhook_refusals_pkey primary key (deployment, reason)
);

alter table public.online_session_events enable row level security;
alter table public.online_webhook_refusals enable row level security;
revoke all on table public.online_session_events from public, anon, authenticated, service_role;
revoke all on table public.online_webhook_refusals from public, anon, authenticated, service_role;

-- At most 600 evidence rows received in any 60 seconds across both event tables (N8).
-- One pilot lesson produces a few dozen. Read by both record functions.
create function online_security.evidence_ceiling_reached() returns boolean
language sql stable set search_path = pg_catalog, pg_temp as $$
  select (select count(*) from public.online_join_events where received_at > now() - interval '60 seconds')
       + (select count(*) from public.online_session_events where received_at > now() - interval '60 seconds') >= 600
$$;

create or replace function public.online_record_join_event(p_jti uuid, p_kind text, p_at timestamptz, p_ref text default null)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_token uuid; v_id uuid;
begin
  if p_kind is null or p_kind not in ('joined', 'left') or p_at is null or not isfinite(p_at)
     or p_at > now() + interval '5 minutes' or char_length(p_ref) > 200 then
    perform online_security.fail('invalid_input', '22023', 'Événement invalide.');
  end if;
  -- 130: at most 600 evidence rows received in any 60 seconds (plan ORR-r2, N8).
  if online_security.evidence_ceiling_reached() then
    perform online_security.fail('rate_limited', '53400', 'Trop d’événements reçus.');
  end if;
  select id into v_token from public.online_join_tokens where jti = p_jti;
  if v_token is null then return jsonb_build_object('recorded', false); end if;
  insert into public.online_join_events(token_id, kind, at, provider_participant_ref)
  values (v_token, p_kind, p_at, p_ref) on conflict on constraint online_join_events_once_key do nothing
  returning id into v_id;
  return jsonb_build_object('recorded', v_id is not null);
end $$;

-- Service role only: a session started or ended, after the route's gate, size limit and
-- signature checks. Written only for an existing lesson of a course of this provider
-- whose session name is exactly the course's room reference plus the lesson id;
-- anything else is acknowledged and dropped ({ recorded: false }).
create function public.online_record_session_event(p_lesson uuid, p_provider text, p_kind text, p_at timestamptz,
  p_session_name text, p_ref text default null) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare r record; v_id uuid;
begin
  if p_lesson is null or p_kind is null or p_kind not in ('started', 'ended') or p_at is null or not isfinite(p_at)
     or p_at > now() + interval '5 minutes' or p_provider is null or p_provider !~ '^[a-z][a-z0-9-]{1,31}$'
     or p_session_name is null or char_length(p_session_name) > 200 or char_length(p_ref) > 200 then
    perform online_security.fail('invalid_input', '22023', 'Événement invalide.');
  end if;
  if online_security.evidence_ceiling_reached() then
    perform online_security.fail('rate_limited', '53400', 'Trop d’événements reçus.');
  end if;
  select c.provider, c.provider_room_ref into r
  from public.online_lessons l join public.online_courses c on c.group_id = l.group_id where l.id = p_lesson;
  if not found or r.provider is distinct from p_provider or r.provider_room_ref is null
     or lower(p_session_name) <> lower(r.provider_room_ref || '.' || p_lesson::text) then
    return jsonb_build_object('recorded', false);
  end if;
  insert into public.online_session_events(lesson_id, provider, kind, at, provider_session_ref)
  values (p_lesson, p_provider, p_kind, p_at, p_ref) on conflict on constraint online_session_events_once_key do nothing
  returning id into v_id;
  return jsonb_build_object('recorded', v_id is not null);
end $$;

-- Service role only (D16): one more refused webhook write (429 or 503) for this
-- deployment. Best effort: the route calls it after a refusal and ignores its failure,
-- so a 503 caused by a database outage is not counted.
create function public.online_note_webhook_refusal(p_deployment text, p_reason text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  if p_deployment is null or p_deployment !~ '^[A-Za-z0-9_.-]{1,100}$' or p_reason is null
     or p_reason not in ('rate_limited', 'unavailable') then
    perform online_security.fail('invalid_input', '22023', 'Refus invalide.');
  end if;
  insert into public.online_webhook_refusals as w(deployment, reason) values (p_deployment, p_reason)
  on conflict on constraint online_webhook_refusals_pkey do update set refused = w.refused + 1, last_at = now();
  return jsonb_build_object('noted', true);
end $$;

-- Staff course read (re-created from 117): the last leave beside the first join.
create or replace function public.online_get_course(p_group uuid, p_lesson uuid default null) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, pg_temp as $$
declare g public.groups%rowtype; c public.online_courses%rowtype; l public.online_lessons%rowtype;
  v_course jsonb; v_detail jsonb;
begin
  perform online_security.require_role(array['director', 'admin', 'receptionist']);
  select * into g from public.groups where id = p_group;
  if not found or not online_security.is_online_type(g.session_type) then
    perform online_security.fail('not_found', '22023', 'Cours en ligne introuvable.');
  end if;
  select * into c from public.online_courses where group_id = p_group;
  if c.group_id is not null then
    v_course := jsonb_build_object('status', c.status, 'audience', c.audience, 'capacity', c.capacity,
      'teacher_id', c.teacher_id, 'teacher_name', (select full_name from public.teachers where id = c.teacher_id),
      'lesson_minutes', c.lesson_minutes, 'join_open_minutes', c.join_open_minutes,
      'join_grace_minutes', c.join_grace_minutes, 'host_open_minutes', c.host_open_minutes,
      'term_start', c.term_start, 'term_end', c.term_end, 'provider', c.provider,
      'room_ready', c.provider_room_ref is not null, 'version', c.version,
      'patterns', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'weekday', p.weekday,
          'start_time', to_char(p.start_time, 'HH24:MI'), 'minutes', p.minutes, 'valid_from', p.valid_from,
          'valid_to', p.valid_to) order by (p.weekday + 6) % 7, p.start_time)
        from public.online_lesson_patterns p where p.group_id = p_group and p.valid_to >= online_security.today()), '[]'::jsonb),
      'lessons', coalesce((select jsonb_agg(online_security.lesson_json(x) || jsonb_build_object(
          'teacher_id', x.teacher_id, 'teacher_name', t.full_name, 'is_substitute', x.is_substitute,
          'detached', x.detached, 'cancel_reason', x.cancel_reason, 'report', x.report,
          'guest_count', (select count(*) from public.online_lesson_guests gu where gu.lesson_id = x.id and gu.removed_at is null),
          'attendance_count', (select count(*) from public.online_attendance a where a.lesson_id = x.id))
        order by x.starts_at) from public.online_lessons x left join public.teachers t on t.id = x.teacher_id
        where x.group_id = p_group), '[]'::jsonb));
  end if;
  if p_lesson is not null then
    select * into l from public.online_lessons where id = p_lesson and group_id = p_group;
    if not found then perform online_security.fail('not_found', '22023', 'Cours introuvable.'); end if;
    v_detail := online_security.lesson_json(l) || jsonb_build_object('teacher_id', l.teacher_id,
      'teacher_name', (select full_name from public.teachers where id = l.teacher_id), 'is_substitute', l.is_substitute,
      'cancel_reason', l.cancel_reason, 'report', l.report,
      'guests', coalesce((select jsonb_agg(jsonb_build_object('id', gu.id, 'student_id', gu.student_id,
          'full_name', s.full_name, 'kind', gu.kind, 'note', gu.note, 'added_at', gu.added_at) order by gu.added_at)
        from public.online_lesson_guests gu join public.students s on s.id = gu.student_id
        where gu.lesson_id = l.id and gu.removed_at is null), '[]'::jsonb),
      'attendance', coalesce((select jsonb_agg(jsonb_build_object('student_id', m.student_id, 'full_name', s.full_name,
          'is_guest', m.is_guest, 'status', a.status, 'note', a.note,
          'first_pass_at', (select min(t.issued_at) from public.online_join_tokens t where t.lesson_id = l.id
            and t.student_id = m.student_id),
          'joined_at', (select min(ev.at) from public.online_join_events ev join public.online_join_tokens t on t.id = ev.token_id
            where t.lesson_id = l.id and t.student_id = m.student_id and ev.kind = 'joined'),
          -- 130: the last leave the provider reported (evidence only, never attendance).
          'left_at', (select max(ev.at) from public.online_join_events ev join public.online_join_tokens t on t.id = ev.token_id
            where t.lesson_id = l.id and t.student_id = m.student_id and ev.kind = 'left'))
        order by s.full_name) from (select distinct on (x.student_id) x.student_id, x.is_guest from (
            select e.student_id, false as is_guest from public.enrollments e
            where e.group_id = l.group_id and e.status in ('Confirmed', 'Validated')
            union all
            select gu.student_id, true from public.online_lesson_guests gu where gu.lesson_id = l.id and gu.removed_at is null
          ) x order by x.student_id, x.is_guest) m
        join public.students s on s.id = m.student_id and s.deleted_at is null
        left join public.online_attendance a on a.lesson_id = l.id and a.student_id = m.student_id), '[]'::jsonb));
  end if;
  return jsonb_build_object('group', jsonb_build_object('id', g.id, 'name', g.name, 'session_type', g.session_type,
      'niveau', g.niveau, 'annee', g.annee, 'jours', g.jours, 'horaire', g.horaire, 'updated_at', g.updated_at),
    'course', v_course,
    'roster', coalesce((select jsonb_agg(jsonb_build_object('student_id', s.id, 'full_name', s.full_name,
        'niveau_cefr', s.niveau_cefr, 'enrollment_id', e.id, 'enrollment_status', e.status,
        'has_consent', online_security.has_consent(s.id),
        'unpaid', exists (select 1 from public.charge_balances cb where cb.student_id = s.id
          and cb.voided_at is null and cb.balance > 0)) order by s.full_name)
      from public.enrollments e join public.students s on s.id = e.student_id and s.deleted_at is null
      where e.group_id = p_group and e.status is distinct from 'Rejected'), '[]'::jsonb),
    'lesson', v_detail);
end $$;

-- Director and admin: connected minutes of a month (UTC) per course, added per pass so
-- that a leftover counts as the provider bills it (D7 b, stop condition S4 of online
-- classroom tools). Pairing rule (plan section 3, binding correction 5), per pass, events
-- in time order (a join before a leave at the same instant):
--   1. joined then left: one interval, exact;
--   2. joined with no later left: ends at the earliest of the pass's next joined, the
--      first ended session event of the lesson after the join, the pass's expiry and the
--      time of the read; estimated;
--   3. left with no earlier event of the pass (lost join): starts at the latest of the
--      pass's issue time and the last started session event of the lesson before the
--      leave; estimated;
--   4. a second joined while one is open closes the first at the second's time (rule 2);
--      a left with nothing open after an earlier event is ignored;
--   5. intervals are clipped to the month in UTC.
-- Passes are read when one of their events falls between two days before the month and
-- its end (a lesson lasts at most four hours). Never attendance.
create function public.online_usage_month(p_month date) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, pg_temp as $$
declare v_first date; v_start timestamptz; v_end timestamptz; v_now timestamptz := now();
  p record; e record; v_open timestamptz; v_seen boolean; v_from timestamptz; v_to timestamptz;
  v_rows jsonb := '[]'::jsonb; v_courses jsonb;
begin
  perform online_security.require_role(array['director', 'admin']);
  if p_month is null or not isfinite(p_month) then
    perform online_security.fail('invalid_input', '22023', 'Mois requis.');
  end if;
  v_first := date_trunc('month', p_month)::date;
  v_start := v_first::timestamp at time zone 'UTC';
  v_end := (v_first + interval '1 month')::date::timestamp at time zone 'UTC';
  for p in select t.id, t.issued_at, t.expires_at, t.lesson_id, l.group_id
      from public.online_join_tokens t join public.online_lessons l on l.id = t.lesson_id
      where exists (select 1 from public.online_join_events ev where ev.token_id = t.id
        and ev.at >= v_start - interval '2 days' and ev.at < v_end)
  loop
    v_open := null; v_seen := false;
    for e in select ev.kind, ev.at from public.online_join_events ev where ev.token_id = p.id
        order by ev.at, (ev.kind = 'left') loop
      if e.kind = 'joined' then
        if v_open is not null then
          v_to := greatest(v_open, least(e.at, p.expires_at, v_now, (select min(s.at) from public.online_session_events s
            where s.lesson_id = p.lesson_id and s.kind = 'ended' and s.at > v_open)));
          v_rows := v_rows || jsonb_build_object('g', p.group_id, 't', p.id, 'f', v_open, 'u', v_to, 'e', true);
        end if;
        v_open := e.at;
      elsif v_open is not null then
        v_rows := v_rows || jsonb_build_object('g', p.group_id, 't', p.id, 'f', v_open, 'u', e.at, 'e', false);
        v_open := null;
      elsif not v_seen then
        v_from := least(e.at, greatest(p.issued_at, (select max(s.at) from public.online_session_events s
          where s.lesson_id = p.lesson_id and s.kind = 'started' and s.at < e.at)));
        v_rows := v_rows || jsonb_build_object('g', p.group_id, 't', p.id, 'f', v_from, 'u', e.at, 'e', true);
      end if;
      v_seen := true;
    end loop;
    if v_open is not null then
      v_to := greatest(v_open, least(p.expires_at, v_now, (select min(s.at) from public.online_session_events s
        where s.lesson_id = p.lesson_id and s.kind = 'ended' and s.at > v_open)));
      v_rows := v_rows || jsonb_build_object('g', p.group_id, 't', p.id, 'f', v_open, 'u', v_to, 'e', true);
    end if;
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('group_id', a.group_id, 'name', gr.name, 'provider', c.provider,
      'minutes', round(a.secs / 60.0, 1), 'passes', a.passes, 'intervals', a.intervals,
      'estimated_intervals', a.est_intervals, 'estimated_minutes', round(a.est_secs / 60.0, 1))
    order by gr.name, a.group_id), '[]'::jsonb) into v_courses
  from (select x.g as group_id, sum(x.secs) as secs, count(distinct x.t) as passes, count(*) as intervals,
          count(*) filter (where x.est) as est_intervals, coalesce(sum(x.secs) filter (where x.est), 0) as est_secs
        from (select (r->>'g')::uuid as g, (r->>'t')::uuid as t, (r->>'e')::boolean as est,
                extract(epoch from least((r->>'u')::timestamptz, v_end) - greatest((r->>'f')::timestamptz, v_start)) as secs
              from jsonb_array_elements(v_rows) r) x
        where x.secs > 0 group by x.g) a
  join public.groups gr on gr.id = a.group_id left join public.online_courses c on c.group_id = a.group_id;
  return jsonb_build_object('month', to_char(v_first, 'YYYY-MM'), 'time_zone', 'UTC', 'courses', v_courses,
    'totals', jsonb_build_object(
      'minutes', coalesce((select sum((x->>'minutes')::numeric) from jsonb_array_elements(v_courses) x), 0),
      'estimated_minutes', coalesce((select sum((x->>'estimated_minutes')::numeric) from jsonb_array_elements(v_courses) x), 0),
      'intervals', coalesce((select sum((x->>'intervals')::integer) from jsonb_array_elements(v_courses) x), 0),
      'estimated_intervals', coalesce((select sum((x->>'estimated_intervals')::integer) from jsonb_array_elements(v_courses) x), 0)));
end $$;

-- Director and admin: the webhook rows of the status line (D7 c, D9): time of the last
-- event received (either table) and the refusals counted for the given deployment (D16).
-- Times and counts only.
create function public.online_room_status(p_deployment text default null) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, pg_temp as $$
begin
  perform online_security.require_role(array['director', 'admin']);
  return jsonb_build_object(
    'last_event_at', greatest((select max(received_at) from public.online_join_events),
      (select max(received_at) from public.online_session_events)),
    'refused_rate_limited', coalesce((select refused from public.online_webhook_refusals
      where deployment = p_deployment and reason = 'rate_limited'), 0),
    'refused_unavailable', coalesce((select refused from public.online_webhook_refusals
      where deployment = p_deployment and reason = 'unavailable'), 0));
end $$;

-- Owner only (no API grant), run monthly by pg_cron (D13): evidence rows whose time is
-- more than 12 months old, and refusal counters untouched for 12 months, are deleted.
-- Returns the counts. Never touches passes or attendance.
create function public.online_purge_session_evidence() returns jsonb
language plpgsql set search_path = pg_catalog, pg_temp as $$
declare v_cut timestamptz := (now() at time zone 'UTC' - interval '12 months') at time zone 'UTC';
  v_join integer; v_session integer; v_refusals integer;
begin
  delete from public.online_join_events where at < v_cut;
  get diagnostics v_join = row_count;
  delete from public.online_session_events where at < v_cut;
  get diagnostics v_session = row_count;
  delete from public.online_webhook_refusals where last_at < v_cut;
  get diagnostics v_refusals = row_count;
  return jsonb_build_object('cutoff', v_cut, 'join_events', v_join, 'session_events', v_session, 'refusals', v_refusals);
end $$;

-- Execution boundary: the private helper and the purge are executable by no API role;
-- the two writers are service role only; the two reads are authenticated only and check
-- the caller's stored role themselves. The re-created functions keep their grants.
revoke all on function online_security.evidence_ceiling_reached() from public, anon, authenticated, service_role;
revoke all on function public.online_record_session_event(uuid, text, text, timestamptz, text, text),
  public.online_note_webhook_refusal(text, text), public.online_usage_month(date), public.online_room_status(text),
  public.online_purge_session_evidence()
  from public, anon, authenticated, service_role;
grant execute on function public.online_record_session_event(uuid, text, text, timestamptz, text, text),
  public.online_note_webhook_refusal(text, text) to service_role;
grant execute on function public.online_usage_month(date), public.online_room_status(text) to authenticated;

-- Monthly retention job (D13), the pattern of migrations 095 and 100. pg_cron can only be
-- installed in the database selected by cron.database_name; disposable replay databases
-- skip the job. cron.schedule replaces a job of the same name, so a replay keeps one.
do $$
declare cron_database text := current_setting('cron.database_name', true);
begin
  if cron_database is null or cron_database = current_database() then
    execute 'create extension if not exists pg_cron with schema pg_catalog';
  else
    raise notice 'Skipping pg_cron evidence purge in %, configured cron database is %', current_database(), cron_database;
  end if;
end $$;
do $$
begin
  if to_regnamespace('cron') is not null then
    perform cron.schedule('online-evidence-purge', '17 3 1 * *', 'select public.online_purge_session_evidence()');
  end if;
end $$;

commit;
