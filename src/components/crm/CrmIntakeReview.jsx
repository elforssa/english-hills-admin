'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useCrmRead, useCrmRefresh, crmRpc } from '@/lib/crm/queries';
import { Pager } from './CrmShared';

function ReviewItem({ item, onDone }) {
  const [action, setAction] = useState('new');
  const [name, setName] = useState(item.contact_name || '');
  const [learner, setLearner] = useState(item.learner_name || '');
  const [program, setProgram] = useState(item.program_interest_text || '');
  const [busy, setBusy] = useState(false);
  async function resolve() {
    setBusy(true);
    try {
      const candidate = item.candidates.find(c => c.id === action);
      const contact = item.contact_candidates?.find(c => `contact:${c.id}` === action);
      await crmRpc('crm_resolve_external_intake', { p_request: crypto.randomUUID(), p_submission: item.id,
        p_action: candidate ? 'attach' : contact ? 'new' : action,
        p_data: candidate ? { lead_id: candidate.id, expected_version: candidate.version } : action === 'new' || contact
          ? { contact_name: name.trim(), learner_name: learner.trim(), program_interest_text: program.trim(), ...(contact ? { contact_id: contact.id, contact_version: contact.version } : {}) } : {} });
      toast.success('Demande traitée'); onDone();
    } catch { toast.error('Impossible de traiter cette demande. Actualisez et vérifiez les informations.'); }
    finally { setBusy(false); }
  }
  return <details className="border-t border-slate-100 px-4 py-3" data-testid="intake-review-item">
    <summary className="cursor-pointer text-sm font-medium text-slate-800">{item.contact_name || 'Contact à préciser'} · {item.learner_name || 'Apprenant à préciser'}</summary>
    <div className="mt-3 space-y-3 text-sm">
      <p className="text-slate-600">{[item.phone, item.email, item.program_interest_text].filter(Boolean).join(' · ')}</p>
      <dl className="grid gap-1">{item.answers.map(a => <div key={a.key}><dt className="inline text-slate-500">{a.label} : </dt><dd className="inline">{Array.isArray(a.value) ? a.value.join(', ') : typeof a.value === 'boolean' ? a.value ? 'Oui' : 'Non' : String(a.value ?? '')}</dd></div>)}</dl>
      <label className="block">Après vérification avec le contact<select aria-label="Décision pour la demande" className="mt-1 block h-11 w-full rounded-md border bg-white px-3" value={action} onChange={e => setAction(e.target.value)}>
        <option value="new">Créer un nouveau contact et prospect</option>
        {item.candidates.map(c => <option key={c.id} value={c.id}>Rattacher à {c.learner_name} · {c.program || 'Programme à préciser'} · {c.contact_name}</option>)}
        {item.contact_candidates?.map(c => <option key={c.id} value={`contact:${c.id}`}>Nouveau prospect pour {c.name}</option>)}
        <option value="reject">Écarter cette demande invalide</option>
      </select></label>
      {(action === 'new' || action.startsWith('contact:')) && <div className="grid gap-3 sm:grid-cols-3">{[['Contact', name, setName], ['Apprenant', learner, setLearner], ['Programme', program, setProgram]].map(([label, value, setter]) => <label key={label}>{label}<input aria-label={`${label} de la demande`} maxLength={200} className="mt-1 h-11 w-full rounded-md border px-3" value={value} onChange={e => setter(e.target.value)} /></label>)}</div>}
      <Button size="sm" disabled={busy || (action === 'new' || action.startsWith('contact:')) && (!name.trim() || !learner.trim() || !program.trim())} onClick={resolve}>{busy ? 'Traitement…' : 'Confirmer la décision'}</Button>
    </div>
  </details>;
}
export default function CrmIntakeReview() {
  const [offset, setOffset] = useState(0);
  const review = useCrmRead('crm_list_intake_review', { p_limit: 10, p_offset: offset });
  const refresh = useCrmRefresh();
  if (review.isError) return <p className="mb-5 text-sm text-slate-600">Les demandes à vérifier sont indisponibles. <button className="underline" onClick={() => review.refetch()}>Réessayer</button></p>;
  if (!review.data?.total) return null;
  return <section className="mb-6 overflow-hidden rounded-xl border bg-white" aria-label="Demandes à vérifier">
    <div className="px-4 py-3"><h2 className="font-semibold text-slate-900">À vérifier <span className="ml-2 text-sm font-normal text-slate-500">{review.data.total}</span></h2><p className="mt-1 text-xs text-slate-500">Précisez l’apprenant et le programme avant de commencer le suivi.</p></div>
    {review.data.rows.map(item => <ReviewItem key={item.id} item={item} onDone={() => { setOffset(0); refresh(); }} />)}
    <Pager offset={offset} total={review.data.total} size={10} onChange={setOffset} />
  </section>;
}
