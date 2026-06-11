-- =============================================================================
-- 028 — Per-recipient read state for notifications
--
-- The portals surface each user's notifications (RLS "notifications self read"),
-- but recipients had no way to mark them read: the only write policy is
-- "notifications admin all", so a parent/student/teacher cannot UPDATE their
-- own rows. This adds a read_at timestamp plus a SECURITY DEFINER RPC that
-- flips unread → read for the caller's own notifications only. The portals call
-- it when the Notifications tab is opened so the unread badge clears.
--
-- Data-safe: ADD COLUMN IF NOT EXISTS is non-destructive; existing rows get
-- read_at = NULL (i.e. "unread"), which is the correct default.
-- =============================================================================

alter table public.notifications
  add column if not exists read_at timestamptz;

-- mark_my_notifications_read() — sets read_at=now() on the caller's unread
-- notifications (matched by recipient_email = the caller's profile email).
-- Returns the number of rows updated. Runs as definer so it works despite the
-- recipient having no UPDATE policy on the table.
create or replace function public.mark_my_notifications_read()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  my_email text;
  updated  integer;
begin
  if auth.uid() is null then
    return 0;
  end if;
  my_email := public.get_my_email();
  if my_email is null then
    return 0;
  end if;

  update public.notifications
     set read_at = now()
   where recipient_email = my_email
     and read_at is null;

  get diagnostics updated = row_count;
  return updated;
end;
$$;

grant execute on function public.mark_my_notifications_read() to authenticated;
