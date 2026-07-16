-- Acquisition-source breakdown for the Finance dashboard: how many students
-- came from each channel. Computed over all students (SECURITY INVOKER so the
-- caller's RLS applies — admins/directors see all).

create or replace function public.get_referral_breakdown()
returns json
language sql
stable
as $$
  select coalesce(json_agg(json_build_object('source', src, 'count', c) order by c desc), '[]'::json)
  from (
    select coalesce(referral_source, 'Non renseigné') as src, count(*) as c
    from public.students
    group by 1
  ) t;
$$;

grant execute on function public.get_referral_breakdown() to authenticated;
