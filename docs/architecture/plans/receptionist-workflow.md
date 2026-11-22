# Receptionist workflow — one next action, one identity, one rule per form

**Status: APPROVED (architecture only), revision RWR-r5 at exact head `824252a359f99ad5d8077754c3504b2aa4eb07f2`, 2026-11-21** ([approval record](#approval-record)). Implementation is not authorized. Tier 3: the plan covers CRM commands and their invariants, migrations that change existing Production data, finance screens, conversion-adjacent paths and a role-surface change. Nothing is implemented, applied, merged or released. Every Production read, migration, data step, merge and release needs the owner's separate approval.

- **Evidence:** the [audit of 2026-11-21](../evidence/receptionist-workflow-audit-2026-11-21.md). It covers every finding with its status and file references, plus the new findings NF-1–NF-17, the entry-point matrix, the current state machine and the read-only queries Q01–Q30.
- **Decision record:** [ADR-019 (accepted)](../decisions/ADR-019-one-next-action-per-prospect.md).
- **Baseline:** `origin/main` `53c486b`, migration ceiling 130.
- **Overlapping open work:** plan RPW-r2 (PR #203, approved 2026-11-21) and its implementation PR #204 (migrations 131–135, not merged).

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
| `center_visit` becomes « Rendez-vous au centre »; `placement_test_id` (exists) links its optional level test | one appointment, one calendar event |
| `placement_tests.status` adds `Annulé`, `Absent`; adds `cancelled_at`, `cancelled_by`, `cancel_reason` | cancellation and no-show |
| `crm_followup_policies` adds `opening_hours jsonb` (NULL means the same as `weekly_hours`); `date_exceptions` (exists, today always `[]`) holds closed dates and holidays | one source of hours, one set (OD-3 = B: `opening_hours` stays NULL) |
| `crm_activities` adds `command_key text` and `is_primary boolean not null default false` (index `(lead_id, command_key)`) | one history entry per user action (§4.7) |
| `crm_leads.owner_id` gets defaults through the service (no column change); new setting row `crm_reception_default_owner` in an existing settings table or a new `crm_settings` row (implementer chooses the existing table if one fits) | ownership (§4.6) |
| `crm_data_step_journal(step text, entity text, entity_id uuid, before jsonb, after jsonb, run_at timestamptz, run_by uuid)` | journal of D1 and later steps, readable by the director |

M-A2, only after data step D1's post-checks are all 0 (§10: Q04, Q05 zero-action count, Q07, Q29):

- `create unique index crm_tasks_one_open_per_lead on crm_tasks(lead_id) where status='open'`. A unique index can't be deferred, so `set_next_action` always closes the current action **before** inserting the new one, in the same transaction.
- Deferred constraint triggers `crm_next_action_presence` (`after insert or update on crm_leads`, `after insert or update or delete on crm_tasks`, `initially deferred`), checking the touched lead at commit:

  | Lead state | Open actions allowed at commit |
  | --- | --- |
  | NEW, CONTACTING, ENGAGED, QUALIFIED, not merged | exactly 1 (OD-1 = A) or at most 1 (OD-1 = B) |
  | LOST, NOT_QUALIFIED | 0 |
  | CONVERTED | 0 (conversion closes them, as today) |
  | merged (`merged_into_lead_id` set), any status | 0 (the merge closes them) |

- A deferred trigger on `placement_tests`: at commit, a `Planifié` test of a LOST, NOT_QUALIFIED or merged lead is refused, and a `Planifié` CRM test of an active lead must be the `placement_test_id` of that lead's open appointment.

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
| — | create, origin walk-in or inbound call, with exchange | ENGAGED, or QUALIFIED if an appointment or « Inscrire » | the exchange's next action | if test option ticked |
| NEW, CONTACTING | `no_answer`, `busy`, `declined`, `unreachable` | CONTACTING | next cadence slot; after 5: « En attente », no relance date (OD-17) | — |
| ENGAGED, QUALIFIED | the same failed results (`125:843`) | same | if the current action is a call: next slot (after 5, « En attente »); if it is an appointment, an enrolment action or our step: **unchanged** | unchanged |
| active, not converted | « Inscrire maintenant » / enrolment start | QUALIFIED (step `enrollment`) | « Finaliser l'inscription » (an open one is kept); none once the payment converts | kept |
| active | `wrong_number` + corrected phone | same | cadence restarts (slot 1 of a new cycle) if the current action is a call; otherwise unchanged | — |
| active | `wrong_number` + close | NOT_QUALIFIED (`wrong_number`) | none | cancelled |
| NEW, CONTACTING, ENGAGED | `spoke` + callback, our step, waiting | ENGAGED | that action | — |
| active | `spoke` + appointment or « Inscrire » | QUALIFIED (step derived) | appointment (existing one reused) / « Finaliser l'inscription » (today) | test if ticked |
| active | `crm_change_next_action` | same | the new one (old one cancelled, « Remplacée »); replacing an appointment or enrolment action by a call or message follows OD-18 | moved or cancelled with the appointment |
| QUALIFIED | appointment outcome `came_will_return` | QUALIFIED | « En attente », relance J+5 (OD-5) | test result can be entered |
| QUALIFIED | `came_not_interested` | LOST (reason required) | none | — |
| QUALIFIED | `no_show` | QUALIFIED | « Rappel » (reminder, tomorrow) or close | `Absent` |
| QUALIFIED | `came_enrolled` → payment | CONVERTED | none | kept (now a student test) |
| active | test result entered (after the test time) | same | unchanged if the current action is « En attente » or later; otherwise « Proposer l'inscription » (our step, post-test SLA) | `Résultat saisi` |
| active | close (any reason) | LOST / NOT_QUALIFIED | none | `Annulé` |
| LOST, NOT_QUALIFIED | reopen | CONTACTING or ENGAGED (as today) | required, any kind | — |

No transition creates without closing, and none closes without either creating or ending the prospect. The property tests (§9) assert this.

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
  - **`programme_prices`** `(programme_code, school_year, amount, label_fr, effective_from, created_by)`: director-edited, used as the default gross amount in both payment screens (still editable, with the discount rules unchanged). The owner supplies the values.
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
| 2 | A closed prospect has no open action, appointment or planned test | T2 in the same suite; property test; `test-crm-next-action-enforced.sql` (a test booked then the prospect closed, a test left on a merged prospect) | Q07, Q29 | DB: deferred triggers (M-A2); service: close path |
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
| **D6 / D7** (operator) | test-data clean-up; class days | release record | per §10 | rehearsed | C2 (D7); D6 any time after OD-13 | low |

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
| D1 | bring every existing prospect into the model | `select crm_security.d1_plan()` returns a count and 5 sample lead ids **per rule**, and separately the count and 5 samples (test id, lead id, rule) of **every planned test D1 would cancel under any rule**; that count is part of `expected_counts`. (a) **several open actions:** keep, in this order, the earliest future agreed appointment (`schedule_kind='appointment'`, `due_at > now()`), else an appointment linked to a **still-planned test** (past or future; the earliest test if several), else the most recently created, through `set_next_action` in D1 mode `keep` (§4.2): the others are cancelled « Doublon de prochaine action (fusion D1) », and a test linked to the kept action is never cancelled, even when a cancelled duplicate pointed to it too. (b) **planned CRM test of an active prospect without its appointment:** create the « Rendez-vous au centre » linked to the test at the test's time (even if past, so its outcome gets recorded); any other open action is replaced « Remplacée par le rendez-vous du test (D1) » and listed in the sample. (c) **active prospect with no open action:** after 5 failed calls, « En attente » with no relance date (OD-17); otherwise « En attente » with no relance date and a « À revoir (D1) » flag the receptionist sees in « En attente ». (d) **closed, converted or merged prospect** with open actions: cancelled « Prospect clôturé (D1) »; its planned tests → `Annulé`. | Q04, Q05, Q06, Q07, Q29, Q30 (owner's brief: 20 leads with 2+ actions, 9 with exact duplicates) | `select crm_security.d1_apply(expected_counts jsonb)`, which raises if any rule's count, or the cancelled-test count, differs from the approved dry run. It writes **only through `set_next_action`** in its D1 mode (§4.2: `keep` for rule a, `create` for rules b and c, `null` for rule d), so it needs no writer exception. Rule (b)'s appointments may be in the past or outside the new hours: `d1_apply` sets the transaction-local flag `eh.crm_data_step = 'd1'`, under which `set_next_action` skips the « future » and `assert_in_hours` checks for that transaction only, and each such row is journalled with « hors règles (D1) ». | `crm_security.d1_revert()`, **only before M-A2**, deletes nothing (`crm_activities` references tasks `on delete restrict`, `078:248`, and history is append-only): it **cancels** the actions D1 created (« Annulé (retour D1) ») and **reopens** the exact rows D1 cancelled (the `crm_tasks_terminal` check allows `open` with the cancellation fields cleared; the journal and a « Rouvert (retour D1) » activity keep the record), only for leads whose version hasn't changed since; a test cancelled by D1 returns to `Planifié` only if its date hasn't passed, otherwise it stays `Annulé` and is listed for the receptionist (a closed prospect's test, or an active prospect's past test cancelled under rule a, review note a) | « approve D1 » with the per-rule counts and the cancelled-test count |
| M-A2 | index, triggers, revokes; drops `d1_plan`, `d1_apply`, `d1_revert` and the `eh.crm_data_step` bypass | just before: Q04 = 0, Q05 active prospects with 0 actions = 0, Q07 = 0 (closed, converted **and merged** prospects, r3), Q29 = 0 (the wrapper re-checks them in the same transaction and aborts otherwise) | all 0 | wrapper | drop the index and triggers; re-grant the wrappers (the D1 functions are not restored: D1 can no longer be reverted after M-A2) | « approve M-A2 » |
| M-B1 | identity (§5.1–5.3) | md5 guards | — | wrapper | prior bodies; additive columns and tables | « approve M-B1 » |
| D3 | phones: students, authorized adults, contacts (`212…` without « + »); placeholders → NULL | `d3_plan()`: counts per category (E.164 already, no « + », no leading 0, separators, placeholder, unnormalisable) and 5 sample ids | Q11 (owner's brief: 181 students, 83 standard, 34 without « + », 29 without leading 0, 28 malformed) | `d3_apply(counts…)`; unnormalisable rows untouched and listed for manual correction | journal holds raw values: `d3_revert()` | « approve D3 with counts » |
| M-B2 | catalogues | — | — | wrapper | additive. The FK on `crm_leads.session_type` is dropped; the old 8-value check is restored **only after `d4_revert()`** (D4 may have written codes outside it), or else restored `not valid` so existing rows aren't rejected. The rollback file states both orders. | « approve M-B2 » |
| D4 | programme and origin mapping | Production free text never enters the repository. Q25 returns only an 8-character hash and a count per distinct value. The operator exports the distinct values to a **private** file outside the repository (as with release dumps); you and the operator fill the code for each value there. `d4_plan(mapping jsonb)` takes that mapping as `{hash: code}` and returns counts per code plus the hashes left unmapped | Q25 | `d4_apply(mapping jsonb, counts)`; unmapped values stay with `session_type` / `origin_code` NULL and are flagged. The release record keeps the mapping's hash and the counts, never the text | journal (`d4_revert()`) | « approve D4 » with the counts and the mapping hash |
| D5 | student merges | `d5_plan(pairs)`: for each owner-listed pair, what moves and any conflicts | Q28 list, reviewed by the owner | `merge_students` per pair, in one journalled transaction | `unmerge_student(source)` while nothing has changed since | « approve D5 pairs … » |
| M-C1 | desk payments and academics | md5 guards | — | wrapper | prior bodies | « approve M-C1 » |
| D6 | test data | `d6_plan()`: the Q24 ids + owner-supplied ids, classified: (a) no financial, CRM or attendance history → delete; (b) CRM rows → close NOT_QUALIFIED `invalid_spam` with a note and exclude from reports (append-only CRM history); (c) students with receipts → archive (`deleted_at`) and exclude; voided receipts 00459–00461 **stay** (gap-free numbering); test group: delete if empty, otherwise close | Q24 | `d6_apply(ids, counts)` | journal; deletions only for class (a) after a private export | « approve D6 » (OD-13) |
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
| OD-16 | Programme prices | Provide the 2026/2027 price per programme for the catalogue (director-editable afterwards) | — | B2 (defaults only) |
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
- the default owner's account (OD-6): **D1 must not run without it**;
- the 2026/2027 programme prices (OD-16): before release B2.

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

## IMPLEMENTATION CONTRACT

**Scope:** sections 2a and 4–10 of this plan at revision RWR-r5, as amended by the owner's answers to OD-1–OD-20, recorded in the [approval record](#approval-record) (owner approval of 2026-11-21 at `824252a`, architecture only).

**Prerequisites:**
- **Owner approval of the plan:** given on 2026-11-21 at `824252a` (architecture only); implementation still needs its own approval.
- **A clean merged base.**
- **For A1:** R0 done (its own approval); the owner's weekday hours and closed dates (OD-3) given before A1 starts — given 2026-11-21: current published `weekly_hours` unchanged, no closed dates (values from Q01). **A1 merges** only after PR #204 (OD-19 = A), rebased, with a fresh CI run and exact-SHA review.
- **For B1 and C2:** PR #204 merged.
- **For D1:** the default owner's account named (OD-6).
- **For B2:** the 2026/2027 programme prices (OD-16).

**Object manifest (provisional names; migration numbers are claimed at merge):**
- **Migrations:** `NNN_crm_one_next_action.sql`, `NNN_crm_one_next_action_enforce.sql`, `NNN_people_identity.sql`, `NNN_catalogues.sql`, `NNN_desk_payments.sql`, `NNN_desk_academics.sql` (C1 and C2 may share one).
- **SQL functions and tables:** as listed in §§4–6.
- **Modules:** as in §8.
- **ADR:** [ADR-019](../decisions/ADR-019-one-next-action-per-prospect.md).

**Rules for implementers:**
- Build every rewritten function from its **latest** live definition (the §4.2 writer inventory names each one with its migration and line). Never rebuild from 078 or 080.
- Every `crm_tasks` writer goes through `set_next_action`; `scripts/test-crm-task-writers.sql` proves it on each PR. The only exception is `d1_revert`, from PR A1 until M-A2 drops it in PR A2.
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
