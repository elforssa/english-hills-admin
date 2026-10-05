# ADR-004: Meta lifecycle feedback consumes CRM facts

## Status

**ADOPTED / IMPLEMENTED DORMANT**, with the approved R4, advisory-D2, strict-time and S1 amendments below. [CURRENT_STATE](../../ai/CURRENT_STATE.md) owns deployment and activation evidence. No decision here grants operator/release approval. The [original decision and amendment record](../history/adr-004-meta-lifecycle-feedback-before-outcome-1.md) preserves dates, owner approvals, findings, alternatives and superseded wording.

## Context and decision

CRM, enrollment and finance own school facts. Meta feedback consumes eligible committed activity asynchronously through the existing protected outbox; school commands never perform provider network I/O. Inbound acquisition and outbound lifecycle delivery have separate configuration, credentials and gates. Working intake does not authorize outbound disclosure.

Reuse durable intent, deterministic event identity, original occurrence time, frozen matching payload/configuration and bounded leased attempts. Do not promise exactly-once provider effects. Keep authorized director diagnostics and narrow retries separate from receptionist CRM operations. No runtime or schema redesign follows from this documentation cleanup.

## Current decision layers

| Layer | Adopted contract and preserved boundaries |
| --- | --- |
| Batch 2 foundation | [Completed revision-2 contract](../plans/completed/crm-batch2-meta-lifecycle-feedback.md): prospective Meta-first Instant Form opportunities; original Meta lead ID only; no website/later-touch matching, child or financial payload data; terminal redaction, limited diagnostics and single eligible retry. |
| R4 event model | [Approved R4](../plans/crm-meta-funnel-revision-4.md): Intake, Not qualified, Lost, Qualified, Converted; singleton Intake/Converted and genuine repeated qualification/closure occurrences, Qualified initial positive target and chronological-attempt ordering. Missing receipt alone does not permanently suppress later independently eligible outcomes. |
| Prospective ownership | R4 requires verified source/cohort cutoff, legacy-producer exclusion, immutable per-opportunity ownership and activation epoch. No historical backfill or fake predecessor activity; existing Yearly legacy cohort stays excluded. |
| Advisory D2 and actual stops | [Approved advisory amendment](../plans/completed/crm-meta-funnel-r4-d2-advisory.md) and [exact sharing-stop contract](../plans/completed/crm-meta-funnel-r4-sharing-stop-contract.md): new prospective policies may treat custom D2 proof as recommended; existing required policies remain required. Absence is never fabricated consent. Actual opportunity/contact/pending stops, platform/privacy obligations, locking and permanent minimal markers remain mandatory. |
| H3 compatibility | [Strict exported seconds](../plans/crm-h3-technical-readiness.md#strict-timestamp-and-equality-contract--approved-correction) and [multipart authentication](../plans/crm-h3-technical-readiness.md#authentication-compatibility-and-proof): no fabricated +1 second or dispatch-time substitution; equal exported seconds hold. Credentials enter only transient server transport. |
| Credential security | Adopted S1 below replaces conflicting old credential procedures only; it does not relax product/privacy/delivery gates. |

## Approved no-uncertain-replay policy — 2026-09-30, activation revision 3

Unknown or ambiguous outcomes after a request may have crossed the network boundary must not be automatically resent unless authoritative provider evidence later establishes replay safety. A durable begin followed by a crash is conservatively uncertain. Database lease recovery, director retry and credential repair cannot bypass that boundary. Known-safe pre-dispatch recovery remains possible within age, attempts, backoff, evidence and epoch limits.

No numeric provider deduplication window is invented. R4 migration 102 freezes and enforces the policy through claim, preparation/begin, finalization, lease recovery and retry. Later replay-safety evidence needs a reviewed contract/architecture update; it does not authorize rewriting frozen history. [Original owner approval and rationale](../history/adr-004-meta-lifecycle-feedback-before-outcome-1.md#approved-no-uncertain-replay-policy--2026-09-30-activation-revision-3).

## Owner clarification reusable acquisition platform 2026-10-01

Support simultaneous Meta forms, website forms and campaigns through configurable connections and immutable mappings. Campaign attribution is separate from form configuration; new campaigns can reuse supported sources without application changes. Future Instant Forms enter EH directly. The legacy Yearly Sheet/Apps Script/Zapier chain is not the template for new sources.

H3 prepares reusable dormant integration; actual source/form/mapping/cohort and producer-exclusion verification belong to H4. Do not infer disjointness or require retirement of unrelated legacy traffic. A later website direction is durable intake followed by acquisition CAPI Lead and subsequent lifecycle outcomes through a separately reviewed website matching adapter. That is planned work, not approval to widen the original-Meta-lead-ID contract. [Capability/gap assessment](../evidence/crm-multi-source-readiness-2026-10-01.md).

## Adopted amendment — simplified credential security S1, 2026-10-05

[S1](../plans/crm-meta-lifecycle-credential-simplification.md) was adopted through PR #93, source `27274492b3a2f6dab1cbb86ae239c056bee1421d`, merge `284c2fe32014f8f3011ac6677ddfe99b0a16ca22`. It retains dedicated C2/Employee/dataset, least privilege, no DQA, human-only handling, server-only resolution and Vercel Production-only sensitive custody. One final token and one bounded supported validation replace the Rev7 A/bootstrap/revoke/B rehearsal, synthetic transport and per-action ceremonies.

The accepted tradeoff trusts first-party diagnostic/control-plane surfaces, omits an initial revocation rehearsal and accepts non-retrievable Vercel-only custody with possible recovery downtime. Capability, tier, tasks, scopes and effective authority remain separate checks. [Permanent S1 invariants](../plans/crm-meta-lifecycle-credential-simplification.md#permanent-security-invariants) and the [sole Gate-B runbook](../plans/crm-h3-s1-gate-b-credential-runbook.md) are current authority. [Initial Gate-B closeout](../evidence/crm-h3-s1-gate-b-closeout-2026-10-05.md) records observed scopes/lifetime/readiness without changing that authority.

Architecture, credential/custody and live activation remain separate gates. H3-06/07/08 require separately scoped dormant acceptance, and H4/Gate C requires prospective source/privacy/ownership evidence and explicit release approval. No event test or live operation follows from credential acceptance.

## Alternatives and consequences

Rebuilding an outbox would duplicate history/retry controls; synchronous sending would couple school transactions to provider failures. Inferring eligibility from acquisition or a director toggle would invent evidence. Uncertain resend would assume unsupported provider behavior. Broadening website, matching or financial disclosure requires a separate approved boundary. Disabling delivery cannot recall an in-flight request; retention must preserve non-replayable markers and school audit history.

Historical pre-R4 two-event scope, pre-advisory mandatory-D2 descriptions and old H3/Rev7 credential decisions remain in the [decision history](../history/adr-004-meta-lifecycle-feedback-before-outcome-1.md) and [superseded credential index](../plans/historical/README.md). They are not competing current contracts.
