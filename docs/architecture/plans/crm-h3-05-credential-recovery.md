# Owner summary

## What will change

**Tier 3: RECOVERY DESIGN BLOCKED.** Recovery-design revision 1, researched 2026-10-02 (Asia/Shanghai), against main `a1eb1791e339d983d6521ed027366d7e74628f4e`. Documentation only. Risk rationale: credential authority, provider invalidation and possible disruption of Production integrations make this Tier 3 despite the Markdown-only diff. H3-05 remains blocked before issuance. Meta documents individual system-user-token revocation, but the prerequisites have not been established for this account's Events Manager-managed route. A new token is not proof of a separate recovery boundary.

Recommend a narrowly scoped amendment if Meta cannot establish the current route's prerequisites: use an EH-lifecycle-only Employee system user with explicit target-asset access and a verified issuing app, isolated from both existing actors. Prefer individual-token revocation; permit identity-level invalidation only for an exclusively EH-owned revocation group, under new owner approval. This is a **proposal**, not an approved revision 6 or an executable provisioning contract.

## What staff/users will be able to do

Nothing new. The owner receives the evidence, unresolved provider questions and conditional recovery procedures. No staff workflow changes.

## What remains restricted

No credential generation, viewing existing credentials, revocation, system-user removal, asset assignment, integration/settings changes, DQA selection, Production/Vercel changes, destination binding, provider events, H3-06–08 or H4. No support message is sent. Existing H3-05 authorization does not authorize the alternative route or its extra secrets/permissions.

## UI impact

None. Authenticated Meta settings were inspected read-only. Generate, Revoke tokens, Remove, Manage and assignment controls were not invoked. No credential wizard or app-secret view was opened.

## Database impact

None. No migration or data change. [H3-04 Production evidence](../evidence/crm-h3-04-production-2026-10-02.md) establishes immutable ledger 001–106, one contract and otherwise dormant lifecycle state. This task inherits that evidence; it did not inspect Production.

## Important security decisions

Removing `CRM_META_LIFECYCLE_TOKEN_EH_R4` from Vercel is EH-side containment, **not provider revocation**. A stolen credential remains usable at Meta until provider invalidation. No unknown or shared revocation group is acceptable. The existing inbound actor and legacy CAPI identity must remain untouched. Repair never replays an uncertain event.

## Risks / owner review points

The direct route's exact future issuer/subject and create-versus-reuse behavior remain unproven. The account already has a managed CAPI app/user and active CAPI traffic. Individual revocation needs the issuing app secret plus a same-app caller token; business ownership alone does not prove those are available. Group invalidation also revokes a replacement issued into the same group. These facts prevent declaring H3-05 safe to resume.

## Authority and observed state

### Option A provider-confirmation follow-up — 2026-10-03

**H3-05 OPTION A: SUPPORT CONFIRMATION REQUIRED.** Tier-3 credential-recovery research only, against main `53891524ac29561bd882bb6db25425fc8b5f5e53`. This dated evidence supplement preserves recovery-design revision 1 and approved H3 revision 5; it does not approve a recovery addendum, change the issuance route or clear H3-05. The [PR #59 owner decision](https://github.com/elforssa/english-hills-admin/pull/59#issuecomment-5956417055) selects A first and expressly prohibits issuance and other credential/account/Production operations. [Independent review](https://github.com/elforssa/english-hills-admin/pull/59#issuecomment-5956392172) covers head `7a19a6e8289beb708b517221be0dd2f92572ded7`, base `a1eb1791e339d983d6521ed027366d7e74628f4e`, CI merge `9a260821e99a8bcac20f632058f135ff1d7e3e62`; Verify [37027760893](https://github.com/elforssa/english-hills-admin/actions/runs/37027760893) passed app/local-database. The [merge/operator record](https://github.com/elforssa/english-hills-admin/pull/59#issuecomment-5956446095) binds current main and READY deployment; deployment evidence is inherited, not reverified here. The PR #51 blocked operator record below remains binding.

Fresh official browser reads reconfirm R1–R3 below. Public web fetches returned HTTP 429; authenticated browser rendering succeeded. R1 still associates managed app/user creation with Manage after token generation and does not identify the next direct token or repeated-generation semantics. R3 still documents individual `GET oauth/revoke` with target token, app ID/secret and same-app caller, immediate invalidation and replacement deployment before revocation. R2 remains all-token user invalidation. No third-party article, credential/API experiment or support answer supplies authority for this follow-up.

Fresh nonsecret account inspection reconfirms dataset `1152399921284927` / business `1741597822557523`, active existing CAPI connection, direct generation control, without-DQA option, and the unchanged selected DQA default/warning. CAPI Employee `100089438321765` still has managed app `6490032931025859`, Pixel View Pixels and dataset Use events dataset assignments; Installed apps lists Conversions API Application. CRM Admin `61594759444572` still shows four assets including custom app `1069638329182835`, with no dataset displayed. Neither actor is established as the next direct token's subject, and no legacy token-to-consumer mapping is established.

**New account-specific observation:** [My Apps](https://developers.facebook.com/apps/) displays All Apps (1), no selected business filter, and only English-hills `1069638329182835` under Admin Apps. A read-only navigation to the [managed app dashboard](https://developers.facebook.com/apps/6490032931025859/dashboard/) returns to My Apps; no managed dashboard is rendered in this authenticated session. [Business Settings managed-app details](https://business.facebook.com/latest/settings/apps/?business_id=1741597822557523&selected_asset_id=6490032931025859&selected_asset_type=app) still show Glory Lot ownership and one assigned person, Conversions API System User, with partial Develop app/View insights/Test app access. The screen states that at least one app admin is needed for dashboard access. These observations establish the displayed access state only. They do **not** prove global impossibility of custodian access, an absent app secret, or that assigning a human would be supported/sufficient; no assignment was attempted. Authorized protected access to the correct issuing secret remains unestablished, and no secret view/value was opened.

| Required fact | Result and evidence boundary |
| --- | --- |
| Exact issuing app/client | Unresolved for the next direct token. Existing managed app ID is observed, not future issuer metadata. |
| Exact system-user/subject | Unresolved for the next direct token. Existing CAPI and CRM actors are observed, not future subject metadata. |
| Repeated Generate creates or reuses identity | Unresolved; R1 and inspected setup controls do not specify it. No generation or Manage action used to discover it. |
| Individual oauth/revoke eligibility | Documented for qualifying system-user tokens by R3; applicability to this account's future direct token is unestablished. |
| Custodian access to correct app secret | Unestablished. Managed dashboard is not rendered for this session; ownership/partial assignments do not prove protected secret access. |
| Independent same-app recovery caller | Unestablished. No inspected metadata establishes an eligible caller separately accessible outside the compromised sending credential/Production sender. |
| Exact individual-revocation blast radius | R3 targets an individual qualifying token; no account-specific guarantee for the future direct token is established. Every consumer of a revoked target would lose access. Other-token, replacement and recovery-caller survival need provider confirmation. |
| Existing CAPI/legacy/inbound integrations unaffected | Unresolved for the actual route. Token sharing/consumer mapping is unknown; no attribution to Zapier or an existing actor is inferred. Shared-user invalidation remains prohibited. |

**Feasibility assessment:** individual revocation is a documented candidate, not an executable account recovery path. Independent recovery authority is not established. Existing managed identity should continue to be treated as potentially shared (risk inference, not a proven token dependency). These gaps fail Option A acceptance; they do not establish Option A is impossible. H3-05 remains blocked before issuance; H3-06–08/H4 stay held. No token was generated, viewed, stored, tested or revoked; no secret, assignment, setting, DQA selection, Production configuration or provider event changed. No switch to C is authorized.

**Proposed Meta support inquiry — unsent; owner authorization to send required:**

> Subject: Account-specific recovery confirmation for Events Manager direct CAPI tokens
>
> Please confirm the token architecture and isolated recovery procedure for Glory Lot business ID 1741597822557523, English Hills dataset ID 1152399921284927. The planned route is Events Manager → this dataset → Settings → Conversions API → Set up direct integration → without Dataset Quality API → Generate access token. We have not generated the new EH token and need confirmation before issuance; please make no account changes.
>
> Existing visible assets are Conversions API Application 6490032931025859, Conversions API System User 100089438321765 (Employee), and English Hills CRM 61594759444572 (Admin, assigned custom app English-hills 1069638329182835). We are not assuming any is the next direct token's issuer/subject or that any particular legacy integration uses their tokens. My Apps lists only English-hills; opening the managed app dashboard returns to that list, while Business Settings shows only the CAPI system user assigned to the managed app with partial access.
>
> 1. What exact issuing app/client ID, token type and system-user/subject ID will the next token from this route use? Please distinguish canonical Business Settings IDs from app-scoped API IDs and explain how these can be verified without exposing a credential.
> 2. Does repeated Generate access token create a new identity or reuse an existing one? Does direct-only generation change or invalidate any existing token, permission or integration?
> 3. Is this specific direct-route token eligible for the documented individual GET oauth/revoke endpoint? Please confirm its client_id/client_secret and same-app caller prerequisites and any additional caller role, subject, permission or app-state requirements.
> 4. Can our authorized owner/custodian obtain protected access to the correct issuing app secret for this managed route? Please explain the supported access process and any required changes, without sending a secret or making changes.
> 5. How can we maintain a separately held, eligible same-app caller outside the EH sending credential and Production sender, usable if that sending token is compromised or unavailable? Can it belong to a separate subject, and would retiring the sending token leave that caller valid?
> 6. Can a replacement be issued and kept dormant while the old token remains valid, then only the old EH token be revoked? Please confirm the exact blast radius: whether replacement/caller/other tokens on the same app/user/dataset remain valid, and whether existing CAPI, legacy and inbound integrations using other credentials keep working. Identify any exceptions or shared-token effects and distinguish individual revocation from the Business Settings Revoke tokens control.
>
> Please bind your answers to this business, dataset and exact without-DQA route, with official documentation or account-specific engineering confirmation. A generic oauth/revoke link alone does not establish managed-route applicability. Please do not request/send token or app-secret values, issue/revoke credentials, change settings/assignments or send events.

The next action is owner-authorized support contact with this nonsecret inquiry. No inquiry was entered into a support form or sent; no existing support conversation was inspected. A response must resolve the bindings above before an owner-approved recovery addendum or later protected operator task can proceed.

- [Revision-5 architecture approval](crm-h3-technical-readiness.md#final-owner-architecture-approval--2026-10-02) approved direct Events Manager issuance without DQA, exclusive EH custody and isolated recovery. Earlier route-closure language established issuance availability, not recoverability.
- [H3-05 owner authorization](https://github.com/elforssa/english-hills-admin/pull/51#issuecomment-5955112635) allowed one new credential and protected Production-only storage, but required stopping on shared/bulk revocation or legacy changes.
- [Blocked operator record](https://github.com/elforssa/english-hills-admin/pull/51#issuecomment-5955549306) records no credential generated or exposed, no Production change and no provider event. It also records a separate browser credential-entry human-takeover requirement. Resolving architecture would not remove that execution boundary.
- Current repository [adapter](../../../src/lib/crm/lifecycle/adapter.mjs) uses a transient multipart token; [worker](../../../src/lib/crm/lifecycle/worker.mjs) resolves the configured environment secret. Neither supplies credential provisioning/revocation machinery. No application implementation is proposed here.

Fresh authenticated observations, without token inspection:

| Surface | Observation and limit |
| --- | --- |
| [System users](https://business.facebook.com/latest/settings/system_users?business_id=1741597822557523) | Glory Lot lists Conversions API System User `100089438321765` (Employee) and English Hills CRM `61594759444572` (Admin). Both show Revoke tokens; no individual-token selector was observed on the inspected detail pages. The button was not clicked; its confirmation semantics were not tested. |
| Existing CAPI user's Assigned assets | Conversions API Application `6490032931025859`, partial Develop app/View insights/Test app; English Hills pixel, View Pixels, link ID `1152399921284927`; English Hills pixel under Datasets, Use events dataset, link navigation ID `1568116421343147`. Do not substitute that navigation ID for the verified Events Manager endpoint ID or assume their equivalence without provider evidence. |
| Existing CAPI user's Installed apps | Conversions API Application is installed. No token inventory or mapping from consumers to individual credentials is exposed in the inspected view. |
| [Managed app details](https://business.facebook.com/latest/settings/apps/?business_id=1741597822557523&selected_asset_id=6490032931025859&selected_asset_type=app) | Owned by Glory Lot; one assigned person: Conversions API System User with partial access. No human app administrator is listed in this view. This does not prove the owner cannot obtain recovery authority; it does not establish current access to the app secret either. No dashboard/secret access or assignment attempted. |
| Existing native Admin | Four displayed assets: EH Page, KAL ad account, English-hills app, Instagram entry. Historical [custom-route evidence](../evidence/crm-h3-credential-route-2026-10-01.md) identifies this as the shared intake actor. It is not a dedicated lifecycle recovery group. |
| [Events Manager Settings](https://eventsmanager.facebook.com/events_manager2/list/dataset/1152399921284927/settings?business_id=1741597822557523) | Dataset ID `1152399921284927`, owner `1741597822557523`. Existing business CAPI connection active, one dataset connected, recent receipt displayed. Direct integration offers Generate access token and without-DQA choice; DQA is currently selected by default and warns of permission extension to previous tokens. No option changed. CRM setup status does not prove EH-native delivery. |

These are point-in-time rendered UI observations, not exported token metadata or exhaustive dependency discovery. No secrets, customer events or customer records were read. [Prior legacy-chain evidence](../evidence/crm-h3-blocker-evidence-2026-10-01.md#verified-legacy-sending-chain) establishes Sheet/script/Zap activity; it does not bind every credential to a system user. Repeating a legacy source census is outside this recovery task.

## Official provider evidence

All sources below were freshly rendered in the authenticated browser on 2026-10-02. Public web fetch of the CAPI guide returned 429; browser reading succeeded. Third-party search results are not contract authority. No mutation/API experiment was used to validate provider claims.

| Ref | Authoritative source | Finding and boundary |
| --- | --- | --- |
| R1 | [CAPI Get Started](https://developers.facebook.com/documentation/ads-commerce/conversions-api/get-started), updated June 28, 2026 | Documents Events Manager and own-app routes. Associates automatic managed app/user creation with the later Manage control. Does **not** specify fresh identity creation versus reuse on each Generate access token action, nor bind the next token to the existing account IDs. Own-app flow assigns the Pixel to a system user then generates a token, with no App Review/permission-request requirement stated for direct integration. |
| R2 | [Create, Retrieve and Update a System User — Invalidate Access Tokens](https://developers.facebook.com/docs/business-management-apis/system-users/create-retrieve-update#delete-token) | Documents DELETE of the app-scoped system-user `access_tokens` edge to invalidate all tokens for that user; successful response is true. Says system users/admin system users cannot be deleted. Distinguishes app-scoped API IDs from canonical Business Settings IDs. Do not construct a destructive call from the UI ID. |
| R3 | [Install Apps, Generate, Refresh, and Revoke Tokens](https://developers.facebook.com/docs/business-management-apis/system-users/install-apps-and-generate-tokens#revoke-token) | Documents individual system-user-token revocation via GET `oauth/revoke`, taking target `revoke_token`, `client_id`, `client_secret`, and caller `access_token`. All app relationships must match and the app must not be throttled, disabled or deleted. Describes immediate invalidation and replacement deployment before old-token revocation. Also documents 60-day/optional non-expiring tokens and same-business/app installation restrictions. Applicability and prerequisites for an Events Manager-managed token remain unverified. |

R3 is a real individual-token mechanism, so “Meta only supports bulk revocation” is incorrect. R2 is a real group mechanism, so a freshly issued replacement in that same group is not protected from it. R3's example puts secrets in a GET URL: it is documentation, **not approval to paste credentials into a browser, shell command, chat or logs**. A later protected operator contract must prevent request-URL/access-log/trace leakage and establish a supported safe execution path. It must not invent POST support to avoid the issue. Recovery credentials must be independently accessible to the authorized custodian if the sending token is compromised or unavailable; do not rely solely on that token as the caller.

## Answers and revocation granularity

1. **Exact identity for the next direct token:** unknown. R1 identifies the managed CAPI app/system-user model, but does not bind that future token to `6490032931025859` / `100089438321765`. Those are observed existing assets, not verified future issuer/subject metadata.
2. **Available mechanisms:** R3 individual token; R2 all tokens for a system user. System-user deletion is expressly unsupported by R2. Asset-removal controls exist in UI but are authorization removal, not established token invalidation. No inspected source establishes integration removal, app-secret reset or other action as safely invalidating exactly this future credential.
3. **Which invalidates it:** R3 invalidates a qualifying system-user token if its issuer/caller/secret requirements are met; R2 invalidates the relevant user's group. Neither is currently bound to an as-yet unissued direct EH credential with proven safe recovery authority. No revocation was performed.
4. **Exclusive group:** not proven for the direct route. Existing CAPI identity predates EH issuance and has installed app/asset access; it cannot be certified as exclusively the new EH credential. Existing Admin is also unsuitable. A name or new secret reference does not establish exclusivity.
5. **Shared dataset identity:** existing managed identity and CAPI traffic are confirmed; exact sharing among legacy/other tokens is unknown. Treat that identity as potentially shared. UI assignment alone cannot prove which token Zapier or other senders use.
6. **Blast radius:** see below. No blanket assurance that legacy/inbound services would survive shared revocation is justified.
7. **New managed identity versus reuse:** unresolved in current authoritative evidence. R1's Manage wording does not answer repeated token generation. Do not issue a token or invoke Manage to discover it.
8. **Replacement sequence:** valid conditionally under R3 after issuer/caller authority is bound, or with two proven-disjoint EH-only identity groups under a newly approved group design. It is unsafe to issue a replacement on the same user and then use R2 to retire the old token.

| Action | Blast radius / suitability |
| --- | --- |
| Individual R3 revocation with verified app/target binding | Documented target-token invalidation; acceptable candidate without revoking other tokens. Still affects every consumer of that token; exclusive EH custody/use must be established. |
| Revoke existing managed CAPI user group | Potentially all its server-side CAPI consumers, including Zapier/legacy lifecycle feedback and unknown integrations. Prohibited. Browser Pixel collection may use a different path, but combined tracking/deduplication could be affected; no immunity claim. |
| Revoke existing native Admin group | May interrupt inbound lead intake/reconciliation and other app consumers. Prohibited. |
| Remove dataset/app access or integration | Can deny multiple senders or unrelated functions; credential may remain valid for other assets. Not accepted as sole compromise recovery. |
| Remove EH environment secret / close EH gates | Stops subsequent EH use when effective; cannot invalidate an attacker-held token, recall in-flight events or undo provider receipts. Containment only. |
| Dedicated EH-only group invalidation | Isolated from unrelated integrations only with verified exclusive membership/usage, asset bounds and independent recovery authority. Revokes **all** tokens in the group, including dormant replacements and recovery callers if placed there. |

## Bounded alternatives

### Option A — retain direct Events Manager issuance

Smallest change **if** Meta supplies authoritative direct-route token type/issuer binding, repeated-generation behavior and a usable R3 recovery method (or an equivalent documented token-specific managed control). Need nonsecret evidence of authorized app-secret custody and same-app recovery-caller availability, without reading secrets in research or widening existing permissions. Current app ownership/partial-assignment UI is insufficient. R3 alone does not close A. H3-05 remains stopped; no permission changes to the managed app are implied.

Revision 5 can retain its route and isolated-token principle if A is proven, but any newly required recovery secret, caller credential or permission must be explicitly bound in an approved recovery addendum before issuance. Existing approval of a sending token does not approve this extra custody surface.

### Option B — dedicated identity with group-level invalidation

R2 can make a group action effectively isolated to EH if **every** credential in that exact revocation domain serves only EH lifecycle. This is identity-level revocation, never token-specific revocation. Prove app-scoped/canonical identity mapping, complete issuance/use inventory, no inbound/legacy consumers, no inherited broad Admin rights, custody and controlled future issuance. No such direct-route dedicated identity is established today; no supported identity-selector behavior may be assumed.

For uninterrupted replacement, use two separately identified, exclusively EH groups: new token on group B, dormant custody and verification, switch EH secret, then invalidate group A. Confirm R2's exact cross-app/group scope and independence first. Alternatively, revoke A first and reissue on A with an explicitly accepted dormant interval; that cannot satisfy issue-before-revoke continuity. Account identity limits and non-deletability must be assessed before approving an A/B group pool; do not accumulate a new undeletable user every rotation. B requires an amendment to revision 5 and the explicit stop-on-bulk owner authorization, even when its blast radius becomes exclusively EH.

### Option C — narrow issuance-route amendment (recommended fallback)

If A cannot be established, propose own-business app issuance through a **new dedicated Employee system user**, not existing `61594759444572` or `100089438321765`. Reuse custom app `1069638329182835` only if its ownership, permission/proof constraints, independent recovery authority and effect on existing intake are verified without altering shared app settings. A new app is not automatically required; commission one only if that isolation cannot be established and the owner approves the additional scope. Do not use/change the managed CAPI app as an improvised workaround.

Prefer R3 individual revocation; R2 on the dedicated lifecycle identity may be an explicit emergency fallback after its full scope is established. Keep recovery authority outside the compromised sending environment/group. Sharing an app can still make an app-secret compromise wider than a token compromise; this proposal does not promise isolation from an app-level breach. No app secret need be added to the EH sender solely for operator-side revocation.

Reopens only these previously bypassed requirements from [custom-route evidence](../evidence/crm-h3-credential-route-2026-10-01.md): exact CRM OAuth scope applicability (no speculative broad scopes), Unpublished/Ready-for-testing applicability to ongoing CRM delivery, app/system-user installation and account limits, Employee dataset task/effective entitlement (old Admin inheritance does not apply), actual lifetime, issuing/recovery app/caller/secret custody, issuance proof versus event-request proof, and verified invalidation scope. Reconcile R1's direct no-review statement with R3's generic app-install/access-tier constraints; do not silently require publication/App Review or assume they are unnecessary for the selected app's state. Event proof, if required, needs its own approved runtime/storage patch. No unrelated R4, payload, D2, conversion, source, cohort or H4 decision reopens.

**Do not implement C.** This is the minimal candidate amendment, not a claim all its provider requirements are resolved.

## Conditional replacement and compromise procedures

These are design constraints for a later exact-artifact operator contract, not instructions to act now.

**Routine replacement:** bind approved mechanism/identity/app, independently available recovery authority and exclusive EH usage before issuance. Preserve the 30-day metadata review and rotation before the earlier of issuance+90 days or expiry−7 days. Issue a replacement via the approved route; record nonsecret identity, issuance, actual expiry, entitlement and protected version references. Keep replacement dormant in approved protected Production custody. Verify metadata without events, keep destination disabled/live gate closed/cron inactive, then switch the EH secret under separate Production approval. Revoke only the superseded token through R3, or only the superseded dedicated group through approved B. Verify provider invalidation through an approved non-event validity check and continued replacement validity; record nonsecret results. No events as probes, no automatic rollback to a revoked/compromised token. If revocation fails, hold sending and report the still-valid old credential; do not claim completion.

**Suspected compromise:** immediately escalate to the named custodian (Maroine EL Forssa), contain EH use under incident authority and preserve audit/unknown-attempt history. Provider invalidation takes priority over availability: do not defer revocation until replacement issuance. Use the prebound R3 target action; if unavailable, use only a preapproved proven-exclusive group action. Compromise of app/recovery authority itself requires broader incident assessment, not blind shared-app reset. If only a shared/unknown action is available, keep EH contained and urgently escalate to the owner/provider for a separately authorized impact-aware response; containment does not resolve the incident. After invalidation is verified, issue/verify a clean replacement under separate authority, retain closed activation gates and record incident closure. None of these steps revives uncertain delivery identities.

## Owner decisions required

**Current owner choice:** [PR #59 selects Option A first](https://github.com/elforssa/english-hills-admin/pull/59#issuecomment-5956417055). The 2026-10-03 follow-up above requires account-specific support confirmation and separate owner messaging authorization; C is not approved. The historical revision-1 choice below is superseded only as to which research path to pursue.

**Historical revision-1 blocking choice:** pursue A with provider evidence, or commission the C amendment? Recommend C as the fallback while keeping A available if Meta can supply the missing managed-route guarantees. A preserves the existing route but has unresolved identity and recovery-authority requirements. C gives explicit identity control but reopens the bounded requirements above and may need extra operator-secret custody. B is a conditional recovery design within a proven dedicated route, not permission to revoke the current shared user.

No owner choice can substitute for missing provider facts. Before any issuance, obtain current authoritative evidence (official docs or an account-specific Meta response) binding: direct token issuer/type and create/reuse behavior; R3 applicability and authorized recovery prerequisites; or the chosen dedicated route's scope/status/identity/entitlement and group semantics. A support inquiry may use nonsecret asset IDs and these questions only after separate messaging authorization; none was sent here. Approval must name this recovery-design revision, selected route, revocation granularity, custody additions and subsequent operator scope. Existing revision-5 approval is preserved, not relabeled as approval of these proposals.

## IMPLEMENTATION CONTRACT

- Current scope: documentation-only recovery research and blocked-state correction. No code, SQL, tests/CI configuration, assets, credentials or Production mutations. Migration filenames: none.
- Deliverables: this revision-1 plan/evidence; linked H3 plan/status and ADR proposal. Preserve historical approval/evidence, including H3-04 Production verification.
- Before future implementation: resolve provider facts above, bind selected app/identity/recovery group and secret-free impact inventory, obtain owner amendment approval, independent exact-SHA review and separate operator authorization. A fresh task must first produce the precise allowed action manifest and protected credential-handling contract. This blocked design does not authorize issuing disposable test tokens or experimenting with revocation.
- Acceptance: official evidence establishes invalidation and exact granularity; unrelated tokens/integrations are excluded from its blast radius; replacement survives old-authority retirement; compromise can be invalidated without relying on the compromised sender; secret-safe operator path and non-event validity verification are bound. Actual later execution records issuance/revocation results without values. Metadata acceptance is not provider-event acceptance.
- Stop: missing identity/app mapping or recovery authority, unknown/shared group, unverified token-specific applicability, DQA/legacy effects, new scopes/publication/proof demands, secret-leaking tooling, unsupported dataset-ID substitution, account capacity issue, expired evidence, failed invalidation or out-of-scope action. Keep H3-05–08/H4 held.
- Validation/handoff: relative links/anchors, source accuracy, secret/PII absence, docs-only diff and `git diff --check`; one author self-check; open documentation PR and wait for current required CI. No local app/database suite for Markdown-only changes. Record exact head/base/tested merge and CI results in the handoff. No reviewer subagents. Separate independent review and human merge/release approval remain mandatory; this task ends **RECOVERY DESIGN BLOCKED** while provider facts are unresolved.
