# Current state

Evidence reviewed 2026-09-29 against main commit `1a370069d9ddd92d531c2a84dc84d737d44391b0` (PR #29). This is the application/schema baseline for this documentation change; no production queries or mutations were performed.

## Verified Production activation

Evidence independently verified on 2026-09-29 after PR #29 and supplied by the repository owner during PR #30 review; this documentation update did not query or mutate Production.

- Production migration ledger includes **095 `crm_intake_pg_cron_scheduler`**. Main also contains [migration 095](../../supabase/migrations/095_crm_intake_pg_cron_scheduler.sql); implementation and activation are separately established.
- Supabase cron job `crm-intake-primary` has schedule `*/5 * * * *` and `active = true`. Automatic pg_cron runs succeeded; Production `/api/cron/crm-intake` calls returned HTTP 200.
- Production Vercel deployment `dpl_7uPQH4WD9MU8PL2txH8SaFBtAudE` is **READY**, sourced from `main` commit `1a370069d9ddd92d531c2a84dc84d737d44391b0`; `admin.english-hills.com` aliases it.
- Production Meta realtime intake is disabled (`enabled = false`); `meta_reconciliation.enabled = true`. Reconciliation has operated with `last_error_code = null`.
- Real Meta intake has been demonstrated end-to-end: at least three real ingestion jobs completed successfully, producing three Meta submissions and three CRM leads. Leads started as NEW with first-contact tasks, without automatically creating students or enrollments. No customer identities or payloads are recorded here.
- [PR #29](https://github.com/elforssa/english-hills-admin/pull/29)'s “095 not applied” statement describes the **pre-activation** state and is superseded by this evidence. Merge alone is still not proof of activation. Live website configuration is not established by this evidence.

## Implemented on main

- Next.js 15 / React 19 App Router, Supabase PostgreSQL/Auth/Storage, TanStack Query, Tailwind/shadcn; see [architecture](ARCHITECTURE.md).
- CRM migrations 078–091 provide lifecycle commands, Today, activities/tasks, placement, enrollment conversion, revenue attribution, durable intake and director reporting. 092–093 add optional learner handling through immutable mapping policy; 094 adds reconciliation and option labels.
- Lifecycle is NEW → CONTACTING → ENGAGED → QUALIFIED → CONVERTED, with LOST/NOT_QUALIFIED closures. Linked Confirmed/Validated enrollment is conversion evidence; starting enrollment is insufficient. [Rules](PRODUCT_RULES.md).
- Meta webhook and reconciliation share `crm_ingestion_jobs`. The reconciliation activation watermark is database-owned `settings.meta_reconciliation.started_at`; per-form lease/due/error state is in `crm_meta_reconciliation_state`. It is rolling lookback discovery, not a persisted pagination/high-water cursor. [ADR-002](../architecture/decisions/ADR-002-meta-intake-and-reconciliation.md).
- Main implements pg_cron + pg_net as primary five-minute trigger, with GitHub Actions backup calling the same protected `/api/cron/crm-intake`. Production activation of 095 was verified on 2026-09-29 as recorded above.
- Website `/api/public/crm-inquiry` durably queues inquiries for the shared resolver. Public `/api/public/inscription` remains a distinct student/enrollment registration flow; the marketing website is external to this repository.
- Meta inbound retrieval has real Graph HTTP transport. Lifecycle feedback and Insights have fixture/mock transports only; Insights endpoint reports `live_sync_enabled: false`. Code capability does not prove a live connection is configured.
- Dedicated receptionist exists since 077. Current routes are Today, prospects, placement tests, students/list-detail, enrollments and settings. Broader finance, academic and teacher operations access is absent; see [current role boundaries](SECURITY_RULES.md).

## Documentation discrepancies

The imported AGENTS/CLAUDE guidance incorrectly claimed receptionist was removed, five roles, outdated table counts, and root-level middleware. AGENTS also claimed Next.js 14 and no tests. These entry points now defer to verified sources. README role/schema/deployment guidance is corrected. The receipt model's “055 absent from main” / “057 unreleased” text is historical, not current. Phase 12 rollout/checklist/validation and early provider docs retain historical evidence and activation gates; their blanket “production 076” or “not deployed” statements are not a present deployment inventory. The follow-up SQL defaults match the approved Day 1/2/4/6 cadence, but its validator permits other later offsets; live policy values were not verified. The ProtectedRoute header's broad admin/director claim is superseded by its executable director-only CRM analytics check; no application code was changed.

## Active planned work

**Receptionist operations redesign — APPROVED / PLANNED, not fully implemented.** [ADR-003](../architecture/decisions/ADR-003-receptionist-operations-role.md) defines expanded operational access, Today dashboard, CRM detail changes and walk-in direction. It grants no current permission and is not deployment authorization.
