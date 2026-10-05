# H3 Revision 7 — inspector transport monitor implementation, 2026-10-04

> **HISTORICAL — SUPERSEDED BY S1.** S1 was owner-adopted and merged through PR #93 / main `284c2fe32014f8f3011ac6677ddfe99b0a16ca22`. Use the [sole active S1 Gate-B credential runbook](../plans/crm-h3-s1-gate-b-credential-runbook.md). Conflicting credential/bootstrap/inspector/rehearsal/per-action instructions below are retired, not execution requirements. Preserve original dated observations, findings and approval scope; unrelated R4 delivery safeguards remain. No historical approval authorizes current credential execution or activation.

## Status

**Tier 3 — implemented for code review only. NOT installed or operated.**

Architecture base:

`9f3ced1a8e184f2bc5c2afd0dc4d607eda71748d`

Implementation code checkpoint before this evidence record:

`d8328564a7c82601f2891350bf7baa17607059c3`

Owner-adopted architecture:

[Two-stage inspector bootstrap amendment](../plans/historical/crm-h3-05-r7-two-stage-inspector-bootstrap-amendment.md)

This implementation does not authorize installation, synthetic browser testing, Meta access, A/B generation, real-token inspection, Revoke tokens, Vercel mutation, H3-06–08, H4, Test Events or lifecycle sending.

## Non-runtime location

The extension lives only under:

`tools/meta-debugger-transport-monitor/`

It is not imported by the Next.js application and is not part of the Vercel/Supabase runtime.

Closed extension inventory (eight files):

- `README.md`
- `manifest.json`
- `monitor-controller.mjs`
- `monitor-core.mjs`
- `monitor.css`
- `monitor.html`
- `monitor.js`
- `rules.json`

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

Implemented regex (JSON-escaped `regexFilter` string as stored in `rules.json`):

`^https://graph\\.facebook\\.com/(v[0-9]{1,3}\\.[0-9]+/)?debug_token(\\?.*)?$`

Rule 9003 sets `isUrlFilterCaseSensitive=true`. All three reviewed rules now set that property explicitly. The initiator uses Chrome's `initiatorDomains` domain condition; it must not be described as an exact-origin restriction because Chrome domain matching includes subdomains.

Rule 9003 remains only a browser endpoint-request-attempt observation. It is not described as completion, provider processing, input linkage or evaluation proof.

## Monitor data boundary

The monitor keeps only three observation-start timestamps in page memory:

- calibration;
- idle baseline;
- assessment.

It calls only:

`chrome.declarativeNetRequest.getMatchedRules({ minTimeStamp })`

No `tabId` filter is supplied.

The page integration validates Chrome's actual `RulesMatchedDetails` envelope and extracts only `rulesMatchedInfo`. A malformed/missing envelope is **INCONCLUSIVE**, never empty-match evidence.

Observation state uses in-memory per-observation identity/query generations plus a controller-wide operation generation. After the async Chrome call returns, the implementation revalidates:

- the observation identity is still current;
- no later start, query (including a missing-start query), or Reset superseded it, regardless of observation kind;
- completion time remains inside the 60-second window.

A superseded query returns **INCONCLUSIVE / `observation_superseded`** without rendering, whether the Chrome promise resolves or rejects. It cannot overwrite a newer started/result/reset UI state. Per-observation start timestamps remain unchanged by cross-kind queries.

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

### Universal marker-leak precedence

A fresh Rule 9002 match is immediate **FAIL** in calibration, idle baseline or synthetic assessment. No other rule/result can override it.

### Calibration

- fresh Rule 9001 match with no Rule 9002 => PASS;
- stale matches are filtered;
- no fresh Rule 9001 => FAIL;
- malformed response/query/window ambiguity => INCONCLUSIVE.

### Idle baseline

- zero fresh Rule 9003 and zero Rule 9002 => PASS;
- fresh Rule 9003 => INCONCLUSIVE;
- fresh Rule 9002 => FAIL;
- malformed response/query/window ambiguity => INCONCLUSIVE.

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

### Permissions and executable inventory

- exact closed extension-file inventory;
- exactly the two reviewed DNR permissions;
- no host/optional-host/optional permissions;
- no content scripts;
- no background worker;
- no forbidden broad permissions;
- every executable JS/MJS file is explicitly inventoried and scanned.

### Rule contract

- exactly rules 9001/9002/9003;
- all 15 ResourceTypes on every rule;
- fixed synthetic markers;
- exact numeric priorities 9001=100, 9002=300, 9003=200;
- 9002 strict priority over 9003;
- 9003 GET + expected initiator domain condition;
- explicit case-sensitive URL matching;
- exact endpoint regex positive and negative cases, including uppercase-path rejection;
- guards against known unsupported RE2 lookaround/backreference constructs;
- exact host/scheme/path rejection cases;
- modeled matching for every reviewed ResourceType;
- modeled main-frame/background redirected marker requests.

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

Unit and controller/API-integration cases verify:

- Chrome's actual `{rulesMatchedInfo:[...]}` response envelope produces the required calibration/idle/assessment results;
- malformed envelopes => INCONCLUSIVE;
- 60-second expiry is evaluated at async completion time;
- invalid start => INCONCLUSIVE;
- stale calibration cannot PASS;
- query failure => INCONCLUSIVE;
- fresh idle Rule 9003 => INCONCLUSIVE;
- fresh Rule 9002 is FAIL during calibration, idle and assessment;
- no endpoint observation => INCONCLUSIVE;
- Rule 9003 endpoint observation retains the explicit non-evaluation limitation;
- tab `-1` matches are retained;
- injected request-detail fields are stripped from projected output;
- Reset during a pending query cannot be overwritten by the stale result;
- restarted observation windows invalidate older pending queries;
- newer overlapping queries supersede older pending queries;
- pending calibration → newer idle start/query and pending idle → newer assessment start/query preserve the latest render when the old promise resolves or rejects;
- a cross-kind start alone, query of an already-started window, or missing-start query also supersedes pending work. Controller tests reproduce the started-state render from `monitor.js`; no extension operation is performed.

## Validation boundary

PR #89 is open on `feat/h3-r7-inspector-transport-monitor`. Independent re-review of head `ab949f1bfe72dc1f1c9b2b85db44c161391e9bc5` returned **CHANGES REQUIRED**. The corrections below remain branch implementation only; fresh CI and independent review of the new exact head are required. Prior-head CI/review evidence does not establish acceptance of this revision.

Operational Chrome behavior is **not verified**.

Meta debugger behavior is **not verified**.

No extension was loaded into Chrome.

No synthetic request was run.

No provider surface was accessed.

No credential exists from this implementation.

## Required next gate

1. push the finding corrections to existing PR #89;
2. require fresh successful repository CI including `test:inspector-monitor` for the new exact head;
3. fresh exact-head independent Tier-3 re-review;
4. owner merge/release approval for the reviewed implementation;
5. only after that, prepare the exact human operator packet;
6. separate review + owner execution approval before installation/testing/provider actions.

## Current state

- **B5 = READY**
- **TWO-STAGE INSPECTOR BOOTSTRAP ARCHITECTURE = DEFINED**
- **transport monitor implementation = IMPLEMENTED ON REVIEW BRANCH / NOT MERGED OR ADOPTED / EXACT-HEAD INDEPENDENT RE-REVIEW REQUIRED**
- **transport monitor installation = NOT AUTHORIZED**
- **synthetic transport operation = NOT AUTHORIZED**
- **INSPECTOR TRANSPORT READY = NOT YET ACHIEVED**
- **A BOOTSTRAP VERIFIED = NO**
- **safe non-event inspector = BLOCKED operationally**
- **B1 actual credential acceptance = PENDING**
- **PREFLIGHT VERIFIED = NO**


## First exact-code review correction delta

The first independent implementation review at PR #89 head `ab99be3084d7b02858887b7db7e9f5c122d87633` found four blocking integration/test defects and two important matching/test qualifications. The branch correction now:

1. extracts and validates Chrome `RulesMatchedDetails.rulesMatchedInfo`;
2. revalidates observation identity and completion time after async queries;
3. applies Rule 9002 FAIL precedence to calibration and idle as well as assessment;
4. fixes the CI source-format assertion while preserving the single-property `minTimeStamp` query contract;
5. sets case-sensitive URL matching explicitly;
6. replaces the incorrect non-capturing-group claim with guards for known unsupported RE2 lookaround/backreference constructs;
7. closes the executable-file inventory and expands controller/API lifecycle tests.

The earlier CI failure is historical and does not count as acceptance. The corrected exact head must pass fresh CI and fresh independent review.

## Exact-head re-review correction delta

The independent re-review of PR #89 head `ab949f1bfe72dc1f1c9b2b85db44c161391e9bc5` returned **CHANGES REQUIRED** for cross-kind pending-query supersession and malformed/stale implementation evidence. This correction:

1. adds a controller-wide operation generation so every later valid-kind start/query/Reset supersedes older pending queries across all observation kinds, preserving existing Reset/restart/same-kind guards and per-observation timestamps;
2. adds cross-kind resolution/rejection regressions for newer started and completed results, already-started queries and missing-start results;
3. removes the accidental duplicated opening, restores the exact JSON-escaped Rule 9003 regex, and records all eight extension files;
4. corrects stale PR/validation gate claims while retaining historical review findings.

The owner directly authorized only these finding corrections, local validation and a normal commit/push to PR #89. Merge, installation, browser operation, Meta/credential/revoke/Vercel actions, Test Events and lifecycle operations remain held. No architecture, permission, rule, runtime or Production boundary changes are introduced.
