# ADR-016: Courses with dates and an explicit director close

## Status

**Proposed** (2026-11-05) with the [course dates and close plan](../plans/course-dates-close.md), revision CDC-r1 (Tier 3, plan only). Not reviewed, not approved, not implemented. The owner's answers to the plan's Q1–Q13 may change the decision below; the ADR is updated when the plan is approved.

## Date

2026-11-05.

## Context

A group (`public.groups`) has a school year (`annee`, validated by Batch H) and a free-text term (`terme`), but no start or end date and no closed state. Membership derives from enrollments (ADR-010), and enrollments end only through the Batch D leaver paths: « Ancien apprenant » for one learner, « Clôturer l'année » for a whole school year, archive, and the online course close (`online_close_course`, which has its own term dates). Short courses (Mise à niveau, Adults sessions, Summer Camp, individual lessons) finish within the year, so their paid enrollments stay Confirmed or Validated, and their learners « Inscrit », until the year close. On 2026-11-05 the director's card « Inscrits — groupe à affecter » showed 38 paid enrollments without a group, 18 of them for a Mise à niveau already taught.

## Decision (proposed)

1. **A group carries its course dates.** `date_debut` and `date_fin` on `public.groups`, inside the group's school year; required for the short programmes, optional for Yearly (whose finished-course end defaults to the end of its school year). Online courses keep their own term dates.
2. **A finished course is closed by a person, never by a job.** The director sees the courses whose end date has passed and which still have live learners, and closes each one with « Clôturer le cours ». The close reuses the Batch D leaver core (`end_group_enrollments` → `leave` → `end_enrollment`), so it ends only that course's live enrollments, sets a learner file to « Ancien apprenant » only when nothing else is live, and never touches charges, receipts, payments, attendance or CRM conversions. It checks the expected count (`PT409`, ADR-009), journals before it writes, and returns the original result when repeated.
3. **A closed course is a state of the group.** `closed_at`/`closed_by`, writable only inside the close and reopen commands (trigger-protected against direct table writes); a closed course refuses placement on every path through a trigger on `enrollments` (as the Batch H year guard does), and is hidden from pickers and active lists while staying readable with its past learners. A close made by mistake is undone with « Rouvrir le cours », which restores exactly the journalled enrollments that are unchanged since.
4. **Individual lessons are courses of capacity 1** with their own dates, the model Online One-to-One already follows (plan Q4, recommendation).

## Consequences

- Short-programme groups need dates; an existing one without dates refuses new placements until they are entered (plan Q1).
- « Clôturer l'année » remains the year-end tool; the course close is for courses that end earlier.
- Paid enrollments with no group (« Groupe à affecter ») are not reachable by any course close; the current backlog is handled once by a counted, journalled, separately approved data step.
- One-to-One group names are visible to every signed-in role and must never contain a learner's name.
- Teachers lose the closed course from their rosters (membership-based); teacher read of closed courses is a follow-up.

## Alternatives considered

- **Automatic close at the end date (scheduled job):** ends paid enrollments without anyone checking attendance or late learners; the owner asked for an explicit command.
- **End the enrollments only, without a closed state:** the finished group keeps appearing in every picker and can be refilled by mistake.
- **Dates on the enrollment instead of the group (for One-to-One):** a second close path and attendance without a group, which the schema does not support.
- **Fill dates on existing groups by migration:** guessed data; the director enters the real dates instead.
