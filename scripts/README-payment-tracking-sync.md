# Payment tracking sync

This one-off operational importer reconciles the 2026 Annual and Mise à niveau
payment-tracking CSVs with students and receipts. It is dry-run by default.

Family-level `PAYE`, `RESTE`, and `REMISE` amounts are divided among every child
listed under the normalized parent name. Cent remainders are assigned in source
row order, so all child receipts add back to the source totals exactly.

The private reconciliation report can contain student data. Keep it outside the
repository in a new mode-0700 directory and delete it when the review is done.

Run the offline tests:

    node scripts/test-payment-tracking-sync.mjs

Dry-run example (read-only database access):

    node scripts/sync-payment-tracking.mjs \
      --annual '/absolute/path/annual.csv' \
      --mise-a-niveau '/absolute/path/mise-a-niveau.csv' \
      --report-dir '/private/tmp/english-hills-payment-sync-unique-id' \
      --confirm-project '<project-ref>' \
      --env-file '.env.local'

An admin CSV export can also produce a read-only student reconciliation without
database credentials. It cannot inspect existing receipt markers or be applied:

    node scripts/sync-payment-tracking.mjs \
      --annual '/absolute/path/annual.csv' \
      --mise-a-niveau '/absolute/path/mise-a-niveau.csv' \
      --students-export '/absolute/path/apprenants.csv' \
      --report-dir '/private/tmp/english-hills-payment-sync-unique-id'

Production application is deliberately gated and must not be run until:

1. migration 048 has passed local testing and been separately approved and
   deployed to production;
2. every ambiguous match and source issue in the dry-run is resolved;
3. the dry-run counts have been reviewed and explicitly approved;
4. a fresh production backup has been taken.

Only then add both flags below to the same reviewed command:

    --apply-production --confirm-write APPLY_PAYMENT_TRACKING_2026

The command writes a private apply journal. It also attempts compensating
rollback if any write fails. Verify the final database counts independently.
