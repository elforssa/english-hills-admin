-- =============================================================================
-- 017_soft_deletes.sql
--
-- Adds soft-delete support to the `students` table.
-- When a student is "deleted" via the app, we set deleted_at instead of
-- removing the row, preserving all related attendance / assessment /
-- enrollment history for audit purposes.
--
-- RLS: The existing policies on `students` are updated to filter out
-- soft-deleted rows for all authenticated reads. Service-role (used in
-- API routes and migrations) still sees everything.
--
-- Application layer: call the `soft_delete_student(uuid)` RPC instead of
-- issuing a DELETE directly. The function checks the caller has the right
-- role before setting deleted_at.
-- =============================================================================

alter table public.students
  add column if not exists deleted_at timestamptz default null;

create index if not exists idx_students_not_deleted
  on public.students (id)
  where deleted_at is null;

-- ── Update RLS to exclude soft-deleted rows ───────────────────────────────
-- We recreate the select policy so that deleted students are invisible to
-- authenticated reads (they're already invisible to anon via prior policies).
drop policy if exists "students soft delete filter" on public.students;

create policy "students soft delete filter" on public.students
  as restrictive
  for select
  using (deleted_at is null);

-- ── RPC for safe soft-delete ──────────────────────────────────────────────
create or replace function public.soft_delete_student(p_student_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.get_my_role() not in ('admin', 'director') then
    raise exception 'Forbidden';
  end if;

  update public.students
     set deleted_at = now()
   where id = p_student_id
     and deleted_at is null;
end;
$$;

grant execute on function public.soft_delete_student(uuid) to authenticated;
