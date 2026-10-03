# Owner summary

> **4A preparation — 2026-10-03:** the owner's direct commission records S4-P1 owner-approved and merged at PR #70 / `478d898ecf1f31d052e48f65e37a9f7caa58809c`. [4A-OP1 operator packet](crm-h3-05-revision-7-4a-operator-packet.md) prepares one isolated C2 create/noncredential readback and STOP, preserving permanent Employee `61594989243533`. Exact flow and ledger/operator/window bindings remain required; 4A/4B/4C NOT AUTHORIZED. No credentials, Meta access/mutation or new accepted state. This is branch preparation, not packet adoption or action approval; older S4-P1 status below is historical.


> **Step 4 preparation — 2026-10-03:** [S4-P1 created-object packet](crm-h3-05-revision-7-step-4-created-object-preparation.md) prepares noncredential C2 creation/readback → STOP → separately reviewed exact-target association/dataset grants, reusing permanent Employee `61594989243533`. Dataset task requires post-C2 nonsecret readback; C2 creation requires a distinct write-ahead one-submit ledger. Its narrow proposed reporting clarification preserves PREFLIGHT VERIFIED NO pending explicit review/owner adoption; B5/inspector and credential gates remain. This is preparation only, not Step 4 execution, credential A authority or an amendment already adopted. Historical bundled Step 4 wording below does not authorize A or renewed Employee creation.

> **B2 execution closeout — 2026-10-03:** owner-approved Revision 7 (PR #64), B2-1 (PR #67) and OP-1 (PR #68) retain their recorded scope. [Later frozen execution evidence](../evidence/crm-h3-r7-b2-execution-closeout-2026-10-03.md) changes current B2 from INCONCLUSIVE to **PASS**: the actual permanent **EH Lifecycle R4 Employee**, canonical ID **`61594989243533`**, role **EMPLOYEE**, business **Glory Lot / `1741597822557523`**, was created by the one authorized submission. This exact identity is the permanent Employee selected here; the earlier suggested label and future-ID wording below are historical. Preserve it; no replacement or further lifecycle Employee creation is authorized. The allowance is permanently consumed. Step 3 remains historically READ-ONLY PRECREATION PREFLIGHT BLOCKED / B2 INCONCLUSIVE. Full PREFLIGHT VERIFIED: NO; C2/installation/grants, B1 actual authority, B5 custody/inspector, credentials/recovery and Production/H3-06–08/H4/sending remain unresolved or held. A separately authorized created-object / Step 4 sequence may be next; this closeout neither authorizes nor changes that sequence. No Meta access/mutation occurs in this task.

> **2026-10-03 proposed B2-only amendment B2-1:** after merged Step 3 at `78153eb2504f4eb33b3d2d35a1b8efa209940930`, [one intended Employee creation contract](crm-h3-05-revision-7-b2-amendment.md) proposes a separately authorized single submission for **EH Lifecycle R4 Employee**, preserving it permanently on verified success and stopping without retry on denial/ambiguity. This is not approved or mutation authorization; B2 remains INCONCLUSIVE. On exact-revision owner approval only, B2-1 supersedes the capacity-before-mutation requirement for this isolated create action and the bundled Step 4 creation sequence below. Its conditional ordering does not assume C2-independent completion; app prerequisites stop for a separate decision. Step 3 evidence and all other Revision 7 gates remain unchanged.

> **2026-10-03 Step 3 read-only commission:** following merged Step 2 / PR #65 at `e0f74766f36b5881a11defd38ad2960170cb0458`, the owner authorized only bounded account inspection and documentation. [Step 3 dated precreation evidence](../evidence/crm-h3-r7-step3-preflight-2026-10-03.md) records account BLOCKED on materially inconclusive B2 capacity, with currently knowable B3/human access PASS. Nonexistent-object facts are deferred; unresolved B5/inspector readiness blocks credentials rather than this limited result. No Step 4, credential, event or Production action is authorized. Historical proposal/commission-draft statements below and in Step 2 remain dated evidence.

> **2026-10-03 owner approval / Step 2:** the owner explicitly approved this Revision 7 as merged in PR #64 (`bf295c304e3a4f4361b25b2a852c66ae7091a857`) and commissioned Step 2 preparation only. [Approval scope and protected preparation contract](crm-h3-05-revision-7-step-2-preparation.md#approval-and-evidence-boundary) supersede the proposal/unapproved status statements below; original design reasoning remains historical. No Meta/operator/Production or merge/release authorization follows.

## What will change

**Proposed H3 credential architecture amendment — Revision 7, 2026-10-03 (Asia/Shanghai). Tier 3. Not owner-approved, implemented or operationally verified.** Baseline main: `ffd06e5a669a51a8b2934dbf648d1d2214f40606`, merged [PR #63](https://github.com/elforssa/english-hills-admin/pull/63). Risk is credential authority, provider integration and compromise recovery; the task is documentation only.

**Revision 7 selects C2 as its proposed design**, rather than merely preferring it: one new business-owned lifecycle-only app and one new dedicated `EMPLOYEE` System User. Select exclusive System-User-wide token invalidation as primary recovery, with invalidate-before-reissue downtime. Selection in this proposal is not owner approval or provisioning permission.

Replace the provider-answer dependency with defined, fail-closed acceptance contracts. B1 and B4 are **architecture contract defined; pending owner approval**, with account-specific effective authority and demonstrated recovery deferred to mandatory credential-acceptance gates. No Meta support or attributable engineering response is required for architecture approval, implementation preflight, credential acceptance or recovery acceptance. Such responses are optional supplemental evidence only.

## What staff/users will be able to do

Nothing new now. A separately authorized operator can later establish an isolated credential and rehearse its recovery before any Production storage or activation. Architecture approval does not certify a credential. Administrative entitlement acceptance does not certify successful event delivery.

## What remains restricted

No support contact or questions; no app/user creation or modification, asset assignment/removal, app install/uninstall, tier/status change, credential generation/reading/copying/revocation or app-secret access in this task. No Test Events, lifecycle `/events` call, Vercel environment change, Supabase/Production mutation, migration, H3-06 destination configuration, lifecycle cron, live gate, H3-06–08 or H4 execution. No Yearly/Apps Script/Zapier modification or retirement. Future steps below require their own exact-action Tier-3 authorization.

## UI impact

No EH UI or recovery endpoint. Future protected human/operator Meta controls remain outside EH. No automated browser/agent may capture a credential-bearing issuance/debugger screen; approved human takeover and a protected transfer mechanism must be bound before issuance.

## Database impact

None. No migration expected or allocated. [Migration 106](../../../supabase/migrations/106_crm_lifecycle_provider_contract_r4_seed.sql) and contract `eh_meta_crm_r4_v26_r1` remain immutable. No database credential registry or event fixture is introduced.

## Important security decisions

The new identity and app have only EH lifecycle responsibility. Recovery uses independently accessible MFA-protected human control outside the runtime, not the sender token, a second token of that identity, or an assumed human-to-System-User API caller arrangement. Revoke every token of the dedicated identity before issuing a replacement. Uninspectable authority or unprovable invalidation rejects the credential.

No synthetic event is selected for execution: the documented Test Events facility is not an established measurement sandbox. Use non-event entitlement acceptance plus recovery rehearsal; successful sending remains explicitly unverified until separately approved H4 use. The owner must accept that limit, not a claim of successful CAPI delivery before any send.

## Risks / owner review points

C2 separates app-secret/app-administration incidents from the existing intake app, at the cost of another app's administration and custody. It does not isolate the shared business administrators or dataset measurement from compromise. A stolen entitled token can pollute the dataset; EH's five names and original-lead-only restriction are application safeguards, not proven provider token restrictions. Account limits or unsupported setup may still prevent execution. Recovery downtime is deliberate; do not preissue a replacement that revocation will destroy.

## Authority, current evidence and historical precedence

The owner's direct request on 2026-10-03 explicitly commissions this documentation-only Revision 7 and removes Meta support/engineering as a mandatory dependency. It does **not** approve this proposed design, its residual delivery uncertainty, implementation, merge/release or any operator action. Architecture approval record: **none**. Operator approval record: **none**. Record future approval against the exact reviewed plan commit and decisions below before commissioning implementation.

[PR #63's research](../evidence/crm-h3-b1-b4-research-2026-10-03.md) remains correct: public documentation did not establish the precise account-specific grant and independent API caller contracts. Its content is retained unchanged. [Revision 6](crm-h3-05-option-c-amendment.md), [its evidence](../evidence/crm-h3-05-option-c-2026-10-03.md), [recovery revision 1](crm-h3-05-credential-recovery.md) and [approved revision 5](crm-h3-technical-readiness.md) retain historical status and findings. Revision 7 proposes changing what evidence suffices, not manufacturing answers to those questions. Its [evidence/decision ledger](../evidence/crm-h3-revision-7-validation-2026-10-03.md) separates facts from design judgments.

Upon exact-revision owner approval, this plan supersedes only: the direct managed issuance route; advance provider-answer closure of B1/B4; preference for individual revocation; issue-before-revoke continuity; and the categorical bulk-action stop **for this new proven-exclusive identity only**. All earlier shared-user/bulk-action prohibitions remain. Until then H3-05 stays stopped before issuance. Proposed architecture is ready for review and owner decision, not blocked on a provider reply; it is not yet ARCHITECTURE APPROVED.

Inherited [H3-04 acceptance](../evidence/crm-h3-04-production-2026-10-02.md) records ledger 001–106, disabled/unconfigured destination, absent/closed server live gate and inactive lifecycle scheduler. This task performed no new Production/account inspection. Repository [adapter](../../../src/lib/crm/lifecycle/adapter.mjs), [worker](../../../src/lib/crm/lifecycle/worker.mjs) and [server](../../../src/lib/crm/lifecycle/server.js) implement token-only multipart, strict seconds and separate live gates; they implement neither operator recovery nor a synthetic sandbox.

## Three evidence classes

| Class | Establishes | Does not establish |
| --- | --- | --- |
| 1 — official Meta documentation | Supported general own-app/System User issuance, asset assignment and identity-wide invalidation mechanisms; provider payload/receipt contract | Exact grants, available controls or caller eligibility for this particular new account identity |
| 2 — authenticated read-only account inspection | Actual business/app relationship, roles, grants/tasks, scopes, metadata, visible recovery controls and inspectable effective assets | Successful event delivery, actual invalidation or safety of an unexplained mutation control |
| 3 — separately authorized bounded empirical validation | Account-specific behavior absent from documentation, such as revoking credential A and verifying invalidity before B exists | Unbounded permission discovery, proof about unrelated identities, or permission to activate H4 |

Each future record includes class, source/control, date, operator, exact nonsecret target IDs, observed result and limits. Optional Meta support/engineering material is assessed for provenance but is never a gate. No required support question or research/support loop remains. Failure of validation produces a local stop and evidence-backed correction/amendment, not a requirement to wait for support.

## C2 object and responsibility manifest

| Object / boundary | Selected design |
| --- | --- |
| Owning business | Glory Lot `1741597822557523`; verify ownership at preflight |
| App | Exactly one **new lifecycle-only business-owned app**; actual ID is an execution output; supported own-business CAPI capability/tier, no unrelated responsibility |
| System User | Exactly one **new `EMPLOYEE`**, suggested label EH Lifecycle R4; actual canonical/app-scoped IDs are execution outputs; exactly this one approved app installed |
| Dataset/Pixel | Only endpoint `1152399921284927`; verify Pixel/dataset relationship and task semantics; never substitute a navigation ID |
| Excluded assignments | No Instagram, other datasets, catalogue or audience. No Page or ad account by default. A demonstrably required EH Page/ad-account assignment must stop for a separately reviewed exact-target amendment and owner approval; it is not silently permitted by this selection. Unrelated assets are unacceptable |
| Excluded duties | No inbound lead retrieval, reconciliation, website CAPI, Yearly, Apps Script, Zapier, ad management or other business responsibility; no unrelated consumer or recovery caller on the identity |
| Existing assets | Do not reuse/change users `100089438321765` or `61594759444572`; do not change custom app `1069638329182835` merely to support C2 |

C1 remains a documented alternative only if the owner accepts shared app-level incident coupling in a new explicit selection/amendment. Its dedicated Employee can isolate ordinary identity revocation, but shared app-secret changes/restrictions can affect intake. C2 is selected because this coupling is avoidable and no modification of existing app settings is needed for the proposed isolation model. C2 does not promise narrower OAuth scopes or reset user quotas. C1 is never an automatic fallback after C2 fails.

## B1 effective-authority acceptance contract

**Architecture closure:** approving the bounded manifest, layer-by-layer inspection, acceptable residual authority, evidence limits and fail-closed response below closes B1's design question. A globally exact/minimal OAuth combination in advance is unnecessary. **Execution gate:** credential acceptance still requires an actual coherent, inspectable manifest; no token is accepted by this document.

Inspect these distinct layers before issuance where visible and re-read them after issuance and again for replacement B:

| Layer | Required observation and acceptance |
| --- | --- |
| App/use-case capability | Supported own-business CAPI setup, business ownership, access tier/status and event-proof settings. App features offered in a wizard are not token grants |
| System User role | `EMPLOYEE`, no inherited Admin/portfolio-management authority. Setup human's administration is not sender authority |
| Installed/assigned app | Exactly selected new app; record installation and app tasks. Full control of that lifecycle-only app, if required by the supported setup, is a disclosed residual app-level risk; it cannot reach the existing intake app |
| Asset grants/tasks | Exhaustive assigned asset inventory plus actual dataset/Pixel task/UI permission and applicable API mapping if exposed. Read/analytics-only access does not establish administrative event-upload entitlement. Do not invent an enum from ad-account examples |
| Token metadata | Protected non-event inspection establishes valid status, selected issuing app, dedicated subject and mapping, issuance/expiry/data-access limits and proof requirements. Missing expiry is not automatically unlimited lifetime |
| OAuth scopes/grants | Record exact issued scopes and granular target grants. Do not equate a broad scope name to effective asset authority, nor assume empty scopes or `ads_read` alone suffices. No speculative or trial-and-error grant escalation |
| Effective authorization | Reconcile the above with the full accessible-asset inventory and human/operator assignment record, including pagination, inherited access and scope-dependent powers. Only approved lifecycle app/dataset authority may remain. Navigation visibility alone is insufficient; denied metadata reads do not prove absence of access |

Document the reason each granted power remains within this manifest. A grant which can administer unrelated assets/users or expand business permissions is outside the boundary even if today's assigned-asset list is small. `business_management` is not accepted merely because the identity is Employee; if its management authority cannot be demonstrably bounded to the approved lifecycle responsibility, reject it. Unexplained locked grants, conflicting views, incomplete inventories or uninspectable effective authorization fail closed. Do not demand mathematical proof that no smaller scope set exists.

Reject ADMIN, unrelated Page/Instagram/ad-account/dataset access, uncontrolled business management, changes to existing integrations, unexpected event-request proof requiring runtime changes, or any material boundary expansion. Stop before accepting/storing the credential; contain already-created credentials under the preauthorized incident/recovery scope. A corrected manifest within the same boundary needs updated evidence; changed boundaries require architecture review and owner approval. Never issue/send repeatedly while adding permissions until something works.

### Sending-authority evidence and rejected synthetic probe

**Read-only metadata/configuration cannot prove successful CAPI sending.** It can establish valid identity, administrative upload entitlement and bounded effective authority when the views are sufficient. Recovery rehearsal proves revocability, not event delivery. The separate delivery-proof field must remain **NOT VERIFIED** at CREDENTIAL ACCEPTED and DORMANT INTEGRATION ACCEPTED.

The narrowest candidate event probe would be one synthetic/non-customer event, no real CRM opportunity, before activation, through protected operator tooling with server live gate closed, scheduler inactive and H4 unauthorized. The expected receipt would be HTTP 2xx, no provider `error`, numeric `events_received === 1`, plus isolated test receipt tied to that one event/target; neither `success:true` nor an error proves sending success. No retry, permission escalation, alternate identity or second event would be allowed; any timeout, ambiguous receipt or unexpected authority/provider behavior would stop the probe.

**That candidate is rejected under this revision.** The inherited official [Using the API evidence H3-P2](crm-h3-technical-readiness.md#revision-1-official-sources) states test-coded events can affect measurement/targeting. A synthetic value, `test_event_code`, unmatched identifier, non-optimization stage or `opt_out` is not established isolation from all measurement effects. A made-up decimal lead ID cannot stand in for an original Instant Forms identity. A separate dataset would violate this credential's boundary and would not prove authority on `1152399921284927`. No supported non-ingesting validation mode for the exact CRM request is established. Therefore no synthetic or Test Event probe is an allowed operator step, and this proposal does not imply one is harmless.

**Selected alternative acceptance approach:** accept a dormant credential only on sufficient non-event effective-authority evidence plus the mandatory recovery rehearsal, with successful sending explicitly unproved. Validate serialization/gates/receipt handling locally against synthetic mocks, without network effects. If effective upload entitlement itself cannot be inspected sufficiently, fail credential acceptance; this alternative cannot waive ambiguous authority. Missing actual delivery proof alone is an accepted uncertainty only if the owner approves this approach.

At a later separately designed and authorized H4 launch, the first genuine eligible original-lead event may establish actual sending. It is ordinary authorized Production disclosure, **not a disguised synthetic acceptance probe or H3 action**. H4 must bind its source/privacy/producer/epoch constraints, bounded launch observation and stop controls before opening any gate; no customer record may be created or modified to manufacture that event. Expected receipt is the existing adapter contract above; it proves receipt only, not matching/attribution/optimization. Authentication/permission failure contains further sending and reopens credential acceptance; ambiguous receipt retains no-uncertain-replay. No trial-and-error scope expansion or repeated probe is allowed. If the owner requires actual delivery proof before accepting any dormant credential, do not claim this alternative meets it: a separately reviewed demonstrably isolated validation design is required, without a mandatory support reply. This is an explicit owner decision, not an unresolved request for Meta to define scopes.

## B4 exclusive identity-wide recovery contract

**Architecture closure:** approve human-controlled invalidation of every token of the new exclusive identity, its downtime and the mandatory initial rehearsal. **Credential gate:** actual independent authority, correct target, verified invalidation and safe reissuance must pass rehearsal before credential acceptance. The documented general mechanism plus measured account behavior can suffice; a provider answer about API callers is not required.

Primary recovery uses the **actual available Meta account control for revoking all tokens of the dedicated System User**, exercised by the authorized human outside EH. An observed button is a preflight fact, not proof of successful revocation. Before issuance bind its exact target/semantics and whether invoking it is immediately mutating. Do not click ambiguous controls for discovery. No API DELETE recipe, human-to-System-User caller eligibility, app secret or additional recovery token is assumed. An API substitute would require a separately reviewed protected operator contract; it is not an automatic fallback.

Treat every token across every installed app as affected. Permit exactly one app, no unrelated consumer, controlled issuance inventory and external custody. A replacement token issued before revocation cannot survive by design. App/asset removal, deleting an environment variable, rotating an app secret or losing access to a target is not proof that the old token became invalid. Identity deletion is not the recovery mechanism.

### Initial recovery rehearsal — future separately authorized Tier-3 action

Before any credential is handled, B2/B3, protected B5 handling and the exact-action operator manifest must pass. That manifest binds the independent human authority, verified new IDs, revoke control, safe token-validity inspection method, observation deadline and stop/containment authority. A debugger or API which puts credentials in captured URLs/logs is not acceptable. The provider's non-event token-validity inspection must return an explicit token-invalid result; a permission error on a dataset read is not an equivalent substitute.

1. Use only the new dedicated Employee with the one lifecycle-only app and approved dataset grants. Record complete identity/app/asset and consumer inventory and nonsecret target mapping; never target either existing user.
2. Issue **credential A** to protected temporary custody. Establish A's valid-before status and selected app/subject/grants using approved non-event inspection. Record a vault version reference, not a token value or raw debugger response.
3. Keep destination unconfigured/disabled, server live gate closed, scheduler inactive and H4 unauthorized throughout. A is never stored in EH Production and never sends an event.
4. Using the separately authorized human account control outside EH and outside A's authority, revoke **all tokens** of that dedicated identity once. Record safe action confirmation and target. The custodian must be able to reach this control even if EH or the sending token is unavailable/compromised.
5. Inspect the **same A** by its protected version reference. Require explicit provider token-validity result `is_valid=false` (or a documented equivalent explicit invalid-token result bound in the operator manifest), with a working independent inspector. A remains valid, inspector access fails, timeout, ambiguous target/result or inability to verify invalidation means **FAIL**, never assumed eventual success. B must not be issued. Bounded read-only rechecks within the predetermined observation window may account for propagation; no repeated revoke/issue loop.
6. **Only after verified invalidation**, issue **credential B** on the same identity/app. Verify B valid, with the complete B1 effective-authority inspection, expiry and governance dates. Confirm the external recovery authority remains usable and the identity/app assignments remain exclusive. Inability to reissue safely fails acceptance; do not reuse A or another identity.
7. Record nonsecret before/after metadata, timestamped action/result, operator/authority, vault version references, target IDs, complete grant manifest, observation limits, and passive unrelated-integration health evidence without accessing their tokens/customer data. Require no unrelated assignments/configuration changes or observed disruption. The initial rehearsal proves this bounded operation, not every account/app restriction or business-admin compromise scenario.
8. B becomes **eligible for later separately authorized Production storage only after all credential-acceptance conditions pass** and independent acceptance verifies the record. It does not activate a destination. Retain/destroy invalid A under the approved vault retention policy after evidence is secured; no secret enters repository evidence.

Absent/ambiguous revoke control, shared consumers, inability to keep identity exclusive, failed/inconclusive invalidation, unsafe tools, lost human authority, unrelated effects or unsafe reissuance all fail closed. Report the precise failed gate and whether A remains possibly valid; use only preapproved containment. Do not broaden grants, revoke existing groups or substitute support as a required dependency. Boundary/control redesign requires an amended reviewed plan and owner approval. A transient operational failure may be retried only in a newly bounded owner-authorized window with prior evidence reconciled, never as an exploratory loop.

### Ongoing rotation and compromise

Sequence: **contain EH sender → revoke all tokens of dedicated lifecycle System User → verify old token invalid → issue replacement only after invalidation → inspect replacement → store/switch under separate Production authorization**. Close gates under approved incident authority; preserve in-flight/unknown audit history. Never revive/replay uncertain events or automatically roll back to a compromised/revoked token. After H4, pause/epoch recovery and prospective reactivation remain separately approved under the existing contract.

Keep 30-day metadata review and rotation before the earlier of issuance + 90 days or actual expiry − 7 days. Actual token/data-access limits determine a feasible window; unknown lifetime fails acceptance. Every rotation has downtime; no second lifecycle token is assumed to survive group revocation. Human account/app compromise, restriction or unavailable recovery control can defeat this route: contain, report and seek separately authorized incident action. No app-secret reset, existing-user revocation or unproved alternate mechanism is a promised fallback.

## B2, B3 and B5

| Gate | Future requirement |
| --- | --- |
| B2 — capacity preflight | Exactly one additional Employee if capacity permits; verify business/app limits. No quota upgrade, second identity, deletion/change or repurposing existing users without new architecture/owner approval |
| B3 — app/setup preflight | Verify selected C2 configuration, supported access tier, own-business route and ability to provision the boundary. General direct-CAPI documentation does not require App Review/permission requests, but is not proof of this app's eligibility. Unexpected publication, App Review, materially broader capability or event-proof requirement returns to architecture before the change |
| B5 — owner/operator custody | Recovery authority outside EH; MFA-protected human access and protected sending-token custody; exact vault/tool/ACL and authorized human selected and handling validated before any credential operation. No browser/agent capture, chat, shell-history, logs, client bundle, local `.env`, preview/dev or ordinary DB secret exposure |

Maroine EL Forssa remains the accountable owner/custodian from revision 5; an optional backup must be explicitly authorized. Runtime later receives only the dedicated sending secret under the existing Production-only reference `CRM_META_LIFECYCLE_TOKEN_EH_R4`; no recovery token or app secret is added. A required runtime proof secret is a separate amendment, not a reason to disable app security or reuse the intake secret. Exact vault product and ACL binding are execution prerequisites, not a provider-research dependency.

## State model and permitted remaining uncertainty

| State | Evidence required | What it does not mean |
| --- | --- | --- |
| **ARCHITECTURE APPROVED** | Exact reviewed Revision 7 approved by owner: C2 isolation, B1 validation, B4 recovery/downtime, B5 boundary, residual delivery limit and stop contracts | Account-specific grants, preflight, credential issuance or any operator action approved/passed |
| **PREFLIGHT VERIFIED** | B2/B3 and account/setup facts pass with exact targets/controls; newly created objects require authorized creation and readback before final setup verification | Issued credential/recovery accepted; a read-only pre-creation check alone cannot verify nonexistent objects |
| **CREDENTIAL ACCEPTED** | B1 actual bounded effective upload entitlement and metadata, B5 custody, valid-before A → invalid-after A → valid bounded B recovery rehearsal, independent acceptance evidence | Successful event sending, storage authorization, dormant destination acceptance or activation |
| **DORMANT INTEGRATION ACCEPTED** | Later separately authorized H3-06–08 configuration/acceptance, token/storage and disabled destination evidence with every send gate closed | Delivery proof or H4 authorization |
| **LIVE ACTIVATED** | Separate H4 approval and verified source/privacy/producer/gate/launch conditions | Automatically successful delivery, matching, coverage or optimization; receipt evidence remains separate |

Now: Revision 7 **PROPOSED**, none of these new acceptance states reached. Future IDs, sufficient (not globally minimum) scope/task combination, available exact revoke surface, token lifetime, capacity, supported app setup and chosen custody tool are allowed preflight/operator outputs. Ambiguous authority, inability to prove recovery, unbounded scope or unsafe measurement experiments are **not** acceptable residual uncertainty. Actual sending success may remain unverified through dormant acceptance only under the explicit alternative acceptance decision above.

## Exact future execution sequence

1. Finish this documentation PR, unchanged required CI and separate exact-SHA independent review. Owner approves exact Revision 7 decisions and separately authorizes any merge/release; no implementation or operations are implied.
2. Commission a separate implementation/preparation task to bind protected tools, nonsecret object/action manifest, safe inspection method and rehearsal acceptance/deadlines. Any utility implementation gets focused local synthetic checks, CI and fresh independent review before use. No runtime/SQL work is expected for token-only C2; stop if that changes.
3. Separately authorize bounded read-only account preflight: business/dataset, capacity B2, candidate supported C2 setup B3, independent human access/control semantics and custody B5. Stop before mutations on mismatch; distinguish pre-creation checks from final object verification.
4. Obtain explicit Tier-3 operator approval naming one new app, one new Employee, precise allowed installs/grants and the A/revoke/B rehearsal. Create only those objects, inspect readbacks and finalize PREFLIGHT VERIFIED. Stop on unexpected requirements; no existing integration changes. If an issuance UI reveals scopes only later, inspect the manifest before confirming issuance and reject any out-of-bound grant.
5. Run the bounded initial recovery rehearsal and B1 inspection. Independent acceptance records CREDENTIAL ACCEPTED only if every condition passes. No support response, event probe, runtime recovery API or surviving second token is needed.
6. Obtain separate Production storage/switch authorization for accepted B, bound to exact artifacts and server-only destination. Verify safely with all send gates still closed; never provision A. Storage success is not sending proof.
7. Commission H3-06 disabled destination, H3-07 separate dormant verification and H3-08 closeout under their own approvals. Preserve `max_attempts=5`, contract and all source-independent H3 boundaries. Only that evidence can establish DORMANT INTEGRATION ACCEPTED. These tasks are not authorized now.
8. Only a later H4 architecture/launch contract can bind prospective source/cohort, mapping, privacy and producer exclusion, controlled genuine first-event observation and cron-last activation. No future form, real opportunity, Yearly retirement or sending is an H3 credential prerequisite. H4 remains unauthorized.

## Unchanged contracts

Preserve exactly `Intake`, `Not qualified`, `Lost`, `Qualified`, `Converted`; R4 singleton Intake/Converted and genuine re-entry rules; chronological attempt ordering; original Meta `lead_id` only for Instant Forms; advisory D2 with all actual privacy/safety stops; no uncertain replay; strict exported-second rule; one-event multipart transport; dataset `1152399921284927`; provider contract `eh_meta_crm_r4_v26_r1`; immutable migration 106; disabled/unconfigured destination; closed server live gate; inactive lifecycle scheduler; H4 separation. Website CAPI, source/form/cohort decisions, intake/reconciliation and Yearly/Apps Script/Zapier stay outside this amendment. Product, SQL, transport/receipt and permission implementations do not change.

## Owner decisions required

| Decision and options | Recommendation / consequence | Blocking status |
| --- | --- | --- |
| Approve proposed C2 selection, or choose C1 in a revised manifest accepting shared app-level incidents? | **C2** isolates app administration/secret incidents from intake; extra app upkeep accepted. C1 requires a new explicit reviewed selection, never fallback | Blocks architecture approval; no provider response required |
| Approve exclusive identity-wide recovery plus invalidate-before-reissue downtime, or decline that availability tradeoff? | **Approve** with required rehearsal; declining requires another reviewed recovery design, not unproved individual caller authority | Blocks architecture approval |
| Approve non-event credential/dormant acceptance with delivery success explicitly unverified until H4, or require isolated empirical sending proof first? | **Non-event acceptance** avoids unisolated synthetic measurement effects. Requiring proof first needs a new demonstrably isolated validation design; no test event is authorized by either option here | Blocks architecture approval; material evidence-limit decision |
| Approve external MFA-protected custody boundary, or propose a different reviewed operator boundary? | **Approve B5**; exact vault/tool/ACL selected and safe handling demonstrated before credentials | Boundary blocks architecture approval; tool/ACL binding blocks credential operations |
| Approve the exact reviewed Revision 7 and later action manifests/windows? | Record date, exact plan commit, C2, downtime, acceptance limit and custody choices. Issue separate commissioning and release/operator approvals as sequence requires | No approval is inferred from this drafting request; merge/release hold remains |

## IMPLEMENTATION CONTRACT

- **Current task:** documentation-only proposed Revision 7, evidence ledger and dated navigation/status/ADR updates. Tier 3; no provider/credential/Production operation, support contact, code/CI change or migration. New plan owns future acceptance; historical research remains evidence, not an active support prerequisite.
- **Future scope:** one new C2 app, one Employee, only approved lifecycle app/dataset grants, external protected authority/custody, one bounded A/revoke/B recovery rehearsal and non-event B1 acceptance. Every action/target/tool must be in the separately authorized operator manifest. No speculative event/scopes/caller experiments.
- **Prerequisites:** exact-revision independent review and owner architecture approval; independent implementation/release instances under AGENTS; reviewed protected tooling if needed, B2/B3/B5 and exact operator approval. No Meta response prerequisite.
- **Acceptance:** layer-by-layer effective authority, full asset/consumer inventory, independent human control, A valid-before/explicitly-invalid-after then B valid/bounded, unchanged unrelated integrations and closed gates. Record safe metadata and evidence limits. Delivery success remains NOT VERIFIED until separately authorized genuine H4 receipt. Any missing required fact fails its gate.
- **Stop/recovery:** all B1/B4 failure conditions above; retain dormant gates and unknown-attempt history; report precise failed gate and residual credential validity. Never broaden powers, repurpose users, reset shared app settings or retry provider sends to discover permissions. Material redesign requires new review/owner approval; ordinary bounded evidence corrections do not require support.
- **Modules/migrations:** no application/database edit expected; migration filenames **none**. Adapter/worker/server and immutable 106 are reference boundaries only. Required proof/runtime changes require a new reviewed scoped implementation, not an implicit exception.
- **Documentation/testing:** link/anchor, source/provenance, secret/PII and docs-only checks; `git diff --check`; one focused author self-check. Open PR and run unchanged required CI; record head/base/tested merge and results. No redundant local app/DB suite for Markdown-only work. Any future tool gets appropriate local synthetic tests before review/use.
- **Handoff:** after checks/CI, report **Tier 3: READY FOR INDEPENDENT REVIEW** for this architecture artifact and stop. Formal review is a separate owner-launched task; author does not perform or orchestrate it. Proposed-design approval, implementation readiness, credential acceptance, merge/release approval and H4 activation remain distinct. Preserve merge/release and H3-06–08/H4 holds.
