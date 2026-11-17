// Groups (« Groupes », Zoom's subsessions) helpers for the room (plan
// online-classroom-tools.md, OCT-r3, PR B).
//
// Facts read in the pinned toolkit bundle (@zoom/videosdk-ui-toolkit 2.5.0-1) and
// observed with Zoom on 2026-11-16:
//   - the toolkit's groups window opens the groups with the SDK call
//     `getSubsessionClient().openSubsessions(list, options)`; the client object is the
//     same one for the whole session, and the toolkit reaches it through the SDK client
//     it exposes as `window.zmClient` (undocumented);
//   - its settings row « Fermer automatiquement les groupes après … minutes » is broken:
//     ticking it only sets `isTimerAutoEnabled`, never `isTimerEnabled`, and Zoom counts
//     down only when `isTimerEnabled` is true, so the groups never close by themselves;
//     and a value typed in the field is passed on as a string, which Zoom does not
//     answer: the open call times out after 10 s, the toolkit swallows the error and its
//     window says « en cours » while nobody was invited. The same code is in 2.6.10-1;
//   - Zoom's timer works when it gets `isTimerEnabled: true` and `timerDuration` as a
//     number of seconds (observed: groups closed at the second asked for).
// Owner decision of 2026-11-16 (OWNER_DECISIONS): the room corrects the options on their
// way to Zoom, so that the D4 rule « always a timer » can be followed. Nothing else of
// the call is touched: not the list of groups, not who is in them, not another option.

// Zoom's own default, in seconds; the toolkit shows it in the field until somebody types.
export const GROUP_TIMER_DEFAULT_SECONDS = 1800;
const MAX_MINUTES = 24 * 60;

// The duration in seconds. A string is what the teacher typed in the field, which the
// toolkit labels « minutes »; a number is a value that came from Zoom, in seconds (its
// default, or what an earlier open of this lesson set). Anything unusable is Zoom's
// default, so a ticked box always gives a timer.
export function groupTimerSeconds(value) {
  if (typeof value === 'string') {
    const minutes = Number(value.trim().replace(',', '.'));
    return Number.isFinite(minutes) && minutes > 0 ? Math.round(Math.min(minutes, MAX_MINUTES) * 60) : GROUP_TIMER_DEFAULT_SECONDS;
  }
  return Number.isFinite(value) && value > 0 ? Math.round(value) : GROUP_TIMER_DEFAULT_SECONDS;
}

// The options as Zoom needs them: the duration always a number of seconds, and the timer
// switched on exactly when the teacher ticked « Fermer automatiquement … ».
export function groupOpenOptions(options) {
  if (!options || typeof options !== 'object') return options;
  return { ...options, timerDuration: groupTimerSeconds(options.timerDuration), isTimerEnabled: options.isTimerAutoEnabled === true };
}

const CORRECTED = Symbol.for('eh.online.groups.corrected');

// Puts the correction on the SDK's subsession client, once per client object. Returns
// true when the client carries it. `onOpen` gets the timer in seconds, or 0 without one.
export function correctGroupTimer(win, onOpen) {
  let client = null;
  try { client = win?.zmClient?.getSubsessionClient?.() || null; } catch { /* client not ready */ }
  if (!client || typeof client.openSubsessions !== 'function') return false;
  if (client[CORRECTED]) return true;
  const open = client.openSubsessions;
  client.openSubsessions = function openSubsessions(list, options, ...rest) {
    const fixed = groupOpenOptions(options);
    try { onOpen?.(fixed?.isTimerEnabled ? fixed.timerDuration : 0); } catch { /* the trace never breaks the call */ }
    return open.call(this, list, fixed, ...rest);
  };
  client[CORRECTED] = true;
  return true;
}
