# ADR-005: Operational UI Foundation

## Status

**ADOPTED / IMPLEMENTED / PRODUCTION VERIFIED**, 2026-10-06. Contract revisions [UIF-r1 + UIF-r1a](../plans/english-hills-ui-foundation.md). PR #104 merged as `f30e8d9ac628839c2282549324f4a3fa9b5b8ae8`; migration 110 and the matching Production frontend completed bounded release acceptance. Current deployment evidence is in [CURRENT_STATE](../../ai/CURRENT_STATE.md#ui-foundation-production-closeout--2026-10-06).

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

UIF-r1 owner approval and implementation chronology are recorded in the plan and [implementation evidence](../evidence/english-hills-ui-foundation-implementation-2026-10-06.md). Final PR #104 passed exact-SHA CI and independent review, merged as `f30e8d9ac628839c2282549324f4a3fa9b5b8ae8`, and the matching frontend is deployed. UIF-r1 itself adds no schema, RPC or permission change; UIF-r1a supplies only the bounded migration-110 row-label projection amendment described below.

## UIF-r1a amendment — 2026-10-06

The owner explicitly approved [UIF-r1a](../plans/english-hills-ui-foundation.md#uif-r1a--owner-approved-stable-row-staff-identity): compatible existing operational read projections may add safe server labels for already-referenced staff. Migration 110 reuses the migration-109 rule through a private helper shared with the bounded picker; no browser algorithm/directory scan, new public RPC, permission/RLS/private field or business write. The previous no-new-read/migration boundary is superseded only for this amendment; historical blocked evidence is preserved. Tier-3 exact-SHA review and explicit release/operator approval completed before the bounded 2026-10-06 Production closeout.
