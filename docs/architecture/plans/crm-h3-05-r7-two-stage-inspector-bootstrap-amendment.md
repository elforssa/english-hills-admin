# H3 Revision 7 — two-stage inspector bootstrap amendment

> **Historical credential procedure after S1 adoption:** [S1](crm-meta-lifecycle-credential-simplification.md) proposes superseding this document's R7 credential/bootstrap/inspector/recovery ceremonies and per-action gates. S1 is not adopted yet; existing operational holds remain. Once independently reviewed, owner-adopted and merged, S1 is the sole credential-process contract where these texts conflict. Historical evidence/approval scope and unrelated R4/dormant/live safeguards below remain intact; do not replay old actions.

## Status

**Tier 3 — proposed architecture amendment only.**

Base main:

`96dbbdb4a8d8f51a88077baae7168da425377c29`

This document changes proposed credential-gate ordering only if it later receives:

1. exact-head independent Tier-3 review; and
2. explicit owner adoption.

It authorizes **no** browser extension implementation/installation, Meta access, synthetic browser operation, A/B generation, real-token inspection, Revoke tokens, Vercel mutation, H3-06–08, H4, Test Events or lifecycle sending.

## Inherited adopted state

The following remains unchanged:

- **4A = VERIFIED C2 CREATION**
- **4B = VERIFIED ASSOCIATION**
- **4C = VERIFIED DATASET GRANT**
- dedicated lifecycle System User:
  - `61594989243533 / EH Lifecycle R4 Employee`
- lifecycle-only C2 app:
  - `29771601672426816 / EH Lifecycle R4 C2`
- target dataset endpoint:
  - `1152399921284927`
- browser/navigation dataset row:
  - `1568116421343147`
  - navigation identifier only; never silently substitutes for endpoint `1152399921284927`
- **B5 = READY**
- future Production credential reference:
  - `CRM_META_LIFECYCLE_TOKEN_EH_R4`
- Vercel-only Production/server-side Secret custody
- no Preview/Development/custom-environment copy
- no readback/export/`vercel env pull`
- no external recovery vault
- recovery trust model:
  - A accepted non-event
  - one identity-wide **Revoke tokens**
  - explicit successful Meta control-plane confirmation
  - B issued/accepted
  - accepted B conditionally stored in Vercel in the same private human session
- exact old A is not re-tested after revocation
- B validity does not prove A invalidity
- H3-06–08/H4/live activation remain separately gated.

Current inherited holds:

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

## Why an amendment is needed

The original ordering effectively requires the inspector to be fully READY before disposable credential A can exist.

Reviewed research established a circularity:

1. no A while the inspector is BLOCKED;
2. exact real-credential semantic/input linkage is difficult to prove using synthetic data alone;
3. the reviewed evidence does not establish a safe supported synthetic signal proving completed evaluation of the exact fake input.

Broad network capture is not an acceptable workaround because HAR/devtools/proxy/request-detail mechanisms may expose Meta session cookies, authorization material, headers or request bodies.

This amendment proposes a narrower split:

1. prove enough **transport secrecy** to expose exactly one disposable credential A to Meta's first-party human debugger;
2. use A itself as the first empirical credential-specific semantic/bootstrap proof;
3. only after A passes continue to the already adopted revoke-success → B sequence.

This is an explicit residual-risk architecture decision. It does **not** pretend synthetic testing can prove what reviewed evidence cannot establish.

---

# 1. Proposed state model

The inspector path becomes:

`BLOCKED`

→ **INSPECTOR TRANSPORT READY — SESSION BOUND**

→ conditional A issuance

→ **A BOOTSTRAP VERIFIED**

→ one adopted identity-wide revoke

→ explicit successful Meta revoke confirmation

→ B issuance

→ B non-event inspection / final B1

→ accepted B stored in Vercel Production Secret

The following are intentionally distinct:

- **INSPECTOR TRANSPORT READY** = secrecy/transport gate sufficient only to expose one disposable A under this amendment.
- **A BOOTSTRAP VERIFIED** = first empirical credential-specific inspector proof.
- **B1 actual credential acceptance** = still completed on B; A never substitutes for final B1.
- **PREFLIGHT VERIFIED** = remains NO until all separately defined H3 preflight gates are actually satisfied.

No state above authorizes delivery or H4.

---

# 2. INSPECTOR TRANSPORT READY — exact proposed definition

## Session-bound, never a durable global assertion

**INSPECTOR TRANSPORT READY is valid only for one uninterrupted private human browser session.**

It expires immediately if any of the following occurs:

- Chrome/browser restart;
- extension reload/update/change;
- debugger page/tool materially changes;
- Meta logout/login/session replacement;
- operator changes;
- screen sharing/recording or browser automation is enabled;
- debugger tab is replaced by an unverified surface;
- DNR query state is lost/ambiguous;
- any transport check becomes FAIL or INCONCLUSIVE.

If it expires, the synthetic transport procedure must be rerun before any new credential exposure.

The repository may retain only a nonsecret dated result record. It must not imply that the debugger remains globally safe forever.

## Required implementation prerequisite

Before this state can ever be reached, the already-adopted transport-monitor design must be implemented in a non-runtime tools directory and independently reviewed at exact code SHA.

The implementation must preserve the adopted restrictions:

- only `declarativeNetRequest` and `declarativeNetRequestFeedback`;
- no `webRequest` / `webRequestBlocking`;
- no cookies;
- no tabs / activeTab;
- no content scripts;
- no host permissions;
- no storage;
- no debugger protocol;
- no native messaging;
- no proxy/VPN;
- no DOM access;
- no `onRuleMatchedDebug`;
- no request-detail logging;
- no telemetry;
- no network/fetch/XHR from the extension;
- no persistence.

Static tests must enforce those constraints.

## Required rules

### Rule 9001 — calibration

Synthetic fixed marker only.

Must explicitly cover the full reviewed Chrome ResourceType set including `main_frame`.

### Rule 9002 — synthetic URL-leak block

Synthetic fixed marker only.

Must:

- explicitly cover the full reviewed ResourceType set;
- have strictly higher developer priority than Rule 9003;
- block any request URL containing the synthetic marker.

A Rule 9002 match is immediate **TRANSPORT FAIL**.

### Rule 9003 — exact Meta debug-endpoint request observer

Rule 9003 is only an endpoint-request observer.

It must:

- have strictly lower developer priority than Rule 9002;
- use action `allow`;
- require initiator `developers.facebook.com`;
- require method GET;
- independently anchor exact HTTPS;
- independently anchor exact host `graph.facebook.com`;
- match only complete versioned or unversioned `/debug_token` path, with only query-string suffix permitted;
- use the same full ResourceType set.

Rule 9003 must never be described as proof of:

- request completion;
- Meta processing;
- response completion;
- input linkage;
- completed token evaluation.

## Fresh synthetic session gates

A future exact operator packet must perform all of the following **immediately before conditional A issuance**.

### T1 — private-session controls

PASS requires:

- one named human operator;
- private workstation/browser;
- screen sharing/recording off;
- agent/computer-use off;
- browser form/history sync disabled for credential-bearing content;
- clipboard history/cloud clipboard disabled;
- extensions capable of form/network/session capture disabled except the exact reviewed monitor;
- no devtools/HAR/proxy/network recorder.

### T2 — fresh calibration

PASS requires:

- fresh observation start bound before request;
- top-level calibration request;
- Rule 9001 fresh match;
- all-tabs/unassociated `getMatchedRules()` query;
- query completed within the adopted bounded collection window;
- stale Rule 9001 matches excluded.

Query error, lost timestamp or ambiguous result = INCONCLUSIVE.

### T3 — clean Rule 9003 idle baseline

Before synthetic debugger submission:

- bind a new idle-baseline start;
- make no debugger submission during the baseline;
- query across all tabs/unassociated requests;
- require zero fresh Rule 9003 matches.

A fresh idle Rule 9003 match makes submission association INCONCLUSIVE.

### T4 — one synthetic debugger submission

Use only the reviewed synthetic token-shaped marker.

Exactly one submit.

No real credential.

### T5 — URL-leak result

PASS requires:

- successful fresh all-tabs query;
- **Rule 9002 fresh count = 0**.

Any Rule 9002 match = FAIL.

Any query error/invalid observation state = INCONCLUSIVE.

### T6 — supported endpoint-request observation

PASS requires:

- clean T3 idle baseline;
- fresh Rule 9003 match after the one T4 submission;
- query succeeds within the bounded window;
- human debugger session remains healthy enough to associate the observation interval with that one submission.

This proves only a submission-associated browser request attempt to Meta's documented debug endpoint.

It does **not** prove exact input linkage or evaluation.

No Rule 9003 match = INCONCLUSIVE for this architecture.

### T7 — visible surface checks

PASS requires the synthetic marker absent from:

- address bar;
- visible redirect URL;
- browser-history URL entries.

These are supporting checks only; they do not replace T5/T6.

### T8 — no extra credential boundary

The human debugger must not require the operator to expose/provide:

- C2 app secret;
- a separate lifecycle credential;
- another credential of the dedicated System User;
- Graph Explorer token;
- an unreviewed app access token.

If an additional credential becomes required, STOP for a separate amendment.

## Transport readiness decision

Only T1–T8 all PASS may produce:

**INSPECTOR TRANSPORT READY — SESSION BOUND**

FAIL means the human debugger route is rejected under this architecture.

INCONCLUSIVE means no credential may be generated.

## Explicit residual-risk acceptance

Even after T1–T8 PASS:

- synthetic input linkage remains unproved;
- completed Meta evaluation remains unproved;
- a real valid token could theoretically cause different provider/UI behavior than the synthetic value;
- Rule 9002 cannot safely watch exact A without embedding credential material in an extension rule, which is prohibited.

Therefore this amendment treats T1–T8 as **sufficient transport-secrecy evidence to expose one disposable A**, not as proof that every real-token transport path is universally safe.

Owner adoption of this amendment must explicitly accept that bounded residual risk.

The risk is constrained by:

- exact first-party human debugger only;
- same uninterrupted session;
- immediately preceding synthetic PASS;
- exactly one disposable A;
- strict private-human continuity;
- A never Production;
- no business/event use;
- fail-closed semantic checks;
- dedicated lifecycle identity;
- pre-reviewed conditional containment.

---

# 3. Conditional A issuance authority — future operator contract

This architecture amendment does not itself issue A.

A future exact credential operator packet must be independently reviewed and owner-authorized **before the session starts**.

That packet may contain conditional authority to generate A only if T1–T8 all PASS in the same uninterrupted session.

No later ad-hoc approval gap should leave the operator tempted to preserve credentials outside the approved flow.

## Exact A identity

Credential A must be generated exactly once from:

- System User:
  - `61594989243533 / EH Lifecycle R4 Employee`
- app:
  - `29771601672426816 / EH Lifecycle R4 C2`

The issuance flow must use the exact pre-approved grant/scope selection intended for the lifecycle integration.

No scope expansion is allowed to “make the debugger work.”

If the provider forces unexpected authority, STOP.

## A custody

A is disposable and transient.

A must never be stored in:

- Vercel;
- repository;
- database;
- chat;
- Notes;
- local file;
- shell/env/argv/history;
- browser sync;
- screenshot;
- HAR/log/trace;
- external vault.

Transient clipboard is permitted only if unavoidable and only with clipboard history/cloud sync disabled; clear immediately after debugger submission.

A must not be transformed into a hash/fingerprint for evidence.

---

# 4. Mandatory credential continuity

The exact A used for bootstrap must remain under one private human's uninterrupted control.

Required chain:

`exact issuance → exact A transfer → debugger submission → fresh result`

Record only:

- `credential_continuity_preserved = true/false`
- `single_issuance_observed = true/false`
- `single_debugger_submission_observed = true/false`
- `fresh_result_observed = true/false`
- `continuity_ambiguity = true/false`
- issuance/submission/result UTC timestamps.

No raw token or token-derived identifier is recorded.

Any uncertainty about:

- whether issuance succeeded;
- which credential is in the clipboard/input;
- whether another token was substituted;
- whether the result is stale;
- whether the debugger retained a prior result;
- whether the operator/session changed;

produces:

**CREDENTIAL CONTINUITY = INCONCLUSIVE**

No A bootstrap PASS.

---

# 5. A semantic/bootstrap evidence

A exists to establish the first credential-specific inspector evidence.

It does not prove event-delivery capability.

## Allowed debugger output

Only the reviewed Meta-supported diagnostic semantics may be persisted:

- `is_valid`;
- token type;
- `app_id`;
- application;
- `issued_at`;
- `expires_at`;
- `data_access_expires_at`;
- scope names;
- granular scope names;
- sanitized fixed error category/code where already approved;
- safe subject/target comparison booleans/counts.

Do not persist:

- raw token;
- token fragment/hash/fingerprint;
- raw `user_id`;
- unknown/raw granular target IDs;
- app secret;
- cookies/session headers;
- request URL/body;
- raw response;
- screenshot;
- arbitrary provider strings.

## A1 — validity

Required:

- explicit `is_valid=true` or independently reviewed documented equivalent.

Missing/ambiguous validity = INCONCLUSIVE.

## A2 — token class/app

Required:

- token type = expected System User token class;
- `app_id = 29771601672426816`;
- application coherently identifies C2.

Mismatch = FAIL.

## A3 — issuance/lifetime coherence

Required:

- issued timestamp coherent with current issuance;
- expiry/data-access expiry interpreted under current Meta semantics;
- no already-expired or incoherent lifetime.

Ambiguity = INCONCLUSIVE.

## A4 — exact scopes

Required:

- returned scopes match the approved issuance/grant contract;
- no unexplained extra power;
- required lifecycle authority not missing.

Do not trial-and-error broader scopes.

Unexpected/missing authority = FAIL or INCONCLUSIVE according to evidence certainty.

---

# 6. Subject safe-binding gate

Subject PASS requires **all**:

### S0 — credential continuity

Mandatory continuity gate above = PASS.

### S1 — issuance subject

Immediately before generation, human verifies:

- `61594989243533 / EH Lifecycle R4 Employee`

Persist only:

- `issuance_subject_matches_expected = true/false`

### S2 — issuance app

Human verifies:

- `29771601672426816 / EH Lifecycle R4 C2`

Persist only:

- `issuance_app_matches_expected = true/false`

### S3 — debugger class/app

Persist:

- allowed token type;
- allowed app ID;
- `debugger_app_matches_expected = true/false`.

### S4 — optional local-only user_id corroboration

Raw debugger `user_id` must not be persisted.

It may be compared locally only if a separately reviewed authoritative mapping establishes what the debugger field means for this System User token class.

Persist only:

- `debugger_subject_matches_expected = true/false/unsupported`.

S4 is corroborative, not a substitute for S0–S3.

## Subject PASS

PASS requires:

- S0 PASS;
- S1 true;
- S2 true;
- S3 expected;
- no contradictory subject evidence.

Issuance context + token class + app ID without S0 continuity can never PASS.

---

# 7. Target safe-binding gate

## Pre-approved reference inventory only

The comparison allowlist must be established before credential issuance.

Known adopted architecture identifiers include:

- C2 app `29771601672426816`;
- intended dataset endpoint `1152399921284927`;
- provider-coupled same-endpoint View Pixels partial effect already accepted;
- no default Page/ad-account authority.

The browser/navigation dataset row `1568116421343147` is **not** automatically an endpoint identifier.

No debugger-displayed unknown ID may define its own allowlist.

## Local comparison

If granular target detail is visible, raw target IDs remain on the human/provider surface.

Persist only:

- `granular_scope_detail_present = true/false`
- `granular_scope_count = N`
- `targeted_scope_count = N`
- `target_id_count = N`
- `all_targets_mapped = true/false`
- `all_targets_within_approved_business_assets = true/false`
- `unexpected_target_count = N`
- `unmapped_target_count = N`
- `target_binding_complete = true/false`

Already-approved nonpersonal business asset IDs may be recorded only when the exact identifier semantics are already established.

## Target PASS

PASS requires:

- target detail sufficient for the scopes that carry target information;
- every target semantically mapped;
- every mapped target within pre-approved lifecycle business assets;
- unexpected target count = 0;
- unmapped target count = 0;
- completeness established.

If granular detail is absent/incomplete, pagination/completeness is uncertain, or target semantics cannot be mapped:

**TARGET BINDING = INCONCLUSIVE**

No inference that “no details” means “no extra authority.”

A later fallback to Business Settings inventory may substitute only if a separately reviewed contract proves that inventory is complete for the token's effective target authority and inheritance.

---

# 8. A BOOTSTRAP VERIFIED

A bootstrap PASS requires all:

1. **INSPECTOR TRANSPORT READY — SESSION BOUND**
2. credential continuity PASS
3. A validity PASS
4. token class/app PASS
5. lifetime coherence PASS
6. exact scope PASS
7. subject binding PASS
8. target binding PASS
9. broader B1 nonsecret authority inventory remains coherent:
   - EMPLOYEE role;
   - C2 relationship;
   - assigned assets;
   - dataset/pixel task;
   - no unexpected Page/ad-account/other asset authority;
   - no unexplained inherited power
10. no event/business action performed
11. A not persisted outside the transient human session.

Only then:

**A BOOTSTRAP VERIFIED**

This proves the inspector can produce coherent credential-specific evidence for disposable A under the reviewed session.

It still does not verify CAPI delivery.

It does not itself constitute final B1 for B.

---

# 9. Fail-closed branches after A issuance

Once A has been issued, a valid bearer credential may exist even if inspection fails.

A future operator packet must therefore bind containment **before A generation**.

## A PASS branch

If A BOOTSTRAP VERIFIED:

1. proceed to the already adopted one-time identity-wide **Revoke tokens** action;
2. require explicit successful Meta control-plane confirmation tied to the exact dedicated Employee;
3. perform the adopted nonsecret regression readback;
4. do not retrieve/reuse/reinspect A after revoke;
5. only then proceed toward B.

## A FAIL / INCONCLUSIVE branch

If A issuance definitely occurred but A bootstrap is FAIL or INCONCLUSIVE:

- do not issue B;
- do not store A;
- do not retry debugger submission;
- do not broaden scopes;
- do not generate replacement A.

The future operator packet should contain a narrowly scoped **conditional containment authorization** permitting one identity-wide Revoke tokens action on the dedicated lifecycle Employee to contain a possibly valid A.

After explicit successful containment confirmation:

- STOP;
- no B in that run;
- require new reviewed architecture/operator decision before another issuance.

If revoke result is ambiguous:

- STOP;
- no retry;
- no B;
- treat credential state as potentially valid until reconciled by a new reviewed action.

If it is ambiguous whether A was ever issued, the exact containment rule must be resolved in the future operator packet before execution; this amendment does not silently authorize an uncertain mutation.

---

# 10. B sequence after successful A bootstrap

The adopted Revision-7 Vercel-only B sequence remains.

Before B generation, the future operator packet must already contain conditional Vercel Production-storage authority for:

- team `team_egUbt9wN23I40I1K71zxfYGj`;
- project `prj_hC0MvqsXYmERXhZWGEfOOma8D6E3`;
- key `CRM_META_LIFECYCLE_TOKEN_EH_R4`;
- type Secret / API `sensitive`;
- Production only.

## B issuance

Only after explicit successful A revoke confirmation.

B must use:

- same dedicated lifecycle System User;
- same C2 app;
- same reviewed intended grant contract.

B is issued once.

## B continuity

A separate continuity chain is mandatory:

`exact B issuance → exact B transfer → debugger submission → fresh B result → conditional Vercel storage`

No A/B substitution.

## Final B1

B must independently pass:

- explicit validity;
- token class/app;
- lifetime;
- exact scopes;
- subject binding;
- target binding;
- broader B1 effective-authority reconciliation.

A's PASS is not inherited as B's PASS.

## Conditional same-session storage

If and only if B passes final B1:

- insert exact B directly into `CRM_META_LIFECYCLE_TOKEN_EH_R4`;
- same private human session;
- no intermediate persistent copy;
- metadata-only Vercel verification;
- no readback/export;
- no activation bundled.

If B fails/inconclusive:

- do not store B;
- do not automatically issue another credential;
- stop under the already adopted Revision-7 fail-closed rule.

This amendment does not add an automatic B-revocation action beyond the adopted architecture.

---

# 11. Exact nonsecret evidence record

Future operator evidence may contain:

## Session

- operator identity;
- approved plan SHA;
- reviewed monitor implementation SHA;
- Chrome version;
- debugger origin/tool label;
- session start/end UTC;
- private-session controls PASS/FAIL.

## Transport

- Rule 9001 fresh calibration PASS/FAIL;
- Rule 9003 idle baseline PASS/FAIL;
- Rule 9002 count;
- Rule 9003 count;
- DNR query status;
- visible URL/history PASS/FAIL;
- transport state PASS/FAIL/INCONCLUSIVE;
- limitation statement that synthetic input linkage was not proven.

## Credential continuity

- issuance/submission/result UTC;
- single issuance boolean;
- single submission boolean;
- fresh result boolean;
- continuity-preserved boolean;
- continuity-ambiguity boolean.

## Credential semantics

- logical label A/B;
- token type;
- app ID;
- issuance/expiry/data-access expiry;
- scope names;
- granular scope names;
- validity boolean;
- sanitized fixed failure category.

## Subject/target

- issuance subject matches expected;
- issuance app matches expected;
- debugger app matches expected;
- optional subject corroboration boolean/unsupported;
- granular/target counts;
- all targets mapped boolean;
- all targets within approved assets boolean;
- unexpected/unmapped counts;
- binding-complete boolean.

## Recovery/storage

- exact dedicated identity targeted;
- one revoke action submitted;
- explicit Meta success/FAIL/INCONCLUSIVE;
- nonsecret regression readback;
- B storage metadata result if separately triggered.

Never persist token material, raw personal IDs, unknown target IDs, app secret, session cookies, request/response bodies, URLs containing credentials, screenshots or arbitrary provider text.

---

# 12. What owner adoption would and would not mean

If this amendment is later independently reviewed and owner-adopted, it would authorize the **architecture/gate ordering** only.

It would establish that a future exact operator packet may conditionally expose disposable A after session-bound transport PASS.

It would **not** itself authorize:

- implementing the monitor;
- installing the monitor;
- running the synthetic assessment;
- logging into/opening Meta credential surfaces;
- generating A;
- inspecting A;
- Revoke tokens;
- generating B;
- inspecting B;
- Vercel mutation;
- H3-06–08;
- H4;
- Test Events;
- lifecycle sending.

Those remain separate implementation/operator approvals.

---

# 13. Proposed next work after adoption

If this amendment is adopted:

1. implement the three-rule synthetic transport monitor in a non-runtime tools directory;
2. add static/unit tests for all adopted permission, priority, regex, resource-type, observation-window, error and no-request-detail constraints;
3. independent exact-code Tier-3 review;
4. prepare one exact human operator packet containing:
   - synthetic T1–T8 procedure;
   - conditional A issuance;
   - mandatory continuity;
   - A semantic/subject/target gates;
   - conditional one-revoke containment;
   - successful-A revoke-success → B sequence;
   - B continuity/final B1;
   - pre-authorized conditional Vercel storage;
5. independent operator-packet review;
6. explicit owner execution approval;
7. only then perform any provider/credential action.

---

## Proposed state if this amendment is adopted

Architecture only:

- **B5 = READY**
- **TWO-STAGE INSPECTOR BOOTSTRAP ARCHITECTURE = DEFINED**
- **transport monitor implementation = NOT IMPLEMENTED**
- **INSPECTOR TRANSPORT READY = NOT YET ACHIEVED**
- **A BOOTSTRAP VERIFIED = NO**
- **safe non-event inspector = BLOCKED operationally**
- **B1 actual credential acceptance = PENDING**
- **PREFLIGHT VERIFIED = NO**
- no Production/live activation authority.
