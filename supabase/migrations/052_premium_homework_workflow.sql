-- Phase 4: secure pre-class Premium homework submissions and teacher prep inbox.

begin;

create table if not exists public.premium_homework_submissions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  premium_session_id uuid not null unique references public.premium_sessions(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete restrict,
  teacher_id uuid not null references public.teachers(id) on delete restrict,
  title text not null,
  student_note text,
  file_url text,
  file_name text,
  status text not null default 'Submitted',
  teacher_note text,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  constraint premium_homework_title_length_check check (char_length(btrim(title)) between 2 and 160),
  constraint premium_homework_student_note_length_check check (student_note is null or char_length(student_note) <= 4000),
  constraint premium_homework_teacher_note_length_check check (teacher_note is null or char_length(teacher_note) <= 4000),
  constraint premium_homework_status_check check (status in ('Submitted', 'Reviewed', 'Prepared'))
);

create index if not exists premium_homework_teacher_status_idx
  on public.premium_homework_submissions (teacher_id, status, submitted_at desc);

alter table public.premium_homework_submissions enable row level security;

drop policy if exists "premium homework admin all" on public.premium_homework_submissions;
create policy "premium homework admin all" on public.premium_homework_submissions for all
  to authenticated
  using (public.get_my_role() in ('admin', 'director'))
  with check (public.get_my_role() in ('admin', 'director'));

drop policy if exists "premium homework teacher read" on public.premium_homework_submissions;
create policy "premium homework teacher read" on public.premium_homework_submissions for select
  to authenticated
  using (public.get_my_role() = 'teacher' and teacher_id = public.get_my_teacher_id());

drop policy if exists "premium homework teacher update" on public.premium_homework_submissions;
create policy "premium homework teacher update" on public.premium_homework_submissions for update
  to authenticated
  using (public.get_my_role() = 'teacher' and teacher_id = public.get_my_teacher_id())
  with check (public.get_my_role() = 'teacher' and teacher_id = public.get_my_teacher_id());

drop policy if exists "premium homework student read" on public.premium_homework_submissions;
create policy "premium homework student read" on public.premium_homework_submissions for select
  to authenticated
  using (public.get_my_role() = 'student' and student_id in (select public.get_visible_student_ids()));

drop policy if exists "premium homework student insert" on public.premium_homework_submissions;
create policy "premium homework student insert" on public.premium_homework_submissions for insert
  to authenticated
  with check (public.get_my_role() = 'student' and student_id in (select public.get_visible_student_ids()));

drop policy if exists "premium homework student update" on public.premium_homework_submissions;
create policy "premium homework student update" on public.premium_homework_submissions for update
  to authenticated
  using (public.get_my_role() = 'student' and student_id in (select public.get_visible_student_ids()))
  with check (public.get_my_role() = 'student' and student_id in (select public.get_visible_student_ids()));

drop policy if exists "premium homework parent read" on public.premium_homework_submissions;
create policy "premium homework parent read" on public.premium_homework_submissions for select
  to authenticated
  using (public.get_my_role() = 'parent' and student_id in (select public.get_visible_student_ids()));

drop policy if exists "premium homework parent insert" on public.premium_homework_submissions;
create policy "premium homework parent insert" on public.premium_homework_submissions for insert
  to authenticated
  with check (public.get_my_role() = 'parent' and student_id in (select public.get_visible_student_ids()));

drop policy if exists "premium homework parent update" on public.premium_homework_submissions;
create policy "premium homework parent update" on public.premium_homework_submissions for update
  to authenticated
  using (public.get_my_role() = 'parent' and student_id in (select public.get_visible_student_ids()))
  with check (public.get_my_role() = 'parent' and student_id in (select public.get_visible_student_ids()));

create or replace function public.guard_premium_homework_write()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
  linked_student uuid;
  linked_teacher uuid;
  linked_date date;
  linked_status text;
  caller_role text := public.get_my_role();
begin
  select session.student_id, session.teacher_id, session.scheduled_date, session.status
    into linked_student, linked_teacher, linked_date, linked_status
  from public.premium_sessions session
  where session.id = new.premium_session_id;

  if not found or linked_status = 'Cancelled' then
    raise exception 'A valid Premium session is required.';
  end if;

  if tg_op = 'INSERT' then
    new.student_id := linked_student;
    new.teacher_id := linked_teacher;
    new.status := 'Submitted';
    new.teacher_note := null;
    new.reviewed_at := null;
    new.submitted_at := now();
  elsif caller_role in ('student', 'parent') then
    if (new.premium_session_id, new.student_id, new.teacher_id)
       is distinct from
       (old.premium_session_id, old.student_id, old.teacher_id) then
      raise exception 'Learners may update only their submission content.';
    end if;
    new.status := 'Submitted';
    new.teacher_note := null;
    new.reviewed_at := null;
    new.submitted_at := now();
  elsif caller_role = 'teacher' then
    if (new.premium_session_id, new.student_id, new.teacher_id, new.title, new.student_note, new.file_url, new.file_name)
       is distinct from
       (old.premium_session_id, old.student_id, old.teacher_id, old.title, old.student_note, old.file_url, old.file_name) then
      raise exception 'Teachers may update only preparation fields.';
    end if;
    if new.status in ('Reviewed', 'Prepared') and new.reviewed_at is null then
      new.reviewed_at := now();
    end if;
  end if;

  if linked_student is distinct from new.student_id or linked_teacher is distinct from new.teacher_id then
    raise exception 'Submission assignment does not match the Premium session.';
  end if;
  return new;
end;
$$;

drop trigger if exists premium_homework_guard on public.premium_homework_submissions;
create trigger premium_homework_guard
before insert or update on public.premium_homework_submissions
for each row execute function public.guard_premium_homework_write();

drop trigger if exists premium_homework_set_updated_at on public.premium_homework_submissions;
create trigger premium_homework_set_updated_at
before update on public.premium_homework_submissions
for each row execute function public.set_updated_at();

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'absence','payment_reminder','report_card','enrollment_confirmed',
  'schedule_change','class_reminder','premium_homework','general'
));

create or replace function public.notify_premium_homework_teacher()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  teacher_email text;
  teacher_name text;
  student_name text;
begin
  select t.email, t.full_name into teacher_email, teacher_name
  from public.teachers t where t.id = new.teacher_id;
  select s.full_name into student_name from public.students s where s.id = new.student_id;

  if teacher_email is not null then
    insert into public.notifications (
      type, recipient_email, recipient_name, student_id, subject, message, sent
    ) values (
      'premium_homework', teacher_email, teacher_name, new.student_id,
      'Nouveau devoir Premium à préparer',
      coalesce(student_name, 'Un apprenant') || ' a envoyé « ' || new.title || ' » pour sa prochaine heure Premium.',
      false
    );
  end if;
  return new;
end;
$$;

drop trigger if exists premium_homework_notify_teacher on public.premium_homework_submissions;
create trigger premium_homework_notify_teacher
after insert or update of title, student_note, file_url on public.premium_homework_submissions
for each row execute function public.notify_premium_homework_teacher();

-- Extend the protected storage registry with a purpose bound to one Premium session.
alter table public.storage_assets add column if not exists premium_session_id uuid
  references public.premium_sessions(id) on delete set null;
alter table public.storage_assets drop constraint if exists storage_assets_purpose_check;
alter table public.storage_assets add constraint storage_assets_purpose_check check (purpose in (
  'student_photo','teacher_photo','portfolio','enrollment_document',
  'premium_homework','legacy_unclassified'
));

alter table public.storage_asset_bindings add column if not exists premium_submission_id uuid
  references public.premium_homework_submissions(id) on delete cascade;
alter table public.storage_asset_bindings drop constraint if exists storage_asset_bindings_check;
alter table public.storage_asset_bindings add constraint storage_asset_bindings_check check (
  num_nonnulls(student_photo_id, teacher_photo_id, portfolio_id, enrollment_id, premium_submission_id) = 1
);
create unique index if not exists storage_asset_bindings_premium_submission_idx
  on public.storage_asset_bindings (premium_submission_id)
  where premium_submission_id is not null;

create or replace function storage_security.immutable_key()
returns trigger language plpgsql security invoker set search_path=pg_catalog,pg_temp as $$
begin
  if (new.id,new.bucket_id,new.object_path,new.purpose,new.uploader_id,new.premium_session_id) is distinct from
     (old.id,old.bucket_id,old.object_path,old.purpose,old.uploader_id,old.premium_session_id) then
    raise exception 'Immutable asset identity' using errcode='42501';
  end if;
  return new;
end $$;

create or replace function storage_security.can_write(actor uuid, purpose text, sid uuid, tid uuid, eid uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,pg_temp as $$
 select actor is not null and exists (
   select 1 from public.profiles p where p.id=actor and (
     (p.role in ('admin','director') and purpose in ('student_photo','teacher_photo','portfolio','enrollment_document','premium_homework'))
     or (purpose='portfolio' and exists(select 1 from public.students s where s.id=sid and s.deleted_at is null and (
       (p.role='student' and s.email=p.email) or
       (p.role='teacher' and exists(select 1 from public.groups g join public.teachers t on t.id=g.teacher_id
         where g.id=s.groupe_id and t.email=p.email and t.deleted_at is null)))))
     or (purpose='premium_homework' and exists(select 1 from public.students s where s.id=sid and s.deleted_at is null
       and s.plan_type='Premium' and (
         (p.role='student' and s.email=p.email) or (p.role='parent' and s.parent_email=p.email))))
   )
 ) and (sid is null or exists(select 1 from public.students where id=sid and deleted_at is null))
 and (tid is null or exists(select 1 from public.teachers where id=tid and deleted_at is null))
 and (eid is null or exists(select 1 from public.enrollments where id=eid and student_id=sid))
$$;

create or replace function public.reserve_storage_asset(p_purpose text,p_student_id uuid default null,p_teacher_id uuid default null,p_enrollment_id uuid default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare a public.storage_assets; begin
  if p_purpose='premium_homework'
    or storage_security.can_write(auth.uid(),p_purpose,p_student_id,p_teacher_id,p_enrollment_id) is not true
    or (p_purpose='portfolio' and p_student_id is null)
    or (p_purpose='enrollment_document' and (p_student_id is null or p_enrollment_id is null))
    or (p_purpose<>'teacher_photo' and p_teacher_id is not null)
    or (p_purpose='teacher_photo' and p_student_id is not null)
    or (p_purpose<>'enrollment_document' and p_enrollment_id is not null) then
    raise exception 'Forbidden' using errcode='42501';
  end if;
  insert into public.storage_assets(bucket_id,object_path,purpose,student_id,teacher_id,enrollment_id,uploader_id)
  values(case when p_purpose='portfolio' then 'portfolios' else 'documents' end,
    'assets/'||gen_random_uuid()::text,p_purpose,p_student_id,p_teacher_id,p_enrollment_id,auth.uid()) returning * into a;
  return jsonb_build_object('id',a.id,'bucket',a.bucket_id,'path',a.object_path);
end $$;

create or replace function public.reserve_premium_homework_asset(p_student_id uuid, p_premium_session_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare
  a public.storage_assets;
  session_student uuid;
  session_status text;
begin
  select ps.student_id, ps.status into session_student, session_status
  from public.premium_sessions ps where ps.id=p_premium_session_id;
  if session_student is distinct from p_student_id or session_status='Cancelled'
    or storage_security.can_write(auth.uid(),'premium_homework',p_student_id,null,null) is not true then
    raise exception 'Forbidden' using errcode='42501';
  end if;
  insert into public.storage_assets(bucket_id,object_path,purpose,student_id,premium_session_id,uploader_id)
  values('documents','assets/'||gen_random_uuid()::text,'premium_homework',p_student_id,p_premium_session_id,auth.uid())
  returning * into a;
  return jsonb_build_object('id',a.id,'bucket',a.bucket_id,'path',a.object_path);
end $$;

create or replace function storage_security.can_insert_reserved_object(p_bucket_id text,p_object_path text,p_owner_id text)
returns boolean language sql stable security definer set search_path=pg_catalog,pg_temp as $$
  select auth.uid() is not null
    and p_owner_id is not distinct from auth.uid()::text
    and p_object_path ~ '^assets/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and exists (
      select 1 from public.storage_assets a
      join public.profiles p on p.id=auth.uid()
      where a.bucket_id=p_bucket_id and a.object_path=p_object_path and a.uploader_id=auth.uid()
        and a.state='reserved' and a.expires_at>now()
        and p.role in ('admin','director','teacher','student','parent')
        and storage_security.can_write(auth.uid(),a.purpose,a.student_id,a.teacher_id,a.enrollment_id) is true
    )
$$;

alter table public.premium_homework_submissions drop constraint if exists premium_homework_file_registry_reference;
alter table public.premium_homework_submissions add constraint premium_homework_file_registry_reference
  check (file_url is null or btrim(file_url)='' or storage_security.is_asset_reference(file_url));

create or replace function storage_security.bind_premium_homework()
returns trigger language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare
  aid uuid;
  a public.storage_assets;
  actor uuid := auth.uid();
  old_aid uuid;
begin
  if tg_op='UPDATE' and new.file_url is not distinct from old.file_url then return new; end if;
  if new.file_url is not null and btrim(new.file_url)<>'' then
    if storage_security.is_asset_reference(new.file_url) is not true then
      raise exception 'Registry asset reference required' using errcode='42501';
    end if;
    aid:=substring(new.file_url from 7)::uuid;
    select * into a from public.storage_assets where id=aid for update;
    if a.id is null or a.purpose<>'premium_homework' or a.student_id is distinct from new.student_id
      or a.premium_session_id is distinct from new.premium_session_id
      or not (a.state='uploaded' and a.uploader_id=actor and a.expires_at>now()) then
      raise exception 'Invalid Premium homework asset' using errcode='42501';
    end if;
  end if;

  select asset_id into old_aid from public.storage_asset_bindings where premium_submission_id=new.id;
  delete from public.storage_asset_bindings where premium_submission_id=new.id;
  if old_aid is not null and old_aid is distinct from aid then
    update public.storage_assets set state='retired' where id=old_aid and state='active';
  end if;
  if aid is not null then
    update public.storage_assets set state='active' where id=aid;
    insert into public.storage_asset_bindings(asset_id,premium_submission_id,bound_by)
    values(aid,new.id,actor);
  end if;
  return new;
end $$;

drop trigger if exists premium_homework_asset_binding on public.premium_homework_submissions;
create trigger premium_homework_asset_binding
after insert or update of file_url on public.premium_homework_submissions
for each row execute function storage_security.bind_premium_homework();

create or replace function public.resolve_storage_asset(p_asset_id uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare a public.storage_assets; allowed boolean; caller_role text; begin
 select p.role into caller_role from public.profiles p where p.id=auth.uid();
 select * into a from public.storage_assets where id=p_asset_id;
 if auth.uid() is null or a.id is null then raise exception 'Forbidden' using errcode='42501'; end if;
 if a.state='staff_only' then
   allowed:=a.purpose='legacy_unclassified' and caller_role in ('admin','director')
     and not exists(select 1 from public.storage_asset_bindings b where b.asset_id=a.id);
 elsif a.state='active' and a.purpose in ('student_photo','teacher_photo','portfolio','enrollment_document','premium_homework') then
   select exists(select 1 from public.storage_asset_bindings b
     left join public.students s on s.id=a.student_id
     left join public.portfolios pf on pf.id=b.portfolio_id
     left join public.premium_homework_submissions ph on ph.id=b.premium_submission_id
     left join public.premium_sessions ps on ps.id=ph.premium_session_id
     where b.asset_id=a.id and (
       caller_role in ('admin','director') or
       (a.purpose in ('student_photo','portfolio') and s.deleted_at is null and (
         (caller_role='parent' and s.parent_email=(select email from public.profiles where id=auth.uid()) and (a.purpose='student_photo' or pf.visible_to_parent is true)) or
         (caller_role='student' and s.email=(select email from public.profiles where id=auth.uid()) and (a.purpose='student_photo' or pf.visible_to_student is true)) or
         (caller_role='teacher' and exists(select 1 from public.groups g join public.teachers t on t.id=g.teacher_id
           where g.id=s.groupe_id and t.email=(select email from public.profiles where id=auth.uid()) and t.deleted_at is null))
       )) or
       (a.purpose='premium_homework' and ph.id is not null and (
         (caller_role='parent' and s.parent_email=(select email from public.profiles where id=auth.uid())) or
         (caller_role='student' and s.email=(select email from public.profiles where id=auth.uid())) or
         (caller_role='teacher' and ps.teacher_id=public.get_my_teacher_id())
       ))
     )) into allowed;
 else allowed:=false;
 end if;
 if allowed is not true or not exists(
   select 1 from storage.objects o where o.bucket_id=a.bucket_id and o.name=a.object_path and o.version=a.object_version
 ) then raise exception 'Forbidden' using errcode='42501'; end if;
 return jsonb_build_object('bucket',a.bucket_id,'path',a.object_path);
end $$;

revoke all on function public.reserve_premium_homework_asset(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.reserve_premium_homework_asset(uuid,uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
