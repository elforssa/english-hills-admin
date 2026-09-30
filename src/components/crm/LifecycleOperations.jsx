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
const eventLabel = kind => ({ intake: 'Réception', not_qualified: 'Non qualifié', lost: 'Perdu', qualified: 'Qualifié', converted: 'Converti' })[kind] || 'Événement inconnu';

export default function LifecycleOperations() {
  const { role } = useAuth();
  const refresh = useCrmRefresh();
  const diagnostics = useCrmRead('crm_lifecycle_diagnostics', {}, role === 'director');
  const deliveries = useCrmRead('crm_list_external_deliveries', { p_limit: 50, p_offset: 0 }, role === 'director');
  const gate = useQuery({ queryKey: ['crm', 'lifecycle-server-gate'], queryFn: async () => {
    const response = await fetch('/api/internal/crm/lifecycle/process', { cache: 'no-store' });
    if (!response.ok) throw new Error('status_unavailable');
    return response.json();
  }, enabled: role === 'director', staleTime: 15000 });
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [policy, setPolicy] = useState({ connection: '', mapping: '', noticeVersion: '', noticeDigest: '', adultKey: '', adultValues: 'yes', sharingKey: '', sharingValues: 'yes', noticeKey: '', noticeValues: '', starts: '', ends: '' });
  const data = diagnostics.data || {};
  const rows = deliveries.data?.rows || [];

  const run = async (key, action) => {
    setBusy(key); setError('');
    try { await action(); await refresh(); await Promise.all([diagnostics.refetch(), deliveries.refetch(), gate.refetch()]); }
    catch { setError('Action refusée par les contrôles de sécurité ou de version. Actualisez puis réessayez.'); }
    finally { setBusy(''); }
  };
  const connection = data.destinations?.find(item => item.id === policy.connection);
  const compatibleForms = (data.forms || []).filter(form => form.connection_id === policy.connection);
  const publish = () => run('publish', () => crmRpc('crm_publish_lifecycle_policy', {
    p_connection: policy.connection,
    p_connection_version: connection.version,
    p_data: {
      form_mapping_id: policy.mapping, notice_version: policy.noticeVersion, notice_text_digest: policy.noticeDigest,
      adult_field_key: policy.adultKey, adult_accepted_values: policy.adultValues.split(',').map(v => v.trim()).filter(Boolean),
      sharing_field_key: policy.sharingKey, sharing_accepted_values: policy.sharingValues.split(',').map(v => v.trim()).filter(Boolean),
      ...(policy.noticeKey ? { notice_field_key: policy.noticeKey, notice_accepted_values: policy.noticeValues.split(',').map(v => v.trim()).filter(Boolean) } : {}),
      effective_from: new Date(policy.starts).toISOString(), effective_until: new Date(policy.ends).toISOString(),
    },
  }));

  return <div className="mx-auto max-w-[1500px] space-y-6 p-4 md:p-6" data-testid="lifecycle-operations">
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
      <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Direction · Intégrations</p><h1 className="mt-1 text-2xl font-semibold text-slate-950">Retour de cycle Meta</h1><p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">Supervision des faits Réception, Non qualifié, Perdu, Qualifié et Converti. Meta ne modifie jamais le statut CRM, l’inscription ou la finance.</p></div>
      <Button variant="outline" onClick={() => Promise.all([diagnostics.refetch(), deliveries.refetch(), gate.refetch()])}><RefreshCw className="mr-2 h-4 w-4" />Actualiser</Button>
    </header>

    {error && <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}
    {(diagnostics.isError || deliveries.isError || gate.isError) && <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">Diagnostics indisponibles. Aucun envoi n’est déclenché depuis cette page.</p>}

    <section className="grid gap-3 md:grid-cols-3">
      <div className="rounded-lg border border-slate-200 bg-white p-4"><ShieldCheck className="h-5 w-5 text-slate-700" /><p className="mt-3 text-xs uppercase tracking-wider text-slate-500">Contrat fournisseur</p><p className="mt-1 text-lg font-semibold">{data.provider_contract_ready ? 'Vérifié' : 'Non vérifié'}</p><p className="mt-2 text-xs leading-5 text-slate-500">Aucun mode live ne peut être configuré sans contrat officiel enregistré.</p></div>
      <div className="rounded-lg border border-slate-200 bg-white p-4"><Activity className="h-5 w-5 text-slate-700" /><p className="mt-3 text-xs uppercase tracking-wider text-slate-500">Coupe-circuit serveur</p><p className="mt-1 text-lg font-semibold">{gate.data?.live_server_gate ? 'Ouvert' : 'Fermé'}</p><p className="mt-2 text-xs leading-5 text-slate-500">Ce signal serveur ne révèle aucune variable au navigateur.</p></div>
      <div className="rounded-lg border border-slate-200 bg-white p-4"><Clock3 className="h-5 w-5 text-slate-700" /><p className="mt-3 text-xs uppercase tracking-wider text-slate-500">Dernier passage sûr</p><p className="mt-1 text-lg font-semibold">{when(data.scheduler?.last_success_at)}</p><p className="mt-2 text-xs leading-5 text-slate-500">Un passage réussi n’implique pas une acceptation externe.</p></div>
    </section>

    {(!data.provider_contract_ready || !gate.data?.live_server_gate) && <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="font-semibold">Activation bloquée comme prévu</p><p className="mt-1 leading-6">Contrat Meta officiel, formulaire probant, manifeste de consentement, droits de destination et approbation de mise en production restent requis.</p></div></div>}

    <section className="rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-5 py-4"><h2 className="font-semibold text-slate-950">Destinations</h2><p className="mt-1 text-xs text-slate-500">La direction peut couper une destination. Une nouvelle activation reste une opération de release prospective.</p></div>
      <div className="divide-y divide-slate-100">{(data.destinations || []).map(item => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"><div><p className="font-medium text-slate-900">{item.label}</p><p className="mt-1 text-xs text-slate-500">Mode {item.configured_mode || 'non configuré'} · Contrat {item.contract_key || 'absent'} · Début {when(item.activation_started_at)}</p></div><Button size="sm" variant="outline" disabled={!item.enabled || busy === item.id} onClick={() => run(item.id, () => crmRpc('crm_disable_lifecycle', { p_connection: item.id, p_version: item.version }))}><Ban className="mr-2 h-4 w-4" />Désactiver</Button></div>)}{!data.destinations?.length && <p className="p-5 text-sm text-slate-500">Aucune destination Meta configurée.</p>}</div>
    </section>

    <section className="rounded-lg border border-slate-200 bg-slate-50 p-5">
      <div className="mb-4"><h2 className="font-semibold text-slate-950">Publier une politique de preuve prospective</h2><p className="mt-1 text-xs leading-5 text-slate-500">Les clés et valeurs doivent correspondre exactement au formulaire actif et à la version de notice approuvée. Aucune valeur par défaut n’est déduite.</p></div>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs font-medium text-slate-600">Destination<select className={input} value={policy.connection} onChange={e => setPolicy({ ...policy, connection: e.target.value, mapping: '' })}><option value="">Choisir</option>{(data.destinations || []).map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label className="text-xs font-medium text-slate-600">Formulaire<select className={input} value={policy.mapping} onChange={e => setPolicy({ ...policy, mapping: e.target.value })}><option value="">Choisir</option>{compatibleForms.map(form => <option key={form.id} value={form.id}>{form.form_name || form.form_key} · v{form.version}</option>)}</select></label>
        {[['noticeVersion','Version de notice'],['noticeDigest','Digest SHA-256 de la notice'],['adultKey','Clé déclaration adulte'],['adultValues','Valeurs adultes acceptées'],['sharingKey','Clé partage Meta'],['sharingValues','Valeurs partage acceptées'],['noticeKey','Clé version notice (optionnelle)'],['noticeValues','Valeurs version notice']].map(([key,label]) => <label key={key} className="text-xs font-medium text-slate-600">{label}<input className={input} value={policy[key]} onChange={e => setPolicy({ ...policy, [key]: e.target.value })} /></label>)}
        <label className="text-xs font-medium text-slate-600">Prend effet<input type="datetime-local" className={input} value={policy.starts} onChange={e => setPolicy({ ...policy, starts: e.target.value })} /></label>
        <label className="text-xs font-medium text-slate-600">Expire<input type="datetime-local" className={input} value={policy.ends} onChange={e => setPolicy({ ...policy, ends: e.target.value })} /></label>
      </div>
      <Button className="mt-4" disabled={!connection || !policy.mapping || !policy.noticeVersion || !/^[a-f0-9]{64}$/.test(policy.noticeDigest) || !policy.adultKey || !policy.sharingKey || !policy.starts || !policy.ends || busy === 'publish'} onClick={publish}>Publier prospectivement</Button>
      <div className="mt-5 divide-y divide-slate-200 border-t border-slate-200">
        {(data.policies || []).map(item => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="text-sm font-medium text-slate-900">Notice {item.notice_version} · politique v{item.version}</p><p className="mt-1 text-xs text-slate-500">{when(item.effective_from)} → {when(item.effective_until)} · {item.grants} preuve(s), {item.revocations} révocation(s)</p></div><Button size="sm" variant="outline" disabled={Boolean(item.retired_at) || busy === `retire-${item.id}`} onClick={() => run(`retire-${item.id}`, () => crmRpc('crm_retire_lifecycle_policy', { p_policy: item.id, p_version: item.version }))}>{item.retired_at ? 'Retirée' : 'Retirer'}</Button></div>)}
        {!data.policies?.length && <p className="py-3 text-xs text-slate-500">Aucune politique publiée.</p>}
      </div>
    </section>

    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><h2 className="font-semibold text-slate-950">Livraisons récentes</h2><p className="mt-1 text-xs text-slate-500">{deliveries.data?.total || 0} intention(s) · plus ancienne attente {when(deliveries.data?.oldest_pending_at)}</p></div></div>
      <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr>{['Fait','Modèle','État','Événement','Essais','Propriétaire','Blocage sûr','Actions'].map(label => <th key={label} className="whitespace-nowrap px-4 py-3 font-medium">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{rows.map(row => <tr key={row.id}><td className="px-4 py-3 font-medium text-slate-900">{eventLabel(row.event_kind)}</td><td className="px-4 py-3">{row.lifecycle_model || row.delivery_mode}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 font-medium ${badge(row.status)}`}>{row.status}</span></td><td className="whitespace-nowrap px-4 py-3">{when(row.event_time)}</td><td className="px-4 py-3 tabular-nums">{row.attempt_count}/{row.max_attempts}</td><td className="px-4 py-3">{row.producer_owner || '—'}</td><td className="px-4 py-3">{row.ordering_hold || row.last_error_code || (row.attempt_boundary_state === 'unknown' ? 'réception incertaine — non rejouable' : '—')}</td><td className="px-4 py-3"><div className="flex gap-2"><Button size="sm" variant="outline" disabled={!row.retry_eligible || busy === row.id} onClick={() => run(row.id, () => crmRpc('crm_retry_external_delivery', { p_delivery: row.id }))}><RotateCcw className="h-3.5 w-3.5" /><span className="sr-only">Réessayer</span></Button>{row.eligibility_evidence_id && !['sent','dead','suppressed'].includes(row.status) && <Button size="sm" variant="outline" disabled={busy === `revoke-${row.id}`} onClick={() => run(`revoke-${row.id}`, () => crmRpc('crm_revoke_lifecycle_evidence', { p_request: crypto.randomUUID(), p_evidence: row.eligibility_evidence_id, p_reason: 'contact_request' }))}><Ban className="h-3.5 w-3.5" /><span className="sr-only">Révoquer</span></Button>}</div></td></tr>)}</tbody></table></div>
      {!rows.length && <p className="p-8 text-center text-sm text-slate-500">Aucune intention enregistrée.</p>}
    </section>
  </div>;
}
