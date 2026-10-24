# CRM operations and activation gates

> **Evidence boundary:** dated baseline/rollout statements below are historical, not a current deployment inventory. See [CURRENT_STATE](ai/CURRENT_STATE.md) and [active contracts](architecture/plans/README.md).

> Implementation/activation reference with historical phase notes. Deployment and enablement statements below describe that phase, not necessarily the present environment; consult [CURRENT_STATE](ai/CURRENT_STATE.md). Later reconciliation/scheduling behavior is documented in [ADR-002](architecture/decisions/ADR-002-meta-intake-and-reconciliation.md).

Phase 12 is a local release-readiness review. This document grants no deployment, live-provider or production-write permission. Use with [rollout](crm-production-rollout.md), [acceptance checklist](crm-release-checklist.md), [Meta inbound](crm-meta-ingestion.md), [website](crm-website-inquiries.md), [lifecycle](crm-meta-lifecycle.md) and [Insights/reporting](crm-meta-insights.md).

## Observe without exposing customer data

Receptionists handle operational lead tasks and intake ambiguity through authorized CRM commands. Directors own policy, mappings, attribution/revenue review and integration diagnostics. The release operator owns deployed versions, secrets, schedules and infrastructure. Record incident IDs, sanitized status codes, lease expiry and counts, never tokens, raw provider bodies, contact details or financial notes in incident logs.

After migrations, [crm-release-health.sql](../scripts/crm-release-health.sql) runs entirely READ ONLY. It lists ledger range, CRM RLS, trigger states, queue counts, enabled connections/settings and worker-secret **names/counts only**. It is not a migration verifier, an alerting service or a 076-compatible preflight. Compare all expected trigger names/definitions and grants against the approved schema; a list alone cannot prove nothing is missing. Investigate any disabled trigger, disabled RLS, growing retry backlog, old lease, conversion-review flag or incomplete Insights freshness. Do not log returned lead detail to monitor health.

## Safe disables and recovery

Disabling external integrations must leave manual CRM, placement, enrollment, finance and history available. The integrated Phase 12 test exercises manual work after all external settings are off. Disable affected schedulers first, then the connection/configuration; allow already running requests to finish or their leases to expire. A response already sent to a provider cannot be recalled. Do not claim a connection switch cancels an in-flight HTTP request.

Use an authenticated **stored director role**, inspect the current connection and version, and preserve its identity. Execute only the chosen action after the applicable production approval. Check RPC errors before proceeding. A `PT409` (legacy `40001`, [ADR-009](architecture/decisions/ADR-009-conflicts-never-retryable.md)) means refresh/review; do not blindly retry with an invented version. The following are operator snippets, not an application feature or an instruction to run them now:

```js
// c is the verified current connection record; fields below are metadata only.
// Website: disabled origins reject new acceptance, already accepted jobs remain.
await supabase.rpc('crm_save_website_connection', {
  p_id: c.id, p_version: c.version,
  p_data: { connection_key: c.connection_key, origin: c.settings.origin, enabled: false }
});

// Meta inbound: preserve Page/key/account/version and secret REFERENCE.
await supabase.rpc('crm_save_meta_connection', {
  p_id: c.id, p_version: c.version,
  p_data: { connection_key: c.connection_key, page_id: c.page_id,
    account_id: c.account_id, api_version: c.api_version,
    access_token_secret_ref: APPROVED_EXISTING_PAGE_SECRET_REFERENCE, enabled: false }
});

// Outbound: use the META destination connection, not its website source.
// Read responses omit secret_ref; obtain the reference from approved config.
// Do not spread returned lifecycle JSON: version/not_before are output-only.
await supabase.rpc('crm_configure_lifecycle', {
  p_connection: c.id, p_version: c.version,
  p_data: { mode: 'mock', enabled: false, dataset_id: c.lifecycle.dataset_id,
    api_version: c.lifecycle.api_version, secret_ref: APPROVED_EXISTING_LIFECYCLE_SECRET_REFERENCE,
    events: c.lifecycle.events, action_source: c.lifecycle.action_source,
    allow_later_meta: c.lifecycle.allow_later_meta, max_attempts: c.lifecycle.max_attempts }
});

// Insights: preserve immutable account/currency/timezone, refresh metadata.
await supabase.rpc('crm_configure_insights', {
  p_connection: c.id, p_version: c.version,
  p_data: { mode: 'mock', enabled: false, account_id: c.insights.account_id,
    currency: c.insights.currency, timezone: c.insights.timezone,
    api_version: c.insights.api_version, secret_ref: APPROVED_EXISTING_INSIGHTS_SECRET_REFERENCE,
    refresh_days: c.insights.refresh_days }
});
```

Website form mapping (decision D8 of [LIR-r1](architecture/plans/lead-intake-reliability.md)): the panel shows website mappings read-only, so a new website form key is published with this director snippet. `w` is the website connection from `crm_get_meta_diagnostics` (`provider = 'website'`); the form key is lowercase (`^[a-z][a-z0-9_-]{0,63}$`) and the effective date must precede the first stuck inquiry.

```js
await supabase.rpc('crm_publish_website_form_mapping', {
  p_connection: w.id,
  p_data: { form_key: 'campaign_form_key', form_name: 'Campagne …',
    field_map: { learner_name: 'child' }, default_session_type: 'Yearly',
    learner_policy: 'optional', effective_from: '2026-10-01T00:00:00Z' }
});
```

Refresh connection/version between independent writes. If no lifecycle/Insights configuration exists it is already off: do not create fake metadata just to disable it. Disabling a shared Meta destination also holds website lifecycle delivery routed there. Inbound, outbound and Insights settings are separate; changing inbound alone is not an outbound kill switch. Stop each relevant invocation schedule explicitly. Removing CRM wake-up secrets, if separately approved, must target only `crm_meta_worker_url` / `crm_meta_worker_token`; do not remove receipt/email secrets or disable shared pg_net/database triggers.

Recovery order: hold the affected feature/workers; inspect last committed migration and lease/config states; preserve accepted jobs, immutable submissions, activities, revenue and attempts; deploy a reviewed forward repair; resume a small explicit eligible retry and observe. Never drop CRM tables, reset migration history, delete captured leads, reset attempt counts, edit first touch or manufacture financial/conversion evidence. An app rollback is conditional once CRM-linked enrollments exist: an old payment form may omit the explicit enrollment and be safely rejected. Prefer a current-app repair to weakening that safeguard. The new app cannot run on schema 076.

## Incident handling

| Issue | Owner / inspect | Safe action | Do not do |
|---|---|---|---|
| GitHub e-mail “CRM Intake Scheduler” failed (intake answered 424) | Director; *Analyse marketing → Réception des leads* (status line, *Leads à traiter*) | Read the job reason in the panel and follow the matching row below. A token problem goes to the operator; fixed within the 24-hour look-back, every lead is recovered automatically | The public run log prints one generic line only; never add codes, counts or IDs to it |
| Meta/shared job blocked or retries rising | Director + operator; *Réception des leads* or `crm_get_meta_diagnostics` and sanitized code/lease | Fix cause, then **Réessayer** in the panel (`crm_retry_meta_job(p_job)`); the job-kick trigger processes it at once | Do not acknowledge storage failure as accepted; no direct status/lease updates |
| Unknown form / missing mapping (Meta) | Director; *Réception des leads → Formulaires importés* | **Publier** the form; a first version keeps the proposed effective date (30 days back), so it precedes the stuck leads; then **Réessayer** | Do not guess a form or alter original attribution |
| Website form key unknown (website `missing_mapping`) | Director; the panel lists website mappings read-only | Publish the website mapping with the operator snippet below (`crm_publish_website_form_mapping`, effective date before the stuck inquiry), then **Réessayer** the job in the panel | Do not reject or delete the stored inquiry; do not reuse a Meta form ID |
| Dead job (8 attempts or invalid data) | Director; *Leads à traiter* row marked non réessayable | Recover the lead from Meta's Leads Center (or the website inquiry) and enter it by hand | No direct status or attempt-count update |
| No active follow-up policy | Director; policy read and job diagnostic | Bootstrap approved real hours using rollout procedure; retry | Do not invent always-open scheduling or discard accepted inquiries |
| Ambiguous intake / family shared phone | Receptionist for operational review; director for protected evidence | Review learner/program/contact candidates and use explicit resolver; preserve separate siblings/programs | Do not merge on phone alone or delete unresolved submissions |
| Lifecycle blocked / suppressed / unknown result | Director + operator; `crm_list_external_deliveries` and attempts | Inspect consent, destination, mode, lease and stable event ID. Retry only if explicit RPC permits it | No bulk replay, new event IDs or claim that an ambiguous timeout means provider rejection |
| Expired/missing token | Operator, director; sanitized `provider_auth` / `missing_secret` | Hold provider, rotate approved server secret through secret manager, retain reference if appropriate; authorized bounded retry | No token in browser, database JSON, chat, screenshots or logs |
| Insights failed/partial/stale | Director + operator; `crm_insights_diagnostics`, completed timestamp/range | Correct config/provider cause and `crm_retry_insights_sync(p_run)` if eligible; verify complete atomic publication | Do not present partial data as fresh, zero unavailable spend, sum reach, or apply implicit FX |
| Revenue reconciliation pending | Director finance reviewer; `crm_get_revenue_reconciliation_queue` | Review actual enrollment/receipt/financial-event evidence; use existing audited reconciliation/correction RPC | No manual ledger insert, second subtraction, charge-as-revenue or lifecycle change |
| Conversion review required | Director; linked enrollment and trusted conversion activity | Review legitimate closed-lead conversion evidence and apply existing authorized review path where available | Do not silently unconvert on downgrade or invent a new correction policy |
| Migration error / lock timeout | Release operator | Stop sequence, inspect transaction and ledger; resolve lock cause and forward-complete only reviewed unapplied file | No blanket rerun, ledger repair to skip work, destructive rollback or unreviewed SQL |

Queue retry limits and immutable payload rules are detailed in the linked integration contracts. A retry RPC denial is a safety boundary, not an invitation to bypass it with owner SQL. Unhandled business decisions go to the director/product owner.

## Campaign launch checklist

From [LIR-r1 P1-C](architecture/plans/lead-intake-reliability.md#p1-c--campaign-launch-checklist-pr-1a-copied-into-crm-operations-runbookmd). The director panel is *Analyse marketing → Réception des leads* on `/crm/analytics`.

**Before the ads go live (the day before):**

1. In Ads Manager, note the Instant Form used by **every** ad of the campaign (ad → *Formulaire instantané* → form ID). A duplicated form has a new ID.
2. In *Réception des leads*, check each form ID. If it is not listed as Actif, use **Publier un formulaire Meta**: copy the closest existing form, set name, session type, program and learner policy, and keep the proposed effective date (30 days back for a new form).
3. Confirm the status line shows the **24 h** look-back (R-LB done), and that *Leads à traiter* is empty.
4. Send **one test lead** on each new form with Meta's Lead Ads Testing Tool. Within about 15 minutes it must appear as a new opportunity with name and phone filled in. Close it as lost with the reason "test". If fields are empty, the form's questions differ: publish a new version with the right keys.
5. Once only: confirm that GitHub e-mails you about failed workflows (GitHub → Settings → Notifications → Actions). Optionally run *CRM Intake Scheduler* manually with `alert_test` checked and check that the failure e-mail arrives; that run calls nothing.

**While the campaign runs (twice a day for the first three days, then daily):**

6. Compare yesterday's form leads in Ads Manager with yesterday's Meta leads in *Analyse marketing* (Source = Formulaire Meta, both dates set to yesterday).
7. *Leads à traiter* must be empty, and the spend line must not be red.

**If a GitHub failure e-mail arrives:** open the panel and follow the [incident rows](#incident-handling). Beyond 24 hours, or with more than 50 leads waiting, export the missing leads from Meta's Leads Center and enter them by hand.

**After the campaign:** leave the mapping active while the form exists in Meta, because late leads still arrive. **Arrêter l'import** only when the form is archived. It retires every unretired version of the form, one call each; if a call fails the form shows *Partiellement arrêté* and **Terminer l'arrêt** finishes it. A stopped form is resumed only by publishing a new version.

The GitHub backup runs only about 5–6 times a day: a 424 e-mail can arrive hours after the fault. The 24-hour look-back is what keeps a fault fixed within a day from losing leads.

## Meta live activation — separate approval required

- [ ] Verify a currently supported Graph API version against official Meta documentation; fixture `v99.0` is invalid for deployment.
- [ ] Confirm app/Page ownership, business access, required permissions, review/access level and Lead Ads retrieval with the intended token.
- [ ] Verify production HTTPS callback URL, GET verification, raw-body HMAC signature, Page subscription and replay behavior.
- [ ] Store app secret, verify token, Page token and worker bearer only through the server secret process; test rotation without logging values.
- [ ] Publish real form mappings, identity fields and effective dates; verify unknown/ambiguous intake handling.
- [ ] Approve retention/deletion handling for raw accepted intake and operational data; assign monitoring/retry ownership.
- [ ] Configure bounded invocation/retry scheduling and alert routing; prove disabled connection blocks processing safely.
- [ ] Separately approve one live test lead and reconcile provider receipt → durable job → exactly one submission/opportunity/task.
- [ ] Before outbound, verify permitted lifecycle event names, destination/dataset, action source, matching identity and contact-sharing consent evidence. Exclude child name/DOB and finance notes.
- [ ] Implement/review a live lifecycle transport and scheduler in a separate authorized change. Current lifecycle configuration and worker contract are mock-only; enabling a fixture is not live activation.
- [ ] Director and release owner sign separate inbound/outbound activation records. No bulk historical sending is implied.

## Website live activation — separate approval required

- [ ] Verify production `/api/public/crm-inquiry` endpoint and exact approved origin; keep connection disabled until review is complete.
- [ ] Verify actual website form mapping, learner/contact fields and explicit privacy/consent text; no invented consent.
- [ ] Integrate the documented idempotency helper: reuse the same request identity and payload after uncertain responses.
- [ ] Verify UTM capture and observed fbclid/fbc/fbp behavior without guessing trusted Meta campaign/ad identities.
- [ ] Provision strong server-only rate-limit secret and trusted edge IP handling; test abuse limits and CORS/origin denial.
- [ ] If Turnstile is chosen, verify production site/secret, expiry and challenge retry; approve any decision to omit it.
- [ ] Verify durable acceptance, shared worker invocation/retry schedule, missing-mapping/policy handling and monitoring ownership.
- [ ] Approve retention, operational response SLA and one live test inquiry; reconcile acceptance through lead/task.
- [ ] Explicitly authorize enabling this connection; Meta and outbound remain independently off.

## Insights live activation — separate approval required

- [ ] Verify real ad account, ownership/access, currently supported API version, permissions and server token.
- [ ] Confirm actual account currency and timezone; preserve these immutable identities. MAD revenue with EUR spend must show ROAS unavailable.
- [ ] Review bounded sync range, refresh/revision window, historical backfill, pagination, async creation/poll lifecycle and provider rate limits.
- [ ] Implement/review the live transport and scheduler separately. Current adapter has injected mock transport only; no live processing endpoint exists.
- [ ] Set freshness/error ownership, retry/backoff and alert thresholds; preserve prior completed snapshots on partial fetch.
- [ ] Reconcile one authorized complete period with Ads Manager at the same account/date/level/currency before enabling analytics spend use.
- [ ] Record separate activation approval; do not equate codebase readiness with current provider certification.
