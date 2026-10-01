# Durable product rules

> **Production verified — 2026-10-01:** PR #47 reviewed head `f823b62a3bb06d40b1f572927bfa2af60fd4c857` merged and deployed as `02ffccab1519c0b381196ef9e5f938a908fdd105`; ledger 001–103 and advisory R4 controls are verified dormant. Lifecycle inventory is zero, cron disabled and server live gate absent; existing intake is healthy. [Dated release evidence and limitations](../architecture/evidence/crm-r4-advisory-production-2026-10-01.md). Earlier not-merged/not-deployed or two-event baseline statements below are historical and superseded for current deployment state. Provider seed, Meta/credential changes, H3 and H4 remain unauthorized.

> Finally owner-approved 2026-10-01 (PR #46, architecture head `c404815`): [R4 advisory D2 amendment](../architecture/plans/completed/crm-meta-funnel-r4-d2-advisory.md) changes custom proof from mandatory to recommended while preserving platform/legal/privacy, source/identity, prospective cutoff, producer ownership, five-event and no-uncertain-replay safeguards. Any mandatory-D2 text below describes the deployed baseline until reviewed forward implementation; actual withdrawals/stops remain enforceable even without a grant. The approved opportunity/contact/pending stop scopes and exact lock/retention contract are part of this architecture. Migration 103 and compatible runtime/UI are implemented on `codex/r4-advisory-d2`, pending exact-head CI and independent review; see the [implementation record](../architecture/evidence/crm-r4-advisory-implementation-2026-10-01.md). This branch is not merged or deployed; deployment is NOT authorized; H3/H4 are NOT approved and remain blocked. [Final approval record](../architecture/plans/completed/crm-meta-funnel-r4-d2-advisory.md#final-owner-architecture-approval-2026-10-01).

These invariants combine current implementation with the explicitly approved receptionist direction, whose unimplemented parts live only in [ADR-003](../architecture/decisions/ADR-003-receptionist-operations-role.md).

## Commercial lifecycle and follow-up

`NEW → CONTACTING → ENGAGED → QUALIFIED → CONVERTED`; `LOST` and `NOT_QUALIFIED` are reasoned closures. This is the commercial progression, not a requirement to manufacture every intermediate event. Commands enforce actual transitions and evidence.

- **Status:** where the prospect is commercially.
- **Task:** what must happen next, with timing and completion/cancellation.
- **Activity:** what actually happened, retained as history. An internal note supplies context, not a substitute for a decision or next action.
- Outreach cycle: Day 1 two failed calls; Day 2 one; Day 4 one; Day 6 one. Default SQL policy offsets are `[0,0,1,3,5]`, anchored to the first actual failed call, adjusted to configured Casablanca calling windows and minimum spacing. Meaningful conversations reset the uninterrupted sequence. Published policy versions are immutable; actual operating hours must be configured, not invented.
- Failed phone outcomes counted are no answer, busy, declined and unreachable. Wrong number and WhatsApp are not failed-call attempts. Five failures stop automatic sequence scheduling; they **never automatically mark Lost**. Further explicit calls remain possible; closure is a separate audited action.

Implementation caveat: SQL validates five ordered offsets with the first two on Day 1, but allows later offsets beyond the approved Day 2/4/6 cadence. The approved cadence above is the product rule; do not assume the live policy matches it without inspecting authorized configuration. Changing that product cadence needs an explicit decision.

Sources: [078 schema](../../supabase/migrations/078_crm_core_schema.sql), [080 commands](../../supabase/migrations/080_crm_commands_and_followup_engine.sql), [082 conversation decisions](../../supabase/migrations/082_crm_conversation_decision.sql), [ADR-001](../architecture/decisions/ADR-001-crm-lifecycle.md).

## Conversion and finance

Only trusted linked enrollment reaching `Confirmed` or `Validated` converts a lead. `crm_start_enrollment` initiates Submitted/Trial from a qualified unlinked lead; initiation alone is not conversion. Conversion retains student, enrollment, timestamp and activity evidence. A subsequent downgrade flags review instead of deleting historical conversion. Payment may drive enrollment confirmation through the financial engine, but payment, revenue and conversion remain separate facts.

A charge is an agreement; a nonzero payment issues a receipt. Zero payment may create a charge but no receipt or payment-driven enrollment. Collected CRM revenue derives from actual linked payment/void events, not quotes, charge totals or a status change. Preserve idempotency and append-only financial history. See [084](../../supabase/migrations/084_crm_enrollment_and_conversion.sql), [085](../../supabase/migrations/085_crm_revenue_attribution.sql), and [receipt model](../receipt-financial-model.md).

## People, opportunities and academics

Contact, lead/prospect, and learner/student are distinct. A parent/contact can represent multiple learners and separate program opportunities. Shared phone alone is insufficient to merge siblings, attach a student or reuse an enrollment. Ambiguity requires review; never infer a child's name from the contact's name.

Immutable form mappings decide whether learner identity is required or optional. An optional unnamed inquiry can be actionable with corroborated contact and program; age ranges remain form answers, not invented integer ages. [Mapping policy](../crm-mapping-learner-policy.md).

Enrollment and group session/level must agree. Confirmed enrollment without a group is valid and awaits placement; assigning a group yields Validated. Removing a group preserves confirmed enrollment and historical attendance. See [enrollment workflow](../../scripts/README-enrollment-workflow.md).

First acquisition touch is immutable; later submissions update latest touch without rewriting attribution. Manual prospects and website inquiries must not be represented as fake Meta acquisitions.

## Approved Meta lifecycle uncertainty rule — implemented dormant on the revision-4 branch

On 2026-09-30 the owner approved no uncertain replay: unknown/ambiguous outcomes after a request may have crossed the network boundary must be held for review, without automatic resend unless authoritative provider evidence later establishes replay safety. Revision-4 migration 102 implements the irreversible started/confirmed/unknown attempt boundary, stale-lease handling and director-retry denial for the prospective revision-4 model. Known-safe pre-dispatch lease recovery remains possible. No numeric provider deduplication window is invented. [ADR-004](../architecture/decisions/ADR-004-meta-lifecycle-feedback.md#approved-no-uncertain-replay-policy--2026-09-30-activation-revision-3) and [activation plan revision 3](../architecture/plans/crm-batch2-meta-lifecycle-activation.md) record the decision. This is branch implementation, not merge, deployment or activation; H3/H4 remain blocked.


Final owner approval on 2026-09-30 for [revision 4](../architecture/plans/crm-meta-funnel-revision-4.md) extends the future event scope to Option B and approves repeated Qualified/closure occurrences, singleton Intake/Converted, Qualified initial target and chronological-attempt ordering. Migrations 101–102 implement those rules around the existing outbox for a separately compliant future cohort. An earlier potentially dispatched unknown stays unreplayable; missing receipt alone does not permanently suppress later genuine independently eligible outcomes. D2–D7 and all privacy/prospective/ownership restrictions remain mandatory. Production remains dormant/two-event; the revision-4 branch is not merged or deployed, and H3/H4 remain blocked.
