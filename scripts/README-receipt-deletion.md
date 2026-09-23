# Director deletion of mistaken receipts

Migration: `supabase/migrations/076_delete_mistaken_receipt.sql`.

The new **Supprimer le reçu** action on a receipt opens a preview showing the
payment to remove from collected money and the balance to remove from money owed.
The director supplies a reason and confirms. This is an accounting correction,
not a refund and not cancellation of the student's enrollment.

The database transaction soft-deletes the selected receipt and voids its charge.
It also works when the receipt was already voided: its payment is not subtracted
twice, and the leftover charge stops contributing to student and finance balances.
Another active payment on the same charge blocks the whole transaction. Other
charges and payments are not changed. Payment-only correction remains available
when the debt itself is valid.

Deleted receipts remain stored but existing restrictive RLS hides them from normal
reads for every app role. Directors can open **Reçus → Historique des suppressions**
to inspect the receipt number, original amount, actual collected-total adjustment,
actor ID, time, and reason. The underlying original receipt and financial events
are retained. Non-directors cannot execute deletion or read financial events.

## Existing mistaken balances

After deployment, open each confirmed mistaken cancelled receipt, choose
**Supprimer le reçu**, review the balance reduction, and confirm the reason.
This repairs the leftover charge without altering the valid replacement payment.
For the cases reported by the user, the expected reductions are 5,500 MAD for Adam
and 4,500 MAD each for Douaa and Boutaina, subject to reviewing the actual linked
records. Do not select receipts by student name alone or bulk-cancel all charges
with a voided receipt: a payment cancellation can leave a legitimate debt.

No production data repair is embedded in the migration. No production rows were
changed during implementation. Production migration/deployment and correction of
the selected records require explicit user approval under AGENTS.md.

## Local verification

Use a non-main feature branch and local Supabase only:

```sh
psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' -v ON_ERROR_STOP=1 -f supabase/migrations/076_delete_mistaken_receipt.sql
psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' -v ON_ERROR_STOP=1 -f scripts/test-delete-mistaken-receipt.sql
node scripts/test-receipt-client-regressions.mjs
npm run dev -- --port 3017
node scripts/test-receipt-deletion-browser.mjs
```

The SQL suite rolls back all synthetic fixtures. The browser suite asserts a local
Supabase URL, creates synthetic fixtures, and removes them in `finally`.
Deploy the database migration before the UI. Never run a linked push automatically.
