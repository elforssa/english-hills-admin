# Performance audit evidence — 2026-10-08

Read-only audit for the [performance plan](../plans/performance-r1.md). Baseline: `origin/main` `857b159746b78233578790bdb999878cd113e088`. The recorded deployed source at the time is in [CURRENT_STATE](../../ai/CURRENT_STATE.md).

**Method and limits.**

- **Production:** only read-only metadata and statistics were used: project metadata, Supabase edge and Postgres logs, performance advisors, `pg_stat_statements`, `pg_stat_activity`, catalog definitions of policies and functions, and aggregate row counts. No customer rows were read and nothing was written.
- **Local:** measurements used local Supabase, synthetic users that were removed afterwards, and `next start`.
- **Throttling:** Chromium DevTools network emulation covers latency and bandwidth, not packet loss.
- **Vercel:** no runtime logs were available to the audit. The function region is inferred from Supabase edge logs.

## Platform facts

| Fact | Evidence |
| --- | --- |
| Supabase project `hopcezradkhrixwwswxn` runs in **eu-west-1** (Ireland), Postgres 17. | Project metadata. No repository document names Frankfurt or eu-central-1. |
| The database is 29 MB with `max_connections` 60. It holds 3 profiles, 213 students, 277 receipts and 63 enrollments. | Catalog, aggregate counts. |
| Vercel **Node functions call Supabase from IAD** (US East, Vercel's default `iad1`). Middleware runs at the edge nearest the user (LHR, SIN observed). | Edge-log Cloudflare colo by user agent. The repository has no `vercel.json` and no `preferredRegion`. |
| Browser calls from Morocco (MAD colo) take about 40–110 ms at origin per Supabase call. The higher averages in a mixed 24 h sample come from HKG/SIN browsers and IAD functions. | Edge logs, 24 h. |

## Page-load critical path

Every protected page is a static client page. Middleware (edge) runs `auth.getUser` and then reads `profiles.role` before the page is served. The browser then runs:

1. `getUser` from `loadSession()`. It is superseded when `onAuthStateChange('SIGNED_IN')` starts a second `loadSession`, so its result is discarded.
2. `getUser` again.
3. `profiles select('*')`.
4. `apply_pending_role` RPC.

These four calls are strictly sequential, and the `(admin)` layout renders nothing until they finish. Seven pages then resolve identity a second time with `auth.me()`: dashboard, settings, communications, timetable and the three portals.

Local baseline on a cold cache, median of 3 runs. *center* is 250 ms RTT at 2/1 Mbit/s; *bad* is 600 ms at 0.75/0.25 Mbit/s.

| Route | lan | center | bad | Browser calls before heading | JS transferred |
| --- | --- | --- | --- | --- | --- |
| /crm/leads | 447 ms | 4.10 s | 8.97 s | 4 session + 4 data | 404 KB |
| /crm/today | 425 ms | 4.09 s | 8.97 s | 4 + 3 | 404 KB |
| /dashboard | 932 ms | 4.09 s | 9.46 s | 4 + `auth.me()` 2 + 8 | 797 KB |
| /students | 457 ms | 3.59 s | 8.47 s | 4 + 1 | 541 KB |
| /finance | 406 ms | 3.59 s | 7.97 s | 4 + 3 | 656 KB |
| /receipts | 413 ms | 3.60 s | 8.96 s | 4 + 1 | 622 KB |

On *center*, the first Supabase request starts about 2.0–2.8 s after navigation. That time is document and JS download. The session chain then adds about 1.0–1.3 s.

**Resilience**, with sustained failures injected locally:

| Failure | Observed result |
| --- | --- |
| `auth/v1/user` fails | A signed-in user is redirected to `/login`. |
| `profiles` read fails | The role resolves as `pending`, and the user is redirected to `/unauthorized`. |
| `apply_pending_role` fails | The page renders normally. |
| Offline navigation | Browser `net::ERR_INTERNET_DISCONNECTED`; no application code runs. |

## Bundle

Measured with `npm run perf:bundle`; first-load JS is gzip-compressed and reported in decimal kB.

- **Shared by every route: 185.2 kB.** One 127 kB chunk of it contains the Sentry SDK, although tracing is disabled.
- **jsPDF, html2canvas and canvg add about 101 kB** to `/receipts` (414.9 kB), `/receipts/[id]/print` (409.7 kB), `/parent-portal` (440.2 kB) and `/student-portal` (439.1 kB).
- **recharts is confined to `/reports`.**
- **CRM:** `/crm/leads` and `/crm/today` load 372 kB.
- **Fonts and images:** fonts are the system stack and `public/` is 84 KB.

## Database

- **Students read cost:** `students.*` ordered by name averages **516 ms** in Postgres (247 calls, max 1.06 s) for 213 rows.
  - Seven permissive SELECT policies apply, ORed together.
  - **Dominant cost (established by the isolated experiment below):** `teacher_can_see_student(id)` runs per row for **every** role. It is SECURITY DEFINER, so it is never inlined, and every branch requires `get_my_role() = 'teacher'`. Five other policies call `teacher_can_access_student_group(...)` the same way.
  - **Minor cost:** the policies also call `get_my_role()` per row, unwrapped.
- **Unwrapped helpers are widespread:** 144 of 163 public policies reference `get_my_role()`, none wrapped in a subselect (125 in `USING`). The Supabase advisor flags only the 10 direct `auth.uid()` uses.
- **Isolated experiment.** It ran in a throwaway container: the same Postgres 17.6.1.155 image as Production, migrations 001–112, 5,000 synthetic students, one rolled-back transaction.
  - Wrapping the helpers as `(select f())` alone gave no consistent speed-up.
  - Adding a `(select get_my_role()) = 'teacher'` guard in front of the six teacher-helper policies cut the non-teacher students read from about 3.8 s to about 4 ms.
  - There were 0 visible-row differences over 476 role × table comparisons.
  - This is the RLS role-evaluation migration architecture (separate PR #124; the number is assigned at implementation, provisionally 115).
- **Advisor counts (2026-10-08):**
  - unindexed foreign keys: 102;
  - `auth_rls_initplan`: 10;
  - multiple permissive policies: 165;
  - unused indexes: 42;
  - duplicate index: 1 (`crm_submissions`: `crm_intake_review` and `crm_submissions_review_idx`);
  - no primary key: 2 (`rate_limits`, `anon_rate_limits`).
- **`apply_pending_role` runs on every page load.** It is a write transaction that row-locks the global `role_security.director_guard` singleton and the caller's profile even when nothing is pending, because the pending-role rule for every role is evaluated inside it. It averages 8.5 ms in Postgres.
- **CRM polling** (60 s, visible tab only) is negligible: 15 `crm_get_opportunities` calls in 24 h. The poll list also names `crm_get_today`, which no component reads.

## Background jobs

- **`crm-intake-primary`** runs every 5 minutes, about 288 times a day. `crm-lifecycle-primary` is inactive.
- **Reconciliation claim (`crm_claim_meta_reconciliation`):**
  - about 26 ms mean execution in Postgres;
  - 315 ms upstream at the API gateway;
  - **812 ms at origin** when called from IAD.
- **Ingestion claim:** 50 ms upstream and 361 ms at origin.

The transatlantic leg (IAD ↔ eu-west-1) accounts for roughly 400–500 ms of each worker call. The remaining gap between gateway and Postgres time for the reconciliation claim is unexplained and will be re-measured after the region change.

## 391M `service_role` `set_config` calls

`pg_stat_statements` (reset 2026-08-22) attributes 391,321,445 calls to PostgREST's per-request preamble under `service_role`. No `service_role` statement has a comparable count, and PostgREST `BEGIN` ran about 7.5k times.

**Root cause: a stuck in-process retry loop, not client traffic.**

1. **Rate and window.** Postgres logs show "Stale reconciliation lease" at a constant **≈100 per second**, 359,960–359,990 per hour, from at least 2026-09-30 10:00 UTC (the oldest retained log hour) to **2026-10-02 05:16 UTC**. Edge and PostgREST logs show only hundreds of requests per day in the same window.
2. **Cause.** The pre-105 reconciliation functions raised that error with SQLSTATE `40001`. PostgREST retries a transaction that fails with `40001` (serialization_failure) inside the server. A deterministic `40001` therefore never succeeds and loops after the client has gone.
3. **Local reproduction (PostgREST 14.5).** A temporary function raising `40001`, called once over HTTP, returned no response within 6 s. It produced about 8,300 preambles, still increasing after the client disconnected, until the function was dropped and PostgREST was restarted.
4. **Arithmetic.** About 100 per second over the roughly 41 days between the statistics reset and the end of the loop accounts for the observed total.

[Migration 105](../../../supabase/migrations/105_crm_meta_reconciliation_business_conflicts.sql) replaced those raises with `PT409`. Current growth is about 12 calls in 22 minutes, which matches normal worker traffic, and Postgres logs since 2026-10-02 hold about 480–680 lines a day with no repeating conflict error. What stopped the loop at 05:16 UTC (before 105 was applied at 08:39 UTC) is not established. A PostgREST restart would explain it.

**Latent risk, a separate outcome.** About 40 live functions in `public` and `crm_security` still raise `40001` deterministically for stale-version or conflict conditions. Examples:

- `save_receptionist_student`
- `assign_receptionist_student_group`
- `create_charge_payment`
- `crm_resolve_meta_intake`
- `crm_security.lock_enrollment_intent` (reached through enrollment and payment)
- `crm_security.command` (open-task checks)

Reached through PostgREST, such a request would never return and would loop in the database until PostgREST restarts. No such loop has occurred since 2026-10-02. This finding is recorded for an owner decision and is outside the performance outcomes.
