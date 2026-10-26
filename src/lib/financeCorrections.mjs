// Batch E (plan PCR-r2) desk rules and correction messages. The database
// enforces every rule (migration 122); the form mirrors them for messages only.
import { isRecordConflict } from './conflictErrors.mjs';

// Q2 = A: a new discount needs a reason from this list; "Autre" needs text.
export const DISCOUNT_REASONS = [
  { code: 'sibling', label: 'Fratrie' },
  { code: 'former_student', label: 'Ancien élève' },
  { code: 'promotion', label: 'Promotion/offre' },
  { code: 'director_approval', label: 'Accord de la direction' },
  { code: 'other', label: 'Autre' },
];
export const DISCOUNT_REASON_MAX_LENGTH = 200;
// Q3 = B: reception gives at most 10 % without the director.
export const RECEPTION_DISCOUNT_CAP = 0.10;
// Q5 = B: a reception payment confirms an enrollment only from 10 % of the net price.
export const RECEPTION_CONFIRMATION_THRESHOLD = 0.10;
// Q4 = A: how far back a payment may be dated.
export function paymentBackdateDays(role) {
  return role === 'receptionist' ? 7 : 31;
}

export const PENDING_CONFIRMATION_MESSAGE = 'Acompte inférieur à 10 % : reçu émis, inscription en attente de confirmation par la direction.';
export const LAST_PAYMENT_NOTICE = 'L’inscription restera confirmée. Elle apparaîtra dans « Inscriptions confirmées sans paiement actif » et la conversion CRM sera signalée pour vérification.';
export const CORRECTION_BUSY_MESSAGE = 'Paiement en cours pour cet apprenant : actualisez puis réessayez.';

export function discountReasonLabel(code, text) {
  const label = DISCOUNT_REASONS.find((reason) => reason.code === code)?.label;
  if (!label) return '';
  return code === 'other' && text ? `${label} : ${text}` : label;
}

export function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// Same order and words as create_charge_payment_financial; null when nothing to say.
export function deskGuardError({ role, newCharge, gross, discount, reasonCode, reasonText, payment, paymentDate, today }) {
  if (newCharge && discount > 0) {
    if (!reasonCode) return 'Indiquez le motif de la remise.';
    if (!DISCOUNT_REASONS.some((reason) => reason.code === reasonCode)) return 'Motif de remise inconnu.';
    const text = (reasonText || '').trim();
    if (reasonCode === 'other' && text.length < 3) return 'Précisez le motif de la remise « Autre ».';
    if (text.length > DISCOUNT_REASON_MAX_LENGTH) return 'Le motif de la remise ne doit pas dépasser 200 caractères.';
    if (role === 'receptionist' && gross > 0 && discount > RECEPTION_DISCOUNT_CAP * gross) return 'Remise supérieure à 10 % : demandez au directeur.';
  }
  if (payment > 0 && paymentDate) {
    if (paymentDate > today) return 'La date du paiement ne peut pas être dans le futur.';
    const days = paymentBackdateDays(role);
    if (paymentDate < addDays(today, -days)) return `La date du paiement ne peut pas être antérieure de plus de ${days} jours.`;
  }
  return null;
}

// Preview of P3.4: would this reception payment leave the enrollment waiting?
export function receptionConfirmationPending({ role, sessionType, net, paidBefore, payment }) {
  if (role !== 'receptionist' || !(payment > 0) || !sessionType || sessionType === 'Other') return false;
  return paidBefore + payment < RECEPTION_CONFIRMATION_THRESHOLD * net;
}

export function correctionErrorMessage(error, fallback) {
  if (isRecordConflict(error)) return CORRECTION_BUSY_MESSAGE;
  return error?.message || fallback;
}

// Is this receipt the last live payment of a Confirmed or Validated enrollment?
// Read under the director's own access; a failed read shows no notice.
export async function isLastLivePaymentOfConfirmedEnrollment(sb, receipt) {
  if (!receipt?.student_id || receipt.voided_at || receipt.deleted_at) return false;
  let enrollmentId = receipt.enrollment_id;
  if (!enrollmentId && receipt.charge_id) {
    const { data } = await sb.from('charges').select('enrollment_id').eq('id', receipt.charge_id).maybeSingle();
    enrollmentId = data?.enrollment_id;
  }
  if (!enrollmentId) return false;
  const [{ data: enrollment }, { data: charges }] = await Promise.all([
    sb.from('enrollments').select('status').eq('id', enrollmentId).maybeSingle(),
    sb.from('charges').select('id').eq('enrollment_id', enrollmentId),
  ]);
  if (!['Confirmed', 'Validated'].includes(enrollment?.status)) return false;
  const chargeIds = (charges || []).map((charge) => charge.id);
  const linked = chargeIds.length ? `enrollment_id.eq.${enrollmentId},charge_id.in.(${chargeIds.join(',')})` : `enrollment_id.eq.${enrollmentId}`;
  const { count, error } = await sb.from('receipts').select('id', { count: 'exact', head: true })
    .or(linked).neq('id', receipt.id).is('voided_at', null).is('deleted_at', null);
  return !error && count === 0;
}
