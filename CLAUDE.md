# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server at http://localhost:3000
npm run build    # Production build
npm run lint     # ESLint via next lint
```

Apply database migrations:
```bash
supabase db push --linked
```

There is no test suite — verify changes manually in the browser.

## Architecture

**English Hills Admin Platform** — full school management system for a language center in Casablanca. Built with Next.js 14 App Router, Supabase (PostgreSQL + Auth + Storage), and Tailwind CSS + shadcn/ui.

### Route structure

- `src/app/(admin)/` — all protected admin pages (students, teachers, attendance, fees, etc.), wrapped in `AdminLayout` which applies `ProtectedRoute`
- `src/app/(auth)/login/` — Supabase email/magic-link login
- `src/app/inscription/` and `src/app/inscription-compte/` — public self-enrollment and account creation pages (no auth required)
- `src/app/api/` — Route Handlers: `admin/invite`, `admin/update-role`, `email/send`, `public/*`

### Auth and role model

Auth is enforced at **two layers** that must stay in sync:

1. **`middleware.js`** (server-side, runs before any page code) — refreshes the Supabase session cookie and redirects based on role.
2. **`src/components/ProtectedRoute.jsx`** (client-side) — used by `(admin)/layout.jsx` to re-apply the same rules client-side for JS-rendered navigation.

Five roles: `director`, `admin`, `teacher`, `parent`, `student`. Role is stored in `public.profiles.role` (shares the same `id` as `auth.users`). The `receptionist` role was merged into `admin` and no longer exists in the codebase (some older migrations still reference it — ignore those). Middleware and ProtectedRoute both define `TEACHER_ROUTES` — update both if adding a new teacher-accessible route.

`src/context/AuthContext.jsx` provides `{ user, role, isLoading, logout }` via `useAuth()`. It also sweeps `pending_roles` via the `apply_pending_role()` RPC on first sign-in (used by the invite flow).

### Data access

**`src/lib/entities.js`** — thin CRUD wrapper over Supabase. Each entity is accessed by PascalCase name (e.g. `Student`, `Receipt`) that maps to a table. Methods: `.list(orderBy?, limit?)`, `.filter(criteria, orderBy?, limit?)`, `.create(data)`, `.update(id, data)`, `.delete(id)`. On failure they show a sonner toast and re-throw.

```js
import { Student } from '@/lib/entities';
const rows = await Student.list('-created_date', 200);
```

**`src/lib/queries.js`** — TanStack Query hooks layered on top of `entities`. Prefer these over raw `useState`/`useEffect` fetches in page components:

```js
import { useEntityList, useEntityCreate } from '@/lib/queries';
const { data: students = [], isLoading } = useEntityList('Student', '-created_date', 200);
const create = useEntityCreate('Student');
create.mutate({ full_name: 'Amal' }); // auto-invalidates cache
```

**Supabase clients** — use `getBrowserClient()` in client components, `getServerClient()` in Server Components/Route Handlers. Never call `getBrowserClient()` server-side or vice versa. The service-role client (`supabase-admin.js`) is server-only and guarded by `import 'server-only'`.

### UI conventions

- shadcn/ui components in `@/components/ui/` — add new ones with `npx shadcn@latest add <name>`
- Icons: `lucide-react` only
- Status badge colors are centralized in `src/lib/statusColors.js` — do not add inline color maps in page files
- Toast notifications via `sonner` — import `{ toast }` from `'sonner'`
- `StudentForm` lives at `src/components/layout/StudentForm.jsx` — shared across create and edit flows

### Database

22 tables in Supabase PostgreSQL. RLS enabled on every table — see `supabase/migrations/006_rls_policies.sql`. Migrations are numbered sequentially in `supabase/migrations/`. When adding a migration, apply it with `supabase db push --linked`.

`public.profiles` is the join between `auth.users` and app data: `profiles.id == auth.users.id`. Role, linked student/teacher IDs, and phone are stored on `profiles`.

### Security constraints

- **Never** expose `SUPABASE_SERVICE_ROLE_KEY` to the client bundle. Import from `@/lib/supabase-admin` only in server-only files.
- **Never** call `getBrowserClient()` from Server Components or Route Handlers.
- CSP is configured in `next.config.mjs` — if adding a new third-party script or API, update `connect-src` / `script-src` there.
- CNDP Law 09-08 (Moroccan data protection) compliance is in progress — be careful with student PII in logs or new endpoints.

### Deployment

Vercel — `main` branch deploys automatically to `admin.english-hills.com`. Environment variables must be mirrored in Vercel project settings.
