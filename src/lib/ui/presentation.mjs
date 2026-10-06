// Display only: stored domain values and command eligibility remain domain-owned.
export const TONES = { info: 'bg-blue-50 text-blue-800', success: 'bg-emerald-50 text-emerald-800', warning: 'bg-amber-50 text-amber-900', danger: 'bg-red-50 text-red-800', neutral: 'bg-slate-100 text-slate-700' };
export const DOSSIER_LABELS = { Enrolled: 'Inscrit (dossier)', Trial: 'Essai (dossier)', Prospect: 'Prospect', Inactive: 'Inactif', Alumni: 'Ancien apprenant' };
export const ENROLLMENT_LABELS = { Submitted: 'Soumise', 'Under Review': 'En cours d’examen', Trial: 'Essai', Confirmed: 'Inscrit — groupe à affecter', Validated: 'Inscription validée', Rejected: 'Refusée' };
export const CHANNEL_LABELS = { manual: 'Saisie manuelle', website: 'Site web', meta_instant_form: 'Meta' };
export function displayLabel(map, value) { return map[value] || 'Non précisé'; }
export function programmeLabel(value) { return value === 'Yearly' ? 'Programme annuel' : value || 'Programme à préciser'; }
export function queryReadState(query, { empty = false, filtered = false, unavailable = false } = {}) {
  const hasData = query.data !== undefined && query.data !== null;
  if (query.isPending && !hasData) return 'loading';
  if (query.isError) return hasData ? 'stale' : 'error';
  if (unavailable || !hasData) return 'unavailable';
  if (query.isFetching) return 'refreshing';
  if (empty) return filtered ? 'filtered-empty' : 'empty';
  return 'ready';
}
export function answerValue(answer) {
  const value = answer.display_value ?? answer.value;
  const label = item => typeof item === 'boolean' ? item ? 'Oui' : 'Non' : String(item ?? '—');
  return Array.isArray(value) ? value.map(label).join(' · ') : label(value);
}
// Pick labelled answers in one submission only; never infer identity or combine submissions.
export function inquirySummary(submission) {
  const answers = submission?.answers || [];
  const priority = /âge|age|centre|center|déplac|travel|programme|program|intér[eê]t|interest/i;
  return [...answers.filter(a => priority.test(a.label || '')), ...answers.filter(a => !priority.test(a.label || ''))].slice(0, 3);
}
