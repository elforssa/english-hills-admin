-- =============================================================================
-- English Hills Language Center — Initial Schema
-- Migrated from Base44 entity definitions (base44/entities/*.jsonc).
--
-- Conventions:
--   * Every table has: id uuid pk (gen_random_uuid), created_at, updated_at.
--   * All updated_at columns are kept fresh by a single trigger function
--     applied to every table at the end of this file.
--   * Foreign keys use ON DELETE SET NULL per migration spec. This conflicts
--     with the Base44 "required" flag for some FKs (e.g. Attendance.student_id,
--     Assessment.student_id, Receipt-related links, etc.). Where ON DELETE
--     SET NULL is in force, the FK column is intentionally nullable. Required
--     non-FK fields (full_name, montant_total, dates, etc.) retain NOT NULL.
--   * Enum fields are stored as text with a CHECK constraint listing allowed
--     values, matching the JSON schemas verbatim (including French accents).
--   * Portfolio: fixed `titre` → `title` and `projet_type` → `project_type`
--     so the column names match the schema's `properties` block (the original
--     `required` array referenced columns that did not exist).
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- updated_at trigger function (applied to every table at the bottom of file)
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;


-- =============================================================================
-- Tables (created in dependency order so all FK targets exist when referenced)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- teachers
-- -----------------------------------------------------------------------------
create table public.teachers (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  full_name           text not null,
  photo_url           text,
  telephone           text,
  email               text,
  contract_type       text check (contract_type in ('Employé','Freelance')),
  certifications      text[],
  niveaux_autorises   text[] check (
    niveaux_autorises is null
    or niveaux_autorises <@ array['A1','A2','B1','B2','C1','C2']
  ),
  taux_horaire        numeric(12,2),
  salaire_mensuel     numeric(12,2),
  iban                text,
  notes               text
);

-- -----------------------------------------------------------------------------
-- groups
-- -----------------------------------------------------------------------------
create table public.groups (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  name          text not null,
  langue        text default 'Anglais',
  niveau        text not null check (niveau in ('A1','A2','B1','B2','C1','C2')),
  teacher_id    uuid references public.teachers(id) on delete set null,
  salle         text,
  jours         text,
  horaire       text,
  capacite_max  integer default 12,
  terme         text check (terme in ('Sept–Déc','Jan–Mar','Avr–Juin','Été')),
  annee         text,
  categorie     text check (categorie in (
    'Enfants','Ados','Adultes','Business','Particulier','Préparation aux examens'
  ))
);

-- -----------------------------------------------------------------------------
-- students
-- -----------------------------------------------------------------------------
create table public.students (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  full_name       text not null,
  date_naissance  date,
  photo_url       text,
  niveau_cefr     text check (niveau_cefr in ('A1','A2','B1','B2','C1','C2')),
  groupe_id       uuid references public.groups(id) on delete set null,
  telephone       text,
  email           text,
  parent_email    text,
  age_category    text check (age_category in (
    'Young Learners (6-12)','Teens (13-17)','Adults (18+)','Corporate'
  )),
  status          text default 'Prospect' check (status in (
    'Prospect','Enrolled','Trial','Inactive','Alumni'
  )),
  notes           text
);

-- -----------------------------------------------------------------------------
-- authorized_adults (people allowed to pick up Young Learners)
-- -----------------------------------------------------------------------------
create table public.authorized_adults (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- nullable because of ON DELETE SET NULL (originally required)
  student_id  uuid references public.students(id) on delete set null,
  full_name   text not null,
  telephone   text not null,
  relation    text not null check (relation in ('Parent','Grand-parent','Chauffeur','Autre')),
  photo_url   text
);

-- -----------------------------------------------------------------------------
-- receipts
-- -----------------------------------------------------------------------------
create table public.receipts (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  student_id      uuid references public.students(id) on delete set null,
  receipt_number  text,
  date            date not null,
  nom_prenom      text not null,
  telephone       text not null,
  email           text,
  date_naissance  date,
  categorie       text not null check (categorie in (
    'Enfants','Ados','Adultes','Business','Particulier','Préparation aux examens'
  )),
  niveau          text not null check (niveau in ('A1','A2','B1','B2','C1','C2','CECRL')),
  duree_cours     text,
  type_cours      text not null check (type_cours in ('Standard','Intensif')),
  jours           text,
  plage_horaire   text,
  montant_total   numeric(12,2) not null,
  montant_paye    numeric(12,2) not null,
  mode_paiement   text not null check (mode_paiement in (
    'Espèces','Carte bancaire','Virement','Chèque'
  )),
  statut_paiement text default 'En attente' check (statut_paiement in (
    'Soldé','Acompte versé','En attente','En retard'
  )),
  observation     text
);

-- -----------------------------------------------------------------------------
-- payments
-- -----------------------------------------------------------------------------
create table public.payments (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- nullable because of ON DELETE SET NULL (originally required)
  student_id      uuid references public.students(id) on delete set null,
  receipt_id      uuid references public.receipts(id) on delete set null,
  montant_total   numeric(12,2) not null,
  montant_paye    numeric(12,2) not null,
  montant_restant numeric(12,2),
  mode_paiement   text check (mode_paiement in (
    'Espèces','Carte bancaire','Virement','Chèque'
  )),
  status          text default 'En attente' check (status in (
    'Payé','En attente','En retard'
  )),
  date_paiement   date,
  terme           text,
  notes           text
);

-- -----------------------------------------------------------------------------
-- enrollments
-- -----------------------------------------------------------------------------
create table public.enrollments (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- nullable because of ON DELETE SET NULL (originally required)
  student_id        uuid references public.students(id) on delete set null,
  group_id          uuid references public.groups(id) on delete set null,
  status            text default 'Submitted' check (status in (
    'Submitted','Under Review','Validated','Rejected','Trial'
  )),
  date_inscription  date,
  documents_urls    text[],
  notes             text
);

-- -----------------------------------------------------------------------------
-- attendance
-- -----------------------------------------------------------------------------
create table public.attendance (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- nullable because of ON DELETE SET NULL (originally required)
  student_id    uuid references public.students(id) on delete set null,
  group_id      uuid references public.groups(id) on delete set null,
  session_date  date not null,
  status        text not null default 'Présent' check (status in (
    'Présent','Absent','Retard','Justifié'
  )),
  notes         text
);

-- -----------------------------------------------------------------------------
-- assessments (graded term reports)
-- -----------------------------------------------------------------------------
create table public.assessments (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- nullable because of ON DELETE SET NULL (originally required)
  student_id      uuid references public.students(id) on delete set null,
  group_id        uuid references public.groups(id) on delete set null,
  terme           text,
  note_oral       numeric(5,2),
  note_ecrit      numeric(5,2),
  note_devoirs    numeric(5,2),
  note_finale     numeric(5,2),
  poids_oral      numeric(5,2) default 40,
  poids_ecrit     numeric(5,2) default 30,
  poids_devoirs   numeric(5,2) default 30,
  niveau_actuel   text check (niveau_actuel in ('A1','A2','B1','B2','C1','C2')),
  niveau_cible    text check (niveau_cible in ('A1','A2','B1','B2','C1','C2')),
  commentaire     text
);

-- -----------------------------------------------------------------------------
-- learning_assessments (Kolb + multiple intelligences profile)
-- -----------------------------------------------------------------------------
create table public.learning_assessments (
  id                      uuid primary key default gen_random_uuid(),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  -- nullable because of ON DELETE SET NULL (originally required)
  student_id              uuid references public.students(id) on delete set null,
  student_name            text not null,
  date_assessment         date not null,
  kolb_style              text check (kolb_style in (
    'Diverging','Assimilating','Converging','Accommodating'
  )),
  kolb_scores             jsonb,
  intelligences           jsonb,
  dominant_intelligence   text,
  teacher_notes           text,
  triggered_by            text
);

-- -----------------------------------------------------------------------------
-- placement_tests
-- -----------------------------------------------------------------------------
create table public.placement_tests (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  student_id          uuid references public.students(id) on delete set null,
  student_name        text not null,
  date_test           date not null,
  heure               text,
  examinateur         text,
  score               numeric(5,2),
  niveau_recommande   text check (niveau_recommande in ('A1','A2','B1','B2','C1','C2')),
  status              text default 'Planifié' check (status in (
    'Planifié','Passé','Résultat saisi','Affecté'
  )),
  groupe_affecte_id   uuid references public.groups(id) on delete set null,
  notes               text
);

-- -----------------------------------------------------------------------------
-- portfolios (digital portfolios with project artifacts)
-- Note: column names corrected to `title` and `project_type` (original
-- `required` array referenced these English names but `properties` had
-- French names `titre` / `projet_type`).
-- -----------------------------------------------------------------------------
create table public.portfolios (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- nullable because of ON DELETE SET NULL (originally required)
  student_id          uuid references public.students(id) on delete set null,
  student_name        text,
  terme               text check (terme in ('Sept–Déc','Jan–Mar','Avr–Juin','Été')),
  annee               text,
  niveau              text check (niveau in ('A1','A2','B1','B2','C1','C2')),
  project_type        text not null check (project_type in (
    'Oral Presentation','Written Essay','Audio Recording','Video Project','PDF Document','Other'
  )),
  title               text not null,
  description         text,
  file_url            text,
  file_name           text,
  teacher_note        text,
  teacher_id          uuid references public.teachers(id) on delete set null,
  visible_to_parent   boolean default true,
  visible_to_student  boolean default true
);

-- -----------------------------------------------------------------------------
-- certificates
-- -----------------------------------------------------------------------------
create table public.certificates (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- nullable because of ON DELETE SET NULL (originally required)
  student_id        uuid references public.students(id) on delete set null,
  student_name      text not null,
  niveau_complete   text not null check (niveau_complete in ('A1','A2','B1','B2','C1','C2')),
  terme             text,
  annee             text,
  date_emission     date not null,
  directeur         text,
  notes             text,
  pdf_url           text,
  issued            boolean default false
);

-- -----------------------------------------------------------------------------
-- dismissal_logs (Young Learners pickup audit trail)
-- -----------------------------------------------------------------------------
create table public.dismissal_logs (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- nullable because of ON DELETE SET NULL (originally required)
  student_id    uuid references public.students(id) on delete set null,
  student_name  text,
  adult_id      uuid references public.authorized_adults(id) on delete set null,
  adult_name    text not null,
  staff_name    text,
  timestamp     timestamptz default now(),
  confirmed     boolean default false
);

-- -----------------------------------------------------------------------------
-- payroll (Moroccan CNSS/AMO/IR rules applied client-side, stored here)
-- -----------------------------------------------------------------------------
create table public.payroll (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- nullable because of ON DELETE SET NULL (originally required)
  teacher_id          uuid references public.teachers(id) on delete set null,
  teacher_name        text not null,
  contract_type       text check (contract_type in ('Employé','Freelance')),
  mois                text not null,
  annee               text not null,
  heures_travaillees  numeric(8,2),
  taux_horaire        numeric(12,2),
  salaire_brut        numeric(12,2),
  cotisation_cnss     numeric(12,2),
  cotisation_amo      numeric(12,2),
  ir_retenu           numeric(12,2),
  salaire_net         numeric(12,2),
  statut              text default 'Brouillon' check (statut in ('Brouillon','Validé','Payé')),
  notes               text
);

-- -----------------------------------------------------------------------------
-- leave_requests (teacher leave / absence requests)
-- -----------------------------------------------------------------------------
create table public.leave_requests (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- nullable because of ON DELETE SET NULL (originally required)
  teacher_id    uuid references public.teachers(id) on delete set null,
  teacher_name  text not null,
  date_debut    date not null,
  date_fin      date not null,
  type_conge    text not null check (type_conge in (
    'Congé annuel','Maladie','Personnel','Formation'
  )),
  status        text default 'En attente' check (status in (
    'En attente','Approuvé','Refusé'
  )),
  remplacant    text,
  notes         text
);

-- -----------------------------------------------------------------------------
-- announcements
-- -----------------------------------------------------------------------------
create table public.announcements (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  title       text not null,
  body        text not null,
  group_id    uuid references public.groups(id) on delete set null,
  audience    text default 'all' check (audience in ('all','group','parents','teachers')),
  author      text,
  pinned      boolean default false
);

-- -----------------------------------------------------------------------------
-- notifications (system-sent emails + audit log)
-- -----------------------------------------------------------------------------
create table public.notifications (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  type              text not null check (type in (
    'absence','payment_reminder','report_card','enrollment_confirmed',
    'schedule_change','class_reminder','general'
  )),
  recipient_email   text not null,
  recipient_name    text,
  student_id        uuid references public.students(id) on delete set null,
  subject           text not null,
  message           text not null,
  sent              boolean default false,
  sent_at           timestamptz,
  error             text
);

-- -----------------------------------------------------------------------------
-- messages (direct messages between users, with optional reply threading)
-- -----------------------------------------------------------------------------
create table public.messages (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  from_user_email   text not null,
  from_name         text,
  to_user_email     text,
  to_name           text,
  subject           text not null,
  body              text not null,
  type              text default 'message' check (type in (
    'message','document_request','announcement'
  )),
  student_id        uuid references public.students(id) on delete set null,
  read              boolean default false,
  reply_to_id       uuid references public.messages(id) on delete set null
);

-- -----------------------------------------------------------------------------
-- app_config (key/value runtime config — current term, current year, etc.)
-- -----------------------------------------------------------------------------
create table public.app_config (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  key         text not null unique,
  value       text not null,
  label       text
);

-- -----------------------------------------------------------------------------
-- pending_roles (custom role to apply when an invited user first logs in)
-- -----------------------------------------------------------------------------
create table public.pending_roles (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  email       text not null unique,
  role        text not null check (role in (
    'director','admin','teacher','parent','student'
  ))
);


-- =============================================================================
-- updated_at triggers — applied uniformly to every table.
-- =============================================================================
do $$
declare
  t text;
begin
  foreach t in array array[
    'teachers','groups','students','authorized_adults','receipts','payments',
    'enrollments','attendance','assessments','learning_assessments',
    'placement_tests','portfolios','certificates','dismissal_logs','payroll',
    'leave_requests','announcements','notifications','messages','users',
    'app_config','pending_roles'
  ]
  loop
    execute format(
      'create trigger set_%I_updated_at before update on public.%I
         for each row execute function public.set_updated_at();',
      t, t
    );
  end loop;
end $$;


-- =============================================================================
-- Seed data — AppConfig defaults
-- Mirrors the defaults baked into src/pages/Settings.jsx in the Vite app.
-- Adjust the values to your current academic term/year before going live.
-- =============================================================================
insert into public.app_config (key, value, label) values
  ('current_term', 'Sept–Déc',   'Terme actuel'),
  ('current_year', '2024–2025',  'Année scolaire'),
  ('center_name',  'English Hills Language Center', 'Nom du centre'),
  ('center_email', 'contact@english-hills.com',     'Email du centre'),
  ('center_phone', '+212 5XX-XXXXXX',               'Téléphone du centre'),
  ('center_address', 'Bouskoura / Sidi Maarouf, Casablanca', 'Adresse du centre'),
  ('center_tagline', 'Learn Today, Lead Tomorrow',  'Tagline du centre')
on conflict (key) do nothing;
