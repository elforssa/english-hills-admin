# Current state

## S1 credential architecture adopted — 2026-10-05

S1 is owner-approved and merged through [PR #93](https://github.com/elforssa/english-hills-admin/pull/93), source head `27274492b3a2f6dab1cbb86ae239c056bee1421d`, main merge `284c2fe32014f8f3011ac6677ddfe99b0a16ca22`. The owner's direct continuation commission records adoption and directs existing [PR #91](https://github.com/elforssa/english-hills-admin/pull/91) to implement the [S1 Gate-B credential-only runbook](../architecture/plans/crm-h3-s1-gate-b-credential-runbook.md). That runbook is prepared for focused independent review and separate owner operational approval; no operation is authorized by this documentation task.

**Architecture adopted; credential not yet ready; lifecycle not live.** Exact minimum token scopes remain unresolved before generation. Retain C2 `29771601672426816`, Employee `61594989243533`, dataset `1152399921284927`, `CRM_META_LIFECYCLE_TOKEN_EH_R4`, no DQA and dormant delivery. The [historical issuance investigation](../architecture/evidence/crm-h3-r7-issuance-contract-research-2026-10-04.md) records the own-app/System User route, C2 originally showing no token permissions, and latest C2 Marketing confirmation reached without Add to app or token generation. These are dated owner observations, not refreshed Meta state. [Vercel preflight](../architecture/evidence/crm-h3-r7-vercel-b5-preflight-2026-10-04.md) records historical key absence, not a new Production inspection.

R7 A/B, bootstrap/transport, per-click and repeated-screen gates are **HISTORICAL — SUPERSEDED BY S1** wherever credential procedure conflicts. All R7 sections below preserve dated evidence and original approval scope, not current execution instructions. Monitor source was merged through PR #89 at `3e80697fc57f1f17bf1a23e46d3fb42311c01dc5`; it is not an S1 credential prerequisite. This #91 conversion changes documentation only: no runtime/migration, Meta access/mutation, token, Vercel/Production action or event. H3-06/07/08 are excluded; all release/live activation holds remain.

## H3 Revision 7 — transport monitor first-review corrections applied — 2026-10-04

> **HISTORICAL — SUPERSEDED BY S1** for conflicting credential procedures; original evidence and approval scope retained.

PR #89 first exact-code review at head `ab99be3084d7b02858887b7db7e9f5c122d87633` found implementation defects in Chrome response-envelope handling, async observation invalidation, Rule 9002 precedence and CI assertions, plus case-sensitivity/RE2/test-coverage qualifications. Those findings are corrected on the same branch.

The corrected implementation now:
- extracts only `RulesMatchedDetails.rulesMatchedInfo`; malformed envelopes are INCONCLUSIVE;
- rechecks completion time after async Chrome calls;
- invalidates stale pending queries after Reset, restarted windows or newer overlapping queries without letting them overwrite the newer UI state;
- makes any fresh Rule 9002 match immediate FAIL in calibration, idle or assessment;
- explicitly sets case-sensitive URL matching;
- enforces exact numeric priorities 9001=100, 9002=300, 9003=200;
- treats `initiatorDomains` as a domain condition rather than exact-origin proof;
- replaces the incorrect noncapturing-group RE2 claim with guards against known unsupported lookaround/backreference constructs;
- forbids `optional_permissions`;
- closes and scans the executable-file inventory;
- adds actual Chrome response-envelope controller tests and delayed/reset/restart/overlap regressions.

PR #89 remains implemented on its review branch, **not merged/adopted**. The previous failed CI run is historical and does not count as acceptance. Fresh CI and a fresh exact-code independent Tier-3 re-review are required on the corrected head.

Operational state is unchanged: extension installation/testing, Meta access, A/B generation, inspection, revoke, Vercel mutation, H3-06–08, H4, Test Events and lifecycle sending remain unauthorized.

## H3 Revision 7 — transport monitor implemented for exact-code review — 2026-10-04

> **HISTORICAL — SUPERSEDED BY S1** for conflicting credential procedures; original evidence and approval scope retained.

PR #88 is owner-adopted and merged at main `9f3ced1a8e184f2bc5c2afd0dc4d607eda71748d`. The adopted two-stage inspector bootstrap architecture is now **DEFINED**.

The three-rule synthetic transport monitor has been implemented on branch `feat/h3-r7-inspector-transport-monitor` under `tools/meta-debugger-transport-monitor/`. The implementation checkpoint before evidence documentation is `d8328564a7c82601f2891350bf7baa17607059c3`.

Implemented controls include:
- Manifest V3;
- only `declarativeNetRequest` + `declarativeNetRequestFeedback`;
- no host permissions/content scripts/background worker;
- Rule 9001 fixed calibration block;
- Rule 9002 fixed synthetic marker block at priority 300;
- Rule 9003 exact Meta Graph `/debug_token` endpoint-request allow observation at priority 200;
- explicit full 15-ResourceType coverage on all rules;
- exact HTTPS + exact `graph.facebook.com` + complete versioned/unversioned `/debug_token` regex;
- in-memory-only observation starts;
- all-tabs/unassociated `getMatchedRules({minTimeStamp})` queries;
- 60-second maximum windows;
- stale/query-error/invalid-window fail-closed semantics;
- strict result projection to rule/ruleset/tab/timestamp only;
- explicit Rule 9003 limitation: endpoint request attempt only, never completed evaluation proof.

Dedicated tests are in `scripts/test-meta-debugger-transport-monitor.mjs` and are wired into the normal `npm test` chain through `npm run test:inspector-monitor`. They enforce permission, rule, priority, regex, ResourceType, stale-window, query-error, tab -1 retention, strict-projection and forbidden request-detail/network/persistence constraints.

[Implementation evidence](../architecture/evidence/crm-h3-r7-inspector-transport-monitor-implementation-2026-10-04.md).

No extension has been installed or run. No synthetic browser request, Meta access, credential generation/inspection, revoke, Vercel mutation or event action occurred.

Current states:
- **B5 = READY**
- **TWO-STAGE INSPECTOR BOOTSTRAP ARCHITECTURE = DEFINED**
- **transport monitor implementation = IMPLEMENTED ON REVIEW BRANCH / NOT MERGED OR ADOPTED / EXACT-CODE INDEPENDENT RE-REVIEW REQUIRED**
- **transport monitor installation = NOT AUTHORIZED**
- **synthetic transport operation = NOT AUTHORIZED**
- **INSPECTOR TRANSPORT READY = NOT YET ACHIEVED**
- **A BOOTSTRAP VERIFIED = NO**
- **safe non-event inspector = BLOCKED operationally**
- **B1 actual credential acceptance = PENDING**
- **PREFLIGHT VERIFIED = NO**

## CI tooling-only fast path merged/adopted on main — 2026-10-04

PR #90 is **merged/adopted on main** at `58139254e843fa731877cf5c4f541512d1d32224`, implementing **CI + Codex Workflow Efficiency v2**, a **Tier 2** CI-routing/policy change. Pull requests are classified as `docs`, `tooling`, or `full`. The new `tooling` path is deliberately narrow: exactly the eight reviewed files under `tools/meta-debugger-transport-monitor/`, the exact `scripts/test-meta-debugger-transport-monitor.mjs`, and accompanying safe `docs/**/*.md`. Any other `tools/**` file is `full`. It requires documentation checks plus the normal app/unit/build/security job and skips only `local-database`.

Runtime/database/configuration/CI-policy/package/unknown paths remain `full`; classifier uncertainty remains fail-closed to `full`. A successful classifier with empty/unknown mode now also schedules the database fallback. Renames evaluate both old/new paths. Non-regular Git modes and unsupported statuses force `full`.

PR #90 itself changed `.github/**` and `scripts/ci/**`, so it was **not eligible for its own fast path**; full CI and exact-head independent review were its Tier-2 pre-merge requirements. GitHub branch-protection settings are unchanged by this source change. Earlier proposed-status labels in the linked architecture describe the pre-adoption state; PR #90's CI routing/policy is now adopted, while PR #89's monitor implementation remains on its review branch.

[Plan](../architecture/plans/ci-tooling-fast-path.md) · [Architecture](ARCHITECTURE.md#ci--codex-workflow-efficiency-v2--tooling-only-fast-path-proposed-2026-10-04) · [Policy](../../AGENTS.md#ci-selection-and-remote-ci-handoff)


## H3 Revision 7 — two-stage inspector bootstrap amendment proposed — 2026-10-04

> **HISTORICAL — SUPERSEDED BY S1** for conflicting credential procedures; original evidence and approval scope retained.

PR #87 is owner-adopted and merged at main `96dbbdb4a8d8f51a88077baae7168da425377c29`.

A new [two-stage inspector bootstrap amendment](../architecture/plans/crm-h3-05-r7-two-stage-inspector-bootstrap-amendment.md) is proposed to resolve the remaining circularity between synthetic transport proof and first real credential inspection without weakening the credential-secrecy contract.

The proposal makes **INSPECTOR TRANSPORT READY session-bound**, not a permanent global state. A future exact operator run would rerun the reviewed synthetic transport procedure immediately before any disposable A issuance in the same uninterrupted private human session. Stage-I transport PASS would require the reviewed three-rule DNR monitor, fresh calibration, clean Rule 9003 idle baseline, zero Rule 9002 URL-leak matches, a fresh Rule 9003 submission-associated endpoint-request observation, clean visible URL/history checks, healthy human debugger session and no unexpected credential boundary. It explicitly accepts that synthetic input linkage and completed evaluation remain unproved; the architecture treats the bounded evidence as sufficient only to expose one disposable A under residual-risk controls.

The proposal then makes disposable A the first empirical credential-specific bootstrap proof. A must be generated once from the exact dedicated lifecycle System User and C2 app, remain under mandatory private-human credential continuity `exact issuance → exact A transfer → debugger submission → fresh result`, never enter Production/Vercel and never perform /events, Test Events or business actions. A bootstrap PASS requires validity, expected token class/app, coherent lifetime, exact approved scopes, subject PASS, target PASS and coherent broader B1 authority inventory.

Subject PASS now requires mandatory credential continuity plus expected issuance subject/app and debugger token class/app. Raw debugger `user_id` is never persisted; optional local corroboration is allowed only if canonical mapping is separately supported. Target PASS uses local-only comparison against a pre-approved business-asset inventory; raw unknown target IDs remain on the provider/human surface, and missing/incomplete/unmapped detail is INCONCLUSIVE.

If A issuance occurred but bootstrap fails/inconclusive, the future operator packet would need a pre-reviewed conditional one-time identity-wide Revoke tokens containment branch and then STOP with no B. If A bootstrap succeeds, the already adopted revoke-success → B sequence continues. B must independently pass final B1 under a separate continuity chain before same-session conditional Vercel Production storage.

This branch is architecture/documentation only. No monitor implementation/installation, synthetic browser operation, Meta access, A/B generation, real-token inspection, revoke, Vercel mutation, H3-06–08, H4, Test Events or lifecycle sending is authorized.

Current inherited state remains:
- **B5 = READY**
- **TWO-STAGE INSPECTOR BOOTSTRAP ARCHITECTURE = PROPOSED / NOT ADOPTED**
- **transport monitor implementation = NOT IMPLEMENTED**
- **INSPECTOR TRANSPORT READY = NOT YET ACHIEVED**
- **A BOOTSTRAP VERIFIED = NO**
- **safe non-event inspector = BLOCKED**
- **B1 actual credential acceptance = PENDING**
- **PREFLIGHT VERIFIED = NO**


## H3 Revision 7 — inspector linkage + subject/target binding research prepared — 2026-10-04

> **HISTORICAL — SUPERSEDED BY S1** for conflicting credential procedures; original evidence and approval scope retained.

PR #86 is owner-adopted and merged at main `b88c8e9abdb4c90dca7204d04f148d8f2f579854`.

New [linkage/subject-target research](../architecture/evidence/crm-h3-r7-inspector-linkage-subject-binding-research-2026-10-04.md) reaches two key conclusions:

1. Chrome DNR response-header conditions can potentially establish **response headers observed**, but HTTP cache/service-worker behavior means that observation alone does not prove a fresh network round trip or fresh provider receipt. It still does **not** prove that Meta evaluated the exact submitted synthetic value. The bounded research conclusion is now **SUPPORTED REMOTE-EVALUATION / SYNTHETIC INPUT-LINKAGE SIGNAL = NOT ESTABLISHED BY REVIEWED EVIDENCE**; this is not an impossibility claim.
2. B1 subject/target evidence can be designed without persisting raw `user_id` or granular target IDs, but subject PASS additionally requires mandatory **private-human credential continuity** from exact issuance → exact A transfer → debugger submission → fresh result. Issuance context + token class + app ID alone cannot distinguish another same-app System User or exclude a stale/other-token result. Target binding can use local-only comparison against the pre-approved business-asset inventory and emit only booleans/counts; missing/unmapped target detail remains INCONCLUSIVE.

The research recommends, but does not adopt, a two-stage bootstrap: **INSPECTOR TRANSPORT READY** only after a later amendment defines sufficient transport-safety evidence; calibration plus zero marker matches alone are not sufficient. Then a separately authorized disposable A could become the first real semantic/input-linkage proof under the mandatory continuity gate. A would never enter Production or perform events/business actions and would fail closed if required metadata/subject/target evidence is unavailable.

Current state:
- **B5 = READY**
- **SUPPORTED REQUEST-TRANSPORT / TRANSIENT-REDIRECT EVIDENCE = PENDING**
- **SUPPORTED REMOTE-ENDPOINT REQUEST OBSERVATION = CANDIDATE DEFINED, NOT VERIFIED**
- **REMOTE RESPONSE-STAGE OBSERVATION = RESEARCH CANDIDATE ONLY**
- **SUPPORTED REMOTE-EVALUATION / SYNTHETIC INPUT-LINKAGE SIGNAL = NOT ESTABLISHED BY REVIEWED EVIDENCE**
- **OUTPUT FIELD SEMANTICS = SUFFICIENT**
- **SUBJECT SAFE-BINDING DESIGN = FEASIBLE / NOT ADOPTED**
- **TARGET SAFE-BINDING DESIGN = FEASIBLE WITH COMPLETENESS/MAPPING GATE / NOT ADOPTED**
- **ALLOWLISTED VALID-TOKEN OUTPUT BINDING = PARTIAL**
- **safe non-event inspector = BLOCKED**
- **B1 actual credential acceptance = PENDING**
- **PREFLIGHT VERIFIED = NO**

No implementation, provider access or credential operation is authorized by this research.


## H3 Revision 7 — inspector remote-evaluation research prepared — 2026-10-04

> **HISTORICAL — SUPERSEDED BY S1** for conflicting credential procedures; original evidence and approval scope retained.

PR #85 is owner-adopted and merged at main `88b9dea9945a3315597214d35123a593ac710051`. The adopted Chrome transport-monitor design remains documentation-only; no extension implementation/installation or Meta testing has occurred.

A new [remote-evaluation research record](../architecture/evidence/crm-h3-r7-inspector-remote-evaluation-research-2026-10-04.md) uses current official Meta and Chrome evidence. Meta's official `facebook/agentic-tools` repository now provides a `debug-access-token` skill and vetted `debug_token_probe.py`, confirming both the human Access Token Debugger as a first-party inspection option and the supported remote Graph `/debug_token` endpoint. The same Meta source directly supports diagnostic fields including `is_valid`, token type, `app_id`, application, issuance/expiry/data-access expiry, scopes and granular-scope names.

The research defines a conditional **remote-endpoint request observer**: add lower-priority **Rule 9003** that allows only a direct GET from `developers.facebook.com` to the exactly anchored HTTPS `graph.facebook.com/.../debug_token` endpoint. Existing Rule 9002 must have strictly higher developer priority so a marker-bearing URL is blocked even when it also targets `/debug_token`. A clean idle baseline plus zero Rule 9002 matches plus a fresh Rule 9003 match can establish only that the browser flow **attempted** a request to Meta's documented endpoint. It does not prove network completion, Meta processing, response completion or that the submitted synthetic input was evaluated. Therefore **SUPPORTED REMOTE-ENDPOINT REQUEST OBSERVATION = CANDIDATE DEFINED, NOT VERIFIED**, while **SUPPORTED REMOTE-EVALUATION SIGNAL = UNRESOLVED / NOT YET DEFINED**.

Meta's official agentic-tools script itself is **not** adopted as the EH inspector because it uses GET query-string token transport, requires the app secret and relies on throwaway-shell environment-variable handling, all of which differ from the current owner-adopted contract.

Current inspector evidence state:
- **SUPPORTED REQUEST-TRANSPORT / TRANSIENT-REDIRECT EVIDENCE = PENDING**
- **SUPPORTED REMOTE-ENDPOINT REQUEST OBSERVATION = CANDIDATE DEFINED, NOT VERIFIED**
- **SUPPORTED REMOTE-EVALUATION SIGNAL = UNRESOLVED / NOT YET DEFINED**
- **OUTPUT FIELD SEMANTICS = SUFFICIENT**
- **ALLOWLISTED VALID-TOKEN OUTPUT BINDING = PARTIAL — SUBJECT/TARGET SAFE BINDING PENDING**
- **safe non-event inspector = BLOCKED**
- **B1 actual credential acceptance = PENDING**
- **PREFLIGHT VERIFIED = NO**
- **B5 = READY**

No implementation, provider action or credential operation is authorized by this research.


## H3 Revision 7 — B5 READY / safe inspector transport-monitor design prepared — 2026-10-04

> **HISTORICAL — SUPERSEDED BY S1** for conflicting credential procedures; original evidence and approval scope retained.

PR #84 is owner-adopted and merged at main `13853983dadee2a0fde93388f976887df628acbc`. The adopted state is now **B5 = READY** with the exact Vercel conditional-storage binding already recorded. No Vercel write is authorized merely by that readiness classification.

The safe non-event inspector remains **BLOCKED** on two independent gates:

1. **SUPPORTED REQUEST-TRANSPORT / TRANSIENT-REDIRECT EVIDENCE = PENDING**
2. **ALLOWLISTED VALID-TOKEN OUTPUT BINDING = PENDING**

A new documentation-only [request-transport monitor design](../architecture/plans/crm-h3-05-r7-inspector-transport-monitor-design.md) proposes a tiny temporary Chrome Manifest V3 extension using only `declarativeNetRequest` + `declarativeNetRequestFeedback`. Both synthetic block rules must explicitly include the full supported Chrome ResourceType set, including `main_frame`, so top-level navigation, background requests and redirected request URLs are covered. Fresh observation timestamps are bound before calibration/submission, `getMatchedRules()` is queried without a tab filter within 60 seconds, stale calibration matches do not count, unassociated/tab `-1` matches are included, and query errors are **INCONCLUSIVE**, never treated as zero matches.

Chrome documents that `declarativeNetRequestFeedback` enables both `getMatchedRules()` and the more revealing `onRuleMatchedDebug`, so secrecy depends on the exact reviewed code—not the permission list alone. The design now requires static tests proving there is no `onRuleMatchedDebug`, request-detail logging, persistence, network/fetch code or broader browser permission.

The transport monitor is only a safe URL-match detector. A debugger-marker match is fail-closed. A calibrated zero-match result is now classified **NO MARKER URL MATCH OBSERVED — REMOTE EVALUATION UNPROVED** and remains **INCONCLUSIVE** unless a separate supported nonsecret signal proves the synthetic submission reached the remote evaluation path. A visible invalid-input message is explicitly insufficient. The design does not yet define or approve such a remote-evaluation signal.

Meta-operated Postman documentation and official Meta Node/Java Business SDK sources continue to show the supported `debug_token` API route using `input_token` in a URL query parameter, so that API/SDK route remains **NOT APPROVED**. Public Meta documentation supports only part of the debugger output model (token type, permissions, app_id); full valid-token output binding remains **PARTIAL / BLOCKED**. No real A may be generated merely to discover field labels under this proposal.

Current holds: **B1 actual credential acceptance = PENDING**, **PREFLIGHT VERIFIED = NO**; no browser extension implementation/installation, Meta account action, A/B generation, real token inspection, Revoke tokens, Vercel secret write, H3-06–08, H4, Test Events or lifecycle send is authorized.


## H3 Revision 7 — Vercel B5 preflight PASS / inspector synthetic packet prepared — 2026-10-04

> **HISTORICAL — SUPERSEDED BY S1** for conflicting credential procedures; original evidence and approval scope retained.

PR #83 is owner-adopted and merged at main `6c62828d7b1edd53db2880ba3823dd25d8823d6f`. The active architecture is now Vercel-only lifecycle credential custody: `CRM_META_LIFECYCLE_TOKEN_EH_R4` will later be stored only as a Vercel Production Secret after B passes safe non-event/B1 acceptance, with no external recovery-vault copy and no SAME-A post-revoke proof.

A read-only/nonsecret [Vercel B5 preflight](../architecture/evidence/crm-h3-r7-vercel-b5-preflight-2026-10-04.md) completed by **2026-10-04 05:32:29 UTC**. Exact Vercel binding is `English Hills' projects / team_egUbt9wN23I40I1K71zxfYGj` → `english-hills-admin / prj_hC0MvqsXYmERXhZWGEfOOma8D6E3`. The authenticated human principal is a confirmed team OWNER with MFA enabled. Read-only environment metadata with decryption disabled confirms Vercel sensitive/secret Production-only capability, target `CRM_META_LIFECYCLE_TOKEN_EH_R4` absent, `CRM_META_LIFECYCLE_LIVE_ENABLED` absent and no target Preview/Development copy. Runtime code is server-only, validates the `CRM_META_LIFECYCLE_TOKEN_...` reference pattern and resolves the exact environment reference dynamically while retaining independent live gates. **B5 NONSECRET VERCEL PREFLIGHT = PASS**. No Vercel mutation or decrypted value read occurred.

The exact future conditional B-storage contract is now prepared: team/project above, key `CRM_META_LIFECYCLE_TOKEN_EH_R4`, UI Secret/API `sensitive`, Production only, no upsert on an unexpected conflict, same-private-session direct insertion only after B acceptance, no intermediate persistent copy/export/readback, metadata-only post-store verification, and no activation/H3-06–08/H4 bundled into storage. Proposed **B5 = READY** still requires exact-head independent review and owner adoption of this readiness evidence/contract.

A separate [synthetic Meta Access Token Debugger assessment packet](../architecture/plans/crm-h3-05-r7-inspector-synthetic-operator-packet.md) is prepared. The public human debugger URL could not be safely characterized from an authenticated session by available tooling; Meta's public `debug_token` reference returned HTTP 429. Meta's official Node Business SDK at commit `0d245ec888c1af38d68994fd7f2e24cd38abc82f` constructs a GET `debug_token` request with `input_token` and `access_token` in the query string, so that API/SDK route is explicitly **NOT APPROVED** under the no-token-in-URL contract. The human Access Token Debugger remains the preferred candidate, but **safe non-event inspector = BLOCKED**. The synthetic human procedure can establish only visible address-bar/history and session-health observations; it cannot prove that background requests or transient redirects never place submitted material into a request URL. Inspector READY therefore requires a **separate supported request-transport/transient-redirect evidence gate** plus the independent allowlisted valid-token output binding. Passing visible URL/history checks or output-field binding alone cannot clear the inspector. Broad HAR/devtools/proxy capture on the authenticated Meta session remains prohibited unless a separately reviewed method proves it cannot collect session/auth secrets.

Current holds: **B1 actual credential acceptance = PENDING**, **PREFLIGHT VERIFIED = NO**; no A/B generation, real token inspection, Revoke tokens, Vercel secret write, H3-06–08, H4, Test Events or lifecycle send is authorized by this preparation.


## H3 Revision 7 — Vercel-only custody amendment proposed — 2026-10-04

> **HISTORICAL — SUPERSEDED BY S1** for conflicting credential procedures; original evidence and approval scope retained.

The owner rejected a separate paid/high-overhead recovery-vault path and commissioned a simpler Vercel-only custody amendment. PR #82 / vault-comparison research is closed unmerged and has no architecture authority.

[Proposed Vercel-only custody amendment](../architecture/plans/crm-h3-05-revision-7-vercel-only-custody-amendment.md) keeps the completed provider-object state unchanged: **4A = VERIFIED C2 CREATION**, **4B = VERIFIED ASSOCIATION**, **4C = VERIFIED DATASET GRANT**.

The proposed change is explicit: **Vercel Production Secret becomes the only persistent lifecycle-token store**. No external 1Password/Bitwarden/Google Cloud recovery copy is required. Planned runtime secret remains `CRM_META_LIFECYCLE_TOKEN_EH_R4`, Production-only/server-only/Secret type, with no Preview/Development copy or readback/export workflow.

This proposal deliberately weakens the previous recovery evidence model. Instead of retaining A and proving exact SAME A becomes invalid after identity-wide revocation, the future rehearsal would be: **issue A → safe non-event accept A → Revoke tokens once on the dedicated lifecycle Employee → require explicit successful Meta control-plane confirmation → issue B → safe non-event accept B**. The owner must explicitly accept reliance on provider revocation confirmation rather than empirical SAME-A `is_valid=false` evidence, plus expected revoke-before-reissue downtime and non-retrievable Vercel Secret behavior.

The safe non-event inspector is **still required** for A/B pre-acceptance and remains **BLOCKED**. B1 actual credential acceptance remains **PENDING**. To avoid leaving accepted B stranded in a transient human session, the future exact credential/recovery operator packet must contain a narrowly scoped **conditional Vercel Production-storage authorization before B issuance**. If B passes inspection, the same private human session stores that exact B into the bound Production Secret; if B fails/inconclusive, nothing is stored and no replacement is automatically issued. H3-06–08/live activation/H4 remain separately gated.

This is proposal/preparation only. Until exact-head independent review and owner adoption, merged PR #81 remains current: **B5 = OWNER DECISION REQUIRED**, **PREFLIGHT VERIFIED = NO**. No Vercel/Meta/credential/revoke/Production/event action is authorized.


## H3 Revision 7 — B5 custody / safe inspector preparation — 2026-10-04

> **HISTORICAL — SUPERSEDED BY S1** for conflicting credential procedures; original evidence and approval scope retained.

PR preparation follows merged owner-adopted created-object state at main `1e32ac77d5234f39e4c6b6511e79cd5efff827a8`: **4A = VERIFIED C2 CREATION**, **4B = VERIFIED ASSOCIATION**, **4C = VERIFIED DATASET GRANT**.

The documentation-only [B5 / inspector preparation](../architecture/plans/crm-h3-05-revision-7-b5-inspector-preparation.md) is now **vendor-neutral**. **Vercel Production Secret is the runtime store** for the eventually accepted live Meta credential. A separate **human-only recovery vault** is required only for A/B custody, exact SAME-A retrieval and recovery evidence; the CRM does not call that vault during normal operation.

The recovery-vault vendor remains **OPEN / UNSELECTED**. The next research step compares the simplest qualifying options (for example 1Password, Bitwarden/Bitwarden Secrets Manager and Google Cloud Secret Manager) against the existing B5 contract: exact A/B identity, deterministic SAME-A retrieval, MFA/restricted human ACL, history/retention, auditability, private handling, synthetic rehearsal and reasonable owner overhead. Product convenience cannot weaken SAME-A verification; stronger cloud infrastructure is not required if a simpler human vault passes every requirement.

Proposed custodian remains `Maroine EL Forssa` as sole read/write custodian with no backup at this stage, explicitly preserving the associated account-loss/unavailability limitation. Real credential handling remains private-human-only on the owner's Mac. The accepted B credential goes to Vercel Production only after later credential acceptance and separate Production authorization.

The safe non-event inspector remains **BLOCKED**. The preferred first candidate is Meta's human Access Token Debugger, but only after a separately reviewed synthetic-only handling/transport/authority assessment proves no token-in-URL/history/capture behavior and independent inspector health. No `debug_token` query-string shortcut, Graph Explorer assumption, speculative custom utility, credential, app secret, Meta event or Production action is authorized.

This is a proposal only. Until exact-head review and explicit owner adoption: **B5 = OWNER DECISION REQUIRED**, **safe non-event inspector = BLOCKED**, **PREFLIGHT VERIFIED = NO**, **B1 actual credential acceptance = PENDING**. No Vercel configuration, vault setup or Meta access is authorized by this preparation.


## H3 Revision 7 — 4C verified dataset grant — owner-adopted, 2026-10-04

> **HISTORICAL — SUPERSEDED BY S1** for conflicting credential procedures; original evidence and approval scope retained.

Owner adoption is complete for the reviewed narrow provider-coupling amendment merged through PR #79. Final created-object stage facts are now:

- **4A = VERIFIED C2 CREATION**
- **4B = VERIFIED ASSOCIATION**
- **4C = VERIFIED DATASET GRANT**

Exact 4C binding: lifecycle Employee `61594989243533 / EH Lifecycle R4 Employee / EMPLOYEE` has target dataset endpoint `1152399921284927 / English Hills pixel` with **Use events dataset — Partial access**. Meta also surfaced **Pixel → English Hills pixel → View Pixels — Partial access** from the same one reviewed dataset assignment; independent review concluded **PROVIDER-COUPLED VIEW PIXELS ACCEPTABLE**, and the owner adopted that narrow effect for this exact endpoint only. No Pixel asset was separately selected, no second confirmation occurred, no Manage events dataset permission was granted, and protected/unrelated regressions remained unchanged.

No further Meta mutation is required for 4C. **CREATED-OBJECT PREFLIGHT COMPLETE remains unclaimed**, because the reporting-rule checkpoint is still separate from this factual 4C classification. **PREFLIGHT VERIFIED remains NO**. B1 actual credential acceptance remains PENDING, B5 remains OWNER DECISION REQUIRED, and the safe non-event inspector remains BLOCKED. Generate/Revoke token, token inspection, credentials A/B, Production configuration, H3-06–08, H4, Test Events and lifecycle sending remain unauthorized.


## H3 Revision 7 — 4C dataset grant committed with provider-coupled Pixel side effect — 2026-10-04

> **HISTORICAL — SUPERSEDED BY S1** for conflicting credential procedures; original evidence and approval scope retained.

Owner-authorized 4C executed once under merged 4C-OP1 / main `ae3d7fffb31aa3e296c05ddac1ddc535d31e13e0`: Employee `61594989243533 / EH Lifecycle R4 Employee / EMPLOYEE` was assigned target dataset endpoint `1152399921284927 / English Hills pixel` with **Use events dataset — Partial access**. Target-dataset-side readback confirms the lifecycle Employee now appears alongside protected Conversions API System User `100089438321765`, both with **Use events dataset**.

The same one-click assignment also caused Meta to show a separate **Pixel → English Hills pixel → View Pixels** row on the lifecycle Employee, despite the operator selecting only the Datasets category and exact dataset task. No Pixel asset was selected, no second confirmation occurred, and **Manage events dataset** remained off. The existing protected Conversions API System User already exhibits the same paired Pixel/View Pixels + Dataset/Use events dataset pattern, which is corroboration only.

[4C execution closeout](../architecture/evidence/crm-h3-r7-4c-execution-closeout-2026-10-04.md) still does **not** claim 4C VERIFIED DATASET GRANT yet because owner adoption of the narrow coupling amendment is pending. Independent review concluded **PROVIDER-COUPLED VIEW PIXELS ACCEPTABLE** and found the evidence sufficient to support **4C = VERIFIED DATASET GRANT** with no further Meta mutation after owner adoption. Final read-only regression confirmations record: lifecycle Employee Installed apps none; both protected System Users unchanged; protected app unchanged; C2 Connected assets none; target dataset Partners 0 and Connected assets still only the pre-existing KAL ad account. All final confirmations were supplied before the clock check at **2026-10-04 04:31:05 UTC**, proving completion inside the authorized window ending 05:00 UTC. Preserve current provider state; no removal/reapply/retry/cleanup, token generation, credential operation, Production action or event send is authorized.

Until separate review/adoption resolves whether the paired Pixel/View Pixels row is an acceptable unavoidable provider-coupled effect of the same endpoint grant: **CREATED-OBJECT PREFLIGHT COMPLETE = NOT CLAIMED**, **PREFLIGHT VERIFIED = NO**, B1 actual credential acceptance PENDING, B5 OWNER DECISION REQUIRED and safe non-event inspector BLOCKED.


## H3 Revision 7 — 4C-only operator packet prepared — 2026-10-04

> **HISTORICAL — SUPERSEDED BY S1** for conflicting credential procedures; original evidence and approval scope retained.

PR #77 / 4C-SE1 is owner-adopted and merged at main `487c40bf49dbc1d740a98db90586bd5eb9968c4f`. Independent review concluded **4C SEMANTICS SUFFICIENT** at the dataset asset-task layer: **Use events dataset — Partial access** is accepted as the least-privilege administrative dataset task for the future 4C grant, without treating EH's Employee + C2 route as equivalent to Meta's managed Conversions API System User route. App installation, credential issuance/scopes/effective authority and delivery remain later gates; **Manage events dataset — Full access** remains prohibited.

[4C-OP1](../architecture/plans/crm-h3-05-revision-7-4c-operator-packet.md) prepares one future dataset assignment only: Employee `61594989243533 / EH Lifecycle R4 Employee / EMPLOYEE` → dataset endpoint `1152399921284927 / English Hills pixel` with exactly **Use events dataset — Partial access**, one deliberate Assign assets confirmation, complete fresh pre-action baselines and complete final same-surface noncredential regression readback, then STOP before every credential operation. C2 `29771601672426816` / the verified 4B relationship must remain unchanged.

This is Tier-3 documentation preparation only. No 4C mutation is authorized until exact-head independent review, owner adoption/merge and separate owner action authorization bind the sole operator and a maximum-60-minute UTC window. **PREFLIGHT VERIFIED = NO**, **CREATED-OBJECT PREFLIGHT COMPLETE = NOT CLAIMED**, B1 actual credential acceptance remains PENDING, B5 OWNER DECISION REQUIRED and the safe non-event inspector remains BLOCKED.


## H3 Revision 7 — 4C semantic evidence prepared — 2026-10-04

> **HISTORICAL — SUPERSEDED BY S1** for conflicting credential procedures; original evidence and approval scope retained.

4B has been operationally completed as **VERIFIED ASSOCIATION** and its independently reviewed closeout is owner-adopted and merged in PR #76 at main `11287d8562d55e09d2598e3cd7b888f689e29d98`. [4C-SE1](../architecture/evidence/crm-h3-r7-4c-semantic-evidence-2026-10-04.md) adds stronger nonsecret evidence addressing PR #74's prior **4C SEMANTICS INSUFFICIENT** finding.

The new evidence directly connects the exact current Meta Business Settings task **Use events dataset — Partial access** to Conversions API dataset access: a current CAPI implementation guide instructs assigning that exact task to the **Conversions API System User**; LiveRamp's Meta CAPI program independently requires the same permission before conversion delivery; Meta's own Business SDK confirms authenticated server-side event posting to the pixel/dataset `/events` path; and Glory Lot's existing protected Conversions API System User uses the same dataset task. The proposed review conclusion is **4C SEMANTICS SUFFICIENT FOR THE ADMINISTRATIVE GRANT LAYER**, while token validity/scopes/effective authority and event delivery remain later B1/credential/H4 gates.

This is Tier-3 documentation/research evidence only. **4C remains BLOCKED pending independent review and owner adoption.** No dataset assignment, Generate/Revoke token, app-secret/credential operation, Production change or event send occurred. Manage events dataset remains excluded. **PREFLIGHT VERIFIED = NO**, **CREATED-OBJECT PREFLIGHT COMPLETE = NOT CLAIMED**, B1 actual credential acceptance PENDING, B5 OWNER DECISION REQUIRED and safe non-event inspector BLOCKED.


## H3 Revision 7 — 4B verified association — 2026-10-04

> **HISTORICAL — SUPERSEDED BY S1** for conflicting credential procedures; original evidence and approval scope retained.

**4B = VERIFIED ASSOCIATION.** Under reviewed and merged 4B-OP1 / main `9e906c04b0076cac46cb004d3f20f5eec79830c2`, the owner executed exactly one authorized **Assign assets** action during 2026-10-04 02:55–03:55 UTC: Employee `61594989243533 / EH Lifecycle R4 Employee / EMPLOYEE` was assigned C2 `29771601672426816 / EH Lifecycle R4 C2` using the reviewed **Develop app — Partial access** task. Final Meta readback showed one assigned business asset for the lifecycle Employee: C2 with Partial access summarized as Develop app, View insights and Test app; Installed apps remained empty. A brief immediate post-submit "No assets assigned" view was followed by a read-only "Already assigned" indication and then the final committed Assigned assets view; no retry/reapply/remove occurred.

[4B execution closeout](../architecture/evidence/crm-h3-r7-4b-execution-closeout-2026-10-04.md) records the fresh protected baselines and owner-confirmed same-surface post-action regression: Conversions API System User `100089438321765` unchanged, English Hills CRM `61594759444572` unchanged, protected app English-hills `1069638329182835` unchanged, and C2 Connected assets still none. No dataset assignment, Generate/Revoke token, app-secret/credential action, Production operation or event send occurred.

**STOP after 4B.** Independent review of PR #74 concluded **4C SEMANTICS INSUFFICIENT**, so 4C remains blocked pending stronger nonsecret evidence for the administrative event-upload entitlement of the exact task. Current state remains **PREFLIGHT VERIFIED = NO**, **CREATED-OBJECT PREFLIGHT COMPLETE = NOT CLAIMED**, B1 actual credential acceptance PENDING, B5 OWNER DECISION REQUIRED and safe non-event inspector BLOCKED. Credentials, Production, H3-06–08, H4 and lifecycle sending remain held.


## H3 Revision 7 — 4B-only operator packet prepared — 2026-10-04

> **HISTORICAL — SUPERSEDED BY S1** for conflicting credential procedures; original evidence and approval scope retained.

PR #74 / 4BC-EB1 is owner-adopted and merged at main `6ae006fc0f9322ecc3a843cf8f52e37e0c2ccb91`. Independent review concluded **4C SEMANTICS INSUFFICIENT**, so the next executable provider stage is **4B only**.

[4B-OP1](../architecture/plans/crm-h3-05-revision-7-4b-operator-packet.md) prepares one future association of Employee `61594989243533 / EH Lifecycle R4 Employee / EMPLOYEE` to C2 `29771601672426816 / EH Lifecycle R4 C2` through Assigned assets → Assign assets → Apps with exactly **Develop app — Partial access**, followed by complete Assigned assets / separate Installed apps / C2 / protected-object readback and STOP before 4C. Manage app, every dataset task, Generate token, credentials, Production and event sending remain excluded.

This is Tier-3 documentation preparation only. The exact execution clock is intentionally not started during review; after independent review and owner adoption, a separate owner action authorization must bind the sole human operator and an exact maximum-60-minute UTC window immediately before execution. **PREFLIGHT VERIFIED = NO**, **CREATED-OBJECT PREFLIGHT COMPLETE = NOT CLAIMED**, 4C remains blocked pending stronger nonsecret semantic evidence, B1 actual acceptance remains PENDING, B5 OWNER DECISION REQUIRED and the safe non-event inspector remains BLOCKED.


## H3 Revision 7 — 4A complete; 4B/4C controls bound for review — 2026-10-04

> **HISTORICAL — SUPERSEDED BY S1** for conflicting credential procedures; original evidence and approval scope retained.

**4A = VERIFIED C2 CREATION.** The single authorized creation produced **EH Lifecycle R4 C2 / `29771601672426816`**, owned by Glory Lot `1741597822557523`. The distinct C2 operator ledger on `ops/h3-r7-c2-attempt-ledger` closes at `fd6ffe070e09161615b5dcf836b5bf33c75c89fa` with exactly one Create submission, no retry, no connected assets, no lifecycle-Employee assigned assets or installed apps, and no credential/dataset action. The protected English-hills app `1069638329182835` and protected System Users remained present in the safe post-state views. This supersedes the earlier 4A-preparation/current-state entry below without rewriting its historical evidence.

[4BC-EB1](../architecture/evidence/crm-h3-r7-4b-4c-control-binding-2026-10-04.md) records owner-observed current Meta control discovery performed read-only after 4A. **4B binding is READY FOR INDEPENDENT REVIEW:** Employee `61594989243533` → C2 `29771601672426816` through Assigned assets → Assign assets → Apps, proposed least-privilege task **Develop app — Partial access**. Installed apps remains a separate empty view; **Generate token** is a credential action and is not a 4B discovery/association mechanism.

**4C target/task is bound for review but execution remains held:** target **English Hills pixel / `1152399921284927`**, proposed least-privilege task **Use events dataset — Partial access**; **Manage events dataset — Full access** is excluded. The current UI description does not explicitly state event upload/send authority, so independent review must decide whether the evidence satisfies S4-P1's administrative upload-entitlement requirement. Safe default is 4B-only next commission and STOP if that semantic gate is not closed.

No 4B/4C mutation occurred during discovery; Assign assets was not clicked, no task was saved, Generate token was not clicked, and no token/app-secret/Production/event operation occurred. **PREFLIGHT VERIFIED = NO** and **CREATED-OBJECT PREFLIGHT COMPLETE = NOT CLAIMED**. B5 remains OWNER DECISION REQUIRED; safe non-event inspector remains BLOCKED; B1 actual credential acceptance remains PENDING. H3-06–08/H4 and lifecycle sending remain held.


## H3 Revision 7 4A execution binding — ready for binding review, updated 2026-10-04

> **HISTORICAL — SUPERSEDED BY S1** for conflicting credential procedures; original evidence and approval scope retained.

From merged 4A-OP1 / main `67fa33703354d14d881059f81f8462c61ce063e7`, [4A-EB2 evidence](../architecture/evidence/crm-h3-r7-4a-execution-binding-2026-10-03.md) records **4A EXECUTION BINDING READY FOR REVIEW** from the owner's manual authenticated inspection supplied 2026-10-04: My Apps → Create App, **Create an app without a use case**, Glory Lot / Unverified business, no requirements, Overview with no use cases and final green **Create app** control. Meta describes a bare App ID without added permissions/features/products. The unchanged prefilled contact value is excluded. Safe My Apps/Business Apps/System User metadata readbacks are bound; dashboard metadata is allowed only without secrets/tokens. Manual exact UTC start/end were not supplied. The prior failed author browser attempt remains historical; this update performs no Meta access.

This is branch preparation, not merged/adopted, terminal-CI review readiness or execution authority. Create was NOT pressed and no app/mutation occurred, as attested by the owner. No later CAPI/dataset/credential authority is established; 4B/4C control semantics remain deferred. The distinct future C2 Git write-ahead history and Maroine El Forssa sole-operator model remain prepared, requiring owner confirmation/exclusivity, exact UTC window, live history/reservation and fresh inventories. No operational ledger/reservation is created. B2 PASS/frozen history and 4A/4B/4C, credentials, merge/release, Production, H3-06–08/H4 and sending holds remain; PREFLIGHT VERIFIED NO. Earlier 4A-OP1 branch-merge notices below are historical.

## H3 Revision 7 4A operator packet preparation — 2026-10-03

> **HISTORICAL — SUPERSEDED BY S1** for conflicting credential procedures; original evidence and approval scope retained.

The owner's direct commission records **S4-P1 OWNER APPROVED**, merged [PR #70](https://github.com/elforssa/english-hills-admin/pull/70) at `478d898ecf1f31d052e48f65e37a9f7caa58809c`. [4A-OP1](../architecture/plans/crm-h3-05-revision-7-4a-operator-packet.md) prepares exactly one future isolated Glory Lot-owned **EH Lifecycle R4 C2** creation/noncredential readback, then STOP. It binds the future write-ahead single-use action `EH-H3-R7-C2-CREATE-001`, durable/exclusive ledger acceptance, complete reconciled inventories, success/failure/ambiguity, bounded read-only reconciliation, owner approval template, checklist and execution output schema. Exact creation flow/use case/settings/submit remain **REQUIRES PRE-SUBMIT NONSECRET BINDING**; actual ledger mechanism, sole human and maximum 60-minute UTC window are unbound. No operational reservation is created.

This packet is documentation branch preparation only, not merged/adopted or operator authority. **4A/4B/4C NOT AUTHORIZED**; C2 canonical ID UNKNOWN — NOT YET CREATED in inherited evidence. Permanent Employee `61594989243533` / B2 PASS and frozen B2 history are unchanged. B5 OWNER DECISION REQUIRED; inspector BLOCKED; B1 actual acceptance PENDING; PREFLIGHT VERIFIED NO. No Meta access/mutation, credentials, events or Production operations occurred; no fresh account/deployment verification. Neither CREATED-OBJECT PREFLIGHT COMPLETE nor PREFLIGHT VERIFIED YES may result from 4A. Separate review, adoption and complete exact-action authorization precede execution; merge/release, credentials, Production/H3-06–08/H4/sending holds remain. Earlier S4-P1 unapproved/unmerged notices below are historical.

## CI + Codex Workflow Efficiency v1 — branch implementation, 2026-10-03

CI + Codex Workflow Efficiency v1 is implemented on this feature branch: [Verify](../../.github/workflows/verify.yml) selects safe `docs/**/*.md`-only PRs for lightweight documentation checks and everything else for existing full CI, with an always-running `required` aggregate. [Author handoff policy](../../AGENTS.md#ci-selection-and-remote-ci-handoff) stops CI polling after confirmed scheduling; the coordinator verifies terminal exact-SHA CI before independent-review readiness. This is branch implementation, not merged/deployed evidence; GitHub branch-protection settings are unchanged. Risk tiers, independent review and release approval gates remain separate from test selection.

## H3 Revision 7 Step 4 created-object preparation — 2026-10-03

> **HISTORICAL — SUPERSEDED BY S1** for conflicting credential procedures; original evidence and approval scope retained.

From merged PR #69 / main `408bbe033c1def7bde312728a58d77733ace85fd`, [S4-P1 preparation](../architecture/plans/crm-h3-05-revision-7-step-4-created-object-preparation.md) is documentation branch work only. It recommends 4A C2 creation/readback then STOP, followed by separately reviewed exact-target 4B association / 4C dataset grant with intermediate readback. Permanent Employee remains `61594989243533 / EH Lifecycle R4 Employee / EMPLOYEE`; B2 PASS and its consumed allowance are unchanged. Dataset task: **REQUIRES POST-C2 NONSECRET READBACK**. Persistent C2 creation requires a distinct durable write-ahead attempt ledger and one submit/no blind retry; no operational ledger/reservation is established here.

The final preflight contract is ambiguous about unresolved B5/inspector readiness. S4-P1 proposes the factual **CREATED-OBJECT PREFLIGHT COMPLETE** checkpoint only after complete later setup/readback and separate review/owner adoption; **PREFLIGHT VERIFIED remains NO**, with no new accepted state claimed now. B5 OWNER DECISION REQUIRED; inspector BLOCKED; B1 actual credential acceptance pending. Owner authorization templates are prepared, not approved; no Meta access/mutation or credential/event/Production action occurred. This preparation is not merged/deployed or execution authority; historical Step 3/B2 records are unchanged. Merge/release and Step 4 execution, credentials, H3-06–08/H4/sending remain held.

## H3 Revision 7 B2 execution closeout — 2026-10-03

> **HISTORICAL — SUPERSEDED BY S1** for conflicting credential procedures; original evidence and approval scope retained.

**Current B2 = PASS:** verified creation of the actual intended permanent Employee under owner-approved B2-1 / OP-1. [Dated closeout evidence](../architecture/evidence/crm-h3-r7-b2-execution-closeout-2026-10-03.md) records the owner's execution handoff and frozen operator history at `b650ce14bf1b0f182803ee3641c828d3f9278871` on `ops/h3-b2-attempt-ledger`, following main `9f0b9398c65499d4f3587107aa7e25cb046d0f16` / merged OP-1 PR #68. Permanent nonsecret identity: **EH Lifecycle R4 Employee**, canonical ID **`61594989243533`**, role **EMPLOYEE**, business **Glory Lot / `1741597822557523`**. Action `H3-B2-20261003-1006Z-01` is CONFIRMED SUCCESS: one submission, no retry, exactly one intended new identity, protected users still present and no assets assigned to the new user. The single creation allowance is permanently consumed; no further lifecycle Employee creation is authorized.

B2 PASS means only that Meta accepted creation of this actual permanent intended Employee. [Step 3](../architecture/evidence/crm-h3-r7-step3-preflight-2026-10-03.md) remains historically READ-ONLY PRECREATION PREFLIGHT BLOCKED with B2 INCONCLUSIVE; later B2-1 execution resolves that current blocker without rewriting Step 3. **Full PREFLIGHT VERIFIED: NO.** C2 creation/ID/ownership/readback, installation, dataset/task grants, B1 effective-authority acceptance, B5 external custody, safe non-event inspector, credentials A/B and recovery rehearsal remain unresolved; Production secret/config, H3-06–08, H4 and lifecycle sending remain held. Any created-object / Step 4 stage requires separate authorization. This closeout is documentation branch work, not merged/deployed closeout or fresh provider/Production verification; no Meta access/mutation occurred in this task. Merge/release holds remain. Earlier entries retain their historical limits.

## H3 Revision 7 B2-1 adopted; operator packet prepared — 2026-10-03

> **HISTORICAL — SUPERSEDED BY S1** for conflicting credential procedures; original evidence and approval scope retained.

The owner's direct preparation commission records [B2-1](../architecture/plans/crm-h3-05-revision-7-b2-amendment.md) OWNER APPROVED and merged at PR #67 / `76c89b7462e48a6dc3cbb936f2b7edd6f07b7059` (source head `c34eb1ef6c8adb6d20571d56a9fd8918692814da`). Earlier proposed/unapproved entries are historical. [OP-1](../architecture/plans/crm-h3-05-revision-7-b2-operator-packet.md) is documentation branch preparation only: one future permanent Employee submission, proposed maximum 30-minute window, durable consumed-attempt ledger, complete inventories, explicit success/denial/ambiguity and separately authorized read-only reconciliation. Human operator, actual window and exact-action approval are not yet supplied. B2 remains INCONCLUSIVE; no Create authority, Meta access/mutation, credential, support, event or Production operation occurred. No deployment/provider success is claimed. This PR's merge/release, future execution, Step 4, credentials and H3-06–08/H4 remain held.

## H3 Revision 7 B2-only architecture proposal — 2026-10-03

> **HISTORICAL — SUPERSEDED BY S1** for conflicting credential procedures; original evidence and approval scope retained.

From merged Step 3 main `78153eb2504f4eb33b3d2d35a1b8efa209940930`, the owner commissions documentation only. [Proposed B2-1](../architecture/plans/crm-h3-05-revision-7-b2-amendment.md) permits, only after separate review/owner adoption and exact-action operator authorization, one creation submission for the actual permanent EH Lifecycle R4 Employee. Verified creation would resolve B2 PASS; explicit capacity/eligibility denial fails B2 or the exact affected gate; ambiguous submit remains INCONCLUSIVE — POSSIBLE CREATED OBJECT, with separately authorized read-only reconciliation and no retry. C2-independent completion is not established; a discovered app prerequisite stops for a separate sequence decision.

B2 remains INCONCLUSIVE and the historical Step 3 account result remains BLOCKED. Currently knowable B3/human access PASS, B5 OWNER DECISION REQUIRED and inspection BLOCKED are inherited, not newly inspected. No Meta research/mutation, credential, support contact, event or Production operation occurred. This is proposed branch architecture, not adoption/deployment; merge/release, Step 4, credential and H3-06–08/H4 holds remain.

## H3 Revision 7 Step 3 read-only precreation preflight — 2026-10-03

> **HISTORICAL — SUPERSEDED BY S1** for conflicting credential procedures; original evidence and approval scope retained.

Against merged Step 2 main `e0f74766f36b5881a11defd38ad2960170cb0458` / PR #65, the owner separately authorized one bounded read-only Meta session. [Dated evidence](../architecture/evidence/crm-h3-r7-step3-preflight-2026-10-03.md) records **READ-ONLY PRECREATION PREFLIGHT BLOCKED**: B2 capacity INCONCLUSIVE (one existing Employee, existing custom app Limited access, no proven remaining quota/managed-user exemption). Currently knowable B3 and current human management access PASS; B5 OWNER DECISION REQUIRED and inspection BLOCKED remain credential prerequisites, not causes of the limited account blocker. Future C2/Employee/grant/token/recovery facts are DEFERRED — POST-CREATION OUTPUT. No full PREFLIGHT VERIFIED or credential acceptance is claimed.

The Meta session ended at 07:33:14 UTC within its 60-minute bound. No Meta mutation, credential operation, support contact, event or Production operation occurred. This is documentation branch evidence, not merged/deployed closeout. Step 4, H3-06–08/H4 and merge/release remain held. Historical entries below retain their original authorization/evidence limits.

## H3 Revision 7 owner approval and Step 2 preparation — 2026-10-03

> **HISTORICAL — SUPERSEDED BY S1** for conflicting credential procedures; original evidence and approval scope retained.

Owner approval of Revision 7 at merged PR #64 / `bf295c304e3a4f4361b25b2a852c66ae7091a857` is recorded from the direct Step 2 commission. [Protected preparation](../architecture/plans/crm-h3-05-revision-7-step-2-preparation.md) is documentation-only branch implementation: B5 OWNER DECISION REQUIRED, inspection BLOCKED, rehearsal checklist ready with execution blocked, Step 3 contract drafted. No new account/Production verification or operation occurred. Earlier proposal status below is historical; no credential/dormant/live acceptance state is reached. Merge/release, Step 3/operator work and H3-06–08/H4 remain separately held.

## H3 Revision 7 proposed after merged PR #63 — 2026-10-03

> **HISTORICAL — SUPERSEDED BY S1** for conflicting credential procedures; original evidence and approval scope retained.

[PR #63](https://github.com/elforssa/english-hills-admin/pull/63) is verified merged as `ffd06e5a669a51a8b2934dbf648d1d2214f40606`, from head `e990f026f83ea751a0a8adaad69446cfbea1784d`. Its B1/B4 research findings remain valid historical evidence. The owner commissioned [proposed Revision 7](../architecture/plans/crm-h3-05-revision-7-validation.md), removing Meta support/engineering as a required dependency. The proposal selects C2 and exclusive identity-wide invalidation with a mandatory initial recovery rehearsal. B1/B4 are architecture contracts defined for owner approval, with actual authority/recovery still future fail-closed acceptance gates. No new acceptance state is reached: architecture, preflight, credential, dormant integration and H4 activation are distinct. [Evidence/decision ledger](../architecture/evidence/crm-h3-revision-7-validation-2026-10-03.md).

This is a documentation proposal, not approved architecture or implemented/deployed behavior. Owner decisions remain C2, recovery downtime, custody and non-event acceptance with successful sending unverified until separate H4 use; unisolated synthetic Test Events are rejected. No Meta/credential/Production mutation, support contact or new Production verification occurred. H3-05 remains stopped before issuance; H3-06–08/H4 and merge/release holds remain. The dated revision-6 blocker assessments below describe the earlier evidence model, not a requirement to wait for a provider answer under Revision 7.

## H3 B1/B4 bounded research after PR #61 — 2026-10-03

[PR #61](https://github.com/elforssa/english-hills-admin/pull/61) is verified merged as `2d7bb604b765729eb838b63544d0cb15f3d61e5e`, from reviewed head `89200b6e2fa8e616f802221289a907f1dd44dcc1`. The separately owner-commissioned [bounded research](../architecture/evidence/crm-h3-b1-b4-research-2026-10-03.md) revalidates official provider references and precisely records the remaining facts: **B1 BLOCKED** for a sufficient bounded CRM sender grant combination; **B4 BLOCKED** for independent invalidation caller authority and boundary. Group invalidation is the next confirmation candidate, not a selected supported recovery path. Two provider questions are drafted but not sent. Option C revision 6 remains architecture-blocked and is **not ready for owner approval**; no implementation is approved. C2 remains conditionally preferred for app-level isolation, while C1 needs owner acceptance of shared app-level incidents. B2/B3 remain implementation/preflight gates and B5 an owner custody decision. No Meta/credential/Production mutation or new Production verification occurred; prior H3-04 evidence and all H3-06–08/H4 holds remain intact.

## H3-05 Option C architecture research — blocked, 2026-10-03

[PR #60 owner authorization](https://github.com/elforssa/english-hills-admin/pull/60#issuecomment-5957692568) commissions architecture/research only after Option A was concluded not viable under the approved isolated-recovery requirement. [Proposed credential amendment revision 6](../architecture/plans/crm-h3-05-option-c-amendment.md) and its [fresh official/account evidence](../architecture/evidence/crm-h3-05-option-c-2026-10-03.md) record the review-corrected classifications: only B1 (one supported bounded sending/app/dataset grant contract) and B4 (selected independent invalidation authority/boundary) remain architecture blockers. B2 capacity and B3 app setup/status are fail-closed implementation/preflight gates. B5 external protected custody is an owner/operator architecture decision with exact tool/ACL binding before credential operations; no provider evidence is required. C2 remains conditionally preferred for app-secret/app-administration isolation. C1 remains technically viable with explicit owner acceptance of shared app-level incident coupling; its dedicated Employee isolates ordinary token/group revocation from existing System Users. Neither is selected for execution. Revision 6 is not owner-approved or implemented. H3-05 remains blocked before issuance; no credentials, Meta/Production settings or provider events changed. H3-04 acceptance and H3-06–08/H4 holds remain intact.

## H3-05 recovery research — blocked, 2026-10-02

[Recovery-design revision 1](../architecture/plans/crm-h3-05-credential-recovery.md) records fresh official Meta documentation and authenticated read-only account metadata. The [authorized H3-05 operator attempt](https://github.com/elforssa/english-hills-admin/pull/51#issuecomment-5955549306) stopped before issuance. Meta documents individual system-user-token revocation with same-app caller/app-secret prerequisites and all-token identity invalidation; neither is yet bound to a safely recoverable new direct Events Manager credential. Existing managed CAPI assets/traffic are observed; future token issuer and create-versus-reuse behavior remain unresolved. No token, Meta setting, Production configuration or event changed. H3-05 remains BLOCKED; H3-06–08/H4 remain held. Revision 5 remains historical approved architecture; its earlier route-closure statements do not establish recovery. A dedicated-identity alternative is proposed only, pending provider facts and owner amendment approval.

## H3-04 contract seed — Production verified 2026-10-02

[PR #57](https://github.com/elforssa/english-hills-admin/pull/57), independently reviewed head `142caca2c6f0158b60c6d260cc35735e3505ec68`, merged/deployed as `e3928b369c8790151771d7251aee7030289ec84f`. Production deployment `dpl_6GX4CmHd9QxuGdZgdwJoNoj49X6k` is READY at that exact source and serves `admin.english-hills.com`. Owner-approved migration 106 completed through the explicit-target numbered CLI path in Supabase `hopcezradkhrixwwswxn`; ledger is exactly 001–106 and immutable. Exactly one approved contract exists: `7cf9833e-4f77-4335-b1ec-c047d9353f54` / `eh_meta_crm_r4_v26_r1`. [Exact readback, catalogs, dormancy, health and limitations](../architecture/evidence/crm-h3-04-production-2026-10-02.md).

All other lifecycle inventory remains zero; destination unconfigured/disabled, lifecycle cron inactive, server live gate and dedicated token absent. No provider event was sent. Intake/reconciliation remain healthy; permissions/schema/functions are unchanged. H3-04 is PRODUCTION VERIFIED; H3-05–08/H4 remain separately gated. Earlier branch-only/seed-unapproved statements below are historical and superseded for this seed alone.

H3-05 Entitlement and dedicated secret is the next gated step; it has not been executed or authorized by this closeout. It requires its own artifact-bound operator approval and fresh preflight under revision 5.

## H3-04 seed branch and H3-03 prerequisite — 2026-10-02

The separately authorized H3-04 branch adds forward migration 106 with exactly one approved immutable R4 provider contract. [Implementation evidence](../architecture/evidence/crm-h3-04-implementation-2026-10-02.md) binds the UUID, manifest, real approval/verification dates and acceptance. This is branch implementation only, not merged/deployed or Production verified. [H3-03 operator recheck](https://github.com/elforssa/english-hills-admin/pull/53#issuecomment-5950165952) establishes VERIFIED COMPLETE at source `616ee7d37945ed79dc217ac9aef4e3b51b5dea45`, ledger 001–105, dormant gates and healthy intake. Earlier H3-03 holds below are historical. This author performs no Production operation; H3-05–08/H4 and all activation remain separately gated.


## Reconciliation stale-lease repair — Production verified, 2026-10-02

[PR #55](https://github.com/elforssa/english-hills-admin/pull/55), exact reviewed head `bbeebc288e44dbe14727d2dd8391c628f49cd88d`, merged/deployed as `77c4446e03eda99b2a7ad989b395128576c6fa8e`. Production `hopcezradkhrixwwswxn` has exact immutable ledger 001–105; migration 105 and both RPC bodies/security catalogs match the approved repair. Vercel Production `dpl_65dZJzuLD3mxNb9AkQc9rRtbSZea` is READY at that source and serves `admin.english-hills.com`.

[Production acceptance and limitations](../architecture/evidence/crm-meta-reconciliation-stale-lease-production-2026-10-02.md) records migration-first compatibility, 20 exact bounded HTTP 409/PT409 missing-owner conflicts, no retry amplification or continuing activity, removed temporary function/secret, and at least 30 minutes of healthy scheduled intake/reconciliation after deployment. The Production service-role key remained hosted inside Supabase. Lease loss ends discovery promptly while independent intake proceeds; no authorization, claim, queue or cadence invariant changed. Lifecycle remains dormant with zero activation inventory, inactive cron and absent server live gate/token. [Completed revision-1 plan](../architecture/plans/completed/crm-meta-reconciliation-stale-lease-repair.md).

Repair acceptance is complete. H3-03 closeout may resume only after its separate operator rechecks original dormant compatibility acceptance; H3-04–08/H4, provider/credential, activation and source/cohort changes remain outside this release. Earlier pending or ledger-104 statements are historical; 094 remains immutable and its error contract is superseded by 105.

## Reconciliation incident — owner/operator evidence 2026-10-02

PR #53 merged as `3f6de44e7fc82315209482ed9472b9c2da559f55`. The [H3-03 operator record](https://github.com/elforssa/english-hills-admin/pull/53#issuecomment-5946078325) and owner incident report establish Production ledger 001–104, separately authorized containment of the exactly verified stale-finish retrying backend, zero matching errors after containment and healthy scheduled intake. Lifecycle remains dormant: zero contracts/policies/evidence/epochs/boundaries/ownership/deliveries/attempts/enabled destinations, inactive cron and absent/false live gate. These are inherited operational facts, not fresh Production verification by the architecture author. Earlier unmerged/ledger-103 statements below are historical.

The [bounded repair plan](../architecture/plans/completed/crm-meta-reconciliation-stale-lease-repair.md) was proposed architecture at incident capture; the dated release entry above supersedes that planning state. Migration 094 still deliberately raises `40001` for stale inbound reconciliation ownership; migration 104 did not introduce this bug. Migrations 001–104 are immutable. H3-03 closeout remains held until the repair is separately implemented, reviewed, released and Production-verified; H3-04–08/H4 and all activation operations remain outside this task.

> **Production verified — 2026-10-01:** PR #47 reviewed head `f823b62a3bb06d40b1f572927bfa2af60fd4c857` merged and deployed as `02ffccab1519c0b381196ef9e5f938a908fdd105`; ledger 001–103 and advisory R4 controls are verified dormant. Lifecycle inventory is zero, cron disabled and server live gate absent; existing intake is healthy. [Dated release evidence and limitations](../architecture/evidence/crm-r4-advisory-production-2026-10-01.md). Earlier not-merged/not-deployed or two-event baseline statements below are historical and superseded for current deployment state. H3 architecture approval is recorded below; provider seed execution, Meta/credential changes, Production release and H4 remain unauthorized.

## H3-02 implementation branch — 2026-10-02

The separately authorized H3-02 implementation on `codex/crm-h3-02-compatibility` adds multipart live transport and strict exported-second validation, including already-prepared payloads, through forward migration 104. [Evidence and validation](../architecture/evidence/crm-h3-02-implementation-2026-10-02.md). This branch is not merged/deployed or Production verified; the last recorded Production ledger remains 001–103 dormant. H3-02 is Tier 3 and requires exact-SHA independent review and separate release approval. H3-03–08, credentials, seeds, configuration, sending and H4 remain unauthorized by this implementation task.

## H3 technical package — read-only refresh 2026-10-02

[Technical package revision 5](../architecture/plans/crm-h3-technical-readiness.md) is **ARCHITECTURE APPROVED — READY FOR SEPARATE H3 IMPLEMENTATION**. [Fresh direct Events Manager evidence](../architecture/evidence/crm-h3-direct-capi-credential-2026-10-02.md) verifies dataset `1152399921284927` exposes direct CAPI issuance and official CRM documentation supports that route without custom-app review/permission requests. The previous ads-scope/unpublished-app blocker is closed by route selection, not by proving the custom app's eligibility. No token was generated; no code, settings, permissions or Production changed. Later issuance must be new EH-only, without Dataset Quality API, with Production-only storage and isolated recovery; the current UI warns DQA generation extends permissions to old tokens.

H3 remains a reusable dormant connector independent of the next campaign/form/channel. Legacy exclusion and any necessary intentional retirement remain H4 activation work. The [multi-source assessment](../architecture/evidence/crm-multi-source-readiness-2026-10-01.md) retains Director onboarding, incremental activation, capacity and later website-adapter gaps. The [owner approved revision 5](../architecture/plans/crm-h3-technical-readiness.md#final-owner-architecture-approval--2026-10-02): multipart transport, strict exported seconds, new EH-only direct token without DQA, manifest/disabled dataset configuration with `max_attempts=5`, 30-day metadata review and rotation before the earlier of 90 days or seven days before expiry. Separate implementation/review and artifact-bound operational release approvals remain; this task only records the approval. Migration 103 retains its dated Production-verified dormant evidence; no new Production verification or H3 execution is claimed.

## Owner approved R4 D2 advisory architecture

2026-10-01: owner-approved [advisory custom D2 architecture](../architecture/plans/completed/crm-meta-funnel-r4-d2-advisory.md), PR #46 at `c404815c5539f1651f7f87274f6ff345a45237ff`, is implemented and Production verified through PR #47 and migration 103. The initial independent review found three safety/retention/UI gaps; findings-driven corrections passed exact-head CI and fresh independent re-review of `f823b62a3bb06d40b1f572927bfa2af60fd4c857`, with READY FOR FINAL REVIEW recorded on PR #47. Separately authorized release merged/deployed that head as `02ffccab1519c0b381196ef9e5f938a908fdd105` before applying 103. [Production verification](../architecture/evidence/crm-r4-advisory-production-2026-10-01.md) records source, ledger, security/role probes, closed gates and healthy intake. [Implementation evidence](../architecture/evidence/crm-r4-advisory-implementation-2026-10-01.md) preserves the implementation task's dated limits. Migrations 001–103 are deployed and immutable. Existing required policies retain required mode; new prospective advisory controls are deployed dormant. Both fulfilled implementation contracts are archived. Provider seeding remains separate and unapproved; Meta/credential changes and H3/H4 remain unauthorized.

## H3 preparation after dormant R4 rollout — 2026-10-01

The owner supplied the current Production baseline: SHA `70af2f1331f2539654ffc401507cb310a7785f56`, Supabase project `hopcezradkhrixwwswxn`, ledger exactly 001–102, disabled lifecycle scheduler and absent/false server live gate. Contracts, policies, evidence, epochs, deliveries, attempts, enabled destinations, producer boundaries and ownership are all zero; no EH-native outbound Meta events were sent and inbound intake remains healthy. This preparation task did not independently query Production. These facts supersede earlier not-deployed/two-event statements below and in historical R4 planning documents.

The [H3 readiness dossier](../architecture/evidence/crm-h3-readiness-2026-10-01.md) records fresh official Meta v26.0/payload/credential documentation and read-only authenticated dataset/system-user evidence. Dataset `1152399921284927` is verified; native CRM system user `61594759444572` lacks displayed dataset assignment. Under the clarified proposal, H3 remains blocked by transport/timestamp evidence, native/legacy exclusion design, credential/entitlement, advisory-D2 forward implementation and final technical operator approvals. Actual prospective source/form ID, final mapping, concrete cohort boundary and then-current platform/privacy review belong to H4; no replacement-form/custom-checkbox H3 gate is inferred. A reviewed forward provider-contract seed remains required. At the time of that preparation, 103 was unallocated and unauthored; the separately authorized branch implementation above now allocates it. It has not been applied to Production. No configuration, credential, form, migration, gate, scheduler or provider event was changed. H4 remains outside scope.

Earlier rollout and plan status below is historical wherever superseded by this dated owner-supplied baseline.

## CRM Batch 2 dormant Production rollout

On 2026-09-30 the dormant CRM Batch 2 rollout completed Production verification. [PR #34](https://github.com/elforssa/english-hills-admin/pull/34) merged reviewed head `95ba8c1b1c5f00ee6565e1691fb35e5724356646` as merge commit `26b8b0d609925d3d72b4be1f5929244acac2bf8b`. Vercel Production deployment `dpl_C2ouisA1fpdonK7PuuT7udC1p7hp` was verified **READY**, sourced from that merge commit, with `admin.english-hills.com` among its aliases. The Production ledger contains **098 `crm_lifecycle_evidence_and_delivery`**, **099 `crm_lifecycle_delivery_runtime`** and **100 `crm_lifecycle_scheduler`**; migrations 001–100 are deployed and immutable.

Production acceptance verified `crm-lifecycle-primary` at `*/5 * * * *` with `active = false` and zero runs. Provider contracts, eligibility policies, eligibility evidence, open activation epochs, live deliveries and enabled Meta lifecycle destinations were all zero. No provider credentials or configuration were provisioned, no active-form change was made and no real or test Meta delivery occurred. The existing `crm-intake-primary` remained active and healthy. Batch 2 is therefore deployed **dormant and fail closed**, not live-activated. H3 provider/form/credential readiness and H4 prospective destination/server-gate/scheduler activation remain separately reviewable and require explicit human approval. [Completed dormant-rollout plan](../architecture/plans/completed/crm-batch2-meta-lifecycle-feedback.md).

Earlier deployment evidence below was reviewed 2026-09-29 against main commit `1a370069d9ddd92d531c2a84dc84d737d44391b0` (PR #29). The repository owner later supplied the Batch 1 Production facts below. This architecture branch did not query or mutate Production.

## Owner-confirmed Receptionist Batch 1 release

On 2026-09-29 the owner confirmed [PR #31](https://github.com/elforssa/english-hills-admin/pull/31) and [PR #32](https://github.com/elforssa/english-hills-admin/pull/32) merged, migrations 096 and 097 deployed, and Batch 1 Production acceptance complete. PR #32 merge/source commit is `3c9b9132f29a5fafea44bbb7c93435e15b74bf6e`; its Vercel Production deployment was verified READY. The migration ledger contains exactly `097 | receptionist_group_assignment_filter`. Shared receptionist Students UI and permission restrictions were verified; Meta reconciliation and scheduler remained healthy with no Production runtime errors. The safe teacher projection was also verified in earlier owner-supplied checks. This architecture task fetched current main at that commit but did not independently query Production.

**001–097 are deployed and immutable.** New database work starts after 097, checking current main for occupied numbers. [Completed Batch 1 plan](../architecture/plans/completed/receptionist-batch1-permissions.md).

## Earlier verified Production activation (PR #29 history)

Evidence independently verified on 2026-09-29 after PR #29 and supplied by the repository owner during PR #30 review; this documentation update did not query or mutate Production.

- Production migration ledger includes **095 `crm_intake_pg_cron_scheduler`**. Main also contains [migration 095](../../supabase/migrations/095_crm_intake_pg_cron_scheduler.sql); implementation and activation are separately established.
- Supabase cron job `crm-intake-primary` has schedule `*/5 * * * *` and `active = true`. Automatic pg_cron runs succeeded; Production `/api/cron/crm-intake` calls returned HTTP 200.
- Production Vercel deployment `dpl_7uPQH4WD9MU8PL2txH8SaFBtAudE` is **READY**, sourced from `main` commit `1a370069d9ddd92d531c2a84dc84d737d44391b0`; `admin.english-hills.com` aliases it.
- Production Meta realtime intake is disabled (`enabled = false`); `meta_reconciliation.enabled = true`. Reconciliation has operated with `last_error_code = null`.
- Real Meta intake has been demonstrated end-to-end: at least three real ingestion jobs completed successfully, producing three Meta submissions and three CRM leads. Leads started as NEW with first-contact tasks, without automatically creating students or enrollments. No customer identities or payloads are recorded here.
- [PR #29](https://github.com/elforssa/english-hills-admin/pull/29)'s “095 not applied” statement describes the **pre-activation** state and is superseded by this evidence. Merge alone is still not proof of activation. Live website configuration is not established by this evidence.

## Implemented on main

- Next.js 15 / React 19 App Router, Supabase PostgreSQL/Auth/Storage, TanStack Query, Tailwind/shadcn; see [architecture](ARCHITECTURE.md).
- CRM migrations 078–091 provide lifecycle commands, Today, activities/tasks, placement, enrollment conversion, revenue attribution, durable intake and director reporting. 092–093 add optional learner handling through immutable mapping policy; 094 adds reconciliation and option labels.
- Lifecycle is NEW → CONTACTING → ENGAGED → QUALIFIED → CONVERTED, with LOST/NOT_QUALIFIED closures. Linked Confirmed/Validated enrollment is conversion evidence; starting enrollment is insufficient. [Rules](PRODUCT_RULES.md).
- Meta webhook and reconciliation share `crm_ingestion_jobs`. The reconciliation activation watermark is database-owned `settings.meta_reconciliation.started_at`; per-form lease/due/error state is in `crm_meta_reconciliation_state`. It is rolling lookback discovery, not a persisted pagination/high-water cursor. [ADR-002](../architecture/decisions/ADR-002-meta-intake-and-reconciliation.md).
- Main implements pg_cron + pg_net as primary five-minute trigger, with GitHub Actions backup calling the same protected `/api/cron/crm-intake`. Production activation of 095 was verified on 2026-09-29 as recorded above.
- Website `/api/public/crm-inquiry` durably queues inquiries for the shared resolver. Public `/api/public/inscription` remains a distinct student/enrollment registration flow; the marketing website is external to this repository.
- Meta inbound retrieval has real Graph HTTP transport. Batch 2's lifecycle live transport is deployed behind independent server, database, evidence, contract and scheduler gates, but remains dormant with no provider contract or credentials and an inactive lifecycle cron. Insights remains fixture-only and reports `live_sync_enabled: false`. Code capability does not prove a live connection is configured or activated.
- Dedicated receptionist exists since 077; Batch 1 expanded operational routes and database permissions in merged 096. See [current role boundaries](SECURITY_RULES.md). PR #32 completed the shared Students list and enrollment-aware group filter in 097; Production acceptance is recorded above.

Batch 1 is complete; its historical plan is archived under `plans/completed/`.

## Documentation discrepancies

The imported AGENTS/CLAUDE guidance incorrectly claimed receptionist was removed, five roles, outdated table counts, and root-level middleware. AGENTS also claimed Next.js 14 and no tests. These entry points now defer to verified sources. README role/schema/deployment guidance is corrected. The receipt model's “055 absent from main” / “057 unreleased” text is historical, not current. Phase 12 rollout/checklist/validation and early provider docs retain historical evidence and activation gates; their blanket “production 076” or “not deployed” statements are not a present deployment inventory. The follow-up SQL defaults match the approved Day 1/2/4/6 cadence, but its validator permits other later offsets; live policy values were not verified. The ProtectedRoute header's broad admin/director claim is superseded by its executable director-only CRM analytics check; no application code was changed.

## Active planned work

**Receptionist operations — PARTIALLY IMPLEMENTED overall; Batch 1 COMPLETED.** [ADR-003](../architecture/decisions/ADR-003-receptionist-operations-role.md) retains the wider Today, CRM detail and dedicated walk-in direction as planned.

**CRM Batch 2 live activation — PENDING H3/H4.** The [activation-preparation plan](../architecture/plans/crm-batch2-meta-lifecycle-activation.md) records verified provider payload incompatibilities and unresolved cohort-validation/release prerequisites; approved revision 4 below now owns future event scope; H3/H4 remain blocked. This is a documentation/code assessment, not new Production verification. The implementation and dormant Production rollout are complete; see the [completed plan](../architecture/plans/completed/crm-batch2-meta-lifecycle-feedback.md) and verified evidence above. Official provider-contract verification, active-form evidence readiness, approved notice/field mapping, destination entitlement, separate credentials and prospective release-operator activation remain unresolved. That two-event implementation remains dormant; the approved revision-4 architecture below does not waive or satisfy any activation gate. [Feature index](../architecture/FEATURE_INDEX.md).


**CRM Meta funnel revision 4 — ARCHITECTURE APPROVED; IMPLEMENTED ON THE REVISION-4 BRANCH; NOT MERGED OR DEPLOYED.** From exact base `e50b1ff0d5bea5f4675f212d7ba1aabcafe980c8`, migrations 101 `crm_meta_funnel_r4_schema_controls` and 102 `crm_meta_funnel_r4_runtime_safety` implement the dormant five-event model, prospective producer boundary/ownership controls, chronological activity-backed occurrences and no-uncertain-replay safeguards. No contract, policy, boundary, epoch or activation is seeded. This repository fact does not change Production: current Production remains on the dormant two-event implementation, H3/H4 are not approved, and provider contract/form/credential/legacy-exclusion prerequisites remain blocked. Merge, deployment and Production verification are separate future states. [Approved plan](../architecture/plans/crm-meta-funnel-revision-4.md).

## PR 46 advisory D2 review clarification

The owner-approved documentation-only findings fix defines the [exact sharing-stop locking, scope and retention contract](../architecture/plans/completed/crm-meta-funnel-r4-sharing-stop-contract.md). The former generic lock/submission-only marker is superseded in the proposal. Existing deployed required-D2 policies and Production behavior remain unchanged; the separately authorized 103 branch implementation is recorded above. Final owner architecture acceptance is complete, including opportunity/contact/pending scopes, mandatory actual stops, the exact lock hierarchy and retention/tombstones. Migration 103 is implemented only on the feature branch, pending CI and independent review; deployment is NOT authorized; H3/H4 are NOT approved and remain blocked. [Approval quote and full preserved scope](../architecture/plans/completed/crm-meta-funnel-r4-d2-advisory.md#final-owner-architecture-approval-2026-10-01). No H3/H4 execution is authorized.
