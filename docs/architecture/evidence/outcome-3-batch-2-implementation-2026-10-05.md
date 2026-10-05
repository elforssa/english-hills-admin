# Outcome 3 Batch 2 implementation evidence — 2026-10-05

## Scope and authority

Owner-authorized implementation of [O3-r2](../plans/outcome-3-receptionist-workspace.md), Batch 2: Tasks / My Work and Admissions Calendar. Baseline main `2bb4b80504ffbec7f0902fe13b8a938475094bf5`; branch `codex/outcome-3-batch-2-work-calendar`. **Tier 2**: substantial operational reads/presentation with unchanged permissions and write semantics. Production ledger is recorded through 107 in the [Batch-1 closeout](outcome-3-batch-1-implementation-2026-10-05.md#production-closeout--2026-10-05). Forward migration: [108](../../../supabase/migrations/108_crm_work_queue_admissions_calendar.sql). No Production inspection or mutation is authorized or performed.

**Implementation/validation in progress; merge/release remains on hold.** No independent-review verdict is issued by this author task. PR/head/CI evidence will be recorded at author handoff.

## Implementation

- Task-centric `/crm/today`: one open task per row on active nonmerged leads, independent assignee/owner filters with AND, four server-authoritative buckets/counts and independent bounded cursor pages. Eight existing task types; exact task/version flows use the existing shared drawer and semantic dialogs. Call completion still opens call outcomes. Needs Attention and bounded intake review remain separately discoverable.
- `/placement-tests?view=calendar`: day/week agenda of actual linked/unlinked placement tests and open center visits, stable `(kind,id)` identity and bounded paging. Planned tests survive lead closure; completed toggle, legacy unspecified-time lane and genuine visit end times. Examiner is a display label and tests have no invented duration. Cancellation stays unsupported.
- Two fixed operational RPC projections, stored-role checks, fixed search paths, private helpers and authenticated-only entrypoints. No new tables, write RPCs, RLS, finance/conversion/provider behavior or indexes.
- Calendar mounts independently of the eager placement list. Explicit legacy edit loads one authorized test plus bounded student/group options, using the existing modal/write flow. CRM/Admissions navigation uses query-aware selection and pathname authorization. Return/filter/drawer context remains in the URL.

## Local validation

All checks use loopback Supabase (`http://127.0.0.1:54321`), synthetic actors/data and external email disabled. The final app build also disables local Sentry; browser harnesses reject nonlocal requests. Website intake regression uses a synthetic runtime-only rate-limit key and a loopback fixture, not a Production credential or configuration.

| Check | Result / evidence |
| --- | --- |
| Focused UI lint / production build | PASS; only the existing Sidebar `img` lint warning. Logs `/tmp/hills-o3-batch2-lint.log`, `/tmp/hills-o3-batch2-build-final.log`. |
| Middleware | PASS all 1,066 checks; `/tmp/hills-o3-batch2-middleware.log`. Initial sandbox listener denial was resolved with local network permission. |
| REST/table/RPC role matrix | PASS 846 checks / nine identities, including both new reads and forged role metadata; `/tmp/hills-o3-batch2-security.log`. Initial concurrent fixture locks disrupted cleanup; standalone rerun passed. Database-mutating suites run sequentially. |
| Existing SQL regressions | PASS phase 4/5/6/7 and 107 reads; `/tmp/hills-o3-batch2-existing-sql.log`. |
| Fresh 001→108 replay | PASS; `/tmp/hills-o3-batch2-fresh.log`. |
| Stateful 107→108 migration SQL | PASS 68 public table hashes and existing function bodies/grants/RLS/triggers unchanged. Nonempty enrollment (6), receipts (7), CRM revenue (10) and lifecycle/outbox delivery (10) records were retained, alongside status/task/activity rows. Harness writes `hills-o3-work-upgrade-result.json` under `os.tmpdir()`; log `/tmp/hills-o3-batch2-upgrade.log`. |
| Required Batch-2 SQL acceptance | **FAIL / blocked** on the existing Needs Attention read below. New work/calendar assertions, including boundary/offset, source/cursor/duration/projection/role checks, are retained before that required assertion; no assertion is removed. Log `/tmp/hills-o3-batch2-acceptance.log`. |
| Work/calendar UI diagnostic | **PARTIAL PASS**, Chromium + WebKit: all eight task types, bounded pages, independent cursors/AND filters, exact-task stale rejection with renewed confirmation, Calendar paging/toggle/legacy editing/closed linked test, keyboard/Back, 1440/768/390 and 720 CSS viewport (200% equivalent), reduced motion, empty/loading/error/retry and 60-second/visibility refresh. Actual fixed RPC payload shapes and no eager populations / browser Meta calls were checked. Temporary diagnostic omitted only the known failing attention-navigation assertion, printed `PARTIAL`, and is not the mandatory suite or overall acceptance. Log `/tmp/hills-o3-batch2-browser-independent.log`; screenshots outside Git under `os.tmpdir()`. |
| Complete affected browser chain | PASS Opportunities + phase 4/5/6; `/tmp/hills-o3-batch2-affected-browser-chain.log`. On 10k opportunities first Board RPC/render was 565.0 ms (<1s). Semantic calls, retry/version guards, booking/results, siblings, trusted enrollment/conversion and finance safeguards remain intact. Final empty-state assertions were strengthened to wait for loaded content; focused placement/enrollment reruns provide final-script evidence. |
| Receptionist operational/browser security | PASS current home, Tasks/Calendar navigation, route/API/HR/finance restrictions and operational flows; `/tmp/hills-o3-batch2-receptionist-browser.log`. |
| Website/intake review browser | PASS optional learner identity, protected attribution, bounded intake resolution and no center side effects; `/tmp/hills-o3-batch2-intake-browser.log`. Existing test setup lacked its synthetic rate-limit key and last-director teardown handling; only local setup/transactional fixture teardown was corrected, with guards restored. |
| Presentation/navigation/portability/CI routing | PASS civil-date/read-scope guards, semantic presentation, navigation, 55 portable Node entrypoints and 14 classifier/gate regressions. Staged link/anchor and added secret/PII heuristics passed for six Markdown files; source/secret inspection and `git diff --cached --check` passed. |

Browser corrections preserve assertions: URL-backed filters wait for committed URL/result state; WebKit initial reads settle before hard navigation; mock time installs before navigation; response collectors settle before browser closure. Earlier failed/interrupted diagnostics are not passing evidence. Synthetic fixtures and temporary teardown indexes are removed; scoped history/director guards are restored.

Migration SHA-256: `1852cc48c25c46157c252218563dd873b22077d200e426420d53620dd014d924`. It remained unchanged through final UI/test corrections. Upgrade and performance evidence therefore applies to that same DDL. The upgrade catalog exclusion was tightened by removing an abandoned helper name that does not exist in the 107 baseline; no baseline function is excluded.

## Performance and nested plans

MacBookPro16,1, x86_64, 12 logical CPUs, 16 GiB RAM; local Supabase CLI 2.116.0 / PostgreSQL 17, Next 15.5.25 and Playwright Chromium/WebKit. The benchmark reuses 10k opportunities, 50k tasks, >30k activity rows and >100 calendar entries, with multiple open tasks per lead and eight types. Final acceptance additionally includes a genuine visit-end fixture. Small synthetic fixture augmentation does not change the DDL or count predicates; measured budgets have substantial margin. Measurements use a first session/plan sample then 20 warm calls per scenario, with fixture-warmed buffers, **not an OS-cache-cold benchmark**.

Initial All staff warm p95 was 1568 ms (FAIL). Nested plans isolated per-row SQL bucket classification; an intermediate expression still exceeded the Today budget. Inlining the bucket CASE and using filter-specific plans resolved those misses without dropping predicates, truncating counts or adding indexes. Failed attempts remain historical findings, not passing evidence.

| Scenario | First sample (ms) | Warm p95 (ms) | Maximum (ms) |
| --- | ---: | ---: | ---: |
| All staff | 140.5 | 71.3 | 140.5 |
| Overdue | 88.7 | 82.4 | 88.7 |
| Today | 64.3 | 76.6 | 84.3 |
| Tomorrow | 64.4 | 75.7 | 101.2 |
| Upcoming | 65.6 | 80.9 | 87.8 |
| Owner AND assignee | 52.3 | 57.2 | 60.0 |
| Unassigned | 29.7 | 31.6 | 33.0 |
| Work cursor (two reads) | 137.0 | 138.0 | 151.4 |
| Calendar | 45.2 | 42.6 | 45.2 |
| Placement only | 9.6 | 8.5 | 9.6 |
| Include completed | 41.0 | 45.2 | 46.1 |
| Visits only | 34.2 | 42.0 | 45.1 |
| Calendar cursor (two reads) | 83.6 | 117.8 | 123.7 |
| Maximum 42-day range | 46.7 | 58.8 | 62.4 |

All timing gates passed: warm p95 <=500 ms and no scenario >2s. The enclosing performance/acceptance command still exits failed at the unrelated required attention assertion. Timing output: `/tmp/hills-o3-batch2-performance-final.log`. Nested `EXPLAIN (ANALYZE, BUFFERS)` / `auto_explain.log_nested_statements` output: `/tmp/hills-o3-batch2-plans-final.log` (141,235 bytes). Instrumented All staff RPC was 198.0 ms, default overdue 36.0 ms and Calendar 132.4 ms. Counts scanned all matching tasks; task enrichment was limited to 26 candidate IDs / 25 shown tasks. Calendar scanned the matching date-range sources, retained 101 candidate events and emitted at most 100 fixed event objects. No index was demonstrated necessary.

## Required owner decision

The combined fixture proves an existing Batch-1 compatibility blocker in [107](../../../supabase/migrations/107_crm_opportunities_workspace_reads.sql): `crm_security.opportunity_ids` can evaluate an unlinked legacy placement's invalid `heure::time` before excluding that row in its Needs Attention subquery. The underlying private read raises invalid time syntax; the public read reports `Invalid cursor`. This prevents required taskless/exhausted-attention acceptance when Calendar's truthful legacy-time fixture is present.

The owner request explicitly says **“Add only the approved Batch-2 read models”** in migration 108. Additional authorization was requested for a narrow forward read-only repair of that existing private helper, preserving its predicates, signature, grants and authority. It remains **pending / not implemented**. Migration 107 is not edited. No unsafe data observation, Production repair, new write/RLS or weakened test is used to bypass this blocker. This correction would remain in the same outcome/branch/PR if authorized; no new architecture PR is proposed for this compatible read repair.

## Author checkpoint

**Tier 2/3: NOT READY FOR INDEPENDENT REVIEW.** One focused author self-check completed: stored-role/grant/search-path boundaries, explicit projections, immutable migration scope, exact-task intent/version preservation, cursor/filter/date semantics, bounded/lazy reads, guarded semantic actions and regression evidence. Existing product/security invariants and architectural decisions are unchanged, so PRODUCT_RULES, SECURITY_RULES and ADRs require no mechanical amendment. Current-state/architecture/workflows/index and this active plan record source evidence separately from deployment.

Final mandatory SQL execution reached `PASS new work/calendar read assertions` then failed with the preserved `Invalid cursor` attention assertion. Local lead/task/policy/Auth counts were all zero afterward, with no disabled CRM activity/task/profile guards. Temporary diagnostic and cache files were removed. Draft PR/head/base, tested tree and scheduled CI will be recorded in the handoff. Required acceptance is blocked; this is not `AUTHOR WORK COMPLETE — REMOTE CI PENDING`, review readiness or approval.

## Handoff holds

Required full CI, separate exact-SHA independent review and explicit owner merge/release approval remain required. No merge, Production migration, Vercel configuration, credentials, scheduler or Meta activation is authorized. Source implementation, merge, deployment and Production verification remain separate states.
