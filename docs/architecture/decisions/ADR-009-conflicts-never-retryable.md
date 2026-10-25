# ADR-009: Deliberate conflicts use `PT409`, never the retryable `40001`

## Status

**ACCEPTED** (Maroine, 2026-10-24) with the owner's approval of the [conflicts-without-retry-loops plan](../plans/conflicts-without-retry-loops.md#approval-record), revision NRC-r1 at head `7c98b35` (D1–D6 all A). Not implemented; implementation, migration and release each need separate approval. If a parallel architecture PR claims ADR-009 first, this record is renumbered at merge without changing its content.

**Implementation (2026-10-24):** implemented by PR #158 (merged as `9774c4c…`) with migration `119_conflicts_without_retry.sql`, the shared `src/lib/conflictErrors.mjs` and the CI checks ([implementation record](../plans/conflicts-without-retry-loops.md#implementation-record)). **Released 2026-10-24:** app deployed first, migration 119 applied to Production at 16:11 UTC; 0 application functions raise `40001`, 45 raise `PT409` ([release record](../evidence/conflicts-without-retry-production-2026-10-24.md)).

## Date

2026-10-24.

## Context

PostgREST before version 16 re-runs a transaction without limit when PostgreSQL reports SQLSTATE `40001` (serialization_failure). Forty-three functions raise `40001` on purpose for stale versions, lost leases, held locks and translated deadlocks. A deliberate `40001` fails the same way on every retry, so the request never returns and the database loops at about 100 transactions a second until PostgREST restarts. This caused the ~391M-transaction incident that ended on 2026-10-02 ([evidence](../evidence/performance-audit-2026-10-08.md#391m-service_role-set_config-calls)). [Migration 105](../plans/completed/crm-meta-reconciliation-stale-lease-repair.md) fixed the two reconciliation functions with `PT409`; the rest remain.

## Decision

1. Application SQL never raises `40001` or catches `serialization_failure` to re-raise it. A refusal caused by concurrent change, stale data, a lost lease or a busy lock raises `PT409` (HTTP 409) with a fixed, data-free message and, where a browser contract exists, a closed-vocabulary hint.
2. A genuine serialization failure raised by PostgreSQL itself is left untouched; no catch-all handler converts real database errors.
3. Staff are never subjected to a silent server-side replay of their action: a conflict always returns to the browser, which refreshes and asks the person to check and resend.
4. The browser treats `PT409` and the legacy `40001` alike as a record conflict, so app and database can be released in either order.
5. CI enforces rule 1 on the cumulative catalog and on every new migration file, with no escape comment.
6. Every batch follows this rule, including new commands from other plans (for example a stale-version refusal keeps its own closed hint but uses `PT409`).

## Consequences

- Conflict behaviour no longer depends on the PostgREST version, and the local/CI stack behaves like Production.
- Future functions use `PT409` for version and lease checks; a reviewer can reject `40001` mechanically.
- HTTP 409 separates conflicts from validation failures (HTTP 400) in logs and monitoring.
- The online-learning plan's "`40001` on a stale version" rule is superseded for its two helpers once accepted.
