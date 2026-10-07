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

Phase states: RCC-A0 complete (investigation only); **RCC-A1 APPROVED and released** on 2026-10-07 (deployment evidence in [CURRENT_STATE](CURRENT_STATE.md)); **RCC-A2 OWNER APPROVED FOR IMPLEMENTATION** on 2026-10-07 (see below); RCC-B1 **PLANNED / NOT APPROVED**.

RCC-A1 release clarifications (2026-10-07): the guaranteed generic-follow-up replacement covers explicit conversation decisions across channels only. Broader consolidation across every task-creation path is deferred. The placement-preparation kind is UI-enforced, and legacy payloads may keep NULL `schedule_kind`. See the plan for boundaries and exclusions.

## RCC-A2 — receptionist enrollment UX hardening — APPROVED

Plan: [RCC-A2 revision A2-r1](../architecture/plans/rcc-a2-enrollment-ux-hardening.md#owner-approval-record). Approved by the owner on **2026-10-07**, as recommended. **Implementation, migration 112, merge and Production release are not yet authorized**; each needs a separate explicit owner instruction.

- **D1:** server reason codes in the PostgreSQL `HINT`; existing SQLSTATEs and messages are preserved.
- **D2:** future birth dates are prevented in both browser and server, using the Casablanca civil date. Today remains valid; no minimum-age rule.
- **D3:** a prospect already linked to a learner preselects that learner. Alternative and new-learner choices are hidden; no receptionist override in A2.
- **D4:** default-first enrollment follow-up presentation. Existing scheduling semantics are preserved; no reminder presets.
- **D5:** single contextual action rules. **Continuer l’inscription** goes to the learner file's **Inscriptions et groupes** section.
- **D6:** broader generic callback/WhatsApp follow-up consolidation is excluded from RCC-A2 and remains a separate future outcome.
- **D7:** no Production forensic read is authorized now.

## Other roadmap decisions

| Item | State | Note |
| --- | --- | --- |
| Outcome 5 / online learning | **PARKED UNTIL NEXT MONTH** | Still MISSING ARCHITECTURE per [ARCHITECTURE](ARCHITECTURE.md#architecture-gaps). |
| H3/H4 Meta lifecycle work | Separate; **not authorized by RCC-r1** | Follows its own contracts and gates; see [CURRENT_STATE](CURRENT_STATE.md#next-meaningful-outcomes). |
