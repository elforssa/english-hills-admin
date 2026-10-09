# Director CRM & Growth Intelligence — Outcome A: live Meta ad spend in the director report

Revision **DGI-A-r1**, 2026-10-09. **Tier 3** (external provider API, secrets and credentials, a scheduler, Production activation). **Status: PROPOSED — architecture only; nothing is approved, implemented, merged, deployed or activated by this document.** Owner: Maroine. Baseline `origin/main` at authoring: `b141183d67c8a541f6b1c099f8a6f3a6b4cf3b9f` (PR #119 merge). Architecture branch: `claude/director-growth-intelligence-meta-665c6f`.

Related authority: [AGENTS](../../../AGENTS.md), [CURRENT_STATE](../../ai/CURRENT_STATE.md), [OWNER_DECISIONS](../../ai/OWNER_DECISIONS.md), [Insights contract](../../crm-meta-insights.md), [intake scheduler](../../crm-intake-scheduler.md), [S1 credential architecture](crm-meta-lifecycle-credential-simplification.md), [S1 Gate-B runbook](crm-h3-s1-gate-b-credential-runbook.md), [ADR-006 (proposed)](../decisions/ADR-006-meta-insights-live-sync.md).

# Owner summary

## What will change

The existing director report at `/crm/analytics` will show real Meta advertising spend for the configured ad account, refreshed automatically from the Meta Marketing API, next to the cohort counts it already shows. For each campaign, ad set, ad and for the summary, the page will show spend, cost per lead (CPL), cost per qualified lead (CPQL) and cost per enrolled student (CAC) in the account currency (USD). The report keeps its current acquisition-cohort meaning.

To do that, the repository gains four things it does not have today: a live transport to Meta (the current adapter only accepts a test double), a scheduled refresh (a protected endpoint plus a Supabase Cron job, created inactive), failure visibility and bounded retries, and a small director-only configuration and synchronisation panel on the same page. One forward migration extends the migration-089 Insights functions; the tables already exist.

## What staff/users will be able to do

- **Director:** configure the ad account connection once (account ID, currency, timezone, API version, secret reference name, refresh window), switch live sync on or off, see the last successful refresh and any failed or pending refresh, retry an eligible failed refresh, request a manual refresh, and request a bounded historical backfill (one request per 31-day block) for the Rentrée campaign period.
- **Everyone else:** nothing changes. Receptionist, admin, teacher, parent, student and pending roles keep no access to the report, the configuration, the synchronisation queue, the diagnostics or the new scheduler endpoint.

## What remains restricted

- The Meta token is a server-side Vercel Production Secret under the existing `CRM_META_INSIGHTS_TOKEN_*` reference model. It never enters the database, the browser, logs, error messages, the diagnostics response or this repository. The database stores only the reference name.
- No Production action is authorised by this plan: no migration, no Vercel secret, no Vault value, no cron activation, no Meta configuration and no Production read. Each is a separately approved release step (see [Rollout](#rollout-and-recovery-strategy)).
- ROAS stays hidden while spend is USD and revenue is MAD; no currency conversion is applied or implied.
- No funnel view, program breakdown, follow-up health, source configuration screens, website-to-Meta spend matching, lifecycle activation (H3/H4) or receptionist access change.
- The manual spend import is a fallback only; its trigger is described, it is not designed here.

## UI impact

One page, `/crm/analytics`, director-only as today:

- the hard-coded sentence "Synchronisation réelle désactivée · Environnement de simulation." is replaced by the real state (live sync on/off, last successful refresh in the account timezone, pending or failed refreshes);
- a collapsible **Connexion Meta Insights** panel (configuration and the live switch) and a **Synchronisation** panel (recent refreshes with a French label per failure code, retry, manual refresh, historical backfill);
- when spend and revenue currencies differ, the ROAS card and column are replaced by one explanatory line instead of showing "—";
- uncovered dates keep showing the existing warning and "—", never zero.

No new page, no sidebar change, no receptionist UI change.

## Database impact

One forward migration, **next free number at implementation** (the next number is contested by open PRs #121 and #124 and Premium Release B). Additive only:

- `crm_meta_sync_runs` gains `next_attempt_at` (default `now()`), used for bounded automatic retry of transient failures.
- `crm_configure_insights`, `crm_claim_insights_sync`, `crm_fail_insights_sync`, `crm_insights_diagnostics` and `crm_get_marketing_cohort` are replaced with their cumulative definitions extended for `mode = 'live'`; grants and signatures are unchanged.
- New service-role RPC `crm_enqueue_insights_refresh()` creates the rolling refresh run when one is due.
- New private invoker `crm_security.invoke_crm_insights_scheduler()` (Vault-driven, like migrations 095 and 100) and the `crm-insights-primary` pg_cron job, **created inactive**.

No table is dropped, no RLS or grant is widened, no existing row is rewritten.

## Important security decisions

- **Dedicated read-only credential (recommended, owner decision 1).** A separate Meta System User assigned only the KAL ad account with the "View performance" task, issuing one token with `ads_read` only, stored as `CRM_META_INSIGHTS_TOKEN_EH_KAL`. The lifecycle credential `CRM_META_LIFECYCLE_TOKEN_EH_R4` is not reused, because S1 forbids that identity any unrelated ad-account access.
- **Same credential procedure.** The S1 Gate-B runbook is reused with the Insights identities and scope substituted: human-only issuance, one bounded validation, direct Vercel Production Secret storage, metadata-only verification, no AI handling of the value.
- **Three independent switches.** The director's database switch (`insights_settings.enabled`), the pg_cron job's active flag (operator) and the presence of the Vercel secret (operator). Any one of them off means no Meta call is made and nothing is published. There is no automatic activation from code presence.
- **Director-only at every layer**, as today: middleware and the client guard for the route, stored-profile role in the API handler, `crm_security.require_reader(true)` in every director RPC, service-role-only worker RPCs, RLS with no direct grants on the three tables, a dedicated bearer for the scheduler endpoint.
- **Fail closed.** A failed or partial fetch never publishes; a prior completed snapshot stays visible; an uncertain publish is recovered by lease expiry and an idempotent full-range replace, never by fabricating success or failure.

## Risks / owner review points

1. **Meta access may stall.** The existing C2 app runs in the Marketing API "Limited access" tier, which Meta documents as "for development only". Reading your own ad account with standard-access `ads_read` is documented as sufficient, and Business apps get standard access automatically, but this plan could not confirm from documentation that an own-business reporting integration is acceptable at that tier indefinitely, nor whether `ads_read` is offered in the C2 token chooser. If a token cannot be issued and validated, the fallback trigger in [Scope](#scope-and-non-goals) applies.
2. **Unconfirmed account facts.** KAL's ad account ID, currency (USD stated), timezone and whether existing Meta leads carry that account's ad IDs are not verified. The proposed Production reads resolve this before activation.
3. **Immutable identity after first publish.** Account, currency and timezone become immutable once a completed live run exists. Before that, the director can correct them, and the adapter rejects a mismatch with Meta's own account metadata, so a wrong first configuration cannot publish. After that, a correction is a separately approved reconciliation.
4. **Today's figures move.** Meta refreshes insights about every 15 minutes and finalises them after 28 days; the rolling window re-reads recent days, and the page shows the last refresh time, but a date is "covered" as soon as one completed run includes it.
5. **No GitHub backup for this scheduler.** Unlike intake, a missed tick only delays spend; the director can request a manual refresh. The job is inactive until a separate activation.
6. **Rate limits are generous but shared.** The Insights budget is per ad account and shared with the lifecycle delivery path only if both use the same app. A refresh costs roughly 4 to 8 calls; the plan bounds each run to 100 calls.

## Baseline and evidence limits

- Code, cumulative migrations 001–113 and the local database (ledger at 113) were inspected on 2026-10-09. The local database has **zero** Insights configurations, runs and snapshots; `crm-intake-primary` is active and `crm-lifecycle-primary` inactive, as the migrations define. There is no seed file; migrations and seed data create **no** Insights connection in any mode.
- **No Production or Meta read was performed.** The ad account name (KAL), business portfolio (Glory Lot), currency (USD) and the absence of an Insights-capable token are owner statements, listed as unconfirmed. The Gate-B closeout confirms Glory Lot is business `1741597822557523`, which is consistent with the owner's statement but does not identify the ad account.
- Meta documentation was read on 2026-10-09 (see [Provider facts](#provider-facts-verified-2026-10-09)). Two reference pages (Insights parameters, System Users guide) returned 404 and are recorded as unconfirmed.
- The open performance PRs #120 to #124 were not touched. PR #120 adds `vercel.json`; this plan does not use Vercel Cron and does not touch that file. PRs #121 and #124 edit the plans index; this plan adds one row there.

## Verified current state

| Component | Exists today | Evidence | Missing for live use |
| --- | --- | --- | --- |
| Storage | `crm_meta_objects`, `crm_meta_sync_runs`, `crm_meta_daily_insights`; RLS on, no direct grants; one configured connection per `account_id` (unique index) | [089](../../../supabase/migrations/089_crm_meta_insights_and_reporting.sql) | `next_attempt_at` for backoff |
| Configuration RPC | `crm_configure_insights` accepts **`mode = 'mock'` only**; account/currency/timezone immutable once set; `secret_ref` must match `^CRM_META_INSIGHTS_TOKEN_[A-Z0-9_]{1,64}$`; returns `live_available: false` | 089 | `mode = 'live'`; bounded identity correction before first publish |
| Queue RPCs | `crm_request_insights_sync` (director, UUID request key, 1–31 non-future account dates, overlap serialisation), `crm_retry_insights_sync` (failed/partial, attempts < 3), `crm_claim_insights_sync` (service role, SKIP LOCKED, 10-minute fenced lease, **claims only `mode = 'mock'`**), `crm_finish_insights_sync` (atomic full-range replace, validates account/currency/timezone against the frozen `config_snapshot`), `crm_fail_insights_sync` (closed error-code list) | 089; [SQL test](../../../scripts/test-crm-phase11.sql); [concurrency test](../../../scripts/test-crm-phase11-concurrency.py) | live claims; automatic transient retry; auto-enqueue of the rolling window |
| Diagnostics RPC | `crm_insights_diagnostics` returns connections and the 25 latest runs; `live_available: false` | 089 | mode, refresh settings, `next_attempt_at` |
| Reporting RPC | `crm_get_marketing_cohort`: director-only acquisition cohort; spend only when every selected date is covered by a completed run; `currency_mismatch` true when spend currency ≠ MAD; ROAS only when spend currency is MAD; `live_sync_enabled` **hard-coded false**; `reach` null | [090](../../../supabase/migrations/090_crm_director_reporting.sql) | read the live flag from the configuration |
| Adapter | `fetchInsightsFixture`: fixed `graph.facebook.com` host, bearer header, `redirect: 'error'`, 10 s per request, ≤ 100 requests, ≤ 30 pages per edge, ≤ 5,000 rows, ≤ 10,000 objects, ≤ 4 MiB, cursor-only pagination, account metadata check, duplicate/malformed rejection, async poll ≤ 3, sanitised error codes. **Requires `mockFetch` and `mode === 'mock'`; no default transport.** | [adapter.mjs](../../../src/lib/crm/insights/adapter.mjs) | injected real `fetch`, invocation deadline, `cache: 'no-store'` |
| Worker | `processInsightsFixture`: claim → resolve `env[secret_ref]` → fetch → finish; unknown outcome left to lease; **requires `mockFetch`** | [worker.mjs](../../../src/lib/crm/insights/worker.mjs) | live mode; scheduler loop |
| Processing endpoint | `POST /api/internal/crm/insights/process`: director + same origin, ≤ 1 KiB body, **queues only**, returns `live_sync_enabled: false` | [route.js](../../../src/app/api/internal/crm/insights/process/route.js) | — (kept) |
| Scheduler | none for Insights. Intake: pg_cron `crm-intake-primary` → Vault URL/bearer → `pg_net` → `GET /api/cron/crm-intake` (bearer `CRM_INTAKE_SCHEDULER_TOKEN`), GitHub Actions backup. Lifecycle: same pattern, job created inactive. | [095](../../../supabase/migrations/095_crm_intake_pg_cron_scheduler.sql), [100](../../../supabase/migrations/100_crm_lifecycle_scheduler.sql), [scheduler.mjs](../../../src/lib/crm/intake/scheduler.mjs) | `crm-insights-primary`, `/api/cron/crm-insights` |
| UI | [MarketingAnalytics.jsx](../../../src/components/crm/MarketingAnalytics.jsx) reads diagnostics and the cohort; no configuration UI, no sync panel, no backfill request; `crm_configure_insights` has **no caller in `src/`** (only a runbook snippet) | component; [page](../../../src/app/(admin)/crm/analytics/page.jsx) | panels above |
| Authorisation | route: middleware, `ProtectedRoute` (director), `isDirectorAnalyticsPath`, sidebar role filter; DB: `require_reader(true)` = stored role `director` | [roleAccess.mjs](../../../src/lib/roleAccess.mjs), [079](../../../supabase/migrations/079_crm_read_interfaces_and_permissions.sql) | tests for the new RPC/endpoint |
| Tests | Phase 11 unit, SQL, concurrency and browser scripts exist but **none runs in CI** (not in `package.json` scripts nor in `verify.yml`) | [verify.yml](../../../.github/workflows/verify.yml) | wire into CI |
| Credential | S1: `CRM_META_LIFECYCLE_TOKEN_EH_R4`, System User `61594989243533 / EH Lifecycle R4 Employee`, scope `ads_management` (+ default `public_profile`), assets: dataset `1152399921284927` only; Vercel Production Secret | [Gate-B closeout](../evidence/crm-h3-s1-gate-b-closeout-2026-10-05.md) | an Insights-capable credential (owner decision 1) |

Documentation versus reality: [docs/crm-meta-insights.md](../../crm-meta-insights.md) accurately describes the mock-only state and names exactly the gaps above (transport, scheduler, monitoring, backfill). No contradiction was found. One omission: the Phase 11 tests are not part of any CI lane, which the document does not say.

## Provider facts (verified 2026-10-09)

| Fact | Source | Confidence |
| --- | --- | --- |
| Graph API **v26.0** released 29 Jul 2026; Marketing API v26.0 announced the same day. The versions table lists Marketing API **v25.0** (18 Feb 2026, expiry TBD) as the latest row and **v24.0 expired 6 Oct 2026**. | [versions](https://developers.facebook.com/docs/graph-api/changelog/versions), [v26 announcement](https://developers.facebook.com/blog/post/2026/07/29/introducing-graph-api-v26-and-marketing-api-v26/) | Pin the latest Marketing API version listed at implementation (v26.0 if listed, else v25.0). The fixture `v99.0` stays test-only. |
| `ads_read` "allows your app to access the Ads Insights API to pull Ads report information for Ad accounts you own". App Review is for "data that you do not own or manage". | [permission reference](https://developers.facebook.com/docs/permissions/reference/ads_read) | Confirmed |
| "If your app is only managing your ad account, standard access to the `ads_read` and `ads_management` permissions are sufficient." "Business apps are automatically approved for standard access." Marketing API access tiers: **Limited** (default; "for development only, not for production apps running for live advertisers") and **Full** (after App Review; needs 500 calls in 15 days). | [access](https://developers.facebook.com/docs/marketing-api/access/) | Confirmed; the tier wording versus an own-business integration is **unresolved** (risk 1) |
| Insights edge on `act_<id>`; `ads_read` required; sync `GET` returns data; async `POST` returns `report_run_id`, polled on `async_status` (`Job Not Started`, `Job Started`, `Job Running`, `Job Completed`, `Job Failed`, `Job Skipped`) and `async_percent_completion`; results at `/<report_run_id>/insights`; `report_run_id` expires after 30 days; sync and async calls share the rate limit. | [Insights](https://developers.facebook.com/docs/marketing-api/insights/), [async](https://developers.facebook.com/docs/marketing-api/insights/async/) | Confirmed |
| "Insights refresh every 15 minutes and do not change after 28 days of being reported." Metrics may keep updating a couple of days after an ad stops. | [best practices](https://developers.facebook.com/docs/marketing-api/insights/best-practices) | Confirmed |
| `ads_insights` budget per ad account per hour: `600 + 400 × active ads − 0.001 × user errors` on standard/dev tier (`190000 + …` on full/advanced). Headers: `x-fb-ads-insights-throttle` (`app_id_util_pct`, `acc_id_util_pct`, `ads_api_access_tier`), `x-business-use-case-usage` (`call_count`, `total_cputime`, `total_time`, `estimated_time_to_regain_access` in minutes), `x-ad-account-usage`. Throttling errors: code **4** (subcodes 1504022, 1504039), **17**, **80000** (BUC ads_insights, subcode 2446079); **613** custom limits. | [Graph rate limits](https://developers.facebook.com/docs/graph-api/overview/rate-limiting/), [Marketing rate limits](https://developers.facebook.com/docs/marketing-api/overview/rate-limiting), best practices | Confirmed (two pages label the tiers differently) |
| Ad account fields `account_id`, `currency` ("based on the corresponding value in the account settings"), `timezone_name`, `account_status`. | [ad account](https://developers.facebook.com/docs/marketing-api/reference/ad-account/) | Confirmed |
| Vercel **Secret** environment variables are write-only after saving, can be edited only by supplying a new value, keep their key, and "changes to environment variables don't apply to existing deployments, only to the next one"; rotation guide: update Vercel → redeploy → then invalidate the old credential. | [Vercel secrets](https://vercel.com/docs/environment-variables/sensitive-environment-variables), [rotating secrets](https://vercel.com/docs/environment-variables/rotating-secrets) | Confirmed |
| 7-day and 28-day **view-through** attribution windows removed from the API on 12 Jan 2026 (empty data, no error). Affects `actions` only, never `spend`. | third-party summaries only | Unconfirmed; irrelevant to spend |

**Could not confirm:** the Insights parameters reference (both candidate URLs 404): the exact maximum `time_range` span and the current field list beyond the examples; the System User asset-assignment guide (404): the exact task name for read-only ad-account access ("View performance" in Business settings; `ANALYZE` in older API docs); whether `ads_read` is offered in the C2 app's System User token chooser; whether the C2 app's attached "Create & manage ads with Marketing API" capability is enough for Insights reads (it is the Marketing API product, so expected yes); the KAL account ID, currency and timezone.

## Scope and non-goals

**In scope (Outcome A):** live transport, scheduler, bounded automatic retry, failure visibility, director configuration/switch, manual refresh and 31-day backfill requests, cohort page showing USD spend/CPL/CPQL/CAC with ROAS hidden and explained, tests wired into CI, the credential and activation runbook steps as separately approved release work.

**Out of scope:** funnel view, program breakdown, follow-up health (lead created → first call attempt), source configuration screens, website-to-Meta spend matching, currency conversion, H3/H4 lifecycle activation, any receptionist access change, a goal or target gauge, event-period reporting, breakdowns other than ad/day, async report jobs in live mode (the fixture branch remains test-only), a manual spend import.

**Fallback trigger (described, not designed):** if, after owner approval of the credential step, (a) Meta requires App Review or Business Verification before `ads_read` can be issued for KAL, or (b) a validated token cannot be stored within ten working days, or (c) a validated token returns `provider_auth` on `act_<KAL>` after the account assignment is confirmed, then stop this outcome at the credential step and commission the manual spend import as its own architecture task. The reporting contract and tables are reused by that fallback; it must use its own `query_version` so that it never collides with `ad-daily-v1` rows.

## Design

### D1 — Credential and secret reference

- Reference name: `CRM_META_INSIGHTS_TOKEN_EH_KAL` (matches the 089 regex; the suffix names the account so a second account later gets its own reference). Stored once in Vercel project `prj_hC0MvqsXYmERXhZWGEfOOma8D6E3` (`english-hills-admin`), team `team_egUbt9wN23I40I1K71zxfYGj`, type Secret, target **Production only**, server-side only.
- Runtime resolution: the Node runtime worker reads `process.env[run.config.secret_ref]` at request time, exactly as the live intake path reads `CRM_META_PAGE_TOKEN_*` and the dormant lifecycle worker reads `CRM_META_LIFECYCLE_TOKEN_*`. The key is dynamic, so Next.js does not inline it; the module is `server-only`; the token exists in memory only for the duration of the fetch. Preview and Development deployments have no value, so a live run there fails closed with `missing_secret`.
- Interaction with S1: S1 stays the sole credential architecture and the Gate-B runbook the sole procedure. This plan adds an **Insights authority manifest** to that procedure (identities, task, scope, lifetime, Vercel key) without changing any S1 invariant. The lifecycle identity, token, dataset and delivery gates are untouched.
- Rotation: overwrite the Secret value under the same key → redeploy Production → revoke the previous token at Meta. `config_snapshot` freezes the reference name, not the value, so queued and future runs use the new value without any database change. Because a dedicated Insights System User's "Revoke tokens" may be identity-wide, if Meta offers only identity-wide revocation the order becomes revoke → issue → store → redeploy; the gap is acceptable for a read-only reporting credential (runs fail closed with `provider_auth` and are retried after the redeploy), and previously published snapshots stay visible throughout.
- Owner decision 1 chooses the identity (dedicated System User recommended). The exact app, System User ID, task and scopes are recorded in the nonsecret closeout at the credential step, never guessed here.

### D2 — Configuration and the live switch

`crm_configure_insights(p_connection, p_version, p_data)` is extended (cumulative replace of the 089 definition):

- `mode` in (`mock`, `live`). `live` requires `secret_ref`, `api_version` (`^v[0-9]{1,3}\.0$`), `account_id`, `currency`, `timezone` (must exist in `pg_timezone_names`), `refresh_days` (1–31, default 7) and the new `refresh_interval_hours` (1–24, default 6).
- Identity rule: `account_id`, `currency`, `timezone` and `mode` may change **only while the connection has no completed run** (`crm_meta_sync_runs.status = 'completed'`). Afterwards they are immutable, as today, and correction is a separately approved reconciliation. `refresh_days`, `refresh_interval_hours`, `api_version`, `secret_ref` and `enabled` remain editable.
- `enabled` is the director's live switch. Claims and publishes already check it; switching it off stops every Meta call within one scheduler tick and leaves snapshots visible.
- The response adds `live_available: true` and keeps `secret_ref` out of the configuration echo as today (the diagnostics response returns the reference **name** only, which is documented as non-secret).

### D3 — Scheduler

- Endpoint `GET /api/cron/crm-insights` (`runtime = 'nodejs'`, `maxDuration = 60`), authenticated with a dedicated bearer `CRM_META_INSIGHTS_SCHEDULER_TOKEN` compared with `secretEquals`, response `Cache-Control: no-store`, JSON counts only (`enqueued`, `processed`, `completed`, `failed`, `deferred`), never run IDs, account IDs, provider payloads or error text.
- Per tick: (1) `crm_enqueue_insights_refresh()`; (2) claim and process runs while at least 20 s remain before a 50 s deadline, at most **5** runs per tick; (3) return counts. A run whose fetch would exceed the deadline fails with `timeout` (transient) and is retried later.
- `crm_enqueue_insights_refresh()` (service role): for each connection with `mode = 'live'` and `enabled`, if no run was **created** within `refresh_interval_hours` and no pending/running run overlaps the rolling window `[today_tz − refresh_days + 1, today_tz]`, insert one run with a fresh `request_key` and the frozen `config_snapshot`. Mock connections are never auto-enqueued (local tests stay deterministic). Returns the number inserted.
- pg_cron: `crm_security.invoke_crm_insights_scheduler()` reads Vault `crm_insights_scheduler_url` (must match `^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?/api/cron/crm-insights$`) and `crm_insights_scheduler_token` (≤ 4096 bytes), then `net.http_get` with a 55 s timeout. Job `crm-insights-primary`, schedule `*/30 * * * *`, **created inactive** (`cron.alter_job(active => false)`), exactly like migration 100. Activation is `select cron.alter_job((select jobid from cron.job where jobname='crm-insights-primary'), active => true);` under release approval.
- No GitHub Actions backup (risk 5). No Vercel Cron, so `vercel.json` (PR #120) is untouched.

### D4 — Live transport and worker

- `fetchInsights({ config, from, to, token, fetchImpl, deadline })` generalises the adapter: `mode = 'live'` requires an injected `fetchImpl` (the route passes the platform `fetch`, as intake does); `mode = 'mock'` keeps requiring `mockFetch`. `fetchInsightsFixture` remains as a thin wrapper so existing tests keep their shape.
- Request shape (unchanged): `GET /act_<id>?fields=account_id,currency,timezone_name` (fail closed on mismatch), the three object edges, then `GET /act_<id>/insights?level=ad&time_increment=1&time_range={since,until}&limit=100&fields=account_id,campaign_id,adset_id,ad_id,ad_name,date_start,date_stop,spend,impressions,reach,clicks,inline_link_clicks,actions`. Bearer header only; the token is never placed in a URL. `redirect: 'error'`, `cache: 'no-store'`, 10 s per request, plus the invocation `deadline`.
- Live mode does **not** create async report jobs. If Meta ever returns a `report_run_id` to a `GET`, the run fails with `invalid_data`. The fixture-only async branch stays for tests. A range too large for synchronous reads fails with `timeout` or `limit_exceeded`, and the director splits the range.
- Attribution parameters are left at Meta defaults: they affect `actions` only, which are stored in the allowlisted shape and never drive CRM outcomes. `spend`, `impressions`, `clicks` and `inline_link_clicks` are unaffected by attribution windows. `reach` stays per ad/day and is never summed.
- Error mapping stays code-only (`rate_limit`, `provider_auth`, `provider_unavailable`, `invalid_data`, `limit_exceeded`, `timeout`, `network`, `missing_secret`). HTTP 429, Graph error codes 4, 17, 80000 and 613 map to `rate_limit`; 401/403 and code 190 map to `provider_auth`. Response bodies are never logged or returned.
- Worker: `processInsights({ rpc, env, fetchImpl, deadline })` claims, resolves the secret, fetches, publishes. An exception after the publish call started returns `unknown` and is left to the 10-minute lease (existing behaviour).

### D5 — Retry, rate-limit and uncertain-outcome contract

| Situation | Behaviour |
| --- | --- |
| Transient failure (`rate_limit`, `provider_unavailable`, `network`, `timeout`) and `attempt_count < 3` | `crm_fail_insights_sync` sets `status = 'pending'`, keeps `error_code` and `rows_processed` for visibility, sets `next_attempt_at = now() + 30 min` after the first attempt and `+ 2 h` after the second. `crm_claim_insights_sync` claims only runs with `next_attempt_at <= now()`. |
| Transient failure on the third attempt | `status = 'failed'` (or `'partial'` when rows > 0), terminal; the director requests a new run with a new request key (the overlap check blocks only pending/running runs). |
| Terminal failure (`provider_auth`, `invalid_data`, `limit_exceeded`, `missing_secret`, `async_pending`) | `status = 'failed'`/`'partial'` immediately. After fixing the cause, the director may `crm_retry_insights_sync` while `attempt_count < 3`. |
| Rate limit detail | Fixed backoff above. Reading `estimated_time_to_regain_access` is an optional refinement, not required for acceptance. |
| Uncertain publish (RPC call timed out or returned no result) | No status write. The lease expires after 10 minutes; a later claim re-fetches and re-publishes. If the earlier publish had actually committed, the run is already `completed` and is never re-claimed. Replay is safe because publishing is an idempotent full-range replace. **No automatic uncertain replay** of a different kind exists: nothing is marked succeeded or failed without evidence. |
| Overlapping requests | Unchanged: same request key and range returns the same run; a different range with the same key conflicts; overlapping active ranges serialise. |
| Lease loss | Unchanged: `finish`/`fail` with a stale lease raise `40001` and write nothing. |

### D6 — Reporting and page behaviour with USD spend and MAD revenue

Verified against migration 090: with the connection selected, `spend_currency = 'USD'`, `currency_mismatch = true`, spend/CPL/CPQL/CAC are computed in USD for trusted Meta rows, every `roas` is NULL and the summary ROAS is NULL. Without a connection, no spend and no ratios. With incomplete coverage, `spend_complete = false` and spend/ratios are NULL, never zero. Nothing misleading is produced by the RPC; the only changes are:

- `live_sync_enabled` is read from the configuration (`mode = 'live' and enabled`) instead of the constant `false`;
- the page hides the ROAS card and column when `currency_mismatch` is true and shows: "ROAS masqué : les dépenses sont en USD et les encaissements en MAD ; aucune conversion de devise n'est appliquée." (final wording at implementation);
- the page's state line shows live sync on/off, `last_synced_at` in the account timezone and the pending/failed warning that already exists;
- summary cards keep their denominators text (attributed leads/qualified/converted).

Acquisition cohort semantics, first-touch attribution, the no-fan-out aggregation and the unknown/website/manual buckets are unchanged.

### D7 — Coexistence with rows from another source

There is no other source today. A live publish deletes and reinserts every `ad-daily-v1` row of that connection in the run's range, whatever run created them (mock rows in Production should not exist; the proposed Production read confirms zero). A future manual import must use its own `query_version` and its own reporting rule; `crm_get_marketing_cohort` reads only `ad-daily-v1`, so manual rows would be invisible until that rule is designed. The 089 unique key already prevents two rows for the same connection/date/ad/version.

### D8 — Historical backfill

- The director enters a start and end date; the page splits the range into consecutive blocks of at most 31 account dates and submits one `POST /api/internal/crm/insights/process` per block, each with its own request key, sequentially (the next block is submitted after the previous returns 202). Blocks are processed by the scheduler, at most 5 per tick.
- Data older than 28 days is final at Meta, so one pass per block suffices; recent blocks are re-read by the rolling window anyway.
- Bounds per block: ≤ 3,000 insight rows in practice (30 pages × 100), so ≤ 96 ads over 31 days; larger blocks fail with `limit_exceeded` and the director uses shorter blocks. The campaign start date is owner decision 2.

### D9 — Failure visibility

`crm_insights_diagnostics` adds per connection `mode`, `refresh_days`, `refresh_interval_hours`, `api_version`, `secret_ref` (name), `last_completed_at`, and per run `next_attempt_at` and `mode` (from the snapshot). The Synchronisation panel lists the latest 25 runs with a French label per `error_code` and status, a retry button when eligible, a manual refresh button, and the backfill form. The existing cohort `sync_warning` keeps flagging the report itself.

## Security boundaries

| Layer | Rule |
| --- | --- |
| Route | `/crm/analytics` and nested paths: middleware redirects non-directors; `ProtectedRoute` director-only; sidebar role filter. Unchanged, tests extended. |
| Internal API | `POST /api/internal/crm/insights/process`: authenticated user, stored-profile role `director`, same-origin, bounded body. Unchanged. |
| Scheduler API | `GET /api/cron/crm-insights`: dedicated bearer only; 401 otherwise; counts-only JSON; no PII; no token-bearing logs. Middleware skips `/api/` gating, so the handler authenticates itself (existing policy). |
| Database | `crm_configure_insights`, `crm_request_insights_sync`, `crm_retry_insights_sync`, `crm_insights_diagnostics`, `crm_get_marketing_cohort`: `require_reader(true)` (stored role `director`; admin, receptionist, teacher, parent, student, pending and anon denied). `crm_claim_insights_sync`, `crm_finish_insights_sync`, `crm_fail_insights_sync`, `crm_enqueue_insights_refresh`: `require_meta_worker()` (JWT role `service_role`), execute revoked from public/anon/authenticated. `crm_security.invoke_crm_insights_scheduler`: no API role may execute. Tables: RLS, no grants. SECURITY DEFINER with `search_path = pg_catalog, pg_temp`. |
| Secrets | Token value only in Vercel Production Secret and transient server memory; database stores the reference name; diagnostics/cohort/UI never carry the value; adapter errors are codes; no `access_token` query parameter; Vault holds only the scheduler URL and bearer. |
| Provider | Fixed host and path; cursor-only pagination; redirect rejection; bounded bytes/requests/pages/rows; account/currency/timezone verified against `act_<id>` before any publish. |

## Migration strategy

One forward migration, next free number at implementation, in a single transaction, additive:

1. `alter table public.crm_meta_sync_runs add column next_attempt_at timestamptz not null default now();` and extend the `crm_sync_queue` partial index to `(next_attempt_at, created_at, id) where status in ('pending','running')`.
2. `create or replace` of `crm_configure_insights`, `crm_claim_insights_sync`, `crm_fail_insights_sync`, `crm_insights_diagnostics`, `crm_get_marketing_cohort` from their 089/090 bodies (latest cumulative definitions; nothing between 090 and 113 touched them, verified by grep), with the D2/D3/D5/D6/D9 changes only. Re-issue the same revoke/grant statements.
3. `create function public.crm_enqueue_insights_refresh() returns integer` (service role only).
4. `crm_security.invoke_crm_insights_scheduler()` and the inactive `crm-insights-primary` job, guarded by the same `cron.database_name` check as 095/100 so disposable replay databases skip the job.
5. `notify pgrst, 'reload schema';`

Compatibility: the deployed application ignores the new JSON fields; the new endpoint is only reachable by the inactive job; the cohort change is a flag value. Either migration-first or code-first order is safe; the recommendation is migration-first, as in recent releases, with the cron job inactive.

## Test strategy

Synthetic, local, rolled back; no real token or Meta call anywhere in CI.

- **Unit (`scripts/test-crm-phase11.mjs`, extended):** live mode with an injected stub `fetchImpl`: bearer header only, no token in URL, `cache: 'no-store'`, `redirect: 'error'`, deadline → `timeout`, 429/4/17/80000 → `rate_limit`, 401/403/190 → `provider_auth`, redirect → `invalid_data`, `report_run_id` on GET → `invalid_data`, error object never includes a body; mock mode still requires `mockFetch`. Worker: live path resolves `env[ref]`, missing secret fails closed before any fetch.
- **Scheduler (`scripts/test-crm-insights-scheduler.mjs`, new):** 401 without or with a wrong bearer; enqueue called once; processes at most 5 runs and stops at the deadline; response has only counts; two concurrent invocations finalise one run once (RPC stub with SKIP LOCKED semantics as the intake test does).
- **SQL (`scripts/test-crm-phase11.sql`, extended):** live configuration accepted and mock-only rejection removed; identity change allowed before, rejected after, a completed run; `crm_enqueue_insights_refresh` inserts once per interval, never for mock or disabled connections, never with an overlapping active run; backoff schedule and `next_attempt_at` claim gating; third transient failure terminal; terminal codes immediate; diagnostics fields; cohort `live_sync_enabled` true/false; USD spend with MAD revenue → `currency_mismatch` true, ROAS NULL, CPL/CPQL/CAC in USD; role denials for every RPC including the new one for roles 2–7 and anon; service-role-only execute on the new RPC; no API role can execute the invoker.
- **Concurrency (`scripts/test-crm-phase11-concurrency.py`, extended):** competing enqueue ticks produce one run; stale lease rejection unchanged.
- **Browser (`scripts/test-crm-phase11-browser.mjs`, extended):** director sees the panels, the live state line, the ROAS replacement line under USD, the failure label and retry; admin/receptionist redirected and get 403 on the process route; `GET /api/cron/crm-insights` without bearer → 401 for every role.
- **Live HTTP shape (local only):** a local HTTP stub server, as the reconciliation repair acceptance does, proves the real `fetch` path (headers, redirect rejection, byte bound) without Meta.
- **Middleware/navigation:** existing suites unchanged; `/api/cron/crm-insights` is covered by the existing `/api/` self-authentication rule and the scheduler test.
- **CI wiring:** add `test:crm-insights` to `package.json` (unit + scheduler) and run it in the app job; run the Phase 11 SQL and concurrency scripts in the local-database job. Changing `.github/**` routes the implementation PR to the full lane.

## Rollout and recovery strategy

Each step is Tier 3 and needs its own explicit owner approval; none is approved here.

| Step | Action | Approval | Verification |
| --- | --- | --- | --- |
| R0 | Production reads listed below | owner, per read | counts and names only |
| R1 | Credential: S1 Gate-B procedure with the Insights manifest (owner decision 1): create/assign the System User to KAL with the read-only task, issue one `ads_read` token, validate once in the Access Token Debugger, store `CRM_META_INSIGHTS_TOKEN_EH_KAL` as a Production Secret, metadata-only check | owner, human-only | nonsecret closeout |
| R2 | Store `CRM_META_INSIGHTS_SCHEDULER_TOKEN` (Production Secret) and Vault `crm_insights_scheduler_url` / `crm_insights_scheduler_token` in a protected SQL session | owner | `vault.secrets` names only |
| R3 | Apply the migration (next free number) | owner | ledger row, function catalog diff, job present and **inactive** |
| R4 | Merge the reviewed exact head; Vercel Production READY on that commit (the deployment also loads the two new secrets) | owner | deployment source and alias |
| R5 | Activate `crm-insights-primary` | owner | `cron.job.active`, `cron.job_run_details`, `net._http_response` status only |
| R6 | Director configures the connection (`mode = live`, KAL ID, USD, account timezone, pinned API version, `CRM_META_INSIGHTS_TOKEN_EH_KAL`, 7 days / 6 h) and switches live sync on; first rolling run completes | owner as director | one completed run; compare one date range with Ads Manager at the same account/level/currency (release checklist item) |
| R7 | Backfill from the campaign start (owner decision 2) in ≤ 31-day blocks | owner | each block completed; cohort `spend_complete` true for the period |
| R8 | Closeout: CURRENT_STATE, FEATURE_INDEX, Insights contract, ADR-006 status | docs PR | — |

**Rollback:** the director switches live sync off (no Meta call, no publish, snapshots remain). Operator rollback: `cron.alter_job(…, active => false)`; revert the deployment. The migration is forward-only; its objects are additive and harmless when inactive. **Credential incident:** keep live sync off, revoke the Insights token at Meta (dedicated identity, so the lifecycle credential is untouched), issue and store a replacement under the same key, redeploy, switch on.

**Wrong first configuration:** before any completed run the director corrects the identity fields; the adapter's account metadata check blocks a publish under a wrong currency or timezone. After a completed run, a reviewed reconciliation (separate approval) deletes that connection's snapshots and runs and reconfigures.

## Production reads proposed (not run)

| # | Read | Reason | Risk |
| --- | --- | --- | --- |
| 1 | `select id, connection_key, enabled, insights_settings - 'secret_ref' from crm_integration_connections where insights_settings ? 'account_id';` | Confirm no Insights configuration exists and in which mode | Low; account ID is non-secret |
| 2 | Counts of `crm_meta_sync_runs`, `crm_meta_daily_insights`, `crm_meta_objects` | Confirm no snapshot rows exist, so D7 coexistence is theoretical | None |
| 3 | `select a.account_id, count(*), count(*) filter (where a.campaign_id is not null), count(*) filter (where a.ad_id is not null), min(s.occurred_at), max(s.occurred_at) from crm_submission_attribution a join crm_submissions s on s.id = a.submission_id where a.provider = 'meta' group by 1;` | How many Meta leads carry campaign/ad IDs and under which account ID, so CPL/CPQL/CAC joins will have data and the account matches KAL | Low; counts and a non-personal account ID |
| 4 | `select jobname, schedule, active from cron.job;` | Confirm no Insights job yet and the intake job's state | None |
| 5 | `select name from vault.secrets order by name;` | Confirm no `crm_insights_*` names yet | None; names only |
| 6 | Vercel environment metadata (dashboard or `filter_project_envs`, decryption disabled): existence of any `CRM_META_INSIGHTS_TOKEN_*` or `CRM_META_INSIGHTS_SCHEDULER_TOKEN` key | Confirm no existing token key before issuing one | None; metadata only |
| 7 | Meta Business settings (owner, or the connected Meta Ads tool's ad-account listing): KAL's `act_` ID, `currency`, `timezone_name`, `account_status`, business | Resolve the unconfirmed account facts before configuration | Low; provider read, no CRM data |

## Expected modules

| Path | Change |
| --- | --- |
| `supabase/migrations/<next>_crm_meta_insights_live_sync.sql` | New (D2, D3, D5, D6, D9) |
| `src/lib/crm/insights/adapter.mjs` | `fetchInsights` with live transport, deadline; fixture wrapper kept |
| `src/lib/crm/insights/worker.mjs` | `processInsights` (live + mock) |
| `src/lib/crm/insights/scheduler.mjs` | New: `runScheduledInsights` |
| `src/lib/crm/insights/server.js` | New: `insightsRpc` over the service-role client (pattern of `lifecycle/server.js`) |
| `src/app/api/cron/crm-insights/route.js` | New scheduler endpoint |
| `src/app/api/internal/crm/insights/process/route.js` | Response drops the constant flag (returns `run_id` only) |
| `src/components/crm/MarketingAnalytics.jsx` (and small extracted panels) | State line, ROAS handling, configuration and synchronisation panels, backfill form |
| `.env.example` | `CRM_META_INSIGHTS_SCHEDULER_TOKEN=` and a comment naming the `CRM_META_INSIGHTS_TOKEN_*` reference model |
| `package.json`, `.github/workflows/verify.yml` | `test:crm-insights`; Phase 11 SQL/concurrency in the local-database job |
| `scripts/test-crm-phase11*.{mjs,sql,py}`, `scripts/test-crm-insights-scheduler.mjs` | Extended / new |
| `docs/crm-meta-insights.md`, `docs/crm-intake-scheduler.md` (cross-link), `docs/ai/*`, `docs/architecture/*` | Updated at implementation/closeout for changed facts only |

Untouched: `vercel.json`, `src/middleware.js`, `src/lib/roleAccess.mjs`, every lifecycle module, every finance or enrollment function, all files of PRs #120–#124.

## Owner decisions required

1. **Credential identity.**
   - **Question:** which Meta identity issues the Insights token?
   - **Option A:** a dedicated System User in the existing C2 app (or, if the C2 chooser does not offer `ads_read`, a Business app that does), assigned only the KAL ad account with the read-only "View performance" task, one token with `ads_read` only, stored as `CRM_META_INSIGHTS_TOKEN_EH_KAL`.
   - **Option B:** reuse `EH Lifecycle R4 Employee`: assign KAL to it and issue a second token (`ads_read`) under the Insights reference.
   - **Consequences:** A keeps S1's isolation (no unrelated ad-account access on the lifecycle identity; an identity-wide revoke on either side never affects the other) at the cost of one more System User (Limited tier allows one system user plus one admin system user per app, so if the C2 app already holds its one Employee the Insights user needs the admin slot or another app). B is faster but couples the two credentials and amends an S1 invariant, which S1 says returns to Gate A.
   - **Recommendation:** A.
   - **Blocking:** blocks R1 (credential) and activation; does not block implementation of code and migration.
2. **Backfill start date.**
   - **Question:** from which account date should the Rentrée backfill start, and should earlier spend be included?
   - **Option A:** the campaign start date you state (for example the first Rentrée ad set start).
   - **Option B:** the earliest date with Meta leads in the CRM (from Production read 3).
   - **Consequences:** the report shows spend only for covered dates; leads acquired before the backfill start show "—" for spend.
   - **Recommendation:** A, with B as the lower bound check.
   - **Blocking:** blocks R7 only.
3. **Currency.**
   - **Question:** leave ROAS hidden, or plan a conversion?
   - **Option A:** keep ROAS hidden with the explanation; CPL/CPQL/CAC in USD.
   - **Option B:** a separate later outcome adding a stored daily or monthly USD→MAD rate with ROAS marked "estimated".
   - **Consequences:** A is truthful and simple; B needs a rate source, storage and a product rule for estimated ratios.
   - **Recommendation:** A now; B only if you want ROAS on this page later.
   - **Blocking:** not blocking.
4. **Configuration surface.**
   - **Question:** who enters the account configuration?
   - **Option A:** a director panel on `/crm/analytics` using the existing `crm_configure_insights` RPC (the switch, the account fields and the refresh settings).
   - **Option B:** the operator configures the connection by SQL at release; the page shows only the live switch.
   - **Consequences:** A gives you self-service correction before first publish and keeps the operator out of routine changes; B is a smaller UI change but every correction becomes a Production SQL step.
   - **Recommendation:** A.
   - **Blocking:** decide before implementation (UI scope).
5. **Automatic retry of transient failures.**
   - **Question:** should rate limits, provider outages, network errors and timeouts retry automatically?
   - **Option A:** bounded automatic retry (3 attempts, 30 min then 2 h) with director retry for terminal failures, as in D5.
   - **Option B:** director-only retry for every failure, as the 089 contract reads today.
   - **Consequences:** A keeps spend current without the director watching the page; B is simpler but a single rate-limit response during the night leaves the morning report stale.
   - **Recommendation:** A.
   - **Blocking:** decide before implementation.
6. **Fallback trigger.**
   - **Question:** do you accept the fallback trigger in [Scope](#scope-and-non-goals) (App Review required, or no validated token within ten working days, or `provider_auth` after assignment)?
   - **Option A:** accept as written.
   - **Option B:** state a different deadline or condition.
   - **Recommendation:** A.
   - **Blocking:** not blocking.

## IMPLEMENTATION CONTRACT

### Scope

Implement D1–D9 exactly as written, for one ad account, in one implementation PR on a dedicated branch from current `origin/main`, after owner approval of this revision and decisions 4 and 5. Decision 1 governs the separate credential step, not the code.

### Prerequisites

- Owner approval recorded in this plan (date, revision, exact options).
- Fresh `origin/main`; reconcile with PRs #120–#124 if merged (migration number, `vercel.json`, `queries.js`, `CrmWorkspace.jsx`).
- Local Supabase with ledger ≥ 113; the next free migration number confirmed from the ledger and open PRs.
- No Production access, secret, token or data.

### Object / module manifest

Exactly the [expected modules](#expected-modules). Database objects: column `crm_meta_sync_runs.next_attempt_at`; index `crm_sync_queue` (replaced); functions `crm_configure_insights`, `crm_claim_insights_sync`, `crm_fail_insights_sync`, `crm_insights_diagnostics`, `crm_get_marketing_cohort` (cumulative replace), `crm_enqueue_insights_refresh` (new), `crm_security.invoke_crm_insights_scheduler` (new); cron job `crm-insights-primary` (inactive). No other table, policy, grant or trigger.

### Invariants

- No token value in the database, browser, logs, errors, diagnostics, documentation or tests; only `CRM_META_INSIGHTS_TOKEN_*` reference names.
- Director-only at route, API and database; service-role-only worker RPCs; every other role and anon denied; no new grant or RLS policy.
- A run publishes only a complete, validated snapshot; partial or failed fetches publish nothing; prior snapshots stay visible; uncertain publishes are recovered by lease, never by assumption.
- Spend is NULL, never zero, for uncovered dates; ROAS is NULL and hidden when spend currency ≠ MAD; no currency conversion.
- Account, currency, timezone and mode are immutable after the first completed run.
- Live mode never calls a host other than `graph.facebook.com`, never follows redirects, never creates async report jobs, never exceeds the adapter bounds, never runs without the director switch, an active job and a present secret.
- Mock mode behaviour and existing tests keep passing; the lifecycle, intake, finance and enrollment paths are untouched.
- Migration 089/090 bodies are the base for every replaced function; no earlier snapshot.

### Acceptance / tests

All suites in [Test strategy](#test-strategy) pass locally and in CI for the exact head SHA; `npm test`, `npm run lint`, `npm run build`, `npm run test:middleware`, `npm run test:navigation` pass; `supabase migration up --local` applies the new migration on a 113 database and the Phase 11 SQL/concurrency scripts pass against it; `git diff --check`, link and secret checks pass.

### Stop conditions

Stop and report (no workaround) on: any need to widen a grant, policy or role boundary; any requirement to place the token anywhere but Vercel and transient server memory; a Meta response shape that forces async jobs or breaks the account metadata check; a migration number collision at implementation; any change needed in `vercel.json`, middleware or the lifecycle modules; any test weakened to pass; any Production, Vercel or Meta action.

### Docs / status reporting

Update [docs/crm-meta-insights.md](../../crm-meta-insights.md) for the live contract and the CI wiring, cross-link from [docs/crm-intake-scheduler.md](../../crm-intake-scheduler.md), and update `.env.example`. Do not change CURRENT_STATE deployment facts at implementation; closeout (R8) records merge, migration, activation and verification separately. Hand off per [AGENTS implementation handoff](../../../AGENTS.md#implementation-handoff) with branch, exact head and base SHA, PR, tier, plan revision DGI-A-r1, migration filename, checks with run links, author self-check, docs changed, open owner decisions, and the merge/release hold.
