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

export function paymentErrorMessage(error) {
  const message = String(error?.message || '');
  if (message.startsWith('Idempotency key conflict')) return PAYMENT_IDEMPOTENCY_CONFLICT_MESSAGE;
  return message || 'Impossible d’enregistrer le paiement.';
}

export function receiptServiceDescription(receipt) {
  return receipt?.service_description || (receipt?.legacy ? 'Reçu historique' : '');
}
