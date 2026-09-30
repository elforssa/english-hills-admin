# Owner summary

## What will change

After separate implementation review and H3/H4 approval, eligible future Qualified and Converted CRM milestones will be sent automatically to Meta. This plan changes documentation only. Current main is not provider-compatible: Meta requires two CRM source constants that both the application and database currently exclude. No activation is authorized.

## What must be verified before activation

Resolve the documented all-stages requirement against the approved two-milestone scope, exact lead-ID wire representation, server-only deduplication window and authentication/response details. Verify the real form, notice, exact answer values and destination entitlement. Review and deploy the necessary forward migration and application correction while every live gate remains closed.

## Meta form impact

Yearly form `1086266294126723` is known, but its live contents and D2 compliance are unverified. Known name, phone, WhatsApp, child-age and travel questions establish none of the required adult-contact/sharing evidence. Change or replace the form if authorized inspection cannot prove explicit adult confirmation, Meta lifecycle sharing and an immutable notice version. No form was changed here.

## Credentials/configuration impact

An authorized operator must provision a dedicated outbound Meta token, a separate lifecycle scheduler bearer, two lifecycle Vault entries and server-only Vercel configuration after H3. The exact CRM dataset, connection, contract revision and prospective eligibility policy must be approved. Inbound credentials and a working intake connection do not establish outbound entitlement.

## What remains fail-closed

H3 and H4 are blocked. The lifecycle scheduler remains inactive; no destination, epoch, provider contract, policy, credential or server gate was changed. Missing/ambiguous evidence prevents delivery. Historical, disabled-period, website-first, later-Meta and mock events remain excluded. Child information, contact hashes and monetary data remain forbidden. Receptionists continue ordinary CRM work without a send action.

## H3 approval requirements

Approve a completed official contract, resolution of the scope conflict, exact provider-contract revision and required code/migration changes, verified form/notice/field manifest, asset entitlement and credential plan. H3 must name the allowed preparation mutations and reviewed revisions; it does not authorize events or activation. This draft is not H3-ready.

## H4 approval requirements

After H3 work is independently verified, approve the exact destination/dataset, deployed SHA, contract, form/mapping/policy versions, prospective activation window, monitoring and recovery owners. Create the database epoch with the server gate closed, enable the gate on a verified READY Production deployment, and activate `crm-lifecycle-primary` last. This draft is not H4-ready.

## Risks / owner review points

Meta explicitly describes sending the initial lead and all subsequent funnel stages; Batch 2 permits only Qualified/Converted and must not silently expand. Lead-ID-only matching is supported, but JSON type and uncertainty-retry details need closure. Provider receipt does not establish CRM integration recognition, learning or advertising effectiveness. Resolve these blockers before approving preparation; never invent configuration to satisfy database constraints.

---

## Status, baseline and authority

Revision 1, 2026-09-30. **DRAFT / BLOCKED; architecture and activation preparation only. Tier 3** because this governs external disclosure, credentials, schedulers and Production activation. No independent review or owner approval is claimed. Separate architecture → owner approval → implementation → CI → fresh independent review → human release approval → release/operator tasks remain mandatory under [AGENTS](../../../AGENTS.md).

Inspected current remote main `4243c85769d3a008058af2750a2810159d39f11e` in an isolated clone. The user's original working tree was preserved. Read [CURRENT_STATE](../../ai/CURRENT_STATE.md), [architecture](../../ai/ARCHITECTURE.md), [product rules](../../ai/PRODUCT_RULES.md), [security rules](../../ai/SECURITY_RULES.md), [workflows](../../ai/WORKFLOWS.md), [architecture template](../../ai/templates/ARCHITECTURE_TASK.md), [rollout template](../../ai/templates/PRODUCTION_ROLLOUT.md), [feature index](../FEATURE_INDEX.md), ADRs [001](../decisions/ADR-001-crm-lifecycle.md), [002](../decisions/ADR-002-meta-intake-and-reconciliation.md), [004](../decisions/ADR-004-meta-lifecycle-feedback.md), the [completed Batch 2 plan](completed/crm-batch2-meta-lifecycle-feedback.md) and [lifecycle runbook](../../crm-meta-lifecycle.md).

Production facts are owner-supplied and durably recorded, not freshly queried by this task: 098–100 deployed; `crm-lifecycle-primary` inactive with zero runs; zero contracts, policies/evidence, open epochs, live deliveries and enabled lifecycle destinations; inbound `crm-intake-primary` healthy. No Production, Meta account or credential read was performed. Old Phase 10 mock-only statements and pre-implementation missing-evaluator statements are historical: current 098/099 and `evidence.mjs` already implement evidence evaluation.

## Official provider evidence register

All following sources are official Meta developer documentation, read on **2026-09-30** through the browser. Initial web-fetch requests returned 429/inaccessible results; browser navigation exposed relocated documentation. No third-party tutorial supplies this contract. Page update dates are metadata, not independent proof of service behavior; recheck before H3 and H4.

| Ref | Official source | Read result / relevance |
| --- | --- | --- |
| M1 | [CRM integration overview](https://developers.facebook.com/documentation/ads-commerce/conversions-api/conversion-leads-integration) | Dec 17, 2025 page; separate CRM integration for Meta Instant Forms. |
| M2 | [CRM payload specification](https://developers.facebook.com/documentation/ads-commerce/conversions-api/conversion-leads-integration/payload-specification) | Jun 28, 2026; required fields, source constants, lead matching, seven-day age and full funnel. |
| M3 | [Developer implementation](https://developers.facebook.com/documentation/ads-commerce/conversions-api/conversion-leads-integration/crm-integration/3-implementing-the-crm-integration) | Jun 28, 2026; endpoint, all-stage expectation, tests and integration recognition. |
| M4 | [Using the API](https://developers.facebook.com/documentation/ads-commerce/conversions-api/using-the-api) | Jul 17, 2026; v26.0 example, event identity, timing and Test Events effects. |
| M5 | [Get started](https://developers.facebook.com/documentation/ads-commerce/conversions-api/get-started) | Jun 28, 2026; Events Manager/own-app token routes, Pixel assignment and access requirements. |
| M6 | [CRM dataset setup](https://developers.facebook.com/documentation/ads-commerce/conversions-api/conversion-leads-integration/crm-integration/2-getting-started-with-integration) | Feb 6, 2026; CRM dataset creation/conversion, ad account context and Pixel-based identity. |
| M7 | [Customer information parameters](https://developers.facebook.com/documentation/ads-commerce/conversions-api/parameters/customer-information-parameters) | `lead_id` documented as integer, unhashed. |
| M8 | [Deduplication](https://developers.facebook.com/documentation/ads-commerce/conversions-api/deduplicate-pixel-and-server-events) | Jun 28, 2026; event ID/name and same-Pixel browser/server 48-hour window; alternative fbp/external-ID limitations. |
| M9 | [Marketing API changelog](https://developers.facebook.com/documentation/ads-commerce/marketing-api/marketing-api-changelog/) | Reports latest v26.0, introduced July 29, 2026, available-until TBD; metadata says updated May 21, 2026. Pin v26.0 subject to preflight revalidation. |
| M10 | [Ads Pixel events reference](https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ads-pixel/events) | Return structure includes integer `events_received`, `messages`, `fbtrace_id`; also lists other response variants. Example is v25.0, not authority for newest version. |
| M11 | [Graph error handling](https://developers.facebook.com/docs/graph-api/guides/error-handling/) | Recovery guidance for codes 1/2/4/17/341, auth and permission failures. |
| M12 | [Marketing API errors](https://developers.facebook.com/documentation/ads-commerce/marketing-api/error-reference) | Jun 16, 2026; code-based classification; 100 invalid parameter, 102/190 authentication, 10/200 permission. |

### Verified contract and remaining provider questions

| Requirement | Verified value / limit | Activation consequence |
| --- | --- | --- |
| Product | Conversions API for CRM / Conversion Leads integration for Facebook/Instagram Instant Forms (M1–M3). | Do not substitute website, purchase or legacy offline-event integration. |
| Version | `v26.0` supported per M4/M9 at access date; expiry not specified. | Revalidate available version at release; never use fixture `v99.0`. |
| Endpoint | `POST https://graph.facebook.com/v26.0/<CRM_DATASET_PIXEL_ID>/events` (M3/M4). | Dataset must be the CRM-enabled Pixel identity from Events Manager, not Page/form/ad-account ID. |
| Destination | New CRM dataset or existing dataset converted to CRM; integration is Pixel-based (M6). | Record actual dataset/Pixel ID correspondence and ad-account access; do not switch destination to replay. |
| Names | Free-form CRM stage names, not mandated `QualifiedLead`/`ConvertedLead` (M2/M3). | Proposed exact mappings: `qualified → Qualified`, `converted → Converted`; owner approves spelling/case and collision check. Not seeded or approved yet. |
| Envelope | `data` array; each event has `event_name`, `event_time`, `action_source`, `user_data`, required CRM custom parameters (M2–M4). | One event per request remains appropriate. |
| Constants | `action_source=system_generated`; `custom_data.event_source=crm`; `custom_data.lead_event_source` names the CRM (M2/M3). | Proposed exact tool name `English Hills CRM`; only these two custom-data keys, no general passthrough. |
| Matching | At least one customer information parameter; valid original Meta `lead_id` alone satisfies this minimum (M2/M3). | D5 remains lead-ID-only. Hashed adult email/phone are optional recommendations, not a demonstrated requirement. Do not add them. |
| Lead representation | `user_data.lead_id`, original `leadgen_id`, unhashed; documented integer, typically 15–17 digits (M2/M7). | Current string envelope differs. Official acceptance of numeric strings is unresolved. Never convert 17-digit IDs with lossy JavaScript `Number`. |
| Time | Actual CRM stage-change Unix seconds; must follow lead generation; age at upload at most seven days (M2/M4). | Candidate `maximum_event_age_seconds=604800`; never replace original milestone time or backfill. Equality after seconds-flooring needs explicit boundary handling. |
| Identity | M4 says same `event_id` and `event_name` retain first copy and support retries. | Keep exact stable identity and destination. |
| Deduplication window | M8 documents 48 hours for same-Pixel browser/server event-ID/name matching. M4 does not give a server-only replay window. | **Unresolved:** guaranteed CRM server-to-server retry window and scope. Do not seed 172800 by importing browser/server semantics. Current schema requires a numeric verified window, so this blocks seeding. |
| HTTP/provider acceptance | M10 documents integer `events_received`, messages and trace ID; M3 describes successful test response with trace ID. | Candidate receipt predicate: 2xx, no error, `events_received === 1` for our one event. Alternate `success`/other return variants and duplicate-retry acknowledgment need confirmation for v26.0 CRM. Trace ID alone is not receipt proof. |
| Authentication | M3/M4 show access token in parameter/form/query; M5 identifies token issuance routes. | Current `Authorization: Bearer` transport is not established by the pages inspected; verify official Graph support before H3. Do not move secrets into logged URLs as an unreviewed workaround. |
| Full funnel | M2/M3 explicitly require initial/raw lead and subsequent stages, with earlier stages sent before Converted. | **Real scope incompatibility** with two-kind Batch 2. Obtain official clarification that this narrower feedback use is supported, or revise architecture with owner approval. Do not fabricate predecessors, expand scope or claim optimization readiness. |
| Tests | Payload Helper, Graph API Explorer and Events Manager Test Events are documented (M3/M4). | Read-only/synthetic local payload validation is allowed later; any provider submission needs separate explicit approval. M4 says test-coded events are not discarded and can affect targeting/measurement. |

No production-ready contract is claimed. Core fields are verified, but **official contract verification remains partial**. Required unresolved artifacts: official evidence for server-only deduplication window, full-funnel scope resolution, exact lead-ID wire type handling, bearer support, and unambiguous one-event/duplicate acceptance semantics. All must be recorded with source, date and reviewer in a subsequent plan revision.

### Provider errors versus current classification

Current [adapter](../../../src/lib/crm/lifecycle/adapter.mjs) maps HTTP 429 and Graph 4/17/32/613 to retry, HTTP 5xx to retry, HTTP 401/403 and codes 102/190/10/200 to blocked; other `is_transient` errors retry and other errors die. Timeout/network/malformed successful body becomes unknown. Raw bodies/messages are discarded.

M11 documents waiting/retrying codes 1, 2 and 341 without requiring `is_transient`; code 3 and 200–299 indicate permission/capability repair. Current HTTP-400 responses carrying those codes without `is_transient` become dead, losing the intended repair/retry path. **Application correction required:** explicit supported code classification, retaining bounded retries and unknown handling; do not retry policy violations blindly. M12's code 100 is invalid input but subcode 33 can reflect missing object access, so document a reviewed contextual classification instead of treating every 100 as repairable. Precise CAPI-specific subcodes and 32/613 applicability remain to be verified. Local status choices are English Hills policy, not guarantees that Meta never processed a failed request.

## Provider versus current-code gap analysis

Sources inspected: cumulative [088](../../../supabase/migrations/088_crm_meta_lifecycle_delivery.sql), [098](../../../supabase/migrations/098_crm_lifecycle_evidence_and_delivery.sql), [099](../../../supabase/migrations/099_crm_lifecycle_delivery_runtime.sql), [100](../../../supabase/migrations/100_crm_lifecycle_scheduler.sql), [adapter](../../../src/lib/crm/lifecycle/adapter.mjs), [worker](../../../src/lib/crm/lifecycle/worker.mjs), [evidence](../../../src/lib/crm/lifecycle/evidence.mjs), [scheduler](../../../src/lib/crm/lifecycle/scheduler.mjs), [server](../../../src/lib/crm/lifecycle/server.js), [route](../../../src/app/api/cron/crm-lifecycle/route.js).

| Requirement | Classification | Evidence / exact follow-up |
| --- | --- | --- |
| Fixed Graph host and events endpoint | already supported | Adapter constructs fixed host/version/dataset; no redirects; eight-second timeout and 16 KiB response bound. |
| Dataset, v26.0, names, action source, seven-day deadline | configuration only | Verified contract fields feed frozen live mapping; dataset/token reference/max attempts provided through `crm_configure_lifecycle`. Contract seed itself is migration work below. |
| Provider contract registry entry | forward migration required | 098 seeds none; direct grants revoked for public/anon/authenticated/service_role and no publishing RPC. Use next free forward migration after current main, with exact evidence and approval. Never modify 098–100. |
| Required CRM constants | forward migration required; application code change required | 098 forces `required_constants={}`; 099 configure rejects nonempty constants and prepare allows only five event keys; adapter emits no `custom_data`. Change all three protections together with exact fixed constants and immutable snapshot checks. |
| Original ID only, no contact hashes | already supported | Live adapter + SQL permit only `user_data.lead_id`; mock hashing is unrelated. |
| Integer wire type / valid lead ID | unresolved provider requirement; conditional application/forward migration changes | SQL requires JSON string and adapter serializes string; either official numeric-string acceptance or lossless integer serialization plus matching SQL validation is required. Maintain canonical identity as text internally. |
| Timestamp after generation | forward migration required for exact documented strict boundary | 099 permits evidence time equal to event time and floors only on export. Reject/hold any exported event second not strictly after original provider generation time; never alter the milestone. Also reject future event timestamps at dispatch. Local tests must cover same-second and precision boundaries. |
| Full-funnel stages/order | unresolved provider requirement / owner scope decision | 088 kinds and 099 reconciliation are only Qualified/Converted, one each; no raw-lead or intermediate event support or ordered funnel guarantee. Any expansion requires a separate approved architecture revision, application/SQL changes and D2 evaluation. |
| Deterministic identity and frozen payload | already supported | `eh:<activity UUID>:<connection UUID>`; unique lead/kind and provider event ID; payload hash/config/time frozen. No exactly-once claim. |
| Server-only deduplication horizon | unresolved provider requirement | Required positive 300–7776000-second field cannot encode “unknown”; no safe fixture/default value. Unknown retry is bounded against earliest attempt once verified. |
| One-event receipt predicate | already supported for candidate predicate; unresolved alternate responses | 2xx plus configured count=1 and no error; malformed successful response unknown; endpoint return variants require clarification. |
| Error codes without transient flag | application code change required | Explicit retry/permission classification gap above. Preserve safe codes and no raw provider diagnostics. |
| D2 exact answers and notice binding | already supported; configuration only | 098 exact mapping/policy/interval lookup; JS exact typed comparison; no current Production policy. |
| Prospective epoch / no backfill | already supported | Activation timestamp database-owned; old epochs, mock identities and pre-epoch milestones cannot be revived. |
| Secrets / scope / assets | configuration only; unresolved entitlement | Server env reads, not CRM plaintext; actual asset manifest not supplied. |
| Scheduler and diagnostics | already supported; configuration only | Independent five-minute inactive cron, counts-only endpoint, director diagnostics; no new scheduler required. |
| Provider test-event code | application code change required only if a dedicated provider-test path is approved | SQL allows only top-level `data`; no test code supported. Do not weaken production envelope or test through live scheduler. Optional test approval is separate. |
| D6 retention / D7 retry | already supported | Terminal payload 30 days, attempts 90 days, bounded evidence cleanup; single-row eligible director retry, no sent/dead/suppressed revival. |

**Answer:** implementation compatible **no, as shipped**; reusable foundation remains sound. Forward migration **yes**; application change **yes**. Do not rebuild the queue, intake, milestone or enrollment engines.

## Active-form evidence manifest

[Mapping policy](../../crm-mapping-learner-policy.md) records `1086266294126723` as a future unpublished Yearly mapping example. That proves a known identifier, not present publication/version. [Normalization fixture](../../../scripts/test-crm-phase8.mjs) covers `full_name`, `phone_number`, `whatsapp_number`, `âge_de_l'enfant`, `travel_to_almaz`. The latter keys/values are synthetic test evidence, not a live form export. No documented answer satisfies D2; parent status, generic contact consent, phone/WhatsApp and Meta origin cannot substitute.

[Meta normalizer](../../../src/lib/crm/meta/adapter.mjs) and [shared form normalizer](../../../src/lib/crm/intake/form.mjs) retain safe question keys and typed raw values in `form_answers`. Display labels/translated option labels do not alter eligibility. A single returned value becomes a scalar; multi-value arrays cannot match the policy's scalar accepted-value list. Duplicate raw keys fail intake normalization; duplicate normalized evidence answers deny eligibility. Do not map evidence keys into contact/learner fields.

### Owner/operator read-only checks before H3

1. Open the actual Page's published Instant Form in Meta, confirm `1086266294126723`, active campaigns/ad sets using it, form status, language, exact questions/options, privacy notice/link, disclaimer and affirmative controls. Record inspection time and authorized verifier; capture only non-PII form structure.
2. Verify which fields and **raw API keys/values/types** are actually returned. Do not infer a machine value from the displayed “Oui” label. Use an already-authorized structural export or redacted field schema; no new lead or provider event in this task. Any later synthetic provider test requires explicit approval.
3. Confirm an explicit adult-contact statement and separate explicit approval to share the specified CRM milestones with Meta. Verify the exact notice text displayed before affirmation. Owner approves its substance; this is software evidence, not a legal sufficiency determination.
4. Record how form ID plus immutable mapping version pins the notice. If the form can change without recoverable version identity, replace/version it under H3 and bind a new immutable mapping prospectively. Never attach a current notice to old submissions.
5. Confirm the form's Page equals connection Page and the mapping belongs to that connection. If replacement creates a new form ID, approve mapping/reconciliation coverage and inbound verification before use; no accidental intake gap.

### Exact software manifest schema (values must be filled from evidence)

| Field | Required value / handling |
| --- | --- |
| `connection_id`, `page_id` | Actual verified connection UUID / Page ID; currently UNVERIFIED. |
| `form_id` / `form_key` | Known candidate `1086266294126723`; confirm or record approved replacement. |
| `form_mapping_id`, mapping `version` | Exact immutable mapping selected by provider occurrence time; UNVERIFIED. |
| Logical `adult_contact_confirmed` | `adult_field_key` = exact returned key; `adult_accepted_values` = array of exact affirmative scalar values. UNVERIFIED. |
| Logical `meta_lifecycle_sharing_confirmed` | `sharing_field_key` and `sharing_accepted_values`, separate from adult key; UNVERIFIED. |
| `notice_version`, `notice_text_digest` | Owner-approved version string (1–100 chars) and SHA-256 of exact UTF-8 approved notice text; define file/line endings and archive that non-PII text for reproducibility. UNVERIFIED. |
| Optional `notice_field_key`, `notice_accepted_values` | If provider returns version, enforce exact equality; otherwise omit both properties and bind notice via immutable verified form/mapping manifest. Do not send JSON null for the accepted-values property: existing publisher distinguishes SQL missing from JSON null. |
| Policy `version`, `effective_from`, `effective_until` | Version allocated by publisher; future UTC effective time and finite expiry, no overlap; fresh owner-approved interval. |
| Evidence binding | Submission UUID, original lead ID, Page/form/connection, policy ID, provider occurrence time and exact selected-answer digest; immutable grant effective at occurrence time. |
| Verification record | Operator, timestamp, evidence reference, owner notice approval and exact plan revision. No real contact answers in Git. |

An exact new-form proposal, **not a claim about Meta-generated keys**, is to request logical fields `adult_contact_confirmed` and `meta_lifecycle_sharing_confirmed` with one affirmative value each and `notice_policy_version` if supported. Actual keys and raw affirmative values must replace these proposals before publication. No wildcard, case folding, substring, translation, default true or aliases. Neither a question label nor a director toggle grants permission.

Policy publication via `crm_publish_lifecycle_policy` rejects a past effective timestamp. Candidate selection requires resolved Meta submission, original Page/form/mapping match, nonredacted attribution and occurrence within policy interval. The evaluator records a check and grant; missing/ambiguous evidence denies. Intake and school follow-up still operate normally. A genuine late evaluation can repair only an unattempted `sharing_evidence_missing` delivery within the same current epoch/contract and deadline; it cannot release pre-epoch or disabled-period milestones. Revocation is append-only and checked before sending. Retiring a policy stops later capture; it is not a substitute for revoking existing grants or disabling a destination.

**Active form D2 compliant: unverified. Form change required: unverified, mandatory if these checks fail.** If known questions are the complete live form, change/replacement is required.

## Meta asset and destination entitlement checklist

Only the form ID above is durably recorded as an English Hills Meta asset identifier in the inspected docs. Do not use test fixture IDs or discover secrets to fill blanks. Each row must gain actual ID, owner/access relationship, verifier, timestamp and sanitized evidence before H3. The final token validation occurs after approved provisioning and before H4.

| Asset | Required verification | Current status |
| --- | --- | --- |
| Business Portfolio | English Hills owner or explicit partner authority; operator has appropriate Business Suite admin/developer privileges (M3/M5/M6). | ID/access UNVERIFIED |
| Meta App | Record actual app ID and owner; select Events Manager-created CAPI app or approved existing own-app route; distinguish inbound app. | UNVERIFIED |
| Page | Owner/partner access and exact connection Page; live form belongs to it; inbound subscription/retrieval preserved. | UNVERIFIED |
| Instant Form | Published ID/version, Page, exact questions/notice, serving ad sets and immutable mapping. | Known candidate only |
| Dataset / Pixel | CRM integration enabled and CRM identity visible; actual numeric endpoint ID; ownership/access and collision-free stage names. | UNVERIFIED |
| Ad Account | Business account running the Instant Form ads, access to selected dataset and Page; no campaign edits authorized. | UNVERIFIED |
| System User | App/business association and assigned exact Pixel; least necessary asset access for selected token route. | UNVERIFIED |
| Access Token | Issuer/app/system user, dataset entitlement, expiry/rotation owner and validated scope metadata; values never recorded. | Not provisioned per rollout evidence |
| Inbound permissions | Validate separately current `leads_retrieval`, relevant Page subscription/access permissions and lead-access assignment under official retrieval docs. Existing reconciliation health is evidence of intake operation only. Exact current scope set remains UNVERIFIED here. | Existing intake healthy; no scope expansion |
| Outbound permissions | M5 says own-business Events Manager and own-app CAPI setup need no App Review/requested permissions; own-app route assigns Pixel to system user. Record actual route/scopes/asset tasks; do not blindly request `ads_management` or `business_management` from tutorials. Third-party partner requirements differ. | Official route known; account entitlement UNVERIFIED |

A Business Portfolio, app, Page, form, ad account and dataset are different objects. Ownership or explicit assigned access must connect the relevant actors; they need not all have the same numeric ID. A Page token that downloads leads is not sufficient proof for the dataset `/events` endpoint. If the business uses a partner rather than own-business route, stop and verify that route's official requirements before H3.

## Credential and configuration manifest

No values are created by this plan. H3 authorizes named preparation actors; only H4 authorizes live activation. Use an approved secure operator session, never a production service-role key on a local workstation.

| Item | Location and reader | Provisioning actor / constraints |
| --- | --- | --- |
| Outbound provider token | Production Vercel server env `CRM_META_LIFECYCLE_TOKEN_<APPROVED_SUFFIX>`; worker resolves `mapping.secret_ref` and adapter sends token. Proposed reference `CRM_META_LIFECYCLE_TOKEN_ENGLISH_HILLS_PRIMARY`. | Meta asset administrator issues after H3; release operator stores in server env. Dedicated outbound token, not inbound Page token. |
| Provider token reference | `crm_integration_connections.lifecycle_settings.secret_ref`; frozen mapping snapshots also hold reference, never value. | Director configures exact approved reference through RPC while disabled. |
| Scheduler bearer | Production Vercel `CRM_META_LIFECYCLE_SCHEDULER_TOKEN`, read by scheduler auth. | Release operator after H3; distinct from provider, intake and other cron tokens. |
| Vault scheduler bearer | Vault secret **name** `crm_lifecycle_scheduler_token`, read by private `crm_security.invoke_crm_lifecycle_scheduler`. | Authorized DB/Vault operator after H3; exact same value as server scheduler bearer. Not ordinary CRM table or cron SQL literal. |
| Vault URL | Vault secret **name** `crm_lifecycle_scheduler_url` = `https://admin.english-hills.com/api/cron/crm-lifecycle`. | DB/Vault operator; 100 rejects any other URL. URL is nonsecret but belongs in this manifest. |
| Server live gate | Production Vercel `CRM_META_LIFECYCLE_LIVE_ENABLED`; only literal `true` enables worker. | Operator keeps absent/false through H3 and epoch creation; H4 gate change requires new READY deployment/source/config verification. |
| Contract | Reviewed immutable `crm_lifecycle_provider_contracts` row via forward migration; code/SQL consumers use frozen contract. | Release DB operator only after reviewed implementation + H3 deployment authorization. No director/service-role table insert bypass. |
| Contract fields | key/revision, v26.0, exact two names, action source, 604800-second age, verified dedup seconds, accepted field/count, lead_id_only, exact constants, evidence URLs, verified/approved dates. | Dedup/auth/type/full-funnel/response blockers must close first. Existing unique `contract_key` also means a later immutable revision needs a distinct key or reviewed schema change; do not update old rows. |
| Disabled destination | Live RPC data: `mode=live`, `enabled=false`, actual `dataset_id`, `secret_ref`, `contract_id`, `max_attempts=5` (approved default, max 8). | Director with current connection version after compatible migration; no caller-supplied event/version override. |
| Eligibility policy | Exact form/notice/field manifest and future interval through `crm_publish_lifecycle_policy`. | Director under H3; refresh connection version after every mutation. |
| Activation epoch | `crm_activate_lifecycle_destination(connection, version, contract)`; sets enabled and DB-owned `started_at` together. | Authorized release operator/service context only after H4, gate closed. No backdating argument. |
| Cron | Existing `crm-lifecycle-primary`, `*/5 * * * *`, invokes private Vault function. | DB operator activates LAST after H4; no backup or manual scheduled invocation before activation. |
| Supabase service credential | Existing protected server-only service client. | Reuse deployed server authority; no new client exposure, copying or credential provisioning inferred. |

Never store provider/scheduler/service tokens, app secrets, Authorization headers or raw provider responses in normal CRM tables, docs, Git, URLs in logs or browser bundles. Ordinary tables may hold only approved references and nonsecret contract/configuration values. Avoid `NEXT_PUBLIC_` variables entirely for these values.

Rotation: schedule a controlled pause; disable destination/close epoch, pause lifecycle cron, close live gate and verify READY. Replace the outbound value under its existing reference where possible so frozen references remain resolvable; never change matching payloads. Rotate scheduler bearer in both Vault and Vercel while cron is paused, verify authentication without sending, revoke the superseded token, then obtain renewed prospective activation approval. A closed epoch is never reopened and its unsent deliveries are not transferred. In an emergency, revoke only the outbound credential if compromise/in-flight exposure warrants it; never revoke inbound access as a lifecycle kill switch.

## H3 checklist — BLOCKED

H3 is approval of a concrete preparation manifest, not an instruction to “finish setup however necessary.” All checks below must reference the exact plan/implementation revision.

- [ ] Resolve full-funnel scope against D1–D7 without manufacturing events; document official clarification or a newly approved architecture revision.
- [ ] Close every provider question above, including lossless ID representation, bearer support, server-only dedup window and accepted/duplicate response semantics.
- [ ] Approve names `Qualified` / `Converted`, source label `English Hills CRM`, v26.0, constants, deadlines and exact contract key/revision; check dataset name collisions.
- [ ] Approve forward migration/application patch scope and exact reviewed SHA; local/CI and fresh independent review must pass before release. Record migration number only after checking current main.
- [ ] Inspect active form and approve exact notice text/digest, raw keys/typed values, immutable form/mapping identity, future policy interval and any form replacement.
- [ ] Complete nonsecret asset relationship/entitlement manifest and choose credential issuance route.
- [ ] Name preparation actors and authorize only explicit provider/form/credential/configuration mutations, including any disabled deployment/migration. Declare whether provider tests are separately authorized; default is no.
- [ ] Confirm recovery owner can disable DB destination, cron and Vercel gate without relying on receptionist action.

H3 approval record fields: owner, UTC date, plan SHA, implementation/review SHA, allowed migration/config/form operations, exact assets, notice version, credential locations, test permission/scope, named operators. **All currently unapproved.** A draft review of this plan alone is not H3.

## H4 final activation manifest — BLOCKED

No blank, proposed or UNVERIFIED field below may be accepted as a wildcard.

| Manifest entry | Required final evidence |
| --- | --- |
| Approval | Owner, UTC approval time, exact plan revision and reviewed deployed application SHA |
| Deployment/database | Production READY deployment ID/source/alias; ledger 098–100 plus approved forward migrations and verified SQL effects |
| Destination | Actual connection UUID/key/current version, Page ID and dataset/Pixel ID |
| Provider contract | Actual immutable row UUID/key/revision and evidence digest; approved API/names/constants/age/dedup/response rules |
| Form | Actual active form ID and immutable form/mapping version/UUID; verified notice version/digest |
| Eligibility | Policy UUID/version, effective-from/until UTC and exact field/value manifest |
| Prospective cutoff | Approved UTC activation window; database-generated epoch timestamp must fall within it, be no earlier than effective policy, and be captured immediately after activation |
| Epoch/destination | New epoch UUID, exact actual `started_at`, enabled live destination; no existing open epoch |
| Server | Gate true only on intended Production READY deployment; closed beforehand; no preview access to live credentials |
| Scheduler | `crm-lifecycle-primary` only, five-minute schedule, active only after READY; no alternate/manual sender |
| Acceptance | First future eligible Qualified and Converted observed separately, no forced business status changes |
| People | Named monitoring owner, director diagnostics operator, Meta asset operator and recovery owner, availability for first hour/day |
| Recovery | Approved shutdown order below, token revocation authority and reactivation rules |

## Fail-closed activation sequence

Preserve the approved ten-step order. Missing evidence stops at the preceding closed gate.

1. **Provider contract available:** finish provider verification, review code/migration correction and seed approved contract under H3 while destination/gate/cron remain off. Verify upgrade did not enable anything. No migration is authored or run in this task.
2. **Form/evidence verified:** complete approved form changes if needed, immutable mapping and notice manifest; validate normalized evidence locally and authorized structural inspection. No fabricated Production grant.
3. **Credentials provisioned, gate closed:** separate Meta token and scheduler bearer, exact Vault URL/token, server env; verify deployed false gate and dormant cron. Token existence is not entitlement proof.
4. **Destination configured disabled:** director uses `crm_configure_lifecycle` with exact contract/dataset/reference, `enabled=false`. Re-read version and disabled state. Inbound `enabled`/reconciliation settings are distinct and untouched.
5. **Policy published prospectively:** future interval, correct form/mapping, verified notice and exact values. Wait until policy/mapping is effective before activation RPC. Evidence collected after policy start but before epoch does not authorize pre-epoch milestones.
6. **H4 approval:** complete final manifest and separate human release approval; operator rechecks no drift, active policies and recovery readiness.
7. **Epoch created, gate closed:** invoke operator-only `crm_activate_lifecycle_destination` with fresh connection version/contract. This atomically creates the epoch **and enables the destination**. Capture actual cutoff; do not separately flip raw database flags. If outside approved window, disable and stop.
8. **Server gate enabled, Production READY:** change only approved live gate; verify exact deployment source/alias/environment and READY before proceeding. Cron stays inactive. No manual route request with bearer: the route can send as soon as gate and DB permit it.
9. **Scheduler activated LAST:** enable only the named cron. Record time and confirm schedule/job identity. No immediate extra manual tick.
10. **Observe first approved eligible delivery:** genuine post-epoch milestone, correct evidence and deadline, acceptance checklist below. If no such milestone occurs, record “awaiting eligible event”; do not create test school records or backfill.

The DB epoch, rather than deployment-ready/cron time, is the prospective cutoff. Milestones between step 7 and step 9 can queue and later send if still eligible and within age limits; H4 must explicitly accept that window. If startup fails, close the epoch; later activation uses a fresh cutoff and does not release this abandoned epoch's backlog. A gate-only pause is not a new epoch and cannot be represented as a no-backlog shutdown.

## First live delivery acceptance

Release operator records only delivery/activity/epoch/policy identifiers and safe diagnostics in the restricted acceptance record; no matching values, token, child/contact data or raw payload dump in Git. Verify both kinds when they naturally occur.

1. **CRM fact:** first `lead_qualified` activity or the exact `lead_converted` activity/enrollment referenced by the lead; Converted enrollment is Confirmed/Validated and has no conversion review hold. No receptionist delivery action or synthetic status transition.
2. **Eligibility:** Meta-first resolved submission, matching Page/form/mapping, original provider lead ID, exact D2 grant effective before milestone, no revocation/redaction; policy capture interval and epoch agree.
3. **Durable intent:** one `(lead_id,event_kind)` row, mode live, exact connection/contract/epoch/evidence; event ID exactly `eh:<activity UUID>:<connection UUID>`. Original `event_time`, floor-to-seconds export, strictly after generation and after cutoff; deadline is original time plus approved maximum age.
4. **Claim/freeze:** unique unexpired lease; payload/config/hash prepared before durable attempt start; same identity survives uncertainty; no second intent after requalification or Confirmed→Validated.
5. **Provider request:** exact v26.0 CRM dataset endpoint and closed reviewed payload. Contains only approved event identity/time/name/source, original lead ID and two CRM constants. No child age/name/DOB, placement/level/notes/tasks, em/ph/browser IDs, value/currency/payment data, arbitrary answers or test code. Inspect via approved protected operator evidence without exporting contact values or headers.
6. **Response → sent:** verify HTTP success and reviewed accepted-count rule, finalized attempt and `sent_at`; no retry due for sent row. Timeout/malformed success/finalization loss must remain unknown, not invented success. Check safe provider trace through authorized diagnostics when available; director list intentionally omits raw responses.
7. **Provider visibility:** correct Events Manager dataset and event name, source constants recognized for CRM; no observed duplicate of the same identity. Receipt and UI visibility are separate observations; do not resend because UI is delayed. M3 says integration recognition may take a day. Record acceptance limitations and lack of guaranteed optimization/learning benefit.
8. **Operations:** director `/crm/integrations/lifecycle` shows outcome/counts/attempt code; receptionist cannot configure/send/retry. Inbound cron, reconciliation and ingestion remain healthy. No unexpected eligibility expansion or unrelated role behavior.

## Monitoring — first hour and first day

These are proposed English Hills operating thresholds for H4 approval, not Meta service-level guarantees. The named monitoring owner records a baseline immediately before step 7 and checks every five minutes for the first hour; at 2, 4, 8 and 24 hours thereafter. Recovery owner remains reachable. No automatic monitor is created by this plan.

| Check | Evidence and response |
| --- | --- |
| Scheduler ticks | Compare `cron.job_run_details`, pg_net HTTP status and `crm_lifecycle_scheduler_health.last_started_at/last_success_at`. Cron SQL success alone only proves enqueue. Two missing five-minute cycles or last success older than 15 minutes → incident. |
| Pending lag | Director `oldest_pending_at` includes blocked/retry/unknown across modes; operator separately filters current live epoch. Investigate >15-minute eligible pending lag or growth over two ticks; stop before provider deadline risk. |
| Throughput/retries | Scheduler max 25 evidence candidates, 100 reconcile items, 3 deliveries per tick and 50-second budget. Track saturation, retry rate and attempts remaining; three consecutive failed attempts or repeating rate-limit failures across two ticks → pause/review capacity. |
| Blocked/suppressed/dead/unknown | Inspect safe reason counts by current epoch/kind; distinguish expected historical suppression from new eligible failures. Any unknown or dead first-delivery attempt → shutdown pending review; no bulk retry. Missing evidence is not permission to relax policy. |
| Provider classes | Separate auth/permission, validation, rate-limit, unavailable, timeout/network and malformed-response codes. Any auth/permission or repeated validation error → shutdown; fix only with reviewed authority. |
| Vercel | Route 401/503, timeouts, exceptions and exact deployment status; never dump headers/env/request bodies. |
| Supabase | RPC/lease/constraint failures, cron/pg_net failures, cleanup counts, no stuck started attempts past lease. Investigate RLS/ACL regressions immediately. |
| Inbound health | `crm-intake-primary` ticks, `/api/cron/crm-intake` status, reconciliation errors/due state, ingestion lag and accepted submissions; compare baseline without identities. Regression → stop outbound and diagnose; do not disable intake. |
| Duplicates/scope | Count uniqueness and trace stable event IDs across attempts; inspect provider duplicate visibility safely. Any wrong dataset, child/contact extras, monetary fields, unauthorized evidence, historical send or new event kind → immediate incident. |
| Day-one provider view | Check CRM recognition/source constants and diagnostics after expected UI delay, separately from HTTP receipt. No recognition → investigate, never fabricate missing initial events. |
| Retention | Check cleanup ran; schedule ongoing approved operational checks for terminal+30/90-day thresholds. First day cannot prove time-based erasure actually occurred. |

## Rollback and recovery

**Exact shutdown order:**

1. Director/recovery operator calls `crm_disable_lifecycle` with fresh connection version, closing the epoch and disabling the destination. Verify both states. This blocks new claims/begin checks without waiting for a Vercel deployment.
2. DB operator sets only `crm-lifecycle-primary` inactive and verifies it. Stop any separately approved manual/backup trigger as well. Do not touch `crm-intake-primary`.
3. Vercel operator sets lifecycle live gate false and verifies the new Production deployment is READY on the correct alias. Existing requests may already have crossed the gate; changing environment is not instantaneous revocation.
4. If exposure/compromise requires, revoke the dedicated outbound Meta token. Preserve inbound credentials. Account for already-started requests as possible effects; do not mark them unsent merely because a switch changed.
5. Preserve delivery/attempt/audit history and safe incident evidence. Inventory pending/sending/unknown rows without payload export, reconcile uncertainty under the verified provider contract, and let approved terminal/retention handling run through a separately authorized safe maintenance path if cron remains paused. Paused scheduling also pauses automatic cleanup; record a bounded maintenance owner/deadline.

If step 1 is inaccessible, immediately pause cron and close server gate, revoke outbound token if warranted, and close the DB epoch as soon as access returns. Record reduced containment rather than claiming all effects stopped. None of these steps recalls accepted events.

Recovery uses a reviewed fix, CI and fresh independent re-review of the new SHA; explicit new prospective activation approval, a new epoch, current policy and verified READY gate precede cron-last restart. Never reopen an epoch, reset attempts, mutate a frozen identity/payload, replay old mock/sent/dead/suppressed rows or carry disabled-period milestones forward. A single director retry is allowed only for an eligible row within the same open epoch after repair and all existing checks; it is not general incident replay permission. No destructive migration rollback.

## Exact stop conditions

Stop before mutation/advance if any required manifest field is unverified, approval is absent/wrong SHA, official contract is unresolved, form/evidence does not bind exactly, asset entitlement is unproven, or required code/migration changes are missing. Stop on ledger/source drift, unexpected enabled gate/cron, non-READY Production, stale connection version, invalid policy interval or cutoff outside H4 window. Stop on broader event scope, child/contact/monetary payload data, lossy lead ID, invalid event time, uncertain deduplication or changed destination. Apply shutdown above for unexpected sends, duplicate effects, authorization failures, first-event unknown/dead state, eligibility expansion or inbound regression. Do not “test through” a blocker.

## Implementation/configuration changes required

**Required later implementation, not performed here:**

- Forward migration: seed only the completed approved contract; replace the empty-constants constraint/configuration check with exact two-key nonpersonal values; propagate/freeze and independently validate constants in SQL. No generic `custom_data` escape hatch. Tighten documented event-time boundary. Preserve RLS, revoked table grants, worker-only claims and director-only controls.
- Application: emit approved source constants from the verified frozen contract; explicitly classify documented recoverable/permission codes; resolve lossless lead-ID wire serialization jointly with SQL if string acceptance cannot be officially established. Keep no em/ph/value/currency and fixed-host transport.
- Resolve the full-funnel requirement and deduplication horizon **before** seeding. Scope expansion is not included in these fixes; it needs a separate revised plan/ADR approval. Do not invent a numeric retry window or substitute another API.
- Tests for the later patch: synthetic `npm run test:crm-lifecycle`, Batch 2 SQL/security/concurrency/retention/replay suites, clean and 100→new migration upgrade, negative extra-key/ID precision/timestamp tests, exact error/response fixtures, role checks, local director browser verification and inbound regressions. Test unknown near dedup deadline, expired lease, disable/re-enable, pre-epoch/no backfill and both event kinds. Existing scripts under `scripts/test-crm-batch2*` define the local harness. No real/test Meta delivery in CI.
- After approved deployment: H3 form/mapping/notice/policy, credential and disabled destination preparation; H4 exact prospective activation only. No new UI or outbox redesign is required by verified findings.

Documentation only in this task: this plan, navigation links and an evidence addendum to ADR-004. No application code, migrations, provider forms/configuration, secrets, Vault, Vercel env, scheduler, destination or Production changes. No merge/deploy.

## Owner decisions required

D1–D7 Option A remain approved; do not re-request them wholesale.

| Decision | Options and consequences | Recommendation / blocking status |
| --- | --- | --- |
| Meta full-funnel conflict | A: retain two milestones and obtain authoritative confirmation of supported narrower use; remain dormant meanwhile. B: commission separate architecture for initial/other stages, ordering and evidence; this expands disclosure and requires new approval. | A first; **blocks H3/H4**. No unsupported optimization claim. |
| Form readiness | A: retain form only if exact D2/notice version proven. B: approve changed/replacement form and prospective mapping if not. | Evidence-dependent; **blocks H3**. |
| Notice and mapping | Approve exact adult/sharing wording, version/digest, actual typed keys/values and interval, or leave dormant. | Owner supplies/reviews actual notice; **blocks H3**. |
| Destination/credentials | Choose verified CRM dataset and own-business token route; name asset/credential/recovery operators, or defer. | Separate outbound token; **blocks H3**. |
| Names/constants | Approve proposed `Qualified`, `Converted`, `English Hills CRM` after collision/scope resolution, or specify exact alternatives consistent with official contract. | Proposed values; **blocks H3**. |
| Provider tests | A: no provider tests; complete local verification and approved first-live acceptance. B: separately authorize an exact provider-test plan/account/data scope, acknowledging Meta test events can affect measurement. | A until explicit need/approval; test permission is never implied. |
| Final release | Approve completed H4 manifest/window and named first-hour/day owners, or remain dormant. | Only after every blocker closes; **blocks H4**. |

## IMPLEMENTATION / ACTIVATION CONTRACT

1. This is a blocked architecture draft at revision 1, not H3/H4 approval. A fresh agent reads this file and ADR-004 directly, verifies current main/deployment evidence and records drift. Preserve the already approved D1–D7, original milestone truth, no historical backfill and separate inbound operation.
2. Close official contract questions with exact sources/date: full-funnel compatibility, server-only deduplication duration, lead-ID type/lossless encoding, bearer authentication and accepted/duplicate response semantics. Do not fill unknown values with fixtures or tutorials. Obtain owner decision for any broader scope and revise ADR-004 before implementation of that scope.
3. After architecture approval, implement only reviewed compatibility corrections in lifecycle adapter/worker if needed and next free forward migration(s), including contract/config/SQL payload validation and timestamp guard. Preserve existing tables, identities, evidence, leases, retention, role gates and prospective epochs. Do not edit deployed 001–100. Record exact object/function manifest and tests in the implementation PR; complete CI and fresh independent review/re-review before release.
4. H3 requires the completed provider, form, notice, asset and secret manifest plus explicit approval for each named preparation mutation. Operator then provisions while gate/cron closed and destination disabled. No test or real event is authorized by preparation approval unless separately and explicitly named.
5. H4 requires the exact deployed/reviewed revision and every final-manifest field, named owners and new prospective activation window. Follow the ten-step order: contract → form/evidence → closed-gate credentials → disabled destination → prospective policy → H4 → DB epoch/destination activation while gate closed → live gate and Production READY → cron LAST → first eligible event observation. Capture DB-generated cutoff; never backdate.
6. Prove CRM milestone → durable intent → claim/frozen payload → attempt → provider result → final state → director/provider diagnostics for each naturally occurring kind. Record awaiting events honestly. No receptionist send action, manual school-data fabrication, forbidden fields or optimization-effectiveness claim.
7. Monitor first hour/day and follow exact stop/shutdown rules. Closed epochs and terminal identities cannot be replayed. Recovery requires reviewed changes and fresh prospective approval. Retention maintenance remains assigned when scheduler is stopped.
8. Return exact branch/commit/PR, verification status and remaining blockers. After an actual future rollout, record owner approval scope, source/deployment/ledger/epoch/cutoff and safe acceptance evidence in CURRENT_STATE, ADR-004, runbook and FEATURE_INDEX. Mark/move this plan to completed only after its approved live scope is truly verified; dormant deployment alone does not complete it.
