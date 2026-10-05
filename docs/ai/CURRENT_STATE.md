# Current state

Evidence register as of **2026-10-05 (Asia/Shanghai)**. Repository baseline: main `9846f2e3031d5c643729bd307fc13b26fcd1eef5`. This register reconciles repository implementation with dated owner/release evidence; it is not a new Production inspection. [Architecture](ARCHITECTURE.md) explains structure and state vocabulary; [feature index](../architecture/FEATURE_INDEX.md) links code/migrations.

## Capability register

| Capability | State | Current evidence | Important limit |
| --- | --- | --- | --- |
| Core school platform | IMPLEMENTED; production application | Next.js/Supabase code and cumulative migrations; [latest recorded runtime release](../architecture/evidence/crm-h3-04-production-2026-10-02.md) | A deployed application/ledger is not feature-by-feature acceptance. |
| Receptionist permissions | LIVE; Batch 1 complete | PRs #31/#32, 096/097; [owner Production acceptance](../architecture/plans/completed/receptionist-batch1-permissions.md) | Wider Today/detail/walk-in UX remains PARTIALLY IMPLEMENTED / PLANNED under ADR-003. |
| CRM status/tasks/activities/Today | IMPLEMENTED | 078–082/091; [ADR-001](../architecture/decisions/ADR-001-crm-lifecycle.md) | Live follow-up policy values/operating hours NEEDS VERIFICATION; SQL defaults do not prove configuration. |
| Placement | IMPLEMENTED | 083, linked placement commands and [workflow](WORKFLOWS.md#placement-test) | Dedicated Production feature acceptance NEEDS VERIFICATION; test completion is not conversion. |
| Admissions/enrollment/conversion | IMPLEMENTED | 062, 070–074, 084; [workflow](WORKFLOWS.md#crm--enrollment) | Feature-specific Production acceptance NEEDS VERIFICATION; only linked Confirmed/Validated enrollment converts. |
| Finance and CRM revenue | IMPLEMENTED | Cumulative charge/receipt engine, 085 and [receipt model](../receipt-financial-model.md) | Receptionist receipt permissions verified in Batch 1; broader finance/payroll feature acceptance NEEDS VERIFICATION. |
| Meta inbound/reconciliation | LIVE via reconciliation | [Initial activation history](../architecture/history/current-state-before-outcome-1.md#earlier-verified-production-activation-pr-29-history), [105 repair acceptance](../architecture/evidence/crm-meta-reconciliation-stale-lease-production-2026-10-02.md), [106 health check](../architecture/evidence/crm-h3-04-production-2026-10-02.md#dormancy-and-health) | Last explicit realtime webhook state disabled; working polling is not webhook activation or historical backfill. |
| Website inquiry | IMPLEMENTED — NEEDS VERIFICATION | 087/092/093; [website contract](../crm-website-inquiries.md) | Live external-site configuration not established. Public registration is a different flow. |
| Intake scheduler | LIVE | 095; five-minute primary, protected endpoint and health recorded through [106 acceptance](../architecture/evidence/crm-h3-04-production-2026-10-02.md) | Backup implementation exists; schedule firing alone does not prove resolved intake. |
| Lifecycle outbox / R4 / advisory D2 | IMPLEMENTED / DORMANT | 098–104; [R4 acceptance](../architecture/evidence/crm-r4-advisory-production-2026-10-01.md), [H3-03 closeout history](../architecture/history/current-state-before-outcome-1.md#h3-04-seed-branch-and-h3-03-prerequisite--2026-10-02) | Five-event model, stop/privacy, strict exported seconds and no uncertain replay remain enforced; no live delivery established. |
| R4 provider contract | IMPLEMENTED / DORMANT; seeded | 106; [H3-04 acceptance](../architecture/evidence/crm-h3-04-production-2026-10-02.md) | Exactly one immutable manifest; active manifest alone cannot send. |
| S1 credential | CREDENTIAL READY | [Gate-B closeout](../architecture/evidence/crm-h3-s1-gate-b-closeout-2026-10-05.md), PR #91 | Delivery success NOT VERIFIED; secret storage does not prove deployment environment loading. |
| Lifecycle destination / dormant acceptance | PLANNED remainder: H3-06/07/08 | [Current H3 contract](../architecture/plans/crm-h3-technical-readiness.md#named-h3-execution-steps-order-and-recovery); last database acceptance had zero configured destinations, inactive cron and zero delivery/attempt inventory | Credential closeout excludes destination writes/acceptance. These counts are dated 2026-10-02, not freshly reverified. |
| Lifecycle activation | DISABLED; H4/Gate C PLANNED | Gate-B closeout confirms server live gate absent; [S1 separation](../architecture/plans/crm-meta-lifecycle-credential-simplification.md#dormant-integration-and-activation-separation) | No Test Events or real lifecycle events sent; prospective source/cohort, privacy, ownership/exclusion, epoch and release approval remain required. |
| Meta Insights | PARTIALLY IMPLEMENTED | 089/090, reporting and fixture adapter; [contract](../crm-meta-insights.md) | `live_sync_enabled: false`; live transport/scheduler/account acceptance unfinished. |
| Academics / teacher / parent / student portals | IMPLEMENTED — NEEDS VERIFICATION | [Whole-platform feature map](../architecture/FEATURE_INDEX.md#school-operations) | Routes and schema exist; no broad portal/academic Production acceptance is inferred. |
| Online learning | MISSING ARCHITECTURE | [Architecture gaps](ARCHITECTURE.md#architecture-gaps) | No durable room/video-provider/access/breakout/online-session architecture. |

## Deployment and credential evidence boundaries

The latest recorded database ledger is **001–107**, per owner-supplied Outcome-3 Batch-1 Production acceptance on 2026-10-05. Exact Production source is `9846f2e3031d5c643729bd307fc13b26fcd1eef5`; deployment and the metadata-only ledger normalization are recorded in the [Batch-1 closeout](../architecture/evidence/outcome-3-batch-1-implementation-2026-10-05.md#production-closeout--2026-10-05). Those migrations are deployed and immutable. Check current main and deployment evidence before allocating any future migration.

Current credential state is **CREDENTIAL READY / DELIVERY SUCCESS NOT VERIFIED / LIFECYCLE DELIVERY REMAINS DISABLED**. Accepted identities, scope/lifetime, capability and metadata-only Vercel verification are recorded once in the [nonsecret Gate-B closeout](../architecture/evidence/crm-h3-s1-gate-b-closeout-2026-10-05.md). [S1](../architecture/plans/crm-meta-lifecycle-credential-simplification.md) is the sole credential architecture and the [Gate-B runbook](../architecture/plans/crm-h3-s1-gate-b-credential-runbook.md) the sole procedure. Earlier token/key absence and uncreated-C2 statements are historical observations, not current blockers.

## Repository authority adoption

| Change | Adopted repository evidence | Limit |
| --- | --- | --- |
| PR #89 monitor | Merge `3e80697fc57f1f17bf1a23e46d3fb42311c01dc5` | Source retained; historical Rev7 tool, not an S1 requirement or proof of installation. |
| PR #90 tooling CI | Merge `58139254e843fa731877cf5c4f541512d1d32224` | Adopted docs/tooling/full policy; [AGENTS](../../AGENTS.md#ci-selection-and-remote-ci-handoff) is authority. |
| PR #91 S1 runbook | Head `b83248a67ccc042e8918f4191719b7e8a0a72e9e`; merge `168ed54a7448e9f469986d2ef1efa49f4747da43` | Gate-B owner execution closeout recorded; no dormant/live release approval follows. |
| PR #92 outcome batching | Main merge `c9662b242f5f8894e7247349dea42972b714b4f5` | [Adopted execution policy](../../AGENTS.md#outcome-based-batching); Outcome 2 not implemented by this cleanup. |
| PR #93 S1 architecture | Source `27274492b3a2f6dab1cbb86ae239c056bee1421d`; merge `284c2fe32014f8f3011ac6677ddfe99b0a16ca22` | Credential-process supersession only; R4/H3/H4 safeguards unchanged. |

## Outcome-2 CI source implementation

The Outcome-2 branch implements the [revision-3 four-lane CI contract](../architecture/plans/ci-tooling-fast-path.md): docs, exact AGENTS policy, isolated monitor tooling and fail-closed full. All PRs gain changed-Markdown checks; app/database behavior is unchanged. This is source implementation pending full remote CI, separate Tier-2 review and merge; the PR #90 adoption row above remains historical merged evidence. No deployment, branch-protection or provider configuration change is established. Vercel filtering remains NEEDS VERIFICATION.

## Outcome-3 Batch-1 Production closeout

**Outcome 3 Batch 1 — Opportunities Operating Workspace: MERGED / DEPLOYED / PRODUCTION VERIFIED**, including migration 107. [Dated closeout](../architecture/evidence/outcome-3-batch-1-implementation-2026-10-05.md#production-closeout--2026-10-05) records O3-r2, PR #97, reviewed HEAD, successful CI, exact deployed merge, READY Vercel deployment, ledger normalization and bounded receptionist/privacy acceptance. Lifecycle dormancy was preserved; this rollout does not advance S1/H3/H4 or activate delivery.

**Outcome 3 overall is NOT complete. Batch 2 — Tasks / My Work and Admissions Calendar — has source implementation on the authorized feature branch, with focused local acceptance passed after the owner-authorized forward legacy-time read correction in migration 108. Fresh remote CI and separate exact-SHA independent review remain pending; release is held.** The [O3-r2 plan](../architecture/plans/outcome-3-receptionist-workspace.md) stays active. The wider dedicated walk-in redesign remains incomplete.

## Next meaningful outcomes

1. Separately authorize and complete **dormant lifecycle integration acceptance**, H3-06/07/08, using the existing reviewed contracts and independent verification role.
2. Separately define/bind and approve **prospective live lifecycle activation**, H4/Gate C. Credential readiness alone does not satisfy it.
3. Finish **Outcome-3 Batch 2 Tasks / My Work and Admissions Calendar** validation/review/release under the [implementation evidence](../architecture/evidence/outcome-3-batch-2-implementation-2026-10-05.md); the owner authorized O3-r2 Batch 2 on 2026-10-05. The remaining walk-in outcome stays separate; retain ADR-003 and existing enrollment/finance engines.
4. Complete **live Meta Insights sync** under a separate provider contract/activation outcome; reporting is already implemented.

Online learning requires architecture before implementation; it is not designed here. The [multi-source assessment](../architecture/evidence/crm-multi-source-readiness-2026-10-01.md) also records Director onboarding, incremental activation and website-adapter gaps. These are identified dependencies, not new commissions.

## History

The former chronological register is preserved in the [pre-Outcome-1 snapshot](../architecture/history/current-state-before-outcome-1.md), with original dates, findings and approval scopes. The [historical index](../architecture/history/README.md) separates it from current authority and links the old H3 → Rev7 → S1 lineage. No superseded credential checklist is an active execution gate.
