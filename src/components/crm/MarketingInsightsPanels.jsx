'use client';
import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, RefreshCw, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { crmRpc, useCrmRead } from '@/lib/crm/queries';

const input = 'mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm disabled:bg-slate-50 disabled:text-slate-500';
const when = (v, timezone) => v ? new Intl.DateTimeFormat('fr-MA', { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone || 'Africa/Casablanca' }).format(new Date(v)) : '—';
const accountToday = (timezone) => new Intl.DateTimeFormat('en-CA', { timeZone: timezone || 'Africa/Casablanca' }).format(new Date());
const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const span = (from, to) => (Date.parse(to) - Date.parse(from)) / 86400000;
const statusLabels = { pending: 'En attente', running: 'En cours', completed: 'Terminée', failed: 'Échec', partial: 'Partielle' };
const errorLabels = {
  rate_limit: 'Limite de requêtes Meta atteinte', provider_auth: 'Accès Meta refusé (jeton ou autorisation)', provider_unavailable: 'Meta temporairement indisponible',
  invalid_data: 'Réponse Meta invalide ou compte non conforme', network: 'Erreur réseau', timeout: 'Délai dépassé', limit_exceeded: 'Volume trop important : réduisez la période',
  missing_secret: 'Jeton Meta absent du serveur', live_not_available: 'Synchronisation réelle non autorisée sur le serveur', storage_unavailable: 'Enregistrement indisponible',
  async_pending: 'Rapport Meta non prêt', attempts_exhausted: 'Tentatives épuisées',
};
const blank = { mode: 'live', account_id: '', currency: 'USD', timezone: 'Africa/Casablanca', api_version: 'v25.0', secret_ref: 'CRM_META_INSIGHTS_TOKEN_EH_KAL', refresh_days: 28, refresh_interval_hours: 6, enabled: false };

function Collapsible({ title, testId, children }) {
  const [open, setOpen] = useState(false);
  return <section className="rounded-lg border border-slate-200 bg-white" data-testid={testId}>
    <button type="button" className="flex w-full items-center gap-2 px-4 py-3 text-left font-semibold text-slate-900" aria-expanded={open} onClick={() => setOpen(!open)}>
      {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}{title}
    </button>
    {open && <div className="border-t px-4 py-4">{children}</div>}
  </section>;
}

// Director configuration of the ad account connection and the live switch.
export function InsightsConnectionPanel({ insights, onChanged }) {
  return <Collapsible title="Connexion Meta Insights" testId="insights-connection-panel"><ConnectionForm insights={insights} onChanged={onChanged} /></Collapsible>;
}

function ConnectionForm({ insights, onChanged }) {
  const meta = useCrmRead('crm_get_meta_diagnostics', { p_limit: 1, p_offset: 0 });
  const connections = (meta.data?.connections || []).filter(c => c.provider === 'meta');
  const [id, setId] = useState('');
  const current = connections.find(c => c.id === id) || connections.find(c => c.insights_settings?.account_id) || connections[0];
  const stored = current?.insights_settings?.account_id ? current.insights_settings : null;
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setForm(stored ? { ...blank, ...stored } : blank); }, [current?.id, current?.version]); // eslint-disable-line react-hooks/exhaustive-deps
  if (meta.isLoading) return <p className="text-sm text-slate-500">Chargement…</p>;
  if (meta.isError) return <p role="alert" className="text-sm text-red-700">Connexions indisponibles.</p>;
  if (!current) return <p className="text-sm text-slate-500">Aucune connexion Meta n’est configurée.</p>;
  const runs = (insights?.runs || []).filter(r => r.connection_id === current.id);
  const published = !!insights?.connections?.find(c => c.id === current.id)?.last_completed_at;
  const queued = runs.some(r => ['pending', 'running'].includes(r.status));
  const identityLocked = !!stored && (published || queued);
  const set = key => e => setForm({ ...form, [key]: e.target.value });
  const save = async (data) => {
    setBusy(true);
    try {
      await crmRpc('crm_configure_insights', { p_connection: current.id, p_version: current.version, p_data: data });
      toast.success('Configuration Meta Insights enregistrée');
      await Promise.all([meta.refetch(), onChanged()]);
    } catch {
      toast.error('Configuration refusée : vérifiez les champs, ou actualisez puis réessayez.');
    } finally { setBusy(false); }
  };
  const payload = (f) => ({
    mode: f.mode, enabled: !!f.enabled, account_id: String(f.account_id).trim(), currency: String(f.currency).trim().toUpperCase(), timezone: String(f.timezone).trim(),
    api_version: String(f.api_version).trim(), secret_ref: String(f.secret_ref).trim(), refresh_days: Number(f.refresh_days), refresh_interval_hours: Number(f.refresh_interval_hours),
  });
  return <div className="space-y-4 text-sm">
    {connections.length > 1 && <label className="block text-xs font-medium text-slate-600">Connexion Meta<select className={input} value={current.id} onChange={e => setId(e.target.value)}>{connections.map(c => <option key={c.id} value={c.id}>{c.connection_key}</option>)}</select></label>}
    {stored && <div className="flex items-center gap-3 rounded-md bg-slate-50 px-3 py-2">
      <Switch id="insights-live-switch" checked={!!stored.enabled} disabled={busy} onCheckedChange={checked => save(payload({ ...blank, ...stored, enabled: checked }))} aria-label="Synchronisation Meta" />
      <label htmlFor="insights-live-switch" className="text-slate-700">Synchronisation {stored.mode === 'live' ? 'réelle' : 'de simulation'} : <strong>{stored.enabled ? 'activée' : 'désactivée'}</strong></label>
    </div>}
    {identityLocked && <p className="text-xs text-slate-600">{published ? 'Compte, devise, fuseau et mode sont figés depuis la première synchronisation publiée ; une correction passe par une réconciliation validée.' : 'Compte, devise, fuseau et mode restent modifiables une fois les synchronisations en attente terminées.'}</p>}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-xs font-medium text-slate-600">Mode<select className={input} value={form.mode} disabled={identityLocked} onChange={set('mode')}><option value="live">Réel (Meta)</option><option value="mock">Simulation (tests)</option></select></label>
      <label className="text-xs font-medium text-slate-600">Compte publicitaire (ID)<input className={input} inputMode="numeric" value={form.account_id} disabled={identityLocked} onChange={set('account_id')} /></label>
      <label className="text-xs font-medium text-slate-600">Devise du compte<input className={input} value={form.currency} disabled={identityLocked} onChange={set('currency')} /></label>
      <label className="text-xs font-medium text-slate-600">Fuseau du compte<input className={input} value={form.timezone} disabled={identityLocked} onChange={set('timezone')} /></label>
      <label className="text-xs font-medium text-slate-600">Version API<input className={input} value={form.api_version} onChange={set('api_version')} /></label>
      <label className="text-xs font-medium text-slate-600">Nom de la référence du jeton<input className={input} value={form.secret_ref} onChange={set('secret_ref')} /></label>
      <label className="text-xs font-medium text-slate-600">Fenêtre glissante (jours)<input className={input} type="number" min="1" max="31" value={form.refresh_days} onChange={set('refresh_days')} /></label>
      <label className="text-xs font-medium text-slate-600">Intervalle d’actualisation (heures)<input className={input} type="number" min="1" max="24" value={form.refresh_interval_hours} onChange={set('refresh_interval_hours')} /></label>
    </div>
    <p className="text-xs text-slate-500">Le jeton reste un secret serveur ; seul son nom de référence est enregistré ici.</p>
    <Button size="sm" disabled={busy} onClick={() => save(payload(form))}>Enregistrer la configuration</Button>
  </div>;
}

// Recent refreshes, retry, manual refresh and the 31-day-block historical backfill.
export function InsightsSyncPanel({ insights, connection, onChanged }) {
  return <Collapsible title="Synchronisation" testId="insights-sync-panel"><SyncTools insights={insights} connection={connection} onChanged={onChanged} /></Collapsible>;
}

function SyncTools({ insights, connection, onChanged }) {
  const [busy, setBusy] = useState(''), [progress, setProgress] = useState('');
  const [from, setFrom] = useState(''), [to, setTo] = useState('');
  if (!connection) return <p className="text-sm text-slate-500">Aucun compte publicitaire configuré.</p>;
  const runs = (insights?.runs || []).filter(r => r.connection_id === connection.id);
  const enabled = connection.enabled === true;
  const today = accountToday(connection.timezone);
  const request = async (range) => {
    const response = await fetch('/api/internal/crm/insights/process', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store',
      body: JSON.stringify({ connection: connection.id, request: crypto.randomUUID(), ...range }),
    });
    if (response.status !== 202) throw new Error('refused');
  };
  const refreshNow = async () => {
    setBusy('refresh');
    try { await request({}); toast.success('Actualisation demandée'); await onChanged(); }
    catch { toast.error('Actualisation refusée : synchronisation désactivée ou déjà en attente sur cette période.'); }
    finally { setBusy(''); }
  };
  const backfillValid = !!from && !!to && from <= to && to <= today && span(from, to) <= 365;
  const backfill = async () => {
    // One request per block of at most 31 account dates, submitted sequentially.
    const blocks = [];
    for (let start = from; start <= to; start = addDays(start, 31)) blocks.push({ from: start, to: addDays(start, 30) < to ? addDays(start, 30) : to });
    setBusy('backfill');
    try {
      for (const [index, block] of blocks.entries()) {
        setProgress(`Bloc ${index + 1}/${blocks.length} : ${block.from} → ${block.to}`);
        try { await request(block); }
        catch { toast.error(`Bloc ${block.from} → ${block.to} refusé ; les blocs suivants n’ont pas été demandés.`); return; }
      }
      toast.success(`${blocks.length} bloc(s) demandés ; traitement d’environ un bloc par passage de 30 minutes.`);
    } finally { setBusy(''); setProgress(''); await onChanged(); }
  };
  const retry = async (run) => {
    setBusy(run.id);
    try { await crmRpc('crm_retry_insights_sync', { p_run: run.id }); toast.success('Nouvelle tentative demandée'); await onChanged(); }
    catch { toast.error('Nouvelle tentative refusée.'); }
    finally { setBusy(''); }
  };
  return <div className="space-y-4 text-sm">
    <div className="flex flex-wrap items-center gap-3">
      <Button size="sm" variant="outline" disabled={!enabled || !!busy} onClick={refreshNow}><RefreshCw className="mr-2 h-4 w-4" />Actualiser les dépenses maintenant</Button>
      {!enabled && <span className="text-xs text-slate-500">Synchronisation désactivée pour ce compte.</span>}
    </div>
    <div className="rounded-md bg-slate-50 p-3">
      <p className="text-xs font-semibold text-slate-700">Historique (rattrapage)</p>
      <div className="mt-2 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="text-xs font-medium text-slate-600">Du<input aria-label="Rattrapage du" type="date" className={input} value={from} max={today} onChange={e => setFrom(e.target.value)} /></label>
        <label className="text-xs font-medium text-slate-600">Au<input aria-label="Rattrapage au" type="date" className={input} value={to} max={today} onChange={e => setTo(e.target.value)} /></label>
        <Button size="sm" disabled={!enabled || !backfillValid || !!busy} onClick={backfill}>Demander le rattrapage</Button>
      </div>
      <p className="mt-2 text-xs text-slate-500">Découpé en blocs de 31 jours au plus, traités environ un par passage de 30 minutes. Période de 366 jours maximum, sans date future.</p>
      {progress && <p className="mt-1 text-xs text-slate-700">{progress}</p>}
    </div>
    <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr>{['Période', 'Statut', 'Détail', 'Tentatives', 'Demandée', 'Terminée', ''].map(c => <th key={c} className="whitespace-nowrap px-3 py-2 font-medium">{c}</th>)}</tr></thead>
      <tbody className="divide-y divide-slate-100">{runs.map(run => {
        const retryable = enabled && ['failed', 'partial'].includes(run.status) && run.attempt_count < 3;
        const waiting = run.status === 'pending' && run.error_code && run.next_attempt_at;
        return <tr key={run.id}>
          <td className="whitespace-nowrap px-3 py-2">{run.date_from} → {run.date_to}</td>
          <td className="px-3 py-2">{statusLabels[run.status] || run.status}</td>
          <td className="px-3 py-2">{run.error_code ? (errorLabels[run.error_code] || 'Erreur inconnue') : '—'}{waiting && <span className="block text-slate-500">Nouvelle tentative prévue : {when(run.next_attempt_at, connection.timezone)}</span>}</td>
          <td className="px-3 py-2 tabular-nums">{run.attempt_count}/3</td>
          <td className="whitespace-nowrap px-3 py-2">{when(run.created_at, connection.timezone)}</td>
          <td className="whitespace-nowrap px-3 py-2">{when(run.completed_at, connection.timezone)}</td>
          <td className="px-3 py-2">{retryable && <Button size="sm" variant="outline" disabled={!!busy} onClick={() => retry(run)}><RotateCcw className="mr-1 h-3.5 w-3.5" />Réessayer</Button>}</td>
        </tr>;
      })}</tbody></table></div>
    {!runs.length && <p className="text-xs text-slate-500">Aucune synchronisation pour ce compte.</p>}
  </div>;
}
