# English Hills Admin Platform

## Overview
Full management platform for English Hills Language Center (Almaz, Casablanca, Morocco). Built with Next.js 15, Supabase, and Tailwind CSS.

## Tech Stack
- Next.js 15 (App Router)
- Supabase (PostgreSQL + Auth + Storage + Edge Functions)
- Tailwind CSS + shadcn/ui
- TanStack Query 5
- Resend (email — configure before going live)
- Deployed on Vercel at `admin.english-hills.com`

## Modules
1. Student Management
2. YL (Young Learners) Dismissal
3. Teachers Database
4. Timetable
5. Attendance
6. Fees
7. Receipt Generator
8. Pre-Enrollment
9. Placement Tests
10. Digital Portfolios
11. Assessments
12. Learning Style
13. Notifications
14. Portals (Parent / Student / Teacher)
15. Communication
16. Certificates
17. HR / Payroll
18. Leave Management
19. Finance Dashboard
20. Multi-Role Access (director, admin, teacher, parent, student)
21. Security (RLS-backed)
22. Privacy controls (legal and operational review remains open)

## Environment Variables
| Name | Description |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL. Public — embedded in the browser bundle. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key. Public; pair with RLS for security. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only admin key. **Never commit.** Used by `scripts/migrateData.js` and any future admin API routes. |
| `RESEND_API_KEY` | Resend API key (`re_*`). Configure before go-live. |
| `RESEND_FROM_ADDRESS` | Verified sender, e.g. `English Hills <noreply@english-hills.com>`. |

Copy `.env.example` to `.env.local` and fill in the values. `.env.local` is gitignored.

## Database
- 34 public tables in the local schema after migration 071 (recheck after future migrations)
- RLS enabled on every table — see [supabase/migrations/006_rls_policies.sql](supabase/migrations/006_rls_policies.sql)
- Migrations live in [supabase/migrations/](supabase/migrations/)
- Apply pending migrations to local Supabase first: `supabase migration up --local`

## Getting Started
1. Clone the repo
2. `npm install`
3. Copy `.env.example` → `.env.local` and fill in the values
4. Start local Supabase: `supabase start`
5. Apply local migrations: `supabase migration up --local`
6. Start dev server with local Supabase values and `DISABLE_EXTERNAL_EMAIL=true`: `npm run dev` → [http://localhost:3000](http://localhost:3000)

## Verification

Run `npm test`, `npm run lint`, and `npm run build` on a non-main branch. Run rollback-only database checks against the local container with `docker exec -i supabase_db_hills-admin-next psql -U postgres -d postgres -q -v ON_ERROR_STOP=1 < scripts/test-audit-remediation.sql`. Never point this command at the linked project. The tests cover telemetry, CSV, pagination, attendance state, receipt regressions, and synthetic local role checks; browser review remains separate.

### Pull-request CI

Open a pull request from a `codex/` feature branch to run `.github/workflows/verify.yml`. Its **app** job runs `npm ci`, `npm test` (including receipt regressions), lint, build, `npm audit --audit-level=moderate`, installs Playwright Chromium, and runs `npm run test:middleware`. The middleware harness rebuilds Next against an in-memory mock Auth URL using dummy keys, then checks HTTP routes and real React child protection in Chromium. Its **local-database** job starts local Supabase, generates `.env.local` only from the local CLI status, runs the rollback-only SQL fixture, then starts the app with external email disabled and runs Batch 3A, Batch 4A, and the 1,205-row report/export fixture. The fixture scripts remove their synthetic accounts and rows. Neither job uses a linked project or production secrets. Review both job logs; a local pass does not mean GitHub CI has run.

To repeat the database checks locally, confirm `.env.local` points to `http://127.0.0.1:54321`, start local Supabase, and run:

```sh
supabase migration up --local
docker exec -i supabase_db_hills-admin-next psql -U postgres -d postgres -q -v ON_ERROR_STOP=1 < scripts/test-audit-remediation.sql
DISABLE_EXTERNAL_EMAIL=true npm run dev -- --hostname 127.0.0.1 --port 3101
# In a second terminal, while the local app is running:
DISABLE_EXTERNAL_EMAIL=true node scripts/test-batch3a-security.mjs --app
DISABLE_EXTERNAL_EMAIL=true node scripts/test-batch4a-security.mjs
node scripts/test-large-data-local.mjs
```

Run the database suites sequentially. To repeat the independent mock middleware/React test without local Supabase, run `npx playwright install chromium` and `npm run test:middleware`. The script builds against `http://127.0.0.1:55431` itself; its mock server and Next server bind only to loopback. It replaces the local `.next` build artifact, so rebuild with your normal local environment before resuming manual browser review.

## Deployment
- Vercel project pointed at this repo (main branch deploys to production)
- Custom domain `admin.english-hills.com` wired via CNAME in Vercel DNS
- Environment variables mirrored from `.env.local` in Vercel project settings

## Data Migration
One-time legacy import from the previous platform. Place JSON exports (one file per entity) in `base44-export/`, then:

```sh
node --env-file=.env.local scripts/migrateData.js
```

The script reads each entity in foreign-key-respecting order, maps records to the Supabase schema, and upserts on `id` so the script is safe to re-run.

## Security
- RLS and database triggers protect application records; verify each new table and policy when changing the schema.
- Five active roles: director, admin, teacher, parent, student; pending accounts have no operational role.
- Privacy, retention, processing locations, and Law 09-08 obligations require review by the center and counsel. The app does not claim completed legal compliance.

## License
Private — English Hills Language Center. All rights reserved.
