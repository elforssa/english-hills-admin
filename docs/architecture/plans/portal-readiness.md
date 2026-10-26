# Portal readiness — teachers and families (Batch F)

Revision **PRF-r2**, 2026-10-24: PRF-r1 plus the [review corrections](#review-corrections-prf-r2) for the independent review of head `e90f8f1` (CHANGES REQUIRED: B1, I1–I4, minor items and test gaps) and the owner's Q6 answer. **Status: PRF-r1 APPROVED** (owner, 2026-10-24, at plan head `ba94ad3`, Q1–Q5 and Q7–Q9 = A); **Q6 answered = C** (owner, 2026-10-24 16:16 Asia/Shanghai); **PRF-r2 APPROVED FOR IMPLEMENTATION** (owner re-approval 2026-10-24 16:36 Asia/Shanghai at head `7c231ed`, after the independent re-review returned READY FOR FINAL REVIEW; [approval record](#approval-record)). The migration, the cleanup, the merge, the deployment and every Production step each still need their own explicit owner approval. **Tier 3** (authorization, RLS and grants on learner, finance and messaging tables; a new family-link model that decides cross-family visibility; invitation flow; e-mail sent from the centre's domain; existing Production rows touched by a separately approved cleanup). Nothing here is implemented, merged or deployed. Presence in the [plans index](README.md) is not approval.

Baseline: `origin/main` `ba009b4` (PR #149), read 2026-10-24. Production (project `hopcezradkhrixwwswxn`) checked **read-only** on 2026-10-24 with catalog queries (`pg_proc`, `pg_policies`, `information_schema`) and aggregate counts only; no personal value was read into this document. Source findings: the 2026-10-24 platform audit (Language center project doc `claude/platform-audit-2026-10-24-full.md`; where a verifier corrected a finding, the verifier's version is used).

# Owner summary

**Outcome.** Before the first teacher, parent or student account is invited, each role can see and change only what it should, each family account is linked only to the learners staff explicitly approved, and staff keep control of who is linked to whom. Today there are **0 teacher, 0 parent and 0 student accounts**, so none of the problems below has happened; each one would happen on the first invitation.

## What will change

- **Teachers stop receiving whole learner records.** Today a teacher's database access returns every column of a learner: phone, e-mail, parent e-mail, birth date and the reception's internal notes (113 of 222 active learners have a note). After this change teachers read a fixed **class list**: name, photo, level, age category, programme, status and group (owner decision Q1). The group page stops showing phone numbers to teachers.
- **Families stop receiving staff-only fields.** Parents and students today receive the internal learner note, receipt internal notes (44 receipts) and void reasons (14), enrollment notes and charge correction details in the data sent to their browser, even where the screen hides them. After this change the portals read through fixed projections that contain only what a family should see.
- **Families are linked explicitly.** Today a parent sees every learner whose `parent_email` text equals their login e-mail. One placeholder address sits on **33 learner records** (and is the parent e-mail of 7 children of 7 families). After this change a family account sees only the learners staff linked to it at invitation time, from a list the system proposes; ambiguous or shared addresses are refused; later edits to a dossier's e-mail never grant or remove access by themselves (Q3).
- **Teachers can no longer permanently delete grades, attendance, portfolios or placement tests**, and every change or deletion of those records is written to the activity log (Q2).
- **Students can no longer rewrite or delete their teacher's portfolio feedback** or hide entries from their parents.
- **Messaging goes through the centre.** Families no longer see any teacher's e-mail address, teachers no longer see any family address, notification e-mails come from a fixed English Hills sender with no personal reply address, and nobody can choose the sender name shown on an e-mail or message (Q5).
- **Cross-site requests are refused.** Every signed-in action route (invitations, role changes, payroll, e-mail, file upload, online lessons) refuses a request that does not come from the admin site itself.
- **Notifications and messages follow the accounts, not addresses.** A notification or message is shown in a portal only to the account it was addressed to, and a message about a learner only while that account is linked to the learner; rows sent to a bare dossier address are e-mail only and never appear in a portal.
- Smaller fixes in the same outcome: teacher access to a learner ends when the learner is no longer a member of the teacher's group (membership as defined by the approved [enrollment and group consistency plan](enrollment-group-consistency.md)) or is archived; a teacher account whose record is archived loses access; the magic-link form stops creating accounts; anonymous visitors can no longer call 11 internal helper functions; middleware look-alike paths stay protected; office notifications about a child reach the parent; the admin message dialog no longer hangs when an e-mail is refused.

## What staff/users will be able to do

- **Director / admin:** invite a parent or student and choose, from a proposed list, which learners the account is linked to; see and revoke a family's links from the learner file; invite a teacher (the teacher account is tied to one teacher record); everything they do today. Portal messages to "Accueil English Hills" arrive in a dedicated admin login on the centre's shared office mailbox (Q6 = C).
- **Receptionist:** unchanged operations; sees on the learner file which family accounts are linked (read-only) (Q4 = A).
- **Teacher:** see the class list of their own groups, take attendance, enter and correct grades, learning assessments and portfolio feedback, and message the office or the families of their own learners by name ("Parent de …"), without seeing any address.
- **Parent:** see each linked child's group, timetable, attendance, grades, portfolio, receipts and balance; download receipts; message the office or the child's teachers; request re-enrollment.
- **Student (adult or teen):** the same for their own record, plus adding their own portfolio entries.

## What remains restricted

- Teachers never see a learner's or parent's phone, e-mail, birth date, address, internal notes, receipts, balances or enrollment notes, in any screen, API or database read.
- Families never see internal notes, void reasons, who recorded a payment, e-mail delivery diagnostics or another family's data.
- Teachers cannot delete academic records (Q2 = A); students cannot change teacher feedback or visibility.
- Nobody can link a family account to a learner except director/admin (Q4), and only to learners whose dossier carries the invited address.
- No new self sign-up; no online payment; no change to finance authority, CRM, enrollment confirmation, Meta or the online-learning teacher boundary.

## UI impact

- **Invite dialog** (users / settings): for a parent or student invitation it now shows the learners the address matches, with checkboxes, and refuses shared or ambiguous addresses with a French explanation. Teacher invitations pick the teacher record.
- **Learner file:** a small "Comptes famille" panel listing linked accounts, with "Retirer l'accès" for director/admin.
- **Teacher pages** (`/teacher-portal`, `/groups/<id>`, `/attendance`, `/assessments`, `/portfolios`, `/learning-assessments`): same screens, fed by the class list; no phone column; no delete buttons for teachers.
- **Portals:** same screens; the message composer lists names ("Accueil English Hills", "M. X — enseignant", "Parent de Y"), never addresses.
- **Notifications and Communications pages:** choosing a learner targets the linked account(s); without one, the form says "e-mail uniquement, pas de compte".
- **Family receipt download:** the family copy of a receipt omits the contact lines (e-mail, phone) printed on the staff copy.

## Database impact

One forward-only migration, `XXX_portal_readiness.sql` (number chosen just before merge), with no destructive change to existing rows: one new table (`family_links`) and a small private snapshot table for the cleanup; new read functions for the class list, the family portal and messaging; re-created helper functions (`get_visible_student_ids`, `get_my_teacher_id`, `teacher_can_access_student_group`, `can_message_recipient`, `get_teacher_directory`, `resolve_storage_asset`, `storage_security.can_write`, `prepare_role_invitation`, `apply_pending_role`, `log_activity`, `mark_my_notifications_read`, `mark_message_read`) from their latest definitions; a recipient account column on `notifications` and on `messages`, and a teacher column on `pending_roles`; teacher, parent and student read policies on learner, enrollment, receipt and charge tables replaced by the read functions; teacher delete removed; activity-log triggers on five academic tables; e-mail normalisation triggers and constraints (validated only after the approved cleanup); EXECUTE revoked from `anon` on 11 functions. Staff (director, admin, receptionist) policies are untouched.

Data cleanup (separate, owner-approved step, not run by this plan): normalise 7 e-mail values that differ only by case or spaces; clear the placeholder address from 33 learner records; staff review of 9 other shared addresses before those families are invited.

## Important security decisions

1. **Column exposure is fixed by removing direct reads, not by hiding fields in the UI.** PostgreSQL column grants apply to the shared `authenticated` database role used by staff and portal users alike, so they cannot separate a teacher from an admin. Portal roles therefore lose their direct SELECT policies on `students`, `enrollments`, `receipts`, `charges` (and `charge_balances`), `placement_tests`, `attendance` and `certificates`, and read through SECURITY DEFINER functions with fixed column lists. Staff keep their existing direct access.
2. **A family link is an explicit row approved by staff**, created at invitation from the dossier's address and confirmed child by child; the address only proposes. Revoking a link or archiving a learner ends access immediately.
3. **A teacher account is tied to one teacher record** (`profiles.linked_teacher_id`, which already exists and is protected), not to an e-mail lookup; an archived record grants nothing.
4. **Portal messaging never exposes an address, and portal inboxes are keyed by account, not address**: recipients are opaque keys resolved on the server to linked accounts; a portal shows a notification or message only to its recipient account and, when it concerns a learner, only while that learner is linked; sender names come from records, not editable profiles; non-staff notification e-mails use a fixed sender and no personal Reply-To.
5. **Every cookie-authenticated state-changing route checks the request origin**, because `english-hills.com` is the same site as `admin.english-hills.com` for browser cookies.
6. **Deny by default, proven by tests**: a cross-role denial suite runs in CI and fails if any portal path returns a staff-only column or another family's row.

## Risks / owner review points

1. **Large application change on teacher and family screens.** Every teacher page and both family portals change their data source. There are no live portal users, so the risk is functional (a screen showing nothing), not a leak; the browser checks and a pilot invitation catch it.
2. **The placeholder address must be cleaned before families are invited**, and 9 other shared addresses need a human look. The new invite check refuses the placeholder anyway, and portals no longer show rows addressed to a bare dossier address (D7b), but e-mail-only office notifications still go to dossier addresses (C2 in the [cleanup plan](#data-cleanup-plan-not-run-owner-approval)).
3. **No groups have a teacher yet (0 of 8).** Teacher accounts are useless until each group is assigned (readiness checklist).
4. **Overlap with other work:** the approved enrollment and group consistency plan (Batch D, merged as PR #154) re-creates five of the same functions; PR #124 (RLS performance) rewrites the same policies; PR #150 (merged) changed `/api/email/send`; Premium Release B re-creates the storage functions; online learning reuses `get_visible_student_ids` and writes notifications. Ordering rules are in [Interaction with other work](#interaction-with-other-work).
5. **Online routes get the origin check too.** They belong to the online module (live switch off); the guard is a shared, behaviour-neutral check for same-origin browsers, and the online browser tests must still pass.
6. **No Production backup is available** on the current Supabase plan (owner, 2026-10-21). The migration rewrites no existing row, but the cleanup does; the cleanup keeps a private before-image instead (C0).

## Baseline and evidence limits

- Code read at `ba009b4`; the SQL definitions this plan re-creates were read directly from Production (`pg_get_functiondef`, `pg_policies`) on 2026-10-24, and the latest migration that defines each one was located in the repository (listed under [Migration strategy](#migration-strategy)). A line-by-line comparison of Production with those files was not made; the implementation task makes it (prerequisites).
- Counts are aggregates only. The placeholder address is deliberately not written anywhere in the repository; the release task identifies it at run time by query, not by value.
- Not checked: Supabase Auth settings (sign-up, confirm e-mail, leaked-password protection), Vercel environment variables and cookie attributes in a live browser. Those items are in the readiness checklist as owner checks.
- Local Supabase/Docker was not available to this architecture task; nothing was executed locally.

## Verified current state

| Finding | Verified on 2026-10-24 (Production catalog, latest definition) |
| --- | --- |
| POR-1 / ACC-1 | `students teacher read groups` (PERMISSIVE SELECT, `teacher_can_see_student(id)`, 071) returns all 22 columns; `authenticated` has table SELECT. `enrollments teacher read` (group-based) returns `notes`. Teacher pages load `entities.Student.listAll` (`select('*')`, [entities.js](../../../src/lib/entities.js)); [groups/[id]](../../../src/app/(admin)/groups/[id]/page.jsx) line 211 renders `telephone` without a role check; [teacher-portal](../../../src/app/(admin)/teacher-portal/page.jsx) lines 529–533 build recipients from `parent_email`/`email`. |
| ACC-1 / POR-3 | Families read whole rows through `students parent read self` / `students student read self` (006), `enrollments parent select`, `receipts parent read`, `receipts student financial read`, `charges family read` and the `security_invoker` view `charge_balances` (which aggregates `receipts`). Staff-only columns reachable: `students.notes` (113 rows), `students.referral_source`, `enrollments.notes` (5), `receipts.payment_note` (44), `receipts.void_reason` (14), `receipts.actor_id/actor_name`, `receipts.email_*`, `receipts.idempotency_key`, `charges.void_reason/voided_by/created_by`, `placement_tests.notes/examinateur`, `attendance.notes`, `certificates.notes`. |
| ACC-2 / POR-5 | `get_visible_student_ids()` (025): `parent_email = get_my_email()` or `email = get_my_email()`, exact text. Reused by every family policy, `can_access_premium_group` and `online_security.evaluate_join` / `family_lessons`. `resolve_storage_asset` (096) and `storage_security.can_write` (096) repeat exact e-mail matches. Shared addresses among 222 active learners: `parent_email` shared by >1 learner: 5 addresses (7, 3, 2, 2, 2 learners); learner `email` shared: 6 addresses (33, 2, 2, 2, 2, 2). The 33-learner address is also the 7-learner `parent_email` (33 distinct rows, all `Enrolled`, 30 distinct surnames, 0 archived, 0 profiles, 0 pending invitations; it is also on 27 issued receipts). Not normalised: 4 `parent_email`, 2 learner `email`, 1 teacher `email`; 0 case-variant collisions. 47 learners carry an `email` equal to some learner's `parent_email`. Profiles with `linked_student_id`/`linked_teacher_id`: 0 / 0. |
| Invite flow | [/api/admin/invite](../../../src/app/api/admin/invite/route.js) (admin/director) → `prepare_role_invitation` (077) queues `pending_roles` (7-day expiry) → `apply_pending_role` (042 lineage) on a confirmed Auth e-mail. Nothing shows or limits the learners an address will open. |
| ACC-3 | `assessments teacher rw`, `learnassess teacher rw`, `placement teacher rw`, `portfolios teacher rw` are `ALL`; `attendance teacher delete` exists. `log_activity_t` triggers exist only on certificates, enrollments, leave_requests, payroll, profiles, receipts, students, teachers. `canDeleteAcademicRecords` ([roleAccess.mjs](../../../src/lib/roleAccess.mjs)) is defined and unused. `save_attendance` is SECURITY INVOKER and never deletes. |
| ACC-7 / POR-6 / ACA-10 | `portfolios student update/delete/insert` have no column or author restriction; `storage_security.bind_record` protects teacher fields only when `file_url` is an asset reference. `portfolios` has no author column. 2 rows in Production. |
| POR-2 | `get_teacher_directory` (096) returns `email` of every active teacher to parent/student/teacher; 7 of 8 active teachers use a non-centre address. |
| POR-4 / ACC-8 | [/api/email/send](../../../src/app/api/email/send/route.js) sets From display name from the editable `profiles.full_name` and `replyTo` to the caller's login e-mail; `messages self insert` checks only `from_user_email` and recipient. |
| POR-7, POR-8 | As described in the audit ([communications](../../../src/app/(admin)/communications/page.jsx) has no error handling; [notifications](../../../src/app/(admin)/notifications/page.jsx) targets the learner's own `email`). |
| POR-9 | `teacher_can_access_student_group` (071): enrollment branch checks only `e.status in ('Validated','Trial')`. |
| ACC-4 | No Origin check on `admin/invite`, `admin/update-role`, `admin/payroll`, `email/send`, `storage/sign`, `storage/finalize`, `online/join`, `online/courses/activate`, `online/courses/close`, `online/lessons/cancel`, `online/lessons/reschedule`. The internal CRM routes already compare `Origin`. |
| ACC-5 | [login](../../../src/app/(auth)/login/page.jsx) `signInWithOtp` without `shouldCreateUser: false`; `groups read all auth`, `appconfig auth read`, `announcements audience read` only require a session. |
| ACC-9 | `get_my_teacher_id()` (025): `select id from teachers where email = get_my_email() limit 1`; no `deleted_at` filter; 1 archived teacher today. |
| ACC-10 | 11 SECURITY DEFINER functions executable by `anon` (re-confirmed for `get_my_role`, `mark_my_notifications_read`). `anon` holds 200 table grants in `public`, so policies `TO public` that call these helpers are evaluated for anonymous requests. |
| COD-6 | [middleware](../../../src/middleware.js) matcher exempts unanchored `monitoring` and any path ending in an image extension. |
| DAT-8 | 0 of 8 groups have `teacher_id`; 8 active teachers; 0 teacher accounts. |
| B1 (review) | `notifications self read` is `recipient_email = get_my_email()`; `mark_my_notifications_read` and `mark_message_read` match on e-mail; `messages self read` matches `to_user_email`/`from_user_email`. Writers that store a dossier address rather than an account: [communications](../../../src/app/(admin)/communications/page.jsx) (learner `email`), the notification form (learner `email`), and `online_security.notify` (117), which inserts one row per distinct dossier address from `online_security.lesson_recipients` (learner `email` and `parent_email`) with `student_id` set. Neither table has an account column. |
| Other readers (review) | `legacy_receipt_reconciliation` (055) is a `security_invoker` view over `receipts`, granted to `anon` and `authenticated`. Premium tables carry free-text staff fields readable by families or teachers (`premium_attendance.notes`, `premium_sessions.teacher_note`/`focus_note`, `premium_groups.notes`); all Premium tables are empty and the module is retired from the application (Release A). |
| Context | 5 profiles (1 director, 1 admin, 3 receptionists); 0 messages, 0 notifications, 0 pending invitations. |

## Scope and non-goals

**In scope:** POR-1, ACC-1/POR-3, ACC-2/POR-5, ACC-3, ACC-7/POR-6/ACA-10, POR-2, POR-4/ACC-8, POR-7, POR-8, POR-9, ACC-4, ACC-5 (code part), ACC-9, ACC-10, COD-6 (if still open on main), the DAT-8 prerequisite (checklist only), a data cleanup plan and the invitation readiness checklist.

**Non-goals:** staff (director/admin/receptionist) data access; finance engine, CRM, Meta, enrollment confirmation; the online-learning teacher boundary (already structural, ADR-008) beyond the shared helpers it calls; the leaver / year-end flow and group membership (Batch D, [enrollment and group consistency](enrollment-group-consistency.md)); MFA enforcement (ACC-6, owner setting); removal of the Premium tables (Release B; this plan only guards them, see D2); retiring pre-inscription or the parent re-enrollment request (separate owner plan); receipt e-mail delivery to dossier addresses; rewriting issued receipts.

## Design

### D1 — Field exposure by role

Staff-only fields (never returned to teacher, parent or student by any path):

| Table | Staff-only columns |
| --- | --- |
| `students` | `notes`, `referral_source`, `photo_consent_at`, `plan_type`, `premium_*`, `deleted_at`; for teachers additionally `telephone`, `email`, `parent_email`, `date_naissance` |
| `enrollments` | `notes`, `documents_urls`, `registration_request_id`, `registration_payload_hash`, `consent_*` |
| `receipts` | `payment_note`, `void_reason`, `voided_by`, `actor_id`, `actor_name`, `email_delivery_status`, `email_request_id`, `email_attempt_count`, `email_last_attempted_at`, `email_last_error`, `idempotency_key`, `deleted_at`, `legacy` (families get a derived `is_legacy` boolean instead), `referral_source`, `photo_consent`, `plan_type`, and for families also the contact snapshot `email` and `telephone` (a receipt's snapshot can carry a third party's address: 27 live receipts carry the placeholder address) |
| `charges` / `charge_balances` | `void_reason`, `voided_by`, `created_by`, `legacy`, `legacy_receipt_id`, `plan_type` |
| `placement_tests` | `notes`, `examinateur`, `crm_lead_id` (families; teachers keep `notes`/`examinateur`) |
| `attendance`, `certificates` | `notes` (families, unless Q7 = B) |

**Teacher class list (Q1 = A):** `student_id`, `full_name`, `photo_url` (asset reference, resolved through the existing storage authorization), `niveau_cefr`, `age_category`, `session_type`, `status`, `group_id`, and the membership enrollment's status (Validated / Trial). Nothing else. Membership follows [D4](#d4--teacher-identity-and-lapse-acc-9-por-9).

**Family projection:** the learner's identity block (name, photo, level, age category, programme, status, group name, days, times, room, teacher display name) plus the record sections in D2. Receipt fields are those read by [receiptPdf.js](../../../src/lib/receiptPdf.js) and the portal's receipt helpers, minus the staff-only list above: the family projection never contains the receipt's `email` or `telephone` snapshot (the family PDF omits those lines; the staff copy is unchanged) and replaces `legacy` with `is_legacy`, which the PDF code reads in the family path. The implementer derives the list from that code; the denial suite enforces the denylist by column name **and** by value (no address or phone of anyone other than the caller appears anywhere in a portal response).

### D2 — Read model: projections instead of whole rows

**Policies removed** (latest definitions, re-checked at implementation): `students parent read self`, `students student read self`, `students teacher read groups`; `enrollments parent select`, `enrollments parent insert`, `enrollments teacher read`; `receipts parent read`, `receipts student financial read`; `charges family read`; `placement parent read`, `placement student read`; `attendance parent read`, `attendance student read`; `certificates parent read`, `certificates student read`. `charge_balances` stays `security_invoker` for staff; families get balances only from the projection (computed inside the definer function from all live receipts, so a family's balance is never understated by RLS).

**Policies kept for families** (no staff-only columns, scoped by the new link function): assessments, learning assessments, portfolios (D6), authorized adults (parent), dismissal logs (parent), announcements (audience). Notifications and messages are re-keyed by account (D7, D8).

**Other readers.** `legacy_receipt_reconciliation` keeps `security_invoker` (portal roles see 0 rows once their receipt policies are gone); `anon`'s SELECT on it is revoked. **Premium tables** keep their policies until Release B, with two guards: the R0 readiness check requires every Premium table to be empty (all are today), and the denial matrix covers them, so a non-empty Premium table blocks the first invitation instead of exposing its free-text staff fields.

**New functions** (SECURITY DEFINER, `search_path = pg_catalog, pg_temp`, EXECUTE to `authenticated` only, revoked from `public`/`anon`; each re-checks the stored role and the link on every call; refusals use closed `portal.<reason>` hints with SQLSTATE `42501` (not allowed) or `22023` (invalid input), and every deliberate conflict (a link that already exists, a link already revoked, a stale invitation, a concurrent re-invitation) uses `PT409` with a `portal.<reason>` hint, never `40001`, per [ADR-009](../decisions/ADR-009-conflicts-never-retryable.md); results are bounded as stated):

| Function | Caller | Returns |
| --- | --- | --- |
| `portal_teacher_roster(p_group_id uuid default null)` | teacher | Class list rows (D1) for the caller's groups (or one group the caller owns); refuses another teacher's group. At most 500 rows (a group holds at most its capacity). |
| `portal_my_learners()` | parent, student | One row per linked learner: identity block (D1). At most 10 rows (a parent link set is capped at 4 by D3). |
| `portal_learner_record(p_student_id uuid)` | parent, student | `jsonb` with `enrollments` (status, programme, level, school year, group, date), `receipts` (projection), `charges` (net, paid, balance, status, due date, programme, school year, voided flag), `attendance` (date, status; `notes` only if Q7 = B), `placement_tests` (date, score, recommended level, status), `certificates` (issued only). Refuses an unlinked learner. Each section is capped (200 most recent attendance rows; 100 receipts, charges, enrollments, placement tests and certificates); a `truncated` flag says when a cap was hit. |
| `portal_request_reenrollment(p_student_id uuid)` | parent | Inserts the same `Submitted` enrollment the portal creates today (no group, no documents), replacing the `enrollments parent insert` policy whose `students` sub-query would fail once families cannot read `students`. |

The teacher keeps direct, group-scoped access to `attendance`, `assessments`, `learning_assessments`, `placement_tests`, `portfolios` and `certificates` (D5 limits writes); those tables hold no family contact data.

### D3 — Family link model (Q3 = A)

**Table `family_links`** (RLS on, no direct API grant; read and written only through functions):
`id`, `student_id` → `students` (ON DELETE RESTRICT: learners are archived, never deleted), `relation` (`parent` | `self`), `profile_id` → `profiles` (NULL while pending; ON DELETE CASCADE, so a deleted account leaves no link), `invite_email` (normalised), `pending_role_id` → `pending_roles` (ON DELETE CASCADE; set to NULL when the link is activated, so later deletion of the queue row cannot touch an active link), `status` (`pending` | `active` | `revoked`), `created_by`, `created_at`, `activated_at`, `revoked_by`, `revoked_at`, `revoke_reason`. Partial unique index on `(student_id, profile_id, relation)` where `status = 'active'`; at most one active `self` link per learner; at most 4 active `parent` links per account. A CHECK ties the shape to the status (pending ⇒ `pending_role_id` not null and `profile_id` null; active ⇒ `profile_id` not null and `pending_role_id` null; revoked ⇒ `revoked_at` not null). Insert, activation and revocation write `activity_log` rows (ids and relation only, no address).

**Visibility.** `get_visible_student_ids()` is re-created to return `student_id` from active links where `profile_id = auth.uid()`, the relation matches the stored role (`parent` → `parent`, `student` → `self`) and the learner is not archived. No e-mail comparison remains. Every existing family policy, `can_access_premium_group`, and the online-learning functions that call it switch automatically. `resolve_storage_asset`, `storage_security.can_write` and `can_message_recipient` are re-created from their latest definitions with their e-mail comparisons for parent/student replaced by the same link test (and their teacher comparisons by D4). Archiving hides a learner from every linked account; **restoring** an archived learner (Plan D's `restore_student`) resumes the existing active links, which stay listed on the learner file so staff can revoke them first.

**Invitation lifecycle.** The facts this must fit (latest definitions): `prepare_role_invitation` (077) upserts `pending_roles` on `lower(btrim(email))`, keeping the same row id when an address is re-invited, possibly with another role; `apply_pending_role` (042 lineage) deletes the queue row on success **and** on every refusal path (expired, wrong target, issuer no longer allowed).

1. **The old path is closed for portal roles.** `prepare_role_invitation` is re-created from 077 to refuse `parent`, `student` and `teacher` (`42501`, hint `portal.use_portal_invitation`); its body moves unchanged into a private helper (`portal_security.queue_role_invitation`, no API grant) that both it (for staff roles) and the new functions call, so authorization, expiry and the director guard stay identical. `/api/admin/invite` routes portal roles to the new functions. Role management (`change_user_role`) can still set a portal role on an existing account; such an account sees nothing until links (or a teacher record) are added through the functions below, so it fails closed.
2. **Preview.** `preview_family_invitation(p_email, p_role)` (director/admin) normalises the address and returns, for each active learner whose normalised `parent_email` (parent) or `email` (student) equals it, the learner id, name, age category, group and a flag for mixed surnames / phones; no address is echoed back.
3. **Refusals** (`prepare_family_invitation` and `link_family_student`): an address on the centre domain, of a staff profile or of a teacher record; more than **4** matches (parent) or more than **1** match (student); for a student invitation, an address that is also another learner's `parent_email`; a `self` link to a Young Learners (6–12) learner (Q8 = A); a selected learner that is not among the matches; no learner selected. Messages are French and name the reason ("adresse partagée par plusieurs familles — corrigez les fiches avant d'inviter").
4. **Confirmation.** When the matches show mixed surnames or phones, the dialog requires an explicit per-child confirmation ("J'ai vérifié avec la famille"); the function receives only the ticked ids.
5. **Queue and links in one transaction.** `prepare_family_invitation(p_email, p_role, p_student_ids uuid[])` locks the queue row for the address (`for update`, as 077 does), **deletes every pending link of that queue row first** (a re-invitation, with the same or another role or other children, never inherits earlier pending links), queues the role through the private helper, then inserts the new `pending` links. A concurrent second invitation for the same address raises `PT409` (`portal.stale`).
6. **Teacher invitations** (`prepare_teacher_invitation(p_email, p_teacher_id)`): require exactly one active teacher record with that normalised e-mail, equal to `p_teacher_id`, not already linked to another profile. The teacher id is stored on the queue row in a new nullable column `pending_roles.teacher_id` (→ `teachers`, ON DELETE CASCADE; CHECK `teacher_id is null or role = 'teacher'`). A re-invitation of the same address for another role clears it.
7. **Activation.** `apply_pending_role` is re-created from its latest definition with one block inserted **after** the role is set and **before** the queue row is deleted: for `parent`/`student`, it activates that queue row's pending links whose relation matches the role (sets `profile_id`, `status = 'active'`, `activated_at`, `pending_role_id = NULL`); for `teacher`, it sets `profiles.linked_teacher_id` from `pending_roles.teacher_id` if that record is still active and unlinked (otherwise the role is set but no teacher is linked, and the invite dialog shows it). On every refusal path the queue row is deleted as today and its pending links go with it (cascade). An expired invitation therefore leaves no link.
8. **Later links.** For an existing parent or student account, `link_family_student(p_profile_id, p_student_id)` applies the same refusals against the account's login e-mail and creates an active link directly; `link_teacher_account(p_profile_id, p_teacher_id)` does the same for a teacher account.

**Revocation.** `revoke_family_link(p_link_id, p_reason)` (director/admin; `PT409` `portal.link_not_active` if the link is already revoked). Effects: every portal read, storage link, message and notification about that learner disappears for that account at once (D7b); new online join passes are refused at once; a join pass already issued for a lesson in progress stays valid until its existing expiry (lesson end plus grace, ADR-008) because the online module's revoke reasons are a closed list this plan does not change; the online host can remove the participant. A dossier e-mail edit never changes links (the learner file shows a warning when the dossier address no longer equals a linked account's address).

### D4 — Teacher identity and lapse (ACC-9, POR-9)

- `get_my_teacher_id()` returns `profiles.linked_teacher_id` for `auth.uid()` when the role is `teacher` and the teacher record is not archived; otherwise NULL. No e-mail lookup, no `limit 1`. Unique partial index on `teachers (lower(btrim(email)))` where `deleted_at is null` and `nullif(btrim(email), '') is not null` (1 active teacher has an empty e-mail today), so invitations stay unambiguous.
- **Teacher lapse = membership as defined by the approved [enrollment and group consistency plan](enrollment-group-consistency.md) (Plan D, EGC-r2, D-1) AND the learner not archived.** Plan D defines membership as a Validated or Trial enrollment with that group on a non-archived learner, behind the private helper `academic_security.is_group_member(p_student, p_group)`; its `Ended` status clears `group_id`, and the school year ends through its `close_school_year` command. This plan adds **no** separate date or school-year rule (PRF-r1's school-year condition is withdrawn: it would have cut access for the one grouped Validated enrollment whose `school_year` is NULL, which Plan D's cleanup stage C1b fixes).
- **One teacher-visibility helper.** This plan adds `portal_security.teacher_member(p_teacher_id uuid, p_student uuid, p_group uuid default null)` (private, no API grant): the teacher record is not archived, a group (or the given group) has `teacher_id = p_teacher_id`, and the learner is a member of that group. `portal_security.teacher_sees(p_student, p_group)` is its caller form: caller's role is `teacher`, `get_my_teacher_id()` is not NULL, and `teacher_member(get_my_teacher_id(), p_student, p_group)`. D7b's trigger uses `teacher_member` with the recipient's linked teacher id. It is the only membership test used by `teacher_can_access_student_group`, `portal_teacher_roster`, the teacher branches of `can_message_recipient`, `resolve_storage_asset` and `storage_security.can_write`, and the teacher `attendance` insert/update policies (in addition to the unchanged integrity check `attendance_student_in_group`). Build order:
  - **Plan D's M2 merged first (recommended order):** `teacher_sees` calls `academic_security.is_group_member` and checks nothing else about membership; every re-created function starts from Plan D's M2 definitions.
  - **This plan first:** `teacher_sees` uses an interim rule equal to today's union narrowed to non-archived learners: (`students.groupe_id` = the group and status `Enrolled`/`Trial`) or (a Validated/Trial enrollment in the group, any `school_year`, NULL included); Plan D's M2 later replaces the interim body with its helper in the same re-creation, and its "only narrows access" proof covers the switch.
- The Premium branches of `teacher_can_see_student` are left as they are (Release B removes them); `teacher_can_see_student` is no longer used by any `students` policy.

### D5 — Teacher academic writes, deletion and audit (ACC-3, Q2 = A)

- Split `assessments teacher rw`, `learnassess teacher rw`, `placement teacher rw`, `portfolios teacher rw` into SELECT / INSERT / UPDATE with the same predicate; drop `attendance teacher delete`. Teachers correct attendance by changing the status.
- Add `log_activity_t` (AFTER INSERT OR UPDATE OR DELETE) to `assessments`, `learning_assessments`, `placement_tests`, `portfolios`, `attendance`. `log_activity` is re-created from its latest definition (021) with per-table safe-column lists: identifiers, dates, status, level, grade values and `terme` (so a director can restore a deleted grade); free-text fields (`commentaire`, `notes`, `teacher_note`, `teacher_notes`, `description`) stay redacted.
- UI: delete buttons on the teacher-reachable pages and in the teacher portal use `canDeleteAcademicRecords` (management only).

### D6 — Student portfolio boundary (ACC-7 / POR-6 / ACA-10)

- Add `portfolios.created_by uuid` (existing rows stay NULL). A BEFORE INSERT trigger sets it to `auth.uid()` whatever the client sends (NULL only for service or migration writes); a BEFORE UPDATE trigger refuses any change to it (`42501`, `portal.immutable_author`).
- Student UPDATE / DELETE only where `created_by = auth.uid()` and `teacher_id is null`; a BEFORE INSERT OR UPDATE trigger forces, for the student role and regardless of `file_url`, `teacher_note`, `teacher_id` to NULL on insert and unchanged on update, and `visible_to_parent`, `visible_to_student` to true on insert and unchanged on update. `bind_record` keeps its asset checks.

### D7 — Messaging and e-mail (POR-1 composer, POR-2, POR-4 / ACC-8, Reply-To, POR-7; Q5 = A, Q6 = C)

- **Office inbox (Q6 = C, owner 2026-10-24):** a dedicated centre login with role `admin` on the shared office mailbox `contact` at the centre's domain (the owner's address; written in full in the [approval record](#approval-record)) receives the `office` key. The migration does not create the account: the release task invites it through the existing staff invitation (director approval) and records it in the app configuration as the office recipient; until it exists, `office` messages are refused with `portal.office_not_configured` (no fallback to a personal account).
- **Recipients:** `portal_message_recipients()` returns opaque keys and labels: `office` ("Accueil English Hills"); for families, `teacher:<teacher_id>` for the teachers of linked learners' groups (teachers with a linked, non-archived account only); for teachers, `parent:<student_id>` and `learner:<student_id>` for roster learners that have an active link of that relation. No address is returned. At most 200 keys.
- **Send:** `portal_send_message(p_recipient_key, p_subject, p_body, p_reply_to_id default null)` resolves the key to **accounts**, never to dossier addresses: `office` → the Q6 account; `teacher:<id>` → the profile whose `linked_teacher_id` is that teacher; `parent:<student_id>` → every account with an active `parent` link to that learner (one message row per account); `learner:<student_id>` → the account with the active `self` link. A key that resolves to no account is refused (`portal.no_linked_account`); there is no e-mail-only fallback for portal senders. The function sets `sender_profile_id`, `recipient_profile_id`, `to_user_email` (the recipient account's login), `student_id` (the learner the key names, or the caller's linked learner for family senders writing to a teacher or the office, chosen in the composer when the account has several), `from_name` from the teacher record, "Parent de <prénom>" or the learner's name (never `profiles.full_name`), a fixed `type`, `read = false`; enforces lengths and the existing rate limits; returns the message ids. A reply resolves to the original sender's account and keeps `student_id`.
- **Inbox:** `portal_my_messages(p_box text, p_before timestamptz default null)` returns at most 100 rows per page: id, date, subject, body, read flag, the counterpart's label, `reply_to_id`; no address. Visibility follows D7b.
- `messages self insert` / `messages self read` are limited to director/admin (the staff Communications page keeps working); teachers, parents and students use the functions above.
- `get_teacher_directory` is restricted to director, admin, receptionist and, for a teacher, the caller's own row; parents and students lose access (the portals no longer need it).
- **E-mail route:** for non-staff callers, `to` is ignored and the recipient comes from the saved message's recipient account; From is `English Hills <configured sender>` (fixed display name), no `replyTo`; the body names the sender by the message's server-set `from_name`. Staff sends keep their profile name, stripped of control characters, `<`, `>` and `"`, and set Reply-To to the office address. All display names are sanitised the same way.
- **POR-7:** the Communications dialog wraps sending in `try/finally`, sends the e-mail before reporting success, and does not create a second message row on retry (the row stores its delivery status, or the e-mail is attempted first). Choosing a learner there targets linked accounts as in D8, not the learner's `email`.

### D7b — Portal inboxes keyed by account, not by address (B1)

- New nullable columns `notifications.recipient_profile_id` and `messages.recipient_profile_id`, `messages.sender_profile_id` (→ `profiles`, ON DELETE SET NULL), indexed.
- **Server-set, never trusted from the client.** A trigger on each table (SECURITY DEFINER, fixed `search_path`), **BEFORE INSERT OR UPDATE OF** `recipient_email` / `to_user_email`, `student_id`, `recipient_profile_id` (and, on `messages`, `sender_profile_id`), recomputes `recipient_profile_id`, overwriting any client value, and keeps `sender_profile_id` unchanged on update:
  - a row with `student_id` set: the account whose login e-mail equals the normalised `recipient_email` / `to_user_email` **and** that may see that learner: a parent or student account with an **active link** to the learner (relation matching its role), **or** a teacher account whose linked, non-archived teacher record satisfies `portal_security.teacher_member(that teacher, student_id)` (the learner is a member of one of that teacher's groups), **or** a director/admin account; otherwise NULL;
  - a row without `student_id`: the profile with that login e-mail **only if** its role is staff (director, admin) or teacher; a parent or student account never receives a learner-less row this way (the portal functions set `student_id` for family-addressed messages);
  - `sender_profile_id` = `auth.uid()` (NULL for service writes).
  This covers every existing writer without changing it: the staff notification and Communications forms, and `online_security.notify` (117), which already sets `student_id`.
- **Portal reads.** For teacher, parent and student callers, `notifications self read` and the message read path become: `recipient_profile_id = auth.uid()` (or `sender_profile_id = auth.uid()` for sent messages) **and** (`student_id is null` or, for parent/student, `student_id in get_visible_student_ids()`; for teacher, `portal_security.teacher_sees(student_id, null)`). Rows with a NULL `recipient_profile_id` (bare dossier addresses) are e-mail only and never shown in any portal. Director/admin keep their e-mail-based staff view.
- `mark_my_notifications_read` and `mark_message_read` are re-created to match on `recipient_profile_id = auth.uid()` (and the same `student_id` rule).
- After a link is revoked, every notification and message about that learner disappears from that account's portal; general rows (no `student_id`) addressed to that account remain.

### D8 — Notification targeting (POR-8)

Choosing a learner in the office notification form targets the active linked accounts: parent links for a child, the self link for an adult or teen, one row per account, `student_id` stored (D7b then sets the account). Without any linked account the form sends to the dossier's `parent_email` (child) or `email` (adult) as **e-mail only** and says so ("e-mail uniquement, pas de compte"); that row has no recipient account and never appears in a portal.

### D9 — E-mail normalisation (POR-5)

BEFORE INSERT OR UPDATE triggers store `lower(btrim())` (empty → NULL) for `students.email`, `students.parent_email`, `teachers.email`, `messages.from_user_email`, `messages.to_user_email`, `notifications.recipient_email`. CHECK constraints `… = lower(btrim(…))` are added `NOT VALID` and validated by the release task after cleanup step C1. Writers that store e-mails (`create_public_registration`, `save_receptionist_student`, `crm_start_enrollment`) need no change because the trigger normalises.

### D10 — Request-origin guard (ACC-4)

One server helper (`src/lib/http/requestOrigin.js`) used at the top of every cookie-authenticated state-changing route, before authentication work: require an `Origin` header equal to the request's own origin (the admin site), reject `Sec-Fetch-Site` values other than `same-origin` when present, and require `Content-Type: application/json` (415 otherwise). Applies to `admin/invite`, `admin/update-role`, `admin/payroll`, `email/send`, `storage/sign`, `storage/finalize`, every `online/*` POST route, and the new family-invitation route. Exempt by design (own authentication): `webhooks/*`, `cron/*`, `public/*` (existing origin policy), `internal/crm/*` (already checked; may adopt the helper). PostgREST calls carry the JWT in a header, not a cookie, and are not affected.

### D11 — Sign-in and signed-in-only policies (ACC-5)

`signInWithOtp` passes `shouldCreateUser: false` (invitations still create accounts through the Auth admin API). `groups read all auth`, `appconfig auth read` and `announcements audience read` require a real role (`get_my_role() <> 'pending'` and not NULL) instead of only a session. Plan D also re-creates `announcements audience read` (its group branch calls `public.my_member_group_ids()`); whichever lands second keeps both changes. The Auth "allow sign-ups" setting is an owner check.

### D12 — Function grants (ACC-10)

Revoke EXECUTE from `public` and `anon` on `get_my_email`, `get_my_role`, `get_my_student_id`, `get_my_teacher_id`, `get_visible_student_ids`, `mark_my_notifications_read`; grant to `authenticated`. Revoke from `public`, `anon` and `authenticated` on the trigger functions `handle_new_auth_user`, `handle_new_receipt`, `log_activity`, `notify_premium_homework_teacher`, `sync_premium_membership_entitlement` (triggers do not need caller EXECUTE). Because `anon` holds table grants and several policies are `TO public`, an anonymous REST read of those tables will now return a permission error instead of an empty list; the implementation must show that no anonymous page reads a table (login, inscription, privacy) and the denial suite asserts "error or empty, never rows". If that cannot be shown, stop (S6). `anon`'s SELECT on `legacy_receipt_reconciliation` is revoked in the same step.

The re-created helpers that still carry `search_path = public` (`get_visible_student_ids`, `get_my_teacher_id`, `get_my_email`, `log_activity`) are hardened to `search_path = pg_catalog, pg_temp` with schema-qualified references.

### D13 — Middleware matcher (COD-6)

Still open on `main` (re-checked 2026-10-24: Batch A, PR #155, does not touch the matcher). Anchor `monitoring(?:/|$)` and limit the image exemption to real public files (`helpdesk/` assets, `eh-logo.png` and the other files in `public/`), with `/students/abc.png` and `/monitoringx` look-alikes added to [test-middleware-security.mjs](../../../scripts/test-middleware-security.mjs). If another PR fixes it first, skip.

### D14 — Teacher assignment readiness (DAT-8)

No code: the director assigns a teacher to each group through the existing group form before teacher invitations. The invitation dialog warns when the teacher record has no group.

## Security boundaries

1. No function or policy reachable by teacher, parent or student returns a D1 staff-only column; teachers never receive a contact field or birth date.
2. A parent or student sees a learner only through an active `family_links` row created by director/admin (Q4); no e-mail equality grants access anywhere (policies, storage, messaging, online learning).
3. A teacher's identity is `profiles.linked_teacher_id` to a non-archived record; teacher access to a learner requires membership of the teacher's group as defined by Plan D, on a non-archived learner, through the single helper of D4.
4. Teachers cannot DELETE academic records; every write to the five academic tables is logged with redacted free text.
5. A student cannot set or change teacher feedback or visibility fields, and cannot change or delete rows they did not create.
6. No portal response contains another person's e-mail address or phone (checked by value, receipts included); non-staff e-mails use a fixed sender name and no personal Reply-To; message sender names are server-set.
7. A portal shows a notification or message only to its server-set recipient account, and one that concerns a learner only while that account may see the learner; rows addressed to a bare dossier address are never shown in a portal.
8. Every cookie-authenticated state-changing route refuses cross-origin requests.
9. Staff (director, admin, receptionist) data access and every existing staff policy are unchanged, except that staff can no longer queue a parent, student or teacher role through the old invitation function (D3).
10. The online-learning invariants of [ADR-008](../decisions/ADR-008-online-learning-pilot.md) hold: online groups still carry no `groups.teacher_id`, and online join eligibility now rests on the link table.

## Migration strategy

- One forward-only, transactional migration `XXX_portal_readiness.sql`; the number is taken just before merge from the Production ledger (latest applied: 118), `origin/main` and open PRs (PRs #121 and #124 hold provisional numbers; Premium Release B is unnumbered).
- Every re-created function and policy starts from its **latest cumulative definition** read at implementation (today: `get_visible_student_ids` 025, `get_my_teacher_id` 025, `get_my_email` 006, `teacher_can_access_student_group` 071, `can_message_recipient` 069, `get_teacher_directory` 096, `resolve_storage_asset` 096, `storage_security.can_write` 096, `apply_pending_role` 042 lineage, `prepare_role_invitation` 077, `log_activity` 021, `mark_message_read` 047, `mark_my_notifications_read`, the `announcements audience read` policy), with a test proving that the signature, owner, security mode, `search_path` and grants are unchanged except where this plan says otherwise. If Plan D's M2 (or Premium Release B) has merged, its definitions are the starting point (see [Interaction with other work](#interaction-with-other-work)).
- New columns: `family_links` (table), `pending_roles.teacher_id`, `portfolios.created_by`, `notifications.recipient_profile_id`, `messages.recipient_profile_id`, `messages.sender_profile_id`; all nullable, no back-fill (0 messages, 0 notifications, 0 pending invitations today; 2 portfolio rows stay NULL).
- No existing row is updated or deleted by the migration. New constraints are `NOT VALID`. The cleanup is a separate script (below).
- An upgrade rehearsal applies the migration on top of a database seeded at the previous migration with synthetic families, teachers, receipts and the placeholder pattern, and checks counts before and after.
- **Recovery:** with 0 portal accounts, the policy removals affect no live user. Recovery is forward: a prepared corrective migration that re-creates the removed policies from their pre-change definitions (kept in the PR as a reviewed file, not applied) plus an application revert. New tables and functions are inert when unused.

## Data cleanup plan (not run; owner approval)

Run by the release task after the migration, as one reviewed SQL script, under the owner's explicit approval, with before/after aggregate counts in the release evidence and no address in any document.

| Step | What | Rows (2026-10-24) | Notes |
| --- | --- | --- | --- |
| C0 | Before-image | — | Copy `(student_id, email, parent_email)` of the rows touched by C1–C2 into a private schema table with no API grants; drop it 90 days after the owner confirms. No backup is available on the plan. |
| C1 | Normalise case/spaces | 4 `parent_email`, 2 learner `email`, 1 teacher `email` | 0 collisions after normalisation. Then `VALIDATE CONSTRAINT` (D9). |
| C2 | Clear the placeholder address | 33 active learners (`email`), 7 of the same rows also in `parent_email`; 0 archived rows | Identified at run time as the only address on >10 learners; the script aborts if the count differs from 33/7. Q9 = A clears to empty; reception collects real addresses during invitation. The 27 issued receipts that carry it are **not** changed (financial history). |
| C3 | Staff review | 4 other shared `parent_email` addresses (9 learners), 5 other shared learner `email` addresses (10 learners) | No automatic change. Reception confirms each with the family before inviting; the invite check refuses or asks for per-child confirmation anyway. |
| C4 | No action | 47 learners whose `email` equals a sibling's `parent_email` | Mostly a parent's address typed on a child's file; the self-account rule (Q8) stops it opening a student account. |

## Cross-role denial test suite design

New SQL suite `scripts/test-portal-readiness.sql` (role switching with `set local role` and JWT claims, as the existing SQL suites do) and Node suite `scripts/test-portal-readiness.mjs` (real local sessions through REST and the app routes), both added to the CI `local-database` job; route-guard unit tests in `npm test`.

**Fixtures (synthetic):** two families A and B whose children share a surname; one address on 6 learners of different families (placeholder pattern); a mixed-case `parent_email`; an adult learner with a self address that is also a sibling's `parent_email`; a Young Learner with an own e-mail; teacher T1 assigned to group G1, teacher T2 with no group, teacher T3 archived but still `teacher` role and linked; a former learner (Inactive) and a last-year enrollment in G1; receipts with `payment_note` and `void_reason`; a voided charge; a receipt whose contact snapshot carries another family's address; a portfolio entry created by T1 and one by the student; a CRM-linked placement test; a grouped Validated enrollment with a NULL `school_year`; one row in each Premium table carrying free text in its notes fields; notifications and messages written by the staff forms, by `online_security.notify` and by the portal functions, including one addressed to the shared address with another family's `student_id`; the Q6 office account.

**Matrix:** roles {anon, pending, parent A (linked), parent with the same address as A but unlinked, parent B, student self, teacher T1, T2, T3, receptionist, admin, director} × objects {students, enrollments, receipts, charges, charge_balances, placement_tests, attendance, certificates, assessments, learning_assessments, portfolios, authorized_adults, messages, notifications, family_links, pending_roles, teacher directory, storage resolve, storage write (`storage_security.can_write` for parent and student uploads), `legacy_receipt_reconciliation`, the Premium tables} × {direct select, every new function, insert, update, delete}.

Required assertions (each a numbered test):

- **T-01..T-08 Column and value denial:** teacher, parent and student direct selects on the D2 tables and on `legacy_receipt_reconciliation` return 0 rows; a key scan of every portal function's JSON/row output finds none of the D1 staff-only columns; a **value scan** of every portal response finds no fixture e-mail address or phone other than the caller's own (the receipt with another family's address included); teacher outputs contain no `telephone`, `email`, `parent_email`, `date_naissance`; the family receipt carries `is_legacy`, never `legacy`.
- **T-09..T-16 Family isolation:** parent A sees exactly A's linked children; the unlinked same-address parent sees nothing; parent B sees none of A; revoking a link or archiving the learner removes access at once; editing a dossier's `parent_email` neither adds nor removes access; online `evaluate_join` follows the links.
- **T-17..T-22 Invitation:** the placeholder-pattern address is refused for parent and student; a student invitation for a Young Learner is refused; a learner not in the matches cannot be linked; mixed-surname matches need explicit ids; a receptionist cannot invite or link (Q4 = A); activation creates exactly the pending links and they survive the queue-row delete (activation order); an expired or refused activation leaves no link; a re-invitation of the same address with other children, and one with another role, leaves only the new pending links; a teacher invitation stores the teacher id and activation sets `linked_teacher_id`; `prepare_role_invitation` refuses parent, student and teacher; two concurrent invitations of one address end with one set of links and one `PT409`.
- **T-23..T-27 Teacher:** T1 sees G1's class list only; T2 sees nothing; T3 (archived) sees nothing; an ended or archived learner is not visible; the grouped Validated enrollment with a NULL `school_year` **is** visible (both build orders: the interim rule and, once Plan D's helper exists, the helper); the same membership answer comes from the roster, `teacher_can_access_student_group`, storage and the attendance policies; teachers cannot DELETE any of the five tables and every insert/update/delete writes `activity_log` with free text redacted.
- **T-28..T-30 Portfolio:** a student cannot set `teacher_note`/`teacher_id` on insert, change them or visibility on update, or delete T1's entry, with or without an asset reference; `created_by` is forced on insert and cannot be changed.
- **T-31..T-35 Messaging:** recipients and inbox outputs contain no address; a family cannot address a teacher of another family's group; `from_name` is server-set; the e-mail route ignores `to` for non-staff, uses the fixed sender name and sets no Reply-To; `get_teacher_directory` is refused for parent/student and returns only the caller's row with e-mail for a teacher; `parent:<id>` resolves to every active parent link and is refused without one; `office` resolves only to the Q6 account.
- **T-41..T-46 Inboxes by account (B1):** parent P linked to child X does not see a notification or message about child Y of another family addressed to the shared address (staff form, D8 fallback, `online_security.notify`, staff Communications); the unlinked same-address account sees none; a client-supplied `recipient_profile_id` is overwritten; after revoking P's link to X, every row about X disappears from P's portal while P's general rows remain; `mark_my_notifications_read` and `mark_message_read` touch only the caller's rows; e-mail-only rows never appear in any portal.
- **T-48 Family to teacher (N1):** a message from parent P about child X to `teacher:<T1>` (X in T1's group G1) gets T1's account as recipient and appears in T1's inbox; T2's inbox stays empty, and a client attempt to address T2's account with `student_id = X` gets a NULL recipient; after X stops being a member of G1 (or is archived), the message no longer shows in T1's inbox; an UPDATE of `to_user_email`, `student_id` or `recipient_profile_id` recomputes the recipient by the same rule.
- **T-36..T-38 Origin guard:** every route file exporting POST/PUT/PATCH/DELETE, directly or by re-export (as `internal/crm/intake/process` re-exports the meta handler), either calls the guard or is in the explicit exemption list (static test that resolves re-exports); missing or foreign `Origin` (`https://english-hills.com`) → 403; `text/plain` → 415; behaviour tests show the webhook and cron routes still succeed with no `Origin` header.
- **T-39..T-40 Grants and sign-in:** `has_function_privilege('anon', …)` is false for the 11 functions; anonymous REST reads of each table and of `legacy_receipt_reconciliation` return an error or 0 rows, never data; a `pending` session reads no group, setting or announcement; the re-created helpers have `search_path = pg_catalog, pg_temp`.
- **T-47 Premium guard:** with the Premium fixture rows present, the R0 readiness query reports them (non-empty ⇒ not ready); the matrix records exactly which Premium rows each portal role can read, so the reviewer sees the exposure that Release B or the empty-table check must cover.
- **Regression:** the existing batch 1–4 security, receptionist and online-learning suites pass. Their assertions may change only from "the portal role reads table X directly" to "the portal role reads X through the projection" with the same row scope; no assertion is relaxed. The independent reviewer checks that diff.
- **Browser:** teacher portal, group page, attendance, assessments and both portals render with fixtures; no phone column for a teacher; composer shows names only.

## Rollout and recovery

| Step | Action | Approval |
| --- | --- | --- |
| R0 | Read-only checks: 0 teacher/parent/student accounts, 0 pending invitations, every Premium table empty, ledger, policy names match the plan's baseline, Plan D's M2 status. | Owner |
| R1 | Apply the migration (dry run first). Accepted-risk decision needed again because no backup exists (the migration changes no existing row). | Owner, explicit |
| R2 | Merge and deploy; Production checks with the director's own session (staff screens unchanged) and catalog proofs (policies, grants). | Owner, explicit |
| R3 | Cleanup C0–C2, then constraint validation. | Owner, explicit |
| R4 | Data entry: teachers assigned to groups (DAT-8); the Q6 office login invited (role admin, director approval) and set as the office recipient. | Owner / staff |
| R5 | Pilot: one teacher and one test parent account linked to a test learner (`+pilot` address, as in the online R4 pattern), denial probes through REST with those sessions, then removal or retention as the owner decides. | Owner, explicit |
| R6 | First real invitations, following the readiness checklist. | Owner |

Recovery: before R6 nothing depends on the new model; revert the deployment and, if needed, apply the prepared corrective migration. After R6, revoke links or demote accounts through the existing role management rather than reverting.

## Invitation readiness checklist

Before the first real teacher, parent or student invitation:

1. This outcome released (R1–R2) and the pilot (R5) passed, including the REST denial probes.
2. Cleanup C1 and C2 done; C3 reviewed for each family before its invitation.
3. Supabase Auth: "Allow new users to sign up" off (or justified), "Confirm email" on, leaked-password protection on; MFA for director and admin recommended (ACC-6).
4. Every group that will have a teacher account has its teacher assigned; each teacher record has a unique, correct e-mail.
5. The office login on the shared mailbox (Q6 = C) exists, is set as the office recipient, and someone reads it.
6. Every Premium table is still empty (or Release B is done).
7. CI runs the security suites (Batch A, COD-5) and the new suite on `main`.
8. Reception briefed: linking happens at invitation, shared addresses are refused on purpose, links are revoked from the learner file.
9. Parents are invited one family at a time for the first week; any "aucun apprenant" report is checked against the links, not fixed by editing dossier e-mails.

## Interaction with other work

- **Plan D — [enrollment and group consistency](enrollment-group-consistency.md) (EGC-r2, approved, merged as PR #154).** Five objects are re-created by both plans: `teacher_can_access_student_group`, `can_message_recipient`, `resolve_storage_asset`, `storage_security.can_write` and the `announcements audience read` policy; Plan D also re-creates `attendance_student_in_group`, which this plan does not change (the teacher attendance policies call it unchanged plus D4's helper). **Recommended order: Plan D's M1 and M2 first, then this migration**, built on Plan D's definitions and its `academic_security.is_group_member`. If this plan lands first, D4's interim rule applies and Plan D's M2 rebuilds from this plan's definitions, keeping the link test, the linked-teacher identity and the D4 helper (which it re-points to its own membership helper). Plan D's cleanup stage C1b fills the one NULL `school_year` on a grouped Validated enrollment; this plan does not depend on it. Plan D's `my_member_group_ids()` calls `get_visible_student_ids()` and therefore follows the links automatically.
- **Plan C — [conflicts without retry loops](conflicts-without-retry-loops.md) (ADR-009, merged as PR #151):** every deliberate conflict in this plan uses `PT409` with a `portal.<reason>` hint, and the browser treats it through the shared `isRecordConflict` helper.
- **PR #124 (RLS role evaluation, proposed):** wraps helpers and guards the teacher helper in the same policies. Whichever lands second rebases on the other's latest policy text. If this outcome lands first, #124 has no `students teacher read groups` policy left to guard.
- **PR #150 (zod 4, merged):** changed `/api/email/send` validation output; this implementation builds on it.
- **Batch A (PR #155):** wires existing security suites into CI; it does not touch the middleware matcher, so D13 applies.
- **Premium Release B:** both re-create `resolve_storage_asset` / `storage_security.can_write` (and Release B drops `can_access_premium_group` and the Premium tables): the second to land rebuilds from the then-latest definition. Until Release B, the Premium tables are guarded by the empty-table readiness check (D2).
- **Online learning:** `online_security.evaluate_join` and `family_lessons` call `get_visible_student_ids`; with this outcome, online families must be linked. `online_security.notify` is unchanged; D7b's trigger gives its rows a recipient account only when that account is linked to the learner. The online SQL suite fixtures gain link rows; the online R4 test learners need links before Phase B if this lands first. A revoked link does not cut a pass already issued for a lesson in progress (D3).

## Expected modules

- `supabase/migrations/XXX_portal_readiness.sql`; reviewed, unapplied `XXX_portal_readiness_corrective.sql` kept with the PR evidence; `scripts/portal-readiness-cleanup.sql` (C0–C2, guarded counts).
- `src/lib/http/requestOrigin.js` and its use in the routes listed in D10; `src/app/api/admin/invite/route.js` (family and teacher branches) or a sibling `family-invite` route.
- `src/lib/portal.js` (wrappers for the new functions); `parent-portal`, `student-portal`, `teacher-portal`, `groups` (the teacher-allowed group list and its headcounts), `groups/[id]`, `attendance`, `assessments`, `portfolios`, `learning-assessments`, `timetable` pages; `src/lib/receiptPdf.js` (family path without contact lines, `is_legacy`); `components/portals/MessagesTab.jsx`; `communications` and `notifications` pages; the invite dialog and a learner-file "Comptes famille" panel; `src/app/(auth)/login/page.jsx`; `src/middleware.js` (D13).
- Tests in [Cross-role denial test suite design](#cross-role-denial-test-suite-design); `.github/workflows/verify.yml` wiring.

## Owner decisions required

Each question gives the options, the consequence and a recommendation. Q1–Q5 blocked implementation; Q6 blocks only D7; Q7–Q9 could take the recommendation. **All nine are answered** (Q1–Q5 and Q7–Q9 = A on 2026-10-24; Q6 = C on 2026-10-24, see the [approval record](#approval-record)).

**Q1 — Which learner fields may teachers see?** *Blocking.*
- **A (recommended):** class list only: full name, photo, level, age category, programme, status, group. Teachers contact families through the centre.
- **B:** A plus birth date (age for young learners).
- **C:** A plus the phone and e-mail of adult learners only.
Consequence: B adds a personal data item teachers rarely need; C reopens private contact with adults, against the stated anti-poaching goal (ADR-008).

**Q2 — May teachers delete academic records (grades, learning assessments, placement tests, portfolios, attendance)?** *Blocking.*
- **A (recommended):** no; teachers create and correct, director/admin delete; every change and deletion is logged, including grade values so a deleted grade can be restored.
- **B:** yes, with the same log.
- **C:** only entries they created, within 24 hours.
Consequence: A matches the existing (unused) app rule `canDeleteAcademicRecords`; B keeps today's behaviour with a trail; C adds an author column and time rule to five tables.

**Q3 — Family link model.** *Blocking.*
- **A (recommended):** explicit links approved by staff at invitation (D3); the dossier address proposes, staff confirm each child; shared or ambiguous addresses are refused; later e-mail edits never move access.
- **B:** keep e-mail matching, normalised, with the invite-time refusal only.
- **C:** link table filled automatically from e-mail matches at invitation, without per-child confirmation.
Consequence: B leaves access tied to a free-text field that reception edits daily (a typo can open another family); C is safer than B but still links siblings and cousins sharing an address without a human check.

**Q4 — Who may invite, link and revoke family accounts?** *Blocking.*
- **A (recommended):** director and admin (today's inviters); receptionist sees links read-only.
- **B:** director only.
- **C:** director, admin and receptionist (reception meets families), with the same refusals.
Consequence: C gives reception a new account-creation power, which the receptionist boundary currently excludes (SECURITY_RULES).

**Q5 — Teacher e-mail addresses shown to families, or a centre relay?** *Blocking.*
- **A (recommended):** centre relay: in-app messages only, notification e-mails from a fixed English Hills sender, no address shown either way, no personal Reply-To.
- **B:** give teachers centre-domain addresses and show those to families.
- **C:** keep personal addresses visible (today).
Consequence: B needs mailbox accounts per teacher and still lets families bypass the centre; C contradicts the anti-poaching goal.

**Q6 — Which account receives "Accueil English Hills" portal messages?** *Blocking for D7 only. Answered: C, the shared office mailbox (owner, 2026-10-24).*
- **A:** the admin account. **B:** the director account. **C (recommended):** a dedicated centre login with role admin (for example an office address), so the inbox does not depend on one person.
Consequence: receptionists cannot read messages today (restrictive policy); changing that is out of scope.

**Q7 — Family view of staff remarks on attendance and certificates.**
- **A (recommended):** hidden; add later deliberately if wanted. **B:** shown.

**Q8 — Student accounts for children.**
- **A (recommended):** only Adults and Teens learners may have a student account; Young Learners (121 active) use the parent portal. **B:** any learner with an own address.

**Q9 — Placeholder address cleanup (C2).**
- **A (recommended):** clear it from the 33 files; reception collects each family's real address before inviting. **B:** leave it until reception has replaced each one (the invite check refuses it meanwhile, but office notifications and teacher messages could still go to it).

## Revision record

| Revision | Date | Change |
| --- | --- | --- |
| PRF-r1 | 2026-10-24 | First proposal (architecture task, branch `docs/plan-f-portal-readiness`); approved by the owner at `ba94ad3` with Q6 pending. |
| PRF-r2 | 2026-10-24 | [Review corrections](#review-corrections-prf-r2) for the independent review of head `e90f8f1` (CHANGES REQUIRED); Q6 answered = C; rebased on `main` after PRs #150, #151, #154 and #156. Re-review of head `4c9747c`: earlier findings fixed, one new finding N1, applied in the same revision (D4 `teacher_member`, D7b trigger accepts the learner's teacher and staff, fires on UPDATE too, T-48). Re-review of head `7c231ed`: READY FOR FINAL REVIEW. Owner re-approved at `7c231ed` (2026-10-24). |

## Review corrections (PRF-r2)

The independent review of head `e90f8f1` returned **CHANGES REQUIRED**. Each finding and where PRF-r2 answers it:

| Finding | Correction |
| --- | --- |
| **B1** notifications and messages keyed by e-mail, so a shared address crosses families | New [D7b](#d7b--portal-inboxes-keyed-by-account-not-by-address-b1): server-set `recipient_profile_id` (and `sender_profile_id`) on both tables, filled by a trigger only for an account linked to the row's learner (or a staff/teacher account for learner-less rows); portal reads and both `mark_*` functions key on `auth.uid()` plus the learner-visibility rule; bare-address rows are e-mail only. D7 resolves `parent:`/`learner:` keys to linked accounts only; D8 and Communications target accounts. Boundary 7; tests T-41..T-46 (including after revoke). |
| **I1** family receipt projection would expose a receipt's contact snapshot; `legacy` read by the PDF | D1/D2: receipt `email` and `telephone` never in the family projection (family PDF omits those lines); `is_legacy` replaces `legacy`; T-01..T-08 add a value-level scan. |
| **I2** D4's school-year rule conflicts with Plan D and the overlap is undeclared | D4: lapse = Plan D membership AND learner not archived, through one helper used by every teacher reader including the attendance policies; the school-year rule is withdrawn; both build orders stated; the shared objects listed in [Interaction with other work](#interaction-with-other-work); T-23..T-27 cover the NULL-year row. |
| **I3** invitation flow does not match `apply_pending_role` / `prepare_role_invitation` | D3 [invitation lifecycle](#d3--family-link-model-q3--a): old path refused for portal roles via a private shared helper; pending links deleted and re-created on re-invitation; links activated and detached before the queue row is deleted; `pending_roles.teacher_id` stored for teacher invitations; T-17..T-22 extended. |
| **I4** approval sequence and Q6 wording contradict the record | Q6 now blocks only D7 everywhere and is answered; the [approval record](#approval-record) states that the owner re-approves PRF-r2 at its exact head SHA after the re-review. |
| Minor: Premium tables | D2 guard (empty-table readiness check, R0, checklist item 6), matrix and T-47. |
| Minor: `legacy_receipt_reconciliation` | D2, D12 (`anon` SELECT revoked), S1, matrix, T-01 and T-39. |
| Minor: `created_by` | D6: forced on insert, immutable; T-28..T-30. |
| Minor: `search_path` | D12: re-created helpers hardened to `pg_catalog, pg_temp`; T-39. |
| Minor: teacher e-mail index | D4: excludes blank e-mails. |
| Minor: ADR-009 | D2 and D3: `PT409` with `portal.<reason>` hints for deliberate conflicts. |
| Minor: stale lines | Interaction section rewritten (PR #150 merged; Batch A does not fix COD-6). |
| Minor: unspecified behaviour | D3: revoked links versus issued online passes, restore of an archived learner, foreign-key rules; D2/D7: row limits. |
| Minor: missing module | `groups/page.jsx` and `receiptPdf.js` added to Expected modules. |
| Test gaps | Storage writes, Premium tables and the legacy view in the matrix; webhook/cron without `Origin`; T-36 resolves re-exported handlers. |
| **N1** (re-review of `4c9747c`) the D7b trigger only accepted family-linked accounts for rows with a learner, so family-to-teacher messages never reached the teacher | D7b: a row with a learner also resolves to the teacher account whose teacher has that learner in one of their groups (`portal_security.teacher_member`, D4) or to a director/admin account; the trigger fires on INSERT and on UPDATE of the address, learner and recipient fields; teacher reads use `teacher_sees`; T-48. |

## Approval record

The owner approves an exact revision and head SHA after the independent review, with answers to Q1–Q9; that approval is recorded here verbatim and in [OWNER_DECISIONS](../../ai/OWNER_DECISIONS.md). Approval of this plan is not approval of implementation start, a migration number, merge, release, cleanup or any Production step.

- **Date and time:** 2026-10-24 15:53 Asia/Shanghai (UTC+08:00), 07:53 UTC.
- **Owner's words (verbatim):** "all recomended and for E6 paper numbers dont exist". The owner had been shown each plan's owner questions with the plan's recommended option; "all recomended" covers this plan's Q1–Q5 and Q7–Q9 (the E6 remark concerns the payment corrections plan only). On Q6 the owner asked what it means; it is not yet answered.
- **Channel:** chat with Claude, relayed by the coordinating session.
- **Approved revision:** PRF-r1 at exact head `ba94ad3` of branch `docs/plan-f-portal-readiness` (PR #153). That approval was given before the independent review; the review of head `e90f8f1` returned CHANGES REQUIRED, so **PRF-r2 needs the independent re-review and the owner's re-approval at its own exact head SHA** before implementation starts. The answers below carry over unless the owner changes them at re-approval.
- **Options chosen:**
  - Q1 = **A** (teachers see the class list only: full name, photo, level, age category, programme, status, group).
  - Q2 = **A** (teachers create and correct; director/admin delete; every change and deletion logged, including grade values).
  - Q3 = **A** (explicit family links approved by staff at invitation).
  - Q4 = **A** (director and admin invite, link and revoke; receptionist read-only).
  - Q5 = **A** (centre relay: in-app messages, fixed English Hills sender, no address shown, no personal Reply-To).
  - Q6 = **C** (answered 2026-10-24 16:16 Asia/Shanghai, UTC+08:00, 08:16 UTC, chat with Claude relayed by the coordinating session). Owner's words, verbatim except that `@` is written `[at]` because the repository's CI blocks literal e-mail addresses in documents: "f6: contact[at]english-hills.com" ("f6" is the owner's typing of Q6). Meaning: a dedicated centre login with role admin, using the shared office mailbox contact[at]english-hills.com, receives "Accueil English Hills" portal messages (D7). Q6 blocked only D7.
  - Q7 = **A** (staff remarks on attendance and certificates hidden from families).
  - Q8 = **A** (student accounts only for Adults and Teens learners).
  - Q9 = **A** (clear the placeholder address from the 33 files; reception collects real addresses before inviting).
- **Re-approval of PRF-r2:** 2026-10-24 16:36 Asia/Shanghai (UTC+08:00), 08:36 UTC; chat with Claude, relayed by the coordinating session. Owner's words (verbatim): "approve F and merge 152 and 153". Approved revision: **PRF-r2 at exact head `7c231ed4fa3e2d21af578a2828930d0e4ac44da3`** (re-reviewed content; rebased onto `main` after #152 with index rows combined), after the independent re-review of that head returned READY FOR FINAL REVIEW (CI run 40078566549 green). Answers Q1–Q9 as listed above, unchanged. This re-approval supersedes the PRF-r1 approval for implementation purposes and covers architecture approval for implementation only; the merge of this docs PR was approved in the same message. It does not approve a migration number, the migration, the cleanup, the deployment, the pilot or any invitation; each needs its own explicit owner approval.
- **Scope of this approval:** architecture approval of PRF-r1 for implementation (D7 was held until Q6, now answered); superseded for implementation purposes by the re-approval PRF-r2 needs. It does not approve a migration number, the merge, the migration, the cleanup, the deployment, the pilot or any invitation; each needs its own explicit owner approval under [Rollout and recovery](#rollout-and-recovery).

## IMPLEMENTATION CONTRACT

### Scope

Design D1–D14 (including D7b) of PRF-r2 with the owner's answers to Q1–Q9; nothing listed under non-goals. One migration, one implementation PR, one cleanup script (not run).

### Prerequisites

- The owner's re-approval of PRF-r2 at its exact head SHA, recorded above (done: head `7c231ed`); Q1–Q9 answered (done).
- Fresh `origin/main`; status of Plan D's M1/M2, Premium Release B, PR #124 and Batch A checked; the build order of D4 chosen accordingly.
- Latest cumulative definitions of every object in the [migration strategy](#migration-strategy) read from the repository and compared with Production catalog evidence where available.
- Local Supabase with synthetic data only; external e-mail disabled.

### Object / module manifest

Database: table `family_links`; columns `portfolios.created_by`, `pending_roles.teacher_id`, `notifications.recipient_profile_id`, `messages.recipient_profile_id`, `messages.sender_profile_id`; private schema `portal_security` with `teacher_member`, `teacher_sees` and `queue_role_invitation`; private cleanup snapshot table (created by the cleanup script, not the migration); functions `portal_teacher_roster`, `portal_my_learners`, `portal_learner_record`, `portal_request_reenrollment`, `portal_message_recipients`, `portal_send_message`, `portal_my_messages`, `preview_family_invitation`, `prepare_family_invitation`, `prepare_teacher_invitation`, `link_family_student`, `link_teacher_account`, `revoke_family_link`; re-created `get_visible_student_ids`, `get_my_teacher_id`, `get_my_email`, `teacher_can_access_student_group`, `can_message_recipient`, `get_teacher_directory`, `resolve_storage_asset`, `storage_security.can_write`, `prepare_role_invitation`, `apply_pending_role`, `log_activity`, `mark_my_notifications_read`, `mark_message_read`; policies per D2, D4 (teacher attendance), D5, D6, D7, D7b, D11; triggers per D5, D6, D7b, D9; constraints per D9 (`NOT VALID`); grants per D12. Application and tests per [Expected modules](#expected-modules).

### Invariants

The ten [security boundaries](#security-boundaries), plus: staff policies and staff screens unchanged; finance, CRM, conversion and Meta objects unchanged; online-learning objects unchanged except through the shared helpers and the D7b notification trigger; no existing row changed by the migration; re-created functions differ from their latest definitions only as this plan states.

### Acceptance / tests

The [cross-role denial suite](#cross-role-denial-test-suite-design) T-01–T-48 and regressions, the middleware and navigation suites, lint, build, an upgrade rehearsal from the previous migration, and a browser check of the teacher pages and both portals. CI full lane green on the exact head SHA.

### Stop conditions

- **S1** Any policy, view or SECURITY INVOKER function outside this plan that reads `students`, `enrollments`, `receipts` or `charges` as a teacher, parent or student (beyond `charge_balances`, `legacy_receipt_reconciliation` and the `enrollments parent insert` check, already handled): stop and add it to the plan. Any writer of `notifications` or `messages` that D7b's trigger cannot attribute to an account: same.
- **S2** Any staff screen loses data or a staff policy must change: stop; reopen architecture.
- **S3** Any test shows a D1 staff-only column, a contact field to a teacher, or another family's row: blocking; fix before handoff.
- **S4** A change to finance, CRM, enrollment confirmation, Meta or online-learning objects beyond the shared helpers and the D7b trigger, or to Plan D objects beyond the five shared ones listed in [Interaction with other work](#interaction-with-other-work): stop.
- **S8** A Premium table is non-empty when the first invitation is planned: stop; Release B or a separate guard comes first.
- **S5** Migration number conflict with the ledger, `origin/main` or an open PR: resolve before authoring the file.
- **S6** An anonymous page depends on a table read or on the 11 helpers (D12): stop and ask.
- **S7** Any Production read beyond the coordinator's evidence, any Production write, Auth setting or cleanup execution: not the implementer's; each needs the owner's approval through the release task.

### Docs / status reporting

The PR records branch, exact head SHA, migration filename, tests and CI run on that SHA, the author self-check and the Q answers implemented, and returns the [AGENTS handoff](../../../AGENTS.md#implementation-handoff) status. SECURITY_RULES (roles table, family link and teacher boundary), PRODUCT_RULES (family link, teacher deletion), WORKFLOWS (invitation), ARCHITECTURE, FEATURE_INDEX, CURRENT_STATE and [ADR-011](../decisions/ADR-011-portal-access-model.md) are updated at release closeout.

## Implementation record

- **State:** implemented on branch `feat/portal-readiness` (one Tier-3 implementation PR) from `origin/main` `b0b6a83` (#162, Batch D closeout). Built in the order "Plan D's M2 merged first" (D4): migration 121 is merged (not yet applied in Production), so `portal_security.teacher_sees` calls `academic_security.is_group_member` and every re-created function starts from its latest definition on `main`. Not merged, not deployed. No Production read or write was made for this implementation (no clean-up, migration, link, invitation or SQL).
- **Migration:** [123_portal_readiness.sql](../../../supabase/migrations/123_portal_readiness.sql). The number is **provisional**: Batch E's open PR #164 holds 122 (`122_finance_corrections_numbering_guardrails.sql`), so this one takes 123 (S5); the number is re-allocated from the Production ledger, `origin/main` and open PRs just before merge, and whichever of E and F merges second rebases its ledger ceilings. The two migrations share no function: E re-creates `charge_balances` with the same columns, which this migration only reads. Applying 123 requires 121 first (the migration refuses otherwise); it does not depend on 122.
- **Clean-up (not run):** [scripts/portal-readiness-cleanup.sql](../../../scripts/portal-readiness-cleanup.sql) — C0 private before-image (`maintenance.portal_cleanup_before`, no API grant), C1, C2 and the D9 validation in one transaction; each count is a `psql -v` input from the release task's dry run and any difference aborts with nothing changed; it refuses once a portal account exists or after it has run. **Prepared corrective (reviewed, not applied):** [scripts/portal-readiness-corrective.sql](../../../scripts/portal-readiness-corrective.sql) re-creates every policy 123 removed or replaced from its 121 definition (proved by the upgrade rehearsal's `corrective` mode).
- **Sources (latest definition on the base):** `teacher_can_access_student_group`, `can_message_recipient`, `resolve_storage_asset`, `storage_security.can_write`, policy `announcements audience read` from **121**; `get_teacher_directory` 096; `prepare_role_invitation` 077; `apply_pending_role` 042; `mark_message_read` 047; `mark_my_notifications_read` 028; `get_visible_student_ids`, `get_my_teacher_id` 025; `log_activity` 021; `get_my_email` 006. The definitions were read from a local replay of 001–121 (`pg_get_functiondef`, `pg_policies`) and match the repository files; no drift from the plan's evidence was found. Batch E's manifest shares no function with this one (this plan reads `charge_balances`, it does not re-create it).

### Implementation choices within the approved design (for review)

1. **Student portfolio updates are refused, not silently reset** (D6, T-28..T-30): a student's change to `teacher_note`, `teacher_id`, `visible_to_parent` or `visible_to_student` raises `42501` `portal.protected_portfolio_fields`, as `storage_security.bind_record` already does for asset-backed entries; on insert the fields are forced (teacher fields NULL, visible). Stricter than "unchanged on update" and keeps the existing Batch 4A assertion.
2. **`portal_send_message` takes a fifth argument `p_student_id`**: the plan has family senders choose the learner in the composer when the account has several (D7); the key alone cannot carry it.
3. **`list_family_links(p_student_id)`** (director, admin, receptionist; read-only) is added: the learner-file "Comptes famille" panel needs a read path and `family_links` has no API grant.
4. **One active `self` link per account** as well as per learner (a student account opens one learner record).
5. **`can_message_recipient`** drops the `profiles.linked_student_id` branch along with the e-mail comparisons, so the link is the only family path (boundary 2). The function now serves only director/admin (the staff insert policy and the staff e-mail route).
6. **D9 constraints are the plan's** `x = lower(btrim(x))` (`NOT VALID`); an empty string passes and becomes NULL on the row's next write through the trigger. C1 counts only values that differ by case or spaces, as the plan's evidence did.
7. **Origin guard** is [src/lib/http/requestOrigin.mjs](../../../src/lib/http/requestOrigin.mjs) (`.mjs` so it is unit-tested without a bundler). Besides `request.url`'s origin it accepts the scheme plus the `Host` header the browser targeted (a local `next start` reports `localhost` in `request.url`); a cross-site page can set neither.
8. **E-mail route, portal callers:** the body is `{ message_id }` only; the route reads the saved message and the recipient account's address with the server-only service-role client (portal accounts no longer read `messages`), requires the caller to be its sender and the message under five minutes old. Sender rules are in [src/lib/emailSender.mjs](../../../src/lib/emailSender.mjs). Staff Reply-To is the office address from the centre settings.
9. **Rate limits:** `portal_send_message` consumes the existing `email_send` limits (one unit per send); `consume_rate_limit` is unchanged.
10. **Office recipient:** the release task records the Q6 login in `app_config` under `portal_office_profile_id`; only an `admin` profile is accepted.
11. **R0 readiness** is `portal_security.readiness_failures()` (private; closed labels: non-empty Premium tables, office not configured, an address on more than 10 learner files, D9 constraints not validated).

### Open items for the reviewer and the owner

- **S1 assessment (no stop):** three SECURITY INVOKER report functions read `receipts`/`students` under the caller's rights and are executable by `authenticated` and `anon`: `get_finance_summary`, `get_referral_breakdown`, `get_unpaid_receipts`. After 123 a portal role has no policy on those tables, so they return nothing to teachers or families (no exposure, no dependency). Batch E drops two of them.
- **Online module teacher identity:** `online_security.caller_teacher_id()` still matches the teacher record by e-mail (S4 keeps online objects unchanged beyond the shared helpers). A teacher account is created only by `prepare_teacher_invitation`, which binds the same record, so both rules name the same teacher; aligning the online helper with `linked_teacher_id` is a follow-up for the online module.
- **Overlap with Batch E (files, not functions):** `src/lib/receiptPdf.js` and `src/lib/receiptPresentation.js` (two lines: `is_legacy` in the family path), `src/app/api/admin/payroll/route.js` (the origin guard), `scripts/test-receptionist-browser.mjs` (links for the PDF learner), `scripts/test-receipt-charge-payments.sql` (family reads through the projection), `.github/workflows/verify.yml`. Whichever merges second rebases.

### Changed assertions of existing tests

Every change follows the plan's regression rule: a portal role that read table X directly now reads X through the projection with the same row scope, or a behaviour the plan replaces is asserted in its new, stricter form. No assertion is relaxed.

| File | Change |
| --- | --- |
| `test-audit-remediation.sql` | Fixture: explicit parent link; the teacher account is bound to its record. The e-mail-derived identity assertion becomes: the matching e-mail alone names no record, the bound record does. |
| `test-enrollment-group-consistency.sql` | Fixture: links and bound teachers. "Teacher reads the learner file" through `portal_teacher_roster`. |
| `test-online-learning.sql` | Fixture: links and bound teachers. The mixed teacher's in-person learners through the class list, plus a new direct-read denial. |
| `test-receipt-charge-payments.sql` | Fixture: links. Family balances and receipt history through `portal_learner_record` (same rows), plus new direct-read denials. |
| `test-batch1-security.mjs` | Same-origin header on route calls; parent, student and teacher invitations through the portal invitations. |
| `test-batch2-security.mjs` | Same-origin header; the 343-case invitation matrix routes parent, student and teacher through the portal invitations (with the learner or teacher record carrying the address) and asserts the link or binding after activation; a staff or teacher account's address is refused for a family role (`portal.staff_address`, 403) where the old path answered 400/23514, and the director's own address likewise (403 instead of 409). |
| `test-batch3a-security.mjs` | Fixture: links and bound teachers. Directory: families refused, a teacher reads only the own row (D7). Identity: bound record, e-mail alone gives none. Learner reads through the projections (direct reads empty). Messages through the portal functions (direct writes refused). Family invitation through the route with a learner. |
| `test-batch3b-security.mjs` | Fixture: links and bound teachers. Enrollment reads: direct reads empty for portal roles, same scope through the projections; parent requests through `portal_request_reenrollment`; anonymous reads error or empty (D12). |
| `test-batch4a-security.mjs`, `test-batch4c-storage-enforcement.mjs` | Same-origin header; links and bound teachers. |
| `test-receptionist-storage.mjs` | Same-origin header. |
| `test-receptionist-browser.mjs`, `test-online-learning-browser.mjs` | Fixture: links (and the bound teacher). |
| `test-middleware-security.mjs` | New look-alike cases (D13). |
| Upgrade ceilings | 121 → 123 in the five `*-current.sql` checks and `test-conflicts-without-retry-upgrade.mjs`. |

### New tests

[test-portal-readiness.sql](../../../scripts/test-portal-readiness.sql) (T-01..T-48 at database level), [test-portal-readiness-concurrency.py](../../../scripts/test-portal-readiness-concurrency.py) (T-22 race), [test-portal-readiness.mjs](../../../scripts/test-portal-readiness.mjs) (real sessions through REST and the routes: key and value scans, links, invitation and e-mail routes, origin guard on the 11 routes, exempt routes, anonymous reads), [test-portal-readiness-browser.mjs](../../../scripts/test-portal-readiness-browser.mjs) (teacher pages, both portals, names-only composer, no contact value received), [test-portal-readiness-upgrade.mjs](../../../scripts/test-portal-readiness-upgrade.mjs) (121 → 123 on seeded data: no row changed, catalog diff exactly the manifest, guarded clean-up, corrective) and [test-portal-readiness-unit.mjs](../../../scripts/test-portal-readiness-unit.mjs) (`npm test`: guard, static route coverage resolving re-exports, e-mail sender rules). CI: the SQL suite and the race in `sql-and-concurrency`, the upgrade rehearsal in `upgrades-from-112-to-116`, the REST and browser suites in `browser-security`.
