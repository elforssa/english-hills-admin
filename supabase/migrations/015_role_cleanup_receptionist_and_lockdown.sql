-- =============================================================================
-- 015 — Role cleanup: drop 'receptionist', lock down self-promotion RPCs.
--
-- Replaces the five-app-role + receptionist model with five roles only:
--   director · admin · teacher · parent · student   (+ 'pending' bootstrap)
--
-- Receptionist responsibilities are merged into 'admin'. Every RLS policy
-- that named 'receptionist' (migrations 006 and 014) is recreated in 'admin'
-- terms — but since 'admin' already had broader access on every one of those
-- tables, the receptionist-specific policies are simply dropped, not
-- duplicated.
--
-- Also:
--   • Existing rows with role='receptionist' are migrated to 'admin'.
--   • simulate_role() and claim_director_if_none() lose their EXECUTE grant
--     on 'authenticated'. claim_director_if_none() remains in the schema for
--     emergency bootstrap from the SQL editor by a database superuser.
--   • simulate_role() is dropped outright — directors no longer simulate
--     other roles; they use the platform as directors.
-- =============================================================================


-- ── 1. Drop policies that referenced 'receptionist' ─────────────────────────
-- The 'admin' policy on each table already grants the same access (or more),
-- so we don't need to recreate anything.

drop policy if exists "students receptionist read"  on public.students;
drop policy if exists "enrollments recep select"    on public.enrollments;
drop policy if exists "enrollments recep insert"    on public.enrollments;
drop policy if exists "attendance recep read"       on public.attendance;
drop policy if exists "attendance recep insert"     on public.attendance;
drop policy if exists "attendance recep update"     on public.attendance;
drop policy if exists "attendance recep delete"     on public.attendance;

-- Combined staff policies on authorized_adults & dismissal_logs included
-- 'receptionist' in the role-list. Re-create them without it.
drop policy if exists "authadults staff all" on public.authorized_adults;
create policy "authadults staff all" on public.authorized_adults for all
  using (get_my_role() in ('admin','director'))
  with check (get_my_role() in ('admin','director'));

drop policy if exists "dismissal staff all" on public.dismissal_logs;
create policy "dismissal staff all" on public.dismissal_logs for all
  using (get_my_role() in ('admin','director'))
  with check (get_my_role() in ('admin','director'));


-- ── 2. Migrate any existing receptionist rows to admin ─────────────────────
-- Must happen BEFORE we tighten the CHECK constraint, otherwise the ALTER
-- would fail on legacy rows.

update public.profiles
   set role = 'admin'
 where role = 'receptionist';


-- ── 3. Tighten the CHECK constraint on profiles.role ───────────────────────
-- Final allowed set: admin · director · teacher · parent · student · pending.

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in (
    'admin','director','teacher','parent','student','pending'
  ));


-- ── 4. Lock down self-promotion RPCs ───────────────────────────────────────
-- simulate_role() is removed entirely: directors no longer simulate roles.
-- claim_director_if_none() is preserved (a human DBA can still invoke it
-- from the Supabase SQL editor for emergency bootstrap) but EXECUTE is
-- revoked from the 'authenticated' role so no client session can call it.

drop function if exists public.simulate_role(text);

revoke execute on function public.claim_director_if_none() from authenticated, anon;


-- ── 5. Tighten profiles_prevent_self_elevation_t error message ─────────────
-- The trigger body still mentions claim_director_if_none() — that's accurate
-- (the function still exists), but the recommended channel for setting a
-- role is now an API route using the service-role key. The wording stays
-- factual.
