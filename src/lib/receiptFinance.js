import { centreDate, centreMonthStart } from './centreClock.mjs';

export const PAYMENT_METHODS = ['Espèces', 'Carte bancaire', 'Virement', 'Chèque'];

export function money(value) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat('fr-MA', {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function receiptAmounts(receipt) {
  const gross = Number(receipt.gross_amount_snapshot ?? receipt.montant_total ?? 0);
  const discount = Number(
    receipt.discount_amount_snapshot
      ?? (gross * Number(receipt.remise || 0) / 100),
  );
  const net = Number(receipt.net_amount_snapshot ?? (gross - discount));
  // A void changes live totals, not the immutable amount printed on the
  // historical receipt. charge_balances excludes voided rows separately.
  const payment = Number(receipt.montant_paye || 0);
  const paidBefore = Number(receipt.paid_before_snapshot || 0);
  const balance = Number(
    receipt.balance_after_snapshot
      ?? Math.max(0, net - paidBefore - payment),
  );
  return { gross, discount, net, payment, paidBefore, balance };
}

// Receipts imported on 2026-09-13 have no number until data step D1 (PCR-r2 P2.6).
export const HISTORICAL_RECEIPT_LABEL = 'Reçu historique';

export function receiptNumberLabel(receipt) {
  return receipt?.receipt_number || HISTORICAL_RECEIPT_LABEL;
}

// "En retard" compares the due date with the Casablanca business date, never UTC.
export function receiptStatus(receipt, today = localBusinessDate()) {
  if (receipt.voided_at) return 'Annulé';
  // Issued receipts are historical snapshots; do not reclassify an old receipt
  // when time passes or a later installment changes the live charge.
  if (receipt.statut_paiement) return receipt.statut_paiement;
  const { balance, paidBefore, payment } = receiptAmounts(receipt);
  if (balance <= 0) return 'Soldé';
  if (receipt.due_date && receipt.due_date < today) return 'En retard';
  return paidBefore + payment > 0 ? 'Acompte versé' : 'En attente';
}

// The centre's business day comes from the centre clock (plan AFU-r1, D-TZ = A),
// never from a time-zone table; it matches public.business_date().
export function localBusinessDate(now = new Date()) {
  return centreDate(now);
}

export function businessMonthStart(now = new Date()) {
  return centreMonthStart(now);
}

// Export order: main EH-YYYY- series, then EH-HIST-, then other numbers, then
// unnumbered rows; within a series by numeric suffix as a number, never as text.
export function receiptNumberSortKey(number) {
  const text = String(number || '');
  const main = /^EH-\d{4}-(\d+)$/.exec(text);
  if (main) return [0, Number(main[1]), text];
  const historical = /^EH-HIST-\d{4}-(\d+)$/.exec(text);
  if (historical) return [1, Number(historical[1]), text];
  return text ? [2, 0, text] : [3, 0, ''];
}

export function compareReceiptNumbers(a, b) {
  const left = receiptNumberSortKey(a?.receipt_number);
  const right = receiptNumberSortKey(b?.receipt_number);
  return left[0] - right[0] || left[1] - right[1] || (left[2] < right[2] ? -1 : left[2] > right[2] ? 1 : 0);
}

// One CSV row per receipt. A cancelled receipt stays in the file (audit trail)
// but counts 0 in "Montant reçu", so summing that column gives true collections.
export function financeExportRow(receipt, receiptStatusLabel = receiptStatus(receipt)) {
  const amounts = receiptAmounts(receipt);
  const cancelledAt = receipt.voided_at || receipt.deleted_at || null;
  return {
    'N° reçu': receipt.receipt_number || '',
    Apprenant: receipt.nom_prenom,
    Date: receipt.date,
    Session: receipt.session_type || '',
    'Année scolaire': receipt.school_year_snapshot || '',
    Service: receipt.service_description || '',
    Niveau: receipt.niveau || '',
    'Prix brut': amounts.gross,
    Remise: amounts.discount,
    'Prix net': amounts.net,
    'Payé avant': amounts.paidBefore,
    'Montant reçu': cancelledAt ? 0 : amounts.payment,
    'Montant annulé': cancelledAt ? amounts.payment : 0,
    'Solde après': amounts.balance,
    Mode: receipt.mode_paiement,
    Statut: receiptStatusLabel,
    'Annulé le': cancelledAt ? localBusinessDate(new Date(cancelledAt)) : '',
    "Motif d'annulation": cancelledAt ? receipt.void_reason || '' : '',
    Référence: receipt.transaction_reference || '',
  };
}

export function financeExportRows(receipts, today = localBusinessDate()) {
  return [...receipts].sort(compareReceiptNumbers).map((receipt) => financeExportRow(receipt, receiptStatus(receipt, today)));
}
