# Current architecture

Read [CURRENT_STATE](CURRENT_STATE.md) for the main baseline versus documented deployment. Decisions and rationale are indexed in [ADRs](../architecture/decisions/README.md).

## Application and database

Next.js 15 App Router serves the admin workspace, role portals, public enrollment and API handlers. [Admin layout](../../src/app/(admin)/layout.jsx) wraps pages in ProtectedRoute; [middleware](../../src/middleware.js) refreshes sessions and gates page routes. Handlers authenticate independently. Stored `profiles.role` joins Auth through `profiles.id = auth.users.id`; authorization continues into RPCs/RLS.

[entities.js](../../src/lib/entities.js) provides ordinary entity CRUD and [queries.js](../../src/lib/queries.js) TanStack Query caching. CRM uses [dedicated RPC hooks](../../src/lib/crm/queries.js) and guarded SQL commands/read models. Browser/session server clients live in [supabase.js](../../src/lib/supabase.js); privileged [supabase-admin.js](../../src/lib/supabase-admin.js) is server-only. PostgreSQL transactions, constraints, triggers and cumulative migrations own cross-entity integrity. Storage uses an asset registry and authorized signing/finalization endpoints (045–046), not public dossier URLs.

## Acquisition and scheduling

```mermaid
flowchart TD
  W[External website inquiry] --> P[Public CRM intake API]
  P --> Q[Durable crm_ingestion_jobs]
  M[Meta] --> H[Signed webhook when enabled]
  M --> R[Bounded reconciliation discovery]
  H --> Q
  R --> Q
  Q --> N[Shared worker: retrieve Meta / normalize website and Meta]
  N --> S[Immutable submission + mapping version]
  S --> C[CRM contact / lead / tasks or intake review]
  PG[Supabase pg_cron + pg_net primary] --> E[Protected /api/cron/crm-intake]
  GH[GitHub Actions backup] --> E
  E --> R
  E --> N
```

The primary trigger exists in migration 095; its production activation is not established by merge. Both triggers invoke the same bounded endpoint, use the dedicated scheduler bearer, and rely on database leases plus unique event identities. Reconciliation discovers IDs only; the shared worker retrieves and normalizes them. Independent webhook/reconciliation switches allow polling while webhook access is unavailable. [ADR-002](../architecture/decisions/ADR-002-meta-intake-and-reconciliation.md) and [scheduler runbook](../crm-intake-scheduler.md) contain limits and activation details.

Website acceptance means durable receipt, not immediate lead resolution. Exact-origin checks, validation, rate limiting and optional CAPTCHA precede queueing. Immutable mapping versions normalize core fields and flexible answers; uncertain matching becomes review. [Website contract](../crm-website-inquiries.md).

## CRM and school operations

```mermaid
flowchart LR
  C[Contact] --> L[Lead / commercial opportunity]
  L --> T[Placement test + milestone history]
  L --> E[Explicit linked enrollment]
  E --> S[Student dossier]
  E --> G[Compatible group / academic session]
  E --> V[Confirmed or Validated: trusted conversion]
  E --> A[Charge agreement]
  A --> P[Payment / receipt]
  P --> F[Financial events + signed CRM revenue ledger]
  L --> I[Immutable first-touch attribution]
  I --> F
```

Placement booking/results drive tasks and activities, not automatic enrollment/payment. Enrollment commands review existing learner candidates; enrollment/student/group triggers preserve membership consistency (070–074, 083–084). Groups, levels, timetables, attendance and Premium sessions share academic relationships; [071](../../supabase/migrations/071_teacher_academic_relationships.sql) governs teacher academic access.

Payments use the existing charge/receipt engine and explicit CRM enrollment identity. Revenue attribution follows linked receipts and immutable first touch (085); director analytics combines operational cohorts and available spend snapshots (089–090). Lifecycle feedback and Insights remain mock-only transport implementations.

Teacher operational identity is projected through [teacher-directory.js](../../src/lib/teacher-directory.js). Full teacher rows contain HR/compensation and are isolated from non-HR consumers (043); payroll writes use an authenticated admin/director API and database guard (065). Expanded receptionist teacher access is planned, not implemented. [Security rules](SECURITY_RULES.md).
