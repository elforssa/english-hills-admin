# Outcome 3 Batch 1 implementation evidence — 2026-10-05

## Production closeout — 2026-10-05

**Outcome 3 Batch 1 — Opportunities Operating Workspace: MERGED / DEPLOYED / PRODUCTION VERIFIED**, including migration 107. This factual closeout records the owner-supplied release/acceptance evidence; no new Production inspection or mutation was performed by the documentation task. Earlier implementation and correction sections below remain dated historical evidence, including their then-current holds.

| Release fact | Evidence |
| --- | --- |
| Architecture | O3-r2; architecture merge `656ae21c3652ebcd2e3b8005c38cdf26b240fe2e` |
| Implementation | [PR #97](https://github.com/elforssa/english-hills-admin/pull/97); reviewed HEAD `e7ff247969a2c018f560e733a55435f10b1ab1cd`; merge / exact Production source `9846f2e3031d5c643729bd307fc13b26fcd1eef5` |
| Required CI | [Verify 37280934825](https://github.com/elforssa/english-hills-admin/actions/runs/37280934825) — successful |
| Vercel Production | `dpl_AZrDjX1at7973ojKjzS8wysMToan` — READY; exact source above |
| Production migration | `107 — crm_opportunities_workspace_reads`; final ledger ends `105 → 106 → 107` |

Migration SQL was applied once. The Supabase migration API initially recorded generated version `20261005083555`. A separately owner-approved bounded ledger normalization changed **only migration-history version metadata**, `20261005083555 → 107`; migration SQL was **not rerun**. Migration 107 is deployed and immutable.

Production acceptance established:

- The new Opportunities RPCs exist with their intended authenticated execution grants; private O3 helper functions remain non-executable to authenticated users.
- All nine Opportunities Views returned valid bounded responses under receptionist authority.
- Operational acquisition summary returns only first/latest `channel`, `source_label` and `occurred_at`; it does not expose `conversion_review_required`. Receptionist remains denied from director-only technical-attribution reads.
- Vercel reported no recent Production runtime errors during acceptance.
- Lifecycle cron remains disabled; activation epochs, external lifecycle deliveries and external lifecycle attempts each remain `0`. `CRM_META_LIFECYCLE_LIVE_ENABLED` remains absent. The lifecycle credential remains present, but this rollout did not activate lifecycle delivery. No secret values are recorded.

**Outcome 3 overall is NOT complete. Batch 2 is PLANNED / NOT IMPLEMENTED:** Tasks / My Work and Admissions Calendar. The [O3-r2 plan](../plans/outcome-3-receptionist-workspace.md) remains active; the wider dedicated walk-in redesign remains incomplete. This closeout changes no product architecture, permissions, finance/enrollment/conversion semantics, Meta lifecycle architecture, S1/H3/H4 state or Batch 2 scope.

## Authority and state

Historical implementation-stage record; superseded only for release state by the Production closeout above.

Approved contract: [O3-r2](../plans/outcome-3-receptionist-workspace.md), owner implementation instruction naming architecture merge/base `656ae21c3652ebcd2e3b8005c38cdf26b240fe2e`. Branch: `codex/outcome-3-batch-1-opportunities`. This evidence describes local synthetic implementation, pending required remote CI, separate exact-SHA independent review and release approval. No merge, Production migration, Vercel configuration, credential or provider operation is authorized or established.

**Tier 2:** substantial operational presentation and additive bounded reads using existing authority. No permissions/RLS, existing write semantics, enrollment/conversion authority, finance or provider boundary changes. The catalog/data comparison below verifies that boundary. Batch 2 Tasks/My Work and Admissions Calendar, task/calendar RPCs and all explicit O3-r2 exclusions remain outside this PR.

## Migration and reuse manifest

Forward migration: [107_crm_opportunities_workspace_reads.sql](../../../supabase/migrations/107_crm_opportunities_workspace_reads.sql), allocated after inspecting current main and verified immutable Production ledger 001–106. SHA-256: `9630bfb753dd193f301ae1f10a1f7e54eac69af449f52ec79b768f7b6f09f809`. No deployed migration changed; no indexes were added.

| Classification | Implementation |
| --- | --- |
| REUSE | CRM contacts/leads/tasks/submissions/activities, staff reads, authorization helpers, follow-up policy and semantic command engine, intake review, placement booking/reschedule/results, enrollment candidates/start/link and trusted conversion, financial engine and existing role route allowlist. |
| EXTEND | `CrmWorkspace`, `LeadDetailSheet`, `CrmActionDialog`, enrollment/placement sections, CRM query/cache infrastructure, receptionist home/sidebar and exact CRM return context. |
| ADD | Compact OpportunityCard, bounded Board/List and fixed View/filter components; four public read RPCs; three private read helpers; focused SQL, upgrade, browser and semantic-matrix tests. |

| Read RPC | Bounded response and authority |
| --- | --- |
| `crm_get_opportunities` | Shared fixed View + AND filters, authoritative all-stage counts; five Board pages, default/max 25 each (initial <=125); List or column cursor <=25. Compact JSON is built after IDs are limited. |
| `crm_get_opportunity_filter_options` | Source/program exact facets, max 50, search and validated tuple cursor. |
| `crm_get_operational_acquisition_summary` | Exactly first/latest inquiry objects, each containing channel/source label/occurrence time. No broad detail reuse or receptionist conversion-review/technical attribution disclosure. |
| `crm_get_timeline` | Existing operational activity projection, descending time/ID cursor, default 20/max 50; complete traversal past 10k entries without a growing DOM. |

All four reads are stable SECURITY DEFINER with fixed search paths, existing operational role checks and authenticated-only execute grants. Private helpers have no API execute grants. Cursor validation rejects malformed, mismatched filter/kind/stage envelopes. Existing public functions, grants, RLS, policies and triggers remain unchanged.

## Capabilities

Opportunities is the receptionist landing workspace. Board and List use the same fixed nine Views and owner/source/program/search predicates; Closed selects List for Lost/Not Qualified. Five Board stages are NEW, CONTACTING, ENGAGED, QUALIFIED and CONVERTED. Counts disclose excluded Closed cards; cursor pages replace cards rather than auto-draining or retaining unlimited DOM.

The existing drawer puts contact/learner/program, truthful quick actions, stage/owner and next action before placement/enrollment, narrow acquisition, form answers and cursor history. Drag and keyboard menus propose existing semantic dialogs; cancellation does not write or move a card. Calls require explicit outcome; device/WhatsApp links prove no call/message occurred. Conversation/qualification, reasoned closure/reopen, notes/callbacks and explicit owner/task reassignment reuse existing commands and version/idempotency handling. Placement cancellation remains visibly unavailable. Enrollment initiation retains QUALIFIED; trusted linked confirmation alone drives conversion. Student links preserve an exact approved CRM return URL.

## Local validation

Only loopback Supabase, synthetic actors/data and local app URLs were used. External email is disabled. Behavior harnesses block nonlocal HTTP requests; the performance context monitors and rejects any observed nonlocal request while permitting normal asset caching; no Meta activation/configuration was performed. The final browser run disables Sentry locally as well. The large browser fixture teardown creates six indexes only within its locked cleanup transaction to avoid quadratic FK probes, drops them before commit, and restores scoped history/last-director guards. FK checks remain enabled. These indexes are test scaffolding, not application migrations. Main development Supabase uses API 54321/database 54322; disposable database-only replay uses 55322. Hardware: MacBookPro16,1, x86_64, 12 logical CPUs, 16 GiB RAM; Supabase CLI 2.116.0, PostgreSQL local Supabase, Next 15.5.25, Playwright Chromium and WebKit 26.6.

| Check | Evidence |
| --- | --- |
| Fresh 001–107 replay | PASS on the disposable local instance; current migration 107 replayed after final SQL changes. |
| Stateful 106→107 | PASS: 68 public table count/content hashes identical, existing function bodies/security/search paths/grants, table RLS/policies and trigger definitions/enablement identical. 10k-opportunity fixture committed before the additive migration. |
| Phase 4–7 SQL | PASS on the current cumulative schema: command/closure/reopen, placement, enrollment/finance and revenue/security regression. Historical expectations updated for migration 094 display values, migration 096 receipt capability and monotonic lifecycle aliases; guards remain enforced. |
| Outcome-3 SQL | PASS: exact nine predicates, Board/List counts, source versus latest inquiry, filters/zero intersections, siblings, cursor rejection/disjoint pages, bounded facets and more than 10k timeline entries. Actual flagged acquisition response shape and director/forbidden-role regression. |
| Real local Auth matrix | PASS: 828 REST/table/RPC checks across seven stored roles plus anonymous/service identities; forged director metadata grants no authority. Includes all four new reads. |
| Separate-session concurrency | PASS phase 4/5/6: exact uncertain retries, competing semantic decisions/stale rejection, booking/result races, learner-link consistency, enrollment/confirmation and finance-link races. Synthetic cleanup restores all guards. |
| Pure/navigation | PASS semantic matrix, five stages/nine Views, terminal Converted behavior, URL and component role regressions. |
| Build/middleware | PASS mock-Auth middleware build and separate optimized app build against synthetic Supabase; active middleware manifest, 1,066 HTTP/React DOM checks; receptionist landing/callback is Opportunities. |
| Browser | PASS Chromium/WebKit Board/List/Views, cursor bounds, flagged acquisition payload, actual drag/dialog cancellation, keyboard focus/Back, all three viewports, 200% equivalent CSS viewport and reduced motion. Phase 4/5/6 browser regressions PASS: semantic calls/conversations, closure/reopen/reassignment, stale/uncertain retries, placement booking/results, enrollment initiation/trusted conversion, siblings, director review flag and safe student links. |
| Local advisors/ledger | PASS no finding on the seven new reads/helpers; 154 pre-existing schema warnings retained (unchanged catalog). Disposable local migration ledger 001–107. |

Browser corrections remained in this work item: current grouped navigation requires expanding Apprenants before checking its links; owner reassignment preserves the existing task assignee, including null. An actual search/drawer race was fixed: a delayed search URL update now preserves a lead navigation already requested. Phase-4 browser acceptance reproduces rapid search then card opening and passes after that correction. Earlier WebKit viewport runs reported a fetch error during resize followed by hard navigation; the harness now waits for reads and uses real card clicks after resize. No error allowlist, role check or read permission was weakened. Final logs: `/private/tmp/o3-phase4-browser-final.log`, `/private/tmp/o3-phase5-browser-final.log`, `/private/tmp/o3-phase6-browser-final.log`, `/private/tmp/o3-browser-final.log`. Prior failed/interrupted runs are not passing evidence.

## Read performance and plans

Fixture: 10,000 skewed opportunities, 5,000 shared contacts, 20,000 first/latest submissions, 50,000 tasks, 32,050 activities including 10,050 additional entries on one lead, and 120 linked planned tests. The browser adds its 32 small scenario opportunities to that fixture. No real student/contact/Auth data was copied.

Reproduce normal reads with `node scripts/test-crm-opportunities-local.mjs --replay --regressions --performance`; use the existing local disposable database port. Each case records one first sample and 20 warm samples. The first Board sample starts a new PostgreSQL session/function-plan path before acceptance queries, **70.3ms**. Fixture writes already warmed database buffers; this is a cold session/plan measurement, not an OS-cache eviction claim. The aggregate benchmark permits five minutes for hundreds of calls but independently enforces <=500ms warm p95 and no individual read >2s.

| Case | First sample ms | Warm p95 ms | Maximum ms |
| --- | ---: | ---: | ---: |
| All Board | 70.3 | 86.9 | 87.3 |
| Mine | 81.3 | 87.4 | 96.0 |
| New today | 76.2 | 76.0 | 77.6 |
| Attention | 86.3 | 194.6 | 204.2 |
| Follow-up today | 64.8 | 70.1 | 71.5 |
| Placement | 34.4 | 41.5 | 42.5 |
| Qualified | 22.6 | 22.3 | 22.8 |
| No response | 162.6 | 198.6 | 205.1 |
| Closed | 23.2 | 23.3 | 23.4 |
| List | 34.0 | 33.1 | 34.0 |
| Search | 41.6 | 46.6 | 47.0 |
| Combined owner/program/search | 26.9 | 27.1 | 27.4 |
| First-source filter | 49.9 | 65.2 | 73.5 |
| Column cursor | 31.5 | 34.3 | 36.4 |
| Source facets | 21.2 | 19.3 | 21.2 |
| Program facets | 15.7 | 23.6 | 24.6 |
| Acquisition | 1.7 | 1.1 | 1.7 |
| Timeline | 2.3 | 1.5 | 2.3 |

Optimized local app first Board paint on the 10,032-opportunity browser fixture: **646.2ms**, including a **138.0ms** RPC and browser rendering after DOM ready. Normal asset caching is enabled. The development server measured 2,177ms because client bootstrap delayed the RPC by 1,568ms; that development timing is not claimed as passing. The browser CI job now builds and starts the optimized app with loopback-only credentials before exercising the unchanged <=1s gate. Final combined behavior/performance log: `/private/tmp/o3-browser-final.log`.

All normal SQL read budgets pass: maximum warm p95 **198.6ms**, maximum individual read **205.1ms**. Local logs: `/private/tmp/o3-sql-final.log`, `/private/tmp/o3-final-evidence/test-crm-opportunities.sql.log`; stateful result `/tmp/o3-upgrade-result.json`. These logs contain synthetic records and remain outside Git.

Reproduce nested query plans with `node scripts/test-crm-opportunities-local.mjs --replay --plans`. `EXPLAIN (ANALYZE, BUFFERS)` plus local `auto_explain` captures nested predicates/projection and separate compact card index probes. Representative instrumented outer execution times: Board 223.9ms, Attention 469.0ms, No response 894.9ms, combined filter 19.3ms, facets 160.8ms, timeline 6.5ms and compact card 4.6ms. Instrumentation/logging overhead is separate from the normal interactive timings above.

Nested evidence: All uses one hash join over 10k leads/5k contacts/20k submissions, then bounded top-N pages. Attention uses `crm_leads_active_attempt_idx` plus existing open-task and planned-test predicates. Failure probes use `crm_activities_attempt_key`; compact cards use lead/contact/submission primary/unique indexes and `crm_tasks_open_lead_idx`. Timeline uses the lead/time/ID activity index. Exact counts scan matching IDs without constructing all card JSON. The private ID helper uses a custom plan to avoid a generic one-row estimate/repeated full-table joins on this fixture. Measured existing indexes meet the contract; broad GIN/additional indexes are not justified. Raw nested evidence remains in `/private/tmp/o3-nested-plans.log` and `/private/tmp/o3-plans/test-crm-opportunities.sql.log`.

## Acceptance mapping and release hold

A01–A04: manual/first-source fixture, phase-4 SQL/browser and semantic matrix; current required intake regressions remain in full CI. A05: phase-5 SQL/concurrency/browser and Board planned-test badge (Calendar portion excluded). A06–A08: phase-4 SQL/browser, real concurrency and fixed View predicates; explicit task reassignment changes only its assignee. A09–A11: sibling/contact reads, phase-6 SQL/concurrency/browser and phase-7 financial regression. A12–A13: new bounded SQL/browser, existing version/retry dialogs and separate-session regressions. A16–A17: flagged response/server role tests, middleware/direct-route checks, director regression and browser network capture. A18: Chromium/WebKit viewport/keyboard/focus/Back/reduced-motion checks. A19: bounded cursor/facet/count tests and measured plans/budgets. A14/A15 and Calendar-only A05/A19 belong to Batch 2.

One focused author self-check completed: inspected the staged scope, additive read definitions/grants, privacy projections, cursor/count consistency, semantic routing/version/retry boundaries, local teardown restoration, CI coverage and documentation state/source links. No secrets, real customer fixtures, existing migration edits or high-risk authority changes were found. Corrected Closed helper wording so it does not promise Board restoration when the prior layout was List; the functional behavior and browser selectors are unchanged. Final exact head/base, PR/run references are recorded in the implementation handoff. No author independent-review verdict is issued. Source merge triggers deployment and remains held for owner approval; additive reads must precede dependent UI through a separately approved operator flow. Production remains on the recorded 001–106 ledger until verified release evidence establishes otherwise.

## PR #97 CI corrections — 2026-10-05

Verify run `37269986105` tested implementation head `397891cd57a2a2c116c6d3fcb52927a5d6fc44d5`, base `656ae21c3652ebcd2e3b8005c38cdf26b240fe2e`. Its app job failed at the historical receptionist fallback assertion in [test-crm-batch2.mjs](../../../scripts/test-crm-batch2.mjs), originally line 212. The assertion requests the director-only lifecycle page as each non-director role and checks the fallback home. O3-r2 explicitly changes that receptionist home to Opportunities `/crm/leads`; the lifecycle page remains denied. The correction changes only that literal and adds a positive director-access assertion. The same stale fallback was corrected in [test-receptionist-browser.mjs](../../../scripts/test-receptionist-browser.mjs) (blocked-page Location) and [test-crm-phase11-browser.mjs](../../../scripts/test-crm-phase11-browser.mjs) (analytics denial). Their status, forbidden-data, analytics-query and API-denial assertions remain intact.

[Navigation regressions](../../../scripts/test-navigation.mjs) now independently pin all six role homes, preserve `/crm/today?lead=…` login and return destinations, and reject unauthorized CRM subpaths, external URLs and JavaScript URLs. Existing exact-route authorization and unsafe-redirect tests remain. Repository searches found no other stale current default assertions: direct Today navigation remains intentional; the approved plan's baseline inventory and completed/historical documents describe earlier behavior. Tasks/My Work redesign remains excluded.

The same CI run's local-database job independently failed because [097→current](../../../scripts/test-crm-batch2-upgrade-current.sql) expected ledger 106 after applying migration 107. The workflow applies all migrations before this check. Its ledger maximum and contiguous required-version count now include 107. The same obsolete current-ledger maximum was corrected in [100→current](../../../scripts/test-crm-r4-upgrade-100-current.sql), [102→current](../../../scripts/test-crm-r4-upgrade-102-current.sql) and [103→current](../../../scripts/test-crm-h3-upgrade-103-current.sql); the 100 path's required-version count also includes 107. Every lifecycle data, privacy, scheduler, dormancy, inventory and ACL assertion is preserved. Tests deliberately targeting immutable baselines 097/100/102/103/105/106 remain unchanged. No application code, permissions, migration, enrollment/conversion, finance or provider behavior changed in this correction.

Correction validation passed: `node scripts/test-crm-batch2.mjs`, `npm run test:navigation`, `npm run test:crm-opportunities`, `npm run test:crm-lifecycle`, and `npm run test:middleware` (1,066 HTTP/React DOM checks with real Chromium). Both corrected historical browser scripts pass syntax checks; their full workflows were not rerun for these expectation-only changes. The middleware matrix exercises actual route redirects and protected DOM denial. All four corrected stateful upgrades to 107 passed on the disposable database at port 55322, using the unchanged migration-107 SHA-256 recorded above. Logs: `/private/tmp/o3-pr97-corrections-middleware.log` and `/private/tmp/o3-pr97-upgrade-{097,100,102,103}.log`. Prior Batch-1 browser, real Auth, concurrency and performance evidence remains applicable because runtime sources and migrations are unchanged.

A fresh 001–107 replay followed by `node scripts/test-crm-opportunities-local.mjs --replay --regressions` passed Phase 4–7 and Opportunities SQL, including narrow acquisition/role denials and bounded Board/List/View reads; no O3 fixtures persisted. Log: `/private/tmp/o3-pr97-corrections-sql.log`. One focused correction author self-check inspected the final diff, approved home contract, unchanged denial/lifecycle assertions, ledger baselines, migration checksum and evidence scope. No new architecture decision or risk boundary change was needed. Whitespace and exact-commit Markdown/link/secret checks are recorded in the correction handoff; this evidence does not assert terminal remote CI success or independent review. The existing merge/release hold remains.

## PR #97 comprehensive expectation sweep and browser correction — 2026-10-05

After head `1699e61d4044debb6255fbcfe0958d07a219d565`, Verify `37271207990` reached the receptionist browser test and failed because its post-login heading still expected `Aujourd’hui`. The prior correction did not run that full test and missed this assertion. [test-receptionist-browser.mjs](../../../scripts/test-receptionist-browser.mjs) now waits for the actual Opportunities heading, `Pipeline admissions`, after the existing exact `/crm/leads` login wait. It additionally visits `/crm/today`, verifies its unchanged URL and `Aujourd’hui` heading, then returns to Opportunities before continuing the full operational and security workflow.

One comprehensive sweep covered current scripts/tests, browser fixtures, middleware/navigation/CRM tests and workflow references, searching landing headings, Today paths, role homes, fallbacks/redirects and migration-ledger ceilings, then inspecting each relevant match in context:

| Expectation family | Finding and disposition |
| --- | --- |
| Default home, heading and denial fallback | The post-login heading above was the only remaining superseded assertion. Phase-4/Opportunities browser tests, receptionist blocked-route waits, Phase-11 analytics denial, navigation role homes and middleware expectations already use `/crm/leads` and the current heading. |
| Direct Today access | Phase 4/5/6/8/9/12 explicitly navigate to `/crm/today`; their task/intake behavior and the Phase-6 `Aujourd’hui` heading remain valid. Sidebar links, exact route authorization and navigation return destinations remain unchanged. |
| Migration ledger | All four 097/100/102/103→current checks already require 107. The H3-04 fresh-106/105→106 seed checks and Opportunities pre-upgrade-106 check deliberately target immutable baselines; they remain unchanged. Other migration-presence tests assert required historical migrations rather than a latest-version ceiling. |

Full `node scripts/test-receptionist-browser.mjs` passed against optimized Next and real local Auth/Supabase, with external email disabled and nonlocal browser requests blocked. This includes forged director metadata ignored, permitted/forbidden sidebar links, both CRM routes, placement creation, student/group filters and guarded assignments, enrollment status/multiple-selection/incompatible-state checks, teacher HR isolation, narrow operational finance responses, forbidden analytics RPCs, own-account edits, blocked routes without sensitive preloads and independent API denials. The script removed its synthetic fixtures. Log: `/private/tmp/o3-pr97-sweep-receptionist-browser.log`.

Also passed: navigation, Opportunities semantic, lifecycle and intake regressions; middleware (1,066 HTTP/React DOM checks with Chromium); optimized build; Phase 4–7 and Opportunities rollback-only SQL with no persisted O3 fixtures; browser script syntax. Logs: `/private/tmp/o3-pr97-sweep-middleware.log`, `/private/tmp/o3-pr97-sweep-app-build.log`, `/private/tmp/o3-pr97-sweep-sql.log`. The local development ledger was 106 while all seven workspace function bodies exactly matched migration 107. An attempted local migration application stopped at the existing `o3_cursor`; no ledger repair or reset was performed. Browser/SQL evidence here is against that verified installed schema, not a new fresh replay; the separate fresh/stateful replay evidence above remains unchanged.

No additional stale assertions required edits after the sweep. Runtime sources, migration files, permissions, role homes and lifecycle/provider authority remain unchanged. One focused correction author self-check inspected the final diff, sweep classifications, retained route/API/data denials and passing full-browser cleanup. Tier 2 and the separate exact-SHA review/merge/release hold remain; this author task provides no independent-review verdict.

## PR #97 portable browser artifacts — 2026-10-05

The Linux CI finding after head `4b57d9f0381aba9cf15e3dcbe0467e31d2415815` concerns screenshot destinations hardcoded under macOS `/private/tmp`, not a CRM behavior defect. All 36 screenshot destinations in eight browser scripts now use Node `os.tmpdir()` and `path.join()`, preserving filenames, capture options, failure capture and assertions. The required-CI producers are [Opportunities](../../../scripts/test-crm-opportunities-browser.mjs) and [Phase 4](../../../scripts/test-crm-phase4-browser.mjs), [5](../../../scripts/test-crm-phase5-browser.mjs), [6](../../../scripts/test-crm-phase6-browser.mjs). The same screenshot-only correction covers the manually invoked [Phase 8](../../../scripts/test-crm-phase8-browser.mjs), [9](../../../scripts/test-crm-phase9-browser.mjs), [11](../../../scripts/test-crm-phase11-browser.mjs), [12](../../../scripts/test-crm-phase12-browser.mjs) producers so no browser script retains this dependency. No application or migration file changed; migration 107 retains SHA-256 `9630bfb753dd193f301ae1f10a1f7e54eac69af449f52ec79b768f7b6f09f809`.

The inventory traced `verify.yml`, its npm script commands and literal source/test references (143 files, including the protected-route browser fixture). No exercised test source contains `/private/tmp`. A separate search over all 12 browser scripts also found none, and every browser script passed `node --check`. Non-CI Python/operator helpers and documentation examples were not changed. The traced inventory is local `/tmp/o3-pr97-portable-static.txt`; reproduce the browser-path search with `rg -n '/private/tmp' scripts --glob '*browser*.mjs'` (expected no matches).

`TMPDIR=/tmp/o3-pr97-portable-artifacts npm run test:crm-opportunities-browser` passed the complete Opportunities/Phase 4–6 suite on the local synthetic Supabase and unchanged optimized app build. This explicitly tests a Linux-style temporary destination on the local macOS host; actual Linux execution remains required remote CI. Chromium and WebKit Opportunities behavior, narrow acquisition/no Meta requests, keyboard/responsive checks and the unchanged 10k-fixture performance gate passed (first Board RPC/render **564.3ms**). Phase 4 semantic command/closure/reopen/reassignment/role/uncertain retry checks, Phase 5 booking/reschedule/result checks and Phase 6 enrollment/trusted conversion/sibling/receipt checks all passed. All fixtures were removed and history guards restored. The other four manually invoked browser workflows were syntax checked, not rerun. Log: `/tmp/o3-pr97-portable-browser.log`.

All 28 successful screenshot artifacts are nonempty in the configured temporary directory, outside the repository. One focused author self-check verified that reversing only the path substitutions and removing the two new Node imports restores each of the eight scripts byte-for-byte to its parent version: every assertion, workflow statement and cleanup guard is unchanged. The final diff is confined to test artifact paths/imports and this evidence. Whitespace and exact-commit documentation/link/secret checks are recorded in the correction handoff. Tier 2 and the separate review/merge/release hold remain; no independent review or Production action was performed.

## PR #97 authoritative scheduling oracle and CI parity — 2026-10-05

Verify `37276728361` at head `eca75bfff8e448baeed70096b18a33c499c1c89e` failed the Phase-4 Node time assertion even though the browser rendered `15:20`. PostgreSQL's existing follow-up engine owns calling-window adjustment and persists `crm_tasks.due_at`; workspace reads return that instant and the browser formats it in Casablanca. No application scheduling defect was established.

The fresh browser rehearsal inspected raw stored `due_at=2026-10-20T14:20:00+00:00`. PostgreSQL converted it to **Tuesday, 2026-10-20 15:20 Africa/Casablanca**, and the drawer's next-action section displayed **15:20**. CI's exact Node **22.23.3**, ICU **78.3**, timezone data **2026c**, independently formatted that same instant as **14:20**. Local Node 25.2.1 with timezone data 2026a had formatted it as 15:20. This reproduces a timezone-data disagreement in the duplicate test oracle, not a server-window failure. Diagnostic evidence: `/tmp/o3-pr97-time-oracle-proof.json`.

[Phase 4](../../../scripts/test-crm-phase4-browser.mjs) replaces the Node `Intl.DateTimeFormat` assertion with exact epoch equality between the stored and returned timestamps and PostgreSQL's conversion of the fixture's configured Tuesday opening at 15:20. It independently requires PostgreSQL weekday 2/time 15:20 and the browser's next-action display 15:20. The expected timestamp does not call the scheduling helper being tested. Thus the 13:00 lunch request must still advance to the configured opening. [Phase 5](../../../scripts/test-crm-phase5-browser.mjs) obtains its Casablanca Today date from PostgreSQL with explicit `YYYY-MM-DD`, replacing the other independent Node timezone/locale fixture assumption.

The CI-parity sweep traced required workflow/npm entrypoints and referenced fixtures/helpers, covering paths, timezone/locale conversions, landing/fallback routes, ledger ceilings and ports. No further demonstrated superseded assertion required edits. Direct `/crm/today` and its heading, route denials, other-role homes, historical 106 baselines and approved loopback ports remain valid and unchanged. UTC/ISO future fixtures and the lifecycle browser's intentional local datetime input remain unchanged. Machine-path strings in the documentation-checker's negative fixtures are intentional; four manually invoked Python/operator helpers remain outside required CI. No exercised artifact producer depends on a macOS/user-home path. [test-script-portability.mjs](../../../scripts/test-script-portability.mjs), now included in existing `npm test`, checks all 51 other Node test entrypoints for macOS/Linux home and Windows drive paths. It pins rejected/accepted examples; an ephemeral entrypoint probe also verified actual rejection. No workflow, routing or CI lane architecture changed.

One uninterrupted `npm run test:crm-opportunities-browser` passed the exact **Opportunities → Phase 4 → Phase 5 → Phase 6** sequence against a separate fresh local Supabase **001–107** replay, empty Auth/data baseline and disabled seed. The rehearsal used Supabase CLI **2.116.0**, CI Node **22.23.3**, `TZ=UTC`, locked dependencies, an optimized app on loopback port 3101, local API/database ports 54321/54322, disabled external email/Sentry and a Linux-style temporary screenshot directory. Host execution remains macOS; unhealthy local log-collector containers were excluded, retaining PostgreSQL/Auth/API. Actual Linux execution remains pending remote CI.

Chromium/WebKit Board/List/View, keyboard/responsive, narrow acquisition/no Meta, semantic commands, closure/reopen/reassignment, placement, trusted enrollment conversion, siblings, receipts and concurrency/retry UI checks passed. First Board RPC/render on 10k records was **540.9ms**, below the unchanged 1s gate. All 28 screenshots were nonempty outside Git. Fixtures were removed, guards restored, and final fresh Auth/lead/policy counts were zero. Full chain log: `/tmp/o3-pr97-time-browser.log`.

Also passed under CI Node: `npm test`, navigation, lifecycle, Opportunities and intake regressions; middleware **1,066 checks**; fresh rollback-only Phase 3 calling-window and Phase 4–7/Opportunities SQL; real Auth/table/RPC security **828 checks**; optimized build; classifier/documentation-checker **14 regressions**; script syntax and whitespace checks. Logs: `/tmp/o3-pr97-time-{pure,intake,middleware,sql,security,app-build,ci-regressions}.log`. The development environment was preserved and restored; the disposable test stack was removed. One focused author self-check inspected the final correction diff, exact scheduling oracle, retained business/security assertions, guard coverage and cleanup evidence. Application sources and migration 107 are unchanged, including its recorded checksum. Tier 2 and the separate exact-SHA review/merge/release hold remain; no independent review or Production action was performed.
