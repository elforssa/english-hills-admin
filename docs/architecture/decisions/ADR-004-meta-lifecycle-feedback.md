# ADR-004: Meta lifecycle feedback consumes CRM facts

## Status

**APPROVED AND IMPLEMENTED — repository owner approval dated 2026-09-29, Batch 2 plan revision 2, D1–D7 all Option A. PR #34 and migrations 098–100 completed dormant Production rollout verification on 2026-09-30. Live Meta activation is not complete or approved.** See the [completed implementation/dormant-rollout plan](../plans/completed/crm-batch2-meta-lifecycle-feedback.md). Official provider-contract verification, form readiness, credentials/configuration and H3/H4 activation approval remain prerequisites, not unresolved D1–D7 product decisions.

**Additional architecture decision approved 2026-09-30, activation plan revision 3: no uncertain replay. This correction is NOT IMPLEMENTED; the implemented status above applies to the original dormant D1–D7 scope.** See the approval addendum below. H3/H4 remain blocked.

## Context

Main already has guarded CRM milestones, an immutable lifecycle outbox, leased attempts and mock-only transport in migration 088. Inbound Meta retrieval/reconciliation is live independently. Working intake and synthetic consent fixtures do not authorize live outbound disclosure. The principal new durable boundary is how independently evidenced eligibility authorizes asynchronous use of existing commercial facts.

## Decision

Reuse the 088 outbox to deliver only eligible committed Qualified and authoritative Converted facts. Keep CRM/enrollment/payment truth independent of Meta. Preserve one intention per lead/kind, deterministic event ID, original time, frozen matching payload and bounded uncertainty-aware attempts. Do not promise exactly-once provider effects.

Require versioned, auditable, submission/destination-specific eligibility with revocation, separate from immutable acquisition attribution. Unknown evidence fails closed. Approved scope is Meta-first accepted Instant Form opportunities only, prospective, original-Meta-lead-ID-only and no monetary data. Website-attributed and later-Meta-matched opportunities are excluded. If official evidence proves additional hashed adult email/phone required or materially necessary, stop for new owner approval before widening the payload. Mock historical delivery can never be relabeled or replayed as live. Keep outgoing delivery and its scheduler/credentials separate from inbound intake.

Enforce payload minimization in both SQL and server transport; retain role-gated safe diagnostics and approved terminal redaction. School commands never perform provider network I/O. Receptionist operates the CRM; director sees diagnostics and approved narrow controls; operator provisions secrets/activation after release approval.

## Approved owner decisions (2026-09-29, revision 2)

- **D1 A:** Meta-first accepted Instant Forms only; no website or later-Meta matching.
- **D2 A:** explicit approved form-response evidence for adult contact and Meta lifecycle sharing, bound to exact notice/policy version. Missing/ambiguous evidence denies delivery; no inference from Meta origin, phone, parent field, generic inquiry consent or director toggle. This defines software evidence, not legal sufficiency.
- **D3 A:** prospective activation only; no historical backfill or later release of pre-epoch/disabled-period milestones.
- **D4 A:** no value, currency, revenue, payment amounts or payment history.
- **D5 A:** original lead ID only; additional hashed adult matching requires verified official need and fresh owner approval.
- **D6 A:** erase prepared matching payload/hashes at terminal delivery plus 30 days; retain minimal attempt diagnostics 90 days; evidence metadata until referenced deliveries terminal plus 90 days. Afterwards retain only minimal nonmatching deduplication/audit markers for replay prevention or policy/revocation history. Never retain matching identifiers, prepared payloads, raw responses, tokens or headers indefinitely. Plan revision 2 specifies terminal cleanup and unreplayable erasure.
- **D7 A:** director may retry a single eligible delivery after repair, respecting evidence, age, attempts, backoff and idempotency. No sent/dead/suppressed revival, bulk unrestricted resend or receptionist delivery/retry.

## Remaining prerequisites

Lifecycle eligibility/evidence infrastructure exists in [migration 098](../../../supabase/migrations/098_crm_lifecycle_evidence_and_delivery.sql), and [evidence.mjs](../../../src/lib/crm/lifecycle/evidence.mjs) implements evidence ingestion/evaluation. The active Meta form's D2 compliance remains unverified, and the exact form/notice mapping remains unresolved. H3/H4 remain blocked. An evidence-ready form is mandatory. Treat change/replacement as an activation prerequisite unless authorized inspection proves the active form already meets the plan's exact Page/form/field/value/notice-version manifest. Noncompliant forms must change before activation; no real form is modified by this approval update.

Verify official exact Meta event contract, API version, event-age rules, deduplication semantics and accepted-response behavior before live transport is considered complete. Record source/date and account/destination entitlement; do not infer them from fixture success or inbound access. Approved notice/version and actual field mapping, credentials, local/CI/security/retention verification, independent review and separate human release approval remain required. All D1–D7 product decisions are resolved.

## Alternatives and consequences

- Rebuilding an outbox duplicates identity/retry/history rules; extend the existing protected objects instead.
- Synchronous sending in qualification/payment transactions couples school operations to provider failures; asynchronously consume durable activity facts.
- Inferring consent from Meta origin or generic website acceptance invents evidence. Explicit rules may initially leave many leads ineligible, which is preferable to silent disclosure.
- Live website/later-touch sharing and revenue value need additional owner-approved boundaries; mock support does not establish approval.
- Disabling feedback stops new sends but cannot recall accepted/in-flight requests. Retention erasure must preserve non-replayable tombstones and must not masquerade as permission to delete school audit history.

## Existing implementation / follow-up evidence

Existing foundation: [088](../../../supabase/migrations/088_crm_meta_lifecycle_delivery.sql), [fixture worker](../../../src/lib/crm/lifecycle/worker.mjs), [ADR-001](ADR-001-crm-lifecycle.md) and [ADR-002](ADR-002-meta-intake-and-reconciliation.md). [PR #34](https://github.com/elforssa/english-hills-admin/pull/34), reviewed head `95ba8c1b1c5f00ee6565e1691fb35e5724356646`, merged as `26b8b0d609925d3d72b4be1f5929244acac2bf8b` and deployed through Vercel Production deployment `dpl_C2ouisA1fpdonK7PuuT7udC1p7hp`. Forward migrations [098](../../../supabase/migrations/098_crm_lifecycle_evidence_and_delivery.sql), [099](../../../supabase/migrations/099_crm_lifecycle_delivery_runtime.sql) and [100](../../../supabase/migrations/100_crm_lifecycle_scheduler.sql) are in the Production ledger. Verification on 2026-09-30 found the lifecycle cron inactive and zero provider contracts, policies/evidence, open activation epochs, live deliveries and enabled lifecycle destinations. No provider credentials/configuration or form changes were made. This is dormant deployment evidence only; it does not establish or authorize live activation.


## Activation-preparation evidence addendum — 2026-09-30

The [activation plan](../plans/crm-batch2-meta-lifecycle-activation.md) records official documentation successfully read through the browser after web-fetch errors. This addendum changes the readiness assessment, **not the approved D1–D7 scope**; no new disclosure or activation is approved.

- Meta's [CRM payload specification](https://developers.facebook.com/documentation/ads-commerce/conversions-api/conversion-leads-integration/payload-specification) requires `action_source=system_generated`, `custom_data.event_source=crm` and a CRM name in `custom_data.lead_event_source`. Current application/SQL exclude the custom fields, so a reviewed application correction and forward migration are required. This implements the prior plan's conditional allowance for verified nonpersonal constants; it does not allow arbitrary custom data.
- The same specification permits valid lead ID as the sole matching parameter; additional hashed adult email/phone is not required. The [customer parameter reference](https://developers.facebook.com/documentation/ads-commerce/conversions-api/parameters/customer-information-parameters) documents an unhashed integer. Activation plan revision 2 records Meta’s official SDK preserving the ID as a JSON string; retain current lossless text/SQL representation. This is official implementation evidence, not a live-account experiment or an explicit endpoint wire-type guarantee.
- The [CRM implementation guide](https://developers.facebook.com/documentation/ads-commerce/conversions-api/conversion-leads-integration/crm-integration/3-implementing-the-crm-integration) instructs integrations to send the initial lead and all funnel stages. Revision 2 qualifies the original scope-conflict interpretation: the [FAQ](https://developers.facebook.com/documentation/ads-commerce/conversions-api/conversion-leads-integration/faq) places all-stage uploads under best practices, and [data verification](https://developers.facebook.com/documentation/ads-commerce/conversions-api/conversion-leads-integration/crm-integration/4-verify-your-data) separates one-event connection validation from volume/coverage requirements for funnel analysis. This does not establish that Qualified/Converted-only meets CRM validation or optimization needs. Keep that scope dormant pending applicable authoritative clarification/account evidence or a separately owner-approved architecture revision; do not invent predecessor events or silently expand this ADR. API receipt, CRM recognition and optimization eligibility are distinct.
- The seven-day event-age limit is verified. Server-only deduplication duration and remaining transport/response questions are explicitly unresolved in the activation plan. The browser/server 48-hour window is not automatically the CRM retry contract.

H3/H4 remain blocked. Active-form compliance and asset entitlement remain unverified. Current 098/099 and `evidence.mjs` provide evidence ingestion/evaluation; older text describing that capability as missing belongs to the pre-implementation assessment. This task did not query or mutate Production, provision credentials or send any Meta event.

### Revision 2 interpretation — 2026-09-30

The activation plan’s provider-readiness table supersedes revision 1’s categorical full-funnel incompatibility and unresolved SDK string-representation assessment. D1–D7 remain unchanged. No numeric server-only deduplication duration is verified; the 48-hour browser/server value remains inapplicable as an assumed retry guarantee. The plan proposes an explicit unverified/no-uncertain-replay contract and coordinated application/forward migration correction if no guarantee is available. At revision 2 that was **not approved or implemented**. The revision 3 approval below supersedes only the pending policy decision; implementation remains absent. Existing eligibility, immutable evidence, outbox identity, bounded retries and replay prevention remain mandatory. H3/H4 are still blocked by provider and account-specific evidence gaps.


### Approved no-uncertain-replay policy — 2026-09-30, activation revision 3

The repository owner explicitly approved the following architecture decision in the follow-up to [PR #39](https://github.com/elforssa/english-hills-admin/pull/39), after documentation head `e4bae3ca20f063b85cc00255335cd5a1bb4869ec`:

> I approve the no-uncertain-replay policy for CRM lifecycle delivery. Unknown or ambiguous provider outcomes must not be automatically resent unless authoritative provider evidence later establishes replay safety.

**APPROVED / NOT IMPLEMENTED.** Known safe/retryable pre-send failures may follow reviewed retry rules. Once a request may have crossed the network boundary, ambiguous receipt must be held for review with no automatic replay. Lease recovery must not silently resend a started uncertain attempt; director retry must enforce the same boundary. Durable attempt history must prevent bypass through status/configuration changes or an uncertain begin/finalize result. A durable begin followed by a crash before observable transport is conservatively uncertain. General provider recovery advice and repaired credentials do not prove non-acceptance.

No numeric deduplication window may be invented to encode unknown provider behavior. The future coordinated application/forward migration correction must represent unverified safety explicitly, freeze the policy in the contract/snapshot and enforce it at claim, prepare/begin, finalization, lease recovery and director retry. The [revision 3 consequence manifest](../plans/crm-batch2-meta-lifecycle-activation.md#exact-future-application--sql-consequences--not-implemented) identifies the exact affected modules/SQL objects and synthetic acceptance cases. No code or migration is authored by this decision record.

Later authoritative replay-safety evidence requires a separately reviewed contract/architecture update; it does not automatically release held rows or authorize rewriting frozen contracts. Preserve age/attempt/backoff/evidence/epoch limits, retention and terminal replay-prevention markers. D7 remains a bounded single eligible retry after repair, never an uncertainty bypass.

D1–D7 are unchanged: Qualified + Converted only, prospective-only Meta-first opportunities, original Meta lead ID only, no child/contact-hash/financial data, immutable identity/time/destination/payload and separate inbound/outbound operation. Actual form/dataset/account evidence and narrower-funnel compatibility remain unresolved, as do remaining transport-contract requirements. **H3/H4 remain blocked.** This policy approval is not implementation commissioning, release approval, provider-test authorization or permission to mutate Production, forms/assets or credentials.
