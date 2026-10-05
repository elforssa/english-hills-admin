# ADR-002: Durable Meta intake with independent reconciliation

## Status

Accepted; implemented on main. Production activation was verified on 2026-09-29; the latest operational evidence belongs in [CURRENT_STATE](../../ai/CURRENT_STATE.md).

## Date

2026-09-29 (documentation capture).

## Context

Realtime webhook availability depends on Meta app constraints and subscriptions. Polling must recover recent leads without creating a second resolver, duplicate opportunities or surprise historical imports. Scheduler overlap must be safe.

## Decision

Webhook when available **and** bounded reconciliation enqueue the same canonical event into `crm_ingestion_jobs`. Reconciliation discovers IDs through the form `/leads` edge; the shared worker retrieves/normalizes each lead and resolves it through the existing CRM ingestion transaction.

`connection.enabled` controls realtime webhook intake. `settings.meta_reconciliation.enabled` independently controls discovery, allowing realtime to remain disabled until app constraints permit it. The database sets `started_at` on activation; clients cannot backdate it. Re-enabling establishes a new activation watermark. Discovery lower bound is `max(started_at, now - lookback_minutes)`; this is not a historical backfill or a persisted “last lead seen” cursor.

`crm_meta_reconciliation_state` stores per-connection/form due time, lease and sanitized error state. One due form is claimed per scheduler call; a 55-second lease fences overlap. Up to two pages of 25 IDs are examined, with opaque pagination cursors used only within that pass. Successful forms become due in ten minutes; rate limits back off fifteen minutes, other errors five. A high-volume form or many forms can outrun the lookback: monitor saturation/due state, do not assume gap-free historical recovery.

Supabase pg_cron + pg_net is the primary five-minute trigger; GitHub Actions is a five-minute backup. Both call the same protected `/api/cron/crm-intake` with a dedicated scheduler bearer. The endpoint performs discovery then bounded shared ingestion (three jobs, or two on a discovery tick). Vault supplies primary URL/token; configuration is separate from repository code.

## Alternatives considered

- Webhook-only intake cannot cover unavailable realtime delivery.
- Polling that directly creates leads duplicates matching and normalization logic.
- Unbounded historical polling risks surprise imports and exceeds request budgets.
- Separate backup workers create divergent behavior; redundant triggers can safely share leases and idempotency instead.

## Consequences

Unique `(connection_id, event_kind, external_key)` queue identity deduplicates webhook and reconciliation in either order. Ingestion leases and `FOR UPDATE SKIP LOCKED` claims fence workers; finalization checks current state. A schedule firing is not proof of successful intake. Retain diagnostics and retry ownership; any gap/backfill needs separate review.

## Security/invariants

Keep signed webhook verification, fixed Graph host/validated IDs/edges, bounded requests, server-only secrets and counts-only scheduler responses. Activation is explicitly authorized; disabled realtime must remain blocked even when reconciliation is enabled. Never bypass mapping, consent, role checks or immutable attribution to recover an event.

## Implementation status

[086 ingestion](../../../supabase/migrations/086_crm_meta_ingestion.sql), [087 shared queue](../../../supabase/migrations/087_crm_website_ingestion.sql), [094 reconciliation](../../../supabase/migrations/094_crm_meta_reconciliation.sql), [reconciler](../../../src/lib/crm/meta/reconcile.mjs), [095 primary trigger](../../../supabase/migrations/095_crm_intake_pg_cron_scheduler.sql), [backup workflow](../../../.github/workflows/crm-intake-scheduler.yml). Main includes the `/leads` edge fix from PR #28. Migration 095 implements the primary scheduler. Production activation was verified on 2026-09-29; [CURRENT_STATE](../../ai/CURRENT_STATE.md) owns the latest operational evidence. [Runbook](../../crm-intake-scheduler.md).

## Accepted amendment — bounded ownership conflicts, 2026-10-02

**Owner accepted revision 1 and separately commissioned implementation on 2026-10-02. PR #55 completed independent review and the approved migration-first Production release; migration 105 and exact merged source are Production verified.** [Repair plan revision 1](../plans/completed/crm-meta-reconciliation-stale-lease-repair.md) specifies `PT409` plus exact nonsecret identifiers for lost reconciliation ownership and separate disabled/inactive-form conflicts. The server preserves only narrowly allowlisted identities; an enqueue ownership loss ends the pass without finish, retry or reclaim. Lease fencing, queue identity and cadence remain unchanged. This is a durable RPC error-contract correction to 094, implemented through forward migration 105 after immutable 104, with exact-head independent review and separate owner-approved release completed. The confirmed stale-finish `40001` incident is unrelated to H3-02's outbound timestamp/transport change.

Returning success would conceal an incomplete pass; treating every 409 or 40001 as ownership loss would hide real failures; adding retries would retain the hazard. The exact contract preserves business/storage distinctions. Existing accepted acquisition decisions above remain authoritative. The separate H3-03 operator recheck is recorded in [current evidence](../../ai/CURRENT_STATE.md#capability-register); this repair approval never authorized H3-04–08/H4.

[Branch implementation evidence](../evidence/crm-meta-reconciliation-stale-lease-implementation-2026-10-02.md) records local acceptance limits. [Dated Production acceptance](../evidence/crm-meta-reconciliation-stale-lease-production-2026-10-02.md) records the completed release and its bounded probe scope.
