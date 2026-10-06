# Current state

Evidence register as of **2026-10-06 (Asia/Shanghai)**. Two baselines are tracked separately:

- **Recorded deployed application source:** `f30e8d9ac628839c2282549324f4a3fa9b5b8ae8` (PR #104 merge), per the [UIF Production closeout](../architecture/evidence/english-hills-ui-foundation-implementation-2026-10-06.md#production-closeout--2026-10-06).
- **Repository main:** advances independently through documentation or later implementation merges, so this register does not name a current main SHA. Fetch `origin/main` for the current repository SHA. A repository merge is not deployment evidence; only dated release evidence changes the recorded deployed source above. (The tool-independent transition work began from base `c41b962538c5073e5e00cb264a31388533735ac9`, PR #106, which differed from the deployed source only by documentation.)

Current owner decisions are in [OWNER_DECISIONS](OWNER_DECISIONS.md); the active receptionist outcome is [RCC-r1](../architecture/plans/rcc-r1-receptionist-crm-completion.md) (RCC-A1 approved for implementation, not yet implemented). This register reconciles repository implementation with dated owner/release evidence; the UIF closeout below records the bounded 2026-10-06 Production inspection. [Architecture](ARCHITECTURE.md) explains structure and state vocabulary; [feature index](../architecture/FEATURE_INDEX.md) links code/migrations.

## Capability register

| Capability | State | Current evidence | Important limit |
| --- | --- | --- | --- |
| Core school platform | IMPLEMENTED; production application | Next.js/Supabase code and cumulative migrations; [latest recorded runtime release](../architecture/evidence/english-hills-ui-foundation-implementation-2026-10-06.md#production-closeout--2026-10-06) | A deployed application/ledger is not feature-by-feature acceptance. |
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
| Lifecycle destination / dormant acceptance | PLANNED remainder: H3-06/07/08 | [Current H3 contract](../architecture/plans/crm-h3-technical-readiness.md#named-h3-execution-steps-order-and-recovery); 2026-10-02 acceptance had zero configured destinations; [110 release](../architecture/evidence/english-hills-ui-foundation-implementation-2026-10-06.md#production-closeout--2026-10-06) reconfirmed inactive lifecycle cron and zero activation epochs/deliveries/attempts | The bounded UIF release check does not complete dormant integration acceptance. |
| Lifecycle activation | DISABLED; H4/Gate C PLANNED | Gate-B closeout confirms server live gate absent; [S1 separation](../architecture/plans/crm-meta-lifecycle-credential-simplification.md#dormant-integration-and-activation-separation) | No Test Events or real lifecycle events sent; prospective source/cohort, privacy, ownership/exclusion, epoch and release approval remain required. |
| Meta Insights | PARTIALLY IMPLEMENTED | 089/090, reporting and fixture adapter; [contract](../crm-meta-insights.md) | `live_sync_enabled: false`; live transport/scheduler/account acceptance unfinished. |
| Academics / teacher / parent / student portals | IMPLEMENTED — NEEDS VERIFICATION | [Whole-platform feature map](../architecture/FEATURE_INDEX.md#school-operations) | Routes and schema exist; no broad portal/academic Production acceptance is inferred. |
| Online learning | MISSING ARCHITECTURE | [Architecture gaps](ARCHITECTURE.md#architecture-gaps) | No durable room/video-provider/access/breakout/online-session architecture. |

## Deployment and credential evidence boundaries

The latest recorded Production database ledger is **001–110**, normalized through repository migration 110 during the UI Foundation release on 2026-10-06. Exact Production source is `f30e8d9ac628839c2282549324f4a3fa9b5b8ae8`; Vercel deployment `dpl_H9LkTg4jaEU4jV7tHBqi4AxsFJoV` is READY with Production alias `admin.english-hills.com`. The [UI Foundation closeout](../architecture/evidence/english-hills-ui-foundation-implementation-2026-10-06.md#production-closeout--2026-10-06) records migration 110 and bounded frontend/read-model compatibility evidence. Migrations 107–110 are deployed and immutable. Outcome 3 itself completed through 107–108; migration 109 remains the post-O3 scheduling/picker correction and migration 110 is the later UIF-r1a presentation-only row-label extension. Check current main and deployment evidence before allocating any future migration.

Current credential state is **CREDENTIAL READY / DELIVERY SUCCESS NOT VERIFIED / LIFECYCLE DELIVERY REMAINS DISABLED**. Accepted identities, scope/lifetime, capability and metadata-only Vercel verification are recorded once in the [nonsecret Gate-B closeout](../architecture/evidence/crm-h3-s1-gate-b-closeout-2026-10-05.md). [S1](../architecture/plans/crm-meta-lifecycle-credential-simplification.md) is the sole credential architecture and the [Gate-B runbook](../architecture/plans/crm-h3-s1-gate-b-credential-runbook.md) the sole procedure. Earlier token/key absence and uncreated-C2 statements are historical observations, not current blockers.

## Repository authority adoption

| Change | Adopted repository evidence | Limit |
| --- | --- | --- |
| PR #89 monitor | Merge `3e80697fc57f1f17bf1a23e46d3fb42311c01dc5` | Source retained; historical Rev7 tool, not an S1 requirement or proof of installation. |
| PR #90 tooling CI | Merge `58139254e843fa731877cf5c4f541512d1d32224` | Adopted docs/tooling/full policy; [AGENTS](../../AGENTS.md#ci-selection-and-remote-ci-handoff) is authority. |
| PR #91 S1 runbook | Head `b83248a67ccc042e8918f4191719b7e8a0a72e9e`; merge `168ed54a7448e9f469986d2ef1efa49f4747da43` | Gate-B owner execution closeout recorded; no dormant/live release approval follows. |
| PR #92 outcome batching | Main merge `c9662b242f5f8894e7247349dea42972b714b4f5` | [Adopted execution policy](../../AGENTS.md#outcome-based-batching); Outcome 2 not implemented by this cleanup. |
| PR #93 S1 architecture | Source `27274492b3a2f6dab1cbb86ae239c056bee1421d`; merge `284c2fe32014f8f3011ac6677ddfe99b0a16ca22` | Credential-process supersession only; R4/H3/H4 safeguards unchanged. |

## Outcome-2 CI routing — merged

**MERGED.** The [revision-3 four-lane CI contract](../architecture/plans/ci-tooling-fast-path.md) (docs, exact AGENTS policy, isolated monitor tooling and fail-closed full, plus changed-Markdown checks on all PRs) merged in PR #95: head `e4b548591cd2efd40fe3330312e5c476b70f25a3`, merge `e76ed9b6a88349a0d53f192f112b230c6c75d2b3` (2026-10-05). [AGENTS](../../AGENTS.md#ci-selection-and-remote-ci-handoff) is the current authority. An earlier version of this section recorded the branch as pending CI, review and merge; that was accurate before PR #95. App/database behavior is unchanged. No branch-protection or provider configuration change is established, and Vercel filtering remains NEEDS VERIFICATION.

## Outcome-3 Production closeout

**Outcome 3 — Receptionist CRM / Admissions Operating Workspace: COMPLETED / MERGED / DEPLOYED / PRODUCTION VERIFIED.** Batch 1 Opportunities is verified through migration 107 and [its dated closeout](../architecture/evidence/outcome-3-batch-1-implementation-2026-10-05.md#production-closeout--2026-10-05). Batch 2 Tasks / My Work and Admissions Calendar is verified through migration 108 and [its dated closeout](../architecture/evidence/outcome-3-batch-2-implementation-2026-10-05.md#production-closeout--2026-10-05). The completed [O3-r2 contract](../architecture/plans/completed/outcome-3-receptionist-workspace.md) remains the design record.

The final Batch-2 rollout preserved stored-role boundaries, bounded reads, task/owner separation, truthful legacy-time handling, trusted enrollment-driven conversion and dormant Meta lifecycle gates. The dedicated walk-in enrollment redesign was explicitly excluded from Outcome 3 and remains separate planned work.

## Post-Outcome-3 receptionist UX correction Production closeout

**PR #102: MERGED / DEPLOYED / PRODUCTION-COMPATIBLE.** Final reviewed head `8f12f674f1c1fd910b8410b4bbb2d4d3b3917e3c` merged as `3c462f7fce87261ff92c565fecf8ab652262bb81`. All four corrections—PostgreSQL Casablanca civil scheduled-time display, composable Programme/Search and drawer navigation, safe staff label disambiguation, and accurate Attention wording—are adopted with deployed `109_crm_operational_scheduled_display.sql` and the matching frontend. This is a later compatible post-O3 correction, not a rewrite of completed O3-r2 or its 107–108 acceptance.

The [dated release evidence](../architecture/evidence/receptionist-production-ux-corrections-2026-10-05.md#production-closeout--2026-10-05), supplied by the owner for this documentation reconciliation, records one real center-visit sample with consistent civil time across Work Queue, Admissions Calendar and drawer next-task projection; bounded staff projection with unique sampled labels; private `scheduled_civil` / `staff_reference` helpers; and intended Work Queue/Calendar RPC access. No recent Vercel runtime errors were found. Public route probes reached the application/login; **no fresh authenticated receptionist browser walkthrough was performed during release verification**.

**Meta lifecycle remains DORMANT:** release verification recorded inactive lifecycle cron, zero activation epochs, zero external deliveries and zero external delivery attempts. These observations do not authorize activation or complete separate dormant integration acceptance. Scheduling, authorization, commands, finance and enrollment semantics remain unchanged.

## UI Foundation Production closeout — 2026-10-06

**UIF-r1 + UIF-r1a: MERGED / DEPLOYED / PRODUCTION VERIFIED WITH BOUNDED ACCEPTANCE.** PR #104 final reviewed head `3d8d5782a21d022ccf2a3a85e7eb1fb7721d8a42` merged as `f30e8d9ac628839c2282549324f4a3fa9b5b8ae8`. The matching Vercel Production deployment `dpl_H9LkTg4jaEU4jV7tHBqi4AxsFJoV` is READY and serves `admin.english-hills.com`. Migration `110_crm_operational_row_staff_labels.sql` is applied and the Production ledger is normalized through 110.

Bounded Production verification confirmed authenticated Opportunities and Work Queue projections include the new safe row label fields, `crm_list_open_tasks` includes `assignee_display_label`, the operational drawer projection includes current owner/task safe labels, and the staff picker projection remains limited to `id/name/role/display_label` without email/phone. Existing public read RPC execution remains available to authenticated staff while the private `staff_display_label` and `staff_reference` helpers remain non-executable by API roles. No new public RPC, permission/RLS expansion, private staff field or business write was introduced.

The deployment route reaches the expected login surface, no recent Vercel runtime errors were found, and lifecycle remained dormant: zero enabled lifecycle connections, zero open/total activation epochs, zero live/total external deliveries, zero delivery attempts and zero active lifecycle cron jobs. **No fresh authenticated receptionist browser walkthrough was performed during this release verification**; browser acceptance remains the exact-SHA Chromium/WebKit evidence from PR #104.

## Next meaningful outcomes

1. Separately authorize and complete **dormant lifecycle integration acceptance**, H3-06/07/08, using the existing reviewed contracts and independent verification role.
2. Separately define/bind and approve **prospective live lifecycle activation**, H4/Gate C. Credential readiness alone does not satisfy it.
3. Define the next **Director CRM & Growth Intelligence** outcome on top of the now-verified receptionist funnel and existing director reporting, without broadening receptionist analytics/technical access. The dedicated walk-in redesign remains a separate receptionist outcome.
4. Complete **live Meta Insights sync** under a separate provider contract/activation outcome; reporting is already implemented.

Online learning requires architecture before implementation; it is not designed here. The [multi-source assessment](../architecture/evidence/crm-multi-source-readiness-2026-10-01.md) also records Director onboarding, incremental activation and website-adapter gaps. These are identified dependencies, not new commissions.

## History

The former chronological register is preserved in the [pre-Outcome-1 snapshot](../architecture/history/current-state-before-outcome-1.md), with original dates, findings and approval scopes. The [historical index](../architecture/history/README.md) separates it from current authority and links the old H3 → Rev7 → S1 lineage. No superseded credential checklist is an active execution gate.

## UIF-r1a owner amendment — 2026-10-06

**OWNER APPROVED / MERGED / DEPLOYED / BOUNDED PRODUCTION ACCEPTANCE COMPLETE.** The narrow [UIF-r1a read-projection extension](../architecture/plans/english-hills-ui-foundation.md#uif-r1a--owner-approved-stable-row-staff-identity) shipped in PR #104 with migration `110_crm_operational_row_staff_labels.sql`. The historical >50-staff BLOCKED reproduction remains preserved as chronology; the later amendment resolution records passing 54-staff Chromium/WebKit acceptance and the [Production closeout](../architecture/evidence/english-hills-ui-foundation-implementation-2026-10-06.md#production-closeout--2026-10-06) records deployed read-label/privacy/authority checks. Production is now recorded through migration 110.
