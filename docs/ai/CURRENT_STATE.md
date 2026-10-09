# Current state

Evidence register as of **2026-10-09 (Asia/Shanghai)**. Two baselines are tracked separately:

- **Recorded deployed application source:** `f9753cca32511812bc7a4f79187fc9386ff15b1f` (PR #125 merge, Premium retirement Release A; Vercel `dpl_9pCG6uajkDSdo6rd2MNdGT9adwNN`), per the [Release A release record](../architecture/evidence/premium-retirement-release-a-production-2026-10-09.md). **Correction:** this register previously named `b278d4ca348447a9a20aefeb6d8c3fafab13a312` (PR #115 merge, RCC-B1, [release record](../architecture/evidence/rcc-b1-production-2026-10-08.md)) as the deployed source after later merges. Documentation-only merges also deploy automatically: at the Release A pre-checks Production ran `ebea8cf30d5ecfb9e8ef8d8dc552cf91a34e570f` (PR #118 merge, `dpl_HBGqjMtKxx1gmRaTYmgqJGNkHimD`), which differed from `b278d4c…` by documentation only. The earlier recorded source, `79b08359363abd2e83c842c7360b14fadce88dea` (PR #112, RCC-A2), is documented in the [RCC-A2 release record](../architecture/evidence/rcc-a2-production-2026-10-07.md).
- **Repository main:** advances independently through documentation or later implementation merges, so this register does not name a current main SHA. Fetch `origin/main` for the current repository SHA. A repository merge is not deployment evidence; only dated release evidence changes the recorded deployed source above. (The tool-independent transition work began from base `c41b962538c5073e5e00cb264a31388533735ac9`, PR #106, which differed from the deployed source only by documentation.)

Current owner decisions are in [OWNER_DECISIONS](OWNER_DECISIONS.md); the receptionist outcome [RCC-r1](../architecture/plans/completed/rcc-r1-receptionist-crm-completion.md) is **complete** (RCC-A1 Production verified 2026-10-07 with migration 111; RCC-A2 Production verified 2026-10-07 with migration 112; RCC-B1 Production verified with bounded acceptance 2026-10-08 with no migration). This register reconciles repository implementation with dated owner/release evidence; the UIF closeout below records the bounded 2026-10-06 Production inspection. [Architecture](ARCHITECTURE.md) explains structure and state vocabulary; [feature index](../architecture/FEATURE_INDEX.md) links code/migrations.

## Capability register

| Capability | State | Current evidence | Important limit |
| --- | --- | --- | --- |
| Core school platform | IMPLEMENTED; production application | Next.js/Supabase code and cumulative migrations; [latest recorded runtime release](../architecture/evidence/rcc-a2-production-2026-10-07.md) | A deployed application/ledger is not feature-by-feature acceptance. |
| Receptionist operating workspace | LIVE; Outcome 3 complete | PRs #97/#99; migrations 107/108; [Outcome-3 closeout](../architecture/evidence/outcome-3-batch-2-implementation-2026-10-05.md#production-closeout--2026-10-05) | Opportunities, Tasks/My Work and Admissions Calendar are Production verified; the dedicated walk-in redesign remains a separate planned outcome. |
| RCC-A1 outcome-led follow-up | LIVE; Production verified 2026-10-07 | PR #108, migration 111; [release record](../architecture/evidence/rcc-a1-production-2026-10-07.md) | Follow-up replacement covers explicit conversation decisions only; placement-preparation kind is UI-enforced; legacy payloads may keep NULL kind. No fresh authenticated browser walkthrough at release. |
| RCC-A2 enrollment UX hardening | LIVE; Production verified 2026-10-07 | PR #112, migration 112; [release record](../architecture/evidence/rcc-a2-production-2026-10-07.md) | Casablanca birth-date rule covers enrollment initiation only (manual lead creation keeps `current_date`); browser `casablancaInstant` tz-data limitation deferred; Nouvelle pré-inscription unchanged. No fresh authenticated browser walkthrough at release. |
| RCC-B1 responsive Opportunities presentation | LIVE; Production verified with bounded acceptance 2026-10-08 | PR #115, merge `b278d4c…`, no migration; [release record](../architecture/evidence/rcc-b1-production-2026-10-08.md) | Presentation only. No authenticated real-staff Production walkthrough at release; the receptionist/owner performs it separately. Intermediate sidebar not changed. |
| CRM status/tasks/activities/Today | IMPLEMENTED | 078–082/091; [ADR-001](../architecture/decisions/ADR-001-crm-lifecycle.md) | Live follow-up policy values/operating hours NEEDS VERIFICATION; SQL defaults do not prove configuration. |
| Placement | IMPLEMENTED | 083, linked placement commands and [workflow](WORKFLOWS.md#placement-test) | Dedicated Production feature acceptance NEEDS VERIFICATION; test completion is not conversion. |
| Admissions/enrollment/conversion | IMPLEMENTED | 062, 070–074, 084, 112; [workflow](WORKFLOWS.md#crm--enrollment) | Feature-specific Production acceptance NEEDS VERIFICATION; only linked Confirmed/Validated enrollment converts. |
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
| Premium retirement Release A | LIVE; Production verified with bounded acceptance 2026-10-08/09 UTC | PR #125, merge `f9753cc…`, migration 113, `sendReceiptEmail` v19, open-charge cleanup (D5a); [release record](../architecture/evidence/premium-retirement-release-a-production-2026-10-09.md) | Formule and the workshop module are removed from the application; workshop tables, policies, functions and receptionist workshop permissions remain in the database until Release B, which is **planned, not approved** and requires a backup first. Receptionist/teacher `/premium-sessions` redirect checks outstanding. |
| Academics / teacher / parent / student portals | IMPLEMENTED — NEEDS VERIFICATION | [Whole-platform feature map](../architecture/FEATURE_INDEX.md#school-operations) | Routes and schema exist; no broad portal/academic Production acceptance is inferred. |
| Online learning | MISSING ARCHITECTURE | [Architecture gaps](ARCHITECTURE.md#architecture-gaps) | No durable room/video-provider/access/breakout/online-session architecture. |

## Deployment and credential evidence boundaries

The latest recorded Production database ledger is **001–113**: migration `113_premium_retirement_finance_contract.sql` was applied on 2026-10-08 (about 16:55Z) for Premium retirement Release A, recorded atomically as version `113` with stored statement MD5 `647c9e2c1aec7c0c4becb044776158a4` (equal to the reviewed file), no normalization ([release record](../architecture/evidence/premium-retirement-release-a-production-2026-10-09.md)). Before that, the ledger was **001–112** and was re-read unchanged on 2026-10-08 after the RCC-B1 release, which has no migration (112 rows, highest version `112`). Migration 112 was applied on 2026-10-07 for RCC-A2, recorded atomically as version `112` with no normalization; the stored statement MD5 `213c9a435b93a2fa267b8e0072a95caa` equals the reviewed file's. Exact Production source at the time of the 112 application was `79b08359363abd2e83c842c7360b14fadce88dea` (Vercel `dpl_6NEt396vjcKG53c6WEHgKQoGp4Ho`); after the RCC-B1 release the recorded Production source was `b278d4ca348447a9a20aefeb6d8c3fafab13a312` (RCC-B1, below), and the current source is the one recorded at the top of this register. Deployment `dpl_6NEt396vjcKG53c6WEHgKQoGp4Ho` was READY with Production alias `admin.english-hills.com` ([RCC-A2 release record](../architecture/evidence/rcc-a2-production-2026-10-07.md)). Production PostgreSQL `TimeZone` is `UTC`, and PostgreSQL resolved `Africa/Casablanca` to UTC+01:00 at release. Migration 111 was applied earlier the same day for RCC-A1 ([RCC-A1 release record](../architecture/evidence/rcc-a1-production-2026-10-07.md)). The ledger was 001–110 after the UI Foundation release on 2026-10-06, with 110 normalized then. The [UI Foundation closeout](../architecture/evidence/english-hills-ui-foundation-implementation-2026-10-06.md#production-closeout--2026-10-06) records migration 110 and bounded frontend/read-model compatibility evidence. Migrations 107–113 are deployed and immutable. Outcome 3 itself completed through 107–108; migration 109 remains the post-O3 scheduling/picker correction and migration 110 is the later UIF-r1a presentation-only row-label extension. Check current main and deployment evidence before allocating any future migration.

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

## RCC-A1 Production closeout — 2026-10-07

**RCC-A1: MERGED / DEPLOYED / PRODUCTION VERIFIED WITH BOUNDED ACCEPTANCE.** PR #108 reviewed head `7444fdc5fa7155c57d36cef2605160b36b280fe4` merged as `8d5af40bc21177c582efe5df96d31ada8d7d9ff5` after migration-first application of `111_crm_rcc_a1_outcome_led_followup.sql`, as the owner approved. Vercel Production `dpl_CBvNM7AzLrqR6frH3NQ8CZMrmNHU` is READY on that commit.

Rolled-back receptionist probes confirmed the following:

- outcome-led decisions without notes;
- server-resolved reminder presets;
- cross-channel replacement of open callback and WhatsApp follow-ups by conversation decisions;
- rejection of out-of-window agreed callbacks;
- legacy payload compatibility;
- the new read fields, without email or phone;
- denial of direct table and private-helper access and of profileless identities.

All other functions, grants, RLS policies and triggers are identical to the pre-release baseline, so finance and conversion authority are unchanged. Lifecycle/Meta remains dormant: lifecycle cron inactive, and zero activation epochs, pending intents and sync runs.

Accepted limitations: follow-up replacement is guaranteed only for explicit conversation decisions; other creation paths keep their existing behavior, and broader consolidation is deferred. Placement-preparation `schedule_kind` is UI-enforced rather than a direct-RPC invariant. New center visits are appointments, but legacy payloads may keep NULL. **No fresh authenticated receptionist browser walkthrough was performed during release verification.** Details: [release record](../architecture/evidence/rcc-a1-production-2026-10-07.md).

## RCC-A2 Production closeout — 2026-10-07

**RCC-A2: MERGED / DEPLOYED / PRODUCTION VERIFIED WITH BOUNDED ACCEPTANCE.** PR #112 reviewed head `b213e93408ccca2514a48bd9c68d483f8ee46999` merged as `79b08359363abd2e83c842c7360b14fadce88dea`. The owner approved migration-first, so `112_crm_rcc_a2_enrollment_ux.sql` was applied before the merge. Vercel Production `dpl_6NEt396vjcKG53c6WEHgKQoGp4Ho` is READY on that commit.

Only `crm_start_enrollment` and `crm_get_enrollment_context` changed. Every other function, and all grants, RLS policies, triggers and schema, are identical to the pre-release baseline, including `command`, `new_task`, `next_window`, `evaluate_conversion`, `create_charge_payment` and `lock_enrollment_intent`.

Rolled-back synthetic probes (41/41) confirmed:

- historical SQLSTATE and message plus the `crm_enrollment.*` reason for a future birth date, a past follow-up and other validations;
- `linked_student` projection for receptionist, admin and director, including the safe archived-learner shape;
- pre-enrollment initiation keeps the opportunity QUALIFIED and creates the enrollment follow-up, with the result carrying its metadata;
- other roles and `anon` are denied;
- conversion only through a linked Confirmed enrollment;
- no finance, lifecycle or delivery rows.

Lifecycle/Meta remains dormant, intake is healthy, and no release-related runtime errors appeared.

Limitations:

- The Casablanca birth-date rule covers enrollment initiation only; manual lead creation keeps `current_date`, in session `UTC`.
- The pre-existing browser `casablancaInstant` tz-data issue is deferred.
- **Nouvelle pré-inscription** is unchanged.
- No fresh authenticated browser walkthrough was performed.

Details: [release record](../architecture/evidence/rcc-a2-production-2026-10-07.md).

## RCC-B1 Production closeout — 2026-10-08

**RCC-B1: MERGED / DEPLOYED / PRODUCTION VERIFIED WITH BOUNDED ACCEPTANCE.** Architecture revision B1-r3. PR #115 reviewed head `73b3826395b4af184e4d724bdfbb705c097230a1` (exact-head Verify run [37732507087](https://github.com/elforssa/english-hills-admin/actions/runs/37732507087) green; independent Tier-2 re-review [READY FOR FINAL REVIEW](https://github.com/elforssa/english-hills-admin/pull/115#issuecomment-6053587429)) merged as `b278d4ca348447a9a20aefeb6d8c3fafab13a312` on base `e56a70b3f83ff1b948b5e68c9f70be780dff6e08`. Vercel Production `dpl_CqtdvAWUwNmtVTByFaQqBBv5zKcs` was READY on that commit and served `admin.english-hills.com` at release.

- **No migration.** The ledger remains 001–112, and the diff of `supabase/` across the merge is empty.
- **Bounded read-only checks passed:** unauthenticated `/` and `/crm/leads` redirect to `/login` (307), `/login` returns 200, no error-level Vercel runtime logs for the new deployment, and lifecycle/Meta is unchanged and dormant (zero epochs, intents, checks, links, stops, retries, Meta runs and objects; one seeded provider contract; `crm-lifecycle-primary` inactive with no runs in 24 hours; `crm-intake-primary` active).
- **Rollback target:** `dpl_D4Tc8g1P8QwnBmZwY8DZkNDPMTFd` (source `e56a70b3f83ff1b948b5e68c9f70be780dff6e08`). A UI rollback needs no database action.
- **Limitation:** no authenticated real-staff Production walkthrough was performed by the release session, and no synthetic Production CRM record was created. The receptionist/owner performs the operational walkthrough separately.

**RCC-r1 is complete.** RCC-A1 (Production verified 2026-10-07), RCC-A2 (Production verified 2026-10-07) and RCC-B1 (Production verified with bounded acceptance 2026-10-08) together complete the receptionist CRM outcome. The plan is archived at [completed/rcc-r1](../architecture/plans/completed/rcc-r1-receptionist-crm-completion.md). Details: [RCC-B1 release record](../architecture/evidence/rcc-b1-production-2026-10-08.md).

**Deferred backlog (not approved or scheduled):** D6 universal ordinary communication follow-up consolidation; browser Casablanca timezone reliability; a Director correction tool for wrongly linked learners; Nouvelle pré-inscription duplicate-risk behavior; a possible sidebar icon-rail or intermediate sidebar as a future UI Foundation outcome.

## Premium retirement Release A Production closeout — 2026-10-08/09 UTC

**Release A: MERGED / DEPLOYED / PRODUCTION VERIFIED WITH BOUNDED ACCEPTANCE.** PR #125 reviewed head `5e3fe95e7fd7cc5a6cea29894955345d405d4ded` (Verify run 37802044455 green; owner-supplied narrow re-review READY FOR FINAL REVIEW) merged as `f9753cca32511812bc7a4f79187fc9386ff15b1f` on base `ebea8cf…`, after migration-first application of 113. Vercel Production `dpl_9pCG6uajkDSdo6rd2MNdGT9adwNN` is READY on the merge commit. `sendReceiptEmail` is v19 without the Formule row, still `verify_jwt` false.

- **Migration 113:** only `create_charge_payment_financial(jsonb)` changed (catalog diff of exactly one line out of 3,719); grants, owner, security mode and `search_path` unchanged. New Yearly charges store `Yearly · <year>` and plan `Standard`; new receipts store plan NULL; a receipt on a dated non-legacy Yearly charge builds `Yearly · <year>`.
- **Zero-payment probes** (rolled back) confirmed the charge text and plan, replay, the Q7 conflict and role denials; `receipt_number_seq` 258 before and after. Receipt-producing probes were not run by owner decision.
- **Open-charge cleanup (D5a):** 10 open non-legacy Yearly charge descriptions lost their plan word (target 10 → 0); every other charge, every receipt and balance totals unchanged; second run a no-op. It ran through the CLI wrapper with the script's psql-only line removed (see the release record).
- **Owner-accepted risk:** no PITR or backup was available; Release A relied on forward-migration and export rollback. **Release B must not proceed without a backup.**
- **Owner UI sweep:** 8 of 8 passed as admin/director; receptionist and teacher `/premium-sessions` redirect checks outstanding.
- **Still in place until Release B (planned, not approved):** the five workshop tables, their functions, policies and triggers, the receptionist workshop commands and read policies, the `premium_homework` storage purpose and notification type, the student Premium date columns, and one student with plan `Premium`. Issued receipts and settled charges keep their stored text (Q1).
- **Coordination:** open architecture PRs #121 and #124 propose migrations 113 and 114, which collide with Production 113 and Release B's provisional 114; they need renumbering. At R1 Production had 4 auth users and 3 profiles (pre-existing, recorded for later review).

## Next meaningful outcomes

1. **Next major product outcome: Director CRM & Growth Intelligence**, on top of the now-verified receptionist funnel and existing director reporting, without broadening receptionist analytics/technical access. It has no architecture or plan yet; H3/H4 below are not activated and are not moved ahead of it unless separately authorized.
2. Separately authorize and complete **dormant lifecycle integration acceptance**, H3-06/07/08, using the existing reviewed contracts and independent verification role.
3. Separately define/bind and approve **prospective live lifecycle activation**, H4/Gate C. Credential readiness alone does not satisfy it.
4. The dedicated walk-in redesign remains a separate receptionist outcome (Director CRM & Growth Intelligence is item 1).
5. Complete **live Meta Insights sync** under a separate provider contract/activation outcome; reporting is already implemented.

Online learning requires architecture before implementation; it is not designed here. The [multi-source assessment](../architecture/evidence/crm-multi-source-readiness-2026-10-01.md) also records Director onboarding, incremental activation and website-adapter gaps. These are identified dependencies, not new commissions.

## History

The former chronological register is preserved in the [pre-Outcome-1 snapshot](../architecture/history/current-state-before-outcome-1.md), with original dates, findings and approval scopes. The [historical index](../architecture/history/README.md) separates it from current authority and links the old H3 → Rev7 → S1 lineage. No superseded credential checklist is an active execution gate.

## UIF-r1a owner amendment — 2026-10-06

**OWNER APPROVED / MERGED / DEPLOYED / BOUNDED PRODUCTION ACCEPTANCE COMPLETE.** The narrow [UIF-r1a read-projection extension](../architecture/plans/english-hills-ui-foundation.md#uif-r1a--owner-approved-stable-row-staff-identity) shipped in PR #104 with migration `110_crm_operational_row_staff_labels.sql`. The historical >50-staff BLOCKED reproduction remains preserved as chronology; the later amendment resolution records passing 54-staff Chromium/WebKit acceptance and the [Production closeout](../architecture/evidence/english-hills-ui-foundation-implementation-2026-10-06.md#production-closeout--2026-10-06) records deployed read-label/privacy/authority checks. Production is now recorded through migration 110.
