# Architecture decision records

Read [current state](../../ai/CURRENT_STATE.md) before interpreting implementation status. Dates below record this documentation/approval capture, not inferred original design dates. Alternatives are tradeoffs identified from the current design, not claims about undocumented historical deliberations.

- [ADR-001: CRM lifecycle](ADR-001-crm-lifecycle.md) — accepted, implemented; policy configuration is deployment-specific.
- [ADR-002: Meta intake and reconciliation](ADR-002-meta-intake-and-reconciliation.md) — accepted, implemented on main; primary scheduler Production activation verified 2026-09-29; current operational evidence lives in CURRENT_STATE.
- [ADR-003: Receptionist operations role](ADR-003-receptionist-operations-role.md) — APPROVED / PARTIALLY IMPLEMENTED; Batch 1 (PRs #31/#32, 096/097) COMPLETED and Production verified per owner evidence on 2026-09-29; wider UX remains planned.

- [ADR-004: Meta lifecycle feedback consumes CRM facts](ADR-004-meta-lifecycle-feedback.md) — APPROVED / IMPLEMENTED DORMANT, plan revision 2; D1–D7 Option A owner-approved on 2026-09-29. PR #34 and migrations 098–100 completed Production verification on 2026-09-30 with the lifecycle cron inactive and all activation state empty. Live activation remains pending H3/H4 provider-contract, form, entitlement, credential and prospective activation prerequisites.

Change significant decisions here and synchronize the relevant [context documents](../../../AGENTS.md). Never turn an approved future design into a claim about deployed permissions.

ADR-004 also records **final owner approval of revision 4** on 2026-09-30 after PR #40: Option B, occurrence/singleton semantics, Qualified initial target and chronological-attempt ordering; see the [approved plan](../plans/crm-meta-funnel-revision-4.md). D2–D7 remain unchanged. Implementation is NOT completed, deployment is NOT authorized and H3/H4 remain blocked; Production retains the dormant two-event implementation.

ADR-004 also records the [adopted S1 credential amendment](ADR-004-meta-lifecycle-feedback.md#adopted-amendment--simplified-credential-security-s1-2026-10-05), PR #93 / `284c2fe32014f8f3011ac6677ddfe99b0a16ca22`: one final credential, bounded validation and Vercel-only custody. Conflicting R7 bootstrap/transport procedure is historical. The [Gate-B runbook](../plans/crm-h3-s1-gate-b-credential-runbook.md) awaits focused review/operational approval; no runtime or Production change.
