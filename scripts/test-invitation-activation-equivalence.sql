-- Invitation activation at sign-in (apply_pending_role), RPW-r2 deviation 8: synthetic local
-- fixtures, fully rolled back. The same file runs on 130 and on 135 and must give the same
-- answers and the same DIGEST line: invitations sent by director and admin (teacher, parent,
-- student, and director's staff invitations) activate exactly as on 130, with the same roles,
-- teacher binding, family links and audit rows; existing sign-ins change nothing; expired,
-- replayed, retargeted, unconfirmed and forged queue rows are refused. Used by the CI step
-- « Invitation activation 130 vs current » (reset --version 130, run, migration up, run, diff).
\set ON_ERROR_STOP on
begin;

create function pg_temp.ok(v boolean, label text) returns void language plpgsql as $$ begin
  if v is not true then raise exception 'FAIL: %', label; end if;
end $$;
create function pg_temp.id(i integer) returns uuid language sql immutable as $$
  select ('7b736000-0000-4000-8000-' || lpad(to_hex(i), 12, '0'))::uuid $$;
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
create function pg_temp.account(i integer, e text, confirmed boolean default true) returns void language sql as $$
  insert into auth.users(id, email, aud, role, email_confirmed_at, created_at, updated_at)
  values (pg_temp.id(i), e, 'authenticated', 'authenticated', case when confirmed then now() end, now(), now()) $$;
-- Sign in as the invitee and apply the queue row (security definer helpers read as the owner).
create function pg_temp.apply(i integer) returns text language plpgsql as $$
declare r text; begin
  perform pg_temp.act(i); r := public.apply_pending_role(); perform pg_temp.owner(); return r;
end $$;
create function pg_temp.role_of(i integer) returns text language sql as $$
  select role from public.profiles where id = pg_temp.id(i) $$;
create function pg_temp.queued(e text) returns bigint language sql as $$
  select count(*) from public.pending_roles where lower(btrim(email)) = e $$;
create function pg_temp.link(s integer, rel text) returns text language sql as $$
  select string_agg(status || ':' || coalesce((profile_id = pg_temp.id(s + 1000))::text, 'none'), ',' order by status)
  from public.family_links where student_id = pg_temp.id(s) and relation = rel $$;

-- ── Fixture: issuers, teacher records, dossiers ───────────────────────────
select pg_temp.account(1, 'act-director@example.test');
select pg_temp.account(2, 'act-admin@example.test');
select pg_temp.account(3, 'act-teacher-issuer@example.test');
select pg_temp.account(4, 'act-existing-parent@example.test');
select pg_temp.account(5, 'act-existing-teacher@example.test');
update public.profiles p set role = r.role, full_name = r.name
from (values (1, 'director', 'ACT director'), (2, 'admin', 'ACT admin'), (3, 'teacher', 'ACT teacher issuer'),
  (4, 'parent', 'ACT existing parent'), (5, 'teacher', 'ACT existing teacher')) r(i, role, name)
where p.id = pg_temp.id(r.i);
update role_security.director_guard set director_count = (select count(*) from public.profiles where role = 'director');
insert into public.teachers(id, full_name, email) values
  (pg_temp.id(201), 'ACT teacher one', 'act-d-teacher@example.test'),
  (pg_temp.id(202), 'ACT teacher two', 'act-a-teacher@example.test');
-- Student s: its invitee account is id s + 1000.
insert into public.students(id, full_name, status, session_type, age_category, email, parent_email) values
  (pg_temp.id(301), 'ACT child D', 'Prospect', 'Yearly', 'Young Learners (6-12)', null, 'act-d-parent@example.test'),
  (pg_temp.id(302), 'ACT teen D', 'Prospect', 'Yearly', 'Teens (13-17)', 'act-d-student@example.test', null),
  (pg_temp.id(303), 'ACT child A', 'Prospect', 'Yearly', 'Young Learners (6-12)', null, 'act-a-parent@example.test'),
  (pg_temp.id(304), 'ACT teen A', 'Prospect', 'Yearly', 'Teens (13-17)', 'act-a-student@example.test', null),
  (pg_temp.id(305), 'ACT child pending', 'Prospect', 'Yearly', 'Young Learners (6-12)', null, 'act-pending-parent@example.test');
-- An account already pending before its invitation (target_user_id is set).
select pg_temp.account(1305, 'act-pending-parent@example.test');

-- ── Director and admin invitations ────────────────────────────────────────
select pg_temp.act(1);
select public.prepare_teacher_invitation('act-d-teacher@example.test', pg_temp.id(201));
select public.prepare_family_invitation('act-d-parent@example.test', 'parent', array[pg_temp.id(301)]);
select public.prepare_family_invitation('act-d-student@example.test', 'student', array[pg_temp.id(302)]);
select public.prepare_role_invitation('act-d-admin@example.test', 'admin');
select public.prepare_role_invitation('act-d-reception@example.test', 'receptionist');
select pg_temp.act(2);
select public.prepare_teacher_invitation('act-a-teacher@example.test', pg_temp.id(202));
select public.prepare_family_invitation('act-a-parent@example.test', 'parent', array[pg_temp.id(303)]);
select public.prepare_family_invitation('act-a-student@example.test', 'student', array[pg_temp.id(304)]);
select public.prepare_family_invitation('act-pending-parent@example.test', 'parent', array[pg_temp.id(305)]);
select pg_temp.owner();

-- The invitees sign up after their invitation, then sign in.
select pg_temp.account(1201, 'act-d-teacher@example.test');
select pg_temp.account(1202, 'act-a-teacher@example.test');
select pg_temp.account(1301, 'act-d-parent@example.test');
select pg_temp.account(1302, 'act-d-student@example.test');
select pg_temp.account(1303, 'act-a-parent@example.test');
select pg_temp.account(1304, 'act-a-student@example.test');
select pg_temp.account(1401, 'act-d-admin@example.test');
select pg_temp.account(1402, 'act-d-reception@example.test');
select pg_temp.ok(pg_temp.apply(1201) = 'teacher', 'director teacher invitation activates');
select pg_temp.ok(pg_temp.apply(1202) = 'teacher', 'admin teacher invitation activates');
select pg_temp.ok(pg_temp.apply(1301) = 'parent', 'director parent invitation activates');
select pg_temp.ok(pg_temp.apply(1302) = 'student', 'director student invitation activates');
select pg_temp.ok(pg_temp.apply(1303) = 'parent', 'admin parent invitation activates');
select pg_temp.ok(pg_temp.apply(1304) = 'student', 'admin student invitation activates');
select pg_temp.ok(pg_temp.apply(1305) = 'parent', 'admin invitation of an already pending account activates');
select pg_temp.ok(pg_temp.apply(1401) = 'admin', 'director admin invitation activates');
select pg_temp.ok(pg_temp.apply(1402) = 'receptionist', 'director receptionist invitation activates');
select pg_temp.ok((select linked_teacher_id from public.profiles where id = pg_temp.id(1201)) = pg_temp.id(201)
  and (select linked_teacher_id from public.profiles where id = pg_temp.id(1202)) = pg_temp.id(202), 'teacher records bound');
select pg_temp.ok(pg_temp.link(301, 'parent') = 'active:true' and pg_temp.link(302, 'self') = 'active:true'
  and pg_temp.link(303, 'parent') = 'active:true' and pg_temp.link(304, 'self') = 'active:true'
  and pg_temp.link(305, 'parent') = 'active:true', 'family links activated for the invitee');
-- Replay: every queue row is one-shot.
select pg_temp.ok(pg_temp.apply(1201) is null and pg_temp.apply(1301) is null and pg_temp.apply(1304) is null, 'no replay');
select pg_temp.ok((select count(*) from public.pending_roles where email like 'act-%') = 0, 'every applied row consumed');

-- ── Existing sign-ins change nothing ──────────────────────────────────────
select pg_temp.ok(pg_temp.apply(4) is null and pg_temp.role_of(4) = 'parent', 'existing parent: no queue row, nothing changes');
select pg_temp.ok(pg_temp.apply(2) is null and pg_temp.role_of(2) = 'admin', 'existing admin: nothing changes');
insert into public.pending_roles(email, role, invited_by, target_user_id, expires_at)
  values ('act-existing-teacher@example.test', 'admin', pg_temp.id(1), pg_temp.id(5), now() + interval '1 day');
select pg_temp.ok(pg_temp.apply(5) is null and pg_temp.role_of(5) = 'teacher'
  and pg_temp.queued('act-existing-teacher@example.test') = 0, 'an active account never takes a queued role');

-- ── Forged, expired, retargeted and unconfirmed rows are refused ──────────
insert into public.pending_roles(email, role, invited_by, target_user_id, expires_at) values
  ('act-expired@example.test', 'parent', pg_temp.id(1), null, now() - interval '1 minute'),
  ('act-retarget@example.test', 'parent', pg_temp.id(1), pg_temp.id(4), now() + interval '1 day'),
  ('act-teacher-forged@example.test', 'parent', pg_temp.id(3), null, now() + interval '1 day'),
  ('act-admin-forged@example.test', 'admin', pg_temp.id(2), null, now() + interval '1 day'),
  ('act-no-issuer@example.test', 'student', null, null, now() + interval '1 day'),
  ('act-unconfirmed@example.test', 'parent', pg_temp.id(1), null, now() + interval '1 day');
select pg_temp.account(1501, 'act-expired@example.test');
select pg_temp.account(1502, 'act-retarget@example.test');
select pg_temp.account(1503, 'act-teacher-forged@example.test');
select pg_temp.account(1504, 'act-admin-forged@example.test');
select pg_temp.account(1505, 'act-no-issuer@example.test');
select pg_temp.account(1506, 'act-unconfirmed@example.test', false);
select pg_temp.ok(pg_temp.apply(1501) is null and pg_temp.role_of(1501) = 'pending', 'expired invitation refused');
select pg_temp.ok(pg_temp.apply(1502) is null and pg_temp.role_of(1502) = 'pending', 'invitation for another account refused');
select pg_temp.ok(pg_temp.apply(1503) is null and pg_temp.role_of(1503) = 'pending', 'teacher-issued row refused');
select pg_temp.ok(pg_temp.apply(1504) is null and pg_temp.role_of(1504) = 'pending', 'admin-issued staff row refused');
select pg_temp.ok(pg_temp.apply(1505) is null and pg_temp.role_of(1505) = 'pending', 'row without issuer refused');
select pg_temp.ok(pg_temp.apply(1506) is null and pg_temp.role_of(1506) = 'pending'
  and pg_temp.queued('act-unconfirmed@example.test') = 1, 'unconfirmed address: nothing applied, row kept');
select pg_temp.ok((select count(*) from public.pending_roles where email like 'act-%') = 1, 'refused rows consumed');

-- ── Digest of every resulting row (ids fixed; times and generated ids left out) ─────────
select md5(concat_ws('|',
  (select string_agg(concat_ws(',', id, role, linked_teacher_id), ';' order by id)
     from public.profiles where id::text like '7b736000-%'),
  (select string_agg(concat_ws(',', student_id, relation, profile_id, invite_email, status, pending_role_id is null), ';'
       order by student_id, relation, status)
     from public.family_links where student_id::text like '7b736000-%'),
  (select string_agg(concat_ws(',', email, role, invited_by, target_user_id), ';' order by email)
     from public.pending_roles where email like 'act-%'),
  (select string_agg(r, ';' order by r) from (select concat_ws(',', actor_id, action, target_table,
       array_to_string(changed_columns, ' '), (after - array['id', 'created_at', 'updated_at', 'activated_at', 'expires_at'])::text) r
     from public.activity_log where actor_id::text like '7b736000-%' and target_table in ('pending_roles', 'family_links', 'profiles')) rows)
)) as digest \gset
\echo DIGEST :digest
\echo 'PASS invitation activation: director and admin invitations, existing sign-ins and refusals as on 130'
rollback;
