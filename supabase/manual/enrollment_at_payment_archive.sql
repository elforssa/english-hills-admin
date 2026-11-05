-- MANUAL, SEPARATELY APPROVED PRODUCTION DATA STEP R2 (plan enrollment-at-payment.md,
-- EAP-r4, D7 "Archive step"). Not run by any release step or CI. Run only after
-- migration 127, in the same release window, with the owner's release approval of the
-- counts re-read on the day (R0). The declared counts below are the R0 counts of
-- 2026-11-04 (A1 12, A2 2, B 0, C 0, D 0, E 0, G1 1, G2 0, G7 0); re-read them on the
-- day and change the parameters before running if the owner approves other numbers.
--
-- What it changes, in one transaction, journal first (maintenance.eap_archive_journal,
-- ids, statuses and actions only, no personal data):
--   1. every enrollment in Submitted, Under Review or Trial is journalled with its
--      before-image; every learner file it touches and every Trial file without a Trial
--      enrollment (H3) is journalled ('resynced'); every lead link it will clear is
--      journalled ('detached');
--   2. paid rows (B, C, E) become Confirmed (Validated with a group), the missing
--      programme or year taken from the charge as create_charge_payment does; the
--      existing triggers resync the learner file and convert the linked leads (G2);
--   3. unpaid rows (A, D) are ended through academic_security.end_enrollment with the
--      dated reason, then each learner is resynced with a forced downgrade (Q4); a
--      converted lead linked to one gets its review flag (G7, existing rule);
--      3b. every Trial file with no Trial enrollment is resynced (S6);
--   4. each non-converted, unmerged lead linked to a row ended here has its link cleared
--      under eh.crm_detach (learner kept) with an enrollment_detached activity (Q6);
--   5. post-conditions; any failure rolls the whole transaction back.
-- It refuses, changing nothing, when any declared count differs, when a paid row has no
-- programme or year to take (F), when a paid row's learner already has a live
-- Confirmed or Validated enrollment of that programme and year (M), or when an
-- enrollment or payment is in progress for a targeted learner (PT409).
--
-- Plain SQL, one call through the guarded transport (it runs as postgres):
--   supabase db query --linked --project-ref <ref> -f supabase/manual/enrollment_at_payment_archive.sql
-- First with eap.dry_run 'on' (expects the DRYRUN_OK error), then with 'off' on the
-- owner's go. A second run after a successful one finds no row left: every declared
-- count must then be set to 0 (any other value is refused as "counts differ"). Reverse: supabase/manual/enrollment_at_payment_archive_revert.sql (restores
-- enrollment rows, learner statuses and lead links; never the conversions).
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';
-- PARAMETERS (transaction-local).
select set_config('eap.expected_a1', '12', true);  -- unpaid Submitted
select set_config('eap.expected_a2', '2', true);   -- unpaid Under Review
select set_config('eap.expected_b', '0', true);    -- paid below 10 % (Submitted/Under Review)
select set_config('eap.expected_c', '0', true);    -- paid 10 % or more (Submitted/Under Review)
select set_config('eap.expected_d', '0', true);    -- Trial without payment
select set_config('eap.expected_e', '0', true);    -- Trial with payment
select set_config('eap.expected_g1', '1', true);   -- unpaid rows linked to a lead
select set_config('eap.expected_g2', '0', true);   -- paid rows linked to a lead (permanent conversions)
select set_config('eap.expected_g7', '0', true);   -- conversion review flags the step raises
select set_config('eap.dry_run', 'on', true);

do $$ begin
  if to_regclass('maintenance.eap_archive_journal') is null
     or to_regprocedure('public.crm_enroll_and_collect(uuid,jsonb)') is null
     or to_regprocedure('academic_security.guard_retired_enrollment_status()') is null then
    raise exception 'EAP archive refused: migration 127 is not applied' using errcode = '55000';
  end if;
end $$;

-- The R0 "live" rows, with the charge that gives a paid row its programme and year.
create temp table eap_target on commit drop as
select e.id as enrollment_id, e.student_id, e.status, e.group_id, e.session_type, e.school_year,
  x.paid, x.net, x.paid > 0 as is_paid,
  (select l.id from public.crm_leads l where l.enrollment_id = e.id and l.merged_into_lead_id is null) as lead_id,
  ch.session_type as charge_session, ch.school_year as charge_year
from public.enrollments e
cross join lateral (select
    (select coalesce(sum(r.montant_paye), 0) from public.receipts r
      where r.voided_at is null and r.deleted_at is null
        and (r.enrollment_id = e.id or r.charge_id in (select c.id from public.charges c where c.enrollment_id = e.id))) as paid,
    (select coalesce(sum(c.gross_amount - c.discount_amount), 0) from public.charges c
      where c.enrollment_id = e.id and c.voided_at is null) as net) x
left join lateral (select c.session_type, c.school_year from public.charges c
    where c.voided_at is null and (c.enrollment_id = e.id
      or c.id in (select r.charge_id from public.receipts r where r.enrollment_id = e.id
        and r.voided_at is null and r.deleted_at is null))
    order by (c.school_year is null), c.created_at desc, c.id desc limit 1) ch on true
where e.status in ('Submitted', 'Under Review', 'Trial');

-- G7: converted, unflagged leads linked to an unpaid row (the existing downgrade rule flags each).
create temp table eap_g7 on commit drop as
select l.id as lead_id from public.crm_leads l join eap_target t on t.enrollment_id = l.enrollment_id
where not t.is_paid and l.merged_into_lead_id is null and l.status = 'CONVERTED' and not l.conversion_review_required;

do $$
declare
  v_run uuid := gen_random_uuid();
  v_t record;
  v_n integer;
  v_a1 integer; v_a2 integer; v_b integer; v_c integer; v_d integer; v_e integer;
  v_g1 integer; v_g2 integer; v_g7 integer;
  v_flag text;
  v_day text := to_char(academic_security.today(), 'DD/MM/YYYY');
  v_confirmed_before integer; v_ended_before integer;
  v_deliveries bigint; v_epochs bigint; v_intents bigint;
  v_expected_detach integer; v_detached integer;
  v_paid integer; v_unpaid integer;
begin
  select count(*) filter (where status = 'Submitted' and not is_paid),
         count(*) filter (where status = 'Under Review' and not is_paid),
         count(*) filter (where status in ('Submitted','Under Review') and is_paid and paid * 10 < net),
         count(*) filter (where status in ('Submitted','Under Review') and is_paid and paid * 10 >= net),
         count(*) filter (where status = 'Trial' and not is_paid),
         count(*) filter (where status = 'Trial' and is_paid),
         count(*) filter (where not is_paid and lead_id is not null),
         count(*) filter (where is_paid and lead_id is not null)
    into v_a1, v_a2, v_b, v_c, v_d, v_e, v_g1, v_g2 from eap_target;
  select count(*) into v_g7 from eap_g7;
  if v_a1 <> current_setting('eap.expected_a1')::integer or v_a2 <> current_setting('eap.expected_a2')::integer
     or v_b <> current_setting('eap.expected_b')::integer or v_c <> current_setting('eap.expected_c')::integer
     or v_d <> current_setting('eap.expected_d')::integer or v_e <> current_setting('eap.expected_e')::integer
     or v_g1 <> current_setting('eap.expected_g1')::integer or v_g2 <> current_setting('eap.expected_g2')::integer
     or v_g7 <> current_setting('eap.expected_g7')::integer then
    raise exception 'EAP archive refused: counts differ from the declared ones (found A1 % A2 % B % C % D % E % G1 % G2 % G7 %)',
      v_a1, v_a2, v_b, v_c, v_d, v_e, v_g1, v_g2, v_g7 using errcode = '22023';
  end if;
  -- F: a paid row needs a programme and a year.
  if exists (select 1 from eap_target where is_paid
      and (coalesce(session_type, charge_session) is null or coalesce(charge_year, school_year) is null)) then
    raise exception 'EAP archive refused: a paid row has no programme or year to take from its charge' using errcode = '22023';
  end if;
  -- M: a paid row cannot become a second live enrollment of one programme and year.
  if exists (select 1 from eap_target t join public.enrollments e on e.student_id = t.student_id and e.id <> t.enrollment_id
      where t.is_paid and e.status in ('Confirmed','Validated')
        and e.session_type = coalesce(t.session_type, t.charge_session)
        and e.school_year = coalesce(t.charge_year, t.school_year)) then
    raise exception 'EAP archive refused: a paid row''s learner already has a live enrollment of that programme and year' using errcode = '22023';
  end if;

  -- P1.1 locks: shared enrollment-intent lock, then learners, then enrollments.
  for v_t in select distinct student_id from eap_target
      union select s.id from public.students s where s.status = 'Trial' and s.deleted_at is null
        and not exists (select 1 from public.enrollments e where e.student_id = s.id and e.status = 'Trial')
      order by 1 loop
    if not pg_try_advisory_xact_lock_shared(hashtextextended('crm:enrollment-intent:' || v_t.student_id, 0)) then
      raise exception 'EAP archive refused: enrollment or payment in progress for a learner; retry later' using errcode = 'PT409';
    end if;
    perform 1 from public.students where id = v_t.student_id for update;
  end loop;
  perform 1 from public.enrollments e join eap_target t on t.enrollment_id = e.id order by e.id for update of e;
  perform 1 from public.crm_leads l join eap_target t on t.lead_id = l.id order by l.id for update of l;

  select count(*) filter (where status in ('Confirmed','Validated')), count(*) filter (where status = 'Ended')
    into v_confirmed_before, v_ended_before from public.enrollments;
  select count(*) into v_deliveries from public.crm_external_deliveries;
  select count(*) into v_epochs from public.crm_lifecycle_activation_epochs;
  select count(*) into v_intents from public.crm_lifecycle_pending_intents;

  -- 1. Journal first.
  insert into maintenance.eap_archive_journal(run_id, action, entity, row_id, before)
  select v_run, case when t.is_paid then 'confirmed' else 'ended' end, 'enrollments', e.id,
    jsonb_build_object('status', e.status, 'group_id', e.group_id, 'session_type', e.session_type,
      'school_year', e.school_year, 'level', e.level, 'ended_at', e.ended_at, 'ended_by', e.ended_by,
      'end_reason', e.end_reason, 'ended_group_id', e.ended_group_id)
  from eap_target t join public.enrollments e on e.id = t.enrollment_id order by e.id;
  insert into maintenance.eap_archive_journal(run_id, action, entity, row_id, before)
  select v_run, 'resynced', 'students', s.id,
    jsonb_build_object('status', s.status, 'groupe_id', s.groupe_id, 'session_type', s.session_type, 'niveau_cefr', s.niveau_cefr)
  from public.students s
  where s.id in (select student_id from eap_target)
     or (s.status = 'Trial' and s.deleted_at is null
         and not exists (select 1 from public.enrollments e where e.student_id = s.id and e.status = 'Trial'))
  order by s.id;
  insert into maintenance.eap_archive_journal(run_id, action, entity, row_id, before)
  select v_run, 'detached', 'crm_leads', l.id,
    jsonb_build_object('enrollment_id', l.enrollment_id, 'status', l.status, 'version', l.version)
  from public.crm_leads l join eap_target t on t.lead_id = l.id
  where not t.is_paid and l.status <> 'CONVERTED' and l.converted_at is null
  order by l.id;
  get diagnostics v_expected_detach = row_count;

  -- 2. Paid rows: Confirmed (Validated with a group through check_enrollment_student_sync).
  for v_t in select * from eap_target where is_paid order by enrollment_id loop
    update public.enrollments e set
      session_type = coalesce(e.session_type, v_t.charge_session),
      school_year = coalesce(v_t.charge_year, e.school_year, crm_security.enrollment_year(e)),
      status = case when e.status = 'Trial' then 'Validated' else 'Confirmed' end
    where e.id = v_t.enrollment_id;
  end loop;

  -- 3. Unpaid rows: ended with the dated reason, then the learner resynced (Q4).
  for v_t in select * from eap_target where not is_paid order by enrollment_id loop
    if not academic_security.end_enrollment(v_t.enrollment_id, case when v_t.status = 'Trial'
        then 'Essai terminé (retrait des essais, ' || v_day || ')'
        else 'Pré-inscription abandonnée (retrait des pré-inscriptions, ' || v_day || ')' end) then
      raise exception 'EAP archive failed: enrollment % was not ended', v_t.enrollment_id;
    end if;
  end loop;
  for v_t in select distinct student_id, (select t2.group_id from eap_target t2 where t2.student_id = t.student_id
        and not t2.is_paid and t2.group_id is not null order by t2.enrollment_id limit 1) as old_group
      from eap_target t where not is_paid order by 1 loop
    perform public.sync_student_from_enrollments(v_t.student_id, true, v_t.old_group);
  end loop;
  -- 3b (S6): Trial files with no Trial enrollment.
  for v_t in select s.id from public.students s where s.status = 'Trial' and s.deleted_at is null
      and not exists (select 1 from public.enrollments e where e.student_id = s.id and e.status = 'Trial') order by s.id loop
    perform public.sync_student_from_enrollments(v_t.id, true, null);
  end loop;

  -- 4. Detach (Q6): non-converted leads linked to a row ended here; the learner is kept.
  v_flag := academic_security.set_flag('eh.crm_detach', 'on');
  for v_t in select j.row_id as lead_id, (j.before->>'enrollment_id')::uuid as enrollment_id
      from maintenance.eap_archive_journal j where j.run_id = v_run and j.action = 'detached' order by j.row_id loop
    update public.crm_leads set enrollment_id = null, version = version + 1, updated_at = now()
    where id = v_t.lead_id and enrollment_id = v_t.enrollment_id;
    if not found then raise exception 'EAP archive failed: lead % was not detached', v_t.lead_id; end if;
    insert into public.crm_activities(lead_id, enrollment_id, occurred_at, actor_id, actor_kind, event_type, source_key, body, details)
    values (v_t.lead_id, v_t.enrollment_id, statement_timestamp(), null, 'system', 'enrollment_detached',
      'eap-archive-detach:' || v_t.lead_id || ':' || v_t.enrollment_id,
      'Pré-inscription archivée : le prospect peut être inscrit à l''encaissement.',
      jsonb_build_object('reason', 'enrollment_at_payment_archive', 'archived_enrollment_id', v_t.enrollment_id));
  end loop;
  perform academic_security.set_flag('eh.crm_detach', v_flag);

  -- After-images.
  update maintenance.eap_archive_journal j set after = jsonb_build_object('status', e.status, 'group_id', e.group_id,
      'session_type', e.session_type, 'school_year', e.school_year, 'level', e.level, 'ended_at', e.ended_at,
      'end_reason', e.end_reason, 'ended_group_id', e.ended_group_id)
  from public.enrollments e where j.run_id = v_run and j.entity = 'enrollments' and e.id = j.row_id;
  update maintenance.eap_archive_journal j set after = jsonb_build_object('status', s.status, 'groupe_id', s.groupe_id,
      'session_type', s.session_type, 'niveau_cefr', s.niveau_cefr)
  from public.students s where j.run_id = v_run and j.entity = 'students' and s.id = j.row_id;
  update maintenance.eap_archive_journal j set after = jsonb_build_object('enrollment_id', l.enrollment_id,
      'status', l.status, 'version', l.version)
  from public.crm_leads l where j.run_id = v_run and j.entity = 'crm_leads' and l.id = j.row_id;

  -- 5. Post-conditions.
  select count(*) filter (where is_paid), count(*) filter (where not is_paid) into v_paid, v_unpaid from eap_target;
  if exists (select 1 from public.enrollments where status in ('Submitted','Under Review','Trial')) then
    raise exception 'EAP archive after-check failed: rows remain in a retired status';
  end if;
  if (select count(*) from public.enrollments where status in ('Confirmed','Validated')) <> v_confirmed_before + v_paid
     or (select count(*) from public.enrollments where status = 'Ended') <> v_ended_before + v_unpaid then
    raise exception 'EAP archive after-check failed: Confirmed/Validated or Ended totals did not move by the targeted numbers';
  end if;
  if exists (select 1 from eap_target t join public.crm_leads l on l.id = t.lead_id
      where t.is_paid and (l.status <> 'CONVERTED' or not exists (select 1 from public.crm_activities a
        where a.lead_id = l.id and a.event_type = 'lead_converted' and a.enrollment_id = t.enrollment_id))) then
    raise exception 'EAP archive after-check failed: a paid row''s lead is not converted with its activity';
  end if;
  select count(*) into v_n from eap_g7 g join public.crm_leads l on l.id = g.lead_id and l.conversion_review_required
  where exists (select 1 from public.crm_activities a where a.lead_id = g.lead_id
    and a.event_type = 'conversion_review_required' and a.created_at = now());
  if v_n <> current_setting('eap.expected_g7')::integer then
    raise exception 'EAP archive after-check failed: % review flags raised, % declared', v_n, current_setting('eap.expected_g7');
  end if;
  select count(*) into v_detached from maintenance.eap_archive_journal j
  join public.crm_leads l on l.id = j.row_id and l.enrollment_id is null
  join public.crm_activities a on a.lead_id = l.id and a.event_type = 'enrollment_detached'
    and a.source_key = 'eap-archive-detach:' || l.id || ':' || (j.before->>'enrollment_id')
  where j.run_id = v_run and j.action = 'detached';
  if v_detached <> v_expected_detach
     or exists (select 1 from public.crm_leads l join eap_target t on t.lead_id = l.id
       where not t.is_paid and l.enrollment_id = t.enrollment_id and l.status <> 'CONVERTED') then
    raise exception 'EAP archive after-check failed: % of % leads detached', v_detached, v_expected_detach;
  end if;
  if exists (select 1 from public.students s where s.status = 'Trial' and s.deleted_at is null
      and not exists (select 1 from public.enrollments e where e.student_id = s.id and e.status = 'Trial')) then
    raise exception 'EAP archive after-check failed: a learner file keeps the Trial status';
  end if;
  if exists (select 1 from public.students s join eap_target t on t.student_id = s.id
      where not t.is_paid and s.status = 'Prospect'
        and not exists (select 1 from public.enrollments e where e.student_id = s.id and e.status in ('Confirmed','Validated','Trial'))) then
    raise exception 'EAP archive after-check failed: a learner with only ended rows is still Prospect (Q4)';
  end if;
  if (select count(*) from public.crm_external_deliveries) <> v_deliveries
     or (select count(*) from public.crm_lifecycle_activation_epochs) <> v_epochs
     or (select count(*) from public.crm_lifecycle_pending_intents) <> v_intents then
    raise exception 'EAP archive after-check failed: the lifecycle outbox changed';
  end if;
  if (select count(*) from maintenance.eap_archive_journal where run_id = v_run and entity = 'enrollments') <> v_paid + v_unpaid then
    raise exception 'EAP archive after-check failed: journal incomplete';
  end if;

  if current_setting('eap.dry_run') = 'on' then
    raise exception 'DRYRUN_OK EAP archive run=% confirmed=% ended=% detached=% review_flags=%',
      v_run, v_paid, v_unpaid, v_detached, current_setting('eap.expected_g7');
  end if;
end $$;
commit;
-- The transport returns only this statement's rows: the journal of every run, by action.
select run_id, action, entity, count(*) as rows, min(at) as at
from maintenance.eap_archive_journal group by run_id, action, entity order by min(at), action, entity;
