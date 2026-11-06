-- MANUAL REVERT OF THE CDC ONE-TIME STEP (plan course-dates-close.md, CDC-r3, D10 step 7).
-- Prepared, never run without its own owner approval. Not run by any release step or CI
-- outside the local rehearsal.
--
-- What it restores, for one step run (cdc.revert_run_id), from maintenance.course_close_journal:
--   - every journalled enrollment to its before-image: Confirmed, no group, the ended
--     fields cleared, under the Batch D two-flag exemption (eh.membership_sync and
--     eh.enrollment_command);
--   - then re-syncs each journalled learner file from its enrollments (a file the step made
--     « Ancien apprenant » becomes « Inscrit » again);
--   - journals a 'reverted' row (source 'backlog_revert') per restored enrollment and file,
--     referencing the original, so a second revert finds nothing.
-- It restores a row only if the row is still Ended with this run's ended_at and reason AND
-- its learner has no live enrollment of that programme and year. If any journalled row
-- fails that test (reopened, re-enrolled or re-ended since), the revert refuses and
-- changes nothing, unless the operator declares the number of such rows in
-- cdc.revert_declared_skips: then exactly those rows are skipped and listed in the
-- DRYRUN_OK / result (S9). Charge links made by the step are kept: they point at the
-- restored enrollment, which is where a payment would have gone anyway.
--
-- Plain SQL, one call through the guarded transport (it runs as postgres), dry run first:
--   supabase db query --linked --project-ref <ref> -f supabase/manual/course_close_backlog_revert.sql
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';
-- PARAMETERS (transaction-local): the run id printed by the step and its counts.
select set_config('cdc.revert_run_id', '00000000-0000-0000-0000-000000000000', true);
select set_config('cdc.revert_expected_enrollments', '18', true);
select set_config('cdc.revert_declared_skips', '0', true);
select set_config('cdc.dry_run', 'on', true);

do $$ begin
  if to_regclass('maintenance.course_close_journal') is null then
    raise exception 'CDC revert refused: migration 128 is not applied' using errcode = '55000';
  end if;
end $$;

-- The step's enrollment rows not reverted yet.
create temp table cdc_revert on commit drop as
select j.id, j.row_id, j.before, j.after, (j.before->>'student_id')::uuid as student_id
from maintenance.course_close_journal j
where j.run_id = current_setting('cdc.revert_run_id')::uuid and j.source = 'backlog_step'
  and j.action = 'ended' and j.entity = 'enrollments'
  and not exists (select 1 from maintenance.course_close_journal r where r.action = 'reverted' and r.reverts_id = j.id);

do $$
declare
  v_run uuid := current_setting('cdc.revert_run_id')::uuid;
  v_revert_run uuid := gen_random_uuid();
  v_t record;
  v_rows integer; v_skips integer; v_restored integer;
  v_membership text; v_command text;
  v_skipped jsonb;
begin
  select count(*) into v_rows from cdc_revert;
  if v_rows = 0 then
    raise exception 'CDC revert refused: run % has nothing left to revert', v_run using errcode = '22023';
  end if;
  if v_rows <> current_setting('cdc.revert_expected_enrollments')::integer then
    raise exception 'CDC revert refused: found % enrollments, declared %', v_rows,
      current_setting('cdc.revert_expected_enrollments') using errcode = '22023';
  end if;

  -- Locks: the enrollment-intent lock of the payment path, learners, enrollments (id order).
  for v_t in select distinct student_id from cdc_revert order by 1 loop
    if not pg_try_advisory_xact_lock_shared(hashtextextended('crm:enrollment-intent:' || v_t.student_id, 0)) then
      raise exception 'CDC revert refused: enrollment or payment in progress for a learner; retry later' using errcode = 'PT409';
    end if;
    perform 1 from public.students where id = v_t.student_id for update;
  end loop;
  perform 1 from public.enrollments e join cdc_revert r on r.row_id = e.id order by e.id for update of e;

  -- Each row: still ended by this run, and no live enrollment of that programme and year.
  alter table cdc_revert add column skip_reason text;
  update cdc_revert r set skip_reason = case
      when not exists (select 1 from public.enrollments e where e.id = r.row_id and e.status = 'Ended'
        and e.ended_at = (r.after->>'ended_at')::timestamptz and e.end_reason = r.after->>'end_reason') then 'changed'
      when exists (select 1 from public.enrollments x where x.student_id = r.student_id and x.id <> r.row_id
        and x.session_type = r.before->>'session_type' and x.school_year = r.before->>'school_year'
        and x.status not in ('Rejected', 'Ended')) then 'live_enrollment'
    end;
  select count(*), coalesce(jsonb_agg(jsonb_build_object('enrollment_id', row_id, 'reason', skip_reason) order by row_id), '[]')
    into v_skips, v_skipped from cdc_revert where skip_reason is not null;
  if v_skips <> current_setting('cdc.revert_declared_skips')::integer then
    raise exception 'CDC revert refused: % journalled rows changed since the step (declared skips %): %', v_skips,
      current_setting('cdc.revert_declared_skips'), v_skipped using errcode = '22023';
  end if;

  -- Restore under the two-flag exemption, then re-sync each learner file.
  v_membership := academic_security.set_flag('eh.membership_sync', 'on');
  v_command := academic_security.set_flag('eh.enrollment_command', 'on');
  for v_t in select * from cdc_revert where skip_reason is null order by row_id loop
    update public.enrollments set status = v_t.before->>'status', group_id = (v_t.before->>'group_id')::uuid,
      level = v_t.before->>'level', ended_at = null, ended_by = null, end_reason = null, ended_group_id = null
    where id = v_t.row_id and status = 'Ended';
    if not found then raise exception 'CDC revert failed: enrollment % was not restored', v_t.row_id; end if;
  end loop;
  perform academic_security.set_flag('eh.enrollment_command', v_command);
  perform academic_security.set_flag('eh.membership_sync', v_membership);
  for v_t in select distinct student_id from cdc_revert where skip_reason is null order by 1 loop
    perform public.sync_student_from_enrollments(v_t.student_id, false, null);
  end loop;

  insert into maintenance.course_close_journal(run_id, source, action, entity, row_id, before, after, reverts_id)
  select v_revert_run, 'backlog_revert', 'reverted', 'enrollments', r.row_id, r.after,
    (select jsonb_build_object('status', e.status, 'group_id', e.group_id, 'ended_at', e.ended_at, 'end_reason', e.end_reason)
      from public.enrollments e where e.id = r.row_id), r.id
  from cdc_revert r where r.skip_reason is null order by r.row_id;
  insert into maintenance.course_close_journal(run_id, source, action, entity, row_id, before, after, reverts_id)
  select v_revert_run, 'backlog_revert', 'reverted', 'students', j.row_id, j.after,
    (select jsonb_build_object('status', s.status, 'groupe_id', s.groupe_id) from public.students s where s.id = j.row_id), j.id
  from maintenance.course_close_journal j
  where j.run_id = v_run and j.source = 'backlog_step' and j.entity = 'students'
    and j.row_id in (select student_id from cdc_revert where skip_reason is null)
    and not exists (select 1 from maintenance.course_close_journal r where r.action = 'reverted' and r.reverts_id = j.id)
  order by j.row_id;
  insert into maintenance.course_close_journal(run_id, source, action, entity, row_id, before, after)
  values (v_revert_run, 'backlog_revert', 'run', 'runs', v_revert_run, jsonb_build_object('reverts_run_id', v_run),
    jsonb_build_object('restored', v_rows - v_skips, 'skipped', v_skipped));

  -- Post-conditions: every restored row is back to Confirmed without a group and every
  -- restored learner file is « Inscrit ».
  select count(*) into v_restored from cdc_revert r join public.enrollments e on e.id = r.row_id
  where r.skip_reason is null and e.status = r.before->>'status' and e.group_id is not distinct from (r.before->>'group_id')::uuid
    and e.ended_at is null and e.end_reason is null;
  if v_restored <> v_rows - v_skips then
    raise exception 'CDC revert after-check failed: % of % enrollments restored', v_restored, v_rows - v_skips;
  end if;
  if exists (select 1 from public.students s where s.id in (select student_id from cdc_revert where skip_reason is null)
      and s.status is distinct from 'Enrolled') then
    raise exception 'CDC revert after-check failed: a restored learner file is not « Inscrit »';
  end if;

  if current_setting('cdc.dry_run') = 'on' then
    raise exception 'DRYRUN_OK CDC revert run=% restored=% skipped=%', v_run, v_rows - v_skips, v_skipped;
  end if;
end $$;
commit;
select run_id, source, action, entity, count(*) as rows, min(at) as at
from maintenance.course_close_journal where source in ('backlog_step', 'backlog_revert')
group by run_id, source, action, entity order by min(at), source, action, entity;
