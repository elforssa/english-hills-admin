# ADR-019: One next action per prospect, written by one service

## Status

**Proposed** (2026-11-21) with the [receptionist workflow plan](../plans/receptionist-workflow.md), revision RWR-r1. Not approved, not implemented.

The number is provisional: ADR-018 belongs to the receptionist permissions plan (RPW-r2, PR #203). If that ADR lands under another number, this one keeps 019 unless the owner asks otherwise.

## Date

2026-11-21.

## Context

[ADR-001](ADR-001-crm-lifecycle.md) separated status, tasks and activity. It required at least one open task for an active prospect but never limited them to one. Since then, fourteen code paths have opened `crm_tasks` rows, each with its own closing rule:

- call results;
- conversations and decisions;
- qualification;
- manual scheduling;
- completion, cancellation and reopening;
- test booking;
- intake;
- conversion.

The card, drawer, list, « Tâches », « Aujourd'hui » and the calendar each compute « the next action » in their own way: the earliest task, every task, or a second read.

The owner's three test rounds (November 2026) found prospects with up to four open actions, exact duplicates, reschedules that seemed to be ignored, closed prospects keeping planned tests, and an overdue list that grows with prospects who simply said « je reviendrai ». The [audit of 2026-11-21](../evidence/receptionist-workflow-audit-2026-11-21.md) traces each symptom to this design. The October D6 « universal follow-up consolidation » item was deferred and is the same problem.

## Decision

1. **A prospect has exactly one open next action while active, and none once closed** (« at most one » if the owner chooses OD-1 = B).
   - A unique partial index on `crm_tasks(lead_id) where status = 'open'` enforces the first part.
   - Deferred constraint triggers enforce presence and absence at commit.
   - A closed prospect may keep no planned level test.
2. **One server function writes next actions.** `crm_security.set_next_action` is the only code that opens or closes an open task: it replaces any current action, links it with `supersedes_task_id` and derives the assignee from the prospect's owner. Every public command, the intake and the conversion call it. The browser never writes the table.
3. **One read defines the next action.** Every view reads it from `crm_security.next_action(lead)`.
4. **« En attente du prospect » is a next action, not a status.** It has an optional « relancer le » date, and it is never overdue.
5. **An appointment at the centre is one next action.** The level test is an option of that appointment, not a parallel task. Outcomes are four fixed codes, recorded only after the appointment's start.
6. **A date is required only when the time was agreed with the prospect, or when the next step is ours.** Agreed times must fall within the centre's published hours. System-generated times come from the same hours, so the system never creates a time it would refuse.
7. **The prospect's `version` is the concurrency token** for every next-action, appointment and test change. A stale screen is refused (`PT409`, [ADR-009](ADR-009-conflicts-never-retryable.md)) and the client never adopts the new version silently.
8. **One user action writes one primary history entry,** grouped by a command key. System events stay for lifecycle and audit.

## Consequences

- **Data step D1** (dry run, then owner approval) must reduce existing duplicates to one action per prospect before the index can be created; the migration is split into M-A1 (services) and M-A2 (enforcement).
- **The old command wrappers** route through the new core until M-A2 revokes them.
- **Meta lifecycle event types and first-touch immutability are unchanged.** If OD-11 = A, qualification becomes implied by booking an appointment or choosing « Inscrire maintenant », which changes the « Qualifié » counts.
- **The help guide, PRODUCT_RULES and WORKFLOWS** change with each release.

## Alternatives considered

- **Keep several open tasks and show only the earliest.** This is today's behaviour, and it is the cause of the symptoms.
- **A computed « next action » without a constraint.** Views would agree, but duplicates would still accumulate and close rules would stay scattered.
- **A separate « waiting » lead status.** Rejected by the existing product rule that « En réflexion » is never a stage, and it would multiply status transitions.
