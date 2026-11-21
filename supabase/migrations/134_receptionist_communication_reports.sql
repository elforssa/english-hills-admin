-- Receptionist permissions, stage 4 (plan RPW-r2, table A items 15, 23, 24, 25, 26).
-- Communication: she e-mails and messages families, teachers and staff at known addresses (never a
-- free address), reads the office's messages (front desk <-> families: an office account and a family,
-- owner decision 2026-11-21) and the messages she sent or received; never staff <-> staff,
-- management <-> teacher or family <-> teacher conversations she is not part of. She reads and
-- writes notifications and announcements, deletes nothing. A family's reply to a message she sent
-- now reaches her. Money views and reports: capability names only (no table or function change);
-- the pages skip every finance and pay read for her. messages gains a `channel` column (office or
-- portal), backfilled once and then set by a trigger at insert, never changed after. Function bodies
-- are the live definitions with only the named lines changed. No online or teacher-portal object changes.
begin;

create or replace function operational_security.capability_roles()
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
    ('edit_enrollment', array['director','admin','receptionist']),
    ('override_capacity', array['director','admin','receptionist']),
    ('place_without_paid_enrollment', array['director','admin','receptionist']),
    ('edit_student_email', array['director','admin','receptionist']),
    ('manage_authorized_adults', array['director','admin','receptionist']),
    ('record_dismissal', array['director','admin','receptionist']),
    ('end_learner', array['director','admin','receptionist']),
    ('reopen_enrollment', array['director','admin','receptionist']),
    ('manage_grades', array['director','admin','receptionist']),
    ('manage_learning_records', array['director','admin','receptionist']),
    ('view_certificates', array['director','admin','receptionist']),
    ('add_teacher', array['director','admin','receptionist']),
    ('view_leave_requests', array['director','admin','receptionist']),
    ('issue_certificates', array['director','admin']),
    ('decide_leave_requests', array['director','admin']),
    ('write_student_records', array['director','admin']),
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
    ('edit_student_programme', array['director','admin','receptionist']),
    ('manage_teacher_hr', array['director','admin']),
    ('delete_academic_records', array['director','admin']),
    ('email_families', array['director','admin','receptionist']),
    ('message_office', array['director','admin','receptionist']),
    ('view_payment_notes', array['director','admin','receptionist']),
    ('view_dashboard', array['director','admin','receptionist']),
    ('view_reports', array['director','admin','receptionist']),
    ('message_any_address', array['director','admin']),
    ('view_portal_conversations', array['director','admin']),
    ('delete_communications', array['director','admin']),
    ('view_finance_corrections', array['director','admin']),
    ('view_teacher_workload', array['director','admin']),
    ('manage_own_account', array['director','admin','receptionist','teacher','parent','student'])
  ) as c(capability, roles)
$$;

-- Item 15 and 23: the recipient check behind every staff message and e-mail, by capability.
CREATE OR REPLACE FUNCTION public.can_message_recipient(p_email text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare v_role text; v_email text := pg_catalog.lower(pg_catalog.btrim(p_email));
begin
  select p.role into v_role from public.profiles p where p.id = auth.uid();
  if v_role is null or operational_security.role_has_capability(v_role, 'email_families') is not true then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  return v_email <> '' and v_email is not null and (
    exists(select 1 from public.profiles p where p.role <> 'pending' and pg_catalog.lower(p.email) = v_email)
    or exists(select 1 from public.students s where pg_catalog.lower(s.email) = v_email or pg_catalog.lower(s.parent_email) = v_email)
    or exists(select 1 from public.teachers x where pg_catalog.lower(x.email) = v_email));
end;
$function$;

-- Item 23: a message to her address resolves to her account, with or without a learner, so a
-- family's reply to her message is delivered (portal_send_message checks the recipient it resolves).
CREATE OR REPLACE FUNCTION portal_security.recipient_for(p_email text, p_student uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
  select p.id from public.profiles p
  where portal_security.norm_email(p_email) is not null
    and portal_security.norm_email(p.email) = portal_security.norm_email(p_email)
    and case when p_student is null then p.role in ('director', 'admin', 'receptionist', 'teacher')
      else portal_security.account_sees(p.id, p_student) end
  order by p.created_at, p.id limit 1
$function$;

CREATE OR REPLACE FUNCTION portal_security.account_sees(p_profile uuid, p_student uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
  select exists (select 1 from public.profiles p where p.id = p_profile and (
    p.role in ('director', 'admin', 'receptionist')
    or (p.role in ('parent', 'student') and exists (select 1 from public.family_links fl
      join public.students s on s.id = fl.student_id
      where fl.profile_id = p.id and fl.student_id = p_student and fl.status = 'active' and s.deleted_at is null
        and fl.relation = case p.role when 'parent' then 'parent' else 'self' end))
    or (p.role = 'teacher' and portal_security.teacher_member(p.linked_teacher_id, p_student))))
$function$;

-- Item 23 (owner decision 2026-11-21): the office's messages are front desk <-> families. A party
-- is « office » (a director, admin or receptionist account), « family » (a parent or student
-- account, else an address a learner's file carries) or « other » (a teacher, an unknown address).
-- The account is found by id, else by address; a teacher record's address is never a family.
create function portal_security.message_party(p_profile uuid, p_email text)
returns text language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select coalesce(
    (select case when p.role in ('director', 'admin', 'receptionist') then 'office'
                 when p.role in ('parent', 'student') then 'family' else 'other' end
       from public.profiles p where p.id = p_profile),
    (select case when p.role in ('director', 'admin', 'receptionist') then 'office'
                 when p.role in ('parent', 'student') then 'family' else 'other' end
       from public.profiles p
       where p_profile is null and portal_security.norm_email(p_email) is not null
         and portal_security.norm_email(p.email) = portal_security.norm_email(p_email)
       order by p.created_at, p.id limit 1),
    case when p_profile is null and portal_security.norm_email(p_email) is not null then
      case when exists (select 1 from public.teachers t where portal_security.norm_email(t.email) = portal_security.norm_email(p_email)) then 'other'
           when exists (select 1 from public.students s where portal_security.norm_email(s.email) = portal_security.norm_email(p_email)
             or portal_security.norm_email(s.parent_email) = portal_security.norm_email(p_email)) then 'family'
      end
    end,
    'other')
$$;
revoke all on function portal_security.message_party(uuid, text) from public, anon, authenticated, service_role;

-- « office » when one party is office and the other a family; otherwise « portal » (family <->
-- teacher, staff <-> staff, management <-> teacher, unknown addresses). She also reads the rows
-- she sent or received herself (policies below).
create function portal_security.message_channel(p_sender uuid, p_recipient uuid, p_from text, p_to text)
returns text language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select case when array[portal_security.message_party(p_sender, p_from), portal_security.message_party(p_recipient, p_to)]
    in (array['office', 'family'], array['family', 'office']) then 'office' else 'portal' end
$$;
revoke all on function portal_security.message_channel(uuid, uuid, text, text) from public, anon, authenticated, service_role;

alter table public.messages add column channel text not null default 'portal'
  constraint messages_channel_check check (channel in ('office', 'portal'));
-- One-time backfill; the update-timestamp trigger is paused so no row looks edited (ADR-009).
alter table public.messages disable trigger set_messages_updated_at;
update public.messages m set channel = 'office'
  where portal_security.message_channel(m.sender_profile_id, m.recipient_profile_id, m.from_user_email, m.to_user_email) = 'office';
alter table public.messages enable trigger set_messages_updated_at;

-- Set at insert from the resolved sender and recipient (this trigger runs after portal_recipient),
-- never changed afterwards by anyone.
create function portal_security.set_message_channel()
returns trigger language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    new.channel := portal_security.message_channel(new.sender_profile_id, new.recipient_profile_id,
      new.from_user_email, new.to_user_email);
  else
    new.channel := old.channel;
  end if;
  return new;
end $$;
revoke all on function portal_security.set_message_channel() from public, anon, authenticated, service_role;
create trigger portal_recipient_zchannel before insert or update on public.messages
  for each row execute function portal_security.set_message_channel();

-- Item 23: she may mark an office message read, nothing else (runs first among the update triggers).
create function operational_security.receptionist_message_read_only()
returns trigger language plpgsql security invoker set search_path = pg_catalog, pg_temp as $$
begin
  if public.get_my_role() = 'receptionist'
    and (to_jsonb(new) - 'read' - 'updated_at') is distinct from (to_jsonb(old) - 'read' - 'updated_at') then
    raise exception 'Only marking a message as read is allowed' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function operational_security.receptionist_message_read_only() from public, anon, authenticated, service_role;
create trigger a_receptionist_message_read_only before update on public.messages
  for each row execute function operational_security.receptionist_message_read_only();

-- Item 23: the staff recipients (names and e-mails of director, admin and receptionist accounts).
create function public.list_staff_recipients()
returns table(id uuid, full_name text, email text, role text)
language plpgsql stable security definer set search_path = pg_catalog, pg_temp as $$
begin
  perform operational_security.require_capability('message_office');
  return query
  select p.id, p.full_name, lower(btrim(p.email)), p.role from public.profiles p
  where p.role in ('director', 'admin', 'receptionist') and nullif(btrim(p.email), '') is not null
  order by p.full_name, p.id
  limit 200;
end $$;
revoke all on function public.list_staff_recipients() from public, anon;
grant execute on function public.list_staff_recipients() to authenticated;

-- Item 23: policies. messages: the office's rows and her own; insert from her address to a known
-- address; read flag only; no delete.
drop policy receptionist_deny on public.messages;
create policy receptionist_office_message_read on public.messages for select to authenticated
  using ((select public.get_my_role()) = 'receptionist'
    and (channel = 'office' or (select auth.uid()) in (sender_profile_id, recipient_profile_id)
      or lower(btrim((select public.get_my_email()))) in (lower(btrim(from_user_email)), lower(btrim(to_user_email)))));
create policy receptionist_office_message_insert on public.messages for insert to authenticated
  with check ((select public.get_my_role()) = 'receptionist'
    and from_user_email = lower(btrim((select public.get_my_email()))) and public.can_message_recipient(to_user_email));
create policy receptionist_office_message_update on public.messages for update to authenticated
  using ((select public.get_my_role()) = 'receptionist'
    and (channel = 'office' or (select auth.uid()) in (sender_profile_id, recipient_profile_id)
      or lower(btrim((select public.get_my_email()))) in (lower(btrim(from_user_email)), lower(btrim(to_user_email)))))
  with check ((select public.get_my_role()) = 'receptionist'
    and (channel = 'office' or (select auth.uid()) in (sender_profile_id, recipient_profile_id)
      or lower(btrim((select public.get_my_email()))) in (lower(btrim(from_user_email)), lower(btrim(to_user_email)))));
create policy receptionist_delete_deny on public.messages as restrictive for delete to authenticated
  using ((select public.get_my_role()) is distinct from 'receptionist');

-- notifications: read and send at a known address; no edit, no delete.
drop policy receptionist_deny on public.notifications;
create policy receptionist_notification_read on public.notifications for select to authenticated
  using ((select public.get_my_role()) = 'receptionist');
create policy receptionist_notification_insert on public.notifications for insert to authenticated
  with check ((select public.get_my_role()) = 'receptionist' and public.can_message_recipient(recipient_email));
create policy receptionist_update_deny on public.notifications as restrictive for update to authenticated
  using ((select public.get_my_role()) is distinct from 'receptionist') with check ((select public.get_my_role()) is distinct from 'receptionist');
create policy receptionist_delete_deny on public.notifications as restrictive for delete to authenticated
  using ((select public.get_my_role()) is distinct from 'receptionist');

-- announcements: read and publish; no edit, no delete.
drop policy receptionist_deny on public.announcements;
create policy receptionist_announcement_read on public.announcements for select to authenticated
  using ((select public.get_my_role()) = 'receptionist');
create policy receptionist_announcement_insert on public.announcements for insert to authenticated
  with check ((select public.get_my_role()) = 'receptionist');
create policy receptionist_update_deny on public.announcements as restrictive for update to authenticated
  using ((select public.get_my_role()) is distinct from 'receptionist') with check ((select public.get_my_role()) is distinct from 'receptionist');
create policy receptionist_delete_deny on public.announcements as restrictive for delete to authenticated
  using ((select public.get_my_role()) is distinct from 'receptionist');

notify pgrst, 'reload schema';
commit;
