-- RWR-r5 follow-ups (owner approval of 2026-11-26: one follow-ups PR, Tier 3 where it
-- touches grants or finance). Migration 142: C2 holds 141; this file is renumbered at
-- merge if C2 lands first. Plan: docs/architecture/plans/receptionist-workflow.md,
-- « Follow-ups PR (migration 142) ».
--
-- What it does:
--  1. crm_security.evaluate_conversion: a conversion writes
--     coalesce(enrollment programme, prospect programme), so an enrollment with no
--     programme of its own would not blank the prospect's programme. Defence in depth:
--     the validated check enrollments_confirmed_has_programme (120) means a Confirmed or
--     Validated enrollment always has one today. Live 140 body, one line changed.
--  2. get_catalogue, catalogue_set_price and catalogue_save_programme: EXECUTE revoked
--     from service_role (no server path calls them; the screens call them as
--     authenticated, and the functions refuse a caller with no staff role).
--  3. crm_get_today: the two raw placement_tests.heure::time casts read
--     crm_security.calendar_time (108) instead, so a malformed legacy time (a test
--     with no CRM link, which the placement trigger does not check) can no longer
--     fail the « Aujourd'hui » read. Live 136 body, two casts changed. A CRM test's
--     time is always HH:MI (placement_integrity), so its result is unchanged.
--  4. crm_create_manual_lead: EXECUTE revoked from public, anon, authenticated and
--     service_role (plan deviation 3).
--     No screen, edge function or SQL function calls it since B1 (the screens call
--     crm_create_prospect). The function itself and the shared command branch stay:
--     a trusted (postgres) session still uses it in tests and upgrade rehearsals.
--  5. The 24 public tables (and 2 views) that still granted DELETE and TRUNCATE to anon
--     and authenticated through Supabase's default privileges:
--     * anon: DELETE and TRUNCATE revoked everywhere (no anonymous screen deletes);
--     * authenticated: TRUNCATE revoked everywhere (PostgREST cannot send it; no screen
--       or function truncates);
--     * authenticated: DELETE kept on the 10 tables an RLS-gated screen deletes from
--       (announcements, assessments, authorized_adults, certificates, groups,
--       learning_assessments, leave_requests, messages, payroll, portfolios);
--       placement_tests (the Admissions trash button) already has DELETE only (137);
--     * authenticated: DELETE revoked on the 14 tables no screen deletes from
--       (activity_log, anon_rate_limits, app_config, attendance, dismissal_logs,
--       enrollments, notifications, premium_attendance, premium_group_memberships,
--       premium_groups, premium_homework_submissions, premium_sessions, students,
--       teachers) and on the views charge_balances and legacy_receipt_reconciliation.
--     Foreign-key cascades run as the table owner, so deleting a group still removes
--     what its keys cascade to. service_role is unchanged.
--
-- Unchanged: every other function body, grant and policy; RLS; service_role.
-- Restore: scripts/rollback/142_rwr_follow_ups_restore.sql.

-- ---------------------------------------------------------------------------
-- 0. Preconditions: migration 140 (B2) is applied, and each body 142 re-creates is
--    still the one 140 left live (a cumulative function that differs stops here).
-- ---------------------------------------------------------------------------
do $$
declare f record;
begin
  if to_regprocedure('public.get_catalogue()') is null or to_regclass('public.programmes') is null then
    raise exception 'Migration 142: needs migration 140 (catalogues)' using errcode = '55000';
  end if;
  for f in select * from jsonb_each_text(jsonb_build_object(
      'crm_security.evaluate_conversion(uuid,timestamp with time zone,text,text)', 'b6dc2f58768e80b69f3a5f0572b4f459',
      'public.crm_get_today(integer,integer,integer)', '2be1f5a0187488fd1142db02e8c8c7ec',
      'crm_security.calendar_time(text)', '3500aa82eb9eb62e264a34ac36c55c6a')) loop
    if to_regprocedure(f.key) is null
       or (select md5(prosrc) from pg_proc where oid = to_regprocedure(f.key)) is distinct from f.value then
      raise exception 'Migration 142: % differs from the body 140 left live; rebuild 142 on the live definition', f.key
        using errcode = '55000';
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 1. evaluate_conversion: the enrollment's programme, or the prospect's when the
--    enrollment has none (live 140 body; only the session_type line changes).
-- ---------------------------------------------------------------------------
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
 -- 140 (§5.4, invariant 11): the converted prospect's programme is its enrollment's;
 -- 142: an enrollment with no programme of its own keeps the prospect's.
 update public.crm_leads set status='CONVERTED',converted_at=happened,conversion_activity_id=a,
 conversion_review_required=conversion_review_required or l.status in ('LOST','NOT_QUALIFIED'),
 session_type=coalesce(e.session_type,l.session_type),
 closure_reason=null,closure_note=null,closed_at=null,version=version+1,updated_at=now() where id=l.id;
 -- 140 (§5.4): the learner's origin is the prospect's when the file has none yet.
 update public.students set origin_code=crm_security.lead_origin(l)
  where id=l.student_id and origin_code is null and crm_security.lead_origin(l) is not null;
 -- System confirmations must work without a browser auth identity as well.
 perform crm_security.set_next_action(l,jsonb_build_object('none',true,'_enrollment_id',e.id,'_happened',happened),'conversion','conversion:'||l.id||':'||e.id);
end $function$;

-- ---------------------------------------------------------------------------
-- 2. Catalogue functions: the screens only (authenticated; each refuses a caller with
--    no staff role). No server path calls them as service_role.
-- ---------------------------------------------------------------------------
revoke execute on function public.get_catalogue() from service_role;
revoke execute on function public.catalogue_set_price(text,text,numeric,text,uuid) from service_role;
revoke execute on function public.catalogue_save_programme(text,bigint,jsonb) from service_role;

-- ---------------------------------------------------------------------------
-- 3. crm_get_today: a malformed legacy time reads as no time instead of failing
--    (live 136 body; the two heure::time casts become crm_security.calendar_time).
--    The planner may evaluate the cast on every « Planifié » row before the CRM-link
--    filter, so a legacy row with no CRM link was enough to fail the whole read.
-- ---------------------------------------------------------------------------
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
 exists(select 1 from public.placement_tests x where x.crm_lead_id=l.id and x.status='Planifié' and (x.date_test+crm_security.calendar_time(x.heure)) at time zone public.centre_utc_offset()>=now()) scheduled_test,
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
 select p.id,p.crm_lead_id,'placement_test',(p.date_test+crm_security.calendar_time(p.heure)) at time zone public.centre_utc_offset(),null::bigint,'placement',crm_security.placement_summary(p)
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

-- ---------------------------------------------------------------------------
-- 4. crm_create_manual_lead: no API role (plan deviation 3; every caller moved to
--    crm_create_prospect). The function stays for trusted sessions.
-- ---------------------------------------------------------------------------
revoke execute on function public.crm_create_manual_lead(uuid,jsonb) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. DELETE and TRUNCATE for the API roles (one decision per table; see the header).
-- ---------------------------------------------------------------------------
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
    if to_regclass('public.' || t) is null then
      raise exception 'Migration 142: public.% is missing', t using errcode = '55000';
    end if;
    execute format('revoke delete, truncate on public.%I from anon', t);
    execute format('revoke truncate on public.%I from authenticated', t);
  end loop;
  foreach t in array drop_delete loop
    execute format('revoke delete on public.%I from authenticated', t);
  end loop;
end $$;
