# Operational workflows

These describe current code and approved user journeys. [CURRENT_STATE](CURRENT_STATE.md) owns deployment/activation evidence; [PRODUCT_RULES](PRODUCT_RULES.md) owns invariants. [Historical workflow chronology](../architecture/history/workflows-before-outcome-1.md) preserves superseded procedures and dated status. Engineering execution and CI follow [AGENTS](../../AGENTS.md), not this workflow guide.

## S1 credential workflow

The [sole S1 Gate-B runbook](../architecture/plans/crm-h3-s1-gate-b-credential-runbook.md) defines supported configuration → minimum authority manifest → one final token → bounded validation → direct Vercel Production sensitive storage → metadata verification → credential closeout → STOP. Its [completed owner execution](../architecture/evidence/crm-h3-s1-gate-b-closeout-2026-10-05.md) does not authorize H3-06/07/08, H4, redeploy or delivery. Replacement/recovery still follows S1 and explicit operational authority; historical Rev7 steps must not be replayed.

## H3-02 timestamp holds

[H3-02](../architecture/evidence/crm-h3-02-implementation-2026-10-02.md) introduces the coarse `provider_time_not_after_source` hold for invalid original generation time or equal/earlier exported seconds. Waiting or director retry cannot repair the frozen occurrence; later occurrences still obey the existing unattempted-predecessor rule. Deadline/epoch cleanup and retention remain unchanged. Current deployment evidence is recorded in [CURRENT_STATE](CURRENT_STATE.md).

## Advisory R4 sharing-stop operations

These controls use migration 103 and compatible runtime; deployment evidence is in [CURRENT_STATE](CURRENT_STATE.md). A director records an opportunity stop using the verified canonical lead and exact outbound destination. Later-submission provenance does not replace the original first source. For a verified general privacy request, select the internal contact and explicitly choose all Meta destinations or the requested destination; record a bounded non-PII review reference. Contact labels or phone similarity alone do not establish request authority.

For an unresolved source, record a pending stop against its durable submission UUID and exact outbound destination. Mark a general request for contact review. The returned stop UUID is displayed and prefills a broad review. For deferred work, use the paginated pending-stop list and “Reprendre la revue” to recover that identifier. The director then verifies the contact and breadth and uses the pending binding control before resolution; the resolver must confirm that same contact, or the transaction remains unresolved. Excluded Yearly/website acquisition alone cannot close an unresolved objection to an eligible contact/opportunity; the pending audit clock starts only at actual handoff in this architecture. Stop markers and verified carry/handoff history are permanent. New proof, retry, identity reassociation and audit erasure cannot release them. A committed begin may already cross the network; stop prevents subsequent begins and finish records the actual outcome or unreplayable unknown. See the [exact scopes, hierarchy and retention predicates](../architecture/plans/completed/crm-meta-funnel-r4-sharing-stop-contract.md).

New policies published by the UI are prospective advisory R4 policies. Optional proof groups must be complete and truthful; reviewed refusal/restriction mappings remain mandatory safety facts, materialized atomically during trusted source resolution, including later submissions, independently of optional evidence collection. Existing required policies retain their requirement. Diagnostics distinguish optional D2 observations from actual privacy and delivery holds. Publishing, stopping or binding never enables provider delivery; separate H3/H4, release and Production authority remains required.

## Bounded reconciliation conflicts — Production verified, 2026-10-02

PR #55 and migration 105 return exact `PT409`/identifier conflicts. Ownership loss ends the current discovery pass without another fetch/enqueue/finish/reclaim, retaining committed counters; shared intake continues. Disabled/inactive form conflicts retain their distinct owned five-minute finish. Unknown conflicts and storage/provider errors retain separate handling. [Production acceptance](../architecture/evidence/crm-meta-reconciliation-stale-lease-production-2026-10-02.md). No activation or source change is authorized.

## Meta lead intake

A verified webhook stores a canonical event only when realtime intake is enabled. Independently enabled reconciliation leases a due mapped form and discovers recent IDs after its activation watermark. Both deduplicate into the same queue. The worker claims a job, retrieves the lead via Graph, selects its immutable mapping, normalizes answers and transactionally finalizes through the shared resolver. Missing mappings/policy or ambiguous identity remain diagnosable/retryable or in intake review; acceptance must not fabricate a match. See [Meta contract](../crm-meta-ingestion.md), [reconciliation](../crm-meta-reconciliation.md) and [ADR-002](../architecture/decisions/ADR-002-meta-intake-and-reconciliation.md).

## Website inquiry intake

The external website submits a stable request UUID and bounded contact/answers/attribution to `/api/public/crm-inquiry`. Valid requests are stored before success is returned. Retry an uncertain response with the same UUID and business payload. The shared worker resolves the durable job without Meta retrieval. Unknown/ambiguous identity goes to review. This is distinct from `/api/public/inscription`, which creates public pre-registration student/enrollment records. [Contract](../crm-website-inquiries.md).

## Meta lifecycle feedback

The independent lifecycle scheduler first evaluates exact, versioned form responses into append-only eligibility evidence, then reconciles canonical committed occurrences and claims at most three due deliveries within a bounded route budget. Revision-4 migrations 101–102 add exact Intake/Not qualified/Lost/Qualified/Converted mapping, singleton/reopen occurrence rules, a verified prospective legacy-exclusion boundary, immutable per-opportunity producer ownership, chronological attempt gates and irreversible unknown dispatch state. Live work still requires every database gate plus the server kill switch. Only Meta-first accepted submissions from the separately compliant future form cohort, with original lead ID, policy-appropriate eligibility and privacy/stop checks, active epoch, valid boundary/ownership and verified contract, can reach transport. Website, later-Meta, current Yearly and historical submissions are excluded. Director diagnostics expose safe kind/model/producer/order/uncertainty/retry state but no token, matching value, payload or provider body. The advisory-D2 amendment preserves existing required policies and actual stops. Deployment, seed and activation evidence is in [CURRENT_STATE](CURRENT_STATE.md); this workflow grants no H3/H4 authority. [Current H3 contract](../architecture/plans/crm-h3-technical-readiness.md), [ADR-004](../architecture/decisions/ADR-004-meta-lifecycle-feedback.md).

## Receptionist lead follow-up

The [Production-verified O3-r2 workspace](../architecture/evidence/outcome-3-batch-2-implementation-2026-10-05.md#production-closeout--2026-10-05) uses `/crm/leads` for Opportunities and `/crm/today` for Tasks / My Work. Opportunities provides Board/List, nine fixed Views, bounded owner/source/program/search filters and the shared contextual drawer. Existing semantic commands own every commercial transition; tel/WhatsApp launch alone records nothing, call outcomes are explicit, WhatsApp sent is activity-only, meaningful conversations may advance engagement, closure requires a reason, and trusted linked enrollment remains the only conversion authority.

Tasks / My Work is task-centric: one open task per row, default assignee me, independent task-assignee and lead-owner filters combined with AND, and server-authoritative Casablanca Overdue / Today / Tomorrow / Upcoming buckets with bounded cursor pages. Owner changes do not silently reassign tasks. Explicit task reassignment uses the task's own identity/version. Intake review and taskless Needs Attention remain separately discoverable; the browser does not compute call cadence or synthesize tasks.

Outcome 3 is complete and Production verified through migrations 107–108. The dedicated walk-in enrollment redesign remains a separate planned outcome.
## Placement test

From a lead, `crm_book_placement_test` links a planned test and completes existing placement-confirmation tasks. `crm_update_placement_test` changes it through guarded commands; milestone triggers retain booking/result history and arrange follow-up. Learner links must agree; linked tests cannot be silently hard-deleted. Existing unlinked placement tests remain supported. Test completion is not conversion. [083 implementation](../../supabase/migrations/083_crm_placement_integration.sql). The Production-verified O3-r2 Calendar query mode shows actual planned tests and open center visits in a bounded date/week agenda, with an optional completed-test toggle. Linked entries open the existing lead drawer; unlinked entries open the existing modal after bounded option reads. Invalid/missing legacy times stay unspecified, tests have no presumed duration, and examiner labels do not assert availability. Placement cancellation remains unsupported in v1. [Production evidence](../architecture/evidence/outcome-3-batch-2-implementation-2026-10-05.md#production-closeout--2026-10-05).

## CRM → enrollment

For a QUALIFIED, unlinked lead, review learner candidates, choose an existing learner or explicitly confirm a new one, and choose compatible program/year/level/group. `crm_start_enrollment` checks versions, candidate evidence and retry identity; it links/creates enrollment and records `enrollment_started`. Submitted/Trial initiation keeps follow-up open. Only trusted Confirmed/Validated evidence converts and closes commercial tasks. Downgrade after conversion raises review without erasing history. [084](../../supabase/migrations/084_crm_enrollment_and_conversion.sql).

## Payment/receipt relationship

Authorized staff select an existing learner or new learner, an existing balance or new agreement, and record payment through `create_charge_payment`. Existing CRM-linked tuition requires an explicit compatible enrollment; do not guess among several enrollments. A nonzero payment creates an immutable receipt snapshot; later installments update the live balance, not earlier receipts. Zero creates no receipt. Voids/corrections use authorized audited functions; collected CRM revenue follows payment and reversal evidence separately from conversion. [Receipt model](../receipt-financial-model.md), [enrollment behavior](../../scripts/README-enrollment-workflow.md).

## Existing learner/contact matching

Automatic acquisition matching corroborates contact identity and learner/program/session evidence. Siblings sharing a phone remain separate opportunities; unresolved submissions retain candidates for human review. Mapping `learner_policy=optional` permits unnamed inquiries but never invents learner identity. Enrollment candidate review is a separate trusted step, not a phone-only student merge. [093 policy](../crm-mapping-learner-policy.md).

## Existing in-person entry paths

Batch 1 permits receptionist to create zero-charge commitments and receipts for new or existing learners through the existing financial RPC, and retry eligible receipt email. The same engine retains enrollment/conversion safeguards. Receptionist can create a narrow student dossier, add or edit pre-enrollments, assign groups, record attendance, schedule Premium workshops and update operational teacher fields. Receipt void/correction/deletion, finance analytics and teacher compensation remain restricted. The owner confirmed 096 and 097 deployed and Batch 1 Production verified on 2026-09-29. PR #32 makes `/students` use the shared operational list, retaining its filters, placement and payment context while routing receptionist writes through narrow RPCs and hiding management-only tools. That shared UI and its restrictions are Production verified per owner evidence. These staff paths do not complete the planned walk-in redesign.

## Approved future workflows

**Not fully implemented:** [ADR-003](../architecture/decisions/ADR-003-receptionist-operations-role.md) still leaves the dedicated walk-in enrollment redesign as separate work. Opportunities, the contextual CRM drawer, Tasks / My Work and Admissions Calendar are Production verified under completed Outcome 3; a walk-in ready to enroll should still not require a fake Meta lead.
