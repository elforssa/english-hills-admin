# H3 Revision 7 — inspector completed-evaluation/input-linkage and subject/target binding research, 2026-10-04

> **HISTORICAL — SUPERSEDED BY S1.** S1 was owner-adopted and merged through PR #93 / main `284c2fe32014f8f3011ac6677ddfe99b0a16ca22`. Use the [sole active S1 Gate-B credential runbook](../plans/crm-h3-s1-gate-b-credential-runbook.md). Conflicting credential/bootstrap/inspector/rehearsal/per-action instructions below are retired, not execution requirements. Preserve original dated observations, findings and approval scope; unrelated R4 delivery safeguards remain. No historical approval authorizes current credential execution or activation.

## Status

**Tier 3 — documentation/research only.**

Baseline main at research start:

`b88c8e9abdb4c90dca7204d04f148d8f2f579854`

Current adopted state:

- **B5 = READY**
- **SUPPORTED REQUEST-TRANSPORT / TRANSIENT-REDIRECT EVIDENCE = PENDING**
- **SUPPORTED REMOTE-ENDPOINT REQUEST OBSERVATION = CANDIDATE DEFINED, NOT VERIFIED**
- **SUPPORTED REMOTE-EVALUATION SIGNAL = UNRESOLVED / NOT YET DEFINED**
- **OUTPUT FIELD SEMANTICS = SUFFICIENT**
- **ALLOWLISTED VALID-TOKEN OUTPUT BINDING = PARTIAL — SUBJECT/TARGET SAFE BINDING PENDING**
- **safe non-event inspector = BLOCKED**
- **B1 actual credential acceptance = PENDING**
- **PREFLIGHT VERIFIED = NO**

This research authorizes no extension implementation/installation, Meta account action, synthetic browser testing, A/B generation, real-token inspection, app-secret access, Revoke tokens, Vercel write, H3-06–08, H4, Test Events or lifecycle sending.

---

## Research questions

1. Is there a safe supported way to prove **completed remote evaluation/input linkage** for a synthetic Access Token Debugger submission without exposing authenticated-session secrets?
2. Can B1 **subject/target binding** be designed without persisting raw `user_id` or granular target IDs?

---

# 1. Completed remote evaluation / input linkage

## Chrome response-stage evidence exists, but it is weaker than input linkage

Current Chrome declarativeNetRequest documentation states that rules with a `responseHeaders` condition are evaluated only **once response headers have been observed by the browser for that request path**.

Chrome also documents interactions with HTTP cache/service workers. A response-stage match therefore does **not**, by itself, prove a fresh network round trip to Meta for that observation. Cached responses can satisfy browser response handling without establishing fresh provider receipt.

Official Chrome reference:

<https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest>

This creates a potentially useful evidence class:

**REMOTE RESPONSE-HEADER STAGE OBSERVED**

A response-stage DNR match can establish only that Chrome observed matching response headers in the request flow.

It is potentially stronger than pre-request Rule 9003, which proves only an endpoint request attempt, but **fresh remote server receipt remains unproved unless response provenance/cache reuse is independently excluded**.

## Important limit: response-stage evidence still does not prove input linkage

Even a response-stage match cannot, by itself, establish that:

- a fresh network request reached Meta rather than a cached/browser-mediated response path being used;
- the synthetic marker was actually contained in the evaluated input;
- Meta associated that exact submitted value with the response;
- the response body was fully received;
- Meta completed semantic token evaluation;
- or the debugger UI result displayed to the operator corresponds to that same request.

A DNR rule intentionally does not inspect the request body, request headers or response body.

Therefore:

**REMOTE RESPONSE-HEADER STAGE OBSERVED != COMPLETED INPUT EVALUATION PROVED**

## Candidate future response-stage sentinel — research only

A future amendment could investigate a fourth rule scoped to the exact Meta Graph debug endpoint with a `responseHeaders` condition.

Example research shape:

- exact HTTPS `graph.facebook.com`
- exact versioned/unversioned `/debug_token`
- exact intended initiator
- same bounded observation window
- response header condition such as presence of a header expected from a Graph response

However, this research does **not** define that rule as ready because:

1. current official evidence does not guarantee one specific response header for every `/debug_token` response;
2. response provenance/cache behavior would need an independently reviewed way to distinguish a fresh remote response from cache reuse;
3. DNR response-stage action/priority interaction with the existing pre-request allow/block rules must be tested before adoption;
4. a response-stage block would intentionally terminate the response after headers, which changes debugger behavior;
5. a non-mutating response-stage observation path has not yet been independently demonstrated in this architecture.

Therefore:

**REMOTE RESPONSE-STAGE SENTINEL = RESEARCH CANDIDATE ONLY**

No implementation is commissioned by this document.

## No safe supported synthetic input-linkage proof established by reviewed evidence

Current reviewed evidence includes:

- Meta's first-party Access Token Debugger;
- Meta's supported remote `/debug_token` endpoint;
- Meta's official `facebook/agentic-tools` debug skill and probe;
- Chrome DNR pre-request and response-stage semantics.

None provides a supported, nonsecret synthetic mechanism that proves:

> this exact synthetic value was included in the remote evaluation that produced this completed result

without one of the following:

- reading/capturing request content;
- reading/capturing response content beyond allowlisted UI metadata;
- obtaining a provider correlation value that Meta documents as linking request input to response;
- or using a real valid token whose returned metadata is specific enough to prove evaluation of that credential.

No such provider correlation field was identified in the reviewed current Meta public evidence.

Therefore the current bounded research classification is:

**SUPPORTED REMOTE-EVALUATION / SYNTHETIC INPUT-LINKAGE SIGNAL = NOT ESTABLISHED BY REVIEWED EVIDENCE**

This is a statement about the reviewed evidence set, not an impossibility claim. A safe supported mechanism may exist outside the sources reviewed here.

Under the currently reviewed evidence, the synthetic-only architecture cannot honestly claim completed evaluation of a particular fake token.

---

# 2. Consequence for inspector sequencing

## The circularity

Current ordering asks the inspector to be READY before issuing disposable credential A.

But full proof that the debugger can evaluate a real credential-specific input is difficult to establish with synthetic data alone.

This creates a circular dependency:

1. no A until inspector READY;
2. inspector READY requires confidence that a submitted credential is actually evaluated;
3. synthetic markers cannot currently establish that exact input linkage.

## Research direction: split inspector readiness into pre-credential and bootstrap stages

A future architecture amendment could remove the circularity without weakening credential secrecy by splitting the inspector into two stages.

### Stage I — INSPECTOR TRANSPORT READY

Must be completed before A issuance.

Would require:

- URL/redirect leak detector reviewed and implemented;
- clean synthetic calibration;
- Rule 9002 leak detection semantics;
- any separately adopted endpoint/response-stage evidence;
- no HAR/devtools/proxy/request-detail capture;
- output field semantics supported by official Meta evidence;
- exact human/operator privacy controls.

This stage could justify exposing **one disposable credential A** to the first-party debugger only if a later amendment defines and independently verifies **sufficient transport-safety evidence**. Fresh calibration plus zero marker matches alone are not sufficient, because the synthetic value might have been rejected locally and because remote/input linkage remains unresolved.

It does **not** claim real-token semantics have already been empirically verified.

### Stage II — INSPECTOR BOOTSTRAP VERIFIED

Would occur only with disposable A under a separate Tier-3 credential operation.

A would:

- be generated once from the exact dedicated lifecycle System User;
- never enter Production/Vercel;
- never be used for `/events`, Test Events or any business action;
- be inspected once through the already transport-approved first-party debugger;
- be accepted only if required token-specific metadata appears coherently;
- otherwise fail closed.

The real A inspection itself can then provide credential-specific evidence that cannot be obtained from synthetic markers alone.

This would be an architecture/gate-order amendment and **is not authorized here**.

## Why this is preferable to broad network capture

A narrowly scoped disposable-A bootstrap would avoid:

- HAR capture;
- DevTools network logs;
- proxy interception;
- request-body inspection;
- session-cookie/header capture;
- app-secret use in a separate `debug_token` script.

It preserves the owner-adopted preference for the first-party human debugger while acknowledging the limit of synthetic evidence.

---

# 3. Subject binding without recording raw user_id

## Meta evidence

Meta's official `facebook/agentic-tools` debug-access-token skill says the debug output can contain `user_id`, but instructs developers to redact it before returning metadata to an agent.

The same skill supports these nonsecret diagnostic fields:

- `is_valid`
- `type`
- `app_id`
- `application`
- `issued_at`
- `expires_at`
- `data_access_expires_at`
- `scopes`
- `granular_scopes`

Official source:

<https://github.com/facebook/agentic-tools/blob/fb896e4106e43ce033830a8ee478c64285f47d2c/plugins/devtools/skills/debug-access-token/SKILL.md>

Meta-operated system-user setup guidance also describes token generation from the selected System User and selected app, and says the resulting token can be opened in Token Debugger to verify the selected permissions.

Example Meta-operated guidance:

<https://www.postman.com/postman/brewing-postman-flows/folder/1rdcudw/step-1-get-system-user-access-token>

## Proposed safe subject-binding model

A future B1 operator packet does not need to persist raw debugger `user_id` if subject provenance is established from the controlled issuance context **and the exact newly issued credential is kept under continuous private-human control through inspection**.

Use one mandatory continuity gate plus four independent observations:

### S0 — mandatory private-human credential continuity

Subject PASS requires a single bounded private-human chain linking:

`exact issuance action → exact newly issued credential A → direct transfer into the first-party debugger → fresh result`

Requirements:

- the same named human controls the full chain;
- A is generated once in the expected issuance context;
- A is not copied into chat, repository, screenshots, Notes, shell history, files, clipboard history/cloud clipboard, or any other persistent store;
- if a transient clipboard is unavoidable, clipboard history/cloud sync is disabled and the clipboard is cleared immediately after debugger submission;
- no second token is generated, substituted, selected, or inspected in the same chain;
- the debugger result must be fresh for that single submission, not a pre-existing/stale result;
- the human records only safe attestations:
  - `credential_continuity_preserved = true/false`
  - `single_issuance_observed = true/false`
  - `single_debugger_submission_observed = true/false`
  - `fresh_result_observed = true/false`
  - `continuity_ambiguity = true/false`

If the human loses sight/control of which credential is being transferred, a stale result cannot be excluded, another credential may have been substituted, or any continuity step is ambiguous:

**CREDENTIAL CONTINUITY = INCONCLUSIVE**

No subject PASS and no Production storage.

Use the following additional observations:

### S1 — issuance-page subject

Immediately before Generate Token:

- human verifies exact dedicated lifecycle System User:
  - expected ID: `61594989243533`
  - expected name: `EH Lifecycle R4 Employee`
- record only:
  - `issuance_subject_matches_expected = true/false`

No raw token exists yet.

### S2 — issuance app

The token-generation flow must show the selected C2 app:

- expected App ID: `29771601672426816`
- expected app: `EH Lifecycle R4 C2`

Record only:

- `issuance_app_matches_expected = true/false`

### S3 — debugger token class/app

After separately authorized A inspection:

- `type` must be the expected System User token class;
- `app_id` must equal the C2 app.

These are allowed nonsecret diagnostic fields.

Record:

- token type;
- app ID;
- `debugger_app_matches_expected = true/false`

### S4 — optional local-only user_id corroboration

If the human debugger visibly exposes `user_id`:

- compare it locally against the expected dedicated System User identity only if authoritative Meta evidence establishes that this field is canonical for this System User token type;
- do **not** copy the raw debugger `user_id` into chat, repository or screenshots;
- record only:
  - `debugger_subject_matches_expected = true/false/unsupported`

Until the canonical mapping is independently supported, absence or mismatch in this optional field is not silently interpreted.

### Subject decision

Subject binding may be classified PASS only when:

- **credential continuity = PASS** for the exact newly issued A through fresh debugger result;
- issuance subject = expected dedicated lifecycle System User;
- issuance app = C2;
- debugger type = expected token class;
- debugger app ID = C2;
- no contradictory subject evidence exists.

Issuance context + token type + app ID are not sufficient without credential continuity because different System Users could use the same app and stale/other-token results must be excluded.

If credential continuity is lost/ambiguous, the issuance context is ambiguous, page identity changes, or debugger metadata contradicts the expected app/token class:

**SUBJECT BINDING = FAIL / INCONCLUSIVE**

No Production storage.

---

# 4. Granular target binding without persisting raw target_ids

## Meta evidence

Meta's official bundled probe specifically notes:

- `granular_scopes` may carry `target_ids`;
- those IDs are dropped from the agent-facing output;
- only granular scope names are retained.

Official source:

<https://github.com/facebook/agentic-tools/blob/fb896e4106e43ce033830a8ee478c64285f47d2c/plugins/devtools/skills/debug-access-token/scripts/debug_token_probe.py>

Therefore raw target IDs should remain local to the human/provider surface unless separately justified.

## Proposed local-comparison evidence contract

If the debugger exposes granular target IDs, the human may compare them locally against the pre-approved business-asset inventory.

Do not copy raw debugger target IDs into:

- repository;
- chat;
- screenshots;
- logs;
- extension storage.

Record only this projection:

- `granular_scope_detail_present = true/false`
- `granular_scope_count = N`
- `targeted_scope_count = N`
- `target_id_count = N`
- `all_targets_mapped = true/false`
- `all_targets_within_approved_business_assets = true/false`
- `unexpected_target_count = N`
- `unmapped_target_count = N`
- `target_binding_complete = true/false`

Optional allowlisted business-asset IDs may be recorded only if those exact IDs are already approved nonpersonal architecture identifiers.

## Approved reference inventory is not inferred

The target allowlist must come from previously adopted nonsecret asset evidence, not from whatever the token shows.

Relevant current adopted provider-object state includes:

- dedicated lifecycle System User `61594989243533`;
- C2 App `29771601672426816`;
- target dataset endpoint `1152399921284927`;
- provider-coupled View Pixels partial effect on the same intended endpoint context;
- no default Page/ad-account authority for the lifecycle identity.

The navigation/browser row `1568116421343147` remains a navigation identifier and must not silently replace endpoint `1152399921284927`.

Before any real comparison, the exact mapping between a debugger target ID and these approved business assets must be documented. Unknown target identifiers are not automatically classified as malicious or approved.

## Missing granular target details are not proof of a clean result

If:

- `granular_scopes` is absent;
- a scope is present without target detail;
- the current UI omits target IDs;
- pagination/completeness is uncertain;
- or target-ID semantics cannot be mapped to the approved inventory;

then do **not** record “no unexpected targets.”

Result:

**TARGET BINDING = INCONCLUSIVE**

A fallback to Business Settings assignment inventory may be used only if a later reviewed packet establishes that the relevant inventory is complete for the token's effective target authority and covers inheritance/scope-dependent access.

---

# 5. Relationship to B1 effective-authority acceptance

The proposed local-comparison model does not replace the rest of B1.

B1 still requires reconciliation of:

- EMPLOYEE role;
- exact C2 app;
- installed/assigned app relationship;
- assigned asset inventory;
- dataset/pixel task;
- token scopes;
- other accessible assets/inheritance;
- expiry/data-access expiry;
- unexpected grants;
- acceptance/rejection rationale.

Subject/target local comparison is one evidence layer.

A clean local target comparison cannot excuse an incomplete Business Settings authority inventory, and a clean Business Settings inventory cannot automatically substitute for missing token-target detail unless that substitution is separately reviewed.

---

# 6. Research conclusions

## Completed remote evaluation/input linkage

Current safe public evidence supports:

- browser endpoint-request attempt observation;
- potentially, a future response-header-stage observation.

Current safe public evidence does **not** support:

- completed evaluation of the exact synthetic input.

Classification:

**SUPPORTED REMOTE-EVALUATION / SYNTHETIC INPUT-LINKAGE SIGNAL = NOT ESTABLISHED BY REVIEWED EVIDENCE**

## Subject binding

A safe nonpersistent subject-binding design is feasible using:

- **mandatory private-human credential continuity from exact issuance through exact A transfer, debugger submission and fresh result**;
- exact issuance context;
- expected System User;
- expected C2 app;
- debugger token type;
- debugger app ID;
- optional local-only `user_id` corroboration if canonical semantics are later supported.

Classification:

**SUBJECT SAFE-BINDING DESIGN = FEASIBLE / NOT ADOPTED**

## Target binding

A safe local-comparison design is feasible if granular target details are visible and semantically mappable.

Raw target IDs need not leave the provider/human session.

Missing/unknown target details remain INCONCLUSIVE.

Classification:

**TARGET SAFE-BINDING DESIGN = FEASIBLE WITH COMPLETENESS/MAPPING GATE / NOT ADOPTED**

## Recommended architectural direction

The cleanest next architecture candidate is a narrow **two-stage inspector bootstrap amendment**:

1. **INSPECTOR TRANSPORT READY** only after a later amendment defines sufficient transport-safety evidence; synthetic calibration/zero-marker observations alone are not enough;
2. separately authorize disposable A as the first real credential semantic/bootstrap proof with mandatory credential continuity;
3. A never enters Production and never performs business/event actions;
4. fail closed if required metadata/subject/target evidence is unavailable;
5. only after A semantic bootstrap succeeds continue to the already adopted revoke-success → B flow.

This is a proposal only.

It changes gate ordering and therefore requires:

- architecture amendment;
- independent Tier-3 review;
- explicit owner adoption;
- exact credential operator packet;
- no automatic execution.

---

## Current state

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
