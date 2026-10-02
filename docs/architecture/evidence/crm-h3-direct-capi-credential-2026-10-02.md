# H3 direct Events Manager credential — 2026-10-02

**Credential blocker closed for the Events Manager direct CAPI route. READY FOR H3 OWNER REVIEW.** This is closure of the design/evidence question, not credential issuance, successful delivery, H3 completion or execution approval. It supersedes the custom-app-route blocker in [revision-4 evidence](crm-h3-credential-route-2026-10-01.md) and supports [technical package revision 5](../plans/crm-h3-technical-readiness.md).

Tier 3 architecture documentation against main `1fbaf091279875f033d294bdfb1436b86711a7ae`, after PR #50 merged. On 2026-10-02 Asia/Shanghai, authenticated Events Manager and official Meta documentation were inspected read-only. No code, Meta asset, permission, setting, token, seed or Production configuration changed. No token-generation control, integration Manage action, test or event request was used. No credentials/customer samples are retained. The owner explicitly selected assessment of a direct credential for the business's own dataset, not a SaaS/partner route.

## Authoritative route and CRM applicability

| Evidence | What it establishes |
| --- | --- |
| [Meta CAPI Get Started](https://developers.facebook.com/documentation/ads-commerce/conversions-api/get-started), updated June 28, 2026 | Two separate credential routes: recommended Events Manager and own app. The recommended path selects the Pixel, Settings, Conversions API, then Generate access token. The control requires business developer privileges. Its managed CAPI app/system-user setup needs no App Review or permission request; third-party partner requirements are separately linked. The guide describes integration Manage as potentially creating managed assets, so it is not a read-only control to explore. |
| [CRM Developer Implementation, step 2](https://developers.facebook.com/documentation/ads-commerce/conversions-api/conversion-leads-integration/crm-integration/3-implementing-the-crm-integration), updated June 28, 2026 | Explicitly supports generating a **new** CRM access token either through the CRM integration guide or Events Manager Settings → Conversions API → Generate access token. Requires Business Suite admin access for integration setup. Its non-SDK request uses Pixel ID and this access token. This directly establishes CRM applicability; no inference from ads scopes or website events is necessary. |

The chosen route is **Events Manager direct CAPI credential for dataset `1152399921284927`**, owned by business **Glory Lot `1741597822557523`**. It does not use custom app **English-hills `1069638329182835`** or native Admin **English Hills CRM `61594759444572`** as a preselected token issuer/subject. Their unpublished status, seven installed scopes and 60-day/Never wizard are historical evidence about a different route. Do not carry them into this credential's requirements or infer `ads_read`, `ads_management`, `business_management` or Page permissions are required here.

No custom-app publication or permission request is needed for this selected route under the cited direct-integration instructions. This is not a claim that every unpublished app can send events. Meta may create/use managed CAPI identities during later authorized setup; their actual IDs and privileges must be recorded then, not invented or equated with the existing native/legacy actors.

## Authenticated dataset evidence

Inspected [English Hills dataset Settings](https://eventsmanager.facebook.com/events_manager2/list/dataset/1152399921284927/settings?business_id=1741597822557523) by opening its Overview and selecting Settings. The current UI calls the documented “Set up manually” route **Set up direct integration**.

| Nonsecret field/control | Actual observation |
| --- | --- |
| Dataset | English Hills pixel, ID **1152399921284927** |
| Owner | Glory Lot, ID **1741597822557523** |
| Location | Settings → Conversions API → **Set up direct integration** |
| Issuance control | **Generate access token**, present and not disabled; not clicked |
| Direct-only option | **Set up without Dataset Quality API**, available; not selected/changed |
| Current default | **Set up with Dataset Quality API**, selected, marked Recommended |
| Scope warning | UI warns that generating a Dataset Quality API token also grants permission to previously generated tokens |
| Context | Existing business CAPI connection and CRM setup are present. Existing traffic is not evidence of an EH-native credential or activation |

The generic Settings subsection describes web events; the explicit CRM token instructions above establish the CRM route, not that generic label. Visible generation availability proves the account offers this route, not actual issuance success, token lifetime, exact managed issuer/subject or independent revocation behavior. No token was generated to test those properties.

## Dedicated credential and later operator contract

The new EH-native credential is dedicated by **new issuance, exclusive EH use, separate secret reference and token-specific lifecycle management**. This does not promise an exclusive managed system user/app or cryptographic dataset-only scope before metadata verification. Sharing a dataset with legacy does not authorize sharing its token.

1. At separately approved H3-05, recheck the exact dataset/business IDs, administrator authority, current direct-integration controls and restrictions. Use the direct-only **without Dataset Quality API** path. Selecting it and issuing are future authorized actions; neither occurred here. Stop if scope additions or changes to existing credentials/integrations are demanded. Never use the current DQA default: its documented UI warning conflicts with preserving legacy permissions.
2. Generate a **new** credential for EH, never retrieve/copy/reuse the Zapier or managed legacy credential. Use a protected human/operator flow; no value in chat, logs, Git, ordinary database rows, local `.env`, Preview or Development. Do not click integration Manage, replace/disconnect a connection or revoke a system user's tokens as an improvised setup step. Any necessary managed-asset operation must be explicitly enumerated and approved after its impact is understood.
3. Store only in Production Vercel project `english-hills-admin` under server-only **`CRM_META_LIFECYCLE_TOKEN_EH_R4`**, with protected secret-manager version metadata. Record route, dataset/business, operator, actual issuer/subject if exposed through approved protected tooling, issued-at, actual expiry/non-expiring status, effective entitlement, custody and evidence date. Never borrow the old custom-app route's lifetime or proof settings. Unknown lifetime is not “Never.”
4. Verify token separation and the replacement/revocation mechanism without provider events. Do not promise isolated revocation merely because the token was freshly generated. Bind a token-specific recovery action before approving its use; if only shared/bulk revocation is available or independence is uncertain, stop credential execution and commission a revised recovery design. No legacy token needs to be read to assert exclusive EH storage/use, and no legacy token is revoked here.
5. Keep destination disabled, live gate absent/false, lifecycle scheduler inactive and all activation/ownership inventory absent. Credential provisioning cannot activate sending. Metadata/configuration acceptance is not an event receipt or provider-delivery proof.

Existing EH policy proposal remains: metadata review every 30 days; rotation before the earlier of actual expiry minus seven days or 90 days from issuance, including non-expiring credentials. This is an owner decision, not a Meta lifetime guarantee. Rotation creates a separate replacement, verifies it while dormant, then retires only the superseded EH token through the established isolated mechanism. Never revoke legacy/inbound credentials or an entire shared managed identity. If safe replacement/revocation cannot be established, remain dormant and escalate; do not weaken separation. A compromised native secret is removed from EH use under the approved incident flow while provider revocation is coordinated without blind shared-asset disruption.

The CRM non-SDK instructions require the generated access token and Pixel ID, not the custom English-hills app secret. No event-proof requirement is established by this route. If the actual route later requires proof, stop for the existing conditional reviewed transport/storage design; the old app's Require app secret switch does not establish the managed issuer's policy. No API-based custom system-user issuance/proof recipe is commissioned.

## Closure and remaining decisions

**Closed:** the unresolved custom-app OAuth-scope and unpublished-app questions no longer apply to the selected credential path. Account UI exposes it, and official CRM instructions explicitly endorse it. No additional ads-scope inference, app publication or permission grant is introduced as an H3 prerequisite.

**Still to approve/execute:** transport and strict-second timestamp choices; exact provider manifest/seed; credential custody/rotation policy; artifact-bound implementation/release approvals; protected new-token issuance, metadata and isolated recovery verification; Production-only storage; disabled destination binding and independent dormant acceptance. Actual credentials, lifetime/issuer metadata and recovery execution records are outputs of those gated steps, not preconditions for reviewing this design. Stop conditions above remain binding.

**H4 unchanged:** actual source/form/mapping/cohort, source-specific native/legacy no-overlap proof including retry/manual paths, any necessary legacy retirement, ownership admission, epoch and live activation. No test or real events are authorized by this closure.
