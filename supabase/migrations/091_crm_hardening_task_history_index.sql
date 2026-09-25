-- Phase 12: Today exceeded 15s at 10k leads / 50k tasks because its
-- per-lead terminal-task timestamp lookup scanned task history repeatedly.
-- The existing open-task index cannot serve status <> 'open'. This covering
-- partial index preserves the query and all lifecycle/security semantics.
begin;
create index crm_tasks_terminal_lead_idx
  on public.crm_tasks (lead_id) include (completed_at, cancelled_at)
  where status <> 'open';
commit;
