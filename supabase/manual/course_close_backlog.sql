-- MANUAL, SEPARATELY APPROVED PRODUCTION DATA STEP R2 (plan course-dates-close.md, CDC-r3,
-- D10 "Data step"). Not run by any release step or CI outside the local rehearsal. Run only
-- after migration 128, in the same release window, with the owner's release approval of the
-- counts re-read on the day (R0), through the guarded transport, as the migration role, in
-- one transaction. Dry run by default.
--
-- PROGRAMME SETS (Q12 = A). Mise à niveau is in the step (S1, the default). Adults and the
-- two One-to-One programmes are separately declared sets that stay OFF until the owner
-- confirms, per programme, that it is entirely finished:
--   cdc.adults      'on' only after the owner's confirmation for Adults;
--   cdc.one_to_one  'on' only after the owner's confirmation for One-to-One (in person and
--                   online, one set, as the R0 scenarios S3 and S4 count them).
-- The switches give the scenario: S1 (both off), S2 (Adults), S3 (One-to-One), S4 (both).
--
-- DECLARED COUNTS (S9). R0 of 2026-11-05 (read-only, counts only):
--   T2 per programme: Mise à niveau 18, Adults 10, One-to-One 2, Online One-to-One 1, all 2026/2027;
--   T3 (files that stay « Inscrit ») / T4 (files that become « Ancien apprenant »):
--     S1 6 / 12, S2 6 / 22, S3 6 / 14, S4 6 / 24;
--   A4 (card « Inscrits — groupe à affecter » after the step): S1 20, S2 10, S3 17, S4 7.
-- Re-read them on the day (R0) and change the parameters before running if the owner
-- approves other numbers. Any difference raises and changes nothing. A second run after a
-- successful one finds no target: every T2/T3/T4 of the active scenario must then be 0
-- and A4 the card of the day.
--
-- What it changes, in one transaction, journal first (maintenance.course_close_journal,
-- source 'backlog_step', one run_id; ids, statuses, groups, years and charge ids only):
--   1. targets: Confirmed, no group, an active programme, school year cdc.school_year;
--      refused (PT409, nothing changed) when an enrollment or payment is in progress for a
--      targeted learner (the payment path's intent lock) or a target changed meanwhile;
--   2. the run row, the enrollment before-images ('ended'), the learner-file before-images
--      ('resynced') and the charge links ('charge_linked');
--   3. charges (S6, N-2): the D3 charge link rule (academic_security.course_link_charges)
--      links each partly paid open unlinked tuition charge of the target's learner,
--      programme and year (and an undated one created during that year, the current one)
--      to the target. « Engagements » (nothing paid) and undated charges of earlier years
--      are never linked. Amounts, receipts and settlement are untouched;
--   4. one academic_security.leave(learner, 'Alumni', <programme reason>, <that learner's
--      targets of that programme>) per learner and programme, programmes in the fixed order
--      Mise à niveau, Adults, One-to-One, Online One-to-One, learners in id order;
--   5. post-conditions; any failure rolls the whole transaction back.
-- Rows ended here are ordinary ended enrollments: « Rouvrir l'inscription » works on them
-- (Q13 = A). Reverse: supabase/manual/course_close_backlog_revert.sql (its own approval).
--
-- Plain SQL, one call through the guarded transport (it runs as postgres):
--   supabase db query --linked --project-ref <ref> -f supabase/manual/course_close_backlog.sql
-- First with cdc.dry_run 'on' (expects the DRYRUN_OK error), then with 'off' on the owner's go.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';
-- PARAMETERS (transaction-local).
select set_config('cdc.school_year', '2026/2027', true);
select set_config('cdc.adults', 'off', true);       -- OFF until the owner confirms Adults (Q12)
select set_config('cdc.one_to_one', 'off', true);   -- OFF until the owner confirms One-to-One (Q12)
-- T2, per programme (checked only for the active programmes).
select set_config('cdc.expected_mise_a_niveau', '18', true);
select set_config('cdc.expected_adults', '10', true);
select set_config('cdc.expected_one_to_one', '2', true);
select set_config('cdc.expected_online_one_to_one', '1', true);
-- T3 / T4 / A4, per scenario (only the active scenario's line is checked).
select set_config('cdc.expected_s1', '6/12/20', true);
select set_config('cdc.expected_s2', '6/22/10', true);
select set_config('cdc.expected_s3', '6/14/17', true);
select set_config('cdc.expected_s4', '6/24/7', true);
select set_config('cdc.dry_run', 'on', true);

do $$ begin
  if to_regclass('maintenance.course_close_journal') is null
     or to_regprocedure('academic_security.course_link_charges(uuid)') is null
     or to_regprocedure('public.close_course(uuid,integer,text,uuid[],uuid[])') is null then
    raise exception 'CDC backlog refused: migration 128 is not applied' using errcode = '55000';
  end if;
  if current_setting('cdc.adults') not in ('on', 'off') or current_setting('cdc.one_to_one') not in ('on', 'off')
     or current_setting('cdc.dry_run') not in ('on', 'off')
     or not academic_security.valid_school_year(current_setting('cdc.school_year')) then
    raise exception 'CDC backlog refused: invalid parameters' using errcode = '22023';
  end if;
end $$;

-- The active programmes, with their fixed order and their reason.
create temp table cdc_programme on commit drop as
select p.ord, p.session_type, p.reason, p.expected from (values
  (1, 'Mise à niveau', 'Mise à niveau terminée', current_setting('cdc.expected_mise_a_niveau')::integer, true),
  (2, 'Adults', 'Session Adults terminée', current_setting('cdc.expected_adults')::integer, current_setting('cdc.adults') = 'on'),
  (3, 'One-to-One', 'Cours individuel terminé', current_setting('cdc.expected_one_to_one')::integer, current_setting('cdc.one_to_one') = 'on'),
  (4, 'Online One-to-One', 'Cours individuel terminé', current_setting('cdc.expected_online_one_to_one')::integer, current_setting('cdc.one_to_one') = 'on')
) p(ord, session_type, reason, expected, active)
where p.active;

-- The targets (R0 lines T1/T2), with the R0 notion of a file that stays « Inscrit » (T3).
create temp table cdc_target on commit drop as
select e.id as enrollment_id, e.student_id, e.session_type, e.school_year, p.ord, p.reason
from public.enrollments e join cdc_programme p on p.session_type = e.session_type
where e.status = 'Confirmed' and e.group_id is null and e.school_year = current_setting('cdc.school_year');

do $$
declare
  v_run uuid := gen_random_uuid();
  v_scenario text := case when current_setting('cdc.adults') = 'on' and current_setting('cdc.one_to_one') = 'on' then 's4'
    when current_setting('cdc.adults') = 'on' then 's2' when current_setting('cdc.one_to_one') = 'on' then 's3' else 's1' end;
  v_declared text[];
  v_t record;
  v_n integer;
  v_targets integer; v_t3 integer; v_t4 integer;
  v_card_before integer; v_a2_before integer; v_card integer;
  v_ended integer := 0; v_linked integer := 0;
  v_charges bigint; v_charge_sum numeric; v_balance_sum numeric; v_receipts bigint; v_receipt_sum numeric;
  v_attendance bigint; v_leads bigint; v_lead_sum text; v_activities bigint;
  v_deliveries bigint; v_epochs bigint; v_intents bigint;
  v_stay uuid[]; v_alumni uuid[];
begin
  v_declared := string_to_array(current_setting('cdc.expected_' || v_scenario), '/');
  if cardinality(v_declared) <> 3 then
    raise exception 'CDC backlog refused: cdc.expected_% must be T3/T4/A4', v_scenario using errcode = '22023';
  end if;

  -- T2, per active programme.
  for v_t in select p.session_type, p.expected, (select count(*) from cdc_target t where t.session_type = p.session_type) as n
      from cdc_programme p order by p.ord loop
    if v_t.n <> v_t.expected then
      raise exception 'CDC backlog refused: % targets of % found, % declared', v_t.n, v_t.session_type, v_t.expected
        using errcode = '22023';
    end if;
  end loop;
  select count(*) into v_targets from cdc_target;
  -- T3 / T4 as R0 counts them: a file stays « Inscrit » when a live enrollment outside the targets remains.
  v_stay := array(select distinct t.student_id from cdc_target t where exists (select 1 from public.enrollments y
    where y.student_id = t.student_id and y.status in ('Submitted','Under Review','Confirmed','Validated','Trial')
      and y.id not in (select enrollment_id from cdc_target)) order by 1);
  v_alumni := array(select distinct t.student_id from cdc_target t where not (t.student_id = any(v_stay)) order by 1);
  v_t3 := cardinality(v_stay); v_t4 := cardinality(v_alumni);
  select count(*) filter (where session_type <> 'Other'), count(*) into v_card_before, v_a2_before
  from public.enrollments where status = 'Confirmed' and group_id is null;
  if v_t3 <> v_declared[1]::integer or v_t4 <> v_declared[2]::integer
     or v_card_before - v_targets <> v_declared[3]::integer then
    raise exception 'CDC backlog refused: scenario % found T3 % T4 % A4 %, declared % / % / %', upper(v_scenario),
      v_t3, v_t4, v_card_before - v_targets, v_declared[1], v_declared[2], v_declared[3] using errcode = '22023';
  end if;
  -- Zero checks (R0 T5/T6): archived or not-Enrolled files are refused.
  if exists (select 1 from cdc_target t join public.students s on s.id = t.student_id
      where s.deleted_at is not null or s.status is distinct from 'Enrolled') then
    raise exception 'CDC backlog refused: a target''s learner file is archived or not « Inscrit »' using errcode = '22023';
  end if;
  -- A re-run that finds no target (every count declared 0) writes nothing, not even a run row.
  if v_targets = 0 then
    if current_setting('cdc.dry_run') = 'on' then
      raise exception 'DRYRUN_OK CDC backlog run=none scenario=% ended=0 stay_enrolled=0 alumni=0 charges_linked=0 card=%',
        upper(v_scenario), v_card_before;
    end if;
    raise notice 'CDC backlog: scenario % found no target; nothing written', upper(v_scenario);
    return;
  end if;

  -- Locks: the enrollment-intent lock of the payment path, then learners, then enrollments (id order).
  for v_t in select distinct student_id from cdc_target order by 1 loop
    if not pg_try_advisory_xact_lock_shared(hashtextextended('crm:enrollment-intent:' || v_t.student_id, 0)) then
      raise exception 'CDC backlog refused: enrollment or payment in progress for a learner; retry later' using errcode = 'PT409';
    end if;
    perform 1 from public.students where id = v_t.student_id for update;
  end loop;
  perform 1 from public.enrollments e join cdc_target t on t.enrollment_id = e.id order by e.id for update of e;
  if exists (select 1 from cdc_target t join public.enrollments e on e.id = t.enrollment_id
      where e.status is distinct from 'Confirmed' or e.group_id is not null) then
    raise exception 'CDC backlog refused: a target changed meanwhile; re-read the counts' using errcode = 'PT409';
  end if;

  -- Before-images for the post-conditions.
  select count(*), coalesce(sum(gross_amount - discount_amount), 0) into v_charges, v_charge_sum from public.charges;
  select coalesce(sum(balance), 0) into v_balance_sum from public.charge_balances;
  select count(*), coalesce(sum(montant_paye), 0) into v_receipts, v_receipt_sum from public.receipts;
  select count(*) into v_attendance from public.attendance;
  select count(*), md5(coalesce(string_agg(l.id::text || ':' || l.status || ':' || coalesce(l.enrollment_id::text, '-')
      || ':' || l.version::text, ',' order by l.id), '')) into v_leads, v_lead_sum from public.crm_leads l;
  select count(*) into v_activities from public.crm_activities;
  select count(*) into v_deliveries from public.crm_external_deliveries;
  select count(*) into v_epochs from public.crm_lifecycle_activation_epochs;
  select count(*) into v_intents from public.crm_lifecycle_pending_intents;

  -- 1. Journal first: the run row, the enrollments, the learner files, the charge links.
  insert into maintenance.course_close_journal(run_id, source, action, entity, row_id, before)
  values (v_run, 'backlog_step', 'run', 'runs', v_run, jsonb_build_object('scenario', upper(v_scenario),
    'school_year', current_setting('cdc.school_year'),
    'programmes', (select jsonb_agg(p.session_type order by p.ord) from cdc_programme p),
    'targets', v_targets, 't3', v_t3, 't4', v_t4, 'a4', v_card_before - v_targets));
  insert into maintenance.course_close_journal(run_id, source, action, entity, row_id, before)
  select v_run, 'backlog_step', 'ended', 'enrollments', e.id,
    jsonb_build_object('status', e.status, 'group_id', e.group_id, 'level', e.level, 'school_year', e.school_year,
      'session_type', e.session_type, 'student_id', e.student_id, 'reason', t.reason)
  from cdc_target t join public.enrollments e on e.id = t.enrollment_id order by e.id;
  insert into maintenance.course_close_journal(run_id, source, action, entity, row_id, before)
  select v_run, 'backlog_step', 'resynced', 'students', s.id, jsonb_build_object('status', s.status, 'groupe_id', s.groupe_id)
  from public.students s where s.id in (select student_id from cdc_target) order by s.id;

  -- 2. Charges (S6, N-2), before anything ends.
  for v_t in select t.enrollment_id, l.charge_id from cdc_target t
      cross join lateral academic_security.course_link_charges(t.enrollment_id) l order by t.enrollment_id, l.charge_id loop
    insert into maintenance.course_close_journal(run_id, source, action, entity, row_id, before, after)
    values (v_run, 'backlog_step', 'charge_linked', 'charges', v_t.charge_id, jsonb_build_object('enrollment_id', null),
      jsonb_build_object('enrollment_id', v_t.enrollment_id));
    update public.charges set enrollment_id = v_t.enrollment_id where id = v_t.charge_id and enrollment_id is null;
    if not found then raise exception 'CDC backlog failed: charge % was not linked', v_t.charge_id; end if;
    v_linked := v_linked + 1;
  end loop;

  -- 3. End (S9): one leave per learner and programme; programmes in fixed order, learners in id order.
  for v_t in select t.ord, t.student_id, min(t.reason) as reason, array_agg(t.enrollment_id order by t.enrollment_id) as ids
      from cdc_target t group by t.ord, t.student_id order by t.ord, t.student_id loop
    v_ended := v_ended + academic_security.leave(v_t.student_id, 'Alumni', v_t.reason, v_t.ids);
  end loop;

  -- After-images.
  update maintenance.course_close_journal j set after = jsonb_build_object('status', e.status, 'ended_at', e.ended_at,
      'end_reason', e.end_reason, 'ended_group_id', e.ended_group_id)
  from public.enrollments e where j.run_id = v_run and j.entity = 'enrollments' and e.id = j.row_id;
  update maintenance.course_close_journal j set after = jsonb_build_object('status', s.status, 'groupe_id', s.groupe_id)
  from public.students s where j.run_id = v_run and j.entity = 'students' and s.id = j.row_id;

  -- 4. Post-conditions.
  if v_ended <> v_targets or exists (select 1 from cdc_target t join public.enrollments e on e.id = t.enrollment_id
      where e.status is distinct from 'Ended' or e.end_reason is distinct from t.reason) then
    raise exception 'CDC backlog after-check failed: % of % targets ended with their programme''s reason', v_ended, v_targets;
  end if;
  select count(*) filter (where session_type <> 'Other') into v_card
  from public.enrollments where status = 'Confirmed' and group_id is null;
  if (select count(*) from public.enrollments where status = 'Confirmed' and group_id is null) <> v_a2_before - v_targets
     or v_card <> v_declared[3]::integer then
    raise exception 'CDC backlog after-check failed: the card shows %, declared %', v_card, v_declared[3];
  end if;
  if exists (select 1 from public.students s where s.id = any(v_stay) and s.status is distinct from 'Enrolled') then
    raise exception 'CDC backlog after-check failed: a T3 learner file is no longer « Inscrit »';
  end if;
  if exists (select 1 from public.students s where s.id = any(v_alumni) and s.status is distinct from 'Alumni') then
    raise exception 'CDC backlog after-check failed: a T4 learner file did not become « Ancien apprenant »';
  end if;
  if (select count(*) from public.charges) <> v_charges
     or (select coalesce(sum(gross_amount - discount_amount), 0) from public.charges) <> v_charge_sum
     or (select coalesce(sum(balance), 0) from public.charge_balances) <> v_balance_sum
     or (select count(*) from public.receipts) <> v_receipts
     or (select coalesce(sum(montant_paye), 0) from public.receipts) <> v_receipt_sum
     or (select count(*) from public.attendance) <> v_attendance
     or (select count(*) from public.crm_activities) <> v_activities then
    raise exception 'CDC backlog after-check failed: charges, receipts, attendance or CRM activities changed';
  end if;
  if (select count(*) from public.crm_leads) <> v_leads
     or (select md5(coalesce(string_agg(l.id::text || ':' || l.status || ':' || coalesce(l.enrollment_id::text, '-')
       || ':' || l.version::text, ',' order by l.id), '')) from public.crm_leads l) <> v_lead_sum then
    raise exception 'CDC backlog after-check failed: CRM leads changed';
  end if;
  if (select count(*) from public.crm_external_deliveries) <> v_deliveries
     or (select count(*) from public.crm_lifecycle_activation_epochs) <> v_epochs
     or (select count(*) from public.crm_lifecycle_pending_intents) <> v_intents then
    raise exception 'CDC backlog after-check failed: the lifecycle outbox changed';
  end if;
  if (select count(*) from maintenance.course_close_journal where run_id = v_run and entity = 'enrollments') <> v_targets
     or (select count(*) from maintenance.course_close_journal where run_id = v_run and action = 'charge_linked') <> v_linked
     or exists (select 1 from maintenance.course_close_journal j join public.charges c on c.id = j.row_id
       where j.run_id = v_run and j.action = 'charge_linked' and c.enrollment_id is distinct from (j.after->>'enrollment_id')::uuid) then
    raise exception 'CDC backlog after-check failed: journal incomplete';
  end if;
  if exists (select 1 from public.enrollments e join cdc_programme p on p.session_type = e.session_type
      where e.status = 'Confirmed' and e.group_id is null and e.school_year = current_setting('cdc.school_year')) then
    raise exception 'CDC backlog after-check failed: a target remains';
  end if;
  update maintenance.course_close_journal set after = jsonb_build_object('ended', v_ended, 'charges_linked', v_linked,
    'stay_enrolled', v_t3, 'alumni', v_t4, 'card', v_card)
  where run_id = v_run and action = 'run';

  if current_setting('cdc.dry_run') = 'on' then
    raise exception 'DRYRUN_OK CDC backlog run=% scenario=% ended=% stay_enrolled=% alumni=% charges_linked=% card=%',
      v_run, upper(v_scenario), v_ended, v_t3, v_t4, v_linked, v_card;
  end if;
end $$;
commit;
-- The transport returns only this statement's rows: the backlog journal of every run, by action.
select run_id, source, action, entity, count(*) as rows, min(at) as at
from maintenance.course_close_journal where source in ('backlog_step', 'backlog_revert')
group by run_id, source, action, entity order by min(at), source, action, entity;
