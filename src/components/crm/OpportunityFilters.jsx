'use client';
import { useEffect, useRef, useState } from 'react';
import { useCrmRead } from '@/lib/crm/queries';
import { OPPORTUNITY_VIEWS, STATUS, staffLabel } from '@/lib/crm/presentation.mjs';
import { programmeLabel, CHANNEL_LABELS } from '@/lib/ui/presentation.mjs';
import { Button } from '@/components/ui/button';
import FilterBar from '@/components/operational/FilterBar';
import SearchField from '@/components/operational/SearchField';
import FormField from '@/components/operational/FormField';
import { ReadState } from './CrmShared';
const selectedLabel = value => { try { return programmeLabel(JSON.parse(value)?.value); } catch { return 'Filtre invalide'; } };
function Facet({ kind, selected, onChange }) {
  const [search, setSearch] = useState(''), [cursors, setCursors] = useState([null]);
  const query = useCrmRead('crm_get_opportunity_filter_options', { p_kind: kind, p_query: search, p_cursor: cursors.at(-1), p_limit: 50 });
  const label = kind === 'source' ? 'Source' : 'Programme';
  return <div className="min-w-0 flex-1 basis-48"><FormField label={label}><select disabled={query.isPending || query.isError || !Array.isArray(query.data?.rows)} className="operational-control" value={selected} onChange={e => onChange(e.target.value)}><option value="">{kind === 'source' ? 'Toutes les sources' : 'Tous les programmes'}</option>{selected && !query.data?.rows?.some(row => JSON.stringify(row) === selected) && <option value={selected}>{selectedLabel(selected)} (sélectionné)</option>}{query.data?.rows?.map(row => <option key={JSON.stringify(row)} value={JSON.stringify(row)}>{kind === 'program' ? programmeLabel(row.value) : row.value || 'Non précisé'}{kind === 'source' ? ` · ${CHANNEL_LABELS[row.kind] || 'Canal non précisé'}` : row.kind === 'interest' ? ' · Intérêt déclaré' : row.kind === 'session' ? ' · Programme d’inscription' : ''}</option>)}</select></FormField>
    {(query.isError || (!query.isPending && !Array.isArray(query.data?.rows))) && <ReadState query={query} available={Array.isArray(query.data?.rows)}/>}
    <details><summary className="cursor-pointer py-2 text-xs text-muted-foreground">Chercher d’autres valeurs</summary><SearchField label={`Rechercher ${label.toLowerCase()}`} maxLength={120} value={search} onChange={value => { setSearch(value); setCursors([null]); }}/><div className="flex gap-1"><Button variant="ghost" disabled={cursors.length === 1 || query.isFetching} onClick={() => setCursors(x => x.slice(0, -1))}>Précédent</Button><Button variant="ghost" disabled={!query.data?.has_more || query.isFetching} onClick={() => setCursors(x => [...x, query.data.next_cursor])}>Suivant</Button></div></details>
  </div>;
}
export default function OpportunityFilters({ filters, setFilter, layout, onReset, contact }) {
  const [staffOffset, setStaffOffset] = useState(0), [search, setSearch] = useState(filters.q), [notice,setNotice] = useState('');
  const sentSearch = useRef(filters.q), searchTimer = useRef(null), updateFilter = useRef(setFilter);
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
  const activeCount = Number(!!contact) + Object.entries(filters).filter(([key,value]) => key === 'owner' ? value !== 'all' : !['view'].includes(key) && !!value).length;
  return <div className="space-y-2">
    <nav aria-label="Vues des opportunités" className="flex max-w-full gap-1 overflow-x-auto pb-1">{Object.entries(OPPORTUNITY_VIEWS).map(([key, label]) => <Button key={key} variant={filters.view === key ? 'secondary' : 'ghost'} className="shrink-0 text-xs" aria-pressed={filters.view === key} onClick={() => { setNotice(''); setFilter('view', key); }}>{label}</Button>)}</nav>
    <FilterBar activeCount={activeCount} summary={notice || `${activeCount} filtre${activeCount > 1 ? 's' : ''} actif${activeCount > 1 ? 's' : ''} · vue ${OPPORTUNITY_VIEWS[filters.view] || 'non précisée'}`} onReset={() => { onReset(); setNotice(`Filtres effacés · vue ${OPPORTUNITY_VIEWS[filters.view]}`); }} search={<SearchField label="Rechercher un prospect" className="flex-1 basis-60" maxLength={120} placeholder="Parent, apprenant ou téléphone…" value={search} onChange={searchChanged} onClear={clearSearch}/>}
      more={<><div className="min-w-0 flex-1 basis-48"><FormField label="Responsable"><select disabled={staff.isPending || staff.isError || !Array.isArray(staff.data?.rows)} className="operational-control" value={filters.owner} onChange={e => setFilter('owner', e.target.value)}><option value="all">Tous les responsables</option><option value="me">Moi</option><option value="unassigned">Non attribué</option>{!['all','me','unassigned'].includes(filters.owner) && !staff.data?.rows?.some(row => row.id === filters.owner) && <option value={filters.owner}>Responsable sélectionné</option>}{staff.data?.rows?.map(person => <option key={person.id} value={person.id}>{staffLabel(person)}</option>)}</select></FormField></div>
      <div className="min-w-0 flex-1 basis-48"><FormField label="Canal d’acquisition"><select className="operational-control" value={filters.channel} onChange={e => setFilter('channel', e.target.value)}><option value="">Tous les canaux</option>{Object.entries(CHANNEL_LABELS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></FormField></div>
      <Facet kind="source" selected={filters.source} onChange={v => setFilter('source', v)}/>
      {layout === 'list' && <div className="min-w-0 flex-1 basis-48"><FormField label="Statut"><select className="operational-control" value={filters.stage} onChange={e => setFilter('stage', e.target.value)}><option value="">Tous les statuts</option>{Object.entries(STATUS).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></FormField></div>}
      {(staff.isError || (!staff.isPending && !Array.isArray(staff.data?.rows))) && <ReadState query={staff} available={Array.isArray(staff.data?.rows)}/>}
      {(staffOffset > 0 || staff.data?.total > 50) && <div className="flex flex-wrap gap-1"><Button variant="ghost" disabled={!staffOffset || staff.isFetching} onClick={() => setStaffOffset(x => x - 50)}>Responsables précédents</Button><Button variant="ghost" disabled={staffOffset + 50 >= staff.data?.total || staff.isFetching} onClick={() => setStaffOffset(x => x + 50)}>Responsables suivants</Button></div>}</>}
    ><Facet kind="program" selected={filters.program} onChange={v => setFilter('program', v)}/></FilterBar>
  </div>;
}
