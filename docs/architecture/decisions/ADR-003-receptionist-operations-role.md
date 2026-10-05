# ADR-003: Dedicated receptionist operations role

## Status

**APPROVED / PARTIALLY IMPLEMENTED.** Batch 1 permissions are merged and deployed per repository-owner evidence; the wider dashboard, CRM detail and walk-in direction remains planned. This document does not authorize deployment of follow-up changes.

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

### Proposed Outcome-3 presentation amendment — O3-r2, 2026-10-05

**PROPOSED; not yet owner-approved or implemented.** The [single Outcome-3 contract](../plans/outcome-3-receptionist-workspace.md) defines the remaining operating workspace. Its approval record must be completed before implementation; existing Batch 1 permission approval is unchanged.

Upon owner acceptance of O3-r2, Opportunities (Board/List over the same CRM leads) becomes the default CRM workspace, and Today becomes Tasks/My Work over the existing task engine. Reuse the right-side `LeadDetailSheet`; prioritize contact/learner, quick actions, stage/owner and next action, then placement/enrollment, acquisition, important form answers and timeline. No generic pipeline or second task/detail system is introduced.

This proposal explicitly replaces the earlier presentation instruction “Remove call-launch buttons” with a visible Call panel offering phone/copy/device handler plus separate explicit outcome recording. Current `CrmWorkspace` already has device call links, which conflicts with that earlier wording. Launching/copying never records an attempt; only the existing guarded outcome command does. WhatsApp launch likewise proves no message was sent. No backend attempt, outreach, status, enrollment, finance or permission semantics change. Until approval, this is a proposed reconciliation, not a retroactive claim that the old direction was implemented.

The contract also specifies fixed system Views, semantic action dialogs for drag/drop, bounded reads, a date/agenda Admissions Calendar over existing records, and explicit unsupported placement cancellation. Walk-in redesign remains outside Outcome 3. See the contract for exact owner decisions, risk and implementation acceptance rather than a second design here.

### Walk-in

Use the same underlying enrollment/payment engine as CRM enrollment. Do not force a walk-in through a fake Meta lead. Create a manual prospect only if they are not enrolling yet. Preserve learner matching, explicit enrollment identity, financial idempotency and existing confirmation rules.

## Alternatives considered

- Making receptionist admin would expose integrations, management functions and HR/payroll.
- Sidebar-only restrictions would leave direct routes/API/database access unprotected.
- A separate walk-in finance engine would duplicate payment/conversion rules.
- Fake Meta leads would corrupt acquisition and attribution evidence.

## Consequences

Implement the expanded role across navigation, page guards, APIs/RPCs and RLS together. Operational finance and teacher views need boundaries distinct from analytics/HR. Do not infer authorization for destructive corrections, financial voids or privileged confirmation merely from “full operational”: specify and review granular commands before implementation.

### Batch 1 architecture refinement

[Receptionist Batch 1 permissions plan](../plans/completed/receptionist-batch1-permissions.md) was the implementation contract for operational permissions and navigation across UI, route, API/RPC and database layers. Merged PR #31 added a shared application capability map, separately enforced SQL authorization, safe teacher projections and the existing enrollment/payment engines in migration 096. The owner reports 096 deployed in Production. PR #32 merged and deployed the shared Students UI correction and migration 097. Batch 1 is COMPLETED, Production verified per owner evidence on 2026-09-29.

Receptionist and management roles should use one operational Students list layout and its bounded filters, payment state and placement context. Capability gates remove only management actions such as bulk import/export, unrestricted programme edits and student archive. The receptionist form remains a narrow security adapter for its distinct RPC write contract; student detail and the list layout are shared. Do not create a second simplified receptionist list.

For Batch 1, keep financial void/correction/deletion/cancellation director-only; allow ordinary charge/payment/receipt operations and their existing trusted confirmation effects. Keep teacher HR and authorization-sensitive identity edits restricted. Reuse receipt routes for operational finance while denying the analytics `/finance` page. These conservative boundaries require no new destructive-finance product decision; widening them later requires explicit approval. The plan's exact matrices govern implementation, not broad interpretation of “full operational.”

## Security/invariants

Preserve the [security rules](../../ai/SECURITY_RULES.md), [lifecycle ADR](ADR-001-crm-lifecycle.md) and existing financial audit/conversion boundaries. Never broaden full teacher rows or grant admin as a shortcut. Preserve task/activity/status separation and real acquisition provenance.

## Implementation status

**APPROVED / PARTIALLY IMPLEMENTED.** Migration [077](../../../supabase/migrations/077_receptionist_role_and_operational_access.sql) restored receptionist and narrow operational access. Merged Batch 1 PR #31 added [096](../../../supabase/migrations/096_receptionist_operational_permissions.sql), operational UI/routes and tests; the owner reports Production deployment. PR #32 and migration 097 are merged, deployed and Production verified per owner evidence on 2026-09-29. Batch 1 is COMPLETED. Dashboard/detail redesign and a dedicated walk-in journey remain planned. Existing in-person receipt/student paths do not complete that UX.

The Batch 1 plan resolves implementation boundaries conservatively: no free confirmation or destructive finance powers, explicit safe teacher fields, and no identity reassignment. Broader destructive/HR/identity powers remain outside this approval. The later dashboard/detail/walk-in redesign remains planned.
