# UIF-r1 implementation evidence — 2026-10-06

Implementation began 2026-10-05; verification/handoff continued 2026-10-06 (Asia/Shanghai). Owner implementation approval was recorded 2026-10-05.

## Scope and authority

One Tier-2 outcome on `codex/ui-foundation-implementation`, from fetched/verified main `b8fe8eb31659358e9c2817e0f5740716bc29f6d5` (PR #103). The owner explicitly approved [UIF-r1](../plans/english-hills-ui-foundation.md) / [ADR-005](../decisions/ADR-005-operational-ui-foundation.md) in the implementation task. Substantial shared presentation and navigation/read-state handling justify Tier 2; existing sensitive read/write authority and formulas remain unchanged. No database migration, new RPC, permission, endpoint or provider activation.

Source implementation, merge, deployment and Production verification are separate. This task has no merge/release authority, performs no Production action and creates no independent-review verdict. The PR handoff supplies exact head/base and CI scheduling reference. A separate fresh reviewer must inspect that exact head after terminal required CI succeeds. The #102/109 deployed prerequisite record remains unchanged.

## Completed source stages

The initial source-stage and local-check record below is retained as historical evidence. The later [PR #104 correction record](#pr-104-coordinated-corrections--2026-10-06) establishes a remaining staff-row acceptance gap; these stage entries do not assert complete current acceptance.

- Stage 1: semantic accent/danger separation, named widths, operational density/touch/focus, PageFrame/PageHeader, controlled search/filter/field presentation, explicit ReadState, French cursor/numbered pagination, domain-specific labels/tones, compatible shadcn overlays/control refinements and shell spacing/accessibility.
- Stage 2a: Opportunities Board/List/cards, fixed Views/filter/reset, existing safe staff and PostgreSQL civil display adapters, shared lead drawer hierarchy, bounded sanitized first-page inquiry summary and paged full answers, visible telephone/WhatsApp destinations and presentation-only action dialog changes.
- Stage 2b: task/action and due time first, explicit task assignee versus prospect owner, shared filters/states/drawer. Mes tâches, server buckets/membership/counts and commands are preserved.
- Stage 2c: Students headers/filters, table/mobile cards, actual numbered pagination and return context, dossier/enrollment vocabulary, current/historical balance wording and restricted-operation help. Existing assignment/enrollment/finance adapters and role gates are preserved.
- Bounded applications: Dashboard checks rejected reads, returned RPC errors and invalid/missing finance payloads before rendering numbers; valid zero remains numeric. Placement list has persistent error/retry and truthful genuine-empty guidance. Existing queries/arguments, formulas, booking/deletion and Calendar mounting are unchanged.
- Stage 3: focused semantic/browser regressions and [future touched-page guidance](../../ui/operational-foundation.md). No generic table/form/pipeline/dashboard or domain-command engine.

## Acceptance evidence

Local validation uses synthetic actors/data at `http://127.0.0.1:54321`; external email and browser telemetry are disabled. No Production/customer fixture or credential is committed. The browser read-state harness intercepts only synthetic response fixtures while using real local Auth and the built application; existing RPC/browser and rollback-only SQL suites supply real command/denial/oracle evidence.

The final exact source/check results are recorded in the implementation handoff. The author retains local synthetic logs/screenshots outside the repository; remote CI remains a separate exact-SHA gate.

| Contract | Evidence |
| --- | --- |
| F1 | All three pilots import shared operational primitives. Unit/SSR tests cover unknown labels, null values and field/state rendering; browser semantic accent/danger/contrast probes and existing action/placement/enrollment dialogs exercise shared-control compatibility. |
| F2 | Existing Work/Calendar SQL suite includes #102 PostgreSQL oracle cases at midnight/offset transitions, missing time and safe staff pages. Work/Calendar browser deliberately substitutes incorrect Casablanca ICU, then checks the same visit in Opportunities, Tasks, drawer and Calendar, including the Calendar-provided civil end time. Other surfaces use their existing provided civil start projections without deriving an end from browser ICU. UTC/write identity is unchanged. |
| F3 | Opportunities browser asserts immediate Programme/Search in both orders, actual RPC args and owner/source/channel/View/layout/contact/drawer composition; new browser checks reset during pending debounce and clear-only-search. Existing Back/Forward/focus and Students page-2/detail/return/pager context assertions remain. Navigation suite includes rejected external return destinations. |
| F4 | Rollback-only SQL proves duplicate safe labels across staff pages, fixed response keys and stable references. Browser compares actual staff response labels with Opportunities/Tasks selectors and assignment controls. Owner and task assignee remain separate. No private-field enrichment. |
| F5 | Real page/query adapter browser probes loading, refresh, stale failure, scope changes, true/filtered empty, missing payload and error across CRM and Students; Dashboard RPC error/rejection/missing/malformed/genuine-zero and partial failure; Placement failed dependent list, disabled planning, retry and genuine empty. Unit/SSR tests independently verify zero is data and stale/error never render false-empty content. |
| F6 | Browser checks source-labelled summary before downstream panels, bounded full-answer offset/limit, different visible phone/WhatsApp numbers, exact launcher destination and cancelled launch without activity. Real existing command suites retain explicit recording semantics. |
| F7 | Synthetic legacy Enrolled dossier with no enrollment and immutable receipt balance 700 MAD demonstrates truthful wording. Receptionist browser and SQL retain group/pre-enrollment/payment and denied sensitive operations. |
| F8 | Chromium/WebKit matrix: 1440×900, 768×1024, 390×844, 375×812, 320×812 and 720×450 equivalent zoom viewport, plus asserted actual 200% CSS zoom. Long Arabic/French/programme content, narrow drawer, reduced motion, first mobile result visibility and no body overflow. Board/tables retain bounded horizontal regions. |
| F9 | Keyboard search/clear/reset, native selects, menus, pagination and command alternatives; 2px visible focus; nested dialog/drawer trap, Escape and restoration; mobile navigation inertness; named controls, scoped headers, pressed/current states and field help/error associations. |
| F10 | Browser measures semantic text contrast ≥4.5 and focus contrast ≥3; semantic tones carry text labels. Shared touch controls ≥44px, no essential 10–11px pilot text; long content wraps and remains accessible. Mobile shell focus uses white against navy. |
| F11 | Existing command/idempotency/version, cursor, O3 predicate, role/denial, enrollment and finance regressions retained. Source diff has no SQL/RPC/auth/provider handler change. Full required CI must run on the final head; the PR handoff records its scheduling reference. Local tests supplement that gate. |

## CI-parity sweep and author check

Before first push: inspect migrated route/test constants, French pager/close/status assertions and filter disclosure interactions; use Node `tmpdir`/path helpers for portable new test artifacts; retain server civil time and explicit historical locale/zone; assess neutral global accent and domain tone consumers; exercise responsive and overlay assumptions. The new focused browser matrix is included in the existing full database CI browser command; pure UIF tests are included in app CI. No classifier/workflow fast path or required gate is weakened.

One focused author self-check inspects final diff, especially same-scope read truth, URL patches/debounce reset, safe labels, unchanged commands/arguments/formulas, shared-token compatibility, synthetic-only fixture handling and documentation/deployment claims. It is not independent review or PR approval.

## Local execution results

The runtime was built with external email disabled on the local server and Sentry DSNs empty. Tests ran against synthetic local Supabase only. Exact committed head and local tested tree are supplied by the final PR handoff; source validation is not a Production deployment claim.

| Check | Result / scope |
| --- | --- |
| UIF full browser matrix | PASS Chromium + WebKit: synthetic read-state/zero/error/stale cases, bounded answers and distinct destinations, reset, Students context, all six widths, actual 200% CSS zoom, contrast, keyboard/focus and 44×44 overlay close targets. PASS final focused Chromium/WebKit responsive rerun measuring every visible pilot control at mobile/tablet widths after the compact touch-pagination width correction. PASS final targeted Chromium/WebKit named Students table-region check with keyboard focus, 2px outline and tablet control dimensions. Unaffected read/command evidence above is reused; the final changes add touch width and scroll-region focus/name only. |
| Production build; lint | PASS; existing sidebar image warning and framework deprecation notices only. |
| UIF semantic/SSR; pagination; navigation; CRM Opportunities and Work/Calendar presentation | PASS. |
| Rollback-only Opportunities / Work-Calendar local SQL | PASS, including all command/denial/O3 cases, #102 PostgreSQL timezone oracle and paged safe staff-label cases. |
| Middleware | PASS, 1,066 tests; local build restored after this suite's build. |
| Receipt client regressions; enrollment workflow | PASS. |
| Test path portability; CI classifier/gate regressions | PASS, 58 Node entrypoints and 14 Python tests. |
| Real Opportunities browser | PASS Chromium + WebKit behavior mode: fixed Views/Board/List, drag proposes/cancel creates no activity, cursor bounds, immediate Search/Programme in both orders, exact URL/RPC combination, drawer Back/Forward/focus and responsive layout. Unchanged large-fixture performance validation remains in full remote CI. |
| Real Work/Calendar browser | PASS Chromium + WebKit: forced incorrect browser Casablanca ICU, identical provided civil scheduling across four surfaces, safe labels, task filters/versions, cursor memory, Calendar/legacy bounds, Back and responsive states. |
| CRM phase 4 browser | PASS: command/version/retry/idempotency, launch versus recorded activity, focus return, task replacement/closure, route denials and queue reset. |
| CRM phase 5 browser | PASS: booking/reschedule/result, exact replay, one real appointment, no fake task/default level, mobile and unchanged intercepted email path. |
| Receptionist browser | PASS: real role/sidebar, permitted operations and direct denied routes/APIs, bounded projections, assignment choices/incompatible denials, Auth metadata forgery, HR/finance isolation and fixture cleanup. |
| Students placement browser | PASS: manual/default creation, raw `Yearly` selected value plus translated option text, group filter/assignment, table/mobile card, enrollment history editing, dossier edit and group removal/reassignment synchronization, CSV defaults. |
| CRM phase 6 browser | PASS: explicit enrollment, trusted confirmation/conversion, ambiguity choice, atomic existing link, receipt marker and preserved conversion on downgrade. |

Verification found and corrected WebKit native-select height, 44×44 overlay close targets, mobile header/filter density, and focused-node remounting during refresh and a translated Students select value; option display labels now preserve the stored `Yearly` value. The synthetic browser harness handles CORS preflight explicitly and distinguishes intentionally rejected reads/confirmed navigation cancellation from unexpected application errors. Existing UI selectors were migrated to named searchboxes, French labels and explicit filter disclosure; behavioral assertions were retained.

## Holds and deliberate exclusions

Keep mandatory exact-SHA independent review and explicit owner merge/release approval. No Production release is performed or claimed. Unassigned backlog/default changes (QA F04), placement cancellation/booking redesign, new family/contact/CRM reads, walk-in redesign, consequential enrollment/email safety, finance calculations, receipt/PDF redesign, new permissions/RLS/RPCs/migrations, Meta/provider activation, Director Intelligence, portal-wide redesign and dark mode/custom font remain separate outcomes.

## PR #104 coordinated corrections — 2026-10-06

The owner authorized continuing this same Tier-2 branch/PR with the Students focus, stable staff-row identity and mobile-sidebar resize findings. The instruction explicitly requires stopping the staff part if safe disambiguation needs a new field/read contract or migration. No architecture amendment, permission/RLS change, CRM semantic change or Production action is authorized. Current main was fetched again and remains `b8fe8eb31659358e9c2817e0f5740716bc29f6d5`.

### Failed CI and two bounded source corrections

[Verify 37343245052](https://github.com/elforssa/english-hills-admin/actions/runs/37343245052) tested head `83af3ba0aff8f37fffbf7d2a7c901a39d333f599` against that base, with synthetic merge `792507018683bde1ae648303c7f0570ff6066af7`. Classify/docs/app passed; local-database failed in `studentsTableKeyboard` at Chromium 768px: expected 2px outline, actual 3px. The original local macOS passes above did not establish Linux parity. The two final R4 concurrency steps were skipped after this failure.

- Students' named, `tabIndex=0` horizontal table region did not explicitly apply UIF's focus utilities. Isolated focus checks passed while the full mixed pointer/keyboard sequence reproduced 3px. Matched-rule inspection then showed an author-declared 2px width but a computed 3px width/base outline color during the implicit transition created by the global reduced-motion duration rule. The final region uses `focus` utilities plus `transition-none` for an immediate solid 2px semantic-ring outline with 2px offset whenever focused. The assertion remains 2px and also checks focus after pointer input; keyboard reachability, region semantics and `overflow-x-auto` remain intact.
- Opening mobile navigation makes main content inert. Previously, `lg:hidden` hid the overlay on desktop resize without closing its state, leaving main content inert. A desktop `matchMedia` change now synchronously resets mobile state; layout-effect cleanup removes inert and the keyboard trap before paint. Normal close restores the visible mobile trigger, while the scheduled restoration checks the breakpoint to avoid focusing a hidden desktop trigger.
- The required UIF browser chain now includes actual 768×1024 → 1440×900 resize, detached modal, non-inert main, normal page-control focus and pointer interaction, resize back with closed state, plus Escape/backdrop/navigation close and normal focus restoration. The focused `--corrections-only` mode runs those checks with the unchanged 2px Students keyboard assertion in both engines.

### Staff identity boundary — unresolved, not deferred acceptance

Inspection of [109](../../../supabase/migrations/109_crm_operational_scheduled_display.sql) confirms `crm_get_opportunities` projects `owner_name`, and `crm_get_work_queue` projects `assignee_name` and nested `owner_name`: these are operational full names, without global duplicate-name/role disambiguation. Only `crm_list_staff(p_limit,p_offset)` supplies #102 `display_label`, calculated across the complete eligible staff population. It has no ID/name-targeted lookup. The private `staff_reference` helper is not an authorized browser read. A receptionist's profile table access is not a substitute for the safe operational staff contract.

The shared drawer's operational-card/open-task reads carry staff IDs without staff names. Name-based ordinal probing cannot supply a general ID lookup for these surfaces, and stale/renamed row names are not an identity index. A picker-page cache cannot provide an outside-page-1 identity on a fresh browser load. These are read-contract limits, not permission to invent a different label or require picker navigation to identify work.

The temporary real-RPC browser reproduction extended the existing Work/Calendar synthetic fixture to 54 owned staff accounts sharing an operational name. It selected two identities from the second 50-row picker page, assigned them separately as prospect owner and task assignee, then checked Board/List and My Work in Chromium and WebKit. All fixtures were removed and history/security guards restored. It was an investigation, not a passing staff-acceptance regression or a weakened replacement assertion.

| Requirement | Observed result, Chromium + WebKit |
| --- | --- |
| Outside-page-1 identity | **FAIL / BLOCKED:** Opportunities Board/List owner remained “Responsable sélectionné”, including after the independent filter picker moved to page 2. |
| Unchanged My Work row stable across picker pages | **FAIL / BLOCKED:** both generic assignee/owner labels became their distinct server labels on page 2, then reverted on page 1; task and prospect identities themselves did not change. |
| Adopted duplicate-name rule | PASS for server/picker labels: globally distinct role/reference labels across the two bounded pages; the row integration remains blocked. |
| No private staff enrichment | PASS: every observed staff row had exactly `id`, `name`, `role`, `display_label`; no staff email/phone was added. |

Scanning successive picker pages until arbitrary row IDs are found would become a directory scan; copying the global duplicate/reference algorithm or inventing a different client label would fork #102. A fixed larger first page only moves the failure threshold. The safe durable resolution needs an owner-authorized bounded identity lookup or safe label fields on the existing row projections, with the requisite read-contract/migration decision. Neither is implemented here. Existing picker pagination and CRM row semantics remain unchanged. **F4/stable assignment identity acceptance remains unresolved even if the correction CI passes.** No source/release readiness or independent-review verdict is claimed.

### Correction verification and handoff

The correction handoff records the new exact head, tested tree and fresh full Verify scheduling reference. Local logs and the temporary synthetic reproduction remain outside the repository. No database migration, new RPC, permission, RLS, provider or Production change is included. The staff boundary remains an owner decision before full UIF acceptance.

| Correction check | Result / evidence scope |
| --- | --- |
| Focused focus/sidebar browser regression | PASS Chromium + WebKit: 768px Students keyboard and pointer-following focus, immediate solid 2px outline/2px offset, horizontal scroll; 768→1440 menu removal, inert cleanup, usable focus/pointer interaction, resize back, Escape/backdrop/navigation close and restoration. |
| Full UIF browser matrix | PASS Chromium + WebKit on the final correction source: all read-state/zero/error/stale cases, bounded inquiry answers and destinations, reset, Students context, responsive widths/zoom/contrast, keyboard focus, touch targets and the new sidebar resize regression. |
| Surrounding real-RPC Work/Calendar browser | PASS Chromium + WebKit before the final Students-only focus refinement; its CRM/sidebar source is unchanged by that refinement. Civil-time oracle, task filters/version guards, cursor/Calendar/Back behavior and existing safe selector labels retained. |
| Surrounding Opportunities browser | PASS Chromium + WebKit behavior mode; CRM source unchanged by final Students-only refinement. Search/Programme composition, actual URL/RPC args, fixed Views, Board/List, drag proposals, cursors, drawer Back/focus and responsive behavior. |
| Students operational browser | PASS manual enrollment/placement, filter, desktop/mobile, history and dossier editing, group synchronization and CSV defaults; the final refinement changes scroll-region focus only. |
| Build/lint | PASS final source; existing sidebar image/framework deprecation warnings only. |
| Navigation, UIF semantic/SSR, CRM presentation, pagination, portability | PASS; 58 portable Node entrypoints. |
| CI routing/gate regressions | PASS, 14 tests. |
| Previously unreached R4 isolated concurrency | PASS simultaneous claim/begin, equal-second revalidation, predecessor/stale-worker fencing and local fixture rebuild. |
| Previously unreached advisory sharing-stop race matrix | PASS both winner orders, admission/revoke/identity/cleanup/barrier and isolation guards; local fixture rebuild. |
| 54-staff stable row identity | **FAIL / BLOCKED** in both engines as detailed above; no staff correction or passing acceptance claim. |

Before the correction push, CI parity was checked for the desktop breakpoint, mixed keyboard/pointer focus after fake-clock read retries, hidden-trigger locators, collapsed CRM navigation, fixed viewport paths, unchanged global tokens/locale behavior, and preservation of all 2px assertions. The single focused correction author self-check is complete: final source/test/doc diffs, breakpoint cleanup and focus restoration, truthful evidence and the explicit staff read boundary were inspected. It does not approve the PR or perform independent review.

### Students record-link minimum width — local working-tree correction

Continued from exact PR #104 head `2006f572346398986b1105db7cc27aff3e8b8fd8`, on the same Tier-2 `codex/ui-foundation-implementation` branch; recorded base remains `b8fe8eb31659358e9c2817e0f5740716bc29f6d5`. The owner reported a subsequent local-database CI failure: WebKit at 768px measured the long student-name link at `43.96875px` wide, below UIF's 44px minimum, with sufficient height. Earlier local passes did not prove Linux parity for this target.

Both actual student record anchors (table and mobile card) now use `min-w-11` alongside `min-h-11`. Existing name wrapping, table width and bounded horizontal scroll are retained; no truncation or table minimum width was added. The existing touch-target assertion remains unchanged. A focused `--students-touch-only` harness mode adds full-name retention, multiline wrapping and target-overflow checks using the same synthetic fixture, real local Auth and built application.

| Focused local check | Result / evidence scope |
| --- | --- |
| Chromium + WebKit Students browser | PASS at 768, 720, 390, 375 and 320px: every visible operational touch target ≥44×44px; full long Arabic/French name wraps without target or viewport overflow; named table keyboard/pointer focus remains solid 2px at 768px. Local macOS evidence only; no new Linux CI result is claimed. |
| Long-name link measurements | Chromium widths: 63.109375, 49.40625, 212.53125, 197.53125, 142.53125px respectively. WebKit widths: 75.078125, 53.203125, 212.53125, 197.53125, 142.53125px respectively. Heights: 160, 220, 60, 60, 80px in both engines. |
| Production build (local configuration) | PASS with external email disabled and Sentry DSNs empty; existing sidebar image/framework warnings only. |
| UIF semantic/SSR; script portability; whitespace | PASS; 58 portable Node test entrypoints; `git diff --check`. |

Command: `node scripts/test-ui-foundation-browser.mjs --students-touch-only`. Local logs: `/tmp/uif-students-touch.log` and `/tmp/uif-touch-build.log` (not committed). Evidence applies to the uncommitted working-tree correction above the exact head, not to the unchanged remote SHA. The focused author self-check inspected the anchor-only sizing change, unchanged acceptance assertion/layout rules and truthful evidence; it is not independent review.

**Tier 2/3: NOT READY FOR INDEPENDENT REVIEW.** Per owner instruction, this correction is prepared locally and remains uncommitted/unpushed; no unchanged CI rerun or new full CI run was requested. The reported `source-map-js` dependency audit failure remains a separate dependency/security outcome, with no package/lockfile/audit-policy change here. The >50-staff read-contract issue remains **FAIL / BLOCKED**, exactly as recorded above, pending owner authorization. Required exact-SHA CI, independent review and explicit merge/release approval remain outstanding. No migration, new read contract or Production operation is included.

## UIF-r1a — owner-approved staff identity resolution

**Owner approval: 2026-10-06 (Asia/Shanghai), continuing Window A / PR #104.** The owner explicitly approved [UIF-r1a](../plans/english-hills-ui-foundation.md#uif-r1a--owner-approved-stable-row-staff-identity), crossing only the previously blocked safe row-label read-projection boundary. The earlier 54-staff **FAIL / BLOCKED** reproduction and its valid no-migration stop are historical evidence and remain unchanged above. The new architecture approval authorizes this resolution; it does not retroactively turn the earlier reproduction into a pass.

### Source and migration manifest

Continued on `codex/ui-foundation-implementation` above exact head `2006f572346398986b1105db7cc27aff3e8b8fd8`. Fetched main remains `b8fe8eb31659358e9c2817e0f5740716bc29f6d5`, with migration 109 the latest available/deployed recorded baseline. `110_crm_operational_row_staff_labels.sql` is a forward migration applied only to local synthetic Supabase for these checks; Production remains at recorded migration 109. The earlier Students table/mobile `min-w-11` correction is retained in the same working tree.

The migration extracts the exact 109 rule into private `crm_security.staff_display_label(uuid)` and makes existing `crm_list_staff` use it. The browser has no label/reference algorithm and does not scan directories. Existing projections extend only these presentation fields:

| Existing projection | Added keys / consumer |
| --- | --- |
| `crm_security.opportunity_card` → `crm_get_opportunities` | `owner_display_label`, `next_task.assignee_display_label`; Board/List row identity uses the supplied owner label. |
| `crm_security.operational_card` → `crm_get_workspace_detail` and existing operational-card consumers | `owner_display_label`, `next_task.assignee_display_label`; drawer current owner and next-task identity. |
| `crm_list_open_tasks` → drawer `open_tasks` and existing bounded task pages | `assignee_display_label`; current task identity/reassignment. |
| `crm_get_work_queue` | `assignee_display_label`, `lead.owner_display_label`; My Work rows use their own labels. |
| `crm_list_staff` | No response-key change; same bounds/order and shared private label authority. |

Row-only picker reads/propagation were removed from the workspace and drawer. Independent filter/reassignment pickers retain 50-row pages. A reassignment dialog uses the current row label while its account is absent from the page; an explicitly selected option retains just that safe label when paging, without accumulating a directory. Task-assignee and prospect-owner identity/commands remain separate. Historical actors are not enriched.

### Security and compatibility evidence

Local before/after catalog comparison of every existing `public`/`crm_security` function confirms identical signatures, owners, ACLs, SECURITY DEFINER flags and configuration/search_path. The sole new function is the private helper, with API-role execution revoked; its denial is also tested. No new public RPC, table, RLS, role/capability, private staff email/phone, business-data update/backfill or Production mutation. Existing membership/order/cursor/auth checks, schedules, lifecycle, conversion, finance and dormant provider behavior are unchanged.

### Local regression results

| Check | Result / scope |
| --- | --- |
| New 54-staff real browser regression | **PASS Chromium + WebKit.** Initial outside-page-1 owner on Board/List; initial outside-page-1 task assignee and prospect owner; unchanged row labels across explicit page 1→2→1; drawer/current assignment labels; distinct assignee/owner; bounded picker requests (`p_limit=50`, offsets 0/50); exact safe picker and task/nested-lead response keys. Synthetic fixture cleanup/history guards restored. |
| Migration-109 authority oracle | PASS: exact equality to the original 109 picker body executed as a rollback-only temporary SQL function. Covers unique operational name, cross-role duplicate, same-role duplicates and colliding UUID prefixes requiring longer ID-derived references. No raw UUID normal label or private staff field. |
| Work/Calendar rollback-only SQL | PASS membership/buckets/cursors/roles, exact fixed projections, PostgreSQL Casablanca civil oracle, >50 staff, outside-page-1 row/drawer/open-task labels and private-helper denial; no persisted fixture. |
| Opportunities rollback-only SQL | PASS views/membership/cursors, compact safe projections and existing command/denial regressions; no persisted fixture. |
| Real Work/Calendar browser | PASS Chromium + WebKit: deliberately incorrect browser Casablanca tzdata, identical server scheduling, task owner/assignee AND filters, cursor memory, exact-task stale/version safeguards, Calendar/legacy/Back/responsive behavior and exact safe response shape. |
| Full UIF browser matrix | PASS Chromium + WebKit: all read-state/zero/error/stale cases, bounded inquiry answers/destinations, reset/filter composition, Students context, 1440/768/390/375/320/720px and actual 200% zoom, no viewport overflow, ≥44×44 touch targets, explicit solid 2px Students focus, mobile menu 768→1440 inert cleanup and Escape/backdrop/navigation restoration. The earlier focused Students pass separately confirms full long-name wrapping without target overflow. |
| Build; UIF semantic/SSR; navigation; CRM presentation; pagination; portability | PASS; existing sidebar image/framework warnings only; 59 portable Node entrypoints. |

Commands: `node scripts/test-crm-row-staff-labels-browser.mjs`, `node scripts/test-crm-work-calendar-local.mjs`, `node scripts/test-crm-opportunities-local.mjs --regressions`, `node scripts/test-crm-work-calendar-browser.mjs`, `node scripts/test-ui-foundation-browser.mjs`. Local logs are `/tmp/uifr1a-{staff-browser,work-sql,opportunities-sql,work-browser,uif-browser,build}.log`; these are not committed. The new real browser regression joins the existing `test:crm-work-calendar-browser` chain; full CI remains required. Exact-key assertions were extended only for the approved label keys, not replaced with weaker privacy checks. Native-option DOM and cached-page assertions accommodate browser behavior without changing application expectations; route reads/prefetches are drained before document replacement, retaining fatal unexpected-error checks.

Local source/test/migration tree SHA-256: `98a54860b54d6014455219357a6e1a5508155dbc9b901f403f62aeb968823074` (file manifest `/tmp/uifr1a-tested-tree.json`, excludes documentation). These results apply to the uncommitted working tree above the unchanged head, not to the remote PR SHA or Linux CI.

### Handoff and remaining gates

**Tier 2/3: NOT READY FOR INDEPENDENT REVIEW.** UIF-r1a is Tier 3 because migration 110 changes existing CRM read projections; original UIF-r1's Tier-2 assessment is historical. No independent review, merge/release or Production approval is claimed. The source remains uncommitted/unpushed per the dependency coordination hold. A one-time metadata check found dependency PR #105 still OPEN; no audit fix is included here, and no unchanged/full remote CI rerun was requested. After #105 merges, rebase onto corrected current main, refresh any affected local evidence, push the complete UIF-r1/UIF-r1a/Students revision, confirm one fresh full Verify run and stop polling. Only then provide the owner's requested remote-CI-pending handoff with final base/head/run reference. Separate exact-SHA independent review and explicit human release/operator approval remain mandatory.

The single focused UIF-r1a author self-check is complete: migration-109 algorithm extraction, bounded projection-only diffs, unchanged authorization/ACLs/membership/cursors/commands/time fields, no private enrichment, removal of row-picker dependencies, selected-label state, exact response-key safeguards, synthetic cleanup and truthful source/deployment evidence were inspected. Changed Markdown links/anchors and added-Markdown secret/PII heuristics pass, as does `git diff --check`. A supplemental source scan flags the test’s runtime-generated password and explicit synthetic phone fixture; focused manual inspection confirms neither is a committed credential or customer export. This is not independent review or PR approval.

## PR #105 baseline rebase and final author handoff

**Owner-authorized continuation — 2026-10-06 (Asia/Shanghai).** PR #105 merged to main as `f0fa13dc9aeaac6e3c33fa441ced9e97d5f28b0e`. The owner explicitly authorized fetching/rebasing this same PR #104 branch, preserving UIF-r1a and Students corrections, validating affected checks, committing/pushing the complete revision and confirming one fresh full Verify run, then stopping polling. No merge or Production action is authorized.

The working tree was preserved through a temporary stash (including migration 110 and the new browser regression), rebased and restored. The sole genuine conflict was `package.json` test wiring: both the dependency PR's CSS-toolchain checks and UIF's semantic/browser checks were retained. The merged dependency manifest/override and lockfile match main exactly; only existing UIF test-script additions differ from main. The lock resolves `source-map-js@1.2.2` and exact `postcss-selector-parser@7.1.6`, with unchanged parent versions. `npm ci` installed these patched versions locally. Migration `110_crm_operational_row_staff_labels.sql` remains the next forward migration; no UIF source/test/migration content changed during rebase, apart from composing the package scripts with #105.

| Rebase validation | Result / scope |
| --- | --- |
| Dependency baseline / live gates | PASS installed dependency graph, zero production audit vulnerabilities, full policy audit with only the existing exact braces exception; audit policy regressions pass. |
| CSS compiler / UIF semantic checks | PASS actual app CSS, 23 utility/variant probes and seven nested-selector fixtures; UIF semantic/SSR read-truth checks pass. |
| Build | PASS patched production build with local-only Supabase, external email disabled and Sentry DSNs empty; existing sidebar/framework warnings only. |
| 54-staff browser | PASS fresh Chromium + WebKit on the patched build: Board/List initial outside-page-1 owners, task assignee/prospect owner, drawer/current assignment, stable picker page 1→2→1, exact 109 oracle, fixed safe fields and fixture cleanup. |
| Students touch/focus/sidebar | PASS fresh Chromium + WebKit: ≥44×44 targets and full-name wrapping/no overflow at 768/720/390/375/320px; immediate solid 2px Students keyboard/pointer focus; 768→1440 modal removal/non-inert main, usable controls, resize-back and Escape/backdrop/navigation focus restoration. |
| Unaffected evidence reuse | Earlier successful Work/Calendar and Opportunities SQL, migration/ACL catalog comparison, full UIF and real Work/Calendar browser results remain sufficient for unchanged domain/read code. Fresh focused browser checks cover the dependency-sensitive rendering paths. |
| Documentation / portability | 60 portable Node entrypoints; final changed-Markdown/whitespace checks recorded in handoff. |

The earlier blocked/reproduction and pre-rebase validation records above remain historical and unmodified. Tier 3 remains applicable to UIF-r1a/migration 110. The author handoff supplies the new exact committed head and CI run reference; a scheduled run is not successful required CI or independent-review readiness. Mandatory separate exact-SHA independent review and explicit human release/operator approval remain outstanding. Recorded Production remains at migration 109; no fresh Production inspection or operation is claimed.

Rebased local source/test/dependency/migration tree SHA-256: `e14c626e44f6bbfe53d1bbea3b413505b14d492be2827a936d235623aea0aebd` (manifest `/tmp/uifr1a-rebased-tested-tree.json`, excludes documentation). Local rebase logs: `/tmp/uifr1a-rebase-{install,prod-audit,policy-audit,build,staff-browser,students-browser,corrections-browser}.log`. The targeted author rebase check confirms unchanged UIF/read/migration content, preservation of both test chains, exact patched dependency resolutions and accurate evidence. No second internal review or independent-review verdict was issued.


## Production closeout — 2026-10-06

The owner explicitly approved the separate Tier-3 Production rollout after PR #104's exact-SHA independent review returned READY FOR FINAL REVIEW. Final reviewed PR head `3d8d5782a21d022ccf2a3a85e7eb1fb7721d8a42` merged as `f30e8d9ac628839c2282549324f4a3fa9b5b8ae8`. Vercel Production deployment `dpl_H9LkTg4jaEU4jV7tHBqi4AxsFJoV` is READY for that merge and serves `admin.english-hills.com`.

The exact repository SQL from `110_crm_operational_row_staff_labels.sql` was applied to Production Supabase project `hopcezradkhrixwwswxn`. The migration service initially recorded generated version `20261006042936`; guarded metadata-only normalization changed that ledger identifier to repository version `110` without rerunning migration SQL. The final migration tail is 106, 107, 108, 109, 110 with `110 = crm_operational_row_staff_labels`.

### Bounded Production acceptance

- Authenticated `crm_list_staff` returned three current staff rows and only the expected `id/name/role/display_label` presentation fields; the bounded privacy check found no staff email/phone fields.
- Authenticated `crm_get_work_queue` returned current work rows with `assignee_display_label` and nested lead `owner_display_label`; authenticated Opportunities returned current rows with `owner_display_label`.
- Authenticated `crm_list_open_tasks` returned 32 current open tasks with `assignee_display_label` present and no email/phone fields.
- A current operational drawer-card projection contained the expected owner label key and, when a next task is present, its assignee label key.
- Existing authenticated execution remained available for `crm_list_staff`, `crm_list_open_tasks`, `crm_get_work_queue` and `crm_get_opportunities`.
- Private `crm_security.staff_display_label(uuid)` and `crm_security.staff_reference(uuid)` remained non-executable by authenticated/anon API roles; the new helper was also non-executable by service_role. No new public RPC or permission expansion was observed.
- Lifecycle remained dormant: zero enabled lifecycle connections, zero open or historical activation epochs, zero live or total external deliveries, zero delivery attempts and zero active lifecycle cron jobs.
- Vercel reported no runtime error clusters in the post-release 15-minute window. A public probe of `/crm/leads` returned HTTP 200 and correctly resolved to the login surface for an unauthenticated request.

This was a bounded release verification, not a fresh authenticated receptionist browser walkthrough. Browser/UI acceptance remains the exact-SHA Chromium/WebKit evidence from the reviewed PR, including the 54-staff picker-stability regression, Students touch/focus checks and sidebar breakpoint cleanup. No Meta lifecycle activation, provider delivery, finance/enrollment behavior or unrelated Production mutation occurred.
