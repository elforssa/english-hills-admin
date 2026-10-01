# Engineering and AI context

English Hills is a production school-management application. Start here; do not depend on chat history.

## Read before substantial work

Read [current state](docs/ai/CURRENT_STATE.md), [architecture](docs/ai/ARCHITECTURE.md), [product rules](docs/ai/PRODUCT_RULES.md), and [security rules](docs/ai/SECURITY_RULES.md). Read the relevant [workflows](docs/ai/WORKFLOWS.md) and [ADRs](docs/architecture/decisions/README.md) before changing a domain. Approved/planned decisions are not implemented behavior.

Code, cumulative migrations and runtime evidence establish implementation. Historical runbooks and comments may be stale. Flag conflicts between an approved ADR and repository reality; do not silently redesign either. CURRENT_STATE.md describes evidence, never aspirations. An initial takeover audit is read-only; this context foundation was explicitly authorized after inspection.

## Safety and execution

- Never push directly to `main`. Use an isolated named feature branch (any agent/model, never `main` or `master`) and a PR with review appropriate to the risk tier below; main deploys through Vercel.
- Production Supabase, Vercel configuration and production migrations require explicit deployment approval. Never automatically run `supabase db push --linked` or destructive SQL against a linked project.
- Develop and test with local Supabase at `http://127.0.0.1:54321`, synthetic data and external email disabled. Never use a production service-role key locally or copy real student, parent, teacher, payment or Auth data without explicit authorization.
- Deployed migrations are immutable. Make forward migrations and test locally first; check deployment evidence before deciding a migration is editable.
- Never commit secrets, tokens, credentials, customer exports or sensitive logs. Keep service-role clients server-only.
- Preserve status/task/activity separation and trusted conversion/financial boundaries in the product rules.
- Do not weaken authorization, RLS, integrity checks or tests to make a change pass. Diagnose and fix ordinary local failures autonomously.
- Never use `git add .` or `git add -A`. Stage explicit paths, inspect the staged diff and preserve unrelated user work.

## Verification and maintenance

[package.json](package.json) defines app, CRM, middleware and navigation tests. Use appropriate local tests plus browser verification for behavior changes. Markdown-only changes need link/source/secret checks and `git diff --check`, not application tests.

Every substantial PR asks:

1. Did current/deployed architecture change? Update CURRENT_STATE.md / ARCHITECTURE.md with evidence and distinguish deployment from merge.
2. Did a durable product invariant change? Update PRODUCT_RULES.md.
3. Did a significant architectural decision change? Add/update its ADR, including status and implementation evidence.
4. Did permissions/security change? Update SECURITY_RULES.md.
5. Did an operational flow change? Update WORKFLOWS.md.

Follow links rather than duplicate rules. Do not update docs mechanically when nothing changed.

## Risk-based lifecycle

Record the risk tier and rationale in the task/PR. Use the highest applicable tier and reassess when scope grows; a small diff does not lower sensitive work's tier.

| Tier | Scope | Required flow |
| --- | --- | --- |
| **1 — low risk** | Copy/text/UI polish, docs, small non-sensitive frontend changes | Implementer + normal scope-appropriate tests/CI. No mandatory independent reviewer unless scope grows into a higher tier. |
| **2 — normal substantial** | Normal feature work, shared UI/business logic, non-sensitive schema additions | Architecture when needed; implementer + CI + fresh independent reviewer. |
| **3 — high risk** | Auth/roles/RLS, finance, migrations affecting existing Production data/invariants, external APIs/provider delivery, schedulers/cron, secrets/credentials, conversion/enrollment integrity, Production activation | Full architecture → implementation → CI → fresh independent reviewer → release/operator flow. |

For Tier 3, use separate architecture, implementation, fresh independent review and release tasks/agent instances. Keep architecture → human owner approval before implementation, and human release approval → release/operator → Production verification → documentation closeout after independent review. Tier 2 and Tier 3 require a fresh independent review of the exact PR head SHA, including fresh re-review after findings are fixed. Production mutation/activation remains Tier 3 even when the originating code or docs change was lower risk; existing explicit deployment approval requirements still apply.

### Small changes (Tier 1)

1. Implement the approved scope.
2. Run relevant checks.
3. Inspect the final diff; this is the focused internal self-check for a small change.
4. Finish with the implementation handoff. Independent review is optional unless scope grows into a higher tier.

### Normal features (Tier 2)

1. Obtain architecture approval when required, then implement.
2. Run relevant tests and the required complete validation suite as described below.
3. Perform one focused internal self-check and inspect the final diff.
4. Open the PR and report **READY FOR INDEPENDENT REVIEW** when the handoff conditions are met.
5. Hand off to a separate independent reviewer as required by the risk tier.

### High-risk changes (Tier 3)

1. Complete the required architecture task and human owner approval.
2. Implement the approved scope.
3. Run relevant tests and required complete validation.
4. Perform one focused internal self-check and inspect the final diff.
5. Open the PR.
6. Report **READY FOR INDEPENDENT REVIEW**.
7. Have a fresh independent reviewer task review the exact PR SHA and return its verdict.
8. If findings require fixes, the implementation agent fixes them, verifies affected behavior and safeguards with focused validation, runs required full validation once, and requests fresh independent review of the new SHA.
9. After review, follow the existing human approval, separate release/operator and Production verification flow.

## Internal implementation QA

The implementation agent implements approved scope, runs relevant tests, inspects its own final diff and performs one focused internal self-check before handoff. Its purpose is to catch obvious mistakes, verify changed risk areas, and confirm that tests and documentation accurately describe the change. Focus on security, authorization, migrations, data integrity, concurrency, external providers, retry/error handling and regression risk, as applicable.

Internal self-check and independent review are different activities and must never be treated as interchangeable. A detailed self-review, including work by internal implementation subagents, is still internal QA. It does not approve the PR, count as independent review, authorize merge or replace a required reviewer. Do not describe internal checks as “approved,” and do not issue an independent-review verdict from the implementation task.

Avoid duplicating release/operator checks during implementation unless needed to prove correctness; hand off existing evidence and leave deployment-state checks to the separate release task.

## Independent review

Independent review must be performed by a separate reviewer task/session that did not implement the change. It is mandatory for Tier 2 and Tier 3 and optional for Tier 1. The reviewer verifies the actual PR head SHA, checks architecture compliance, security and invariants, assesses tests and their evidence, and challenges implementation assumptions. It returns exactly one formal verdict:

- **READY FOR FINAL REVIEW**
- **CHANGES REQUIRED**

The implementation agent must not provide its own independent-review verdict. READY FOR FINAL REVIEW does not authorize merge, deployment or Production mutation; existing human approval and release/operator gates remain in force.

## Findings-driven review and validation

Do not require another internal or independent review cycle merely because a previous review occurred. Repeat review only when findings require fixes, fixes change architecture, security boundaries or database models, or fixes otherwise materially change risk. After fixes, verify affected behavior and safeguards; broaden the review only when the changes justify it. Surface unresolved blockers and needed decisions instead of looping without new evidence.

- During development, run focused tests relevant to changed areas.
- Before independent review, run the required complete validation suite once for the handoff SHA. Markdown-only changes use the documentation checks above; existing required CI still applies.
- After reviewer findings are fixed, run focused regression tests first, perform a targeted internal re-check of affected behavior and safeguards, then run the required complete suite once for the new SHA and request fresh independent review.
- For Tier 2 and Tier 3, the fresh reviewer must inspect the new SHA, prior findings and affected regressions; approval of an earlier SHA is stale. Reuse unaffected evidence where sufficient, but do not bypass required checks or exact-SHA review.

Avoid repeated expensive full reviews or suite runs without new findings or risk. Failures, later changes or insufficient evidence still require appropriate validation; “once” does not permit handing off failed or stale checks.

## Implementation handoff

Return branch, head SHA, PR number/link, risk tier/rationale, tests/checks completed with results, internal QA completed, documentation changes and remaining blockers. Include the approved plan revision and migration filenames when applicable, and identify any unresolved owner decision. Use exactly one implementation status:

- **NOT READY FOR INDEPENDENT REVIEW** — implementation, required checks, internal QA or the open PR is incomplete, or blockers remain.
- **READY FOR INDEPENDENT REVIEW** — implementation is complete for the current scope, required tests/checks and internal QA are complete, the PR is open and no handoff blockers remain. The next step is a separate reviewer task when review is required or requested.

For Tier 1, readiness does not create a mandatory independent-review requirement. Implementation completion and readiness are not PR approval, merge authorization or release authorization.

Use the [architecture](docs/ai/templates/ARCHITECTURE_TASK.md), [implementation](docs/ai/templates/IMPLEMENTATION_TASK.md), [review](docs/ai/templates/REVIEW_TASK.md) and [rollout](docs/ai/templates/PRODUCTION_ROLLOUT.md) templates. Read the approved plan directly from the repository; the owner should not need to relay architecture between conversations. Find features in the [feature index](docs/architecture/FEATURE_INDEX.md), active contracts in [plans](docs/architecture/plans), and finished plans in [completed](docs/architecture/plans/completed). Record approval scope and evidence in the plan. Planned, implemented, merged, deployed and Production-verified are distinct states. Closeout updates evidence and links; it never retroactively rewrites historical findings.
