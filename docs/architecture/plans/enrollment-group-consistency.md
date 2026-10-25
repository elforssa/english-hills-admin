> **Status: APPROVED FOR IMPLEMENTATION** (owner, 2026-10-24, at plan head `50da715`, D1–D7 as recorded in the [approval record](#approval-record); D8 = A answered by the owner on 2026-10-24 16:16 Asia/Shanghai). Revision **EGC-r2** (EGC-r1 approved; EGC-r2 applies the independent review corrections, see [Review corrections](#review-corrections-egc-r2); new decision D8 answered **A**), 2026-10-24, Tier 3. Baseline `origin/main` `ba009b45062ecbbef7beff6abbebeb9492965945`, rebased on `cc1fd11` (#150 and #156, no migration, no file this plan touches); Production ledger 001–118 ([CURRENT_STATE](../../ai/CURRENT_STATE.md)). Implementation: see the [implementation record](#implementation-record) (migrations 120 and 121; not merged, not deployed). Every migration, the data cleanup and every deployment each still need their own approval. Proposed decision record: [ADR-010](../decisions/ADR-010-group-membership-from-enrollments.md).

# Owner summary

**Enrollments and groups stay consistent (Batch D of the 2026-10-24 audit).** Today a learner's group is stored twice: once on the learner file (`students.groupe_id`, one value only) and once on each enrollment (`enrollments.group_id`). Triggers try to keep the two in step, and several everyday actions break that: placing a learner in a second programme moves them out of the first, a group's level can be changed under its learners and then payments fail, "Inactive" does not stick, and 94 people who left in the summer still count as active. This plan makes **the enrollment the only source of truth for group membership**, keeps the learner-file group only as a display copy that the database computes, adds a proper **"Ancien apprenant" (leaver) action**, and cleans up the existing data in a separate step you approve.

## What will change

- **One enrollment per programme per school year, one group per enrollment.** A learner who takes Yearly and Mise à niveau has two enrollments and can sit in two groups at once. Placing them in the Mise à niveau group never takes them out of the Yearly group (DAT-1).
- **Every group placement creates or uses an enrollment.** "Add to group" from the group page, the learner file or reception always goes through one database command. Nobody can put a learner in a group by editing the learner file any more (DAT-2, ACA-7).
- **A group with learners cannot change programme or level**, for every role, so a payment can never fail because of a group edit (ACA-1). Payments also stop re-checking an unchanged group.
- **Group capacity is enforced** when a learner is placed (ACA-6), with a director/admin override if you choose it.
- **A leaver flow.** "Ancien apprenant" (management) ends the learner's active enrollments with a reason, takes them off every roster and attendance sheet, and sets the file to "Ancien apprenant" (Alumni) or "Inactif". It sticks: only a new enrollment makes the learner active again (ACA-3, ACA-2). A year-end "Clôturer l'année" action does the same for everyone still on a finished school year, run only when you decide.
- **Learner status follows enrollments.** "Inscrit" means at least one confirmed, validated or trial enrollment. A receipt for a book, a test fee or an old balance no longer makes someone "Inscrit" (FIN-10, your decision D3).
- **Archiving** ends active enrollments first and can be undone by the director (ACA-8).
- **The dashboard counts real learners.** "Apprenants actifs" counts Inscrit and Essai only (no Ancien apprenant), and "Groupe à affecter" lists confirmed enrollments waiting for a group (ACA-2/DAT-6).
- Smaller fixes in the same batch: the admin enrollment editor sends only what changed and refuses a stale save (ACA-5); a grade of 0 is kept as 0 (ACA-9).

## What staff/users will be able to do

- **Director/admin:** place a learner in a group (creating the enrollment if needed), remove them, override capacity with a reason (if you choose), mark a learner as leaver, close a school year, reopen an ended enrollment, archive and restore a learner file.
- **Reception:** place and remove learners exactly as today, through the same commands; see the honest "Groupe à affecter" list. Reception cannot mark leavers, close a year or override capacity (recommended; decision D2/D4).
- **Teachers, parents, students:** no new action. Teachers see exactly the learners with an active enrollment in their groups; parents see group announcements for every group their child is in.

## What remains restricted

- Roles, finance authority, the CRM conversion rule and the receptionist boundaries are unchanged. The reads that change (rosters, attendance check, teacher access, announcements, message recipients, teacher file access) follow "active enrollment in the group". They are narrower than today's union for leavers and archived learners and, as D-7 intends, reach further in three places: the teacher of a learner's second-programme group can read and upload that learner's portfolio items (storage teacher branch), parents and students see the announcements of every group the learner belongs to, and attendance of an ended learner stays correctable for sessions before the end date. *(Wording corrected in the implementation review, 2026-10-25; it previously read "No policy is widened".)*
- Payments stay separate from enrollment status, as the product rules say. Ending an enrollment never voids a charge; an old balance stays owed and visible.
- No data is changed by the migrations. The clean-up is a separate, counted, logged and reversible step that runs only after your approval.

## UI impact

- **Group page:** "Ajouter" always uses the new placement command; full groups show "complet" and refuse (or ask for an override reason, D4). The headcount and the roster come from one rule, so they always agree.
- **Group modal:** programme and level are locked while the group has learners, with "Réaffectez les apprenants avant de changer le niveau".
- **Students list:** the inline programme/level cells are read-only for learners who are in a group (edit from the enrollment). The group column shows the main group plus "+1" for a second programme.
- **Learner file:** "Groupe du dossier" becomes "Groupe principal"; each enrollment shows its own group; new buttons "Ancien apprenant" and "Rouvrir l'inscription" (management); the free status select disappears from the edit form.
- **New learner forms:** a new file starts as "Prospect" until it is enrolled or placed (D3).
- **Dashboard, academic report, attendance, teacher portal, dismissal:** counts and rosters follow the active-enrollment rule.
- **Enrollment editor (admin):** programme and school year are required on creation; a stale save shows "Cette inscription a changé, rechargez".
- **Assessments:** 0 is stored and shown as 0; the learner list is limited to the chosen group.

## Database impact

- **Two forward migrations** (numbers chosen just before merge): **M1** `XXX_enrollment_group_consistency.sql` adds the "Ended" enrollment status and its columns, the placement/leaver/archive commands, the group and capacity guards, and replaces the two sync triggers; existing reads keep working unchanged. **M2** `XXX_enrollment_group_consistency_enforce.sql` runs only after the clean-up: it validates the new constraints, refuses to run if any learner-file group is not backed by an enrollment, and switches the roster, attendance, teacher, announcement, messaging and file-access checks to enrollments only.
- **One owner-approved data clean-up** between M1 and M2 (counts below, re-read on the day): 36 Yearly enrollments back-filled, 1 Yearly enrollment given its missing school year, 7 legacy rows closed, 99 former learners marked Ancien apprenant, 3 enrollments of archived learners closed, 10 Mise à niveau learners given a waiting enrollment. Every change is logged with a before-image so it can be reversed.
- Expected result: about **105 active learners** (today the dashboard says 204) and **28** in "Groupe à affecter" (today 127).

## Important security decisions

- Group membership is checked in one private database helper used by every reader, so attendance, teacher access, announcements and messaging cannot drift apart again.
- The learner-file group can only be written by the database itself; a direct write from any role is refused.
- New commands are SECURITY DEFINER with a fixed search path, check the stored role, take row locks and refuse stale or conflicting writes with SQLSTATE `PT409` (HTTP 409, never retried by PostgREST) and a stable hint, as [ADR-009](https://github.com/elforssa/english-hills-admin/pull/151) (Plan C, conflicts never retryable) requires; never `40001`.
- Two CRM functions change by a few lines each if you choose D5-A (an ended enrollment keeps its conversion; a new lead does not attach to an ended enrollment). Conversion still happens only from a trusted linked Confirmed/Validated enrollment.

## Risks / owner review points

- **This is the deepest change of the audit batches.** It re-creates about a dozen database functions that payments, reception and the CRM use. Mitigation: re-create each from its latest definition with a recorded line diff, keep every existing SQL suite green, add a dedicated suite and an upgrade test, and ship in two migrations with the clean-up between them.
- **Do it before the first Mise à niveau group is created and before any group level change.** Until M1 is live, creating a Mise à niveau group would remove 4 learners from their Yearly roster.
- **Order of release matters:** M1 and the application deploy go out together; the clean-up and M2 follow after your approval. M2 refuses to run if the clean-up is incomplete.
- **Overlaps with other batches:** Batch E also changes the payment function, Batch C (ADR-009, PR #151) sets the conflict-error contract this plan follows (`PT409` plus a stable hint, recognised by the shared browser helper `isRecordConflict`), Batch F changes teacher and family visibility, and Premium Release B rewrites the file-access function. Whichever merges second rebuilds from the first's definitions (stop condition in the contract).
- **11 former learners have old balances (8,272 MAD in total, all legacy).** Marking them Ancien apprenant does not cancel those balances.
- Your decisions D1–D7 below shape the design; the recommended options are what the plan describes. **D8 (new after review, answered A on 2026-10-24):** closing an online course ends its learners' enrollments, so a learner can take another online course the same school year.
- **Revised clean-up count after review (D6):** one more row is fixed: a Yearly enrollment that sits on its learner's group but has no school year gets `2026/2027` (new stage C1b). All other counts are unchanged.

---

## Baseline and evidence limits

- Code read at `origin/main` `ba009b45062ecbbef7beff6abbebeb9492965945` (2026-10-24). Latest database definitions taken from the repository migrations and cross-checked against Production catalog (`pg_proc.prosrc`, `pg_policies`) read-only.
- Production counts below are aggregates only (no names, contacts or identifiers), read on 2026-10-24 for sizing. They must be re-read on the day of the clean-up.
- Audit inputs: findings ACA-1 to ACA-9, DAT-1 to DAT-3, DAT-6 and FIN-10 with the independent verifications A and C. Where a verifier corrected a finding, the verifier's version is used.
- Not verifiable here: local Supabase (no Docker in the architecture environment), so no SQL was executed locally. CI runs the database suites.

## Verified current state

### Data model and the two copies of "group"

| Fact | Evidence |
| --- | --- |
| `students.groupe_id` is a single uuid; `enrollments.group_id` is per enrollment | [001](../../../supabase/migrations/001_initial_schema.sql), [072](../../../supabase/migrations/072_paid_enrollment_without_group.sql) |
| Enrollment statuses: Submitted, Under Review, Confirmed, Validated, Rejected, Trial | `enrollments_status_check` ([072](../../../supabase/migrations/072_paid_enrollment_without_group.sql)) |
| BEFORE trigger `enrollment_student_sync_before` → `check_enrollment_student_sync`: Confirmed + group becomes Validated; Validated/Trial need a group; **on every insert/update** compares group session/level with the enrollment | [072](../../../supabase/migrations/072_paid_enrollment_without_group.sql) (latest) |
| AFTER trigger `enrollment_student_sync_after` → `enforce_enrollment_student_sync` → `sync_student_from_enrollments(student, force_downgrade, previous_group)` | [072](../../../supabase/migrations/072_paid_enrollment_without_group.sql) (enforce, latest), [074](../../../supabase/migrations/074_enrollment_workflow_consistency.sql) (sync, latest) |
| The sync picks **one** enrollment (`Validated 0, Trial 1, Confirmed 2, …`, then `updated_at desc`) and copies its group, session and level onto the learner; returns at `pg_trigger_depth() > 1` | 074 |
| BEFORE UPDATE OF `groupe_id, session_type, niveau_cefr` on `students` → `sync_enrollments_from_student` writes the matching enrollment (group, level, Confirmed↔Validated) | 074 |
| `remove_student_group(student, group)` (INVOKER): Validated→Confirmed, Trial→Under Review, clears `groupe_id` | 074 |
| `create_charge_payment` (wrapper, latest 096): sets `students.status='Enrolled'` for **every** new receipt before the Other/legacy return; updates the linked/selected enrollment (session, year, level, status) or inserts a Confirmed enrollment **without group** | [096](../../../supabase/migrations/096_receptionist_operational_permissions.sql) lines 392–515 |
| Reception: `save_receptionist_group` refuses a session/level change on a populated group; `save_receptionist_enrollment` (latest 117); `assign_receptionist_student_group` writes `groupe_id` directly when called without an enrollment | 096, [117](../../../supabase/migrations/117_online_learning_pilot.sql) |
| Admin/director write `groups`, `students` and `enrollments` directly through RLS (`entities.*.update`) | [groups/page.jsx](../../../src/app/(admin)/groups/page.jsx), [groups/[id]/page.jsx](../../../src/app/(admin)/groups/[id]/page.jsx), [StudentForm.jsx](../../../src/components/students/StudentForm.jsx), [EnrollmentModal.jsx](../../../src/components/students/EnrollmentModal.jsx) |
| `soft_delete_student` only sets `deleted_at`; a RESTRICTIVE policy then hides the file from every role | [041](../../../supabase/migrations/041_batch1_authorization_containment.sql) |
| Online groups (117): seat = Confirmed/Validated enrollment; capacity trigger `online_enrollment_capacity` counts non-Rejected enrollments **at group assignment only**; returns early for in-person groups | 117 lines 579–914 |

### Who reads membership, and how (Production catalog, 2026-10-24)

| Reader | Rule today | Source |
| --- | --- | --- |
| `groupMemberIds` (groups list headcount, group page roster), `/attendance` roster, teacher-portal attendance roster and counts, `AcademicOperationsReport` | `groupe_id = G` **or** Validated/Trial enrollment in G | [enrollmentWorkflow.mjs](../../../src/lib/enrollmentWorkflow.mjs), [attendance/page.jsx](../../../src/app/(admin)/attendance/page.jsx), [teacher-portal/page.jsx](../../../src/app/(admin)/teacher-portal/page.jsx), [AcademicOperationsReport.jsx](../../../src/components/reports/AcademicOperationsReport.jsx) |
| `attendance_student_in_group` (attendance insert/update check) | same union | [063](../../../supabase/migrations/063_attendance_integrity.sql) |
| `teacher_can_access_student_group` (teacher SELECT on `students`, assessments, portfolios, …) | union, but the `groupe_id` branch also needs status Enrolled/Trial | [071](../../../supabase/migrations/071_teacher_academic_relationships.sql) |
| `can_message_recipient` | union | [069](../../../supabase/migrations/069_teacher_message_identity.sql) |
| `announcements audience read` policy (parents/students, group audience) | **`groupe_id` only** | [024](../../../supabase/migrations/024_teacher_link_by_email_and_announcement_fix.sql) |
| `resolve_storage_asset`, teacher branch for photos/portfolios (read) | **`groupe_id` only** | [096](../../../supabase/migrations/096_receptionist_operational_permissions.sql) line 982 (latest; adds the receptionist branch; Premium Release B plans to re-create it) |
| `storage_security.can_write`, teacher branch for portfolio uploads | **`groupe_id` only** | [096](../../../supabase/migrations/096_receptionist_operational_permissions.sql) line 938 (latest) |
| Teacher-portal Learning tab group filter, students list "Groupe", learner file "Groupe du dossier", `search_students_page` group name and "Groupe à affecter" | `groupe_id` | [097](../../../supabase/migrations/097_receptionist_group_assignment_filter.sql), [students/page.jsx](../../../src/app/(admin)/students/page.jsx) |
| `crm_find_student_candidates` (display), `log_activity` (PII scrub) | `groupe_id`, display only | 084, 021 |
| Dashboard "Apprenants actifs" | `status in ('Enrolled','Trial','Alumni')` | [dashboard/page.jsx](../../../src/app/(admin)/dashboard/page.jsx) line 80 |

### Production sizing (aggregates, 2026-10-24)

| Measure | Count |
| --- | --- |
| Non-archived learner files | 222 (Enrolled 204, Prospect 17, Inactive 1); 7 archived |
| Files holding a group (`groupe_id`) | 83, all in the 8 groups (all Yearly, `annee` 2026-2027, capacity 15, fullest 14) |
| …with no Validated/Trial enrollment on that group | **36** (31 with no enrollment at all, 4 with only a Mise à niveau enrollment, 1 with only a legacy Validated row) |
| …of the 36: unlinked non-legacy Yearly 2026/2027 charge (exactly one each) / legacy Yearly charge / no Yearly charge | 12 / 23 / 1 |
| …of the 36: with attendance history | 21 learners (23 attendance rows not backed by an enrollment) |
| Learners in a Yearly group with a Confirmed, ungrouped Mise à niveau enrollment (DAT-1 exposure) | 6 (4 of them among the 36) |
| Enrollments: Validated 54, Confirmed 20, Submitted 12, Under Review 2, Rejected 1 | 89 |
| Validated without group (legacy, created 2026-05-24, last updated 2026-07-12) | **7** (1 learner holds a Yearly group, 5 past-programme learners without group, 1 archived) |
| Confirmed without group (non-archived) | 18 (Mise à niveau 8, Adults 8, One-to-One 2) |
| Enrollments with null programme / null school year | 21 / 22 (Submitted 11, Under Review 2, Rejected 1, legacy Validated 7, plus 1 Validated Yearly without year) |
| Duplicate active enrollment for the same learner, programme and year | 0 |
| Enrollment ↔ group programme/level mismatches | 0 |
| Learners with two active group enrollments today | 0 (no Mise à niveau group exists) |
| "Former learner" set (rule F below) | **94** (Summer Camp 47, Other 16, Communication Adult 15, Communication Junior 13, Yearly 2, One-to-One 1); 11 have a legacy open balance (8,272 MAD); 0 attendance; 0 enrollment of any kind; 0 open CRM lead |
| Enrolled, no group, no active enrollment, live receipt since 2026-08-01 | 10, all Mise à niveau, all paid on legacy charges (current learners waiting for a group; level unknown) |
| Archived learners with an open enrollment | 3 (2 Confirmed with voided charges, 1 legacy Validated) |
| Inactive learners with an active enrollment | 0 (the one Inactive file has only a Rejected enrollment; DAT-6's "Confirmed Adults" remark no longer holds) |
| Current learners: a group or a Confirmed/Validated/Trial 2026/2027 enrollment | 95, plus the 10 Mise à niveau above = **105** |
| CRM leads CONVERTED | 1 (belongs to an archived learner; DAT-5, Batch E) |
| Assessments with a 0 component | 0 (feature unused) |

### Findings re-checked against `ba009b4`

All findings in scope are present as described by the verifiers: ACA-1 (no guard on `groups` for admin/director; check trigger runs on every enrollment update), DAT-1 (single `groupe_id`, sync picks the newest Validated), DAT-2 (36), ACA-4/DAT-3 (7 rows; silent unplacement for 1 learner; payment on the row fails), ACA-3 (sync flips status back; rosters ignore status), ACA-5 (`...form` whole-row update, no precondition, no programme/year on create), ACA-6 (capacity display-only for in-person), ACA-7 (inline cells write `groupe_id: null`), ACA-8 (archive leaves enrollments; no restore), ACA-2/DAT-6 (204 active; placement filter 127), FIN-10 (status line before the Other/legacy return; also documented as current behaviour in [README-enrollment-workflow](../../../scripts/README-enrollment-workflow.md), so changing it is a product decision, D3), ACA-9 (`parseFloat(x) || null`).

## Scope and non-goals

**In scope:** findings ACA-1, ACA-2, ACA-3, ACA-4, ACA-5, ACA-6, ACA-7, ACA-8, ACA-9, DAT-1, DAT-2, DAT-3, DAT-6, FIN-10; the data clean-up plan; the membership readers listed above.

**Not in scope** (other batches; noted where this plan touches the same object): FIN-1/DAT-5 review flag after a voided payment and receipt numbering (Batch E); `40001` retry behaviour (Batch C); teacher column projection, family links and teacher delete rights (Batch F, POR-1/ACC-1/ACC-2/ACC-3); Premium table removal (Release B); online-learning seat rules (unchanged, except what course close does to enrollments, decision D8); group "promotion" to a new level (D7: later); per-programme end dates and automatic leavers (D2-C, not recommended); student-list performance (Batch G).

## Design

### D-1 Target model

```text
group membership  :=  enrollment(student, group) with status in (Validated, Trial)
                      on a non-archived learner                     -- the only rule
students.groupe_id :=  "main group": derived by the database from the learner's
                      memberships, display and legacy-reader convenience only
students.status    :=  derived: Enrolled | Trial from active enrollments;
                      Alumni | Inactive only through the leaver/archive commands;
                      Prospect otherwise
```

- One private helper, `academic_security.is_group_member(p_student uuid, p_group uuid) returns boolean` (`stable`, SECURITY DEFINER, fixed `search_path`), and a set-returning `academic_security.group_member_ids(p_group uuid)`. The `academic_security` schema has **no USAGE for `anon` or `authenticated`** (like every `*_security` schema), so only SECURITY DEFINER code owned by the migration role can call them. Readers are split accordingly:
  - **SECURITY DEFINER readers** call the private helper directly: `attendance_student_in_group`, `teacher_can_access_student_group`, `can_message_recipient`, `storage_security.can_write`, `resolve_storage_asset` and every new command.
  - **Readers that run with the caller's rights** never reference `academic_security`: the `announcements audience read` policy calls a new **`public.my_member_group_ids()`** (`stable`, SECURITY DEFINER, fixed `search_path`, returns the groups of which the caller's own `get_visible_student_ids()` learners are members; EXECUTE revoked from `public`, `anon`, granted to `authenticated`; it reveals nothing beyond the caller's own learners); `search_students_page` (SECURITY INVOKER) uses inline SQL on `enrollments`, which its staff callers already read through RLS; the `remove_student_group` compatibility wrapper becomes SECURITY DEFINER with the same role check as `remove_learner_from_group`.
  - No general-purpose public "is this learner in that group" function is exposed (it would be an oracle for any signed-in user).
  - After M2 every database reader uses the helper or this inline rule. The app mirrors the same rule in `enrollmentWorkflow.mjs`.
- **New enrollment status `Ended`** (label "Terminée") with columns `ended_at timestamptz`, `ended_by uuid`, `end_reason text` (1–200 characters) and `ended_group_id uuid references groups(id) on delete restrict`. Ending moves `group_id` into `ended_group_id` and sets `group_id = NULL`. Why a status and a cleared group: every positive membership test (`status in ('Validated','Trial')`) and every online seat count (`group_id = G and status <> 'Rejected'`) then excludes ended rows **without being rewritten**, so the change fails closed; the history of which group the learner left stays on the row and in attendance.
- **Main group** (`groupe_id`): among the learner's memberships, keep the current `groupe_id` if it is still a membership; otherwise prefer the membership whose programme equals `students.session_type`, then `Yearly`, then Validated before Trial, then the oldest `created_at`, then `id`. `students.session_type` and `niveau_cefr` copy the main membership's group programme and level whenever a main group exists, and are free (the "intended programme" of a prospect) when none exists.

### D-2 Invariants (database-enforced)

| # | Invariant | Mechanism |
| --- | --- | --- |
| I1 | Validated/Trial ⇒ `group_id` not null; `Ended` ⇔ `ended_at` not null, and `Ended` ⇒ `group_id` null | CHECK constraints `enrollments_active_requires_group`, `enrollments_ended_shape` (added NOT VALID in M1, validated in M2) |
| I2 | `students.groupe_id` is null or a membership of that learner | Only the sync writes it (guard trigger); M2 asserts it for every row before switching readers |
| I3 | At most one non-Rejected, non-Ended enrollment per (learner, programme, school year) | Partial unique index `enrollments_one_active_programme_year` on `(student_id, session_type, school_year) where status not in ('Rejected','Ended') and session_type is not null and school_year is not null` (M1; 0 duplicates today). Every command and `save_receptionist_enrollment` pre-checks it and re-raises a `23505` on this index as `PT409`, hint `egc.duplicate_enrollment`, message "Une inscription active existe déjà pour ce programme et cette année." Online programmes per D8 |
| I4 | Membership group and enrollment agree on programme and level | Existing check, **evaluated only on INSERT or when `group_id`, `session_type` or `level` changes** (so an untouched row never blocks a payment) |
| I5 | A group's programme/level cannot change while any non-Rejected enrollment (or, until M2, a non-archived learner file) references it | New BEFORE UPDATE OF `session_type, niveau` trigger `groups_membership_level_guard` on `groups`, all roles; SQLSTATE `23514`, French message |
| I6 | In-person capacity: distinct learners with a non-Rejected enrollment in the group ≤ `capacite_max` at group assignment | New BEFORE INSERT / UPDATE OF `group_id, status` trigger `enrollment_group_capacity`, same "assignment only, never a status transition" rule and advisory lock key style as 117; online groups skipped (117 governs them); override per D4 |
| I7 | Status `Enrolled` ⇔ an active Confirmed/Validated enrollment; `Trial` ⇔ only Trial; `Alumni`/`Inactive` only via leaver/archive and only with no active enrollment | Sync derivation + `students_membership_guard` trigger |
| I8 | An archived learner has no active enrollment | `soft_delete_student` ends them in the same transaction |
| I9 | Programme and school year are set on every Confirmed/Validated/Trial enrollment | CHECK `enrollments_confirmed_has_programme` (NOT VALID in M1; validated in M2). Submitted/Under Review may stay without them (public form and parent re-enrollment insert none); `Ended` and `Rejected` keep whatever they had, so historical rows without a programme (the 7 legacy rows) can be closed |
| I10 | `Ended` rows are history: they are changed (reopened) or deleted only by the commands; Trial/Confirmed/Validated rows are deleted only by the commands | Guard trigger `enrollments_history_guard` (BEFORE UPDATE OR DELETE on `enrollments`) refuses, unless the transaction-local `eh.enrollment_command` is `on` (set only by the D-4 cores and the clean-up cores): any UPDATE of an `Ended` row other than `notes`; any change to or from `Ended`; any DELETE of a Trial, Confirmed, Validated or Ended row. Direct DELETE of Submitted, Under Review and Rejected rows stays allowed (pre-enrollment housekeeping) |

"Active enrollment" below means status in (Submitted, Under Review, Confirmed, Validated, Trial); "membership" means Validated or Trial with a group.

### D-3 Sync redesign (M1)

`sync_student_from_enrollments(p_student, p_force_downgrade, p_previous_group)` is re-created from its 074 body:

1. Lock the learner row (unchanged) and set the transaction-local flag `set_config('eh.membership_sync','on',true)` around its own update, then reset it.
2. **Status:** Enrolled if any Confirmed/Validated; else Trial if any Trial; else, if the transaction-local `eh.leaver_status` is `Alumni` or `Inactive` (set only by the leaver/archive core), that value; else the 074 mapping with the 074 `p_force_downgrade` rule (Rejected→Inactive, Submitted/Under Review→Prospect, and a current Enrolled/Trial/Alumni/Inactive kept when not forced). An Inactive/Alumni learner therefore stays so until a new Confirmed/Validated/Trial enrollment appears (ACA-3).
3. **Main group** per D-1. **M1 transition rule:** if the learner has no membership and the current `groupe_id` is not backed by any enrollment (the 36), keep it unless `p_force_downgrade` and it equals `p_previous_group` (074 behaviour). **M2** removes that branch: no membership ⇒ `groupe_id = NULL`.
4. A legacy Validated row without group is never a candidate for the main group, so it can no longer clear a learner's group (ACA-4 silent unplacement fixed in M1).
5. The 074 early return at `pg_trigger_depth() > 1` is **removed**. It existed to stop the enrollment→student→enrollment ping-pong with `sync_enrollments_from_student`, which this plan drops; no trigger on `students` writes `enrollments` any more, so recursion is impossible, and keeping the guard would hide I2 violations for enrollment writes made from inside another trigger. A test asserts that a nested enrollment write (from a trigger) still updates the main group.

`enforce_enrollment_student_sync` (072) is re-created only to pass `force_downgrade` for `Ended` the same way as for other non-active targets. `check_enrollment_student_sync` (072) is re-created with I4's narrowing and with the I1 shape rules for `Ended`.

The 074 trigger `student_enrollment_assignment_sync` and its function `sync_enrollments_from_student` are **dropped**. They are replaced by `students_membership_guard` (BEFORE INSERT OR UPDATE OF `groupe_id, session_type, niveau_cefr, status` on `students`), which, unless `eh.membership_sync` is `on`, compares old and new values with `IS DISTINCT FROM` (so a whole-row save that leaves these columns unchanged still succeeds):

- refuses any change of `groupe_id` and any INSERT with a non-null `groupe_id` ("Affectez le groupe depuis l'inscription", `23514`);
- refuses a change of `session_type`/`niveau_cefr` while the learner has a membership ("Le programme et le niveau suivent le groupe ; modifiez l'inscription");
- refuses a manual change to `Alumni`/`Inactive` while an active enrollment exists ("Utilisez « Ancien apprenant »"), and (D3-A) a manual change to `Enrolled`/`Trial` without an active Confirmed/Validated/Trial enrollment; INSERT with `Enrolled`/`Trial` is coerced to `Prospect` (so old clients and imports keep working).

### D-4 Commands (M1)

All are SECURITY DEFINER, `set search_path = pg_catalog, pg_temp`, check the stored role (`get_my_role()` or `operational_security.require_capability`), lock the learner row first, then enrollments, then the group (advisory `group:seats:<id>`), the same order as the payment wrapper (see D-5), take explicit `updated_at` preconditions and raise stale errors with SQLSTATE **`PT409`** and HINT `egc.stale` (ADR-009, Plan C: deterministic conflicts are HTTP 409 and never retried; never `40001`). The other conflict-type refusals introduced here use the same SQLSTATE with their own stable hints: `close_school_year` count mismatch → `egc.stale`; a concurrent duplicate on the I3 index (`23505`, caught and re-raised) → `egc.duplicate_enrollment`. Each public command wraps a private core in `academic_security` that the clean-up calls with a null actor.

| Command | Who | Behaviour |
| --- | --- | --- |
| `place_learner_in_group(p_student, p_group, p_enrollment uuid default null, p_school_year text default null, p_student_updated_at, p_enrollment_updated_at default null, p_capacity_override_reason text default null) returns uuid` | director, admin, receptionist (existing `assign_group` capability, 096) | If `p_enrollment` is given: it must be the learner's, match the group programme/level (or have null level), be Confirmed/Validated/Trial/Submitted/Under Review; sets `group_id` (Confirmed→Validated via the existing trigger). If not given: uses the learner's single active enrollment for the group's programme and year, or creates a **Validated** one (`session_type` = group programme, `level` = group level, `school_year` = `p_school_year` or the group's `annee` converted from `YYYY-YYYY`, refused if neither is valid). Never touches enrollments of other programmes (DAT-1). Capacity per I6; override only for director/admin with a reason (D4-A), logged to `activity_log`. Returns the enrollment id. |
| `remove_learner_from_group(p_student, p_group, p_enrollment uuid default null, p_student_updated_at, p_enrollment_updated_at default null)` | same | 074 semantics (Validated→Confirmed, Trial→Under Review) on exactly one membership; replaces `remove_student_group`, which becomes a thin wrapper kept for compatibility until the app no longer calls it. |
| `end_learner(p_student, p_student_updated_at, p_final_status text, p_reason text, p_enrollments uuid[] default null)` | director, admin (D2) | Ends the selected active enrollments (default: all) with the reason; if no active enrollment remains, sets `Alumni` ("A terminé son programme") or `Inactive` ("A arrêté en cours de route") through `eh.leaver_status`. Does not touch charges, receipts or attendance. Returns the open balance so the UI can show it. |
| `close_school_year(p_school_year text, p_expected_count integer, p_reason text)` | director (D2-B) | Ends every active enrollment of `p_school_year`; learners with no remaining active enrollment become `Alumni`. Refuses if the live count differs from `p_expected_count` (the screen shows the count first). |
| `reopen_enrollment(p_enrollment, p_expected_updated_at)` | director, admin | `Ended` → `Confirmed` without group (then normal placement); refused by I3 if another active enrollment exists for the programme/year. |
| `soft_delete_student` (re-created from 041) | director, admin (unchanged; `archive_students` capability) | Ends active enrollments (reason "Dossier archivé", `Inactive`) then sets `deleted_at`, in one transaction (D2/ACA-8). |
| `restore_student(p_student)` and `list_archived_students(p_page, p_page_size)` | director (D2) | Clears `deleted_at`; enrollments stay Ended; then runs `sync_student_from_enrollments` so status and main group are recomputed (normally `Inactive`, no group). The list returns id, name and archive date only. |
| `save_enrollment_changes(p_enrollment, p_expected_updated_at, p_changes jsonb) returns uuid`, and `create_enrollment(p_student, p_changes jsonb)` | director, admin | ACA-5: allow-listed keys only (`status` among Submitted/Under Review/Trial/Rejected, `level`, `date_inscription`, `notes`, `session_type`/`school_year` only while still null); group changes go through placement; Confirmed/Validated/Ended transitions only through payment, placement and the leaver commands. Create requires programme and school year. |

Re-created to use the core (identical signatures and grants, line diffs recorded): `assign_receptionist_student_group` (096) calls `place_learner_in_group`/`remove_learner_from_group` cores, so a call without an enrollment now creates a Validated enrollment instead of writing `groupe_id`; `save_receptionist_enrollment` (117) keeps its body, and its group assignment passes through the new capacity trigger like every path; `save_receptionist_student` (096) creates files as `Prospect` (D3-A); `save_receptionist_group` (096) is unchanged (I5 now covers every role).

### D-5 Payment (`create_charge_payment`, re-created from 096)

- **D3-A:** delete the unconditional `update public.students set status = 'Enrolled'`; status follows the enrollment the payment confirms. Other/legacy receipts change no status. The `student_enrolled` result key becomes `true` only when an enrollment is Confirmed/Validated afterwards (the receipt UI reads it; adjust the toast).
- **Implicit branch (no linked or selected enrollment):** before inserting, look for the learner's single active enrollment with the charge's programme and school year (`school_year` equal, or both null) that is not CRM-linked; if exactly one, use it as if selected; if more than one, refuse with "Plusieurs inscriptions correspondent. Sélectionnez l’inscription à payer." (`22023`); otherwise insert as today. This prevents I3 violations and removes the DAT-2 "false awaiting placement" row. The CRM guard query also ignores `Ended`.
- Paying a charge linked to an `Ended` enrollment (old balance) keeps it Ended and changes no status.
- **Lock order:** the wrapper locks the learner row (`v_charge.student_id`) before it selects or updates any enrollment, including the new implicit-branch lookup, and before the inner financial call when the payload names the learner (as 096 already does). Commands use the same learner → enrollment → group order, so a payment and a placement for the same learner serialize instead of deadlocking (test below).
- Coordinate with Batch E: [Plan E (PR #152, PCR)](https://github.com/elforssa/english-hills-admin/pull/152) governs the order of the payment checks and receipt numbering. It does **not** reorder the checks, because its gap-free counter is released on rollback. This plan neither reorders nor renumbers anything in `create_charge_payment`; it changes only the status line, the implicit-branch lookup, the CRM-guard `Ended` exclusion and the lock order described above. The later of the two PRs rebuilds from the other's merged body (stop condition).

### D-6 CRM (D5)

With D5-A, two functions are re-created with minimal line changes and an unchanged-elsewhere proof (as the online plan did for `crm_start_enrollment`): `crm_security.evaluate_conversion` (084) treats `Ended` reached from Confirmed/Validated as a completed conversion (no review flag); `crm_start_enrollment` (117) treats `Ended` like `Rejected` in its three "existing enrollment" checks (lines 132, 146, 147), so a returning learner's new lead creates a new enrollment. With D5-B nothing in the CRM changes: ending a converted learner flags review, and the CRM asks staff to select the ended enrollment.

### D-7 Readers switched to enrollments only (M2)

Re-created from their latest definitions, replacing `groupe_id` membership with the helper (SECURITY DEFINER readers) or the caller-rights rule of D-1:

- `attendance_student_in_group` (063): membership, **or** an `Ended` enrollment of that learner with `ended_group_id` = the group and a session date before the Casablanca date of `ended_at`, so a leaver's past attendance can still be corrected;
- `teacher_can_access_student_group` (071): membership only (the `Enrolled/Trial` status condition becomes redundant because ended learners are not members);
- `can_message_recipient` (069);
- `resolve_storage_asset` teacher branch (latest body [096](../../../supabase/migrations/096_receptionist_operational_permissions.sql) line 982, which carries the receptionist branch; Premium Release B may re-create it first, so rebuild from whichever is newest, never from 052);
- `storage_security.can_write` teacher portfolio branch (latest body 096 line 938; same Premium Release B caveat), so the teacher of a learner's second-programme group can upload portfolio items as well as read them;
- policy `announcements audience read` (024): parents/students see group announcements for every group in `public.my_member_group_ids()`;
- `search_students_page` (097): group name = main group plus `extra_group_count`; "Groupe à affecter" for every role = a Confirmed enrollment without group **or** an Enrolled/Trial learner with no membership and no Submitted/Under Review/Confirmed enrollment; the default status filter drops `Alumni` (`Enrolled`, `Trial` only).

Untouched: `crm_find_student_candidates` and `log_activity` (display/scrub only, main group is fine); online roster and seat functions (already enrollment-based). Per D8 = A, `online_close_course` (118) is re-created (see D-6b).

### D-6b Online courses (D8 = A)

I3 allows one live enrollment per programme per school year. Online courses are term-based (`online_courses.term_start`/`term_end`), and `online_close_course` ([118](../../../supabase/migrations/118_online_close_course_room_ref.sql)) closes the course and revokes join passes but leaves the enrollments Confirmed/Validated, so a learner on a closed course would stay a member and `Enrolled`, and a second `Online` course in the same school year would hit the I3 index.

- **Design (D8 = A, owner 2026-10-24):** `online_close_course` is re-created from its 118 body with one addition: in the same transaction it ends every active enrollment of the course's group through the leaver core (reason "Cours en ligne clôturé"; final status `Alumni` for learners left with no active enrollment, as for a completed programme). The learner can then take another online course the same year (a new enrollment, allowed by I3). Join, seat and capacity logic are unchanged.
- **Rejected alternative (D8-B):** exclude `Online` and `Online One-to-One` from the I3 index predicate and leave 118 untouched, so learners of closed courses stay `Enrolled` and members until management uses "Ancien apprenant". Not chosen; not to be implemented.
- Every insert path re-raises an I3 `23505` as `PT409` / `egc.duplicate_enrollment` with the French message in D-2.

### D-8 Application changes per screen

| Screen / module | Change |
| --- | --- |
| [enrollmentWorkflow.mjs](../../../src/lib/enrollmentWorkflow.mjs) | `groupMemberIds` keeps the union (`groupe_id` or Validated/Trial enrollment, archived learners excluded) in the R2 release; after C6, I2 makes the union equal to enrollment-only membership, so no app deploy is needed at R5; the R6 closeout PR may simplify it to enrollment-only; `studentNeedsGroup` = Confirmed ungrouped enrollment, or active learner with no membership and no pending enrollment; `importedStudentStatus` default `Prospect` (D3-A); new `ACTIVE_STUDENT_STATUSES = ['Enrolled','Trial']`, `currentSchoolYear(date)` (Casablanca, September start). |
| [groups/page.jsx](../../../src/app/(admin)/groups/page.jsx) | Session/Level selects disabled when the group has members (count from the same helper), with the French hint; error from I5 shown in French; default `annee` = current school year; deleting a group that has enrollment history (including `ended_group_id`, `ON DELETE RESTRICT`) shows "Ce groupe a un historique d’inscriptions : il ne peut pas être supprimé." instead of the raw foreign-key error. |
| [groups/[id]/page.jsx](../../../src/app/(admin)/groups/[id]/page.jsx) | `addToGroup`/`removeFromGroup` call `place_learner_in_group`/`remove_learner_from_group` for every role (receptionist keeps its RPC); "Ajouter" disabled when full, or an override reason dialog for director/admin (D4-A); picker lists learners not yet members of **this** group, including members of other programmes' groups; Téléphone column untouched here (Batch F). |
| [students/page.jsx](../../../src/app/(admin)/students/page.jsx) | Inline programme/level cells read-only when the learner has a membership (link to the learner file); otherwise they write `session_type`/`niveau_cefr` only (never `groupe_id`); group column shows main group and "+N"; status filter options unchanged, default list = Enrolled/Trial. |
| [students/[id]/page.jsx](../../../src/app/(admin)/students/[id]/page.jsx) | "Groupe principal"; per-enrollment group and status (including "Terminée" with reason and date); management actions "Ancien apprenant" (dialog: reason, final status, enrollments to end, open balance shown) and "Rouvrir l'inscription"; archive dialog states that active enrollments will be ended. |
| [StudentForm.jsx](../../../src/components/students/StudentForm.jsx) | Remove the free status select and the "Groupe assigné" select from edit; create starts as `Prospect` and may optionally place the learner by calling `place_learner_in_group` after creation (programme, level, group, school year). |
| [ReceptionistStudentForm.jsx](../../../src/components/students/ReceptionistStudentForm.jsx) | Created learners show as Prospect until placed or enrolled (server change only). |
| [EnrollmentModal.jsx](../../../src/components/students/EnrollmentModal.jsx) | Admin/director create via `create_enrollment` with required Session and Année scolaire; edit via `save_enrollment_changes` with changed fields only and the loaded `updated_at`; group assignment via `place_learner_in_group`; stale error → "Cette inscription a changé, rechargez". Reception path unchanged. |
| [enrollments/page.jsx](../../../src/app/(admin)/enrollments/page.jsx) | Uses the modal changes; "Terminée" label and filter. `handleValidate` (line 56) calls `save_enrollment_changes` (Submitted/Under Review/Trial → Validated only when the row already has a matching group) or `place_learner_in_group` when no group is set; `handleReject` (line 87) calls `save_enrollment_changes` with `Rejected`; `handleDelete` (line 92) stays a direct delete, which I10 limits to Submitted/Under Review/Rejected rows, with the French refusal shown otherwise. |
| [students/import/page.jsx](../../../src/app/(admin)/students/import/page.jsx) | Default and `Enrolled`/`Trial` rows import as `Prospect` with a notice (D3-A); `Alumni`/`Inactive` kept; no group column. |
| [dashboard/page.jsx](../../../src/app/(admin)/dashboard/page.jsx) | Active = `Enrolled`, `Trial`. |
| [AcademicOperationsReport.jsx](../../../src/components/reports/AcademicOperationsReport.jsx) | Active set without `Alumni`; members via the shared helper. |
| [attendance/page.jsx](../../../src/app/(admin)/attendance/page.jsx), [teacher-portal/page.jsx](../../../src/app/(admin)/teacher-portal/page.jsx) | Roster, counts and the Learning tab filter via `groupMemberIds`. |
| [students-directory/page.jsx](../../../src/app/(admin)/students-directory/page.jsx), [dismissal/page.jsx](../../../src/app/(admin)/dismissal/page.jsx) | Main group label; dismissal list = members of any group (Enrolled/Trial) instead of `status = 'Enrolled'` only. |
| [assessments/page.jsx](../../../src/app/(admin)/assessments/page.jsx) | ACA-9: `value === '' ? null : Number(value)` for each component and for the inputs; learner list filtered to the chosen group's members. |
| [presentation.mjs](../../../src/lib/ui/presentation.mjs) | `ENROLLMENT_LABELS.Ended = 'Terminée'`. |
| Receipt form | Toast reflects `student_enrolled` only when an enrollment was confirmed. |
| New `src/lib/academic/membershipActions.mjs` | Thin RPC wrappers and French error mapping (capacity, I5, I7 guard messages); `PT409` with `egc.stale` or `egc.duplicate_enrollment` goes through the shared `isRecordConflict` helper (ADR-009) and shows "Cette inscription a changé, rechargez" / the duplicate message. |

### D-9 Security boundaries

- No new table grant. New commands: EXECUTE revoked from `public`, `anon`; granted to `authenticated`; role checked inside. `academic_security` schema: no usage for any API role; `public.my_member_group_ids()` is the only new caller-rights entry point (see D-1).
- Reader re-creations only narrow access (membership is a subset of today's union once I2 holds). Tests assert that a teacher, a parent and a student see exactly the expected learner ids, groups and announcements before and after a leaver and a second-programme placement.
- Capacity override and leaver actions write `activity_log` entries (actor, learner id, group id, reason) without contact data.
- `SECURITY_RULES.md` gains one line: group membership derives from enrollments; the learner-file group is database-maintained.

## Migration approach

- **M1 `XXX_enrollment_group_consistency.sql`** (forward-only, additive except the dropped 074 trigger/function): status check + columns + NOT VALID checks (I1, I9) + partial unique index (I3, pre-checked) + `academic_security` schema and helpers + `maintenance.egc_cleanup_log` (private schema, no API grant: `step`, `entity`, `row_id`, `before jsonb`, `after jsonb`, `at`) + re-created sync/check/enforce + dropped 074 trigger and function + `students_membership_guard` + `groups_membership_level_guard` + `enrollment_group_capacity` + commands in D-4 + re-created `create_charge_payment`, `assign_receptionist_student_group`, `save_receptionist_student`, `save_receptionist_enrollment` (117 body plus the I3 pre-check), `soft_delete_student`, `remove_student_group` (definer wrapper) (+ D5-A CRM functions, + D8-A `online_close_course`) + `enrollments_history_guard` + `public.my_member_group_ids()` + `notify pgrst, 'reload schema'`. Readers keep the union.
- **M2 `XXX_enrollment_group_consistency_enforce.sql`**: first a DO block that raises (and changes nothing) if any non-archived learner has a `groupe_id` that is not a membership, if any Validated/Trial row lacks a group, if any Confirmed/Validated/Trial row lacks a programme or a school year (I9), if any `Ended` row breaks the Ended shape (I1: `ended_at` set, `group_id` null), or if any archived learner has an active enrollment; then `VALIDATE CONSTRAINT` for I1/I9, the strict sync (D-3 step 3), and the reader re-creations of D-7 (including `storage_security.can_write`).
- Every re-created object starts from its **latest cumulative definition at implementation time** (sources named above; re-check `origin/main` and the open PRs of Batches C, E, F and Premium Release B). The PR records, per function, the unified diff against that source.
- Numbers are chosen just before merge from the ledger and open PRs; the upgrade-test ledger ceilings move with them.

## Data cleanup plan (separate Production step; not run)

**Preconditions:** M1 applied and the application deployed; a fresh database backup confirmed; the owner has approved this step and its counts (D6); a reception-quiet window. The operator re-runs every dry-run query below on the day; **any count that differs from the approved number stops the step** for a new approval. The step runs as one transaction per stage through the private cores (null actor, reason text), each change logged in `maintenance.egc_cleanup_log` with before/after images (ids and statuses only, no names). Outputs reported to the owner are counts only.

Shared definitions (`s` = non-archived learners):

```sql
-- membership-backed group
--   exists(select 1 from enrollments e where e.student_id=s.id and e.group_id=s.groupe_id and e.status in ('Validated','Trial'))
-- rule F (former learner): s.status in ('Enrolled','Trial','Alumni') and s.groupe_id is null
--   and no enrollment in ('Submitted','Under Review','Trial','Confirmed','Validated')
--   and no live receipt (voided_at is null and deleted_at is null) with date >= '2026-08-01'
```

| Stage | Rule | Expected (2026-10-24) | Action |
| --- | --- | --- | --- |
| C1 Back-fill Yearly memberships | Non-archived learners with a group and no membership on it | 36 | Insert a **Validated** enrollment: `group_id = groupe_id`, `session_type`/`level` = the group's, `school_year = '2026/2027'` (all 8 groups are 2026-2027), `date_inscription` = earliest live receipt date of a Yearly charge on or after 2026-06-01, else the file's creation date (Casablanca), note "Rattrapage EGC". Link the learner's single unlinked non-legacy Yearly 2026/2027 charge (12) through `charges.enrollment_id`. Legacy charges stay unlinked. Order: C1 runs before C2 for the 1 learner whose only enrollment is legacy. |
| C1b Missing school year | Confirmed/Validated/Trial enrollment with a group and a null programme or school year | 1 (Validated, Yearly, on its learner's 2026-2027 file group, no charge linked) | Set `school_year = '2026/2027'` (and `session_type` from the group if null). Without this, M2's I9 validation fails and the payment's implicit branch would not find the row; until C1b runs, edits of that row are refused by the NOT VALID I9 check. |
| C2 Legacy Validated rows | `status='Validated' and group_id is null` | 7 | All 7 → `Ended`, reason "Inscription historique sans groupe" (I9 does not apply to `Ended`, so their null programme and year are kept). Before ending the grouped learner's row, the core asserts that the learner's C1 membership exists (else the stage stops). The 5 past-programme learners join C3; the archived one is C4's. |
| C3 Former learners | Rule F, plus the 5 C2 learners | 94 + 5 = 99 | Final status `Alumni` (D6; or `Inactive` if you prefer). No enrollment to end except C2's. 11 of them keep legacy open balances (8,272 MAD); nothing financial changes. |
| C4 Archived learners | Archived with an active enrollment | 3 (1 is the archived legacy row already ended in C2, so 2 remain) | End with reason "Dossier archivé". CRM untouched (Batch E owns DAT-5's review flag). |
| C5 Mise à niveau waiting list | Enrolled, no group, no active enrollment, programme Mise à niveau, live receipt since 2026-08-01 | 10 | Insert a **Confirmed** Mise à niveau 2026/2027 enrollment without group or level, note "Rattrapage EGC: payé sur reçu historique". Not linked to legacy charges. They appear in "Groupe à affecter". |
| C6 Checks | — | — | Assertions below, then M2 may be applied. |

**Dry-run queries (read-only; run before and after; expected values in comments):**

```sql
-- C1: 36
select count(*) from students s where s.deleted_at is null and s.groupe_id is not null
  and not exists(select 1 from enrollments e where e.student_id=s.id and e.group_id=s.groupe_id and e.status in ('Validated','Trial'));
-- C1 charge links: 12, and 0 learners with more than one candidate charge
select count(*) filter (where n=1), count(*) filter (where n>1) from (
  select s.id, (select count(*) from charges c where c.student_id=s.id and c.voided_at is null and not c.legacy
    and c.session_type='Yearly' and c.school_year='2026/2027' and c.enrollment_id is null) n
  from students s where s.deleted_at is null and s.groupe_id is not null
    and not exists(select 1 from enrollments e where e.student_id=s.id and e.group_id=s.groupe_id and e.status in ('Validated','Trial'))) x where n>0;
-- C1 safety: 0 group/file programme or level mismatches among the 36
select count(*) from students s join groups g on g.id=s.groupe_id where s.deleted_at is null
  and not exists(select 1 from enrollments e where e.student_id=s.id and e.group_id=s.groupe_id and e.status in ('Validated','Trial'))
  and (g.session_type is distinct from s.session_type or g.niveau is distinct from s.niveau_cefr);
-- C1 existing enrollments (added by the implementation review, DS1): among the 36, learners who already
-- hold a live enrollment of the group's programme and year (for example a payment made between M1 and the
-- clean-up). Expected 0 at sizing. C1 places a single Confirmed one without group (first column) instead of
-- inserting; any other case (second column) stops the stage for a decision. C1b and C5 stop the same way
-- when the row they would write collides with a live enrollment of the same programme and year.
select count(*) filter (where live=1 and placeable), count(*) filter (where live>0 and not (live=1 and placeable)) from (
  select s.id, count(e.id) live, bool_and(e.status='Confirmed' and e.group_id is null and (e.level is null or e.level=g.niveau)) placeable
  from students s join groups g on g.id=s.groupe_id
  join enrollments e on e.student_id=s.id and e.session_type=g.session_type and e.school_year=replace(g.annee,'-','/')
    and e.status not in ('Rejected','Ended')
  where s.deleted_at is null
    and not exists(select 1 from enrollments m where m.student_id=s.id and m.group_id=s.groupe_id and m.status in ('Validated','Trial'))
  group by s.id) x;
-- C1b: 1
select count(*) from enrollments e where e.status in ('Confirmed','Validated','Trial') and e.group_id is not null
  and (e.session_type is null or e.school_year is null);
-- C1b collision (re-review): rows C1b would give a year that the learner already holds live for that
-- programme. Expected 0; C1b stops with P0001 otherwise.
select count(*) from enrollments e join groups g on g.id=e.group_id
where e.status in ('Confirmed','Validated','Trial') and (e.session_type is null or e.school_year is null)
  and exists(select 1 from enrollments x where x.student_id=e.student_id and x.id<>e.id and x.status not in ('Rejected','Ended')
    and x.session_type=coalesce(e.session_type,g.session_type) and x.school_year=coalesce(e.school_year,replace(g.annee,'-','/')));
-- I9 after C1b and C2: 0
select count(*) from enrollments e where e.status in ('Confirmed','Validated','Trial')
  and (e.session_type is null or e.school_year is null);
-- C2: 7 (6 non-archived; 1 learner holds a group)
select count(*), count(*) filter (where st.deleted_at is null), count(*) filter (where st.groupe_id is not null)
from enrollments e join students st on st.id=e.student_id where e.status='Validated' and e.group_id is null;
-- C3 rule F: 94 (+5 from C2 handled together)
select count(*) from students s where s.deleted_at is null and s.status in ('Enrolled','Trial','Alumni') and s.groupe_id is null
  and not exists(select 1 from enrollments e where e.student_id=s.id and e.status in ('Submitted','Under Review','Trial','Confirmed','Validated'))
  and not exists(select 1 from receipts r where r.student_id=s.id and r.voided_at is null and r.deleted_at is null and r.date>='2026-08-01');
-- C4: 3
select count(*) from enrollments e join students st on st.id=e.student_id
where st.deleted_at is not null and e.status in ('Submitted','Under Review','Confirmed','Validated','Trial');
-- C5: 10
select count(*) from students s where s.deleted_at is null and s.status='Enrolled' and s.groupe_id is null and s.session_type='Mise à niveau'
  and not exists(select 1 from enrollments e where e.student_id=s.id and e.status in ('Confirmed','Validated','Trial'))
  and exists(select 1 from receipts r where r.student_id=s.id and r.voided_at is null and r.deleted_at is null and r.date>='2026-08-01');
-- C5 collision (re-review): C5 learners who already hold a live Mise à niveau 2026/2027 enrollment
-- (Submitted or Under Review). Expected 0; C5 stops with P0001 otherwise.
select count(*) from students s where s.deleted_at is null and s.status='Enrolled' and s.groupe_id is null and s.session_type='Mise à niveau'
  and not exists(select 1 from enrollments e where e.student_id=s.id and e.status in ('Confirmed','Validated','Trial'))
  and exists(select 1 from receipts r where r.student_id=s.id and r.voided_at is null and r.deleted_at is null and r.date>='2026-08-01')
  and exists(select 1 from enrollments e where e.student_id=s.id and e.session_type='Mise à niveau' and e.school_year='2026/2027'
    and e.status not in ('Rejected','Ended'));
-- I3 pre-check for M1's unique index: 0
select count(*) from (select student_id,session_type,school_year from enrollments where status<>'Rejected'
  and session_type is not null and school_year is not null group by 1,2,3 having count(*)>1) d;
```

**C6 expected after the step:** 0 unbacked file groups; 0 Validated/Trial without group; 0 archived learners with an active enrollment; `Enrolled`+`Trial` = 105 (204 − 99); "Groupe à affecter" = 28 (18 + 10); group headcounts unchanged (83 members in the 8 groups); 0 enrollment/group mismatches; 0 Confirmed/Validated/Trial rows without programme or school year (I9); every `Ended` row has `ended_at` set and `group_id` null (I1); so M2's refusal block passes and its validation succeeds.

**Reversal:** `academic_security.revert_cleanup(stage)` (private, in M1) replays the before-images in reverse order inside one transaction with `eh.membership_sync` set, deleting the inserted rows and restoring statuses, charge links and file groups. It is tested in CI on synthetic data and used only with owner approval.

**Owner approval step:** the operator presents the seven counts (C1, C1b, C2, C3, C4, C5 and the C1 charge links), the 11 open-balance cases (count and total only) and the choice Alumni/Inactive; the owner approves the exact numbers in writing; only then does the operator run C1–C6. No list of names is exported or committed; if the owner wants to review individual learners before C3, the operator shows them on screen from the admin app's filtered list, not in a file.

## Test strategy

Local Supabase and synthetic data only; CI runs the database suites (`npm run test:...` and the `verify.yml` local-database job).

- **New SQL suite** `scripts/test-enrollment-group-consistency.sql` (rollback-only, wired into `verify.yml`):
  - DAT-1: learner in a Yearly group (with and without a Yearly enrollment before M2 semantics) placed into a Mise à niveau group through every path (group page RPC, enrollment modal, reception RPC, CRM start with a group, payment then placement): both rosters, attendance checks on both groups, teacher access for both teachers, announcements for both groups; main group stays Yearly; file programme/level unchanged.
  - ACA-1: admin/director/receptionist cannot change a populated group's programme or level (`23514`); can after the last member leaves; a payment on a Validated enrollment succeeds when an unrelated column of the group changed, and when a pre-existing mismatch is seeded with triggers disabled (I4 narrowing).
  - DAT-2: placing without an enrollment creates a Validated enrollment; INSERT of a learner with `groupe_id` refused; direct `groupe_id` update refused for every role; payment on an unlinked charge reuses the single active enrollment of that programme/year, refuses with two, inserts with none.
  - ACA-4: a legacy Validated row without group never clears the main group on later inserts, deletes or rejections.
  - ACA-3/ACA-2: `end_learner` removes the learner from rosters, attendance, teacher and parent visibility; status stays Alumni/Inactive through an Other payment, a legacy payment, a payment on the ended enrollment's charge and an unrelated enrollment edit; a new Confirmed enrollment makes the learner Enrolled; manual Alumni/Inactive with an active enrollment refused; `close_school_year` count precondition.
  - ACA-5: `save_enrollment_changes` stale precondition (`PT409`, hint `egc.stale`), allow-list, no status regression from Confirmed, programme/year required on create.
  - ACA-6: capacity at assignment through every path including reception and the CRM; status-only transitions (payment, Trial→Validated) never raise; override only for director/admin with a reason; online groups still governed by 117 only; concurrent placements serialized by the advisory lock (two sessions, `dblink` or the existing two-connection pattern).
  - ACA-7: changing programme/level of a member refused; of a non-member allowed.
  - ACA-8: archive ends active enrollments; restore keeps them Ended; archived learners never members.
  - FIN-10 (D3-A): Other and legacy receipts change no status; tuition receipts confirm via enrollment.
  - I3 unique index; `Ended` shape; reopen; CRM D5 behaviour (no review flag on Ended with A; new lead creates a new enrollment).
  - Cleanup: a synthetic copy of each Production pattern (dossier-only member with attendance, legacy Validated rows **with null programme, school year and group**, a grouped Validated Yearly row **with a null school year**, former learner with legacy balance, archived with Confirmed, Mise à niveau paid on legacy) runs C1, C1b, C2–C6 through the cores with the M1 NOT VALID constraints active, checks C6, applies M2's refusal block, then `revert_cleanup` restores the exact before-state.
  - Readers that run with the caller's rights, as each role (director, admin, receptionist, teacher, parent, student, pending): the announcements policy (a parent sees announcements for both groups of a two-programme child, none for a leaver's former group), `search_students_page` (no "permission denied for schema"), the `remove_student_group` wrapper, `public.my_member_group_ids()` (returns only the caller's own learners' groups; empty for staff without linked learners).
  - Storage: the teacher of a learner's second-programme group can reserve and resolve a portfolio asset (`can_write`, `can_insert_reserved_object`, `resolve_storage_asset`); after the learner leaves, both refuse; the receptionist branch of `resolve_storage_asset` (096) is unchanged.
  - Online (D8 = A): two online courses for the same learner in one school year: closing the first ends its enrollments (reason "Cours en ligne clôturé"; learner `Alumni` if nothing else is active) and the second enrollment then succeeds; before the close, the second is refused; a duplicate live enrollment for the same programme/year returns `PT409` / `egc.duplicate_enrollment` with the French I3 message, not a raw `23505`; seat and capacity behaviour of 117 unchanged.
  - Attendance after a leaver: correcting a row dated before `ended_at` succeeds; a new row dated after `ended_at` is refused.
  - `restore_student`: clears `deleted_at`, enrollments stay Ended, sync recomputes status (`Inactive`) and main group (none).
  - I10: direct DELETE of Trial/Confirmed/Validated/Ended rows and direct UPDATE of an Ended row refused for admin/director; DELETE of Submitted/Under Review/Rejected allowed; commands still work.
  - Lock order: two sessions, one paying a charge of a learner while the other places the same learner in a group (both orders); both complete or one waits, no deadlock (`40P01`) and no `40001`.
  - Nested write: an enrollment update issued from inside another trigger still recomputes the main group (depth guard removed).
  - Conflict errors (ADR-009): every stale or conflict refusal introduced by this plan (`place_learner_in_group`, `remove_learner_from_group`, `end_learner`, `close_school_year` count mismatch, `reopen_enrollment`, `save_enrollment_changes`, `restore_student`, the re-created `assign_receptionist_student_group`, the I3 duplicate re-raise) returns SQLSTATE `PT409` with hint `egc.stale` or `egc.duplicate_enrollment` and HTTP 409, and is recognised by `isRecordConflict`; a catalog check asserts that no function created by M1/M2 raises `40001`, and that no function re-created by M1/M2 raises `40001` once Plan C's migration is in the base (re-created bodies start from Plan C's converted definitions; see stop conditions).
  - M2 refusal: M2's DO block raises on each unmet invariant.
- **Upgrade test** `scripts/test-egc-upgrade.mjs` (pattern of the existing `*-upgrade.mjs`): migrate to 118, seed the patterns, apply M1, check union readers unchanged, run the cleanup cores (including C1b), apply M2, check readers and invariants; and a second run that skips C1b to prove M2 refuses.
- **Existing suites kept green, updated only where the documented behaviour changes** (each changed assertion listed in the PR with its reason, none removed silently): `test-enrollment-workflow.sql` (074 student-form sync path replaced), `test-student-placement.sql`, `test-paid-enrollment.sql` (status line, implicit branch), `test-receptionist-batch1.sql`, `test-receptionist-group-filter.sql` (097 filter), `test-online-learning.sql` (capacity through the new placement command; online rules unchanged), `test-crm-rcc-a2.sql` and CRM suites (D5), `test-premium-retirement-finance.sql`, `test-audit-remediation.sql`.
- **Node unit tests:** `scripts/test-enrollment-workflow.mjs` (new helpers, `currentSchoolYear` around 31 August/1 September Casablanca), new `scripts/test-assessment-grades.mjs` (ACA-9 parsing), membership action error mapping.
- **Browser:** update `scripts/test-student-placement-browser.mjs` (place in two programmes, leaver, capacity), plus lint and build.

## Rollout and rollback

| Step | Content | Approval |
| --- | --- | --- |
| R0 | This plan approved with D1–D7 answered (EGC-r1, done 2026-10-24) and D8 answered A (2026-10-24); the EGC-r2 corrections (including the C1b count) shown to the owner | Owner |
| R1 | Implementation PR (M1, M2, app, tests, docs); CI; fresh independent review of the exact head | Owner merge approval |
| R2 | Backup confirmed; apply **M1**, then deploy the application immediately (outside reception hours: the old app's group writes are refused between the two) | Owner release approval |
| R3 | Production checks after M1: function/trigger catalog diff, union readers unchanged, one synthetic-free smoke (open a group page, record nothing) | Release task |
| R4 | Data cleanup dry-run counts presented → owner approves numbers → C1–C6 | Owner, separately |
| R5 | Apply **M2** (refuses if C6 not met); Production verification of headcounts, dashboard (≈105), "Groupe à affecter" (≈28), attendance page for each group | Owner release approval |
| R6 | Closeout: CURRENT_STATE, PRODUCT_RULES (enrollment section), SECURITY_RULES (membership line), WORKFLOWS (leaver, year close), README-enrollment-workflow, FEATURE_INDEX, ADR-010 status | Docs PR |

**Before the first Mise à niveau group:** if R2 cannot happen before a Mise à niveau group is needed, the interim safeguard is operational: place Mise à niveau learners only after C1 has back-filled their Yearly membership (which needs M1's cores) — so in practice, do not create that group before R4.

**Rollback:**
- *M1 only (before R4):* a prepared forward revert (`scripts/egc-revert-m1.sql`, tested in CI, applied only with approval under a new migration number) restores the 072/074/096/117/041 bodies, the 084 `evaluate_conversion` and 117 `crm_start_enrollment` bodies (D5-A), the 118 `online_close_course` body (D8-A) and the 074 trigger, drops the new triggers and commands, and keeps the `Ended` value and columns (harmless if unused; any Ended rows are mapped back from the log). The previous application deploy is redeployed.
- *After R4:* `revert_cleanup` per stage (reverse order), then the M1 revert if needed.
- *After M2:* a forward revert re-creates the union readers and drops the validated constraints; M1 semantics continue.
- Finance is never rewritten: no receipt, charge amount or financial event is changed by any step; only `charges.enrollment_id` links (12, logged) are set.

## Expected modules

`supabase/migrations/XXX_enrollment_group_consistency.sql`, `supabase/migrations/XXX_enrollment_group_consistency_enforce.sql`, `scripts/test-enrollment-group-consistency.sql`, `scripts/test-egc-upgrade.mjs`, `scripts/egc-revert-m1.sql`, `scripts/test-assessment-grades.mjs`, `src/lib/academic/membershipActions.mjs`, `src/lib/enrollmentWorkflow.mjs`, the screens in D-8, `.github/workflows/verify.yml` (wire the new suites), `scripts/README-enrollment-workflow.md`, `package.json` (test scripts).

## Owner decisions required

**D1 — Can a learner be in two groups at once?**
- **A (recommended):** yes, one group per programme per school year (Yearly + Mise à niveau, Yearly + Adults…). Never two groups of the same programme in the same year. This is what the 6 learners who pay for both already need.
- B: no, one group at a time. Placing a Yearly learner in Mise à niveau would remove the Yearly place, which contradicts what those 6 families paid for.
- Blocking: yes (the whole model depends on it).

**D2 — What is a "leaver" and when does it happen?**
- A: only a per-learner "Ancien apprenant" action, used by management when someone leaves.
- **B (recommended):** A, plus a director "Clôturer l'année scolaire" action used once a year (e.g. end of June) that ends every enrollment of that year still open; learners not re-enrolled for the next year become Ancien apprenant. Archiving a learner also ends their enrollments, and the director can restore an archived file.
- C: automatic (e.g. no payment or attendance for 60 days). Not recommended: it would remove learners without anyone deciding.
- Sub-choice: who may use it — **management only (recommended)** or reception too. Final word: "Ancien apprenant" (Alumni) when the programme was completed, "Inactif" when the learner stopped mid-way; neither counts as active.
- Blocking: yes.

**D3 — What makes a learner "Inscrit"? (includes FIN-10)**
- **A (recommended):** only a confirmed, validated or trial enrollment. A receipt for a book, a test fee or an old balance does not change the status; a new learner file starts as "Prospect" until it is enrolled or placed.
- B: keep today's rule (any receipt and any new file make the learner Inscrit). The dashboard would drift upwards again over time.
- Blocking: yes (changes the payment function and the forms).

**D4 — Is group capacity a hard or soft limit?**
- **A (recommended):** hard for reception; director/admin may override with a written reason (logged).
- B: soft — a warning only, nobody blocked.
- C: hard for everyone, no override.
- Blocking: yes for the capacity trigger.

**D5 — When a converted learner leaves, what happens in the CRM?**
- **A (recommended):** the conversion stays valid (finishing or leaving a programme is not a reversal), and a new lead for the same learner later creates a new enrollment. Two CRM functions change by a few lines each.
- B: no CRM change; the director gets a "conversion à vérifier" flag each time a converted learner leaves, and a returning learner's lead is asked to reuse the ended enrollment.
- Blocking: no (B is the default if undecided), but needed before implementation ends.

**D6 — Approve the data clean-up as described?** Back-fill 36 Yearly enrollments (and link 12 open Yearly charges), close the 7 legacy rows, mark 99 former learners **Ancien apprenant** (or Inactif), close the 3 enrollments of archived learners, give the 10 Mise à niveau learners paid on historical receipts a waiting enrollment. Counts are re-read on the day; any difference comes back to you. **Recommended: approve, with Ancien apprenant.** Blocking: only for R4/M2, not for implementation.

**D7 — Changing a group's level when a class moves up.**
- **A (recommended):** block it while the group has learners (as reception already is); at the new year create new groups, or ask later for a "Promouvoir le groupe" action that moves group, enrollments and files together.
- B: build the "Promouvoir le groupe" action now (bigger batch).
- Blocking: no.

**D8 — When an online course is closed, what happens to its learners' enrollments?** (new after the independent review; **answered A** by the owner on 2026-10-24)
- **A (recommended, chosen):** closing the course ends its learners' enrollments ("Cours en ligne clôturé"); learners with nothing else active become Ancien apprenant. A learner can then join another online course the same school year. One online function (course close) gains this step.
- B (rejected): online programmes are exempt from the "one live enrollment per programme per year" rule; closing a course changes nothing, and learners of closed courses stay Inscrit and on the course roster until management marks them Ancien apprenant.
- Decided: A. The design in D-6b implements it.

## Approval record

- **Date and time:** 2026-10-24 15:53 Asia/Shanghai (UTC+08:00), 07:53 UTC.
- **Owner's words (verbatim):** "all recomended and for E6 paper numbers dont exist". The owner had been shown each plan's owner questions with the plan's recommended option; "all recomended" covers this plan (the E6 remark concerns the payment corrections plan only).
- **Channel:** chat with Claude, relayed by the coordinating session.
- **Approved revision:** EGC-r1 at exact head `50da715` of branch `docs/plan-d-enrollment-group-consistency` (PR #154).
- **Options chosen:**
  - D1 = **A** (one group per programme per school year; never two groups of the same programme in the same year).
  - D2 = **B** (per-learner "Ancien apprenant" action plus the director's yearly "Clôturer l'année scolaire" action; archiving ends enrollments and the director can restore), used by **management only**; wording as recommended: "Ancien apprenant" (Alumni) when the programme was completed, "Inactif" when the learner stopped mid-way; neither counts as active.
  - D3 = **A** (only a confirmed, validated or trial enrollment makes a learner Inscrit; a new file starts as Prospect).
  - D4 = **A** (hard capacity limit for reception; director/admin override with a logged written reason).
  - D5 = **A** (the conversion stays valid when a converted learner leaves; a later lead creates a new enrollment).
  - D6 = **approve the clean-up as described, with Ancien apprenant** (back-fill 36 Yearly enrollments and link 12 open Yearly charges, close the 7 legacy rows, mark 99 former learners Ancien apprenant, close the 3 enrollments of archived learners, give the 10 Mise à niveau learners a waiting enrollment). Counts are re-read on the day and any difference goes back to the owner; the clean-up (R4) still needs its own release approval of the exact numbers.
  - D7 = **A** (block a level change while the group has learners).
- **D8 = A** (added by the review corrections, EGC-r2, after the EGC-r1 approval). Owner's words, verbatim, in chat on 2026-10-24 at 16:16 Asia/Shanghai (UTC+08:00), 08:16 UTC, relayed by the coordinating session: "d8: A". Meaning: `online_close_course` ends the course's enrollments (reason "Cours en ligne clôturé"), so a learner can take another online course in the same school year; option B is rejected.
- **Scope of this approval:** architecture approval for implementation of this plan only. It does not approve the merge, either migration, the data clean-up run, the deployment or any other Production step; each needs its own explicit owner approval under [Rollout and rollback](#rollout-and-rollback).

## Review corrections (EGC-r2)

Independent review of PR #154 at `c4b6edf` returned CHANGES REQUIRED (2026-10-24). Corrections applied within the approved architecture; the approval record above is kept unchanged except for the added D8 line (answered A on 2026-10-24).

- **B1 (blocking), I9 vs the clean-up:** I9 now covers Confirmed/Validated/Trial only (`Ended` and `Rejected` keep what they had), so C2 can close the 7 legacy rows that have no programme or year. New stage **C1b** sets `2026/2027` on the 1 grouped Validated Yearly row without a school year (dry-run query added). M2's refusal block and C6 now check I9 and the Ended shape. C2 asserts the grouped learner's C1 membership before ending that learner's legacy row.
- **I1:** `storage_security.can_write` (096 line 938) added as a membership reader (reader table, D-7, M2 manifest, tests); `resolve_storage_asset`'s latest definition corrected to 096 line 982.
- **I2:** the private `academic_security` helpers are called only from SECURITY DEFINER code; caller-rights readers use `public.my_member_group_ids()` (announcements), inline SQL (`search_students_page`) or a definer wrapper (`remove_student_group`), with grants stated and per-role tests.
- **I3:** online courses vs the one-live-enrollment-per-programme-per-year rule is a new owner decision **D8**, answered **A** by the owner on 2026-10-24 (D-6b); D8-B rejected; I3 `23505` re-raised as `PT409` with a French message everywhere.
- **I4:** the enrollments page's validate/reject go through the commands; new invariant **I10** (`enrollments_history_guard`) protects `Ended` rows and Trial/Confirmed/Validated rows from direct change or deletion outside the commands.
- **Minor:** leaver attendance corrections allowed before `ended_at`; `restore_student` re-runs the sync; the 074 `pg_trigger_depth()` early return is removed (justified); the student guard compares with `IS DISTINCT FROM`; the M1 revert list includes the 084/117/118 bodies; the union rule in the app is equal to enrollment-only after C6, so R5 needs no app deploy; French error for deleting a group with enrollment history; learner-first lock order for payment and commands with a deadlock test.
- **Test gaps** listed by the review are added to the test strategy.
- **Cross-plan alignment (Plan C review):** stale and conflict refusals switched from `55000` to `PT409` (hints `egc.stale`, `egc.duplicate_enrollment`) to follow ADR-009 (PR #151); overlap section and tests updated.
- **Revised D6 counts for the owner:** C1 36 back-filled (12 charge links), **C1b 1 (new)**, C2 7, C3 99, C4 3 (2 after C2), C5 10. Expected results unchanged: about 105 active learners, 28 in "Groupe à affecter".

## IMPLEMENTATION CONTRACT

### Scope

Implement revision EGC-r2 (EGC-r1 as approved plus the review corrections), with the owner's answers to D1–D5, D7 and D8 = A (D6 governs only the separate data step): migrations M1 and M2 (numbers at merge), the application changes in D-8, the tests in "Test strategy", the cleanup cores and revert scripts, and the documentation updates listed under R6 that describe merged (not deployed) behaviour. Tier 3. One PR on a feature branch from a freshly fetched `origin/main`.

### Prerequisites

- Owner approval of this plan revision and decisions recorded in this file and in [OWNER_DECISIONS](../../ai/OWNER_DECISIONS.md).
- Re-read `origin/main`, the ledger and open PRs of Batch C (ADR-009 conflict contract: `PT409`, `isRecordConflict`), Batch E (`create_charge_payment`), Batch F (teacher/family readers, announcements), Premium Release B (`resolve_storage_asset`, `teacher_can_see_student`) and online learning. Rebuild each re-created object from the latest merged definition.
- Local Supabase with synthetic data only; no Production access is needed or allowed for implementation.

### Object / module manifest

- M1: enrollment status `Ended`, columns `ended_at`, `ended_by`, `end_reason`, `ended_group_id`; constraints `enrollments_active_requires_group`, `enrollments_ended_shape`, `enrollments_confirmed_has_programme` (NOT VALID); index `enrollments_one_active_programme_year`; schemas `academic_security`, `maintenance`; table `maintenance.egc_cleanup_log`; helpers `academic_security.is_group_member`, `group_member_ids`, `main_group_for`, cores for D-4, `revert_cleanup`; re-created `sync_student_from_enrollments`, `enforce_enrollment_student_sync`, `check_enrollment_student_sync`, `create_charge_payment`, `assign_receptionist_student_group`, `save_receptionist_student`, `save_receptionist_enrollment`, `soft_delete_student`, `remove_student_group` (SECURITY DEFINER wrapper); new `public.my_member_group_ids()`; trigger `enrollments_history_guard`; D5-A: `crm_security.evaluate_conversion`, `crm_start_enrollment`; D8 = A: `online_close_course` (118 body plus the enrollment-ending step); dropped `student_enrollment_assignment_sync` trigger and `sync_enrollments_from_student`; new triggers `students_membership_guard`, `groups_membership_level_guard`, `enrollment_group_capacity`; new RPCs `place_learner_in_group`, `remove_learner_from_group`, `end_learner`, `close_school_year`, `reopen_enrollment`, `restore_student`, `list_archived_students`, `create_enrollment`, `save_enrollment_changes`.
- M2: invariant DO block; constraint validation; strict sync; re-created `attendance_student_in_group`, `teacher_can_access_student_group`, `can_message_recipient`, `storage_security.can_write` (096), `resolve_storage_asset` (096), `search_students_page`; re-created policy `announcements audience read`.
- App and tests: as in D-8 and "Test strategy".

### Invariants

I1–I6 and I8–I10 (D-2) hold after M2 for every row, and I7 for every change from M1 on (Enrolled/Trial files that pre-date it without a backing enrollment, paid on historical receipts, are not refused by M2; C6 reports them as `status_without_enrollment`; wording corrected in the re-review, 2026-10-25); before M2, I1/I9 hold for every new or changed row and I2 holds for every learner with a membership (except, by owner decision 1 of 2026-10-25, an unbacked Yearly file group kept as main group until C1). No receipt, charge amount, financial event, attendance row or CRM lead is created, changed or deleted by either migration. No policy grants a role more rows than today, except the second-programme reach D-7 intends (see the owner summary, corrected 2026-10-25). No new `40001` raise: every stale or conflict refusal uses `PT409` with a stable `egc.*` hint (ADR-009). Every re-created function differs from its source only by the changes this plan names.

### Acceptance / tests

All new and updated suites pass in CI for the exact head SHA, including the existing database suites; lint and build pass; the PR lists every changed assertion of an existing test with its reason; the upgrade test proves M1 → cleanup → M2 and M2's refusal; the PR includes the per-function diffs against their sources.

### Stop conditions

Stop and report (do not improvise) if: Plan E's merged definition of `create_charge_payment` differs from the 096 body named here (rebuild on Plan E's definition, keeping its check order and receipt numbering, and apply only this plan's changes); Plan C's ADR-009 migration has not merged and a function this plan re-creates still raises `40001` in its latest body (convert it only by rebuilding from Plan C's merged definition, never by a separate edit here); the I3 index or any re-creation conflicts with a definition newer than the one named here; Batch E, C, F or Premium Release B merged a conflicting body and the merge is not mechanical; an existing test can only pass by weakening a security or integrity assertion; online-learning capacity or seat behaviour would change beyond what D8 decides; a requirement needs Production data, a Production read or a change outside this manifest; the owner's answers differ from the recommended options in a way that changes the manifest (then the plan is revised first).

### Implementation notes (independent review, non-blocking)

1. **Course close locking (D8 = A):** the re-created `online_close_course` locks the affected learners in id order and selects the enrollments to end only after taking those locks; alternatively it refuses placement into a course that is closing. Either way, a placement made during the close cannot be missed.
2. **Past online rosters:** after a close, historical online rosters and labels that read `group_id` lose the ended learners. For past lessons, read `ended_group_id` as well (for example in `online_security.student_label` and the past-lesson roster reads), without changing seat or capacity rules.
3. **`isRecordConflict`:** if Plan C (ADR-009, PR #151) has not merged when this is implemented, the PR adds or reuses an `isRecordConflict` browser helper that follows ADR-009 (`PT409`, and legacy `40001`, treated as a record conflict).

### Docs / status reporting

The implementation PR updates [README-enrollment-workflow](../../../scripts/README-enrollment-workflow.md), PRODUCT_RULES (enrollment paragraph: membership from enrollments, leaver, status derivation, D3), SECURITY_RULES (membership line), WORKFLOWS (placement, leaver, year close, archive/restore) and this plan's implementation record, marking everything as merged-not-deployed. Report with the AGENTS.md implementation handoff (Tier 3), including migration file names and the open release steps R2–R6.

## Implementation record

- **State:** implemented on branch `feat/enrollment-group-consistency` (one Tier-3 implementation PR, R1), from `origin/main` `3f97c458db857db02204b0bf6a0e3c7d6e09828d`, rebased on `4fbdda7af963f4e6416ea4692e03a69278f812bd` (#159, Batch C closeout) and then on `92e9924` (#161, lead intake record); both are docs only, with no migration and no object this plan touches, so the 119 baseline and the function diffs stay valid. Not merged, not deployed; once merged: merged, not deployed. No Production read or write was made for this implementation (no clean-up, migration or SQL).
- **Migrations:** [120_enrollment_group_consistency.sql](../../../supabase/migrations/120_enrollment_group_consistency.sql) (M1, including the clean-up cores C1–C6, C1b and `egc_revert_cleanup`) and [121_enrollment_group_consistency_enforce.sql](../../../supabase/migrations/121_enrollment_group_consistency_enforce.sql) (M2). The numbers follow 119 (Batch C) and are re-checked against `origin/main` just before merge. Prepared M1 revert: [scripts/egc-revert-m1.sql](../../../scripts/egc-revert-m1.sql) (refuses once M2 is applied or the clean-up log is not empty).
- **Sources (latest definition on the base):** `create_charge_payment`, `assign_receptionist_student_group`, `save_receptionist_student`, `crm_start_enrollment` from **119** (Batch C, `PT409` instead of `40001`; this replaces the 096/117 bodies the plan cited, as expected after #158); `online_close_course` 118; `save_receptionist_enrollment` 117; `search_students_page` 097; `storage_security.can_write`, `resolve_storage_asset`, `enforce_attendance_integrity` 096; `crm_security.evaluate_conversion` 084; `sync_student_from_enrollments`, `remove_student_group`, dropped `sync_enrollments_from_student` 074; `enforce_enrollment_student_sync`, `check_enrollment_student_sync` 072; `teacher_can_access_student_group` 071; `can_message_recipient` 069; `attendance_student_in_group` 063; `soft_delete_student` 041; policy `announcements audience read` 024. No other drift from the plan's evidence was found. Lead intake (#157) touches none of these objects. Per-function diffs against the 119 catalog: [EGC-r2 function diffs](../evidence/egc-r2-function-diffs-2026-10-25.md).

### Interpretations and deviations for review

1. **Contradiction in the plan, main group before M2 — owner decision (Maroine, 2026-10-25): keep the test-strategy reading** ([OWNER_DECISIONS](../../ai/OWNER_DECISIONS.md#enrollment-and-group-consistency-batch-d--approved-2026-10-24)). The test strategy requires DAT-1 "with and without a Yearly enrollment before M2 semantics": a dossier-only Yearly learner placed in a Mise à niveau group keeps the Yearly main group and both rosters. D-3's transition rule (keep an unbacked file group only while the learner has no membership) and the contract line "I2 holds for every learner with a membership" would instead move the main group to Mise à niveau and drop the learner from the Yearly roster until C1. The implementation follows the test strategy: until M2, an unbacked file group stays the main group unless the change took the learner out of it or placed them in another group of the same programme. Consequence: before C1, such a learner has a file group that is not a membership (I2 not yet true for them); C1 back-fills it, C6 and M2's refusal block check it. The owner kept this reading on 2026-10-25, so D-3's narrower rule and the contract's I2 wording apply only from M2 on. **Review fix B1 (2026-10-25):** the kept file group is cleared only by a forced downgrade from that same group (074, D-3), so a notes edit, a rejection or a deletion of a Submitted/Under Review row carrying it no longer unplaces the learner. The two explicit removals of a dossier-only placement (`academic_security.remove`'s dossier branch and the `remove_student_group` wrapper) clear it through `academic_security.clear_file_group` on the sync's own path instead of passing a forced downgrade, because a forced resync would also turn the learner's Enrolled status into Prospect; the effect the review asked for (explicit removal clears it) is the same and the status is kept as in 074. Upgrade-test cases cover the four paths.
2. **Undated charges and I9.** D-5's implicit branch says "school year equal, or both null". A Confirmed enrollment inserted for an undated charge would then have no year and be refused by the I9 check (NOT VALID still applies to new rows). The implicit branch matches an undated non-legacy charge with the learner's single live enrollment of that programme whose year is null or the current school year, and every enrollment the payment confirms or creates gets a year: the charge's, else the enrollment's, else `crm_security.enrollment_year`. The receipt is unchanged.
3. **Outside the M2 manifest (mechanical; accepted by the owner on 2026-10-25 as a listed deviation, to be checked by the independent reviewer):** `attendance_student_in_group` needs the session date for the leaver rule of D-7, so it takes a third argument `p_session_date`; the two-argument function is dropped and `enforce_attendance_integrity` is re-created from its latest definition (096) only to pass `new.session_date`, because the 063 two-argument check cannot know the session date (diff in the evidence).
4. **Implicit placement of an already placed learner** (the level move is confirmed by owner decision 4, 2026-10-25, about 11:40 Asia/Shanghai, and applies to director/admin as well; the enrollment dialog now lets the placement set the new level (re-review SF2): reception may move a learner with a confirmed placement to a group of another level in the same programme, which updates the enrollment's level) refuses with `egc.already_placed` (D1 = A) instead of moving the learner silently; a move goes through the enrollment. A move of a placed enrollment to another level of the same programme takes the new group's level (as the 074 file move did; kept by `test-enrollment-workflow.sql`); an unplaced enrollment must match the level or have none.
5. **Guard additions:** a manual change to Prospect while a Confirmed/Validated/Trial enrollment exists is refused (`egc.status_follows_enrollment`, I7); the programme/level lock also applies while the old file group is set (the dossier-only learners before C1).
6. **Capacity before M2** counts the union (enrollments and non-archived file groups) so dossier-only members occupy their seat; identical to the I6 count after C6.
7. **CRM:** a capacity refusal inside `crm_start_enrollment` surfaces through its existing `record_rejected` handler.
8. **Screens:** the director's year close is on *Pré-inscriptions*, the archived list and restore on *Apprenants* (*Dossiers archivés*); validating a pre-enrollment without a group asks to choose the group from the enrollment; the group-page picker leaves out members of another group of the same programme (they move from their enrollment) and offers other programmes' members to management; the receipt toast needed no code change (`student_enrolled` is now computed by the server). The staff guide (`/helpdesk`) wording follows D3-A.
9. **Follow-up — implementation note 2 (past online rosters reading `ended_group_id`) is not in this PR (owner, 2026-10-25):** `online_security.student_label` and the past-lesson roster reads are outside the manifest. After a course close, past online rosters lose the ended learners until that follow-up is built.
10. Course close (note 1): `online_close_course` locks the affected learners in id order, selects the enrollments to end after the locks and repeats the step under the course seat lock, so a concurrent placement is ended too (race test).
11. **Review fixes (2026-10-25), database:** DS1 — C1 places a learner's single Confirmed, ungrouped enrollment of the group's programme and year (a payment made between M1 and the clean-up) instead of inserting a second one, and stops with P0001 on any other live enrollment of that programme and year; C1b and C5 stop with P0001 before writing a row that would collide; a dry-run query for the case is in the clean-up section. DB-N1 — a concurrent I3 duplicate inside `crm_start_enrollment` is `PT409` / `egc.duplicate_enrollment` (one more change to its 119 body). DB-N2 — `egc_revert_cleanup` refuses a stage while a later stage's journal exists. DB-N4 — the new public commands are revoked from `service_role` too. DB-N5 — `close_school_year` returns the number of enrollments it ended. DB-N7 — I7 holds for every change from M1 on (guard); Enrolled/Trial files that pre-date it without a backing enrollment (paid on historical receipts) are not refused by M2 and are reported by the new C6 count `status_without_enrollment`. DB-N9 — the school-year match on placement added after the first review is **removed again** (owner decision 5, 2026-10-25): `groups.annee` cannot be edited in the app and its default could give a new group the previous year, so groups would refuse their own learners; see the follow-up below.
12. **Follow-ups (not in this PR):** placement into a closed online course (review DB-N3); a school-year check on placement, together with an editable group year and a Production dry-run of group years (owner decision 5, 2026-10-25), and then defaulting an enrollment's school year from its chosen group.
13. **Review fixes (2026-10-25), application and tests:** S1 — the enrollment dialog sends the versions it loaded with its first command and re-reads them only after its own save changed the row, so a stale group-only or status-only edit is refused; N2/N3 — on a record conflict, or after a failure that follows a successful creation, it closes and reloads; S2 — the group page opens the override dialog from the server's capacity answer; N4 — « déjà dans un autre programme » follows the learner's membership; N7 — group save/delete and enrollment delete invalidate the cached groups, learners and enrollments; N1 — the `egc.*` conflict hints are read only for a record conflict; S4 — the staff guide states the capacity limit and when a learner stays Prospect; S6 — `test-student-placement-browser.mjs` runs in the browser-security shard; N6 — every teardown uses `set local`.
14. **Re-review fixes (2026-10-25):** B2 — the school-year match is removed (owner decision 5). DB S1 — before M2, `academic_security.leave` treats a dossier-only file group that no membership backs as an active placement: when `end_learner`, `close_school_year` or an online course close ends the learner's last enrollment, the file group and the Enrolled/Trial status stay (owner decision 1); only an explicit leaver of a file with nothing else to end, or the archive, ends the file itself. The M1 sync keeps that status while it keeps the group. SF2 — the enrollment dialog leaves the level to the placement when the group changes, so direction can move a placed learner to another level's group of the same programme (owner decision 4 applies to director/admin too; browser case). Nits: browser case for a stale dialog edit (S1) and no fallback re-read; the group page counts seats as the server does; times on the 2026-10-25 owner decisions; C1 place-instead-of-insert with its revert, the three P0001 stops, the `remove_student_group` wrapper and the reception removal are tested; C1b and C5 collision dry-run queries; I1–I10 wording; the evidence adds the M1 sync body. Not done, with reason: defaulting an enrollment's school year from the chosen group — group years are not reliable until they are editable (owner decision 5), so it joins that follow-up.

### Changed assertions of existing tests

Teardown only (no assertion): fixtures delete enrollment history under `eh.enrollment_command` (I10) in the CRM phase 6/7, RCC-A2, RCC-B1, online, receipt, receptionist and security suites; ledger ceilings 119 → 121 in the upgrade checks; `test-no-retry-conflicts-local.mjs` now requires the latest migration file's version instead of 119; `test-conflicts-without-retry-upgrade.mjs` applies the 119 file directly (so 120–121 are not applied in the middle of its 118→119 proof) and brings the ledger to current at the end, with the catalog zero rule re-checked there.

Fixture changes (the assertion is unchanged): learners are placed through a Validated enrollment with programme and year instead of `students.groupe_id` (audit remediation, Batch 3A, 3B, 4A, 4C — 4C moves the learner by its enrollment); a second live enrollment of the same learner and programme moves to another school year (I3: Batch 3B, online learning, CRM phase 6 and 7, receptionist security) or, in RCC-A2, to a second learner; a direct status write in CRM phase 6 uses the sync's own path (it still proves a status change never converts); legacy rows are seeded before the NOT VALID I9 check where Production holds them (receptionist security, group filter); the Premium 112 upgrade setup gives the two Confirmed enrollments that the 112 payment body creates for undated charges a school year (Production holds no Confirmed enrollment without one, and M2 refuses such rows), checking that exactly two rows change.

Every changed existing test file:

| File | Change | Reason |
| --- | --- | --- |
| `test-audit-remediation.sql` | placement through a Validated enrollment; status checks on a new learner `d004` | DAT-2; the placed learner's status now follows its enrollment (I7) |
| `test-batch3a-security.mjs`, `test-batch4a-security.mjs` | placement through enrollments; teardown flag | DAT-2, I10 |
| `test-batch3b-security.mjs` | programme and year on Validated rows; Under Review rows in other years; teardown flag | I9, I3, I10 |
| `test-batch4c-storage-enforcement.mjs` | placement and the move through the enrollment | DAT-2 |
| `test-conflicts-without-retry-upgrade.mjs` | 119 applied as a file; ledger brought to current at the end | keeps the 118→119 proof exact |
| `test-no-retry-conflicts-local.mjs` | requires the latest migration file's version | ceiling follows the repository |
| `test-crm-batch2-upgrade-current.sql`, `test-crm-h3-upgrade-103-current.sql`, `test-crm-r4-upgrade-100-current.sql`, `test-crm-r4-upgrade-102-current.sql`, `test-premium-retirement-upgrade-113-current.sql` | ledger ceiling 121 | new migrations |
| `test-premium-retirement-upgrade-112-setup.sql` | year on the two synthetic undated-charge enrollments | M2 refuses them; Production holds none |
| `test-crm-phase6.sql` | status write on the sync's path; second Adults/Yearly enrollments in other years; CRM start names that year | I7 guard, I3 |
| `test-crm-phase7.sql` | second Yearly enrollment in 2027/2028, paid and started in that year | I3 |
| `test-crm-rcc-a2.sql` | the selectable pre-enrollment belongs to a second learner | I3 |
| `test-crm-phase6-browser.mjs`, `test-crm-rcc-a2-browser.mjs`, `test-crm-rcc-b1-browser.mjs`, `test-crm-phase6-concurrency.py`, `test-crm-phase7-concurrency.py`, `test-crm-rcc-a2-concurrency.py`, `test-online-learning-browser.mjs`, `test-online-zoom-room-browser.mjs`, `test-receptionist-storage.mjs`, `test-receipt-deletion-browser.mjs` | teardown under `set local eh.enrollment_command` (receipt deletion now in one transaction) | I10 |
| `test-receipt-concurrency.sh` | one shared enrollment for the two payments; teardown in one transaction | D-5, I3, I10 |
| `test-enrollment-workflow.mjs`, `test-enrollment-workflow.sql`, `test-paid-enrollment.sql`, `test-student-placement.sql`, `test-large-data-local.mjs` | D3-A, DAT-2 and roster expectations (below) | plan behaviour |
| `test-online-learning.sql` | other school years for one learner's courses; capacity through the placement command; course close ends enrollments | I3, DAT-2, D8 = A |
| `test-receptionist-batch1.sql`, `test-receptionist-security.sql`, `test-receptionist-group-filter.sql`, `test-receptionist-browser.mjs`, `test-student-placement-browser.mjs` | as below; group filter keeps two Enrolled files with a pending pre-enrollment out of "Groupe à affecter" (S3); the I9 check's definition is asserted before its drop and after its re-add (N10) | DAT-2, I3, I9, D-7 |

Behaviour changes required by the plan:
- D3-A: Other and legacy-balance receipts no longer make the learner Enrolled (`test-paid-enrollment.sql`, `test-enrollment-workflow.sql`); new files and imports are Prospect (`test-enrollment-workflow.mjs`, `test-receptionist-batch1.sql`, placement browser, large-data export uses every status); enrolled learners need a confirmed enrollment (`test-student-placement.sql`).
- DAT-2: a direct file-group write is refused (`test-enrollment-workflow.sql`, `test-online-learning.sql`, which now meets the online capacity through `place_learner_in_group`); placement without an enrollment creates a Validated one with the group's level, and a paid enrollment without level takes the group's level, instead of being refused (`test-receptionist-batch1.sql`); a parent's call of `remove_student_group` is refused (`42501`) instead of matching no row.
- D-5/I3: two payments on undated Yearly charges of one learner confirm one enrollment and link both receipts to it, instead of creating two enrollments (`test-receipt-concurrency.sh`).
- D-7 "Groupe à affecter" is one rule for every role (`test-receptionist-group-filter.sql`, receptionist browser): pending pre-enrollments are no longer listed; a Confirmed enrollment without group is.
- I1/I9: the legacy Validated-without-group repair path is gone from the receptionist browser suite (the row cannot exist after M2; C1b/C2 handle the Production rows); Confirmed legacy rows without a year are refused until the clean-up (`test-receptionist-security.sql`).
- D8 = A: closing an online course ends its enrollments (`test-online-learning.sql`).
- The roster helpers count enrollments only and exclude archived learners; Ended is no pre-enrollment (`test-enrollment-workflow.mjs`). The student form has no status or group field; the student-form synchronisation checks became placement at creation, group-page commands, capacity override and Ancien apprenant (placement browser).

### Local verification (isolated local stack, synthetic data)

`npm test`, `npm run lint` (one existing warning) and `npm run build`; the SQL/ADR-009 guards (`sqlstate_guard.py`, the src scan, `test_sqlstate_guard.py`) and `scripts/ci/test_verify.py`. Every `local-database` shard of `verify.yml` replayed step by step against a remapped clone of this branch: upgrades 097–105 (7/7), 106–111 (5/5), 112–116 (7/7, including the EGC upgrade in its three modes and the conflicts upgrade), sql-and-concurrency (9/9, including the new suite and the EGC races), browser-security (10/10, including the placement suite now wired in) and browser-crm; replayed again after the independent-review fixes and after the re-review fixes with the same results (browser-security 11/11 with the placement suite's level-move and stale-dialog cases). In browser-crm, `test-crm-phase4-browser.mjs` (Opportunities) and `test-crm-rcc-a1-browser.mjs` (Work and Calendar) fail only locally: they type a Casablanca time in Chromium, whose bundled time-zone data (2026a) still has Morocco at UTC+1, while the local Postgres image (newer CLI than CI's pinned 2.116, tz 2026c) has UTC+0; both passed in CI on the base commit and touch no EGC object. Every other browser-crm suite passes, `test-ui-foundation-browser.mjs` on an isolated rerun (known load flake). After the review fixes, `test-crm-rcc-b1-browser.mjs` failed locally on its timing-sensitive "no browser errors" filter (WebKit cancelled-request and chunk-load messages from the suite's own failure injection, different on each run); it passed locally before and in CI on `0796b11a`, and touches no EGC object. CI on the PR head is the authoritative result.

### Open release steps

R2–R6 as in [Rollout and rollback](#rollout-and-rollback), each with its own owner approval: R2 backup, M1 and the application together outside reception hours; R3 checks; R4 the dry-run counts re-read on the day (D6), then C1–C6; R5 M2; R6 closeout (CURRENT_STATE, FEATURE_INDEX, ADR-010 status).
