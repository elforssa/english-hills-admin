# Performance plan — revision P-r1

**Status:** owner-approved scope recorded on 2026-10-08 (below). The Phase 2 and Phase 3 database designs are separate architecture documents awaiting owner review. Planned is not implemented, and merged is not deployed; [CURRENT_STATE](../../ai/CURRENT_STATE.md) owns deployment evidence. Audit evidence: [performance audit 2026-10-08](../evidence/performance-audit-2026-10-08.md).

# Owner summary

## What will change

Pages become usable sooner, especially on the centre's slower links:

- less JavaScript to download;
- fewer sequential identity calls before a page draws;
- no duplicate reads;
- server functions running next to the database (Dublin).

A flaky connection will show a French "connection problem, retrying" state instead of signing staff out or claiming they are unauthorized; that is Phase 2. Real-user speed is measured with Vercel Speed Insights.

## What staff/users will be able to do

The same things as today. No feature, page, permission or workflow is removed or changed.

## What remains restricted

All authorization is unchanged:

- middleware keeps its server-side role gate on every application route;
- RLS policies keep their meaning;
- receptionist, teacher, parent, student and pending boundaries are untouched.

Sentry stays errors-only.

## UI impact

None by design, apart from faster rendering and, in Phase 2, the connection-problem state. PDF receipts are generated identically but load their library on demand.

## Database impact

Phases 0 and 1 have none. Phase 2 adds one read-and-session RPC (migration 113). Phase 3 rewrites policy expressions to evaluate role helpers once per statement (migration 114). Both migrations are designed and reviewed separately and need owner release approval.

## Important security decisions

- **Middleware matcher.** The middleware now exempts only Vercel's `/_vercel/` platform prefix, which carries the Speed Insights script and beacon. No application route can exist there, and look-alike paths stay gated (tested).
- **Speed Insights privacy.** Speed Insights runs only on Production deployments. Before an event leaves the browser, its query string, fragment and ID-like path segments are removed, and an event with an unparseable URL is dropped.
- **Session RPC (113).** The Phase 2 session RPC must reproduce `apply_pending_role` exactly, and a transient failure must never grant or keep a role the server has not returned.

## Risks / owner review points

- **Speed Insights enablement.** It requires enabling in the Vercel project, a Production configuration action. Until then the reporter collects nothing.
- **Region change to `dub1`.** This is a Production configuration change with its own Tier-3 PR and release.
- **Latent `40001` retry loop.** The audit found one. It is outside this plan; see [Owner decisions required](#owner-decisions-required).

## Approval record

On 2026-10-08 the owner approved Phase 0, PR A (lighter first load), PR B (no redundant reads) and the `dub1` region change as a separate Tier-3 configuration PR. The owner decided:

- Speed Insights for RUM, with Sentry remaining errors-only;
- no Supabase compute upgrade;
- CRM polling stays at 60 s, visible tab only;
- `getClaims()` in middleware is deferred.

For migrations 113 and 114, the approval covers architecture documents only, and the work stops for owner review. Before 113 the owner requires two proofs: that its pending-role rule is identical to the current `apply_pending_role` for every role, and that its failure states never fail open. One PR per outcome; independent review for Tier 2 and Tier 3.

## Outcomes and PRs

| Outcome | Tier | Rationale | Scope |
| --- | --- | --- | --- |
| P0 — measurement | 3 | Touches the middleware matcher (route protection) and adds RUM data collection. | Throttled browser baseline harness, bundle report and budget, Speed Insights with privacy filter, this plan and the evidence. |
| PA — lighter first load | 2 | Shared frontend loading behavior, receipt PDFs. | jsPDF on demand, Sentry bundle trimming that keeps errors-only behavior, CRM drawer and dialog code split. No change to PDF content or Sentry scrubbing. |
| PB — no redundant reads | 2 | Shared data-access behavior on admin pages; no authority change. | Pages use the `AuthContext` identity instead of `auth.me()`; dashboard counts use head-only counts under the same RLS; network-aware read retries; drop the unused `crm_get_today` from polling. |
| PR — region alignment | 3 | Production Vercel configuration. | `vercel.json` `regions: ["dub1"]`. |
| P2 — session context (113) | 3 | Auth and roles. | Architecture document `performance-session-context-113.md` (separate PR); owner review before implementation. |
| P3 — RLS role evaluation (114) | 3 | RLS. | Architecture document `performance-rls-initplan-114.md` (separate PR); owner review before implementation. |

## Performance budget

[scripts/perf-budget.json](../../../scripts/perf-budget.json) records the 2026-10-08 baseline and the targets for first-load JS. `npm run perf:bundle -- --check` fails when any ceiling is exceeded. Ceilings are lowered only after a change has delivered a reduction.

| Measure | Baseline | Target |
| --- | --- | --- |
| *center* cold load, time to page heading | 3.6–4.1 s | ≤ 2.0 s |
| Sequential browser calls before the heading | 4–6 | ≤ 1 |
| Shared first-load JS | 185.2 kB | ≤ 150 kB |
| `/receipts` first-load JS | 414.9 kB | ≤ 320 kB |
| `students` select, Postgres mean | 516 ms | ≤ 50 ms |
| RUM (Speed Insights), p75 | — | LCP < 2.5 s, INP < 200 ms |

## Owner decisions required

1. **Deterministic `40001` raises (outside this plan).**
   - **Question:** about 40 functions raise SQLSTATE `40001` for stale-version or conflict conditions. Reached through PostgREST, such a request retries in-process indefinitely; this caused the historical 391M-call loop (see [evidence](../evidence/performance-audit-2026-10-08.md#391m-service_role-set_config-calls)). Should this become its own outcome?
   - **Option A:** a separate Tier-3 outcome that moves deterministic conflicts to a non-retryable SQLSTATE (for example `PT409`, as migration 105 did) while preserving the browser contract for uncertain failures.
   - **Option B:** accept the risk.
   - **Recommendation:** A. The enrollment and receipt paths are affected, and those browser contracts treat a missing response as uncertain.
   - **Blocking:** not blocking for this plan.

## IMPLEMENTATION CONTRACT

### P0 — measurement (this PR)

- **Scope:**
  - [perf-baseline-browser.mjs](../../../scripts/perf-baseline-browser.mjs), run with `npm run perf:baseline` against local Supabase and `next start -p 3101`;
  - [perf-bundle-report.mjs](../../../scripts/perf-bundle-report.mjs), run with `npm run perf:bundle`, plus the budget file;
  - [SpeedInsightsReporter](../../../src/components/SpeedInsightsReporter.jsx) in the root layout, rendered only when `NEXT_PUBLIC_VERCEL_ENV === 'production'`, with every event passed through [rumScrub.mjs](../../../src/lib/rumScrub.mjs);
  - the middleware matcher exempts `/_vercel/`.
- **Invariants:**
  - every previously matched application route is still matched;
  - `/_vercel`, `/_vercelx`, `/_vercel-admin/…` and nested `…/_vercel/…` paths stay gated;
  - no RUM event carries a query, fragment or record ID;
  - nothing is rendered or requested outside Production deployments;
  - Sentry configuration is unchanged.
- **Tests:**
  - `npm run test:middleware` (matcher boundaries);
  - `npm test` (includes [test-rum-scrub.mjs](../../../scripts/test-rum-scrub.mjs));
  - lint, build, `npm run perf:bundle -- --check`;
  - the dependency audit gates.
- **Release:**
  - the owner enables Speed Insights in the Vercel project;
  - after deployment, verify that `/_vercel/speed-insights/script.js` loads on Production without redirecting to `/login`, that the beacon returns 2xx, and that a sampled vitals URL is scrubbed.
- **Rollback:** revert the PR. Disabling Speed Insights in Vercel stops collection immediately.

### PA — lighter first load

- **Scope:**
  - `jspdf` and `receiptPdf` are imported on demand on the four PDF routes;
  - Sentry `bundleSizeOptimizations` exclude debug, tracing and Replay code, consistent with errors-only;
  - CRM drawer and command dialogs move to `next/dynamic` with an accessible loading fallback.
- **Invariants:**
  - receipt PDFs are byte-identical for the same input (fixed creation date);
  - Sentry init, DSN gating and scrubbers are unchanged;
  - CRM dialogs keep focus management and their existing browser-suite behavior.
- **Acceptance:** route budgets drop toward target, measured, and the ceilings are lowered to the new values. The *center* profile improves on the PDF routes.
- **Rollback:** revert the PR.

### PB — no redundant reads

- **Scope:**
  - replace `auth.me()` with `useAuth()` (the same stored-profile identity already resolved by `AuthContext`) on the seven pages;
  - dashboard counts use `count: 'exact', head: true` with the same filters;
  - query retries retry only network or gateway failures, up to 3 times with backoff, never 4xx/PGRST/SQLSTATE errors and never mutations;
  - remove `crm_get_today` from the poll list.
- **Invariants:**
  - the role used for page decisions is the stored profile role;
  - RLS applies unchanged, because head counts run under the same policies;
  - dashboard numbers are equal before and after on a fixture;
  - middleware is unchanged.
- **Acceptance:** dashboard loses the 2 sequential identity calls and 4 full-table reads, and the browser suites pass.
- **Rollback:** revert the PR.

### PR — region alignment

- **Scope:** `vercel.json` with `{"regions": ["dub1"]}` only.
- **Release verification:**
  - Supabase edge logs show worker calls from a Dublin colo instead of IAD;
  - reconciliation origin time drops;
  - cron, intake and email flows are healthy.
- **Rollback:** revert the PR, or set the region in the Vercel dashboard.

**Stop conditions for every outcome:** any authorization or RLS behavior change, any test weakened to pass, or any Production action without release approval.
