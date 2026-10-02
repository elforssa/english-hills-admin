# Operational workflows

> **Production verified — 2026-10-01:** PR #47 reviewed head `f823b62a3bb06d40b1f572927bfa2af60fd4c857` merged and deployed as `02ffccab1519c0b381196ef9e5f938a908fdd105`; ledger 001–103 and advisory R4 controls are verified dormant. Lifecycle inventory is zero, cron disabled and server live gate absent; existing intake is healthy. [Dated release evidence and limitations](../architecture/evidence/crm-r4-advisory-production-2026-10-01.md). Earlier not-merged/not-deployed or two-event baseline statements below are historical and superseded for current deployment state. Provider seed, Meta/credential changes, Production release and H4 remain unauthorized; the separately commissioned H3-02 branch is recorded below.

> Finally owner-approved 2026-10-01 (PR #46, architecture head `c404815`): [R4 advisory D2 amendment](../architecture/plans/completed/crm-meta-funnel-r4-d2-advisory.md) changes custom proof from mandatory to recommended while preserving platform/legal/privacy, source/identity, prospective cutoff, producer ownership, five-event and no-uncertain-replay safeguards. Any mandatory-D2 text below describes the deployed baseline until reviewed forward implementation; actual withdrawals/stops remain enforceable even without a grant. The approved opportunity/contact/pending stop scopes and exact lock/retention contract are part of this architecture. Migration 103 and compatible runtime/UI are implemented on `codex/r4-advisory-d2`, pending exact-head CI and independent review; see the [implementation record](../architecture/evidence/crm-r4-advisory-implementation-2026-10-01.md). This branch is not merged or deployed; deployment is NOT authorized; H3/H4 are NOT approved and remain blocked. [Final approval record](../architecture/plans/completed/crm-meta-funnel-r4-d2-advisory.md#final-owner-architecture-approval-2026-10-01).

These describe current code; live activation evidence is in [CURRENT_STATE](CURRENT_STATE.md). See [product rules](PRODUCT_RULES.md) for invariants rather than treating screen labels as authority.

## H3-02 timestamp holds — branch implementation

[H3-02](../architecture/evidence/crm-h3-02-implementation-2026-10-02.md) introduces the coarse `provider_time_not_after_source` hold for invalid original generation time or equal/earlier exported seconds. Waiting or director retry cannot repair the frozen occurrence; later occurrences still obey the existing unattempted-predecessor rule. Deadline/epoch cleanup and retention remain unchanged. This is branch implementation only; separate independent review and release approval precede any deployment.

## Advisory R4 sharing-stop operations on the implementation branch

These controls require migration 103 and compatible runtime; they are not deployed. A director records an opportunity stop using the verified canonical lead and exact outbound destination. Later-submission provenance does not replace the original first source. For a verified general privacy request, select the internal contact and explicitly choose all Meta destinations or the requested destination; record a bounded non-PII review reference. Contact labels or phone similarity alone do not establish request authority.

For an unresolved source, record a pending stop against its durable submission UUID and exact outbound destination. Mark a general request for contact review. The returned stop UUID is displayed and prefills a broad review. For deferred work, use the paginated pending-stop list and “Reprendre la revue” to recover that identifier. The director then verifies the contact and breadth and uses the pending binding control before resolution; the resolver must confirm that same contact, or the transaction remains unresolved. Excluded Yearly/website acquisition alone cannot close an unresolved objection to an eligible contact/opportunity; the pending audit clock starts only at actual handoff in this architecture. Stop markers and verified carry/handoff history are permanent. New proof, retry, identity reassociation and audit erasure cannot release them. A committed begin may already cross the network; stop prevents subsequent begins and finish records the actual outcome or unreplayable unknown. See the [exact scopes, hierarchy and retention predicates](../architecture/plans/completed/crm-meta-funnel-r4-sharing-stop-contract.md).

New policies published by this branch's UI are prospective advisory R4 policies. Optional proof groups must be complete and truthful; reviewed refusal/restriction mappings remain mandatory safety facts, materialized atomically during trusted source resolution, including later submissions, independently of optional evidence collection. Existing required policies retain their requirement. Diagnostics distinguish optional D2 observations from actual privacy and delivery holds. Publishing, stopping or binding never enables provider delivery; the separate provider seed, H3/H4, release and Production gates remain blocked.

## Bounded reconciliation conflicts — Production verified, 2026-10-02

PR #55 and migration 105 return exact `PT409`/identifier conflicts. Ownership loss ends the current discovery pass without another fetch/enqueue/finish/reclaim, retaining committed counters; shared intake continues. Disabled/inactive form conflicts retain their distinct owned five-minute finish. Unknown conflicts and storage/provider errors retain separate handling. [Production acceptance](../architecture/evidence/crm-meta-reconciliation-stale-lease-production-2026-10-02.md). No activation or source change is authorized.

## Meta lead intake

A verified webhook stores a canonical event only when realtime intake is enabled. Independently enabled reconciliation leases a due mapped form and discovers recent IDs after its activation watermark. Both deduplicate into the same queue. The worker claims a job, retrieves the lead via Graph, selects its immutable mapping, normalizes answers and transactionally finalizes through the shared resolver. Missing mappings/policy or ambiguous identity remain diagnosable/retryable or in intake review; acceptance must not fabricate a match. See [Meta contract](../crm-meta-ingestion.md), [reconciliation](../crm-meta-reconciliation.md) and [ADR-002](../architecture/decisions/ADR-002-meta-intake-and-reconciliation.md).

## Website inquiry intake

The external website submits a stable request UUID and bounded contact/answers/attribution to `/api/public/crm-inquiry`. Valid requests are stored before success is returned. Retry an uncertain response with the same UUID and business payload. The shared worker resolves the durable job without Meta retrieval. Unknown/ambiguous identity goes to review. This is distinct from `/api/public/inscription`, which creates public pre-registration student/enrollment records. [Contract](../crm-website-inquiries.md).

## Meta lifecycle feedback (revision 4 implemented on branch; Production remains dormant/inactive)

The independent lifecycle scheduler first evaluates exact, versioned form responses into append-only eligibility evidence, then reconciles canonical committed occurrences and claims at most three due deliveries within a bounded route budget. Revision-4 migrations 101–102 add exact Intake/Not qualified/Lost/Qualified/Converted mapping, singleton/reopen occurrence rules, a verified prospective legacy-exclusion boundary, immutable per-opportunity producer ownership, chronological attempt gates and irreversible unknown dispatch state. Live work still requires every database gate plus the server kill switch. Only Meta-first accepted submissions from the separately compliant future form cohort, with original lead ID, D2 evidence, active epoch, valid boundary/ownership and verified contract, can reach transport. Website, later-Meta, current Yearly and historical submissions are excluded. Director diagnostics expose safe kind/model/producer/order/uncertainty/retry state but no token, matching value, payload or provider body. Production still has only deployed migrations 098–100, inactive `crm-lifecycle-primary`, and no live inventory; 101–102 are not merged or deployed and seed no release data. H3/H4 remain blocked. [Runbook](../crm-meta-lifecycle.md), [ADR-004](../architecture/decisions/ADR-004-meta-lifecycle-feedback.md).

## Receptionist lead follow-up

Receptionist lands at `/crm/today` and can open prospects, review intake and record guarded commands. Record phone-call outcomes explicitly; WhatsApp sent is activity-only, while a meaningful conversation can drive a commercial decision and next task. The follow-up engine schedules failed-call attempts using the lead's immutable policy version. Close Lost/Not Qualified with an explicit reason; reopening is audited. Notes do not replace next actions. Current detail shows forms, next actions and paginated history; the approved presentation redesign below is not the current UI contract.

## Placement test

From a lead, `crm_book_placement_test` links a planned test and completes existing placement-confirmation tasks. `crm_update_placement_test` changes it through guarded commands; milestone triggers retain booking/result history and arrange follow-up. Learner links must agree; linked tests cannot be silently hard-deleted. Existing unlinked placement tests remain supported. Test completion is not conversion. [083 implementation](../../supabase/migrations/083_crm_placement_integration.sql).

## CRM → enrollment

For a QUALIFIED, unlinked lead, review learner candidates, choose an existing learner or explicitly confirm a new one, and choose compatible program/year/level/group. `crm_start_enrollment` checks versions, candidate evidence and retry identity; it links/creates enrollment and records `enrollment_started`. Submitted/Trial initiation keeps follow-up open. Only trusted Confirmed/Validated evidence converts and closes commercial tasks. Downgrade after conversion raises review without erasing history. [084](../../supabase/migrations/084_crm_enrollment_and_conversion.sql).

## Payment/receipt relationship

Authorized staff select an existing learner or new learner, an existing balance or new agreement, and record payment through `create_charge_payment`. Existing CRM-linked tuition requires an explicit compatible enrollment; do not guess among several enrollments. A nonzero payment creates an immutable receipt snapshot; later installments update the live balance, not earlier receipts. Zero creates no receipt. Voids/corrections use authorized audited functions; collected CRM revenue follows payment and reversal evidence separately from conversion. [Receipt model](../receipt-financial-model.md), [enrollment behavior](../../scripts/README-enrollment-workflow.md).

## Existing learner/contact matching

Automatic acquisition matching corroborates contact identity and learner/program/session evidence. Siblings sharing a phone remain separate opportunities; unresolved submissions retain candidates for human review. Mapping `learner_policy=optional` permits unnamed inquiries but never invents learner identity. Enrollment candidate review is a separate trusted step, not a phone-only student merge. [093 policy](../crm-mapping-learner-policy.md).

## Existing in-person entry paths

Batch 1 permits receptionist to create zero-charge commitments and receipts for new or existing learners through the existing financial RPC, and retry eligible receipt email. The same engine retains enrollment/conversion safeguards. Receptionist can create a narrow student dossier, add or edit pre-enrollments, assign groups, record attendance, schedule Premium workshops and update operational teacher fields. Receipt void/correction/deletion, finance analytics and teacher compensation remain restricted. The owner confirmed 096 and 097 deployed and Batch 1 Production verified on 2026-09-29. PR #32 makes `/students` use the shared operational list, retaining its filters, placement and payment context while routing receptionist writes through narrow RPCs and hiding management-only tools. That shared UI and its restrictions are Production verified per owner evidence. These staff paths do not complete the planned walk-in redesign.

## Approved future workflows

**Not fully implemented:** [ADR-003](../architecture/decisions/ADR-003-receptionist-operations-role.md) also calls for a redesigned Today dashboard, CRM detail and walk-in enrollment flow. A walk-in ready to enroll should not need a fake Meta lead; create a manual prospect only when not enrolling yet. Those later product changes remain planned.
