// The room's own pass while the participant is in the room (plan online-room-reliability.md,
// ORR-r2, section 1, « reliability PR »). Provider-neutral: it knows passes and the two
// RPCs, never a Zoom field (N5); the Zoom-specific marker and sweep live in the Zoom room
// module (zoom-room-session.mjs, zoom-room-leftovers.mjs).
//
//   - Once the provider reports the page inside the room (`joined()`), the page calls
//     `online_confirm_pass(pass)` at once (N7): only then are the person's older passes
//     superseded, so a device that never reaches the room takes nothing from the device
//     that works (B2). If the call fails (network, timeout, 5xx), the page stays in the room,
//     supersedes nothing and tries again at the next 10-second round until it gets an
//     answer, then acts on it (binding note 3).
//   - Every 10 s otherwise, `online_check_pass(pass)` in place of the 30-second
//     `online_check_join`; a failed read keeps the room (the pass still expires).
//   - `checkNow()` (a newer device's marker) runs the check at once, at most once per
//     `gapMs`, with one trailing run for a burst. The marker decides nothing: the answer does.
//   - Outcomes: `superseded` → the card with « Utiliser cet appareil » (no automatic
//     retry, so two devices cannot take the room from each other in a loop); a revoked
//     pass or a lesson the person no longer qualifies for → `left` with its reason, as
//     the 30-second check did.
// Nothing here logs a pass id, a name or a token: the trace says states only.
import { ONLINE_REASON_TEXT } from './reasons.mjs';

export const PASS_INTERVAL_MS = 10000;
export const PASS_GAP_MS = 2000;

export const ROOM_PASS_TEXT = Object.freeze({
  superseded: ONLINE_REASON_TEXT.superseded,
  useThisDevice: 'Utiliser cet appareil',
  tookOver: label => `Vous avez pris la place de ${label} dans ce cours : son autre connexion a été fermée.`,
  removed: 'L’enseignant vous a retiré du cours.',
  rejoin: 'Rejoindre',
  ended: 'L’enseignant a terminé le cours pour tous.',
  quit: 'Quitter',
});

// What an answer of online_check_pass / online_confirm_pass means for the page:
// { kind: 'stay' } | { kind: 'superseded' } | { kind: 'left', reason }.
export function passOutcome(answer) {
  if (!answer || typeof answer !== 'object') return { kind: 'stay' };
  if (answer.superseded === true) return { kind: 'superseded' };
  if (answer.ok !== true) return { kind: 'left', reason: typeof answer.reason === 'string' && answer.reason ? answer.reason : 'pass_invalid' };
  if (answer.revoked === true) return { kind: 'left', reason: 'pass_invalid' };
  return { kind: 'stay' };
}

// The page's answer to a room closed by the host (N6). `closed` is the provider-neutral
// reason the room module reports: 'removed' (« Retirer »), 'ended' (« Terminer pour
// tous »), or anything else (today's handling). `check` reads the pass once, for a
// removal only: a removal that follows a newer device's confirmation is that device's
// card; a revoked pass keeps its own text; otherwise the removed text with « Rejoindre »
// (a removal by hand is not a ban: a new pass is a new identity). A failed read is the
// removed text. Returns { kind: 'ended' } | { kind: 'removed' } | { kind: 'superseded' }
// | { kind: 'left', reason } | { kind: 'portal' }.
export async function closedOutcome(closed, check) {
  if (closed === 'ended') return { kind: 'ended' };
  if (closed !== 'removed') return { kind: 'portal' };
  let answer = null;
  try { answer = await check(); } catch { return { kind: 'removed' }; }
  const outcome = passOutcome(answer);
  return outcome.kind === 'stay' ? { kind: 'removed' } : outcome;
}

export function createPassWatcher({ pass, rpc, onOutcome = () => {}, onTookOver = () => {}, onSupersededOthers = () => {}, log = () => {},
  intervalMs = PASS_INTERVAL_MS, gapMs = PASS_GAP_MS, now = () => Date.now(), timers = globalThis }) {
  const s = { stopped: false, joined: false, confirmed: false, busy: false, again: false, lastCheck: -Infinity, trailing: null, interval: null, ended: false };

  const finish = outcome => {
    if (s.stopped || s.ended || outcome.kind === 'stay') return;
    s.ended = true;
    log('pass', { state: outcome.kind, reason: outcome.reason });
    stop();
    onOutcome(outcome);
  };

  async function round() {
    if (s.stopped) return;
    if (s.busy) { s.again = true; return; }
    s.busy = true;
    try {
      if (s.joined && !s.confirmed) {
        let answer;
        try { answer = await rpc('online_confirm_pass', { p_jti: pass }); }
        catch { log('pass confirm', { state: 'failed' }); return; }
        if (s.stopped) return;
        s.confirmed = true;
        const outcome = passOutcome(answer);
        log('pass confirm', { state: outcome.kind === 'stay' ? 'ok' : outcome.kind, others: Number(answer?.superseded_others) || undefined });
        if (outcome.kind !== 'stay') { finish(outcome); return; }
        if (Number(answer?.superseded_others) > 0) { try { onSupersededOthers(); } catch { /* never breaks the room */ } }
        if (answer?.took_over_other_account === true) { try { onTookOver(); } catch { /* never breaks the room */ } }
        return;
      }
      s.lastCheck = now();
      let answer;
      try { answer = await rpc('online_check_pass', { p_jti: pass }); }
      catch { return; }
      finish(passOutcome(answer));
    } finally {
      s.busy = false;
      if (s.again && !s.stopped) { s.again = false; round(); }
    }
  }

  function stop() {
    s.stopped = true;
    if (s.interval) { timers.clearInterval(s.interval); s.interval = null; }
    if (s.trailing) { timers.clearTimeout(s.trailing); s.trailing = null; }
  }

  s.interval = timers.setInterval(round, intervalMs);

  return {
    // The provider says the page is inside the room. Repeated calls (a group move,
    // a reconnection) do nothing more than the first.
    joined() {
      if (s.stopped || s.joined) return;
      s.joined = true;
      round();
    },
    // A newer device's marker: check now, at most once per `gapMs`, one trailing run.
    checkNow() {
      if (s.stopped || !s.confirmed || s.trailing) return;
      const wait = s.lastCheck + gapMs - now();
      if (wait <= 0) round();
      else s.trailing = timers.setTimeout(() => { s.trailing = null; round(); }, wait);
    },
    stop,
    get confirmed() { return s.confirmed; },
  };
}
