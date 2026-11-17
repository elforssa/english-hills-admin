// The teacher's page removes leftover connections (plan online-room-reliability.md,
// ORR-r2, section 1 point 7, decisions D3 and D4, finding B1). A page that cannot run
// cannot leave: a closed laptop or a phone without network stays in Zoom's list. The
// teacher's page, once connected with the host role, asks the database for the ids of
// the lesson's superseded and revoked passes (`online_list_room_leftovers`: ids only,
// never a reason or a name, and only to the lesson's teacher holding a current host
// pass) and removes every participant whose Zoom `userKey` is one of them.
//
// Facts (@zoom/videosdk-ui-toolkit 2.5.0-1 and @zoom/videosdk 2.6.0; asserted by
// scripts/check-zoom-toolkit-facts.mjs):
//   - the token's `user_key` claim (the pass id) reaches every participant's list entry
//     as `userKey` (the bundle maps the server field `userIdentity` to `userKey`);
//   - the participant field `userIdentity` is marked deprecated in the typings: it is
//     never read here (B1);
//   - `removeUser(userId)` exists on the client and only a host or a manager may call it.
//
// When: at the join (`connected`), on every `user-added` (coalesced) and every
// `everyMs`. If the list cannot be read (not the host, network) or Zoom refuses a removal,
// nothing else happens and the next round tries again. One trace line per removal, with
// the display label only.

export const LEFTOVER_EVERY_MS = 20000;
export const LEFTOVER_COALESCE_MS = 1000;
const MAX_IDS = 500;
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function createLeftoverSweep({ win, listLeftovers, log = () => {}, everyMs = LEFTOVER_EVERY_MS, coalesceMs = LEFTOVER_COALESCE_MS, timers = globalThis }) {
  const s = { stopped: false, started: false, busy: false, again: false, interval: null, soon: null };
  const client = () => win?.zmClient;

  async function sweep() {
    if (s.stopped) return;
    if (s.busy) { s.again = true; return; }
    s.busy = true;
    try {
      let ids;
      try { ids = await listLeftovers(); } catch { log('leftovers', { state: 'refused' }); return; }
      if (s.stopped || !Array.isArray(ids) || !ids.length) return;
      const listed = new Set(ids.slice(0, MAX_IDS).map(id => String(id).toLowerCase()).filter(id => ID.test(id)));
      let users = [], self = '';
      try { users = client()?.getAllUser?.() || []; self = String(client()?.getCurrentUserInfo?.()?.userId ?? ''); } catch { return; }
      for (const user of users) {
        const key = typeof user?.userKey === 'string' ? user.userKey.toLowerCase() : '';
        if (!key || !listed.has(key) || String(user.userId) === self) continue;
        let removed;
        try { removed = await Promise.resolve(client()?.removeUser?.(user.userId)).then(result => !(result instanceof Error), () => false); }
        catch { removed = false; }
        log('leftover removed', { label: user.displayName, state: removed ? 'ok' : 'refused' });
      }
    } finally {
      s.busy = false;
      if (s.again && !s.stopped) { s.again = false; sweep(); }
    }
  }

  return {
    // The page is in the session as the host: sweep now, then every `everyMs`.
    connected() {
      if (s.stopped) return;
      if (!s.started) { s.started = true; s.interval = timers.setInterval(sweep, everyMs); }
      sweep();
    },
    // A participant arrived: one sweep shortly after, however many arrive together.
    added() {
      if (s.stopped || !s.started || s.soon) return;
      s.soon = timers.setTimeout(() => { s.soon = null; sweep(); }, coalesceMs);
    },
    stop() {
      s.stopped = true;
      if (s.interval) { timers.clearInterval(s.interval); s.interval = null; }
      if (s.soon) { timers.clearTimeout(s.soon); s.soon = null; }
    },
  };
}
