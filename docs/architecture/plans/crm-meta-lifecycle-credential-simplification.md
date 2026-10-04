# Owner summary

## What will change

**Revision S1 — PROPOSED, 2026-10-05 (Asia/Shanghai). Tier 3: credential/security/provider-operation policy.** Replace the Revision-7 bootstrap with one final dedicated System User token, one bounded validation and direct Vercel Production Secret storage. Remove disposable A/B issuance, synthetic transport testing and per-screen review ceremonies. Keep a small set of controls that protect identity, authority, secrecy, recovery and activation.

## What staff/users will be able to do

After architecture adoption and separate operational approval, the human operator can complete supported Meta configuration, issue/validate/store the final token and end credential setup. A separately scoped dormant integration acceptance can follow. School staff workflows do not change.

## What remains restricted

This architecture task authorizes no Meta access, credential operation, Vercel change, database mutation, merge, deployment or event. Credential readiness does not authorize H3-06/07/08, H4, Test Events or live delivery. Independent review and owner adoption are still pending.

## UI impact

No EH UI change. Use ordinary Meta configuration and first-party diagnostic surfaces and Vercel's private secret form. No extension or custom credential inspector is required.

## Database impact

None; no migration. Preserve the deployed immutable R4 manifest and existing destination, source, epoch, outbox, privacy and replay boundaries.

## Important security decisions

Keep the existing C2 app, Employee System User and dataset, least privilege, no DQA, human-only secret handling, Production-only sensitive storage, fail-closed delivery and prospective-only activation. Trust Meta's supported diagnostic/control-plane surfaces without proving their internal browser transport. The server resolves the secret reference transiently; no source/configuration document contains the value.

## Risks / owner review points

Accept provider diagnostic/control-plane trust and removal of an initial empirical revocation rehearsal. A valid credential and administrative dataset entitlement do not prove successful CAPI delivery. Non-expiring credentials reduce expiry incidents but extend exposure until revoked. Vercel is the only persistent custody service, so recovery may entail downtime. App capability can expose broader permission options without granting them to the final token. A stolen dataset-entitled token is not constrained to EH's five event names by our application guards.

## Status, evidence and precedence

Baseline main: `3e80697fc57f1f17bf1a23e46d3fb42311c01dc5`. This is one architecture outcome, not a series of research/preparation PRs. The owner's 2026-10-04 commission authorizes this proposal and PR only. **Architecture approval: PENDING; approved revision/commit, owner/date and review evidence: not yet recorded.** Record those exact bindings on adoption before implementation. No approval is inferred from the commission.

| Evidence read | What it establishes / limit |
| --- | --- |
| [4B association](../evidence/crm-h3-r7-4b-execution-closeout-2026-10-04.md), [4C grant](../evidence/crm-h3-r7-4c-execution-closeout-2026-10-04.md) | Dedicated C2/Employee association, Develop app partial; Use events dataset partial with provider-coupled View Pixels partial. Not a successful token or event test |
| [Vercel custody evidence](../evidence/crm-h3-r7-vercel-b5-preflight-2026-10-04.md) | Exact team/project, owner/MFA, sensitive Production storage available; token and live-gate keys absent at observation. Historical nonsecret evidence, not a new Production inspection |
| [Two-stage amendment](crm-h3-05-r7-two-stage-inspector-bootstrap-amendment.md), [monitor design](crm-h3-05-r7-inspector-transport-monitor-design.md), [implementation](../evidence/crm-h3-r7-inspector-transport-monitor-implementation-2026-10-04.md) | Existing R7 contract and monitor's limited synthetic request observations; no real-token readiness proof |
| [PR #89](https://github.com/elforssa/english-hills-admin/pull/89) | GitHub readback: merged at baseline main from `d11c77aebd1b3c791e5760e9731695f6918fac53`. Source adoption does not prove installation or provider operation |
| [PR #91 evidence pinned at a51bb2a](https://github.com/elforssa/english-hills-admin/blob/a51bb2aad273e96b6d71970593add9abfad0ced4/docs/architecture/evidence/crm-h3-r7-issuance-contract-research-2026-10-04.md) and [operator packet](https://github.com/elforssa/english-hills-admin/blob/a51bb2aad273e96b6d71970593add9abfad0ced4/docs/architecture/plans/crm-h3-r7-bootstrap-credential-operator-packet.md) | Open PR head `a51bb2aad273e96b6d71970593add9abfad0ced4`; owner-observed provider facts, not merged authority or fresh author Meta inspection |
| [H3-04 Production acceptance](../evidence/crm-h3-04-production-2026-10-02.md), [H3 roadmap](crm-h3-technical-readiness.md), [R4 plan](crm-meta-funnel-revision-4.md), [ADR-004](../decisions/ADR-004-meta-lifecycle-feedback.md) | Ledger through 106 and seeded manifest, dormant delivery and prospective/no-uncertain-replay boundaries; no new Production verification here |

PR #91 records current first-party own-app + own-System-User CAPI support, without inherent App Review or separate permission requests for that route. It also records C2 originally having no use case/permission-bearing capability and a disabled token chooser. The latest C2 observation reached the confirmation modal for **Create & manage ads with Marketing API**, without Add to app or token generation. The test app's attachment succeeded but proves neither C2 entitlement nor a required final scope set. DQA evidence describes additional durable authority/configuration and a current opt-out limitation; DQA stays excluded. These are attributed repository observations; this task does not access Meta or independently refresh provider documentation.

**Precedence on adoption:** S1 replaces all R7 credential bootstrap, inspector, recovery-rehearsal and per-action gate requirements, including their inherited G0/operator packets, only within this dedicated lifecycle credential scope. Historical facts, approvals and findings remain intact. Vercel custody and R4 product/delivery safeguards remain. Until exact-head independent review, owner adoption and merge, S1 is proposed and the existing operational holds remain; there are not two executable contracts. After adoption, conflicting R7 procedure is historical and must not be replayed. Monitor source/tests remain untouched; their presence is not a credential prerequisite.

## Permanent security invariants

1. **Exact isolated identity:** Glory Lot `1741597822557523`; app `29771601672426816 / EH Lifecycle R4 C2`; System User `61594989243533 / EH Lifecycle R4 Employee`, EMPLOYEE; dataset endpoint `1152399921284927`. Navigation row `1568116421343147` is not the endpoint. No automatic identity substitution. Existing intake app/users, Yearly, Sheets/Apps Script/Zapier and unrelated assets/consumers remain outside this credential's duties and revocation scope.
2. **Least privilege across distinct layers:** supported app/use-case capability; Marketing API Access Tier (a feature, not a token scope); System User app/asset tasks; requested and returned token scopes; and actual effective authority. App catalog availability does not require selecting every scope. Preserve Develop app partial and Use events dataset partial / coupled View Pixels unless supported evidence establishes a necessary change. No speculative Admin/full-control, unrelated dataset/Page/ad-account access or business-management expansion. Do not infer scope sufficiency from a label or grant upload authority from read-only metadata alone.
3. **No DQA by default:** no Dataset Quality API opt-in, managed-identity substitution or incidental extra integration. A concrete approved need requires Gate A reconsideration.
4. **No persistent human/AI copy:** raw token never enters prompts, GitHub, repository/docs, logs, screenshots, terminal/history, local files/notes, Sheets or an external recovery vault. Agents never receive it. Source code knows only `CRM_META_LIFECYCLE_TOKEN_EH_R4`; only the server transport resolves its value transiently. No token fragments, hashes/fingerprints, raw diagnostic output or credential-bearing URLs in evidence.
5. **Vercel-only custody:** exact team `team_egUbt9wN23I40I1K71zxfYGj`, project `prj_hC0MvqsXYmERXhZWGEfOOma8D6E3 / english-hills-admin`; key `CRM_META_LIFECYCLE_TOKEN_EH_R4`, Secret/API `sensitive`, target exactly Production. Server-side only, no Preview/Development/custom copy, readable type, readback/export or `vercel env pull`.
6. **Validate the final credential once:** validity, expected class/subject/app, lifetime, required scopes, absence of unexplained excess authority and intended dataset entitlement must all pass before acceptance/storage. No test event or live `/events` request is a credential probe.
7. **Independent delivery gates:** destination disabled, server live gate absent/false, lifecycle scheduler inactive; no send follows from credential existence. Invalid/missing credentials fail closed; rotation never releases uncertain historical deliveries.
8. **Human recovery and activation ownership:** authorized MFA-protected owner access must remain usable without the sender token. Revoke/rotate suspected exposure; replace expired/invalid tokens. Prospective source/cohort, privacy/stops, producer exclusion, epoch and final Tier-3 live approval remain mandatory.

## Three review gates

| Gate | Review and owner authority | Scope / completion |
| --- | --- | --- |
| A — architecture/security boundary | Separate independent exact-head architecture review after successful required CI, then explicit owner adoption of S1 | This PR. Reopen only for a material identity, authority, custody, diagnostic or delivery-boundary conflict, not ordinary missing UI facts |
| B — credential + Production custody | One focused independent review of the consolidated operator contract and explicit owner operational approval **before final issuance**, including conditional accepted-token storage and bounded failed-token containment | Supported configuration, exact identity/permissions/lifetime, private diagnostic flow, Vercel target and recovery. Genuinely irreversible/high-impact prerequisite configuration must be covered before it is performed. Routine read-only observations and setup screens within the approved boundary do not need individual reviews |
| C — live lifecycle activation | One focused Tier-3 exact-revision review, explicit owner release/activation approval and separate release/operator task | Current implementation/test evidence, dormant acceptance and actual H4 source/cohort/exclusion/epoch; then enable the specifically approved gates and verify Production |

This is a local credential-policy simplification, not a waiver of AGENTS source CI, independent review or human Production approval. One approval may cover the bounded configuration-to-custody outcome; no GitHub comment per click, timer or new approval for each readback. Record material observations in one nonsecret closeout. Fresh review is required for material contract changes/findings fixes, not every evidence-only observation.

H3-06/07/08 remain explicitly scoped Production work. Their disabled destination configuration, independent verification and owner handoff can be one separately authorized **dormant acceptance outcome**, with the existing independent verifier role, rather than three preparation PRs or extra credential-design gates. Credential-only Gate B approval excludes these actions; the owner may explicitly include their reviewed scope in the same operational commission, without enabling H4 or Gate C.

## Supported configuration and validation contract

Use Meta's supported own-app/System User CAPI route. If C2 needs **Create & manage ads with Marketing API** to expose the supported token flow, adding that capability is normal configuration within the reviewed Gate B envelope, followed by inspection of actual effects/least privilege. No disposable-app experiment or proof of checkbox-versus-Save internal persistence is required. A potentially non-removable capability's retention risk must be disclosed and approved at Gate B before attachment; no guaranteed rollback is promised. Follow the current visible confirmation flow and reconcile ambiguous results before retrying.

Do not automatically request App Review, publish the app, upgrade Marketing API Access Tier, add optional features, change assets or select all offered permissions. Any proven necessary step that materially expands the boundary returns to Gate A. A supported within-boundary correction stays in the same operator work item. If current configuration proves C2/Employee unsuitable, stop for an explicit architecture decision.

Before issuance, the Gate B contract records a small **authority manifest**: exact identities; current app capability/tier and System User tasks; exact minimum requested scopes and any explained provider-added defaults; dataset/account reach; supported lifetime choice; diagnostic surface and expected interpretation. The precise token subset is not yet established by repository evidence. Resolve it from supported route guidance/current nonsecret configuration before issuance; neither `ads_read` web-event guidance, an empty set, nor generic `ads_management`/`business_management` Marketing examples establish the CRM recipe. This is execution evidence, not a reason to recreate R7 G0 research gates. Unexplained excess or uninspectable authority prevents acceptance.

| Final validation fact | Bounded acceptance |
| --- | --- |
| Validity and class | Meta-supported diagnostic reports valid; class and issuance context are consistent with a System User, not a human/session token |
| Subject and app | Expected C2 app and exact Employee; reconcile an app-scoped subject using Meta-supported identity/assignment context. Numeric equality alone is not assumed; unresolved mapping stops acceptance |
| Lifetime | Select supported non-expiring/Never when available and Gate B accepts it; otherwise a stated finite expiry with a named replacement owner and date before expiry. Interpret `expires_at=0` only under supported semantics; missing values are not proof of no expiry. Unexplained data-access expiry or already expired state fails |
| Permissions and effective authority | Required manifest scopes present; returned additions explained and bounded. Reconcile System User role, app tasks, assigned assets and granular targets where provided. Empty/missing granular targets do not prove absence of broad reach |
| Dataset/account usability | Supported CAPI entitlement plus exact assigned dataset/account context and diagnostic targets where exposed agree with `1152399921284927`. No unrelated reach or silent navigation-ID substitution. This establishes administrative entitlement, **not successful delivery** |

Prefer Meta's first-party Access Token Debugger in a private human session; no transport monitor, synthetic marker or request capture. Trust the supported diagnostic surface without asserting its internal URL/request behavior is proven. Do not hand-build token-bearing URLs, use CLI/API scripts with secrets, collect HAR/devtools logs, or introduce an app secret/second diagnostic credential. If the supported surface cannot establish a material validation fact safely, stop for a targeted correction/decision; do not store an unvalidated token. The retired transport ceremony is not the fallback.

“One validation” is one bounded inspection of the final token against this checklist, not a one-field check. A replacement after a genuine failure gets its own inspection; there is no mandatory A/B pair or repeated debugging loop.

## Operator flow

1. Bind Gate A adoption, Gate B reviewed contract and explicit owner authority to the exact identities, final issuance, conditional Production storage and failure containment. Confirm MFA/access, correct Vercel project/type/target, expected key absence (or explicit rotation) and dormant gates **before issuance**.
2. Reconcile current C2/System User/dataset state and complete only approved supported configuration. Inspect actual capability/tier, assignments and scope choices against the authority manifest. Ordinary readbacks stay in this outcome; do not replay old R7 action allowances.
3. Enter a private human-only secret interval: agents/browser automation, screen recording/sharing, browser sync and clipboard history/cloud sync off. No untrusted capture tooling. Nonsecret setup may span sessions; only issuance → inspection → insertion requires continuous private handling to avoid an intermediate stored copy.
4. Select only the required permissions and approved lifetime, then generate **one final dedicated token**. Do not issue disposable A or a second B solely for bootstrap.
5. Validate that exact token once using the checklist above. Record only nonsecret result categories and allowlisted metadata, not the raw provider response.
6. On failure/inconclusive identity, scope, lifetime or entitlement: do not accept/store. Stop the issuance flow, contain/revoke the unaccepted token under the approved recovery scope, and correct the specific configuration in the same work item. Material authority changes need Gate A; other reviewed corrections use Gate B without a new architecture exercise. Never issue repeatedly while adding permissions experimentally.
7. On PASS, transfer that exact accepted token directly to the pre-authorized Vercel Production sensitive Secret form. Transient clipboard is allowed only with history/sync disabled; clear it immediately after use. No intermediate persistent copy or AI handoff.
8. Verify **metadata only**: exact project/key exists once, type sensitive/Secret, Production only, no other target, unambiguous storage outcome. Never reveal/read/export/compare the stored value. Clear transient clipboard, close secret-bearing pages and end the private interval. If interrupted before safe storage or storage is ambiguous, follow recovery; never park the value in a file or prompt.
9. Record **CREDENTIAL READY** only when validation and storage metadata pass; record actual date/operator, reference, approved scope/lifetime, result and limits. **Delivery success: NOT VERIFIED.** Missing facts mean not ready, not a partial success relabeled as completion.
10. End credential setup. Destination remains disabled, server live gate absent/false and scheduler inactive. H3-06/07/08 and H4 do not follow automatically.

## Recovery and rotation

Use the same short Gate B contract for replacement, with explicit owner authority; no A/B rehearsal or architecture redesign for unchanged identity/scope/custody. Preserve human MFA/recovery access and a nonsecret expiry/replacement record.

- **Suspected exposure:** stop new delivery under the approved incident authority and revoke promptly. Prefer a supported safely targeted token revoke; if unavailable, use dedicated-Employee Revoke tokens only after confirming it has no unrelated consumer. Never revoke shared intake users/apps. The reviewed operator contract must include this bounded containment authority before issuance so a failed token is not stranded awaiting another preparation PR.
- **Expired/invalid or routine replacement:** keep delivery closed while replacing. Safely retire the old token; identity-wide revocation must precede replacement issuance because it may invalidate every token on that Employee. Do not assume a newly issued token survives it. Accept downtime; no zero-downtime promise or compulsory temporary token.
- **Issue/validate/store replacement:** repeat steps 1–9 with explicit replacement of the same Production key. Retire the previous credential where Meta safely supports it. An unexpected existing key outside a rotation is reconciled, not overwritten by default. Lost-before-save or ambiguous storage is uncontrolled/unaccepted: metadata-only reconciliation and safe revocation/replacement, never secret retrieval.
- **Revoke outcome:** use explicit Meta control-plane confirmation and nonsecret identity binding. No retained old token, empirical re-debugging or polling schedule. Ambiguous revoke means stop issuance and reconcile; do not blindly repeat a high-impact mutation or claim recovery succeeded.
- **Runtime application:** Vercel storage alone does not prove an existing deployment has loaded a replacement. A separately authorized release/redeploy must bind the new environment revision, maintain closed delivery controls and verify nonsecret deployment metadata. Never roll back to a deployment presumed to hold a revoked token. For an already-live installation, Gate C review/owner authority covers controlled resumption after containment; credential rotation by itself never resumes sending.

The current [worker](../../../src/lib/crm/lifecycle/worker.mjs) holds missing secrets and checks the independent live gate; the [adapter](../../../src/lib/crm/lifecycle/adapter.mjs) returns blocked/provider_auth for HTTP 401/403 and known auth errors, and preserves unknown outcomes. This is per-delivery failure handling, **not an automatic global scheduler shutdown**. Operator containment is required for a credential incident. Never bypass gates, fall back to another token, or replay potentially dispatched events after repair.

## Dormant integration and activation separation

After separate dormant-scope approval, H3-06 binds the current version of the existing destination via `crm_configure_lifecycle`: `mode=live`, `enabled=false`, dataset `1152399921284927`, `secret_ref=CRM_META_LIFECYCLE_TOKEN_EH_R4`, actual seeded R4 contract ID, `max_attempts=5`; preserve inbound fields. H3-07 independently verifies the disabled destination, expected contract, closed server gate, inactive cron, absence of unexpected lifecycle inventory and unchanged intake health, then H3-08 records owner handoff. Use the [existing exact roadmap](crm-h3-technical-readiness.md#named-h3-execution-steps-order-and-recovery) for RPC/concurrency and acceptance details; no new migration or relaxed acceptance is proposed. Those steps may share one outcome record and review package.

**CREDENTIAL READY != DORMANT INTEGRATION ACCEPTED != LIFECYCLE LIVE.** Credential approval/storage authorizes none of: H3-06 destination writes, H3-07/08 acceptance/signoff, H4 form/source/mapping/cohort setup, prospective cutoff/boundary/producer ownership/epoch creation, destination enablement, live server gate, lifecycle scheduler, Test Events or real events.

Gate C requires the actual prospective source/cohort and original Meta-lead provenance, compliant form/notice and applicable privacy/stops, verified source-specific legacy exclusion/producer ownership, activation cutoff and epoch, immutable R4 contract, current required tests/CI, exact-head independent review and explicit owner release approval. No uncertain/historical lead replay; no fabrication of original times or funnel events. Initial delivery/receipt verification uses only separately approved eligible prospective activity. Test Events remain excluded absent their own explicit approved scope and risk decision. R4 advisory D2 does not remove actual privacy/stop safeguards. Successful API receipt, CRM recognition and optimization eligibility remain different claims.

## Superseded controls

On adoption, the following cease to be mandatory credential requirements; none is retained under another name:

- Disposable credential A, A bootstrap validation, revoke-A-before-B as initial identity-wide rehearsal, and a second final B issued solely for bootstrap.
- Synthetic T1–T8 transport ceremony, INSPECTOR TRANSPORT READY, Chrome transport monitor, synthetic debugger markers and proving URL/request transport before real-token inspection.
- Per-click action allowances, mandatory 60-minute credential windows, GitHub logging before routine provider clicks, independent AI review for every configuration screen and exact-SHA review after every read-only observation.
- Same-session chaining across all setup; retain only the private secret interval to prevent intermediate copies.
- Checkbox-local-versus-persistent proof before normal Save/confirmation, disposable provider-app experiments for normal UI transactions, and treating ordinary read-only observations as separate Tier-3 execution gates.
- External recovery vault, retained SAME-A invalidity testing and fixed post-revoke polling inherited from earlier revisions. Vercel-only custody remains.

The remaining stop on **ambiguous high-impact mutation** addresses duplicate grants/revocation and uncontrolled credentials, not a return to per-click bookkeeping. Supported state reconciliation within the approved scope suffices. A/B testing could return only for a concrete documented platform necessity and a newly approved material design change, never solely because R7 prescribed it.

## Owner decisions required

**Adoption decision, blocking implementation:** A — adopt S1's single-token/provider-trust model, Vercel-only recovery and three gates (recommended); B — retain R7's extra empirical bootstrap/transport assurance and operational cost. The commission requests A's design, but is not final adoption. Record exact reviewed commit, owner/date and acceptance of the stated residual risks on adoption. No other product decision is currently established as blocking this architecture; exact scopes/lifetime/current provider facts are Gate B execution prerequisites, not invented answers.

## IMPLEMENTATION CONTRACT

- **Prerequisites:** exact-SHA successful required CI, separate independent architecture review, recorded owner adoption/revision, then separate implementation/operator task. This author stops after PR/CI scheduling; no formal review or execution is delegated by it.
- **PR #91 disposition: revise #91 after S1 adoption.** Rebase onto adopted main and replace its active bootstrap packet with one concise S1 credential/dormant runbook. Preserve the full issuance investigation and historical packet (move the latter to a clearly historical record if needed); add an explicit supersession banner and links. Keep prior findings/approvals with their original scope. Do not close it in a way that strands its evidence, merge the old executable packet, or keep two active contracts. This task neither modifies nor merges #91.
- **Manifest:** new S1 plan and ADR-004 amendment; current-state/security/workflow/architecture/index/runbook navigation plus scoped historical-plan notices. Later #91 runbook/evidence only for the unchanged model; existing monitor code/tests and immutable migrations remain. No new credential database, recovery service, extension, custom inspector, app or System User.
- **Acceptance:** current supported capability/scopes/lifetime manifest resolved in the same work item; focused Gate B review/owner approval before issuance; one accepted final token; every validation fact PASS; exact Vercel sensitive Production-only metadata PASS; safe cleanup and nonsecret closeout; all delivery gates remain closed. Any included dormant outcome additionally meets H3-06/07/08 acceptance. Actual delivery remains unverified until Gate C.
- **Verification:** documentation link/source/secret/PII checks and `git diff --check`; one author self-check. Documentation-only CI applies to this PR; no app/database/browser tests for wording-only changes. Future runtime changes require scoped local/synthetic tests and normal required CI; provider/Production verification belongs to the approved operator task, never secret-bearing browser automation.
- **Stop conditions:** wrong/unsuitable identity, unsupported or excessive authority, DQA/extra credential/proof requirement, unsafe diagnostic handling, failed/inconclusive validation, conflicting secret, ambiguous mutation/storage/revoke, unexpected live gate/inventory or unrelated-consumer impact. Resolve ordinary facts in the same outcome; reopen Gate A only for a genuine boundary conflict. No automatic escalation, cleanup or event probe.
- **Closeout:** report adopted revision, exact source head/base/CI evidence, operator approvals, safe metadata/results, unresolved facts, credential/dormant/live states separately, and release hold. Update CURRENT_STATE with observed facts only. No automatic release from plan acceptance, no repeated preparation PRs, no demand for old R7 ceremonies during normal rotation.
