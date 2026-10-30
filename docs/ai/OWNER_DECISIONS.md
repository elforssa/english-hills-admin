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

**DECIDED (2026-10-24): option A — deterministic SQLSTATE `40001` retry loop.** About 40 functions raise `40001` for stale-version or conflict conditions; reached through PostgREST, such a request retries in-process, which caused the historical 391M-call loop. Option A: a separate Tier-3 outcome moving deterministic conflicts to a non-retryable SQLSTATE while preserving the browser contract for uncertain failures. Option B: accept the risk. **Recommendation recorded in the plan: A.** See [Owner decisions required](../architecture/plans/performance-r1.md#owner-decisions-required). **Owner answer (2026-10-24 15:53 UTC+08:00, chat with Claude relayed by the coordinating session): option A**, through the [conflicts-without-retry-loops plan](../architecture/plans/conflicts-without-retry-loops.md#approval-record), revision NRC-r1 approved at head `7c98b35` with D1–D6 all A (`PT409` for every deliberate conflict, including busy locks, deadlocks and unique violations; online helpers and Premium functions included; soft duplicate-person check deferred; app first, then the migration). Decision closed. **Status (2026-10-24): implemented (PR #158) and released** — app first, then migration 119 applied to Production at 16:11 UTC under the owner's "apply 119" approval (2026-10-25 00:03 Asia/Shanghai), which covered R2–R3 only; the optional bounded probe and any PostgREST restart or upgrade remain unapproved ([release record](../architecture/evidence/conflicts-without-retry-production-2026-10-24.md)). D5 (soft duplicate-person check) stays deferred to Batch G.

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

## DGI-B — decisions 1–8 (2026-10-10) and receptionist CRM access (2026-10-12)

Plan: [DGI-B-r1](../architecture/plans/director-growth-intelligence-b.md), [approval record](../architecture/plans/director-growth-intelligence-b.md#approval-record). Decided by the owner (Maroine) on **2026-10-10**, all as recommended:

1. **Contacté** = any outreach evidence (`contact_attempted`, `conversation_recorded`, `whatsapp_sent`, `whatsapp_conversation`); `reached` shown as a secondary number.
2. **CAC denominator** = trusted converted; `converted_paid` shown beside it.
3. **Program dimension** = `session_type`, with the one-form-one-program caveat.
4. **No historical resolution:** old leads, including the 2026-09-28 to 2026-10-09 Yearly Leads cohort, stay "attribution inconnue".
5. **No blended CPL.**
6. **No token tests:** the in-database resolver only.
7. **Release split:** B1 then B2, two PRs and two migrations.
8. **Wording** of the pending label and suppression line left to implementation.

Implementation approvals: B1 on 2026-10-10, B2 on 2026-10-12 (recorded in the plan). Release evidence: [DGI-B closeout](CURRENT_STATE.md#dgi-b-production-closeout--2026-10-12).

**Owner statement (2026-10-12):** the receptionist has **not yet been given CRM access**. Until contacts are logged in the CRM, the funnel's Contactés stage and any follow-up measure read zero.

## Website inquiry rate limiter keyed on the visitor — APPROVED

Plan: [website-rate-limit-visitor-key](../architecture/plans/website-rate-limit-visitor-key.md#approval-record). Approved by the owner on **2026-10-13** ("approve rate-limit plan with changes"), Tier 3, after an independent review verdict of READY WITH CHANGES whose changes are binding.

- **Option E APPROVED:** the website proxy signs the visitor IP in `x-eh-visitor-token`; the CRM verifies it and otherwise falls back to today's key. No migration.
- **Option D PARKED:** a site-wide ceiling with per-visitor buckets (needs a migration and limit numbers).
- **Sentry warning on 429: yes** (warning level, tags `site`/`form`/`visitor` only). Runtime warn lines fire on every 429 and on every present-but-rejected visitor header (`unconfigured`/`invalid`/`stale`), carrying only site, form and reason. Owner to confirm Sentry spike protection (accepted residual risk).
- **WhatsApp CTA on the website's rate-limit message: yes**, through the existing `/contact-camp` redirect (website repository change).
- **Pre-fix probe: yes**, run under the amended probe procedure with separate operator authorization.
- **One shared secret** (`CRM_WEBSITE_PROXY_SECRET`) now; **rotation** support (`_PREVIOUS` fallback) is a later decision.

Release secret handling for both Vercel projects: set `CRM_WEBSITE_PROXY_SECRET` for Production only, uncheck Preview and Development, then redeploy. Merge, secret configuration, website change, deployment and Production probes each still need their separate approvals.

**Released 2026-10-13** (admin PR #136, website elforssa/eh-website#10). The owner accepted the Production check wording “A equals C observed in Production. A second distinct network was not available.” Evidence: [closeout](CURRENT_STATE.md#website-limiter-visitor-key-and-parent-form-mapping-production-closeout--2026-10-13). Option D, secret rotation, IPv6 /64 keying and WhatsApp redirect source tagging remain unapproved follow-ups.

## Parent website form: learner optional — LIVE (2026-10-13)

The website parent form `campaign_parent_lead_v1` does not ask for a learner name, so the lead's name is the parent. Mapping version 2 (id `c2ce1875-3d99-45af-a86b-8663160a5cb6`) was published with `learner_policy = 'optional'`, effective 2026-10-13 13:53:18 UTC. Parent v1 and the adult form's v1 mapping are unchanged. This is a mapping data version, not a migration. Evidence: [closeout](CURRENT_STATE.md#website-limiter-visitor-key-and-parent-form-mapping-production-closeout--2026-10-13).

## Staff help guide — APPROVED (2026-10-14)

Owner decisions on the in-platform reception guide at `/helpdesk` ([closeout](CURRENT_STATE.md#staff-help-guide-production-closeout--2026-10-14)); implemented and deployed per CURRENT_STATE, which owns that evidence.

- **Format:** an in-platform page, French, written for the receptionist (“vous”), scenario-first with a short screen-by-screen reference and screenshots on key screens only. It replaces the earlier shareable page and a PDF (about 40 pages was judged too long).
- **Audience:** director and admin, as well as the receptionist, see the **Aide** menu entry and can open the page. Teacher, parent, student and unknown roles cannot.
- **Screenshots:** the 19 screenshots under `public/helpdesk` may remain public static files; they must contain synthetic data only. Serving them behind login is an optional follow-up.
- **Whole platform (2026-10-16):** the guide covers the whole reception portal, not only the CRM, in two clearly separated parts: Prospects (CRM) and Au quotidien (apprenants, paiements, groupes, présences, enseignants), plus a shared scenario for mistakes ([closeout](CURRENT_STATE.md#staff-help-guide-whole-platform-closeout--2026-10-16)).
- **Prices and conventions (2026-10-16):** the owner chose **not** to state prices or conventions (for example the usual annual fee) in the guide for now.
- **Not stated by the owner:** calling hours and who to contact (the guide says “la direction”), and a separate restatement of the risk tier (the reviewer's Tier 3-by-category classification stood; the owner approved the merge after the independent re-review).

## Online learning — UNPARKED FOR ARCHITECTURE (2026-10-17)

On **2026-10-17** the owner (Maroine) unparked Outcome 5, online learning, **for architecture only**. It had been PARKED UNTIL NEXT MONTH under the 2026-10-08 roadmap decision below. Plan: [online learning](../architecture/plans/online-learning.md) (Tier 3; **approved for implementation planning on 2026-10-18**, revision OL-r4 at head `4545cc8…`; see the approval below).

- The commission is an architecture document written from the owner's brief `claude/online-learning-brief.md` held in the claude.ai Project “Language center”. Every repository fact in the brief is checked against a freshly fetched `origin/main`; conflicts are flagged in the plan, never resolved silently.
- **Not approved by this decision:** implementation, any migration, any video or meeting provider account, credential or secret, any Production read, configuration or data change, and any portal exposure to parents or students. Each needs the owner's separate explicit approval after the plan is reviewed.
- **No migration number is reserved.** The plan records the Production ledger (001–116) and the parked provisional numbers (architecture PRs #121 and #124, Premium retirement Release B) and leaves the real number to the implementation task.
- This decision changes no other roadmap item: Director CRM & Growth Intelligence remains the current major outcome, and H3/H4 remain not activated.
- Next gate: independent review of the architecture PR, then the owner's approval of an exact plan revision, before any implementation task is opened.
- **Q2 — CRM path: option C (2026-10-17).** CRM leads are enrolled into online groups through reception and the CRM exactly as today. No change to CRM functions, constraints or Meta mappings in the pilot. Leads keep the existing programme list, and the programme view attributes online enrolments to the lead's own programme. **Flagged by the architecture task (OL-r2):** `crm_start_enrollment` (migration 112) refuses any programme outside its hard-coded list before it looks at the group, and only the enrolment it links converts the lead, so the CRM path reaches an online group only if that one array gains the two online values. The plan asks the owner to confirm C with that single function change (C1) or to choose C without it (C2: online enrolment from the learner file only, no lead conversion); see [plan Q2](../architecture/plans/online-learning.md#owner-decisions-required).
- **Q2 confirmed as C1 (2026-10-18):** the owner chose the option that extends only the hard-coded programme array in `crm_start_enrollment` (re-created from the migration-112 body, line 51) with `Online` and `Online One-to-One`. No other CRM function, constraint, lead field, Meta mapping or funnel change. The plan records that the review's “zero CRM change” reading of option C was incorrect and why, adds a test that a CRM lead can be enrolled into an online group, and a check that the re-created function is otherwise unchanged from 112.
- **APPROVAL (2026-10-18), verbatim:**

> Owner approval (Maroine, 2026-10-18): I APPROVE plan revision OL-r4 of docs/architecture/plans/online-learning.md at exact head 4545cc82aa4d6dc0358b103bc9512ee09867e399, following the independent re-review verdict READY FOR FINAL REVIEW on that head. Answers: Q1 A, Q2 C1 (as recorded), Q3 A, Q4 A, Q5 A, Q6 A, Q7 A, Q8 A, Q9 A, Q10 A, Q11 A, Q12 decided later by provider test T-P1–T-P7 (implementation starts against the fake adapter), Q13 A, Q14 A, Q15 A, Q16 A (as recorded). Record this verbatim in the plan’s Approval record and in OWNER_DECISIONS, and set the plan and ADR-008 status to approved for implementation planning. This approves the architecture only. It does not authorize implementation, a migration number, a provider account, the merge of PR #144, or any Production step; each needs my separate approval. Docs-only commit to the same branch: commit, push, confirm CI is scheduled, hand off with the new head SHA. Do not merge.

- **Review status:** OL-r1 (head `c403c82…`) received CHANGES REQUIRED from the independent review on 2026-10-17; OL-r2 applied the findings; OL-r3 recorded the C1 confirmation; its re-review (head `e6c06af…`) returned CHANGES REQUIRED with one blocking and three important findings (the migration-096 reception commands, the public form, missing tests, the student-form placement path); OL-r4 applies them and awaits fresh re-review. Two further owner choices, Q15 and Q16, are decided below.
- **Implementation authorized (2026-10-18):** the owner authorized implementation of the plan's IMPLEMENTATION CONTRACT on a new feature branch, against the fake provider adapter only, with local Supabase, synthetic data and external e-mail disabled; the task claims the next free migration number (117) and corrects the Q12 text to T-P1–T-P7. **Not authorized:** a real provider adapter or account, any secret, any Production read or write, migration deployment, merge, release, or setting `ONLINE_LEARNING_LIVE_ENABLED`. Evidence and scope: [implementation record](../architecture/plans/online-learning.md#implementation-record).
- **B3 and I5 decided (2026-10-18), owner's words as relayed by the reviewer session:** “B3: include reception's learner-file path in the pilot. Re-create operational_security.valid_session_level and save_receptionist_enrollment from their migration-096 bodies, with only Online and Online One-to-One added to the hard-coded programme lists. Apply the same one-line unchanged-from-096 proofs as C1, plus receptionist SQL tests (create an online group, set a learner's programme to online, enrol from the learner file). I5: the public registration page and /api/public/inscription must not offer or accept the online types. Use a public programme subset that excludes them, with a test that the API refuses them. Also resolve I6 (the three missing tests) and I7 (correct the D4 sentence about the 074 placement sync). Docs only.” Recorded in the plan as **Q16 = A** and **Q15 = A** ([plan Q15–Q16](../architecture/plans/online-learning.md#owner-decisions-required)); the alternatives (leave 096 untouched; public form offers the online types) are closed. Still not approved by this decision: the plan revision itself, implementation, any migration, provider or Production step.
- **Release R0–R2 approved (2026-10-20):** release of PR #145 at exact head `0f6a35f3…`, steps R0–R2 only, migration first as the plan states, each of R1 and R2 stopping for explicit approval. R2 deploys with `ONLINE_LEARNING_LIVE_ENABLED` **and** `ONLINE_VIDEO_PROVIDER` unset: the provider variable stays unset until the provider is chosen (Q12), and unset fails closed. **Not authorized:** any provider account or secret, setting either variable, turning on the live switch, creating courses, Production data writes beyond the migration, R3 and later.
- **Accepted risk: R1 without a backup (2026-10-21), verbatim:**

> Supabase backups are not available on my plan, and a manual dump is not practical from my network. I accept proceeding with R1 without a backup, as for Premium Release A, because 117 is additive and transactional. Record this as an accepted risk. Premium Release B still requires a real backup.

  `supabase backups list` reported PITR off and no backup. This acceptance covers migration 117 only; **Premium retirement Release B still requires a real backup** (unchanged from the [Release A decision](#premium-retirement--decisions-2026-10-08-and-release-a-approvals)).
- **R1 and R2 approved and completed (2026-10-21):** migration 117 applied after a Production dry run; PR #145 squash-merged as `63e0cf9…` and deployed with the switch off. Evidence: [R0–R2 release record](../architecture/evidence/online-learning-r0-r2-production-2026-10-21.md). R3–R8 each need a new approval.
- **Q12 revised — provider chosen (2026-10-22):** the owner chose **Zoom Video SDK** as the pilot's video provider. Q12 changes from “decided by the provider test T-P1–T-P7” to: **the owner chose Zoom; T-P5 (ten phones on Moroccan 4G plus one desktop, 30 minutes) is an acceptance check on Zoom; Daily is the fallback.** T-P1–T-P4 and T-P7 are automated against Zoom with developer credentials the owner sets in `.env.local` (values never pasted or committed). Recorded in the plan ([Q12](../architecture/plans/online-learning.md#owner-decisions-required)). **This decision authorizes neither a Zoom account, a secret, a Vercel variable, the live switch, merge nor release.**
- **OL-r5 adapter addendum proposed (2026-10-22; approved as OL-r6 below):** the design check of Zoom Video SDK against the approved adapter design found six points that change approved text, a security boundary or a configuration contract, so the implementation task stopped before any code, as the owner instructed: **A1** Zoom's 30-minute token lifetime floor versus “the provider token expires at lesson end”; **A2** a Zoom session name per lesson (recommended) versus one per course; **A3** the webhook endpoint-validation challenge; **A4** a two-variable SDK credential (`ONLINE_VIDEO_PROVIDER_API_KEY` + new `ONLINE_VIDEO_PROVIDER_API_SECRET`); **A5** the UI Toolkit's React 18 peer requirement against this project's React 19 (an `overrides` entry, or the core SDK instead); **A6** `Permissions-Policy` and CSP changes scoped to `/online/room/*`, with no COOP/COEP in the pilot. Each is stated with options in the plan's [provider adapter addendum](../architecture/plans/online-learning.md#provider-adapter-addendum--zoom-video-sdk-ol-r5-proposed); the real adapter (Step 2: `zoom-video` adapter, room page on the UI Toolkit, review fixes N1 and N2, the cross-role denial suite, automated T-P1–T-P4 and T-P7) waits for independent review of the addendum and the owner's answers.
- **OL-r6 applied (2026-10-22):** the independent review of the OL-r5 head `c1c1f619…` returned CHANGES REQUIRED (B1, B2, I1–I6); the same branch applies them as OL-r6 (docs only): full-document navigation and header tests for the room path (B1), a signature- and timestamp-checked webhook validation challenge (B2), A2 as the condition of A1 (I1), a bounded lowercase session name (I2), this summary table corrected (I3), unverified statements marked (I4), the toolkit's telemetry host assessed as new decision **A7** (I5), and the self-rename account setting as an R3 setup item re-checked at R5 and R7 (I6). **Owner's intended answers, stated 2026-10-22 as intent pending the re-review, not as approval:** A1 accept with A2 as its condition; A2 yes; A3 yes as revised; A4 yes; A5 overrides with the UI Toolkit, re-running the audit on the real lockfile at implementation; A6 yes as revised, no COOP/COEP; A7 open. The approval follows the re-review of the OL-r6 head.
- **OL-r6 APPROVED (2026-10-22):** the independent re-review of head `4dbdd526…` returned READY FOR FINAL REVIEW with three non-blocking notes; the owner approved, verbatim:

> Owner approval (Maroine, 2026-10-22): I APPROVE plan revision OL-r6 of `docs/architecture/plans/online-learning.md` at exact head `4dbdd5267411ca52f0dc94c6b5a3fcecaf3824dd`, following the independent re-review verdict READY FOR FINAL REVIEW on that head. Answers:
>
> * A1: accept, with A2 as its condition.
> * A2: yes, one Zoom session per lesson.
> * A3: yes as revised (signature and timestamp verified before answering the challenge).
> * A4: yes (two server-only credential variables).
> * A5: yes, the `overrides` entry with the UI Toolkit; re-run both audit gates on the real lockfile at implementation.
> * A6: yes as revised, scoped to `/online/room/*` with full navigation in and out; no COOP/COEP.
> * A7: block (explicit Zoom hosts in the room CSP), with record-and-capture as the fallback if T-P5 shows calls break.
>
> Record this verbatim in the plan’s approval record and in OWNER_DECISIONS, and apply the re-review’s three non-blocking notes:
>
> * mark the Z5 “Contact Developer Support” sentence UNVERIFIED;
> * change ADR-008’s “OL-r5” to “OL-r6”;
> * state that the A7 capture records where the session-end detailed log goes and runs against a Morocco-routed session.
>
> This approves the architecture only. Merge, implementation release, Vercel variables and R3+ each need separate approval. Docs-only commit to the same branch: push, confirm CI is green, hand off with the new head SHA, and STOP. Do not start Step 2 until PR #147 is merged.

  Recorded in the plan's [approval record](../architecture/plans/online-learning.md#approval-record). **Still not authorized:** merge of PR #147, Step 2 implementation before that merge, release, any Vercel variable, a Zoom account or secret, R3 and later.
- **Release R0′–R2′ of PR #148 approved (2026-10-23):** release of the Zoom adapter at exact head `0ba2546e…` (base `2a05da3e…`) after the independent review returned READY FOR FINAL REVIEW on that head: R0′ read-only checks, R1′ migration 118 only, R2′ squash-merge with the live switch off, each step stopping for the owner's approval. **Not authorized:** any Vercel variable, Zoom keys, the live switch, courses, R3 and later. The owner's release decisions, verbatim:

> (1) I acknowledge the A7 switch to record-and-capture, triggered by the local evidence that Zoom’s regional hosts change per session, instead of by T-P5.
> (2) T-P4 stays an open S2 item. It does not block this merge, but it blocks R4 completion and R5 until either the Zoom setting is found and T-P4 passes, or I explicitly accept the gap.
> (3) Migration-first order. 118 is applied without a backup, the same accepted risk as 117: no backups on the plan, 118 is additive and transactional. Premium Release B still requires a real backup.

- **R1′ and R2′ approved and completed (2026-10-23):** migration 118 applied after a Production dry run, 11 of 11 read-only proofs; PR #148 squash-merged as `43be8fa0…` and deployed with the switch off. Evidence: [R0′–R2′ release record](../architecture/evidence/online-learning-r0p-r2p-production-2026-10-23.md). **Premium retirement Release B still requires a real backup.**
- **T-P4 accepted as a gap and T-P5 deferred (2026-10-23), verbatim:**

> Owner decisions (Maroine, 2026-10-23): (1) I accept the T-P4 gap: participants may be able to rename themselves in Zoom Video SDK sessions, because the Workplace rename setting does not reach SDK sessions. Compensations: the platform sends only the first-name-plus-initial label, attendance is written from the platform roster and never from Zoom names, and the host can rename or remove a participant. This closes T-P4 as an accepted gap for R5. (2) The T-P5 phone check is deferred. R4’s test lesson on real phones is the first quality check, and the first pilot week is monitored. If learners report call quality problems, the full phone check runs then, with Daily as the fallback.

  Decision (1) replaces release decision (2) above: T-P4 no longer blocks R4 completion or R5. Recorded in the plan's [R0′–R2′ release record](../architecture/plans/online-learning.md#release-record-r0r2-zoom-adapter). **Still not authorized:** the live switch, the webhook secret, courses, and R4 phases B–D and later (R3 is recorded below).
- **R3 done — owner action (2026-10-23):** `ONLINE_VIDEO_PROVIDER` was set by the owner's guide through the Vercel connector on the owner's instruction; `ONLINE_VIDEO_PROVIDER_API_KEY` and `ONLINE_VIDEO_PROVIDER_API_SECRET` were set by the owner. All three are Production only and Sensitive, and are recorded by name only. `ONLINE_LEARNING_LIVE_ENABLED` and `ONLINE_VIDEO_PROVIDER_WEBHOOK_SECRET` are not set. The Zoom account is on a trial (20 credits, ending in 365 days); the owner will set up pay-as-you-go before R5.
- **R4 preparation decisions (owner, 2026-10-23):** Phase A only approved (a Production redeploy with the live switch off, then READY and probe checks); D2 approved as proposed (test learners as lesson guests on `+r4` addresses, a test teacher, an adult course named «TEST R4 — ne pas utiliser», kept closed afterwards rather than deleted); D3: the Production SDK Key belongs to the same Zoom Video SDK app as the developer credentials, and the local mid-session expiry run is approved after Phase A (condition met: the run started at 15:04:50 UTC, after the Phase A probes at 15:04:20 UTC); D4: the owner's partner in Casablanca makes the Morocco-routed A7 capture; D5: the trial credits cover the test lesson. D1 (the switch-on window for the test lesson) is pending: the owner gives the date and Casablanca time before Phase B, and Phase C needs the owner's explicit approval at the time.
- **Production redeploy, R4 Phase A (2026-10-23):** on the owner's instruction, the guide triggered a Production redeploy of `43be8fa0…` at about 15:00 UTC (Vercel deployment `dpl_GdDJFv7npFHpPP1VikaFC2wUM4sN`, `source: redeploy`); the new build `ZWLNDoUqYvBLO1GXvPxZj` serves since 15:04:05 UTC, so the R3 variables are in effect, with the live switch still off. Results: [R0′–R2′ release record](../architecture/evidence/online-learning-r0p-r2p-production-2026-10-23.md#after-r2-r3-and-r4-phase-a-2026-10-23).

## Enrollment and group consistency (Batch D) — RELEASED (2026-10-26)

Plan: [enrollment and group consistency](../architecture/plans/enrollment-group-consistency.md#approval-record), revision EGC-r1 at head `50da715` (Tier 3). Owner approval 2026-10-24 15:53 (UTC+08:00), chat with Claude relayed by the coordinating session, verbatim: "all recomended and for E6 paper numbers dont exist".

- **D1 A:** one group per programme per school year; a learner can be in two groups of different programmes.
- **D2 B:** per-learner "Ancien apprenant" action plus a yearly director "Clôturer l'année scolaire"; management only; "Ancien apprenant" when completed, "Inactif" when stopped mid-way; neither counts as active.
- **D3 A:** only a confirmed, validated or trial enrollment makes a learner Inscrit. **D4 A:** hard capacity for reception, logged director/admin override. **D5 A:** a conversion stays valid when the learner leaves. **D7 A:** no level change while a group has learners.
- **D6:** the data clean-up is approved as described, with Ancien apprenant; counts are re-read on the day and any difference goes back to the owner.
- **Not approved by this decision:** the merge, either migration, the clean-up run (R4 needs its own release approval of the exact numbers) and every deployment.
- **D8 A (2026-10-24, 16:16 Asia/Shanghai; EGC-r2, added after independent review):** owner's words, verbatim: "d8: A". Closing an online course (`online_close_course`) ends the course's enrollments, so a learner can take another online course in the same school year; option B (exempting online programmes from the one-live-enrollment rule) is rejected. The review corrections also add one clean-up row (C1b: a Yearly enrollment without school year gets 2026/2027), shown to the owner with the D6 counts.
- **Implementation decisions (Maroine, 2026-10-25; [implementation record](../architecture/plans/enrollment-group-consistency.md#implementation-record)).** Channel: chat with Claude, relayed by the coordinating session; the owner pasted the coordinating session's answers verbatim. Decisions 1–3 (relayed about 10:30–11:11 Asia/Shanghai, UTC+08:00) answered the implementation PR's open points (owner's words, verbatim: "M1 contradiction: keep the test-strategy reading"; "Re-creating enforce_attendance_integrity in M2 is accepted, provided it is built on its latest definition and listed in the implementation record as a deviation with its reason"; "Non-blocking note 2 (online course rosters after close) stays out of this PR"). Decision 4 (about 11:40 Asia/Shanghai) answered the coordinating session's question during the independent review of PR #160; decision 5 (about 14:15 Asia/Shanghai) was accepted by the owner pasting the coordinating session's re-review prompt that contained it, without objection; there are no separate owner words.
  1. Main group before M2: the test-strategy reading is kept. A learner in a Yearly group without a Yearly enrollment stays in the Yearly group (main group and roster) after joining a Mise à niveau group; D-3's narrower transition rule is not applied until M2.
  2. Re-creating `enforce_attendance_integrity` (latest 096 body) in M2 is accepted as a listed deviation; the independent reviewer checks it.
  3. Implementation note 2 (past online rosters after a course close reading `ended_group_id`) stays out of this PR as a follow-up.
  4. Reception **may** move a learner with a confirmed placement to a group of another level in the same programme; the move updates the enrollment's level (owner's words, verbatim: "reception MAY move a learner with a confirmed placement to a group of another level in the same programme, which updates the enrollment's level"). Deviation 4 of the implementation record is kept.
  5. The school-year match on placement added after the first review is **dropped** from this PR; a year check returns later together with an editable group year and a Production dry-run of group years (owner decision accepting the coordinating session's recommendation).
- **Release R1–R3 — APPROVED and DONE (2026-10-25).** Owner's words, verbatim, 19:22 Asia/Shanghai, relayed by the coordinating session: "approve D release now" (R1 + R2 + R3 only). The dashboard listed no backup, so the owner approved a manual logical backup to the owner's computer before R2; it was taken 11:35–11:43 UTC. Migration 120 applied 11:45:44 UTC and PR #160 merged as `be701da…` and deployed 11:47:16 UTC ([release evidence](../architecture/evidence/egc-r2-m1-production-2026-10-25.md)). R4–R6 followed under their own approvals (below).
- **Release R4–R5 — APPROVED and DONE (2026-10-26).** Channel: chat, relayed by the coordinating session. 13:11 Asia/Shanghai: prepare R4, read-only dry run only. 13:33 Asia/Shanghai, owner's words verbatim: "approve cleanup: C1 43 (12 links), C1b 1, C2 7, C3 98, C4 2, C5 10 then M2 if C6 matches". A fresh manual backup preceded the step. All stages ran with the approved counts 05:36–05:38 UTC, C6 matched (Enrolled + Trial 112, "Groupe à affecter" 28), and migration 121 was applied 05:42:45 UTC ([release evidence](../architecture/evidence/egc-r2-r4-r5-production-2026-10-26.md)). R6 followed (below).
- **Release R6 — APPROVED and DONE (2026-10-26).** Owner's words, verbatim, 14:32 Asia/Shanghai, relayed by the coordinating session: "approve R6" (docs-only closeout). Batch D is **done**: membership derives from enrollments in every reader, and since the clean-up no learner falls under the temporary pre-M2 exception of implementation decision 1.
- **Open follow-ups (each a separate outcome needing its own approval):**
  1. Make the group school year editable, then restore a placement year check (decision 5) and default an enrollment's year from the chosen group. *(Batch H, H5: released 2026-10-30, migration 125.)*
  2. Keep past rosters when an online course closes (plan implementation note 2) and refuse placement into a closed online course (review DB-N3).
  3. The Students list shows « Groupe à affecter » in the Groupe column for « Ancien apprenant » rows; show « — » instead. *(Batch H, H4: released 2026-10-30.)*
  4. Simplify the application's `groupMemberIds` to enrollment-only (allowed by D-8 after C6). *(Batch H, H8: released 2026-10-30.)*
  5. No teacher is assigned to any group yet; assigning them is required before teacher invitations (Batch F).

## Payment corrections and receipts (Batch E) — APPROVED (2026-10-24)

Plan: [payment corrections and receipts](../architecture/plans/payment-corrections-receipts.md#approval-record), revision PCR-r1 at head `a6cce4e` (Tier 3). Owner approval 2026-10-24 15:53 (UTC+08:00), chat with Claude relayed by the coordinating session, verbatim: "all recomended and for E6 paper numbers dont exist".

- **Q1 B:** a cancelled payment that leaves a confirmed enrollment unpaid flags the CRM conversion at once; the flag clears automatically only when a replacement payment is recorded on the same enrollment.
- **Q2 A:** a discount needs a reason from a short list. **Q3 B:** reception may discount at most 10% without the director.
- **Q4 A:** payment date never in the future; reception up to 7 days back, admin and director up to 31.
- **Q5 B with 10%:** a reception payment confirms an enrollment only from 10% of the net price.
- **Q6 B:** paper receipt numbers do not exist; the 54 receipts imported on 2026-09-13 get a separate historical series `EH-HIST-2026-0001` to `0054`, in payment-date order.
- **Q7 A:** year of issue (Casablanca), one continuous counter. **Q8 A:** logged correction of the 17 legacy agreements.
- **Q9:** payslip creation is switched off now (E-1); the accountant's validation is mandatory and the system refuses payslips until it is recorded.
- **Revision PCR-r2 (2026-10-24):** the independent review's corrections, within these answers (no answer changes; [details](../architecture/plans/payment-corrections-receipts.md#review-corrections-pcr-r2)). Coordinator decision recorded there: Plan E governs the order of the payment checks, which are not reordered; Plan D defers to it. Q1's automatic clear applies only when every review since the last clear came from a payment cancellation. The independent re-review of plan head `e9bf9cb` returned READY FOR FINAL REVIEW before the plan merged (`1ee994e`).
- **Not approved by this decision:** any merge, migration, deployment or data step; E-1, E-2, E-3 and D1–D3 each need their own approval.
- **E-2 released (2026-10-27).** Owner's words, verbatim, 12:43 Asia/Shanghai, relayed by the coordinating session: "approve E-2 release now" (R0–R4 only). At 12:52 the owner accepted the R0 difference: "the plan's 424 figure was stale; 20 consecutive receipts (424–443) were issued since. The correct seed is 443 (next receipt EH-2026-00444)." Migration 122 applied 04:57:05 UTC, PR #164 merged as `e840f6a…` and deployed 04:58:26 UTC ([release evidence](../architecture/evidence/batch-e2-production-2026-10-27.md)). **Pending, each needing its own approval:** D1 (historical numbers), D2 (backfill review), D3 (legacy rounding, Q8), the gap register (D4), E-3 (payroll, after the accountant's rates).
- **D1 and D3 run (2026-10-28); D2 not needed.** Owner's words, verbatim, 11:39 Asia/Shanghai: "approve D1: 54 (EH-HIST-2026-0001–0054, main counter stays 443) and approve D3: 16, hold the 25 MAD charge for manual review". D1 numbered the 54 historical receipts `EH-HIST-2026-0001`–`0054` (03:43 UTC; main counter still 443); D3 aligned 16 legacy charges (03:44 UTC). D2 found 0 targets (Batch D's C4 had ended them) and is recorded as not needed ([release evidence](../architecture/evidence/batch-e-d1-d3-production-2026-10-28.md)). **Open owner item:** one legacy charge paid 25 MAD above its gross price, held out of D3; the director checks its paper receipt and decides the correction by hand. **Still pending, each needing its own approval:** the gap register (D4), E-3 (payroll, after the accountant's rates).

## Portal readiness — teachers and families (Batch F) — PRF-r2 APPROVED FOR IMPLEMENTATION (2026-10-24)

Plan: [portal readiness](../architecture/plans/portal-readiness.md#approval-record), revision PRF-r1 at head `ba94ad3` (Tier 3). Owner approval 2026-10-24 15:53 (UTC+08:00), chat with Claude relayed by the coordinating session, verbatim: "all recomended and for E6 paper numbers dont exist".

- **Q1 A:** teachers see the class list only. **Q2 A:** teachers do not delete academic records; director/admin delete, all logged. **Q3 A:** explicit staff-approved family links. **Q4 A:** director and admin invite, link and revoke; reception read-only. **Q5 A:** centre relay, no address shown.
- **Q7 A:** staff remarks hidden from families. **Q8 A:** student accounts for Adults and Teens only. **Q9 A:** clear the placeholder address from the 33 files.
- **Q6 C (2026-10-24, 16:16 Asia/Shanghai):** owner's words, verbatim except `@` written `[at]` (the repository CI blocks literal e-mail addresses): "f6: contact[at]english-hills.com". A dedicated centre login with role admin on the shared office mailbox receives "Accueil English Hills" portal messages (D7).
- **Re-approval (PRF-r2):** the independent review of head `e90f8f1` returned CHANGES REQUIRED; revision PRF-r2 applied it and its re-review of head `7c231ed` returned READY FOR FINAL REVIEW. Owner re-approval 2026-10-24 16:36 (UTC+08:00), chat with Claude relayed by the coordinating session, verbatim: "approve F and merge 152 and 153". Approved: PRF-r2 at exact head `7c231ed`, answers Q1–Q9 unchanged. Implementation, migration, cleanup, deployment and every invitation each still need their own approval.
- **Online teacher identity inside F (2026-10-26, about 15:15 Asia/Shanghai):** during the independent review of PR #167 (head `975feb1`, finding S2), the coordinating session asked whether the online module's e-mail-based teacher identity (`online_security.caller_teacher_id()`) should be fixed in Batch F or left as a follow-up. Owner's words, verbatim, chat relayed by the coordinating session: "Fix it inside F". Meaning: the online helpers identify a teacher by the bound teacher record (`profiles.linked_teacher_id`, record not archived) and families by the explicit links, rebuilt on their latest definitions; the online module's behaviour is otherwise unchanged ([implementation record](../architecture/plans/portal-readiness.md#implementation-record)).
- **Not approved by this decision:** a migration number, the merge, the migration, the cleanup, the deployment, the pilot and any invitation; each needs its own approval.
- **R0–R2 released (2026-10-28).** Owner's words, verbatim, 2026-10-27 22:40 Asia/Shanghai: "approve F release now" (fresh backup, R0, R1 migration 123, R2 merge of PR #167 at `d3911c5…`, read-only checks only). The planned 21:00 UTC start was missed; at the owner's request it ran on 2026-10-28 from about 02:00 Casablanca. The backup could not be taken; owner's words, verbatim: "I accept the risk: proceed with the F release without a fresh backup, as the plan originally allowed (the migration changes no existing row)." Migration 123 applied 02:05:33 UTC, PR #167 merged as `e3020456…` and deployed 02:08:02 UTC ([release evidence](../architecture/evidence/batch-f-r0-r2-production-2026-10-28.md)).
- **Pending, each needing its own approval:** R3 clean-up C0–C2 and constraint validation, with the read-only dry-run counts of 2026-10-28 (re-read on the day): C2 33 learner and 7 parent addresses equal to the one placeholder (0 archived; the 28 issued receipts carrying it are not changed), C1 4 parent, 2 learner, 1 teacher, 0 message and 0 notification addresses, C0 38 before-image rows; R4 office login (Q6) and teacher assignment to groups; R5 pilot; R6 first invitations. The prepared corrective migration is not applied.

## Speed as the centre grows (Batch G) — SCG-r1 APPROVED (2026-10-28); R0–R3 RELEASED (2026-10-29)

Plan: [speed as the centre grows](../architecture/plans/speed-as-the-centre-grows.md#approval-record) (Tier 3).

- **Plan approval:** 2026-10-28 13:07 Asia/Shanghai, verbatim: "approve G plan, D3 B, D4 A" (D1 = A, D2 = A decided about 12:35).
- **Release approval:** 2026-10-28 15:27 Asia/Shanghai, verbatim: "approve G release now" (R0–R3 and the docs closeout only; the restore script not approved to run). The first attempt stopped at R0 because max_rows could not be read; on 2026-10-29 at 09:39 Asia/Shanghai the owner read **Max rows = 1000** from Dashboard > Project Settings > API and asked to run the same steps from a fresh R0.
- **Released 2026-10-29:** migration 124 applied 01:40:58 UTC, PR #172 merged as `3e02efa…` and deployed 01:42:38 UTC ([release evidence](../architecture/evidence/batch-g-r0-r3-production-2026-10-29.md)).
- **Open:** `pg_stat_statements` after one reception day; D4 = A (other client-side Casablanca dates) stays a separate follow-up; the restore needs its own approval. Owner check suggested: PostgreSQL places Africa/Casablanca at +01:00 while the owner uses UTC+0, so report day boundaries follow PostgreSQL's time-zone data.

## Audit follow-ups (Batch H) — AFU-r1 APPROVED (2026-10-29); RELEASED (2026-10-30)

Plan: [audit follow-ups](../architecture/plans/audit-follow-ups.md#approval-record), revision AFU-r1 at head `d02a305` (Tier 3). Channel: chat with Claude, relayed by the coordinating session.

- **Earlier owner decisions it carries out:** 2026-10-28, verbatim: "Remove the cap for reception but not now until we finish with everything" (H1); 2026-10-29 10:41 Asia/Shanghai, verbatim: "do all these fixes in one go … for the square (a pill) so all matches and consistent design … only inscrit" (H1–H8 in one batch, programme pill, « Inscrit »).
- **Plan approval:** 2026-10-29 about 11:10 Asia/Shanghai, verbatim: "approve H plan, D-TZ A, D-TZ-2 A, D-H5a A, D-H5b A, D-H5c A." D-TZ = A: one centre clock at UTC+0 ([ADR-014](../architecture/decisions/ADR-014-one-centre-clock.md)); D-TZ-2 = A: stored CRM task instants are kept; D-H5a = A: a new group's year is the school year of today (1 September to 31 August); D-H5b = A: a group without a valid year refuses placement and a populated group's year is locked; D-H5c = A: the year check is a trigger on every path.
- **H5 Production dry run:** approved in the same message and run read-only on 2026-10-29 about 03:11 UTC: 8 groups, all with a valid year, no live enrollment of another year or without a year ([record](../architecture/plans/audit-follow-ups.md#h5-dry-run-record)). Nothing to correct.
- **Delivers** (migration 125, PR #175; released 2026-10-30): Batch D follow-ups 1 (editable group year, placement year check, year from the group), 3 (« — » for Ancien apprenant) and 4 (enrollment-only `groupMemberIds`); Batch G D4 = A (client-side Casablanca dates); the deferred item "Browser Casablanca timezone reliability".
- **Not approved by this decision:** the merge, the migration, the release and its steps; each needs its own approval.
- **Release approval:** relayed to the release session on 2026-10-30 at about 04:14 UTC, verbatim: "approve H release now: R0 and R2 only. No R1 (the H5 dry run was clean: 8 groups, all zeros)." The owner then had the coordinating session merge PR #175.
- **Released 2026-10-30:** migration 125 applied 05:01:14 UTC; PR #175 merged as `858e5ee…` and deployed 05:17:07 UTC ([release record](../architecture/plans/audit-follow-ups.md#release-record-r0r3)). R1 was not needed.
- **Open:**
  - The owner's first morning check: a reception discount above 10 %, the programme pills, the group year, and the one open future CRM appointment (D-TZ-2).
  - The restore script needs its own approval.

## Deferred backlog after RCC-r1

Preserved, none approved or scheduled. Each needs its own architecture and owner approval.

- **D6** — universal ordinary communication follow-up consolidation across every task-creation path.
- ~~Browser Casablanca timezone reliability (`casablancaInstant` uses browser tz data).~~ Addressed by Batch H (H7, [ADR-014](../architecture/decisions/ADR-014-one-centre-clock.md)); released 2026-10-30.
- Director correction tool for wrongly linked learners.
- Nouvelle pré-inscription duplicate-risk behavior (no D8).
- Possible sidebar icon-rail / intermediate sidebar, as a future UI Foundation outcome.

## Other roadmap decisions

**Next major product outcome (owner roadmap, 2026-10-08): Director CRM & Growth Intelligence.** H3/H4 are not activated and are not moved ahead of this roadmap unless separately authorized.

| Item | State | Note |
| --- | --- | --- |
| Outcome 5 / online learning | **MERGED / DEPLOYED WITH THE LIVE SWITCH OFF / NOT ACTIVATED (2026-10-21); PROVIDER CHOSEN: ZOOM VIDEO SDK (2026-10-22); ADAPTER ADDENDUM OL-r6 APPROVED (2026-10-22, architecture only); ZOOM ADAPTER MERGED / DEPLOYED WITH THE LIVE SWITCH OFF (2026-10-23); T-P4 ACCEPTED AS A GAP, T-P5 DEFERRED (2026-10-23); R3 DONE AND PRODUCTION REDEPLOYED WITH THE ZOOM VARIABLES, SWITCH OFF (2026-10-23)** | **2026-10-23:** PR #148 (Zoom adapter, migration 118) released R0′–R2′ (merge `43be8fa0…`, switch off; at R2′ no Zoom key or Vercel variable was set); the owner accepted the T-P4 gap and deferred T-P5 (verbatim above); R3 done the same day (the three Zoom variables, Production only, Sensitive; live switch and webhook secret unset) and Production redeployed at about 15:00 UTC, so the variables are in effect; R4 Phase A done; R4 phases B–D and R5–R8 each still need separate approval. Plan revision OL-r4 at head `4545cc8…` approved 2026-10-18; implemented against the fake adapter (PR #145, migration 117), independently reviewed READY FOR FINAL REVIEW on `0f6a35f3…`, released R0–R2 on 2026-10-21 (merge `63e0cf9…`, both online variables unset). Q12 revised on 2026-10-22: Zoom Video SDK, T-P5 as acceptance on Zoom, Daily fallback. (As of 2026-10-22:) the adapter addendum OL-r6 (A1–A7) is approved at head `4dbdd526…`; Step 2 starts after PR #147 merges; a Zoom account, any secret, any Vercel variable, the live switch, merge and R3–R8 each still need separate approval. See [Online learning — unparked for architecture](#online-learning--unparked-for-architecture-2026-10-17); [CURRENT_STATE](CURRENT_STATE.md#online-learning-zoom-adapter-r0r2-production-closeout--2026-10-23) holds the evidence. |
| H3/H4 Meta lifecycle work | Separate; **not activated; not ahead of Director CRM & Growth Intelligence unless separately authorized** | Follows its own contracts and gates; see [CURRENT_STATE](CURRENT_STATE.md#next-meaningful-outcomes). |
