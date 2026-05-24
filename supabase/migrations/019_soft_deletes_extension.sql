-- =============================================================================
-- 019_soft_deletes_extension.sql
--
-- Extends soft-delete coverage from `students` (migration 017) to other
-- audit-sensitive tables: teachers, receipts, payments. For financial /
-- HR records we must retain history for compliance (Moroccan accounting
-- rules require receipts to be archivable for 10 years).
--
-- Pattern mirrors 017:
--   • deleted_at timestamptz default null
--   • restrictive SELECT policy hiding deleted rows from app reads
--   • partial index on (id) where deleted_at is null for hot-path queries
--   • SECURITY DEFINER RPC that gates by role
-- =============================================================================

-- ── teachers ──────────────────────────────────────────────────────────────
alter table public.teachers
  add column if not exists deleted_at timestamptz default null;

create index if not exists idx_teachers_not_deleted
  on public.teachers (id)
  where deleted_at is null;

drop policy if exists "teachers soft delete filter" on public.teachers;
create policy "teachers soft delete filter" on public.teachers
  as restrictive
  for select
  using (deleted_at is null);

create or replace function public.soft_delete_teacher(p_teacher_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.get_my_role() not in ('admin', 'director') then
    raise exception 'Forbidden';
  end if;

  update public.teachers
     set deleted_at = now()
   where id = p_teacher_id
     and deleted_at is null;
end;
$$;

grant execute on function public.soft_delete_teacher(uuid) to authenticated;


-- ── receipts ──────────────────────────────────────────────────────────────
-- Receipts are immutable from a compliance standpoint. We still allow
-- soft-deletion for typo cleanup, but the row stays in the table forever.
alter table public.receipts
  add column if not exists deleted_at timestamptz default null;

create index if not exists idx_receipts_not_deleted
  on public.receipts (id)
  where deleted_at is null;

drop policy if exists "receipts soft delete filter" on public.receipts;
create policy "receipts soft delete filter" on public.receipts
  as restrictive
  for select
  using (deleted_at is null);

create or replace function public.soft_delete_receipt(p_receipt_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only director can wipe a receipt — admins shouldn't be able to
  -- silently erase financial history.
  if public.get_my_role() <> 'director' then
    raise exception 'Forbidden';
  end if;

  update public.receipts
     set deleted_at = now()
   where id = p_receipt_id
     and deleted_at is null;
end;
$$;

grant execute on function public.soft_delete_receipt(uuid) to authenticated;


-- ── payments ──────────────────────────────────────────────────────────────
alter table public.payments
  add column if not exists deleted_at timestamptz default null;

create index if not exists idx_payments_not_deleted
  on public.payments (id)
  where deleted_at is null;

drop policy if exists "payments soft delete filter" on public.payments;
create policy "payments soft delete filter" on public.payments
  as restrictive
  for select
  using (deleted_at is null);

create or replace function public.soft_delete_payment(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.get_my_role() <> 'director' then
    raise exception 'Forbidden';
  end if;

  update public.payments
     set deleted_at = now()
   where id = p_payment_id
     and deleted_at is null;
end;
$$;

grant execute on function public.soft_delete_payment(uuid) to authenticated;
