import { isRecordConflict } from './conflictErrors.mjs';

export const SCHOOL_YEAR_START_MONTH = 9;
const schoolClock = new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Casablanca', year: 'numeric', month: 'numeric' });
const schoolDateParts = Object.fromEntries(schoolClock.formatToParts(new Date()).map(part => [part.type, part.value]));
const currentSchoolYearStart = Number(schoolDateParts.year) - (Number(schoolDateParts.month) < SCHOOL_YEAR_START_MONTH ? 1 : 0);
export const SCHOOL_YEAR_OPTIONS = [-1, 0, 1].map(offset => {
  const start = currentSchoolYearStart + offset;
  return `${start}/${start + 1}`;
});
export const DEFAULT_SCHOOL_YEAR = SCHOOL_YEAR_OPTIONS[1];
export const RECEIPT_PAPER_FORMAT = 'a5';

export function buildServiceDescription({ sessionType, schoolYear, serviceDetail }) {
  const session = String(sessionType || '').trim();
  const year = String(schoolYear || '').trim();
  if (!session || !year) return '';
  if (session === 'Other') return ['Autre', String(serviceDetail || '').trim(), year].filter(Boolean).join(' · ');
  return [session, year].join(' · ');
}

export function receiptSchoolYear(receipt) {
  return receipt?.school_year_snapshot || receipt?.school_year || '';
}

export function receiptServiceSummary(receipt) {
  const parts = [receipt?.session_type || 'Historique'];
  const year = receiptSchoolYear(receipt);
  if (year) parts.push(year);
  return parts.join(' · ');
}

// Any idempotency conflict (owner decision Q7) gets one receptionist-facing message.
export const PAYMENT_IDEMPOTENCY_CONFLICT_MESSAGE = "Ce paiement a peut-être déjà été enregistré. Ne le saisissez pas une deuxième fois : ouvrez la liste des reçus de l'élève et vérifiez d'abord.";

const PAYMENT_BUSY_SERVER_MESSAGE = 'Inscription ou paiement en cours. Actualisez les inscriptions puis réessayez.';
export const PAYMENT_BUSY_MESSAGE = 'Un paiement ou une inscription est en cours pour cet apprenant. Actualisez puis réessayez.';

export function paymentErrorMessage(error) {
  const message = String(error?.message || '');
  if (message.startsWith('Idempotency key conflict')) return PAYMENT_IDEMPOTENCY_CONFLICT_MESSAGE;
  // A record conflict (PT409, ADR-009) stored nothing: the known busy text is
  // already French; any other conflict gets the same busy guidance.
  if (isRecordConflict(error) && message !== PAYMENT_BUSY_SERVER_MESSAGE) return PAYMENT_BUSY_MESSAGE;
  return message || 'Impossible d’enregistrer le paiement.';
}

export function receiptServiceDescription(receipt) {
  return receipt?.service_description || (receipt?.legacy || receipt?.is_legacy ? 'Reçu historique' : '');
}
