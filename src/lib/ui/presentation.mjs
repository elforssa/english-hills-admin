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
// Display clean-ups (CPO-r2). A form answer whose label was never configured carries the
// provider's field name (« program interest », « deplacement centre »): it gets a French
// label here. A label configured in the form mapping is shown as it is.
const plain = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const ANSWER_LABELS = {
  programinterest: 'Programme souhaité', programmeinterest: 'Programme souhaité', program: 'Programme souhaité', programme: 'Programme souhaité',
  programmesouhaite: 'Programme souhaité', interet: 'Programme souhaité', cours: 'Programme souhaité', formation: 'Programme souhaité',
  deplacementcentre: 'Peut se déplacer au centre', deplacementaucentre: 'Peut se déplacer au centre',
  currentlevel: 'Niveau actuel', niveauactuel: 'Niveau actuel', level: 'Niveau actuel', niveau: 'Niveau actuel',
  age: 'Âge', childage: 'Âge de l’enfant', ageenfant: 'Âge de l’enfant', learnerage: 'Âge de l’apprenant',
  childname: 'Nom de l’enfant', nomenfant: 'Nom de l’enfant', learnername: 'Nom de l’apprenant',
  fullname: 'Nom complet', firstname: 'Prénom', lastname: 'Nom', phonenumber: 'Téléphone', phone: 'Téléphone', whatsapp: 'WhatsApp', email: 'E-mail',
  city: 'Ville', ville: 'Ville', quartier: 'Quartier', objectif: 'Objectif', objective: 'Objectif', goal: 'Objectif',
  preferredtime: 'Horaire souhaité', horaire: 'Horaire souhaité', disponibilite: 'Disponibilité', availability: 'Disponibilité',
  message: 'Message', comment: 'Message', commentaire: 'Message'
};
const PROGRAMME_ANSWERS = ['programinterest', 'programmeinterest', 'program', 'programme', 'programmesouhaite', 'interet', 'cours', 'formation'];
export function answerLabel(answer) {
  const key = String(answer?.key ?? ''), label = String(answer?.label ?? '').trim();
  // The intake stores the field name with « _ » and « - » turned into spaces when no label is configured.
  if (label && plain(label) !== plain(key)) return label;
  const text = (label || key).replace(/[_-]+/g, ' ').trim();
  return ANSWER_LABELS[plain(key || label)] || (text ? text.charAt(0).toUpperCase() + text.slice(1) : 'Réponse');
}
export function isProgrammeAnswer(answer) {
  return PROGRAMME_ANSWERS.includes(plain(answer?.key || answer?.label));
}
// When the prospect has no programme of its own but a form answer names one, that answer
// is what the panel shows (the most recent submission that has one).
export function answerProgramme(submissions) {
  for (const submission of [...(Array.isArray(submissions) ? submissions : [])].reverse()) {
    const answer = (submission?.answers || []).find(a => isProgrammeAnswer(a) && answerValue(a).trim() && answerValue(a) !== '—');
    if (answer) return answerValue(answer);
  }
  return null;
}
// « Meta • Anglais enfants » repeats the programme shown beside it: the origin is then
// « Meta ». A source whose second part is something else (a form name) is kept whole.
export function sourceWithoutProgramme(label, ...programmes) {
  const text = String(label ?? ''), at = text.indexOf(' • ');
  if (at < 0) return text;
  const tail = plain(text.slice(at + 3));
  return programmes.some(value => value && plain(value) === tail) ? text.slice(0, at) : text;
}
export function sameText(a, b) {
  return plain(a) === plain(b);
}
// Pick labelled answers in one submission only; never infer identity or combine submissions.
export function inquirySummary(submission) {
  const answers = submission?.answers || [];
  const priority = /âge|age|centre|center|déplac|travel|programme|program|intér[eê]t|interest/i;
  return [...answers.filter(a => priority.test(a.label || '')), ...answers.filter(a => !priority.test(a.label || ''))].slice(0, 3);
}
