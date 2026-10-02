# Independent review task

Required for Tier 2 and Tier 3 under the [risk-tier policy](../../../AGENTS.md#risk-based-lifecycle); optional for Tier 1. Internal implementation QA does not satisfy this independent review.

Inputs: PR URL, exact head SHA, risk tier/rationale, approved plan/revision and owner decisions when applicable. Use a reviewer task/session launched separately **after the author handoff**. It must not be an internal reviewer subagent spawned by the architecture/implementation author task. Fresh re-review requires a current assessment of the new exact SHA, not a new reviewer instance per fix; the same independent reviewer may continue. The architecture/implementation author task must not issue its own independent-review verdict or spawn this reviewer internally; its one focused self-check is not independent review. Read [AGENTS](../../../AGENTS.md), the approved repository plan/revision and recorded owner decisions (if applicable), and relevant durable docs directly; no routine owner relay through another GPT conversation is needed. Verify that the supplied SHA is the PR's actual current head and verify the base; inspect that exact diff and relevant surrounding code/cumulative SQL. Challenge assumptions and do not merely trust test output. Perform the review directly in this reviewer task; do not spawn a second reviewer/re-review subagent. Do not implement fixes, merge or deploy.

Confirm the tier against the actual scope; escalate if needed. Markdown-only policy/security changes are not automatically Tier 1. Apply the following checks where relevant to the change and its dependencies, reusing existing evidence where sufficient. Check authorization across UI/API/RPC/RLS; SECURITY DEFINER search paths, actor checks and function ACLs; sensitive-field projections; finance and enrollment/conversion invariants; forward migrations and unchanged deployed migrations; idempotency, concurrency, leases, retries and external delivery; PII/secret boundaries and other-role regressions. Assess positive/negative tests, clean replay and upgrade evidence, browser behavior, CI and architecture compliance. Inspect and reuse sufficient test/CI evidence tied to the exact current head SHA; do not rerun the entire suite by default. Run additional checks for missing or doubtful coverage or affected regressions, and do not waive required checks. Describe evidence limitations. Report actionable findings with severity, file/line, consequence and reproduction/expected correction. Do not manufacture findings.

Use these sections:

## Blocking findings

## Important findings

## Test gaps

## Architecture compliance

State reviewed head and base SHA, tested merge SHA when CI uses a synthetic merge, risk tier, plan revision (if applicable), any scope divergence and check evidence/run links. Verify the evidence maps to the current head/base; CI may satisfy overlapping suite checks without a duplicate local full run. Require extra validation only for explicit contract requirements, missing/doubtful coverage or environment-specific behavior.

## Verdict

The verdict must be exactly one of:

- READY FOR FINAL REVIEW
- CHANGES REQUIRED

A clean READY FOR FINAL REVIEW verdict goes to the human owner's final decision, without a routine third AI review or handoff rewrite. Confirm required checks pass for the exact current head SHA and no review blockers remain before returning that verdict. READY FOR FINAL REVIEW does not authorize merge or release; existing human approval and separate release/operator gates remain in force. After implementer fixes, focused local regression validation and required CI must pass for the new revision (plus any additional validation required under AGENTS), and fresh independent re-review must inspect it (including prior findings and affected regressions); stale-SHA approval is insufficient. Do not add review cycles solely because a prior review occurred. Verify affected behavior and safeguards, reuse unaffected evidence where sufficient, and broaden review only when fixes change architecture, security boundaries, database models or materially change risk. Follow the [findings-driven review policy](../../../AGENTS.md#findings-driven-review-and-validation).
