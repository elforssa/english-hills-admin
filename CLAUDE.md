# Claude Code entry point

Read [AGENTS.md](AGENTS.md) first. It is the shared engineering policy for every coding agent, including Claude; the linked context files and ADRs replace the former duplicated architecture summary.

## Local commands

- `npm run dev` — local application with local Supabase and external email disabled.
- `npm test` — core regression scripts; [package.json](package.json) includes additional CRM, navigation and middleware suites.
- `npm run lint` and `npm run build` — app checks.
- `supabase migration up --local` — test reviewed migrations locally before any separately approved production deployment.

Choose verification appropriate to the change. No application tests are required for Markdown-only documentation changes.

## Implementation conventions

Use existing TanStack Query hooks and entity wrappers for ordinary data access; CRM and finance use authorized RPC workflows. Use the browser/server Supabase client in its matching runtime and keep the privileged client server-only. Reuse shadcn/ui, lucide-react, sonner and centralized status colors. Shared student form: [StudentForm.jsx](src/components/students/StudentForm.jsx).

## Historical guidance corrections

The previous summary said receptionist was removed, listed five roles, referenced root-level middleware and froze the table count after 063. Migration 077 restored receptionist; middleware is [src/middleware.js](src/middleware.js); migrations now extend through 095 on main. These are implementation facts, not evidence of production activation. See [CURRENT_STATE](docs/ai/CURRENT_STATE.md) and [SECURITY_RULES](docs/ai/SECURITY_RULES.md). Preserve historical migrations and use cumulative definitions rather than the original 006 policy snapshot.
