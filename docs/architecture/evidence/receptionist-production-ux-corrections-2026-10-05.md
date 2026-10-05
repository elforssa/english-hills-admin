# Post-Outcome-3 receptionist UX corrections

2026-10-05 (Asia/Shanghai). **Tier 2: compatible presentation/read-model corrections.**

Owner request authorizes one focused correction PR from current main `05ef83c7427353019eb49c48900dd7044a2fcc7b`. The completed [O3-r2 contract](../plans/completed/outcome-3-receptionist-workspace.md) remains authoritative. This evidence supplements its [Production closeout](outcome-3-batch-2-implementation-2026-10-05.md#production-closeout--2026-10-05); it does not rewrite that acceptance.

## Scope and authorization

The bounded Production walkthrough reported inconsistent Casablanca appointment/task displays, Programme loss during debounced Search, indistinguishable staff options and a misleading attention link. The owner authorized compatible read additions after deployed ledger 108, explicitly excluding Production mutation, scheduling semantics, permissions, writes, conversion/finance changes and Meta activation.

On 2026-10-05 the owner additionally selected **“Use role plus a stable reference derived from the existing ID”** for same-name/same-role staff, in response to an explicit question describing the existing ID/name/role-only projection. No email or private profile fields are authorized or added. This is a presentation derivation of already-authorized operational data, not a new sensitive-field/role expansion.

## Corrections

| Finding | Root cause | Correction |
| --- | --- | --- |
| Casablanca disagreement | Calendar uses PostgreSQL civil values; Tasks/drawer/Board/List/placement summaries formatted UTC via browser ICU, whose timezone data can differ. Calendar also formatted visit end times in the browser. | Forward [109](../../../supabase/migrations/109_crm_operational_scheduled_display.sql) adds `local_date`/`local_time` to scheduled read projections and server civil end fields to Calendar. `scheduledLabel` formats these literal values without timezone reconstruction. UTC instants, task versions, ordering, cursor boundaries and write inputs stay intact. |
| Programme/Search filter loss | Delayed Search rebuilt URL state from a render snapshot; another committed edit could be overwritten. Other filter updates also unconditionally cleared stage. | Intra-route filters and drawer navigation compose from `window.location.search` and commit synchronously through Next-supported native History. The 250ms debounce stays. Unrelated filters, stage/layout and contact/lead context survive; changing channel still deliberately clears its dependent source facet. |
| Duplicate staff labels | The projection provided full-name fallback and role, while selectors often displayed name alone. Duplicate names can also span bounded staff pages. | `crm_list_staff` adds `display_label`: plain unique operational name, role for duplicate names, then shortest globally distinguishing Base32 reference from existing ID for duplicates in the same role. Shared `staffLabel` applies it to Opportunities, both Tasks selectors, drawer ownership and action reassignment. No raw UUID or private fields appear in normal option labels. |
| Attention wording | The link described only taskless prospects, but the fixed View also includes scheduled follow-up needing attention. | Use “À traiter · prospects nécessitant un suivi”; destination and attention predicate stay unchanged. |

The scheduled-display audit includes drawer next action, all open task pages, placement summaries, command-result next action, Tasks and opportunity cards/list. Historical activity/acquisition timestamps retain their existing presentation. Replayed immutable pre-109 command receipts can lack civil fields; the dialog reads the current bounded next task rather than reconstructing Casablanca from that receipt. Legacy unspecified placement time remains unspecified via the existing safe parser.

## Migration and authority

Migration **109_crm_operational_scheduled_display.sql** replaces only seven enumerated read/projection bodies and adds two private formatting helpers. Existing function signatures, execute grants, security mode/search paths, stored-role checks, RLS, triggers, commands and all business tables/data stay unchanged. Existing command receipts remain immutable. The historical 001–108 ledger is untouched.

Implementation is on `codex/receptionist-production-ux-corrections`. This document records source work; **109 is not deployed**. Production remains unchanged. Separate exact-SHA independent review and explicit owner release approval remain required. Merge/release hold remains in effect; this author performs no independent review or release operations.

## Verification evidence

All local database/browser checks use synthetic actors at `http://127.0.0.1:54321`, with no external email/provider delivery. Tests are extended in existing required CI lanes; the new stateful 108→109 check is wired into full database CI. This change uses full CI independently of Tier 2 classification.

Final local results and exact head/base/PR/CI scheduling references are recorded in the PR handoff. Required checks include focused SQL/server-oracle tests, fresh and stateful migration application, permission/RPC roles, Chromium and WebKit behavior, build, CI-parity timezone/locale/platform sweep, changed-Markdown checks and whitespace. A single focused author self-check precedes push. Remote CI scheduling is followed by an author stop; pending CI is not independent-review readiness or release approval.

### Final local acceptance

| Check | Result |
| --- | --- |
| `npm run test:crm-work-calendar`, `npm run test:crm-opportunities` | PASS; civil-only labels, shared staff rule, semantic/View guards. |
| `npm run test:crm-work-calendar-local` | PASS; rollback-only 10k opportunities/50k tasks, existing A14–A19/attention regressions, three same-instant probes including Casablanca offset transitions, unknown legacy time, 54 duplicate staff across pages and fixed safe response keys. |
| `npm run test:crm-opportunities-local` | PASS; phase-4/5/6/7 and Opportunities SQL, placement/enrollment/finance regressions; no retained fixture. |
| Fresh local migration reset through 109 | PASS. |
| Stateful local 108→109 via `scripts/test-crm-receptionist-ux-upgrade.mjs` | PASS; 68 public table hashes, existing grants/RLS/triggers and unrelated function bodies unchanged, with nonempty synthetic finance/enrollment/lifecycle facts. |
| `node scripts/test-crm-phase12-security.mjs` | PASS; 864 real local REST/table/RPC checks across nine identities, including staff/open-task reads and forged director metadata denial. |
| Opportunities browser `--behavior-only` | PASS Chromium + WebKit; Programme→immediate `TEST CRM` Search and reverse; actual URL/request args retain filters and stage/contact/drawer context; keyboard/Back/responsive/privacy checks. |
| `npm run test:crm-work-calendar-browser` | PASS Chromium + WebKit; forced divergent browser timezone formatter, identical visit start across Calendar/Tasks/drawer and server-derived visit end, same distinguishable staff labels across selectors; task pages/AND filters/stale version guards/attention/legacy/Back/responsive/reduced motion/error recovery/minute refresh; exact server shapes, no external requests; fixtures removed. |
| `npm run build` | PASS final runtime tree. |
| CI parity sweep | PASS unit labels under UTC/C, America/Los_Angeles/en_US and Asia/Shanghai/fr_FR; database stays the oracle under forced browser disagreement; scheduled `dateLabel` uses removed from affected paths; current URL composition audited; portability and navigation/component regressions pass. |
| CI classifier/gate/policy regressions | PASS, 14 tests. |
| Changed-Markdown links/anchors and `git diff --check` | PASS; final committed diff receives added secret/PII heuristics before push. |

**One focused author self-check completed:** inspected the final scoped diff, scheduled-time uses, response keys, stored-role guards/private helper ACLs, allowed read-body manifest and unchanged deployed migrations/predicates; reused stateful hash and role/browser evidence. Visual inspection confirmed the drawer's scheduled action and controls remain usable. No internal reviewer/subagent or formal independent review was performed.

The build/browser runtime source blobs were recorded before commit and are verified against the exact PR head in the handoff. Local logs and synthetic screenshots remain temporary local evidence, not customer exports or repository attachments. No finding remains intentionally unresolved; historical activity/acquisition formatting remains outside the requested scheduled-time correction.


## CI migration-ceiling correction — 2026-10-05

PR #102 remains on the same implementation branch. [Verify run 37310266569](https://github.com/elforssa/english-hills-admin/actions/runs/37310266569) passed classify, docs and app; local-database stopped at Synthetic 097 to current because its current-ledger assertion still expected 108. The owner authorized correcting current-ceiling assertions, sweeping the required scripts, and executing the complete remaining local-database chain before one corrective push. This is test/evidence maintenance within the existing Tier-2 outcome; the O3-r2 contract and owner authorization remain unchanged.

| Corrected script | Stale assumption corrected |
| --- | --- |
| [Batch-2 current upgrade](../../../scripts/test-crm-batch2-upgrade-current.sql) | Maximum version 108 → 109; explicit 098–108 list/count 11 → 098–109 list/count 12; both diagnostic messages updated. |
| [R4 migration-100 current upgrade](../../../scripts/test-crm-r4-upgrade-100-current.sql) | Maximum version 108 → 109; explicit 101–108 list/count 8 → 101–109 list/count 9; diagnostic range updated. |
| [R4 migration-102 current upgrade](../../../scripts/test-crm-r4-upgrade-102-current.sql) | Maximum version and expected-version diagnostic 108 → 109. |
| [H3 migration-103 current upgrade](../../../scripts/test-crm-h3-upgrade-103-current.sql) | Maximum version and “upgraded to current” label 108 → 109. |

### Comprehensive sweep classification

Searched all `scripts` and `.github` files for `108`, `max(version`, expected/current-108 wording, migration-ledger references and explicit ranges ending in 108. The four scripts above contained all stale current ceilings: four maximum-version assertions and two explicit list/count assertions. No other stale current ceiling was found.

| Remaining match family | Classification and reason |
| --- | --- |
| 097, 100, 102 and 103 setup maximum-version checks | Intentional historical baselines before applying the repository migrations. |
| Reconciliation repair maximum 105 | Intentional fresh 001→105 replay and stateful 104→105 fixture. |
| H3-04 count/maximum `106\|106` | Intentional exact provider seed at migration 106. |
| Opportunities maximum 106; Work/Calendar maximum 107 and migration-108 references | Intentional 106→107 / 107→108 stateful tests and migration-specific source assertions. |
| Receptionist UX maximum/baseline 108 and workflow reset `--version 108` | Intentional 108→109 stateful test; script and workflow preserved byte-for-byte. |
| Entries 108 in the two corrected explicit lists | Required intermediate migration in the expanded ranges ending in 109. |
| Release-health min/max/count query | Diagnostic inventory, with no asserted current ceiling. |
| Other individual historical ledger-presence checks and pre-055 fixture | Migration-specific coverage, not a current-version assertion. |
| `1086266294126723` in R4 fixtures; unrelated date/limit expressions | Synthetic form identifier or non-migration expression, not a ceiling. |

No migration, runtime code, historical O3 Batch-2 evidence, deployed migration filename or workflow was changed by this correction. Production remains unchanged; merge/release hold and separate independent-review requirements remain in effect.

### Corrected-chain validation

Executed the exact 13 remaining run blocks from `.github/workflows/verify.yml`, starting at Synthetic 097 to current and ending with the forced sharing-stop race matrix, sequentially on local synthetic Supabase (CLI 2.116.0, PostgreSQL 17.6), with external email disabled. No required later step was skipped.

| CI step | Local result |
| --- | --- |
| Synthetic 097 to current upgrade | PASS |
| Stateful 100 to revision-4 upgrade | PASS |
| Closed 102 to advisory 103 upgrade | PASS |
| Stateful 103 to H3-02 compatibility upgrade | PASS |
| H3-04 exact provider seed fresh, stateful upgrade, security and dormancy acceptance | PASS |
| Reconciliation repair fresh, stateful upgrade, concurrency and real HTTP acceptance | PASS |
| Rollback-only migration regression | PASS |
| Advisory D2 scope, safety and retention acceptance | PASS |
| H3-02 strict exported-second acceptance in both D2 modes | PASS |
| Lifecycle concurrency and CRM role matrix | PASS |
| Synthetic database and API role suites | PASS |
| CRM revision-4 isolated concurrency | PASS |
| Advisory R4 forced sharing-stop race matrix | PASS |

The synthetic/API step includes a fresh production build, Batch-3A/4A role/security checks, large-data reports/export, receptionist browser, lifecycle browser, the complete Opportunities/phase-4/5/6 browser sequence, and Work/Calendar in Chromium and WebKit. The final race suites remove fixtures via a local reset through 109. Local step logs are `/tmp/hills-102-ci-step-1.log` through `/tmp/hills-102-ci-step-13.log`, with the command/result manifest in `/tmp/hills-102-ci-results.json`.

Validation ran on parent `6a7aa492599c5dff3af79824bbb2b4a090617d2d` plus exactly the four SQL corrections above; this evidence is the only additional changed file. The corrective commit/PR handoff identifies the resulting exact HEAD. A targeted author re-check confirmed only current ceilings/range counts and matching diagnostics changed; intentional baseline fixtures, migration 109, runtime and workflow remain unchanged. Changed-Markdown links/anchors, added secret/PII heuristics and whitespace are checked before the single push. No independent review was performed; fresh full remote CI scheduling is followed by an author stop.

## Production closeout — 2026-10-05

**MERGED / DEPLOYED / PRODUCTION-COMPATIBLE.** This append-only closeout records authoritative release evidence supplied by the owner during PR #103's documentation correction. It is not a new Production inspection or operation by the documentation author. The source-only, pending-review and release-hold statements above describe the earlier authoring/CI chronology; this later closeout supersedes them for current release status without rewriting that history.

| Release fact | Recorded evidence |
| --- | --- |
| Correction PR / final reviewed head | [PR #102](https://github.com/elforssa/english-hills-admin/pull/102), `8f12f674f1c1fd910b8410b4bbb2d4d3b3917e3c` |
| Merge / Production source | Main `3c462f7fce87261ff92c565fecf8ab652262bb81` |
| Production deployment | Vercel `dpl_ADReczUnoX6hVYnh1KNJVeqqjz6X`, **READY**; Production aliases include `admin.english-hills.com` |
| Migration / ledger | `109_crm_operational_scheduled_display.sql` deployed; Production migration ledger normalized through **109** |
| Compatibility | All four corrections merged/deployed with matching frontend/read projections: server Casablanca civil scheduled display, composable filter/navigation state, safe staff labels and truthful Attention wording |

### Bounded Production verification

- One real center-visit sample returned consistent Casablanca civil time through Work Queue, Admissions Calendar and the drawer next-task projection. No customer identity or appointment details are reproduced here.
- The staff selector projection remained bounded; sampled display labels were unique. This is bounded sampling, not an exhaustive identity audit.
- `scheduled_civil` and `staff_reference` remained private helpers; Work Queue and Admissions Calendar RPC access remained as intended.
- Lifecycle cron remained inactive; activation epochs = **0**, external deliveries = **0**, external delivery attempts = **0**. Meta lifecycle remains dormant; no provider activation is implied.
- No recent Vercel runtime errors were found in release verification. This is a bounded observation, not a guarantee of future error-free operation.
- Public route probes reached the application/login successfully. **No fresh authenticated receptionist browser walkthrough was performed during release verification.** Earlier local synthetic browser evidence above remains separate.

Scheduling, authorization, business commands, finance and enrollment semantics remain unchanged. Outcome 3 itself was completed through migrations 107–108; deployed migration 109 is a later compatible post-O3 correction. Its original dated acceptance and the authoring/CI chronology above remain intact. [CURRENT_STATE](../../ai/CURRENT_STATE.md#post-outcome-3-receptionist-ux-correction-production-closeout) is the current authority; this closeout satisfies UIF-r1's #102 adoption/compatibility prerequisite, but does not approve UIF-r1 implementation or any later release.
