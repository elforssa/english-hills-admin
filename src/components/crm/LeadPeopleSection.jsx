'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { crmRpc, useCrmRefresh } from '@/lib/crm/queries';
import { STATUS } from '@/lib/crm/presentation.mjs';
import { MATCH_DECISIONS, MATCH_REASONS, PEOPLE_MESSAGES, personHref, personLine } from '@/lib/people.mjs';
import MergeDialog from '@/components/people/MergeDialog';

// The drawer's people block (RWR-r5 §5.2–5.3): « Modifier la fiche », the other
// learners of the same contact with « Ajouter un enfant », possible duplicates still
// unanswered (« Même famille » / « Personne différente », recorded), and — for the
// direction — « Fusionner ». A merged prospect shows where it now lives.
export default function LeadPeopleSection({ lead, onEdit, onAddChild, onOpenLead }) {
  const { role } = useAuth();
  const refresh = useCrmRefresh();
  const [merge, setMerge] = useState(null), [busy, setBusy] = useState('');
  const canMerge = ['admin', 'director'].includes(role);
  const candidates = lead.duplicate_candidates || [];
  async function answer(m, decision) {
    setBusy(`${m.kind}:${m.id}`);
    try {
      await crmRpc('record_person_match_decisions', { p_subject_kind: 'prospect', p_subject_id: lead.id, p_decisions: [{ kind: m.kind, id: m.id, decision }] });
      await refresh();
      toast.success('Réponse enregistrée');
    } catch (err) { toast.error(PEOPLE_MESSAGES[err?.hint] || 'Enregistrement impossible. Réessayez.'); }
    finally { setBusy(''); }
  }
  async function startMerge(m) {
    setBusy(`${m.kind}:${m.id}`);
    try {
      const other = await crmRpc('crm_get_workspace_detail', { p_lead: m.id });
      setMerge({ source: { id: other.id, name: `${other.learner_name || m.name} · ${other.contact_name || ''}`, version: other.version },
        target: { id: lead.id, name: `${lead.learner_name || ''} · ${lead.contact_name || ''}`, version: lead.version } });
    } catch { toast.error('Fiche indisponible. Réessayez.'); }
    finally { setBusy(''); }
  }
  if (lead.merged_into_lead_id) return <section role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
    <p className="font-medium">Fiche fusionnée</p><p className="mt-1">Ce prospect a été fusionné dans une autre fiche : son suivi continue là-bas.</p>
    <Button variant="link" className="px-0" onClick={() => onOpenLead?.(lead.merged_into_lead_id)}>Ouvrir la fiche conservée</Button></section>;
  return <section aria-label="Fiche et famille" className="space-y-3">
    <div className="flex flex-wrap gap-2"><Button variant="outline" className="min-h-9" onClick={onEdit}>Modifier la fiche</Button><Button variant="outline" className="min-h-9" onClick={onAddChild}>Ajouter un enfant</Button></div>
    {lead.contact?.phone_needs_review && <p className="text-xs text-amber-900">Numéro à vérifier : le numéro enregistré n’est pas valide.</p>}
    {lead.siblings?.length > 0 && <div><h4 className="text-sm font-medium">Autres apprenants de ce contact</h4><ul className="mt-1 space-y-1 text-sm">{lead.siblings.map(s => <li key={s.id}><button type="button" className="min-h-9 text-left text-blue-800 underline" onClick={() => onOpenLead?.(s.id)}>{s.learner_name || 'Apprenant à préciser'}</button><span className="ml-2 text-xs text-slate-600">{STATUS[s.status] || s.status}</span></li>)}</ul></div>}
    {lead.merged_from?.length > 0 && <p className="text-xs text-slate-600">Fiche{lead.merged_from.length > 1 ? 's' : ''} fusionnée{lead.merged_from.length > 1 ? 's' : ''} ici : {lead.merged_from.map(m => m.learner_name || 'sans nom').join(', ')}. Leur historique s’affiche ci-dessous.</p>}
    {candidates.length > 0 && <div data-testid="duplicate-candidates" className="rounded-lg border border-amber-300 bg-amber-50 p-3"><h4 className="text-sm font-semibold text-amber-950">Doublon possible</h4>
      <ul className="mt-2 space-y-3">{candidates.map(m => { const key = `${m.kind}:${m.id}`; return <li key={key} className="text-sm">
        <p className="break-words font-medium">{m.name || 'Sans nom'}<span className="ml-2 text-xs font-normal text-slate-600">{MATCH_REASONS[m.reason] || ''}</span></p>
        <p className="break-words text-xs text-slate-600">{personLine(m)}</p>
        <div className="mt-1 flex flex-wrap gap-2">{m.kind === 'prospect' ? <Button size="sm" variant="ghost" className="min-h-9" onClick={() => onOpenLead?.(m.id)}>Ouvrir</Button> : <a className="inline-flex min-h-9 items-center px-3 text-sm text-blue-800 underline" href={personHref(m)}>Ouvrir</a>}
          {Object.entries(MATCH_DECISIONS).map(([value, label]) => <Button key={value} size="sm" variant="outline" className="min-h-9" disabled={!!busy} onClick={() => answer(m, value)}>{label}</Button>)}
          {canMerge && m.kind === 'prospect' && <Button size="sm" variant="outline" className="min-h-9" disabled={!!busy} onClick={() => startMerge(m)}>Fusionner</Button>}</div>
      </li>; })}</ul></div>}
    {merge && <MergeDialog kind="prospect" source={merge.source} target={merge.target} onClose={() => setMerge(null)} onMerged={id => { setMerge(null); refresh(); if (id !== lead.id) onOpenLead?.(id); }} />}
  </section>;
}
