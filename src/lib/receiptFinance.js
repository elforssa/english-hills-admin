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
  const payment = receipt.voided_at ? 0 : Number(receipt.montant_paye || 0);
  const paidBefore = Number(receipt.paid_before_snapshot || 0);
  const balance = Number(
    receipt.balance_after_snapshot
      ?? Math.max(0, net - paidBefore - payment),
  );
  return { gross, discount, net, payment, paidBefore, balance };
}

export function receiptStatus(receipt) {
  if (receipt.voided_at) return 'Annulé';
  // Issued receipts are historical snapshots; do not reclassify an old receipt
  // when time passes or a later installment changes the live charge.
  if (receipt.statut_paiement) return receipt.statut_paiement;
  const { balance, paidBefore, payment } = receiptAmounts(receipt);
  if (balance <= 0) return 'Soldé';
  if (receipt.due_date && receipt.due_date < new Date().toISOString().slice(0, 10)) return 'En retard';
  return paidBefore + payment > 0 ? 'Acompte versé' : 'En attente';
}

export function localBusinessDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}
