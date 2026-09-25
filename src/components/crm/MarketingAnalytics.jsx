'use client';
import { useState } from 'react';
import { ChevronRight, ArrowLeft, RefreshCw } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useCrmRead } from '@/lib/crm/queries';
import { Button } from '@/components/ui/button';

const number = (v) => v == null ? '—' : new Intl.NumberFormat('fr-MA', { maximumFractionDigits: 2 }).format(v);
const money = (v, currency) => v == null ? '—' : `${number(v)} ${currency || ''}`;
const timestamp = (v, timezone) => v ? new Intl.DateTimeFormat('fr-MA', { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone }).format(new Date(v)) : 'Jamais';
const objectives = { OUTCOME_LEADS: 'Prospects', OUTCOME_AWARENESS: 'Notoriété', OUTCOME_TRAFFIC: 'Trafic', OUTCOME_ENGAGEMENT: 'Interactions', OUTCOME_SALES: 'Ventes', OUTCOME_APP_PROMOTION: 'Promotion d’application' };
const input = 'mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm';
const columns = [['leads','Prospects'],['engaged','Engagés'],['qualified','Qualifiés'],['tests_booked','Tests réservés'],['tests_attended','Tests passés'],['results','Résultats'],['converted','Convertis']];
export default function MarketingAnalytics() {
  const { role } = useAuth();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca' }).format(new Date());
  const [from, setFrom] = useState(`${today.slice(0, 7)}-01`), [to, setTo] = useState(today), [cutoff, setCutoff] = useState('');
  const [account, setAccount] = useState(''), [channel, setChannel] = useState(''), [level, setLevel] = useState('campaign');
  const [drill, setDrill] = useState([]), [offset, setOffset] = useState(0);
  const diagnostics = useCrmRead('crm_insights_diagnostics', {}, role === 'director');
  const connections = diagnostics.data?.connections || [];
  const selected = account || connections[0]?.id || null;
  const valid = !!from && !!to && from <= to && (Date.parse(to) - Date.parse(from)) / 86400000 <= 365 && (!cutoff || cutoff >= from);
  const report = useCrmRead('crm_get_marketing_cohort', {
    p_from: from, p_to: to, p_cutoff_date: cutoff || null, p_connection: selected,
    p_level: level, p_channel: channel || null, p_campaign: drill.find(d => d.level === 'campaign')?.id || null, p_adset: drill.find(d => d.level === 'adset')?.id || null, p_ad: drill.find(d => d.level === 'ad')?.id || null, p_limit: 50, p_offset: offset,
  }, role === 'director' && diagnostics.isSuccess && valid);
  const data = report.data, summary = data?.summary;
  const reset = () => { setDrill([]); setOffset(0); };
  const change = (setter) => (e) => { setter(e.target.value); reset(); };
  const descend = (row) => {
    setDrill([...drill, { id: row.object_key, name: row.name, level }]); setLevel(level === 'campaign' ? 'adset' : 'ad'); setOffset(0);
  };
  return <div className="mx-auto max-w-[1600px] space-y-5 p-4 md:p-6" data-testid="marketing-analytics">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Direction · Acquisition</p><h1 className="mt-1 text-2xl font-semibold text-slate-900">Analyse marketing</h1><p className="mt-1 text-sm text-slate-600">De l’acquisition aux encaissements, pour une même cohorte de prospects.</p></div>
      <Button variant="outline" onClick={() => { report.refetch(); diagnostics.refetch(); }} disabled={!valid || report.isFetching}><RefreshCw className="mr-2 h-4 w-4" />Actualiser</Button>
    </header>
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs font-medium text-slate-600">Acquisitions du<input aria-label="Acquisitions du" type="date" className={input} value={from} onChange={change(setFrom)} /></label>
        <label className="text-xs font-medium text-slate-600">Au<input aria-label="Acquisitions au" type="date" className={input} value={to} onChange={change(setTo)} /></label>
        <label className="text-xs font-medium text-slate-600">Résultats arrêtés au<input aria-label="Résultats arrêtés au" type="date" className={input} value={cutoff} onChange={change(setCutoff)} /><span className="mt-1 block font-normal">Vide : à maintenant</span></label>
        <label className="text-xs font-medium text-slate-600">Compte publicitaire<select className={input} value={selected || ''} onChange={change(setAccount)}>{!connections.length && <option value="">Aucun compte configuré</option>}{connections.map(c => <option value={c.id} key={c.id}>{c.label} · {c.currency}</option>)}</select></label>
        <label className="text-xs font-medium text-slate-600">Source<select className={input} value={channel} onChange={change(setChannel)}><option value="">Toutes les sources</option><option value="meta_instant_form">Formulaire Meta</option><option value="website">Site web</option><option value="manual">Saisie manuelle</option></select></label>
        <label className="text-xs font-medium text-slate-600">Regrouper par<select className={input} value={level} onChange={change(setLevel)}><option value="campaign">Campagne</option><option value="adset">Ensemble de publicités</option><option value="ad">Annonce</option><option value="source">Source</option></select></label>
      </div>
      {!valid && <p role="alert" className="mt-3 text-sm text-red-700">Choisissez une période de 366 jours maximum et une date de résultats postérieure au début.</p>}
    </div>
    {(report.isError || diagnostics.isError) && <p role="alert" className="rounded-lg border p-4 text-sm text-red-700">Analyse indisponible. Réessayez avec une période valide.</p>}
    {(report.isLoading || diagnostics.isLoading) && <p className="text-sm text-slate-500">Chargement de l’analyse…</p>}
    {data && valid && <>
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">
        <p>Dépenses Meta synchronisées : <strong>{timestamp(data.last_synced_at, data.timezone)}</strong> · CRM : données actuelles · Fuseau : {data.timezone}</p>
        <p>Résultats de cette cohorte jusqu’au {timestamp(data.outcome_cutoff, data.timezone)}. Les encaissements postérieurs à l’acquisition sont inclus jusqu’à cette date.</p>
        <p>Synchronisation réelle désactivée · Environnement de simulation.</p>
        {!data.spend_complete && <p className="font-semibold text-slate-900">Dépenses indisponibles : la période n’est pas entièrement synchronisée.</p>}
        {data.sync_warning && <p className="font-semibold text-slate-900">Une actualisation est en attente ou a échoué. Les dernières dépenses complètes sont conservées.</p>}
        {data.currency_mismatch && <p className="font-semibold text-slate-900">Devises différentes : dépenses en {data.spend_currency}, revenus en MAD. ROAS indisponible.</p>}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ['Dépenses Meta', money(summary.spend, data.spend_currency)], ['Prospects acquis', number(summary.leads)], ['Qualifiés', number(summary.qualified)], ['Convertis', number(summary.converted)],
          ['Encaissements nets', money(summary.revenue, 'MAD')], ['CAC Meta attribué', money(summary.cac, data.spend_currency)], ['ROAS Meta attribué', summary.roas == null ? '—' : `${number(summary.roas)}×`], ['Sans attribution Meta', number(summary.unattributed_leads)],
        ].map(([label, value]) => <div key={label} className="rounded-lg border border-slate-200 bg-white px-4 py-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{value}</p></div>)}
      </div>
      <p className="text-xs leading-5 text-slate-500">Les totaux CRM incluent toutes les sources sélectionnées. Les ratios Meta utilisent uniquement les prospects attribués par identifiants Meta : {number(summary.attributed_leads)} acquis, {number(summary.attributed_qualified)} qualifiés, {number(summary.attributed_converted)} convertis et {money(summary.attributed_revenue, 'MAD')} encaissés. Les prospects web et manuels couvrent le centre entier ; aucune dépense ne leur est attribuée par nom de campagne.</p>
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3"><h2 className="font-semibold text-slate-900">Performance par {({ campaign: 'campagne', adset: 'ensemble', ad: 'annonce', source: 'source' })[level]}</h2>{drill.length > 0 && <Button size="sm" variant="ghost" onClick={() => { setDrill(drill.slice(0, -1)); setLevel(drill.at(-1).level); setOffset(0); }}><ArrowLeft className="mr-1 h-4 w-4" />Retour</Button>}{drill.map(d => <span key={d.id} className="text-xs text-slate-500">/ {d.name}</span>)}</div>
        <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr>{['Nom', 'Dépenses', ...columns.map(c => c[1]), 'Revenus MAD', 'CPL', 'CPQL', 'CAC', 'ROAS'].map(c => <th key={c} className="whitespace-nowrap px-3 py-3 font-medium">{c}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{data.rows.map(row => <tr key={row.bucket}>
          <td className="min-w-52 px-3 py-3"><div className="font-medium text-slate-900">{row.attribution_kind === 'trusted_meta' && ['campaign','adset','ad'].includes(level) && !drill.some(d => d.level === 'ad') ? <button className="flex items-center gap-1 text-left hover:underline" onClick={() => descend(row)}>{row.name}<ChevronRight className="h-3 w-3 shrink-0" /></button> : row.name}</div>{row.objective && <p className="mt-1 text-[10px] text-slate-500" title="Objectif déclaré par Meta">Objectif Meta : {objectives[row.objective] || row.objective}</p>}{row.historical_names?.filter(n => n !== row.name).length > 0 && <details className="mt-1 text-[10px] text-slate-500"><summary>Noms à l’acquisition</summary>{row.historical_names.join(' · ')}</details>}{row.review_required > 0 && <p className="mt-1 text-[10px] text-slate-500">{row.review_required} conversion(s) à vérifier</p>}</td>
          <td className="whitespace-nowrap px-3 py-3 tabular-nums">{money(row.spend, data.spend_currency)}</td>{columns.map(([key]) => <td key={key} className="px-3 py-3 tabular-nums">{number(row[key])}</td>)}<td className="px-3 py-3 tabular-nums">{number(row.revenue)}</td>{['cpl','cpql','cac'].map(key => <td key={key} className="px-3 py-3 tabular-nums">{money(row[key], data.spend_currency)}</td>)}<td className="px-3 py-3 tabular-nums">{row.roas == null ? '—' : `${number(row.roas)}×`}</td>
        </tr>)}</tbody></table></div>
        {!data.rows.length && <p className="p-8 text-center text-sm text-slate-500">Aucune acquisition ni dépense pour cette sélection.</p>}
        <div className="flex items-center justify-between border-t px-4 py-3 text-xs text-slate-500"><span>{number(data.total)} lignes</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 50))}>Précédent</Button><Button size="sm" variant="outline" disabled={offset + 50 >= data.total} onClick={() => setOffset(offset + 50)}>Suivant</Button></div></div>
      </section>
      <footer className="grid gap-2 text-xs leading-5 text-slate-500 sm:grid-cols-2"><p><strong>CPL</strong> = dépenses / prospects acquis. <strong>CPQL</strong> = dépenses / prospects qualifiés. <strong>CAC</strong> = dépenses / prospects convertis.</p><p><strong>ROAS</strong> = encaissements nets attribués / dépenses publicitaires, dans la même devise. « — » signifie indisponible. Couverture unique : indisponible, elle ne s’additionne pas entre annonces et jours.</p></footer>
    </>}
  </div>;
}
