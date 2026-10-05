# Outcome 3 Batch 2 implementation evidence — 2026-10-05

## Scope and authority

Owner-authorized implementation of [O3-r2](../plans/completed/outcome-3-receptionist-workspace.md), Batch 2: Tasks / My Work and Admissions Calendar. Baseline main `2bb4b80504ffbec7f0902fe13b8a938475094bf5`; branch `codex/outcome-3-batch-2-work-calendar`. **Tier 2**: substantial operational reads/presentation with unchanged permissions and write semantics. Production ledger is recorded through 107 in the [Batch-1 closeout](outcome-3-batch-1-implementation-2026-10-05.md#production-closeout--2026-10-05). Forward migration: [108](../../../supabase/migrations/108_crm_work_queue_admissions_calendar.sql). No Production inspection or mutation is authorized or performed.

**Author implementation/correction history is preserved below. Current release state is recorded in the Production closeout section.** The authorized forward correction below resolves the original blocker. No independent-review verdict is issued by this author task; [PR #99](https://github.com/elforssa/english-hills-admin/pull/99) and its handoff record exact head/base/tree and the new CI run.

## Implementation

- Task-centric `/crm/today`: one open task per row on active nonmerged leads, independent assignee/owner filters with AND, four server-authoritative buckets/counts and independent bounded cursor pages. Eight existing task types; exact task/version flows use the existing shared drawer and semantic dialogs. Call completion still opens call outcomes. Needs Attention and bounded intake review remain separately discoverable.
- `/placement-tests?view=calendar`: day/week agenda of actual linked/unlinked placement tests and open center visits, stable `(kind,id)` identity and bounded paging. Planned tests survive lead closure; completed toggle, legacy unspecified-time lane and genuine visit end times. Examiner is a display label and tests have no invented duration. Cancellation stays unsupported.
- Two fixed operational RPC projections, stored-role checks, fixed search paths, private helpers and authenticated-only entrypoints. No new tables, write RPCs, RLS, finance/conversion/provider behavior or indexes.
- Calendar mounts independently of the eager placement list. Explicit legacy edit loads one authorized test plus bounded student/group options, using the existing modal/write flow. CRM/Admissions navigation uses query-aware selection and pathname authorization. Return/filter/drawer context remains in the URL.

## Original local validation — before authorized correction

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

## Original performance and nested plans — before authorized correction

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

The owner request explicitly says **“Add only the approved Batch-2 read models”** in migration 108. Additional authorization was requested for a narrow forward read-only repair of that existing private helper, preserving its predicates, signature, grants and authority. At the original author checkpoint it was **pending / not implemented**. The owner subsequently authorized this exact forward correction on 2026-10-05 in [PR #99](https://github.com/elforssa/english-hills-admin/pull/99); the correction evidence below supersedes that pending decision. Migration 107 is not edited. No unsafe data observation, Production repair, new write/RLS or weakened test is used to bypass this blocker. This correction would remain in the same outcome/branch/PR if authorized; no new architecture PR is proposed for this compatible read repair.

## Original author checkpoint — before authorized correction

**Tier 2/3: NOT READY FOR INDEPENDENT REVIEW.** One focused author self-check completed: stored-role/grant/search-path boundaries, explicit projections, immutable migration scope, exact-task intent/version preservation, cursor/filter/date semantics, bounded/lazy reads, guarded semantic actions and regression evidence. Existing product/security invariants and architectural decisions are unchanged, so PRODUCT_RULES, SECURITY_RULES and ADRs require no mechanical amendment. Current-state/architecture/workflows/index and this active plan record source evidence separately from deployment.

Final mandatory SQL execution reached `PASS new work/calendar read assertions` then failed with the preserved `Invalid cursor` attention assertion. Local lead/task/policy/Auth counts were all zero afterward, with no disabled CRM activity/task/profile guards. Temporary diagnostic and cache files were removed. Draft PR/head/base, tested tree and scheduled CI will be recorded in the handoff. Required acceptance is blocked; this is not `AUTHOR WORK COMPLETE — REMOTE CI PENDING`, review readiness or approval.

## Authorized forward correction — 2026-10-05

The owner authorized the narrow compatibility correction in the existing Batch-2 branch and PR #99, retaining Tier 2, O3-r2 and all release holds. Migration 107 is deployed and unchanged. Migration 108 uses `CREATE OR REPLACE FUNCTION` for `crm_security.opportunity_ids`, preserving its exact signature, predicates, fixed search path, custom-plan setting, volatility and existing ACL. Its only body change is `p.heure::time` → `crm_security.calendar_time(p.heure)` in the future planned-placement predicate. Deterministic NULL for missing/malformed input cannot establish a known future appointment; canonical valid times retain the existing Africa/Casablanca interpretation.

The existing public `crm_get_opportunities` function-level exception handler catches `invalid_datetime_format` and `datetime_field_overflow` alongside cursor conversion errors and therefore masks this legacy cast failure as `Invalid cursor`. Removing the unsafe membership cast corrects the read without changing that handler or broadening error-message scope. No rows, statuses, cancellation behavior, commands, RLS, role authority, public grants, finance, conversion, lifecycle or provider behavior change.

The original required taskless/exhausted Needs Attention assertion remains intact. New explicit assertions cover unrelated malformed/missing legacy records, NULL rather than guessed midnight, genuine valid midnight, valid canonical seconds/fractions, public Calendar unspecified-time projection, Casablanca scheduling on the February/March offset transitions, and known future planned-placement suppression. The stateful harness hashes the helper’s signature/configuration/ACL alongside all existing catalog metadata, normalizes only its body for comparison, then separately requires that body to equal the 107 source with exactly one safe-parser expression replacement. All other existing function bodies remain in the unchanged catalog hash.

The preceding failed/partial evidence is historical. Correction validation uses the unchanged local app build from the original UI checks, since this correction changes only migration SQL, assertions and evidence.

| Corrected revision check | Result / evidence |
| --- | --- |
| Stateful 107→108 upgrade | PASS 68 public table hashes; nonempty finance/enrollment/lifecycle facts; exact permitted helper-body replacement and all existing ACL/configuration/RLS/triggers/other bodies unchanged. `/tmp/hills-o3-correction-upgrade.log`; `hills-o3-work-upgrade-result.json` under `os.tmpdir()`. |
| Fresh 001→108 replay | PASS `/tmp/hills-o3-correction-fresh.log`; migration SHA-256 `0500f81501f1117a38657c48a81379498c43916a9e8aa673fee6210077afbd03`. |
| Complete work/calendar SQL + performance | PASS original required Needs Attention assertion and every added legacy/future/offset/unspecified-time regression. All 14 scenarios satisfy warm p95 <=500 ms and maximum <2s; largest warm p95 145.0 ms, maximum 237.8 ms. `/tmp/hills-o3-correction-acceptance-performance.log`. |
| Opportunities + existing phase 4/5/6/7 SQL | PASS `/tmp/hills-o3-correction-opportunities-sql.log`; no persisted fixtures. |
| Full work/calendar Chromium + WebKit | PASS complete mandatory suite with Needs Attention navigation included; actual fixed payload shapes, no eager populations/provider calls, and clean fixture teardown. `/tmp/hills-o3-correction-work-calendar-browser.log`. |
| Opportunities + phase 4/5/6 browser chain | PASS complete chain; Chromium/WebKit Opportunities and existing command, placement, enrollment/conversion/finance safeguards. First 10k Board RPC+render 481.1 ms. `/tmp/hills-o3-correction-opportunities-browser.log`. |
| REST permission regression | PASS 846 real REST/table/RPC checks, nine identities and forged role metadata denial. `/tmp/hills-o3-correction-security.log`. |
| Targeted source and documentation checks | Exact helper copy with one cast replacement and original failing assertion retained; deployed 107 has no diff. Work/calendar and Opportunities static guards, Node syntax and 14 CI classifier/gate tests pass. Markdown links/anchors, added secret/PII heuristics and whitespace checks pass; final staged checks are repeated at handoff. |

Two added test-fixture defects were corrected without changing the migration or weakening assertions: an ambiguous fixture column needed qualification, and the known future booking needed cursor traversal past 120 earlier appointments. Logs `/tmp/hills-o3-correction-test-fixture-failure.log` and `/tmp/hills-o3-correction-test-pagination-failure.log` remain historical failed attempts. A premature upgrade invocation during local reset failed before setup; the subsequent stateful run passed. No failed attempt is used as complete acceptance evidence.

Focused author self-check from the initial implementation remains recorded above; this correction received a targeted check of the exact helper expression, parser NULL semantics, unchanged 107, future-booking/cursor regressions and the stateful grant/RLS/write safeguards. No formal independent-review verdict is issued. All affected local checks now pass. Final local ledger is 108; lead/task/policy/Auth counts are zero, with no disabled guards. The old deterministic failing SHA is not rerun; push this corrected revision to the same PR and confirm fresh full CI scheduling, then stop polling. Terminal required CI and the actual tested merge SHA must be verified by the coordinator before separate exact-SHA independent review.

## Handoff closeout

The original implementation holds were satisfied for PR #99: exact-SHA required CI passed, independent review returned READY FOR FINAL REVIEW, the owner approved merge and separately approved the bounded Production rollout. Production verification is recorded below. No Meta activation, credential change or broader Production authority follows from this closeout.


## Production closeout — 2026-10-05

**State: MERGED / DEPLOYED / PRODUCTION VERIFIED.** Independent exact-SHA review reported no blocking or important findings and returned `READY FOR FINAL REVIEW`.

- PR #99 reviewed HEAD: `557f125253a4b7cc97956a756970a7e30511afd8`; base: `2bb4b80504ffbec7f0902fe13b8a938475094bf5`; CI-tested merge: `aecd320e536cf33a218a850dc826d1d1a1561115`.
- Verify run `37298828084`: classify, docs, app, local-database and required succeeded.
- Owner-approved merge: `c286457b4026ebddce813f8d6fc0a19d046a243b`.
- Vercel Production deployment `dpl_6pfuqAH8PuZsSWwBq91kDVoxQHfZ` reached READY with exact Git source `c286457b4026ebddce813f8d6fc0a19d046a243b`.
- Migration 108 `crm_work_queue_admissions_calendar` was applied once. The Supabase migration API initially recorded generated version `20261005112510`; under the bounded release authority only that migration-history version metadata was normalized to `108`, without rerunning migration SQL. Final ledger ends 105 → 106 → 107 → 108.
- Production catalog verification confirmed both new public reads are stable SECURITY DEFINER RPCs with fixed search paths, authenticated execution only, and no PUBLIC/anon/service-role execution. `work_boundaries`, `calendar_time` and the redefined `opportunity_ids` helper remain non-executable to authenticated users.
- A receptionist-authority bounded probe returned Work Queue timezone `Africa/Casablanca`, the four exact count buckets (overdue/today/tomorrow/upcoming), and the fixed task/lead projection. Admissions Calendar returned the bounded fixed event projection, half-open requested date-range metadata and boolean continuation state.
- The safe parser returns NULL for missing/malformed legacy times, preserves canonical valid time `15:20`, and the deployed `opportunity_ids` definition uses that parser. Forbidden-role Work Queue access and receptionist technical-attribution access were denied by stored-role checks.
- Intake primary cron remained active at five-minute cadence. Lifecycle cron remained inactive; activation epochs, external deliveries and delivery attempts were all zero. `CRM_META_LIFECYCLE_LIVE_ENABLED` remained absent; credential presence was unchanged and no provider delivery was activated.
- Vercel reported no Production runtime errors in the bounded post-release window. The two Production route probes returned HTTP 200 application/login HTML; acceptance did not impersonate a real staff browser session or mutate customer records.

This bounded release verifies the Outcome-3 Batch-2 source/database contract and deployment state. It does not establish broader placement/enrollment/finance feature acceptance, provider delivery, or the separately excluded dedicated walk-in redesign.
