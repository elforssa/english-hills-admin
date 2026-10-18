# ADR-008: Online learning — embedded provider rooms behind an adapter, lesson-scoped join passes, teacher access by projection

## Status

**PROPOSED** (revision OL-r4, 2026-10-18, of the [online learning plan](../plans/online-learning.md); OL-r1 received CHANGES REQUIRED from the independent review, OL-r2 applied the findings, OL-r3 recorded the owner's Q2 = C1 confirmation, and OL-r4 applies the re-review findings B3 and I5–I7: the migration-096 reception commands, the public form, three missing tests and the student-form placement path). Not approved, not implemented, not deployed. The owner records acceptance in the plan's approval record; this ADR's status changes only with that record and later with release evidence in [CURRENT_STATE](../../ai/CURRENT_STATE.md).

## Date

2026-10-17.

## Context

The owner unparked online learning for architecture on 2026-10-17 ([decision](../../ai/OWNER_DECISIONS.md#online-learning--unparked-for-architecture-2026-10-17)). The platform has groups with free-text schedules, attendance keyed on a calendar date, teacher access derived from `groups.teacher_id` that opens full learner rows to a teacher, and portals matched by e-mail. There is no room, provider, dated lesson or join model ([architecture gap](../../ai/ARCHITECTURE.md#architecture-gaps)). The owner's goals: classes inside the platform under the English Hills brand, phone-first, same logins and finance, and teachers who never see a family's contact details so that families are not drawn into private lessons.

## Decision

1. **Online is a course type, not a separate system.** `Online` and `Online One-to-One` join the shared `session_type` vocabulary; online groups are ordinary `groups` rows extended one-to-one by `online_courses`, so enrolment, placement, receipts and the portals work unchanged.
2. **Dated lessons are first-class.** A weekly pattern generates `online_lessons` with identity, status, effective teacher and Casablanca civil projection; online attendance is keyed on the lesson, and in-person attendance is untouched.
3. **The teacher boundary is structural.** An online group never carries `groups.teacher_id`; the online teacher is recorded on the course and the lesson and reads rosters only through projection RPCs returning first name + initial, level and attendance. The existing teacher rules therefore grant an online teacher nothing.
4. **Joining is a server-issued, per-person, per-lesson pass.** A SECURITY DEFINER RPC checks role, learner link, enrolment or guest row, lesson state, join window, capacity and child consent, logs the pass, and the server mints the provider token from it; no durable room address exists for participants.
5. **The provider sits behind an adapter and a live gate.** One embedded, brandable room per course from a provider chosen by a phone-and-desktop test; the secret is a Vercel Production Secret referenced by name; the provider receives only a display label, a role, an expiry and an opaque reference; its join data is evidence, never attendance.
6. **Capacity and consent are database rules**, not UI hints: a trigger on enrolments at group assignment (for any non-Rejected status, never inside a status transition such as payment-driven confirmation, but including the enrolment write that the student-form placement sync of migration 074 makes) and the guest command enforce seats; a consent row gates every child's room.

## Consequences

- One additive migration touching five vocabulary constraints, re-creating three existing functions by one line each (`crm_start_enrollment`, and the migration-096 reception objects `operational_security.valid_session_level` and `save_receptionist_enrollment`, so that reception's own commands accept the two programmes), and adding the `online_*` tables, a private `online_security` schema and narrow RPCs; new routes wired consistently in middleware, client guard, policy map and sidebar.
- The public registration form and its API keep today's eight programmes through a public subset of the shared list (plan Q15 = A, owner 2026-10-18); enrolment into an online course is reception-only, with no self-serve sign-up.
- Link secrecy and display-name immutability depend on the provider; they are acceptance tests (T-P1–T-P6 in the plan), and a provider that fails them is rejected.
- The in-person teacher portal's existing exposure of a teacher's own learners' e-mails is not fixed by this decision and stays a separate item.
- The CRM keeps its programme list, constraints, Meta mappings and cohort function (owner decision Q2 = option C, 2026-10-17): a lead is enrolled into an online group through the existing CRM path and the programme view attributes that enrolment to the lead's own programme. Because `crm_start_enrollment` hard-codes the accepted programmes, that path works only if its array gains the two online values; the owner confirmed on 2026-10-18 (plan Q2 = C1) exactly that one-line change, re-created from the function's 112 body, with a proof that nothing else in the function changed; no other CRM function, constraint, lead field, Meta mapping or funnel object changes.
- A pass is scoped to a lesson by time, not by room: one room serves a course, passes expire at lesson end plus grace, lessons of a course never overlap, and open passes are revoked on cancellation, guest removal and course close. The activation route, the lesson-action routes, the join route and the webhook route are gated; the fake provider is refused in Production.
- No scheduler, recording, homework, materials, WhatsApp automation, online payment or mobile app is implied.

## Alternatives considered

- **A delivery-mode flag on groups instead of new course types.** Smaller migration, but “online” would not appear as a programme on receipts, the student file or reports, against the owner's decision.
- **Tightening the 071 teacher functions to exclude online groups** while keeping `groups.teacher_id`. Predicate-by-predicate, it would have to be repeated in every policy that reads `groups.teacher_id` directly (006, 044, 059, 063/064, 069); a structural NULL is safer and testable in one assertion.
- **Shareable meeting links (Zoom or similar).** Excluded by the owner: no link to forward, provider brand hidden, join tied to the logged-in person.
- **A self-built or self-hosted video stack.** Out of proportion for a pilot of one group; the adapter keeps a later change possible.
- **Reusing the retired Premium workshop model.** Its objects are scheduled for deletion by Premium retirement Release B and it never modelled remote access.
