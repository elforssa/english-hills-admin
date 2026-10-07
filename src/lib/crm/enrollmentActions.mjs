// RCC-A2 pure enrollment presentation rules. Conversion, linkage and follow-up
// scheduling stay server-authoritative; these only choose labels and bounds.
import { casablancaInstant } from './presentation.mjs';
import { ENROLLMENT_STATUS, PROGRAMS } from './enrollment.mjs';
import { recordHref } from '../navigation.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const casablancaParts = now => Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).map(p => [p.type, p.value]));
// Casablanca civil today, the same calendar the server compares birth dates with.
export function casablancaToday(now = new Date()) {
  const p = casablancaParts(now);
  return `${p.year}-${p.month}-${p.day}`;
}
// Casablanca wall-clock minute, the datetime-local lower bound for a follow-up.
export function casablancaNowInput(now = new Date()) {
  const p = casablancaParts(now);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
export function birthDateReason(value, now = new Date()) {
  if (!value) return null;
  if (!/^\d{4}-\d\d-\d\d$/.test(value)) return 'birth_date_invalid';
  return value > casablancaToday(now) ? 'birth_date_future' : null;
}
// Blocks a past choice before sending; the server still resolves the calling window.
export function followupReason(value, now = new Date()) {
  if (!value) return null;
  try { return Date.parse(casablancaInstant(value)) < now.getTime() ? 'followup_in_past' : null; }
  catch { return 'followup_invalid'; }
}
// Final-submit checks. The birth-date bound always applies, including an uncertain
// replay (its frozen value can only become more valid). Only follow-up futurity,
// which time alone can invalidate, is skipped for an exact same-key replay.
export function submitReason({ birth, due, checkBirth = true, replay = false }, now = new Date()) {
  return (checkBirth ? birthDateReason(birth, now) : null) || (replay ? null : followupReason(due, now));
}

const PRE_CONFIRMATION = ['Submitted', 'Under Review', 'Trial'];
const OPEN_LEAD = ['NEW', 'CONTACTING', 'ENGAGED'];
const CLOSED_LEAD = ['LOST', 'NOT_QUALIFIED'];
// Plan §5 rows 1–10, in priority order: at most one action per state.
export function enrollmentAction({ status, enrollment }) {
  if (!enrollment) {
    if (status === 'QUALIFIED') return { row: 8, action: 'start', note: null };
    if (OPEN_LEAD.includes(status)) return { row: 9, action: null, note: 'Qualifiez le projet avant de commencer une inscription.' };
    if (CLOSED_LEAD.includes(status)) return { row: 10, action: null, note: 'Rouvrez le prospect pour reprendre une inscription.' };
    return { row: 7, action: null, note: 'Statut d’inscription à vérifier par l’administration.' };
  }
  if (['Confirmed', 'Validated'].includes(enrollment.status)) return { row: 1, action: 'open', note: null };
  if (status === 'CONVERTED') return { row: 2, action: 'open', note: 'Cette inscription a changé après sa confirmation. Elle est signalée pour vérification par la direction.' };
  if (PRE_CONFIRMATION.includes(enrollment.status)) {
    if (status === 'QUALIFIED') return { row: 3, action: 'continue', note: 'Pré-inscription en attente de confirmation.' };
    if (OPEN_LEAD.includes(status)) return { row: 4, action: 'open', note: 'Ce prospect a été rouvert. Qualifiez-le à nouveau pour poursuivre l’inscription.' };
    if (CLOSED_LEAD.includes(status)) return { row: 5, action: 'open', note: 'Prospect clôturé : l’inscription reste visible dans le dossier de l’apprenant.' };
  }
  if (enrollment.status === 'Rejected') return { row: 6, action: 'open', note: 'Inscription refusée. Ce prospect reste rattaché à cette inscription ; pour une nouvelle demande, contactez la direction.' };
  return { row: 7, action: 'open', note: 'Statut d’inscription à vérifier par l’administration.' };
}
export function studentHref(enrollment, returnTo) {
  return recordHref(`/students/${enrollment.student_id}`, returnTo);
}
// Continuer lands on the learner file with the CRM-linked enrollment highlighted.
export function continueHref(enrollment, returnTo) {
  return recordHref(`/students/${enrollment.student_id}?enrollment=${enrollment.id}`, returnTo);
}
export function enrollmentParam(value) {
  return typeof value === 'string' && UUID.test(value) ? value.toLowerCase() : null;
}

const civil = value => {
  const day = /^(\d{4})-(\d\d)-(\d\d)$/.exec(value?.local_date || ''), time = /^(\d\d:\d\d)/.exec(value?.local_time || '');
  return day && time ? { date: `${day[3]}/${day[2]}/${day[1]}`, time: time[1] } : null;
};
export function followupNotice(task) {
  const at = civil(task);
  return at ? `Un suivi d’inscription est déjà prévu le ${at.date} à ${at.time}. Il est conservé.` : 'Un suivi d’inscription est déjà prévu. Il est conservé.';
}
const CREATED = { Submitted: 'Pré-inscription créée', Trial: 'Essai démarré' };
// origin 'request' covers this dialog's own success, including its same-key replay;
// 'discovered' is a refetch that found another request's or actor's enrollment.
// linkedExisting: this request linked an enrollment that already existed (owner
// wording amendment, 2026-10-07): never a creation heading for it.
export function enrollmentSuccess(result, origin, { linkedExisting = false } = {}) {
  const enrollment = result.enrollment, converted = result.lead?.status === 'CONVERTED';
  const learner = [enrollment.student_name, PROGRAMS[enrollment.session_type] || 'Programme à préciser', enrollment.school_year].filter(Boolean).join(' · ');
  if (origin === 'discovered') return { heading: 'Inscription déjà rattachée', intro: 'Une inscription a été rattachée à ce prospect entre-temps. Vérifiez-la avant de poursuivre.',
    status: ENROLLMENT_STATUS[enrollment.status] || 'Statut à vérifier', learner, lead: null, followup: converted ? null : 'Le suivi d’inscription apparaît dans Prochaine action.' };
  const followup = result.enrollment_followup, at = civil(followup);
  const confirmedLink = ['Confirmed', 'Validated'].includes(enrollment.status) ? 'Inscription confirmée rattachée' : 'Inscription rattachée';
  return { heading: linkedExisting ? confirmedLink : CREATED[enrollment.status] || confirmedLink, intro: null, status: null, learner,
    lead: converted ? 'La confirmation de l’inscription a été vérifiée. Le suivi commercial est terminé.' : 'Le prospect reste qualifié : l’inscription n’est pas encore confirmée. Elle reste à confirmer par le parcours habituel.',
    followup: converted ? null : !at ? 'Le suivi d’inscription apparaît dans Prochaine action.'
      : followup.created ? `Suivi « Finaliser l’inscription » prévu le ${at.date} à ${at.time}.` : `Le suivi d’inscription déjà prévu est conservé : ${at.date} à ${at.time}.` };
}
