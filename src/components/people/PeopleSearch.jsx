'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useCrmRead } from '@/lib/crm/queries';
import { STATUS } from '@/lib/crm/presentation.mjs';
import { formatPhoneFr } from '@/lib/phone.mjs';
import { MATCH_REASONS, PERSON_KINDS, personHref } from '@/lib/people.mjs';

// « Rechercher une personne » (RWR-r5 §5.2): one search over prospects (active and
// closed) and students (active and archived) by name, e-mail or phone in any format
// from 6 digits. Opening a result never creates anything (day script 5).
export default function PeopleSearch({ open, onClose }) {
  const router = useRouter();
  const [query, setQuery] = useState(''), [term, setTerm] = useState('');
  useEffect(() => { const id = setTimeout(() => setTerm(query.trim()), 250); return () => clearTimeout(id); }, [query]);
  const found = useCrmRead('find_people', { p_query: term, p_limit: 20 }, open && term.length >= 2);
  const rows = found.data?.rows || [];
  function go(row) { onClose(); setQuery(''); router.push(personHref(row)); }
  return <Dialog open={open} onOpenChange={value => { if (!value) onClose(); }}><DialogContent className="operational top-[10%] translate-y-0 sm:max-w-[600px]">
    <DialogHeader><DialogTitle>Rechercher une personne</DialogTitle><DialogDescription>Prospects et apprenants, y compris clôturés et archivés : nom, e-mail ou téléphone (6 chiffres ou plus, tous formats).</DialogDescription></DialogHeader>
    <label className="sr-only" htmlFor="people-search-input">Nom, téléphone ou e-mail</label>
    <input id="people-search-input" autoFocus type="search" className="operational-control font-normal" placeholder="Nom, téléphone ou e-mail" maxLength={120} value={query} onChange={e => setQuery(e.target.value)} />
    <div aria-live="polite" className="min-h-6 text-sm">
      {term.length < 2 ? <p className="text-slate-500">Saisissez au moins 2 caractères.</p>
        : found.isError ? <p role="alert">Recherche indisponible. Réessayez.</p>
        : found.isPending ? <p className="text-slate-500">Recherche…</p>
        : !rows.length ? <p>Aucune personne trouvée.</p>
        : <ul data-testid="people-results" className="max-h-[60vh] divide-y overflow-y-auto rounded-md border">{rows.map(row => <li key={`${row.kind}:${row.id}`}>
          <button type="button" data-testid="people-result" data-kind={row.kind} data-id={row.id} className="w-full min-h-11 px-3 py-2 text-left hover:bg-slate-50 focus-visible:bg-slate-50" onClick={() => go(row)}>
            <span className="block break-words font-medium">{row.name || 'Sans nom'}<span className="ml-2 rounded bg-slate-100 px-1.5 text-xs font-normal text-slate-700">{PERSON_KINDS[row.kind]}{row.archived ? ' · archivé' : ''}</span></span>
            <span className="block break-words text-xs text-slate-600">{[row.contact_name && row.contact_name !== row.name ? `Contact ${row.contact_name}` : null, row.phone ? formatPhoneFr(row.phone) : null, row.kind === 'prospect' ? STATUS[row.status] || row.status : row.status, row.siblings > 0 ? `${row.siblings + 1} apprenants pour ce contact` : null, row.reason !== 'name' ? MATCH_REASONS[row.reason] : null].filter(Boolean).join(' · ')}</span>
          </button></li>)}</ul>}
    </div>
  </DialogContent></Dialog>;
}
