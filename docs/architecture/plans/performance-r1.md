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

Phases 0 and 1 have none. Phase 2 adds one read-and-session RPC in the session-context migration (next free number at implementation). Phase 3 rewrites policy expressions so that role helpers are evaluated once per statement and the per-row teacher check runs only for teachers, in the RLS role-evaluation migration (next free number at implementation). Both migrations are designed and reviewed separately and need owner release approval. Migration 113 is the deployed Premium retirement finance contract; the open architecture PRs #121 and #124 use provisional numbers 114 and 115.

## Important security decisions

- **Middleware matcher.** The middleware now exempts only Vercel's `/_vercel/` platform prefix, which carries the Speed Insights script and beacon. No application route can exist there, and look-alike paths stay gated (tested).
- **Speed Insights privacy.** Speed Insights runs only on Production deployments. Before an event leaves the browser, its query string, fragment and ID-like path segments are removed from both its URL and its route, and an event with an unparseable URL or route is dropped. The reporter also passes Speed Insights an explicitly scrubbed route, because the Next.js wrapper otherwise falls back to the raw pathname.
- **Session RPC (session-context migration).** The Phase 2 session RPC must reproduce `apply_pending_role` exactly, and a transient failure must never grant or keep a role the server has not returned.

## Risks / owner review points

- **Speed Insights enablement.** It requires enabling in the Vercel project, a Production configuration action. Until then nothing is collected, but every Production page still requests `/_vercel/speed-insights/script.js`; the independent review of PR #119 reports that it returns 404, and the page then logs a console error (the component itself logs a "Failed to load script" message on a load error). Enable Speed Insights at, or immediately before, the deployment.
- **Region change to `dub1`.** This is a Production configuration change with its own Tier-3 PR and release.
- **Latent `40001` retry loop.** The audit found one. It is outside this plan; see [Owner decisions required](#owner-decisions-required).

## Approval record

On 2026-10-08 the owner approved Phase 0, PR A (lighter first load), PR B (no redundant reads) and the `dub1` region change as a separate Tier-3 configuration PR. The owner decided:

- Speed Insights for RUM, with Sentry remaining errors-only;
- no Supabase compute upgrade;
- CRM polling stays at 60 s, visible tab only;
- `getClaims()` in middleware is deferred.

For the session-context and RLS role-evaluation migrations (numbered 113 and 114 when this was approved; numbers are now assigned at implementation, because 113 is deployed as the Premium retirement finance contract), the approval covers architecture documents only, and the work stops for owner review. Before the session-context migration the owner requires two proofs: that its pending-role rule is identical to the current `apply_pending_role` for every role, and that its failure states never fail open. One PR per outcome; independent review for Tier 2 and Tier 3.

## Outcomes and PRs

| Outcome | Tier | Rationale | Scope |
| --- | --- | --- | --- |
| P0 — measurement | 3 | Touches the middleware matcher (route protection) and adds RUM data collection. | Throttled browser baseline harness, bundle report and budget, Speed Insights with privacy filter, this plan and the evidence. |
| PA — lighter first load | 2 | Shared frontend loading behavior, receipt PDFs. | jsPDF on demand, Sentry bundle trimming that keeps errors-only behavior, CRM drawer and dialog code split. No change to PDF content or Sentry scrubbing. |
| PB — no redundant reads | 2 | Shared data-access behavior on admin pages; no authority change. | Pages use the `AuthContext` identity instead of `auth.me()`; dashboard counts use head-only counts under the same RLS; network-aware read retries; drop the unused `crm_get_today` from polling. |
| PR — region alignment | 3 | Production Vercel configuration. | `vercel.json` `regions: ["dub1"]`. |
| P2 — session context | 3 | Auth and roles. | Architecture document for the session-context migration, next free number at implementation (separate PR #121, provisional 114); owner review before implementation. |
| P3 — RLS role evaluation | 3 | RLS. | Architecture document for the RLS role-evaluation migration, next free number at implementation (separate PR #124, provisional 115); owner review before implementation. |

## Performance budget

[scripts/perf-budget.json](../../../scripts/perf-budget.json) records the 2026-10-08 baseline and the targets for first-load JS. `npm run perf:bundle -- --check` fails when any ceiling is exceeded. **It is a manual check, not a CI gate:** Verify does not run it, and the script does not confirm that `.next` was built from the current tree, so run it right after `npm run build` on the same checkout. Enforcing it in CI is a possible later, separate PR. Ceilings are lowered only after a change has delivered a reduction. The baselines and ceilings record main `857b159`, before Premium retirement Release A, and are deliberately not rebaselined here; PA (lighter first load) rebaselines them.

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
  - [SpeedInsightsReporter](../../../src/components/SpeedInsightsReporter.jsx) in the root layout, rendered only when `NEXT_PUBLIC_VERCEL_ENV === 'production'`, with every event passed through [rumScrub.mjs](../../../src/lib/rumScrub.mjs) and an explicitly scrubbed `route` prop;
  - the middleware matcher exempts `/_vercel/`.
- **Invariants:**
  - every previously matched application route is still matched;
  - `/_vercel`, `/_vercelx`, `/_vercel-admin/…` and nested `…/_vercel/…` paths stay gated;
  - no RUM event carries a query, fragment or record ID, in its URL or its route;
  - nothing is rendered or requested outside Production deployments;
  - Sentry configuration is unchanged.
- **Tests:**
  - `npm run test:middleware` (matcher boundaries);
  - `npm test` (includes [test-rum-scrub.mjs](../../../scripts/test-rum-scrub.mjs));
  - lint, build;
  - `npm run perf:bundle -- --check`, a **manual** check run after the build on the same tree (CI does not run it);
  - the dependency audit gates.
- **Release:**
  - the owner enables Speed Insights in the Vercel project at, or immediately before, the deployment;
  - after deployment, verify that `/_vercel/speed-insights/script.js` loads on Production without redirecting to `/login`, that the beacon returns 2xx, and that a sampled vitals event's URL and route are both scrubbed. Whether Vercel's script sends the route returned by `beforeSend` or reads its own `data-route` attribute cannot be established from the npm package, so both are scrubbed and only this owner post-deploy check verifies the real beacon.
- **Rollback:** revert the PR. Disabling Speed Insights in Vercel stops collection immediately.

### PA — lighter first load

- **Scope:**
  - `jspdf` and `receiptPdf` are imported on demand on the four PDF routes;
  - Sentry `bundleSizeOptimizations` exclude debug, tracing and Replay code, consistent with errors-only;
  - CRM drawer and command dialogs load on demand through a retrying loader (`src/components/crm/LazyOverlay.jsx` and `src/lib/retryingImport.mjs`) with an accessible loading fallback.
- **Invariants:**
  - receipt PDFs are byte-identical for the same input (fixed creation date);
  - Sentry init, DSN gating and scrubbers are unchanged;
  - CRM dialogs keep focus management and their existing browser-suite behavior.
- **Acceptance:** route budgets drop toward target, measured, and the ceilings are lowered to the new values. The *center* profile improves on the PDF routes.
- **Rollback:** revert the PR.

### PB — no redundant reads

- **Scope:**
  - replace `auth.me()` with `useAuth()` (the same stored-profile identity already resolved by `AuthContext`) on six pages: dashboard, settings, timetable, and the parent, student and teacher portals. Communications, counted as a seventh page when this was approved, keeps `auth.me()`, because it runs only inside submit handlers, not at page load;
  - dashboard counts use `count: 'exact', head: true` with the same filters;
  - read retries follow an allowlist. Up to 3 retries with backoff apply only to:
    - a fetch `TypeError` or network-error message;
    - offline;
    - timeouts;
    - gateway 502/503/504;
    - the pagination "Dataset changed" error.

    Every other read failure keeps main's single retry. That covers coded answers (SQLSTATE, `PGRST…`) and answers without a code (401, 403, 404, 409, 429, 500). Mutations are never retried;
  - remove `crm_get_today` from the poll list.
- **Deviation from the approved wording (PR #123):** the approved scope said read retries apply "never" to 4xx, PGRST or SQLSTATE errors. As implemented, those answers keep the one retry main already had: they retry exactly as on main, and only the allowlisted transient failures retry more. This is deliberate.
- **Invariants:**
  - the role used for page decisions is the stored profile role;
  - RLS applies unchanged, because head counts run under the same policies;
  - dashboard numbers are equal before and after on a fixture;
  - middleware is unchanged.
- **Acceptance:** dashboard loses the 2 sequential identity calls and 4 full-table reads, and the browser suites pass.
- **Measured (independent review of PR #123 at `a92c194`):** identity requests per page load go from 6–8 to 4. A second `GET /auth/v1/user` is present on both builds and is outside PB.
- **Rollback:** revert the PR.

### PR — region alignment

- **Scope:** `vercel.json` with `{"regions": ["dub1"]}` only.
- **Release verification:**
  - Supabase edge logs show worker calls from a Dublin colo instead of IAD;
  - reconciliation origin time drops;
  - cron, intake and email flows are healthy.
- **Rollback:** revert the PR, or set the region in the Vercel dashboard.

**Stop conditions for every outcome:** any authorization or RLS behavior change, any test weakened to pass, or any Production action without release approval.
