# RCC-r1 — Receptionist CRM completion

**Active plan.** Recorded 2026-10-06 from the owner's explicit instructions, so any agent can continue without earlier chats. Owner decisions are summarized in [OWNER_DECISIONS](../../ai/OWNER_DECISIONS.md). Implementation and deployment evidence belongs in [CURRENT_STATE](../../ai/CURRENT_STATE.md); execution, review and release gates are in [AGENTS](../../../AGENTS.md).

| Phase | State |
| --- | --- |
| RCC-A0 | **COMPLETE — INVESTIGATION ONLY — NO CODE CHANGE** |
| RCC-A1 | **OWNER APPROVED FOR IMPLEMENTATION** — Tier 3; not yet implemented |
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
