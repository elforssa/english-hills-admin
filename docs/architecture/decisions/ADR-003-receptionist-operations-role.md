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

## Security/invariants

Preserve the [security rules](../../ai/SECURITY_RULES.md), [lifecycle ADR](ADR-001-crm-lifecycle.md) and existing financial audit/conversion boundaries. Never broaden full teacher rows or grant admin as a shortcut. Preserve task/activity/status separation and real acquisition provenance.

## Implementation status

**APPROVED / PLANNED, not fully implemented.** Migration [077](../../../supabase/migrations/077_receptionist_role_and_operational_access.sql) already restores receptionist and narrow operational access. [Current route allowlist](../../../src/lib/roleAccess.mjs) is limited to Today, prospects, placement tests, students list/detail, enrollments and settings. CRM enrollment, placement and history exist, but broad academic, receipt/payment and teacher access plus the specified dashboard/detail redesign are not implemented as this approved package. Existing in-person receipt/student paths are not proof of completed receptionist walk-in UX.

Implementation review must resolve granular operational mutation permissions (especially confirmation, correction/void and teacher field exposure) without changing the approved allow/deny boundary. No new product rule is invented here.
