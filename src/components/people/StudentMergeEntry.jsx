'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { getBrowserClient } from '@/lib/supabase';
import { formatPhoneFr } from '@/lib/phone.mjs';
import { peopleMessage } from '@/lib/people.mjs';
import MergeDialog from './MergeDialog';

// Student file, direction only (RWR-r5 §5.3, OD-8): « Fusionner avec une autre fiche »
// picks the duplicate through the people search; the merge dialog chooses the
// direction. Files merged into this one are listed with « Annuler la fusion ».
export default function StudentMergeEntry({ student, mergedFrom, onChanged }) {
  const [picking, setPicking] = useState(false), [query, setQuery] = useState(''), [rows, setRows] = useState([]);
  const [pair, setPair] = useState(null), [busy, setBusy] = useState(false);
  const client = useQueryClient();
  useEffect(() => {
    if (!picking || query.trim().length < 2) { setRows([]); return undefined; }
    const id = setTimeout(async () => {
      const { data } = await getBrowserClient().rpc('find_people', { p_query: query.trim(), p_limit: 20 });
      setRows((data?.rows || []).filter(r => r.kind === 'student' && r.id !== student.id));
    }, 250);
    return () => clearTimeout(id);
  }, [picking, query, student.id]);
  async function unmerge(source) {
    if (!confirm(`Annuler la fusion de « ${source.full_name} » ? Ses liens famille, adultes autorisés et prospects reviennent sur sa fiche.`)) return;
    setBusy(true);
    const { error } = await getBrowserClient().rpc('unmerge_student', { p_source: source.id });
    setBusy(false);
    if (error) { toast.error(peopleMessage(error) || 'Annulation impossible.'); return; }
    await client.invalidateQueries();
    toast.success('Fusion annulée');
    onChanged();
  }
  return <>
    {mergedFrom.length > 0 && <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm" data-testid="merged-from">
      <p className="font-medium">Fiche{mergedFrom.length > 1 ? 's' : ''} fusionnée{mergedFrom.length > 1 ? 's' : ''} ici</p>
      <p className="text-xs text-slate-700">Leurs inscriptions, engagements, reçus, présences et évaluations s’affichent sur cette fiche ; ils restent enregistrés sous leur fiche d’origine.</p>
      <ul className="mt-2 space-y-1">{mergedFrom.map(s => <li key={s.id} className="flex flex-wrap items-center gap-2"><span>{s.full_name}{s.telephone ? ` · ${formatPhoneFr(s.telephone)}` : ''}</span><Button size="sm" variant="ghost" className="min-h-9" disabled={busy} onClick={() => unmerge(s)}>Annuler la fusion</Button></li>)}</ul>
    </div>}
    <Button variant="outline" onClick={() => setPicking(true)}>Fusionner avec une autre fiche</Button>
    {picking && <Dialog open onOpenChange={open => { if (!open) setPicking(false); }}><DialogContent className="operational sm:max-w-[520px]">
      <DialogHeader><DialogTitle>Fusionner avec une autre fiche</DialogTitle><DialogDescription>Cherchez le doublon de « {student.full_name} » : nom, téléphone ou e-mail.</DialogDescription></DialogHeader>
      <input aria-label="Rechercher le doublon" autoFocus type="search" className="operational-control font-normal" value={query} onChange={e => setQuery(e.target.value)} />
      <ul className="max-h-72 divide-y overflow-y-auto rounded-md border">{rows.map(r => <li key={r.id}><button type="button" className="min-h-11 w-full px-3 py-2 text-left hover:bg-slate-50" onClick={() => { setPicking(false); setPair({ source: { id: r.id, name: r.name }, target: { id: student.id, name: student.full_name } }); }}>
        <span className="block font-medium">{r.name}</span><span className="block text-xs text-slate-600">{[r.phone ? formatPhoneFr(r.phone) : null, r.status, r.archived ? 'archivé' : null].filter(Boolean).join(' · ')}</span></button></li>)}</ul>
    </DialogContent></Dialog>}
    {pair && <MergeDialog kind="student" source={pair.source} target={pair.target} onClose={() => setPair(null)} onMerged={targetId => { setPair(null); if (targetId !== student.id) window.location.assign(`/students/${targetId}`); else onChanged(); }} />}
  </>;
}
