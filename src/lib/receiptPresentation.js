export const SCHOOL_YEAR_OPTIONS = ['2026/2027'];
export const DEFAULT_SCHOOL_YEAR = SCHOOL_YEAR_OPTIONS[0];
export const RECEIPT_PAPER_FORMAT = 'a5';

export function buildServiceDescription({ sessionType, planType, schoolYear, serviceDetail }) {
  const session = String(sessionType || '').trim();
  const year = String(schoolYear || '').trim();
  if (!session || !year) return '';
  if (session === 'Other') return ['Autre', String(serviceDetail || '').trim(), year].filter(Boolean).join(' · ');
  return [session, session === 'Yearly' ? (planType || 'Standard') : '', year].filter(Boolean).join(' · ');
}

export function receiptSchoolYear(receipt) {
  return receipt?.school_year_snapshot || receipt?.school_year || '';
}

export function receiptServiceSummary(receipt) {
  const parts = [receipt?.session_type || 'Historique'];
  if (receipt?.session_type === 'Yearly' && receipt?.plan_type) parts.push(receipt.plan_type);
  const year = receiptSchoolYear(receipt);
  if (year) parts.push(year);
  return parts.join(' · ');
}

export function receiptServiceDescription(receipt) {
  return receipt?.service_description || (receipt?.legacy ? 'Reçu historique' : '');
}
