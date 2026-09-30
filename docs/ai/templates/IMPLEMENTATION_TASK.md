# Implementation task

Inputs: risk tier/rationale, approved scope, plan path/revision and recorded owner decisions when architecture is required, current main and dedicated implementation branch. Follow the [risk-tier policy](../../../AGENTS.md#risk-based-lifecycle); Tier 3 requires a separate task/agent from architecture.

Read [AGENTS](../../../AGENTS.md), the approved plan including its IMPLEMENTATION CONTRACT when applicable, and referenced ADR/product/security/workflow docs directly. Verify current main and reconcile intervening code/migrations before implementation. Missing required approval or a widened product/security boundary requires an owner decision; ordinary implementation/test failures within the contract should be fixed autonomously.

Implement only approved scope. Use local Supabase, synthetic fixtures and external email disabled. Use forward migrations only: never edit deployed migrations (001–097 at this template's creation; confirm the latest deployment inventory). Do not use Production secrets/data. Add appropriate positive, negative, regression, concurrency and browser tests for the changed behavior. Preserve finance/conversion invariants and other-role denials.

Run required local checks and CI; inspect actual behavior and authorization, not merely green output. Update implementation-status docs accurately with evidence, keeping implemented, merged, deployed and Production-verified separate. Update ADRs/product/security/workflows only when their durable facts change.

Follow the [internal QA policy](../../../AGENTS.md#internal-implementation-qa): autonomous subagents/self-review, two review/fix cycles by default (three maximum), then surface blockers. Internal QA does not replace required independent review. Reuse evidence rather than duplicate release checks unless needed to prove correctness.

Stage explicit paths only; never `git add .` or `git add -A`. Inspect the staged diff, commit/push and open a PR. Do not merge or deploy Production. For Tier 2 and Tier 3, a fresh independent reviewer examines the actual head. Fix findings, push a new SHA and obtain fresh re-review and checks for that SHA; do not reuse approval for old code. Tier 1 needs no mandatory independent reviewer unless scope grows; reassess its tier before continuing.

Return PR number/link, head SHA, risk tier/rationale, approved plan revision (if applicable), migration filenames, checks/results, documentation updates and blockers. Identify any unresolved owner decision. Implementation completion is not release authorization.
