# Courses with dates — close a finished course, revision CDC-r1

**Status: PROPOSED (plan only; not approved).** Revision **CDC-r1**, 2026-11-05. Risk tier: **3** (enrollment integrity, a director command that ends enrollments in bulk, a guard on every placement path, a counted Production data step). Owner: Maroine. Nothing is implemented, merged, applied or deployed, and **no Production read, count or mutation occurred** while writing this plan. Baseline: freshly fetched `origin/main` = `6e724ab67f3aa501e99a028b3390cf05aaf9ef74` (PR #184, the enrollment-at-payment closeout, docs only); latest migration file `127_enrollment_at_payment.sql`; Production ledger **001–127** per [CURRENT_STATE](../../ai/CURRENT_STATE.md#deployment-and-credential-evidence-boundaries); next free migration number **128** (provisional, re-read at implementation; the two other open PRs, #121 and #140, are docs only and claim no number from 128 on). Pattern: Batch D's year close and online course close ([EGC-r2](enrollment-group-consistency.md), [ADR-010](../decisions/ADR-010-group-membership-from-enrollments.md)), conflicts as in [ADR-009](../decisions/ADR-009-conflicts-never-retryable.md), counted data step as in [enrollment at payment](enrollment-at-payment.md) D7. Proposed ADR: [ADR-016](../decisions/ADR-016-course-dates-and-close.md). Planned, implemented, merged, deployed and Production-verified are distinct states.

# Owner summary

**The problem (owner, 2026-11-05).** A group has a school year (`annee`) but no start or end date, so the application cannot tell that a short course is over. When a Mise à niveau or an Adults session finishes, its paid enrollments stay « Inscrit » (Confirmed or Validated) for ever. The director's dashboard card « Inscrits — groupe à affecter » shows **38**: 18 Mise à niveau, 10 Adults, 7 Yearly, 2 One-to-One and 1 Online One-to-One, all 2026/2027 and without a group. The only bulk close today is « Clôturer l'année » (a whole school year); online courses have their own close.

**What this plan proposes.** Groups get a start and an end date; the director sees which courses are finished and closes each one explicitly with « Clôturer le cours »; a one-time, counted step ends the 18 finished Mise à niveau enrollments. Nothing ends automatically.

## What will change

- **Dates on every group form:** « Date de début » and « Date de fin ». Required for the short programmes (Mise à niveau, Adults, Summer Camp, One-to-One, Q1); optional for Yearly, whose end defaults to the end of its school year (Q2). Both dates must fall inside the group's school year (Q3). Online courses keep the term dates they already have.
- **Dashboard card « Cours terminés à clôturer »** (director): the number of courses whose end date has passed and which still have learners, linking to the list on the Groups page.
- **Director command « Clôturer le cours »** on a finished course: a dialog shows how many learners it ends, how many stay « Inscrit » because they have another live enrollment, and how many still owe money; on confirmation every live enrollment of that course ends with the reason « Cours terminé ». Learner files become « Ancien apprenant » unless another live enrollment keeps them « Inscrit ». Balances stay owed and can still be collected; attendance, receipts, charges and the CRM conversion are untouched. The close is journalled, refuses a stale count (« rechargez »), and a repeated click after a lost response changes nothing.
- **A closed course** no longer accepts learners, disappears from the group pickers, from attendance and from « Groupes actifs », and stays readable under a « Clôturés » filter with its past learners (Q7). « Rouvrir le cours » undoes a close made by mistake (Q8).
- **One-to-One** becomes a course of capacity 1 with its own dates, closed like any course (Q4, recommended; owner to confirm).
- **One-time clean-up, counted first and approved separately:** the 18 Mise à niveau enrollments « Confirmed » without a group end with the reason « Mise à niveau terminée »; learners with another live enrollment stay « Inscrit ». Adults (10) and One-to-One (2 + 1 online) only after the owner confirms each programme (Q12); the 7 Yearly are never touched (they need a group).

## What staff will be able to do

- **Reception:** enter and edit course dates when creating or editing a group (as today for the other group fields); place paid learners in a finished course that is not yet closed (to tidy up before the close). Reception cannot close or reopen a course.
- **Director:** see the finished courses, close each one, reopen a course closed by mistake (Q5, Q8).
- **Admin:** as reception for groups; closing stays with the director (Q5).

## What remains restricted

- No role gains a capability beyond the director's two new commands. Placement rules (paid enrollment for reception, Q3 = B of EAP), capacity, the group school-year check, one live enrollment per programme and year, membership from enrollments, and the finance engine are unchanged.
- Nothing ends automatically: no scheduled job, no end-of-date trigger.
- A closed course's dates, year, programme, level and capacity are frozen until it is reopened; its closed mark can be written only by the two commands, never by a direct table write.

## UI impact

- Group form (`/groups`): the two dates; One-to-One capacity fixed at 1 (Q4); messages « Renseignez les dates du cours », « Les dates doivent être dans l'année scolaire du groupe », « La date de fin précède la date de début ».
- Groups list: dates shown; filters « En cours » (default), « À clôturer », « Clôturés ».
- Group page: « Clôturer le cours » (director) once the end date has passed; for a closed course a banner « Cours clôturé le … », no « Ajouter des apprenants » or « Retirer », and a read-only « Anciens apprenants du cours » list.
- Dashboard: the new card (director); « Groupes actifs » counts only groups not closed (today it counts every group, [dashboard 87](../../../src/app/(admin)/dashboard/page.jsx)).
- Learner file: an ended row already shows « Ancien groupe », the reason and the date; nothing new.
- Guide (`/helpdesk`): group form (Q8 section), a new « Clôturer un cours terminé » and the missing « Clôturer l'année » entry under the director part.

## Database impact

- **One forward migration (provisional `128_course_dates_close.sql`)**, nothing dropped: four columns on `groups` (`date_debut`, `date_fin`, `closed_at`, `closed_by`), two guard triggers, one journal table, four director functions, and two re-created functions (`save_receptionist_group`, `crm_enrollment_groups`, both from their 125 bodies). No existing row changes in the migration: existing groups keep empty dates.
- **One separately approved, counted, journalled data step** (`supabase/manual/`) for the 38 backlog rows, programme by programme, with a revert from its journal.

## Important security decisions

- The close reuses Batch D's leaver core (`academic_security.end_group_enrollments` → `leave` → `end_enrollment`), the same path as « Clôturer l'année » and the online close; it adds no new way to end an enrollment.
- **Director only** (Q5), checked inside the definer function from the stored role, like `close_school_year`.
- The closed mark is protected by a trigger: `closed_at`/`closed_by` change only under the commands' transaction-local flag, so the management RLS policy on `groups` (direct writes for admin and director) cannot close or reopen a course silently.
- The placement guard is a trigger on `enrollments`, like Batch H's year guard, so every path (group page, learner file, learner form, receipt form, CRM, « Groupe à affecter », direct writes) refuses a closed course.
- **One-to-One group names must not carry the learner's name:** every signed-in role, parents and students included, reads every group row (policy « groups read all auth », [123 line 1463](../../../supabase/migrations/123_portal_readiness.sql), rewritten by [124 line 386](../../../supabase/migrations/124_speed_as_the_centre_grows.sql)). The form proposes a neutral name (Q4).

## Risks / owner review points

1. **Q1 and Q2 decide when a group must have dates.** The recommendation makes a short-programme group without dates refuse its next placement (as Batch H did for a group without a year), so the director enters the dates of the existing short groups after the release (R0 counts them: B2).
2. **Closing ends real enrollments in bulk.** The dialog's count must match at execution (stale → « rechargez »), the close is journalled, and « Rouvrir le cours » restores exactly what that close ended (Q8).
3. **Attendance after a close.** The database still accepts corrections of a leaver's attendance for sessions before the end date ([121 lines 117–125](../../../supabase/migrations/121_enrollment_group_consistency_enforce.sql), [125 line 319](../../../supabase/migrations/125_audit_follow_ups.sql)), but the attendance page lists current members only, so after a close the course's past attendance can no longer be corrected from the screen. The close is therefore offered only after the end date, and its dialog asks to check the attendance first.
4. **The 38 backlog rows are not in any group,** so no course close can reach them; that is why the one-time step exists. The step ends paid enrollments; T8 counts those with no receipt at all (they leave the director's « Inscriptions confirmées sans aucun paiement » list once ended). Adults and One-to-One need the owner's per-programme confirmation (Q12).
5. **Teachers lose sight of a closed course's learners** (rosters, access and assessments follow membership). No teacher is assigned to any group yet (Batch D follow-up 5), so nobody is affected today; teacher read of closed courses is a follow-up (Q10).
6. **Release order:** migration first, application within minutes, outside reception hours. Between the two, the old application ignores the new columns; it would meet the new refusal only when placing into a short-programme group without dates, which is the intended rule (Q1).

---

# Verified current state

## Baseline and evidence limits

- **Baseline:** `origin/main` `6e724ab…`; migrations 001–127 on file; Production ledger 001–127 (CURRENT_STATE). Next free number 128.
- **Method:** static inspection of migrations 001–127, `src/`, `scripts/` and the docs; the read-only count query below was syntax-checked on a private local stack at migration 127 (empty, then with a few synthetic rows inside a rolled-back transaction). **No Production read occurred.** The owner's 38 is the dashboard figure of 2026-11-05; it agrees with the EAP release record of the same morning (Confirmed 38 before and after the archive step, [CURRENT_STATE](../../ai/CURRENT_STATE.md#enrollment-at-payment-migration-127-production-closeout-r0r4--2026-11-05)), because a Confirmed row placed in a group becomes Validated, so every Confirmed row is without a group.
- Line numbers below are those of the baseline files; the implementer re-reads every function to re-create with `pg_get_functiondef` on a local database first.

## Database dependency inventory (latest definitions)

| Concern | Latest definition | Today | This plan |
| --- | --- | --- | --- |
| `public.groups` columns | [001 lines 68–86](../../../supabase/migrations/001_initial_schema.sql), [049](../../../supabase/migrations/049_session_scoped_groups_and_levels.sql) `session_type`, [117 lines 25–28](../../../supabase/migrations/117_online_learning_pilot.sql) programmes | `name`, `niveau`, `teacher_id`, `salle`, `jours`, `horaire`, `capacite_max` (default 12), `terme` (« Sept–Déc », « Jan–Mar », « Avr–Juin », « Été »), `annee`, `categorie`, `session_type` (Yearly, Adults, Summer Camp, Communication Junior, Communication Adult, One-to-One, Mise à niveau, Other, Online, Online One-to-One). **No date and no closed state.** | **Adds** `date_debut date`, `date_fin date`, `closed_at timestamptz`, `closed_by uuid`, check `date_fin >= date_debut`. `terme` unchanged. |
| Group writes | RLS « groups admin all » ([124 line 380](../../../supabase/migrations/124_speed_as_the_centre_grows.sql), admin and director, direct insert/update/delete); reception through `public.save_receptionist_group` ([125 line 1762](../../../supabase/migrations/125_audit_follow_ups.sql), key allowlist `assert_keys`, create replay identity check) | The form writes the table directly for management and calls the RPC for reception ([groups/page.jsx 72–78](../../../src/app/(admin)/groups/page.jsx)). | **Re-created** `save_receptionist_group` (125 + the two date keys in the allowlist, the insert, the update and the replay identity). Management keeps its direct writes; the new guard covers them. |
| Group guards | `groups_year_guard` → `academic_security.guard_group_year` ([125 lines 117–141](../../../supabase/migrations/125_audit_follow_ups.sql): year format, D-H5a default year, year locked while live learners of another year); `groups_membership_level_guard` ([120 line 398](../../../supabase/migrations/120_enrollment_group_consistency.sql), D7); `online_group_guard` ([117 line 875](../../../supabase/migrations/117_online_learning_pilot.sql)) | Year rules only. | Unchanged. **New** `groups_course_guard` (D1). |
| Placement guards on `enrollments` | `enrollment_group_year_guard` → `guard_enrollment_group_year` ([125 lines 87–111](../../../supabase/migrations/125_audit_follow_ups.sql), share-locks the group); capacity `enforce_group_capacity` ([120 lines 404–421](../../../supabase/migrations/120_enrollment_group_consistency.sql)); online capacity ([117 lines 894–913](../../../supabase/migrations/117_online_learning_pilot.sql)); EAP retired-status guard (127) | No closed-course notion; placement into a closed online course is **not** refused (open Batch D follow-up 2, review DB-N3, [OWNER_DECISIONS](../../ai/OWNER_DECISIONS.md#enrollment-and-group-consistency-batch-d--released-2026-10-26)). | Unchanged. **New** `enrollment_course_guard` (D4). |
| Placement command | `academic_security.place` / `public.place_learner_in_group` ([127 lines 1013–1148](../../../supabase/migrations/127_enrollment_at_payment.sql)): reception needs a paid enrollment (Q3 = B), management a logged reason; capacity override with reason; `assign_receptionist_student_group` ([120 line 979](../../../supabase/migrations/120_enrollment_group_consistency.sql)) calls the same core | — | **Unchanged** (the trigger refuses closed courses and undated short groups underneath it). |
| Leaver core | `academic_security.end_enrollment` ([120 lines 602–613](../../../supabase/migrations/120_enrollment_group_consistency.sql): `Ended`, `ended_at`, `ended_by`, `end_reason`, `ended_group_id`); `academic_security.leave` (lines 624–666: ends the chosen enrollments, file → Alumni/Inactive only when nothing else is live, never touches charges, receipts or attendance); `academic_security.end_group_enrollments` (lines 1529–1548: every live enrollment of one group, learners locked in id order, loops until none is left) | Shared by `end_learner`, `close_school_year`, archive and `online_close_course`. | **Reused unchanged** by « Clôturer le cours » and the data step. |
| Year close | `public.close_school_year(text, integer, text)` ([120 lines 704–736](../../../supabase/migrations/120_enrollment_group_consistency.sql)): director only, live count must equal the expected count (`egc.stale`, `PT409`), Alumni, logged through `academic_security.log` | UI on the Students list header, director only ([students/page.jsx 75–112, 334](../../../src/app/(admin)/students/page.jsx)). | Unchanged; the model for the course close. |
| Online close | `public.online_close_course(uuid, bigint)` ([120 lines 1557–1580](../../../supabase/migrations/120_enrollment_group_consistency.sql), from 117/118): director/admin, version-checked, revokes join passes, ends enrollments with « Cours en ligne clôturé », first pass, seat lock, second pass. `online_courses.term_start`/`term_end` (≤ 182 days, [117 lines 323–347](../../../supabase/migrations/117_online_learning_pilot.sql)) | Online courses already have dates and a close. | Unchanged (Q9). The course guard also refuses placement into a closed online course (Q9 = A). |
| Conflicts | `academic_security.stale()` ([120 lines 75–78](../../../supabase/migrations/120_enrollment_group_consistency.sql), `PT409`, `egc.stale`), ADR-009 | The browser maps `PT409` to « rechargez » ([membershipActions.mjs 71–93](../../../src/lib/academic/membershipActions.mjs)). | New commands raise `PT409` only; no `40001`. |
| Reopen | `public.reopen_enrollment` ([127 line 882](../../../supabase/migrations/127_enrollment_at_payment.sql)): director/admin, Ended → Confirmed without group; refuses rows ended by the EAP archive (journal membership) | — | Unchanged; rows ended by a course close or the data step stay reopenable (Q13). |
| Learner status | `public.sync_student_from_enrollments` ([121 line 51](../../../supabase/migrations/121_enrollment_group_consistency_enforce.sql)), D3-A | Enrolled while a Confirmed/Validated enrollment exists; Alumni/Inactive only through the leaver paths. | Unchanged. |
| CRM conversion | `crm_security.evaluate_conversion` ([120 lines 1317–1336](../../../supabase/migrations/120_enrollment_group_consistency.sql), D5-A) | An enrollment ended from Confirmed/Validated keeps its conversion, **no review flag**. | Unchanged (counted: T9). |
| Payments after the end | `create_charge_payment` ([127 lines 227–235](../../../supabase/migrations/127_enrollment_at_payment.sql)) | « An ended enrollment only takes payments on its own charge (an old balance) », without changing the enrollment. | Unchanged: balances stay collectable. |
| Attendance | `public.attendance_student_in_group` ([125 line 319](../../../supabase/migrations/125_audit_follow_ups.sql)) and `enforce_attendance_integrity` ([121 line 129](../../../supabase/migrations/121_enrollment_group_consistency_enforce.sql)) | A member, or an ended enrollment of that group for a session **before** its end date. | Unchanged; the close happens after `date_fin` (Q6), so every session up to the end date stays correctable in the database. |
| Teacher access | `teacher_can_access_student_group` ([123 line 200](../../../supabase/migrations/123_portal_readiness.sql)), `portal_teacher_roster` (123 line 516) | Membership only. | Unchanged (Q10). |
| Group pickers | `public.crm_enrollment_groups` ([125 line 1837](../../../supabase/migrations/125_audit_follow_ups.sql)) | Lists every group of the programme/level with its year. | **Re-created** from 125 to omit closed courses. |
| « Groupe à affecter » | `search_students_page` ([124 lines 1072–1078](../../../supabase/migrations/124_speed_as_the_centre_grows.sql)); dashboard count: Confirmed with no group ([dashboard 90](../../../src/app/(admin)/dashboard/page.jsx)) | — | Unchanged; the data step lowers it. |
| Journals | `maintenance.egc_cleanup_log` (120 lines 62–72), `maintenance.eap_archive_journal` (127 lines 41–55) | Each tied to its own batch; the EGC revert refuses after M2. | **New** `maintenance.course_close_journal` (D3, D7), same posture: RLS on, no API grant. |
| Clock | `public.business_date()`, `public.centre_school_year()` ([125 lines 42–61](../../../supabase/migrations/125_audit_follow_ups.sql)), `academic_security.today()` (125 line 153) | One centre clock, UTC+0 (ADR-014). | « Today » in every new rule is `public.business_date()`. |

## Application inventory (verified)

- **Groups:** [groups/page.jsx](../../../src/app/(admin)/groups/page.jsx) — `GroupModal` 36–144 (default form line 40, `terme` options 127, school year 41/62/70), save 72–80 (reception RPC, management direct write, `PT409` reload), list 179–194, delete 200–208 (reception cannot delete, 270/309), filters 211–215 (terme, programme, level; no date or year); [groups/[id]/page.jsx](../../../src/app/(admin)/groups/[id]/page.jsx) — roster 30–43, teachers 80–85, seats 111–114, « Ajouter des apprenants » 143–181/235–242, « Retirer » 183–203/302–308, meta 209–218. Roles: `canManageGroups` ([roleAccess.mjs 14, 52, 61](../../../src/lib/roleAccess.mjs)), [Sidebar.jsx 45](../../../src/components/layout/Sidebar.jsx), [middleware.js 26–30](../../../src/middleware.js).
- **Group pickers:** [EnrollmentModal.jsx 51–54](../../../src/components/students/EnrollmentModal.jsx), [StudentForm.jsx 152–155, 352](../../../src/components/students/StudentForm.jsx), [receiptGroupChoices.mjs 10–38](../../../src/lib/receiptGroupChoices.mjs) with [ReceiptForm.jsx 350](../../../src/components/receipts/ReceiptForm.jsx), [LegacyPlacementEditor.jsx 22, 27](../../../src/components/placement/LegacyPlacementEditor.jsx), [CrmEnrollmentDialog.jsx 75](../../../src/components/crm/CrmEnrollmentDialog.jsx) (`crm_enrollment_groups`).
- **Dashboard:** [dashboard/page.jsx](../../../src/app/(admin)/dashboard/page.jsx) — counts 84–93 (groups: every row, line 87; awaiting group: Confirmed and no group, line 90), cards 153–163 (« Groupes actifs » 156; « Inscrits — groupe à affecter » 159, admin and director).
- **Year close, leaver, reopen:** [students/page.jsx 75–112, 334–343](../../../src/app/(admin)/students/page.jsx) (`YearCloseDialog`, live count then command with the expected count); [students/[id]/page.jsx](../../../src/app/(admin)/students/[id]/page.jsx) 46–94 (`LeaverDialog`), 189–196 and 306 (« Rouvrir l'inscription »), 297–303 (ended rows: « Ancien groupe », reason, date); helpers [membershipActions.mjs](../../../src/lib/academic/membershipActions.mjs) 120–133, error texts 12–42 and 71–93.
- **Online:** [online/[id]/page.jsx](../../../src/app/(admin)/online/[id]/page.jsx) 45–79 (`term_start`, `term_end`), 48 (Online One-to-One capacity 1), 247–266 (« Clôturer »); [api/online/courses/close/route.js](../../../src/app/api/online/courses/close/route.js); [online/handlers.mjs 75, 93](../../../src/lib/online/handlers.mjs).
- **Attendance, timetable, teacher portal, assessments:** [attendance/page.jsx](../../../src/app/(admin)/attendance/page.jsx) 56–86 (every group, roster from membership), 134–141; [timetable/page.jsx 41, 63](../../../src/app/(admin)/timetable/page.jsx); [teacher-portal/page.jsx 458–480, 617](../../../src/app/(admin)/teacher-portal/page.jsx); [assessments/page.jsx 158–162](../../../src/app/(admin)/assessments/page.jsx). No page filters groups by date or year today.
- **Reports:** [reportData.mjs 75–111](../../../src/lib/reportData.mjs) (`academicOperationsData`: groups without teacher, capacity and occupancy over every group) and [AcademicOperationsReport.jsx 94–129](../../../src/components/reports/AcademicOperationsReport.jsx); `report_student_mix` ([124 line 1242](../../../supabase/migrations/124_speed_as_the_centre_grows.sql)) counts files by status (Alumni grows after closes; no change).
- **Programmes:** [programCatalog.mjs 21–31](../../../src/lib/programCatalog.mjs) (`SESSION_TYPES`); in-person One-to-One has no special handling anywhere in `src/` (only Online One-to-One defaults to capacity 1).
- **Guide:** [GuideContent.jsx](../../../src/app/(admin)/helpdesk/GuideContent.jsx) `#q8` 1015–1060 (create/edit a group), `#q9` 1061–1103 (« Groupe à affecter »), `#q10` 1109–1141, status cards 1595–1626 (line 1625: the year close or the online close ends enrollments), `#direction` 1853. **No section describes « Clôturer l'année »** although WORKFLOWS does; this plan adds it.

## Tests that touch the changed areas

`test-enrollment-group-consistency.sql` (751–759 `close_school_year`; 362–372 level lock), `test-egc-upgrade.mjs` (179, 254–275: the shared `end_group_enrollments` core), `test-online-learning.sql` (241, 505, 555, 858 `online_close_course`), `test-online-unit.mjs` (156–169), `test-receptionist-batch1.sql` (185–218 `save_receptionist_group`), `test-audit-follow-ups.sql` and `test-audit-follow-ups-ui.mjs` (50–52 year close shape; 110–112 dashboard card label), `test-student-placement-browser.mjs` (98–101 year close hidden for non-directors), `test-cache-invalidation.mjs` (15, 74), `test-enrollment-workflow.mjs` (18, 55), `test-membership-actions.mjs` (34), `test-receipt-client-regressions.mjs` (259) and `test-enrollment-at-payment-absence.mjs` (49) read the dashboard source; `test-enrollment-at-payment.sql` and `test-enrollment-at-payment-upgrade.mjs` (current upgrade ceiling 127); `test-receptionist-group-filter.sql`, `test-student-placement.sql`, `test-enrollment-group-concurrency.py`.

---

# Owner direction (2026-11-05), proposed by the coordinator, confirmed through Q1–Q13

Recorded as **proposed**; the owner confirms or changes each point through the answers below.

1. Groups get `date_debut` and `date_fin`: required for short programmes (Mise à niveau, Adults, Summer Camp, One-to-One); for Yearly, proposed as the end of the school year. Validated against the group's school year. → Q1, Q2, Q3.
2. A director dashboard card « Cours terminés à clôturer » (end date passed, still active enrollments). → D5, Q5.
3. A director command « Clôturer le cours »: ends every live enrollment of that group with reason « Cours terminé », resyncs files (Ancien apprenant unless another live enrollment keeps Inscrit), balances stay owed, attendance and receipts kept, journalled and idempotent; reuses the Batch D leaver/year-close machinery and ADR-009 conflicts. Not automatic. → D3, Q5–Q8.
4. One-to-One as a course of capacity 1 with its own dates (recommendation; owner asked). → Q4.
5. One-time data step (counted first, approved separately): end the 18 Mise à niveau Confirmed enrollments without group with reason « Mise à niveau terminée » (learners with another live enrollment keep Inscrit); Adults (10) and One-to-One (3) only after the owner's confirmation per programme. → D7, Q11–Q13.

# Scope and non-goals

**In scope:** the group dates and their validation; the finished-course list and dashboard card; « Clôturer le cours » and « Rouvrir le cours »; the closed-course placement guard (in-person and online); the pickers, lists and dashboard counts that must ignore closed courses; One-to-One as a capacity-1 course (if Q4 = A); the counted data step for the 38 backlog rows with its revert; tests; docs and the guide.

**Non-goals:** any automatic close or reminder job; changing `close_school_year`, `online_close_course`, the leaver core, placement (`place`), capacity, the year check or the membership rule; ending Confirmed enrollments that have no group through a course close (they belong to no course; they stay in « Groupe à affecter » or are ended per learner); dropping or migrating `terme` (it stays, now redundant with the dates; retiring it is a later wording change); filling dates on existing groups by migration (no guessed data; the director enters them, Q1); teacher read of closed courses (Q10) and past online rosters (Batch D follow-up 2, first half); finance, numbering, CRM or conversion changes; any Production read or mutation by the architecture or implementation task.

# Design

## D1 — Group dates and their validation (Q1–Q4)

- Columns `date_debut date`, `date_fin date` on `public.groups`, nullable (existing rows stay empty), with `groups_course_dates_order check (date_debut is null or date_fin is null or date_fin >= date_debut)`.
- **Short programmes** (Q1 = A): Mise à niveau, Adults, Summer Camp, One-to-One. A new group of these programmes, or a group whose programme changes into one of them, needs both dates; once set they are never cleared. An existing short group without dates keeps working for everything except a **new placement**, which the course guard refuses with « Renseignez les dates du cours avant d'y affecter un apprenant. » (hint `course.dates_required`), exactly as Batch H made a group without a year refuse placement (D-H5b).
- **Yearly, Other, Communication Junior/Adult** (Q2 = A): dates optional. A Yearly group without dates is treated, for the finished-course list only, as ending on 31 August of its school year (computed from `annee`, not stored). A Yearly group may carry real dates (for instance teaching until 30 June) and then appears in the list like any course; « Clôturer l'année » remains the normal way to end Yearly.
- **Window** (Q3 = A): for a group of school year `Y/Y+1`, both dates lie between **1 June Y and 31 August Y+1** — the window the EAP « paid elsewhere » rule already uses for receipts ([PRODUCT_RULES](../../ai/PRODUCT_RULES.md#enrollment-at-payment-migration-127-released-2026-11-05), the D5 rule), so a Mise à niveau taught in late August for the coming year fits. Refusal: « Les dates du cours doivent être comprises dans l'année scolaire du groupe (du 1er juin … au 31 août …). » (hint `course.dates_outside_year`). A change of `annee` re-checks the dates.
- **One-to-One** (Q4 = A): capacity is 1 (the form fixes it; the guard refuses another value on insert and on a change of `capacite_max` or `session_type`; existing One-to-One groups with another capacity are counted at R0, B5, and corrected when next edited). The form proposes the name « Cours individuel · <niveau> · <date de début> » and the guide forbids the learner's name in a group name (security decisions above).
- **Online groups** keep empty date columns; their dates are `online_courses.term_start`/`term_end`, shown and edited on the online course page as today (Q9).
- Implementation: `academic_security.guard_course_group()` (`security definer`, fixed `search_path`, no API grant), trigger `groups_course_guard before insert or update of date_debut, date_fin, annee, session_type, capacite_max, niveau, closed_at, closed_by on public.groups`. It also enforces D4's frozen fields and protected closed mark. The 125 year guard is not re-created; both triggers fire.
- `save_receptionist_group` is re-created from its [125 body](../../../supabase/migrations/125_audit_follow_ups.sql) (line 1762) with `date_debut` and `date_fin` added to `assert_keys`, the insert, the update (`case when p_changes ? … then … else g.… end`) and the create-replay identity comparison; nothing else changes (one-line unchanged-from-125 proof, as in EAP).

## D2 — The finished-course list

`public.list_courses_to_close()` (director only, `security definer`, `stable`, grant `authenticated`): rows `{kind ('in_person'|'online'), group_id, name, session_type, niveau, school_year, date_debut, date_fin (or term dates), effective_end, live_count}` for

- in-person groups with `closed_at is null`, an effective end (`date_fin`, or the Yearly default of Q2) **before** `public.business_date()`, and at least one live enrollment in the group;
- online courses (Q9 = A) with `term_end` before today, `status <> 'closed'` and at least one live enrollment.

Ordered by effective end, oldest first; bounded (at most 200 rows, the list is small). « Live » is the Batch D live set (`Submitted, Under Review, Confirmed, Validated, Trial`; only Validated rows can be in a group since 127).

## D3 — « Clôturer le cours » (director, Q5–Q8)

- **Preview** `public.close_course_preview(p_group uuid) returns jsonb` (director): `{live_count, stay_enrolled, become_alumni, open_balance_count, date_fin, closed_at}` — the dialog's numbers.
- **Command** `public.close_course(p_group uuid, p_expected_count integer, p_reason text default 'Cours terminé') returns jsonb`, `security definer`, `search_path = pg_catalog, pg_temp`, execute granted to `authenticated` only (revoked from `public`, `anon`, `service_role`), role checked inside (`get_my_role() = 'director'`, else `42501`).
  1. Reason: `academic_security.valid_reason` (1–200 characters; the dialog prefills « Cours terminé »).
  2. Group: not found → `PT409` `egc.stale`; an online programme → `23514` `course.online` (« Clôturez ce cours depuis sa page Cours en ligne. »).
  3. **Replay first (idempotency):** if `closed_at` is set and the group has no live enrollment, return the journalled result of that close with `replayed: true` and write nothing. The same check runs again right after the locks of step 5, so a second director whose close waited on the first one's locks also gets the replay instead of a stale count. A resend after a lost response, or a second director clicking at the same time, gets the same answer without an error.
  4. **Finished only (Q6 = A):** `date_fin` must exist and be before `public.business_date()`; otherwise `23514` `course.not_finished` (« Ce cours n'est pas terminé : sa date de fin est le … »). For a Yearly group without dates the computed end applies.
  5. **Count:** learners in the group are locked in id order (the Batch D order learner → enrollment → group), then the live count must equal `p_expected_count`, else `PT409` `course.count_changed` (« Le nombre d'apprenants a changé, rechargez. »).
  6. **Journal first:** a `run_id`; before-images of every live enrollment of the group (`status`, `group_id`, `level`, `school_year`) and of each learner file (`status`, `groupe_id`) into `maintenance.course_close_journal` (action `ended` / `resynced`, `source = 'close_course'`).
  7. **End:** `academic_security.end_group_enrollments(p_group, 'Alumni', reason)`; then mark the group closed (`closed_at = now()`, `closed_by = auth.uid()`) under the transaction-local flag `eh.course_command = 'on'`, the update re-checking `closed_at is null` and the end date (no row → `PT409` `egc.stale`, everything rolled back), because the group row is not locked before the learners (locking it first would invert the placement order); then a second `end_group_enrollments` pass for anything placed between the first pass and the mark (the `online_close_course` pattern, 120 lines 1573–1575). A placement that starts after the mark waits on the group row (the year guard and the course guard share-lock it) and is refused once the close commits (D4). No lock cycle: placements lock the learner then the group; the close holds learners already in the group, then the group row.
  8. **Log:** `academic_security.log('close_course', null, null, p_group, {run_id, reason, ended, alumni, still_enrolled, open_balances})` in the activity log, as `close_school_year` does.
  9. **Result:** `{group_id, closed_at, ended, alumni, still_enrolled, open_balance_count, run_id, replayed: false}`.
- **What it does not touch:** charges, receipts, payments (an ended enrollment's own charge still takes payments, 127 lines 227–235), attendance rows, CRM conversions (D5-A, no review flag), the lifecycle outbox, other enrollments of the learners.
- **Learner files:** `leave` sets Alumni (« Ancien apprenant ») when nothing else is live, otherwise keeps Enrolled (« Inscrit ») and the main group moves to the remaining membership — exactly the year close's behaviour.
- **« Rouvrir le cours »** (Q8 = A) `public.reopen_course(p_group uuid, p_expected_closed_at timestamptz) returns jsonb` (director): checks the mark (`PT409` when it changed), clears it under `eh.course_command`, then for each enrollment the latest close of that group journalled as `ended`: when it is still `Ended` with `ended_group_id = p_group` and the learner has no other live enrollment of that programme and year, restores it to Validated in the group (the « Rouvrir l'inscription » transition followed by a placement in the same group, capacity override flag set and logged, because the seats were theirs); rows that changed since are left ended and returned in `skipped` with a reason code. Journal action `reopened`; log `reopen_course`. Placement rules for new learners apply again once reopened.
- **Errors** reuse the browser's `PT409` handling (« rechargez ») and add French texts for the new hints in `membershipActions.mjs`.

## D4 — The course guard on `enrollments`, and closed courses everywhere (Q7, Q9)

- `academic_security.guard_course_placement()` (`security definer`, no API grant), trigger `enrollment_course_guard before insert or update of group_id, status on public.enrollments`. It acts only when the row **enters** a group: a new grouped row, a new `group_id`, or a grouped row becoming live again (the same notion as the year guard, 125 lines 99–103). Then, with the group row share-locked:
  - a closed in-person course (`closed_at is not null`) or a closed online course (`online_courses.status = 'closed'`, Q9 = A, Batch D follow-up 2 second half) → `23514` `course.closed` (« Ce cours est clôturé. »);
  - a short-programme group without both dates (Q1 = A) → `23514` `course.dates_required`.
  - Exemptions: the Batch D two-flag restore (`eh.membership_sync` and `eh.enrollment_command`, as every Batch D/H guard), and `eh.course_command` for « Rouvrir le cours ».
- **Group guard (D1 trigger):** `closed_at` and `closed_by` change only under `eh.course_command`; while closed, `date_debut`, `date_fin`, `annee`, `session_type`, `niveau` and `capacite_max` are frozen (« Rouvrez le cours pour le modifier. », hint `course.closed`); name, teacher, room and schedule stay editable. A closed group cannot be deleted in practice (its ended enrollments reference it through `ended_group_id … on delete restrict`, 120 line 38); the delete message says so.
- **Readers that ignore closed courses:** `crm_enrollment_groups` (re-created from 125, `and g.closed_at is null`, closed online courses excluded); in the browser, the pickers (EnrollmentModal, StudentForm, receipt group choices, LegacyPlacementEditor, group page placement), the attendance, timetable, assessments and teacher-portal group selects, the reports' academic operations (groups without teacher, occupancy), the dashboard « Groupes actifs » count. A finished but **not yet closed** course stays selectable, marked « terminé le … », so a forgotten paid learner can still be placed before the close.

## D5 — Screens

- **Dashboard** (director, Q5 = A): card « Cours terminés à clôturer » = number of rows of `list_courses_to_close()`, linking to `/groups?vue=a-cloturer`; « Groupes actifs » counts groups not closed (in-person `closed_at is null`, online not closed). « Inscrits — groupe à affecter » unchanged.
- **Groups list:** date columns « Du … au … »; filter « En cours » (default: not closed), « À clôturer » (the D2 list; director), « Clôturés ». Each « À clôturer » row: « Clôturer le cours » for in-person, « Ouvrir le cours en ligne » for online.
- **Close dialog:** course name, dates, « N apprenants : X deviennent Ancien apprenant, Y restent Inscrits (autre inscription en cours) », « Z ont un solde à payer : il reste dû », a reminder « Vérifiez que les présences sont saisies : après la clôture, la liste d'appel du cours n'est plus proposée. », the reason (prefilled « Cours terminé »), « Clôturer le cours ». Success toast with the numbers; on `PT409` the dialog reloads its preview.
- **Group page:** « Clôturer le cours » (director) once finished; closed: banner « Cours clôturé le … », « Rouvrir le cours » (director), no placement or removal, read-only « Anciens apprenants du cours » (enrollments with `ended_group_id` = the group, staff only, existing RLS).
- **Group form:** the two dates with the D1 messages; One-to-One capacity 1 and the neutral name proposal.
- **Guide:** `#q8` (dates; One-to-One naming rule), a new direction entry « Clôturer un cours terminé » (card, dialog, balances, reopen), the missing « Clôturer l'année » entry, status cards line 1625 (a course close also ends enrollments); screenshots of the group form and the close dialog with synthetic data.

## D6 — Online courses (Q9)

Unchanged: dates on the course, « Clôturer » on its page (it also revokes join passes and closes the provider room, which the in-person command must not do). Added: they appear in « Cours terminés à clôturer » once past `term_end`, and the D4 guard refuses placement into a closed online course. Past online rosters (Batch D follow-up 2, first half) stay a follow-up.

## D7 — The one-time data step (Q11–Q13)

**R0 count query** (read-only, counts only, no personal data; through the guarded transport, which runs the file as one implicit transaction and returns only the last statement's rows, so the file is `set transaction read only;` and exactly one query, per the [WORKFLOWS convention](../../ai/WORKFLOWS.md#guarded-release-wrapper)). Syntax-checked on a local 127 stack; not run on Production.

```sql
set transaction read only;
with live as (
  select e.id, e.student_id, e.status, e.group_id, e.session_type, e.school_year, e.notes, e.date_inscription
  from public.enrollments e
  where e.status in ('Submitted', 'Under Review', 'Confirmed', 'Validated', 'Trial')
), t as (
  select x.* from live x
  where x.status = 'Confirmed' and x.group_id is null
    and x.session_type in ('Mise à niveau', 'Adults', 'One-to-One', 'Online One-to-One')
), g as (
  select gr.id, gr.session_type, gr.annee, gr.capacite_max,
    (select count(*) from live x where x.group_id = gr.id) as live_n
  from public.groups gr
)
select 'A1 live enrollments · ' || coalesce(session_type, '(none)') || ' · ' || coalesce(school_year, '(none)')
    || ' · ' || status || case when group_id is null then ' · sans groupe' else ' · en groupe' end as category,
  count(*) as n
  from live group by session_type, school_year, status, (group_id is null)
union all select 'A2 dashboard card « Inscrits — groupe à affecter » (Confirmed, no group)', count(*)
  from public.enrollments where status = 'Confirmed' and group_id is null
union all select 'B1 groups · ' || session_type, count(*) from g group by session_type
union all select 'B2 groups with live learners · ' || session_type, count(*) from g where live_n > 0 group by session_type
union all select 'B3 live learners in groups · ' || session_type, sum(live_n)::bigint from g group by session_type
union all select 'B4 groups whose year is not a valid school year', count(*) from g
  where coalesce(btrim(annee) ~ '^[0-9]{4}[-/][0-9]{4}$' and right(btrim(annee), 4)::integer = left(btrim(annee), 4)::integer + 1, false) is not true
union all select 'B5 One-to-One groups with a capacity other than 1', count(*) from g
  where session_type = 'One-to-One' and capacite_max is distinct from 1
union all select 'C1 online courses · ' || status, count(*) from public.online_courses group by status
union all select 'C2 online courses past their term end and not closed', count(*) from public.online_courses c
  where c.term_end < public.business_date() and c.status <> 'closed'
union all select 'C3 live enrollments in the C2 courses', count(*) from live x
  where x.group_id in (select c.group_id from public.online_courses c where c.term_end < public.business_date() and c.status <> 'closed')
union all select 'T1 targets (Confirmed, no group) · ' || session_type || ' · ' || coalesce(school_year, '(none)'), count(*)
  from t group by session_type, school_year
union all select 'T2 of T1: keeps another live enrollment outside every target (stays Inscrit) · ' || t.session_type, count(*) from t
  where exists (select 1 from live y where y.student_id = t.student_id and y.id <> t.id and y.id not in (select id from t))
  group by t.session_type
union all select 'T3 of T1: no other live enrollment (becomes Ancien apprenant) · ' || t.session_type, count(*) from t
  where not exists (select 1 from live y where y.student_id = t.student_id and y.id <> t.id)
  group by t.session_type
union all select 'T4 of T1: other live enrollments are all targets of another programme (outcome depends on Q12) · ' || t.session_type, count(*) from t
  where exists (select 1 from live y where y.student_id = t.student_id and y.id <> t.id)
    and not exists (select 1 from live y where y.student_id = t.student_id and y.id <> t.id and y.id not in (select id from t))
  group by t.session_type
union all select 'T5 of T1: learner file archived (expected 0) · ' || t.session_type, count(*) from t
  join public.students s on s.id = t.student_id where s.deleted_at is not null group by t.session_type
union all select 'T6 of T1: learner file not Enrolled (expected 0) · ' || t.session_type, count(*) from t
  join public.students s on s.id = t.student_id where s.status is distinct from 'Enrolled' group by t.session_type
union all select 'T7 of T1: open balance on a live charge of this enrollment or programme and year (stays owed) · ' || t.session_type, count(*) from t
  where exists (select 1 from public.charge_balances b where b.student_id = t.student_id and b.voided_at is null and b.balance > 0
    and (b.enrollment_id = t.id or (b.enrollment_id is null and b.session_type = t.session_type and b.school_year is not distinct from t.school_year)))
  group by t.session_type
union all select 'T8 of T1: no live receipt linked to the enrollment or its charges · ' || t.session_type, count(*) from t
  where not exists (select 1 from public.receipts r where r.voided_at is null and r.deleted_at is null
    and (r.enrollment_id = t.id or r.charge_id in (select c.id from public.charges c where c.enrollment_id = t.id)))
  group by t.session_type
union all select 'T9 of T1: linked to a CRM lead (conversion kept, no review flag expected) · ' || t.session_type, count(*) from t
  where exists (select 1 from public.crm_leads l where l.enrollment_id = t.id and l.merged_into_lead_id is null)
  group by t.session_type
union all select 'T10 of T1: created by the Batch D clean-up (notes « Rattrapage EGC … ») · ' || t.session_type, count(*) from t
  where t.notes like 'Rattrapage EGC%' group by t.session_type
union all select 'T11 of T1 by enrollment month · ' || t.session_type || ' · ' || coalesce(to_char(t.date_inscription, 'YYYY-MM'), '(none)'), count(*)
  from t group by t.session_type, to_char(t.date_inscription, 'YYYY-MM')
union all select 'T12 Yearly Confirmed without group (never targeted)', count(*) from live
  where status = 'Confirmed' and group_id is null and session_type = 'Yearly'
union all select 'J1 Ended enrollments total', count(*) from public.enrollments where status = 'Ended'
union all select 'J2 learner files Alumni', count(*) from public.students where status = 'Alumni' and deleted_at is null;
```

Expectations: A2 = 38 and T1 = 18 / 10 / 2 / 1 for Mise à niveau / Adults / One-to-One / Online One-to-One (the owner's 2026-11-05 figures; any difference goes back to the owner before approval); T5 = T6 = 0; T12 = 7. T2 + T3 + T4 = T1 per programme. T4 is non-zero only for a learner whose other live enrollments are themselves targets (their final status depends on which programmes the owner approves). T7 is the number of rows whose balance stays owed. T8 rows are listed today in the director's « Inscriptions confirmées sans aucun paiement » and leave that list once ended; the director may review them first. T9 conversions stay valid with no review flag (D5-A). T11 helps the owner judge whether a whole programme is finished (Q12). B2/B3 show the short-programme groups that will need dates before their next placement (Q1) and the learners future closes will reach. C2/C3 are the online courses that would appear on the card.

**Data step** (`supabase/manual/course_close_backlog.sql`, run only on the owner's explicit approval of the day's counts, after migration 128 (Q11 = A), through the guarded wrapper, as the migration role, one transaction, dry run by default):

1. Parameters (transaction-local): the approved programmes (Mise à niveau, and Adults / One-to-One / Online One-to-One only if the owner confirms them, Q12), the school year `2026/2027`, a reason per programme (« Mise à niveau terminée »; « Session Adults terminée »; « Cours individuel terminé »), and the declared counts T1, T2, T3 per approved programme. Any difference raises and changes nothing.
2. Targets: Confirmed, `group_id is null`, approved programme, that year. Refuse (`PT409`, nothing changed) when a targeted learner is mid-enrollment or mid-payment (the intent locks the payment path takes) or a target is no longer Confirmed without group.
3. Journal first in `maintenance.course_close_journal` (`source = 'backlog_step'`, one `run_id`): enrollment before-images and learner-file before-images.
4. Per learner, in id order: `academic_security.leave(student, 'Alumni', reason, <that learner's targets>)` — the year close's exact call. Learners with another live enrollment keep « Inscrit »; the others become « Ancien apprenant ».
5. Post-conditions (any failure rolls everything back): every target `Ended` with its reason; A2 lowered by exactly the targets; T3 files Alumni, T2 files unchanged; charges, receipts, attendance, CRM leads and activities unchanged (row counts and a balance checksum taken before and after inside the transaction); lifecycle outbox unchanged; a second run finds no target (declared counts 0).
6. **Revert** (`supabase/manual/course_close_backlog_revert.sql`, prepared, never run without its own approval): restores the journalled enrollment before-images (Confirmed, no group, ended fields cleared) under the Batch D two-flag exemption, re-syncs each learner file, journals `reverted` rows referencing the originals; valid until a restored learner is enrolled, paid or placed again, after which a reviewed forward correction.
- Rows ended by the step are ordinary ended enrollments: « Rouvrir l'inscription » works on them (Q13 = A).

## D8 — Docs at implementation and closeout

PRODUCT_RULES (people/academics: course dates, the close, closed courses, One-to-One), WORKFLOWS (placement section: dates, « Clôturer le cours », « Rouvrir le cours »), SECURITY_RULES (two director commands; the protected closed mark; the One-to-One naming rule), ARCHITECTURE (core workflows line on closes), FEATURE_INDEX (groups row), the [enrollment workflow README](../../../scripts/README-enrollment-workflow.md), the guide, ADR-016 status, plans README, OWNER_DECISIONS; CURRENT_STATE only at closeout with dated evidence.

# Security boundaries

- New public functions: `list_courses_to_close`, `close_course_preview`, `close_course`, `reopen_course` — `security definer`, `search_path = pg_catalog, pg_temp`, execute for `authenticated` only (revoked from `public`, `anon`, `service_role`), director checked inside from the stored role. Tests prove refusal for admin (if Q5 = A), reception, teacher, parent, student, `anon` and `service_role`.
- Guards and the journal: no API grant; the journal has RLS enabled and every privilege revoked (the Batch D/EAP posture); ids, statuses, groups and years only.
- The closed mark cannot be set or cleared by a direct table write of any role, including the management policy and `service_role` (trigger, flag set only inside the two commands).
- No RLS policy changes. Reception keeps `assign_group` and its group RPC; it gains only the two date keys.
- The one-time step runs as the migration role through the guarded transport, journals before it writes and is counted twice (R0 and the declared counts).
- One-to-One group names never contain a learner's name (readable by every signed-in role).

# Migration, test, rollout and recovery strategy

## Sequence (migration first, application within minutes, outside reception hours)

| Step | Gate | Action |
| --- | --- | --- |
| R0 | Owner authorizes the read-only count | Run the D7 query through the guarded transport; record the counts; ledger 001–127 and the catalog digests against a clean local 127 build; targeted export of the two functions 128 replaces (`save_receptionist_group`, `crm_enrollment_groups`) to the owner's private folder with `SHA256SUMS`. |
| R0b | Owner reads the counts | Approves the release with the exact numbers, the programmes of the data step (Q12) and the declared counts. |
| R1 | Release approval, window outside reception hours | Apply migration 128 (dry run `DRYRUN_OK`, then apply) through the guarded wrapper; read-only checks: four columns, two triggers, journal posture, four functions and their ACLs, the two re-created bodies, catalog diff exactly the manifest. |
| R2 | Same approval, right after R1 | Data step (D7) for the approved programmes: dry run, then run with the declared counts; read-only post-conditions. A raise changes nothing and the release reports before deploying. |
| R3 | Same approval | Merge the reviewed head; Vercel Production READY on that commit; anonymous probes (`/groups` and `/dashboard` redirect to `/login`). |
| R4 | Same approval | Rolled-back probes as director and reception: `close_course` on an open group not finished refused `course.not_finished`; reception and admin refused `42501`; a placement into a short-programme group without dates refused `course.dates_required` (only if B2 shows such a group with a paid learner available; otherwise covered by CI); `list_courses_to_close` returns rows without error. No successful close in Production by the release task (the first is the director's, R5). Postgres and API logs, 30 minutes. |
| R5 | Owner / director | Enter the dates of the short-programme groups listed at R0 (B2); first real « Clôturer le cours » on a finished course; card and Groups filters checked. Recorded as owner evidence. |
| R6 | Closeout | Docs per D8 and CURRENT_STATE with dated evidence; the plan moves to completed. |

## Local test strategy (synthetic data only)

- **Database, CI-run:** a new `scripts/test-course-dates-close.sql`: date validation (window, order, required programmes on create and programme change, never cleared, Yearly optional, online ignored), One-to-One capacity 1; `save_receptionist_group` with dates (create, replay identity, update) and an unchanged-from-125 proof for the rest; `close_course` as director (ended count, Alumni vs stays Enrolled, main group recomputed, open balance count, journal rows, activity log, charges/receipts/attendance/CRM untouched, conversion kept without review flag), replay after success (`replayed: true`, nothing written), stale count (`PT409` `course.count_changed`), not finished, online group, every other role refused; placement into a closed course refused on every path (`place_learner_in_group`, `assign_receptionist_student_group`, the learner form path, the receipt-form placement, a direct management insert) and into a closed online course; the two-flag and `eh.course_command` exemptions; direct writes of `closed_at` refused for admin, director and `service_role`; frozen fields of a closed group; `reopen_course` restoring exactly the journalled rows, skipping a row reopened or re-enrolled meanwhile, capacity override logged; attendance before the end date still insertable for an ended learner after the close; a payment on the ended enrollment's own charge accepted without reviving it; `list_courses_to_close` and the preview; the D7 R0 query on the fixture gives the expected counts.
- **Stateful upgrade rehearsal 127 → 128 (CI-run, the existing pattern):** seed at 127 (short groups without dates, Validated learners in them, a learner in a Yearly and a Mise à niveau group, the backlog shape: Confirmed-without-group rows of the four programmes, one with another live enrollment, one with an open balance, one linked to a converted lead); `supabase migration up --local`; assert the catalog manifest; run the data step dry, with a wrong count (raises, nothing changed), then with the right counts; post-conditions; revert; compare with the journal; rerun (no-op). Existing upgrade-to-current scripts move their ceiling to 128.
- **Concurrency (CI, the Python harnesses):** close against a placement into the same group (either the placement commits first and is ended by the second pass, or it is refused `course.closed`; never a live enrollment in a closed group, never a deadlock); close against « Ancien apprenant » on one of its learners; two closes of one group (one ends, the other replays).
- **Node (`npm test`):** helpers and error texts (`membershipActions`), pickers excluding closed courses, dashboard counts, the cache invalidation rules for the new commands, the guide content test.
- **Browser (local):** director closes a finished course from the card and from the group page; reception sees no close button; the closed group's page; reopen; the group form dates and One-to-One capacity.
- `npm run lint`, `npm run build`.

## Recovery

Order: **application first, then database.** The previous build works against 128 (it ignores the new columns and functions); the only difference it meets is the guard's refusal to place into a closed course or an undated short-programme group.

1. **Application:** redeploy the previous build.
2. **Database (only if needed, separate approval):** `scripts/rollback/128_course_dates_close_restore.sql` drops the four functions and the two triggers and restores the 125 bodies of the two re-created functions; it keeps the columns and the journal (dropping them is a separate decision).
3. **Data:** a director's close is undone with « Rouvrir le cours »; the one-time step with its revert script (its own approval).
- Local failures are diagnosed and fixed autonomously; Production failures stop and report.

# Expected modules

Database: `supabase/migrations/128_course_dates_close.sql` (provisional), `supabase/manual/course_close_backlog.sql`, `…_revert.sql`, `scripts/rollback/128_course_dates_close_restore.sql`. Application: `groups/page.jsx`, `groups/[id]/page.jsx`, `dashboard/page.jsx`, `membershipActions.mjs`, `EnrollmentModal.jsx`, `StudentForm.jsx`, `receiptGroupChoices.mjs`, `LegacyPlacementEditor.jsx`, `attendance/page.jsx`, `timetable/page.jsx`, `teacher-portal/page.jsx`, `assessments/page.jsx`, `reportData.mjs`, the guide (`GuideContent.jsx`, `HelpdeskNav.jsx`, screenshots). Tests and docs as listed.

# Owner decisions required

Each has a recommendation; none is decided until the owner answers.

**Q1 — Which programmes require dates, and existing groups without dates.**
- **A (recommended):** required for Mise à niveau, Adults, Summer Camp and One-to-One on creation and on a change into one of these programmes, never cleared; an existing group of these programmes without dates keeps its learners but refuses any new placement until its dates are entered (« Renseignez les dates du cours »). Yearly, Other and the Communication programmes: optional. Consequence: the director enters the dates of the short groups counted at R0 (B2) right after the release; no guessed data.
- **B:** required only when a group is created. Consequence: existing short groups may never get dates and never appear on the card.
- **C:** required for every in-person programme, Yearly included. Consequence: every Yearly group must be edited.

**Q2 — Yearly groups.**
- **A (recommended):** dates optional; without them the end used by the finished-course list is 31 August of the group's school year (computed, not stored); « Clôturer l'année » stays the normal close for Yearly, and a Yearly group with real dates appears on the card like any course.
- **B:** the migration writes 1 September – 30 June into every Yearly group. Consequence: a data change on every Yearly row and a guessed end date.

**Q3 — Date window against the group's school year.**
- **A (recommended):** both dates between 1 June of the first year and 31 August of the second (the window of the EAP « paid elsewhere » rule), end on or after start. Consequence: a summer Mise à niveau before September fits the coming year.
- **B:** strictly 1 September – 31 August. Consequence: a course taught in late August for the coming year must be filed under the ending year.

**Q4 — One-to-One.**
- **A (recommended):** an in-person One-to-One is a course of capacity 1 with its own dates (one group per learner and period, neutral name without the learner's name), placed and closed like any course — the model Online One-to-One already follows (capacity 1, term dates). Consequence: one more group per individual learner; teachers, attendance and the close work unchanged.
- **B:** no group; the enrollment carries its own dates and a per-learner close. Consequence: new enrollment columns, a second close path, attendance without a group is not possible today.
- **C:** unchanged: One-to-One learners are ended one by one with « Ancien apprenant ».

**Q5 — Who closes a course and sees the card.**
- **A (recommended, per the direction):** director only, like « Clôturer l'année ». Consequence: admin sees the dates and the closed state but cannot close.
- **B:** director and admin, like « Ancien apprenant » and the online close.

**Q6 — Closing before the end date.**
- **A (recommended):** refused; to stop a course early the director first moves its end date (a logged edit), then closes the next day. Consequence: one rule decides when a course is over, and attendance up to the end date stays correctable in the database.
- **B:** allowed with a reason. Consequence: attendance of the remaining sessions can no longer be recorded.

**Q7 — State of a closed course.**
- **A (recommended):** a closed mark on the group: placement refused on every path, hidden from pickers, attendance, timetable, teacher and assessment selects, reports and « Groupes actifs »; listed under « Clôturés » with its past learners, read-only; core fields frozen until reopened.
- **B:** no mark; only the enrollments end and the group can be reused. Consequence: a finished group keeps appearing everywhere and can be refilled by mistake.

**Q8 — Undoing a close.**
- **A (recommended):** « Rouvrir le cours » (director) clears the mark and restores exactly the enrollments that close ended, when each is unchanged since; others are reported and left ended.
- **B:** only clear the mark; each learner is reopened and placed again by hand.

**Q9 — Online courses.**
- **A (recommended):** keep their dates and their own « Clôturer »; list them on the card once past their term end; the new guard also refuses placement into a closed online course (closes the second half of Batch D follow-up 2). Consequence: one card for every finished course; no change to the online close.
- **B:** the card and the guard ignore online courses.

**Q10 — Teachers and past rosters after a close.**
- **A (recommended):** staff see the past learners on the closed course's page; teacher rosters, access and assessments stay membership-based. No teacher is assigned to any group yet (Batch D follow-up 5); teacher read of closed courses becomes a follow-up together with Batch D follow-up 2 (past online rosters).
- **B:** give teachers read-only access to their closed courses now. Consequence: changes to the 123 teacher projections and a wider security review.

**Q11 — Timing of the one-time step.**
- **A (recommended):** after migration 128, in the same release window, journalled in the new `maintenance.course_close_journal`. Consequence: one review and one release; the 38 stays visible until then.
- **B:** earlier, before the feature, through the live Batch D leaver core, journalled in the existing `maintenance.egc_cleanup_log` under a new step name, with its own reviewed script and revert. Consequence: the 18 end sooner, at the cost of a second Production operation.

**Q12 — Which backlog programmes the step ends.**
- Mise à niveau (18), reason « Mise à niveau terminée »: in the step, per the direction.
- Adults (10) and One-to-One (2 in-person + 1 online): **A (recommended):** in the step only for a programme the owner confirms entirely finished at R0b (T11 shows the enrollment months); otherwise the director handles them one by one after the release (« Ancien apprenant », or placement into a dated course that is closed when it ends). **B:** include them now.
- Yearly (7): never; they need a group.

**Q13 — Reopening a row ended by the step or by a course close.**
- **A (recommended):** allowed, like any ended paid enrollment (« Rouvrir l'inscription », director/admin, back to « Inscrit — groupe à affecter », listed in Contrôles when unpaid).
- **B:** never reopenable (as the EAP archive, Q11 there). Consequence: a learner returning to the same programme and year would need a new enrollment and payment.

**Approval record.** None yet. The owner approves an exact revision after independent plan review; implementation, the R0 count, the migration, the data step, the merge and the deployment each need their own approval.

---

## IMPLEMENTATION CONTRACT

### Scope

Deliver D1–D8 with the owner's answers to Q1–Q13 (which stand only once the plan is approved). The implementer may not widen scope to the leaver core, `close_school_year`, `online_close_course`, `place`, capacity, the year guard, membership, finance, CRM or teacher projections.

### Prerequisites

1. Owner approval of this revision with Q1–Q13, recorded in the approval record and in [OWNER_DECISIONS](../../ai/OWNER_DECISIONS.md); implementation itself authorized separately.
2. Fresh `origin/main`; the next migration number re-verified (provisionally 128); `save_receptionist_group` and `crm_enrollment_groups` (125), `end_group_enrollments`, `leave`, `end_enrollment` and `close_school_year` (120), `place`/`place_learner_in_group` and `reopen_enrollment` (127), `guard_enrollment_group_year` and `guard_group_year` (125) re-read with `pg_get_functiondef` on a local database and compared with the bodies cited. A difference is a stop condition.
3. Local Supabase, synthetic data, external e-mail disabled, a dedicated feature branch.
4. No Production read or write by the implementation task.

### Object / module manifest

**Migration `128_course_dates_close.sql` (provisional):** `alter table public.groups add column date_debut date, add column date_fin date, add column closed_at timestamptz, add column closed_by uuid` with `groups_course_dates_order`; `academic_security.guard_course_group()` + trigger `groups_course_guard`; `academic_security.guard_course_placement()` + trigger `enrollment_course_guard`; `maintenance.course_close_journal` (RLS on, all privileges revoked from `public`, `anon`, `authenticated`, `service_role`); `public.list_courses_to_close()`, `public.close_course_preview(uuid)`, `public.close_course(uuid, integer, text)`, `public.reopen_course(uuid, timestamptz)` (grants as in Security boundaries); `create or replace` of `public.save_receptionist_group(uuid, timestamptz, jsonb)` and `public.crm_enrollment_groups(text, text, integer, integer)` from their 125 bodies; `notify pgrst, 'reload schema'`. Identical owners, security modes, `search_path` and ACLs for every untouched function (snapshot-compared). Conflicts raise `PT409` (ADR-009); no `40001`.

**Data scripts, committed and not run:** `supabase/manual/course_close_backlog.sql`, `supabase/manual/course_close_backlog_revert.sql`; `scripts/rollback/128_course_dates_close_restore.sql`.

**Application, tests, docs:** as listed above.

### Invariants

- Nothing ends automatically; every close is a director command on a course whose end date has passed (or the separately approved one-time step).
- A close ends only live enrollments of that course, through the Batch D leaver core; files become Alumni only when nothing else is live; charges, receipts, payments, attendance, CRM conversions and the lifecycle outbox are untouched.
- No enrollment enters a closed course (in-person or online) by any role or path, except the two-flag restore and « Rouvrir le cours ».
- The closed mark changes only inside the two commands.
- A repeated close of a closed course returns the original result and writes nothing; a stale count raises `PT409`.
- Placement, capacity, the year check, one live enrollment per programme and year, membership from enrollments and every role's other capabilities are unchanged.
- Production SQL, the data step and the deployment happen only by explicit release approval, in the order R0–R6.

### Acceptance / tests

1. The CI SQL suite, the 127 → 128 rehearsal (data step, wrong count, revert, no-op) and the concurrency cases pass; the ACL snapshot equals 127 for every untouched function; exactly the manifest in the catalog diff.
2. The director closes and reopens a course in the browser; reception and admin (Q5 = A) have no close; closed courses are absent from every picker and select listed in D4; the card and « Groupes actifs » counts are right.
3. Dates and One-to-One rules work from both the reception RPC and the management form.
4. Guide updated and its content test passes; `npm run lint`, `npm run build`, changed-Markdown checks clean.
5. The PR lists the migration filename, the Q1–Q13 options applied, any deviation and the Production steps deferred to the release task.

### Stop conditions

Stop and report if: a function's latest definition differs from the cited body; an ACL snapshot differs; an existing EGC, EAP, online or finance test fails for a reason other than the planned rules (closed course, undated short group); the close cannot be shown deadlock-free against placement; the data step cannot be rehearsed with a revert that restores its journal; the owner changes a decision; Production access, credentials or data would be needed.

### Docs / status reporting

Report per [AGENTS](../../../AGENTS.md#implementation-handoff) with branch, head SHA, PR, tier rationale, checks tied to the SHA, self-check, plan revision, migration filename and unresolved decisions. Independent review is mandatory (Tier 3).
