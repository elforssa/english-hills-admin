# Owner summary

**Historical revision-3 evidence record.** The two-event restrictions and pending broader-scope choices below describe that assessment only and are superseded by [finally approved revision 4](../plans/crm-meta-funnel-revision-4.md) for event scope, occurrences, ordering, producer ownership and implementation. Account observations and unresolved form/provider/credential evidence remain relevant; H3/H4 remain blocked. This record is not an operative two-event implementation contract.


## What will change

Record the initial inspection and subsequent authenticated read-only Meta evidence supplied by the repository owner. Ownership/assets and the dataset/ad-account relationship are now substantially verified; aggregate CRM events/funnel behavior are observed. The current Yearly form **does not satisfy D2** for future EH-native lifecycle feedback. The [activation plan remains revision 3](../plans/crm-batch2-meta-lifecycle-activation.md), already advanced by the approved no-uncertain-replay decision at `74a0ec3132068d8bdb16c4831c10a8f716501e18`; this update materially revises its account-readiness assessment.

## What staff/users will be able to do

No operational behavior changes. The owner/operator can use the missing-evidence register below to complete an authorized account inspection without disclosing lead records.

## What remains restricted

H3 and H4 remain blocked. No application implementation, authored/applied migration, Production mutation, Meta form/asset change, credential provisioning or test/real Meta event is authorized or performed. D1–D7 remain binding without modification.

## UI impact

None. The initial agent browser reached login. Subsequent authenticated UI observations were supplied by the owner and are recorded below; this documentation update did not operate Meta.

## Database impact

None. Production was not queried. Existing dormant-rollout facts remain historical evidence in [CURRENT_STATE](../../ai/CURRENT_STATE.md), not a fresh verification by this task.

## Important security decisions

Do not infer outbound entitlement from a connected ads-reporting account or healthy inbound intake. Do not use fixture fields as live consent evidence. Do not record tokens, secrets, real lead answers, parent/child information or raw customer data in Git. Only sanitized configuration metadata is recorded here.

## Risks / owner review points

The authenticated evidence binds the business, Page, ad account and dataset and verifies existing CRM activity at aggregate level. It does not establish the future EH-native credential route or Qualified/Converted-only optimization suitability. The observed form promises that contact details are not shared with third parties and lacks the required explicit adult/sharing/version evidence. Do not infer D2 authorization for existing submissions or treat existing provider activity as EH-native activation. Implementation readiness, H3 readiness and H4 readiness are all **NO**.

## Baseline, authority and inspection scope

- **Tier 3**, because this concerns external lifecycle disclosure, account entitlement, retries and future Production activation, despite the docs-only diff.
- Baseline: remote `main` at `4c4b2b03e7462157135206b1c83ecddf3889d7b3`. GitHub reports [PR #38](https://github.com/elforssa/english-hills-admin/pull/38) merged at `2026-09-30T03:51:05Z` with that merge SHA. Owner reports PR #38 reviewed; this task did not perform a fresh independent review of it.
- Initial inspection date: **2026-09-30**. Verifier: this architecture task, through the existing Windsor.ai Facebook Ads connector and available Codex browser. That initial session could not inspect authenticated English Hills settings. Subsequent evidence provenance is separately recorded below.
- Followed [AGENTS](../../../AGENTS.md), the [architecture task template](../../ai/templates/ARCHITECTURE_TASK.md), [activation plan](../plans/crm-batch2-meta-lifecycle-activation.md) and [ADR-004](../decisions/ADR-004-meta-lifecycle-feedback.md). The original working tree and unrelated local files were preserved in an isolated worktree.
- PR #38 changed only the activation plan and ADR-004 relative to PR #37. Read-only source checks reconfirmed the constants constraint and retry behavior in migrations 098/099 and the adapter/worker. No runtime test or account event was used to establish these findings.

## Initial observations and account-fact limits — historical

| Ref | Read-only source / observed fact | What it establishes / does not establish |
| --- | --- | --- |
| A1 | Windsor.ai Facebook Ads `get_connectors`, with actions/options discovery disabled, returned one Facebook account: `1613720155930784`, name `KAL ad account`. | Verified connector inventory only. English Hills ownership, Business Portfolio membership, Page/form association and dataset entitlement remain unverified. No report data was fetched for this unbound account. |
| A2 | The connector's `get_fields` catalog exposes custom pixel event fields described as `Not qualified`, `Lost`, `Qualified`, `Converted`, `Intake` for account `1613720155930784`. | Verified field-catalog metadata only. Not a live Events Manager stage inventory, event receipt, dataset ID, CRM configuration or collision clearance. No event counts or lead records were requested. |
| A3 | Opening [Meta Business](https://business.facebook.com/) redirected to `/business/loginpage/`, showing sign-in choices. | The available browser was not authenticated for account inspection. No form, Business Settings or Events Manager configuration was reached. No login credentials were read or provisioned. |
| R1 | [Existing mapping documentation](../../crm-mapping-learner-policy.md) and revision 2 identify candidate form `1086266294126723`. | Verified repository reference and owner-specified inspection target only; not live publication, ownership, contents or D2 compliance. |

The A2 catalog field IDs are `conversions_offsite_conversion_fb_pixel_custom_not_qualified`, `conversions_offsite_conversion_fb_pixel_custom_lost`, `conversions_offsite_conversion_fb_pixel_custom_qualified`, `conversions_offsite_conversion_fb_pixel_custom_converted` and `conversions_offsite_conversion_fb_pixel_custom_intake`. The later authenticated evidence below establishes the asset relationship and visible event names; source coexistence/collision handling still needs approval before using those names for EH-native delivery. Do not add these additional kinds to Batch 2.

**At the initial inspection**, no English Hills live form or dataset facts were established. The subsequent owner-supplied authenticated evidence below supersedes that readiness limit; A1–A3/R1 remain an accurate record of the original inspection.

## Authenticated account evidence — owner-supplied, revision 3

**Recorded 2026-09-30**, from the repository owner's follow-up instruction on existing PR #39 after head `74a0ec3132068d8bdb16c4831c10a8f716501e18`. The owner reports authenticated read-only Meta account/form inspection. These are verified account facts **as supplied by the owner**, not an independent reinspection by this documentation agent. Exact inspection timestamp, inspecting operator identity and screenshot/export references were not supplied; do not invent them. Revalidate the final manifest before H3/H4. No lead records, tokens or secrets accompany this evidence.

| Ref | Verified fact | Boundary / consequence |
| --- | --- | --- |
| B1 | Business Portfolio **Glory Lot**, ID `1741597822557523`. | Owning business identified. This does not establish every future operator's permissions. |
| B2 | **English Hills Page** `997579646781805`, owned by Glory Lot. | Page ownership verified; future EH connection UUID/mapping association still needs verification. |
| B3 | **KAL ad account** `1613720155930784`, owned by Glory Lot. | Resolves the initial connector-account ownership uncertainty. |
| B4 | **English Hills dataset/pixel** `1152399921284927`, owned by Glory Lot and connected to KAL ad account. | Dataset identity, ownership and ad-account relationship verified. Selection for future EH-native sending still requires an approved destination/connection manifest. |
| B5 | Dataset receives **Meta Pixel + Conversions API** events. | Existing aggregate traffic, not evidence that dormant EH-native Batch 2 sent anything. |
| B6 | Dataset has **Conversions API System User** with event-dataset access. | Existing access is verified. Token issuer/scopes/expiry and appropriateness for the future separate outbound credential are not established. |
| B7 | **English Hills CRM** is a separate system user associated with business-owned app **English-hills**, ID `1069638329182835`; that app currently has **no connected assets**. | Do not conflate these two system users or assume the app can send to the dataset. Exact future credential route remains unresolved. No new assignment or token is authorized. |
| B8 | Existing CRM events visible through Conversions API: **Intake**, **Not qualified**, **Lost**, **Qualified**, **Converted**. | Actual aggregate event visibility supersedes catalog-only A2. Source-by-source identities/payloads and deduplication/coexistence with a future native sender are not verified. No extra Batch 2 event kinds are approved. |
| B9 | Meta CRM diagnostics calculate **uploaded-event/raw-lead coverage** and state **at least 60% lead coverage** is required for conversion lead optimization. Existing CRM funnel diagnostics recognize **Not qualified**, **Lost**, **Qualified**, **Converted**. | Current aggregate CRM/funnel behavior verified. Actual coverage percentage, qualifying volume/window, complete stage ordering and future D2-eligible two-milestone-only coverage are not supplied. Do not assert that the threshold is met or that two stages alone suffice. |
| B10 | Yearly form **Google Spreadsheet integration** is connected to dataset `1152399921284927`. **Yearly-program** is active and connected to **Conversions API**. | Existing integration/connection status verified. Does not authorize modifying/disabling it, reusing its credential or double-sending its events. |

## Verified live form and D2 assessment

| Ref | Observed form fact | Assessment |
| --- | --- | --- |
| F1 | Name **Yearly-program**, ID `1086266294126723`, active under English Hills Page context `997579646781805`. | Actual active form identity verified. |
| F2 | Includes child-age and location/distance questions. Displayed labels/options were verified during the owner-reported inspection. | These are structural observations, not lead answers. A complete verbatim label/option inventory was not supplied here; do not invent it or infer raw API keys/types from labels. |
| F3 | Contact-information wording says contact details are used only by English Hills and **“Elles ne seront jamais partagées avec des tiers.”** Standard Meta submission/privacy text is present. | This is not explicit English Hills → Meta lifecycle/status-sharing authorization. Standard Meta text does not cure the missing D2 evidence or the English Hills wording conflict. |
| F4 | No explicit adult-contact confirmation, no explicit English Hills → Meta lifecycle/status-sharing authorization and no immutable lifecycle notice/version were observed. | **Current form D2 compliance: FAILED / NOT SATISFIED for future EH-native lifecycle feedback.** No authorization may be inferred for existing submissions. |
| F5 | Stale wording refers to **`l'inscription au Pré-Cours`** in the Yearly form. | Correct program/notice wording must be part of any separately approved prospective form remediation. No edit is made here. |

A compliant change/replacement and its notice/mapping/policy must be prospective only. Do not retrofit consent, attach a new notice to old submissions, backfill historical milestones or weaken D2 to match the current form. Current aggregate integration activity is not evidence that existing submissions satisfy the EH-native D2 policy; this report does not adjudicate the existing integration's consent basis.

## Missing form facts and required remediation

- Exact **raw API keys, scalar types and accepted affirmative values** remain unresolved. Repository fixtures (`full_name`, `phone_number`, `whatsapp_number`, `âge_de_l'enfant`, `travel_to_almaz`) are not proof of live keys/values. No sample real lead answers may be collected into Git.
- The future compliant adult-contact statement, separate lifecycle-sharing authorization, approved notice text, version/reference/digest and exact displayed flow remain to be designed and approved. The reported fragments are not a complete notice archive; linked privacy URL/reference and full text remain to be captured safely.
- Immutable form/mapping version, connection UUID, exact Page-to-EH-connection association, policy effective interval and prospective rollout boundary remain unresolved. Current ad/ad-set usage and transition/intake continuity need a read-only manifest before any approved form replacement.
- Record safe structural evidence and exact verifier/date/reference before H3. Displayed labels/options are verified observations; machine-returned keys/types are a separate unresolved contract. Do not send a test or fetch/export real submissions to fill it under this task.

## Remaining dataset, permissions and credential facts

| Item | Verified / still required |
| --- | --- |
| Ownership/assets and dataset relationship | B1–B4 substantially verify account ownership/assets and the dataset/ad-account relationship. Future destination approval and EH connection/configuration binding remain separate. |
| CRM recognition and coverage | B5/B8–B10 verify existing aggregate events, recognized funnel stages and integration activity. Exact current coverage/volume/window and evidence that the future prospective D2-eligible Qualified/Converted-only subset can meet optimization requirements remain unresolved. Existing broader traffic can mask that subset's behavior. |
| Source coexistence and event names | `Qualified` and `Converted` already exist. Identify existing producers and decide how a future EH-native sender would coexist without semantic collisions or duplicate outcomes. Same display names do not prove identical event IDs or cross-producer deduplication. No integration change or takeover is authorized. |
| App / system users | B6/B7 verify two distinct actors and app `1069638329182835` with no connected assets. Exact future issuer/app/system-user/asset tasks and secure dedicated credential route remain undecided. Do not infer native outbound entitlement from existing CAPI System User access. |
| Token / permissions | Exact granted and required scope set for the selected route, issuer/expiry/rotation metadata and future token-to-dataset entitlement remain unverified. No credential was read, provisioned or tested. Existing third-party/integration access is distinct from the unprovisioned native outbound credential recorded in dormant-rollout history. |
| Inbound permissions | Keep separate validation of `leads_retrieval`, applicable Page subscription/access permissions and lead-access assignment. Existing inbound health does not establish outbound rights; no grants are requested. |
| Outbound route requirements | Revision 2 M5 describes own-business Events Manager/own-app routes and Pixel assignment; partner requirements differ. Confirm applicability to the chosen future route rather than requesting `ads_management`/`business_management` by assumption. |
| Operators and release evidence | Named asset, credential, deployment, monitoring/recovery operators, secure provisioning plan and final read-only evidence references remain required. |

## Provider-contract facts already established in revision 2

These are inherited findings from the [revision 2 evidence register M1–M18](../plans/crm-batch2-meta-lifecycle-activation.md#official-provider-evidence-register), **not newly verified account facts or newly revalidated public documentation**:

- CRM event endpoint and `system_generated` source; exact `custom_data.event_source=crm` plus CRM label required. The current application/SQL do not yet permit the two constants.
- Original lead ID can be the sole matching parameter. Meta's pinned SDK preserves a decimal string; explicit endpoint wire-type/live-account proof is not claimed. D5 remains lead-ID-only.
- Seven-day maximum upload age and original milestone timing; strict timestamp-boundary work remains required.
- v26.0 was verified in revision 2, subject to release revalidation.
- Conservative ordinary receipt predicate: HTTP success, no provider error, numeric `events_received=1`. Receipt does not establish CRM recognition or advertising effectiveness.
- General error meanings are documented, but current broad retry handling needs correction. Browser/server 48-hour deduplication is not a verified server-only CRM replay horizon.

Still unresolved: narrower Qualified/Converted-only compatibility and coverage, bearer-header authentication support for the CRM endpoint, numeric server-only replay horizon, exact duplicate acknowledgment and CRM-specific error replay safety. Connector metadata cannot resolve these provider-contract questions.

## Initial owner-decision status — historical

D1–D7 Option A remain approved. At the initial PR #39 inspection, the conditional retry wording was **pending owner confirmation**. That historical pending status is superseded only for retry policy by the explicit approval addendum below:

> No uncertain replay: unknown/ambiguous provider outcomes must not be automatically resent unless authoritative provider evidence establishes replay safety.

| Decision | Options / consequences | Recommendation and blocking status |
| --- | --- | --- |
| Retry-policy architecture | A: explicitly approve the quoted no-uncertain-replay correction, accepting held uncertain deliveries and coordinated SQL/application work. B: leave pending/remain dormant while seeking a verified numeric guarantee. | At initial inspection: A recommended and **pending**. Subsequently **APPROVED** by explicit owner confirmation below; implementation and H3/H4 remain blocked. No timeout or silence constituted approval. |
| Narrower-funnel scope | A: retain D1–D7/two milestones and obtain applicable authoritative/account evidence. B: separately commission broader-stage architecture. | A; keep dormant, blocks complete provider-ready implementation and H3/H4. |
| Form / notice / mapping | A: retain only after exact D2 proof and owner approval of notice/typed mapping. B: separately approve prospective replacement/change. | Evidence-dependent; missing facts block H3. No form change authorized here. |
| Destination / names / credential route | A: approve exact verified business/Page/ad-account/CRM dataset relationships, collision-checked names and least-privilege route with named operators. B: defer. | A only after evidence; blocks H3. A1/A2 alone are insufficient. |
| Provider tests / final release | A: continue without provider tests and keep H3/H4 closed. B: later explicitly authorize a concrete test or release manifest after prerequisites. | A for this task. No test, preparation mutation or activation approval is implied. |

The initial inspection required a confirmed owner decision or material verified English Hills evidence before revision 3. The later owner confirmation now satisfies that condition; merging PR #38 alone did not. The remaining owner choices are refined by the authenticated evidence; the current decision register is in the [revision 3 plan](../plans/crm-batch2-meta-lifecycle-activation.md#owner-decisions-required). The historical option to retain the form on unverified D2 assumptions is no longer a readiness path: observed D2 failure requires prospective remediation or continued dormancy.

## Implementation readiness and source gap confirmation

**Complete provider-ready implementation: not ready / not authorized. H3: not ready. H4: not ready.** Revision 2 allows independently scoped verified corrections to be commissioned separately after owner approval; this task commissions none.

Read-only source checks at the baseline reconfirm:

- [098 contract schema](../../../supabase/migrations/098_crm_lifecycle_evidence_and_delivery.sql) requires positive numeric `deduplication_window_seconds` and empty `required_constants`; unknown safety must not be represented by an invented number.
- [099 runtime](../../../supabase/migrations/099_crm_lifecycle_delivery_runtime.sql) can schedule `unknown` after finalization or an expired started-attempt lease while within the stored numeric window. Claim and director retry paths consume that policy. A text-only policy decision cannot change deployed behavior.
- [Adapter](../../../src/lib/crm/lifecycle/adapter.mjs) omits CRM constants and automatically retries broad HTTP/Graph classes. [Worker](../../../src/lib/crm/lifecycle/worker.mjs) leaves post-start finalization uncertainty for lease recovery. The now-approved, future no-uncertain-replay implementation must address both response classification and database claim/finalization/lease/manual-retry boundaries.
- [Evidence evaluator](../../../src/lib/crm/lifecycle/evidence.mjs) already compares exact typed values and denies missing/ambiguous evidence. Missing account/form evidence must not be described as missing evaluator infrastructure.

D7 remains a bounded single-delivery retry after repair, never a consent, age, identity, uncertainty, epoch or terminal-state bypass. No new automatic or manual replay permission is granted by this record. Preserve all D1–D7, immutable original truth, prospective-only operation and independent inbound intake.

## Owner approval addendum — 2026-09-30

After the initial inspection, the repository owner explicitly approved: “Unknown or ambiguous provider outcomes must not be automatically resent unless authoritative provider evidence later establishes replay safety.” This is recorded as an approved durable architecture decision in [activation plan revision 3](../plans/crm-batch2-meta-lifecycle-activation.md#approved-owner-retryuncertainty-decision--revision-3) and [ADR-004](../decisions/ADR-004-meta-lifecycle-feedback.md#approved-no-uncertain-replay-policy--2026-09-30-activation-revision-3), not a pending retry choice. The approval requires review holds, no lease-recovery or director bypass, and no invented numeric horizon; known safe/retryable pre-send failures retain reviewed bounded retry rules.

At that retry-policy approval step no new account evidence was added. The later B1–B10/F1–F5 evidence above now supersedes the original account/form readiness gaps; provider-contract facts and the approved retry policy are unchanged. The decision is not implemented; complete provider-ready implementation is still not ready, and H3/H4 remain blocked. D1–D7, two milestones, prospective activation, original lead ID only, immutable identity and separate inbound/outbound operation are preserved.

## IMPLEMENTATION CONTRACT

1. This task changes architecture evidence/navigation documentation only. No code, migrations or external configuration changes; no merge or deployment.
2. Preserve this account-readiness evidence and record the subsequent approved owner decision in activation plan revision 3 and ADR-004. Keep all other unresolved items explicitly unverified/pending; do not confuse approved policy with implemented behavior.
3. Preserve B1–B10/F1–F5 as owner-supplied authenticated evidence, without claiming independent reinspection. Follow-up must resolve the remaining raw-key, notice, credential, source-coexistence and coverage gaps with date/verifier/reference. Do not access/export lead answers or discover secrets to fill gaps.
4. Later application/SQL corrections require approved architecture, separate implementation, CI and fresh independent review/re-review. Follow the activation plan's exact H3/H4 manifests, stop conditions and recovery order; this report closes no release gate.
5. Validate this docs-only diff for relative links, source accuracy, secrets/PII absence and `git diff --check`. Application tests are not required for this documentation-only task.
6. Return branch, SHA and docs-only PR with verified/missing facts and all three readiness outcomes. Do not mark activation or architecture closeout complete while evidence and approvals remain missing.
