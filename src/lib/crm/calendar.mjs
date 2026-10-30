// Civil-date navigation for a requested agenda range, never CRM scheduling.
import { centreDate } from '../centreClock.mjs';
export function calendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value ? value : null;
}
export function shiftCalendarDate(value,days) {
  if (!calendarDate(value)) return null;
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate()+days);
  return date.toISOString().slice(0,10);
}
// Today on the centre's clock (centreClock.mjs).
export function casablancaToday() {
  return centreDate();
}
export function agendaDateLabel(value) {
  return new Intl.DateTimeFormat('fr-FR',{timeZone:'UTC',weekday:'long',day:'numeric',month:'long'}).format(new Date(`${value}T12:00:00Z`));
}
