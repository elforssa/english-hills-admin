-- Receptionist permissions, stage 1 (plan RPW-r2, ADR-018): the one capability list.
-- The list below is the database copy of CAPABILITIES in src/lib/roleAccess.mjs; the
-- parity test (scripts/test-capability-parity.mjs) fails when they differ. No outcome
-- changes: every 096 name with a caller answers exactly as before, and the new names mirror
-- the JS entries with their current roles. 'manage_admissions' leaves the list: no function
-- has called it since the /enrollments page was retired, and its JS twin was removed then
-- (scripts/test-navigation.mjs keeps it gone). No public function, policy or online object changes.
begin;

-- The list as data. Later stages re-create this function with their new names.
create function operational_security.capability_roles()
returns table(capability text, roles text[])
language sql immutable security invoker set search_path=pg_catalog,pg_temp as $$
  select c.capability, c.roles from (values
    ('manage_crm', array['director','admin','receptionist']),
    ('manage_placement', array['director','admin','receptionist']),
    ('manage_students', array['director','admin','receptionist']),
    ('manage_groups', array['director','admin','receptionist']),
    ('manage_academics', array['director','admin','receptionist']),
    ('manage_finance_operations', array['director','admin','receptionist']),
    ('manage_teacher_operations', array['director','admin','receptionist']),
    ('assign_group', array['director','admin','receptionist']),
    ('record_attendance', array['director','admin','receptionist']),
    ('edit_teacher_operations', array['director','admin','receptionist']),
    ('manage_student_documents', array['director','admin','receptionist']),
    ('view_help', array['director','admin','receptionist']),
    ('manage_online_lessons', array['director','admin','receptionist']),
    ('manage_online_courses', array['director','admin']),
    ('view_finance_analytics', array['director','admin']),
    ('manage_users', array['director','admin']),
    ('manage_system_settings', array['director','admin']),
    ('view_teacher_compensation', array['director','admin']),
    ('manage_payroll', array['director','admin']),
    ('manage_integrations', array['director']),
    ('view_marketing_analytics', array['director']),
    ('correct_finance', array['director']),
    ('archive_students', array['director','admin']),
    ('import_students', array['director','admin']),
    ('export_students', array['director','admin']),
    ('edit_student_programme', array['director','admin']),
    ('manage_teacher_hr', array['director','admin']),
    ('delete_academic_records', array['director','admin']),
    ('manage_own_account', array['director','admin','receptionist','teacher','parent','student'])
  ) as c(capability, roles)
$$;

create function operational_security.role_has_capability(p_role text, p_capability text)
returns boolean
language sql immutable security invoker set search_path=pg_catalog,pg_temp as $$
  select coalesce((select p_role = any(c.roles) from operational_security.capability_roles() c
    where c.capability = p_capability), false)
$$;

-- Same signature, security mode and search_path as 096; the answer now comes from the list.
create or replace function operational_security.has_capability(p_capability text) returns boolean
language sql stable security definer set search_path=pg_catalog,pg_temp as $$
  select auth.uid() is not null and exists (
    select 1 from public.profiles p where p.id=auth.uid()
      and operational_security.role_has_capability(p.role, p_capability)
  )
$$;

revoke all on function operational_security.capability_roles() from public, anon, authenticated, service_role;
revoke all on function operational_security.role_has_capability(text, text) from public, anon, authenticated, service_role;
revoke all on function operational_security.has_capability(text) from public, anon, authenticated, service_role;

commit;
