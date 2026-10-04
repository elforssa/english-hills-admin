# H3 Revision 7 — inspector request-transport monitor design

> **HISTORICAL — SUPERSEDED BY S1.** S1 was owner-adopted and merged through PR #93 / main `284c2fe32014f8f3011ac6677ddfe99b0a16ca22`. Use the [sole active S1 Gate-B credential runbook](crm-h3-s1-gate-b-credential-runbook.md). Conflicting credential/bootstrap/inspector/rehearsal/per-action instructions below are retired, not execution requirements. Preserve original dated observations, findings and approval scope; unrelated R4 delivery safeguards remain. No historical approval authorizes current credential execution or activation.

## Status

**Tier 3 — documentation/research proposal only.**

Baseline main:

`13853983dadee2a0fde93388f976887df628acbc`

Current adopted state:

- **4A = VERIFIED C2 CREATION**
- **4B = VERIFIED ASSOCIATION**
- **4C = VERIFIED DATASET GRANT**
- **B5 = READY**
- **safe non-event inspector = BLOCKED**
- **B1 actual credential acceptance = PENDING**
- **PREFLIGHT VERIFIED = NO**

This proposal authorizes no browser extension installation, Meta account action, token generation, real-token inspection, Revoke tokens, Vercel write, H3-06–08, H4, Test Events or lifecycle send.

Its purpose is to satisfy the remaining **SUPPORTED REQUEST-TRANSPORT / TRANSIENT-REDIRECT EVIDENCE** gate without enabling HAR, developer-tools network capture, proxy interception or any mechanism that can read Meta session headers/cookies.

## Problem to solve

The existing synthetic Access Token Debugger packet can establish only:

- visible address-bar observations;
- visible browser-history observations;
- visible redirects;
- human-session health;
- additional-credential requirements.

Those observations do not prove that a background request or transient redirect URL never contains the submitted token.

The existing contract also prohibits broad authenticated-session network capture because HAR/devtools/proxy tooling can expose cookies, authorization headers, session tokens and unrelated credential material.

Therefore the remaining requirement is a narrowly scoped URL-only transport detector that:

1. evaluates browser request URLs before they are sent;
2. detects the exact synthetic marker if it appears in any request URL;
3. catches redirected requests as new request URLs;
4. cannot read request bodies, headers, cookies, page DOM or token values other than the predefined synthetic marker;
5. returns only a nonsecret match/no-match record.

## Current external evidence

### Meta's supported API/debug routes remain unsuitable

Current Meta-operated Postman documentation for WhatsApp Cloud API exposes **Debug Access Token** as a GET request with `input_token` in the query string:

<https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api>

Meta's public Facebook Marketing API Postman documentation also directs developers to paste tokens into the Access Token Debugger to inspect token type and permissions:

<https://www.postman.com/meta/facebook-marketing-api/documentation/0zr4mes/facebook-marketing-api-mapi>

Meta's official Node Business SDK at commit `0d245ec888c1af38d68994fd7f2e24cd38abc82f`, `src/api.js`, constructs a GET `debug_token` URL with both `input_token` and `access_token` query parameters.

Meta's official Java Business SDK at commit `0bef9f52ca443ade298f72db18e0c3c72699079d`, `APIContext.java`, likewise executes GET `/debug_token` with `input_token`, `access_token` and `fields=app_id`.

Therefore:

**Meta API/SDK debug_token route = NOT APPROVED**

under the adopted no-token-in-request-URL rule.

No current public Meta documentation found in this research establishes how the authenticated human Access Token Debugger transports its submitted value.

### Chrome declarative request rules

Current Chrome extension documentation states that `chrome.declarativeNetRequest` applies declarative rules to network request URLs without intercepting/viewing request content, and specifically describes the API as providing more privacy than request-interception APIs.

Official reference:

<https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest>

Relevant documented facts:

- a rule may **block** a network request when its `urlFilter` matches;
- `urlFilter` is matched against the network request URL;
- the `declarativeNetRequest` permission can provide block-rule capability without requesting full host access;
- redirect handling creates a new browser request, so a URL rule applies to the redirected request URL as well;
- an unpacked extension with `declarativeNetRequestFeedback` may call `getMatchedRules()`;
- `getMatchedRules()` returns only matched rule ID/ruleset ID, tab ID and timestamp via `MatchedRuleInfo`; it does **not** return request headers, request body, cookies or the request URL itself.

This provides a candidate mechanism for the missing transport gate.

## Proposed Chrome transport monitor

### Design goal

Build a tiny, temporary, unpacked Manifest V3 Chrome extension whose only purpose is to block and count requests whose **URL contains one exact synthetic marker**.

It is not a generic network inspector.

### Required permissions

Only:

- `declarativeNetRequest`
- `declarativeNetRequestFeedback`

Explicitly prohibited:

- no `webRequest`
- no `webRequestBlocking`
- no `cookies`
- no `tabs`
- no `activeTab`
- no content scripts
- no host permissions
- no `storage`
- no debugger protocol
- no native messaging
- no proxy/VPN permission
- no page DOM access

The extension must have no capability to read Meta cookies, request headers, request bodies, page content or arbitrary URLs.

### Rules

Use two static block rules.

#### Rule 9001 — calibration marker

Synthetic calibration marker:

`EHDNRCAL20261004A9F2B7C4`

Condition:

- `urlFilter`: exact marker above
- `resourceTypes`: explicit full supported request-type set:
  - `main_frame`
  - `sub_frame`
  - `stylesheet`
  - `script`
  - `image`
  - `font`
  - `object`
  - `xmlhttprequest`
  - `ping`
  - `csp_report`
  - `media`
  - `websocket`
  - `webtransport`
  - `webbundle`
  - `other`

This explicit list is required because Chrome otherwise excludes `main_frame` when no resource-type condition is supplied. It intentionally covers top-level navigation, subframes, background/fetch-style requests, WebSocket/WebTransport and other request classes.

Action:

- block

Purpose:

- prove the extension/ruleset is active before the Meta assessment.

#### Rule 9002 — debugger transport marker

Synthetic debugger marker:

`EHDBGTRANSPORT20261004C4D7A9F2`

Condition:

- `urlFilter`: exact marker above
- `resourceTypes`: explicit full supported request-type set:
  - `main_frame`
  - `sub_frame`
  - `stylesheet`
  - `script`
  - `image`
  - `font`
  - `object`
  - `xmlhttprequest`
  - `ping`
  - `csp_report`
  - `media`
  - `websocket`
  - `webtransport`
  - `webbundle`
  - `other`

This explicit list is required because Chrome otherwise excludes `main_frame` when no resource-type condition is supplied. It intentionally covers top-level navigation, subframes, background/fetch-style requests, WebSocket/WebTransport and other request classes.

Action:

- block

Purpose:

- detect and fail closed if the debugger ever attempts any browser request URL containing the synthetic token-shaped marker, including a top-level navigation, background request or newly followed redirect request.

The marker is ASCII alphanumeric only so ordinary URL percent encoding does not change the marker characters.

### Result surface

Use a persistent internal extension monitor page rather than a transient popup so the observation-start timestamp can remain in page memory without `storage` permission.

The monitor page may call:

`chrome.declarativeNetRequest.getMatchedRules({ minTimeStamp: observationStart })`

with **no `tabId` filter**, so the query covers matches across all tabs and unassociated/no-active-tab requests that Chrome still retains.

It may display only:

- Rule 9001 matched: YES/NO
- Rule 9002 matched: YES/NO
- match timestamp(s)
- tab ID(s)
- query status: SUCCESS / ERROR

The monitor must bind a fresh `observationStart = Date.now()` **before** each calibration or debugger submission. Matches older than that timestamp never count. This prevents stale matches from satisfying calibration.

The match query must run promptly after each test and no later than **60 seconds** after the relevant request attempt. Chrome documents that matches not associated with an active document may stop being returned after five minutes, so the operator contract must never use a delayed query as evidence.

A `getMatchedRules()` rejection, exception, malformed result or lost observation-start state is **INCONCLUSIVE**. It must never be converted to “zero matches.”

The `declarativeNetRequestFeedback` permission is broader than this intended result surface: Chrome documents that it enables both `getMatchedRules()` and `onRuleMatchedDebug`. Therefore secrecy depends on the **reviewed extension code**, not the permission list alone.

The reviewed implementation must:

- contain no reference/listener registration for `onRuleMatchedDebug`;
- contain no code path that receives `MatchedRuleInfoDebug.request`;
- not display or persist URLs;
- make no network/fetch/XHR calls;
- use no storage;
- emit no telemetry;
- perform no console logging of request details.

Static tests must fail if `onRuleMatchedDebug`, request-detail logging, persistence or network calls are introduced.

## Synthetic transport assessment

The future operator packet should use a **fake token-shaped input** containing Rule 9002's marker, long enough to exercise the debugger's normal remote-evaluation path rather than an obvious empty-input validation path.

Example shape, synthetic only:

`EAAEHDBGTRANSPORT20261004C4D7A9F2AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`

This is not a Meta credential.

### Calibration

1. In the extension monitor page, start a **fresh calibration observation window** and bind `calibrationStart = Date.now()`.
2. Open a harmless **top-level navigation** URL containing `EHDNRCAL20261004A9F2B7C4`.
3. Chrome should block the request under Rule 9001 with explicit `main_frame` coverage.
4. Within 60 seconds, query `getMatchedRules({ minTimeStamp: calibrationStart })` with no `tabId` filter.
5. PASS calibration only if a fresh Rule 9001 match timestamp is at or after `calibrationStart`.
6. A stale Rule 9001 match from an earlier run cannot satisfy calibration.
7. Any query error/lost start time/ambiguous result is INCONCLUSIVE and stops before Meta.
8. If fresh calibration does not match, stop. No Meta assessment.

The future implementation tests must separately exercise Rule 9001 and Rule 9002 against `main_frame`, representative background request types and redirected marker requests.

### Meta synthetic test

In the authenticated human Access Token Debugger session:

1. keep screen sharing/recording off;
2. browser sync for form/history content off;
3. no devtools/HAR/proxy;
4. extension installed and freshly calibrated;
5. in the extension monitor page, bind a fresh `assessmentStart = Date.now()` **before** submission;
6. submit the synthetic token-shaped marker exactly once;
7. record only the debugger's sanitized health classification;
8. within 60 seconds, query `getMatchedRules({ minTimeStamp: assessmentStart })` with **no `tabId` filter**;
9. include fresh Rule 9002 matches from any tab ID, including `-1`/unassociated requests;
10. any query error, lost/invalid observation window or ambiguous result is **INCONCLUSIVE**, never “zero matches.”

The extension monitor does not establish that the debugger performed a remote evaluation. A visible invalid-input message is not remote-evaluation proof.

### Transport result

**TRANSPORT FAIL**

Rule 9002 matched.

Meaning:

- at least one browser request URL or followed redirect request URL contained the exact synthetic marker;
- the block rule prevented that matching request from being sent;
- human debugger is not acceptable for real lifecycle tokens under the current contract.

Result:

**safe non-event inspector = BLOCKED**

No retry/workaround in the same session.

**NO MARKER URL MATCH OBSERVED — REMOTE EVALUATION UNPROVED**

Fresh Rule 9001 calibration matched and the fresh all-tabs Rule 9002 query completed successfully with zero Rule 9002 matches.

Meaning:

- for the bounded observation window, Chrome returned no retained DNR match showing the exact synthetic marker in a request URL;
- explicit resource-type coverage included `main_frame` and background request classes;
- a followed redirect request URL containing the marker would be evaluated as a new request against the same rule;
- no headers/body/cookies were captured.

This result is **not TRANSPORT PASS by itself**.

A displayed debugger error/invalid-input message cannot prove the synthetic value reached a remote evaluation path. Therefore, unless a **separate supported nonsecret remote-evaluation signal** has already been independently reviewed and satisfied for the same current debugger flow, the assessment result is:

**INCONCLUSIVE — REMOTE EVALUATION UNPROVED**

Only when all of the following are independently true may the result be upgraded to **TRANSPORT CANDIDATE PASS**:

1. fresh calibration PASS;
2. successful fresh all-tabs match query with Rule 9002 count = 0;
3. separate reviewed evidence proves the synthetic submission reached the debugger's remote evaluation path rather than being rejected locally;
4. that remote-evaluation evidence itself does not expose request URLs, cookies, auth headers, session credentials, request bodies or other sensitive Meta-session material.

This design does **not** yet define or approve such a remote-evaluation signal. Until one is separately established, zero Rule 9002 matches remain INCONCLUSIVE.

Any future transport evidence must bind:

- Chrome version;
- extension commit/hash;
- complete explicit resource-type rule list;
- extension ruleset IDs;
- debugger page/origin;
- calibration and assessment observation-start timestamps;
- observation UTC;
- fresh calibration result;
- match-query success;
- all-tabs/unassociated-request coverage;
- Rule 9002 match count;
- separately reviewed remote-evaluation evidence reference, if any.

If the debugger UI/tool materially changes before real A issuance, rerun the synthetic transport assessment under a separately authorized same-version/freshness rule.

## Why this is safer than HAR/devtools/proxy capture

The proposed extension does not need to intercept network traffic.

It installs declarative URL block rules that Chrome evaluates internally.

Chrome's `getMatchedRules()` result schema exposes matched rule identity, tab ID and timestamp rather than request headers, bodies, cookies or request URLs. However, `declarativeNetRequestFeedback` also enables the more revealing `onRuleMatchedDebug` API. The privacy boundary therefore depends on the exact reviewed implementation **not using** that debug event or any other request-detail API.

Under that reviewed-code constraint, the monitor can answer the narrow question:

> Did Chrome report a match for the exact synthetic marker during the fresh bounded observation window?

without intentionally collecting authenticated Meta-session request details.

A zero-match answer still does not prove remote evaluation and remains INCONCLUSIVE unless the separate remote-evaluation gate is satisfied.

## Remaining output-binding gate

Passing request-transport evidence still does **not** make the inspector READY.

Separate gate:

**ALLOWLISTED VALID-TOKEN OUTPUT BINDING**

Current public Meta-operated documentation establishes only part of the expected human debugger semantics:

- Meta's Facebook Marketing API Postman documentation says the debugger displays token **type** and granted **permissions**.
- Meta's WhatsApp system-user generation guidance says a generated system-user token can be opened in Token Debugger and the selected permissions should appear.
- Meta's official SDK implementations establish that `app_id` is a supported debug-token field.

This is insufficient to bind every required B1 field on the current human debugger UI without a valid token.

Therefore output binding remains:

**PARTIAL / BLOCKED**

No real A may be generated merely to discover field labels under this proposal.

A later reviewed decision must either:

1. establish the remaining valid-token field mapping from current authoritative/safe noncredential evidence; or
2. approve a tightly bounded bootstrap amendment that uses the first disposable A only after transport safety is established and fails closed before any Production storage/recovery action if the required fields are unavailable.

This proposal does **not** approve option 2.

## B5 final adoption record

The owner adopted PR #84 and merged it at main `13853983dadee2a0fde93388f976887df628acbc`.

Therefore the current repository state should now be read as:

**B5 = READY**

Exact adopted future Vercel conditional-storage binding:

- Team `team_egUbt9wN23I40I1K71zxfYGj / English Hills' projects`
- Project `prj_hC0MvqsXYmERXhZWGEfOOma8D6E3 / english-hills-admin`
- key `CRM_META_LIFECYCLE_TOKEN_EH_R4`
- type Secret / API `sensitive`
- Production only
- server-side only
- no Preview/Development/custom-environment copy
- no unexpected-conflict upsert
- same-private-session insertion only after B acceptance
- metadata-only post-storage verification
- no export/readback/`vercel env pull`
- no activation/H3-06–08/H4 bundled with storage

No Vercel write is authorized by this record.

## Proposed next implementation step

Implementation is useful only as a **safe URL-match detector**; it cannot by itself close the transport gate when remote evaluation is unproved.

If this corrected design receives exact-head independent review and owner adoption:

1. implement the tiny unpacked Chrome Manifest V3 transport-monitor extension in a dedicated non-runtime tools directory;
2. include unit/static tests that verify:
   - only `declarativeNetRequest` and `declarativeNetRequestFeedback` permissions exist;
   - no host permissions/content scripts/webRequest/cookies/tabs/activeTab/storage/debugger/proxy permissions exist;
   - exactly two block rules exist;
   - **both rules explicitly contain the full supported ResourceType set including `main_frame`**;
   - representative main-frame, background and redirected synthetic marker requests match the expected rule;
   - exact marker strings are fixed synthetic values;
   - monitor-page queries bind a fresh start timestamp, omit `tabId`, run within the bounded window and treat errors as INCONCLUSIVE;
   - stale calibration matches cannot satisfy a fresh calibration;
   - unassociated/tab `-1` matches are not discarded;
   - the result projection reads only `getMatchedRules()`;
   - no `onRuleMatchedDebug` listener/reference exists;
   - no network/fetch/XHR, request-detail logging, telemetry or persistence code exists;
3. independently review exact extension code;
4. **before operational synthetic testing, separately resolve or explicitly retain as unresolved the remote-evaluation evidence gate**;
5. only then owner-authorize one synthetic calibration + Meta debugger assessment, understanding that absent remote-evaluation proof a zero-match outcome is INCONCLUSIVE;
6. keep all real credentials prohibited.

## Current holds

- **B5 = READY**
- **SUPPORTED REQUEST-TRANSPORT / TRANSIENT-REDIRECT EVIDENCE = PENDING**
- **ALLOWLISTED VALID-TOKEN OUTPUT BINDING = PENDING**
- **safe non-event inspector = BLOCKED**
- **B1 actual credential acceptance = PENDING**
- **PREFLIGHT VERIFIED = NO**
- no A/B generation
- no real token inspection
- no Revoke tokens
- no Vercel secret write
- no H3-06–08/H4
