# CI routing contract

Revision 3 — Outcome 2, 2026-10-05. **Tier 2: engineering workflow / CI-routing policy.**

Owner authorization: the 2026-10-05 Outcome-2 request approves implementing the conservative four-lane model and template consolidation together on current main `aa1c74f3152958afc50f348265a0688a55242dd7`. This revision records that scope; no separate architecture decision is outstanding. Source implementation is in this Outcome-2 branch; merge/adoption and terminal full CI remain pending. This is not release approval.

[AGENTS](../../../AGENTS.md#ci-selection-and-remote-ci-handoff) owns lifecycle policy. This document owns the compact routing contract, implemented by [Verify](../../../.github/workflows/verify.yml), [classifier/gate](../../../scripts/ci/verify.py) and [regressions](../../../scripts/ci/test_verify.py). Risk tier determines review/approval, never CI workload: a Tier-3 security document can use docs checks, while a Tier-1 source edit still selects full.

## Lanes and exact eligibility

| Lane | Eligible regular paths | Purpose |
| --- | --- | --- |
| `docs` | `docs/**/*.md`, including Markdown directly under `docs/` | Links, anchors, whitespace and added secret/PII heuristics without app dependencies. AI templates use this lane too. |
| `policy` | Exactly `AGENTS.md`, optionally with safe docs | Equivalent repository policy checks without starting the app or Supabase. No generic root-Markdown exemption. |
| `tooling` | Exact inventory below, optionally with safe docs | Isolated monitor behavior and manifest/static checks without app installation. |
| `full` | Everything else, including policy + tooling | Unknown or mixed dependency boundaries retain app + database coverage for PRs. |

The tooling allowlist is exactly:

- `tools/meta-debugger-transport-monitor/README.md`
- `tools/meta-debugger-transport-monitor/manifest.json`
- `tools/meta-debugger-transport-monitor/rules.json`
- `tools/meta-debugger-transport-monitor/monitor.html`
- `tools/meta-debugger-transport-monitor/monitor.css`
- `tools/meta-debugger-transport-monitor/monitor.js`
- `tools/meta-debugger-transport-monitor/monitor-core.mjs`
- `tools/meta-debugger-transport-monitor/monitor-controller.mjs`
- `scripts/test-meta-debugger-transport-monitor.mjs`

Dependency evidence: the extension imports only its own modules and uses browser APIs. The regression script uses Node built-ins, imports the monitor modules, reads its closed inventory and reads `package.json` to assert the test command. It checks manifest permissions, rules, static safety and synthetic controller behavior. It needs no installed package, Next.js build, application server, database or provider access. Package changes themselves remain full; `npm test` already runs this same monitor regression in the full app job.

New files even inside that tool directory remain full. Adding eligibility requires inspecting imports/assets/test dependencies, documenting the boundary, updating the exact inventory and positive/negative regressions, and independent Tier-2 review with full CI for the classifier/workflow change. Filename similarity is insufficient.

## Fail-closed behavior

Exact 40-character commit SHAs are validated as commits. Classification compares merge-base to head with rename detection disabled, so both old and new names count. Only A/M/D statuses and regular `100644` blobs at every present endpoint qualify. Deletions are checked at the merge-base. Invalid paths, executable files, symlinks, gitlinks, unsupported statuses, empty/malformed/unresolvable diffs and classifier uncertainty select full.

All runtime, schema, migrations, SQL/RPC/RLS, database/CRM tests, auth, finance, enrollment/conversion, provider delivery, scheduler, package/lock, root configuration, `.github/**`, `scripts/ci/**` and unknown paths remain full. No broad app lane is introduced. Safe docs can accompany policy/tooling; policy + tooling or any full path selects full.

Failed classification or empty/unknown output schedules app and PR database validation as a fallback, but cannot pass the aggregate. The classifier job runs classifier, gate, documentation-checker and policy/template consistency regressions for every lane. Those tests check policy anchors, template links and workflow wiring; they cannot prove natural-language policy correctness or replace independent review.

## Required gate matrix

`classify` must succeed in every accepted row. The always-running `required` aggregate accepts only these exact job results:

| Event / mode | Docs | Tooling | App | Local database |
| --- | --- | --- | --- | --- |
| PR / docs | success | skipped | skipped | skipped |
| PR / policy | success | skipped | skipped | skipped |
| PR / tooling | success | success | skipped | skipped |
| PR / full | success | skipped | success | success |
| main push / full | skipped | skipped | success | skipped |

Missing/unknown event or mode, failed classifier, failed/cancelled jobs, incorrectly skipped expected jobs and unexpected executed jobs fail the gate. Tool checks in full run through the existing `npm test` app step, avoiding duplication.

The docs job checks changed Markdown anywhere in every PR, including full/mixed PRs, plus diff whitespace. It uses Python/Git only; no app installation. This adds one small checkout/job but avoids duplicating documentation steps within expensive jobs and closes the prior mixed-PR coverage gap. Heuristics do not prove absence of secrets/PII; author/reviewer inspection remains mandatory.

Main pushes retain the existing full app checks and no database job. Optimizing them would need a separately established push-range/deployment protection contract (including missing before-SHA fallback); PR routing is the scope here. No push/deployment confidence is inferred from PR workload reduction.

## Provider and protection limits

The repository assumes `required` is the single branch-protection aggregate. Live branch-protection adoption is not established by source and is not changed here. A separately required legacy app/database check could prevent fast-path merges; reconcile configuration with owner authorization rather than silently bypassing it.

**Vercel build filtering: NEEDS VERIFICATION.** Repository inspection found no tracked `vercel.json`, `.vercelignore`, or ignored-build-step configuration establishing safe docs/policy deployment filtering. GitHub lane selection does not suppress Vercel builds. Build-rate-limit reports do not justify changing provider settings or assuming Preview/Production filtering. No Vercel/provider investigation or mutation is part of this outcome.

## IMPLEMENTATION CONTRACT

One coherent PR changes only classifier/workflow/regressions, this contract, lifecycle references/templates and implementation-state evidence. Acceptance: docs stay light; AGENTS-only and AGENTS + docs use policy; isolated inventory uses tooling; unknown/mixed/runtime/data paths stay full; the exact gate matrix is covered; review/release/security gates are unchanged. Test routing positives/negatives, actual Git diffs, mode/status failures, full-PR docs coverage, policy consistency and the dedicated monitor suite locally.

This PR changes `.github/**` and `scripts/ci/**` and therefore must itself select **full** and pass docs, app, local-database and required CI before independent review. Full application/database validation runs remotely; do not duplicate complete suites locally without a coverage reason. After focused author self-check, push/open PR, confirm scheduling and hand off exact head/base and run reference; stop polling. The coordinator verifies terminal exact-SHA CI and the synthetic merge/base evidence before launching the separate reviewer. Merge/release remains held for independent review and owner approval. No runtime/product/database/provider/Production mutation is authorized.

## Historical adoption

The original docs/full model and PR #90's revision-2 docs/tooling/full model are historical predecessors, preserved in Git history. PR #90 merged as `58139254e843fa731877cf5c4f541512d1d32224`; its tooling lane ran docs + the entire app job and skipped database. Outcome 2 replaces that routing contract when merged; earlier v1/v2 proposal wording is not current instruction. It does not rewrite their historical validation or approval evidence.
