# Owner summary

## What will change

This **Tier-3 H3 technical package, revision 1, 2026-10-01**, replaces the earlier H3 dossier's current blocker assessment. It proposes a bounded path to a verified provider contract and disabled native destination. **NOT READY FOR H3 OWNER REVIEW** as a fully bound execution package: the exact remaining evidence gaps are listed below. Decisions with concrete alternatives can be reviewed now; they are not execution permission.

Read-only research and documentation only. No runtime, migration, seed, credential, account permission or Production configuration change is included. No test or real events were sent. Main baseline: `59754c0bcc2261ec36ccf23c80afece98372999f`.

## What staff/users will be able to do

Nothing new in Production. A later authorized H3 operator can prepare the native sender while every sending gate stays closed. Receptionists gain no controls. The owner receives exact contract fields, outstanding decisions, external actions and ordered stop/recovery instructions.

## What remains restricted

No future form creation/binding, final source mapping, cohort policy/boundary publication, ownership admission, epoch, destination enablement, server live gate, scheduler activation or provider events. These are H4 or separately authorized operations. Existing Yearly, historical, website-first and later-Meta opportunities remain excluded. No new matching fields, financial data, child data or uncertain replay.

## UI impact

None in this PR. Future timestamp diagnostics, if commissioned, expose a coarse hold reason only. Public docs and authenticated account settings were inspected read-only. No token-generation, permission-edit or save control was used.

## Database impact

None. Migration **103 is Production-verified dormant and immutable**, not a remaining implementation task. A later reviewed timestamp correction may need forward SQL; a separate later immutable provider-contract seed is still necessary. Recheck migration allocation; do not reserve 104 or modify 001–103.

## Important security decisions

[ADR-004](../decisions/ADR-004-meta-lifecycle-feedback.md), [approved R4](crm-meta-funnel-revision-4.md), and the completed [advisory-D2](completed/crm-meta-funnel-r4-d2-advisory.md) / [sharing-stop](completed/crm-meta-funnel-r4-sharing-stop-contract.md) contracts remain authoritative. Do not reopen their architecture. Optional custom D2 proof never fabricates consent; actual privacy/safety stops remain mandatory. Separate outbound credential, secret-free frozen payload, immutable original identity/time and no-uncertain-replay remain mandatory.

## Risks / owner review points

The current bearer/JSON transport is **not proven incompatible**, but endpoint-specific support was not established by the official sources inspected. A concrete documented multipart alternative is proposed below. Same-second timestamps are currently allowed; the provider says the event must follow generation. Holding equality may hold later unattempted occurrences through the existing ordering rule. Local ownership does not constrain Meta's legacy Sheet integration. Missing explicit dataset assignment does not prove lack of effective access for an Admin system user.

## Resolved H3 facts and evidence limits

| Fact | Evidence / consequence |
| --- | --- |
| Advisory implementation/review/release completed | [PR #47 implementation](../evidence/crm-r4-advisory-implementation-2026-10-01.md), [Production verification](../evidence/crm-r4-advisory-production-2026-10-01.md). Reviewed head `f823b62a3bb06d40b1f572927bfa2af60fd4c857`, merge/deployed source `02ffccab1519c0b381196ef9e5f938a908fdd105`, ledger 001–103. PR head/merge and successful Verify run `36843888679` also read directly from GitHub this task. Production deployment/SQL-body/health evidence is inherited from the release record, not re-performed here. |
| Exact EH connection | Fresh read-only Production projection on project `hopcezradkhrixwwswxn`: `482b6b16-cdc9-4fa8-9a07-288195719d6c`, key `english-hills-meta`, provider `meta`, version **2**, Page `997579646781805`, account `1613720155930784`, API `v26.0`. Lifecycle mode/enabled/dataset/contract fields absent. Connection-level `enabled=false` is the separate intake webhook setting; do not toggle it for H3. |
| Exact Meta destination | Fresh Business Settings: English Hills pixel/dataset `1152399921284927`, owned by Glory Lot `1741597822557523`, connected to KAL ad account. Following View asset showed KAL ID `1613720155930784`; navigation's `selected_asset_id=120226027857760313` is not the endpoint/ad-account ID. Dataset has existing Pixel/CAPI traffic, not evidence of native delivery. |
| Native actor and app | Fresh system-user view: English Hills CRM `61594759444572`, **Admin**, English-hills app `1069638329182835` full access; four displayed assets, no dataset listed. Dataset People lists only legacy Conversions API System User `100089438321765`, partial **Use events dataset** access. |
| App security settings | Fresh Advanced settings for app `1069638329182835`: Require app secret **off**, Server IP allowlist empty, all-calls/app-role version selectors `v26.0`; app shown **Unpublished**. No setting changed; no app secret accessed. This resolves the displayed proof setting, not token validity or all possible route restrictions. |
| Legacy Sheet identity | Metadata-only Drive lookup found [yearly-program-fb](https://docs.google.com/spreadsheets/d/1CM5bq30zUQJoGZkc0eczRtmJ8eYQ-dkfAzSzDGA_OBM/edit), file ID `1CM5bq30zUQJoGZkc0eczRtmJ8eYQ-dkfAzSzDGA_OBM`, modified `2026-10-01T11:31:45.381Z`. Earlier dossier A5 links the displayed Sheet/tab name to Yearly and dataset. Same title is a candidate identity, not proof of connector binding; numeric tab/integration IDs and sender configuration remain unverified. No Sheet rows read. |
| Receipt uncertainty | Existing conservative receipt/error handling and irreversible attempt boundary are implemented. Unknown response variants and a numeric server-only dedup horizon need not be invented to complete the design. They confer no replay permission. |

Inspection date: 2026-10-01 Asia/Shanghai; UTC checkpoint `2026-10-01T11:35:01Z`. Browser views have no independently exported per-view timestamps. Account observations are not token authorization tests. Production query used `BEGIN READ ONLY`, selected only the listed nonsecret connection columns/JSON keys, then `COMMIT`; no customer tables, secret values or complete configuration blobs were read.

### Fresh official sources

Web fetch returned 429/unavailable; the browser rendered official pages. No third-party search result supplies contract authority. Historical sources remain in the [earlier dossier](../evidence/crm-h3-readiness-2026-10-01.md#fresh-official-source-register).

| Ref | Source inspected this task | Finding and limit |
| --- | --- | --- |
| H3-P1 | [CRM payload specification](https://developers.facebook.com/documentation/ads-commerce/conversions-api/conversion-leads-integration/payload-specification), updated June 28, 2026 | Free-form CRM stages, original lead ID, integer seconds, strict-after wording, seven days and required CRM constants. No explicit equality exception. |
| H3-P2 | [Using the API](https://developers.facebook.com/documentation/ads-commerce/conversions-api/using-the-api), updated July 17, 2026 | Versioned Pixel events edge; `v26.0` multipart example with `data` and `access_token` fields, JSON event envelope example. Error may coexist with accepted batch members. Test-coded events can affect measurement/targeting. No endpoint bearer-header assurance found. |
| H3-P3 | [Get started](https://developers.facebook.com/documentation/ads-commerce/conversions-api/get-started), updated June 28, 2026 | Own-app/system-user route assigns Pixel then issues token; direct own-business route needs no App Review or permission request. Do not import partner permissions or broad generic scopes. |
| H3-P4 | [Secure Graph requests](https://developers.facebook.com/docs/graph-api/guides/secure-requests) | TLS, server allowlist, `appsecret_proof = HMAC-SHA256(access_token, app_secret)`; Require App Secret can require proof. This is transport authentication, never event data. |
| H3-P5 | [Access-token guide](https://developers.facebook.com/documentation/facebook-login/guides/access-tokens), updated November 25, 2025 | Admin system users have default access to owned/shared business assets; employee actors require explicit assignments. Thus the UI omission above is not proof of effective denial. Exact selected route still needs entitlement metadata. |
| H3-P6 | [Pixel events reference](https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ads-pixel/events) | Ordinary receipt structure has integer `events_received`, `messages`, `fbtrace_id`; reference also lists alternate structures. Displayed HTTP example is v25.0, not a v26 CRM-specific guarantee. |
| H3-P7 | [Official Node SDK UserData at pinned commit](https://github.com/facebook/facebook-nodejs-business-sdk/blob/0d245ec888c1af38d68994fd7f2e24cd38abc82f/src/objects/serverside/user-data.js) | Fresh source read: string `lead_id` setter and normalization preserve the value unchanged. Prior activation M16 traces remaining event/HTTP serialization. SDK evidence supports lossless strings; explicit endpoint wire-type guarantee is not claimed. |

The Graph overview and the events reference's linked Using Graph guide were also read; the latter redirects to the overview. Neither closed the endpoint bearer question. Version v26.0 is evidenced by the current CAPI example and app configuration; prior dossier P1 supplies changelog evidence. Revalidate availability at execution; do not invent an expiry date.

## Exact provider-contract manifest — proposed, not seeded

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

Current deployment sends JSON with `Authorization: Bearer`, no proof. H3-P2 establishes a supported **multipart/form-data** alternative: form field `data` is JSON serialization of the one-element event array, and form field `access_token` is the dedicated token. Proposed decision A uses this documented encoding rather than asserting unverified bearer compatibility. Do not send both token methods or put credentials in query strings. The frozen database payload remains the exact token-free JSON event envelope.

A later implementation must assemble the form only immediately before fetch; let the HTTP library set its multipart boundary. Preserve fixed host/path, redirect rejection, no-store, eight-second timeout, bounded response, one event, classification and zero automatic unknown replay. Do not persist or log form body, token, headers or exceptions containing request data. No app secret is needed solely because the current displayed Require app secret switch is off. Recheck it and effective route restrictions before issuance/configuration.

If proof is required by the selected route or settings change, **stop**: the deployed adapter has no proof input. A separate approved patch must compute the HMAC with the token's issuing app secret and add `appsecret_proof` as a transport-only field. Use separate server-only app-secret storage, deny client/preview exposure, and rotate derived proof with the token. Do not turn off a security setting, substitute an app token, copy the legacy token or put proof in the event to bypass incompatibility. This proof patch is conditional, not silently commissioned here.

App Unpublished is observed; H3-P3 exempts the direct own-business route from App Review. That is not proof that every issuer/account restriction is satisfied, nor authorization to publish the app. Record effective route applicability and scopes/tasks at nonsecret preflight; unexpected publication/permission requirements stop execution for a revised package.

## Strict timestamp and equality contract — proposed correction

H3-P1 requires event time after generation. [Adapter](../../../src/lib/crm/lifecycle/adapter.mjs) rejects only `<`; [103 reconcile](../../../supabase/migrations/103_crm_meta_funnel_r4_advisory_d2.sql) also rejects only earlier activity time, and delivery export floors both times. No inspected official source permits equality. Intake uses the actual CRM creation activity, not a fabricated generation-time event, so equality is possible but not inevitable.

Recommended rule: for all five live kinds, `floor(event_occurred_at epoch seconds) > floor(original_submission.occurred_at epoch seconds)`. Original submission must retain authentic Meta generation time. Null/invalid source, earlier time and equal exported seconds fail closed before committed begin. Subsecond ordering alone is insufficient. Keep actual activity timestamp, event ID and deadline unchanged. Waiting until the next second does not repair a frozen equal-second event; adding one second, using dispatch time, rebuilding the activity or generating another Intake is forbidden.

Apply the same rule at reconciliation, pure authoritative hold, payload prepare validation and committed begin revalidation, plus adapter validation **including an already-prepared payload**. The adapter currently returns `delivery.payload` early; changing one comparison alone is insufficient. Use a new safe reason such as `provider_time_not_after_source` with immutable no-repair semantics for affected live occurrences, preserve legacy/mock behavior and the sharing-stop lock hierarchy. No Production event inventory exists to backfill.

Consequence requiring explicit owner acceptance: an equal-second Intake/earlier unattempted event remains held and can hold later occurrences under R4 chronological-attempt ordering. Do not silently mark it sent/attempted, terminalize it merely to advance successors, or suppress the entire opportunity forever by a new rule. Existing deadline/epoch/retention behavior remains. If the owner wants later stages to bypass this hold, that is a separate R4 ordering decision, outside this correction. Alternative: obtain written Meta endpoint-specific equality guidance and review the exact interpretation before retaining equality.

Future synthetic acceptance: exact equality, subsecond equality after flooring, +1 second, -1 second, missing generation, future event, 604800-second age/8-second margin, same-second Intake with later stage, prepared-payload path, direct SQL prepare/begin and director retry. Assert zero HTTP/attempt boundary for invalid time, unchanged IDs/timestamps/deadlines, existing predecessor holds and no D2/stop/unknown bypass. No provider POST is needed for these tests.

## Credential provisioning, storage and rotation design

Recommended candidate route: own-business app `1069638329182835` and native actor `61594759444572` to dataset `1152399921284927`. Existing actor is Admin, so this is not a claim of asset-minimal identity. H3-P5 establishes inherited Admin access; current explicit assignment is absent. Named asset operator must reconcile effective rights with H3-P3's dataset-assignment step and record actual entitlement. Do not add broad grants simply to make the UI list nonempty. A dedicated Employee sender is an alternative least-privilege design requiring its own approved actor/app bindings; do not silently create it or reduce the existing actor's intake rights.

| Record | Required content, never secret values |
| --- | --- |
| Issuance | Selected route; business/app/system-user/dataset IDs; issuing operator; actual scopes/task labels and machine IDs if available; verification timestamp/reference; issuance time and expiry or documented non-expiring status |
| Storage | Production Vercel project `english-hills-admin`, server-only `CRM_META_LIFECYCLE_TOKEN_EH_R4`; secret-manager reference and version/metadata only; no local `.env`, Git, chat, preview/dev, browser or ordinary database secret value |
| Separation | New outbound token; do not copy/revoke inbound or legacy credentials. Scheduler bearer/Vault setup is deferred to a separately enumerated task; it is not necessary for disabled destination preparation |
| Ownership | Named credential custodian, backup/revocation authority, release operator, review/rotation due date; all must be supplied before execution |
| Validity verification | Authorized operator checks issuer/subject/expiry/scopes/assets using protected tools and records only nonsecret summary. No token echo, Graph Explorer event test or `/events` POST. Metadata is not delivery proof |

Proposed routine policy for owner choice: review metadata every 30 days; rotate before the earlier of actual expiry minus seven days or 90 days from issuance (including non-expiring tokens). These are EH recommendations, not Meta mandates. If issuance lifetime is shorter, set a documented feasible window before use. Emergency rotation/revocation is incident-driven.

H3 rotation: verify closed/empty gates; issue a dedicated replacement only under separate approval; store under the approved server reference; deploy/redeploy with gate still absent/false; verify nonsecret metadata and READY configuration; revoke only the superseded outbound token after replacement is verified. Keep old secret available only in approved secure recovery storage during the bounded handover, then remove it. Do not print either value. If replacement fails, remain dormant; restore the prior still-valid secret only if authorized and uncompromised. If compromised, revoke it and remain dormant rather than restoring it. A changed app/actor/proof/scope requires re-review, not routine rotation.

After H4, credential rotation requires the separately approved pause/recovery procedure: close outbound gates/epoch, preserve unknowns, and require new prospective activation approval. Never reopen an epoch, transfer native opportunities to legacy or replay frozen deliveries under a new credential.

## Native-versus-legacy producer exclusion design

H3 design prerequisite: evidence that exclusion can be enforced across the **actual** existing producer paths, without selecting a future form. H4 binds the future source and proves concrete no-overlap. Current evidence establishes the Yearly integration's existence, not comprehensive enforcement. Stable Sheet candidate above is progress, not closure.

Required legacy manifest per producer: platform/integration ID, Sheet file + numeric tab ID, script/project/deployment/connector revision if any, asset/token-actor identity without token, Page/form selectors, five event mappings, trigger/queue/retry/dead-letter paths, manual import/resend authority, configuration evidence timestamp/digest and accountable operator. Explicitly mark a path absent only with operator/configuration evidence, not because a connector search found nothing.

| Path | Required design and H3 evidence | H4 execution evidence |
| --- | --- | --- |
| Automated acquisition and send | Fixed legacy form-ID allowlist at ingress **and dispatch**, no wildcard/automatic future-form adoption; missing/unknown identity fails closed. Show exact supported filter/config revision or vendor documentation proving mechanism | Selected native source denied; existing Yearly can remain legacy; validate with non-customer structural/synthetic offline cases |
| Scheduled/retry/dead-letter/reconnect/backfill | Original immutable source identity accompanies queued work; dispatch rechecks exclusion on every attempt, including old queued payloads and reconnection. Enumerate triggers and persisted queues | Zero overlap for chosen cohort, including pending/in-flight work; separately authorize any stop/drain and disposition |
| Manual CSV/import/resend/Sheet edits | Same source allowlist and dispatch check; role restriction or audited gate prevents direct bypass. A written promise alone does not replace a technical restriction where users can send directly | Named authorized uploaders, exact approved process and proof native cohort cannot be sent manually |
| EH native scheduler/director retry | Existing canonical first-source, immutable owner/boundary/epoch, all-five safety checks and no-uncertain-replay cover scheduled, retry and direct protected begin paths | Actual policy/mapping/boundary and future epoch, expiry/drift monitoring; no raw alternate sender |

If Meta's managed Sheet connector cannot enforce and expose these controls, do not claim a custom filter exists. The alternative is a separately approved **complete legacy outbound stop**, with all automated/retry/manual/in-flight paths accounted for and no affected inbound intake shutdown. Establish feasibility, revocation granularity and named operator at H3; stop/drain and actual cohort no-overlap belong to separately authorized H4 preparation. Stopping one trigger, new tab, stage names, different event IDs or provider deduplication are not exclusion.

Drift owner must monitor changes to allowlists, auto-discovery, connectors, manual access and retry restoration. Any uncovered route or expired evidence holds native activation; after activation use approved boundary/destination shutdown, never ownership reassignment. Local `crm_lifecycle_producer_ownership` cannot prevent an external producer from sending.

## Owner decisions required

No reapproval of D2, five names, repeats/singletons, Qualified target, original matching or no-uncertain-replay is requested. No response to this document is presumed approval.

| Decision | A / B and consequences | Recommendation / blocking scope |
| --- | --- | --- |
| Transport | A: commission documented multipart body-token patch. B: retain bearer/JSON only after authoritative endpoint support evidence | A; exact patch/review/deployment needed before seed/configuration execution, no token in frozen payload |
| Equality | A: strict exported-second hold with predecessor consequence above. B: obtain provider equality clarification before deciding | A; owner must explicitly accept hold/coverage consequence before implementation; no invented time |
| Credential actor | A: existing named Admin actor, acknowledging inherited wider rights. B: separately provision an Employee sender with verified minimum app/dataset rights | A is the existing concrete candidate, B reduces identity breadth but requires new exact IDs. Choose explicitly; never modify existing actor rights in this task |
| Legacy separation | A: verified supported ingress/dispatch/manual exclusion. B: separately approved complete legacy outbound stop/drain | A if actually enforceable; otherwise B. Feasibility evidence is missing, so neither is execution-ready |
| Contract/configuration | Approve exact manifest, same EH connection, dataset, reference and `max_attempts=5`, or defer | Recommended values below; approval does not authorize seed/deployment/events |
| Credential governance | Accept proposed 30-day review/90-day-or-expiry rotation and name custodians, or supply another explicit schedule | Must be bound before credential execution |

## Remaining external/account actions — later authorization required

These are planned H3 execution actions, not requirements to create secrets during this review task:

1. Record effective own-app native entitlement, actual selected task/scope set and issuer restrictions; assign only specifically approved missing dataset access if needed. Existing explicit **Use events dataset** label is an observed candidate, not a verified machine task ID or permission grant.
2. Issue/store a dedicated outbound credential through approved secure operator tooling; verify nonsecret metadata and rotation/revocation ownership. Never obtain it through this documentation task.
3. After reviewed/deployed transport/time corrections, deploy the independently reviewed immutable contract seed and configure the existing EH connection **disabled**. Re-read current connection version first; version 2 is an observation, not a future concurrency token.
4. Obtain legacy configuration evidence/feasible exclusion or full-stop design with its operator. No legacy change in this task.

Lack of an already-issued token, already-applied seed, actual approval timestamp or future form is not by itself a blocker to reviewing a complete design. Unknown entitlement constraints, unknown exclusion capabilities and unidentified execution responsibility are package gaps.

## Named H3 execution steps, order and recovery

Step names are fixed; human assignees remain **unassigned** pending owner input. Do not infer that repository username or account Admin is the operator. Required roster: H3 owner; Meta asset administrator; credential custodian; legacy sender owner; EH director/configuration operator; independent reviewer; separate release/DB operator; verification/recovery owner. One human may cover approved compatible roles, but independent review and release remain separate task instances under AGENTS.

| Order / named step | Responsible role / entry condition | Verification / stop / recovery |
| --- | --- | --- |
| H3-01 Evidence freeze | H3 owner + technical author; close package blockers, select decisions, name roster | Bind plan commit/digest, source references, exact assets and allowed actions. If evidence/route differs, revise before execution |
| H3-02 Compatibility implementation | Separate implementer after architecture owner approval; transport/time modules below only | Synthetic tests, internal QA, exact-head CI and fresh independent review; no provider/Production access. Findings corrected/re-reviewed before release |
| H3-03 Dormant compatibility release | Separate release operator after exact-SHA release approval | Reconfirm intended Production project/deployment, ledger 001–103, zero lifecycle inventory, disabled cron/gate/destination and healthy intake. Deploy compatible app/forward SQL in reviewed order; stop on any inventory/drift. No seed yet |
| H3-04 Contract seed | Separate implementer/reviewer then DB release operator, after final provider manifest approval and H3-03 verification | Allocate next free migration, bind UUID/key/revision/evidence/real dates. Local fresh+upgrade tests, exact-head CI/review, separate release approval. Read back exactly one matching row; gates and all other lifecycle inventory stay closed/empty |
| H3-05 Entitlement and dedicated secret | Named Meta asset operator + credential custodian, after route/task approval and fresh proof/IP check | Enumerated asset assignment if necessary, issuance and Production-only secure storage. Nonsecret readback, READY source/config/gate, effective asset/issuer/expiry. Stop for unexpected scope/proof/publication demand; never alter inbound/legacy rights |
| H3-06 Disabled destination binding | Named EH director, after H3-04/05 and completed exclusion design evidence | `crm_configure_lifecycle` for verified UUID, freshly read version; data contains only `mode=live`, `enabled=false`, dataset `1152399921284927`, `secret_ref=CRM_META_LIFECYCLE_TOKEN_EH_R4`, actual seeded `contract_id`, `max_attempts=5`. RPC derives constants/version/map. Re-read disabled config, exact contract and incremented version; preserve inbound fields |
| H3-07 Independent dormant acceptance | Verification/recovery owner, all prior records bound | Contract=1 expected; disabled configured destination=1 expected; enabled destinations, policies/evidence, boundaries, owners, epochs, deliveries/attempts remain zero. Cron inactive/zero runs, gate absent/false, intake health unchanged. Record READY deployment ID/source, SQL ledger/digests and nonsecret credential metadata. No network delivery probe |
| H3-08 Owner handoff to H4 | H3 owner after acceptance | Record H3 completed only with actual evidence. H4 remains unapproved; no source/form/cohort/epoch activation bundled in signoff |

Recovery before any H3 mutation: stop on version conflict, asset mismatch, expired evidence, nonzero unexpected lifecycle inventory, unhealthy intake, changed proof requirement or missing named authority. Re-read and revise; do not retry a mutation with guessed version or widen access. Keep all send controls closed. If an unauthorized enabled state appears, halt and escalate under the existing incident authority; this read-only task itself does not operate switches.

Later approved release recovery: preserve immutable history, correct application/configuration with gates closed and use reviewed forward SQL. A seed cannot be rolled back by deleting/updating its row; leave it unused and bind a new reviewed replacement key if necessary. No migration-ledger repair. Recover inbound health independently, never revoke its token as an outbound kill switch. If any attempt unexpectedly exists, preserve possible-dispatch uncertainty and stop for incident review; never clear rows to restore the expected zero count. Named recovery owner records partial completion so operations are not repeated blindly.

## Items deferred to H4

Actual prospective form/source identity and any creation/publication/binding; final immutable source mapping; cohort policy and concrete legacy-exclusion/no-overlap proof; finite producer boundary/expiry; then-current source/use-specific platform/privacy review; natural first-submission admission and ownership; exact future cutoff/live window/epoch; scheduler bearer/Vault preparation if separately approved; destination enablement, server gate and cron-last activation. No retrospective admission, current Yearly reuse or custom D2-checkbox prerequisite is introduced. CRM recognition, natural coverage and optimization validation follow separately authorized natural events; API receipt alone cannot establish them.

## Exact remaining blockers to a fully bound H3 owner-review package

1. **Effective credential route insufficiently evidenced:** named asset administrator must attest own-business route applicability for the unpublished app, effective Admin versus explicit dataset access, required task/scope set and issuance constraints; choose existing Admin or supply an exact dedicated actor proposal. No token generation is needed to close this design gap.
2. **Legacy exclusion feasibility unverified:** provide nonsecret integration/tab IDs and deployed configuration/revision covering automatic, delayed retry/dead-letter and manual paths, proving supported exclusion; otherwise provide a feasible complete outbound stop/drain design and accountable operator. The Drive name match alone does not close this gap. Actual future cohort binding stays H4.
3. **Execution roster unassigned:** owner must name the roles in H3-01–08, credential rotation/revocation and legacy drift owners. Bind permitted operations and actual approval/release windows when authorizing execution; do not invent names or blanket-approve unknown operations.

The concrete transport/time choices are **remaining owner decisions**, not missing provider research that must be solved before those choices can be reviewed. Selecting the documented multipart/strict-second path closes the need to prove bearer/equality acceptance; selecting the alternative requires its authoritative evidence before implementation. Unknown duplicate acknowledgment/numeric server-only dedup horizon, absent credentials/seed, future form/mapping/cohort and the completed advisory-D2 implementation are **not additional package blockers**. Exact reviewed patch/seed SHAs and actual approval dates are outputs of later gated steps; they are not falsely asserted as existing.

## IMPLEMENTATION CONTRACT

This PR is architecture/readiness documentation only. Preserve current main code, migrations, all Meta/Production state and settled advisory-D2 contracts. Documentation validation: relative links/anchors, source cross-check, no secrets/customer records, docs-only diff and `git diff --check`; existing required CI still applies. No application tests are needed locally for this docs-only diff. Review/merge/release remain governed by [AGENTS](../../../AGENTS.md); this package status is not a formal independent-review verdict or merge approval.

After explicit owner decision/commissioning, a separate Tier-3 implementation task may touch `src/lib/crm/lifecycle/adapter.mjs`, `worker.mjs` only as needed for transport inputs, `server.js` only if proof storage is approved, and new forward SQL replacing affected R4 reconcile/hold/prepare/begin validation with unchanged locks/ACLs. Review transitive claim/retry/get/prepared-payload paths. Extend existing lifecycle JS and R4/advisory SQL tests for the timestamp/auth cases above. No policy/D2, matching, event scope, owner model, outbox or ordering redesign. Review library/framework local guides before code. Fresh/103-upgrade, role, retention, no-unknown-replay and relevant concurrency checks plus required CI and independent exact-SHA review precede separately authorized release. The seed is a separate reviewed migration only after final provider-contract approval; no credentials or activation data in it.

Stop for any broadening, unsupported legacy exclusion, need to change event truth or successor ordering, new secret/proof requirement, actual nonempty Production inventory or expired provider evidence. Update this package and obtain the affected decision rather than silently implementing. **NOT READY FOR H3 OWNER REVIEW** until the three enumerated package gaps are closed; H3 execution and H4 remain unauthorized.
