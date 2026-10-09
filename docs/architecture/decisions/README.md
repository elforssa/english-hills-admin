# Architecture decision records

[ARCHITECTURE](../../ai/ARCHITECTURE.md) is the platform entry point. [CURRENT_STATE](../../ai/CURRENT_STATE.md) owns dated implementation/deployment/activation evidence; an ADR records the decision and rationale, not automatic release authority.

| Decision | Current scope |
| --- | --- |
| [ADR-001: CRM lifecycle](ADR-001-crm-lifecycle.md) | Accepted and implemented; status/tasks/activity separation and trusted enrollment conversion. Live policy configuration requires its own evidence. |
| [ADR-002: Meta intake and reconciliation](ADR-002-meta-intake-and-reconciliation.md) | Accepted and implemented, including bounded ownership conflicts; operational evidence is in CURRENT_STATE. |
| [ADR-003: Receptionist operations role](ADR-003-receptionist-operations-role.md) | Approved / partially implemented overall. Batch 1 complete; wider Today/detail/walk-in UX planned. |
| [ADR-004: Meta lifecycle feedback](ADR-004-meta-lifecycle-feedback.md) | Adopted R4/advisory-D2/strict-time model implemented dormant; S1 is current credential architecture. Dormant acceptance and live activation remain distinct. |
| [ADR-005: Operational UI Foundation](ADR-005-operational-ui-foundation.md) | Owner-approved UIF-r1; shared presentation and three pilots implemented on the feature branch with two bounded read-state corrections. CI, independent review, merge and release remain separate; no UIF Production deployment. |
| [ADR-006: Meta Insights live synchronisation](ADR-006-meta-insights-live-sync.md) | **Proposed**, pending owner acceptance of the [Outcome A plan](../plans/director-growth-intelligence.md): live mode on the existing Insights model, a dedicated read-only credential, the repository scheduler pattern, fail-closed publishing and no cross-currency ratios. Not implemented or activated. |

Use [active contracts](../plans/README.md) for implementation/operator scope and [history](../history/README.md) for superseded reasoning. Significant decision changes follow [AGENTS](../../../AGENTS.md); this navigation cleanup changes no decision or approval gate.
