-- =============================================================================
-- 008 — Let bootstrap RPCs bypass profiles_prevent_self_elevation_t
--
-- BUG (introduced in 006_rls_policies.sql):
--
--   profiles_prevent_self_elevation() consults public.get_my_role(), which
--   reads `select role from profiles where id = auth.uid()`. auth.uid() is
--   the *caller's* session identity — SECURITY DEFINER does NOT change it.
--   So when a 'pending' user calls claim_director_if_none() (the documented
--   bootstrap entry point), the inner UPDATE fires the trigger, the trigger
--   sees role='pending', and raises:
--
--     profiles.role can only be changed by admin or director
--     (use claim_director_if_none() for bootstrap)
--
--   …which is the exact function it was telling the caller to use.
--   simulate_role() has the same flaw on its "switch back to director" path.
--
-- FIX:
--
--   1. Rewrite the trigger function as SECURITY INVOKER (the default).
--      Previously it was SECURITY DEFINER, which forced `current_user` inside
--      the trigger to be the owner (postgres) regardless of caller, making
--      it impossible to identify whether the trigger was invoked from
--      end-user PostgREST traffic vs. an admin / SECURITY DEFINER RPC.
--
--   2. Add an early bypass: if `current_user` is not one of the two PostgREST
--      end-user roles ('authenticated', 'anon'), return NEW unchanged.
--
--   Why this is secure:
--
--   • End-user PostgREST traffic always hits the DB as 'authenticated' or
--     'anon' — those callers still go through the full role/linked_id check.
--   • SECURITY DEFINER functions owned by 'postgres' (claim_director_if_none,
--     simulate_role, …) execute with current_user='postgres' for the duration
--     of their body. Their internal UPDATEs therefore bypass — but only
--     after the function's own preconditions pass.
--   • 'service_role' (the admin/backend key) also bypasses, consistent with
--     its existing RLS-bypass semantics.
--   • Regular users cannot impersonate 'postgres' / 'service_role' — those
--     are server-side roles they have no GRANT on.
--
--   Defence in depth is preserved: the two bootstrap functions still validate
--   their own preconditions, and RLS on `profiles` (006) still limits which
--   rows an end user can target with UPDATE even if the trigger lets the
--   statement through.
-- =============================================================================

create or replace function public.profiles_prevent_self_elevation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Bypass for non-end-user callers (postgres for migrations + SECURITY
  -- DEFINER RPCs, service_role for admin/backend, supabase_admin, etc.).
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if public.get_my_role() in ('admin', 'director') then
    return new;
  end if;
  if new.role is distinct from old.role then
    raise exception 'profiles.role can only be changed by admin or director (use claim_director_if_none() for bootstrap)';
  end if;
  if new.linked_student_id is distinct from old.linked_student_id then
    raise exception 'profiles.linked_student_id can only be changed by admin or director';
  end if;
  if new.linked_teacher_id is distinct from old.linked_teacher_id then
    raise exception 'profiles.linked_teacher_id can only be changed by admin or director';
  end if;
  return new;
end;
$$;
