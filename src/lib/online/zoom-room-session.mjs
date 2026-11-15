// Lifecycle of one Zoom room on the page, kept out of React so it can be tested with a
// fake toolkit. Facts about the pinned toolkit (@zoom/videosdk-ui-toolkit 2.5.0-1), read
// in its bundle:
//   - the toolkit is a singleton; `destroy()` leaves the Zoom session and only then frees
//     the client, so a join started before an earlier destroy has finished can register
//     its callbacks on the dying instance and leave a second connection behind;
//   - `joinSession()` rejects 60 s after the call, even while the participant is still on
//     the pre-join device screen, so its timeout is not a failure by itself;
//   - a failed join or a dropped session is announced by the SDK event `connection-change`
//     with `{ state: 'Fail', errorCode, reason }` (other states: Connected, Reconnecting,
//     Closed with a reason); the toolkit then shows its own English dialog;
//   - the SDK leaves on `beforeunload` only (`leaveOnPageUnload`), which phones often skip;
//   - a language is used only if its resources are registered before the room renders.
//   - the SDK's media library loads its lazy chunks from blob: URLs, which the room path's
//     script-src refuses; the room loads them itself first (zoom-media-chunks.mjs).
// So: every start waits for the previous teardown; callbacks go on the new instance;
// a failure or a timed-out join always leaves and destroys before the page offers a
// retry; `pagehide` leaves; and the console gets a dated trace of connection states and
// of participants joining and leaving (display label only: never the token, the session
// name or anything else).

let chain = Promise.resolve();

// Resolves once every room started so far has been torn down.
export function roomSettled() {
  return chain;
}

const TOOLKIT_JOIN_TIMEOUT = /Timed out waiting for session to join/i;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const capped = (promise, ms) => Promise.race([Promise.resolve(promise).catch(() => {}), delay(ms)]);

export function roomLog(event, detail) {
  const fields = Object.entries(detail || {}).filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}=${String(value).slice(0, 80)}`).join(' ');
  console.info(`[online room] ${new Date().toISOString()} ${event}${fields ? ' ' + fields : ''}`);
}

export function startZoomRoom({ loadToolkit, preloadMedia, container, config, language, resources, joinLabel, joinTimeoutMs = 60000,
  onLeft, onError, onClosing, log = roomLog, win = globalThis.window }) {
  const s = { stopped: false, silent: false, ended: false, joined: false, attempting: false, toolkit: null, watchdog: null,
    teardown: null, settle: null, people: new Map() };
  const preview = config?.featuresOptions?.preview?.enable === true;
  const stopWatchdog = () => { if (s.watchdog) { clearTimeout(s.watchdog); s.watchdog = null; } };
  const settled = () => { s.attempting = false; stopWatchdog(); s.settle?.(); };
  const previewShown = () => !!joinLabel && [...(container?.querySelectorAll?.('button') || [])].some(button => button.textContent.trim() === joinLabel);

  // A join is in flight from the click on the pre-join button (or from the start, without
  // the pre-join screen) until Zoom answers; our own timer replaces the toolkit's.
  const beginAttempt = () => {
    if (s.attempting || s.joined || s.stopped) return;
    s.attempting = true;
    log('join attempt');
    s.watchdog = setTimeout(() => { s.watchdog = null; s.attempting = false; fail({ code: 'join_timeout' }); }, joinTimeoutMs);
  };
  const onClick = event => {
    const button = event.target?.closest?.('button');
    if (button && button.textContent.trim() === joinLabel) beginAttempt();
  };

  const onConnection = payload => {
    const state = payload?.state;
    log('connection', { state, code: payload?.errorCode, reason: payload?.reason });
    if (state === 'Connected') { s.joined = true; settled(); }
    else if (state === 'Fail') { settled(); fail({ code: payload?.errorCode, reason: payload?.reason }); }
    else if (state === 'Closed') settled();
  };
  const people = (event, list) => {
    for (const user of Array.isArray(list) ? list : [list]) {
      if (user?.userId === undefined) continue;
      if (event === 'added') s.people.set(user.userId, user.displayName); else s.people.delete(user.userId);
      log(`participant ${event}`, { id: user.userId, label: user.displayName, host: user.isHost || undefined, total: s.people.size });
    }
  };
  const onAdded = list => people('added', list);
  const onRemoved = list => people('removed', list);
  const onVisibility = () => log('page visibility', { state: win.document?.visibilityState });
  // Leaving on visibilitychange would drop a learner who only switches tab or app, and the
  // event cannot tell that from closing the page; pagehide is the exit signal.
  const onPageHide = event => {
    log('page exit', { persisted: event?.persisted || undefined });
    try { s.toolkit?.leaveSession?.()?.catch?.(() => {}); } catch { /* no session */ }
  };
  // A page restored from the back/forward cache has no connection any more.
  const onPageShow = event => { if (event?.persisted) win.location.reload(); };

  function teardown() {
    if (s.teardown) return s.teardown;
    s.stopped = true;
    container?.removeEventListener?.('click', onClick, true);
    win?.removeEventListener?.('pagehide', onPageHide);
    win?.removeEventListener?.('pageshow', onPageShow);
    win?.document?.removeEventListener?.('visibilitychange', onVisibility);
    s.teardown = chain = chain.then(() => ready).then(async () => {
      const toolkit = s.toolkit;
      if (!toolkit) return;
      // Let a join that is in flight answer first: destroying under it could leave the
      // connection alive with nothing on the page to end it.
      if (s.attempting) await Promise.race([new Promise(resolve => { s.settle = resolve; }), delay(15000)]);
      stopWatchdog();
      try { await capped(toolkit.leaveSession(), 8000); } catch { /* not in a session */ }
      try { toolkit.off?.('connection-change', onConnection); toolkit.off?.('user-added', onAdded); toolkit.off?.('user-removed', onRemoved); } catch { /* client gone */ }
      try { await capped(toolkit.destroy(), 25000); } catch { /* already destroyed */ }
      s.toolkit = null;
      log('room closed');
    });
    return s.teardown;
  }

  function fail(detail) {
    if (s.ended) return;
    s.ended = true;
    log('room failed', { code: detail?.code, reason: detail?.reason });
    if (!s.silent) onClosing?.();
    teardown().then(() => { if (!s.silent) onError?.(detail); });
  }
  function left() {
    if (s.ended) return;
    s.ended = true;
    log('room left');
    // The session is already closed; do not keep the participant waiting on the cleanup.
    capped(teardown(), 3000).then(() => { if (!s.silent) onLeft?.(); });
  }

  const ready = chain.then(async () => {
    if (s.stopped) return;
    // The media chunks download beside the toolkit bundle and are in place before the
    // join; if they are not there after 20 s the room opens anyway and the trace says so.
    const [loaded, media] = await Promise.all([loadToolkit(),
      preloadMedia ? Promise.resolve().then(preloadMedia).catch(() => ({ loaded: [], failed: ['all'] })) : null]);
    if (media && !s.stopped) log('media chunks', { loaded: media.loaded?.join(','), failed: media.failed?.join(',') });
    const toolkit = loaded?.default || loaded;
    if (s.stopped) return;
    s.toolkit = toolkit;
    // joinSession first awaits any leave or destroy the toolkit still has pending, then
    // creates its instance. Our teardown has normally finished both by now, so the instance
    // exists as soon as the call returns and everything below attaches to it. If the 8 s
    // leave cap or the 25 s destroy cap ran out first, the handlers below can attach to the
    // instance that is still being destroyed; that room ends as the error card with
    // « Réessayer ».
    const joining = toolkit.joinSession(container, { ...config, language });
    if (resources && language) {
      const i18n = toolkit.i18n.getInstance();
      i18n.addResourceBundle(language, 'translation', resources, true, true);
      toolkit.i18n.setLanguageList([language]);
      Promise.resolve(i18n.changeLanguage?.(language)).catch(() => {});
      Promise.resolve(toolkit.i18n.setLanguage(language)).catch(() => {});
    }
    toolkit.onSessionClosed(left);
    toolkit.onSessionDestroyed(left);
    toolkit.on('connection-change', onConnection);
    toolkit.on('user-added', onAdded);
    toolkit.on('user-removed', onRemoved);
    container?.addEventListener?.('click', onClick, true);
    win?.addEventListener?.('pagehide', onPageHide);
    win?.addEventListener?.('pageshow', onPageShow);
    win?.document?.addEventListener?.('visibilitychange', onVisibility);
    log('room opening', { prejoin: preview || undefined });
    if (!preview) beginAttempt();
    Promise.resolve(joining).then(() => { s.joined = true; settled(); }, error => {
      if (s.stopped || s.joined) return;
      if (!TOOLKIT_JOIN_TIMEOUT.test(String(error?.message || error))) { settled(); fail({ code: 'toolkit', reason: String(error?.message || error) }); return; }
      // The toolkit's own 60 s timer: harmless on the pre-join screen or while our timer runs.
      if (!s.attempting && !previewShown()) fail({ code: 'join_timeout' });
    });
  }).catch(error => fail({ code: 'toolkit', reason: String(error?.message || error) }));

  return {
    // Unmount: tear down without calling the page back. Resolves when the room is gone.
    stop() { s.silent = true; return teardown(); },
    ready,
  };
}
