# English Hills Admin Platform

## Overview
Full management platform for English Hills Language Center (Almaz, Casablanca, Morocco). Built with Next.js 14, Supabase, and Tailwind CSS.

## Tech Stack
- Next.js 14 (App Router)
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
20. Multi-Role Access (6 roles: director, admin, teacher, parent, student, receptionist)
21. Security (RLS-backed)
22. CNDP Law 09-08 compliance

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
- 22 tables in Supabase PostgreSQL
- RLS enabled on every table — see [supabase/migrations/006_rls_policies.sql](supabase/migrations/006_rls_policies.sql)
- Migrations live in [supabase/migrations/](supabase/migrations/)
- Apply pending migrations: `supabase db push --linked`

## Getting Started
1. Clone the repo
2. `npm install`
3. Copy `.env.example` → `.env.local` and fill in the values
4. Link the Supabase project: `supabase link --project-ref <ref>`
5. Apply migrations: `supabase db push --linked`
6. Start dev server: `npm run dev` → [http://localhost:3000](http://localhost:3000)

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
- RLS enforced at the database level for all 22 tables
- 6 roles: director, admin, teacher, parent, student, receptionist
- CNDP Law 09-08 compliance in progress
- All data hosted on AWS EU (Frankfurt) via Supabase

## License
Private — English Hills Language Center. All rights reserved.
