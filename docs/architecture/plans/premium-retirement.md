> **Status: PROPOSED — architecture for owner review (not approved, not implemented).** Revision PR-r1, 2026-10-08. Owner: Maroine. Risk tier: **3**. Baseline: `origin/main` `857b159746b78233578790bdb999878cd113e088`. Planned, implemented, merged, deployed and Production-verified are distinct states; nothing in this plan has happened yet.

# Owner summary

**Premium retirement.** Premium is a cancelled product. This plan removes the Standard/Premium "Formule" and the whole Premium workshops/homework module from the platform, so every Yearly student is simply a Yearly student.

## What will change

- The word "Formule" (and "Standard"/"Premium" as a formule) disappears from the receipt form, receipt list, print page, PDF, receipt e-mail, finance export, student form, student list and student page, and reports.
- The Premium workshops module is removed: the "Heures Premium" page and menu entry, workshop groups, memberships, attendance, homework, the Premium tabs and panels in the teacher, parent and student portals, the Premium block in the timetable and student page, and the Premium section of the Academic Operations report.
- All existing Premium students become ordinary students; their Premium dates are cleared.
- New Yearly receipts store "Yearly · 2026/2027" (no formule word) as their description.
- The database tables, rules and uploaded homework files that only served the module are deleted in a **second, separately approved release**, after a full export is kept.

## What staff/users will be able to do

- Create receipts, charges and students exactly as before, minus the formule choice. Numbering, payments, balances, enrollment and conversion do not change.
- Nothing new is added. Teachers, parents and students lose the homework and workshop screens.

## What remains restricted

- Roles, RLS, finance authority and the trusted conversion boundary are unchanged. Receipts and charges remain read-only for browser users.
- No security rule is loosened to make the removal pass. The only permission changes are removals: the four receptionist workshop commands, the receptionist read policies on the workshop tables, and the homework upload purpose.

## UI impact

- One page route and one menu item are removed. Formule fields, filters, badges and PDF/e-mail rows are removed. Several panels and report sections are removed with no replacement (see Design D6).
- An old receipt reprinted later no longer shows a Formule line. Its stored description text (for example "Yearly · Premium · 2026/2027") still appears wherever that text is displayed, unless you choose to rewrite it (Decision 1).

## Database impact

- Release A: one forward migration (provisionally 113) that changes only the receipt/charge creation function. No table is dropped.
- Release B: one destructive forward migration (provisionally 114) that drops five tables, their functions, triggers and policies, two storage-registry columns, and two student date columns. It refuses to run unless no Premium student remains.
- A separate, owner-approved Production data step moves existing Premium students to Standard. Production counts are not read by this task; they are listed as pre-release checks.

## Important security decisions

- Storage-registry functions that gate every upload and download (student photos, portfolios, enrollment documents) must be redefined to remove the homework branch. This is the highest-risk part of Release B and is tested against the existing upload flows.
- The destructive migration uses no `DROP … CASCADE`, so an unexpected dependent makes it fail instead of silently deleting something.
- Production SQL and file deletion are never run automatically; each needs explicit release approval.

## Risks / owner review points

1. Decision 1: old receipts keep the words "Standard"/"Premium" inside their stored description unless you approve a rewrite of financial record text. Recommended: do not rewrite.
2. Homework files and workshop history are permanently deleted in Release B. Rollback after that is only from the export or a database backup.
3. Moving students to Standard fires an existing database trigger that ends their workshop memberships. The export must exist first.
4. Future-dated workshops, memberships and pending homework (counts unknown) will be discarded. You must see these counts before approving Release B.
5. Teachers, receptionists, parents and students who open a removed address are redirected to their own home screen; only admin/director see "page not found" (existing role-allowlist behavior).

---

# Verified current state

## Baseline and evidence limits

- **Baseline:** freshly fetched `origin/main` = `857b159746b78233578790bdb999878cd113e088` (PR #117 merge, documentation only). Latest migration file in the repository is `112_crm_rcc_a2_enrollment_ux.sql`; [CURRENT_STATE](../../ai/CURRENT_STATE.md) records the Production ledger as 001–112. The next free number is therefore 113; re-verify at implementation time.
- **Method:** static inspection of the repository only (migrations 001–112, source, scripts, workflows, docs). No test was executed, no local database was started, and **no Production read, count or mutation occurred**. All Production facts (how many Premium students, groups, sessions, homework files exist) are unknown and listed as release checks below.
- [CURRENT_STATE](../../ai/CURRENT_STATE.md) lists academics and portals as "IMPLEMENTED — NEEDS VERIFICATION"; no Production usage of the workshop module is established.
- The starting inventory from the task was verified and corrected below. Additions to it are marked **NEW**.

## Cumulative database architecture (latest definitions)

| Concern | Latest definition (verified) | Note |
| --- | --- | --- |
| `students.plan_type` text NOT NULL default `'Standard'`, `students_plan_type_check` (Standard/Premium); `premium_start_date`, `premium_end_date`, `students_premium_dates_check` | [051](../../../supabase/migrations/051_premium_weekend_sessions.sql) | Never altered later. |
| `charges.plan_type` nullable; `charges_yearly_formula_check`: non-legacy **Yearly requires Standard or Premium; other sessions require NULL** | [055](../../../supabase/migrations/055_receipt_charge_payments.sql) | **NEW:** the constraint forces the RPC to keep writing a plan value for Yearly unless the constraint changes. |
| `receipts.plan_type` nullable, check allows NULL/Standard/Premium | 055 (051 had added it NOT NULL default Standard; 055 dropped NOT NULL) | Receipts can already hold NULL. |
| `create_charge_payment_financial(jsonb)` (the inner financial command; builds `service_description` as `Yearly · <plan> · <year>`, requires Standard/Premium for Yearly, rejects Premium otherwise, copies the plan into the receipt) | [096](../../../supabase/migrations/096_receptionist_operational_permissions.sql) line ~520 (supersedes 055/057/072/074/084). `create_charge_payment(jsonb)` is the public wrapper (072/074/084 chain). | **NEW:** the stored description of **every** Yearly charge/receipt, including Standard, contains the plan word. This affects Decision 1. |
| Student list RPCs with `p_plan` filter (`coalesce(s.plan_type,'Standard') = p_plan`), returning `s.*` rows | [097](../../../supabase/migrations/097_receptionist_group_assignment_filter.sql) (latest; 067/073/075 earlier) | Dropping `plan_type` would require redefining these. |
| `save_receptionist_student` inserts `plan_type='Standard'` | 096 | Needs no change under Decision 2 option A. |
| Workshop tables `premium_sessions` (051, +`premium_group_id` and `student_id` nullable in 054), `premium_homework_submissions` (052), `premium_groups`, `premium_group_memberships`, `premium_attendance` (054) | 051–054 | RLS enabled; receptionist read policies and restrictive deny policies added in 096. |
| Workshop functions/triggers | `guard_premium_session_teacher_update`, `validate_premium_session_entitlement` (053/054), `guard_premium_homework_write` (054), `notify_premium_homework_teacher` (054), `can_access_premium_group`, `guard_premium_membership`, `sync_premium_membership_entitlement`, `guard_premium_attendance` (054), `reserve_premium_homework_asset(uuid,uuid)` (054), `storage_security.bind_premium_homework` (052); receptionist commands `create_receptionist_premium_group`, `save_receptionist_premium_membership`, `save_receptionist_premium_session`, `save_receptionist_premium_attendance` (096) | 051–054, 096 | |
| Storage registry extension | `storage_assets.premium_session_id`, purpose `'premium_homework'` in `storage_assets_purpose_check`, `storage_asset_bindings.premium_submission_id` (+ check `num_nonnulls(...) = 1` over five columns, unique index) in 052; `storage_security.immutable_key()` includes `premium_session_id` (052); `reserve_storage_asset` (052, explicitly rejects the premium purpose); `storage_security.can_write` (latest **096**, has a `premium_homework` branch that reads `s.plan_type='Premium'`); `resolve_storage_asset` (latest **096**, joins the premium tables); `can_insert_reserved_object` (latest 096, no premium reference) | 052, 096 | **NEW:** the workshop module is wired into the central upload/download authorization. |
| Notifications | `notifications_type_check` includes `'premium_homework'` (052); a trigger inserts such rows with the French subject "Nouveau devoir Premium à préparer" | **NEW** |
| Teacher visibility | `teacher_can_see_student(uuid)` (latest [071](../../../supabase/migrations/071_teacher_academic_relationships.sql)) has two premium clauses; policy `students teacher read groups` calls it | **NEW:** must be redefined without the clauses. |
| Student-entitlement trigger | `students_sync_premium_membership_entitlement` (054, SECURITY DEFINER, fires on `plan_type`/`premium_end_date`/`session_type`/`deleted_at` changes): **deletes future memberships and deactivates current ones when a student stops being Premium** | **NEW:** moving students to Standard mutates workshop data. The export must precede the move. |
| Receipts and charges | `authenticated` has SELECT only; writes are through the SECURITY DEFINER commands; `service_role` and the migration owner can update | A text rewrite (Decision 1 option B) is technically possible but touches immutable issued-receipt records. |
| Other migrations | No other migration references `premium` or `plan_type` (searched 001–112). `crm_start_enrollment`/conversion (084/112) insert students without `plan_type`, so the column default applies. | Conversion/enrollment need no change. |

## Application inventory (verified; counts are matches of premium/plan_type/formule in the file)

- **Formule surfaces:** `src/components/receipts/ReceiptForm.jsx` (selector, preview, student column list), `src/app/(admin)/receipts/page.jsx` (PREMIUM badge, summary), `src/app/(admin)/receipts/[id]/print/page.jsx` (Formule row), `src/lib/receiptPdf.js` (detail row and details array), `src/lib/receiptPresentation.js` (`buildServiceDescription`, `receiptServiceSummary`), `src/lib/receiptInitialCharge.mjs` (default `plan_type`), `src/app/(admin)/finance/page.jsx` (export column), `src/components/students/StudentForm.jsx` (34: selector, dates, validation), `src/app/(admin)/students/page.jsx` (filter, export column, URL param `plan`), `src/app/(admin)/students/[id]/page.jsx` (Programme Premium block), `src/components/reports/AcademicOperationsReport.jsx` (32).
- **NEW – outside the web app:** `supabase/functions/sendReceiptEmail/index.ts` prints a "Formule" row from `receipt.plan_type` for Yearly receipts. It is a separately deployed Supabase Edge Function.
- **Workshop module:** `src/app/(admin)/premium-sessions/page.jsx` (407 lines), `src/components/premium/PremiumHomeworkInbox.jsx`, `PremiumHomeworkSubmitter.jsx`; portal panels in `parent-portal`, `student-portal`, `teacher-portal` pages (including a `premium-homework` tab and badge); `timetable/page.jsx` reads `premium_sessions` **directly from the browser client**; `reports/page.jsx` loads five Premium entities; `src/lib/entities.js` (five entities), `src/lib/storage.js` and `src/lib/integrations.js` (`premiumSessionId`, `reserve_premium_homework_asset`); `src/lib/statusColors.js` (three `PREMIUM_*` maps); `notifications/page.jsx` (type label/color for `premium_homework`); parent/student portals also map the notification type.
- **Route plumbing:** `src/components/layout/Sidebar.jsx`, `src/lib/navigation.mjs` (return-screen allowlist), `src/lib/roleAccess.mjs` (`canManageAcademics`), `src/middleware.js` (teacher allowlist), `src/components/ProtectedRoute.jsx`.
- **Stored description display (Decision 1):** `service_description` is rendered by `receipts` list/print/edit/delete, `finance` and `finance/charges/[id]/edit`, `students/[id]`, `parent-portal`, `student-portal`, `dashboard`, `ReceiptForm`, `receiptPdf`, and the e-mail Edge Function.
- **Tests/fixtures touching Premium or `plan_type`** (about 50 files; the larger ones): `scripts/test-premium-shared-workshops.sql` and `-rls.sql` (**not referenced by `verify.yml` or `package.json`**; run manually), `test-receptionist-batch1.sql` (workshop commands at ~lines 141 and 289–295; run by `verify.yml`), `test-paid-enrollment.sql` (run by `verify.yml`), `test-receipt-charge-payments.sql` (Premium payloads; no reference found in `verify.yml`/`package.json`), `test-crm-phase6/7/9/10/11/12*` (send `plan_type`), `test-receipt-client-regressions.mjs`, `test-receipt-a5-layout.mjs` (asserts the Formule/Premium labels), `test-navigation.mjs`, `test-middleware-security.mjs`, `test-receptionist-browser.mjs`, `test-ui-foundation-browser.mjs`, `render-synthetic-receipt-pdf.mjs`, `fixtures/receipt-migration-pre055.sql` (historical fixture; **leave unchanged**, it exercises 055).
- **Docs:** [receipt-financial-model](../../receipt-financial-model.md), [ARCHITECTURE](../../ai/ARCHITECTURE.md), [SECURITY_RULES](../../ai/SECURITY_RULES.md), [WORKFLOWS](../../ai/WORKFLOWS.md), [FEATURE_INDEX](../FEATURE_INDEX.md), [CURRENT_STATE](../../ai/CURRENT_STATE.md) (at release). Historical plans, evidence and the `history/` documents are not rewritten.

---

# Owner decisions already made (2026-10-08, recorded verbatim)

1. **Formule:** stop showing "Formule" everywhere (receipt form, receipt list, print page, PDF, finance export, student form, list and detail, reports). "Standard" is not shown either: all Yearly students are the same.
2. **Old receipts:** take the easier route code-wise. Historical receipts are not specially preserved as Premium; do not build compatibility rendering for them.
3. **Existing Premium students:** move to Standard. There is no Formule concept afterwards.
4. **Workshop module:** remove entirely, including weekend workshops, Premium groups/memberships/attendance and homework.

These are also registered in [OWNER_DECISIONS](../../ai/OWNER_DECISIONS.md#premium-retirement--decisions-recorded-2026-10-08-plan-proposed).

# Scope and non-goals

**In scope:** everything in the outcome: Formule removal from all new-activity UI/PDF/e-mail/export; the receipt/charge creation contract; student form/list/detail; the workshop module (UI, routes, entities, uploads, portals, reports, navigation); the database objects of the module; the Production data change for existing Premium students; tests and docs.

**Non-goals:** changing receipt numbering, payments, balances, voiding, e-mail delivery logic, enrollment or CRM conversion; changing any role or the receptionist's other permissions; compatibility rendering of historical receipts (decision 2); rewriting historical plans/evidence; replacing the workshop module with anything (online learning remains a separate, missing architecture); dropping `plan_type` columns (Decision 2, not recommended); any Production read or mutation by the architecture or implementation tasks.

# Design

## D1 — Finance contract (Release A, migration 113)

`create_charge_payment_financial` is recreated from the **096** definition (never an earlier snapshot) with the minimum change:

- The `plan_type` payload key is **accepted and ignored**. A stale browser tab or an old build sending `Standard` or `Premium` during rollout can neither fail nor create a Premium record. This also makes the order migration-first safe: the old client keeps working with the new function; the new client would fail against the old one.
- For a Yearly charge, `plan_type` is written as the fixed value `'Standard'` (required by `charges_yearly_formula_check`; the constraint is not changed). Non-Yearly stays NULL.
- `service_description` for Yearly becomes `concat_ws(' · ', 'Yearly', <school year>)`, that is `Yearly · 2026/2027`. Other sessions and the "Autre" form are unchanged.
- The receipt row stores `plan_type = NULL` (the column is already nullable) so new receipts carry no formule, in the table, the e-mail Edge Function (which omits the row when empty) or any future consumer.
- The normalized request fingerprint no longer includes `plan_type`. Consequence: a retry that straddles the migration with the same idempotency key but the old fingerprint fails closed with the existing idempotency-mismatch error, never a duplicate receipt. Accepted and documented; the window is the milliseconds of one in-flight submit.
- Unchanged: numbering, amounts, discount and balance rules, idempotency table, events, e-mail opt-in, ACLs (`revoke all … from public,anon,authenticated,service_role` on the inner command; grant on the public wrapper). The public wrapper `create_charge_payment` needs no redefinition unless the implementer finds it passes `plan_type` explicitly (check against the local 112 database with `pg_get_functiondef`).

Client side: `buildServiceDescription` drops the `planType` parameter; `receiptServiceSummary` no longer appends the plan; `receiptInitialCharge` and `ReceiptForm` stop holding `plan_type`; the Formule selector, preview word, receipts-list PREMIUM badge, print "Formule" row, PDF row and details entry, and finance export column are deleted. The Edge Function drops its "Formule" row and `formula` variable and is redeployed (a Production operation for the release task).

## D2 — Students

`StudentForm` loses the formule card, `plan_type` and both date fields from schema, defaults, load, reset-on-session-change and save payload. The save payload stops sending `plan_type` and `premium_*` so the column default (`'Standard'`) applies and existing values are not overwritten. `students/page.jsx` removes the "Filtrer par formule" filter, the `plan` URL parameter, the `p_plan` argument and the export column. The list RPC signature (with `p_plan`) is intentionally left unchanged in the database: dropping a parameter changes the function identity, and an unused optional parameter that defaults to empty has no security or behavior effect. `students/[id]` removes the Programme Premium block and its three entity loads (fewer queries). Receptionist student creation already writes `'Standard'`.

## D3 — Module removal in code (Release A)

Delete the page, `src/components/premium/*`, the five entity registrations and exports, the `premium_homework` upload purpose branch, `premiumSessionId` plumbing, the `PREMIUM_*` status maps, the notification label/color entries, the portal panels and badge, the timetable block and its direct `premium_sessions` query, the reports loads, and every navigation/middleware/role-allowlist entry for `/premium-sessions`. After Release A no code reads or writes any workshop table, RPC, storage purpose or notification type, which is what makes Release B safe.

Removed route behavior: the page file no longer exists, so admin/director receive the existing application not-found page. Teacher and receptionist previously reached it; with the allowlist entry removed they are treated like any unlisted route and are redirected to their home portal by the existing allowlist. Unauthenticated visitors reach the generic login redirect. No Premium-specific redirect or alias is added (a compatibility alias would be dead navigation).

Notification rows of type `premium_homework` exist until Release B deletes them. The `notifications` page must not break on an unlabeled type; the implementer verifies the fallback label path and, if raw type text would appear, shows the generic `general` presentation for unknown types rather than keeping a Premium label.

## D4 — Database removal (Release B, migration 114)

Single transaction, local-tested, in this order (no `CASCADE`):

1. **Guards (fail closed):** raise unless zero `students` rows have `plan_type='Premium'` or non-null `premium_start_date`/`premium_end_date` (the data step ran). Do **not** assert on workshop row counts: the owner has already seen them and chosen deletion.
2. **Redefine retained functions first**, from their latest definitions, so none references an object about to be dropped: `teacher_can_see_student` (071 minus both premium clauses), `storage_security.immutable_key` (key without `premium_session_id`), `storage_security.can_write` (096 minus the `premium_homework` purpose in the admin/director list and minus the student/parent premium branch), `public.reserve_storage_asset` (052 minus the now-redundant premium rejection; behavior for the four retained purposes unchanged), `public.resolve_storage_asset` (096 minus the premium joins and the premium purpose). `can_insert_reserved_object` is unchanged. Re-apply identical grants/revokes.
3. **Drop the cross-cutting triggers:** `students_sync_premium_membership_entitlement` first, then the table triggers via table drop.
4. **Registry data:** delete `storage_asset_bindings` rows with `premium_submission_id` and `storage_assets` rows with `purpose='premium_homework'` only after the release task has deleted the physical objects through the Storage API (see Storage handling). Delete `notifications` rows of type `premium_homework`.
5. **Constraints and columns:** drop `storage_asset_bindings.premium_submission_id` (and its unique index), recreate `storage_asset_bindings_check` over the remaining four columns; drop `storage_assets.premium_session_id`; recreate `storage_assets_purpose_check` without `'premium_homework'`; recreate `notifications_type_check` without it.
6. **Tables:** `premium_attendance`, `premium_homework_submissions`, `premium_sessions`, `premium_group_memberships`, `premium_groups`, in dependency order, each `DROP TABLE` without `CASCADE`. Their policies, indexes, restrictive receptionist deny policies and table triggers go with them.
7. **Functions:** the ten workshop functions and four receptionist commands listed in the table above, by exact signature.
8. **Students:** drop `premium_start_date`, `premium_end_date` and `students_premium_dates_check`; replace `students_plan_type_check` with `plan_type = 'Standard'` (valid because the guard proved no other value remains). This prevents a direct API write from re-creating a Premium student. `charges`/`receipts` constraints still permit the historical value, because history is not rewritten (Decision 1) and those tables are read-only to browser roles.
9. `notify pgrst, 'reload schema';`

`plan_type` columns on `students`, `charges` and `receipts` and the list-RPC `p_plan` parameter remain (Decision 2, option A). They are inert: nothing reads them for display and nothing can set them to anything but the fixed value. Their existence and the reason are documented in PRODUCT_RULES at implementation.

## D5 — Production data step (existing Premium students)

A reviewed, idempotent script committed under `supabase/manual/` (the existing pattern, like `drop_photo_consent.sql`), executed only on explicit release approval, after Release A is verified and the export exists. Intent:

```
update public.students
   set plan_type = 'Standard', premium_start_date = null, premium_end_date = null
 where plan_type = 'Premium' or premium_start_date is not null or premium_end_date is not null;
```

- **Pre-checks (owner-authorized read-only, release task):** counts of Premium students (by status, deleted, session type), students with Premium dates but Standard plan, active/future/historic memberships, active groups, future-dated sessions, sessions with attendance, homework by status and with files, `storage_assets` and `storage.objects` counts/bytes for `premium_homework`, `notifications` of the type (sent/unsent), receipts/charges holding `Premium` or `Standard` in `plan_type` or `service_description` (for Decision 1). Counts only are written into the release record; no names or contact data are copied into the repository.
- **Side effects the owner must expect:** the 054 trigger ends/deletes the moved students' workshop memberships; `updated_at` is bumped (a staff member with an open student drawer would get the existing stale-edit message once); a formerly Premium student can now be edited by the receptionist like any Standard student (the receptionist save path checks `plan_type = 'Standard'` only for create-replay identity).
- **Idempotency:** the `where` clause matches nothing on a second run. Report `rows affected` before/after and re-run the count query to prove zero.
- **Rollback:** restore from the export (per student id: original `plan_type`, dates, membership rows). Valid only **before** Release B (after 114 the Premium value is rejected by the tightened check and the tables are gone; recovery is then only the database backup/export).
- **Placement:** a separate step, not inside either migration (Decision 4 below), because a migration also runs on fresh local and CI databases where it would be a no-op, and Production data corrections should not be coupled to the schema ledger.

## D6 — Reports and portals (answers to question 5)

| Surface | Result |
| --- | --- |
| Academic Operations report | Removed: the "Premium à affecter" metric, the "Préparation Premium" panel and its link, the unassigned-Premium warning, the per-teacher Premium column and filter condition, the premium props from `reports/page.jsx`, and the five Premium entity loads. The "active Premium" metric is **simply removed**, with no replacement metric. Header text "Groupes, affectations et promesses Premium" becomes a neutral groups/assignments title. Regular groups, enrollments and teacher load stay. |
| Teacher portal | "Préparation Premium" tab, its badge and `PremiumHomeworkInbox` removed. |
| Parent portal / student portal | `PremiumHomeworkSubmitter` panel, premium entity loads and the `premium_homework` notification label removed. Receipts/charges panels stay and still show stored description text (Decision 1). |
| Timetable | "Séances Premium à venir" section and the `premium_sessions` query removed. |
| Student page | "Programme Premium" block removed. |
| Sidebar/navigation | "Heures Premium" entry and every allowlist entry for the route removed. |
| Notifications page | `premium_homework` label/color removed (rows deleted in Release B). |

## D7 — Storage handling for homework files

Homework files are objects in the `documents` bucket (`assets/<uuid>`), tracked by `storage_assets`/`storage_asset_bindings`. Deleting registry rows (or `storage.objects` rows by SQL) does not reliably remove the physical file. Required sequence: export (download) the files and registry rows to owner-controlled private storage → delete the objects through the Storage API using the operator's authorized credential → verify `storage.objects` has none left for the listed paths → only then apply 114. If an object cannot be deleted, 114 must not be applied; orphaned objects are in any case unreadable to browser roles because download authorization is registry-based (`resolve_storage_asset`), but they would be undeletable evidence of an incomplete removal.

# Security boundaries

- RLS, role gates and the finance/conversion authority stay as they are. This plan removes permissions (workshop tables' policies, four receptionist commands, the homework purpose) and adds none; the only new restriction is the tightened `students_plan_type_check`.
- Retained storage functions are the highest-risk edit: acceptance requires a before/after ACL snapshot of every function in `storage_security` and `public` touched, identical grants, and the existing upload/download flows for `student_photo`, `teacher_photo`, `portfolio` and `enrollment_document` passing for admin, director, receptionist, teacher, student and parent where those roles apply today.
- `teacher_can_see_student` must keep teacher access through groups and enrollments (`teacher_can_access_student_group`) exactly; only the two premium clauses go. A regression test proves a teacher with no group/enrollment link still cannot read a student, and one with a link still can.
- No `CASCADE`, no `service_role` bypass in migrations, no RLS disabling, no test relaxed. Functions are recreated with the same `security definer` and `set search_path` settings.
- The Storage API deletion and the Edge Function deployment need operator credentials that live outside the repository; nothing is stored in git. Exports contain student and parent data and must stay in owner-controlled private storage, not in the repository, PR, logs or chat.
- Edge Function: removing the e-mail row is a presentation change; its authorization and delivery logic are untouched.

# Migration, test, rollout and recovery strategy

## Sequence

| Step | Gate | Action |
| --- | --- | --- |
| R0 | Owner authorizes read-only Production pre-checks | Counts listed under D5; confirm a current database backup exists (PITR/backup availability is **NEEDS VERIFICATION**; do not assume); record the Production ledger is still 001–112 and the next free migration number. |
| R0b | Owner reviews counts and approves Release A | Includes the future-dated workshop, membership and pending-homework facts. |
| A1 | Release approval | Apply migration 113 (migration-first, as RCC-A2 did). Compatible with the old client. |
| A2 | Merge / Vercel deploy | Application code removal (D1 client side, D2, D3, D6). Verify removed routes, UI sweep, and rolled-back synthetic receipt probes (a real receipt creation in Production is a mutation and needs separate approval). |
| A3 | Same release | Redeploy the `sendReceiptEmail` Edge Function without the Formule row. |
| B0 | Owner approves Release B after reviewing export evidence | Export of the five tables, `storage_assets`/bindings rows for the purpose, `notifications` of the type, and the files; stored privately; checksum/row counts recorded. |
| B1 | Explicit approval | Run the D5 data step; prove zero Premium students and capture the second-run no-op. |
| B2 | Explicit approval | Delete homework objects via Storage API; verify. |
| B3 | Explicit approval | Apply migration 114 (guards enforce B1). Never `supabase db push --linked` automatically; the operator applies the reviewed file as the release task directs. |
| B4 | Closeout | Update CURRENT_STATE, FEATURE_INDEX, ARCHITECTURE, SECURITY_RULES, WORKFLOWS, PRODUCT_RULES, receipt-financial-model with dated evidence; keep merge, deployment and verification distinct. |

Release A and B may be one working day or weeks apart; A is independently stable. If the owner prefers a single release (Decision 3 option B), the same steps run in the same order without the pause.

## Local test strategy (synthetic data only)

- **Static/UI regressions (Node):** update the receipt, navigation, middleware, A5 layout and render scripts so the expected behavior is the new one (no Formule row, no Premium text for new activity, `/premium-sessions` absent from every list). Add a guard test that scans the user-facing `src` tree, the PDF/e-mail builders and the Edge Function for `Formule`, `Premium` and `premium_` (allowlist: the migration files, the retained `plan_type` column name where it must appear, and tests asserting absence). Exact forbidden-token rules are defined by the implementer and reviewed.
- **Database, Release A:** extend the rollback-only finance tests: Yearly without `plan_type` yields description `Yearly · 2026/2027`, charge `plan_type='Standard'`, receipt `plan_type` NULL; a payload carrying `Premium` yields the same (Premium never created); non-Yearly unchanged; replay with the same idempotency key is idempotent; numbering, balances, partial and full payments, voiding and e-mail request flags are compared against the pre-change results on identical inputs; ACL snapshot of the two functions equals 112.
- **Database, Release B upgrade rehearsal:** reset to 113, seed synthetic Premium students, groups, memberships, sessions, attendance, homework with registry assets and bindings, and notifications; run the D5 script; assert second run is a no-op; run 114; assert all listed tables/functions/columns/policies are gone, `students_plan_type_check` is tightened, guards fail on a seeded remaining Premium student, and a seeded non-premium storage asset of each retained purpose still resolves for its allowed roles and is denied for others. Add this rehearsal to `verify.yml` in the pattern of the existing upgrade rehearsals (a `.github/**` change makes the PR use the full CI lane).
- **Existing suites that must still pass after being updated only where they asserted Premium behavior:** `test-paid-enrollment.sql`, `test-receptionist-batch1.sql` (workshop command cases removed, all other receptionist cases kept), `test-receipt-charge-payments.sql`, `test-receipt-client-regressions.mjs`, CRM suites that call `create_charge_payment`, student-list/pagination and enrollment-conversion tests, `test:navigation`, `test:middleware`, and the receptionist/UI-foundation browser scripts. `test-premium-shared-workshops*.sql` are deleted with the module they test (their deletion is the intended consequence of decision 4, not a weakened test); the implementer records that they were not CI-wired.
- Run `npm run lint` and `npm run build` (dead imports of deleted entities must fail the build, which is a useful check).
- Browser verification (local, synthetic): receipt creation for Yearly and non-Yearly; student create/edit; receipt print and PDF; each portal; reports; the removed route for admin and for a restricted role.

## Recovery

- **Release A:** redeploy the previous Vercel build, then (if needed) restore the 096 definition of the finance function through a new forward migration copied from the preserved 096 text. Order matters: old client + new function works; new client + old function fails (the old function requires a plan), so roll code back first. The Edge Function previous revision is redeployable.
- **Data step (before B3):** restore from the export script. **After B3 there is no in-place rollback**: recovery is a database backup/export restore and a forward fix. This is the main reason B is a separate approval.
- Local failures are diagnosed and fixed autonomously; Production failures stop and report.

# Expected modules

(Full manifest in the contract.) Finance: migration 113, client builders, receipts pages, finance page, Edge Function. Students: form, list, detail. Module removal: page, components, entities, uploads, portals, timetable, reports, navigation, middleware. Database: migration 114, manual data script. Tests/docs as listed.

# Owner decisions required

**Decision 1 — Stored text on old receipts and charges.** Old and new Yearly rows store the plan word in `service_description` (for example `Yearly · Premium · 2026/2027`, and `Yearly · Standard · 2025/2026` for every Standard row), and many screens print that text directly.
- **A (recommended): leave stored text and old rows untouched.** Consequence: "Premium" or "Standard" can still appear in the description of old records on finance, student, parent/student portal, dashboard, old receipt reprints and old receipt e-mails. No new activity shows it. Consistent with decision 2 (no special handling, easiest code) and with the acceptance wording "for new activity". Issued receipts stay exactly as issued, which avoids any accounting/audit question about edited financial records.
- **B: forward migration rewriting the stored text** (remove the plan word from `Yearly` charge and receipt descriptions). Consequence: every old Yearly record loses the word everywhere with no display code; but issued receipts would change after the fact (a reprint differs from what was handed out), the migration touches financial rows that are otherwise read-only, needs its own rehearsal and count reconciliation, and cannot be undone except from backup. Needs your explicit approval of rewriting financial record text.
- Not offered: scrubbing the word at display time. That is exactly the compatibility rendering decision 2 rules out.
- **Blocking:** yes for plan approval (it decides whether any migration touches financial rows). If unanswered, implementation uses A.

**Decision 2 — Fate of `plan_type`.**
- **A (recommended): keep columns and constraints; new charges get a fixed server-side `'Standard'` (required by the existing constraint), new receipts NULL, students keep the default; the UI never reads or shows it.** Plus, in Release B, drop the two student Premium date columns and tighten the student check to `'Standard'` only. Smallest safe change: no list/RPC redefinition, no view change, no historical-row impact.
- **B: relax or drop the constraints** so Yearly needs no plan (charges check becomes "plan is NULL" for new rows). Consequence: needs a validated-vs-`NOT VALID` strategy because history contains Premium/Standard; no user-visible benefit over A.
- **C: drop the columns.** Consequence: redefine the 097/075/073/067 list functions, 096 `can_write`, the finance command and any view/`s.*` consumer; irreversible loss of the historical formule of issued receipts; largest blast radius on finance for zero user-visible gain.
- **Blocking:** yes (fixes the migration design).

**Decision 3 — Workshop data removal approach.**
- **A (recommended): two-phase.** Release A removes all code that reads or writes the module and ships the non-destructive finance migration; after verification and export evidence, Release B deletes files and objects with separate destructive approvals.
- **B: single release** (code and drops together). Consequence: any deployment skew (cached browser bundle, rollback) can hit dropped tables; no pause for the owner to look at real counts.
- Sub-acknowledgements required with either option: (i) future-dated workshops, memberships, pending homework and all attendance/history are permanently deleted after export; (ii) homework files are deleted from storage; (iii) the export is retained privately for a period the owner names (suggest at least until the next school-year closure).
- **Blocking:** yes. Release B additionally needs its own explicit approval after R0 counts.

**Decision 4 — Existing Premium students: where does the change run?**
- **A (recommended): a separately approved, reviewed idempotent manual script after Release A** (D5), with pre/post counts.
- **B: inside migration 114.** Consequence: one fewer approval, but couples a data correction to the schema ledger and runs as a silent no-op on every fresh database.
- **Blocking:** not for implementation; blocking for the release task. Counts in R0 are required either way.

**Decision 5 — Reports and portals.** Confirm that the Premium sections and metrics in D6 are removed with no replacement.
- **A (recommended): remove, no replacement.**
- **B: replace "active Premium" with a plain Yearly-students metric.** Consequence: new reporting scope not requested.
- **Blocking:** no (A applies unless you say otherwise).

**Decision 6 — Notification history of type `premium_homework`.**
- **A (recommended): delete these rows in Release B (after export), then narrow the type check.**
- **B: keep the rows and keep the type allowed.** Consequence: a "premium" type name stays in the schema and the page needs a permanent label.
- **Blocking:** no (A applies unless you say otherwise).

**Approval record (to be completed by the owner before implementation):** approver, date, chosen option for Decisions 1–6, approved plan revision (PR-r1 or later).

---

## IMPLEMENTATION CONTRACT

### Scope

Retire Formule and Premium from the platform as specified above, in two releases, applying the owner's chosen options for Decisions 1–6 (defaults if unchanged: 1A, 2A, 3A, 4A, 5A, 6A). The implementer may not widen scope to the receipt numbering/payment engine, enrollment/conversion, CRM, roles/permissions, or online-learning architecture.

### Prerequisites

1. Owner approval of this plan revision and the six decisions, recorded in the approval record and [OWNER_DECISIONS](../../ai/OWNER_DECISIONS.md).
2. Fresh `origin/main`; verify the latest migration number (provisionally 113 and 114) and re-read cumulative definitions with `pg_get_functiondef` on a local database at the current head before editing any function.
3. Local Supabase only (`http://127.0.0.1:54321`), synthetic data, external e-mail disabled. A dedicated feature branch; never `main`.
4. Release A and Release B are separate PRs/work items unless Decision 3 option B is chosen.

### Object / module manifest

**Release A — migration `113_premium_retirement_finance_contract.sql` (provisional name):** recreate `public.create_charge_payment_financial(jsonb)` from the 096 definition with D1 changes only; identical ACLs; verify `create_charge_payment(jsonb)` needs no change.

**Release A — application:**
- Modify: `ReceiptForm.jsx`, `receipts/page.jsx`, `receipts/[id]/print/page.jsx`, `receiptPdf.js`, `receiptPresentation.js`, `receiptInitialCharge.mjs`, `finance/page.jsx`, `StudentForm.jsx`, `students/page.jsx`, `students/[id]/page.jsx`, `AcademicOperationsReport.jsx`, `reports/page.jsx`, `parent-portal/page.jsx`, `student-portal/page.jsx`, `teacher-portal/page.jsx`, `timetable/page.jsx`, `notifications/page.jsx`, `entities.js`, `storage.js`, `integrations.js`, `statusColors.js`, `Sidebar.jsx`, `navigation.mjs`, `roleAccess.mjs`, `middleware.js`, `ProtectedRoute.jsx`, `supabase/functions/sendReceiptEmail/index.ts`. All paths are under `src/` except the Edge Function.
- Delete: `src/app/(admin)/premium-sessions/`, `src/components/premium/`.
- Tests: update the scripts listed under "Tests/fixtures"; delete `test-premium-shared-workshops.sql` and `-rls.sql` with the module; add the absence guard test and the finance assertions; leave `fixtures/receipt-migration-pre055.sql` unchanged.

**Release B — migration `114_premium_retirement_drop_workshops.sql` (provisional name), D4 steps 1–9 exactly,** plus `supabase/manual/premium_students_to_standard.sql` (D5), a release rehearsal script, and the `verify.yml` upgrade step.

**Release B — docs:** CURRENT_STATE, FEATURE_INDEX (replace the Premium row), ARCHITECTURE (academics row, academic-session glossary, enrollment→teaching schedule paragraph), SECURITY_RULES (receptionist role text), WORKFLOWS, PRODUCT_RULES (the Yearly/no-formule invariant and the inert `plan_type` explanation), [receipt-financial-model](../../receipt-financial-model.md) (mark the 057 formula sentence as retired history and describe the new contract), plans README (move this plan to completed when closed).

### Invariants

- Receipt numbering, payments, balances, voiding, idempotency, e-mail opt-in, enrollment and conversion behavior are unchanged; the same inputs produce the same amounts and balances before and after.
- Receipts and charges stay read-only to browser roles; no historical receipt/charge row is changed unless Decision 1 option B is explicitly approved.
- No RLS policy, grant or test is weakened. Every retained function keeps the same `security` mode, `search_path` and ACLs (snapshot-compared).
- No `DROP … CASCADE`. Release B guard raises if any Premium student remains.
- Status/task/activity separation and the trusted conversion/finance boundaries are untouched.
- New activity never creates a record containing `Premium`, and never displays a formule word.
- Production SQL, file deletion, Edge Function deployment and migration application happen only by explicit release approval.

### Acceptance / tests

1. No "Formule", "Premium" or Standard-as-formule text in new-activity UI, receipts (list, print), PDFs, finance export, student form/list/detail, reports, portals and receipt e-mail; proven by the absence guard and by browser walkthrough.
2. `/premium-sessions` returns the application not-found page for admin/director; restricted roles are redirected to their home by the existing allowlist; `Sidebar`, `navigation.mjs`, `roleAccess.mjs`, `middleware.js`, `ProtectedRoute.jsx` and tests contain no entry for it.
3. A new Yearly receipt reads `Yearly · <school year>`; charge `plan_type='Standard'`; receipt `plan_type` NULL; a `Premium` payload cannot produce a Premium record.
4. Finance, receipt, student, enrollment-conversion, CRM, navigation, middleware and receptionist suites pass; updated assertions are limited to Premium/Formule expectations and each is listed in the PR.
5. Release B rehearsal: fresh database at 113 and upgraded database with synthetic workshop data both end with identical retained schema; dropped objects absent; retained storage flows pass for every allowed role and fail for others; guard test passes.
6. `npm run lint`, `npm run build` clean; changed-Markdown link/secret/whitespace checks pass.
7. PR description lists the exact migration filenames, Decision options applied and the Production steps deferred to the release task.

### Stop conditions

Stop and report (do not improvise) if: a dependent object other than those listed is found; a retained function's latest definition differs from this plan; any existing finance test fails for a reason other than a Premium/Formule assertion; ACL snapshots differ; the owner changes a decision after approval; Production access, credentials or data would be needed; a destructive step cannot be rehearsed locally.

### Docs / status reporting

Report status per [AGENTS](../../../AGENTS.md#implementation-handoff) with branch, head SHA, PR, tier rationale, checks with results tied to the SHA, self-check, plan revision and migration filenames, unresolved decisions. Do not mark Production state until a dated release record exists; keep merge, deployment and Production verification distinct. Independent review is mandatory for each Tier-3 release PR.
