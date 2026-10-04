# H3 Revision 7 — safe non-event inspector synthetic assessment packet

## Status

**Tier 3 — preparation for a synthetic/noncredential human-only assessment.**

Baseline main:

`6c62828d7b1edd53db2880ba3823dd25d8823d6f`

This packet authorizes no real lifecycle credential, no app secret, no `/events`, no Test Events, no Revoke tokens and no Vercel mutation.

The purpose is to determine whether Meta's human **Access Token Debugger** can satisfy the existing safe non-event inspection contract without placing credential material into URLs/history or requiring another lifecycle credential to authenticate the inspector.

## Current evidence

### Human Access Token Debugger surface

Canonical current tool URL:

<https://developers.facebook.com/tools/debug/accesstoken/>

A public unauthenticated fetch reached Meta/Facebook login/blocking content rather than an authenticated debugger session. Therefore the available automated browser evidence cannot establish the logged-in tool's form transport, redirect behavior or output labels.

No Meta account was accessed by this preparation.

### `debug_token` API route

Canonical reference URL:

<https://developers.facebook.com/docs/graph-api/reference/debug_token/>

Public fetch currently returned HTTP 429 and did not supply a usable current reference body.

Separately, Meta's official Node Business SDK source at commit `0d245ec888c1af38d68994fd7f2e24cd38abc82f`, `src/api.js`, constructs a `GET .../debug_token` URL containing both `access_token` and `input_token` as URL query parameters in `getAppID()`.

That official implementation is enough to reject an SDK/API-query-string shortcut under the English Hills inspector contract.

Classification:

**Graph/API query-string debug_token path = NOT APPROVED**

The only remaining preferred candidate is the authenticated **human Access Token Debugger UI**, subject to the synthetic assessment below.

## Why the inspector is still blocked

The following facts remain unproved for the authenticated human debugger:

1. submitted input does not enter the visible address-bar URL;
2. submitted input does not create a credential-bearing browser-history URL;
3. visible redirects do not propagate input;
4. **background request transport and transient redirects do not place submitted input in a request URL**;
5. the human session can authenticate the tool independently of the future lifecycle System User credential;
6. tool/session failure can be distinguished from evaluated-token invalidity;
7. the later real-token result can be reduced to the approved strict nonsecret evidence allowlist without screenshots/raw responses.

The synthetic human procedure below can evaluate items 1–3 and 5–6 only. It **cannot prove item 4** because network/request capture is deliberately prohibited on the authenticated Meta session. Item 4 therefore remains a separate transport-evidence gate that must be satisfied before inspector READY.

Therefore:

**safe non-event inspector = BLOCKED**

## Synthetic assessment authorization target

Future owner authorization may permit exactly one human synthetic assessment using a clearly noncredential marker.

Approved synthetic marker for the future assessment:

`EH_DEBUGGER_SYNTHETIC_20261004_NOT_A_TOKEN`

This string is deliberately not a Meta credential and may be reported in evidence.

No real A/B token exists or is permitted by this packet.

## Human-only prerequisites

The operator must be the owner in a private human browser session.

Before opening the debugger:

- confirm Meta human login uses MFA;
- turn off screen sharing and recording;
- disable browser sync for form/history content for the assessment session;
- disable clipboard/cloud-clipboard history;
- disable extensions that capture form values, network traffic or diagnostics;
- do not open developer tools;
- do not start HAR/network recording;
- do not enable browser automation or agent/computer-use interaction;
- do not use a shared/public computer.

Because only synthetic input is used, the operator may inspect normal browser history after the submission to search for the exact synthetic marker. No screenshot is required.

## Exact synthetic assessment procedure

### Step 1 — open the tool

Manually open:

<https://developers.facebook.com/tools/debug/accesstoken/>

Do not paste any real credential.

Record only:

- whether the human is authenticated;
- whether the Access Token Debugger form loads;
- current tool/page label;
- current address-bar origin/path, with no session parameters copied into evidence.

Stop if the tool cannot be reached in a normal authenticated human session.

### Step 2 — establish pre-submit URL safety

Confirm the synthetic marker is not present in:

- address bar;
- visible page URL;
- browser history.

Do not inspect cookies, requests or developer tools.

### Step 3 — submit exactly one synthetic marker

Enter exactly:

`EH_DEBUGGER_SYNTHETIC_20261004_NOT_A_TOKEN`

into the Access Token Debugger input and submit once.

No retry if the result is ambiguous.

### Step 4 — URL/redirect check

Immediately after the result:

- inspect the address bar;
- confirm the full synthetic marker is absent;
- confirm no redirect URL visibly contains the marker.

Then use the browser's ordinary History UI/search to search for:

`EH_DEBUGGER_SYNTHETIC_20261004_NOT_A_TOKEN`

PASS only if no history URL/title entry exposes the marker as part of a URL.

Do not inspect network logs.

### Step 5 — inspector-session health check

Record only a sanitized classification:

- **TOOL_EVALUATED_SYNTHETIC_INPUT** — the authenticated debugger processed the submission and returned a token-specific invalid/evaluation result while the human session remained healthy;
- **TOOL_AUTH_FAILURE** — the result is a login/permission/authentication failure;
- **TOOL_FAILURE** — the tool itself errors/unavailable;
- **AMBIGUOUS** — cannot distinguish the above.

Do not paste arbitrary provider error text into chat/repository.

The synthetic input is expected to be invalid; its invalidity is not the test. The test is whether the tool itself is healthy and handles input without unsafe URL/history exposure.

### Step 6 — independent-authority observation

Record whether the debugger remains authenticated by the human Meta session rather than requesting a second lifecycle token/app-secret as the inspector credential.

PASS only if no lifecycle A/B token or app secret is required to authenticate the inspector UI itself.

If an additional app access token/secret is required, stop. That is a new credential boundary requiring a separate amendment.

## Synthetic assessment outcomes

### PASS — visible URL/history + session observations only

All of these must hold:

- authenticated human debugger loads;
- one synthetic submission only;
- synthetic marker absent from address bar after submission;
- synthetic marker absent from browser-history URLs;
- no **visible** redirect exposes the marker;
- no devtools/HAR/request capture required;
- human Meta session remains healthy;
- no lifecycle token/app secret is required to authenticate the inspector;
- tool processed the synthetic input sufficiently to distinguish tool health from login/tool failure.

A PASS establishes only:

**HUMAN DEBUGGER VISIBLE-URL/HISTORY + SESSION OBSERVATIONS = PASS**

It does **not** establish request-transport safety and does **not** establish:

**safe non-event inspector = READY**

Two separate gates remain before READY:

1. **SUPPORTED REQUEST-TRANSPORT / TRANSIENT-REDIRECT EVIDENCE** — evidence must establish that the debugger does not put submitted credential material into a request URL or transient redirect URL. Visible address-bar/history checks are insufficient for this.
2. **ALLOWLISTED VALID-TOKEN OUTPUT BINDING** — the current debugger's valid-token output fields must be safely mapped to the approved nonsecret evidence allowlist.

Passing either gate alone cannot clear the other.

### FAIL

Any visible URL/history exposure, additional credential requirement, forced capture/export or clear tool/auth failure is FAIL for the synthetic observation procedure. Absence of visible exposure is not proof of background request-transport safety.

Result:

**safe non-event inspector = BLOCKED**

Do not seek a workaround in the same session.

### INCONCLUSIVE

Ambiguous submission, uncertain history behavior or inability to distinguish tool health from token invalidity is INCONCLUSIVE.

Result:

**safe non-event inspector = BLOCKED**

No retry without a new reviewed action.

## Output allowlist for later real-token inspection

The existing Step 2 contract remains authoritative.

Only these classes of nonsecret fields may later be recorded after a real-token inspection is separately authorized:

- logical credential label;
- app ID;
- subject ID/mapping;
- token type;
- explicit validity boolean;
- issued timestamp;
- expiry timestamp;
- data-access expiry timestamp and documented meaning;
- scope names;
- granular target IDs;
- source/tool/version;
- independent inspector-health result;
- observation UTC;
- sanitized fixed failure category;
- evidence record ID.

Never record:

- token or fragment;
- token hash/fingerprint;
- app secret;
- session/cookie/auth headers;
- submitted URL/request body;
- raw provider response/error;
- debugger screenshot;
- personal profile/contact data;
- customer/event payload.

Before real A, a later reviewed packet must both:

- bind the current human debugger's visible valid-token fields to this allowlist or otherwise establish a safe fixed extraction method; and
- independently satisfy the separate supported request-transport/transient-redirect evidence gate.

Valid-token output-field binding alone cannot make the inspector READY.

## Explicitly rejected alternatives

Do not use:

- Meta Graph Explorer as an assumed substitute;
- SDK/API `GET /debug_token?...input_token=...`;
- any URL query-string token transport;
- GET-with-body or undocumented POST workaround;
- shell/curl command with token in argv;
- token in an environment variable/file for inspection;
- EH application code as the inspector;
- `/events` or Test Events as a validity check;
- another token from the dedicated lifecycle System User as inspector authentication.

## Next decision after synthetic assessment

If the human synthetic assessment passes, prepare a narrow evidence closeout that:

1. records only the sanitized **visible URL/history and session** observations;
2. leaves background request-transport/transient-redirect safety explicitly **UNPROVED** unless separate supported evidence already establishes it;
3. identifies a separately reviewed method/source capable of establishing request-transport safety without exposing authenticated-session secrets or broadly capturing unrelated traffic;
4. binds the current UI's valid-token output fields to the existing allowlist using only safe nonsecret evidence;
5. classifies the human debugger **READY** only if both the request-transport gate and the output-binding gate independently pass.

Do **not** casually enable developer tools, HAR capture, broad proxy logging or browser/network diagnostics on the authenticated Meta session merely to satisfy the transport gate. Any capture-based proposal requires its own narrowly scoped safety review proving that it cannot collect cookies, auth headers, session tokens or unrelated credential material.

If either gate cannot be established safely before real A, keep the inspector BLOCKED and propose a different inspection mechanism rather than weakening the contract.

## Current holds

- **B5 NONSECRET VERCEL PREFLIGHT = PASS** in the separate evidence record, pending review/adoption for READY
- **safe non-event inspector = BLOCKED**
- **B1 actual credential acceptance = PENDING**
- **PREFLIGHT VERIFIED = NO**
- no A/B generation
- no real token inspection
- no Revoke tokens
- no Vercel mutation
- no Production activation
- no H3-06–08/H4
