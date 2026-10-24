'use client';
import { useMemo, useState } from 'react';
import { RotateCcw, Upload, Ban } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Collapsible } from '@/components/crm/MarketingInsightsPanels';
import { crmRpc } from '@/lib/crm/queries';
import {
  CANONICAL_KEYS, SESSION_TYPES, JOB_STATUS_LABELS, buildPublishPayload, canRetry, copyFromMapping, defaultEffectiveFrom,
  formStatusLabel, groupMetaForms, jobChannel, jobErrorLabel, jobHint, jobsToHandle, metaConnection, pollingStatus,
  retirePlan, rpcErrorMessage, spendFreshness, websiteForms,
} from '@/lib/crm/intakeAdmin.mjs';

// LIR-r1 P1-B. Director-only (the page and every RPC check the role). It renders form
// keys, versions and job states only: never a token, secret reference, page/account ID
// or lead field, although crm_get_meta_diagnostics returns full connection rows.
const RUNBOOK = 'https://github.com/elforssa/english-hills-admin/blob/main/docs/crm-operations-runbook.md#campaign-launch-checklist';
const input = 'mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm disabled:bg-slate-50';
const when = v => v ? new Intl.DateTimeFormat('fr-MA', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Casablanca' }).format(new Date(v)) : '—';
const hours = n => new Intl.NumberFormat('fr-MA', { maximumFractionDigits: 1 }).format(n);
// <input type="datetime-local"> works in the browser's local time.
const toLocalInput = iso => { const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const fromLocalInput = value => (Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : '');
// The browser's zone, named beside the date input; the summary shows Casablanca time.
const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'navigateur';
const json = value => JSON.stringify(value ?? {}, null, 1);
const statusTone = { active: 'bg-emerald-50 text-emerald-800', scheduled: 'bg-sky-50 text-sky-800', stopped: 'bg-slate-100 text-slate-600', partial: 'bg-amber-50 text-amber-800' };

// Always visible above the panels.
export function LeadIntakeStatus({ meta, insightsConnection }) {
  if (meta.isLoading) return null;
  if (meta.isError) return <p role="alert" className="rounded-lg border p-3 text-sm text-red-700">État de la réception des leads indisponible.</p>;
  const connection = metaConnection(meta.data?.connections);
  const polling = pollingStatus(connection);
  const pending = jobsToHandle(meta.data?.jobs).length;
  const spend = spendFreshness(insightsConnection);
  return <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs leading-5 text-slate-600" data-testid="lead-intake-status">
    <p>Import des leads Meta : <strong>{polling.enabled ? `activé · fenêtre ${hours(polling.lookbackHours)} h` : 'désactivé'}</strong>
      {' · '}<span data-testid="lead-intake-pending" className={pending ? 'font-semibold text-red-700' : ''}>Leads à traiter : {pending}</span> (parmi les 100 derniers)</p>
    {spend && <p data-testid="lead-intake-spend" className={spend.stale ? 'font-semibold text-red-700' : ''}>Dépenses Meta : {spend.hoursAgo == null ? 'aucune synchronisation complète' : `dernière synchronisation complète il y a ${spend.hoursAgo} h`}</p>}
    <p>Un échec de consultation de Meta n’apparaît pas ici : l’e-mail d’échec GitHub le signale.</p>
  </div>;
}

export default function LeadIntakePanel({ meta }) {
  return <Collapsible title="Réception des leads" testId="lead-intake-panel"><IntakeTools meta={meta} /></Collapsible>;
}

function IntakeTools({ meta }) {
  const [busy, setBusy] = useState(''), [publishing, setPublishing] = useState(null), [retiring, setRetiring] = useState(null);
  const connections = meta.data?.connections || [];
  const connection = metaConnection(connections);
  const mappings = meta.data?.mappings || [];
  const forms = groupMetaForms(mappings, connection?.id);
  const website = websiteForms(mappings);
  const jobs = jobsToHandle(meta.data?.jobs);
  if (meta.isLoading) return <p className="text-sm text-slate-500">Chargement…</p>;
  if (meta.isError) return <p role="alert" className="text-sm text-red-700">Réception des leads indisponible.</p>;
  // One request at a time; every action refetches, whatever its outcome.
  const act = async (key, work) => {
    setBusy(key);
    try { return await work(); }
    finally { setBusy(''); await meta.refetch(); }
  };
  const retire = form => act(`retire:${form.form_key}`, async () => {
    // The plan comes from fresh diagnostics, never from the list on screen.
    const fresh = await meta.refetch();
    if (fresh.isError) { toast.error('Arrêt non effectué : réception des leads indisponible.'); return; }
    const current = groupMetaForms(fresh.data?.mappings, metaConnection(fresh.data?.connections)?.id).find(f => f.form_key === form.form_key);
    let done = 0;
    for (const id of current ? retirePlan(current) : []) {
      try { await crmRpc('crm_retire_meta_form_mapping', { p_mapping: id }); done += 1; }
      catch (error) { toast.error(`Arrêt incomplet. ${rpcErrorMessage(error, 'retire')}`); return; }
    }
    if (!done) { toast.info('Aucune version à arrêter : la liste est actualisée.'); return; }
    toast.success(done > 1 ? `Import arrêté (${done} versions retirées)` : 'Import arrêté');
  });
  const retry = job => act(`retry:${job.id}`, async () => {
    try { await crmRpc('crm_retry_meta_job', { p_job: job.id }); toast.success('Nouvelle tentative demandée'); }
    catch (error) { toast.error(`Nouvelle tentative refusée. ${rpcErrorMessage(error, 'retry')}`); }
  });
  return <div className="space-y-5 text-sm">
    <section>
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-slate-900">Formulaires importés</h3>
        <Button size="sm" disabled={!!busy || !connection} onClick={() => setPublishing({ form_key: '' })}><Upload className="mr-2 h-4 w-4" />Publier un formulaire Meta</Button></div>
      {!connection && <p className="mt-2 text-xs text-slate-500">Aucune connexion Meta n’est configurée.</p>}
      <div className="mt-2 overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr>{['Formulaire Meta', 'Nom', 'Version', 'Effet', 'Type de session', 'Apprenant', 'État', ''].map(c => <th key={c} className="whitespace-nowrap px-3 py-2 font-medium">{c}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-100">{forms.map(form => <tr key={form.form_key} data-testid={`intake-form-${form.form_key}`}>
          <td className="px-3 py-2 font-mono">{form.form_key}</td>
          <td className="px-3 py-2">{form.latest.form_name || '—'}</td>
          <td className="px-3 py-2 tabular-nums">v{form.latest.version}</td>
          <td className="whitespace-nowrap px-3 py-2">{when(form.latest.effective_from)}</td>
          <td className="px-3 py-2">{form.latest.default_session_type || '—'}</td>
          <td className="px-3 py-2">{form.latest.learner_policy === 'optional' ? 'Facultatif' : 'Obligatoire'}</td>
          <td className="px-3 py-2"><span data-testid="intake-form-status" className={`rounded px-2 py-0.5 font-medium ${statusTone[form.partial ? 'partial' : form.status]}`}>{formStatusLabel(form)}</span>{form.partial && form.status === 'active' && <span className="block text-[10px] text-slate-500">encore importé</span>}</td>
          <td className="whitespace-nowrap px-3 py-2 text-right">
            <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => setPublishing({ form_key: form.form_key, copy: form.latest.id })}>Nouvelle version</Button>
            {form.unretired.length > 0 && <Button size="sm" variant="outline" disabled={!!busy} onClick={() => setRetiring(form)}><Ban className="mr-1 h-3.5 w-3.5" />{form.partial ? 'Terminer l’arrêt' : 'Arrêter l’import'}</Button>}
          </td>
        </tr>)}</tbody></table></div>
      {!forms.length && connection && <p className="mt-2 text-xs text-slate-500">Aucun formulaire Meta publié : aucun lead Meta n’est importé.</p>}
      {website.length > 0 && <div className="mt-3"><p className="text-xs font-semibold text-slate-700">Formulaires du site web (lecture seule)</p>
        <ul className="mt-1 space-y-0.5 text-xs text-slate-600">{website.map(m => <li key={m.id}><span className="font-mono">{m.form_key}</span> · v{m.version} · {m.form_name || '—'}{m.retired_at ? ' · arrêté' : ''}</li>)}</ul></div>}
    </section>
    <section>
      <h3 className="font-semibold text-slate-900">Leads à traiter <span className="font-normal text-slate-500">(parmi les 100 derniers)</span></h3>
      <div className="mt-2 overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr>{['Canal', 'Reçu', 'Statut', 'Tentatives', 'Motif', ''].map(c => <th key={c} className="whitespace-nowrap px-3 py-2 font-medium">{c}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-100">{jobs.map(job => <tr key={job.id} data-testid="intake-job">
          <td className="px-3 py-2">{jobChannel(job, connections)}</td>
          <td className="whitespace-nowrap px-3 py-2">{when(job.received_at)}</td>
          <td className="px-3 py-2">{JOB_STATUS_LABELS[job.status] || job.status}</td>
          <td className="px-3 py-2 tabular-nums">{job.attempt_count}/8</td>
          <td className="px-3 py-2">{jobErrorLabel(job.last_error_code)}{jobHint(job) && <span className="block text-slate-500">{jobHint(job)}</span>}</td>
          <td className="px-3 py-2">{canRetry(job) && <Button size="sm" variant="outline" disabled={!!busy} onClick={() => retry(job)}><RotateCcw className="mr-1 h-3.5 w-3.5" />Réessayer</Button>}</td>
        </tr>)}</tbody></table></div>
      {!jobs.length && <p className="mt-2 text-xs text-slate-500">Aucun lead bloqué.</p>}
    </section>
    <section className="rounded-md bg-slate-50 p-3 text-xs leading-5 text-slate-600" data-testid="intake-checklist">
      <p className="font-semibold text-slate-700">Avant chaque campagne</p>
      <ol className="mt-1 list-decimal space-y-0.5 pl-4">
        <li>Notez le formulaire instantané de chaque annonce ; publiez ici chaque formulaire qui n’est pas Actif.</li>
        <li>Vérifiez la fenêtre de 24 h et qu’aucun lead n’est à traiter.</li>
        <li>Envoyez un lead de test par nouveau formulaire : il doit apparaître en 15 minutes avec nom et téléphone.</li>
        <li>Pendant la campagne, comparez chaque jour les leads Meta d’hier avec ceux du CRM.</li>
      </ol>
      <a className="mt-1 inline-block font-medium text-slate-900 underline" href={RUNBOOK} target="_blank" rel="noreferrer">Liste complète et incidents</a>
    </section>
    {publishing && <PublishDialog connection={connection} forms={forms} initial={publishing} busy={busy}
      onClose={() => setPublishing(null)}
      onPublish={payload => act('publish', async () => {
        try { await crmRpc('crm_publish_meta_form_mapping', payload); toast.success('Formulaire publié'); setPublishing(null); }
        catch (error) { toast.error(rpcErrorMessage(error, 'publish')); }
      })} />}
    <AlertDialog open={!!retiring} onOpenChange={open => { if (!open) setRetiring(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>Arrêter l’import du formulaire {retiring?.form_key}</AlertDialogTitle>
          <AlertDialogDescription>Les nouveaux leads de ce formulaire ne seront plus importés. Action définitive : pour reprendre, publiez une nouvelle version.</AlertDialogDescription></AlertDialogHeader>
        {retiring?.unretired.length > 1 && <p className="text-xs text-slate-600">{retiring.unretired.length} versions encore actives seront retirées.</p>}
        <AlertDialogFooter><AlertDialogCancel disabled={!!busy}>Annuler</AlertDialogCancel>
          <Button variant="destructive" disabled={!!busy} onClick={async () => { const form = retiring; setRetiring(null); await retire(form); }}>Arrêter l’import</Button></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}

function PublishDialog({ connection, forms, initial, busy, onClose, onPublish }) {
  const sources = forms.map(f => f.latest);
  const start = copyFromMapping(sources.find(m => m.id === initial.copy));
  const [draft, setDraft] = useState({ form_key: initial.form_key, form_name: initial.copy ? sources.find(m => m.id === initial.copy)?.form_name || '' : '',
    default_session_type: '', default_program_interest_text: '', learner_policy: 'required', field_map: {}, ...start });
  const [labels, setLabels] = useState({ question_labels: json(start.question_labels), option_labels: json(start.option_labels) });
  const [effective, setEffective] = useState(null), [confirming, setConfirming] = useState(false);
  const versions = useMemo(() => forms.find(f => f.form_key === draft.form_key.trim())?.versions || [], [forms, draft.form_key]);
  // Until edited, the date follows D4 for the form key typed so far.
  const effectiveFrom = effective ?? defaultEffectiveFrom(versions);
  const set = key => e => setDraft({ ...draft, [key]: e.target.value });
  const copy = id => {
    const fields = copyFromMapping(sources.find(m => m.id === id));
    setDraft({ ...draft, default_session_type: '', default_program_interest_text: '', field_map: {}, ...fields });
    setLabels({ question_labels: json(fields.question_labels), option_labels: json(fields.option_labels) });
  };
  const parse = text => { try { return JSON.parse(text || '{}'); } catch { return null; } };
  const result = buildPublishPayload(connection, { ...draft, question_labels: parse(labels.question_labels), option_labels: parse(labels.option_labels), effective_from: effectiveFrom }, versions);
  const data = result.p_data;
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto" data-testid="intake-publish-dialog">
      <DialogHeader><DialogTitle>Publier un formulaire Meta</DialogTitle>
        <DialogDescription>{versions.length ? `Nouvelle version (v${versions.at(-1).version + 1}) d’un formulaire existant.` : 'Premier import de ce formulaire : la date d’effet est fixée 30 jours avant aujourd’hui pour importer les leads déjà reçus.'}</DialogDescription></DialogHeader>
      {!confirming ? <div className="space-y-3 text-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-medium text-slate-600">Identifiant du formulaire Meta<input aria-label="Identifiant du formulaire Meta" className={input} inputMode="numeric" maxLength={32} value={draft.form_key} disabled={!!initial.form_key} onChange={set('form_key')} /></label>
          <label className="text-xs font-medium text-slate-600">Nom<input aria-label="Nom du formulaire" className={input} maxLength={200} value={draft.form_name} onChange={set('form_name')} /></label>
          <label className="text-xs font-medium text-slate-600">Copier les réponses depuis<select aria-label="Copier les réponses depuis" className={input} defaultValue={initial.copy || ''} onChange={e => copy(e.target.value)}><option value="">—</option>{sources.map(m => <option key={m.id} value={m.id}>{m.form_name || m.form_key} · v{m.version}</option>)}</select></label>
          <label className="text-xs font-medium text-slate-600">Type de session<select aria-label="Type de session" className={input} value={draft.default_session_type || ''} onChange={set('default_session_type')}><option value="">—</option>{SESSION_TYPES.map(s => <option key={s} value={s}>{s}</option>)}</select></label>
          <label className="text-xs font-medium text-slate-600">Programme (texte)<input aria-label="Programme" className={input} maxLength={200} value={draft.default_program_interest_text || ''} onChange={set('default_program_interest_text')} /></label>
          <label className="text-xs font-medium text-slate-600">Apprenant<select aria-label="Apprenant" className={input} value={draft.learner_policy} onChange={set('learner_policy')}><option value="required">Obligatoire</option><option value="optional">Facultatif</option></select></label>
          <label className="text-xs font-medium text-slate-600">Date d’effet <span className="font-normal text-slate-500" data-testid="intake-effective-zone">(heure de ce navigateur : {browserZone()})</span><input aria-label="Date d’effet" type="datetime-local" className={input} value={toLocalInput(effectiveFrom)} onChange={e => setEffective(fromLocalInput(e.target.value))} /></label>
        </div>
        <details className="rounded-md border border-slate-200 p-3"><summary className="cursor-pointer text-xs font-semibold text-slate-700">Correspondance des champs (avancé)</summary>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">{CANONICAL_KEYS.map(key => <label key={key} className="text-xs font-medium text-slate-600">{key}<input aria-label={`Champ ${key}`} className={input} maxLength={100} value={draft.field_map?.[key] || ''} onChange={e => setDraft({ ...draft, field_map: { ...draft.field_map, [key]: e.target.value } })} /></label>)}</div>
          {['question_labels', 'option_labels'].map(key => <label key={key} className="mt-2 block text-xs font-medium text-slate-600">{key === 'question_labels' ? 'Libellés des questions (JSON)' : 'Libellés des options (JSON)'}<textarea aria-label={key} className="mt-1 h-24 w-full rounded-md border border-slate-200 p-2 font-mono text-xs" value={labels[key]} onChange={e => setLabels({ ...labels, [key]: e.target.value })} /></label>)}
        </details>
        {result.errors && <ul role="alert" className="list-disc pl-4 text-xs text-red-700">{result.errors.map(e => <li key={e}>{e}</li>)}</ul>}
        <DialogFooter><Button variant="outline" disabled={!!busy} onClick={onClose}>Annuler</Button><Button disabled={!data || !!busy} onClick={() => setConfirming(true)}>Vérifier</Button></DialogFooter>
      </div> : <div className="space-y-3 text-sm" data-testid="intake-publish-summary">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
          <dt className="text-slate-500">Formulaire</dt><dd className="font-mono">{data.form_key} · v{(versions.at(-1)?.version || 0) + 1}</dd>
          <dt className="text-slate-500">Nom</dt><dd>{data.form_name || '—'}</dd>
          <dt className="text-slate-500">Date d’effet (heure de Casablanca)</dt><dd>{when(data.effective_from)}</dd>
          <dt className="text-slate-500">Type de session</dt><dd>{data.default_session_type || '—'}</dd>
          <dt className="text-slate-500">Programme</dt><dd>{data.default_program_interest_text || '—'}</dd>
          <dt className="text-slate-500">Apprenant</dt><dd>{data.learner_policy === 'optional' ? 'Facultatif' : 'Obligatoire'}</dd>
          <dt className="text-slate-500">Champs</dt><dd>{Object.keys(data.field_map).join(', ') || 'aucun'}</dd>
        </dl>
        <p className="text-xs text-slate-600">Une version publiée ne peut plus être modifiée ; pour corriger, publiez une nouvelle version.</p>
        <DialogFooter><Button variant="outline" disabled={!!busy} onClick={() => setConfirming(false)}>Modifier</Button><Button disabled={!!busy} onClick={() => onPublish(result)}>Publier</Button></DialogFooter>
      </div>}
    </DialogContent>
  </Dialog>;
}
