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
