# CRM production rollout proposal — Phase 12

**Review document, not deployment authorization.** Baseline code: `8452dde85d9d8b7d894c5ab7c6c8dd041efd0fef`. Production is last confirmed at 001–076; verify it again before approval. No real data was used in rehearsal. All external integrations remain unauthorized.

## Pre-deploy gates

1. Obtain explicit production deployment approval for an immutable release commit and exact migration list. This document does not grant it. Confirm reviewed feature-branch changes are merged through the normal release process; never push directly to main.
2. Verify production migration history, function definitions, role constraints, extensions and trigger health using a repeatable-read READ ONLY transaction. Compare with the approved 076 baseline. Any drift stops deployment; never mark unapplied migrations as applied to bypass it.
3. Confirm a current restorable database backup/PITR recovery point, retention, recovery operator, tested restore procedure and recovery-time expectations. Record the point and owner privately. A successful backup job alone is not restore evidence.
4. Confirm no real Meta/website/lifecycle/Insights connections, credentials, schedules or Vault worker wake-ups will auto-enable. Do not remove existing receipt-email secrets: they belong to the existing finance system. Record current finance/email configuration without copying values into logs.
5. Announce a short controlled write window, pause application writes and external schedulers, drain active requests, and inspect long-running transactions. Read-only center access may remain available where the current application supports it. No untested zero-downtime claim is made.
6. Review [release checklist](crm-release-checklist.md), [operations runbook](crm-operations-runbook.md), rehearsal results and the exact pending migration list. Take pre-deploy counts/fingerprints of center records without exporting PII.

## Schema sequence

Apply **077 → 078 → 079 → 080 → 081 → 082 → 083 → 084 → 085 → 086 → 087 → 088 → 089 → 090**, then **091_crm_hardening_task_history_index.sql**, the demonstrated Today terminal-task lookup fix. Never rewrite 001–090.

Only after production authorization, the operator should use the installed Supabase CLI's explicit database URL workflow. Obtain the URL through the approved secret channel; disable shell tracing and do not paste it into tickets. First run the CLI dry-run and verify that the pending list is exactly the approved list. Do not use an implicitly linked target. Execute the same reviewed migration operation once, stop at the first error, and retain sanitized logs. A partially applied sequence is not a completed release.

Proposed manual commands **after approval**, from the reviewed release checkout. `CRM_RELEASE_DB_URL` must be supplied privately by the release operator, percent-encoded and explicitly verified as the approved target. It must not be committed. Installed CLI 2.116.0 supports `--skip-vault`; this flag prevents migration execution from also changing configured Vault secrets. Neither command was executed against production in Phase 12.

```sh
set +x
: "${CRM_RELEASE_DB_URL:?Load the approved target URL privately first}"
supabase db push --db-url "$CRM_RELEASE_DB_URL" --skip-vault --dry-run
# STOP: human review must confirm exactly 077–091, correct target and approval.
supabase db push --db-url "$CRM_RELEASE_DB_URL" --skip-vault
```

Do not add `--include-seed`, `--include-roles`, `--include-all` or `--yes`. Use the interactive pending-list confirmation. Configure approved connection/session timeout options through the operator's tested database connection procedure; a prior `psql SET` does not configure a later CLI connection. If using a different CLI version, inspect its help and rehearsal behavior first. URL arguments can be visible to local process inspection; run only on the controlled release host.

Each 077–091 migration has a transaction boundary. Standard index creation and ALTER TABLE may block writers. Set an operator-approved lock timeout so deployment fails cleanly rather than waiting indefinitely; size the statement timeout using rehearsal and production table counts. After a timeout inspect the ledger and transaction outcome before retrying. Do not wrap the entire historical sequence in an invented enclosing transaction or skip statements.

Verify the final ledger, exact changed function definitions, constraints, grants, RLS and enabled triggers. Confirm CRM tables/configuration are initially empty/disabled and center records remain intact. Use [health SQL](../scripts/crm-release-health.sql), plus the release's schema-specific assertions. Release the write pause only after schema and app smoke checks succeed.

## Application/schema compatibility

| Window | Assessment / required action |
|---|---|
| Old 076 app + full new schema, CRM unused | Additive structures and compatibility RPCs are intended to preserve existing center flows; rehearse enrollment/finance and smoke the deployed old build. Do not assign receptionist or create CRM-linked enrollments yet. |
| Old app + schema after CRM usage begins | Not fully operationally interchangeable. Old receipt UI may omit explicit CRM enrollment identity; the database correctly rejects unsafe payments. Prefer feature disable/current app forward repair. Do not weaken the guard to make rollback work. |
| New app + 076 schema | Unsupported: required CRM RPCs/tables/permissions are absent. Never deploy app first. |
| Partially applied 077–090 | Keep CRM routes/users/providers inactive. Stop rollout, inspect last committed migration and forward-complete the reviewed sequence. Existing old app smoke remains mandatory. |
| Older worker during schema change | Disable affected connection and scheduler; drain leases. Finalizers re-check current enabled state and lease. Do not run competing releases against live queues. |
| Cached old browser during deployment | Request a reload/sign-in after rollout. Versioned commands reject stale updates. Pending old form submissions may fail safely; preserve their inputs and refresh rather than bypassing concurrency checks. |

The actual production old-app artifact is an operational acceptance gate; repository inspection and local center regression are not a substitute for testing that deployed artifact.

## Migration compatibility matrix

“App rollback” means retain schema/history and run an older app; it never means drop CRM tables. “Pause” refers to the controlled write window. No migration below seeds real policy, users, leads or provider credentials.

| Migration | Purpose / dependency | Data rewrite | Destructive | Lock-sensitive | App rollback | Keep disabled during deploy | External setup |
|---|---|---|---|---|---|---|---|
| 077 | Receptionist constraints, role administration, operational access; 076/042 | No role reassignment | No records deleted; security replaced | Profiles/pending-role checks and privilege changes | Old app cannot serve newly assigned receptionist | Receptionist assignment | None |
| 078 | Core CRM/history; 077 and center FKs | None | No | New tables/indexes, referenced-table locks | Yes, retain unused CRM | CRM intake | None |
| 079 | Fixed reads and grants; 078 | None | No; intentional grant revocation | Catalog/security locks | Yes | CRM routes | None |
| 080 | Commands, concurrency, follow-up engine; 079 | None | No | Function/catalog locks | Yes, retained history | Intake until policy exists | Director policy |
| 081 | Today/search/detail/history; 080 | None | No | Function/catalog locks | Yes | CRM routes | None |
| 082 | Atomic conversation decisions; 081 | None | No | Function/catalog locks | Yes | CRM routes | None |
| 083 | Placement link, milestones, guarded history; 082 | Nullable column only | Linked hard-delete intentionally denied | Placement ALTER/indexes and trigger locks | Legacy unlinked placement preserved | CRM booking; pause writes | None |
| 084 | Enrollment link/conversion and payment identity safeguard; 083 | No automatic conversion/backfill | No; unsafe implicit payment rejected | Enrollment triggers, CRM constraint, finance RPC replacement | Conditional after linked CRM usage | CRM enrollment; pause finance writes | None |
| 085 | Signed revenue ledger/reconciliation; 084 | No historical automatic backfill | Append-only ledger | Financial-event index and deferred trigger installation | Preserve ledger/triggers | CRM finance linkage; pause finance writes | None |
| 086 | Durable Meta intake/mappings; 085 | None | No | CRM ALTER/index/trigger/catalog locks | Keep queues/history | Meta and worker schedules | Verified Meta account, mapping, secrets, retention |
| 087 | Website/shared queue; 086 | Constraint expansion, no inquiry rewrite | No | Connection/mapping/job constraint locks | Disable website before old worker/app | Both inbound channels/workers | Origin, mapping, anti-abuse, consent, scheduler |
| 088 | Mock lifecycle intentions/attempts; 087 | None | No | Connection ALTER, new indexes | Disable worker; retain immutable attempts | Lifecycle mock/live processing | Live transport not implemented/authorized |
| 089 | Mock Insights state/worker; 088 | Default empty settings; response projection compatibility | No | Connection ALTER/unique index | Retain snapshots; disable sync | Insights | Live provider verification/transport/scheduler |
| 090 | Director cohort reporting; 089 | None | No | Function/catalog locks | Analytics unavailable in old app | Analytics until sequence complete | Verified spend account config later |
| 091 | Partial covering terminal-task index; 078/081 | Index build only | No | Standard CREATE INDEX blocks task writers; empty on first CRM rollout | Yes | Pause task writes if CRM already used | None |

## App deployment, bootstrap and smoke

Deploy the reviewed application **after** schema verification. Do not combine app deployment with provider activation. Confirm director and receptionist gates using real authorized test accounts; test an intentionally identified synthetic manual prospect through the operational flow. Check existing unlinked enrollment/receipt paths and the explicit CRM enrollment safeguard. Do not create real payment records merely for smoke testing without a separately approved test/correction procedure.

Close the synthetic prospect through an audited Lost/Not Qualified command with a clear release-test reason. Keep immutable history; do not DELETE/TRUNCATE CRM records to clean production. Revoke any temporary test account through the approved account process after records with restrictive actor references are considered.

### Follow-up policy bootstrap (director session only)

Read the current policy/version first. If an approved active policy already exists, verify it rather than publish a duplicate. Generate and record one request UUID for this logical action; retries use **the same UUID and exact payload**. Call the RPC through an authenticated director client (not an anonymous/service-key substitute):

```js
await supabase.rpc('crm_create_followup_policy', {
  p_request_key: APPROVED_BOOTSTRAP_REQUEST_UUID,
  p_data: {
    timezone: 'Africa/Casablanca',
    weekly_hours: {
      '1': [['15:00', '20:00']],
      '2': [['10:00', '12:30'], ['15:20', '20:00']],
      '3': [['10:00', '12:30'], ['15:20', '20:00']],
      '4': [['10:00', '12:30'], ['15:20', '20:00']],
      '5': [['10:00', '12:30'], ['15:20', '20:00']],
      '6': [['10:00', '12:30'], ['15:20', '20:00']],
      '7': []
    },
    attempt_offsets: [0, 0, 1, 3, 5],
    minimum_attempt_gap_minutes: 180,
    first_contact_sla_minutes: 15,
    post_test_sla_minutes: 120,
    stale_contacting_minutes: 2880
  }
});
```

Verify returned policy version/timezone/hours and scheduling around lunch, Sunday and Monday. Policy versions are immutable; publish a reviewed new version instead of editing history. This procedure has **not** been executed in production.

## Staged activation order

1. Manual CRM and policy smoke; observe operational queues.
2. Website only after its separate authorization/checklist.
3. Meta inbound only after current provider requirements and a real test lead are verified and separately authorized.
4. Lifecycle outbound only after inbound is stable, consent/destination/event requirements are reviewed, and a live transport has been implemented/tested/authorized. Current code is mock-only.
5. Insights last, after account currency/timezone, provider version/access, live transport and reconciliation with Ads Manager are verified and separately authorized.

See [operations/activation runbook](crm-operations-runbook.md). No step auto-enables the next.
