# Current state

## CRM Batch 2 dormant Production rollout

On 2026-09-30 the dormant CRM Batch 2 rollout completed Production verification. [PR #34](https://github.com/elforssa/english-hills-admin/pull/34) merged reviewed head `95ba8c1b1c5f00ee6565e1691fb35e5724356646` as merge commit `26b8b0d609925d3d72b4be1f5929244acac2bf8b`. Vercel Production deployment `dpl_C2ouisA1fpdonK7PuuT7udC1p7hp` was verified **READY**, sourced from that merge commit, with `admin.english-hills.com` among its aliases. The Production ledger contains **098 `crm_lifecycle_evidence_and_delivery`**, **099 `crm_lifecycle_delivery_runtime`** and **100 `crm_lifecycle_scheduler`**; migrations 001–100 are deployed and immutable.

Production acceptance verified `crm-lifecycle-primary` at `*/5 * * * *` with `active = false` and zero runs. Provider contracts, eligibility policies, eligibility evidence, open activation epochs, live deliveries and enabled Meta lifecycle destinations were all zero. No provider credentials or configuration were provisioned, no active-form change was made and no real or test Meta delivery occurred. The existing `crm-intake-primary` remained active and healthy. Batch 2 is therefore deployed **dormant and fail closed**, not live-activated. H3 provider/form/credential readiness and H4 prospective destination/server-gate/scheduler activation remain separately reviewable and require explicit human approval. [Completed dormant-rollout plan](../architecture/plans/completed/crm-batch2-meta-lifecycle-feedback.md).

Earlier deployment evidence below was reviewed 2026-09-29 against main commit `1a370069d9ddd92d531c2a84dc84d737d44391b0` (PR #29). The repository owner later supplied the Batch 1 Production facts below. This architecture branch did not query or mutate Production.

## Owner-confirmed Receptionist Batch 1 release

On 2026-09-29 the owner confirmed [PR #31](https://github.com/elforssa/english-hills-admin/pull/31) and [PR #32](https://github.com/elforssa/english-hills-admin/pull/32) merged, migrations 096 and 097 deployed, and Batch 1 Production acceptance complete. PR #32 merge/source commit is `3c9b9132f29a5fafea44bbb7c93435e15b74bf6e`; its Vercel Production deployment was verified READY. The migration ledger contains exactly `097 | receptionist_group_assignment_filter`. Shared receptionist Students UI and permission restrictions were verified; Meta reconciliation and scheduler remained healthy with no Production runtime errors. The safe teacher projection was also verified in earlier owner-supplied checks. This architecture task fetched current main at that commit but did not independently query Production.

**001–097 are deployed and immutable.** New database work starts after 097, checking current main for occupied numbers. [Completed Batch 1 plan](../architecture/plans/completed/receptionist-batch1-permissions.md).

## Earlier verified Production activation (PR #29 history)

Evidence independently verified on 2026-09-29 after PR #29 and supplied by the repository owner during PR #30 review; this documentation update did not query or mutate Production.

- Production migration ledger includes **095 `crm_intake_pg_cron_scheduler`**. Main also contains [migration 095](../../supabase/migrations/095_crm_intake_pg_cron_scheduler.sql); implementation and activation are separately established.
- Supabase cron job `crm-intake-primary` has schedule `*/5 * * * *` and `active = true`. Automatic pg_cron runs succeeded; Production `/api/cron/crm-intake` calls returned HTTP 200.
- Production Vercel deployment `dpl_7uPQH4WD9MU8PL2txH8SaFBtAudE` is **READY**, sourced from `main` commit `1a370069d9ddd92d531c2a84dc84d737d44391b0`; `admin.english-hills.com` aliases it.
- Production Meta realtime intake is disabled (`enabled = false`); `meta_reconciliation.enabled = true`. Reconciliation has operated with `last_error_code = null`.
- Real Meta intake has been demonstrated end-to-end: at least three real ingestion jobs completed successfully, producing three Meta submissions and three CRM leads. Leads started as NEW with first-contact tasks, without automatically creating students or enrollments. No customer identities or payloads are recorded here.
- [PR #29](https://github.com/elforssa/english-hills-admin/pull/29)'s “095 not applied” statement describes the **pre-activation** state and is superseded by this evidence. Merge alone is still not proof of activation. Live website configuration is not established by this evidence.

## Implemented on main

- Next.js 15 / React 19 App Router, Supabase PostgreSQL/Auth/Storage, TanStack Query, Tailwind/shadcn; see [architecture](ARCHITECTURE.md).
- CRM migrations 078–091 provide lifecycle commands, Today, activities/tasks, placement, enrollment conversion, revenue attribution, durable intake and director reporting. 092–093 add optional learner handling through immutable mapping policy; 094 adds reconciliation and option labels.
- Lifecycle is NEW → CONTACTING → ENGAGED → QUALIFIED → CONVERTED, with LOST/NOT_QUALIFIED closures. Linked Confirmed/Validated enrollment is conversion evidence; starting enrollment is insufficient. [Rules](PRODUCT_RULES.md).
- Meta webhook and reconciliation share `crm_ingestion_jobs`. The reconciliation activation watermark is database-owned `settings.meta_reconciliation.started_at`; per-form lease/due/error state is in `crm_meta_reconciliation_state`. It is rolling lookback discovery, not a persisted pagination/high-water cursor. [ADR-002](../architecture/decisions/ADR-002-meta-intake-and-reconciliation.md).
- Main implements pg_cron + pg_net as primary five-minute trigger, with GitHub Actions backup calling the same protected `/api/cron/crm-intake`. Production activation of 095 was verified on 2026-09-29 as recorded above.
- Website `/api/public/crm-inquiry` durably queues inquiries for the shared resolver. Public `/api/public/inscription` remains a distinct student/enrollment registration flow; the marketing website is external to this repository.
- Meta inbound retrieval has real Graph HTTP transport. Batch 2's lifecycle live transport is deployed behind independent server, database, evidence, contract and scheduler gates, but remains dormant with no provider contract or credentials and an inactive lifecycle cron. Insights remains fixture-only and reports `live_sync_enabled: false`. Code capability does not prove a live connection is configured or activated.
- Dedicated receptionist exists since 077; Batch 1 expanded operational routes and database permissions in merged 096. See [current role boundaries](SECURITY_RULES.md). PR #32 completed the shared Students list and enrollment-aware group filter in 097; Production acceptance is recorded above.

Batch 1 is complete; its historical plan is archived under `plans/completed/`.

## Documentation discrepancies

The imported AGENTS/CLAUDE guidance incorrectly claimed receptionist was removed, five roles, outdated table counts, and root-level middleware. AGENTS also claimed Next.js 14 and no tests. These entry points now defer to verified sources. README role/schema/deployment guidance is corrected. The receipt model's “055 absent from main” / “057 unreleased” text is historical, not current. Phase 12 rollout/checklist/validation and early provider docs retain historical evidence and activation gates; their blanket “production 076” or “not deployed” statements are not a present deployment inventory. The follow-up SQL defaults match the approved Day 1/2/4/6 cadence, but its validator permits other later offsets; live policy values were not verified. The ProtectedRoute header's broad admin/director claim is superseded by its executable director-only CRM analytics check; no application code was changed.

## Active planned work

**Receptionist operations — PARTIALLY IMPLEMENTED overall; Batch 1 COMPLETED.** [ADR-003](../architecture/decisions/ADR-003-receptionist-operations-role.md) retains the wider Today, CRM detail and dedicated walk-in direction as planned.

**CRM Batch 2 live activation — PENDING H3/H4.** The [activation-preparation plan](../architecture/plans/crm-batch2-meta-lifecycle-activation.md) records verified provider payload incompatibilities and an unresolved full-funnel scope requirement; H3/H4 remain blocked. This is a documentation/code assessment, not new Production verification. The implementation and dormant Production rollout are complete; see the [completed plan](../architecture/plans/completed/crm-batch2-meta-lifecycle-feedback.md) and verified evidence above. Official provider-contract verification, active-form evidence readiness, approved notice/field mapping, destination entitlement, separate credentials and prospective release-operator activation remain unresolved. That two-event implementation remains dormant; the approved revision-4 architecture below does not waive or satisfy any activation gate. [Feature index](../architecture/FEATURE_INDEX.md).


**CRM Meta funnel revision 4 — ARCHITECTURE APPROVED, NOT IMPLEMENTED.** The owner stated “I approve revision 4.” on 2026-09-30; PR #40 merged as `fdb0987cfc68785b278ce6aacf26425306d5c8ef`. The [approved plan](../architecture/plans/crm-meta-funnel-revision-4.md) records five-event Option B, occurrence/singleton semantics, Qualified initial target and chronological-attempt ordering. Implementation is NOT completed; deployment is NOT authorized; H3/H4 are NOT approved and remain blocked. Current Production still has the dormant two-event implementation. This records owner approval and repository merge, not fresh Production verification.
