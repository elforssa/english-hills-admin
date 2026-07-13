'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { getBrowserClient } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Plus, Search, Printer, Download, CheckSquare, Square, Trash2, Pencil } from 'lucide-react';
import jsPDF from 'jspdf';
import Pagination from '@/components/ui/pagination';
import SkeletonTable from '@/components/ui/SkeletonTable';
import { PAYMENT_STATUS_COLORS } from '@/lib/statusColors';
import { buildReceiptPDF } from '@/lib/receiptPdf';

const PAGE_SIZE = 25;

export default function Receipts() {
  const { role } = useAuth();
  const isDirector = role === 'director';
  const [receipts, setReceipts] = useState([]); // current page only
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [generating, setGenerating] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [page, setPage] = useState(1);

  // Debounce the search box, and reset to page 1 on a new query.
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Server-side page + search: fetch only the 25 rows for this page, plus the
  // exact total count. Scales to any number of receipts (no client-side limit).
  const load = useCallback(async () => {
    setLoading(true);
    const sb = getBrowserClient();
    let q = sb.from('receipts').select('*', { count: 'exact' }).order('created_at', { ascending: false });
    if (search) q = q.ilike('nom_prenom', `%${search}%`);
    const { data, count } = await q.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
    setReceipts(data || []);
    setTotal(count || 0);
    setLoading(false);
  }, [page, search]);

  useEffect(() => { load(); }, [load]);

  const toggleOne = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const pageIds = receipts.map(r => r.id);
  const allChecked = receipts.length > 0 && pageIds.every(id => selected.has(id));
  const someChecked = pageIds.some(id => selected.has(id)) && !allChecked;
  const toggleAll = () => {
    setSelected(prev => {
      const next = new Set(prev);
      if (allChecked) pageIds.forEach(id => next.delete(id));
      else pageIds.forEach(id => next.add(id));
      return next;
    });
  };

  // Fetch the selected receipts (may span pages) and render them to one PDF.
  const downloadSelected = async () => {
    if (!selected.size) return;
    setGenerating(true);
    try {
      const sb = getBrowserClient();
      const { data } = await sb.from('receipts').select('*').in('id', [...selected]);
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      (data || []).forEach((r, i) => { if (i > 0) doc.addPage(); buildReceiptPDF(doc, r, 20); });
      doc.save(`reçus-english-hills-${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally {
      setGenerating(false);
    }
  };

  const handleDelete = async (r) => {
    if (!confirm(`Supprimer le reçu de ${r.nom_prenom || 'cet apprenant'} ? Cette action est réservée au directeur.`)) return;
    setDeletingId(r.id);
    const sb = getBrowserClient();
    const { error } = await sb.rpc('soft_delete_receipt', { p_receipt_id: r.id });
    setDeletingId(null);
    if (error) { toast.error('Erreur : ' + error.message); return; }
    setSelected(prev => { const next = new Set(prev); next.delete(r.id); return next; });
    toast.success('Reçu supprimé');
    load();
  };

  return (
    <div className="p-4 lg:p-8">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Reçus de paiement</h1>
          <p className="text-muted-foreground text-sm mt-1">{total} reçu{total > 1 ? 's' : ''}{search ? ' (filtré)' : ''}</p>
        </div>
        <Button asChild>
          <Link href="/receipts/new">
            <Plus size={15} /> Nouveau reçu
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap gap-3 mb-5 items-center">
        <div className="relative flex-1 min-w-0 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-primary" placeholder="Rechercher par nom..." value={searchInput} onChange={e => setSearchInput(e.target.value)} />
        </div>
        {selected.size > 0 && (
          <button
            onClick={downloadSelected}
            disabled={generating}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white rounded-md bg-emerald-600 hover:opacity-90 disabled:opacity-60 transition-all"
          >
            <Download size={15} />
            {generating ? 'Génération...' : `Télécharger ${selected.size} reçu${selected.size > 1 ? 's' : ''} PDF`}
          </button>
        )}
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {loading ? <SkeletonTable rows={10} cols={9} /> :
          receipts.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              {search ? 'Aucun reçu ne correspond à cette recherche.' : (
                <>Aucun reçu.{' '}<a href="/receipts/new" className="text-primary font-medium hover:underline">Créer le premier →</a></>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted border-b border-border text-xs font-semibold text-muted-foreground">
                    <th className="px-4 py-3 w-8">
                      <button onClick={toggleAll} className="text-muted-foreground hover:text-foreground transition-colors">
                        {allChecked ? <CheckSquare size={16} style={{ color: 'var(--brand)' }} /> : someChecked ? <CheckSquare size={16} className="opacity-50" /> : <Square size={16} />}
                      </button>
                    </th>
                    {['Apprenant','Date','Catégorie','Niveau','Total','Payé','Restant','Mode','Statut',''].map(h => (
                      <th key={h} className="text-left px-4 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {receipts.map(r => {
                    const effectiveTotal = (r.montant_total || 0) * (1 - (r.remise || 0) / 100);
                    const restant = effectiveTotal - (r.montant_paye || 0);
                    const isChecked = selected.has(r.id);
                    return (
                      <tr key={r.id} className={`hover:bg-muted/30 transition-colors ${isChecked ? 'bg-blue-50/50' : ''}`}>
                        <td className="px-4 py-3">
                          <button onClick={() => toggleOne(r.id)} className="text-muted-foreground hover:text-foreground transition-colors">
                            {isChecked ? <CheckSquare size={16} style={{ color: 'var(--brand)' }} /> : <Square size={16} />}
                          </button>
                        </td>
                        <td className="px-4 py-3 font-medium">{r.nom_prenom}</td>
                        <td className="px-4 py-3 text-muted-foreground">{r.date}</td>
                        <td className="px-4 py-3 text-muted-foreground">{r.categorie}</td>
                        <td className="px-4 py-3"><span className="text-xs font-bold text-white px-2 py-0.5 rounded bg-primary">{r.niveau}</span></td>
                        <td className="px-4 py-3">
                          {effectiveTotal.toLocaleString('fr-MA')} MAD
                          {r.remise > 0 && (
                            <span className="block text-xs text-muted-foreground line-through">{(r.montant_total || 0).toLocaleString('fr-MA')} MAD</span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-semibold text-green-700">{(r.montant_paye || 0).toLocaleString('fr-MA')} MAD</td>
                        <td className="px-4 py-3" style={{ color: restant > 0 ? '#B91C2E' : '#16a34a' }}>{restant.toLocaleString('fr-MA')} MAD</td>
                        <td className="px-4 py-3 text-muted-foreground">{r.mode_paiement}</td>
                        <td className="px-4 py-3">
                          {(() => {
                            const statusKey = r.statut_paiement || (restant <= 0 ? 'Soldé' : 'En attente');
                            return <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${PAYMENT_STATUS_COLORS[statusKey] || PAYMENT_STATUS_COLORS['En attente']}`}>{statusKey}</span>;
                          })()}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <Link href={`/receipts/${r.id}/edit`} className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:underline whitespace-nowrap">
                              <Pencil size={12} /> Modifier
                            </Link>
                            <Link href={`/receipts/${r.id}/print`} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline whitespace-nowrap">
                              <Printer size={12} /> Imprimer
                            </Link>
                            {isDirector && (
                              <button
                                onClick={() => handleDelete(r)}
                                disabled={deletingId === r.id}
                                title="Supprimer le reçu"
                                className="flex items-center gap-1 text-xs font-medium text-red-600 hover:underline disabled:opacity-50 whitespace-nowrap"
                              >
                                <Trash2 size={12} /> {deletingId === r.id ? 'Suppression...' : 'Supprimer'}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        }
        <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />
      </div>
    </div>
  );
}
