-- RWR-r5 PR C2 — academics, students, small things (M-C1, academic part).
-- Migration 141. Plan: docs/architecture/plans/receptionist-workflow.md §6.2–6.5, §7
-- invariant 5, §8 (PR C2), §10 (D7). Owner approval 2026-11-26: OD-9 = A (keep RPW-r2,
-- close NF-16 only); OD-12 « Sans inscription » (a display label: no stored value changes).
--
-- What it does:
--  * Level tests (§6.2):
--    - book_student_placement_test (a learner file's test: same date, hours and overlap
--      rules as an appointment) and update_placement_test_result (reschedule, result,
--      « Annuler » with a reason, « Absent ») for tests without a prospect;
--      delete_placement_test (admin, director; a test without a prospect, as before);
--    - the staff insert and update policies on placement_tests are replaced by these
--      commands; the teachers' insert and update policies (123:284-289) stay;
--    - trigger academic_security.placement_rules on every row, whoever writes it: no
--      result, score, « Passé », « Résultat saisi », « Affecté » or « Absent » before
--      the test's start time; a new planned test carries no result; one « Planifié »
--      test per person (the learner, or the prospect and its linked learner);
--    - crm_update_placement_test (live 136 body): « Passé » is derived, never chosen;
--      the level is one of the prospect's programme levels (programme_levels);
--    - programme_levels age bounds, from each programme's audience (adults 18+,
--      children and teenagers under 18): the level filter and the category check read them.
--  * Attendance (§6.3): groups.class_days (ISO weekdays, NULL until D7 or an edit);
--    enforce_attendance_integrity refuses a future date, a day outside class_days and a
--    closed date (hours source) unless the director overrides; save_attendance takes
--    the director's override; data step D7 (d7_plan, d7_apply, d7_revert): shipped,
--    NOT run, executable by no API role.
--  * Learner files (§6.4): trigger academic_security.student_rules — a birth date is
--    never after today and at least a year ago; the age category fits the programme
--    and level (programme_levels bounds) on every staff write (direct, and through
--    save_receptionist_student). System paths (enrollment sync, conversion) are never
--    refused for the category; existing files are not re-checked until edited.
--  * Role surface (§6.5, OD-9 A): save_receptionist_group refuses to create an online
--    group or to move a group to an online programme (NF-16); it accepts class_days.
--  * Phone search (§5.1, receptionist observation 2; Verify run 45889045886):
--    phone_search_key (live 139 body) keeps the typed digits when removing a leading
--    00212, 212 or 00 would leave fewer than 6 of them: « 003-97-23 », digits of a
--    stored number, was cut to « 39723 » and matched nothing in any search box.
--
-- Unchanged: set_next_action and the one-action rule, the lifecycle barrier, event
-- types, first-touch immutability, every finance function, grant and policy; the
-- teacher placement and attendance policies; stored student statuses.

-- ---------------------------------------------------------------------------
-- 0. Precondition: migration 140 (B2) is applied and every function 141 re-creates is
--    still the body 140 left live (plan stop condition: a cumulative function differs).
-- ---------------------------------------------------------------------------
do $$
declare f record;
begin
  if to_regprocedure('public.get_catalogue()') is null then
    raise exception 'Migration 141: needs migration 140 (catalogues)' using errcode = '55000';
  end if;
  for f in select * from jsonb_each_text(jsonb_build_object(
      'public.crm_update_placement_test(uuid,jsonb)', 'ec5421dcdf1fe855716c33a0e0868586',
      'public.enforce_attendance_integrity()', 'eba93c3d81c78116a3af48cd7aa5e2c5',
      'public.save_attendance(uuid,uuid,date,text)', '246adc04e3531d37e59ed2c9b9d9eb35',
      'public.save_receptionist_group(uuid,timestamp with time zone,jsonb)', '23cdb858bb4a50fece6528004da9b8b0',
      'public.save_receptionist_student(uuid,timestamp with time zone,jsonb)', '525b4b0d2f664c8818a055e34bb6d89c',
      'public.phone_search_key(text)', '8be52274875cd6a4e999312e13e39683')) loop
    if to_regprocedure(f.key) is null
       or (select md5(prosrc) from pg_proc where oid = to_regprocedure(f.key)) is distinct from f.value then
      raise exception 'Migration 141: % differs from the body 140 left live; rebuild 141 on the live definition', f.key
        using errcode = '55000';
    end if;
  end loop;
  if not exists (select 1 from pg_policy where polrelid = 'public.placement_tests'::regclass and polname = 'placement admin all') then
    raise exception 'Migration 141: placement_tests policies differ from 140' using errcode = '55000';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Age bounds of the levels (§6.2 « levels filtered by programme and age », §6.4
--    « category vs level »). From the catalogue's own audience: « adultes » 18 and
--    over, « enfants » and « ados » under 18, « tous » open. Only bounds still empty are
--    set, so 141 can be applied again after its restore.
-- ---------------------------------------------------------------------------
update public.programme_levels pl set min_age = 18
from public.programmes p
where p.code = pl.programme_code and p.audience = 'adultes' and pl.min_age is null and pl.max_age is null;
update public.programme_levels pl set max_age = 17
from public.programmes p
where p.code = pl.programme_code and p.audience in ('enfants', 'ados') and pl.min_age is null and pl.max_age is null;

-- Age range of a stored age category (students_age_category_check).
create or replace function academic_security.category_ages(category text)
returns int4range language sql immutable
set search_path = pg_catalog, pg_temp as $$
  select case category
    when 'Young Learners (6-12)' then int4range(6, 12, '[]')
    when 'Teens (13-17)' then int4range(13, 17, '[]')
    when 'Adults (18+)' then int4range(18, 120, '[]')
    when 'Corporate' then int4range(18, 120, '[]') end
$$;

-- Age range a programme (and level, when given) is open to; NULL bound = open.
-- (Parameters are prefixed: in an SQL function a column of the same name would win.)
create or replace function academic_security.level_ages(p_programme text, p_level text)
returns int4range language sql stable
set search_path = pg_catalog, pg_temp as $$
  select int4range(min(coalesce(pl.min_age, 0)), max(coalesce(pl.max_age, 120)), '[]')
  from public.programme_levels pl
  where pl.programme_code = p_programme and (p_level is null or pl.level = p_level)
$$;

-- A level a test may recommend: one of the programme's levels (any programme's when the
-- programme is unknown), open to the person's age when it is known.
create or replace function academic_security.level_allowed(p_programme text, p_level text, p_age integer)
returns boolean language sql stable
set search_path = pg_catalog, pg_temp as $$
  select p_level is null or exists (
    select 1 from public.programme_levels pl
    where pl.level = p_level and (p_programme is null or pl.programme_code = p_programme)
      and (p_age is null or (coalesce(pl.min_age, 0) <= p_age and p_age <= coalesce(pl.max_age, 120))))
$$;

create or replace function academic_security.age_on(birth date, on_date date)
returns integer language sql immutable
set search_path = pg_catalog, pg_temp as $$
  select case when birth is not null and on_date is not null then extract(year from age(on_date, birth))::integer end
$$;

-- ---------------------------------------------------------------------------
-- 2. Learner files (§6.4): birth date and age category.
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER on purpose: current_user is 'authenticated' for a staff member's direct
-- write and the function owner inside a SECURITY DEFINER path (enrollment sync, conversion,
-- merges), which is never refused for the category. save_receptionist_student asks for the
-- check with the transaction-local flag eh.student_rules. Reads only the label table
-- programme_levels (readable by authenticated).
create or replace function academic_security.student_rules()
returns trigger language plpgsql
set search_path = pg_catalog, pg_temp as $$
declare today date := (now() at time zone public.centre_utc_offset())::date; fits int4range; cat int4range;
begin
  if new.date_naissance is not null and (tg_op = 'INSERT' or new.date_naissance is distinct from old.date_naissance) then
    if new.date_naissance > today then
      raise exception 'La date de naissance ne peut pas être dans le futur.' using errcode = '22023', hint = 'student.birth_date_future';
    end if;
    if new.date_naissance > (today - interval '1 year')::date then
      raise exception 'La date de naissance doit remonter à au moins un an.' using errcode = '22023', hint = 'student.birth_date_too_recent';
    end if;
  end if;
  if (current_user = 'authenticated' or current_setting('eh.student_rules', true) = 'on')
     and new.age_category is not null and new.session_type is not null
     and (tg_op = 'INSERT' or (new.age_category, new.session_type, new.niveau_cefr)
          is distinct from (old.age_category, old.session_type, old.niveau_cefr)) then
    cat := case new.age_category
      when 'Young Learners (6-12)' then int4range(6, 12, '[]') when 'Teens (13-17)' then int4range(13, 17, '[]')
      when 'Adults (18+)' then int4range(18, 120, '[]') when 'Corporate' then int4range(18, 120, '[]') end;
    select int4range(min(coalesce(pl.min_age, 0)), max(coalesce(pl.max_age, 120)), '[]') into fits
    from public.programme_levels pl
    where pl.programme_code = new.session_type and (new.niveau_cefr is null or pl.level = new.niveau_cefr);
    if cat is not null and fits is not null and not (cat && fits) then
      raise exception 'La catégorie d’âge ne correspond pas au programme ou au niveau.' using errcode = '22023', hint = 'student.category_level';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists students_rules_guard on public.students;
create trigger students_rules_guard before insert or update of date_naissance, age_category, session_type, niveau_cefr
  on public.students for each row execute function academic_security.student_rules();

-- save_receptionist_student: the live 140 body; 141 asks the trigger for the category check
-- (the receptionist's form is a staff write too).
CREATE OR REPLACE FUNCTION public.save_receptionist_student(p_student uuid, p_expected_updated_at timestamp with time zone, p_changes jsonb)
 RETURNS TABLE(id uuid, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$ declare s public.students%rowtype; begin
  perform operational_security.require_receptionist();
  -- 141 (§6.4): the category is checked against the programme and level, as for any staff write.
  perform set_config('eh.student_rules', 'on', true);
  if p_student is null then raise exception 'Stable student id required' using errcode='22023'; end if;
  if p_expected_updated_at is null then
    perform operational_security.assert_keys(p_changes,array['full_name','date_naissance','telephone','email',
      'parent_email','age_category','notes','session_type','niveau_cefr','referral_source','photo_url','origin_code']);
    if nullif(btrim(p_changes->>'full_name'),'') is null then raise exception 'Name required' using errcode='22023'; end if;
    if operational_security.valid_session_level(coalesce(p_changes->>'session_type','Yearly'),
      p_changes->>'niveau_cefr') is not true then
      raise exception 'Invalid session/level' using errcode='22023'; end if;
    if p_changes ? 'photo_url' and p_changes->>'photo_url' is not null and
      storage_security.is_asset_reference(p_changes->>'photo_url') is not true then
      raise exception 'Registry photo required' using errcode='42501'; end if;
    -- 140 (§5.4): « Comment avez-vous connu le centre ? » is the origin list.
    if nullif(p_changes->>'origin_code','') is not null and not crm_security.origin_selectable(p_changes->>'origin_code') then
      raise exception 'Origine inconnue.' using errcode='22023', hint='catalogue.origin_unknown'; end if;
    insert into public.students(id,full_name,date_naissance,telephone,email,parent_email,age_category,
      notes,session_type,niveau_cefr,referral_source,photo_url,status,plan_type,origin_code)
    values(p_student,p_changes->>'full_name',(p_changes->>'date_naissance')::date,p_changes->>'telephone',
      p_changes->>'email',p_changes->>'parent_email',p_changes->>'age_category',p_changes->>'notes',
      coalesce(p_changes->>'session_type','Yearly'),p_changes->>'niveau_cefr',p_changes->>'referral_source',
      p_changes->>'photo_url','Prospect','Standard',nullif(p_changes->>'origin_code','')) on conflict on constraint students_pkey do nothing
    returning students.id,students.updated_at into id,updated_at;
    if id is null then
      select * into s from public.students where students.id=p_student for update;
      if s.deleted_at is not null or s.status is distinct from 'Prospect' or s.plan_type is distinct from 'Standard' or
        s.full_name is distinct from p_changes->>'full_name' or
        s.date_naissance is distinct from (p_changes->>'date_naissance')::date or
        s.telephone is distinct from public.require_phone(p_changes->>'telephone') or
        s.email is distinct from p_changes->>'email' or s.parent_email is distinct from p_changes->>'parent_email' or
        s.age_category is distinct from p_changes->>'age_category' or s.notes is distinct from p_changes->>'notes' or
        s.session_type is distinct from coalesce(p_changes->>'session_type','Yearly') or
        s.niveau_cefr is distinct from p_changes->>'niveau_cefr' or
        s.referral_source is distinct from p_changes->>'referral_source' or
        s.origin_code is distinct from nullif(p_changes->>'origin_code','') or
        s.photo_url is distinct from p_changes->>'photo_url' then
        raise exception 'Student create identity conflict' using errcode='23505'; end if;
      id:=s.id; updated_at:=s.updated_at;
    end if;
  else
    -- RPW-r2 items 2 and 3: programme, level and source (the admin rule: guard_student_membership
    -- refuses a programme or level change while the learner is in a group) and the two e-mails
    -- (refused while an active or pending family link uses the old address; every change logged).
    perform operational_security.assert_keys(p_changes,array['full_name','date_naissance','telephone',
      'age_category','notes','photo_url','session_type','niveau_cefr','referral_source','email','parent_email','origin_code']);
    if p_changes='{}'::jsonb then raise exception 'No changes' using errcode='22023'; end if;
    select * into s from public.students where students.id=p_student and deleted_at is null for update;
    if not found or s.updated_at is distinct from p_expected_updated_at then
      raise exception 'Student unavailable or stale' using errcode='PT409'; end if;
    if (p_changes ? 'session_type' or p_changes ? 'niveau_cefr') and operational_security.valid_session_level(
        case when p_changes ? 'session_type' then coalesce(nullif(p_changes->>'session_type',''),'Yearly') else s.session_type end,
        case when p_changes ? 'niveau_cefr' then nullif(p_changes->>'niveau_cefr','') else s.niveau_cefr end) is not true then
      raise exception 'Programme ou niveau invalide.' using errcode='22023', hint='rpw.level_invalid'; end if;
    if p_changes ? 'email' and nullif(btrim(p_changes->>'email'),'') is distinct from s.email
       and operational_security.family_link_holds(s.id, 'self', s.email) then
      raise exception 'Un compte famille utilise cet e-mail : la direction le modifie.' using errcode='42501', hint='rpw.family_email_locked'; end if;
    if p_changes ? 'parent_email' and nullif(btrim(p_changes->>'parent_email'),'') is distinct from s.parent_email
       and operational_security.family_link_holds(s.id, 'parent', s.parent_email) then
      raise exception 'Un compte famille utilise cet e-mail : la direction le modifie.' using errcode='42501', hint='rpw.family_email_locked'; end if;
    if p_changes ? 'photo_url' and p_changes->>'photo_url' is not null and
      storage_security.is_asset_reference(p_changes->>'photo_url') is not true then
      raise exception 'Registry photo required' using errcode='42501'; end if;
    if nullif(p_changes->>'origin_code','') is distinct from s.origin_code and nullif(p_changes->>'origin_code','') is not null
       and not crm_security.origin_selectable(p_changes->>'origin_code') then
      raise exception 'Origine inconnue.' using errcode='22023', hint='catalogue.origin_unknown'; end if;
    update public.students set
      full_name=case when p_changes ? 'full_name' then p_changes->>'full_name' else s.full_name end,
      date_naissance=case when p_changes ? 'date_naissance' then (p_changes->>'date_naissance')::date else s.date_naissance end,
      telephone=case when p_changes ? 'telephone' then p_changes->>'telephone' else s.telephone end,
      age_category=case when p_changes ? 'age_category' then p_changes->>'age_category' else s.age_category end,
      notes=case when p_changes ? 'notes' then p_changes->>'notes' else s.notes end,
      photo_url=case when p_changes ? 'photo_url' then p_changes->>'photo_url' else s.photo_url end,
      session_type=case when p_changes ? 'session_type' then coalesce(nullif(p_changes->>'session_type',''),'Yearly') else s.session_type end,
      niveau_cefr=case when p_changes ? 'niveau_cefr' then nullif(p_changes->>'niveau_cefr','') else s.niveau_cefr end,
      referral_source=case when p_changes ? 'referral_source' then nullif(p_changes->>'referral_source','') else s.referral_source end,
      origin_code=case when p_changes ? 'origin_code' then nullif(p_changes->>'origin_code','') else s.origin_code end,
      email=case when p_changes ? 'email' then nullif(btrim(p_changes->>'email'),'') else s.email end,
      parent_email=case when p_changes ? 'parent_email' then nullif(btrim(p_changes->>'parent_email'),'') else s.parent_email end
    where students.id=p_student returning students.id,students.updated_at into id,updated_at;
  end if;
  -- 141: the check is for this command only.
  perform set_config('eh.student_rules', '', true);
  return next;
end $function$;

-- ---------------------------------------------------------------------------
-- 3. Level tests (§6.2).
-- ---------------------------------------------------------------------------
create or replace function academic_security.test_starts(p public.placement_tests)
returns timestamptz language sql stable
set search_path = pg_catalog, pg_temp as $$
  select (p.date_test + coalesce(crm_security.calendar_time(p.heure), time '00:00')) at time zone public.centre_utc_offset()
$$;

-- Every row, whoever writes it (CRM commands, the two learner commands, teachers):
--  * no result, score or outcome before the start time (invariant 5). A result is what
--    this write sets: a status moved to « Passé », « Résultat saisi », « Affecté » or
--    « Absent », or a score or level written or changed (compared with OLD). A level or
--    score already stored is never a result by itself: before C2 the learner form stored
--    « A1 » by default on planned tests, and such a test must still move, cancel
--    (« Annulé », crm_security.cancel_planned_test) or be marked « Absent » after its start;
--  * a new planned test carries no result (no pre-filled level);
--  * one « Planifié » test per person: the learner, or the prospect and its linked learner
--    (the prospect alone is already unique, 083:5). Serialised on the same lock as the
--    CRM overlap check (crm:student-schedule:<learner>).
create or replace function academic_security.placement_rules()
returns trigger language plpgsql security definer
set search_path = pg_catalog, pg_temp as $$
declare person uuid;
begin
  if tg_op = 'INSERT' and new.status = 'Planifié' and (new.score is not null or new.niveau_recommande is not null) then
    raise exception 'Un test planifié n’a pas encore de niveau ni de score.' using errcode = '22023', hint = 'placement.no_prefilled_result';
  end if;
  if ((new.status in ('Passé', 'Résultat saisi', 'Affecté', 'Absent') and (tg_op = 'INSERT' or new.status is distinct from old.status))
      or (new.score is not null and (tg_op = 'INSERT' or new.score is distinct from old.score))
      or (new.niveau_recommande is not null and (tg_op = 'INSERT' or new.niveau_recommande is distinct from old.niveau_recommande)))
     and academic_security.test_starts(new) > now() then
    raise exception 'Le résultat se saisit après l’heure du test.' using errcode = '22023', hint = 'placement.result_before_start';
  end if;
  if new.status = 'Planifié' and (tg_op = 'INSERT' or old.status is distinct from 'Planifié'
     or new.student_id is distinct from old.student_id) then
    person := coalesce(new.student_id, (select l.student_id from public.crm_leads l where l.id = new.crm_lead_id));
    if person is not null then
      perform pg_advisory_xact_lock(hashtextextended('crm:student-schedule:' || person, 0));
      if exists (select 1 from public.placement_tests x
          where x.status = 'Planifié' and x.id <> new.id
            and (x.student_id = person or x.crm_lead_id in (select l.id from public.crm_leads l where l.student_id = person))) then
        raise exception 'Un test est déjà planifié pour cette personne.' using errcode = '22023', hint = 'placement.already_planned';
      end if;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists placement_tests_rules on public.placement_tests;
create trigger placement_tests_rules before insert or update on public.placement_tests
  for each row execute function academic_security.placement_rules();

-- The summary the learner commands return (the CRM one hides the result of a planned test).
create or replace function academic_security.placement_row(p public.placement_tests)
returns jsonb language sql stable
set search_path = pg_catalog, pg_temp as $$
  select jsonb_build_object('id', p.id, 'is_crm', false, 'student_id', p.student_id, 'student_name', p.student_name,
    'date_test', p.date_test, 'heure', p.heure, 'examinateur', p.examinateur, 'status', p.status, 'score', p.score,
    'niveau_recommande', p.niveau_recommande, 'groupe_affecte_id', p.groupe_affecte_id, 'notes', p.notes,
    'cancel_reason', p.cancel_reason, 'cancelled_at', p.cancelled_at, 'updated_at', p.updated_at)
$$;

-- An appointment of a prospect linked to the learner overlapping [starts, starts + 45 min).
create or replace function academic_security.assert_student_slot(student uuid, starts timestamptz, except_test uuid)
returns void language plpgsql stable
set search_path = pg_catalog, pg_temp as $$
begin
  if exists (select 1 from public.crm_tasks t join public.crm_leads l on l.id = t.lead_id
      where l.student_id = student and t.status = 'open' and t.task_type = 'center_visit'
        and tstzrange(t.due_at, t.due_at + interval '60 minutes') && tstzrange(starts, starts + interval '45 minutes'))
  or exists (select 1 from public.placement_tests x
      where x.status = 'Planifié' and x.id is distinct from except_test
        and (x.student_id = student or x.crm_lead_id in (select l.id from public.crm_leads l where l.student_id = student))
        and tstzrange(academic_security.test_starts(x), academic_security.test_starts(x) + interval '45 minutes')
            && tstzrange(starts, starts + interval '45 minutes')) then
    raise exception 'Another appointment or test of this person overlaps this time' using errcode = '22023', hint = 'crm_next_action.overlap';
  end if;
end $$;

-- A learner file's test (§6.2): « Planifier un test » for an existing learner. p_test is
-- the form's stable id: a retry with the same payload returns the same test.
create or replace function public.book_student_placement_test(p_test uuid, p_data jsonb)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, pg_temp as $$
declare s public.students; p public.placement_tests; starts timestamptz; d date; t text;
begin
  perform crm_security.require_reader(false);
  if p_test is null or jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text) > 8000
     or p_data - array['student_id', 'date_test', 'heure', 'examinateur', 'notes'] <> '{}'::jsonb
     or coalesce(p_data->>'student_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or coalesce(p_data->>'date_test', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'Valid test booking required' using errcode = '22023', hint = 'placement.invalid';
  end if;
  t := btrim(coalesce(p_data->>'heure', ''));
  if t !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'Indiquez l’heure du test.' using errcode = '22023', hint = 'placement.time_required'; end if;
  if length(p_data->>'examinateur') > 200 or length(p_data->>'notes') > 4000 then
    raise exception 'Valid test booking required' using errcode = '22023', hint = 'placement.invalid'; end if;
  d := (p_data->>'date_test')::date;
  select * into s from public.students where id = (p_data->>'student_id')::uuid
    and deleted_at is null and merged_into_student_id is null for update;
  if not found then raise exception 'Learner unavailable' using errcode = '22023', hint = 'placement.student_unavailable'; end if;
  select * into p from public.placement_tests where id = p_test;
  if found then
    if p.crm_lead_id is null and p.student_id = s.id and p.date_test = d and p.heure = t
       and p.examinateur is not distinct from nullif(btrim(p_data->>'examinateur'), '')
       and p.notes is not distinct from nullif(btrim(p_data->>'notes'), '') then
      return jsonb_build_object('placement', academic_security.placement_row(p), 'replayed', true);
    end if;
    raise exception 'Test booking identity conflict' using errcode = '23505';
  end if;
  starts := (d + t::time) at time zone public.centre_utc_offset();
  if starts <= now() then
    raise exception 'Choisissez une date et une heure à venir.' using errcode = '22023', hint = 'placement.future_required'; end if;
  perform crm_security.assert_in_hours('opening', starts);
  perform pg_advisory_xact_lock(hashtextextended('crm:student-schedule:' || s.id, 0));
  perform academic_security.assert_student_slot(s.id, starts, null);
  insert into public.placement_tests(id, student_id, student_name, date_test, heure, examinateur, notes, status)
  values (p_test, s.id, s.full_name, d, t, nullif(btrim(p_data->>'examinateur'), ''), nullif(btrim(p_data->>'notes'), ''), 'Planifié')
  returning * into p;
  return jsonb_build_object('placement', academic_security.placement_row(p));
end $$;

-- Edits of a test without a prospect (§6.2). p_changes keys: date_test, heure, examinateur,
-- notes, status, score, niveau_recommande, groupe_affecte_id, cancel_reason. « Passé » is
-- derived (shown once the time has passed), never chosen; « Annulé » needs a reason;
-- « Annulé » and « Absent » only from « Planifié »; a test that has left « Planifié » is
-- never planned again (book a new one); the level is one of the learner's programme
-- levels for their age. A prospect's test goes through the CRM (crm_update_placement_test).
create or replace function public.update_placement_test_result(p_test uuid, p_expected_updated_at timestamptz, p_changes jsonb)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, pg_temp as $$
declare p public.placement_tests; s public.students; n public.placement_tests; moved boolean; starts timestamptz; g public.groups;
begin
  perform crm_security.require_reader(false);
  if p_test is null or p_expected_updated_at is null or jsonb_typeof(p_changes) is distinct from 'object'
     or octet_length(p_changes::text) > 8000 or p_changes = '{}'::jsonb
     or p_changes - array['date_test', 'heure', 'examinateur', 'notes', 'status', 'score', 'niveau_recommande',
       'groupe_affecte_id', 'cancel_reason'] <> '{}'::jsonb then
    raise exception 'Valid test edit required' using errcode = '22023', hint = 'placement.invalid';
  end if;
  select * into p from public.placement_tests where id = p_test for update;
  if not found then raise exception 'Test unavailable or stale' using errcode = 'PT409'; end if;
  if p.crm_lead_id is not null then
    raise exception 'Ce test appartient à un prospect : modifiez-le depuis sa fiche.' using errcode = '22023', hint = 'placement.crm_use_prospect'; end if;
  if p.updated_at is distinct from p_expected_updated_at then raise exception 'Test unavailable or stale' using errcode = 'PT409'; end if;
  if p.student_id is not null then select * into s from public.students where id = p.student_id; end if;
  n := p;
  if p_changes ? 'date_test' then n.date_test := (p_changes->>'date_test')::date; end if;
  if p_changes ? 'heure' then n.heure := nullif(btrim(p_changes->>'heure'), ''); end if;
  if p_changes ? 'examinateur' then n.examinateur := nullif(btrim(p_changes->>'examinateur'), ''); end if;
  if p_changes ? 'notes' then n.notes := nullif(btrim(p_changes->>'notes'), ''); end if;
  if p_changes ? 'status' then n.status := p_changes->>'status'; end if;
  if p_changes ? 'score' then n.score := nullif(p_changes->>'score', '')::numeric; end if;
  if p_changes ? 'niveau_recommande' then n.niveau_recommande := nullif(p_changes->>'niveau_recommande', ''); end if;
  if p_changes ? 'groupe_affecte_id' then n.groupe_affecte_id := nullif(p_changes->>'groupe_affecte_id', '')::uuid; end if;
  if length(n.examinateur) > 200 or length(n.notes) > 4000 or n.date_test is null
     or n.status not in ('Planifié', 'Passé', 'Résultat saisi', 'Affecté', 'Annulé', 'Absent')
     or (n.score is not null and (n.score < 0 or n.score > 100)) then
    raise exception 'Valid test edit required' using errcode = '22023', hint = 'placement.invalid'; end if;
  if n.status = 'Passé' and p.status is distinct from 'Passé' then
    raise exception '« Passé » s’affiche une fois l’heure passée : saisissez le résultat ou « Absent ».' using errcode = '22023', hint = 'placement.passe_derived'; end if;
  if p.status <> 'Planifié' and n.status = 'Planifié' then
    raise exception 'Ce test n’est plus planifié : planifiez un nouveau test.' using errcode = '22023', hint = 'placement.not_replannable'; end if;
  if n.status in ('Annulé', 'Absent') and n.status is distinct from p.status and p.status <> 'Planifié' then
    raise exception 'Seul un test planifié peut être annulé ou noté absent.' using errcode = '22023', hint = 'placement.not_planned'; end if;
  moved := n.date_test is distinct from p.date_test or n.heure is distinct from p.heure;
  if moved and (p.status <> 'Planifié' or n.status <> 'Planifié') then
    raise exception 'Seul un test planifié peut être déplacé.' using errcode = '22023', hint = 'placement.not_planned'; end if;
  if n.status in ('Planifié', 'Annulé', 'Absent') and (n.score is not null or n.niveau_recommande is not null)
     and (n.score, n.niveau_recommande) is distinct from (p.score, p.niveau_recommande) then
    raise exception 'Un test sans résultat n’a ni niveau ni score.' using errcode = '22023', hint = 'placement.no_prefilled_result'; end if;
  if n.status in ('Résultat saisi', 'Affecté') and n.niveau_recommande is null then
    raise exception 'Choisissez le niveau recommandé.' using errcode = '22023', hint = 'placement.level_required'; end if;
  if n.niveau_recommande is distinct from p.niveau_recommande and n.niveau_recommande is not null
     and not academic_security.level_allowed(s.session_type, n.niveau_recommande, academic_security.age_on(s.date_naissance, n.date_test)) then
    raise exception 'Ce niveau ne correspond pas au programme ou à l’âge de l’apprenant.' using errcode = '22023', hint = 'placement.level_not_offered'; end if;
  if n.groupe_affecte_id is distinct from p.groupe_affecte_id and n.groupe_affecte_id is not null then
    select * into g from public.groups where id = n.groupe_affecte_id;
    if not found or g.closed_at is not null then
      raise exception 'Groupe indisponible.' using errcode = '22023', hint = 'placement.group_unavailable'; end if;
  end if;
  if n.status = 'Annulé' and p.status <> 'Annulé' then
    if nullif(btrim(p_changes->>'cancel_reason'), '') is null or length(btrim(p_changes->>'cancel_reason')) > 500 then
      raise exception 'Indiquez le motif de l’annulation.' using errcode = '22023', hint = 'placement.cancel_reason_required'; end if;
    n.cancelled_at := now(); n.cancelled_by := auth.uid(); n.cancel_reason := btrim(p_changes->>'cancel_reason');
  elsif p_changes ? 'cancel_reason' then
    raise exception 'Valid test edit required' using errcode = '22023', hint = 'placement.invalid';
  end if;
  if moved then
    if n.heure is null or n.heure !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
      raise exception 'Indiquez l’heure du test.' using errcode = '22023', hint = 'placement.time_required'; end if;
    starts := academic_security.test_starts(n);
    if starts <= now() then
      raise exception 'Choisissez une date et une heure à venir.' using errcode = '22023', hint = 'placement.future_required'; end if;
    perform crm_security.assert_in_hours('opening', starts);
    if p.student_id is not null then
      perform pg_advisory_xact_lock(hashtextextended('crm:student-schedule:' || p.student_id, 0));
      perform academic_security.assert_student_slot(p.student_id, starts, p.id);
    end if;
  end if;
  update public.placement_tests set date_test = n.date_test, heure = n.heure, examinateur = n.examinateur, notes = n.notes,
    status = n.status, score = n.score, niveau_recommande = n.niveau_recommande, groupe_affecte_id = n.groupe_affecte_id,
    cancelled_at = n.cancelled_at, cancelled_by = n.cancelled_by, cancel_reason = n.cancel_reason
  where id = p.id returning * into p;
  return jsonb_build_object('placement', academic_security.placement_row(p));
exception
  when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    raise exception 'Valid test edit required' using errcode = '22023', hint = 'placement.invalid';
end $$;

-- « Supprimer » (admin, director) of a test without a prospect, as the page did through the
-- table: a prospect's test is history (placement_integrity refuses it).
create or replace function public.delete_placement_test(p_test uuid, p_expected_updated_at timestamptz)
returns void language plpgsql security definer
set search_path = pg_catalog, pg_temp as $$
declare p public.placement_tests;
begin
  if coalesce(public.get_my_role(), '') not in ('director', 'admin') then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  select * into p from public.placement_tests where id = p_test for update;
  if not found or p.updated_at is distinct from p_expected_updated_at then
    raise exception 'Test unavailable or stale' using errcode = 'PT409'; end if;
  if p.crm_lead_id is not null then
    raise exception 'Ce test appartient à un prospect : modifiez-le depuis sa fiche.' using errcode = '22023', hint = 'placement.crm_use_prospect'; end if;
  delete from public.placement_tests where id = p.id;
end $$;

-- Staff direct writes replaced by the commands: the receptionist's insert and update
-- policies go; management keeps reading and deleting (delete_placement_test checks the
-- prospect link first). The teacher policies and the CRM restrictive policy stay.
drop policy if exists receptionist_placement_insert on public.placement_tests;
drop policy if exists receptionist_placement_update on public.placement_tests;
drop policy if exists "placement admin all" on public.placement_tests;
drop policy if exists "placement admin read" on public.placement_tests;
drop policy if exists "placement admin delete" on public.placement_tests;
create policy "placement admin read" on public.placement_tests for select to authenticated
  using ((select public.get_my_role()) = any (array['admin', 'director']));
create policy "placement admin delete" on public.placement_tests for delete to authenticated
  using ((select public.get_my_role()) = any (array['admin', 'director']));

-- crm_update_placement_test: the live 136 body; 141 refuses choosing « Passé » (derived)
-- and a level outside the prospect's programme and age (programme_levels).
CREATE OR REPLACE FUNCTION public.crm_update_placement_test(p_request_key uuid, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare actor uuid:=auth.uid(); digest text; prior public.crm_command_requests%rowtype; p public.placement_tests%rowtype; result jsonb; l public.crm_leads%rowtype; begin
 perform crm_security.require_reader(false);
 if p_request_key is null or jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>12000
 or p_data-array['placement_id','expected_updated_at','expected_version','date_test','heure','examinateur','notes','status','score','niveau_recommande']<>'{}'::jsonb then raise exception 'Valid placement edit required' using errcode='22023'; end if;
 digest:=encode(sha256(convert_to(p_data::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('crm:request:'||actor||':update_placement:'||p_request_key,0));
 select * into prior from public.crm_command_requests where actor_scope=actor::text and command_name='update_placement' and request_key=p_request_key;
 if found then
  if prior.payload_hash<>digest then raise exception 'Request key payload conflict' using errcode='22023'; end if;
  return prior.result;
 end if;
 select * into p from public.placement_tests where id=(p_data->>'placement_id')::uuid and crm_lead_id is not null;
 if not found then raise exception 'CRM placement not found' using errcode='22023'; end if;
 -- NF-2: the prospect version the user saw (lead lock before placement lock,
 -- the order every placement trigger already uses).
 -- The placement check runs first so a stale test keeps its existing message (119
 -- contract); the prospect check (NF-2) follows. Both rows are locked before either.
 select * into l from public.crm_leads where id=p.crm_lead_id for update;
 select * into p from public.placement_tests where id=p.id for update;
 if p.updated_at is distinct from (p_data->>'expected_updated_at')::timestamptz then raise exception 'Stale placement version; refresh and retry' using errcode='PT409'; end if;
 if l.version is distinct from (p_data->>'expected_version')::bigint then raise exception 'Stale lead version; refresh and retry' using errcode='PT409'; end if;
 -- 141 (§6.2): « Passé » is derived; the level follows the prospect's programme and age.
 if p_data->>'status'='Passé' and p.status is distinct from 'Passé' then
  raise exception '« Passé » s’affiche une fois l’heure passée : saisissez le résultat ou « Absent ».' using errcode='22023',hint='placement.passe_derived'; end if;
 if nullif(p_data->>'niveau_recommande','') is distinct from p.niveau_recommande and nullif(p_data->>'niveau_recommande','') is not null
 and not academic_security.level_allowed(l.session_type,p_data->>'niveau_recommande',
   coalesce(academic_security.age_on(l.learner_birth_date,(p_data->>'date_test')::date),l.learner_age)) then
  raise exception 'Ce niveau ne correspond pas au programme ou à l’âge du prospect.' using errcode='22023',hint='placement.level_not_offered'; end if;
 update public.placement_tests set date_test=(p_data->>'date_test')::date,heure=p_data->>'heure',examinateur=p_data->>'examinateur',notes=p_data->>'notes',
 status=p_data->>'status',score=(p_data->>'score')::numeric,niveau_recommande=nullif(p_data->>'niveau_recommande','') where id=p.id returning * into p;
 result:=jsonb_build_object('placement',crm_security.placement_summary(p))||crm_security.result(p.crm_lead_id,'placement-edit:'||p.id);
 insert into public.crm_command_requests(actor_scope,command_name,request_key,payload_hash,result) values(actor::text,'update_placement',p_request_key,digest,result);
 return result;
exception
 when deadlock_detected then raise exception 'Concurrent placement change; refresh and retry' using errcode='PT409';
 when unique_violation then raise exception 'Placement already scheduled' using errcode='PT409';
 when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or check_violation or not_null_violation then raise exception 'Invalid placement edit or missing result' using errcode='22023';
end $function$;

-- ---------------------------------------------------------------------------
-- 4. Attendance (§6.3): class days, dates, closed dates.
-- ---------------------------------------------------------------------------
alter table public.groups add column if not exists class_days smallint[];
alter table public.groups drop constraint if exists groups_class_days_valid;
alter table public.groups add constraint groups_class_days_valid
  check (class_days is null or (cardinality(class_days) between 1 and 7 and class_days <@ array[1,2,3,4,5,6,7]::smallint[]));

-- Stored sorted and without repeats, whoever writes them.
create or replace function academic_security.normalize_class_days()
returns trigger language plpgsql
set search_path = pg_catalog, pg_temp as $$
begin
  if new.class_days is not null then
    new.class_days := array(select distinct d from unnest(new.class_days) d where d is not null order by d);
    if cardinality(new.class_days) = 0 then new.class_days := null; end if;
  end if;
  return new;
end $$;
drop trigger if exists groups_class_days_normalize on public.groups;
create trigger groups_class_days_normalize before insert or update of class_days on public.groups
  for each row execute function academic_security.normalize_class_days();

-- A closed date of the current published hours version (§4.5); no version: none closed.
create or replace function academic_security.closed_on(d date)
returns boolean language sql stable
set search_path = pg_catalog, pg_temp as $$
  select coalesce((select d = any(crm_security.closed_dates(p.id)) from public.crm_followup_policies p
    where p.effective_from <= now() and (p.retired_at is null or p.retired_at > now())
    order by p.effective_from desc, p.version desc limit 1), false)
$$;

-- enforce_attendance_integrity: the live 121 body; 141 adds the date rules for a new row
-- written by a staff member or a teacher (§6.3): never a future date (business date), never
-- a day outside the group's class_days (when set), never a closed date unless the director
-- overrides through save_attendance (refused for any other role, 42501). A correction
-- of an existing row is unchanged.
CREATE OR REPLACE FUNCTION public.enforce_attendance_integrity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare
  v_role text;
  v_teacher uuid;
  v_days smallint[];
begin
  select p.role into v_role from public.profiles p where p.id = auth.uid();
  if v_role not in ('director','admin','teacher','receptionist') then
    raise exception 'Attendance actor unauthorized' using errcode = '42501';
  end if;
  if v_role = 'teacher' then
    v_teacher := public.get_my_teacher_id();
    if v_teacher is null or not exists (
      select 1 from public.groups g where g.id = new.group_id and g.teacher_id = v_teacher
    ) then raise exception 'Teacher not assigned to group' using errcode = '42501'; end if;
  end if;
  if v_role = 'receptionist' and (
    (tg_op = 'UPDATE' and (new.id,new.created_at,new.notes) is distinct from
      (old.id,old.created_at,old.notes)) or
    (tg_op = 'INSERT' and (new.notes is not null or new.created_at is distinct from now()))
  ) then
    raise exception 'Receptionist may record attendance status only' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and
    (new.student_id, new.group_id, new.session_date)
      is distinct from (old.student_id, old.group_id, old.session_date) then
    raise exception 'Attendance identity is immutable' using errcode = '23514';
  end if;
  if not public.attendance_student_in_group(new.student_id, new.group_id, new.session_date) then
    raise exception 'Student is not enrolled in group' using errcode = '23514';
  end if;
  -- 141 (§6.3, invariant 5), after the membership check (its 23514 keeps priority).
  if tg_op = 'INSERT' and v_role is not null then
    if new.session_date > (now() at time zone public.centre_utc_offset())::date then
      raise exception 'Les présences ne se saisissent pas à l’avance.' using errcode = '22023', hint = 'attendance.future_date';
    end if;
    select g.class_days into v_days from public.groups g where g.id = new.group_id;
    if v_days is not null and not (extract(isodow from new.session_date)::smallint = any(v_days)) then
      raise exception 'Ce groupe n’a pas cours ce jour-là.' using errcode = '22023', hint = 'attendance.not_class_day';
    end if;
    if current_setting('eh.attendance_override', true) = 'on' and v_role <> 'director' then
      raise exception 'Seule la direction saisit les présences d’un jour de fermeture.' using errcode = '42501', hint = 'attendance.override_director';
    end if;
    if academic_security.closed_on(new.session_date) and current_setting('eh.attendance_override', true) is distinct from 'on' then
      raise exception 'Le centre est fermé ce jour-là.' using errcode = '22023', hint = 'attendance.closed_date';
    end if;
  end if;
  if tg_op = 'INSERT' then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'attendance:' || new.student_id::text || ':' || new.group_id::text || ':' || new.session_date::text, 0));
    if exists (select 1 from public.attendance a
      where a.student_id = new.student_id and a.group_id = new.group_id
        and a.session_date = new.session_date) then
      raise exception 'Attendance already exists' using errcode = '23505';
    end if;
  end if;
  return new;
end;
$function$;

-- save_attendance: the live 063 body plus the director's closed-date override. The old
-- four-argument call (the deployed build) resolves to this function with the default.
drop function if exists public.save_attendance(uuid, uuid, date, text);
create function public.save_attendance(p_student uuid, p_group uuid, p_date date, p_status text, p_override_closed boolean default false)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare
  v_id uuid;
  v_count integer;
begin
  if p_student is null or p_group is null or p_date is null
    or p_status not in ('Présent','Absent','Retard','Justifié') then
    raise exception 'Invalid attendance input' using errcode = '22023';
  end if;
  -- 141 (§6.3): the director's closed-date override, for this call only;
  -- enforce_attendance_integrity refuses it for any other role (42501,
  -- attendance.override_director).
  perform set_config('eh.attendance_override', case when p_override_closed then 'on' else '' end, true);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'attendance:' || p_student::text || ':' || p_group::text || ':' || p_date::text, 0));
  select count(*), min(a.id::text)::uuid into v_count, v_id
  from public.attendance a where a.student_id = p_student and a.group_id = p_group and a.session_date = p_date;
  if v_count > 1 then
    raise exception 'Conflicting historical attendance rows require review' using errcode = '23505';
  end if;
  if v_id is null then
    insert into public.attendance(student_id,group_id,session_date,status)
    values(p_student,p_group,p_date,p_status) returning id into v_id;
  else
    update public.attendance set status = p_status where id = v_id;
  end if;
  perform set_config('eh.attendance_override', '', true);
  return v_id;
end;
$function$;
revoke all on function public.save_attendance(uuid, uuid, date, text, boolean) from public, anon;
grant execute on function public.save_attendance(uuid, uuid, date, text, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. save_receptionist_group (§6.5 OD-9 A and §6.3): the live 128 body; 141 refuses an
--    online group (NF-16: course setup is management-only) and accepts class_days.
-- ---------------------------------------------------------------------------
create or replace function academic_security.class_days_from(v jsonb)
returns smallint[] language plpgsql immutable
set search_path = pg_catalog, pg_temp as $$
declare out smallint[];
begin
  if v is null or jsonb_typeof(v) = 'null' then return null; end if;
  if jsonb_typeof(v) <> 'array' or jsonb_array_length(v) > 7
     or exists (select 1 from jsonb_array_elements(v) x where jsonb_typeof(x) <> 'number' or (x #>> '{}') !~ '^[1-7]$') then
    raise exception 'Jours de cours invalides.' using errcode = '22023', hint = 'group.class_days_invalid';
  end if;
  out := array(select distinct (x #>> '{}')::smallint from jsonb_array_elements(v) x order by 1);
  return case when cardinality(out) = 0 then null else out end;
end $$;

CREATE OR REPLACE FUNCTION public.save_receptionist_group(p_group uuid, p_expected_updated_at timestamp with time zone, p_changes jsonb)
 RETURNS TABLE(id uuid, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$ declare g public.groups%rowtype;
  v_teacher uuid; v_session text; v_level text; v_days smallint[]; begin
  perform operational_security.require_receptionist();
  if p_group is null then raise exception 'Stable group id required' using errcode='22023'; end if;
  perform operational_security.assert_keys(p_changes,array['name','langue','session_type','niveau','teacher_id',
    'salle','jours','horaire','capacite_max','terme','annee','categorie','date_debut','date_fin','class_days']);
  v_teacher:=nullif(p_changes->>'teacher_id','')::uuid;
  v_days:=academic_security.class_days_from(p_changes->'class_days');
  if p_changes ? 'teacher_id' and v_teacher is not null and not exists(
    select 1 from public.teachers t where t.id=v_teacher and t.deleted_at is null) then
    raise exception 'Teacher unavailable' using errcode='23514'; end if;
  if p_expected_updated_at is null then
    if nullif(btrim(p_changes->>'name'),'') is null or p_changes->>'niveau' is null then
      raise exception 'Group name and level required' using errcode='22023'; end if;
    -- 141 (OD-9 A, NF-16): an online group is created by the direction with its course.
    if coalesce(p_changes->>'session_type','Yearly') in ('Online','Online One-to-One') then
      raise exception 'Un groupe en ligne est créé par la direction.' using errcode='42501', hint='group.online_management_only'; end if;
    if operational_security.valid_session_level(coalesce(p_changes->>'session_type','Yearly'),
      p_changes->>'niveau') is not true then
      raise exception 'Invalid group session/level' using errcode='22023'; end if;
    insert into public.groups(id,name,langue,session_type,niveau,teacher_id,salle,jours,horaire,
      capacite_max,terme,annee,categorie,date_debut,date_fin,class_days)
    values(p_group,p_changes->>'name',coalesce(p_changes->>'langue','Anglais'),
      coalesce(p_changes->>'session_type','Yearly'),p_changes->>'niveau',v_teacher,
      p_changes->>'salle',p_changes->>'jours',p_changes->>'horaire',
      coalesce((p_changes->>'capacite_max')::integer,12),p_changes->>'terme',
      p_changes->>'annee',p_changes->>'categorie',
      nullif(p_changes->>'date_debut','')::date,nullif(p_changes->>'date_fin','')::date,v_days) on conflict on constraint groups_pkey do nothing
    returning groups.id,groups.updated_at into id,updated_at;
    if id is null then
      select * into g from public.groups where groups.id=p_group for update;
      if g.name is distinct from p_changes->>'name' or
        g.langue is distinct from coalesce(p_changes->>'langue','Anglais') or
        g.session_type is distinct from coalesce(p_changes->>'session_type','Yearly') or
        g.niveau is distinct from p_changes->>'niveau' or g.teacher_id is distinct from v_teacher or
        g.salle is distinct from p_changes->>'salle' or g.jours is distinct from p_changes->>'jours' or
        g.horaire is distinct from p_changes->>'horaire' or
        g.capacite_max is distinct from coalesce((p_changes->>'capacite_max')::integer,12) or
        g.terme is distinct from p_changes->>'terme' or g.annee is distinct from coalesce(nullif(btrim(p_changes->>'annee'),''),g.annee) or
        g.categorie is distinct from p_changes->>'categorie' or
        g.date_debut is distinct from nullif(p_changes->>'date_debut','')::date or
        g.date_fin is distinct from nullif(p_changes->>'date_fin','')::date or
        g.class_days is distinct from v_days then
        raise exception 'Group create identity conflict' using errcode='23505'; end if;
      id:=g.id; updated_at:=g.updated_at;
    end if;
  else
    if p_changes='{}'::jsonb then raise exception 'No changes' using errcode='22023'; end if;
    select * into g from public.groups where groups.id=p_group for update;
    if not found or g.updated_at is distinct from p_expected_updated_at then
      raise exception 'Group unavailable or stale' using errcode='PT409'; end if;
    v_session:=case when p_changes ? 'session_type' then p_changes->>'session_type' else g.session_type end;
    v_level:=case when p_changes ? 'niveau' then p_changes->>'niveau' else g.niveau end;
    -- 141 (OD-9 A, NF-16): a group never becomes online through the reception command.
    if v_session in ('Online','Online One-to-One') and v_session is distinct from g.session_type then
      raise exception 'Un groupe en ligne est créé par la direction.' using errcode='42501', hint='group.online_management_only'; end if;
    if (v_session is distinct from g.session_type or v_level is distinct from g.niveau) and
      operational_security.valid_session_level(v_session,v_level) is not true then
      raise exception 'Invalid group session/level' using errcode='22023'; end if;
    if (v_session is distinct from g.session_type or v_level is distinct from g.niveau) and (
      exists(select 1 from public.enrollments e where e.group_id=p_group)
      or exists(select 1 from public.students s where s.groupe_id=p_group and s.deleted_at is null)) then
      raise exception 'Reassign learners before changing group session or level' using errcode='23514'; end if;
    update public.groups set
      name=case when p_changes ? 'name' then p_changes->>'name' else g.name end,
      langue=case when p_changes ? 'langue' then p_changes->>'langue' else g.langue end,
      session_type=v_session,niveau=v_level,
      teacher_id=case when p_changes ? 'teacher_id' then v_teacher else g.teacher_id end,
      salle=case when p_changes ? 'salle' then p_changes->>'salle' else g.salle end,
      jours=case when p_changes ? 'jours' then p_changes->>'jours' else g.jours end,
      horaire=case when p_changes ? 'horaire' then p_changes->>'horaire' else g.horaire end,
      capacite_max=case when p_changes ? 'capacite_max' then (p_changes->>'capacite_max')::integer else g.capacite_max end,
      terme=case when p_changes ? 'terme' then p_changes->>'terme' else g.terme end,
      annee=case when p_changes ? 'annee' then p_changes->>'annee' else g.annee end,
      categorie=case when p_changes ? 'categorie' then p_changes->>'categorie' else g.categorie end,
      date_debut=case when p_changes ? 'date_debut' then nullif(p_changes->>'date_debut','')::date else g.date_debut end,
      date_fin=case when p_changes ? 'date_fin' then nullif(p_changes->>'date_fin','')::date else g.date_fin end,
      class_days=case when p_changes ? 'class_days' then v_days else g.class_days end
    where groups.id=p_group returning groups.id,groups.updated_at into id,updated_at;
  end if;
  return next;
end $function$;

-- ---------------------------------------------------------------------------
-- 5b. Phone search from 6 typed digits (§5.1). phone_key removes one leading 00212, 212,
--     00 or 0 (a trunk or international prefix); in a partial query those digits may be
--     part of the number itself. The key is the 139 one when it keeps 6 digits or more;
--     otherwise, when the removed prefix was 00, 212 or 00212 (more than the trunk 0) and
--     the query holds 6 digits or more, the query's own digits (still a run of the stored
--     number); otherwise no phone match. A trunk 0 alone keeps the 139 rule: « 06 12 34 »
--     (5 significant digits) is no phone search. Same signature, posture and grants (create or replace);
--     every search box calls it (search_students_page, find_people, crm_search_leads,
--     opportunity_ids, search_desk_students). Mirrored by phoneSearchKey in src/lib/phone.mjs.
-- ---------------------------------------------------------------------------
create or replace function public.phone_search_key(query text)
returns text language sql immutable parallel safe
set search_path = pg_catalog, pg_temp as $$
 select case when length(k)>=6 then k when length(d)>=6 and d !~ '^0([^0]|$)' then d end
 from (select public.phone_key(query) k, regexp_replace(coalesce(query,''),'[^0-9]','','g') d) x
$$;

-- ---------------------------------------------------------------------------
-- 6. Data step D7 (group class days) — shipped, NOT run. Operator only, with the owner's
--    « approve D7 »: d7_plan() → counts and group ids (the free text is never returned,
--    only an 8-character hash, as Q25); d7_apply(expected counts) writes class_days from
--    the parsed « jours » of in-person groups whose class_days is empty; d7_revert() puts
--    back NULL where the value is still the one D7 wrote. Journal: crm_data_step_journal.
--    The parser: French or English day names or three-letter abbreviations separated by
--    commas, « / », « + », « & », « et » or spaces; any other word (a range « Lun-Ven »,
--    a time) leaves the group unparsed and listed. src/lib/academic/classDays.mjs is the
--    same parser (scripts/fixtures/class-days-cases.json pins both).
-- ---------------------------------------------------------------------------
create or replace function academic_security.parse_class_days(t text)
returns smallint[] language plpgsql immutable
set search_path = pg_catalog, pg_temp as $$
declare tok text; d smallint; out smallint[] := '{}';
begin
  if t is null or btrim(t) = '' then return null; end if;
  for tok in select x from regexp_split_to_table(
      translate(lower(btrim(t)), 'éèêëàâäîïôöûüùç', 'eeeeaaaiioouuuc'), '\s*[,;/+&]\s*|\s+et\s+|\s+') x loop
    continue when tok = '';
    d := case
      when tok ~ '^(lun|lundi|lundis|mon|monday)\.?$' then 1
      when tok ~ '^(mar|mardi|mardis|tue|tuesday)\.?$' then 2
      when tok ~ '^(mer|mercredi|mercredis|wed|wednesday)\.?$' then 3
      when tok ~ '^(jeu|jeudi|jeudis|thu|thursday)\.?$' then 4
      when tok ~ '^(ven|vendredi|vendredis|fri|friday)\.?$' then 5
      when tok ~ '^(sam|samedi|samedis|sat|saturday)\.?$' then 6
      when tok ~ '^(dim|dimanche|dimanches|sun|sunday)\.?$' then 7 end;
    if d is null then return '{}'::smallint[]; end if;
    out := out || d;
  end loop;
  out := array(select distinct x from unnest(out) x order by 1);
  return out;
end $$;

create or replace function crm_security.d7_rows()
returns table(group_id uuid, jours_hash text, proposed smallint[], outcome text)
language sql stable
set search_path = pg_catalog, pg_temp as $$
  select g.id, left(md5(lower(btrim(coalesce(g.jours, '')))), 8), nullif(x.days, '{}'::smallint[]),
    case when x.days is null then 'empty' when cardinality(x.days) = 0 then 'unparseable' else 'parsed' end
  from public.groups g cross join lateral (select academic_security.parse_class_days(g.jours) days) x
  where g.class_days is null and g.session_type not in ('Online', 'Online One-to-One')
$$;

create or replace function crm_security.d7_plan()
returns jsonb language sql stable
set search_path = pg_catalog, pg_temp as $$
  select jsonb_build_object(
    'counts', jsonb_build_object(
      'parsed', count(*) filter (where outcome = 'parsed'),
      'unparseable', count(*) filter (where outcome = 'unparseable'),
      'empty', count(*) filter (where outcome = 'empty')),
    'unparseable', coalesce(jsonb_agg(jsonb_build_object('group_id', group_id, 'hash', jours_hash) order by group_id)
      filter (where outcome = 'unparseable'), '[]'::jsonb),
    'samples', coalesce((select jsonb_agg(jsonb_build_object('group_id', r.group_id, 'class_days', to_jsonb(r.proposed)) order by r.group_id)
      from (select * from crm_security.d7_rows() where outcome = 'parsed' order by group_id limit 5) r), '[]'::jsonb))
  from crm_security.d7_rows()
$$;

create or replace function crm_security.d7_apply(expected jsonb)
returns jsonb language plpgsql
set search_path = pg_catalog, pg_temp as $$
declare plan jsonb; r record; n integer := 0;
begin
  if exists (select 1 from public.crm_data_step_journal where step in ('d7', 'd7_revert')) then
    raise exception 'D7 has already run' using errcode = '55000', hint = 'd7.already_run'; end if;
  lock table public.groups in share row exclusive mode;
  plan := crm_security.d7_plan();
  if expected is distinct from plan->'counts' then
    raise exception 'D7 counts differ from the approved dry run: %', plan->'counts' using errcode = '22023', hint = 'd7.counts'; end if;
  for r in select * from crm_security.d7_rows() where outcome = 'parsed' order by group_id loop
    insert into public.crm_data_step_journal(step, entity, entity_id, before, after, run_by)
    values ('d7', 'groups', r.group_id, jsonb_build_object('class_days', null), jsonb_build_object('class_days', to_jsonb(r.proposed)), auth.uid());
    update public.groups set class_days = r.proposed where id = r.group_id and class_days is null;
    n := n + 1;
  end loop;
  return jsonb_build_object('updated', n, 'counts', plan->'counts');
end $$;

create or replace function crm_security.d7_revert()
returns jsonb language plpgsql
set search_path = pg_catalog, pg_temp as $$
declare j record; restored integer := 0; skipped jsonb := '[]'::jsonb; cur smallint[];
begin
  if not exists (select 1 from public.crm_data_step_journal where step = 'd7') then
    raise exception 'D7 has not run' using errcode = '55000', hint = 'd7.not_run'; end if;
  if exists (select 1 from public.crm_data_step_journal where step = 'd7_revert') then
    raise exception 'D7 has already been reverted' using errcode = '55000', hint = 'd7.already_reverted'; end if;
  lock table public.groups in share row exclusive mode;
  for j in select * from public.crm_data_step_journal where step = 'd7' order by run_at desc, id loop
    select g.class_days into cur from public.groups g where g.id = j.entity_id for update;
    if found and to_jsonb(cur) = j.after->'class_days' then
      update public.groups set class_days = null where id = j.entity_id;
      insert into public.crm_data_step_journal(step, entity, entity_id, before, after, run_by)
      values ('d7_revert', 'groups', j.entity_id, j.after, j.before, auth.uid());
      restored := restored + 1;
    else
      skipped := skipped || to_jsonb(j.entity_id);
    end if;
  end loop;
  return jsonb_build_object('restored', restored, 'skipped', skipped);
end $$;

-- ---------------------------------------------------------------------------
-- 7. Grants. Helpers and D7: no API role (the private schemas give none either). The
--    learner test commands: authenticated (each checks the role itself).
-- ---------------------------------------------------------------------------
revoke all on function academic_security.category_ages(text), academic_security.level_ages(text,text),
  academic_security.level_allowed(text,text,integer), academic_security.age_on(date,date),
  academic_security.student_rules(), academic_security.test_starts(public.placement_tests),
  academic_security.placement_rules(), academic_security.placement_row(public.placement_tests),
  academic_security.assert_student_slot(uuid,timestamptz,uuid), academic_security.normalize_class_days(),
  academic_security.closed_on(date), academic_security.class_days_from(jsonb), academic_security.parse_class_days(text),
  crm_security.d7_rows(), crm_security.d7_plan(), crm_security.d7_apply(jsonb), crm_security.d7_revert()
  from public, anon, authenticated, service_role;
revoke all on function public.book_student_placement_test(uuid,jsonb), public.update_placement_test_result(uuid,timestamptz,jsonb),
  public.delete_placement_test(uuid,timestamptz) from public, anon, service_role;
grant execute on function public.book_student_placement_test(uuid,jsonb), public.update_placement_test_result(uuid,timestamptz,jsonb),
  public.delete_placement_test(uuid,timestamptz) to authenticated;
