-- DESTRUCTIVE, MANUAL, SEPARATELY APPROVED CLEANUP. Do not run during rollout.
begin;
drop trigger if exists stamp_photo_consent_t on public.students;
drop function if exists public.stamp_photo_consent();
alter table public.students drop column if exists photo_consent_at;
alter table public.students drop column if exists photo_consent;
alter table public.receipts drop column if exists photo_consent;
commit;
