-- Receptionist permissions, stage 5 (migration 135, plan RPW-r2, table A item 7): synthetic local
-- fixtures, fully rolled back. She previews and prepares a parent or student invitation for the
-- dossier's address and revokes an active link; another address, a teacher or staff address, a
-- staff or teacher invitation and a role change stay refused; role_security.assert_transition is
-- unchanged (change_user_role refused for her); a teacher stays refused; admin keeps its answers.
\set ON_ERROR_STOP on
begin;

create function pg_temp.ok(v boolean, label text) returns void language plpgsql as $$ begin
  if v is not true then raise exception 'FAIL: %', label; end if;
end $$;
create function pg_temp.id(i integer) returns uuid language sql immutable as $$
  select ('7b735000-0000-4000-8000-' || lpad(to_hex(i), 12, '0'))::uuid $$;
create function pg_temp.act(i integer) returns void language plpgsql as $$ begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', pg_temp.id(i)::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', pg_temp.id(i), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.owner() returns void language plpgsql as $$ begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
end $$;
create function pg_temp.refused(q text, st text, label text) returns void language plpgsql as $$
declare s text; m text; begin
  begin
    execute q;
  exception when others then
    get stacked diagnostics s = returned_sqlstate, m = message_text;
    if s is distinct from st then raise exception 'FAIL: % raised % / %', label, s, m; end if;
    return;
  end;
  raise exception 'FAIL: % was accepted', label;
end $$;
create function pg_temp.queued(e text) returns text language sql security definer as $$
  select role from public.pending_roles where lower(btrim(email)) = e $$;
create function pg_temp.links(s uuid, st text) returns bigint language sql security definer as $$
  select count(*) from public.family_links where student_id = s and status = st $$;
create function pg_temp.role_of(i uuid) returns text language sql security definer as $$
  select role from public.profiles where id = i $$;

-- ── Fixture ───────────────────────────────────────────────────────────────
insert into auth.users(id, email, aud, role, email_confirmed_at, created_at, updated_at)
select pg_temp.id(i), 'rpw-f-' || i || '@example.test', 'authenticated', 'authenticated', now(), now(), now()
from generate_series(1, 5) i;
update public.profiles p set role = r.role, full_name = r.name
from (values (1, 'director', 'RPW F director'), (2, 'admin', 'RPW F admin'), (3, 'receptionist', 'RPW F reception'),
  (4, 'teacher', 'RPW F teacher'), (5, 'parent', 'RPW F linked parent')) r(i, role, name)
where p.id = pg_temp.id(r.i);
insert into public.teachers(id, full_name, email) values (pg_temp.id(200), 'RPW F teacher record', 'teacher.200@example.test');
insert into public.students(id, full_name, status, session_type, age_category, email, parent_email) values
  (pg_temp.id(300), 'RPW F child', 'Prospect', 'Yearly', 'Young Learners (6-12)', null, 'parent.300@example.test'),
  (pg_temp.id(301), 'RPW F teen', 'Prospect', 'Yearly', 'Teens (13-17)', 'teen.301@example.test', 'parent.301@example.test'),
  (pg_temp.id(302), 'RPW F linked', 'Prospect', 'Yearly', 'Young Learners (6-12)', null, 'rpw-f-5@example.test'),
  (pg_temp.id(303), 'RPW F teacher address', 'Prospect', 'Yearly', 'Teens (13-17)', 'teacher.200@example.test', null),
  (pg_temp.id(304), 'RPW F staff pending', 'Prospect', 'Yearly', 'Young Learners (6-12)', null, 'staff.pending@example.test'),
  (pg_temp.id(305), 'RPW F teacher pending', 'Prospect', 'Yearly', 'Young Learners (6-12)', null, 'teacher.pending@example.test');
insert into public.family_links(student_id, relation, profile_id, invite_email, status, activated_at) values
  (pg_temp.id(302), 'parent', pg_temp.id(5), 'rpw-f-5@example.test', 'active', now());

-- ── Reception: family invitations at the dossier's address ────────────────
select pg_temp.act(3);
select pg_temp.ok(jsonb_array_length(public.preview_family_invitation('parent.300@example.test', 'parent')->'matches') = 1,
  'reception: preview of the dossier parent address');
select public.prepare_family_invitation('parent.300@example.test', 'parent', array[pg_temp.id(300)]);
select public.prepare_family_invitation('teen.301@example.test', 'student', array[pg_temp.id(301)]);
select pg_temp.owner();
select pg_temp.ok(pg_temp.queued('parent.300@example.test') = 'parent', 'parent invitation queued');
select pg_temp.ok(pg_temp.queued('teen.301@example.test') = 'student', 'student invitation queued');
select pg_temp.ok(pg_temp.links(pg_temp.id(300), 'pending') = 1 and pg_temp.links(pg_temp.id(301), 'pending') = 1, 'pending links created');
select pg_temp.act(3);
select pg_temp.refused($q$select public.prepare_family_invitation('other@example.test', 'parent', array[pg_temp.id(300)])$q$,
  '22023', 'reception: an address no dossier carries');
select pg_temp.refused($q$select public.prepare_family_invitation('parent.301@example.test', 'parent', array[pg_temp.id(300)])$q$,
  '22023', 'reception: another learner''s address');
select pg_temp.refused($q$select public.prepare_family_invitation('teacher.200@example.test', 'student', array[pg_temp.id(303)])$q$,
  '42501', 'reception: a teacher record address');
select pg_temp.refused($q$select public.prepare_family_invitation('rpw-f-2@example.test', 'parent', array[pg_temp.id(300)])$q$,
  '42501', 'reception: a staff address');
select pg_temp.refused($q$select public.prepare_family_invitation('parent.300@example.test', 'student', array[pg_temp.id(300)])$q$,
  '22023', 'reception: a child has no learner account (no dossier carries it as a learner address)');
-- Staff and teacher invitations and role changes stay management (assert_transition unchanged).
select pg_temp.refused($q$select public.prepare_role_invitation('new.teacher@example.test', 'teacher')$q$, '42501', 'reception: teacher invitation');
select pg_temp.refused($q$select public.prepare_role_invitation('new.admin@example.test', 'admin')$q$, '42501', 'reception: staff invitation');
select pg_temp.refused($q$select public.prepare_role_invitation('new.parent@example.test', 'parent')$q$, '42501', 'reception: generic family invitation');
select pg_temp.refused($q$select public.prepare_teacher_invitation('teacher.200@example.test', pg_temp.id(200))$q$, '42501', 'reception: teacher account invitation');
select pg_temp.refused($q$select public.change_user_role(pg_temp.id(5), 'admin')$q$, '42501', 'reception: role change');
select pg_temp.refused($q$select public.change_user_role(pg_temp.id(5), 'student')$q$, '42501', 'reception: family role change');
-- Review N1: her invitation never replaces a pending staff or teacher invitation (clear French refusal).
select pg_temp.act(1);
select public.prepare_role_invitation('staff.pending@example.test', 'admin');
select pg_temp.owner();
insert into public.pending_roles(email, role, invited_by, expires_at)
  values ('teacher.pending@example.test', 'teacher', pg_temp.id(2), now() + interval '7 days');
select pg_temp.act(3);
do $$ declare e record; st text; h text; m text; begin
  for e in select * from (values ('staff.pending@example.test', pg_temp.id(304)), ('teacher.pending@example.test', pg_temp.id(305))) v(email, sid) loop
    begin
      perform public.prepare_family_invitation(e.email, 'parent', array[e.sid]);
      raise exception 'FAIL: reception replaced the pending invitation at %', e.email;
    exception when others then
      get stacked diagnostics st = returned_sqlstate, h = pg_exception_hint, m = message_text;
      if st is distinct from 'PT409' or h is distinct from 'portal.staff_invitation_pending'
        or m is distinct from 'Une invitation du personnel est déjà en attente à cette adresse. Seule la direction ou l’administration peut la remplacer.' then
        raise exception 'FAIL: N1 % raised % / % / %', e.email, st, h, m;
      end if;
    end;
  end loop;
end $$;
select pg_temp.owner();
select pg_temp.ok(pg_temp.queued('staff.pending@example.test') = 'admin' and pg_temp.queued('teacher.pending@example.test') = 'teacher',
  'N1: the pending staff and teacher invitations are kept');
select pg_temp.ok(pg_temp.links(pg_temp.id(304), 'pending') = 0 and pg_temp.links(pg_temp.id(305), 'pending') = 0, 'N1: no family link created');
-- Management unchanged: the admin may still replace it (logged, as on 130).
select pg_temp.act(2);
select public.prepare_family_invitation('teacher.pending@example.test', 'parent', array[pg_temp.id(305)]);
select pg_temp.owner();
select pg_temp.ok(pg_temp.queued('teacher.pending@example.test') = 'parent', 'N1: admin replacement unchanged');
select pg_temp.act(3);
-- She revokes an active link with a reason.
select public.revoke_family_link((select id from public.list_family_links(pg_temp.id(302)) where status = 'active' limit 1), 'RPW F départ');
select pg_temp.owner();
select pg_temp.ok(pg_temp.links(pg_temp.id(302), 'revoked') = 1, 'reception: link revoked');
select pg_temp.ok(pg_temp.role_of(pg_temp.id(5)) = 'parent', 'revoking a link never changes the role');

-- ── Her invitations activate at the invitee's first sign-in (apply_pending_role) ──
insert into auth.users(id, email, aud, role, email_confirmed_at, created_at, updated_at) values
  (pg_temp.id(6), 'parent.300@example.test', 'authenticated', 'authenticated', now(), now(), now()),
  (pg_temp.id(7), 'teen.301@example.test', 'authenticated', 'authenticated', now(), now(), now()),
  (pg_temp.id(8), 'forged.reception@example.test', 'authenticated', 'authenticated', now(), now(), now()),
  (pg_temp.id(9), 'forged.teacher@example.test', 'authenticated', 'authenticated', now(), now(), now());
select pg_temp.ok(pg_temp.role_of(pg_temp.id(6)) = 'pending' and pg_temp.role_of(pg_temp.id(7)) = 'pending', 'invitees start pending');
select pg_temp.act(6);
select pg_temp.ok(public.apply_pending_role() = 'parent', 'reception parent invitation activates');
select pg_temp.ok(public.apply_pending_role() is null, 'reception parent invitation: no replay');
select pg_temp.act(7);
select pg_temp.ok(public.apply_pending_role() = 'student', 'reception student invitation activates');
select pg_temp.owner();
select pg_temp.ok(pg_temp.role_of(pg_temp.id(6)) = 'parent' and pg_temp.role_of(pg_temp.id(7)) = 'student', 'invitee roles applied');
select pg_temp.ok(pg_temp.links(pg_temp.id(300), 'active') = 1 and pg_temp.links(pg_temp.id(301), 'active') = 1
  and pg_temp.links(pg_temp.id(300), 'pending') = 0, 'reception invitation links activated');
-- A queue row in her name for anything but a family role is dropped at sign-in (never applied).
insert into public.pending_roles(email, role, invited_by, expires_at)
  values ('forged.reception@example.test', 'admin', pg_temp.id(3), now() + interval '1 day');
select pg_temp.act(8);
select pg_temp.ok(public.apply_pending_role() is null, 'reception queue row for a staff role is refused at sign-in');
select pg_temp.owner();
select pg_temp.ok(pg_temp.role_of(pg_temp.id(8)) = 'pending' and pg_temp.queued('forged.reception@example.test') is null,
  'the refused row is consumed and the account stays pending');
insert into public.pending_roles(email, role, invited_by, expires_at)
  values ('forged.teacher@example.test', 'teacher', pg_temp.id(3), now() + interval '1 day');
select pg_temp.act(9);
select pg_temp.ok(public.apply_pending_role() is null, 'reception queue row for the teacher role is refused at sign-in');
select pg_temp.owner();
select pg_temp.ok(pg_temp.role_of(pg_temp.id(9)) = 'pending' and pg_temp.queued('forged.teacher@example.test') is null,
  'the refused teacher row is consumed and the account stays pending');

-- ── A teacher stays refused; admin unchanged ──────────────────────────────
select pg_temp.act(4);
select pg_temp.refused($q$select public.preview_family_invitation('parent.301@example.test', 'parent')$q$, '42501', 'teacher: no preview');
select pg_temp.refused($q$select public.prepare_family_invitation('parent.301@example.test', 'parent', array[pg_temp.id(301)])$q$, '42501', 'teacher: no invitation');
select pg_temp.act(2);
select public.prepare_family_invitation('parent.301@example.test', 'parent', array[pg_temp.id(301)]);
select public.prepare_teacher_invitation('teacher.200@example.test', pg_temp.id(200));
select pg_temp.owner();
select pg_temp.ok(pg_temp.queued('parent.301@example.test') = 'parent', 'admin: family invitation unchanged');
select pg_temp.ok(pg_temp.queued('teacher.200@example.test') = 'teacher', 'admin: teacher invitation unchanged');

\echo 'PASS receptionist family invitations (stage 5): dossier address only, family roles only, never over a pending staff or teacher invitation (N1), forged admin and teacher rows refused, activation at sign-in, revoke, assert_transition unchanged'
rollback;
