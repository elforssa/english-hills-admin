# Phase 11 — Meta Insights and director marketing analysis

> **Evidence boundary:** dated baseline/rollout statements below are historical, not a current deployment inventory. See [CURRENT_STATE](ai/CURRENT_STATE.md) and [active contracts](architecture/plans/README.md).

Code baseline: `4b25c93592f3b9944b73977819bbe13cb046b8f4`, feature branch `codex/director-receipt-deletion`. Local migrations 089 (storage/synchronization) and 090 (reporting). Production remains last confirmed 001–076; this phase does not deploy anything.

Migration 114 ([DGI-A-r2](architecture/plans/director-growth-intelligence.md), [ADR-006](architecture/decisions/ADR-006-meta-insights-live-sync.md)) adds live synchronisation: see [Live synchronisation](#live-synchronisation-dgi-a-migration-114). It is implemented, not deployed or activated; activation is a separately approved release sequence.

## Provider verification and activation boundary

Official Meta documentation was attempted on 24 September 2026 ([Insights](https://developers.facebook.com/docs/marketing-api/insights/), [ad account](https://developers.facebook.com/docs/marketing-api/reference/ad-account/), [Graph versions](https://developers.facebook.com/docs/graph-api/changelog/versions/), [authorization](https://developers.facebook.com/docs/marketing-api/get-started/authorization/), [rate limits](https://developers.facebook.com/docs/marketing-api/overview/rate-limiting/)): Marketing API Insights, parameters, async reports, Graph versions, authorization, rate limits, ad-account reference and pagination. Requests were unavailable or returned HTTP 429. No currently supported API version, permission set, account access or live behavior is certified. `v99.0` is deliberately a fake fixture version, never a deployment recommendation.

Provider assumptions tested with synthetic HTTP responses: fixed `graph.facebook.com` host; configured version/account; bearer token from a server environment reference; account `account_id`, `currency`, `timezone_name`; campaign/adset/ad identity, hierarchy, name, objective/status; Insights `level=ad`, daily `time_increment=1`, explicit `time_range`; decimal spend, impressions, reach, clicks, `inline_link_clicks`, actions; cursor pagination and bounded asynchronous status/result fixtures. The async branch accepts a fixture report ID; production async job creation/poll scheduling remains activation work.

There is still **no default fetch transport**. Since migration 114, live mode uses the platform `fetch` injected by the scheduler route, and mock mode uses the test double; neither falls back to the other, and a live run never accepts `mockFetch`. The adapter and worker reject browser execution. Tests inject stubs or a local HTTP stub server; no real token, account or Meta host is used anywhere in tests or CI. The endpoint `/api/internal/crm/insights/process` authenticates a director, checks same-origin, validates a bounded request and queues only (mock or live); it returns the run ID only. The worker and scheduler are server/test modules, not imported into any client bundle.

The DGI-A plan records the provider facts verified on 2026-10-09 and the open ones. Before live activation: verify a supported Graph version and current fields/semantics; required permissions (including whether `ads_read` and business access/app review are necessary); actual account ownership/access; token issuance, storage, rotation and least privilege; currency/timezone; async job creation, expiry, rate limiting and revision behavior. Separately authorize a reviewed live transport, production migration deployment, scheduler, monitoring, backoff policy and bounded historical backfill. No pg_cron assumption. Phase 10 lifecycle/Purchase delivery remains untouched and disabled.

## Synchronization model

`crm_meta_objects` holds **current** provider names, hierarchy, objective/status. It never rewrites protected acquisition snapshots. `crm_meta_sync_runs` stores bounded range, idempotency key, query version/config snapshot, attempts, lease and sanitized status. `crm_meta_daily_insights` is the refreshable ad/day snapshot, uniquely keyed by connection, date, level, ad ID, breakdown and query version.

One configured connection per ad account prevents duplicating spend when multiple Page connections exist. Since migration 114, account, currency, timezone and mode may be corrected only while the connection has no completed run and no pending or running run; after the first completed run they are immutable and moving them requires explicit reviewed reconciliation. This constraint does not change acquisition or lifecycle settings.

Directors configure **mock or live mode** via `crm_configure_insights(connection, expected_version, data)`. Required fields: mode, account_id, currency, timezone, api_version, secret_ref (`CRM_META_INSIGHTS_TOKEN_*`); optional enabled (default false), refresh_days (1–31; default 28 for live, 7 for mock) and refresh_interval_hours (1–24, default 6). No secret value is stored in the database or accepted from the browser.

`crm_request_insights_sync` requires a UUID request key. Explicit ranges are 1–31 account dates, no future dates. Omitting both dates uses the configured rolling refresh window ending today in the account timezone. This is a provider-revision window, **not** a claimed Meta attribution window. Replaying the same UUID/range returns the same run; different range conflicts. Overlapping active ranges serialize on the connection. Historical backfill is split into bounded requests.

Worker claims use SKIP LOCKED, a 10-minute fenced lease and at most three attempts. Mock failed/partial runs require director retry; live transient failures retry automatically with backoff (see [Retry](#retry-and-uncertain-outcomes)); expired claims are recoverable. Current enabled status is checked at claim and publish. A config snapshot freezes each run's identity. A rotated environment secret may retain the same reference.

The adapter buffers a bounded complete snapshot: at most 100 HTTP requests, 30 pages per edge, 5,000 daily rows, 10,000 objects and 4 MiB total provider response bytes, with a 10-second request timeout and redirect rejection. It reconstructs pagination URLs from the fixed host/path and cursor; it never follows arbitrary provider `next` URLs. Duplicate daily/object identities, malformed dates/numbers and account/currency/timezone mismatches fail closed. Errors expose codes, never raw provider responses/tokens. Async fixtures poll at most three times, then report `async_pending`; no unbounded waiting.

Only after all pages succeed does `crm_finish_insights_sync` atomically replace the complete range and upsert object metadata. A validation error rolls back every write. An empty completed snapshot clears vanished rows. Partial fetches never publish; prior completed snapshots remain visible. An uncertain publish response is left to lease recovery rather than overwritten with a fabricated failure/success. No CRM attribution/revenue/history is mutated.

## Live synchronisation (DGI-A, migration 114)

Migration `114_crm_meta_insights_live_sync.sql` replaces the 089/090 cumulative definitions of `crm_configure_insights`, `crm_request_insights_sync`, `crm_retry_insights_sync`, `crm_claim_insights_sync`, `crm_fail_insights_sync`, `crm_insights_diagnostics` and `crm_get_marketing_cohort` with the same signatures and grants, adds `crm_meta_sync_runs.next_attempt_at`, the service-role RPC `crm_enqueue_insights_refresh()`, the private invoker `crm_security.invoke_crm_insights_scheduler()` and the inactive `crm-insights-primary` job. No table, policy or grant is widened and no existing row is rewritten.

### Configuration and switches

- The token is a Vercel Production Secret under a `CRM_META_INSIGHTS_TOKEN_*` reference (planned: `CRM_META_INSIGHTS_TOKEN_EH_KAL`, a dedicated read-only `ads_read` identity). The worker reads `process.env[secret_ref]` at request time; Preview and Development have no value, so a live run there fails closed with `missing_secret`.
- Three independent switches, each fail-closed: the director's `insights_settings.enabled`, the `crm-insights-primary` job's active flag and the server gate `CRM_META_INSIGHTS_LIVE_ENABLED=true`. The secret is a precondition, not a switch. Switching the director switch off stops claims and publishes and keeps published snapshots visible.
- Identity rule (D2): see [Synchronization model](#synchronization-model). A director retry is also refused when the run's frozen account, currency, timezone or mode no longer match the connection, so a queued run never outlives an identity or mode change.
- `crm_insights_diagnostics` adds per connection `mode`, `refresh_days`, `refresh_interval_hours`, `api_version`, `secret_ref` (the non-secret reference name) and `last_completed_at`, and per run `next_attempt_at` and `mode`. `crm_get_marketing_cohort` reports `live_sync_enabled` as `mode = 'live'` and enabled for the selected connection.

### Scheduler

- `GET /api/cron/crm-insights` (Node runtime, 60 s) authenticates the dedicated bearer `CRM_META_INSIGHTS_SCHEDULER_TOKEN` and answers `Cache-Control: no-store` with counts only (`enqueued`, `processed`, `completed`, `failed`, `deferred`), never run IDs, account IDs, provider data or error text. With the server gate closed it authenticates and answers, but enqueues, claims and fetches nothing.
- Per tick: `crm_enqueue_insights_refresh()`, then claims while at least 45 s of the 55 s budget remain, at most five runs; each fetch keeps a 5 s publish margin. In practice one run is processed per 30-minute tick (two when the first finishes within about 10 s), so N backfill blocks take roughly N × 30 minutes. A refresh or a 31-day block costs about 4 to 8 Graph calls (account metadata, three object edges, one or more insight pages); each run is bounded to 100.
- `crm_enqueue_insights_refresh()` locks each live, enabled connection row like `crm_request_insights_sync`, then inserts the rolling window `[today − refresh_days + 1, today]` in the account timezone when no run was created within `refresh_interval_hours` and no pending or running run overlaps it. Any run counts, so a backfill submission also postpones the next automatic refresh by up to one interval. Mock connections are never auto-enqueued.
- pg_cron `crm-insights-primary` runs `*/30 * * * *` and calls the private invoker, which reads Vault `crm_insights_scheduler_url` and `crm_insights_scheduler_token` and accepts only exactly `https://admin.english-hills.com/api/cron/crm-insights`. The job is created inactive; activation is a separately approved release step. There is no GitHub Actions backup and no Vercel Cron for this path. See also the [intake scheduler](crm-intake-scheduler.md).

### Retry and uncertain outcomes

- A transient live failure (`rate_limit`, `provider_unavailable`, `network`, `timeout`) returns the run to `pending` with its error code and processed-row count visible and `next_attempt_at` 30 minutes later after the first attempt and 2 hours later after the second; the third attempt is terminal. Every other code (`provider_auth`, `invalid_data`, `limit_exceeded`, `missing_secret`, `live_not_available`, `async_pending`, `storage_unavailable`) is terminal at once. Mock runs keep the 089 contract (every failure terminal).
- Claims honour `next_attempt_at` on both the pending path and the expired-lease reclaim path. A director retry (failed/partial, fewer than three attempts) resets `next_attempt_at` to now.
- An uncertain publish (the finish call raised or timed out) writes no status; the lease expires and a later claim re-fetches and replaces the full range idempotently.

### Live transport

Fixed `graph.facebook.com` host and paths, bearer header only (never an `access_token` parameter), `redirect: 'error'`, `cache: 'no-store'`, 10 s per request and the invocation deadline. Live mode never creates or polls async report jobs: a `report_run_id` on a `GET` fails the run with `invalid_data`; the director splits a range that is too large. Graph error codes 4, 17, 80000 and 613 or HTTP 429 map to `rate_limit`; code 190 or HTTP 401/403 to `provider_auth`; HTTP 5xx to `provider_unavailable`; a redirect to `invalid_data`. Errors carry codes only, never response bodies. The account metadata check (`account_id`, `currency`, `timezone_name`) still runs before any publish.

### Director page

`/crm/analytics` (director-only) shows live sync on/off, the last successful refresh in the account timezone and the existing pending/failed warning. When spend and revenue currencies differ, the ROAS card and column are replaced by one line: spend is in the account currency, collections in MAD, and no currency conversion is applied. Two collapsed panels, **Connexion Meta Insights** (configuration and live switch; identity fields locked after the first published run or while a run is queued) and **Synchronisation** (latest 25 runs with a French label per failure code, retry, manual refresh, and a backfill form that submits one request per block of at most 31 account dates, sequentially, for at most 366 days).

### Tests and CI

`npm run test:crm-insights` (adapter, worker, live transport, real-fetch local stub server and scheduler) runs in the app job. The local-database job runs the stateful 113 → 114 upgrade rehearsal, the rollback-only Phase 11 SQL suite, the Phase 11 concurrency script (including enqueue-versus-request races), the Phase 12 nine-identity security matrix (now covering every Insights RPC) and the Phase 11 browser suite. The Phase 11 scripts accept a local `codex/` or `claude/` branch or a GitHub Actions pull request.

## Reporting contract

`crm_get_marketing_cohort` is a director-only, fixed-shape JSON RPC with explicit metrics. Inputs: acquisition from/to (1–366 dates), optional outcome cutoff date, one account/connection, grouping campaign/adset/ad/source, optional campaign/adset/ad IDs and channel, limit 1–100 and offset. Results use deterministic spend/name/identity ordering. `/crm/analytics` uses 50-row pages and campaign → ensemble → annonce drilldown.

V1 is **acquisition cohort**, never event-period reporting. Example: January acquisitions and January advertising spend, with outcomes/collections through a later cutoff. Default cutoff is the reporting call's current timestamp; a date cutoff means the end of that date in the selected account timezone, capped at now. The exact effective timestamp is returned and shown. Event-period conversions/receipts need a separate future contract, not a reinterpretation of this RPC.

Acquisition date is `first_submission.occurred_at` converted to the selected account timezone. Without an account, use Africa/Casablanca and no spend. Account spend dates are already provider account dates. Center operational scheduling remains Africa/Casablanca.

- Leads: distinct canonical, non-merged opportunities whose frozen first submission falls in the range and cutoff; not submission count.
- Engaged / qualified: distinct opportunities with the corresponding trusted activity on or before cutoff, regardless of repeated qualification/history edits.
- Tests booked / attended / results: distinct linked placement-test IDs with the corresponding milestone by cutoff.
- Converted: the opportunity's trusted `conversion_activity_id`, pointing to `lead_converted`, by cutoff. Existing review flags are surfaced. No automatic un-conversion or new correction policy is invented.
- Revenue: signed `crm_revenue_entries.amount_delta`, with lead ID **and frozen first-touch submission ID**, by `effective_at` cutoff. MAD collected receipts and reversals, never charges, projected tuition or Meta actions.
- Spend: additive ad-level daily spend from completed published runs. Campaign/adset/source values group those rows only. No mixed reporting levels.
- Impressions, clicks and link clicks: sums of reported ad/day counters; NULL when absent, not unique-person metrics. Reach is deliberately NULL, never summed and called unique campaign reach. Provider actions are stored in an allowlisted shape only; they do not drive CRM outcomes.

CRM outcomes are aggregated separately from spend, then the aggregates are joined. This prevents submission/lead × daily-spend fan-out. Current Meta names are preferred, historical acquisition names remain available separately, and numeric identity is a fallback. Objective is provider metadata only and does not control metric eligibility.

## Attribution and scope

Trusted joins require a Meta first submission, protected provider=meta attribution, matching form-mapping connection and stored advertising ID for the selected grouping. No joins by campaign name, UTMs, fbclid/fbc/fbp or current object guessing. Later website/Meta touches never replace first touch.

Unknown Meta, website and manual buckets remain visible at the unfiltered level; they never inherit spend. ID filters deliberately narrow to identifiable Meta objects, so unknown rows cannot satisfy those filters. Website observed attribution is kept as a separate channel; V1 does not match website campaigns to Meta spend. Manual includes phone/referral sources. Awareness campaigns with spend and zero CRM leads remain valid rows.

The selected account limits Meta leads/spend. Website/manual opportunities are center-wide and are described as such in the UI. With no configured account, all CRM opportunities can be inspected but no spend or cost ratios are available. There is no multi-account blended currency total.

## Ratios and availability

For each trusted Meta row:

- CPL = selected spend / distinct acquired opportunities.
- CPQL = selected spend / distinct qualified opportunities.
- CAC = selected spend / distinct trusted converted opportunities.
- ROAS = signed collected attributed revenue / selected spend, only when spend currency is MAD.

Summary CRM counts/revenue include all selected sources. Summary **Meta ratios use only Meta-attributed denominators/revenue**; these exact denominator counts are returned and shown next to the cards. Unknown-source outcomes are never used to claim Meta performance.

Zero denominator → NULL / `—`. Complete zero spend is genuinely 0; zero-spend ROAS remains NULL. Missing/incomplete coverage → spend and ratios NULL, not misleading zero. Currency mismatch preserves spend in account currency and revenue in MAD but suppresses ROAS; no FX conversion.

Every selected date must be covered by a completed run before spend is considered complete. The UI displays the last completed overlap timestamp and warns for pending/running or unresolved failed/partial refreshes. A later completed refresh clears an earlier warning only for the dates it actually covers. This does not certify spend is recent: the timestamp remains explicit.

## Security and validation

Middleware, client guard, login destination and navigation enforce director-only analytics, including nested paths. The database independently checks the stored profile role; forged frontend roles cannot authorize reporting/configuration/queue/diagnostics. Admin/receptionist/teacher/parent/student/pending are denied. New tables have RLS and no direct anon/authenticated/service grants. Service-role worker functions alone can publish snapshots; authenticated directors use narrow reporting/configuration RPCs. No protected attribution, token or raw payload is returned through the operational UI.

Tests: Phase11 provider/unit, rollback-only SQL (including real financial/placement flows), concurrent queue/claim/retry fencing, and local browser desktop/mobile/director/non-director checks; since migration 114 they also run in CI (see [Tests and CI](#tests-and-ci)). Prior phase SQL/concurrency/browser suites, enrollment, placement, finance, Batch2, middleware, navigation, npm test, lint and build are required before commit. Fixture-only trigger controls are transaction-scoped or restored in cleanup; no reset or production access is used.
