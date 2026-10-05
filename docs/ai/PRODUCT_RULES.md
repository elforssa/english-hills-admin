# Durable product rules

Implementation and deployment evidence belongs in [CURRENT_STATE](CURRENT_STATE.md). The [pre-Outcome-1 snapshot](../architecture/history/product-rules-before-outcome-1.md) preserves historical status announcements. These invariants combine current implementation with approved receptionist direction; unimplemented UX remains in [ADR-003](../architecture/decisions/ADR-003-receptionist-operations-role.md).

## H3 strict provider time — approved revision 5

For all five live lifecycle kinds, exported activity `event_time` seconds must be strictly greater than the original Meta submission generation seconds. Equal seconds, including subsecond ordering that floors to equality, stay held; no +1 second, dispatch-time substitution, replacement Intake or fabricated attempt may advance successors. Existing chronological-attempt ordering can consequently hold later unattempted occurrences; existing deadline/epoch/retention behavior remains. [Approved contract](../architecture/plans/crm-h3-technical-readiness.md#strict-timestamp-and-equality-contract--approved-correction). Implemented by migration 104; deployment evidence is in [CURRENT_STATE](CURRENT_STATE.md).

## Reusable acquisition platform — owner clarification 2026-10-01

Support simultaneous Meta Instant Forms, website forms and campaigns/ads. Campaigns may reuse forms; attribution stays separate from connection/form configuration. Adding a campaign must not require code changes. Add supported sources through immutable configuration/mappings; preserve the shared CRM lifecycle and outbox. Future Instant Forms enter EH directly, without routing through the legacy Yearly Sheet/Apps Script/Zapier chain.

Website product direction is durable EH intake followed promptly by acquisition CAPI `Lead`, then later CRM outcomes through a separate website matching adapter. This is future scope, not deployed behavior or permission to extend the current original-Meta-lead-ID-only contract. H3 is independent of the next campaign/source and Yearly retirement. Exact source producer exclusion and any necessary intentional legacy stop/drain are H4 activation work. [ADR clarification](../architecture/decisions/ADR-004-meta-lifecycle-feedback.md#owner-clarification-reusable-acquisition-platform-2026-10-01) and [implemented capabilities/platform gaps](../architecture/evidence/crm-multi-source-readiness-2026-10-01.md).

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

## Approved Meta lifecycle uncertainty rule

On 2026-09-30 the owner approved no uncertain replay: unknown/ambiguous outcomes after a request may have crossed the network boundary must be held for review, without automatic resend unless authoritative provider evidence later establishes replay safety. Revision-4 migration 102 implements the irreversible started/confirmed/unknown attempt boundary, stale-lease handling and director-retry denial for the prospective revision-4 model. Known-safe pre-dispatch lease recovery remains possible. No numeric provider deduplication window is invented. [ADR-004](../architecture/decisions/ADR-004-meta-lifecycle-feedback.md#approved-no-uncertain-replay-policy--2026-09-30-activation-revision-3) and [activation plan revision 3](../architecture/plans/crm-batch2-meta-lifecycle-activation.md) record the decision. Deployment and activation evidence is recorded in [CURRENT_STATE](CURRENT_STATE.md); this rule grants no operational approval.


Final owner approval on 2026-09-30 for [revision 4](../architecture/plans/crm-meta-funnel-revision-4.md) extends the future event scope to Option B and approves repeated Qualified/closure occurrences, singleton Intake/Converted, Qualified initial target and chronological-attempt ordering. Migrations 101–102 implement those rules around the existing outbox for a separately compliant future cohort. An earlier potentially dispatched unknown stays unreplayable; missing receipt alone does not permanently suppress later genuine independently eligible outcomes. The approved advisory-D2 amendment applies to new prospective policies; existing required policies retain required proof. Actual privacy/stops and D3–D7 prospective/ownership restrictions remain mandatory. [Completed advisory and sharing-stop contract](../architecture/plans/completed/crm-meta-funnel-r4-d2-advisory.md). Current deployment and activation state belongs in [CURRENT_STATE](CURRENT_STATE.md).
