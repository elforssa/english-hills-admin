# ADR-016: Courses with dates and an explicit director close

## Status

**Accepted for implementation planning** (Maroine, 2026-11-05) with the [course dates and close plan](../plans/course-dates-close.md), revision CDC-r3 approved at exact head `47a02e6a56f08290f85fe2bf0c703b12fc6a6c19` after the independent plan review returned READY FOR OWNER APPROVAL (CDC-r1 and CDC-r2 were each reviewed CHANGES REQUIRED the same day). Answers: Q1 and Q3–Q18 all A; OA1–OA6 as recorded. They are recorded verbatim in the plan's approval record and in [OWNER_DECISIONS](../../ai/OWNER_DECISIONS.md#courses-with-dates--close-a-finished-course--approved-for-implementation-2026-11-05). Implementation, migration 128, the one-time step and every Production step need their own approval. Nothing is implemented.

## Date

2026-11-05.

## Context

A group (`public.groups`) has a school year (`annee`, validated by Batch H) and a free-text term (`terme`). It has no start or end date and no closed state.

Membership derives from enrollments (ADR-010). Enrollments end only through the Batch D leaver paths:

- « Ancien apprenant » for one learner;
- « Clôturer l'année » for a whole school year, which ends every live enrollment of the year;
- archive;
- the online course close (`online_close_course`, which has its own term dates).

Short courses (Mise à niveau, Adults sessions, Summer Camp, individual lessons) finish within the year, so their paid enrollments stay Confirmed or Validated, and their learners « Inscrit », until the year close. On 2026-11-05 the director's card « Inscrits — groupe à affecter » showed 38 paid enrollments without a group, 18 of them for a Mise à niveau already taught.

Every signed-in role, parents and students included, can read every group row.

## Decision

1. **A group carries its course dates.** `date_debut` and `date_fin` sit on `public.groups`, inside the group's school year. They are required for the short programmes and optional for Yearly. A Yearly group counts as finished only once it has an end date. Online courses keep their own term dates. The date window is checked inside the year guard, so it never depends on trigger order.
2. **A finished course is closed by a person, never by a job.**
   - The director sees the courses whose end date has passed and closes each one with « Clôturer le cours »; an empty group can be closed at any time.
   - The close reuses the Batch D leaver core (`end_group_enrollments` → `leave` → `end_enrollment`). It ends only that course's live enrollments, plus the unplaced paid enrollments of the same programme, year and level that the director chooses to attach or end.
   - A learner file becomes « Ancien apprenant » only when nothing else is live.
   - The close never touches charge amounts, receipts, payments, attendance or CRM conversions.
   - It links the partly paid open unlinked tuition charges to the enrollment it ends, so a later payment on them cannot re-create a Confirmed enrollment. Commitments with nothing paid (« engagements », often for a next session) and undated charges of earlier school years are shown and never linked.
   - It takes the learners, then marks (locks) the group row, and only then attaches or ends anything. Every path that enters a group takes the group row before the group's seat lock (the capacity trigger is re-created with a share lock for that order only), so the close and a placement through `place`, or a direct write of a learner the close does not hold, cannot deadlock on the seat lock. A direct API update of `enrollments.group_id` for a learner the close already holds can still deadlock with it: a known, pre-existing limitation, out of scope, since the application never writes that column directly.
   - It checks the expected count after the mark (`PT409`, ADR-009), journals before it writes, rolls back if it would end anything it did not count, and returns the original result when repeated.
3. **A closed course is a state of the group.**
   - The mark is `closed_at`/`closed_by`. Only the close, reopen and year-close commands can write it; a trigger protects it against direct table writes.
   - A closed course refuses placement on every path through a trigger on `enrollments`. That trigger share-locks the online course row for online groups.
   - A closed course is hidden from pickers and active lists, while name lookups and its page keep it readable with its past learners.
   - « Rouvrir le cours » undoes a close made by mistake. It restores exactly the journalled enrollments that are unchanged since, locking learners before the group.
4. **The year close knows about courses.** « Clôturer l'année » never ends an enrollment in a course that ends after the close date, and leaves waiting the paid enrollments without a group of a short programme whose course has not ended (Q18 = A: also when that course is not created yet). It locks the year's group rows after the learners and marks closed, in a separate statement, only those left without a live learner: the Yearly groups of that year and (Q16 = A) the other groups it empties. Its dialog reads its numbers from a director preview.
5. **Group rows are family-scoped for parents and students.** They read only the groups of their own learners, past groups included. Staff keep reading every group. A group name never carries a learner's name.
6. **Individual lessons are courses of capacity 1** with their own dates, the model Online One-to-One already follows (Q4 = A).

## Consequences

- Short-programme groups need dates. An existing one without dates refuses new placements until they are entered (Q1 = A). Existing test fixtures gain dates.
- « Clôturer l'année » remains the year-end tool. The course close is for courses that end earlier, and summer courses survive the year close, together with their paid learners who are not placed yet.
- A paid enrollment without a group is reached either by the close of a course of its programme, year and level (the director chooses per row) or by the counted, journalled, separately approved one-time step for the current backlog.
- « Inscrits — groupe à affecter » counts only programmes that use groups.
- While the previous application build runs against the new database (release gap, application rollback), it cannot create short-programme groups. A longer rollback needs the database restore.
- Teachers lose the closed course from their rosters, which are membership-based. Teacher read of closed courses is a follow-up.

## Alternatives considered

- **Automatic close at the end date (scheduled job):** ends paid enrollments without anyone checking attendance or late learners. The owner asked for an explicit command.
- **End the enrollments only, without a closed state:** the finished group keeps appearing in every picker and can be refilled by mistake.
- **Dates on the enrollment instead of the group (for One-to-One):** needs a second close path and attendance without a group, which the schema does not support.
- **Fill dates on existing groups by migration:** guessed data. The director enters the real dates instead.
- **Change the payment command to refuse an implicit enrollment after a close:** changes a finance-critical function and blocks a genuine second session in the same year. Linking the open charges at the close avoids both.
