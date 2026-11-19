-- 129: Online room reliability — newest connection wins once it is inside Zoom (plan
-- docs/architecture/plans/online-room-reliability.md, ORR-r2, « reliability PR »,
-- approved by the owner on 2026-11-17 at fc4d44f with the binding corrections recorded
-- in 13df351; decisions D2, D10 and D15 of 2026-11-18: the platform never removes a
-- participant, so no leftover list). The number is the next free number on main when
-- this file was written; the plan takes it again at merge. Forward-only and
-- transactional. No row changes: existing passes keep superseded_at and provider empty
-- (an empty provider reads as the course's).
--
-- 1. public.online_join_tokens gains superseded_at (a newer pass of the same lesson and
--    person confirmed inside the room) and provider (the room type the pass was issued
--    for, the same pattern check as online_courses.provider).
-- 2. public.online_issue_join is re-created from its 117 body (no later re-creation) with
--    two changes only: issued_at is taken from clock_timestamp() after the per-lesson
--    advisory lock, so the order of issued_at is the order of issue, and the pass records
--    the course's provider. It supersedes nothing (finding B2).
-- 3. public.online_resolve_join is re-created from its 117 body: a superseded pass is
--    refused with online.superseded, and the provider returned is the pass's own (the
--    course's for a pass issued before this migration).
-- 4. public.online_confirm_pass(p_jti) (new, authenticated): the device of a pass reports
--    that it is inside the room. Own pass only. Under the same per-lesson lock as the
--    issue: a pass that is revoked, expired or already superseded supersedes nothing and
--    says so; otherwise every earlier-issued (issued_at, then id) current pass of the same
--    lesson and person is superseded. Person: the learner for a learner pass (a parent who
--    opens the room for a child replaces the child's connection), the teacher for a host
--    pass, the signed-in account for an observer pass. Returns the evaluation of
--    online_check_pass plus took_over_other_account and superseded_others.
-- 5. public.online_check_pass(p_jti) (new, authenticated): own pass only; the join
--    evaluation for the pass's lesson and learner, plus superseded and revoked. It names
--    no provider field (N5).
-- online_check_join is kept unchanged: the room page still uses it before entry.
begin;

alter table public.online_join_tokens
  add column superseded_at timestamptz,
  add column provider text,
  add constraint online_join_tokens_provider_check check (provider is null or provider ~ '^[a-z][a-z0-9-]{1,31}$'),
  add constraint online_join_tokens_superseded_check check (superseded_at is null or superseded_at >= issued_at);

create or replace function public.online_issue_join(p_lesson uuid, p_student uuid default null) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v jsonb; t public.online_join_tokens%rowtype;
begin
  perform online_security.require_role(array['director', 'admin', 'receptionist', 'teacher', 'parent', 'student']);
  -- One issue at a time per lesson keeps the capacity count exact.
  perform pg_advisory_xact_lock(hashtextextended('online:join:' || p_lesson::text, 0));
  v := online_security.evaluate_join(p_lesson, p_student);
  if (v->>'ok')::boolean is not true then
    perform online_security.fail(v->>'reason', case when v->>'reason' = 'capacity' then '23514' else '42501' end,
      'Accès au cours refusé.');
  end if;
  -- 129: issued_at after the lock (the order of issue), and the course's provider on the pass.
  insert into public.online_join_tokens(lesson_id, participant_kind, student_id, teacher_id, profile_id, display_label, expires_at, issued_at, provider)
  values (p_lesson, v->>'kind', (v->>'student_id')::uuid, (v->>'teacher_id')::uuid, auth.uid(), v->>'label',
    (v->>'expires_at')::timestamptz, clock_timestamp(), (select c.provider from public.online_lessons l join public.online_courses c on c.group_id = l.group_id where l.id = p_lesson))
  returning * into t;
  return jsonb_build_object('token_id', t.id, 'jti', t.jti, 'lesson_id', t.lesson_id,
    'participant_kind', t.participant_kind,
    'provider_role', case when t.participant_kind = 'host' then 'host' else 'participant' end,
    'display_label', t.display_label, 'expires_at', t.expires_at);
end $$;

create or replace function public.online_resolve_join(p_jti uuid) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, pg_temp as $$
declare r record;
begin
  select t.display_label, t.participant_kind, t.expires_at, t.revoked_at, t.issued_at, coalesce(t.provider, c.provider) as provider,
    c.provider_room_ref, c.status as course_status, l.status as lesson_status, t.superseded_at
  into r from public.online_join_tokens t join public.online_lessons l on l.id = t.lesson_id
  join public.online_courses c on c.group_id = l.group_id where t.jti = p_jti;
  -- 129: a newer pass of the same person was confirmed inside the room.
  if found and r.revoked_at is null and r.superseded_at is not null then
    perform online_security.fail('superseded', '42501', 'Accès au cours refusé.');
  end if;
  if not found or r.revoked_at is not null or r.expires_at <= now() or r.issued_at < now() - interval '5 minutes'
     or r.course_status <> 'active' or r.lesson_status = 'cancelled' or r.provider_room_ref is null then
    perform online_security.fail('pass_invalid', '42501', 'Accès au cours refusé.');
  end if;
  return jsonb_build_object('provider', r.provider, 'room_ref', r.provider_room_ref, 'display_label', r.display_label,
    'provider_role', case when r.participant_kind = 'host' then 'host' else 'participant' end,
    'expires_at', r.expires_at);
end $$;

-- The caller's own pass with the join evaluation for its lesson and learner. Never
-- raises for a pass the caller holds; refuses (online.forbidden) any other id, so an
-- id the caller does not hold and an id that does not exist look the same.
create function online_security.own_pass_state(p_jti uuid) returns jsonb
language plpgsql stable set search_path = pg_catalog, pg_temp as $$
declare t public.online_join_tokens%rowtype; v jsonb;
begin
  select * into t from public.online_join_tokens where jti = p_jti and profile_id = auth.uid();
  if not found or auth.uid() is null then
    perform online_security.fail('forbidden', '42501', 'Action non autorisée.');
  end if;
  v := online_security.evaluate_join(t.lesson_id, t.student_id);
  return jsonb_build_object('ok', (v->>'ok')::boolean, 'reason', v->>'reason', 'opens_at', v->'opens_at',
    'closes_at', v->'closes_at', 'superseded', t.superseded_at is not null, 'revoked', t.revoked_at is not null);
end $$;

create function public.online_check_pass(p_jti uuid) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, pg_temp as $$
begin
  perform online_security.require_role(array['director', 'admin', 'receptionist', 'teacher', 'parent', 'student']);
  return online_security.own_pass_state(p_jti);
end $$;

create function public.online_confirm_pass(p_jti uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare me public.online_join_tokens%rowtype; v jsonb; v_count integer := 0; v_other boolean := false;
begin
  perform online_security.require_role(array['director', 'admin', 'receptionist', 'teacher', 'parent', 'student']);
  select * into me from public.online_join_tokens where jti = p_jti and profile_id = auth.uid();
  if not found then
    perform online_security.fail('forbidden', '42501', 'Action non autorisée.');
  end if;
  -- The same lock as the issue: a confirmation never interleaves with an issue or
  -- another confirmation of the same lesson.
  perform pg_advisory_xact_lock(hashtextextended('online:join:' || me.lesson_id::text, 0));
  select * into me from public.online_join_tokens where id = me.id;
  v := online_security.own_pass_state(p_jti);
  -- A pass that is revoked, expired or already superseded, or whose holder no longer
  -- qualifies, takes nothing from anybody.
  if me.revoked_at is null and me.superseded_at is null and me.expires_at > now() and (v->>'ok')::boolean then
    with ended as (
      update public.online_join_tokens t set superseded_at = greatest(now(), t.issued_at)
      where t.lesson_id = me.lesson_id and t.id <> me.id and t.participant_kind = me.participant_kind
        and t.revoked_at is null and t.superseded_at is null and t.expires_at > now()
        and (t.issued_at, t.id) < (me.issued_at, me.id)
        and case me.participant_kind when 'learner' then t.student_id = me.student_id
                                     when 'host' then t.teacher_id = me.teacher_id
                                     else t.profile_id = me.profile_id end
      returning t.profile_id)
    select count(*), coalesce(bool_or(profile_id <> me.profile_id), false) into v_count, v_other from ended;
  end if;
  return v || jsonb_build_object('took_over_other_account', v_other, 'superseded_others', v_count);
end $$;

revoke all on function online_security.own_pass_state(uuid) from public, anon, authenticated, service_role;
revoke all on function public.online_check_pass(uuid), public.online_confirm_pass(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.online_check_pass(uuid), public.online_confirm_pass(uuid)
  to authenticated;

commit;
