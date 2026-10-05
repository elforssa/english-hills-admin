# H3 technical and dormant-acceptance contract

## Current authority and reading boundary

Current authority is the provider manifest, multipart transport, strict timestamp rules and remaining H3-06/07/08 dormant-acceptance contract. H3-02/03/04 implementation/release and initial S1 Gate B are complete as recorded in CURRENT_STATE. All older credential-route, rotation, inspector and revocation prescriptions are superseded by S1. H4 remains a separate prospective activation outcome.

[CURRENT_STATE](../../ai/CURRENT_STATE.md) owns implementation/deployment/activation evidence. [S1](crm-meta-lifecycle-credential-simplification.md) and its [sole Gate-B runbook](crm-h3-s1-gate-b-credential-runbook.md) own credentials. This navigation cleanup changes no product, security or release contract.

## Preserved contract and dated rationale

The following original design/approval/implementation text is retained for its detailed contract and rationale within the scope above. **All dated status, branch/ledger observations and past commissioning statements are historical, not current readiness or renewed authority.** Superseded credential instructions are not executable. The [pre-cleanup announcement chronology](../history/crm-h3-technical-readiness-before-outcome-1.md) preserves the removed announcement chronology as well.

## What will change

This **Tier-3 H3 technical package, revision 5, 2026-10-02**, replaces the earlier H3 dossier's current blocker assessment. It prepares a reusable dormant Meta outbound connector, independent of the next campaign, form or acquisition channel. It proposes a bounded path to a verified provider contract and disabled native destination. **ARCHITECTURE APPROVED — READY FOR SEPARATE H3 IMPLEMENTATION**: the owner approved revision 5 and the decisions recorded below. The credential evidence blocker is closed; this documentation task does not execute H3.

Read-only research and documentation only. No runtime, migration, seed, credential, account permission or Production configuration change is included. No test or real events were sent. Revision-2/3 main baseline: `4236cfcddf851e12884cb6ade3cb436c7762c1ea`. Revision-1/2 observations below retain their original provenance. Revision 3 assessed repository source and the owner clarification only. Revision 4 adds [fresh credential-route documentation and authenticated nonsecret Meta preflight](../evidence/crm-h3-credential-route-2026-10-01.md); no Production access was performed. Revision 5, based on main `1fbaf091279875f033d294bdfb1436b86711a7ae` after PR #50 merged, selects [Events Manager direct CAPI issuance](../evidence/crm-h3-direct-capi-credential-2026-10-02.md); fresh read-only dataset evidence closes the custom-app blocker. No token was generated.

## Final owner architecture approval — 2026-10-02

**ARCHITECTURE APPROVED — READY FOR SEPARATE H3 IMPLEMENTATION.** The repository owner explicitly approved **PR #51, technical package revision 5**, in this task on 2026-10-02 (Asia/Shanghai), against reviewed head `77c36d5d6c36e7b892ce982baa12d4f5d017fa8e`. This amendment records that decision without changing the approved architecture revision. Source: the owner's direct message; approval and task-boundary excerpts are reproduced below. No exact UTC approval instant was supplied; do not fabricate one for a later seed.

> Final H3 owner approval has now been given for PR #51 revision 5.
>
> - multipart/form-data transport using the dedicated direct Events Manager CAPI token
> - strict exported-second timestamp handling
> - new EH-only direct Events Manager credential without Dataset Quality API
> - proposed provider-contract manifest and disabled destination configuration for dataset `1152399921284927`, `max_attempts=5`
> - credential metadata review every 30 days and rotation before the earlier of 90 days or 7 days before expiry
> - bounded H3 implementation and dormant preparation only
>
> H4 source/form/cohort selection, provider event sending, destination enablement, server live gate and scheduler activation remain unauthorized.
>
> Keep the same PR #51.
> Do not implement H3.
> Do not generate credentials.
> Do not change Meta or Production.
>
> Update approval/status language from `READY FOR H3 OWNER REVIEW` to architecture approved / ready for separate H3 implementation.
>
> Run documentation validation, push to the same PR, and return the new exact SHA.
>
> Do not merge.

Approval selects the multipart/strict-second design and its documented equality hold and predecessor consequences, the direct-only credential route, exact proposed manifest/disabled configuration and stated governance schedule. It authorizes the bounded architecture for a **separate H3 implementation task**; this task only records approval. No code, forward migration, seed, credential, Meta setting or Production operation is performed here. Actual implementation artifacts still require exact-SHA CI and independent review; merge/release, credential/operator execution and Production changes retain their separate artifact-bound approval gates. H4 and all provider sending remain unauthorized. Existing dedicated storage, no legacy credential reuse/revocation and fail-closed recovery controls remain mandatory.

## H3-02 compatibility implementation — 2026-10-02

On branch `codex/crm-h3-02-compatibility`, the separately commissioned Tier-3 implementation applies [approved H3 revision 5](crm-h3-technical-readiness.md) to the live adapter and forward [migration 104](../../../supabase/migrations/104_crm_lifecycle_strict_exported_seconds.sql). Live requests use transient multipart `data` (the one-event array) and `access_token`; the frozen envelope stays token-free. Original Meta generation and activity time must export to strictly increasing integer seconds, including prepared-payload revalidation. Equal/earlier seconds remain held without a fabricated time or attempt; existing chronological predecessor, deadline, epoch and retention behavior remains. D2/privacy, matching, ownership, event scope and uncertainty policy are unchanged. [Implementation evidence](../evidence/crm-h3-02-implementation-2026-10-02.md).

This is branch implementation, **not merged, deployed, Production verified or release approved**. The last recorded Production ledger is 001–103 dormant. No provider contract seed, credential, destination/source/cohort configuration, live gate, cron activation or provider event is part of H3-02. H3-03–08 and H4 remain separately gated.

## What staff/users will be able to do

Nothing new in Production. A later authorized H3 operator can prepare the native sender while every sending gate stays closed. Receptionists gain no controls. The owner receives exact contract fields, outstanding decisions, external actions and ordered stop/recovery instructions.

## What remains restricted

No future form creation/binding, final source mapping, cohort policy/boundary publication, ownership admission, epoch, destination enablement, server live gate, scheduler activation or provider events. These are H4 or separately authorized operations. Existing Yearly, historical, website-first and later-Meta opportunities remain excluded from the current Instant Form lifecycle adapter. Website acquisition and a later website outbound adapter are separate capabilities, not permanently excluded product channels. No new matching fields, financial data, child data or uncertain replay.

## UI impact

None in this PR. Future timestamp diagnostics, if commissioned, expose a coarse hold reason only. Public docs and authenticated account settings were inspected read-only. Revision 4 inspected the documented token preflight launcher but never used final issuance, changed a permission or saved a setting; see its evidence record.

## Database impact

None. Migration **103 is Production-verified dormant and immutable**, not a remaining implementation task. A later reviewed timestamp correction may need forward SQL; a separate later immutable provider-contract seed is still necessary. Recheck migration allocation; do not reserve 104 or modify 001–103.

## Important security decisions

[ADR-004](../decisions/ADR-004-meta-lifecycle-feedback.md), [approved R4](crm-meta-funnel-revision-4.md), and the completed [advisory-D2](completed/crm-meta-funnel-r4-d2-advisory.md) / [sharing-stop](completed/crm-meta-funnel-r4-sharing-stop-contract.md) contracts remain authoritative. Do not reopen their architecture. Optional custom D2 proof never fabricates consent; actual privacy/safety stops remain mandatory. Separate outbound credential, secret-free frozen payload, immutable original identity/time and no-uncertain-replay remain mandatory.

## Risks / owner review points

The current bearer/JSON transport is **not proven incompatible**, but endpoint-specific support was not established by the official sources inspected. The owner approved the documented multipart transport below. Same-second timestamps are currently allowed; the provider says the event must follow generation. Holding equality may hold later unattempted occurrences through the existing ordering rule. Local ownership does not constrain Meta's legacy Sheet integration. Missing explicit dataset assignment does not prove lack of effective access for an Admin system user.

## Owner clarification and revision-3 scope

The owner directed that EH be a reusable acquisition platform supporting simultaneous Meta Instant Forms, website forms and campaigns/ads. New campaigns reuse configured sources without code changes; new sources use configuration and immutable mappings. Future Instant Forms enter EH directly through its Meta intake, without the Yearly Sheet → Apps Script → Zapier path. This is the accepted product direction, not authorization to implement or activate it. [Repository assessment and platform gaps](../evidence/crm-multi-source-readiness-2026-10-01.md); [ADR scope clarification](../decisions/ADR-004-meta-lifecycle-feedback.md#owner-clarification-reusable-acquisition-platform-2026-10-01).

H3 covers provider contract, transport/authentication, credential/dataset entitlement, timestamp contract, disabled destination, security/rotation/recovery and the reusable activation safety contract. H3 needs no next campaign, Instant Form-versus-landing-page choice, future source ID, form creation, final mapping, cutoff/boundary or Yearly retirement. It creates no source policy, boundary or owner admission. The lead-ID-only manifest below is the existing Instant Form adapter contract; it is not a universal website matching contract or a requirement to choose Instant Forms for the next launch.

The [revision-2 evidence register](../evidence/crm-h3-blocker-evidence-2026-10-01.md) remains the source for observed assets and legacy configuration. Maroine EL Forssa is the accountable human; task independence remains mandatory. **Legacy stop/drain completeness is removed as an H3 blocker.** Yearly can continue until intentionally retired. Future activation must prove that its exact native source/cohort cannot also be sent by legacy automated, retry or manual paths. That proof may show a genuinely separate native source; it need not redesign legacy selective exclusion or retire unrelated Yearly traffic.

**No H3 package evidence blocker remains for the selected direct Events Manager route.** [Revision-5 evidence](../evidence/crm-h3-direct-capi-credential-2026-10-02.md) verifies the dataset’s issuance control and official CRM applicability. Custom app `1069638329182835` / actor `61594759444572` and ads scopes are not selected prerequisites. Approved owner decisions and later gated execution remain below.

## Revision-1 resolved facts and evidence limits

| Fact | Evidence / consequence |
| --- | --- |
| Advisory implementation/review/release completed | [PR #47 implementation](../evidence/crm-r4-advisory-implementation-2026-10-01.md), [Production verification](../evidence/crm-r4-advisory-production-2026-10-01.md). Reviewed head `f823b62a3bb06d40b1f572927bfa2af60fd4c857`, merge/deployed source `02ffccab1519c0b381196ef9e5f938a908fdd105`, ledger 001–103. PR head/merge and successful Verify run `36843888679` also read directly from GitHub this task. Production deployment/SQL-body/health evidence is inherited from the release record, not re-performed here. |
| Exact EH connection | Fresh read-only Production projection on project `hopcezradkhrixwwswxn`: `482b6b16-cdc9-4fa8-9a07-288195719d6c`, key `english-hills-meta`, provider `meta`, version **2**, Page `997579646781805`, account `1613720155930784`, API `v26.0`. Lifecycle mode/enabled/dataset/contract fields absent. Connection-level `enabled=false` is the separate intake webhook setting; do not toggle it for H3. |
| Exact Meta destination | Fresh Business Settings: English Hills pixel/dataset `1152399921284927`, owned by Glory Lot `1741597822557523`, connected to KAL ad account. Following View asset showed KAL ID `1613720155930784`; navigation's `selected_asset_id=120226027857760313` is not the endpoint/ad-account ID. Dataset has existing Pixel/CAPI traffic, not evidence of native delivery. |
| Native actor and app | Fresh system-user view: English Hills CRM `61594759444572`, **Admin**, English-hills app `1069638329182835` full access; four displayed assets, no dataset listed. Dataset People lists only legacy Conversions API System User `100089438321765`, partial **Use events dataset** access. |
| App security settings | Fresh Advanced settings for app `1069638329182835`: Require app secret **off**, Server IP allowlist empty, all-calls/app-role version selectors `v26.0`; app shown **Unpublished**. No setting changed; no app secret accessed. This resolves the displayed proof setting, not token validity or all possible route restrictions. |
| Legacy Sheet identity | Revision 1 found a candidate file/tab by metadata. Revision 2 follows Meta **View** to the exact file/tab, verifies the bound Apps Script and Zap watching **Meta Events**. [Fresh chain and limits](../evidence/crm-h3-blocker-evidence-2026-10-01.md#verified-legacy-sending-chain). The older name-match limit is closed; complete route/stop feasibility is not. |
| Receipt uncertainty | Existing conservative receipt/error handling and irreversible attempt boundary are implemented. Unknown response variants and a numeric server-only dedup horizon need not be invented to complete the design. They confer no replay permission. |

Revision-1 inspection date: 2026-10-01 Asia/Shanghai; UTC checkpoint `2026-10-01T11:35:01Z`. Browser views have no independently exported per-view timestamps. Account observations are not token authorization tests. Production query used `BEGIN READ ONLY`, selected only the listed nonsecret connection columns/JSON keys, then `COMMIT`; no customer tables, secret values or complete configuration blobs were read.

### Revision-1 official sources

Web fetch returned 429/unavailable; the browser rendered official pages. No third-party search result supplies contract authority. Historical sources remain in the [earlier dossier](../evidence/crm-h3-readiness-2026-10-01.md#fresh-official-source-register).

| Ref | Source inspected in revision 1 | Finding and limit |
| --- | --- | --- |
| H3-P1 | [CRM payload specification](https://developers.facebook.com/documentation/ads-commerce/conversions-api/conversion-leads-integration/payload-specification), updated June 28, 2026 | Free-form CRM stages, original lead ID, integer seconds, strict-after wording, seven days and required CRM constants. No explicit equality exception. |
| H3-P2 | [Using the API](https://developers.facebook.com/documentation/ads-commerce/conversions-api/using-the-api), updated July 17, 2026 | Versioned Pixel events edge; `v26.0` multipart example with `data` and `access_token` fields, JSON event envelope example. Error may coexist with accepted batch members. Test-coded events can affect measurement/targeting. No endpoint bearer-header assurance found. |
| H3-P3 | [Get started](https://developers.facebook.com/documentation/ads-commerce/conversions-api/get-started), updated June 28, 2026 | Own-app/system-user route assigns Pixel then issues token; direct own-business route needs no App Review or permission request. Do not import partner permissions or broad generic scopes. |
| H3-P4 | [Secure Graph requests](https://developers.facebook.com/docs/graph-api/guides/secure-requests) | TLS, server allowlist, `appsecret_proof = HMAC-SHA256(access_token, app_secret)`; Require App Secret can require proof. This is transport authentication, never event data. |
| H3-P5 | [Access-token guide](https://developers.facebook.com/documentation/facebook-login/guides/access-tokens), updated November 25, 2025 | Admin system users have default access to owned/shared business assets; employee actors require explicit assignments. Thus the UI omission above is not proof of effective denial. Exact selected route still needs entitlement metadata. |
| H3-P6 | [Pixel events reference](https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ads-pixel/events) | Ordinary receipt structure has integer `events_received`, `messages`, `fbtrace_id`; reference also lists alternate structures. Displayed HTTP example is v25.0, not a v26 CRM-specific guarantee. |
| H3-P7 | [Official Node SDK UserData at pinned commit](https://github.com/facebook/facebook-nodejs-business-sdk/blob/0d245ec888c1af38d68994fd7f2e24cd38abc82f/src/objects/serverside/user-data.js) | Fresh source read: string `lead_id` setter and normalization preserve the value unchanged. Prior activation M16 traces remaining event/HTTP serialization. SDK evidence supports lossless strings; explicit endpoint wire-type guarantee is not claimed. |

The Graph overview and the events reference's linked Using Graph guide were also read; the latter redirects to the overview. Neither closed the endpoint bearer question. Version v26.0 is evidenced by the current CAPI example and app configuration; prior dossier P1 supplies changelog evidence. Revalidate availability at execution; do not invent an expiry date.

## Exact provider-contract manifest — approved design, not seeded

Logical request: **POST `https://graph.facebook.com/v26.0/1152399921284927/events`**, one event per request. The endpoint identity is the dataset/Pixel, never Page/form/ad account. Event envelope has exactly `data:[event]`; event keys are `event_name`, `event_id`, `event_time`, `action_source`, `user_data`, `custom_data`. `user_data` contains only the original lossless decimal-string `lead_id`; `custom_data` contains only the two constants below. No test code, contact hashes, child fields, money or arbitrary passthrough. Authentication is added only at transport time.

| Internal kind | Exact provider name | Committed source / multiplicity |
| --- | --- | --- |
| `intake` | `Intake` | Canonical `lead_created`, NEW, original `external-intake:<first_submission_id>:lead`; singleton |
| `not_qualified` | `Not qualified` | Actual `lead_not_qualified` transition; repeat only after genuine reopen/re-entry |
| `lost` | `Lost` | Actual `lead_lost` transition; same genuine-repeat rule |
| `qualified` | `Qualified` | Actual `lead_qualified` transition; same genuine-repeat rule; approved initial positive target |
| `converted` | `Converted` | Canonical conversion activity and linked Confirmed/Validated enrollment; singleton, downstream |

These are EH-approved free-form names, not five Meta-mandated standard events. Preserve exact case/space. Activity `occurred_at` is event truth; neither upload time nor first-submission generation time substitutes for it. Provider identity remains the existing `eh:r4:<activity UUID>:<connection UUID>` construction; never issue a new ID to evade a hold.

The eventual row must specify every existing schema field, including defaults that would otherwise select the legacy model:

| `crm_lifecycle_provider_contracts` field | Proposed exact value / binding rule |
| --- | --- |
| `id` | Allocate one UUID in the later reviewed seed; record it before deployment/destination configuration. No row or UUID binding exists now. |
| `contract_key` | `eh_meta_crm_r4_v26_r1` |
| `revision` | `1` |
| `api_version` | `v26.0` |
| `qualified_event_name`, `converted_event_name` | `Qualified`, `Converted` |
| `lifecycle_model` | `r4_stage_entry` |
| `event_map` | `{"intake":"Intake","not_qualified":"Not qualified","lost":"Lost","qualified":"Qualified","converted":"Converted"}` |
| `action_source` | `system_generated` |
| `maximum_event_age_seconds` | `604800` |
| `uncertainty_policy` | `no_uncertain_replay` |
| `deduplication_window_seconds` | SQL `NULL`; no 48-hour or other fabricated guarantee |
| `accepted_response_field`, `accepted_response_count` | `events_received`, integer `1` |
| `lead_id_only` | `true` |
| `required_constants` | `{"event_source":"crm","lead_event_source":"English Hills CRM"}` |
| `evidence_urls` | Exact H3-P1–H3-P7 URLs above, seven strings (schema permits 1–10). Companion approval binds this plan/research revision and transport/timestamp decision. |
| `verified_on` | Actual date of final contract verification, not automatically this research date |
| `approved_at` | Actual owner approval UTC timestamp; not filled or backdated before approval |
| `active` | Proposed `true` only after contract prerequisites pass; usability does not enable sending |
| `created_at` | Database default at actual insertion; record on readback |

The registry does **not** store dataset, connection, auth transport, proof policy or strict timestamp rule. Bind these in the approved companion manifest and exact reviewed application/SQL SHA; a seed cannot fix code. `contract_key` is globally unique as well as paired with revision: a future replacement needs a new key, not a second row with the same key or an UPDATE. Rows are append-only, including `active`; do not promise rollback by updating/deleting a contract.

Seed acceptance, in a later commissioned task: exactly one approved row; no permissive upsert/conflict-ignore hiding a mismatch; expected collision fails. Explicit field readback equals the reviewed manifest. Verify fresh chain and 103→new-forward-changes→seed locally, constraints/ACL/immutability, invalid map/constants/count/horizon rejection, and untouched activation inventory. Exact migration filename, file digest, head/base/CI merge SHAs and owner approval become the immutable seed evidence. No form/policy/evidence/boundary/ownership/epoch/delivery/attempt, secret, cron or live gate may be seeded. This document is not executable seed SQL.

### Receipt semantics

Deployed [adapter](../../../src/lib/crm/lifecycle/adapter.mjs): HTTP 2xx, no provider `error`, numeric `events_received === 1` is sent/receipt. `messages` are not acknowledgment; a bounded valid `fbtrace_id` may be retained as correlation only. `success:true`, string `"1"`, count zero/missing, malformed or contradictory 2xx stays unknown. Receipt does not prove uniqueness, attribution, CRM recognition, coverage or optimization.

401/403 and Graph 3/10/102/190/200–299 block for repair. Focused Graph 100 without subcode is terminal validation. Live 429/5xx, network/timeout, Graph 1/2/4/17/341 and unknown codes/subcodes/responses are unknown. Credential repair never releases started/unknown identity. Preserve the worker's committed begin and database finish/lease rules. No exact duplicate-response guarantee is established; no numeric horizon is needed under approved no-uncertain-replay. Unknown alternate receipts are an accepted conservative limitation for owner review, not an instruction to probe Meta or expand success detection.

## Authentication compatibility and proof

Current deployment sends JSON with `Authorization: Bearer`, no proof. H3-P2 establishes a supported **multipart/form-data** alternative: form field `data` is JSON serialization of the one-element event array, and form field `access_token` is the dedicated token. Owner-approved decision A uses this documented encoding rather than asserting unverified bearer compatibility. Do not send both token methods or put credentials in query strings. The frozen database payload remains the exact token-free JSON event envelope.

A later implementation must assemble the form only immediately before fetch; let the HTTP library set its multipart boundary. Preserve fixed host/path, redirect rejection, no-store, eight-second timeout, bounded response, one event, classification and zero automatic unknown replay. Do not persist or log form body, token, headers or exceptions containing request data. The direct CRM non-SDK route documents access token plus Pixel ID; it does not require the custom English-hills app secret. That app’s proof switch is not evidence of the managed credential issuer’s policy. Recheck actual route restrictions before issuance/configuration.

If proof is required by the selected route or settings change, **stop**: the deployed adapter has no proof input. A separate approved patch must compute the HMAC with the token's issuing app secret and add `appsecret_proof` as a transport-only field. Use separate server-only app-secret storage, deny client/preview exposure, and rotate derived proof with the token. Do not turn off a security setting, substitute an app token, copy the legacy token or put proof in the event to bypass incompatibility. This proof patch is conditional, not silently commissioned here.

The selected Events Manager route needs no custom-app publication/App Review or permission request under the [direct credential evidence](../evidence/crm-h3-direct-capi-credential-2026-10-02.md). Custom-app Unpublished/Ready-for-testing status is not an H3 prerequisite. Unexpected publication, permission, proof or shared-credential changes at execution stop the operator; do not silently fall back to custom-app issuance.

## Strict timestamp and equality contract — approved correction

H3-P1 requires event time after generation. [Adapter](../../../src/lib/crm/lifecycle/adapter.mjs) rejects only `<`; [103 reconcile](../../../supabase/migrations/103_crm_meta_funnel_r4_advisory_d2.sql) also rejects only earlier activity time, and delivery export floors both times. No inspected official source permits equality. Intake uses the actual CRM creation activity, not a fabricated generation-time event, so equality is possible but not inevitable.

Approved rule: for all five live kinds, `floor(event_occurred_at epoch seconds) > floor(original_submission.occurred_at epoch seconds)`. Original submission must retain authentic Meta generation time. Null/invalid source, earlier time and equal exported seconds fail closed before committed begin. Subsecond ordering alone is insufficient. Keep actual activity timestamp, event ID and deadline unchanged. Waiting until the next second does not repair a frozen equal-second event; adding one second, using dispatch time, rebuilding the activity or generating another Intake is forbidden.

Apply the same rule at reconciliation, pure authoritative hold, payload prepare validation and committed begin revalidation, plus adapter validation **including an already-prepared payload**. The adapter currently returns `delivery.payload` early; changing one comparison alone is insufficient. Use a new safe reason such as `provider_time_not_after_source` with immutable no-repair semantics for affected live occurrences, preserve legacy/mock behavior and the sharing-stop lock hierarchy. No Production event inventory exists to backfill.

Consequence accepted with the revision-5 strict-second design: an equal-second Intake/earlier unattempted event remains held and can hold later occurrences under R4 chronological-attempt ordering. Do not silently mark it sent/attempted, terminalize it merely to advance successors, or suppress the entire opportunity forever by a new rule. Existing deadline/epoch/retention behavior remains. If the owner wants later stages to bypass this hold, that is a separate R4 ordering decision, outside this correction. Alternative: obtain written Meta endpoint-specific equality guidance and review the exact interpretation before retaining equality.

Future synthetic acceptance: exact equality, subsecond equality after flooring, +1 second, -1 second, missing generation, future event, 604800-second age/8-second margin, same-second Intake with later stage, prepared-payload path, direct SQL prepare/begin and director retry. Assert zero HTTP/attempt boundary for invalid time, unchanged IDs/timestamps/deadlines, existing predecessor holds and no D2/stop/unknown bypass. No provider POST is needed for these tests.

## Credential provisioning, storage and rotation design

**HISTORICAL — SUPERSEDED BY S1.** This original section is retained as reasoning only; use the S1 runbook linked above.

Selected route: **Events Manager → dataset `1152399921284927` → Settings → Conversions API → Set up direct integration → without Dataset Quality API → new access token**, under owner business `1741597822557523`. [Revision-5 evidence](../evidence/crm-h3-direct-capi-credential-2026-10-02.md) directly binds this route to CRM lifecycle use. Do not use custom app `1069638329182835` / actor `61594759444572` issuance or infer ads scopes. Their observed lifetime, installed grants and proof switch do not transfer to this route.

The current UI defaults to Dataset Quality API and warns that its generation extends permissions to older tokens. Later authorized issuance must use **without Dataset Quality API**; no radio/control was changed here. Dedicated means a newly issued EH-only token and separate storage, not an assumed exclusive managed actor. Exact issuer/lifetime/entitlement and isolated recovery metadata are later protected operator outputs. Stop if the route would reuse a legacy token, alter older permissions, require shared/bulk revocation or unexpectedly manage existing integrations. No automatic fallback or speculative grant is permitted.

| Record | Required content, never secret values |
| --- | --- |
| Issuance | Direct Events Manager route without DQA; business/dataset IDs; actual managed issuer/subject if available (never assumed custom-app IDs); issuing operator; effective entitlement metadata; evidence date; issuance time and actual expiry or verified non-expiring status |
| Storage | Production Vercel project `english-hills-admin`, server-only `CRM_META_LIFECYCLE_TOKEN_EH_R4`; secret-manager reference and version/metadata only; no local `.env`, Git, chat, preview/dev, browser or ordinary database secret value |
| Separation | New EH-only outbound token; verify separate storage/use and token-specific recovery before use; do not copy/revoke inbound or legacy credentials. Scheduler bearer/Vault setup is deferred to a separately enumerated task; it is not necessary for disabled destination preparation |
| Ownership | Named credential custodian, backup/revocation authority, release operator, review/rotation due date; Maroine EL Forssa is assigned to the human roles; actual schedule and protected access must be bound before execution |
| Validity verification | Authorized operator checks issuer/subject/expiry/scopes/assets using protected tools and records only nonsecret summary. No token echo, Graph Explorer event test or `/events` POST. Metadata is not delivery proof |

Owner-approved routine policy: review metadata every 30 days; rotate before the earlier of actual expiry minus seven days or 90 days from issuance (including non-expiring tokens). These are approved EH policy, not Meta mandates. If issuance lifetime is shorter, set a documented feasible window before use. Emergency rotation/revocation is incident-driven.

H3 rotation: first bind a verified token-specific replacement/revocation method; if only shared/bulk actions are available, stop and revise recovery without touching legacy. Verify closed/empty gates; issue a dedicated replacement only under separate approval; store under the approved server reference; deploy/redeploy with gate still absent/false; verify nonsecret metadata and READY configuration; revoke only the superseded outbound token after replacement is verified. Keep old secret available only in approved secure recovery storage during the bounded handover, then remove it. Do not print either value. If replacement fails, remain dormant; restore the prior still-valid secret only if authorized and uncompromised. If compromised, revoke it and remain dormant rather than restoring it. A changed app/actor/proof/scope requires re-review, not routine rotation.

After H4, credential rotation requires the separately approved pause/recovery procedure: close outbound gates/epoch, preserve unknowns, and require new prospective activation approval. Never reopen an epoch, transfer native opportunities to legacy or replay frozen deliveries under a new credential.

## Reusable producer exclusion contract — evidence at H4 activation

H3 preserves the fail-closed contract implemented by cumulative 101–103: prospective source/mapping-bound policy and finite producer boundary; immutable original source and single opportunity/destination ownership; independent epoch, destination, server and scheduler gates; begin-time safety checks across scheduled, retry and direct protected paths; no uncertain replay. Without a verified boundary, a newly configured source cannot become eligible for native lifecycle sending. Local ownership cannot prevent an external sender; activation evidence must establish external exclusion.

H3 does **not** require a complete census or feasible stop/drain of every legacy route. The Yearly investigation and bounded stop/drain procedure are retained as conditional H4 evidence, not a prerequisite to preparing the dormant connector. No native source is added to legacy infrastructure as the default architecture.

At each separately authorized source activation, the release operator must bind:

| Activation control | Evidence required for the actual source/cohort at H4 |
| --- | --- |
| Native source identity | Exact connection, immutable mapping/version, original provider identity, prospective policy and boundary; campaign/ad attribution remains separate |
| External automated paths | Show that the chosen native source cannot enter or dispatch through the Yearly managed integration, Sheet/script/Zap or another sender, including wildcard/automatic source adoption. A different form name or intended direct routing alone is insufficient |
| Queued/retry/manual paths | Include delayed/in-flight work, dead letters, reconnect/backfill, replay, copies/imports and manual uploads capable of sending this source/cohort. Account for privileges and enforceable restrictions; operator assurance alone does not replace a technical control where bypass is possible |
| Disjointness or intentional retirement | If evidence proves source separation across those paths, unrelated Yearly traffic may continue. If it cannot, hold that activation and commission the necessary bounded exclusion or intentional stop/drain of affected legacy paths. No blanket legacy retirement or long-term selective-coexistence redesign is imposed by H3 |
| Evidence freshness and drift | Bind exact configuration revisions, accountable operator, verification reference and expiry in the existing producer boundary. Expired evidence or a newly uncovered path holds dispatch/activation; recover through approved stop controls, never ownership reassignment |

Use the [legacy evidence/conditional stop procedure](../evidence/crm-h3-blocker-evidence-2026-10-01.md#complete-legacy-outbound-stopdrain-design--later-h4-preparation-only) only if applicable to the eventual source. A stop/drain accounts for and quarantines unsent work; it never sends a backlog to empty a queue. Actual retirement, cancellation and no-overlap verification occur only with future native activation approval. Do not change Yearly, its Sheet/script/Zap, Pixel traffic or inbound acquisition in H3.

## Approved owner decisions

The [final owner approval](#final-owner-architecture-approval--2026-10-02) selects revision 5 without reopening D2, five names, repeats/singletons, Qualified target, original matching or no-uncertain-replay. Prior unselected alternatives are not pending owner decisions for this implementation.

| Decision | Approved choice / boundary |
| --- | --- |
| Transport | Multipart/form-data using the dedicated direct Events Manager CAPI token; token added only at the transport boundary, never to the frozen payload |
| Equality | Strict exported-second handling; equality/earlier invalid time holds without fabricating time, preserving the documented predecessor/coverage consequence |
| Credential route | New EH-only direct Events Manager credential **without Dataset Quality API**; exclusive EH use/storage and isolated recovery, no legacy/inbound token reuse or revocation |
| Contract/configuration | Proposed provider-contract manifest and disabled destination configuration for dataset `1152399921284927`, `max_attempts=5`; exact remaining manifest fields below/above remain as specified, not a seed applied by this task |
| Credential governance | Metadata review every 30 days; rotation before the earlier of 90 days from issuance or seven days before actual expiry; Maroine EL Forssa remains accountable custodian/revocation authority |
| Scope | Bounded H3 implementation and dormant preparation only, in separate tasks; no H4 source/form/cohort selection, provider event sending, destination enablement, server live gate or scheduler activation |

## Remaining external/account actions — later authorization required

These are planned H3 execution actions, not requirements to create secrets during this review task:

1. Recheck exact dataset/business and Events Manager direct-only issuance availability; bind operator authority and the [dedicated credential/recovery contract](../evidence/crm-h3-direct-capi-credential-2026-10-02.md#dedicated-credential-and-later-operator-contract). No custom-app scope selection, publication or speculative dataset assignment. Stop for DQA/legacy permission changes or shared revocation.
2. Issue/store a dedicated outbound credential through approved secure operator tooling; verify nonsecret metadata and rotation/revocation ownership. Never obtain it through this documentation task.
3. After reviewed/deployed transport/time corrections, deploy the independently reviewed immutable contract seed and configure the existing EH connection **disabled**. Re-read current connection version first; version 2 is an observation, not a future concurrency token.
Legacy path census, applicable exclusion/retirement design and actual no-overlap evidence are H4 source-activation work, not H3 external actions.

Lack of an already-issued token, already-applied seed, actual approval timestamp or future form is not by itself a blocker to reviewing a complete design. The selected direct route closes the previous credential evidence gap; actual protected issuance/metadata/recovery checks remain gated execution outputs. The human roster is bound. Source-specific exclusion feasibility is an H4 activation hold, not an H3 package gap.

## Named H3 execution steps, order and recovery

Step names are fixed. **Maroine EL Forssa** is the owner-confirmed accountable human for H3 approval, Meta assets, credential custody/token-specific revocation, legacy sending/drift, EH director configuration, release/DB and verification/recovery. The [step-by-step roster](../evidence/crm-h3-blocker-evidence-2026-10-01.md#human-roster-and-task-independence) binds H3-01–08 to these roles. Architecture, implementation, independent review and release must use separate task/agent/session instances under AGENTS; current author/internal QA cannot self-review. H3-07 uses a separate verification task from release. One human may supervise all these tasks. Instance IDs, protected stored-role authority, approvals and actual windows are bound at commissioning; no additional human name is invented. A second backup human is optional continuity planning.

| Order / named step | Responsible role / entry condition | Verification / stop / recovery |
| --- | --- | --- |
| H3-01 Evidence freeze | H3 owner + technical author; bind the recorded revision-5 approval, closed evidence gaps and named roster | Bind plan commit/digest, source references, exact assets and allowed actions. If evidence/route differs, revise before execution |
| H3-02 Compatibility implementation | Separate implementer after architecture owner approval; transport/time modules below only | Synthetic tests, internal QA, exact-head CI and fresh independent review; no provider/Production access. Findings corrected/re-reviewed before release |
| H3-03 Dormant compatibility release | Separate release operator after exact-SHA release approval | Reconfirm intended Production project/deployment, ledger 001–103, zero lifecycle inventory, disabled cron/gate/destination and healthy intake. Deploy compatible app/forward SQL in reviewed order; stop on any inventory/drift. No seed yet |
| H3-04 Contract seed | Separate implementer/reviewer then DB release operator, after final provider manifest approval and H3-03 verification | Allocate next free migration, bind UUID/key/revision/evidence/real dates. Local fresh+upgrade tests, exact-head CI/review, separate release approval. Read back exactly one matching row; gates and all other lifecycle inventory stay closed/empty |
| H3-05 Entitlement and dedicated secret | Named Meta asset operator + credential custodian, after direct-route approval and fresh preflight | New Events Manager token without DQA, Production-only storage, actual issuer/entitlement/expiry and isolated recovery verification. No speculative assignment. Stop for unexpected proof/scope/publication, token reuse, shared revocation or legacy changes; READY source/config/gate remains dormant |
| H3-06 Disabled destination binding | Named EH director, after H3-04/05; no source or legacy prerequisite | `crm_configure_lifecycle` for verified UUID, freshly read version; data contains only `mode=live`, `enabled=false`, dataset `1152399921284927`, `secret_ref=CRM_META_LIFECYCLE_TOKEN_EH_R4`, actual seeded `contract_id`, `max_attempts=5`. RPC derives constants/version/map. Re-read disabled config, exact contract and incremented version; preserve inbound fields |
| H3-07 Independent dormant acceptance | Verification/recovery owner, all prior records bound | Contract=1 expected; disabled configured destination=1 expected; enabled destinations, policies/evidence, boundaries, owners, epochs, deliveries/attempts remain zero. Cron inactive/zero runs, gate absent/false, intake health unchanged. Record READY deployment ID/source, SQL ledger/digests and nonsecret credential metadata. No network delivery probe |
| H3-08 Owner handoff to H4 | H3 owner after acceptance | Record H3 completed only with actual evidence. H4 remains unapproved; no source/form/cohort/epoch activation bundled in signoff |

Recovery before any H3 mutation: stop on version conflict, asset mismatch, expired evidence, nonzero unexpected lifecycle inventory, unhealthy intake, changed proof requirement or missing named authority. Re-read and revise; do not retry a mutation with guessed version or widen access. Keep all send controls closed. If an unauthorized enabled state appears, halt and escalate under the existing incident authority; this read-only task itself does not operate switches.

Later approved release recovery: preserve immutable history, correct application/configuration with gates closed and use reviewed forward SQL. A seed cannot be rolled back by deleting/updating its row; leave it unused and bind a new reviewed replacement key if necessary. No migration-ledger repair. Recover inbound health independently, never revoke its token as an outbound kill switch. If any attempt unexpectedly exists, preserve possible-dispatch uncertainty and stop for incident review; never clear rows to restore the expected zero count. Named recovery owner records partial completion so operations are not repeated blindly.

## Items deferred to H4

Actual prospective form/source identity and any creation/publication/binding; final immutable source mapping; cohort policy, source-specific exclusion feasibility and concrete no-overlap proof; intentional legacy shutdown/drain only if required for that activation; finite producer boundary/expiry; then-current source/use-specific platform/privacy review; natural first-submission admission and ownership; exact future cutoff/live window/epoch; scheduler bearer/Vault preparation if separately approved; destination enablement, server gate and cron-last activation. No retrospective admission, current Yearly reuse or custom D2-checkbox prerequisite is introduced. CRM recognition, natural coverage and optimization validation follow separately authorized natural events; API receipt alone cannot establish them.

## Exact remaining blocker to a fully bound H3 owner-review package

**Credential blocker closed.** [Events Manager direct credential evidence](../evidence/crm-h3-direct-capi-credential-2026-10-02.md) verifies the actual dataset’s route and authoritative CRM token instructions. No custom-app publication or ads-scope inference is needed. **ARCHITECTURE APPROVED — READY FOR SEPARATE H3 IMPLEMENTATION**, not credential-issued, implemented or H3-complete.

**Removed H3 blocker — legacy stop/drain:** the owner clarification places actual-source exclusion investigation and any necessary legacy retirement at H4 activation. No selective long-term coexistence design is required for H3. The reusable fail-closed control contract above remains mandatory.

**Closed blocker — execution ownership:** owner assigned Maroine EL Forssa to the human roster above. Separate implementation, independent review, release and verification task identities and artifact-bound operation windows are future commissioning records, not unknown human owners.

The owner selected the documented multipart/strict-second path, closing the need to prove bearer/equality acceptance. Any later change to that choice requires new evidence and affected architecture approval. Unknown duplicate acknowledgment/numeric server-only dedup horizon, absent credentials/seed, future form/mapping/cohort and the completed advisory-D2 implementation are **not additional package blockers**. Exact reviewed patch/seed SHAs and actual approval dates are outputs of later gated steps; they are not falsely asserted as existing.

## IMPLEMENTATION CONTRACT

This PR is architecture/readiness documentation only. Preserve current main code, migrations, all Meta/Production state and settled advisory-D2 contracts. Documentation validation: relative links/anchors, source cross-check, no secrets/customer records, docs-only diff and `git diff --check`; existing required CI still applies. No application tests are needed locally for this docs-only diff. Review/merge/release remain governed by [AGENTS](../../../AGENTS.md); this package status is not a formal independent-review verdict or merge approval.

Under the recorded owner architecture approval, a separately commissioned Tier-3 implementation task may touch `src/lib/crm/lifecycle/adapter.mjs`, `worker.mjs` only as needed for transport inputs, `server.js` only if proof storage is approved, and new forward SQL replacing affected R4 reconcile/hold/prepare/begin validation with unchanged locks/ACLs. Review transitive claim/retry/get/prepared-payload paths. Extend existing lifecycle JS and R4/advisory SQL tests for the timestamp/auth cases above. No policy/D2, matching, event scope, owner model, outbox or ordering redesign. Review library/framework local guides before code. Fresh/103-upgrade, role, retention, no-unknown-replay and relevant concurrency checks plus required CI and independent exact-SHA review precede separately authorized release. The provider-contract design is approved; its seed remains a separate reviewed migration with artifact-bound release approval; no credentials or activation data in it.

Stop for any broadening, source-specific activation work in H3, need to change event truth or successor ordering, new secret/proof requirement, actual nonempty Production inventory or expired provider evidence. Update this package and obtain the affected decision rather than silently implementing. **ARCHITECTURE APPROVED — READY FOR SEPARATE H3 IMPLEMENTATION** with the direct credential route. This task executes no H3 work; operational releases require separate approval and H4 remains unauthorized.
