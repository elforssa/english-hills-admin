'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { entities } from '@/lib/entities';
import { Printer, ArrowLeft, Download, Trash2, Edit } from 'lucide-react';
import Link from 'next/link';
import jsPDF from 'jspdf';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { getBrowserClient } from '@/lib/supabase';

const STATUT_CONFIG = {
  'Soldé': { bg: '#F0FDF4', color: '#166534', border: '#BBF7D0' },
  'Acompte versé': { bg: '#FFFBEB', color: '#92400e', border: '#FDE68A' },
  'En attente': { bg: '#EFF6FF', color: '#1e40af', border: '#BFDBFE' },
  'En retard': { bg: '#FFF1F2', color: '#9f1239', border: '#FECDD3' },
};

export default function ReceiptPrint() {
  const params = useParams();
  const id = params?.id;
  const router = useRouter();
  const { role } = useAuth();
  const isDirector = role === 'director';
  const [receipt, setReceipt] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    entities.Receipt.filter({ id }).then((data) => {
      setReceipt(data[0] || null);
      setLoading(false);
    });
  }, [id]);

  const handlePrint = () => window.print();

  const handleDownload = () => {
    const doc = new jsPDF({ unit: 'mm', format: 'a5' });
    const pdfEffectiveTotal = (receipt.montant_total || 0) * (1 - (receipt.remise || 0) / 100);
    const restant = pdfEffectiveTotal - (receipt.montant_paye || 0);
    const statusKey = receipt.statut_paiement || (restant <= 0 ? 'Soldé' : 'En attente');
    let y = 15;

    doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 77, 139);
    doc.text('English Hills Language Center', 74, y, { align: 'center' }); y += 7;
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100);
    doc.text('Centre Almaz, Casablanca · contact@english-hills.com', 74, y, { align: 'center' }); y += 8;
    doc.setDrawColor(30, 77, 139); doc.setLineWidth(0.5); doc.line(10, y, 138, y); y += 6;

    doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 30, 30);
    doc.text(`Reçu de paiement — ${receipt.date || ''}`, 10, y); y += 5;
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(120, 120, 120);
    doc.text(`N° ${receipt.receipt_number || '#' + (receipt.id || '').slice(-8).toUpperCase()}  ·  ${statusKey}`, 10, y); y += 7;
    doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.3); doc.line(10, y, 138, y); y += 5;

    const rows = [
      ['Nom et prénom', receipt.nom_prenom],
      ['Téléphone', receipt.telephone],
      ...(receipt.email ? [['Email', receipt.email]] : []),
      ...(receipt.date_naissance ? [['Date de naissance', receipt.date_naissance]] : []),
      ['Catégorie', receipt.categorie],
      ['Niveau', receipt.niveau],
      ['Type de cours', receipt.type_cours],
      ...(receipt.jours ? [['Jours', receipt.jours]] : []),
      ...(receipt.plage_horaire ? [['Horaire', receipt.plage_horaire]] : []),
    ];

    doc.setFontSize(9);
    rows.forEach(([label, val]) => {
      doc.setFont('helvetica', 'bold'); doc.setTextColor(80, 80, 80);
      doc.text(label + ' :', 10, y);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30);
      doc.text(String(val || '—'), 58, y);
      y += 6;
    });

    y += 2; doc.line(10, y, 138, y); y += 6;
    const financial = [
      ...(receipt.remise > 0
        ? [
            ['Prix de base', `${(receipt.montant_total || 0).toLocaleString('fr-MA')} MAD`],
            [`Remise (${receipt.remise}%)`, `-${((receipt.montant_total || 0) * (receipt.remise / 100)).toLocaleString('fr-MA')} MAD`],
            ['Prix final', `${pdfEffectiveTotal.toLocaleString('fr-MA')} MAD`],
          ]
        : [['Montant total', `${(receipt.montant_total || 0).toLocaleString('fr-MA')} MAD`]]),
      ['Montant payé', `${(receipt.montant_paye || 0).toLocaleString('fr-MA')} MAD`],
      ['Restant', `${restant.toLocaleString('fr-MA')} MAD`],
      ['Mode de paiement', receipt.mode_paiement],
      ['Statut', statusKey],
    ];
    financial.forEach(([label, val]) => {
      doc.setFont('helvetica', 'bold'); doc.setTextColor(80, 80, 80);
      doc.text(label + ' :', 10, y);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30);
      doc.text(String(val || '—'), 58, y);
      y += 6;
    });

    y += 4; doc.line(10, y, 138, y); y += 8;
    doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.setTextColor(130, 130, 130);
    doc.text('Signature du responsable : ________________________', 10, y);

    const safeName = (receipt.nom_prenom || 'recu').replace(/\s+/g, '-').toLowerCase();
    doc.save(`reçu-${safeName}-${receipt.date || 'english-hills'}.pdf`);
  };

  const handleDelete = async () => {
    // Receipts are retention-sensitive: only the director may remove one, and
    // it is a soft delete (deleted_at) via RPC — never a hard DELETE.
    if (!isDirector) {
      toast.error('Seul le directeur peut supprimer un reçu.');
      return;
    }
    if (!confirm('Archiver ce reçu ? Il sera masqué mais conservé pour la comptabilité.')) return;
    const sb = getBrowserClient();
    const { error } = await sb.rpc('soft_delete_receipt', { p_receipt_id: id });
    if (error) {
      toast.error(error.message || 'Échec de la suppression du reçu.');
      return;
    }
    toast.success('Reçu archivé');
    router.push('/receipts');
  };

  if (loading) return <div className="p-8 text-center text-muted-foreground">Chargement...</div>;
  if (!receipt) return <div className="p-8 text-center text-muted-foreground">Reçu introuvable.</div>;

  const effectiveTotal = (receipt.montant_total || 0) * (1 - (receipt.remise || 0) / 100);
  const montantRestant = effectiveTotal - (receipt.montant_paye || 0);
  const statusKey = receipt.statut_paiement || (montantRestant <= 0 ? 'Soldé' : 'En attente');
  const sc = STATUT_CONFIG[statusKey] || STATUT_CONFIG['En attente'];

  return (
    <div className="min-h-screen bg-gray-100 print:bg-white">
      <div className="print:hidden sticky top-0 z-10 flex flex-wrap items-center gap-3 px-6 py-3 bg-white border-b border-border shadow-sm">
        <button onClick={() => router.push('/receipts')} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft size={15} /> Retour
        </button>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <div className="text-sm font-medium text-muted-foreground mr-2">{receipt.nom_prenom}</div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full border" style={{ backgroundColor: sc.bg, color: sc.color, borderColor: sc.border }}>
            {statusKey}
          </span>
        </div>
        <button
          onClick={handlePrint}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white rounded-xl transition-all hover:opacity-90 shadow-sm"
          style={{ background: 'linear-gradient(135deg, #1E4D8B 0%, #1a3f75 100%)' }}
        >
          <Printer size={15} />
          Imprimer
        </button>
        <button
          onClick={handleDownload}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl border border-border hover:bg-muted transition-colors"
        >
          <Download size={15} />
          Télécharger PDF
        </button>
        <Link
          href={`/receipts/${id}/edit`}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl border border-border hover:bg-muted transition-colors"
        >
          <Edit size={15} />
          Modifier
        </Link>
        {isDirector && (
          <button
            onClick={handleDelete}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
          >
            <Trash2 size={15} />
            Supprimer
          </button>
        )}
      </div>

      <div className="py-8 px-4 print:p-0">
        <div
          className="bg-white mx-auto shadow-xl print:shadow-none"
          style={{ maxWidth: '560px', fontFamily: 'Inter, sans-serif' }}
        >
          <div className="h-2" style={{ background: 'linear-gradient(90deg, #1E4D8B 0%, #B91C2E 100%)' }} />

          <div className="flex items-start justify-between px-10 pt-8 pb-6">
            <div>
              <img
                src="/eh-logo.png"
                alt="English Hills"
                style={{ height: '44px', width: 'auto' }}
              />
              <p className="text-xs text-gray-400 mt-3 leading-relaxed">
                Centre Almaz, Casablanca<br />
                Maroc<br />
                contact@english-hills.com
              </p>
            </div>
            <div className="text-right">
              <div className="inline-block text-white text-xs font-bold px-4 py-1.5 rounded-lg mb-3 bg-primary">
                REÇU DE PAIEMENT
              </div>
              <p className="text-xs text-gray-500">Date : <span className="font-bold text-gray-800">{receipt.date}</span></p>
              <p className="text-xs text-gray-500 mt-1">N° de reçu : <span className="font-bold text-gray-800">{receipt.receipt_number || `#${receipt.id?.slice(-8).toUpperCase()}`}</span></p>
              <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border" style={{ backgroundColor: sc.bg, color: sc.color, borderColor: sc.border }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: sc.color }} />
                {statusKey}
              </div>
            </div>
          </div>

          <div className="px-10 pb-8 space-y-7">
            <section>
              <h3 className="text-xs font-bold uppercase tracking-widest mb-4 pb-2 border-b-2" style={{ color: '#1E4D8B', borderColor: '#E8EEF7' }}>
                Données d&apos;inscription
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <DataField label="Nom et prénom" value={receipt.nom_prenom} />
                <DataField label="Téléphone" value={receipt.telephone} />
                {receipt.email && <DataField label="Email" value={receipt.email} />}
                {receipt.date_naissance && <DataField label="Date de naissance" value={receipt.date_naissance} />}
              </div>
            </section>

            <section>
              <h3 className="text-xs font-bold uppercase tracking-widest mb-4 pb-2 border-b-2" style={{ color: '#1E4D8B', borderColor: '#E8EEF7' }}>
                Détails du cours
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                <DataField label="Catégorie" value={receipt.categorie} />
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Niveau</p>
                  <span className="inline-block text-xs font-bold text-white px-3 py-1 rounded-lg bg-primary">{receipt.niveau}</span>
                </div>
                <DataField label="Type de cours" value={receipt.type_cours} />
                {receipt.duree_cours && <DataField label="Durée" value={receipt.duree_cours} />}
                {receipt.jours && <DataField label="Jours" value={receipt.jours} />}
                {receipt.plage_horaire && <DataField label="Horaire" value={receipt.plage_horaire} />}
              </div>
            </section>

            <section>
              <h3 className="text-xs font-bold uppercase tracking-widest mb-4 pb-2 border-b-2" style={{ color: '#1E4D8B', borderColor: '#E8EEF7' }}>
                Détails du paiement
              </h3>
              <div className="bg-gray-50 rounded-xl overflow-hidden">
                <div className="divide-y divide-gray-100">
                  {receipt.remise > 0 ? (
                    <>
                      <PayRow label="Prix de base" value={`${(receipt.montant_total || 0).toLocaleString('fr-MA')} MAD`} />
                      <PayRow
                        label={`Remise (${receipt.remise}%)`}
                        value={`−${((receipt.montant_total || 0) * (receipt.remise / 100)).toLocaleString('fr-MA')} MAD`}
                        valueStyle={{ color: '#059669' }}
                      />
                      <PayRow label="Prix final" value={`${effectiveTotal.toLocaleString('fr-MA')} MAD`} bold />
                    </>
                  ) : (
                    <PayRow label="Montant total du cours" value={`${(receipt.montant_total || 0).toLocaleString('fr-MA')} MAD`} />
                  )}
                  <PayRow label="Montant payé ce jour" value={`${(receipt.montant_paye || 0).toLocaleString('fr-MA')} MAD`} />
                  <PayRow label="Mode de paiement" value={receipt.mode_paiement} />
                </div>
                <div className="flex justify-between items-center px-5 py-4" style={{ backgroundColor: montantRestant > 0 ? '#FFF1F2' : '#F0FDF4' }}>
                  <span className="text-sm font-bold" style={{ color: montantRestant > 0 ? '#B91C2E' : '#166534' }}>Montant restant</span>
                  <span className="text-lg font-bold" style={{ color: montantRestant > 0 ? '#B91C2E' : '#166534' }}>
                    {montantRestant.toLocaleString('fr-MA')} MAD
                  </span>
                </div>
              </div>
            </section>

            {receipt.observation && (
              <section>
                <h3 className="text-xs font-bold uppercase tracking-widest mb-3 pb-2 border-b-2" style={{ color: '#1E4D8B', borderColor: '#E8EEF7' }}>
                  Observation
                </h3>
                <p className="text-sm text-gray-600 leading-relaxed">{receipt.observation}</p>
              </section>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 sm:gap-12 pt-8 mt-4 border-t border-gray-100">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-10">Signature du responsable</p>
                <div className="border-b border-gray-300 w-44" />
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-10">Cachet du centre</p>
                <div className="border-b border-gray-300 w-44 ml-auto" />
              </div>
            </div>
          </div>

          <div className="px-10 py-4 text-center bg-primary">
            <p className="text-xs font-medium text-white/80">English Hills Language Center · Centre Almaz, Casablanca</p>
            <p className="text-xs text-white/50 mt-0.5 italic">Learn Today, Lead Tomorrow · english-hills.com</p>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @page { margin: 0; size: A5; }
        }
      `}</style>
    </div>
  );
}

function DataField({ label, value }) {
  return (
    <div>
      <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      <p className="font-semibold text-gray-800">{value || '—'}</p>
    </div>
  );
}

function PayRow({ label, value, bold, valueStyle }) {
  return (
    <div className="flex justify-between items-center px-5 py-3 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className={bold ? 'font-bold text-gray-900' : 'font-semibold text-gray-800'} style={valueStyle}>{value}</span>
    </div>
  );
}
