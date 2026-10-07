# Owner summary

**RCC-B1 — Responsive Opportunities presentation. Revision B1-r1, 2026-10-07. Status: PROPOSED / AWAITING OWNER DECISIONS.** Child of the active [RCC-r1](rcc-r1-receptionist-crm-completion.md#rcc-b1--responsive-opportunities-presentation) plan. Implementation is **not authorized**. Decisions D1–D8 below are pending.

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
- Breakpoint edges at exactly 768 and 1024 behave differently in WebKit with classic scrollbars, so both sides of each edge must pass.
- Several existing browser assertions must be updated deliberately: the `tel:` link and the Acquisition/Demande labels.

Owner decisions D1–D8 are required before implementation.

## Contract identity, baseline and evidence limits

- **Revision:** B1-r1. Architecture branch `docs/rcc-b1-architecture`.
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

**Edge robustness rule.** Each acceptance width must pass in the layout each engine actually resolves. Tests also run at 1023 and 767, and both sides of each edge must satisfy that width's criteria. The desktop board is therefore specified to fit all five stages at 976px (1024 without the sidebar) and to scroll in a contained way at 736px (1024 with it).

## Page header and toolbar

Opportunities uses opt-in compact variants of `PageHeader` and `FilterBar`. The Students and Tâches defaults are unchanged.

| Element | Desktop (≥1024) | Tablet (640–1023) | Phone (<640) |
| --- | --- | --- | --- |
| Header row | Title **Pipeline admissions**. The description slot becomes the live count: "22 prospects correspondants · 2 clôturés (Liste)", replacing the separate count row and the "Le Tableau montre…" notice. Actions: Tableau/Liste segmented toggle (`aria-pressed`) and primary **Ajouter un prospect**. | Same | Title (20/28) and count. **Ajouter** primary (icon + label, accessible name "Ajouter un prospect"). Tableau/Liste toggle stays reachable in the toolbar row. |
| Toolbar row | Search (visible label, flexible) · **Vue** select (below 1280 only) · Programme select · **Filtres · n** disclosure · **Effacer les filtres** (only when filters are active) — one row | Search, full row. Then **Vue** select · **Filtres · n** · toggle. | Search, full row. Then **Vue** select · **Filtres · n**. |
| Views | ≥1280: compact chip row (36px) with all nine views. If it ever overflows, it scrolls inside its region with an edge fade. Below 1280: the **Vue** select. | Vue select | Vue select |
| Stage navigation | Board jump control, only when stages are clipped (see [Kanban](#kanban-and-list-behavior)) | Stage chips with counts | Stage chips with counts |
| Active filters | Removable chips row, shown only when something is active. The polite live summary is retained (visually hidden when zero). | Same | Same |

**Vertical budget.** With no active filters or notices, at 1440×900, 1280×800 and 1024×768 the top of the first card (or the board's first row) is **≤ 300px**, and the board receives ≥ 55% of the viewport height. At 768×1024 the first result is ≤ 340px. At 390×844 the first result is ≤ 360px, and at least the first two results begin in the first viewport.

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
- **Drawer and refresh.** The board stays mounted while the drawer is open. Horizontal and vertical scroll positions are kept across drawer open and close and across the post-action refresh (`crm:refresh`). Focus restoration is unchanged.
- **Drag-and-drop** stays a desktop pointer convenience that opens the same guarded dialog as `opportunityAction` (unchanged). It is never required: every route is in the card overflow menu and the drawer. No drag-and-drop on touch.
- **Paging.** Per-column paging ("Voir les suivants / Précédents") is unchanged.

**Stage list** (phone and tablet default):

- A **group of stage chips** (`role="group"`, label "Étapes") sits above the list: **Tous**, then the five board stages, each with its count from the existing `counts` object. When the existing `stage` URL value is Perdu or Non qualifié (chosen through the Statut filter), an extra selected chip shows it.
- **Chips set the existing `stage` URL parameter**, which becomes `p_stage` in list mode. That is the same mechanism as today's Statut select, so the chips and the select stay synchronized.
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

## Sidebar behavior

Recommendation (D4 A): **no change** to the shared [Sidebar](../../../src/components/layout/Sidebar.jsx) in RCC-B1.

The fluid board fits all five stages at 1280 and 1440 inside today's 240px sidebar. At 1024 the board is a deliberate, discoverable contained scroll, and the top-bar shell at 1024 (X1) also passes because the board fits at 976px. Changing the sidebar would affect every admin route for every role, which is the reason D4 B routes it to a separate UI Foundation outcome.

## Drawer and sheet behavior

**Container:**

- **Phone (<640):** full width and full height (`inset-0`), no rounded corners, 16px padding, `env(safe-area-inset-*)` padding at top and bottom. Without `viewport-fit=cover` that padding has no effect, and the global viewport meta is not changed.
- **≥640:** the existing 620px right sheet with an overlay radius.
- **Modality:** the sheet stays modal (D8 A), with a focus trap and an inert background.

**Sticky header**, top of the sheet scroll container, with a background and a bottom border once scrolled:

- row 1: contact name as the title (wraps) and the close control, named "Fermer" (36×36 desktop, 44×44 touch);
- row 2: learner · age · programme;
- row 3: stage badge, then "Responsable : {label}" (12px muted);
- row 4: destinations, as plain text: "Tél. {numéro} · WhatsApp {numéro}".

The header must stay ≤ 140px at desktop and ≤ 168px on phone with ordinary text. Long names wrap, and the body never sits under the header.

**Body order.** The documented deviation from the UIF drawer order moves the next action above quick actions, because it holds the primary contextual command:

1. the existing unsupported-move notice, when present;
2. the **Prochaine action** panel: content and buttons exactly as today, with the primary first;
3. **Actions rapides**: Appel, WhatsApp, Note, Planifier and Autres actions, with unchanged handlers:
   - desktop: one row (four labelled buttons and an icon button named "Autres actions" with a tooltip);
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

Focus restoration (origin element, else the page heading) is unchanged. The fix for X2 is mandatory: one Escape closes only the topmost layer (menu → drawer → page). The guard is page-local, for example preventing the sheet's `onEscapeKeyDown` while a drawer menu is open. Package or lockfile changes are a stop condition.

**Layering.** Action, enrollment and placement dialogs open above the sheet, then menus and toasts. Closing a dialog returns focus inside the drawer, as today.

## Dialog behavior

Scope: `CrmActionDialog` (every action and manual creation), `CrmEnrollmentDialog`, and `PlacementTestModal` when opened from CRM.

- **Size.** Widths are unchanged (640 form / 576 / 512), bounded by viewport − 2rem. Height is `max-h-[calc(100dvh-2rem)]` everywhere, fixing `100vh` in the enrollment and placement dialogs. Dialogs stay centered on phone; the measurements show they fit.
- **Layout.** The header stays at the top, the body scrolls, and a **sticky footer** holds the action buttons. The form's error alert sits directly above the buttons inside the sticky region, so validation and submit are visible together. The scroll container gets `scroll-padding-bottom` equal to the footer height, so a field focused by the RCC-A2 error contract is never hidden.
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

Proposed single **Demande** section (D1 A), using the same reads and the same truthful per-read states:

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
| [CrmWorkspace.jsx](../../../src/components/crm/CrmWorkspace.jsx) | Band defaults (list below 1024), compact header and toolbar, count line, stage chips, board height container | **Tâches** (`mode="today"`) shares the component; its header and WorkQueue must stay unchanged |
| [OpportunityFilters.jsx](../../../src/components/crm/OpportunityFilters.jsx) | Toolbar row, view chips/select, filter disclosure row, filter sheet, active chips | Opportunities only |
| [OpportunitiesBoard.jsx](../../../src/components/crm/OpportunitiesBoard.jsx) | Fluid grid, sticky headers, affordance, jump control, scroll preservation | Opportunities only |
| [OpportunitiesList.jsx](../../../src/components/crm/OpportunitiesList.jsx) / [OpportunityCard.jsx](../../../src/components/crm/OpportunityCard.jsx) | Card hierarchy, grouped overflow menu, touch layout fix, tablet card grid | Opportunities only |
| [LeadDetailSheet.jsx](../../../src/components/crm/LeadDetailSheet.jsx) | Container, sticky header, order, Demande, history collapse, quick-action layout, Escape guard | **Tâches** and the **Admissions Calendar** |
| [LeadEnrollmentSection.jsx](../../../src/components/crm/LeadEnrollmentSection.jsx) / [LeadPlacementSection.jsx](../../../src/components/crm/LeadPlacementSection.jsx) | Spacing only, if any. Action rules and links unchanged. | Drawer hosts |
| [CrmActionDialog.jsx](../../../src/components/crm/CrmActionDialog.jsx) | Container and sticky footer; telephone-link gating (D2). No payload change. | Every drawer host plus manual creation |
| [CrmEnrollmentDialog.jsx](../../../src/components/crm/CrmEnrollmentDialog.jsx) | `100dvh` and sticky footer only | Drawer hosts; the RCC-A2 suite |
| [PlacementTestModal.jsx](../../../src/components/placement/PlacementTestModal.jsx) | Optional container-only change | `/placement-tests`, `LegacyPlacementEditor` |
| [FilterBar.jsx](../../../src/components/operational/FilterBar.jsx) / [PageHeader.jsx](../../../src/components/operational/PageHeader.jsx) | Opt-in compact props only; default rendering unchanged | **Students**, **Tâches** |
| [presentation.mjs](../../../src/lib/crm/presentation.mjs) | Additive pure helpers (meaningful-event set, history summary selection, band constants). Existing exports, including `phoneLinks`, unchanged. | Pure tests |
| New `src/components/crm/*` presentation components (stage nav, filter sheet) | Allowed | — |
| **Not changed** | `Sidebar.jsx`, `globals.css` global rules, `tailwind.config.js`, the `ui/sheet.jsx` and `ui/dialog.jsx` defaults, `package.json` dependencies and the lockfile | — |

## Testing matrix

Local Supabase, synthetic data only, external delivery disabled. Two engines, five widths, plus edge checks at 767 and 1023:

| Check | Engines | Widths | Pass condition |
| --- | --- | --- | --- |
| Page overflow | Chromium + WebKit | All, plus 767, 1023, 320 | `documentElement` and `#main-content` horizontal overflow = 0 with board, list, filters open, drawer, dialogs |
| Board containment | Both | 1440, 1280, 1024 (and toggled at 768/390) | 1440 and 1280: 5/5 stages fully visible. 1024 with sidebar: ≥ 3 fully visible, the rest reachable by contained scroll and the jump control. 1024 without sidebar: 5/5. |
| Vertical budget | Both | All | Budgets in [Page header and toolbar](#page-header-and-toolbar) |
| Card readability | Both | All | Long Arabic/French names wrap without clipping; identity stacks vertically under touch; desktop card ≤ 150px for ordinary text |
| Action reachability | Both | All | Every card overflow item and every drawer action is reachable by pointer and by keyboard; touch targets ≥ 44px below 1024 |
| Toolbar and filters | Both | All | Layout per the filter table; filters sheet below 1024; URL, visible controls and RPC arguments agree; reset and Back/Forward unchanged |
| Stage chips | Both | 768, 390, 767 | Counts equal the existing `counts`; selection sets `stage`; synchronized with the Statut select; pager resets |
| Sidebar state | Both | All | Unchanged shell. Sidebar at ≥1024 or top bar below (WebKit edge accepted); mobile navigation focus trap unchanged |
| Drawer | Both | All | Width per band; sticky header and close always visible; body order; single-Escape layering (menu, then drawer); scrim/Back/X close; focus restoration; scroll preserved on the page beneath |
| Dialogs | Both | All | Within the viewport; footer and alert visible without scrolling the page; RCC-A2 error focus visible above the sticky footer |
| History | Both | 1440, 390 | Collapsed shows ≤ 3 meaningful entries; expand and collapse; paging; read states |
| Demande | Both | 1440, 390 | All former information present; per-read failure isolation |
| Telephone | Both | All | Per D2: no `tel:` link at desktop (and tablet as decided); phone-width coarse-pointer link present and records nothing; Copier le numéro everywhere |
| Enrollment actions | Both | 1440, 390 | Commencer / Continuer / Ouvrir l’apprenant identical to RCC-A2 (`enrollmentAction` rows); frozen/uncertain retry unchanged |
| Keyboard and focus | Both | 1440, 1024 | 2px focus, Tab order through toolbar → board → drawer, Escape semantics, focus return |
| Shared-consumer regression | Both | 1440, 768, 390 | Tâches/WorkQueue, Admissions Calendar drawer, Students list/detail and `/placement-tests` render as before |

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

All eight block implementation until decided, because the contract below depends on each. The plan as a whole stays PROPOSED until the owner approves it.

### D1 — "Demande" unification

- **Question:** merge the four inquiry fragments into one Demande section?
- **Option A:** one **Demande** section, as specified in [Demande definition](#demande-definition): origin, latest and first inquiry, declared interest, a three-answer summary and a link to all answers. Same reads, nothing removed.
- **Option B:** keep separate sections. Only rename "Contexte de la demande" to "Demande" and move "Origine" into it. Acquisition and Réponses aux formulaires stay separate.
- **Consequences:** A shortens the drawer by about two section headers and puts inquiry evidence in one place. Assertions on "Acquisition" and "Réponses aux formulaires" must be updated deliberately. B changes less but leaves the fragmentation.
- **Recommendation:** A.
- **Blocking:** yes.

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
- **Blocking:** yes, for the telephone item only.

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
- **Blocking:** yes.

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
- **Blocking:** yes; it decides scope.

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
- **Blocking:** yes.

### D6 — mobile drawer

- **Question:** how do prospect details open at phone width?
- **Option A:** a narrow side drawer that leaves a strip of the list visible.
- **Option B:** a full-width, full-height sheet using the existing `Sheet` primitive, with a sticky header and close control, safe-area padding, no sticky footer (the primary action sits in Prochaine action), body scrolling, action dialogs layered above, and browser Back closing it.
- **Consequences:** A spends part of a 390px screen on a dimmed strip and squeezes forms. B already matches today's width rule and adds the missing sticky header and safe-area handling. Desktop and tablet keep the 620px side sheet.
- **Recommendation:** B.
- **Blocking:** yes.

### D7 — default presentation at tablet width (768)

- **Question:** should 640–1023px default to the stage list or the Kanban? Today it defaults to the Kanban from 768.
- **Option A:** Kanban default from 768, with contained scroll; two of five stages visible.
- **Option B:** stage-list default below 1024 (two-column cards), with the Tableau toggle retained.
- **Consequences:**
  - **B:** fits a touch-first portrait tablet, removes the 84px table overflow and makes the 768/767 edge (X1) harmless, because both sides show the stage list.
  - **A:** keeps desktop-like scanning, but with heavy sideways scrolling.
  - **Either way:** existing `layout` URLs keep working.
- **Recommendation:** B.
- **Blocking:** yes.

### D8 — drawer modality on desktop

- **Question:** should the prospect drawer stay modal at wide widths?
- **Option A:** stay modal, as today: focus trap and inert background, with the board's scroll position, filters and focus preserved on close.
- **Option B:** a non-modal split view at ≥1440, where the board compresses beside the drawer and stays clickable to switch prospects.
- **Consequences:**
  - **A:** keeps the UIF F9 focus/inertness contract and all existing drawer tests.
  - **B:** is faster for switching between prospects, but it requires a non-modal focus model, background interaction during pending commands, layout reflow of a board with five stages beside a 620px panel, and new accessibility review. It is a larger change than B1's presentation scope.
- **Recommendation:** A. Revisit B as a future enhancement if needed.
- **Blocking:** yes.

No other genuine product choices were found. Everything else above is ordinary implementation detail inside this contract.

## Recommended risk tier

**Tier 2: normal substantial, shared UI.** The diff touches the drawer and dialogs shared by Opportunities, Tâches and the Admissions Calendar, plus opt-in variants of shared Foundation components. No backend, authority, migration or finance change. Mandatory fresh independent exact-SHA review.

**Escalate to Tier 3 and stop for the owner** if the work needs any of the following:

- any RPC, schema, permission or server change;
- a change to enrollment/conversion behavior inside `CrmEnrollmentDialog` beyond its container;
- a shared `Sidebar` change (D4 B);
- dependency or lockfile changes.

## IMPLEMENTATION CONTRACT

**Status:** not authorized. Implementation may start only after the owner records approval of B1-r1 with explicit choices for D1–D8 in this file's approval record, and the architecture PR is merged. Approval to implement is not approval to merge or release.

**Prerequisites:**
- Branch from then-current `origin/main` on a named feature branch.
- Confirm migration 112 is still the latest and that nothing in this plan's module manifest changed materially since `13c1db1…`. If something did, reassess before coding.
- Record the approved revision and decisions in the handoff.

**Authorized scope (assuming the recommended options):**
- The responsive bands; compact header and toolbar; view chips/select; filter disclosure row and filter sheet; active-filter chips.
- The fluid contained board with sticky headers, affordance, jump control and scroll preservation.
- The stage list with chips, the tablet card grid, and the desktop-only table.
- The card hierarchy and grouped overflow menu; the card touch layout fix.
- In the drawer: sticky header, body order, Demande, collapsed history, quick-action layout, single-Escape layering fix, phone full-screen sheet.
- Dialog containers with sticky footers and `100dvh`; telephone-link gating per D2.
- Pure helpers and tests.

If the owner chooses a non-recommended option, implement that option's described behavior and nothing broader.

**Module manifest:** exactly the table in [Modules expected to change](#modules-expected-to-change-and-shared-component-blast-radius), plus new presentation components under `src/components/crm/`, new tests under `scripts/`, and `package.json` *script* entries only. Any other file needs a written justification in the PR. The files marked "Not changed" in that table are out of scope (stop condition).

**Breakpoints and responsive behavior:**
- Bands: phone below 640, tablet 640–1023, desktop ≥1024, using the existing Tailwind `sm`/`lg` breakpoints and matching `matchMedia` values.
- Default layout: board at ≥1024 and stage list below (D7).
- The `layout` and `view=closed` semantics are unchanged.

**Layout invariants:**
- Zero horizontal overflow on `documentElement` and `#main-content` at every width and state.
- Horizontal scrolling only inside the board, the chip rows and labelled table regions.
- Close and primary actions are always reachable.
- No essential text below 12px; touch targets ≥ 44px below 1024 or with a coarse pointer.
- Only existing UIF tokens and primitives; no page-local brand hex values.

**Business-logic invariants (must be byte-for-byte behaviorally unchanged):**
- Every RPC name, argument and payload; request keys and expected versions; stale-command handling.
- `opportunityAction`, `enrollmentAction`, `continueHref`, `studentHref`, `phoneLinks`, `conversationOutcomes`, `nextTaskSpec`, `scheduleKindRule` and reminder presets.
- The RCC-A1 dialogs; the RCC-A2 enrollment flow (validation, reasons, frozen retry, success wording).
- Read limits, cursors and query keys; filter URL composition, debounce, reset and Back/Forward.
- Staff labels and the scheduled-time formatter; drawer focus restoration; Tâches/WorkQueue defaults; Calendar behavior.
- Drag-and-drop stays a route to guarded dialogs only.

**Acceptance per width:** the [testing matrix](#testing-matrix), the [vertical budgets](#page-header-and-toolbar), the [phone task table](#phone-and-touch-behavior) and the [board containment criteria](#kanban-and-list-behavior). It must hold at 1440×900, 1280×800, 1024×768, 768×1024 and 390×844, and also at 1023, 767 and 320 for overflow and edge robustness.

**Chromium and WebKit:**
- Add `scripts/test-crm-rcc-b1-browser.mjs`, modelled on `test-ui-foundation-browser.mjs`: real local Auth, synthetic fixtures removed in `finally`, local feature-branch guard. It runs the matrix in both engines and asserts measured values (overflow, visible stages, budgets, target sizes, dialog bounds, Escape layering, history and Demande content, telephone gating).
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
- A need to edit `Sidebar.jsx`, global CSS rules, Tailwind configuration, the `ui/` primitive defaults, dependencies or the lockfile.
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

*Pending.* No owner decision has been recorded for B1-r1.
