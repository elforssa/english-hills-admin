-- Phase 1: session-scoped groups and expanded English Hills level catalogue.
-- Existing rows are preserved. Adult-category groups are assigned to the new
-- Adults session; all other historical groups retain the Yearly default.

begin;

alter table public.groups
  add column if not exists session_type text not null default 'Yearly';

update public.groups
set session_type = 'Adults'
where categorie = 'Adultes'
  and session_type = 'Yearly';

alter table public.groups
  drop constraint if exists groups_session_type_check;
alter table public.groups
  add constraint groups_session_type_check
  check (session_type in (
    'Yearly', 'Adults', 'Summer Camp', 'Communication Junior',
    'Communication Adult', 'One-to-One', 'Mise à niveau', 'Other'
  ));

alter table public.students
  drop constraint if exists students_session_type_check;
alter table public.students
  add constraint students_session_type_check
  check (session_type in (
    'Yearly', 'Adults', 'Summer Camp', 'Communication Junior',
    'Communication Adult', 'One-to-One', 'Mise à niveau', 'Other'
  ));

alter table public.receipts
  drop constraint if exists receipts_session_type_check;
alter table public.receipts
  add constraint receipts_session_type_check
  check (session_type is null or session_type in (
    'Yearly', 'Adults', 'Summer Camp', 'Communication Junior',
    'Communication Adult', 'One-to-One', 'Mise à niveau', 'Other'
  ));

-- Level/session compatibility is enforced by the shared application catalogue.
-- Column checks accept the complete catalogue so existing A1-C2 records remain
-- editable without guessing a replacement level during this additive migration.
alter table public.groups drop constraint if exists groups_niveau_check;
alter table public.groups add constraint groups_niveau_check check (niveau in (
  'Pre-Child',
  'Child 1','Child 2','Child 3','Child 4','Child 5','Child 6',
  'Junior 1','Junior 2','Junior 3','Junior 4','Junior 5','Junior 6',
  'Beginning 1','Beginning 2','Beginning 3','Beginning 4','Beginning 5','Beginning 6',
  'Intermediate 1','Intermediate 2','Intermediate 3','Intermediate 4','Intermediate 5','Intermediate 6',
  'Advanced 1','Advanced 2','Advanced 3','Advanced 4','Advanced 5',
  'A1','A2','B1','B2','C1','C2'
));

alter table public.students drop constraint if exists students_niveau_cefr_check;
alter table public.students add constraint students_niveau_cefr_check check (
  niveau_cefr is null or niveau_cefr in (
    'Pre-Child',
    'Child 1','Child 2','Child 3','Child 4','Child 5','Child 6',
    'Junior 1','Junior 2','Junior 3','Junior 4','Junior 5','Junior 6',
    'Beginning 1','Beginning 2','Beginning 3','Beginning 4','Beginning 5','Beginning 6',
    'Intermediate 1','Intermediate 2','Intermediate 3','Intermediate 4','Intermediate 5','Intermediate 6',
    'Advanced 1','Advanced 2','Advanced 3','Advanced 4','Advanced 5',
    'A1','A2','B1','B2','C1','C2'
  )
);

alter table public.teachers drop constraint if exists teachers_niveaux_autorises_check;
alter table public.teachers add constraint teachers_niveaux_autorises_check check (
  niveaux_autorises is null or niveaux_autorises <@ array[
    'Pre-Child',
    'Child 1','Child 2','Child 3','Child 4','Child 5','Child 6',
    'Junior 1','Junior 2','Junior 3','Junior 4','Junior 5','Junior 6',
    'Beginning 1','Beginning 2','Beginning 3','Beginning 4','Beginning 5','Beginning 6',
    'Intermediate 1','Intermediate 2','Intermediate 3','Intermediate 4','Intermediate 5','Intermediate 6',
    'Advanced 1','Advanced 2','Advanced 3','Advanced 4','Advanced 5',
    'A1','A2','B1','B2','C1','C2'
  ]::text[]
);

alter table public.assessments drop constraint if exists assessments_niveau_actuel_check;
alter table public.assessments add constraint assessments_niveau_actuel_check check (
  niveau_actuel is null or niveau_actuel in (
    'Pre-Child',
    'Child 1','Child 2','Child 3','Child 4','Child 5','Child 6',
    'Junior 1','Junior 2','Junior 3','Junior 4','Junior 5','Junior 6',
    'Beginning 1','Beginning 2','Beginning 3','Beginning 4','Beginning 5','Beginning 6',
    'Intermediate 1','Intermediate 2','Intermediate 3','Intermediate 4','Intermediate 5','Intermediate 6',
    'Advanced 1','Advanced 2','Advanced 3','Advanced 4','Advanced 5',
    'A1','A2','B1','B2','C1','C2'
  )
);

alter table public.assessments drop constraint if exists assessments_niveau_cible_check;
alter table public.assessments add constraint assessments_niveau_cible_check check (
  niveau_cible is null or niveau_cible in (
    'Pre-Child',
    'Child 1','Child 2','Child 3','Child 4','Child 5','Child 6',
    'Junior 1','Junior 2','Junior 3','Junior 4','Junior 5','Junior 6',
    'Beginning 1','Beginning 2','Beginning 3','Beginning 4','Beginning 5','Beginning 6',
    'Intermediate 1','Intermediate 2','Intermediate 3','Intermediate 4','Intermediate 5','Intermediate 6',
    'Advanced 1','Advanced 2','Advanced 3','Advanced 4','Advanced 5',
    'A1','A2','B1','B2','C1','C2'
  )
);

alter table public.receipts drop constraint if exists receipts_niveau_check;
alter table public.receipts add constraint receipts_niveau_check check (niveau in (
  'Pre-Child',
  'Child 1','Child 2','Child 3','Child 4','Child 5','Child 6',
  'Junior 1','Junior 2','Junior 3','Junior 4','Junior 5','Junior 6',
  'Beginning 1','Beginning 2','Beginning 3','Beginning 4','Beginning 5','Beginning 6',
  'Intermediate 1','Intermediate 2','Intermediate 3','Intermediate 4','Intermediate 5','Intermediate 6',
  'Advanced 1','Advanced 2','Advanced 3','Advanced 4','Advanced 5',
  'A1','A2','B1','B2','C1','C2','CECRL'
));

alter table public.placement_tests drop constraint if exists placement_tests_niveau_recommande_check;
alter table public.placement_tests add constraint placement_tests_niveau_recommande_check check (
  niveau_recommande is null or niveau_recommande in (
    'Pre-Child',
    'Child 1','Child 2','Child 3','Child 4','Child 5','Child 6',
    'Junior 1','Junior 2','Junior 3','Junior 4','Junior 5','Junior 6',
    'Beginning 1','Beginning 2','Beginning 3','Beginning 4','Beginning 5','Beginning 6',
    'Intermediate 1','Intermediate 2','Intermediate 3','Intermediate 4','Intermediate 5','Intermediate 6',
    'Advanced 1','Advanced 2','Advanced 3','Advanced 4','Advanced 5',
    'A1','A2','B1','B2','C1','C2'
  )
);

alter table public.portfolios drop constraint if exists portfolios_niveau_check;
alter table public.portfolios add constraint portfolios_niveau_check check (
  niveau is null or niveau in (
    'Pre-Child',
    'Child 1','Child 2','Child 3','Child 4','Child 5','Child 6',
    'Junior 1','Junior 2','Junior 3','Junior 4','Junior 5','Junior 6',
    'Beginning 1','Beginning 2','Beginning 3','Beginning 4','Beginning 5','Beginning 6',
    'Intermediate 1','Intermediate 2','Intermediate 3','Intermediate 4','Intermediate 5','Intermediate 6',
    'Advanced 1','Advanced 2','Advanced 3','Advanced 4','Advanced 5',
    'A1','A2','B1','B2','C1','C2'
  )
);

alter table public.certificates drop constraint if exists certificates_niveau_complete_check;
alter table public.certificates add constraint certificates_niveau_complete_check check (niveau_complete in (
  'Pre-Child',
  'Child 1','Child 2','Child 3','Child 4','Child 5','Child 6',
  'Junior 1','Junior 2','Junior 3','Junior 4','Junior 5','Junior 6',
  'Beginning 1','Beginning 2','Beginning 3','Beginning 4','Beginning 5','Beginning 6',
  'Intermediate 1','Intermediate 2','Intermediate 3','Intermediate 4','Intermediate 5','Intermediate 6',
  'Advanced 1','Advanced 2','Advanced 3','Advanced 4','Advanced 5',
  'A1','A2','B1','B2','C1','C2'
));

create index if not exists idx_groups_session_level
  on public.groups (session_type, niveau);

-- A teacher may see a student through the student's current group or through
-- an active enrollment in one of the teacher's groups.
drop policy if exists "students teacher read groups" on public.students;
create policy "students teacher read groups" on public.students for select
  to authenticated
  using (
    public.get_my_role() = 'teacher'
    and (
      groupe_id in (
        select g.id from public.groups g
        where g.teacher_id = public.get_my_teacher_id()
      )
      or id in (
        select e.student_id
        from public.enrollments e
        join public.groups g on g.id = e.group_id
        where g.teacher_id = public.get_my_teacher_id()
          and e.status in ('Validated', 'Trial')
      )
    )
  );

notify pgrst, 'reload schema';
commit;
