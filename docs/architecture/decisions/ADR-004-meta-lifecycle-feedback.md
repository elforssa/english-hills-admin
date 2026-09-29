# ADR-004: Meta lifecycle feedback consumes CRM facts

## Status

**APPROVED — repository owner approval dated 2026-09-29, Batch 2 plan revision 2, D1–D7 all Option A.** Not implemented or approved for Production release. See [approved plan and implementation contract](../plans/crm-batch2-meta-lifecycle-feedback.md). Architecture authorizes a separate implementation task within that contract; this update is documentation-only. Official provider-contract verification and form readiness remain completion/activation prerequisites, not unresolved product decisions.

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

The active Meta form has not been inspected; repository code proves missing evidence ingestion, not that the live form lacks questions. An evidence-ready form is mandatory. Treat change/replacement as an activation prerequisite unless authorized inspection proves the active form already meets the plan's exact Page/form/field/value/notice-version manifest. Noncompliant forms must change before activation; no real form is modified by this approval update.

Verify official exact Meta event contract, API version, event-age rules, deduplication semantics and accepted-response behavior before live transport is considered complete. Record source/date and account/destination entitlement; do not infer them from fixture success or inbound access. Approved notice/version and actual field mapping, credentials, local/CI/security/retention verification, independent review and separate human release approval remain required. All D1–D7 product decisions are resolved.

## Alternatives and consequences

- Rebuilding an outbox duplicates identity/retry/history rules; extend the existing protected objects instead.
- Synchronous sending in qualification/payment transactions couples school operations to provider failures; asynchronously consume durable activity facts.
- Inferring consent from Meta origin or generic website acceptance invents evidence. Explicit rules may initially leave many leads ineligible, which is preferable to silent disclosure.
- Live website/later-touch sharing and revenue value need additional owner-approved boundaries; mock support does not establish approval.
- Disabling feedback stops new sends but cannot recall accepted/in-flight requests. Retention erasure must preserve non-replayable tombstones and must not masquerade as permission to delete school audit history.

## Existing implementation / follow-up evidence

Existing foundation: [088](../../../supabase/migrations/088_crm_meta_lifecycle_delivery.sql), [fixture worker](../../../src/lib/crm/lifecycle/worker.mjs), [ADR-001](ADR-001-crm-lifecycle.md) and [ADR-002](ADR-002-meta-intake-and-reconciliation.md). Batch 2 changes are not implemented. Record approved decisions, implementation PR/migrations and Production verification separately as they occur. Approval records the intended implementation boundary; it does not claim these changes are deployed or authorize Production mutation.
