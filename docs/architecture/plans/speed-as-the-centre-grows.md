# Speed as the centre grows (Batch G) — architecture, revision SCG-r1

**Status: APPROVED FOR IMPLEMENTATION — revision SCG-r1 at exact head `649056f`, approved by the owner on 2026-10-28 13:07 Asia/Shanghai with D1 = A, D2 = A, D3 = B, D4 = A ([approval record](#approval-record)). Not implemented, merged or released.** Tier 3 (RLS on every public table, a finance read model, the middleware authorization gate). Baseline: `origin/main` `0bd2d27e75c192a298a62c6d48316e73cd1797ef`, migration ledger 001–123 (the Production ledger recorded in [CURRENT_STATE](../../ai/CURRENT_STATE.md)).

**Scope.** Audit 2026-10-24 findings REL-2, REL-3, REL-6, REL-8 and REL-9. REL-7 was fixed by Batch E. The audit text is not in this repository; each finding is restated below from the batch brief and checked against the code.

**Supersedes** the RLS design in open PR #124 (`performance-rls-initplan-115.md`, branch `architecture/performance-rls-initplan-114`). That design was written at ledger 112, before Batches D, E and F. Its evidence method is reused here, but its policy inventory and its main finding are stale (see [What changed since PR #124](#what-changed-since-pr-124)). **PR #124 is closed as superseded only after the owner approves this plan.**

**Owner decisions already taken** (Maroine, 2026-10-28 about 12:35 Asia/Shanghai, in chat, accepting the coordinating session's recommendation):

- **D1 = A:** wrap the role helpers so they are evaluated once per query, **and** guard the expensive teacher check so it runs only for teachers.
- **D2 = A:** apply the pattern to all public policies.
- Who can see or change which rows must not change.

New questions raised by this plan are in [Owner decisions required](#owner-decisions-required); D3 and D4 were answered at approval.

# Owner summary

## What will change

1. **Students list (REL-2).** The list stops doing work for every learner and every charge just to show 20 rows. Two changes:
   - The database checks "who is asking" once per request instead of once per row, on every table.
   - The payment status is computed only for the learners being shown, or, when a payment filter is used, only for the learners matching the other filters.

   Measured on a synthetic copy at 5× today's size, the slowest list view drops from about 106 ms to about 22 ms. The ordinary first page drops from 58–97 ms to 4–6 ms. Both are measured as p95 on the database.
2. **Activity log (REL-3).** The page today downloads the whole log, including every before/after snapshot, 500 rows at a time. It will load 50 entries at a time, newest first, with every filter applied by the database. The before/after detail loads only when a row is opened.
   - At 30,000 entries, today's load takes about 5.3 s on the database and moves about 30 MB.
   - At 150,000 entries, it takes about 129 s.
   - One page of the new list takes 2–14 ms.
3. **Reports, group page and teacher portal (REL-3).**
   - Reports ask the database for small totals instead of downloading the whole attendance, receipts, payroll and students tables.
   - The group page reads only that group's learners.
   - The teacher portal reads only that teacher's groups and grades.
   - Lists that still need every row are read by position (keyset), so a new row saved by someone else no longer makes the read fail with "Dataset changed during pagination".
4. **Fresh screens after saving (REL-8).** After every payment, correction, deletion, receptionist save, enrollment decision or attendance save, the lists and totals that depend on it are refreshed. Today several stay up to 5 minutes out of date.
5. **Connection problems are not "account pending" (REL-9).**
   - If the database cannot be reached while a page is opening, staff see "Connexion impossible, nouvel essai…" with a retry button.
   - Today they see "Compte en attente d'activation", which is false and alarming.
   - The teacher portal shows the same retry state when its data fails to load, instead of an empty portal.
6. **Report dates in Casablanca time (REL-6).** The attendance chart's days are Casablanca calendar days, computed by the database using the time-zone name. Today they shift by one day for part of the night.

## What staff/users will be able to do

The same things as today, faster and with screens that stay current. The activity log gains real date filters and loads more on demand.

## What remains restricted

Everything. No role gains or loses access to any row, column, page or action:

- Every policy keeps its name, table, command, roles and PERMISSIVE or RESTRICTIVE kind. Each rewritten expression gives the same answer for every caller.
- Every new database function runs with the caller's own rights (SECURITY INVOKER). It sees exactly what the caller can already read today.
- The receptionist still cannot export the students list, and the activity log stays director/admin only.

## UI impact

- The activity log becomes a paged list with "Charger plus" and date filters, and before/after detail loads on expand.
- A French connection-problem screen (503) appears instead of the pending page on a database or network error.
- The teacher portal and the group page show a retry state on load errors.
- Everything else looks the same.

## Database impact

One forward migration, `XXX_speed_as_the_centre_grows.sql`, numbered at merge. It contains:

- `ALTER POLICY` for 157 of the 163 public policies, with expressions only;
- `search_students_page`, re-created with the same signature and output;
- one index on `activity_log (created_at desc, id)`;
- six new read-only functions.

It changes no data, table, column, grant on existing objects, trigger or schedule.

## Important security decisions

- **The rewrite is mechanical.** A generator produces the policy SQL from the live catalog, and the only changes are:
  - `f()` → `(SELECT f() AS f)`;
  - a `(SELECT get_my_role()) = 'teacher' AND …` prefix on the 13 teacher-only policies.
- **Equivalence is proven, not argued.** A before/after test compares, for ten identities (anon included), what every public RLS table returns and what every write is allowed to do. It also runs every existing security suite unchanged.
- **New functions are SECURITY INVOKER.** No new privilege path exists, and RLS is the only authority.
- **The middleware never fails open.** An error grants nothing: no page renders, and the response is a 503 retry page.

## Risks / owner review points

- **Broad change:** 157 policies on 41 tables change at once. Mitigations:
  - mechanical generation;
  - the equivalence test;
  - a prepared, tested restore script.
- **Lock window.** `ALTER POLICY` and `CREATE INDEX` briefly lock each table. Apply outside reception hours with a 5-second lock timeout.
- **Release order.** The migration must go first, and the app within minutes. The migration is fully compatible with the current app, so the order is safe; the new app needs the new functions.
- **Time-zone data.** The browser time-zone data on staff machines may still put Casablanca at UTC+1. Reports therefore take their dates from the database. Other client-side Casablanca dates are a separate question ([D4](#owner-decisions-required)).
- **Measurement limit.** The numbers come from a synthetic local copy on Apple silicon. Production hardware is smaller and adds network time, so only the ratios carry over. The release records Production's own before/after from `pg_stat_statements`.

# Verified current state (ledger 123)

## Policies and helpers

These facts come from a private local stack (`supabase/postgres:17.11.0.004`, Supabase CLI 2.121.0) with migrations 001–123 applied.

| Fact | Value |
| --- | --- |
| Public policies | 163 on 41 tables (51 RESTRICTIVE) |
| Policies calling `get_my_role()` | 143 |
| `auth.uid()` | 12 |
| `get_my_teacher_id()` | 10 |
| `get_my_email()` | 3 |
| Policies with at least one unwrapped zero-argument helper | 144; none is wrapped today |
| Policies calling `get_visible_student_ids()` | 22, already inside a sub-select |
| Policies calling `teacher_can_access_student_group(…)` | 17 on 7 tables |
| Of those, with no role test in front | **13**: `assessments` (select/insert/update), `certificates teacher read`, `learning_assessments` (3), `placement_tests` (3), `portfolios` (3) |
| Other non-public policies | `storage.objects` 1, `cron` 2: out of scope (D2 is "all public policies") |

**Teacher-helper cost for other roles.** 123 made `teacher_can_access_student_group` a SECURITY DEFINER SQL wrapper around `portal_security.teacher_sees`. That function starts with `get_my_role() = 'teacher'`, so for every other role it returns false, but only after one non-inlinable call per row. Policies are ORed, so a director reading assessments pays it on every row. The other 4 of the 17 policies (3 `attendance teacher …` and `notifications self read`) already test the role first.

**`get_my_role()` itself** is `STABLE SECURITY DEFINER` (`select role from profiles where id = auth.uid()`). It is never inlined, so today it runs once per row per policy.

## What changed since PR #124

- **123 dropped `students teacher read groups`.** Teachers read learners only through `portal_teacher_roster`. PR #124's main finding, the per-row teacher check on `students`, no longer applies.
- **What dominates the students list now** is per-row `get_my_role()` in the `students`, `charges`, `receipts` and `enrollments` policies, plus the all-charges finance aggregate.
- **Wrapping now pays on its own.** PR #124 found that wrapping alone gave no consistent gain; it now gives 3–5×.
- **The 6 guarded policies became 13**, because 123 split the `… teacher rw` policies by command.
- **New schemas** `academic_security`, `finance_security` and `portal_security` (120–123) are used only inside functions. No policy calls them directly, so they need no rewrite.

## REL-2 — `search_students_page`

- **Latest definition:** [121](../../../supabase/migrations/121_enrollment_group_consistency_enforce.sql), line 317. It is SECURITY INVOKER plpgsql and returns `{rows, count, total, active_count}`.
- **The `finance` CTE** aggregates `charge_balances` over **every** non-voided charge before any learner filter. `charge_balances` is a security-invoker view grouping charges with their receipts.
- **Measured at 20× as director** (`EXPLAIN ANALYZE`, list page 1):
  - 147 ms of 203 ms is the finance CTE.
  - The `charges` scan is 62 ms for 9,032 rows and the `receipts` scan is 48 ms for 6,708 rows. Both are dominated by per-row policy calls.
  - The `total` count scan adds 21 ms.
- **The app** calls the list at [students/page.jsx:172](../../../src/app/(admin)/students/page.jsx) (20 per page) and the CSV export at line 234 (`p_page_size: 0`, refused to the receptionist).

## REL-3 — whole-table reads

**Activity log** ([activity-log/page.jsx:45](../../../src/app/(admin)/activity-log/page.jsx)):

- It reads `ActivityLog.listAll` (`select *`, including `before`/`after`), 500 rows per page, with `count: 'exact'` on every page.
- All filters run in the browser: table, action and free text. There is no date filter.
- Errors render as "Aucune entrée."
- Indexes: only `(target_table, target_id, created_at desc)` and `(actor_id, created_at desc)`.
- RLS: director/admin select; receptionist RESTRICTIVE deny; no writes (012).

**`paginateAll`** ([paginateAll.mjs](../../../src/lib/paginateAll.mjs)):

- It reads by offset and throws `Dataset changed during pagination; retry` when the count changes or an id repeats.
- Every `listAll`, and every `filter()` without a limit, uses it. That covers about 25 pages; the survey list is in the [implementation contract](#implementation-contract).

**Reports** ([reports/page.jsx](../../../src/app/(admin)/reports/page.jsx) lines 116–122):

- They load all of Attendance, Receipt, Payroll, Student, Teacher, Group and Enrollment.
- Receipts are loaded only to list available years.
- Finance totals already use `get_finance_year_months`.

**Group detail** ([groups/[id]/page.jsx](../../../src/app/(admin)/groups/[id]/page.jsx)):

- Batch F moved teachers to `portal_teacher_roster(p_group_id)`.
- Staff still load the whole `Enrollment` and `Student` tables and filter in the browser.
- An error shows "Groupe introuvable".

**Teacher portal** ([teacher-portal/page.jsx](../../../src/app/(admin)/teacher-portal/page.jsx)):

- Batch F moved learners/enrollments (roster RPC), notifications (by profile) and messages (RPC).
- It still loads the whole `Group`, `Assessment` and `LearningAssessment` tables and filters in the browser.

## REL-8 — cache invalidation gaps

Query defaults: `staleTime` 5 min, `useEntity*` 30 s. These paths refresh nothing that other screens cache:

- `void_financial_receipt` ([receipts/[id]/edit](../../../src/app/(admin)/receipts/[id]/edit/page.jsx));
- `void_financial_charge` ([finance/charges/[id]/edit](../../../src/app/(admin)/finance/charges/[id]/edit/page.jsx));
- `retry_receipt_email`;
- payroll validate/pay/delete;
- `save_receptionist_student` from the form ([ReceptionistStudentForm.jsx](../../../src/components/students/ReceptionistStudentForm.jsx));
- validate and reject enrollment ([enrollments/page.jsx](../../../src/app/(admin)/enrollments/page.jsx));
- the enrollments page's `onSave`;
- `soft_delete_student`;
- `append_receptionist_enrollment_document`;
- `save_receptionist_teacher_operations`;
- `save_attendance` (attendance page and teacher portal).

`create_charge_payment` invalidates `['Charge']`, which no query uses, and it misses the report caches. Several finance screens are not TanStack Query at all: the dossier finance section, receipts list, finance page, dashboard and `FinanceReviewQueue`. They reload on mount, so after navigation they are current; the stale screens are the cached TanStack lists and reports.

## REL-9 — errors read as "pending"

**Middleware** ([middleware.js](../../../src/middleware.js) lines 81 and 104–110):

- It ignores the `getUser` error, so a network failure sends a signed-in user to `/login`.
- It ignores the profile-read error, so `role = profile?.role || 'pending'` and the user is redirected to `/unauthorized`, "Compte en attente d'activation".

**Client** ([AuthContext.jsx](../../../src/context/AuthContext.jsx) lines 38–41, 109): on a profile-read error, it calls `recover_missing_profile` and falls back to `pending`. The same false message appears from the browser side. PR #121 (parked architecture, session context) designs the full client state machine; see [D3](#owner-decisions-required).

**Teacher portal:** a failed load clears the skeleton and renders an empty portal. `LearningAssessment.listAll` has no catch.

## REL-6 — report day buckets

**Client bucketing.** [reports/page.jsx](../../../src/app/(admin)/reports/page.jsx) lines 50–58 and 140–148 build day keys as `new Date(); setHours(0,0,0,0)` (browser-local midnight) and then `toISOString().slice(0, 10)` (that instant's UTC date). In any browser east of UTC the key is the previous day. `availableYears` parses `r.date` as UTC midnight and reads a local year.

**Server side is already right.** `business_date()` (122) is `(p_at at time zone 'Africa/Casablanca')::date`.

**Time-zone data finding (2026-10-28).** The brief states Morocco is UTC+0 since 2026-09-20.

| Runtime | Time-zone data | Casablanca on 2026-10-28 | Agrees with the brief |
| --- | --- | --- | --- |
| Local Postgres 17.11 | bundled | UTC+0 | yes |
| Node 22.23.3 (ICU) | `2026a` | GMT+1 | no |

So client-side Intl date helpers depend on each staff browser's time-zone data, and may be one hour off. A day boundary computed in the browser can be wrong between 23:00 and 24:00 Casablanca time.

**Production Postgres** is `supabase/postgres:17.6.1.155`. Its Casablanca offset has not been read and is checked at release R0.

# Scope and non-goals

**In scope:**

- the five findings above;
- the performance baseline and budget for `search_students_page`;
- the equivalence test;
- the restore script.

**Not in scope:**

- policy consolidation (merging permissive policies), helper-function changes, grants, and the advisor's FK/unused/duplicate-index items;
- a set-based teacher helper;
- PR #121's session RPC and full client state machine;
- converting non-TanStack pages to TanStack beyond what REL-8 needs;
- client Casablanca helpers outside reports (D4);
- any Production action.

# Design

## 1. Policy rewrite (REL-2, D1 = A, D2 = A)

**Rule A — wrap.** In `USING` and `WITH CHECK` of every public policy:

- `get_my_role()` → `( SELECT get_my_role() AS get_my_role)`;
- the same for `get_my_teacher_id()` and `get_my_email()`;
- `auth.uid()` → `( SELECT auth.uid() AS uid)`.

Postgres plans each as an InitPlan evaluated once per statement.

**Rule B — guard.** A policy whose whole expression is a bare `teacher_can_access_student_group(…)` becomes `((( SELECT get_my_role() AS get_my_role) = 'teacher'::text) AND <original>)`. This applies to the 13 policies listed above.

**Equivalence argument.**

- **Wrapping.** The four helpers take no arguments and read only the request's JWT claims and the caller's own profile or teacher row. Within one statement they see one snapshot, being STABLE, so per row and once give the same value.
- **Guard, teacher caller.** The guard is true and the original expression decides.
- **Guard, any other caller.** The original is false (`coalesce(…, false)` in 123), and the guarded form is false. For a caller with no profile, the role is NULL and the guarded form is NULL. Both deny in `USING` and in `WITH CHECK`.

**Generation.**

- `scripts/generate-rls-role-evaluation.mjs` reads `pg_policies` from a database at ledger 123. It emits one `ALTER POLICY … USING (…) WITH CHECK (…)` per changed policy, in table and name order, with the original expression in a comment.
- The output is pasted into the migration and committed.
- A CI step re-runs the generator against the replayed ledger-123 database and requires byte-identical output.
- The prototype rewrote 157 policies (144 wrapped, 13 guarded); the other 6 contain no helper.

## 2. `search_students_page` (REL-2)

The function is re-created with the identical signature, guards, ACL, `STABLE`, SECURITY INVOKER, `search_path` and output. Only the CTE order changes:

1. `candidates`: the learner filters of 121, verbatim, with no finance and no per-row sub-selects.
2. `scope`: the ids that need a payment status.
   - With no payment filter, the requested page (`order by created_at desc, id asc`, the same limit and offset).
   - With a payment filter, every candidate.
3. `finance`: per scoped learner, `cross join lateral (select count(*), sum(balance), bool_or(…) … from charge_balances where voided_at is null and student_id = sc.id having count(*) > 0)`.
   - The lateral reference lets the planner use `charges_student_idx`.
   - A plain `student_id in (scope)` join is **not** pushed into the grouped view: it was measured still aggregating all 8,984 charges.
4. `priced`, `filtered` and `rows`: the 121 expressions, with `group_name`, `extra_group_count` and `pending_enrollments` computed only for the output page.
5. `count`, `total` and `active_count`: unchanged.

**Output equivalence (prototype).** The old and new functions were compared on a fixture where every payment status occurs: 31 none, 168 overdue, 19 partial, 10 pending, 66 settled. The matrix covered:

- 3 statuses × 7 payment filters × 3 searches × 2 group filters × 3 page sizes (20, 100, 0) × 3 pages;
- as director, admin and receptionist;
- 2,646 calls in total.

Result: **2,646 of 2,646 identical** `jsonb` results. The 126 receptionist export calls were refused identically with `42501`.

**Fallback.** At 20× the export p95 is 229–234 ms, the closest result to the 300 ms budget. If the CI budget gate trips, the documented fallback is a second `finance` branch that uses the grouped aggregate when `scope` is the full candidate set. It would be measured and re-verified with the same equivalence matrix.

## 3. Activity log (REL-3)

**Index:** `create index activity_log_created_id_idx on public.activity_log (created_at desc, id)`.

**`public.list_activity_log(…)`:**

- Signature: `p_before_created_at timestamptz, p_before_id uuid, p_table text, p_action text, p_from date, p_to date, p_search text, p_limit int default 50`.
- SECURITY INVOKER, STABLE, `search_path = pg_catalog, pg_temp`.
- Execute is granted to `authenticated` only.
- Returns `id, created_at, actor_email, action, target_table, target_id, changed_columns`, with no `before`/`after`, ordered `created_at desc, id asc`.
- Keyset predicate: `created_at < cursor or (created_at = cursor and id > cursor_id)`.
- `p_from`/`p_to` are Casablanca civil dates, converted with `at time zone 'Africa/Casablanca'`.
- `p_search` matches `actor_email`, `target_table` or `target_id::text` (case-insensitive, at most 120 characters).
- `p_limit` is 1–100.
- RLS decides visibility, unchanged: director/admin rows; the receptionist sees none.

**`public.list_activity_log_tables()`** returns distinct `target_table` values through a loose index scan (recursive CTE) on the existing `idx_activity_log_target`.

**Detail on expand:** `select id, before, after from activity_log where id = :id` through the entity layer, under the same RLS.

**UI:** a TanStack infinite query with key `['ActivityLog', filters]` and a "Charger plus" button. The footer stops claiming "500 plus récentes", and a read error shows a retry state.

## 4. Reports, group page, teacher portal, full reads (REL-3)

**New functions.** All are SECURITY INVOKER, STABLE, `search_path = pg_catalog, pg_temp`, executable by `authenticated` only, and see exactly the rows the page sees today:

| Function | Returns | Replaces |
| --- | --- | --- |
| `report_attendance_daily(p_days int)` (7, 30 or 90) | `today date` plus rows `(day date, status text, n bigint)` for `business_date() - p_days + 1 … business_date()`, NULL status counted as `Présent` | whole Attendance load and client bucketing |
| `report_payroll_by_teacher(p_year int)` | `(teacher_key, teacher_name, brut, net, n)` grouped as today (`teacher_id`, else `teacher_name`) | whole Payroll load |
| `report_student_mix()` | `(status, n)` with NULL counted as `Prospect` | whole Student load |
| `report_years()` | distinct years from `receipts.date`, `payroll.annee` and `business_date()` minus 0–2 | whole Receipt load |

**Academic operations report.** It keeps its client logic but reads only:

- learners with status `Enrolled` or `Trial`;
- enrollments in `Confirmed`, `Validated` or `Trial`;
- all groups and teachers, which are small reference tables.

These are filtered reads, not whole tables. A test compares the report's output on the fixture before and after.

**Group detail (staff).**

- `Enrollment.filter({ group_id })`, plus pending enrollments of those learners;
- `Student` filtered by `id in (…)`;
- a retry state on error instead of "Groupe introuvable".

**Teacher portal.**

- `Group.filter({ teacher_id })`;
- `Assessment` and `LearningAssessment` filtered by `group_id in (…)` or `student_id in (…)`;
- a retry state on load errors (REL-9).

**Full reads (`listAll`/`filterAll`).** `paginateAll` is replaced by keyset reads:

- 1,000 rows per request, `id > last_id order by id asc`, no `count`;
- then a stable sort in the browser by the requested order, with `id` as the tie-break, the same as today.

A concurrent insert or delete no longer aborts the read. A row inserted below the cursor during the read may be missed, exactly as with any non-snapshot read; it appears on the next refresh. `paginateAll.mjs` is removed once no caller remains, and its regression test is replaced by a keyset test.

## 5. Cache invalidation (REL-8)

`src/lib/cacheInvalidation.js` exports two helpers:

- `invalidateAfterFinance(queryClient)` refreshes `Receipt`, `Student`, `Enrollment`, `Charge`, `Payroll` and `report`.
- `invalidateAfterLearnerSave(queryClient)` refreshes `Student`, `Enrollment`, `Group`, `Attendance`, `Teacher` and `report`.

Every path listed under REL-8, and every existing call site that invalidates by hand, calls the matching helper after a confirmed success, including after a stale-version conflict, as today. The report and activity-log queries use keys under `report` and `ActivityLog`.

A static regression test, `scripts/test-cache-invalidation.mjs`, scans `src/` for each finance and receptionist RPC name in a closed list. It fails if a call site's module does not call the helper. New RPCs must be added to the list.

## 6. Middleware and portal errors (REL-9)

**Middleware.**

- When `getUser` returns an error that is not an authentication refusal (no HTTP status, or status ≥ 500), or the profile read returns `error`, the response is a **503** rewrite to `/unavailable`. It carries `Retry-After: 5` and `Cache-Control: no-store`.
- `/unavailable` is a static French page with a retry button that reloads the original URL. It shows no navigation and no data.
- "No profile row" (no error, `data = null`) keeps today's `pending` behaviour, and an authentication refusal keeps `/login`.
- `/unavailable` is added to the middleware's public paths (it must not itself require a profile) and contains nothing.

**Teacher portal and group page:** the shared `ReadState` pattern ("Impossible de charger…", "Réessayer").

**Client gate:** see D3.

## 7. Casablanca report dates (REL-6)

- The attendance chart uses the day keys and `today` returned by `report_attendance_daily`, verbatim.
- The client does no date arithmetic for buckets and formats labels from the `YYYY-MM-DD` strings without `Date` parsing.
- Years come from `report_years()`.
- No fixed offset appears anywhere. The zone name `Africa/Casablanca` is resolved by Postgres.

# Invariants

1. **No access change.** For every policy, name, table, command, roles and kind are identical before and after. The visible rows of every public RLS table and the outcome (allowed, or the same SQLSTATE) of every write are identical for each of these identities:
   - director, admin, receptionist;
   - linked teacher and unlinked teacher;
   - parent and student, with active links;
   - pending;
   - profileless authenticated, and anon.
2. **`search_students_page` is identical** for every input, including errors, signature, ACL, volatility and security mode.
3. **New functions are SECURITY INVOKER and read-only.** They are revoked from `public` and `anon`, granted to `authenticated`, with `search_path = pg_catalog, pg_temp` and no dynamic SQL.
4. **No other catalog change.** No other function body, grant, trigger, table, column, constraint or cron job changes. The upgrade test checks this with a catalog digest.
5. **The middleware never fails open.** An error never renders a protected page and never yields a role.
6. **No fixed UTC offsets** are introduced.

# Measured before/after

**Method.**

- **Environment:** private local stack, `supabase/postgres:17.11.0.004`, native arm64, migrations 001–123.
- **Fixture:** synthetic, with no real data. 1× is sized from the latest recorded aggregates (213 learners in the [2026-10-08 audit](../evidence/performance-audit-2026-10-08.md); 334 receipts in the Batch E-2 record).
  - Per scale *k*: 300·*k* learners (2% archived), 30·*k* groups, about 1.07 enrollments per learner, about 1.5 charges per learner, about 1.1 receipts per learner, 60 attendance rows per learner, 3 assessments and 1 placement test per learner, and 30,000·*k* activity entries.
  - The activity-log size is **assumed**; no recorded count exists.
- **Measurement:** each call ran as `authenticated` with the role's JWT claims, 3 warm-ups and 25 timed runs, server time only. The prototype changes were applied in place and restored between runs.

**`search_students_page`, p95 ms.** *Before* is ledger 123. *After* is the policy rewrite plus the new function.

| Scale | Role | First page (20) | Search | Payment filter "overdue" | Export (page size 0) |
| --- | --- | --- | --- | --- | --- |
| 1× | director | 15.7 → 3.0 | 13.5 → 2.6 | 18.7 → 5.6 | 26.2 → 12.6 |
| 1× | admin | 16.1 → 4.5 | 25.0 → 3.0 | 32.7 → 5.6 | 33.9 → 12.5 |
| 1× | receptionist | 22.2 → 3.9 | 19.4 → 3.2 | 29.0 → 6.1 | refused (unchanged) |
| 2× | director | 33.0 → 3.4 | 24.0 → 3.0 | 41.3 → 9.3 | 54.4 → 27.3 |
| 2× | admin | 35.4 → 3.2 | 25.9 → 3.0 | 44.5 → 10.6 | 63.0 → 30.3 |
| 2× | receptionist | 47.8 → 4.3 | 35.7 → 3.6 | 54.1 → 10.3 | refused |
| 5× | director | 58.1 → 4.3 | 71.3 → 4.2 | 67.3 → 18.6 | 103.1 → 68.4 |
| 5× | admin | 62.9 → 4.7 | 79.2 → 4.0 | 73.2 → 18.4 | 119.7 → 67.8 |
| 5× | receptionist | 96.5 → 5.9 | 102.4 → 5.4 | 106.4 → 21.7 | refused |
| 20× | director | 233.3 → 9.1 | 226.8 → 7.7 | 280.3 → 62.8 | 426.8 → 229.2 |
| 20× | admin | 261.5 → 9.0 | 232.4 → 7.5 | 335.2 → 61.4 | 485.0 → 234.1 |
| 20× | receptionist | 393.1 → 12.4 | 366.5 → 10.9 | 404.9 → 66.0 | refused |

**Attribution at 5×** (p95 ms, director; first page / overdue / export):

| Variant | First page | Overdue | Export |
| --- | --- | --- | --- |
| Before | 58.1 | 67.3 | 103.1 |
| Policy rewrite only | 18.3 | 23.9 | 58.1 |
| New function only | 53.6 | 56.6 | 103.3 |
| Both | 4.3 | 18.6 | 68.4 |

At 5× the receptionist's first page goes from 96.5 (before) to 30.2 with the policy rewrite only, and 5.9 with both.

So the policy rewrite is the main lever; the function change makes the default page independent of the number of charges. Export with the final design is about 10 ms slower than the rewrite alone (per-learner lateral versus one grouped pass), and stays well within budget; see the fallback in design §2.

**Teacher guard (D1).** Staff read of the whole table at 5× (director, p95 ms):

| Table (rows) | Before | Wrap only | Wrap + guard |
| --- | --- | --- | --- |
| `assessments` (4,500) | 282.4 | 210.9 | **1.1** |
| `placement_tests` (1,500) | 82.6 | 68.5 | **0.5** |

**Activity log** (director, server time, policy rewrite applied):

| Scale | Today: whole load (`select *`, 500 per page, `count` per page) | New: one keyset page of 50, no before/after, p95 |
| --- | --- | --- |
| 1× (30,000 entries) | 5,266 ms, about 30 MB of row data | 4.2 ms with the index (7.7 ms without) |
| 5× (150,000 entries) | 128,856 ms, about 150 MB | 13.9 ms with the index (56.5 ms without) |

**Policy prototype equivalence:**

- 157 policies rewritten; metadata unchanged (0 differences in kind, roles or command).
- 0 visible-row differences over 711 role × table cells.
- **Coverage limit:** only 48 of those cells were non-empty with this fixture. The implementation test must populate every policy-bearing table and add the write matrix.

**Production.** No Production data was read for this plan. Release R0 records the `pg_stat_statements` mean for `search_students_page`, read-only and with the release approval; R3 records it again, and once more after one reception day.

**Owner-side observations, 2026-10-28** (reported by the coordinating session; a live read-only browser measurement from the owner's location; no Production SQL was run):

- The students list took **0.4–0.8 s** per round trip, about 0.35 s of it network.
- The activity log took **about 10 s** to load 2,515 entries in 6 sequential pages.

# Migration, test, rollout and recovery

## Files

**Database and scripts:**

- `supabase/migrations/XXX_speed_as_the_centre_grows.sql`. Use the next free number at merge: 124 is free on `origin/main` today, but Batch F's prepared corrective migration may take it first.
- `scripts/generate-rls-role-evaluation.mjs`: deterministic generator.
- `scripts/rollback/XXX_speed_as_the_centre_grows_restore.sql`: forward-applicable restore. It restores the 157 original expressions (generated alongside), the 121 body of `search_students_page`, drops the six new functions and the index.

**Tests:**

- `scripts/test-speed-as-the-centre-grows-local.mjs`: upgrade, equivalence, budgets.
- `scripts/test-cache-invalidation.mjs`
- A keyset replacement for `scripts/test-pagination.mjs`.

**App:**

- `src/lib/cacheInvalidation.js`, `src/lib/keysetRead.mjs`;
- `src/app/unavailable/page.jsx`;
- [middleware.js](../../../src/middleware.js), [entities.js](../../../src/lib/entities.js);
- the activity-log, reports, group-detail and teacher-portal pages;
- the REL-8 call sites.

**Docs:**

- ADR-013 (proposed with the implementation): "Policies evaluate role helpers once per statement; per-row helpers are role-guarded; list reads are keyset".
- [SECURITY_RULES](../../ai/SECURITY_RULES.md): the policy-writing rule.
- [ARCHITECTURE](../../ai/ARCHITECTURE.md): read model.
- CURRENT_STATE at release.

## Tests

1. **Upgrade, text and catalog** (`test-speed-as-the-centre-grows-local.mjs`, wired into the `local-database` CI job):
   - reset to ledger 123 and snapshot the catalog;
   - apply the migration;
   - every changed policy normalises back (unwrap `( SELECT f() AS f)`, strip the guard) to its original text;
   - metadata is unchanged, and no other function, grant, trigger, table, index or cron row changes (digest), apart from the declared objects;
   - the generator reproduces the committed SQL;
   - the restore script returns the catalog digest to the ledger-123 snapshot.
2. **Read and write equivalence.**
   - The fixture makes every policy-bearing public table non-empty for at least one identity.
   - Identities: the ten in [Invariants](#invariants), including anon.
   - Reads: count and content digest of every RLS table, before and after.
   - Writes: one representative INSERT, UPDATE and DELETE per role, table and allowed command, in rolled-back savepoints, recording success or SQLSTATE before and after.
   - **Zero differences required.**
3. **`search_students_page` equivalence:** the 2,646-call matrix above as an automated test.
4. **Budgets** (p95 at the 5× fixture, warm, CI hardware):
   - `search_students_page` list < 300 ms and export (size 0) < 300 ms, for director, admin and receptionist (list only);
   - `list_activity_log` page < 100 ms;
   - each `report_*` < 300 ms.

   This follows the existing CRM-suite pattern (`percentile_cont(.95)`, `pg_temp.ok`). It adds `search_students_page` to the [performance baseline](performance-r1.md).
5. **Every existing security suite runs unchanged** on the migrated replay:
   - `test:middleware`;
   - Batch 1, 2, 3A, 3B, 4A and 4C security;
   - receptionist storage;
   - portal-readiness cross-role REST and concurrency;
   - large-data browser;
   - the receipt and finance rollback regressions.

   None of these scripts may be edited in this PR.
6. **App:**
   - middleware unit tests: error versus no row versus auth refusal → 503 / pending / login;
   - keyset read tests: concurrent insert, no duplicates, no abort;
   - the cache-invalidation static test;
   - reports bucket test: keys equal the server's, no `Date` arithmetic;
   - academic-report output equivalence;
   - a browser check of the activity log, reports, group page, teacher portal and the 503 page.

## Rollout

Each step requires its own owner approval.

1. **R0, read-only, from the release worktree:**
   - ledger is 123;
   - catalog digest equals the local ledger-123 replay;
   - Casablanca UTC offset from `pg_timezone_names`;
   - `pg_stat_statements` baseline for `search_students_page`;
   - activity-log row count, for the record.
2. **R1:** apply the migration outside reception hours, with the established guarded-wrapper pattern:
   - `lock_timeout` 5 s;
   - md5 preconditions on the 157 original expressions and the 121 function body;
   - a `DRYRUN_OK` dry run first;
   - postconditions on policy count, kinds and the new function ACLs.
3. **R2:** merge the PR within minutes of R1. The migration is compatible with the deployed app. Verify the Production deployment of the merge SHA.
4. **R3:** read-only role probe in a rolled-back transaction, plus `pg_stat_statements` again. Optionally, the owner opens the students list, activity log and reports.
5. **R4:** documentation closeout.

## Recovery

- **App:** redeploy the previous Production deployment. The old app works on the migrated database, because the policies are equivalent and `search_students_page` is unchanged in output.
- **Database:** only after the app is rolled back, apply the restore script, which was tested locally in test 1.
- No data is involved in either direction.

# Owner decisions required

**D1, D2 — decided** (A and A, see top).

**D3 — client-side gate on a profile-read error (REL-9).** Today the browser's `AuthContext` also turns a failed profile read into `pending`.

- **A:** Batch G fixes the middleware and the portal only. The client gate stays with parked PR #121. Until then, a failed browser read still shows "Compte en attente" until reload.
- **B (recommended):** Batch G also changes `AuthContext` minimally.
  - A profile-read **error** shows the same connection-problem screen with retry: no role, no children, no navigation. It does not call `recover_missing_profile`.
  - "No row" behaves as today.
  - This is the "unavailable" state of PR #121's design without its session RPC. PR #121 later builds on it.
- **Consequences:** B adds a small Tier-3 auth-gate change, covered by the existing Batch 1 pending-role matrix plus new error-injection cases. A leaves the user-visible REL-9 symptom on one of its two paths.
- **Blocking:** only for this sub-item. With A, the rest proceeds unchanged.

**D4 — client-side Casablanca dates outside reports.** `localBusinessDate` (receipts), `todayInCasablanca` (attendance, teacher portal), `schoolDate` (dismissal) and the CRM calendar helpers use the browser's time-zone data, which may still say UTC+1.

- **A (recommended):** record it as a finding with a separate follow-up outcome. That follow-up serves Casablanca "today" from the database and needs its own plan. The error window is 23:00–24:00 local, outside reception hours.
- **B:** extend Batch G to route all of them through a server business date. This widens scope into receipts and attendance.
- **Blocking:** no.

# Approval record

- **Approved by:** Maroine (owner), in chat, **2026-10-28 13:07 Asia/Shanghai**. Verbatim: "approve G plan, D3 B, D4 A".
- **Revision and head:** SCG-r1, PR #171 at exact head `649056f`.
- **Decisions:**
  - **D1 = A** and **D2 = A**, decided 2026-10-28 about 12:35 Asia/Shanghai.
  - **D3 = B:** `AuthContext` shows the connection-problem retry screen on a profile-read error. "No row" is unchanged, and no `recover_missing_profile` call is made on an error.
  - **D4 = A:** other client-side Casablanca dates stay a separate follow-up.
- **Independent check by the coordinating session:** plan sound, and no access change in the prototypes.
- **Consequences:** PR #124 is closed as superseded ("Superseded by SCG-r1, PR #171"). Implementation proceeds in one Tier-3 PR under the [implementation contract](#implementation-contract). Approval of the plan is not merge, release or Production approval.

# Implementation record

**Status: IMPLEMENTED ON A BRANCH — not merged, not applied in Production.** Branch `feat/speed-as-the-centre-grows`, one Tier-3 PR. Migration `124_speed_as_the_centre_grows.sql`: the next free number after 123 today, renumbered at merge if another migration lands first.

**Database.**

- **Policies.** 157 `ALTER POLICY` statements, generated by `scripts/generate-rls-role-evaluation.mjs` from the 123 catalog:
  - 144 wrapped;
  - 13 teacher-guarded (`assessments` ×3, `certificates` ×1, `learning_assessments` ×3, `placement_tests` ×3, `portfolios` ×3).
- **`search_students_page`:** re-created with the per-learner LATERAL finance read (design §2).
- **Index:** `activity_log_created_id_idx`.
- **New read functions:** `list_activity_log`, `list_activity_log_tables`, `report_attendance_daily`, `report_payroll_by_teacher`, `report_student_mix` and `report_years`.
- **Restore:** `scripts/rollback/124_speed_as_the_centre_grows_restore.sql`.

**Refinements within the approved design** (no access or scope change):

- **Activity-log order.** Newest first, ties by `id` **descending**, and the index is `(created_at desc, id desc)`. One row comparison then uses one index range. Rows written in the same transaction share a timestamp, so their relative order was arbitrary before as well.
- **Full reads.** These are keyset on **(order column, `id`) in the database's own order**, rather than "by `id`, then sorted in the browser". Browser collation differs from the database's ICU collation, so a browser sort would change name order.
  - The cursor is a single sequence with explicit `nullslast`/`nullsfirst` (review S1).
  - A short page ends the read, so a table under 1,000 rows is one request, as with the old reader. The page size equals PostgREST `max_rows` (1,000).
  - `paginateAll.mjs` stays only because the unchanged large-data regression imports it.
- **Middleware 503.** The 503 page is an inline response from the middleware, not a `/unavailable` route.
  - No new import, so the existing middleware security suite still runs the unmodified middleware body.
  - No new public path. It auto-retries after 15 s and has a "Réessayer maintenant" link.
  - An Auth 429 also answers 503.
- **Browser profile read (D3 = B).** The decision is in `src/lib/sessionProfile.mjs`.
  - A failed read, including a failed re-read after recovery, shows "Connexion impossible" with Réessayer and Se déconnecter. It never covers `/login`.
  - The screen is cleared on the no-user branch and on `SIGNED_OUT`.
  - A failed **Auth** read in the browser is still treated as signed out.
- **`report_attendance_daily`** counts the rows in the window before laying them on the day/status grid, and runs with `jit = off` (review DB-S1).
- **The restore script refuses**, changing nothing, unless every policy it restores is still exactly its 124 rewrite.
- **Group page "add learners" picker.** It reads every learner and enrollment only when opened; the page itself reads only the group's rows.
- **Measured but not gated.** A caller whom RLS gives no activity-log rows, such as the receptionist, still walks the index on a call: 85–329 ms at 5×. That is the same order of cost as the direct table read the caller can already issue. The functions add no role shortcut, which would duplicate authorization.

**Tests.**

- `scripts/test-speed-as-the-centre-grows-local.mjs upgrade` (CI, shard `upgrades-from-112-to-116`): the generator check plus the full equivalence matrix.
  - Eleven identities, including a teacher account bound to an archived teacher record: 79 RLS tables read, 99 write probes and 840 students-page calls each.
  - The fixture yields every payment status, 141 non-empty read cells, 104 allowed writes and 514 RLS-refused writes.
  - **Zero differences** after 124 and after the restore.
  - The catalog changes only by the manifest and returns exactly to 123 after the restore. A restore against a changed policy refuses and changes nothing.
- `budget` mode (CI, same shard) at 5×: the p95 gates.
- Unit suites in `npm test`: `test-keyset-read` (with request counts), `test-report-data` (with the report page's loader), `test-cache-invalidation` (per call site) and `test-middleware-unavailable`, plus `test-session-profile` (D3).
- **Browser check (plan §6), local only:** a built app behind a local proxy that can fail profile reads.
  - The middleware 503 page, its recovery, the client retry screen, sign-out and `/login` were checked.
  - So were the activity log, reports, group page and teacher portal.
  - 23/23 checks passed.
- **Existing tests edited:** only the mechanical migration-ledger ceiling bump from 123 to 124, in six upgrade scripts:
  - `test-premium-retirement-upgrade-113-current.sql`
  - `test-crm-batch2-upgrade-current.sql`
  - `test-crm-h3-upgrade-103-current.sql`
  - `test-crm-r4-upgrade-100-current.sql`
  - `test-crm-r4-upgrade-102-current.sql`
  - `test-conflicts-without-retry-upgrade.mjs`

  Batches E and F followed the same convention. Maroine acknowledged on 2026-10-28 (relayed by the coordinating session) that this does not count as the contract's "change an existing test" stop condition.
- No security suite and no other test was edited.
- **Review B2.** `test-ui-foundation-browser.mjs` failed because its REST stub answers every students read with the same row and ignores the cursor. The first keyset reader asked for a second page and threw "did not advance". The S1 short-page stop fixes the code path, and the suite is unchanged.

# IMPLEMENTATION CONTRACT

- **Prerequisites:**
  - owner approval of this revision, with D3 and D4 answered;
  - `origin/main` re-fetched;
  - the latest migration rechecked and the number taken at merge;
  - the generator run against a replay at the then-current ledger; if a later migration changed any policy, regenerate and re-prove.
- **Scope:** exactly design §1–§7, the files and tests above, and the docs. One PR, Tier 3, CI lane `full`.
- **Object manifest (database):**
  - `ALTER POLICY` on the generated set (157 at ledger 123);
  - `CREATE OR REPLACE FUNCTION public.search_students_page(…)`, same signature;
  - `CREATE INDEX activity_log_created_id_idx`;
  - `CREATE FUNCTION public.list_activity_log`, `public.list_activity_log_tables`, `public.report_attendance_daily`, `public.report_payroll_by_teacher`, `public.report_student_mix`, `public.report_years`, each with `REVOKE … FROM public, anon` and `GRANT EXECUTE … TO authenticated`.
  - Nothing else.
- **Pages reading through `paginateAll` today**, all switching to keyset through `entities.js`:
  - attendance, assessments, settings, teacher-portal, enrollments, placement-tests, learning-assessments, portfolios;
  - teachers, dismissal, groups, groups/[id], certificates, leave-requests, activity-log, students/[id], students-directory, payroll;
  - notifications, communications, timetable, reports, students;
  - the filtered callers in the parent and student portals, `centerInfo.js`, `TeacherForm`, `ReceptionistStudentForm` and `StudentForm`.
- **Invariants:** see [Invariants](#invariants).
- **Acceptance:**
  - tests 1–6 pass;
  - before/after measurements are in the PR body (this table re-measured on the final code, 1×, 2× and 5×);
  - budgets pass in CI.
- **Stop conditions:**
  - any equivalence difference (text, read, write or function output);
  - any policy whose rewrite is not purely mechanical;
  - any need to change a helper function, grant or existing test;
  - a budget that cannot be met without changing the design;
  - Production time-zone data contradicting UTC+0 at R0.
- **Not authorized:** merge, deployment, any Production read or write, closing PR #124 before plan approval.
- **Status reporting:** per [AGENTS](../../../AGENTS.md#implementation-handoff). After that, a fresh independent review of the exact head SHA, then separate release approval per step.
