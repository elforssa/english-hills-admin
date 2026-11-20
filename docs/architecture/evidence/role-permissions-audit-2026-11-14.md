# Role permissions audit: admin versus receptionist

Read-only audit, 2026-11-14. No code, migration, policy or data was changed.

## Scope and evidence

- **Code:** `origin/main` at `9f0c911` (migrations up to 128). The main checkout was on an older docs branch, so the audit was done in a worktree cut from `origin/main`.
- **Database:** live Production (`hopcezradkhrixwwswxn`), read in read-only transactions: `pg_policies` (164 policies in `public`, 1 in `storage`), table grants, triggers, and the bodies of the functions cited below. The live migration ledger ends at 128, the same as `origin/main`.
- **Not done:**
  - Nothing was run as a receptionist (no browser session, no rolled-back probe). Every "works" or "fails" below is read from code and live definitions, not observed.
  - Pages the receptionist cannot open are inventoried per page, not per button.
  - Live policies were read directly; they were not diffed one by one against the migration files.
  - Database logs for the last 24 hours returned no error rows, so no real failure was captured.
- **Live accounts:** 1 director, 1 admin, 3 receptionists, 1 teacher, 2 students, 2 pending.

"Admin" in the tables means the `admin` role. Where the director can do more than the admin, the Admin column says so.

---

## 1. Roles and how they are checked

### Roles

Seven values on `profiles.role` (check constraint, `supabase/migrations/077_receptionist_role_and_operational_access.sql:3-5`): `director`, `admin`, `receptionist`, `teacher`, `parent`, `student`, `pending`.

The role is always read from the stored profile row. It is not a JWT claim and not Auth metadata.

### Where the role is checked

| Layer | Mechanism | Source |
| --- | --- | --- |
| Route (server) | Middleware reads `profiles.role`; the receptionist gets an exact allowlist, everything else redirects to `/crm/leads` | `src/middleware.js:128-161` |
| Route (browser) | Same rules repeated in the page wrapper | `src/components/ProtectedRoute.jsx:54-71` |
| Menu | Each item lists its roles; receptionist items are also filtered by the route allowlist | `src/components/layout/Sidebar.jsx:16-102`, `:181-188` |
| Capability map (JS) | `hasCapability(role, capability)` and the receptionist route list | `src/lib/roleAccess.mjs:8-45`, `:48-66` |
| Buttons | Mostly hard-coded `role === 'receptionist'` / `role === 'director'` tests in each page | about 185 role tests across 50 files |
| API routes | Middleware skips `/api/*`; each handler checks the role itself | `src/middleware.js:113`, each `route.js` |
| Capability map (SQL) | `operational_security.has_capability` / `require_capability` | `096_receptionist_operational_permissions.sql:7` (live body matches) |
| Receptionist-only commands | `operational_security.require_receptionist()` guards 10 receptionist-only functions (`save_receptionist_*`, `assign_receptionist_student_group`, …) | live `pg_proc` |
| Other SQL gates | `get_my_role()` tests, `crm_security.require_reader(technical)`, `online_security.require_role(...)`, `portal_security.require_manager()`, `require_finance_staff()` | live `pg_proc` |
| Row security | Per-table policies; the receptionist is handled by `receptionist_deny` restrictive policies plus a few `receptionist_*_read/insert/update` policies | live `pg_policies` |
| Triggers | Guards that apply to every role (enrollment history, group capacity, course dates, receipts) and one receptionist-specific attendance rule | live `pg_trigger` |

### Centralized or scattered?

**Scattered.** There is a central idea (operations = director + admin + receptionist, management = director + admin, a few director-only items) but it is written down in four places that must be kept in step by hand:

1. `src/lib/roleAccess.mjs` (29 capabilities).
2. `operational_security.has_capability` in SQL (23 capabilities; the two lists do not have the same names or the same entries).
3. Hard-coded role tests in pages and components.
4. Separate database commands per role: the receptionist calls `save_receptionist_student`, `save_receptionist_group`, `save_receptionist_enrollment`, `assign_receptionist_student_group`, while director and admin write the tables directly or call `place_learner_in_group`, `save_enrollment_changes`, `end_learner`.

Opening one permission to the receptionist usually means touching the page, the JS map, a SQL function and sometimes a policy.

### Database summary for the receptionist (live)

| Table | Read | Insert | Update | Delete |
| --- | --- | --- | --- | --- |
| students | yes (not archived) | command only | command only (6 fields) | no |
| enrollments | yes | no (born at payment) | command only (group) | no |
| groups | yes | command only | command only | no |
| attendance | yes | yes | yes (status only) | no |
| placement_tests | yes | yes | yes | no |
| assessments | yes | no | no | no |
| authorized_adults | yes | no | no | no |
| charges, receipts, charge_discount_reasons | yes | payment command only | no | no |
| teachers | no (fixed 7-field projection through a function) | no | command only (4 fields) | no |
| online_* (6 tables) | yes | commands | commands | no |
| CRM tables | functions only | functions only | functions only | no |
| activity_log, announcements, app_config, certificates, dismissal_logs, financial_events, learning_assessments, leave_requests, messages, notifications, payroll, pending_roles, portfolios, storage tables | **no** (restrictive deny) | no | no | no |
| profiles | own row only | no | no | no |

---

## A. Full table by module

Legend for "Blocked at": **UI** = hidden or absent in the page, **Route** = middleware and page wrapper redirect, **Server** = API handler or database function refuses, **RLS** = row policy refuses. "—" means not blocked.

### CRM and admissions

| Action | Admin | Receptionist | Blocked at | File:line |
| --- | --- | --- | --- | --- |
| View leads, tasks, lead detail, timeline | Yes | Yes | — | `roleAccess.mjs:49`; `crm_security.require_reader(false)` |
| Create lead, add note, log call / WhatsApp, schedule or complete task, qualify, close, reopen, reassign | Yes | Yes | — | `crm_security.command` (reader check only) |
| Book or update a placement test from a lead | Yes | Yes | — | `crm_book_placement_test`, `crm_update_placement_test` |
| « Inscrire et encaisser » for a prospect | Yes | Yes | — | `crm_enroll_and_collect` (needs `manage_finance_operations`) |
| See the ad (campaign, ad set, ad) a lead came from | Yes | Yes | — | `crm_get_operational_acquisition_summary` |
| Follow-up policy, form mappings, Meta / website connections | No (director only) | No | Route + Server | `crm_security.command` (`create_followup_policy` is technical); `require_reader(true)` |
| Marketing analytics page | No (director only) | No | UI + Route + Server | `Sidebar.jsx:29`; `roleAccess.mjs:99`; `crm/analytics/page.jsx:5` |
| Meta lifecycle page | No (director only) | No | UI + Route + Server | `Sidebar.jsx:30`; `crm/integrations/lifecycle/page.jsx:6` |
| Revenue entries, attribution detail, conversion-review flag | No (director only) | No | Server | `crm_get_revenue_entries_for_lead`, `crm_get_submission_attribution` |

### Placement tests

| Action | Admin | Receptionist | Blocked at | File:line |
| --- | --- | --- | --- | --- |
| View list and calendar | Yes | Yes | — | `roleAccess.mjs:50` |
| Create / edit a test and its result | Yes | Yes | — | `PlacementTestModal.jsx:105-107`; `receptionist_placement_insert/update` |
| Email the result to the family when saving | Yes | **No** | UI + Server | `PlacementTestModal.jsx:113`; `api/email/send/route.js:84` |
| Delete a test (not linked to a lead) | Yes | No | UI + RLS | `placement-tests/page.jsx:89`, `:120`; no delete policy |

### Learners (families and children)

| Action | Admin | Receptionist | Blocked at | File:line |
| --- | --- | --- | --- | --- |
| View directory, list, search, dossier | Yes | Yes (archived learners hidden) | — | `receptionist_student_read` |
| Create a learner | Yes (full form) | Yes (11 fields) | — | `ReceptionistStudentForm.jsx:64-70`; `save_receptionist_student` |
| Place the learner in a group while creating | Yes | No | UI | `StudentForm.jsx:64` |
| Edit name, birth date, phone, age category, notes, photo | Yes | Yes | — | `ReceptionistStudentForm.jsx:61-63` |
| Edit learner email or parent email | Yes | **No** | UI + Server | `ReceptionistStudentForm.jsx:121-124` (read-only); `save_receptionist_student` update keys; also refused in the receipt form (`create_charge_payment_financial`, "Contact identity cannot be changed") |
| Edit programme, level, source after creation | Yes (only while not in a group) | No | UI + Server | `students/page.jsx:155`, `:454-473`; `save_receptionist_student` update keys |
| Add / edit authorized pick-up adults | Yes | No (read only) | UI + RLS | `authorized_adults` `receptionist_insert_deny` / `update_deny` |
| Upload learner photo, enrollment document | Yes | Yes | — | `storage_security.can_write`; `students/[id]/page.jsx:175` |
| See family accounts linked to a learner | Yes | Yes | — | `list_family_links` |
| Invite a parent / student to the portal, revoke a link | Yes | No | UI + Server | `FamilyLinksPanel.jsx:64`; `prepare_family_invitation` → `require_manager()` |
| « Ancien apprenant » (end enrollments) | Yes | No | UI + Server | `students/[id]/page.jsx:220`; `end_learner` |
| Archive a learner | Yes | No | UI + Server | `students/[id]/page.jsx:220`; `soft_delete_student` |
| Archived list, restore, « Clôturer l'année » | No (director only) | No | UI + Server | `students/page.jsx:344-346`; `restore_student`, `close_school_year` |
| Import CSV | Yes | No | UI + Route | `students/page.jsx:156`; `/students/import` not in the allowlist |
| Export CSV | Yes | No | UI + Server | `students/page.jsx:157`; `search_students_page` refuses page size 0 for the receptionist |
| « Sortie des jeunes » (dismissal log) | Yes | No | UI + Route + RLS | `Sidebar.jsx:39`; `dismissal_logs` `receptionist_deny` |

### Enrollments and group membership

| Action | Admin | Receptionist | Blocked at | File:line |
| --- | --- | --- | --- | --- |
| Create an enrollment (only through a payment, all roles) | Yes | Yes | — | `crm_enroll_and_collect`, `create_charge_payment` |
| Place a paid enrollment in a group of the same programme, level and year | Yes | Yes | — | `EnrollmentModal.jsx:117-124`; `groups/[id]/page.jsx:193-197` |
| Move a learner to another group of the **same level** | Yes | Yes, if that group has a free seat | Server when full | `save_receptionist_enrollment` (127:702); `enforce_group_capacity` (128:328) |
| Move a learner to a group of **another level** | Yes | **No** | **UI only** (the database would accept it) | `EnrollmentModal.jsx:57-59`, `:172-179`; `academicPrograms.js:6-19` |
| Change the level of an enrollment not yet placed | Yes | No | UI + Server | `EnrollmentModal.jsx:172`; `save_enrollment_changes` (director, admin) |
| Edit enrollment date and notes | Yes | No | UI + Server | `EnrollmentModal.jsx:210-217`; `save_enrollment_changes` |
| Place a learner in a full group (reason logged) | Yes | No | UI + Server | `groups/[id]/page.jsx:185`; `academic_security.place` (`egc.capacity_override_forbidden`) |
| Place a learner who has no paid enrollment (reason logged) | Yes | No | Server | `academic_security.place` (`eap.paid_enrollment_required`) |
| Add a learner from the group page | Yes | Yes, only a learner with a paid, unplaced enrollment of that level (or a dossier of exactly that level) | UI filter | `groups/[id]/page.jsx:140-154` |
| Remove a learner from a group | Yes | Yes | — | `groups/[id]/page.jsx:228-232`; `assign_receptionist_student_group` |
| Reopen an ended enrollment | Yes | No | UI + Server | `students/[id]/page.jsx:306`; `reopen_enrollment` |
| Delete an enrollment | No (history guard, all roles) | No | Server | `guard_enrollment_history` |

### Groups and classes

| Action | Admin | Receptionist | Blocked at | File:line |
| --- | --- | --- | --- | --- |
| View groups and a group's roster | Yes | Yes | — | `groups read staff` policy |
| Create a group | Yes | Yes | — | `groups/page.jsx:314`, `:98-99`; `save_receptionist_group` |
| Edit name, teacher, room, days, time, term, year, dates, **capacity** | Yes | Yes | — | `save_receptionist_group` (128:747), 14 keys |
| Change programme or level of a group that has learners | No (guard, all roles) | No | Server | `guard_group_level`; `save_receptionist_group` |
| Delete a group | Yes (only without history) | No | UI + RLS | `groups/page.jsx:369`, `:410`; no delete policy |
| « À clôturer » list, close a course, reopen a course | No (director only) | No | UI + Server | `groups/page.jsx:212-216`; `close_course`, `reopen_course` |

### Attendance, timetable, grades

| Action | Admin | Receptionist | Blocked at | File:line |
| --- | --- | --- | --- | --- |
| Record or correct attendance status, any group, any date | Yes | Yes | — | `attendance/page.jsx:45`; `receptionist_attendance_insert/update` |
| Attendance notes | Yes (database only; the page sends no note) | No | Server | `enforce_attendance_integrity` (121:129) |
| Delete an attendance row | Yes (database only) | No | RLS | `receptionist_attendance_delete_deny` |
| View timetable | Yes | Yes | — | `roleAccess.mjs:53` (page is read-only for everyone) |
| View grades and report cards | Yes | Yes (read-only view) | — | `assessments/page.jsx:142` |
| Add, edit, delete a grade | Yes | No | UI + RLS | `assessments/page.jsx:142`, `:147`; `receptionist_insert/update/delete_deny` |
| Portfolios, certificates, learning profiles | Yes | No | UI + Route + RLS | `Sidebar.jsx:70-75`; `receptionist_deny` on the three tables |

### Receipts, payments, finance

| Action | Admin | Receptionist | Blocked at | File:line |
| --- | --- | --- | --- | --- |
| Record a payment and issue a receipt (new charge or existing balance) | Yes | Yes | — | `receipts/new/page.jsx`; `create_charge_payment` (`manage_finance_operations`) |
| Give a discount (reason required, any amount) | Yes | Yes | — | `financeCorrections.mjs:46`; migration 125 withdrew the 10 % cap |
| Back-date a payment | Up to 31 days | Up to 7 days | Server | `financeCorrections.mjs:15-16`; `create_charge_payment_financial` |
| View receipt list, print a receipt, resend the receipt email | Yes | Yes | — | `receipts/[id]/print/page.jsx:73`; `retry_receipt_email` |
| See a learner's charges and balance on the dossier | Yes | Yes | — | `receptionist_charge_read`; `students/[id]/page.jsx:253` |
| See internal payment notes on the receipt page | Yes | No | UI only (the row is readable) | `receipts/[id]/print/page.jsx:80` |
| Finance dashboard, monthly totals, unpaid list | Yes | No | UI + Route + Server | `Sidebar.jsx:55`; `require_finance_staff()` |
| Correct a payment or a charge, void, delete a mistaken receipt, deletion history, « Contrôles » queue | No (director only) | No | UI + Route + Server | `receipts/[id]/print/page.jsx:70-72`; `void_financial_receipt`, `void_financial_charge`, `delete_mistaken_receipt`, `get_finance_review_queue` |
| Hard-delete a receipt, change a receipt number | No (nobody) | No | Server | `guard_receipt_delete`, `guard_receipt_number` |

### Teachers and HR

| Action | Admin | Receptionist | Blocked at | File:line |
| --- | --- | --- | --- | --- |
| View teacher list and a teacher's page | Yes (full record) | Yes (name, email, phone, certifications, levels, photo) | Server projection | `teachers/page.jsx:34`; `get_teacher_operations`; `teachers` `receptionist_deny` |
| Edit name, phone, certifications, authorized levels | Yes | Yes | — | `ReceptionistTeacherForm.jsx:42`; `save_receptionist_teacher_operations` |
| Edit email, contract, salary, hourly rate, IBAN, notes | Yes | No | UI + Server | `teachers/[id]/page.jsx:49`; 4-key allowlist |
| Add a teacher, archive a teacher | Yes | No | UI + Route + Server | `Sidebar.jsx:64`; `teachers/page.jsx:48`; `teachers/[id]/page.jsx:61`; `soft_delete_teacher` |
| Link a teacher to a login | Yes | No | Server | `link_teacher_account` → `require_manager()` |
| Leave requests | Yes | No | UI + Route + RLS | `Sidebar.jsx:65`; `leave_requests` `receptionist_deny` |
| Payroll | Yes (payslip creation is switched off for everyone) | No | UI + Route + Server + RLS | `Sidebar.jsx:66`; `api/admin/payroll/route.js`; `payroll` `receptionist_deny` |

### Online lessons

| Action | Admin | Receptionist | Blocked at | File:line |
| --- | --- | --- | --- | --- |
| View courses and lessons, join a room | Yes | Yes | — | `online_list_courses`, `online_issue_join` |
| Move one lesson, cancel a lesson, add or remove a guest, record video consent, save attendance | Yes | Yes | — | `online_update_lesson`, `online_cancel_lesson`, `online_add_guest`, `online_record_consent`, `online_save_attendance` |
| Move "this lesson and the following ones" | Yes | No | Server | `online_update_lesson` (scope `following`) |
| Create or edit a course, weekly pattern, set the teacher, activate, close | Yes | No | UI + Server | `online/[id]/page.jsx:263-306`; `online_save_course`, `online_save_pattern`, `online_set_lesson_teacher`, `online_activate_course`, `online_close_course` |
| Withdraw video consent | Yes | No | UI + Server | `online/[id]/page.jsx:330`; `online_revoke_consent` |
| Teacher lesson counts | Yes | No | UI + Server | `online/page.jsx:82`; `online_teacher_lesson_counts` |

### Communication, reports, settings, users

| Action | Admin | Receptionist | Blocked at | File:line |
| --- | --- | --- | --- | --- |
| Dashboard | Yes | No (home is `/crm/leads`) | UI + Route | `Sidebar.jsx:31`; `roleAccess.mjs:4` |
| Reports | Yes | No | UI + Route | `Sidebar.jsx:32` |
| Notifications, messages and announcements to families | Yes | No | UI + Route + RLS + Server | `Sidebar.jsx:78-83`; `receptionist_deny`; `api/email/send/route.js:84` |
| Activity log | Yes | No | UI + Route + RLS | `Sidebar.jsx:82`; `activity_log` `receptionist_deny` |
| Portal previews (parent, teacher, student) | Yes | No | UI + Route | `Sidebar.jsx:86-92` |
| Own account page | Yes | Yes | — | `settings/page.jsx:466` |
| Centre settings (`app_config`) | Yes | No | UI + RLS | `settings/page.jsx:466`; `app_config` `receptionist_deny` |
| Invite a user | Yes (teacher, parent, student only) | No | UI + Server | `api/admin/invite/route.js`; `prepare_role_invitation` |
| Change a user's role | Limited (cannot give director, admin or receptionist) | No | UI + Server | `settings/page.jsx:80`, `:140`; `role_security.assert_transition` (077:12) |
| Staff guide (`/helpdesk`) | Yes | Yes | — | `roleAccess.mjs:57` |

---

## B. What the receptionist cannot do

Suggestions are the auditor's opinion, for the owner to accept or reject.

### DAILY OPS

| # | She cannot | Suggestion |
| --- | --- | --- |
| B1 | Move a learner to a group of another level (wrong level at placement, mid-year level change). Today only the page blocks it. | **Give.** The security rules already describe this as a reception right; only the page needs to offer the other groups of the programme. |
| B2 | Change the level of a paid enrollment that has no group yet (level picked wrongly at the till). | **Give with limits:** only while the enrollment has no group, same programme and year. |
| B3 | Place a learner in a full group. | **Keep admin-only**, but see C2-1: she can already raise the group's capacity herself. Decide one rule. |
| B4 | Correct a learner's email or the parent's email after creation. | **Give with limits:** allowed while no family account is linked to that address; once an account is linked, direction only. |
| B5 | Correct a learner's programme, level or source on the dossier after creation. | **Give with limits:** only while the learner has no group and no paid enrollment (the same rule management has). |
| B6 | Add or edit authorized pick-up adults. | **Give.** This is front-desk information. |
| B7 | Use « Sortie des jeunes » (record who collected a child). | **Give** create and view; keep delete admin-only. |
| B8 | Email a placement test result to the family. | **Give with limits:** this one fixed template only, not free-form email. |
| B9 | Edit enrollment notes and enrollment date. | **Give** notes; **keep admin-only** for the date. |
| B10 | Mark a learner « Ancien apprenant » when a family leaves. | **Give with limits:** only when the balance is zero, reason required; otherwise direction. |
| B11 | Invite a parent to the portal. | **Give with limits:** parent and student invitations only, to the address already on the dossier. Never staff roles. |
| B12 | Write attendance notes (reason for an absence). | **Give.** The page would also need a notes field; today nobody has one. |
| B13 | Add a grade or edit one. | **Keep admin-only** (teachers and direction own grades). |
| B14 | See the dashboard, the unpaid list (who owes what). | **Give with limits:** an unpaid list per learner without centre totals. |
| B15 | Send a message or announcement to families. | **Keep admin-only** for now; revisit with templates. |

### MONEY

| # | She cannot | Suggestion |
| --- | --- | --- |
| B16 | Back-date a payment more than 7 days (admin: 31). | **Keep** the 7-day limit. |
| B17 | Correct a payment or a charge, void or delete a receipt. Director only; the admin cannot either. | **Keep director-only.** |
| B18 | See finance dashboard, monthly totals, « Contrôles », deletion history. | **Keep admin-only / director-only.** |
| B19 | See internal payment notes on a receipt. | **Keep admin-only**, and close the gap in C2-3 if these notes are meant to be private. |
| B20 | Payroll, teacher salary, hourly rate, IBAN, contract type. | **Keep admin-only.** |

Already open to her, for reference: recording payments, discounts of any size with a reason, printing and re-sending receipts.

### DESTRUCTIVE / CONFIG

| # | She cannot | Suggestion |
| --- | --- | --- |
| B21 | Archive a learner; see or restore archived learners; close the school year. | **Keep admin-only / director-only.** |
| B22 | Delete a group, a placement test, an attendance row, a grade. | **Keep admin-only.** |
| B23 | Close or reopen a finished course. | **Keep director-only.** |
| B24 | Reopen an ended enrollment. | **Keep admin-only.** |
| B25 | Add or archive a teacher; edit teacher email, contract, pay. | **Keep admin-only.** |
| B26 | Import or export learners as CSV. | **Keep admin-only** (bulk personal data). |
| B27 | Invite staff, change roles, centre settings. | **Keep admin-only / director-only.** |
| B28 | Online course set-up (create, weekly pattern, teacher, activate, close), withdraw video consent. | **Keep admin-only.** |
| B29 | Marketing analytics, Meta connections, follow-up policy, activity log, reports. | **Keep director-only / admin-only.** |

---

## C. Mismatches between the layers

### C1. Visible to her, refused by the server

| # | What happens | Evidence |
| --- | --- | --- |
| C1-1 | « Affecter un groupe » lists a full group as a normal choice. She picks it, saves, and gets « Ce groupe est complet. » One group is full today (Child 3, 15 of 15). | `EnrollmentModal.jsx:57-59` has no capacity filter; `enforce_group_capacity` |
| C1-2 | Several receptionist commands answer in raw English, shown as-is: "Enrollment group must match its session and level", "Only group assignment is permitted", "Student unavailable or stale". | `save_receptionist_enrollment`; `membershipActions.mjs:98`; `ReceptionistStudentForm.jsx:96` |
| C1-3 | In « Affecter un groupe », when the level has only one group, the list contains only the current group. Saving "succeeds" and changes nothing. | `EnrollmentModal.jsx:57-59`; see section D |

### C2. Hidden in the page, allowed by the server

| # | What the server allows | Risk |
| --- | --- | --- |
| C2-1 | **She can raise a group's capacity** through the group edit form, then place a learner in it. The capacity override is meant to be director / admin with a logged reason. The `groups` table has no activity-log trigger, so the capacity change leaves no trace. | Real inconsistency. Low severity (trusted staff), but the logged override rule is bypassable. `save_receptionist_group` (128:747), key `capacite_max` |
| C2-2 | Moving a placed learner to a group of another level. The page hides those groups; `save_receptionist_enrollment` accepts the move when the new level is sent, and `academic_security.place` accepts it for a placed enrollment. | Not a hole: the security rules state reception may do this. It is a missing page feature (B1). |
| C2-3 | Internal receipt notes (`payment_note`, `observation`, `void_reason`) are hidden in the page for her, but the receipts row she can read contains them. | Low. Hidden from view, not protected. `receipts/[id]/print/page.jsx:80`; `receptionist_receipt_read` |
| C2-4 | `place_learner_in_group`, `remove_learner_from_group` and `remove_student_group` accept the receptionist (`assign_group`), although her pages call the receptionist-specific commands. | None found: both paths end in the same core function with the same rules. |

No case was found where a hidden page or button leads to data or an action the database fails to protect, apart from C2-1 and C2-3.

### C3. Other disagreements

| # | Disagreement |
| --- | --- |
| C3-1 | Two capability lists that do not match: JS has `canImportStudents`, `canExportStudents`, `canEditStudentProgramme`, `canManageOnline*`, `canViewHelp`; SQL has `manage_admissions` and none of those. Neither is generated from the other. |
| C3-2 | The JS map says the receptionist has `canManageGroups`, `canManageStudents`, `canAssignGroup`, but the pages then narrow her with separate `role === 'receptionist'` branches and narrower commands. The capability name overstates what she can do. |
| C3-3 | `docs/ai/SECURITY_RULES.md` says reception "may move a learner with a confirmed placement to a group of another level in the same programme". The page does not allow it, and the browser test asserts the opposite ("only groups of the programme, level and year", `scripts/test-receptionist-browser.mjs:201`). |
| C3-4 | The dossier tells her « Les corrections et les fins d'inscription passent par la direction » while the security rules give her the level move. Same contradiction, in the page text. `students/[id]/page.jsx:291` |
| C3-5 | Retired Premium workshop tables still carry receptionist read policies and four receptionist commands in the live database. Already known and recorded (waiting for Premium Release B). |
| C3-6 | Admin and receptionist use different commands for the same action (student save, group save, placement). A fix made to one path does not reach the other; this is how the messages in C1-2 stayed in English. |

---

## D. Why "change a child's group" fails for her

There are three places she can try. All three stop her in the page, before the server is asked.

### What she has to work with (live, 2026-11-14)

All 82 placed learners are in the Yearly programme, in 8 groups, all in school year 2026/2027:

| Level | Groups | Seats used / capacity |
| --- | --- | --- |
| Child 1 | 2 | 4/15, 11/15 |
| Child 3 | 2 | 15/15 (full), 9/15 |
| Child 5 | 2 | 9/15, 14/15 |
| Junior 1 | 1 | 10/15 |
| Junior 3 | 1 | 10/15 |
| B1 | 1 | 0/10 |

### Path 1: learner dossier → « Modifier l'inscription »

1. **UI: opens, but the list is filtered.** For the receptionist the dialog is « Affecter un groupe » (`EnrollmentModal.jsx:33`, `:157`). The group list keeps only groups of the same programme, the **same level as the enrollment**, the same school year, and not closed (`EnrollmentModal.jsx:53-59`, `academicPrograms.js:6-19`). The level selector that director and admin have is hidden for her (`EnrollmentModal.jsx:172`).
   - Junior 1, Junior 3: one group per level, so the list holds only the group the child is already in. There is nothing to choose.
   - Child 1, Child 3, Child 5: exactly one other group is offered.
   - Any move to another level (Child 1 to Child 3, for example): never offered.
2. **Route: not blocked.** `/students/<id>` is in her allowlist (`roleAccess.mjs:60`).
3. **Server: would accept more than the page offers.** The dialog calls `save_receptionist_enrollment` (`EnrollmentModal.jsx:119`). For a paid, placed enrollment it accepts any group of the same programme whose level equals the level sent, in the same school year (live body; `127_enrollment_at_payment.sql:702`). A cross-level move passes if the new level is sent, which the page never does.
4. **Database guards: two can still refuse a move the page offers.**
   - Capacity: `enforce_group_capacity` raises « Ce groupe est complet. » She cannot override; director and admin can with a reason. Today this hits any move into the full Child 3 group.
   - Course dates and closed courses (`guard_course_placement`, migration 128): not a factor today, since every live group is Yearly and none is closed. It will matter for Adults, Mise à niveau, Summer Camp and One-to-One groups without dates.
5. **RLS: not involved.** She has no write policy on `enrollments`; the command runs with definer rights after `require_receptionist()`.

### Path 2: group page → « Ajouter des apprenants »

1. **UI: the child is not in the picker.** A learner already in another group of the same programme and year is filtered out (`groups/[id]/page.jsx:143-145`, `:153`). The comment says so: a member "changes group from their enrollment, not from this picker". For the receptionist the picker is stricter still: the dossier level must equal the group's level (`:146-147`).
2. **Server: same answer if forced.** `assign_receptionist_student_group` without an enrollment id reaches `academic_security.place`, which refuses with « Cet apprenant est déjà dans un autre groupe de ce programme pour cette année » (`egc.already_placed`).
3. **Workaround that does work:** « Retirer » on the old group's page (allowed, `groups/[id]/page.jsx:228-232`), then « Ajouter » on the new group's page. After removal the enrollment keeps its old level, so this only works for a group of the same level: the picker and `academic_security.place` both refuse a different level for an unplaced enrollment (`egc.group_mismatch`).

### Path 3: learner edit form

No group field at all. The form says « Utilisez les inscriptions et groupes pour modifier l'affectation » (`ReceptionistStudentForm.jsx:129-130`), and a guard trigger refuses a direct write of the dossier group for every role.

### Summary

| Case | UI | Server / database | Result for her |
| --- | --- | --- | --- |
| Other group, same level, free seat | Offered | Accepted | Works |
| Other group, same level, full | Offered | Refused (capacity) | Error « Ce groupe est complet » |
| Level with a single group | Only the current group listed | — | Nothing to select |
| Group of another level | Not listed | Would be accepted | **Blocked by the page only** |
| From the group page | Child not in the picker | Refused (`already_placed`) | Blocked |

So the block is mostly a page rule (same-level filter with the level selector hidden), plus the capacity rule on full groups. It is not a missing role permission: `assign_group` already includes the receptionist in both capability maps, and the written security rule already allows the cross-level move.

---

## Waiting for the owner

Nothing has been changed. The next step is the owner's choice of which items in section B to open, and a decision on C2-1 (capacity). Any of these is a Tier 3 change under `AGENTS.md` (roles and RLS): plan, owner approval, implementation, independent review, release.
