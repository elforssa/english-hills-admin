# Receptionist workflow — one next action, one identity, one rule per form

**Status: ACTIVE.** Architecture APPROVED, revision RWR-r5 at exact head `824252a359f99ad5d8077754c3504b2aa4eb07f2`, 2026-11-21 ([approval record](#approval-record)). **PR A1 released on 2026-11-23** (PR #208, merge `25e91e6`, migration 136 applied and Production verified with bounded acceptance; [release record](#release-record-pr-a1--2026-11-23)). **Data step D1 run on 2026-11-23** (applied 11:39:41 UTC with the owner-approved counts, post-checks Q04, Q05, Q07 and Q29 at zero; [D1 record](#release-record-data-step-d1--2026-11-23)); **PR A2 released on 2026-11-24** (PR #214, merge `0bb8f27`, migration 137 applied and Production verified with bounded acceptance; [release record](#release-record-pr-a2--2026-11-24)): release A (A1, D1, A2) is complete and « exactly one next action » is enforced in the database; `d1_revert` is gone with 137. **PR C1 released on 2026-11-26** (PR #216, merge `a7f63c4`, migration 138 applied first and Production verified with bounded acceptance; [release record](#release-record-pr-c1--2026-11-26)): desk payments. **PR B1 released on 2026-11-26** (PR #217, merge `15909d6`, migration 139 applied first and Production verified with bounded acceptance; [release record](#release-record-pr-b1--2026-11-26)): people identity. **Hotfix PR #220** (merge `b730234`, 2026-11-26) repaired the director's « Annuler ce paiement » ([record](#release-record-hotfix-pr-220--2026-11-26)). **Data step D3 run on 2026-11-26** (applied 12:35:16–12:36:18 UTC, 229 changes; [D3 record](#release-record-data-step-d3--2026-11-26)); **data step D5 run on 2026-11-26** (2 pairs approved by the owner, applied 13:14:35–13:15:36 UTC; [D5 record](#release-record-data-step-d5--2026-11-26)). Next: B2 (with D6's functions, migration 140; no prices, OD-16 replaced), then C2 (with D7; implemented on its pull request as migration 141, [C2 implementation record](#implementation-record-pr-c2-m-c1-academic-part-migration-141)) and D4 ([gates](#owner-decisions-follow-ups-and-gates--2026-11-26)). Tier 3: the plan covers CRM commands and their invariants, migrations that change existing Production data, finance screens, conversion-adjacent paths and a role-surface change. Every Production read, migration, data step, merge and release needs the owner's separate approval.

- **Evidence:** the [audit of 2026-11-21](../evidence/receptionist-workflow-audit-2026-11-21.md). It covers every finding with its status and file references, plus the new findings NF-1–NF-17, the entry-point matrix, the current state machine and the read-only queries Q01–Q30.
- **Decision record:** [ADR-019 (accepted)](../decisions/ADR-019-one-next-action-per-prospect.md).
- **Baseline:** `origin/main` `53c486b`, migration ceiling 130.
- **Overlapping open work:** plan RPW-r2 (PR #203, approved 2026-11-21) and its implementation PR #204 (migrations 131–135), released on 2026-11-22 before A1 (OD-19 = A).

| Revision | Date | Change |
| --- | --- | --- |
| RWR-r1 | 2026-11-21 | First architecture from the owner's three test rounds (P0–P2, sections 1–5 of the brief). Independent review at `6a43e75`: CHANGES REQUIRED (B1, B2, I1–I7, test gaps). |
| RWR-r2 | 2026-11-21 | Review fixes, all in this PR. **B1:** the two missing next-action writers (`crm_start_enrollment`, `crm_security.placement_milestones`) join the single-writer rewrite, and a writer inventory becomes an acceptance test (§4.2). **B2:** D1 now brings every existing prospect into the model (one action each; appointments for planned tests) and M-A2 checks it (§10). **I1** phone check only on insert or change (§5.1). **I2** student merge never moves enrollments (§5.3, OD-8). **I3** approved rules this plan amends are listed (§2a) with OD-17 and OD-18. **I4** R0 queries return no personal data and prove read-only in their last row. **I5** hours always come from the current published version (§4.5). **I6** merge order with #204 (OD-19, contract). **I7** the call-result undo is specified (§4.9). Test gaps closed (§7–§10). NF-2 corrected in the audit: test booking already bumps the prospect's version. Independent re-review at `d24d736`: CHANGES REQUIRED (no blocking; four important). |
| RWR-r3 | 2026-11-21 | Re-review fixes, all in this PR. **1** « Pas de réponse » is a 10-second delayed send, not a server undo, so attempt numbers and the cadence are untouched (§4.9). **2** Student merge: converted prospects stay on the source (`127:1150`), and the student with live enrollments is always the target; refused when both have some (§5.3, OD-8). **3** A failed call never replaces an appointment, enrolment action or our step, as the live code (`080:135`); only an explicit « Changer » can, per OD-18 (§4.2 step 3, §4.8). **4** D1 writes through `set_next_action`; its revert reopens and cancels rows, deletes nothing; `d1_revert` is the one time-boxed writer exception, dropped by M-A2 (§4.2, §10). Tests T3c, T3d, T7b and merge cases added; R0 proof on one row even when a query finds nothing; Q07 covers merged prospects; T-R0 re-run on R0 day. Nits fixed. |
| RWR-r4 | 2026-11-21 | Second re-review at `55351aa`: CHANGES REQUIRED (no blocking). **1** « Live » enrollment is defined as the one-live-enrollment index set (`120:52-53`, status not `Rejected` or `Ended`), and the merge tests add `Trial`-only and `Submitted` sources (§5.3, OD-8). **2** `set_next_action` gets a D1 mode (`keep` task X and cancel every other open action without cancelling a test still linked to X; `create`; `null`), D1 joins the null-spec callers, and the upgrade fixture adds a shared-test duplicate (§4.2, §9, §10). **3** OD-20 answered by the owner on 2026-11-21: B — « Pas de réponse » saves immediately with no « Annuler »; the 10-second hold and its tests are removed; request keys stay stable as today (§4.9). Tests: T3c sends the kept action's own id and asserts it isn't completed; T7 hold tests replaced. Nit: the failed-call rule is worded as an extension of `080:135`. |
| RWR-r5 | 2026-11-21 | Third re-review at `94a0c35`: CHANGES REQUIRED (no blocking). **1** D1 rule (a) chooses the kept action in three steps: the earliest future agreed appointment, else an appointment linked to a still-planned test (past or future), else the most recently created; `d1_plan` counts and samples every test D1 cancels under any rule; the upgrade fixture adds a past appointment with a planned test next to a newer callback (§4.2, §9, §10). Nit: request keys — the button is disabled while its request is in flight and a retry resends the first tap's payload, as `retryKey` does today (§4.9, T7). OD-20: the decision table records that the owner gave B in a message to the architecture session, to be restated verbatim in the approval record. |

# Owner summary

## What will change

- **One next action per prospect, everywhere.** Any new action replaces the current one, and the form says so (« Remplace : Rappel 24/11 10:00 »). The database refuses a second open action. The card, drawer, list, « Tâches », « Aujourd'hui » and the calendar all read the same next action from one function.
- **Two dialogs instead of six:**
  - **« Noter un échange »** covers calls, WhatsApp, at the desk and other channels, with one-tap call results.
  - **« Changer la prochaine action »** replaces « Planifier », « Replanifier », « Annuler l'action », « Terminer » and « Qualifier ».
  - A note never touches the next action.
- **« Rendez-vous au centre »** replaces separate visits and level tests; the test is an option of the appointment. Booking it replaces the pending reminder. After the appointment time, four outcome buttons appear: « Venu – inscrit sur place », « Venu – reviendra », « Venu – pas intéressé », « Pas venu ».
- **« En attente du prospect »** is a next action with an optional « relancer le… » date (5 days by default, OD-5). These prospects appear under « En attente », never under « En retard ».
- **A date is asked only when something was agreed** (a callback time, an appointment) **or when the next step is ours** (send the price, confirm a group).
- **Closing a prospect** cancels its next action and its planned test or appointment.
- **A screen with stale data is refused** (« Ce prospect a été modifié, rechargez ») and never overwrites silently.
- **Every existing prospect gets exactly one next action** before the rule is switched on (data step D1, with your approval): duplicates are merged, prospects with none get « En attente » or the appointment of their planned test.
- **Every new prospect and task has an owner.** « Tâches » opens on « Moi + non attribué ».
- **One phone format (+212…) on every write.** Any format of a stored number finds it in every search box.
- **One search covers prospects and students.** Duplicates are flagged **before** creating, there are merge tools for the direction, and contacts and learners can be edited. « C'est la même personne » and « Ajouter un enfant » are added.
- **One French programme catalogue with a price list,** one origin list (with « recommandé par ») and one list of close reasons, used everywhere.
- **One payment panel** shared by « Inscrire et encaisser » and « Encaisser ». « Encaisser » opens on the open balance. The duplicate-receipt warning appears inside the app, and buttons are locked while saving.
- **History shows one entry per action,** with the real user name and what changed.
- **Level tests, attendance and student forms get their missing rules:**
  - Tests: cancel, absent, no result before the test, levels filtered.
  - Attendance: only on class days and never in the future.
  - Student forms: birth date and category checks.
- **Data clean-up** runs as counted dry runs, each needing your approval: merge duplicate actions, normalise phones, map programmes and origins, merge duplicate students, remove test data.

## What staff/users will be able to do

- **Log an unanswered call in one or two taps.** The next attempt is scheduled automatically.
- **Handle an inbound call wanting a test in one form**, in at most 8 actions.
- **Handle a walk-in in the same « Nouveau prospect » form** (conversation logged, no « Premier contact » call), and go straight to payment.
- **Correct a wrong number,** or close the prospect as « Mauvais numéro ».
- **See and change exactly one next action,** with « Remplace : … » shown before saving.
- **Put a prospect « En attente »** without inventing a date.
- **Record what happened after an appointment.**
- **Book, cancel or mark absent a level test** from the prospect, without retyping the person.
- **Find anyone by any phone format** from a single search box.
- **Direction only:** merge duplicate prospects and students.
- **Direction:** set the centre's calling and opening hours, shown in every form.

## What remains restricted

- **Receipts:** numbering, immutability and void rules are unchanged. Financial rows are never deleted or rewritten; issued receipts keep their stored phone and text.
- **Conversion** still comes only from a paid (or fully discounted) enrollment ([ADR-015](../decisions/ADR-015-enrollment-at-payment.md)). Holding a seat without payment is **not** included unless you choose it (OD-2).
- **Merging prospects and students** is direction-only and never changes a receipt or a payment (OD-8).
- **The receptionist's permissions** stay as approved in RPW-r2. Item 24 of your brief conflicts with that approval and is decision OD-9.
- **Meta lifecycle and intake contracts** are unchanged: the same event types are written, and first-touch attribution stays immutable.

## UI impact

French everywhere, and « prospect » or « contact » replaces « parent ».

- **CRM:** two dialogs, a single next-action panel, appointment outcome buttons, an « En attente » list, toasts instead of pop-ups, protection against losing a half-filled form, and one clear-search control.
- **Tâches:** one row per prospect (siblings grouped by contact).
- **Students:** one list (« Annuaire » merged), no inline « Catégorie » save, and status « Prospect » renamed (OD-12).
- **Receipts:** French labels, no repeated text, an « Avec solde » filter.
- **Mobile:** layout acceptance on phone width for every new form.

## Database impact

Forward migrations, numbered at merge after RPW's 131–135:

- **M-A1** (next action, appointments, hours, history grouping, ownership)
- **M-A2** (the single-action unique index and closed-prospect guard, after data step D1)
- **M-B1** (phones, people search, duplicates, merges, prospect edit)
- **M-B2** (catalogues: programmes and prices, origins, close reasons)
- **M-C1** (payment rule, placement tests, attendance rules, student checks)

Data steps D1 and D3–D7 each have a dry run (counts and sample ids) followed by an apply step that you approve. Nothing is dropped; old command functions stay for rollback until M-A2 revokes them.

## Important security decisions

- **One server writer for next actions.** `crm_security.set_next_action` is the only code that opens or closes a next action; every public command, the intake and conversion go through it. The browser never writes CRM tables, and the existing RPC-only grants stay.
- **The prospect's version is the concurrency token** for every next-action, appointment and test change. Booking already checks and bumps it; test edits will check it too (NF-2, corrected in r2).
- **Merges and phone corrections are journalled.** Merges are direction-only.
- **No test clock in Production code.** Time-travel tests age fixture data on the local stack instead (section 9).

## Risks / owner review points

1. **Size.** Three releases (A, B, C) in order; A first. A is large, but splitting it would leave the database rule without its UI, or the reverse.
2. **Two of your requirements conflict with approved decisions:**
   - « hold a seat with a due date » vs ADR-015 (OD-2)
   - item 24 vs RPW-r2 (OD-9).

   The design itself changes further approved rules; item 6 and §2a list them all.
3. **Qualification becomes implied** by booking an appointment or choosing « Inscrire maintenant » (OD-11). This changes how many prospects reach « Qualifié », and with it the dormant Meta « Qualified » event.
4. **D1 picks which duplicate action survives** (an agreed future appointment first, otherwise the most recent intent). You approve the counts and samples before it runs.
5. **Release B starts after PR #204** is merged, because both change the student write paths. **Release A also merges after #204** unless you choose otherwise (OD-19), so migration numbers stay in order.
6. **Approved rules this plan changes** are listed in §2a: ADR-001's « at least one open task » becomes « exactly one », the rule that a callback never replaces a visit, test or enrolment action (OD-18), and what happens after five failed calls (OD-17). Conversion itself is unchanged (ADR-015 decision 4).

---

## 1. Verified current state

[Audit](../evidence/receptionist-workflow-audit-2026-11-21.md), summary:

- **Findings:** 71 checked.
  - Confirmed: 58. Two of them (24b, 24c) are confirmed but by design, and RPW-r2 extends them.
  - Partly confirmed: 10. The mechanism exists, but the symptom also depends on data or the browser.
  - Not reproduced as described: 3.
    - 21g: adult groups and teacher/room fields exist; the gap is data.
    - 23a: the void flow exists, director only.
    - 25g: mobile wasn't testable here.
- **New findings:** NF-1–NF-17. The most serious:
  - NF-1: the stale-tab overwrite is the client adopting the new version after a conflict.
  - NF-3: closed prospects keep their planned test.
  - NF-4: a commitment made on « Encaisser » plus a wizard enrolment creates two charges.
  - NF-5: the pop-up shows the wrong action, so a reschedule looks ignored.
  - NF-11: an appointment can be marked done before it happens.
- **Corrected in r2:** NF-2 said test booking doesn't bump the prospect's version. It does: trigger `crm_security.placement_milestones` (`083:101`) bumps it after every CRM test change, and booking checks `expected_version` (`119:729`). The remaining gap is that test **edits** check only the test's `updated_at`.
- **Not verified:** no Production read was made. Your counts of 21/11 are quoted as owner-supplied, and R0 re-counts them with Q01–Q30.

## 2. Root-cause map

| # | Design flaw | Symptoms (brief item · audit) |
| --- | --- | --- |
| **RC-1** | **No single-next-action rule.** 16 code paths open tasks with 4 different closing rules (r2: CRM enrolment start and the test-result trigger were missing from r1's count). « At least one open task » is the only server rule; D6 (consolidation) was deferred in October. | 2, 12b, the « Toutes les prochaines actions (2) » count, duplicate visits, the growing overdue list, NF-3 |
| **RC-2** | **« Next action » and « schedule » are computed in five places,** and tests live apart from appointments. Card and drawer take the earliest task; Tâches, Today and the calendar list every task; the pop-up re-reads the earliest. There are no time rules on outcomes. | 2, 16a–d, « rescheduling ignored », NF-5, NF-6, NF-11, NF-12, NF-14 |
| **RC-3** | **The UI is organised around commands, not around what happened.** Four dialogs log the same exchange, a date is forced after almost every action, there are success pop-ups, and the walk-in path is hidden. | 6, 10, 11, 12b, « will come later » prospects going overdue |
| **RC-4** | **Ownership is optional and copied, not derived.** New prospects have no owner, a task copies the owner once when created, and « Tâches » filters on the task assignee. | 1a–c, invariant 10 |
| **RC-5** | **No shared identity layer.** Phone normalisation exists only in the CRM and returns NULL instead of refusing. Students, receipts and adults store free text. Every search box has its own rule, duplicate checks come after creation (or never), and there is no edit, no merge, no sibling link and no CRM ↔ student lookup. | 3, 4, 5, 6, 12a, 12c, NF-8, NF-9, NF-10 |
| **RC-6** | **No shared vocabularies.** Programme (3 vocabularies + free text), origin (free text vs 5 values), close reasons (two lists), levels (36 options), English codes shown raw. | 13, 14, 16e, 16f, 19, 20b, 23c, 23d, 25e, 25f, NF-15 |
| **RC-7** | **Two payment paths with different rules and different balance reads.** | 7, 8, 9, 20a, 20c, 20d, NF-4 |
| **RC-8** | **History records system events, not user actions.** One action writes up to seven rows, the note is copied onto several of them, and the actor fallback hides missing names. | 15a–c, invariant 8 |
| **RC-9** | **No single source of hours.** Only calling windows exist; visits and tests are unchecked; presets land on window openings while agreed times are refused. | 17a–c, invariant 4 |
| **RC-10** | **The client defeats or hides server guards.** It adopts the new version after a conflict, does no pre-check, leaves stale errors, has no dirty-form guard, uses native validation, and creates a fresh key per click in two places. | 18, 25a–d, NF-1, NF-2 (test edits only), NF-7, NF-13, invariant 15 |
| **RC-11** | **Students, groups and attendance are written by table writes or thin commands without business rules.** | 21, 22, 23b, NF-17 |
| **RC-12** | **Role surface doesn't match the command surface.** The receptionist group command accepts « Online ». | 24a, NF-16 |

The design below fixes each root cause once. Patching symptoms one at a time is a non-goal.

## 2a. Approved rules this plan amends or must keep

Approving this plan approves the amendments marked « amended »; the ones marked « OD » wait for your answer.

| Approved rule | Where | What this plan does |
| --- | --- | --- |
| « At least one open task » for an active prospect; several allowed | [ADR-001](../decisions/ADR-001-crm-lifecycle.md), §1 of the audit | **Amended** by ADR-019: exactly one (OD-1 = A) or at most one (OD-1 = B). |
| An explicit conversation decision replaces only callback and WhatsApp follow-ups; visits, tests, enrolment and other operational tasks are **kept** (RCC-A1) | [PRODUCT_RULES](../../ai/PRODUCT_RULES.md#commercial-lifecycle-and-follow-up), « explicit conversation decision » | **OD-18.** With one action, keeping both is impossible: either a new action may replace an appointment after the form shows « Remplace : Rendez-vous … » (A), or an appointment and an enrolment action can only be rescheduled, cancelled or given an outcome, never replaced by a call or message (B). |
| D6, the deferred consolidation, covered ordinary communication follow-ups only | [OWNER_DECISIONS](../../ai/OWNER_DECISIONS.md) D6 | **Amended:** this plan consolidates every next action, operational ones included. |
| « Five failures stop automatic sequence scheduling; never automatically Lost » | [PRODUCT_RULES](../../ai/PRODUCT_RULES.md#commercial-lifecycle-and-follow-up) | **OD-17.** Kept as is under A: after five failures the next action is « En attente » with **no** relance date, so nothing is scheduled automatically. B adds a relance date. |
| Conversion comes only from `evaluate_conversion` on a linked Confirmed or Validated enrollment (EAP decision 4, ADR-015) | [enrollment-at-payment plan](enrollment-at-payment.md), [ADR-015](../decisions/ADR-015-enrollment-at-payment.md) | **Kept.** Only its task-closing statement changes, from a direct update to `set_next_action(null)`, with the same effect (every open action cancelled, « Inscription confirmée »). It gains no other step. A test compares conversion results before and after. |
| Meta lifecycle event types; first-touch immutability; the lifecycle barrier | [ADR-004](../decisions/ADR-004-meta-lifecycle-feedback.md), [PRODUCT_RULES](../../ai/PRODUCT_RULES.md) | **Kept**, copied verbatim (§4.2); a stop condition if any lifecycle test needs a new expectation. |
| An enrollment's student never changes (`check_enrollment_student_sync`, `120:308`); financial rows are append-only | [ADR-010](../decisions/ADR-010-group-membership-from-enrollments.md), [ADR-012](../decisions/ADR-012-gap-free-receipt-numbering.md) | **Kept.** Student merge moves no enrollment, charge or receipt (§5.3). |
| Receptionist permissions as approved in RPW-r2 | [receptionist permissions plan, PR #203](https://github.com/elforssa/english-hills-admin/pull/203) (not merged yet) | **Kept** unless OD-9 = B. |

## 3. Scope and non-goals

**In scope:** every P0, P1 and P2 item of the brief, NF-1–NF-17, and the 15 invariants, delivered as releases A (next action), B (people and vocabularies) and C (desk forms, finance and academics).

**Out of scope (non-goals):**
- Changing receipt numbering or deleting any financial row.
- A new enrollment status without OD-2 = B.
- The Meta lifecycle activation, H3/H4, and online lessons and rooms.
- Teacher portal and payroll.
- A WhatsApp integration, a generic workflow builder, or calendar sync.
- Changing RPW-r2's permission matrix (beyond NF-16 if OD-9 = A).

## 4. Target design — next action (release A)

### 4.1 Data model

`crm_tasks` stays the table of next actions; each row is one next action, open or finished (history). Changes in M-A1:

| Change | Purpose |
| --- | --- |
| `task_type` adds `awaiting_prospect` (« En attente du prospect ») | the waiting state is a next action, not a status ([PRODUCT_RULES](../../ai/PRODUCT_RULES.md#commercial-lifecycle-and-follow-up): « En réflexion » is never a stage) |
| `due_at` nullable **only** for `awaiting_prospect` (`check (due_at is not null or task_type='awaiting_prospect')`) | « relancer le… » is optional |
| `outcome_code text check in ('came_enrolled','came_will_return','came_not_interested','no_show')` + `outcome_at` | structured appointment results |
| `supersedes_task_id` (exists) set on every replacement; `replaced_reason text` | « Remplace : … » and history |
| `center_visit` becomes « Rendez-vous au centre »; `placement_test_id` (exists) links its optional level test. « Finaliser l'inscription » (`enrollment_followup`) carries, in the same column, the planned test kept at enrolment start (*amended 2026-11-22*, [implementation record](#implementation-record)) | one appointment, one calendar event; a kept test always has its action |
| `placement_tests.status` adds `Annulé`, `Absent`; adds `cancelled_at`, `cancelled_by`, `cancel_reason`. A prospect's test that has left `Planifié` never returns to it, whatever the path (trigger `placement_tests_no_replan`, M-A1; students' own tests unchanged; only `d1_revert` may restore a test D1 cancelled) (*amended 2026-11-22*) | cancellation and no-show; a new date is a new booking |
| `crm_followup_policies` adds `opening_hours jsonb` (NULL means the same as `weekly_hours`); `date_exceptions` (exists, today always `[]`) holds closed dates and holidays | one source of hours, one set (OD-3 = B: `opening_hours` stays NULL) |
| `crm_activities` adds `command_key text` and `is_primary boolean not null default false` (index `(lead_id, command_key)`) | one history entry per user action (§4.7) |
| `crm_leads.owner_id` gets defaults through the service (no column change); new setting row `crm_reception_default_owner` in an existing settings table or a new `crm_settings` row (implementer chooses the existing table if one fits) | ownership (§4.6) |
| `crm_data_step_journal(step text, entity text, entity_id uuid, before jsonb, after jsonb, run_at timestamptz, run_by uuid)` | journal of D1 and later steps, readable by the director |

M-A2, only after data step D1's post-checks are all 0 (§10: Q04, Q05 zero-action count, Q07 as amended 2026-11-23, Q29):

- `create unique index crm_tasks_one_open_per_lead on crm_tasks(lead_id) where status='open'`. A unique index can't be deferred, so `set_next_action` always closes the current action **before** inserting the new one, in the same transaction.
- Deferred constraint triggers `crm_next_action_presence` (`after insert or update on crm_leads`, `after insert or update or delete on crm_tasks`, `initially deferred`), checking the touched lead at commit:

  | Lead state | Open actions allowed at commit |
  | --- | --- |
  | NEW, CONTACTING, ENGAGED, QUALIFIED, not merged | exactly 1 (OD-1 = A) or at most 1 (OD-1 = B) |
  | LOST, NOT_QUALIFIED | 0 |
  | CONVERTED | 0 (conversion closes them, as today) |
  | merged (`merged_into_lead_id` set), any status | 0 (the merge closes them) |

- A deferred trigger on `placement_tests`: at commit, a `Planifié` test of a LOST, NOT_QUALIFIED or merged lead is refused, and a `Planifié` CRM test of an active lead must be the `placement_test_id` of that lead's open appointment **or of its open enrolment action (« Finaliser l'inscription »), and only those** (*amended 2026-11-22*, owner decision, [implementation record](#implementation-record)).

### 4.2 The single writer

`crm_security.set_next_action(l crm_leads, spec jsonb, cause text, source text) returns uuid`, not granted to any role, is the **only** code that opens or closes an open `crm_tasks` row. It:

1. Requires the caller to hold the lead row lock (callers already `select … for update`).
2. Validates `spec` against the date rule (§4.4) and the hours (§4.5), and checks overlap for the person (invariant 3: lock the lead row and, when `student_id` is set, an advisory lock on the student).
3. Applies the replacement. If an open action exists:
   - **System steps never replace a kept action.** This **extends** the live rule rather than matching it: today a failed call cancels only `first_contact` and `contact_attempt` tasks (`cancel_tasks(…, attempts_only)`, `080:135`, called at `125:866`), but it still completes the task it was logged against (`125:864`) and adds the next slot beside whatever else is open. With one action, two things are new: a failed call logged against a kept action's own id records the attempt **without completing** that action, and no slot is created next to it. A spec the system derives from a call result (the next cadence slot, or « En attente » after five failures) replaces the current action only when that action is a call: `first_contact`, `contact_attempt`, a `callback`, or `awaiting_prospect`. When the current action is anything else (a « Rendez-vous au centre », « Finaliser l'inscription » or another enrolment action, « À faire par nous », « Proposer l'inscription »), the call is recorded, the action is **kept** and no slot is created. Only an explicit user choice in « Changer » or « Noter un échange », with « Remplace : … » shown, may replace a kept action, and only as OD-18 allows.
   - **Same appointment kept:** when `spec` is an appointment and the current action is an appointment, and `spec.keep_existing` is set, it returns the current id (« qualifier avec un rendez-vous existant le réutilise »).
   - **Outcome recorded:** when the cause is an outcome or a call result, it finishes the current action as completed.
   - **Anything else:** it cancels the current action with `replaced_reason`.
   It then inserts the new row with `supersedes_task_id`. A `spec` of `null` means « no next action » and is accepted only from three callers: closure, conversion, and data step D1 for closed, converted or merged prospects (rule d, §10).
4. Cancels the linked test (`Annulé`) when an appointment with a test is replaced or closed, **except a test still linked to the action that stays open**. A rescheduled appointment moves its test.
5. Sets `assigned_to` to the lead owner (§4.6).
6. Writes no history line of its own; the calling command writes the primary activity (§4.7). It returns the new task id.

**D1 mode** (r4; used only by `crm_security.d1_apply`, under the transaction-local flag `eh.crm_data_step = 'd1'`, and removed by M-A2 with the D1 functions). The first two specs exist only in this mode; the third is the ordinary one:

- **`{"d1": "keep", "keep_task_id": X}`** (rule a, duplicates; X is chosen by rule a's order in §10): keeps open action X unchanged (no insert, no new `due_at`) and cancels **every other** open action of the prospect with « Doublon de prochaine action (fusion D1) ». A test linked to X, or linked to any cancelled duplicate while X is linked to the same test, is **never** cancelled: step 4 applies only to a test that no open action still points to. If X isn't an open action of that prospect, the call raises.
- **`{"d1": "create", "spec": …}`** (rules b and c): the ordinary replacement of step 3, with the « future » and `assert_in_hours` checks skipped for this transaction only. Each row created this way is journalled « hors règles (D1) » in `crm_data_step_journal`.
- **`null`** (rule d): the ordinary « no next action » path, as for closure.

Because `d1_apply` writes only through these calls, the writer inventory needs no exception for it (the one exception stays `d1_revert`, §4.2 below).

Every path uses it:

| Path | Before | After |
| --- | --- | --- |
| manual create, intake (`create_manual_lead`, `accept_external_submission`) | insert `first_contact` | `set_next_action(first_contact)`; for walk-in and inbound call, the exchange's own next action (§4.8) |
| call results (`record_call_outcome`) | finish the task called for, cancel only call slots (`080:135`), insert next slot; a visit, test, enrolment or our-step task survives | if the current action is a call (`first_contact`, `contact_attempt`, `callback`, `awaiting_prospect`): `set_next_action(next slot)`, and after 5 failures « En attente » without relance date (OD-17). Otherwise the attempt is recorded and the current action is kept, even when the call was logged against its id (step 3; an extension of `080:135`) |
| conversation, decision, qualify, schedule, reschedule, complete, cancel, reopen | §1 of the audit | `set_next_action(spec)` |
| test booking and edits | insert test, close confirm tasks | through the appointment (§4.3) |
| close | `cancel_tasks` | `set_next_action(null)` + cancel planned tests |
| CRM enrolment start (`public.crm_start_enrollment`, `127:403`; also called by `crm_enroll_and_collect`, `127:641`, before the payment) | inserts « Finaliser l'inscription » next to the current action; keeps an existing one | `set_next_action(enrollment_followup)` replaces the current action; an open enrolment follow-up is kept, as today. When `crm_enroll_and_collect` takes a payment, conversion in the same transaction then leaves no action. |
| test result entered (trigger `crm_security.placement_milestones`, `083:74`; fires on **every** insert or update of a CRM test, whether from the CRM, Admissions or a teacher) | inserts `post_test_followup` next to the current action | If the current action is the appointment linked to this test, or a system reminder: `set_next_action(« Proposer l'inscription », our step, post-test SLA)`; the appointment is finished as completed with no outcome code. If it is « En attente », an agreed callback or appointment still to come, or an enrolment action: unchanged. The trigger keeps its lead lock, its milestone events and its version bump. |
| conversion (`crm_security.evaluate_conversion`, `120:1319`) | cancels all | `set_next_action(null)` in place of the direct update, with the same effect (§2a); nothing else changes |

**Writer inventory (complete at the baseline).** Every function whose latest definition opens or closes a `crm_tasks` row, found by scanning the latest definition of every function in `supabase/migrations` for `insert into public.crm_tasks`, a status update of `crm_tasks`, and calls to `new_task`, `finish_task` and `cancel_tasks`. No browser code writes the table.

| Function (latest definition) | Today | After A1 |
| --- | --- | --- |
| `crm_security.command` (`125:694`) | `new_task`, `finish_task`, `cancel_tasks` | calls `set_next_action` |
| `crm_security.accept_external_submission` (`125:1217`) | direct insert | calls `set_next_action` |
| `public.crm_record_conversation_decision` (`119:1203`) | `finish_task` | calls `set_next_action` |
| `public.crm_book_placement_test` (`119:708`) | `finish_task` | routed through the appointment |
| `public.crm_start_enrollment` (`127:403`) | `new_task`, `finish_task` | calls `set_next_action` |
| `crm_security.placement_milestones` (`083:74`, trigger) | `new_task` | calls `set_next_action` |
| `crm_security.evaluate_conversion` (`120:1319`) | status update | calls `set_next_action(null)` |
| `crm_security.new_task` (`111:39`) | insert primitive | called only by `set_next_action` |
| `crm_security.finish_task` (`119:372`), `crm_security.cancel_tasks` (`080:135`) | close primitives | called only by `set_next_action` |

`public.crm_update_placement_test` (`119:1626`) writes no task itself; its updates reach the trigger above, and it gains the prospect `expected_version` check (NF-2).

**Acceptance test of the inventory:** `scripts/test-crm-task-writers.sql` re-runs the same scan against `pg_proc` on the local stack after A1 and fails if any function other than `set_next_action` (and the three primitives it calls) inserts, closes or reopens a `crm_tasks` row, or if a primitive has another caller. A function added later that writes tasks fails CI until it goes through the single writer.

**One time-boxed exception:** `crm_security.d1_revert` (added in PR A1, dropped by M-A2 in PR A2) cancels and reopens rows directly, because restoring the exact rows D1 cancelled is not a « next action » operation. The test lists it by name with the PR that removes it, and after A2 the test fails if it still exists. `d1_plan` only reads and `d1_apply` writes through `set_next_action`, so neither needs an exception.

Each body is rebuilt from the latest definition named in the table, never from an earlier migration.

The lifecycle barrier, pre-identity keys and pending-stop handoff are copied verbatim (as migration 103 re-created them; build on that live body, not on 094). Event types read by the Meta lifecycle (`lead_created`, `lead_engaged`, `lead_qualified`, `lead_lost`, `lead_not_qualified`, `lead_reopened`, conversion) are unchanged.

### 4.3 Public commands (release A)

All take `(p_request_key uuid, p_data jsonb)` with `lead_id` and `expected_version`. They replay through `crm_command_requests`, raise `PT409` on a stale version ([ADR-009](../decisions/ADR-009-conflicts-never-retryable.md)), and return the lead with its single next action from `crm_security.next_action(lead)`.

| Command | Replaces | Payload essentials |
| --- | --- | --- |
| `crm_log_exchange` | `crm_record_call_outcome`, `crm_record_whatsapp`, `crm_record_conversation`, `crm_record_conversation_decision`, `crm_qualify_lead`, `crm_add_note` | `channel` (phone, whatsapp, in_person, other); `result` (`no_answer`, `busy`, `declined`, `unreachable`, `wrong_number`, `spoke`, `whatsapp_sent`, `note`); `note`; `next` = `keep` \| next-action spec \| `close {reason, note}` \| `enrol`; `corrected_phone` for `wrong_number`; `real_attempt_override` (OD-14) |
| `crm_change_next_action` | `crm_schedule_task` (both forms), `crm_cancel_task`, `crm_complete_task` | `expected_action_id` (the action the user saw); `next` = spec \| `close {…}` |
| `crm_record_appointment_outcome` | free-text completion of a visit | `action_id`, `outcome_code`, follow-up spec or close reason; refused before the appointment's start |
| `crm_close_prospect` / `crm_reopen_prospect` | `crm_close_lost`, `crm_close_not_qualified`, `crm_reopen_lead` | one close-reason list (§5.4); reopen requires a next action (any kind, « En attente » included) |
| `crm_get_centre_hours` (read) | — | calling and opening hours, closed dates, minimum gap; shown in forms and used by the time pickers |
| `crm_check_action` (read) | — | pre-checks for a lead and an intended action (3-hour gap, hours, an existing appointment) **before** the form opens (invariant 15) |

Old wrappers stay executable after M-A1, with bodies routed through the new core so an old browser tab cannot create a second action. M-A2 revokes them from `authenticated`.

Qualification is implied (OD-11). An exchange with `result=spoke` whose next action is an appointment (step `center_visit`, or `placement_test` when the test option is ticked), « Inscrire maintenant » (`enrollment`) or a QUALIFIED-only spec moves the lead to QUALIFIED with that step. The `lead_qualified` event is written once.

### 4.4 When a date is required

| Next action (French label) | `task_type` / `schedule_kind` | Date | Time | Hours |
| --- | --- | --- | --- | --- |
| « Appel de suivi » (cadence attempt) | `contact_attempt` | server | server | calling, moved to the next window |
| « Rappel convenu » | `callback` / appointment | **required** | **required** | calling, **refused** outside |
| « À faire par nous » (envoyer le prix, confirmer un groupe…) | `enrollment_followup` or `whatsapp_followup` / reminder | **required** (presets allowed) | server | calling, moved |
| « Rendez-vous au centre » (+ option test) | `center_visit` / appointment | **required** | **required** | opening, **refused** outside |
| « En attente du prospect » | `awaiting_prospect` | optional « relancer le » (default today + 5 days, OD-5) | none | — |
| Note | — | — | — | does not touch the next action |

Agreed times are never moved; system times always come from `next_window` over the same hours. So the system never creates a time it would refuse from a user (invariant 4).

### 4.5 Hours

One versioned source in `crm_followup_policies`:
- `weekly_hours` = calling hours
- `opening_hours` = desk hours for appointments and tests (OD-3)
- `date_exceptions` = closed dates.

**Which version applies.** Today every prospect stays tied to the version it was created with (`crm_leads.followup_policy_id`, set once and never updated), and versions are immutable, so a newly published version would never reach existing prospects. The plan splits the two uses:

- **Hours** (`weekly_hours`, `opening_hours`, `date_exceptions`) always come from the **current published version**: `crm_security.current_policy_id()`, the version with the latest `effective_from` not after now and not retired. Forms, the time picker, `crm_get_centre_hours`, `crm_check_action` and every server check read this same version, so they can't disagree.
- **Cadence** (attempt offsets, SLAs, minimum gap) stays with the prospect's pinned version, as today, so a running call sequence keeps its rhythm.
- `crm_security.next_window`, `attempt_due` and `placement_followup_due` take the hours version as an explicit argument. Every rewritten caller passes `current_policy_id()` for hours and the pinned version for cadence.

`crm_security.assert_in_hours(kind, ts)` checks against the current version and is used by every writer, including test booking, attendance (class days) and the Admissions form. The director publishes a new version from a new « Horaires du centre » card on `/settings`, through the existing `public.crm_create_followup_policy` command (`080:442`) extended with `opening_hours` and `date_exceptions`. Forms show the hours next to the picker, and the picker offers only valid slots. Agreed times booked before a change of hours are kept and listed for the receptionist (« Hors des nouveaux horaires »), never moved. No hour value is invented by this plan: the owner supplies them (OD-3) and R0 reads the live versions (Q01).

**Tests:** `test-crm-next-action.sql` T4b publishes a new version and asserts that an existing prospect's next system time, its validation and `crm_get_centre_hours` all use the new hours while its cadence offsets don't change; the time-travel suite repeats it across a closed date.

### 4.6 Ownership

- **Manual prospects:** the owner is the creator.
- **Intake (Meta, website):** the owner is the director-chosen `crm_reception_default_owner`, or NULL if none is set (OD-6).
- **The next action's assignee is the lead's owner.** It is re-derived whenever the owner changes: `reassign` with `owner_id` also updates the open action. Separate task delegation stays possible with `assigned_to` and is cleared when the action is replaced.
- **« Tâches » default:** mode `me_or_unassigned` (« Moi + non attribué »). The reset returns to it.
- **Invariant 10:** after D1 and the OD-6 backfill, every open task has an owner, or it is unassigned and visible in every receptionist's default view.

### 4.7 History

Every command writes **one primary activity** (`is_primary=true`) carrying:
- the note (once);
- `details.summary`: channel and result, and the next action before → after (« Rappel 24/11 10:00 → Rendez-vous 26/11 15:00 (avec test) ») including the « précisions ».

Secondary events (`task_created`, `task_cancelled`, `lead_engaged`…) keep being written for lifecycle and audit, with the same `command_key` and no body.

`crm_get_timeline` returns primary rows, and secondary rows only on « Détails ». The actor is `profiles.full_name`. Staff accounts without a name are fixed by the owner in Settings (Q27), and the Settings form makes the name required for staff. The client's name-masking regex (`LeadDetailSheet.jsx:28`) is removed.

### 4.8 Target state machine

Statuses are unchanged. Every transition sets **exactly one** next action for an active lead, and none for a closed one.

| From | Event (command) | To | Next action after | Tests |
| --- | --- | --- | --- | --- |
| — | create, origin phone or web (`crm_create_prospect`, intake) | NEW | « Premier contact » (cadence 1) | — |
| — | create, origin walk-in or inbound call, with exchange | ENGAGED, or QUALIFIED if an appointment or « Inscrire » | the exchange's next action; a walk-in requires the in-person exchange (no « Premier contact »), and a walk-in who declines on the spot is created, then closed (*owner acceptance 2026-11-22*) | if test option ticked |
| NEW, CONTACTING | `no_answer`, `busy`, `declined`, `unreachable` | CONTACTING | next cadence slot; after 5: « En attente », no relance date (OD-17) | — |
| ENGAGED, QUALIFIED | the same failed results (`125:843`) | same | if the current action is a call: next slot (after 5, « En attente »); if it is an appointment, an enrolment action or our step: **unchanged** | unchanged |
| active, not converted | « Inscrire maintenant » / enrolment start | QUALIFIED (step `enrollment`) | « Finaliser l'inscription » (an open one is kept); none once the payment converts | kept: « Finaliser l'inscription » carries it (`placement_test_id`); replacing or cancelling that action cancels the test (the existing clean-up); conversion keeps it (*amended 2026-11-22*) |
| active | `wrong_number` + corrected phone | same | cadence restarts (slot 1 of a new cycle) if the current action is a call; otherwise unchanged | — |
| active | `wrong_number` + close | NOT_QUALIFIED (`wrong_number`) | none | cancelled |
| NEW, CONTACTING, ENGAGED | `spoke` + callback, our step, waiting | ENGAGED | that action | — |
| active | `spoke` + appointment or « Inscrire » | QUALIFIED (step derived) | appointment (existing one reused) / « Finaliser l'inscription » (today) | test if ticked |
| active | `crm_change_next_action` | same | the new one (old one cancelled, « Remplacée »); replacing an appointment or enrolment action by a call or message follows OD-18; a **new** appointment only for a `QUALIFIED` prospect (otherwise booked through « Noter un échange » → « On a parlé », B1 design) | moved or cancelled with the appointment or enrolment action that carries it; enrolment action → enrolment action carries it |
| QUALIFIED | appointment outcome `came_will_return` | QUALIFIED | « En attente », relance J+5 (OD-5) | test result can be entered |
| QUALIFIED | `came_not_interested` | LOST (reason required) | none | — |
| QUALIFIED | `no_show` | QUALIFIED | « Rappel » (reminder, tomorrow) or close | `Absent` |
| QUALIFIED | `came_enrolled` → payment | CONVERTED | none | kept (now a student test) |
| active | test result entered (after the test time) | same | unchanged if the current action is « En attente » or later; otherwise « Proposer l'inscription » (our step, post-test SLA) | `Résultat saisi` |
| active | close (any reason) | LOST / NOT_QUALIFIED | none | `Annulé` |
| LOST, NOT_QUALIFIED | reopen | CONTACTING or ENGAGED (as today) | required: a call, message, our step or enrolment action; **no appointment** — it follows « Changer »: the first appointment of an unqualified prospect is booked through the exchange (*owner decision 3, 2026-11-22*) | — |

No transition creates without closing, and none closes without either creating or ending the prospect. The property tests (§9) assert this. A prospect's test that has left `Planifié` (`Annulé`, `Absent`, `Passé`, …) is never planned again by any path, one step or several; a new date is a new appointment (*owner decision 2, 2026-11-22*).

### 4.9 UI flow changes (release A)

- **Drawer:** one « Prochaine action » panel showing the action, its owner, « En retard » when overdue, and two buttons, « Noter un échange » and « Changer ». « Toutes les prochaines actions » disappears; after M-A2 it can't hold more than one. Call results are one-tap buttons (« Pas de réponse », « Occupé », « Refusé », « Injoignable », « Mauvais numéro », « On a parlé »). « Pas de réponse » is one tap and **saves immediately** (OD-20 = B, answered by the owner on 2026-11-21).
  - **No « Annuler », no hold, no server undo.** The toast confirms « Pas de réponse enregistré ». A mistaken result is corrected by a new, explicit exchange (« Noter un échange »), as today; the attempt history stays append-only, and attempt numbers, the failed-call count and the « Injoignable » rule are untouched (the attempt number is the schedule slot, `125:849`; attempt keys are unique per lead, cycle and number, `078:376`, `078:381`).
  - **Request keys stay stable, as today:** one key per opened form or per tap, reused for every retry of that same submission (network retry, double tap), so the server replays the first result and records one attempt. The button (« Pas de réponse », and each form's submit) is **disabled while its request is in flight**, and a retry after an uncertain failure **resends the first tap's payload** with its key rather than rebuilding it from the screen, as `CrmActionDialog` does today: it keeps the request in `request.current`, reuses it while the form's intent is unchanged and disables its fieldset while busy (`src/components/crm/CrmActionDialog.jsx:222-249`; `retryKey` at `src/lib/crm/presentation.mjs:224` is called there with `null`, so it does not reuse a key by itself). The one-tap button copies that request ref and lock (review note d). A changed payload is a new submission with a new key.
  - **Tests:** `test-reception-forms-browser.mjs` T7: the button is disabled while the request is in flight; a double tap on « Pas de réponse » sends one request with one key and leaves one attempt row; a retry after a simulated timeout sends the same key and the same payload; a network retry after commit replays the first result; a stale version is refused like any other action and the toast says « Ce prospect a été modifié, rechargez ». `test-crm-next-action.sql` T7b runs five failed calls and asserts five attempt rows numbered 1–5, the « En attente » after the fifth (OD-17), and that « Injoignable » is then accepted.
- **« Noter un échange »:** channel tabs (Téléphone, WhatsApp, Au centre, Autre); the result; when « On a parlé »: what was agreed (Rendez-vous au centre [☐ avec test], Rappel convenu, À faire par nous, En attente, Inscrire maintenant, Pas intéressé → why, Pas pour nous → why); note optional. The current action and « Remplace : … » are shown.
- **« Changer la prochaine action »:** the same picker, with « Remplace : Rappel 24/11 10:00 » and « Garder l'action actuelle » as the escape.
- **Appointment outcomes:** four buttons on the drawer, the Tâches row and the calendar event, enabled from the appointment's start time.
- **Lists:**
  - « Tâches » buckets: « En retard », « Aujourd'hui », « Demain », « À venir », « En attente » (with « à relancer » when the relance date has passed).
  - One row per lead; leads of one contact are grouped (« 2 apprenants »).
  - Overdue = open, not `awaiting_prospect`, `due_at < now`.
- **« Aujourd'hui »:** the same buckets from the same read.
- **Calendar:** one event per appointment (test badge), plus tests of existing students. Closed prospects are excluded, and completed appointments are shown when « Inclure terminés » is ticked.
- **No success pop-ups:** a toast plus the drawer refresh. A new prospect opens directly in the drawer.
- **Stale data:** on `PT409` the form keeps the input as a draft and shows « Ce prospect a été modifié, rechargez ». « Recharger » re-reads; the draft stays, but the save is re-enabled only after the user has seen the new « Remplace : … ». It never adopts the new version silently (NF-1).
- **Dirty forms:** Escape or a click outside on a changed form asks « Abandonner la saisie ? ». French validation messages via `setCustomValidity` or `noValidate` with our messages. Pluralisation helper `pluralFr()`.
- **Pre-checks:** `crm_check_action` runs when the dialog opens. The 3-hour rule is shown before filling (« Prochain essai possible à 14:20 »), with « Tentative réelle (hors délai) » (OD-14). An error clears when the selection changes.
- **Wording:** « parent » becomes « contact » or « prospect » in every CRM string (« Conversation avec le contact »).

## 5. Target design — people and vocabularies (release B)

### 5.1 Phones

- **One normaliser:**
  - SQL `public.phone_e164(raw text) returns text`: immutable; raises for non-phones in write paths through `public.require_phone`.
  - SQL `public.phone_key(raw text)`: national significant digits, i.e. the last 9 for Morocco, all digits for others.
  - SQL `public.phone_is_placeholder(e164)`.
  - JS mirror `src/lib/phone.mjs` (`toE164`, `phoneKey`, `isPlaceholder`, `formatPhoneFr` « 06 12 34 56 78 »).
  - Both are tested against one fixture file `scripts/fixtures/phone-cases.json`.
- **Fixes:** `212…` without « + » (NF-10) and placeholders (NF-9: treated as no phone).
- **Storage:** E.164 in `crm_contacts.phone_e164` and `whatsapp_e164` (raw kept), `students.telephone`, `authorized_adults.telephone`. A `before insert or update of telephone` trigger on students and authorized adults normalises and checks the value **only on insert or when the phone itself changes** (`tg_op = 'INSERT' or new.telephone is distinct from old.telephone`). It refuses an invalid or placeholder value (« Numéro invalide » / « Numéro fictif : laissez vide »). Teachers and profiles are out of scope.
  - **Why only on change:** the system updates student rows constantly without touching the phone (a payment sets `session_type`, `127:165`; the group copy is kept by trigger, `121:104`; archiving). A student whose stored number is bad must stay writable for all of these, before and after D3, including the numbers D3 can't fix.
  - **Test:** `scripts/test-phone.sql` P-SYS seeds students with an invalid, a placeholder and an unparseable phone, then runs a payment, a group placement, a group removal, an archive and a status change through the real commands: all succeed and the stored phone is unchanged. Editing the phone itself is refused until it is valid or empty.
- **Receipts are never rewritten:** search uses an expression index `(public.phone_key(telephone))`.
- **Write paths covered:** CRM create and edit, intake (an invalid phone becomes « absent » plus a review flag, never a refusal of the lead), StudentForm, CSV import (row error), « Nouvel apprenant » on the receipt, CRM enrolment (copies E.164 only), authorized adults.
- **Search:** every box (CRM, students list via `search_students_page` rewritten from 124, Annuaire, Nouveau reçu picker via a new RPC, Admissions picker, global search) matches `phone_key(stored)` containing `phone_key(query)` once the query has 6 or more digits (leading 0, +212 and 00212 stripped).

### 5.2 One people search and duplicates

- **`public.find_people(p_query text, p_phone text, p_name text, p_birth date)`** (staff roles) returns prospects (active and closed), contacts, students (active and archived, marked) and their links, ranked. It is used by:
  - a header search « Rechercher une personne » (receptionist, admin, director);
  - every create form before saving.
- **Duplicate gate on create:** `crm_create_prospect`, the student create paths and receipt « Nouvel apprenant » call `find_people` server-side. If a strong match exists (same phone key, or same normalised name tokens plus birth date), the command refuses with `PT409 people.possible_duplicate` and the matches. The user then chooses:
  - **« C'est cette personne »:** opens the existing record; for a student, « Nouvelle opportunité » on the existing student or contact;
  - **« Même famille, autre personne »:** a sibling link;
  - **« Personne différente »:** a decision is recorded and the create is resubmitted with `acknowledged_matches`.
- **`person_match_decisions`** `(kind_a, id_a, kind_b, id_b, decision in ('same_family','different_people'), decided_by, decided_at)` makes invariant 7 checkable (Q12 excludes decided pairs and leads of one contact). Shared phone alone never merges ([PRODUCT_RULES](../../ai/PRODUCT_RULES.md#people-opportunities-and-academics)).
- **CSV import:** a dry-run report lists matches. Rows are created only with an explicit per-row choice.

### 5.3 Prospect create and edit; siblings; merges

- **`crm_create_prospect`** replaces `crm_create_manual_lead`:
  - optional `contact_id` (« Ajouter un enfant »);
  - `same_person` (« C'est la même personne », ticked by default for adult programmes: the learner name is the contact name, `contact_kind='adult_learner'`);
  - catalogue `programme_code` and `origin_code` plus `referrer`;
  - an optional first exchange (walk-in or inbound call) with its next action, all in one transaction. A walk-in or inbound call never schedules « Premier contact ».
- **`crm_update_prospect`:** edits contact name, phone, WhatsApp, learner name, programme, origin (manual only, OD-10) and referrer. It is version-checked, writes one primary history entry « Fiche modifiée » with before → after for each field (phones masked in details), and refreshes duplicate candidates.
- **`crm_merge_prospects(source, target)`** (director, admin):
  - moves submissions, activities (with a `merged` activity), the open action (via `set_next_action` on the target, the source closed) and the placement link;
  - sets `merged_into_lead_id`;
  - refuses if both are CONVERTED with different enrollments.
  Contacts merge the same way (`merged_into_contact_id`).
- **`merge_students(source, target)`** (director, admin; OD-8 = A, « link, don't move »):
  - **Moves nothing that carries history.** An enrollment's student can never change (`check_enrollment_student_sync`, `120:308`), and charges, receipts, attendance and tests follow their enrollment, so all of them stay on the source id. No enrollment, charge, receipt, attendance or test row is updated.
  - **Re-points only links:** family and guardian links, authorized adults, and CRM prospects **without** an enrollment link. A prospect with `enrollment_id` set (every converted one) can't change its learner (`protect_enrollment_link`, `127:1150`), so it stays on the source and is read through the merge set below. Each change is journalled.
  - **Archives the source** with `merged_into_student_id` (new column) and excludes it from lists and search; opening it redirects to the target.
  - **Reads:** the target's file, finance, attendance, tests and groups read `student_id = any(public.student_merge_set(target))`, the target plus every source merged into it. The one-live-enrollment rule (ADR-010) is checked across that set.
  - **The source never holds a live enrollment.** Group membership needs a non-archived learner (ADR-010) and the learner status (`121:104`) counts the student's own enrollments, so archiving a source with a live enrollment would drop the learner from the group or show a wrong status. **« Live » means exactly the set of the one-live-enrollment index** `enrollments_one_active_programme_year` (`120:52-53`): any enrollment whose status is **not** `Rejected` or `Ended`, so `Trial` and `Submitted` count as live as well as `Confirmed` and `Validated`. The dialog therefore picks the direction: the student with live enrollments is the **target**. The merge is **refused** when both have live enrollments, or when both have a portal account ([ADR-011](../decisions/ADR-011-portal-access-model.md)); the dialog says which, and that case stays a manual decision (OD-8).
  - **Status and rosters** therefore come from the target's own enrollments, as today; the source's ended enrollments, charges and receipts show in the target's history and balance through the merge set.
  - **Undo:** `unmerge_student(source)` restores the journalled links and clears `merged_into_student_id`; nothing else needs restoring.
  - **Test:** `scripts/test-people-merge.sql` merges pairs with ended enrollments, charges, receipts and attendance on both sides and asserts that no row of `enrollments`, `charges`, `receipts`, `attendance` or `placement_tests` changed (row hashes before and after), that the target's balance equals the sum of both, and that unmerge restores the links. It also covers: a converted prospect on the source (left linked to the source, shown on the target, no guard error); a source holding the only live enrollment, run once each with a `Confirmed`, a `Trial`-only and a `Submitted` source (the dialog swaps the direction; the server refuses the unswapped call in all three); a source whose only enrollments are `Rejected` or `Ended` (merged as a source); live enrollments on both sides (refused); the target's group membership and learner status unchanged by the merge.

### 5.4 Catalogues

- **Programmes:**
  - **`programmes`** `(code pk = the existing session_type value, label_fr, audience in ('enfants','ados','adultes','tous'), crm_selectable, enrollable, active, sort_order)`, seeded with the 10 existing codes. Stored codes in finance and academic tables are unchanged, so no receipt or charge is rewritten.
  - **`programme_levels`** `(programme_code, level, min_age, max_age, sort_order)` replaces the 36-value list for pickers. It is checked against `operational_security.valid_session_level`, which stays the rule.
  - **`programme_prices`** `(programme_code, school_year, amount, label_fr, effective_from, created_by)`: director-edited, used as the default gross amount in both payment screens (still editable, with the discount rules unchanged). The owner supplies the values. *(B2: shipped empty; the director fills them in the catalogue — owner decision of 2026-11-26 replacing OD-16.)*
  - **`crm_leads.session_type`:** the 8-value check is replaced by an FK to `programmes`. `program_interest_text` stays as the form's answer but is no longer the programme. `evaluate_conversion` sets `session_type` to the enrollment's.
  - **JS:** `programCatalog.mjs` and `programmeLabel` read French labels from one module whose values are asserted equal to the seed by a test.
- **`acquisition_sources`** `(code, label_fr, channel in ('manual','meta','website'), requires_referrer)`: Instagram, Facebook, Meta (formulaire), Site web, Google, Recommandation (with « recommandé par »: free name or a linked student or prospect), Passage devant le centre, Appel entrant, Ancien élève, Autre.
  - `crm_leads.origin_code`, `referrer_text`, `referrer_student_id`, `referrer_lead_id`.
  - Meta and website leads get their code from the channel and keep their immutable first touch.
  - `students.origin_code` (FK) is backfilled from `referral_source`'s 5 values, copied from the lead on enrolment, and editable on the student. The finance breakdown (`get_referral_breakdown`) reads `origin_code`. `receipts.referral_source` snapshots are untouched.
- **Close reasons (one list):** Pas intéressé · Prix · Horaires · Localisation · Autre centre choisi · Projet reporté · Injoignable (needs 5 failed calls) · Mauvais numéro · Doublon · Âge ou programme non adapté · Invalide / indésirable · Hors périmètre · Autre. The status (LOST vs NOT_QUALIFIED) is derived from the reason. Two constraint values are added (`wrong_number`; `duplicate` is accepted for LOST too, via the derived mapping). « Pas intéressé » always asks why (price, schedule, location, other centre, postponed, other).
- **French labels everywhere:** statuses, programmes, receipts, the PDF body text (branding per OD-15), and server errors through `receiptPresentation` and `conflictErrors` mapping hints.

## 6. Target design — desk forms (release C)

### 6.1 One payment panel, one rule

- **`PaymentPanel`** (new, `src/components/finance/PaymentPanel.jsx`) is used by « Inscrire et encaisser » (lead and learner file) and by « Encaisser ».
- **One read RPC** `get_open_balances(student)` lists every live charge with a balance, linked or not, from `charge_balances`.
- **Default:** « Encaisser » opens on the oldest open balance when one exists, otherwise on « Nouvelle inscription ». A learner with an unlinked commitment of the same programme and year is offered « Encaisser sur cet engagement » in the wizard, so there is no second charge (NF-4). A server guard in `crm_enroll_and_collect` refuses a new tuition charge when an unlinked live charge of the same programme and year exists, unless « nouvelle session » is explicit.
- **Rule (OD-2):**
  - **A (recommended, keeps ADR-015):** both screens allow « Réserver sans paiement ». It creates the charge with a due date, linked to the lead, with no enrollment, no seat and no conversion. The prospect's next action becomes « Encaisser l'acompte » (our step, due on the due date).
  - **B:** a new seat-holding status (reopens ADR-015; Tier 3 finance and conversion; a new plan section).
- **Duplicate receipt:**
  - The browser check is replaced by an in-app panel showing the existing receipt (number, date, amount, charge) and two buttons, « C'est un autre paiement » and « Annuler ».
  - The rule: same learner, same amount, same day **and same charge**, or any receipt by the same staff for the same learner within 2 minutes. Equal instalments on other days, or on other charges, are not flagged.
  - The CRM wizard runs the same check.
  - Idempotency keys are unchanged, and the void page and intake review get stable keys per form opening.
- **Wizard:**
  - Step 1 is one click (« Nouvel apprenant » continues directly when there is no match).
  - Programme from the lead's catalogue code.
  - Level pre-filled from the test, and re-filled when the programme changes back.
  - All errors shown at once.
  - « La remise dépasse le prix » before submit.
- **Receipts list:** « Avec solde » filter, French labels, no repeated session or service.
- **Void flow:** director only, unchanged (OD-7).

### 6.2 Level tests

- **One booking path for prospects:** « Rendez-vous au centre » with the test option. Admissions « Planifier un test » uses `find_people`. A prospect is routed to the appointment command; an existing student uses `book_student_placement_test`, a new definer command with the same date, hours and overlap rules. Direct table writes from the browser are removed for staff: their RLS insert and update policies are replaced by commands.
- **Teachers keep their current access.** The teacher insert and update policies on `placement_tests` (`123:284-289`) are a teacher-role surface owned by the portal and permissions work, so this plan leaves them. Their writes are still covered by the database rules: the result-time trigger (no result before the test) and `placement_milestones` (which routes any follow-up through `set_next_action`) fire on every row, whoever writes it. Invariant 14's grant check lists them as the one known exception.
- **Rules:**
  - no level pre-filled;
  - « Annuler » (reason) and « Absent »;
  - result and score only after the test's start time (trigger, for CRM and non-CRM rows alike);
  - « Passé » is derived (shown when the time has passed), not chosen;
  - levels filtered by programme and age through `programme_levels`;
  - one `Planifié` test per person (lead or student).

### 6.3 Attendance

- **Structured class days on groups:** `groups.class_days smallint[]` (ISO weekdays), backfilled from `jours` by D7.
- **`save_attendance`** refuses dates in the future (business date) and days not in `class_days`. Closed dates from the hours source are refused unless the direction overrides.
- **Page defaults:** today, and the groups that meet today.
- **Untouched rows:** shown as « Non saisi » until « Tous présents » or an explicit mark. The counter counts what is on screen.

### 6.4 Students and groups

- **Birth date:** never after today, and at least 1 year ago.
- **Category vs level:** checked through `programme_levels` age bounds (trigger plus form).
- **Status « Prospect »:** displayed as « Sans inscription » (OD-12); the stored value is unchanged.
- **Inline « Catégorie » select:** removed from the list; edited in the file.
- **Merged lists:** « Annuaire » merges into « Liste des apprenants » (cards and table toggle); the `/students-directory` route redirects.
- **« Adultes autorisés au retrait »:** hidden when the programme audience is adults.
- **Translation:** « Enrolled » and other raw statuses are translated everywhere (parent portal, import).
- **Groups:** teacher and room are already editable; Q22 lists the groups to complete (owner action).

### 6.5 Role surface (OD-9)

- **A (recommended):** keep RPW-r2. Close NF-16 only:
  - `save_receptionist_group` refuses `Online` and `Online One-to-One`;
  - the « Nouveau groupe en ligne » button shows only with `canManageOnlineCourses`.
- **B:** hide « Cours en ligne », « Enseignants » and group creation from the receptionist. This reverses parts of RPW-r2 (approved 2026-11-21) and must be decided before PR #204 merges.

## 7. Invariants — test, SQL check, enforcement

The Q numbers refer to the [audit queries](../evidence/receptionist-workflow-audit-2026-11-21.md#7-read-only-production-queries). Each SQL check is re-run after each release (R-checks).

| # | Invariant | Automated test (file, written by the implementer) | SQL check | Enforcement point |
| --- | --- | --- | --- | --- |
| 1 | A prospect has at most one open next action (exactly one when active, OD-1) | `scripts/test-crm-next-action.sql` T1 (every command); `scripts/test-crm-next-action-enforced.sql` (every writer of the §4.2 inventory with the M-A2 index and triggers in place); `scripts/test-crm-next-action-upgrade.sql` (fixture → M-A1 → D1 → M-A2); `scripts/test-crm-task-writers.sql` (inventory); `scripts/test-crm-sequences.mjs` (property, after every step) | Q04, Q05, Q29, Q30 | DB: unique index + deferred presence trigger (M-A2); service: `set_next_action` |
| 2 | A closed prospect has no open action, appointment or planned test; an active prospect's planned test belongs to its open appointment or its open enrolment action, and only those (*amended 2026-11-22*) | T2 in the same suite; property test; `test-crm-next-action-enforced.sql` (a test booked then the prospect closed, a test left on a merged prospect); `test-crm-rcc-a2.sql` (enrolment action carries the kept test; replacing it or closing cancels the test); `test-crm-next-action-upgrade.sql` (D1 rule b links to an enrolment action) | Q07, Q29 (amended) | DB: deferred triggers (M-A2); service: close path, `set_next_action` |
| 3 | No two appointments or tests for one person overlap | T3; property test with sibling and student cases | Q08 | service: `set_next_action` and test commands under lead and student locks |
| 4 | Every scheduled item is within hours; the system never creates what it would refuse | T4: every system-generated time passes `assert_in_hours`; fuzz of presets × policies | Q09 | service: `assert_in_hours` in every writer; UI: slot picker |
| 5 | No result, « Passé » or « done » in the future | T5; `scripts/test-placement-rules.sql`; `scripts/test-attendance-rules.sql` | Q10 | DB: placement trigger, attendance check; service: outcome before start refused |
| 6 | Phones stored in E.164; any format finds them in every box | `scripts/test-phone.mjs` + `scripts/test-phone.sql` (one fixture, with P-SYS: system updates of students with bad phones still succeed); `scripts/test-people-search-browser.mjs` (every search box × 6 formats) | Q11 | DB: normalising triggers and `require_phone`; search: `phone_key` everywhere |
| 7 | No two active people share a normalised phone without a confirmed link | `scripts/test-people-duplicates.sql` | Q12 (excluding decided pairs and same contact) | service: create gate + `person_match_decisions` |
| 8 | One user action = one history entry; note text once | T8: per `command_key` exactly one primary row and the note in one row | Q13 | service: primary activity; read: timeline grouping |
| 9 | Card, drawer, list, Tâches, calendar show the same next action | `scripts/test-crm-next-action-views.sql` (compares the five read functions for 50 generated leads) + browser assertion in day scripts | Q04 (by construction after M-A2) | read: every reader calls `crm_security.next_action(lead)` |
| 10 | Every open task has an owner and appears in someone's default view | T10 | Q14 | service: ownership derivation; UI: default `me_or_unassigned` |
| 11 | An enrolled prospect's programme is a catalogue code matching its enrollment | T11 in `scripts/test-crm-enrollment-programme.sql` | Q15 | DB: FK to `programmes`; service: conversion sets it |
| 12 | Open balance = price − discount − payments; both screens agree | `scripts/test-payment-panel.mjs` (unit) + `scripts/test-payment-screens-browser.mjs` (same learner in both screens) | Q16 | read: `get_open_balances` over `charge_balances`; service: no second charge |
| 13 | No receipt created twice by double submit or retry | `scripts/test-receipt-idempotency-local.mjs` (double click, retry, two tabs) | Q17 | DB: `financial_requests` idempotency (exists); UI: stable key per form opening, locked buttons |
| 14 | Each entity has one write service | `scripts/test-single-writer.mjs` (static scan: no browser `insert`/`update` on the listed tables) + `scripts/test-single-writer.sql` (grants: `authenticated` has no table write on them except the teacher insert and update policies on `placement_tests`, `123:284-289`, listed as the known exception; old wrappers revoked after M-A2) + `scripts/test-crm-task-writers.sql` | — | grants and RLS; the [entry-point matrix](../evidence/receptionist-workflow-audit-2026-11-21.md#4-entry-point-matrix) is re-generated in the release record |
| 15 | A refused action is refused before the form, or the form keeps the input | `scripts/test-reception-forms-browser.mjs` (3-hour gap, hours, stale version, network error) | — | UI: `crm_check_action` on open; drafts kept on error |

Write services per entity (invariant 14):

| Entity | Service |
| --- | --- |
| Prospect | `crm_create_prospect`, `crm_update_prospect`, `crm_merge_prospects`, intake through `accept_external_submission` |
| Next action, appointment | `set_next_action` behind the four commands of §4.3 |
| Level test | the appointment, or `book_student_placement_test` / `update_placement_test_result` |
| Student | `save_student` (RPW-r2's admin form path) + normalising triggers + `merge_students` |
| Enrollment | the existing EAP commands |
| Receipt | `create_charge_payment` (both screens) and the existing void and delete commands |
| Attendance | `save_attendance` |

## 8. Implementation plan

Order: R0 → A → B → C.

- **Design:** release A doesn't depend on #204: migrations 131–135 redefine none of the CRM functions A rewrites.
- **Merge order (OD-19 = A, recommended):** #204 merges first. A1 may be built earlier on its branch, but it merges only after #204, rebased on `main`, with its migrations numbered after #204's and a fresh CI run and exact-SHA review of the rebased head.
- **Shared files with #204:** `CrmWorkspace.jsx`, `GuideContent.jsx`, the RCC-B1 and work-calendar browser suites, and the upgrade-lane ceiling files. The later PR resolves them on rebase; its review checks that #204's behaviour on those files is unchanged.
- **B and C** start from `main` after #204 merges.

One branch and one PR per row unless noted; each PR is Tier 3 with full CI and a fresh independent exact-SHA review.

| Task / PR | Scope | Main files | Acceptance | Tests | Depends on | Risk |
| --- | --- | --- | --- | --- | --- | --- |
| **T-R0** (part of PR A1, first commit) | Validate Q01–Q30 against a clean local build at the ceiling; then the owner runs them on Production (R0) | `docs/…/evidence` (results, ids only) | every query runs locally; R0 results recorded | — | — | low |
| **PR A1 — next-action core** | §4 in full: M-A1 schema, `set_next_action`, `next_action`, `assert_in_hours`, four commands + two reads, every function of the §4.2 writer inventory rewritten (including `crm_start_enrollment` and the `placement_milestones` trigger), the hours version split (§4.5), intake ownership, the prospect version check on test edits, the one-tap call result that saves immediately (§4.9, OD-20), history grouping, readers rewritten (`opportunity_card`, `operational_card`, `crm_get_work_queue` per lead, `crm_get_today`, `crm_get_admissions_calendar` filtered), the hours card in Settings, the D1 function (not run), UI §4.9 | `supabase/migrations/NNN_crm_one_next_action.sql`; `src/components/crm/{ExchangeDialog,NextActionDialog,NextActionPanel,AppointmentOutcome}.jsx` (new); `LeadDetailSheet.jsx`, `WorkQueue.jsx`, `OpportunityCard.jsx`, `OpportunitiesList.jsx`, `AdmissionsCalendar.jsx`, `CrmWorkspace.jsx`; `CrmActionDialog.jsx` (reduced to close and reopen, or retired); `src/lib/crm/{presentation,queries}.mjs`; `src/lib/ui/pluralFr.mjs`; `src/app/(admin)/settings` | invariants 1–5, 8–10, 15 hold on the local stack for new data; old wrappers obey the single-action rule; day scripts 1, 6, 7, 10, 11 meet targets; day scripts 3 (7) and 8 (4, close) accepted at their A1 counts, their targets moved to B1 and B2 (owner, 2026-11-22, [implementation record](#implementation-record)) | new: `test-crm-next-action.sql`, `test-crm-task-writers.sql`, `test-crm-next-action-enforced.sql` (runs with M-A2 applied on top of A1 on the local stack), `test-crm-next-action-upgrade.sql`, `test-crm-next-action-local.mjs`, `test-crm-next-action-views.sql`, `test-crm-sequences.mjs` (fast-check; new devDependency under the audit policy), `test-crm-time-travel-local.mjs`, `test-crm-concurrency-local.mjs`, `test-reception-day-scripts-browser.mjs` (A scripts), `test-reception-forms-browser.mjs`; updated: `test:crm-opportunities*`, `test:crm-work-calendar*`, `test-crm-rcc-a1/a2/b1`, CRM phase suites, enrolment-at-payment suites (conversion results unchanged), placement suites, lifecycle suites (event types unchanged), upgrade-lane ceiling | R0; merges after #204 (OD-19) | **high** (core commands; Meta lifecycle bodies copied verbatim; a stop condition if any lifecycle test changes) |
| **D1** (operator) | Bring every existing prospect into the model (§10): one action each, appointments for planned tests, nothing left on closed prospects | wrapper SQL in the release record | dry run = approved counts; post-checks Q04, Q05 (zero-action active), Q07, Q29 all 0 | `test-crm-next-action-upgrade.sql`, then the wrapper rehearsed on a local copy at the ceiling | A1 applied | medium |
| **PR A2** | M-A2: unique index, presence triggers, revoke old wrappers | `NNN_crm_one_next_action_enforce.sql` | index valid; revoked functions refused for `authenticated`; nothing else changed; intake resubmission, reassignment, enrolment start and test result succeed on D1-processed prospects | `test-single-writer.sql`, `test-crm-next-action-enforced.sql`, `test-crm-next-action-upgrade.sql`, upgrade lane | D1 post-checks all 0 | medium |
| **PR B1 — people** | §5.1–5.3: phones, `find_people`, header search, create gate, sibling and same-person, prospect edit, wrong-number correction (completes A's « Mauvais numéro » with a corrected phone), merges, `person_match_decisions`, D3 and D5 functions (not run) | `NNN_people_identity.sql`; `src/lib/phone.mjs`; `scripts/fixtures/phone-cases.json`; `src/components/people/{PeopleSearch,DuplicateGate,MergeDialog}.jsx`; `StudentForm.jsx` (RPW-r2 version), `ReceiptForm.jsx`, students list and directory pages, `CrmEnrollmentDialog.jsx`, import page | invariants 6, 7 for new data; day scripts 4, 5; day script 3 ≤ 6 (« C'est la même personne »); day script 8 corrected in 3 (owner, 2026-11-22) | `test-phone.mjs/.sql` (with P-SYS), `test-people-duplicates.sql`, `test-people-search-browser.mjs`, `test-people-merge.sql` (no history row changes), day scripts B | #204 merged; A released | high (merges) |
| **PR B2 — catalogues** | §5.4: programmes, levels, prices, origins, close reasons, French labels; conversion writes programme and origin; D4 function (not run) | `NNN_catalogues.sql`; `src/lib/programCatalog.mjs`, `src/lib/ui/presentation.mjs`, `src/lib/crm/presentation.mjs`, receipt presentation and PDF, finance breakdown | invariant 11; no raw English code on staff screens (scan test); day script 8 closed in 2 (the close-reason list and the `wrong_number` constraint value, §5.4; owner, 2026-11-22) | `test-catalogues.sql`, `test-catalogue-labels.mjs` (JS = seed), `test-french-labels-browser.mjs` | B1 | medium |
| **D3 / D4 / D5** (operator) | phones; programme and origin mapping; approved student merges | release record | per §10 | rehearsed locally | B1 / B2 | medium |
| **PR C1 — payments** | §6.1 | `src/components/finance/PaymentPanel.jsx`; `CrmEnrollmentDialog.jsx`, `ReceiptForm.jsx`, receipts pages; `NNN_desk_payments.sql` (`get_open_balances`, the no-second-charge guard, the OD-2 option) | invariants 12, 13; day scripts 2, 9 | `test-payment-panel.mjs`, `test-payment-screens-browser.mjs`, `test-receipt-idempotency-local.mjs`, finance regression suites | A; OD-2 | **high** (finance) |
| **PR C2 — academics, students, small things** | §6.2–6.5, item 25 leftovers, mobile acceptance | `NNN_desk_academics.sql`; placement pages and modal, attendance page and `attendanceSession.mjs`, students pages, `Sidebar.jsx`, `roleAccess.mjs` (OD-9), online page button | invariant 5 (tests, attendance); NF-16 closed | `test-placement-rules.sql`, `test-attendance-rules.sql`, `test-student-rules.sql`, navigation and middleware suites, `test-mobile-reception-browser.mjs` (375 px) | B2; OD-9 | medium |
| **D6 / D7** (operator) | test-data clean-up; class days | release record | per §10 | rehearsed | C2 (D7); D6 any time after OD-13. *Owner decision 2026-11-26: D6's functions ship inside PR B2 (migration 140; [B2 record](#implementation-record-pr-b2-m-b2-migration-140)); D7 goes with C2* | low |

### Day scripts (Playwright, `scripts/test-reception-day-scripts-browser.mjs`)

Each script counts clicks and typed fields through a helper and fails above the target. « Today » is counted from the current code: clicks plus required fields, starting from the relevant list.

| # | Script | Today (from code) | Target |
| --- | --- | --- | --- |
| 0 | Unanswered call | 4 (Tâches: Résultat d'appel → Pas de réponse → Enregistrer → Terminé); 5 from the list | **≤ 2** (from the list: open → « Pas de réponse »; from Tâches: 1) |
| 1 | Inbound call wanting a test | ~21 in 4 forms (create 7, pop-up 1, conversation and qualify 6, Terminé 1, book test 5, save 1) | **≤ 8 in one form** |
| 2 | Walk-in who pays now | ~25 (create, conversation, wizard 2 steps, payment) | ≤ 12, one flow |
| 3 | Walk-in « reviendra après la paie » | ~15, with a forced date | ≤ 6, no date unless chosen |
| 4 | Mother with two children | ~20, two prospects flagged as duplicates after creation, two simultaneous calls | ≤ 10; one contact, two learners, one Tâches row |
| 5 | Current family calling about something else | ~4 plus the risk of creating a prospect (no phone search on students) | ≤ 3 via global search; no prospect created |
| 6 | No-show | 6, with free text and a forced date; the test can't be marked absent | 2 (« Pas venu » → confirm the proposed reminder) |
| 7 | Callback rescheduled twice, then cancelled | ~13; duplicates if « Planifier » is used | ≤ 9; never a second action |
| 8 | Wrong number | 5, and the number can't be fixed | 3 (corrected) or 2 (close) |
| 9 | Partial payment, then the balance | ~8 (pick the balance manually; possible confirm) | ≤ 4 (opens on the balance) |
| 10 | Prospect closed, then reopened | 3 + 5, then test booking refused (planned test left behind) | 3 + 3; booking works |
| 11 | Two staff on the same list | B's stale save succeeds on the second click | B is refused and reloads; the default views split the work |

Rows are numbered from 0; §8 refers to these numbers (B1: 4, 5; C1: 2, 9). Owner decision of 2026-11-22 ([implementation record](#implementation-record)): script 3 is accepted at 7 for A1 and its ≤ 6 target moves to B1; script 8 is accepted at 4 (close) for A1, its close-in-2 target moves to B2 and its corrected-in-3 target stays in B1.

## 9. Testing design (sections 4.4–4.6 of the brief)

- **Property-based sequences** (`scripts/test-crm-sequences.mjs`, fast-check):
  - Generate 2–6 actions per run from: create (phone, web, walk-in), each call result, note, change action (each kind), reschedule, cancel or « En attente », qualify via exchange, book appointment with or without test, appointment outcome (each), test result, close (each reason), reopen, enrol and pay, a stale second tab, and a double submit.
  - Execute them through the RPCs as a synthetic receptionist on the local stack.
  - After **every** step, run the invariant SQL checks 1–5, 8–10 and 15 and the cross-view comparison.
  - 200 runs in CI, seeds logged; a failing seed becomes a fixed regression case.
- **Time travel** (`scripts/test-crm-time-travel-local.mjs`): run the same sequences, then **age the fixture** (as `postgres`, test-only SQL `scripts/lib/age-crm-fixture.sql` shifting that lead's timestamps by −Δ) to « fin de journée », « lendemain 09:00 », « samedi », « dimanche » and a closed date from `date_exceptions`. Assert:
  - « En retard », « Aujourd'hui » and « À venir » contents;
  - « En attente » items are never overdue and appear in « à relancer » on their date;
  - system-made times fall inside hours;
  - agreed times are never moved.
  No clock override exists in application code.
- **Concurrency** (`scripts/test-crm-concurrency-local.mjs`): two sessions on one lead (A saves, B saves stale → `PT409`, no row changed); parallel distinct keys (one wins); the same key twice (one row, replayed result); a network retry after commit (replayed result); a double click in the browser (one request). It covers every write in the [entry-point matrix](../evidence/receptionist-workflow-audit-2026-11-21.md#4-entry-point-matrix), finance included.
- **Enforced writers** (`scripts/test-crm-next-action-enforced.sql`): with M-A2's index and triggers applied on top of A1, run every function of the §4.2 inventory on a prospect that already holds its one action: enrolment start, « Inscrire et encaisser » with and without payment, a test result saved through the CRM command, through an Admissions table update as staff and as a teacher, intake resubmission (Meta and website), reassignment, reopen and conversion. Each must succeed and leave exactly one action (or none when closed or converted).
- **Kept actions** (`scripts/test-crm-next-action.sql` T3c, r3, extended r4): on ENGAGED and QUALIFIED prospects whose current action is a « Rendez-vous au centre » with a test, « Finaliser l'inscription », or « À faire par nous », each failed result (« Pas de réponse », « Occupé », « Refusé », « Injoignable ») is sent twice: once without a task id, and once with the **kept action's own id** as `task_id`. Both record the attempt and assert that the action stays `open` (**not completed**, no `completion_activity_id`), with the same due time and the same linked test, and that no slot was created; on a prospect whose current action is a call, it moves to the next slot. The property test adds these states to its generator.
- **OD-18** (T3d), for the owner's split (A for appointments, B for enrolment actions). Appointments (A): « Changer » to a callback on an appointment is refused without the « Remplace » confirmation token and accepted with it, cancelling the test. Enrolment actions (B): « Changer » to a callback is refused until the enrolment action is rescheduled, cancelled or given an outcome. In both, a failed call never replaces them (T3c).
- **Upgrade** (`scripts/test-crm-next-action-upgrade.sql`): build a fixture at the baseline ceiling holding every shape D1 handles (duplicates, exact duplicates, a **shared-test duplicate** (two open actions linked to the same planned test, the kept one among them: after D1 the test must still be `Planifié` and linked to the kept action), a prospect after its 5th failed call, a prospect whose test was booked with no action left, a planned test next to another action, a **past appointment with a planned test next to a newer callback** (D1 keeps the appointment, cancels the callback, and the test is still `Planifié` and linked to the kept appointment), a closed prospect with a planned test, converted and merged prospects with open tasks), apply M-A1, run `d1_plan` (asserting its per-rule counts and its cancelled-test count, which must equal exactly the tests the fixture expects cancelled: those of its closed, converted and merged prospects and the past test of the next case, and no other), a **future appointment without a test next to a past appointment with a planned test** (rule a step 1 keeps the future appointment; the past test is cancelled and appears in `d1_plan`'s cancelled-test count and samples; review note a), `d1_apply`, then M-A2. Then run the enforced-writer cases on those prospects.
- **Replays of real histories:** for each lead from Q04 and Q06 (ids only), the Q23 output is compared with the [reconstructed sequences](../evidence/receptionist-workflow-audit-2026-11-21.md#6-replaying-the-reported-states). Every distinct sequence becomes a named regression case in `test-crm-next-action.sql` (« R-n: replay of lead #n of R0 », with no personal data) asserting the new design yields one action.

## 10. Migration and data plan

Every migration is forward-only, rehearsed on a private local stack at the ceiling with an upgrade-lane run, applied by the release operator through the guarded wrapper pattern (md5 preconditions on the functions it replaces, a `DRYRUN_OK` sentinel rehearsal, then commit), and needs the owner's approval. Data steps are journalled in `crm_data_step_journal`; each states its dry-run query, the counts expected from R0, the apply step and its rollback.

| Step | What | Dry run (read-only) | Expected (from R0) | Apply | Rollback | Approval |
| --- | --- | --- | --- | --- | --- | --- |
| R0 | Q01–Q30 | — | — | — | — | « approve R0 read-only » |
| M-A1 | schema, services, readers (§4) | function md5 guards | — | wrapper | restore the prior function bodies from the journal of the wrapper (the old bodies are kept in the migration's rollback file); new columns are additive | « approve M-A1 » |
| D1 | bring every existing prospect into the model | `select crm_security.d1_plan()` returns a count and 5 sample lead ids **per rule**, and separately the count and 5 samples (test id, lead id, rule) of **every planned test D1 would cancel under any rule**; that count is part of `expected_counts`. (a) **several open actions:** keep, in this order, the earliest future agreed appointment (`schedule_kind='appointment'`, `due_at > now()`), else an appointment linked to a **still-planned test** (past or future; the earliest test if several), else the most recently created, through `set_next_action` in D1 mode `keep` (§4.2): the others are cancelled « Doublon de prochaine action (fusion D1) », and a test linked to the kept action is never cancelled, even when a cancelled duplicate pointed to it too. (b) **planned CRM test of an active prospect without its appointment or enrolment action:** if the prospect has an open « Finaliser l'inscription », D1 **links the test to it and never replaces it** (D1 mode `link`; `d1_plan` reports these under `linked`; an enrolment action that already carries a planned test stops the run, hint `crm_d1.enrollment_test_taken`) (*amended 2026-11-22*); otherwise create the « Rendez-vous au centre » linked to the test at the test's time (even if past, so its outcome gets recorded); any other open action is replaced « Remplacée par le rendez-vous du test (D1) » and listed in the sample (`replaced`). (c) **active prospect with no open action:** after 5 failed calls, « En attente » with no relance date (OD-17); otherwise « En attente » with no relance date and a « À revoir (D1) » flag the receptionist sees in « En attente ». (d) **closed, converted or merged prospect** with open actions: cancelled « Prospect clôturé (D1) »; its planned tests → `Annulé`. | Q04, Q05, Q06, Q07, Q29, Q30 (owner's brief: 20 leads with 2+ actions, 9 with exact duplicates) | `select crm_security.d1_apply(expected_counts jsonb)`, which raises if any rule's count, or the cancelled-test count, differs from the approved dry run. It writes **only through `set_next_action`** in its D1 mode (§4.2: `keep` for rule a, `link` or `create` for rule b, `create` for rule c, `null` for rule d), so it needs no writer exception. `d1_apply` locks `crm_leads`, `crm_tasks` and `placement_tests` (share row exclusive) until commit: **run it outside reception hours**. Rule (b)'s appointments may be in the past or outside the new hours: `d1_apply` sets the transaction-local flag `eh.crm_data_step = 'd1'`, under which `set_next_action` skips the « future » and `assert_in_hours` checks for that transaction only, and each such row is journalled with « hors règles (D1) ». | `crm_security.d1_revert()`, **only before M-A2**, deletes nothing (`crm_activities` references tasks `on delete restrict`, `078:248`, and history is append-only): it **cancels** the actions D1 created (« Annulé (retour D1) ») and **reopens** the exact rows D1 cancelled (the `crm_tasks_terminal` check allows `open` with the cancellation fields cleared; the journal and a « Rouvert (retour D1) » activity keep the record), and **unlinks** the tests it linked to an enrolment action (the action's previous `placement_test_id` returns, *amended 2026-11-22*), only for leads whose version hasn't changed since; a test cancelled by D1 returns to `Planifié` only if its date hasn't passed, otherwise it stays `Annulé` and is listed for the receptionist (a closed prospect's test, or an active prospect's past test cancelled under rule a, review note a) | « approve D1 » with the per-rule counts and the cancelled-test count |
| M-A2 | index, triggers, revokes; drops `d1_plan`, `d1_apply`, `d1_revert` and the `eh.crm_data_step` bypass | just before: Q04 = 0, Q05 active prospects with 0 actions = 0, Q07 = 0 (closed, converted **and merged** prospects, r3; *amended 2026-11-23*: open actions on closed, converted or merged prospects, and planned tests on closed or merged ones — a converted prospect's kept planned test is legitimate under the 2026-11-22 decision « Conversion keeps the test » and is reported, not counted), Q29 = 0 (the wrapper re-checks them in the same transaction and aborts otherwise) | all 0 | wrapper | drop the index and triggers; re-grant the wrappers (the D1 functions are not restored: D1 can no longer be reverted after M-A2) | « approve M-A2 » |
| M-B1 | identity (§5.1–5.3) | md5 guards | — | wrapper | prior bodies; additive columns and tables | « approve M-B1 » |
| D3 | phones: students, authorized adults, contacts (`212…` without « + »); placeholders → NULL | `d3_plan()`: counts per category (E.164 already, no « + », no leading 0, separators, placeholder, unnormalisable) and 5 sample ids | Q11 (owner's brief: 181 students, 83 standard, 34 without « + », 29 without leading 0, 28 malformed) | `d3_apply(counts…)`; unnormalisable rows untouched and listed for manual correction | journal holds raw values: `d3_revert()` | « approve D3 with counts » |
| M-B2 | catalogues | — | — | wrapper | additive. The FK on `crm_leads.session_type` is dropped; the old 8-value check is restored **only after `d4_revert()`** (D4 may have written codes outside it), or else restored `not valid` so existing rows aren't rejected. The rollback file states both orders. | « approve M-B2 » |
| D4 | programme and origin mapping | Production free text never enters the repository. Q25 returns only an 8-character hash and a count per distinct value. The operator exports the distinct values to a **private** file outside the repository (as with release dumps); you and the operator fill the code for each value there. `d4_plan(mapping jsonb)` takes that mapping as `{hash: code}` and returns counts per code plus the hashes left unmapped | Q25 | `d4_apply(mapping jsonb, counts)`; unmapped values stay with `session_type` / `origin_code` NULL and are flagged. The release record keeps the mapping's hash and the counts, never the text | journal (`d4_revert()`) | « approve D4 » with the counts and the mapping hash |
| D5 | student merges | `d5_plan(pairs)`: for each owner-listed pair, what moves and any conflicts | Q28 list, reviewed by the owner | `merge_students` per pair, in one journalled transaction | `unmerge_student(source)` while nothing has changed since | « approve D5 pairs … » |
| M-C1 | desk payments and academics | md5 guards | — | wrapper | prior bodies | « approve M-C1 » |
| D6 | test data | `d6_plan()`: the Q24 ids + owner-supplied ids, classified: (a) no financial, CRM or attendance history → delete; (b) CRM rows → close NOT_QUALIFIED `invalid_spam` with a note and exclude from reports (append-only CRM history); (c) students with receipts → archive (`deleted_at`) and exclude; voided receipts 00459–00461 **stay** (gap-free numbering); test group: delete if empty, otherwise close. *Shipped in 140 (owner decision 2026-11-26) as `d6_plan(ids)`, `d6_apply(ids, counts)`, `d6_revert()`, not run; see the [B2 record](#implementation-record-pr-b2-m-b2-migration-140)* | Q24 | `d6_apply(ids, counts)` | journal; deletions only for class (a) after a private export | « approve D6 » (OD-13) |
| D7 | group class days | `d7_plan()`: `jours` free text → parsed days; unparseable listed | — | `d7_apply` | journal | « approve D7 » |

A fresh manual backup precedes every data step. Earlier release records note that dumps through a VPN fail; the release record states the backup's evidence or the owner's explicit acceptance of its absence.

## Owner decisions required

All twenty were answered by the owner on 2026-11-21; the answers and their effect are in the [approval record](#approval-record) below the table.

| # | Question | Options and consequences | Recommendation | Blocking |
| --- | --- | --- | --- | --- |
| OD-1 | One next action: « at most one », or « exactly one » for active prospects? | **A — exactly one** (« En attente » counts as one): every active card shows something, and the « no action » leak (Q05 = 0) is closed. **B — at most one:** prospects may have none and then fall into « attention » again. Both amend ADR-001's « at least one, several allowed » (§2a). | A | A1 |
| OD-2 | Hold a seat with a due date | **A:** « Réserver sans paiement » = charge with a due date linked to the prospect, no enrollment, no seat, no conversion (keeps ADR-015). **B:** a new seat-holding status that counts capacity (reverses ADR-015's « an enrollment exists only once it is paid »; new finance and conversion design). | A | C1 |
| OD-3 | Hours | Give calling hours and desk opening hours per weekday, plus closed dates. **A:** two sets (calling ≠ desk). **B:** one set for both. | A, with your values | A1 (values needed for R2) |
| OD-4 | Appointment length for the overlap rule | Visit 60 min and test 45 min, or your values | 60 / 45 | A1 |
| OD-5 | Default « relancer le » when a receptionist chooses « En attente » | 7 days (your brief), or another value | 7 days | A1. **Answered by the owner on 2026-11-21: 5 days.** |
| OD-6 | Owner of intake prospects, and the backfill | **A:** a « responsable par défaut » chosen by the direction; backfill existing unowned prospects to that person. **B:** unowned, visible to every receptionist (« Moi + non attribué »). | A | A1 (backfill in D1) |
| OD-7 | Who may void receipts | **A:** director only (today). **B:** director and admin. | A | — |
| OD-8 | Student merge and history | **A — link, don't move:** enrollments, charges, receipts, attendance, tests and converted prospects stay on the duplicate's id; the survivor's screens show both; only family, authorized-adult and unconverted CRM links move (§5.3). No history row changes, and the database rules « an enrollment's student never changes » (`120:308`) and « a CRM enrollment link never changes » (`127:1150`) stay. The survivor is always the one with live enrollments (status not `Rejected` or `Ended`, the index set of `120:52-53`, so `Trial` and `Submitted` included); refused when both have some. **B — move:** re-point enrollments together with their charges, receipts and attendance under a journalled exemption of that rule (financial and enrollment rows updated; needs its own finance architecture and an amendment of ADR-010 and ADR-012's spirit). | A | B1 |
| OD-9 | Item 24 vs RPW-r2 | **A:** keep RPW-r2; close only NF-16 (no online groups through the reception command; button hidden). **B:** hide « Cours en ligne », « Enseignants » and group creation (reverses RPW-r2 items approved today; decide before #204 merges). | A | C2; #204 |
| OD-10 | Editing origin | **A:** origin editable for manual prospects only; « recommandé par » editable for all; Meta and website first touch stays immutable (product rule). **B:** editable for all (needs an exception to the first-touch rule). | A | B2 |
| OD-11 | Qualification implied by booking an appointment or choosing « Inscrire maintenant » | **A:** implied (fewer clicks; « Qualifié » rises; the dormant Meta Qualified event would follow once activated). **B:** keep an explicit « Qualifier » step. | A | A1 |
| OD-12 | New label for the student status « Prospect » | « Sans inscription » / « Non inscrit » / « Contact » | « Sans inscription » | C2 |
| OD-13 | Test data | **A:** delete only records with no financial, CRM or attendance history; close (CRM) or archive (students) the rest; voided receipts stay. **B:** delete everything named (impossible for receipts and CRM history without breaking the immutability rules). | A | D6 |
| OD-14 | 3-hour rule | **A:** keep the server minimum; « Tentative réelle (hors délai) » records the attempt, counts it in the 5, and doesn't move the cadence earlier. **B:** no override. | A | A1 |
| OD-15 | Receipt and PDF branding text (« Language Center », « Learn Today, Lead Tomorrow ») | Keep (brand) or translate | Keep (brand), translate everything else | C1 |
| OD-16 | Programme prices | Provide the 2026/2027 price per programme for the catalogue (director-editable afterwards). **Replaced 2026-11-26:** B2 ships with no prices; the director fills them in the catalogue later; amounts are typed by hand until then ([decision](#owner-decisions-follow-ups-and-gates--2026-11-26); [B2 implementation record](#implementation-record-pr-b2-m-b2-migration-140)) | — | B2 (defaults only) |
| OD-17 | After five failed calls (PRODUCT_RULES: « five failures stop automatic sequence scheduling; never automatically Lost ») | **A:** the next action becomes « En attente » **with no relance date**: nothing is scheduled automatically, the prospect is never overdue, and it appears in « En attente » for a decision (call again, close). Keeps the rule. **B:** « En attente » with a relance date (OD-5): an automatic reminder, which amends the rule. | A | A1 (and D1 rule c) |
| OD-18 | Can a call or message replace an appointment or an enrolment action? (PRODUCT_RULES and RCC-A1 keep operational tasks when a follow-up is created; with one action both can't be kept) | **A:** yes, after the form shows « Remplace : Rendez-vous 26/11 15:00 (avec test) » and the user confirms; the appointment and its test are cancelled. Amends the rule. **B:** no: an appointment or enrolment action can only be rescheduled, cancelled or given an outcome; « Changer » for a call or message is offered only after that. Keeps the spirit of the rule, one more step for the receptionist. | B for enrolment actions, A for appointments | A1 |
| OD-19 | Merge order with PR #204 | **A:** #204 merges first; A1 rebases after it, numbers its migrations after 135 and gets a fresh CI run and review of the rebased head. **B:** A1 may merge first; #204 then renumbers its migrations above A1's and needs a fresh exact-SHA review. | A | A1 merge |
| OD-20 | Undo of « Pas de réponse » | **A:** a short hold with « Annuler » before the result is sent. **B:** save immediately, no « Annuler »; a mistake is corrected as a new exchange; request keys stay stable as today. | — | **Answered by the owner on 2026-11-21: B.** The owner gave it in a message to the architecture session on 2026-11-21; it is restated in the owner's approval of 2026-11-21 ([approval record](#approval-record)). Applied in RWR-r4 (§4.9). |

### Approval record

RWR-r1 (`6a43e75`), RWR-r2 (`d24d736`), RWR-r3 (`55351aa`) and RWR-r4 (`94a0c35`) were each independently reviewed CHANGES REQUIRED on 2026-11-21 and revised the same day in this PR. The owner records that the independent re-review of RWR-r5 at `824252a` returned READY FOR FINAL REVIEW, with four non-blocking notes.

**Owner approval (verbatim):**

> Owner approval (Maroine, 2026-11-21): I APPROVE plan revision RWR-r5 of docs/architecture/plans/receptionist-workflow.md at exact head 824252a359f99ad5d8077754c3504b2aa4eb07f2, following the independent re-review verdict READY FOR FINAL REVIEW on that head.
>
> Answers:
> - OD-1 A; OD-2 A; OD-7 A; OD-8 A; OD-9 A; OD-10 A; OD-11 A; OD-12 « Sans inscription »; OD-13 A; OD-14 A; OD-15 keep the brand text, translate everything else; OD-17 A; OD-18 as recommended (B for enrolment actions, A for appointments); OD-19 A.
> - OD-3 B: one set of hours for calling and the desk. I will give the weekday hours and closed dates before release A implementation starts; A1 must not start without them.
> - OD-4: visit 60 minutes, level test 45 minutes.
> - OD-5: 5 days (not 7).
> - OD-6 A: a default owner chosen by the direction. I will name the account before data step D1; D1 must not run without it.
> - OD-16: I will give the 2026/2027 programme prices before release B2.
> - OD-20 B, as I gave it earlier today: « Pas de réponse » saves immediately, no « Annuler », a mistake is corrected as a new exchange.
>
> The reviewer's four non-blocking notes on 824252a are recorded as follow-ups for the A1 implementation; they do not change the approved design.
>
> Record this verbatim in the plan's approval record and in docs/ai/OWNER_DECISIONS.md, update OD-5's value in the plan, and set ADR-019 to accepted. This approves the architecture only. It does not authorize implementation, migration numbers, the R0 Production queries, any data step, merge or release; each needs my separate approval. Docs-only commit to the same branch: commit, push, confirm CI is scheduled, hand off with the new head SHA. Do not merge.

**Approved answers:** OD-1 A, OD-2 A, OD-3 B, OD-4 60 / 45 minutes, OD-5 5 days, OD-6 A, OD-7 A, OD-8 A, OD-9 A, OD-10 A, OD-11 A, OD-12 « Sans inscription », OD-13 A, OD-14 A, OD-15 keep the brand text and translate everything else, OD-16 prices to come, OD-17 A, OD-18 B for enrolment actions and A for appointments, OD-19 A, OD-20 B.

**Effect on the plan, read with the sections above:**
- **OD-3 = B:** one set of hours for calling and the desk. `opening_hours` stays NULL, which §4.1 already defines as « the same as `weekly_hours` »; the « Horaires du centre » card edits one set. No other design change.
- **OD-5 = 5 days:** written into the summary, §4.4 and §4.8 (the default « relancer le » is today + 5 days, including after « Venu – reviendra »).
- **OD-17 = A** keeps the five-failure rule; **OD-18** amends the operational-task rule for appointments only (§2a).
- **OD-2 = A** and **OD-9 = A**: the stop condition « OD-2 = B or OD-9 = B » does not apply.

**Owner inputs still to come (each is a gate):**
- the weekday hours and closed dates (OD-3): **given 2026-11-21** — « same time as before, no need for holidays »: the current published `weekly_hours` unchanged, `opening_hours` NULL, `date_exceptions` `[]`; values read by R0 Q01 (recorded in [OWNER_DECISIONS](../../ai/OWNER_DECISIONS.md));
- the default owner's account (OD-6): **D1 must not run without it**; still to come at the A1 release (2026-11-23); **given 2026-11-23** (set by the owner in Settings at 11:07 UTC, a receptionist account), before D1;
- a confirmed Production backup or PITR: **D1 must not run without it** (added at the A1 release, 2026-11-23, because A1 itself was released without one); **met 2026-11-23**: a full backup taken and verified by a restore before D1 ([D1 record](#release-record-data-step-d1--2026-11-23));
- the 2026/2027 programme prices (OD-16): before release B2. *Replaced 2026-11-26: B2 ships with no prices ([decision](#owner-decisions-follow-ups-and-gates--2026-11-26)).*

**Reviewer's notes:** the four non-blocking notes of the independent re-review of RWR-r5 at `824252a`, copied here as review notes (they are not part of the owner's words). They are follow-ups for the A1 implementation and do not change the approved design; notes a and c are applied to the text above.
- **a.** Rule (a) step 1 can still cancel an active prospect's past planned test: a future appointment without a test next to a past appointment with a planned test keeps the future one, and the past appointment's test is cancelled. The test is counted and sampled in `d1_plan`. Applied: the upgrade fixture holds this case (§9), and the revert note no longer says such a test « belonged to a closed prospect » (§10).
- **b.** Step 2's tie-break keeps the earliest of several past tests; consider the most recent, since a duplicate booking is usually the later one. Open for A1.
- **c.** The D1 approval column said « with the per-rule counts »; it should also name the cancelled-test count. Applied (§10).
- **d.** Key reuse today comes from `CrmActionDialog`'s `request.current` and its intent check (`src/components/crm/CrmActionDialog.jsx:222-249`); `retryKey` is called there with `null` (`CrmActionDialog.jsx:246`; the review cited `presentation.mjs:246`), so it never reuses a key on its own. The one-tap button should copy the dialog's request ref and its lock. §4.9 is worded accordingly. Open for A1.

**Not authorized by this approval:** implementation, migration numbers, the R0 Production queries, any data step, merge or release. Each needs the owner's separate approval.

### Implementation record

**PR A1 (#208), day scripts 3 and 8 — owner decision (verbatim):**

> Decision on day scripts 3 and 8 (Maroine, 2026-11-22): I accept the A1 counts — script 3 at 7 and script 8 at 4 (close). Script 3's ≤ 6 target moves to PR B1 (« C'est la même personne »). Script 8's close-in-2 target moves to PR B2, where the close-reason list and the wrong_number constraint value are planned (§5.4); its corrected-in-3 target stays in B1. Record this verbatim in the plan's implementation record and amend the A1 and B1/B2 acceptance cells to match. Also number the day-script table rows 0–11 in the plan, since you inferred the numbering.

**Effect:** the A1, B1 and B2 acceptance cells in §8 and the numbered day-script table say this. `scripts/test-reception-day-scripts-browser.mjs` holds scripts 3 and 8 at their A1 ceilings (7 and 4) and prints the later targets.

**PR A1 (#208), re-review at `5666274` — owner decisions (verbatim):**

> Owner decisions (Maroine, 2026-11-22):
> 1. Kept test during enrolment (plan amendment, applies in this PR because 136 is not yet applied):
>    - A planned test of an active prospect may belong to its open appointment or to its open enrolment action, and only those.
>    - The enrolment action carries the test id (a real link). Replacing or cancelling that action cancels the linked test, through the existing clean-up. Conversion keeps the test, as now.
>    - Change D1 rule b (d1_sets and d1_apply), Q29, the M-A2 placement trigger contract (§4.1) and invariant 2 accordingly, so D1 never replaces an enrolment action.
>    - Record this verbatim in the plan's implementation record and amend §4.1, §4.8, §10 (rule b) and Q29.
> 2. B2: a prospect's test never returns to « Planifié » once it has left it, whatever the path (two-step « Annulé »/« Absent » → « Passé » → « Planifié » included). Scope the rule to tests linked to a prospect only; students' own tests keep today's behaviour (C2 scope). The form must not offer « Planifié » for such a test. Keep the d1_revert exemption.
> 3. crm_reopen_prospect: an appointment as the reopen action follows the same rule as « Changer » (no first appointment on an unqualified prospect; book via the exchange).
> 4. Record in the plan's implementation record: the B1 design (booking via « Noter un échange » → « On a parlé »), the no-replan rule, the walk-in exchange requirement, and my acceptance that a walk-in who declines on the spot is created then closed.
> 5. Add every test gap the reviewer lists (two-step replan, upgrade fixture with an enrolment action plus kept test, replacing the enrolment action while a kept test exists).

**Effect (recorded for decision 4 and applied in migration 136 before it is applied anywhere):**

- **Kept test (decision 1).** §4.1 (column row and the M-A2 placement trigger), §4.8 (enrolment start, « Changer », reopen rows), invariant 2 (§7), §10 rule (b) and Q29 (audit §7 and `supabase/manual/rwr_r0/q29_…sql`) are amended as quoted. Enrolment start puts the kept test on « Finaliser l'inscription » (`placement_test_id`). Moving that action to another enrolment action carries the link (owner decision of 2026-11-23, quoted below); replacing it by anything else, or closing the prospect, cancels the test through the existing clean-up; conversion keeps it. D1 rule (b) counts a test as housed when an open appointment **or** enrolment action carries it, and links a test to an existing enrolment action (`linked` in `d1_plan`) instead of replacing that action; `d1_revert` undoes the link. Today's schedule hides a standalone test only behind its appointment, so a test carried by an enrolment action still shows in the day's schedule.
- **B1 design.** A prospect's first appointment is booked through « Noter un échange » → « On a parlé » (OD-11 qualifies there). « Changer » books a **new** appointment only for a `QUALIFIED` prospect (hint `crm_next_action.appointment_needs_exchange`) and can always move an existing one. Reopening (`crm_reopen_prospect`, legacy `crm_reopen_lead`) follows the same rule (decision 3): the reopen dialog offers no « Rendez-vous au centre ». Safety net: « Venu · s'inscrit » / « Venu · reviendra » on an existing appointment of an unqualified prospect record the in-person conversation and qualify.
- **No-replan rule (decision 2).** Trigger `placement_tests_no_replan`: a prospect's test (`crm_lead_id` set) that has left `Planifié` cannot return to it, in one step or through « Passé » (hint `crm_placement.not_replannable`); students' own tests are unchanged (C2 scope); `d1_revert` keeps its exemption. The test form offers « Planifié » only for a planned, new or student test.
- **Walk-in.** « Manuel · Visite au centre » requires the in-person first exchange (`crm_create.walk_in_exchange_required`); « Pas encore parlé » is not offered. The owner accepts that a walk-in who declines on the spot is created, then closed (two saves).
- **Operations.** `d1_apply` locks `crm_leads`, `crm_tasks` and `placement_tests` until commit: run it outside reception hours (§10).

**PR A1 (#208), re-review at `f559f5d` — owner decision (verbatim):**

> Owner decision (Maroine, 2026-11-23): yes — moving « Finaliser l'inscription » to another « Finaliser l'inscription » (same enrolment action, new date) keeps the linked test; only a replacement by a different kind of action, a cancellation or a close cancels it. Record this verbatim in the plan's implementation record as my decision, replacing the "author choice" wording.

**Effect:** the kept-test item above names this decision. The old « reschedule in place » path (`crm_schedule_task` with a task id) moves a planned test only when the rescheduled action is an appointment; « Finaliser l'inscription » is rescheduled without touching its test (review finding B5, `test-crm-rcc-a2.sql`).

### Release record: PR A1 — 2026-11-23

**Owner release approval (Maroine, 2026-11-23), verbatim:**

> You are the release operator (AGENTS.md, docs/ai/templates/PRODUCTION_ROLLOUT.md). Tier 3 Production operation.
>
> Owner release approval (Maroine, 2026-11-23): I approve releasing PR #208 (RWR-r5 PR A1) at exact head 7a0bc410d968a10fdd2778c9844002085e7d802b. The independent re-review verdict on that head is READY FOR FINAL REVIEW; Verify run 45147613788 is green on tested merge 505c85d.
>
> Scope:
> - Apply supabase/migrations/136_crm_one_next_action.sql to Production, migration first, through the guarded wrapper pattern of plan §10 (md5 preconditions, DRYRUN_OK rehearsal, then commit).
> - Then squash-merge PR #208 at that exact head and verify Vercel Production READY on the merged commit.
> - I accept the short window between the two in which the old drawer's history list may fail (the 3-argument crm_get_timeline is dropped). Old command wrappers remain callable by design (plan §4.2).
> Window: now, during opening hours. I accept the 10–15 minute disruption; I will tell the receptionist before "go". No Production write before my "go".
>
> Before any mutation:
> - confirm head, base and main;
> - confirm the Production migration ledger is exactly 001–135 (stop if any of #204's 131–135 is missing or differs);
> - confirm the deployed source and the recovery plan (prior function bodies from the migration's rollback file).
> Prepare the concrete checklist and show it to me, then wait for my "go" before the first Production write.
>
> After release:
> - run Production acceptance with bounded, reversible probes, no customer data in reports;
> - check roles: receptionist, director and teacher, plus the director-only functions;
> - check one prospect through exchange, « Changer », calendar and the Settings « Horaires du centre » card, read-only where possible;
> - check Meta intake still works, and look at runtime errors.
> Stop and report on any mismatch.
>
> Not authorized: D1 or any data step, M-A2, changing the follow-up policy or hours, any other migration or PR. Hand off with the merge SHA, the deployed SHA, the ledger state and acceptance results; documentation closeout is a separate change.

**Owner's « go » (2026-11-23, after the operator showed the checklist, which listed the missing rollback file and the missing backup as two points to accept), verbatim:**

> Go

**The two risks, owner's words (2026-11-23, at the closeout review), verbatim:**

> Before « go » I was told the PR has no rollback file and no Production backup exists, and I accepted both.

| Step | When (UTC) | Evidence |
| --- | --- | --- |
| Pre-checks (read-only) | before 10:35 | head `7a0bc41`, base = `main` = deployed `269618a`; squash tree `db908b3` = tested merge `505c85d`; ledger 001–135, rows 131–135 equal to the files; catalogue digest = clean 135 (no drift); no backup, PITR off |
| Local rehearsal | before 10:35 | clean 135 + `receipts_number_required` = Production digest; pinned dry run, apply and a plain `migration up` give the same post-136 digest; recovery parts A + B return to the pre-136 digest; 136 re-applies after recovery |
| Production dry run | 10:35:59 | `DRYRUN_OK 136 tables=86`; ledger re-read 001–135 |
| **136 applied** | **10:36:15–17** | ledger 001–136; row 136 MD5 `9dabd82005ef8eb3cc922dae49c4c39b`, `created_by` from row 135; digest = clean-136 pin; row counts of the 86 app tables unchanged inside the wrapper |
| Merge | 10:36:38 | squash `25e91e6ae8143e4281aa40e52a399e2060b4f239` |
| Deploy | 10:38:39 | GitHub `Production` deployment `7996419644` `success`; the domain serves a file present only in this merge |
| Acceptance | 10:40:59 | rolled-back probe per role (below) |
| Integrations and logs | 10:41–10:45 | intake run 10:40 → 200; 305 ingestion jobs `done`; only the release's two sentinel errors in Postgres |

**Old-drawer window:** about 2.5 minutes (10:36:17–10:38:39 UTC) with no logged error.

**Acceptance by role** (one transaction ending in a sentinel exception; statuses, codes and counts only; CRM counts and prospect versions equal before and after):
- **Receptionist:** `crm_get_centre_hours` (the « Horaires du centre » card), `crm_check_action`, `crm_get_workspace_detail`, the 4-argument `crm_get_timeline`, `crm_get_work_queue` (« Aujourd'hui », « En attente »), `crm_list_outside_hours`, `crm_get_admissions_calendar` all answered. One prospect: « Noter un échange » · « Pas de réponse » kept one open action; « Changer » → « En attente » without a date left one open action of that type with no date; one primary history line per command. `crm_list_data_step_journal`, `crm_set_reception_default_owner` and `crm_create_followup_policy` refused (`42501`).
- **Director:** the same readers and `crm_list_data_step_journal` answered; the two director writers were not run.
- **Teacher:** every function above refused (`42501`).
- **Old command wrappers (at the time):** still executable by `authenticated` until A2, which revoked them on 2026-11-24.

**Gates after this release (at the time):** A1 done. **Next: D1** (done 2026-11-23), which needs the default owner's account (OD-6), a confirmed Production backup or PITR, a fresh `d1_plan()` dry run with per-rule and cancelled-test counts for the owner's « approve D1 », and a run outside reception hours. Then A2 (done 2026-11-24); B1, B2 (prices, OD-16), C1 and C2 follow (§8).

**Limitations and follow-ups:**
- **No rollback file shipped.** §10's M-A1 rollback refers to « the migration's rollback file »; PR #208 has none. The operator generated the recovery from the clean-135 catalogue (part A: the 21 replaced and 3 dropped functions back, the 40 new functions and the new trigger dropped, ledger row removed; part B: the additive schema, refused while any row uses it) and rehearsed it. The owner keeps the files outside the repository; using them needs a separate approval, application first (redeploy `269618a`). Part A refuses once D1 has written to `crm_data_step_journal`, and `d1_revert` does not clear those rows: after D1 these files must be regenerated for the post-D1 state before any use (see the [D1 record](#release-record-data-step-d1--2026-11-23), recovery notes).
- **No Production backup** for 136 (additive; no row written, checked inside the wrapper). A confirmed backup or PITR is now a precondition for D1.
- **Not verified:** the screens in a signed-in browser; a new Meta lead through intake on 136 (none arrived after 09:16 UTC); Vercel runtime errors (no connector access to the team).
- **Known pre-existing, not caused by A1:** `crm_get_today` fails on legacy non-CRM tests with malformed times (`invalid input syntax for type time`), the same at `main` `269618a` (PR #208 description); `npm run audit:policy` fails on `main` (advisories on `next`).
- At the time: until D1, prospects could still hold several open actions or none (R0: Q04, Q05); until A2, nothing in the database enforced one. D1 ran on 2026-11-23 and A2 enforces it since 2026-11-24.

### Release record: data step D1 — 2026-11-23

**D1 RUN AND VERIFIED (2026-11-23).** `crm_security.d1_apply` committed at **11:39:41 UTC** with the counts the owner approved; the read-only post-checks Q04, Q05, Q07 and Q29 are all zero. No migration, merge or deployment; the deployed source is unchanged. M-A2 not run at the time; `d1_revert` was available until M-A2, which dropped it on 2026-11-24.

**Preparation approval, owner's words (2026-11-23), verbatim** (the backup folder's path is left out here, marked […], because this repository is public):

> Owner approval (Maroine, 2026-11-23): prepare data step D1 of plan RWR-r5 (docs/architecture/plans/receptionist-workflow.md §10). Tier 3 Production operation.
>
> Gates already met:
> - the default owner is set: Reception EH, saved 2026-11-23 11:07 UTC via Settings;
> - A1 is released (migration 136, merge 25e91e6).
>
> Part 1 — now, read-only only:
> - Verify the ledger is 001–136 and main is current.
> - Run select crm_security.d1_plan() on Production in a read-only transaction.
> - Show me the per-rule counts (a, b — linked/replaced, c, d), the cancelled-test count and the sample lead ids (ids only, no names), compared with R0 (a: 19 prospects / 45 actions, b: 0, c: 18, d: 0). Explain any difference.
> - Prepare the apply checklist: the backup method, the guarded wrapper, the expected_counts, the post-checks (Q04, Q05, Q07, Q29 must be 0) and the rollback with d1_revert (only before M-A2).
> - Then STOP and wait for my approval of the exact counts.
>
> Part 2 — only after I approve the counts AND say "go" (outside reception hours):
> - Take a full backup of the Production database first (pg_dump of the whole database, including auth). Store it ONLY in […] on this Mac, never in the repo (it contains personal data). Verify it is readable and report its size and checksum.
> - Then run d1_apply with the approved expected_counts through the guarded wrapper, and run the post-checks.
> - Report the journal counts. Stop on any mismatch.
>
> Not authorized: M-A2, any migration, any change to hours or the follow-up policy, merge or other PRs. Documentation of D1 is a separate change afterwards.

**Counts approval and « go », owner's words (2026-11-23), verbatim** (path left out, marked […]):

> Owner approval (Maroine, 2026-11-23): I approve D1 with exactly these counts: a 19 (19 prospects / 45 actions, 26 cancelled), b 0, c 18, d 0, tests cancelled 0, open actions 186 → 178. go — run now, before reception opens at 15:00.
>
> Order:
> 1. The backup to […] (roles, schema, data including auth, ledger). Verify it by restoring it locally and comparing row counts, and report each file's size and SHA-256. Stop if the backup can't be verified.
> 2. The Production dry run (must end in DRYRUN_OK).
> 3. The apply through the guarded wrapper with expected_counts {"a":{"count":19},"b":{"count":0},"c":{"count":18},"d":{"count":0},"tests_cancelled":{"count":0}}.
> 4. Read-only post-checks Q04, Q05, Q07, Q29, plus the journal counts.
>
> Stop and roll back on any mismatch. Must finish before 15:00 centre time; if not, stop safely and tell me. Not authorized: M-A2, any migration, hours or policy changes, d1_revert unless I ask. Report the results, then stop; documentation of D1 is a separate change.

**Gates (§10 and the [approval record](#approval-record)):** (1) default owner (OD-6): set by the owner in Settings at 11:07 UTC; (2) backup: taken and verified before any write (below); (3) a fresh `d1_plan()` with the counts approved above; (4) outside reception hours: run at 12:39 centre time on a Monday, before the desk opened at 15:00.

**Counts: approved and actual (identical, and identical to R0)**

| Rule | Approved | `d1_plan()` (read-only, 11:23 UTC) | Applied |
| --- | --- | --- | --- |
| a — several open actions | 19 prospects / 45 actions, 26 cancelled | 19 / 45 (19 kept, 26 to cancel) | 19 |
| b — planned test without its appointment (linked / replaced) | 0 | 0 (0 / 0) | 0 |
| c — no open action | 18 | 18, all after five failed calls | 18 |
| d — closed or merged prospect with work left | 0 | 0 | 0 |
| Planned tests cancelled | 0 | 0 | 0 |
| Open actions (all prospects) | 186 → 178 | 186 | 178 |

Rule (a) detail from the read-only plan: no cancelled action carried a test, and no prospect lost a future appointment. The 18 rule (c) actions are « En attente » with no date and no « À revoir (D1) » flag (OD-17: every one followed five failed calls). After D1 each of the 178 active prospects has exactly one open action.

| Step | When (UTC) | Evidence |
| --- | --- | --- |
| Read-only checks | 11:23 | ledger 001–136, row 136 MD5 `9dabd82005ef8eb3cc922dae49c4c39b`; `crm_data_step_journal` empty; default owner set; latest Production deployment on the #212 docs merge `e22f9f2` |
| Local rehearsal | before 11:30 | private stack at 136 with a rule (a) and rule (c) fixture (one prospect under five failures, so flagged): wrapper dry run `DRYRUN_OK`, a wrong count refused by `d1_apply`, apply, a second run refused (journal not empty), `d1_revert` restored the earlier open actions exactly |
| Backup | 11:34–11:38 | roles, schema, data (including `auth`) and the migration ledger, then a restore check (below) |
| Production dry run | 11:39:31 | `DRYRUN_OK`: applied a 19, c 18; journal 37 / 26 / 36; open 178; prospects, students, enrolments, receipts, charges and placement tests unchanged |
| **D1 applied** | **11:39:41** (journal `run_at` 11:39:40.97) | same wrapper ending in `commit` |
| Post-checks (read-only) | 11:39:58 | below |

**The guarded wrapper** (one transaction, `lock_timeout` 5 s, `statement_timeout` 300 s) refused to run unless: the ledger was exactly 136 rows with row 136 as above; the journal was empty; the default owner was set; the whole-app catalogue digest equalled the clean-136 pin; exactly one director existed (the run is made as that director, so the journal names the director as `run_by`); and exactly 186 actions were open. It then called `d1_apply` with the approved `expected_counts`, required `applied` = `{"a": 19, "c": 18}`, re-ran Q04, Q05, Q07 and Q29 and the state comparison inside the transaction, and checked the journal counts before committing.

**Journal (`crm_data_step_journal`, step `d1`): 99 rows**, all from the one transaction, `run_by` the director:

| Entity | Rows | Meaning |
| --- | --- | --- |
| `crm_leads` | 37 | one per prospect processed (19 rule a + 18 rule c), with the version D1 left |
| `crm_tasks_closed` | 26 | the rule (a) actions cancelled, with their rows before and after |
| `crm_tasks` | 36 | the 18 actions D1 created, **each journalled twice by design**: once by `set_next_action` in its D1 « create » mode (marked « hors règles (D1) ») and once by `d1_journal`. `d1_revert` cancels each such action once; the second row finds it already cancelled and does nothing |
| `placement_tests_cancelled`, `crm_tasks_linked` | 0 | no test cancelled, no action linked |

**Post-checks (read-only, 11:39:58 UTC):**

| Query | Result |
| --- | --- |
| Q04 — prospects with more than one open action | **0** (before: 19 prospects / 45 actions) |
| Q05 — active prospects by number of open actions | **178 prospects, each with exactly 1**; none with 0 (before: 0 → 18, 1 → 141, 2 → 16, 3 → 1, 5 → 2) |
| Q07 — closed, converted or merged prospects with an open action or a planned test | **0** (CONVERTED 0 / 0, LOST 0 / 0, NOT_QUALIFIED 0 / 0) |
| Q29 — planned tests of active prospects not carried by an open appointment or enrolment action | **0** |
| `d1_sets()` (what D1 would still process) | empty |
| Open « En attente » actions | 18, all without a date, none flagged |

**Backup before D1.** A full backup of the Production database was taken before any write and verified by restoring it: roles, schema, data (including `auth`; `supabase db dump`, which runs `pg_dump`, one part after the other) and the migration ledger, plus a restore script. Restored into an empty private local database, **all 121 dumped tables matched Production row for row (13,440 rows)**, and the ledger copy holds 136 rows with row 136 intact; the local copy was then removed. **The backup holds personal data and is kept by the owner, outside this repository**; it is identified here by checksum only:

| Part | Size (bytes) | SHA-256 |
| --- | --- | --- |
| roles | 297 | `25873cec56a2cc6514e204f420231777f85c03da818caa7090cdcdfa89776ecd` |
| schema | 1,483,021 | `1fd966642d0090c07f1a1efd6bae4c9b47daa2205acf1af59abb0f185f98eacb` |
| data (including `auth`) | 9,980,786 | `d6bcee138644abd4cc4f59a86be80feba01da704244a9860376823f4c2beb567` |
| migration ledger | 2,931,202 | `e8218de71bd731caf3fbf0fe5b1d0307f15d3ea9d351c2b27762bfdd7b3f97b5` |
| restore script | 1,038 | `a2912f21ac8c4359357c26fb4db953d8f6c92e71deca6ca22cfe9fbef96cc37b` |

**Recovery notes**
- **Reverting D1 (at the time; no longer possible since M-A2 dropped `d1_revert` on 2026-11-24):** `select crm_security.d1_revert()`, run as the director, **only before M-A2** and only on the owner's request. It cancels the 18 actions D1 created, reopens the 26 it cancelled, and skips (and counts) any prospect whose version changed after D1, so work done since is never overwritten. M-A2 drops the D1 functions; after it, D1 cannot be reverted.
- **Migration 136's recovery files after D1** (A1 record above; kept by the owner outside the repository, checked 2026-11-23): **as generated, neither part can run any more, even after `d1_revert`.** Part A refuses whenever `crm_data_step_journal` holds any row (`R136_PRE_DATA_STEP_RAN`), and nothing deletes journal rows: `d1_revert` reads the journal and leaves all 99 rows in place, so part A's own hint « revert the data step first » is not enough. Part B refuses on the same journal rows and on any row that uses the 136 schema (« En attente » or undated actions, outcomes, cancelled tests, primary history lines), which D1, `d1_revert` (it cancels actions, it does not delete them) and ordinary use since the release have all written. **What an operator does after `d1_revert`, if 136 itself must be undone:** stop, and do not delete journal rows or edit the guards to get past them (the journal is D1's audit record). The recovery must be **regenerated for the post-D1 state**: new files built from the catalogue at that time, which also settle how the 135 functions treat rows only 136 allows (« En attente » actions, actions without a date). They are rehearsed on a private stack holding those shapes, independently reviewed, and run only with **the owner's separate approval** (Tier 3), with the application first (redeploy the `269618a` build).
- **Restoring the backup** (only with the owner's approval, into an empty database). Two caveats found when it was verified:
  - **Legacy e-mail checks:** the five lower-case e-mail checks on `messages`, `notifications`, `students` (two) and `teachers` are `NOT VALID` in Production because older rows predate them. A schema-then-data restore creates them before the rows and fails, so the restore script drops every `NOT VALID` check before loading the data and re-adds it `NOT VALID` afterwards (six on the verified restore). It runs as a superuser: as `postgres` it could not alter some of the restored tables.
  - **Platform auth and storage versions:** Production's `auth` and `storage` schemas belong to the platform and are newer than a local stack's: `auth.one_time_tokens.link_token_hash`, `auth.saml_providers.dedicated_scope` and two storage lifecycle tables were missing locally. All four were empty in Production; for the check they were added locally as empty stand-ins. A restore into a Supabase project of the same platform version needs none of this.

**Not verified:** the drawer and « Tâches » in a signed-in browser after D1.

**Gates after D1 (at the time):** D1 done. **Next: A2** (done 2026-11-24, [release record](#release-record-pr-a2--2026-11-24)) (unique index, presence triggers, revokes; M-A2), which needs its own implementation approval and review and then « approve M-A2 ». Then B1, B2 (prices, OD-16), C1 and C2 (§8).

### Implementation record: PR A2 (M-A2, migration 137)

**Owner approval (Maroine, 2026-11-23), scope lines verbatim:**

> Scope, M-A2 only (plan §4.1, §4.2, §8 PR A2 row, §10 M-A2 row): the single-open-action unique index; the deferred presence trigger (exactly one open action per active prospect); the closed-prospect guard; the placement trigger as amended — an active prospect's planned test belongs to its open appointment or its open enrolment action, and only those; revoke the old command wrappers from authenticated; drop d1_plan, d1_apply, d1_revert and the eh.crm_data_step bypass. The migration itself re-checks Q04, Q05 (active with 0), Q07 and Q29 and refuses to apply unless all are 0.
>
> Not authorized: Production, data steps, merge, release.

**What `137_crm_one_next_action_enforce.sql` does.**

- **Precondition.** Under a share-row-exclusive lock on `crm_leads`, `crm_tasks` and `placement_tests`, it re-counts Q04, Q05 (active with no open action), Q07 and Q29 and refuses with `55000`, hint `crm_next_action.d1_postchecks`, unless all are 0.
- **The index.** `crm_tasks_one_open_per_lead` is a unique index on `crm_tasks(lead_id) where status='open'`.
- **Deferred constraint triggers.** `crm_next_action_presence` on `crm_leads` and `crm_tasks`, and `crm_planned_test_placement` on `placement_tests`, call `crm_security.assert_next_action_state`. It enforces three rules:
  - an active prospect has exactly one open action (`crm_next_action.exactly_one`);
  - a planned test belongs to the prospect's open appointment or enrolment action (`crm_placement.test_without_action`);
  - a closed, converted or merged prospect has no open action (`crm_next_action.closed_has_action`), and a closed or merged one has no planned test (`crm_placement.closed_has_test`).
- **D1 bypass removed.** `set_next_action` and `placement_no_replan` are re-created from their 136 bodies without the D1 bypass.
- **D1 dropped.** The seven D1 functions are dropped. `crm_data_step_journal` and its rows stay.
- **Wrappers revoked.** Twelve old wrappers are revoked from `public`, `anon`, `authenticated` and `service_role`: `crm_add_note`, `crm_record_call_outcome`, `crm_record_whatsapp`, `crm_record_conversation`, `crm_record_conversation_decision`, `crm_qualify_lead`, `crm_schedule_task`, `crm_complete_task`, `crm_cancel_task`, `crm_close_lost`, `crm_close_not_qualified` and `crm_reopen_lead`. `crm_reassign`, `crm_book_placement_test` and `crm_update_placement_test` keep their grant, because current screens call them.
- **`placement_tests` grants.** `anon` loses every table and column privilege; `authenticated` loses `TRUNCATE` and keeps `DELETE` and its column `INSERT`/`UPDATE` (owner decision 2026-11-23, below).
- **Payment guards on every path (section 7, after the owner review of PR #216).** Every charge and receipt is inserted by `create_charge_payment_financial` (not API-executable), reached through `create_charge_payment` (« Encaisser », and « Inscrire et encaisser » after its CRM step) and `crm_reserve_without_payment`; no application code writes charges or receipts with the service role.
  - `receipts_reserved_commitment_guard` (before insert on `receipts`): no receipt on a charge reserved for a prospect that is still open (not merged, no enrollment, not converted, lost or not qualified) — `eap.reservation_collect_on_prospect`. « Inscrire et encaisser » links that prospect to its new enrollment before paying, so only its own payment passes; another prospect of the same learner, « Encaisser » (any role) and a service-role write are refused. A prospect closed without enrolling leaves an ordinary commitment, which « Encaisser » collects with its enrollment (ADR-015).
  - `create_charge_payment`, re-created from its 127 body (prosrc md5 `2263c8d7…`, checked by the precondition) with one block: a new tuition charge (not « Autre ») **without a chosen enrollment** next to a live unlinked commitment of the same learner, programme and year is refused — `eap.unlinked_commitment_exists` — so « Encaisser » collects the commitment instead. A charge paid onto an enrollment the staff chose passes (a deliberate link, for example the current session while the next session's deposit is open, the 128 shape); a retry of an earlier request replays. « Inscrire et encaisser » (always an explicit enrollment) holds the same rule itself, with « Nouvelle session » as its only override; « Réserver sans paiement » holds it before its charge.
  - The trigger function is in `crm_security`, with no EXECUTE for `anon`, `authenticated` or `service_role`.
  - A row trigger on `charges` was tried first and dropped: it refused charges paid onto a chosen enrollment next to a next-session deposit (`test-course-dates-close.sql`) and fixture setups of `test-finance-batch-e.sql`.
- **Rows.** The migration writes no row.
- **Restore file.** `scripts/rollback/137_crm_one_next_action_enforce_restore.sql` drops the triggers, functions and index, re-grants the wrappers and restores the 136 `placement_tests` grants exactly (checked with `aclexplode`). D1 is not restored.

**Owner decisions on A2 (Maroine, 2026-11-23).**

- **Revoked wrappers in tests.** Approved: setup-only calls move to the replacement commands or a trusted `postgres` session with the fixture state unchanged; a suite that tested a revoked wrapper keeps its replay, stale-version and conflict assertions against the replacement command and adds a `42501` refusal check for the old wrapper. The CRM browser suites are handled the same way.
- **Deviations 1–4 approved** as listed below (Q07, release order, the two `rcc-a2` cases, idempotent drops).
- **`placement_tests` grants.** `anon`: nothing. `authenticated`: no `TRUNCATE`; `DELETE` stays because a current screen needs it (finding below). Mirrored in the restore file; `test-single-writer.sql` asserts the result.
- **Other tables.** The 24 other public tables that grant `DELETE` and `TRUNCATE` to `anon` and `authenticated` are listed in the PR description only and are not changed here; a separate hardening PR will handle them.

**Deviations (approved 2026-11-23).**

1. **Q07 and converted prospects.** The precondition counts open actions on closed, converted or merged prospects, and planned tests on closed or merged ones. A converted prospect that keeps its planned test is only reported in a notice: the owner decision of 2026-11-22 (decision 1: « Conversion keeps the test ») makes that a legitimate state, which every enrolment with a kept test produces. Q07's definition in §4 and in the §10 M-A2 row is amended to match. The R0 query file `supabase/manual/rwr_r0/q07_…sql` stays as run for R0 (evidence); its `CONVERTED` · `with_planned_test` count is informational.
2. **Screens.** The drawer's close (« Clôturer comme perdu », « Clôturer : injoignable », « Clôturer comme non qualifié ») and « Rouvrir » now call `crm_close_prospect` and `crm_reopen_prospect`, which exist since 136. `CrmActionDialog` no longer contains any revoked wrapper, and refuses an action it does not support. A static check in `test-crm-next-action-ui.mjs` fails if any file under `src/` names a revoked wrapper.
3. **Changed test cases in `test-crm-rcc-a2.sql`.** « several open enrolment follow-ups: earliest retained » and the legacy duplicate appointment with a test are now assertions that a second open action is refused (`unique_violation`): the single-action rule makes those shapes impossible.
4. **Re-apply after restore.** The D1 drops use `if exists`, so 137 can be re-applied after its restore file.

**Finding: `placement_tests` `DELETE`.** The Admissions page « Tests de niveau » (`src/app/(admin)/placement-tests/page.jsx`, trash button) calls `entities.PlacementTest.delete(id)` for non-receptionists on tests not linked to a CRM prospect; RLS policy `placement admin all` limits the delete to admin and director. Revoking `DELETE` would break that button, so it stays.

**Release notes for A2 (approved order).**

1. Deploy the A2 application build first. It works on 136; the deployed A1 drawer still calls `crm_close_lost`, `crm_close_not_qualified` and `crm_reopen_lead`, which 137 revokes.
2. Then apply 137. Its precondition re-checks Q04, Q05, Q07 (as amended) and Q29 under lock and refuses unless all are 0.
3. Rollback: `scripts/rollback/137_crm_one_next_action_enforce_restore.sql` (wrappers, triggers, index, `placement_tests` grants). D1 cannot be reverted after 137.

**Tests: every changed file.**

- **New:**
  - `test-single-writer.sql`: no API write on `crm_*` tables; the `placement_tests` exception (column insert and update under RLS, `DELETE` kept, no `TRUNCATE`, nothing for `anon`); the twelve wrappers not executable and refused with `42501`; current commands granted; the index valid; no D1 left.
  - `test-crm-next-action-enforced-suites.mjs`: runs the 20 CRM and finance suites with every deferred check fired before their rollback, as COMMIT would.
  - `test-crm-next-action-137-upgrade.mjs`: the committed 136→137 path — refusal before D1, D1, the file with no row changed, the writers, real-COMMIT refusals, the `placement_tests` grants, the restore file (ACL restored exactly) and the re-apply.
  - `test-crm-work-calendar-137-upgrade.mjs` (Verify run 45221023952): the shared 10k Work and Calendar fixture follows the real path. It is committed at 136 in its pre-D1 shapes. 137 refuses it (Q04 7999, Q05 1, Q07 planned tests 1, Q29 120) and changes nothing. D1 then runs with its exact counts (a 7999, b 120, c 1, d 1, one test cancelled), 137 applies with no row changed, the planner statistics are refreshed (`analyze`, as the fixture does after loading; without it the first calendar read hit the 45 s timeout right after D1 closed about 32 000 actions), and the bounded-read acceptance (`test-crm-work-calendar.sql`, then `test-crm-receptionist-ux.sql`) runs rolled back on the D1-processed rows.
    - Five assertions describe the pre-D1 fixture shape itself: « assignee AND owner, no fallback », « eight task types in fixture », « genuine visit duration preserved » (the visit is the duplicate D1 closes), « unrelated malformed legacy time cannot crash public Opportunities » and « taskless exhausted prospect attention retained ». They are left out after D1 by name: the script fails if any of them is missing or appears twice. Their read calls still run.
    - All five, and every other assertion of the suite, still run unchanged on the pre-D1 fixture at 136 (`test-crm-work-calendar-local.mjs`, rolled back).
    - The duplicate in that run was written at the current ceiling: after its reset to 137, the lane loaded the fixture, whose second open visit for one prospect hit `crm_tasks_one_open_per_lead`. It was not written at 107 and then migrated: the 107 script applies only 108 and then resets.
- **Rewritten:** `test-crm-next-action-enforced.sql` (real index and triggers); `test-crm-next-action-upgrade.sql` (fixture → 136 → D1 → 137, then intake resubmission, reassignment, test result, enrolment start and the kept test on conversion).
- **Assertions changed for the revoke (old wrapper now refused with `42501`, same assertions on the replacement):**
  - `test-crm-phase4-concurrency.py`: the decision race runs through `crm_log_exchange` with the same race, replay, open-task count, `conversation_recorded`, payload-conflict and stale-race assertions; `crm_record_conversation_decision` is refused and the lead version is unchanged.
  - `test-no-retry-conflicts-local.mjs`: the `crm_complete_task` and `crm_record_conversation_decision` stale rows become `crm_log_exchange` and `crm_change_next_action` stale rows (same `409 PT409` « Stale lead version; refresh and retry », no row changed); both old wrappers are refused with HTTP 403 / `42501`.
  - `test-crm-next-action-local.mjs`: `crm_schedule_task` over HTTP is refused (403 / `42501`, version unchanged); the same change through `crm_change_next_action` keeps one action.
  - `test-crm-sequences.mjs`: the `legacy_schedule` step asserts the refusal for `authenticated` with the prospect unchanged, then makes the change through `crm_change_next_action`.
  - `test-crm-rcc-a1.sql`: `crm_record_conversation_decision` is asserted revoked (was: granted).
  - `test-crm-phase4.sql`: « decision grants » asserts the wrapper revoked for every API role and refused with `42501` for `authenticated`; its behaviour assertions still run from the trusted session (Verify run 45208338432).
  - `test-crm-next-action.sql`: the D1 functions are asserted dropped (was: private).
  - `test-crm-task-writers.sql`: fails if any `d1_` function still exists.
  - `test-crm-rcc-a2.sql`: the two cases in deviation 3.
  - `test-crm-next-action-ui.mjs`: static check that no `src/` file names a revoked wrapper.
- **Fixture-only (no assertion changed):**
  - `test-crm-phase8.sql`, `test-crm-phase9.sql`, `test-crm-dgi-b2.sql`: cancel the open actions of prospects they close, convert or merge by direct update.
  - `test-crm-lead-ad-source.sql`: each directly inserted prospect gets one open action.
  - `test-enrollment-at-payment.sql`, `test-course-dates-close.sql`, `test-finance-batch-e.sql`: `crm_qualify_lead`, `crm_close_lost` and `crm_close_not_qualified` replaced by `crm_log_exchange` and `crm_close_prospect`.
  - `test-crm-phase5-concurrency.py`, `test-crm-phase6-concurrency.py`, `test-crm-rcc-a2-concurrency.py`, `test-finance-batch-e-concurrency.py`: the `crm_qualify_lead` setup runs in a trusted session.
  - Browser suites `test-crm-phase4-browser.mjs`, `test-crm-opportunities-browser.mjs`, `test-crm-phase5-browser.mjs`, `test-crm-phase6-browser.mjs`, `test-crm-rcc-a2-browser.mjs`, `test-crm-rcc-b1-browser.mjs`, `test-crm-work-calendar-browser.mjs`: setup calls to a revoked wrapper run in a trusted session (same JWT claim, same rows); every other call still runs as `authenticated`.
  - Teardowns: `test-crm-phase5-concurrency.py`, `scripts/lib/crm-next-action-local.mjs` (`removeStaff`) and the browser suites phase4, opportunities, phase5, phase6, rcc-a2, rcc-b1, row-staff-labels and work-calendar fire the deferred checks (`set constraints all immediate`) after the prospects are deleted and before any `ALTER TABLE` on `placement_tests`; phase4's teardown now disables the placement trigger before its first delete.
  - Real-path bookings instead of direct planned tests (Verify run 45208338432; both were fixture shortcuts, no command or screen path):
    - `test-no-retry-conflicts-local.mjs`: the qualified prospect and its test come from `crm_log_exchange` (spoke, next: visit « avec test de niveau »), replacing a direct status update and a direct `placement_tests` insert;
    - `test-crm-opportunities-browser.mjs`, through the new `scripts/lib/crm-opportunities-committed-fixture.mjs`: the committed 10k fixture books its 120 planned tests with `crm_change_next_action` (visit with test). `test-crm-opportunities.sql` is unchanged: it is rollback-only and also loads at migration 106.
  - Impossible-shape fixtures (found when the browser shard was replayed locally past the first failure; fixture shortcuts, no command or screen path):
    - `test-crm-phase4-browser.mjs` and `test-crm-work-calendar-browser.mjs` no longer cancel a prospect's only action to make a « no action » prospect. They now assert that the database refuses it (`23514`, `crm_next_action.exactly_one`, the same approach as the approved `rcc-a2` cases). The prospect stays NEW with its first contact, so « À traiter » still lists it (priority 2; priority 4, « no action », can no longer occur). The UI assertions are unchanged.
    - `test-crm-rcc-b1-browser.mjs`: the directly inserted second open action is removed. No assertion used it since E3 became the drawer menu (§4.9).
  - Date-dependent slot (Verify run 45375722099; an A1 test defect that main also hits): in `test-crm-next-action.sql` T3, the second prospect's « non-overlapping » visit was `pg_temp.at('opening',6,'11:00')`. When day 5 is the closed Sunday (on any Tuesday, e.g. 2026-11-24), `window_at` moves both day 5 and day 6 11:00 to Monday 14:00, so the visit overlapped the first prospect's slot (`crm_next_action.overlap`).
    - Reproduced on 2026-11-24 on 137 and with main's file on 136.
    - The visit is now the opening window of the calendar day after the first prospect's actual slot, so it is always on a later day. `assert_no_overlap` and the assertion are unchanged.
    - A weekday sweep (`pg_temp.at`'s base date shifted 0–6 days) passes on every weekday on 136 and 137, as does the same sweep of `test-crm-next-action-views.sql`.
    - The other suites that use opening offsets either book different people or repeat one identical slot on purpose (the sequences regressions), so they cannot collide this way.
  - Date-dependent preset assertions (same run, browser-crm; A1 test defect, same lines on main): `test-crm-rcc-a1-browser.mjs` asserted the « En attente du prospect » relance at exactly today + 5 centre days and « Dans 2 jours » at today + 2.
    - The server rule (`reminder_due`, OD-5, unchanged) is that date's midnight moved to the first calling window. On a Tuesday, day 5 is the closed Sunday, so the relance is Monday 15:00 (6 days; « '6' !== '5' »). « Dans 2 jours » fails the same way on a Friday.
    - Both now assert the exact stored local date and time against an oracle built from the suite's own hours, as `test-crm-rcc-a1.sql` already does for the presets. They no longer compare against a day count.
  - Typed and booked dates from a fixed offset (Verify run 45404021587, browser-crm, on a Tuesday; A1 test defects, same lines on main): `test-reception-day-scripts-browser.mjs` day script 10 typed « today + 5 » into the reopened prospect's form. On a Tuesday that is the closed Sunday, so the form correctly showed « Aucun créneau ce jour-là » and the Heure select never got options.
    - New `scripts/lib/centre-days.mjs`. `openDaySql(fromDays, times, kind)` lets the server pick the first centre date, from today + `fromDays`, on which every given time is inside the current policy's hours (`window_at`, so closed dates count). With no times, it picks any date with hours. `openSlotSql` is that date at that exact time. No suite now books or types a date from a fixed day count.
    - Fixed:
      - day script 10: the first date from tomorrow with opening hours;
      - day script 7: the « Rappel convenu » is exactly 16:00 on a day with calling hours at 16:00. `slotAt('calling', 2, '16:00')` clamped Friday + 2 (Sunday) to Monday 15:00, so the wait for the kept 16:00 timed out. The weekday sweep found this one;
      - `test-crm-work-calendar-browser.mjs`: both placement bookings, at 10:00 and 11:00, were on tomorrow and were refused when tomorrow is the closed Sunday or Monday morning;
      - `test-crm-rcc-b1-browser.mjs`: the placement booking at tomorrow 10:00, same defect;
      - `test-crm-next-action-137-upgrade.mjs`: the appointment at `now() + 2 days`, which depended on the time of day.
    - Already safe, unchanged:
      - the `inHours()` and `testDay` helpers (next Wednesday, next Tuesday) in phase4/5/6, rcc-a1/a2/b1, work-calendar, opportunities and reception-forms;
      - the `slotAt` callers that only need a valid slot (window-clamped, distinct people): day scripts 6 and 10, forms, next-action-local, sequences;
      - `test-crm-time-travel-local.mjs` (`window_at` and ISO weekdays);
      - the concurrency and no-retry slots (window-clamped). The no-retry stale-version calls are refused with PT409 before any hours check;
      - the opportunities fixture: its own policy is open every day;
      - next-action-local's night and lunch refusals: they hold on every day.
    - Not under opening or calling hours:
      - past backdates;
      - direct pre-D1 legacy inserts and updates;
      - course, leave and online-lesson ranges;
      - expiries and reconciliation times;
      - the old engine's reminders in `rcc-a2` and `enrollment-at-payment` upgrades, which `next_window` moves rather than refuses.
    - `CRM_TEST_DAY_SHIFT=0..6` (default 0) moves the reference day of `openDaySql` and `slotAt` forward. Every such date is at least a day ahead, so a shift of k is the suite run k days later.
      - All 7 weekdays pass on 137 for each of these: `test-reception-day-scripts-browser.mjs`, `test-reception-forms-browser.mjs`, `test-crm-sequences.mjs`, `test-crm-next-action-local.mjs`, the helper itself, and `test-crm-next-action-137-upgrade.mjs` (each run starts with a reset to 136). The upgrade suite computes the date as `postgres`, because its commands run as the staff role, which cannot read `crm_security`.
      - `test-crm-work-calendar-browser.mjs` and `test-crm-rcc-b1-browser.mjs` can't be shifted. They assert the server's real « Demain » bucket and open the calendar on the real tomorrow for 7 days, so a shifted booking could fall outside the shown week. They run at the real date, and their dates come from the helper that the sweep checked.
- **Upgrade-lane ceilings raised to 137:** `test-conflicts-without-retry-upgrade.mjs`, `test-crm-batch2-upgrade-current.sql`, `test-crm-h3-upgrade-103-current.sql`, `test-crm-r4-upgrade-100-current.sql`, `test-crm-r4-upgrade-102-current.sql`, `test-premium-retirement-upgrade-113-current.sql`.
- **Fixture:** `scripts/fixtures/receptionist-function-classification.json` regenerated without the twelve wrappers.
- **CI:** `verify.yml` adds the 136→137 upgrade step, `test-single-writer.sql` and the enforced-suites runner, and moves the upgrade SQL out of the sql-and-concurrency shard.
  - The « Work and Calendar stateful 107 upgrade and bounded read acceptance » step now resets to 136, not to the current ceiling, for `test:crm-work-calendar-local`, then runs `test-crm-work-calendar-137-upgrade.mjs`.
  - The other lanes that start before 136:
    - The 097–105 and 112–116 shards passed in Verify run 45221023952. They include the lanes that seed CRM rows and then run `migration up` through 137 (097, 100, 102, 103, 112, 130). Those rows come through intake, so they pass the 137 precondition.
    - In the 106–111 shard, the 106, 108, 110 and 111 lanes apply only their own next migration on the fixture and then reset. That shard was replayed in full locally, including the three steps the first failure hid.
  - The manual `--plans` and `--performance` modes of `test-crm-work-calendar-local.mjs` need a database at 136.
- **Meta lifecycle.** No Meta lifecycle suite changed and no Meta lifecycle expectation changed (`test-crm-meta-funnel-r4.sql` and the lifecycle suites are identical to main). The concurrency changes above keep every existing expectation; none needed a new one.
- **Not wired in CI, not changed:** `test-crm-phase3-concurrency.py` and `test-crm-phase7-concurrency.py` still call old wrappers as `authenticated` and would fail after 137 if run.

### Release record: PR A2 — 2026-11-24

**MERGED / DEPLOYED / MIGRATION 137 APPLIED / PRODUCTION VERIFIED WITH BOUNDED ACCEPTANCE (2026-11-24).** PR #214 merged as `0bb8f27` and deployed; migration 137 applied 15:54:10–12 UTC. **Release A (A1, D1, A2) is complete: « exactly one next action per active prospect » is now enforced in the database.** The D1 functions, `d1_revert` included, are gone with 137.

**Owner's release approval (2026-11-24), verbatim:**

> Owner release approval (Maroine, 2026-11-24): I approve releasing PR #214 (RWR-r5 PR A2) at exact head 9d67598227e628c571bd8fa2544a753e6c158085. The independent review verdict on that head is READY FOR FINAL REVIEW; Verify run 45419634414 is green (attempt 2; attempt 1 was a registry outage). I confirm the D1 results are fine and I accept that d1_revert disappears with 137.
>
> Window: do it now
> 1. Before any write:
>    - head, base and main are current; the ledger is exactly 001–136;
>    - run 137's own precondition queries read-only (Q04, Q05 active with 0, amended Q07, Q29): all must be 0;
>    - reviewer I1: read Production's relacl/attacl on public.placement_tests and compare them with scripts/rollback/137_crm_one_next_action_enforce_restore.sql. If they differ, prepare a Production-matching restore in […] (not the repo) and tell me.
>    - Show me the checklist and wait for my "go".
> 2. Squash-merge #214 at that exact head; wait for Vercel Production READY on the merge commit and confirm the live drawer's close and reopen work on 136 (read-only or rolled back).
> 3. Apply 137 through the guarded wrapper with a short lock_timeout (dry run DRYRUN_OK, then commit). Ledger 001–137, row 137 matches the file.
> 4. Acceptance, rolled back where possible:
>    - the index is valid and the three triggers are present;
>    - the 12 old wrappers are refused for authenticated;
>    - anon has no privilege on placement_tests and authenticated has no TRUNCATE;
>    - log exchange, « Changer », close, reopen and a test booking each work and leave exactly one action;
>    - Meta intake still runs; no new Postgres errors.
>
> Not authorized: any other migration or data step, changing hours or policy, the 24-table hardening. Hand off with the merge SHA, deployed SHA, ledger, acceptance results and recovery notes; documentation is a separate change.

(The release-kit folder's path is left out, marked […], because this repository is public.)

**Owner's « go » (2026-11-24, after the operator showed the checklist), verbatim:**

> Go

| Step | When (UTC) | Evidence |
| --- | --- | --- |
| Pre-checks (read-only) | 15:46:41 | PR head `9d67598227e628c571bd8fa2544a753e6c158085`, base `7582c91` = `main` (the #213 merge), mergeable; Verify run 45419634414 attempt 2 green on that head; ledger exactly 001–136, row 136 MD5 `9dabd82005ef8eb3cc922dae49c4c39b`; catalogue digest equal to the clean-136 pin (no drift); 137's own precondition queries: Q04 0, Q05 (active with no action) 0, Q07 open actions 0, Q07 planned tests 0, Q29 0, converted prospects keeping a planned test 0; 186 active prospects and 186 open actions; D1 journal 99 rows |
| Local rehearsal | before 15:50 | private stack at 136 with Production's `placement_tests` grants: the wrapper's dry run and apply, the post-137 probe, the restore file plus deleting ledger row 137, and a plain `migration up` of 137 giving the wrapper's post-137 digest |
| Merge | 15:51:54 | squash `0bb8f27443abbf8d5de44cd675129393bbb68f14` at the approved head; its tree equals the approved head merged onto `7582c91` |
| Deploy | 15:53:13 | GitHub `Production` deployment `8033071523` `success` (Vercel READY) on `0bb8f27`; the live login page was regenerated after it |
| Drawer on 136, new build | 15:53:58 | rolled-back probe as the receptionist on one prospect: `crm_close_prospect` (the drawer's close) left 0 open actions, `crm_reopen_prospect` (its reopen) left 1 |
| Production dry run | 15:54:07 | `DRYRUN_OK 137 tables=86`; digest equal to the post-137 pin |
| **137 applied** | **15:54:10–12** | the same wrapper ending in `commit`, `lock_timeout` 3 s, `statement_timeout` 120 s |
| Acceptance | 15:54:21 | rolled-back probe (below) |
| Integrations and logs | 15:54–15:57 | intake run 15:55 (below); Postgres errors |

**The guarded wrapper.** One transaction. Before 137's body: ledger exactly 136 rows with row 136 as above and its `created_by` set; 137's objects absent and the D1 functions present; the catalogue digest equal to the clean-136 pin; the D1 journal at 99 rows. Then 137 verbatim (its own Q04, Q05, Q07 and Q29 checks under its table lock) and ledger row 137 (`created_by` copied from row 136). After it, before commit: ledger 001–137 and row 137 equal to the file; the unique index valid and the three deferred triggers enabled; no D1 function left; none of the twelve old wrappers executable by `anon`, `authenticated` or `service_role`; `placement_tests` with no `anon` privilege, no `TRUNCATE` for `authenticated`, which keeps `SELECT` and `DELETE`; every other table and function grant, the online functions and policies, `anon` execute and the cron jobs unchanged; the row counts of all 86 app tables unchanged; the digest equal to the post-137 pin.

**Proofs after the apply (read-only):** ledger 001–137, none missing; row 137 MD5 `ae431dc7b1d61525cafb75e39d8c5f73` (one statement, name `crm_one_next_action_enforce`, `created_by` equal to row 136's); catalogue digest equal to the post-137 pin (functions 544, triggers 181, indexes 287, constraints 782, columns 1151, relations 92, policies 186), which a plain `migration up` of 137 also gives.

**Acceptance (15:54:21 UTC; one transaction ending in a sentinel exception as the receptionist, so nothing persisted; statuses, codes and counts only):**
- **Structure:** `crm_tasks_one_open_per_lead` unique, valid and ready; the three deferred triggers present (`crm_next_action_presence` on `crm_leads` and on `crm_tasks`, `crm_planned_test_placement` on `placement_tests`); D1 functions left: 0.
- **The twelve old wrappers,** each called as the receptionist, refused with `42501`: `crm_add_note`, `crm_record_call_outcome`, `crm_record_whatsapp`, `crm_record_conversation`, `crm_record_conversation_decision`, `crm_qualify_lead`, `crm_schedule_task`, `crm_complete_task`, `crm_cancel_task`, `crm_close_lost`, `crm_close_not_qualified`, `crm_reopen_lead`.
- **`placement_tests` grants:** `anon` has no table or column privilege; `authenticated` has no `TRUNCATE`.
- **Five commands on one active prospect,** each followed by `SET CONSTRAINTS ALL IMMEDIATE` (the checks COMMIT runs): « Noter un échange » · « Pas de réponse » → 1 open action; « Changer » → « En attente » without a date → 1; an appointment booked with a test → 1, carrying its test; close (« Perdu ») → 0, the test cancelled; reopen → 1.
- **Counts unchanged** after both probes: prospects, the sum of prospect versions, open actions (186) and placement tests.
- **Meta intake:** the 15:55 UTC run, the first after 137, succeeded and its request answered HTTP 200; all intake jobs are `done`.
- **Postgres:** no error since 15:30 UTC other than the release's own sentinels (two probe sentinels and the dry run's).

**Reviewer's findings on `9d67598` (READY FOR FINAL REVIEW) and how each was resolved at release:**
- **I1 — the restore file's `placement_tests` grants come from a local build, not Production.** Production was read before any write: `anon` holds `SELECT`, `DELETE`, `TRUNCATE`, `REFERENCES`, `TRIGGER` and `MAINTAIN` on the table (so Production is on a PostgreSQL version with `MAINTAIN`), and `INSERT` and `UPDATE` on exactly the thirteen columns the file names; `authenticated` holds `TRUNCATE`. That is exactly what the file re-grants. A local stack given Production's grants, then 137, then the restore file, returns the same privileges; only the order of the ACL entries changes (`anon` last), so after a restore the catalogue digest's `columns` and `relations` parts would differ from the clean-136 pin while the grants are the same. No Production-specific restore was needed.
- **I2 — run 137's preconditions just before the window; the migration sets no `lock_timeout`.** The precondition queries were run read-only at 15:46:41 UTC, all 0 (and 0 converted prospects keeping a test); the wrapper set `lock_timeout` to 3 s, so a busy table would have refused the apply rather than queued CRM writes behind it.
- **Nits, not fixed (follow-ups):** two browser suites accept any `check_violation` instead of the `crm_next_action.exactly_one` hint; 137's header comment says the wrappers are revoked « from authenticated » while the code revokes them from `public`, `anon`, `authenticated` and `service_role` (same effect); in `set_next_action`, the branch that moves a planned test from a closed duplicate can no longer be reached (harmless).

**Recovery:**
- **Undoing 137** needs the owner's separate approval: run `scripts/rollback/137_crm_one_next_action_enforce_restore.sql`, then delete ledger row 137 (both rehearsed on the private stack). The application can stay on the A2 build: its close and reopen use commands that exist since 136.
- **A restore does not bring back D1 or `d1_revert`:** the D1 functions stay dropped and `set_next_action` keeps its 137 body (136 minus the D1 bypass). The D1 journal and its 99 rows are untouched.
- **Release kit:** the wrappers, probes, generators and their outputs are kept by the owner outside this repository.

**Not verified:** a new Meta lead through intake on 137 (none arrived after 15:15 UTC); the screens in a signed-in browser (the changed dialog's code loads only after sign-in); Vercel runtime errors (no connector access to the team).

**Known follow-ups (not started; each needs its own approval):**
- **24 public tables** still grant `DELETE` and `TRUNCATE` to `anon` and `authenticated` (listed in the PR #214 description); a separate hardening PR.
- `test-crm-phase3-concurrency.py` (calls `crm_record_call_outcome`, `crm_add_note`, `crm_schedule_task`, `crm_complete_task`) and `test-crm-phase7-concurrency.py` (calls `crm_qualify_lead`) are not wired into CI and call revoked wrappers, so they fail if run.
- The reviewer's three nits above.
- Pre-existing, not caused by A2: `crm_get_today` fails with `invalid input syntax for type time` on legacy non-CRM tests with malformed times.

**Gates after this release (at the time):** release A (A1, D1, A2) complete. **Next: B1 and C1** (C1 released 2026-11-26, [release record](#release-record-pr-c1--2026-11-26)), which can run in parallel; then B2 (needs the 2026/2027 programme prices, OD-16), C2 and data steps D3–D7, each with the owner's separate approval.

### Implementation record: PR C1 (payments, migration 138)

**Owner approval (Maroine, 2026-11-25), decisions and scope lines verbatim:**

> Decisions: OD-2 = A (« Réserver sans paiement » = a charge with a due date linked to the prospect; no enrollment, no seat, no conversion; ADR-015 kept). OD-7 = A (only the director voids receipts).
>
> The prospect's next action « Encaisser l'acompte » after « Réserver sans paiement » MUST go through set_next_action and satisfy the 137 triggers. No bypass, no change to the one-action rule, and no second open action.
>
> Not authorized: Production, data steps, merge, release.

Migration 138: C1 merges first and PR B1 rebases onto it as 139 (owner, 2026-11-25). Implemented, not merged, not applied anywhere but private local stacks (at the time; released 2026-11-26, [release record](#release-record-pr-c1--2026-11-26)).

**What `138_desk_payments.sql` does.**

- **Precondition.** Refuses (`55000`) unless `crm_enroll_and_collect` is the 127 body (prosrc md5 `84babfb6…`), `create_charge_payment` is the 127 body (`2263c8d7…`), `crm_security.action_label` is the 136 body (`fae61b36…`) and migration 137's `crm_tasks_one_open_per_lead` exists.
- **`crm_charge_reservations`.** Prospect ↔ charge link (charge unique), RLS on, no API grant, append-only trigger (`eap.reservation_append_only`).
- **`get_open_balances(student)`.** Requires `manage_finance_operations`. Every live, not voided charge with a balance from `charge_balances`, oldest first (`created_at, id`), with the enrollment status and `reserved_lead_id` while the reserving prospect is still open and unconverted.
- **`find_duplicate_receipts(student, charge, amount, date)`.** The §6.1 rule: `same_charge` (same learner, amount, day and charge) or `recent_by_you` (same staff member, same learner, within 2 minutes); live receipts only, at most 5.
- **`crm_enroll_and_collect`.** Re-created from the 127 body. The payment may name `charge_id` (an unlinked live commitment of the same learner, programme and year, validated under lock, else `eap.commitment_unavailable`); without it, a new tuition charge next to an unlinked live charge of the same programme and year is refused (`eap.unlinked_commitment_exists`) unless `new_session` is true. A zero payment on a commitment is refused (`eap.payment_required`). No `service_role` EXECUTE (as at 127).
- **`crm_reserve_without_payment(request_key, data)`.** Enrolment-intent lock, replay through `crm_command_requests`, prospect, programme, level, price and due-date checks (due date from the business date to one year), new or existing learner as in `crm_start_enrollment`, refusals next to an unlinked commitment or an active enrollment, then the charge through `create_charge_payment_financial` (payment 0, stable key), the reservation row, one primary history entry and the next action through `crm_security.set_next_action` (`enrollment_followup`, reminder, due on the due date, instructions « Encaisser l’acompte »). The 137 index and deferred triggers check the result; no bypass. Granted to `authenticated` only (no `service_role` EXECUTE, as for `crm_enroll_and_collect`).
- **`crm_security.action_label`.** The 136 body with one change: the enrolment action written by `crm_reserve_without_payment` is labelled « Encaisser l’acompte » on every view (invariant 9). The marker is structured: the task's source key (`reservation:<lead>:<request>:next-action`, source kind `enrollment`), not the instruction text, so a reschedule keeps the label and an edited instruction does not change it.
- **`crm_security.set_next_action`.** The 137 body (prosrc md5 `0b48aedd…`, checked in the precondition) with one block: when an « Encaisser l’acompte » action is replaced by another enrolment action (« Changer » to a new date, or an exchange that keeps the enrolment step) while its reservation is open (a live charge without an enrollment), the new action carries the marker (source kind `enrollment`, key `reservation:<lead>:moved:<command>:next-action`). A different kind of action, a close or the payment ends it. The restore file re-creates the 137 body and checks its md5.
- **Rows.** The migration writes no row. **Restore file:** `scripts/rollback/138_desk_payments_restore.sql` (refuses while reservation rows exist unless exported; restores the 127 and 136 bodies and checks their md5; keeps reserved charges and open actions as ordinary rows). Restore and re-apply were run on the private stack.

**Application.**

- `src/components/finance/PaymentPanel.jsx` and `src/lib/finance/paymentPanel.mjs`: the open-balance chooser (« Encaisser sur cet engagement »), the amounts, all errors at once and the duplicate panel, shared by `ReceiptForm.jsx` and `CrmEnrollmentDialog.jsx`.
- « Encaisser » (`ReceiptForm.jsx`): reads `get_open_balances`, opens on the oldest open balance, shows a reserved charge with « Ouvrir le prospect » only, a zero payment needs a due date (« Réserver sans paiement »), the duplicate panel replaces `window.confirm`.
- Wizard (`CrmEnrollmentDialog.jsx`): step 1 is one click when nobody matches; level re-filled when the programme changes back; « Encaisser sur cet engagement » / « Nouvelle session »; « Encaisser maintenant » / « Réserver sans paiement »; every payment error at once; « La remise dépasse le prix » inline; the duplicate check; a reservation result screen.
- Receipts list: « Avec solde » (`?solde=1`), French programme labels, no repeated session or service; « Reste aujourd’hui ».
- Void page and intake review: one idempotency key per form opening (reused while the request is unchanged; a lock against double submit).
- « Ajouter un prospect » with « Inscrire maintenant » opens « Inscrire et encaisser » after the save (day script 2 « one flow »; `CrmActionDialog.jsx`, `CrmWorkspace.jsx`).
- Error texts for the new reasons (`membershipActions.mjs`, `enrollmentErrors.mjs`); `taskTitle` shows « Encaisser l’acompte » for task rows.

**Interpretations — confirmed by the owner (Maroine, 2026-11-25), verbatim:**

> - Approved: « Réserver sans paiement » from Encaisser without a prospect = a commitment with a required price and due date, no payment, linked to the learner; from the wizard, linked to the prospect.
> - Approved: the action_label change in 139.

(« 139 » in this quote is the migration's provisional number at the time; it is 138.)
> - Approved: « Inscrire maintenant » opens the wizard after the prospect is created.

As implemented:

1. On « Encaisser » (no prospect on that screen), « Réserver sans paiement » is the existing zero-payment commitment of the learner; the screen requires a price above zero and a due date (the server keeps the 127 commitment rules and does not require the due date there). Only the CRM wizard links a reservation to a prospect, where the server requires both, and sets « Encaisser l’acompte ».
2. The label change in `action_label` is in 138 so that the card, drawer, Tâches row and calendar agree (invariant 9); the instructions alone did not reach the server label.
3. « Inscrire maintenant » on a new prospect now goes straight to the wizard (needed for day script 2 at ≤ 12, one flow).

**Owner review of PR #216 (2026-11-25), item 3, verbatim:**

> Close the residual on the server: a direct create_charge_payment (or any other payment path) must not pay a reserved commitment, because that would create a payment without an enrollment (ADR-015). Paying a reserved commitment must go through the enrol-and-collect path. Add a test. Also confirm the server guard against a second tuition charge covers every path that creates a tuition charge, not just crm_enroll_and_collect. If one doesn't, guard it or list it.

Done by section 7 above. Paths that pay a reserved commitment: every one (the receipt trigger, including service-role writes) except « Inscrire et encaisser » on its own prospect. Paths that create a tuition charge, all guarded against a second charge next to an unlinked commitment: `create_charge_payment` at « Encaisser » (section 7), `crm_enroll_and_collect` (section 4) and `crm_reserve_without_payment` (section 5); `create_charge_payment_financial` is the only function that inserts charges or receipts and is not API-executable.

Listed, not guarded: a direct service-role insert into `charges` (no application code does it; operator data steps follow their own approval); and a new charge paid onto an enrollment the staff chose, by design.

Outside the one-commitment rule, unchanged on purpose and listed: a payment at « Encaisser » that creates a new charge while the learner has an active enrollment of the same programme and year (and no unlinked commitment) is still attached to that enrollment, as before 138 (the 127 behaviour; a further charge on an enrolled learner, for example another package, is not an NF-4 commitment).

**Independent review of PR #216 at `67522a6` (2026-11-25): CHANGES REQUIRED. Owner decisions (Maroine, 2026-11-25), verbatim:**

> Fix B1: make crm_security.reserved_commitment_receipt_guard() SECURITY DEFINER with search_path pinned and EXECUTE kept revoked from every API role, so an ordinary service_role receipt on an unreserved charge works exactly as at 137, and a reserved one is refused with eap.reservation_collect_on_prospect. Rewrite the test to run under « set local role service_role » for both cases.
>
> Fix B2: send new_session only when the user explicitly chose « Nouvelle session » (f.newSession); show another open prospect's reservation with « Ouvrir le prospect » (not selectable); never land on « Nouvelle session » after a refusal. Add a browser test of the screen after a reservation_collect_on_prospect refusal, and a server test that a second tuition charge without an explicit new_session is refused.
>
> Nits: revoke service_role EXECUTE on crm_reserve_without_payment, as for crm_enroll_and_collect. Base the « Encaisser l'acompte » label on a structured marker, not the instruction text, if it stays small; otherwise list it.
>
> Merge order: C1 merges FIRST. Renumber your migration to 138 (and the rollback file and every test that names it). B1 will rebase onto you as 139 and do the integration (E.164 for the reservation's new learner, reservations following prospect merges). Don't change B1's files.

The reviewer's full text was not pasted into the implementation session; the fixes follow the owner's decisions above.

- **B1.** The receipt guard is `SECURITY DEFINER` with `search_path = pg_catalog, pg_temp`; EXECUTE stays revoked from `public`, `anon`, `authenticated` and `service_role`. Before, as `SECURITY INVOKER`, every service-role receipt with a charge failed with `42501` (the service role cannot read reservations or prospects); the old test ran as the owner. `test-desk-payments.sql` now runs both cases under `set local role service_role` (checking that this role cannot read those tables): a receipt on an unreserved charge is written, one on a reserved charge is refused with `eap.reservation_collect_on_prospect`. With the guard switched back to invoker the suite fails with `42501`, as the review found.
- **B2.** The wizard sends `new_session` only when the staff clicked « Nouvelle session ». A commitment reserved for another open prospect is shown with « Ouvrir le prospect » (link to that prospect) and is neither selectable nor chosen by default; the wizard opens on the oldest selectable commitment. With commitments listed and neither one nor « Nouvelle session » chosen, it shows « Choisissez l’engagement à encaisser, ou « Nouvelle session ». », hides the new-price fields and sends nothing. After a refusal that re-reads the balances it opens on the oldest selectable commitment or on no choice, never on « Nouvelle session ». Tests: `test-payment-panel.mjs` (selection helpers); `test-payment-screens-browser.mjs` (another prospect's wizard, a submit with no choice, and the screen after a `reservation_collect_on_prospect` refusal reached through a stale balance read); `test-desk-payments.sql` (a second tuition charge with `new_session` false or absent is refused).
- **Nits.** `crm_reserve_without_payment` and `crm_enroll_and_collect` have no `service_role` EXECUTE (tested). The server label uses the task's source key (above, tested both ways).
- **Renumbered** to 138 with its restore file, every test that names it and the upgrade-lane ceilings (`max = 138`, 138 in the lists).

**Re-review of PR #216 at `84e8432` (2026-11-25): CHANGES REQUIRED, one finding (invariant 9).** The Opportunités list rendered `taskTitle(lead.next_task)`, whose payload has no instructions or source key, so it showed « Finaliser l’inscription » where the card, drawer, Tâches and calendar show « Encaisser l’acompte ». Fixed as the reviewer proposed: the list renders `lead.next_action.label` (as `OpportunityCard` does), the action dialog's result card renders `result.next_action.label`, `taskTitle` lost its instruction-text branch, and `test-payment-screens-browser.mjs` checks the list row.

**Owner decision (Maroine, 2026-11-25), verbatim:**

> Owner decision (Maroine, 2026-11-25): moving an « Encaisser l'acompte » action to a new date with « Changer » (same enrolment kind, same open reservation) keeps the « Encaisser l'acompte » label on every screen. The marker carries over to the new action. Only a different kind of action, a close or a payment ends it. Implement it in 138 (not applied yet) through set_next_action, with a test. Record my decision verbatim in the plan's implementation record.

Implemented in 138 through `set_next_action` (above). `test-desk-payments.sql` moves the action twice with `crm_change_next_action` (one open action each time, a new action carrying the marker, the label kept, the previous action replaced), then checks that another kind of action, a close (and a reopen to an enrolment action) and the payment end it.

**Residuals (not in this PR).**

- Prices are typed (no catalogue until PR B2).
- Integration with PR B1 (E.164 for the reservation's new learner, reservations following prospect merges) is B1's, as migration 139.

**Tests.**

- New: `test-desk-payments.sql` (grants and roles, `get_open_balances`, the duplicate rule and window, reservation refusals, success, replay, conflict, append-only, label, the guard and its scope, the section-7 guards on « Encaisser » by every staff role, another prospect, a service-role receipt, a closed prospect, « Autre », another year, a chosen enrollment next to a next-session deposit and a retry; rolled back; fails with either guard removed, or with the receipt guard as invoker), `test-receipt-idempotency-local.mjs` (invariant 13 over HTTP: double click, retry, two tabs, two staff, void double click, receptionist void refused, wizard double submit, reservation double click and races; the 138 guards with two staff at once — two commitments, and collecting a reservation from its card while « Encaisser » tries it; 42 checks), `test-payment-panel.mjs` (unit, in `npm test`), `test-payment-screens-browser.mjs` (invariant 12 in both screens, « Encaisser sur cet engagement », the duplicate panel on both screens, the OD-2 reservation and its collection, « Avec solde »), `scripts/lib/desk-payments-local.mjs` (clean-up of payment fixtures).
- Day scripts 2 (12 actions, ≤ 12, one flow) and 9 (3 actions, ≤ 4, opens on the balance) added to `test-reception-day-scripts-browser.mjs`.
- Changed for the new behaviour, assertions otherwise unchanged: `test-crm-rcc-a2-browser.mjs`, `test-crm-rcc-b1-browser.mjs`, `test-crm-phase6-browser.mjs` (one-click step 1; phase6 chooses « Nouvelle inscription » before the new-charge checks), `test-receipt-client-regressions.mjs` (no `window.confirm`).
- `test-crm-rcc-a2.mjs` and `test-membership-actions.mjs` read the eap.* refusals from 138 too: every one has the same French text on the client, and the wizard's table maps exactly the server's refusals. (Verify at `fec11c2` failed because `test-crm-rcc-a2.mjs` still read the server's refusals from the 127 file only; the seven C1 reasons already had their French messages. Three C1 server texts were aligned with them word for word, and the two section-7 reasons were added.)
- `test-receipt-charge-payments.sql`: the catalog loop's zero-payment commitments use school year 2028/2029, so the suite's later 2026/2027 payments without a chosen enrollment are not second charges next to them; no assertion changed.
- `test-payment-screens-browser.mjs`: « Avec solde » waits for the filtered rows before counting (Verify at `fec11c2` counted during the reload on the runner).
- Upgrade-lane ceilings to 138; `receptionist-function-classification.json` regenerated (three new functions, gate `manage_finance_operations`).

**Release notes (for a later approval; followed on 2026-11-26, [release record](#release-record-pr-c1--2026-11-26)).** Apply 138 first, then deploy the application within minutes (the C1 build calls the new functions; the previous build keeps working on 138 except that « Encaisser » refuses a new tuition charge without a chosen enrollment next to an unlinked commitment, and every path refuses a payment on a commitment reserved for an open prospect). Rollback: deploy the previous build, then run the restore file.

### Release record: PR C1 — 2026-11-26

**MERGED / DEPLOYED / MIGRATION 138 APPLIED / PRODUCTION VERIFIED WITH BOUNDED ACCEPTANCE (2026-11-26).** Migration 138 was applied at 07:56:49–57 UTC, before the application. PR #216 was then squash-merged as `a7f63c4` and deployed. Desk payments are live: one open-balances read for both payment screens, « Encaisser sur cet engagement », no second tuition charge without « Nouvelle session », « Réserver sans paiement » with its « Encaisser l'acompte » action, and the payment guards on every path. B1 (#217) is next and rebases as 139.

**Owner's release approval (2026-11-25), verbatim** (the release-kit and backup folder paths are left out, marked […], because this repository is public):

> You are the release operator (AGENTS.md, docs/ai/templates/PRODUCTION_ROLLOUT.md). Tier 3 Production operation, finance = high risk. You did not write this code.
>
> First, learn how the previous releases were done, and follow the same pattern:
> - read CURRENT_STATE.md and the release records in docs/architecture/plans/receptionist-workflow.md for A1 (migration 136), D1 and A2 (migration 137);
> - read the READMEs and scripts in […] (2026-11-23-migration-136, 2026-11-23-pre-d1, 2026-11-24-migration-137): how Production was reached, the guarded wrapper (preconditions, DRYRUN_OK rehearsal, then commit), the acceptance probes and the backup method;
> - tell me in a few lines how you'll reach Production and apply, before doing anything.
>
> Owner release approval (Maroine, 2026-11-25): I approve releasing PR #216 (RWR-r5 PR C1 — payments, migration 138_desk_payments.sql) at exact head 05bc70874fcd00865cd4df2338ea3d370d9c0bf3. The independent re-review verdict on that head is READY FOR FINAL REVIEW; Verify run 45662379174 is green on the first attempt.
>
> Window: now
>
> 1. Before any write:
>    - head, base and main are current; the Production ledger is exactly 001–137;
>    - 138's md5 preconditions (127's create_charge_payment and crm_enroll_and_collect, 136's action_label, 137's set_next_action) match Production's live bodies;
>    - work out and state the safe order (I expect migration first, then the app), and what an old open tab can do in between;
>    - take a verified backup first, as before D1: into […], never the repo, with size and SHA-256 per file;
>    - right before applying, check there's no payment in progress (receipts in the last few minutes);
>    - show me the checklist and wait for my "go".
> 2. Apply 138 through the guarded wrapper (DRYRUN_OK, then commit, short lock_timeout). Ledger 001–138, row 138 matches the file.
> 3. Squash-merge #216 at that exact head, and verify Vercel Production READY on the merge commit.
> 4. Acceptance, using only rolled-back probes, counts and codes only, leaving no test receipt:
>    - get_open_balances works for the receptionist;
>    - enrol-and-collect gives one receipt with gap-free numbering, an enrollment at payment and the prospect converted;
>    - « Réserver sans paiement » leaves one « Encaisser l'acompte » action, and its charge can't be paid directly (eap.reservation_collect_on_prospect, also as service_role);
>    - a second tuition charge without « Nouvelle session » is refused;
>    - an ordinary service_role receipt still works;
>    - numbering continues without a gap;
>    - void stays director-only;
>    - no new Postgres errors; Meta intake still runs.
>
> Not authorized: B1 (#217), any other migration or data step, the 24-table hardening. Hand off with the merge SHA, deployed SHA, ledger, acceptance results and recovery notes (kit outside the repo); documentation is a separate change.

**Owner's « go » (2026-11-26, after the operator showed the checklist), verbatim:**

> Go

| Step | When (UTC) | Evidence |
| --- | --- | --- |
| Pre-checks (read-only) | 2026-11-25 17:57:55 | PR head `05bc70874fcd00865cd4df2338ea3d370d9c0bf3`, base `495f7df` = `main`, mergeable; Verify run 45662379174 green on attempt 1; ledger exactly 001–137, row 137 MD5 `ae431dc7b1d61525cafb75e39d8c5f73`; 138's four MD5 preconditions equal to Production's live bodies: `crm_enroll_and_collect` `84babfb6…` and `create_charge_payment` `2263c8d7…` (127), `action_label` `fae61b36…` (136), `set_next_action` `0b48aedd…` (137); catalogue digest equal to the post-137 pin (no drift); none of 138's objects present |
| Backup 1 | 2026-11-25 17:58–18:00 | roles, schema, data (including `auth`) and the migration ledger, plus a restore script (below); verified by a restore |
| Local rehearsal | 2026-11-25, before the « go » | a clean 001–137 chain whose digest equals Production's: the wrapper's dry run and apply, a post-138 digest equal to a plain apply of the file, the restore file plus deleting ledger row 138 back to the post-137 digest, then 138 applied again; the acceptance probe on the verified backup restored locally with 138 (copy removed afterwards) |
| Payment check (read-only) | 2026-11-26 07:53:12 | no receipt, charge or financial request in the previous 10 minutes, no lock on the payment tables, no other active session; two receipts had been written at 18:12 UTC after backup 1 |
| Backup 2 | 07:53–07:56 | a fresh backup, taken so that those two receipts are in it; verified by a restore (below) |
| Production dry run | 07:56:45 | `DRYRUN_OK 138 tables=86`; digest and the nine new or replaced function bodies equal to the rehearsed pins |
| **138 applied** | **07:56:49–57** | the same wrapper ending in `commit`, `lock_timeout` 3 s, `statement_timeout` 120 s |
| Proofs (read-only) | 07:57:13 | ledger 001–138, none missing; row 138 MD5 `2037fff7208ad000d9c8c78802d2bf6e` (one statement, name `desk_payments`, `created_by` equal to row 137's; git blob `e81103ee32f35b34f42fe1a2b3881e93aa731775`); catalogue digest equal to the post-138 pin (functions 549, triggers 183, indexes 290, constraints 788, columns 1158, relations 93, policies 186); receipt counter unchanged; 0 reservations |
| Merge | 07:57:23 | squash `a7f63c4ea16b6ec51a7eb0c56a504707bd807327` at the approved head; its tree equals the approved head merged onto `495f7df` |
| Deploy | 07:59:00 | GitHub `Production` deployment `8079623554` `success` (Vercel `english-hills-admin-oqppmh8m5…`) on `a7f63c4`; the live domain answers |
| Acceptance | 07:59:20 | rolled-back probe (below) |
| Integrations and logs | 07:59–08:01 | counts after the probe; intake run 08:00; Postgres errors (below) |

**Old-build window:** about 2 minutes (07:56:57–07:59:00 UTC), with no logged error. During it, the previous build ran on 138 and behaved as before except for two new refusals. « Encaisser » refused a new tuition charge without a chosen enrollment next to a live unlinked commitment of the same learner, programme and year; read-only at 2026-11-25 18:08 UTC, no learner was in that case. The old build cannot create reservations, so the reserved-commitment guard could not fire from it.

**The guarded wrapper.** One transaction. **Before 138's body,** it refused to run unless:
- the ledger held exactly 137 rows, with row 137 as above and its `created_by` set;
- none of 138's objects existed, and the one-action index of 137 did;
- the four replaced functions had the MD5s above;
- the catalogue digest equalled the post-137 pin, and the D1 journal held 99 rows;
- no receipt, charge or financial request had been written in the previous 2 minutes.

It then ran 138 verbatim and inserted ledger row 138 (`created_by` copied from row 137). **After the body, before commit,** it checked:
- ledger 001–138, with row 138 equal to the file;
- `crm_charge_reservations` with RLS on, no grant to `anon`, `authenticated` or `service_role`, its append-only trigger, and empty;
- `receipts_reserved_commitment_guard` enabled, with its function `SECURITY DEFINER`, its `search_path` pinned and not executable by any API role;
- `authenticated` executes the three new public functions, `crm_enroll_and_collect` and `create_charge_payment`, while `service_role` executes neither `crm_reserve_without_payment` nor `crm_enroll_and_collect`;
- every existing table grant and every existing function's grants, `SECURITY DEFINER` flag and settings unchanged, the four replaced functions included;
- the online functions and policies, `anon` execute rights and the cron jobs unchanged;
- no `crm_security` function executable by an API role;
- the receipt counter and the row counts of all 86 app tables unchanged;
- the digest and the nine function bodies equal to the pins.

**Acceptance (07:59:20 UTC).** One transaction, ending in a sentinel exception, so nothing persisted. It ran as the receptionist (and, for the void, the director) on prospects, learners, charges and receipts it created itself inside the transaction, with no e-mail, so no receipt e-mail was queued. Receipt numbers come from the transactional counter table (migration 122), so no number was used up. Statuses, codes and counts only:
- **`get_open_balances`** answered the receptionist (1 row for a learner with an open balance); `find_duplicate_receipts` answered `[]`.
- **« Inscrire et encaisser »** on a qualified prospect gave 1 charge and 1 receipt, numbered next after the counter. The charge was linked to a `Confirmed` enrollment, and the prospect was `CONVERTED` and linked, with 0 open actions.
- **« Réserver sans paiement »** with a new learner left 1 open action, labelled « Encaisser l'acompte » with its due date. It also gave 1 reservation row, a charge with no enrollment and no receipt, no enrollment for the learner, and the prospect still `QUALIFIED`.
- **Paying that charge directly** was refused with `22023` `eap.reservation_collect_on_prospect`, at « Encaisser » as the receptionist and as a `service_role` receipt write.
- **A second tuition charge without « Nouvelle session »** was refused with `22023` `eap.unlinked_commitment_exists`, from the wizard (`crm_enroll_and_collect`) and from « Encaisser » (`create_charge_payment`).
- **An ordinary `service_role` receipt** on an unreserved charge was written, numbered next after the first: numbering without a gap, same series and year.
- **Void:** refused for the receptionist (`42501`), done for the director.
- **After the probe (07:59:48 UTC, read-only):** receipts, charges, enrollments, learners, prospects, open actions, financial requests, reservations (0) and the receipt counter all equal to their values before it.
- **Meta intake:** the 08:00 UTC run, the first after 138, succeeded and `/api/cron/crm-intake` answered HTTP 200 (insights too); all 348 intake jobs `done`.
- **Postgres:** no error between 07:30 and 08:01 UTC other than the release's own: the dry run's and the probe's sentinels, and a read-only check of the operator's that named a wrong column.

**Backups** (each verified by restoring it into an empty private local database: every data table equal to Production row for row; the only differences are the platform's own migration bookkeeping tables in `auth` and `storage`. The local copies were removed). **They hold personal data and are kept by the owner, outside this repository**; they are identified here by size and checksum only:

| Part | Backup 1 (2026-11-25 17:58–18:00 UTC; 123 tables, 15,280 rows) | Backup 2 (2026-11-26 07:53–07:56 UTC; 123 tables, 15,545 rows) |
| --- | --- | --- |
| roles | 297 bytes, `25873cec56a2cc6514e204f420231777f85c03da818caa7090cdcdfa89776ecd` | same file |
| schema | 1,465,947 bytes, `0423a5e7188f0495e750b627c008bf1a728d542c4264a7eec6c62cfc6bdc913a` | same file |
| data (including `auth`) | 11,963,254 bytes, `c1663d7abc1aacc42d59605f6a509f77e3f42ff640592cdef86ff3ef988b3d8e` | 12,138,900 bytes, `9f3e6be82b020e4084a11c86f88f3919b2679d20b358285d76e0ff855b3bc93a` |
| migration ledger | 2,972,452 bytes, `f94ec3e047c03db744db7a5c4217463be0ee7dfdb7c0f0cd6fc7a3fd99ca6650` | 2,972,452 bytes, `4d40a1ee44493357a9df8615c21b847f8c561c0b34b6509bec2573775c8ee030` |
| restore script | 1,039 bytes, `3f1a8e0fc083370535aeb7387f8d2131c3d11fcdebebcb2438a85a59f77e1562` | same file |

**Recovery** (each step needs the owner's separate approval; rehearsed on a private stack):
1. **Redeploy the previous build `495f7df` first.** The C1 build calls `get_open_balances`, `find_duplicate_receipts` and `crm_reserve_without_payment`, which the restore drops.
2. **If `crm_charge_reservations` has rows,** export them to a private file outside the repository and set `eh.restore_138_drop_reservations = 'exported'` in the same session; the restore refuses otherwise.
3. **Run `scripts/rollback/138_desk_payments_restore.sql`, then delete ledger row 138.** Rehearsed: this returns exactly to the post-137 catalogue, and 138 applies again afterwards. The restore puts back the 127 bodies of `crm_enroll_and_collect` and `create_charge_payment`, the 136 `action_label` and the 137 `set_next_action`, each checked by MD5. Charges created by reservations stay as ordinary open commitments, and « Encaisser l'acompte » actions stay open as ordinary enrolment actions.
- **Restoring a backup** follows the [D1 record](#release-record-data-step-d1--2026-11-23)'s caveats (the `NOT VALID` legacy e-mail checks; a superuser); this time no stand-ins for platform tables were needed.
- **Release kit:** the wrappers, probes, generator and their outputs are kept by the owner outside this repository.

**Not verified:**
- the payment screens and the wizard in a signed-in browser;
- a new Meta lead through intake on 138 (the last one arrived at 07:50 UTC, before the apply);
- Vercel runtime errors (no connector access to the team).

Seen, outside the approved checks: `create_charge_payment` called as `service_role` answers `42501`. This is the existing staff-only rule, unchanged by 138.

**Known follow-ups (not started; each needs its own approval):**
- **Reviewer's note:** the action dialog's result card shows the date twice (the « Encaisser l'acompte » label includes it, and the scheduled line repeats it).
- **Reviewer's note:** « payment ends it » is not tested directly on a moved « Encaisser l'acompte » action. The test pays the unmoved action; conversion closes any open action whatever its key.
- **The 24 public tables** that still grant `DELETE` and `TRUNCATE` to `anon` and `authenticated`: a separate hardening PR.
- **A guard for test scripts that reset the shared local stack.** Some suites end with `supabase db reset --local` or read `supabase status` from the current folder, and on 2026-11-25 one wiped the shared default local stack.

**Gates after this release (at the time; B1 released 2026-11-26, [B1 release record](#release-record-pr-b1--2026-11-26)):** C1 released. **Next: B1** (#217), rebased onto 138 as migration 139, with its own review and release approval. Then B2 (needs the 2026/2027 programme prices, OD-16), C2, data steps D3–D7, the 24-table hardening and the local-stack guard; each needs the owner's separate approval.

### Implementation record: PR B1 (M-B1, migration 139)

**Owner approval (Maroine, 2026-11-25), scope lines verbatim:**

> Scope: plan §5.1–5.3 and the PR B1 row of §8 only: phone normalisation (src/lib/phone.mjs plus scripts/fixtures/phone-cases.json); find_people and the header search covering prospects and students; the create gate (duplicates flagged before creating); « C'est la même personne » and « Ajouter un enfant » / siblings; prospect and contact edit; the wrong-number correction that completes A1's « Mauvais numéro »; merges per OD-8 (link, don't move) and person_match_decisions; the D3 and D5 functions, shipped but NOT run. Everything goes through set_next_action and respects the 137 triggers. No bypass, and no change to the one-action rule.
>
> Acceptance: the B1 cells of §8, including day script 3 ≤ 6 and script 8's corrected-number target (3). Script 8's close-in-2 stays with B2.
>
> Not authorized: Production, data steps (D3, D5), merge, release.

**What `139_people_identity.sql` does** (138 until it was rebased onto C1; see « Rebase onto C1 as 139 » below). Every change goes through `set_next_action` and the 137 triggers; the one-action rule, its index and triggers are unchanged. The migration writes no existing row (`scripts/test-people-139-upgrade.mjs`).

- **Phones (§5.1).** `public.phone_e164`, `phone_key`, `phone_is_placeholder`, `phone_mask`, `phone_search_key`, `require_phone` and `person_name_key`, mirrored by `src/lib/phone.mjs` and tested against one fixture (`scripts/fixtures/phone-cases.json`, invented numbers). `crm_security.normalize_phone` delegates to them: « 212… » without « + » is read; a placeholder is no phone. Trigger `people_phone_guard` on `students` and `authorized_adults` normalises and checks only on insert or when the telephone itself changes (P-SYS in `test-phone.sql`). Expression indexes on `phone_key(telephone)`.
- **Search (§5.1, §5.2).** `find_people` (admin, director, receptionist) returns prospects (active and closed) and students (active and archived), with reason, strong flag and sibling count. `phone_key` containment from 6 digits is added to the CRM search (`opportunity_ids`, `crm_search_leads`) and the students list (`search_students_page`); the receipt and Admissions pickers use the new `search_desk_students` (security invoker).
- **Duplicates (§5.2).** `person_match_decisions`; `crm_create_prospect` refuses a strong match (same phone key, or same name key and birth date) with `PT409` `people.possible_duplicate`, the matches in the error detail, until each is answered (`acknowledged_matches`: `same_family` or `different_people`, recorded). `record_person_match_decisions` records the student forms' answers.
- **Prospects (§5.3).** `crm_create_prospect`: `contact_id` (« Ajouter un enfant »: same contact, no contact fields, no duplicate flag) and `same_person` (« C'est la même personne »: learner = contact, `contact_kind='adult_learner'`), plus the A1 first exchange. `crm_update_prospect`: version-checked; only changed fields; one « Fiche modifiée » history entry with before → after, phones masked; `people.no_change` when nothing changed; returns the refreshed duplicate candidates, never blocks. `crm_log_exchange` with `corrected_phone` (« Mauvais numéro »): next must be « keep » (`people.corrected_phone_keep`), the number on file is refused (`people.phone_unchanged`); the new number meets the same duplicate gate as a create (`people.possible_duplicate` until each other person on it is answered; pairs answered before are not asked again; siblings on the contact are skipped); the contact's number is replaced and a new call sequence starts on it; history « Mauvais numéro · numéro corrigé », phones masked. `crm_get_workspace_detail` adds the contact's id and version, siblings, `merged_from`, `merged_into_lead_id` and duplicate candidates.
- **Merges (§5.3, OD-8 = A).** `crm_merge_prospects` and `crm_merge_contacts` (director, admin, `crm_security.require_merger`; both version-checked on both records, `PT409` when stale); `student_merge_preview`, `merge_students`, `unmerge_student`, `student_merge_set` (see deviation 1 for prospects). A merged student is hidden from lists, search and enrollment candidates; its file redirects to the kept one, which reads finance, attendance, tests and enrollments through `student_merge_set`. Only family links, authorized adults and unconverted prospects are re-pointed, each journalled in `student_merge_journal` and undone by `unmerge_student`. Refusals: `people.merge_direction` (the source has live enrollments: the dialog swaps), `merge_both_live`, `people.merge_source_balance` (the merged-away file has an unvoided charge still to pay, open or partly paid: « Encaissez ou soldez d'abord le solde de ce dossier »; the preview and the D5 plan report `source_open_balance`), `merge_both_portal`, `merge_already`, `merge_same`, `merge_target_closed`, `merge_source_appointment`, `merge_both_converted`.
- **Tâches (deviation 5).** `crm_get_work_queue` (body from 137): one row per contact in each bucket.
- **D3 and D5.** `crm_security.d3_rows`, `d3_plan`, `d3_apply(counts)`, `d3_revert`, `d5_plan(pairs)`, `d5_apply(plan, pairs)`: shipped, **not run**, not executable by any API role. `d5_plan` reports, per pair, every refusal of `student_merge_check`, including `people.merge_source_balance` with the amount; `d5_apply` refuses a plan that holds one.
- **Restore.** `scripts/rollback/139_people_identity_restore.sql` restores the fifteen re-created functions to the bodies 138 left live (`normalize_phone` from 080; `set_next_action`, `create_charge_payment`, `crm_enroll_and_collect` and `crm_reserve_without_payment` from 138) and checks their md5 afterwards, drops every 139 function, both triggers and both phone indexes; it keeps the additive tables, the two student columns with their checks and index, and every row. It refuses unless 139 is applied, while D3 is unreverted or while a student is merged. It runs before C1's restore, which refuses while 139 is applied. Tested by `test-people-139-upgrade.mjs` (functions, triggers and policies equal to 138; a second run refuses). 139 creates the additive tables, columns, checks and indexes only if absent, so it can be applied again after the restore; the test re-applies it (same catalog as the first 139, kept rows survive) and restores again.
- **Table privileges.** `person_match_decisions` and `student_merge_journal`: no privilege for `anon`, `authenticated` or `service_role` (as C1 did for its table); only the security-definer commands write them.

**Screens.** « Rechercher une personne » (sidebar button and a mobile top-bar icon; `PeopleSearch.jsx`); the gate in « Ajouter un prospect » (`DuplicateGate.jsx`), the student form, the receipt's « Nouvel apprenant » (`usePeopleGate.jsx`) and the CSV import (dry run « Vérifier les doublons », per-row « Ne pas créer » / « Créer quand même (personne différente) », import only after the dry run); « C'est la même personne » (ticked while the learner is empty) and « Ajouter un enfant »; « Modifier la fiche » (`ProspectEditDialog.jsx`); the drawer's people block (siblings, merged-from note, unanswered candidates, « Fusionner » for the direction; `LeadPeopleSection.jsx`, `MergeDialog.jsx`); « Numéro corrigé » in `ExchangeDialog.jsx`; on the student file, « Fusionner avec une autre fiche » and « Annuler la fusion » for the direction (`StudentMergeEntry.jsx`); phones checked in every write path (`checkPhone`) and shown « 06 12 34 56 78 » wherever a stored phone is displayed or printed (deviation 8). The guide (`GuideContent.jsx`) describes the search, the gate, « Ajouter un enfant », « Modifier la fiche », the corrected number and the Tâches row per contact.

**Deviations (for review).**

1. **Prospect merge links, it does not move.** §5.3 says the prospect merge moves submissions, activities and the placement link. Implemented as OD-8's rule for students: the source keeps its history under its id and is linked (`merged_into_lead_id`); its next action is closed by `set_next_action` (cause `merge`, « Prospect fusionné »); the target's history reads the merge set. A source with an appointment or enrolment action, or a planned test, is refused (`merge_source_appointment`): the receptionist moves or cancels it first, so no action or test is carried over. A converted source is refused (the converted one is kept). Reason: activities are immutable, and moving them would need a trigger exemption.
2. **No catalogue fields.** `programme_code`, `origin_code` and `referrer` (§5.3) wait for B2, where the catalogues exist. `crm_update_prospect` edits the current `session_type` and `program_interest_text` instead.
3. **`crm_create_manual_lead` stays granted and ungated.** The deployed A2 build calls it; the B1 screens call only `crm_create_prospect`. Follow-up: revoke it once B1 is deployed.
4. **Student create gate in the client.** §5.2 has the student create paths call `find_people` server-side. `StudentForm`, the receipt's « Nouvel apprenant » and the import call `find_people` before creating and record the answers through `record_person_match_decisions` after; `save_receptionist_student` and the payment commands do not refuse. Reason: those are RPW-r2 and finance command bodies whose contracts this PR would otherwise change. The prospect gate is server-side as planned.
5. **Tâches: one row per contact in each bucket (contract change).** Day script 4 (« one Tâches row ») needs siblings grouped. `crm_get_work_queue` returns one row per contact and bucket (review of #217: grouping across buckets hid a sibling due today behind an overdue row); within a bucket: the row of the earliest next action, with `family` = the contact's other active learners, each with its own next action (invariant 9 stays visible). Counts are per contact. `test-crm-work-calendar-browser.mjs` and `test-crm-row-staff-labels-browser.mjs` now expect the `family` key. `test-crm-work-calendar.sql` and `test-crm-receptionist-ux.sql` run at 136/137 only (their fixture's per-prospect shapes; unchanged).
6. **« C'est cette personne »** opens the existing record; « Nouvelle opportunité » on an existing student (§5.2) is not in B1.
7. **Found during the receptionist classification review and fixed here:** `student_merge_set` is security invoker (as definer it let any signed-in user read merge links of any id); `crm_security.student_candidates` (CRM enrolment) no longer offers a merged student. Both are in the restore file.
8. **Phones displayed in the national form everywhere.** Since 139 a new receipt copies the E.164 phone, so every place a stored phone is shown, printed or exported goes through `formatPhoneFr`: the receipt PDF and print (`receiptPhone`), the finance receipt list, the student file, form and lists, the CSV export, the Annuaire, the group roster and its student picker (which also matches the national form), the enrollment dialogs, the authorized adults (list, editor, parent portal), the CRM drawer, « Noter un échange », the action dialog, « Modifier la fiche », the intake review, the receipt form and its picker, and the teachers' list and file. Links (`tel:` through `telHref`, `wa.me`) keep E.164; a foreign number keeps its international form; an unreadable old value is shown as typed and gives no link. Stored receipts are never rewritten. Forms show the national form and send an unchanged number back exactly as stored. No e-mail, notification or edge function contains a phone. `test-receipt-phone.mjs` pins the receipt and scans the sources for a raw rendering.

**Acceptance (§8, B1 cells), local private stack, Postgres 17.6, 2026-11-25.**

- Day scripts (`test-reception-day-scripts-browser.mjs`): 3 walk-in « reviendra après la paie » **6** (≤ 6); 4 mother with two children **8** (≤ 10), one contact, two learners, no decision recorded, one Tâches row listing the other learner; 5 current family calling **3** (≤ 3), any phone format, opens the student file, nothing created; 8 wrong number corrected **3** (≤ 3), E.164 stored, one new `contact_attempt`, one history entry. Script 8 close stays at the A1 ceiling 4 (B2). Scripts 0, 1, 6, 7, 10 and 11 unchanged and passing.
- Invariant 6: `test-phone.mjs` (27 cases, 12 search pairs) and `test-phone.sql` (with P-SYS and the D3 rehearsal); `test-people-search-browser.mjs`: header search, CRM search, students list, Annuaire and receipt picker, each with 6 formats; the create gate; the student form.
- Invariant 7: `test-people-duplicates.sql` (gate, decisions, siblings, same person, edit, corrected number and its duplicate gate, `find_people` grants, Tâches per contact and bucket with sibling A overdue and B today, invariant 7 on the fixture).
- Merges: `test-people-merge.sql` (refused while the merged-away file owes: partly paid, unpaid, voided and kept-file cases, preview and D5 plan; contact merge version check; no history row changed, balance of both, links re-pointed and restored, converted prospect kept, source out of lists, search and enrollment candidates; direction and refusals; D3 and D5 plans and apply refusals).
- **Re-run at 139 on C1's 138, private stack `rwrb1`, 2026-11-26:** `test-people-139-upgrade.mjs`; the 51 rollback-only suites of the sql-and-concurrency shard (with `test-desk-payments.sql` and its 139 section, `test-people-merge.sql` §4c); classification (206 functions, 91 policies), capability parity, online pinned; build, lint, `npm test`; `test:reception-browser` (day scripts 0–11 with C1's 2 = 12 and 9 = 3, B1's 3 = 6, 4 = 8, 5 = 3, 8 = 3; payment screens; people search), portal readiness, work calendar, row staff labels, receptionist, `test:crm-opportunities-browser`, UI foundation, `test-receipt-idempotency-local.mjs` (42 checks). All pass.

**Changed existing tests.**

- **Assertions changed for B1 behaviour:**
  - `test-crm-phase4-browser.mjs`: « Ajouter un prospect » with an existing number now meets the gate first (nothing created until each match is answered « Même famille, autre personne »); the new prospect then opens directly and the answers are recorded (`same_family`). The yellow « Contact existant possible » block stays for e-mail-only matches, so this phone case no longer shows it. Teardown deletes the run's `person_match_decisions`.
  - `test-receptionist-browser.mjs`: the reloaded record after the stale edit shows the stored number in the national form (deviation 8); the authorized adult reads « Parent · 06 … » (formatted) and is stored in E.164.
  - `test-crm-work-calendar-browser.mjs`, `test-crm-row-staff-labels-browser.mjs`: the Tâches row keys include `family` (deviation 5).
  - `test-student-placement-browser.mjs`: the CSV import runs « Vérifier les doublons » before « Importer ».
  - `test-no-retry-conflicts-local.mjs` (112–116 lane): the normal save after the quiet period reads the phone back in E.164.
  - `test-portal-readiness-browser.mjs` (review of #217): the teacher group page is also checked for the national display form of the child's phone and for the digits without the leading zero.
  - `test-ui-foundation-browser.mjs`, `test-crm-phase4-browser.mjs`, `test-crm-rcc-b1-browser.mjs`: the drawer, the exchange dialog and the WhatsApp link show the national form (deviation 8); the link targets are unchanged, and the drawer shows no E.164 text.
  - `test-receipt-client-regressions.mjs` (static): the payment page's second argument also carries `recordPeople`; the group expression it pins is unchanged.
  - `scripts/lib/online-room-harness.mjs`: the Sidebar outline lists `{searching} PeopleSearch` (a dialog in a portal, no box in the page), so `test-online-room-unit.mjs` still proves the harness copies the shell.
  - `test-people-search-browser.mjs` opens the students list with « Tous les statuts » (a student without an enrollment is a Prospect).
- **Weekday defects found by Verify run 45784920732 (a Thursday), pre-existing on 138:** `test-crm-phase5.sql` moved its test « date_test+1 » at 11:30 from a booking on « today + 2 », which is Saturday on a Thursday, so the move landed on the closed Sunday (`crm_hours.outside_opening` from the 136 reschedule check); `test-crm-phase11.sql` booked « current_date+2 » at 10:30, the closed Sunday on a Friday. Both now take the date from the server (`pg_temp.open_day`: the first centre date on which that time is inside the current opening hours, as `scripts/lib/centre-days.mjs` does for the Node suites); no assertion and no hours check changed. Reproduced on 138 and 139 with the centre clock set to Thursday 08:40 and 23:30 (and passing on Wednesday and Friday); after the fix both suites pass with the centre clock on every weekday. A sweep of the other suites (CI SQL shard, the commit-time runner, the 106-lane regressions, the Python and Node suites) found no other booking or move at a raw clock date that the hours checks see.
- **Harness stubs for the new reads:** `test-navigation-components.mjs` (its `next/navigation` stub exports `useRouter`, which the header search imports) and `test-ui-foundation-browser.mjs` (its RPC mock answers `student_merge_set` with the file itself).
- **Fixture-only (invented valid numbers instead of placeholders or invalid values the trigger now refuses):** `test-audit-remediation.sql`, `test-batch4a-security.mjs`, `test-batch3a-security.mjs`, `test-receipt-charge-payments.sql`, `test-receptionist-batch1.sql`, `test-receptionist-dossier-teaching.sql`, `test-portal-readiness-browser.mjs` and `test-portal-readiness.mjs` (digits instead of hex characters; their leak checks look for the national and the E.164 forms), `test-batch4c-storage-enforcement.mjs` (its forged-photo denial now sends a valid invented number, so the photo is still what is refused), the import page's sample CSV.
- **Teardown:** `scripts/lib/crm-next-action-local.mjs` (`removeStaff`) deletes the staff's `person_match_decisions` and `student_merge_journal` rows (guarded: the tables do not exist on the upgrade lanes).
- **Upgrade-lane ceilings raised to 139:** `test-conflicts-without-retry-upgrade.mjs`, `test-crm-batch2-upgrade-current.sql`, `test-crm-h3-upgrade-103-current.sql`, `test-crm-r4-upgrade-100-current.sql`, `test-crm-r4-upgrade-102-current.sql`, `test-premium-retirement-upgrade-113-current.sql`.
- **Fixture:** `receptionist-function-classification.json` gains the 18 new functions (`crm_merge_contacts` with its two expected versions, md5 of the version-checked body). Manual outcomes: `find_people` and `record_person_match_decisions` open; `crm_merge_prospects`, `crm_merge_contacts`, `merge_students`, `unmerge_student` and `student_merge_preview` locked (refused in `test-receptionist-locked-items.sql`: 80 locked functions).
- **New:** `test-phone.mjs`, `test-receipt-phone.mjs`, `test-phone.sql`, `test-people-duplicates.sql`, `test-people-merge.sql`, `test-people-search-browser.mjs`, `test-people-139-upgrade.mjs`.
- **CI:** `npm test` adds `test-phone.mjs` and `test-receipt-phone.mjs`; `test:reception-browser` adds `test-people-search-browser.mjs`; the sql-and-concurrency shard adds the three people SQL suites; the 112–116 shard adds « People identity 138 to 139 upgrade and restore ».

**Independent review of #217 at `3a2e455` (CHANGES REQUIRED) and the owner's decisions, 2026-11-25.**

| Finding | Owner decision | Done |
|---|---|---|
| Blocking 1: a merged student's open balance cannot be collected | refuse the merge (`people.merge_source_balance`), in D5's plan | `student_merge_check` refuses while the merged-away file has an unvoided charge still to pay; preview and D5 plan carry `source_open_balance`; `test-people-merge.sql` |
| Blocking 2: Tâches grouped across buckets hides a sibling | partition by contact and bucket | `crm_get_work_queue`; `test-people-duplicates.sql` §3b and §3c (A overdue, B today) |
| the migration cannot be re-applied after its restore | guard the additive DDL | `if not exists` (constraints in a guarded block); re-apply step in `test-people-139-upgrade.mjs`; restore comment (`normalize_phone` from 080) |
| Portal leak check misses the display form | add it | `test-portal-readiness-browser.mjs` |
| Corrected number skips the duplicate check | same gate as a create | `crm_log_exchange` + « Noter un échange » shows the gate |
| `crm_merge_contacts` has no version check | add it | two expected versions, `PT409` when stale |
| Receipt « Mettre à jour les contacts » refuses an old malformed phone when only the e-mail changes | fix | an unchanged stored phone is not re-checked and is sent back as stored (`test-receipt-phone.mjs` pins it) |
| `service_role` keeps full privileges on the two people tables | revoke, as C1 | revoked in 139 |
| « Local incident » description | correct it (no guard in B1) | PR description |

**Rebase onto C1 as 139 (owner, 2026-11-26).** C1 (#216) merged as `a7f63c4`; migration 138_desk_payments applied on Production on 2026-11-26. B1 was rebased onto it and renumbered 139. Each item of the owner's rebase list:

| Rebase item | Done |
|---|---|
| The merge refusal also covers open reservations (`crm_charge_reservations`) | `student_merge_check` counts the merged-away file's open reservations (charge not voided; prospect not merged, not enrolled, not converted, lost or not qualified) and refuses with `people.merge_source_balance`; the preview and the D5 plan carry `source_open_reservations`. `test-people-merge.sql` §4c, `test-desk-payments.sql` |
| Prospect merges check reservations directly | `crm_merge_prospects` refuses an open source with an open reservation: `people.merge_source_reservation` (« La fiche à fusionner a un acompte réservé : encaissez-le (« Inscrire et encaisser ») ou annulez-le d'abord. »). `test-people-merge.sql` §4c |
| C1's open balances, duplicate check and NF-4 follow the merge set or are covered by the refusal | `get_open_balances` and `find_duplicate_receipts` are unchanged: a merge is refused while the merged-away file owes or holds a reservation, and a merged file takes no new charge, payment or reservation (`eap.student_merged`, « Ce dossier a été fusionné dans un autre : encaissez sur le dossier conservé. ») in `create_charge_payment` and `crm_reserve_without_payment`. NF-4 (one unlinked commitment) reads `student_merge_set` in `create_charge_payment`, `crm_enroll_and_collect` and `crm_reserve_without_payment`, so a commitment on the merged file blocks a second one on the kept file. `test-desk-payments.sql` (139 section) |
| `crm_reserve_without_payment` stores the new learner's phone in E.164 | the new learner's telephone goes through `crm_security.normalize_phone`; a placeholder gives no phone. `test-desk-payments.sql` |
| The five silent ceiling files and the upgrade test | the six ceiling files above at 139; `test-people-139-upgrade.mjs` runs 138 → 139 and its CI step resets to 138 |
| `ReceiptForm.jsx` keeps both features | C1's reservation and duplicate checks run first, then B1's phone check and duplicate gate; an unchanged stored phone is still sent back as stored |
| B1's restore runs before C1's | `138_desk_payments_restore.sql` refuses while `find_people` exists: « run scripts/rollback/139_people_identity_restore.sql first » |
| C1's fixtures that call `crm_create_manual_lead` | `test-desk-payments.sql`, `test-receipt-idempotency-local.mjs` and `test-payment-screens-browser.mjs` create their prospects with `crm_create_prospect` (distinct invented phones) |
| md5 preconditions match the bodies 138 left live | section 0 of 139 checks the fifteen bodies it re-creates (C1's `set_next_action`, `create_charge_payment`, `crm_enroll_and_collect`, `crm_reserve_without_payment` and the eleven unchanged since 137) and refuses with `55000` if one differs; the restore checks the same md5s after restoring. `action_label` (re-created by C1) is not re-created by 139 |

Also: `set_next_action` is C1's body with B1's `merge` cause; the `eap.student_merged` reason is in `EAP_REASON_TEXT` and `EAP_REASONS` (step 1, reselect); `test-membership-actions.mjs` and `test-crm-rcc-a2.mjs` read the hints of 138 and 139 together. Fixture: `crm_merge_prospects` keeps its reviewed outcome, locked, with the md5 of its new body; C1's three payment functions keep their gate `capability:manage_finance_operations`.

**Release notes for B1 (for the release approval; nothing here is authorized).** Followed on 2026-11-26 ([B1 release record](#release-record-pr-b1--2026-11-26)).

1. Apply 139 (after 138, live since 2026-11-26), then deploy the B1 build: the B1 screens call 139's functions; the deployed C1 build keeps working on 139 (`crm_create_manual_lead` and every C1 call are unchanged; a payment or reservation on a merged file is refused, and no file is merged before the B1 build).
2. Rollback: deploy the C1 build, then run `139_people_identity_restore.sql` (always before C1's restore, which refuses while 139 is applied). It refuses while a student is merged (`unmerge_student` first) or D3 is unreverted (`d3_revert` first).
3. D3 and D5 each need their own approval with counts (§10); D3 is rehearsed in `test-phone.sql`.


### Release record: PR B1 — 2026-11-26

**MERGED / DEPLOYED / MIGRATION 139 APPLIED / PRODUCTION VERIFIED WITH BOUNDED ACCEPTANCE (2026-11-26).** Migration 139 was applied at 11:22:30–32 UTC, before the application. PR #217 was then squash-merged as `15909d6` and deployed. People identity is live: one phone rule (stored in E.164 on every new or changed student and authorized-adult phone), « Rechercher une personne » (`find_people`) across prospects and students, the duplicate gate before a prospect is created, « Ajouter un enfant » and « C'est la même personne », « Modifier la fiche », the corrected number, prospect and student merges for the direction (« link, don't move »), and Tâches grouped per contact in each bucket. Data steps D3 (phones) and D5 (student merges) are shipped as functions and **not run**.

**Owner's release approval (2026-11-26), verbatim** (the backup folder path is left out, marked […], because this repository is public):

> Owner release approval (Maroine, 2026-11-26): I approve releasing PR #217 (RWR-r5 PR B1 — people, migration 139_people_identity.sql) at exact head d22a50b0d2923e0a10c70a48dc0cea8bbf3a3ffe. The independent re-review verdict on that head is READY FOR FINAL REVIEW; Verify run 45802217196 is green on the first attempt.
>
> Window: now, before reception opens at 15:00.
>
> Same pattern as C1:
> 1. Before any write:
>    - head and base are current (main 19615b7 merges cleanly); the Production ledger is exactly 001–138;
>    - 139's 15 md5 preconditions match Production's live bodies;
>    - state the safe order (I expect migration first, then the app) and what today's app does on 139 in between: student and authorized-adult phone writes under the new trigger, the Tâches per-family grouping, the changed crm_merge_contacts signature;
>    - check how many existing student and authorized-adult phones are malformed, and confirm the trigger only acts on insert or phone change, so nothing existing is blocked;
>    - take a fresh verified backup into […] (never the repo), with size and SHA-256;
>    - show me the checklist and wait for my "go".
> 2. Apply 139 through the guarded wrapper (DRYRUN_OK, then commit, short lock_timeout). Ledger 001–139, row 139 matches the file.
> 3. Squash-merge #217 at that exact head, and verify Vercel Production READY on the merge commit.
> 4. Acceptance, rolled back only, codes and counts only:
>    - find_people works for the receptionist and is refused for teacher, parent and student;
>    - a phone typed as « 06 … », « +212 … » or with spaces finds the same person;
>    - the create gate flags a duplicate before creating;
>    - « Ajouter un enfant » keeps one open action per prospect;
>    - a student merge is refused with an open balance (people.merge_source_balance) and with a reservation;
>    - the merge functions are refused for the receptionist;
>    - D3 and D5 exist and are not executable by any API role;
>    - one action per active prospect still holds;
>    - C1's payment refusals still hold, plus eap.student_merged;
>    - Tâches per family per bucket;
>    - no new Postgres errors; Meta intake still runs.
>
> Not authorized: D3, D5 or any data step, any other migration, the hardening. Hand off with the merge SHA, deployed SHA, ledger, acceptance results and recovery notes (B1's restore must run before C1's); documentation is a separate change.

**Owner's « go » (2026-11-26, after the operator showed the checklist), verbatim:**

> Go

**One correction to the approval's premise:** `crm_merge_contacts` did not exist in Production before 139. Its signature changed only inside PR #217, during its review (the two expected versions). Neither the C1 build nor the B1 screens call it, so the old build had nothing to break.

| Step | When (UTC) | Evidence |
| --- | --- | --- |
| Pre-checks (read-only) | 11:09:26–11:10:14 | PR head `d22a50b0d2923e0a10c70a48dc0cea8bbf3a3ffe`, base `a7f63c4`; main `19615b7` (one docs commit ahead) merges cleanly; Verify run 45802217196 green on attempt 1; ledger exactly 001–138, row 138 MD5 `2037fff7208ad000d9c8c78802d2bf6e` with `created_by` set; the 15 bodies 139 re-creates equal to its section-0 MD5s (C1's `set_next_action`, `create_charge_payment`, `crm_enroll_and_collect`, `crm_reserve_without_payment`; `command`, `opportunity_ids`, `normalize_phone`, `student_candidates`, `crm_get_timeline`, `crm_get_work_queue`, `crm_get_workspace_detail`, `crm_search_leads`, `crm_start_enrollment`, `save_receptionist_student`, `search_students_page`); catalogue digest equal to the post-138 pin (no drift since C1); none of 139's functions, tables, columns, triggers or indexes present |
| Phones and exposure (read-only) | 11:09:26–11:10:14 | students: 253, of which 21 with no phone, 15 already in E.164, 215 readable but not yet in E.164, 1 placeholder, 1 unreadable; authorized adults: 0. No contact with two or more active prospects; no merged prospect or contact. Profiles: no `parent` account exists |
| Backup | 11:11:34–11:13:50 | roles, schema, data (including `auth`) and the migration ledger, plus a restore script (below); verified by a restore |
| Local rehearsal | before the « go » | a clean 001–138 chain whose digest equals Production's: the wrapper's dry run and apply, equal to a plain apply of the file (digest and 50 function bodies); the restore file, then 139 applied again; on the backup restored locally, 139 applied with no existing row and no stored phone changed, and the acceptance probe (copy removed afterwards) |
| In-flight check (read-only) | 11:22:11 | no receipt, charge, financial request or student written in the previous 10 minutes; no lock on the people, CRM or payment tables; no other active session; counts equal to the backup's, so the backup stood |
| Production dry run | 11:22:17 | `DRYRUN_OK 139 tables=87`; digest and the 50 new or replaced function bodies equal to the rehearsed pins |
| **139 applied** | **11:22:30–32** | the same wrapper ending in `commit`, `lock_timeout` 3 s, `statement_timeout` 120 s |
| Proofs (read-only) | 11:22:41 | ledger 001–139, none missing; row 139 MD5 `1f22f6b1782569c9a76e98b9e49d86b9` (one statement, name `people_identity`, `created_by` equal to row 138's; git blob `5ff11842226cc9cfaba9c919440ecf7d73152dd7`); catalogue digest equal to the post-139 pin (functions 584, triggers 185, indexes 298, constraints 803, columns 1179, relations 95, policies 186); receipt counter unchanged; no merged student; both people tables empty |
| Merge | 11:22:49 | squash `15909d6084cd859556b553d48a0d4254b5ba86fb` at the approved head; its tree equals the approved head merged onto `19615b7`, and its 139 file is the one applied |
| Deploy | 11:24:24 | GitHub `Production` deployment `8083842940` `success` (Vercel `english-hills-admin-9qbxblqdh…`) on `15909d6` |
| Acceptance | 11:24:46, 11:25:16 | the first probe stopped at setup and wrote nothing; the second passed (below) |
| Integrations and logs | 11:25–11:26:30 | counts after the probe; intake run 11:25; Postgres errors (below) |

**Old-build window:** about 2 minutes (11:22:32–11:24:24 UTC). The C1 build ran on 139 and behaved as before, except:
- **Phone writes.** The new trigger acts only when a student or authorized adult is created or its phone changes. A readable number was stored in E.164 (the old build shows it as stored until the B1 build formats it); an unreadable or placeholder number, or a blank authorized-adult phone, was refused with `22023`, which the old build shows as its generic error. Existing rows were not affected: on the restored backup, the placeholder and the unreadable phone both accepted an update of another column and an unchanged phone written back.
- **Tâches.** `crm_get_work_queue` returns one row per contact in each bucket. The old build ignores the new `family` key; with no contact holding two active prospects, it showed the same rows.
- « Ajouter un prospect » in the old build still calls `crm_create_manual_lead`, unchanged by 139.

No student was written during the window.

**The guarded wrapper.** One transaction. **Before 139's body,** it refused to run unless:
- the ledger held exactly 138 rows, with row 138 as above and its `created_by` set;
- no function with any of 139's new names existed in any overload, nor its tables, student columns, triggers or indexes, while C1's reservations table and A2's one-action index did;
- the 15 re-created functions had the MD5s above;
- the catalogue digest equalled the post-138 pin, the D1 journal held 99 rows, and every active prospect had exactly one open action;
- no receipt, charge, financial request or student had been written in the previous 2 minutes.

It then ran 139 verbatim and inserted ledger row 139 (`created_by` copied from row 138). **After the body, before commit,** it checked:
- ledger 001–139, with row 139 equal to the file;
- `person_match_decisions` and `student_merge_journal`: RLS on, no privilege for `anon`, `authenticated` or `service_role`, both empty; no student merged;
- the `people_phone_guard` trigger enabled on both tables, `BEFORE INSERT OR UPDATE OF telephone`, and both phone indexes valid;
- **no stored student or authorized-adult phone changed** (one fingerprint of every row's phone, before and after);
- `authenticated` executes the eleven new public commands and reads, `anon` none of them; no API role executes D3, D5 or the three `academic_security` merge functions;
- every existing table grant and every existing function's grants, `SECURITY DEFINER` flag and settings unchanged;
- the online functions and policies, `anon` execute rights, the cron jobs and the receipt counter unchanged;
- every definer function with a pinned `search_path`, and no `crm_security` function executable by an API role;
- one open action per active prospect, and the row counts of the 87 existing app tables unchanged;
- the digest and the 50 function bodies equal to the pins.

**Acceptance (rolled back; statuses, codes and counts only).** One transaction ending in a sentinel exception, so nothing persisted. It ran as the receptionist, the director, the teacher and the student account, and on prospects, contacts, learners, charges and a reservation it created itself. Production has no parent account, so the probe also created a synthetic one (`auth.users` and its profile, no e-mail) inside the same transaction. No receipt was written.

**The first attempt (11:24:46 UTC) stopped at setup.** Production's `on_auth_user_created` trigger creates a `pending` profile for every new `auth.users` row; the restored backup does not carry that trigger, so the rehearsed probe inserted the profile a second time and hit `profiles_pkey`. The whole transaction rolled back: a read-only check at 11:25:01 found no such user, no such profile and no probe prospect or learner. The probe was changed to turn the trigger's profile into the parent account, tested locally, and run again at 11:25:16.

| Check | Result |
| --- | --- |
| `find_people` by role | receptionist answered; teacher, parent and student refused, `42501` |
| One search, any phone format | the new prospect found by phone typed as « 06 xx xx xx xx », « 06xxxxxxxx », « +2126xxxxxxxx », « +212 6 xx xx xx xx », « 002126xxxxxxxx » and with dashes |
| « Ajouter un prospect » | contact phone stored in E.164; 1 open action |
| Create gate | the same number again, typed with spaces: `PT409` `people.possible_duplicate`; no prospect created |
| « Ajouter un enfant » | same contact, one contact for the number; 1 open action on each prospect |
| Tâches | « today »: 1 row for the contact, with the other learner in `family` |
| Merge commands as the receptionist | `merge_students`, `unmerge_student`, `student_merge_preview`, `crm_merge_prospects`, `crm_merge_contacts`: each `42501` |
| Student merge with an open balance (director) | preview and merge refused: `22023` `people.merge_source_balance` |
| « Réserver sans paiement » (new learner) | 1 reservation; the new learner's phone in E.164; 1 open action |
| Student merge with a reservation, no balance (director) | preview and merge refused: `22023` `people.merge_source_balance` |
| Prospect merge of the reserving prospect (director) | refused `22023` `people.merge_source_appointment`: its « Encaisser l'acompte » action is checked first, before `people.merge_source_reservation` (that refusal is tested locally in `test-people-merge.sql` §4c) |
| C1's payment refusals | paying the reserved charge: `eap.reservation_collect_on_prospect`; a second tuition charge at « Encaisser »: `eap.unlinked_commitment_exists` |
| A student merge with nothing owed (director) | done; linked, 1 journal row; the merged file hidden from `find_people` |
| « Encaisser » on the merged file | `22023` `eap.student_merged` |
| D3, D5 and the merge cores | all present; none executable by `anon`, `authenticated` or `service_role` |
| One action per active prospect | 0 exceptions at commit time |
| Receipts | none written; counter unchanged |

- **After the probe (11:25:27 UTC, read-only):** receipts, charges, learners, prospects, contacts, open actions, reservations, person-match decisions, merge journal, D1 journal and the receipt counter all equal to their values before it; no probe row left.
- **Meta intake:** the 11:25 UTC run, the first on the B1 build, succeeded and `/api/cron/crm-intake` answered HTTP 200; all 348 intake jobs `done`.
- **Postgres:** no error between 11:20 and 11:26:30 UTC other than the release's own: the dry run's and the probe's sentinels, and the first probe's `profiles_pkey`.

**Backup** (verified by restoring it into an empty private local database: 124 tables, 15,584 rows, every data table equal to Production row for row; the only differences are the platform's own migration bookkeeping tables in `auth` and `storage`. The local copy was removed). **It holds personal data and is kept by the owner, outside this repository**; it is identified here by size and checksum only:

| Part | Backup (2026-11-26 11:11:34–11:13:50 UTC) |
| --- | --- |
| roles | 297 bytes, `25873cec56a2cc6514e204f420231777f85c03da818caa7090cdcdfa89776ecd` |
| schema | 1,493,369 bytes, `5b83307f752267b5dc69ed0f6d16c61a8e98f533631977ed0337c19e6522340b` |
| data (including `auth`) | 12,165,948 bytes, `80679605718a3d8528d874a9d8e2cd68e121b8d8f82f45614d765b906278aa8e` |
| migration ledger | 3,049,826 bytes, `6fc75c8e8022e744014b1c10b2c7f9358fd16ba0aad31964966e278d7e0fe4b2` |
| restore script | 1,039 bytes, `f5a3efa2273059f45a72169a6844c8c3c50933f5bce64bc43d8a8d137a5968e2` |

**Recovery, in this order; each step needs the owner's separate approval** (rehearsed on a private stack):
1. **Redeploy `19615b7` first** (GitHub deployment `8080442579`; the same application code as C1's `a7f63c4`). The B1 build calls `find_people`, `crm_create_prospect`, `crm_update_prospect` and the merge commands, which the restore drops.
2. **If any student was merged,** run `unmerge_student` for each; **if D3 ever ran,** run `crm_security.d3_revert()`. The restore refuses otherwise.
3. **Run `scripts/rollback/139_people_identity_restore.sql` with plain `psql -f`**, not `psql -1`: the file opens and commits its own transaction. Rehearsed: functions, triggers and policies return exactly to 138. It keeps `person_match_decisions`, `student_merge_journal`, the two student merge columns with their checks and index, and every row; 139 can be applied again afterwards (rehearsed).
4. **Delete ledger row 139.**
5. **Only then, and only if C1 must go too, C1's restore** (`scripts/rollback/138_desk_payments_restore.sql` as on `main`, which refuses while `find_people` exists), following the [C1 record](#release-record-pr-c1--2026-11-26)'s steps; its first step then redeploys a pre-C1 build.
- **Release kit:** the wrappers, probes, generator and their outputs are kept by the owner outside this repository.

**Not verified:**
- the B1 screens in a signed-in browser (search, the gate, « Ajouter un enfant », « Modifier la fiche », the corrected number, the merges, the national phone display);
- that the live domain serves the new build (GitHub deployment status only);
- a new Meta lead through intake on 139;
- Vercel runtime errors (no connector access to the team).

**Phones not changed by this release:** 215 student phones stay in their old stored form until someone edits them or data step D3 runs; the placeholder and the unreadable one stay as stored. D3 needs its own approval with counts.

**Known follow-ups (not started; each needs its own approval):**
- **Reviewer's note:** `scripts/test-crm-h3-upgrade-103-current.sql` checks that the ledger reaches 139 but its label still says « upgraded to current 138 ». It is a test script, so it is outside this docs-only change.
- **Reviewer's note:** the header of `scripts/rollback/139_people_identity_restore.sql` is out of date. It says « A student merged in B1 shows again in the lists », but the restore refuses while any student is merged. Nearby wording also lags the code: the refusal is described as « a D3 or D5 run journalled and not reverted » (the code checks for any merged student), and ledger row 139 is said to be removed « by the operator wrapper » (the operator deletes it).
- **Deviation 3:** revoke `crm_create_manual_lead` now that the B1 build is deployed.
- C1's two reviewer notes (the result card shows the date twice; « payment ends it » not tested directly on a moved « Encaisser l'acompte » action).
- **The 24 public tables** that still grant `DELETE` and `TRUNCATE` to `anon` and `authenticated`.
- **A guard for test scripts that reset the shared local stack.**

**Gates after this release (at the time; D3 and D5 run 2026-11-26, [D3 record](#release-record-data-step-d3--2026-11-26), [D5 record](#release-record-data-step-d5--2026-11-26)):** B1 released. **Next:** data steps D3 (phones) and D5 (student merges), each with the owner's approval of its counts; B2 (needs the 2026/2027 programme prices, OD-16, since replaced); C2; data steps D4, D6 and D7; the 24-table hardening; the local-stack guard. Each needs the owner's separate approval.

### Release record: hotfix PR #220 — 2026-11-26

**MERGED / DEPLOYED / VERIFIED BY USE (2026-11-26).** The director's « Annuler ce paiement » on `/receipts/[id]/edit` did nothing on Production from the C1 deployment (2026-11-26 07:59:00 UTC) until this fix was deployed (12:49:51 UTC). No migration; the ledger stays 001–139.

- **Cause:** C1 (#216) added a double-submit lock to the page and chained `.finally()` on `getBrowserClient().rpc(...)`. The Supabase query builder is thenable but has no `.finally()`, so the click threw before any request: the button stayed on « Annulation… », no `void_financial_receipt` request was sent and no receipt changed.
- **Fix:** the lock is released with `try`/`finally` around the awaited call; same RPC, payload, idempotency key and error handling. `scripts/test-receipt-client-regressions.mjs` now refuses `.rpc(...).finally()` on the edit and delete pages; it fails on the old page and passes on the fix.
- **Review and merge:** independent review READY on head `df2a0534a20cbf67646da788d5a68ff0fd9c14e3`; Verify run `45816575291` green on attempt 1. Merged with the owner's explicit « merge #220 » as squash `b730234629a04bb6e6ba15ff6340b278605159d1` at 12:48:30 UTC.
- **Deploy:** GitHub `Production` deployment `8085664333`, `success` at 12:49:51 UTC (Vercel `english-hills-admin-nqf9kca2v…`) on `b730234`.
- **Use on Production:** the director then voided the three test receipts EH-2026-00459, EH-2026-00460 and EH-2026-00461 through the app, between 12:50:27 and 12:51:19 UTC, with the reason « Test (audit CRM 21/11) ». A read-only check confirmed each is voided by the director account with that reason, and the receipt counter is unchanged (EH 470): numbering has no gap. These are the receipts D6 keeps, voided (§10).
- **Not verified:** a browser test that clicks « Annuler ce paiement » (follow-up below).

### Release record: data step D3 — 2026-11-26

**D3 RUN AND VERIFIED (2026-11-26).** `crm_security.d3_apply` committed at **12:35:16–12:36:18 UTC** (journal `run_at` 12:35:18 UTC) with exactly the counts the owner approved: **229 changes** (students 216, contacts 13). The read-only post-checks are clean. No migration, merge or deployment.

**Preparation approval, owner's words (2026-11-26), verbatim:**

> Owner approval (Maroine, 2026-11-26): prepare data step D3 (phones) of plan RWR-r5 §10, using the D3 functions shipped in migration 139. Tier 3 Production operation, same pattern as D1.
>
> Part 1, now, read-only only:
> - confirm the ledger is 001–139 and D3 has never run;
> - run crm_security.d3_plan() read-only and show me the counts per category (already E.164, missing « + », missing leading 0, separators, placeholder → NULL, unnormalisable), with up to 5 sample ids per category (ids only, no numbers or names). Compare them with R0 Q11 (181 students: 83 standard, 34 without « + », 29 without leading 0, 28 malformed) and explain any difference;
> - list the unnormalisable rows by id and type only, for manual correction later;
> - prepare the apply checklist: a verified backup, the guarded wrapper with exact expected counts, the post-checks, and d3_revert;
> - then STOP and wait for my approval of the exact counts.
>
> Part 2, only after I approve the counts AND say "go", outside reception hours:
> - take a fresh verified backup;
> - run d3_apply with the approved counts;
> - run the post-checks: no phone changed outside the plan, search still finds every person, one action per active prospect still holds;
> - report.
>
> Not authorized: D5 or any other data step, any migration. Documentation of D3 is a separate change.

**Counts approval, verbatim (12:02 UTC)** — the answer to: approve these exact counts, including the recovery companion for 12 contact fields, the 2 e-mail case changes and +216 activity-log rows:

> Approve counts

**First « go », verbatim (12:03 UTC):**

> Go

**The batching change.** At 12:11 UTC, before anything was written, the owner sent a batched approval to prepare D3, D6 (test data) and D7 (group class days) together, with one backup, one approval and one window. The operator stopped the D3 run and found that **D6 and D7 have no shipped functions** (only D3 and D5 exist in 139) and that `groups.class_days`, which D7 fills, does not exist yet (it comes with C2). The owner then decided, verbatim (12:14 UTC):

> Owner decision (Maroine, 2026-11-26): run D3 alone today with the counts I approved at 12:02 (229 changes). go — now, in the 12:30–15:00 window, before reception opens. Re-run the write check first; if anything changed since the 12:04 backup, take a new verified backup before applying. Then the post-checks and report. D6's functions will ship inside PR B2 (migration 140); D7 goes with C2. Don't build anything yourself.

**Approved counts** (`d3_plan()` on Production, read-only, 11:50–12:00 UTC):

| Rows | E.164 already | National form | No « + » | No leading 0 | Separators | Placeholder | Unreadable |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Students (232 with a phone, 21 without) | 15 | 119 | 47 | 45 | 4 | 1 | 1 |
| Contacts (`phone_e164`, `whatsapp_e164`) | 377 | 6 | 6 | — | — | 1 | 10 |

R0 Q11 (2026-11-21) counted 181 students; Part 1 counted the 253 students of 2026-11-26 in finer categories. **Changes: 229** = students 216 (215 to E.164 and 1 placeholder emptied; 2 of them archived) and contacts 13 (12 empty E.164 columns filled from the raw column, 1 placeholder emptied).

| Step | When (UTC) | Evidence |
| --- | --- | --- |
| Read-only pre-check | 11:58 | ledger 001–139; journal holds D1's 99 rows only; D3 and phone function bodies equal to the pin; no merged student; no authorized adult; 570 people findable by phone, 0 missing |
| First backup | 12:04:02–12:06:22 | verified by a restore; superseded (below) |
| Write check | 12:30:55 | CRM commands at 12:10 and 12:28, after the first backup (students and contacts untouched), so a new backup was taken, as the owner required |
| Backup used | 12:31:03–12:32:52 | verified by restoring it into an empty private database: 126 tables and 15,659 rows equal (platform bookkeeping only differs); the wrapper's dry run passed on the copy; copy removed |
| Write check | 12:34:05 | nothing written since the backup; no student, contact, receipt or charge written in 10 minutes; no lock; counts equal to the approved ones |
| Production dry run | 12:34:12–12:35:12 | `DRYRUN_OK`: 229 changes, the expected counts after, search 570/0 |
| **D3 applied** | **12:35:16–12:36:18** | the same wrapper ending in `commit`, `lock_timeout` 3 s, `statement_timeout` 300 s, run as the director |
| Read-only post-check | 12:36:52 | below |
| Postgres logs | 12:30–12:42 | only the dry run's and the post-check's sentinels; no error |

**The guarded wrapper** refused to run unless the ledger was exactly 001–139 with row 139 as released, D3 had never run, the journal held 99 rows, the function bodies matched the pin, the counts equalled the approved ones exactly, the set of empty contact columns and the set of e-mails the student trigger could lower-case were the ones shown, every person was findable by phone, and no student or contact had been written in the previous 2 minutes. After `d3_apply`, before commit, it checked that no phone changed outside the plan, every planned phone held its proposed value, every other student and contact column and every unplanned row was unchanged byte for byte, the receipt counter was unchanged and only the journal and the activity log grew.

**Post-checks (read-only, statuses and counts only):**

| Check | Result |
| --- | --- |
| Ledger | 001–139, unchanged |
| Journal | step `d3`: students 216, contacts 13, every row run by the director; D1's 99 rows unchanged |
| `d3_plan()` after | students E.164 230, unreadable 1; contacts E.164 389, placeholder 1 (the raw column keeps it, by design), unreadable 10: equal to the expected counts |
| Search | 570 people findable by phone, 0 missing (the same as before) |
| One action per active prospect | 0 exceptions |
| Finance | receipt counter EH 470, receipts 361 and charges 338 unchanged |
| Activity log | +216 rows (3,095 → 3,311), phones redacted |
| Phone guard | the trigger enabled on both tables |
| Side effect | the students' e-mail trigger lower-cased the e-mail columns of 2 students (case only), as shown before the approval |

**Left for manual correction: 11 unreadable numbers** (1 student, 10 contacts). D3 leaves them as stored; reception corrects them by hand.

**Rehearsal** (before the approval, on the pre-139 backup restored locally with 139 applied; same counts as Production): the dry run and the apply (229 changes, every fingerprint held); a second run refused (`D3_PRE_ALREADY_RUN`); wrong counts refused by the wrapper and by `d3_apply` itself; `d3_revert` restored 229 rows. Students' phones came back exactly; 12 contact fields that were empty before stayed filled, so a companion script empties them, after which the contacts came back exactly. The copy was removed.

**Recovery (each step needs the owner's separate approval):**
1. `crm_security.d3_revert()` as the director: restores every journalled phone from its raw value.
2. The companion script kept in the owner's release kit: empties the 12 contact fields that were empty before D3 (`d3_revert` re-fills them from the raw column).
3. The 2 lower-cased e-mails come back only from the backup.
- D3 must be reverted before 139's restore can run.

**Backup used** (verified as above; it holds personal data and is kept by the owner outside this repository, identified by size and checksum only):

| Part | Backup (2026-11-26 12:31:03–12:32:52 UTC) |
| --- | --- |
| roles | 297 bytes, `25873cec56a2cc6514e204f420231777f85c03da818caa7090cdcdfa89776ecd` |
| schema | 1,572,127 bytes, `569f6f166e666443794819ab5eb63919a51b2c4d89df403f0bcc8b207bde20b8` |
| data (including `auth`) | 12,222,977 bytes, `2bdf6b43a6954d243221073dcb6701a172887a474fb323133c840a9e57071528` |
| migration ledger | 3,288,739 bytes, `bd8abe9a37aa36aff8b0c07ea13c1079b0995d2be97d9431241d9542cba57b4e` |
| restore script | 1,038 bytes, `8dc847fa801a4d055744f8ff9c3c1fba5df2683ecfd64681c51792b58dcaf7e0` |

The superseded first backup (12:04:02–12:06:22 UTC, data 12,195,723 bytes, `e57ca8356c3d4590d276b59d16eae6b596ce4c880e1f0fc0d951860cea53ca54`) is also kept by the owner.

**Not verified:** a new Meta lead through intake after D3; the phones as shown on the desk screens in a signed-in browser.

### Release record: data step D5 — 2026-11-26

**D5 RUN AND VERIFIED (2026-11-26).** `crm_security.d5_apply` merged **2 pairs approved by the owner**, committed at **13:14:35–13:15:36 UTC** (merge time 13:14:37 UTC). Nothing moved between files (no portal link, authorized adult or prospect was attached to the merged files). The read-only post-checks are clean. No migration, merge or deployment. Names, ids and phone numbers stay out of this repository: the pairs were shown to the owner in the chat only.

**Preparation approval, owner's words (2026-11-26), verbatim:**

> Owner approval (Maroine, 2026-11-26): prepare data step D5 (student merges) of plan RWR-r5 §10, using the D5 functions shipped in 139. Tier 3, same pattern as D3.
>
> Part 1, read-only:
> - now that phones are clean (D3), list the candidate duplicate learner pairs (Q28 logic and the B1 match rules: same E.164 phone, same name, same email, same parent);
> - show me each pair HERE in the chat, not in the repo: both names, masked phone (last 4 digits), date of birth, enrollments, receipts and open balance for each, and which file you'd keep and why;
> - mark any pair that the merge would refuse (open balance or reservation on the file being merged away), with what would unblock it;
> - then STOP. I'll reply with the pairs I approve.
>
> Part 2, only after I list the approved pairs and say "go", outside reception hours: fresh verified backup, d5_plan(pairs) dry run, merge_students per pair in one journalled transaction, post-checks (each merged file hidden from search, payments refused on it, kept file shows the history, one action per active prospect), report, with unmerge_student available for each pair.
>
> Not authorized: any other data step or migration, or docs yet.

**Pairs approval, verbatim (12:58 UTC)** — 2 pairs approved by the owner, from the list shown in the chat:

> Approve pairs 1 and 2

**« go », verbatim (13:05 UTC):**

> Go

**Part 1 (read-only, counts only).** 25 candidate pairs were examined (the Q28 name rule, the B1 match rules, and a check for the same letters or one name inside the other; e-mails shared by more than four students, which are placeholders, were left out). In each pair the file kept is the one with the live enrollment, as `student_merge_check` requires:
- **2 mergeable duplicates**, proposed and approved;
- **1 duplicate refused** (`people.merge_both_live`: both files have a live enrollment), pending until the desk ends the enrollment on the file to merge away;
- 8 sibling pairs (both live, refused), 10 pairs among the test records (both with portal access, refused; they belong to D6) and 2 pairs judged not to be the same person: not proposed.

| Step | When (UTC) | Evidence |
| --- | --- | --- |
| Read-only dry plan | 12:58 | `d5_plan(pairs)` for the 2 approved pairs: no refusal, nothing to move |
| Rehearsal | 12:58–13:04 | below |
| Read-only pre-check | 13:04, again 13:05:46 | `PRECHECK_OK`: 570 people findable by phone, 0 missing |
| Backup | 13:06:02–13:12:00 | roles and schema first; the first data dump lost its connection (SSL EOF) and was taken again at 13:10:53–13:12:00; verified by restoring it into an empty private database: 126 tables and 16,170 rows equal (platform bookkeeping only differs); copy removed |
| Write check | 13:13:23 | nothing written since the data dump started; counts equal to the backup's |
| Production dry run | 13:14:00–13:14:32 | `DRYRUN_OK`: 2 merges, nothing moved, every post-check below |
| **D5 applied** | **13:14:35–13:15:36** | the same wrapper ending in `commit`, `lock_timeout` 3 s, run as the director |
| Read-only post-check | 13:15:51, 13:16 | below |
| Postgres logs | 13:05–13:20 | only the pre-check's and dry run's sentinels; no error |

**The guarded wrapper** refused to run unless the ledger was exactly 001–139, D5 had never run, the journals held their expected rows (step `d1` 99, `d3` 229; merge journal empty), the merge, D5, search and payment function bodies matched the pin, no student was merged, the four files had not been written in the previous 10 minutes, `d5_plan(pairs)` (names left out) equalled the approved pin exactly, and each file to merge away was findable by name in both desk searches and by phone. It ran `d5_apply(pairs, d5_plan(pairs))` as the director, then checked everything below before commit.

**Post-checks (statuses and counts only):**

| Check | Result |
| --- | --- |
| Merges | exactly 2 files merged, each into its approved kept file; no other student merged |
| Journals | step `d5`: 2 rows, run by the director; student merge journal: 2 open rows; D1 and D3 rows unchanged |
| `d5_plan(pairs)` after | `people.merge_already` for both |
| Hidden from search (as the receptionist) | neither merged file found by name (`find_people`, `search_desk_students`) or by phone; both kept files found; 568 people findable by phone, 0 missing (570 less the 2 merged files) |
| Payments refused | `create_charge_payment` on each merged file: `22023` `eap.student_merged` (tested in a rolled-back sub-transaction; on a file not merged, the same call fails on validation instead) |
| Kept file shows the history | each kept file's merge set holds both files, and its enrollments, receipts and attendance count both files' rows |
| One action per active prospect | 0 exceptions |
| Nothing else changed | every other student byte for byte; the merged files only in their merge columns; the kept files unchanged; portal links, authorized adults, prospects, contacts, actions, enrollments, charges, receipts, attendance and reservations unchanged; receipt counter EH 470; receipts 361, charges 338 |
| Table counts | only the two journals (+2 each) and the activity log (+2) grew |

**Rehearsal** (on the D3 backup restored locally, D3 applied, so the journals matched Production): the function bodies equal Production's; the dry run passed with the same results; a wrong plan pin refused (`D5_PRE_PLAN`); `d5_apply` with a wrong expected plan refused by itself; the apply committed; a second run refused (`D5_PRE_ALREADY_RUN`); `unmerge_student` for each pair as the director returned the students table exactly (every column but `updated_at`) and both files were findable again. The copy was removed.

**Undo (each needs the owner's separate approval):** `unmerge_student(source)` as the director, one pair at a time (rehearsed exact). After an unmerge the D5 journal rows stay, so the same wrapper refuses to run again; merging again needs a new approval. Any merged student must be unmerged before 139's restore can run.

**What the merge does not do:** it copies no field between files. The merged file keeps its own phone, birth date and notes, and its enrollments, receipts and attendance stay on it, read through the kept file's merge set.

**Desk follow-ups after D5 (counts only):** 1 kept file needs the phone held by its merged file copied onto it; 1 kept file has a validated enrollment with no charge; 1 further pair waits until its enrollment is ended.

**Backup** (verified as above; kept by the owner outside this repository):

| Part | Backup (2026-11-26 13:06:02–13:12:00 UTC) |
| --- | --- |
| roles | 297 bytes, `25873cec56a2cc6514e204f420231777f85c03da818caa7090cdcdfa89776ecd` |
| schema | 1,572,127 bytes, `569f6f166e666443794819ab5eb63919a51b2c4d89df403f0bcc8b207bde20b8` |
| data (including `auth`) | 12,714,968 bytes, `cc37b5645f0060ee5e2daa2c2fe5421eb0f7801aefdbf42a31b0739aa98f28c9` |
| migration ledger | 3,288,739 bytes, `74733bef98f2e653285c9ce3f4361f7b1e9acdeb4d0269f70f7087965974f9d4` |
| restore script | 1,038 bytes, `8dc847fa801a4d055744f8ff9c3c1fba5df2683ecfd64681c51792b58dcaf7e0` |

**Not verified:** the merged and kept files in a signed-in browser (the redirect from a merged file to its kept file, « Annuler la fusion »).

### Owner decisions, follow-ups and gates — 2026-11-26

**Owner decisions (2026-11-26):**
- **OD-16 replaced:** B2 ships with no programme prices. The director fills the prices in the catalogue later; until then amounts are typed by hand. B2 no longer waits for the prices.
- **D6 and D7:** D6's functions ship inside PR B2 (migration 140); D7 goes with C2, which adds `groups.class_days`.
- **Batched records:** from now on, release and data-step records are batched in one documentation PR instead of one docs PR each. This record covers #220, D3 and D5.

**Follow-ups (not started; each needs its own approval):**
- a browser test that clicks « Annuler ce paiement » (the regression check of #220 reads the page's code only);
- the « upgraded to current 138 » label in `scripts/test-crm-h3-upgrade-103-current.sql` (the ledger check reaches 139);
- the out-of-date sentence in the header of `scripts/rollback/139_people_identity_restore.sql` (it says a merged student shows again in the lists, but the restore refuses while any student is merged);
- the date shown twice on the action result card (C1 reviewer's note);
- the payment-after-move test case (« payment ends it » on a moved « Encaisser l'acompte » action; C1 reviewer's note);
- the 24 public tables that still grant `DELETE` and `TRUNCATE` to `anon` and `authenticated`;
- a guard for test scripts that reset the shared local stack;
- `test-crm-phase3-concurrency.py` and `test-crm-phase7-concurrency.py`, not wired in CI, still call the old wrappers;
- `crm_get_today` fails on legacy non-CRM tests with malformed times (`invalid input syntax for type time`);
- revoke `crm_create_manual_lead` now that the B1 build is deployed (deviation 3);
- desk work: the 11 unreadable phones left by D3 and the 3 desk follow-ups after D5 (above).

**Gates:** A1, D1, A2, C1, B1, D3 and D5 are done. **Next:** B2 (catalogues, with D6's functions, migration 140; no prices), then C2 (with D7) and D4. Each needs the owner's separate approval.

### Implementation record: PR B2 (M-B2, migration 140)

**Owner approval (Maroine, 2026-11-26), scope lines verbatim:**

> Scope: §5.4 only: one French programme and level catalogue, director-editable, with optional default prices; the origin list; the close-reason list, including « Mauvais numéro » (the wrong_number constraint value): day script 8 closes in 2; French labels on every staff screen (no raw English code; add the scan test); conversion writes programme and origin; the D4 mapping functions, shipped but NOT run.
>
> Not authorized: Production, data steps, merge, release.

**Owner decision replacing OD-16 (Maroine, 2026-11-26), verbatim:**

> « B2 ships with no programme prices. The catalogue's price per programme is empty and director-editable; while it is empty, staff type the amount by hand as today. When I fill a price in the catalogue, it pre-fills from then on. No release is needed to add prices. »

**Owner decision adding D6 to migration 140 (Maroine, 2026-11-26), verbatim:**

> Also in migration 140 (owner decision 2026-11-26): ship the D6 test-data functions as the plan's §10 D6 row defines them: d6_plan(ids) and d6_apply(ids, counts) with a journal and a revert, shipped but NOT run, with no API grant.
> - Classes: (a) delete only with no history; (b) CRM rows closed NOT_QUALIFIED « invalid_spam » with a note, excluded from reports; already converted or closed prospects reported as « already closed », not re-closed; (c) students with receipts archived (deleted_at) and excluded; a test group with members closed, not deleted.
> - Voided receipts EH-2026-00459–00461 stay (gap-free numbering).
> Test it on fixtures that match the release operator's preview: 2 test students with receipts, 9 test prospects (2 converted, 5 not qualified, 2 lost), 9 contacts, 1 test group with a member, and 1 student with a placeholder phone.

**What `140_catalogues.sql` does.** Built on the live 139 bodies: section 0 refuses (`55000`) unless 139 is applied and each of the seven re-created functions still has the prosrc md5 139 left live (`crm_security.command`, `crm_security.evaluate_conversion`, `get_referral_breakdown`, `crm_get_workspace_detail`, `save_receptionist_student`, `search_students_page`, and for D6 `crm_get_marketing_cohort`). Every next action still goes through `set_next_action`, which is unchanged, as are the one-action rule, the lifecycle barrier, the event types and first-touch immutability. The migration writes no existing row (`scripts/test-catalogues-140-upgrade.mjs`).

- **Programmes (§5.4).** `programmes` (the 10 stored `session_type` codes with French label, audience, « proposé aux prospects », enrollable, version), `programme_levels` (78 rows, the three level lists, checked against `operational_security.valid_session_level`, which stays the rule) and `programme_prices` (append-only, **empty**: no price is seeded, per the owner decision above). `crm_leads.session_type`: the 8-value check is replaced by a foreign key to `programmes`; every stored value is already a code. Finance and academic tables keep their stored codes; no charge or receipt is rewritten.
- **Origins.** `acquisition_sources` (11 codes: the 10 of §5.4 plus `social_media`, not offered; see deviation 2), `crm_leads.origin_code`, `referrer_text`, `referrer_student_id`, `referrer_lead_id`, `students.origin_code`. A Meta or website prospect reads its origin from its first touch (`crm_security.lead_origin`); nothing is written to its row or its submission. « Recommandation » requires a referrer.
- **Close reasons.** `crm_close_reasons`: one list of 14 codes, 13 offered (`age_not_suitable` stays readable and accepted; see deviation 6), each with its derived status. `crm_leads_closure` accepts `wrong_number` (NOT_QUALIFIED) and `duplicate` for LOST too. A close may omit its status: the server derives it from the reason (`crm_security.close_status`) and refuses a mismatched pair.
- **Commands (`crm_security.command`, live 139 body).** `create_prospect` and `update_prospect` take `origin_code` and `referrer` (a free name, or a student or prospect id); the programme must be a code offered to prospects (`catalogue.programme_unknown`); the origin is editable on manual prospects only (OD-10 A); « Fiche modifiée » names the changed fields (« origine, recommandé par »).
- **Conversion (invariant 11).** `crm_security.evaluate_conversion` writes the enrollment's programme to the prospect and the prospect's origin to a learner file that has none.
- **Reads.** `get_referral_breakdown` reads the origin list (the five old learner answers map to it through `crm_security.referral_origin`); `crm_get_workspace_detail` returns the origin and the referrer; `save_receptionist_student` accepts `origin_code`; `search_students_page` filters the source on the origin list (the old answer when the file has no origin yet).
- **Catalogue functions.** `get_catalogue()` (admin, director, receptionist: programmes with levels and prices, origins, close reasons), `catalogue_set_price(programme, year, amount or null, label, expected price id)` and `catalogue_save_programme(code, expected version, {crm_selectable})` (director only; stale `PT409`). A price change or removal is a new row, so no release is needed to add prices.
- **D4 (programme and origin mapping).** `crm_security.d4_rows`, `d4_plan(mapping)`, `d4_apply(mapping, expected plan)`, `d4_revert()`: shipped, **not run**, executable by no API role. The mapping is `{"program": {hash: code}, "source": {hash: code}}` with Q25's 8-character hash, so Production free text never enters the repository. Converted prospects take their enrollment's programme and learner files their old answer's origin without a mapping; `d4_revert` puts back every value not changed since and lists the others.
- **D6 (test data; owner decision above).** `crm_security.d6_references`, `d6_rows`, `d6_plan(ids)`, `d6_apply(ids, counts)`, `d6_revert()`: shipped, **not run**, executable by no API role; run as the director on the ids the operator supplies (`{"students":[…],"contacts":[…],"leads":[…],"groups":[…]}`: Q24's and the owner's). `d6_plan` returns counts per entity and action, the rows by id (never a name or phone), the receipts kept and what stops the run. Classes: (a) a row no foreign key points to is deleted, its whole row journalled; (b) an open prospect is closed NOT_QUALIFIED « invalid_spam » with the note « Données de test (D6) » through the CRM close command, one already converted, closed or merged is « already_closed » and untouched, and a contact with history is kept; (c) a learner file with history is archived through « Archiver » (`soft_delete_student`, which ends its live enrollments) and a group with history is closed through « Clôturer le cours » (`close_course`), never deleted. Receipts are never written: the voided receipts stay. Every kept row is recorded in `report_exclusions` (no API access), which `crm_get_marketing_cohort` reads to leave the test prospects out; archived files leave the student reports through the existing soft-delete policy. `d6_apply` refuses a listed file holding a receipt that is not voided, a group member who is not listed, an online group, an id not found, counts that differ, a second run and any caller but the director. `d6_revert` re-inserts deleted rows, restores archived files (their enrollments stay ended, as « Restaurer »), reopens closed groups and removes the exclusions; prospects D6 closed are listed for « Rouvrir » by hand.
- **Table privileges.** Nothing for `anon` or `service_role` on the five tables. `authenticated` may only read the label tables `programmes`, `programme_levels` and `acquisition_sources` (not sensitive); `programme_prices` and `crm_close_reasons` are read only through `get_catalogue` (no `crm_*` table is read directly, `test-crm-phase12-security.mjs`). Every write goes through the director commands.
- **Restore.** `scripts/rollback/140_catalogues_restore.sql` restores the seven functions to their 139 bodies (md5-checked), drops the foreign key and every 140 function (D4 and D6 included), and restores the 8-value `session_type` check and the 139 `crm_leads_closure`, VALID when no row needs otherwise, NOT VALID with every row kept when D4 ran and is kept or a prospect closed or converted under 140 holds a new value. It keeps the five tables, `report_exclusions`, the new columns and every row; 140 can be applied again after it. If D6 ran, `d6_revert()` runs first when its writes are to be undone; otherwise the file says that D6's test prospects count again in the cohort. B1's restore (`139_people_identity_restore.sql`) now refuses while 140 is applied, as C1's does while 139 is.

**Screens.**

- **« Paramètres » → « Catalogue »** (director; `CatalogueCard.jsx`): per programme and school year, the price (« Enregistrer », « Retirer le prix ») and « Proposé aux prospects ». The price pre-fills « Inscrire et encaisser » and the receipt form (still editable); without a price, staff type the amount as before.
- **« Ajouter un prospect »:** « Canal » (how the contact reached us now, formerly labelled « Origine »), « Programme » from the catalogue, « Origine » (how they heard of the centre) and « Recommandé par » when the origin is « Recommandation ». « Modifier la fiche » edits the programme, the origin (manual prospects only) and « Recommandé par ».
- **Drawer:** « Programme · », « Origine · », « Recommandé par · », « Arrivé par · » (the first touch, formerly « Origine du prospect · ») and « Intérêt déclaré · » only when the form answered it.
- **One close form, « Clôturer le prospect »** (the drawer and card menus, which had « Clôturer comme perdu » and « Clôturer comme non qualifié »; the « Clôturer » choice in « Noter un échange » and « Changer », which had « Pas intéressé » and « Pas pour nous »): « Motif » from the one list, « Pourquoi ? » after « Pas intéressé » (Prix, Horaires, Localisation, Autre centre choisi, Projet reporté, Autre raison), the status derived by the server. « Injoignable » stays enabled only after five failed calls.
- **« Mauvais numéro » closes in 2:** in « Noter un échange » the default after « Mauvais numéro » is « Clôturer », motif « Mauvais numéro » (NOT_QUALIFIED); « Enregistrer » closes. A corrected number switches the default to « Garder l'action actuelle » (B1's script 8 in 3).
- **Learner file and form:** « Origine » (the origin list; an old answer is shown as « Ancienne réponse : … » until D4); the students list filters « Filtrer par origine » and exports « Origine ».
- **French labels everywhere:** programmes, learner and enrollment statuses, age categories, CRM stages and close reasons on the staff screens, the portals, the receipts (print, PDF, CSV, list and the receipt e-mail), the payment panel, the reports, the marketing analytics and the course and year close dialogs. Stored codes are unchanged. `src/lib/programCatalog.mjs` and `src/lib/catalogue.mjs` hold the labels; `scripts/test-catalogue-labels.mjs` asserts them equal to the 140 seed; the receipt e-mail (`supabase/functions/sendReceiptEmail/programmeLabels.mjs`) carries the same programme labels.
- **Guide:** « Guide Accueil » (`GuideContent.jsx`) describes the create form, the one close form, « Pourquoi ? » and « Mauvais numéro » in two clicks.

**Deviations (for review).**

1. **No prices (OD-16 replaced).** The owner's decision above: `programme_prices` ships empty; staff type the amount while a programme has no price.
2. **`social_media` is a legacy origin.** The old learner answer « Réseaux sociaux (Facebook / Instagram) » cannot be split into Instagram or Facebook, so it maps to `social_media` (« Réseaux sociaux »), shown but not offered.
3. **Referrer: a free name in the UI.** The server accepts a free name, a student id or a prospect id (`crm_security.referrer_fields`); the screens send the free name only. A linked referrer picker is a follow-up.
4. **Programme labels are not director-editable.** `catalogue_save_programme` changes only « Proposé aux prospects »; the labels equal the JavaScript catalogue, which the label test pins. Prices are director-edited as planned.
5. **`students.origin_code` is filled by D4, not by the migration.** §5.4 backfills it from the five old answers; the migration writes no row, so the backfill is D4's deterministic part (`student_referral` rows). Until then the screens and `get_referral_breakdown` read the old answer through the same mapping, so nothing shows empty.
6. **`age_not_suitable` stays accepted.** « Âge ou programme non adapté » is `program_not_suitable`; `age_not_suitable` is still accepted by the server and shown on old closes, but no longer offered.
7. **« Doublon » closes LOST.** As §5.4 states (« `duplicate` is accepted for LOST too, via the derived mapping »): the derived status of `duplicate` is LOST; existing NOT_QUALIFIED duplicates stay valid.
8. **Marketing programme buckets follow the conversion.** With invariant 11 a converted prospect's programme is its enrollment's, so the DGI-B programme funnel counts a converted prospect under the programme it enrolled in. `test-crm-dgi-b2.sql` changes only its fixture (L4 enrolls in the programme of its form); no expectation changed.
9. **The student form no longer writes `referral_source`.** It writes `origin_code`; the public registration form still writes the old answer, which D4 maps.
10. **Day script 10 close is 4, one above its A1 target of 3.** §5.4 makes the reason an explicit choice in the one close form (no silent default such as « Pas intéressé », which would also ask « Pourquoi ? »). The test uses a reason without « Pourquoi ? » and allows 4, logged as above target. **Owner acceptance requested.**
11. **Unchanged on purpose:** `crm_get_marketing_cohort` still validates its 8 programme codes (its only change is D6's exclusion); the activity log and lifecycle-operations screens already showed French summaries.
12. **Invariant 11's test** is in `scripts/test-catalogues.sql` (conversion writes « Yearly » and the learner's origin), not a separate `test-crm-enrollment-programme.sql`.
13. **Two English texts found by the scan test and fixed:** the reports' learner-status chart (« Enrolled ») and the online page's help text (« Online », « Online One-to-One »).
14. **D6 (owner decision above): choices for review.**
    - « No history » is read as « no foreign key from any table points to the row » (`d6_references`), so a file with only a family link or a group placement is archived, not deleted.
    - « Excluded from reports » is a new table, `report_exclusions`, read by the marketing cohort, the only report that counts prospects; archived files already leave the student and finance reports through the soft-delete policy.
    - D6 runs as the director (as D1, D3 and D5 did) so that it reuses the existing paths (the CRM close command, « Archiver », « Clôturer le cours ») instead of writing rows directly; « Clôturer le cours » needs the group to have no live member once the listed files are archived, so a member who is not listed stops the run.
    - A listed file holding a receipt that is not voided stops the run (archiving it would take a live payment out of the finance reports).
    - `d6_revert` does not reopen prospects: reopening needs a next action staff choose (one-action rule); they are listed.
    - One run per migration, as D4.
    - The preview's learner with a placeholder phone has no history in the fixture, so D6 deletes it; if it has history on Production, `d6_plan` shows « archive ».
    Also fixed as part of the ceiling bump: the « upgraded to current 138 » label in `test-crm-h3-upgrade-103-current.sql` (a listed follow-up).

**Acceptance (§8, B2 cells), private local stack `rwrb2`, 2026-11-26.**

- **Day scripts** (`test-reception-day-scripts-browser.mjs`): **8 wrong number, closed: 2** (≤ 2: « Mauvais numéro » → « Enregistrer », `NOT_QUALIFIED:wrong_number`); 8 corrected 3; 10 close **4** (target 3, deviation 10), reopen 3; 0–7, 9 and 11 unchanged and passing (2 = 12, 3 = 6, 4 = 8, 5 = 3, 9 = 3).
- **Invariant 11:** `test-catalogues.sql` (conversion writes « Yearly » to the prospect and the prospect's origin to the learner file).
- **French labels:** `test-french-labels-browser.mjs` scans 22 staff screens (director and receptionist: dashboard, learners list and file, Annuaire, groups and group, finance, receipts and a printed receipt, CRM list, two drawers, Tâches, reports, level tests, online, attendance, « Catalogue ») for 50 codes built from the label maps; it found and B2 fixed two screens (deviation 13). `test-catalogue-labels.mjs`: the JavaScript catalogues and the e-mail labels equal the 140 seed.
- **D6:** `test-catalogues-d6.sql` on fixtures matching the operator's preview (2 learners with 3 receipts, voided; 9 prospects: 2 converted, 5 not qualified, 2 lost; their 9 contacts; 1 group with a member; 1 learner with a placeholder phone): plan `{"students":{"archive":2,"delete":1},"crm_leads":{"already_closed":9},"crm_contacts":{"keep":9},"groups":{"close":1},"receipts":{"voided":3,"live":0}}`; refused while a receipt is live, for an unlisted member or a missing id, for wrong counts, as the receptionist and a second time; apply leaves prospects, contacts, CRM history and every receipt byte for byte, archives the 2 files (enrollments ended, hidden from the director's lists), closes the group, deletes the placeholder file with its whole row journalled, records 21 exclusions and takes the 9 prospects out of the cohort; revert brings all back (the placeholder file exactly, its phone too). A second case closes an open prospect « invalid_spam » with the note (its action cancelled, the close in its history by the director) and deletes an empty group, then reverts.
- **Upgrade and restore:** `test-catalogues-140-upgrade.mjs` (139 → 140 writes no row; D4 and D6 present, not run, not granted; seeds 10 programmes, 78 levels, 0 prices, 11 origins, 14 reasons; B1's restore refused while 140 is applied; restore to the 139 catalog with the two checks NOT VALID and rows kept; second restore refused; re-apply equals the first 140).
- **Every lane run locally on the private stack `rwrb2` (ports 581xx, app on 3401), 2026-11-26:** `npm test`; lint; build; `test:crm-insights`, `test:middleware`, `test:navigation`, `test:inspector-monitor`, `test:crm-work-calendar`, `test:crm-opportunities`, `test:css-toolchain`, `test:ui-foundation`; the 15 steps of the sql-and-concurrency shard (classification, policy manifest and capability parity included); the three upgrade shards (097–105: 7 steps, 106–111: 5, 112–116: 20 with the 139 → 140 step); the browser-crm shard (`test:crm-lifecycle-browser`, phase 11, `test:crm-opportunities-browser`, `test:crm-work-calendar-browser`, `test:crm-intake-admin-browser`, `test:reception-browser` with the French labels scan) and the browser-security shard (batches 1–4C, receptionist storage, receipt deletion, large data, receptionist, online learning and room lifecycle, student placement, course close, portal readiness and its browser checks, e-mail links). Found by the role-matrix suite and fixed before push: `crm_close_reasons` is not readable directly (no `crm_*` table is). **After D6 was added (same day, rebased on `main` 4a0ede1):** `npm test`; the sql-and-concurrency shard (15 steps, `test-catalogues-d6.sql` included); the three upgrade shards (7, 5 and 20 steps); a fresh build with the browser suites that read the marketing cohort (`test-crm-phase11-browser.mjs`, `test:crm-intake-admin-browser`) and the French labels scan; all passed.

**Changed existing tests.**

- **Assertions changed for B2 behaviour:**
  - `test-reception-day-scripts-browser.mjs`: script 8 (close) is « Mauvais numéro » → « Enregistrer » (2), asserts the default « Clôturer » with motif « Mauvais numéro » and `NOT_QUALIFIED:wrong_number`; script 10 opens « Clôturer le prospect », chooses « Doublon » and asserts `LOST:duplicate` (4, deviation 10); scripts 2 and 3 select « Canal » (formerly « Origine »); the log says « ACCEPTED COUNT » for any script above target.
  - `test-reception-forms-browser.mjs`: the stale-close case opens « Clôturer le prospect » and chooses « Pas intéressé » + « Pourquoi ? » Prix (`LOST:price`); the walk-in case selects « Canal ».
  - `test-crm-phase4-browser.mjs`: « Clôturer le prospect » replaces both menu entries; « Âge ou programme non adapté » is `program_not_suitable`; « Noter un échange » closes through « Clôturer » + « Motif » (+ « Pourquoi ? » Horaires for the LOST case).
  - `test-crm-rcc-a1-browser.mjs`: the hidden closure choice is « Clôturer » (was « Pas intéressé »).
  - `test-crm-rcc-b1-browser.mjs`: the drawer lines are « Programme · », « Origine · », « Arrivé par · » (« Intérêt déclaré · » shows only when answered); the card and drawer menus have one « Clôturer le prospect ».
  - `test-receptionist-browser.mjs`: « Filtrer par origine » (was « Filtrer par source »); the learner form's « Origine » stores `origin_code` « google » (was « Comment avez-vous connu le centre ? » writing `referral_source`, deviation 9).
  - `test-course-close-browser.mjs` and `test-course-close.mjs`: the year-close breakdown reads « Stage d'été 1 » (was « Summer Camp 1 »).
  - `test-receipt-client-regressions.mjs`: the receipt summary reads « Programme annuel · 2026/2027 », with the legacy and service-description cases; its module loader also resolves `./programCatalog.mjs`.
  - `test-payment-panel.mjs`: the duplicate line reads « Programme annuel · 2026/2027 ».
  - `test-crm-next-action-ui.mjs`: the next-action kind is `close` with reason and « Pourquoi ? » (the `lost` kind is gone).
  - `test-portal-readiness.mjs`: `origin_code` is a staff-only learner column that must not reach a portal.
- **Fixture only:** `test-crm-dgi-b2.sql` (deviation 8).
- **Upgrade-lane ceilings raised to 140:** `test-conflicts-without-retry-upgrade.mjs`, `test-crm-batch2-upgrade-current.sql` (and its stale « 128 » message), `test-crm-h3-upgrade-103-current.sql` (and its stale « 138 » label), `test-crm-r4-upgrade-100-current.sql`, `test-crm-r4-upgrade-102-current.sql`, `test-premium-retirement-upgrade-113-current.sql`.
- **Fixture:** `receptionist-function-classification.json` gains the three public functions: `get_catalogue` open (admin, director, receptionist); `catalogue_set_price` and `catalogue_save_programme` locked (director). The private helpers and D4 are in `crm_security`, which no API role can use.
- **New:** `test-catalogues.sql` (grants, seeds, prices, programme toggle, prospect origin and referrer, closes, conversion, learner origin, search filter, breakdown, D4 plan, apply and revert), `test-catalogue-labels.mjs`, `test-catalogues-140-upgrade.mjs` (139 → 140, B1's restore refused while 140 is applied, restore, re-apply), `test-french-labels-browser.mjs` (scan of 22 staff screens as director and receptionist; the code list is built from the label maps), `test-catalogues-d6.sql` (D6 on the operator's preview).
- **CI:** `npm test` adds `test-catalogue-labels.mjs`; `test:reception-browser` adds `test-french-labels-browser.mjs`; the sql-and-concurrency shard adds `test-catalogues.sql` and `test-catalogues-d6.sql`; the 112–116 shard adds « Catalogues 139 to 140 upgrade, restore and re-apply ».

**Release notes for B2 (for the release approval; nothing here is authorized).**

1. Apply 140 (after 139), then deploy the B2 build. The deployed B1 build keeps working on 140: it sends no origin, its close entries send a status with a matching reason, and the programme values it offers are catalogue codes.
2. Deploy the `sendReceiptEmail` function with the B2 build (it now imports `programmeLabels.mjs`); until then the e-mail shows the stored code.
3. Prices: none at release. The director fills them in « Paramètres » → « Catalogue » whenever ready; no release is needed.
4. Rollback: deploy the B1 build, then (D4 not run, or reverted first with `select crm_security.d4_revert();`) run `140_catalogues_restore.sql`. It must run before B1's restore.
5. D4 needs its own approval with Q25's hashes, the private mapping file and the `d4_plan` counts (§10).
6. D6 needs its own approval (« approve D6 », OD-13) with the ids (Q24's and the owner's) and the `d6_plan` counts; the operator exports the rows D6 deletes privately first and runs it as the director. To roll 140 back after D6, `select crm_security.d6_revert();` first if its writes are to be undone.

### Implementation record: PR C2 (M-C1 academic part, migration 141)

**Owner approval (Maroine, 2026-11-26).** Scope: PR C2 — §6.2–6.5, the item 25 leftovers and mobile acceptance at 375 px in `test-mobile-reception-browser.mjs`; OD-9 = A (keep RPW-r2, close NF-16 only); OD-12 « Sans inscription »; build on the live 140 bodies with md5 preconditions; migration 141 (renumbered if `main` moves) with a rollback file; the D7 functions shipped, NOT run, with no API grant. The approval's checklist, verbatim:

> 1. Test dates and times only from scripts/lib/centre-days.mjs or an in-hours slot from the server, so they work on every weekday and at any time of day.
> 2. Run every package.json suite and the CI shards locally (SQL, browser, upgrade lanes).
> 3. Grep every place a changed value is shown, printed, exported or filtered, and update each.
> 4. Update and list every existing test you change, with its justification.
> 5. Your own local Supabase stack only (check project_id); never hills-admin-next.
> 6. New functions: grants plus the RPW-r2 classification fixture; nothing internal API-executable.
> 7. Any browser button that writes: a browser test that actually clicks it (C1's void bug got through without one).
> 8. Push only when all of the above pass; wait for Verify green before handing off.
>
> Not authorized: Production, data steps (D7), merge, release.

**What `141_desk_academics.sql` does.** Built on the live 140 bodies: section 0 refuses (`55000`) unless 140 is applied, each of the six re-created functions still has the prosrc md5 140 left live (`crm_update_placement_test`, `enforce_attendance_integrity`, the four-argument `save_attendance`, `save_receptionist_group`, `save_receptionist_student`, `phone_search_key`) and the `placement_tests` policies are 140's. `set_next_action`, the one-action rule, the lifecycle barrier, the event types, first-touch immutability, every finance function and the teacher placement and attendance policies are unchanged; no stored status changes.

- **Age bounds (§6.2, §6.4).** `programme_levels.min_age` / `max_age` set from each programme's audience (« adultes » 18 and over; « enfants » and « ados » 17 and under; « tous » open), only where both are empty (deviation 1). Helpers in `academic_security`: `category_ages`, `level_ages`, `level_allowed`, `age_on`.
- **Learner files (§6.4).** Trigger `students_rules_guard` (`academic_security.student_rules`): a birth date is never after the Casablanca business date and at least a year before it (`student.birth_date_future`, `student.birth_date_too_recent`), on every write of the date; the age category must overlap the programme's (and level's) ages (`student.category_level`) on staff writes — direct as `authenticated`, and through `save_receptionist_student`, which sets the transaction-local flag `eh.student_rules`. System paths (enrollment sync, conversion) are never refused for the category, and an existing file is re-checked only when its category, programme or level is written.
- **Level tests (§6.2).** `book_student_placement_test(p_test, p_data)` books a learner file's test (stable id: a replay returns the same row) with the appointment's date, hours (`crm_hours.outside_opening`) and overlap (`crm_next_action.overlap`) rules; `update_placement_test_result(p_test, p_expected_updated_at, p_changes)` moves it (before the start), records « Annuler le test » with a required reason (`cancel_reason`), « Absent », or the result, score, level and group (after the start); stale writes `PT409`. `delete_placement_test` (admin, director; a test without a prospect, as before). The staff insert and update policies on `placement_tests` are replaced by these commands (the receptionist's two policies are dropped, and « placement admin all » becomes « placement admin read » and « placement admin delete »); the teachers' policies (123:284-289) stay. Trigger `placement_tests_rules` on every row, whoever writes it: no result, score, level, « Passé », « Résultat saisi », « Affecté » or « Absent » written before the start time (invariant 5; `placement.result_before_start`) — a status, score or level counts only when the insert or this update writes or changes it (compared with `OLD`), never because a stored value is already there (review B1, below), no level or score on a new planned test (`placement.no_prefilled_result`), one « Planifié » test per person — the learner, or the prospect and its linked learner (`placement.already_planned`). `crm_update_placement_test` (live 136 body): « Passé » is no longer chosen, and the level must be one of the prospect's programme levels for its age (`placement.level_not_offered`).
- **Attendance (§6.3).** `groups.class_days smallint[]` (ISO weekdays, sorted, no repeats; NULL until D7 or an edit; `group.class_days_invalid`). `enforce_attendance_integrity` (live 121 body) refuses, for a new row written by staff or a teacher: a future date (`attendance.future_date`), a day outside `class_days` when set (`attendance.not_class_day`) and a closed date of the published hours (`attendance.closed_date`) unless the director overrides; a correction of an existing row is unchanged. `save_attendance(…, p_override_closed boolean default false)` replaces the four-argument function (old calls keep working); the override is refused for any role but the director (`attendance.override_director`, 42501).
- **Role surface (§6.5, OD-9 A, NF-16).** `save_receptionist_group` (live 128 body) refuses to create an online group or move a group to an online programme (`group.online_management_only`); editing an existing online group stays allowed (deviation 3). It accepts `class_days`.
- **Phone search from 6 typed digits (§5.1, receptionist observation 2; section 5b).** Verify run 45889045886 on `bdb05dd` failed `test-people-search-browser.mjs`: the students list did not find « 003-97-23 », the last 7 digits of the learner's number. Cause: `phone_key` (139) removes one leading 00212, 212, 00 or 0 as a prefix, so the query became « 39723 », under the 6-digit minimum of `phone_search_key`, and the phone match was skipped. This was not the Annuaire merge: the search box, the cards/table toggle, the status filter, the `/students-directory` redirect and `search_students_page` (live 140 body) are unchanged by C2, and the same function serves every box. The header box passed only because its dialog stays open and still showed the previous format's results; the bug was in B1's 139 since its release and appears when a number's tail starts with 00 (about one random number in a hundred). `phone_search_key` now keeps the typed digits when removing a 00, 212 or 00212 prefix would leave fewer than 6 and the query holds 6 or more; a trunk 0 alone keeps the 139 rule, so « 06 12 34 » (5 significant digits) is still no phone search. Same signature, posture and grants; `phoneSearchKey` in `src/lib/phone.mjs` mirrors it; the restore puts back the 139 body.
- **Review fix B1 (review of `39fe571`, CHANGES REQUIRED).** The pre-C2 booking form sent the level « A1 » by default, so future « Planifié » tests may already hold a level. The first 141 trigger treated any stored level or score as a result, so cancelling such a test (`update_placement_test_result` with « Annulé », and `crm_security.cancel_planned_test` when a prospect closes) failed before its start; moving it worked. `placement_rules` now compares with `OLD`: a level or score is a result only when the update writes or changes it, and a status only when it changes. Cancelling, moving and « Absent » after the start work on such a test; writing or changing a level or score before the start is still refused. The visit outcome (`crm_record_appointment_outcome`) marks its linked test « Passé » or « Absent », so when the test is set later than the visit the outcome is refused until the test's start; the CRM screens now show « Le test de niveau lié commence plus tard : le résultat se saisit à partir de l’heure du test. » for that hint instead of a generic refusal. The CSV import checks each row's category against its programme (the column default « Yearly » when the file names none) before sending, and a row the database refuses for a learner-file rule shows that rule's French message. Writing that browser case found an older import bug: the template's own headers `age_category` and `niveau_cefr` normalise to `agecategory` and `niveaucefr`, which the header map did not list, so those two columns of a file built from the template were silently ignored; both spellings are now mapped (the sample rows fit their programme and level).
- **D7 (group class days) — shipped, NOT run, executable by no API role.** `academic_security.parse_class_days` (French or English day names and abbreviations separated by commas, « / », « + », « & », « et » or spaces; anything else, such as « Lun-Ven » or a time, is unparseable), `crm_security.d7_rows`, `d7_plan()` (counts parsed / unparseable / empty, the unparseable group ids with an 8-character hash of the text, never the text, and 5 samples), `d7_apply(expected counts)` (in-person groups whose `class_days` is empty; refuses different counts and a second run; journal in `crm_data_step_journal`) and `d7_revert()` (puts back NULL where the value is still the one D7 wrote, lists the others). `src/lib/academic/classDays.mjs` is the same parser; `scripts/fixtures/class-days-cases.json` (22 cases) pins both.
- **Grants.** The three learner test commands to `authenticated` only (gated inside: staff, or admin and director for the delete); the helpers and D7 to no API role; `scripts/fixtures/receptionist-function-classification.json` lists the three commands and the new `save_attendance` signature.
- **Restore.** `scripts/rollback/141_desk_academics_restore.sql` restores the four bodies and the four-argument `save_attendance` (md5-checked against 140), the 140 `placement_tests` policies and the empty age bounds; drops the three triggers, `groups.class_days` with its check and every 141 function; keeps every row. It refuses while a D7 run is kept (`d7_revert()` first). B2's restore (`140_catalogues_restore.sql`) now refuses while 141 is applied.

**Screens.**

- **« Tests de niveau ».** « Planifier un test » opens the people search (`find_people`, `PeopleSearch` in pick mode): a learner opens the booking dialog (`StudentTestDialog`: date, time, examiner, notes; no level), a prospect is sent to its file with a notice (its test is booked with « Rendez-vous au centre »). A learner's test opens the same dialog with its status (« Passé » derived from the time) and the choices the time allows: « Déplacer » and « Annuler le test » (reason) before the start, « Résultat » (the levels of the learner's programme for its age, score, « Affecter à un groupe » with the open groups of that level) and « Absent » after it. « Supprimer le test » is for the admin and the director only. A prospect's test still opens `PlacementTestModal`, without a pre-filled level and without « Passé » in the list. The calendar shows the derived status.
- **« Présences ».** The date is today and the list offers the groups that meet that day (« Tous les groupes » shows the rest). Each learner is « Non saisi » until « Tous présents » or a mark; the counter counts what is on screen, « non saisis » included; « Enregistrer les présences (n) » sends only the marked rows. A day outside the class days shows a notice and cannot be saved; a closed date is refused with a French message, and the director gets « Séance exceptionnelle : enregistrer malgré la fermeture (direction) ». The CSV export writes « Non saisi ».
- **Groups.** « Jours de cours »: one 44 px toggle per day (writes `class_days` and the « jours » text the timetable reads; none ticked keeps the old text). Reception's programme list has no online programme; « Nouveau groupe en ligne » on « Cours en ligne » shows only with `canManageOnlineCourses`. The edit and delete icons have accessible names.
- **Learners.** One « Liste des apprenants » with « Tableau » and « Cartes » (`?view=cards`); `/students-directory` redirects there, keeping its filters, and the « Annuaire » menu entry is gone (the dashboard link reads « Liste des apprenants »). The inline « Catégorie » select is removed (the category is edited in the file). The learner form refuses a future or too recent birth date (the picker stops a year ago) and offers only the categories that fit the programme (a stored one stays shown), with field errors. « Adultes autorisés au retrait » is hidden on an adults-only file unless adults are already recorded (deviation 6). The status « Prospect » reads « Sans inscription » everywhere `dossierLabel` is used (lists, file, cards, portal, import preview and notice, CSV); the import preview also translates categories, and marks a row whose category does not fit its programme as a row error (never sent).
- **Item 25 leftovers.** French plurals (`pluralFr`) in « Opportunités » and the action dialog; the unsaved-changes guard and French validation (`noValidate`) on the dialogs C2 rewrites (deviation 8).
- **Guide.** « Guide Accueil » (`GuideContent.jsx`): one learners list with two views (the old « Annuaire » passages), the list search finds phones (since B1), the category edited in the file, « Sans inscription », the new « Planifier un test », « Passé » derived, the learner test choices, attendance « Non saisi » and « Tous présents » (the « tout le monde est Présent par défaut » warning is gone), the closed-date rule and the day toggles. The screenshots are unchanged; refreshing them belongs to the guide-pages follow-up.

**Deviations from the plan text (for review).**

1. **Age bounds from the audience.** No owner age data exists per level, so 141 derives them from each programme's audience; finer bounds can be set per level later in `programme_levels`.
2. **Date rules in the trigger.** The future, class-day and closed-date checks are in `enforce_attendance_integrity`, not only `save_attendance`, so a teacher's or any direct write obeys them; only new rows are checked, so a correction of an existing row still works.
3. **Editing an existing online group** through `save_receptionist_group` stays allowed (only creation and moving to an online programme are refused): RPW-r2 lets reception edit groups, and NF-16 is about creating online groups.
4. **Delete** stays under RLS (admin, director) as well as the new `delete_placement_test` command the page uses.
5. **One planned test per person** is a trigger, not a unique index: the person can be the learner or the prospect linked to it, which an index cannot express.
6. **Authorized adults** stay visible on an adults-only file when some are already recorded, so nothing recorded disappears from view.
7. **Group class days from the form.** Editing a group saves the ticked days, so a group can get `class_days` before D7; `d7_rows` only takes groups whose `class_days` is still empty, and `d7_revert` skips a group edited after D7.
8. **Item 25 scope:** 25c (plurals) in full; 25a and 25b (unsaved-changes guard, French validation) on the forms C2 touches.
9. **A prospect's test opened from the list** shows every level: `crm_get_placement` returns no programme or age; the server still refuses a level outside the prospect's programme (`placement.level_not_offered`). Opened from the prospect, it shows the filtered levels.
10. **Attendance RLS kept:** `save_attendance` is an invoker function, so the table policies still apply under it.
11. **`/students-directory`** stays in `roleAccess` and the return screens so old links and bookmarks reach the redirect.

**Local verification, private stack `rwrc2` (ports 583xx, app on 3501), 2026-11-26.** Every `verify.yml` lane was replayed on its own fresh database (`supabase db reset --local --no-seed` before each shard), on Thursday 2026-11-26 between 18:30 and 20:30 UTC, so partly after the centre's closing time: `local-database` shards sql-and-concurrency 16/16 steps, browser-security 15/15, browser-crm 7/7, upgrades-from-097-to-105 8/8, upgrades-from-106-to-111 6/6 and upgrades-from-112-to-116 22/22 (including « Desk academics 140 to 141 upgrade, restore and re-apply »); the `app` job: `npm test` (103 scripts), lint (no new warning), build, `test:audit-policy`, `test:crm-insights`, `test:crm-intake`, `test:crm-lifecycle`, `test:crm-opportunities`, `test:crm-work-calendar`, `test:navigation`, `test:middleware`, `test:css-toolchain`, `test:ui-foundation`, `test:inspector-monitor`, `audit:policy`, the SQLSTATE guard and `npm audit` (0 vulnerabilities). The replays found suites that 141 or this PR broke; each was fixed in the test and is listed below (work-calendar, phase5 and phase6 browser, day scripts, receptionist, student placement and the two online upgrade lanes). A suite that failed was rerun alone on a fresh database after its fix, with the rest of its shard already green. **Review round (B1 and the two gaps), 2026-11-26 22:40 to 2026-11-27 00:10 UTC, each on a fresh database:** sql-and-concurrency 16/16 (sections 4b and 5b ran), upgrades-from-112-to-116 22/22 (the 140 → 141 lane with the « A1 » seed), browser-crm 7/7, browser-security 15/15 (rerun whole after the header fix: its first run failed the new import row, which exposed the unmapped template headers), `npm test` 103/103 and lint (no new warning); the build is the shards' own « Build and start the local app ». `test-placement-rules.sql` was also run against the first 141 `placement_rules` body: it fails in section 4b at the cancel, and passes on the fixed body.

**New tests.**

- `test-placement-rules.sql`: the three learner commands (grants, replay, hours, overlap, one planned test, move, cancel with reason, absent, result only after the start, levels by programme and age, group of the level, `PT409`, delete by role), the trigger on direct and teacher writes, and `crm_update_placement_test` without « Passé » and with the level filter. Review B1: section 4b seeds four « Planifié » tests holding « A1 » as the old form wrote them (triggers off, as pre-141 rows), cancels one through `update_placement_test_result` and one through `crm_security.cancel_planned_test`, moves one and then refuses a new level (command and table), a score and « Absent » before its start, and marks the past one « Absent »; it fails on the first 141 body (checked locally). Section 5b: a visit whose linked test is three days later is refused until the test's start (`placement.result_before_start`, nothing written), then recorded once the test's time has come (« Passé »).
- `test-attendance-rules.sql` (with `-v class_days_cases`): `class_days` normalisation and the parser on the shared fixture; future dates, class days, closed dates and the director override for each role; corrections unchanged; D7 plan, apply, refusals and revert on fixtures.
- `test-student-rules.sql`: birth-date bounds on every path, the category against programme and level for staff and through `save_receptionist_student`, system paths not refused, unchanged files not re-checked.
- `test-academic-rules.mjs` (in `npm test`): the client twins of the rules against the same fixture.
- `test-desk-academics-141-upgrade.mjs` (shard 112–116): 140 → 141 writes no row (hashes; only `class_days` added), the bounds by audience, exactly the five placement policy changes, the three triggers and one column, D7 present, not granted, not run, the old four-argument `save_attendance` call; then a cancel and a class-day edit through the commands, B2's restore refused (review B1: at 140 both future planned tests hold « A1 », one inserted by the receptionist through the 140 policy as the old form did; under 141 one is cancelled through the learner command, the other moved, refused a new level before its start and cancelled through `crm_security.cancel_planned_test`), restore to the 140 catalog, a second restore refused, re-apply equal to the first, restore again.
- `test-desk-academics-browser.mjs` (in `test:reception-browser`): clicks every writing button C2 adds — booking through the picker (time required; the second planned test refused), the prospect routed to its file, « Déplacer », « Annuler le test » (reason required), « Résultat » after the start (« Passé » shown, levels filtered, level required), « Noter absent », reception without delete, the learner form errors (nothing saved), the adults-only file, the cards/table toggle and the redirect, attendance today (« Non saisi », « Tous présents », the counter, the save), a group outside its days, a closed date refused for reception, the day toggles, the online button by role, the director's « Séance exceptionnelle » and « Supprimer le test » — and checks the database after each.
- `test-mobile-reception-browser.mjs` (in `test:reception-browser`): at 375 × 812, the screens fit the width, the dialogs stay on screen, the new touch targets are at least 44 px, and booking, « Déplacer », the attendance save and a day toggle are clicked and checked in the database.

**Changed existing tests (each with its justification).**

- **Classification and manifest:** `receptionist-function-classification.json` (the three new commands: `book_student_placement_test` and `update_placement_test_result` open to reception behind `crm_reader`, `delete_placement_test` locked to admin and director; the new `save_attendance` signature); `receptionist-policy-manifest.json` (the receptionist's two placement insert and update policies are gone, replaced by the commands, §6.2).
- **Staff writes are commands now (§6.2):** `test-receptionist-security.sql` (reception's direct insert and update of a test are refused); `test-single-writer.sql` (its placement-policy description and assertions follow 141); `test-crm-phase5.sql` (a staff reschedule through the table changes no row; the edits go through `crm_update_placement_test`); `test-crm-phase5-concurrency.py` (the two racing sessions use `crm_update_placement_test`); `test-crm-next-action-enforced.sql` (the Admissions table update as staff changes no row; the result goes through the CRM command).
- **Results only after the start time (invariant 5):** `test-crm-phase11.sql`, `test-crm-phase12-e2e.sql`, `test-crm-phase6.sql`, `test-crm-next-action.sql`, `test-crm-dgi-b2.sql`, `test-crm-phase5.sql`, `test-crm-phase5-browser.mjs` and `test-crm-phase6-browser.mjs` move the test to yesterday (replica role, no booking trigger) before writing a result or « Passé » (`test-crm-phase6-browser.mjs` now writes its setup result in a trusted session with the receptionist's claim: its old write as the receptionist changes no row under 141); `test-crm-phase5-browser.mjs` also inserts its learner test without a level and records its result through « Résultat » in the new dialog. It also finds the prospect's date field as « Date »: the CRM form no longer marks it « Date * », as it validates on the server (`noValidate`) like the new dialog.
- **« Absent » only after the start (invariant 5):** `test-reception-day-scripts-browser.mjs` script 6 (no-show) moves the test it carries to 20 minutes ago along with its visit, as in a real no-show; before, only the visit task was moved and the test stayed at its future slot.
- **Birth date at least a year ago (§6.4):** `test-crm-rcc-a2.sql` uses the latest accepted date (a year before today) instead of today.
- **NF-16 (§6.5):** `test-online-learning.sql`: the direction creates the online group; reception places learners in it.
- **No « Passé » choice (§6.2):** `test-crm-next-action-ui.mjs` (the status options; two new assertions; review: one more for the message of `placement.result_before_start` on the CRM screens).
- **« Non saisi » (§6.3):** `test-attendance-session.mjs` (new block: unmarked rows are never sent, « Tous présents », refused rows keep their marks).
- **The new dialog (§6.2):** `test-crm-work-calendar-browser.mjs` (a learner's legacy test opens « Test de niveau »; the time shows after « Déplacer »; « Fermer » replaces « Annuler »; its one finished legacy row on tomorrow's page is written with the triggers off, as a pre-141 record, since 141 refuses a « Passé » before the start); `test-receptionist-browser.mjs` (booking through the picker, a date from `centre-days.mjs` inside opening hours that a temporary director publishes for that step only, Planifié without a level; the inline category select is gone).
- **Inline category removed (§6.4):** `test-ui-foundation-browser.mjs` triggers its refresh with the inline level select instead.
- **One learners list (§6.4):** `test-people-search-browser.mjs` (the « Annuaire » box is the cards view reached through the redirect); `test-enrollment-at-payment-absence.mjs` (the students-directory allowlist entry is gone: the page is a redirect).
- **« Sans inscription » (OD-12):** `test-french-labels-browser.mjs` (« Prospect » is not scanned as a code, being also the French word for a lead; a targeted check in the table, the cards and the file; the scan reads the cards view); `test-student-placement-browser.mjs` (the import notice reads « seront importées « Sans inscription » », and the status filter offers « Sans inscription »; review: the import file gains an `age_category` column and a second row, « Adults (18+) » on « Yearly », which shows its row error and is not imported while the first row still is).
- **Import refusal reasons (§6.4, review):** `test-conflict-errors.mjs` maps the learner-file hints (`student.category_level`, `student.birth_date_too_recent`) to their French messages and checks `categoryProblem` (five new assertions).
- **Closed courses in the new group picker (CDC):** `test-course-close.mjs` checks `StudentTestDialog.jsx` (bounded read of open groups, `isClosedCourse`) in place of `LegacyPlacementEditor.jsx`, and no longer expects a group list on the level-test page, which has none.
- **Upgrade-lane ceilings raised to 141:** `test-conflicts-without-retry-upgrade.mjs`, `test-crm-batch2-upgrade-current.sql`, `test-crm-h3-upgrade-103-current.sql`, `test-crm-r4-upgrade-100-current.sql`, `test-crm-r4-upgrade-102-current.sql`, `test-premium-retirement-upgrade-113-current.sql`.
- **Phone search (§5.1):** `scripts/fixtures/phone-cases.json` gains six search pairs (partial digits starting with 00 or 212; two non-matches, one of them « 06 12 34 » against a number containing 061234); `test-people-search-browser.mjs` keeps its assertion, gives the learner a number whose last 7 digits start with 00 every run, waits for the server's answer to each typed value (so a list still showing the previous query never passes) and adds the list's cards view; `test-desk-academics-141-upgrade.mjs` checks the re-created `phone_search_key` (posture, grants, results).
- **Online upgrade lanes (§6.3, §6.5):** `test-online-room-reliability-upgrade.mjs` and `test-online-session-evidence-upgrade.mjs` run the current `test-online-learning.sql`; the second now applies every later migration first, as the first already did (its NF-16 check needs 141). Both then compare each row with the old state; they leave `class_days` out of the `groups` hash and check it is NULL on the old group.
- **CI:** `npm test` adds `test-academic-rules.mjs`; `test:reception-browser` adds the two browser suites; the 112–116 shard adds « Desk academics 140 to 141 upgrade, restore and re-apply »; the rollback-only regression step runs the three new SQL files.

**Release notes for C2 (for the release approval; nothing here is authorized).**

0. **Read-only pre-check before 141** (in one read-only transaction; Q1 and review B1). The release operator runs it at release time and records the counts in the release record. Learner tests booked with the deployed B2 form until the C2 build is live carry « A1 »; since review B1 they can still be moved, cancelled and marked « Absent » after their start, and the level is replaced when the result is written.

   ```sql
   begin transaction read only;
   -- a. Future « Planifié » tests, and those holding a level or score (the B2 form's « A1 »).
   select count(*) as future_planned,
          count(*) filter (where niveau_recommande is not null or score is not null) as future_planned_with_level_or_score
     from public.placement_tests
    where status = 'Planifié'
      and (date_test + coalesce(crm_security.calendar_time(heure), time '00:00')) at time zone public.centre_utc_offset() > now();
   -- b. Future tests already carrying a result or « Passé » (141 refuses writing one before the start).
   select count(*) as future_with_result
     from public.placement_tests
    where (status in ('Passé', 'Résultat saisi', 'Affecté', 'Absent') or (status <> 'Planifié' and (niveau_recommande is not null or score is not null)))
      and (date_test + coalesce(crm_security.calendar_time(heure), time '00:00')) at time zone public.centre_utc_offset() > now();
   -- c. Learner files whose category does not fit the programme's audience (adults on Yearly and the like).
   select s.session_type, s.age_category, count(*) as files
     from public.students s join public.programmes p on p.code = coalesce(s.session_type, 'Yearly')
    where s.deleted_at is null
      and ((s.age_category in ('Adults (18+)', 'Corporate') and p.audience in ('enfants', 'ados'))
        or (s.age_category in ('Young Learners (6-12)', 'Teens (13-17)') and p.audience = 'adultes'))
    group by 1, 2 order by 1, 2;
   -- d. Birth dates in the future or less than a year before the business date.
   select count(*) as birth_too_recent
     from public.students
    where deleted_at is null
      and date_naissance > ((now() at time zone public.centre_utc_offset())::date - interval '1 year')::date;
   rollback;
   ```

   Query b also counts « Annulé » tests that kept the old form's « A1 » (any status other than « Planifié » with a level or score), so its count can run high; such rows are not results.

   None of these rows is changed by 141. Rows in b, c or d are refused only when that value is written again (a result or status change, the category, programme or level, the birth date); report the counts with the release approval.
1. Apply 141 (after 140), then deploy the C2 build. The deployed B2 build keeps working on 141 except where C2 changes the rules on purpose: its « Planifier un test » insert and its learner-test edits are refused for every staff role (no staff table policies), it can still offer « Passé » (refused by `crm_update_placement_test`), and its attendance page saves untouched rows as « Présent » unless refused by the new date rules. Deploy the build right after the migration.
2. No data is written by 141 except the empty age bounds of `programme_levels`. Existing files and tests are not re-checked until edited.
3. D7 needs its own approval (« approve D7 ») with the `d7_plan()` counts; until it runs, groups without ticked days are not restricted by class day (the attendance page shows them every day).
4. Rollback: deploy the B2 build, then (`select crm_security.d7_revert();` first if D7 ran and is kept) run `141_desk_academics_restore.sql`. It must run before B2's restore.

## IMPLEMENTATION CONTRACT

**Scope:** sections 2a and 4–10 of this plan at revision RWR-r5, as amended by the owner's answers to OD-1–OD-20, recorded in the [approval record](#approval-record) (owner approval of 2026-11-21 at `824252a`, architecture only).

**Prerequisites:**
- **Owner approval of the plan:** given on 2026-11-21 at `824252a` (architecture only); implementation still needs its own approval.
- **A clean merged base.**
- **For A1:** R0 done (its own approval); the owner's weekday hours and closed dates (OD-3) given before A1 starts — given 2026-11-21: current published `weekly_hours` unchanged, no closed dates (values from Q01). **A1 merges** only after PR #204 (OD-19 = A), rebased, with a fresh CI run and exact-SHA review.
- **For B1 and C2:** PR #204 merged.
- **A1:** done — released 2026-11-23 ([release record](#release-record-pr-a1--2026-11-23)).
- **D1:** done — run 2026-11-23 after its four gates were met ([D1 record](#release-record-data-step-d1--2026-11-23)). `d1_revert` was available until M-A2; it is gone since 137 (2026-11-24).
- **A2:** done — released 2026-11-24 ([release record](#release-record-pr-a2--2026-11-24)); the D1 functions and `d1_revert` are gone with 137.
- **C1:** done — released 2026-11-26 ([release record](#release-record-pr-c1--2026-11-26)), migration 138.
- **B1:** done — released 2026-11-26 ([release record](#release-record-pr-b1--2026-11-26)), migration 139; hotfix #220 deployed 2026-11-26 ([record](#release-record-hotfix-pr-220--2026-11-26)).
- **D3:** done — run 2026-11-26 ([D3 record](#release-record-data-step-d3--2026-11-26)).
- **D5:** done — run 2026-11-26, 2 pairs ([D5 record](#release-record-data-step-d5--2026-11-26)); 1 further pair waits until its enrollment is ended.
- **For B2 (next, migration 140):** implemented on its pull request ([B2 implementation record](#implementation-record-pr-b2-m-b2-migration-140)); its own review and release approval; no prices needed (OD-16 replaced 2026-11-26). D6's functions are in it (owner decision of 2026-11-26 in the B2 record), not run.
- **For C2 (with D7, migration 141):** implemented on its pull request ([C2 implementation record](#implementation-record-pr-c2-m-c1-academic-part-migration-141)); its own review and release approval. D7's functions are in it, not run (« approve D7 » with the `d7_plan()` counts).
- **For D4:** its own approval.

**Object manifest (provisional names; migration numbers are claimed at merge):**
- **Migrations:** `NNN_crm_one_next_action.sql`, `NNN_crm_one_next_action_enforce.sql`, `NNN_people_identity.sql`, `NNN_catalogues.sql`, `NNN_desk_payments.sql`, `NNN_desk_academics.sql` (C1 and C2 may share one).
- **SQL functions and tables:** as listed in §§4–6.
- **Modules:** as in §8.
- **ADR:** [ADR-019](../decisions/ADR-019-one-next-action-per-prospect.md).

**Rules for implementers:**
- Build every rewritten function from its **latest** live definition (the §4.2 writer inventory names each one with its migration and line). Never rebuild from 078 or 080.
- Every `crm_tasks` writer goes through `set_next_action`; `scripts/test-crm-task-writers.sql` proves it on each PR. The only exception was `d1_revert`, from PR A1 until M-A2 dropped it in PR A2 (2026-11-24).
- An action the system derives from a call result never replaces an appointment, an enrolment action or our own step (§4.2 step 3); only an explicit user choice can, as OD-18 decides.
- « Pas de réponse » saves immediately with no « Annuler » and no hold (OD-20 = B); a mistake is corrected by a new exchange; request keys stay stable per submission, as today.
- Keep conversion exactly as ADR-015 decision 4 defines it; only `evaluate_conversion`'s task-closing statement changes.
- Student phone checks run only on insert or a phone change; student merge never updates an enrollment, charge, receipt, attendance or test row, never re-points a prospect with an enrollment link, and never archives a student holding a live enrollment.
- Production free text and phone fragments never enter the repository (R0 outputs, D4 mapping).
- Keep the lifecycle barrier, the event types and the first-touch immutability.
- No browser writes to CRM, placement, attendance or student tables outside the services.
- No clock override in application code.
- French UI strings: « prospect » or « contact », never « parent ».
- Every PR updates the upgrade-lane migration ceiling and, where behaviour changes, [PRODUCT_RULES](../../ai/PRODUCT_RULES.md), [WORKFLOWS](../../ai/WORKFLOWS.md), the help guide (`GuideContent.jsx`) and [CURRENT_STATE](../../ai/CURRENT_STATE.md) after release.

**Acceptance:**
- §7 invariants hold on the local stack after each PR, for the invariants that PR owns.
- §8 targets are met by the day scripts.
- All existing suites stay green.
- R-checks after each release return 0 for the invariants of that release.

**Stop conditions:**
- Any Meta lifecycle or intake test needs a change of expectation.
- A cumulative function on `main` differs from the body this plan names (re-read and re-plan the diff).
- The writer inventory scan finds a function the §4.2 table doesn't list.
- Any D1 post-check (Q04, Q05 zero-action active, Q07, Q29) isn't 0 before M-A2.
- R0 reveals counts or shapes this plan doesn't handle (for example, actions on merged leads).
- D1 or another dry run differs from the approved counts.
- A finance regression suite fails.
- OD-2 = B or OD-9 = B: return to architecture for that part.

**Status reporting:** the AGENTS.md implementation handoff for each PR (branch, exact head SHA, tier, tests and evidence, self-check, documentation, blockers), stopping at READY FOR INDEPENDENT REVIEW. Release steps each follow the rollout template with separate approvals.
