# Independent review task

Inputs: PR URL, exact head SHA, approved plan/revision and owner decisions. Use a fresh task/agent independent of the implementer. Read [AGENTS](../../../AGENTS.md), the plan and relevant durable docs. Verify the head and base; inspect the actual diff and relevant surrounding code/cumulative SQL. Do not merely trust test output. Do not implement fixes, merge or deploy.

Check authorization across UI/API/RPC/RLS; SECURITY DEFINER search paths, actor checks and function ACLs; sensitive-field projections; finance and enrollment/conversion invariants; forward migrations and unchanged deployed migrations; idempotency, concurrency, leases, retries and external delivery; PII/secret boundaries and other-role regressions. Assess positive/negative tests, clean replay and upgrade evidence, browser behavior, CI and architecture compliance. Describe evidence limitations. Report actionable findings with severity, file/line, consequence and reproduction/expected correction. Do not manufacture findings.

Use these sections:

## Blocking findings

## Important findings

## Test gaps

## Architecture compliance

State reviewed SHA, plan revision, any scope divergence and check evidence.

## Verdict

The verdict must be exactly one of:

- READY FOR FINAL REVIEW
- CHANGES REQUIRED

READY FOR FINAL REVIEW does not authorize release. After implementer fixes, a fresh independent review must inspect the new SHA (including prior findings and regressions); stale-SHA approval is insufficient.
