'use client';
import { useEffect, useRef, useState } from 'react';
import { useCrmRead } from '@/lib/crm/queries';
import { OPPORTUNITY_VIEWS, STATUS, staffLabel } from '@/lib/crm/presentation.mjs';
import { Button } from '@/components/ui/button';
const selectedLabel = value => { try { return JSON.parse(value)?.value || 'Non précisé'; } catch { return 'Filtre invalide'; } };
const control = 'min-h-11 min-w-0 max-w-full rounded-md border bg-white px-3 text-sm';
function Facet({ kind, selected, onChange }) {
  const [search, setSearch] = useState('');
  const [cursors, setCursors] = useState([null]);
  const query = useCrmRead('crm_get_opportunity_filter_options', { p_kind: kind, p_query: search, p_cursor: cursors.at(-1), p_limit: 50 });
  return <div className="min-w-0"><label className="sr-only" htmlFor={`facet-${kind}`}>{kind === 'source' ? 'Source' : 'Programme'}</label><select id={`facet-${kind}`} className={control} value={selected} onChange={e => onChange(e.target.value)}><option value="">{kind === 'source' ? 'Toutes les sources' : 'Tous les programmes'}</option>{selected && !query.data?.rows.some(row => JSON.stringify(row) === selected) && <option value={selected}>{selectedLabel(selected)} (sélectionné)</option>}{query.data?.rows?.map(row => <option key={JSON.stringify(row)} value={JSON.stringify(row)}>{row.value || 'Non précisé'} · {row.kind}</option>)}</select>
    <details><summary className="cursor-pointer py-2 text-xs text-slate-500">Chercher d’autres valeurs</summary><input aria-label={`Rechercher ${kind === 'source' ? 'source' : 'programme'}`} className={control} maxLength={120} value={search} onChange={e => { setSearch(e.target.value); setCursors([null]); }} />{query.isError && <Button variant="ghost" onClick={() => query.refetch()}>Réessayer</Button>}<div className="flex gap-1"><Button variant="ghost" disabled={cursors.length === 1} onClick={() => setCursors(x => x.slice(0, -1))}>Précédents</Button><Button variant="ghost" disabled={!query.data?.has_more} onClick={() => setCursors(x => [...x, query.data.next_cursor])}>Suivants</Button></div></details></div>;
}
export default function OpportunityFilters({ filters, setFilter, layout }) {
  const [staffOffset, setStaffOffset] = useState(0);
  const [search, setSearch] = useState(filters.q);
  const sentSearch = useRef(filters.q), searchTimer = useRef(null), updateFilter = useRef(setFilter);
  updateFilter.current = setFilter;
  useEffect(() => { if (filters.q !== sentSearch.current) { clearTimeout(searchTimer.current); sentSearch.current = filters.q; setSearch(filters.q); } }, [filters.q]);
  useEffect(() => () => clearTimeout(searchTimer.current), []);
  const searchChanged = value => { setSearch(value); clearTimeout(searchTimer.current); searchTimer.current = setTimeout(() => { sentSearch.current = value; updateFilter.current('q',value); },250); };

  const staff = useCrmRead('crm_list_staff', { p_limit: 50, p_offset: staffOffset });
  return <div className="space-y-3"><nav aria-label="Vues des opportunités" className="flex flex-wrap gap-1">{Object.entries(OPPORTUNITY_VIEWS).map(([key, label]) => <Button key={key} variant={filters.view === key ? 'default' : 'ghost'} className="min-h-11 text-xs" aria-pressed={filters.view === key} onClick={() => setFilter('view', key)}>{label}</Button>)}</nav>
    <div className="flex flex-wrap gap-2"><input aria-label="Rechercher un prospect" maxLength={120} className={`${control} flex-1 basis-60`} placeholder="Parent, apprenant ou téléphone…" value={search} onChange={e => searchChanged(e.target.value)} />
      <select aria-label="Responsable" className={control} value={filters.owner} onChange={e => setFilter('owner', e.target.value)}><option value="all">Tous les responsables</option><option value="me">Moi</option><option value="unassigned">Non attribué</option>{!['all','me','unassigned'].includes(filters.owner) && !staff.data?.rows.some(row => row.id === filters.owner) && <option value={filters.owner}>Responsable sélectionné</option>}{staff.data?.rows.map(person => <option key={person.id} value={person.id}>{staffLabel(person)}</option>)}</select>
      <select aria-label="Canal d’acquisition" className={control} value={filters.channel} onChange={e => setFilter('channel', e.target.value)}><option value="">Tous les canaux</option><option value="manual">Manuel</option><option value="website">Site web</option><option value="meta_instant_form">Formulaire Meta</option></select>
      <Facet kind="source" selected={filters.source} onChange={v => setFilter('source', v)} /><Facet kind="program" selected={filters.program} onChange={v => setFilter('program', v)} />
      {layout === 'list' && <select aria-label="Statut" className={control} value={filters.stage} onChange={e => setFilter('stage', e.target.value)}><option value="">Tous les statuts</option>{Object.entries(STATUS).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select>}
    </div>
    {(staffOffset > 0 || staff.data?.total > 50) && <div className="flex gap-1 text-xs"><Button variant="ghost" disabled={!staffOffset} onClick={() => setStaffOffset(x => x - 50)}>Responsables précédents</Button><Button variant="ghost" disabled={staffOffset + 50 >= staff.data?.total} onClick={() => setStaffOffset(x => x + 50)}>Responsables suivants</Button></div>}
  </div>;
}
