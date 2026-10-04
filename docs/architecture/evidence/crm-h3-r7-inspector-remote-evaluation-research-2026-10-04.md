# H3 Revision 7 — inspector remote-evaluation research, 2026-10-04

> **HISTORICAL — SUPERSEDED BY S1.** S1 was owner-adopted and merged through PR #93 / main `284c2fe32014f8f3011ac6677ddfe99b0a16ca22`. Use the [sole active S1 Gate-B credential runbook](../plans/crm-h3-s1-gate-b-credential-runbook.md). Conflicting credential/bootstrap/inspector/rehearsal/per-action instructions below are retired, not execution requirements. Preserve original dated observations, findings and approval scope; unrelated R4 delivery safeguards remain. No historical approval authorizes current credential execution or activation.

## Status

**Tier 3 — documentation/research only.**

Baseline main at research start:

`88b9dea9945a3315597214d35123a593ac710051`

Current adopted state:

- **B5 = READY**
- **SUPPORTED REQUEST-TRANSPORT / TRANSIENT-REDIRECT EVIDENCE = PENDING**
- **ALLOWLISTED VALID-TOKEN OUTPUT BINDING = PENDING / PARTIAL**
- **safe non-event inspector = BLOCKED**
- **B1 actual credential acceptance = PENDING**
- **PREFLIGHT VERIFIED = NO**

This research authorizes no extension implementation/installation, Meta account action, synthetic browser test, A/B generation, real-token inspection, app-secret access, Revoke tokens, Vercel write, H3-06–08, H4, Test Events or lifecycle sending.

## Research question

Can the human Meta Access Token Debugger obtain a **supported nonsecret remote-evaluation signal** without relying on:

- a visible invalid-input message;
- HAR/devtools/proxy capture;
- request-detail APIs;
- a real lifecycle token;
- or a new app-secret handling path?

The already adopted transport-monitor design can safely detect a synthetic marker in request URLs, but a zero marker match is INCONCLUSIVE unless remote evaluation is independently established.

## New authoritative Meta evidence

### Official Meta agentic-tools debug-access-token skill

Meta's official GitHub organization publishes:

- repository: `facebook/agentic-tools`
- reviewed source commit: `fb896e4106e43ce033830a8ee478c64285f47d2c`
- skill: `plugins/devtools/skills/debug-access-token/SKILL.md`
- bundled script: `plugins/devtools/skills/debug-access-token/scripts/debug_token_probe.py`

Source links:

- <https://github.com/facebook/agentic-tools/blob/fb896e4106e43ce033830a8ee478c64285f47d2c/plugins/devtools/skills/debug-access-token/SKILL.md>
- <https://github.com/facebook/agentic-tools/blob/fb896e4106e43ce033830a8ee478c64285f47d2c/plugins/devtools/skills/debug-access-token/scripts/debug_token_probe.py>

The official skill explicitly offers two developer-run options:

1. Meta's human **Access Token Debugger** at:
   <https://developers.facebook.com/tools/debug/accesstoken/>
2. the public Graph **`debug_token`** API via Meta's bundled script.

The skill explicitly instructs that raw access tokens/app secrets must not enter an agent/AI context.

### Official Meta output-field model

The same official skill tells developers to return only redacted metadata and names the supported diagnostic fields:

- `is_valid`
- `type`
- `app_id`
- `application`
- `issued_at`
- `expires_at`
- `data_access_expires_at`
- `scopes`
- `granular_scopes`
- error code/subcode/message

It explicitly recommends redacting `user_id` and profile/target IDs.

The bundled script's allowlist independently confirms:

- `is_valid`
- `type`
- `app_id`
- `application`
- `issued_at`
- `expires_at`
- `data_access_expires_at`
- `scopes`
- `error`

and reads `granular_scopes`, retaining only scope names while dropping target IDs.

This materially strengthens the existing output-field evidence.

### Official Meta remote endpoint

The bundled Meta script defines:

`https://graph.facebook.com/debug_token`

and calls that remote endpoint to evaluate the token.

The current Meta-operated Postman WhatsApp/Facebook material likewise documents token debugging through GET `/debug_token?input_token=...`.

Existing official Meta Node/Java Business SDK evidence also constructs the `debug_token` request using query parameters.

Therefore:

**Graph `/debug_token` = supported remote token-evaluation endpoint**

and separately:

**direct API/SDK query-string use remains NOT APPROVED for English Hills**, because the adopted contract prohibits credential material in request URLs.

The official bundled Meta script does not change that English Hills design decision: it still builds the request query string from the input token plus app access token.

## Remote-endpoint request observation candidate

The adopted Chrome monitor can be extended with a third declarative rule that detects only a direct browser request attempt to Meta's documented Graph `/debug_token` endpoint.

This avoids guessing from a visible error message, but it does **not** by itself prove network completion, Meta processing, response completion, or that the submitted synthetic value was evaluated.

### Rule 9003 — supported remote-endpoint request sentinel

Proposed rule:

- ID: `9003`
- developer priority: lower than Rule 9002
- action: **allow**
- request domain condition: `graph.facebook.com`
- initiator domain condition: `developers.facebook.com`
- request method: `GET`
- **regexFilter must independently anchor all of the following**:
  - scheme exactly `https://`
  - host exactly `graph.facebook.com` — no subdomain acceptance
  - path exactly either versioned `/vN.N/debug_token` or unversioned `/debug_token`
  - only the query-string suffix may follow the complete path
- same explicit full ResourceType set used by Rules 9001/9002

This exact-host regex constraint is mandatory because Chrome domain conditions may also match subdomains. The exact regex must be independently reviewed and statically tested before implementation.

### Priority requirement

Existing Rule 9002 synthetic-marker URL block must have a strictly higher developer priority than Rule 9003.

Reason:

- if a debugger request URL contains the synthetic token marker, Rule 9002 must win and block it;
- Rule 9003 must never allow a marker-bearing request through merely because the request also targets the remote debug endpoint;
- if the request URL does **not** contain the marker but does target the documented remote endpoint, Rule 9003 may allow the request and record that endpoint rule match.

Chrome documentation establishes that developer-defined rule priority is evaluated before action precedence inside one extension.

### Why `allow` rather than `block`

A block-only endpoint sentinel would prove that the browser **attempted** the remote request but would prevent the remote endpoint from evaluating it.

A lower-priority `allow` sentinel permits the documented remote endpoint request attempt only when the higher-priority marker leak rule did not fire.

Rule 9002 must have a **strictly higher numeric developer priority** than Rule 9003. Equal priority is prohibited because Chrome's action precedence can allow an `allow` action to outrank a `block` action at equal priority.

This gives the intended three-state observation behavior:

#### URL LEAK / FAIL

Fresh Rule 9002 match.

Meaning:

- the synthetic marker appeared in a browser request URL;
- the higher-priority block prevented the marker-bearing request;
- debugger route fails the English Hills no-token-in-URL contract.

#### DIRECT SUPPORTED REMOTE ENDPOINT REQUEST OBSERVED

Conditions:

- fresh Rule 9001 calibration PASS;
- fresh idle baseline shows no Rule 9003 match before submission;
- one synthetic debugger submission;
- fresh Rule 9002 count = 0;
- fresh Rule 9003 match after submission;
- Rule 9003 query succeeds inside the bounded window;
- debugger UI remains healthy enough to associate the observation window with that one submission; any displayed response is only session/context evidence, not proof of remote completion.

Meaning:

- the debugger-triggered browser flow **attempted** a direct request to Meta's documented Graph `/debug_token` endpoint;
- the exact synthetic marker was not present in the request URL as observed by the higher-priority marker rule;
- the endpoint request attempt was allowed rather than blocked.

This establishes only:

**SUPPORTED REMOTE-ENDPOINT REQUEST OBSERVATION = CANDIDATE**

It does **not** establish that:

- the network request completed;
- Meta received or processed the request;
- a response completed;
- the observed UI response came from that request;
- or the submitted synthetic value was included in and evaluated by Meta.

Therefore Rule 9003 alone is **not** a supported remote-evaluation signal.

#### NO REMOTE ENDPOINT MATCH

Fresh Rule 9002 count = 0 and fresh Rule 9003 count = 0.

Meaning:

- no marker URL leak was observed;
- but the human debugger may use:
  - a Meta internal endpoint;
  - a server-side backend hop invisible to browser DNR;
  - a locally rejected input path;
  - or another unbound route.

Result:

**INCONCLUSIVE — REMOTE EVALUATION UNPROVED**

Do not treat this as transport PASS.

## Required idle baseline

Before submitting the synthetic marker:

1. complete fresh Rule 9001 calibration;
2. bind a new idle-baseline timestamp;
3. perform no debugger submission for a short fixed interval;
4. query `getMatchedRules()` across all tabs/unassociated requests;
5. require **zero fresh Rule 9003 matches**.

If Rule 9003 matches during idle baseline, the endpoint sentinel is not submission-specific enough for this session and the later Rule 9003 match cannot be used even as submission-specific endpoint-request evidence.

Result:

**INCONCLUSIVE**

## Limits of Rule 9003

Rule 9003 is intentionally conditional.

It does **not** assume the human Access Token Debugger uses the public Graph endpoint.

It only provides positive evidence that the current debugger flow produced a matching direct browser request attempt.

It does not observe network completion or response-body processing. If Meta's debugger uses a different/internal route, a server-side backend hop, or an invisible transport path, the result remains INCONCLUSIVE.

The rule also does not establish universal future behavior. Evidence must bind:

- Chrome version;
- extension commit/hash;
- exact Rule 9001/9002/9003 definitions and priorities;
- debugger page/origin;
- observation timestamps;
- fresh idle baseline result;
- Rule 9002/9003 fresh counts;
- debugger session/result classification;
- observation UTC.

Material UI/tool changes require revalidation.

## Chrome privacy boundary

Current Chrome documentation states that:

- `declarativeNetRequest` can block/allow based on request URLs without request interception/content viewing;
- the plain `declarativeNetRequest` permission provides implicit access to block and allow actions without requesting full host access;
- `initiatorDomains`, `requestDomains`, `requestMethods`, `regexFilter` and explicit `resourceTypes` are supported rule conditions;
- `declarativeNetRequestFeedback` enables `getMatchedRules()` **and** `onRuleMatchedDebug`.

Therefore the previously adopted code-review constraint remains mandatory:

- no `onRuleMatchedDebug`;
- no request-detail event object;
- no webRequest;
- no headers/body/cookies;
- no logging/persistence/network calls;
- strict projection of matched rule ID/tab ID/timestamp/query status only.

## Output-binding research result

The official Meta `facebook/agentic-tools` skill materially closes the field-semantics gap.

### Supported diagnostic field semantics — sufficient

Official Meta source directly supports these later inspector-output classes:

- explicit validity;
- token type;
- app ID/application;
- issuance;
- expiry;
- data-access expiry;
- scopes;
- granular scope names;
- sanitized error code/subcode/message.

Classification:

**OUTPUT FIELD SEMANTICS = SUFFICIENT**

### Safe subject/target binding — still pending

The same official Meta skill deliberately redacts:

- `user_id`;
- granular-scope target IDs/profile IDs.

English Hills B1 still needs nonsecret confidence that:

- the token belongs to the expected dedicated lifecycle subject; and
- no unexpected granular targets expand authority beyond the adopted lifecycle endpoint.

Therefore the remaining output problem is narrower than before.

Current classification:

**ALLOWLISTED VALID-TOKEN OUTPUT BINDING = PARTIAL — SUBJECT/TARGET SAFE BINDING PENDING**

A later reviewed design may use local comparison without recording raw personal IDs, for example:

- compare debugger subject locally against the already-known expected dedicated System User and record only `subject_matches_expected = true/false`;
- compare granular target IDs locally against an approved set of already-known nonpersonal business asset IDs and emit only allowlisted matches/unexpected-target count.

This research does not authorize or implement such comparison logic.

## Meta bundled script — useful evidence, not adopted execution path

Meta's official `debug_token_probe.py` is strong evidence for:

- the supported remote endpoint;
- expected diagnostic fields;
- safe redacted output principles.

It is **not adopted as the English Hills inspector implementation** because:

1. it builds the input token and app access token into a GET query string;
2. it requires access to the C2 app secret;
3. it uses environment variables for secret handling in a throwaway shell.

Those are new/different credential-handling boundaries from the current owner-adopted human-debugger architecture.

Using that script later would require a separate explicit architecture amendment and owner approval.

## Research conclusion

A useful nonsecret **remote-endpoint request observation** now exists conditionally:

> a fresh, submission-specific Rule 9003 match for the exactly anchored Meta Graph `/debug_token` endpoint, with a clean idle baseline and zero higher-priority Rule 9002 marker leak matches.

This observation is supported by:

- current Meta official evidence that `/debug_token` is a supported remote token-inspection endpoint; and
- Chrome DNR's supported ability to match/allow that exact request attempt without request-detail interception.

It does **not** prove remote evaluation. No current evidence in this research safely links the submitted synthetic input to completed Meta evaluation.

Therefore the state is deliberately split:

- **SUPPORTED REMOTE-ENDPOINT REQUEST OBSERVATION = CANDIDATE DEFINED, NOT VERIFIED**
- **SUPPORTED REMOTE-EVALUATION SIGNAL = UNRESOLVED / NOT YET DEFINED**

Implementing Rule 9003 may still be worthwhile as a narrowly scoped observation tool, but it cannot close the remote-evaluation requirement by itself.

Also:

- if Rule 9003 never appears, the debugger remains INCONCLUSIVE;
- output subject/target safe binding is still pending;
- safe inspector remains BLOCKED.

## Proposed next step

Prepare a narrow amendment to the already-adopted monitor design adding Rule 9003 only as a **remote-endpoint request observer**, with its exact-host HTTPS regex, idle-baseline, strict-priority and bounded-result contract.

That amendment must not claim remote evaluation from a Rule 9003 match.

Only after exact-head independent review and owner adoption should implementation of the three-rule monitor be commissioned. A separate supported method would still be required to prove completed remote evaluation/input linkage before inspector READY.

No implementation is authorized by this research.

## Current state

- **B5 = READY**
- **SUPPORTED REQUEST-TRANSPORT / TRANSIENT-REDIRECT EVIDENCE = PENDING**
- **SUPPORTED REMOTE-ENDPOINT REQUEST OBSERVATION = CANDIDATE DEFINED, NOT VERIFIED**
- **SUPPORTED REMOTE-EVALUATION SIGNAL = UNRESOLVED / NOT YET DEFINED**
- **OUTPUT FIELD SEMANTICS = SUFFICIENT**
- **ALLOWLISTED VALID-TOKEN OUTPUT BINDING = PARTIAL — SUBJECT/TARGET SAFE BINDING PENDING**
- **safe non-event inspector = BLOCKED**
- **B1 actual credential acceptance = PENDING**
- **PREFLIGHT VERIFIED = NO**
