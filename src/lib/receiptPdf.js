'use client';

import jsPDF from 'jspdf';
import { money, receiptAmounts, receiptStatus } from './receiptFinance';

export function buildReceiptPDF(doc, receipt, yStart = 20) {
  const amounts = receiptAmounts(receipt);
  let y = yStart;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(30, 77, 139);
  doc.text('English Hills Language Center', 105, y, { align: 'center' }); y += 7;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(100);
  doc.text('Centre Almaz, Casablanca · Learn Today, Lead Tomorrow', 105, y, { align: 'center' }); y += 9;
  doc.setDrawColor(30, 77, 139); doc.line(14, y, 196, y); y += 8;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(25);
  doc.text(receipt.voided_at ? 'REÇU ANNULÉ' : 'Reçu de paiement', 14, y);
  doc.setFontSize(9); doc.text(receipt.receipt_number || '', 196, y, { align: 'right' }); y += 7;

  const rows = [
    ['Date du paiement', receipt.date || '—'], ['Apprenant', receipt.nom_prenom || '—'],
    ...(receipt.telephone ? [['Téléphone', receipt.telephone]] : []),
    ...(receipt.email ? [['Destinataire', receipt.email]] : []),
    ['Session', receipt.session_type || 'Historique'],
    ['Service / période', receipt.service_description || 'Reçu historique'],
    ...(receipt.session_type === 'Yearly' && receipt.plan_type ? [['Formule', receipt.plan_type]] : []),
    ['Niveau', receipt.niveau || 'À déterminer'],
  ];
  doc.setFontSize(9);
  rows.forEach(([label, value]) => { doc.setFont('helvetica', 'bold'); doc.setTextColor(100); doc.text(`${label} :`, 14, y); doc.setFont('helvetica', 'normal'); doc.setTextColor(25); doc.text(String(value), 62, y); y += 6; });
  y += 2; doc.setDrawColor(210); doc.line(14, y, 196, y); y += 7;
  const financial = [
    ['Prix brut convenu', `${money(amounts.gross)} MAD`],
    ...(amounts.discount > 0 ? [['Remise', `-${money(amounts.discount)} MAD`]] : []),
    ['Prix net', `${money(amounts.net)} MAD`], ['Payé avant ce reçu', `${money(amounts.paidBefore)} MAD`],
    ['Reçu ce jour', `${money(amounts.payment)} MAD`], ['Solde après ce reçu', `${money(amounts.balance)} MAD`],
    ['Mode', receipt.mode_paiement || '—'], ['Statut à l’émission', receiptStatus(receipt)],
  ];
  financial.forEach(([label, value]) => { doc.setFont('helvetica', 'bold'); doc.setTextColor(90); doc.text(`${label} :`, 14, y); doc.setFont('helvetica', 'normal'); doc.setTextColor(25); doc.text(value, 72, y); y += 6; });
  if (receipt.transaction_reference) { doc.text(`Référence : ${receipt.transaction_reference}`, 14, y); y += 6; }
  if (receipt.payment_note || receipt.observation) { doc.text(`Note : ${receipt.payment_note || receipt.observation}`, 14, y); y += 6; }
  if (receipt.voided_at) { doc.setTextColor(180, 30, 50); doc.setFont('helvetica', 'bold'); doc.text(`ANNULÉ — ${receipt.void_reason || 'Correction'}`, 14, y); y += 7; }
  doc.setTextColor(120); doc.setFont('helvetica', 'italic'); doc.setFontSize(8);
  doc.text('Signature du responsable : ________________________', 14, y + 5);
  return y + 15;
}

export function downloadReceiptPDF(receipt) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  buildReceiptPDF(doc, receipt, 20);
  doc.save(`recu-english-hills-${receipt.receipt_number || receipt.date}.pdf`);
}
