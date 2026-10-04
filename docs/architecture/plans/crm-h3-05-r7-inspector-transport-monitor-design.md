# H3 Revision 7 — inspector request-transport monitor design

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

Action:

- block

Purpose:

- prove the extension/ruleset is active before the Meta assessment.

#### Rule 9002 — debugger transport marker

Synthetic debugger marker:

`EHDBGTRANSPORT20261004C4D7A9F2`

Condition:

- `urlFilter`: exact marker above

Action:

- block

Purpose:

- detect and fail closed if the debugger ever attempts any browser request URL containing the synthetic token-shaped marker.

The marker is ASCII alphanumeric only so ordinary URL percent encoding does not change the marker characters.

### Result surface

The extension popup may call:

`chrome.declarativeNetRequest.getMatchedRules({ minTimeStamp: ... })`

and display only:

- Rule 9001 matched: YES/NO
- Rule 9002 matched: YES/NO
- match timestamp(s)
- tab ID(s)

It must not use `onRuleMatchedDebug`, because that debugging event exposes request details including URL.

It must not display or persist URLs.

No data is sent anywhere.

No telemetry.

No local storage.

No console logging of request details.

## Synthetic transport assessment

The future operator packet should use a **fake token-shaped input** containing Rule 9002's marker, long enough to exercise the debugger's normal remote-evaluation path rather than an obvious empty-input validation path.

Example shape, synthetic only:

`EAAEHDBGTRANSPORT20261004C4D7A9F2AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`

This is not a Meta credential.

### Calibration

1. Open a harmless test URL containing `EHDNRCAL20261004A9F2B7C4`.
2. Chrome should block the request.
3. Extension popup must report Rule 9001 matched.
4. If calibration does not match, stop. No Meta assessment.

### Meta synthetic test

In the authenticated human Access Token Debugger session:

1. keep screen sharing/recording off;
2. browser sync for form/history content off;
3. no devtools/HAR/proxy;
4. extension installed and calibrated;
5. submit the synthetic token-shaped marker exactly once;
6. record only the debugger's sanitized health classification;
7. immediately check extension popup for Rule 9002.

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

**TRANSPORT CANDIDATE PASS**

Rule 9001 calibration matched, Rule 9002 did not match, and the debugger demonstrably evaluated the synthetic token-shaped input rather than rejecting it locally before any remote evaluation.

Meaning:

- for the tested browser/tool flow, Chrome did not observe the exact synthetic marker in any request URL it evaluated;
- followed redirect request URLs containing the marker would also have matched the block rule;
- no headers/body/cookies were captured.

Limit:

This is empirical evidence for the tested current human debugger flow, browser version and synthetic token-shaped path. It does not establish a universal Meta API guarantee or prove behavior for a materially different debugger build.

The evidence must therefore bind:

- Chrome version;
- extension commit/hash;
- extension ruleset IDs;
- debugger page/origin;
- observation UTC;
- calibration PASS;
- debugger synthetic evaluation result;
- Rule 9002 match count = 0.

If the debugger UI/tool materially changes before real A issuance, rerun the synthetic transport assessment under a separately authorized same-version/freshness rule.

## Why this is safer than HAR/devtools/proxy capture

The proposed extension does not inspect network traffic.

It installs declarative URL block rules that Chrome evaluates internally.

The extension's allowed result API, `getMatchedRules()`, exposes rule identity, tab ID and timestamp—not request headers, bodies, cookies or request URLs.

Therefore it can answer the narrow question:

> Did any Chrome-evaluated request URL contain this exact synthetic marker?

without collecting the authenticated Meta session's secrets.

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

If this design receives exact-head independent review and owner adoption:

1. implement the tiny unpacked Chrome Manifest V3 transport-monitor extension in a dedicated non-runtime tools directory;
2. include unit/static tests that verify:
   - only the two DNR permissions exist;
   - no host permissions/content scripts/webRequest/cookies/tabs/storage/debugger/proxy permissions exist;
   - exactly two block rules exist;
   - exact marker strings are fixed synthetic values;
   - popup reads only `getMatchedRules()` and never request details;
   - no network/fetch/logging/storage code exists;
3. independently review exact extension code;
4. owner-authorize one synthetic calibration + Meta debugger transport assessment;
5. keep all real credentials prohibited.

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
