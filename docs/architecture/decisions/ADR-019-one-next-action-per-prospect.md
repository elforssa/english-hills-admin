# ADR-019: One next action per prospect, written by one service

## Status

**Accepted** (2026-11-21, architecture only) with the [receptionist workflow plan](../plans/receptionist-workflow.md), revision RWR-r5, which the owner approved at exact head `824252a359f99ad5d8077754c3504b2aa4eb07f2` after an independent re-review verdict of READY FOR FINAL REVIEW (r1–r4 were each reviewed CHANGES REQUIRED the same day). OD-1–OD-20 are answered in the plan's [approval record](../plans/receptionist-workflow.md#approval-record). **Implementation: the single writer and the one-action read (PR A1, migration 136) are released and Production verified with bounded acceptance on 2026-11-23** ([release record](../plans/receptionist-workflow.md#release-record-pr-a1--2026-11-23)). **Data step D1 ran on 2026-11-23** ([D1 record](../plans/receptionist-workflow.md#release-record-data-step-d1--2026-11-23)): every active prospect now has exactly one open action. **The enforcement (PR A2, migration 137) is released and Production verified with bounded acceptance on 2026-11-24** ([release record](../plans/receptionist-workflow.md#release-record-pr-a2--2026-11-24)): the unique index and the deferred presence and placement triggers make « exactly one » a database invariant, and the twelve old command wrappers are revoked. Release A (A1, D1, A2) is complete.

**Amends** [ADR-001](ADR-001-crm-lifecycle.md) (« at least one open task, several allowed » becomes one next action) and, with OD-18 answered, the product rule that keeps operational tasks beside a new follow-up: after the user confirms « Remplace : … », a call or message may replace an appointment (A), while an enrolment action can only be rescheduled, cancelled or given an outcome (B). The five-failure stop is kept (OD-17 = A). It **keeps** [ADR-015](ADR-015-enrollment-at-payment.md) decision 4: conversion still comes only from `evaluate_conversion`. The plan's §2a lists each rule.

## Date

2026-11-21.

## Context

[ADR-001](ADR-001-crm-lifecycle.md) separated status, tasks and activity. It required at least one open task for an active prospect but never limited them to one. Since then, sixteen code paths have opened `crm_tasks` rows, each with its own closing rule:

- call results;
- conversations and decisions;
- qualification;
- manual scheduling;
- completion, cancellation and reopening;
- test booking;
- CRM enrolment start (« Finaliser l'inscription »);
- the test-result trigger (« Rappeler au sujet du résultat »);
- intake;
- conversion.

The card, drawer, list, « Tâches », « Aujourd'hui » and the calendar each compute « the next action » in their own way: the earliest task, every task, or a second read.

The owner's three test rounds (November 2026) found prospects with up to four open actions, exact duplicates, reschedules that seemed to be ignored, closed prospects keeping planned tests, and an overdue list that grows with prospects who simply said « je reviendrai ». The [audit of 2026-11-21](../evidence/receptionist-workflow-audit-2026-11-21.md) traces each symptom to this design. The October D6 item, deferred, covered a narrower part of it: consolidating ordinary communication follow-ups (callbacks and WhatsApp). This decision covers every next action, operational ones included (plan §2a).

## Decision

1. **A prospect has exactly one open next action while active, and none once closed** (OD-1 = A).
   - A unique partial index on `crm_tasks(lead_id) where status = 'open'` enforces the first part.
   - Deferred constraint triggers enforce presence and absence at commit.
   - A closed prospect may keep no planned level test.
2. **One server function writes next actions.** `crm_security.set_next_action` is the only code that opens or closes an open task: it closes the current action before inserting the new one, links them with `supersedes_task_id` and derives the assignee from the prospect's owner. Every public command, the intake, CRM enrolment, the test-result trigger, the conversion and the one-time data step D1 call it. An action the system derives from a call result never replaces an appointment, an enrolment action or our own step; only an explicit user choice can (OD-18). The browser never writes the table. A test scans every function's latest definition and fails if any other function writes `crm_tasks`.
3. **One read defines the next action.** Every view reads it from `crm_security.next_action(lead)`.
4. **« En attente du prospect » is a next action, not a status.** It has an optional « relancer le » date, and it is never overdue.
5. **An appointment at the centre is one next action.** The level test is an option of that appointment, not a parallel task. Outcomes are four fixed codes, recorded only after the appointment's start.
6. **A date is required only when the time was agreed with the prospect, or when the next step is ours.** Agreed times must fall within the centre's published hours. System-generated times come from the same hours, so the system never creates a time it would refuse.
7. **The prospect's `version` is the concurrency token** for every next-action, appointment and test change. A stale screen is refused (`PT409`, [ADR-009](ADR-009-conflicts-never-retryable.md)) and the client never adopts the new version silently.
8. **One user action writes one primary history entry,** grouped by a command key. System events stay for lifecycle and audit.

## Consequences

- **Data step D1** (dry run, then owner approval) must bring every existing prospect into the model before enforcement: duplicates reduced to one, an action created for active prospects with none, an appointment created for each planned test, nothing left on closed, converted or merged prospects. The migration is split into M-A1 (services) and M-A2 (enforcement), and M-A2 aborts unless all of D1's checks are 0.
- **The old command wrappers** route through the new core until M-A2 revokes them.
- **Meta lifecycle event types and first-touch immutability are unchanged.** With OD-11 = A, qualification becomes implied by booking an appointment or choosing « Inscrire maintenant », which changes the « Qualifié » counts.
- **The help guide, PRODUCT_RULES and WORKFLOWS** change with each release.

## Alternatives considered

- **Keep several open tasks and show only the earliest.** This is today's behaviour, and it is the cause of the symptoms.
- **A computed « next action » without a constraint.** Views would agree, but duplicates would still accumulate and close rules would stay scattered.
- **A separate « waiting » lead status.** Rejected by the existing product rule that « En réflexion » is never a stage, and it would multiply status transitions.
