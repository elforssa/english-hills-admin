'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { getBrowserClient } from '@/lib/supabase';
import { PEOPLE_MESSAGES, peopleMessage } from '@/lib/people.mjs';

async function rpc(name, args) {
  const { data, error } = await getBrowserClient().rpc(name, args);
  if (error) throw error;
  return data;
}

// Merges (RWR-r5 §5.3, OD-8 « link, don't move »), direction only, director and admin.
// Prospects: the source keeps its history (append-only) and is read through the
// target's merge set; its action is cancelled through set_next_action.
// Students: only family links, authorized adults and unconverted prospects move;
// enrollments, charges, receipts, attendance and tests stay on the source id. The
// student with a live enrollment is always the one kept: the dialog swaps the
// direction itself, and the server refuses the unswapped call anyway.
export default function MergeDialog({ kind, source, target, onClose, onMerged }) {
  const [pair, setPair] = useState({ source, target });
  const [preview, setPreview] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const key = useRef(crypto.randomUUID());
  const client = useQueryClient();
  useEffect(() => {
    if (kind !== 'student') return;
    let live = true;
    (async () => {
      try {
        let check = await rpc('student_merge_preview', { p_source: pair.source.id, p_target: pair.target.id });
        if (check.refusal === 'people.merge_direction') {
          const swapped = await rpc('student_merge_preview', { p_source: pair.target.id, p_target: pair.source.id });
          if (!swapped.refusal) { if (live) { setPair({ source: pair.target, target: pair.source }); } return; }
        }
        if (live) setPreview(check);
      } catch (err) { if (live) setError(peopleMessage(err) || 'Aperçu indisponible. Réessayez.'); }
    })();
    return () => { live = false; };
  }, [kind, pair.source, pair.target]);
  const refusal = kind === 'student' ? preview?.refusal : null;
  async function merge() {
    setBusy(true); setError('');
    try {
      const result = kind === 'student'
        ? await rpc('merge_students', { p_source: pair.source.id, p_target: pair.target.id })
        : await rpc('crm_merge_prospects', { p_request_key: key.current, p_source: pair.source.id, p_target: pair.target.id,
          p_expected_source_version: pair.source.version, p_expected_target_version: pair.target.version });
      await client.invalidateQueries();
      toast.success('Fiches fusionnées');
      onMerged?.(pair.target.id, result);
    } catch (err) {
      key.current = crypto.randomUUID();
      setError(peopleMessage(err) || (err?.code === '42501' ? 'La fusion est réservée à la direction.' : err?.code === 'PT409' ? 'Une des fiches a changé : fermez et rouvrez avant de fusionner.' : 'Fusion impossible. Réessayez.'));
    } finally { setBusy(false); }
  }
  const label = kind === 'student' ? 'apprenant' : 'prospect';
  return <Dialog open onOpenChange={value => { if (!value && !busy) onClose(); }}><DialogContent className="operational sm:max-w-[560px]">
    <DialogHeader><DialogTitle>Fusionner deux fiches</DialogTitle><DialogDescription>La fiche conservée garde son identifiant ; l’autre y est rattachée. Aucun reçu, paiement ni historique n’est modifié.</DialogDescription></DialogHeader>
    <dl className="grid gap-2 text-sm">
      <div className="rounded-md border p-3"><dt className="text-xs text-slate-500">Fiche fusionnée ({label})</dt><dd className="break-words font-medium" data-testid="merge-source">{pair.source.name}</dd></div>
      <div className="rounded-md border border-blue-300 bg-blue-50 p-3"><dt className="text-xs text-blue-900">Fiche conservée</dt><dd className="break-words font-medium" data-testid="merge-target">{pair.target.name}</dd></div>
    </dl>
    {kind === 'student' && preview && !refusal && <p className="text-sm text-slate-700">Rattachés à la fiche conservée : {preview.family_links} lien(s) famille, {preview.authorized_adults} adulte(s) autorisé(s), {preview.prospects} prospect(s). {preview.prospects_kept > 0 ? `${preview.prospects_kept} prospect(s) inscrit(s) restent sur l’ancienne fiche et s’affichent sur la fiche conservée. ` : ''}Inscriptions, reçus, présences et tests restent sur leur fiche d’origine et s’affichent sur la fiche conservée.</p>}
    {kind === 'prospect' && <p className="text-sm text-slate-700">Le prospect fusionné est retiré des listes ; son historique s’affiche sur la fiche conservée et sa prochaine action est annulée.</p>}
    {(refusal || error) && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error || PEOPLE_MESSAGES[refusal]}</p>}
    <div className="flex flex-wrap justify-end gap-2">{kind === 'prospect' && <Button variant="ghost" disabled={busy} className="mr-auto" onClick={() => { setError(''); setPair(p => ({ source: p.target, target: p.source })); }}>Inverser le sens</Button>}<Button variant="outline" disabled={busy} onClick={onClose}>Annuler</Button>
      <Button disabled={busy || !!refusal || (kind === 'student' && !preview)} onClick={merge}>{busy ? 'Fusion…' : 'Fusionner'}</Button></div>
  </DialogContent></Dialog>;
}
