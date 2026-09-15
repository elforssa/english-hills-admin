'use client';

import jsPDF from 'jspdf';
import { money, receiptAmounts, receiptStatus } from './receiptFinance.js';
import { RECEIPT_PAPER_FORMAT, receiptSchoolYear } from './receiptPresentation.js';

const BLUE = [30, 77, 139];
const RED = [185, 28, 46];
const INK = [28, 36, 50];
const MUTED = [100, 116, 139];

let logoPromise;
export async function loadReceiptLogo() {
  if (!logoPromise) {
    logoPromise = fetch('/eh-logo.png').then(async (response) => {
      if (!response.ok) throw new Error('Logo unavailable');
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }).catch(() => null);
  }
  return logoPromise;
}

export function buildReceiptPDF(doc, receipt, { logoData = null } = {}) {
  const amounts = receiptAmounts(receipt);
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const margin = 10;
  const contentWidth = width - (margin * 2);
  const bottomLimit = height - 18;
  const firstPage = doc.getNumberOfPages();
  let y = 8;

  const addPage = () => {
    doc.addPage(RECEIPT_PAPER_FORMAT, 'portrait');
    y = 13;
    doc.setFillColor(...BLUE); doc.rect(0, 0, width * 0.72, 2.5, 'F');
    doc.setFillColor(...RED); doc.rect(width * 0.72, 0, width * 0.28, 2.5, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...BLUE);
    doc.text(`Reçu ${receipt.receipt_number || ''} - suite`, margin, 8);
  };
  const ensureSpace = (needed) => { if (y + needed > bottomLimit) addPage(); };
  const sectionTitle = (title) => {
    ensureSpace(10); y += 2;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...BLUE);
    doc.text(title.toUpperCase(), margin, y);
    doc.setDrawColor(203, 213, 225); doc.setLineWidth(0.25); doc.line(margin, y + 2.3, width - margin, y + 2.3);
    y += 7;
  };
  const detailRow = (label, value) => {
    if (value === null || value === undefined || String(value).trim() === '') return;
    doc.setFontSize(8.5);
    const lines = doc.splitTextToSize(String(value), contentWidth - 39);
    ensureSpace(Math.max(6, lines.length * 4.2));
    doc.setFont('helvetica', 'bold'); doc.setTextColor(...MUTED); doc.text(`${label}`, margin, y);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...INK); doc.text(lines, margin + 39, y);
    y += Math.max(6, lines.length * 4.2);
  };
  const amountRow = (label, value, { emphasis = false, balance = false } = {}) => {
    ensureSpace(9);
    if (emphasis || balance) {
      doc.setFillColor(...(balance && amounts.balance > 0 ? [255, 241, 242] : emphasis ? [239, 246, 255] : [236, 253, 245]));
      doc.roundedRect(margin, y - 4.5, contentWidth, 7.5, 1.2, 1.2, 'F');
    }
    doc.setFontSize(emphasis || balance ? 9.2 : 8.5);
    doc.setFont('helvetica', emphasis || balance ? 'bold' : 'normal');
    doc.setTextColor(...(balance && amounts.balance > 0 ? RED : emphasis ? BLUE : INK));
    doc.text(label, margin + 2, y);
    doc.setFont('helvetica', 'bold'); doc.text(value, width - margin - 2, y, { align: 'right' });
    y += 8;
  };

  doc.setFillColor(...BLUE); doc.rect(0, 0, width * 0.72, 3, 'F');
  doc.setFillColor(...RED); doc.rect(width * 0.72, 0, width * 0.28, 3, 'F');
  if (logoData) {
    try { doc.addImage(logoData, 'PNG', margin, y, 31, 16.9, undefined, 'FAST'); } catch { /* text fallback below */ }
  }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...BLUE);
  if (!logoData) doc.text('ENGLISH HILLS', margin, y + 5);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...MUTED);
  doc.text('Language Center · Centre Almaz, Casablanca', logoData ? margin + 35 : margin, y + 11);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...RED);
  doc.text('LEARN TODAY, LEAD TOMORROW', width - margin, y + 5, { align: 'right' });
  y += 18;
  doc.setDrawColor(...BLUE); doc.setLineWidth(0.7); doc.line(margin, y, width - margin, y); y += 7;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...INK);
  doc.text(receipt.voided_at ? 'REÇU DE PAIEMENT - ANNULÉ' : 'REÇU DE PAIEMENT', margin, y);
  doc.setFontSize(9); doc.setTextColor(...BLUE); doc.text(receipt.receipt_number || '', width - margin, y, { align: 'right' }); y += 6;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTED);
  doc.text(`Date du paiement : ${receipt.date || ''}`, margin, y);
  doc.text(`Statut : ${receiptStatus(receipt)}`, width - margin, y, { align: 'right' }); y += 4;
  if (receipt.voided_at) {
    doc.setFillColor(...RED); doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.roundedRect(margin, y, contentWidth, 8, 1.2, 1.2, 'F'); doc.text('ANNULÉ', width / 2, y + 5.4, { align: 'center' }); y += 12;
  }

  sectionTitle('Apprenant');
  detailRow('Nom', receipt.nom_prenom);
  detailRow('Téléphone', receipt.telephone);
  detailRow('Email', receipt.email);

  sectionTitle('Session');
  detailRow('Session', receipt.session_type || (receipt.legacy ? 'Historique' : ''));
  detailRow('Année scolaire', receiptSchoolYear(receipt));
  if (receipt.session_type === 'Yearly') detailRow('Formule', receipt.plan_type);
  detailRow('Niveau', receipt.niveau);
  detailRow('Service', receipt.service_description || (receipt.legacy ? 'Reçu historique' : ''));

  sectionTitle('Paiement');
  amountRow('Prix brut convenu', `${money(amounts.gross)} MAD`);
  if (amounts.discount > 0) amountRow('Remise', `-${money(amounts.discount)} MAD`);
  amountRow('Prix net', `${money(amounts.net)} MAD`);
  amountRow('Payé avant ce reçu', `${money(amounts.paidBefore)} MAD`);
  amountRow('Montant payé aujourd’hui', `${money(amounts.payment)} MAD`, { emphasis: true });
  amountRow('Solde restant', `${money(amounts.balance)} MAD`, { balance: true });
  detailRow('Mode de paiement', receipt.mode_paiement);
  detailRow('Référence', receipt.transaction_reference);

  const note = receipt.payment_note || receipt.observation;
  if (note) { sectionTitle('Note'); detailRow('', note); }
  if (receipt.voided_at) {
    sectionTitle('Annulation');
    detailRow('Motif', receipt.void_reason || 'Paiement annulé');
  }

  ensureSpace(30); y += 5;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...MUTED);
  doc.text('SIGNATURE DU RESPONSABLE', margin, y);
  doc.text('CACHET DU CENTRE', width - margin, y, { align: 'right' });
  doc.setDrawColor(148, 163, 184); doc.setLineWidth(0.25);
  doc.line(margin, y + 20, margin + 48, y + 20); doc.line(width - margin - 48, y + 20, width - margin, y + 20);

  const lastPage = doc.getNumberOfPages();
  for (let page = firstPage; page <= lastPage; page += 1) {
    doc.setPage(page);
    doc.setFillColor(...BLUE); doc.rect(0, height - 10, width * 0.72, 10, 'F');
    doc.setFillColor(...RED); doc.rect(width * 0.72, height - 10, width * 0.28, 10, 'F');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(255, 255, 255);
    doc.text('English Hills Language Center · Learn Today, Lead Tomorrow', margin, height - 4);
  }
  doc.setPage(lastPage);
  return lastPage;
}

export async function downloadReceiptPDF(receipt) {
  const logoData = await loadReceiptLogo();
  const doc = new jsPDF({ unit: 'mm', format: RECEIPT_PAPER_FORMAT, orientation: 'portrait' });
  buildReceiptPDF(doc, receipt, { logoData });
  doc.save(`recu-english-hills-${receipt.receipt_number || receipt.date}.pdf`);
}
