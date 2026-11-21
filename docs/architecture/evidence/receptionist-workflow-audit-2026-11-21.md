# Receptionist workflow audit — 2026-11-21

Evidence for the [receptionist workflow plan](../plans/receptionist-workflow.md) (revision RWR-r1). Architecture task, read-only.

- **Baseline:** `origin/main` at `53c486b` (PR #202 merged), migration ceiling `130_online_session_evidence.sql`.
- **Open work that overlaps:** PR #203 (plan RPW-r2, approved 2026-11-21) and PR #204 (branch `feat/receptionist-permissions`, migrations 131–135, not merged; merge waits for the online-classes Production test of the week of 23/11).
- **Evidence limits:**
  - Code and cumulative migrations only. Each SQL citation is the latest definition of that function (highest-numbered migration).
  - **No Production read was made.** Repository practice ([OWNER_DECISIONS](../../ai/OWNER_DECISIONS.md)) treats every Production read as needing the owner's explicit approval, so the read-only queries in [section 7](#7-read-only-production-queries) are written for the owner to approve and run (step R0 of the plan). Counts quoted from the owner's brief of 21/11 (127 overdue tasks, 20 prospects with 2+ open actions, 9 with exact duplicates, 181 student phones of which 83 standard) are **owner-supplied, not independently verified**.
  - No browser was driven. UI facts come from the component source.
  - Real people named in the owner's brief are not named in this repository. The queries take a lead or student id as a parameter.

Status legend: **C** confirmed in code · **P** partly confirmed (the mechanism exists, but the symptom also depends on data or on browser behaviour we didn't observe) · **N** not reproduced in code.

## Contents

1. [Root cause: several open next actions per prospect](#1-root-cause-several-open-next-actions-per-prospect)
2. [Findings P0–P2, verified](#2-findings-p0p2-verified)
3. [New findings (section 4 hunt)](#3-new-findings-section-4-hunt)
4. [Entry-point matrix](#4-entry-point-matrix)
5. [Prospect state machine (current)](#5-prospect-state-machine-current)
6. [Replaying the reported states](#6-replaying-the-reported-states)
7. [Read-only Production queries](#7-read-only-production-queries)

## 1. Root cause: several open next actions per prospect

**Status: C.** The data model allows any number of open tasks per lead.

`crm_tasks` (`078_crm_core_schema.sql:193`) has no uniqueness on open rows; its index is `crm_tasks_open_lead_idx (lead_id,due_at,id) where status='open'` (`078:378`). Each command adds or closes tasks independently:

| User action (UI label) | Server path (latest definition) | Closes | Creates |
| --- | --- | --- | --- |
| « Planifier », « Prévoir un autre appel » | `crm_schedule_task` → `crm_security.command('schedule_task')` with no `task_id` (`125_audit_follow_ups.sql:892`) | nothing | one task |
| « Replanifier » | same command with `task_id` (`125:893-907`) | — (updates `due_at`) | — |
| « Terminer l'action » / « Marquer comme fait » | `complete_task` (`125:909-915`) + forced `next_task` from the UI (`CrmActionDialog.jsx:101`) | the selected task | one task |
| « Annuler l'action » | `cancel_task` (same) | the selected task | one task |
| « Qualifier / avancer » | `qualify_lead` (`125:917-932`, `:980-984`) | cadence call slots only, and only when a conversation is recorded (`cancel_tasks(…,true)`, `125:977`) | one task |
| « Conversation au centre / autre canal », call result « Conversation avec le parent » | `crm_record_conversation_decision` (`119_conflicts_without_retry.sql:1203`) | open `callback` / `whatsapp_followup` tasks and the selected call task (`119:1265-1268`) | one task |
| Call « Pas de réponse », « Occupé »… | `record_call_outcome` (`125:835-871`) | the current slot and the other cadence slots | the next cadence slot (until 5) |
| « Mauvais numéro » | `record_call_outcome` (`125:872-876`) + forced `next_task` | the selected call task | one task |
| « Rouvrir » | `reopen_lead` (`125:944-951`) | — (the lead had none) | one task |
| « Réserver un test » | `crm_book_placement_test` (`119:708-747`) | open `confirm_placement_test` tasks only | a `placement_tests` row; **no task, and the lead version is not bumped** |
| Visit | a `center_visit` task created by any of the above | — | — |
| Meta / website intake, new lead | `crm_security.accept_external_submission` (`125:1217-1265`) | — | `first_contact` |
| Manual lead | `create_manual_lead` (`125:767-799`) | — | `first_contact` |
| Conversion | `crm_security.evaluate_conversion` (`120:1319`) | every open task | — |
| Close LOST / NOT_QUALIFIED | `close_lost` / `close_not_qualified` (`125:934-942`) | every open task | — (**planned tests stay `Planifié`**) |

The only server rule is "an active lead needs **at least one** open task" (`needs_next`, `125:985`). The RCC-A1 rule "one generic follow-up" covers only conversation decisions ([PRODUCT_RULES](../../ai/PRODUCT_RULES.md#commercial-lifecycle-and-follow-up)). Consolidating it across every path was deferred as **D6** ([OWNER_DECISIONS](../../ai/OWNER_DECISIONS.md#deferred-backlog-after-rcc-r1)). This audit is that deferred work.

**The views disagree on what the next action is** (finding 9 and invariant 9):

| View | Source | Rule |
| --- | --- | --- |
| Card, list table | `crm_get_opportunities` → `crm_security.opportunity_card` (`125:1013-1035`) | earliest open task, `order by due_at,id limit 1`; `next_placement` is `limit 1` with no `order by` (`125:1034`) |
| Drawer | `crm_get_workspace_detail` → `crm_security.operational_card` (`111:516-531`) | earliest open task (a second copy of the rule) |
| Drawer « Toutes les prochaines actions (N) » | `crm_list_open_tasks` (`111:495`) | every open task, collapsed (`LeadDetailSheet.jsx:110`) |
| « Tâches » | `crm_get_work_queue` (`111:555-618`) | **one row per open task**, so a lead with 3 tasks appears 3 times |
| « Aujourd'hui » | `crm_get_today` (`125:569-616`) | earliest task for attention; **every task** for the schedule and the counts |
| Calendar | `crm_get_admissions_calendar` (`125:618-692`) | every open `center_visit` task **plus** every placement test; the test branch has **no lead-status filter**, so closed prospects' tests stay |
| Result pop-up after saving | `CrmActionDialog.jsx:80-81` | re-reads `crm_list_open_tasks` with `p_limit: 1`, so it shows the earliest task, not the one just created |

**Exact duplicates (same type, same time) come from the reminder presets.** `crm_security.reminder_due` (`125:1039-1057`) turns « demain », « dans 2 jours », « la semaine prochaine » into midnight of the target day, then `next_window` moves it to the first calling-window opening. Two paths that each add a reminder for the same day therefore produce two tasks at the same window-opening minute (for example 10:00). The pair cited by the owner (two reminders on 01/12 at 10:00) matches this exactly. Query [Q06](#q06--exact-duplicate-open-actions) tests it.

## 2. Findings P0–P2, verified

### P0

| # | Finding | Status | Where | Root cause (section of the plan's map) |
| --- | --- | --- | --- | --- |
| 1a | « Mes tâches » shows 0 | **C** | Default filter assignee `me` (`WorkQueue.jsx:23`; reset `CrmWorkspace.jsx:75`). Manual creation sends no `owner_id` (`CrmActionDialog.jsx:111-121`). Intake leaves `owner_id` NULL (`125:1240-1243`). A new task's assignee is the lead's owner (`111:68`). The work queue never falls back to the lead owner (`111:572-574`). | RC-4 |
| 1b | Assigning a prospect's owner doesn't move its tasks | **C** | `reassign` with `owner_id` only updates `crm_leads.owner_id` (`125:953-957`); a task needs a separate `assigned_to` call (`:959-963`). | RC-4 |
| 1c | Default view doesn't show the real workload | **C** | as 1a | RC-4 |
| 2 | Same person several times in tasks and calendar | **C** | Work queue and calendar are one row per task (section 1). | RC-1, RC-2 |
| 3 | Prospects can't be edited | **C** | No `update public.crm_contacts` in any migration. `crm_leads` name, programme and source are written only at creation. | RC-5 |
| 4a | Phones not validated or normalised; « abc » accepted | **C** | CRM: `normalize_phone` returns NULL instead of refusing, and the raw text is kept (`080:7-18`, `125:776-785`). Students, receipts, authorized adults: free `text`, no check (`001:101,124,141`; `StudentForm.jsx:42`; `save_receptionist_student` `120:1019`; `create_charge_payment_financial` `125:1295`). Enrolment copies an invalid `phone_raw` into `students.telephone` (`127:469-470`). | RC-5 |
| 4b | Search needs the exact stored string outside the CRM | **C** | Students list: `search_students_page` (`124:1086-1087`) matches name and email only, despite the placeholder « Nom ou téléphone » (`students/page.jsx:356`). Annuaire: raw substring (`students-directory/page.jsx:78`). Nouveau reçu: raw `ilike` (`ReceiptForm.jsx:98-105`). CRM: normalised (`125:1080-1082`), but a partial local number such as « 0612 » does not match `+212612…`. | RC-5 |
| 4c | Backfill needed (181 student numbers) | **P** | The mechanism is confirmed (no normalisation). The normaliser also misses `212…` without « + » (`080:13-16`). Counts are owner-supplied; [Q11](#q11--phone-quality-students-contacts) re-counts them. | RC-5 |
| 5a | CRM duplicate warning comes after creation; no merge | **C** | `125:778-782` (« No automatic reuse »), message at `CrmActionDialog.jsx:287`. `merged_into_lead_id` / `merged_into_contact_id` exist (`078:58,148`) but nothing writes them. | RC-5 |
| 5b | Exact student duplicate created with no warning | **C** | StudentForm, ReceptionistStudentForm and CSV import have no detection. `studentCreate.mjs` only dedupes the same request. The help guide says so (`GuideContent.jsx:279`). The receipt form has a name/phone hint only (`ReceiptForm.jsx:166-209`), and its phone check ignores `deleted_at`. | RC-5 |
| 5c | The CRM doesn't know who is already a student | **P** | Students are found only at enrolment (`crm_security.student_candidates`, `084:33-41`), never at prospect creation or in CRM search. | RC-5 |
| 5d | No search covering prospects and students; no merge tool | **C** | No global search (`components/ui/command.jsx` is used only on the group page). No merge function. | RC-5 |
| 6 | « Mauvais numéro » schedules another call to the same number | **C** | `needsTask` forces a next task for `wrong_number` (`CrmActionDialog.jsx:101`). No way to correct a contact's phone exists anywhere. | RC-3, RC-5 |
| 7a | `window.confirm` for a possible duplicate receipt | **C** | `ReceiptForm.jsx:279-288`, text in `receiptDraftKey.mjs:63-67`. | RC-7 |
| 7b | Equal instalments flagged | **P** | The rule is learner + amount + date, ignoring the charge (`ReceiptForm.jsx:283-285`). Two equal payments on the **same day** are flagged; equal instalments on different days are not. The CRM wizard has no check at all. | RC-7 |
| 7c | Submit buttons disabled while saving | **P** | Disabled in ReceiptForm (`:365`), CrmEnrollmentDialog (`:233`), StudentForm (`:382`), EnrollmentModal (`:220`), PlacementTestModal (`:195`) and CrmActionDialog (`:322`). Not covered: CrmIntakeReview (no ref lock, and a new UUID per click, `CrmIntakeReview.jsx:14-26,40`), the receipt void page (new UUID per click, `receipts/[id]/edit/page.jsx:38`), the inline student « Catégorie » select, and attendance save. The page freeze came from `window.confirm` blocking during a double click. | RC-7 |
| 8 | The two payment screens follow different rules | **C** | Wizard refuses zero payment (`CrmEnrollmentDialog.jsx:42`; server `127:635,666,670`). « Encaisser » records a charge only, with `enrollment_id` NULL, as « Enregistrer l'engagement » (`ReceiptForm.jsx:362-365`; `125:1480-1482`; `127:144-158`). **Worse:** the wizard reads only enrollment-linked charges (`CrmEnrollmentDialog.jsx:74`) and its server guard checks only the same enrollment (`127:640-646`), so a commitment made on « Encaisser » is invisible and a second charge can be created. | RC-7 |
| 9 | « Encaisser » defaults to « Créer une nouvelle session » | **C** | `charge_id: ''` default (`ReceiptForm.jsx:37`); the first option is « Créer une nouvelle session » (`:335`); an open balance is pre-selected only from a `charge_id` URL parameter (`receiptInitialCharge.mjs:40-45`). | RC-7 |

### P1

| # | Finding | Status | Where | RC |
| --- | --- | --- | --- | --- |
| 10 | Four dialogs log the same exchange | **C** | « Appel », « Enregistrer un appel » and « Résultat d'appel » open the same `call` dialog (`LeadDetailSheet.jsx:107-110`, `WorkQueue.jsx:58`). « Conversation au centre / autre canal » goes to `crm_record_conversation_decision`. « Qualifier / avancer » goes to `crm_qualify_lead`. The card's « Avancer » maps to one of these (`presentation.mjs:246-253`). The walk-in path sits under « Autres actions ». | RC-3 |
| 11 | « Action enregistrée… Terminé » and « Continuer avec le nouveau prospect » pop-ups | **C** | `CrmActionDialog.jsx:286,289`; `CrmWorkspace.jsx:131-134`. A toast « Enregistré » is also shown (`:258`). | RC-3 |
| 12a | No « C'est la même personne » | **C** | Manual creation requires both `display_name` and `learner_name` (`125:770-773`). | RC-5 |
| 12b | Walk-in and inbound call schedule « Premier contact » | **C** | `create_manual_lead` always creates `first_contact` (`125:798`). The source « Visite au centre » is only a label (`CrmActionDialog.jsx:119,292-296`). | RC-1, RC-3 |
| 12c | No « Ajouter un enfant » | **C** | `contact_id` is not accepted by manual creation (`125:722`). Only intake review can reuse a contact (`CrmIntakeReview.jsx:23,36`). | RC-5 |
| 13 | Programme is free text, three vocabularies | **C** | `crm_leads.program_interest_text` free text (`078:130`); manual creation sends only that field (`CrmActionDialog.jsx:118`). `crm_leads.session_type` has 8 values and lacks Online (`078:129`). Groups, students, enrollments, charges and receipts use 10 English codes (`117:26-42`); `programCatalog.mjs:21-31`. `programmeLabel` translates only Yearly (`ui/presentation.mjs:9`). The lead programme is not updated on enrolment (`127:522`). | RC-6 |
| 14 | Two origin lists; origin not carried to the student | **C** | CRM `source_label` free text (`078:92`; « Manuel · … » at `CrmActionDialog.jsx:119`). Students and receipts have a 5-value `referral_source` (`039:10-21`). `crm_start_enrollment` does not set `referral_source` (`127:469-472`). The « Source » filter lists raw `source_label` strings (`107:156-178`). No « recommandé par » field. | RC-6 |
| 15a | Note saved twice when qualifying | **C** | `qualify_lead` with `conversation_channel` writes the note on `conversation_recorded` (`125:921`) **and** on `lead_qualified` (`125:981`); through the decision path it can also land on `task_completed` (`119:1283`). | RC-8 |
| 15b | 3–4 noise lines per action; « Prochaine action planifiée » without what or when; « Précisions » not recorded | **C** | One action writes up to seven activities (cancellations, completion, conversation, engaged, attempt cancellations, qualified, `task_created`). `task_created` has no body (`111:70`). « Précisions » are stored in `crm_tasks.instructions` (`CrmActionDialog.jsx:321`) and shown only in the collapsed task list, never in history. | RC-8 |
| 15c | Everything reads « Équipe accueil » | **P** | `crm_get_timeline` falls back to « Équipe accueil » when `profiles.full_name` is NULL (`107:149`). The sign-up default is `''` (`002:64`), which renders empty, and the client also masks names matching `/synthe|receptionist|director|admin|system|service_role/` (`LeadDetailSheet.jsx:28`). The account itself has no name. That is data: [Q27](#q27--staff-accounts-without-a-name). | RC-8 |
| 16a | Admissions « Planifier un test » lists only students | **C** | `placement-tests/page.jsx:46` loads `entities.Student.listAll`; free names are allowed (`PlacementTestModal.jsx:155-162`) and written straight to the table (`:104-108`). | RC-2 |
| 16b | « Niveau recommandé = A1 » before the test | **C** | `PlacementTestModal.jsx:57` for non-CRM tests. | RC-2 |
| 16c | No cancel, « Absent » or « Annulé » | **C** | Statuses `Planifié, Passé, Résultat saisi, Affecté` (`001:286-288`); the UI says cancellation is not supported (`AdmissionsCalendar.jsx:51`, `LeadPlacementSection.jsx:13`). | RC-2 |
| 16d | Result and « Passé » before the test date | **C** | No date check in the client (`PlacementTestModal.jsx:164-170`) or in SQL (`crm_security.placement_integrity` checks the date only while `Planifié`, `125:1144-1146`; non-CRM rows skip it, `125:1136`). The milestone trigger then creates the post-test task (`083:87-99`). | RC-2 |
| 16e | 37 mixed level options | **C** | `ALL_LEVELS`, 36 values (`programCatalog.mjs:4-16,65-69`), when no learner is selected or for any CRM test. | RC-6 |
| 16f | Level not pre-filled in the wizard | **P** | It **is** pre-filled when `recommended_level` belongs to the lead's programme (`CrmEnrollmentDialog.jsx:58`; `112:170-171`). With a free-text programme the default is Yearly, so an Adults result or « A1 » doesn't match and the field stays empty. Changing the programme clears it (`:198`). | RC-6 |
| 17a | No single source of hours shown in forms | **C** | Only `crm_followup_policies.weekly_hours` (`078:65-80`), published through `create_followup_policy`. No migration seeds a policy (`scripts/test-crm-phase2.sql:44`) and no screen shows the hours (`GuideContent.jsx:537`). | RC-9 |
| 17b | Visits and tests accept Sunday 22:00–23:30 | **C** | `new_task` fits only call types to the windows (`111:59-66`); a visit only needs a future time (`111:57`). Tests only need a future time (`125:1144-1146`). | RC-9 |
| 17c | Callback at 11:00 refused while reminders land at 10:00 | **P** | Agreed callbacks are refused (never moved) outside the windows (`111:61-63`, `125:898-901`). Reminder presets land on a window opening (section 1). Whether 11:00 is outside a window depends on the live policy: [Q01](#q01--live-follow-up-policies). | RC-9 |
| 18a | 3-hour rule not shown before the form | **C** | Server check `125:845-846`; message mapped at `presentation.mjs:213`; no pre-check. | RC-10 |
| 18b | A real attempt can't be logged anyway | **C** | The server refuses failed calls within the gap; there is no override flag. | RC-10 |
| 18c | The error stays after the selection changes | **C** | `set()` doesn't clear it (`CrmActionDialog.jsx:86-89`); cleared only on the next submit (`:220`). | RC-10 |
| 19a | Close reasons split across lists; no « Mauvais numéro » | **C** | `078:150-155`; `presentation.mjs:113-130`. | RC-6 |
| 19b | « Pas intéressé » doesn't ask why | **C** | The conversation « lost » decision is fixed to `not_interested` (`119:1251-1252`). | RC-6 |
| 20a | Step 1 takes two clicks | **C** | « Créer un nouvel apprenant » (`CrmEnrollmentDialog.jsx:194`) + « Continuer » (`:233`), plus the « J'ai vérifié les correspondances » box when matches exist (`:195`). | RC-7 |
| 20b | Adult lead defaults to « Programme annuel » | **C** | Default `context.session_type` else `'Yearly'` (`:48`); manual leads have no `session_type`. | RC-6 |
| 20c | One validation error at a time | **C** | `paymentIssue` returns the first problem (`:34-45`); a single `failure` (`:63,232`). | RC-7 |
| 20d | No warning when the discount exceeds the price | **P** | The server refuses it in English (« Invalid price or discount. », `125:1442`) and a constraint guards the data (`055:38`); the form gives no early warning and inputs have no `max`. | RC-7 |
| 21a | Birth date 2030 accepted | **C** | `StudentForm.jsx:41` checks the format only; no SQL check outside CRM paths (`127:464`, `125:768`). | RC-11 |
| 21b | « Adults (18+) » + « Child 1 » accepted | **C** | No category vs level validation (`StudentForm.jsx:340-344`). | RC-11 |
| 21c | Student status « Prospect » collides with CRM prospects | **C** | `001:107-109`; label map `ui/presentation.mjs:3`. | RC-11 |
| 21d | Inline « Catégorie » saves silently | **C** | `students/page.jsx:443-449`, `patchStudentFields` `:165-180`; errors swallowed for non-receptionists (`:175`). | RC-11 |
| 21e | « Annuaire » and « Liste des apprenants » both exist | **C** | `Sidebar.jsx:36-37`. | RC-11 |
| 21f | « Adultes autorisés au retrait » shown for adults | **C** | `students/[id]/page.jsx:334-349`, no condition. | RC-11 |
| 21g | No adult groups; no teacher or room on groups | **N / data** | Adult groups **can** be created (`117:216-226`; `groups/page.jsx:71`), and `teacher_id` and `salle` exist and are editable (`save_receptionist_group`, `128:747`). Groups without a teacher are a data fact (the 2026-10-14 import created 8 groups without teachers): [Q22](#q22--groups-without-a-teacher). | — |
| 21h | « Enrolled » untranslated | **C** | `parent-portal/page.jsx:279`; import page `:37,272,349`; the help guide documents English statuses (`GuideContent.jsx:728`). | RC-11 |
| 22a | Attendance on any day, future accepted | **C** | `max={today}` is an HTML attribute only (`attendance/page.jsx:145`); `save_attendance` (`063:59-87`) and its trigger (`121:129-174`) check neither the group's days nor the date. `groups.jours` is free text. | RC-11 |
| 22b | No default to today's classes | **C** | No group preselected (`attendance/page.jsx:36`). | RC-11 |
| 22c | Default « Présent » and counter 0/0 | **C** | Rows show `'Présent'` when untouched (`:214`) and are saved as Présent (`attendanceSession.mjs:64`); the counter counts saved rows only (`:208-209`). | RC-11 |
| 23a | Void/correction flow for the direction | **N** | Exists, director only: `void_financial_receipt` (`122:195`), `void_financial_charge` (`055:465`), `delete_mistaken_receipt` (`122:255`), screens on the print page (`receipts/[id]/print/page.jsx:70-72`). Admin is excluded; that is an owner decision (OD-7). | — |
| 23b | No outstanding-balance filter on receipts | **C** | `receipts/page.jsx:43` searches only; the filter exists on the students list (`payment=due`). | RC-11 |
| 23c | English labels | **C** | Raw codes in the list, the PDF and the dropdowns (`receiptPresentation.js:26-31`, `receiptPdf.js:121`, `ReceiptForm.jsx:335,342`, `finance/page.jsx:190`); English branding (`receiptPdf.js:100-102,149`); English server errors (`125:1442,1471`). | RC-6 |
| 23d | Session and service repeated | **C** | `service_description` is built as `session · year` (`125:1443-1446`) and shown under `receiptServiceSummary` (`receipts/page.jsx:81`; PDF `receiptPdf.js:121,124`; print page `:97`). | RC-6 |
| 24a | Receptionist can create online groups | **C** | « Nouveau groupe en ligne » is shown to everyone (`online/page.jsx:140`), and `save_receptionist_group` accepts session « Online » (`117:216-226`). Course setup itself is management-only (`117:929`). **Conflicts with RPW-r2** (approved 2026-11-21), which keeps the receptionist's online access « exactly as today »: owner decision OD-9. | RC-12 |
| 24b | Receptionist sees « Enseignants » | **C (by design)** | `canManageTeacherOperations` (`roleAccess.mjs:17,56`). RPW-r2 **extends** this (« add a teacher »). Hiding it reverses an approved plan: OD-9. | RC-12 |
| 24c | Receptionist can create groups | **C (by design)** | `save_receptionist_group` (`128:747`); RPW-r2 stage 3 adds « group at creation » for the receptionist. OD-9. | RC-12 |
| 25a | Escape or click outside discards a filled form | **C** | Dialogs block Escape only while saving (`CrmActionDialog.jsx:279-285`, `CrmEnrollmentDialog.jsx:239`, `PlacementTestModal.jsx:144-145`); no dirty-form guard anywhere. | RC-10 |
| 25b | Browser validation messages in English | **P** | Native `required` / `type` validation (`CrmActionDialog.jsx:108-109,321`) uses the browser's language; StudentForm uses `noValidate` and is not affected. | RC-10 |
| 25c | « 1 appels infructueux » | **C** | `OpportunityCard.jsx:31`, `OpportunitiesList.jsx:10`, `LeadDetailSheet.jsx:109`, `CrmActionDialog.jsx:286,315`, `GuideContent.jsx:439`. | RC-10 |
| 25d | Four ways to clear one search | **C** | The field's clear button (`OpportunityFilters.jsx:48`), the « Recherche : … » chip (`:56`), the bar's reset (`:73`) and « Effacer les filtres » in the sheet (`:85`). | RC-10 |
| 25e | Cards repeat the programme and show « Apprenant à préciser » | **P** | The card shows `program` from `coalesce(session_type, program_interest_text)` (`125:1020`) alongside learner fallbacks; manual leads always have a learner name, so « à préciser » comes from optional-learner website/Meta leads. | RC-6 |
| 25f | « Source » filter shows technical strings | **C** | `107:156-178`; `OpportunityFilters.jsx:16,25`. | RC-6 |
| 25g | Mobile layout not tested | **N (not testable here)** | RCC-B1 covered the opportunities board responsively; the new dialogs need mobile acceptance (plan PR C2, `test-mobile-reception-browser.mjs`). | — |

### P2 data clean-up

| Item | Status | Where | Plan step |
| --- | --- | --- | --- |
| Merge duplicate open actions | **C** | Section 1 | D1 |
| Normalise phones | **C** | 4a | D3 |
| Map free-text programmes | **C** | 13 | D4 |
| Merge duplicate students | **P** | No merge tool (5d); the example pair is a data fact for [Q28](#q28--student-duplicates) | D5 |
| Remove test data | **P** | Data. Financial rows can't be deleted (constraint 0 of the brief; receipts are gap-free and immutable, [ADR-012](../decisions/ADR-012-gap-free-receipt-numbering.md)), so test records holding receipts are **archived and excluded**, never deleted. The three voided receipts stay. [Q24](#q24--test-data-inventory) | D6 |

## 3. New findings (section 4 hunt)

Each one is a new audit item (`NF-n`), linked to the root-cause map in the plan.

| # | Finding | Evidence | RC |
| --- | --- | --- | --- |
| NF-1 | **A stale tab succeeds on the second click.** On `PT409` the dialog shows « Ce prospect a changé… », then adopts the new versions and keeps the form, so the next click submits the old intent over the other tab's change. That is the « silently overwrote » report: optimistic locking exists (`expected_version`, `125:804`) but the client defeats it. | `CrmActionDialog.jsx:261-270` | RC-10 |
| NF-2 | **Test booking and test edits don't bump the lead version.** Other tabs therefore aren't refused after a test is booked or changed. Test edits lock on `placement_tests.updated_at` only. | `119:708-747`, `119:1626-1655` | RC-10 |
| NF-3 | **A closed prospect keeps its planned test in the calendar and « Aujourd'hui ».** Closing cancels tasks but not tests, and the calendar's placement branch has no lead-status filter. Reopening then hits « Placement already scheduled » when booking again. | `125:942`, `125:661-667`, `119:722` | RC-1 |
| NF-4 | **Commitment on « Encaisser » + wizard = two charges for one seat.** | finding 8 | RC-7 |
| NF-5 | **The pop-up shows the wrong action** (earliest, not the one just created), so a receptionist who « reschedules » sees the old date and believes the change was ignored. | `CrmActionDialog.jsx:80-81` | RC-2 |
| NF-6 | **`next_placement` on the card has no `order by`.** Only one `Planifié` test can exist per lead today (`083:5`), so it is latent; it becomes a bug if that rule changes. | `125:1034` | RC-2 |
| NF-7 | **Intake review uses a new UUID per click.** A double click sends two different requests; the second is refused by state (`needs_review`), so the harm is an error message, not a duplicate. | `CrmIntakeReview.jsx:20-23,40` | RC-10 |
| NF-8 | **A wrong-number prospect can never be fixed.** No function updates a contact's phone, so the only way forward is a new prospect (a new duplicate). | finding 6 | RC-5 |
| NF-9 | **Placeholder phones are « valid ».** `0600000000` normalises to `+212600000000` and matches every student with the placeholder: false enrolment candidates, false shared-phone warnings, false CRM matches. | `080:7-18`, `084:39` | RC-5 |
| NF-10 | **`212…` without « + » is not normalised** (returns NULL), so those 34 numbers can't match a CRM contact. | `080:13-16` | RC-5 |
| NF-11 | **Completing an appointment before it happens is allowed.** `complete_task` has no time check, so a visit can be « done » the day before (invariant 5). | `125:909-915` | RC-2 |
| NF-12 | **Cancelling a test is impossible, so receptionists re-type the prospect** as an unlinked Admissions test, which creates unlinked duplicates (16a) and leaves two tests in the calendar. | 16a, 16c | RC-2 |
| NF-13 | **The 3-hour gap is enforced against `last_attempt_at`, which a meaningful conversation resets to NULL.** After a conversation, a no-answer call can be logged at any time; before it, even a real attempt is refused. That asymmetry looks random to the user. | `125:845-846`, `125:972` | RC-10 |
| NF-14 | **The work queue polls every 60 s** while the drawer reads on demand, so after one tab's change the queue can show a row that the drawer no longer has, for up to a minute (cross-view consistency). | `queries.js:28` | RC-2 |
| NF-15 | **Two CRM « programme » filters** (`session` vs `interest`) split one programme into several filter entries (`125:1084-1086`), which is how « Adult », « adult » and « annuel » appear separately. | `125:1084-1086` | RC-6 |
| NF-16 | **Receptionist-created online groups bypass course setup.** `save_receptionist_group` accepts `Online` while `online_save_course` is management-only. | 24a | RC-12 |
| NF-17 | **Inline student « Catégorie » errors are swallowed** for admin and director (`students/page.jsx:175`), so a refused change looks saved until reload. | 21d | RC-11 |

## 4. Entry-point matrix

Every place that creates (C) or changes (U) each entity. **Bold** rows are entities changed from more than one place with different rules: that is where duplicates and inconsistencies come from.

| Entity | Entry point (screen · button → server) | C/U | Rules applied |
| --- | --- | --- | --- |
| **Prospect (`crm_leads` + `crm_contacts`)** | « Ajouter un prospect » → `crm_create_manual_lead` | C | contact + learner + source required; phone not refused; candidates returned **after** insert; no owner |
| | Meta Instant Form → `crm_accept_meta_events` → worker → `crm_finalize_meta_job` → `resolve_external_submission` / `accept_external_submission` | C/U | corroborated reuse (phone/email + same name), else review |
| | Website `/api/public/…` → `crm_accept_website_inquiry` → `crm_finalize_website_job` | C/U | same as Meta; a valid phone **or** email required |
| | Tâches « Intake review » → `crm_resolve_external_intake` / `crm_resolve_meta_intake` | C/U | attach / new / new for contact |
| | Every command (`crm_security.command`) | U | status, owner, outreach fields; `expected_version` checked |
| | Conversion (`evaluate_conversion` via payment) | U | status CONVERTED, closes tasks |
| | « Inscrire et encaisser » (`crm_start_enrollment`) | U | sets `student_id`, `enrollment_id`; **not** `session_type` |
| **Next action (`crm_tasks`)** | manual create · intake · schedule · reschedule · complete · cancel · qualify · conversation decision · call outcome · wrong number · reopen · reassign · test booking (closes confirm tasks) · conversion (closes all) · close (closes all) | C/U | **14 paths, 4 different closing rules** (section 1); hours applied to call types only |
| **Placement test (`placement_tests`)** | CRM « Réserver un test » → `crm_book_placement_test` | C | QUALIFIED lead; future; one `Planifié` per lead; lead version not bumped |
| | CRM « Voir / Reprogrammer » → `crm_update_placement_test` | U | `updated_at` lock; result allowed any time |
| | Admissions « Planifier un test » → `entities.PlacementTest.create` (table write under RLS) | C | **no rules**: students only or a free name; A1 pre-filled; any status, any date |
| | Calendar legacy editor → `entities.PlacementTest.update` | U | **no version** |
| | Placement page delete (admin/director) | D | non-CRM only |
| **Visit** | any task path with `task_type='center_visit'` | C/U | future only, no hours, completable before its time |
| **Student (`students`)** | StudentForm (admin/director) → table insert/update | C/U | **no phone, birth-date or duplicate rule** |
| | ReceptionistStudentForm → `save_receptionist_student` (RPW-r2 retires this form) | C/U | same |
| | CSV import → `createStudentOnce` | C | same |
| | Nouveau reçu « Nouvel apprenant » → `create_charge_payment_financial` | C/U | name hint + raw phone hint |
| | CRM enrolment → `crm_start_enrollment` | C | candidate review token required; phone copied raw; no source |
| | Students list inline « Catégorie » → `patchStudentFields` | U | silent |
| **Enrollment** | « Inscrire et encaisser » (CRM) → `crm_enroll_and_collect` | C | payment > 0 or 100 % discount |
| | « Inscrire et encaisser » (learner file / receipt) → `create_charge_payment` | C | same, through the payment |
| | « Modifier l'inscription » → `save_receptionist_enrollment` / admin dialog | U | level, date, notes |
| | Group placement (4 paths, ADR-010) | U | paid enrollment required |
| **Charge / receipt** | Encaisser → `create_charge_payment` | C | **zero payment allowed (charge only)** |
| | CRM wizard → `crm_enroll_and_collect` | C | **zero payment refused** |
| | Director corrections → `void_financial_*`, `delete_mistaken_receipt` | U | director only |
| **Attendance** | Attendance page → `save_attendance` | C/U | membership checked; **no day or date rule** |
| | Online lesson attendance → `online_save_attendance` | C/U | lesson-based |
| **Group** | Admin/director → table under RLS · reception → `save_receptionist_group` · online → `online_save_course` | C/U | **receptionist can create `Online` groups outside course setup** |

## 5. Prospect state machine (current)

States are `crm_leads.status`. « Open actions » means `crm_tasks` rows with `status='open'`; « tests » means `placement_tests` with `status='Planifié'`.

| From | Transition (code path) | To | Effect on open actions | Effect on tests |
| --- | --- | --- | --- | --- |
| — | manual create / intake (`125:767`, `125:1217`) | NEW | **+1** `first_contact` | — |
| NEW | failed call (`125:835-871`) | CONTACTING | −current slot, −other slots, **+1** next slot (≤ 5) | — |
| NEW, CONTACTING | conversation (`125:964-979`) | ENGAGED | −call slots; **+1** `next_task` | — |
| ENGAGED, QUALIFIED | conversation | same | −call slots, −callback/WhatsApp (decision path only); **+1** | — |
| NEW, CONTACTING, ENGAGED | qualify (`125:917-932`) | QUALIFIED | −call slots only if a conversation is recorded; **+1** | — |
| any active | « Planifier » (`125:892`) | same | **+1, closes nothing** | — |
| any active | complete / cancel (`125:909-915`) | same | −1, **+1** | — |
| any active | wrong number (`125:872-876`) | same | −1 call task, **+1** | — |
| QUALIFIED | book test (`119:708`) | same | −`confirm_placement_test` only | **+1** |
| active | result entered (`083:87-99`) | same | **+1** `post_test_followup` | `Résultat saisi` (any date) |
| active | close LOST / NOT_QUALIFIED (`125:934-942`) | LOST / NOT_QUALIFIED | −all | **kept** |
| LOST / NOT_QUALIFIED | reopen (`125:944-951`) | CONTACTING / ENGAGED | **+1** | still planned |
| QUALIFIED (any active) | enrol and collect (`127:580`) → `evaluate_conversion` (`120:1319`) | CONVERTED | −all | kept (normally passed) |

Transitions that **create without closing**: « Planifier », qualify (without a recorded conversation), result entered, reopen. Transitions that **close without closing everything**: test booking, close (tests), wrong number (other tasks). These are the defects; the target machine is in the plan.

## 6. Replaying the reported states

Specified as regression tests in the plan (PR A1: named replay cases in `test-crm-next-action.sql`, plan §9). From the code paths, these sequences each produce a reported state.

| Reported state | Reconstructed click sequence | Mechanism |
| --- | --- | --- |
| Two identical reminders on the same day at 10:00 | Day 1: « Planifier » → « Rappel », preset « dans 2 jours ». Day 2: « Terminer l'action » on another task → forced « Prochaine action », preset « demain » | both presets resolve to the same window opening |
| « Toutes les prochaines actions (2) » after rescheduling | The receptionist opens « Planifier » instead of « Replanifier » (both on the drawer; « Planifier » is always shown) | `schedule_task` without `task_id` inserts |
| « Rescheduling seems ignored » | « Planifier » with a later date; the card still shows the earlier task; the pop-up also shows the earliest (NF-5) | earliest-task rule |
| Duplicate visits in the calendar | Qualify with step « Visite au centre » (+1 visit) then later « Planifier » → « Visite » | two `center_visit` tasks |
| Prospect overdue after « will come later » (the test case cited by the owner) | Test result entered → `post_test_followup` (+2 h); conversation « reviendra » → forced next task with a preset; nobody calls at that time | a date is forced when no date was agreed |
| Closed prospect still in the calendar | Book test → close « Pas intéressé » | tests not cancelled on close |
| Stale tab overwrote another tab's action | Tab A and tab B open on one prospect; A saves; B saves, gets « a changé », clicks again | NF-1 |

The exact histories of the 20 prospects need the event history: run [Q23](#q23--replay-one-prospects-history) for each id from [Q04](#q04--invariant-1-prospects-with-more-than-one-open-action) and compare it with the table above. Every history that doesn't match a row becomes a new regression case.

## 7. Read-only Production queries

**Not run.** Each query needs the owner's approval as step R0 of the plan, and none writes. Rules for running them:

- **Transport:** `supabase db query --linked --project-ref <ref> -f <file>`, as in [WORKFLOWS](../../ai/WORKFLOWS.md). It returns only the last statement's rows.
- **File layout:** one query per file, each starting with `set transaction read only;` and a `select current_setting('transaction_read_only')` proof.
- **Validate locally first:** the implementer runs every query against a clean local build at the same migration ceiling (task T-R0). This catches column mistakes without touching Production data.
- **Outputs:** samples return **ids only**, never names or phones, so the outputs can be pasted into a release record without personal data.

#### Q01 — live follow-up policies

```sql
set transaction read only;
select version, weekly_hours, date_exceptions, attempt_offsets, minimum_attempt_gap_minutes,
       first_contact_sla_minutes, post_test_sla_minutes, effective_from, retired_at
from public.crm_followup_policies order by version;
```

#### Q02 — open actions overview

```sql
set transaction read only;
select l.status, count(distinct l.id) leads, count(t.id) open_tasks,
       count(t.id) filter (where t.due_at < now()) overdue
from public.crm_leads l left join public.crm_tasks t on t.lead_id=l.id and t.status='open'
where l.merged_into_lead_id is null group by l.status order by l.status;
```

#### Q03 — overdue tasks by what created them

Separates agreed times from forced or system dates.

```sql
set transaction read only;
select t.task_type, coalesce(t.schedule_kind,'(none)') schedule_kind, t.source_kind,
       (t.due_at = crm_security.next_window(l.followup_policy_id, date_trunc('day', t.due_at))) at_window_opening,
       count(*) n
from public.crm_tasks t join public.crm_leads l on l.id=t.lead_id
where t.status='open' and t.due_at<now() and l.status in ('NEW','CONTACTING','ENGAGED','QUALIFIED')
group by 1,2,3,4 order by n desc;
```

`at_window_opening = true` with `schedule_kind` `reminder` or NULL is a preset or system date. `appointment` is an agreed time.

#### Q04 — invariant 1: prospects with more than one open action

```sql
set transaction read only;
with m as (select lead_id, count(*) n from public.crm_tasks where status='open' group by lead_id having count(*)>1)
select count(*) leads, sum(n) tasks, (select array_agg(lead_id) from (select lead_id from m order by n desc, lead_id limit 5) s) sample from m;
```

#### Q05 — invariant 1: distribution and active-lead check

```sql
set transaction read only;
select coalesce(n,0) open_actions, count(*) leads
from public.crm_leads l left join (select lead_id, count(*) n from public.crm_tasks where status='open' group by lead_id) t on t.lead_id=l.id
where l.status in ('NEW','CONTACTING','ENGAGED','QUALIFIED') and l.merged_into_lead_id is null
group by 1 order by 1;
```

`open_actions = 0` for an active lead is a gap of its own: the target says « exactly one ».

#### Q06 — exact duplicate open actions

```sql
set transaction read only;
with d as (select lead_id, task_type, due_at, count(*) n from public.crm_tasks where status='open' group by 1,2,3 having count(*)>1)
select count(distinct lead_id) leads, count(*) groups,
       count(*) filter (where (due_at at time zone public.centre_utc_offset())::time in (select distinct (w->>0)::time from public.crm_followup_policies p, jsonb_each(p.weekly_hours) d2, jsonb_array_elements(d2.value) w)) at_window_opening,
       (select array_agg(lead_id) from (select distinct lead_id from d order by lead_id limit 5) s) sample from d;
```

#### Q07 — invariant 2: closed prospects with open actions or planned tests

```sql
set transaction read only;
select l.status, count(distinct l.id) filter (where exists(select 1 from public.crm_tasks t where t.lead_id=l.id and t.status='open')) with_open_action,
       count(distinct l.id) filter (where exists(select 1 from public.placement_tests p where p.crm_lead_id=l.id and p.status='Planifié')) with_planned_test,
       (array_agg(l.id order by l.id) filter (where exists(select 1 from public.placement_tests p where p.crm_lead_id=l.id and p.status='Planifié')))[1:5] sample
from public.crm_leads l where l.status in ('LOST','NOT_QUALIFIED','CONVERTED') group by l.status;
```

#### Q08 — invariant 3: overlapping appointments or tests per person

A visit is taken as 60 minutes and a test as 45 minutes: assumptions to confirm (OD-4).

```sql
set transaction read only;
with ev as (
 select t.lead_id, l.student_id, t.id, t.due_at s, coalesce(t.scheduled_end_at, t.due_at+interval '60 min') e
 from public.crm_tasks t join public.crm_leads l on l.id=t.lead_id where t.status='open' and t.task_type='center_visit'
 union all
 select p.crm_lead_id, p.student_id, p.id, (p.date_test+p.heure::time) at time zone public.centre_utc_offset(),
        (p.date_test+p.heure::time) at time zone public.centre_utc_offset()+interval '45 min'
 from public.placement_tests p where p.status='Planifié' and p.heure ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
select count(*) overlapping_pairs, (array_agg(a.id))[1:5] sample
from ev a join ev b on a.id<b.id and ((a.lead_id is not null and a.lead_id=b.lead_id) or (a.student_id is not null and a.student_id=b.student_id))
 and a.s<b.e and b.s<a.e;
```

#### Q09 — invariant 4: open items outside hours

```sql
set transaction read only;
select t.task_type, count(*) n, (array_agg(t.id))[1:5] sample
from public.crm_tasks t join public.crm_leads l on l.id=t.lead_id
where t.status='open' and t.due_at>now() and crm_security.next_window(l.followup_policy_id,t.due_at)<>t.due_at
group by 1
union all
select 'placement_test', count(*), (array_agg(p.id))[1:5]
from public.placement_tests p join public.crm_leads l on l.id=p.crm_lead_id
where p.status='Planifié' and p.heure ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
 and crm_security.next_window(l.followup_policy_id,(p.date_test+p.heure::time) at time zone public.centre_utc_offset())
     <> (p.date_test+p.heure::time) at time zone public.centre_utc_offset();
```

This measures against **calling** windows, the only hours that exist today. Opening hours for visits and tests are a decision (OD-3).

#### Q10 — invariant 5: results, « Passé » or « done » in the future

```sql
set transaction read only;
select 'test_result_future' k, count(*) n, (array_agg(id))[1:5] s from public.placement_tests
 where status in ('Passé','Résultat saisi','Affecté') and date_test>public.business_date()
union all select 'task_done_before_due', count(*), (array_agg(id))[1:5] from public.crm_tasks
 where status='completed' and completed_at<due_at and task_type in ('center_visit','callback')
union all select 'attendance_future', count(*), (array_agg(id))[1:5] from public.attendance
 where session_date>public.business_date()
union all select 'test_planned_with_level', count(*), (array_agg(id))[1:5] from public.placement_tests
 where status='Planifié' and niveau_recommande is not null;
```

#### Q11 — phone quality (students, contacts)

```sql
set transaction read only;
select 'students' src,
 count(*) filter (where telephone is null or btrim(telephone)='') empty,
 count(*) filter (where telephone ~ '^\+212[5-7][0-9]{8}$') e164,
 count(*) filter (where regexp_replace(telephone,'[^0-9]','','g') ~ '^212[5-7][0-9]{8}$' and telephone !~ '^\+') no_plus,
 count(*) filter (where regexp_replace(telephone,'[^0-9]','','g') ~ '^[5-7][0-9]{8}$') no_leading_zero,
 count(*) filter (where regexp_replace(telephone,'[^0-9]','','g') ~ '^0[5-7]([0-9])\1{7}$|^0[5-7]0{8}$') placeholder,
 count(*) filter (where telephone is not null and btrim(telephone)<>'' and crm_security.normalize_phone(telephone) is null) unnormalisable
from public.students where deleted_at is null
union all
select 'crm_contacts', count(*) filter (where phone_raw is null), count(*) filter (where phone_e164 is not null),
 null, null, count(*) filter (where phone_e164 ~ '^\+212[5-7]0{8}$'), count(*) filter (where phone_raw is not null and phone_e164 is null)
from public.crm_contacts where merged_into_contact_id is null;
```

#### Q12 — invariant 7: shared normalised phone between active people

The digits key is the last 9 digits.

```sql
set transaction read only;
with p as (
 select 'lead' k, l.id, l.contact_id, right(regexp_replace(c.phone_e164,'[^0-9]','','g'),9) key
 from public.crm_leads l join public.crm_contacts c on c.id=l.contact_id
 where l.status in ('NEW','CONTACTING','ENGAGED','QUALIFIED') and l.merged_into_lead_id is null and c.phone_e164 is not null
 union all
 select 'student', s.id, null, right(regexp_replace(s.telephone,'[^0-9]','','g'),9)
 from public.students s where s.deleted_at is null and s.status in ('Enrolled','Prospect') and length(regexp_replace(coalesce(s.telephone,''),'[^0-9]','','g'))>=9)
select count(*) keys_shared, sum(n) people, (array_agg(key))[1:5] sample_keys
from (select key, count(*) n, count(distinct coalesce(contact_id::text, id::text)) d from p group by key having count(distinct coalesce(contact_id::text, id::text))>1) x;
```

The sample keys are 9-digit fragments: treat them as personal data and keep them out of committed records.

#### Q13 — invariant 8: the same note text twice within a minute

```sql
set transaction read only;
select count(*) pairs, (array_agg(a.lead_id))[1:5] sample
from public.crm_activities a join public.crm_activities b on a.lead_id=b.lead_id and a.id<b.id
 and a.body=b.body and length(btrim(a.body))>0 and abs(extract(epoch from b.occurred_at-a.occurred_at))<=60;
```

#### Q14 — invariant 10: unowned work

```sql
set transaction read only;
select count(*) filter (where t.assigned_to is null) unassigned_open_tasks,
       count(distinct l.id) filter (where l.owner_id is null) unowned_active_leads,
       count(*) open_tasks
from public.crm_tasks t join public.crm_leads l on l.id=t.lead_id
where t.status='open' and l.status in ('NEW','CONTACTING','ENGAGED','QUALIFIED');
```

#### Q15 — invariant 11: converted leads' programme vs enrollment

```sql
set transaction read only;
select count(*) filter (where l.session_type is null) no_session_type,
       count(*) filter (where l.session_type is distinct from e.session_type) mismatch,
       (array_agg(l.id) filter (where l.session_type is distinct from e.session_type))[1:5] sample
from public.crm_leads l join public.enrollments e on e.id=l.enrollment_id where l.status='CONVERTED';
```

#### Q16 — invariant 12: learners with an unlinked commitment and a linked charge for the same programme and year

```sql
set transaction read only;
select count(distinct a.student_id) learners, (array_agg(distinct a.student_id))[1:5] sample
from public.charge_balances a join public.charge_balances b on a.student_id=b.student_id and a.id<>b.id
 and a.session_type=b.session_type and a.school_year is not distinct from b.school_year
where a.voided_at is null and b.voided_at is null and a.enrollment_id is null and b.enrollment_id is not null and not a.legacy;
```

#### Q17 — invariant 13 and anomaly: same learner, same amount, same day

```sql
set transaction read only;
select count(*) groups, sum(n) receipts, (array_agg(student_id))[1:5] sample from (
 select student_id, date, montant_paye, count(*) n from public.receipts
 where voided_at is null and deleted_at is null and student_id is not null
 group by 1,2,3 having count(*)>1) x;
```

#### Q18 — prospects rescheduled or replaced 3+ times

```sql
set transaction read only;
select count(*) leads, (array_agg(lead_id))[1:5] sample from (
 select lead_id from public.crm_activities where event_type in ('task_rescheduled','task_cancelled','task_created')
 group by lead_id having count(*) filter (where event_type='task_rescheduled')+count(*) filter (where event_type='task_cancelled')>=3) x;
```

#### Q19 — actions done before their due time

```sql
set transaction read only;
select task_type, count(*) n, avg(due_at-completed_at) avg_early
from public.crm_tasks where status='completed' and completed_at<due_at group by 1 order by n desc;
```

#### Q20 — prospects stuck in a stage over 14 days

```sql
set transaction read only;
select l.status, count(*) n, (array_agg(l.id))[1:5] sample from public.crm_leads l
where l.status in ('NEW','CONTACTING','ENGAGED','QUALIFIED') and l.merged_into_lead_id is null
 and coalesce((select max(a.occurred_at) from public.crm_activities a where a.lead_id=l.id and a.to_status is not null), l.created_at) < now()-interval '14 days'
group by 1;
```

#### Q21 — students with no CRM prospect; tests linked to nobody

```sql
set transaction read only;
select 'enrolled_without_lead' k, count(*) n from public.students s
 where s.deleted_at is null and s.status='Enrolled' and not exists(select 1 from public.crm_leads l where l.student_id=s.id)
union all select 'tests_without_lead_or_student', count(*) from public.placement_tests where crm_lead_id is null and student_id is null
union all select 'tests_student_only', count(*) from public.placement_tests where crm_lead_id is null and student_id is not null;
```

#### Q22 — groups without a teacher

```sql
set transaction read only;
select session_type, count(*) n, (array_agg(id))[1:5] sample from public.groups
where teacher_id is null and closed_at is null group by 1;
```

#### Q23 — replay one prospect's history

Takes one lead id as a parameter. Replace `:'lead_id'` with the quoted id (the Management API path has no psql variables). Run it once per id from Q04 or Q06. Its output contains notes: keep it out of the repository.

```sql
set transaction read only;
select a.occurred_at, a.event_type, a.channel, a.outcome, a.from_status, a.to_status, a.task_id,
       split_part(a.source_key,':',3) command, left(md5(coalesce(a.body,'')),8) body_hash,
       t.task_type, t.due_at, t.status task_status, t.schedule_kind
from public.crm_activities a left join public.crm_tasks t on t.id=a.task_id
where a.lead_id = :'lead_id' order by a.occurred_at, a.id;
```

#### Q24 — test data inventory

The patterns come from the owner's list; ids only.

```sql
set transaction read only;
select 'student' k, id::text from public.students where full_name ilike 'TEST Claude%'
union all select 'contact', id::text from public.crm_contacts where display_name ilike 'TEST Claude%'
union all select 'lead', id::text from public.crm_leads where learner_name ilike 'TEST Claude%'
union all select 'group', id::text from public.groups where name ilike 'TEST R4%'
union all select 'receipt', receipt_number||' voided='||(voided_at is not null) from public.receipts
 where receipt_number in ('EH-2026-00459','EH-2026-00460','EH-2026-00461');
```

The test student whose name ends in « test » is added by id, which the owner supplies, because a name pattern could match a real learner.

#### Q25 — free-text programmes and sources

```sql
set transaction read only;
select 'program' k, coalesce(session_type,'∅')||' | '||coalesce(program_interest_text,'∅') v, count(*) n from public.crm_leads group by 2
union all select 'source', s.channel||' | '||s.source_label, count(*) from public.crm_leads l join public.crm_submissions s on s.id=l.first_submission_id group by 2
order by k, n desc;
```

#### Q26 — appointments and visits per prospect (calendar duplicates)

```sql
set transaction read only;
select count(*) leads, (array_agg(lead_id))[1:5] sample from (
 select lead_id from public.crm_tasks where status='open' and task_type='center_visit' group by 1 having count(*)>1) x;
```

#### Q27 — staff accounts without a name

```sql
set transaction read only;
select role, count(*) filter (where coalesce(btrim(full_name),'')='') unnamed, count(*) total
from public.profiles where role in ('director','admin','receptionist') group by role;
```

#### Q28 — student duplicates

```sql
set transaction read only;
with k as (select id, array_to_string(array(select w from unnest(regexp_split_to_array(lower(btrim(full_name)),'\s+')) w order by w),' ') nm,
 right(regexp_replace(coalesce(telephone,''),'[^0-9]','','g'),9) ph from public.students where deleted_at is null)
select count(*) groups, (array_agg(ids[1]))[1:5] sample from (
 select nm, array_agg(id) ids from k group by nm having count(*)>1) x;
```

This matches names regardless of word order, which catches pairs like « Prénom Nom » / « nom prénom ». A second pass on `ph` with the same name tokens raises confidence.
