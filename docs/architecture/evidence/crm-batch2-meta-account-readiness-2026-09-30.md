# Owner summary

## What will change

Record the read-only account-readiness inspection and its access limits after PR #38. No English Hills form or CRM destination configuration was independently verified. The activation plan remains **revision 2**: this inspection does not materially establish English Hills account readiness and no new owner architecture decision has been confirmed. This evidence record is not activation plan revision 3.

## What staff/users will be able to do

No operational behavior changes. The owner/operator can use the missing-evidence register below to complete an authorized account inspection without disclosing lead records.

## What remains restricted

H3 and H4 remain blocked. No application implementation, authored/applied migration, Production mutation, Meta form/asset change, credential provisioning or test/real Meta event is authorized or performed. D1–D7 remain binding without modification.

## UI impact

None. The available Meta Business browser reached the login page; no authenticated account settings were visible.

## Database impact

None. Production was not queried. Existing dormant-rollout facts remain historical evidence in [CURRENT_STATE](../../ai/CURRENT_STATE.md), not a fresh verification by this task.

## Important security decisions

Do not infer outbound entitlement from a connected ads-reporting account or healthy inbound intake. Do not use fixture fields as live consent evidence. Do not record tokens, secrets, real lead answers, parent/child information or raw customer data in Git. Only sanitized configuration metadata is recorded here.

## Risks / owner review points

Access is incomplete, not proof that the required assets or consent controls do not exist. The account exposed by the connector is not yet bound to English Hills. A reporting field named `Qualified` or `Converted` is not evidence of CRM recognition, integration health, stage ordering or replay safety. Implementation readiness, H3 readiness and H4 readiness are all **NO**.

## Baseline, authority and inspection scope

- **Tier 3**, because this concerns external lifecycle disclosure, account entitlement, retries and future Production activation, despite the docs-only diff.
- Baseline: remote `main` at `4c4b2b03e7462157135206b1c83ecddf3889d7b3`. GitHub reports [PR #38](https://github.com/elforssa/english-hills-admin/pull/38) merged at `2026-09-30T03:51:05Z` with that merge SHA. Owner reports PR #38 reviewed; this task did not perform a fresh independent review of it.
- Inspection date: **2026-09-30**. Verifier: this architecture task, through the existing Windsor.ai Facebook Ads connector and available Codex browser. No authenticated English Hills Meta administrator inspection was possible.
- Followed [AGENTS](../../../AGENTS.md), the [architecture task template](../../ai/templates/ARCHITECTURE_TASK.md), [activation plan revision 2](../plans/crm-batch2-meta-lifecycle-activation.md) and [ADR-004](../decisions/ADR-004-meta-lifecycle-feedback.md). The original working tree and unrelated local files were preserved in an isolated worktree.
- PR #38 changed only the activation plan and ADR-004 relative to PR #37. Read-only source checks reconfirmed the constants constraint and retry behavior in migrations 098/099 and the adapter/worker. No runtime test or account event was used to establish these findings.

## Verified observations and account-fact limits

| Ref | Read-only source / observed fact | What it establishes / does not establish |
| --- | --- | --- |
| A1 | Windsor.ai Facebook Ads `get_connectors`, with actions/options discovery disabled, returned one Facebook account: `1613720155930784`, name `KAL ad account`. | Verified connector inventory only. English Hills ownership, Business Portfolio membership, Page/form association and dataset entitlement remain unverified. No report data was fetched for this unbound account. |
| A2 | The connector's `get_fields` catalog exposes custom pixel event fields described as `Not qualified`, `Lost`, `Qualified`, `Converted`, `Intake` for account `1613720155930784`. | Verified field-catalog metadata only. Not a live Events Manager stage inventory, event receipt, dataset ID, CRM configuration or collision clearance. No event counts or lead records were requested. |
| A3 | Opening [Meta Business](https://business.facebook.com/) redirected to `/business/loginpage/`, showing sign-in choices. | The available browser was not authenticated for account inspection. No form, Business Settings or Events Manager configuration was reached. No login credentials were read or provisioned. |
| R1 | [Existing mapping documentation](../../crm-mapping-learner-policy.md) and revision 2 identify candidate form `1086266294126723`. | Verified repository reference and owner-specified inspection target only; not live publication, ownership, contents or D2 compliance. |

The A2 catalog field IDs are `conversions_offsite_conversion_fb_pixel_custom_not_qualified`, `conversions_offsite_conversion_fb_pixel_custom_lost`, `conversions_offsite_conversion_fb_pixel_custom_qualified`, `conversions_offsite_conversion_fb_pixel_custom_converted` and `conversions_offsite_conversion_fb_pixel_custom_intake`. If the owner subsequently confirms this account's relationship to English Hills, verify these names against the exact CRM dataset and integration before approving proposed event names. Do not add these additional kinds to Batch 2.

**Verified English Hills live form facts: none newly established. Verified English Hills dataset/assets: none newly established.** The nonsecret connector ID/name above must not be promoted into the destination manifest by inference.

## Missing form facts — `1086266294126723`

| Required fact | Current evidence / missing proof |
| --- | --- |
| Exact Page and ownership | Page ID/name, owning Business Portfolio or partner authority, form-to-Page relationship and connection Page are unverified. |
| Published form identity | Actual form name, status, language, publication/version/reference, current use by ads/ad sets and immutable mapping identity are unverified. |
| Exact questions and options | Full live question/disclaimer text, control types, required/optional state and selectable option definitions were not accessible. |
| Raw keys and typed values | No authoritative structural schema/export was available. Repository examples `full_name`, `phone_number`, `whatsapp_number`, `âge_de_l'enfant`, `travel_to_almaz` are synthetic normalization fixtures, not verified live keys or answers. |
| Adult-contact confirmation | Exact explicit statement, returned raw key, affirmative scalar type/value and required response behavior are missing. Parent/name/phone fields cannot establish this. |
| CRM lifecycle-sharing consent/evidence | Exact separate sharing statement, scope covering the approved milestones, raw key and affirmative typed values are missing. Generic inquiry consent and Meta origin are insufficient. |
| Privacy / notice | Exact displayed text, linked policy URL/reference, lifecycle disclosure wording, immutable version and reproducible digest are missing. No notice wording or legal sufficiency is asserted. |
| Immutable evidence binding | Approved form/mapping/version, notice version/digest, policy interval and submission-specific evidence binding remain unverified. Existing evidence infrastructure does not supply missing account facts. |

Capture form structure and option definitions only, with verifier/date/source. Do not export submissions to obtain example answers. Use an authorized structural schema or sanitized configuration evidence for returned keys/types; displayed labels alone do not prove machine values. If exact D2 compliance cannot be proven, remain dormant; any future form change/replacement requires separate approval.

## Missing dataset, assets and permissions/credential facts

| Required fact | Current state / next evidence |
| --- | --- |
| Business Manager / Business Portfolio | Exact business ID, ownership or partner relationship and inspecting operator authority missing. |
| Ad Account | A1 is a candidate connector account only. English Hills relationship, serving-form association and dataset/Page access missing. |
| CRM dataset / Pixel | Exact dataset ID and corresponding Pixel endpoint identity, owner, asset assignments and ad-account association missing. |
| CRM / Conversion Leads configuration | No Events Manager configuration proving CRM designation or Conversion Leads integration. A website Pixel/custom conversion is not a substitute. |
| Existing CRM event/stage names | A2 is catalog metadata only. Actual destination names, case, ordering, sources and collision analysis missing. Proposed `Qualified`/`Converted` are not approved by this observation. |
| Integration / connection | CRM recognition, connection status, data-verification phase and sales-funnel configuration missing. Reporting connectivity and inbound intake are separate. |
| Coverage / funnel diagnostics | Campaign volume, eligible-lead coverage, stage counts, diagnostic status and optimization eligibility unavailable. No conclusion about thresholds being met or missed. |
| App / system user | IDs, business ownership, chosen Events Manager versus own-app route, exact Pixel assignment and authorized asset tasks missing. |
| Token entitlement | Issuer/app/system-user metadata, scopes, dataset entitlement, expiry/rotation owner and post-provisioning validation missing. No token was read, created or tested. Prior rollout recorded no outbound provisioning; current absence was not independently queried. |
| Required inbound permissions | Revision 2 requires separate validation of `leads_retrieval`, applicable Page subscription/access permissions and lead-access assignment. Exact current granted/required set remains unverified; no grants requested. |
| Required outbound permissions | Revision 2 M5 records own-business Events Manager/own-app CAPI routes without requested permissions/App Review, with Pixel assignment for the own-app system user. Actual selected route, scopes/tasks and applicability remain unverified. Partner routes need separate official verification. Do not infer a need for `ads_management`/`business_management` or issue new grants from this report. |
| Credential / recovery operators | Named asset, credential, deployment, monitoring and recovery owners and secure provisioning plan remain required before the relevant gate. |

## Provider-contract facts already established in revision 2

These are inherited findings from the [revision 2 evidence register M1–M18](../plans/crm-batch2-meta-lifecycle-activation.md#official-provider-evidence-register), **not newly verified account facts or newly revalidated public documentation**:

- CRM event endpoint and `system_generated` source; exact `custom_data.event_source=crm` plus CRM label required. The current application/SQL do not yet permit the two constants.
- Original lead ID can be the sole matching parameter. Meta's pinned SDK preserves a decimal string; explicit endpoint wire-type/live-account proof is not claimed. D5 remains lead-ID-only.
- Seven-day maximum upload age and original milestone timing; strict timestamp-boundary work remains required.
- v26.0 was verified in revision 2, subject to release revalidation.
- Conservative ordinary receipt predicate: HTTP success, no provider error, numeric `events_received=1`. Receipt does not establish CRM recognition or advertising effectiveness.
- General error meanings are documented, but current broad retry handling needs correction. Browser/server 48-hour deduplication is not a verified server-only CRM replay horizon.

Still unresolved: narrower Qualified/Converted-only compatibility and coverage, bearer-header authentication support for the CRM endpoint, numeric server-only replay horizon, exact duplicate acknowledgment and CRM-specific error replay safety. Connector metadata cannot resolve these provider-contract questions.

## Owner decisions required

D1–D7 Option A remain approved. The conditional retry wording in the task is recorded below as **pending owner confirmation**, not inferred approval:

> No uncertain replay: unknown/ambiguous provider outcomes must not be automatically resent unless authoritative provider evidence establishes replay safety.

| Decision | Options / consequences | Recommendation and blocking status |
| --- | --- | --- |
| Retry-policy architecture | A: explicitly approve the quoted no-uncertain-replay correction, accepting held uncertain deliveries and coordinated SQL/application work. B: leave pending/remain dormant while seeking a verified numeric guarantee. | A recommended; **pending**, blocks the retry correction and H3/H4. No timeout or silence constitutes approval. |
| Narrower-funnel scope | A: retain D1–D7/two milestones and obtain applicable authoritative/account evidence. B: separately commission broader-stage architecture. | A; keep dormant, blocks complete provider-ready implementation and H3/H4. |
| Form / notice / mapping | A: retain only after exact D2 proof and owner approval of notice/typed mapping. B: separately approve prospective replacement/change. | Evidence-dependent; missing facts block H3. No form change authorized here. |
| Destination / names / credential route | A: approve exact verified business/Page/ad-account/CRM dataset relationships, collision-checked names and least-privilege route with named operators. B: defer. | A only after evidence; blocks H3. A1/A2 alone are insufficient. |
| Provider tests / final release | A: continue without provider tests and keep H3/H4 closed. B: later explicitly authorize a concrete test or release manifest after prerequisites. | A for this task. No test, preparation mutation or activation approval is implied. |

If the owner supplies the retry decision or authenticated inspection materially adds verified English Hills evidence, prepare activation plan revision 3 and update ADR-004 for any accepted durable decision. Merely merging PR #38 does not approve a new retry design or release gate.

## Implementation readiness and source gap confirmation

**Complete provider-ready implementation: not ready / not authorized. H3: not ready. H4: not ready.** Revision 2 allows independently scoped verified corrections to be commissioned separately after owner approval; this task commissions none.

Read-only source checks at the baseline reconfirm:

- [098 contract schema](../../../supabase/migrations/098_crm_lifecycle_evidence_and_delivery.sql) requires positive numeric `deduplication_window_seconds` and empty `required_constants`; unknown safety must not be represented by an invented number.
- [099 runtime](../../../supabase/migrations/099_crm_lifecycle_delivery_runtime.sql) can schedule `unknown` after finalization or an expired started-attempt lease while within the stored numeric window. Claim and director retry paths consume that policy. A text-only policy decision cannot change deployed behavior.
- [Adapter](../../../src/lib/crm/lifecycle/adapter.mjs) omits CRM constants and automatically retries broad HTTP/Graph classes. [Worker](../../../src/lib/crm/lifecycle/worker.mjs) leaves post-start finalization uncertainty for lease recovery. Any later approved no-uncertain-replay implementation must address both response classification and database claim/finalization/lease/manual-retry boundaries.
- [Evidence evaluator](../../../src/lib/crm/lifecycle/evidence.mjs) already compares exact typed values and denies missing/ambiguous evidence. Missing account/form evidence must not be described as missing evaluator infrastructure.

D7 remains a bounded single-delivery retry after repair, never a consent, age, identity, uncertainty, epoch or terminal-state bypass. No new automatic or manual replay permission is granted by this record. Preserve all D1–D7, immutable original truth, prospective-only operation and independent inbound intake.

## IMPLEMENTATION CONTRACT

1. This task changes architecture evidence/navigation documentation only. No code, migrations or external configuration changes; no merge or deployment.
2. Preserve activation plan revision 2 and ADR-004 decisions until substantive verified account evidence or a confirmed owner decision warrants revision 3. Keep every unresolved item explicitly unverified/pending.
3. A follow-up account inspection must establish the form and asset registers above using an authorized session or nonsecret structural evidence, with date/verifier/reference. Do not access/export lead answers or discover secrets to fill gaps.
4. Later application/SQL corrections require approved architecture, separate implementation, CI and fresh independent review/re-review. Follow the activation plan's exact H3/H4 manifests, stop conditions and recovery order; this report closes no release gate.
5. Validate this docs-only diff for relative links, source accuracy, secrets/PII absence and `git diff --check`. Application tests are not required for this documentation-only task.
6. Return branch, SHA and docs-only PR with verified/missing facts and all three readiness outcomes. Do not mark activation or architecture closeout complete while evidence and approvals remain missing.
