# Architecture task

Use this task when architecture is needed for Tier 2 and always for Tier 3 under the [risk-tier policy](../../../AGENTS.md#risk-based-lifecycle).

Task inputs: coherent outcome and explicit acceptance criteria, feature/problem, risk tier/rationale, repository, current-main baseline, constraints, owner and output plan path. Architecture only; no application implementation, migrations applied, merge, deployment or Production mutation.

1. Read [AGENTS](../../../AGENTS.md), [feature index](../../architecture/FEATURE_INDEX.md), relevant durable AI docs, ADRs and plans. Fetch current main, preserve unrelated work and create a dedicated architecture branch/worktree.
2. Inspect actual code and cumulative database architecture, latest function definitions, ACLs/RLS and tests. Separate existing capability from missing capability. Record baseline SHA and evidence limits; owner-supplied deployment evidence is not your independent verification.
3. Produce a human-readable plan beginning with exactly this owner-facing structure:

```markdown
# Owner summary

## What will change
## What staff/users will be able to do
## What remains restricted
## UI impact
## Database impact
## Important security decisions
## Risks / owner review points
```

4. Follow with verified current state, scope/non-goals, design, security boundaries, migration/test/rollout/recovery strategy and expected modules. Collect unresolved product decisions under `## Owner decisions required`; give question, A/B options, consequences, recommendation and blocking status. Never silently broaden product/security scope.
5. Add/update an ADR for a durable architectural decision, not merely because a plan exists. Label proposals as proposed until owner acceptance. Record owner approval date, exact options and approved plan revision before implementation.
6. End every substantial plan with `## IMPLEMENTATION CONTRACT`: precise scope, prerequisites, object/module manifest, invariants, acceptance/tests, stop conditions, docs/status reporting. A fresh implementer must be able to use the repository without a rewritten prompt.
7. Check relative links, source accuracy, secret/PII absence and `git diff --check`. Perform one focused author self-check of the final architecture diff. **Do not spawn an internal reviewer, independent-review or re-review subagent, and do not issue a formal review verdict.**
8. After focused validation and the author self-check, stage explicit paths, inspect staged diff, commit/push and open/update the architecture PR. Confirm remote CI was successfully scheduled for the exact revision, then **STOP polling** under the [remote-CI handoff policy](../../../AGENTS.md#ci-selection-and-remote-ci-handoff). If required CI is pending, return **AUTHOR WORK COMPLETE — REMOTE CI PENDING** with branch, exact head/base SHA, CI run reference/status, clickable PR/plan URL, owner summary and pending decisions. Report missing/failed scheduling as a blocker without a polling loop. The coordinator verifies terminal exact-revision CI, including the tested merge SHA where applicable, and requests a separate independent reviewer task/session only after required CI succeeds. **READY FOR INDEPENDENT REVIEW** requires that successful CI and all handoff conditions. Stop the architecture task; do not perform independent review, open an implementation PR or treat plan approval as release approval.

Follow [outcome-based batching](../../../AGENTS.md#outcome-based-batching): keep authorized evidence gathering and corrections serving the same outcome in the same work item/branch/PR. Reopen architecture / obtain an owner decision only when evidence requires a genuine change to approved design, security boundary, product invariant, scope or risk; missing facts alone do not justify another architecture batch. Authorization and stop conditions remain mandatory.
