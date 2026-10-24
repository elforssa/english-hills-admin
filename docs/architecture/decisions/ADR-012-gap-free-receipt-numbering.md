# ADR-012: Gap-free, immutable receipt numbering

## Status

**Proposed** (2026-10-24) with the [payment corrections and receipts plan](../plans/payment-corrections-receipts.md), revision PCR-r1. Not accepted, not implemented. The owner approved the plan on 2026-10-24 at head `a6cce4e` (Q6 = B, historical series `EH-HIST-2026-…`; Q7 = A; [approval record](../plans/payment-corrections-receipts.md#approval-record)); this status is updated as the plan's docs/status reporting defines. [CURRENT_STATE](../../ai/CURRENT_STATE.md) owns implementation evidence once it exists.

## Date

2026-10-24.

## Context

Receipt numbers (`EH-YYYY-NNNNN`) come from `receipt_number_seq` in a BEFORE INSERT trigger (migration 026). Sequence values survive rollback, and the payment wrapper can still fail after the receipt row is inserted, so failed or retried attempts consume numbers. On 2026-10-24 Production had 163 numbers never issued, 128 of them in the charge-model period (259–382 and 414–417), and 54 imported receipts with no number because the import disabled user triggers. Article 145-III of the Moroccan tax code expects invoices from a continuous, pre-numbered series; these receipts are the centre's primary record of cash received, so gaps invite the same question.

## Decision

1. Numbers come from a one-row-per-series counter table updated inside the receipt's own transaction (`update … returning`). A rollback releases the number; the row lock serialises receipt-issuing transactions until commit.
2. A caller cannot supply a number. An issued number can never change, and a receipt can never be hard-deleted or truncated, for any role; cancellation is a void or soft delete that keeps the number.
3. One continuous counter across years; the year prefix comes from the Casablanca issue date (proposed default, owner decision Q7 in the plan). Width grows beyond five digits instead of truncating.
4. Historical unnumbered receipts are numbered once, by an approved data step, in a series the owner chooses; then `receipt_number` is required.
5. Existing gaps are never filled by renumbering; they are explained in a register for the accountant.

## Alternatives considered

- **Keep the sequence and move every check before the insert.** Rejected as the main fix: any later failure (deferred triggers, enrollment triggers, client retries, probes) would still burn numbers.
- **Number at the very end of the wrapper.** Rejected: the insert trigger is the single path every receipt takes, and the lock window saved is small.
- **Reset the counter every January.** Possible (owner decision Q7); not the default because the counter has never reset.

## Consequences

- Two receipts cannot commit at the same instant; at current volume (tens per day) this is not visible.
- Release checks remain zero-payment only, because a committed test receipt would consume a real number.
- Rollback restores the sequence-based trigger after `setval` to the counter value, so numbering continues without overlap.
