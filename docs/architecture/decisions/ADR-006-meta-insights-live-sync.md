# ADR-006: Meta Insights live synchronisation

**Status:** PROPOSED (2026-10-09), pending owner acceptance of [Director CRM & Growth Intelligence — Outcome A](../plans/director-growth-intelligence.md), revision DGI-A-r1. Not implemented, merged, deployed or activated.

## Context

Migrations 089/090 and the Phase 11 adapter implement Meta Insights storage, an idempotent sync queue and director-only acquisition-cohort reporting, but only in a mock mode with an injected transport. The director needs real ad spend, CPL, CPQL and CAC in `/crm/analytics`, kept current automatically. The ad account is billed in USD while CRM revenue is MAD. The lifecycle credential (S1) is deliberately limited to the dataset endpoint and must not gain ad-account access.

## Decision

1. **Live sync reuses the existing Insights model.** `mode = 'live'` extends the 089 functions; the tables, the `CRM_META_INSIGHTS_TOKEN_*` secret-reference model, the full-range atomic publish and the acquisition-cohort reporting contract are unchanged. No second storage, reference or reporting model is introduced.
2. **A dedicated read-only credential.** Insights reads use their own Meta System User, assigned only the reporting ad account with a read-only task, issuing one `ads_read` token stored as a Vercel Production Secret under the `CRM_META_INSIGHTS_TOKEN_*` reference. The S1 lifecycle identity and token are not reused; the S1 Gate-B procedure is reused for issuance, validation, storage and rotation.
3. **The repository's scheduler pattern.** A protected `GET /api/cron/crm-insights` endpoint with a dedicated bearer, invoked by a Vault-configured pg_cron job created inactive, as migrations 095 and 100 do. No Vercel Cron and no GitHub backup for this path.
4. **Three independent switches and fail-closed publishing.** The director's database switch, the cron job's active flag and the presence of the secret must all be on. Partial or failed fetches never publish; uncertain publishes are recovered by lease expiry and idempotent replace; transient failures retry a bounded number of times with backoff; terminal failures wait for a human.
5. **No cross-currency ratios.** With USD spend and MAD revenue, ROAS is hidden and explained; CPL, CPQL and CAC are shown in the spend currency. Uncovered dates show unavailable, never zero. Currency conversion is a separate decision.

## Consequences

- Live spend reaches the existing report without a new page or a new data model.
- Credential isolation costs one more System User and its own rotation, in exchange for keeping S1's invariants intact.
- Account, currency and timezone become immutable after the first published live run; corrections afterwards are reviewed reconciliations.
- The async Insights report path stays test-only; a range too large for synchronous reads is split by the director.
- Activation remains a separately approved Tier-3 release sequence; code presence never activates anything.

## Evidence

[CURRENT_STATE](../../ai/CURRENT_STATE.md) owns implementation, deployment and activation facts. The plan records the verified provider documentation and the unconfirmed account facts.
