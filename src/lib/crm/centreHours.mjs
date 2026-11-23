// RWR-r5 §4.5 « Horaires du centre »: the editable draft, its checks (as the
// server's validate_policy and validate_hours_set) and the publish payload.
export const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const TIME = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

// The published hours as an editable draft: seven weekdays (ISO 1–7), each a list
// of [start, end] windows, and the closed dates.
export function draftFrom(hours) {
  const week = {};
  for (let d = 1; d <= 7; d += 1) week[d] = (hours?.calling_hours?.[d] || []).map(([start, end]) => ({ start, end }));
  return { week, closed: [...(hours?.closed_dates || [])].sort() };
}

// Checks the draft the way the server does (validate_policy, validate_hours_set),
// so the director sees the problem before publishing.
export function hoursDraftProblem(draft) {
  let any = false;
  for (let d = 1; d <= 7; d += 1) {
    let previous = null;
    for (const { start, end } of draft.week[d]) {
      if (!TIME.test(start) || !TIME.test(end) || start >= end) return `${DAYS[d - 1]} : chaque plage commence avant de finir.`;
      if (previous && start < previous) return `${DAYS[d - 1]} : les plages se chevauchent ou ne sont pas dans l’ordre.`;
      previous = end; any = true;
    }
  }
  if (!any) return 'Ajoutez au moins une plage horaire.';
  if (draft.closed.some(date => !/^\d{4}-\d{2}-\d{2}$/.test(date))) return 'Date de fermeture invalide.';
  return null;
}

// One version of the hours is current; publishing makes a new one (§4.5). The
// cadence of the follow-up (attempt offsets, gap, SLAs) is copied unchanged.
export function hoursPayload(draft, hours) {
  const weekly = {};
  for (let d = 1; d <= 7; d += 1) weekly[d] = draft.week[d].map(({ start, end }) => [start, end]);
  return {
    weekly_hours: weekly, opening_hours: null, date_exceptions: [...new Set(draft.closed)].sort(),
    attempt_offsets: hours.attempt_offsets, minimum_attempt_gap_minutes: hours.minimum_attempt_gap_minutes,
    first_contact_sla_minutes: hours.first_contact_sla_minutes, post_test_sla_minutes: hours.post_test_sla_minutes,
    stale_contacting_minutes: hours.stale_contacting_minutes
  };
}
