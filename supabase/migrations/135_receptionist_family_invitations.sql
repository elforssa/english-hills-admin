-- Receptionist permissions, stage 5 (plan RPW-r2, table A item 7): family invitations from the
-- dossier. She previews and prepares a parent or student invitation for the dossier's address and
-- revokes an active family link; staff and teacher invitations, role changes and account linking
-- stay management (`prepare_role_invitation`, `prepare_teacher_invitation`, `change_user_role`,
-- `link_family_student`, `link_teacher_account` unchanged). `role_security.assert_transition` is
-- not widened: `queue_role_invitation` gains a family-only branch for her, and `apply_pending_role`
-- accepts her parent or student queue row at the invitee's sign-in. Function bodies are the
-- live definitions (123) with only the named lines changed. No online or teacher-portal object changes.
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
    ('invite_family', array['director','admin','receptionist']),
    ('message_any_address', array['director','admin']),
    ('view_portal_conversations', array['director','admin']),
    ('delete_communications', array['director','admin']),
    ('view_finance_corrections', array['director','admin']),
    ('view_teacher_workload', array['director','admin']),
    ('manage_own_account', array['director','admin','receptionist','teacher','parent','student'])
  ) as c(capability, roles)
$$;

-- The family-invitation gate: director, admin and receptionist (capability invite_family).
create function portal_security.require_family_inviter() returns text
language plpgsql stable security definer set search_path = pg_catalog, pg_temp as $$
declare v_role text;
begin
  select p.role into v_role from public.profiles p where p.id = auth.uid();
  if auth.uid() is null or v_role is null or operational_security.role_has_capability(v_role, 'invite_family') is not true then
    perform portal_security.fail('forbidden', '42501', 'Action réservée à la direction, à l’administration et à l’accueil.');
  end if;
  return v_role;
end $$;
revoke all on function portal_security.require_family_inviter() from public, anon, authenticated, service_role;

create or replace function portal_security.queue_role_invitation(p_email text, p_role text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$ declare
  actor_role text; target public.profiles%rowtype;
  normalized_email text := lower(btrim(p_email)); queue_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if normalized_email is null or length(normalized_email) > 254 or normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Invalid email' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('portal.invite:' || normalized_email, 0));
  update role_security.director_guard set director_count = director_count where singleton;
  select role into actor_role from public.profiles where id = auth.uid();
  -- Auth email is authoritative. Refuse profile/Auth disagreement, not a
  -- second invitation that could later attach to the wrong identity.
  if exists (select 1 from public.profiles p join auth.users u on u.id=p.id
    where (lower(btrim(p.email))=normalized_email or lower(btrim(u.email))=normalized_email)
    and lower(btrim(p.email)) is distinct from lower(btrim(u.email))) then
    raise exception 'Account email requires reconciliation' using errcode = '23514';
  end if;
  select p.* into target from public.profiles p join auth.users u on u.id=p.id
    where lower(btrim(u.email)) = normalized_email for update of p;
  -- Review N1: her family invitation never replaces a pending staff or teacher invitation.
  if actor_role = 'receptionist' and exists (
    select 1 from public.pending_roles where lower(btrim(email))=normalized_email and role not in ('parent', 'student')
  ) then
    perform portal_security.fail('staff_invitation_pending', 'PT409',
      'Une invitation du personnel est déjà en attente à cette adresse. Seule la direction ou l’administration peut la remplacer.');
  end if;
  if actor_role is distinct from 'director' and exists (
    select 1 from public.pending_roles where lower(btrim(email))=normalized_email and role='receptionist'
  ) then raise exception 'Director required for receptionist invitation' using errcode='42501'; end if;
  -- RPW-r2 item 7: reception invites families only (parent or student, a new or same-role
  -- account, at an address a learner's dossier carries); assert_transition is not widened.
  if actor_role = 'receptionist' then
    if p_role is null or p_role not in ('parent', 'student')
      or coalesce(target.role, 'pending') not in ('pending', 'parent', 'student')
      or cardinality(portal_security.family_matches(normalized_email, p_role)) = 0 then
      raise exception 'Forbidden role transition' using errcode = '42501';
    end if;
  else
    perform role_security.assert_transition(actor_role, coalesce(target.role, 'pending'), p_role);
  end if;
  if target.id is not null and target.role <> 'pending' then
    if target.role <> p_role then
      raise exception 'Use explicit role management for an existing account' using errcode = '23514';
    end if;
    delete from public.pending_roles where lower(btrim(email)) = normalized_email;
    return jsonb_build_object('success', true, 'alreadyRegistered', true, 'needsDelivery', false,
      'userId', target.id, 'role', target.role, 'email', normalized_email);
  end if;
  insert into public.pending_roles(email,role,invited_by,target_user_id,expires_at)
    values(normalized_email,p_role,auth.uid(),target.id,now()+interval '7 days')
    on conflict (lower(btrim(email))) do update set role=excluded.role,
      invited_by=excluded.invited_by, target_user_id=excluded.target_user_id,
      expires_at=excluded.expires_at, teacher_id=null
    returning id into queue_id;
  delete from public.family_links where pending_role_id = queue_id and status = 'pending';
  insert into public.activity_log(actor_id,action,target_table,target_id,changed_columns,after)
    values(auth.uid(),'INSERT','pending_roles',queue_id,array['role','invited_by','target_user_id','expires_at'],
      jsonb_build_object('role',p_role,'invited_by',auth.uid(),'target_user_id',target.id));
  return jsonb_build_object('success',true,'alreadyRegistered',target.id is not null,
    'needsDelivery',not exists(select 1 from auth.users where id=target.id and email_confirmed_at is not null),
    'userId',target.id,'role',p_role,'email',normalized_email,'queueId',queue_id);
end $$;

-- Consumption (123:922): the invitee's sign-in reauthorizes the issuer. A receptionist's queue row
-- activates for parent or student only, while she holds invite_family; every other line unchanged.
CREATE OR REPLACE FUNCTION public.apply_pending_role()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$ declare target public.profiles%rowtype; queued public.pending_roles%rowtype;
  issuer_role text; verified_email text; pending public.family_links%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  update role_security.director_guard set director_count = director_count where singleton;
  select * into target from public.profiles where id=auth.uid() for update;
  select email into verified_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
  if target.id is null or verified_email is null
    or lower(btrim(target.email)) is distinct from lower(btrim(verified_email)) then return null; end if;
  select * into queued from public.pending_roles where lower(btrim(email))=lower(btrim(verified_email)) for update;
  if queued.id is null then return null; end if;
  select role into issuer_role from public.profiles where id=queued.invited_by;
  -- One-shot, pending-only, identity-bound and reauthorized at consumption.
  if target.role <> 'pending' or queued.invited_by is null or queued.expires_at is null
    or queued.expires_at <= now() or (queued.target_user_id is not null and queued.target_user_id <> target.id)
    or (issuer_role='director' or (issuer_role='admin' and queued.role in ('student','parent','teacher'))
      or (issuer_role='receptionist' and queued.role in ('student','parent')
        and operational_security.role_has_capability(issuer_role, 'invite_family'))) is not true then
    delete from public.pending_roles where id=queued.id;
    return null;
  end if;
  -- RPW-r2 item 7: her queue row passed the family-only check in queue_role_invitation;
  -- role_security.assert_transition is not widened for her.
  if issuer_role is distinct from 'receptionist' then
    perform role_security.assert_transition(issuer_role,target.role,queued.role);
  end if;
  update public.profiles set role=queued.role where id=target.id;
  -- Portal links: activate this queue row's pending links of the matching
  -- relation, detached from the queue row before it is deleted. A link that no
  -- longer passes its checks stays pending and goes with the queue row.
  if queued.role in ('parent','student') then
    for pending in select * from public.family_links where pending_role_id = queued.id and status = 'pending'
        and relation = case queued.role when 'parent' then 'parent' else 'self' end order by created_at, id loop
      begin
        perform portal_security.activate_link(target.id, pending.student_id, pending.relation, pending.invite_email, pending.id);
      exception when sqlstate 'PT409' or sqlstate '42501' or sqlstate '22023' then null;
      end;
    end loop;
  elsif queued.role = 'teacher' and queued.teacher_id is not null
    and exists (select 1 from public.teachers t where t.id = queued.teacher_id and t.deleted_at is null)
    and not exists (select 1 from public.profiles p where p.linked_teacher_id = queued.teacher_id and p.id <> target.id) then
    update public.profiles set linked_teacher_id = queued.teacher_id where id = target.id;
  end if;
  delete from public.pending_roles where id=queued.id;
  insert into public.activity_log(actor_id,action,target_table,target_id,changed_columns,after)
    values(auth.uid(),'DELETE','pending_roles',queued.id,array['role'],
      jsonb_build_object('activated_role',queued.role,'authorized_by',queued.invited_by));
  return queued.role;
end $function$;

create or replace function public.preview_family_invitation(p_email text, p_role text) returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, pg_temp as $$
declare v_email text := portal_security.norm_email(p_email); v_matches uuid[]; v_hint text; v_message text; v_refusal jsonb;
begin
  perform portal_security.require_family_inviter();
  v_matches := portal_security.family_matches(v_email, p_role);
  begin
    perform portal_security.check_family_address(v_email, p_role);
    if p_role = 'student' and cardinality(v_matches) > 0 then
      perform portal_security.check_family_selection(v_email, p_role, v_matches);
    end if;
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint, v_message = message_text;
    if coalesce(v_hint, '') not like 'portal.%' then raise; end if;
    v_refusal := jsonb_build_object('reason', v_hint, 'message', v_message);
  end;
  return jsonb_build_object(
    'refusal', v_refusal,
    'matches', coalesce((select jsonb_agg(jsonb_build_object('student_id', s.id, 'full_name', s.full_name,
        'age_category', s.age_category, 'status', s.status,
        'groups', coalesce((select jsonb_agg(g.name order by g.name) from public.groups g
          where academic_security.is_group_member(s.id, g.id)), '[]'::jsonb),
        'linked', exists (select 1 from public.family_links fl where fl.student_id = s.id and fl.status = 'active'
          and fl.relation = case p_role when 'parent' then 'parent' else 'self' end))
      order by s.full_name, s.id) from public.students s where s.id = any(v_matches)), '[]'::jsonb),
    'mixed_surnames', (select count(distinct lower(regexp_replace(btrim(s.full_name), '^.*\s', ''))) > 1
      from public.students s where s.id = any(v_matches)),
    'mixed_phones', (select count(distinct regexp_replace(s.telephone, '\D', '', 'g')) > 1
      from public.students s where s.id = any(v_matches) and nullif(regexp_replace(s.telephone, '\D', '', 'g'), '') is not null));
end $$;

create or replace function public.prepare_family_invitation(p_email text, p_role text, p_student_ids uuid[]) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_email text := portal_security.norm_email(p_email); v_selected uuid[]; v_result jsonb; v_queue uuid;
  v_relation text := case p_role when 'parent' then 'parent' else 'self' end; v_links jsonb := '[]'::jsonb; v_id uuid; sid uuid;
begin
  perform portal_security.require_family_inviter();
  if v_email is null or not pg_try_advisory_xact_lock(hashtextextended('portal.invite:' || v_email, 0)) then
    if v_email is null then perform portal_security.fail('invalid_email', '22023', 'Adresse e-mail invalide.'); end if;
    perform portal_security.fail('stale', 'PT409', 'Une autre invitation de cette adresse est en cours. Rechargez.');
  end if;
  v_selected := portal_security.check_family_selection(v_email, p_role, p_student_ids);
  v_result := portal_security.queue_role_invitation(v_email, p_role);
  v_queue := (v_result->>'queueId')::uuid;
  foreach sid in array v_selected loop
    if v_queue is not null then
      insert into public.family_links(student_id, relation, invite_email, pending_role_id, status, created_by)
      values (sid, v_relation, v_email, v_queue, 'pending', auth.uid()) returning id into v_id;
      perform portal_security.log('INSERT', 'family_links', v_id,
        jsonb_build_object('student_id', sid, 'relation', v_relation, 'status', 'pending'));
      v_links := v_links || jsonb_build_object('id', v_id, 'student_id', sid, 'status', 'pending');
    else
      -- The account already holds this role: the links are active at once.
      v_id := portal_security.activate_link((v_result->>'userId')::uuid, sid, v_relation, v_email);
      v_links := v_links || jsonb_build_object('id', v_id, 'student_id', sid, 'status', 'active');
    end if;
  end loop;
  return (v_result - 'queueId') || jsonb_build_object('links', v_links);
end $$;

create or replace function public.revoke_family_link(p_link_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare v_link public.family_links%rowtype;
begin
  perform portal_security.require_family_inviter();
  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 200 then
    perform portal_security.fail('invalid_reason', '22023', 'Indiquez un motif (200 caractères au plus).');
  end if;
  select * into v_link from public.family_links where id = p_link_id for update;
  if v_link.id is null or v_link.status <> 'active' then
    perform portal_security.fail('link_not_active', 'PT409', 'Cet accès n’est plus actif. Rechargez.');
  end if;
  update public.family_links set status = 'revoked', revoked_by = auth.uid(), revoked_at = now(),
    revoke_reason = btrim(p_reason) where id = p_link_id;
  perform portal_security.log('UPDATE', 'family_links', p_link_id,
    jsonb_build_object('student_id', v_link.student_id, 'relation', v_link.relation, 'status', 'revoked'));
  return jsonb_build_object('id', p_link_id, 'status', 'revoked');
end $$;

notify pgrst, 'reload schema';
commit;
