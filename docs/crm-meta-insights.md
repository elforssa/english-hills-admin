# Phase 11 — Meta Insights and director marketing analysis

Code baseline: `4b25c93592f3b9944b73977819bbe13cb046b8f4`, feature branch `codex/director-receipt-deletion`. Local migrations 089 (storage/synchronization) and 090 (reporting). Production remains last confirmed 001–076; this phase does not deploy anything.

## Provider verification and activation boundary

Official Meta documentation was attempted on 24 September 2026 ([Insights](https://developers.facebook.com/docs/marketing-api/insights/), [ad account](https://developers.facebook.com/docs/marketing-api/reference/ad-account/), [Graph versions](https://developers.facebook.com/docs/graph-api/changelog/versions/), [authorization](https://developers.facebook.com/docs/marketing-api/get-started/authorization/), [rate limits](https://developers.facebook.com/docs/marketing-api/overview/rate-limiting/)): Marketing API Insights, parameters, async reports, Graph versions, authorization, rate limits, ad-account reference and pagination. Requests were unavailable or returned HTTP 429. No currently supported API version, permission set, account access or live behavior is certified. `v99.0` is deliberately a fake fixture version, never a deployment recommendation.

Provider assumptions tested with synthetic HTTP responses: fixed `graph.facebook.com` host; configured version/account; bearer token from a server environment reference; account `account_id`, `currency`, `timezone_name`; campaign/adset/ad identity, hierarchy, name, objective/status; Insights `level=ad`, daily `time_increment=1`, explicit `time_range`; decimal spend, impressions, reach, clicks, `inline_link_clicks`, actions; cursor pagination and bounded asynchronous status/result fixtures. The async branch accepts a fixture report ID; production async job creation/poll scheduling remains activation work.

There is **no default fetch transport**, live-mode configuration, live processing endpoint or scheduler. The adapter and worker reject browser execution. Tests explicitly inject `mockFetch`; no real token/account is used. The endpoint `/api/internal/crm/insights/process` authenticates a director, checks same-origin, validates a bounded request and queues only. The worker is a server/test module, not imported into any client bundle.

Before live activation: verify a supported Graph version and current fields/semantics; required permissions (including whether `ads_read` and business access/app review are necessary); actual account ownership/access; token issuance, storage, rotation and least privilege; currency/timezone; async job creation, expiry, rate limiting and revision behavior. Separately authorize a reviewed live transport, production migration deployment, scheduler, monitoring, backoff policy and bounded historical backfill. No pg_cron assumption. Phase 10 lifecycle/Purchase delivery remains untouched and disabled.

## Synchronization model

`crm_meta_objects` holds **current** provider names, hierarchy, objective/status. It never rewrites protected acquisition snapshots. `crm_meta_sync_runs` stores bounded range, idempotency key, query version/config snapshot, attempts, lease and sanitized status. `crm_meta_daily_insights` is the refreshable ad/day snapshot, uniquely keyed by connection, date, level, ad ID, breakdown and query version.

One configured connection per ad account prevents duplicating spend when multiple Page connections exist. Account, currency and timezone are immutable after Insights configuration; moving them requires explicit reviewed reconciliation. This constraint does not change acquisition or lifecycle settings.

Directors configure **mock mode only** via `crm_configure_insights(connection, expected_version, data)`. Required fields: mode, account_id, currency, timezone, api_version, secret_ref (`CRM_META_INSIGHTS_TOKEN_*`); optional enabled (default false), refresh_days (default 7; 1–31). No secret value is stored in the database or accepted from the browser.

`crm_request_insights_sync` requires a UUID request key. Explicit ranges are 1–31 account dates, no future dates. Omitting both dates uses the configured rolling refresh window ending today in the account timezone. This is a provider-revision window, **not** a claimed Meta attribution window. Replaying the same UUID/range returns the same run; different range conflicts. Overlapping active ranges serialize on the connection. Historical backfill is split into bounded requests.

Worker claims use SKIP LOCKED, a 10-minute fenced lease and at most three attempts. Failed/partial runs require director retry; expired claims are recoverable. Current enabled status is checked at claim and publish. A config snapshot freezes each run's identity. A rotated environment secret may retain the same reference.

The adapter buffers a bounded complete snapshot: at most 100 HTTP requests, 30 pages per edge, 5,000 daily rows, 10,000 objects and 4 MiB total provider response bytes, with a 10-second request timeout and redirect rejection. It reconstructs pagination URLs from the fixed host/path and cursor; it never follows arbitrary provider `next` URLs. Duplicate daily/object identities, malformed dates/numbers and account/currency/timezone mismatches fail closed. Errors expose codes, never raw provider responses/tokens. Async fixtures poll at most three times, then report `async_pending`; no unbounded waiting.

Only after all pages succeed does `crm_finish_insights_sync` atomically replace the complete range and upsert object metadata. A validation error rolls back every write. An empty completed snapshot clears vanished rows. Partial fetches never publish; prior completed snapshots remain visible. An uncertain publish response is left to lease recovery rather than overwritten with a fabricated failure/success. No CRM attribution/revenue/history is mutated.

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

Tests: Phase11 provider/unit, rollback-only SQL (including real financial/placement flows), concurrent queue/claim/retry fencing, and local browser desktop/mobile/director/non-director checks. Prior phase SQL/concurrency/browser suites, enrollment, placement, finance, Batch2, middleware, navigation, npm test, lint and build are required before commit. Fixture-only trigger controls are transaction-scoped or restored in cleanup; no reset or production access is used.
