-- Portal readiness (plan PRF-r2) data clean-up C0–C2 and the D9 constraint
-- validation. NOT RUN by the migration or by CI against real data: the release
-- task runs it once, after migration 122, under the owner's explicit approval
-- (R3), with the counts its own dry-run queries returned:
--
--   psql ... -v c1_parent=4 -v c1_email=2 -v c1_teacher=1 -v c2_email=33 -v c2_parent=7 \
--     -f scripts/portal-readiness-cleanup.sql
--
-- One transaction: any count that differs aborts it and changes nothing. No
-- address is printed or written anywhere but the private before-image (C0).
-- Issued receipts are never changed (financial history).
\set ON_ERROR_STOP on
begin;
select set_config('portal_cleanup.c1_parent', :'c1_parent', true), set_config('portal_cleanup.c1_email', :'c1_email', true),
  set_config('portal_cleanup.c1_teacher', :'c1_teacher', true), set_config('portal_cleanup.c2_email', :'c2_email', true),
  set_config('portal_cleanup.c2_parent', :'c2_parent', true);

do $$ begin
  if to_regclass('public.family_links') is null then
    raise exception 'Portal clean-up requires migration 122' using errcode = '55000';
  end if;
  if exists (select 1 from public.family_links) or exists (select 1 from public.profiles where role in ('parent','student','teacher')) then
    raise exception 'Portal clean-up runs before the first portal account exists' using errcode = '55000';
  end if;
end $$;

-- C0: private before-image of every row C1–C2 touches; no API grant; dropped 90
-- days after the owner confirms the result.
create table if not exists maintenance.portal_cleanup_before (
  id bigint generated always as identity primary key,
  step text not null,
  entity text not null check (entity in ('students','teachers')),
  row_id uuid not null,
  email text,
  parent_email text,
  at timestamptz not null default now()
);
alter table maintenance.portal_cleanup_before enable row level security;
revoke all on table maintenance.portal_cleanup_before from public, anon, authenticated, service_role;
do $$ begin
  if exists (select 1 from maintenance.portal_cleanup_before) then
    raise exception 'Portal clean-up already ran: maintenance.portal_cleanup_before is not empty' using errcode = '55000';
  end if;
end $$;

-- C2 identifies the placeholder at run time: the only learner address on more than
-- 10 non-archived learner files. Its value is never written outside C0.
create temp table portal_placeholder on commit drop as
  select lower(btrim(s.email)) as address from public.students s
  where s.deleted_at is null and nullif(btrim(s.email), '') is not null
  group by lower(btrim(s.email)) having count(*) > 10;

do $$ declare n integer; v_expected integer;
begin
  select count(*) into n from portal_placeholder;
  v_expected := case when current_setting('portal_cleanup.c2_email')::integer = 0 then 0 else 1 end;
  if n <> v_expected then
    raise exception 'C2: expected % placeholder address(es) on more than 10 learners, found %', v_expected, n using errcode = '23514';
  end if;
  select count(*) into n from public.students s where lower(btrim(s.email)) in (select address from portal_placeholder);
  if n <> current_setting('portal_cleanup.c2_email')::integer then
    raise exception 'C2: expected % learner files with the placeholder address, found %', current_setting('portal_cleanup.c2_email'), n
      using errcode = '23514';
  end if;
  select count(*) into n from public.students s where lower(btrim(s.parent_email)) in (select address from portal_placeholder);
  if n <> current_setting('portal_cleanup.c2_parent')::integer then
    raise exception 'C2: expected % parent addresses equal to the placeholder, found %', current_setting('portal_cleanup.c2_parent'), n
      using errcode = '23514';
  end if;
  if exists (select 1 from public.students s where s.deleted_at is not null and lower(btrim(s.email)) in (select address from portal_placeholder)) then
    raise exception 'C2: an archived learner carries the placeholder; stop and review' using errcode = '23514';
  end if;
end $$;

-- C1 counts: addresses that differ from their normalised form only by case or spaces.
do $$ declare n integer;
begin
  select count(*) into n from public.students where parent_email <> lower(btrim(parent_email))
    and lower(btrim(parent_email)) not in (select address from portal_placeholder);
  if n <> current_setting('portal_cleanup.c1_parent')::integer then
    raise exception 'C1: expected % parent addresses to normalise, found %', current_setting('portal_cleanup.c1_parent'), n using errcode = '23514';
  end if;
  select count(*) into n from public.students where email <> lower(btrim(email))
    and lower(btrim(email)) not in (select address from portal_placeholder);
  if n <> current_setting('portal_cleanup.c1_email')::integer then
    raise exception 'C1: expected % learner addresses to normalise, found %', current_setting('portal_cleanup.c1_email'), n using errcode = '23514';
  end if;
  select count(*) into n from public.teachers where email <> lower(btrim(email));
  if n <> current_setting('portal_cleanup.c1_teacher')::integer then
    raise exception 'C1: expected % teacher addresses to normalise, found %', current_setting('portal_cleanup.c1_teacher'), n using errcode = '23514';
  end if;
  if exists (select 1 from public.teachers where deleted_at is null and nullif(btrim(email), '') is not null
      group by lower(btrim(email)) having count(*) > 1) then
    raise exception 'C1: two active teacher records would share an address' using errcode = '23505';
  end if;
end $$;

-- C0 before-image, then C1 and C2.
insert into maintenance.portal_cleanup_before(step, entity, row_id, email, parent_email)
select 'C2', 'students', s.id, s.email, s.parent_email from public.students s
where lower(btrim(s.email)) in (select address from portal_placeholder)
   or lower(btrim(s.parent_email)) in (select address from portal_placeholder);
insert into maintenance.portal_cleanup_before(step, entity, row_id, email, parent_email)
select 'C1', 'students', s.id, s.email, s.parent_email from public.students s
where (s.email <> lower(btrim(s.email)) or s.parent_email <> lower(btrim(s.parent_email)))
  and not exists (select 1 from maintenance.portal_cleanup_before b where b.row_id = s.id);
insert into maintenance.portal_cleanup_before(step, entity, row_id, email, parent_email)
select 'C1', 'teachers', t.id, t.email, null from public.teachers t where t.email <> lower(btrim(t.email));

-- C2 (Q9 = A): the placeholder is cleared from the learner files; reception
-- collects each family's real address before inviting.
update public.students set email = null where lower(btrim(email)) in (select address from portal_placeholder);
update public.students set parent_email = null where lower(btrim(parent_email)) in (select address from portal_placeholder);
-- C1: the D9 trigger stores the normalised value on any write of the row.
update public.students set email = email, parent_email = parent_email
where email <> lower(btrim(email)) or parent_email <> lower(btrim(parent_email));
update public.teachers set email = email where email <> lower(btrim(email));

-- D9: validate the constraints; a remaining non-normalised row aborts everything.
alter table public.students validate constraint students_email_normalized;
alter table public.students validate constraint students_parent_email_normalized;
alter table public.teachers validate constraint teachers_email_normalized;
alter table public.messages validate constraint messages_emails_normalized;
alter table public.notifications validate constraint notifications_recipient_email_normalized;

-- Aggregates only, for the release evidence.
select jsonb_build_object(
  'before_image_rows', (select count(*) from maintenance.portal_cleanup_before),
  'c1_rows', (select count(*) from maintenance.portal_cleanup_before where step = 'C1'),
  'c2_rows', (select count(*) from maintenance.portal_cleanup_before where step = 'C2'),
  'placeholder_left', (select count(*) from public.students s where lower(btrim(s.email)) in (select address from portal_placeholder)
    or lower(btrim(s.parent_email)) in (select address from portal_placeholder)),
  'readiness_failures', to_jsonb(portal_security.readiness_failures())) as portal_cleanup_result;
commit;
