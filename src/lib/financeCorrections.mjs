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
// Q4 = A: how far back a payment may be dated.
export function paymentBackdateDays(role) {
  return role === 'receptionist' ? 7 : 31;
}

export const LAST_PAYMENT_NOTICE = 'L’inscription restera confirmée. Elle apparaîtra dans « Inscriptions confirmées sans paiement actif » et la conversion CRM sera signalée pour vérification.';
export const CORRECTION_BUSY_MESSAGE = 'Paiement en cours pour cet apprenant : actualisez puis réessayez.';

export function discountReasonLabel(code, text) {
  const label = DISCOUNT_REASONS.find((reason) => reason.code === code)?.label;
  if (!label) return '';
  return code === 'other' && text ? `${label} : ${text}` : label;
}

// Amounts compared in integer centimes, never as floating-point MAD.
function centimes(amount) {
  return Math.round(Number(amount || 0) * 100);
}

// 2026-10-27 → 27/10/2026, as the server writes it in its refusal.
export function frenchDate(isoDate) {
  const [year, month, day] = String(isoDate).split('-');
  return `${day}/${month}/${year}`;
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
  }
  if (payment > 0 && paymentDate) {
    if (paymentDate > today) return `La date du paiement ne peut pas être dans le futur (aujourd’hui à Casablanca : ${frenchDate(today)}).`;
    const days = paymentBackdateDays(role);
    if (paymentDate < addDays(today, -days)) return `La date du paiement ne peut pas être antérieure de plus de ${days} jours.`;
  }
  return null;
}

// EAP (migration 127, D2): any payment confirms the enrollment (Validated once placed).
// Q1 = A: a new tuition charge discounted at 100 % with its reason confirms it without
// a receipt. Mirrors create_charge_payment for the form's wording; the server decides.
export function isFreeEnrollment({ newCharge, sessionType, gross, discount, reasonCode, payment }) {
  return Boolean(newCharge && sessionType && sessionType !== 'Other' && reasonCode && !(Number(payment) > 0)
    && centimes(gross) > 0 && centimes(discount) === centimes(gross));
}

export const ENROLLMENT_CONFIRMED_MESSAGE = 'Paiement enregistré. Inscription confirmée.';
export const GROUP_PENDING_MESSAGE = 'Paiement enregistré. Apprenant inscrit — groupe à affecter.';
export const FREE_ENROLLMENT_MESSAGE = 'Remise de 100 % : inscription confirmée sans paiement (visible dans Contrôles).';

// The receipt page's message after create_charge_payment and, when a group was chosen,
// the placement that follows it (D3). A placement refusal never undoes the payment.
export function paymentResultMessage(result, { placed = false, placementError = '' } = {}) {
  const refused = placementError ? `Groupe non affecté : ${String(placementError).replace(/[.\s]+$/, '')}.` : '';
  if (!result?.receipt_id) {
    if (result?.free_enrollment) return [FREE_ENROLLMENT_MESSAGE, refused].filter(Boolean).join(' ');
    return 'Solde à payer enregistré. Aucun reçu émis.';
  }
  if (result.replayed) return 'Paiement déjà enregistré — reçu existant affiché.';
  if (refused) return `Paiement enregistré. ${refused} Apprenant inscrit — groupe à affecter.`;
  if (placed) return ENROLLMENT_CONFIRMED_MESSAGE;
  if (result.group_pending) return GROUP_PENDING_MESSAGE;
  if (result.enrollment_confirmed) return ENROLLMENT_CONFIRMED_MESSAGE;
  if (result.student_enrolled) return 'Paiement enregistré. Apprenant inscrit.';
  return 'Paiement enregistré et reçu émis.';
}

// The receipt form's enrollment candidates: a retired (pré-inscription, essai, refusée)
// or ended row is history and is never selected for a new payment, unless CRM-linked.
export const RETIRED_ENROLLMENT_STATUSES = ['Submitted', 'Under Review', 'Trial', 'Rejected'];
export function isPayableEnrollmentCandidate(row) {
  return Boolean(row) && (row.crm_linked || !(RETIRED_ENROLLMENT_STATUSES.includes(row.status) || row.status === 'Ended'));
}

// The author roles the director's « Contrôles » lists name.
export const ROLE_LABELS = { director: 'Direction', admin: 'Administration', receptionist: 'Accueil' };

// EAP (D5): why an enrollment is confirmed without any payment, when the academic log
// knows it (get_finance_review_queue, unpaid_never.origin); else an older row.
export function unpaidOriginLabel(origin) {
  const reason = origin?.reason ? ` — ${origin.reason}` : '';
  if (origin?.kind === 'placement_without_enrollment') {
    const role = origin.author_role ? ` (${ROLE_LABELS[origin.author_role] || origin.author_role})` : '';
    return `Affectation sans inscription payée${reason}${role}`;
  }
  if (origin?.kind === 'reopen') return 'Réouverture';
  if (origin?.kind === 'capacity_override') return `Dépassement de capacité${reason}`;
  return 'antérieure à cette version';
}

export const RECEIPT_CHANGED_MESSAGE = 'Le reçu a changé entre-temps : la page est actualisée, vérifiez puis recommencez.';

export function correctionErrorMessage(error, fallback) {
  if (isRecordConflict(error)) return error?.hint === 'finance.receipt_changed' ? RECEIPT_CHANGED_MESSAGE : CORRECTION_BUSY_MESSAGE;
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
