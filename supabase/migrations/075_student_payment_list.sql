begin;

-- Add a live, per-student payment summary to the paginated student list.
-- The charge_balances view already excludes voided/deleted receipts from paid
-- amounts. Void charges are excluded here, as they are on the student detail.
drop function public.search_students_page(text,text,text,text,text,boolean,text,text,integer,integer,text);

create function public.search_students_page(
  p_search text default '',
  p_status text default '',
  p_age_category text default '',
  p_session text default '',
  p_level text default '',
  p_incomplete boolean default false,
  p_source text default '',
  p_plan text default '',
  p_page integer default 1,
  p_page_size integer default 20,
  p_group text default '',
  p_payment text default ''
) returns jsonb language plpgsql stable security invoker
set search_path = pg_catalog, pg_temp
as $$
declare v_result jsonb;
begin
  if p_page < 1 or p_page_size < 0 or p_page_size > 100
    or pg_catalog.length(p_search) > 120
    or coalesce(p_payment, '') not in ('', 'due', 'unpaid', 'partial', 'overdue', 'paid', 'none') then
    raise exception 'Invalid student page request' using errcode = '22023';
  end if;
  if p_page_size = 0 and p_page <> 1 then
    raise exception 'Export page must be first page' using errcode = '22023';
  end if;

  with finance as materialized (
    select c.student_id,
      count(*) as charge_count,
      sum(c.balance)::numeric(12,2) as payment_balance,
      bool_or(c.balance > 0 and c.settlement_status = 'En retard') as has_overdue,
      bool_or(c.balance > 0 and c.paid_amount > 0) as has_partial
    from public.charge_balances c
    where c.voided_at is null
    group by c.student_id
  ), candidates as materialized (
    select s.*,
      (select g.name from public.groups g where g.id = s.groupe_id) as group_name,
      coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at, e.id)
        from public.enrollments e where e.student_id = s.id
          and e.status = 'Confirmed' and e.group_id is null), '[]'::jsonb) as pending_enrollments,
      coalesce(f.payment_balance, 0)::numeric(12,2) as payment_balance,
      case
        when f.charge_count is null then 'Aucun engagement'
        when f.payment_balance <= 0 then 'Soldé'
        when f.has_overdue then 'En retard'
        when f.has_partial then 'Acompte versé'
        else 'En attente'
      end as payment_status
    from public.students s
    left join finance f on f.student_id = s.id
    where (
      p_status = 'all_shown'
      or (coalesce(p_status,'') = '' and s.status in ('Enrolled','Trial','Alumni'))
      or (p_status not in ('','all_shown') and s.status = p_status)
    )
    and (coalesce(p_group,'') = '' or
      (p_group = 'unassigned' and (s.groupe_id is null or exists (
        select 1 from public.enrollments e where e.student_id = s.id
          and e.status = 'Confirmed' and e.group_id is null))))
    and (coalesce(p_age_category,'') = '' or s.age_category = p_age_category)
    and (coalesce(p_session,'') = '' or s.session_type = p_session)
    and (coalesce(p_level,'') = '' or s.niveau_cefr = p_level)
    and (not coalesce(p_incomplete,false) or (s.email is null or s.email = '') and (s.parent_email is null or s.parent_email = ''))
    and (coalesce(p_source,'') = '' or s.referral_source = p_source)
    and (coalesce(p_plan,'') = '' or coalesce(s.plan_type,'Standard') = p_plan)
    and (coalesce(p_search,'') = '' or pg_catalog.strpos(pg_catalog.lower(coalesce(s.full_name,'')),pg_catalog.lower(p_search)) > 0
      or pg_catalog.strpos(pg_catalog.lower(coalesce(s.email,'')),pg_catalog.lower(p_search)) > 0)
  ), filtered as materialized (
    select * from candidates
    where coalesce(p_payment, '') = ''
      or (p_payment = 'due' and payment_balance > 0)
      or (p_payment = 'unpaid' and payment_status = 'En attente')
      or (p_payment = 'partial' and payment_status = 'Acompte versé')
      or (p_payment = 'overdue' and payment_status = 'En retard')
      or (p_payment = 'paid' and payment_status = 'Soldé')
      or (p_payment = 'none' and payment_status = 'Aucun engagement')
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

revoke all on function public.search_students_page(text,text,text,text,text,boolean,text,text,integer,integer,text,text) from public, anon, authenticated;
grant execute on function public.search_students_page(text,text,text,text,text,boolean,text,text,integer,integer,text,text) to authenticated;

notify pgrst, 'reload schema';
commit;
