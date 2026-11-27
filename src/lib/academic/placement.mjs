// RWR-r5 §6.2 (migration 141): a learner's own level test, the client side of
// book_student_placement_test and update_placement_test_result. The server holds every
// rule; these helpers only decide what a form offers and how a refusal reads.
import { CENTRE_UTC_OFFSET_MINUTES, centreDate } from '../centreClock.mjs';
import { getLevelsForSession } from '../programCatalog.mjs';
import { programmeAllowsAge } from './learnerRules.mjs';

const TIME = /^([01]?\d|2[0-3])[:h]([0-5]\d)/;

// The instant a test starts (academic_security.test_starts): its date at its time, the
// date at midnight when no time was written (old rows).
export function testStarts(test) {
  if (!/^\d{4}-\d\d-\d\d$/.test(test?.date_test || '')) return null;
  const match = TIME.exec(String(test.heure || '').trim());
  const [h, m] = match ? [Number(match[1]), Number(match[2])] : [0, 0];
  const wall = Date.parse(`${test.date_test}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`);
  return Number.isFinite(wall) ? new Date(wall - CENTRE_UTC_OFFSET_MINUTES * 60_000) : null;
}

export function testStarted(test, now = new Date()) {
  const starts = testStarts(test);
  return !!starts && starts.getTime() <= new Date(now).getTime();
}

// « Passé » is derived (§6.2): a planned test whose time has come reads « Passé » until
// its result, « Absent » or « Annulé » is saved. The stored status stays « Planifié ».
export function displayStatus(test, now = new Date()) {
  return test?.status === 'Planifié' && testStarted(test, now) ? 'Passé' : test?.status || '';
}

// What a learner's test can do now (the server refuses everything else):
//  - move (date, time): planned and not yet started;
//  - cancel (with a reason): planned;
//  - absent, result: planned or « Passé », once started; a result can be corrected later.
export function studentTestActions(test, now = new Date()) {
  const planned = test?.status === 'Planifié';
  const started = testStarted(test, now);
  const withResult = ['Résultat saisi', 'Affecté'].includes(test?.status);
  return {
    move: planned && !started,
    cancel: planned,
    absent: (planned || test?.status === 'Passé') && started,
    result: ((planned || test?.status === 'Passé') && started) || withResult,
  };
}

// The levels a result may recommend: the learner's programme levels (programme_levels),
// none when the learner's age is outside the programme's audience. The current value
// stays shown so an old row is never silently changed.
export function levelsForTest(programme, age, current = '') {
  const levels = programmeAllowsAge(programme || 'Yearly', age) ? getLevelsForSession(programme || 'Yearly') : [];
  return current && !levels.includes(current) ? [current, ...levels] : levels;
}

// The changes an edit sends (only what differs from the row as read).
export function testChanges(before, form) {
  const out = {};
  const norm = v => (v === undefined || v === null ? '' : String(v).trim());
  for (const key of ['date_test', 'heure', 'examinateur', 'notes', 'status', 'niveau_recommande', 'groupe_affecte_id']) {
    if (key in form && norm(form[key]) !== norm(before?.[key])) out[key] = norm(form[key]) === '' ? null : norm(form[key]);
  }
  if ('score' in form && norm(form.score) !== norm(before?.score)) out.score = norm(form.score) === '' ? null : Number(form.score);
  if (out.status === 'Annulé') out.cancel_reason = norm(form.cancel_reason);
  return out;
}

export const PLACEMENT_MESSAGES = {
  'placement.invalid': 'Vérifiez les informations du test.',
  'placement.time_required': 'Indiquez l’heure du test.',
  'placement.student_unavailable': 'Cet apprenant n’est plus disponible.',
  'placement.future_required': 'Choisissez une date et une heure à venir.',
  'placement.crm_use_prospect': 'Ce test appartient à un prospect : modifiez-le depuis sa fiche.',
  'placement.passe_derived': '« Passé » s’affiche une fois l’heure passée : saisissez le résultat ou « Absent ».',
  'placement.not_replannable': 'Ce test n’est plus planifié : planifiez un nouveau test.',
  'placement.not_planned': 'Seul un test planifié peut être déplacé, annulé ou noté absent.',
  'placement.no_prefilled_result': 'Un test sans résultat n’a ni niveau ni score.',
  'placement.level_required': 'Choisissez le niveau recommandé.',
  'placement.level_not_offered': 'Ce niveau ne correspond pas au programme ou à l’âge de l’apprenant.',
  'placement.group_unavailable': 'Groupe indisponible.',
  'placement.cancel_reason_required': 'Indiquez le motif de l’annulation.',
  'placement.result_before_start': 'Le résultat se saisit après l’heure du test.',
  'placement.already_planned': 'Un test est déjà planifié pour cette personne : ouvrez-le pour le déplacer.',
  'crm_hours.outside_opening': 'Cet horaire est en dehors des heures d’ouverture du centre.',
  'crm_next_action.overlap': 'Cette personne a déjà un rendez-vous ou un test à cette heure.',
};

export function placementError(error) {
  if (PLACEMENT_MESSAGES[error?.hint]) return PLACEMENT_MESSAGES[error.hint];
  if (error?.code === 'PT409') return 'Ce test a été modifié entre-temps. Rechargez puis réessayez.';
  if (error?.code === '23505') return 'Ce test a déjà été enregistré. Rechargez la liste.';
  if (error?.code === '42501') return 'Vous n’avez pas accès à cette action.';
  if (error instanceof Error && !error.code && error.message) return error.message;
  return 'Enregistrement impossible. Réessayez.';
}

// The default date offered for a new booking: tomorrow (a test is booked ahead).
export function defaultTestDate(now = new Date()) {
  return centreDate(new Date(new Date(now).getTime() + 86_400_000));
}
