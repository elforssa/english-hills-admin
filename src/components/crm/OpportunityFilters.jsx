'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { useCrmRead } from '@/lib/crm/queries';
import { OPPORTUNITY_VIEWS, STATUS, staffLabel } from '@/lib/crm/presentation.mjs';
import { programmeLabel, CHANNEL_LABELS } from '@/lib/ui/presentation.mjs';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import FilterBar from '@/components/operational/FilterBar';
import SearchField from '@/components/operational/SearchField';
import FormField from '@/components/operational/FormField';
import { ReadState } from './CrmShared';
import ScrollRow from './ScrollRow';
import { useNestedLayerEscapeGuard } from './useNestedLayerEscapeGuard';
const selectedLabel = value => { try { return programmeLabel(JSON.parse(value)?.value); } catch { return 'Filtre invalide'; } };
const sourceLabel = value => { try { return JSON.parse(value)?.value || 'Non précisé'; } catch { return 'Filtre invalide'; } };
// One bounded facet read shared by its select and its value search/paging.
function useFacet(kind) {
  const [search, setSearch] = useState(''), [cursors, setCursors] = useState([null]);
  const query = useCrmRead('crm_get_opportunity_filter_options', { p_kind: kind, p_query: search, p_cursor: cursors.at(-1), p_limit: 50 });
  return { kind, label: kind === 'source' ? 'Source' : 'Programme', query, search, setSearch, cursors, setCursors };
}
function FacetSelect({ facet, selected, onChange }) {
  const { kind, label, query } = facet;
  return <div className="min-w-0 flex-1 basis-48"><FormField label={label}><select disabled={query.isPending || query.isError || !Array.isArray(query.data?.rows)} className="operational-control" value={selected} onChange={e => onChange(e.target.value)}><option value="">{kind === 'source' ? 'Toutes les sources' : 'Tous les programmes'}</option>{selected && !query.data?.rows?.some(row => JSON.stringify(row) === selected) && <option value={selected}>{selectedLabel(selected)} (sélectionné)</option>}{query.data?.rows?.map(row => <option key={JSON.stringify(row)} value={JSON.stringify(row)}>{kind === 'program' ? programmeLabel(row.value) : row.value || 'Non précisé'}{kind === 'source' ? ` · ${CHANNEL_LABELS[row.kind] || 'Canal non précisé'}` : row.kind === 'interest' ? ' · Intérêt déclaré' : row.kind === 'session' ? ' · Programme d’inscription' : ''}</option>)}</select></FormField>
    {(query.isError || (!query.isPending && !Array.isArray(query.data?.rows))) && <ReadState query={query} available={Array.isArray(query.data?.rows)}/>}
  </div>;
}
function FacetSearch({ facet }) {
  const { label, query, search, setSearch, cursors, setCursors } = facet;
  return <details className="min-w-0 basis-48"><summary className="cursor-pointer py-2 text-xs text-muted-foreground">{facet.kind === 'program' ? 'Chercher d’autres programmes' : 'Chercher d’autres valeurs'}</summary><SearchField label={`Rechercher ${label.toLowerCase()}`} maxLength={120} value={search} onChange={value => { setSearch(value); setCursors([null]); }}/><div className="flex gap-1"><Button variant="ghost" disabled={cursors.length === 1 || query.isFetching} onClick={() => setCursors(x => x.slice(0, -1))}>Précédent</Button><Button variant="ghost" disabled={!query.data?.has_more || query.isFetching} onClick={() => setCursors(x => [...x, query.data.next_cursor])}>Suivant</Button></div></details>;
}
export default function OpportunityFilters({ filters, setFilter, layout, onReset, contact, band, toggle }) {
  const [staffOffset, setStaffOffset] = useState(0), [search, setSearch] = useState(filters.q), [notice,setNotice] = useState('');
  const [panelOpen, setPanelOpen] = useState(false), [sheetOpen, setSheetOpen] = useState(false);
  const sentSearch = useRef(filters.q), searchTimer = useRef(null), updateFilter = useRef(setFilter), filtersButton = useRef(null);
  const panelId = useId(), viewId = useId();
  const desktop = band === 'desktop', sheetShown = sheetOpen && !desktop;
  const guard = useNestedLayerEscapeGuard(sheetShown);
  updateFilter.current = setFilter;
  useEffect(() => { if (filters.q !== sentSearch.current) { clearTimeout(searchTimer.current); sentSearch.current = filters.q; setSearch(filters.q); } }, [filters.q]);
  useEffect(() => {
    const cancel = () => { clearTimeout(searchTimer.current); const q = new URLSearchParams(window.location.search).get('q') || ''; sentSearch.current=q; setSearch(q); };
    window.addEventListener('popstate',cancel); window.addEventListener('crm:filter-reset',cancel);
    return () => { clearTimeout(searchTimer.current); window.removeEventListener('popstate',cancel); window.removeEventListener('crm:filter-reset',cancel); };
  }, []);
  const searchChanged = value => { setSearch(value); setNotice(''); clearTimeout(searchTimer.current); searchTimer.current = setTimeout(() => { sentSearch.current = value; updateFilter.current('q',value); },250); };
  const clearSearch = () => { clearTimeout(searchTimer.current); sentSearch.current=''; setSearch(''); setFilter('q',''); };
  const staff = useCrmRead('crm_list_staff', { p_limit: 50, p_offset: staffOffset });
  const program = useFacet('program'), source = useFacet('source');
  const activeCount = Number(!!contact) + Object.entries(filters).filter(([key,value]) => key === 'owner' ? value !== 'all' : !['view'].includes(key) && !!value).length;
  const reset = () => { onReset(); setNotice(`Filtres effacés · vue ${OPPORTUNITY_VIEWS[filters.view]}`); };
  const ownerLabel = filters.owner === 'me' ? 'Moi' : filters.owner === 'unassigned' ? 'Non attribué' : staffLabel(staff.data?.rows?.find(row => row.id === filters.owner));
  // Removable chips for the refinements in effect; removing one patches the same URL key.
  const chips = [
    filters.q && { key: 'q', label: `Recherche : ${filters.q}`, remove: clearSearch },
    filters.owner !== 'all' && { key: 'owner', label: `Responsable : ${ownerLabel}`, remove: () => setFilter('owner', '') },
    filters.program && { key: 'program', label: `Programme : ${selectedLabel(filters.program)}`, remove: () => setFilter('program', '') },
    filters.channel && { key: 'channel', label: `Canal : ${CHANNEL_LABELS[filters.channel] || 'Canal non précisé'}`, remove: () => setFilter('channel', '') },
    filters.source && { key: 'source', label: `Source : ${sourceLabel(filters.source)}`, remove: () => setFilter('source', '') },
    filters.stage && { key: 'stage', label: `Statut : ${STATUS[filters.stage] || 'Statut non précisé'}`, remove: () => setFilter('stage', '') }
  ].filter(Boolean);
  const refinements = <>
    <div className="min-w-0 flex-1 basis-48"><FormField label="Responsable"><select disabled={staff.isPending || staff.isError || !Array.isArray(staff.data?.rows)} className="operational-control" value={filters.owner} onChange={e => setFilter('owner', e.target.value)}><option value="all">Tous les responsables</option><option value="me">Moi</option><option value="unassigned">Non attribué</option>{!['all','me','unassigned'].includes(filters.owner) && !staff.data?.rows?.some(row => row.id === filters.owner) && <option value={filters.owner}>Responsable sélectionné</option>}{staff.data?.rows?.map(person => <option key={person.id} value={person.id}>{staffLabel(person)}</option>)}</select></FormField></div>
    <div className="min-w-0 flex-1 basis-48"><FormField label="Canal d’acquisition"><select className="operational-control" value={filters.channel} onChange={e => setFilter('channel', e.target.value)}><option value="">Tous les canaux</option>{Object.entries(CHANNEL_LABELS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></FormField></div>
    <FacetSelect facet={source} selected={filters.source} onChange={v => setFilter('source', v)}/>
    {layout === 'list' && <div className="min-w-0 flex-1 basis-48"><FormField label="Statut"><select className="operational-control" value={filters.stage} onChange={e => setFilter('stage', e.target.value)}><option value="">Tous les statuts</option>{Object.entries(STATUS).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></FormField></div>}
    {(staff.isError || (!staff.isPending && !Array.isArray(staff.data?.rows))) && <ReadState query={staff} available={Array.isArray(staff.data?.rows)}/>}
    {(staffOffset > 0 || staff.data?.total > 50) && <div className="flex flex-wrap gap-1"><Button variant="ghost" disabled={!staffOffset || staff.isFetching} onClick={() => setStaffOffset(x => x - 50)}>Responsables précédents</Button><Button variant="ghost" disabled={staffOffset + 50 >= staff.data?.total || staff.isFetching} onClick={() => setStaffOffset(x => x + 50)}>Responsables suivants</Button></div>}
  </>;
  const viewSelect = <div className="min-w-0 flex-1 basis-28 lg:basis-40 xl:hidden"><label htmlFor={viewId} className="mb-1 block text-sm font-medium max-lg:sr-only">Vue</label><select id={viewId} className="operational-control" value={filters.view} onChange={e => { setNotice(''); setFilter('view', e.target.value); }}>{Object.entries(OPPORTUNITY_VIEWS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>;
  return <div className="space-y-2">
    <FilterBar compact activeCount={activeCount} summaryVisible={activeCount > 0 || !!notice} summary={notice || `${activeCount} filtre${activeCount > 1 ? 's' : ''} actif${activeCount > 1 ? 's' : ''} · vue ${OPPORTUNITY_VIEWS[filters.view] || 'non précisée'}`} onReset={activeCount > 0 ? reset : undefined} search={<SearchField label="Rechercher un prospect" className="basis-full lg:flex-1 lg:basis-60" maxLength={120} placeholder="Parent, apprenant ou téléphone…" value={search} onChange={searchChanged} onClear={clearSearch}/>}>
      {viewSelect}
      {desktop && <FacetSelect facet={program} selected={filters.program} onChange={v => setFilter('program', v)}/>}
      <Button ref={filtersButton} type="button" variant="outline" className="shrink-0" aria-expanded={desktop ? panelOpen : sheetShown} aria-controls={desktop && panelOpen ? panelId : undefined} aria-haspopup={desktop ? undefined : 'dialog'} onClick={() => desktop ? setPanelOpen(x => !x) : setSheetOpen(true)}><SlidersHorizontal size={16} />Filtres{activeCount > 0 ? ` · ${activeCount}` : ''}</Button>
      {toggle}
    </FilterBar>
    <ScrollRow aria-label="Vues des opportunités" role="navigation" wrapperClassName="max-xl:hidden">{Object.entries(OPPORTUNITY_VIEWS).map(([key, label]) => <Button key={key} variant={filters.view === key ? 'secondary' : 'ghost'} className="h-9 shrink-0 px-3 text-xs" aria-pressed={filters.view === key} onClick={() => { setNotice(''); setFilter('view', key); }}>{label}</Button>)}</ScrollRow>
    {desktop && panelOpen && <div id={panelId} className="flex min-w-0 flex-wrap items-end gap-2 rounded-lg border bg-card p-3">{refinements}<FacetSearch facet={source}/><FacetSearch facet={program}/></div>}
    {chips.length > 0 && <div role="group" aria-label="Filtres actifs" className="flex min-w-0 flex-wrap gap-1">{chips.map(chip => <Button key={chip.key} type="button" variant="secondary" className="h-8 max-w-full rounded-full px-3 text-xs" aria-label={`Retirer le filtre · ${chip.label}`} onClick={() => { setNotice(''); chip.remove(); }}><span className="truncate">{chip.label}</span><X size={14} /></Button>)}</div>}
    {!desktop && <Sheet open={sheetShown} onOpenChange={setSheetOpen}><SheetContent onEscapeKeyDown={guard.onEscapeKeyDown} onCloseAutoFocus={event => { event.preventDefault(); filtersButton.current?.focus(); }} className="operational flex w-full max-w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[620px] sm:rounded-l-overlay motion-reduce:data-[state=open]:animate-none motion-reduce:data-[state=closed]:animate-none motion-reduce:transition-none">
      <div className="shrink-0 border-b px-4 pb-3 pr-14 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 sm:pt-5"><SheetHeader className="space-y-1 text-left"><SheetTitle>Filtres</SheetTitle><SheetDescription>Chaque choix s’applique immédiatement.</SheetDescription></SheetHeader></div>
      <div data-filter-body className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6"><div className="flex min-w-0 flex-col gap-4"><FacetSelect facet={program} selected={filters.program} onChange={v => setFilter('program', v)}/><FacetSearch facet={program}/>{refinements}<FacetSearch facet={source}/></div></div>
      <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t bg-background px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-6"><Button type="button" variant="ghost" disabled={!activeCount} onClick={reset}>Effacer les filtres</Button><Button type="button" onClick={() => setSheetOpen(false)}>Voir les résultats</Button></div>
    </SheetContent></Sheet>}
  </div>;
}
