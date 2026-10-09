'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, Ban, Clock3, RefreshCw, RotateCcw, ShieldCheck, TriangleAlert } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { crmRpc, useCrmRead, useCrmRefresh } from '@/lib/crm/queries';

const when = value => value ? new Intl.DateTimeFormat('fr-MA', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Casablanca' }).format(new Date(value)) : 'Jamais';
const input = 'mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-slate-900';
const badge = status => ({ sent: 'bg-emerald-100 text-emerald-800', blocked: 'bg-amber-100 text-amber-800', dead: 'bg-rose-100 text-rose-800', suppressed: 'bg-slate-200 text-slate-700', retry: 'bg-blue-100 text-blue-800', unknown: 'bg-violet-100 text-violet-800', sending: 'bg-cyan-100 text-cyan-800', pending: 'bg-sky-100 text-sky-800' })[status] || 'bg-slate-100 text-slate-700';
// Comma-separated entries are strings; a JSON array preserves booleans/numbers.
const typedValues = raw => {
  try {
    const values = raw.trim().startsWith('[') ? JSON.parse(raw) : raw.split(',').map(value => value.trim()).filter(Boolean);
    return Array.isArray(values) && values.length >= 1 && values.length <= 20 && values.every(value =>
      typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value) || typeof value === 'string' && value.length >= 1 && value.length <= 200) ? values : null;
  } catch { return null; }
};
const eventLabel = kind => ({ intake: 'Réception', not_qualified: 'Non qualifié', lost: 'Perdu', qualified: 'Qualifié', converted: 'Converti' })[kind] || 'Événement inconnu';

export default function LifecycleOperations() {
  const { role } = useAuth();
  const refresh = useCrmRefresh();
  const diagnostics = useCrmRead('crm_lifecycle_diagnostics', {}, role === 'director');
  const [pendingOffset, setPendingOffset] = useState(0);
  const pendingStops = useCrmRead('crm_list_pending_lifecycle_stops', { p_limit: 25, p_offset: pendingOffset }, role === 'director');
  const deliveries = useCrmRead('crm_list_external_deliveries', { p_limit: 50, p_offset: 0 }, role === 'director');
  const gate = useQuery({ queryKey: ['crm', 'lifecycle-server-gate'], queryFn: async () => {
    const response = await fetch('/api/internal/crm/lifecycle/process', { cache: 'no-store' });
    // The status lets the read retry policy tell a gateway failure from an answer.
    if (!response.ok) throw Object.assign(new Error('status_unavailable'), { status: response.status });
    return response.json();
  }, enabled: role === 'director', staleTime: 15000 });
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [recordedStop, setRecordedStop] = useState('');
  const [policy, setPolicy] = useState({ connection: '', mapping: '', noticeVersion: '', noticeDigest: '', adultKey: '', adultValues: '', sharingKey: '', sharingValues: '', sharingRefused: '', prohibitedKey: '', prohibitedValues: '', safetyReference: '', noticeKey: '', noticeValues: '', starts: '', ends: '' });
  const [stop, setStop] = useState({ scope: 'opportunity', subject: '', connection: '', reason: 'inquiry_refusal', reference: '', source: '', broadPending: false });
  const [binding, setBinding] = useState({ pending: '', contact: '', connection: '', reference: '' });
  const data = diagnostics.data || {};
  const rows = deliveries.data?.rows || [];

  const run = async (key, action) => {
    setBusy(key); setError('');
    try { await action(); await refresh(); await Promise.all([diagnostics.refetch(), deliveries.refetch(), pendingStops.refetch(), gate.refetch()]); }
    catch { setError('Action refusée par les contrôles de sécurité ou de version. Actualisez puis réessayez.'); }
    finally { setBusy(''); }
  };
  const connection = data.destinations?.find(item => item.id === policy.connection);
  const compatibleForms = (data.forms || []).filter(form => form.connection_id === policy.connection);
  const publish = () => run('publish', () => crmRpc('crm_publish_lifecycle_policy', {
    p_connection: policy.connection,
    p_connection_version: connection.version,
    p_data: {
      form_mapping_id: policy.mapping, d2_requirement: 'advisory',
      ...(policy.noticeVersion ? { notice_version: policy.noticeVersion, notice_text_digest: policy.noticeDigest } : {}),
      ...(policy.adultKey ? { adult_field_key: policy.adultKey, adult_accepted_values: typedValues(policy.adultValues) } : {}),
      ...(policy.sharingKey ? { sharing_field_key: policy.sharingKey, sharing_accepted_values: typedValues(policy.sharingValues), sharing_refused_values: typedValues(policy.sharingRefused), safety_decision_reference: policy.safetyReference } : {}),
      ...((policy.sharingKey || policy.prohibitedKey) ? { safety_decision_reference: policy.safetyReference } : {}),
      ...(policy.prohibitedKey ? { prohibited_field_key: policy.prohibitedKey, prohibited_values: typedValues(policy.prohibitedValues) } : {}),
      ...(policy.noticeKey ? { notice_field_key: policy.noticeKey, notice_accepted_values: typedValues(policy.noticeValues) } : {}),
      effective_from: new Date(policy.starts).toISOString(), effective_until: new Date(policy.ends).toISOString(),
    },
  }));

  const publishValid = connection && policy.mapping && policy.starts && policy.ends
    && (!policy.noticeVersion && !policy.noticeDigest || policy.noticeVersion && /^[a-f0-9]{64}$/.test(policy.noticeDigest))
    && (!policy.adultKey && !policy.adultValues || policy.adultKey && typedValues(policy.adultValues))
    && (!policy.sharingKey && !policy.sharingValues && !policy.sharingRefused || policy.sharingKey && typedValues(policy.sharingValues) && typedValues(policy.sharingRefused) && /^[A-Za-z0-9:_-]{8,100}$/.test(policy.safetyReference))
    && (!policy.prohibitedKey && !policy.prohibitedValues || policy.prohibitedKey && typedValues(policy.prohibitedValues) && /^[A-Za-z0-9:_-]{8,100}$/.test(policy.safetyReference))
    && (!policy.noticeKey && !policy.noticeValues || policy.noticeKey && typedValues(policy.noticeValues));
  const submitStop = () => run('stop', async () => {
    const id = await crmRpc('crm_stop_lifecycle_sharing', {
      p_request: crypto.randomUUID(), p_scope: stop.scope, p_subject: stop.subject, p_connection: stop.connection || null,
      p_pending_contact_review: stop.scope === 'submission_pending' && stop.broadPending, p_reason: stop.reason, p_source_submission: stop.source || null, p_decision_reference: stop.reference || null,
    });
    setRecordedStop(id);
    if (stop.scope === 'submission_pending' && stop.broadPending) setBinding({ pending: id, contact: '', connection: '', reference: '' });
  });
  const bindPending = () => run('bind', () => crmRpc('crm_bind_pending_lifecycle_stop', { p_request: crypto.randomUUID(), p_pending_stop: binding.pending, p_contact: binding.contact, p_connection: binding.connection || null, p_decision_reference: binding.reference }));
  if (role !== 'director') return null;

  return <div className="mx-auto max-w-[1500px] space-y-6 p-4 md:p-6" data-testid="lifecycle-operations">
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
      <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Direction · Intégrations</p><h1 className="mt-1 text-2xl font-semibold text-slate-950">Retour de cycle Meta</h1><p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">Supervision des faits Réception, Non qualifié, Perdu, Qualifié et Converti. Meta ne modifie jamais le statut CRM, l’inscription ou la finance.</p></div>
      <Button variant="outline" onClick={() => Promise.all([diagnostics.refetch(), deliveries.refetch(), pendingStops.refetch(), gate.refetch()])}><RefreshCw className="mr-2 h-4 w-4" />Actualiser</Button>
    </header>

    {error && <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}
    {(diagnostics.isError || deliveries.isError || pendingStops.isError || gate.isError) && <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">Diagnostics indisponibles. Aucun envoi n’est déclenché depuis cette page.</p>}

    <section className="grid gap-3 md:grid-cols-3">
      <div className="rounded-lg border border-slate-200 bg-white p-4"><ShieldCheck className="h-5 w-5 text-slate-700" /><p className="mt-3 text-xs uppercase tracking-wider text-slate-500">Contrat fournisseur</p><p className="mt-1 text-lg font-semibold">{data.provider_contract_ready ? 'Vérifié' : 'Non vérifié'}</p><p className="mt-2 text-xs leading-5 text-slate-500">Aucun mode live ne peut être configuré sans contrat officiel enregistré.</p></div>
      <div className="rounded-lg border border-slate-200 bg-white p-4"><Activity className="h-5 w-5 text-slate-700" /><p className="mt-3 text-xs uppercase tracking-wider text-slate-500">Coupe-circuit serveur</p><p className="mt-1 text-lg font-semibold">{gate.data?.live_server_gate ? 'Ouvert' : 'Fermé'}</p><p className="mt-2 text-xs leading-5 text-slate-500">Ce signal serveur ne révèle aucune variable au navigateur.</p></div>
      <div className="rounded-lg border border-slate-200 bg-white p-4"><Clock3 className="h-5 w-5 text-slate-700" /><p className="mt-3 text-xs uppercase tracking-wider text-slate-500">Dernier passage sûr</p><p className="mt-1 text-lg font-semibold">{when(data.scheduler?.last_success_at)}</p><p className="mt-2 text-xs leading-5 text-slate-500">Un passage réussi n’implique pas une acceptation externe.</p></div>
    </section>

    {(!data.provider_contract_ready || !gate.data?.live_server_gate) && <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="font-semibold">Activation bloquée comme prévu</p><p className="mt-1 leading-6">Contrat Meta officiel, droits de destination et approbations H3/H4 restent requis. La preuve D2 est recommandée pour les futures politiques ; les obligations de confidentialité et les refus restent applicables.</p></div></div>}

    <section className="rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-5 py-4"><h2 className="font-semibold text-slate-950">Destinations</h2><p className="mt-1 text-xs text-slate-500">La direction peut couper une destination. Une nouvelle activation reste une opération de release prospective.</p></div>
      <div className="divide-y divide-slate-100">{(data.destinations || []).map(item => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"><div><p className="font-medium text-slate-900">{item.label}</p><p className="mt-1 text-xs text-slate-500">Mode {item.configured_mode || 'non configuré'} · Contrat {item.contract_key || 'absent'} · Début {when(item.activation_started_at)}</p></div><Button size="sm" variant="outline" disabled={!item.enabled || busy === item.id} onClick={() => run(item.id, () => crmRpc('crm_disable_lifecycle', { p_connection: item.id, p_version: item.version }))}><Ban className="mr-2 h-4 w-4" />Désactiver</Button></div>)}{!data.destinations?.length && <p className="p-5 text-sm text-slate-500">Aucune destination Meta configurée.</p>}</div>
    </section>

    <section className="rounded-lg border border-slate-200 bg-slate-50 p-5" data-testid="lifecycle-policy">
      <div className="mb-4"><h2 className="font-semibold text-slate-950">Publier une politique prospective · preuve D2 conseillée</h2><p className="mt-1 text-xs leading-5 text-slate-500">Les groupes de preuve et la notice D2 sont optionnels. Les valeurs configurées doivent correspondre exactement au formulaire. Saisissez des chaînes séparées par des virgules ou un tableau JSON pour conserver les booléens et nombres. Un choix de partage exige aussi les valeurs de refus et une référence de décision vérifiée. Ces champs ne constituent pas une autorisation légale.</p></div>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs font-medium text-slate-600">Destination<select className={input} value={policy.connection} onChange={e => setPolicy({ ...policy, connection: e.target.value, mapping: '' })}><option value="">Choisir</option>{(data.destinations || []).map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label className="text-xs font-medium text-slate-600">Formulaire<select className={input} value={policy.mapping} onChange={e => setPolicy({ ...policy, mapping: e.target.value })}><option value="">Choisir</option>{compatibleForms.map(form => <option key={form.id} value={form.id}>{form.form_name || form.form_key} · v{form.version}</option>)}</select></label>
        {[['noticeVersion','Version de notice'],['noticeDigest','Digest SHA-256 de la notice'],['adultKey','Clé déclaration adulte'],['adultValues','Valeurs adultes acceptées'],['sharingKey','Clé partage Meta'],['sharingValues','Valeurs partage acceptées'],['sharingRefused','Valeurs de refus du partage'],['prohibitedKey','Clé de restriction vérifiée'],['prohibitedValues','Valeurs de restriction vérifiées'],['safetyReference','Référence décision de confidentialité'],['noticeKey','Clé version notice (optionnelle)'],['noticeValues','Valeurs version notice']].map(([key,label]) => <label key={key} className="text-xs font-medium text-slate-600">{label}<input className={input} value={policy[key]} onChange={e => setPolicy({ ...policy, [key]: e.target.value })} /></label>)}
        <label className="text-xs font-medium text-slate-600">Prend effet<input type="datetime-local" className={input} value={policy.starts} onChange={e => setPolicy({ ...policy, starts: e.target.value })} /></label>
        <label className="text-xs font-medium text-slate-600">Expire<input type="datetime-local" className={input} value={policy.ends} onChange={e => setPolicy({ ...policy, ends: e.target.value })} /></label>
      </div>
      <Button className="mt-4" disabled={!publishValid || busy === 'publish'} onClick={publish}>Publier prospectivement</Button>
      <div className="mt-5 divide-y divide-slate-200 border-t border-slate-200">
        {(data.policies || []).map(item => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="text-sm font-medium text-slate-900">Notice {item.notice_version || 'D2 non renseignée'} · politique v{item.version}</p><p className="mt-1 text-xs text-slate-500">{when(item.effective_from)} → {when(item.effective_until)} · D2 {item.d2_requirement === 'advisory' ? 'conseillée' : 'requise'} · {item.grants} preuve(s), {item.revocations} révocation(s)</p></div><Button size="sm" variant="outline" disabled={Boolean(item.retired_at) || busy === `retire-${item.id}`} onClick={() => run(`retire-${item.id}`, () => crmRpc('crm_retire_lifecycle_policy', { p_policy: item.id, p_version: item.version }))}>{item.retired_at ? 'Retirée' : 'Retirer'}</Button></div>)}
        {!data.policies?.length && <p className="py-3 text-xs text-slate-500">Aucune politique publiée.</p>}
      </div>
    </section>

    <section className="rounded-lg border border-slate-200 bg-white p-5" data-testid="sharing-stop">
      <h2 className="font-semibold text-slate-950">Arrêter le partage Meta</h2>
      <p className="mt-1 text-xs leading-5 text-slate-500">Disponible même sans preuve D2. L’arrêt est permanent pour le périmètre choisi. Une demande générale nécessite une identité et une portée vérifiées ; une soumission non résolue bloque son admission jusqu’à la revue.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <label className="text-xs font-medium text-slate-600">Portée de l’arrêt<select className={input} value={stop.scope} onChange={e => setStop({ ...stop, scope: e.target.value, subject: '' })}><option value="opportunity">Cette opportunité</option><option value="contact">Contact vérifié</option><option value="submission_pending">Soumission non résolue</option></select></label>
        <label className="text-xs font-medium text-slate-600">Identifiant CRM vérifié<input className={input} value={stop.subject} onChange={e => setStop({ ...stop, subject: e.target.value })} /></label>
        <label className="text-xs font-medium text-slate-600">Destination de l’arrêt<select className={input} value={stop.connection} onChange={e => setStop({ ...stop, connection: e.target.value })}><option value="">{stop.scope === 'contact' ? 'Toutes les destinations Meta' : 'Choisir'}</option>{(data.destinations || []).map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label className="text-xs font-medium text-slate-600">Motif de l’arrêt<select className={input} value={stop.reason} onChange={e => setStop({ ...stop, reason: e.target.value })}><option value="inquiry_refusal">Refus pour cette demande</option><option value="privacy_request">Demande de confidentialité</option><option value="source_restriction">Restriction de sécurité</option></select></label>
        <label className="text-xs font-medium text-slate-600">Référence de vérification de portée<input className={input} value={stop.reference} onChange={e => setStop({ ...stop, reference: e.target.value })} /></label>
        <label className="text-xs font-medium text-slate-600">Soumission liée (optionnelle)<input className={input} value={stop.source} onChange={e => setStop({ ...stop, source: e.target.value })} /></label>
      </div>
      {stop.scope === 'submission_pending' && <label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={stop.broadPending} onChange={e => setStop({ ...stop, broadPending: e.target.checked })} />Demande générale : revue du contact avant résolution</label>}
      <Button className="mt-4" variant="outline" disabled={!stop.subject || (stop.scope !== 'contact' && !stop.connection) || (stop.scope === 'contact' && !/^[A-Za-z0-9:_-]{8,100}$/.test(stop.reference)) || busy === 'stop'} onClick={submitStop}><Ban className="mr-2 h-4 w-4" />Enregistrer l’arrêt permanent</Button>
      {recordedStop && <p role="status" className="mt-3 text-sm text-slate-700">Arrêt enregistré : <code data-testid="sharing-stop-id">{recordedStop}</code>. Conservez cet identifiant pour la revue.</p>}
      <div className="mt-6 border-t border-slate-200 pt-4" data-testid="pending-stop-list">
        <h3 className="text-sm font-semibold">Arrêts en attente de rattachement</h3>
        <p className="mt-1 text-xs text-slate-500">Retrouvez une demande différée à partir de son identifiant CRM et de sa soumission. Vérifiez le contact et la portée avant de la rattacher.</p>
        <div className="mt-3 space-y-3">{(pendingStops.data?.rows || []).map(item => <div key={item.id} data-testid="pending-stop-row" className="rounded-md border border-slate-200 p-3 text-xs text-slate-700">
          <p>Arrêt : <code data-testid="pending-stop-id">{item.id}</code></p>
          <p className="mt-1">Soumission : <code>{item.pending_submission_id}</code></p>
          <p className="mt-1">Destination : {data.destinations?.find(destination => destination.id === item.connection_id)?.label || item.connection_id} · {when(item.effective_at)}</p>
          <p className="mt-1">{item.scope_intent === 'contact_review' ? 'Revue du contact requise' : 'Résolution de la soumission attendue'}</p>
          {item.scope_intent === 'contact_review' && <Button className="mt-2" size="sm" variant="outline" onClick={() => setBinding({ pending: item.id, contact: '', connection: '', reference: '' })}>Reprendre la revue</Button>}
        </div>)}</div>
        {!pendingStops.isLoading && !pendingStops.isError && !pendingStops.data?.rows?.length && <p className="mt-3 text-xs text-slate-500">Aucun arrêt en attente sur cette page.</p>}
        <div className="mt-3 flex items-center gap-3">
          <Button size="sm" variant="outline" disabled={pendingOffset === 0 || pendingStops.isFetching} onClick={() => setPendingOffset(Math.max(0, pendingOffset - 25))}>Arrêts précédents</Button>
          <span className="text-xs text-slate-500">{pendingStops.data?.total || 0} arrêt(s) en attente</span>
          <Button size="sm" variant="outline" disabled={pendingStops.isFetching || pendingOffset + 25 >= (pendingStops.data?.total || 0)} onClick={() => setPendingOffset(pendingOffset + 25)}>Arrêts suivants</Button>
        </div>
      </div>
      <div className="mt-6 border-t border-slate-200 pt-4">
        <h3 className="text-sm font-semibold">Rattacher une demande générale après vérification</h3>
        <p className="mt-1 text-xs text-slate-500">Vérifiez l’autorité du demandeur, le contact CRM et la portée. La résolution doit ensuite confirmer ce même contact ; aucun rapprochement approximatif n’est effectué ici.</p>
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          {[['pending','Identifiant de l’arrêt en attente'],['contact','Identifiant du contact vérifié'],['reference','Référence de la revue']].map(([key,label]) => <label key={key} className="text-xs font-medium text-slate-600">{label}<input className={input} value={binding[key]} onChange={e => setBinding({ ...binding, [key]: e.target.value })} /></label>)}
          <label className="text-xs font-medium text-slate-600">Portée de la demande vérifiée<select className={input} value={binding.connection} onChange={e => setBinding({ ...binding, connection: e.target.value })}><option value="">Toutes les destinations Meta</option>{(data.destinations || []).map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        </div>
        <Button className="mt-3" variant="outline" disabled={!binding.pending || !binding.contact || !/^[A-Za-z0-9:_-]{8,100}$/.test(binding.reference) || busy === 'bind'} onClick={bindPending}>Confirmer le contact et la portée</Button>
      </div>
    </section>

    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><h2 className="font-semibold text-slate-950">Livraisons récentes</h2><p className="mt-1 text-xs text-slate-500">{deliveries.data?.total || 0} intention(s) · plus ancienne attente {when(deliveries.data?.oldest_pending_at)}</p></div></div>
      <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr>{['Fait','Modèle','Preuve D2','État','Événement','Essais','Propriétaire','Blocage sûr','Actions'].map(label => <th key={label} className="whitespace-nowrap px-4 py-3 font-medium">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{rows.map(row => <tr key={row.id}><td className="px-4 py-3 font-medium text-slate-900">{eventLabel(row.event_kind)}</td><td className="px-4 py-3">{row.lifecycle_model || row.delivery_mode}</td><td className="px-4 py-3">{row.d2_requirement === 'advisory' ? 'Conseillée' : 'Requise'} · {({ available: 'disponible', missing: 'absente', ambiguous: 'ambiguë' })[row.d2_evidence_state] || '—'}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 font-medium ${badge(row.status)}`}>{row.status}</span></td><td className="whitespace-nowrap px-4 py-3">{when(row.event_time)}</td><td className="px-4 py-3 tabular-nums">{row.attempt_count}/{row.max_attempts}</td><td className="px-4 py-3">{row.producer_owner || '—'}</td><td className="px-4 py-3">{row.privacy_hold || row.retry_hold || row.ordering_hold || row.last_error_code || (row.attempt_boundary_state === 'unknown' ? 'réception incertaine — non rejouable' : '—')}</td><td className="px-4 py-3"><div className="flex gap-2"><Button size="sm" variant="outline" disabled={!row.retry_eligible || busy === row.id} onClick={() => run(row.id, () => crmRpc('crm_retry_external_delivery', { p_delivery: row.id }))}><RotateCcw className="h-3.5 w-3.5" /><span className="sr-only">Réessayer</span></Button>{row.connection_id && <Button size="sm" variant="outline" disabled={busy === `stop-${row.id}` || Boolean(row.privacy_hold)} onClick={() => run(`stop-${row.id}`, () => crmRpc('crm_stop_lifecycle_sharing', { p_request: crypto.randomUUID(), p_scope: 'opportunity', p_subject: row.lead_id, p_connection: row.connection_id, p_reason: 'inquiry_refusal' }))}><Ban className="h-3.5 w-3.5" /><span className="sr-only">Arrêter cette opportunité</span></Button>}</div></td></tr>)}</tbody></table></div>
      {!rows.length && <p className="p-8 text-center text-sm text-slate-500">Aucune intention enregistrée.</p>}
    </section>
  </div>;
}
