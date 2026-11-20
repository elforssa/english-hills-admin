# Receptionist permissions — plan RPW-r0 (DRAFT, INCOMPLETE)

**Status: unfinished draft. Not ready for approval.** The session that wrote it hit its usage limit. Sections marked **TO DO** are missing; rows marked **(unverified)** were not traced in code. Tier 3 (roles, RLS). Plan only: no code, migration or policy was changed.

Baseline: `origin/main` `9f0c911` (migrations to 128). Source: [role permissions audit](role-permissions-audit.md) (untracked file on this branch) and the owner's decisions of 2026-11-14. No Production read was made for this plan; database facts come from the migration files.

## Owner rule

The receptionist can do everything the admin can do, except destructive actions and finance. When in doubt she gets it, unless it deletes data, cannot be undone, or shows the centre's finances.

## Approach: recommendation is (b), with one stated exception

| | (a) Widen her own commands and page branches | (b) She uses the admin pages and commands |
| --- | --- | --- |
| Receptionist-only SQL commands at the end | 10 today, about 12 more (twins of `end_learner`, `reopen_enrollment`, `save_enrollment_changes`, family invitation, online set-up…) | 3 (`save_receptionist_student`, `save_receptionist_teacher_operations`, `save_receptionist_group`) |
| Page branches `role === 'receptionist'` | stay and grow (about 185 role tests in 50 files today) | replaced by `hasCapability(role, …)` |
| Separate forms | `ReceptionistStudentForm`, `ReceptionistTeacherForm`, `ReceptionistAssessments` stay | retired; one form with fields masked by capability |
| A fix on the admin path reaches her | no (this is how English errors survived, audit C3-6) | yes |
| Main risk | drift between twin paths | a future admin feature opens to her by default |

**Recommended: (b).** The exceptions live in one map, written twice with the same names and checked by a test:

1. `src/lib/roleAccess.mjs` (pages, menu, routes) and `operational_security.has_capability` (SQL, latest body in migration 096) carry the same capability list. A parity test fails CI when they differ (fixes audit C3-1).
2. Routes stay an **allowlist** in `roleAccess.mjs` (already the single source for `middleware.js`, `ProtectedRoute.jsx` and `Sidebar.jsx`). A new admin page stays closed to her until listed.
3. Shared SQL commands replace `get_my_role() in ('director','admin')` with `require_capability('<name>')`.
4. Tables the admin pages write directly and that have no sensitive column get one uniform policy set, the pattern `attendance` already has since 096: receptionist select / insert / update, plus a restrictive `receptionist_delete_deny`.
5. **Exception:** `students`, `teachers` and `groups` have columns she must not write (archive mark, pay fields). She keeps the three definer commands with their key allowlists (fail-closed), widened. The page uses the admin form and picks the transport.
6. Guard against default opening: a test lists every function executable by `authenticated` and requires each to be classified "open to reception" or "locked".

Verified facts behind this:

- `place_learner_in_group` already accepts her (`assign_group`); only two role tests inside `academic_security.place` block items 11 and 12 (`127_enrollment_at_payment.sql:1014-1131`).
- `save_enrollment_changes` (127:818) refuses a status change and a programme/year change for everyone, and a level that differs from the group. Opening it to her gives exactly items 10 and 13.
- `end_learner` (120:686) has no balance condition today and requires a reason. `reopen_enrollment` (127:882) is a role test only.
- The admin learner form has the same 12 fields as hers plus the group (`StudentForm.jsx:39-52`).
- `save_receptionist_group` already takes the same 14 keys as the admin group form, capacity included.

## A. Table (partial)

| # | Action | Today | After | UI | JS map | SQL function | RLS | Files |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 9 | Move to a group of another level | page filter only | allowed | she gets the management branch of the dialog (level selector, all groups of the programme and year) | `canAssignGroup` (has it) | page calls `place_learner_in_group` instead of `save_receptionist_enrollment` | none | `EnrollmentModal.jsx`, `groups/[id]/page.jsx` |
| 10 | Level of a paid, unplaced enrollment | refused | allowed | same dialog | new `canEditEnrollment` | `save_enrollment_changes` → `require_capability('edit_enrollment')` | none | same |
| 11 | Full group, reason logged | refused | allowed | reason field shown to her; `canOverride` by capability | new `canOverrideCapacity` | `academic_security.place`: capacity test by capability | none | same |
| 12 | Group without paid enrollment, reason logged | refused | allowed | reason field; picker no longer greys the learner out | new `canPlaceWithoutPaidEnrollment` | `place`: drop the receptionist refusal, same reason rule | none | same, `groups/[id]/page.jsx:140-154,440` |
| 13 | Enrollment date and notes | hidden + refused | allowed | fields shown | `canEditEnrollment` | same as 10 | none | `EnrollmentModal.jsx:210-217` |
| 14 | Reopen an ended enrollment | hidden + refused | allowed | button by capability | new `canReopenEnrollment` | `reopen_enrollment` | none | `students/[id]/page.jsx:306` |
| 6 | « Ancien apprenant » | hidden + refused | allowed, reason required | button by capability; « Archiver » stays hidden | new `canEndLearner` | `end_learner` | none | `students/[id]/page.jsx:220` |
| 1 | Group while creating the learner | separate form | admin form | `StudentForm` for her; retire `ReceptionistStudentForm` | `canPlaceWithoutPaidEnrollment` | create through `save_receptionist_student`, then `place_learner_in_group` | none | `students/new/page.jsx`, `StudentForm.jsx:64` |
| 2 | Programme, level, source on the dossier | refused | allowed with the limit | inline selects and form fields | `canEditStudentProgramme` → operations | `save_receptionist_student` update keys + condition | none | `students/page.jsx:155,454-473` |
| 3 | Learner or parent e-mail | read-only | allowed while no family link (active or pending) exists for that address | fields editable, French refusal otherwise | new `canEditStudentEmail` | `save_receptionist_student` update keys + `family_links` check | none | `StudentForm.jsx` |
| 4 | Pick-up adults | read only | add, edit, remove | **(unverified: the edit UI on the dossier)** | new `canManageAuthorizedAdults` | none | drop insert/update/delete deny on `authorized_adults`, add receptionist write policy | `students/[id]/page.jsx` |
| 5 | « Sortie des jeunes » | closed | record and view | menu, route `/dismissal` | new `canRecordDismissal` | `enforce_dismissal_integrity` (125:345) insert role list | drop `receptionist_deny`, add read + insert. Update and delete are already refused for every role by the trigger | `dismissal/page.jsx`, `Sidebar.jsx:39` |
| 15 | E-mail the placement result | refused | allowed | remove `role !== 'receptionist'` | new `canEmailFamilies` | `can_message_recipient` (123:1357) | none | `PlacementTestModal.jsx:113`, `api/email/send/route.js:84-88` |
| 16 | Grades, no delete | read only | add, edit | admin page for her; retire `ReceptionistAssessments`; CSV export hidden | new `canManageGrades`; `canDeleteAcademicRecords` stays management | none | drop insert/update deny on `assessments`, keep delete deny, add write policy | `assessments/page.jsx:140-147` |
| 17 | Portfolios, certificates, learning profiles, no delete | closed | create (these pages have no edit) | routes + menu; **add a capability gate on the certificates trash button, which has none today** (`certificates/page.jsx:213,237`) | new `canManageLearningRecords` | `storage_security.can_write` and `resolve_storage_asset` (123:1392-1459) for purpose `portfolio` | three tables: drop `receptionist_deny`, add read/insert/update, add delete deny | `portfolios/`, `certificates/`, `learning-assessments/` |
| 23 | Messages, notifications, announcements | closed | allowed, no delete | routes + menu; trash buttons hidden | new `canMessageFamilies` | `can_message_recipient`; e-mail route | `messages`, `notifications`, `announcements`: same policy set | `communications/page.jsx`, `notifications/page.jsx` |
| 26 | Dashboard and Reports without finance | closed | allowed | finance parts are separate RPCs, so they separate cleanly, but the pages must stop calling them for her: one failed query blanks the whole Reports page (`reports/page.jsx:171-185`) and the dashboard calls the finance RPCs for every role (`dashboard/page.jsx:98-102`) | new `canViewDashboard`, `canViewReports`; `canViewFinanceAnalytics` stays management | none | none | `dashboard/page.jsx`, `reports/page.jsx` |
| 7 | Invite parent / student, revoke | Settings only, admin | button on the dossier, address taken from the dossier | **after PR #188 (ELW) is released** | new `canInviteFamily` | `prepare_family_invitation`, `preview_family_invitation`, `revoke_family_link` (123:805-1023). **Do not widen `role_security.assert_transition`**: `change_user_role` shares it and she would be able to change a pending account's role. Add a separate family-only check in `portal_security.queue_role_invitation` | none | `FamilyLinksPanel.jsx`, `api/admin/invite/route.js:43-50` |
| 8, 18–22, 24, 25 | Portal previews, teachers, online, unpaid list, payment notes | | | **TO DO: inventory not received** | | | | |

## Bugs

- **C1-1:** the group picker shows « Complet » on a full group (count as the server counts seats); choosing it opens the reason field.
- **C1-2:** `membershipErrorMessage` ends with `return error.message || GENERIC` (`src/lib/academic/membershipActions.mjs`) and two forms toast `error.message` directly. The fallback becomes the generic French text; with (b) the English-only receptionist commands leave her pages.
- **C1-3:** when no other group exists, the dialog says so and the save button is disabled.
- **C2-1:** a trigger on `groups` writes an `activity_log` row for every change of `capacite_max`, for every role and path (`groups` has no log trigger today).
- **C3-3:** each PR updates `docs/ai/SECURITY_RULES.md` and `scripts/test-receptionist-browser.mjs` (line 201 asserts the old same-level rule).

## B. Ask Maroine (found so far)

1. **Item 2 is not "the same rule as admin".** The admin rule today is only "not in a group" (`guard_student_membership`, 120:346). A paid, unplaced enrollment does not block the admin. Apply your stricter rule to her only, or to everyone?
2. **Teacher leave requests** (approve or refuse, e-mails the teacher). Not placed.
3. **Who she can write to.** The admin can message families, teachers, staff and a typed address. You wrote "to families". Families only, chosen from the learner picker?
4. **Which messages she sees.** The admin Messages tab lists every message of the centre, including family ↔ teacher. All of them, or only the office's?
5. **Reports, « charge enseignants »** (groups and learners per teacher). Operational or pay-related?
6. **Items 3 + 7 together** let her alone give portal access to a child for any address (correct the e-mail, then invite). The admin can already. Both steps are logged. Accept?
7. **Certificates:** the code notes that issuing is irreversible and it e-mails the family. Keep it for her?

## C. Tests (outline; TO DO in full)

- Browser, logged in as a receptionist: complete every new item in the real pages, then check the stored result.
- Locked items: button, menu item and page absent; typed URL redirects to `/crm/leads`; API route answers 403; each locked function answers 42501; a DELETE as receptionist on every public table removes nothing.
- Admin, director, teacher, parent, student: the before/after equivalence harness of Batch G (`scripts/test-speed-as-the-centre-grows-local.mjs`) shows no difference; only receptionist outcomes change, exactly as table A lists.
- Capability parity (JS ↔ SQL) and the function classification test.

## D. PR split (proposal)

| PR | Content | Migration |
| --- | --- | --- |
| 1 | Groups: items 9–12, and 13 (same command and dialog, hiding it would need a new branch), C1-1, C1-2, C1-3, C2-1, map parity test | yes |
| 2 | Dossier and families: 1–6, 14, 15, the e-mail route with its recipient rule, dossier text (`students/[id]/page.jsx:291`) | yes |
| 3 | Learning and teaching: 16–22 | yes |
| 4 | Communication, money views, dashboard, reports: 23–26 | yes |
| 5 | Portal: 7 (after ELW), 8; revoke the retired commands `save_receptionist_enrollment` and `assign_receptionist_student_group`; `/helpdesk` guide text | yes |

Each migration is applied before its PR is merged and keeps the old commands working, so open browser tabs do not break.

## Still missing from this draft

Owner summary in the repository template, rows 8, 18–22, 24 and 25, the full locked list per layer, the complete test plan, release and recovery steps, ADR-018 (one capability map), and the IMPLEMENTATION CONTRACT.
