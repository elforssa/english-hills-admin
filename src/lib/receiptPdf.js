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
  const firstPage = doc.getNumberOfPages();
  let y = 8;

  // Client receipts never paginate. Fit the variable detail rows into one A5.
  const details = [receipt.nom_prenom, receipt.telephone, receipt.email,
    receipt.session_type, receiptSchoolYear(receipt),
    receipt.session_type === 'Yearly' ? receipt.plan_type : '', receipt.niveau,
    receipt.service_description, receipt.mode_paiement, receipt.transaction_reference].filter(Boolean);
  let detailFontSize = 8.5;
  const detailHeight = () => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(detailFontSize);
    return details.reduce((total, value) => total + Math.max(4.8, doc.splitTextToSize(String(value), contentWidth - 39).length * detailFontSize * 0.49), 0);
  };
  while (detailHeight() > 65 && detailFontSize > 4) detailFontSize -= 0.25;
  const sectionTitle = (title) => {
    y += 1;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...BLUE);
    doc.text(title.toUpperCase(), margin, y);
    doc.setDrawColor(203, 213, 225); doc.setLineWidth(0.25); doc.line(margin, y + 2.3, width - margin, y + 2.3);
    y += 6;
  };
  const detailRow = (label, value) => {
    if (value === null || value === undefined || String(value).trim() === '') return;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(detailFontSize);
    const lines = doc.splitTextToSize(String(value), contentWidth - 39);
    doc.setFont('helvetica', 'bold'); doc.setTextColor(...MUTED); doc.text(`${label}`, margin, y);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...INK); doc.text(lines, margin + 39, y);
    y += Math.max(4.8, lines.length * detailFontSize * 0.49);
  };
  const amountRow = (label, value, { emphasis = false, balance = false } = {}) => {
    if (emphasis || balance) {
      doc.setFillColor(...(balance && amounts.balance > 0 ? [255, 241, 242] : emphasis ? [239, 246, 255] : [236, 253, 245]));
      doc.roundedRect(margin, y - 4.5, contentWidth, 6, 1.2, 1.2, 'F');
    }
    doc.setFontSize(emphasis || balance ? 9.2 : 8.5);
    doc.setFont('helvetica', emphasis || balance ? 'bold' : 'normal');
    doc.setTextColor(...(balance && amounts.balance > 0 ? RED : emphasis ? BLUE : INK));
    doc.text(label, margin + 2, y);
    doc.setFont('helvetica', 'bold'); doc.text(value, width - margin - 2, y, { align: 'right' });
    y += 6.5;
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
  doc.text('REÇU DE PAIEMENT', margin, y);
  y += 5;
  doc.setFontSize(9); doc.setTextColor(...BLUE); doc.text(receipt.receipt_number || '', margin, y); y += 5;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTED);
  doc.text(`Date du paiement : ${receipt.date || ''}`, margin, y);
  doc.text(`Statut : ${receiptStatus(receipt)}`, width - margin, y, { align: 'right' }); y += 4;
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

  y += 4;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...MUTED);
  doc.text('SIGNATURE DU RESPONSABLE', margin, y);
  doc.text('CACHET DU CENTRE', width - margin, y, { align: 'right' });
  doc.setDrawColor(148, 163, 184); doc.setLineWidth(0.25);
  doc.line(margin, y + 15, margin + 48, y + 15); doc.line(width - margin - 48, y + 15, width - margin, y + 15);

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

// Open the exact A5 download in the browser's native PDF viewer. PDF viewers
// isolate their frames, so calling frame.contentWindow.print() is not portable.
export async function printReceiptPDF(receipt) {
  const preview = window.open('about:blank', '_blank');
  if (!preview) throw new Error('Autorisez l’ouverture du PDF ou utilisez le bouton PDF A5.');
  preview.opener = null;
  try {
    const logoData = await loadReceiptLogo();
    const doc = new jsPDF({ unit: 'mm', format: RECEIPT_PAPER_FORMAT, orientation: 'portrait' });
    buildReceiptPDF(doc, receipt, { logoData });
    const url = URL.createObjectURL(doc.output('blob'));
    preview.location.replace(url);
    window.addEventListener('pagehide', () => URL.revokeObjectURL(url), { once: true });
  } catch (error) {
    preview.close();
    throw error;
  }
}
