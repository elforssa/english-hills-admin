# Batch 4B: local inventory and reviewed backfill

This is operator tooling, not an application API. No migrations, storage
policies, object contents/keys, or application reference columns are changed.
Run on `codex-migration` with local Supabase at `http://127.0.0.1:54321`, Docker,
the Supabase CLI, and migration 045 already installed. Do not run concurrently
with the security suites or other fixture writers.

## Commands

Use a new output prefix each time; reports/checkpoints use exclusive creation
and mode 0600. Parent directories must exist. Do not commit reports or evidence.

```sh
node scripts/inventory-storage.mjs --report /private/tmp/storage-inventory-01
node scripts/backfill-storage-assets.mjs --evidence /private/tmp/reviews.json --report /private/tmp/storage-reviewed-01
node scripts/backfill-storage-assets.mjs --apply --evidence /private/tmp/reviews.json --report /private/tmp/storage-apply-01 --checkpoint /private/tmp/storage-checkpoint-01.json
node scripts/test-batch4b-storage.mjs
```

Inventory and backfill default to dry-run. `--apply` is rejected by inventory.
No cloud operation is implemented, including read-only cloud inventory. Both
scripts require a local Unix-socket Docker engine and fixed in-container
PostgreSQL socket, and detect the configured URL and `supabase/.temp/project-ref`; a linked
project never selects the target. `--production` and `--confirm-project` are
recognized only to reject unsafe/conflicting combinations. Even all three
approval flags cannot enable cloud access in 4B. A future production adapter
needs separate review, explicit approval and matching project confirmation.
No production credential is embedded or accepted for Storage downloads: the
download credential comes from verified **local** `supabase status` output.

## Report schema (version 1)

- `target`, `environment`, `snapshotFingerprint`: exact local target, presence
  (not value) of linked metadata, fingerprint of the consistent snapshot.
- `totals`: object/reference counts and separate counts for all six states.
- `objects`: storage ID, bucket, exact key, version, size, MIME, timestamps,
  owner ID and classification. Keys may themselves contain PII: protect reports.
- `references`: table/record ID/column/array index, subject IDs, archived flag,
  normalized reference, fingerprint, purpose, state, reason and review evidence.
- `candidates`: deduplicated verified new binding candidates.
- `unresolvedRecords`: the record IDs and reasons requiring review.

JSON contains exact normalized keys. Markdown contains counts and unresolved
record IDs. Neither includes raw URLs, signed tokens, names, emails, arbitrary
object metadata, or free-text review notes. Snapshots containing raw references
exist only in process memory and the local SQL transaction, not reports/logs.
Database errors are suppressed because PostgreSQL error DETAIL can reveal rows.
CLI failures return nonzero; do not interpret a written dry-run report as proof
that apply completed. Check the successful result/checkpoint or re-inventory.

## Evidence and classification

The parser accepts `asset:<uuid>`, exact `bucket/path`, and same-origin Storage
`object/sign/`, `object/public/`, `object/authenticated/` and legacy `object/`
URLs. It ignores URL query parameters (including expiry/signature) and decodes
URL keys exactly once. Plain bucket/path keys are never percent-decoded.
Unknown origins are review-required, never fetched. Malformed/unsafe paths
are ambiguous rather than guessed. Historical cloud origins remain external
in this local-only release; an approved origin map must precede cloud inventory.

An existing active registry binding is verified only when the current record,
typed subject, purpose, object key and version all agree. Otherwise it is
conflicting. Multiple distinct records claiming one object are conflicting,
even if they appear to belong to one family. Duplicate occurrences in one
enrollment array are preserved in the report and deduplicated for binding.
Deleted subjects and authorized-adult photos remain ambiguous. Missing objects
are never manufactured; unreferenced objects are orphans.

A legacy URL plus uploader/path metadata is **not** proof. An operator must
independently inspect the original file and supporting ownership context, then
supply a reviewed evidence manifest. It is privileged operator input, not a
browser-supplied manifest and not something to auto-generate from the inventory.
Example shape (replace placeholders; this example does not authorize anything):

```json
{
  "schemaVersion": 1,
  "reviews": [{
    "referenceFingerprint": "64-character fingerprint from the inventory",
    "objectId": "storage object UUID",
    "objectVersion": "exact inventory version",
    "sha256": "SHA-256 of independently reviewed original file bytes",
    "reviewedBy": "existing admin/director Auth UUID",
    "basis": "independent_content_review",
    "evidenceId": "opaque-review-ticket-id"
  }]
}
```

The manifest must agree with the live reference fingerprint, storage ID/version
and current staff reviewer. Apply also downloads the exact inventoried local
object, limits size to 10 MiB, compares the reviewed SHA-256 and checks PNG/JPEG/
PDF signatures and MIME. Photo purposes cannot use PDF. Failed byte checks abort
the whole batch before registry writes. Reviews with contradictory or duplicate
evidence fail closed. `reviewedBy` records the operator's asserted reviewer,
**not** an authenticated browser session. Trusted local database-owner access
is required; the tool does not grant any application/service-role permissions.

## Apply, checkpoints and concurrency

Apply reclassifies the snapshot; it never executes a saved report or checkpoint.
Before inserts, a transaction locks relevant records/registry/storage metadata
tables and compares the complete snapshot. A concurrent change aborts rather
than applying stale ownership. Use an idle local environment; these locks and
the in-memory full snapshot are deliberately not a production-scale strategy.

Only verified candidates receive active typed bindings. New unresolved objects
in supported buckets receive `legacy_unclassified`, `staff_only`, no subject,
no uploader assumption and no binding. The existing signer rejects these
unbound assets even for staff; this is quarantine metadata, not a new staff
download interface. Unknown buckets remain report-only.
Existing rows are never overwritten or repurposed. Registry uniqueness and
snapshot checks make repeated apply a no-op; checkpoints are completion receipts,
not instructions to skip checks. A failed post-commit report/checkpoint write
is recoverable by re-inventory and repeating apply with a fresh output path.

Current broad Storage policies remain effective: staff-only here describes the
registry, **not full isolation of the underlying object**. Likewise a known
backfilled asset ID can use the existing signer once verified; legacy columns
continue their current rendering because they are not rewritten.

## Decisions required before production / 046

- Independently approved ownership evidence and historical origin inventory.
- Production read-only adapter, bounded pagination, backups and staged locking.
- Authorized-adult typed bindings (not available in 045).
- Shared-object handling; do not silently give one file multiple family bindings.
- Promotion of staff-only rows: 045 makes purpose immutable. This tool deliberately
  cannot turn a previously unclassified asset into a family-visible asset.
- Version/purpose validation for existing assets, original-file evidence retention,
  and future content scanning (magic bytes are not malware detection).
- Enrollment updates in 045 rebuild bindings; a later legacy update can detach
  a backfilled enrollment binding. Re-inventory before enforcement and address
  that compatibility behavior in a separately reviewed batch.
- Broad policies still allow object replacement after verification. The signer
  checks version, but final protection requires the later enforcement batch.
- Old signed bearer URLs and unchanged legacy columns require a separate rollout.

Never restore broad policies as a rollback for this tooling. No policy is changed
here. Stop apply, preserve reports, and investigate discrepancies. Do not delete
or mutate registry entries automatically as a recovery shortcut.
