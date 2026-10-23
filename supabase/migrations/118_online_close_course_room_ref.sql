-- 118: online learning — the course-close command no longer returns the provider room
-- reference (independent review of PR #145, finding N1; plan OL-r6 adapter addendum).
--
-- online_close_course is re-created from its migration-117 body with exactly one change:
-- the returned object loses 'provider' and 'room_ref'. A management caller that invokes
-- the RPC directly therefore neither receives the opaque reference nor learns which
-- provider holds it. The close route resolves the reference afterwards, as the service
-- role, through the new online_resolve_room, and hands it to the adapter only, so a
-- closed course always gets its provider room closed by the server, never by the caller.
-- Additive and forward-only; no table, policy, grant or row changes.
begin;

create or replace function public.online_close_course(p_group uuid, p_expected_version bigint) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare c public.online_courses%rowtype; v_revoked integer;
begin
  perform online_security.require_role(array['director', 'admin']);
  c := online_security.course_for_update(p_group, p_expected_version);
  if c.status = 'closed' then perform online_security.fail('course_closed', '23514', 'Ce cours est déjà clôturé.'); end if;
  update public.online_courses set status = 'closed', version = version + 1, updated_at = now(), updated_by = auth.uid()
  where group_id = p_group returning * into c;
  update public.online_join_tokens t set revoked_at = now(), revoke_reason = 'course_closed'
  from public.online_lessons l
  where t.lesson_id = l.id and l.group_id = p_group and t.revoked_at is null and t.expires_at > now();
  get diagnostics v_revoked = row_count;
  -- The opaque room reference stays on the server: the close route resolves it as the
  -- service role through online_resolve_room (migration 118, review fix N1).
  return jsonb_build_object('group_id', c.group_id, 'version', c.version, 'status', c.status, 'revoked', v_revoked);
end $$;

-- Service role only: the close route resolves a course's provider and opaque room
-- reference right after online_close_course, so the provider room is closed by the server.
create function public.online_resolve_room(p_group uuid) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, pg_temp as $$
declare c public.online_courses%rowtype;
begin
  select * into c from public.online_courses where group_id = p_group;
  if not found or c.provider_room_ref is null then
    perform online_security.fail('not_found', '22023', 'Cours en ligne introuvable.');
  end if;
  return jsonb_build_object('group_id', c.group_id, 'status', c.status, 'provider', c.provider, 'room_ref', c.provider_room_ref);
end $$;
revoke all on function public.online_resolve_room(uuid) from public, anon, authenticated;
grant execute on function public.online_resolve_room(uuid) to service_role;

do $$
begin
  if (select prosrc from pg_proc where oid = 'public.online_close_course(uuid, bigint)'::regprocedure) ilike '%''room\_ref''%'
     or (select prosrc from pg_proc where oid = 'public.online_close_course(uuid, bigint)'::regprocedure) ilike '%provider\_room\_ref%' then
    raise exception 'online_close_course still returns the room reference';
  end if;
  if exists (select 1 from pg_proc p, aclexplode(p.proacl) a where p.oid = 'public.online_resolve_room(uuid)'::regprocedure
      and a.grantee <> p.proowner and a.grantee <> 'service_role'::regrole) then
    raise exception 'online_resolve_room is executable by an API role other than service_role';
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
