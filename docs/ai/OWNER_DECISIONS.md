# Owner decisions

Concise register of current owner product decisions, so any agent can continue without earlier chats. States: **APPROVED** (owner-approved scope), **PLANNED / NOT APPROVED** (direction only; needs owner approval before implementation) and **PARKED** (deliberately deferred). An approved decision is not implemented or deployed behavior; [CURRENT_STATE](CURRENT_STATE.md) owns that evidence. Execution gates in [AGENTS](../../AGENTS.md) still apply. Detailed scope belongs in the linked plan, not here.

Recorded 2026-10-06 from the owner's explicit instructions for the tool-independent transition.

## RCC-r1 — receptionist CRM completion — APPROVED

Plan: [RCC-r1](../architecture/plans/rcc-r1-receptionist-crm-completion.md).

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

Phase states: RCC-A0 complete (investigation only); **RCC-A1 APPROVED and released** on 2026-10-07 (deployment evidence in [CURRENT_STATE](CURRENT_STATE.md)); RCC-A2 decisions **APPROVED** on 2026-10-07; **RCC-A2 released** on 2026-10-07 (PR #112, migration 112; evidence in [CURRENT_STATE](CURRENT_STATE.md)); RCC-B1 architecture **APPROVED** on 2026-10-07 (revision B1-r1); not implemented.

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
- **D6:** broader generic callback/WhatsApp follow-up consolidation is excluded from RCC-A2 and remains a separate future outcome. It is tracked in the [RCC-r1 deferred reliability backlog](../architecture/plans/rcc-r1-receptionist-crm-completion.md#deferred-crm-reliability-backlog), alongside the pre-existing browser time-zone limitation of `casablancaInstant`.
- **Success wording amendment (2026-10-07):** an existing enrollment linked by the request shows **Inscription rattachée**. Creation headings appear only for an enrollment the request created; **Inscription déjà rattachée** is used for a discovered result.
- **D7:** no Production forensic read is authorized now.

## RCC-B1 — responsive Opportunities presentation — APPROVED

Plan: [RCC-B1](../architecture/plans/rcc-b1-responsive-opportunities.md#owner-approval-record), revision **B1-r1**. On **2026-10-07** the owner approved the architecture as recommended and marked it **OWNER APPROVED FOR IMPLEMENTATION**.

- The independent review of `225d17d…` returned CHANGES REQUIRED. Revision **B1-r2** incorporates its corrections without changing any decision, and the approval carries forward to B1-r2.
- Implementation itself is not yet authorized: it needs exact-SHA independent re-review of B1-r2, the architecture PR merge and a separate explicit owner instruction. Merge and release are not authorized.

- **D1 — A:** merge the inquiry information into one **Demande** section.
- **D2 — C:** show the `tel:` **Appeler** link only below 640px with a coarse pointer. The visible phone number, the copy action and **Enregistrer un appel** remain available everywhere.
- **D3 — A:** show the latest three real exchanges by default, with **Afficher tout l’historique** for the complete history using the existing paging.
- **D4 — A:** no sidebar change. Any compact or icon sidebar is a separate UI Foundation outcome.
- **D5 — B:** a stage-navigated list is the default phone Opportunities view.
- **D6 — B:** a full-width, full-height phone sheet with sticky header and close behavior; browser Back closes it.
- **D7 — B:** the stage-list default applies below 1024px, including the tablet band.
- **D8 — A:** the desktop drawer stays modal.
- **Restated constraints:**
  - Tier 2, presentation-focused.
  - No database, migration, server/API authority, lifecycle, permission, Meta, finance, enrollment-logic or global sidebar change.
  - The Escape/menu fix must use page-local handling without dependency changes.
  - Any dependency change, server behavior change, enrollment or business-logic change, or cross-platform sidebar change is a Tier-3 escalation and stop condition.
  - Acceptance covers both sides of the 768px and 1024px edges plus the 390/768/1024/1280/1440 widths.

## Other roadmap decisions

| Item | State | Note |
| --- | --- | --- |
| Outcome 5 / online learning | **PARKED UNTIL NEXT MONTH** | Still MISSING ARCHITECTURE per [ARCHITECTURE](ARCHITECTURE.md#architecture-gaps). |
| H3/H4 Meta lifecycle work | Separate; **not authorized by RCC-r1** | Follows its own contracts and gates; see [CURRENT_STATE](CURRENT_STATE.md#next-meaningful-outcomes). |
