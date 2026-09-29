# Architecture decision records

Read [current state](../../ai/CURRENT_STATE.md) before interpreting implementation status. Dates below record this documentation/approval capture, not inferred original design dates. Alternatives are tradeoffs identified from the current design, not claims about undocumented historical deliberations.

- [ADR-001: CRM lifecycle](ADR-001-crm-lifecycle.md) — accepted, implemented; policy configuration is deployment-specific.
- [ADR-002: Meta intake and reconciliation](ADR-002-meta-intake-and-reconciliation.md) — accepted, implemented on main; primary scheduler Production activation verified 2026-09-29; current operational evidence lives in CURRENT_STATE.
- [ADR-003: Receptionist operations role](ADR-003-receptionist-operations-role.md) — APPROVED / PARTIALLY IMPLEMENTED; Batch 1 (PRs #31/#32, 096/097) COMPLETED and Production verified per owner evidence on 2026-09-29; wider UX remains planned.

- [ADR-004: Meta lifecycle feedback consumes CRM facts](ADR-004-meta-lifecycle-feedback.md) — APPROVED, plan revision 2; D1–D7 Option A owner-approved on 2026-09-29. Batch 2 NOT implemented, NOT deployed and NOT Production verified; Production release NOT approved. Official provider-contract verification remains required before live transport completion; active-form evidence readiness remains required before activation. Architecture approval is distinct from implementation completion, merge, deployment, Production verification and release approval.

Change significant decisions here and synchronize the relevant [context documents](../../../AGENTS.md). Never turn an approved future design into a claim about deployed permissions.
