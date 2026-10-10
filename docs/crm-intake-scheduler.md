# Phase 14 CRM intake scheduler

> **Evidence boundary:** dated baseline/rollout statements below are historical, not a current deployment inventory. See [CURRENT_STATE](ai/CURRENT_STATE.md) and [active contracts](architecture/plans/README.md).

## Trigger architecture

`GET https://admin.english-hills.com/api/cron/crm-intake` remains the only scheduled intake path. It authenticates `Authorization: Bearer <CRM_INTAKE_SCHEDULER_TOKEN>`, performs one bounded reconciliation pass, then claims at most three ingestion jobs (or two after discovery). Its JSON response contains fixed operational counts only and never contains lead fields, provider payloads, tokens, or other PII.

Migration 095 makes Supabase Cron the primary trigger. The stable `crm-intake-primary` job runs `*/5 * * * *` and calls the existing endpoint asynchronously through `pg_net`. The request has a 65-second timeout around an endpoint with a 60-second platform limit. `pg_net` begins the request only after the cron transaction commits. Its normal six-hour response record therefore contains only the endpoint's operational counts.

The GitHub Actions workflow remains at its existing five-minute cadence as a backup. Both triggers use the same dedicated scheduler bearer and endpoint. Concurrent calls are safe: reconciliation claims use a 55-second lease, ingestion claims use `FOR UPDATE SKIP LOCKED` and leases, and each provider event has a unique queue identity. The scheduler regression test invokes the route twice concurrently and proves that one queued job finalizes once.

The Meta Insights scheduler (`GET /api/cron/crm-insights`, job `crm-insights-primary`, migration 114) reuses this Vault → pg_cron → `pg_net` pattern with its own bearer `CRM_META_INSIGHTS_SCHEDULER_TOKEN`, Vault names `crm_insights_scheduler_url`/`crm_insights_scheduler_token`, an invoker that accepts only the exact Production URL, a 30-minute schedule and no GitHub backup. Its job is created inactive. See the [Insights scheduler contract](crm-meta-insights.md#scheduler).

## Vault configuration

The migration contains no endpoint or token value. The private database invoker reads exactly these Vault names at run time:

- `crm_intake_scheduler_url`: `https://admin.english-hills.com/api/cron/crm-intake`
- `crm_intake_scheduler_token`: the exact value of Vercel Production `CRM_INTAKE_SCHEDULER_TOKEN`

The URL must be HTTPS, must have no query string, fragment, credentials, or arbitrary path, and must end exactly in `/api/cron/crm-intake`. Missing, blank, oversized, or malformed configuration raises a sanitized error before `pg_net` queues a request. Configure both values before applying migration 095 so the first scheduled run can succeed.

Use a protected Supabase SQL session. Replace the token placeholder only in that protected session; never commit it, paste it into logs, or include it in review output.

```sql
-- URL: update if present, then create if absent.
select vault.update_secret(
  id,
  'https://admin.english-hills.com/api/cron/crm-intake',
  'crm_intake_scheduler_url',
  'CRM intake scheduler endpoint'
)
from vault.secrets
where name = 'crm_intake_scheduler_url';

select vault.create_secret(
  'https://admin.english-hills.com/api/cron/crm-intake',
  'crm_intake_scheduler_url',
  'CRM intake scheduler endpoint'
)
where not exists (
  select 1 from vault.secrets where name = 'crm_intake_scheduler_url'
);

-- Token: replace the placeholder with the matching Vercel Production value.
select vault.update_secret(
  id,
  '<VERCEL_PRODUCTION_CRM_INTAKE_SCHEDULER_TOKEN>',
  'crm_intake_scheduler_token',
  'CRM intake scheduler bearer'
)
from vault.secrets
where name = 'crm_intake_scheduler_token';

select vault.create_secret(
  '<VERCEL_PRODUCTION_CRM_INTAKE_SCHEDULER_TOKEN>',
  'crm_intake_scheduler_token',
  'CRM intake scheduler bearer'
)
where not exists (
  select 1 from vault.secrets where name = 'crm_intake_scheduler_token'
);
```

Verify presence without selecting decrypted values:

```sql
select name, created_at, updated_at
from vault.secrets
where name in ('crm_intake_scheduler_url', 'crm_intake_scheduler_token')
order by name;
```

## Safe diagnostics

These owner-only queries expose status and timestamps, not secrets, request bodies, response bodies, or lead data.

```sql
select jobid, jobname, schedule, active
from cron.job
where jobname = 'crm-intake-primary';

select status, start_time, end_time, return_message
from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'crm-intake-primary')
order by start_time desc
limit 20;

select status_code, timed_out, error_msg, created
from net._http_response
order by created desc
limit 20;

select connection_id, form_key, updated_at, next_due_at, last_error_code
from public.crm_meta_reconciliation_state
order by next_due_at, connection_id, form_key;
```

The `pg_net` status query is intentionally metadata-only and may include requests from other database wake-ups. Correlate its time with the cron run; never select the response `content` column during routine diagnostics.

## Production activation

1. Confirm migration 094 and the application endpoint are already deployed.
2. Confirm Vercel Production and GitHub Actions use the intended `CRM_INTAKE_SCHEDULER_TOKEN` without printing it.
3. Store/update both Vault values with the protected commands above.
4. Apply migration 095 through the reviewed production migration process. This installs `pg_cron` in its configured database and creates or replaces the single named job.
5. After the next five-minute boundary, inspect cron run status, metadata-only `pg_net` status, and reconciliation `updated_at`/`next_due_at`/`last_error_code`.
6. Keep GitHub Actions enabled as backup. Do not add another worker or intake path.

Rollback of the scheduler trigger, if separately authorized, is `select cron.unschedule('crm-intake-primary');`. It does not disable reconciliation, remove Vault values, alter queue data, or change the backup workflow.
