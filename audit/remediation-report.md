# English Hills Admin remediation handoff

**17 September 2026 · `codex/receipt-school-year-workflow` · base HEAD `16dec24f9c2cba2f80775c04cd9bdd65123db579`**. All work remains uncommitted for independent review. Existing work was preserved. No push, merge, deployment, production access, linked database push, or real email occurred. All accounts and data used below were synthetic and local to Supabase; held browser fixtures were removed.

Final local cleanup query returned **0** `large-audit-%` students and **0** accounts from the held Batch 3A browser run.

## Independent review findings and resolution

| Finding | Change | Evidence |
| --- | --- | --- |
| Migration 059 rejected a teacher's own parent/student when `profiles.linked_teacher_id` was null, although normal identity resolved by email. | New migration [069_teacher_message_identity.sql](../supabase/migrations/069_teacher_message_identity.sql) calls `get_my_teacher_id()` and retains relationship checks. No applied migration was rewritten. | Batch 3A tests null-link teacher → own parent and student by RPC and message insert, plus unrelated parent/student denials on both paths. Rollback-only SQL repeats the boundary. |
| Changing attendance group/date could retain old statuses; late load or save refresh could overwrite a newer selection. | [attendanceSession.mjs](../src/lib/attendanceSession.mjs) binds draft, loading, save and refresh results to a group/date key. Admin and teacher views clear old data on selection, disable save until successful load, and ignore stale responses. | `npm test` covers slow and failed requests, retry, rapid switching, and switching during save. Browser checks observed cleared draft during admin group and teacher date loading. Batch 3A sent six simultaneous attendance saves; one row remained. |
| The local production build could not sign into local Supabase. | [next.config.mjs](../next.config.mjs) permits loopback connect targets and avoids HTTPS upgrade only when the build's configured Supabase URL is loopback. Cloud configured builds retain the deployed CSP. | Rebuilt Next 15.5.25; signed into the local production build with a synthetic admin account and opened Premium and student details. Before this fix the browser showed `Failed to fetch`; local Auth health was HTTP 200. |
| The standalone middleware security harness used a stale teacher route list, a build pointed at another Auth URL, and removed React UMD files. | [test-middleware-security.mjs](../scripts/test-middleware-security.mjs) now builds with mock-only credentials, includes teacher `/premium-sessions`, and bundles the real `ProtectedRoute` with React 19 and fixture navigation/auth hooks in Chromium. It retains HTTP route, refresh, callback, API denial and protected-child assertions. | `npm run test:middleware`: **830 checks passed**, including all 38 protected route patterns and denied children never rendering, mounting effects or starting queries. |
| Student-list filters and inline controls were unnamed; long names did not wrap on mobile. | [students/page.jsx](../src/app/%28admin%29/students/page.jsx) gives filters and per-row controls names and focus rings, and wraps long names. | Browser accessibility tree identified all seven filters and inline controls. At 390 px, keyboard Tab focused “Filtrer par statut” visibly; long synthetic names wrapped and the document had no horizontal overflow. |
| The older student directory could remain on “Chargement…” after a failed fetch and used unnamed filters and a hardcoded button gradient. | [students-directory/page.jsx](../src/app/%28admin%29/students-directory/page.jsx) adds an error/retry state, named filters, and the shared primary button token. | Code path reviewed; lint and production build checked. Failure injection in the browser remains unverified. |

## Original audit scope and current disposition

**Passed** means the stated local checks passed, not that a production release has been approved. **Unverified** means a required assertion has no complete evidence. **Failed** identifies a reproduced defect or failing check. **Excluded** reflects the user's current scope decision.

| # / audit item | Status | Changed files and exact evidence / open point |
| --- | --- | --- |
| 1. Email authorization and rate limiting | **Passed locally; provider unverified** | Migrations 058/059/066/069 and API guards in `src/app/api/email/send/route.js`; Batch 3A relationship and negative role tests; Batch 4A API checks. Real provider delivery and HTTP load at rate-limit scale remain unverified. |
| 2. Dependency security | **Passed locally** | Next 15.5.25, React 19.2.3, PostCSS 8.5.28. `npm audit --json`: zero advisories across 860 packages after adding Playwright/esbuild; build, login and route checks passed. |
| 3. Payroll calculation correctness | **Explicitly excluded: unused payroll** | No tax, deduction, freelancer, historical amount, or accountant approval claim is made. Existing server/API role gates, duplicate-period constraints, and migration 065's direct amount-write guard remain. Batch 3A exercised payroll API denials. This exclusion is not a payroll accuracy pass. |
| 4. Child pickup | **Passed locally; operational corrections unverified** | Migrations 060/068, dismissal UI/API, rollback SQL and Batch 3A. Four concurrent confirmations yielded one pickup; authorized-adult and Casablanca-day rules held. Human correction procedure is not verified. |
| 5. Attendance and academic permissions | **Passed locally; legacy inventory unverified** | Migrations 063/064/069/071, attendance controller, teacher portal, academic pages. SQL checks group/teacher/Trial/Validated relationships and mismatched-assessment denial; Batch 3A concurrency; browser selection checks. Existing conflicting production rows were not inspected. |
| 6. Lists, search, exports, reporting | **Passed at 1,205 synthetic rows; larger scale unverified** | Migration 067, `src/lib/paginateAll.mjs`, entities/queries and operational page/report/export changes. The [large-data fixture](../scripts/test-large-data-local.mjs) verified 1,205 unique student export rows and three complete report-source pages. Browser report showed 1,205 active students, students list 61 pages and no mobile overflow. Some reports still perform broad client joins; concurrent-edit snapshot consistency and substantially larger volumes are unverified. |
| 7. Privacy and telemetry | **Passed locally; legal/operations unverified** | Sentry scrubber, CSV neutralization, registration consent evidence and privacy page. `npm test` includes synthetic token/PII/CSV regressions. Legal notice approval, retention and rights operations need separate review. |
| 8. Enrollment and registration | **Passed locally; existing-data inventory unverified** | Migrations 062/066/070/071, enrollment UI/API. Rollback SQL checks atomic enrollment/student changes and rollback, invalid active enrollment without group, and student reassignment denial. Batch 4A covers public API negatives. Anti-abuse load and existing conflicts beyond local fixtures are unverified. |
| 9. Authentication and caching | **Passed for tested local paths; full invite delivery unverified** | Profile recovery migration 061, auth context, middleware/route changes. Batch 3A 190 checks include pending/expired queue, activation, invite/magic-link API and role boundaries. Browser tested password login, logout, admin→teacher→parent→student switching, denied `/reports` redirects, expired synthetic session redirect to login, and invalid invite token error. The repaired middleware/React harness passed 830 checks. Email-delivered invite activation was not exercised. |
| 10. Integration and files | **Passed with local mocks; provider unverified** | Storage/API and receipt delivery code; Batch 4A 182 checks cover denial, failure and receipt persistence-unknown state. Real provider webhooks, cloud bucket settings, actual delivery and production asset inventory were not accessed. |
| 11. Unified design and accessibility | **Passed for sampled pages; exhaustive WCAG unverified** | English Hills blue/neutral tokens across Premium, [AcademicOperationsReport.jsx](../src/components/reports/AcademicOperationsReport.jsx), receipts, student detail, student/teacher forms and older admin pages including the student directory. Black/gold academic panel was replaced; amber remains for warnings or a restrained Premium badge. Desktop/mobile screenshots below. Keyboard menu focus trap, Escape/return focus, named student filters and visible focus were checked. Full WCAG AA and screen-reader audit across every page is unverified. |
| 12. Performance and operational completeness | **Partially passed; scale and deployed operations unverified** | Silent row caps removed; report student joins use keyed `Map`/`Set`; Premium timetable, maintained school-year choices, explicit load failures and finance/receipt protections are in the changed code. The 1,205-row run passes. Large browser-side joins, cross-page database snapshots and deployed reconciliation remain limitations. |
| 13. Tests, documentation, release readiness | **Passed locally; PR/deployment checks unverified** | README, this report, local synthetic scripts and `.github/workflows/verify.yml`. Local lint/build/audit/SQL/role/large-data and 830-check middleware/React harness below. CI now installs Chromium and runs the same harness. GitHub has not run the workflow on a PR. Backup/restore, monitoring, staged rollout and production settings require deployment access and were not checked. |

Migrations **058–071** were applied to **local** Supabase only. Migration 070's first fixture revealed recursion in inherited teacher/student RLS; new migration 071 added scoped relationship helpers. The final rollback-only SQL fixture passed. Already-applied migration files were not changed.

## Role and boundary evidence

| Actor | Local evidence |
| --- | --- |
| Anonymous / pending | Public validation and denied protected API/message paths in Batches 3A/4A; invalid invite token browser error. |
| Student / parent | Own portal loaded; payments showed the synthetic account's scope; direct `/reports` navigation redirected to the appropriate portal. Parent/student → authorized teacher messaging remained allowed. |
| Teacher | Own portal and attendance loaded; own parent/student message accepted even with null linked teacher ID; unrelated recipients denied. Direct `/reports` redirected to teacher portal. |
| Admin / director | Synthetic admin password login, reports, students, Premium and details loaded. Batch 3A covers admin/director API gates and denied lower-role bypass; SQL checks database boundaries. |
| Session change | Logout/account switching cleared prior role view; a deleted synthetic account's session redirected `/reports` to `/login?returnTo=%2Freports`. |

## Exact local checks and results

| Command or check | Result |
| --- | --- |
| `SUPABASE_TELEMETRY_DISABLED=1 XDG_CONFIG_HOME=/private/tmp/hills-xdg supabase migration up --local` | Ledger through 071, local only. |
| `docker exec -i supabase_db_hills-admin-next psql -U postgres -d postgres -q -v ON_ERROR_STOP=1 < scripts/test-audit-remediation.sql` | Pass, exit 0; rollback-only 1,005-row pagination, teacher messaging, enrollment, academic and security fixture. |
| `DISABLE_EXTERNAL_EMAIL=true node scripts/test-batch3a-security.mjs --app` | Pass, **190 checks**; synthetic users/rows removed. Also ran `--app --ui` for browser roles, then cleaned fixtures. |
| `DISABLE_EXTERNAL_EMAIL=true node scripts/test-batch4a-security.mjs` | Pass, **182 checks**; local Storage/API/registration, synthetic assets removed. |
| `node scripts/test-large-data-local.mjs` | Pass: **1,205** matching export rows, 1,205 unique IDs, **3** complete report-source pages; fixture cleanup. `--ui` was used for browser screenshots, then cleaned. |
| `npm test` | Pass: attendance race/failure/retry, pagination incomplete-response protection, telemetry/CSV and receipt client/email regressions. |
| `npm run lint` | Pass with one existing Sidebar `<img>` optimization warning. |
| `DISABLE_EXTERNAL_EMAIL=true NEXT_PUBLIC_SENTRY_DSN= SENTRY_DSN= SENTRY_AUTH_TOKEN= npm run build` | Pass, Next **15.5.25**, after loopback CSP fix. |
| `NODE_ENV=production NEXT_PUBLIC_SUPABASE_URL=... node --input-type=module` CSP header checks | Pass for both configured targets: cloud build excludes loopback and upgrades insecure requests; local build permits local Supabase and does not upgrade it. The synthetic admin signed into that local production build. |
| `npm audit --json` | Zero advisories, 860 dependencies. |
| `git diff --check` | Pass. |
| `DISABLE_EXTERNAL_EMAIL=true node scripts/test-batch2-security.mjs` | **Unverified:** precondition rejects the local database containing two directors; no director was removed to force it. |
| `npm run test:middleware` | **Pass, 830 checks**: mock-Auth production build, 38 route matchers, refreshed cookies, full HTTP role/route and RSC/prefetch matrix, API 401/403 gates, expired-session renewal, callback, and real React DOM protected-child suppression. No local database required. The normal local build was restored afterward. |
| GitHub Actions `.github/workflows/verify.yml` | **Unverified remotely:** no PR or push was made. |

The browser tests were manual local checks, not automated accessibility certification. At 390 px, Premium, student details, reports, students, registration and the mobile menu had no document overflow. The menu focus sequence and Escape/return focus were observed. The public registration page's visible inputs were named; its hidden honeypot/Turnstile fields are not interactive user controls. The students page showed named filters and a visible keyboard focus ring. Loading and session-switch behavior was observed in admin and teacher attendance; race cases have automated controller tests. A browser CSV export action produced no error, while completeness was verified at the export RPC boundary; downloaded CSV bytes were not independently inspected in the browser.

### Open checks by cause

- **Known local test failure:** none remains in the middleware harness; its original fake-origin/React setup failure is resolved. The directory load-failure browser injection is still unverified.
- **Engineering limits, not deployment access:** some reports/directory views still materialize full datasets in the browser; 1,205 rows passed, but higher-volume performance and concurrent-edit snapshot behavior are unverified. Directory load-failure retry was code reviewed and built, but not browser failure-injected. Full cross-page WCAG/keyboard review is unverified.
- **Deployment/external access required:** GitHub PR CI result, email and webhook delivery, cloud bucket configuration, production data conflict inventory, nonproduction backup/restore rehearsal, monitoring and rollout checks. None was inferred from local mocks.
- **Business scope:** payroll calculation accuracy is excluded because payroll is unused. Existing payroll write and role protections were retained.

## Updated visual evidence

All files show synthetic local data. The report screenshots contain the 1,205-row fixture and the new blue academic panel.

- [Reports desktop](screenshots/reports-desktop.png), [reports mobile](screenshots/reports-mobile.png), [students large desktop](screenshots/students-large-desktop.png), [students large mobile with named controls](screenshots/students-large-mobile-labeled.png).
- [Premium desktop](screenshots/premium-desktop.png), [Premium mobile](screenshots/premium-mobile.png), [student detail desktop](screenshots/student-detail-desktop.png), [student detail mobile](screenshots/student-detail-mobile.png).
- [Attendance desktop](screenshots/attendance-desktop.png), [attendance mobile](screenshots/attendance-mobile.png), [teacher attendance desktop](screenshots/teacher-attendance-desktop.png), [teacher attendance mobile](screenshots/teacher-attendance-mobile.png).
- [Receipts desktop](screenshots/receipts-desktop.png), [receipts mobile](screenshots/receipts-mobile.png), [enrollment dialog desktop](screenshots/enrollment-dialog-desktop.png), [enrollment dialog mobile](screenshots/enrollment-dialog-mobile.png).
- [Registration desktop](screenshots/registration-desktop.png), [registration mobile](screenshots/registration-mobile.png), [login desktop](screenshots/login-desktop.png), [login mobile](screenshots/login-mobile.png), [parent portal](screenshots/parent-portal-desktop.png), [student portal](screenshots/student-portal-desktop.png).

## PR CI and independent review

Open a PR from this feature branch to trigger [Verify](../.github/workflows/verify.yml). The **app** job runs `npm ci`, `npm test` (receipt regressions included), lint, build, `npm audit --audit-level=moderate`, `npx playwright install --with-deps chromium`, and `npm run test:middleware`. The harness rebuilds against its loopback mock Auth URL with dummy keys. The PR-only **local-database** job starts local Supabase, derives its three credentials from `supabase status`, runs rollback-only SQL, starts the app with external email disabled, and runs Batch 3A, Batch 4A and the 1,205-row fixture. Review both job logs; this workflow has not run on GitHub yet. Local reproduction commands are in [README.md](../README.md).

Final reviewer checklist:

- [ ] Review migrations 069–071, teacher relationship scope, enrollment triggers and security-definer functions against a separate synthetic local database.
- [ ] Repeat attendance slow/failing/switch-during-save cases and browser group/date switching; confirm each write uses the selected session key.
- [ ] Inspect the 1,205-row report/list screenshots and export output; test larger and concurrent-edit datasets if operational volume requires it.
- [ ] Run PR CI and inspect the middleware harness log plus the remaining form/role accessibility surfaces.
- [ ] Before any approved deployment, verify backup/restore in nonproduction, cloud settings and migration locks, monitoring, rollback and data reconciliation. These require deployment access and remain **unverified**.

**Review status:** engineering changes are ready for independent review, with explicitly unverified checks visible above. Payroll calculation correctness is **excluded**, while its existing security protections remain. No release or deployment approval is implied.
