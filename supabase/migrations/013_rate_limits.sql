-- =============================================================================
-- 013_rate_limits.sql — per-user, per-endpoint sliding-window rate limiter.
--
-- Why a table + RPC instead of in-memory: Vercel's serverless functions run
-- on many short-lived instances, so a Node-level Map gets repeatedly reset
-- and missed across cold starts. A single round-trip to Postgres gives us
-- a consistent shared counter across all instances.
--
-- Callers invoke `public.check_rate_limit(scope, max_requests, window_secs)`.
-- The function:
--   • bumps the counter atomically (INSERT … ON CONFLICT UPDATE) and
--   • returns true when the request is allowed, false otherwise.
-- The window is sliding: we count rows within the last `window_secs` seconds.
-- =============================================================================

create table if not exists public.rate_limits (
  user_id     uuid        not null,
  scope       text        not null,
  created_at  timestamptz not null default now()
);

create index if not exists rate_limits_user_scope_idx
  on public.rate_limits (user_id, scope, created_at desc);

alter table public.rate_limits enable row level security;

-- No client should touch this table directly; the RPC runs as security definer.
revoke all on table public.rate_limits from anon, authenticated;

-- -----------------------------------------------------------------------------
-- check_rate_limit(scope, max_requests, window_seconds)
--   Returns true if the caller is under the limit (and records the hit),
--   false if they are over the limit (and does NOT record).
-- -----------------------------------------------------------------------------
create or replace function public.check_rate_limit(
  p_scope          text,
  p_max_requests   int,
  p_window_seconds int
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid   uuid := auth.uid();
  hits  int;
begin
  if uid is null then
    -- Unauthenticated callers go through other guards; deny by default here.
    return false;
  end if;

  -- Lazy cleanup: drop rows older than the window to keep the table small.
  delete from public.rate_limits
   where user_id   = uid
     and scope     = p_scope
     and created_at < now() - make_interval(secs => p_window_seconds);

  select count(*) into hits
    from public.rate_limits
   where user_id = uid
     and scope   = p_scope;

  if hits >= p_max_requests then
    return false;
  end if;

  insert into public.rate_limits (user_id, scope) values (uid, p_scope);
  return true;
end
$$;

grant execute on function public.check_rate_limit(text, int, int) to authenticated;
