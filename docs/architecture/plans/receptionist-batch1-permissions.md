# Scope

**Design only — APPROVED BOUNDARY / PLANNED IMPLEMENTATION.** Architecture baseline: main `ef4e63a51de6a486ea8107c9af579513895c0453`, inspected 2026-09-29, cumulative migrations 001–095. This plan refines [ADR-003](../decisions/ADR-003-receptionist-operations-role.md) into the Batch 1 implementation contract. No application changes, migration, production access or deployment were performed to prepare it.

Enable a dedicated receptionist's existing operational workflows through coordinated navigation, route, API/RPC and database authorization. Preserve all other roles. SQL is the enforcement authority; a shared application capability map prevents divergent presentation/route decisions. Implementation needs forward migration **096**; verify that number is still free before starting.

# Non-goals

No Today redesign, CRM detail redesign, center-visit UX, walk-in UX, new finance/teacher business logic, Meta features, provider activation, analytics or new authorization framework. No role reassignment to admin. Existing payment/academic engines remain authoritative. No new installment-plan engine, price policy, refunds or destructive-finance entitlement. Minimal permission-aware forms/projections are security adapters, not a product redesign.

# Current architecture findings

Read [current state](../../ai/CURRENT_STATE.md), [architecture](../../ai/ARCHITECTURE.md), [product rules](../../ai/PRODUCT_RULES.md), [workflows](../../ai/WORKFLOWS.md), [security](../../ai/SECURITY_RULES.md) and [AGENTS](../../../AGENTS.md). The following observations are from code/cumulative migrations, not assumed deployment behavior.

| Surface | Current authority / finding | Batch implication |
| --- | --- | --- |
| Identity | `profiles.id = auth.users.id`; 077 admits director/admin/receptionist/teacher/parent/student/pending; pending_roles excludes pending. 041/042/077 protect profile columns, invitations, transitions and last-director invariant. | No role-constraint or role-administration change. Read stored role, never user metadata. |
| Page gates | [roleAccess.mjs](../../../src/lib/roleAccess.mjs), [middleware](../../../src/middleware.js), [ProtectedRoute](../../../src/components/ProtectedRoute.jsx). Receptionist exact list plus student UUID detail; API handlers bypass middleware's page-role gate. | One application route/capability policy, used before rendering/fetching and in returnTo/login checks. APIs still authorize independently. |
| Navigation | [Sidebar](../../../src/components/layout/Sidebar.jsx) has both ADMIN/OPERATIONS role arrays and an entirely separate receptionistNav. `navigation.mjs` validates destination syntax, not permission. | Replace duplicated receptionist rules with capability-driven navigation; safe URLs still need role authorization. |
| Students | List/detail switch to restricted [ReceptionistOperations](../../../src/components/students/ReceptionistOperations.jsx). Shared StudentForm writes full dossier payload through entities; student detail loads finance, academic, pickup and Premium data together. | Do not simply remove role switch and fire every admin query. Split data loading by capability; add a narrow dossier write path. |
| Admissions | [EnrollmentModal](../../../src/components/students/EnrollmentModal.jsx) uses `save_receptionist_enrollment` (077); others use direct CRUD. Receptionist may write Submitted/Under Review/Trial and assign an already Confirmed/Validated enrollment. | Preserve this command and trusted confirmation boundary. No generic enrollment UPDATE permission. |
| CRM/placement | 079's `crm_security.require_reader(false)` admits operations; technical=true requires director. 083 protects CRM linkage and uses explicit booking/result commands; non-CRM column grants remain. 084 owns conversion. | Retain existing CRM/placement paths and version/idempotency checks; no new technical access. |
| Groups/academics | Groups list creates/edits/deletes through entities; detail uses direct enrollment/student assignment and `remove_student_group` (074, INVOKER). 070–074 enforce dossier/enrollment consistency; 049 defines session/level catalogue. | Narrow operational writes, deny deletion, preserve transaction/trigger semantics. |
| Attendance | `save_attendance` (063) is INVOKER; latest `enforce_attendance_integrity` (064) only admits director/admin/teacher. | RLS plus trigger authorization must both admit reception; preserve teacher identity and immutable attendance identity. |
| Premium | 051–054 implement sessions, shared groups/memberships, entitlement guards, attendance and separate homework. Timetable and student detail fetch Premium entities. | Include operational scheduling/membership/attendance dependencies; do not grant homework/portfolio access just to satisfy broad page fetches. |
| Finance | `create_charge_payment` latest wrapper is 084; inner `create_charge_payment_financial` is 057's implementation renamed by 072, not a separately authored source file. Both explicitly require admin/director. `receipt_enrollment_candidates` also rejects reception. | Update both authorization gates without forking payment logic; inner stays uncallable by browser roles. |
| Analytics trap | 055's `require_finance_staff` protects modern summaries **and** receipt-email retry. Legacy `get_finance_summary`/`get_unpaid_receipts` (034) and `get_referral_breakdown` (039) are INVOKER and rely on row visibility; the last already sees receptionist-readable students. | Do not widen require_finance_staff. Add explicit receptionist denial to legacy analytics RPCs; label this existing boundary gap, not approved analytics access. |
| Teacher data | Full Teacher entity uses SELECT *; list/profile/form expose contract information and fetch compensation. 043 isolates teachers/payroll to admin/director. `get_teacher_directory` returns only id/full_name/email and currently excludes receptionist. | Reuse directory for selectors; add a separate safe operational projection for profile fields. No base teacher SELECT or embedded relationship. |
| Teacher identity | `get_my_teacher_id` uses protected profile email matching teacher email (024); 071 scopes academic access by actual group/enrollment relationships. | Teacher email is authorization-sensitive, not an ordinary receptionist contact edit. |
| Storage | Registry enforcement 045/046 is extended by **052** (latest can_write, can_insert_reserved_object and resolve_storage_asset); 054 extends Premium homework reservations. | Read latest definitions; do not replace with old 046 bodies and lose later guards. Narrow purposes only. |
| RLS | 077 adds restrictive `receptionist_deny` to then-existing public tables except profiles/students/groups/enrollments/placement_tests. CRM tables added later have revoked direct access and RPC gates. | A new permissive policy alone cannot overcome restrictive denial. Replace only selected deny policies with command-specific restrictions; leave others intact. |
| Server | No `use server` actions found. Route handlers: admin invite/update-role/payroll, email/send, storage sign/finalize; provider/cron handlers have distinct credentials. | No new service-role operational API needed. Use authenticated RPCs. Keep admin/provider endpoints denied. |
| Configuration | `/settings` selects ReceptionistAccount; only own name/phone edits. app_config has historical auth read but 077 denies receptionist. | Keep Mon compte branch; do not mount system/user/integration tabs. Existing account-only view stays. No inspected Batch 1 receipt/group/attendance/timetable consumer needs a direct app_config expansion. |

Primary SQL sources: [077](../../../supabase/migrations/077_receptionist_role_and_operational_access.sql), [043](../../../supabase/migrations/043_teacher_sensitive_data_isolation.sql), [055](../../../supabase/migrations/055_receipt_charge_payments.sql), [057](../../../supabase/migrations/057_receipt_school_year_workflow.sql), [074](../../../supabase/migrations/074_enrollment_workflow_consistency.sql), [075](../../../supabase/migrations/075_student_payment_list.sql), [083](../../../supabase/migrations/083_crm_placement_integration.sql), [084](../../../supabase/migrations/084_crm_enrollment_and_conversion.sql). Inspect cumulative definitions before changing an object. Existing comments calling every admin/director path “full access” are not permission evidence.

# Target capability model

Extend **`src/lib/roleAccess.mjs`** as the canonical application source (pure, browser/server compatible). Export `hasCapability(role, capability)` plus named helpers where readable; deny unknown role/capability. Keep role homes and make receptionist route matching consume this map. No DB capability table, client-controlled entitlements, runtime role editor, or generic “isStaff” that unlocks every domain.

| Capability | Director | Admin | Receptionist | Other roles |
| --- | --- | --- | --- | --- |
| canManageCRM / canManageAdmissions / canManagePlacement | yes | yes | yes, bounded commands | Existing self/family/teacher paths only, not this school-wide capability |
| canManageStudents / canManageGroups / canManageAcademics | yes | yes | yes, non-destructive operational actions below | No global management; retain teacher-specific scoped teaching access |
| canManageFinanceOperations | yes | yes | yes | Retain existing family/self read scope only |
| canManageTeacherOperations | yes | yes | safe projection/operational edits only | Existing directory and teacher-self teaching paths unchanged |
| canViewFinanceAnalytics / canManageUsers / canManageSystemSettings | yes | yes, existing limitations | no | No new access; retain existing routes/subject scopes rather than granting management |
| canViewTeacherCompensation / canManagePayroll | yes | yes | no | no |
| canManageIntegrations / canViewMarketingAnalytics | yes | no | no | no |
| canCorrectFinance (void/cancel/delete) | yes | no | no | no |
| canArchiveStudents / canManageTeacherHR / canDeleteAcademicRecords | Preserve existing director/admin checks | Preserve existing checks | no | Preserve existing scoped behavior; no widening |
| canManageOwnAccount | yes | yes | own name/phone only | Existing own-account boundary |

Coarse `canManage*` helpers choose module visibility; they do **not** authorize every action or column. Expose action helpers (e.g. canAssignGroup, canRecordAttendance, canEditTeacherOperationalFields, canManageStudentDocuments) from the same map. Preserve teacher-specific subject checks rather than assigning teachers global operational capability. Admin user-management remains subject to 077 role-transition restrictions.

SQL canonical authority: a small private **`operational_security`** schema with a finite `has_capability(text)` / `require_capability(text)` implementation reading `auth.uid()` and `profiles.role`. No caller-role or actor override. New public RPCs invoke it as owner; helpers are not public endpoints. Policies may retain explicit role predicates to avoid granting schema access. Application and SQL maps necessarily live in separate runtimes: cross-layer role-matrix tests are the parity contract, not a promise that JavaScript enforces RLS. Do not refactor every historical policy just to use the new helper.

# Permission matrix

ALLOW means Batch 1 must implement the bounded action, not that it exists today. DENY means retain/establish server and database denial, even if a link is hidden. Conservative exclusions below are Batch 1 safety decisions within ADR-003, not permanent changes to its full operational target.

| Area / action | Receptionist | Exact boundary |
| --- | --- | --- |
| CRM Today/prospects/manual intake, review and follow-up | ALLOW | Existing operational commands; no technical attribution/mappings/policy editing. |
| Students: read/search/list/detail | ALLOW | Active dossiers, operational academic/finance sections; existing paginated search, not management summaries. |
| Students: create | ALLOW | Existing manual creation semantics (Enrolled is dossier status, not fabricated CRM conversion); narrow form fields, default status controlled server-side. No bulk import. |
| Students: edit | ALLOW | Name, DOB, telephone, age category, ordinary notes, photo; session/level/group through compatible enrollment/group commands. Contact email on new records is allowed; changing existing email/parent_email is denied in Batch 1 because those values authorize portal access. |
| Students: archive, restore, hard delete, bulk import/export | DENY | Preserve admin/director routes/commands; no deleted_at, audit timestamps or profile-link writes. Paginated operational reads are not a confidentiality guarantee against manual aggregation. |
| Students: status/Premium entitlement override | DENY | No manual status downgrade/confirmation or plan/date entitlement override. Existing finance/academic engine side effects remain. |
| Student photos / enrollment documents read and upload/append | ALLOW | Active student, matching enrollment, registry purpose/subject/uploader checks. Existing attachment removal/replacement and legacy unclassified files remain denied. Photo replacement uses existing binding lifecycle. |
| Pickup-authorized adults | ALLOW read only | Needed when student detail mounts; edit/removal and dismissal workflow not in this batch. |
| Admissions: Submitted/Under Review/Trial create/edit | ALLOW | `save_receptionist_enrollment`; CRM start remains `crm_start_enrollment`. |
| Admissions: arbitrary Confirmed/Validated, Rejected, downgrade or delete | DENY | Confirmation only through existing trusted payment effect or assignment of already confirmed enrollment; no free confirmation button. |
| Placement: book/reschedule/result | ALLOW | Existing linked RPCs and unlinked permitted fields. No forged crm_lead_id; no hard deletion. |
| Groups: view/create/edit operational schedule/teacher | ALLOW | Existing field catalogue; no incompatible reassignment of existing membership by changing group session/level. |
| Groups: learner assignment/reassignment/removal | ALLOW | Explicit enrollment selection when ambiguous; 070–074 atomic synchronization; preserve history and confirmed-without-group behavior. |
| Groups: delete | DENY | No hard-delete/cascade or bulk destructive actions. |
| Academics: sessions/levels/timetable | ALLOW | Existing catalogue and operational scheduling, not system catalogue/config editing. |
| Attendance: view/record/correct status | ALLOW | Existing save_attendance validation; no identity rewrite, duplicate row or historical deletion. |
| Premium: groups/schedules/membership/attendance | ALLOW | Existing entitlement, date, weekend, duration and membership guards. Ending membership is the existing audited operational action, not history deletion. |
| Premium: homework/files/grading; assessments write/delete | DENY | No pedagogical content changes in this permission batch; existing teacher/admin paths remain. |
| Assessments: read | ALLOW | Existing learner/group results for operational coordination; no new grading entitlement. |
| Finance: create charge, agreed price/discount and due date | ALLOW | Existing create_charge_payment bounds, including zero-payment charge creation. No new discount rules or editing an existing agreement. |
| Finance: record payment/generate/print receipt | ALLOW | Existing engine, explicit enrollment, actor-bound request identity and locks; no direct financial table mutation. |
| Finance: learner balance/payment history/receipt list | ALLOW | Operational receipts and charge_balances; no financial_events audit ledger, revenue attribution or aggregate management screens. |
| Finance: payment schedules | ALLOW existing due-date/installment view | Current support is charge due_date plus successive payments/balance, not a separately modeled schedule. No new payment-plan business logic. |
| Finance: opt-in receipt email / eligible retry | ALLOW | Existing stored receipt recipient, retry rules, provider idempotency; no general email relay or destination change on retry. |
| Finance: void receipt/cancel charge/delete mistaken receipt/correct issued record | DENY | Keep director-only functions and correction routes. Receptionist records error context for director outside these commands; no new correction workflow. |
| Finance: analytics/revenue/profitability/ROAS/CAC/source reports | DENY | Modern and legacy RPCs as well as pages. Operational records can be manually summed; prohibition concerns management interfaces, not mathematical secrecy. |
| Teachers: list/profile/contact/certifications/authorized levels | ALLOW | Explicit safe projection only; never full Teacher entity. |
| Teachers: edit operational profile | ALLOW | full_name, telephone, certifications, niveaux_autorises only; email read-only, no free-text HR notes. |
| Teachers: schedule/group/academic assignments | ALLOW | Existing groups and Premium scheduling commands; no payroll calculation or compensation history. |
| Teachers: create/archive/delete; email/account identity changes | DENY | HR/identity workflow remains admin/director; do not reuse mixed TeacherForm unchanged. |
| Teachers: contract_type, taux_horaire, salaire_mensuel, iban, notes, payroll/payment history | DENY | Not returned by projection, not writable, not indirectly embedded or exportable. |
| Users/roles/integrations/Meta/mappings/system settings/director reports | DENY | Existing authenticated role/technical checks remain. |
| Mon compte | ALLOW | Own full_name/phone; no role, email, linked_student_id or linked_teacher_id mutation. |

**NEEDS EXPLICIT PRODUCT DECISION:** none blocks Batch 1. Any later request to grant receptionist financial void/correction/deletion, manual unpaid confirmation, record archival or identity reassignment needs explicit owner approval before widening this contract. Those actions are denied now; Sol must not silently infer them from “full operational.”

# Route/navigation matrix

Use actual existing routes; group headings are not new pages. Match exact paths and UUID shapes, not `startsWith('/finance')` or whole `/teachers/*`. Preserve public login/registration/privacy behavior and existing other-role routes.

| Receptionist navigation | Allowed current routes | Hidden and directly rejected for receptionist |
| --- | --- | --- |
| Aujourd’hui | `/crm/today` (home unchanged) | `/dashboard`, `/reports` |
| Prospects | `/crm/leads` | `/crm/analytics` and descendants; no invented integration route needed |
| Tests de niveau | `/placement-tests` | Destructive actions remain unavailable within page |
| Pré-inscriptions | `/enrollments` | Confirm/reject/delete controls |
| Apprenants | `/students`, `/students-directory`, `/students/new`, `/students/:uuid`, `/students/:uuid/edit` | `/students/import`, unknown descendants; archive/export and protected fields hidden |
| Académique | `/groups`, `/groups/:uuid`, `/timetable`, `/attendance`, `/premium-sessions`, `/assessments` (read-only results) | `/dismissal`, `/learning-assessments`, `/portfolios`, `/certificates` outside this batch; group deletion, Premium homework, grading controls |
| Finance | `/receipts`, `/receipts/new`, `/receipts/:uuid/print`; balances in `/students/:uuid` and existing receipt form | `/finance` is an analytics dashboard: deny. Also `/finance/charges/:uuid/edit`, `/receipts/:uuid/edit`, `/receipts/:uuid/delete`, `/receipts/deletions` and unknown descendants |
| Enseignants | `/teachers`, `/teachers/:uuid`, `/teachers/:uuid/edit` with safe operational branch | `/teachers/new`, `/payroll`, `/leave-requests`, all HR panels/links and unknown descendants |
| Mon compte | exact `/settings`, ReceptionistAccount only | Any admin/user/role/system tab regardless of query/hash; all `/settings/*` descendants |

Finance heading expands to Reçus / Encaisser un paiement, never links to `/finance`. Teacher heading says Enseignants, not Enseignants & RH. No new `/academic`, `/payments`, `/balances` or `/teachers/:id/schedule` route: profile links to existing group/timetable surfaces filtered by teacher. No communications/notifications/activity-log/role portals added. Keep CRM detail unchanged.

Before rendering, middleware and ProtectedRoute must agree on all paths, case/trailing-slash normalization as Next actually serves it, invalid UUIDs, nested paths and returnTo. `allowedRoles` must not expand receptionist permissions. A denied child's data loader must not execute. Header/person links and action controls use the same capabilities as Sidebar.

# Server/API/RPC changes

Existing browser clients call authenticated Supabase RPCs. Keep that shape. No service-role proxy for ordinary school operations; no caller-supplied role or actor. New endpoints are unnecessary except the existing Storage handlers' authorization through RPCs.

| Interface | Required implementation |
| --- | --- |
| `crm_*` operational/technical functions | Operational grants already fit; leave behavior intact. Technical=true, policy publishing, mappings, insights, lifecycle and revenue interfaces remain director-only. |
| `create_charge_payment(jsonb)` + `create_charge_payment_financial(jsonb)` | Admit canManageFinanceOperations at **both** gates, preserve all business logic/transaction checks. Inner remains revoked from public/anon/authenticated; do not expose it as a bypass. Reject receptionist changes to existing student email/parent_email through `update_contacts` as well as dossier commands; unchanged values are fine. |
| `receipt_enrollment_candidates(uuid)` | Admit operations; preserve fixed operational output, no lead/technical attribution data. |
| `retry_receipt_email(uuid)` | Call new private finance-operations guard instead of widening `require_finance_staff`. Preserve locks/status validation/opt-in recipient/provider behavior. |
| `require_finance_staff` + modern summaries | Remain admin/director. `get_finance_charge_summary`, `get_monthly_finance_summary`, `get_finance_year_months`, `get_unpaid_charges` stay denied to receptionist; use learner balances instead of the dashboard widget RPC. |
| Legacy `get_finance_summary`, `get_unpaid_receipts`, `get_referral_breakdown` | Add explicit authenticated receptionist denial before reading. Preserve other roles' existing INVOKER/RLS behavior and result signatures; do not turn them into unrestricted DEFINER reads. Revoke PUBLIC/anon execution if not needed, with regression tests for existing consumers. |
| `save_receptionist_enrollment` | Preserve existing status/compatibility restrictions. Add explicit session/year support as specified in 096 below; no Confirmed/Validated initiation or free downgrade. |
| `search_students_page` (latest 075) | Keep INVOKER, row scope and per-learner payment filters. Reject receptionist `p_page_size=0` export mode; ordinary bounded pages remain available. No change to other roles. |
| `remove_student_group` | Keep legacy INVOKER implementation unchanged; receptionist narrow assignment adapter calls it within authorized owner transaction. No direct enrollment update permission just to make it run. |
| `save_attendance` | Preserve INVOKER contract; add receptionist INSERT/UPDATE/SELECT RLS and update latest integrity trigger role gate. Keep teacher subject checks and identity immutability. |
| `get_teacher_directory` | Add receptionist to existing allowed roles, same three return columns and signature; selectors gain no new HR fields. |
| `get_teacher_operations(uuid default null)` (new) | Fixed typed projection, operations-role gate, active rows; used for receptionist list/profile/edit. See teacher design. |
| New narrow writes | `save_receptionist_student`, `save_receptionist_group`, `assign_receptionist_student_group`, `save_receptionist_teacher_operations`, `append_receptionist_enrollment_document`, and Premium operational adapters defined below. All are permission adapters to existing tables/triggers, not replacement engines. Names are proposed contracts, not existing functions. |
| `/api/storage/sign`, `/api/storage/finalize` | Keep session auth, caller-bound registry resolution and backend-only finalizer. New allowed asset purposes are enforced in SQL, not by trusting API body paths. |
| `/api/admin/invite`, `/api/admin/update-role`, `/api/admin/payroll` | Receptionist 403 unchanged, including forged metadata. No broad capability substitution that admits reception. |
| `/api/email/send` | Keep receptionist denied. Receipt email follows financial trigger/retry path, not this general-purpose relay. |
| `/api/internal/crm/*`, `/api/cron/crm-intake`, webhook/intake handlers | No behavior/credential/config change. Receptionist session is not director or a scheduler bearer. Public intake remains public under existing anti-abuse contract. |

New write RPCs: typed subject IDs and explicit field allowlists, authenticated receptionist check, current-row lock and expected updated_at for edits; server-owned IDs/timestamps where appropriate. Reject extra JSON keys rather than silently dropping malicious fields. Existing admin/director write paths remain; new receptionist RPCs do not become alternate admin APIs. Preserve audit triggers and return only operational results. For create retries accept a caller-generated UUID as record identity and reject an existing identity with different input (no new business entity or broad generic mutation dispatcher).

### Premium adapter contracts

These proposed receptionist-only RPCs wrap the current page's existing writes; no new workflow/state or teacher homework permission:

| Proposed RPC | Input / writable fields | Server-owned and protected |
| --- | --- | --- |
| `create_receptionist_premium_group` | Stable create UUID; name, teacher_id, weekday, start_time, academic_year, notes | duration_minutes=60, target_size=5, active=true; validate active teacher. No delete or arbitrary record field. |
| `save_receptionist_premium_membership` | Create UUID, premium_group_id, student_id for addition; membership UUID + expected_updated_at for ending | Derive start/end from current date and existing learner entitlement as current page does; active=true on create, false on ending; no subject rewrite. Keep unique active membership and entitlement checks. |
| `save_receptionist_premium_session` | Create UUID + premium_group_id + scheduled_date; existing UUID/expected_updated_at + either scheduled_date/start_time or existing allowed status | Teacher/time/duration from group on create; Scheduled initially, completed_at derived from status. Preserve legacy individual targets on edits, no target/teacher identity rewrite. Existing weekend/date/weekly uniqueness checks run. |
| `save_receptionist_premium_attendance` | premium_session_id, student_id, status; optional expected_updated_at for existing record | Actor from auth.uid(), current membership/entitlement and immutable identity; lock/upsert unique subject/session, no caller recorded_by, arbitrary notes or deletion. |

Do not widen `can_access_premium_group` to shortcut writing: add explicit receptionist SELECT policies on the four operational tables while keeping homework permissions and private/direct write denials. Gate homework queries and controls off before mounting `/premium-sessions` for receptionist.

# Database/RLS changes

Keep all base tables RLS-enabled. Every PUBLIC/anon/authenticated grant and every SECURITY DEFINER boundary is tested directly; client role strings do not enforce permissions. Existing CRM/financial/storage owner commands remain necessary for transactions, not a justification for new broad table access.

| Object family | Receptionist database target |
| --- | --- |
| profiles/pending_roles | Unchanged self-read/name-phone update and protected role commands; no user directory/role writes. |
| students/enrollments/groups | Existing operational SELECT retained; new writes only through narrow RPCs. No new receptionist base INSERT/UPDATE/DELETE policies. Existing non-receptionist policies unchanged. |
| receipts/charges | Add SELECT policies only. Replace 077's blanket deny with restrictive write-deny for receptionist plus explicit SELECT allow; preserve deleted/void visibility semantics. Financial mutations remain revoked from authenticated. |
| charge_balances | Reuse current security_invoker view; base-table SELECT must work. Do not make it owner-bypassing. |
| financial_requests/financial_events/payments | No new access. `payments` is legacy, not the current charge/receipt engine. Financial audit/revenue corrections remain director/internal. |
| attendance | Replace 077 deny with command-specific SELECT/INSERT/UPDATE allowance plus DELETE denial, preserving integrity triggers; no TRUNCATE privilege. |
| assessments/authorized_adults | SELECT only for operational dossier context, restrictive write denial; no grading or pickup-authorization edit in Batch 1. |
| premium_groups/premium_group_memberships/premium_sessions/premium_attendance | Operational SELECT only; narrow write RPCs for existing scheduling/membership/attendance. Preserve entitlement/identity guards and existing teacher/family policies. |
| teachers/payroll/leave_requests | Keep 043 restrictive HR policies and 077 deny. Teacher projections/authorized safe writes run behind checked RPCs; no base teacher access for receptionist. |
| app_config | Keep direct receptionist denial. No new configuration read/write in Batch 1; inspected receipt/group/attendance/timetable paths do not require it. Do not reuse generic Settings data loading for Mon compte. |
| storage_assets/storage_asset_bindings/storage.objects | No direct registry SELECT or broad object policies. Extend purpose-specific RPC predicates only. |
| Remaining tables, CRM raw submissions/attribution/integration/queue/revenue | No permission expansion. Avoid admin page loaders that depend on these tables. |

Replacing a 077 `FOR ALL` restrictive policy requires explicit per-command replacement; merely adding a permissive policy fails, and dropping the restriction wholesale can revive legacy family/self permissive rules. Retain receptionist TRUNCATE-block triggers, all grants revocations, soft-delete filters, payment triggers and CRM immutable-history guards. Do not grant ALL, ALL TABLES or schema-wide function execution. Where authenticated already has a table grant for other roles, RLS still denies receptionist direct writes.

# Teacher safe-data design

1. Keep [getTeacherDirectory](../../../src/lib/teacher-directory.js) / `get_teacher_directory(uuid)` for dropdowns and person labels; add receptionist eligibility without changing id/full_name/email output for existing parent/student/teacher consumers.
2. Add `get_teacher_operations` for director/admin/receptionist, **RETURNS TABLE** with exactly `id, full_name, email, telephone, certifications, niveaux_autorises, photo_url, updated_at`. Return only `deleted_at IS NULL`; support bounded client pagination as directory does. `photo_url` is only a registry reference, resolved separately after authorization. No `SETOF teachers`, row JSON, wildcard or PostgREST teacher relationship embedding.
3. `save_receptionist_teacher_operations` updates only `full_name, telephone, certifications, niveaux_autorises` with expected_updated_at; preserve constraints/normalization. `email`, photo changes, contract, notes, salaries, bank info, deletion and identity/timestamps reject. Email remains read-only because it participates in teacher identity. No teacher creation route for receptionist in this batch.
4. Teacher schedule/assignments come from groups/premium_groups/premium_sessions using teacher_id; no payroll/leave requests. Existing teacher profile currently lacks a schedule section: a link to filtered timetable/groups is sufficient for Batch 1. Do not invent a scheduling engine.
5. Branch the list/profile/form **before data fetch**. Receptionist must never call `entities.Teacher.*`, even when the UI hides compensation. Reuse admin/director UI only where query/field restrictions are enforced. Cache keys separate operational projection from full HR record; purge privileged cached data on logout/role change.
6. Forbidden fields include `contract_type, taux_horaire, salaire_mensuel, iban, notes`, all payroll rows and compensation/payment history. A harmless-looking field added later is excluded by default. Base-table SELECT, count/filter on salary, RPC extra select fields and relationship embedding must expose nothing or error.

# Finance operational boundary

Reuse [ReceiptForm](../../../src/components/receipts/ReceiptForm.jsx), `/receipts/new`, `/receipts`, print/PDF and student charge_balances. No separate payment engine. Existing price/discount validation and payment limits remain unchanged; existing agreements are immutable through the receptionist path.

- Update both financial authorization gates and candidate RPC, not just the UI. Keep original idempotency key/fingerprint, actor identity, advisory/row locks, receipt snapshots and explicit enrollment checks from 084. Inner function execution stays revoked.
- Nonzero receipt issuance marks its learner Enrolled and may confirm a compatible tuition enrollment. Other/legacy payments do not fabricate tuition enrollment; zero-payment charge creation issues no receipt and does not confirm. Exact retries cannot reenroll archived students or reapply effects. CRM conversion remains driven by linked Confirmed/Validated evidence, never by the capability helper.
- View actual payment/receipt history and current per-learner balances, including non-deleted voided receipt status when existing UI supports it; no director event/deletion log. Due dates and subsequent installments are current schedule support. Receipt PDFs never include internal notes.
- Receipt email is opt-in on creation; retry only eligible stored deliveries with original recipient and provider idempotency. Do not change Vault/email infrastructure or allow arbitrary sending. Local tests disable/stub external delivery.
- Existing learner email/parent_email updates through the payment form are not a bypass around the identity-edit denial. The receptionist may edit telephone, and supply contact fields for a genuinely new learner under current engine validation; existing identity fields remain unchanged. Hide/reject only the disallowed edits, not payment itself.
- Void, charge cancellation, mistaken deletion and “edit” routes all remain director-only. There is no direct editing of an issued financial snapshot. Retain `void_financial_receipt`, `void_financial_charge`, `delete_mistaken_receipt` and their guards. No owner decision is needed to **retain** this boundary.
- Do not widen modern management helper `require_finance_staff`; create a finance-operations check for payment/retry only. Explicitly block legacy summary/referral RPCs for receptionist. No marketing/revenue ledger access, no dashboard KPIs on receipt pages. Operations data inherently permits manual arithmetic; do not claim otherwise.

# Security invariants

- Five layers agree: capability-driven navigation → exact route guard → handler auth → RPC actor/action validation → grants/RLS/constraints/triggers. Any new action must fail safely if its lower-layer change is absent.
- No admin impersonation, caller-provided actor/role, service-role client in browser, permissive “staff” rewrite, schema-wide grant, SECURITY DEFINER without identity/role/field/subject validation, or policy bypass for a passing test.
- Dedicated receptionist and director-only CRM technical/reporting access remain. Role downgrade cannot retain an HR cache or mount a privileged fetch before a redirect.
- Student email/parent_email and teacher email participate in authorization. Ordinary phone editing does not authorize portal/teacher identity reassignment.
- Group session/level must agree with enrollments/students; reassign selected enrollment, never repurpose a paid/linked enrollment by changing session. Existing triggers must run. Group removal retains history/confirmed status as currently defined.
- Documents: allow active bound student_photo/enrollment_document and active teacher_photo reads only; writes limited to student_photo and appended enrollment_document. No teacher-photo editing, portfolio/homework, retired/staff_only/unbound assets, raw paths or registry enumeration. Latest 052 authorization and 054 homework behavior for other roles must survive.
- No changes to status/task/activity separation, call cadence, conversion, attribution, payment/revenue semantics or Meta lifecycle exclusions. No live provider enablement.

# Required tests

Use local Supabase and synthetic fixtures only; no production keys, data or real email. Update existing expectations only where this matrix deliberately changes behavior, and retain negative assertions rather than deleting old security suites. Every “denied” test checks zero persisted effect and no protected response fields, not just an invisible button.

| Layer | Positive cases | Negative / regression cases |
| --- | --- | --- |
| Pure capabilities/navigation | Table-driven map for six roles; all listed receptionist routes, UUID detail/edit/print, intended links/returnTo | Unknown/pending role/capability; prefix tricks, invalid UUID, nested delete/edit, encoded separators; no finance dashboard/marketing/HR/users/system links |
| Middleware + client guard | Real HTTP and JS navigation to students, groups/timetable/attendance/Premium, admissions/placement, receipt new/list/print, safe teacher profiles/edit, account | Direct denied routes, hash/query settings tabs, permissive allowedRoles override; protected children/loaders never mount; no HR network response cached |
| APIs | Storage sign/finalize for approved fixture purpose/subject | Invite/update-role/payroll/general email/internal CRM workers/director processing and cron without bearer return 401/403; forged user metadata role cannot help |
| RPCs | Student/group/teacher safe edits; pre-enrollment and group assignment; attendance; financial create/payment/candidates/retry; safe teacher projection | Unknown keys, stale versions, archived targets, identity/HR fields; direct inner-financial call, manual confirmation, void/cancel/delete, modern **and legacy** analytics/referral, mapping/policy/config/Insights/revenue commands |
| RLS/grants | Authorized row reads and unchanged family/teacher scoped reads; security-invoker balances | Direct student/enrollment/group writes remain denied to receptionist; direct financial/teacher/payroll/registry writes/read probes; DELETE/TRUNCATE; unclassified/foreign-purpose files; extra columns/filter/embedding against teacher projection |
| Finance atomicity | Zero charge, new learner payment, existing balance/installment, explicit CRM tuition enrollment, eligible email retry | Negative/overpayment, changed-input retry, ambiguous/mismatched enrollment, concurrent duplicate payment, archived replay, unapproved contact-identity change; no duplicate receipt/conversion/revenue event |
| Academic integrity | Assign/reassign/remove with explicit enrollment; Confirmed without group; standard/Premium attendance and valid member scheduling | Wrong session/level, ambiguous assignment, invalid entitlement/dates, duplicate attendance/identity mutation, teacher outside assigned groups; preserve historical attendance |
| Role regressions | Director privileged corrections/integrations; admin normal school finance/HR; teacher own groups/attendance/assessment; parent multi-child and student self portal | Admin cannot grant privileged roles/see CRM director analytics; teacher/family cannot use new school-wide RPCs or HR data; no family enrollment confirmation, cross-child leak or direct payroll writes |

Extend `scripts/test-receptionist-security.sql`, `scripts/test-receptionist-browser.mjs`, `scripts/test-navigation.mjs`, `scripts/test-navigation-components.mjs`, `scripts/test-middleware-security.mjs`; add dedicated Batch 1 fixtures if clearer. Run existing receipt-charge/payments, concurrency, paid-enrollment, enrollment-workflow, student-placement, Premium shared-workshop/RLS, storage enforcement and relevant CRM 083–085 regressions. Test new capabilities under stored-role changes, not fabricated client role.

Run `npm test`, `npm run test:navigation`, `npm run test:middleware`, `npm run lint`, `npm run build`, relevant local SQL/browser suites and `git diff --check`. Prove clean 001–096 replay and synthetic 095→096 upgrade without altering old migrations. Review function ACLs, restrictive policies, triggers and view options after upgrade. CI app/local-database and Vercel preview checks must pass before review; a browser-only pass is insufficient.

# Expected files/modules

| Area | Implementation surface |
| --- | --- |
| Shared capabilities | `src/lib/roleAccess.mjs`; `src/lib/navigation.mjs` only if returnTo route support requires it |
| Guards/navigation | `src/middleware.js`, `src/components/ProtectedRoute.jsx`, `src/components/layout/Sidebar.jsx`, capability-aware PersonLink/ContextLink/action consumers |
| Student/admissions | `src/components/students/{ReceptionistOperations,StudentForm,EnrollmentModal}.jsx`; existing students/list/directory/detail/new/edit and enrollments pages; narrow RPC client helper if useful |
| Academics | groups/list/detail, timetable, attendance, premium-sessions, assessments pages and `src/lib/academicPrograms.js` consumers; no new catalogue/business rules |
| Finance | existing receipts/new/list/print pages and `src/components/receipts/ReceiptForm.jsx`, student balance section; do not open correction routes |
| Teacher | `src/lib/teacher-directory.js`, existing teachers/list/detail/edit and TeacherForm; small operational projection/form component as needed, HR queries remain isolated |
| Storage | Existing `src/lib/storage-server.js` handlers should remain structurally unchanged; adapt purpose-specific callers |
| SQL | One forward migration 096 covering the object manifest below, preserving latest definitions |
| Tests/docs | Suites above; update CURRENT_STATE/SECURITY_RULES/WORKFLOWS/ADR implementation status only once implementation evidence warrants it, with deployment separate |

# Migration 096 requirements

Proposed name: `096_receptionist_operational_permissions.sql` under the repository's existing numbering convention. **Do not write it in this design task.** If 096 is occupied when Sol starts, reconcile the branch and use the next reviewed forward number; never overwrite deployed 095 or another author's migration.

The migration must be a transaction with explicit ACLs and schema reload. No configuration, secrets, cron/provider changes, role reassignment, data backfill or seed data. New schema contains helpers only, no parallel business tables.

1. **Private capability helpers:** create operational_security, revoke PUBLIC/anon/authenticated/service_role schema/function access; fixed `pg_catalog, pg_temp` search_path, qualified relations and stored-actor checks in every public definer entry. Add finance-operations guard distinct from management helper. RPC signatures/grants are explicit; never grant EXECUTE ON ALL FUNCTIONS to authenticated.
2. **Teacher read/write:** replace 043 directory body only to admit receptionist; add fixed `get_teacher_operations(uuid)` projection and `save_receptionist_teacher_operations(uuid, timestamptz, jsonb)` with exactly the four editable fields above. No teacher-table RLS/grant expansion. Safe photo read goes through Storage.
3. **Dossier write:** add `save_receptionist_student(uuid, timestamptz, jsonb)`. Create fields: full_name/date_naissance/telephone/email/parent_email/age_category/notes/session_type/niveau_cefr/referral_source/photo_url; status is server-owned Enrolled, plan defaults Standard. Updates limited to nonidentity contact/dossier fields (full_name/date_naissance/telephone/age_category/notes/photo_url); no status/plan/Premium dates/referral rewrite, email/parent_email, group or enrollment linkage. Route session/level/group edits through the existing enrollment path below. Validate current catalogue and registry, return id/updated_at only. Never accept a full Student row spread.
4. **Group write:** add `save_receptionist_group(uuid, timestamptz, jsonb)` for name/langue/session_type/niveau/teacher_id/salle/jours/horaire/capacite_max/terme/annee/categorie, preserving existing constraints. Active teacher lookup stays inside owner code. For a group with memberships, deny incompatible session/level change instead of recasting linked enrollment intent; use explicit learner reassignment. No delete.
5. **Assignments:** add `assign_receptionist_student_group` taking explicit student, enrollment (when present), target group or removal, and expected record versions. For existing enrollment, validate ownership/session/level and delegate assignment to `save_receptionist_enrollment`; for removal, validate and call existing INVOKER `remove_student_group` inside checked owner transaction only when its affected enrollment set is unambiguous. That function removes all matching Validated/Trial memberships for the student/group; reject multiple matches rather than silently removing more than the selected enrollment. For dossier-only students, use the existing 074 student-group synchronization path after explicit compatibility validation; do not invent a tuition enrollment. Ambiguity requires selecting an enrollment. Preserve existing trigger and CRM locks; no status/identity bypass. Admissions retain 077's narrow command. Add trailing optional `p_session text` and `p_school_year text` parameters (defaults NULL) using the existing session catalogue/year-format rules; remove the old public overload in the same transaction to prevent PostgREST ambiguity and grant only the intended new signature. Old named calls keep working through defaults. New pre-enrollment may select a supported additional session/year; an existing enrollment's known session/year is immutable for receptionist, and assignment must agree with it. Do not copy arbitrary StudentForm status/session updates into enrollment. Preserve 084 enrollment identity/payment safeguards and all 070–074 triggers.
6. **Storage:** extend latest 052 can_write/can_insert_reserved_object/resolve_storage_asset with receptionist-only allowed purposes and active-subject constraints; preserve registry ownership/version/expiry and all other-role branches. Add `append_receptionist_enrollment_document(enrollment, expected_updated_at, asset)` to append a validated uploaded document; existing documents/subject stay unchanged, bind_record runs. Do not add arbitrary enrollment UPDATE or storage object read/update/delete grants. Keep app_config denial unchanged.
7. **Finance:** replace latest 084 wrapper, renamed 057 inner financial body, candidate RPC and 055 retry gate only as described. Keep inner ACL revoked and existing management/void/delete guards. Add explicit receptionist denial to 034/039 legacy aggregate/list functions without broadening other-role visibility. Reject receptionist export-mode calls to latest 075 search_students_page while retaining its bounded operational search. Add receipt/charge SELECT-only RLS by replacing selected 077 restrictions; keep security_invoker balance view and financial mutation grants unchanged.
8. **Academic reads/writes:** attendance SELECT/INSERT/UPDATE policies plus latest 064 trigger gate, DELETE deny; assessments and authorized_adults SELECT-only. Premium operational tables SELECT-only. Add bounded receptionist adapters for existing Premium group create, membership create/end, session schedule/reschedule/status, attendance save: accept only fields used by current page for the chosen action, no arbitrary table/column names or deletes. Preserve all 051–054 constraints, entitlement/membership/attendance triggers, actor checks, and uniqueness. Parent/teacher homework remains separate and denied to receptionist; filter its page load/control path rather than expanding access.
9. **Exact ACL closure:** grant new public RPC EXECUTE to authenticated only, each checking actor/action; revoke default PUBLIC/anon/service_role access unless a demonstrated existing backend path requires it. No broader authenticated base writes for receptionist. Retain all untouched 077 deny policies and TRUNCATE triggers. SQL tests assert direct-table denial and private helper/inner-finance denial after every new RPC grant.

The manifest is an authorization adaptation of existing workflows. If implementation discovers an additional dependency, add its precise safe projection/permission and tests to this plan before widening access; never solve a loader failure with blanket grants. Do not use a string-replacement migration to patch function bodies invisibly: define the reviewed latest body with a minimal, auditable permission diff.

# Acceptance criteria

- Receptionist remains a dedicated stored role and completes every ALLOW action through the intended UI and authenticated data path; denied actions fail when invoked directly.
- Safe teacher responses contain only listed fields. HR fields cannot be fetched, filtered, joined or mutated through any newly reachable interface.
- Finance operations work without finance analytics, director correction powers or general email privilege. Both payment gates and email retry use operations authorization; legacy analytics cannot exploit newly readable rows.
- Academic/group and payment/conversion history invariants survive success, rejection, concurrency and retry. No implicit expansion of student/teacher identity edits.
- Sidebar, route guards, handlers, RPCs and RLS all match; no inaccessible child link, premature privileged fetch or stale HR cache.
- Director/admin/teacher/parent/student regressions pass. Old production migrations unchanged; no production mutation during implementation/testing. Current-state docs accurately say implemented-on-branch versus deployed.
- Implementation PR contains code, forward migration, meaningful tests and matching docs; it is not marked ready with only visual checks or a disabled failing security assertion.

# Production rollout

This plan grants **no production approval**. Sol implements and tests locally on this same branch, then opens a reviewable PR only when authorized by the implementation task. The design task stops at a local architecture commit, no PR/deploy.

For a later explicitly approved release: verify exact migration ledger and reviewed commit, confirm backups/recovery owner, rehearse upgrade and old-app compatibility locally, then coordinate reviewed 096 application and application deployment. A migration-first window grants the new SQL actions to existing receptionists before UI appears; explicitly approve that window or use a controlled access window. Main merge/deployment is a separate authorized step; this plan does not claim which post-PR-30 application build is currently deployed. No provider/Vault/cron changes are required.

Keep 096 immutable once deployed. Before commit failure, its transaction rolls back; after successful deployment, revoke expanded receptionist actions with a reviewed **forward** migration if needed. Old UI rollback does not revoke database capabilities. Preserve valid payments/documents/history written under the new permissions; never delete them as rollback. Restore previous grant/policy behavior with an explicit diff, not a whole-database reset.

# Implementation order

1. Re-read context/plan; verify latest branch, migration slot and local-only environment. Inventory current function definitions/ACLs and capture denial/regression fixtures.
2. Implement capability and exact route policy with tests; keep new UI paths unavailable until corresponding data paths work. Do not change existing role scopes globally.
3. Implement 096's narrow helpers/projections/RPC/RLS adaptations with positive/negative SQL and atomicity tests; run fresh and upgrade rehearsals.
4. Adapt student/admissions/group/academic loaders and forms, preserving commands; separate safe teacher and finance operations from existing HR/analytics components before fetching.
5. Connect navigation and existing routes/actions, Storage purpose checks and account-only settings; avoid dashboard/CRM/walk-in redesign.
6. Run all required layers, review ACL/field/network output, update implementation status docs with evidence, stage explicit files and prepare the implementation review. Do not deploy or mutate production automatically.

## SOL IMPLEMENTATION CONTRACT

- Continue `astra/receptionist-batch1-permissions`; implement only permissions/navigation and security adapters specified here.
- Centralize application capability/route decisions in roleAccess.mjs; enforce the same actor/action boundary independently in SQL and existing APIs.
- Create reviewed forward 096 locally; no old migration edits, admin impersonation, broad grants or production access.
- Use safe teacher projections, original enrollment/payment engines and limited Storage purposes. Keep all destructive finance, HR, analytics, integration/user/system and identity-change actions denied.
- Pass the complete positive/negative and other-role matrix; update existing tests rather than skipping them. Include upgrade, direct RPC/RLS, browser/middleware and concurrency evidence.
- Mark implementation versus deployment honestly. Leave Today/CRM detail/center visits/walk-in/product changes for later batches. Escalate only a real conflict requiring new product permission; retain denials for optional high-risk expansion.

## Implementation result on review branch

The implementation on `astra/receptionist-batch1-permissions` uses forward migration [096](../../../supabase/migrations/096_receptionist_operational_permissions.sql), the exact route/capability map, narrow student/group/teacher/Premium commands, the existing enrollment and financial engines, and restricted Storage purposes. No approved product boundary was widened. Today, CRM detail, center visits and dedicated walk-in presentation remain later work. This section records branch evidence; 096 has **not** been applied to Production and the PR has not been merged.

Independent review of PR #31 found two integrity gaps in the unreleased 096. The group edit command now refuses a session/level change while **any** enrollment references the group, including Submitted and Under Review, before considering dossier membership. New enrollment creation uses the same `operational_security.valid_session_level` catalogue as dossier and group commands: an incompatible inherited dossier level is left unset for a newly selected session, while an explicitly incompatible level is rejected. The receptionist group picker requires a matching known dossier or enrollment level before offering direct assignment; the assignment RPC retains its existing check. Rollback-only SQL proves rejected operations persist no changes, valid programme changes/inheritance still work, and direct INSERT/UPDATE/DELETE remain denied on newly readable finance, assessment, pickup and Premium tables. The synthetic browser check covers the unset-level picker state. These are review-branch corrections, not deployment evidence.

Local verification includes a clean 001–096 replay and a 095→096 upgrade, positive/negative [Batch 1 SQL permissions](../../../scripts/test-receptionist-batch1.sql), existing receptionist/receipt/enrollment/placement/Premium/CRM SQL suites, payment concurrency, real receptionist browser and middleware/navigation checks, `npm test`, lint and build. [Receptionist Storage API checks](../../../scripts/test-receptionist-storage.mjs) cover approved photo/document reserve, upload, finalize, bind and sign, plus denied purposes and direct reads. The local Storage container currently expects a nonpartial `(bucket_id,name)` unique index absent after a 095 local reset; the dedicated local test creates and removes that compatibility index only for its fixture. Migration 096 does not modify Storage's object indexes or production configuration.
