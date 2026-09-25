# Phase 9 — website CRM inquiries

This repository has an admin application and official public pre-registration, not a marketing landing page. No marketing page was invented. `/api/public/inscription` and its student/enrollment behavior are unchanged. The external landing site must integrate the helper/contract below.

## Endpoint and public contract

`POST /api/public/crm-inquiry`, `Content-Type: application/json`, from the exact configured origin. OPTIONS exists only for credential-free CORS preflight; GET cannot ingest. Example:

```json
{
  "site_key": "english-hills-main-site",
  "form_key": "annual-children",
  "request_key": "a7a70a84-9711-4f99-a60c-1a641a57d991",
  "contact": {"name": "Parent name", "phone": "0612345678"},
  "answers": {"child": "Learner name", "age": 12, "preferred_days": ["Lundi", "Mardi"]},
  "attribution": {"landing_page": "https://example.com/annual", "utm_source": "facebook"},
  "consent": true
}
```

Contact envelope: optional `name`, `phone`, `email`, `whatsapp`; at least a Phase 3-valid phone OR valid email is required. Email-only inquiries are allowed by the existing contact model. The contact envelope is authoritative for contact methods; the mapping may supply contact name when omitted. Missing learner/program information goes to operational review, not an invented match.

`answers` allows up to 60 question keys, each at most 100 characters. Values are strings (2,000 characters), finite numbers, booleans, or up to 30 scalar choices. Body limit: 32 KiB. Optional `honeypot` must be empty. Unknown top-level/contact/attribution fields are rejected. Reserved tracking/browser-metadata answer keys are discarded before durable intake and again by shared normalization; they cannot enter operational answers. No SQL/CRM identifiers or matching results appear in the public response.

Success is always:

```json
{"success":true,"message":"Merci. Votre demande a bien été reçue."}
```

This means durably received, not fully resolved. Missing policy/mapping never makes the parent receive an internal configuration error. Genuine storage failures return generic retry guidance. Disabled/unconfigured origins reject intake; enabling a connection is an explicit director action.

## Idempotency and abuse controls

Generate one UUID per attempt and retain the prepared payload for retries. Reuse the same UUID and accepted business payload after a network failure. Changed business data with the same site/form/UUID conflicts (409). Challenge tokens and honeypot are transport controls, not part of the stored business hash. JSON object key order does not affect the database hash. No contact/child fields are stored in browser storage by the helper.

The endpoint uses the existing `anon_rate_limits` table through a new service-only function with a fixed 10 requests/hour limit. Existing registration rate functions are unchanged. `CRM_WEBSITE_RATE_LIMIT_SECRET` must be a strong server-only secret. Only an HMAC pseudonym of the proxy-provided IP is stored, never the IP or headers. Old website limiter entries are removed after the one-hour window when the limiter runs. A missing IP shares a conservative unknown-address bucket.

Deploy only behind the trusted Vercel/edge proxy that overwrites client address headers; do not expose an origin that trusts client-supplied `x-real-ip`/`x-forwarded-for`. Origin policy is a browser boundary, not authentication or a bot defense by itself.

If `TURNSTILE_SECRET_KEY` is configured, server verification is mandatory. The external widget must use action `crm_inquiry`; response hostname must match the configured origin. No visitor IP is sent to Cloudflare. Verification uses bounded responses and an eight-second timeout. Challenge idempotency is bound to site/form/request/payload/token, so replaying a challenge for different data is not authorized. A previously durable identical request is acknowledged without consuming another challenge.

Cloudflare's official server-side validation documentation was checked on 2026-09-24: tokens require server verification, expire after five minutes, are single-use, and Siteverify supports idempotency keys. Reference: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
Vercel header reference: https://vercel.com/docs/headers/request-headers

Tests use fake secrets and mocked verification only. No production secrets or account settings were changed.

## External site helper

Import/copy `src/lib/crm/website/client.mjs` together with `attribution.mjs` into the external site's build. Do not include server modules or Supabase keys.

```js
const attribution = captureWebsiteAttribution({ consent: attributionConsentGranted });
const attempt = prepareWebsiteInquiry({
  site_key: 'english-hills-main-site', form_key: 'annual-children',
  contact: { name, phone, email }, answers: { child, age },
  attribution, consent: inquiryConsentGranted
});
// Keep `attempt` unchanged when retrying. Refresh a failed/expired challenge separately.
await submitWebsiteInquiry('https://ADMIN_HOST/api/public/crm-inquiry', attempt, { turnstileToken });
```

Call attribution capture on the initial landing page and subsequent pages only after the site's required consent. Session storage is origin-scoped and expires after 30 minutes; this is temporary browser state, not a database retention policy. The initial landing/UTMs survive navigation. Newly available existing `_fbc`/`_fbp` values may fill missing fields without replacing earlier observations. No cookies are created, no IDs are generated from fbclid, no pixel or third-party tracking request is introduced. With consent false, the helper clears its own storage entry.

The helper reads only the two named cookies, never sends a cookie collection, and stores no contact data. Attribution storage failure does not block the form.

## Attribution trust and privacy

Website fields are unverified observations: landing_page, referrer, the five UTMs, fbclid, fbc, fbp. UTM/click values are preserved subject to bounds; absent values stay NULL. Landing-page query and fragment are removed, and its origin must match the site. Referrer is reduced to its origin. Landing paths must be public routes without embedded personal IDs/tokens.

No campaign_id, adset_id, ad_id, Page ID or Meta lead ID is inferred or accepted. No Meta request is made because a click ID exists. Website attribution is `partial` when observations exist, otherwise `unavailable`, never provider-verified `complete`. `captured_at`, submission received time and website occurrence time are server receipt time; client timestamps cannot manipulate touch ordering. Raw browser objects/headers/cookies/IPs are not copied into attribution. Consent records only acceptance and server receipt time.

All tracking stays in protected attribution/job data, outside operational answers and receptionist projections. `retention_until` remains NULL; a formal database/job retention policy and future controlled cleanup remain activation dependencies.

## Director configuration

Use stored-director-only commands:

1. `crm_save_website_connection(p_data,p_id=null,p_version=null)`: create `connection_key` and canonical exact `origin`, disabled by default. No Meta Page, API version, account or token fields. Update with the same key/origin and expected version to set `enabled`.
2. `crm_publish_website_form_mapping(p_connection,p_data)`: same canonical mapping contract as Meta, website form slug instead of numeric Meta form ID. Example: `field_map={"learner_name":"child","learner_age":"age"}`, `question_labels={"child":"Apprenant","age":"Âge"}`, default session/program and effective time. Versions are immutable. Set effective time at/before queued inquiries when repairing an unknown form; do not reinterpret accepted submissions.
3. Existing `crm_get_meta_diagnostics`, `crm_retire_meta_form_mapping`, and `crm_retry_meta_job` remain compatible shared configuration/diagnostic/retry commands despite their legacy names. They support website records without changing authorization.

Website and Meta shape constraints remain separate; a website mapping/job cannot belong to a Meta connection or vice versa. No browser table access was added.

## Shared durability and processing

Website requests persist `website_inquiry` jobs in the existing queue. Job identity is connection + event kind + form/UUID. Unknown forms keep the original bounded inquiry for later mapping. Workers use the same status, lease, backoff, attempt limits and fencing as Meta.

`POST /api/internal/crm/intake/process` and the compatible legacy Meta processing URL share authorization and a bounded worker. Website jobs need no Page token and never call Meta. The existing optional pg_net wake-up uses `crm_meta_worker_url` / `crm_meta_worker_token`; the legacy URL now dispatches both channels. No new scheduler or retry table was introduced. Periodic retry invocation still must be configured before live activation.

Both channels call one private `resolve_external_submission` and one acceptance/task helper. The same transaction lock prevents cross-channel duplicate opportunity races. First touch is whichever accepted submission creates the opportunity, then immutable; latest touch compares `(occurred_at,received_at,UUID)`, independent of channel. Delayed retries keep the original durable receipt time. Existing active opportunity reuse, shared-family safeguards, sibling/program separation, closed/converted behavior and calling windows are unchanged.

Shared `À vérifier` uses `crm_resolve_external_intake`; the legacy Meta RPC remains compatible. No receptionist UI redesign. No conversion or revenue changes: website first-touch naturally remains the Phase 7 revenue attribution source.

## Activation checklist

Separate authorization is required for production migrations 077–087. Configure an active policy, disabled website connection with the real origin, published mappings, strong rate-limit secret, appropriate Turnstile configuration/consent flow, trusted edge headers, shared worker wake-up and retry scheduling, and retention/operational handling of blocked/dead jobs. Wire and verify the actual external landing-page helper/form. Only then explicitly enable the connection.

No production deployment, real website changes, Meta delivery, Insights or Phase 10+ functionality is included.
