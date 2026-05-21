-- =============================================================================
-- 002 — Replace public.users with public.profiles, linked to auth.users
--
-- Step 1 (migration 001) created public.users with an independent uuid PK as
-- a 1:1 port of the Base44 User entity. We now refactor to the canonical
-- Supabase pattern: a public.profiles table whose id IS the auth.users id,
-- auto-populated by a trigger on auth.users insert.
--
-- Note on the `pending` role: the migration spec lists six application roles
-- in the CHECK constraint AND requires creating new profiles with role
-- 'pending'. Both directives cannot hold without listing 'pending' as an
-- allowed value, so it is included here.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Drop the temporary users table (empty, no inbound FKs in migration 001)
-- -----------------------------------------------------------------------------
drop trigger if exists set_users_updated_at on public.users;
drop table  if exists public.users;

-- -----------------------------------------------------------------------------
-- profiles — application user data, keyed on auth.users.id
-- -----------------------------------------------------------------------------
create table public.profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  email               text,
  full_name           text,
  role                text not null default 'pending' check (role in (
    'admin','director','teacher','parent','student','receptionist','pending'
  )),
  linked_student_id   uuid references public.students(id) on delete set null,
  linked_teacher_id   uuid references public.teachers(id) on delete set null,
  phone               text
);

-- Apply the standard updated_at trigger.
create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- handle_new_auth_user — runs after each auth.users insert and ensures a
-- matching profiles row exists. Pulls email and full_name from the auth
-- record. Idempotent (ON CONFLICT DO NOTHING) so manual back-fills won't
-- collide with future auth signups.
--
-- SECURITY DEFINER lets the trigger write to public.profiles regardless of
-- the role that triggered the auth.users insert (e.g. anon during magic-link
-- signup, service_role during admin invites).
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    'pending'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_auth_user();
