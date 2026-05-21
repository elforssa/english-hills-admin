-- ============================================================================
-- 012 · activity_log + audit triggers
--
-- Generic append-only audit table that records who did what to which row,
-- with a JSON diff. Triggers attach to the tables where change history is
-- materially valuable: finance (receipts/payments/payroll), workflow
-- (enrollments/leave_requests), and access control (profiles role changes).
--
-- Reading the log:
--   select * from public.activity_log
--    where target_table = 'receipts' and target_id = '<uuid>'
--    order by created_at desc;
--
-- Design notes:
--   • Single table > shadow-per-table: simpler queries, simpler retention.
--   • `changed_columns` is a denormalised array of the columns that
--     actually differ between OLD and NEW — lets you build a "what
--     changed?" UI without diffing the full JSON client-side.
--   • `actor_id` is auth.uid() at the time of the change. NULL means a
--     system-level mutation (cron, RPC running as service_role, etc.).
--   • `before` / `after` store the full row as JSONB so we can rebuild
--     state at any point in time. Large blobs (e.g. base64) will bloat
--     the table — none of the audited tables currently carry blobs.
--   • Inserts: `before` is NULL. Deletes: `after` is NULL. Updates: both
--     populated, plus `changed_columns`.
--   • The trigger uses SECURITY DEFINER so writes succeed even when the
--     caller's RLS would otherwise block INSERT on activity_log.
-- ============================================================================

create table if not exists public.activity_log (
  id              uuid        primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),

  actor_id        uuid,                 -- auth.uid() when triggered by a user
  actor_email     text,                 -- snapshot so deleted users keep history
  action          text not null check (action in ('INSERT','UPDATE','DELETE')),
  target_table    text not null,
  target_id       uuid,                 -- pk of the affected row (when uuid)
  changed_columns text[],               -- populated for UPDATE only
  before          jsonb,
  after           jsonb
);

-- Hot path: "history for this row" → composite index on (table, id, time).
create index if not exists idx_activity_log_target
  on public.activity_log (target_table, target_id, created_at desc);

-- "What did user X do today?" — admin investigation tool.
create index if not exists idx_activity_log_actor
  on public.activity_log (actor_id, created_at desc)
  where actor_id is not null;

-- Lock the table down: RLS on, only admin/director can read, no direct
-- writes (the trigger function is SECURITY DEFINER and bypasses RLS).
alter table public.activity_log enable row level security;

drop policy if exists "activity_log select"  on public.activity_log;
drop policy if exists "activity_log no write" on public.activity_log;

create policy "activity_log select" on public.activity_log
  for select
  using (
    -- get_my_role() is defined in migration 006.
    public.get_my_role() in ('admin','director')
  );

-- Block direct inserts/updates/deletes from app roles. The trigger function
-- runs as SECURITY DEFINER and is not subject to these policies.
create policy "activity_log no write" on public.activity_log
  for all
  using (false)
  with check (false);


-- ── trigger function ─────────────────────────────────────────────────────
create or replace function public.log_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id     uuid;
  v_actor_email  text;
  v_target_id    uuid;
  v_before       jsonb;
  v_after        jsonb;
  v_changed      text[];
  k              text;
begin
  -- auth.uid() returns NULL when invoked outside an authenticated request
  -- (e.g. during a migration or a service_role RPC). That's fine — we log
  -- NULL and the row is still appended.
  v_actor_id := auth.uid();
  if v_actor_id is not null then
    select email into v_actor_email
      from public.profiles where id = v_actor_id;
  end if;

  if tg_op = 'INSERT' then
    v_before    := null;
    v_after     := to_jsonb(new);
    v_target_id := (v_after->>'id')::uuid;
  elsif tg_op = 'UPDATE' then
    v_before    := to_jsonb(old);
    v_after     := to_jsonb(new);
    v_target_id := (v_after->>'id')::uuid;

    -- Build the list of columns that actually changed. Skip noisy ones
    -- (updated_at always changes on every UPDATE because of set_updated_at).
    v_changed := array[]::text[];
    for k in select jsonb_object_keys(v_after) loop
      if k = 'updated_at' then continue; end if;
      if (v_before->k) is distinct from (v_after->k) then
        v_changed := array_append(v_changed, k);
      end if;
    end loop;

    -- No-op update (only updated_at moved) — skip the log row.
    if array_length(v_changed, 1) is null then
      return new;
    end if;
  else -- DELETE
    v_before    := to_jsonb(old);
    v_after     := null;
    v_target_id := (v_before->>'id')::uuid;
  end if;

  insert into public.activity_log
    (actor_id, actor_email, action, target_table,
     target_id, changed_columns, before, after)
  values
    (v_actor_id, v_actor_email, tg_op, tg_table_name,
     v_target_id, v_changed, v_before, v_after);

  return coalesce(new, old);
end;
$$;

-- Attach to tables where audit is valuable. Add more as needed —
-- the trigger function is table-agnostic.
do $$
declare
  t text;
begin
  foreach t in array array[
    'receipts',
    'payments',
    'payroll',
    'enrollments',
    'leave_requests',
    'profiles',           -- role changes, linked_student_id swaps
    'certificates',       -- issuance is irreversible
    'students',           -- creation/deletion of student records
    'teachers'
  ] loop
    execute format('drop trigger if exists log_activity_t on public.%I;', t);
    execute format(
      'create trigger log_activity_t
         after insert or update or delete on public.%I
         for each row execute function public.log_activity();',
      t
    );
  end loop;
end $$;
