-- RWR-r5 PR B2 — catalogues (M-B2).
-- Migration 140. Plan: docs/architecture/plans/receptionist-workflow.md §5.4, §7
-- invariant 11, §8 (PR B2), §10 (M-B2, D4), as amended in its B2 implementation
-- record (owner decision of 2026-11-26 replacing OD-16: B2 ships with no programme
-- prices; the catalogue price is empty and director-editable, and pre-fills once set).
--
-- What it does:
--  * programmes (the 10 existing session_type codes, French label, audience, offered
--    to prospects, enrollable), programme_levels (checked against
--    operational_security.valid_session_level, which stays the rule) and
--    programme_prices (append-only, director-edited, EMPTY: no price is seeded);
--  * crm_leads.session_type: the 8-value check is replaced by a foreign key to
--    programmes. Every existing value is one of the 10 codes, so no row changes;
--  * acquisition_sources (the origin list) with crm_leads.origin_code, referrer_text,
--    referrer_student_id, referrer_lead_id and students.origin_code. Meta and website
--    prospects read their origin from their first touch (crm_security.lead_origin);
--    nothing is written to existing rows: students.origin_code and the free-text
--    mapping are data step D4, shipped here and NOT run;
--  * crm_close_reasons: one list of 14 codes (13 offered), the status derived from the
--    reason. crm_leads_closure accepts wrong_number (NOT_QUALIFIED) and duplicate for
--    LOST too;
--  * crm_security.command (live 139 body): create_prospect and update_prospect take
--    origin_code and referrer; the programme is a catalogue code; the origin is edited
--    on manual prospects only (OD-10 A); a close may omit its status;
--  * crm_security.evaluate_conversion: a conversion writes the enrollment's programme
--    to the prospect (invariant 11) and the prospect's origin to a learner file that
--    has none;
--  * get_referral_breakdown reads the origin list (the old five answers map to it);
--    crm_get_workspace_detail returns origin and referrer; save_receptionist_student
--    accepts origin_code; search_students_page filters the source on the origin list;
--  * get_catalogue (admin, director, receptionist) and catalogue_set_price /
--    catalogue_save_programme (director);
--  * data step D4 (programme and origin mapping): d4_rows, d4_plan, d4_apply,
--    d4_revert — functions only, NOT run, granted to no API role.
--  * data step D6 (test data; owner decision 2026-11-26): d6_references, d6_rows,
--    d6_plan, d6_apply, d6_revert — functions only, NOT run, granted to no API role —
--    and report_exclusions (no API access), which crm_get_marketing_cohort now reads
--    to leave out the test prospects D6 marks (empty until D6 runs).
--
-- Unchanged: set_next_action and the one-action rule; the lifecycle barrier; event
-- types; first-touch immutability (no submission is written); every other function,
-- grant and policy. Finance and academic tables keep their stored codes.

-- ---------------------------------------------------------------------------
-- 0. Precondition: migration 139 (B1) is applied and every function 140 re-creates
--    is still the body 139 left live (plan stop condition: a cumulative function
--    that differs).
-- ---------------------------------------------------------------------------
do $$
declare f record;
begin
  if to_regprocedure('public.find_people(text,text,text,date,integer)') is null then
    raise exception 'Migration 140: needs migration 139 (people identity)' using errcode = '55000';
  end if;
  for f in select * from jsonb_each_text(jsonb_build_object(
      'crm_security.command(text,uuid,jsonb)', '6085a9430e94f00d9ddbb06b5e037a4b',
      'crm_security.evaluate_conversion(uuid,timestamp with time zone,text,text)', '0d22c736ec6367a020c9d450510cff5a',
      'public.get_referral_breakdown()', 'cf7ab151740ea681072b134b563bd926',
      'public.crm_get_workspace_detail(uuid)', '7f7202688d663931576e35fd479e75fb',
      'public.save_receptionist_student(uuid,timestamp with time zone,jsonb)', '827fba795a8836b3771358a7b4192b02',
      'public.search_students_page(text,text,text,text,text,boolean,text,text,integer,integer,text,text)', '3d25c65ed8a52df3c962f339452cfc97',
      'public.crm_get_marketing_cohort(date,date,date,uuid,text,text,text,text,text,integer,integer,text)', '6fda5eec4d2d3e30b7abd5f25b394131')) loop
    if to_regprocedure(f.key) is null
       or (select md5(prosrc) from pg_proc where oid = to_regprocedure(f.key)) is distinct from f.value then
      raise exception 'Migration 140: % differs from the body 139 left live; rebuild 140 on the live definition', f.key
        using errcode = '55000';
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Programmes, levels, prices (§5.4). Labels: src/lib/programCatalog.mjs holds the
--    same values (scripts/test-catalogue-labels.mjs). Additive objects are created
--    only if absent, so 140 can be applied again after its restore.
-- ---------------------------------------------------------------------------
create table if not exists public.programmes (
  code text primary key,
  label_fr text not null check (length(btrim(label_fr)) between 1 and 80),
  audience text not null check (audience in ('enfants','ados','adultes','tous')),
  crm_selectable boolean not null default true,
  enrollable boolean not null default true,
  active boolean not null default true,
  sort_order integer not null,
  version bigint not null default 1 check (version > 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete restrict
);

insert into public.programmes(code, label_fr, audience, crm_selectable, enrollable, sort_order) values
  ('Yearly', 'Programme annuel', 'enfants', true, true, 10),
  ('Adults', 'Adultes', 'adultes', true, true, 20),
  ('Summer Camp', 'Stage d’été', 'enfants', true, true, 30),
  ('Communication Junior', 'Communication junior', 'ados', true, true, 40),
  ('Communication Adult', 'Communication adultes', 'adultes', true, true, 50),
  ('One-to-One', 'Cours individuel', 'tous', true, true, 60),
  ('Mise à niveau', 'Mise à niveau', 'tous', true, true, 70),
  ('Online', 'Cours en ligne', 'tous', true, true, 80),
  ('Online One-to-One', 'Cours individuel en ligne', 'tous', true, true, 90),
  ('Other', 'Autre programme', 'tous', true, false, 100)
on conflict (code) do nothing;

create table if not exists public.programme_levels (
  programme_code text not null references public.programmes(code) on delete restrict,
  level text not null,
  min_age integer check (min_age between 0 and 120),
  max_age integer check (max_age between 0 and 120),
  sort_order integer not null,
  primary key (programme_code, level),
  constraint programme_levels_valid check (operational_security.valid_session_level(programme_code, level)),
  constraint programme_levels_age_range check (min_age is null or max_age is null or min_age <= max_age)
);

insert into public.programme_levels(programme_code, level, sort_order)
select p.code, lv.level, lv.ord
from public.programmes p
cross join lateral (
  select level, ord::integer from unnest(case
    when p.code = 'Yearly' then array['Pre-Child','Child 1','Child 2','Child 3','Child 4','Child 5','Child 6',
      'Junior 1','Junior 2','Junior 3','Junior 4','Junior 5','Junior 6']
    when p.code = 'Adults' then array['Beginning 1','Beginning 2','Beginning 3','Beginning 4','Beginning 5','Beginning 6',
      'Intermediate 1','Intermediate 2','Intermediate 3','Intermediate 4','Intermediate 5','Intermediate 6',
      'Advanced 1','Advanced 2','Advanced 3','Advanced 4','Advanced 5']
    else array['A1','A2','B1','B2','C1','C2'] end) with ordinality u(level, ord)
) lv
on conflict (programme_code, level) do nothing;

-- Append-only: the latest row for a programme and school year is the price; a row
-- with no amount clears it. No row is seeded (owner decision 2026-11-26).
create table if not exists public.programme_prices (
  id uuid primary key default gen_random_uuid(),
  programme_code text not null references public.programmes(code) on delete restrict,
  school_year text not null check (school_year ~ '^[0-9]{4}/[0-9]{4}$'
    and substr(school_year, 6, 4)::integer = substr(school_year, 1, 4)::integer + 1),
  amount numeric(12,2) check (amount is null or amount > 0),
  label_fr text check (label_fr is null or length(btrim(label_fr)) between 1 and 120),
  effective_from timestamptz not null default clock_timestamp(),
  created_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists programme_prices_current_idx
  on public.programme_prices(programme_code, school_year, effective_from desc, created_at desc, id desc);

-- ---------------------------------------------------------------------------
-- 2. Origins (§5.4).
-- ---------------------------------------------------------------------------
create table if not exists public.acquisition_sources (
  code text primary key check (code ~ '^[a-z][a-z_]*$'),
  label_fr text not null check (length(btrim(label_fr)) between 1 and 80),
  channel text not null check (channel in ('manual','meta','website')),
  requires_referrer boolean not null default false,
  selectable boolean not null default true,
  active boolean not null default true,
  sort_order integer not null
);

-- meta_form is the Meta lead form itself: read from the first touch, never chosen.
-- social_media keeps the old student answer « Réseaux sociaux (Facebook / Instagram) »,
-- which can't be split into Instagram or Facebook; it is not offered.
insert into public.acquisition_sources(code, label_fr, channel, requires_referrer, selectable, sort_order) values
  ('instagram', 'Instagram', 'manual', false, true, 10),
  ('facebook', 'Facebook', 'manual', false, true, 20),
  ('meta_form', 'Meta (formulaire)', 'meta', false, false, 30),
  ('website', 'Site web', 'website', false, true, 40),
  ('google', 'Google', 'manual', false, true, 50),
  ('recommendation', 'Recommandation', 'manual', true, true, 60),
  ('walk_by', 'Passage devant le centre', 'manual', false, true, 70),
  ('inbound_call', 'Appel entrant', 'manual', false, true, 80),
  ('former_student', 'Ancien élève', 'manual', false, true, 90),
  ('other', 'Autre', 'manual', false, true, 100),
  ('social_media', 'Réseaux sociaux', 'manual', false, false, 110)
on conflict (code) do nothing;

alter table public.crm_leads add column if not exists origin_code text references public.acquisition_sources(code) on delete restrict;
alter table public.crm_leads add column if not exists referrer_text text check (referrer_text is null or length(btrim(referrer_text)) between 1 and 200);
alter table public.crm_leads add column if not exists referrer_student_id uuid references public.students(id) on delete restrict;
alter table public.crm_leads add column if not exists referrer_lead_id uuid references public.crm_leads(id) on delete restrict;
alter table public.students add column if not exists origin_code text references public.acquisition_sources(code) on delete restrict;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.crm_leads'::regclass and conname = 'crm_leads_one_referrer') then
    alter table public.crm_leads add constraint crm_leads_one_referrer check (
      (referrer_text is not null)::integer + (referrer_student_id is not null)::integer + (referrer_lead_id is not null)::integer <= 1
      and referrer_lead_id is distinct from id);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. crm_leads.session_type: the 8-value check becomes a foreign key to programmes.
-- ---------------------------------------------------------------------------
alter table public.crm_leads drop constraint if exists crm_leads_session_type_check;
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.crm_leads'::regclass and conname = 'crm_leads_session_type_fkey') then
    alter table public.crm_leads add constraint crm_leads_session_type_fkey
      foreign key (session_type) references public.programmes(code) on delete restrict;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Close reasons (§5.4): one list, the status derived from the reason.
-- ---------------------------------------------------------------------------
create table if not exists public.crm_close_reasons (
  code text primary key check (code ~ '^[a-z][a-z_]*$'),
  label_fr text not null check (length(btrim(label_fr)) between 1 and 80),
  status text not null check (status in ('LOST','NOT_QUALIFIED')),
  selectable boolean not null default true,
  requires_note boolean not null default false,
  requires_failed_calls boolean not null default false,
  sort_order integer not null
);

-- « Pas intéressé » always asks why: its precisions are price, schedule, location,
-- chose_competitor, postponed, and not_interested itself with a note (the screens).
-- age_not_suitable reads as the one « Âge ou programme non adapté » entry and is no
-- longer offered; `other` and `duplicate` stay valid for either status.
insert into public.crm_close_reasons(code, label_fr, status, selectable, requires_note, requires_failed_calls, sort_order) values
  ('not_interested', 'Pas intéressé', 'LOST', true, false, false, 10),
  ('price', 'Prix', 'LOST', true, false, false, 20),
  ('schedule', 'Horaires', 'LOST', true, false, false, 30),
  ('location', 'Localisation', 'LOST', true, false, false, 40),
  ('chose_competitor', 'Autre centre choisi', 'LOST', true, false, false, 50),
  ('postponed', 'Projet reporté', 'LOST', true, false, false, 60),
  ('unreachable', 'Injoignable', 'LOST', true, false, true, 70),
  ('wrong_number', 'Mauvais numéro', 'NOT_QUALIFIED', true, false, false, 80),
  ('duplicate', 'Doublon', 'LOST', true, false, false, 90),
  ('program_not_suitable', 'Âge ou programme non adapté', 'NOT_QUALIFIED', true, false, false, 100),
  ('age_not_suitable', 'Âge ou programme non adapté', 'NOT_QUALIFIED', false, false, false, 101),
  ('invalid_spam', 'Invalide / indésirable', 'NOT_QUALIFIED', true, false, false, 110),
  ('outside_scope', 'Hors périmètre', 'NOT_QUALIFIED', true, false, false, 120),
  ('other', 'Autre', 'LOST', true, true, false, 130)
on conflict (code) do nothing;

alter table public.crm_leads drop constraint if exists crm_leads_closure;
alter table public.crm_leads add constraint crm_leads_closure check (
  ((status = 'LOST') and (closed_at is not null) and (closure_reason is not null)
    and (closure_reason = any (array['unreachable','not_interested','price','schedule','location','chose_competitor','postponed','other','duplicate']))
    and ((closure_reason <> 'other') or (coalesce(length(btrim(closure_note)), 0) > 0)))
  or ((status = 'NOT_QUALIFIED') and (closed_at is not null) and (closure_reason is not null)
    and (closure_reason = any (array['age_not_suitable','program_not_suitable','invalid_spam','duplicate','outside_scope','other','wrong_number']))
    and ((closure_reason <> 'other') or (coalesce(length(btrim(closure_note)), 0) > 0)))
  or ((status <> all (array['LOST','NOT_QUALIFIED'])) and (closure_reason is null) and (closure_note is null) and (closed_at is null)));

-- ---------------------------------------------------------------------------
-- 5. Vocabulary reads and private helpers. The four vocabulary tables are readable
--    by signed-in staff (labels only; get_referral_breakdown is security invoker).
--    Prices are read through get_catalogue only. Nothing is writable through the API.
-- ---------------------------------------------------------------------------
alter table public.programmes enable row level security;
alter table public.programme_levels enable row level security;
alter table public.programme_prices enable row level security;
alter table public.acquisition_sources enable row level security;
alter table public.crm_close_reasons enable row level security;
-- service_role too (as B1 did for its tables): nothing server-side reads them directly.
revoke all on public.programmes, public.programme_levels, public.programme_prices,
  public.acquisition_sources, public.crm_close_reasons from public, anon, authenticated, service_role;
grant select on public.programmes, public.programme_levels, public.acquisition_sources to authenticated;
-- The labels are not sensitive: any signed-in user may read them (the screens print
-- them from src/lib/programCatalog.mjs, asserted equal to these rows). crm_close_reasons
-- follows the CRM rule (no crm_* table is read directly; test-crm-phase12-security.mjs):
-- it is read through get_catalogue, like the prices.
drop policy if exists programmes_read on public.programmes;
create policy programmes_read on public.programmes for select to authenticated using (true);
drop policy if exists programme_levels_read on public.programme_levels;
create policy programme_levels_read on public.programme_levels for select to authenticated using (true);
drop policy if exists acquisition_sources_read on public.acquisition_sources;
create policy acquisition_sources_read on public.acquisition_sources for select to authenticated using (true);
drop policy if exists crm_close_reasons_read on public.crm_close_reasons;

create or replace function crm_security.close_status(reason text)
returns text language sql stable
set search_path = pg_catalog, pg_temp as $$
  select status from public.crm_close_reasons where code = reason
$$;

-- The (status, reason) pairs crm_leads_closure accepts.
create or replace function crm_security.close_reason_allowed(target text, reason text)
returns boolean language sql immutable
set search_path = pg_catalog, pg_temp as $$
  select coalesce((target = 'LOST' and reason = any (array['unreachable','not_interested','price','schedule','location','chose_competitor','postponed','other','duplicate']))
    or (target = 'NOT_QUALIFIED' and reason = any (array['age_not_suitable','program_not_suitable','invalid_spam','duplicate','outside_scope','other','wrong_number'])), false)
$$;

create or replace function crm_security.programme_selectable(code text)
returns boolean language sql stable
set search_path = pg_catalog, pg_temp as $$
  select exists (select 1 from public.programmes p where p.code = programme_selectable.code and p.active and p.crm_selectable)
$$;

create or replace function crm_security.origin_selectable(code text)
returns boolean language sql stable
set search_path = pg_catalog, pg_temp as $$
  select exists (select 1 from public.acquisition_sources a where a.code = origin_selectable.code and a.active and a.selectable)
$$;

-- A prospect's origin: its own code, else its first touch (Meta form, website).
create or replace function crm_security.lead_origin(l public.crm_leads)
returns text language sql stable
set search_path = pg_catalog, pg_temp as $$
  select coalesce(l.origin_code, (select case s.channel when 'meta_instant_form' then 'meta_form' when 'website' then 'website' end
    from public.crm_submissions s where s.id = l.first_submission_id))
$$;

-- The five old student answers (students_referral_source_check) on the origin list.
create or replace function crm_security.referral_origin(referral text)
returns text language sql immutable
set search_path = pg_catalog, pg_temp as $$
  select case referral
    when 'Réseaux sociaux (Facebook / Instagram)' then 'social_media'
    when 'Recherche Google' then 'google'
    when 'Famille / Ami(e)' then 'recommendation'
    when 'Passage devant le centre (walk-in)' then 'walk_by'
    when 'Ancien élève / Réinscription' then 'former_student' end
$$;

-- « Recommandé par »: a free name, a learner or a prospect (one of them), required
-- when the origin asks for it. Returns {text|student_id|lead_id} or {}.
create or replace function crm_security.referrer_fields(origin text, ref jsonb, self uuid)
returns jsonb language plpgsql stable
set search_path = pg_catalog, pg_temp as $$
declare out jsonb := '{}'::jsonb;
begin
  if ref is not null and jsonb_typeof(ref) <> 'null' then
    if jsonb_typeof(ref) <> 'object' or ref - array['name','student_id','lead_id'] <> '{}'::jsonb
       or (select count(*) from jsonb_each(ref) e where jsonb_typeof(e.value) <> 'null') > 1 then
      raise exception 'One referrer: a name, a learner or a prospect' using errcode = '22023', hint = 'catalogue.referrer_invalid'; end if;
    if nullif(btrim(ref->>'name'), '') is not null then
      if length(btrim(ref->>'name')) > 200 then raise exception 'Referrer name too long' using errcode = '22023', hint = 'catalogue.referrer_invalid'; end if;
      out := jsonb_build_object('text', btrim(ref->>'name'));
    elsif ref->>'student_id' is not null then
      if not exists (select 1 from public.students where id = (ref->>'student_id')::uuid and deleted_at is null) then
        raise exception 'Referrer not found' using errcode = '22023', hint = 'catalogue.referrer_invalid'; end if;
      out := jsonb_build_object('student_id', (ref->>'student_id')::uuid);
    elsif ref->>'lead_id' is not null then
      if (ref->>'lead_id')::uuid is not distinct from self
         or not exists (select 1 from public.crm_leads where id = (ref->>'lead_id')::uuid and merged_into_lead_id is null) then
        raise exception 'Referrer not found' using errcode = '22023', hint = 'catalogue.referrer_invalid'; end if;
      out := jsonb_build_object('lead_id', (ref->>'lead_id')::uuid);
    end if;
  end if;
  if out = '{}'::jsonb and exists (select 1 from public.acquisition_sources where code = origin and requires_referrer) then
    raise exception 'Referrer required' using errcode = '22023', hint = 'catalogue.referrer_required'; end if;
  return out;
end $$;

create or replace function crm_security.referrer_label(txt text, student uuid, lead uuid)
returns text language sql stable
set search_path = pg_catalog, pg_temp as $$
  select coalesce(txt, (select full_name from public.students where id = student),
    (select coalesce(nullif(btrim(learner_name), ''), 'Prospect') from public.crm_leads where id = lead))
$$;

-- The current price of a programme for a school year (null when none or cleared).
create or replace function crm_security.programme_price(programme text, year text)
returns public.programme_prices language sql stable
set search_path = pg_catalog, pg_temp as $$
  select pp.* from public.programme_prices pp
  where pp.programme_code = programme and pp.school_year = year
  order by pp.effective_from desc, pp.created_at desc, pp.id desc limit 1
$$;

-- ---------------------------------------------------------------------------
-- 6. Re-created bodies (live 139 definitions plus the 140 changes marked « 140 »).
-- ---------------------------------------------------------------------------
-- crm_security.command: catalogue fields on create and edit; one close-reason list.
CREATE OR REPLACE FUNCTION crm_security.command(cmd text, request uuid, data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare actor uuid:=auth.uid(); digest text; prior public.crm_command_requests%rowtype; result jsonb;
 l public.crm_leads%rowtype; t public.crm_tasks%rowtype; p public.crm_followup_policies%rowtype; na public.crm_tasks%rowtype;
 contact uuid; submission uuid; aid uuid; tid uuid; source text; allowed text[]; offsets integer[];
 phone text; email text; candidates jsonb; count_failed integer; ordinal smallint;
 due timestamptz; happened timestamptz; outcome text; meaningful boolean:=false; needs_next boolean:=false;
 reason text; target text; initial_status text; next_spec jsonb; policy_version integer;
 nested boolean:=coalesce(current_setting('eh.crm_command_key',true),'')<>''; before_label text; after_label text;
 chan text; res text; next_mode text; next_obj jsonb; note text; close_target text; close_reason text; close_note text;
 cause text; qualify_step text; primary_channel text; outcome_code text; x public.placement_tests%rowtype;
 -- 139 (RWR-r5 §5.1–5.3): people identity.
 existing public.crm_contacts%rowtype; whatsapp text; matches jsonb; edit jsonb; result_extra jsonb:='{}'::jsonb; edit_label text;
 -- 140 (RWR-r5 §5.4): catalogues.
 origin text; ref jsonb; ref_before text; first_channel text;
begin
 if cmd in ('create_manual_lead','create_prospect','resolve_submission') then
  perform crm_security.lifecycle_barrier(true);
  if cmd='resolve_submission' then

   perform crm_security.lifecycle_preidentity_keys(src.id,fm.connection_id)
   from public.crm_submissions src join public.crm_form_mappings fm on fm.id=src.form_mapping_id where src.id=(data->>'submission_id')::uuid;
  end if;
 end if;

 perform crm_security.require_reader(cmd='create_followup_policy');
 if request is null or jsonb_typeof(data) is distinct from 'object' or octet_length(data::text)>32768 then
  raise exception 'Request key and bounded object payload required' using errcode='22023'; end if;
 allowed:=case cmd
 when 'create_followup_policy' then array['weekly_hours','opening_hours','date_exceptions','timezone','attempt_offsets','minimum_attempt_gap_minutes','first_contact_sla_minutes','post_test_sla_minutes','stale_contacting_minutes','effective_from']
 when 'create_manual_lead' then array['display_name','contact_kind','phone','whatsapp','email','preferred_channel','learner_name','learner_age','learner_birth_date','session_type','program_interest_text','source_label','owner_id','first_exchange']
 when 'create_prospect' then array['display_name','contact_kind','phone','whatsapp','email','preferred_channel','learner_name','learner_age','learner_birth_date','session_type','program_interest_text','source_label','owner_id','first_exchange','contact_id','same_person','acknowledged_matches','origin_code','referrer']
 when 'update_prospect' then array['lead_id','expected_version','display_name','phone','whatsapp','email','learner_name','learner_age','learner_birth_date','session_type','program_interest_text','acknowledged_matches','origin_code','referrer']
 when 'resolve_submission' then array['lead_id','expected_version','submission_id']
 when 'add_note' then array['lead_id','expected_version','note']
 when 'record_call_outcome' then array['lead_id','expected_version','task_id','expected_task_version','outcome','occurred_at','note','next_task']
 when 'record_whatsapp' then array['lead_id','expected_version','kind','occurred_at','note','next_task']
 when 'record_conversation' then array['lead_id','expected_version','channel','occurred_at','note','next_task']
 when 'schedule_task' then array['lead_id','expected_version','task_id','expected_task_version','task','note']
 when 'complete_task' then array['lead_id','expected_version','task_id','expected_task_version','outcome','note','next_task']
 when 'cancel_task' then array['lead_id','expected_version','task_id','expected_task_version','reason','next_task']
 when 'qualify_lead' then array['lead_id','expected_version','qualification_step','note','conversation_channel','next_task']
 when 'close_lost' then array['lead_id','expected_version','reason','note']
 when 'close_not_qualified' then array['lead_id','expected_version','reason','note']
 when 'reopen_lead' then array['lead_id','expected_version','reason','next_task']
 when 'reassign' then array['lead_id','expected_version','owner_id','task_id','expected_task_version','assigned_to','note']
 when 'log_exchange' then array['lead_id','expected_version','task_id','channel','result','note','next','occurred_at','real_attempt_override','corrected_phone','acknowledged_matches']
 when 'change_next_action' then array['lead_id','expected_version','expected_action_id','next','note']
 when 'appointment_outcome' then array['lead_id','expected_version','action_id','outcome_code','next','note']
 when 'close_prospect' then array['lead_id','expected_version','status','reason','note']
 when 'reopen_prospect' then array['lead_id','expected_version','reason','next']
 else null end;
 if allowed is null or data-allowed<>'{}'::jsonb then raise exception 'Unsupported command fields' using errcode='22023'; end if;
 digest:=encode(sha256(convert_to(data::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('crm:request:'||actor||':'||cmd||':'||request,0));
 select * into prior from public.crm_command_requests where actor_scope=actor::text and command_name=cmd and request_key=request;
 if found then
  if prior.payload_hash<>digest then raise exception 'Request key payload conflict' using errcode='22023'; end if;
  return prior.result;
 end if;
 source:='command:'||actor||':'||cmd||':'||request;
 -- One history entry per user action (§4.7): rows written below share this key.
 if not nested and cmd not in ('create_followup_policy','resolve_submission') then perform set_config('eh.crm_command_key',source,true); end if;

 if cmd='create_followup_policy' then
  if coalesce(data->>'timezone','Africa/Casablanca')<>'Africa/Casablanca' then raise exception 'Timezone must be Africa/Casablanca' using errcode='22023'; end if;
  if data ? 'attempt_offsets' then select array_agg(value::integer order by ord) into offsets from jsonb_array_elements_text(data->'attempt_offsets') with ordinality a(value,ord);
  else offsets:=array[0,0,1,3,5]; end if;
  perform crm_security.validate_policy(data->'weekly_hours',offsets);
  perform crm_security.validate_hours_set(case when jsonb_typeof(data->'opening_hours')='null' then null else data->'opening_hours' end,coalesce(data->'date_exceptions','[]'::jsonb));
  if coalesce((data->>'minimum_attempt_gap_minutes')::integer,180) not between 180 and 10080
   or coalesce((data->>'first_contact_sla_minutes')::integer,15) not between 1 and 1440
   or coalesce((data->>'post_test_sla_minutes')::integer,120) not between 1 and 10080
   or coalesce((data->>'stale_contacting_minutes')::integer,2880) not between 60 and 43200 then
   raise exception 'Invalid policy timing' using errcode='22023'; end if;
  happened:=coalesce((data->>'effective_from')::timestamptz,now());
  if not isfinite(happened) or happened<now()-interval '1 minute' then raise exception 'Policy cannot be backdated' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('crm:policy:publish',0));
  select coalesce(max(version),0)+1 into policy_version from public.crm_followup_policies;
  insert into public.crm_followup_policies(version,weekly_hours,opening_hours,date_exceptions,attempt_offsets,minimum_attempt_gap_minutes,
   first_contact_sla_minutes,post_test_sla_minutes,stale_contacting_minutes,effective_from,created_by)
  values(policy_version,data->'weekly_hours',case when jsonb_typeof(data->'opening_hours')='object' then data->'opening_hours' end,coalesce(data->'date_exceptions','[]'::jsonb),offsets,coalesce((data->>'minimum_attempt_gap_minutes')::integer,180),
   coalesce((data->>'first_contact_sla_minutes')::integer,15),coalesce((data->>'post_test_sla_minutes')::integer,120),
   coalesce((data->>'stale_contacting_minutes')::integer,2880),happened,actor) returning * into p;
  result:=jsonb_build_object('policy_id',p.id,'version',p.version,'timezone',p.timezone,'weekly_hours',p.weekly_hours,'opening_hours',p.opening_hours,'date_exceptions',p.date_exceptions,'effective_from',p.effective_from);

 elsif cmd in ('create_manual_lead','create_prospect') then
  select * into p from public.crm_followup_policies where id=crm_security.current_policy_id();
  if cmd='create_prospect' then
   if (data ? 'same_person' and jsonb_typeof(data->'same_person')<>'boolean') or (data ? 'contact_id' and jsonb_typeof(data->'contact_id')<>'string')
    or (data ? 'acknowledged_matches' and jsonb_typeof(data->'acknowledged_matches')<>'array') then
    raise exception 'Invalid prospect fields' using errcode='22023'; end if;
   if data ? 'contact_id' then
    -- « Ajouter un enfant » (§5.3): a new learner for an existing contact, which
    -- is reused as it is (its own edit changes its fields).
    if data ?| array['phone','whatsapp','email','preferred_channel','contact_kind'] or coalesce((data->>'same_person')::boolean,false) then
     raise exception 'A sibling reuses the contact as it is' using errcode='22023',hint='people.sibling_contact_fields'; end if;
    select * into existing from public.crm_contacts where id=(data->>'contact_id')::uuid for update;
    if not found or existing.merged_into_contact_id is not null then raise exception 'Contact not found' using errcode='22023'; end if;
    data:=data||jsonb_build_object('display_name',coalesce(nullif(btrim(existing.display_name),''),data->>'display_name'));
   end if;
   if coalesce((data->>'same_person')::boolean,false) then
    -- « C'est la même personne »: the contact is the learner.
    if nullif(btrim(data->>'learner_name'),'') is not null and lower(btrim(data->>'learner_name'))<>lower(btrim(data->>'display_name')) then
     raise exception 'The learner is the contact' using errcode='22023',hint='people.same_person_name'; end if;
    data:=data||jsonb_build_object('learner_name',btrim(data->>'display_name'),'contact_kind','adult_learner');
   end if;
  end if;
  if nullif(btrim(data->>'learner_name'),'') is null or length(data->>'learner_name')>200
   or nullif(btrim(data->>'display_name'),'') is null or length(data->>'display_name')>200
   or nullif(btrim(data->>'source_label'),'') is null or length(data->>'source_label')>200 then
   raise exception 'Contact, learner and source label required (maximum 200 characters)' using errcode='22023'; end if;
  if (data->>'learner_birth_date')::date>public.business_date() then raise exception 'Birth date cannot be in the future' using errcode='22023'; end if;
  perform crm_security.assert_staff((data->>'owner_id')::uuid);
  -- §4.2/§4.8: a walk-in or an inbound call is created with its first exchange and
  -- that exchange's next action, in this transaction; « Premier contact » is never scheduled.
  next_obj:=data->'first_exchange';
  if next_obj is not null and (jsonb_typeof(next_obj)<>'object' or next_obj-array['channel','next','note']<>'{}'::jsonb
   or coalesce(next_obj->>'channel','') not in ('phone','whatsapp','in_person') or jsonb_typeof(next_obj->'next') is distinct from 'object'
   or next_obj->'next' ? 'close' or length(next_obj->>'note')>4000) then
   raise exception 'Valid first exchange required' using errcode='22023'; end if;
  -- A walk-in has always spoken with us: its exchange is recorded at creation and
  -- no « Premier contact » is scheduled (§4.8, audit observation 5).
  if btrim(data->>'source_label')='Manuel · Visite au centre' and (next_obj is null or next_obj->>'channel'<>'in_person') then
   raise exception 'A walk-in is created with its exchange' using errcode='22023',hint='crm_create.walk_in_exchange_required'; end if;
  -- 140 (§5.4): the programme is a catalogue code offered to prospects; the origin
  -- and the referrer come from the origin list (recommendation needs its referrer).
  if data->>'session_type' is not null and not crm_security.programme_selectable(data->>'session_type') then
   raise exception 'Unknown programme' using errcode='22023',hint='catalogue.programme_unknown'; end if;
  if cmd='create_prospect' then
   origin:=nullif(data->>'origin_code','');
   if origin is not null and not crm_security.origin_selectable(origin) then
    raise exception 'Unknown origin' using errcode='22023',hint='catalogue.origin_unknown'; end if;
   ref:=crm_security.referrer_fields(origin,data->'referrer',null);
  end if;
  phone:=crm_security.normalize_phone(data->>'phone'); email:=nullif(lower(btrim(data->>'email')),'');
  if email is not null and (length(email)>254 or email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then raise exception 'Invalid email' using errcode='22023'; end if;
  if cmd='create_prospect' then
   -- §5.1: an invalid or placeholder number is refused on this form, never stored.
   if existing.id is null then
    phone:=public.require_phone(data->>'phone'); whatsapp:=public.require_phone(data->>'whatsapp');
   else
    phone:=existing.phone_e164; whatsapp:=existing.whatsapp_e164; email:=existing.email_normalized;
   end if;
   -- §5.2: a strong match (same phone, or same name and birth date) refuses the
   -- create until the user has said, for each one, « Même famille » or
   -- « Personne différente ». A sibling shares the contact's phone by design.
   matches:=crm_security.person_matches(case when existing.id is null then array_remove(array[phone,whatsapp],null) else '{}'::text[] end,
    data->>'learner_name',(data->>'learner_birth_date')::date,null,null,null);
   perform crm_security.assert_matches_acknowledged(matches,data->'acknowledged_matches');
  end if;
  -- No automatic reuse, including a unique phone/email match: shared family
  -- identifiers are not proof of contact identity. Return bounded suggestions.
  if existing.id is not null then
   contact:=existing.id; candidates:='[]'::jsonb;
  else
   if cmd='create_manual_lead' then
    select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'display_name',c.display_name,'version',c.version)),'[]'::jsonb) into candidates
    from (select id,display_name,version from public.crm_contacts where merged_into_contact_id is null
     and ((phone is not null and phone_e164=phone) or (email is not null and email_normalized=email)) order by id limit 10) c;
    whatsapp:=crm_security.normalize_phone(data->>'whatsapp');
   else candidates:='[]'::jsonb; end if;
   insert into public.crm_contacts(display_name,contact_kind,phone_raw,phone_e164,whatsapp_raw,whatsapp_e164,email_raw,email_normalized,preferred_channel,created_by)
   values(btrim(data->>'display_name'),coalesce(data->>'contact_kind','unknown'),data->>'phone',phone,data->>'whatsapp',whatsapp,
    data->>'email',email,data->>'preferred_channel',actor) returning id into contact;
  end if;
  submission:=gen_random_uuid(); l.id:=gen_random_uuid();
  due:=crm_security.next_window(p.id,now()+make_interval(mins=>p.first_contact_sla_minutes));
  -- §4.6: a manual prospect belongs to its creator unless another owner is chosen.
  insert into public.crm_leads(id,contact_id,learner_name,learner_name_normalized,learner_age,age_recorded_at,learner_birth_date,session_type,program_interest_text,
    owner_id,first_submission_id,latest_submission_id,followup_policy_id,outreach_anchor_date,origin_code,referrer_text,referrer_student_id,referrer_lead_id)
  values(l.id,contact,btrim(data->>'learner_name'),lower(btrim(data->>'learner_name')),(data->>'learner_age')::integer,
   case when data->>'learner_age' is not null then now() end,(data->>'learner_birth_date')::date,data->>'session_type',data->>'program_interest_text',
   case when data ? 'owner_id' then (data->>'owner_id')::uuid else actor end,submission,submission,p.id,(due at time zone public.centre_utc_offset())::date,
   origin,ref->>'text',(ref->>'student_id')::uuid,(ref->>'lead_id')::uuid) returning * into l;
  insert into public.crm_submissions(id,lead_id,channel,received_at,occurred_at,time_source,core_fields,form_answers,source_label,match_status,resolved_by,resolved_at,payload_hash)
  values(submission,l.id,'manual',now(),now(),'server',data-array['first_exchange','contact_id','same_person','acknowledged_matches'],'[]',btrim(data->>'source_label'),'resolved',actor,now(),digest);
  perform crm_security.event(l.id,'lead_created',source||':lead',null,null,null,null,null,null,null,null,'NEW');
  aid:=crm_security.event(l.id,'submission_received',source||':submission',submission=>submission);
  if cmd='create_prospect' then perform crm_security.record_match_decisions('prospect',l.id,matches,data->'acknowledged_matches'); end if;
  -- Activity ownership FK is satisfied; acquisition snapshots are never edited.
  if next_obj is null then
   tid:=crm_security.set_next_action(l,jsonb_build_object('task_type','first_contact','due_at',due,'_key','attempt:'||l.id||':1:1','_kind','intake',
    '_ordinal',1,'_event_source',source||':initial-task'),'intake',source);
  else
   -- The exchange runs nested under this command's key (one history entry); its
   -- private key is fresh per execution, and the outer request owns the replay.
   perform crm_security.command('log_exchange',gen_random_uuid(),jsonb_build_object('lead_id',l.id,'expected_version',(select version from public.crm_leads where id=l.id),
    'channel',next_obj->>'channel','result','spoke','next',next_obj->'next')||case when nullif(btrim(next_obj->>'note'),'') is not null then jsonb_build_object('note',next_obj->>'note') else '{}'::jsonb end);
   tid:=crm_security.next_action_id(l.id);
  end if;
  if not nested then
   perform crm_security.primary_event(l.id,cmd,nullif(btrim(next_obj->>'note'),''),nullif(next_obj->>'channel','other'),case when next_obj is not null then 'spoke' end,null,
    crm_security.action_label((select t0 from public.crm_tasks t0 where t0.id=tid)),null,
    jsonb_build_object('result_label',case when next_obj is null then 'Prospect créé' else 'Prospect créé · On a parlé' end
     ||case when existing.id is not null then ' · Même contact' else '' end));
  end if;
  result:=crm_security.result(l.id,source)||jsonb_build_object('submission_id',submission,'contact_candidates',candidates,
   'contact_id',contact,'contact_version',(select version from public.crm_contacts where id=contact));

 else
  select * into l from public.crm_leads where id=(data->>'lead_id')::uuid for update;
  if not found then raise exception 'Lead not found' using errcode='22023'; end if;
  if (data->>'expected_version')::bigint is distinct from l.version then raise exception 'Stale lead version; refresh and retry' using errcode='PT409'; end if;
  if l.merged_into_lead_id is not null or l.status='CONVERTED' then raise exception 'Lead is not operationally editable' using errcode='22023'; end if;
  if cmd not in ('add_note','reopen_lead','reassign','reopen_prospect','update_prospect') and l.status in ('LOST','NOT_QUALIFIED') then raise exception 'Reopen lead before this operation' using errcode='22023'; end if;
  initial_status:=l.status;
  select * into na from public.crm_tasks where id=crm_security.next_action_id(l.id);
  before_label:=crm_security.action_label(na);
  if data->>'task_id' is not null then
   select * into t from public.crm_tasks where id=(data->>'task_id')::uuid and lead_id=l.id for update;
   if not found or t.status<>'open' then raise exception 'Open task not found on this lead' using errcode='PT409'; end if;
   if data ? 'expected_task_version' and (data->>'expected_task_version')::bigint is distinct from t.version then raise exception 'Stale task version; refresh and retry' using errcode='PT409'; end if;
   if cmd<>'log_exchange' and not (data ? 'expected_task_version') then raise exception 'Stale task version; refresh and retry' using errcode='PT409'; end if;
  end if;
  if cmd in ('complete_task','cancel_task') and t.id is null then raise exception 'Task required' using errcode='22023'; end if;
  happened:=coalesce((data->>'occurred_at')::timestamptz,now());
  if not isfinite(happened) or happened>now() or happened<l.created_at then raise exception 'Occurrence time must be between lead creation and now' using errcode='22023'; end if;
  if happened<(select max(occurred_at) from public.crm_activities where lead_id=l.id and event_type='lead_reopened') then
   raise exception 'Activity predates the latest reopening' using errcode='22023'; end if;
  note:=case when nullif(btrim(coalesce(data->>'note',data->>'outcome',data->>'reason')),'') is not null then coalesce(data->>'note',data->>'outcome',data->>'reason') end;

  -- Old exchange wrappers are translated into one exchange (§4.3).
  if cmd='record_call_outcome' then
   chan:='phone'; outcome:=data->>'outcome';
   if outcome is null or outcome<>all(array['no_answer','busy','declined','unreachable','spoke_with_contact','wrong_number']) then raise exception 'Invalid phone outcome' using errcode='22023'; end if;
   if t.id is not null and t.task_type not in ('first_contact','contact_attempt','callback') then raise exception 'Phone outcome requires a call task' using errcode='22023'; end if;
   res:=case when outcome='spoke_with_contact' then 'spoke' else outcome end;
   next_mode:=case when data ? 'next_task' and data->'next_task'<>'null'::jsonb then 'spec' else 'legacy' end;
   if next_mode='spec' then next_obj:=crm_security.legacy_spec(data->'next_task'); end if;
   note:=data->>'note';
  elsif cmd='record_whatsapp' then
   if (data->>'kind') is null or data->>'kind' not in ('whatsapp_sent','meaningful_whatsapp_conversation') then raise exception 'Invalid WhatsApp activity' using errcode='22023'; end if;
   chan:='whatsapp'; res:=case when data->>'kind'='meaningful_whatsapp_conversation' then 'spoke' else 'whatsapp_sent' end;
   if res='whatsapp_sent' and data ? 'next_task' then raise exception 'WhatsApp sent is activity-only' using errcode='22023'; end if;
   next_mode:=case when data ? 'next_task' and data->'next_task'<>'null'::jsonb then 'spec' else 'legacy' end;
   if next_mode='spec' then next_obj:=crm_security.legacy_spec(data->'next_task'); end if;
   note:=data->>'note';
  elsif cmd='record_conversation' then
   if coalesce(data->>'channel','') not in ('phone','whatsapp','in_person') then raise exception 'Conversation channel and evidence required' using errcode='22023'; end if;
   chan:=data->>'channel'; res:='spoke';
   next_mode:=case when data ? 'next_task' and data->'next_task'<>'null'::jsonb then 'spec' else 'legacy' end;
   if next_mode='spec' then next_obj:=crm_security.legacy_spec(data->'next_task'); end if;
   note:=data->>'note';
  elsif cmd='log_exchange' then
   chan:=data->>'channel'; res:=data->>'result'; note:=case when nullif(btrim(data->>'note'),'') is not null then data->>'note' end;
   if chan is null or chan not in ('phone','whatsapp','in_person','other')
    or res is null or res not in ('no_answer','busy','declined','unreachable','wrong_number','spoke','whatsapp_sent','note')
    or (res in ('no_answer','busy','declined','unreachable','wrong_number') and chan<>'phone')
    or (res='whatsapp_sent' and chan<>'whatsapp') or length(data->>'note')>4000 then
    raise exception 'Valid channel and result required' using errcode='22023'; end if;
   if res='note' and note is null then raise exception 'Note required' using errcode='22023'; end if;
   if data ? 'real_attempt_override' and jsonb_typeof(data->'real_attempt_override')<>'boolean' then raise exception 'Invalid attempt override' using errcode='22023'; end if;
   -- next = "keep" | next-action spec | {"close":{status,reason,note}} | {"enrol":{due_at|due_preset}}
   if data->'next' is null or data->'next'='"keep"'::jsonb then next_mode:='keep';
   elsif jsonb_typeof(data->'next')='object' and data->'next' ? 'close' then next_mode:='close'; next_obj:=data->'next'->'close';
   elsif jsonb_typeof(data->'next')='object' and data->'next' ? 'enrol' then next_mode:='enrol';
    next_obj:=jsonb_build_object('task_type','enrollment_followup','instructions','Finaliser l’inscription avec le contact.')
     ||case when jsonb_typeof(data->'next'->'enrol')='object' and data->'next'->'enrol' ? 'due_at' then jsonb_build_object('due_at',data->'next'->'enrol'->'due_at')
        else jsonb_build_object('due_preset',coalesce(data->'next'->'enrol'->>'due_preset','tomorrow')) end;
   elsif jsonb_typeof(data->'next')='object' then next_mode:='spec'; next_obj:=crm_security.user_spec(data->'next');
   else raise exception 'Valid next action required' using errcode='22023'; end if;
   if res='spoke' and next_mode='keep' and na.id is null then raise exception 'Active lead requires a next actionable task' using errcode='22023'; end if;
   if res in ('note','whatsapp_sent') and next_mode in ('close','enrol') then raise exception 'Valid next action required' using errcode='22023'; end if;
   if res in ('no_answer','busy','declined','unreachable') and next_mode in ('close','enrol') then raise exception 'Valid next action required' using errcode='22023'; end if;
  end if;
  if next_mode='close' then
   close_target:=next_obj->>'status'; close_reason:=next_obj->>'reason'; close_note:=next_obj->>'note';
   if (close_target is not null and close_target not in ('LOST','NOT_QUALIFIED')) or jsonb_typeof(next_obj) is distinct from 'object' or next_obj-array['status','reason','note']<>'{}'::jsonb then
    raise exception 'Valid closure reason and explanation required' using errcode='22023'; end if;
  end if;

  if cmd='resolve_submission' then
   -- Private only: future trusted intake can attach an unresolved acquisition
   -- without rewriting accepted snapshots or the lead's original first touch.
   perform 1 from public.crm_submissions where id=(data->>'submission_id')::uuid and match_status='needs_review' and lead_id is null for update;
   if not found then raise exception 'Unresolved submission required' using errcode='22023'; end if;
   update public.crm_submissions set lead_id=l.id,match_status='resolved',resolved_by=actor,resolved_at=now()
    where id=(data->>'submission_id')::uuid;
   update public.crm_leads set latest_submission_id=(data->>'submission_id')::uuid where id=l.id
    and (select row(occurred_at,id) from public.crm_submissions where id=(data->>'submission_id')::uuid)>
        (select row(occurred_at,id) from public.crm_submissions where id=l.latest_submission_id);
   perform crm_security.lifecycle_pending_handoff((data->>'submission_id')::uuid);
   perform crm_security.event(l.id,'submission_received',source||':submission',submission=>(data->>'submission_id')::uuid);
  elsif cmd='update_prospect' then
   -- §5.3 « Modifier la fiche »: contact and learner fields, version-checked,
   -- one primary history entry « Fiche modifiée » (phones masked).
   select * into existing from public.crm_contacts where id=l.contact_id for update;
   edit:='[]'::jsonb;
   if data ? 'display_name' then
    if nullif(btrim(data->>'display_name'),'') is null or length(data->>'display_name')>200 then raise exception 'Contact name required (maximum 200 characters)' using errcode='22023'; end if;
    if btrim(data->>'display_name') is distinct from existing.display_name then
     edit:=edit||jsonb_build_object('field','display_name','label','Contact','before',existing.display_name,'after',btrim(data->>'display_name'));
     existing.display_name:=btrim(data->>'display_name'); end if;
   end if;
   if data ? 'phone' then
    phone:=public.require_phone(data->>'phone');
    if phone is distinct from existing.phone_e164 then
     edit:=edit||jsonb_build_object('field','phone','label','Téléphone','before',public.phone_mask(existing.phone_e164),'after',public.phone_mask(phone));
     existing.phone_e164:=phone; existing.phone_raw:=nullif(btrim(data->>'phone'),''); end if;
   end if;
   if data ? 'whatsapp' then
    whatsapp:=public.require_phone(data->>'whatsapp');
    if whatsapp is distinct from existing.whatsapp_e164 then
     edit:=edit||jsonb_build_object('field','whatsapp','label','WhatsApp','before',public.phone_mask(existing.whatsapp_e164),'after',public.phone_mask(whatsapp));
     existing.whatsapp_e164:=whatsapp; existing.whatsapp_raw:=nullif(btrim(data->>'whatsapp'),''); end if;
   end if;
   if data ? 'email' then
    email:=nullif(lower(btrim(data->>'email')),'');
    if email is not null and (length(email)>254 or email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then raise exception 'Invalid email' using errcode='22023'; end if;
    if email is distinct from existing.email_normalized then
     edit:=edit||jsonb_build_object('field','email','label','E-mail','before',existing.email_normalized,'after',email);
     existing.email_normalized:=email; existing.email_raw:=nullif(btrim(data->>'email'),''); end if;
   end if;
   if data ? 'learner_name' then
    if nullif(btrim(data->>'learner_name'),'') is null or length(data->>'learner_name')>200 then raise exception 'Learner name required (maximum 200 characters)' using errcode='22023'; end if;
    if btrim(data->>'learner_name') is distinct from l.learner_name then
     edit:=edit||jsonb_build_object('field','learner_name','label','Apprenant','before',l.learner_name,'after',btrim(data->>'learner_name'));
     l.learner_name:=btrim(data->>'learner_name'); end if;
   end if;
   if data ? 'learner_birth_date' then
    if (data->>'learner_birth_date')::date>public.business_date() then raise exception 'Birth date cannot be in the future' using errcode='22023'; end if;
    if (data->>'learner_birth_date')::date is distinct from l.learner_birth_date then
     edit:=edit||jsonb_build_object('field','learner_birth_date','label','Date de naissance','before',l.learner_birth_date,'after',(data->>'learner_birth_date')::date);
     l.learner_birth_date:=(data->>'learner_birth_date')::date; end if;
   end if;
   if data ? 'learner_age' then
    if (data->>'learner_age')::integer is distinct from l.learner_age then
     edit:=edit||jsonb_build_object('field','learner_age','label','Âge','before',l.learner_age,'after',(data->>'learner_age')::integer);
     l.learner_age:=(data->>'learner_age')::integer; l.age_recorded_at:=case when l.learner_age is not null then now() end; end if;
   end if;
   if data ? 'session_type' and (data->>'session_type') is distinct from l.session_type then
    -- 140 (§5.4): a new programme is a catalogue code offered to prospects.
    if data->>'session_type' is not null and not crm_security.programme_selectable(data->>'session_type') then
     raise exception 'Unknown programme' using errcode='22023',hint='catalogue.programme_unknown'; end if;
    edit:=edit||jsonb_build_object('field','session_type','label','Programme','before',l.session_type,'after',data->>'session_type');
    l.session_type:=data->>'session_type';
   end if;
   if data ? 'program_interest_text' and nullif(btrim(data->>'program_interest_text'),'') is distinct from l.program_interest_text then
    if length(data->>'program_interest_text')>500 then raise exception 'Programme text too long' using errcode='22023'; end if;
    edit:=edit||jsonb_build_object('field','program_interest_text','label','Intérêt','before',l.program_interest_text,'after',nullif(btrim(data->>'program_interest_text'),''));
    l.program_interest_text:=nullif(btrim(data->>'program_interest_text'),'');
   end if;
   -- 140 (§5.3, OD-10 A): the origin is edited on manual prospects only (a Meta or
   -- website prospect's origin is its first touch); the referrer on every prospect.
   origin:=l.origin_code;
   if data ? 'origin_code' and nullif(data->>'origin_code','') is distinct from l.origin_code then
    select s.channel into first_channel from public.crm_submissions s where s.id=l.first_submission_id;
    if first_channel is distinct from 'manual' then
     raise exception 'The origin of this prospect is its first touch' using errcode='22023',hint='catalogue.origin_first_touch'; end if;
    origin:=nullif(data->>'origin_code','');
    if origin is not null and not crm_security.origin_selectable(origin) then
     raise exception 'Unknown origin' using errcode='22023',hint='catalogue.origin_unknown'; end if;
    edit:=edit||jsonb_build_object('field','origin_code','label','Origine','before',l.origin_code,'after',origin);
   end if;
   ref:=jsonb_strip_nulls(jsonb_build_object('text',l.referrer_text,'student_id',l.referrer_student_id,'lead_id',l.referrer_lead_id));
   if data ? 'origin_code' or data ? 'referrer' then
    ref_before:=crm_security.referrer_label(l.referrer_text,l.referrer_student_id,l.referrer_lead_id);
    ref:=crm_security.referrer_fields(origin,case when data ? 'referrer' then data->'referrer'
     else jsonb_strip_nulls(jsonb_build_object('name',l.referrer_text,'student_id',l.referrer_student_id,'lead_id',l.referrer_lead_id)) end,l.id);
    if (ref->>'text') is distinct from l.referrer_text or (ref->>'student_id')::uuid is distinct from l.referrer_student_id
     or (ref->>'lead_id')::uuid is distinct from l.referrer_lead_id then
     edit:=edit||jsonb_build_object('field','referrer','label','Recommandé par','before',ref_before,
      'after',crm_security.referrer_label(ref->>'text',(ref->>'student_id')::uuid,(ref->>'lead_id')::uuid));
    end if;
   end if;
   if jsonb_array_length(edit)=0 then raise exception 'Nothing to change' using errcode='22023',hint='people.no_change'; end if;
   if edit @> '[{"label":"Téléphone"}]' or edit @> '[{"label":"WhatsApp"}]' or edit @> '[{"label":"Contact"}]' or edit @> '[{"label":"E-mail"}]' then
    update public.crm_contacts set display_name=existing.display_name,phone_raw=existing.phone_raw,phone_e164=existing.phone_e164,
     whatsapp_raw=existing.whatsapp_raw,whatsapp_e164=existing.whatsapp_e164,email_raw=existing.email_raw,email_normalized=existing.email_normalized,
     version=version+1,updated_at=now() where id=existing.id;
   end if;
   update public.crm_leads set learner_name=l.learner_name,learner_name_normalized=lower(btrim(l.learner_name)),learner_birth_date=l.learner_birth_date,
    learner_age=l.learner_age,age_recorded_at=l.age_recorded_at,session_type=l.session_type,program_interest_text=l.program_interest_text,
    origin_code=origin,referrer_text=ref->>'text',referrer_student_id=(ref->>'student_id')::uuid,referrer_lead_id=(ref->>'lead_id')::uuid where id=l.id;
   -- Decisions sent with the edit are recorded; the matches still open are returned (never blocking an edit).
   matches:=crm_security.person_matches(array_remove(array[existing.phone_e164,existing.whatsapp_e164],null),l.learner_name,l.learner_birth_date,l.id,l.student_id,l.contact_id);
   perform crm_security.record_match_decisions('prospect',l.id,matches,data->'acknowledged_matches');
   result_extra:=jsonb_build_object('duplicate_candidates',crm_security.undecided_matches('prospect',l.id,matches));
   edit_label:='Fiche modifiée : '||(select string_agg(lower(e->>'label'),', ' order by ord) from jsonb_array_elements(edit) with ordinality x(e,ord));
   note:=null;

  elsif cmd='add_note' then
   if nullif(btrim(data->>'note'),'') is null then raise exception 'Note required' using errcode='22023'; end if;
   perform crm_security.event(l.id,'note_added',source||':note',data->>'note');
   note:=data->>'note'; res:='note';

  elsif cmd in ('record_call_outcome','record_whatsapp','record_conversation','log_exchange') then
   primary_channel:=nullif(chan,'other');
   if res in ('no_answer','busy','declined','unreachable') then
    if l.last_attempt_at is not null and happened<l.last_attempt_at then raise exception 'Call time predates last recorded attempt' using errcode='22023'; end if;
    if l.status in ('NEW','CONTACTING','ENGAGED','QUALIFIED') then
     select * into strict p from public.crm_followup_policies where id=l.followup_policy_id;
     -- OD-14: a real attempt inside the gap is recorded only when the user says so.
     if l.last_attempt_at is not null and happened<l.last_attempt_at+make_interval(mins=>p.minimum_attempt_gap_minutes)
      and not coalesce((data->>'real_attempt_override')::boolean,false) then
      raise exception 'Failed calls must respect the policy minimum spacing' using errcode='22023',hint='crm_exchange.attempt_gap'; end if;
     if l.last_conversation_at is not null and happened<l.last_conversation_at then
      raise exception 'Failed call predates the latest meaningful conversation' using errcode='22023'; end if;
     count_failed:=crm_security.failed_count(l); ordinal:=(count_failed+1)::smallint;
     -- Each uninterrupted sequence anchors to its first actual failed call,
     -- independently of lifecycle and any earlier intake/conversation dates.
     if count_failed=0 then l.outreach_anchor_date:=(happened at time zone public.centre_utc_offset())::date; end if;
     -- The first five need not have a task supplied, but consume the current
     -- sequence slot exactly once. An explicit call after five is still possible.
     if t.id is null then
      select * into t from public.crm_tasks where lead_id=l.id and status='open' and outreach_cycle=l.outreach_cycle and attempt_ordinal=ordinal order by id limit 1 for update;
     elsif t.attempt_ordinal is not null and (t.outreach_cycle<>l.outreach_cycle or t.attempt_ordinal<>ordinal) then
      raise exception 'Task is not the current attempt' using errcode='PT409';
     end if;
     perform crm_security.event(l.id,'contact_attempted',source||':attempt',note,'phone',res,t.id,happened,l.outreach_cycle,ordinal);
     perform crm_security.event(l.id,'call_'||res,source||':outcome',null,'phone',res,t.id,happened);
     if l.status='NEW' then l.status:='CONTACTING'; end if;
     l.last_attempt_at:=happened;
     if next_mode='spec' then
      -- An explicit choice after a failed call is the user's, as in « Changer ».
      tid:=crm_security.set_next_action(l,next_obj||case when t.id is not null then jsonb_build_object('_against',t.id) else '{}'::jsonb end,'user',source);
     elsif ordinal<5 then
      due:=crm_security.attempt_due(l.followup_policy_id,l.outreach_anchor_date,ordinal+1,happened,now());
      tid:=crm_security.set_next_action(l,jsonb_build_object('task_type','contact_attempt','due_at',due,'_key','attempt:'||l.id||':'||l.outreach_cycle||':'||(ordinal+1),
       '_kind','attempt_sequence','_ordinal',ordinal+1,'_event_source',source||':next-attempt')
       ||case when t.id is not null then jsonb_build_object('_against',t.id) else '{}'::jsonb end,'system',source);
     else
      -- OD-17: after the fifth failure the prospect waits, with no relance date.
      tid:=crm_security.set_next_action(l,jsonb_build_object('task_type','awaiting_prospect','_key',source||':awaiting')
       ||case when t.id is not null then jsonb_build_object('_against',t.id) else '{}'::jsonb end,'system',source);
     end if;
    else
     perform crm_security.event(l.id,'contact_attempted',source||':attempt',note,'phone',res,t.id,happened);
    end if;
   elsif res='wrong_number' then
    -- Wrong number never counts as an unreachable attempt.
    perform crm_security.event(l.id,'call_wrong_number',source||':outcome',note,'phone','wrong_number',t.id,happened);
    if data ? 'corrected_phone' then
     -- §5.3 / day script 8: « Mauvais numéro » with the right number. The
     -- contact's phone is corrected and calling starts again on that number.
     if next_mode<>'keep' then raise exception 'A corrected number keeps the next action' using errcode='22023',hint='people.corrected_phone_keep'; end if;
     phone:=public.require_phone(data->>'corrected_phone');
     if phone is null then raise exception 'Corrected number required' using errcode='22023',hint='people.phone_invalid'; end if;
     select * into existing from public.crm_contacts where id=l.contact_id for update;
     if phone is not distinct from existing.phone_e164 then raise exception 'This is the number on file' using errcode='22023',hint='people.phone_unchanged'; end if;
     -- The new number meets the same duplicate gate as a create (§5.2, review of #217):
     -- each other person already on it is answered first (pairs answered before are not
     -- asked again). Siblings on this contact are skipped by design.
     matches:=crm_security.undecided_matches('prospect',l.id,crm_security.person_matches(array[phone],null,null,l.id,l.student_id,l.contact_id));
     perform crm_security.assert_matches_acknowledged(matches,data->'acknowledged_matches');
     perform crm_security.record_match_decisions('prospect',l.id,matches,data->'acknowledged_matches');
     edit:=jsonb_build_array(jsonb_build_object('field','phone','label','Téléphone','before',public.phone_mask(existing.phone_e164),'after',public.phone_mask(phone)));
     update public.crm_contacts set phone_raw=btrim(data->>'corrected_phone'),phone_e164=phone,version=version+1,updated_at=now() where id=existing.id;
     edit_label:='Mauvais numéro · numéro corrigé';
     if na.task_type in ('first_contact','contact_attempt','callback','awaiting_prospect') then
      -- A new outreach sequence on the new number: its first call is due at the next open slot.
      l.outreach_cycle:=l.outreach_cycle+1; l.outreach_anchor_date:=null; l.last_attempt_at:=null;
      tid:=crm_security.set_next_action(l,jsonb_build_object('task_type','contact_attempt','due_at',crm_security.next_window(l.followup_policy_id,now()),
       '_key','attempt:'||l.id||':'||l.outreach_cycle||':1','_kind','attempt_sequence','_ordinal',1,'_event_source',source||':corrected-phone'),'system',source);
     end if;
    elsif next_mode='spec' then tid:=crm_security.set_next_action(l,next_obj||case when t.id is not null and cmd<>'log_exchange' then jsonb_build_object('_against',t.id) else '{}'::jsonb end,'user',source);
    elsif next_mode='legacy' and t.id is not null then tid:=crm_security.set_next_action(l,jsonb_build_object('_against',t.id,'_finish',jsonb_build_object('cancelled',false)),'outcome',source||':complete'); end if;
    needs_next:=true;
   elsif res='spoke' then
    if next_mode='close' then
     -- Closing after a conversation records the evidence but, as the
     -- conversation decision always did, no engagement step.
     perform crm_security.event(l.id,'conversation_recorded',source||':conversation',note,chan,case when chan='phone' then 'spoke_with_contact' end,t.id,happened);
     l.last_conversation_at:=happened; l.outreach_cycle:=l.outreach_cycle+1; l.outreach_anchor_date:=null; l.last_attempt_at:=null;
    else
     perform crm_security.event(l.id,case when chan='whatsapp' then 'whatsapp_conversation' else 'conversation_recorded' end,
      source||case when chan='whatsapp' then ':whatsapp' else ':conversation' end,note,nullif(chan,'other'),
      case when chan='phone' and cmd in ('record_call_outcome','log_exchange') then 'spoke_with_contact' end,
      case when chan='phone' then t.id end,happened);
     meaningful:=true;
     -- Old call wrapper: the call task spoken on is completed, as before.
     if next_mode='legacy' and t.id is not null then
      perform crm_security.set_next_action(l,jsonb_build_object('_against',t.id,'_finish',jsonb_build_object('cancelled',false,'reason',note)),'outcome',source||':complete');
     end if;
    end if;
   elsif res='whatsapp_sent' then
    perform crm_security.event(l.id,'whatsapp_sent',source||':whatsapp',note,'whatsapp',null,null,happened);
    if next_mode='spec' then tid:=crm_security.set_next_action(l,next_obj,'user',source); needs_next:=true; end if;
   else
    perform crm_security.event(l.id,'note_added',source||':note',note);
    if next_mode='spec' then tid:=crm_security.set_next_action(l,next_obj,'user',source); needs_next:=true; end if;
   end if;
   if cmd='log_exchange' and res='spoke' and next_mode in ('spec','enrol') then
    -- Qualification is implied (OD-11).
    qualify_step:=case when next_mode='enrol' then 'enrollment'
     when next_obj->>'task_type'='center_visit' and coalesce((next_obj->>'with_test')::boolean,false) then 'placement_test'
     when next_obj->>'task_type'='center_visit' then 'center_visit' end;
   end if;

  elsif cmd='schedule_task' then
   if t.id is null then tid:=crm_security.set_next_action(l,crm_security.legacy_spec(data->'task'),'user',source);
   else
    next_spec:=data->'task';
    if jsonb_typeof(next_spec) is distinct from 'object' or next_spec-array['due_at','instructions']<>'{}'::jsonb then raise exception 'Reschedule accepts due_at and instructions only' using errcode='22023'; end if;
    tid:=crm_security.set_next_action(l,jsonb_build_object('_reschedule',next_spec||jsonb_build_object('task_id',t.id)),'user',source);
    perform crm_security.event(l.id,'task_rescheduled',source||':rescheduled',data->>'note',null,null,t.id);
   end if;

  elsif cmd in ('complete_task','cancel_task') then
   if cmd='complete_task' then
    if t.task_type in ('first_contact','contact_attempt','callback') then raise exception 'Complete call tasks through record_call_outcome' using errcode='22023'; end if;
    if nullif(btrim(data->>'outcome'),'') is null or length(data->>'outcome')>200 then raise exception 'Completion outcome required' using errcode='22023'; end if;
   elsif nullif(btrim(data->>'reason'),'') is null then raise exception 'Cancellation reason required' using errcode='22023';
   end if;
   if data ? 'next_task' and data->'next_task'<>'null'::jsonb then
    tid:=crm_security.set_next_action(l,crm_security.legacy_spec(data->'next_task')||jsonb_build_object('_against',t.id,'_note',case when cmd='complete_task' then data->>'outcome' end,
     '_replaced_reason',case when cmd='cancel_task' then data->>'reason' end,'replace_action_id',t.id),case when cmd='complete_task' then 'outcome' else 'user' end,source);
   else
    tid:=crm_security.set_next_action(l,jsonb_build_object('_against',t.id,'_finish',jsonb_build_object('cancelled',cmd='cancel_task',
     'reason',case when cmd='complete_task' then data->>'outcome' else data->>'reason' end)),'user',source||case when cmd='complete_task' then ':complete' else ':cancel' end);
   end if;
   needs_next:=true;

  elsif cmd='qualify_lead' then
   if l.status not in ('NEW','CONTACTING','ENGAGED') then raise exception 'Lead must be unqualified and active' using errcode='22023'; end if;
   if data->>'conversation_channel' is not null then
    if data->>'conversation_channel' not in ('phone','whatsapp','in_person') then raise exception 'Conversation evidence required' using errcode='22023'; end if;
    perform crm_security.event(l.id,'conversation_recorded',source||':conversation',data->>'note',data->>'conversation_channel');
    meaningful:=true;
   elsif l.last_conversation_at is null or not exists(select 1 from public.crm_activities where lead_id=l.id and event_type in ('conversation_recorded','whatsapp_conversation')) then
    raise exception 'Qualification requires meaningful conversation evidence' using errcode='22023';
   end if;
   target:=data->>'qualification_step';
   if target is null or target not in ('placement_test','center_visit','enrollment','other') or (target='other' and nullif(btrim(data->>'note'),'') is null) then raise exception 'Valid qualification step and explanation required' using errcode='22023'; end if;
   if data->'next_task' is null or data->'next_task'='null'::jsonb then raise exception 'Qualification next task required' using errcode='22023'; end if;
   if (target='placement_test' and data->'next_task'->>'task_type' is distinct from 'confirm_placement_test')
    or (target='center_visit' and data->'next_task'->>'task_type' is distinct from 'center_visit')
    or (target='enrollment' and data->'next_task'->>'task_type' is distinct from 'enrollment_followup') then raise exception 'Task must match qualification step' using errcode='22023'; end if;
   l.qualification_step:=target;
   next_mode:='spec'; next_obj:=crm_security.legacy_spec(data->'next_task')||case when target='center_visit' then jsonb_build_object('keep_existing',true) else '{}'::jsonb end;

  elsif cmd in ('close_lost','close_not_qualified','close_prospect') then
   close_target:=case cmd when 'close_lost' then 'LOST' when 'close_not_qualified' then 'NOT_QUALIFIED' else data->>'status' end;
   close_reason:=data->>'reason'; close_note:=data->>'note'; next_mode:='close'; note:=null;

  elsif cmd='change_next_action' then
   -- The action the user saw must still be the current one (NF-1).
   if (data->>'expected_action_id') is distinct from na.id::text then raise exception 'Next action changed; refresh and retry' using errcode='PT409'; end if;
   note:=case when nullif(btrim(data->>'note'),'') is not null then data->>'note' end;
   if jsonb_typeof(data->'next')='object' and data->'next' ? 'close' then next_mode:='close'; next_obj:=data->'next'->'close';
    close_target:=next_obj->>'status'; close_reason:=next_obj->>'reason'; close_note:=next_obj->>'note';
    if jsonb_typeof(next_obj) is distinct from 'object' or next_obj-array['status','reason','note']<>'{}'::jsonb then raise exception 'Valid closure reason and explanation required' using errcode='22023'; end if;
   else
    -- OD-11: booking an appointment qualifies, and qualification needs the
    -- conversation, so a new appointment for a prospect not yet qualified is
    -- booked through « Noter un échange » (« On a parlé »), never here. Moving
    -- an existing appointment stays possible.
    if data->'next'->>'task_type'='center_visit' and l.status<>'QUALIFIED' and na.task_type is distinct from 'center_visit' then
     raise exception 'Book an appointment through the exchange that qualifies the prospect' using errcode='22023',hint='crm_next_action.appointment_needs_exchange'; end if;
    tid:=crm_security.set_next_action(l,crm_security.user_spec(data->'next'),'user',source); needs_next:=true;
   end if;

  elsif cmd='appointment_outcome' then
   outcome_code:=data->>'outcome_code';
   if outcome_code is null or outcome_code not in ('came_enrolled','came_will_return','came_not_interested','no_show') then raise exception 'Valid appointment outcome required' using errcode='22023'; end if;
   if na.id is null or (data->>'action_id') is distinct from na.id::text or na.task_type<>'center_visit' then raise exception 'Next action changed; refresh and retry' using errcode='PT409'; end if;
   if na.due_at>now() then raise exception 'Outcome can be recorded only from the appointment time' using errcode='22023',hint='crm_appointment.before_start'; end if;
   note:=case when nullif(btrim(data->>'note'),'') is not null then data->>'note' end; res:=outcome_code;
   -- « Venu · pas intéressé » closes the prospect: the reason is asked, never
   -- assumed (§4.8, « reason required »).
   if outcome_code='came_not_interested' and jsonb_typeof(data->'next'->'close') is distinct from 'object' then
    raise exception 'Closure reason required' using errcode='22023',hint='crm_appointment.reason_required'; end if;
   -- An appointment that already exists on a prospect not yet qualified (reopened
   -- with an appointment, an old tab, D1 rule b): the visit is the in-person
   -- conversation, and coming to enrol or to come back qualifies (OD-11), so
   -- every outcome row of §4.8 starts from QUALIFIED.
   if outcome_code in ('came_enrolled','came_will_return') and l.status in ('NEW','CONTACTING','ENGAGED') then
    happened:=now();
    perform crm_security.event(l.id,'conversation_recorded',source||':conversation',null,'in_person',null,na.id,happened);
    meaningful:=true;
    qualify_step:=case when outcome_code='came_enrolled' then 'enrollment' else 'center_visit' end;
   end if;
   -- The linked test: attended, or « Absent » for a no-show.
   if na.placement_test_id is not null then
    update public.placement_tests set status=case when outcome_code='no_show' then 'Absent' else 'Passé' end where id=na.placement_test_id and status='Planifié';
   end if;
   if outcome_code='came_not_interested' or (jsonb_typeof(data->'next')='object' and data->'next' ? 'close') then
    next_obj:=data->'next'->'close';
    if jsonb_typeof(next_obj) is distinct from 'object' or next_obj-array['status','reason','note']<>'{}'::jsonb then raise exception 'Valid closure reason and explanation required' using errcode='22023'; end if;
    close_target:=next_obj->>'status'; close_reason:=next_obj->>'reason'; close_note:=next_obj->>'note'; next_mode:='close';
    perform crm_security.set_next_action(l,jsonb_build_object('_against',na.id,'_finish',jsonb_build_object('cancelled',false,'reason',note),'_outcome_code',outcome_code),'outcome',source||':complete');
   else
    next_obj:=case when jsonb_typeof(data->'next')='object' then crm_security.user_spec(data->'next')
     when outcome_code='came_enrolled' then jsonb_build_object('task_type','enrollment_followup','due_preset','tomorrow','instructions','Finaliser l’inscription avec le contact.')
     when outcome_code='came_will_return' then jsonb_build_object('task_type','awaiting_prospect')
     else jsonb_build_object('task_type','callback','schedule_kind','reminder','due_preset','tomorrow') end;
    if outcome_code='came_enrolled' then qualify_step:='enrollment'; end if;
    tid:=crm_security.set_next_action(l,next_obj||jsonb_build_object('_outcome_of',na.id,'_outcome_code',outcome_code,'_note',note),'outcome',source);
    needs_next:=true;
   end if;

  elsif cmd in ('reopen_lead','reopen_prospect') then
   if l.status not in ('LOST','NOT_QUALIFIED') or nullif(btrim(data->>'reason'),'') is null then raise exception 'Closed lead and reopen reason required' using errcode='22023'; end if;
   l.status:=case when exists(select 1 from public.crm_activities where lead_id=l.id and event_type in ('conversation_recorded','whatsapp_conversation')) then 'ENGAGED' else 'CONTACTING' end;
   l.outreach_cycle:=l.outreach_cycle+1;l.outreach_anchor_date:=null;l.last_attempt_at:=null;
   l.closure_reason:=null;l.closure_note:=null;l.closed_at:=null;l.qualification_step:=null;
   if cmd='reopen_lead' and (data->'next_task' is null or data->'next_task'='null'::jsonb) then raise exception 'Explicit reopen task required' using errcode='22023'; end if;
   if cmd='reopen_prospect' and (data->'next' is null or jsonb_typeof(data->'next')<>'object') then raise exception 'Explicit reopen task required' using errcode='22023'; end if;
   perform crm_security.event(l.id,'lead_reopened',source||':reopened',data->>'reason',null,null,null,null,null,null,initial_status,l.status);
   note:=data->>'reason';
   next_mode:='spec'; next_obj:=case when cmd='reopen_lead' then crm_security.legacy_spec(data->'next_task') else crm_security.user_spec(data->'next') end;
   -- A reopened prospect is CONTACTING or ENGAGED: like « Changer », its first
   -- appointment is booked through the exchange that qualifies (OD-11; owner
   -- decision 2026-11-22).
   if next_obj->>'task_type'='center_visit' then
    raise exception 'Book an appointment through the exchange that qualifies the prospect' using errcode='22023',hint='crm_next_action.appointment_needs_exchange'; end if;
   needs_next:=true;

  elsif cmd='reassign' then
   if not(data ? 'owner_id') and not(data ? 'assigned_to') then raise exception 'Explicit reassignment required' using errcode='22023'; end if;
   if data ? 'owner_id' then
    perform crm_security.assert_staff((data->>'owner_id')::uuid);l.owner_id:=(data->>'owner_id')::uuid;
    perform crm_security.event(l.id,'lead_reassigned',source||':lead-owner',data->>'note');
    -- §4.6: the next action's assignee follows the owner.
    perform crm_security.set_next_action(l,jsonb_build_object('_reassign',true),'user',source);
   end if;
   if data ? 'assigned_to' then
    if t.id is null then raise exception 'Task required for task reassignment' using errcode='22023'; end if;
    perform crm_security.assert_staff((data->>'assigned_to')::uuid);
    perform crm_security.set_next_action(l,jsonb_build_object('_delegate',jsonb_build_object('task_id',t.id,'assigned_to',data->'assigned_to')),'user',source);
    perform crm_security.event(l.id,'task_reassigned',source||':task-owner',data->>'note',null,null,t.id);
   end if;
   note:=data->>'note';
  end if;

  -- Closure (old close commands, « Clôturer » in an exchange or a change,
  -- appointment « pas intéressé »). 140 (§5.4): one reason list; the status is
  -- derived from the reason when the caller does not send it.
  if next_mode='close' then
   reason:=close_reason; target:=coalesce(close_target,crm_security.close_status(reason));
   if target is null or target not in ('LOST','NOT_QUALIFIED') or reason is null or not crm_security.close_reason_allowed(target,reason)
    or (reason='other' and nullif(btrim(close_note),'') is null) then raise exception 'Valid closure reason and explanation required' using errcode='22023'; end if;
   if reason='unreachable' and (l.status not in ('CONTACTING','ENGAGED','QUALIFIED') or crm_security.failed_count(l)<5) then raise exception 'Unreachable requires five current-cycle failed phone calls' using errcode='22023'; end if;
   perform crm_security.event(l.id,case when target='LOST' then 'lead_lost' else 'lead_not_qualified' end,source||':closed',close_note,null,reason,null,null,null,null,l.status,target);
   l.status:=target;l.closure_reason:=reason;l.closure_note:=close_note;l.closed_at:=now();
   perform crm_security.set_next_action(l,jsonb_build_object('none',true,'reason','Lead closed: '||reason),'close',source||':cancel');
   note:=concat_ws(' — ',note,nullif(btrim(close_note),''));
  end if;

  if meaningful then
   if happened<greatest(l.last_conversation_at,l.last_attempt_at) then
    raise exception 'Conversation predates the latest outreach evidence' using errcode='22023'; end if;
   l.last_conversation_at:=happened;
   -- A conversation interrupts outreach even for an already qualified lead.
   l.outreach_cycle:=l.outreach_cycle+1;l.outreach_anchor_date:=null;l.last_attempt_at:=null;
   if l.status in ('NEW','CONTACTING') then
    perform crm_security.event(l.id,'lead_engaged',source||':engaged',null,null,null,null,null,null,null,l.status,'ENGAGED');
    l.status:='ENGAGED';
   end if;
   if next_mode not in ('spec','enrol') then
    perform crm_security.set_next_action(l,jsonb_build_object('_cancel_slots','Meaningful conversation ended outreach'),'user',source||':cancel-attempt');
   end if;
   needs_next:=true;
  end if;
  if cmd='qualify_lead' or (qualify_step is not null and l.status in ('NEW','CONTACTING','ENGAGED')) then
   perform crm_security.event(l.id,'lead_qualified',source||':qualified',data->>'note',null,null,null,null,null,null,'ENGAGED','QUALIFIED');
   l.status:='QUALIFIED';needs_next:=true;
  end if;
  if qualify_step is not null then l.qualification_step:=qualify_step; end if;
  if next_mode in ('spec','enrol') and cmd in ('record_call_outcome','record_whatsapp','record_conversation','log_exchange','qualify_lead','reopen_lead','reopen_prospect')
   and coalesce(res,'') not in ('no_answer','busy','declined','unreachable','wrong_number','whatsapp_sent','note') then
   cause:=case when cmd in ('reopen_lead','reopen_prospect','qualify_lead') then 'user' else 'outcome' end;
   tid:=crm_security.set_next_action(l,next_obj||case when t.id is not null and cause='outcome' and cmd<>'log_exchange' then jsonb_build_object('_against',t.id) else '{}'::jsonb end,
    cause,source);
   needs_next:=true;
  end if;
  if needs_next and l.status in ('NEW','CONTACTING','ENGAGED','QUALIFIED') and not exists(select 1 from public.crm_tasks where lead_id=l.id and status='open') then raise exception 'Active lead requires a next actionable task' using errcode='22023'; end if;
  update public.crm_leads set status=l.status,owner_id=l.owner_id,qualification_step=l.qualification_step,
   closure_reason=l.closure_reason,closure_note=l.closure_note,closed_at=l.closed_at,outreach_cycle=l.outreach_cycle,
   outreach_anchor_date=l.outreach_anchor_date,last_attempt_at=l.last_attempt_at,last_conversation_at=l.last_conversation_at,
   version=version+1,updated_at=now() where id=l.id;
  if not nested and cmd<>'resolve_submission' then
   select * into na from public.crm_tasks where id=crm_security.next_action_id(l.id);
   after_label:=crm_security.action_label(na);
   perform crm_security.primary_event(l.id,cmd,note,primary_channel,res,before_label,after_label,case when res is not null then happened end,
    jsonb_build_object('result_label',coalesce(edit_label,crm_security.result_label(res)),'real_attempt_override',case when (data->>'real_attempt_override')::boolean then true end)
    ||case when edit is not null then jsonb_build_object('changes',edit) else '{}'::jsonb end);
  end if;
  result:=crm_security.result(l.id,source)||result_extra;
 end if;
 if not nested and cmd not in ('create_followup_policy','resolve_submission') then perform set_config('eh.crm_command_key','',true); end if;
 insert into public.crm_command_requests(actor_scope,command_name,request_key,payload_hash,result) values(actor::text,cmd,request,digest,result);
 return result;
exception
 when deadlock_detected then raise exception 'Concurrent CRM change; refresh and retry' using errcode='PT409';
 when invalid_text_representation or invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range or check_violation then
  raise exception 'Invalid CRM command input' using errcode='22023';
end $function$
;

-- crm_security.evaluate_conversion: programme and origin on conversion (invariant 11).
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
end $function$
;

-- crm_get_workspace_detail: origin and referrer.
CREATE OR REPLACE FUNCTION public.crm_get_workspace_detail(p_lead uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$ declare result jsonb; begin
 perform crm_security.require_reader(false);
 select crm_security.operational_card(l.id)||jsonb_build_object('contact',jsonb_build_object('display_name',c.display_name,'phone',coalesce(c.phone_e164,c.phone_raw),
 'phone_e164',c.phone_e164,'whatsapp_e164',coalesce(c.whatsapp_e164,c.phone_e164),'email',c.email_normalized,
 -- 139 (§5.3): the edit form and the « numéro à vérifier » flag.
 'id',c.id,'version',c.version,'contact_kind',c.contact_kind,'whatsapp_own',c.whatsapp_e164,
 'phone_needs_review',nullif(btrim(c.phone_raw),'') is not null and c.phone_e164 is null),
 'contact_id',l.contact_id,'lead_version',l.version,'merged_into_lead_id',l.merged_into_lead_id,
 'learner_birth_date',l.learner_birth_date,'learner_age',l.learner_age,'session_type',l.session_type,'program_interest_text',l.program_interest_text,
 -- 140 (§5.4): origin (editable on manual prospects only, OD-10 A) and referrer.
 'origin_code',crm_security.lead_origin(l),
 'origin_editable',(select s.channel='manual' from public.crm_submissions s where s.id=l.first_submission_id),
 'referrer',case when coalesce(l.referrer_text,l.referrer_student_id::text,l.referrer_lead_id::text) is not null then jsonb_build_object('name',l.referrer_text,
   'student_id',l.referrer_student_id,'lead_id',l.referrer_lead_id,'label',crm_security.referrer_label(l.referrer_text,l.referrer_student_id,l.referrer_lead_id)) end,
 'merged_from',(select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'learner_name',m.learner_name) order by m.created_at),'[]'::jsonb)
   from public.crm_leads m where m.id=any(crm_security.lead_merge_set(l.id)) and m.id<>l.id),
 'siblings',(select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'learner_name',o.learner_name,'status',o.status) order by o.created_at),'[]'::jsonb)
   from public.crm_leads o where o.contact_id=l.contact_id and o.id<>l.id and o.merged_into_lead_id is null),
 'duplicate_candidates',crm_security.undecided_matches('prospect',l.id,crm_security.person_matches(array_remove(array[c.phone_e164,c.whatsapp_e164],null),
   l.learner_name,l.learner_birth_date,l.id,l.student_id,l.contact_id)),
 'enrollment',(select crm_security.enrollment_summary(e) from public.enrollments e where e.id=l.enrollment_id),
 'conversion_review_required',case when public.get_my_role()='director' then l.conversion_review_required else false end,
 'qualification_step',l.qualification_step,'closure_reason',l.closure_reason,'closure_note',l.closure_note,'last_conversation_at',l.last_conversation_at,
 'outreach_cycle',l.outreach_cycle,'failed_attempts',crm_security.failed_count(l),
 'unreachable_eligible',l.status in ('CONTACTING','ENGAGED','QUALIFIED') and crm_security.failed_count(l)>=5,
 'open_tasks',public.crm_list_open_tasks(l.id,null,100,0),
 'confirm_placement_task',(select jsonb_build_object('id',t.id,'version',t.version) from public.crm_tasks t where t.lead_id=l.id and t.status='open' and t.task_type='confirm_placement_test' order by t.due_at,t.id limit 1),
 'placement_count',(select count(*) from public.placement_tests where crm_lead_id=l.id),
 'open_task_count',(select count(*) from public.crm_tasks where lead_id=l.id and status='open')) into result
 from public.crm_leads l join public.crm_contacts c on c.id=l.contact_id where l.id=p_lead;
 return result;
end $function$
;

-- save_receptionist_student: the origin list on the learner file.
CREATE OR REPLACE FUNCTION public.save_receptionist_student(p_student uuid, p_expected_updated_at timestamp with time zone, p_changes jsonb)
 RETURNS TABLE(id uuid, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$ declare s public.students%rowtype; begin
  perform operational_security.require_receptionist();
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
  return next;
end $function$
;

-- search_students_page: the source filter reads the origin list.
CREATE OR REPLACE FUNCTION public.search_students_page(p_search text DEFAULT ''::text, p_status text DEFAULT ''::text, p_age_category text DEFAULT ''::text, p_session text DEFAULT ''::text, p_level text DEFAULT ''::text, p_incomplete boolean DEFAULT false, p_source text DEFAULT ''::text, p_plan text DEFAULT ''::text, p_page integer DEFAULT 1, p_page_size integer DEFAULT 20, p_group text DEFAULT ''::text, p_payment text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare v_result jsonb;
begin
  if p_page < 1 or p_page_size < 0 or p_page_size > 100
    or pg_catalog.length(p_search) > 120
    or coalesce(p_payment, '') not in ('', 'due', 'unpaid', 'partial', 'overdue', 'paid', 'none') then
    raise exception 'Invalid student page request' using errcode = '22023';
  end if;
  if p_page_size = 0 and public.get_my_role()='receptionist' then
    raise exception 'Student export forbidden' using errcode='42501';
  end if;
  if p_page_size = 0 and p_page <> 1 then
    raise exception 'Export page must be first page' using errcode = '22023';
  end if;

  -- Batch G: the learner filters run first; the finance aggregate covers only the
  -- learners it can affect (the page when no payment filter is set, else the candidates).
  with candidates as materialized (
    select s.*
    from public.students s
    where (
      p_status = 'all_shown'
      or (coalesce(p_status,'') = '' and s.status in ('Enrolled','Trial'))
      or (p_status not in ('','all_shown') and s.status = p_status)
    )
    and (coalesce(p_group,'') = '' or
      (p_group = 'unassigned' and (
        exists (select 1 from public.enrollments e where e.student_id = s.id
          and e.status = 'Confirmed' and e.group_id is null)
        or (s.status in ('Enrolled','Trial') and not exists (select 1 from public.enrollments e
          where e.student_id = s.id and e.group_id is not null and e.status in ('Validated','Trial'))
          and not exists (select 1 from public.enrollments e where e.student_id = s.id
            and e.status in ('Submitted','Under Review','Confirmed'))))))
    and (coalesce(p_age_category,'') = '' or s.age_category = p_age_category)
    and (coalesce(p_session,'') = '' or s.session_type = p_session)
    and (coalesce(p_level,'') = '' or s.niveau_cefr = p_level)
    and (not coalesce(p_incomplete,false) or (s.email is null or s.email = '') and (s.parent_email is null or s.parent_email = ''))
    -- 140 (§5.4): the source filter is the origin list; a file D4 has not mapped yet
    -- reads its old answer (the same five values as crm_security.referral_origin).
    and (coalesce(p_source,'') = '' or coalesce(s.origin_code, case s.referral_source
      when 'Réseaux sociaux (Facebook / Instagram)' then 'social_media'
      when 'Recherche Google' then 'google'
      when 'Famille / Ami(e)' then 'recommendation'
      when 'Passage devant le centre (walk-in)' then 'walk_by'
      when 'Ancien élève / Réinscription' then 'former_student' end) = p_source)
    and (coalesce(p_plan,'') = '' or coalesce(s.plan_type,'Standard') = p_plan)
    and (coalesce(p_search,'') = '' or pg_catalog.strpos(pg_catalog.lower(coalesce(s.full_name,'')),pg_catalog.lower(p_search)) > 0
      or pg_catalog.strpos(pg_catalog.lower(coalesce(s.email,'')),pg_catalog.lower(p_search)) > 0
      -- 139 (§5.1): a phone in any format, from 6 significant digits.
      or (public.phone_search_key(p_search) is not null
        and pg_catalog.strpos(coalesce(public.phone_key(s.telephone),''),public.phone_search_key(p_search)) > 0))
    -- 139 (§5.3): a student merged into another is shown through the one kept.
    and s.merged_into_student_id is null
  ), scope as materialized (
    select c.id from candidates c where coalesce(p_payment, '') <> ''
    union all
    select p.id from (select c.id from candidates c where coalesce(p_payment, '') = ''
      order by c.created_at desc, c.id asc
      limit nullif(p_page_size,0)
      offset case when p_page_size = 0 then 0 else (p_page - 1) * p_page_size end) p
  ), finance as materialized (
    select sc.id as student_id, f.charge_count, f.payment_balance, f.has_overdue, f.has_partial
    from scope sc
    cross join lateral (
      select count(*) as charge_count,
        sum(c.balance)::numeric(12,2) as payment_balance,
        bool_or(c.balance > 0 and c.settlement_status = 'En retard') as has_overdue,
        bool_or(c.balance > 0 and c.paid_amount > 0) as has_partial
      from public.charge_balances c
      where c.voided_at is null and c.student_id = sc.id
      having count(*) > 0) f
  ), priced as materialized (
    select s.*,
      coalesce(f.payment_balance, 0)::numeric(12,2) as payment_balance,
      case
        when f.charge_count is null then 'Aucun engagement'
        when f.payment_balance <= 0 then 'Soldé'
        when f.has_overdue then 'En retard'
        when f.has_partial then 'Acompte versé'
        else 'En attente'
      end as payment_status
    from candidates s
    left join finance f on f.student_id = s.id
  ), filtered as materialized (
    select * from priced
    where coalesce(p_payment, '') = ''
      or (p_payment = 'due' and payment_balance > 0)
      or (p_payment = 'unpaid' and payment_status = 'En attente')
      or (p_payment = 'partial' and payment_status = 'Acompte versé')
      or (p_payment = 'overdue' and payment_status = 'En retard')
      or (p_payment = 'paid' and payment_status = 'Soldé')
      or (p_payment = 'none' and payment_status = 'Aucun engagement')
  ), rows as (
    select s.*,
      (select g.name from public.groups g where g.id = s.groupe_id) as group_name,
      (select count(*) from public.enrollments e where e.student_id = s.id and e.group_id is not null
        and e.status in ('Validated','Trial') and e.group_id is distinct from s.groupe_id) as extra_group_count,
      coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at, e.id)
        from public.enrollments e where e.student_id = s.id
          and e.status = 'Confirmed' and e.group_id is null), '[]'::jsonb) as pending_enrollments
    from (select * from filtered order by created_at desc, id asc
      limit nullif(p_page_size,0)
      offset case when p_page_size = 0 then 0 else (p_page - 1) * p_page_size end) s
  )
  select pg_catalog.jsonb_build_object(
    'rows',coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) order by r.created_at desc,r.id asc) from rows r),'[]'::jsonb),
    'count',(select count(*) from filtered),
    'total',(select count(*) from public.students),
    'active_count',(select count(*) from public.students where status in ('Enrolled','Trial'))
  ) into v_result;
  return v_result;
end;
$function$
;

-- crm_get_marketing_cohort: test prospects D6 marked are left out (section 10).
CREATE OR REPLACE FUNCTION public.crm_get_marketing_cohort(p_from date, p_to date, p_cutoff_date date DEFAULT NULL::date, p_connection uuid DEFAULT NULL::uuid, p_level text DEFAULT 'campaign'::text, p_campaign text DEFAULT NULL::text, p_adset text DEFAULT NULL::text, p_ad text DEFAULT NULL::text, p_channel text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_session_type text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$ declare cfg jsonb;tz text:='Africa/Casablanca';currency text;cutoff timestamptz;complete boolean:=false;last_sync timestamptz;warning boolean;suppressed text;result jsonb;begin
 perform crm_security.require_reader(true);
 if p_from is null or p_to is null or not isfinite(p_from) or not isfinite(p_to) or p_to<p_from or p_to-p_from>365 or p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset<0
 or p_level is null or p_level not in ('campaign','adset','ad','source','program') or (p_channel is not null and p_channel not in ('meta_instant_form','website','manual'))
 or (p_session_type is not null and p_session_type not in ('Yearly','Adults','Summer Camp','Communication Junior','Communication Adult','One-to-One','Mise à niveau','Other','none')) then raise exception 'Invalid cohort request' using errcode='22023';end if;
 suppressed:=case when p_session_type is not null then 'program_filter' when p_level='program' then 'program_level' end;
 if p_connection is not null then
  select insights_settings into cfg from public.crm_integration_connections where id=p_connection and provider='meta' and insights_settings ? 'account_id';
  if not found then raise exception 'Unknown reporting account' using errcode='22023';end if;
  tz:=cfg->>'timezone';currency:=cfg->>'currency';
 end if;
 cutoff:=case when p_cutoff_date is null then clock_timestamp() else least(clock_timestamp(),((p_cutoff_date+1)::timestamp at time zone tz)-interval '1 microsecond') end;
 if not isfinite(cutoff) or cutoff<(p_from::timestamp at time zone tz) then raise exception 'Cutoff precedes cohort' using errcode='22023';end if;
 if p_connection is not null then
  select not exists(select 1 from generate_series(p_from::timestamp,p_to::timestamp,interval '1 day')day where not exists(select 1 from public.crm_meta_sync_runs r where r.connection_id=p_connection and r.status='completed' and r.query_version='ad-daily-v1' and day::date between r.date_from and r.date_to)) into complete;
  select max(completed_at) into last_sync from public.crm_meta_sync_runs where connection_id=p_connection and status='completed' and daterange(date_from,date_to,'[]') && daterange(p_from,p_to,'[]');
 end if;
 select exists(select 1 from public.crm_meta_sync_runs r where r.connection_id=p_connection and r.status<>'completed' and daterange(r.date_from,r.date_to,'[]') && daterange(p_from,p_to,'[]') and (r.status in ('pending','running') or exists(select 1 from generate_series(greatest(r.date_from,p_from)::timestamp,least(r.date_to,p_to)::timestamp,interval '1 day')day where not exists(select 1 from public.crm_meta_sync_runs newer where newer.connection_id=r.connection_id and newer.status='completed' and newer.completed_at>r.created_at and day::date between newer.date_from and newer.date_to)))) into warning;
 with cohort as (
  select l.id,l.first_submission_id,l.conversion_activity_id,l.conversion_review_required,l.session_type,s.channel,s.source_label,a.campaign_id,a.adset_id,a.ad_id,
   a.campaign_name_snapshot,a.adset_name_snapshot,a.ad_name_snapshot,m.connection_id,
   case when s.channel='meta_instant_form' and a.provider='meta' and m.connection_id=p_connection then
     case p_level when 'campaign' then a.campaign_id when 'adset' then a.adset_id when 'ad' then a.ad_id when 'source' then case when a.campaign_id is not null then 'meta' end when 'program' then case when a.campaign_id is not null then 'meta' end end end as advertising_key,
   coalesce(s.channel='meta_instant_form' and crm_security.attribution_enrichment_eligible(a,s.channel,m.connection_id),false) as pending
  from public.crm_leads l join public.crm_submissions s on s.id=l.first_submission_id
  left join public.crm_submission_attribution a on a.submission_id=s.id left join public.crm_form_mappings m on m.id=s.form_mapping_id
  where l.merged_into_lead_id is null
   -- 140 (D6, owner decision 2026-11-26): test prospects D6 marked are left out of reports.
   and not exists(select 1 from public.report_exclusions x where x.entity='crm_leads' and x.entity_id=l.id)
   and s.occurred_at>=p_from::timestamp at time zone tz and s.occurred_at<(p_to+1)::timestamp at time zone tz and s.occurred_at<=cutoff
   and (p_channel is null or s.channel=p_channel)
   and (p_session_type is null or (p_session_type='none' and l.session_type is null) or l.session_type=p_session_type)
   and (s.channel<>'meta_instant_form' or p_connection is null or m.connection_id=p_connection or m.connection_id is null)
   and (p_campaign is null or (s.channel='meta_instant_form' and a.provider='meta' and m.connection_id=p_connection and a.campaign_id=p_campaign))
   and (p_adset is null or (s.channel='meta_instant_form' and a.provider='meta' and m.connection_id=p_connection and a.adset_id=p_adset))
   and (p_ad is null or (s.channel='meta_instant_form' and a.provider='meta' and m.connection_id=p_connection and a.ad_id=p_ad))
 ), flagged as (
  select c.*,
   case when advertising_key is not null then 'meta:'||advertising_key when pending then 'pending:'||channel else 'unknown:'||channel end as attribution_bucket,
   case p_level when 'campaign' then campaign_name_snapshot when 'adset' then adset_name_snapshot when 'ad' then ad_name_snapshot end as historical_name,
   exists(select 1 from public.crm_activities a where a.lead_id=c.id and a.event_type in ('contact_attempted','conversation_recorded','whatsapp_sent','whatsapp_conversation') and a.occurred_at<=cutoff)::int as contacted,
   exists(select 1 from public.crm_activities a where a.lead_id=c.id and a.event_type in ('conversation_recorded','whatsapp_conversation') and a.occurred_at<=cutoff)::int as reached,
   exists(select 1 from public.crm_activities a where a.lead_id=c.id and a.event_type='lead_engaged' and a.occurred_at<=cutoff)::int as engaged,
   exists(select 1 from public.crm_activities a where a.lead_id=c.id and a.event_type='lead_qualified' and a.occurred_at<=cutoff)::int as qualified,
   exists(select 1 from public.crm_activities a where a.id=c.conversion_activity_id and a.lead_id=c.id and a.event_type='lead_converted' and a.occurred_at<=cutoff)::int as converted,
   (select count(distinct a.placement_test_id) from public.crm_activities a where a.lead_id=c.id and a.event_type='placement_test_booked' and a.occurred_at<=cutoff) as tests_booked,
   (select count(distinct a.placement_test_id) from public.crm_activities a where a.lead_id=c.id and a.event_type='placement_test_attended' and a.occurred_at<=cutoff) as tests_attended,
   (select count(distinct a.placement_test_id) from public.crm_activities a where a.lead_id=c.id and a.event_type='placement_result_entered' and a.occurred_at<=cutoff) as results,
   (select coalesce(sum(r.amount_delta),0) from public.crm_revenue_entries r where r.lead_id=c.id and r.attribution_submission_id=c.first_submission_id and r.effective_at<=cutoff) as revenue
  from cohort c
 ), per_lead as (
  select f.*,(f.converted=1 and f.revenue>0)::int as converted_paid,(f.tests_booked>0)::int as booked_leads,(f.tests_attended>0)::int as attended_leads,
   case when p_level='program' then 'program:'||coalesce(f.session_type,'none') else f.attribution_bucket end as bucket,
   case when p_level='program' then f.session_type else f.advertising_key end as row_key
  from flagged f
 ), crm as (
  select bucket,max(row_key) as object_key,max(channel) as channel,count(*) as leads,sum(contacted) as contacted,sum(reached) as reached,sum(engaged) as engaged,sum(qualified) as qualified,sum(converted) as converted,sum(converted_paid) as converted_paid,
   sum(tests_booked) as tests_booked,sum(booked_leads) as booked_leads,sum(attended_leads) as attended_leads,sum(tests_attended) as tests_attended,sum(results) as results,sum(revenue) as revenue,
   count(*) filter(where conversion_review_required) as review_required,array_agg(distinct historical_name) filter(where historical_name is not null) as historical_names
  from per_lead group by bucket
 ), spend as (
  select 'meta:'||case p_level when 'campaign' then d.campaign_id when 'adset' then d.adset_id when 'ad' then d.ad_id when 'source' then 'meta' end as bucket,
   max(case p_level when 'campaign' then d.campaign_id when 'adset' then d.adset_id when 'ad' then d.ad_id when 'source' then 'meta' end) as object_key,
   sum(d.spend) as spend,sum(d.impressions) as impressions,sum(d.clicks) as clicks,sum(d.link_clicks) as link_clicks
  from public.crm_meta_daily_insights d join public.crm_meta_sync_runs r on r.id=d.sync_run_id and r.status='completed'
  where suppressed is null and d.connection_id=p_connection and d.insight_date between p_from and p_to and d.query_version='ad-daily-v1' and d.level='ad' and d.breakdown_key=''
   and (p_campaign is null or d.campaign_id=p_campaign) and (p_adset is null or d.adset_id=p_adset) and (p_ad is null or d.ad_id=p_ad)
   and (p_channel is null or p_channel='meta_instant_form') group by 1
 ), combined as (
  select coalesce(c.bucket,s.bucket) as bucket,coalesce(c.object_key,s.object_key) as object_key,
   case when coalesce(c.bucket,s.bucket) like 'program:%' then 'program' when coalesce(c.bucket,s.bucket) like 'meta:%' then 'trusted_meta' else 'unattributed' end as attribution_kind,
   case when coalesce(c.bucket,s.bucket) like 'program:%' then null else coalesce(c.channel,'meta_instant_form') end as channel,coalesce(c.leads,0) as leads,coalesce(c.contacted,0) as contacted,coalesce(c.reached,0) as reached,
   coalesce(c.engaged,0) as engaged,coalesce(c.qualified,0) as qualified,coalesce(c.converted,0) as converted,coalesce(c.converted_paid,0) as converted_paid,
   coalesce(c.tests_booked,0) as tests_booked,coalesce(c.tests_attended,0) as tests_attended,coalesce(c.booked_leads,0) as booked_leads,coalesce(c.attended_leads,0) as attended_leads,
   coalesce(c.results,0) as results,coalesce(c.revenue,0) as revenue,coalesce(c.review_required,0) as review_required,c.historical_names,
   case when coalesce(c.bucket,s.bucket) like 'meta:%' and complete and suppressed is null then coalesce(s.spend,0) end as spend,s.impressions,s.clicks,s.link_clicks
  from crm c full join spend s using(bucket)
 ), named as (
  select x.*,case when x.attribution_kind='program' then coalesce(x.object_key,'Sans programme') else coalesce(o.current_name,case when p_level='source' and x.attribution_kind='trusted_meta' then 'Meta Instant Form' end,case when x.attribution_kind='trusted_meta' then x.historical_names[1] end,case when x.attribution_kind='trusted_meta' then case p_level when 'campaign' then 'Campagne ' when 'adset' then 'Ensemble ' else 'Annonce ' end||x.object_key end,case x.channel when 'website' then 'Site web · attribution observée' when 'manual' then 'Saisie manuelle / téléphone / recommandation' else case when x.bucket like 'pending:%' then 'Meta · attribution en attente' else 'Meta · attribution inconnue' end end) end as name,
   case when x.attribution_kind='trusted_meta' then o.objective end as objective,
   case when x.attribution_kind='trusted_meta' then x.spend/nullif(x.leads,0) end as cpl,
   case when x.attribution_kind='trusted_meta' then x.spend/nullif(x.qualified,0) end as cpql,
   case when x.attribution_kind='trusted_meta' then x.spend/nullif(x.converted,0) end as cac,
   case when x.attribution_kind='trusted_meta' and currency='MAD' then x.revenue/nullif(x.spend,0) end as roas
  from combined x left join public.crm_meta_objects o on x.attribution_kind='trusted_meta' and o.connection_id=p_connection and o.object_type=p_level and o.external_id=x.object_key
 ), totals as (
  select count(*) as leads,coalesce(sum(contacted),0) as contacted,coalesce(sum(reached),0) as reached,coalesce(sum(engaged),0) as engaged,coalesce(sum(qualified),0) as qualified,coalesce(sum(converted),0) as converted,coalesce(sum(converted_paid),0) as converted_paid,
   coalesce(sum(tests_booked),0) as tests_booked,coalesce(sum(tests_attended),0) as tests_attended,coalesce(sum(booked_leads),0) as booked_leads,coalesce(sum(attended_leads),0) as attended_leads,
   coalesce(sum(results),0) as results,coalesce(sum(revenue),0) as revenue,
   count(*) filter(where attribution_bucket not like 'meta:%') as unattributed_leads,
   count(*) filter(where attribution_bucket like 'pending:%') as pending_leads,
   count(*) filter(where attribution_bucket like 'meta:%') as attributed_leads,coalesce(sum(contacted) filter(where attribution_bucket like 'meta:%'),0) as attributed_contacted,
   coalesce(sum(qualified) filter(where attribution_bucket like 'meta:%'),0) as attributed_qualified,
   coalesce(sum(converted) filter(where attribution_bucket like 'meta:%'),0) as attributed_converted,coalesce(sum(revenue) filter(where attribution_bucket like 'meta:%'),0) as attributed_revenue,
   case when complete and suppressed is null and (p_channel is null or p_channel='meta_instant_form') then (select coalesce(sum(n.spend),0) from named n) end as spend
  from per_lead
 ) select jsonb_build_object('mode','acquisition_cohort','acquisition_from',p_from,'acquisition_to',p_to,'outcome_cutoff',cutoff,'timezone',tz,'spend_currency',currency,'revenue_currency','MAD','currency_mismatch',currency is not null and currency<>'MAD',
  'spend_complete',complete,'spend_suppressed_reason',suppressed,'session_type',p_session_type,'last_synced_at',last_sync,'sync_warning',warning,'live_sync_enabled',coalesce(cfg->>'mode'='live' and coalesce((cfg->>'enabled')::boolean,false),false),'reach',null,
  'summary',(select to_jsonb(t)||jsonb_build_object('cpl',spend/nullif(attributed_leads,0),'cpql',spend/nullif(attributed_qualified,0),'cac',spend/nullif(attributed_converted,0),'roas',case when currency='MAD' then attributed_revenue/nullif(spend,0) end) from totals t),
  'total',(select count(*) from named),'rows',coalesce((select jsonb_agg(to_jsonb(page) order by page.spend desc nulls last,page.name,page.bucket) from (select bucket,object_key,attribution_kind,channel,name,objective,historical_names,spend,leads,contacted,reached,engaged,qualified,tests_booked,tests_attended,booked_leads,attended_leads,results,converted,converted_paid,review_required,revenue,cpl,cpql,cac,roas,impressions,clicks,link_clicks from named order by spend desc nulls last,name,bucket limit p_limit offset p_offset)page),'[]')) into result;
 return result;
end $function$
;

-- Finance breakdown: the origin list. A learner file not yet mapped by D4 reads its
-- old answer through the same mapping as crm_security.referral_origin.
CREATE OR REPLACE FUNCTION public.get_referral_breakdown()
 RETURNS json
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
declare result json; begin
  if public.get_my_role()='receptionist' then raise exception 'Forbidden' using errcode='42501'; end if;
  -- 140 (§5.4): grouped by origin (code and French label).
  select coalesce(json_agg(json_build_object('source',src,'code',code,'count',c) order by c desc,src),'[]'::json)
    into result from (select coalesce(a.label_fr,'Non renseigné') src,a.code,count(*) c
      from public.students s left join public.acquisition_sources a on a.code=coalesce(s.origin_code,case s.referral_source
        when 'Réseaux sociaux (Facebook / Instagram)' then 'social_media' when 'Recherche Google' then 'google'
        when 'Famille / Ami(e)' then 'recommendation' when 'Passage devant le centre (walk-in)' then 'walk_by'
        when 'Ancien élève / Réinscription' then 'former_student' end)
      where s.status='Enrolled' group by 1,2) t;
  return result;
end $function$
;

-- ---------------------------------------------------------------------------
-- 7. Catalogue reads and director commands.
-- ---------------------------------------------------------------------------
create or replace function public.get_catalogue()
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, pg_temp as $$
begin
  if coalesce(public.get_my_role(), '') not in ('admin','director','receptionist') then
    raise exception 'Forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'programmes', (select coalesce(jsonb_agg(jsonb_build_object('code', p.code, 'label', p.label_fr, 'audience', p.audience,
        'crm_selectable', p.crm_selectable, 'enrollable', p.enrollable, 'active', p.active, 'version', p.version,
        'levels', (select coalesce(jsonb_agg(l.level order by l.sort_order), '[]'::jsonb) from public.programme_levels l where l.programme_code = p.code),
        -- The current row per school year (amount null: the price was cleared).
        'prices', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'school_year', x.school_year, 'amount', x.amount,
            'label', x.label_fr, 'effective_from', x.effective_from) order by x.school_year), '[]'::jsonb)
          from (select distinct on (pp.school_year) pp.* from public.programme_prices pp
                where pp.programme_code = p.code
                order by pp.school_year, pp.effective_from desc, pp.created_at desc, pp.id desc) x))
      order by p.sort_order), '[]'::jsonb) from public.programmes p),
    'origins', (select coalesce(jsonb_agg(jsonb_build_object('code', a.code, 'label', a.label_fr, 'channel', a.channel,
        'requires_referrer', a.requires_referrer, 'selectable', a.selectable and a.active) order by a.sort_order), '[]'::jsonb)
      from public.acquisition_sources a),
    'close_reasons', (select coalesce(jsonb_agg(jsonb_build_object('code', r.code, 'label', r.label_fr, 'status', r.status,
        'selectable', r.selectable, 'requires_note', r.requires_note, 'requires_failed_calls', r.requires_failed_calls) order by r.sort_order), '[]'::jsonb)
      from public.crm_close_reasons r));
end $$;

-- A director sets, changes or clears (p_amount null) the price of a programme for a
-- school year. p_expected_price_id is the current row the screen showed (null: none).
create or replace function public.catalogue_set_price(p_programme text, p_school_year text, p_amount numeric, p_label text, p_expected_price_id uuid)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, pg_temp as $$
declare cur public.programme_prices%rowtype; row public.programme_prices%rowtype; label text := nullif(btrim(p_label), '');
begin
  if public.get_my_role() is distinct from 'director' then raise exception 'Forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.programmes where code = p_programme and active) then
    raise exception 'Programme inconnu.' using errcode = '22023', hint = 'catalogue.programme_unknown'; end if;
  if p_school_year is null or p_school_year !~ '^[0-9]{4}/[0-9]{4}$'
     or substr(p_school_year, 6, 4)::integer <> substr(p_school_year, 1, 4)::integer + 1 then
    raise exception 'Année scolaire invalide.' using errcode = '22023', hint = 'catalogue.school_year_invalid'; end if;
  if p_amount is not null and (p_amount <= 0 or p_amount > 1000000 or p_amount <> round(p_amount, 2)) then
    raise exception 'Prix invalide.' using errcode = '22023', hint = 'catalogue.price_invalid'; end if;
  if label is not null and length(label) > 120 then
    raise exception 'Libellé trop long.' using errcode = '22023', hint = 'catalogue.price_invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended('catalogue:price:' || p_programme || ':' || p_school_year, 0));
  select * into cur from crm_security.programme_price(p_programme, p_school_year);
  if cur.id is distinct from p_expected_price_id then
    raise exception 'Le prix a changé ; rechargez.' using errcode = 'PT409', hint = 'catalogue.price_stale'; end if;
  if (cur.id is null and p_amount is null)
     or (cur.id is not null and cur.amount is not distinct from p_amount and cur.label_fr is not distinct from label) then
    raise exception 'Aucun changement.' using errcode = '22023', hint = 'catalogue.no_change'; end if;
  insert into public.programme_prices(programme_code, school_year, amount, label_fr, effective_from, created_by)
  values (p_programme, p_school_year, p_amount, case when p_amount is not null then label end, clock_timestamp(), auth.uid())
  returning * into row;
  return jsonb_build_object('id', row.id, 'programme_code', row.programme_code, 'school_year', row.school_year,
    'amount', row.amount, 'label', row.label_fr, 'effective_from', row.effective_from);
end $$;

-- A director chooses whether a programme is offered on prospect forms.
create or replace function public.catalogue_save_programme(p_code text, p_expected_version bigint, p_changes jsonb)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, pg_temp as $$
declare p public.programmes%rowtype;
begin
  if public.get_my_role() is distinct from 'director' then raise exception 'Forbidden' using errcode = '42501'; end if;
  if jsonb_typeof(p_changes) is distinct from 'object' or p_changes - array['crm_selectable'] <> '{}'::jsonb
     or jsonb_typeof(p_changes->'crm_selectable') is distinct from 'boolean' then
    raise exception 'Changement non pris en charge.' using errcode = '22023', hint = 'catalogue.unsupported_change'; end if;
  select * into p from public.programmes where code = p_code for update;
  if not found then raise exception 'Programme inconnu.' using errcode = '22023', hint = 'catalogue.programme_unknown'; end if;
  if p.version is distinct from p_expected_version then
    raise exception 'Le programme a changé ; rechargez.' using errcode = 'PT409', hint = 'catalogue.programme_stale'; end if;
  if p.crm_selectable = (p_changes->>'crm_selectable')::boolean then
    raise exception 'Aucun changement.' using errcode = '22023', hint = 'catalogue.no_change'; end if;
  update public.programmes set crm_selectable = (p_changes->>'crm_selectable')::boolean, version = version + 1,
    updated_at = now(), updated_by = auth.uid() where code = p_code returning * into p;
  return jsonb_build_object('code', p.code, 'crm_selectable', p.crm_selectable, 'version', p.version);
end $$;

-- ---------------------------------------------------------------------------
-- 8. Data step D4 (programme and origin mapping) — shipped, NOT run. Operator only,
--    with the owner's « approve D4 » (counts and mapping hash). Production free text
--    never enters the repository: the mapping is {"program": {hash: programme code},
--    "source": {hash: origin code}} with Q25's hash, left(md5(lower(btrim(text))),8).
--    Deterministic parts need no mapping: converted prospects take their enrollment's
--    programme (invariant 11), learner files their old answer's origin.
--    Unmapped values stay NULL and are listed by hash.
-- ---------------------------------------------------------------------------
create or replace function crm_security.d4_rows(mapping jsonb)
returns table(kind text, entity text, entity_id uuid, col text, before text, proposed text, hash text)
language sql stable
set search_path = pg_catalog, pg_temp as $$
  select 'converted', 'crm_leads', l.id, 'session_type', l.session_type, e.session_type, null::text
  from public.crm_leads l join public.enrollments e on e.id = l.enrollment_id
  where l.status = 'CONVERTED' and l.session_type is distinct from e.session_type
  union all
  select 'program', 'crm_leads', l.id, 'session_type', null, x.h_code, x.h
  from public.crm_leads l
  cross join lateral (select left(md5(lower(btrim(coalesce(l.program_interest_text, '')))), 8) h) hh
  cross join lateral (select hh.h, mapping->'program'->>hh.h h_code) x
  where l.session_type is null and not (l.status = 'CONVERTED' and l.enrollment_id is not null)
  union all
  select 'source', 'crm_leads', l.id, 'origin_code', null, x.h_code, x.h
  from public.crm_leads l join public.crm_submissions s on s.id = l.first_submission_id
  cross join lateral (select left(md5(lower(btrim(coalesce(s.source_label, '')))), 8) h) hh
  cross join lateral (select hh.h, mapping->'source'->>hh.h h_code) x
  where l.origin_code is null and s.channel = 'manual'
  union all
  select 'student_referral', 'students', st.id, 'origin_code', null, crm_security.referral_origin(st.referral_source), null
  from public.students st
  where st.origin_code is null and st.referral_source is not null and st.deleted_at is null
$$;

create or replace function crm_security.d4_plan(mapping jsonb)
returns jsonb language plpgsql stable
set search_path = pg_catalog, pg_temp as $$
declare k text; v record;
begin
  if jsonb_typeof(mapping) is distinct from 'object' or mapping - array['program','source'] <> '{}'::jsonb then
    raise exception 'Mapping {"program":{hash:code},"source":{hash:code}} required' using errcode = '22023', hint = 'catalogue.d4_mapping'; end if;
  foreach k in array array['program','source'] loop
    if mapping ? k and jsonb_typeof(mapping->k) <> 'object' then
      raise exception 'Mapping % must be an object', k using errcode = '22023', hint = 'catalogue.d4_mapping'; end if;
    for v in select * from jsonb_each(coalesce(mapping->k, '{}'::jsonb)) loop
      if v.key !~ '^[0-9a-f]{8}$' or jsonb_typeof(v.value) <> 'string'
         or (k = 'program' and not exists (select 1 from public.programmes where code = v.value #>> '{}'))
         or (k = 'source' and not exists (select 1 from public.acquisition_sources where code = v.value #>> '{}' and channel = 'manual')) then
        raise exception 'Invalid mapping entry % in %', v.key, k using errcode = '22023', hint = 'catalogue.d4_mapping'; end if;
    end loop;
  end loop;
  return jsonb_build_object(
    'mapping_md5', md5(mapping::text),
    'counts', (select coalesce(jsonb_object_agg(kind, codes), '{}'::jsonb) from (
      select kind, jsonb_object_agg(proposed, n) codes from (
        select kind, proposed, count(*) n from crm_security.d4_rows(mapping) where proposed is not null group by 1, 2) a group by kind) b),
    'unmapped', (select coalesce(jsonb_object_agg(kind, hashes), '{}'::jsonb) from (
      select kind, jsonb_object_agg(coalesce(hash, 'other'), n) hashes from (
        select kind, hash, count(*) n from crm_security.d4_rows(mapping) where proposed is null group by 1, 2) a group by kind) b));
end $$;

create or replace function crm_security.d4_apply(mapping jsonb, expected jsonb)
returns jsonb language plpgsql
set search_path = pg_catalog, pg_temp as $$
declare plan jsonb; r record; n integer := 0;
begin
  lock table public.crm_leads, public.students in share row exclusive mode;
  if exists (select 1 from public.crm_data_step_journal where step = 'd4')
     and not exists (select 1 from public.crm_data_step_journal where step = 'd4_revert') then
    raise exception 'D4 was already applied' using errcode = '22023', hint = 'catalogue.d4_applied'; end if;
  if exists (select 1 from public.crm_data_step_journal where step = 'd4_revert') then
    raise exception 'D4 was reverted; a new run needs its own migration' using errcode = '22023', hint = 'catalogue.d4_applied'; end if;
  plan := crm_security.d4_plan(mapping);
  if expected is null or plan is distinct from expected then
    raise exception 'D4 plan differs from the approved dry run: %', plan->'counts' using errcode = '22023', hint = 'catalogue.d4_counts'; end if;
  for r in select * from crm_security.d4_rows(mapping) where proposed is not null order by kind, entity, entity_id loop
    insert into public.crm_data_step_journal(step, entity, entity_id, before, after, run_by)
    values ('d4', r.entity, r.entity_id, jsonb_build_object(r.col, r.before, 'kind', r.kind, 'hash', r.hash), jsonb_build_object(r.col, r.proposed), auth.uid());
    if r.entity = 'students' then update public.students set origin_code = r.proposed where id = r.entity_id;
    elsif r.col = 'session_type' then update public.crm_leads set session_type = r.proposed, version = version + 1, updated_at = now() where id = r.entity_id;
    else update public.crm_leads set origin_code = r.proposed, version = version + 1, updated_at = now() where id = r.entity_id; end if;
    n := n + 1;
  end loop;
  return jsonb_build_object('changed', n, 'plan', plan);
end $$;

-- Puts back every value D4 wrote that has not changed since; lists the others.
create or replace function crm_security.d4_revert()
returns jsonb language plpgsql
set search_path = pg_catalog, pg_temp as $$
declare j record; col text; cur text; n integer := 0; skipped jsonb := '[]'::jsonb;
begin
  lock table public.crm_leads, public.students in share row exclusive mode;
  if exists (select 1 from public.crm_data_step_journal where step = 'd4_revert') then
    raise exception 'D4 was already reverted' using errcode = '22023'; end if;
  for j in select * from public.crm_data_step_journal where step = 'd4' order by run_at desc, id desc loop
    col := (select k from jsonb_object_keys(j.after) k limit 1);
    if j.entity = 'students' then select origin_code into cur from public.students where id = j.entity_id;
    elsif col = 'session_type' then select session_type into cur from public.crm_leads where id = j.entity_id;
    else select origin_code into cur from public.crm_leads where id = j.entity_id; end if;
    if cur is distinct from j.after->>col then skipped := skipped || jsonb_build_object('entity', j.entity, 'id', j.entity_id); continue; end if;
    if j.entity = 'students' then update public.students set origin_code = j.before->>col where id = j.entity_id;
    elsif col = 'session_type' then update public.crm_leads set session_type = j.before->>col, version = version + 1, updated_at = now() where id = j.entity_id;
    else update public.crm_leads set origin_code = j.before->>col, version = version + 1, updated_at = now() where id = j.entity_id; end if;
    insert into public.crm_data_step_journal(step, entity, entity_id, before, after, run_by)
    values ('d4_revert', j.entity, j.entity_id, j.after, jsonb_build_object(col, j.before->>col), auth.uid());
    n := n + 1;
  end loop;
  return jsonb_build_object('restored', n, 'skipped', skipped);
end $$;

-- ---------------------------------------------------------------------------
-- 9. Grants. Private helpers and D4: no API role. Catalogue read and commands:
--    authenticated only (each checks the role itself).
-- ---------------------------------------------------------------------------
revoke all on function crm_security.close_status(text), crm_security.close_reason_allowed(text,text),
  crm_security.programme_selectable(text), crm_security.origin_selectable(text), crm_security.lead_origin(public.crm_leads),
  crm_security.referral_origin(text), crm_security.referrer_fields(text,jsonb,uuid), crm_security.referrer_label(text,uuid,uuid),
  crm_security.programme_price(text,text),
  crm_security.d4_rows(jsonb), crm_security.d4_plan(jsonb), crm_security.d4_apply(jsonb,jsonb), crm_security.d4_revert()
  from public, anon, authenticated;
revoke all on function public.get_catalogue(), public.catalogue_set_price(text,text,numeric,text,uuid),
  public.catalogue_save_programme(text,bigint,jsonb) from public, anon;
grant execute on function public.get_catalogue(), public.catalogue_set_price(text,text,numeric,text,uuid),
  public.catalogue_save_programme(text,bigint,jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 10. Data step D6 (test data) — shipped, NOT run (owner decision 2026-11-26: D6's
--     functions ship in migration 140). Plan §10 D6 row and OD-13 A. Operator only,
--     with the owner's « approve D6 », run as the director (like D1, D3 and D5), on the
--     ids the operator supplies (Q24 and the owner's):
--     {"students":[uuid…],"contacts":[uuid…],"leads":[uuid…],"groups":[uuid…]}.
--     Classes:
--      (a) a row nothing references (no foreign key from any table points to it):
--          deleted, its whole row kept in the journal (the operator exports it
--          privately first);
--      (b) prospects: closed NOT_QUALIFIED « invalid_spam » with the note « Données de
--          test (D6) » through the CRM close command; prospects already converted,
--          closed or merged are reported « already_closed » and not re-closed;
--          contacts with history are kept; every one is left out of reports;
--      (c) learner files with history (receipts among them): archived (deleted_at)
--          through the archive path, which ends their live enrollments; a test group
--          with history is closed through « Clôturer le cours », never deleted.
--     Receipts are never written: voided receipts EH-2026-00459 to 00461 stay
--     (gap-free numbering). A listed file holding a receipt that is not voided, a
--     group member who is not listed, an online group or an id that does not exist
--     stops the run.
-- ---------------------------------------------------------------------------
create table if not exists public.report_exclusions (
  entity text not null check (entity in ('students','crm_contacts','crm_leads','groups')),
  entity_id uuid not null,
  step text not null check (step ~ '^[a-z][a-z0-9_]*$'),
  excluded_at timestamptz not null default now(),
  primary key (entity, entity_id)
);
alter table public.report_exclusions enable row level security;
revoke all on table public.report_exclusions from public, anon, authenticated, service_role;

-- Every table.column whose foreign key points to this row and holds it.
create or replace function crm_security.d6_references(tbl regclass, rid uuid)
returns text[] language plpgsql stable
set search_path = pg_catalog, pg_temp as $$
declare c record; hit boolean; out text[] := '{}';
begin
  for c in select con.conrelid::regclass::text rel, a.attname::text col
      from pg_constraint con join pg_attribute a on a.attrelid = con.conrelid and a.attnum = con.conkey[1]
      where con.contype = 'f' and con.confrelid = tbl and cardinality(con.conkey) = 1
      order by 1, 2 loop
    execute format('select exists (select 1 from %s where %I = $1)', c.rel, c.col) into hit using rid;
    if hit then out := out || (c.rel || '.' || c.col); end if;
  end loop;
  return out;
end $$;

create or replace function crm_security.d6_rows(ids jsonb)
returns table(entity text, entity_id uuid, action text, detail jsonb)
language plpgsql stable
set search_path = pg_catalog, pg_temp as $$
declare k text; v jsonb; rid uuid; s public.students; c public.crm_contacts; l public.crm_leads; g public.groups; refs text[];
  listed uuid[];
begin
  if jsonb_typeof(ids) is distinct from 'object' or ids - array['students','contacts','leads','groups'] <> '{}'::jsonb then
    raise exception 'Ids {"students":[…],"contacts":[…],"leads":[…],"groups":[…]} required' using errcode = '22023', hint = 'd6.ids'; end if;
  foreach k in array array['students','contacts','leads','groups'] loop
    if ids ? k and (jsonb_typeof(ids->k) <> 'array' or jsonb_array_length(ids->k) > 200) then
      raise exception 'Ids % must be an array of at most 200 ids', k using errcode = '22023', hint = 'd6.ids'; end if;
    for v in select x from jsonb_array_elements(coalesce(ids->k, '[]'::jsonb)) x loop
      if jsonb_typeof(v) <> 'string' or (v #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'Invalid id in %', k using errcode = '22023', hint = 'd6.ids'; end if;
    end loop;
    if (select count(*) from jsonb_array_elements_text(coalesce(ids->k, '[]'::jsonb)))
       <> (select count(distinct lower(x)) from jsonb_array_elements_text(coalesce(ids->k, '[]'::jsonb)) x) then
      raise exception 'Duplicate id in %', k using errcode = '22023', hint = 'd6.ids'; end if;
  end loop;
  listed := array(select x::uuid from jsonb_array_elements_text(coalesce(ids->'students', '[]'::jsonb)) x);

  for rid in select x::uuid from jsonb_array_elements_text(coalesce(ids->'students', '[]'::jsonb)) x order by 1 loop
    entity := 'students'; entity_id := rid;
    select * into s from public.students st where st.id = rid;
    if not found then action := 'missing'; detail := '{}'::jsonb; return next; continue; end if;
    refs := crm_security.d6_references('public.students'::regclass, rid);
    action := case when s.deleted_at is not null then 'already_archived' when cardinality(refs) = 0 then 'delete' else 'archive' end;
    detail := jsonb_build_object('references', to_jsonb(refs),
      'placeholder_phone', coalesce(public.phone_is_placeholder(public.phone_e164(s.telephone)), false),
      'receipts', (select coalesce(jsonb_agg(jsonb_build_object('number', r.receipt_number, 'voided', r.voided_at is not null) order by r.receipt_number), '[]'::jsonb)
                   from public.receipts r where r.student_id = rid),
      'live_enrollments', (select coalesce(jsonb_agg(e.id order by e.id), '[]'::jsonb) from public.enrollments e
                   where e.student_id = rid and e.status in ('Submitted','Under Review','Confirmed','Validated','Trial')));
    return next;
  end loop;

  for rid in select x::uuid from jsonb_array_elements_text(coalesce(ids->'leads', '[]'::jsonb)) x order by 1 loop
    entity := 'crm_leads'; entity_id := rid;
    select * into l from public.crm_leads cl where cl.id = rid;
    if not found then action := 'missing'; detail := '{}'::jsonb; return next; continue; end if;
    action := case when l.merged_into_lead_id is not null or l.status in ('CONVERTED','LOST','NOT_QUALIFIED') then 'already_closed' else 'close' end;
    detail := jsonb_build_object('status', l.status, 'closure_reason', l.closure_reason, 'merged', l.merged_into_lead_id is not null);
    return next;
  end loop;

  for rid in select x::uuid from jsonb_array_elements_text(coalesce(ids->'contacts', '[]'::jsonb)) x order by 1 loop
    entity := 'crm_contacts'; entity_id := rid;
    select * into c from public.crm_contacts cc where cc.id = rid;
    if not found then action := 'missing'; detail := '{}'::jsonb; return next; continue; end if;
    refs := crm_security.d6_references('public.crm_contacts'::regclass, rid);
    action := case when cardinality(refs) = 0 then 'delete' else 'keep' end;
    detail := jsonb_build_object('references', to_jsonb(refs));
    return next;
  end loop;

  for rid in select x::uuid from jsonb_array_elements_text(coalesce(ids->'groups', '[]'::jsonb)) x order by 1 loop
    entity := 'groups'; entity_id := rid;
    select * into g from public.groups gr where gr.id = rid;
    if not found then action := 'missing'; detail := '{}'::jsonb; return next; continue; end if;
    refs := crm_security.d6_references('public.groups'::regclass, rid);
    action := case when g.closed_at is not null then 'already_closed' when cardinality(refs) = 0 then 'delete' else 'close' end;
    detail := jsonb_build_object('references', to_jsonb(refs),
      'online', online_security.is_online_type(g.session_type),
      'live_members', (select coalesce(jsonb_agg(e.student_id order by e.student_id), '[]'::jsonb) from public.enrollments e
                   where e.group_id = rid and e.status in ('Submitted','Under Review','Confirmed','Validated','Trial')),
      'unlisted_members', (select coalesce(jsonb_agg(distinct e.student_id), '[]'::jsonb) from public.enrollments e
                   where e.group_id = rid and e.status in ('Submitted','Under Review','Confirmed','Validated','Trial')
                     and not (e.student_id = any(listed))));
    return next;
  end loop;
end $$;

-- The dry run: counts per entity and action (what « approve D6 » names), the rows by
-- id with what D6 would do, the receipts it keeps, and what stops the run.
create or replace function crm_security.d6_plan(ids jsonb)
returns jsonb language sql stable
set search_path = pg_catalog, pg_temp as $$
  with r as (select * from crm_security.d6_rows(ids)),
  rc as (select x->>'number' num, (x->>'voided')::boolean voided from r cross join lateral jsonb_array_elements(r.detail->'receipts') x where r.entity = 'students')
  select jsonb_build_object(
    'counts', (select coalesce(jsonb_object_agg(entity, acts), '{}'::jsonb) from (
        select entity, jsonb_object_agg(action, n) acts from (select entity, action, count(*) n from r group by 1, 2) a group by entity) b)
      || jsonb_build_object('receipts', jsonb_build_object('voided', (select count(*) from rc where voided), 'live', (select count(*) from rc where not voided))),
    'rows', (select coalesce(jsonb_agg(jsonb_build_object('entity', entity, 'entity_id', entity_id, 'action', action, 'detail', detail) order by entity, entity_id), '[]'::jsonb) from r),
    'receipts_kept', (select coalesce(jsonb_agg(jsonb_build_object('number', num, 'voided', voided) order by num), '[]'::jsonb) from rc),
    'blockers', (select coalesce(jsonb_agg(jsonb_build_object('entity', entity, 'id', entity_id, 'blocker', b) order by entity, entity_id, b), '[]'::jsonb) from (
        select entity, entity_id, 'missing' b from r where action = 'missing'
        union all select entity, entity_id, 'live_receipt' from r where entity = 'students' and action in ('archive','delete')
          and exists (select 1 from jsonb_array_elements(detail->'receipts') x where not (x->>'voided')::boolean)
        union all select entity, entity_id, 'online_group' from r where entity = 'groups' and action in ('close','delete') and (detail->>'online')::boolean
        union all select entity, entity_id, 'member_not_listed' from r where entity = 'groups' and action in ('close','delete')
          and jsonb_array_length(detail->'unlisted_members') > 0) bl))
$$;

create or replace function crm_security.d6_apply(ids jsonb, expected jsonb)
returns jsonb language plpgsql
set search_path = pg_catalog, pg_temp as $$
declare plan jsonb; r record; l public.crm_leads; row_json jsonb; at timestamptz; done jsonb := '{}'::jsonb;
  note constant text := 'Données de test (D6)';
begin
  if coalesce(public.get_my_role(), '') <> 'director' then
    raise exception 'D6 runs as the director' using errcode = '42501', hint = 'd6.run_as_director'; end if;
  lock table public.students, public.crm_contacts, public.crm_leads, public.groups in share row exclusive mode;
  if exists (select 1 from public.crm_data_step_journal where step = 'd6_revert') then
    raise exception 'D6 was reverted; a new run needs its own migration' using errcode = '22023', hint = 'd6.applied'; end if;
  if exists (select 1 from public.crm_data_step_journal where step = 'd6') then
    raise exception 'D6 was already applied' using errcode = '22023', hint = 'd6.applied'; end if;
  plan := crm_security.d6_plan(ids);
  if jsonb_array_length(plan->'blockers') > 0 then
    raise exception 'D6 cannot run: %', plan->'blockers' using errcode = '22023', hint = 'd6.blocked'; end if;
  if expected is null or plan->'counts' is distinct from expected then
    raise exception 'D6 counts differ from the approved dry run: %', plan->'counts' using errcode = '22023', hint = 'd6.counts'; end if;

  -- (b) Prospects: the CRM close command, so history, actions and versions follow the rules.
  for r in select * from jsonb_to_recordset(plan->'rows') x(entity text, entity_id uuid, action text, detail jsonb) where x.entity = 'crm_leads' and x.action = 'close' order by x.entity_id loop
    select * into l from public.crm_leads where id = r.entity_id;
    insert into public.crm_data_step_journal(step, entity, entity_id, before, after, run_by)
    values ('d6', 'crm_leads', l.id, jsonb_build_object('action', 'close', 'status', l.status, 'version', l.version), null, auth.uid());
    perform crm_security.command('close_not_qualified', gen_random_uuid(), jsonb_build_object('lead_id', l.id,
      'expected_version', l.version, 'reason', 'invalid_spam', 'note', note));
    update public.crm_data_step_journal j set after = (select jsonb_build_object('status', x.status, 'closure_reason', x.closure_reason, 'closed_at', x.closed_at)
      from public.crm_leads x where x.id = l.id) where j.step = 'd6' and j.entity = 'crm_leads' and j.entity_id = l.id;
  end loop;

  -- (c) Learner files with history: archived (their live enrollments end).
  for r in select * from jsonb_to_recordset(plan->'rows') x(entity text, entity_id uuid, action text, detail jsonb) where x.entity = 'students' and x.action = 'archive' order by x.entity_id loop
    insert into public.crm_data_step_journal(step, entity, entity_id, before, after, run_by)
    select 'd6', 'students', s.id, jsonb_build_object('action', 'archive', 'deleted_at', s.deleted_at, 'status', s.status,
      'groupe_id', s.groupe_id, 'live_enrollments', r.detail->'live_enrollments'), null, auth.uid()
    from public.students s where s.id = r.entity_id;
    perform public.soft_delete_student(r.entity_id);
    update public.crm_data_step_journal j set after = (select jsonb_build_object('deleted_at', s.deleted_at, 'status', s.status) from public.students s where s.id = r.entity_id)
    where j.step = 'd6' and j.entity = 'students' and j.entity_id = r.entity_id;
  end loop;

  -- (c) Test groups with history: « Clôturer le cours » once their listed members are archived.
  for r in select * from jsonb_to_recordset(plan->'rows') x(entity text, entity_id uuid, action text, detail jsonb) where x.entity = 'groups' and x.action = 'close' order by x.entity_id loop
    insert into public.crm_data_step_journal(step, entity, entity_id, before, after, run_by)
    values ('d6', 'groups', r.entity_id, jsonb_build_object('action', 'close', 'closed_at', null), null, auth.uid());
    perform public.close_course(r.entity_id, 0, note, '{}'::uuid[], '{}'::uuid[]);
    update public.crm_data_step_journal j set after = (select jsonb_build_object('closed_at', g.closed_at) from public.groups g where g.id = r.entity_id)
    where j.step = 'd6' and j.entity = 'groups' and j.entity_id = r.entity_id;
  end loop;

  -- (a) Rows nothing references: the whole row is journalled, then deleted.
  for r in select * from jsonb_to_recordset(plan->'rows') x(entity text, entity_id uuid, action text, detail jsonb) where x.action = 'delete'
      order by case x.entity when 'students' then 1 when 'crm_contacts' then 2 else 3 end, x.entity_id loop
    execute format('select to_jsonb(t) from public.%I t where t.id = $1', r.entity) into row_json using r.entity_id;
    insert into public.crm_data_step_journal(step, entity, entity_id, before, after, run_by)
    values ('d6', r.entity, r.entity_id, jsonb_build_object('action', 'delete', 'row', row_json), jsonb_build_object('deleted', true), auth.uid());
    execute format('delete from public.%I where id = $1', r.entity) using r.entity_id;
  end loop;

  -- Out of reports: every kept test row.
  insert into public.report_exclusions(entity, entity_id, step)
  select x.entity, x.entity_id, 'd6' from jsonb_to_recordset(plan->'rows') x(entity text, entity_id uuid, action text, detail jsonb)
  where x.action in ('archive','already_archived','close','already_closed','keep')
  on conflict (entity, entity_id) do nothing;

  select jsonb_object_agg(entity, n) into done from (
    select entity, count(*) n from public.crm_data_step_journal where step = 'd6' group by entity) a;
  return jsonb_build_object('written', coalesce(done, '{}'::jsonb), 'excluded', (select count(*) from public.report_exclusions where step = 'd6'), 'plan', plan);
end $$;

-- Puts back what D6 wrote that has not changed since: deleted rows are re-inserted
-- from the journal, archived files restored (their enrollments stay ended, as with
-- « Restaurer »), closed groups reopened, report exclusions removed. Prospects D6
-- closed are listed, not reopened: reopening needs a next action staff choose.
create or replace function crm_security.d6_revert()
returns jsonb language plpgsql
set search_path = pg_catalog, pg_temp as $$
declare j record; cur timestamptz; n jsonb := '{}'::jsonb; reopen jsonb := '[]'::jsonb; ended jsonb := '[]'::jsonb;
  skipped jsonb := '[]'::jsonb;
begin
  if coalesce(public.get_my_role(), '') <> 'director' then
    raise exception 'D6 runs as the director' using errcode = '42501', hint = 'd6.run_as_director'; end if;
  lock table public.students, public.crm_contacts, public.crm_leads, public.groups in share row exclusive mode;
  if not exists (select 1 from public.crm_data_step_journal where step = 'd6') then
    raise exception 'D6 was not applied' using errcode = '22023'; end if;
  if exists (select 1 from public.crm_data_step_journal where step = 'd6_revert') then
    raise exception 'D6 was already reverted' using errcode = '22023'; end if;

  -- Deleted rows first (groups, then contacts, then learner files), each as it was.
  for j in select * from public.crm_data_step_journal where step = 'd6' and before->>'action' = 'delete'
      order by case entity when 'groups' then 1 when 'crm_contacts' then 2 else 3 end, entity_id loop
    if j.entity = 'students' then
      -- The phone guard would refuse a placeholder the file had before D6 (as in d3_revert).
      alter table public.students disable trigger people_phone_guard;
      insert into public.students select * from jsonb_populate_record(null::public.students, j.before->'row');
      alter table public.students enable trigger people_phone_guard;
    else
      execute format('insert into public.%I select * from jsonb_populate_record(null::public.%I, $1)', j.entity, j.entity) using j.before->'row';
    end if;
    insert into public.crm_data_step_journal(step, entity, entity_id, before, after, run_by)
    values ('d6_revert', j.entity, j.entity_id, j.after, jsonb_build_object('restored', 'row'), auth.uid());
    n := jsonb_set(n, array[j.entity || '_deleted'], to_jsonb(coalesce((n->>(j.entity || '_deleted'))::integer, 0) + 1));
  end loop;

  for j in select * from public.crm_data_step_journal where step = 'd6' and entity = 'groups' and before->>'action' = 'close' order by entity_id loop
    select closed_at into cur from public.groups where id = j.entity_id;
    if cur is distinct from (j.after->>'closed_at')::timestamptz then skipped := skipped || jsonb_build_object('entity', j.entity, 'id', j.entity_id); continue; end if;
    perform public.reopen_course(j.entity_id, cur);
    insert into public.crm_data_step_journal(step, entity, entity_id, before, after, run_by)
    values ('d6_revert', 'groups', j.entity_id, j.after, jsonb_build_object('closed_at', null), auth.uid());
    n := jsonb_set(n, '{groups_closed}', to_jsonb(coalesce((n->>'groups_closed')::integer, 0) + 1));
  end loop;

  for j in select * from public.crm_data_step_journal where step = 'd6' and entity = 'students' and before->>'action' = 'archive' order by entity_id loop
    select deleted_at into cur from public.students where id = j.entity_id;
    if cur is distinct from (j.after->>'deleted_at')::timestamptz then skipped := skipped || jsonb_build_object('entity', j.entity, 'id', j.entity_id); continue; end if;
    perform public.restore_student(j.entity_id);
    insert into public.crm_data_step_journal(step, entity, entity_id, before, after, run_by)
    values ('d6_revert', 'students', j.entity_id, j.after, jsonb_build_object('deleted_at', null), auth.uid());
    ended := ended || coalesce(j.before->'live_enrollments', '[]'::jsonb);
    n := jsonb_set(n, '{students_archived}', to_jsonb(coalesce((n->>'students_archived')::integer, 0) + 1));
  end loop;

  for j in select * from public.crm_data_step_journal where step = 'd6' and entity = 'crm_leads' order by entity_id loop
    reopen := reopen || to_jsonb(j.entity_id);
  end loop;

  delete from public.report_exclusions where step = 'd6';
  return jsonb_build_object('restored', n, 'reopen_by_hand', reopen, 'enrollments_still_ended', ended, 'skipped', skipped);
end $$;

revoke all on function crm_security.d6_references(regclass,uuid), crm_security.d6_rows(jsonb), crm_security.d6_plan(jsonb),
  crm_security.d6_apply(jsonb,jsonb), crm_security.d6_revert()
  from public, anon, authenticated;
