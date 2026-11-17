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
// Whiteboard (plan online-classroom-tools.md, PR A): the room tells the page when a
// whiteboard is open on a device that cannot open the canvas, writes `whiteboard
// available=yes|no` once the participant is in, and writes one `csp blocked` line per
// directive and host the browser refuses on this page (directive and hosts only; the one
// refusal the owner accepted is marked `expected=…`). A device without the canvas gets
// no whiteboard event from Zoom, so the presenter's page sends a fixed marker on the
// command channel, and a participant who arrives or reconnects asks for it (see
// zoom-whiteboard.mjs).
// Groups (PR B): a move into a group or back is `Reconnecting` then `Connected`, with a
// reason the room prints and never interprets: it is not a leave, it does not start the
// join timer and it does not ask for a new pass. Zoom gives every participant a new id
// on each move and rebuilds the mover's list without « removed » events, so the list is
// emptied on every `Reconnecting`. The timer of the toolkit's groups window is corrected
// on its way to Zoom (zoom-groups.mjs); whether that correction is in place is traced
// once, as `groups timer correction=on|off`.
// Toolkit messages (classroom polish): the camera and « start devices » messages of the
// pre-join screen get a French reason in place of « [object Object] », and the toolkit's
// console line with the decoded token payload is dropped (zoom-toolkit-messages.mjs).
// Raise hand (PR D, « Lever la main »): the teacher's page keeps the list of raised
// hands, a learner's page the button; both ride on the command channel with fixed
// markers (zoom-hands.mjs). The room passes it the connection states, the participants
// added and removed, and the markers with the `eh-hand:` prefix; nothing else.
// Reliability (plan online-room-reliability.md, ORR-r2, section 1, reliability PR):
//   - `onJoined` tells the page the participant is inside the session (each `Connected`),
//     so the page confirms its pass (room-pass.mjs) only once Zoom has let it in;
//   - after a confirmation that superseded an older connection, the page calls
//     `announceNewer()`: one fixed marker, `eh-room:newer`, on the command channel (again
//     once when the channel connects, at most once per `boardAnswerMs`); a page that
//     receives it calls `onNewer` and the page checks its pass at once. The marker carries
//     nothing and decides nothing;
//   - the teacher's page (`listLeftovers`) removes the participants whose `userKey` is one
//     of the lesson's ended passes (zoom-room-leftovers.mjs);
//   - `connection-change` `Closed` with Zoom's reason: 'kicked by host' and 'expeled by
//     host' are reported to the page as `closed: 'removed'`, 'ended by host' as `closed:
//     'ended'`; any other reason or none as before (`onLeft({ closed: null })`);
//   - the token-log wrapper is restored at teardown (zoom-toolkit-messages.mjs).

import { whiteboardCapability, cspBlockedDetail, WHITEBOARD_SIGNAL } from './zoom-whiteboard.mjs';
import { correctGroupTimer } from './zoom-groups.mjs';
import { dropToolkitJwtLog, restoreToolkitJwtLog, watchDeviceMessages } from './zoom-toolkit-messages.mjs';
import { createHands, HAND_PREFIX } from './zoom-hands.mjs';
import { createLeftoverSweep } from './zoom-room-leftovers.mjs';

export const ROOM_NEWER = 'eh-room:newer';
// Zoom's ClosedReason values (@zoom/videosdk event-callback.d.ts) as the page's words.
export function closedKind(reason) {
  if (reason === 'kicked by host' || reason === 'expeled by host') return 'removed';
  if (reason === 'ended by host') return 'ended';
  return null;
}

let chain = Promise.resolve();

// Resolves once every room started so far has been torn down.
export function roomSettled() {
  return chain;
}

const TOOLKIT_JOIN_TIMEOUT = /Timed out waiting for session to join/i;
const WAITING_SENDERS = 64;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const capped = (promise, ms) => Promise.race([Promise.resolve(promise).catch(() => {}), delay(ms)]);

export function roomLog(event, detail) {
  const fields = Object.entries(detail || {}).filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}=${String(value).slice(0, 80)}`).join(' ');
  console.info(`[online room] ${new Date().toISOString()} ${event}${fields ? ' ' + fields : ''}`);
}

export function startZoomRoom({ loadToolkit, preloadMedia, container, config, language, resources, joinLabel, joinTimeoutMs = 60000,
  boardAnswerMs = 2000, hands: handRole, onHands, onLeft, onError, onClosing, onWhiteboard, onJoined, onNewer, listLeftovers,
  log = roomLog, win = globalThis.window }) {
  const s = { stopped: false, silent: false, ended: false, joined: false, attempting: false, toolkit: null, watchdog: null,
    teardown: null, settle: null, people: new Map(), groupsTraced: false, stopCameraWatch: null,
    board: { own: false, peer: false, told: null, waiting: new Set(), presenting: false, open: false, readOnly: false, traced: false, answered: -Infinity, answer: null },
    blocked: new Set(), hands: null, closed: null, jwt: false, sweep: null,
    newer: { afterChannel: false, sent: -Infinity, timer: null } };
  // Raise hand: 'teacher' for the host's page, 'learner' for everybody else; off without a role.
  if (handRole === 'teacher' || handRole === 'learner')
    s.hands = createHands({ teacher: handRole === 'teacher', win, log, onChange: state => { if (!s.silent && !s.stopped) onHands?.(state); } });
  // Leftover connections: the teacher's page only (the database refuses anybody else).
  if (handRole === 'teacher' && typeof listLeftovers === 'function') s.sweep = createLeftoverSweep({ win, listLeftovers, log });
  const preview = config?.featuresOptions?.preview?.enable === true;
  const stopCameraWatch = () => { if (s.stopCameraWatch) { s.stopCameraWatch(); s.stopCameraWatch = null; } };
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
    if (state === 'Connected') {
      s.joined = true; settled();
      if (!s.board.traced) { s.board.traced = true; const { capable, source } = whiteboardCapability(win); log('whiteboard available', { available: capable ? 'yes' : 'no', source }); }
      stopCameraWatch();
      const corrected = correctGroupTimer(win, seconds => log('groups open', { timer: seconds ? `${seconds}s` : 'off' }));
      if (!s.groupsTraced) { s.groupsTraced = true; log('groups timer', { correction: corrected ? 'on' : 'off' }); }
      askBoard();
      s.hands?.connected();
      s.sweep?.connected();
      if (!s.silent && !s.stopped) { try { onJoined?.(); } catch { /* the page's own business */ } }
    }
    // A reconnection: a move into a group or back, or the network. Whatever the reason
    // says, the participant list starts again (Zoom rebuilds it with new ids), and what
    // the presenter's page said may be stale: forget it, and ask again once connected.
    else if (state === 'Reconnecting') { s.people.clear(); log('room move', { reason: payload?.reason }); s.board.waiting.clear(); board({ told: null }); s.hands?.reconnecting(); }
    else if (state === 'Fail') { settled(); fail({ code: payload?.errorCode, reason: payload?.reason }); }
    else if (state === 'Closed') {
      settled(); s.board.waiting.clear(); stopAnswer(); board({ own: false, peer: false, told: null, presenting: false }); s.hands?.closed();
      // Closed by the host: the page shows its own text instead of the toolkit's dialog.
      s.closed = closedKind(payload?.reason);
      if (s.closed) left();
    }
  };
  // A whiteboard is open when this participant presents one, when Zoom says somebody
  // else does (devices with the canvas), or when the presenter's page said so (devices
  // without it). The page shows its read-only line while one is open and this device
  // cannot open the canvas.
  function board(change) {
    Object.assign(s.board, change);
    const open = s.board.own || s.board.peer || s.board.told !== null;
    const readOnly = open && !whiteboardCapability(win).capable;
    if (open === s.board.open && readOnly === s.board.readOnly) return;
    s.board.open = open; s.board.readOnly = readOnly;
    log('whiteboard', { open: open ? 'yes' : 'no', readonly: readOnly ? 'yes' : undefined });
    if (!s.silent && !s.stopped) onWhiteboard?.({ open, readOnly });
  }
  // The presenter's marker for the participants Zoom tells nothing (fixed text only).
  const tellBoard = text => {
    try { Promise.resolve(win?.zmClient?.getCommandClient?.()?.send?.(text)).catch(() => {}); } catch { /* no command channel */ }
  };
  // A participant who is in the session asks whether a whiteboard is open: at the join,
  // after a reconnection, and when its command channel connects (whichever comes last is
  // the one that gets through). The presenter does not ask.
  const askBoard = () => { if (s.joined && !s.board.presenting) tellBoard(WHITEBOARD_SIGNAL.ask); };
  // The presenter's answer to a question or to an arrival: at most one « open » per
  // `boardAnswerMs`. A burst (a class coming back from its groups, each participant
  // asking and appearing again) gets one answer at once and one more when the interval
  // is over, which reaches those whose channel was not ready for the first.
  const stopAnswer = () => { if (s.board.answer) { clearTimeout(s.board.answer); s.board.answer = null; } };
  const sendAnswer = () => { s.board.answer = null; if (!s.board.presenting || s.stopped) return; s.board.answered = Date.now(); tellBoard(WHITEBOARD_SIGNAL.open); };
  const answerBoard = () => {
    if (!s.board.presenting || s.board.answer) return;
    const wait = s.board.answered + boardAnswerMs - Date.now();
    if (wait <= 0) sendAnswer(); else s.board.answer = setTimeout(sendAnswer, wait);
  };
  // The newer-device marker: at most once per `boardAnswerMs`, and once more when the
  // command channel connects after it was asked for (a marker sent before is lost).
  const stopNewer = () => { if (s.newer.timer) { clearTimeout(s.newer.timer); s.newer.timer = null; } };
  const sendNewer = () => {
    s.newer.timer = null;
    if (s.stopped) return;
    s.newer.sent = Date.now();
    log('newer connection', { marker: 'sent' });
    tellBoard(ROOM_NEWER);
  };
  const queueNewer = () => {
    if (s.newer.timer) return;
    const wait = s.newer.sent + boardAnswerMs - Date.now();
    if (wait <= 0) sendNewer(); else s.newer.timer = setTimeout(sendNewer, wait);
  };
  const announceNewer = () => {
    if (s.stopped) return false;
    s.newer.afterChannel = true;
    queueNewer();
    return true;
  };
  const onCommandStatus = status => {
    if (status !== 'Connected') return;
    askBoard(); s.hands?.commandReady();
    if (s.newer.afterChannel) { s.newer.afterChannel = false; queueNewer(); }
  };
  // Zoom raises the status change for a viewer too, after `peer … Start`: only the
  // participant whose own whiteboard opened without a peer presenting is the presenter.
  const onBoardStatus = status => {
    const own = Number(status) > 0;
    if (own === s.board.own) return;
    board({ own });
    if (own && !s.board.peer) { s.board.presenting = true; stopAnswer(); s.board.answered = Date.now(); tellBoard(WHITEBOARD_SIGNAL.open); }
    else if (!own && s.board.presenting) { s.board.presenting = false; stopAnswer(); tellBoard(WHITEBOARD_SIGNAL.closed); }
  };
  const onBoardPeer = payload => { if (payload?.action === 'Start') board({ peer: true }); else if (payload?.action === 'Stop') board({ peer: false }); };
  // « open » and « closed » are believed only from the host or a manager, as Zoom lists
  // them. A marker can arrive before its sender is in this participant's list (just
  // after a join): it waits for the sender to appear. Each sender waits on its own, so
  // an early marker from a learner cannot take the place of the host's (at most
  // WAITING_SENDERS of them; Zoom sets the sender id, so a participant holds one place).
  const trusted = senderId => {
    let users = null;
    try { users = win?.zmClient?.getAllUser?.() || null; } catch { /* client gone */ }
    const sender = users?.find(user => String(user.userId) === String(senderId));
    return sender ? !!(sender.isHost || sender.isManager) : null;
  };
  const onCommand = payload => {
    if (typeof payload?.text === 'string' && payload.text.startsWith(HAND_PREFIX)) { s.hands?.message(payload); return; }
    if (payload?.text === ROOM_NEWER) { log('newer connection', { marker: 'received' }); if (!s.silent && !s.stopped) { try { onNewer?.(); } catch { /* the page's own business */ } } return; }
    const text = payload?.text, from = String(payload?.senderId);
    if (text === WHITEBOARD_SIGNAL.ask) { answerBoard(); return; }
    if (text !== WHITEBOARD_SIGNAL.open && text !== WHITEBOARD_SIGNAL.closed) return;
    const believed = trusted(from);
    if (text === WHITEBOARD_SIGNAL.open) {
      if (believed === true) { s.board.waiting.delete(from); board({ told: from }); }
      else if (believed === null && s.board.waiting.size < WAITING_SENDERS) s.board.waiting.add(from);
    } else {
      s.board.waiting.delete(from);
      if (believed === true && s.board.told === from) board({ told: null });
    }
  };
  // One line per refused directive and host, so a blocked Zoom address is visible in a
  // teacher's console. Report-only policies are not refusals.
  const onCspBlocked = event => {
    if (event?.disposition && event.disposition !== 'enforce') return;
    const detail = cspBlockedDetail(event), key = `${detail.directive} ${detail.host} ${detail.source || ''}`;
    if (s.blocked.has(key) || s.blocked.size >= 20) return;
    s.blocked.add(key);
    log('csp blocked', detail);
  };
  const people = (event, list) => {
    for (const user of Array.isArray(list) ? list : [list]) {
      if (user?.userId === undefined) continue;
      if (event === 'added') s.people.set(user.userId, user.displayName); else s.people.delete(user.userId);
      // A presenter who leaves without closing takes the whiteboard along.
      if (event === 'removed' && s.board.told === String(user.userId)) board({ told: null });
      log(`participant ${event}`, { id: user.userId, label: user.displayName, host: user.isHost || undefined, total: s.people.size });
    }
  };
  // Somebody who joins while this participant presents the whiteboard is told too.
  const onAdded = list => {
    people('added', list);
    answerBoard();
    for (const from of [...s.board.waiting]) {
      const believed = trusted(from);
      if (believed === null) continue;
      s.board.waiting.delete(from);
      if (believed) board({ told: from });
    }
    s.hands?.added(list);
    s.sweep?.added();
  };
  const onRemoved = list => { people('removed', list); s.hands?.removed(list); };
  // A participant made co-host (or no longer) changes what the raise-hand button offers.
  const onUpdated = list => { s.hands?.updated(list); };
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
    stopAnswer();
    stopNewer();
    s.hands?.stop();
    s.sweep?.stop();
    stopCameraWatch();
    container?.removeEventListener?.('click', onClick, true);
    win?.removeEventListener?.('pagehide', onPageHide);
    win?.removeEventListener?.('pageshow', onPageShow);
    win?.document?.removeEventListener?.('visibilitychange', onVisibility);
    win?.document?.removeEventListener?.('securitypolicyviolation', onCspBlocked);
    s.teardown = chain = chain.then(() => ready).then(async () => {
      const toolkit = s.toolkit;
      if (!toolkit) return;
      // Let a join that is in flight answer first: destroying under it could leave the
      // connection alive with nothing on the page to end it.
      if (s.attempting) await Promise.race([new Promise(resolve => { s.settle = resolve; }), delay(15000)]);
      stopWatchdog();
      try { await capped(toolkit.leaveSession(), 8000); } catch { /* not in a session */ }
      try { toolkit.off?.('connection-change', onConnection); toolkit.off?.('user-added', onAdded); toolkit.off?.('user-removed', onRemoved);
        toolkit.off?.('whiteboard-status-change', onBoardStatus); toolkit.off?.('peer-whiteboard-state-change', onBoardPeer);
        toolkit.off?.('command-channel-message', onCommand); toolkit.off?.('command-channel-status', onCommandStatus);
        toolkit.off?.('user-updated', onUpdated); } catch { /* client gone */ }
      try { await capped(toolkit.destroy(), 25000); } catch { /* already destroyed */ }
      s.toolkit = null;
      // The token-log wrapper goes with the room (section 4 of the reliability plan).
      if (s.jwt) { s.jwt = false; restoreToolkitJwtLog(win); }
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
    capped(teardown(), 3000).then(() => { if (!s.silent) onLeft?.({ closed: s.closed }); });
  }

  win?.document?.addEventListener?.('securitypolicyviolation', onCspBlocked);
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
    s.jwt = dropToolkitJwtLog(win);
    s.stopCameraWatch = watchDeviceMessages(win, resources, (message, reason) => log(`${message} message`, { reason }));
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
    toolkit.on('whiteboard-status-change', onBoardStatus);
    toolkit.on('peer-whiteboard-state-change', onBoardPeer);
    toolkit.on('command-channel-message', onCommand);
    toolkit.on('command-channel-status', onCommandStatus);
    toolkit.on('user-updated', onUpdated);
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
    // Raise hand, for the page's button and panel. Each returns false when it did nothing.
    hands: {
      raise: () => s.hands?.raise() || false,
      lower: () => s.hands?.lower() || false,
      lowerOf: id => s.hands?.lowerOf(id) || false,
      lowerAll: () => s.hands?.lowerAll() || false,
    },
    // The page confirmed a pass that superseded an older connection.
    announceNewer,
  };
}
