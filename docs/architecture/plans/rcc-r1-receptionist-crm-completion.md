# RCC-r1 — Receptionist CRM completion

**Active plan.** Recorded 2026-10-06 from the owner's explicit instructions, so any agent can continue without earlier chats. Owner decisions are summarized in [OWNER_DECISIONS](../../ai/OWNER_DECISIONS.md). Implementation and deployment evidence belongs in [CURRENT_STATE](../../ai/CURRENT_STATE.md); execution, review and release gates are in [AGENTS](../../../AGENTS.md).

| Phase | State |
| --- | --- |
| RCC-A0 | **COMPLETE — INVESTIGATION ONLY — NO CODE CHANGE** |
| RCC-A1 | **MERGED / DEPLOYED / PRODUCTION VERIFIED (2026-10-07)** — Tier 3; PR #108, migration 111 ([record](#implementation-record), [release](#production-release--2026-10-07)) |
| RCC-A2 | **PLANNED / NOT YET APPROVED** |
| RCC-B1 | **PLANNED / NOT YET APPROVED** |

RCC-r1 builds on the completed, Production-verified [Outcome 3 workspace](completed/outcome-3-receptionist-workspace.md) and the deployed [UI Foundation](english-hills-ui-foundation.md). It does not replay their implementation or release operations.

## Owner product decisions (approved)

- The receptionist records interaction outcomes; guarded commands derive commercial status.
- Stage-changing drag-and-drop is not an authority mechanism.
- `À contacter` displays as **Contact en cours**; `Converti` displays as **Inscription confirmée**. These are presentation labels; stored status values are unchanged.
- **En réflexion** is follow-up metadata, not another pipeline stage.
- Trusted linked Confirmed/Validated enrollment remains the only conversion authority.
- Task assignment stays architecturally intact but becomes secondary in ordinary receptionist UI.
- Routine prose notes are optional where structured facts already provide sufficient evidence.
- Agreed appointments and internal reminders are separate concepts.
- **Owner decisions, 2026-10-07 (RCC-A1 review follow-up):**
  - The latest explicit conversation decision replaces any open generic commercial follow-up (callback or WhatsApp follow-up), regardless of channel. Center visits, placement, enrollment and other operational tasks are preserved.
  - *Release clarification (2026-10-07):* this guarantee covers explicit conversation decisions only. Other task-creation paths (manual Planifier, wrong-number follow-up, next task on completion or cancellation, reopen) keep their existing behavior. A broader "at most one generic follow-up from every path" rule is deferred and not part of RCC-A1.
  - An agreed callback appointment is never silently shifted. If the agreed time is outside the allowed Casablanca calling window, it is rejected, and the receptionist must agree another compatible time. Internal reminders, including presets, may still resolve through the server policy.
- Internal reminder presets are resolved server-side using the existing Casablanca policy.
- RCC-r1 does not change Meta/lifecycle authority, finance authority, enrollment-confirmation authority or permissions.

## RCC-A0 — enrollment failure investigation

**COMPLETE — INVESTIGATION ONLY — NO CODE CHANGE.** Synthetic local data only; **no Production mutation occurred.**

- **Path tested:** Commencer l’inscription → Créer un nouvel apprenant → Continuer → Continuer → Créer la pré-inscription.
- The final button invokes `public.crm_start_enrollment` ([084](../../../supabase/migrations/084_crm_enrollment_and_conversion.sql)).
- **Synthetic reproduced failures:**

| Input | Result | Source check |
| --- | --- | --- |
| Future birth date | `22023` / `Invalid new learner` | 084 new-learner validation (`birth>current_date`) |
| Already-linked learner, then “new learner” selected | `22023` / `Invalid new learner` | Same check (`l.student_id is not null` with `student_choice='new'`) |
| Past follow-up date with no existing enrollment follow-up | `22023` / `Valid future task required` | Follow-up task validation in [080](../../../supabase/migrations/080_crm_commands_and_followup_engine.sql) |

- **Ordinary path succeeded:** new learner, Yearly / 2026–2027 / Submitted, with optional birth date, level, group, notes and follow-up left blank. The opportunity stayed **QUALIFIED**, which is correct because initiation is not conversion.
- **The owner's exact Production failure remains INCONCLUSIVE.** Blank optional fields were **not** established as the cause. Do not assume one of the reproduced causes was the owner's case.

Follow-up belongs to RCC-A2, not A1.

## RCC-A1 — outcome-led receptionist CRM

**OWNER APPROVED FOR IMPLEMENTATION. Risk tier: Tier 3.** It amends guarded CRM commands and follow-up/task scheduling that affect existing Production data and commercial status, so the full Tier-3 lifecycle in [AGENTS](../../../AGENTS.md#high-risk-changes-tier-3) applies: implementation on its own branch, focused local validation with synthetic data, one author self-check, PR, then a separate independent exact-SHA review, owner release approval, a separate release/operator task, Production verification and documentation closeout. Approval to implement is not approval to merge, migrate Production or deploy.

### Approved implementation boundary

1. Outcome-led call/interaction workflow: the receptionist records what happened, and existing guarded commands derive status.
2. **Contact en cours** and **Inscription confirmée** presentation terminology.
3. Qualified + needs time stays **QUALIFIED**, with structured **En réflexion** follow-up metadata (not a new stage).
4. Routine structured conversations no longer require unnecessary prose. Required explanations stay for standalone notes, **Other** reasons, cancel and reopen.
5. Correct the task-completion frontend/database length mismatch. Starting evidence: the completion textarea in [CrmActionDialog.jsx](../../../src/components/crm/CrmActionDialog.jsx) allows 4000 characters, while `complete_task` rejects an `outcome` over 200 characters (080, carried into 103). Confirm the field mapping before choosing the fix.
6. Separate agreed appointments (with the prospect) from internal reminders.
7. Bounded internal reminder presets, resolved server-side using the existing Casablanca policy (no browser-computed due times).
8. Preserve the failed-call cadence ([PRODUCT_RULES](../../ai/PRODUCT_RULES.md#commercial-lifecycle-and-follow-up)).
9. Preserve explicit-date compatibility and retry/idempotency stability (request keys and expected versions).
10. Keep the owner/task-assignee architecture, but move reassignment out of the everyday foreground.

### Critical safeguard

> Any amendment or replacement of `crm_security.command` must preserve the latest implementation from [migration 103](../../../supabase/migrations/103_crm_meta_funnel_r4_advisory_d2.sql), including lifecycle barriers and pending-stop handling. **Never reconstruct it from migration 080.**

Before allocating a migration number, check `supabase/migrations`, CURRENT_STATE and a freshly fetched `origin/main`, and coordinate with any other active agent.

### Explicit exclusions

RCC-A1 does **not** include:

- the owner-specific enrollment blocker fix;
- enrollment-flow redesign;
- Commencer / Continuer / Ouvrir l’apprenant;
- responsive/visual B1 work;
- finance changes;
- new permissions;
- conversion-authority changes;
- lifecycle/Meta changes;
- historical backfills;
- task-engine replacement.

Work that needs any of these returns to the owner for a decision ([outcome-based batching](../../../AGENTS.md#outcome-based-batching)).

### Implementation record

Recorded 2026-10-07 by the RCC-A1 implementation task on branch `feature/rcc-a1`, created from origin/main `b33d9a8078abce738a9ef43588c9385cfc4f7cb9`. Implementation is not merge, migration or deployment authority; the Tier-3 review and release gates above still apply.

[Migration 111](../../../supabase/migrations/111_crm_rcc_a1_outcome_led_followup.sql) was allocated after confirming a 110 ceiling on origin/main, on every remote branch and in [CURRENT_STATE](../../ai/CURRENT_STATE.md#deployment-and-credential-evidence-boundaries).

| Boundary item | Implementation |
| --- | --- |
| 1. Outcome-led workflow | Call (parent answered), other-channel conversation and meaningful-WhatsApp dialogs ask **Résultat de l’échange**: test de niveau, visite, inscription, en réflexion, souhaite être rappelé, pas intéressé, projet non adapté, autre étape. `crm_record_conversation_decision` gains a `considering` decision and an optional `channel` (`phone`/`whatsapp`/`in_person`) and still delegates to the existing commands, which derive status. Qualifying results are hidden for a lead that is already QUALIFIED. |
| 2. Terminology | Presentation labels only: CONTACTING → **Contact en cours**, CONVERTED → **Inscription confirmée**. Stored values and the director lifecycle screen’s Meta event label are unchanged. |
| 3. En réflexion | `crm_tasks.followup_reason = 'considering'` on a callback or WhatsApp follow-up. The wrapper sets it only for the `considering` decision and rejects it on other decisions. Direct scheduling may also mark one. Status still comes from the conversation command, so QUALIFIED stays QUALIFIED and no lifecycle status activity is emitted. |
| 4. Optional prose | `record_conversation`, channel-evidenced `qualify_lead` and the decision wrapper no longer require a note. Explanations remain required for standalone notes, Other qualification/closure reasons, task cancellation and reopening. |
| 5. Completion length | Mapping confirmed: the **Résultat de l’action** textarea is sent as `complete_task.outcome`, which the server caps at 200 characters and records as the completion activity body. `note` is accepted but unused. Fix: the textarea is capped at 200 characters with a visible counter. The server contract is unchanged. |
| 6. Appointments vs reminders | New `crm_tasks.schedule_kind` column: `appointment` is a time agreed with the prospect; `reminder` is internal. NULL means cadence/system work or a pre-A1 task; there is no backfill. New center visits are created as appointments (a legacy payload without a kind still stores NULL), and the receptionist UI always creates placement-test preparation as an internal reminder; the server does not enforce that second rule for direct RPC callers. An agreed callback must fall inside the Casablanca calling window. It is kept exactly or rejected, never shifted, including on reschedule. Internal reminders and legacy explicit times still resolve to the next window. |
| 7. Reminder presets | `due_preset` takes `in_2_hours`, `tomorrow`, `in_2_days`, `in_3_days` or `next_week`, for reminders only. The private `crm_security.reminder_due` resolves it to the next calling window of the lead’s Casablanca follow-up policy. Appointments require an explicit time, and the browser never computes preset times. |
| 8. Failed-call cadence | Failed-call recording, attempt slots, spacing and the five-failure stop are unchanged; attempt tasks keep a NULL kind. |
| 9. Compatibility | Payloads without the new keys behave as before, including callback window adjustment. Only `schedule_kind = 'appointment'` callbacks are exempt from adjustment, and those are rejected instead. Request keys, payload-hash replay and expected versions are unchanged. A preset resolves once, and replay returns the stored result. |
| Conversation-decision follow-up replacement | Each conversation decision (callback, considering or qualify) cancels any open callback or WhatsApp follow-up as an audited "Conversation follow-up replaced" cancellation, then creates the new one. This applies across channels. Visits, placement, enrollment, post-test and cadence tasks are untouched. Other task-creation paths do not replace (see the [release limitations](#production-release--2026-10-07)). |
| 10. Assignment | The owner/assignee model and `crm_reassign` are unchanged. Task reassignment moves to overflow menus: **Autres actions** in the drawer, and **Plus d’options** on open-task rows and Work Queue rows. The prospect-owner line is plain text, and owner assignment stays under **Autres actions**. |

**Migration-103 safeguard.** In 111, `crm_security.command` is migration 103’s definition copied verbatim; its body was first verified byte-identical to the local function at ledger 110. Exactly three places change: the two note requirements above, and rescheduling an agreed callback outside calling hours, which is now rejected instead of shifted. The lifecycle barrier, pre-identity keys and pending-stop handoff are retained and asserted by the acceptance suite. Migration 111 replaces only these definitions: `command`, `new_task`, `crm_record_conversation_decision`, and the four migration-110 read projections, which gain the two additive fields. Grants are unchanged and the new helper is private.

**Validation (local, synthetic):**

- [SQL acceptance](../../../scripts/test-crm-rcc-a1.sql), rollback-only.
- [110→111 stateful upgrade](../../../scripts/test-crm-rcc-a1-upgrade.mjs): unchanged table hashes, grants, RLS, triggers and other function bodies, and no backfill.
- [Pure presentation contract](../../../scripts/test-crm-rcc-a1.mjs).
- [Browser acceptance](../../../scripts/test-crm-rcc-a1-browser.mjs).
- The existing CRM SQL, lifecycle/R4 and browser suites.

**Review follow-up (2026-10-07).** After rebasing onto main `4cb0eb9` (PR #109, sharp remediation), the review findings and owner decisions above were applied in place to unmerged, undeployed migration 111. A hidden conversation result can no longer make the note required after the call outcome changes.

The exclusions above are untouched: no change to enrollment, Commencer/Continuer/Ouvrir, B1 responsive work, finance, permissions, conversion, lifecycle/Meta, backfills or the task engine.

### Production release — 2026-10-07

**MERGED / DEPLOYED / PRODUCTION VERIFIED WITH BOUNDED ACCEPTANCE.** Reviewed head `7444fdc5fa7155c57d36cef2605160b36b280fe4` merged as `8d5af40bc21177c582efe5df96d31ada8d7d9ff5`. Vercel Production `dpl_CBvNM7AzLrqR6frH3NQ8CZMrmNHU` is READY on that commit. Migration 111 was applied first, with owner approval, and the Production ledger is 001–111. Evidence: [release record](../evidence/rcc-a1-production-2026-10-07.md).

Accepted limitations (owner, 2026-10-07):

- Replacement of open generic follow-ups is guaranteed only for explicit conversation decisions across channels. Manual Planifier, wrong-number follow-up, next tasks on completion or cancellation, and reopen keep their existing behavior. Broader consolidation is deferred.
- Placement-preparation `schedule_kind` is enforced by the receptionist UI, not as a universal direct-RPC invariant.
- New center visits use appointment semantics; legacy-compatible payloads may keep a NULL `schedule_kind`.

RCC-A1 is complete. The plan stays active for RCC-A2 and RCC-B1, which remain not approved.

## RCC-A2 — enrollment UX hardening

**PLANNED / NOT YET APPROVED.** Candidate scope:

- enrollment UX hardening;
- field-specific errors instead of generic `22023` messages;
- future-birth-date prevention;
- linked-learner handling;
- follow-up-date clarity;
- contextual Commencer / Continuer / Ouvrir l’apprenant.

The exact owner-case root cause is still unresolved (see RCC-A0).

## RCC-B1 — responsive Opportunities presentation

**PLANNED / NOT YET APPROVED.** Candidate scope:

- compact Opportunities header and toolbars;
- improved card and action hierarchy;
- contained Kanban scrolling;
- intermediate-width sidebar;
- responsive filter reflow;
- responsive drawer and dialog behavior;
- unified **Demande**;
- collapsible history;
- remove desktop telephone-launch links while keeping **Enregistrer un appel**.

Acceptance widths: **1440 / 1280 / 1024 / 768 / 390 CSS px**.

## Not authorized by RCC-r1

H3/H4 Meta lifecycle work remains separate under its own contracts. Outcome 5 / online learning is parked until next month. See [OWNER_DECISIONS](../../ai/OWNER_DECISIONS.md#other-roadmap-decisions).
