# Receptionist workflow — one next action, one identity, one rule per form

**Status: PROPOSED (architecture only), revision RWR-r1, 2026-11-21.** Tier 3: the plan covers CRM commands and their invariants, migrations that change existing Production data, finance screens, conversion-adjacent paths and a role-surface change. Nothing is implemented, applied, merged or released. Every Production read, migration, data step, merge and release needs the owner's separate approval.

- **Evidence:** the [audit of 2026-11-21](../evidence/receptionist-workflow-audit-2026-11-21.md). It covers every finding with its status and file references, plus the new findings NF-1–NF-17, the entry-point matrix, the current state machine and the read-only queries Q01–Q28.
- **Decision record:** [ADR-019 (proposed)](../decisions/ADR-019-one-next-action-per-prospect.md).
- **Baseline:** `origin/main` `53c486b`, migration ceiling 130.
- **Overlapping open work:** plan RPW-r2 (PR #203, approved 2026-11-21) and its implementation PR #204 (migrations 131–135, not merged).

| Revision | Date | Change |
| --- | --- | --- |
| RWR-r1 | 2026-11-21 | First architecture from the owner's three test rounds (P0–P2, sections 1–5 of the brief). |

# Owner summary

## What will change

- **One next action per prospect, everywhere.** Any new action replaces the current one, and the form says so (« Remplace : Rappel 24/11 10:00 »). The database refuses a second open action. The card, drawer, list, « Tâches », « Aujourd'hui » and the calendar all read the same next action from one function.
- **Two dialogs instead of six:**
  - **« Noter un échange »** covers calls, WhatsApp, at the desk and other channels, with one-tap call results.
  - **« Changer la prochaine action »** replaces « Planifier », « Replanifier », « Annuler l'action », « Terminer » and « Qualifier ».
  - A note never touches the next action.
- **« Rendez-vous au centre »** replaces separate visits and level tests; the test is an option of the appointment. Booking it replaces the pending reminder. After the appointment time, four outcome buttons appear: « Venu – inscrit sur place », « Venu – reviendra », « Venu – pas intéressé », « Pas venu ».
- **« En attente du prospect »** is a next action with an optional « relancer le… » date (7 days by default). These prospects appear under « En attente », never under « En retard ».
- **A date is asked only when something was agreed** (a callback time, an appointment) **or when the next step is ours** (send the price, confirm a group).
- **Closing a prospect** cancels its next action and its planned test or appointment.
- **A screen with stale data is refused** (« Ce prospect a été modifié, rechargez ») and never overwrites silently.
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
- **The prospect's version is the concurrency token** for every next-action, appointment and test change. Test booking now bumps it (NF-2).
- **Merges and phone corrections are journalled.** Merges are direction-only.
- **No test clock in Production code.** Time-travel tests age fixture data on the local stack instead (section 9).

## Risks / owner review points

1. **Size.** Three releases (A, B, C) in order; A first. A is large, but splitting it would leave the database rule without its UI, or the reverse.
2. **Two of your requirements conflict with approved decisions:**
   - « hold a seat with a due date » vs ADR-015 (OD-2)
   - item 24 vs RPW-r2 (OD-9).
3. **Qualification becomes implied** by booking an appointment or choosing « Inscrire maintenant » (OD-11). This changes how many prospects reach « Qualifié », and with it the dormant Meta « Qualified » event.
4. **D1 picks which duplicate action survives** (an agreed future appointment first, otherwise the most recent intent). You approve the counts and samples before it runs.
5. **Release B starts after PR #204** is merged, because both change the student write paths.

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
- **Not verified:** no Production read was made. Your counts of 21/11 are quoted as owner-supplied, and R0 re-counts them with Q01–Q28.

## 2. Root-cause map

| # | Design flaw | Symptoms (brief item · audit) |
| --- | --- | --- |
| **RC-1** | **No single-next-action rule.** 14 code paths open tasks with 4 different closing rules. « At least one open task » is the only server rule; D6 (consolidation) was deferred in October. | 2, 12b, the « Toutes les prochaines actions (2) » count, duplicate visits, the growing overdue list, NF-3 |
| **RC-2** | **« Next action » and « schedule » are computed in five places,** and tests live apart from appointments. Card and drawer take the earliest task; Tâches, Today and the calendar list every task; the pop-up re-reads the earliest. There are no time rules on outcomes. | 2, 16a–d, « rescheduling ignored », NF-5, NF-6, NF-11, NF-12, NF-14 |
| **RC-3** | **The UI is organised around commands, not around what happened.** Four dialogs log the same exchange, a date is forced after almost every action, there are success pop-ups, and the walk-in path is hidden. | 6, 10, 11, 12b, « will come later » prospects going overdue |
| **RC-4** | **Ownership is optional and copied, not derived.** New prospects have no owner, a task copies the owner once when created, and « Tâches » filters on the task assignee. | 1a–c, invariant 10 |
| **RC-5** | **No shared identity layer.** Phone normalisation exists only in the CRM and returns NULL instead of refusing. Students, receipts and adults store free text. Every search box has its own rule, duplicate checks come after creation (or never), and there is no edit, no merge, no sibling link and no CRM ↔ student lookup. | 3, 4, 5, 6, 12a, 12c, NF-8, NF-9, NF-10 |
| **RC-6** | **No shared vocabularies.** Programme (3 vocabularies + free text), origin (free text vs 5 values), close reasons (two lists), levels (36 options), English codes shown raw. | 13, 14, 16e, 19, 20b, 23c, 23d, 25e, 25f, NF-15 |
| **RC-7** | **Two payment paths with different rules and different balance reads.** | 7, 8, 9, 20a, 20c, 20d, NF-4 |
| **RC-8** | **History records system events, not user actions.** One action writes up to seven rows, the note is copied onto several of them, and the actor fallback hides missing names. | 15a–c, invariant 8 |
| **RC-9** | **No single source of hours.** Only calling windows exist; visits and tests are unchecked; presets land on window openings while agreed times are refused. | 17a–c, invariant 4 |
| **RC-10** | **The client defeats or hides server guards.** It adopts the new version after a conflict, does no pre-check, leaves stale errors, has no dirty-form guard, uses native validation, and creates a fresh key per click in two places. | 18, 25a–d, NF-1, NF-7, NF-13, invariant 15 |
| **RC-11** | **Students, groups and attendance are written by table writes or thin commands without business rules.** | 21, 22, 23b, NF-17 |
| **RC-12** | **Role surface doesn't match the command surface.** The receptionist group command accepts « Online ». | 24a, NF-16 |

The design below fixes each root cause once. Patching symptoms one at a time is a non-goal.

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
| `crm_followup_policies` adds `opening_hours jsonb` (NULL means the same as `weekly_hours`); `date_exceptions` (exists, today always `[]`) holds closed dates and holidays | one source of hours, two sets (OD-3) |
| `crm_activities` adds `command_key text` and `is_primary boolean not null default false` (index `(lead_id, command_key)`) | one history entry per user action (§4.7) |
| `crm_leads.owner_id` gets defaults through the service (no column change); new setting row `crm_reception_default_owner` in an existing settings table or a new `crm_settings` row (implementer chooses the existing table if one fits) | ownership (§4.6) |
| `crm_data_step_journal(step text, entity text, entity_id uuid, before jsonb, after jsonb, run_at timestamptz, run_by uuid)` | journal of D1 and later steps, readable by the director |

M-A2, after data step D1 reaches 0:

- `create unique index crm_tasks_one_open_per_lead on crm_tasks(lead_id) where status='open'`
- deferred constraint triggers `crm_next_action_presence` on `crm_leads` and `crm_tasks`:
  - an active lead (NEW…QUALIFIED, not merged) has **exactly one** open action at commit (OD-1);
  - LOST or NOT_QUALIFIED has none;
- a deferred trigger on `placement_tests`: a `Planifié` test of a LOST or NOT_QUALIFIED lead is refused at commit.

### 4.2 The single writer

`crm_security.set_next_action(l crm_leads, spec jsonb, cause text, source text) returns uuid`, not granted to any role, is the **only** code that opens or closes an open `crm_tasks` row. It:

1. Requires the caller to hold the lead row lock (callers already `select … for update`).
2. Validates `spec` against the date rule (§4.4) and the hours (§4.5), and checks overlap for the person (invariant 3: lock the lead row and, when `student_id` is set, an advisory lock on the student).
3. Applies the replacement. If an open action exists:
   - **Same appointment kept:** when `spec` is an appointment and the current action is an appointment, and `spec.keep_existing` is set, it returns the current id (« qualifier avec un rendez-vous existant le réutilise »).
   - **Outcome recorded:** when the cause is an outcome or a call result, it finishes the current action as completed.
   - **Anything else:** it cancels the current action with `replaced_reason`.
   It then inserts the new row with `supersedes_task_id`. A `spec` of `null` means « no next action » and is accepted only for closure and conversion.
4. Cancels the linked test (`Annulé`) when an appointment with a test is replaced or closed. A rescheduled appointment moves its test.
5. Sets `assigned_to` to the lead owner (§4.6).
6. Writes no history line of its own; the calling command writes the primary activity (§4.7). It returns the new task id.

Every path uses it:

| Path | Before | After |
| --- | --- | --- |
| manual create, intake (`create_manual_lead`, `accept_external_submission`) | insert `first_contact` | `set_next_action(first_contact)`; for walk-in and inbound call, the exchange's own next action (§4.8) |
| call results (`record_call_outcome`) | finish + cancel slots + insert next slot | `set_next_action(next slot)` or, after 5, `awaiting_prospect` (OD-5) |
| conversation, decision, qualify, schedule, reschedule, complete, cancel, reopen | §1 of the audit | `set_next_action(spec)` |
| test booking and edits | insert test, close confirm tasks | through the appointment (§4.3) |
| close | `cancel_tasks` | `set_next_action(null)` + cancel planned tests |
| conversion (`evaluate_conversion`) | cancels all | `set_next_action(null)`; completes the appointment as `came_enrolled` when it was today |

The cumulative bodies are rewritten from their **latest** definitions:
- `crm_security.command` (125)
- `crm_record_conversation_decision` (119)
- `crm_book_placement_test` and `crm_update_placement_test` (119)
- `crm_security.accept_external_submission` (125)
- `crm_security.evaluate_conversion` (120)
- `crm_security.new_task` (111): kept only as the insert primitive inside `set_next_action`.

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
| « En attente du prospect » | `awaiting_prospect` | optional « relancer le » (default today + 7 days, OD-5) | none | — |
| Note | — | — | — | does not touch the next action |

Agreed times are never moved; system times always come from `next_window` over the same hours. So the system never creates a time it would refuse from a user (invariant 4).

### 4.5 Hours

One versioned source in `crm_followup_policies`:
- `weekly_hours` = calling hours
- `opening_hours` = desk hours for appointments and tests (OD-3)
- `date_exceptions` = closed dates.

`crm_security.assert_in_hours(policy, kind, ts)` is used by every writer, including test booking, attendance (class days) and the Admissions form. The director publishes a new version from a new « Horaires du centre » card on `/settings`, through the existing `create_followup_policy` command extended with `opening_hours` and `date_exceptions`. Forms show the hours next to the picker, and the picker offers only valid slots. No hour value is invented by this plan: the owner supplies them (OD-3) and R0 reads the live policy (Q01).

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
| NEW, CONTACTING | `no_answer`, `busy`, `declined`, `unreachable` | CONTACTING | next cadence slot; after 5: « En attente » (OD-5) | — |
| active | `wrong_number` + corrected phone | same | cadence restarts (slot 1 of a new cycle) | — |
| active | `wrong_number` + close | NOT_QUALIFIED (`wrong_number`) | none | cancelled |
| NEW, CONTACTING, ENGAGED | `spoke` + callback, our step, waiting | ENGAGED | that action | — |
| active | `spoke` + appointment or « Inscrire » | QUALIFIED (step derived) | appointment (existing one reused) / « Finaliser l'inscription » (today) | test if ticked |
| active | `crm_change_next_action` | same | the new one (old one cancelled, « Remplacée ») | moved or cancelled with the appointment |
| QUALIFIED | appointment outcome `came_will_return` | QUALIFIED | « En attente », relance J+7 | test result can be entered |
| QUALIFIED | `came_not_interested` | LOST (reason required) | none | — |
| QUALIFIED | `no_show` | QUALIFIED | « Rappel » (reminder, tomorrow) or close | `Absent` |
| QUALIFIED | `came_enrolled` → payment | CONVERTED | none | kept (now a student test) |
| active | test result entered (after the test time) | same | unchanged if the current action is « En attente » or later; otherwise « Proposer l'inscription » (our step, post-test SLA) | `Résultat saisi` |
| active | close (any reason) | LOST / NOT_QUALIFIED | none | `Annulé` |
| LOST, NOT_QUALIFIED | reopen | CONTACTING or ENGAGED (as today) | required, any kind | — |

No transition creates without closing, and none closes without either creating or ending the prospect. The property tests (§9) assert this.

### 4.9 UI flow changes (release A)

- **Drawer:** one « Prochaine action » panel showing the action, its owner, « En retard » when overdue, and two buttons, « Noter un échange » and « Changer ». « Toutes les prochaines actions » disappears; after M-A2 it can't hold more than one. Call results are one-tap buttons (« Pas de réponse », « Occupé », « Refusé », « Injoignable », « Mauvais numéro », « On a parlé »). « Pas de réponse » saves immediately and shows a toast with « Annuler ». The undo is a compensating command, allowed for 10 s and only while the lead version is unchanged.
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
- **Storage:** E.164 in `crm_contacts.phone_e164` and `whatsapp_e164` (raw kept), `students.telephone`, `authorized_adults.telephone`. A `before insert or update` trigger on students and authorized adults normalises the value and refuses an invalid or placeholder one (« Numéro invalide » / « Numéro fictif : laissez vide »). Teachers and profiles are out of scope.
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
- **`merge_students(source, target)`** (director, admin; OD-8 = A):
  - moves enrollments with no conflict (one live enrollment per programme and year: ADR-010), attendance, tests, family links, CRM links and portfolio rows, all journalled;
  - archives the source with `merged_into_student_id`.
  Receipts and charges stay on the source id; the student's finance view reads `student_id in (target, sources merged into it)`. No financial row is updated.

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

- **One booking path for prospects:** « Rendez-vous au centre » with the test option. Admissions « Planifier un test » uses `find_people`. A prospect is routed to the appointment command; an existing student uses `book_student_placement_test`, a new definer command with the same date, hours and overlap rules. Direct table writes from the browser are removed: RLS insert and update for staff are replaced by commands.
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
| 1 | A prospect has at most one open next action (exactly one when active, OD-1) | `scripts/test-crm-next-action.sql` T1 (every command); `scripts/test-crm-sequences.mjs` (property, after every step) | Q04, Q05 | DB: unique index + deferred presence trigger (M-A2); service: `set_next_action` |
| 2 | A closed prospect has no open action, appointment or planned test | T2 in the same suite; property test | Q07 | DB: deferred triggers (M-A2); service: close path |
| 3 | No two appointments or tests for one person overlap | T3; property test with sibling and student cases | Q08 | service: `set_next_action` and test commands under lead and student locks |
| 4 | Every scheduled item is within hours; the system never creates what it would refuse | T4: every system-generated time passes `assert_in_hours`; fuzz of presets × policies | Q09 | service: `assert_in_hours` in every writer; UI: slot picker |
| 5 | No result, « Passé » or « done » in the future | T5; `scripts/test-placement-rules.sql`; `scripts/test-attendance-rules.sql` | Q10 | DB: placement trigger, attendance check; service: outcome before start refused |
| 6 | Phones stored in E.164; any format finds them in every box | `scripts/test-phone.mjs` + `scripts/test-phone.sql` (one fixture); `scripts/test-people-search-browser.mjs` (every search box × 6 formats) | Q11 | DB: normalising triggers and `require_phone`; search: `phone_key` everywhere |
| 7 | No two active people share a normalised phone without a confirmed link | `scripts/test-people-duplicates.sql` | Q12 (excluding decided pairs and same contact) | service: create gate + `person_match_decisions` |
| 8 | One user action = one history entry; note text once | T8: per `command_key` exactly one primary row and the note in one row | Q13 | service: primary activity; read: timeline grouping |
| 9 | Card, drawer, list, Tâches, calendar show the same next action | `scripts/test-crm-next-action-views.sql` (compares the five read functions for 50 generated leads) + browser assertion in day scripts | Q04 (by construction after M-A2) | read: every reader calls `crm_security.next_action(lead)` |
| 10 | Every open task has an owner and appears in someone's default view | T10 | Q14 | service: ownership derivation; UI: default `me_or_unassigned` |
| 11 | An enrolled prospect's programme is a catalogue code matching its enrollment | T11 in `scripts/test-crm-enrollment-programme.sql` | Q15 | DB: FK to `programmes`; service: conversion sets it |
| 12 | Open balance = price − discount − payments; both screens agree | `scripts/test-payment-panel.mjs` (unit) + `scripts/test-payment-screens-browser.mjs` (same learner in both screens) | Q16 | read: `get_open_balances` over `charge_balances`; service: no second charge |
| 13 | No receipt created twice by double submit or retry | `scripts/test-receipt-idempotency-local.mjs` (double click, retry, two tabs) | Q17 | DB: `financial_requests` idempotency (exists); UI: stable key per form opening, locked buttons |
| 14 | Each entity has one write service | `scripts/test-single-writer.mjs` (static scan: no browser `insert`/`update` on the listed tables) + `scripts/test-single-writer.sql` (grants: `authenticated` has no table write on them; old wrappers revoked after M-A2) | — | grants and RLS; the [entry-point matrix](../evidence/receptionist-workflow-audit-2026-11-21.md#4-entry-point-matrix) is re-generated in the release record |
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

Order: R0 → A → B → C. A doesn't depend on #204. B and C start from `main` after #204 merges. One branch and one PR per row unless noted; each PR is Tier 3 with full CI and a fresh independent exact-SHA review.

| Task / PR | Scope | Main files | Acceptance | Tests | Depends on | Risk |
| --- | --- | --- | --- | --- | --- | --- |
| **T-R0** (part of PR A1, first commit) | Validate Q01–Q28 against a clean local build at the ceiling; then the owner runs them on Production (R0) | `docs/…/evidence` (results, ids only) | every query runs locally; R0 results recorded | — | — | low |
| **PR A1 — next-action core** | §4 in full: M-A1 schema, `set_next_action`, `next_action`, `assert_in_hours`, four commands + two reads, rewritten bodies (§4.2), intake ownership, version bump on tests, history grouping, readers rewritten (`opportunity_card`, `operational_card`, `crm_get_work_queue` per lead, `crm_get_today`, `crm_get_admissions_calendar` filtered), the hours card in Settings, the D1 function (not run), UI §4.9 | `supabase/migrations/NNN_crm_one_next_action.sql`; `src/components/crm/{ExchangeDialog,NextActionDialog,NextActionPanel,AppointmentOutcome}.jsx` (new); `LeadDetailSheet.jsx`, `WorkQueue.jsx`, `OpportunityCard.jsx`, `OpportunitiesList.jsx`, `AdmissionsCalendar.jsx`, `CrmWorkspace.jsx`; `CrmActionDialog.jsx` (reduced to close and reopen, or retired); `src/lib/crm/{presentation,queries}.mjs`; `src/lib/ui/pluralFr.mjs`; `src/app/(admin)/settings` | invariants 1–5, 8–10, 15 hold on the local stack for new data; old wrappers obey the single-action rule; day scripts 1, 3, 6, 7, 8, 10, 11 meet targets | new: `test-crm-next-action.sql`, `test-crm-next-action-local.mjs`, `test-crm-next-action-views.sql`, `test-crm-sequences.mjs` (fast-check; new devDependency under the audit policy), `test-crm-time-travel-local.mjs`, `test-crm-concurrency-local.mjs`, `test-reception-day-scripts-browser.mjs` (A scripts), `test-reception-forms-browser.mjs`; updated: `test:crm-opportunities*`, `test:crm-work-calendar*`, `test-crm-rcc-a1/a2/b1`, CRM phase suites, lifecycle suites (event types unchanged), upgrade-lane ceiling | R0 | **high** (core commands; Meta lifecycle bodies copied verbatim; a stop condition if any lifecycle test changes) |
| **D1** (operator) | Merge duplicate open actions; cancel tests of closed prospects | wrapper SQL in the release record | dry run = approved counts; post-check Q04 = 0, Q07 = 0 | wrapper rehearsed on a local copy at the ceiling with synthetic duplicates | A1 applied | medium |
| **PR A2** | M-A2: unique index, presence triggers, revoke old wrappers | `NNN_crm_one_next_action_enforce.sql` | index valid; revoked functions refused for `authenticated`; nothing else changed | `test-single-writer.sql`, upgrade lane | D1 = 0 | medium |
| **PR B1 — people** | §5.1–5.3: phones, `find_people`, header search, create gate, sibling and same-person, prospect edit, wrong-number correction (completes A's « Mauvais numéro » with a corrected phone), merges, `person_match_decisions`, D3 and D5 functions (not run) | `NNN_people_identity.sql`; `src/lib/phone.mjs`; `scripts/fixtures/phone-cases.json`; `src/components/people/{PeopleSearch,DuplicateGate,MergeDialog}.jsx`; `StudentForm.jsx` (RPW-r2 version), `ReceiptForm.jsx`, students list and directory pages, `CrmEnrollmentDialog.jsx`, import page | invariants 6, 7 for new data; day scripts 4, 5 | `test-phone.mjs/.sql`, `test-people-duplicates.sql`, `test-people-search-browser.mjs`, `test-people-merge.sql`, day scripts B | #204 merged; A released | high (merges) |
| **PR B2 — catalogues** | §5.4: programmes, levels, prices, origins, close reasons, French labels; conversion writes programme and origin; D4 function (not run) | `NNN_catalogues.sql`; `src/lib/programCatalog.mjs`, `src/lib/ui/presentation.mjs`, `src/lib/crm/presentation.mjs`, receipt presentation and PDF, finance breakdown | invariant 11; no raw English code on staff screens (scan test) | `test-catalogues.sql`, `test-catalogue-labels.mjs` (JS = seed), `test-french-labels-browser.mjs` | B1 | medium |
| **D3 / D4 / D5** (operator) | phones; programme and origin mapping; approved student merges | release record | per §10 | rehearsed locally | B1 / B2 | medium |
| **PR C1 — payments** | §6.1 | `src/components/finance/PaymentPanel.jsx`; `CrmEnrollmentDialog.jsx`, `ReceiptForm.jsx`, receipts pages; `NNN_desk_payments.sql` (`get_open_balances`, the no-second-charge guard, the OD-2 option) | invariants 12, 13; day scripts 2, 9 | `test-payment-panel.mjs`, `test-payment-screens-browser.mjs`, `test-receipt-idempotency-local.mjs`, finance regression suites | A; OD-2 | **high** (finance) |
| **PR C2 — academics, students, small things** | §6.2–6.5, item 25 leftovers, mobile acceptance | `NNN_desk_academics.sql`; placement pages and modal, attendance page and `attendanceSession.mjs`, students pages, `Sidebar.jsx`, `roleAccess.mjs` (OD-9), online page button | invariant 5 (tests, attendance); NF-16 closed | `test-placement-rules.sql`, `test-attendance-rules.sql`, `test-student-rules.sql`, navigation and middleware suites, `test-mobile-reception-browser.mjs` (375 px) | B2; OD-9 | medium |
| **D6 / D7** (operator) | test-data clean-up; class days | release record | per §10 | rehearsed | C2 (D7); D6 any time after OD-13 | low |

### Day scripts (Playwright, `scripts/test-reception-day-scripts-browser.mjs`)

Each script counts clicks and typed fields through a helper and fails above the target. « Today » is counted from the current code: clicks plus required fields, starting from the relevant list.

| Script | Today (from code) | Target |
| --- | --- | --- |
| Unanswered call | 4 (Tâches: Résultat d'appel → Pas de réponse → Enregistrer → Terminé); 5 from the list | **≤ 2** (from the list: open → « Pas de réponse »; from Tâches: 1) |
| Inbound call wanting a test | ~21 in 4 forms (create 7, pop-up 1, conversation and qualify 6, Terminé 1, book test 5, save 1) | **≤ 8 in one form** |
| Walk-in who pays now | ~25 (create, conversation, wizard 2 steps, payment) | ≤ 12, one flow |
| Walk-in « reviendra après la paie » | ~15, with a forced date | ≤ 6, no date unless chosen |
| Mother with two children | ~20, two prospects flagged as duplicates after creation, two simultaneous calls | ≤ 10; one contact, two learners, one Tâches row |
| Current family calling about something else | ~4 plus the risk of creating a prospect (no phone search on students) | ≤ 3 via global search; no prospect created |
| No-show | 6, with free text and a forced date; the test can't be marked absent | 2 (« Pas venu » → confirm the proposed reminder) |
| Callback rescheduled twice, then cancelled | ~13; duplicates if « Planifier » is used | ≤ 9; never a second action |
| Wrong number | 5, and the number can't be fixed | 3 (corrected) or 2 (close) |
| Partial payment, then the balance | ~8 (pick the balance manually; possible confirm) | ≤ 4 (opens on the balance) |
| Prospect closed, then reopened | 3 + 5, then test booking refused (planned test left behind) | 3 + 3; booking works |
| Two staff on the same list | B's stale save succeeds on the second click | B is refused and reloads; the default views split the work |

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
- **Replays of real histories:** for each lead from Q04 and Q06 (ids only), the Q23 output is compared with the [reconstructed sequences](../evidence/receptionist-workflow-audit-2026-11-21.md#6-replaying-the-reported-states). Every distinct sequence becomes a named regression case in `test-crm-next-action.sql` (« R-n: replay of lead #n of R0 », with no personal data) asserting the new design yields one action.

## 10. Migration and data plan

Every migration is forward-only, rehearsed on a private local stack at the ceiling with an upgrade-lane run, applied by the release operator through the guarded wrapper pattern (md5 preconditions on the functions it replaces, a `DRYRUN_OK` sentinel rehearsal, then commit), and needs the owner's approval. Data steps are journalled in `crm_data_step_journal`; each states its dry-run query, the counts expected from R0, the apply step and its rollback.

| Step | What | Dry run (read-only) | Expected (from R0) | Apply | Rollback | Approval |
| --- | --- | --- | --- | --- | --- | --- |
| R0 | Q01–Q28 | — | — | — | — | « approve R0 read-only » |
| M-A1 | schema, services, readers (§4) | function md5 guards | — | wrapper | restore the prior function bodies from the journal of the wrapper (the old bodies are kept in the migration's rollback file); new columns are additive | « approve M-A1 » |
| D1 | one action per lead; close leftovers | `select crm_security.d1_plan()` returns counts per rule and 5 sample lead ids: keep = the earliest future agreed appointment (`schedule_kind='appointment'`, `due_at > now()`), else the most recently created; cancel the others with « Doublon de prochaine action (fusion D1) »; planned tests of LOST and NOT_QUALIFIED leads → `Annulé` « Prospect clôturé (D1) » | Q04 / Q06 / Q07 counts (owner's brief: 20 leads, 9 with exact duplicates) | `select crm_security.d1_apply(expected_tasks, expected_leads, expected_tests)`, which raises if any count differs | `crm_security.d1_revert()` re-opens journalled rows only for leads whose version hasn't changed since; **only before M-A2** | « approve D1: N tasks / L leads / T tests » |
| M-A2 | index, triggers, revokes | Q04 = 0 and Q07 = 0 just before | 0 | wrapper | drop the index and triggers; re-grant the wrappers | « approve M-A2 » |
| M-B1 | identity (§5.1–5.3) | md5 guards | — | wrapper | prior bodies; additive columns and tables | « approve M-B1 » |
| D3 | phones: students, authorized adults, contacts (`212…` without « + »); placeholders → NULL | `d3_plan()`: counts per category (E.164 already, no « + », no leading 0, separators, placeholder, unnormalisable) and 5 sample ids | Q11 (owner's brief: 181 students, 83 standard, 34 without « + », 29 without leading 0, 28 malformed) | `d3_apply(counts…)`; unnormalisable rows untouched and listed for manual correction | journal holds raw values: `d3_revert()` | « approve D3 with counts » |
| M-B2 | catalogues | — | — | wrapper | additive; the FK on `session_type` is dropped on rollback | « approve M-B2 » |
| D4 | programme and origin mapping | `d4_plan()` lists every distinct `program_interest_text` / `source_label` / `referral_source` with the proposed code (a mapping table filled by the implementer from Q25, reviewed by the owner) and counts | Q25 | `d4_apply(mapping_version, counts)`; unmapped values stay with `session_type` / `origin_code` NULL and are flagged | journal | « approve D4 mapping vN » |
| D5 | student merges | `d5_plan(pairs)`: for each owner-listed pair, what moves and any conflicts | Q28 list, reviewed by the owner | `merge_students` per pair, in one journalled transaction | `unmerge_student(source)` while nothing has changed since | « approve D5 pairs … » |
| M-C1 | desk payments and academics | md5 guards | — | wrapper | prior bodies | « approve M-C1 » |
| D6 | test data | `d6_plan()`: the Q24 ids + owner-supplied ids, classified: (a) no financial, CRM or attendance history → delete; (b) CRM rows → close NOT_QUALIFIED `invalid_spam` with a note and exclude from reports (append-only CRM history); (c) students with receipts → archive (`deleted_at`) and exclude; voided receipts 00459–00461 **stay** (gap-free numbering); test group: delete if empty, otherwise close | Q24 | `d6_apply(ids, counts)` | journal; deletions only for class (a) after a private export | « approve D6 » (OD-13) |
| D7 | group class days | `d7_plan()`: `jours` free text → parsed days; unparseable listed | — | `d7_apply` | journal | « approve D7 » |

A fresh manual backup precedes every data step. Earlier release records note that dumps through a VPN fail; the release record states the backup's evidence or the owner's explicit acceptance of its absence.

## Owner decisions required

| # | Question | Options and consequences | Recommendation | Blocking |
| --- | --- | --- | --- | --- |
| OD-1 | One next action: « at most one », or « exactly one » for active prospects? | **A — exactly one** (« En attente » counts as one): every active card shows something, and the « no action » leak (Q05 = 0) is closed. **B — at most one:** prospects may have none and then fall into « attention » again. | A | A1 |
| OD-2 | Hold a seat with a due date | **A:** « Réserver sans paiement » = charge with a due date linked to the prospect, no enrollment, no seat, no conversion (keeps ADR-015). **B:** a new seat-holding status that counts capacity (reverses ADR-015's « an enrollment exists only once it is paid »; new finance and conversion design). | A | C1 |
| OD-3 | Hours | Give calling hours and desk opening hours per weekday, plus closed dates. **A:** two sets (calling ≠ desk). **B:** one set for both. | A, with your values | A1 (values needed for R2) |
| OD-4 | Appointment length for the overlap rule | Visit 60 min and test 45 min, or your values | 60 / 45 | A1 |
| OD-5 | « Relancer » defaults | 7 days for « En attente » (your brief); after 5 failed calls: « En attente » + relance 7 days, or « clôturer proposé » | 7 days; « En attente » after 5 calls | A1 |
| OD-6 | Owner of intake prospects, and the backfill | **A:** a « responsable par défaut » chosen by the direction; backfill existing unowned prospects to that person. **B:** unowned, visible to every receptionist (« Moi + non attribué »). | A | A1 (backfill in D1) |
| OD-7 | Who may void receipts | **A:** director only (today). **B:** director and admin. | A | — |
| OD-8 | Student merge and finance | **A:** receipts and charges stay on the duplicate's id and are shown on the survivor (no financial row changes). **B:** re-point `student_id` on receipts and charges (financial rows updated). | A | B1 |
| OD-9 | Item 24 vs RPW-r2 | **A:** keep RPW-r2; close only NF-16 (no online groups through the reception command; button hidden). **B:** hide « Cours en ligne », « Enseignants » and group creation (reverses RPW-r2 items approved today; decide before #204 merges). | A | C2; #204 |
| OD-10 | Editing origin | **A:** origin editable for manual prospects only; « recommandé par » editable for all; Meta and website first touch stays immutable (product rule). **B:** editable for all (needs an exception to the first-touch rule). | A | B2 |
| OD-11 | Qualification implied by booking an appointment or choosing « Inscrire maintenant » | **A:** implied (fewer clicks; « Qualifié » rises; the dormant Meta Qualified event would follow once activated). **B:** keep an explicit « Qualifier » step. | A | A1 |
| OD-12 | New label for the student status « Prospect » | « Sans inscription » / « Non inscrit » / « Contact » | « Sans inscription » | C2 |
| OD-13 | Test data | **A:** delete only records with no financial, CRM or attendance history; close (CRM) or archive (students) the rest; voided receipts stay. **B:** delete everything named (impossible for receipts and CRM history without breaking the immutability rules). | A | D6 |
| OD-14 | 3-hour rule | **A:** keep the server minimum; « Tentative réelle (hors délai) » records the attempt, counts it in the 5, and doesn't move the cadence earlier. **B:** no override. | A | A1 |
| OD-15 | Receipt and PDF branding text (« Language Center », « Learn Today, Lead Tomorrow ») | Keep (brand) or translate | Keep (brand), translate everything else | C1 |
| OD-16 | Programme prices | Provide the 2026/2027 price per programme for the catalogue (director-editable afterwards) | — | B2 (defaults only) |

## IMPLEMENTATION CONTRACT

**Scope:** sections 4–10 of this plan at revision RWR-r1, as amended by the owner's answers to OD-1–OD-16, recorded in an approval record added to this file before implementation starts.

**Prerequisites:**
- **Owner approval of the plan.**
- **A clean merged base.**
- **For A1:** R0 done; OD-1, 3, 4, 5, 6, 11 and 14 answered.
- **For B1 and C2:** PR #204 merged.
- **For C1:** OD-2 answered.

**Object manifest (provisional names; migration numbers are claimed at merge):**
- **Migrations:** `NNN_crm_one_next_action.sql`, `NNN_crm_one_next_action_enforce.sql`, `NNN_people_identity.sql`, `NNN_catalogues.sql`, `NNN_desk_payments.sql`, `NNN_desk_academics.sql` (C1 and C2 may share one).
- **SQL functions and tables:** as listed in §§4–6.
- **Modules:** as in §8.
- **ADR:** [ADR-019](../decisions/ADR-019-one-next-action-per-prospect.md).

**Rules for implementers:**
- Build every rewritten function from its **latest** live definition (§4.2 lists them). Never rebuild from 078 or 080.
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
- R0 reveals counts or shapes this plan doesn't handle (for example, actions on merged leads).
- D1 or another dry run differs from the approved counts.
- A finance regression suite fails.
- OD-2 = B or OD-9 = B: return to architecture for that part.

**Status reporting:** the AGENTS.md implementation handoff for each PR (branch, exact head SHA, tier, tests and evidence, self-check, documentation, blockers), stopping at READY FOR INDEPENDENT REVIEW. Release steps each follow the rollout template with separate approvals.
