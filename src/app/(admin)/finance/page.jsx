'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { entities, auth } from '@/lib/entities';
import { TrendingUp, AlertTriangle, CheckCircle, Clock, Plus, FileText, Printer, Download, Pencil } from 'lucide-react';
import { exportToCsv } from '@/utils/exportCsv';
import { PAYMENT_STATUS_COLORS } from '@/lib/statusColors';

const STATUT_CONFIG = PAYMENT_STATUS_COLORS;

export default function Finance() {
  const [payments, setPayments] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      entities.Payment.list('-created_date', 200),
      entities.Receipt.list('-created_date', 50),
      entities.Student.list('full_name', 200),
    ]).then(([p, r, s]) => { setPayments(p); setReceipts(r); setStudents(s); setLoading(false); });
  }, []);

  const studentName = (id) => students.find(s => s.id === id)?.full_name || '—';
  // `remise` is a percentage discount off montant_total, so the amount owed is the discounted total.
  const effectiveTotal = (r) => (r.montant_total || 0) * (1 - (r.remise || 0) / 100);
  const totalEncaisse = receipts.reduce((s, r) => s + (r.montant_paye || 0), 0);
  const totalDu = receipts.reduce((s, r) => s + effectiveTotal(r), 0);
  const totalRestant = receipts.reduce((s, r) => s + Math.max(0, effectiveTotal(r) - (r.montant_paye || 0)), 0);
  const collectionRate = totalDu > 0 ? Math.round((totalEncaisse / totalDu) * 100) : 0;
  const enRetard = receipts.filter(r => r.statut_paiement === 'En retard').length;
  const payes = receipts.filter(r => r.statut_paiement === 'Soldé' || (effectiveTotal(r) - (r.montant_paye || 0)) <= 0).length;

  const TERMES = ['Sept–Déc', 'Jan–Mar', 'Avr–Juin', 'Été'];
  const termStats = TERMES.map(terme => {
    const termReceipts = receipts.filter(r => r.duree_cours?.includes(terme) || false);
    const du = termReceipts.reduce((s, r) => s + effectiveTotal(r), 0);
    const enc = termReceipts.reduce((s, r) => s + (r.montant_paye || 0), 0);
    return { terme, du, enc, rate: du > 0 ? Math.round((enc / du) * 100) : null };
  }).filter(t => t.du > 0);

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

  const exportFinanceCsv = () => {
    exportToCsv(receipts.map(r => ({
      Apprenant: r.nom_prenom,
      Date: r.date,
      Catégorie: r.categorie,
      Niveau: r.niveau,
      'Type cours': r.type_cours,
      'Montant total': r.montant_total,
      'Remise (%)': r.remise || 0,
      'Total après remise': effectiveTotal(r),
      'Montant payé': r.montant_paye,
      Restant: effectiveTotal(r) - (r.montant_paye || 0),
      Mode: r.mode_paiement,
      Statut: r.statut_paiement,
    })), `finance-${new Date().toISOString().slice(0, 10)}.csv`);
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
          <button onClick={exportFinanceCsv} className="flex items-center gap-2 px-3 py-2 text-sm font-medium border border-border rounded-md hover:bg-muted">
            <Download size={15} /> Export CSV
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
        {termStats.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
            {termStats.map(t => (
              <div key={t.terme} className="bg-muted rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">{t.terme}</p>
                <p className="font-bold text-sm" style={{ color: 'var(--brand)' }}>{t.rate}%</p>
                <p className="text-xs text-muted-foreground">{t.enc.toLocaleString('fr-MA')} MAD</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-card border border-border rounded-lg mb-6">
        <div className="px-4 lg:px-6 py-4 border-b border-border">
          <h2 className="font-semibold">Reçus récents</h2>
        </div>
        {loading ? (
          <div className="p-4 animate-pulse space-y-2">
            {Array.from({length:6}).map((_,i)=><div key={i} className="h-10 bg-muted rounded"/>)}
          </div>
        ) : receipts.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Aucun reçu pour l&apos;instant.</div>
        ) : (
          <>
            <div className="divide-y divide-border sm:hidden">
              {receipts.slice(0, 20).map(r => {
                const restant = effectiveTotal(r) - (r.montant_paye || 0);
                const key = r.statut_paiement || (restant <= 0 ? 'Soldé' : 'En attente');
                return (
                  <div key={r.id} className="px-4 py-3 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm text-foreground truncate">{r.nom_prenom}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{r.date} · {r.categorie} · {r.niveau}</p>
                      <p className="text-xs text-muted-foreground">{r.mode_paiement}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      <p className="text-sm font-bold text-foreground">{(r.montant_paye || 0).toLocaleString('fr-MA')} MAD</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${STATUT_CONFIG[key] || STATUT_CONFIG['En attente']}`}>{key}</span>
                      <div className="flex items-center gap-3">
                        <Link href={`/receipts/${r.id}/print`} className="flex items-center gap-1 text-xs font-medium text-primary">
                          <Printer size={11} /> Imprimer
                        </Link>
                        <Link href={`/receipts/${r.id}/edit`} className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
                          <Pencil size={11} /> Modifier
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted border-b border-border text-xs font-semibold text-muted-foreground">
                    <th className="text-left px-4 py-3">Apprenant</th>
                    <th className="text-left px-4 py-3">Date</th>
                    <th className="text-left px-4 py-3">Catégorie</th>
                    <th className="text-left px-4 py-3">Montant payé</th>
                    <th className="text-left px-4 py-3">Mode</th>
                    <th className="text-left px-4 py-3">Statut</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {receipts.slice(0, 20).map(r => {
                    const restant = effectiveTotal(r) - (r.montant_paye || 0);
                    const key = r.statut_paiement || (restant <= 0 ? 'Soldé' : 'En attente');
                    return (
                      <tr key={r.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 font-medium">{r.nom_prenom}</td>
                        <td className="px-4 py-3 text-muted-foreground">{r.date}</td>
                        <td className="px-4 py-3 text-muted-foreground">{r.categorie} · {r.niveau}</td>
                        <td className="px-4 py-3 font-semibold">{(r.montant_paye || 0).toLocaleString('fr-MA')} MAD</td>
                        <td className="px-4 py-3 text-muted-foreground">{r.mode_paiement}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${STATUT_CONFIG[key] || STATUT_CONFIG['En attente']}`}>{key}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-4">
                            <Link href={`/receipts/${r.id}/print`} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                              <Printer size={12} /> Imprimer
                            </Link>
                            <Link href={`/receipts/${r.id}/edit`} className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:underline">
                              <Pencil size={12} /> Modifier
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
