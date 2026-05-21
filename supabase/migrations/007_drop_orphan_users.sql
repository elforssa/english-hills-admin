-- =============================================================================
-- 007 — Drop orphan public.users table
--
-- 001_initial_schema.sql created public.users as a Base44-style application
-- users table. 002_profiles_and_auth_trigger.sql superseded it with
-- public.profiles, which is bound to auth.users via the on_auth_user_created
-- trigger and is what the application now uses (entities.js maps the User
-- entity to 'profiles', not 'users'). 006_rls_policies.sql enables RLS on
-- profiles and the 21 other entity tables, but the orphan users table was
-- left RLS-off — meaning any row inserted into it would be readable through
-- the PostgREST anon key.
--
-- The table currently holds no data and is referenced by no foreign keys,
-- so dropping it is safe.
-- =============================================================================

drop table if exists public.users;
