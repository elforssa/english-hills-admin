# Current state

Evidence register as of **2026-10-05 (Asia/Shanghai)**. Repository and current recorded Production source baseline: main `3c462f7fce87261ff92c565fecf8ab652262bb81` (PR #102 merge). This register reconciles repository implementation with dated owner/release evidence; it is not a new Production inspection. [Architecture](ARCHITECTURE.md) explains structure and state vocabulary; [feature index](../architecture/FEATURE_INDEX.md) links code/migrations.

## Capability register

| Capability | State | Current evidence | Important limit |
| --- | --- | --- | --- |
| Core school platform | IMPLEMENTED; production application | Next.js/Supabase code and cumulative migrations; [latest recorded runtime release](../architecture/evidence/receptionist-production-ux-corrections-2026-10-05.md#production-closeout--2026-10-05) | A deployed application/ledger is not feature-by-feature acceptance. |
| Receptionist operating workspace | LIVE; Outcome 3 complete | PRs #97/#99; migrations 107/108; [Outcome-3 closeout](../architecture/evidence/outcome-3-batch-2-implementation-2026-10-05.md#production-closeout--2026-10-05) | Opportunities, Tasks/My Work and Admissions Calendar are Production verified; the dedicated walk-in redesign remains a separate planned outcome. |
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
| Lifecycle destination / dormant acceptance | PLANNED remainder: H3-06/07/08 | [Current H3 contract](../architecture/plans/crm-h3-technical-readiness.md#named-h3-execution-steps-order-and-recovery); 2026-10-02 acceptance had zero configured destinations; [109 release](../architecture/evidence/receptionist-production-ux-corrections-2026-10-05.md#production-closeout--2026-10-05) records inactive cron and zero activation epochs/deliveries/attempts | Destination count was not refreshed by the supplied 109 evidence. Credential closeout and bounded release checks do not complete dormant integration acceptance. |
| Lifecycle activation | DISABLED; H4/Gate C PLANNED | Gate-B closeout confirms server live gate absent; [S1 separation](../architecture/plans/crm-meta-lifecycle-credential-simplification.md#dormant-integration-and-activation-separation) | No Test Events or real lifecycle events sent; prospective source/cohort, privacy, ownership/exclusion, epoch and release approval remain required. |
| Meta Insights | PARTIALLY IMPLEMENTED | 089/090, reporting and fixture adapter; [contract](../crm-meta-insights.md) | `live_sync_enabled: false`; live transport/scheduler/account acceptance unfinished. |
| Academics / teacher / parent / student portals | IMPLEMENTED — NEEDS VERIFICATION | [Whole-platform feature map](../architecture/FEATURE_INDEX.md#school-operations) | Routes and schema exist; no broad portal/academic Production acceptance is inferred. |
| Online learning | MISSING ARCHITECTURE | [Architecture gaps](ARCHITECTURE.md#architecture-gaps) | No durable room/video-provider/access/breakout/online-session architecture. |

## Deployment and credential evidence boundaries

The latest recorded Production database ledger is **001–109**, normalized through 109 during the post-Outcome-3 correction release on 2026-10-05. Exact Production source is `3c462f7fce87261ff92c565fecf8ab652262bb81`; Vercel deployment `dpl_ADReczUnoX6hVYnh1KNJVeqqjz6X` is READY with Production alias `admin.english-hills.com`. The [correction closeout](../architecture/evidence/receptionist-production-ux-corrections-2026-10-05.md#production-closeout--2026-10-05) records migration 109 and bounded frontend/read-model compatibility evidence. Migrations 107–109 are deployed and immutable. Outcome 3 itself completed through 107–108; its earlier source and acceptance remain in the unchanged [Batch-2 closeout](../architecture/evidence/outcome-3-batch-2-implementation-2026-10-05.md#production-closeout--2026-10-05). Check current main and deployment evidence before allocating any future migration.

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

## Outcome-3 Production closeout

**Outcome 3 — Receptionist CRM / Admissions Operating Workspace: COMPLETED / MERGED / DEPLOYED / PRODUCTION VERIFIED.** Batch 1 Opportunities is verified through migration 107 and [its dated closeout](../architecture/evidence/outcome-3-batch-1-implementation-2026-10-05.md#production-closeout--2026-10-05). Batch 2 Tasks / My Work and Admissions Calendar is verified through migration 108 and [its dated closeout](../architecture/evidence/outcome-3-batch-2-implementation-2026-10-05.md#production-closeout--2026-10-05). The completed [O3-r2 contract](../architecture/plans/completed/outcome-3-receptionist-workspace.md) remains the design record.

The final Batch-2 rollout preserved stored-role boundaries, bounded reads, task/owner separation, truthful legacy-time handling, trusted enrollment-driven conversion and dormant Meta lifecycle gates. The dedicated walk-in enrollment redesign was explicitly excluded from Outcome 3 and remains separate planned work.

## Post-Outcome-3 receptionist UX correction Production closeout

**PR #102: MERGED / DEPLOYED / PRODUCTION-COMPATIBLE.** Final reviewed head `8f12f674f1c1fd910b8410b4bbb2d4d3b3917e3c` merged as `3c462f7fce87261ff92c565fecf8ab652262bb81`. All four corrections—PostgreSQL Casablanca civil scheduled-time display, composable Programme/Search and drawer navigation, safe staff label disambiguation, and accurate Attention wording—are adopted with deployed `109_crm_operational_scheduled_display.sql` and the matching frontend. This is a later compatible post-O3 correction, not a rewrite of completed O3-r2 or its 107–108 acceptance.

The [dated release evidence](../architecture/evidence/receptionist-production-ux-corrections-2026-10-05.md#production-closeout--2026-10-05), supplied by the owner for this documentation reconciliation, records one real center-visit sample with consistent civil time across Work Queue, Admissions Calendar and drawer next-task projection; bounded staff projection with unique sampled labels; private `scheduled_civil` / `staff_reference` helpers; and intended Work Queue/Calendar RPC access. No recent Vercel runtime errors were found. Public route probes reached the application/login; **no fresh authenticated receptionist browser walkthrough was performed during release verification**.

**Meta lifecycle remains DORMANT:** release verification recorded inactive lifecycle cron, zero activation epochs, zero external deliveries and zero external delivery attempts. These observations do not authorize activation or complete separate dormant integration acceptance. Scheduling, authorization, commands, finance and enrollment semantics remain unchanged.

## UI Foundation source implementation — 2026-10-06

**IMPLEMENTED ON FEATURE BRANCH; NOT MERGED OR DEPLOYED.** Owner-approved [UIF-r1](../architecture/plans/english-hills-ui-foundation.md) / [ADR-005](../architecture/decisions/ADR-005-operational-ui-foundation.md) is implemented on `codex/ui-foundation-implementation`, based on verified main `b8fe8eb31659358e9c2817e0f5740716bc29f6d5`. Shared operational primitives serve Opportunities/drawer, Tasks/My Work and Students list/detail. Dashboard finance and Placement list reads have bounded truthful error/loading/retry presentation with unchanged read arguments and domain behavior. [Implementation evidence](../architecture/evidence/english-hills-ui-foundation-implementation-2026-10-06.md) owns local acceptance and handoff evidence; CI/review/release are separate. No migration, new RPC, permission or Production mutation. The deployed #102/109 baseline above remains the latest cited Production record.

**Acceptance remains blocked.** PR #104's initial Verify run failed the Linux Chromium Students scroll-region focus assertion. The correction explicitly applies the approved 2px outline and clears mobile-navigation inertness on desktop resize. A separate 54-staff browser reproduction confirms unresolved row identity: Opportunities owners outside staff page 1 are generic, and My Work owner/assignee labels change with picker pages. Existing row reads lack the server's globally disambiguated staff labels; resolving this without directory scanning or a label-rule fork requires an owner-authorized read-contract decision. This task stops that part at UIF-r1's no-new-read/no-migration boundary. See the [correction record](../architecture/evidence/english-hills-ui-foundation-implementation-2026-10-06.md#pr-104-coordinated-corrections--2026-10-06). Passing CI alone would not clear this acceptance hold.

## Next meaningful outcomes

1. Separately authorize and complete **dormant lifecycle integration acceptance**, H3-06/07/08, using the existing reviewed contracts and independent verification role.
2. Separately define/bind and approve **prospective live lifecycle activation**, H4/Gate C. Credential readiness alone does not satisfy it.
3. Define the next **Director CRM & Growth Intelligence** outcome on top of the now-verified receptionist funnel and existing director reporting, without broadening receptionist analytics/technical access. The dedicated walk-in redesign remains a separate receptionist outcome.
4. Complete **live Meta Insights sync** under a separate provider contract/activation outcome; reporting is already implemented.

Online learning requires architecture before implementation; it is not designed here. The [multi-source assessment](../architecture/evidence/crm-multi-source-readiness-2026-10-01.md) also records Director onboarding, incremental activation and website-adapter gaps. These are identified dependencies, not new commissions.

## History

The former chronological register is preserved in the [pre-Outcome-1 snapshot](../architecture/history/current-state-before-outcome-1.md), with original dates, findings and approval scopes. The [historical index](../architecture/history/README.md) separates it from current authority and links the old H3 → Rev7 → S1 lineage. No superseded credential checklist is an active execution gate.
