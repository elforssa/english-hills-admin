# Phase 8 — Meta inbound intake

This implements code for mocked/local verification. **Live Meta activation is not ready.** No real Page subscription, token, lead or provider request was used.

## Provider verification boundary

On 2026-09-23, requests to Meta's official Webhooks getting-started, Lead Ads retrieval and Graph API version pages returned HTTP 429. The newer documentation URLs were also unavailable. Consequently no currently supported Graph version, permission set or live subscription behavior is claimed verified.

Official references to check before activation:
- https://developers.facebook.com/docs/graph-api/webhooks/getting-started
- https://developers.facebook.com/docs/marketing-api/guides/lead-ads/retrieving
- https://developers.facebook.com/docs/graph-api/changelog/versions
- https://developers.facebook.com/documentation/ads-commerce/marketing-api/guides/lead-ads/quickstart/webhooks-integration

The isolated adapter implements the expected GET `hub.mode=subscribe`, `hub.verify_token`, `hub.challenge` handshake and POST `X-Hub-Signature-256` HMAC-SHA256 over raw bytes. These are mock-tested implementation assumptions pending current official/live verification. Graph version is required per connection and has no default. `v99.0` is an intentionally fake fixture version, never an activation recommendation.

Verify the current Page `leadgen` subscription procedure, app review/advanced access, Page lead-access assignment and token ownership. Confirm the currently required permissions (including the applicability of `leads_retrieval` and Page subscription permissions), supported fields and token renewal procedure with Meta. Do not treat historical permissions lists as sufficient.

## Runtime and secrets

Next.js Node routes use the existing server-only Supabase service client. Provider secrets exist only as server environment variables:

- `CRM_META_APP_SECRET`: app secret, verifies raw callbacks.
- `CRM_META_VERIFY_TOKEN`: independent webhook challenge token.
- `CRM_META_PAGE_TOKEN_<NAME>`: Page/System token. Connection stores only this vetted environment-variable NAME.
- `CRM_META_WORKER_TOKEN`: separate random bearer for the protected processor.

Never use `NEXT_PUBLIC_` for these secrets. No secret values belong in mappings, connection settings, RPC arguments, source files or logs. `settings` is deliberately restricted to `{}`. Error output uses fixed codes, never provider messages.

Optional Vault values `crm_meta_worker_url` and `crm_meta_worker_token` enable the existing pg_net-style durable initial wake-up. The latter must match the server worker bearer; Vault contains no Meta tokens. The URL must be HTTPS and end in `/api/internal/crm/meta/process`. No values are seeded. A failed wake-up cannot roll back accepted intake. Configure a protected periodic invocation for due retries; pg_cron is not assumed installed.

## Endpoints

- `GET /api/webhooks/meta/leads`: challenge only; constant-time token comparison.
- `POST /api/webhooks/meta/leads`: maximum 128 KiB raw body, signature before JSON parsing, up to 100 allowlisted Page/lead notifications, one transactional durable RPC before 200. Database failure returns 503. Unknown Pages are ignored; configured disabled Pages retain blocked jobs. No lead retrieval occurs in this request.
- `POST /api/internal/crm/meta/process`: worker bearer OR authenticated stored director role with same-origin request. Up to three jobs. No arbitrary request payload or job override. A director can call this endpoint with their session after inspecting diagnostics/retrying a job.

Core retrieval requests `/{lead-id}?fields=id,created_time,form_id,ad_id,field_data` over the configured Graph version, fixed graph.facebook.com host, Authorization bearer header, redirect denial, eight-second timeout and bounded response. Optional ad/campaign/adset names are retrieved separately; their failure leaves partial attribution and does not block intake. No campaign objective restriction exists.

## Configuration commands

All configuration/diagnostic commands require the stored director role. Browser roles receive no direct table access.

1. `crm_save_meta_connection(p_data, p_id=null, p_version=null)` creates disabled metadata. Fields: `connection_key`, `page_id`, `account_id`, `api_version`, `access_token_secret_ref`. Updates require ID/version and unchanged Page/key; include `enabled` explicitly. Creates always remain disabled.
2. `crm_publish_meta_form_mapping(p_connection,p_data)` publishes immutable versions. Fields: `form_key`, `form_name`, `field_map`, `question_labels`, `default_session_type`, `default_program_interest_text`, `effective_from`. Example field map: `{"contact_name":"full_name","phone":"phone_number","learner_name":"child_name"}`. Mapping is canonical-field → provider-question-key, independent of campaigns. The greatest effective time not after provider occurrence wins; retired versions remain available for earlier occurrences. Intentional backdating can support previously blocked callbacks; existing submissions are never reinterpreted.
3. `crm_retire_meta_form_mapping(p_mapping)` retires without changing its field interpretation.
4. `crm_get_meta_diagnostics(p_limit,p_offset)` reads configuration and sanitized paginated job status, never raw lead data or secret values.
5. `crm_retry_meta_job(p_job)` retries blocked/retry jobs below the eight-attempt limit; completed/dead jobs cannot be restarted through this command. Attempt count is preserved.

## Processing and matching

Job identity is `(connection, leadgen, page-id:lead-id)`. Claims use SKIP LOCKED, a fresh UUID lease and a two-minute expiry. Stale workers cannot finalize or change an error state. Expired claims recover; eight failed attempts stop further automatic work. Transient failures use exponential backoff capped at one hour. Configuration/auth failures block. Malformed core provider data is terminal. Disabled connections cannot be claimed or finalized.

The service-only finalizer atomically creates submission, protected attribution, contact/opportunity outcome, activities and first-contact task, then marks done. No student, placement, enrollment or finance writes occur. A global transaction-scoped intake lock serializes conservative contact resolution; no network request runs under it. Missing policy keeps the normalized immutable submission plus blocked job. Missing mapping keeps the durable callback, allowing retrieval and normalization after configuration.

Contact reuse requires one phone/email candidate plus the same normalized contact name, with no conflicting supplied contact details. Phone/email alone never merges contacts. Multiple candidates or insufficient learner/program evidence produce operational review. One compatible ACTIVE opportunity is reused; different learner/program produces another opportunity under the corroborated contact. Closed/converted opportunities are never reopened or reused: a sufficiently identified new inquiry creates a new opportunity. First touch remains fixed; latest touch compares `(occurred_at, received_at, UUID)`.

New opportunities are unassigned. Tasks use the existing Casablanca `next_window` function and the current frozen follow-up policy. Due time is received time plus SLA, rolled forward and never scheduled before processing time. No separate scheduler algorithm was introduced.

## Operational review

Today contains a compact **À vérifier** section only when operational ambiguity exists. Staff can review safe answers, explicitly attach to a suggested active prospect, create a separate contact/prospect after filling learner/program information, or reject invalid intake. The RPC also supports creating a lead under an explicitly selected existing contact with its version. Configuration failures stay out of this queue.

`crm_resolve_meta_intake` uses submission-state locking, actor-scoped idempotency and lead/contact version checks. It does not merge contacts or alter accepted acquisition answers. Corrections to unresolved normalized fields are retained in the command audit; original answers/attribution remain immutable. The Phase 3 resolver is user-only and uses a different latest-touch tie-breaker; the narrow Phase 8 private helper supports integration actors and the required three-part ordering without rewriting Phase 3.

## Retention and activation

`retention_until` remains NULL. A formally approved PII/raw-payload retention policy is required before activation; no redaction scheduler was introduced.

Activation requires separate authorization for production migrations 077–086 in order, active follow-up policy, verified current Meta API/permissions, approved app and Page access, runtime secrets, published form mappings, verified production callback URL, durable worker wake-up and retry scheduling, observability of blocked/dead jobs, and an authorized live-provider test. Only then explicitly enable the connection. This phase performs none of those production/account steps.
