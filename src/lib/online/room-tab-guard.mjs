// One room per lesson and person in a browser: a second tab would join Zoom as a second
// participant with the same label. The guard holds a Web Lock for as long as the tab is
// in the room; a second tab finds the lock taken, and « Utiliser cet onglet » asks the
// first tab over a BroadcastChannel to leave, then waits for the lock.
// Where Web Locks is missing the same channel answers "is anyone there?" (best effort);
// where neither API exists the guard lets the tab in, as before.
// Browser-only state: nothing here is sent to the server or to the provider.

const PREFIX = 'eh-online-room:';

export function roomGuardKey(lesson, person) {
  return `${PREFIX}${lesson}:${person || 'self'}`;
}

export function createTabGuard({ key, onTakeover, locks = globalThis.navigator?.locks, Channel = globalThis.BroadcastChannel,
  pingMs = 400, takeoverMs = 12000, retryMs = 250 }) {
  let release = null, held = false, channel = null, closed = false;
  const waiting = new Set();
  const post = type => { try { channel?.postMessage({ type }); } catch { /* channel closed */ } };
  if (typeof Channel === 'function') {
    try {
      channel = new Channel(key);
      channel.onmessage = event => {
        const type = event?.data?.type;
        if (type === 'ping' && held) post('pong');
        else if (type === 'takeover' && held) onTakeover?.();
        else for (const listener of waiting) listener(type);
      };
    } catch { channel = null; }
  }
  const heard = (wanted, ms) => new Promise(resolve => {
    const listener = type => { if (type === wanted) { done(true); } };
    const timer = setTimeout(() => done(false), ms);
    function done(value) { clearTimeout(timer); waiting.delete(listener); resolve(value); }
    waiting.add(listener);
  });
  const hold = () => { held = true; return 'held'; };
  const lock = options => new Promise((resolve, reject) => {
    locks.request(key, options, granted => {
      if (!granted) { resolve('busy'); return undefined; }
      if (closed) { resolve('busy'); return undefined; }
      resolve(hold());
      return new Promise(free => { release = free; });
    }).catch(reject);
  });

  return {
    // 'held' (this tab may join), 'busy' (another tab is in the room) or 'unguarded'.
    async acquire() {
      if (held) return 'held';
      if (locks?.request) {
        try {
          const first = await lock({ ifAvailable: true });
          if (first !== 'busy' || closed) return first;
          // A page that is reloading frees its lock a moment after the new one starts.
          await new Promise(resolve => setTimeout(resolve, retryMs));
          return closed ? 'busy' : await lock({ ifAvailable: true });
        } catch { /* fall through */ }
      }
      if (!channel) return 'unguarded';
      const answer = heard('pong', pingMs);
      post('ping');
      return (await answer) ? 'busy' : hold();
    },
    // Ask the other tab to leave, then take its place once it has left the room.
    async takeOver() {
      if (held) return 'held';
      if (locks?.request) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), takeoverMs);
        post('takeover');
        try { return await lock({ signal: controller.signal }); } catch { return 'busy'; } finally { clearTimeout(timer); }
      }
      if (!channel) return 'unguarded';
      const left = heard('released', takeoverMs);
      post('takeover');
      return (await left) ? hold() : 'busy';
    },
    // Called once this tab has really left the room (after the provider teardown).
    release() {
      if (!held) return;
      held = false;
      release?.(); release = null;
      post('released');
    },
    close() {
      this.release();
      closed = true;
      try { channel?.close(); } catch { /* already closed */ }
      channel = null;
    },
    get held() { return held; },
  };
}
