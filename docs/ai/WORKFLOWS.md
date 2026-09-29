# Operational workflows

These describe current code; live activation evidence is in [CURRENT_STATE](CURRENT_STATE.md). See [product rules](PRODUCT_RULES.md) for invariants rather than treating screen labels as authority.

## Meta lead intake

A verified webhook stores a canonical event only when realtime intake is enabled. Independently enabled reconciliation leases a due mapped form and discovers recent IDs after its activation watermark. Both deduplicate into the same queue. The worker claims a job, retrieves the lead via Graph, selects its immutable mapping, normalizes answers and transactionally finalizes through the shared resolver. Missing mappings/policy or ambiguous identity remain diagnosable/retryable or in intake review; acceptance must not fabricate a match. See [Meta contract](../crm-meta-ingestion.md), [reconciliation](../crm-meta-reconciliation.md) and [ADR-002](../architecture/decisions/ADR-002-meta-intake-and-reconciliation.md).

## Website inquiry intake

The external website submits a stable request UUID and bounded contact/answers/attribution to `/api/public/crm-inquiry`. Valid requests are stored before success is returned. Retry an uncertain response with the same UUID and business payload. The shared worker resolves the durable job without Meta retrieval. Unknown/ambiguous identity goes to review. This is distinct from `/api/public/inscription`, which creates public pre-registration student/enrollment records. [Contract](../crm-website-inquiries.md).

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
