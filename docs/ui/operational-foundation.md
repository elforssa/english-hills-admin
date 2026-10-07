# Operational UI Foundation usage

[UIF-r1](../architecture/plans/english-hills-ui-foundation.md) and [ADR-005](../architecture/decisions/ADR-005-operational-ui-foundation.md) own the approved contract. This guide describes the source implementation; it does not authorize deployment or another page migration.

## Layout and controls

Use `PageFrame` with `width="standard"` (1280px), `detail` (1024px), `form` (768px) or `wide` (1600px). It supplies the operational density, 16px mobile / 24px desktop gutters and normal page flow. Use `PageHeader` for title, description, breadcrumb and authorized action slots. Keep role checks in the page.

```jsx
<PageFrame width="standard">
  <PageHeader title="Apprenants" description="Dossiers des apprenants" actions={allowedActions}/>
  <FilterBar search={<SearchField label="Rechercher un apprenant" value={search} onChange={setSearch}/>}
    more={additionalControls} activeCount={activeCount} onReset={resetExistingDefaults}>
    <FormField label="Statut du dossier"><select className="operational-control" value={status} onChange={changeStatus}>{options}</select></FormField>
  </FilterBar>
</PageFrame>
```

`PageHeader compact` and `FilterBar compact` are opt-in variants added by [RCC-B1](../architecture/plans/rcc-b1-responsive-opportunities.md) for dense workspaces; their defaults are unchanged. The compact header stays on one row at every width. The compact filter bar is a single toolbar row: its reset appears only when `onReset` is given, and its polite summary stays announced but is visually hidden unless `summaryVisible`.

`FormField` associates its label, help and error with its single input/select/textarea. Existing handlers retain command validation and errors. Short selects remain native; bounded staff and facet reads retain paging. Use `operational-secondary` for 13px secondary row text; helpers/time/badges use 12px. Never shrink essential text below 12px. Use semantic theme tokens; danger is reserved for destructive actions, ordinary interaction uses the neutral blue accent.

## Filters and navigation

`FilterBar` provides presentation only. The CRM adapter patches the latest URL with the adopted native navigation helper. A reset clears search and optional refinements (including contact), cancels pending debounce, resets cursors and preserves system View, layout, drawer and return context. My Work restores assignee `me` / owner `all` and retains its bucket. Students restores its existing defaults. Clear-search changes only search. Reads are keyed by committed scope and user/role; never introduce a parallel state store or retain cross-filter data as current.

## Read truth

`ReadState` accepts explicit `state`, content, optional message/help and retry/reset callbacks. It does not fetch or infer truth from a number.

```jsx
<ReadState state={state} onRetry={retrySameRead} onReset={filteredEmpty ? resetFilters : undefined}>
  {sameScopeContent}
</ReadState>
```

Use `loading` before the first result; `refreshing` retains same-scope content with busy notice; `stale` retains it with a persistent refresh-failure alert. `empty` and `filtered-empty` require a successful valid response; `unavailable` covers unsupported/missing values; `error` covers failed reads without prior successful same-scope content. `ready` may contain a genuine zero. Keep the shared content boundary stable across ready/refresh/stale states so focused row and action nodes survive a background read. The Dashboard validates returned finance RPC errors, missing payloads and finite numeric fields before rendering numbers; formulas and arguments remain domain-owned.

## Rows, badges and staff

Domain components own their rows/cards and action dispatch. CRM status, dossier status, enrollment status and payment status remain distinct maps. Unknown display values are neutral. `programmeLabel` changes displayed Yearly vocabulary only; payloads remain Yearly. Use the existing CRM `staffLabel` with authorized server `display_label`, and `scheduledLabel` with PostgreSQL civil projections. No profile enrichment, raw UUID, browser ICU schedule fallback or inferred relationships.

The three pilots demonstrate wide Board/List, task-first rows, and standard Students table/mobile cards. Tables use scoped headers and bounded scroll only where necessary. Preserve real totals/cursors: `SimplePager` takes actual page/count and pending state; `CursorPager` takes previous/hasMore and callbacks, without invented totals.

## Overlays and actions

Keep Radix Sheet/Dialog focus management. Operational drawer is approximately 620px desktop / full width mobile. Standard Dialog is 480px; form dialogs may be 640px, always bounded by viewport minus gutters with scrollable content. Add the operational class to domain overlays. Use named close controls, visible focus, Escape and focus restoration. Frequent domain action remains visible; rare/destructive actions use existing menus and existing semantic commands.

Since [RCC-B1](../architecture/plans/rcc-b1-responsive-opportunities.md#drawer-and-sheet-behavior), the CRM drawer keeps a fixed header (contact, learner/programme, stage and owner, destinations) above one scrolling body: next action, quick actions, other open actions, Demande (origin, latest/first inquiry, declared interest, summary and paged full answers), placement, enrollment and a collapsed history. `SheetContent` itself never scrolls, so the primitive's single close control stays visible. Non-Dialog popups inside a sheet are controlled and registered with the page-local Escape guard (`useNestedLayerEscapeGuard` / `useGuardedLayer`). The summary uses one sanitized submission and at most three labelled answers. Full answers retain limit 5 / offset paging. Telephone and WhatsApp are visibly distinct; show the same destination used by the existing launcher. Launching records no activity.

## Responsive navigation and dialog footers

Opportunities decides its band only with the Tailwind `sm` (640px) and `lg` (1024px) queries, shared verbatim by CSS variants and `matchMedia` (`BAND_QUERIES`). Below `lg` it shows a stage list: a labelled group of stage chips (`aria-pressed`, counts as display data) that set the existing `stage` filter and never issue a command. Single rows that may overflow (`ScrollRow`, the board) scroll inside themselves with decorative edge fades; the page never scrolls horizontally.

Form dialogs that can outgrow the viewport wrap their existing error alert and button row in `DialogStickyFooter` and add `STICKY_DIALOG` to `DialogContent`: the dialog stays the single scroll container, the footer sticks to its bottom, a long alert scrolls inside a capped region, and the footer height becomes the dialog's scroll padding so a field focused by an error contract stays visible above it.

## Future touched pages

Adopt these primitives only within a separately authorized outcome. Test long French/Arabic names, unknown values, read failures, mobile reflow, keyboard/focus, 200% zoom and contrast. Keep sensitive handlers, authorization and read contracts explicit. Attendance save semantics, immutable receipt arithmetic and consequential enrollment/email actions require their own domain work; this guide does not commission them. No universal EntityTable, form engine, pipeline engine or configurable dashboard is provided.
