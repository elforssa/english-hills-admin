# Owner summary

## What will change

One reusable operational UI foundation consolidates existing English Hills patterns: **GoHighLevel operational usefulness + Linear restraint + English Hills identity**. Foundation Stage 1 supplies tokens and small shared primitives; Stage 2 proves them in Opportunities + lead drawer, Tasks / My Work, and Students list/detail; Stage 3 verifies responsive/state behavior and records future-page guidance. These are stages of one implementation outcome, not three independent product commissions.

## What staff/users will be able to do

Scan work with consistent hierarchy, identify staff reliably, combine search and filters without losing context, see authoritative Casablanca scheduled times, distinguish failed reads from empty results, and find inquiry answers and the WhatsApp destination before acting. Existing commands and permissions remain unchanged.

## What remains restricted

No new reads, RPC semantics, permissions, data models, CRM transitions, financial calculations, enrollment effects or provider delivery. No implementation is authorized by this architecture task. The separate product outcomes below remain excluded.

## UI impact

Compact French operational interfaces with EH navy navigation, blue primary actions, neutral surfaces, restrained borders, readable text and explicit next actions. Retain Tailwind, shadcn/Radix, Lucide, Recharts and the current system font. This is consolidation, not a wholesale redesign or a universal table/form/dashboard engine.

## Database impact

**None for this outcome.** Reuse the adopted PR #102 projections and existing bounded reads; no migration, grant, RLS, index, stored-value or data repair is proposed. PR #102's migration is a prerequisite owned by its separate release, not a Foundation deliverable.

## Important security decisions

Presentation consumes existing authorized projections. Staff labels must not expose private account fields. Preserve role/capability gates, contact/learner separation, task/owner separation, server-owned scheduling and trusted enrollment-driven conversion. Launching a call or WhatsApp records no activity. No browser/provider transport is added.

## Risks / owner review points

**Tier 2:** substantial shared presentation architecture, navigation state and read-state corrections with unchanged sensitive boundaries. The scoped implementation is also Tier 2. Finance data/aggregation changes, enrollment confirmation/rejection/email changes, authorization changes or new database contracts require separate architecture/owner approval and applicable Tier-3 flow. Shared token changes can affect untouched consumers: verify representative existing controls without expanding into page migrations.

## Contract identity, sources and approval

- Revision **UIF-r1**, 2026-10-05 (Asia/Shanghai). Status: **PROPOSED — owner approval pending**. The owner selected the visual direction and requested this specification; that is not acceptance of this exact contract or implementation/release approval.
- Architecture source baseline after prerequisite adoption: main `3c462f7fce87261ff92c565fecf8ab652262bb81` (PR #102 merge). This documentation PR is rebased onto that baseline before final review; record the final head in its handoff.
- Completed read-only proposal: Codex task **Audit UI foundation**, `01a10bfe-c4f2-74c3-a2a3-d336c0d4deed`, completed 2026-10-05. It inspected the earlier source baseline `05ef83c7427353019eb49c48900dd7044a2fcc7b` plus then-changing correction files; no browser/Production verification. This plan preserves its implementation-relevant decisions and P1 classifications.
- Completed receptionist QA: **Audit receptionist workflows**, `01a10bff-53ed-7d12-97c1-f15a592bb4a0`, report `receptionist-audit/AUDIT.md`, 2026-10-05. Read-only Production observations; F01–F17 are mapped below. No write-dependent operation was verified and no deployment SHA/ledger was freshly established. Do not commit its screenshots or customer records as fixtures.
- [Completed O3-r2](completed/outcome-3-receptionist-workspace.md), [product rules](../../ai/PRODUCT_RULES.md), [security rules](../../ai/SECURITY_RULES.md), [workflows](../../ai/WORKFLOWS.md), [ADR-001](../decisions/ADR-001-crm-lifecycle.md) and [ADR-003](../decisions/ADR-003-receptionist-operations-role.md) remain domain authority. [Current state](../../ai/CURRENT_STATE.md) owns dated deployment evidence.
- [PR #102](https://github.com/elforssa/english-hills-admin/pull/102) finalized at head `8f12f674f1c1fd910b8410b4bbb2d4d3b3917e3c` and merged to main as `3c462f7fce87261ff92c565fecf8ab652262bb81`. Its coordinated Production release applied `109_crm_operational_scheduled_display.sql` and verified the matching frontend/read-model compatibility; the Production migration ledger is normalized through 109. The authoritative [current record](../../ai/CURRENT_STATE.md#post-outcome-3-receptionist-ux-correction-production-closeout) and [dated release evidence](../evidence/receptionist-production-ux-corrections-2026-10-05.md#production-closeout--2026-10-05) establish the required UIF prerequisite baseline without authorizing UIF implementation. The release checks were bounded; no fresh authenticated receptionist browser walkthrough is claimed.

**Adopted prerequisite baseline:** all four PR #102 corrections are now present on main: server/database Casablanca civil scheduled-time projections, composable debounced filter/drawer navigation, shared safe staff disambiguation, and truthful Attention wording. Migration `109_crm_operational_scheduled_display.sql` and the matching Production frontend were verified compatible. Future UIF implementation must branch from then-current **main**, reuse these adopted interfaces, and must not duplicate migration 109 or independently reimplement the corrections.

Record owner approval here before implementation: approval date/evidence, accepted revision and exact scope, including the two bounded read-state corrections. Architecture merge, implementation, release and Production verification are distinct states.

## Current-state audit and QA disposition

Source inspection confirms existing [theme variables](../../../src/app/globals.css), [Tailwind mapping](../../../tailwind.config.js), [UI primitives](../../../src/components/ui), [status colors](../../../src/lib/statusColors.js), [CRM shared states/pager](../../../src/components/crm/CrmShared.jsx), shared drawer and operational Students layout. The main gaps are duplicated controls/headers/status labels, inconsistent density, mobile filter height and failure presentation. `accent` and `destructive` currently share red; ordinary hover consumes `accent`. Students already distinguishes loading/error/empty; CRM MarketingAnalytics models availability explicitly. Preserve these strengths.

| Source / priority | Finding and Foundation disposition |
| --- | --- |
| QA F01–F03, P1 | Conflicting scheduled times, lost filters during debounce, ambiguous staff choices. Required #102 baseline; retain as cross-pilot regressions, not new repairs. |
| QA F05, P2 | Attention link inaccurately describes only missing next actions. Adopt #102 “À traiter · prospects nécessitant un suivi”; never change membership to fit copy. |
| QA F06–F10, P2 | Promote authorized inquiry answers, show WhatsApp destination, unify vocabulary, clear filters and compact mobile controls. In pilot scope. |
| QA F12–F13, P2 | Empty-state help and legacy dossier/current enrollment distinction. Apply to pilots and bounded Placement read-state correction; attendance guidance becomes a future touched-page rule. Do not infer missing enrollment from a failed read. |
| QA F14–F15, P2 | Historical/current balance wording and restricted-operation escalation. Apply existing-data wording in Students; specify receipt guidance for its next authorized change. No receipt print redesign or finance workflow migration here. |
| QA F16–F17, P3 | Duplicate programme/email display and English receipt pagination. Shared French pager contract; receipt-specific cleanup waits until touched. |
| Source P1: dashboard | [Dashboard](../../../src/app/(admin)/dashboard/page.jsx) uses finance RPC data/zero fallbacks without checking returned errors; aggregate rejection also lacks a handled state. Include **only bounded read-state correction** using identical reads/arguments/aggregation and access. Distinguish rejection, returned RPC error, missing/invalid payload and genuine successful zero. No financial logic or reporting redesign. |
| Source P1: Placement | [Placement list](../../../src/app/(admin)/placement-tests/page.jsx) catches/logs failed load, then renders initial empty arrays. Include **only bounded read-state correction** with persistent error/retry and genuine empty guidance. Keep Calendar/list mounting, queries, booking/deletion and permissions unchanged. |
| Source P1: enrollment | [Enrollment actions](../../../src/app/(admin)/enrollments/page.jsx) validate/reject directly without explicit review/per-action pending protection; validation can send email. **Separate sensitive workflow outcome**. Foundation defines presentation affordances but must not wrap/refactor these handlers or change confirmation/rejection/retry/email behavior. |

These source P1 findings identify misleading or consequential code paths, not proven Production incidents. Wider source-audit P2 findings (unnamed icons, portal tabs, sidebar parent context) inform shared contracts and regression sampling; they do not authorize migrating every page. P3 radii/shadow/title differences remain subordinate to task correctness.

## Approved visual direction and token contract

The direction is owner-selected; the following exact values/contracts are proposed in UIF-r1. Map semantic names through CSS variables/Tailwind; no new styling framework or page-local brand hex values. Keep current light theme; dark mode, custom fonts and density preferences are deferred.

| Contract | Required values / use |
| --- | --- |
| Brand / surfaces | Preserve primary `#1E4D8B`, sidebar `#1E3560`, current background `220 20% 97%`, foreground `220 25% 12%`, white card/popover, muted `220 15% 94%`, muted text `220 10% 40%`, border/input `220 20% 90%`, primary focus ring. Do not use pale decorative borders as sole interactive affordance. |
| Interaction / danger | `accent: 216 30% 95%`, foreground `216 64% 25%` for ordinary hover/selection; retain `352 77% 42%` with white for destructive. Preserve red brand accent separately; never red normal menu hover. Selected state also has text/icon/aria indication. |
| Semantic tones | Info blue-50/blue-800; success emerald-50/emerald-800; warning amber-50/amber-900; danger red-50/red-800; neutral slate-100/slate-700. Domain maps select tone; colors never define business state. Overdue uses explicit “En retard” on due label, not a red whole card. Balance alone is not overdue. Verify rendered contrast. |
| Spacing | 4, 8, 12, 16, 24, 32, 48px. Related controls gap 8; within section 16; major sections 24. Operational card padding 12, panel 16, overlay 24 desktop / 16 mobile. Table cell 12 horizontal / 10–12 vertical. |
| Typography | Existing system stack (configured as `font-inter`, not a loaded Inter font). Page title 24/32 weight 600, mobile 20/28; section/drawer title 16/24 weight 600; body/control/cell 14/20; row secondary 13/18; helper/badge/time 12/16. No essential 10–11px text. Numbers align with tabular numerals. |
| Shape / density | Controls radius 6px, panels/cards 8px, overlays 12px, badges pill. Borders organize content; shadows primarily overlays. Controls 36px desktop, 44px touch. Rows content-driven, roughly 44–48px single line / 60–72px two lines; never clip to fixed heights. |
| Page widths | Content max-width: standard 1280px, detail 1024px, form 768px, wide 1600px. Gutters 16px mobile, 24px ≥768px. One main vertical page scroll; bounded board/table horizontal scroll only. |
| Shell | Keep role-aware navy navigation and routes. Target existing 240px desktop sidebar; mobile navigation below 1024px remains accessible modal navigation. Reserve a 56px mobile header region, avoid page-specific floating-button offsets. No navigation information-architecture rewrite. Scope shell alignment to spacing/focus/active context, preserving exact route authorization. |
| Analytics guidance | Recharts retained; KPI 28/32 weight 600 with unit, period and availability. Chart categorical colors independent of business status; visible axes/legend and accessible data alternative. Future metrics/denominators and Director Intelligence design require their own outcome. No unused KPI/dashboard engine now. |

## Token/component contracts and reuse / extend / add

Stage 1 establishes these small presentation contracts; page adapters retain fetches, URL semantics, role gates and business actions. Do not turn components into query engines.

| Classification / target | Contract |
| --- | --- |
| EXTEND `globals.css`, `tailwind.config.js` | Semantic color/spacing/width/type/shape tokens above. Audit existing consumers of changed global variables; prefer compatible variants to global behavioral changes. |
| REUSE / EXTEND `src/components/ui` | Button, Input, Label, Select, Table, Badge, Sheet, Dialog, DropdownMenu, Tabs. Standardize variants and focus, not domain logic. Primary blue (one per action region), secondary outline, tertiary ghost, explicit destructive. Named icon controls with tooltip as supplementary help. |
| ADD `src/components/operational/PageFrame.jsx`, `PageHeader.jsx` | Width enum, normal flow and gutters; title, optional description/breadcrumb and action slots. Header plain by default, no fetching, role inference or mandatory decorative card. |
| ADD `SearchField.jsx`, `FilterBar.jsx`, `FormField.jsx` in same directory | Controlled value/onChange, visible accessible labels, clear control, help/error associations. FilterBar slots for search, frequent controls, “Plus de filtres”, active summary/count and reset callback. Search debounce belongs to the page adapter. Short lists reuse styled native selects; existing bounded staff pickers keep pagination. No eager load-all convenience. |
| EXTEND shared table/list/card treatment | Semantic Table primitives with header scope, right-aligned numbers, record link and named action menu. Domain rows/cards remain in CRM/Students; share spacing and slots only when actual duplication warrants it. Identity → relevant context → next action/time → owner. Board stage commands/count meaning unchanged. |
| ADD `ReadState.jsx`; EXTEND `CrmShared.jsx` as adapter | Explicit state plus content/help/retry slots; no truth inferred from falsy numeric values. Existing query shape adapted at call site. Never mix previous-filter data into a new filter result. |
| EXTEND badges / `statusColors.js`; ADD `src/lib/ui/presentation.mjs` | Domain-specific display labels and tones, unknown neutral label, no new enum or write mapping. CRM scheduling/staff adapters continue to reuse adopted `src/lib/crm/presentation.mjs`; do not fork #102 logic. |
| EXTEND existing numbered pagination; ADD cursor footer only if shared | French “Précédent / Suivant”, accessible names and loading/disabled behavior. Numbered mode accepts actual page/total; cursor mode accepts hasMore/previous availability and callbacks. Never derive total/pages from loaded rows or fabricate missing counts. |
| REUSE overlays / menus / tabs | Sheet ~620px desktop, full width mobile; dialog 480px standard / 640px form, bounded by viewport minus gutters. Scrollable body, reachable footer, title/description, Escape/focus return. Radix tabs for local panels, links for routes, pressed buttons for view mode. Menus group rare/destructive actions; frequent action remains visible. |

Form errors remain attached to fields and retain input. Pending labels indicate the actual existing command lifecycle; preserve request identity/version and uncertain-result handling. Destructive/consequential review surfaces describe object, action and known effects before invoking already-approved commands. This is a reusable pattern, **not authorization to retrofit enrollment side effects**.

## Four interaction invariants

1. **Authoritative scheduled-time presentation.** Operational scheduled times use the authoritative server/database Casablanca civil representation when available. Browser ICU/timezone interpretation must not independently determine appointment/task display truth. Reuse #102 civil-date/time formatter without reparsing through browser timezone conversion. Keep UTC instants for identity/order/write contracts, date-only values as dates, and invalid/missing legacy time visibly “Heure non précisée”; missing authoritative scheduled projection must not silently fall back to a guessed browser time. Historical occurrence timestamps are a separate formatter with explicit French locale/school zone, never an input to scheduling predicates.
2. **Composable navigation/filter state.** Search debounce, filters, drawers, Back/Forward and return context must compose without silently overwriting one another. Patch the latest committed URL, retain unrelated supported parameters, invalidate pending debounce on navigation/reset, and key reads/cursors to committed filter state. Reuse #102's mechanism; no parallel router store. Preserve validated internal return destinations and existing scroll/focus restoration.
3. **Stable operational staff labels.** Every staff selector and assignment surface uses the same safe disambiguation rule: unique operational name, role when necessary, then the adopted shortest distinguishing stable reference across all staff pages. Reuse server labels/#102 helper; page-local ordering/index is not identity. Never expose private account fields, email or raw UUID solely for presentation. Existing immutable historical actor text is not a selector and must not be backfilled via extra profile reads.
4. **Truthful read states.** Loading, refreshing, empty, filtered-empty, unavailable, error and genuine zero are distinct. Never display unavailable/error data as zero. Success requires a valid successful response, not merely completed network activity. Preserve last successful same-scope data only with visible stale/refresh-failed notice; do not present it as current.

### Filter and read-state details

“Effacer les filtres” clears search and optional refinements in one update, resets pagination, cancels pending search and preserves selected system View, Board/List mode, open drawer identity and validated return context. Label the scope when a View remains (“Filtres effacés · vue …”); use the existing All View separately to leave a constrained View. My Work reset restores its existing default assignee-me/owner-all behavior; it must not switch to unassigned or all-team. Keep bucket/navigation scope explicit. Students reset restores existing list defaults. Active count excludes layout/drawer/return parameters; default values do not count. Clear-search removes only search. Back/Forward restores committed visible controls and results together.

| State | Required presentation |
| --- | --- |
| Initial loading | Layout-matching skeleton + accessible loading text; no empty CTA or zero totals. |
| Refreshing | Existing same-scope content stays, “Actualisation…”/aria-busy; no interaction reset. |
| Empty | Successful unfiltered empty result, specific explanation and permitted existing next step. |
| Filtered-empty | Successful zero matches in current View/filter scope, show active scope and clear/change-view affordance; do not imply no school records exist. |
| Unavailable | “Indisponible” with safe reason/help; no fabricated figure. Unsupported or unprovided value distinct from transport failure. |
| Error | Persistent inline failure and bounded retry of the same read; safe user message, no sensitive raw response. Dependent selectors/actions cannot pretend missing options are valid. |
| Genuine zero | Numeric 0 only after valid successful authorized read; preserve units/period. Partial dashboard failures label affected panels individually or mark whole dependent section unavailable. |

## Vocabulary, drawer hierarchy and safe help

- **Attention:** use “À traiter” and explanatory “prospects nécessitant un suivi” consistently. Preserve O3's broader predicate and taskless attention entry, without inventing tasks or recalculating cadence.
- **Programme:** show human labels; distinguish “Intérêt déclaré” from actual enrollment “Programme d’inscription”. Display the Yearly programme consistently as “Programme annuel”; use the existing safe programme name for other values. Never merge distinct option IDs or equate free-text interest with an enrolled session. Channel display: Meta / Site web / Saisie manuelle; hide `interest`, `session`, `meta_instant_form` as UI jargon, not as payload keys.
- **Status:** CRM stage, task state, learner dossier status, enrollment state and payment state have separate maps. Enrollment: Submitted → “Soumise”, Under Review → “En cours d’examen”, Trial → “Essai”, Confirmed → “Inscrit — groupe à affecter”, Validated → “Inscription validée”, Rejected → “Refusée”. Dossier: Enrolled → “Inscrit (dossier)”, Trial → “Essai (dossier)”, Prospect → “Prospect”, Inactive → “Inactif”, Alumni → “Ancien apprenant”. Preserve stored values and existing command eligibility; never infer current enrollment from dossier status.
- **Drawer order:** contact/learner identity and channel destinations → quick actions → stage/prospect owner → next action/task assignee → short inquiry-answer summary → existing placement/enrollment → acquisition → full answers → history. Show populated downstream sections; empty ones remain compact with truthful existing next steps. Promote the existing bounded sanitized `crm_get_form_answers` first page (limit 5) when drawer opens; keep full answers paged and source-labelled. This changes display/fetch timing only, not read shape/authority. Prefer known labelled age-range/centre-travel/programme-interest answers when present; do not infer age/name, combine conflicting submissions, or invent keys. Keep source/date and full-answer disclosure; older pages are not silently treated as absent.
- **WhatsApp:** before opening or recording, visibly show the same existing authorized destination used by the launcher, labelled “WhatsApp”, separately from telephone when different. Preserve normalization/fallback selection; if absent, explain unavailability. “Ouvrir WhatsApp”, “Message envoyé” and “Conversation tenue” remain distinct existing actions; no delivery claim from launching or automatic send.
- **Financial context:** “Solde restant actuel” only for successful current balance; “Solde après ce paiement” / “Restant historique” for immutable receipt snapshots, with receipt date. Never recompute/rewrite historical receipts. Students may explain “Statut du dossier” versus “Aucune inscription enregistrée” only when the existing enrollment read succeeds.
- **Restricted operations:** safe help names the existing escalation route: “Pour corriger ou annuler un reçu, contactez la direction.” Explain receptionist pre-enrollment limits and existing authorized confirmation path. No request/approval inbox, new notification, enabled forbidden control or permission change. Empty prerequisite states link only to already-authorized routes; no permissions workaround.

## Pilot manifest and staged implementation batches

**One coherent implementation outcome, preferably one branch/PR through all three stages.** Stage boundaries organize work and evidence, not release or permission gates. Keep related fixes and reviewer findings together under [AGENTS](../../../AGENTS.md). No “convert every page” stage.

| Stage | Modules / exact outcome | Evidence of reuse |
| --- | --- | --- |
| 1 — Foundation contract + shared primitives | Token files and operational components above; compatible UI variants, labels/state adapters. Add documentation examples for page widths, filter reset, read states, overlays, numbered/cursor pagination. No unused generic engines. | Components accept presentation props; no domain RPC/permission logic. Existing consumers remain compatible. |
| 2a — Opportunities + lead drawer | `CrmWorkspace`, `OpportunityFilters`, `OpportunitiesBoard`, `OpportunitiesList`, `OpportunityCard`, `LeadDetailSheet`, presentation-only parts of `CrmActionDialog`. Standard header, compact filters/reset, cards/list, safe labels, elevated answers and visible WhatsApp destination. | Proves wide page, Board/List identity, live URL composition, drawer/dialog focus, cursor/bounded reads and domain badges. Existing placement/enrollment components retain handlers. |
| 2b — Tasks / My Work | `WorkQueue`, existing `/crm/today` shell and shared drawer. Task-first rows, compact filters, identical staff/time/Attention presentation. | Proves reuse across different owner/assignee semantics and server buckets; no unassigned-backlog callout or default change. Calendar is regression comparator, not fourth pilot. |
| 2c — Students list/detail | Existing `/students/page.jsx`, `/students/[id]/page.jsx`, shared `PersonLink`/`ContextLink` and current adapters. Shared header/filters, table/mobile rows, badges, pagination, dossier/enrollment/financial wording and permitted-action help. | Proves non-CRM standard/detail widths, numbered pagination, role-specific actions within one layout, long names and return context. No family/contact read expansion. |
| 2 bounded state applications | Dashboard finance display errors and Placement list load errors only, in existing page files. | Proves ReadState handles returned RPC errors, rejected reads, successful empty and valid zero. No dashboard redesign or booking/enrollment handler change. |
| 3 — Verification + future-page guidance | Responsive/state matrix below; foundation usage guide under `docs/`; record exceptions and examples tied to real pilots. | All three pilots consume shared primitives, not three copies. Future authorized pages adopt when touched. Untouched pages only receive compatibility verification for shared changes. |

Reuse current query hooks, cache isolation, cursor bounds, command adapters, Radix focus handling and status/domain modules. Deprecate page-local control class copies, raw brand colors, duplicated label maps and zero-on-error patterns for new work. Do not delete old adapters until their consumers are migrated; avoid unrelated cleanup. Attendance save state, receipt arithmetic and enrollment eligibility must remain explicit domain code.

## Responsive/accessibility and acceptance criteria

All future behavior verification uses local Supabase `http://127.0.0.1:54321`, synthetic data and external email/provider delivery disabled. These are future tests, not claims this documentation task ran the application.

| ID | Acceptance evidence required |
| --- | --- |
| F1 | Tokens/primitives consumed by all three pilots; compare representative untouched button/menu/select/dialog consumers after global accent changes. No normal hover reads as destructive. Inspect long labels, null fields and unknown enum display. |
| F2 | Same scheduled visit/task has identical school civil date/start/end where provided in Opportunities, Tasks, drawer and Calendar despite forced browser timezone/ICU disagreement. Probe Casablanca midnight and offset-transition fixtures against database oracle; preserve UTC and unspecified-time behavior. |
| F3 | Real browser: type search then immediately Programme, and reverse order; combine owner/source/channel/View/layout/contact/drawer, reset during debounce, pagination and Back/Forward. Assert URL, visible controls and actual RPC arguments agree. Return from Student/detail retains approved context; no external/open-redirect return destination accepted. |
| F4 | Duplicate staff names/roles split across option pages produce identical safe labels in filters and assignment controls. Actual responses/rendering expose no new private fields. Task owner and prospect owner remain distinct. |
| F5 | Each pilot: initial loading, refresh, refresh failure with stale same-scope data, true empty, filtered-empty, unavailable and read error. Dashboard: returned error, rejected request, missing/malformed data and valid zero. Placement: any dependent load fails, retry succeeds, genuine no-tests case. Never zero/empty success on failure; no stale cross-filter/user results. |
| F6 | New inquiry shows existing answer context before empty downstream panels; full answers/source/history remain accessible and bounded. Different telephone/WhatsApp destinations are visible and launcher matches displayed destination. Launch/close/cancel creates no activity; existing explicit recording semantics unchanged. |
| F7 | Students legacy dossier/current enrollment wording and historical/current balance labels match existing facts; no fabricated enrollment/confirmation, no amount changes. Receptionist restricted actions stay absent/denied; guidance names permitted escalation. |
| F8 | Chromium and WebKit at 1440×900, 768×1024, 390×844 and 375×812; 200% zoom and 320 CSS-pixel reflow; reduced motion. No viewport horizontal scrolling except labelled bounded Board/table region. Search + View + filter disclosure/active summary fit compactly; a result or truthful state is visible in first mobile viewport with normal fixture text. Expanded filters may scroll. |
| F9 | Keyboard-only search, clear/reset, selects, menus, pagination, drawer/dialog and Board action alternatives. Visible 2px focus, Escape, background inertness/focus trap, focus restoration or stable fallback if row vanished. Screen-reader names, field help/error associations, header scopes, aria-current/pressed and polite state announcements. No hover-only required information. |
| F10 | Minimum text contrast 4.5:1 (large text 3:1), meaningful controls/focus 3:1; state conveyed by words/icon as well as color. 44px touch targets, separated compact desktop targets; controls/actions remain reachable with keyboard open. Long Arabic/French names, long programme labels and narrow drawers wrap; truncated content accessible on focus/tap. |
| F11 | Existing allowed commands, request versions/idempotency, stale-command handling, query bounds, role gates and denial tests retained. No RPC/schema/migration diff, new endpoint, changed predicate/default, enrollment/finance/provider handler change or new sensitive payload. Required full CI for runtime implementation; targeted local tests/browser evidence supplement rather than duplicate passing suites. |

Use existing Opportunities/Work-Calendar browser and component tests, navigation/middleware tests and focused Students checks; extend assertions to the failures above. Test affected domain safeguards when moved presentation controls could change action dispatch. No unconditional full local suite duplication. Architecture-only validation is changed-Markdown links/anchors, source/secret/PII inspection, whitespace and CI routing/policy regressions plus required remote docs CI.

## Explicit exclusions and separate follow-up product outcomes

| Follow-up outcome | Reason it stays separate / decision needed |
| --- | --- |
| Unassigned reception backlog (QA F04) | Decide default My Work/backlog visibility, counts, ownership policy and read needs. Current assignee-me behavior remains. Foundation cannot add a count/read or silently broaden scope. |
| Placement cancellation | Requires approved audited cancellation semantics/model; do not use deletion or task cancellation as a substitute. |
| Placement booking workflow redesign (F11) | Learner matching, booking/result stages, defaults and persistence need dedicated product contract and synthetic validation. No modal restructuring in this outcome. |
| Family/contact/CRM continuity in dossiers | New relationship reads or identity inference require separate outcome. Shared phone does not prove family/siblings. Existing safe context links may be styled, not expanded. |
| Dedicated walk-in completion | Remains separate from O3 and Foundation; coordinate learner/admission/group/payment/conversion without fake CRM facts under an approved workflow. |
| Enrollment consequential-action safety | P1 review/pending/confirmation/rejection/email behavior requires separate sensitive architecture and owner approval before handler changes. A shared Dialog is not approval. |

Also excluded: finance/revenue calculations or repair, receipt/PDF redesign, new reads or migrations, permission changes, provider/email/WhatsApp API integration, availability engine, new saved Views, configurable table/form/dashboard engines, global command palette, director metrics/product design, portal migrations, custom font/dark mode/decorative animation and wholesale page conversion. Copy guidance for future receipt/attendance work does not commission those migrations.

## Rollout, recovery and documentation

No deployment or runtime change now. The #102 prerequisite baseline is already adopted; after owner acceptance of UIF-r1, implement the single scoped outcome from then-current main; use [implementation](../../ai/templates/IMPLEMENTATION_TASK.md), [review](../../ai/templates/REVIEW_TASK.md) and [rollout](../../ai/templates/PRODUCTION_ROLLOUT.md) templates. Exact-SHA required CI and separate independent review precede human release approval. Author confirms CI scheduling and stops polling; pending CI is not review readiness. No internal reviewer subagent or author-issued formal verdict.

Future release contains presentation only; #102's separately approved read migration must already be compatible. Recovery is approved source rollback to the adopted #102 baseline, never SQL/data rollback, replayed commands or altered receipts. Record actual implementation/merge/deployment/Production verification separately. Update architecture/workflows with evidence only when behavior is implemented; this PR links the proposed contract without claiming a new deployed foundation. Existing product/security rules remain unchanged.

## Owner decisions required

| Decision | Options / consequences | Recommendation / blocking status |
| --- | --- | --- |
| Accept UIF-r1 for future implementation? | A: accept exact three-pilot outcome plus bounded dashboard/Placement read-state corrections and drawer presentation order. B: return specific scope/visual changes; revise before implementation. | Recommend A. **Blocking implementation; not yet approved.** No enrollment effects or separate QA outcomes included. |
| Baseline adoption evidence | #102 head `8f12f674f1c1fd910b8410b4bbb2d4d3b3917e3c` merged as `3c462f7fce87261ff92c565fecf8ab652262bb81`; migration 109 and matching Production frontend were verified compatible in the [release closeout](../evidence/receptionist-production-ux-corrections-2026-10-05.md#production-closeout--2026-10-05), indexed by [CURRENT_STATE](../../ai/CURRENT_STATE.md#post-outcome-3-receptionist-ux-correction-production-closeout). | **Satisfied.** Future UIF implementation still requires explicit owner acceptance and must branch from then-current main. |

No new owner decision is needed to gather safe missing source/test evidence within this scope. A changed product/security/read boundary requires explicit decision, not an implementation shortcut.

## IMPLEMENTATION CONTRACT

**Scope/revision:** owner-approved UIF-r1, one outcome with Stage 1 primitives, Stage 2 three pilots plus two bounded read-state applications, Stage 3 verification/guidance. Expected modules and classifications are the component and pilot manifests above. No database objects/migration filenames belong to Foundation; #102's inspected migration 109 is prerequisite evidence only.

**Prerequisites:** record exact owner approval and plan revision; confirm the adopted #102 baseline remains present on then-current main; create named feature branch from then-current main; preserve unrelated work; inspect current cumulative contracts and actual adopted helper interfaces. Do not implement from correction/architecture branches. Release additionally requires compatible prerequisite deployment, successful exact-SHA CI, separate independent review and explicit owner release approval.

**Invariants:** the four named interaction invariants, O3 predicates/commands, stored-role boundaries, fixed safe acquisition projection, contact/learner and status/task/activity separation, task-assignee/prospect-owner separation, trusted conversion, immutable financial snapshots and inactive provider gates remain binding. No new reads, altered RPC semantics or sensitive write changes.

**Acceptance:** F1–F11 and actual shared component consumption by all pilots; preserve required tests. Report failures and INCONCLUSIVE evidence honestly. Bounded P1 read-state fixes pass only with identical read contracts and financial/enrollment behavior. Do not relabel a wider repair as presentation.

**Stop conditions:** missing owner approval or loss/regression of the adopted #102 baseline; need for new fields/reads/permissions/migration; inability to preserve authoritative civil display or safe labels; proposed changes to My Work default, enrollment/finance/provider effects, placement semantics or CRM predicates; unsafe Production observation or credentials; unexplained failed/insufficient tests; new boundary conflicts. Continue safe evidence gathering in the same outcome, but obtain owner scope/architecture decision before crossing the boundary. Never guess time, show failure as zero, expose private fields or weaken a test to finish.

**Handoff:** record approved revision, branch/head/base, PR, local tested SHA/tree, checks and CI run/status/tested merge SHA where applicable; one focused author self-check and documentation changes. Confirm remote scheduling then stop polling under AGENTS. Coordinator verifies terminal checks before separate exact-SHA review. Preserve merge/release hold. Future screens adopt this contract when touched by an authorized outcome; deviations need documented rationale and review, not a new universal engine.
