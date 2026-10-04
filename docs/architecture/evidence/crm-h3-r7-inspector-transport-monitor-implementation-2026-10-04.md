# H3 Revision 7 — inspector transport monitor implementation, 2026-10-04

## Status

**Tier 3 — implemented for code review only. NOT installed or operated.**

Architecture base:

`9f3ced1a8e184f2bc5c2afd0dc4d607eda71748d`

Implementation code checkpoint before this evidence record:

`d8328564a7c82601f2891350bf7baa17607059c3`

Owner-adopted architecture:

[Two-stage inspector bootstrap amendment](../plans/crm-h3-05-r7-two-stage-inspector-bootstrap-amendment.md)

This implementation does not authorize installation, synthetic browser testing, Meta access, A/B generation, real-token inspection, Revoke tokens, Vercel mutation, H3-06–08, H4, Test Events or lifecycle sending.

## Non-runtime location

The extension lives only under:

`tools/meta-debugger-transport-monitor/`

It is not imported by the Next.js application and is not part of the Vercel/Supabase runtime.

Files:

- `manifest.json`
- `rules.json`
- `monitor.html`
- `monitor.css`
- `monitor.js`
- `monitor-core.mjs`
- `README.md`

Dedicated tests:

`scripts/test-meta-debugger-transport-monitor.mjs`

Package command:

`npm run test:inspector-monitor`

The command is also appended to the normal `npm test` chain so non-doc CI cannot silently skip these controls.

## Manifest boundary

Requested permissions are exactly:

- `declarativeNetRequest`
- `declarativeNetRequestFeedback`

The manifest defines no:

- host permissions;
- optional host permissions;
- content scripts;
- background worker.

The extension uses an options page rather than a transient popup so observation timestamps can remain in page memory without storage permission.

## Rule implementation

All three rules explicitly enumerate the reviewed 15 Chrome ResourceTypes:

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

### Rule 9001

- priority 100;
- action `block`;
- fixed calibration marker only:
  - `EHDNRCAL20261004A9F2B7C4`.

### Rule 9002

- priority 300;
- action `block`;
- fixed debugger synthetic marker only:
  - `EHDBGTRANSPORT20261004C4D7A9F2`.

### Rule 9003

- priority 200;
- action `allow`;
- Rule 9002 therefore strictly outranks Rule 9003;
- initiator domain condition:
  - `developers.facebook.com`;
- GET only;
- exact URL regex:
  - exact `https://`;
  - exact `graph.facebook.com`;
  - optional version segment;
  - complete `/debug_token` path;
  - optional query suffix only.

Implemented regex:

`^https://graph\.facebook\.com/(?:v[0-9]{1,3}\.[0-9]+/)?debug_token(?:\?.*)?$`

Rule 9003 remains only a browser endpoint-request-attempt observation. It is not described as completion, provider processing, input linkage or evaluation proof.

## Monitor data boundary

The monitor keeps only three observation-start timestamps in page memory:

- calibration;
- idle baseline;
- assessment.

It calls only:

`chrome.declarativeNetRequest.getMatchedRules({ minTimeStamp })`

No `tabId` filter is supplied.

The pure projection retains only:

- rule ID;
- ruleset ID;
- tab ID;
- match timestamp.

Request-detail fields are discarded by construction.

The monitor contains no persistent storage.

## Bounded result semantics

Observation window:

**60 seconds maximum**

Invalid/lost/expired observation state is INCONCLUSIVE.

Query exception is INCONCLUSIVE.

### Calibration

- fresh Rule 9001 match => PASS;
- stale matches are filtered;
- no fresh Rule 9001 => FAIL;
- query/window ambiguity => INCONCLUSIVE.

### Idle baseline

- zero fresh Rule 9003 => PASS;
- fresh Rule 9003 => INCONCLUSIVE;
- query/window ambiguity => INCONCLUSIVE.

### Synthetic assessment

- any fresh Rule 9002 => FAIL;
- zero Rule 9002 + zero Rule 9003 => INCONCLUSIVE;
- zero Rule 9002 + fresh Rule 9003 => monitor component PASS:
  - `endpoint_request_attempt_observed_without_marker_url_match`.

That PASS is intentionally bounded to the monitor component. It carries this explicit limitation:

> This observes a request attempt only; it does not prove request completion, Meta processing, input linkage, or completed evaluation.

The extension itself does not declare `INSPECTOR TRANSPORT READY`; T1/T4/T7/T8 and the complete operator decision remain outside the implementation.

## Machine-enforced security tests

The dedicated Node test checks:

### Permissions

- exactly the two reviewed DNR permissions;
- no host/optional-host permissions;
- no content scripts;
- no background worker;
- no forbidden broad permissions.

### Rule contract

- exactly rules 9001/9002/9003;
- all 15 ResourceTypes on every rule;
- fixed synthetic markers;
- 9002 strict priority over 9003;
- 9003 GET + expected initiator;
- exact endpoint regex positive and negative cases;
- exact host/scheme/path rejection cases;
- representative main-frame/background request coverage;
- redirected URLs containing Rule 9002's marker still satisfy the fixed substring condition.

### Code secrecy boundary

Static tests reject use of:

- `onRuleMatchedDebug`;
- `chrome.webRequest`;
- `fetch()`;
- `XMLHttpRequest`;
- `sendBeacon`;
- `chrome.storage`;
- local/session storage;
- IndexedDB;
- console logging;
- tabs/debugger/proxy APIs.

Tests also enforce that the match query contains only `minTimeStamp` and no `tabId` filter, and that the monitor page loads no remote content.

### Observation semantics

Pure-unit cases verify:

- 60-second expiry;
- invalid start => INCONCLUSIVE;
- stale calibration cannot PASS;
- query failure => INCONCLUSIVE;
- fresh idle Rule 9003 => INCONCLUSIVE;
- Rule 9002 wins as FAIL even if Rule 9003 is also present;
- no endpoint observation => INCONCLUSIVE;
- Rule 9003 endpoint observation retains the explicit non-evaluation limitation;
- tab `-1` matches are retained;
- injected request-detail fields are stripped from projected output.

## Validation boundary

At this evidence-writing point, implementation files and tests have been committed but the branch PR/CI exact-head verification has not yet been created.

Operational Chrome behavior is **not verified**.

Meta debugger behavior is **not verified**.

No extension was loaded into Chrome.

No synthetic request was run.

No provider surface was accessed.

No credential exists from this implementation.

## Required next gate

1. open implementation PR;
2. run repository CI including `test:inspector-monitor`;
3. exact-code independent Tier-3 review;
4. owner merge/release approval for the reviewed implementation;
5. only after that, prepare the exact human operator packet;
6. separate review + owner execution approval before installation/testing/provider actions.

## Current state

- **B5 = READY**
- **TWO-STAGE INSPECTOR BOOTSTRAP ARCHITECTURE = DEFINED**
- **transport monitor implementation = IMPLEMENTED ON REVIEW BRANCH / NOT REVIEWED**
- **transport monitor installation = NOT AUTHORIZED**
- **synthetic transport operation = NOT AUTHORIZED**
- **INSPECTOR TRANSPORT READY = NOT YET ACHIEVED**
- **A BOOTSTRAP VERIFIED = NO**
- **safe non-event inspector = BLOCKED operationally**
- **B1 actual credential acceptance = PENDING**
- **PREFLIGHT VERIFIED = NO**
