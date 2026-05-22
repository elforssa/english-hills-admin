-- =============================================================================
-- 014_receptionist_attendance.sql — grant receptionists write access on
-- attendance.
--
-- Why: middleware.js (RECEPTIONIST_ROUTES) and Sidebar.jsx both expose
-- /attendance to receptionists, but migration 006 only gave them SELECT.
-- The UI is therefore broken for them — clicking "Mark present" hit a
-- silent RLS denial.
--
-- This migration adds INSERT/UPDATE/DELETE policies that mirror the read
-- policy already in place.
-- =============================================================================

drop policy if exists "attendance recep insert" on public.attendance;
drop policy if exists "attendance recep update" on public.attendance;
drop policy if exists "attendance recep delete" on public.attendance;

create policy "attendance recep insert" on public.attendance for insert
  with check (get_my_role() = 'receptionist');

create policy "attendance recep update" on public.attendance for update
  using (get_my_role() = 'receptionist')
  with check (get_my_role() = 'receptionist');

create policy "attendance recep delete" on public.attendance for delete
  using (get_my_role() = 'receptionist');
