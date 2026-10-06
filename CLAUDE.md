# Claude Code entry point

This file is a stable router. It intentionally holds no migration ceilings, deployment SHAs or feature status; those change often and live only in the documents below. The repository, not any previous chat, is the shared project context for Claude Code, Codex and every other agent.

## Read in this order

1. [AGENTS.md](AGENTS.md) — execution, branching, risk tiers, CI, independent review and release rules.
2. [CURRENT_STATE](docs/ai/CURRENT_STATE.md) — current implementation, deployment and activation evidence.
3. [OWNER_DECISIONS](docs/ai/OWNER_DECISIONS.md) — current approved, planned and parked owner decisions.
4. [ARCHITECTURE](docs/ai/ARCHITECTURE.md), [PRODUCT_RULES](docs/ai/PRODUCT_RULES.md), [SECURITY_RULES](docs/ai/SECURITY_RULES.md) and [WORKFLOWS](docs/ai/WORKFLOWS.md).
5. The active plan for the task, listed in the [active plans index](docs/architecture/plans/README.md).

Flag contradictions between these documents and repository reality instead of silently choosing one. Determine the latest migration and the deployed source from CURRENT_STATE, `supabase/migrations` and a freshly fetched `origin/main`, never from this file.

## Local commands

- `npm run dev` — local application with local Supabase and external email disabled.
- `npm test` — core regression scripts; [package.json](package.json) includes additional CRM, navigation and middleware suites.
- `npm run lint` and `npm run build` — app checks.
- `supabase migration up --local` — test reviewed migrations locally before any separately approved production deployment.

Choose verification appropriate to the change. No application tests are required for Markdown-only documentation changes.

## Implementation conventions

Use existing TanStack Query hooks and entity wrappers for ordinary data access; CRM and finance use authorized RPC workflows. Use the browser/server Supabase client in its matching runtime and keep the privileged client server-only. Reuse shadcn/ui, lucide-react, sonner and centralized status colors. Shared student form: [StudentForm.jsx](src/components/students/StudentForm.jsx). Middleware is [src/middleware.js](src/middleware.js); receptionist is a current role (restored by migration 077). Preserve historical migrations and build on the latest cumulative definition of a function or policy, never an earlier snapshot such as the original 006 policies.
