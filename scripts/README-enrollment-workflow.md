# Enrollment and group workflow

Plan [EGC-r2](../docs/architecture/plans/enrollment-group-consistency.md), live in
Production: migration 120 (M1) on 2026-10-25, the approved data clean-up and
migration 121 (M2) on 2026-10-26 ([ADR-010](../docs/architecture/decisions/ADR-010-group-membership-from-enrollments.md)).

## Membership and status

A learner is a member of a group when a Validated or Trial enrollment of that
learner has that group and the learner is not archived. This is the only rule;
attendance, teacher access, messaging, storage, announcements, rosters and the
Students list all read it. The learner file's group (`groupe_id`) is the
main group, maintained by `sync_student_from_enrollments`: the current one while
it is still a membership, otherwise the membership of the file's programme, then
Yearly, then Validated before Trial, then the oldest. The file's programme and
level copy the main group's. No screen writes them; the `students_membership_guard`
trigger refuses a direct write for every role.

One live enrollment per learner, programme and school year (index
`enrollments_one_active_programme_year`; a duplicate answers `PT409` with hint
`egc.duplicate_enrollment`). Validated and Trial need a group; Confirmed,
Validated and Trial need a programme and a school year.

The learner status is derived (D3-A): Enrolled while a Confirmed or Validated
enrollment exists, Trial while only a trial exists, Alumni or Inactive only
through `end_learner`, `close_school_year`, `online_close_course` (D8 = A) or archiving, Prospect otherwise.
Manual creation and CSV imports create Prospect files (an imported Alumni or
Inactive status is kept). Payments no longer set the status: it follows the
enrollment the payment confirms, and an Other or legacy-balance receipt changes
none. Public pre-registration still creates Prospect / Submitted records in Production; migration 127 retires it
(see [Enrollment at payment](#enrollment-at-payment-migration-127-on-a-branch)).

## Commands

All are SECURITY DEFINER, check the stored role, lock the learner, then its
enrollments, then the group, and refuse a stale version with `PT409` and hint
`egc.stale` (ADR-009; nothing is retried).

- `place_learner_in_group` (assign_group capability): uses the learner's single
  live enrollment of the group's programme and year, or creates a Validated one;
  never touches another programme. With several candidates, or when the learner
  is already in another group of the programme, it refuses and the move goes
  through the enrollment. Capacity is checked at every placement (seat lock
  `group:seats:<id>`); director/admin may exceed it with a reason of at most 200
  characters, logged to `activity_log`. Online groups keep the 117 seat rules.
- `remove_learner_from_group`: Validated becomes Confirmed, Trial becomes Under
  Review; attendance history is kept. `remove_student_group` remains as a
  SECURITY DEFINER wrapper.
- `end_learner` (director, admin): ends the chosen or all active enrollments with
  a reason (status `Ended`, label « Terminée »: `ended_at`, `ended_by`,
  `end_reason`, `ended_group_id`) and sets Alumni or Inactive when nothing active
  remains. Returns the open balance; charges, receipts and attendance are not
  touched. A leaver's attendance before the end date stays correctable.
- `reopen_enrollment` (director, admin): Ended becomes Confirmed without group.
- `close_school_year` (director): ends every active enrollment of a year after
  checking the count the screen showed.
- `soft_delete_student` ends the learner's enrollments ("Dossier archivé",
  Inactive) before archiving. `restore_student` and `list_archived_students` are
  director-only; a restored learner's enrollments stay ended.
- `create_enrollment` and `save_enrollment_changes` (director, admin): allow-listed
  fields only; programme and year are fixed once set; Confirmed, Validated and
  Ended are reached only through payment, placement and the commands above.
- Reception keeps `assign_receptionist_student_group`, `save_receptionist_enrollment`
  and `save_receptionist_student`, now built on the same cores.
- `create_charge_payment` confirms the learner's single matching enrollment
  (programme and year) instead of creating a duplicate and refuses with
  « Plusieurs inscriptions correspondent… » when several match.
- `online_close_course` ends the course's enrollments (D8 = A), so a learner can
  take another online course in the same school year.

Enrollment history is protected by `enrollments_history_guard`: an Ended row
changes only by its notes, and Trial, Confirmed, Validated and Ended rows are
deleted only by the commands. Submitted, Under Review and Rejected rows can still
be deleted. Fixture teardown sets the transaction-local `eh.enrollment_command`.

## Enrollment at payment (migration 127, on a branch)

Plan [EAP-r4](../docs/architecture/plans/enrollment-at-payment.md) and
[ADR-015](../docs/architecture/decisions/ADR-015-enrollment-at-payment.md); implemented on branch
`feat/enrollment-at-payment` with `supabase/migrations/127_enrollment_at_payment.sql`, **not merged, not deployed,
127 not applied on Production**. The sections above describe Production until the release. With 127:

- **Statuses.** Live enrollments are Confirmed (paid, no group, « Inscrit — groupe à affecter »), Validated (paid, in a
  group) and Ended. Submitted, Under Review, Trial and Rejected are retired: old rows keep them, and the trigger
  `enrollments_retired_status_guard` refuses any insert or update into them for every role (`23514`, hint
  `eap.status_retired`), except under the two transaction-local flags `eh.membership_sync` and `eh.enrollment_command`
  both `on` (the archive revert). Membership readers, `remove_learner_from_group` (Trial → Under Review) and the derived
  status keep their Trial branches, which read no row once the archive step has run.
- **Creation.** An enrollment is born at the payment: `create_charge_payment` confirms on any payment above zero, or on a
  new tuition charge discounted at 100 % with its reason (no receipt). For a CRM prospect, `crm_enroll_and_collect` runs
  `crm_start_enrollment` (Confirmed only, no group, no longer callable by API roles) and the payment in one transaction.
  The group is placed afterwards with `place_learner_in_group` and the enrollment's fresh `updated_at`.
- **Retired paths.** `create_enrollment` always refuses; `save_enrollment_changes` refuses a status change
  (`egc.status_not_permitted`; level, date and notes unchanged); the pre-enrollment branch of
  `save_receptionist_enrollment` refuses (its group assignment on Confirmed/Validated rows stays);
  `create_public_registration` and `portal_request_reenrollment` refuse; `/api/public/inscription` answers 410.
- **Placement.** `academic_security.place` and `place_learner_in_group` take a last parameter
  `p_without_enrollment_reason`. A receptionist places only a Confirmed or Validated enrollment of the group's programme
  and year (`eap.paid_enrollment_required`), on every path including `assign_receptionist_student_group`; director and
  admin may place a learner without one, or on a legacy unpaid row, with a reason of 1–200 characters
  (`eap.placement_reason_required`), separate from the capacity-override reason and logged to `activity_log` as
  `placement_without_enrollment`.
- **Reopen and year close.** `reopen_enrollment` refuses a row the archive step ended (`eap.archived_not_reopenable`)
  unless the archive was reverted, and logs every reopen; « Clôturer l'année » moves to the Students list header
  (director only).
- **Existing rows.** `supabase/manual/enrollment_at_payment_archive.sql` (prepared, not run; dry run by default; declared
  counts checked first) journals before-images in `maintenance.eap_archive_journal`, confirms the paid waiting rows,
  ends the unpaid ones with « Pré-inscription abandonnée (retrait des pré-inscriptions, DD/MM/YYYY) » or « Essai terminé
  (retrait des essais, …) », resyncs learner statuses and detaches the non-converted leads of ended rows (activity
  `enrollment_detached`). `supabase/manual/enrollment_at_payment_archive_revert.sql` restores enrollments, learner
  statuses and lead links from the journal and refuses if anything changed since; conversions caused by the step stay.
  `scripts/rollback/127_enrollment_at_payment_restore.sql` restores the 126 function bodies and grants (application
  first), keeps the journal and changes no data.
- **Tests.** `scripts/test-enrollment-at-payment.sql` (rollback-only acceptance),
  `scripts/test-enrollment-at-payment-upgrade.mjs` (126 → 127 rehearsal with the archive, revert and no-op) and
  `scripts/test-enrollment-at-payment-absence.mjs` (no retired-status writer or wording left in `src/`).

## Courses with dates (migration 128, on a branch)

Plan [CDC-r3](../docs/architecture/plans/course-dates-close.md), [ADR-016](../docs/architecture/decisions/ADR-016-course-dates-and-close.md):
implemented on branch `feat/course-dates-close` with `supabase/migrations/128_course_dates_close.sql`, **not merged, not
deployed, 128 not applied on Production**. With 128:

- **Dates.** `groups.date_debut` / `date_fin` (check `groups_course_dates_order`), required for Mise à niveau, Adults,
  Summer Camp and One-to-One, refused on online groups, inside 1 June Y – 31 August Y+1 of the group's year
  (`academic_security.guard_group_year`, re-created; trigger `groups_year_guard` also fires on the dates) and checked
  by `academic_security.guard_course_group` (trigger `groups_course_guard`: required dates, One-to-One capacity 1,
  logged date edits, the protected closed mark, the frozen fields of a closed group). `save_receptionist_group`
  accepts the two date keys.
- **Closed course.** `groups.closed_at` / `closed_by`, written only by the commands under `eh.course_command`. Trigger
  `enrollment_course_guard` share-locks the group row (and the online course row), then refuses an entry into a
  closed course (`course.closed`) or an undated short-programme group (`course.dates_required`).
  `enforce_group_capacity` reads its group `for share`, so every path takes learners, the group row, then the seat lock.
- **Commands (director).** `list_courses_to_close()`; `close_course_preview(group)`;
  `close_course(group, expected_count, reason, attach[], end_unplaced[])` locks the learners in id order, marks the
  group, attaches the « A suivi ce cours » rows through `academic_security.place`, ends everything through
  `academic_security.leave`, links the qualifying charges, journals every row in `maintenance.course_close_journal`
  and replays a repeated call; `reopen_course(group, expected_closed_at)` restores the journalled rows and returns the
  skipped ones; `close_school_year_preview(year)`; `close_school_year` re-created (spares later courses, OA6, marks
  groups `for no key update` after the learners, never a group with a live learner).
- **Reads.** `crm_enrollment_groups` leaves closed courses out; parents and students read groups only through
  `public.family_group_ids()` (policy « groups read family »).
- **Existing rows.** `supabase/manual/course_close_backlog.sql` (prepared, not run; dry run by default; declared counts
  of the R0 count of 2026-11-05; Mise à niveau only unless `cdc.adults` / `cdc.one_to_one` are turned on after the
  owner's confirmation) and `supabase/manual/course_close_backlog_revert.sql`; the restore is
  `scripts/rollback/128_course_dates_close_restore.sql`.
- **Tests.** `scripts/test-course-dates-close.sql`, `scripts/test-course-dates-close-upgrade.mjs` (127 → 128 with the
  step, revert and restore), `python3 scripts/test-course-close-concurrency.py` and `node scripts/test-course-close.mjs`.

## Local verification

Use local Supabase only and a feature branch. Run `npm test`, `npm run lint`,
`npm run build` and, against the local database (`psql -h 127.0.0.1 -p 54322 -U postgres`),
the rollback-only SQL suites, among them:

- scripts/test-enrollment-group-consistency.sql (the EGC invariants, commands,
  readers, clean-up rehearsal and ADR-009 checks; needs M1 and M2)
- scripts/test-paid-enrollment.sql
- scripts/test-student-placement.sql
- scripts/test-enrollment-workflow.sql

`node scripts/test-egc-upgrade.mjs full|skip-c1b|revert-m1` rehearses, on a
database reset to 119, M1 → clean-up C1–C6 → M2, M2's refusal without C1b, and
the prepared M1 revert. `python3 scripts/test-enrollment-group-concurrency.py`
runs the seat, payment-placement and course-close races. For UI coverage, build
the app and run `node scripts/test-student-placement-browser.mjs`; it checks the
local URL and feature branch, creates synthetic fixtures, and removes them in
finally.

## Release history

Released under explicit owner approval (release steps in the plan): R2 applied
120 (M1) and deployed the application on 2026-10-25; R4 ran the clean-up stages
C1–C5 with the approved counts and C6 matched; R5 applied 121 (M2) on
2026-10-26 ([R1–R3 record](../docs/architecture/evidence/egc-r2-m1-production-2026-10-25.md),
[R4–R5 record](../docs/architecture/evidence/egc-r2-r4-r5-production-2026-10-26.md)).
`scripts/egc-revert-m1.sql` applied only before the clean-up and is no longer a
rollback path; a revert after M2 needs a new forward migration.
