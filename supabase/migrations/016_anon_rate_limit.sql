-- =============================================================================
-- 016_anon_rate_limit.sql
--
-- IP-based sliding-window rate limiter for unauthenticated public endpoints
-- (e.g. the /inscription public enrollment form). Works identically to the
-- per-user check_rate_limit in 013, but uses a hashed IP string instead of
-- auth.uid() so unauthenticated callers are covered.
--
-- Callers: server-side API routes using the service-role client.
-- =============================================================================

create table if not exists public.anon_rate_limits (
  ip_key     text        not null,
  scope      text        not null,
  created_at timestamptz not null default now()
);

create index if not exists anon_rate_limits_key_scope_idx
  on public.anon_rate_limits (ip_key, scope, created_at desc);

-- Only the service-role can touch this table; no RLS needed (service bypasses it).
alter table public.anon_rate_limits enable row level security;

create policy "anon_rate_limits deny all" on public.anon_rate_limits
  for all using (false) with check (false);

-- ─── check_anon_rate_limit ────────────────────────────────────────────────
-- Returns true when the IP is under the limit (and records the hit).
-- Returns false when the limit is exceeded (does NOT record).
-- Must be called from a service-role context.
create or replace function public.check_anon_rate_limit(
  p_ip_key         text,
  p_scope          text,
  p_max_requests   int,
  p_window_seconds int
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  hits int;
begin
  -- Lazy cleanup
  delete from public.anon_rate_limits
   where ip_key    = p_ip_key
     and scope     = p_scope
     and created_at < now() - make_interval(secs => p_window_seconds);

  select count(*) into hits
    from public.anon_rate_limits
   where ip_key = p_ip_key
     and scope  = p_scope;

  if hits >= p_max_requests then
    return false;
  end if;

  insert into public.anon_rate_limits (ip_key, scope)
  values (p_ip_key, p_scope);

  return true;
end;
$$;

-- Service-role calls this directly; no grant to anon/authenticated.
