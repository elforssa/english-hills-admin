-- =============================================================================
-- 018_storage_lockdown.sql
--
-- Tighten storage.objects policies so anonymous traffic can no longer:
--   • Read arbitrary objects from documents/portfolios (006_audit flagged
--     this as world-readable).
--   • Upload arbitrary objects up to Supabase's default 5 GB limit.
--
-- The previous "uploads read" / "uploads insert" policies (created in 004)
-- placed no auth requirement on either action. After this migration:
--
--   • SELECT  → authenticated users only. App code that needs a public
--               URL uses a signed URL generated server-side.
--   • INSERT  → authenticated users only.
--   • UPDATE / DELETE → admin/director only.
--
-- /inscription (the anonymous public enrollment form) goes through
-- /api/public/inscription which runs as service_role and bypasses these
-- policies, so document attachments from prospective students still flow.
-- =============================================================================

drop policy if exists "uploads read"   on storage.objects;
drop policy if exists "uploads insert" on storage.objects;
drop policy if exists "uploads update" on storage.objects;
drop policy if exists "uploads delete" on storage.objects;

-- Authenticated users can read objects from our two buckets. Signed URLs
-- (issued server-side via src/lib/storage.js) bypass this for parents/
-- students who don't have a session.
create policy "uploads read"
  on storage.objects for select
  to authenticated
  using (bucket_id in ('documents', 'portfolios'));

-- Authenticated users can upload. Anonymous uploads (e.g. /inscription)
-- happen via the service-role client which bypasses RLS.
create policy "uploads insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id in ('documents', 'portfolios'));

-- Updates and deletes only by privileged roles. get_my_role() is defined in
-- migration 006 and reads public.profiles for the current auth user.
create policy "uploads update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id in ('documents', 'portfolios')
    and public.get_my_role() in ('admin', 'director')
  )
  with check (
    bucket_id in ('documents', 'portfolios')
    and public.get_my_role() in ('admin', 'director')
  );

create policy "uploads delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id in ('documents', 'portfolios')
    and public.get_my_role() in ('admin', 'director')
  );

-- Per-bucket MIME / size limits. Supabase enforces these at the upload
-- gateway before the row hits the policy check.
update storage.buckets
   set file_size_limit       = 10 * 1024 * 1024,         -- 10 MB
       allowed_mime_types    = array[
         'application/pdf',
         'image/jpeg', 'image/png', 'image/webp',
         'application/msword',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
       ]
 where id = 'documents';

update storage.buckets
   set file_size_limit       = 25 * 1024 * 1024,         -- 25 MB
       allowed_mime_types    = array[
         'application/pdf',
         'image/jpeg', 'image/png', 'image/webp', 'image/gif',
         'video/mp4', 'video/webm',
         'audio/mpeg', 'audio/wav'
       ]
 where id = 'portfolios';
