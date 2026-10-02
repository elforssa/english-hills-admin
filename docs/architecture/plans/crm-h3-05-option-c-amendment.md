# Owner summary

## What will change

**Tier 3: OPTION C ARCHITECTURE BLOCKED.** Proposed **H3 credential amendment revision 6**, draft 1, 2026-10-03 (Asia/Shanghai), against main `9d30bc238918e30f11a8fbd0f97dd275c4b61745`. This is a bounded proposed amendment to [approved revision 5](crm-h3-technical-readiness.md), not a replacement of its historical approval and not an approved revision 6. Risk: credential authority, revocation and Meta Production integration, despite documentation-only scope.

Recommend an EH-lifecycle-only **Employee System User**, a reviewed business-owned issuing app, a dedicated sending token and recovery outside the application runtime. **C2 (new lifecycle-only app) is the preferred candidate for the stronger app-secret failure boundary**, based on shared intake dependencies and the documented full-app assignment recipe, not cosmetic separation. It is **not selected for execution**: exact scope/task, account capacity, app setup/status and recovery-caller facts remain unresolved. C1 (existing app) remains the smaller conditional alternative if a narrower supported assignment and acceptable shared-app risk can be established. No safe final issuing-app contract can yet be approved.

## What staff/users will be able to do

Nothing new. A later separately authorized operator could issue, rotate and invalidate only EH lifecycle credentials. Staff CRM, existing intake and other senders retain their current behavior. This draft gives the owner a concrete conditional design and the exact facts needed to finish it.

## What remains restricted

No implementation, app/user creation, assignments/installations, scope/status changes, secret viewing, token generation/inspection/testing/revocation, DQA changes, Production/Vercel changes, `/events` or Test Events, destination binding, H3-06–08 or H4. Read-only account inspection occurred; no support inquiry was sent. All future operator steps below are designs, not authority to execute.

## UI impact

No EH UI changes. No recovery or credential management endpoint in the EH application. Any future browser credential entry remains a human-takeover action under the [blocked operator record](https://github.com/elforssa/english-hills-admin/pull/51#issuecomment-5955549306).

## Database impact

No migration, SQL execution, contract replacement or activation data. H3-04 and immutable migration 106 remain complete. No database credential inventory containing values is proposed.

## Important security decisions

Employee access must be explicit and confined to lifecycle assets; neither existing user `100089438321765` nor `61594759444572` can be reused. Individual revocation is preferred; emergency **identity-level/group revocation** may be acceptable only for a proven exclusively EH lifecycle identity. Every token in that group, including replacements, is lost together. Independent recovery cannot depend solely on the stolen sending token, its System User or the EH runtime. App-secret compromise is a different incident from token theft.

## Risks / owner review points

Current official material does not establish an exact least-privilege CRM token/task bundle or the additional Employee's capacity. The specific CAPI no-review rule and generic system-user/app guidance need account applicability resolved, not speculative publication. A new app introduces custody and administration overhead and may carry broad required app features. A shared app couples app-secret incidents to intake. Owner approval cannot waive missing provider facts. The draft therefore stays blocked rather than presenting these as routine post-issuance discoveries.

## Verified state, authority and evidence classes

[Evidence register](../evidence/crm-h3-05-option-c-2026-10-03.md) contains fresh official sources C01–C12, fresh nonsecret observations A01–A04, inherited evidence, inferences and unresolved facts. [PR #60 owner authorization](https://github.com/elforssa/english-hills-admin/pull/60#issuecomment-5957692568) authorizes this architecture research, **not this architecture's adoption**. The current user instruction supplies the same bounded scope. Revision-6 architecture approval: **none**. Implementation/operator approval: **none**.

H3-04 Production acceptance and ledger 001–106 are inherited from its [release record](../evidence/crm-h3-04-production-2026-10-02.md); no Production access was performed here. H3-05 stopped before issuance. Option A is [not viable under the approved isolated-recovery requirement](../evidence/crm-h3-05-option-a-support-2026-10-03.md), based on owner-relayed Meta support AI evidence with its recorded limits. That is not official proof of any Option C mechanism.

Current source implements transient multipart authentication, strict exported-second validation and separate gates. The historical ADR/revision-5 direct-route closure is inconsistent with treating H3-05 as executable now; the dated blocker and this proposal take precedence for readiness only. Preserve historical decisions and all noncredential contracts.

## Issuing-app decision and alternatives

| Arrangement | Evidence and benefits | Risks / decision |
| --- | --- | --- |
| **C1: English-hills `1069638329182835`** | Glory Lot owns it; owner and existing CRM actor have full access. Marketing tier Limited, scopes Ready for testing, In development/Unpublished labels. Own-app CAPI is documented. Avoids another app/secret. A new Employee can conceptually isolate its tokens from the existing Admin's tokens. | Supported narrow issuance on the new Employee is unproved; old Admin wizard's locked scopes cannot be assumed necessary or removable. C05's UI recipe grants Manage app / Full control, which widens responsibility on the intake app. App-secret rotation or app restriction could affect intake authentication/other users. **Conditional fallback**, not an approved shared-app change. |
| **C2: new Glory Lot lifecycle-only app** | C01 supports own-app CAPI; C09 supports business-associated Marketing apps. Separate app secret and app-management assignment avoid sharing these authorities with the intake app. This is a material failure-boundary improvement. | Extra credential/app maintenance; no app ID exists. No proof that a new app avoids broad token scopes, publication constraints or business-wide user quotas. App creation is not an authorized workaround to limits. **Preferred candidate**, blocked pending exact provisioning facts and owner acceptance of cost/scope. |
| **C3: narrower supported arrangement** | Consider one dedicated Employee, owned app and exclusively lifecycle group revocation without persistent API recovery caller; human business-admin recovery could reduce standing credentials if supported and timely. | Still needs issuing app, group authority and confirmed scope/capacity. Downtime is unavoidable for same-group rotation. No official source inspected establishes an app-less credential, Events Manager dedicated-identity selector or dataset-only individual revoke route. None is invented. C3 is a conditional recovery simplification of C1/C2, not a proved new issuer. |

**C1 cannot promise isolation from app-level compromise.** Individual token revocation and dedicated-group invalidation can be isolated while a shared app's secret/reset/disable operation remains broad. The inbound webhook code uses an app secret; resetting the same app must account for it even if realtime webhook is currently disabled. Token decryption/proof/session consequences of a reset are not guessed. No blanket claim that all tokens are invalidated by app-secret reset is accepted.

**C2 setup candidate:** same business `1741597822557523`, own-business direct CAPI, Marketing API capability at a supported access tier, no capture-leads/Page/Instagram integration. Current documentation exposes use cases rather than requiring the legacy “Business” type in every flow. C09 lists both Create/manage ads and Measure ad performance with broad required **app** features. Neither is a verified narrow CRM recipe. Do not select a no-use-case empty app, add every Marketing permission, use an obsolete Other/Business tutorial or request Full access merely to get past a prompt. Exact type/use case and permitted token subset are B1/B3 closure outputs.

C01 explicitly says no App Review/permission requests for direct own-app CAPI. This supports the route; it does not prove no token scopes, unlimited users or that any unpublished app can operate indefinitely. C03 generic review/verification and limit-upgrade rules plus C10 role restrictions must be reconciled for the chosen setup. Do not publish/change the existing app or submit review in this task.

## Dedicated Employee and least-privilege contract

Proposed label: **EH Lifecycle R4**, role **EMPLOYEE**, owned by Glory Lot. New canonical ID and app-scoped ID are future outputs, never invented from existing IDs. One permanent identity is preferred; no new undeletable identity every rotation. It has no lead intake, reconciliation, website CAPI, Zapier, legacy, ad management or other business duties.

| Layer | Proposed bound / exact evidence still needed |
| --- | --- |
| System User | EMPLOYEE, not ADMIN. Avoid inherited portfolio access and user/permission administration. Do not repurpose either existing actor. |
| Dataset/Pixel | Only verified endpoint `1152399921284927`. Exact minimum **sending** task is unresolved (B1). Existing Employee's “View Pixels” / “Use events dataset” labels are observations, not upload authorization. Do not assert `ANALYZE`, `ADVERTISE`, `MANAGE` or another enum from ad-account examples. Provider must bind UI label, API task if used, and Pixel/dataset relationship. |
| App relationship | Same-business app installed for this identity (C02). C05 UI recipe says Manage app / Full control; minimum lower grant is unproved. If that full control is required, prefer C2 and restrict it to lifecycle-only app; record residual app-administration power explicitly. App installation is a mutation, not a read. |
| Sending OAuth scopes | `ads_read` is a **candidate**, not a verified CRM minimum. No current evidence establishes `ads_management`, `business_management`, `leads_retrieval`, Page or Instagram scopes as needed to send these five events. Do not request them “just in case.” Bind exact issued scope set only after B1; unexpected locked grants stop issuance. |
| Other assets | No ad account, Page, Instagram, catalogue, audience, other dataset or business-wide grant in the proposed sender manifest. Setup administrator authority is separate from sender authority. If Meta requires more, return to architecture; do not quietly add it. |
| Runtime event policy | Only `Intake`, `Not qualified`, `Lost`, `Qualified`, `Converted` under existing R4 rules. No source proves provider credentials are constrained to those names or original lead IDs; EH enforces that policy. A stolen token may inject other data into its entitled dataset until invalidation. Credential isolation cannot undo that pollution or provide separate measurement on a shared dataset. |

Exact minimum permissions are **not established**, so this is an explicit constraint matrix rather than an executable grant list. Effective access is the intersection of identity role, assets/tasks, app eligibility and token scopes; valid metadata or a dataset name alone is insufficient.

## Recovery authority and invalidation

### Preferred individual-token revocation

C02 documents versioned **GET `oauth/revoke`**, not a token-independent kill switch. Required inputs are the target token, actual issuing app ID, matching app secret and a caller token associated with that same app; the app must not be throttled/disabled/deleted. Response success and actual validity are separate evidence. No POST variant is assumed.

Propose a separately held owner recovery caller on a **different subject**, preferably the real business-admin/app-admin human, rather than a second lifecycle token or the existing CRM Admin system-user credential. C02's revoke section names no exact caller role/scope or same-subject rule; **human/cross-subject eligibility is B4**, not proven by the fact that humans can issue tokens or inspect them. Do not conflate C08 debugger caller permissions with revoke permissions. If a separate System User caller is actually required, its role, scopes, capacity and broader administrative blast radius require an amended reviewed manifest, not reuse of an existing actor.

The custodian must retain the target's protected vault version until revocation is verified; `revoke_token` cannot be reconstructed from a secret-reference name. Recovery caller and app secret must be accessible without a working EH deployment or the sending identity. An ordinary Production credential leak must not yield all recovery inputs. A vault copy of the same sending token is not independent caller authority. App-secret custody alone is insufficient to prove caller eligibility.

### Emergency identity-level/group revocation

C04 invalidates **all tokens of the specified System User**. Business Settings exposes Revoke tokens, but its confirmation was not invoked. Prefer a separately authorized human business-admin control outside the sender; bind exact UI semantics or API caller contract first (B4). API use requires the verified app-scoped ID, never a copied canonical UI ID.

Treat the entire dedicated identity across **every installed app** as the revocation domain unless Meta conclusively documents a narrower boundary. Exactly one approved lifecycle app is permitted on it. This makes cross-app ambiguity conservative without pretending the API has been tested. All active, dormant, replacement and any accidentally colocated recovery tokens are affected. Every consumer must be EH lifecycle; otherwise stop. App/user asset removal is authorization removal, not established token invalidation; user deletion is not supported (C04).

Group revocation is an emergency fallback only after owner amendment approval explicitly replaces revision 5's categorical bulk-action stop for this single proven-exclusive identity. Never revoke `100089438321765`, `61594759444572`, their app installations or managed integrations. If individual recovery is unavailable because the issuing app is restricted, human group recovery must remain independently usable; B4 must confirm that, not assume it.

## Routine rotation and validity acceptance

Keep metadata review **every 30 days**. Rotate **before the earlier of issuance + 90 days or provider expiry − 7 days**. Prefer the documented 60-day option when supported, normally making the deadline before day 53; actual issued expiry governs. If lifetime/data-access limits make that window infeasible, hold and revise. Zero/missing expiry is not automatically non-expiring.

Conditional individual sequence, with lifecycle gates closed throughout H3:

1. Recheck app/identity/grants, vault access, caller lifetime, independent group fallback and exact authorization. Record metadata/review and rotation deadlines.
2. Issue/refresh B through the selected route while A is valid; store B in protected vault staging. No plaintext shell/browser/debugger handling. Do not overwrite A's only retained recovery copy.
3. Inspect B non-event metadata and assignments through the protected mechanism below. Confirm expected issuer/subject, scopes, dates and no broadened assets. Keep B out of sender use until acceptance.
4. Obtain separate EH Production secret-switch authorization. Switch only `CRM_META_LIFECYCLE_TOKEN_EH_R4`, deploy/redeploy as required, and bind READY source/configuration with gate false/absent, destination disabled/unconfigured and cron inactive. Retire old deployment access paths; retained tokens remain controlled until invalidated.
5. Revoke A individually with independent recovery authority. Then inspect A and B independently: A invalid, B valid with unchanged metadata. A failed debugger request is **not** proof A is revoked. Provider revocation success alone is not proof B survived.
6. Record nonsecret acceptance and remove retired secret material according to vault retention policy after invalidation evidence; retain audit/version IDs. No sending resumes through this operation.

If individual invalidation cannot be established, the smallest group alternative is **contain → invalidate all A/B tokens on the one dedicated identity → verify invalid → issue fresh C → inspect/store/switch C**. Do not preissue a same-group B and claim it survives. Accept a credential-unavailable interval; before H4 this is dormancy, after H4 it is a delivery pause with existing age/deadline consequences and possible unsent losses. No manufactured backfill or uncertain replay. Two alternating dedicated identities are not selected: additional capacity, non-deletability and administrative surface are unjustified for dormant H3. They require a separate design if continuity later demands them.

After H4, the existing approved stop/epoch and prospective reactivation rules still apply. Do not reopen an epoch or restore a revoked/compromised A. On any partial switch/revocation failure keep EH contained, preserve the validity uncertainty and escalate; never describe rotation as complete.

## Compromise recovery by credential class

These are future incident procedures subject to explicit operator authority, not actions performed by this task.

| Incident | Containment, provider action and blast radius |
| --- | --- |
| Sending token stolen | Close EH lifecycle gates/stop further dispatch and remove effective sender use, preserving possible in-flight/unknown attempts. Immediately revoke the target through independent caller + app secret; do not wait for replacement. If target unavailable or individual action fails, use only the approved exclusive-group fallback. Verify invalidation and unrelated metadata/health, then independently issue replacement with gates closed. Removing Vercel secret alone does not invalidate attacker use. |
| Dedicated System User authority compromised | Treat every credential/install/grant for that identity as suspect. Freeze further issuance and inventory drift via trusted human authority; group invalidate, verify and remediate the administrative access path before reissuance. Do not assume token rotation repairs a compromised issuer/owner session. If identity can no longer be trusted, a new reviewed identity is needed; no deletion promise. |
| Recovery caller compromised | Treat authority as its full documented role/scope, potentially broader than lifecycle. Contain that operator surface, invalidate caller through independently held human administration, assess issuance/revocation/assignment changes, and replace only from a clean authority. Do not use the compromised caller to certify its own recovery. Caller invalidation semantics and any effect on sending tokens must be bound under B4. |
| Issuing app secret compromised | Treat all app tokens/proofs and recovery operations as affected, even if only one token theft is observed. C1 requires impact-aware coordinated intake/other-app-consumer recovery; no isolated app-secret reset guarantee. C2 contains app-level recovery to lifecycle if exclusivity is proven, but business-admin compromise can still cross apps. Separately authorize app-secret reset and required token reissuance after provider semantics are confirmed; do not assume reset alone revokes all tokens. Preserve unrelated integrations. |

If only a shared/unknown recovery action remains, maintain EH containment and escalate urgently to the owner/provider for impact-aware incident authorization. This is an unresolved provider-compromise state, not incident closure. No recovery procedure clears `unknown` attempts, changes event truth, replays frozen deliveries or transfers ownership to legacy.

## Secret custody and protected operator mechanism

Maroine EL Forssa remains accountable owner/custodian. A backup human may be nominated; none is invented. The operator/reviewer task roles remain separate even with one accountable human.

| Credential class | Storage/access boundary | Review, rotation and emergency use |
| --- | --- | --- |
| Sending token | Protected vault version; only active version delivered to server-only Production Vercel `CRM_META_LIFECYCLE_TOKEN_EH_R4`. No Preview/Development/local `.env`, database row, CI or browser client. | 30-day metadata review and deadline above. Vault retains superseded target solely for bounded revocation/verification. Runtime has no recovery-vault read permission. |
| Issuing app secret | Owner-controlled encrypted recovery vault item outside EH runtime, separate ACL and MFA-protected operator access. C1 may already require the same app secret for inbound runtime: this shared exposure cannot be undone by storing another copy externally. C2 avoids that coupling. | Review access/state every 30 days, rotate on suspected exposure and under provider/owner-approved app recovery; no unsupported 90-day provider mandate. Independently authorized retrieval only; never open it during architecture. |
| Recovery caller | Separate vault item/subject; app-bound eligibility and least authority pending B4. Not on the sending identity, in EH runtime or reused from intake. | Record actual expiry/data-access constraints; review every 30 days and renew before loss of recovery readiness, with a bound lead time no later than expiry minus 7 days when feasible. Shorter-lived just-in-time human route must have proven timely reacquisition and independent emergency fallback. |
| Inspection credential | C08 associated app access token **or** app developer user token, held only on protected operator surface. May avoid a separate persistent item if safely derived/issued under the approved app authority; not assumed interchangeable with recovery caller. | Treat as secret; no browser debugger/Graph Explorer. Expiry and authority metadata reviewed with recovery readiness. |
| Human recovery authentication | Owner's existing protected business/app administration, MFA and recovery outside EH runtime and sending group. | Verify access nonsecretly before provisioning and on monthly review. Owner access/session compromise triggers broader business incident handling; app separation cannot protect against that. |

**Proposed execution surface, not implemented:** an isolated owner/operator process outside the EH app/CI, obtaining approved vault versions directly into memory. Fixed Meta host/version/endpoint allowlist; TLS verification, no redirects, no browser history/clipboard, no request/response dumps, no URL logging, tracing/APM, shell arguments/history, process-environment export, swap/core-dump retention or proxy access-log leakage. Output a strict nonsecret projection and fixed failure codes only. GET query secrets for `oauth/revoke` and `debug_token` must remain inside that protected transport boundary; never paste documentation curl examples. This does not invent POST support. Provider necessarily receives the credential; a no-secret-to-provider requirement would make these documented APIs unusable.

Exact host/runtime/vault product, ACLs, logging exclusions and transport review are an **unbound implementation prerequisite**. If the environment cannot ensure this handling, do not execute. A later bounded implementation may build this standalone operator utility, with synthetic secret-leak and no-event tests; it is not an EH runtime feature or authorization to implement it now. Existing browser credential entry must use human takeover.

Audit only approval/artifact IDs, operator, UTC and local time, business/dataset/app/subject IDs, role/task/scope names, vault version references, issuance/expiry/deadlines, coarse validity/revocation result and sanitized provider reference if safe. No token prefixes/suffixes, token hashes, app secrets, raw URLs/headers/responses, screenshots containing credentials or customer records.

## Non-event verification design

Use C08's documented `debug_token` mechanism through the protected operator surface, not the browser Access Token Debugger. A sending token pasted into a browser becomes a client-exposed Production secret and is unsuitable under EH custody policy. Never generate a disposable credential or call `/events` to settle architecture.

| Fact | Future acceptance evidence and limitation |
| --- | --- |
| Token type and issuer | Bound issuance record through System User route + debug `app_id` + user-ID mapping to the new Employee. Displayed `type`, if any, is supplementary, not a field/enum guaranteed by the inspected v26 reference. Do not infer System User solely from token prefix or absence of Page fields. |
| Subject | Map canonical Business Settings ID to app-scoped API ID using approved nonsecret admin metadata (C04). Record mapping/issuer explicitly; do not compare unlike IDs or call revocation on guessed ID. |
| Expiry | Record `issued_at`, `expires_at`, applicable `data_access_expires_at`, chosen lifetime and documented semantics. Missing/contradictory fields fail acceptance; confirm non-expiring status rather than guess. |
| Permissions/assets | Debug scopes/granular scopes plus separate authorized assignment/installed-app readback, role and proven dataset/Pixel mapping. An absent granular target list is not proof of no other assets. B1's official permission/task contract is required; metadata does not prove a successful event. |
| A invalidation / B survival | Bind exact vault versions, successful revocation response, authenticated inspection returning A invalid and B valid under unchanged app/subject/entitlements. Transport errors, caller expiry, app outage or generic auth failures are inconclusive. Inspect with independent valid authority; no event probes. |
| Group recovery | Verify every inventoried pre-revoke lifecycle version invalid; reconcile issuance/audit inventory and caller independence. If new/unknown tokens may exist due to authority compromise, resolve provider group semantics and compromised issuance path; checking only known A is insufficient. |

Metadata acceptance never claims CRM recognition, receipt or optimization readiness. Those remain separately authorized H4 outcomes. No custom permissions broadened just to read a token with itself.

## Blast-radius proof before implementation and before issuance

Prepare an inventory using nonsecret app/user IDs, installed-app and asset assignments, owner attestations tied to configuration/vault references, provider audit metadata, and read-only integration configuration. **No existing token value is needed.** Fresh creation under controlled custody is prospective evidence of exclusivity, not proof that a display name is unique.

| Protected integration | Required disjointness proof |
| --- | --- |
| Existing CAPI `100089438321765` / managed app `6490032931025859` | Keep identity, app, assignments and all credentials untouched. New canonical/app-scoped IDs must differ; no shared group operation. |
| English Hills CRM Admin `61594759444572` / intake and reconciliation | Preserve identity, app grants, webhook/lead retrieval references and health. No current token used as recovery caller. C1 explicitly shares app-level risk even with separate users; C2 must have a different app ID. |
| Zapier and legacy lifecycle Sheet/script/workflow | Establish they receive no new lifecycle secret and use no new lifecycle identity; for C2 also exclude the new app. For C1, inventory any shared-app consumers while proving that their credentials remain outside the dedicated identity and target-token revocation domains. Existing exact token mapping may remain unknown if proven entirely outside the newly created domain; uncertainty about consumer membership stops issuance. No token export or H4 source census required. |
| Website CAPI / other Meta integrations | Owner/configuration inventory confirms no reuse of the new user/sending-vault references, no C2 app reuse, and no app-wide change to existing senders; record C1 shared-app consumers explicitly. Same dataset is permitted but does not isolate event pollution. Do not assume website CAPI exists or map it to the managed actor without evidence. |
| Recovery/inspection authority | Outside sending group; not consumed by unrelated services. Record wider business human/admin authority honestly, with exact emergency invalidation path. |

Before each mutation and monthly review, compare approved manifest with current assignments/installed apps/custodians and issuance ledger. Unexpected apps, assets, credentials or consumers stop further issuance/use. Post-operation verification uses nonsecret configuration and existing passive health/aggregate signals, not lifecycle events or customer exports. App ownership alone, a fresh token value, a new vault name or an empty token list is not proof of isolation.

## Exact revision-5 amendment boundary

Do not edit the historical approval quote or relabel revision 5 as Option C. This proposed revision 6 supersedes only the following statements **after** provider closure and explicit owner acceptance of a reviewed revision:

| Revision-5 location / assertion | Proposed change |
| --- | --- |
| Owner clarification / “No H3 package evidence blocker”; exact remaining blocker closed | Record A conclusion and Option C blockers; route availability is not recovery readiness. |
| Authentication compatibility / dedicated direct token description | Substitute selected owned-app + dedicated Employee token only after binding; retain multipart, token-free payload and all transport/time controls. If event proof is required, stop for a separate transport/storage amendment. |
| Credential provisioning route and no custom app/actor use | Replace Events Manager without-DQA issuance with selected app/Employee manifest, independent caller/app-secret custody and verified scope/task. Never reuse existing actors; DQA remains untouched. |
| Issuance metadata row and later-only issuer/entitlement outputs | Bind approved planned app/role/minimum grant/recovery domain before issuance; actual new IDs/token expiry and readback remain gated operator outputs. |
| Token-specific-only recovery and stop on all bulk actions | Prefer individual revocation; permit explicitly approved all-token invalidation **only on the new exclusive lifecycle identity**, with same-group replacement loss and downtime stated. |
| Production-only secret storage | Runtime still gets only sending secret. Add separate protected recovery authority outside runtime; no new recovery env vars. |
| Approved credential route row, remaining external actions, H3-01/H3-05 and final implementation-contract route | Add dated amendment reference and new ordered operator prerequisites; historical owner decision stays intact. H3-06 disabled binding remains separate, after H3-05 acceptance. |

Preserve exact names `Intake`, `Not qualified`, `Lost`, `Qualified`, `Converted`; occurrence/singleton/ordering rules; lead-ID-only matching; `v26.0`; dataset `1152399921284927`; provider contract UUID `7cf9833e-4f77-4335-b1ec-c047d9353f54` / key `eh_meta_crm_r4_v26_r1`; multipart; strict exported seconds; age/retention; no-uncertain-replay; D2/privacy and actual stops; immutable H3-04 seed; unconfigured/disabled destination; absent/false server live gate; inactive lifecycle cron; H4 separation. No changes to existing migrations, contract constants or staff permissions.

## Future bounded implementation and operator sequence

Every step requires its predecessor's recorded acceptance. No step is executed by this architecture task. Account preflight may establish nonsecret facts only; it cannot test issuance or revoke to discover eligibility.

| Step | Boundary and authority | Completion / stop |
| --- | --- | --- |
| 1. Final architecture | Close B1–B5, independent exact-SHA review and explicit owner approval of revision/app/grants/recovery/custody. | No implementation until approved; no inherited PR #51 issuance authorization. |
| 2. Account preflight | Read-only: business/app eligibility, exact available capacity, ownership, no restrictions, existing health, new-domain inventory and operator authority. | Stop on drift/capacity ambiguity. Any required feature upgrade/publication returns to approved scope. |
| 3. App arrangement | **Meta mutation, explicit operator authorization** for C2 creation/business association/use case or any C1 change. App-secret access separately authorized. | Exact app ID/status/features; no shared setting/secret reset. No event tests for review. |
| 4. Dedicated Employee | **Meta mutation, explicit authorization** to create exactly one named EMPLOYEE; no existing actor edits. | Record canonical/app-scoped mapping/capacity. Preserve identity if partial failure; no delete/recreate loop. |
| 5. Minimum assets/app | **Meta mutations, explicit authorization** for exact approved dataset task/app grant/install only. | Read back manifest; unexpected locked scope/asset requirement stops. |
| 6. Independent recovery | **Credential/security mutations and secret access require explicit authorization.** Establish vault/operator authority, confirmed caller and group fallback independent of sender. | No sending-token issuance until recovery is operable under approved prerequisites; provider validation mutations separately enumerated. |
| 7. Credential issuance | **Meta mutation, explicit authorization** for one dedicated token using approved scope/lifetime. | Protected custody and nonsecret issuer/subject/expiry record; no event call. |
| 8. Production sending storage | **Vercel/Production mutation, separate approval** for sending secret only and required dormant deployment. | Verify correct project/Production target and protected version; recovery secrets stay out. |
| 9. Non-event acceptance | Explicit protected-token-inspection authorization; **any issuance/revocation rehearsal is a Meta mutation requiring its own named-token approval**. | Metadata + approved individual/group recovery acceptance; no `/events`. If actual recovery demonstration is required, use only EH credentials and preserve dormant state; no disposable experiment in architecture. |
| 10. Dormancy verification | Authorized read-only operator evidence: one existing contract, no configured/enabled destination or new activation inventory, inactive cron, gate closed, healthy intake. | Stop on any unexpected attempts/inventory. Preserve uncertain history; do not clear it. |
| 11. Independent H3-05 acceptance | Separate task/session checks exact manifest, custody, verification evidence and exclusions. | H3-05 complete only on actual evidence; no H3-06 binding or H3-07/08 overall acceptance bundled. |

H3-06 later binds the disabled destination through its existing guarded configuration contract; no seed/connection write here. H3-07/08 and H4 remain separate. Failure recovery leaves partial nonsecret records, gates closed and operator-owned cleanup explicitly approved. Never remove existing integrations, lower access protections, fabricate test traffic for quotas or silently expand scopes.

## Provider blockers and closure evidence

These are concrete architecture blockers, not missing future token values. Resolve through current official documentation or account-specific **engineering** confirmation with a recorded case/reference and provenance. Support AI alone cannot promote an inference to a verified entitlement. No support message is authorized by this draft.

| ID | Required fact / exact closure question | Current result |
| --- | --- | --- |
| B1 | For own-business Employee sending lead-ID CRM events to `/v26.0/1152399921284927/events`, what exact OAuth scopes and Pixel/dataset task (UI label + API enum if used) suffice for the five named stages? Are Page/ad-account/Instagram grants unnecessary? Does the selected app issue this subset without locked extras? What minimum app role/install is supported instead of Manage app, if any? | Unresolved; web-event scope text, generic assignment recipe and existing Admin grants do not answer it. |
| B2 | Can Glory Lot create one more Employee while the CAPI Employee and CRM Admin remain untouched? Does managed CAPI count toward its quota, what exact current quota applies, and is an approved increase needed? | Unresolved. Limited-tier app and existing Employee observed. Standard/Advanced table is evidence of a risk, not proof of current inability or permission to upgrade. No new app is assumed to reset quota. |
| B3 | Which minimal supported new-app type/use case and feature level permit this own-business CRM route? Can current C1 In development/Unpublished or proposed C2 status perform ongoing sending? How does the direct no-review exception apply to generic system-user review/verification and role restrictions? Any publication/verification/review actually required? | Unresolved exact-account contract. New-app app-feature bundles are documented; token minimum is not. |
| B4 | Does `oauth/revoke` accept a separately held real business-admin/app-admin user caller for another System User's token of the same owned app; what exact roles/scopes/app/business state apply? Which independent authority invalidates the dedicated group if sender or app is compromised/restricted? Confirm group boundary, canonical/app-scoped mapping, caller invalidation and non-event A-invalid/B-valid checks. | Mechanisms documented; precise independent caller eligibility and fallback authority not bound. No self-caller assumption or second recovery System User approved. |
| B5 | Bind safe issuance/revocation/inspection process and vault ACLs; confirm GET handling without browser/client/log leakage and independently available recovery custody. | Architecture constraints defined; actual operator surface/implementation not bound. Requires an owner/operator surface decision and a bound future synthetic validation contract, not implementation or secret experiments during architecture. |

C2's default app-creation quota rule is documented (15 unverified-business apps with developer/admin roles); account-specific business verification/app eligibility must be confirmed in preflight. No additional ad account, Page or Instagram account is planned, so no capacity-consuming creation for those assets is justified.

## Owner decisions required

| Question / options | Recommendation and consequence | Blocking status |
| --- | --- | --- |
| C1 reuse shared app vs C2 dedicated lifecycle app? | Prefer **C2** if B1–B4 establish a supported bounded setup: isolates app-secret/full-app authority from intake. C1 is smaller but requires explicit acceptance of shared app-level incident coupling and a supported assignment model. Neither chosen for execution today. | Blocking after provider facts; cannot approve unknown scopes/status/capacity by preference. |
| Individual preferred + exclusive-group emergency fallback vs group-only routine recovery? | Prefer individual plus fallback with independent authority. Accept group-only only if individual eligibility cannot be established and owner explicitly accepts invalidate-before-reissue downtime. | Explicit amendment to revision 5 required; B4 first. |
| Protected external operator vault/process vs EH runtime recovery? | Select external protected surface; runtime recovery is not recommended and outside this proposal. Name the actual vault/host/ACL and access continuity before implementation. | B5 and owner acceptance required. |
| If extra capacity/publication/broad grant required: commission separate bounded assessment vs hold H3-05? | Hold until necessity and impact are documented; no automatic upgrade/grant. | Decision only after exact provider requirement; no speculative mutation. |

No new migration/product/privacy decision is requested. Owner approval must record date, exact plan revision/head, selected app arrangement, permission/task manifest, revocation granularity, custody and downtime acceptance. That approval still does not authorize Meta/Production mutations; the future release/operator contract must list exact actions and targets.

## IMPLEMENTATION CONTRACT

- **Current authorized output:** documentation-only proposed revision 6 and dated evidence; additive ADR/current-state/navigation links. No code, migrations, test/CI changes, account mutations or credential operations. Migration filenames: none; existing 106 is immutable.
- **Status:** OPTION C ARCHITECTURE BLOCKED by B1–B5; no final executable issuing-app/least-privilege contract. Do not treat this draft as approval or a provisioning runbook. Research authorization comes from PR #60; architecture/implementation approval is absent.
- **Future scope only after closure/review/approval:** exactly one EH lifecycle Employee, selected owned app, verified minimum grants/install, separate operator recovery surface and sending-token custody. Every new object/credential/operation must appear in the approved manifest. No existing identity reuse or shared revocation; unexpected scope/state/capacity demands stop.
- **Application/database impact:** none expected for token-only sending; current adapter/worker/server already consume the dedicated sending secret. No SQL/schema/RLS/contract change. If provider mandates event-request proof or extra runtime credentials, stop for a separate reviewed transport/storage amendment; do not reuse inbound app secret. API issuance proof is operator-side and does not imply event proof. Standalone protected recovery tooling needs its own bounded implementation/review before use.
- **Acceptance:** authoritative B1–B4 closure; bound B5 surface and the future synthetic test contract for credential disclosure/no-event egress; nonsecret app/identity/asset/consumer inventory; fresh exact-SHA review and owner architecture approval. Actual standalone utility implementation and its synthetic tests follow in the separate authorized implementation task, before any credential handling. Later operator acceptance verifies metadata, actual recovery and unrelated passive health while all lifecycle gates stay closed. Missing actual future IDs/expiry are operator outputs; missing permission/caller contracts remain architecture blockers.
- **Stop conditions:** any unresolved blocker, wrong business/dataset/subject, ambiguous app-scoped mapping, drift or unrelated group membership, insufficient independent authority, unexpected app/scope/proof/publication/capacity requirement, exposed secret/unsafe tooling, failed or inconclusive invalidation, unexpected lifecycle inventory or attempted H3-06–08/H4 work. Never replace fact closure with credential/event experimentation.
- **Recovery/rollout:** use the separate architecture → owner approval → implementation/CI → exact-SHA independent review → human release approval → operator → verification flow. Preserve partial results and inherited holds. No merge/deployment authorized by this author task; no reviewer subagent or independent-review verdict from the author.
- **Documentation validation/handoff:** relative links/anchors, source accuracy/provenance, secret/PII absence, docs-only diff and `git diff --check`; one focused author self-check. Open documentation-only PR and wait for unchanged required CI; record head/base/tested merge and run results in PR handoff. No local application/database suites for Markdown-only work. Even if CI passes, report **Tier 3: OPTION C ARCHITECTURE BLOCKED** while B1–B5 prevent a safe final design.
