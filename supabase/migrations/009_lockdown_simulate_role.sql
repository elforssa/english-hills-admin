-- ============================================================================
-- 009 · lock down simulate_role()
--
-- Original definition (migration 006) granted role-switch when EITHER the
-- caller was currently a director OR no other director existed. The second
-- clause was added to support the "switch back" flow after a director
-- simulated a non-director role — but it also let any authenticated user
-- promote themselves to any role whenever the lone director happened to be
-- logged out (no row with role='director' is required for that boolean to
-- be false; the predicate is about existence of *other* directors).
--
-- Concretely: a teacher who is the only signed-in user with auth.uid() set
-- could call simulate_role('admin') and succeed if the director's profile
-- had been demoted (e.g. mid-simulation), giving them admin RLS for the
-- rest of the session. That's a vertical privilege escalation.
--
-- This migration:
--   1. Requires the caller's CURRENT profile role to be 'director' for any
--      simulation EXCEPT switching back to 'director' itself.
--   2. Keeps the "switch back" escape hatch so a director who simulated a
--      lower role can return to director — that path only needs the absence
--      of any OTHER director (which was the original intent).
-- ============================================================================

create or replace function public.simulate_role(target_role text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role        text;
  has_other_director boolean;
begin
  if auth.uid() is null then
    return false;
  end if;

  if target_role not in (
    'admin','director','teacher','parent','student','receptionist','pending'
  ) then
    return false;
  end if;

  caller_role := (select role from public.profiles where id = auth.uid());

  -- Path A: caller is currently a director → may simulate any role.
  if caller_role = 'director' then
    update public.profiles set role = target_role where id = auth.uid();
    return true;
  end if;

  -- Path B: caller is NOT currently a director. The only allowed transition
  -- is switching BACK to 'director' — and only when they are the would-be
  -- sole director (no other 'director' row exists). This preserves the
  -- "I simulated parent, now switch back" flow without letting non-directors
  -- escalate to admin / teacher / receptionist / etc.
  if target_role <> 'director' then
    return false;
  end if;

  has_other_director := exists (
    select 1 from public.profiles
     where role = 'director' and id <> auth.uid()
  );
  if has_other_director then
    return false;
  end if;

  update public.profiles set role = 'director' where id = auth.uid();
  return true;
end;
$$;

grant execute on function public.simulate_role(text) to authenticated;
