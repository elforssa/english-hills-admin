-- =============================================================================
-- 003 — Storage bucket for uploaded documents
--
-- Creates a public `documents` bucket used by:
--   • /inscription (PublicEnrollment) — anonymous enrollment doc uploads
--   • /portfolios — teacher-uploaded student project artifacts
--
-- Permissive policies (anon can upload, anyone can read) mirror the open
-- state of the rest of the schema at this point in the migration. Lock
-- this down alongside the broader RLS pass.
-- =============================================================================

insert into storage.buckets (id, name, public)
values ('documents', 'documents', true)
on conflict (id) do nothing;

-- Anyone can read (public bucket; redundant but explicit).
create policy "documents read"
  on storage.objects for select
  using (bucket_id = 'documents');

-- Anyone can upload. Tighten later: probably require auth.uid() IS NOT NULL
-- once we have a real auth flow for /inscription.
create policy "documents insert"
  on storage.objects for insert
  with check (bucket_id = 'documents');
