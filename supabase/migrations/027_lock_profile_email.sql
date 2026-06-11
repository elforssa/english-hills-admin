-- =============================================================================
-- 027 — Lock public.profiles.email against self-edit
--
-- Audit finding (critical): RLS visibility for parents/students/teachers is
-- keyed on the caller's email via get_my_email()/get_visible_student_ids()/
-- get_my_teacher_id(), all of which read public.profiles.email. But the
-- self-elevation trigger (006/008) only guarded role + linked_student_id +
-- linked_teacher_id — NOT email. The "profiles update" policy lets a user
-- UPDATE their own row, so a non-admin could rewrite profiles.email to another
-- family's parent_email / a student email / a teacher email and inherit that
-- person's data visibility. profiles.email is meant to mirror auth.users.email
-- (set once by the signup trigger in 002); end users must never change it.
--
-- This migration extends profiles_prevent_self_elevation() to also reject any
-- change to `email` from a non-admin/non-director caller. Admin/director (and
-- SECURITY DEFINER / service_role callers) keep full control so the invite and
-- profile-management flows are unaffected.
-- =============================================================================

create or replace function public.profiles_prevent_self_elevation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Bypass for non-end-user callers (postgres for migrations + SECURITY
  -- DEFINER RPCs, service_role for admin/backend, supabase_admin, etc.).
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  -- Admin / director may change any of these fields on any row.
  if public.get_my_role() in ('admin', 'director') then
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception 'profiles.role can only be changed by admin or director (use claim_director_if_none() for bootstrap)';
  end if;
  if new.email is distinct from old.email then
    raise exception 'profiles.email mirrors auth.users.email and can only be changed by admin or director';
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

-- Trigger already exists (006); CREATE OR REPLACE FUNCTION above is enough.
-- Re-assert it idempotently in case this migration runs on a fresh DB.
drop trigger if exists profiles_prevent_self_elevation_t on public.profiles;
create trigger profiles_prevent_self_elevation_t
  before update on public.profiles
  for each row
  execute function public.profiles_prevent_self_elevation();
