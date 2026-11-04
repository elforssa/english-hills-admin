-- MANUAL REVERT OF THE EAP ARCHIVE STEP (plan enrollment-at-payment.md, EAP-r4, D7 step 6).
-- Prepared, never run without its own owner approval. Not run by any release step or CI
-- outside the local rehearsal.
--
-- What it restores, for one archive run (eap.revert_run_id), from the journal:
--   - every journalled enrollment row to its before-image (status, group, programme,
--     year, level, ended fields), under the two-flag exemption of the retired-status
--     guard and with eh.capacity_override 'on' (a re-placed row may land in a group that
--     filled meanwhile);
--   - every journalled learner file to its before-image (status, group, programme,
--     level) under eh.membership_sync, so the files the archive made Inactive return to
--     Prospect or Trial;
--   - every lead link the archive cleared (enrollment_id back, learner unchanged).
-- Each restored row gets a 'reverted' journal action pointing at the original one, so a
-- second revert finds nothing and reopen_enrollment no longer treats the row as archived.
--
-- What it does NOT and cannot restore (accepted by the owner at R2): the conversions the
-- archive caused (protect_enrollment_link keeps a conversion immutable), the activities
-- (crm_activities is append-only, including the enrollment_detached and review-flag
-- activities) and the tasks that evaluate_conversion cancelled. Restoring a paid row to
-- its retired status, or an ended row linked to a converted lead, makes the existing
-- downgrade rule append a conversion_review_required activity.
--
-- It refuses, changing nothing, when the declared counts differ, when the run has
-- nothing left to revert, or when any journalled enrollment, learner file or lead has
-- changed since the archive (a new payment, placement or edit): then a reviewed forward
-- correction is needed instead.
--
-- Plain SQL, one call through the guarded transport (it runs as postgres), dry run first:
--   supabase db query --linked --project-ref <ref> -f supabase/manual/enrollment_at_payment_archive_revert.sql
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';
-- PARAMETERS (transaction-local): the run id printed by the archive step and its counts.
select set_config('eap.revert_run_id', '00000000-0000-0000-0000-000000000000', true);
select set_config('eap.revert_expected_enrollments', '14', true);
select set_config('eap.revert_expected_leads', '1', true);
select set_config('eap.dry_run', 'on', true);

do $$ begin
  if to_regclass('maintenance.eap_archive_journal') is null then
    raise exception 'EAP revert refused: migration 127 is not applied' using errcode = '55000';
  end if;
end $$;

create temp table eap_revert on commit drop as
select j.id, j.entity, j.row_id, j.before, j.after
from maintenance.eap_archive_journal j
where j.run_id = current_setting('eap.revert_run_id')::uuid
  and j.action in ('confirmed', 'ended', 'resynced', 'detached')
  and not exists (select 1 from maintenance.eap_archive_journal r where r.action = 'reverted' and r.reverts_id = j.id);

do $$
declare
  v_run uuid := current_setting('eap.revert_run_id')::uuid;
  v_t record;
  v_enrollments integer;
  v_leads integer;
  v_membership text; v_command text; v_capacity text;
begin
  select count(*) filter (where entity = 'enrollments'), count(*) filter (where entity = 'crm_leads')
    into v_enrollments, v_leads from eap_revert;
  if v_enrollments = 0 then
    raise exception 'EAP revert refused: run % has nothing left to revert', v_run using errcode = '22023';
  end if;
  if v_enrollments <> current_setting('eap.revert_expected_enrollments')::integer
     or v_leads <> current_setting('eap.revert_expected_leads')::integer then
    raise exception 'EAP revert refused: found % enrollments and % lead links, declared % and %', v_enrollments, v_leads,
      current_setting('eap.revert_expected_enrollments'), current_setting('eap.revert_expected_leads') using errcode = '22023';
  end if;

  -- Locks: the learners' enrollment-intent lock, learners, enrollments, leads.
  for v_t in select distinct e.student_id from eap_revert r join public.enrollments e on e.id = r.row_id
      where r.entity = 'enrollments'
      union select r.row_id from eap_revert r where r.entity = 'students' order by 1 loop
    if not pg_try_advisory_xact_lock_shared(hashtextextended('crm:enrollment-intent:' || v_t.student_id, 0)) then
      raise exception 'EAP revert refused: enrollment or payment in progress for a learner; retry later' using errcode = 'PT409';
    end if;
    perform 1 from public.students where id = v_t.student_id for update;
  end loop;
  perform 1 from public.enrollments e join eap_revert r on r.row_id = e.id and r.entity = 'enrollments' order by e.id for update of e;
  perform 1 from public.crm_leads l join eap_revert r on r.row_id = l.id and r.entity = 'crm_leads' order by l.id for update of l;

  -- Valid only while nothing touched the archived rows since.
  if exists (select 1 from eap_revert r join public.enrollments e on e.id = r.row_id where r.entity = 'enrollments'
      and jsonb_build_object('status', e.status, 'group_id', e.group_id, 'session_type', e.session_type,
        'school_year', e.school_year, 'level', e.level, 'ended_at', e.ended_at, 'end_reason', e.end_reason,
        'ended_group_id', e.ended_group_id) is distinct from r.after)
     or exists (select 1 from eap_revert r where r.entity = 'enrollments'
       and not exists (select 1 from public.enrollments e where e.id = r.row_id)) then
    raise exception 'EAP revert refused: an archived enrollment changed since the archive; a reviewed forward correction is needed'
      using errcode = '22023';
  end if;
  if exists (select 1 from eap_revert r join public.students s on s.id = r.row_id where r.entity = 'students'
      and jsonb_build_object('status', s.status, 'groupe_id', s.groupe_id, 'session_type', s.session_type,
        'niveau_cefr', s.niveau_cefr) is distinct from r.after) then
    raise exception 'EAP revert refused: a learner file changed since the archive; a reviewed forward correction is needed'
      using errcode = '22023';
  end if;
  if exists (select 1 from eap_revert r join public.crm_leads l on l.id = r.row_id where r.entity = 'crm_leads'
      and (l.enrollment_id is not null or l.status is distinct from r.after->>'status')) then
    raise exception 'EAP revert refused: a detached lead changed since the archive; a reviewed forward correction is needed'
      using errcode = '22023';
  end if;
  if exists (select 1 from eap_revert r join maintenance.eap_archive_journal j on j.id = r.id
      where r.entity = 'enrollments' and (exists (select 1 from public.receipts x where x.enrollment_id = r.row_id and x.created_at > j.at)
        or exists (select 1 from public.charges c where c.enrollment_id = r.row_id and c.created_at > j.at))) then
    raise exception 'EAP revert refused: an archived enrollment received a payment since the archive' using errcode = '22023';
  end if;

  v_membership := academic_security.set_flag('eh.membership_sync', 'on');
  v_command := academic_security.set_flag('eh.enrollment_command', 'on');
  v_capacity := academic_security.set_flag('eh.capacity_override', 'on');
  for v_t in select * from eap_revert where entity = 'enrollments' order by row_id loop
    update public.enrollments set
      status = v_t.before->>'status',
      group_id = (v_t.before->>'group_id')::uuid,
      session_type = v_t.before->>'session_type',
      school_year = v_t.before->>'school_year',
      level = v_t.before->>'level',
      ended_at = (v_t.before->>'ended_at')::timestamptz,
      ended_by = (v_t.before->>'ended_by')::uuid,
      end_reason = v_t.before->>'end_reason',
      ended_group_id = (v_t.before->>'ended_group_id')::uuid
    where id = v_t.row_id;
  end loop;
  -- The enrollment triggers resynced each file; set the journalled before-image back.
  for v_t in select * from eap_revert where entity = 'students' order by row_id loop
    update public.students set
      status = v_t.before->>'status',
      groupe_id = (v_t.before->>'groupe_id')::uuid,
      session_type = v_t.before->>'session_type',
      niveau_cefr = v_t.before->>'niveau_cefr'
    where id = v_t.row_id;
  end loop;
  perform academic_security.set_flag('eh.capacity_override', v_capacity);
  perform academic_security.set_flag('eh.enrollment_command', v_command);
  perform academic_security.set_flag('eh.membership_sync', v_membership);
  for v_t in select * from eap_revert where entity = 'crm_leads' order by row_id loop
    update public.crm_leads set enrollment_id = (v_t.before->>'enrollment_id')::uuid, version = version + 1, updated_at = now()
    where id = v_t.row_id and enrollment_id is null;
    if not found then raise exception 'EAP revert failed: lead % was not re-linked', v_t.row_id; end if;
  end loop;

  insert into maintenance.eap_archive_journal(run_id, action, entity, row_id, before, after, reverts_id)
  select v_run, 'reverted', r.entity, r.row_id, r.after,
    case r.entity
      when 'enrollments' then (select jsonb_build_object('status', e.status, 'group_id', e.group_id, 'session_type', e.session_type,
        'school_year', e.school_year, 'level', e.level, 'ended_at', e.ended_at, 'end_reason', e.end_reason,
        'ended_group_id', e.ended_group_id) from public.enrollments e where e.id = r.row_id)
      when 'students' then (select jsonb_build_object('status', s.status, 'groupe_id', s.groupe_id, 'session_type', s.session_type,
        'niveau_cefr', s.niveau_cefr) from public.students s where s.id = r.row_id)
      else (select jsonb_build_object('enrollment_id', l.enrollment_id, 'status', l.status, 'version', l.version)
        from public.crm_leads l where l.id = r.row_id) end,
    r.id
  from eap_revert r order by r.id;

  -- Post-conditions: every row is back to its before-image.
  if exists (select 1 from eap_revert r join public.enrollments e on e.id = r.row_id where r.entity = 'enrollments'
      and (e.status is distinct from r.before->>'status' or e.group_id is distinct from (r.before->>'group_id')::uuid
        or e.ended_at is distinct from (r.before->>'ended_at')::timestamptz
        or e.school_year is distinct from r.before->>'school_year')) then
    raise exception 'EAP revert after-check failed: an enrollment is not back to its before-image';
  end if;
  if exists (select 1 from eap_revert r join public.students s on s.id = r.row_id where r.entity = 'students'
      and (s.status is distinct from r.before->>'status' or s.groupe_id is distinct from (r.before->>'groupe_id')::uuid)) then
    raise exception 'EAP revert after-check failed: a learner file is not back to its before-image';
  end if;
  if exists (select 1 from eap_revert r join public.crm_leads l on l.id = r.row_id where r.entity = 'crm_leads'
      and l.enrollment_id is distinct from (r.before->>'enrollment_id')::uuid) then
    raise exception 'EAP revert after-check failed: a lead link is not restored';
  end if;

  if current_setting('eap.dry_run') = 'on' then
    raise exception 'DRYRUN_OK EAP revert run=% enrollments=% leads=%', v_run, v_enrollments, v_leads;
  end if;
end $$;
commit;
select run_id, action, entity, count(*) as rows, min(at) as at
from maintenance.eap_archive_journal group by run_id, action, entity order by min(at), action, entity;
