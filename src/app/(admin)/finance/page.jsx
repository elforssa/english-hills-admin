'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getBrowserClient } from '@/lib/supabase';
import { TrendingUp, AlertTriangle, CheckCircle, Clock, Plus, FileText, Download, Wallet, Phone } from 'lucide-react';
import { exportToCsv } from '@/utils/exportCsv';
import { PAYMENT_STATUS_COLORS } from '@/lib/statusColors';

const STATUT_CONFIG = PAYMENT_STATUS_COLORS;
const RELANCER_SHOWN = 10;
const effectiveTotal = (r) => (r.montant_total || 0) * (1 - (r.remise || 0) / 100);

export default function Finance() {
  const [summary, setSummary] = useState(null);
  const [relancer, setRelancer] = useState([]);
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const sb = getBrowserClient();
    Promise.all([
      sb.rpc('get_finance_summary'),
      sb.rpc('get_unpaid_receipts', { lim: 50 }),
      sb.rpc('get_referral_breakdown'),
    ]).then(([sum, unpaid, refs]) => {
      setSummary(sum.data || {});
      setRelancer((unpaid.data || []).map(r => ({ ...r, restant: effectiveTotal(r) - (r.montant_paye || 0) })));
      setSources(refs.data || []);
      setLoading(false);
    });
  }, []);

  const totalEncaisse = Math.round(Number(summary?.total_encaisse || 0));
  const totalDu = Math.round(Number(summary?.total_du || 0));
  const totalRestant = Math.round(Number(summary?.total_restant || 0));
  const enRetard = Number(summary?.count_en_retard || 0);
  const payes = Number(summary?.count_solde || 0);
  const collectionRate = totalDu > 0 ? Math.round((totalEncaisse / totalDu) * 100) : 0;
  const byProgram = (summary?.by_program || []).filter(p => Number(p.encaisse) > 0 || Number(p.restant) > 0);
  const totalSources = sources.reduce((a, x) => a + Number(x.count || 0), 0);

  const StatCard = ({ label, value, icon: Icon, color }) => (
    <div className="bg-card border border-border rounded-lg p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-muted-foreground font-medium">{label}</span>
        <div className="w-8 h-8 rounded-md flex items-center justify-center" style={{ backgroundColor: color + '20' }}>
          <Icon size={16} style={{ color }} />
        </div>
      </div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
    </div>
  );

  // Export every receipt (not just a page) by fetching in one large range.
  const exportFinanceCsv = async () => {
    setExporting(true);
    try {
      const sb = getBrowserClient();
      const { data } = await sb.from('receipts').select('*').order('date', { ascending: false }).range(0, 9999);
      exportToCsv((data || []).map(r => ({
        Apprenant: r.nom_prenom,
        Date: r.date,
        Catégorie: r.categorie,
        Session: r.session_type || '',
        Niveau: r.niveau,
        'Type cours': r.type_cours,
        'Montant total': r.montant_total,
        'Remise (%)': r.remise || 0,
        'Total après remise': effectiveTotal(r),
        'Montant payé': r.montant_paye,
        Restant: Math.max(0, effectiveTotal(r) - (r.montant_paye || 0)),
        Mode: r.mode_paiement,
        Statut: r.statut_paiement,
      })), `finance-${new Date().toISOString().slice(0, 10)}.csv`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="p-4 lg:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold">Finance</h1>
        <div className="flex gap-2 flex-wrap">
          <Link href="/receipts/new" className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-white rounded-md bg-primary hover:opacity-90">
            <Plus size={15} /> Nouveau reçu
          </Link>
          <Link href="/receipts" className="flex items-center gap-2 px-3 py-2 text-sm font-medium border border-border rounded-md hover:bg-muted">
            <FileText size={15} /> Tous les reçus
          </Link>
          <button onClick={exportFinanceCsv} disabled={exporting} className="flex items-center gap-2 px-3 py-2 text-sm font-medium border border-border rounded-md hover:bg-muted disabled:opacity-50">
            <Download size={15} /> {exporting ? 'Export…' : 'Export CSV'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total encaissé" value={`${totalEncaisse.toLocaleString('fr-MA')} MAD`} icon={TrendingUp} color="#1E4D8B" />
        <StatCard label="Soldes restants" value={`${totalRestant.toLocaleString('fr-MA')} MAD`} icon={Clock} color="#f59e0b" />
        <StatCard label="Paiements en retard" value={enRetard} icon={AlertTriangle} color="#B91C2E" />
        <StatCard label="Reçus soldés" value={payes} icon={CheckCircle} color="#16a34a" />
      </div>

      <div className="bg-card border border-border rounded-lg p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-sm">Taux de recouvrement global</h2>
          <span className="text-2xl font-bold" style={{ color: collectionRate >= 80 ? '#059669' : collectionRate >= 60 ? '#d97706' : '#B91C2E' }}>{collectionRate}%</span>
        </div>
        <div className="w-full bg-muted rounded-full h-2.5 mb-4 overflow-hidden">
          <div className="h-2.5 rounded-full transition-all" style={{ width: `${Math.min(100, collectionRate)}%`, backgroundColor: collectionRate >= 80 ? '#059669' : collectionRate >= 60 ? '#d97706' : '#B91C2E' }} />
        </div>
        <p className="text-xs text-muted-foreground">{totalEncaisse.toLocaleString('fr-MA')} MAD encaissés sur {totalDu.toLocaleString('fr-MA')} MAD facturés</p>
        {byProgram.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-4">
            {byProgram.map(p => (
              <div key={p.program} className="bg-muted rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1 truncate" title={p.program}>{p.program}</p>
                <p className="font-bold text-sm" style={{ color: 'var(--brand)' }}>{Math.round(Number(p.encaisse)).toLocaleString('fr-MA')} MAD</p>
                {Number(p.restant) > 0 && <p className="text-xs" style={{ color: '#B91C2E' }}>{Math.round(Number(p.restant)).toLocaleString('fr-MA')} dû</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {sources.length > 0 && (
        <div className="bg-card border border-border rounded-lg p-5 mb-6">
          <h2 className="font-semibold text-sm mb-4">Sources d&apos;acquisition <span className="text-muted-foreground font-normal">· {totalSources} apprenants</span></h2>
          <div className="space-y-2.5">
            {sources.map(s => {
              const pct = totalSources > 0 ? Math.round(Number(s.count) / totalSources * 100) : 0;
              return (
                <div key={s.source} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-40 sm:w-64 truncate" title={s.source}>{s.source}</span>
                  <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                    <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: 'var(--brand)' }} />
                  </div>
                  <span className="text-xs font-semibold w-20 text-right">{s.count} · {pct}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="bg-card border border-border rounded-lg mb-6">
        <div className="px-4 lg:px-6 py-4 border-b border-border flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold flex items-center gap-2">
              <Wallet size={16} style={{ color: '#f59e0b' }} /> À relancer
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {relancer.length}{relancer.length >= 50 ? '+' : ''} reçu{relancer.length > 1 ? 's' : ''} avec solde impayé · {totalRestant.toLocaleString('fr-MA')} MAD à recouvrer
            </p>
          </div>
          <Link href="/receipts" className="text-xs font-medium text-primary hover:underline whitespace-nowrap">Tous les reçus →</Link>
        </div>
        {loading ? (
          <div className="p-4 animate-pulse space-y-2">
            {Array.from({length:6}).map((_,i)=><div key={i} className="h-10 bg-muted rounded"/>)}
          </div>
        ) : relancer.length === 0 ? (
          <div className="p-8 text-center">
            <CheckCircle size={28} className="mx-auto text-green-500/70 mb-2" />
            <p className="text-sm font-medium text-foreground">Aucun solde en attente</p>
            <p className="text-xs text-muted-foreground mt-0.5">Tous les reçus sont soldés — rien à relancer.</p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-border">
              {relancer.slice(0, RELANCER_SHOWN).map(r => {
                const key = r.statut_paiement === 'En retard' ? 'En retard' : (r.statut_paiement || 'En attente');
                return (
                  <div key={r.id} className="px-4 lg:px-6 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm text-foreground truncate">{r.nom_prenom}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{r.date} · {r.categorie}</p>
                      {r.telephone && (
                        <a href={`tel:${r.telephone}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary mt-0.5">
                          <Phone size={11} /> {r.telephone}
                        </a>
                      )}
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="text-right">
                        <p className="text-sm font-bold" style={{ color: '#B91C2E' }}>{r.restant.toLocaleString('fr-MA')} MAD</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${STATUT_CONFIG[key] || STATUT_CONFIG['En attente']}`}>{key}</span>
                      </div>
                      <Link href={`/receipts/${r.id}/edit`} className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white rounded-md bg-primary hover:opacity-90 whitespace-nowrap">
                        <Wallet size={12} /> Encaisser
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
            {relancer.length > RELANCER_SHOWN && (
              <div className="px-4 lg:px-6 py-3 border-t border-border text-center">
                <Link href="/receipts" className="text-xs font-medium text-primary hover:underline">
                  + {relancer.length - RELANCER_SHOWN} autre{relancer.length - RELANCER_SHOWN > 1 ? 's' : ''} · voir tous les reçus →
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
