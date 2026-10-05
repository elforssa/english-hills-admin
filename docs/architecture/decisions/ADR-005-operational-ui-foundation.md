# ADR-005: Operational UI Foundation

## Status

**OWNER-APPROVED — implementation authorized**, 2026-10-05. Contract revision [UIF-r1](../plans/english-hills-ui-foundation.md). The owner explicitly approved the complete UIF-r1 implementation scope in the implementation task; approval evidence is recorded in the plan. Merge, deployment and Production release remain unauthorized.

## Context

The completed source UI proposal and receptionist QA found reusable primitives alongside inconsistent controls, vocabulary, filter composition and read-state presentation. Completed O3-r2 already owns CRM operational semantics. A foundation must consolidate presentation without absorbing new product workflows or reinterpreting those semantics.

## Decision

Retain Tailwind, shadcn/Radix, Lucide and Recharts. Use shared semantic tokens and small controlled presentation components, with domain-owned queries, commands, permission gates and labels. Establish the foundation through Opportunities + lead drawer, Tasks / My Work, and Students list/detail as one implementation outcome. Do not build universal entity tables, form engines or dashboard builders, or mandate conversion of every existing page.

The four binding presentation invariants are authoritative server/database Casablanca scheduled-time display, composable URL/filter/navigation state, stable safe operational staff labels, and truthful distinct read states. The [plan](../plans/english-hills-ui-foundation.md#four-interaction-invariants) specifies their behavior and acceptance tests. PR #102's four corrections are adopted on main at merge commit `3c462f7fce87261ff92c565fecf8ab652262bb81`; migration 109 and the matching Production frontend were subsequently verified compatible, as recorded by [CURRENT_STATE](../../ai/CURRENT_STATE.md#post-outcome-3-receptionist-ux-correction-production-closeout) and the [bounded release closeout](../evidence/receptionist-production-ux-corrections-2026-10-05.md#production-closeout--2026-10-05). UIF implementation must still branch from then-current main only after owner acceptance of UIF-r1.

## Consequences and boundaries

Shared token changes require compatibility checks beyond the pilots. Future authorized screens adopt the foundation when touched. Bounded dashboard and Placement load-state corrections may accompany the pilots only with identical read contracts. Enrollment confirmation/rejection/email safety, unassigned-work behavior, placement redesign/cancellation, new dossier continuity reads and dedicated walk-in completion remain separate outcomes.

[ADR-001](ADR-001-crm-lifecycle.md), [ADR-003](ADR-003-receptionist-operations-role.md) and [product/security rules](../../ai/PRODUCT_RULES.md) remain unchanged. No new permissions, data model, RPC semantics, finance or enrollment behavior follows from a shared component. Tier-2 review and separate owner implementation/release gates remain governed by [AGENTS](../../../AGENTS.md).

## Alternatives

- Continue page-local styling: lower initial effort, but repeats accessibility, terminology and state inconsistencies.
- Replace all pages or introduce a universal UI engine: larger risk and speculative abstractions without a coherent bounded outcome.
- Selected approach: reuse-first primitives proven by three distinct operational surfaces, with future-page guidance.

## Implementation evidence

UIF-r1 owner approval is recorded in the plan. Source implementation on `codex/ui-foundation-implementation` is based on main `b8fe8eb31659358e9c2817e0f5740716bc29f6d5`; the [usage guide](../../ui/operational-foundation.md) describes the small shared primitives and domain adapters. [Implementation evidence](../evidence/english-hills-ui-foundation-implementation-2026-10-06.md) records local validation and the separate CI/review/release holds. Source implementation is not merge, deployment or Production verification. No schema, RPC or permission change belongs to UIF-r1.
