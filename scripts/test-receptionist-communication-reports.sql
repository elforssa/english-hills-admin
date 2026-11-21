-- Receptionist permissions, stage 4 (migration 134, plan RPW-r2, table A items 15 and 23):
-- synthetic local fixtures, fully rolled back. messages.channel (office / portal) is set at insert
-- and never changed; she reads the office's messages only (never family <-> teacher), writes at a
-- known address only, marks read and nothing else, deletes nothing; a family's reply to her
-- message is delivered to her; notifications and announcements read and insert, no edit, no
-- delete; the staff recipient list; director and admin keep their answers; a teacher is unchanged.
\set ON_ERROR_STOP on
begin;

create function pg_temp.ok(v boolean, label text) returns void language plpgsql as $$ begin
  if v is not true then raise exception 'FAIL: %', label; end if;
end $$;
create function pg_temp.id(i integer) returns uuid language sql immutable as $$
  select ('7b734000-0000-4000-8000-' || lpad(to_hex(i), 12, '0'))::uuid $$;
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
-- Rows a statement touched (a restrictive deny filters rows: 0, no error).
create function pg_temp.touched(q text) returns bigint language plpgsql as $$
declare n bigint; begin execute q; get diagnostics n = row_count; return n; end $$;
create function pg_temp.msg(i uuid) returns public.messages language sql security definer as $$
  select * from public.messages where id = i $$;

-- ── Fixture ───────────────────────────────────────────────────────────────
insert into auth.users(id, email, aud, role, email_confirmed_at, created_at, updated_at)
select pg_temp.id(i), 'rpw-c-' || i || '@example.test', 'authenticated', 'authenticated', now(), now(), now()
from generate_series(1, 5) i;
update public.profiles p set role = r.role, full_name = r.name
from (values (1, 'director', 'RPW C director'), (2, 'admin', 'RPW C admin'), (3, 'receptionist', 'RPW C reception'),
  (4, 'teacher', 'RPW C teacher'), (5, 'parent', 'RPW C parent')) r(i, role, name)
where p.id = pg_temp.id(r.i);
insert into public.teachers(id, full_name, email) values (pg_temp.id(200), 'RPW C teacher', 'rpw-c-4@example.test');
update public.profiles set linked_teacher_id = pg_temp.id(200) where id = pg_temp.id(4);
insert into public.groups(id, name, session_type, niveau, annee, capacite_max, teacher_id) values
  (pg_temp.id(100), 'RPW C Yearly C1', 'Yearly', 'Child 1', '2026-2027', 10, pg_temp.id(200));
set local session_replication_role = replica;
insert into public.students(id, full_name, status, session_type, niveau_cefr, parent_email, age_category, groupe_id) values
  (pg_temp.id(300), 'RPW C child', 'Enrolled', 'Yearly', 'Child 1', 'rpw-c-5@example.test', 'Young Learners (6-12)', pg_temp.id(100));
insert into public.enrollments(student_id, status, session_type, level, school_year, group_id) values
  (pg_temp.id(300), 'Validated', 'Yearly', 'Child 1', '2026/2027', pg_temp.id(100));
set local session_replication_role = origin;
insert into public.family_links(student_id, relation, profile_id, invite_email, status, activated_at) values
  (pg_temp.id(300), 'parent', pg_temp.id(5), 'rpw-c-5@example.test', 'active', now());

-- ── Channel rule (the backfill and the insert trigger share it) ─────────────
select pg_temp.ok(portal_security.message_channel(pg_temp.id(4), pg_temp.id(5), 'rpw-c-4@example.test', 'rpw-c-5@example.test') = 'portal',
  'channel: teacher -> family is portal');
select pg_temp.ok(portal_security.message_channel(pg_temp.id(5), pg_temp.id(4), null, null) = 'portal',
  'channel: family -> teacher is portal');
select pg_temp.ok(portal_security.message_channel(pg_temp.id(2), null, 'rpw-c-2@example.test', 'free@example.test') = 'office',
  'channel: admin -> address only is office');
select pg_temp.ok(portal_security.message_channel(null, null, 'rpw-c-1@example.test', 'free@example.test') = 'office',
  'channel: old row from the director address is office');
select pg_temp.ok(portal_security.message_channel(null, null, 'old@example.test', 'older@example.test') = 'portal',
  'channel: an old row with no staff account is portal');
select pg_temp.ok(portal_security.message_channel(pg_temp.id(5), pg_temp.id(3), null, null) = 'office',
  'channel: family -> reception is office');

-- ── Recipients ────────────────────────────────────────────────────────────
select pg_temp.act(3);
select pg_temp.ok(public.can_message_recipient('rpw-c-5@example.test'), 'reception: family account address allowed');
select pg_temp.ok(public.can_message_recipient('rpw-c-4@example.test'), 'reception: teacher address allowed');
select pg_temp.ok(public.can_message_recipient('rpw-c-1@example.test'), 'reception: staff address allowed');
select pg_temp.ok(not public.can_message_recipient('nobody@example.test'), 'reception: unknown address refused');
select pg_temp.ok((select count(*) from public.list_staff_recipients() r where r.id in (pg_temp.id(1), pg_temp.id(2), pg_temp.id(3))) = 3,
  'reception: staff recipients list director, admin and reception');
select pg_temp.ok(not exists (select 1 from public.list_staff_recipients() r where r.id in (pg_temp.id(4), pg_temp.id(5))),
  'reception: staff recipients exclude teacher and family');
select pg_temp.act(4);
select pg_temp.refused($q$select public.can_message_recipient('rpw-c-5@example.test')$q$, '42501', 'teacher: recipient check unchanged');
select pg_temp.refused($q$select * from public.list_staff_recipients()$q$, '42501', 'teacher: no staff recipient list');
select pg_temp.owner();
select pg_temp.ok(portal_security.recipient_for('rpw-c-3@example.test', null) = pg_temp.id(3), 'her address resolves without a learner');
select pg_temp.ok(portal_security.recipient_for('rpw-c-3@example.test', pg_temp.id(300)) = pg_temp.id(3), 'her address resolves with a learner');

-- ── Messages ──────────────────────────────────────────────────────────────
-- A family <-> teacher conversation (portal) and her message to the family (office).
select pg_temp.act(4);
create temporary table c_ids(name text primary key, id uuid) on commit drop;
grant all on c_ids to authenticated;
insert into c_ids select 'teacher_msg', (public.portal_send_message('parent:' || pg_temp.id(300), 'Cours', 'Devoirs de la semaine.'))[1];
select pg_temp.act(3);
insert into public.messages(from_user_email, from_name, to_user_email, to_name, subject, body, type, student_id, channel)
  values ('rpw-c-3@example.test', 'RPW C reception', 'rpw-c-5@example.test', 'Parent', 'Rendez-vous', 'Merci de passer à l’accueil.',
    'message', pg_temp.id(300), 'portal');
insert into c_ids select 'office_msg', id from public.messages where subject = 'Rendez-vous';
select pg_temp.owner();
select pg_temp.ok((pg_temp.msg((select id from c_ids where name = 'teacher_msg'))).channel = 'portal', 'teacher -> family saved as portal');
select pg_temp.ok((pg_temp.msg((select id from c_ids where name = 'office_msg'))).channel = 'office', 'her message saved as office (client value ignored)');
select pg_temp.ok((pg_temp.msg((select id from c_ids where name = 'office_msg'))).recipient_profile_id = pg_temp.id(5), 'her message reaches the family account');
select pg_temp.act(3);
select pg_temp.ok(not exists (select 1 from public.messages where id = (select id from c_ids where name = 'teacher_msg')), 'reception: family <-> teacher hidden');
select pg_temp.ok(exists (select 1 from public.messages where id = (select id from c_ids where name = 'office_msg')), 'reception: office message visible');
select pg_temp.refused($q$insert into public.messages(from_user_email, to_user_email, subject, body)
  values ('rpw-c-3@example.test', 'nobody@example.test', 'X', 'Y')$q$, '42501', 'reception: unknown address refused');
select pg_temp.refused($q$insert into public.messages(from_user_email, to_user_email, subject, body)
  values ('rpw-c-2@example.test', 'rpw-c-5@example.test', 'X', 'Y')$q$, '42501', 'reception: another sender address refused');
-- A family's reply to her message is delivered to her.
select pg_temp.act(5);
insert into c_ids select 'reply', (public.portal_send_message(null, 'Re: Rendez-vous', 'Demain matin.', (select id from c_ids where name = 'office_msg')))[1];
select pg_temp.owner();
select pg_temp.ok((pg_temp.msg((select id from c_ids where name = 'reply'))).recipient_profile_id = pg_temp.id(3), 'family reply delivered to her');
select pg_temp.ok((pg_temp.msg((select id from c_ids where name = 'reply'))).channel = 'office', 'family reply is office');
-- She marks read, nothing else; never deletes; a portal row is out of reach.
select pg_temp.act(3);
select pg_temp.ok(pg_temp.touched($q$update public.messages set read = true where id = (select id from c_ids where name = 'reply')$q$) = 1,
  'reception: read flag on an office row');
select pg_temp.refused($q$update public.messages set subject = 'Changed' where id = (select id from c_ids where name = 'reply')$q$,
  '42501', 'reception: other columns refused');
select pg_temp.ok(pg_temp.touched($q$update public.messages set read = true where id = (select id from c_ids where name = 'teacher_msg')$q$) = 0,
  'reception: portal row not updated');
select pg_temp.ok(pg_temp.touched($q$delete from public.messages where id = (select id from c_ids where name = 'office_msg')$q$) = 0,
  'reception: no delete');
select pg_temp.owner();
select pg_temp.ok((pg_temp.msg((select id from c_ids where name = 'reply'))).subject = 'Re: Rendez-vous', 'subject unchanged');
-- The channel never changes after insert.
update public.messages set channel = 'portal' where id = (select id from c_ids where name = 'office_msg');
select pg_temp.ok((pg_temp.msg((select id from c_ids where name = 'office_msg'))).channel = 'office', 'channel immutable');
-- Management unchanged: reads every row, deletes.
select pg_temp.act(2);
select pg_temp.ok(exists (select 1 from public.messages where id = (select id from c_ids where name = 'teacher_msg')), 'admin: portal row visible');
select pg_temp.ok(pg_temp.touched($q$delete from public.messages where id = (select id from c_ids where name = 'teacher_msg')$q$) = 1,
  'admin: delete unchanged');

-- ── Notifications and announcements ───────────────────────────────────────
select pg_temp.act(3);
insert into public.notifications(type, recipient_email, recipient_name, subject, message, student_id, sent)
  values ('general', 'rpw-c-5@example.test', 'Parent', 'Info', 'Réunion vendredi.', pg_temp.id(300), true);
select pg_temp.ok(exists (select 1 from public.notifications where subject = 'Info'), 'reception: notification read');
select pg_temp.refused($q$insert into public.notifications(type, recipient_email, subject, message)
  values ('general', 'nobody@example.test', 'X', 'Y')$q$, '42501', 'reception: notification to unknown address refused');
select pg_temp.ok(pg_temp.touched($q$update public.notifications set subject = 'Changed' where subject = 'Info'$q$) = 0, 'reception: notification not edited');
select pg_temp.ok(pg_temp.touched($q$delete from public.notifications where subject = 'Info'$q$) = 0, 'reception: notification not deleted');
insert into public.announcements(title, body, audience, author) values ('RPW C annonce', 'Fermeture lundi.', 'all', 'RPW C reception');
select pg_temp.ok(exists (select 1 from public.announcements where title = 'RPW C annonce'), 'reception: announcement read');
select pg_temp.ok(pg_temp.touched($q$update public.announcements set pinned = true where title = 'RPW C annonce'$q$) = 0, 'reception: announcement not edited');
select pg_temp.ok(pg_temp.touched($q$delete from public.announcements where title = 'RPW C annonce'$q$) = 0, 'reception: announcement not deleted');
select pg_temp.act(2);
select pg_temp.ok(pg_temp.touched($q$delete from public.announcements where title = 'RPW C annonce'$q$) = 1, 'admin: announcement delete unchanged');
select pg_temp.owner();

\echo 'PASS receptionist communication (stage 4): office channel, known recipients, read flag only, no delete, family reply delivered'
rollback;
