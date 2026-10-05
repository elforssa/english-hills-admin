# Outcome 3 Batch 1 implementation evidence — 2026-10-05

## Authority and state

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
