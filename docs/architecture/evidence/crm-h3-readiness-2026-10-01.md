# Owner summary

## What will change

H3 preparation dossier only, dated **2026-10-01 (Asia/Shanghai)**. It proposes the provider, compliant-form/evidence, producer-boundary and credential manifests below. **NOT READY FOR H3 OWNER REVIEW** as an executable approval package: exact transport evidence, future form binding, legacy exclusion and named execution details remain incomplete. The owner can review the proposals, but cannot safely authorize a blanket H3 execution from them.

## What staff/users will be able to do

No new operational behavior. Owners can resolve the specific blockers and approve a later, fully bound preparation package.

## What remains restricted

No lifecycle/destination enablement, scheduler activation, live gate, Meta event (including test events), fake Production records, secret access/provisioning, deployed-migration edits, merge or H4. Existing R4 architecture approval is retained; it is not H3 execution approval.

## UI impact

None. Meta documentation and authenticated Business Settings were read only. A future new Instant Form is proposed, not created or published.

## Database impact

None now. A separately reviewed forward provider-contract seed is required; **103 is the next available number at refreshed origin/main**, subject to rechecking before authoring. No SQL file is authored or applied here.

## Important security decisions

Preserve D2 for all five events, original Meta lead ID only, no child/contact-hash/monetary payload expansion, prospective eligibility, exclusive ownership and `no_uncertain_replay`. No credentials or real lead answers belong in this dossier. Unknown provider outcomes remain unreplayable; a new event ID, destination, timestamp or credential must not bypass that rule.

## Risks / owner review points

Risk tier **3 preparation/architecture**, because this dossier governs later external disclosure, credentials and Production configuration. Documentation checks do not constitute independent implementation review or release approval. Most importantly, native database ownership cannot constrain an independently operated legacy producer. Its exclusion must be proven outside this application.

## Baseline and provenance

- Source and refreshed `origin/main`: `70af2f1331f2539654ffc401507cb310a7785f56`; isolated branch `codex/crm-h3-readiness`.
- **Owner-supplied Production facts for this task**, not freshly queried: project `hopcezradkhrixwwswxn`; ledger exactly 001–102; lifecycle scheduler disabled; server live gate absent/false; contracts, policies, evidence, epochs, deliveries, attempts, enabled destinations, producer boundaries and ownership all zero; no EH-native outbound events; inbound intake healthy.
- The separate `/private/tmp/crm-r4-closeout` worktree contains an uncommitted rollout closeout. It was read, not modified or imported as independent verification. Production claims here rely on the owner's current instruction.
- Historical references: [approved R4](../plans/crm-meta-funnel-revision-4.md), [activation prerequisites](../plans/crm-batch2-meta-lifecycle-activation.md), [account evidence](crm-batch2-meta-account-readiness-2026-09-30.md), [funnel research](crm-meta-funnel-research-2026-09-30.md). Their earlier not-deployed/two-event statements are historical and superseded by the supplied 101–102 rollout facts; their unresolved evidence does not become verified through deployment.
- Fresh checks below: Codex read public official Meta pages and authenticated account configuration on 2026-10-01 (Asia/Shanghai); an in-session UTC checkpoint was `2026-10-01T04:25:44Z`. Individual UI views have no exported per-view timestamp. No token controls, assignment controls, form publication or event tools were invoked. Account facts are UI observations, not token authorization tests.

## H3 readiness table

| Prerequisite | Verified facts | Unresolved facts / blocker | H3 status |
| --- | --- | --- | --- |
| Dormant baseline | Owner reports exact SHA, ledger 001–102 and all closed/empty controls above; source has 101/102 | Operator must reconfirm immediately before any later mutation | Established as owner evidence |
| API/version/payload | Current official Graph changelog lists v26.0; exact five names/constants match deployed SQL and adapter | Final immutable contract approval; strict timestamp interpretation below | Partial |
| Destination identity | Fresh UI: English Hills pixel `1152399921284927`, Glory Lot ownership, connected KAL `1613720155930784` | Actual EH connection UUID/key/version and exact form mapping; owner selection approval | Partial |
| Authentication | Official own-business token routes and access-token parameter transport | Endpoint-specific support for deployed JSON + bearer-header request; selected app security requirements | Blocked |
| Receipt/error/duplicate handling | Ordinary integer receipt schema; general Graph error meanings; deployed conservative holds | v26 CRM response variants/exact duplicate acknowledgment not guaranteed; preserve hold policy | Partial; no replay entitlement |
| Future compliant form/evidence | Existing evaluator compares exact typed answers; current Yearly form excluded by 101/102 | New form ID, rendered notice, raw keys/types/values, immutable mapping, dates and approvals | Blocked |
| Outbound entitlement/credential | Native actor/app identified; dataset UI assigns only existing CAPI System User | Native dataset task absent; dedicated token metadata/secure provisioning unapproved | Blocked |
| Legacy producer exclusion | Fresh UI confirms Yearly-program → `yearly-program-fb` / `Yearly-program` → dataset; immutable controls exist in SQL | Stable Sheet/integration/trigger IDs, all replay paths, enforcement and zero overlapping queue/in-flight proof | Blocked |
| Forward seed | 103 unoccupied at refreshed main; 098/101 require immutable contract | No complete approved contract or reviewed migration yet | Blocked |
| Execution ownership | Roles defined below | Actual named assignees, exact approval scope/timestamps, final object IDs and intervals | Blocked |

## Fresh official source register

Web fetch returned 429/unavailable for several pages; the browser rendered the following official content successfully. Search snippets and third-party articles are not used as contract evidence.

| Ref | Official source | Fresh finding and limit |
| --- | --- | --- |
| P1 | [Graph changelog](https://developers.facebook.com/docs/graph-api/changelog/) | Latest v26.0, introduced July 29, 2026; available-until TBD. Pin v26.0, revalidate before execution; do not infer a retirement date. |
| P2 | [CRM payload specification](https://developers.facebook.com/documentation/ads-commerce/conversions-api/conversion-leads-integration/payload-specification) | Updated June 28, 2026. Advertiser-defined CRM stages; initial and later updates; `system_generated`; CRM source/tool constants; valid original lead ID sufficient as sole matching parameter; actual update seconds, after lead generation, maximum seven days. Supports native Instant Forms. |
| P3 | [Using the API](https://developers.facebook.com/documentation/ads-commerce/conversions-api/using-the-api) | Updated July 17, 2026. POST versioned Pixel `/events`; access-token parameter/form example; event-ID/name first-copy deduplication advice. Batch errors can coexist with acceptance of valid events. Does not give numeric CRM server-only replay horizon or exact duplicate response. Test-coded events are not discarded and may affect measurement/targeting. |
| P4 | [Get started](https://developers.facebook.com/documentation/ads-commerce/conversions-api/get-started) | Updated June 28, 2026. Own-business Events Manager or own-app/system-user routes. Own-app route assigns Pixel to system user, then issues token in Business Settings. This direct route does not require requesting permissions or App Review; third-party partner requirements differ. Existing asset entitlement still required. |
| P5 | [Pixel events reference](https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ads-pixel/events) | Ordinary response has integer `events_received`, `messages`, `fbtrace_id`; also documents other return variants including `success`. Displayed example/version selector stops at v25.0. Not explicit v26 CRM assurance. Codes 100 invalid parameter, 190 invalid token, 200 permission error. |
| P6 | [Graph errors](https://developers.facebook.com/docs/graph-api/guides/error-handling) | Authentication/capability/permission classes and transient/throttle advice verified. Generic retry advice is not a CRM non-acceptance guarantee. Code 506 means duplicate post; it is not an established CRM duplicate acknowledgment. |
| P7 | [Deduplication](https://developers.facebook.com/documentation/ads-commerce/conversions-api/deduplicate-pixel-and-server-events) | Updated June 28, 2026. The documented 48-hour matching window concerns Pixel/browser plus server events. It cannot seed a guaranteed CRM server-only retry window. |
| P8 | [Secure Graph calls](https://developers.facebook.com/docs/graph-api/guides/secure-requests) | TLS and optional/required app-secret-proof settings described. No endpoint-specific bearer-header confirmation on this page. If the selected app requires proof, deployed adapter does not supply it; do not weaken that setting to make transport work. |

### Provider interpretation and remaining gaps

Exact proposed endpoint: `POST https://graph.facebook.com/v26.0/1152399921284927/events`. This combines official endpoint syntax with fresh account identity. No request was sent. Page `997579646781805`, form ID and ad account are not endpoint IDs.

Five exact names are **English Hills' approved stage mapping**, not five Meta-mandated standard-event names: `intake → Intake`, `not_qualified → Not qualified`, `lost → Lost`, `qualified → Qualified`, `converted → Converted`. Case and the space in `Not qualified` are significant. Intake/Converted remain singleton; other repeats require genuine activity-backed reopen/re-entry. Qualified remains the approved initial positive target, Converted downstream; negative closures are not optimization stages. Actual future cohort recognition, coverage and effectiveness require later authorized natural observations, not fake records or legacy aggregate traffic.

Required constants: `action_source=system_generated`, `custom_data.event_source=crm`, `custom_data.lead_event_source=English Hills CRM`. Meta requires the source/tool fields; the exact tool label is the approved local value and must be included in final contract signoff.

Authentication is **partly verified, not complete**: the deployed [adapter](../../../src/lib/crm/lifecycle/adapter.mjs) uses `Authorization: Bearer` and JSON; P3/P4 establish parameter/form tokens, not that exact transport. Resolve through authoritative endpoint-specific evidence, or separately commission a reviewed request-boundary/body-token implementation (without tokens in URL, frozen payload or logs). Do not change transport in this documentation task. The app's proof requirement must also be recorded. A real/test POST is not authorized as a shortcut.

For one event, the deployed receipt predicate is HTTP 2xx, no provider `error`, and numeric `events_received === 1`. A trace alone, `success:true`, string `"1"`, zero count or unrecognized response is not success. Receipt proves neither CRM recognition nor optimization. Preserve actual code handling: auth/permission blocks; focused code 100 without subcode is terminal validation; timeout/network, 429/5xx, Graph 1/2/4/17/341, malformed/unknown responses and unresolved duplicate responses are held unknown. Unknown attempts cannot be reclassified by a director retry or credential repair. Local safe pre-dispatch recovery is a separate bounded case. P3's batch retry guidance does not warrant broad retries or assuming every error means zero acceptance.

**Timestamp edge requiring closure:** P2 says event time must be after lead generation. Current adapter rejects `< source_generated_time`, allowing equality after Unix-second flooring; SQL also rejects strictly earlier timestamps. Equality is not explicitly guaranteed by the inspected provider text. Obtain authoritative interpretation or separately review fail-closed strict comparison/holding behavior before final contract approval. Do not invent a later timestamp. This does not establish an observed Production failure.

Lead IDs stay lossless decimal strings. Historical official SDK evidence (activation register M16, pinned commit `0d245ec888c1af38d68994fd7f2e24cd38abc82f`) supports that representation; it was not reread here. P2's numeric example is not proof that JSON string is rejected. Preserve the documented SDK-to-endpoint inference and obtain final reviewer acceptance; do not coerce to JavaScript Number or expand matching.

## Fresh authenticated asset evidence

Verifier: this Codex preparation task via read-only authenticated UI on 2026-10-01. Evidence references are the named views and exact nonsecret identifiers below; no raw customer data or credential exports were retained.

| Ref / UI view | Observation | Consequence |
| --- | --- | --- |
| A1 — Business Suite home / Settings | Glory Lot `1741597822557523`; English Hills Page context `997579646781805` | Confirms current account context; not outbound token proof. |
| A2 — [System users](https://business.facebook.com/latest/settings/system_users?business_id=1741597822557523) | `English Hills CRM`, ID `61594759444572`, Admin; four assets shown: English Hills Page, KAL ad account, English-hills app with full access, Instagram with nothing assigned. No dataset shown. | Native actor lacks displayed dataset assignment. Do not equate broad business role with dataset use. |
| A3 — [Datasets & pixels](https://business.facebook.com/latest/settings/events_dataset_and_pixel?business_id=1741597822557523), English Hills pixel / People | `1152399921284927`, owned by Glory Lot, receives Pixel + CAPI; one assigned actor: `Conversions API System User` `100089438321765`, partial access **Use events dataset**. | Fresh confirmation of dataset identity and concrete missing native assignment. Existing actor is distinct; do not reuse/revoke its token. |
| A4 — Dataset / Connected assets → View asset | One connected asset, KAL ad account; its detail panel shows ID `1613720155930784`, owned by Glory Lot. | Confirms dataset/account binding. Navigation uses an internal selected-asset ID `120226027857760313`; that is not the displayed ad-account ID and must not replace it. |
| A5 — [Instant Forms / CRM setup](https://business.facebook.com/latest/instant_forms/crm_setup?asset_id=997579646781805) → View Google Sheets integrations | Three Sheet integrations displayed. Yearly-program → spreadsheet `yearly-program-fb`, tab `Yearly-program`, connected to CAPI dataset `1152399921284927`. Pre course and Pre course-copy are Sheet-connected and display CAPI not integrated. | Identifies current legacy routing by names and destination, not stable Sheet/connector IDs, filter logic, queued jobs or manual replay. No Sheet was opened/exported. |
| A6 — Instant Forms / Forms | Yearly-program is Active; the list did not expose the complete notice/raw-answer schema during this inspection. | Current D2 failure assessment remains inherited owner evidence; this task does not claim a fresh full-form compliance audit. |

Historical account evidence identifies English-hills app `1069638329182835` with no connected assets; A2 freshly confirms its native-user assignment, not app configuration/proof settings or token scopes. Those remain unresolved. No token was generated, revealed, debugged or copied.

## Proposed provider-contract manifest — NOT EXECUTABLE

Database fields below follow 098 as extended by 101. `TBD` is a blocker, never a wildcard or value to insert. Destination/authentication are companion dossier fields, not invented columns in `crm_lifecycle_provider_contracts`.

```yaml
contract_key: meta_crm_r4_v26_20261001_r1  # proposed, owner approval pending
revision: 1
api_version: v26.0
lifecycle_model: r4_stage_entry
event_map:
  intake: Intake
  not_qualified: Not qualified
  lost: Lost
  qualified: Qualified
  converted: Converted
qualified_event_name: Qualified
converted_event_name: Converted
action_source: system_generated
required_constants:
  event_source: crm
  lead_event_source: English Hills CRM
maximum_event_age_seconds: 604800
uncertainty_policy: no_uncertain_replay
deduplication_window_seconds: null
accepted_response_field: events_received
accepted_response_count: 1
lead_id_only: true
evidence_urls: [P1, P2, P3, P4, P5, P6, P7, P8] # expand to exact URLs above
verified_on: TBD_final_contract_verification_date
approved_at: TBD_actual_owner_approval_UTC
active: true # proposed contract usability only; NOT destination/epoch activation
```

The fresh source access date is 2026-10-01; it is not a fabricated completed-contract verification or approval date. Final companion manifest binds dataset `1152399921284927`, Page `997579646781805`, actual EH connection UUID/current version, selected system user/app, auth evidence, timestamp treatment, evidence artifact digest and exact reviewed seed SHA. No arbitrary JSON keys, additional event kinds or non-approved custom data. Contract key is globally unique: a future immutable revision needs a distinct key, not overwriting this one.

## Proposed compliant-form/evidence manifest — NOT EXECUTABLE

Use a **new dedicated Meta Instant Form ID** on the English Hills Page; never reuse current Yearly `1086266294126723`, which deployed 101/102 explicitly reject. Prefer creation while not attached to campaigns and never attach the form to the legacy automatic sender. Publication/campaign edits remain separately approved H3 operations; form existence does not confer eligibility before H4's actual epoch.

Proposed exact English wording for owner/privacy approval:

**Adult confirmation (separate, affirmative, not preselected):** “I confirm that I am 18 years of age or older and that I am the adult contact for this enquiry.”

**Lifecycle sharing (separate, affirmative, not preselected):** “I agree that English Hills may share with Meta the Meta lead ID associated with this enquiry and updates about its status: received (Intake), Not qualified, Lost, Qualified, and Converted (confirmed enrolment). English Hills will use this sharing to measure and improve its advertising. These updates will not include names, email addresses, phone numbers, child details, assessment results, internal notes, or payment information. I can ask English Hills to stop future sharing using the contact method in the linked privacy notice.”

Proposed affirmative control labels: adult “Yes, I confirm”; sharing “Yes, I agree”. These are **display-copy proposals**, not verified API values. Nonaffirmation/missing evidence must deny outbound sharing, and must not be silently defaulted from submitting an enquiry. Approve a usable non-sharing enquiry path and verify it works; no claim is made that the current form already implements this flow. Do not retain conflicting no-third-party-sharing promises or stale Pré-Cours programme wording. Approve any French/Arabic translations independently and bind their exact displayed text; no automatic translation aliases in the evaluator.

| Manifest field | Proposed requirement / remaining value |
| --- | --- |
| Page / form | Page `997579646781805`; new provider form ID **TBD**; immutable published revision/structural archive **TBD** |
| Channel / connection | `meta_instant_form`; actual EH Meta connection UUID/key/current version **TBD** |
| Form mapping | Actual immutable mapping UUID/version/effective time **TBD**; never relabel an old submission |
| Adult key / values | Logical proposal `adult_contact_confirmed`; actual API key, scalar type and exact affirmative value **TBD** |
| Sharing key / values | Logical proposal `meta_lifecycle_sharing_confirmed`; separate actual API key/type/affirmative value **TBD** |
| Notice | Proposed version `eh-meta-lifecycle-r4-en-v1`; approved full notice + working privacy URL/contact mechanism **TBD** |
| Notice digest | SHA-256 lowercase hex of archived, owner-approved exact UTF-8 notice bytes; UTF-8 without BOM, LF line endings, explicit final-newline rule. Freeze text before computing; **no approved digest yet** |
| Notice binding | Exact form ID/revision → mapping UUID/version → policy → notice version/digest. If a provider notice-version answer exists, verify exact key/type/value; otherwise omit BOTH optional `notice_field_key` and `notice_accepted_values` from publisher JSON and prove immutable form binding. Do not use JSON null as omission. |
| Policy | `r4_stage_entry`; exact allowed kinds `[intake, not_qualified, lost, qualified, converted]`; UUID/version allocated by publisher; future UTC effective interval **TBD** |
| Evidence | Existing evaluator requires exactly one answer per key and exact typed comparison. String `"true"`, boolean `true`, scalar versus array and translated text are distinct. Missing, duplicate, ambiguous or negative answers deny. Capture only structural metadata in Git. |
| Verification | Owner approval, authorized form operator, date, non-PII form/schema evidence, normalized mapping proof, archive digest and withdrawal procedure **TBD** |

Actual affirmative arrays cannot be supplied until provider-returned keys/types and the normalizer's result are established. Use non-PII form schema evidence where sufficient; if a provider test submission is needed, obtain separate explicit approval and never insert fake Production evidence. Local synthetic evaluator fixtures may demonstrate comparison behavior but cannot verify live form values.

Prospective admission is based on original first-submission occurrence, not import/qualification time: `occurred_at >= max(boundary.valid_from, epoch.started_at, policy.effective_from, mapping.effective_from)` and before applicable end/retirement times. Require resolved Meta-first opportunity, correct Page/form/original lead ID, contemporaneous immutable D2 grant and unretracted source. Website, later-Meta, current Yearly, legacy/current opportunities, delayed pre-cutoff imports and pre-epoch/disabled-period submissions remain excluded forever from later activation. A new form response attached to an existing opportunity cannot rewrite its first touch or authorize it retroactively. All five kinds independently recheck evidence/revocation/deadlines/ownership.

## Proposed producer-boundary manifest — NOT EXECUTABLE

Chosen design: **new-form exclusion at every legacy acquisition and outbound path**, established before the form can receive submissions. Legacy keeps only its existing disjoint cohort. Same event names, different IDs, a new Sheet tab, mutable labels, pausing one trigger or presumed Meta deduplication do not establish exclusion.

Fresh A5 identifies the Meta Google Spreadsheet integration for Yearly-program: spreadsheet `yearly-program-fb`, tab `Yearly-program`, CAPI destination `1152399921284927`. The legacy owner must still identify stable Google Sheet/file/tab and integration IDs, any Apps Script/automation/connector IDs and deployed configuration revision; Page/form selectors, auto-discovery, triggers, scheduled queues, delayed retries, dead letters, manual CSV/import/resend paths and event mappings. The two other displayed Sheet integrations currently say CAPI not integrated; do not assume that rules out external/manual producers. This repository has no authoritative legacy execution/filter configuration. Connection evidence establishes presence, not enforcement. No Sheet/customer rows are needed in Git.

Required enforcement: explicit form-ID allowlist restricted to legacy forms (new ID denied), or equivalent durable exclusion at both ingestion and dispatch, with manual routes honoring the same rule. Unknown/missing form identity must not enter the native cohort through legacy paths. Record evidence that no legacy queue/in-flight/manual scheduled payload concerns the new form; if it has never received leads and was never connected, prove those facts. Otherwise, separately authorize controlled stop/drain and document disposition without replay. **If no enforceable cohort exclusion exists, stay dormant until a separately approved full legacy outbound stop/drain is completed.** Preserve inbound EH intake independently.

| Stored boundary field | Final value required |
| --- | --- |
| `connection_id`, `form_mapping_id`, `form_key` | Actual EH connection, immutable new mapping and exact new form ID: TBD |
| `page_id`, `dataset_id` | `997579646781805`, `1152399921284927`, checked against connection configuration |
| `provider_contract_id`, `eligibility_policy_id`, `policy_version` | Actual immutable approved objects: TBD |
| `notice_version`, `notice_text_digest` | Exact approved form/policy pair: TBD |
| `lifecycle_model`, `permitted_producer` | `r4_stage_entry`, `eh_native` |
| `valid_from`, `valid_until` | Finite future UTC interval fully covered by policy: TBD |
| `legacy_exclusion_verified` | Must be true only after evidence; currently unverified, do not publish |
| `legacy_exclusion_reference`, `verified_by` | Immutable non-PII evidence artifact/revision and named joint legacy/native verifier: TBD |
| `legacy_exclusion_verified_at`, `legacy_exclusion_valid_until` | Database publication time and finite verification expiry covering entire boundary interval; no backdating: TBD |
| Revocation | Append-only permitted revocation; drift/expiry/retirement holds native sending; replacement requires new verified manifest |

Publish only through `crm_publish_lifecycle_producer_boundary` in a later approved operation, after approved active contract, prospective policy and **disabled** `mode=live` configuration. The RPC copies identity/notice bindings and timestamps from authoritative records; it is not a free-form insert. Its evidence-reference string is not a check of the legacy platform. Finite validity and an accountable drift monitor are mandatory.

Per-opportunity ownership uses `crm_lifecycle_producer_ownership`: canonical `lead_id`, `connection_id`, `boundary_id`, `activation_epoch_id`, `producer`, `assigned_at`. Unique `(lead_id, connection_id)` and immutable records prevent local reassignment; canonical first submission resolves original provider identity. Reject route aliases/second ownership; do not copy raw IDs into a new registry. **No ownership rows during H3:** admission requires H4's actual open epoch, eligible natural first submission and valid evidence. Existing leads remain excluded without manufacturing legacy ownership records. On rollback, do not hand native opportunities back to the legacy sender; new epochs admit only new prospective leads.

## Proposed credential/entitlement plan

Recommended route: own-business, own-app/system-user CAPI route described in P4, using business `1741597822557523`, app `1069638329182835` and native actor `61594759444572`, **only after separate owner approval**. Existing actor `100089438321765` is not the native credential route. An Events Manager-created route is an alternative owner choice, not permission to reuse the legacy credential.

1. Verify app ownership/mode, native actor ID, app assignment and any app-secret-proof/IP requirements from nonsecret settings. Record exact least-privilege task/grant set for the selected route. Current absence: native actor has no displayed access to dataset `1152399921284927`.
2. Separately approve assigning that dataset to the native actor with the appropriate **Use events dataset** entitlement (the current UI label). Record actual granted task IDs/labels and verifier; do not grant broader asset rights by assumption. P4 says own-business direct setup needs neither App Review nor requested permissions. Do not add `ads_management`, `business_management` or inbound `leads_retrieval` just because they appear in generic tutorials. If the actual issuer requires other scopes, stop and document the exact requirement before approval.
3. Separately approve a dedicated outbound token issuance bound to the verified actor/app/dataset. Named credential operator records only issuer/app/user/asset IDs, granted scopes/tasks, issue/expiry or documented non-expiring status, rotation/revocation owner and secure storage reference. Never show token values in chat/Git; do not click Generate token under this task. No assertion that a token exists or is valid.
4. Proposed server-only reference: `CRM_META_LIFECYCLE_TOKEN_EH_R4` (matches deployed worker allowlist). Store value only in approved Production secret/environment storage, never `NEXT_PUBLIC_*`, preview/dev, local `.env`, ordinary CRM tables, payload or URL. Separate provider token from inbound credential and `CRM_META_LIFECYCLE_SCHEDULER_TOKEN`; no scheduler secret rotation is required by this preparation.
5. After reviewed contract/transport and approved closed-gate provisioning, verify nonsecret token entitlement metadata without an `/events` POST. Token inspection remains a credential-operator action under that separate approval. A metadata check proves entitlement only, not successful CRM delivery.
6. Configure only an approved disabled destination via its director RPC: actual connection/version, `mode=live`, `enabled=false`, dataset above, secret reference, actual contract UUID, approved bounded attempts. Publish prospective policy and verified boundary only within explicit H3 scope. Keep zero epochs/ownership/deliveries/attempts, scheduler disabled and server gate absent/false. The contract row being active is not permission to enable the destination.
7. Assign monitoring/recovery ownership and rotation plan. Rotation must not revoke the inbound token or silently reuse legacy credentials. Any transport change, asset mismatch, proof requirement or unexpected scope request stops execution pending review.

No secrets are provisioned by this plan; final assignments, dates, token metadata, EH connection identifiers and credential operator names are missing.

## Migration 103 decision

**Yes: a new forward migration is required to seed the verified provider contract under the approved architecture.** Refreshed main and supplied Production ledger stop at 102, so 103 is available at this check. It is not authored now because the contract is incomplete/unapproved. Recheck allocation when work is commissioned; never edit deployed 098/101/102 or insert directly to bypass review.

The eventual seed should insert exactly one approved immutable R4 contract with official evidence URLs, actual verification/approval dates and null deduplication horizon. It must not create form policy, evidence, producer boundary/ownership, destination enablement, epoch, deliveries, attempts, cron or server settings. Contract usability may be active while every send gate remains closed. Authentication and timestamp corrections, if required, are separately reviewed application/forward-SQL scope; do not pretend a seed fixes them or reserve 103 irrevocably.

Before deployment: fresh independent review of exact implementation/seed SHA, local 001–102 → seed upgrade verification, positive contract-shape/negative constraint cases, and proof that activation inventory and gates remain dormant. Human approval of that exact deployment is separate from plan review. This task runs documentation checks only.

## Owner decisions required

Settled R4 event scope, repeats/singletons, Qualified target, D2–D7 and no-uncertain-replay do **not** need reapproval. Remaining approvals must bind concrete artifacts, named operators, exact SHA/digests and UTC windows; unknown fields cannot be blanket-approved.

| Approval | Recommended choice / alternative | Exact condition before execution |
| --- | --- | --- |
| Provider contract | Approve completed v26 R4 manifest / remain dormant | Close bearer/proof and timestamp interpretation, review response conservatism and SDK string inference, approve exact key/revision/constants/digest; no replay permission |
| Forward implementation/deployment | Commission reviewed seed (and narrowly necessary transport/timestamp fixes) / defer | Exact migration filename and reviewed SHA, local/CI evidence, independent reviewer and named DB release operator; no merge/deploy authorized here |
| Form/privacy | New dedicated form with approved copy / remain dormant | Approve exact text/translations/privacy URL/contact route/digest, raw typed mapping, immutable identity, future interval and named form/privacy owner; creation/publication/campaign changes separately enumerated |
| Legacy boundary | Durable new-form exclusion / separately approved full outbound stop/drain | Named legacy operator, exact integration/filter revision, manual/retry coverage, no-overlap evidence and finite verification expiry; preserve inbound intake |
| Credential route | Dedicated native own-app actor / separately specified Events Manager route | Asset admin approves exact dataset task; credential owner approves issuance, approved storage reference, expiry/rotation/revocation and nonsecret verification; no copying legacy/inbound token |
| H3 configuration execution | Enumerated closed-gate operations / defer | Actual connection/version, contract/mapping/policy/boundary bindings, allowed mutations, named director/operator, pre/post zero inventory and health evidence; provider tests explicitly **not authorized** |
| Monitoring/recovery | Named native and legacy drift owners / defer | Ability to hold/revoke native boundary and preserve unknown markers; no transfer of owners or epoch reuse |

Approval record: owner name, actual UTC approval timestamp, this dossier/manifest digest and revision, application/seed review SHA, exact asset/object IDs, permitted mutations, assigned operators and execution interval. H3 execution stays blocked until complete. H4 is excluded, not a checkbox bundled with H3.

## Exact blockers and acceptance for this preparation

1. Deployed bearer-header/JSON authentication has no endpoint-specific proof in inspected official pages; selected app proof/settings unverified.
2. Strict-after-generation requirement versus allowed equal Unix seconds needs provider clarification or separately reviewed fail-closed handling. Ordinary receipt schema is documented, but v26 CRM variants/exact duplicate acknowledgment remain uncertain and must never trigger replay.
3. No approved new form ID, complete rendered notice/privacy/contact flow, reproducible approved digest, actual raw key/type/value map, immutable mapping UUID or prospective interval.
4. Native system user lacks displayed dataset assignment; selected route, least-privilege entitlement, dedicated credential issuance/storage metadata and named operator approvals are incomplete.
5. No authoritative legacy Sheet/connector/filter/retry/manual-path configuration or enforceable new-form exclusion/drain evidence. No verified immutable boundary can be published.
6. Actual EH connection UUID/version and final contract/policy/boundary object bindings, finite validity windows, named operators and exact execution approval are absent. Provider seed 103 is not authored/reviewed/approved.

Numeric server-only replay horizon is deliberately unknown and **not** a reason to invent a value or reopen approved no-uncertain-replay. Future natural cohort performance cannot be proven while dormant; H3 must explicitly separate technical preparation from H4/post-activation validation and accept that limit without widening disclosure.

## IMPLEMENTATION CONTRACT

Documentation only: this dossier and a navigation/current-state addendum. Preserve all existing unrelated changes. No SQL, runtime, secrets, Meta configuration, form edits or Production actions. Do not merge or proceed to H4.

A later implementer must close blockers with dated evidence before authoring the immutable seed; a later H3 operator requires explicit artifact-bound approval before each enumerated mutation. Use existing 098/101/102 schema/RPCs, `adapter.mjs`, `evidence.mjs`, worker and approved R4 plan as source. No extra outbound queue or owner model. Recheck current main/ledger and allocation before choosing the migration name.

Preparation validation: relative links/source cross-check, no credentials/customer records, documentation-only diff and `git diff --check`. These checks do not replace Tier 3 implementation CI, fresh independent review or human release approval. Final status remains **NOT READY FOR H3 OWNER REVIEW** until the executable-package blockers above are resolved.
