# UIF-r1 implementation evidence — 2026-10-06

Implementation began 2026-10-05; verification/handoff continued 2026-10-06 (Asia/Shanghai). Owner implementation approval was recorded 2026-10-05.

## Scope and authority

One Tier-2 outcome on `codex/ui-foundation-implementation`, from fetched/verified main `b8fe8eb31659358e9c2817e0f5740716bc29f6d5` (PR #103). The owner explicitly approved [UIF-r1](../plans/english-hills-ui-foundation.md) / [ADR-005](../decisions/ADR-005-operational-ui-foundation.md) in the implementation task. Substantial shared presentation and navigation/read-state handling justify Tier 2; existing sensitive read/write authority and formulas remain unchanged. No database migration, new RPC, permission, endpoint or provider activation.

Source implementation, merge, deployment and Production verification are separate. This task has no merge/release authority, performs no Production action and creates no independent-review verdict. The PR handoff supplies exact head/base and CI scheduling reference. A separate fresh reviewer must inspect that exact head after terminal required CI succeeds. The #102/109 deployed prerequisite record remains unchanged.

## Completed source stages

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
