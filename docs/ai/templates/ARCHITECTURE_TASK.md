# Architecture task

Use this task when architecture is needed for Tier 2 and always for Tier 3 under the [risk-tier policy](../../../AGENTS.md#risk-based-lifecycle).

Task inputs: feature/problem, risk tier/rationale, repository, current-main baseline, constraints, owner and output plan path. Architecture only; no application implementation, migrations applied, merge, deployment or Production mutation.

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
7. Check relative links, source accuracy, secret/PII absence and `git diff --check`. Stage explicit paths, inspect staged diff, commit and push architecture documentation. Return branch, commit, any docs-only PR, clickable GitHub browser plan URL, owner summary and pending decisions. Do not open an implementation PR or treat plan approval as release approval.
