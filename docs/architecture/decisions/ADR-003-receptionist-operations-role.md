# ADR-003: Dedicated receptionist operations role

## Status

**APPROVED / PLANNED, not fully implemented.** Explicit product decision supplied for this context foundation; this document does not authorize production deployment.

## Date

2026-09-29 (approval captured in repository).

## Context

Reception needs complete daily operational workflows without management analytics, integration administration or compensation exposure. The dedicated role already exists, but its current allowlist and database interfaces cover only a subset of the approved operating model.

## Decision

Keep `receptionist` as a dedicated role. Do not make receptionist an admin.

| Target access | Scope |
| --- | --- |
| Full operational | Receptionist dashboard / Today; CRM / Prospects; placement tests; pre-enrollment/admissions; learners/students; academic area; groups and group assignment. |
| Full operational finance | Finance operational workflows, receipts, payments, balances/payment schedules as supported. |
| Full operational teacher area | Teacher profiles, schedules, groups and academic assignments, excluding all compensation data. |
| Denied analytics | Finance analytics/management dashboards; revenue, profitability, ROAS and CAC analytics; marketing analytics; director-only reports/dashboard. |
| Denied administration | Meta configuration; form mappings/integration configuration; users/roles; system settings. |
| Denied sensitive HR | Teacher salary, payroll, compensation, teacher payment history; HR/payroll. |

Operational finance access is not management analytics access. Teacher profile access requires a safe operational projection rather than exposing existing HR-bearing teacher rows.

### Receptionist dashboard

“What do I need to do today, and what is at risk of being forgotten?”

Planned elements: new prospects, overdue actions, callbacks today, expected center visits, placement tests today, enrollments to finish, learners without group, operational payment/receipt actions. No management analytics.

### CRM detail

Remove call-launch buttons; keep phone number and copy, and keep WhatsApp. Retain dedicated recording of phone-call outcomes because failed-call policy depends on phone attempts. Place form answers near the top and make next action prominent. Internal note remains context-only. Represent a center visit as a task, not merely QUALIFIED status. History must be re-expandable.

### Walk-in

Use the same underlying enrollment/payment engine as CRM enrollment. Do not force a walk-in through a fake Meta lead. Create a manual prospect only if they are not enrolling yet. Preserve learner matching, explicit enrollment identity, financial idempotency and existing confirmation rules.

## Alternatives considered

- Making receptionist admin would expose integrations, management functions and HR/payroll.
- Sidebar-only restrictions would leave direct routes/API/database access unprotected.
- A separate walk-in finance engine would duplicate payment/conversion rules.
- Fake Meta leads would corrupt acquisition and attribution evidence.

## Consequences

Implement the expanded role across navigation, page guards, APIs/RPCs and RLS together. Operational finance and teacher views need boundaries distinct from analytics/HR. Do not infer authorization for destructive corrections, financial voids or privileged confirmation merely from “full operational”: specify and review granular commands before implementation.

### Batch 1 architecture refinement — implemented on branch

[Receptionist Batch 1 permissions plan](../plans/receptionist-batch1-permissions.md) is the implementation contract for operational permissions and navigation across UI, route, API/RPC and database layers. The implementation branch adds a shared application capability map, separately enforced SQL authorization, safe teacher projections and the existing enrollment/payment engines in forward migration 096. Production deployment is separate and unapproved.

For Batch 1, keep financial void/correction/deletion/cancellation director-only; allow ordinary charge/payment/receipt operations and their existing trusted confirmation effects. Keep teacher HR and authorization-sensitive identity edits restricted. Reuse receipt routes for operational finance while denying the analytics `/finance` page. These conservative boundaries require no new destructive-finance product decision; widening them later requires explicit approval. The plan's exact matrices govern implementation, not broad interpretation of “full operational.”

## Security/invariants

Preserve the [security rules](../../ai/SECURITY_RULES.md), [lifecycle ADR](ADR-001-crm-lifecycle.md) and existing financial audit/conversion boundaries. Never broaden full teacher rows or grant admin as a shortcut. Preserve task/activity/status separation and real acquisition provenance.

## Implementation status

**APPROVED / PARTIALLY IMPLEMENTED ON BRANCH, not deployed by this PR.** Migration [077](../../../supabase/migrations/077_receptionist_role_and_operational_access.sql) restored receptionist and narrow operational access. The Batch 1 branch adds [096](../../../supabase/migrations/096_receptionist_operational_permissions.sql), operational UI/routes and tests. Dashboard/detail redesign and a dedicated walk-in journey remain planned. Existing in-person receipt/student paths do not complete that UX.

The Batch 1 plan resolves implementation boundaries conservatively: no free confirmation or destructive finance powers, explicit safe teacher fields, and no identity reassignment. Broader destructive/HR/identity powers remain outside this approval. The later dashboard/detail/walk-in redesign remains planned.
