# Owner summary

**RCC-B1 — Responsive Opportunities presentation. Revision B1-r3, 2026-10-07. Status: OWNER APPROVED FOR IMPLEMENTATION (2026-10-07), all decisions as recommended; approval carried forward from B1-r1 through B1-r3.** Child of the active [RCC-r1](rcc-r1-receptionist-crm-completion.md#rcc-b1--responsive-opportunities-presentation) plan. The owner approved revision B1-r1 with D1 A, D2 C, D3 A, D4 A, D5 B, D6 B, D7 B and D8 A. The independent review of B1-r1 returned CHANGES REQUIRED, and B1-r2 incorporated those corrections. The re-review of B1-r2 returned CHANGES REQUIRED for R1 and R2 only, which B1-r3 incorporates, including the owner's R1 clarification (no tooltip on Autres actions). D1–D8 are unchanged ([approval record](#owner-approval-record), [B1-r2 corrections](#b1-r2-review-corrections), [B1-r3 corrections](#b1-r3-re-review-corrections)). Implementation itself is **not yet authorized**: it still needs exact-SHA independent re-review of B1-r3, the architecture PR merged, and a separate explicit owner instruction. Merge and release are not authorized. **Update (2026-10-07):** all three conditions were met; the owner authorized implementation of B1-r3, which is recorded in the [implementation record](#implementation-record). Merge and release remain unauthorized.

## What will change

The CRM Opportunities workspace (`/crm/leads`) and the lead drawer it shares with Tâches and the Admissions Calendar will be reorganized for five widths: 1440, 1280, 1024, 768 and 390 CSS px. The changes:

- One compact header and one toolbar row replace the current five stacked rows (header, count, views, filters, notice).
- The Kanban fits all five stages at 1280 and 1440. At narrower desktop widths it scrolls inside its own region, with visible cues and a way to jump to a stage.
- Phones and tablets use a stage-navigated list by default.
- The drawer gets a sticky header. Its four inquiry fragments become one **Demande** section, and history opens collapsed.
- Dialogs keep their submit buttons and error messages visible.
- The desktop telephone-launch link is removed. **Enregistrer un appel** stays everywhere.
- A confirmed keyboard defect is fixed: one Escape on a drawer menu currently closes the whole drawer.

## What staff/users will be able to do

The receptionist will see the whole pipeline at common laptop widths. They can find, filter and open a prospect with less scrolling. On a phone, using touch alone, they can do everything listed in the phone acceptance constraint: open a prospect, see its stage, record an interaction or call outcome, manage the next follow-up, start, continue or open enrollment, use overflow actions, review recent history and close the drawer.

## What remains restricted

Nothing about authority changes:

- commercial status still comes only from guarded server commands, and drag-and-drop only opens those guarded dialogs;
- conversion is still only through a trusted linked Confirmed/Validated enrollment;
- roles, permissions, RLS, finance, Meta/lifecycle, task semantics and the RCC-A1/RCC-A2 workflows are untouched.

The shared admin sidebar is not changed by the recommended scope.

## UI impact

Presentation only, built from the deployed [UI Foundation](english-hills-ui-foundation.md) ([ADR-005](../decisions/ADR-005-operational-ui-foundation.md)) tokens and primitives. No new design system. The affected surfaces are Opportunities, the shared lead drawer and the CRM dialogs. Tâches, Calendar and Students may only change through the shared drawer and dialogs, or through opt-in shared-component variants whose defaults stay unchanged.

## Database impact

**None.** No migration, schema, RPC, grant, RLS or read-shape change. Every count, label and row used below is already returned by existing reads (verified against migration 107's `crm_get_opportunities`, the latest definition).

## Important security decisions

- No new reads or payload fields.
- Launching a call or WhatsApp still records nothing.
- Hiding a launch link removes no recording capability.
- The Escape fix is a page-local guard. Dependency or lockfile changes are out of scope.

## Risks / owner review points

**Tier 2:** shared UI behavior with no sensitive backend change. Review points:

- The drawer is shared with Tâches and the Calendar.
- The CRM dialogs host the RCC-A1 and RCC-A2 flows. Only their container layout may change.
- Breakpoint edges at exactly 640 and 1024 can resolve differently in WebKit with classic scrollbars. CSS and JS therefore share one breakpoint definition, tests assert the active mode first, and both sides of 639/640, 767/768 and 1023/1024 must pass.
- Several existing browser assertions must be updated deliberately: the `tel:` link and the Acquisition/Demande labels.

Owner decisions D1–D8 were approved as recommended on 2026-10-07 ([approval record](#owner-approval-record)).

## Contract identity, baseline and evidence limits

- **Revision:** B1-r3, on architecture branch `docs/rcc-b1-architecture` (PR #114).
  - B1-r1 (`4ae6bbf…`) was owner approved on 2026-10-07.
  - The independent Tier-2 review of `225d17d1e6fa998ed0dd7ecfebd9d9f538164d8e` returned CHANGES REQUIRED ([review](https://github.com/elforssa/english-hills-admin/pull/114#issuecomment-6037684885)).
  - B1-r2 resolved findings I1–I5 and the five test gaps; see [B1-r2 review corrections](#b1-r2-review-corrections).
  - The re-review of `9068324558f0a739a4d8c358cc090f25a3b6d9a6` returned CHANGES REQUIRED for R1 and R2 only ([re-review](https://github.com/elforssa/english-hills-admin/pull/114#issuecomment-6038018694)). B1-r3 resolves both; see [B1-r3 re-review corrections](#b1-r3-re-review-corrections).
- **Baseline:** freshly fetched `origin/main` = `13c1db1a3862317f2b658780d0f3e8a9343bdbec` (PR #113 merge, RCC-A2 closeout), as expected.
- **Recorded state:** [CURRENT_STATE](../../ai/CURRENT_STATE.md) records the deployed source as `79b0835…` (PR #112) with Production at migration 112. The baseline differs from it only by documentation. RCC-A1 and RCC-A2 are deployed and Production verified.
- **No Production access:** no Production read or mutation was performed.
- **Local evidence.** The app ran with `next dev` on `localhost:3101`. Its working tree was byte-identical to the baseline (`git diff 5ed56d2 origin/main` is empty). The database was local Supabase `127.0.0.1:54321` at ledger 112.
  - **Synthetic fixture:** 22 prospects across all stages, created through the real guarded RPCs. One prospect has a long mixed Arabic/French name and 18 history entries in its first loaded page.
  - **Engines:** a receptionist session was driven with Playwright in headless Chromium and WebKit at 1440×900, 1280×800, 1024×768, 768×1024 and 390×844. Touch emulation was used below 1024.
  - **Cleanup:** all synthetic rows were removed afterwards; the local database returned to zero CRM rows, policies and users.
  - **Screenshots:** kept outside the repository (scratchpad, not committed). The metrics below are the evidence of record.
- **Limits:**
  - Inquiry answers were route-fixtured, because manual prospects have no form submissions.
  - No CONVERTED prospect exists in the fixture, because conversion requires a trusted Confirmed enrollment and none was created. The Inscription confirmée column was observed empty.
  - No real device was used. The iOS dynamic toolbar, on-screen keyboard and 200% zoom were not exercised.
  - Headless WebKit on this macOS host used classic scrollbars. Its effective viewport was about 5px narrower, which moved the exact 768 and 1024 edges (see finding X1).

## Current-state findings at each width

Shared source facts:

- **Shell:** the [shared sidebar](../../../src/components/layout/Sidebar.jsx) is 240px at ≥1024 (`lg`). Below that it becomes a 56px top bar with modal navigation.
- **Default layout:** [CrmWorkspace](../../../src/components/crm/CrmWorkspace.jsx) defaults to **List below 768px** (`matchMedia('(max-width: 767px)')`) and to Board otherwise. The `layout` URL parameter overrides the default, and `view=closed` forces List.
- **Board columns:** the [board](../../../src/components/crm/OpportunitiesBoard.jsx) uses five fixed 280px columns in an `overflow-x-auto` region, a scroll width of 1448px.
- **Drawer:** the [drawer](../../../src/components/crm/LeadDetailSheet.jsx) is a modal Radix sheet: full width below 640px, 620px above.

| Width | Shell | Default view | Page horizontal overflow | Board area → stages fully visible | First result top / results in first viewport | Drawer |
| --- | --- | --- | --- | --- | --- | --- |
| 1440×900 | Sidebar 240 | Board | 0 (both engines) | 1152px → **3 of 5**; Qualifié clipped at its right edge, Inscription confirmée hidden | 502px / 8 | 620px modal; 2.9 viewport-heights long |
| 1280×800 | Sidebar 240 | Board | 0 | 992px → **3 of 5** | 502px / 8 (partly visible) | 620px; 3.3 heights |
| 1024×768 | Chromium: sidebar 240. WebKit: top bar | Board | 0 | Chromium 736px → **2 of 5**. WebKit 971px → 3 | 502px (Chromium) / 621px (WebKit) | 620px leaving 404px; 3.4 heights |
| 768×1024 | Top bar 56 | Chromium: Board. WebKit: List | 0 | 720px → **2 of 5** | 616px | 620px leaving 148px; 2.6 heights |
| 390×844 | Top bar 56 | List (mixed stages) | 0 | Forced Board: 358px → 1 of 5 | **656px / 1 card**; with filters open **1004px / none** | Full width; 3.3–3.4 heights |

### Per-width observations

**1440.**
- About 56% of the viewport height is chrome above the first card:
  - header with description: 56px;
  - count row with the Tableau/Liste toggle: 36px;
  - nine view chips: 40px;
  - FilterBar: 182px, made up of search with its label, the inline Programme facet with "Chercher d’autres valeurs", a separate "Plus de filtres" row and the summary line;
  - the "Le Tableau montre…" notice.
- The last two stages sit off-screen with no visible scroll cue. The scrollbar sits under the tallest column, far below the fold.
- Cards are 264×243px. Each repeats the stage badge already given by its column, shows a full "Responsable du prospect : Non attribué" footer, and "Intérêt déclaré : Programme à préciser" even when nothing is known.

**1280.** Same stack; three stages visible. The view chips overflow by 161px with no affordance.

**1024.**
- Chromium keeps the 240px sidebar, leaving a board narrower than the 768 tablet's: only two stages are visible. The view chips overflow by 417px.
- The enrollment dialog's step 2 scrolls internally, and its submit button is off-screen until scrolled.
- The card overflow trigger is 32×36px, below the 36px desktop control size.

**768.**
- Two stages are visible.
- The List table overflows its container by 84px.
- Under touch, the global 44px rule (`.operational button { display: inline-flex }` in [globals.css](../../../src/app/globals.css)) turns the card's identity button into a row. Parent and learner names are squeezed side by side; see finding X3.

**390.**
- The header block is 112px. Search, the inline Programme facet and "Plus de filtres" take 288px, and opening filters makes them 636px. The nine view chips overflow by 795px.
- The list mixes all stages under per-card stage labels. Stage navigation exists only as the "Statut" select hidden in "Plus de filtres".
- In the drawer:
  - the close button scrolls away with the content, because the sheet is the scroll container;
  - quick actions wrap to two rows (three in WebKit);
  - history starts about 1.6–1.9 screens down.
- The enrollment dialog's step 2 scrolls internally and its submit button is off-screen.

### Cross-width findings

| ID | Finding | Evidence |
| --- | --- | --- |
| X1 | **Edge instability at exactly 768 and 1024.** With classic scrollbars, WebKit applied the narrower layout: top bar at 1024 and List at 768. Chromium applied the wider one. Real iPad/iPhone Safari uses overlay scrollbars, but desktop Safari with "always show scrollbars" will hit this. | Measured in both engines. |
| X2 | **One Escape keypress on an open drawer menu closed both the menu and the whole drawer**, in both engines at all five widths. It affects **Autres actions** and the open-task **Plus d’options** menus, in Opportunities, Tâches and the Calendar. Likely cause: `@radix-ui/react-menu` bundles a nested `react-dismissable-layer` 1.1.11, while `react-dialog` uses the top-level 1.1.19, giving two independent dismiss stacks. | Measured; versions read from `node_modules`. |
| X3 | The global touch rule makes the card identity `button` inline-flex, so the parent and learner spans sit side by side. | 768 and 390 screenshots; source. |
| X4 | No page-level horizontal overflow at any width or engine. Board overflow is already contained. | `documentElement` and `#main-content` overflow are 0 everywhere. |
| X5 | **The only CRM `tel:` link is "Appeler {numéro}" in the call dialog**, rendered at every width. The drawer shows the number as plain text. `test-crm-phase4-browser.mjs` asserts the link at 1440 and that clicking it records nothing. The finance page has an unrelated `tel:` link, out of scope. | Source. |
| X6 | The drawer repeats learner, age and programme in both the description and a bordered block. Inquiry context is split across four places (see [Demande](#demande-definition)). | Source and screenshots. |
| X7 | History lists every event, 18 entries loaded for the rich fixture prospect (page size 20). Bookkeeping (Prochaine action planifiée, Action terminée, Prospect créé, Nouvelle demande) interleaves with real exchanges. | Screenshots. |
| X8 | `CrmEnrollmentDialog` and `PlacementTestModal` cap height with `100vh`; `CrmActionDialog` uses `100dvh`. No dialog has a sticky footer, so the error alert and submit button scroll together at the end. | Source; dialogs measured to fit the viewport. |
| X9 | Every dialog stayed within the viewport at every width. Call, schedule and enrollment step 1 never needed internal scroll; enrollment step 2 did at 390, and at 1024/1280 in Chromium. | Measured. |

## Confirmed problems versus preferences

**Confirmed defects.** Each breaks an approved UIF rule or loses context:

- X2: the drawer is lost on Escape (UIF F9: Escape closes only the topmost layer).
- Close control unreachable after scrolling the drawer.
- X3: card identity layout under touch.
- Board stages hidden at 1440/1280 with no affordance (UIF: a bounded scroll region must be discoverable).
- Hidden view-chip overflow.
- At 390, no result is visible in the first viewport once filters are open. UIF F8 requires that the result area be reachable without the filter stack consuming the viewport; currently only one card shows even with filters closed.
- Dialog footers and errors can be off-screen (X8, X9).
- X1: edge instability.
- The List table overflows at 768.

**Confirmed inefficiencies:**

- about 500px of chrome before the first card on desktop;
- 243px cards with duplicated stage and owner information;
- the duplicated learner block in the drawer;
- fragmented Demande;
- history noise;
- the telephone link that is not useful on desktop (X5).

**Design preferences.** These need owner judgement and are collected as decisions D1–D8: exact history summary, phone/tablet presentation, sidebar mode, and drawer modality.

## Recommended responsive model

Three bands use the existing Tailwind breakpoints. No new tokens.

| Band | Range | Acceptance widths | Shell (unchanged) | Default presentation | Drawer | Filters |
| --- | --- | --- | --- | --- | --- | --- |
| Phone | < 640px | 390 (and 320 reflow) | 56px top bar | **Stage list**: stage chips + single-column cards (D5) | Full-width, full-height sheet (D6) | "Filtres" button → filter sheet |
| Tablet | 640–1023px | 768, and 1024 when an engine resolves it below `lg` | 56px top bar | **Stage list**: stage chips + two-column cards (D7) | 620px side sheet | "Filtres" button → filter sheet |
| Desktop | ≥ 1024px | 1024, 1280, 1440 | 240px sidebar (D4) | **Board**; List is a table | 620px side sheet, modal (D8) | Inline toolbar + compact disclosure row |

The existing **Tableau / Liste** toggle and the `layout` URL parameter keep working in every band, and the board stays contained wherever it is shown. `view=closed` still forces List. Explicit URLs keep their meaning; only the *default* moves from 768 to 1024.

**One breakpoint definition.** Bands are decided by exactly two media queries, the Tailwind defaults (no `screens` override in `tailwind.config.js`):

- `sm` = `(min-width: 640px)`;
- `lg` = `(min-width: 1024px)`.

CSS uses the `sm:`, `max-sm:` and `lg:` variants. JavaScript calls `matchMedia` with **the identical query strings**, exported once from a shared presentation constant (for example `BAND_QUERIES` in `src/lib/crm/presentation.mjs`). No other width threshold may decide Opportunities layout. In particular, the current `matchMedia('(max-width: 767px)')` default in `CrmWorkspace` is replaced by the `lg` query (D7), and no `max-width: 639px`-style near-duplicates are added. Within one engine, CSS and JS therefore always land in the same band.

**Active mode, not nominal width.** The workspace root exposes its resolved band (`data-band="phone|tablet|desktop"`) and presentation (`data-presentation="board|stage-list|list"`), both derived from the same queries and the URL. With classic scrollbars WebKit can resolve an exact edge (640 or 1024) about 5px lower than Chromium (X1). So every acceptance test first reads the active band and presentation, then asserts **that mode's** criteria. A test never assumes both engines resolve the same branch at a nominal edge width.

**Edge robustness rule.** Tests run both sides of each edge, in Chromium and WebKit:

- **639 / 640:** phone ↔ tablet. Controls the D2 `tel:` gating, full-screen versus 620px sheet, one- versus two-column cards and the quick-action grid.
- **767 / 768:** a regression of the old default threshold that D7 removed. Both sides must resolve to the tablet band and the stage list.
- **1023 / 1024:** tablet ↔ desktop (stage list ↔ board default, top bar ↔ sidebar).

At each edge, both sides must satisfy the criteria of the band they actually resolve to. The desktop board is therefore specified to fit all five stages at 976px (1024 without the sidebar, Tableau active) and to scroll in a contained way at 736px (1024 with it).

## Page header and toolbar

Opportunities uses opt-in compact variants of `PageHeader` and `FilterBar`. The Students and Tâches defaults are unchanged.

| Element | Desktop (≥1024) | Tablet (640–1023) | Phone (<640) |
| --- | --- | --- | --- |
| Header row | Title **Pipeline admissions**. The description slot becomes the live count: "22 prospects correspondants · 2 clôturés (Liste)", replacing the separate count row and the "Le Tableau montre…" notice. Actions: Tableau/Liste segmented toggle (`aria-pressed`) and primary **Ajouter un prospect**. | Same | Title (20/28) and count. **Ajouter** primary (icon + label, accessible name "Ajouter un prospect"). Tableau/Liste toggle stays reachable in the toolbar row. |
| Toolbar row | Search (visible label, flexible) · **Vue** select (below 1280 only) · Programme select · **Filtres · n** disclosure · **Effacer les filtres** (only when filters are active) — one row | Search, full row. Then **Vue** select · **Filtres · n** · toggle. | Search, full row. Then **Vue** select · **Filtres · n**. |
| Views | ≥1280: compact chip row (36px) with all nine views. If it ever overflows, it scrolls inside its region with an edge fade. Below 1280: the **Vue** select. | Vue select | Vue select |
| Stage navigation | Board jump control, only when stages are clipped (see [Kanban](#kanban-and-list-behavior)) | Stage chips with counts | Stage chips with counts |
| Active filters | Removable chips row, shown only when something is active. The polite live summary is retained (visually hidden when zero). | Same | Same |

**Vertical budget.** The budget depends on the **active band and presentation**, read from `data-band`/`data-presentation` before asserting, never on the nominal width. Conditions: no active filters, no notices, ordinary fixture text.

| Active mode | Applies at (typical) | Budget |
| --- | --- | --- |
| Desktop band, board presentation | 1440×900, 1280×800, 1024×768 when `lg` matches | Top of the first card ≤ **300px**, and the board region ≥ **55%** of viewport height |
| Desktop band, list (table) presentation | Desktop with Liste chosen | First table row ≤ **300px** |
| Tablet band, stage list | 768×1024, 767, 640, and 1024×768 when `lg` does not match (WebKit classic scrollbar) | First result card ≤ **340px** |
| Phone band, stage list | 390×844, 639 | First result card ≤ **360px**, and at least the first two results begin in the first viewport |
| Tablet or phone band with Tableau toggled | Any | No vertical budget; containment and overflow criteria only |

Exactly one budget applies to each rendered mode.

## Kanban and list behavior

**Board** (desktop default; anywhere when toggled):

- **Columns.** Five stages in `repeat(5, minmax(184px, 1fr))` with an 8px gap. The maximum width follows the existing `wide` frame (1600px), which caps a column at about 304px. All five stages fit at board widths of 952px or more: 1440 gives about 224px and 1280 about 192px. 1024 without the sidebar fits too, at about 188px. At 1024 with the sidebar (736px), about four columns show and the rest scroll.
- **Scroll container.** One bounded container scrolls on both axes. At ≥1024 with a viewport at least 640px high, it fills the remaining viewport height (flex layout, minimum 360px). Otherwise it uses natural height with horizontal scroll only. The page itself never scrolls horizontally.
- **Column headers** are sticky at the top of the board container: stage name (16/24 semibold) and count (tabular numerals, "—" when unavailable).
- **Discoverability.** When `scrollWidth > clientWidth`:
  - the scrollbar stays visible and is never hidden;
  - a decorative edge fade (`aria-hidden`) marks each clipped side;
  - an **Aller à l’étape** button group lists each stage with its count, and each button scrolls its column into view. These buttons only scroll the board; they never filter.
- **Keyboard.** The region stays focusable and labelled ("Tableau des opportunités, défilement horizontal"), and native arrow and Shift-wheel scrolling work.
- **Drawer open and close.** The board stays mounted while the drawer is open; opening or closing the drawer does not remount it, so its scroll position is naturally kept. Focus restoration is unchanged.
- **Scroll restoration after action refresh (I4).** The existing refresh stays authoritative and unchanged. Today `crm:refresh` runs `setCursors([null])` and `setGeneration(x => x + 1)`, and the board is keyed `filterKey + generation`. Every action therefore **remounts** the board, which resets each column's local paging, and that reset stays. Scroll position is restored *around* the rebuild as presentation state only:
  1. **Storage.** A ref owned by `CrmWorkspace`, outside the keyed board subtree: `{ filterKey, left, top }`. It is never stored in the URL, React Query, local storage or server state.
  2. **Capture.** Inside the existing `crm:refresh` handler, *before* calling `setGeneration`, read `scrollLeft` and `scrollTop` from the current board scroll container and save them with the current `filterKey`. Because the save happens synchronously at refresh time, the value is the one the user saw.
  3. **Rebuild.** The existing generation bump and cursor reset run unchanged. Columns remount with fresh first pages; no stale column paging is retained, and no fetch or paging semantics change.
  4. **Restore.** After the new board has committed **and** its initial data has rendered, restore the saved position once. Use a layout effect in the board keyed to generation and data readiness, or a ref callback plus `requestAnimationFrame`. Restore only if the saved `filterKey` equals the current one; a filter, view or layout change discards it. Clear the saved value after the attempt.
  5. **Clamping.** Restoration uses `min(saved, scrollWidth - clientWidth)` horizontally (and the same vertically), never negative. If the board no longer overflows, it stays at 0.
  6. **Scope.** Only the board's own container is scrolled. Page-level horizontal scroll stays forbidden, and `window.scrollX` must remain 0.
- **Drag-and-drop** stays a desktop pointer convenience that opens the same guarded dialog as `opportunityAction` (unchanged). It is never required: every route is in the card overflow menu and the drawer. No drag-and-drop on touch.
- **Paging.** Per-column paging ("Voir les suivants / Précédents") is unchanged.

**Stage list** (phone and tablet default):

- A **group of stage chips** (`role="group"`, label "Étapes") sits above the list. Which chips appear depends on the selected high-level view; the population comes from migration 108's `opportunity_ids`, where `closed` = `LOST`/`NOT_QUALIFIED`:

| Selected view | Chips shown | Notes |
| --- | --- | --- |
| Any view except `closed` | **Tous**, Nouveau, Contact en cours, En discussion, Qualifié, Inscription confirmée | An extra selected chip (Perdu or Non qualifié) appears only while the `stage` URL value is one of those, chosen through the Statut filter |
| `closed` | **Tous**, Perdu, Non qualifié | Open-stage chips are not shown, because they are always 0 in this view |

- **Tous** always means *every opportunity in the currently selected view and filter context*, never every opportunity globally. Its count is the existing `total`, which in views that include closed prospects (for example `all`) includes them; the header's "dont n clôturés" link already explains this. Selecting **Tous** removes the `stage` URL parameter.
- Each stage chip's count is that stage's value in the existing `counts` object ("—" when the read is unavailable). Counts come from `matching`, which ignores `p_stage`, so they stay stable while switching chips. A chip with count 0 stays selectable and then shows the truthful filtered-empty state.
- **Chips set the existing `stage` URL parameter**, which becomes `p_stage` in list mode. That is the same mechanism as today's Statut select, so the chips and the select stay synchronized, and selecting a chip resets list paging.
- Counts are display data only. They are never used to decide a command, enable a transition, or as write authority.
- The chip row may scroll horizontally *inside itself*, with an edge fade. On a 390px phone it never pushes the page.
- **Cards** are one column below 640px and two columns at 640–1023px. With **Tous** selected, each card shows its stage badge; with a single stage selected, the badge is hidden. The current per-card stage label above the card is removed.
- The cursor pager (Précédent / Suivant) is unchanged.

**List table** is desktop only (≥1024), with the existing columns. Below 1024, List renders the same cards as the stage list. This removes the 84px table overflow at 768.

## Card hierarchy

The board card shows, top to bottom:

1. The **parent name** (semibold, wraps, never clipped) and the named overflow trigger (36×36 desktop, 44×44 touch).
2. **Learner · age** (13px secondary; "Apprenant à préciser" when unknown).
3. The **next action**: title and authoritative scheduled label, prefixed with "En retard ·" in text (not colour alone) when overdue. Optional qualifiers on the same line or the next: "Rendez-vous convenu" when the existing `next_task.schedule_kind` is `appointment`, "Tentative n sur 5", "n appels infructueux". Shown otherwise: "Test de niveau · …" from `next_placement`, "Prochaine action à choisir", or "Suivi clos".
4. A **meta line** (12px muted): the source label · the programme (only when known) · "Dernière activité {date}".

**Removed from board cards:**

- the stage badge, which the column already conveys;
- the "Responsable du prospect" footer. The owner stays visible in the drawer header, the List table column and the owner filter, consistent with the approved rule that assignment is secondary.

The card target is **≤ 150px tall** for ordinary fixture text at desktop, down from 243px.

**Actions:**

- **Primary:** open the prospect. A single identity button opens the drawer; nested interactive elements inside it are not allowed.
- **Secondary:** none visible on the card. It holds no extra command buttons.
- **Overflow** keeps exactly today's items, only grouped with separators:
  1. Avancer · {stage} / Ouvrir l’inscription;
  2. Clôturer comme perdu and Clôturer comme non qualifié, or Rouvrir;
  3. Attribuer un responsable.

Every item routes through the existing guarded dialogs.

**Touch layout fix (X3).** The identity button explicitly stacks its content vertically (block or column flex, start-aligned, left text) at every width, independent of the global touch rule. The global rule itself is not edited.

List and phone cards use the same hierarchy plus the stage badge (with **Tous**), the closure reason and date for closed prospects, and the owner line only in the desktop table.

## Filter behavior

| Width | Search | Frequent filter | Other filters | Active filters |
| --- | --- | --- | --- | --- |
| 1440 / 1280 | Toolbar row | Programme select inline. Its "Chercher d’autres valeurs" search and paging move into the Filtres panel. | **Filtres · n** opens a single compact row below the toolbar: Responsable, Canal d’acquisition, Source (with value search and paging) and Statut (List only). | Removable chips; Effacer les filtres |
| 1024 | Toolbar row | Programme inline | Same disclosure row, wrapping to at most two rows | Same |
| 768 | Full row | — | **Filtres · n** opens the existing `Sheet` (right side, 620px max) holding Programme and every other filter. A sticky sheet footer has **Effacer les filtres** and **Voir les résultats**, which closes the sheet. | Chips under the toolbar |
| 390 | Full row | — | Same sheet, full-width and full-height | Same |

Rules:

- **Immediate apply.** Changes apply as they do today, by patching the URL with the adopted helper. There is no "Appliquer" step, so the UIF composable-navigation invariant, debounce cancellation and Back/Forward behavior are unchanged.
- **Reset** semantics are unchanged: they clear search and refinements, keep View, layout, drawer and return context, and show the "Filtres effacés · vue …" notice.
- **Counts.** The active count excludes the view, the layout and the default owner, as today. The stage chip counts toward it only when a stage is selected, matching today's Statut filter.
- **Focus.** Closing the filter sheet returns focus to the Filtres button.
- **Facets** keep their bounded reads, paging and truthful read states.
- **Filter sheet structure.** The filter sheet (tablet and phone) uses the same I1 structure as the drawer: a non-scrolling `SheetContent`, a fixed header sharing its row with the primitive's single "Fermer", an inner scrolling body and a sticky footer (Effacer les filtres / Voir les résultats). It also uses the same I2 Escape guard. Its controls stay native (`select`, `input`, `details`): no Radix Select or Popover is introduced.

## Sidebar behavior

Recommendation (D4 A): **no change** to the shared [Sidebar](../../../src/components/layout/Sidebar.jsx) in RCC-B1.

The fluid board fits all five stages at 1280 and 1440 inside today's 240px sidebar. At 1024 the board is a deliberate, discoverable contained scroll, and the top-bar shell at 1024 (X1) also passes because the board fits at 976px. Changing the sidebar would affect every admin route for every role, which is the reason D4 B routes it to a separate UI Foundation outcome.

## Drawer and sheet behavior

**Container:**

- **Phone (<640):** full width and full height (`inset-0`), no rounded corners, 16px padding, `env(safe-area-inset-*)` padding at top and bottom. Without `viewport-fit=cover` that padding has no effect, and the global viewport meta is not changed.
- **≥640:** the existing 620px right sheet with an overlay radius.
- **Modality:** the sheet stays modal (D8 A), with a focus trap and an inert background.

**Scroll mechanism and the single close control (I1).** Today `LeadDetailSheet` puts `overflow-y-auto` on `SheetContent` itself. The primitive's own close button is a `SheetPrimitive.Close` positioned `absolute right-2 top-2`, with the visually hidden "Fermer" label, in [ui/sheet.jsx](../../../src/components/ui/sheet.jsx). Because it sits inside that scrolling element, it scrolls away. B1 fixes this **without touching the primitive**:

- `src/components/ui/sheet.jsx` is **not edited**.
- No second close button is added. The drawer has **exactly one** visible, accessibly named "Fermer" control: the primitive's existing one.
- `LeadDetailSheet` passes classes to `SheetContent` so that it becomes a **non-scrolling flex column**: `flex flex-col overflow-hidden`, full available height, with padding moved to the children. The primitive's `p-6` default is overridden by the call-site class, as today.
- **First child:** the header region, `shrink-0`. It reserves the close area with right padding (`pr-12`), so the title never sits under the button.
- **Second child:** the body, `min-h-0 flex-1 overflow-y-auto`. This is the drawer's only vertical scroll region.
- Because `SheetContent` no longer scrolls, the primitive's absolute close button stays pinned at the top-right of the visible drawer while the body scrolls.
- **Desktop and tablet (≥640):** a 620px side sheet, full viewport height, with the header at its top. The close button is 36×36 with a fine pointer; the existing touch rule makes it 44×44 with a coarse pointer.
- **Phone (<640):** the same structure, full width and full height. The header carries `env(safe-area-inset-top)` padding and the body carries `env(safe-area-inset-bottom)` padding. The close button is 44×44 under the existing touch rule.
- The same `SheetContent` element and component tree serve every band; only classes differ (see [I5](#b1-r2-review-corrections)).

**Header region** (the non-scrolling first child; given a bottom border):

- row 1: contact name as the title (wraps), sharing its row with the primitive's existing "Fermer" button, which needs no new markup;
- row 2: learner · age · programme;
- row 3: stage badge, then "Responsable : {label}" (12px muted);
- row 4: destinations, as plain text: "Tél. {numéro} · WhatsApp {numéro}".

The header must stay ≤ 140px at desktop and ≤ 168px on phone with ordinary text. Long names wrap, and the body never sits under the header.

**Body order.** The documented deviation from the UIF drawer order moves the next action above quick actions, because it holds the primary contextual command:

1. the existing unsupported-move notice, when present;
2. the **Prochaine action** panel: content and buttons exactly as today, with the primary first;
3. **Actions rapides**: Appel, WhatsApp, Note, Planifier and Autres actions, with unchanged handlers:
   - desktop and tablet: one wrapping row of five labelled buttons. **Autres actions keeps its visible label, as today** (owner decision R1). No tooltip, no `TooltipProvider` and no replacement `title` are added; at 620px the row may wrap to a second line;
   - phone: a 2×2 grid plus a full-width "Autres actions";
4. the failed-attempt panel and "Toutes les prochaines actions (n)", unchanged;
5. the reopen action for closed prospects, unchanged;
6. **Demande** (D1);
7. **Test de niveau**, unchanged logic;
8. **Inscription**, unchanged rules and actions (`enrollmentAction`, `continueHref`, `studentHref`);
9. **Historique** (D3).

The duplicated bordered learner block is removed; its information stays in the header.

**Footer:** no sticky drawer footer. The primary action sits in the Prochaine action panel, inside the first viewport on every band. That avoids two competing primary regions and keyboard overlap on phones.

**Close and back:**

- the X control;
- Escape, when no nested layer is open;
- a scrim click (≥640);
- browser Back, unchanged because opening a prospect already uses `pushState`.

Browser Back works in all three drawer hosts: Opportunities and Tâches push history through `CrmWorkspace`, and the Admissions Calendar through `router.push`. Focus restoration (origin element, else the page heading) is unchanged.

**Escape and Radix layering (I2) — mandatory.**

- **Root cause.** Dialog and Sheet use the top-level `@radix-ui/react-dismissable-layer` 1.1.19. Menu, Tooltip, Select, Popover, HoverCard and the other non-Dialog layers bundle 1.1.11. Each copy keeps its own layer stack and its own `document` keydown listener (capture phase, from `react-use-escape-keydown`), so a non-Dialog popup and the sheet each believe they are topmost.
- **Not allowed as a fix:** a Radix upgrade, a `package.json` or lockfile change, or an edit to `ui/sheet.jsx` / `ui/dialog.jsx`.

**Required behavior:**

1. The first Escape closes only the actual topmost popup (today a menu; any guarded Select, Popover, HoverCard or ContextMenu if one is ever added).
2. It does not close the underlying lead drawer.
3. Once no nested popup remains, a later Escape closes the drawer as UIF F9 already specifies.
4. A true Dialog opened above the sheet shares the 1.1.19 stack. It keeps closing first and the sheet does not react (unchanged). The guard must not interfere with that, nor with a busy dialog's existing Escape blocking.

**Why a plain `preventDefault` is not enough.** Both copies run the same handler (verified in the installed 1.1.19 and 1.1.11 builds):

```js
onEscapeKeyDown?.(event);
if (!event.defaultPrevented && onDismiss) { event.preventDefault(); onDismiss(); }
```

- **Listener order is not fixed (R2).** Each layer listens on `document` in the capture phase. The 1.1.19 sheet attaches its listener only **while it is the highest layer** of its stack: it detaches when a Dialog opens above it and re-attaches when that Dialog closes. The 1.1.11 popup attaches when it mounts. Either listener may therefore run first for a given keypress. **`defaultPrevented` determines whether another layer has already consumed the Escape.** No invariant in this plan depends on registration order.
- **Today's defect** (the order observed in the B1-r1 capture). The sheet's listener ran first, dismissed the sheet and marked the event `defaultPrevented`. The popup's own handler then skipped, and the popup disappeared only because the whole drawer unmounted.
- **Why preventDefault alone fails.** When the sheet's handler runs first, a bare `event.preventDefault()` keeps the drawer open, but the popup's handler (running second) sees `defaultPrevented` and **also** refuses to close. The first Escape would then do nothing.
- **What the guard must do instead.** Handle both orders. Where the event is not yet consumed, block the sheet **and** explicitly close exactly one popup. Where it is already consumed, do nothing.

**Implementation approach (page-local; detection does not depend on React open-state timing).** A small module under `src/components/crm/`, for example `useNestedLayerEscapeGuard` plus a `useGuardedLayer` helper, used by `LeadDetailSheet` and by the new filter sheet:

1. **Snapshot (detection).** While the sheet is open, register a `keydown` listener on **`window` in the capture phase**. For a real keypress it runs **before** every Radix `document` listener, because window capture precedes document capture, so the DOM is still unchanged. For an `Escape` event it records, keyed by the event object itself (for example a `WeakSet` of events), whether a nested non-Dialog layer is active. That is true if **either**:
   - **(a) target:** `event.target` is inside a popup surface, one of `[role="menu"]`, `[role="listbox"]`, `[role="tooltip"]` or `[data-radix-popper-content-wrapper]`; or
   - **(b) open popup:** the document contains an open non-Dialog popup, one of `[data-radix-popper-content-wrapper]`, `[role="menu"][data-state="open"]`, `[role="listbox"][data-state="open"]` or `[role="tooltip"]`.
   - Because the sheet is modal, any such popup belongs to the sheet's subtree or to a Dialog above it. In the second case the sheet is not the highest layer of its stack, its listener is detached, and the guard is never consulted.
2. **Controlled popups (closing).** Every non-Dialog Radix popup rendered inside the drawer or the filter sheet is **controlled**: `open` plus `onOpenChange` through `useGuardedLayer()`. Today that means exactly two popups: the Autres actions `DropdownMenu` and each open-task Plus d'options `DropdownMenu`. Any Select, Popover, HoverCard or ContextMenu added there within approved B1 scope must follow the same rule. B1 adds none, and no popup type is added just to satisfy this contract. Tooltip is not part of the drawer's popup set (R1). For each guarded popup:
   - **controlled state:** `open` and `onOpenChange` both come from `useGuardedLayer()`;
   - **registration:** the helper keeps a per-sheet stack of currently open popups in opening order, pushing on open and removing on `onOpenChange(false)`;
   - **idempotent close:** each entry's `close()` sets only its own `open` to false. If that popup is already closing or closed, it is a no-op. It never falls through to another entry and never touches the sheet.
   - **existing props kept:** for example the drawer menu's `onCloseAutoFocus` handling.
3. **Guard (order-independent).** Pass `onEscapeKeyDown` to `SheetContent`; it already forwards props to `SheetPrimitive.Content`. Radix calls it with the native event *before* checking `defaultPrevented`, whichever listener ran first.
   - **Case A — `event.defaultPrevented === true`.** A nested popup has already handled this Escape and dismissed itself. The guard does **nothing**: no `close()` call, no second popup closed. The sheet does not dismiss, because Radix sees the event as already prevented. The one-layer dismissal for this keypress is complete.
   - **Case B — `event.defaultPrevented === false`, and a nested popup is open** (the stack is non-empty, or `snapshot.has(event)`): call `event.preventDefault()` so the sheet does not dismiss, then call `close()` on exactly **one** entry, the **topmost** of the stack. Radix's normal close path runs, and the menu returns focus to its trigger. If the popup's own listener runs afterwards, it sees the prevented event and does nothing; the controlled close has already happened. If the snapshot saw a popup but the stack is empty (an unregistered popup), the drawer stays open and nothing else closes. The B1 browser test fails on that case, because the popup did not close.
   - **Case B, no nested popup open:** do nothing, and the sheet closes as UIF F9 specifies.
   - The decision is a pure function exported for unit tests, for example `nestedEscapeAction({ defaultPrevented, nestedDetected, openCount }) → 'none' | 'close-top' | 'allow-sheet'` in `src/lib/crm/presentation.mjs`.
4. **Cleanup.** Remove the window listener when the sheet closes or unmounts. Never call `stopPropagation` or `stopImmediatePropagation`.

**Result:**

- first Escape → only the topmost popup closes;
- next Escape (no popup left) → the drawer closes;
- a Dialog above the drawer → closes first via the shared 1.1.19 stack, unchanged; a busy dialog still ignores Escape.

Detection is DOM- and event-based. Closing is an ordinary controlled-state update made after the sheet has already been blocked synchronously, and `close()` is idempotent, so neither listener order nor React render timing can close two layers for one keypress.

**Coverage.** The guard is layer-generic. It covers the existing `DropdownMenu`s in the drawer (Autres actions; Plus d'options on open-task rows), and any `Select`, `Popover`, `HoverCard` or `ContextMenu` added in approved B1 scope to the drawer or the filter sheet. There is no tooltip on Autres actions (R1). Tooltip behavior elsewhere in the application is untouched. B1 itself adds no Radix Select or Popover: the drawer and filter controls stay native (`select`, `details`).

**Stop condition.** If this page-local guard cannot meet the required behavior without a dependency or shared-primitive change, stop under the existing escalation rule.

**Layering.** Action, enrollment and placement dialogs open above the sheet, then menus and toasts. Closing a dialog returns focus inside the drawer, as today.

**Single component tree (I5) — structural invariant.** RCC-A2's uncertain-retry state lives only in component state. `EnrollmentForm` inside `CrmEnrollmentDialog` keeps `frozen` (state) and `pending.current` (a ref holding the request key and payload). It survives today because the dialog is a stable child of `SheetContent`, rendered outside `ReadState`. B1 must keep that:

- **One tree.** There is exactly one `Sheet` → `SheetContent` → lead-workspace tree for every band. No `isPhone ? <PhoneSheet/> : <SideSheet/>` swap, no band-specific wrappers that change component identity or position, and no `key` that depends on band, width or presentation.
- **Dialog placement.** `CrmActionDialog`, `CrmEnrollmentDialog` and `PlacementTestModal` stay **direct, stably positioned children of that single `SheetContent`**. They are outside:
  - the header and body regions' conditional content;
  - `ReadState` and every loading or error branch;
  - any band, breakpoint or presentation conditional.
  Their existing mount conditions (`action && lead`, `enrolling && lead`, `placement !== undefined && lead`) are unchanged.
- **Class-only band differences.** Responsive differences are CSS classes (`sm:`, `max-sm:`, `lg:`) on the same elements. JavaScript band values may choose classes or default presentation, never which drawer or dialog subtree mounts.
- **No remount on breakpoint crossing.** Resizing or rotating across 640px or 1024px must not unmount an open dialog. This also holds for the drawer hosts' own keys (`AdmissionsCalendar` keys the drawer by `selected`; `CrmWorkspace` by lead and initial action); those keys stay unchanged and band-independent.

## Dialog behavior

Scope: `CrmActionDialog` (every action and manual creation), `CrmEnrollmentDialog`, and `PlacementTestModal` when opened from CRM.

- **Size.** Widths are unchanged (640 form / 576 / 512), bounded by viewport − 2rem. Height is `max-h-[calc(100dvh-2rem)]` everywhere, fixing `100vh` in the enrollment and placement dialogs. Dialogs stay centered on phone; the measurements show they fit.
- **Layout.** `DialogContent` stays the dialog's single scroll container (the primitive's existing `overflow-y-auto`, with the call-site `max-h`). The header scrolls with the body. The footer is **sticky**: the existing action-button row gets `sticky bottom-0`, an opaque background and a top border, as the last in-flow child, so it stays visible at the bottom of the dialog while the body scrolls under it.
- **Error alert in the sticky footer.** The form's existing error alert (`role="alert"`) moves into the sticky region directly above the buttons, so validation and submit are visible together. This covers the long RCC-A2 uncertain message, "Impossible de confirmer l’enregistrement. Réessayez sans modifier les champs pour éviter un doublon." The alert part of the sticky region is capped at about 40% of the dialog height and scrolls internally if longer, so a long alert can never push the buttons off-screen.
- **Space reservation.** A `ResizeObserver` on the sticky footer writes its height to a CSS variable on the scroll container (for example `--crm-dialog-footer`). The container sets `scroll-padding-bottom: var(--crm-dialog-footer)`, and the last body element gets equal bottom margin. The RCC-A2 error contract focuses the failing field with the existing `focus()` call; the browser then scrolls it into view above the footer, so no focus logic changes.
- **Structural limits** inside `CrmEnrollmentDialog`, `CrmActionDialog` and `PlacementTestModal`: only class names, plus one presentational wrapper around the existing alert and button row. No change to hooks, state, refs, handlers, request keys, component boundaries or the order of stateful components. `EnrollmentForm` must not remount.
- **Behavior is untouched:** busy/lock behavior, the frozen-uncertain retry state, request keys, expected versions, payloads, error mapping, step logic, success views, field validation, the 200-character completion counter, schedule-kind rules, reminder presets and the Casablanca help text.
- **PlacementTestModal** is shared with `/placement-tests` and `LegacyPlacementEditor`. Only the container (height unit and sticky footer) may change. Anything more is a stop condition, because placement redesign is a UIF exclusion.

## History behavior

The `Historique` heading is kept, since existing tests wait for it. The read is unchanged (`crm_get_timeline`, 20 per page, cursor).

**Collapsed (default; D3 A).** A "Derniers échanges" block shows the **three most recent meaningful entries** from the first loaded page:

- meaningful: calls and attempts, conversations, WhatsApp, notes, engagement, qualification, closure, reopening, placement events, enrollment start, conversion and conversion review;
- if none are meaningful, the three most recent entries of any type;
- actor display and body formatting are unchanged.

**Expanded.** A button, **Afficher tout l’historique** (`aria-expanded`/`aria-controls`), shows the complete chronological list, including task and assignment bookkeeping, with the existing **Plus récents / Charger les plus anciens** paging. It can collapse again.

**Truthful states.** No total is fabricated; the cursor read has no total. The read state (loading, error with retry, empty "Aucun échange enregistré.") is shown in both modes. The expanded state survives post-action refresh within the same drawer and resets for another prospect.

## Demande definition

Today "Demande" is fragmented across four drawer places plus the card:

| Today | Location | Read |
| --- | --- | --- |
| "Origine · {source}" line | Stage block | `lead.source_label` |
| **Contexte de la demande**: latest submission's source, date and ≤ 3 labelled answers | Own section | `crm_get_form_answers` (limit 5, offset 0), via `inquirySummary` |
| **Acquisition**: Première demande / Dernière demande (source · date) | Own section | `crm_get_operational_acquisition_summary` |
| **Réponses aux formulaires**: full paged answers | Collapsible | `crm_get_form_answers` (limit 5 / offset, lazy) |
| "Intérêt déclaré : … · {source}" | Card; programme also in the drawer description | `lead.program`, `lead.source_label` |

Approved single **Demande** section (D1 A), using the same reads and the same truthful per-read states:

```text
Demande
  Origine du prospect · {source_label | "Origine à préciser"}
  Dernière demande · {source or channel} · {date}
  Première demande · {source or channel} · {date}     ← only when it differs from the latest
  Intérêt déclaré · {programme label | "Programme à préciser"}
  Résumé de la dernière demande                       ← ≤ 3 labelled answers, source + date (unchanged rule)
  ▸ Toutes les réponses aux formulaires               ← existing paged list, still lazy
```

Nothing is removed. "Nouvelle demande" history entries remain in the expanded history. Each sub-part keeps its own read state, so a failed acquisition read shows "Informations indisponibles" for those lines only.

## Phone and touch behavior

At 390, using touch alone, with no hover dependency and no horizontal page scroll:

| Task | Path |
| --- | --- |
| Open a prospect | Tap the card identity (44px) |
| Understand stage | Selected stage chip, card badge under **Tous**, drawer header badge |
| Record an interaction or call outcome | Drawer **Prochaine action** primary (**Enregistrer un appel**) or Actions rapides → Appel / WhatsApp / Note; Autres actions → Conversation au centre / autre canal |
| Schedule or manage the next follow-up | Planifier; Replanifier / Annuler l’action; Toutes les prochaines actions |
| Start enrollment when eligible | Drawer Inscription → **Commencer l’inscription**, or card overflow → **Ouvrir l’inscription** (existing route) |
| Continue enrollment / open the learner | Drawer Inscription → **Continuer l’inscription** / **Ouvrir l’apprenant** (existing links, return context preserved) |
| Overflow and secondary actions | Card ⋯ and drawer **Autres actions** (44px items) |
| Review recent history | Derniers échanges → Afficher tout l’historique |
| Close or back out | Sticky **Fermer** (44px), browser Back |

Every target is at least 44×44px below 1024px or with a coarse pointer (existing rule). Hover-only information is not allowed: tooltips only supplement named controls.

## Accessibility

UIF F8–F10 stay binding. In addition:

- the stage chips form a labelled group with `aria-pressed`;
- the board jump buttons name their target stage and count;
- the sticky header keeps the title as the dialog's accessible name;
- disclosures (Filtres, history, all answers) use `aria-expanded`;
- edge fades are decorative;
- reduced motion disables sheet slide and scroll smoothing;
- 320 CSS px reflow and 200% zoom keep every action reachable without horizontal page scroll;
- contrast stays ≥ 4.5:1, and "En retard" is conveyed in text.

## Modules expected to change and shared-component blast radius

| Module | Expected change | Other consumers / regression scope |
| --- | --- | --- |
| [CrmWorkspace.jsx](../../../src/components/crm/CrmWorkspace.jsx) | Band defaults (`lg` query replaces `max-width: 767px`), `data-band`/`data-presentation`, compact header and toolbar, count line, stage chips, board height container, board-scroll capture ref in the existing `crm:refresh` handler (I4) | **Tâches** (`mode="today"`) shares the component; its header and WorkQueue must stay unchanged |
| [OpportunityFilters.jsx](../../../src/components/crm/OpportunityFilters.jsx) | Toolbar row, view chips/select, filter disclosure row, filter sheet, active chips | Opportunities only |
| [OpportunitiesBoard.jsx](../../../src/components/crm/OpportunitiesBoard.jsx) | Fluid grid, sticky headers, affordance, jump control (never a drop target), post-render scroll restore (I4) | Opportunities only |
| [OpportunitiesList.jsx](../../../src/components/crm/OpportunitiesList.jsx) / [OpportunityCard.jsx](../../../src/components/crm/OpportunityCard.jsx) | Card hierarchy, grouped overflow menu, touch layout fix, tablet card grid | Opportunities only |
| [LeadDetailSheet.jsx](../../../src/components/crm/LeadDetailSheet.jsx) | Non-scrolling `SheetContent` with fixed header and inner body (I1), order, Demande, history collapse, quick-action layout, Escape guard (I2); dialogs kept as direct stable children (I5) | **Tâches** and the **Admissions Calendar** |
| [LeadEnrollmentSection.jsx](../../../src/components/crm/LeadEnrollmentSection.jsx) / [LeadPlacementSection.jsx](../../../src/components/crm/LeadPlacementSection.jsx) | Spacing only, if any. Action rules and links unchanged. | Drawer hosts |
| [CrmActionDialog.jsx](../../../src/components/crm/CrmActionDialog.jsx) | Container and sticky footer; telephone-link gating (D2). No payload change. | Every drawer host plus manual creation |
| [CrmEnrollmentDialog.jsx](../../../src/components/crm/CrmEnrollmentDialog.jsx) | `100dvh` and sticky footer only: classes plus one presentational wrapper around the existing alert and button row; no hook, state, ref, handler or boundary change | Drawer hosts; the RCC-A2 suite |
| [PlacementTestModal.jsx](../../../src/components/placement/PlacementTestModal.jsx) | Optional container-only change | `/placement-tests`, `LegacyPlacementEditor` |
| [FilterBar.jsx](../../../src/components/operational/FilterBar.jsx) / [PageHeader.jsx](../../../src/components/operational/PageHeader.jsx) | Opt-in compact props only; default rendering unchanged | **Students**, **Tâches** |
| [presentation.mjs](../../../src/lib/crm/presentation.mjs) | Additive pure helpers: meaningful-event set, history summary selection, `BAND_QUERIES` (the single breakpoint definition), stage-chip set per view. Existing exports, including `phoneLinks`, unchanged. | Pure tests |
| New `src/components/crm/*` presentation modules: stage nav, filter sheet, `useNestedLayerEscapeGuard`/`useGuardedLayer`, the dialog-footer height observer | Allowed | — |
| **Not changed** | `Sidebar.jsx`, `globals.css` global rules, `tailwind.config.js`, `ui/sheet.jsx`, `ui/dialog.jsx`, `ui/tooltip.jsx` and other `ui/` primitives, `package.json` dependencies and the lockfile | — |

## Testing matrix

Local Supabase, synthetic data only, external delivery disabled. Two engines, five widths, plus edge pairs 639/640, 767/768 and 1023/1024. Every row first asserts the active `data-band` and `data-presentation`, then that mode's criteria:

| Check | Engines | Widths | Pass condition |
| --- | --- | --- | --- |
| Page overflow | Chromium + WebKit | All, plus 639, 640, 767, 1023, 320 | `documentElement` and `#main-content` horizontal overflow = 0 with board, list, filters open, drawer, dialogs |
| Board containment | Both | 1440, 1280, 1024, 1023 (and toggled at 768/390) | **The test first activates Tableau explicitly** (clicks Tableau or sets `layout=board`) whenever the default presentation is not the board, then asserts. 1440 and 1280: 5/5 stages fully visible. 1024 with sidebar (`lg` matches): ≥ 3 fully visible, the rest reachable by contained scroll and the jump control. 1024/1023 without sidebar (`lg` does not match), Tableau active: 5/5 fully visible. Toggled at 768/390: contained scroll, zero page overflow. |
| Vertical budget | Both | All | Assert the active mode first, then the single budget for that mode in [Page header and toolbar](#page-header-and-toolbar) |
| Breakpoint consistency | Both | 639, 640, 767, 768, 1023, 1024 | `data-band` equals the result of the shared `BAND_QUERIES` media queries; CSS-visible layout (sheet width, card columns, quick-action grid, sidebar) matches that band in the same engine; 767 and 768 both resolve to the tablet band and stage list |
| Card readability | Both | All | Long Arabic/French names wrap without clipping; identity stacks vertically under touch; desktop card ≤ 150px for ordinary text |
| Action reachability | Both | All | Every card overflow item and every drawer action is reachable by pointer and by keyboard; touch targets ≥ 44px below 1024 |
| Toolbar and filters | Both | All | Layout per the filter table; filters sheet below 1024; URL, visible controls and RPC arguments agree; reset and Back/Forward unchanged |
| Stage chips | Both | 768, 390, 767, 640, 639 | Chip set per view (`closed` shows Tous, Perdu and Non qualifié only); **Tous** count equals `total` for the current view and filters; stage counts equal `counts`; selection sets or clears `stage`; synchronized with the Statut select; pager resets. Clicking a chip issues **no** CRM command request (the test asserts zero write-RPC requests); dropping a dragged card on a chip or a jump button does nothing |
| Sidebar state | Both | All | Unchanged shell. Sidebar at ≥1024 or top bar below (WebKit edge accepted); mobile navigation focus trap unchanged |
| Drawer | Both | All, plus 639/640 | Width per band; `SheetContent` does not scroll and the body does; **exactly one** button named "Fermer" in the drawer (strict-mode locator), still visible and inside the viewport after scrolling the body to the bottom; no other close affordance added; body order; scrim/Back/X close; focus restoration; board scroll unchanged beneath |
| Escape layering | Both | 1440 and 390 (Opportunities), 390 (Tâches drawer), 390 (Calendar drawer), 390 (filter sheet) | The [Escape acceptance sequences](#escape-acceptance-sequences) E1–E6 pass exactly as written. The drawer contains no `role="tooltip"` element and no tooltip trigger on Autres actions (R1). B1 adds no Radix Select or Popover: the test asserts none exist in the drawer or filter sheet, or covers each one that does with E1's pattern |
| Board scroll after refresh | Chromium + WebKit | 1024 (sidebar) and 768 with Tableau | Scroll the board horizontally; open a prospect and perform an existing action that dispatches `crm:refresh`; assert the board remounted (column paging reset to page 1, for example a column advanced with Voir les suivants is back on its first page) **and** `scrollLeft` is within 24px of the saved value, clamped to the new maximum; `window.scrollX` stays 0 |
| Dialogs | Both | All | Within the viewport; sticky footer visible at the bottom of the dialog while the body scrolls; alert and primary action visible together; RCC-A2 error focus visible above the sticky footer |
| Phone dialog with long uncertain alert | Chromium + WebKit | 390×844 | Drive the RCC-A2 uncertain path (route-fulfilled 502 on `crm_start_enrollment`, as in `test-crm-rcc-a2-browser.mjs`) on the step with the most fields. Assert: the long uncertain alert is inside the sticky footer and does not push Annuler/Retour/submit off-screen; the body scrolls independently; a field focused by the error contract is fully visible above the footer; Tab and Shift+Tab stay in the dialog; zero page overflow; frozen state intact |
| History | Both | 1440, 390 | Collapsed shows ≤ 3 meaningful entries; expand and collapse; paging; read states |
| Demande | Both | 1440, 390 | All former information present; per-read failure isolation |
| Telephone (D2 C) | Chromium + WebKit (emulated pointer: Chromium `hasTouch`/`isMobile`, WebKit `hasTouch`, with `matchMedia('(pointer: coarse)')` asserted first) | 390 and 639; 640 and 768; 1440 | The Appeler `tel:` link appears **only when both** the viewport is below 640px **and** the pointer is coarse:<br>• <640 + coarse → link present, href `tel:+…`, clicking records no activity;<br>• <640 + fine/mouse → **no** `tel:` link;<br>• ≥640 + coarse → **no** `tel:` link;<br>• ≥640 + fine/mouse → **no** `tel:` link.<br>In all four cases the phone number text, **Copier le numéro**, the call-outcome form and **Enregistrer un appel** remain available; the recording workflow is unchanged |
| Enrollment actions | Both | 1440, 390 | Commencer / Continuer / Ouvrir l’apprenant identical to RCC-A2 (`enrollmentAction` rows); frozen/uncertain retry unchanged |
| Frozen retry across breakpoints (I5) | Chromium (required) + WebKit | 390 → 700 → 390 (and 1000 → 1100 → 1000 for `lg`) | Open the enrollment dialog from the drawer at 390; reach the RCC-A2 uncertain state (route-fulfilled 502); record the frozen request body and its request key; resize across 640 (and back), and separately across 1024. Assert: the dialog element stays connected (the same DOM node, checked through a test-held element handle; no remount); the frozen inputs and displayed view are unchanged; the retry request sends the **identical** request key and payload; RCC-A2 frozen-retry behavior (no field edits, same-key resend, outcome handling) passes as in its own suite |
| Keyboard and focus | Both | 1440, 1024, 390 | 2px focus; Tab order through toolbar → board → drawer; Escape semantics; focus return. At 390: open a dialog above the full-screen sheet; focus is trapped in the dialog; Escape closes only the dialog; closing returns focus to the triggering control inside the lead workspace, or the drawer heading if it vanished |
| Calendar drawer at 390 | Chromium + WebKit | 390×844 | Open a prospect from the Admissions Calendar (`/placement-tests?view=calendar`): full-screen sheet; exactly one visible "Fermer" that stays visible after scrolling the body; body scrolls inside the sheet; Escape with Autres actions open closes only the menu, a second Escape closes the drawer and returns focus per the Calendar's existing restoration; browser Back closes the sheet; zero page overflow |
| Shared-consumer regression | Both | 1440, 768, 390 | Tâches/WorkQueue (including the existing shared-drawer coverage), Admissions Calendar drawer, Students list/detail and `/placement-tests` render as before |

### Escape acceptance sequences

Each sequence asserts the popup element is gone (not merely that the drawer stayed open), and counts Escapes exactly.

- **E1 — Autres actions menu (exactly two Escapes).**
  1. Open the lead drawer.
  2. Open Autres actions.
  3. Press Escape: the menu closes and the drawer remains open.
  4. Focus returns to the Autres actions button, and no popup opens on focus return (no tooltip exists).
  5. Press Escape once more: the drawer closes.
  6. Focus restores per the host's existing rule.
- **E2 — action dialog opened from Autres actions (R1 regression).**
  1. Open Autres actions and choose an action (for example Attribuer un responsable).
  2. Close the dialog with Annuler: focus returns to the Autres actions button, and no tooltip or other popup appears.
  3. Press Escape **once**: the drawer closes.
- **E3 — Plus d'options menu** on an open-task row: as E1. Focus returns to that row's trigger.
- **E4 — Dialog above the drawer (UIF F9).**
  1. Open an action dialog above the sheet and press Escape: only the Dialog closes.
  2. Press Escape again: the drawer closes, since no popup remains.
  3. While a dialog is busy (pending command), Escape is ignored, as today.
- **E5 — order independence (R2).**
  - **Unit level** (`scripts/test-crm-rcc-b1.mjs`). `nestedEscapeAction` returns:
    - `'none'` when `defaultPrevented` is true, whatever the stack;
    - `'close-top'` when not prevented and a popup is open;
    - `'allow-sheet'` when not prevented and nothing is open.
    - A stack fixture proves `close()` is idempotent and closes exactly one entry. Calling it twice, or after the popup's own close, closes nothing else.
  - **Browser, popup first.** A test-only listener is injected with `addInitScript`, registered on `document` in the capture phase before the app's listeners. It calls `preventDefault()` on the first Escape, standing in for a layer that consumed it first. Assert:
    - the drawer guard takes no action, and no registered popup's `close()` runs: the open Autres actions menu is still open, because the simulated consumer did not close it;
    - the drawer remains open.
    - Remove the stand-in, then press Escape: the menu closes. Press Escape again: the drawer closes.
  - **Browser, sheet first.** The natural order of E1, with the menu opened after the drawer. The guard prevents the event and closes exactly that menu. The menu's own listener sees the prevented event. The drawer remains open, and a single Escape then closes it.
- **E6 — filter sheet.** With focus on a native control, Escape closes the filter sheet and returns focus to the Filtres button. No popup exists there.

E1, E2 and E4 run in Opportunities at 1440 and 390, in the Tâches drawer at 390, and in the Admissions Calendar drawer at 390, in Chromium and WebKit.

## Rollout and recovery

- Presentation-only source change, Tier 2: implementation PR, then full CI, then a fresh independent exact-SHA review, then owner merge/release approval.
- No migration and no Production data operation. Deployment follows the existing Vercel path once the owner approves the release.
- Recovery is a source revert of the merge commit. Nothing persisted depends on the new presentation, and URL parameters are unchanged.
- Release verification needs no Production read. The release task may record deployment READY and an optional owner walkthrough without mutation.

## Non-goals

- Database, migrations, RPCs, server behavior, task semantics, permissions/RLS and roles.
- Finance; conversion and enrollment authority; Meta/lifecycle.
- The RCC-A1 workflow, cadence and appointment semantics.
- The RCC-A2 actions, error contract, linked-learner behavior, frozen retry and safeguards.
- D6 generic follow-up consolidation; browser `casablancaInstant` tz reliability; a director correction tool; Nouvelle pré-inscription duplicate risk.
- Director CRM & Growth Intelligence; online learning; walk-in redesign.
- Shared sidebar redesign; a global CSS touch-rule rewrite; dependency upgrades (including a Radix dedupe); placement booking redesign; new saved views; new card commands.

## Owner decisions required

**All eight were decided by the owner on 2026-10-07, each as recommended** ([approval record](#owner-approval-record)). The options and consequences below are kept as the decision record.

### D1 — "Demande" unification

- **Question:** merge the four inquiry fragments into one Demande section?
- **Option A:** one **Demande** section, as specified in [Demande definition](#demande-definition): origin, latest and first inquiry, declared interest, a three-answer summary and a link to all answers. Same reads, nothing removed.
- **Option B:** keep separate sections. Only rename "Contexte de la demande" to "Demande" and move "Origine" into it. Acquisition and Réponses aux formulaires stay separate.
- **Consequences:** A shortens the drawer by about two section headers and puts inquiry evidence in one place. Assertions on "Acquisition" and "Réponses aux formulaires" must be updated deliberately. B changes less but leaves the fragmentation.
- **Recommendation:** A.
- **Owner decision (2026-10-07):** A — approved. Blocking resolved.

### D2 — telephone links

- **Question:** where should the "Appeler {numéro}" `tel:` link appear? It is the only one, in the call dialog.
- **Option A:** remove it at desktop only (≥1024); keep it on tablet and phone.
- **Option B:** remove it at desktop and tablet (≥640); keep it below 640.
- **Option C:** show it only on phone-sized touch layouts, meaning below 640px **and** a coarse pointer.
- **Consequences:**
  - **What stays in every option:** the number as text, **Copier le numéro**, **Enregistrer un appel**, the call-outcome recording, and the WhatsApp destination and launcher.
  - **A:** keeps a link that tablets rarely dial from.
  - **B:** keys removal to width alone, so a narrow desktop window would show it.
  - **C:** best matches the reality that calls happen on the external business phone or WhatsApp, and that browser `tel:` on a computer opens an unrelated calling app.
  - **Tests:** `test-crm-phase4-browser.mjs` must change from asserting the link at 1440 to asserting its absence there. It must add a phone/coarse-pointer assertion that clicking still records nothing.
- **Recommendation:** C.
- **Owner decision (2026-10-07):** C — approved. Blocking resolved.

### D3 — collapsed history

- **Question:** what does the drawer show before history is expanded?
- **Option A:** the latest three meaningful exchanges ("Derniers échanges") from the first loaded page, then **Afficher tout l’historique** for the complete list with bookkeeping and paging.
- **Option B:** the latest single entry and a loaded-entry count.
- **Option C:** a category-grouped summary (appels, WhatsApp, notes, étapes).
- **Consequences:**
  - A gives enough recent context to resume a conversation without three screens of scrolling.
  - B is shorter but often hides the exchange that matters, and a count would be partial, since there is no total.
  - C needs aggregation the cursor read cannot make truthful without loading everything.
  - The full history stays accessible under every option.
- **Recommendation:** A, with three entries.
- **Owner decision (2026-10-07):** A — approved. Blocking resolved.

### D4 — intermediate sidebar

- **Question:** does RCC-B1 change the shared sidebar?
- **Option A:** no change. Opportunities fits within today's shell: all five stages fit at 1280 and 1440, and 1024 uses a contained, discoverable board scroll.
- **Option B:** add an icon-rail mode (about 64px, with named items and flyout children) at 1024–1279px.
- **Consequences:**
  - **What B affects:** every admin route for admin, director, receptionist and teacher, including dashboard, students, finance, attendance, timetable, receipts and portals.
  - **What B requires:** keyboard and focus redesign of nested groups, collapsed active-state context, and navigation tests (`test:navigation`).
  - **B's coverage:** regression on representative non-CRM pages, an ADR-005 amendment, and its own owner approval and Tier-2 review.
  - **What A gives up:** about 176px at 1024.
- **Recommendation:** A. If the owner still wants a rail, approve it as a **separate UI Foundation outcome**, not inside RCC-B1.
- **Owner decision (2026-10-07):** A — approved. Blocking resolved.

### D5 — phone layout at 390px

- **Question:** what is the primary Opportunities presentation at phone width?
- **Option A:** the multi-column Kanban, scrolling horizontally inside the board.
- **Option B:** a stage list. Stage chips with counts set the existing `stage` filter over single-column cards. Larger screens keep the Kanban.
- **Consequences:**

| Criterion | A | B |
| --- | --- | --- |
| Speed of use | One column (280 of 358px) visible; scanning a stage means sideways swipes | One stage at a time, with vertical scrolling |
| Discoverability | Other stages off-screen | All stages and counts visible in the chip row |
| Touch usability | Horizontal and vertical scroll conflict | Vertical scroll only (the chip row scrolls in its own region) |
| Horizontal movement | About 1,100px of swiping across 5 stages | None for the list |
| Drag-and-drop | Impractical on touch | Not needed; guarded menus and drawer actions cover every route |
| Complexity | Lowest (current toggle) | Small: chips over the existing `counts`, `stage` and `p_stage` |
| Consistency | Same as desktop | Same stages, labels, counts and actions; different arrangement |

  B is presentation and navigation only. It adds no status values and no server transitions, and every stage action stays reachable through the existing guarded actions. The Tableau toggle remains available.
- **Recommendation:** B.
- **Owner decision (2026-10-07):** B — approved. Blocking resolved.

### D6 — mobile drawer

- **Question:** how do prospect details open at phone width?
- **Option A:** a narrow side drawer that leaves a strip of the list visible.
- **Option B:** a full-width, full-height sheet using the existing `Sheet` primitive, with a sticky header and close control, safe-area padding, no sticky footer (the primary action sits in Prochaine action), body scrolling, action dialogs layered above, and browser Back closing it.
- **Consequences:** A spends part of a 390px screen on a dimmed strip and squeezes forms. B already matches today's width rule and adds the missing sticky header and safe-area handling. Desktop and tablet keep the 620px side sheet.
- **Recommendation:** B.
- **Owner decision (2026-10-07):** B — approved. Blocking resolved.

### D7 — default presentation at tablet width (768)

- **Question:** should 640–1023px default to the stage list or the Kanban? Today it defaults to the Kanban from 768.
- **Option A:** Kanban default from 768, with contained scroll; two of five stages visible.
- **Option B:** stage-list default below 1024 (two-column cards), with the Tableau toggle retained.
- **Consequences:**
  - **B:** fits a touch-first portrait tablet, removes the 84px table overflow and makes the 768/767 edge (X1) harmless, because both sides show the stage list.
  - **A:** keeps desktop-like scanning, but with heavy sideways scrolling.
  - **Either way:** existing `layout` URLs keep working.
- **Recommendation:** B.
- **Owner decision (2026-10-07):** B — approved. Blocking resolved.

### D8 — drawer modality on desktop

- **Question:** should the prospect drawer stay modal at wide widths?
- **Option A:** stay modal, as today: focus trap and inert background, with the board's scroll position, filters and focus preserved on close.
- **Option B:** a non-modal split view at ≥1440, where the board compresses beside the drawer and stays clickable to switch prospects.
- **Consequences:**
  - **A:** keeps the UIF F9 focus/inertness contract and all existing drawer tests.
  - **B:** is faster for switching between prospects, but it requires a non-modal focus model, background interaction during pending commands, layout reflow of a board with five stages beside a 620px panel, and new accessibility review. It is a larger change than B1's presentation scope.
- **Recommendation:** A. Revisit B as a future enhancement if needed.
- **Owner decision (2026-10-07):** A — approved. Blocking resolved.

No other genuine product choices were found. Everything else above is ordinary implementation detail inside this contract.

## Recommended risk tier

**Tier 2: normal substantial, shared UI.** The diff touches the drawer and dialogs shared by Opportunities, Tâches and the Admissions Calendar, plus opt-in variants of shared Foundation components. No backend, authority, migration or finance change. Mandatory fresh independent exact-SHA review.

**Escalate to Tier 3 and stop for the owner** if the work needs any of the following:

- any RPC, schema, permission or server change;
- a change to enrollment/conversion behavior inside `CrmEnrollmentDialog` beyond its container;
- a shared `Sidebar` change (D4 B);
- dependency or lockfile changes.

## B1-r2 review corrections

Each finding of the [independent review](https://github.com/elforssa/english-hills-admin/pull/114#issuecomment-6037684885) of `225d17d…` is resolved in the body of this plan; this table indexes them. No owner decision changed.

| Finding | Resolution | Where |
| --- | --- | --- |
| I1 — sticky close versus the Sheet primitive | `SheetContent` becomes a non-scrolling flex column with a fixed header and an inner scrolling body. The primitive's single existing "Fermer" stays pinned. No edit to `ui/sheet.jsx` and no second close button. | [Drawer and sheet behavior](#drawer-and-sheet-behavior) |
| I2 — Escape across Radix layer stacks | A layer-generic page-local guard. A window-capture snapshot keyed to the event detects a nested popup from the DOM and the event target. The sheet's `onEscapeKeyDown` then blocks the sheet and explicitly closes the topmost controlled popup, because a bare `preventDefault` would also stop the popup's own dismissal. Covers menus, the new tooltip, and any Select, Popover or HoverCard; applies to the drawer and the filter sheet. No dependency or primitive change. *Superseded in part by B1-r3: the tooltip is removed (R1), and the guard rule is order-independent (R2).* | [Drawer and sheet behavior](#drawer-and-sheet-behavior) |
| I3 — 640 edge, breakpoint parity, telephone row | 639/640 added to the edge pairs. One shared breakpoint definition for CSS and JS. Tests assert the active mode first. Four-case D2 C telephone matrix. | [Responsive model](#recommended-responsive-model), [Testing matrix](#testing-matrix) |
| I4 — scroll after action refresh | The remount and paging reset stay. Scroll is captured before the refresh, restored after the rebuilt board renders, and clamped. | [Kanban and list behavior](#kanban-and-list-behavior) |
| I5 — RCC-A2 frozen retry across breakpoints | One drawer and dialog tree; dialogs are direct stable children of `SheetContent`; class-only band differences. Resize-while-frozen and 390 focus tests. | [Drawer and sheet behavior](#drawer-and-sheet-behavior), [Testing matrix](#testing-matrix) |
| Test gap 1 — vertical budget at 1024 WebKit | Budgets are keyed to the active band and presentation, exactly one per mode. | [Page header and toolbar](#page-header-and-toolbar) |
| Test gap 2 — 1024 without sidebar | The test activates Tableau explicitly before asserting 5/5. | [Testing matrix](#testing-matrix) |
| Test gap 3 — stage chips and `view=closed` | Chip set per view; **Tous** = the current view and filter population; chips and jump buttons are never drop targets or commands. | [Kanban and list behavior](#kanban-and-list-behavior), [IMPLEMENTATION CONTRACT](#implementation-contract) |
| Test gap 4 — Calendar drawer at 390 | A dedicated Calendar-drawer row; existing Tâches coverage kept. | [Testing matrix](#testing-matrix) |
| Test gap 5 — long uncertain alert at 390 | Sticky footer with a capped alert region and measured scroll padding; dedicated 390×844 test. | [Dialog behavior](#dialog-behavior), [Testing matrix](#testing-matrix) |

## B1-r3 re-review corrections

The [re-review](https://github.com/elforssa/english-hills-admin/pull/114#issuecomment-6038018694) of `9068324…` accepted every B1-r2 correction except the two items below. All other B1-r2 content is unchanged:

- I1 sheet structure;
- I3 edge pairs and breakpoint parity;
- the D2 telephone matrix;
- I4 scroll restoration;
- I5 single tree;
- mode-keyed budgets;
- the explicit Tableau toggle;
- `view=closed` chips;
- Calendar 390 coverage;
- the phone long-alert footer;
- the presentation authority rule;
- Tier 2;
- the stop conditions.

| Finding | Resolution | Where |
| --- | --- | --- |
| R1 — the tooltip reopens on programmatic focus return (Radix Tooltip 1.2.8 opens `onFocus` when no pointer is down; menu close and `returnFocusRef={moreRef}` both refocus the trigger) | **Owner decision R1, 2026-10-07: option (a).** No Radix tooltip on Autres actions; it keeps its visible label as today. No local `TooltipProvider`, no replacement tooltip, no `title`. Tooltip-specific tests removed; E2 proves one Escape closes the drawer after a dialog returns focus. | [Drawer body order](#drawer-and-sheet-behavior), [Escape sequences](#escape-acceptance-sequences) |
| R2 — listener order is not guaranteed (the 1.1.19 sheet re-attaches its listener when a Dialog above it closes) | Order-independent rule: already `defaultPrevented` → do nothing; otherwise preventDefault and close exactly one (the topmost) controlled popup; idempotent `close()`; no registration-order invariant. Unit and browser tests for both orders. | [Drawer and sheet behavior](#drawer-and-sheet-behavior), [Escape sequences](#escape-acceptance-sequences) |

## IMPLEMENTATION CONTRACT

**Status:** architecture OWNER APPROVED FOR IMPLEMENTATION on 2026-10-07 (B1-r1, D1–D8 as recommended), carried forward to revision **B1-r3**; see the [approval record](#owner-approval-record). **Implementation is not yet authorized.** It may start only after all three of these:

1. exact-SHA independent re-review of B1-r3 passes;
2. the architecture PR is merged;
3. a separate explicit owner instruction to implement.

Approval to implement is not approval to merge or release.

**Prerequisites:**
- Branch from then-current `origin/main` on a named feature branch.
- Confirm migration 112 is still the latest and that nothing in this plan's module manifest changed materially since `13c1db1…`. If something did, reassess before coding.
- Record the approved revision and decisions in the handoff.

**Authorized scope (the approved options):**
- The responsive bands; compact header and toolbar; view chips/select; filter disclosure row and filter sheet; active-filter chips.
- The fluid contained board with sticky headers, affordance, jump control and post-refresh scroll restoration (I4).
- The stage list with chips, the tablet card grid, and the desktop-only table.
- The card hierarchy and grouped overflow menu; the card touch layout fix.
- In the drawer: non-scrolling `SheetContent` with fixed header and inner scroll body (I1), body order, Demande, collapsed history, quick-action layout, the layer-generic Escape guard (I2), phone full-screen sheet.
- Dialog containers with sticky footers and `100dvh`; telephone-link gating per D2.
- Pure helpers and tests.

The owner approved every recommended option, so no alternative option behavior is in scope.

**Module manifest:** exactly the table in [Modules expected to change](#modules-expected-to-change-and-shared-component-blast-radius), plus new presentation components under `src/components/crm/`, new tests under `scripts/`, and `package.json` *script* entries only. Any other file needs a written justification in the PR. The files marked "Not changed" in that table are out of scope (stop condition).

**Breakpoints and responsive behavior:**
- Bands: phone below 640, tablet 640–1023, desktop ≥1024, decided only by the Tailwind `sm` `(min-width: 640px)` and `lg` `(min-width: 1024px)` queries. CSS uses `sm:`/`max-sm:`/`lg:`; JS uses `matchMedia` with the identical strings from one shared constant. No other width threshold.
- D2: the `tel:` link is shown only under `not all and (min-width: 640px)` (Tailwind `max-sm:`) combined with `(pointer: coarse)`.
- `data-band` and `data-presentation` on the workspace root reflect the resolved mode, for tests.
- Default layout: board at ≥1024 and stage list below (D7).
- The `layout` and `view=closed` semantics are unchanged.

**Layout invariants:**
- Zero horizontal overflow on `documentElement` and `#main-content` at every width and state.
- Horizontal scrolling only inside the board, the chip rows and labelled table regions.
- Close and primary actions are always reachable. The drawer has exactly one "Fermer" control (the primitive's) and it is never scrolled out of view.
- One drawer and dialog component tree for every band; dialogs are direct stable children of `SheetContent`, outside `ReadState` and outside any band conditional (I5).
- No essential text below 12px; touch targets ≥ 44px below 1024 or with a coarse pointer.
- Only existing UIF tokens and primitives; no page-local brand hex values.

**Business-logic invariants (must be byte-for-byte behaviorally unchanged):**
- Every RPC name, argument and payload; request keys and expected versions; stale-command handling.
- `opportunityAction`, `enrollmentAction`, `continueHref`, `studentHref`, `phoneLinks`, `conversationOutcomes`, `nextTaskSpec`, `scheduleKindRule` and reminder presets.
- The RCC-A1 dialogs; the RCC-A2 enrollment flow (validation, reasons, frozen retry, success wording).
- Read limits, cursors and query keys; filter URL composition, debounce, reset and Back/Forward.
- Staff labels and the scheduled-time formatter; drawer focus restoration; Tâches/WorkQueue defaults; Calendar behavior.
- Drag-and-drop stays a route to guarded dialogs only.
- **Presentation authority rule.** Every new presentation control is a read/navigation control only: stage chips, stage-jump buttons, phone and tablet stage-list navigation, Tableau/Liste toggles and filter controls. These controls must never:
  - trigger a stage transition directly;
  - become a drag-and-drop target (only board columns stay drop targets, routing to guarded dialogs as today);
  - call a guarded CRM write command, or `opportunityAction`, as a result of navigation.
  Counts are display data, not authority. Existing guarded actions and dialogs remain the only authority for commercial-stage changes.
- Board refresh semantics (`crm:refresh` → cursor reset and generation remount) and per-column paging reset are unchanged; scroll restoration is presentation state around them (I4).

**Acceptance per width:** the [testing matrix](#testing-matrix), the [vertical budgets](#page-header-and-toolbar), the [phone task table](#phone-and-touch-behavior) and the [board containment criteria](#kanban-and-list-behavior). It must hold at 1440×900, 1280×800, 1024×768, 768×1024 and 390×844, on both sides of the 639/640, 767/768 and 1023/1024 edges, and at 320 for reflow. Each test asserts the active band and presentation before applying that mode's criteria.

**Chromium and WebKit:**
- Add `scripts/test-crm-rcc-b1-browser.mjs`, modelled on `test-ui-foundation-browser.mjs`: real local Auth, synthetic fixtures removed in `finally`, local feature-branch guard. It runs the matrix in both engines and asserts measured values: overflow, visible stages, budgets, target sizes, dialog bounds, the single Fermer, Escape sequences E1–E6 (menu, dialog return, dialog above, order independence, filter sheet; Opportunities, Tâches and Calendar drawers), scroll restoration, frozen retry across breakpoints, history and Demande content, and the four-case telephone gating.
- Add pure tests in `scripts/test-crm-rcc-b1.mjs` for the helpers.
- Register both in `test:crm-opportunities` and `test:crm-opportunities-browser`.

**Regression requirements:**
- Run and keep green, updating assertions only where this contract deliberately changes a label or the telephone link:
  - `npm test` (including `test:ui-foundation`) and `test:navigation`;
  - `test:crm-opportunities` and `test:crm-opportunities-local`;
  - `test:crm-opportunities-browser` (opportunities, phase 4/5/6, RCC-A1 and RCC-A2 browser);
  - `test:crm-work-calendar`, its local suite and `test:crm-work-calendar-browser` (including the row-staff-labels and UI Foundation browser suites);
  - `test-receptionist-browser.mjs`;
  - `test-student-placement-browser.mjs` if `PlacementTestModal` changes;
  - `npm run lint` and `npm run build`.
- Every updated assertion is listed in the PR, with the decision that requires it.
- Full Verify CI is required.

**Stop conditions:**
- A need for any new read, field, RPC, migration, permission or server change.
- A change to command payloads, enrollment/conversion logic or RCC-A1/RCC-A2 behavior.
- A need to edit `Sidebar.jsx`, global CSS rules, Tailwind configuration, `ui/sheet.jsx`, `ui/dialog.jsx` or other `ui/` primitive defaults, dependencies or the lockfile.
- Inability to meet the I2 Escape behavior with the page-local guard, to keep a single drawer and dialog tree (I5), or to restore board scroll without changing refresh or paging semantics (I4).
- Placement form changes beyond the container.
- Inability to meet a layout invariant without one of the above.
- A failing or INCONCLUSIVE test that cannot be explained.
- Any Production access.

Stop and report; do not work around it.

**Explicit exclusions:** the [non-goals](#non-goals).

**Documentation and status updates:**
- On implementation, append an implementation record to this plan (branch, head/base SHA, checks, CI run) and update the RCC-r1 phase table.
- Update [docs/ui/operational-foundation.md](../../ui/operational-foundation.md) only for reusable patterns actually added: the compact FilterBar/PageHeader variants, the stage navigation, and the sticky dialog footer.
- Leave CURRENT_STATE for the release closeout. No PRODUCT_RULES or SECURITY_RULES change is expected.
- Hand off under the AGENTS Tier-2 flow: stop polling once CI is scheduled; no internal reviewer and no self-issued verdict.

## Owner approval record

**Recorded 2026-10-07.** The owner approved the RCC-B1 architecture, revision **B1-r1**, as recommended. Architecture PR [#114](https://github.com/elforssa/english-hills-admin/pull/114); the approved content is commit `4ae6bbfb62563ec69db4195b27852e05ccd45a3e`, plus this approval record.

| Decision | Approved option |
| --- | --- |
| D1 — Demande | **A:** merge the inquiry information into one Demande section. |
| D2 — telephone links | **C:** show the `tel:` **Appeler** link only below 640px with a coarse pointer. The visible phone number, **Copier le numéro** and **Enregistrer un appel** remain available everywhere. |
| D3 — history | **A:** show the latest three real exchanges by default, with **Afficher tout l’historique** for the complete history using the existing paging. |
| D4 — sidebar | **A:** no sidebar change. Any compact or icon sidebar is a separate UI Foundation outcome. |
| D5 — phone layout | **B:** a stage-navigated list is the default phone Opportunities view. |
| D6 — phone drawer | **B:** a full-width, full-height sheet with sticky header and close behavior; browser Back closes the sheet. |
| D7 — tablet default | **B:** the stage-list default applies below 1024px, including the tablet band. |
| D8 — desktop drawer | **A:** the desktop drawer stays modal. |
| R1 — Autres actions tooltip (2026-10-07, B1-r3) | **Option (a):** no Radix tooltip; Autres actions keeps its visible label. |

**Revision history after approval:**

- The independent Tier-2 architecture review of exact head `225d17d1e6fa998ed0dd7ecfebd9d9f538164d8e` (B1-r1 plus this record) returned **CHANGES REQUIRED** ([review](https://github.com/elforssa/english-hills-admin/pull/114#issuecomment-6037684885)): no blocking findings, five important findings (I1–I5) and five test gaps.
- **Revision B1-r2** incorporates all of them (see [B1-r2 review corrections](#b1-r2-review-corrections)).
- None of the findings changes an approved product choice: D1–D8 are unchanged. The owner's 2026-10-07 approval carries forward to B1-r2, as the owner instructed when commissioning the corrections.
- The independent re-review of exact head `9068324558f0a739a4d8c358cc090f25a3b6d9a6` (B1-r2) returned **CHANGES REQUIRED for R1 and R2 only** ([re-review](https://github.com/elforssa/english-hills-admin/pull/114#issuecomment-6038018694)). It accepted every other item.
- **Owner decision R1 (2026-10-07): option (a).** Do not add a Radix tooltip to Autres actions; keep it visibly labelled, as today.
- **Revision B1-r3** incorporates R1 and the order-independent Escape rule for R2 (see [B1-r3 re-review corrections](#b1-r3-re-review-corrections)).
- D1–D8 remain unchanged. The owner's existing approval carries forward to B1-r3.
- Implementation stays **not authorized** until three things happen:
  1. B1-r3 passes fresh exact-SHA independent re-review;
  2. PR #114 is merged;
  3. a separate owner implementation instruction is given.

Constraints the owner restated with the approval, binding on implementation:

- RCC-B1 stays **Tier 2** and presentation-focused.
- No database, migration, server/API authority, lifecycle semantics, permissions, Meta, finance, enrollment logic or global sidebar change is authorized.
- The Escape/menu defect may be fixed with the documented page-local drawer/menu handling, **without changing dependencies**.
- Any dependency change, server behavior change, enrollment or business-logic change, or cross-platform sidebar change is a **Tier 3 escalation and stop condition**.
- Acceptance must cover the documented responsive boundaries: both sides of the 768px and 1024px edges (767/768 and 1023/1024) and the required 390, 768, 1024, 1280 and 1440 widths. B1-r2 adds the 639/640 edge as the review required.

**Not authorized by this approval:**

- implementation, until B1-r3 passes exact-SHA independent re-review, the architecture PR merge and a separate explicit owner instruction;
- merge of any implementation;
- release or deployment;
- any Production access.

## Implementation record

**2026-10-07, revision B1-r3, Tier 2.** Owner implementation authorization of 2026-10-07 (after PR #114 was independently reviewed at `2fdb8ad74ee356f6590c1223740d8a51db0cba75` and merged). The authorization covers implementation, local synthetic testing, the implementation PR and CI only; it does not cover merge, deployment, Production access, migrations or any scope beyond this contract.

- **Branch:** `feature/rcc-b1`. **Base:** `origin/main` = `612ccfd` (PR #114 merge). The implementation PR and its handoff record the exact head SHA and the CI run.
- **Prerequisites rechecked:** migration 112 is still the latest; nothing in the module manifest changed since `13c1db1…`.
- **No** database, migration, RPC, read-shape, permission, finance, conversion, lifecycle/Meta, dependency, lockfile, `ui/` primitive, `globals.css`, Tailwind configuration or `Sidebar.jsx` change. `package.json` changes are script entries only.

**Files.** The module manifest, plus new presentation modules under `src/components/crm/`: `useResponsiveBand.js` (the `BAND_QUERIES` band), `useNestedLayerEscapeGuard.js` (`useNestedLayerEscapeGuard` / `useGuardedLayer`), `ScrollRow.jsx` (bounded rows and edge fades) and `DialogStickyFooter.jsx` (the sticky footer and its height observer). Tests: `scripts/test-crm-rcc-b1.mjs` (pure) and `scripts/test-crm-rcc-b1-browser.mjs` (Chromium + WebKit), registered in `test:crm-opportunities` and `test:crm-opportunities-browser`. Documentation: this record, the RCC-r1 phase table and [operational-foundation.md](../../ui/operational-foundation.md) (compact `PageHeader`/`FilterBar`, stage navigation, sticky dialog footer, and the drawer-order paragraph that B1 made stale).

**Implementation notes and justified deviations** (all within the approved behavior):

1. **WebKit edge feedback loop (X1).** With classic scrollbars, WebKit evaluates `(min-width: 1024px)` without the page scrollbar. Because the band now changes page height (a viewport-filling board versus a long stage list), the scrollbar appearing and disappearing flipped the band at exactly 1024 until React aborted with "Maximum update depth exceeded". While the workspace is mounted, `useResponsiveBand` keeps the root vertical scrollbar present (`overflow-y: scroll` on `<html>`, restored on unmount; page-local, no global CSS edit). WebKit then resolves a 1024 window consistently to the band it measures, which this contract accepts. Overlay-scrollbar platforms see no change.
2. **E2 focus return was already broken on `main`.** Measured on an unmodified `origin/main` server, in both engines: after Autres actions → a dialog → Annuler, focus landed on the sheet's Fermer, not Autres actions. The cause: the dialog opened while the menu was closing, and its unchanged return-focus capture recorded the sheet's fallback focus. Autres actions items now open their dialog from the menu's `onCloseAutoFocus`, after focus has returned to the trigger. Dialog code is untouched. Browser suites' `more()` helpers wait for the dialog to appear.
3. **Sticky footer and padding.** Both engines stop a sticky inset at the scroll container's padding. `STICKY_DIALOG` therefore drops the dialog's bottom padding only while it contains the footer (`has-[[data-dialog-footer]]:pb-0`), and the footer carries that padding. The footer stays in flow, so the body never sits under it at the end of scroll; no extra bottom margin is added. `--crm-dialog-footer` feeds `scroll-padding-bottom` as specified.
4. **Card height ≤ 150px across the desktop band** (184–224px columns). Qualifiers share the next-action line, and "Tentative n sur 5" is shown from the second attempt; attempt 1 is the "Premier contact" title itself.
5. **Views at 1280.** The chip-row/Vue-select switch uses `xl:`, as the toolbar table specifies. It is a toolbar detail and never decides the band or presentation.
6. **Drawer header reserve** is `pr-14` rather than `pr-12`, so the 44px touch close button never overlaps the title.
7. **Telephone gating** is CSS only (`hidden max-sm:[@media(pointer:coarse)]:inline-flex`, without `data-touch-target`, which would have overridden `hidden`). Elsewhere the link is `display: none`: not rendered visually, not focusable, not in the accessibility tree.
8. **Band before reads.** `data-band` appears once the browser answers the media queries, and the Opportunities read waits for it, so a phone never fetches the desktop board default first. Arguments, keys and limits are unchanged.

**Deliberately updated assertions** (each required by this contract):

| Suite | Change | Decision |
| --- | --- | --- |
| `test-crm-phase4-browser.mjs` | No `tel:` link at 1440 with a mouse; new 390 coarse-pointer context asserts the link and that clicking records nothing; "Toutes les réponses aux formulaires" | D2 C, D1 |
| `test-crm-opportunities-browser.mjs` | "2 clôturés" count-line link replaces "Clôturés : 2"; "Filtres" replaces "Plus de filtres"; count text matched as a prefix; Demande heading replaces Acquisition; "Première demande" absent when equal to the latest; Vue select below 1280 | Toolbar/header, D1 |
| `test-crm-phase6-browser.mjs`, `test-crm-work-calendar-browser.mjs` | "Filtres" replaces "Plus de filtres" | Toolbar |
| `test-crm-row-staff-labels-browser.mjs` | Board cards no longer show the owner (List table and drawer keep it); drawer "Responsable : …"; "Filtres" | Card hierarchy, drawer header |
| `test-ui-foundation-browser.mjs` | "Résumé de la dernière demande" and "Toutes les réponses aux formulaires"; header "WhatsApp +…"; List cards below 1024 | D1, drawer header, list table desktop-only |
| `test-crm-phase5/rcc-a1/opportunities/phase4/phase6/work-calendar-browser.mjs` | `more()` waits for the action dialog to appear | Note 2 |

**Local validation** (synthetic data only, local Supabase `127.0.0.1:54321` at ledger 112, external delivery blocked, fixtures removed, local database back to zero CRM rows and users):

- `npm run lint`: clean, except the pre-existing Sidebar `<img>` warning.
- `npm run build`: passes.
- Passing suites: `npm test` (including `test:ui-foundation`), `test:navigation`, `test:crm-opportunities` (including the new pure suite), `test:crm-opportunities-local`, `test:crm-work-calendar` and `test:crm-work-calendar-local`.
- Passing browser suites: `test-crm-opportunities`, phase 4, phase 5, phase 6, RCC-A1, RCC-A2, work-calendar, row-staff-labels, UI Foundation, receptionist and student-placement.
- **`test-crm-rcc-b1-browser.mjs`: passes in Chromium and WebKit.** It covers:
  - five widths, the 639/640, 767/768 and 1023/1024 edges, and 320 reflow;
  - stage chips, board scroll restoration and Escape E1–E6;
  - history, Demande, phone reachability, focus;
  - the 390×844 long uncertain alert, frozen retry across 640 and 1024, and the telephone matrix.
- **The O3 "first Board ≤ 1s" check is environment-sensitive.** On `next dev` it fails on this machine for unmodified `main` as well (2.6–4.5s). On production builds: `main` 908–990ms, this branch 737–842ms.

**Observation for review (unchanged by B1).** If Escape arrives within roughly one frame of an action dialog mounting above the sheet, the Radix 1.1.19 sheet may still hold its listener and dismiss. A human cannot type that fast. The browser test waits for dialog focus plus 150ms. The guard deliberately does not intercept Dialog-over-sheet Escape (contract I2 point 4).

**CI correction (2026-10-08).** Verify run 37644607159 for head `457633c…` failed in Linux WebKit at 1440. The sticky footer measured 24.5px above the dialog bottom. The cause was the test's measurement timing, not the product layout:

- **What the test measured:** the dialog's first open-animation frame (`zoom-in-95` start, scale 0.95). Linux WebKit paints that frame before the sticky footer is positioned.
- **What happens next:** from the next frame the footer is flush (gap 1px, the dialog border). The computed bottom padding is 0, and the `:has()` rule matches.
- **How this was confirmed:** with Playwright 1.63.0 Linux browsers (official container) against a local production build, with and without reduced motion.
- **Why local runs passed:** macOS WebKit already had the footer positioned when the test read it.

The product code is unchanged. The B1 browser suite now measures overlay geometry after its open animations finish. It adds checks that the dialog's bottom padding is 0 and that footer-less views keep their spacing. It also fixes two Linux-only test races: the stage-chip wait now needs at least one card, and the drawer is opened with a real pointer click so a locator's scroll-into-view cannot move the board. The full B1 suite passes on Linux Chromium + WebKit and on macOS Chromium + WebKit.

**CI correction (2026-10-08, card height).** Verify run 37711840967 for head `27949c1…` measured the ordinary board card at 166px in Linux WebKit at 1280. The npm audit failure in the same run belongs to a separate dependency PR. The cause is a font difference: CI's `sans-serif` resolves to DejaVu Sans, which is wider than the macOS system font.

- **Before:** in the 178px card, the identity button shared its whole height with the 36px overflow trigger. The learner line ("Enfant synthétique", 124px) then had about 120px and wrapped.
- **Fix:**
  - the trigger is positioned at the card's top-right, and only the name line reserves its width (38px; 48px below `lg` or with a coarse pointer);
  - the learner and later lines use the full width;
  - card vertical padding is 6px and the next-action gap 6px.
- **Unchanged:** all content and font sizes.
- **Result:** Linux WebKit with DejaVu Sans at 1280 measures 142.5px (was 166). Chromium measures 126px at 1280 and 142px at 1024.
