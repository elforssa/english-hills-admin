# EH Meta Debugger Transport Monitor

## Status

**IMPLEMENTED FOR CODE REVIEW ONLY — DO NOT INSTALL OR OPERATE YET.**

This directory is a non-runtime Chrome Manifest V3 extension implementing the owner-adopted three-rule synthetic transport monitor architecture.

It is not part of the Next.js application, Vercel runtime, Supabase runtime or any production deployment.

Installation, synthetic browser testing, Meta access and credential operations remain separately gated.

## Security boundary

The manifest requests only:

- `declarativeNetRequest`
- `declarativeNetRequestFeedback`

It deliberately has no host permissions, content scripts, background worker, storage, cookies, tabs/activeTab, debugger, proxy, native messaging or page-injection capability.

The code uses only `getMatchedRules()`. It reads Chrome's `RulesMatchedDetails.rulesMatchedInfo` envelope and treats malformed responses as **INCONCLUSIVE**. It must never use `onRuleMatchedDebug`, which can expose request details.

No request URLs, headers, bodies, cookies or session material are persisted or displayed.

## Rules

- **9001** — fixed synthetic calibration marker, block.
- **9002** — fixed synthetic debugger marker, block, priority 300.
- **9003** — exact Meta Graph `/debug_token` endpoint request observer, allow, priority 200, explicitly case-sensitive.

Rule 9002 strictly outranks Rule 9003.

Rule 9003 matches only exact HTTPS `graph.facebook.com` with complete versioned/unversioned `/debug_token` path and an optional query suffix, initiated by `developers.facebook.com`.

A Rule 9003 match means only that a matching browser request attempt was observed. It does not prove request completion, Meta processing, input linkage or completed evaluation.

## Observation windows

The monitor page keeps observation identities/start timestamps only in page memory. Pending queries are invalidated by Reset, a restarted window, or a newer overlapping query and cannot overwrite the newer state. Completion time is re-read after the Chrome promise resolves before the 60-second window is assessed.

- calibration window;
- Rule 9003 idle-baseline window;
- synthetic assessment window.

Every query:

- has a fresh start timestamp;
- omits `tabId`, covering all retained tabs/unassociated matches;
- must occur within 60 seconds;
- treats query errors or lost/invalid windows as INCONCLUSIVE.

Stale matches before the observation start are defensively filtered.

## Tests

Run:

`npm run test:inspector-monitor`

The test suite enforces permissions, rule IDs/priorities/actions, exact ResourceType coverage, endpoint-regex boundaries, stale-window behavior, query-error semantics, tab `-1` retention, strict result projection, and absence of forbidden request-detail/network/persistence APIs.

The tests do not establish actual Chrome or Meta behavior. Operational synthetic testing remains separately authorized.
