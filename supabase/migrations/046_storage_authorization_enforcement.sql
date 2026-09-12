-- Batch 4C: enforce registry-only Storage access. Existing bytes are never
-- moved or deleted; record references must use immutable asset:<uuid> values.
begin;

create function storage_security.is_asset_reference(p_value text)
returns boolean language sql immutable security definer
set search_path=pg_catalog,pg_temp as $$
  select p_value ~* '^asset:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
$$;

create function storage_security.asset_references_only(p_values text[])
returns boolean language sql immutable security definer
set search_path=pg_catalog,pg_temp as $$
  select coalesce(bool_and(storage_security.is_asset_reference(value)),true)
  from unnest(coalesce(p_values,array[]::text[])) value
$$;

-- Production has no legacy references. Do not permit new rows to reintroduce
-- URL/path storage bypasses. Authorized-adult photos have no registry purpose.
alter table public.students add constraint students_photo_registry_reference
  check (photo_url is null or btrim(photo_url)='' or storage_security.is_asset_reference(photo_url));
alter table public.teachers add constraint teachers_photo_registry_reference
  check (photo_url is null or btrim(photo_url)='' or storage_security.is_asset_reference(photo_url));
alter table public.portfolios add constraint portfolios_file_registry_reference
  check (file_url is null or btrim(file_url)='' or storage_security.is_asset_reference(file_url));
alter table public.enrollments add constraint enrollments_documents_registry_references
  check (storage_security.asset_references_only(documents_urls));
alter table public.authorized_adults add constraint authorized_adults_photo_unsupported
  check (photo_url is null or btrim(photo_url)='');

-- This predicate is the sole ordinary-user Storage write gate. The arguments
-- come from the proposed storage.objects row; identity always comes from auth.
create function storage_security.can_insert_reserved_object(p_bucket_id text,p_object_path text,p_owner_id text)
returns boolean language sql stable security definer
set search_path=pg_catalog,pg_temp as $$
  select auth.uid() is not null
    and p_owner_id is not distinct from auth.uid()::text
    and p_object_path ~ '^assets/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and exists (
      select 1 from public.storage_assets a
      join public.profiles p on p.id=auth.uid()
      where a.bucket_id=p_bucket_id
        and a.object_path=p_object_path
        and a.uploader_id=auth.uid()
        and a.state='reserved'
        and a.expires_at>now()
        and p.role in ('admin','director','teacher','student')
        and storage_security.can_write(auth.uid(),a.purpose,a.student_id,a.teacher_id,a.enrollment_id) is true
    )
$$;

-- Replace the Batch 4A permissive reference bridge. Validation happens before
-- removing an old binding, so a rejected replacement rolls back unchanged.
create or replace function storage_security.bind_record() returns trigger
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare
  refs text[]; ref text; aid uuid; a public.storage_assets; purpose text; sid uuid; tid uuid; eid uuid;
  actor uuid:=auth.uid(); oldref text; newref text; role text;
  new_asset_ids uuid[]:=array[]::uuid[]; old_asset_ids uuid[]:=array[]::uuid[];
begin
 select p.role into role from public.profiles p where p.id=actor;
 if tg_table_name='portfolios' then
   if tg_op='UPDATE' and (storage_security.is_asset_reference(old.file_url) or storage_security.is_asset_reference(new.file_url)) then
     if new.student_id is distinct from old.student_id then raise exception 'Immutable portfolio subject' using errcode='42501'; end if;
     if role='student' and (new.visible_to_parent,new.visible_to_student,new.teacher_note,new.teacher_id) is distinct from
       (old.visible_to_parent,old.visible_to_student,old.teacher_note,old.teacher_id) then
       raise exception 'Protected portfolio fields' using errcode='42501'; end if;
   end if;
   if tg_op='INSERT' and storage_security.is_asset_reference(new.file_url) and role='student' then
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
 if tg_when='BEFORE' then return new; end if;
 if tg_op='UPDATE' then
   if tg_table_name='enrollments' then
     if new.documents_urls is not distinct from old.documents_urls then return new; end if;
   elsif newref is not distinct from oldref then
     return new;
   end if;
 end if;

 foreach ref in array coalesce(refs,array[]::text[]) loop
   if ref is null or btrim(ref)='' then continue; end if;
   if storage_security.is_asset_reference(ref) is not true then
     raise exception 'Registry asset reference required' using errcode='42501';
   end if;
   aid:=substring(ref from 7)::uuid;
   if aid=any(new_asset_ids) then raise exception 'Duplicate asset reference' using errcode='42501'; end if;
   new_asset_ids:=array_append(new_asset_ids,aid);
 end loop;

 with removed as (
   delete from public.storage_asset_bindings b where
     (tg_table_name='students' and b.student_photo_id=new.id) or
     (tg_table_name='teachers' and b.teacher_photo_id=new.id) or
     (tg_table_name='portfolios' and b.portfolio_id=new.id) or
     (tg_table_name='enrollments' and b.enrollment_id=new.id)
   returning asset_id
 ) select coalesce(array_agg(asset_id),array[]::uuid[]) into old_asset_ids from removed;

 update public.storage_assets sa set state='retired'
   where sa.id=any(old_asset_ids) and not sa.id=any(new_asset_ids) and sa.state='active'
     and not exists(select 1 from public.storage_asset_bindings b where b.asset_id=sa.id);

 foreach aid in array new_asset_ids loop
   select * into a from public.storage_assets where id=aid for update;
   if a.id is null or a.purpose is distinct from purpose
     or storage_security.can_write(actor,purpose,sid,tid,eid) is not true
     or (a.student_id is not null and a.student_id is distinct from sid)
     or (a.teacher_id is not null and a.teacher_id is distinct from tid)
     or (a.enrollment_id is not null and a.enrollment_id is distinct from eid)
     or not (
       (a.state='uploaded' and a.uploader_id=actor and a.expires_at>now()) or
       (tg_table_name='enrollments' and a.state='active' and a.enrollment_id=eid)
     ) then
     raise exception 'Invalid asset binding' using errcode='42501';
   end if;
   update public.storage_assets set state='active',student_id=sid,teacher_id=tid,enrollment_id=eid where id=aid;
   insert into public.storage_asset_bindings(asset_id,student_photo_id,teacher_photo_id,portfolio_id,enrollment_id,bound_by)
   values(aid,case when purpose='student_photo' then new.id end,case when purpose='teacher_photo' then new.id end,
     case when purpose='portfolio' then new.id end,eid,actor);
 end loop;
 return new;
end $$;

create or replace function public.resolve_storage_asset(p_asset_id uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare a public.storage_assets; allowed boolean; caller_role text; begin
 select p.role into caller_role from public.profiles p where p.id=auth.uid();
 select * into a from public.storage_assets where id=p_asset_id;
 if auth.uid() is null or a.id is null then raise exception 'Forbidden' using errcode='42501'; end if;
 if a.state='staff_only' then
   -- `staff_only` is solely the quarantine state for an unbound legacy
   -- object.  In particular, never allow a normal, record-bound asset to
   -- become staff-readable by changing only its state.
   allowed:=a.purpose='legacy_unclassified'
     and caller_role in ('admin','director')
     and not exists(select 1 from public.storage_asset_bindings b where b.asset_id=a.id);
 elsif a.state='active' and a.purpose in ('student_photo','teacher_photo','portfolio','enrollment_document') then
   select exists(select 1 from public.storage_asset_bindings b
     left join public.students s on s.id=a.student_id
     left join public.portfolios pf on pf.id=b.portfolio_id
     where b.asset_id=a.id and (
       caller_role in ('admin','director') or
       (a.purpose in ('student_photo','portfolio') and s.deleted_at is null and (
         (caller_role='parent' and s.parent_email=(select email from public.profiles where id=auth.uid()) and (a.purpose='student_photo' or pf.visible_to_parent is true)) or
         (caller_role='student' and s.email=(select email from public.profiles where id=auth.uid()) and (a.purpose='student_photo' or pf.visible_to_student is true)) or
         (caller_role='teacher' and exists(select 1 from public.groups g join public.teachers t on t.id=g.teacher_id
           where g.id=s.groupe_id and t.email=(select email from public.profiles where id=auth.uid()) and t.deleted_at is null))
       ))
     )) into allowed;
 else
   allowed:=false;
 end if;
 if allowed is not true or not exists(
   select 1 from storage.objects o where o.bucket_id=a.bucket_id and o.name=a.object_path and o.version=a.object_version
 ) then raise exception 'Forbidden' using errcode='42501'; end if;
 return jsonb_build_object('bucket',a.bucket_id,'path',a.object_path);
end $$;

drop policy if exists "uploads read" on storage.objects;
drop policy if exists "uploads insert" on storage.objects;
drop policy if exists "uploads update" on storage.objects;
drop policy if exists "uploads delete" on storage.objects;

create policy "reserved asset insert" on storage.objects for insert to authenticated
with check (storage_security.can_insert_reserved_object(bucket_id,name,owner_id));

revoke all on all functions in schema storage_security from public,anon,authenticated,service_role;
revoke all on function public.reserve_storage_asset(text,uuid,uuid,uuid),public.get_storage_upload(uuid),public.resolve_storage_asset(uuid),
 public.finalize_storage_asset(uuid,uuid,bigint,text,text) from public,anon,authenticated,service_role;
grant execute on function storage_security.is_asset_reference(text),storage_security.asset_references_only(text[]) to authenticated,service_role;
grant execute on function storage_security.can_insert_reserved_object(text,text,text) to authenticated;
grant execute on function public.reserve_storage_asset(text,uuid,uuid,uuid),public.get_storage_upload(uuid),public.resolve_storage_asset(uuid) to authenticated;
grant execute on function public.finalize_storage_asset(uuid,uuid,bigint,text,text) to service_role;

notify pgrst,'reload schema';
commit;
