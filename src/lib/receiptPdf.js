// =============================================================================
// receiptPdf — shared jsPDF receipt renderer.
//
// Extracted from the admin receipts page so the parent portal can let families
// download a PDF copy of their own receipts without duplicating the layout.
// =============================================================================

'use client';

import jsPDF from 'jspdf';

/**
 * buildReceiptPDF(doc, receipt, yStart) → number (next y)
 * Renders one receipt onto an existing jsPDF document starting at yStart.
 */
export function buildReceiptPDF(doc, r, yStart) {
  const effectiveTotal = (r.montant_total || 0) * (1 - (r.remise || 0) / 100);
  const restant = effectiveTotal - (r.montant_paye || 0);
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
  doc.text('Almaz 2, Hills Business Center, Bâtiment B, Bureau 6, Casablanca', 105, y, { align: 'center' });
  y += 10;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 30, 30);
  doc.text(`Reçu de paiement — ${r.date || ''}`, 14, y);
  if (r.receipt_number) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(`N° ${r.receipt_number}`, 196, y, { align: 'right' });
    doc.setTextColor(30, 30, 30);
    doc.setFontSize(11);
  }
  y += 8;

  doc.setDrawColor(200, 200, 200);
  doc.line(14, y, 196, y);
  y += 6;

  const rows = [
    ['Apprenant', r.nom_prenom || '—'],
    ['Téléphone', r.telephone || '—'],
    ['Email', r.email || '—'],
    ['Catégorie', r.categorie || '—'],
    ...(r.session_type ? [['Session', r.session_type]] : []),
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
    ...(r.remise > 0
      ? [
          ['Prix de base', `${(r.montant_total || 0).toLocaleString('fr-MA')} MAD`],
          [`Remise (${r.remise}%)`, `-${((r.montant_total || 0) * (r.remise / 100)).toLocaleString('fr-MA')} MAD`],
          ['Prix final', `${effectiveTotal.toLocaleString('fr-MA')} MAD`],
        ]
      : [['Montant total', `${(r.montant_total || 0).toLocaleString('fr-MA')} MAD`]]),
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

/**
 * downloadReceiptPDF(receipt) — render a single receipt and trigger a download.
 */
export function downloadReceiptPDF(receipt) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  buildReceiptPDF(doc, receipt, 20);
  const stamp = receipt.receipt_number || receipt.date || new Date().toISOString().slice(0, 10);
  doc.save(`recu-english-hills-${stamp}.pdf`);
}
