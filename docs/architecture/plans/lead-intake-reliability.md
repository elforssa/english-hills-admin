# Lead intake reliability — no silent lead loss, no-code form launch, honest ratios, prospect data retention

Revision **LIR-r1**, 2026-10-24. **Status: APPROVED FOR IMPLEMENTATION** (owner, 2026-10-24, D1–D8 as recommended, plan head `aa68632`; see the [approval record](#approval-record)), with the independent review's corrections applied inside the approved architecture ([review corrections](#review-corrections-2026-10-24-after-the-approval)). Each migration, data change, scheduled-job activation, Production configuration step (including R-LB) and deployment still needs its own explicit owner approval. **Update 2026-10-25: R-LB was run in Production with its own approval ([release record](#release-record--r-lb-2026-10-25)); look-back now 1440 minutes.** Nothing here is implemented, merged, deployed or run. Owner: Maroine. Baseline `origin/main` `ba009b4` (PR #149 merge), fetched 2026-10-24. Architecture branch `docs/plan-b-lead-intake-reliability`. Source: the read-only platform audit of 2026-10-24, findings CRM-1 (High), CRM-2 (High after verification), REL-5, CRM-3, CRM-5 and CRM-6. Where the audit's verifier corrected a finding, the corrected version is used.

**Risk tier.** Phase 1 is **Tier 3** (it changes the intake scheduler's response, a scheduler/cron surface, and adds director controls over the intake configuration; PR 1b adds a migration and a scheduled check). Phase 2 items are tiered one by one in [Phasing](#phasing-and-tiers); every Production step (migration, configuration, scheduled job, data change) is Tier 3 whatever the tier of its code change. The [separate Production operation](#production-operation-r-lb-widen-the-meta-look-back-to-24-hours) is Tier 3.

**Timing.** The owner's next Meta campaign is imminent. Phase 1 is the minimum to ship before it; Phase 2 follows.

# Owner summary

## What will change

- **Phase 1, before the campaign.**
  - If a Meta check of new leads fails (for example because the Facebook Page token stopped working), the intake check now answers "failed" instead of "OK". The GitHub backup check then fails and GitHub e-mails you.
  - A new director panel, **Réception des leads**, on the existing `/crm/analytics` page. It lists the Instant Forms the CRM imports. You can add a new form there (no code, no SQL), stop importing a form, and re-run leads that got stuck.
  - A written **campaign launch checklist**: publish the form before the ads start, send one test lead, then check every day.
  - The marketing report stops showing CPL, CPQL and CAC when the chosen dates start before campaign attribution started (12 October 2026). Today those numbers are inflated in that case.
  - **Recommended in Phase 1, if time allows (PR 1b, one small read-only database addition):** a health check that GitHub runs. It e-mails you when Meta polling is failing, when leads are stuck, when the ad-spend sync is stale, **or when Meta counted more form leads than the CRM received**. The last case catches a form nobody published, whatever the cause.
- **Separately, you can approve this now (no code):** keep 24 hours of Meta leads in the safety window instead of 1 hour. A fault fixed within a day then loses no lead.
- **Phase 2.** The CRM keeps track of the last lead it saw per form, so it catches up after any outage and picks up the earlier leads of a newly published form. Report ratios are corrected at the source. A director command handles a rejected pre-enrollment. Raw copies of prospect data and visitor IPs get deleted on a schedule.

## What staff/users will be able to do

- **Director:** see which forms are imported and whether intake is healthy; publish, stop and re-run form imports; read honest ratios. Phase 2: detach a rejected pre-enrollment so the lead can be enrolled again.
- **Receptionist, admin, teacher, parent, student:** nothing changes.

## What remains restricted

- Everything new is director-only, at page, API and database level, using the database commands that already exist and already check for the director role.
- No new Meta permission, token or webhook activation. The realtime webhook stays off.
- Nothing deletes or rewrites a lead, a submission, a payment or a conversion in Phase 1. Phase 2 retention clears only duplicate raw copies and IP addresses, under rules you choose.

## UI impact

- `/crm/analytics` gets a status line and a collapsible **Réception des leads** panel, and ratios are hidden when the date range starts before attribution started.
- No new page, no sidebar change, no change for other roles.

## Database impact

- **Phase 1, PR 1a:** none.
- **Phase 1, PR 1b (recommended) or first Phase 2 item:** one additive migration with one read-only function, `crm_get_intake_health`. It returns counts and fixed codes only, and it changes no table and no data.
- **Phase 2:** additive columns on the per-form polling state; a new version of the report function; a director detach command with an audit entry; a retention function and one daily scheduled job. Each needs its own migration release approval.

## Important security decisions

- The director panel only calls commands that exist in Production today and already refuse anyone but the director: `crm_publish_meta_form_mapping`, `crm_retire_meta_form_mapping`, `crm_retry_meta_job` and `crm_get_meta_diagnostics`.
- The repository is **public**, so GitHub Actions run logs are public. Alerts print one generic line and never print error codes, counts, form IDs or lead data. Scheduler responses keep their counts-only contract, plus one yes/no `alert` flag.
- The health check reuses the existing intake scheduler bearer, so no new secret is needed. It only reads.
- Widening the look-back uses the existing director command. It must be sent with every current connection field: the command overwrites the account, API version and token-reference fields from its input.

## Risks / owner review points

1. **The GitHub backup does not run every 5 minutes.** The workflow is set to `*/5`, but GitHub runs it about **5–6 times a day** (100 scheduled runs from 6 to 24 October). A no-migration alert (PR 1a alone) sees only the polls that GitHub happens to trigger, so an outage can take hours to reach your inbox. PR 1b checks stored state, so the first GitHub run after a fault reports it (about 4 hours on average). Either way, the 24-hour window is what turns "late" into "not lost". See decision D1.
2. **Today intake is complete.** Since polling started (28–29 September), the number of form leads Meta reports per day equals, day by day, the number the CRM received (41 leads up to 9 October). The 356 leads of 13–27 September came before polling started, through the old Yearly sheet, by design. This is the evidence behind the PR 1b comparison.
3. **A new form's first mapping must be dated in the past.** If it takes effect only at publication, leads submitted before publication get stuck as "form without mapping". The panel dates a new form's first version 30 days back by default (decision D4).
4. **Up to 50 leads per poll.** Even with 24 hours of look-back, one poll reads at most 50 leads, newest first. If more than 50 leads pile up during an outage, the oldest are only recovered by Phase 2 catch-up. That is far above today's volume of 2–8 per day.
5. **Alert e-mails go to the GitHub account that owns the schedule (`elforssa`).** Check once that GitHub e-mails you about failed workflows (decision D2).

# Baseline and evidence limits

- Repository: `origin/main` `ba009b4`; this branch has no other change.
- Latest cumulative definitions read: `crm_save_meta_connection` (115), `crm_get_meta_diagnostics` (115), `crm_publish_meta_form_mapping`, `crm_retire_meta_form_mapping` and `crm_publish_website_form_mapping` (103: the 094/086/093 bodies plus `crm_security.lifecycle_barrier(true)`), `crm_retry_meta_job` and `crm_fail_meta_job` (086), `crm_claim_meta_reconciliation` (094), `crm_claim_ingestion_jobs` (094), `crm_enqueue_meta_reconciled` and `crm_finish_meta_reconciliation` (105), `crm_get_meta_job_mapping` (087), `crm_finalize_meta_job` (115) and `crm_finalize_website_job` (103), `crm_insights_diagnostics` (114), `crm_get_marketing_cohort` (116), `crm_cleanup_lifecycle_retention` (103), `crm_security.protect_mapping` (086), `crm_security.protect_attribution` (078), `crm_security.protect_enrollment_link` (084), `check_anon_rate_limit` (066), `crm_security.require_reader` (079), `crm_security.lifecycle_barrier` (103).
- Code read: [scheduler](../../../src/lib/crm/intake/scheduler.mjs), [reconciler](../../../src/lib/crm/meta/reconcile.mjs), [shared worker](../../../src/lib/crm/intake/worker.mjs), [Meta adapter](../../../src/lib/crm/meta/adapter.mjs), [Insights scheduler](../../../src/lib/crm/insights/scheduler.mjs), [backup workflow](../../../.github/workflows/crm-intake-scheduler.yml), [analytics page](../../../src/components/crm/MarketingAnalytics.jsx), [Insights panels](../../../src/components/crm/MarketingInsightsPanels.jsx), [route gating](../../../src/lib/roleAccess.mjs), [scheduler tests](../../../scripts/test-crm-intake-scheduler.mjs).
- Production reads, 2026-10-24, through the Supabase MCP `execute_sql` on `hopcezradkhrixwwswxn`: three `select` statements, counts and dates only. They selected no name, phone, e-mail, token, secret reference, page ID or ad-account ID:
  1. Meta Insights lead actions by type: `onsite_conversion.lead_grouped` = 356 between 2026-09-13 and 2026-10-09; `lead` = 357 between 2026-09-13 and 2026-10-13.
  2. Per account day (Europe/Paris), Meta-reported `onsite_conversion.lead_grouped` against CRM Meta attribution rows. The two are equal on every day from 2026-09-29 to 2026-10-09; 2026-09-28 shows 5 against 1, the activation day. Every day from 2026-09-13 to 2026-09-27 shows Meta 6–40 against CRM 0, which is before polling started.
  3. State counts: 1 director profile; 1 Meta connection with reconciliation enabled and `lookback_minutes` = 60; 1 reconciliation state row, 0 with an error; 1 active Meta form; 4 active website mappings; jobs `{done: 44}`; 41 unredacted attribution payloads; 26 `anon_rate_limits` rows, the oldest from 2026-05-24.
- GitHub (REST, read-only): the repository is `public`. The latest 100 scheduled runs of *CRM Intake Scheduler* go from 2026-10-06 02:31 UTC to 2026-10-24 04:13 UTC, all `success`, actor and triggering actor `elforssa`.
- Not verified: Vercel logs and alerting; the owner's GitHub notification settings; Meta Graph support for time filtering on the `/leads` edge (needed for Phase 2b, made a stop condition); exactly which Meta permission `/{page}/leadgen_forms` needs (not used by this plan).
- No local Supabase or Docker on the authoring machine; no test was run (Markdown-only change).

# Verified current state

| Topic | Fact (latest definitions / code / Production) | Consequence |
| --- | --- | --- |
| Meta intake path | Webhook off (`enabled = false`); polling is the only path. One due mapped form per call; window `max(started_at, now − lookback_minutes)`; at most 2 pages × 25, newest first; due again after 10 min on success, 15 min after a rate limit, 5 min after other errors. | An outage longer than the look-back (60 min today) leaves leads in Meta that the CRM never reads. |
| Failure signal | `reconcile` stores `last_error_code` in `crm_meta_reconciliation_state` (no grant to `authenticated` or `service_role`, no RPC reads it). The scheduler catches everything and answers **200 `ok:true`**. pg_cron logs "succeeded" whatever the HTTP result. | Poll failures are invisible. |
| GitHub backup | `curl --fail`, `--retry 2` (retries 408/429/5xx), exits 1 on any non-2xx. **Actual cadence about 5.5 runs a day**, not every 5 minutes. ADR-002 and [crm-intake-scheduler.md](../../crm-intake-scheduler.md) both say "five-minute backup"; that contradicts the run history and is corrected at implementation. | GitHub turns a non-2xx into an e-mail, but only on the calls it makes itself. |
| Who processes jobs | Most jobs are processed by the `crm_meta_job_kick` trigger, which calls `/api/internal/crm/meta/process`, not by the scheduler. | Job failures rarely pass through the scheduler's response. |
| Stuck jobs | `crm_finalize_meta_job` (115) and `crm_finalize_website_job` (103) block a job themselves for `missing_policy` and `connection_disabled` and return `{status:'blocked'}`, which the worker records as an outcome **without** `error_code`. A job that reaches 8 attempts becomes `dead` either with its last retry code (`timeout`, `network`, …) or, inside `crm_claim_ingestion_jobs`, as `attempts_exhausted`, and is never returned as an outcome. `crm_fail_meta_job` sets `blocked` for `missing_secret`, `provider_auth`, `missing_mapping`, `missing_policy` and `connection_disabled`, and `dead` for `invalid_provider_data`, `invalid_mapping`, `attempts_exhausted` or after 8 attempts. `crm_retry_meta_job(p_job)` (director, `authenticated` grant) re-queues `blocked`/`retry` jobs with `attempt_count < 8`. Nothing in `src` calls it. | A director can re-run stuck jobs, but has no screen to do it. |
| Form mappings | `crm_claim_meta_reconciliation` only polls forms with an effective, unretired `meta_instant_form` mapping. `crm_publish_meta_form_mapping(p_connection, p_data)` (director) appends version n+1 and accepts `effective_from`. It does not check that the connection is a Meta connection, so the caller must pass the Meta connection. `crm_retire_meta_form_mapping(p_mapping)` (director) retires **one version row** and is irreversible; the immutability trigger allows only setting `retired_at` once. **Publishing a new version does not retire earlier versions**: Production's only Meta form has 2 versions, both unretired. The claim keeps polling a form while *any* version is effective and unretired. Neither RPC is called from `src`. | A new Instant Form is never polled until someone runs a raw RPC. Stopping a form means retiring every unretired version; retiring only the latest keeps polling while new leads block on `missing_mapping`. |
| Mapping date trap | `crm_get_meta_job_mapping` (087) picks the latest version with `effective_from <= lead created_time`; if there is none, or that version is retired at or before the lead's time, it returns null and the job blocks on `missing_mapping`. | A first mapping dated "now" makes the leads already submitted on that form get stuck. They are recovered only by publishing a back-dated version and retrying. |
| Look-back setting | `crm_save_meta_connection` (115, director, `lifecycle_barrier(true)`) accepts `meta_reconciliation.lookback_minutes` 10–1440. It keeps `started_at` while reconciliation stays on, merges settings keys, and **overwrites the `account_id`, `api_version` and `access_token_secret_ref` columns with the values in `p_data`** (`api_version` is `NOT NULL` by constraint). | Widening is a supported operation, but it must send every current field. |
| Enqueue idempotency | Unique `(connection_id, event_kind, external_key)`; a lead seen again is counted as `existing` and not reprocessed. | A wider window cannot duplicate leads. |
| Insights freshness | `crm-insights-primary` runs `*/30` and has no backup trigger and no alert. `crm_insights_diagnostics` (director) returns `last_completed_at` per connection. One Vercel 500 at 03:30 UTC on 2026-10-24 went unnoticed. | Stale spend is visible only to someone who opens the page. |
| Meta-reported leads | `crm_meta_daily_insights.actions` holds `onsite_conversion.lead_grouped` per ad per day; it matched CRM intake exactly on every full day of polling. | Comparing the two detects missing leads from any cause, with no new permission. |
| Ratios (CRM-3) | `crm_get_marketing_cohort` (116): the summary divides all Meta spend in the period by attributed leads, qualified leads and conversions. Rows divide a campaign's spend in the period by its attributed leads. The attribution switch started at `2026-10-12T00:33:39.957Z`; leads before it stay unattributed by owner decision. | Both summary and rows are inflated when the range starts before 12 October, or when attribution of some leads is pending or failed. |
| Pre-enrollment (CRM-5) | `protect_enrollment_link` makes `enrollment_id`/`student_id` immutable once set; `crm_start_enrollment` refuses a linked lead (`lead_already_enrolled`). The UI says "contactez la direction"; the director has no tool. | A rejected pre-enrollment blocks conversion tracking for that lead. |
| Retention (CRM-6) | `crm_submission_attribution.raw_payload` keeps a copy of the form answers, `retention_until` is always NULL, and 41 rows are unredacted. `protect_attribution` already supports a terminal redaction that clears `raw_payload`, `fbclid`, `fbc`, `fbp` and `consent_evidence` together. The dormant lifecycle functions (099, 102–104) read these fields. Website job payloads, up to 64 KiB of the inquiry, stay in `crm_ingestion_jobs.payload`. `check_anon_rate_limit` deletes only the calling IP's old rows: 26 rows, the oldest from May, IPs in clear text. [crm-meta-ingestion.md](../../crm-meta-ingestion.md) requires an approved retention policy before activation. | No retention rule exists. |

## Existing versus missing capability

| Need | Exists | Missing |
| --- | --- | --- |
| Publish/retire a Meta form mapping | Director RPCs | Any UI; back-dating guidance |
| Re-run stuck jobs | Director RPC; job list in `crm_get_meta_diagnostics` | Any UI |
| Know polling failed | `last_error_code` stored | Any reader, any alert, a non-2xx response |
| Know a form is not imported | Insights lead counts and CRM counts both stored | A comparison |
| Recover after an outage | Rolling look-back up to 1440 min | A per-form high-water mark and catch-up |
| Honest ratios | Correct per-campaign arithmetic after the switch | A boundary at the attribution start; coverage |
| Correct a rejected pre-enrollment | Immutability trigger, refusal | An audited director exception |
| Retention | Redaction transition in the trigger | A rule, a job, IP hashing or purge |

# Scope and non-goals

**In scope:** the six findings above and the launch checklist. **Not in scope:**

- Turning on the realtime webhook.
- Lifecycle (CAPI) activation.
- New Meta permissions or tokens.
- Changing the website form or the public website endpoint. Decision D8 recommends keeping today's behaviour, where unknown website forms are stored and then made visible.
- CRM-4, the work queue backlog; it is an operational decision, not intake.
- Sentry wiring.
- Discovering form IDs from Meta (`/{page}/leadgen_forms` or ad creatives), which would need permission checks. The Meta-versus-CRM count comparison tells someone that leads are missing without it. It can be added later if the comparison proves too coarse.
- Lead-level anonymisation of closed prospects. D7 records the rule; its implementation is a separate outcome, because contacts are shared with learners and siblings.

# Phasing and tiers

| Item | Finding | Phase | Code tier | Migration | Ships as |
| --- | --- | --- | --- | --- | --- |
| R-LB widen look-back to 1440 | CRM-1, CRM-2 | Now, separate | — (Production operation, Tier 3) | No | Operator step |
| P1-A intake scheduler answers 424 on a real failure | CRM-1, REL-5 | 1 | Tier 3 (scheduler) | No | PR 1a |
| P1-B director panel *Réception des leads* | CRM-1, CRM-2 | 1 | Tier 2 (UI on existing director RPCs) | No | PR 1a |
| P1-C campaign launch checklist | CRM-2 | 1 | Tier 2 (operational procedure) | No | PR 1a |
| P1-D ratio guard in the report | CRM-3 | 1 | Tier 2 (director UI) | No | PR 1a |
| H health check + GitHub step + panel status | CRM-1, CRM-2, REL-5 | 1 (D1 = A) or first of 2 | Tier 3 (migration, scheduled check) | Yes, additive read-only | PR 1b |
| 2b per-form catch-up | CRM-1, CRM-2 | 2 | Tier 3 (provider, intake) | Yes | PR 2b |
| 2d report ratios fixed at the source | CRM-3 | 2 | Tier 2 code, Tier 3 release | Yes | PR 2d |
| 2e detach a rejected pre-enrollment | CRM-5 | 2 | Tier 3 (conversion integrity) | Yes | PR 2e |
| 2f retention job, IP hashing/purge, `cron.job_run_details` purge | CRM-6, REL-5 | 2 | Tier 3 (data change, scheduler) | Yes | PR 2f |
| 2g discovery reads only IDs; publish RPC checks the provider | hardening | 2 | Tier 3 / Tier 2 | 2g-b yes | with 2b |

PR 1a is one PR at Tier 3 (its highest component). Its UI parts are labelled Tier 2 above so the reviewer can scale the effort.

# Production operation R-LB: widen the Meta look-back to 24 hours

**Separate from all code. Tier 3 Production configuration. Not run by this plan.** It needs the owner's explicit approval (decision D3). It is done by the release operator in a protected Supabase SQL session on `hopcezradkhrixwwswxn`, as the database owner role (the SQL editor default). It writes one row through the existing director command, attributed to the director's profile. It can be done before, during or after Phase 1.

**Why the call can run from SQL.** `crm_save_meta_connection` is `SECURITY DEFINER` and checks the caller with `crm_security.require_reader(true)`, which reads `auth.uid()` from `request.jwt.claims` and requires that profile to be a director. It does not check the database role. Setting the claim to the single director's profile inside the transaction is the same mechanism a signed-in director request uses.

**Step 0 — pre-check (read only).** Record the result. There must be exactly one director and exactly one Meta connection with reconciliation enabled; otherwise stop.

```sql
select
  (select count(*) from public.profiles where role = 'director') as directors,
  c.version, c.enabled as webhook_enabled,
  c.settings #>> '{meta_reconciliation,enabled}'          as recon_enabled,
  c.settings #>> '{meta_reconciliation,lookback_minutes}' as lookback,
  c.settings #>> '{meta_reconciliation,started_at}'       as recon_started_at,
  c.settings #>> '{attribution_enrichment,enabled}'       as attr_enabled,
  c.settings #>> '{attribution_enrichment,started_at}'    as attr_started_at,
  md5(concat_ws('|', c.connection_key, c.page_id, coalesce(c.account_id,''), c.api_version, coalesce(c.access_token_secret_ref,''))) as identity_md5,
  md5(coalesce(c.insights_settings::text,''))             as insights_md5
from public.crm_integration_connections c
where c.provider = 'meta' and c.settings #>> '{meta_reconciliation,enabled}' = 'true';
```

Expected today: `directors` 1, one row, `webhook_enabled` false, `recon_enabled` true, `lookback` 60, `attr_enabled` true.

**Step 1 — the change (one transaction).** The values are copied from the row itself and never printed. The `DO` block raises, and so rolls the whole change back, unless exactly one row was changed to 1440; in the SQL editor the script runs as one unit, so there is no interactive rollback decision.

```sql
do $$
declare c public.crm_integration_connections; directors integer; result jsonb; n integer := 0;
begin
  select count(*) into directors from public.profiles where role = 'director';
  if directors <> 1 then raise exception 'R-LB: expected exactly one director, found %', directors; end if;
  perform set_config('request.jwt.claims',
    json_build_object('sub', (select id from public.profiles where role = 'director'), 'role', 'authenticated')::text, true);
  for c in select * from public.crm_integration_connections
           where provider = 'meta' and settings #>> '{meta_reconciliation,enabled}' = 'true' loop
    n := n + 1;
    result := public.crm_save_meta_connection(
      jsonb_build_object(
        'connection_key', c.connection_key, 'page_id', c.page_id, 'account_id', c.account_id,
        'api_version', c.api_version, 'access_token_secret_ref', c.access_token_secret_ref,
        'meta_reconciliation', jsonb_build_object('enabled', true, 'lookback_minutes', 1440)),
      c.id, c.version);
    if result #>> '{settings,meta_reconciliation,lookback_minutes}' is distinct from '1440' then
      raise exception 'R-LB: look-back not 1440 after save'; end if;
  end loop;
  if n <> 1 then raise exception 'R-LB: expected exactly one enabled Meta connection, found %', n; end if;
end $$;
```

`enabled` (the webhook) and `attribution_enrichment` are left out on purpose: the command keeps both. If the block fails (any raise, or `PT409` (legacy `40001`) for a stale version or a lifecycle barrier conflict), nothing was changed: rerun step 0 and retry once. Never invent a version.

**Step 2 — verification right after.** Rerun the step 0 query. Expected: `version` = previous + 1; `lookback` = 1440; `recon_started_at`, `attr_enabled`, `attr_started_at`, `webhook_enabled`, `identity_md5` and `insights_md5` **identical** to step 0. Any other difference means: stop, and run the rollback below.

**Step 3 — passive verification after 20–30 minutes (read only, counts only).**

```sql
select count(*) as state_rows,
       count(*) filter (where last_error_code is not null) as state_errors,
       max(updated_at) as last_pass
from public.crm_meta_reconciliation_state;                      -- expect errors 0, last_pass within 15 min
select status, count(*) from public.crm_ingestion_jobs group by 1;  -- expect no blocked/dead; done may grow
select status_code, count(*) from net._http_response
 where created > now() - interval '1 hour' group by 1;          -- see note below
```

`net._http_response` mixes the replies of the intake cron, the Insights cron and the job-kick calls, without the URL. Expect the same picture as before the change: mostly 200, and no new non-2xx pattern. An isolated Insights 500 (one was present on 2026-10-24) is not attributable to R-LB. After PR 1a, 424 rows mean a real intake problem.

**Rollback.** The same block with 60 instead of 1440 (in the payload and in the check), after rerunning step 0. Nothing else needs undoing: leads found because of the wider window are genuine and are deduplicated.

**Expected effect.** Each pass reads up to 2 pages instead of usually 1; no new leads are expected, because the counts show none missing. Record the result in CURRENT_STATE with the step 0 and step 2 values (no identifiers).

## Release record — R-LB (2026-10-25)

Owner approval (Maroine, 2026-10-25 10:31 Asia/Shanghai, that is 02:31 UTC): "approve R-LB", covering only this operation, steps 0–3 exactly as written above (decision D3). It approves no PR 1b work, no webhook, attribution or other connection change. Access path as for migration 119: Supabase CLI `supabase db query --linked` (Management API, as `postgres`) from the release session; every read began with `set transaction read only`. No identifier, page/account id, token reference or lead data is recorded: counts, versions, booleans and md5s only (the two `started_at` values are recorded as the first 12 hex digits of their md5).

| Step | Time (UTC) | Result |
| --- | --- | --- |
| Step 0 (the plan's query verbatim) | 02:33:34 | `directors` 1; one row; `version` **7**; `webhook_enabled` false; `recon_enabled` true; `lookback` **60**; `recon_started_at` md5 `1dc2856060f1…`; `attr_enabled` true; `attr_started_at` md5 `e9149b1bd561…`; `identity_md5` `90daae559f11d07851922d665e96bc17`; `insights_md5` `3c5e8734bce3205a9c93e8c3643f6ec3`. Every gate condition met. |
| Step 3 baseline (counts) | 02:34:14 | 1 state row, 0 errors, last pass 4.1 min old; jobs: 44 `done`, nothing else; `net._http_response` last hour: 14 × 200 |
| Dry run (step 1's block plus a final `raise exception 'RLB_DRYRUN_OK'`) | 02:34:22–02:34:26 | Only `RLB_DRYRUN_OK` raised; step 0 re-run byte-identical (version 7, look-back 60) |
| Step 1 (the plan's block verbatim, no sentinel) | 02:34:42–02:34:46 | Exit 0, committed on the first attempt; no retry needed |
| Step 2 (step 0 re-run) | 02:34:51 | `version` **8** (7 + 1); `lookback` **1440**; `recon_started_at`, `attr_enabled`, `attr_started_at`, `webhook_enabled`, `identity_md5`, `insights_md5` and `directors` identical to step 0; no other difference. No rollback. |
| Step 3 (the plan's three count queries) | 02:58:02 | 1 state row, **0 errors**, last pass **13.2 min** old (a pass ran after the change); jobs: **44 `done`**, no `blocked`/`dead`; `net._http_response` last hour: **14 × 200**, no 424 and no other non-2xx; step 0 still version 8, look-back 1440 |
| GitHub `crm-intake-scheduler` | — | **pending: first run after 02:34Z not yet observed (GitHub schedules this workflow roughly every 2–2.5 h).** The last run before the change, at 01:32:10, succeeded. |

Script SHA-256: step 0 `e622dc1d8389215bbe18aacd42ec122d1ff9e5a4ffc943e98d7e5920abfee0c9` (with the read-only prefix), dry run `650cf30da42a31117f6eea630eafaa653b166a98ae45c3f42088121402046dd6`, step 1 `c9bf2461dd9bf0727d6e7ab7c81b5a2cf8588a2b9fae34dc0d18546a34e926a3`. Effect as expected: no job beyond the 44 already done, so no lead was missing within the widened window. Rollback (not needed): the same block with 60.

# Design — Phase 1

## P1-A — the intake scheduler answers 424 on a real failure (PR 1a)

- [`reconcileMetaLeads`](../../../src/lib/crm/meta/reconcile.mjs) also returns `code`: `null` or the fixed `MetaError` code it already computes. When the database claim itself throws, the existing scheduler catch reports `{forms:0, discovered:0, enqueued:0, failed:1, code:'storage_unavailable'}`.
- In [`runScheduledIntake`](../../../src/lib/crm/intake/scheduler.mjs):
  - `BENIGN_POLL = {reconciliation_lease_lost, reconciliation_disabled, reconciliation_form_inactive}`.
  - `ALERT_JOB = {missing_secret, provider_auth, missing_mapping, missing_policy, connection_disabled, invalid_provider_data, invalid_mapping, attempts_exhausted}`, the codes that block or kill a job.
  - `alert = (discovery.failed > 0 && !BENIGN_POLL.has(discovery.code)) || outcomes.some(o => o.status === 'blocked' || ALERT_JOB.has(o.error_code))`. The `status === 'blocked'` term catches `missing_policy` and `connection_disabled`, which the finalizers block themselves and return as a success-shaped outcome.
  - **Not caught by P1-A:** a job that dies after 8 attempts (with its retry code, or as `attempts_exhausted` inside the claim) is never returned as an outcome. Only PR 1b (`jobs_dead`) reports it.
  - **Transient poll codes** (`rate_limit`, `timeout`, `network`, `provider_unavailable`) alert immediately in Phase 1. Occasional single false e-mails are expected and accepted: with GitHub seeing only about 5–6 calls a day, they are rare. Phase 2b's `last_success_at` lets PR 1b's rule be tightened so these codes alert only when no pass has succeeded for 30 minutes (plan constant `TRANSIENT_GRACE_MIN = 30`); the permanent codes keep alerting at once.
  - Response: when `alert`, **HTTP 424** with `{ ok:false, alert:true, processed, succeeded, failed, reconciliation:{forms,discovered,enqueued,failed} }`; otherwise exactly today's 200 body. The `code` field never appears in the body. 401 and 503 are unchanged.
  - 424 is chosen because curl's `--retry` does not retry it, so the workflow does not trigger three extra passes.
- [Workflow](../../../.github/workflows/crm-intake-scheduler.yml):
  - **Script shape.** Today the step runs under `set -euo pipefail` with `curl --fail` inside a command substitution, so curl exits 22 on any HTTP error and the script stops before its `case`: only curl's own message prints. The step drops `--fail` (keeping `--show-error`, the timeouts and `--retry`, which still retries transient 5xx), captures curl's exit code with `rc=0; http_status="$(curl … --write-out '%{http_code}' …)" || rc=$?`, then branches: `rc != 0` (network or timeout) → exit 1 with a fixed network line (implemented wording, PR 1a: `CRM intake scheduler request failed before an HTTP status was received.`); `2??` → success; `424` → print the generic line `CRM intake reported a lead-intake problem. Open Analyse marketing > Réception des leads.` and exit 1; any other status → today's non-2xx message and exit 1. The health step (PR 1b) uses the same shape.
  - Add a `workflow_dispatch` boolean input `alert_test`. When true, the job prints `Alert test` and exits 1 **without calling the endpoint**, so the owner can confirm the failure e-mail arrives.
  - The cron line, permissions and concurrency stay unchanged, so that `elforssa` remains the actor of scheduled runs.
- pg_cron is unaffected: it ignores the status, and `net._http_response` now shows 424 rows for the same events.

## P1-B — director panel *Réception des leads* (PR 1a)

A collapsible section on `/crm/analytics`, which is already director-only in middleware, `loginDestination` and the RPCs. No route-gate change. It reads `crm_get_meta_diagnostics({p_limit:100, p_offset:0})` and the `crm_insights_diagnostics` data the page already loads. New pure helpers live in `src/lib/crm/intakeAdmin.mjs`, so they can be tested without a browser.

1. **Status line**, always visible above the panels:
   - Meta polling on/off and the look-back in hours, from `settings.meta_reconciliation`.
   - The number of jobs to handle (blocked, retry or dead) among the latest 100.
   - Spend sync freshness: "Dépenses Meta : dernière synchronisation complète il y a X h". It turns red when Insights is enabled and the last completion is older than 2 × `refresh_interval_hours`, or missing.
   - PR 1a states plainly that a failed poll is not visible here; the GitHub e-mail reports it until PR 1b.
2. **Formulaires importés.** Meta mappings are grouped by `form_key`. A form is **Active** when at least one of its versions is effective (`effective_from <= now`) and unretired (`retired_at` null or later than now), exactly the claim predicate; **Planifié** when its only unretired versions start in the future; **Arrêté** when every version is retired. The row shows the latest version's form name, version number, `effective_from`, session type and learner policy (required/optional). Website mappings are listed read-only.
3. **Publier un formulaire Meta** (dialog). Fields:
   - Meta form ID: digits only, 1–32 characters.
   - Name: up to 200 characters.
   - "Copier les réponses depuis": an existing Meta mapping. It copies `field_map`, `question_labels`, `option_labels`, `learner_policy`, `default_session_type` and `default_program_interest_text`, all editable.
   - Session type: one of the 8 values; program text; learner policy.
   - An advanced editor: one text input per canonical key `contact_name, phone, whatsapp, email, learner_name, learner_age, learner_birth_date, session_type, program_interest_text`.
   - **Effective date** (decision D4):
     - For a form with no version yet, the default is publication time − 30 days. It can be edited but not set earlier than 90 days back, Meta's lead retention.
     - For a new version of an existing form, the default is publication time, and the date must be later than the latest version's `effective_from`. The UI enforces this, because the database does not.

   The payload holds only the keys the RPC accepts, and `p_connection` is always the Meta connection (`provider = 'meta'`). A confirmation shows the summary. Errors are shown in French: `22023` → "Champs refusés : vérifiez l'identifiant et les champs"; `42501` → "Réservé à la direction"; `PT409` (legacy `40001`) (version or lifecycle-barrier conflict; the 103 bodies take `lifecycle_barrier(true)`) → "Actualisez puis réessayez", with no automatic retry.
4. **Arrêter l'import** (retire). The confirmation reads: "Les nouveaux leads de ce formulaire ne seront plus importés. Action définitive : pour reprendre, publiez une nouvelle version." It calls `crm_retire_meta_form_mapping(p_mapping)` **for every unretired version of that `form_key`**, one call per version (each call is atomic per version). After any error it refetches; while at least one version remains unretired, the form shows **Partiellement arrêté** with a button to finish. No new RPC; an atomic `crm_retire_meta_form` may be added in 2g.
5. **Leads à traiter.** Lists jobs with status `blocked`, `retry` or `dead` among the latest 100 (labelled so), with channel (from the job's connection), received time, status, attempts and a French label of `last_error_code`. **Réessayer** appears for `blocked`/`retry` with `attempt_count < 8` and calls `crm_retry_meta_job(p_job)`; the existing kick trigger processes the job at once. A `missing_mapping` row carries the hint "publiez le formulaire avec une date d'effet antérieure au lead, puis réessayez". `dead` rows say "non réessayable : récupérez le lead dans l'Espace prospects Meta (Leads Center) et saisissez-le à la main".
6. **Checklist** reminder: a four-line French summary of P1-C, linking to the runbook section.

The panel never shows tokens, secret references, lead fields or page/account IDs; the diagnostics payload already omits lead fields. Every button is disabled while a request is in flight and refetches afterwards.

## P1-C — campaign launch checklist (PR 1a, copied into [crm-operations-runbook.md](../../crm-operations-runbook.md))

**Before the ads go live (the day before):**

1. In Ads Manager, note the Instant Form used by **every** ad of the campaign (ad → *Formulaire instantané* → form ID). A duplicated form has a new ID.
2. In *Analyse marketing → Réception des leads*, check each form ID. If it is not listed as Active, use **Publier**: copy the closest existing form, set name, session type, program and learner policy, and keep the proposed effective date.
3. Confirm the look-back shows **24 h** (R-LB done), and that *Leads à traiter* is empty.
4. Send **one test lead** on each new form with Meta's Lead Ads Testing Tool. Within about 15 minutes it must appear as a new opportunity with name and phone filled in. Close it as lost with the reason "test". If fields are empty, the form's questions differ: publish a new version with the right keys.
5. Once only: confirm that GitHub e-mails you about failed workflows (GitHub → Settings → Notifications → Actions). Optionally run *CRM Intake Scheduler* manually with `alert_test` and check the e-mail.

**While the campaign runs (twice a day for the first three days, then daily):**

6. Compare yesterday's form leads in Ads Manager with yesterday's Meta leads in *Analyse marketing*, using Source = Formulaire Meta and the date set to yesterday. PR 1b automates this comparison.
7. *Leads à traiter* must be empty, and the spend sync fresh.

**If a GitHub failure e-mail arrives:** open the panel. A token problem (`provider_auth`, `missing_secret`) goes to the operator, following the runbook's "Expired/missing token" row; fix it within 24 hours and every lead is recovered automatically. A Meta `missing_mapping` row means: publish the form, then **Réessayer**. A **website** `missing_mapping` row (decision D8) means the website sent a form key the CRM does not know: the panel lists website mappings read-only, so the director publishes the website mapping with the existing `crm_publish_website_form_mapping` RPC through the runbook's operator snippet (new runbook row, see below), then presses **Réessayer** on the job. Beyond 24 hours, or more than 50 leads waiting, export the missing leads from Meta's Leads Center and enter them by hand, until Phase 2b.

**After the campaign:** leave the mapping active while the form exists in Meta, because late leads still arrive. Retire it only when the form is archived.

## P1-D — ratio guard in the report (PR 1a, UI only)

The analytics page reads `settings.attribution_enrichment.started_at` from the Meta connection in `crm_get_meta_diagnostics` and converts it to the account time-zone date (`attribution_day`).

- If `from < attribution_day`: CPL, CPQL and CAC are shown as "—" in the summary **and the rows**, with the line "Ratios masqués : la période commence avant le début de l'attribution des campagnes (12 oct. 2026). Les dépenses antérieures n'ont pas de prospects attribués." and a button **Commencer au 12 oct.** that sets `from`. Spend and counts stay visible.
- Otherwise, if any row bucket `pending:meta_instant_form` or `unknown:meta_instant_form` has leads, or `total > rows.length`: the summary ratios carry the note "partiel : N prospects Meta sans attribution". Coverage is computed from the fetched rows.
- The pure helper is `ratioGuard({ from, attributionDay, rows, total })` in `src/lib/crm/funnel.mjs` or a sibling module. The default range, month to date, is unaffected from November onward.

## H — intake health check (PR 1b; Phase 1 if D1 = A, otherwise first Phase 2 item)

**Migration `XXX_crm_lead_intake_health.sql`** (number chosen just before merge). It is additive, creates one function and changes no table.

`public.crm_get_intake_health() returns jsonb`, `SECURITY DEFINER`, `search_path = pg_catalog, pg_temp`. Authorization: `auth.role() = 'service_role'`, or else `perform crm_security.require_reader(true)` (director). `EXECUTE` is revoked from `public, anon` and granted to `authenticated, service_role`. It returns only counts, timestamps, booleans and fixed codes:

- `meta_poll`:
  - `enabled` and `lookback_minutes`.
  - `forms_active`.
  - `forms_failing`: state rows of active forms whose `last_error_code` is not null and not benign.
  - `worst_code`: the first match in the order `provider_auth, missing_secret, invalid_provider_data, storage_unavailable, provider_unavailable, timeout, network, rate_limit`.
  - `forms_overdue`: `next_due_at < now() − 20 min` with no live lease. This means both triggers have stopped.
  - `last_pass_at`.
- `jobs`: per channel (`meta`, `website`), `blocked_recent` and `dead_recent` (`updated_at > now() − 7 days`), `pending_stuck` (`pending`/`retry` with `created_at < now() − 30 min`), and the plain totals.
- `insights`: per Meta connection with Insights configured, `enabled` (live mode and enabled), `last_completed_at`, and `stale`, meaning enabled with `last_completed_at` missing or older than 2 × `refresh_interval_hours`.
- `lead_gap`, for the Meta connection that has both reconciliation and Insights:
  - `window_days`: the last 3 complete account-timezone days, D−3 to D−1, keeping only days **covered by a completed sync run** (`crm_meta_sync_runs.status = 'completed'`, `date_from <= day <= date_to`) whose `completed_at` is at least 3 hours after that day ended. Day selection uses run completion, not row `fetched_at`, because a day with no spend has a completed run but no Insights rows; such a day counts as `meta_reported` 0.
  - `meta_reported`: the sum of `onsite_conversion.lead_grouped` over those days, from completed runs.
  - `crm_received`: Meta attribution rows on that connection's page whose `provider_created_at`, in the account time zone, falls in those days.
  - `gap = meta_reported − crm_received`.
- `alert` (boolean) and `reasons` (array of fixed enums):
  - `meta_poll_failing` when `forms_failing > 0`;
  - `meta_poll_overdue` when `forms_overdue > 0`;
  - `jobs_blocked` and `jobs_dead` when their recent counts are > 0;
  - `jobs_stuck` when `pending_stuck > 0`;
  - `insights_stale`;
  - `meta_leads_missing` when `gap >= 2` (plan constant `LEAD_GAP_ALERT`).

  Only Meta > CRM counts: organic or test leads make the CRM side higher, which is never an alert. Three-day sums absorb the day-boundary skew of Meta's reporting date. **Known limit:** the comparison is per connection, not per form, so organic or test leads on an imported form can mask an equal number of ad leads missing on an unpublished form. The launch checklist's test lead and daily comparison remain the per-form check.

**Route `GET /api/cron/crm-health`:**

- It authenticates with the existing `CRM_INTAKE_SCHEDULER_TOKEN` (constant-time compare, like the intake route).
- It calls the RPC through the service-role client and returns `{ ok, alert }`: no counts, no reasons, because the body is not needed by the caller. 200 when there is no alert, **424** when there is one, 503 on storage error, 401 on a wrong bearer.
- It does nothing else.

**Workflow:** a second step, `if: always()`, calls the health route with the same script shape as P1-A (no `--fail`, exit code captured, branch on `%{http_code}`) and prints the generic line on 424 or any other non-2xx. A run then fails if intake **or** health fails.

**Panel:** the status line calls `crm_get_intake_health()` as director. It shows a red banner per reason in French, the last pass time, the failing code label, and the Meta-versus-CRM lead counts of the last 3 complete days.

**Release order:** migration first (it is inert without callers), then the code merge. Merging the code first would make every health call answer 503 and raise false alerts.

# Design — Phase 2

Each item is its own PR, architecture-approved by this plan once its owner decision is recorded. Each has its own migration release approval.

- **2b — per-form catch-up (ADR-002 amendment, accepted below).**
  - Add nullable columns `covered_until timestamptz`, `catchup_before timestamptz` and `last_success_at timestamptz` to `crm_meta_reconciliation_state`.
  - Lower bound = `greatest(started_at, earliest active mapping effective_from for the form, covered_until − 10 min, now − 28 days)` (plan constant `CATCHUP_MAX_DAYS = 28`), with `lookback_minutes` kept as the minimum re-scan.
  - At most 4 pages × 25 per pass. If the pass stops before the lower bound, it records `catchup_before` (the oldest `created_time` seen) and becomes due again in 1 minute. The next pass resumes with Graph `filtering` on `time_created LESS_THAN catchup_before`.
  - `covered_until` advances to the pass start only when the pass reached the lower bound.
  - `crm_enqueue_meta_reconciled` and `crm_finish_meta_reconciliation` get v2 bodies that accept the new bound and resume values, with the same lease rules.
  - A newly published form whose first version is back-dated (D4) is then recovered automatically within that bound.
  - **Stop condition:** official Meta documentation must confirm `time_created` filtering on the `/leads` edge before implementation; if not, stop and revise.
  - Tier 3.
- **2d — ratios fixed at the source.**
  - A new `crm_get_marketing_cohort` version, built on 116 and dropping the 116 signature in the same migration, as 116 did.
  - It adds `ratio_spend`: spend on insight dates ≥ the attribution start day in the account time zone. It also adds `excluded_spend_before_attribution` and `attribution_coverage`: attributed Meta leads / all Meta leads in the cohort.
  - Summary and row ratios use `ratio_spend` (option chosen in D5).
  - P1-D is then relaxed to the coverage note.
  - Director-only, unchanged grants. Tier 2 code, Tier 3 release.
- **2e — detach a rejected pre-enrollment (D6 = B).**
  - `public.crm_detach_rejected_enrollment(p_lead uuid, p_request uuid, p_reason text, p_wrong_learner boolean)`, director only, idempotent on `p_request`.
  - Allowed only when the lead is not `CONVERTED`, `converted_at` is null and the linked enrollment's status is `Rejected`.
  - It clears `enrollment_id`, and `student_id` too when `p_wrong_learner`. It appends an `enrollment_detached` activity with the reason.
  - `protect_enrollment_link` admits this one transition only under a transaction-local flag set by the command.
  - The receptionist note "contactez la direction" stays; the director sees **Détacher** in the lead's enrollment section.
  - Conversion, revenue and enrollment rows are untouched. Tier 3.
- **2f — retention (D7).**
  - A daily pg_cron job calls `crm_security.apply_crm_retention()`, in batches of 500, returning counts:
    - (a) redact `crm_submission_attribution` rows older than the approved raw-copy period, using the existing terminal redaction transition. It excludes any row the lifecycle functions could still need (the implementer derives the exact predicate from 099/102–104; **stop** if it cannot be stated).
      - **Ordering against `protect_attribution` (078):** the redaction update may change only `raw_payload`, `fbclid`, `fbc`, `fbp`, `consent_evidence` and `redacted_at`, and a redacted row is terminal. So `retention_until` is set in an **earlier, separate update**, which the trigger allows while the column is still NULL (fill-only enrichment), for example at capture or on the job's first pass. It is never set by the redaction update itself; if that ordering cannot be met, `retention_until` is left NULL and the policy is enforced by the job alone.
      - **Lifecycle impact:** any `redacted_at` makes the lifecycle functions (099, 103) return `identity_redacted` for that submission, Meta rows included, even though `lead_id` survives. D7(a)'s 90 days is therefore a **hard cutoff for lifecycle events** on that lead: none can be sent after it. This must be restated when lifecycle activation (H4) is planned.
      - **Alignment with 103:** `crm_cleanup_lifecycle_retention` (103) already erases delivery payloads 30 days after terminal state and attempt diagnostics after 90 days. 2f uses the same batch pattern (`p_limit`, `for update skip locked`, counts returned), never redacts a row with a non-terminal lifecycle delivery, and runs after that cleanup in the same daily job.
    - (b) erase website job payloads past the same period, `done` jobs only: a new `payload_erased_at` column, payload replaced by `{}`, `payload_hash` kept so idempotent replays still detect conflicts.
    - (c) delete `anon_rate_limits` rows older than 1 hour, globally.
    - (d) delete `cron.job_run_details` rows older than 14 days.
  - The `/api/public/inscription` limiter keys on an HMAC of the IP with a server secret, as the CRM inquiry route does. A new secret is a separate Tier 3 credential step. If the owner closes `/inscription` first (the pre-inscription simplification plan), the change is a one-time purge instead.
  - Tier 3.
- **2g — hardening.**
  - Discovery requests `id,created_time,form_id` only. Today it also downloads `field_data` it never uses.
  - `crm_publish_meta_form_mapping` v2 rejects a connection whose `provider <> 'meta'`.

**Parked, not designed here:** an e-mail alert to the director from the application (D2 = B); form discovery from Meta; lead-level anonymisation (D7 rule only).

## ADR-002 amendment (accepted)

[ADR-002](../decisions/ADR-002-meta-intake-and-reconciliation.md#accepted-amendment--lead-intake-reliability-lir-r1-2026-10-24) carries the amendment, **accepted** with the owner's approval of this plan (2026-10-24):

- (1) the intake scheduler signals real failures with a non-2xx status, and the health check, not the schedule firing, proves intake works. A job that dies after 8 attempts is reported only by PR 1b, not by P1-A;
- (2) Phase 2b replaces the pure rolling window with a per-form high-water mark bounded by the activation watermark, the mapping's effective date and 28 days;
- (3) the GitHub backup's real cadence is recorded.

Accepted as architecture only; each implementation and Production step keeps its own approval gate.

# Security boundaries

- Director-only everywhere new. P1-B uses only RPCs that already enforce `require_reader(true)`. The health RPC enforces director or `service_role`. `/crm/analytics` is already gated by role in middleware and `loginDestination`.
- No new grant to `anon`; no new table grant; RLS is unchanged.
- No token, secret reference, page/account ID, form answer or contact field is **displayed** in the panel, **logged** in a workflow or returned by the scheduler or the health route/RPC. The workflow logs, which are public, print fixed generic lines only. Note: `crm_get_meta_diagnostics` already returns full connection rows (including `page_id`, `account_id`, the secret *reference* name and `insights_settings`) to the director's browser today; this is director-only and unchanged, and the panel must not render those fields.
- The health route reuses the intake bearer for a read-only call; no new secret. The bearer stays server-side and in GitHub secrets.
- Scheduler responses stay counts-only plus one boolean.
- Mapping immutability, attribution immutability, the conversion rules and the enqueue identity are untouched. 2e is the only exception to a protection trigger: narrow, audited, director-only.
- Retention never deletes a lead, submission, activity, payment or conversion.

# Migration strategy

- PR 1a: none.
- PR 1b: `XXX_crm_lead_intake_health.sql`, one `create function`, revoke/grant, `notify pgrst`. Built against ledger 001–118; the number is chosen just before merge (Premium Release B and the parked PRs #121/#124 also need numbers).
- Phase 2: one migration per item. Each builds on the latest cumulative definitions listed above and is forward-only. 2d drops and recreates the cohort signature in one transaction, like 116. 2f creates its cron job inactive; activation is a separate approved step.
- Every migration: local fresh replay and upgrade rehearsal from the previous ledger in CI's local-database lane. No Production apply without explicit approval.

# Test strategy

**PR 1a**

- `scripts/test-crm-intake-scheduler.mjs` gains these cases:
  - poll codes `provider_auth`, `missing_secret`, `rate_limit`, `storage_unavailable` and a thrown reconcile → 424 with `ok:false, alert:true`, no `code` in the body, key allowlist;
  - `reconciliation_lease_lost`, `reconciliation_disabled`, `reconciliation_form_inactive` → 200;
  - a job outcome with each `ALERT_JOB` code → 424, an outcome `{status:'blocked'}` without `error_code` → 424, a `retry` code → 200 (the existing case stays);
  - 401 and 503 unchanged; concurrent invocation still finalizes once.
- `scripts/test-crm-meta-reconciliation.mjs`: `code` is returned for every error path and is `null` on success.
- A new `scripts/test-crm-intake-admin.mjs` (pure) covers:
  - mapping grouping and active/retired state;
  - the payload builder (only allowed keys; Meta connection only; digits-only form ID);
  - the effective-date rules (first version default −30 days, floor −90 days; later versions after the latest);
  - the retry predicate; French labels for every error code;
  - `ratioGuard` (before/after the attribution day, pending/unknown buckets, truncated rows).
- A new `scripts/test-crm-intake-admin-local.mjs` (local Supabase, CI local-database lane) runs the real RPCs as a synthetic director:
  - publishing with a back-dated `effective_from` makes the claim include the form;
  - a seeded `blocked`/`missing_mapping` job retried after that publication finalizes once;
  - a form with **two unretired versions**: *Arrêter l'import* retires both, after which there is no claim and a lead for that form creates no `missing_mapping` job; retiring only one version leaves the form Active and claimed (the regression that motivated the fix);
  - a seeded blocked **website** job retried with `crm_retry_meta_job` after its website mapping is published finalizes once;
  - receptionist/admin/anon calls are refused (`42501`).
- Browser:
  - the director sees the panel, publishes, retires and retries, with the RPC called with the exact payload;
  - receptionist and admin cannot reach `/crm/analytics` (existing navigation/middleware suites).
- A workflow test that runs the step's script with a **stubbed `curl`** on `PATH` (no network) for HTTP 200, 424, 503 and a curl failure (exit 7): exit 0 only for 200; the generic 424 line printed for 424; today's non-2xx message for 503; the network message for exit 7. Plus a static assertion: the `alert_test` input exits 1 without calling curl, and cron/permissions/concurrency are unchanged.
- `npm run lint`, `npm run build`, `npm test`, `test:crm-intake`, `test:crm-insights`, navigation and middleware suites. The `.github/**` change puts the PR in the full CI lane.

**PR 1b**

- A local SQL suite:
  - grants: anon, receptionist and admin are denied; director and `service_role` are allowed;
  - each reason fires on a synthetic fixture and is silent without it;
  - benign poll codes are ignored;
  - `lead_gap` uses account-timezone days; selects days by completed sync-run coverage (a covered day with no Insights rows counts as 0); excludes days not yet covered 3 h after their end; never alerts when CRM > Meta; alerts at gap 2 but not 1; and a fixture shows organic leads on one form masking a gap on another (documented limit, no alert);
  - an output key allowlist proves there are no PII keys;
  - upgrade rehearsal from 118.
- Route tests: 401, 200, 424, 503; body exactly `{ok, alert}`.
- The stubbed-`curl` workflow test extended to the health step.
- A panel browser check of the banners.

**Phase 2**

- 2b: Graph fixtures for multi-pass catch-up, resume, a lost lease mid catch-up, the 28-day bound, the started_at floor and a back-dated new form; the 105 conflict suite still passes.
- 2d: mixed attributed/unattributed cohort fixtures, including the mutation tests used for B2.
- 2e: allowed/refused transitions, idempotency, the trigger exception closed outside the command.
- 2f: the redaction predicate against lifecycle fixtures; `retention_until` set in a separate earlier update and the redaction update accepted by `protect_attribution`, while a combined update is refused; lifecycle returns `identity_redacted` after redaction (fixture); batch bounds; the job created inactive.

# Rollout and recovery

Each step needs its own explicit owner approval; this plan grants none.

| Step | Action | Approval | Verification | Recovery |
| --- | --- | --- | --- | --- |
| R-LB | Widen look-back (above) | D3 + operator | Steps 0–3 above | Set 60 again |
| R1 | Merge PR 1a after fresh independent review of the exact SHA (auto-deploys) | Owner merge/release | CI green; the next pg_cron calls return 200 in `net._http_response`; the next GitHub scheduled run succeeds; the director opens the panel and sees 1 active form, 0 jobs to handle | Vercel redeploy of the previous source. Mappings published meanwhile stay valid; retire a wrong one and publish a corrected version |
| R2 | Owner checks GitHub notification settings and runs `alert_test` once | Owner | The failure e-mail is received | — |
| R3 | Apply the PR 1b migration to Production (migration first) | Owner release approval | Ledger shows the new version; `crm_get_intake_health` exists with `EXECUTE` for `authenticated, service_role` only; a service-role call returns `alert = false` | Forward migration dropping the function (no data involved) |
| R4 | Merge PR 1b after review | Owner merge/release | The next GitHub run has 2 green steps; the panel shows the health status | Redeploy the previous source |
| R5 | Launch checklist executed for the campaign; first new Meta lead proves DGI-B R4 (campaign attribution end to end) | Owner | Checklist items 1–7; DGI-B R4 counts | Per the checklist's failure section |
| Phase 2 | Per item: merge, migration, (2f) cron activation | Separate approvals | Per item tests and counts | Per item; 2f deletions are irreversible, so the first run is reviewed on counts before the job is activated |

# Expected modules

- **PR 1a:**
  - Changed: `src/lib/crm/intake/scheduler.mjs`, `src/lib/crm/meta/reconcile.mjs`, `.github/workflows/crm-intake-scheduler.yml`, `src/components/crm/MarketingAnalytics.jsx`.
  - New: `src/components/crm/LeadIntakePanel.jsx`, `src/lib/crm/intakeAdmin.mjs`, and the ratio-guard helper, in `src/lib/crm/funnel.mjs` or a new module.
  - Tests: listed above; `package.json` script wiring.
  - Docs: [crm-operations-runbook.md](../../crm-operations-runbook.md) (checklist section, incident rows, and a new row "Website form key unknown": the director publishes the website mapping with `crm_publish_website_form_mapping` through an operator snippet, then retries the job from the panel), [crm-intake-scheduler.md](../../crm-intake-scheduler.md) (424, real GitHub cadence), [crm-meta-reconciliation.md](../../crm-meta-reconciliation.md) (back-dating the first mapping), FEATURE_INDEX.
- **PR 1b:**
  - New: `supabase/migrations/XXX_crm_lead_intake_health.sql`, `src/app/api/cron/crm-health/route.js`, `src/lib/crm/intake/health.mjs`.
  - Changed: the workflow step and the panel status.
  - Tests; docs: SECURITY_RULES (new RPC and route), the runbook.
- **Phase 2:** per item, as designed above.

# Owner decisions required

**D1 — Ship the health check (PR 1b) in Phase 1?** *Blocking for Phase 1 scope.*

- **A:** yes, ship it before the campaign. It adds one small read-only migration and its release step. You are told within about one GitHub run (about 4 h) when polling fails, leads are stuck, spend is stale, or **Meta counted more leads than the CRM received** (a forgotten form).
- **B:** no. Phase 1 has no migration. Failures are reported only when GitHub's own call hits the failing poll (often hours later), stuck jobs and forgotten forms only through the panel and the daily check, and PR 1b becomes the first Phase 2 item.

**Recommendation: A**, with PR 1a merged first so that it is not held up. If the launch date leaves no time for the 1b review, launch with B, keep the daily manual comparison of checklist item 6, and ship 1b straight after.

**D2 — Where do alerts go?** *Not blocking (A is the default).*

- **A:** the GitHub failure e-mail to the `elforssa` account. It works now and needs only the notification setting.
- **B:** an e-mail from the application to the director's address. It needs a sender, a throttle and stored alert state (Phase 2).
- **C:** both.

**Recommendation: A**: you are both the director and the GitHub account owner, so A reaches you without new infrastructure. Choose B or C only if someone else (for example a partner) must also be alerted.

**D3 — Widen the Meta look-back to 24 hours now (R-LB)?** *Blocking for R-LB only.*

- **A:** yes, 1440 minutes, now. A fault fixed within a day loses nothing; each poll reads up to 2 pages instead of 1.
- **B:** wait for Phase 1.
- **C:** a smaller window, for example 720 minutes.

**Recommendation: A**: it is the cheapest protection and is reversible in one call.

**D4 — Effective date of a new form's first mapping.** *Blocking for P1-B.*

- **A:** 30 days before publication by default (editable, at most 90). Leads already submitted on the form are imported instead of getting stuck: within 24 h through R-LB, and fully after Phase 2b.
- **B:** publication time. Leads submitted before publication get stuck as "form without mapping".

**Recommendation: A.** A new form has no earlier version, so back-dating cannot change how older leads were read.

**D5 — How CPL, CPQL and CAC handle spend that has no attributed leads.** *Blocking for 2d; P1-D applies either way.*

- **A:** ratios use only spend dated on or after the attribution start (12 Oct 2026). The excluded spend and the share of Meta leads that are attributed are shown separately.
- **B:** ratios use only campaigns with at least one attributed lead. This hides the spend of campaigns that brought no CRM lead, which is exactly what a forgotten form looks like.
- **C:** keep today's arithmetic and only warn.

**Recommendation: A.**

**D6 — Rejected pre-enrollment (CRM-5).** *Blocking for 2e.*

- **A:** document the workaround only: the admin edits or reopens the linked enrollment instead of creating a new one.
- **B:** a director-only, audited **Détacher** command, allowed only when the linked enrollment is Rejected and the lead is not converted; optionally it also clears a wrong learner.
- **C:** a free relink to any enrollment, which is riskier for conversion integrity.

**Recommendation: B**, with A documented in the staff guide meanwhile.

**D7 — Retention rules (CRM-6).** *Blocking for 2f.*

- **(a) Raw copies of Meta form answers and ad-click identifiers** (the CRM keeps the lead's working fields anyway): **A** 90 days after receipt (recommended); **B** 12 months; **C** until the lead is closed + 90 days.
- **(b) Raw copies of website inquiries in the intake queue:** the same period as (a) (recommended).
- **(c) Visitor IP addresses of the pre-inscription form:** **A** keep only a keyed hash and delete after 1 hour (recommended, needs one new server secret); **B** close `/inscription` (your pre-inscription simplification plan) and purge everything.
- **(d) Contact data of closed, non-converted prospects:** **A** anonymise 24 months after closure (recommended rule; implemented in a later separate outcome); **B** 12 months; **C** no time limit, deletion only on request.

Moroccan law 09-08 (CNDP) requires keeping personal data no longer than needed. The lifecycle feature (dormant) may need the raw identifiers of recent leads, so (a) must be at least as long as any lifecycle window decided later.

**D8 — A website inquiry for a form the CRM does not know.** *Not blocking.*

- **A:** the website shows an error and the inquiry is not kept (the audit's suggestion).
- **B:** keep today's behaviour: the inquiry is stored and shown as a stuck lead in the panel, PR 1b alerts on it, and it is re-run after the form is published.

**Recommendation: B**, because no inquiry is lost, which is the outcome's goal.

# Approval record

- **Date and time:** 2026-10-24 15:53 Asia/Shanghai (UTC+08:00), 07:53 UTC.
- **Owner's words (verbatim):** "all recomended and for E6 paper numbers dont exist". The owner had been shown each plan's owner questions with the plan's recommended option; "all recomended" covers this plan (the E6 remark concerns the payment corrections plan only).
- **Channel:** chat with Claude, relayed by the coordinating session.
- **Approved revision:** LIR-r1 at exact head `aa68632` of branch `docs/plan-b-lead-intake-reliability` (PR #156).
- **Options chosen:**
  - D1 = **A** (ship the health check, PR 1b, in Phase 1; PR 1a merged first).
  - D2 = **A** (GitHub failure e-mail to the `elforssa` account).
  - D3 = **A** (widen the Meta look-back to 1440 minutes; R-LB itself is still run only with its own release approval).
  - D4 = **A** (first mapping effective 30 days before publication by default, editable, at most 90).
  - D5 = **A** (ratios use only spend dated on or after the attribution start; excluded spend and attributed share shown separately).
  - D6 = **B** (director-only, audited **Détacher** command; workaround A documented in the staff guide meanwhile).
  - D7 = (a) **A** 90 days after receipt; (b) the same period as (a); (c) **A** keyed hash, delete after 1 hour; (d) **A** anonymise 24 months after closure (later separate outcome).
  - D8 = **B** (keep today's behaviour: stored, shown as a stuck lead, alerted, re-run after publication).
- **Scope of this approval:** architecture approval for implementation of this plan only. It does not approve any merge, migration, data change, scheduled-job activation, Production configuration (including R-LB) or deployment; each needs its own explicit owner approval under [Rollout and recovery](#rollout-and-recovery).

## Review corrections (2026-10-24, after the approval)

The independent review of PR #156 at `652fbe5` returned CHANGES REQUIRED. The fixes below stay inside the approved architecture: no new RPC and no new owner decision. The approval above (revision LIR-r1 at `aa68632`) stands, together with these corrections:

- **B1:** a form is Active when any version is effective and unretired (the claim predicate). *Arrêter l'import* retires every unretired version, one existing RPC call per version, showing *Partiellement arrêté* until none remain. Recorded that publishing does not retire earlier versions (Production's form has 2 unretired versions). Multi-version local test added.
- **I1:** P1-A also alerts on outcomes with `status = 'blocked'` (`missing_policy`, `connection_disabled`). Recorded in the plan and in ADR-002 that dead-after-8-attempts is caught only by PR 1b.
- **I2:** the workflow script drops `--fail`, captures curl's exit code and branches on the HTTP status, so the generic 424 line can print. Tested with a stubbed `curl`; the same for the health step.
- **I3:** 2f sets `retention_until` in an earlier separate update (`protect_attribution` ordering); recorded that redaction makes the lifecycle return `identity_redacted` (D7(a) is a hard lifecycle cutoff); aligned with `crm_cleanup_lifecycle_retention` (103).
- **Minor:**
  - latest definitions corrected (087 for `crm_get_meta_job_mapping`; 103 for the publish/retire RPCs; `crm_insights_diagnostics` 114 listed);
  - R-LB is a `DO` block that raises unless exactly one row becomes 1440;
  - `net._http_response` scope note;
  - security wording ("displayed / logged");
  - runbook row for publishing a website mapping (D8);
  - transient poll codes: noise accepted in Phase 1, grace rule `TRANSIENT_GRACE_MIN` after 2b;
  - remaining "proposed" wording aligned with the accepted status;
  - `lead_gap` selects days by sync-run completion, and its per-connection limit is documented;
  - the test gaps listed by the review were added.

## IMPLEMENTATION CONTRACT

### Scope

- **Phase 1 = PR 1a**: P1-A, P1-B, P1-C and P1-D exactly as designed, plus, if D1 = A, **PR 1b**: H exactly as designed. Each is one branch and PR, at Tier 3.
- **Phase 2** items 2b, 2d, 2e, 2f and 2g: one PR each, started only after their owner decision is recorded, in the order 2b → 2d → 2f → 2e → 2g unless the owner reorders.
- R-LB is not part of any PR.

### Prerequisites

- Owner approval of this revision, with D1–D4 answered for Phase 1 and D5–D8 answered before the Phase 2 items that depend on them.
- Freshly fetched `origin/main`; ledger and `supabase/migrations` read for numbering.
- Local Supabase for the local suites (CI's local-database lane where the machine has none).
- No Production access.

### Object / module manifest

- **PR 1a:**
  - Changed: `src/lib/crm/intake/scheduler.mjs`, `src/lib/crm/meta/reconcile.mjs`, `.github/workflows/crm-intake-scheduler.yml`, `src/components/crm/MarketingAnalytics.jsx`.
  - New: `src/components/crm/LeadIntakePanel.jsx`, `src/lib/crm/intakeAdmin.mjs`, ratio-guard helper.
  - Tests: `scripts/test-crm-intake-scheduler.mjs`, `scripts/test-crm-meta-reconciliation.mjs`, new `scripts/test-crm-intake-admin.mjs`, new `scripts/test-crm-intake-admin-local.mjs`, browser coverage.
  - Docs as listed. No migration, no RPC change.
- **PR 1b:**
  - `supabase/migrations/XXX_crm_lead_intake_health.sql` creates `public.crm_get_intake_health()`, executable by `authenticated` and `service_role` only.
  - `src/app/api/cron/crm-health/route.js`, `src/lib/crm/intake/health.mjs`, workflow step, panel status, tests, docs.
- **Phase 2:** per [Design — Phase 2](#design--phase-2).

### Invariants

1. Scheduler and health responses carry counts, booleans and nothing else. Workflow logs print fixed generic lines only. No lead field, token, secret reference, page/account/form ID or error code reaches a public log.
2. The intake endpoint answers 424 only for the non-benign poll codes, an outcome with `status = 'blocked'`, and the `ALERT_JOB` codes defined above; every other path keeps today's status and body. A *Arrêter l'import* action retires every unretired version of the form; a form is Active exactly when the claim predicate would poll it.
3. P1-B calls only `crm_get_meta_diagnostics`, `crm_publish_meta_form_mapping` (Meta connection only, allowed keys only), `crm_retire_meta_form_mapping` and `crm_retry_meta_job`. No new RPC, no direct table access, no route-gate change.
4. A first mapping version defaults to publication − 30 days (floor − 90 days). A later version must be later than the latest existing version.
5. Mapping and attribution immutability, enqueue identity, conversion and revenue rules are unchanged in Phase 1.
6. `crm_get_intake_health` is read-only, director or `service_role` only, and its output keys are an explicit allowlist.
7. The workflow's cron expression, permissions and concurrency are unchanged; `alert_test` never calls the endpoint.
8. Migrations are additive and forward-only, numbered just before merge, and built on the cumulative definitions listed in this plan.

### Acceptance / tests

Everything in [Test strategy](#test-strategy) passes locally (where possible) and in required CI for the exact head SHA, including the full lane for the workflow change. A fresh independent review returns READY FOR FINAL REVIEW on that SHA.

### Stop conditions

Stop and report, without a workaround, if any of these is true:

- A needed RPC differs from the cumulative definition recorded here.
- P1-B would need a new RPC or a route-gate change.
- The 424 rule would expose a code in a body or log.
- The health check would need a new secret or a table grant.
- For 2b, official Meta documentation does not confirm `time_created` filtering on `/leads`.
- For 2f, the lifecycle dependency of the attribution fields cannot be stated exactly.
- For 2e, the trigger exception cannot be confined to the command.
- An owner decision this item depends on is missing or changed.
- CI cannot be scheduled.

### Docs / status reporting

- At implementation: the runbook, scheduler, reconciliation and FEATURE_INDEX docs as listed. SECURITY_RULES gets the health RPC and route (1b) and the detach command (2e). PRODUCT_RULES gets the retention rule once D7 is decided (2f), and the "first mapping is back-dated" rule (1a).
- ADR-002: the amendment is accepted (2026-10-24); record implementation evidence there at closeout.
- CURRENT_STATE: only dated Production evidence after each release, including the R-LB result.
- Hand off under the AGENTS.md implementation handoff with branch, exact head SHA, PR, tier, migration filename, tests and CI reference. The author never issues a review verdict.
