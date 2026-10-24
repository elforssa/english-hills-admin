# ADR-011: Portal access — explicit family links, teacher identity by record, projections instead of whole rows

## Status

**PROPOSED** (2026-10-24) with the [portal readiness plan](../plans/portal-readiness.md). Not implemented. The owner approved revision PRF-r1 on 2026-10-24 at head `ba94ad3` (Q1–Q5 and Q7–Q9 = A) and answered Q6 = C the same day; the independent review of head `e90f8f1` returned CHANGES REQUIRED, and revision PRF-r2 applies it and awaits re-review and the owner's re-approval at its exact head ([approval record](../plans/portal-readiness.md#approval-record)). This status is updated at release closeout.

## Date

2026-10-24.

## Context

Teacher, parent and student portals exist but have no accounts yet (0 of each on 2026-10-24). The 2026-10-24 audit found that portal access rests on three weak foundations: a parent or student sees every learner whose free-text `parent_email` / `email` equals their login e-mail (one placeholder address sits on 33 learner records of many families); a teacher's identity is an e-mail lookup that ignores archived records; and RLS decides which rows a portal user sees but not which columns, so teachers and families receive internal notes, contact details and finance diagnostics. Column grants cannot separate portal users from staff because both use the same `authenticated` database role.

## Decision

1. **Family access is an explicit, staff-approved link** (`family_links`: learner, relation `parent` or `self`, account, status, who and when). Links are proposed from the dossier address at invitation, confirmed per child by director/admin, refused for shared or ambiguous addresses, and never created, moved or removed by editing a dossier e-mail. `get_visible_student_ids()` reads only active links; every family policy, storage authorization, messaging rule and online-learning join inherits it.
2. **A teacher account is bound to one teacher record** through the existing protected `profiles.linked_teacher_id`, set at invitation; an archived record grants nothing.
3. **Portal roles read learner, enrollment, receipt, charge, placement, attendance and certificate data only through SECURITY DEFINER projections with fixed column lists**; their direct SELECT policies on those tables are removed. Staff access is unchanged.
4. **Portal messaging uses opaque recipient keys resolved to linked accounts**, server-set sender names and a fixed English Hills sender for non-staff e-mail; no address is shown to teachers or families. **Portal inboxes are keyed by account, not address:** notifications and messages carry a server-set recipient account, a row about a learner is shown only while that account may see the learner, and rows sent to a bare dossier address are e-mail only (PRF-r2, review finding B1).
5. **Teacher visibility follows group membership as defined by [ADR-010](ADR-010-group-membership-from-enrollments.md)** (enrollment-based membership, learner not archived), through one helper used by every teacher reader. Deliberate conflicts (duplicate or revoked links, concurrent re-invitations) use `PT409` per [ADR-009](ADR-009-conflicts-never-retryable.md).

## Consequences

- Invitations for parents and students carry a learner selection; reception's dossier edits no longer affect portal access.
- Every teacher and family page changes its data source to the projections; a cross-role denial suite in CI guards the boundary.
- Existing addresses need a one-time cleanup (normalisation and the placeholder) before families are invited.
- The online-learning pilot's family join rule (ADR-008) moves from e-mail matching to links without changing its own design.

## Alternatives considered

- **Normalised e-mail matching with invite-time checks only.** Cheaper, but access would still follow a field reception edits daily.
- **Column-level grants.** Cannot distinguish staff from portal users sharing the `authenticated` role.
- **Hiding fields in the UI.** Leaves the data in the API response.
- **Security-definer views per role.** Possible, but the repository's established pattern for bounded reads is RPC projections (teacher directory, CRM read models, online rosters), and views would need their own role filters and advisories.
