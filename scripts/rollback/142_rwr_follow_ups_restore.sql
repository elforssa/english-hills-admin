-- Restore for migration 142 (RWR-r5 follow-ups, owner approval of 2026-11-26).
-- Run only with its own owner approval. It puts back exactly what 142 changed:
--  * the 140 body of crm_security.evaluate_conversion and the 136 body of
--    public.crm_get_today (live definitions before 142, verbatim), each checked by
--    prosrc md5 afterwards;
--  * EXECUTE for service_role on get_catalogue, catalogue_set_price and
--    catalogue_save_programme;
--  * EXECUTE for authenticated on crm_create_manual_lead (only a pre-B1 build calls it);
--  * DELETE and TRUNCATE for anon, TRUNCATE for authenticated, and DELETE for
--    authenticated on the 16 relations where 142 revoked it (the grants Supabase's
--    default privileges had given; this restores a weaker state on purpose).
-- It refuses, changing nothing, if 142 is not applied (crm_create_manual_lead still
-- executable by authenticated, or either body is not the 142 one). Restore order: this
-- file before scripts/rollback/140_catalogues_restore.sql, which refuses while 142 is
-- applied. The ledger row is removed by the operator wrapper, not here.
begin;

do $$ begin
  if has_function_privilege('authenticated', 'public.crm_create_manual_lead(uuid,jsonb)', 'execute')
     or (select md5(prosrc) from pg_proc where oid = to_regprocedure('crm_security.evaluate_conversion(uuid,timestamp with time zone,text,text)'))
        is distinct from '00e4765cf7de1d4e987b6860fdd64f4d'
     or (select md5(prosrc) from pg_proc where oid = to_regprocedure('public.crm_get_today(integer,integer,integer)'))
        is distinct from '463f07e0f3d599e05df55c22ba33b874' then
    raise exception 'Restore 142: migration 142 is not applied (or a later migration changed its bodies)' using errcode = '55000';
  end if;
end $$;

-- Prior bodies (live 140 definitions, verbatim).
CREATE OR REPLACE FUNCTION crm_security.evaluate_conversion(lead uuid, happened timestamp with time zone, previous_status text DEFAULT NULL::text, evidence text DEFAULT 'linked_confirmed_enrollment'::text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare l public.crm_leads%rowtype; e public.enrollments%rowtype; a uuid; begin
 select * into l from public.crm_leads where id=lead for update;
 if not found or l.enrollment_id is null then return; end if;
 select * into strict e from public.enrollments where id=l.enrollment_id for update;
 if e.student_id is distinct from l.student_id then raise exception 'CRM enrollment/student mismatch' using errcode='23514'; end if;
 if l.status='CONVERTED' then
  if (e.status is null or e.status not in ('Confirmed','Validated')) and not (e.status='Ended' and previous_status in ('Confirmed','Validated'))
   and (not l.conversion_review_required or previous_status is distinct from e.status and previous_status is not null) then
   insert into public.crm_activities(lead_id,enrollment_id,occurred_at,actor_id,actor_kind,event_type,source_key,body,details)
   values(l.id,e.id,happened,auth.uid(),case when auth.uid() is null then 'system' else 'user' end,'conversion_review_required',
    'conversion-review:'||e.id||':'||gen_random_uuid(),'Inscription modifiée après confirmation : vérification par la direction.',
    jsonb_build_object('previous_enrollment_status',previous_status,'enrollment_status',e.status));
   update public.crm_leads set conversion_review_required=true,version=version+1,updated_at=now() where id=l.id;
  end if;
  return;
 end if;
 if e.status is null or e.status not in ('Confirmed','Validated') then return; end if;
 insert into public.crm_activities(lead_id,enrollment_id,attribution_submission_id,occurred_at,actor_id,actor_kind,event_type,source_key,from_status,to_status,body,details)
 values(l.id,e.id,l.first_submission_id,happened,auth.uid(),case when auth.uid() is null then 'system' else 'user' end,'lead_converted',
  'conversion:'||l.id||':'||e.id,l.status,'CONVERTED','Inscription confirmée.',jsonb_build_object('enrollment_status',e.status,'evidence',evidence))
 on conflict(source_key) do nothing returning id into a;
 if a is null then select id into strict a from public.crm_activities where source_key='conversion:'||l.id||':'||e.id; end if;
 -- 140 (§5.4, invariant 11): the converted prospect's programme is its enrollment's.
 update public.crm_leads set status='CONVERTED',converted_at=happened,conversion_activity_id=a,
 conversion_review_required=conversion_review_required or l.status in ('LOST','NOT_QUALIFIED'),
 session_type=e.session_type,
 closure_reason=null,closure_note=null,closed_at=null,version=version+1,updated_at=now() where id=l.id;
 -- 140 (§5.4): the learner's origin is the prospect's when the file has none yet.
 update public.students set origin_code=crm_security.lead_origin(l)
  where id=l.student_id and origin_code is null and crm_security.lead_origin(l) is not null;
 -- System confirmations must work without a browser auth identity as well.
 perform crm_security.set_next_action(l,jsonb_build_object('none',true,'_enrollment_id',e.id,'_happened',happened),'conversion','conversion:'||l.id||':'||e.id);
end $function$;

CREATE OR REPLACE FUNCTION public.crm_get_today(p_limit integer DEFAULT 30, p_offset integer DEFAULT 0, p_schedule_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare result jsonb; start_at timestamptz:=((now() at time zone public.centre_utc_offset())::date)::timestamp at time zone public.centre_utc_offset(); end_at timestamptz;
begin
 perform crm_security.require_reader(false);perform crm_security.check_page(p_limit,p_offset);perform crm_security.check_page(p_limit,p_schedule_offset);
 end_at:=(((now() at time zone public.centre_utc_offset())::date)+1)::timestamp at time zone public.centre_utc_offset();
 with active as (
 select l.id,l.status,l.created_at,coalesce(l.last_attempt_at,l.created_at) last_contact,
 coalesce((select max(greatest(f.completed_at,f.cancelled_at)) from public.crm_tasks f where f.lead_id=l.id and f.status<>'open'),l.created_at) unattended_since,
 p.stale_contacting_minutes,t.id task_id,t.due_at,
 exists(select 1 from public.placement_tests x where x.crm_lead_id=l.id and x.status='Planifié' and (x.date_test+x.heure::time) at time zone public.centre_utc_offset()>=now()) scheduled_test,
 coalesce(t.task_type='first_contact',false) first_contact
 from public.crm_leads l join public.crm_followup_policies p on p.id=l.followup_policy_id
 left join crm_security.next_actions() n on n.lead_id=l.id
 left join lateral(select t.id,t.task_type,case when t.task_type='awaiting_prospect' then null else t.due_at end due_at from public.crm_tasks t where t.id=n.task_id)t on true
 where l.status in ('NEW','CONTACTING','ENGAGED','QUALIFIED') and l.merged_into_lead_id is null
 ), ranked as (
 select id,case when due_at<now() then 1 when status='NEW' and first_contact then 2 when due_at>=start_at and due_at<end_at then 3
 when task_id is null and not scheduled_test then 4 when status='CONTACTING' and last_contact<now()-make_interval(mins=>stale_contacting_minutes) then 5 end priority,
 case when due_at<now() then due_at
 when status='NEW' and first_contact then created_at
 when due_at>=start_at and due_at<end_at then due_at
 when task_id is null then unattended_since else last_contact end sort_at,
 status='CONTACTING' and last_contact<now()-make_interval(mins=>stale_contacting_minutes) stale
 from active
 ), attention as(select id,priority,sort_at,stale from ranked where priority is not null order by priority,sort_at,id limit p_limit offset p_offset),
 appointments as (
 select t.id,t.lead_id,t.task_type,t.due_at,t.version,'task'::text kind,(select crm_security.placement_summary(x) from public.placement_tests x where x.id=t.placement_test_id) placement from public.crm_tasks t join active l on l.id=t.lead_id and t.id=l.task_id
 where t.status='open' and t.task_type<>'awaiting_prospect' and t.due_at>=start_at and t.due_at<end_at
 union all
 select p.id,p.crm_lead_id,'placement_test',(p.date_test+p.heure::time) at time zone public.centre_utc_offset(),null::bigint,'placement',crm_security.placement_summary(p)
 from public.placement_tests p join active a on a.id=p.crm_lead_id where p.status='Planifié' and p.date_test=(now() at time zone public.centre_utc_offset())::date
 and not exists(select 1 from public.crm_tasks k where k.placement_test_id=p.id and k.status='open' and k.task_type='center_visit')
 ), schedule as(select * from appointments order by due_at,kind,id limit p_limit offset p_schedule_offset)
 select jsonb_build_object('as_of',now(),'timezone','Africa/Casablanca',
 'counts',jsonb_build_object('new',(select count(*) from active where status='NEW' and first_contact),
 'overdue',(select count(*) from active a where a.task_id is not null and a.due_at<now()),
 'awaiting',(select count(*) from public.crm_tasks t join active a on a.id=t.lead_id and t.id=a.task_id where t.task_type='awaiting_prospect'),
 'callbacks',(select count(*) from public.crm_tasks t join active a on a.id=t.lead_id and t.id=a.task_id where t.task_type='callback' and t.due_at>=start_at and t.due_at<end_at),
 'due_today',(select count(*) from active a where a.task_id is not null and a.due_at>=start_at and a.due_at<end_at)),
 'attention_total',(select count(*) from ranked where priority is not null),
 'needs_attention',coalesce((select jsonb_agg(crm_security.operational_card(id)||jsonb_build_object('priority',priority,'stale',stale) order by priority,sort_at,id) from attention),'[]'::jsonb),
 'schedule_total',(select count(*) from appointments),
 'today_schedule',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'kind',s.kind,'placement',s.placement,'task_type',s.task_type,'due_at',s.due_at,'version',s.version,'lead',crm_security.operational_card(s.lead_id)) order by s.due_at,s.kind,s.id) from schedule s),'[]'::jsonb)) into result;
 return result;
end $function$;

grant execute on function public.get_catalogue() to service_role;
grant execute on function public.catalogue_set_price(text,text,numeric,text,uuid) to service_role;
grant execute on function public.catalogue_save_programme(text,bigint,jsonb) to service_role;
grant execute on function public.crm_create_manual_lead(uuid,jsonb) to authenticated;

do $$
declare
  keep_delete constant text[] := array['announcements','assessments','authorized_adults','certificates','groups',
    'learning_assessments','leave_requests','messages','payroll','portfolios'];
  drop_delete constant text[] := array['activity_log','anon_rate_limits','app_config','attendance','dismissal_logs',
    'enrollments','notifications','premium_attendance','premium_group_memberships','premium_groups',
    'premium_homework_submissions','premium_sessions','students','teachers','charge_balances','legacy_receipt_reconciliation'];
  t text;
begin
  foreach t in array keep_delete || drop_delete loop
    execute format('grant delete, truncate on public.%I to anon', t);
    execute format('grant truncate on public.%I to authenticated', t);
  end loop;
  foreach t in array drop_delete loop
    execute format('grant delete on public.%I to authenticated', t);
  end loop;
end $$;

-- The restored bodies are exactly the ones 140 left live (142's section 0 map).
do $$
declare f record;
begin
  for f in select * from jsonb_each_text(jsonb_build_object(
      'crm_security.evaluate_conversion(uuid,timestamp with time zone,text,text)', 'b6dc2f58768e80b69f3a5f0572b4f459',
      'public.crm_get_today(integer,integer,integer)', '2be1f5a0187488fd1142db02e8c8c7ec')) loop
    if (select md5(prosrc) from pg_proc where oid = to_regprocedure(f.key)) is distinct from f.value then
      raise exception 'Restore 142: % is not the 140 body after the restore', f.key using errcode = 'XX000';
    end if;
  end loop;
end $$;

commit;
