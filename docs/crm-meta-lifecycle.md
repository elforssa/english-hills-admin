# Phase 10 — CRM lifecycle outbox (mock-only)

Code readiness and live activation are separate. This phase has **no live send path**. The server endpoint only reconciles committed CRM milestones; the outbound worker requires an injected mock HTTP function. No environment variable can turn this implementation into a live sender. No real Meta destination, token, app, dataset or account was configured.

## Evidence and provider assumptions

On 2026-09-24 the official Meta CRM integration, Lead Ads integration, server-event, customer-information, deduplication, getting-started and Graph version pages were attempted. They were inaccessible or returned HTTP 429:

- https://developers.facebook.com/docs/marketing-api/conversions-api/guides/crm-integration/
- https://developers.facebook.com/docs/marketing-api/conversions-api/guides/lead-ads-integration/
- https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/server-event/
- https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters/
- https://developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events/
- https://developers.facebook.com/docs/marketing-api/conversions-api/get-started/
- https://developers.facebook.com/docs/graph-api/changelog/versions/
- https://developers.facebook.com/docs/permissions/
- https://developers.facebook.com/docs/app-review/
- https://developers.facebook.com/docs/marketing-api/conversions-api/using-the-api/

Meta's maintained parameter-builder repository was readable: https://github.com/facebook/capi-param-builder/blob/main/php/README.md. It demonstrates normalized SHA-256 email/phone matching and browser fbc/fbp fields in user_data. This does **not** establish the current CRM event names, valid Graph version, dataset entitlement, permissions/app review, exact CRM lead_id contract, event age limits or lawful sharing requirements for this account.

`FixtureQualified`, `FixtureConverted`, `v99.0`, lead_id matching, system_generated action source and events_received=1 are explicit mock configuration/contract fixtures, not claims of a currently approved live integration. Website acquisition does not imply action_source=website: this phase models a later CRM milestone, and deliberately does not support website-origin event payloads requiring source URL/IP/user-agent until their requirements are verified. No IP/user-agent was added to acquisition or delivery data.

## Data and state model

Migration 088 adds only crm_external_deliveries and crm_external_delivery_attempts, plus separate lifecycle_settings and lifecycle_destination_id columns on existing integration connections. No CRM command, enrollment trigger or revenue function calls this outbox or performs external HTTP.

Reconciliation is bounded (1–200 milestones), advisory-locked and independently transactional. It selects the first committed lead_qualified and trusted lead_converted activity for each opportunity. Existing table grants ensure these activities originate from trusted commands/conversion logic. Status alone, notes, payments and React actions are not sources.

V1 is deliberately stricter than per-destination fan-out: unique(lead_id,event_kind) fixes one intention and one selected destination per opportunity/milestone kind. Requalification cannot create another Qualified signal. Confirmed→Validated cannot create another Converted signal. Destination changes do not recreate old intentions. An unroutable milestone gets a suppressed row with nullable connection and an explicit reason, instead of fabricated provider identity.

States:

- pending: eligible for mock preparation/attempt.
- sending: owned by an unexpired lease.
- retry: temporary error with bounded backoff.
- unknown: request/response uncertainty, retaining identical payload and event ID.
- sent: immutable accepted fixture result.
- blocked: disabled/missing configuration, secret, sharing evidence or conversion review.
- dead: permanent validation or exhausted attempts; cannot be arbitrarily reset.
- suppressed: no destination/matching identity, redacted identity, invalid conversion evidence or historical event; cannot be auto-released.

Provider event ID is stable from the original activity and selected connection. Event time stays the activity timestamp (Unix seconds use floor). Attempts increment only when durable attempt-start is recorded immediately before HTTP. A crash in that small interval may mean HTTP never began; lease recovery conservatively records unknown, not a fabricated response. The new owner uses the same frozen event.

## Routing and consent

Meta-first uses that accepted submission's form mapping/connection and matching Page identity. Website-first requires its source website connection's explicit lifecycle_destination_id. Browser IDs/UTMs never choose a destination. With allow_later_meta=true, the earliest accepted later Meta submission on that **same destination connection** can supply matching identity. Otherwise website fbc/fbp are used where observed. Raw fbclid and UTMs are not converted to Meta IDs or sent.

Manual-first opportunities remain suppressed in V1 even if a later provider submission exists. No speculative manual-lead routing is implemented.

Internal attribution_submission_id is always the lead's first_submission_id. matching_submission_id is separate. Neither first touch nor crm_revenue_entries is modified. SQL tests include website first touch, later Meta matching, real linked enrollment and payment revenue evidence.

Both consent_evidence.meta_lifecycle_sharing=true and consent_evidence.adult_contact=true are required on protected acquisition evidence, with no redaction. Existing generic website inquiry consent is **not** treated as permission to share with Meta. Phase 10 does not invent consent, add a director bypass or retrofit prior evidence. Approved evidence capture/validation is a live activation dependency.

Only the accepted contact envelope's phone/email and eligible provider/browser identifiers reach the worker. Phone is normalized to E.164 by the existing database helper; the fixture adapter hashes digits without plus. Email is trimmed/lowercased then SHA-256 hashed. Child name, DOB, age, level, placement results, notes, history, task instructions and financial data are never selected. A SQL payload allowlist also rejects such fields and verifies all matching identifiers/hashes against the selected protected contact evidence, rather than trusting a worker-supplied identity.

Review-required conversions are blocked and checked again before every attempt. Phase 10 does not introduce a conversion-review override or automatically clear Phase 6 review flags.

## Director commands (no new dashboard)

All use stored director role enforcement, not frontend claims:

- crm_configure_lifecycle(connection, expected_connection_version, data)
- crm_reconcile_external_deliveries(limit=100)
- crm_list_external_deliveries(limit=25, offset=0)
- crm_retry_external_delivery(delivery)

Meta settings require explicit mode=mock, numeric dataset_id (separate from inbound Page ID), configured api_version, a CRM_META_LIFECYCLE_TOKEN_* secret **reference**, qualified/converted event mappings and a configured action_source. They support enabled (default false), max_attempts (1–8, default 5) and allow_later_meta. No token value is accepted. Purchase/payment/revenue event names are rejected. No revenue event kind exists.

Website configuration accepts only destination_id referencing a Meta connection. Normal inbound connection commands keep their established response shape and cannot overwrite outbound settings.

Configuration versions increment. Each intention holds a mapping snapshot. Explicit director retry can adopt corrected settings only before payload preparation and only for the already selected destination/identity. Once prepared, mapping version, payload/hash/name, event ID/time, destination and matching submission cannot change. Director retry cannot duplicate sent deliveries, revive suppressed/dead rows or reset attempt limits.

Enabling mock outbound sets a new not_before timestamp. Reconciliation suppresses older milestones. Already blocked rows stay blocked until an explicit eligible single-delivery retry; enabling never blasts a backlog. No bulk historical sending or automatic release exists.

Diagnostics show kind/status/timestamps/counts/mapping version/destination label and sanitized attempt codes/statuses. They omit raw/hashed matching payload, token reference/value, child data and provider response dumps. Receptionist/admin/anonymous users cannot inspect these RPCs or tables. Service role also has no direct table mutation; it must use worker RPCs. Both tables have RLS and protected history/TRUNCATE paths.

## Worker and transport

The repository-consistent Next endpoint POST /api/internal/crm/lifecycle/process authenticates a same-origin director and reconciles only. It cannot claim/send deliveries and contains no adapter import. There is no scheduler, pg_cron dependency or pg_net delivery kick.

The test worker uses claim/get/prepare/begin/finish RPCs. Claims use SKIP LOCKED, UUID leases and two-minute expiry. Stale workers cannot prepare/begin/finalize. Expired in-flight attempts become unknown. Attempts are immutable once finalized; provider response summaries contain only accepted=true, safe status/request ID and controlled error codes.

The fixture adapter constructs only https://graph.facebook.com/{version}/{dataset}/events, bearer authorization, bounded JSON, no redirects, eight-second timeout and a 16 KiB response limit. It requires mockFetch; it never defaults to global fetch. Tokens exist only in injected server test environment, never payloads/DB/logs/diagnostics.

Accepted responses mark sent; 429/temporary 5xx retry; auth blocks; permanent validation dies; network/timeouts/malformed successful responses become unknown. Backoff uses exponential delay plus jitter, bounded at one day and honoring bounded Retry-After guidance. Maximum attempts are frozen with the prepared delivery.

Disabling/revoking evidence is checked again at get/begin; already-started network operations cannot generally be recalled. This phase has no live operations, but a future transport must preserve this boundary.

## Activation gates — NOT READY

Before a separately authorized live implementation/deployment:

1. Verify current official CRM event mapping, Graph version, dataset/destination, action_source, lead/browser identifiers, hashing, event age and deduplication requirements.
2. Validate English Hills app permissions/review, dataset access and destination ownership; do not infer these from inbound Page access.
3. Approve and implement adult-contact sharing evidence capture; generic inquiry consent is insufficient here.
4. Resolve conversion review through an approved business workflow, without bypassing the hold.
5. Approve event mappings, valid secrets/references, explicit activation cutoff and individual historical eligibility policy.
6. Add and review a production transport and protected scheduling path. The current code deliberately cannot send live even if configured or deployed.
7. Verify in authorized provider test tooling, then obtain explicit production migration and outbound activation approval. Configure monitoring and retention/redaction handling for frozen matching payloads/attempt history.

No retention period or scheduler is invented. Frozen payloads contain personal-data-derived hashes/browser IDs and must remain protected. No Phase 11 Insights, spend, attribution analytics, campaign tables or payment/value events are included.
