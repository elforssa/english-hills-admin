// One payment panel, one rule (RWR-r5 PR C1, plan §6.1). Pure helpers shared by
// « Encaisser » (ReceiptForm) and « Inscrire et encaisser » (CrmEnrollmentDialog). The
// server decides every amount and refusal; these helpers only choose what the panel shows
// first and word the errors before submit, all at once.
import { DISCOUNT_REASONS, DISCOUNT_REASON_MAX_LENGTH } from '../financeCorrections.mjs';

const cents = value => Math.round(Number(value || 0) * 100);
// As receiptFinance.money: no decimals for a whole amount, two otherwise.
export const mad = value => { const n = Number(value || 0);
  return `${new Intl.NumberFormat('fr-MA', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 }).format(n)} MAD`; };
export const PAYMENT_REQUIRED = 'L’inscription se confirme à l’encaissement : saisissez un paiement.';

// A charge reserved without payment for a prospect still open in the CRM (OD-2 = A) is
// collected from that prospect's card, so the payment converts the prospect (ADR-015).
export const reservedForProspect = row => Boolean(row?.reserved_lead_id);

// get_open_balances rows come oldest first. « Encaisser » opens on the oldest open balance
// the screen can collect, else on « Nouvelle inscription » (null).
export function defaultOpenBalance(rows = []) {
  return rows.find(row => !reservedForProspect(row) && cents(row.balance) > 0) || null;
}

// « Encaisser sur cet engagement » (wizard): an unlinked live commitment of the learner for
// the same programme and year — the server refuses a second tuition charge next to it.
export function unlinkedCommitments(rows = [], { sessionType, schoolYear } = {}) {
  return rows.filter(row => !row.enrollment_id && !row.legacy && row.session_type === sessionType
    && (row.school_year || '') === (schoolYear || ''));
}

export function balanceLine(row) {
  const what = [row.session_type === 'Legacy' ? 'Ancien solde' : row.session_type, row.school_year].filter(Boolean).join(' · ');
  return `${what} · reste ${mad(row.balance)}`;
}

// Net, already paid, paid today and what stays open, for an existing charge or new terms.
export function paymentAmounts({ charge = null, gross = 0, discount = 0, payment = 0 } = {}) {
  const net = charge ? cents(charge.net_amount) : Math.max(0, cents(gross) - cents(discount));
  const paidBefore = charge ? cents(charge.paid_amount) : 0;
  const today = cents(payment);
  const open = Math.max(0, net - paidBefore);
  return { net: net / 100, paidBefore: paidBefore / 100, today: today / 100, open: open / 100,
    balanceAfter: Math.max(0, open - today) / 100 };
}

// Every error of the payment part at once (§6.1 wizard fix), in the panel's order.
// mode: 'pay' (a receipt today) | 'reserve' (« Réserver sans paiement », a due date, no receipt).
export function paymentErrors({ mode = 'pay', newCharge = true, gross, discount, reasonCode, reasonText, payment,
  paymentMethod, dueDate, open, today, freeAllowed = true } = {}) {
  const errors = [];
  const g = Number(gross), d = Number(discount || 0), p = Number(payment || 0);
  if (newCharge) {
    if (gross === '' || gross == null || !Number.isFinite(g) || g < 0) errors.push('Indiquez le prix brut convenu.');
    if (!Number.isFinite(d) || d < 0) errors.push('La remise ne peut pas être négative.');
    else if (Number.isFinite(g) && cents(d) > cents(g)) errors.push('La remise dépasse le prix.');
    if (d > 0) {
      if (!reasonCode) errors.push('Indiquez le motif de la remise.');
      else if (!DISCOUNT_REASONS.some(reason => reason.code === reasonCode)) errors.push('Motif de remise inconnu.');
      else if (reasonCode === 'other' && (reasonText || '').trim().length < 3) errors.push('Précisez le motif de la remise « Autre ».');
      if ((reasonText || '').trim().length > DISCOUNT_REASON_MAX_LENGTH) errors.push('Le motif de la remise ne doit pas dépasser 200 caractères.');
    }
  }
  if (mode === 'reserve') {
    if (newCharge && Number.isFinite(g) && g > 0 && cents(d) === cents(g)) errors.push('Une remise de 100 % confirme l’inscription : utilisez « Inscrire et encaisser ».');
    if (newCharge && Number.isFinite(g) && g <= 0) errors.push('Indiquez un prix supérieur à zéro pour réserver.');
    if (!dueDate) errors.push('Indiquez la date d’échéance de l’acompte.');
    else if (today && dueDate < today) errors.push('L’échéance ne peut pas être dans le passé.');
    return errors;
  }
  const free = newCharge && freeAllowed && Number.isFinite(g) && g > 0 && cents(d) === cents(g) && Boolean(reasonCode);
  if (!Number.isFinite(p) || p < 0) errors.push('Le paiement ne peut pas être négatif.');
  else if (p === 0 && !free) errors.push(PAYMENT_REQUIRED);
  else {
    // A new charge's limit is its net price; an existing one's is its open balance.
    const limit = open ?? (newCharge && Number.isFinite(g) && Number.isFinite(d) ? Math.max(0, cents(g) - cents(d)) / 100 : null);
    if (limit != null && cents(p) > cents(limit)) errors.push(newCharge ? `Le paiement dépasse le prix net de ${mad(limit)}.` : `Le paiement dépasse le solde de ${mad(limit)}.`);
  }
  if (p > 0 && !paymentMethod) errors.push('Choisissez le mode de paiement.');
  return errors;
}

// The §6.1 duplicate rule, as find_duplicate_receipts applies it (the panel shows the
// server's rows; this mirror documents and unit-tests the rule): same learner, amount, day
// and charge, or any receipt by the same staff member for the learner within 2 minutes.
export const DUPLICATE_WINDOW_MS = 2 * 60 * 1000;
export function duplicateRule(receipt, { studentId, chargeId, amount, date, actorId, now = Date.now() }) {
  if (!receipt || receipt.student_id !== studentId || receipt.voided_at || receipt.deleted_at) return null;
  if (chargeId && receipt.charge_id === chargeId && cents(receipt.montant_paye) === cents(amount) && receipt.date === date) return 'same_charge';
  if (actorId && receipt.actor_id === actorId && now - Date.parse(receipt.created_at) <= DUPLICATE_WINDOW_MS) return 'recent_by_you';
  return null;
}

export function duplicateLine(row) {
  const number = row.receipt_number ? `Reçu N° ${row.receipt_number}` : 'Reçu';
  const day = row.date ? String(row.date).split('-').reverse().join('/') : '';
  return [number, day, mad(row.amount), row.service_description].filter(Boolean).join(' · ');
}

export const DUPLICATE_REASON = {
  same_charge: 'Même apprenant, même montant, même jour et même engagement.',
  recent_by_you: 'Vous avez enregistré un reçu pour cet apprenant il y a moins de 2 minutes.',
};

// Read before saving; a lookup failure never blocks the payment (the server's idempotency
// key still prevents a double submit).
export async function fetchDuplicates(client, { studentId, chargeId, amount, date }) {
  if (!studentId || !(Number(amount) > 0)) return [];
  try {
    const { data, error } = await client.rpc('find_duplicate_receipts', {
      p_student: studentId, p_charge: chargeId || null, p_amount: Number(amount), p_date: date,
    });
    return error ? [] : (data || []);
  } catch {
    return [];
  }
}
