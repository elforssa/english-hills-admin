'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { entities, auth } from '@/lib/entities';
import { Plus, Search, Printer, Download, CheckSquare, Square } from 'lucide-react';
import jsPDF from 'jspdf';
import Pagination from '@/components/ui/pagination';
import SkeletonTable from '@/components/ui/SkeletonTable';
import { PAYMENT_STATUS_COLORS } from '@/lib/statusColors';

const PAGE_SIZE = 25;

function buildReceiptPDF(doc, r, yStart) {
  const restant = (r.montant_total || 0) - (r.montant_paye || 0);
  const statusKey = r.statut_paiement || (restant <= 0 ? 'Soldé' : 'En attente');
  let y = yStart;

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 77, 139);
  doc.text('English Hills Language Center', 105, y, { align: 'center' });
  y += 7;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text('Bouskoura / Sidi Maarouf, Casablanca', 105, y, { align: 'center' });
  y += 10;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 30, 30);
  doc.text(`Reçu de paiement — ${r.date || ''}`, 14, y);
  y += 8;

  doc.setDrawColor(200, 200, 200);
  doc.line(14, y, 196, y);
  y += 6;

  const rows = [
    ['Apprenant', r.nom_prenom || '—'],
    ['Téléphone', r.telephone || '—'],
    ['Email', r.email || '—'],
    ['Catégorie', r.categorie || '—'],
    ['Niveau', r.niveau || '—'],
    ['Type de cours', r.type_cours || '—'],
    ['Jours', r.jours || '—'],
    ['Plage horaire', r.plage_horaire || '—'],
  ];

  doc.setFontSize(9);
  rows.forEach(([label, val]) => {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(80, 80, 80);
    doc.text(label + ' :', 14, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 30, 30);
    doc.text(String(val), 65, y);
    y += 6;
  });

  y += 2;
  doc.line(14, y, 196, y);
  y += 6;

  const financial = [
    ['Montant total', `${(r.montant_total || 0).toLocaleString('fr-MA')} MAD`],
    ['Montant payé', `${(r.montant_paye || 0).toLocaleString('fr-MA')} MAD`],
    ['Restant', `${restant.toLocaleString('fr-MA')} MAD`],
    ['Mode de paiement', r.mode_paiement || '—'],
    ['Statut', statusKey],
  ];

  financial.forEach(([label, val]) => {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(80, 80, 80);
    doc.text(label + ' :', 14, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30, 30, 30);
    doc.text(val, 65, y);
    y += 6;
  });

  y += 4;
  doc.line(14, y, 196, y);
  y += 8;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(130, 130, 130);
  doc.text('Signature du responsable : ________________________', 14, y);
  return y + 10;
}

export default function Receipts() {
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [generating, setGenerating] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => {
    entities.Receipt.list('-created_date', 200).then(d => { setReceipts(d); setLoading(false); });
  }, []);

  const filtered = receipts.filter(r =>
    !search || r.nom_prenom?.toLowerCase().includes(search.toLowerCase())
  );

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggleOne = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(r => r.id)));
    }
  };

  const downloadSelected = () => {
    const toExport = filtered.filter(r => selected.has(r.id));
    if (!toExport.length) return;
    setGenerating(true);

    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    toExport.forEach((r, i) => {
      if (i > 0) doc.addPage();
      buildReceiptPDF(doc, r, 20);
    });

    doc.save(`reçus-english-hills-${new Date().toISOString().slice(0, 10)}.pdf`);
    setGenerating(false);
  };

  const allChecked = filtered.length > 0 && selected.size === filtered.length;
  const someChecked = selected.size > 0 && selected.size < filtered.length;

  return (
    <div className="p-4 lg:p-8">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Reçus de paiement</h1>
          <p className="text-muted-foreground text-sm mt-1">{receipts.length} reçus</p>
        </div>
        <Link href="/receipts/new" className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white rounded-md bg-primary hover:opacity-90">
          <Plus size={15} /> Nouveau reçu
        </Link>
      </div>

      <div className="flex flex-wrap gap-3 mb-5 items-center">
        <div className="relative flex-1 min-w-0 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-primary" placeholder="Rechercher par nom..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
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
          filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              Aucun reçu.{' '}
              <a href="/receipts/new" className="text-primary font-medium hover:underline">Créer le premier →</a>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted border-b border-border text-xs font-semibold text-muted-foreground">
                    <th className="px-4 py-3 w-8">
                      <button onClick={toggleAll} className="text-muted-foreground hover:text-foreground transition-colors">
                        {allChecked ? <CheckSquare size={16} style={{ color: '#1E4D8B' }} /> : someChecked ? <CheckSquare size={16} className="opacity-50" /> : <Square size={16} />}
                      </button>
                    </th>
                    {['Apprenant','Date','Catégorie','Niveau','Total','Payé','Restant','Mode','Statut',''].map(h => (
                      <th key={h} className="text-left px-4 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paged.map(r => {
                    const restant = (r.montant_total || 0) - (r.montant_paye || 0);
                    const isChecked = selected.has(r.id);
                    return (
                      <tr key={r.id} className={`hover:bg-muted/30 transition-colors ${isChecked ? 'bg-blue-50/50' : ''}`}>
                        <td className="px-4 py-3">
                          <button onClick={() => toggleOne(r.id)} className="text-muted-foreground hover:text-foreground transition-colors">
                            {isChecked ? <CheckSquare size={16} style={{ color: '#1E4D8B' }} /> : <Square size={16} />}
                          </button>
                        </td>
                        <td className="px-4 py-3 font-medium">{r.nom_prenom}</td>
                        <td className="px-4 py-3 text-muted-foreground">{r.date}</td>
                        <td className="px-4 py-3 text-muted-foreground">{r.categorie}</td>
                        <td className="px-4 py-3"><span className="text-xs font-bold text-white px-2 py-0.5 rounded bg-primary">{r.niveau}</span></td>
                        <td className="px-4 py-3">{(r.montant_total || 0).toLocaleString('fr-MA')} MAD</td>
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
                          <Link href={`/receipts/${r.id}/print`} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline whitespace-nowrap">
                            <Printer size={12} /> Imprimer
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        }
        <Pagination page={page} total={filtered.length} pageSize={PAGE_SIZE} onChange={setPage} />
      </div>
    </div>
  );
}
