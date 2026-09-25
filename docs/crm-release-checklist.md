# CRM release acceptance record

This is a manual sign-off form, not approval to deploy. Evidence: [Phase 12 validation](crm-phase12-validation.md). Procedures: [rollout](crm-production-rollout.md), [operations and activation](crm-operations-runbook.md). Reviewer/date/release commit and incident links must be recorded privately without customer data or secrets.

## Code acceptance

- [ ] Exact Phase 12 diff reviewed; no unrelated files, historical migration rewrites or new business features.
- [ ] Fresh 001–090 rehearsal succeeds from an empty Supabase platform.
- [ ] Synthetic 076 → 090 upgrade preserves center records, receipts and financial events exactly.
- [ ] Index-only 091 reviewed, applied locally/disposably, and Today plan verified.
- [ ] Role/RLS matrix: all nine identities, normal RPCs and direct bypass attempts.
- [ ] Director role boundaries, immutable evidence and receptionist finance restrictions pass.
- [ ] Manual lead, five-attempt cadence, task invariants, family ambiguity and channel concurrency pass.
- [ ] Placement, linked enrollment identity, conversion and independent signed revenue pass.
- [ ] Website and Meta mock durable intake/retry/idempotency pass.
- [ ] Lifecycle mock failure/lease/ambiguous-response drills pass.
- [ ] Insights mock sync, cohort ratios, first touch, currency/timezone and partial refresh pass.
- [ ] Large synthetic query review and bounded browser listing review completed.
- [ ] Desktop/mobile, keyboard/labels, drawer/dialog and error/empty-state smoke reviewed.
- [ ] All Phase suites, finance/enrollment/security, Batch2, middleware, navigation, unit, lint and build pass.
- [ ] Important suites pass in changed order with baseline fixture/trigger/RLS health restored.
- [ ] Secret/client-bundle/error review completed; limitations understood.
- [ ] No synthetic fixtures or disabled guards remain in existing local database.

## Production rollout gates — not yet performed

- [ ] Explicit production deployment approval covers exact immutable release and migrations 077–091.
- [ ] Production is reverified at 001–076 with no schema/ledger/security drift.
- [ ] Backup/PITR and tested restore readiness, operator and recovery window confirmed.
- [ ] Actual deployed old-app artifact rehearsed against new schema for center flows; rollback limitations accepted.
- [ ] Migration lock/write window communicated; requests/workers drained; timeouts reviewed.
- [ ] Environment targets verified explicitly; pending migration dry-run is exactly 077–091.
- [ ] External connections, credentials, schedulers and wake-ups cannot auto-enable; existing receipt delivery config preserved.
- [ ] Schema applied and exact ledger/definitions/RLS/grants/triggers/center records verified before compatible app deployment.
- [ ] Authorized director/receptionist smoke completed; synthetic production history closed through audited commands.
- [ ] Real follow-up policy verified/bootstrapped with exact Casablanca hours and stable request UUID.
- [ ] Monitoring owners, operational review queues and independent safe-disable procedures accepted.
- [ ] Retention/privacy/contact-sharing decisions approved before any live collection/sharing.
- [ ] Website activation separately approved and checklist signed.
- [ ] Meta inbound activation separately approved and checklist signed.
- [ ] Lifecycle live implementation/provider verification/activation separately approved.
- [ ] Insights live implementation/provider verification/activation separately approved.

Approval signatures: engineering ______; security ______; director/operations ______; release operator ______; date ______; immutable release commit ______.
