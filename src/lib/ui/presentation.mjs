import { PROGRAMME_LABELS } from '../programCatalog.mjs';
// Display only: stored domain values and command eligibility remain domain-owned.
export const TONES = { info: 'bg-blue-50 text-blue-800', success: 'bg-emerald-50 text-emerald-800', warning: 'bg-amber-50 text-amber-900', danger: 'bg-red-50 text-red-800', neutral: 'bg-slate-100 text-slate-700' };
// OD-12 (RWR-r5 §6.4): a learner file without an enrolment reads « Sans inscription »; the stored value stays Prospect.
export const DOSSIER_LABELS = { Enrolled: 'Inscrit', Trial: 'Essai (dossier)', Prospect: 'Sans inscription', Inactive: 'Inactif', Alumni: 'Ancien apprenant' };
// EAP: « Essai (dossier) » stays readable on old files but is no longer a filter choice.
export const DOSSIER_FILTER_STATUSES = ['Enrolled', 'Prospect', 'Alumni', 'Inactive'];
export const ENROLLMENT_LABELS = { Submitted: 'Soumise', 'Under Review': 'En cours d’examen', Trial: 'Essai', Confirmed: 'Inscrit — groupe à affecter', Validated: 'Inscription validée', Rejected: 'Refusée', Ended: 'Terminée' };
export const CHANNEL_LABELS = { manual: 'Saisie manuelle', website: 'Site web', meta_instant_form: 'Meta' };
export function displayLabel(map, value) { return map[value] || 'Non précisé'; }
// RWR-r5 §5.4: a programme code reads in French (the catalogue labels); any other
// value (free text from an old prospect form) is shown as written.
export function programmeLabel(value) { return PROGRAMME_LABELS[value] || value || 'Programme à préciser'; }
// The four stored age categories (students_age_category_check), in French.
export const AGE_CATEGORY_LABELS = { 'Young Learners (6-12)': 'Enfants (6-12 ans)', 'Teens (13-17)': 'Adolescents (13-17 ans)', 'Adults (18+)': 'Adultes (18 ans et plus)', Corporate: 'Entreprise' };
export function ageCategoryLabel(value) { return AGE_CATEGORY_LABELS[value] || value || '—'; }
export function dossierLabel(value) { return DOSSIER_LABELS[value] || value || '—'; }
export function enrollmentLabel(value) { return ENROLLMENT_LABELS[value] || value || '—'; }
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
