# ADR-006: Meta Insights live synchronisation

## Status

**Accepted** (owner Maroine, 2026-10-09): approved for implementation with [Director CRM & Growth Intelligence — Outcome A](../plans/director-growth-intelligence.md#approval-record), revision DGI-A-r2 at exact head `d19cdf69083e545dac559fa8f0a50f5f4370d451`, after the independent reviewer's READY FOR FINAL REVIEW on that head. Owner answers: decisions 1, 3, 4, 5 and 6 Option A; decision 2 (backfill start date) open and blocking only the backfill release step. Not implemented, merged, deployed or activated; every Production step keeps its own approval. [CURRENT_STATE](../../ai/CURRENT_STATE.md) owns implementation and activation evidence.

## Date

2026-10-09 (r2 after independent review of r1; accepted the same day).

## Context

Migrations 089/090 and the Phase 11 adapter implement Meta Insights storage, an idempotent sync queue and director-only acquisition-cohort reporting, but only in a mock mode with an injected transport and a request RPC that refuses anything but mock. The director needs real ad spend, CPL, CPQL and CAC in `/crm/analytics`, kept current automatically. The ad account is billed in USD while CRM revenue is MAD. The lifecycle credential (S1) is deliberately limited to the dataset endpoint and must not gain ad-account access. Meta insights keep changing for 28 days after a date.

## Decision

1. **Live sync reuses the existing Insights model.** `mode = 'live'` extends the 089 functions, including the director request RPC; the tables, the `CRM_META_INSIGHTS_TOKEN_*` secret-reference model, the full-range atomic publish and the acquisition-cohort reporting contract are unchanged. No second storage, reference or reporting model is introduced.
2. **A dedicated read-only credential.** Insights reads use their own Meta System User, assigned only the reporting ad account with a read-only task, issuing one `ads_read` token stored as a Vercel Production Secret under the `CRM_META_INSIGHTS_TOKEN_*` reference. The S1 lifecycle identity and token are not reused; the S1 Gate-B procedure is reused for issuance, validation, storage and rotation.
3. **The repository's scheduler pattern.** A protected `GET /api/cron/crm-insights` endpoint with a dedicated bearer, invoked by a Vault-configured pg_cron job created inactive whose invoker pins the exact Production URL, as migration 100 does. No Vercel Cron and no GitHub backup for this path.
4. **Three independent switches and fail-closed publishing.** The director's database switch, the cron job's active flag and a server live gate `CRM_META_INSIGHTS_LIVE_ENABLED` must all be on; the secret's presence is a precondition that fails closed. Partial or failed fetches never publish; uncertain publishes are recovered by lease expiry and idempotent replace; transient failures retry a bounded number of times with backoff; terminal failures wait for a human.
5. **A 28-day rolling window.** The automatic refresh re-reads the last 28 account dates, matching Meta's revision period, so no published day goes stale while it can still change.
6. **No cross-currency ratios.** With USD spend and MAD revenue, ROAS is hidden and explained; CPL, CPQL and CAC are shown in the spend currency. Uncovered dates show unavailable, never zero. Currency conversion is a separate decision.

## Alternatives considered

- **Reuse the lifecycle System User and token for Insights.** Rejected: S1 invariant 2 forbids that identity any unrelated ad-account access, and an identity-wide token revoke would couple reporting and delivery incidents. Kept as owner option B.
- **Vercel Cron or a GitHub Actions schedule.** Rejected: the repository already standardises on Vault-driven pg_cron with a protected endpoint; `vercel.json` is owned by an open performance PR; a missed Insights tick only delays spend, so no backup path is needed.
- **Async Insights report jobs in live mode.** Rejected for V1: the account is small enough for synchronous reads, async jobs need their own polling lifecycle and share the same rate budget; the fixture branch stays test-only.
- **Manual spend import.** Deferred as a fallback with a defined trigger; not designed.
- **A 7-day rolling window.** Rejected after review: days 8 to 28 could still change at Meta and would stay stale.
- **No server live gate (secret presence as the third switch).** Rejected after review: a stored secret is not a runtime control; S1 invariant 7 requires a deliberately opened gate.

## Consequences

- Live spend reaches the existing report without a new page or a new data model.
- Credential isolation costs one more System User and its own rotation, in exchange for keeping S1's invariants intact.
- Account, currency, timezone and mode become immutable after the first published live run and cannot change while a run is queued; corrections afterwards are reviewed reconciliations.
- A range too large for synchronous reads is split by the director; each scheduler tick claims a run only when a bounded fetch can still fit.
- Activation remains a separately approved Tier-3 release sequence; code presence never activates anything.

## Security/invariants

- The token value exists only in the Vercel Production Secret and transient server memory; the database, browser, logs, errors, diagnostics and documentation carry only the reference name.
- Director-only at route, API handler and database (`crm_security.require_reader(true)`); worker RPCs are service-role only; the three tables keep RLS with no direct grants; every other role and anon is denied; the scheduler endpoint authenticates itself with a dedicated bearer.
- Fixed Graph host and path, bearer header only, redirect rejection, bounded requests/pages/rows/bytes, account metadata verified before any publish.
- Spend is unavailable, never zero, for uncovered dates; ROAS is null and hidden under a currency mismatch; no conversion.
- Enqueue and director requests serialise on the connection row; claims honour `next_attempt_at` on both the pending and the expired-lease path.

## Implementation status

**Implemented, awaiting independent review** (2026-10-09) on branch `claude/dgi-a-meta-insights-live-sync` with migration `114_crm_meta_insights_live_sync.sql`; see the plan's [implementation record](../plans/director-growth-intelligence.md#implementation-record). Not merged, deployed or activated; merge, Production reads, credential, secrets, gate, Vault, cron activation, configuration, live sync and backfill (steps R0–R8) are each separately approved.
