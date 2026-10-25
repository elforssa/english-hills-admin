# Enrollment and group workflow

Plan [EGC-r2](../docs/architecture/plans/enrollment-group-consistency.md)
(migrations 120 and 121; merged, not deployed). Until the release steps R2–R5,
Production keeps the 073/074 behaviour described in the plan's verified state.

## Membership and status

A learner is a member of a group when a Validated or Trial enrollment of that
learner has that group and the learner is not archived. This is the only rule;
after M2 attendance, teacher access, messaging, storage, announcements, rosters
and the Students list all read it. The learner file's group (`groupe_id`) is the
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
through `end_learner`, `close_school_year` or archiving, Prospect otherwise.
Manual creation and CSV imports create Prospect files (an imported Alumni or
Inactive status is kept). Payments no longer set the status: it follows the
enrollment the payment confirms, and an Other or legacy-balance receipt changes
none. Public pre-registration still creates Prospect / Submitted records.

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

## Deployment order

Production deployment requires explicit approval under AGENTS.md (release steps
in the plan): R2 apply 120 (M1) and deploy the application immediately, outside
reception hours; R3 checks; R4 the clean-up dry-run counts, owner approval of the
numbers, then C1–C6; R5 apply 121 (M2), which refuses while any learner breaks
the rules. Before R4, `scripts/egc-revert-m1.sql` is the prepared forward revert
of M1. Production has not been changed by the local verification described here.
