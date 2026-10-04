# S1 Gate-B credential operator runbook

Revision **S1-GB-OP1**, 2026-10-05 (Asia/Shanghai). **Tier 3 — credential/security/provider-operation policy.** Implements adopted [S1](crm-meta-lifecycle-credential-simplification.md) at [PR #93](https://github.com/elforssa/english-hills-admin/pull/93), main `284c2fe32014f8f3011ac6677ddfe99b0a16ca22`, in existing [PR #91](https://github.com/elforssa/english-hills-admin/pull/91).

## Purpose and authority

Configure supported Meta state → establish minimum authority → generate **one final dedicated System User token** → validate it once → store that exact token directly in Vercel Production → **CREDENTIAL READY → STOP**.

This is the sole active credential procedure. Execution requires focused independent review of this contract and explicit owner Gate-B operational approval covering supported configuration, capability retention risk, final issuance, conditional Production storage and bounded failed-token containment. This documentation commission authorizes no operations or release. Follow [AGENTS](../../../AGENTS.md) and the [rollout approval template](../../ai/templates/PRODUCTION_ROLLOUT.md); ordinary provider screens/readbacks within this approved outcome need no separate review or per-click GitHub record.

## Fixed identities

| Binding | Exact target |
| --- | --- |
| Business | Existing Glory Lot / `1741597822557523` |
| App | `29771601672426816 / EH Lifecycle R4 C2` |
| System User | `61594989243533 / EH Lifecycle R4 Employee`, EMPLOYEE |
| Dataset endpoint | `1152399921284927 / English Hills pixel` |
| Vercel team/project | `team_egUbt9wN23I40I1K71zxfYGj` / `prj_hC0MvqsXYmERXhZWGEfOOma8D6E3`, `english-hills-admin` |
| Server secret | `CRM_META_LIFECYCLE_TOKEN_EH_R4` |

No silent substitutions. Navigation row `1568116421343147` is not the dataset endpoint. Preserve Develop app partial and Use events dataset partial / coupled same-endpoint View Pixels; no speculative Admin/full-control or unrelated asset access. Existing intake/shared identities and credentials are outside scope.

## Preconditions and C2 configuration

Before generation confirm correct identities/assignments, MFA-protected human recovery, disabled destination, absent/false server live gate, inactive lifecycle scheduler and no unexpected lifecycle inventory. Confirm no existing Production token key unless explicitly approved rotation, DQA excluded, required capability present or approved within Gate B, exact scopes and supported lifetime established, safe diagnostics available, and direct operator access to the correct Vercel Production Secret form. These are normal Gate-B checks.

If needed to expose the supported own-app/System User CAPI token flow, attach only **Create & manage ads with Marketing API**: select use case → Save → expected Add to app confirmation → Add to app; then inspect actual resulting capability/tier/assignments/chooser state. Reconcile current state first; do not replay already completed actions. Gate B must accept potentially non-removable capability retention before attachment. An ambiguous high-impact result requires state reconciliation before retry, without blind repetition or compensating cleanup.

Do not automatically publish, request App Review, perform Business Verification, upgrade Marketing API Access Tier, add optional capabilities, configure Facebook Login/Webhooks, accept Marketing Messages terms, enable DQA or change unrelated assets. Publication/review/verification are not assumed prerequisites for this route. If the current Meta flow proves a required step materially expands the security boundary, **STOP and return to Gate A**. Ordinary confirmations are part of Gate B.

## Resolve authority before generation

**Exact minimum token scopes: NOT YET ESTABLISHED.** Resolve the minimum supported permission set for this own-business CAPI lifecycle route from accessible current first-party Meta guidance, actual System User chooser, C2 capability, Employee assignments and dataset entitlement. Do not guess, choose every offered permission or issue a token experimentally. Marketing examples and app permission availability alone do not establish this recipe. If safe resolution fails, report that single concrete scope blocker.

Record one small nonsecret authority manifest:

| Field | Required record |
| --- | --- |
| App capability / Marketing API access tier | Actual capability and tier (tier is not a token scope) |
| Employee role/tasks / assets | EMPLOYEE; app tasks, assigned dataset/Pixel and intended dataset/account reach |
| Token authority | Exact minimum requested scopes; any provider-added/default scopes and why acceptable |
| Lifetime | Supported approved choice; Never/non-expiring if available and accepted, otherwise finite expiry with replacement owner/date |
| Diagnostic | Supported first-party surface and expected subject/class, lifetime and entitlement interpretation |

No unexplained excess or uninspectable authority is acceptable. Use the [S1 validation semantics](crm-meta-lifecycle-credential-simplification.md#supported-configuration-and-validation-contract) for app-scoped subject mapping, expiry and granular-target limits.

## One final credential and one validation

Enter the private **human-only** secret interval. Disable AI/browser automation, recording/screen sharing, browser sync and clipboard history/cloud sync where controllable; use no capture tooling. Nonsecret setup may span sessions. Keep issuance → validation → direct storage continuous and private, with no intermediate persistent copy.

Generate one final token with only the manifest's approved scopes/lifetime. No A/B pair, experimental token or second credential for testing. Never place raw tokens, fragments, fingerprints/hashes, app secrets or raw diagnostic output in GitHub, chat, docs, logs, terminal/history, files, notes or screenshots. Transient clipboard may move the token only between Meta's supported diagnostic surface and Vercel.

Validate that exact final token once in a bounded inspection, preferably Meta's first-party Access Token Debugger. Establish:

- valid token and expected C2 app/issuance context;
- expected System User class and Employee identity, including supported mapping if the subject is app-scoped;
- acceptable lifetime and applicable data-access expiry semantics;
- required requested scopes present, provider defaults explained and no unexplained excessive authority;
- intended dataset/account entitlement consistent with `1152399921284927` and assigned assets.

Record nonsecret results only. No Chrome monitor, interception, HAR, DevTools network capture, hand-built token-bearing URLs, custom scripts, app secret or synthetic markers. Trust the supported diagnostic UI without claiming proof of its internal transport. No event request is a credential test. If any material fact fails or is inconclusive, do not accept/store: safely contain/revoke under the approved recovery scope, correct the specific problem and stop experimental issuance. A genuine replacement gets its own bounded validation.

## Direct Vercel Production storage

On validation PASS, transfer the exact accepted token directly into **`CRM_META_LIFECYCLE_TOKEN_EH_R4`** in the fixed EH project: server-side, **Production only**, sensitive/Secret type. No Preview, Development, custom duplicate, readable type, intermediate copy, value readback/export or `vercel env pull`.

Verify metadata only: correct project, key exists once, sensitive/Secret and Production target only. Never retrieve or compare the stored value. Clear transient clipboard and close secret-bearing surfaces. If interrupted or storage is ambiguous, use metadata-only reconciliation and recovery; never park or retrieve the value.

## Credential closeout — STOP

Record only date/operator, exact app/System User/dataset, accepted scopes (including explained defaults), lifetime/replacement limits, validation PASS, Vercel metadata PASS and residual limits. All facts must pass before declaring:

**CREDENTIAL READY**

**DELIVERY SUCCESS NOT VERIFIED**

**LIFECYCLE DELIVERY REMAINS DISABLED**

STOP. This credential-only #91 revision excludes H3-06 destination writes, H3-07/H3-08 dormant acceptance, H4 source/cohort activation, server live gate, scheduler, Test Events and real lifecycle events. Credential readiness does not authorize a redeploy or resumption. Preserve all merge/release and activation holds.

## Recovery

With explicit bounded owner recovery authority: keep/disable delivery closed → safely revoke/retire exposed, invalid or expired credential → issue one replacement → validate once → replace the same Production secret → verify metadata → separate redeploy/resumption authorization if needed.

Prefer supported targeted revoke. If only identity-wide revoke is available, confirm the dedicated Employee has no unrelated consumer and revoke **before** issuing the replacement so it is not also revoked. Use explicit Meta control-plane confirmation; ambiguity means stop and reconcile, without repeated mutations or a fixed polling ritual. Never touch shared intake credentials. No A/B rehearsal, old-token retention or empirical invalidity polling. Vercel storage does not establish that a deployment loaded the replacement; separately authorized release/resumption must preserve dormant controls and no uncertain replay.

## Evidence and present state

**Architecture adopted; credential not yet ready; lifecycle not live.** No new provider/Production observation is claimed. [Issuance investigation](../evidence/crm-h3-r7-issuance-contract-research-2026-10-04.md) preserves the own-app/System User route, C2's original no-permissions chooser, observed Marketing configuration flow and unresolved exact scope recipe. [4B](../evidence/crm-h3-r7-4b-execution-closeout-2026-10-04.md), [4C](../evidence/crm-h3-r7-4c-execution-closeout-2026-10-04.md) and [Vercel preflight](../evidence/crm-h3-r7-vercel-b5-preflight-2026-10-04.md) preserve dated identity/grant/custody evidence. The [full Rev7 packet](crm-h3-r7-bootstrap-credential-operator-packet.md) remains **HISTORICAL — SUPERSEDED BY S1**; its approvals/findings retain their original scope and are not executable policy.
