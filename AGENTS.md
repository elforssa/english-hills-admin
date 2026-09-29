# Engineering and AI context

English Hills is a production school-management application. Start here; do not depend on chat history.

## Read before substantial work

Read [current state](docs/ai/CURRENT_STATE.md), [architecture](docs/ai/ARCHITECTURE.md), [product rules](docs/ai/PRODUCT_RULES.md), and [security rules](docs/ai/SECURITY_RULES.md). Read the relevant [workflows](docs/ai/WORKFLOWS.md) and [ADRs](docs/architecture/decisions/README.md) before changing a domain. Approved/planned decisions are not implemented behavior.

Code, cumulative migrations and runtime evidence establish implementation. Historical runbooks and comments may be stale. Flag conflicts between an approved ADR and repository reality; do not silently redesign either. CURRENT_STATE.md describes evidence, never aspirations. An initial takeover audit is read-only; this context foundation was explicitly authorized after inspection.

## Safety and execution

- Never push directly to `main`. Use an isolated named feature branch (any agent/model, never `main` or `master`) and a reviewed PR; main deploys through Vercel.
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
