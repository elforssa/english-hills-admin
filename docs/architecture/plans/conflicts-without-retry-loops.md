# Owner summary

## What will change

**Status: PROPOSED — revision NRC-r1, 2026-10-24. Tier 3. Architecture only: nothing is approved, implemented, merged or deployed.** This plan is Batch C of the read-only platform audit of 2026-10-24 (findings REL-1 and REL-4; the audit report is kept with the owner's project documents, outside this repository). It proposes the answer to the open owner decision on the [deterministic `40001` retry loop](../../ai/OWNER_DECISIONS.md#performance-plan-p-r1--approved-2026-10-08).

Two problems, one outcome: **a save never hangs and never creates a second copy.**

1. **Conflicts stop hanging the app (REL-1).** When two staff members change the same record, or a payment lands while an edit form is open, the database refuses the second save. Today 43 database functions refuse it with the error code `40001`. Our PostgREST version (before 16) treats `40001` as "try again" and re-runs the same request forever, about 100 times a second. The staff member's button spins forever, and one database connection stays busy until PostgREST restarts. This is what produced the ~391 million rolled-back transactions that ended on 2026-10-02. The fix gives every one of these refusals a different code, `PT409` ("conflict"), which PostgREST never retries. The refusal comes back at once, as HTTP 409, with the same message as today.
2. **Retrying a student creation stops creating duplicates (REL-4).** The student forms and the CSV import give each new learner a fixed identity before the first send, so a retry after a lost answer finds the learner already created instead of creating a second one. The import also remembers which rows already went in.

## What staff/users will be able to do

- When a record changed in the meantime, staff see a clear French message, "this record was changed, the page is refreshed, check and try again", within about a second, and the page reloads the latest data. Today they get an endless spinner.
- When another payment or enrollment for the same learner is in progress, staff see today's message ("Inscription ou paiement en cours…") at once.
- A receptionist, admin or director who clicks "Save" again after a network failure on a new learner gets the learner that was already created, never a second one.
- After a partial CSV import, the director sees which rows failed and can re-import only those. A finished import cannot be sent again by mistake.

## What remains restricted

- No role, permission, RLS policy or access rule changes. Every function keeps its owner, grants, `SECURITY DEFINER` setting and `search_path`.
- No business rule changes: every version check, lock and validation stays exactly where it is, with the same message. Only the error code changes.
- Nothing is retried automatically. A refused save is never replayed behind the staff member's back.
- No Production step is approved by this plan. Merge, migration, probes and any configuration each need the owner's separate approval.

## UI impact

Small. The CRM dialogs (actions, enrollment, placement test) already show a "refresh" message: they keep it and also recognise the new code. The receptionist forms for learners, groups, group assignment, enrollment documents and teachers currently show the raw English database text ("Student unavailable or stale"). They will show a French refresh message and reload instead. The receipt page keeps its French message. The student forms and the CSV import page change as described above; no new page or button.

## Database impact

One forward migration, `XXX_conflicts_without_retry.sql` (number chosen just before merge). It re-creates the 43 affected functions from their **latest** definitions, changing only `errcode='40001'` to `errcode='PT409'` (72 places), the one online helper argument `'40001'` to `'PT409'`, and the one handler in `crm_start_enrollment` that catches the old code. No table, column, index, policy, trigger, data, grant or schedule changes. REL-4 needs no migration.

## Important security decisions

- The new code is `PT409`, the PostgREST "custom HTTP status" code already used by migration 105 for the reconciliation conflicts. It is outside error class `40`, so no PostgREST version retries it.
- Messages and hints stay byte-identical. The browser still never renders raw database text in the CRM dialogs, and the new receptionist message is our own fixed French text.
- No catch-all exception handler is added. A real database failure keeps its own code.

## Risks / owner review points

- **First check the PostgREST version** (Supabase Dashboard → Settings → Infrastructure). If it is 16 or later, the hang cannot happen today and this batch becomes defence in depth (decision D1).
- **43 functions in one migration, including payment (`create_charge_payment`) and enrollment (`crm_start_enrollment`).** The change is mechanical and is proven mechanical by a test that compares each new body with the old one, but it touches finance and conversion code, hence Tier 3.
- **Overlap with other batches.** Batches D and E will also redefine some of these functions. Whichever merges second must start from the other's definition; the CI guard stops anyone from bringing `40001` back.
- **Online learning.** Its approved plan says "`40001` on a stale version". This plan changes that line for the two online helpers (decision D4).
- **During the release window**, if the database is migrated before the app is deployed, staff can briefly see a less helpful message, never a hang. The plan deploys the app first to avoid even that.

# Plan detail

## Inputs, baseline and evidence limits

- Repository `elforssa/english-hills-admin`, baseline `origin/main` at `ba009b4` (fetched 2026-10-24). Latest migration on main and in the Production ledger: `118_online_close_course_room_ref.sql` ([CURRENT_STATE](../../ai/CURRENT_STATE.md)).
- Findings: audit REL-1 (High; Low if PostgREST ≥ 16) and REL-4 (Medium), with the verifier's corrections (41 functions outside the online module, plus 2 online helpers).
- Prior evidence: the [performance audit](../evidence/performance-audit-2026-10-08.md#391m-service_role-set_config-calls) (391,321,445 looping calls, ≈100/s, ended 2026-10-02 05:16 UTC; local reproduction on PostgREST 14.5: no response within 6 s, loop continued after the client left) and the [stale-lease repair](completed/crm-meta-reconciliation-stale-lease-repair.md) (migration 105, the `PT409` precedent, Production verified 2026-10-02).
- **Production, read-only catalog queries only** (project `hopcezradkhrixwwswxn`, 2026-10-24 about 06:30 UTC, no row data): the inventory below; `default_transaction_isolation = read committed`, no role-level isolation override, no function sets an isolation level; `pg_stat_database` `xact_commit` 2,922,079, `xact_rollback` 391,314,429 (frozen at its 2026-10-02 value: no loop running); 2 functions already raise `PT409` (migration 105); `authenticated` may insert `students.id` (default `gen_random_uuid()`).
- **Evidence limits.** The Production PostgREST version is not readable through SQL and was not checked (dashboard only). The repo-to-Production equality of each function body is established here only by the `md5(prosrc)` prefixes recorded below; the implementer must prove it (see the contract). This architecture task ran no local database and no HTTP reproduction (no Docker on the authoring machine).

## Why `40001` hangs and the other codes do not

PostgREST before version 16 runs each request inside a transaction wrapper that re-runs the whole transaction when PostgreSQL reports SQLSTATE `40001` (serialization_failure), with no retry limit (upstream issue #3673, fixed by PR #4222 in PostgREST 16; Supabase troubleshooting guide "SQLSTATE 40001 … causes infinite retries"). A real serialization failure eventually succeeds on retry. A `40001` that a function raises on purpose because a version is stale fails identically on every retry. The `authenticated` 8 s `statement_timeout` does not help: each retry is a new short statement. `PT409` is a PostgREST custom-status code: PostgREST answers HTTP 409 with `{code:'PT409', message, details, hint}` and does not retry it.

## Inventory (Production, 2026-10-24)

`pg_proc` where `prosrc ~ '''40001'''`: **43 functions, 72 raise sites** (6 `crm_security`, 2 `online_security`, 35 `public`). No function raises any other class-40 code, raises `serialization_failure` by name, or sets a dynamic error code to `40001` except the online helper argument. Exactly one function catches the code (`crm_start_enrollment`, `when serialization_failure`).

Classes of raise:

- **V — stale version.** The caller's `version` or `updated_at` no longer matches. Deterministic: retrying the same request can never pass.
- **S — state no longer valid.** The row is gone, already resolved, no longer open. Deterministic.
- **L — lease lost.** A worker's lease expired or was replaced. Deterministic (the migration-105 case).
- **I — internal invariant.** `lifecycle_barrier` refuses a non-READ-COMMITTED transaction or a barrier upgrade. Deterministic for a given request; unreachable in normal operation.
- **B — busy.** Another payment, enrollment or Insights run holds the lock or slot. Transient: a retry eventually passes, but PostgREST would spin about 100 times a second until then and then **silently replay a staff action** that the design wants the person to re-check ([outcome-3 rule](completed/outcome-3-receptionist-workspace.md): never auto-replay stale business intent).
- **C — concurrency translation.** A caught `deadlock_detected` (`40P01`) or `unique_violation` (`23505`) re-raised as `40001`. Transient, but the retry re-runs the version checks, which then fail deterministically (a loop today) or silently replays the action.

**Totals: V 30, S 14, L 13, I 2 (59 deterministic); B 6, C 7 (13 transient). None of the 72 is a genuine serialization failure.** PostgreSQL itself can raise a genuine `40001` only under REPEATABLE READ or SERIALIZABLE, which nothing here uses. The plan leaves any engine-raised `40001` untouched (no catch-all), so a future genuine one keeps its meaning.

Access: **auth** = `authenticated` may execute (browser-reachable); **svc** = `service_role` only (server workers); **internal** = helper with no client grant, reached through the callers listed. "Latest" = the newest migration on main that defines the function; "md5" = prefix of Production `md5(prosrc)`, for drift detection.

| # | Function | Access | Latest | md5 | Sites | Classes |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `crm_security.accept_external_submission` | internal (via `crm_resolve_meta_intake`, Meta/website intake resolution) | 103 | `ef6719fac721` | 3 | S S S |
| 2 | `crm_security.command` | internal (via 14 CRM command RPCs, below) | 111 | `f22a288ccd9d` | 5 | V S V S C |
| 3 | `crm_security.finish_task` | internal (via `command`, placement, decision, enrollment) | 080 | `29ff62274451` | 1 | S |
| 4 | `crm_security.lifecycle_barrier` | internal (via lifecycle, mapping and connection RPCs) | 103 | `676538a400f9` | 2 | I I |
| 5 | `crm_security.lifecycle_lock_delivery` | internal (via delivery worker RPCs, `crm_retry_external_delivery`) | 103 | `02c6c9a459c6` | 1 | S |
| 6 | `crm_security.lock_enrollment_intent` | internal (via `crm_start_enrollment`) | 084 | `bd6aed9ffd6c` | 1 | B |
| 7 | `online_security.course_for_update` | internal (via 8 `online_*` RPCs) | 117 | `272f526ce2a7` | 1 | V |
| 8 | `online_security.lesson_for_update` | internal (via 8 `online_*` RPCs) | 117 | `32e50dd4fd05` | 1 | V |
| 9 | `append_receptionist_enrollment_document` | auth | 096 | `67a6a8e0fefb` | 1 | V |
| 10 | `assign_receptionist_student_group` | auth | 096 | `41de4d0d7950` | 2 | V V |
| 11 | `create_charge_payment` | auth, svc | 096 | `1eb9803e55f3` | 1 | B |
| 12 | `crm_begin_external_attempt` | svc | 103 | `e68ef1546ee4` | 4 | L L S S |
| 13 | `crm_block_external_delivery` | svc | 103 | `919d69a01083` | 1 | L |
| 14 | `crm_book_placement_test` | auth | 083 | `13acaf5a5d06` | 5 | V V S C C |
| 15 | `crm_configure_insights` | auth | 114 | `44eefd72ba88` | 2 | V B |
| 16 | `crm_configure_lifecycle` | auth | 103 | `4792cd2d279d` | 1 | V |
| 17 | `crm_disable_lifecycle` | auth | 103 | `1e6e5ba6f1c6` | 1 | V |
| 18 | `crm_fail_insights_sync` | svc | 114 | `e48c400e2111` | 1 | L |
| 19 | `crm_fail_meta_job` | svc | 086 | `e2f4c082d79e` | 1 | L |
| 20 | `crm_finalize_meta_job` | svc | 115 | `ff8d8fc597e9` | 1 | L |
| 21 | `crm_finalize_website_job` | svc | 103 | `6c3fbce16582` | 1 | L |
| 22 | `crm_finish_external_attempt` | svc | 103 | `6791537b4281` | 2 | L S |
| 23 | `crm_finish_insights_sync` | svc | 089 | `46ea7093e9ee` | 1 | L |
| 24 | `crm_get_external_delivery` | svc | 103 | `63538c191fa2` | 1 | L |
| 25 | `crm_get_meta_job_mapping` | svc | 087 | `aaa1fccde839` | 1 | L |
| 26 | `crm_get_website_job_mapping` | svc | 087 | `c24096f9a773` | 1 | L |
| 27 | `crm_prepare_external_delivery` | svc | 103 | `370c739df7e9` | 2 | L S |
| 28 | `crm_publish_lifecycle_policy` | auth | 103 | `f0625edf73a8` | 1 | V |
| 29 | `crm_record_conversation_decision` | auth | 111 | `8954fc9c7393` | 3 | V V C |
| 30 | `crm_request_insights_sync` | auth (called by the Insights server route) | 114 | `a5d610f09502` | 1 | B |
| 31 | `crm_resolve_meta_intake` | auth | 103 | `61ba12ff216e` | 3 | S V V |
| 32 | `crm_retire_lifecycle_policy` | auth | 103 | `86cd7355248e` | 1 | V |
| 33 | `crm_retry_insights_sync` | auth | 114 | `b944b7afa1fa` | 1 | B |
| 34 | `crm_save_meta_connection` | auth | 115 | `9b1e7e823bbc` | 1 | V |
| 35 | `crm_save_website_connection` | auth | 103 | `a8ed255b4757` | 1 | V |
| 36 | `crm_start_enrollment` | auth | 117 | `d57a2c17f48b` | 5 | B V V V C, plus the handler |
| 37 | `crm_update_placement_test` | auth | 083 | `07119a07d240` | 3 | V C C |
| 38 | `save_receptionist_group` | auth | 096 | `f11e18fe28d5` | 1 | V |
| 39 | `save_receptionist_premium_attendance` | auth (no UI caller since Premium Release A) | 096 | `aa951cf0ef96` | 2 | V S |
| 40 | `save_receptionist_premium_membership` | auth (no UI caller) | 096 | `723a75da48ab` | 1 | V |
| 41 | `save_receptionist_premium_session` | auth (no UI caller) | 096 | `49bce6f952da` | 1 | V |
| 42 | `save_receptionist_student` | auth | 096 | `b8ded89b3586` | 1 | V |
| 43 | `save_receptionist_teacher_operations` | auth | 096 | `fd4ad0cf194e` | 1 | V |

Functions 9–43 are in `public`. All 43 are PL/pgSQL, owned by `postgres`, `search_path=pg_catalog, pg_temp`; all `public` ones are `SECURITY DEFINER`.

**Reached through the helpers (fixed by fixing the helper, no redefinition):** the 14 `authenticated` CRM commands `crm_add_note`, `crm_cancel_task`, `crm_close_lost`, `crm_close_not_qualified`, `crm_complete_task`, `crm_create_followup_policy`, `crm_create_manual_lead`, `crm_qualify_lead`, `crm_reassign`, `crm_record_call_outcome`, `crm_record_conversation`, `crm_record_whatsapp`, `crm_reopen_lead`, `crm_schedule_task` (via `command`); the `authenticated` lifecycle and mapping RPCs `crm_bind_pending_lifecycle_stop`, `crm_publish_meta_form_mapping`, `crm_publish_website_form_mapping`, `crm_retire_meta_form_mapping`, `crm_reconcile_external_deliveries`, `crm_revoke_lifecycle_evidence`, `crm_stop_lifecycle_sharing`, `crm_retry_external_delivery` (via the barrier or the delivery lock); and the 8 `online_*` RPCs. In total about 53 browser-reachable entry points can return one of these refusals.

## Scope and non-goals

In scope: the 43 functions above (decision D4 confirms the 2 online helpers and the 3 Premium functions); the browser and server code that reads the old code; student-creation idempotency in the receptionist form, the staff form and the CSV import; a CI guard; tests; the runbook line.

Not in scope: any change to a version check, lock, message, hint, validation, grant or RLS policy; the PostgREST version upgrade itself (an owner dashboard action); a soft duplicate-person check (decision D5); the admin routes `update-role` and `invite`, which already map an engine `40001`/`40P01` to HTTP 409 and call none of these functions; the online module's release steps; Batches D and E's own changes to overlapping functions.

## Design

### SQL contract

1. Every `using errcode='40001'` in the 43 latest bodies becomes `using errcode='PT409'`. Message, `hint` and position stay byte-identical.
2. In both online helpers, `online_security.fail('stale', '40001', …)` becomes `online_security.fail('stale', 'PT409', …)`. `online_security.fail` itself is unchanged (it passes the code through and adds the `online.<reason>` hint).
3. In `crm_start_enrollment`, `exception when serialization_failure then` (around `lock_enrollment_intent`) becomes `exception when sqlstate 'PT409' then`. The message comparison, the re-raise with hint `crm_enrollment.enrollment_in_progress` and the trailing `raise;` stay.
4. Nothing else changes in any body. Signatures, argument names, defaults, return types, volatility, `SECURITY DEFINER`, `search_path`, owner and ACL stay identical (`create or replace` keeps the owner and ACL).

Result: PostgREST returns HTTP **409** with `code: 'PT409'` and today's message and hint. Classes B and C (busy, deadlock, unique violation) also use `PT409` (decision D3): staff get today's "refresh / try again" text instead of a silent replay.

### Browser and server contract

One small shared module, `src/lib/conflictErrors.mjs`:

- `CONFLICT_CODE = 'PT409'`;
- `isRecordConflict(error)` is true for `PT409` **or** the legacy `40001` (so the app works against the database before and after the migration, and in mixed-version windows);
- `recordConflictMessage()` returns the fixed operational text: "Cette fiche a été modifiée entre-temps. Les informations sont actualisées : vérifiez puis recommencez."

Surfaces:

| Surface | Today | Change |
| --- | --- | --- |
| [enrollmentErrors.mjs](../../../src/lib/crm/enrollmentErrors.mjs) | `40001` → recovery `refresh`; `discardsRequestKey` for `22023/42501/40001` | Use `isRecordConflict`; add `PT409` to the discard list. Hint-based reasons are already code-agnostic. |
| [presentation.mjs](../../../src/lib/crm/presentation.mjs) `commandError` | `40001` → "Ce prospect a changé…" | Use `isRecordConflict`; same text. |
| `src/components/crm/CrmActionDialog.jsx` | Throws a synthetic `{code:'40001'}` after its stale preflight; refreshes on `40001` | Throw `{code: CONFLICT_CODE}`; refresh on `isRecordConflict`. |
| `src/components/crm/CrmEnrollmentDialog.jsx` | Two `err.code === '40001'` branches | `isRecordConflict`. |
| `src/components/placement/PlacementTestModal.jsx` | Refresh on `40001` | `isRecordConflict`. |
| `src/lib/online/reasons.mjs`, `src/lib/online/handlers.mjs` | Hint first; `40001` fallback → `stale` | Fallback uses `isRecordConflict`. |
| Receptionist forms: `ReceptionistStudentForm.jsx`, `ReceptionistTeacherForm.jsx`, `(admin)/groups/page.jsx`, `(admin)/groups/[id]/page.jsx`, `(admin)/students/page.jsx`, `(admin)/students/[id]/page.jsx` | `toast.error(error.message)` shows raw English ("Student unavailable or stale") | On `isRecordConflict`: toast `recordConflictMessage()` and refetch the affected record/list (invalidate its query). Other errors keep today's handling. |
| Receipts: `paymentErrorMessage` in `src/lib/receiptPresentation.js` | Shows the server message (the busy message is already French) | Unchanged text for the known busy message; any other `isRecordConflict` → the busy text "Un paiement ou une inscription est en cours pour cet apprenant. Actualisez puis réessayez." The idempotency key is kept (a definite rejection stored nothing). |
| `LifecycleOperations.jsx`, `MarketingInsightsPanels.jsx` | Generic French "actualisez" text in `catch` | No change. |
| Server: `metaRpcError` in [protocol.mjs](../../../src/lib/crm/meta/protocol.mjs) | Exact migration-105 `PT409` tuples; anything else → `storage_unavailable` | No change: an unknown `PT409` from a worker RPC (classes L/S) maps to `storage_unavailable`, exactly as `40001` does today. Add a test proving that. |
| Reads: `src/lib/queryRetry.mjs` | `PT409` already "answered" (one retry) | No change. |
| [CRM operations runbook](../../crm-operations-runbook.md) | "A `40001` means refresh/review" | "A `PT409` (legacy `40001`) means refresh/review." |

`isDefiniteRejection` already accepts `PT409` (five characters, `[0-9A-Z]`), so the enrollment dialog keeps its "definite vs uncertain" contract.

### Student creation without duplicates (REL-4)

Verified current state: `save_receptionist_student` (096) is already idempotent by id (`on conflict on constraint students_pkey do nothing`, identical-payload replay, `23505 Student create identity conflict` on a different payload). The duplicates come from the browser: `ReceptionistStudentForm` mints `crypto.randomUUID()` inside each submit; `StudentForm` and the import call `entities.Student.create`, which strips any `id`; the import resends every row on a second click.

Design:

1. **One identity per new learner, created once.** Each create form holds a stable id from [stableIdempotencyKey.mjs](../../../src/lib/stableIdempotencyKey.mjs) in a `useRef`, created on mount and kept until a confirmed success. It does not change when the staff member edits the form after an uncertain failure.
2. **Receptionist form:** sends that id to `save_receptionist_student` (no SQL change). On `23505` with message `Student create identity conflict`, it shows "Cet apprenant a déjà été créé lors d'un envoi précédent. Ouvrez sa fiche pour le modifier." and opens `/students/<id>`.
3. **Admin/director form and import:** a new helper `createStudentOnce(id, payload)` in `src/lib/studentCreate.mjs` inserts with the given id (allowed: `authenticated` has INSERT on `students.id`; RLS "students admin insert" applies unchanged). On `23505` naming `students_pkey` it reads the row by id: if it exists and is not deleted, the result is `{row, replayed: true}` (and, when the stored name or birth date differs from the payload, the same "déjà créé" message and link as point 2); otherwise the error is rethrown. Random ids make a foreign collision practically impossible, so a primary-key conflict on our own id can only mean our earlier send committed.
4. **CSV import page:** assigns each parsed row a random id at parse time; keeps a per-row status (`pending`, `imported`, `failed` with a safe reason); the Import button sends only `pending` and `failed` rows; after every row is imported it shows "Import terminé" and is disabled until a new file is chosen; the summary lists failed rows by CSV line number. The row logic lives in a pure module `src/lib/studentImport.mjs` so it can be unit-tested. Choosing a new file starts a new import with new ids (a deliberate re-import of the same file is a human double entry, decision D5).

No migration, no change to `entities.js` defaults for other tables.

### Migration approach

- **One forward migration**, `supabase/migrations/XXX_conflicts_without_retry.sql`, number allocated just before merge from the ledger and open PRs. Migrations 001–118 stay byte-for-byte unchanged.
- **Built from the latest cumulative definitions, never an earlier snapshot.** The implementer resets a local database to the current ledger, takes `pg_get_functiondef` for each of the 43 functions (as migration 113 did), first proves each local `md5(prosrc)` prefix equals the Production prefix in the inventory (any difference stops the work: drift), applies the three substitutions above, and commits the resulting static SQL. No dynamic `DO` block that rewrites `pg_proc` at migration time: the reviewed file must be the exact SQL that runs.
- **Atomic:** the migration runs in one transaction, so `lock_enrollment_intent` and the `crm_start_enrollment` handler change together.
- **If another batch lands first** (D, E, Premium Release B, online), rebuild from the new latest definitions and re-prove; a function dropped by Premium Release B leaves the list.

### CI guard

Two checks, both in the existing `full` lane:

1. **Catalog check (local-database job, after migrations apply):** zero functions in application schemas (`public`, `crm_security`, `online_security`, `operational_security`, `storage_security` and any other non-extension schema) whose `prosrc` contains `'40001'` or `serialization_failure`. This covers the cumulative state, including a later function that re-introduces the code.
2. **Static check (fast, `npm test`):** no migration numbered after this one, and no file under `src/`, contains `'40001'` outside `src/lib/conflictErrors.mjs` (where the legacy code is accepted on read only) and the two admin routes `update-role` and `invite` (which map engine-raised `40001`/`40P01` to HTTP 409 and are out of scope). Historical migrations are immutable and excluded by number.

Batch A of the audit plans "a guard against new `40001` raises". If it lands first with an allowlist of today's 43 functions, this batch empties that allowlist and turns it into the zero rule above instead of adding a second guard.

## Security boundaries

Unchanged: owners, ACLs, `SECURITY DEFINER`, `search_path`, RLS, revoked direct table access, worker authorization (`require_meta_worker`), receptionist and director checks, the closed hint vocabularies (`crm_enrollment.*`, `online.*`). Error messages carry no data (existing fixed strings). The new receptionist message is fixed French text; raw database text stops being shown in those forms, which is a small improvement. REL-4 adds no privilege: the insert path and its RLS policy are the existing ones, and the read-back after a conflict uses the existing admin/director read.

## Test strategy

Local Supabase only (`http://127.0.0.1:54321`), synthetic data, external email disabled. The authoring machine has no Docker, so the local-database suites run in CI; the implementer records the CI run as the evidence.

| Test | What it proves |
| --- | --- |
| **Mechanical-diff test** (SQL, CI upgrade job: reset to the previous ledger, snapshot, apply) | For each of the 43 functions: new `prosrc` equals old `prosrc` with exactly the three substitutions; owner, ACL, `prosecdef`, `proconfig`, argument names/types/defaults and return type unchanged; no other function's body changed. |
| **Former-`40001` paths return at once over real HTTP** (new `scripts/test-no-retry-conflicts-local.mjs`, modelled on `test-crm-meta-reconciliation-repair-local.mjs`) | For every `auth` function in the inventory, at least one stale case through supabase-js as a synthetic local staff user (receptionist or director as each function requires), plus representative indirect callers (`crm_complete_task` via `command`, an `online_*` command), plus the `svc` worker RPCs with a stale lease as `service_role`: response in under 2 s (the call is aborted and the test fails at 5 s), HTTP 409, `code 'PT409'`, today's exact message and hint, no row changed. After a 3-second quiet period, `pg_stat_database.xact_rollback` grew by no more than the number of calls plus a small margin, and no `authenticator` backend is still active. A normal successful call afterwards proves the server still serves requests. The test records the local PostgREST version; on the CI stack (Supabase CLI 2.116.0, PostgREST 14.5, which does retry `40001`), a prompt answer is the proof that the code is no longer retried. No deliberate `40001` storm is reproduced. |
| **Busy and concurrency paths** (extend `scripts/test-crm-rcc-a2-concurrency.py` and the phase-6 concurrency test) | A held enrollment-intent lock gives `PT409` + `crm_enrollment.enrollment_in_progress` at once, for `crm_start_enrollment` and `create_charge_payment`; a forced deadlock or unique violation in placement/enrollment gives `PT409` with today's message and hint. |
| **Existing suites updated** | Every SQL/JS/Python test that asserts `40001` for these paths (about 24 files, for example `test-crm-rcc-a2.*`, `test-crm-phase3/4/5/6/8/10/11.sql`, `test-online-learning.sql`, `test-online-unit.mjs`, `test-crm-phase12-security.mjs`, `test-query-retry.mjs`) asserts `PT409`. JS mapper tests assert both `PT409` and legacy `40001`. The browser "no raw text" regex adds `PT409`. |
| **JS unit** | `conflictErrors.mjs`; enrollment mapper (refresh and key discard on both codes); `commandError`; online fallback; `paymentErrorMessage`; receptionist message mapping; `metaRpcError` maps an unknown `PT409` exactly as `40001` today. |
| **REL-4 unit and local DB** | `createStudentOnce`: success; `23505 students_pkey` → read-back replay; differing stored fields → "déjà créé"; uncertain failure keeps the id. `studentImport.mjs`: ids fixed per row; second click sends only failed rows; completed import locked; failed rows listed by line. Local DB: two inserts with the same id give one row; `save_receptionist_student` same-id replay returns the same row. One browser test: a receptionist edit made stale by a second session shows the French conflict text and reloads. |
| **CI guard regression** | The catalog check fails on a temporary local function containing `'40001'`; the static check fails on a fixture string. |

## Rollout, recovery and rollback

Release steps, each needing the owner's explicit approval at the time (Tier 3):

- **R0 — check the PostgREST version** in the dashboard and record it (owner, no code). If an upgrade to ≥ 16 is offered, it can be done independently; this batch still proceeds if D1 says so.
- **R1 — merge and deploy the app first.** The new app accepts both `PT409` and `40001`, so it behaves as today against the unmigrated database. Avoid an online-learning R4 switch-on window and any other migration release on the same day.
- **R2 — apply the migration** through the guarded wrapper used for 117/118 (`supabase db query --linked`, ledger row, stored statement MD5 equal to the reviewed file), within the same approval window, after R1 is READY.
- **R3 — Production verification, read-only:** `pg_proc` count with `'40001'` = 0 and with `'PT409'` = 45 (43 + the two from 105); the 43 `md5(prosrc)` values changed and no other function changed; owner/ACL/`prosecdef`/`proconfig` unchanged; ledger row and MD5. Optional bounded probe, approved separately: one non-mutating stale call as the director (for example `crm_configure_insights` with an all-zero connection id, which refuses at the "Refresh connection" branch) returning HTTP 409 `PT409` at once.
- **R4 — passive observation** for at least 30 minutes of normal use, then the next working day: `xact_rollback` follows normal traffic; Postgres logs show no repeating conflict message; no staff report of a spinning save.

Recovery:

- **Migration fails:** it is one transaction; nothing changes. Diagnose, fix by reviewed revision, re-approve.
- **App regression after R1:** roll back to the previous Vercel deployment. With the migration not yet applied, nothing else changes. With the migration applied, the old app sees `PT409`: the CRM dialogs show their generic text instead of the refresh text and the receptionist forms show today's raw message. That is less helpful but never hangs; fix forward.
- **Never restore `40001`.** A database rollback to the old code would bring back the hang; any SQL correction is a reviewed forward migration.
- **Until release (interim runbook).** If saves spin and `select xact_rollback from pg_stat_database where datname = current_database()` climbs by about 100 a second, a loop is running: restart PostgREST from the Supabase dashboard (or terminate the looping `authenticator` backend after identifying it), with the owner's approval, then record the function from the Postgres logs. This is the existing recovery path recorded for the 2026-10-02 incident.

## Risk tier

**Tier 3.** One migration replaces 43 existing Production functions, including the payment entry point (`create_charge_payment`), CRM enrollment conversion (`crm_start_enrollment`), lead commands and scheduler workers. The change is mechanical, but these are finance and conversion-integrity paths. Full flow: owner approval of this plan → separate implementation → CI → fresh independent review of the exact head → owner merge and release approval → release/operator → Production verification → closeout.

## Expected modules

`supabase/migrations/XXX_conflicts_without_retry.sql`; `src/lib/conflictErrors.mjs` (new); `src/lib/studentCreate.mjs` (new); `src/lib/studentImport.mjs` (new); `src/lib/crm/enrollmentErrors.mjs`; `src/lib/crm/presentation.mjs`; `src/lib/online/reasons.mjs`; `src/lib/online/handlers.mjs`; `src/lib/receiptPresentation.js`; `src/components/crm/CrmActionDialog.jsx`; `src/components/crm/CrmEnrollmentDialog.jsx`; `src/components/placement/PlacementTestModal.jsx`; `src/components/students/ReceptionistStudentForm.jsx`; `src/components/students/StudentForm.jsx`; `src/components/teachers/ReceptionistTeacherForm.jsx`; the four `(admin)` pages named above plus `(admin)/students/import/page.jsx`; tests under `scripts/`; `package.json` and `.github/workflows/verify.yml` only to wire the new tests and the catalog check; docs listed in the contract.

## Owner decisions required

**D1 — Close the open `40001` decision (blocking).**
- Question: the [OPEN entry](../../ai/OWNER_DECISIONS.md#performance-plan-p-r1--approved-2026-10-08) asks whether to fix the deterministic `40001` raises (option A) or accept the risk (option B).
- A: do this batch now, whatever the PostgREST version. B: do it only if the dashboard shows PostgREST below 16; otherwise accept and park it. C: accept the risk.
- Consequences: A makes the guarantee independent of the platform version and keeps local/CI (PostgREST 14.5) equal to Production; it costs one Tier-3 release. B saves that release if Production is already ≥ 16, but local and CI keep the hanging behaviour and a future platform change could bring it back. C leaves the hang that already caused one incident.
- **Recommendation: A.** If the dashboard shows ≥ 16, A stays right but the batch can wait behind D.

**D2 — The replacement code (blocking).**
- A: `PT409` (HTTP 409 Conflict), as migration 105. B: `P0001` with a hint (HTTP 400). C: a custom code such as `EH409` (HTTP 400).
- Consequences: A is already understood by the code base and its tests, gives the right HTTP status and is guaranteed non-retryable. B and C work too but return HTTP 400, which mixes conflicts with validation errors in logs and monitoring.
- **Recommendation: A.**

**D3 — Busy locks, deadlocks and unique violations (classes B and C, 13 sites) (blocking).**
- A: `PT409` too: staff see today's "in progress / refresh" message and decide. B: keep `40001` there, so PostgREST retries until it passes.
- Consequences: B silently replays a payment or enrollment after someone else's concurrent change, spins at about 100 transactions a second meanwhile, and can still loop forever when the retry hits a stale version; it also behaves differently on PostgREST ≥ 16, which never retries. A is predictable and keeps the existing "never auto-replay" rule.
- **Recommendation: A.**

**D4 — Include the 2 online helpers and the 3 Premium functions (blocking for scope).**
- A: include all five. B: leave the online helpers to the online-learning plan, and/or leave the Premium functions to Premium Release B.
- Consequences: A gives a zero-`40001` rule that CI can enforce without exceptions, and amends one line of the approved online plan ("`40001` on a stale version" becomes `PT409`; its browser code already reads the `online.stale` hint first). The online functions are live with the switch off and will be reached by staff from R4. The Premium functions are still executable by staff even though no screen calls them; if Release B drops them first, they simply leave this list. B needs an allowlist in the CI guard and leaves the hazard in place until those plans act.
- **Recommendation: A.**

**D5 — A soft duplicate-person check (not blocking).**
- A: defer. B: also warn, in the import preview and the new-learner form, when a learner with the same normalised name and birth date already exists.
- Consequences: this batch already stops duplicates caused by retries. B targets a different problem (the same person typed twice, or the same file re-imported on another day); Production has 0 such duplicates today (audit). B adds a lookup and UI, and reading all learners is itself a known performance concern (REL-3).
- **Recommendation: A (defer)**, revisit with Batch G.

**D6 — Release order (not blocking).**
- A: app first, then the migration in the same window. B: migration first, then the app.
- Consequences: A has no degraded moment, because the new app reads both codes. B gives a few minutes where CRM dialogs show generic text instead of the refresh text (no hang).
- **Recommendation: A.**

## IMPLEMENTATION CONTRACT

**Prerequisites.** Owner approval of this plan revision with answers to D1–D4 (D5, D6 default to the recommendation unless the owner says otherwise), recorded in this plan with the date and the approved head SHA. Batch 1 (CI unblock) merged so that full CI can pass. Fresh `origin/main`; migration number allocated just before merge; any batch merged since NRC-r1 that redefines an inventory function is folded in by rebuilding from its definition.

**Scope.** Exactly the SQL contract, the browser/server contract, the REL-4 design, the CI guard, the tests and the docs listed here. Nothing else.

**Object manifest.** The 43 functions in the inventory (fewer only if D4 = B or a function has been dropped by another release, recorded in the PR). No other database object.

**Invariants.**
1. After migration, no function in an application schema contains `'40001'` or `serialization_failure`; every former site raises `PT409` with the same message and hint.
2. Every new body equals the latest prior body with only the three substitutions; owner, ACL, `SECURITY DEFINER`, `search_path`, signature and return type unchanged.
3. Each local pre-migration `md5(prosrc)` prefix equals the Production prefix in the inventory, proven before writing the migration. Any mismatch is a STOP.
4. No new catch-all handler; engine errors keep their codes.
5. The browser accepts both `PT409` and `40001` as a record conflict and never shows raw database text for one; request keys are discarded on a conflict exactly as on `40001` today.
6. A new learner has one id from the first send to confirmed success; a retry can never insert a second row; a completed import cannot be re-sent.
7. Migrations 001–118 and every earlier test contract outside the `40001` → `PT409` assertions stay unchanged.

**Acceptance.** All tests in the test strategy pass in required CI for the exact head; the HTTP test proves every `auth` inventory function answers a stale call with HTTP 409 `PT409` in under 2 s on the CI stack; the mechanical-diff test passes for all 43; the CI guard is active and its regression proves it fails on a reintroduced `40001`.

**Stop conditions.** Production-vs-local body drift; a function in the inventory whose latest definition cannot be identified; a need to change any message, hint, check, lock, grant or policy; a test that would need a weakened assertion; a sibling batch's unmerged migration redefining the same function (coordinate, do not race); any Production action (all are release steps with separate approval).

**Docs and status reporting.** Update the [CRM operations runbook](../../crm-operations-runbook.md) line on `40001`; [WORKFLOWS](../../ai/WORKFLOWS.md) and [ARCHITECTURE](../../ai/ARCHITECTURE.md) where they describe conflict handling; the online plan's stale-version line (if D4 = A); [ADR-009](../decisions/ADR-009-conflicts-never-retryable.md) status; this plan's implementation record; CURRENT_STATE only at release closeout. Report with the AGENTS implementation handoff: branch, head SHA, PR, tier, migration filename, CI run, local tests (and that local-database suites ran only in CI), open decisions.
