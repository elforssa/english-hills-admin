-- Batch 4A: additive registry. Deliberately DOES NOT change storage policies.
begin;
create schema storage_security;
revoke all on schema storage_security from public, anon, authenticated, service_role;

create table public.storage_assets (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null check (bucket_id in ('documents','portfolios')),
  object_path text not null,
  purpose text not null check (purpose in ('student_photo','teacher_photo','portfolio','enrollment_document','legacy_unclassified')),
  student_id uuid references public.students(id),
  teacher_id uuid references public.teachers(id),
  enrollment_id uuid references public.enrollments(id),
  uploader_id uuid references auth.users(id),
  state text not null default 'reserved' check (state in ('reserved','uploaded','active','staff_only','retired')),
  expires_at timestamptz not null default now()+interval '30 minutes',
  verified_size bigint,
  verified_type text,
  object_version text,
  provenance text not null default 'authenticated_reservation',
  classified_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique(bucket_id,object_path)
);
create table public.storage_asset_bindings (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.storage_assets(id),
  student_photo_id uuid references public.students(id) on delete cascade,
  teacher_photo_id uuid references public.teachers(id) on delete cascade,
  portfolio_id uuid references public.portfolios(id) on delete cascade,
  enrollment_id uuid references public.enrollments(id) on delete cascade,
  bound_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check (num_nonnulls(student_photo_id,teacher_photo_id,portfolio_id,enrollment_id)=1),
  unique(student_photo_id), unique(teacher_photo_id), unique(portfolio_id), unique(enrollment_id,asset_id)
);
alter table public.storage_assets enable row level security;
alter table public.storage_asset_bindings enable row level security;
revoke all on public.storage_assets, public.storage_asset_bindings from public, anon, authenticated, service_role;

create function storage_security.immutable_key() returns trigger
language plpgsql security invoker set search_path=pg_catalog,pg_temp as $$ begin
  if (new.id,new.bucket_id,new.object_path,new.purpose,new.uploader_id) is distinct from
     (old.id,old.bucket_id,old.object_path,old.purpose,old.uploader_id) then
    raise exception 'Immutable asset identity' using errcode='42501';
  end if;
  return new;
end $$;
create trigger immutable_storage_key before update on public.storage_assets
for each row execute function storage_security.immutable_key();

-- Explicit actor is private: public callers cannot execute this helper.
create function storage_security.can_write(actor uuid, purpose text, sid uuid, tid uuid, eid uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,pg_temp as $$
 select actor is not null and exists (
   select 1 from public.profiles p where p.id=actor and (
     (p.role in ('admin','director') and purpose in ('student_photo','teacher_photo','portfolio','enrollment_document'))
     or (purpose='portfolio' and exists(select 1 from public.students s where s.id=sid and s.deleted_at is null and (
       (p.role='student' and s.email=p.email) or
       (p.role='teacher' and exists(select 1 from public.groups g join public.teachers t on t.id=g.teacher_id
         where g.id=s.groupe_id and t.email=p.email and t.deleted_at is null)))))
   )
 ) and (sid is null or exists(select 1 from public.students where id=sid and deleted_at is null))
 and (tid is null or exists(select 1 from public.teachers where id=tid and deleted_at is null))
 and (eid is null or exists(select 1 from public.enrollments where id=eid and student_id=sid))
$$;

create function public.reserve_storage_asset(p_purpose text,p_student_id uuid default null,p_teacher_id uuid default null,p_enrollment_id uuid default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare a public.storage_assets; begin
  if storage_security.can_write(auth.uid(),p_purpose,p_student_id,p_teacher_id,p_enrollment_id) is not true
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

create function public.get_storage_upload(p_asset_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare a public.storage_assets; o storage.objects; begin
 select * into a from public.storage_assets where id=p_asset_id;
 if a.id is null or auth.uid() is null or a.uploader_id is distinct from auth.uid()
   or a.state<>'reserved' or a.expires_at<=now()
   or storage_security.can_write(auth.uid(),a.purpose,a.student_id,a.teacher_id,a.enrollment_id) is not true then
   raise exception 'Forbidden' using errcode='42501'; end if;
 select * into o from storage.objects where bucket_id=a.bucket_id and name=a.object_path and owner_id=auth.uid()::text;
 return jsonb_build_object('id',a.id,'bucket',a.bucket_id,'path',a.object_path,'purpose',a.purpose,
   'version',o.version,'size',o.metadata->'size');
end $$;

-- Only the server may certify inspected bytes. p_actor MUST be obtained by
-- auth.getUser(), not from request JSON. No general registry service grants.
create function public.finalize_storage_asset(p_actor uuid,p_asset_id uuid,p_size bigint,p_type text,p_version text)
returns void language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare a public.storage_assets; o storage.objects; begin
 select * into a from public.storage_assets where id=p_asset_id for update;
 if a.id is null or p_actor is null or a.uploader_id is distinct from p_actor or a.state<>'reserved'
   or a.expires_at<=now() or storage_security.can_write(p_actor,a.purpose,a.student_id,a.teacher_id,a.enrollment_id) is not true then
   raise exception 'Forbidden' using errcode='42501'; end if;
 select * into o from storage.objects where bucket_id=a.bucket_id and name=a.object_path;
 if o.id is null or o.owner_id is distinct from p_actor::text or o.version is distinct from p_version
   or p_size is null or p_size<=0 or p_size>10485760 or (o.metadata->>'size')::bigint is distinct from p_size
   or p_type is null or p_type not in ('image/jpeg','image/png','application/pdf')
   or (a.purpose in ('student_photo','teacher_photo') and p_type='application/pdf') then
   raise exception 'Invalid uploaded object' using errcode='42501'; end if;
 update public.storage_assets set state='uploaded',verified_size=p_size,verified_type=p_type,object_version=p_version where id=a.id;
 insert into public.activity_log(actor_id,action,target_table,target_id,changed_columns)
 values(p_actor,'UPDATE','storage_assets',a.id,array['state']);
end $$;

-- References beginning asset: are a protected binding request. Legacy strings
-- are untouched. Trigger runs inside the original authorized record write.
create function storage_security.bind_record() returns trigger
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare refs text[]; ref text; aid uuid; a public.storage_assets; purpose text; sid uuid; tid uuid; eid uuid;
  actor uuid:=auth.uid(); oldref text; newref text; role text;
begin
 select p.role into role from public.profiles p where p.id=actor;
 if tg_table_name='portfolios' then
   if tg_op='UPDATE' and (old.file_url like 'asset:%' or new.file_url like 'asset:%') then
     if new.student_id is distinct from old.student_id then raise exception 'Immutable portfolio subject' using errcode='42501'; end if;
     if role='student' and (new.visible_to_parent,new.visible_to_student,new.teacher_note,new.teacher_id) is distinct from
       (old.visible_to_parent,old.visible_to_student,old.teacher_note,old.teacher_id) then
       raise exception 'Protected portfolio fields' using errcode='42501'; end if;
   end if;
   if tg_op='INSERT' and new.file_url like 'asset:%' and role='student' then
     new.visible_to_parent:=true; new.visible_to_student:=true; new.teacher_note:=null; new.teacher_id:=null;
   end if;
   purpose:='portfolio'; sid:=new.student_id; refs:=array[new.file_url]; newref:=new.file_url;
   if tg_op='UPDATE' then oldref:=old.file_url; end if;
 elsif tg_table_name='students' then
   purpose:='student_photo'; sid:=new.id; refs:=array[new.photo_url]; newref:=new.photo_url;
   if tg_op='UPDATE' then oldref:=old.photo_url; end if;
 elsif tg_table_name='teachers' then
   purpose:='teacher_photo'; tid:=new.id; refs:=array[new.photo_url]; newref:=new.photo_url;
   if tg_op='UPDATE' then oldref:=old.photo_url; end if;
 else
   purpose:='enrollment_document'; sid:=new.student_id; eid:=new.id; refs:=new.documents_urls;
   if tg_op='UPDATE' and new.student_id is distinct from old.student_id and exists(
     select 1 from public.storage_asset_bindings where enrollment_id=new.id) then
     raise exception 'Immutable attachment subject' using errcode='42501'; end if;
 end if;
 -- AFTER trigger: defaults above are protected separately by BEFORE trigger.
 if tg_when='BEFORE' then return new; end if;
 if tg_op='UPDATE' and tg_table_name<>'enrollments' and newref is not distinct from oldref then return new; end if;
 delete from public.storage_asset_bindings b where
   (tg_table_name='students' and b.student_photo_id=new.id) or
   (tg_table_name='teachers' and b.teacher_photo_id=new.id) or
   (tg_table_name='portfolios' and b.portfolio_id=new.id) or
   (tg_table_name='enrollments' and b.enrollment_id=new.id);
 foreach ref in array coalesce(refs,array[]::text[]) loop
   if ref is null or ref not like 'asset:%' then continue; end if;
   aid:=substring(ref from 7)::uuid;
   select * into a from public.storage_assets where id=aid for update;
   if a.id is null or a.purpose is distinct from purpose
     or storage_security.can_write(actor,purpose,sid,tid,eid) is not true
     or (a.student_id is not null and a.student_id is distinct from sid)
     or (a.teacher_id is not null and a.teacher_id is distinct from tid)
     or (a.enrollment_id is not null and a.enrollment_id is distinct from eid)
     or not (a.state='uploaded' and a.uploader_id=actor and a.expires_at>now()
       or tg_table_name='enrollments' and a.state='active' and a.enrollment_id=eid) then
     raise exception 'Invalid asset binding' using errcode='42501'; end if;
   update public.storage_assets set state='active',student_id=sid,teacher_id=tid,enrollment_id=eid where id=aid;
   insert into public.storage_asset_bindings(asset_id,student_photo_id,teacher_photo_id,portfolio_id,enrollment_id,bound_by)
   values(aid,case when purpose='student_photo' then new.id end,case when purpose='teacher_photo' then new.id end,
     case when purpose='portfolio' then new.id end,eid,actor);
 end loop;
 return new;
end $$;
create trigger storage_portfolio_guard before insert or update on public.portfolios for each row execute function storage_security.bind_record();
create trigger storage_student_binding after insert or update on public.students for each row execute function storage_security.bind_record();
create trigger storage_teacher_binding after insert or update on public.teachers for each row execute function storage_security.bind_record();
create trigger storage_portfolio_binding after insert or update on public.portfolios for each row execute function storage_security.bind_record();
create trigger storage_enrollment_binding after insert or update on public.enrollments for each row execute function storage_security.bind_record();

create function public.resolve_storage_asset(p_asset_id uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare a public.storage_assets; allowed boolean; begin
 select * into a from public.storage_assets where id=p_asset_id;
 select exists(select 1 from public.storage_asset_bindings b
   join public.profiles p on p.id=auth.uid()
   left join public.students s on s.id=a.student_id
   left join public.portfolios pf on pf.id=b.portfolio_id
   where b.asset_id=a.id and (
     p.role in ('admin','director') or
     (a.purpose in ('student_photo','portfolio') and s.deleted_at is null and (
       (p.role='parent' and s.parent_email=p.email and (a.purpose='student_photo' or pf.visible_to_parent is true)) or
       (p.role='student' and s.email=p.email and (a.purpose='student_photo' or pf.visible_to_student is true)) or
       (p.role='teacher' and exists(select 1 from public.groups g join public.teachers t on t.id=g.teacher_id
         where g.id=s.groupe_id and t.email=p.email and t.deleted_at is null))
     ))
   )) into allowed;
 if auth.uid() is null or a.id is null or a.state<>'active' or allowed is not true or not exists(
   select 1 from storage.objects o where o.bucket_id=a.bucket_id and o.name=a.object_path and o.version=a.object_version) then
   raise exception 'Forbidden' using errcode='42501'; end if;
 return jsonb_build_object('bucket',a.bucket_id,'path',a.object_path);
end $$;

revoke all on all functions in schema storage_security from public,anon,authenticated,service_role;
revoke all on function public.reserve_storage_asset(text,uuid,uuid,uuid),public.get_storage_upload(uuid),public.resolve_storage_asset(uuid),
 public.finalize_storage_asset(uuid,uuid,bigint,text,text) from public,anon,authenticated,service_role;
grant execute on function public.reserve_storage_asset(text,uuid,uuid,uuid),public.get_storage_upload(uuid),public.resolve_storage_asset(uuid) to authenticated;
grant execute on function public.finalize_storage_asset(uuid,uuid,bigint,text,text) to service_role;
notify pgrst,'reload schema';
commit;
