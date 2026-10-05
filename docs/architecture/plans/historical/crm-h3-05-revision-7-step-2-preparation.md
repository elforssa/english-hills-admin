# H3 Revision 7 Step 2 — protected operator preparation

> **HISTORICAL — SUPERSEDED BY S1.** S1 was owner-adopted and merged through PR #93 / main `284c2fe32014f8f3011ac6677ddfe99b0a16ca22`. Use the [sole active S1 Gate-B credential runbook](../crm-h3-s1-gate-b-credential-runbook.md). Conflicting credential/bootstrap/inspector/rehearsal/per-action instructions below are retired, not execution requirements. Preserve original dated observations, findings and approval scope; unrelated R4 delivery safeguards remain. No historical approval authorizes current credential execution or activation.

> **2026-10-03 proposed B2-only addendum:** [B2-1](crm-h3-05-revision-7-b2-amendment.md) proposes a distinct credential-free one-submit authorization for the permanent **EH Lifecycle R4 Employee** after inconclusive Step 3. On owner approval only, it confirms this preparation's Employee label and supersedes its B2-before-creation requirement for that single action; it excludes every app/grant/credential action. The original preparation below remains historical. B5/inspector prerequisites for credentials remain unchanged; no create action is authorized here.

Date: 2026-10-03. Tier 3: credential handling, effective authority and recovery gates, despite a documentation-only implementation. Base: `bf295c304e3a4f4361b25b2a852c66ae7091a857` (merged [PR #64](https://github.com/elforssa/english-hills-admin/pull/64)). Approved design: [Revision 7](crm-h3-05-revision-7-validation.md). This contract supplements its Step 2; it does not change C2/B1/B4/B5 or authorize Step 3.

## Approval and evidence boundary

The owner's direct 2026-10-03 Step 2 commission states Revision 7 at this base is OWNER APPROVED: C2 lifecycle-only app, one dedicated EMPLOYEE, B1 effective-authority acceptance, exclusive identity-wide B4 revoke-all, mandatory A → revoke → verify A invalid → issue/inspect B, downtime, B5 external custody and non-event acceptance with delivery unverified until H4. Meta support is not a dependency. This is approval evidence for the design and this preparation task only. No merge/release or Meta/operator/Production approval is recorded. Prior proposed/unapproved descriptions in the original [evidence ledger](../../evidence/crm-h3-revision-7-validation-2026-10-03.md) are historical; this dated record does not rewrite their findings.

No account state was inspected here. Inherited [H3-04 Production evidence](../../evidence/crm-h3-04-production-2026-10-02.md) describes closed gates, not fresh verification. All future actions below are proposed authorization boundaries, not performed actions. The [implementation template](../../../ai/templates/IMPLEMENTATION_TASK.md) and [operator template](../../../ai/templates/PRODUCTION_ROLLOUT.md) govern separate tasks and exact-SHA review. Merge/release hold, H3-06–08 and H4 holds remain.

## Nonsecret object manifest

Existing objects: NEVER MODIFY IN THIS TASK. Later reads require separately authorized preflight; nothing here authorizes changes to these objects. Future grant association with the existing dataset requires its own exact approval.

| Existing object | Exact identifier/reference | Boundary |
| --- | --- | --- |
| Glory Lot business | `1741597822557523` | Intended owner; no settings/role/quota change |
| Dataset/Pixel endpoint | `1152399921284927` | Only proposed lifecycle target; no event or endpoint substitution |
| Existing System User | `100089438321765` | No reuse, repurposing, grants, token inspection or revocation |
| Existing System User | `61594759444572` | Same exclusions |
| Existing custom app | `1069638329182835` | No settings, install, app-secret or credential change |
| Provider contract | `eh_meta_crm_r4_v26_r1` | Preserve immutable migration 106 and `max_attempts=5` |
| Production sending-secret reference | `CRM_META_LIFECYCLE_TOKEN_EH_R4` | Reference only; no read/write now; never A |

Stable proposed labels below are logical names, not created Meta IDs or existing vault paths. Record real canonical/app-scoped IDs and their demonstrated mapping only as future operator outputs. A and B denote credentials on the SAME new identity, not two identities.

| Future object | Stable proposed label | Required future binding |
| --- | --- | --- |
| C2 app | `EH Lifecycle R4 C2` | One new business-owned lifecycle-only app; real ID/setup/tier |
| EMPLOYEE System User | `EH Lifecycle R4 Employee` | One new identity; real canonical ID and app-scoped subject mapping |
| Credential A | `EH-H3-R7-Rehearsal-A` | First issuance, temporary custody, never EH/Production |
| Credential B | `EH-H3-R7-Sender-B` | Replacement only after proven A invalidity; dormant |
| A custody entry/version | `EH/H3/R7/rehearsal-A@<immutable-version>` | Actual product/container/opaque immutable version; placeholder is not a secret |
| B custody entry/version | `EH/H3/R7/sender-B@<immutable-version>` | Separate entry or demonstrably immutable distinct version; cannot overwrite A |
| Inspector authority reference, if needed | `EH/H3/R7/inspector@<immutable-version>` | Independent human/app authority, separately reviewed; not another token of the dedicated identity |
| Recovery/operator evidence | `EH-H3-R7-Recovery-001` | Nonsecret record, exact approved manifest/tool revision, operator, UTC timestamps and outcome |

## Future action authorization manifest

Each row has one primary classification. Compound operator sessions must enumerate every row individually, target actual IDs, name human/tool/versions, window, preconditions, stop authority and evidence output. No wildcard approval or implicit escalation. Exact task labels/scopes cannot be invented before preflight/operator readback; approval must name them before confirming grants/issuance. Newly observed powers outside C2 stop for amendment.

| Action | Classification | Target and boundary |
| --- | --- | --- |
| Inspect business ownership, capacity, C2 setup route/tier and public setup requirements | READ-ONLY PREFLIGHT | Business above; no wizard submission, upgrade or creation |
| Inspect independent human access, nonsecret control semantics and custody readiness | READ-ONLY PREFLIGHT | Named owner; stop before secret-bearing UI or immediately mutating controls |
| Create C2 app | META MUTATION | Exactly one proposed app under intended business; no existing app edits |
| Create Employee | META MUTATION | Exactly one new EMPLOYEE; never either excluded identity |
| Install/assign C2 app and approved dataset task | META MUTATION | New identity/app, existing endpoint only; precise approved task; no other assets |
| Read back created IDs, role, installed app, complete assignments/inheritance and controls | VERIFICATION ONLY | Nonsecret metadata; cannot pre-exist as Step 3 evidence |
| Issue A; insert into protected vault | CREDENTIAL OPERATION | Manual human; exact new subject/app; immutable A reference |
| Obtain inspector credential/app secret if unexpectedly needed | CREDENTIAL OPERATION | STOP first; additional exact owner authorization and reviewed handling, no automatic acquisition |
| Inspect A before/after revoke or B without events | VERIFICATION ONLY | Approved protected inspector, exact immutable version and independent authority |
| Invoke identity-wide revoke-all once | CREDENTIAL OPERATION | Human, exact dedicated new identity across all apps; no deletion/asset removal substitute |
| Issue B; insert into protected vault | CREDENTIAL OPERATION | Only after explicit A invalidity, same subject/app, distinct version |
| Destroy invalid A after secured evidence | CREDENTIAL OPERATION | Only approved retention policy, after verified invalidity; retain nonsecret reference |
| Check closed gates and unrelated integration health | VERIFICATION ONLY | Later separately authorized nonsecret read-only evidence, no customer/token export |
| Record B1/rehearsal nonsecret verdict | VERIFICATION ONLY | Allowlisted record below; independent acceptance remains separate |
| Store/switch accepted B in EH Production-only secret reference | PRODUCTION MUTATION | Separate later approval; no preview/dev; never bundled with rehearsal |
| Configure disabled destination/H3-06–08, change live gate or lifecycle scheduler/H4 | PRODUCTION MUTATION | Explicitly excluded; separate contracts/approval; no event authority here |

Support contact, /events, Test Events, existing token access, existing app/user/grant changes, Yearly/Apps Script/Zapier actions and shared revocation are absent from the allowed manifest and remain prohibited. Even future read-only verification does not authorize opening a credential-bearing screen with an agent.

## B5 custody and handling contract

**OWNER DECISION REQUIRED.** Repository references protected human custody but records no reviewed external vault product, container, immutable-version mechanism or ACL satisfying B5. Existing Production secret references and prior protected database sessions are not evidence of a lifecycle vault. No local credentials/settings were searched or read to discover a vault. No product is selected by this task.

Smallest owner decision: name the external vault product and dedicated container, confirm Maroine EL Forssa as sole read/write custodian (or explicitly name a backup), and select a private human workstation/session for handling. Provide nonsecret container/version-reference format, retention choice below and access policy. No secret or login evidence belongs in chat. Technical readiness must then be demonstrated with synthetic values before any real credential, not merely asserted by selecting a product.

Required readiness record, signed/dated by the custodian and reviewed independently:

- MFA enforced on human vault and Meta recovery access, encrypted storage/transport, restricted ACL to named custodian; no EH/runtime/agent/CI access to the vault or recovery authority. Audit administration must not expose values.
- Immutable version/history references distinguish A and B and permit retrieving the SAME A after revoke. Store issuance/app/subject/expiry metadata separately from secret values. Do not use token fragments, hashes or URLs as identifiers.
- Secret handling occurs in a private manual session with screen sharing, agent/browser automation, screenshots, recording, browser sync, clipboard history/cloud clipboard, extensions that capture inputs and diagnostics disabled. Direct protected insertion is preferred; any unavoidable transient clipboard is cleared and never synced/persisted. No export/download or plaintext scratch file.
- No plaintext chat, repository, ordinary `.env`, shell arguments/history, environment-variable injection, terminal echo, debug/log/trace/crash capture, browser URL/history, client bundle, database, preview or dev propagation. No `vercel env pull` or similar export path for lifecycle secrets. Later runtime receives B only under separately approved Production storage, server-only.
- Retain A in encrypted restricted custody at least until verified invalidity and secured evidence; failed/inconclusive revoke retains A as possibly valid, with access locked to the custodian. No deletion that prevents verification. Proposed retention: destroy invalid A within 24 hours after independent acceptance evidence is secured; owner must bind the vault's deletion/history behavior and approve that policy before issuance. Preserve the nonsecret immutable reference and destruction attestation. If history retains plaintext indefinitely, record controlled encrypted retention/ACL and obtain explicit owner acceptance instead of claiming destruction.
- Synthetic rehearsal proves private insertion, distinct versions, same-version retrieval, allowlisted evidence export and recovery access independent of EH/sender. Record test date/tool revision and pass/fail only; no synthetic value is needed in repository evidence.

B5 becomes READY only after selection, ACL/MFA/retention binding, synthetic handling validation and separate review pass. Owner selection cannot waive unsafe tooling. Inspector authority custody, if required, is separately restricted and outside revoke-all's identity. No runtime app secret or recovery token is provisioned.

## Manual human takeover boundary

No takeover is performed now. Future agents may inspect authorized nonsecret inventory, labels, IDs, capacity, documented setup choices and safe nonsecret recovery-control descriptions. They must stop BEFORE opening a screen likely to display credentials, including issuance confirmation or any debugger, not wait to redact a captured secret.

| Future surface | Required human boundary | Nonsecret return |
| --- | --- | --- |
| Unexpected app-secret requirement | Stop before reveal/access; new explicit credential-operation approval and inspected tool contract needed | Whether required, documented reason, target app, protected reference if separately approved; never value |
| A generation | Human takes over before credential-bearing issuance UI; verify approved scopes before confirmation | Issued/failed/ambiguous, subject/app, issuance UTC, exact grant list, immutable A reference |
| B generation | Same, with recorded A-invalid gate checked first | Same metadata for B plus A-invalid evidence record |
| Any token debugger/inspection UI | Entire interaction human-only; still BLOCKED until URL/history/log/capture safety is reviewed | Allowlisted inspection result, source/time/version/authority reference; no screenshots/raw response |
| Vault insertion/version retrieval | Human-only private vault session; no agent clipboard or vault value read | Container/immutable version, ACL readiness and retention attestation |
| Revoke controls | Human-only if secret material may appear; safest default is human-only for the whole mutation | Exact identity, all-token scope, action UTC/confirmation and outcome; no secret-bearing screenshot |

A manual session alone does not make a debugger safe: credential-bearing URLs/history or diagnostic capture remain disallowed. Agent resumes only on a known nonsecret surface or detached sanitized record, never inspecting the previous sensitive tab. Human may report ambiguity; agents cannot resolve it by reopening sensitive UI or repeating mutation.

## Safe non-event inspection contract

**BLOCKED: no currently established mechanism satisfies all constraints.** No real token was inspected. Candidates are Meta's [debug_token reference](https://developers.facebook.com/docs/graph-api/reference/debug_token/) and a private human Access Token Debugger. Public fetch of the official reference on 2026-10-03 returned HTTP 429; an attempted current debugging-guide URL was inaccessible. These attempts establish no supported secret-safe transport or current inspector caller eligibility. Third-party search results are not adopted as authority. The existing [research ledger](../../evidence/crm-h3-b1-b4-research-2026-10-03.md) and Revision 7 require explicit invalid-token evidence, not a dataset permission error.

Neither Graph Explorer, a documented query-string recipe nor an unreviewed debugger is approved. Tokens in URLs violate this contract even when TLS encrypts transport. No curl/CLI token argument, query-string input, HAR, request dump, raw error output or screenshot is acceptable. Inspection never calls /events or any write endpoint and is not an upload-entitlement test.

Before credentials, commission a focused inspection-method assessment/review after vault selection. Prefer an existing protected human/operator mechanism if it can prove supported non-URL input, independently authenticated inspection and capture-free handling. Authenticate the inspector with independently available human/app authority eligible for the new app; record authority type and protected reference, not its credential. A/B or another token of the revoked identity must not authenticate the inspector. Meta login MFA/session may be suitable for a human tool only after eligibility and handling are verified. An app access token/secret is an additional credential boundary, requiring explicit approval; it is not presumed available. Post-revoke inspector health must be demonstrable independently of A, without creating another lifecycle token or testing an event.

Required request binding: exact method/tool/version, fixed Meta host and supported version/path, target immutable vault version, issuing app/subject mapping, independent inspector authority and source of its eligibility, inspection UTC, timeout and allowlisted response schema. Prove from current official documentation plus protected tool testing that token input can avoid URLs and that inspector failures can be distinguished from evaluated-token invalidity. If supported body transport cannot be established, do not build a GET-with-body or POST workaround on assumption. A failed HTTP request or expired inspector is INCONCLUSIVE.

Permitted evidence: logical credential label, immutable vault reference, app ID, subject ID/mapping, type, explicit validity boolean, issued/expiry/data-access timestamps and documented meaning of zero/missing, scope names, granular target IDs, source/method/version, independent inspector health, observation UTC, fixed sanitized failure category and record ID. Recovery evidence also records the latest permitted revoke-completion UTC, observation deadline, clock-margin check and expiry-exclusion rationale. App/subject missing on an invalid response may be linked to A's prior valid record through the unchanged immutable vault version; absence is not a new subject mapping.

Never record: token/fragment/hash, app secret, human session/cookie/authorization headers, input URLs/request bodies, raw provider response/errors, debugger screenshots, personal profile/contact data or customer/event payloads. Emit only a strict field allowlist; arbitrary provider strings are not safe merely because called errors. No token fingerprint is needed: immutable custody binds the same A.

| Result | Exact evidence requirement |
| --- | --- |
| VALID | Successful authenticated non-event inspection explicitly reports `is_valid=true` (or independently reviewed documented equivalent), bound to selected app/dedicated subject and current immutable version; inspector healthy; metadata/lifetime coherent. This alone does not pass B1 |
| INVALID | SAME A reference, healthy independent inspector, successful token-inspection response explicitly `is_valid=false`; any equivalent explicit invalid-token result must have its documented semantics and disambiguation approved before operations. For successful revoke-all recovery, A must also satisfy the pre-revoke lifetime/deadline/clock-margin prerequisite below, with natural token or operative data-access expiry excluded as an explanation. An explicit expired result or any expiry-confounded invalidity is unsuccessful/INCONCLUSIVE recovery evidence and prohibits B. Revocation confirmation alone does not suffice |
| INCONCLUSIVE | Timeout/network/auth failure, malformed/missing validity, unclear error subject, unavailable inspector health, stale result, ambiguous version/target, permission denial on asset reads, conflicting metadata or expiry that could explain A invalidity. Never infer invalidity from loss of access |

Smallest utility design, ONLY if no existing mechanism passes: a standalone external operator process outside EH runtime/Next.js/CI, receiving immutable vault handles through a reviewed vault integration and independent inspector authority; no argv/env/file input of secrets. Retrieve transiently into memory on a hardened private host; fixed allowlisted non-event endpoint/method with proven supported body input and inspector header/session auth; reject redirects, eight-second request timeout, bounded response, no retries, no tracing/core dumps or request logging; drop raw errors and output only the schema above. No generic Graph proxy, recovery API, vault exporter, event sender or Production integration. Synthetic tests must cover valid/invalid, wrong app/subject/version, inspector failure, echoing secret errors, malformed/oversized responses, timeout/redirect and URL/argv/log leakage. A separate focused implementation and exact-SHA independent review are prerequisites to any credential use. This task implements no utility because transport/caller/vault prerequisites are unestablished; speculative code would not clear the blocker.

## Rehearsal checklist and observation contract

**Checklist READY as a preparation artifact; execution BLOCKED on B5/inspection, Step 3 and exact operator authorization.** Record UTC timestamps and monotonic elapsed time. These are local acceptance budgets, not Meta propagation guarantees. Bind dates and the entire window in the later approval; no open-ended polling.

- A-before inspection must finish within 5 minutes before revoke, while A is unexpired and valid. BEFORE invoking revoke, bind and record a latest permitted revoke-completion UTC `R`. Document A's token expiry and every operative data-access limit: each finite limit must be strictly later than `R + 610 seconds + 120 seconds`. Documented non-expiring values are acceptable; zero/missing values without documented meaning are not. The 120-second clock margin is a local safety allowance, not a provider guarantee: record evidence that combined operator/provider timestamp uncertainty is bounded by that margin; if it cannot be established, stop INCONCLUSIVE before revoke. Reconfirm these lifetime bounds, unchanged identity/app/grants and independent authority at the mutation boundary. Stale evidence or an insufficient/unknown lifetime prevents revoke; record the unmet prerequisite and do not issue B.
- Invoke revoke-all ONCE; t0 is confirmed action completion UTC. An ambiguous completion has no trustworthy t0: stop INCONCLUSIVE, no automatic retry and no B. If explicit failure, FAIL. Confirm `t0 <= R`; later or uncertain completion defeats the prebound lifetime protection and makes recovery INCONCLUSIVE, with no B.
- For a confirmed revoke, authorized read-only checks of SAME A start immediately (by t0 + 10 seconds), then at t0 + 30, 120, 300 and 600 seconds, at most five calls; each has eight-second timeout. Only a healthy explicit VALID result before the deadline permits the next scheduled read. Stop on first explicit INVALID that meets the recovery criterion, including expiry exclusion; if natural token/data-access expiry could explain invalidity, stop with unsuccessful/INCONCLUSIVE recovery evidence and prohibit B. Stop immediately on inspection ambiguity/failure. Final check begins by 600 seconds and completes by 608 seconds; hard total observation deadline is t0 + 610 seconds. No catch-up calls or schedule extension if a slot is missed.
- A explicitly VALID at the final check is FAIL (recovery not proven within budget). No conclusive final evidence by hard deadline is INCONCLUSIVE. Both block acceptance and B; retain possibly valid A. Do not keep checking until it works.
- B issuance becomes allowed only after recorded explicit A INVALID with natural token/data-access expiry excluded under the lifetime/deadline/clock-margin prerequisite, inspector health, unchanged closed gates and continuing independent recovery authority. Issue B once within 15 minutes of that proof; expiration of this local session allowance is INCONCLUSIVE and requires a newly bounded owner-authorized window, never spontaneous issuance. Complete B inspection/B1/closing evidence within 30 minutes of B issuance; failure/expiry of this budget blocks acceptance. No automatic reissue or rollback to A.
- Review metadata every 30 days. Rotate before earlier of issuance + 90 days or actual token expiry − 7 days, retaining approved downtime. Record data-access expiry separately; any earlier operative limit must also bound usable lifetime/rotation. Zero/missing lifetime needs documented meaning and feasible governance dates; unknown or already too-short window fails acceptance. The 30-day review is not an automated scheduler authorization.

Expiry-confounded example: A valid before revoke but expiring at `t0 + 90 seconds` cannot satisfy the pre-revoke lifetime prerequisite. An invalid result at the 120-second check is unsuccessful/INCONCLUSIVE recovery evidence, not proof that revoke-all worked; B must not be issued. The same rule applies to an operative data-access expiry.

| # | Required evidence / PASS condition |
| --- | --- |
| 1 | Complete new identity/app/asset/consumer inventory: EMPLOYEE, only C2 installed, only approved endpoint/task, no inherited unrelated powers; real ID mapping confirmed; no preexisting/uncontrolled tokens |
| 2 | Human issued A exactly once into reviewed custody; immutable reference and issuance record |
| 3 | A explicitly VALID before revoke, app/subject and grants coherent, inspector independent/healthy; documented token and every operative data-access limit are non-expiring or strictly beyond `R + 610 + 120 seconds`, with clock uncertainty bounded by the 120-second margin; prerequisite recorded before revoke |
| 4 | Destination unconfigured or disabled; nonsecret before/after evidence |
| 5 | Server live gate closed; nonsecret before/after evidence |
| 6 | Lifecycle scheduler inactive; nonsecret before/after evidence |
| 7 | H4 unauthorized throughout; action inventory contains no activation/event |
| 8 | Human independently invoked all-token revoke once on exact new identity; scope across apps understood; neither existing identity targeted |
| 9 | SAME A explicitly INVALID within observation budget, healthy independent inspector, `t0 <= R` and item 3 lifetime/clock prerequisite satisfied; natural token/data-access expiry excluded as an explanation and rationale saved. Expiry-confounded invalidity is unsuccessful/INCONCLUSIVE recovery evidence, never PASS; B prohibited |
| 10 | B issuance timestamp later than proven A-invalid recovery timestamp satisfying item 9; same exclusive identity/app; no overlapping preissue |
| 11 | B explicitly VALID from distinct immutable version, correct subject/app and healthy inspector |
| 12 | Complete B1 record below accepted, including administrative upload entitlement; actual event delivery remains NOT VERIFIED |
| 13 | Named human MFA recovery/control remains available independently of EH and sender; safe post-operation attestation/control evidence |
| 14 | Before/after nonsecret assignments/configuration and passive health summaries show existing integrations unchanged; no customer/token reads or active probes |
| 15 | Human action/tool audit and separately authorized gate/delivery-counter summaries show no lifecycle event sent; no /events/Test Events action. Mere absence of error is insufficient |

Each item records PASS/FAIL/INCONCLUSIVE, source class, target, operator, observation time and limitations. Overall PASS requires all 15 PASS and independently accepted B1/custody/recovery evidence. FAIL means demonstrated violation, known incorrect authority, explicit revoke/issuance failure, A still valid at final check, invalid B, unrelated effects or event sent. INCONCLUSIVE means missing/conflicting/unverifiable evidence, ambiguous mutation/inspection, expiry-confounded invalidity, unestablished lifetime/clock bounds or missed deadline. Neither FAIL nor INCONCLUSIVE accepts B or permits Production storage. Revision 7's failed-recovery gate treats either as unsuccessful acceptance, without disguising unknown validity as proven failure/success. Preserve exact last-known A/B validity and closed gates; only preauthorized containment on the new identity may be used. No automatic retry of issue/revoke; a new bounded owner-authorized window must reconcile prior action/credential inventory first. If an existing integration would need mutation, stop for architecture/owner decision.

## Credential B effective-authority acceptance record

Use `EH-H3-R7-Recovery-001`, with a separate B1 section. Nonsecret template fields (unfilled now):

| Layer | Required fields and decision |
| --- | --- |
| Provenance | Operator, reviewer, approved plan/tool revision, exact app/subject/version, UTC observations, official/account/empirical evidence class, complete pagination and limits |
| EMPLOYEE role | Actual role, inherited powers, source; reject ADMIN or unbounded management |
| App | Actual C2 ID/owner, use case, status/access tier, supported own-business CAPI evidence, security/proof requirements |
| Installed-app relationship | Exact installed/assigned app, app tasks/control, subject mapping; lifecycle-only full-app control if demonstrably required is disclosed residual authority |
| Assigned assets | Exhaustive typed IDs, assignment source/inheritance and tasks; endpoint alone permitted; no default Page/ad-account |
| Dataset/Pixel task | Exact UI task label and API enum if documented/exposed, endpoint relationship, evidence of administrative upload entitlement; read/analytics-only is insufficient |
| Token scopes | Exact scope list and granular grants/target IDs, locked/requested grants, supported requirement and rationale for EACH power |
| Other accessible assets | Exhaustive effective inventory, inherited/scope-dependent powers and pagination; record none only with complete evidence, not denied reads/navigation absence |
| Expiry/data-access expiry | Issued UTC, actual raw nonsecret timestamp values, documented interpretation, usable lifetime, 30-day review and rotation due dates |
| Unexpected grants | Explicit none with evidence, or list with explanation/disposition; unexplained broad grants reject acceptance |
| Acceptance rationale | Reconcile role/app/tasks/scopes/effective authority, all residual powers within lifecycle responsibility, B valid and rehearsal passed; independent decision and timestamp |
| Rejection rationale | Exact failed/missing gate, last-known validity, containment and owner decision needed; no trial-and-error scope expansion |
| Delivery proof | NOT VERIFIED — non-event entitlement and recovery acceptance only; first genuine H4 receipt separately authorized |

No globally minimum scope set is required. `business_management` is not accepted simply because EMPLOYEE or a small asset list appears: prove management cannot expand into unrelated assets/users/business powers. Uninspectable effective access, incomplete inventory or unexpected runtime app-secret proof requirement fails closed and returns to reviewed architecture, not credential experimentation.

## Step 3 read-only preflight commission draft — DO NOT EXECUTE HERE

Scope ready to commission as a bounded separate task after this preparation's independent review and explicit owner authorization. B5 selection remains an owner decision; inspection/rehearsal remains blocked. Step 3 may document unresolved readiness, but must not certify PREFLIGHT VERIFIED or advance to credentials on that basis. It may not solve inspection by handling real tokens.

Proposed commission: one named operator, one 60-minute read-only session against business `1741597822557523` and endpoint `1152399921284927`, dated approval naming this manifest revision; nonsecret source/UTC/target/results only. Inspect safe authorized surfaces; stop before credentials, immediate mutations or uncertainty. Deadline expiry yields incomplete preflight, no continued browsing without a new bounded commission. No Meta support, creation, wizard submit, installs/grants, token access, secrets, tier changes, event or Production operation. Do not inspect the existing users' tokens or secret-bearing existing-app pages.

| Gate | Future read-only evidence | Stop condition |
| --- | --- | --- |
| B2 | Current capacity/rules support exactly one additional EMPLOYEE; no upgrade; existing IDs remain untouched | Unknown capacity, quota upgrade, deletion/repurposing or second identity required |
| B3 | Intended business/setup supports creating C2; documented own-business CAPI route and supported tier/status requirements; safe account-visible eligibility consistent with docs | Unexpected App Review/publication/materially broader capability, forced existing app change, proof secret/runtime amendment or event-validation requirement |
| B5 human | Named custodian's authenticated MFA access/control authority outside EH; actual nonsecret recovery-control scope/semantics accessible; whether control mutates immediately | Unknown/ambiguous target/scope, absent independent authority, shared identity or secret-bearing UI requiring unapproved handling |
| B5 tools | Named external vault/container/ACL/version/retention, synthetic handling evidence and reviewed safe inspector eligibility/transport/capture behavior | Missing owner selection, failed synthetic demonstration, unreviewed utility or credential needed to discover readiness |
| Baseline | Safe nonsecret object/assignment/configuration inventory and passive unrelated-integration health where separately authorized; no customer payloads | Conflict with manifest; inability to prove untouched boundary must be reported, not guessed |

Preflight outputs are PASS/FAIL/INCONCLUSIVE per gate, exact sources/time, visible control semantics and readiness gaps. General public documentation or an observed button alone never proves new-object eligibility/revocation. No probing a control by clicking it to learn semantics.

Facts that cannot exist before separately authorized creation are operator outputs, not pre-creation blockers: actual new app ID/ownership/status/security requirements; actual Employee canonical/app-scoped mapping; installed-app relationship; actual asset/task readback; exact issuance choices/locked scopes if exposed only in the future issuance workflow; token expiry/data-access metadata; actual revoke result; A/B inspection and effective B authority. Still bind allowable responsibility/task criteria before creation; inspect actual grant manifest BEFORE confirming issuance. Final PREFLIGHT VERIFIED requires created-object readbacks under Step 4 approval, not invented IDs or claims from Step 3. Capacity/setup uncertainty visible now is a genuine preflight blocker; nonexistent future IDs are not.

## Implementation decision and handoff

Documentation only. No code/tooling, runtime/SQL/CI edit or migration added. The existing [adapter](../../../../src/lib/crm/lifecycle/adapter.mjs), [worker](../../../../src/lib/crm/lifecycle/worker.mjs) and [server gate](../../../../src/lib/crm/lifecycle/server.js) consume a separately supplied server-only sending token and do not provide safe operator custody/inspection/recovery. They must not be repurposed into an inspector. B5 OWNER DECISION REQUIRED; inspection BLOCKED; rehearsal checklist READY but execution BLOCKED; Step 3 contract ready for separate commissioning with those gaps explicit. Preparation completeness does not imply execution readiness.

Validation: documentation relative-link/anchor, source/approval/prohibition checks, secret/PII check, `git diff --check`, one focused author self-check and unchanged exact-head CI. Final handoff records PR/head/base/tested merge and run results outside this self-referential document. Formal independent review is a separate owner-launched task. No Meta account access/mutation, credential operation, support contact, /events/Test Events or Production operation occurred. No H3-06–08/H4, Vercel/Supabase change or Yearly/Apps Script/Zapier change occurred. The only missing owner selection is the B5 vault/container/ACL/private-session/retention binding above; inspector readiness needs reviewed technical evidence, not an owner waiver.
