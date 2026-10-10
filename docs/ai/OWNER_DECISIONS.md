# Owner decisions

Concise register of current owner product decisions, so any agent can continue without earlier chats. States: **APPROVED** (owner-approved scope), **PLANNED / NOT APPROVED** (direction only; needs owner approval before implementation) and **PARKED** (deliberately deferred). An approved decision is not implemented or deployed behavior; [CURRENT_STATE](CURRENT_STATE.md) owns that evidence. Execution gates in [AGENTS](../../AGENTS.md) still apply. Detailed scope belongs in the linked plan, not here.

Recorded 2026-10-06 from the owner's explicit instructions for the tool-independent transition.

## RCC-r1 — receptionist CRM completion — APPROVED

Plan: [RCC-r1](../architecture/plans/completed/rcc-r1-receptionist-crm-completion.md).

- The receptionist records interaction outcomes; guarded commands derive commercial status.
- Stage-changing drag-and-drop is not an authority mechanism.
- Display `À contacter` as **Contact en cours**.
- Display `Converti` as **Inscription confirmée**.
- **En réflexion** is follow-up metadata, not another pipeline stage.
- Trusted linked Confirmed/Validated enrollment remains the only conversion authority.
- Task assignment stays architecturally intact but becomes secondary in ordinary receptionist UI.
- Routine prose notes are optional where structured facts already provide sufficient evidence.
- Agreed appointments and internal reminders are separate concepts.
- Internal reminder presets are resolved server-side using the existing Casablanca policy.
- RCC-r1 does not change Meta/lifecycle authority, finance authority, enrollment-confirmation authority or permissions.

Phase states: RCC-A0 complete (investigation only); **RCC-A1 APPROVED and released** on 2026-10-07 (deployment evidence in [CURRENT_STATE](CURRENT_STATE.md)); RCC-A2 decisions **APPROVED** on 2026-10-07; **RCC-A2 released** on 2026-10-07 (PR #112, migration 112; evidence in [CURRENT_STATE](CURRENT_STATE.md)); RCC-B1 architecture **APPROVED** on 2026-10-07 (revision B1-r1, carried to B1-r3), implemented, and **released** on 2026-10-08 (PR #115, no migration; [release record](../architecture/evidence/rcc-b1-production-2026-10-08.md)). **RCC-r1 is COMPLETE** (2026-10-08): RCC-A1, RCC-A2 and RCC-B1 are each Production verified (RCC-B1 with bounded acceptance).

RCC-A1 release clarifications (2026-10-07): the guaranteed generic-follow-up replacement covers explicit conversation decisions across channels only. Broader consolidation across every task-creation path is deferred. The placement-preparation kind is UI-enforced, and legacy payloads may keep NULL `schedule_kind`. See the plan for boundaries and exclusions.

## RCC-A2 — receptionist enrollment UX hardening — APPROVED

Plan: [RCC-A2](../architecture/plans/completed/rcc-a2-enrollment-ux-hardening.md#owner-approval-record).

- Revision **A2-r1** was approved by the owner on **2026-10-07**, as recommended.
- The independent Tier-3 review of A2-r1 (`fde4c6a2187bd761ead7b1d2b3b1ce7d7bbdafd5`) returned CHANGES REQUIRED. Revision **A2-r2** incorporates those findings.
- A2-r2 passed independent re-review (`154d8a2…`) and merged in PR #111 (`6dae234…`). On **2026-10-07** the owner authorized implementation on a feature branch, local synthetic validation, the implementation PR and CI only ([implementation record](../architecture/plans/completed/rcc-a2-enrollment-ux-hardening.md#implementation-record)).
- On **2026-10-07** the owner explicitly approved the Tier-3 Production release of PR #112 at `b213e93…`. The approval covered migration-first order and the Production `TimeZone` and `Africa/Casablanca` configuration reads. It excluded RCC-B1, D6, D8, Meta/lifecycle activation, unrelated finance changes or migrations, and data repair. The release completed and was verified ([release record](../architecture/evidence/rcc-a2-production-2026-10-07.md)).

- **D1:** server reason codes in the PostgreSQL `HINT`; existing SQLSTATEs and messages are preserved.
- **D2:** future birth dates are prevented in both browser and server, using the Casablanca civil date. Today remains valid; no minimum-age rule.
  - **B2 owner amendment (A2-r2):** this applies to **enrollment initiation only** (`crm_start_enrollment`).
  - Manual lead creation in the guarded `crm_security.command` keeps its database `current_date` check, so there is no universal CRM-wide birth-date rule. This divergence is accepted for A2, and harmonization is a separate future decision.
  - The Production `TimeZone` check belongs to future release verification.
- **D3:** a prospect already linked to a learner preselects that learner. Alternative and new-learner choices are hidden; no receptionist override in A2.
- **D4:** default-first enrollment follow-up presentation. Existing scheduling semantics are preserved; no reminder presets.
- **D5:** single contextual action rules. **Continuer l’inscription** goes to the learner file's **Inscriptions et groupes** section.
  - A2-r2 clarification: the CRM-linked enrollment there is highlighted and focused, and return to the CRM is preserved.
  - No payment, confirmation or safeguard change is implied.
  - The page's **Nouvelle pré-inscription** button is unchanged; its duplicate risk is a known limitation, and no D8 is approved.
- **D6:** broader generic callback/WhatsApp follow-up consolidation is excluded from RCC-A2 and remains a separate future outcome. It is tracked in the [RCC-r1 deferred reliability backlog](../architecture/plans/completed/rcc-r1-receptionist-crm-completion.md#deferred-crm-reliability-backlog), alongside the pre-existing browser time-zone limitation of `casablancaInstant`.
- **Success wording amendment (2026-10-07):** an existing enrollment linked by the request shows **Inscription rattachée**. Creation headings appear only for an enrollment the request created; **Inscription déjà rattachée** is used for a discovered result.
- **D7:** no Production forensic read is authorized now.

## RCC-B1 — responsive Opportunities presentation — APPROVED / RELEASED

**Release (2026-10-08):** the owner approved merge of PR #115 at the exact reviewed head `73b3826395b4af184e4d724bdfbb705c097230a1` and the resulting automatic Production deployment, with bounded read-only verification. It excluded migrations, Production data mutation, synthetic Production CRM records, Meta/lifecycle activation, provider changes, new features, D6, timezone hardening and the Director learner-link correction. PR #115 merged as `b278d4ca348447a9a20aefeb6d8c3fafab13a312`; Production is verified with bounded acceptance (no authenticated real-staff walkthrough by the release session). The text below is the approval chronology.

Plan: [RCC-B1](../architecture/plans/completed/rcc-b1-responsive-opportunities.md#owner-approval-record), revision **B1-r1**. On **2026-10-07** the owner approved the architecture as recommended and marked it **OWNER APPROVED FOR IMPLEMENTATION**.

- The independent review of `225d17d…` returned CHANGES REQUIRED, and revision B1-r2 incorporated its corrections.
- The re-review of `9068324…` returned CHANGES REQUIRED for R1 and R2 only. Revision **B1-r3** incorporates both. D1–D8 are unchanged, and the approval carries forward to B1-r3.
- Implementation was then authorized (2026-10-07) after the exact-SHA re-review and architecture merge; merge and release were authorized separately on 2026-10-08, as above.

- **D1 — A:** merge the inquiry information into one **Demande** section.
- **D2 — C:** show the `tel:` **Appeler** link only below 640px with a coarse pointer. The visible phone number, the copy action and **Enregistrer un appel** remain available everywhere.
- **D3 — A:** show the latest three real exchanges by default, with **Afficher tout l’historique** for the complete history using the existing paging.
- **D4 — A:** no sidebar change. Any compact or icon sidebar is a separate UI Foundation outcome.
- **D5 — B:** a stage-navigated list is the default phone Opportunities view.
- **D6 — B:** a full-width, full-height phone sheet with sticky header and close behavior; browser Back closes it.
- **D7 — B:** the stage-list default applies below 1024px, including the tablet band.
- **D8 — A:** the desktop drawer stays modal.
- **R1 — option (a), 2026-10-07 (B1-r3):** no Radix tooltip on the drawer's Autres actions control; it keeps its visible label, as today.
- **Restated constraints:**
  - Tier 2, presentation-focused.
  - No database, migration, server/API authority, lifecycle, permission, Meta, finance, enrollment-logic or global sidebar change.
  - The Escape/menu fix must use page-local handling without dependency changes.
  - Any dependency change, server behavior change, enrollment or business-logic change, or cross-platform sidebar change is a Tier-3 escalation and stop condition.
  - Acceptance covers both sides of the 768px and 1024px edges plus the 390/768/1024/1280/1440 widths.

## Premium retirement — decisions (2026-10-08) and Release A approvals

Plan: [Premium retirement](../architecture/plans/premium-retirement.md) (revision PR-r4, **APPROVED FOR RELEASE A IMPLEMENTATION** on 2026-10-08; Release A merged, deployed and Production verified on 2026-10-08/09 UTC, see the [release record](../architecture/evidence/premium-retirement-release-a-production-2026-10-09.md); Release B planned, not approved). Premium is a cancelled product. The owner (Maroine) decided on **2026-10-08**, recorded verbatim:

1. **Formule:** stop showing "Formule" everywhere (receipt form, receipt list, print page, PDF, finance export, student form, list and detail, reports). "Standard" is not shown either: all Yearly students are the same.
2. **Old receipts:** take the easier route code-wise. Historical receipts are not specially preserved as Premium; do not build compatibility rendering for them.
3. **Existing Premium students:** move to Standard. There is no Formule concept afterwards.
4. **Workshop module:** remove entirely, including weekend workshops, Premium groups/memberships/attendance and homework.

Owner instruction on the PR #118 review (plan revision PR-r2, carried into later revisions): new receipts get a description built from session type and school year (so instalments on pre-113 charges never carry the plan word), **and** a separately approved, counted, rehearsed data step removes the plan word from open, non-voided Yearly charge text (issued receipts untouched). Both are part of the proposed design.

Owner answers to the plan's questions, recorded **2026-10-08** (approver Maroine, against plan revision PR-r4):

- **Q1:** leave issued Yearly receipts and settled or voided non-legacy Yearly charges untouched (no display-time handling, no text rewrite).
- **Q7:** Option A, keep accepting the old request fingerprint so a lost-response retry returns the original receipt.
- **Q2 to Q6:** option A, the recommended option, each (Q2 keep `plan_type` columns inert; Q3 two-phase removal; Q4 separately approved student data script; Q5 remove report sections with no replacement; Q6 delete `premium_homework` notification rows in Release B).
- **Part B amendment (2026-10-08, after the second independent review of PR #125):** a non-legacy Yearly charge with no school year keeps copying its own description onto new receipts exactly as 112 did, instead of building `Yearly`. Dated non-legacy Yearly charges keep the built `Yearly · <year>` text; legacy and non-Yearly charges keep copying. **Consequence acknowledged by Maroine (2026-10-08, after the re-review of PR #125):** a new receipt on an open undated non-legacy Yearly charge copies the charge's own text, so it may show "Standard" or "Premium" until the open-charge cleanup (A4) runs, and permanently where the free text falls outside D5a's pattern ` · (Standard|Premium)( · |$)`. A4 is to run soon after A1, and the R0 count of open undated charges with a plan word decides whether anything more is needed.

**Plan approval (Maroine, 2026-10-08): APPROVED FOR RELEASE A IMPLEMENTATION**, revision PR-r4 at exact head `531cf30cf4e4b121a720b019c684ec044a5decc0`, following the independent reviewer's READY FOR FINAL REVIEW on that head. Answers as above, plus Part A and Part B as written in the plan. The owner acknowledges that future workshops, pending homework, attendance history and homework files are permanently deleted in Release B after a full export; **export retention: until the 2026/2027 school-year closure, kept private, access limited to Maroine.** **This approves Release A implementation only. Release B, the open-charge description data step (D5a), the Premium student data step, every Production count or read, and any deployment each still need the owner's separate explicit approval.** Nothing is implemented, merged or deployed. (Accurate at approval time; Release A has since been released, see below.)

**Release A release decisions (Maroine; dates owner-supplied; owner local time UTC+8 (Asia/Shanghai); steps ran 2026-10-08/09 UTC):**

- **R0:** read-only Production pre-checks, authorized in the release session before the 2026-10-08 UTC reads; the authorization carried no date. Completed.
- **R1 (2026-10-09):** read-only pre-A1 checks and baseline, with the backup, probe and order decisions below. Completed.
- **Backup — accepted risk:** Release A proceeds **without a full backup** (no PITR or backup was available). Rollback for 113 is a forward migration restoring the 096 body; rollback for the open-charge cleanup is its own export. **Release B must not proceed without a backup.** Release B must not be planned on the assumption that no backup is needed or exists; a backup is a hard prerequisite.
- **Probe policy:** Production probes are zero-payment Yearly commitments only, rolled back, plus role-denial checks. No receipt-producing probes, because they consume receipt numbers. Receipt-text proof stays with the CI 112→113 rehearsal.
- **Order:** migration 113 first (A1), then the guarded merge and Vercel deployment (A2) within minutes, then the `sendReceiptEmail` redeploy with `--no-verify-jwt` (A3); the open-charge cleanup (A4) separately approved.
- **A1, A2, A3 and A4:** each approved separately on 2026-10-09 with its exact scope (wrapper hash, merge guard, clean worktree deploy, export and single write).
- **A4 path:** run the open-charge cleanup through the same CLI path as A1 (a wrapper transaction, the script executed unchanged except its single psql-only line), instead of setting up a database credential for psql; the owner accepted that the script's notices would not be returned and that success is judged by a read-only state query.
- **Export retention:** the A4 export is held in a private folder on the owner's computer, retained until the 2026/2027 school-year closure, access limited to the owner.

Outcome and evidence: [Release A release record](../architecture/evidence/premium-retirement-release-a-production-2026-10-09.md).

## Performance plan P-r1 — APPROVED (2026-10-08)

Plan: [performance plan](../architecture/plans/performance-r1.md), revision P-r1. The plan records the approval date and scope but no exact approved head SHA. On **2026-10-08** the owner approved:

- **P0** measurement (baseline harness, bundle report and budget, Speed Insights with its privacy filter);
- **PA** lighter first load and **PB** no redundant reads, one PR each;
- the **`dub1`** Vercel Functions region change, as a separate Tier-3 configuration PR.

The owner also decided: **Speed Insights** for real-user monitoring, with Sentry remaining errors-only; **no Supabase compute upgrade**; CRM polling **stays at 60 s**, visible tab only; **`getClaims()` in middleware is deferred**. For the session-context and RLS role-evaluation migrations, the approval covers architecture documents only and the work stops for owner review; before the session-context migration the owner requires proof that its pending-role rule is identical to the current `apply_pending_role` for every role and that its failure states never fail open. Enabling Speed Insights in the Vercel project and the region change remain Production configuration actions with their own release approval.

**OPEN — deterministic SQLSTATE `40001` retry loop (not decided; not blocking for the performance plan).** About 40 functions raise `40001` for stale-version or conflict conditions; reached through PostgREST, such a request retries in-process, which caused the historical 391M-call loop. Option A: a separate Tier-3 outcome moving deterministic conflicts to a non-retryable SQLSTATE while preserving the browser contract for uncertain failures. Option B: accept the risk. **Recommendation recorded in the plan: A.** See [Owner decisions required](../architecture/plans/performance-r1.md#owner-decisions-required).

## DGI-A backfill — APPROVED: no backfill (2026-10-10)

Plan: [DGI-A-r2](../architecture/plans/director-growth-intelligence.md) (release step R7, plan decision 2). Decided by the owner (Maroine) on **2026-10-10**:

- **No June backfill was run.** The default 28-day rolling window is sufficient.
- Ad spend from before CRM lead tracking began (June 2026) stays in Google Sheets and is not imported.
- Plan decision 2 (backfill start date) is closed without a date. Any future backfill is a new owner decision.

Evidence: [DGI-A closeout](CURRENT_STATE.md#dgi-a-live-meta-insights-sync-production-closeout--2026-10-10).

## DGI-A Meta access cleanup — APPROVED: leave in place (2026-10-10)

Plan: [DGI-A-r2](../architecture/plans/director-growth-intelligence.md). Decided by the owner (Maroine) on **2026-10-10**:

- The Insights System User's leftover **“View insights and Test app”** access on the app **EH Lifecycle R4 C2** is intentionally left in place. No cleanup is scheduled.

**OPEN — System User token expiry (not verified).** The Insights System User token is believed to be non-expiring, but this was not verified. Check the token's expiry in Meta Business Settings **before early December 2026**. If it is a default 60-day token, it would expire about **2026-12-09**, and the live sync would then fail with a provider-auth error. Rotation steps are in the [DGI-A closeout](CURRENT_STATE.md#dgi-a-live-meta-insights-sync-production-closeout--2026-10-10).

## Deferred backlog after RCC-r1

Preserved, none approved or scheduled. Each needs its own architecture and owner approval.

- **D6** — universal ordinary communication follow-up consolidation across every task-creation path.
- Browser Casablanca timezone reliability (`casablancaInstant` uses browser tz data).
- Director correction tool for wrongly linked learners.
- Nouvelle pré-inscription duplicate-risk behavior (no D8).
- Possible sidebar icon-rail / intermediate sidebar, as a future UI Foundation outcome.

## Other roadmap decisions

**Next major product outcome (owner roadmap, 2026-10-08): Director CRM & Growth Intelligence.** H3/H4 are not activated and are not moved ahead of this roadmap unless separately authorized.

| Item | State | Note |
| --- | --- | --- |
| Outcome 5 / online learning | **PARKED UNTIL NEXT MONTH** | Still MISSING ARCHITECTURE per [ARCHITECTURE](ARCHITECTURE.md#architecture-gaps). |
| H3/H4 Meta lifecycle work | Separate; **not activated; not ahead of Director CRM & Growth Intelligence unless separately authorized** | Follows its own contracts and gates; see [CURRENT_STATE](CURRENT_STATE.md#next-meaningful-outcomes). |
