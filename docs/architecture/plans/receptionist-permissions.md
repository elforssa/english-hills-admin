# Receptionist permissions — one capability list, revision RPW-r2

**Status: APPROVED; RELEASED 2026-11-22, R5 PENDING** (approved by Maroine, 2026-11-21, RPW-r1 at head `08881a1` with N1 = B and N2 = A, recorded here as RPW-r2; see the [approval record](#approval-record-2026-11-21)). **RELEASED 2026-11-22** (R0–R4): migrations 131–135 applied 09:06:35 UTC, PR #204 merged as `5764504` and deployed at 09:08:41 UTC, following the owner's release order of 2026-11-21 ([release and recovery](#release-and-recovery), [release record](#release-record-r0r4--2026-11-22)). **R5 pending** (owner and receptionist, Monday 23/11); the plan moves to completed after R5. Tier 3 (roles, RLS, a security-definer command set, the e-mail route). Delivery is **one pass**: one plan, one implementation branch, one independent review, one release, built in five stages with a commit and passing tests after each.

Baseline: `origin/main` `53c486b` (PR #202, migrations to 130). Evidence: the [role permissions audit](../evidence/role-permissions-audit-2026-11-14.md) (read-only, Production read 2026-11-14 at `9f0c911`), re-checked against `53c486b` for this revision by reading the repository only (no database, no Production). Decision record: [ADR-018](../decisions/ADR-018-one-capability-list.md) (proposed).

## Revision history

| Revision | Date | Change |
| --- | --- | --- |
| RPW-r0 | 2026-11-14 | Unfinished draft: approach (b) recommended, table A partial, seven owner questions. The authoring session stopped at its usage limit. |
| RPW-r1 | 2026-11-20 | Rebased on `53c486b`; every file reference re-checked (section "Verified current state"). Rows 18, 19, 24, 25 and leave requests traced and added. The owner's answers of 2026-11-20 applied (item 2, leave requests, recipients, office messages, « charge enseignants », items 3 + 7, certificates, item 8 dropped, item 13 in the groups stage). Items 20–22 moved out of this pass (online-classes Production test, week of 23/11). Owner summary, locked list per layer, test plan, release and recovery, ADR-018 and the implementation contract written. Two new owner questions. |
| RPW-r2 | 2026-11-21 | Owner approval recorded: N1 = B (no separate test database exists; the full suites run on the local build of the exact reviewed commit, the preview only for checks that change nothing), N2 = A. The two screen-only limits accepted for now. Her first real family invitation waits for the e-mail-links R4 test (a). Follow-ups F5 and F6 added. |

---

# Owner summary

## What will change

The receptionist moves to the admin's pages and commands for daily work. What she may and may not do is written in **one list** (`src/lib/roleAccess.mjs` for pages, `operational_security.has_capability` for the database), kept identical by a test. Her separate forms and receptionist-only page branches go away where her access becomes the admin's.

Five stages, one release, before the online-classes Production test (owner decision of 2026-11-21; the test was first planned for the week of 23/11):

1. **The shared list.** No behaviour change for anyone. Her online and teacher-portal access is copied into the list exactly as it is today and pinned by a test.
2. **Groups:** move a child to another level, change the level of an unplaced paid enrollment, full group and no-paid-enrollment placements with a logged reason, enrollment date and notes; « Complet » in the pickers, French errors, a clear message when there is no other group; every capacity change logged.
3. **Dossier, families, learning and teaching:** group at creation, programme / level / source, learner and parent e-mail (logged), pick-up adults, « Sortie des jeunes », « Ancien apprenant », reopen an enrollment, grades, portfolios and learning profiles, certificates (view), add a teacher, teacher e-mail and notes, leave requests (view).
4. **Communication, money views, dashboard and reports:** messages, notifications and announcements (office only), placement-result e-mail, unpaid list shortcut, payment notes, Dashboard and Reports without finance.
5. **Portal invitations:** invite a parent or student from the dossier, revoke a link.

## What staff/users will be able to do

- **Receptionist:** everything in the stages above, from the same pages the admin uses.
- **Admin and director:** nothing new except two things built for every staff role because no page had them: the pick-up adults editor on the dossier (item 4) and a log entry for every learner or parent e-mail change (item 3). Every capacity change is logged for every role (C2-1).
- **Teachers, parents, students:** unchanged. A family's reply to a message the receptionist sent now reaches the office (today it would fail).

## What remains restricted

- **Destructive:** deleting anything (groups, placement tests, attendance rows, grades, portfolios, learning profiles, certificates, messages, announcements, « Sortie des jeunes » entries), archiving a learner or teacher, restoring, « Clôturer l'année », closing or reopening a course, correcting, voiding or deleting receipts and charges. Removing a pick-up adult is the one removal she gets (owner item 4).
- **Finance:** finance dashboard, monthly totals, « Contrôles », deletion history, any centre-wide money total, payroll, teacher pay fields, teacher lesson counts, the « charge enseignants » report, the cancellation reason on a receipt.
- **Security and data:** inviting staff (teachers included), linking a teacher to a login, changing any role, centre settings, CSV import and export, activity log, free-typed outside e-mail addresses, family ↔ teacher conversations, issuing a certificate, approving or refusing leave.
- **Online lessons and the teacher portal:** exactly as today at every layer (she sees courses and lessons, moves or cancels one lesson, adds guests, records consent and attendance; she cannot set up courses, move « this lesson and the following ones », withdraw consent, see counts or usage, join a room, or open the teacher portal). Items 20–22 are a follow-up after the online test.
- Everything director-only stays director-only. Her 7-day back-dating limit and discounts of any size with a reason stay as they are.

## UI impact

- Menu gains for her: Tableau de bord, Rapports, Sortie des jeunes, Demandes de congé, Portfolios, Certificats, Profils d'apprentissage, Communication, Notifications. Her home stays `/crm/leads`.
- She uses the admin learner form, the admin enrollment dialog, the admin grades page and the admin teacher form with the pay fields hidden. `ReceptionistStudentForm`, `ReceptionistTeacherForm` and `ReceptionistAssessments` are retired.
- Every locked action is absent for her: no button, menu item or page that ends in an error.
- Page text that sends her to the direction for things she can now do is rewritten (dossier, `/helpdesk` guide).

## Database impact

- Migrations **131–135**, one per stage (renumbered before merge if another branch takes a number first).
- `has_capability` gets the full list (stage 1) and new names per stage; shared commands ask for a capability instead of `director/admin`.
- Policies: the blanket `receptionist_deny` on eight tables becomes a read policy plus the write rights listed in table A, with a restrictive delete deny kept.
- New: a capacity-change log trigger on `groups`, an e-mail-change log trigger on `students`, a `channel` column on `messages` (office or portal), a staff-recipient list function. No table is dropped, no data is rewritten except the `channel` backfill.
- One restore script reverses all five migrations in one step.

## Important security decisions

1. Routes stay an **allowlist**: a new admin page stays closed to her until listed.
2. Every function executable by `authenticated` must be classified (open to reception / locked) in a test fixture; an unclassified function fails CI. Every policy naming the receptionist is in a manifest; a difference fails CI.
3. `students`, `teachers` and `groups` keep definer commands with fail-closed key allowlists for her: archive mark and pay fields are never in them.
4. Portal invitations do **not** widen `role_security.assert_transition` (it also drives `change_user_role`): a separate family-only check is added.
5. Her online access is reproduced, not changed: no `online_*` function, policy, route or online capability changes; a test pins them to today's values.

## Risks / owner review points

- **Default opening.** With (b), a future admin feature that reuses an existing capability opens to her automatically. The route allowlist and the function classification test are the guards.
- **Screen-only limits that are already data-readable today** (unchanged by this plan): she can already read every charge and receipt row (so "no centre totals" is a screen rule), and group rows carry `teacher_id` (so « charge enseignants » is a screen lock). Making those data boundaries would be a separate, larger change.
- **A teacher she creates has no contract type or pay**; an admin completes them. How payroll treats an empty contract type was not verified (stage 3 checks it).
- **Her e-mail change on the receipt form stays refused** (a finance function is not touched); she corrects the e-mail on the dossier, and the receipt form says so in French.
- **Preview database** (N1 = B): no separate test database exists; a preview would run against Production without 131–135. The full suites run on the local build of the exact reviewed commit; the preview is used only for checks that change nothing.
- **Portal invitations:** the e-mail-links fix (PR #190, plan PR #188) is released, but its Production proof R4 was postponed by owner decision; CURRENT_STATE says the owner runs R4 test (a) before the first real family invitation. That still applies to her first invitation.

---

# Verified current state (at `53c486b`)

## Baseline and evidence limits

- Repository only. No database, Production or browser was used for RPW-r1. Live facts (account counts, group occupancy) are the audit's, as of 2026-11-14.
- Migrations 129 and 130 change only online objects (`online_issue_join`, `online_resolve_join`, `online_get_course`, new pass, session-evidence and usage functions, two tables with no `authenticated` grant). They redefine nothing this plan builds on.
- `operational_security.has_capability`, `require_capability` and `require_receptionist` are unchanged since `096_receptionist_operational_permissions.sql:7-34`. The schema is revoked from `authenticated` (096:5, :53): policies cannot call it, so policies keep role predicates (`(select get_my_role())`, ADR-013) and the policy manifest test ties them to the list.
- PR #188 is the e-mail-links **plan**; its implementation is PR #190, merged `87ab19e` and deployed 2026-11-14, with the four Production templates replaced. Stage 5 may be planned and built.

## Reference re-check (RPW-r0 and audit → `53c486b`)

All citations were re-read. Every one not listed here is unchanged.

| Citation | Now |
| --- | --- |
| `src/middleware.js:113` (API skip) | `:116-121` |
| `src/middleware.js:128-161` | `:133-167` (role read `:133-142`, director paths `:144-149`, pending `:151-158`, receptionist allowlist `:160-167`) |
| `src/app/api/admin/invite/route.js:43-50` | `:69-77` (Gate 2, `PRIVILEGED_ROLES` at `:9`); the family path calls `prepare_family_invitation` at `:116` |
| `online/[id]/page.jsx:263-306`, `:330` | `:264-307`, `:331` |
| `online/page.jsx:82` (teacher counts) | `:165`; new management-only `:142` status line and `:166` usage minutes |
| Audit "join a room — receptionist: Yes" | **Wrong.** `online_issue_join` (129:40) admits her role, but `online_security.evaluate_join` (117:778) answers `not_eligible`; `scripts/test-online-learning.sql:327` asserts it. "Unchanged" includes this refusal. |
| Audit "online_* (6 tables)" | 10 tables; the 4 new ones have RLS on and no `authenticated` grant. |
| "about 185 role tests in 50 files" | 163 role-name comparisons in 48 files; of these, 43 receptionist tests in 21 files, plus `isReceptionist` (3, `EnrollmentModal.jsx`) and 7 `[...'receptionist'...].includes`. |
| RPW-r0 C3-3: "`test-receptionist-browser.mjs:201` asserts the old same-level rule" | **Corrected.** Line 201 checks the receipt form's group select, where level and group are chosen together; it stays valid. The move rule needs a **new** assertion in the enrollment dialog. |

## Capability maps today

- **JS** (`src/lib/roleAccess.mjs:8-41`), 29 capabilities: 13 operations + own account, 12 management, 3 director-only. Online: `canManageOnlineLessons` (operations, `:24`), `canManageOnlineCourses` (management, `:25`).
- **SQL** (`096:7-22`), 23 capabilities: 12 operations, 8 management, 3 director. Only `assign_group`, `manage_finance_operations` and `manage_teacher_operations` are called by function bodies.
- **Receptionist routes** (`roleAccess.mjs:48-66`): exact paths `/crm/today`, `/crm/leads`, `/placement-tests`, `/students`, `/students-directory`, `/students/new`, `/groups`, `/timetable`, `/attendance`, `/assessments`, `/receipts`, `/receipts/new`, `/teachers`, `/settings`, `/helpdesk`, `/online`; UUID patterns for students (and edit), groups, teachers (and edit), receipt print, `/online/<id>`, `/online/room/<id>`.
- **Receptionist-only commands** (`require_receptionist()`): `save_receptionist_student` 120:1019, `save_receptionist_enrollment` 127:702, `assign_receptionist_student_group` 120:979, `save_receptionist_group` 128:747, `save_receptionist_teacher_operations` 119:1892, `append_receptionist_enrollment_document` 119:462, and four retired Premium commands (Premium Release B, separate).

## Online and teacher portal: the state to reproduce

| Layer | Receptionist today |
| --- | --- |
| Routes | `/online`, `/online/<id>`, `/online/room/<id>` allowed; `/teacher-portal`, `/teacher-portal/online[/<id>]`, `/parent-portal*`, `/student-portal*` refused |
| JS | has `canManageOnlineLessons`; lacks `canManageOnlineCourses` (pinned by `scripts/test-navigation.mjs:115,117`; room route pinned by `scripts/test-middleware-security.mjs:114`) |
| Server handlers (`src/lib/online/handlers.mjs`) | lesson cancel/reschedule allowed (`:174`); course activate/close (`:138`) and status (`:103`) refused; join decided by the database (`:60`) |
| SQL allowed | `online_list_courses`, `online_get_course` (130:138), `online_update_lesson` except scope `following` (125:236), `online_cancel_lesson`, `online_add_guest`, `online_remove_guest`, `online_record_consent`, `online_save_attendance` |
| SQL refused | `online_save_course`, `online_save_pattern`, `online_set_lesson_teacher`, `online_activate_course`, `online_close_course`, `online_revoke_consent`, `online_teacher_lesson_counts`, `online_usage_month`, `online_room_status`, teacher and family functions; `online_issue_join` / `online_check_join` answer `not_eligible` |
| RLS | `online_staff_read` (select, director/admin/receptionist) on the six original online tables (124:503-528); no write policies |

---

# Owner decisions applied

**2026-11-14 (initial list, 26 items)** as recorded in the RPW-r0 draft, with the owner rule: everything the admin can do except destructive actions and finance; when in doubt, give it to her.

**2026-11-20 (answers to "Ask Maroine", Maroine):**

| Question | Answer applied |
| --- | --- |
| Item 2 | The admin rule: blocked only while the learner is in a group (`guard_student_membership`, 120:346). The admin rule does not change. |
| Teacher leave requests | She views them. Approving or refusing stays admin. |
| Who she writes to | Families, teachers and staff, chosen in the app. No free-typed outside address. |
| Which messages she sees | The office's messages only. Family ↔ teacher conversations stay admin. |
| « Charge enseignants » | Pay-related: locked, like teacher lesson counts. |
| Items 3 + 7 | Accepted. Every e-mail change on a dossier is logged (who, when, old → new). |
| Certificates | She views them. Issuing stays admin (cannot be undone, e-mails the family). |
| Item 8 (portal previews) | Dropped from this work: the previews show nothing even for the admin. Follow-up F2. |
| Item 13 | In the groups stage. |
| Items 20–22 | Out of this pass because of the online-classes Production test. Follow-up F1. Her online access stays exactly as today. |
| Delivery | One plan, one branch, one independent review (stage by stage against table A), one release, before the online test (owner, 2026-11-21; first planned after it). Migrations from 131. |

---

# Scope and non-goals

**In scope:** items 1–7, 9–19, 23–26 as amended above; leave requests (view); bugs C1-1, C1-2, C1-3, C2-1, C3-3/C3-4 (docs, tests, page text); the shared list, its parity test, the function classification test, the policy manifest and the online pin test.

**Not in scope:** items 8 and 20–22 (follow-ups); attendance notes (B12, owner); making "no totals" or « charge enseignants » a data boundary; revoking the retired receptionist commands (follow-up F3, after a compatibility week); Premium Release B; any change to `src/lib/online/**`, `src/components/online/**`, `src/app/(admin)/online/**`, `src/app/(admin)/teacher-portal/online/**`, `src/app/api/online/**`, `src/app/api/webhooks/online/**`, the room CSP in `next.config.mjs`, any `online_*` function or policy; any change to an admin or director outcome other than the two new staff features and the two logs named in the owner summary.

---

# Design

## The shared list (stage 1)

Approach **(b)** from RPW-r0, unchanged: she uses the admin pages and commands; the exceptions live in one list.

| | (a) Widen her own commands and branches | (b) Admin pages and commands, one list |
| --- | --- | --- |
| Receptionist-only SQL commands at the end | 10 today, about 12 more | 3 (`save_receptionist_student`, `save_receptionist_teacher_operations`, `save_receptionist_group`), widened |
| Page branches on her role | 53 today, growing | replaced by `hasCapability` |
| Separate forms | stay | retired |
| A fix on the admin path reaches her | no (audit C3-6) | yes |
| Main risk | drift between twin paths | a future admin feature opens to her by default |

**Shape of the list.** `src/lib/roleAccess.mjs` exports one table, `CAPABILITIES`, each entry `{ sql: '<snake_case name>', roles: [...] }` keyed by the JS name (for example `canAssignGroup: { sql: 'assign_group', roles: OPERATIONS }`). `hasCapability` reads it. Names that already exist keep their spelling on both sides (`canEditTeacherOperationalFields` ↔ `edit_teacher_operations`); the `sql` field is the link, not a naming rule.

**Stage 1 changes no outcome.** Migration 131 re-creates `has_capability` with today's 23 entries **plus** SQL mirrors of the JS-only names (`import_students`, `export_students`, `edit_student_programme`, `manage_online_lessons`, `manage_online_courses`, `view_help`, `manage_own_account`) with today's roles; the JS side gains `canManageAdmissions` ↔ `manage_admissions`. It adds `operational_security.capability_names()` (no grant) for the parity test. Every existing name answers exactly as before (snapshot test).

**Tests that hold the list together (all new, wired into Verify):**

1. **Parity** (`scripts/test-capability-parity.mjs`, local database as `postgres`): for every JS entry and each of the seven roles, `has_capability(role, sql)` equals the JS answer; every SQL name has a JS entry and the reverse.
2. **Function classification** (`scripts/fixtures/receptionist-function-classification.json` + `scripts/test-receptionist-function-classification.mjs`): every function in `public` executable by `authenticated` is listed as `open` or `locked` (with the expected refusal). A new or missing function fails.
3. **Policy manifest** (`scripts/fixtures/receptionist-policy-manifest.json`): every policy whose definition names the receptionist role, with its command and permissive/restrictive mode. Any difference fails.
4. **Online pin** (`scripts/test-receptionist-online-pinned.mjs`): the role array in every `online_*` function body (read with `pg_get_functiondef`), the `online_staff_read` policy text, the two online JS capabilities' role lists and the three online route patterns equal the values recorded at `53c486b`; the receptionist reaches no `/teacher-portal` route.

The online `require_role(...)` arrays are **not** rewritten to call `has_capability`; the pin test is what "reproduces" them.

## A. Table

Columns: **Stage**, the action, today, after, then the change per layer (UI / route / menu, JS capability, SQL function, RLS), then files. "ops" = director, admin, receptionist; "mgmt" = director, admin.

| # | Stage | Action | Today | After | UI / route / menu | JS capability | SQL function | RLS | Files |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 9 | 2 | Move to a group of another level (same programme and year) | page filter only | allowed | she gets the management branch of the dialog (level selector, all open groups of the programme and year); `isReceptionist` branch removed | `canAssignGroup` (has it) | page calls `save_enrollment_changes` + `place_learner_in_group` as the admin does (`EnrollmentModal.jsx:80-110`) | none | `EnrollmentModal.jsx:29-33,117-128`, `groups/[id]/page.jsx` |
| 10 | 2 | Level of a paid, unplaced enrollment | refused | allowed | same dialog | new `canEditEnrollment` (ops) | `save_enrollment_changes` (127:818): role test → `require_capability('edit_enrollment')`; its status/programme refusals stay for everyone | none | same |
| 11 | 2 | Full group, reason logged | refused | allowed | reason field by capability; picker shows « Complet » (C1-1) | new `canOverrideCapacity` (ops) | `academic_security.place` (127:1101): receptionist refusal → `has_capability('override_capacity')`; same reason rule and log | none | same |
| 12 | 2 | Group without paid enrollment, reason logged | refused | allowed | reason field; group-page picker stops greying her learners out | new `canPlaceWithoutPaidEnrollment` (ops) | `place` (127:1085): same, capability `place_without_paid_enrollment` | none | same, `groups/[id]/page.jsx:140-154,440` |
| 13 | 2 | Enrollment date and notes | hidden + refused | allowed | fields shown | `canEditEnrollment` | as 10 | none | `EnrollmentModal.jsx:210-217` |
| 1 | 3 | Group while creating the learner | separate form | admin form | `StudentForm` for her; `ReceptionistStudentForm` retired; transport by capability | `canPlaceWithoutPaidEnrollment` | create through `save_receptionist_student`, then `place_learner_in_group` | none | `students/new/page.jsx`, `StudentForm.jsx:64,216` |
| 2 | 3 | Programme, level, source on the dossier | refused | allowed while the learner is in no group (the admin rule) | inline selects and form fields | `canEditStudentProgramme` → ops | `save_receptionist_student` (120:1019): update keys + `session_type`, `niveau_cefr`, `referral_source` and the `valid_session_level` check (120:1031); `guard_student_membership` (120:346) unchanged applies the admin rule | none | `students/page.jsx:155,455,466`, `StudentForm.jsx` |
| 3 | 3 | Learner or parent e-mail | read-only | allowed while no active or pending family link exists for that address; every change logged | fields editable; French refusal otherwise; receipt form maps its refusal to « Corrigez l'e-mail depuis le dossier » | new `canEditStudentEmail` (ops) | `save_receptionist_student`: keys `email`, `parent_email` + definer check on `family_links` (123:65-84: same learner, matching relation, status active or pending, profile e-mail or `invite_email` = old address); **new** `students_email_change_log` trigger (all roles) writes an `activity_log` row: who, when, column, old → new. `create_charge_payment_financial` untouched | none (log written by definer trigger) | `StudentForm.jsx`, `ReceiptForm.jsx` |
| 4 | 3 | Pick-up adults: add, edit, remove | read only for everyone (no editor exists, even for the admin) | editor on the dossier for every staff role | new section editor (add, edit, remove with confirmation) | new `canManageAuthorizedAdults` (ops) | none | `authorized_adults`: drop the three receptionist write denies (096:58-65, 124:242-253), add receptionist write policy | `students/[id]/page.jsx:334-348` |
| 5 | 3 | « Sortie des jeunes »: record and view | closed | allowed, no delete | menu (`Sidebar.jsx:39`), route `/dismissal` | new `canRecordDismissal` (ops) | `enforce_dismissal_integrity` (125:345): insert role list + receptionist | `dismissal_logs`: `receptionist_deny` → read + insert, restrictive update/delete deny | `dismissal/page.jsx` |
| 6 | 3 | « Ancien apprenant », reason required | hidden + refused | allowed | button by capability; « Archiver » stays hidden | new `canEndLearner` (ops) | `end_learner` (120:686) → `require_capability('end_learner')` | none | `students/[id]/page.jsx:220` |
| 14 | 3 | Reopen an ended enrollment | hidden + refused | allowed | button by capability | new `canReopenEnrollment` (ops) | `reopen_enrollment` (127:882) → capability | none | `students/[id]/page.jsx:306` |
| 16 | 3 | Grades, no delete | read only | add, edit | admin page for her; `ReceptionistAssessments` retired; delete and CSV export hidden | new `canManageGrades` (ops); `canDeleteAcademicRecords` stays mgmt | none | `assessments`: drop insert/update deny, keep delete deny, add write policy | `assessments/page.jsx:140-147` |
| 17 | 3 | Portfolios and learning profiles, no delete | closed | create (no edit page exists for anyone) | routes + menu (`Sidebar.jsx:70-75`); trash buttons by `canDeleteAcademicRecords` | new `canManageLearningRecords` (ops) | `storage_security.can_write` (123:1438) and `resolve_storage_asset` (123:1392): add purpose `portfolio` to her branch | `portfolios`, `learning_assessments`: `receptionist_deny` → read + insert, restrictive update/delete deny | `portfolios/page.jsx:82,171,198`, `learning-assessments/page.jsx:55,154,180` |
| 17c | 3 | Certificates: view only | closed | view and print | route + menu; « Nouveau certificat » (`:194-196`) and both trash buttons (`:213,237`, ungated today) hidden for her | new `canViewCertificates` (ops), `canIssueCertificates` (mgmt) | none (issuing is a direct insert + `Core.SendEmail`) | `certificates`: `receptionist_deny` → read, restrictive insert/update/delete deny | `certificates/page.jsx` |
| 18 | 3 | Add a teacher (record only, no login) | closed | allowed | route `/teachers/new`, menu, add button (`teachers/page.jsx:48`); admin `TeacherForm` with contract, salary/rate and IBAN hidden (`:102-113`) | new `canAddTeacher` (ops); `canViewTeacherCompensation` stays mgmt | `save_receptionist_teacher_operations` (119:1892): a null id creates; allowlist name, phone, e-mail, certifications, levels, notes, photo; never pay fields | `teachers` unchanged (deny stays; definer command) | `teachers/new/page.jsx`, `TeacherForm.jsx:30-34,64,70,94-97` |
| 19 | 3 | Teacher e-mail and notes | read only | allowed; e-mail only while no login is linked and no invitation is pending (N2 = A) | admin form for her, pay fields hidden; `ReceptionistTeacherForm` retired | `canEditTeacherOperationalFields` (has it) | same command: keys + `email`, `notes`; `get_teacher_operations` (096:114) returns `notes` (drop, re-create, re-grant) | none | `teachers/[id]/edit`, `teachers/[id]/page.jsx:48-49` |
| 18p | 3 | Teacher photo | refused by storage | allowed (not pay) | photo upload in the form | `canAddTeacher` | `can_write` (123:1446-1448): purpose `teacher_photo` for her | none | `TeacherForm.jsx:94-97` |
| L | 3 | Leave requests: view | closed | view only | route `/leave-requests`, menu (`Sidebar.jsx:65`); approve, refuse, delete, « Nouvelle demande » and edit dialog hidden; teachers loaded with `getTeacherOperations()` for her | new `canViewLeaveRequests` (ops), `canDecideLeaveRequests` (mgmt) | none | `leave_requests`: `receptionist_deny` → read, restrictive insert/update/delete deny | `leave-requests/page.jsx:81-84,113-125,148,199-230` |
| 15 | 4 | E-mail the placement result | refused | allowed (fixed template) | `role !== 'receptionist'` removed | new `canEmailFamilies` (ops) | `can_message_recipient` (123:1357, gate at :1366) → capability `email_families`; e-mail route `:84,:88` by capability; per-recipient check `:127` unchanged | none | `PlacementTestModal.jsx:113`, `api/email/send/route.js` |
| 23 | 4 | Messages, notifications, announcements: write to families, teachers, staff; read the office's messages (office ↔ family and her own, review decision 2026-11-21); no delete | closed | allowed as decided | routes `/communications`, `/notifications` + menu; pickers: learners (families), teachers (`get_teacher_directory`), staff (new `list_staff_recipients()`); manual-address option (`communications/page.jsx:155,170-173`, `notifications/page.jsx:97-123`) hidden for her; trash (`:258,:279`) hidden | new `canMessageOffice` (ops); `canMessageAnyAddress`, `canViewPortalConversations`, `canDeleteCommunications` (mgmt) | `messages.channel` (`office` / `portal`), set in `set_recipient` (123:1071) on insert and backfilled; `account_sees` (123:230) and `recipient_for` (123:1062) staff branch + receptionist, so replies to her messages resolve; new `list_staff_recipients()` (definer, names + e-mails of director/admin/receptionist profiles) | `messages`: deny → read where `channel = 'office'` (office ↔ family) or she is a party, insert with `can_message_recipient`; `notifications`, `announcements`: deny → read + insert; restrictive delete deny on all three and update deny on `notifications` and `announcements`; on `messages` an update policy limited to office rows, with a trigger refusing any column change other than `read` for her (marking as read) | `communications/page.jsx`, `notifications/page.jsx` |
| 24 | 4 | Unpaid list per learner, no totals | exists: `/students` « Reste à payer » filter (`students/page.jsx:357-365`, `search_students_page` `p_payment='due'`, 124:1117-1123) | shortcut | « À relancer » link on her CRM home to `/students?payment=due` | none | none | none | `crm/today` page |
| 25 | 4 | Payment notes on receipts | hidden | note shown; `void_reason` stays mgmt | `receipts/[id]/print/page.jsx:80-84`: note line by capability, cancellation reason by `canViewFinanceCorrections` | new `canViewPaymentNotes` (ops), `canViewFinanceCorrections` (mgmt) | none | none (row already readable, 124:960) | same |
| 26 | 4 | Dashboard and Reports without finance | closed | allowed | routes `/dashboard`, `/reports`, menu; dashboard skips `get_finance_charge_summary`, `get_monthly_finance_summary` and the receipt panel (`dashboard/page.jsx:98-102,169-176,205,292`); teacher count from `get_teacher_operations`; Reports skips `get_finance_year_months` and `report_payroll_by_teacher`, hides the finance and pay KPIs and panels (`reports/page.jsx:219-233,290,325`), « Charge des enseignants » (`AcademicOperationsReport.jsx:125-136`) and sources « Enseignants actifs » from `get_teacher_operations` | new `canViewDashboard`, `canViewReports` (ops); `canViewFinanceAnalytics`, new `canViewTeacherWorkload` (mgmt) | none | none | `dashboard/page.jsx`, `reports/page.jsx`, `reportData.mjs:107-122` |
| 7 | 5 | Invite parent / student from the dossier, revoke a link | Settings only, admin | button on the dossier, address from the dossier | « Inviter » in `FamilyLinksPanel` by capability; staff and teacher invitations stay hidden | new `canInviteFamily` (ops) | `preview_family_invitation` (123:805), `prepare_family_invitation` (123:837), `revoke_family_link` (123:1005): `require_manager()` → new `portal_security.require_family_inviter()`; **`role_security.assert_transition` not widened**; a family-only check in `portal_security.queue_role_invitation` (target role parent or student, address equal to the dossier's). `prepare_role_invitation`, `prepare_teacher_invitation`, `link_family_student`, `link_teacher_account` stay `require_manager()` | none | `FamilyLinksPanel.jsx:64`, `api/admin/invite/route.js:69-77,116` (Gate 2: her role accepted only for `parent`/`student` targets) |
| 8 | — | Portal previews | — | **dropped** (follow-up F2) | — | — | — | — | — |
| 20–22 | — | Online lessons | — | **out of this pass** (follow-up F1) | — | — | — | — | — |

## Bugs

| # | Stage | Fix |
| --- | --- | --- |
| C1-1 | 2 | Pickers (enrollment dialog, group page, receipt form) show « Complet » on a full group, counted as the server counts seats; choosing it opens the reason field (capability `canOverrideCapacity`). |
| C1-2 | 2, then each stage | `membershipErrorMessage` ends with `return error.message \|\| GENERIC` (`src/lib/academic/membershipActions.mjs`): the fallback becomes the generic French text, and two forms that toast `error.message` use it. Each stage lists the English refusals she can now reach and maps them (test: no ASCII-only English sentence reaches a toast in her browser suite). |
| C1-3 | 2 | No other open group of the programme and year: the dialog says so and the save button is disabled. |
| C2-1 | 2 | New trigger `groups_capacity_log` (after update of `capacite_max`, all roles and paths) writes an `activity_log` row: who, when, old → new. |
| C3-3, C3-4 | 2–5 | `docs/ai/SECURITY_RULES.md`, `scripts/test-receptionist-browser.mjs` (new move assertion; line 201 stays), dossier text `students/[id]/page.jsx:291` and the `/helpdesk` guide (`GuideContent.jsx`, non-online sections only) follow each stage. |

## Full locked list per layer (after the release)

Everything here is absent from her pages and refused if she types the URL or calls the API or the function.

**Routes (not in her allowlist):** `/finance`, `/finance/charges/<id>/edit`, `/receipts/<id>/edit`, `/receipts/<id>/delete`, `/receipts/deletions`, `/payroll`, `/students/import`, `/activity-log`, `/crm/analytics`, `/crm/integrations/lifecycle`, `/teacher-portal`, `/teacher-portal/online`, `/teacher-portal/online/<id>`, `/parent-portal`, `/parent-portal/online`, `/student-portal`, `/student-portal/online`; `/settings` with a query string (centre settings). Every new admin page until listed.

**JS capabilities she lacks:** `canManageOnlineCourses`, `canViewFinanceAnalytics`, `canManageUsers`, `canManageSystemSettings`, `canViewTeacherCompensation`, `canManagePayroll`, `canArchiveStudents`, `canImportStudents`, `canExportStudents`, `canManageTeacherHR`, `canDeleteAcademicRecords`, and new: `canIssueCertificates`, `canDecideLeaveRequests`, `canMessageAnyAddress`, `canViewPortalConversations`, `canDeleteCommunications`, `canViewTeacherWorkload`, `canViewFinanceCorrections`. Director-only: `canManageIntegrations`, `canViewMarketingAnalytics`, `canCorrectFinance`.

**API routes:** `/api/admin/invite` for any target other than parent or student; `/api/admin/payroll/*`; `/api/online/*` management actions as today (`handlers.mjs:103,138`); `/api/email/send` to an address `can_message_recipient` refuses.

**SQL functions (refuse her; latest definitions):**

- Director only: `close_course` 128:436, `close_course_preview` 128:381, `list_courses_to_close` 128:346, `reopen_course` 128:575, `close_school_year` 128:681, `close_school_year_preview` 128:644, `restore_student` 120:777, `list_archived_students` 120:794, `delete_mistaken_receipt` 122:255, `void_financial_receipt` 122:195, `void_financial_charge` 055:465, `get_finance_review_queue` 127:308, and the 29 `crm_security.require_reader(true)` functions plus `create_followup_policy` (125:694).
- Director or admin: `soft_delete_student` 120:936, `soft_delete_teacher` 041:82, `create_enrollment` 127:770 (refuses everyone), `change_user_role` 077:26 with `role_security.assert_transition` 077:12, `apply_pending_role` 123:922.
- Finance staff (`require_finance_staff`, 055:523): `get_finance_charge_summary`, `get_unpaid_charges`, `get_monthly_finance_summary`, `get_finance_year_months`; `get_referral_breakdown` (096:1059, finance page).
- Portal management (`require_manager`, 123:45): `prepare_role_invitation`, `prepare_teacher_invitation`, `link_family_student`, `link_teacher_account`.
- Kept receptionist limits: `search_students_page` page size 0 (CSV export, 124:1055); `create_charge_payment_financial` back-dating over 7 days (125:1407) and contact-identity change (125:1424).
- Online: every function in the "SQL refused" row of the online table above, unchanged.
- Storage: `can_write` / `resolve_storage_asset` purposes other than student photo, enrollment document, portfolio, teacher photo.

**Tables keeping the full `receptionist_deny`:** `activity_log`, `anon_rate_limits`, `app_config`, `financial_events`, `financial_requests`, `payroll`, `pending_roles`, `premium_homework_submissions`, `rate_limits`, `storage_asset_bindings`, `storage_assets`, `teachers`. **Delete stays denied** on `assessments`, `attendance`, `certificates` (all writes), `dismissal_logs`, `learning_assessments`, `leave_requests` (all writes), `messages`, `notifications`, `announcements`, `portfolios`, `receipts`, `charges`. `authorized_adults` is the one table where she may delete (item 4).

---

# Security boundaries

- Every new right is enforced in the database (capability check in a definer command, or a policy) and in the page; neither alone counts as done.
- Her definer commands keep `require_receptionist()`-style fail-closed key allowlists; unknown keys raise. Pay fields, archive marks and role fields are never accepted.
- New functions: `SECURITY DEFINER`, fixed `search_path`, revoked from `public`, `anon`, `service_role`, granted to `authenticated` only where the page calls them; `capability_names()` and the log triggers have no API grant.
- Conflicts keep `PT409` (ADR-009). Policies use `(select get_my_role())` once per statement (ADR-013).
- The e-mail route keeps its origin check, rate limit and per-recipient `can_message_recipient`; she never reaches an address outside profiles, learner and parent e-mails, and teachers.
- Online and teacher-portal access: no change at any layer (pin test).

---

# Stages, tests and commits

Each stage ends with a commit whose message names the stage, and with these passing on the branch (local stack, synthetic data, external e-mail off):

- `npm run lint`, `npm run build`, `npm test`, `npm run test:middleware`, `npm run test:navigation`;
- the new list tests (parity, classification, policy manifest, online pin);
- the stage's own SQL suite and `scripts/test-receptionist-browser.mjs` (extended per stage);
- because every stage touches `roleAccess.mjs` (and stages 1, 3–5 may touch `middleware.js` or the auth route), the **online** suites `scripts/test-online-learning-browser.mjs` and `scripts/test-online-room-lifecycle-browser.mjs`, `scripts/test-online-learning.sql`, and the **teacher-portal** suite `scripts/test-portal-readiness-browser.mjs` (with `scripts/test-portal-readiness.mjs`), all **unchanged** (no edit to those files in this branch);
- the Batch G before/after equivalence harness (`scripts/test-speed-as-the-centre-grows-local.mjs`) for director, admin, teacher, parent and student: no difference except the two staff features and logs listed in the owner summary.

| Stage | Migration | Content | Stage-specific tests |
| --- | --- | --- | --- |
| 1 | `131_capability_list.sql` | `has_capability` full list, `capability_names()`; `roleAccess.mjs` `CAPABILITIES` table; no outcome change | parity, classification, policy manifest, online pin; snapshot: every existing `(role, capability)` answer identical |
| 2 | `132_receptionist_groups.sql` | items 9–13, C1-1, C1-2, C1-3, capacity log | `scripts/test-receptionist-groups.sql`; browser: cross-level move, unplaced level change, full group with reason, no-paid-enrollment with reason, date and notes, « Complet », no-other-group message, French errors; `scripts/test-student-placement-browser.mjs` and `test-course-close-browser.mjs` unchanged and passing |
| 3 | `133_receptionist_dossier_teaching.sql` | items 1–6, 14, 16, 17, 17c, 18, 18p, 19, leave requests | SQL: e-mail rule with active, pending and revoked links; e-mail log rows for each role; dismissal delete refused; grade delete refused; certificate insert refused; teacher pay keys refused; storage purposes; browser: each item completed and stored, locked buttons absent; `scripts/test-receptionist-storage.mjs` extended |
| 4 | `134_receptionist_communication_reports.sql` | items 15, 23, 24, 25, 26 | SQL: `channel` backfill (family ↔ teacher rows → `portal`, ambiguous old rows → `portal`), her read sees office rows only, insert to an unknown address refused, delete refused, a family reply to her message delivered; browser: send to a family, a teacher, a staff member; no manual address; Dashboard and Reports render with no finance call (network log) and no « Charge des enseignants » |
| 5 | `135_receptionist_family_invitations.sql` | item 7 | SQL: parent/student invitation to the dossier address accepted; teacher, staff, other address, role change refused; `change_user_role` unchanged for her (refused); browser with the mail catcher (`npm run test:email-links-local` unchanged and passing) |

**Locked-item checks (stage 5, full list):** for each route in the locked list, typed URL → `/crm/leads`; each locked API → 403; each locked function → `42501` (or its documented refusal) in a rolled-back probe as receptionist; a DELETE as receptionist on every public table removes nothing except on `authorized_adults`.

**Independent review:** stage by stage against table A (each row: page, route, menu, JS, SQL, RLS, test), then the locked list, then the online pin. Not the diff as one block.

---

# Release and recovery

~~**Not before the online-classes Production test (week of 23/11) is recorded as finished.**~~ **Release order (owner, 2026-11-21), replacing that hold:**

1. The Next.js 15.5.29 PR (#207; production `npm audit` advisories, no exception allowed): CI, independent review, « merge #207 ».
2. #204 rebased on that `main`: CI fully green (both audit gates), a quick independent check of the new range.
3. R0–R4 **on a later day than the #207 merge** (« merge #204 on a different day from the Next.js merge » is kept), outside reception hours, in a window proposed by the release task and confirmed by the owner.
4. Then the online-classes Production test, on the released version.

Every Production step needs the owner's release approval.

| Step | Gate | Action |
| --- | --- | --- |
| R0 | Owner authorizes read-only reads | Ledger ends at the expected migration; re-check the next free number (renumber 131–135 before merge if taken); export the bodies and policies 131–135 replace to the owner's private folder with `SHA256SUMS`; record receptionist and staff account counts. |
| R1 | Reviewed head, READY FOR FINAL REVIEW | **Suites on the exact reviewed commit (N1 = B):** the full receptionist, online (`test-online-learning-browser.mjs`, `test-online-room-lifecycle-browser.mjs`) and teacher-portal (`test-portal-readiness-browser.mjs`) browser suites, plus the new suites, pass on the local production build of that commit against a local database with 131–135 and synthetic data, as CI does. The Vercel preview of that commit is used only for checks that change nothing (anonymous redirects, `/login` renders); it runs against Production without 131–135, so no signed-in suite runs there. |
| R2 | Release approval; outside reception hours | Apply 131–135 in order through the guarded wrapper (dry run, then apply). Read-only checks: catalog diff equals the manifest, ACLs, policy manifest, `has_capability` answers, online function bodies byte-identical to 130. |
| R3 | Same approval, right after R2 | Merge the reviewed head; Vercel Production READY on that commit; anonymous probes. |
| R4 | Same approval | Rolled-back probes as receptionist: three locked functions → `42501`; `online_issue_join` → `not_eligible`; `online_save_course` → `42501`; one new right per stage succeeds inside a rolled-back transaction. Admin spot check. Postgres and API logs for 30 minutes. |
| R5 | Owner / receptionist | One real action per stage on real work, recorded. **Her first real family invitation waits for the e-mail-links R4 test (a)**, like any first family invitation (CURRENT_STATE); until the owner records that test, the « Inviter » button is not used on a real dossier. `/helpdesk` checked. |
| R6 | Closeout | CURRENT_STATE, SECURITY_RULES, OWNER_DECISIONS, ADR-018 status, FEATURE_INDEX; plan to completed. |

**Old application, new database (R2 → R3, or an application-only rollback):** safe. The new database only widens her rights and adds logs; the old commands she uses (`save_receptionist_enrollment`, `assign_receptionist_student_group`, the old student and teacher forms' commands) keep working; `messages.channel` is set by the insert trigger.

**New application, old database:** not safe (her new pages call capabilities the old database refuses). Hence application rollback always comes first.

**Recovery (one step per layer):**

1. **Application:** redeploy the previous build.
2. **Database** (separate approval): `scripts/rollback/131_135_receptionist_permissions_restore.sql`, one transaction. It re-creates every function and policy 131–135 changed from the R0 export (bodies at 130), drops the new functions and the two log triggers, restores `receptionist_deny` where it was. It drops `messages.channel` (owner decision on PR #204, 2026-11-21: re-applying 134 rebuilds it from the profiles) and keeps the `activity_log` rows (inert). Rehearsed locally against a 135 database at stage 5, with the catalog compared to a clean 130 build.
3. **Data:** none to reverse. Rows she created (grades, adults, dismissal entries, messages, teachers) stay valid under the old rules.

## Release record (R0–R4) — 2026-11-22

Executed by the release task under the owner's approvals; nothing here changes the plan.

**Window.** Confirmed first as 02:00–06:30 UTC on 2026-11-22, the day after the #207 merge (2026-11-21 22:35:30 UTC). That window passed unused. On 2026-11-22 the owner replaced it with « today 22/11, from now until 12:00 UTC »: Sunday, the centre is closed (follow-up policy v1, `Africa/Casablanca`, has no hours on day 7; read at R0). Executed 09:05–09:40 UTC, on a later day than the #207 merge in UTC and in Casablanca.

**Approvals.** « approve R0 », then R1 and the rehearsal, stop before R2 (after the reviewer's READY FOR FINAL REVIEW on `8de3bce`, CI fully green, comment `7070759787`). « approve R2 », with « merge #204 » approved only if the dry run and every read-only check after the apply passed exactly as planned; then R4 and 30 minutes of logs.

| Step | When (UTC) | Result |
| --- | --- | --- |
| R0 | 2026-11-21 23:23 | Read-only. Ledger 001–130 (row 130 MD5 `bd8dc33c741727e8d231889870eea2d1`), next free number 131, none of the new objects present (`capability_roles`, `list_staff_recipients`, the message-party helpers, `messages.channel`, `require_family_inviter`). Accounts: receptionist 3, admin 1, director 1, teacher 1, student 3, pending 2. `activity_log` 2981, `messages` 0, four cron jobs. Export of the 19 functions, 53 policies and 59 triggers 131–135 replace to `~/EH-backups/2026-11-22-pre-131/` with `SHA256SUMS` (folder 700, files 600). 8-part catalogue digest recorded (functions 501, policies 164, triggers 173). |
| R1 | 2026-11-22, before 09:05 | Suites on the local production build of the tree of `8de3bce` (equal apart from the local port remap) against a local database with 131–135 and synthetic data. Rehearsal on a private stack: clean 130 plus the Production-only constraint `receipts_number_required` has Production's R0 digest; wrapper dry run, apply, restore and re-apply; restore → clean 130 digest, apply → clean 135 digest. |
| R2 | 09:06:05–09 dry run; 09:06:33–35 apply | One wrapper for 131–135 in order, in one transaction: pre-checks (ledger 001–130, row 130 MD5, new objects absent, digest equal to R0), the five files verbatim without their own begin/commit, one ledger row per file (`statements = array[file]`, `created_by` from row 130), post-checks against pins from a clean local 135 build. Dry run `DRYRUN_OK 131-135 online_n=64/6`, ledger and digest re-read unchanged. Read at 09:06:50: ledger 001–135; rows 131–135 MD5 = files (`b3dc9356…`, `c0d4e039…`, `f0499a21…`, `a4233b94…`, `77db4fa3…`); digest = clean 135 (functions 512 `e972cbaf…`, policies 186 `faaf9a17…`, triggers 177 `6440407e…`, columns 1133, constraints 765, relations 91, indexes 283, schemas 10); `capability_roles()` MD5 `b9af7453d4db0e34d1ed66562f236577` = pin; her online surface = `receptionist-online-pinned.json` (64 functions, 6 policies); accounts, cron and `activity_log` 2981 unchanged. |
| R3 | 09:07:08 merge; 09:08:41 deploy | PR #204 merged as `5764504052f490c61c38f09b49e4725bbcb74f6b` (tree = `8de3bce`). GitHub `Production` deployment `7976554948` `success`; the alias served `dpl_FHnDxD4megPNiseeb13MjijbixA1`. Anonymous: `/login` 200, protected pages 307 to sign-in, `/api/online/status` 401. |
| R4 | 09:12:05 | Rolled back, as the receptionist (claims set, helpers without an API grant called as `postgres` with her claims kept): three locked functions `42501`; `online_issue_join` `42501 online.not_eligible`; `online_save_course` `42501`; stage 1 lessons readable, courses not; stage 2 capacity saved and logged; stage 3 pick-up adult inserted; stage 4 five staff recipients; stage 5 family-invitation check passes for her, refuses a teacher (`42501`). Admin: `manage_users` true, all 241 non-deleted learners visible. After: `activity_log` 2981, no probe rows. A first run stopped on three mistakes in the probe script (a deleted learner picked for the pick-up adult, the log count read under her row rules, the admin total compared with deleted learners included); rolled back, script corrected, second run passed. |
| Logs | 09:06–09:38 | Postgres: only the deliberate probe errors, checkpoints, cron. API: schema reload at 09:06:35 (237 functions), about nine usual timeout-manager lines. Edge functions: 2xx only. Vercel runtime logs not read (the CLI returned no records). |
| R5 | pending | Owner with the receptionist, Monday 23/11: one real action per stage, `/helpdesk` checked. « Inviter » not used on a real dossier until the e-mail-links R4 test (a) is recorded. |
| R6 | this record | CURRENT_STATE, SECURITY_RULES, OWNER_DECISIONS, ADR-018, FEATURE_INDEX and the indexes updated; the plan stays active until R5. |

Recovery was not needed. Follow-up F3 (revoke the retired receptionist commands) becomes due one week after the release, from 2026-11-29, with its own approval.

---

# Expected modules

- `src/lib/roleAccess.mjs` (list, routes), `src/middleware.js` (only if a route shape needs it), `src/components/ProtectedRoute.jsx`, `src/components/layout/Sidebar.jsx` (menu by capability).
- Pages: `students/new`, `students/[id]` (+ edit), `students/page.jsx`, `groups/[id]`, `assessments`, `portfolios`, `certificates`, `learning-assessments`, `dismissal`, `teachers` (list, new, `[id]`, edit), `leave-requests`, `communications`, `notifications`, `dashboard`, `reports`, `receipts/[id]/print`, `crm/today`, `placement-tests`, `helpdesk/GuideContent.jsx`.
- Components: `EnrollmentModal.jsx`, `StudentForm.jsx`, `TeacherForm.jsx`, `PlacementTestModal.jsx`, `ReceiptForm.jsx`, `FamilyLinksPanel.jsx`, `AcademicOperationsReport.jsx`, new `AuthorizedAdultsEditor.jsx`; retired `ReceptionistStudentForm.jsx`, `ReceptionistTeacherForm.jsx`, `ReceptionistAssessments`.
- Libraries: `src/lib/academic/membershipActions.mjs`, `src/lib/reportData.mjs`, `src/lib/portal.js`.
- API: `src/app/api/email/send/route.js`, `src/app/api/admin/invite/route.js`.
- Migrations 131–135; `scripts/rollback/131_135_receptionist_permissions_restore.sql`.
- Tests: the four list tests and fixtures, `scripts/test-receptionist-groups.sql`, `scripts/test-receptionist-dossier.sql`, `scripts/test-receptionist-communication.sql`, `scripts/test-receptionist-invitations.sql`, `scripts/test-receptionist-browser.mjs`, `scripts/test-receptionist-storage.mjs`, `scripts/test-receptionist-security.sql`, `.github/workflows/verify.yml`.
- Docs: SECURITY_RULES, CURRENT_STATE, OWNER_DECISIONS, ARCHITECTURE (capability section), FEATURE_INDEX, ADR-018, the plans index.

---

# Owner decisions required

None open. N1 and N2 were answered on 2026-11-21:

- **N1 — preview database: B.** The Supabase account has only the Production admin project and the website project, with no branches, so a preview would run against Production without migrations 131–135. The full receptionist, online and teacher-portal browser suites run on the local build of the exact reviewed commit, as CI does; the preview is used only for checks that change nothing (R1). Follow-up F5.
- **N2 — teacher e-mail with a linked login or a pending invitation: A.** She may change a teacher's e-mail only while no login is linked and no invitation is pending; otherwise the field is read-only for her with « Le changement passe par la direction ». The admin is unchanged. Follow-up F6.

## Approval record (2026-11-21)

Maroine approved RPW-r1 (PR #203, head `08881a1`) for implementation with N1 = B, N2 = A; accepted the two screen-only limits (every charge row, every group's teacher) for now, with the real data limits kept as follow-up F4; and placed her first real family invitation after the e-mail-links R4 test (a). Build: all five stages in one pass on one branch and one PR, stages as commits, not approval points. Merge and release wait for the online-classes Production test and the owner's « merge » instruction.

## Review decisions (2026-11-21, PR #204 at `4ba8f49`)

- **Office messages (deviation 5): narrowed, not accepted as built.** « The office's messages » means the front desk with families. She reads the messages she sent or received, and the messages between any office account (director, admin, receptionist) and a family (parent or student account, or an address a learner's file carries). She never reads director ↔ admin, director/admin ↔ teacher, or family ↔ teacher conversations she is not part of. The backfill applies the same rule to past messages.
- **N1:** her invitation is refused, with a French message, when it would replace a pending staff or teacher invitation at that address.
- **N2:** inviting a confirmed account that is still pending sends her the same sign-in link as the admin. Resending a pending invitation from the dossier is follow-up F8; the dossier says who resends it.
- **N3:** accepted as is. **N4:** follow-up F7; ADR-018 corrected. **N5:** capacity text accepted; the learner form shows a French error when its record cannot be loaded.

Re-review of `5a5c13d` (2026-11-21): **B2** the staff guide matches what she can now do (no refusal left for an item of table A; `test-helpdesk-content.mjs` guards the old phrases); **I2** the WebKit test rule never excuses an error that says the origin is not allowed; **I1 test gap** closed (a staff or teacher account's address on a learner's file stays that account); **N6** accepted as is (a pending family account falls outside « office »: she sees less, never more).

# Follow-ups (not in this pass)

- **F1 — Online lessons items 20–22** (move "this lesson and the following ones", course set-up without closing, video-consent withdrawal), after the online-classes Production test. Needs the online constraint lifted.
- **F2 — Portal previews (item 8):** they show nothing even for the admin; a separate fix.
- **F3 — Revoke the retired receptionist commands** (`save_receptionist_enrollment`, `assign_receptionist_student_group`) one week after the release, once no open tab can call them.
- **F4 — Data boundaries for screen-only limits** (centre totals from charge rows, teacher workload from group rows). Accepted as screen-only for now (2026-11-21); the real data limits stay here.
- **F5 — A separate test database for previews** (a Supabase branch or staging project), so signed-in suites can run on a preview deployment.
- **F7 — The menu by capability (review N4):** `Sidebar.jsx` entries still list roles; they agree with the route allowlist today. Move them to `hasCapability` so the two cannot drift (ADR-018 decision 2).
- **F8 — Resend a pending family invitation from the dossier (review N2):** today the dossier tells her the direction or the administration resends it (Paramètres → Inviter un utilisateur). A resend from the dossier must keep the invitation's other learners' pending links (a re-invitation today replaces them), so it is its own change.
- **F6 — The admin has the same teacher e-mail trap:** changing a linked teacher's e-mail cuts off their portal messages (notifications and messages match the login's e-mail). A guard or a re-link step for every role is separate work.

---

## IMPLEMENTATION CONTRACT

### Scope

Stages 1–5 and table A rows 1–7, 9–19, 17c, 18p, L, 23–26, the bugs table, the four list tests, the restore script and the docs, with the owner's answers of 2026-11-14, 2026-11-20 and 2026-11-21 (N1 = B, N2 = A). Nothing else. No change to any online or teacher-portal file, function, policy, route or capability listed in "Scope and non-goals". No admin or director outcome changes except the pick-up adults editor, the e-mail-change log and the capacity log.

### Prerequisites

1. Owner approval of RPW-r1 at head `08881a1` with N1 = B and N2 = A (2026-11-21), recorded in this plan (RPW-r2) and in OWNER_DECISIONS.
2. Fresh `origin/main`; next free migration number re-verified (131 provisional); online and teacher-portal suites green on main.
3. Latest definitions re-read with `pg_get_functiondef` / `pg_policies` on a local database and compared with the citations: `has_capability` / `require_capability` (096), `save_receptionist_student`, `assign_receptionist_student_group`, `guard_student_membership`, `end_learner` (120), `save_receptionist_teacher_operations` (119), `place` / `place_learner_in_group`, `save_enrollment_changes`, `reopen_enrollment`, `save_receptionist_enrollment` (127), `save_receptionist_group`, `enforce_group_capacity` (128), `can_message_recipient`, `account_sees`, `recipient_for`, `set_recipient`, `storage_security.can_write`, `resolve_storage_asset`, the three family-invitation functions, `queue_role_invitation` (123), `enforce_dismissal_integrity` (125), `get_teacher_operations` (096), every `online_*` body (117–130), and the policies named in table A (124). A difference is a stop condition.
4. Local Supabase, synthetic data only, external e-mail off; branch `feat/receptionist-permissions` in `.claude/worktrees/`.

### Object / module manifest

As in "Expected modules", with migrations `131_capability_list.sql`, `132_receptionist_groups.sql`, `133_receptionist_dossier_teaching.sql`, `134_receptionist_communication_reports.sql`, `135_receptionist_family_invitations.sql` (numbers provisional), each ending with `notify pgrst, 'reload schema'`, and `scripts/rollback/131_135_receptionist_permissions_restore.sql`.

### Invariants

- The JS list and `has_capability` are identical (parity test).
- Every `authenticated`-executable function is classified; every receptionist policy is in the manifest.
- Her online and teacher-portal access is byte-identical to `53c486b` at every layer; online files untouched.
- No locked item in the locked list becomes reachable by her through any page, route, API or function.
- Director, admin, teacher, parent and student outcomes are unchanged except the three named staff additions.
- Placement, capacity, year, course-date, enrollment-history and membership guards apply to her exactly as to the admin.
- Every capacity change and every learner or parent e-mail change writes a log row, for every role.
- Her old commands keep working until follow-up F3.
- No Production read or write by the implementation task.

### Acceptance / tests

1. After each stage: the stage's commit, the checks listed in "Stages, tests and commits", including the unchanged online and teacher-portal suites.
2. Browser, as receptionist: every table A row completed in the real pages and the stored result checked; every locked item absent and refused when forced.
3. Restore script rehearsed: 135 → restore → catalog equals clean 130; old application flows pass on it.
4. `npm run lint`, `npm run build`, changed-Markdown checks clean; CI green on the exact head.
5. The PR lists the migration filenames, the answers applied, any deviation, and the release steps deferred to the release task.

### Stop conditions

Stop and report if:

- a cited definition differs from its latest migration;
- an online or teacher-portal test, file or pinned value would have to change;
- opening an item needs a right on the locked list, a finance function change, or a change to `role_security.assert_transition`;
- an admin or director outcome changes beyond the three named additions;
- the restore cannot return the catalog to 130;
- the owner changes a decision;
- Production access, credentials or data would be needed.

### Docs / status reporting

Report per [AGENTS](../../../AGENTS.md#implementation-handoff): branch, head SHA, PR, Tier 3 rationale, checks per stage tied to the SHA, self-check, plan revision RPW-r2, migration filenames, unresolved decisions. Independent review is mandatory and checks stage by stage against table A.
