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

For Tier 3, use separate architecture, implementation, fresh independent review and release tasks/agent instances: architecture → human owner approval → implementation → focused tests → focused internal QA → fixes and targeted re-check if needed → full required CI → fresh independent reviewer → implementer fixes → focused tests and targeted internal re-check → full required CI → fresh re-review of the new SHA → human release approval → release/operator → Production verification → documentation closeout. Tier 2 also requires a fresh independent reviewer of the exact PR SHA and fresh independent re-review after fixes. Production mutation/activation remains Tier 3 even when the originating code or docs change was lower risk; existing explicit deployment approval requirements still apply.

## Internal implementation QA

Implementation agents may use internal subagents and self-review autonomously. Before PR handoff, perform one focused internal QA/review pass by default, concentrating on the highest-risk changed areas as applicable: authorization/security, invariants, migrations, concurrency, external-provider behavior, retries/leases and regression risk. If it finds material defects, fix them and perform one targeted re-check of the affected areas; do not automatically repeat a full-project review. A second full internal review is justified only when fixes materially change architecture, security boundaries or a large portion of the implementation. Three internal passes are an exceptional absolute maximum, not the normal workflow; then surface unresolved blockers, evidence and the needed decision instead of restarting or looping indefinitely.

During development and after each fix, prefer focused relevant tests. Do not rerun the complete expensive suite after every small internal fix; run the complete required suite once before PR handoff. Internal QA is implementation QA, not formal independent review for Tier 2 or Tier 3, and never replaces their fresh independent reviewer of the exact PR SHA. If that reviewer finds defects, the original implementer fixes them on the same branch/PR, runs focused tests and one targeted internal re-check of the changed areas, then runs required full CI once. A fresh independent re-review must inspect the new SHA; approval of an earlier SHA is stale. Avoid duplicating release/operator checks during implementation unless needed to prove correctness; hand off existing evidence and leave deployment-state checks to release.

Use the [architecture](docs/ai/templates/ARCHITECTURE_TASK.md), [implementation](docs/ai/templates/IMPLEMENTATION_TASK.md), [review](docs/ai/templates/REVIEW_TASK.md) and [rollout](docs/ai/templates/PRODUCTION_ROLLOUT.md) templates. Read the approved plan directly from the repository; the owner should not need to relay architecture between conversations. Find features in the [feature index](docs/architecture/FEATURE_INDEX.md), active contracts in [plans](docs/architecture/plans), and finished plans in [completed](docs/architecture/plans/completed). Record approval scope and evidence in the plan. Planned, implemented, merged, deployed and Production-verified are distinct states. Closeout updates evidence and links; it never retroactively rewrites historical findings.
