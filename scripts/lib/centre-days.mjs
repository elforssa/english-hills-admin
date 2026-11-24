// Weekday-independent dates for the CRM suites (Verify run 45404021587): a date a suite
// types into a form or books is never a fixed « today + N », which lands on the closed
// Sunday or before Monday's opening on some weekdays. The server picks it: the first centre
// date from today + fromDays on which every given hh:mm is inside the current policy's hours
// of that kind (closed dates included), or, with no times, any date with such hours.
//
// CRM_TEST_DAY_SHIFT (default 0) moves the reference day forward by that many days, so a
// weekday sweep (0..6) can run a suite as if on each weekday. Every date built here is at
// least a day ahead, so a forward shift is equivalent to running on that later day.
export const DAY_SHIFT = Number(process.env.CRM_TEST_DAY_SHIFT || 0);
if (!Number.isInteger(DAY_SHIFT) || DAY_SHIFT < 0 || DAY_SHIFT > 6) throw new Error('CRM_TEST_DAY_SHIFT must be 0..6');

const TZ = 'public.centre_utc_offset()';
const at = (date, hhmm) => `((${date})+time '${hhmm}') at time zone ${TZ}`;
const inside = (kind, ts) => `crm_security.window_at(crm_security.current_policy_id(),'${kind}',${ts})=${ts}`;

// A SQL scalar subquery returning the date as 'YYYY-MM-DD'.
export function openDaySql(fromDays, times = [], kind = 'opening') {
  if (!Number.isInteger(fromDays) || fromDays < 1) throw new Error('fromDays must be at least 1');
  for (const t of times) if (!/^\d\d:\d\d$/.test(t)) throw new Error(`bad time ${t}`);
  if (!['opening', 'calling'].includes(kind)) throw new Error(`bad kind ${kind}`);
  const first = `(now() at time zone ${TZ})::date+${fromDays + DAY_SHIFT}`;
  const ok = times.length
    ? times.map(t => inside(kind, at('d.d', t))).join(' and ')
    : `crm_security.window_at(crm_security.current_policy_id(),'${kind}',d.d::timestamp at time zone ${TZ})<(d.d+1)::timestamp at time zone ${TZ}`;
  return `(select d.d::text from (select (${first})+n d from generate_series(0,30) n) d where ${ok} order by d.d limit 1)`;
}

// A SQL timestamptz expression: hh:mm on the first such date (see openDaySql), exactly, never
// clamped — for a suite that later asserts or keeps that time (« Rappel convenu » at 16:00).
export function openSlotSql(fromDays, hhmm, kind = 'opening') {
  return `((${openDaySql(fromDays, [hhmm], kind)})::date+time '${hhmm}') at time zone ${TZ}`;
}
