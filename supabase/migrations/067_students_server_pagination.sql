begin;

-- A single filtered snapshot supplies exact counts, deterministic pages and
-- complete CSV export (page_size = 0). SECURITY INVOKER preserves student RLS.
create or replace function public.search_students_page(
  p_search text default '',
  p_status text default '',
  p_age_category text default '',
  p_session text default '',
  p_level text default '',
  p_incomplete boolean default false,
  p_source text default '',
  p_plan text default '',
  p_page integer default 1,
  p_page_size integer default 20
) returns jsonb language plpgsql stable security invoker
set search_path = pg_catalog, pg_temp
as $$
declare v_result jsonb;
begin
  if p_page < 1 or p_page_size < 0 or p_page_size > 100
    or pg_catalog.length(p_search) > 120 then
    raise exception 'Invalid student page request' using errcode = '22023';
  end if;
  if p_page_size = 0 and p_page <> 1 then
    raise exception 'Export page must be first page' using errcode = '22023';
  end if;
  with filtered as materialized (
    select s.* from public.students s
    where (
      p_status = 'all_shown'
      or (coalesce(p_status,'') = '' and s.status in ('Enrolled','Trial','Alumni'))
      or (p_status not in ('','all_shown') and s.status = p_status)
    )
    and (coalesce(p_age_category,'') = '' or s.age_category = p_age_category)
    and (coalesce(p_session,'') = '' or s.session_type = p_session)
    and (coalesce(p_level,'') = '' or s.niveau_cefr = p_level)
    and (not coalesce(p_incomplete,false) or (s.email is null or s.email = '') and (s.parent_email is null or s.parent_email = ''))
    and (coalesce(p_source,'') = '' or s.referral_source = p_source)
    and (coalesce(p_plan,'') = '' or coalesce(s.plan_type,'Standard') = p_plan)
    and (coalesce(p_search,'') = '' or pg_catalog.strpos(pg_catalog.lower(coalesce(s.full_name,'')),pg_catalog.lower(p_search)) > 0
      or pg_catalog.strpos(pg_catalog.lower(coalesce(s.email,'')),pg_catalog.lower(p_search)) > 0)
  ), rows as (
    select * from filtered order by created_at desc, id asc
    limit nullif(p_page_size,0)
    offset case when p_page_size = 0 then 0 else (p_page - 1) * p_page_size end
  )
  select pg_catalog.jsonb_build_object(
    'rows',coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) order by r.created_at desc,r.id asc) from rows r),'[]'::jsonb),
    'count',(select count(*) from filtered),
    'total',(select count(*) from public.students),
    'active_count',(select count(*) from public.students where status in ('Enrolled','Trial','Alumni'))
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.search_students_page(text,text,text,text,text,boolean,text,text,integer,integer) from public, anon, authenticated;
grant execute on function public.search_students_page(text,text,text,text,text,boolean,text,text,integer,integer) to authenticated;

commit;
