# ADR-010: Group membership derives from enrollments

**Status: PROPOSED** (2026-10-24, with plan revision EGC-r1). Not accepted, not implemented. Acceptance requires the owner's approval of the [enrollment and group consistency plan](../plans/enrollment-group-consistency.md) and its decisions D1–D7. The owner approved the plan on 2026-10-24 at head `50da715` ([approval record](../plans/enrollment-group-consistency.md#approval-record)); this status is updated at release closeout (R6).

## Context

A learner's group is stored twice: `students.groupe_id` (one value) and `enrollments.group_id` (one per enrollment). Migrations [070](../../../supabase/migrations/070_enrollment_student_atomic_sync.sql), [072](../../../supabase/migrations/072_paid_enrollment_without_group.sql) and [074](../../../supabase/migrations/074_enrollment_workflow_consistency.sql) keep them in step with two triggers that write each other's table. Readers disagree on which copy counts: rosters, attendance and teacher access use the union, while announcements and teacher file access use `groupe_id` only. The 2026-10-24 audit found that this design removes a learner from their Yearly group when a second programme is placed (DAT-1), leaves 36 learners in groups without an enrollment (DAT-2), lets a group edit block payments (ACA-1), lets a legacy row silently clear a group (ACA-4), and cannot express "this learner has left" (ACA-2, ACA-3).

## Decision (proposed)

1. A learner is a member of a group if and only if they have an enrollment in that group with status Validated or Trial and the learner is not archived. One private helper implements the rule; every reader uses it.
2. At most one live enrollment per learner, programme and school year; one group per enrollment. A learner can therefore be in one group per programme at the same time (owner decision D1).
3. `students.groupe_id`, `session_type` and `niveau_cefr` become a database-maintained "main group" copy, written only by the enrollment sync; direct writes are refused.
4. Leaving is explicit: a new terminal enrollment status `Ended` (group moved to `ended_group_id`), set by management leaver, year-close and archive commands. Learner status derives from enrollments; `Alumni`/`Inactive` are set only by those commands.
5. A populated group's programme and level are immutable for every role; in-person capacity is enforced at group assignment.

## Alternatives considered

- **Patch the single `groupe_id`** (prefer the current group in the sync, back-fill data, extend the announcements policy). Smaller, but keeps two writable copies, one group per learner in the dossier, the cross-writing triggers and the status drift; every new reader must remember the union. Rejected as the long-term model; its useful parts (prefer the current group, back-fill) are kept inside the chosen design.
- **Drop `students.groupe_id` now.** Cleanest, but about ten database objects and nine screens read it; removing it in the same batch adds risk without user benefit. Deferred: once every reader uses the helper, a later batch can drop the column.
- **Reuse `Rejected` for leavers.** No schema change, but it conflates "admission refused" with "programme finished", turns every leaver into a CRM conversion review and keeps the group on the row, so online seat counts would still include leavers. Rejected.

## Consequences

- Membership, rosters, attendance, teacher and family visibility can no longer disagree.
- Every placement creates or uses an enrollment; staff lose the shortcut of editing the learner file's group.
- About a dozen functions are re-created (payment wrapper, reception commands, sync, readers) and, with D5-A, two CRM functions change by a few lines. Delivered in two migrations with an owner-approved data clean-up between them.
- Existing data must be back-filled before the readers switch (the second migration refuses otherwise).
- Online courses are term-based: with the one-live-enrollment-per-programme-per-year rule, closing an online course ends its enrollments (owner decision D8 = A, 2026-10-24, plan revision EGC-r2); exempting online programmes from the rule was rejected.
