// Online room, client side (room lifecycle and French): the Zoom room session controller
// with a fake toolkit, the same-browser tab guard with fake Web Locks and BroadcastChannel,
// the error-code mapping, the French resource file against the key list of the installed
// toolkit bundle, and the approved room configuration. No network, browser or database.
// Run by npm test.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startZoomRoom, roomSettled } from '../src/lib/online/zoom-room-session.mjs';
import { createTabGuard, roomGuardKey } from '../src/lib/online/room-tab-guard.mjs';
import { roomErrorFor, roomErrorKey, passExpired, ROOM_ERRORS } from '../src/lib/online/zoom-room-errors.mjs';
import { preloadZoomMediaChunks, ZOOM_MEDIA_LIB, ZOOM_MEDIA_CHUNKS } from '../src/lib/online/zoom-media-chunks.mjs';
import { whiteboardCapability, whiteboardDeviceRule, cspBlockedDetail, expectedCspRefusal, EXPECTED_CSP_REFUSAL, WHITEBOARD_SOURCES, WHITEBOARD_SIGNAL, WHITEBOARD_READ_ONLY_TEXT } from '../src/lib/online/zoom-whiteboard.mjs';
import { groupOpenOptions, groupTimerSeconds, correctGroupTimer, GROUP_TIMER_DEFAULT_SECONDS } from '../src/lib/online/zoom-groups.mjs';
import { dropToolkitJwtLog, TOOLKIT_JWT_LOG, CAMERA_REASON, cameraReasonFromText, cameraReasonFromDevice } from '../src/lib/online/zoom-toolkit-messages.mjs';
import { toolkitEnglish, TOOLKIT_BUNDLE, reachable, UNREACHABLE_PREFIXES } from './lib/zoom-toolkit-resources.mjs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const tick = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));

// ---- Fake toolkit: a singleton like the real one; records every call in order. ----
function fakeToolkit(calls, { destroyMs = 0 } = {}) {
  let instance = 0, inSession = false;
  const handlers = {}, closed = new Set(), destroyed = new Set(), bundles = {};
  let settleJoin = null;
  const toolkit = {
    joinSession(container, config) {
      instance++;
      calls.push(`join#${instance}`);
      toolkit.lastConfig = config;
      return new Promise((resolve, reject) => { settleJoin = { resolve, reject }; });
    },
    onSessionClosed(fn) { calls.push(`onSessionClosed#${instance}`); closed.add(fn); },
    onSessionDestroyed(fn) { calls.push(`onSessionDestroyed#${instance}`); destroyed.add(fn); },
    on(event, fn) { calls.push(`on:${event}#${instance}`); (handlers[event] ||= new Set()).add(fn); },
    off(event, fn) { handlers[event]?.delete(fn); },
    async leaveSession() { calls.push('leave'); inSession = false; },
    async destroy() { calls.push('destroy:start'); await tick(destroyMs); closed.clear(); destroyed.clear(); for (const key of Object.keys(handlers)) delete handlers[key]; calls.push('destroy:end'); },
    i18n: {
      getInstance: () => ({ addResourceBundle(language, ns, resources) { calls.push(`resources:${language}`); bundles[language] = resources; }, changeLanguage: async language => { calls.push(`changeLanguage:${language}`); } }),
      setLanguageList(list) { calls.push(`languageList:${list.join(',')}`); },
      async setLanguage(language) { calls.push(`setLanguage:${language}`); },
    },
    // Test controls
    emit(event, payload) { for (const fn of [...(handlers[event] || [])]) fn(payload); },
    connect() { inSession = true; toolkit.emit('connection-change', { state: 'Connected' }); settleJoin?.resolve(); },
    timeOut() { settleJoin?.reject(new Error('Timed out waiting for session to join')); },
    close() { for (const fn of [...closed]) fn(); },
    bundles,
  };
  return toolkit;
}
function fakeContainer(labels = []) {
  const listeners = [];
  return { labels,
    querySelectorAll: () => labels.map(text => ({ textContent: text })),
    addEventListener: (type, fn) => listeners.push(fn), removeEventListener: (type, fn) => listeners.splice(listeners.indexOf(fn), 1),
    click(text) { for (const fn of [...listeners]) fn({ target: { closest: () => ({ textContent: text }) } }); } };
}
function fakeWindow() {
  const listeners = {};
  const docListeners = {};
  return { reloaded: 0, document: { visibilityState: 'visible',
    addEventListener: (type, fn) => { (docListeners[type] ||= []).push(fn); }, removeEventListener: (type, fn) => { docListeners[type] = (docListeners[type] || []).filter(f => f !== fn); },
    fire(type, event) { for (const fn of docListeners[type] || []) fn(event); }, count: type => (docListeners[type] || []).length },
    location: { reload() { this.count = (this.count || 0) + 1; } },
    addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); }, removeEventListener: (type, fn) => { listeners[type] = (listeners[type] || []).filter(f => f !== fn); },
    fire(type, event) { for (const fn of listeners[type] || []) fn(event); }, count: type => (listeners[type] || []).length };
}
const SECRET = { token: 'eyJ.SECRET-TOKEN.sig', sessionName: 'eh-roomref.lesson-uuid' };
const FEATURES = { preview: { enable: true, isAllowModifyName: false } };
function open(toolkit, calls, logs, extra = {}) {
  const container = fakeContainer(['Rejoindre le cours']), win = fakeWindow();
  const room = startZoomRoom({ loadToolkit: async () => ({ default: toolkit }), container, win,
    config: { videoSDKJWT: SECRET.token, sessionName: SECRET.sessionName, userName: 'Amal B.', featuresOptions: FEATURES, leaveOnPageUnload: true },
    language: 'fr-FR', resources: { 'preview.join_button': 'Rejoindre le cours' }, joinLabel: 'Rejoindre le cours',
    onLeft: () => calls.push('page:onLeft'), onError: detail => calls.push(`page:onError:${detail.code}`), onClosing: () => calls.push('page:onClosing'),
    log: (event, detail) => logs.push([event, detail]), ...extra });
  return { room, container, win };
}

// 1. Handlers and the French resources go on the new instance, right after joinSession.
{
  const calls = [], logs = [], toolkit = fakeToolkit(calls);
  const { room, win } = open(toolkit, calls, logs);
  await room.ready;
  assert.deepEqual(calls, ['join#1', 'resources:fr-FR', 'languageList:fr-FR', 'changeLanguage:fr-FR', 'setLanguage:fr-FR',
    'onSessionClosed#1', 'onSessionDestroyed#1', 'on:connection-change#1', 'on:user-added#1', 'on:user-removed#1',
    'on:whiteboard-status-change#1', 'on:peer-whiteboard-state-change#1', 'on:command-channel-message#1', 'on:command-channel-status#1'], 'registration order');
  assert.equal(toolkit.lastConfig.language, 'fr-FR');
  assert.deepEqual(toolkit.lastConfig.featuresOptions.preview, { enable: true, isAllowModifyName: false });
  assert.equal(win.count('pagehide'), 1, 'pagehide listener registered');
  // Page exit leaves the session; a tab switch (visibilitychange) does not.
  calls.length = 0;
  win.fire('pagehide', { persisted: false });
  assert.deepEqual(calls, ['leave'], 'pagehide leaves');
  // Unmount: leave, then destroy, awaited; the page is not called back.
  calls.length = 0;
  await room.stop();
  assert.deepEqual(calls, ['leave', 'destroy:start', 'destroy:end']);
  assert.equal(win.count('pagehide'), 0, 'listeners removed');
}

// 2. Serialised teardown: a second room never joins before the first has been destroyed
//    (five quick reload-like restarts never overlap), and the toolkit's own 60 s timer on
//    the pre-join screen is not a failure.
{
  const calls = [], logs = [], toolkit = fakeToolkit(calls, { destroyMs: 20 });
  let previous = open(toolkit, calls, logs);
  await previous.room.ready;
  toolkit.timeOut();
  await tick(5);
  assert.ok(!calls.some(c => c.startsWith('page:')), 'toolkit timeout on the pre-join screen is ignored');
  for (let i = 0; i < 5; i++) {
    previous.room.stop(); // not awaited, like a React cleanup
    previous = open(toolkit, calls, logs);
  }
  await previous.room.ready;
  const order = calls.filter(c => /^(join#|destroy:)/.test(c));
  for (let i = 1; i < order.length; i++) {
    if (order[i].startsWith('join#')) assert.equal(order[i - 1], 'destroy:end', `join after a finished destroy: ${order.join(' ')}`);
    if (order[i] === 'destroy:start') assert.ok(order[i - 1].startsWith('join#') || order[i - 1] === 'destroy:end', order.join(' '));
  }
  // Rooms stopped before they ever started are skipped; the last one joined exactly once.
  assert.equal(order.filter(c => c.startsWith('join#')).length, 2, order.join(' '));
  assert.ok(!calls.some(c => c.startsWith('page:')), 'a stopped room never calls the page back');
  await previous.room.stop();
  await roomSettled();
}

// 3. A failed join: the toolkit is left and destroyed before the page may offer a retry,
//    and the page gets the SDK error code.
{
  const calls = [], logs = [], toolkit = fakeToolkit(calls, { destroyMs: 10 });
  const { room, container } = open(toolkit, calls, logs);
  await room.ready;
  calls.length = 0;
  container.click('Rejoindre le cours');
  toolkit.emit('connection-change', { state: 'Fail', errorCode: 3009, reason: 'user has been removed' });
  await roomSettled();
  await tick();
  assert.deepEqual(calls, ['page:onClosing', 'leave', 'destroy:start', 'destroy:end', 'page:onError:3009']);
  toolkit.emit('connection-change', { state: 'Fail', errorCode: 200 });
  toolkit.close();
  await tick(5);
  assert.equal(calls.length, 5, 'one outcome per room');
}

// 4. A join that never answers: our timer (from the click on the pre-join button) fails
//    it, and the room is destroyed before the retry is offered. A connected room is safe.
{
  const calls = [], logs = [], toolkit = fakeToolkit(calls);
  const { room, container } = open(toolkit, calls, logs, { joinTimeoutMs: 30 });
  await room.ready;
  calls.length = 0;
  await tick(50);
  assert.deepEqual(calls, [], 'no timer before the participant asks to join');
  container.click('Autre bouton');
  await tick(50);
  assert.deepEqual(calls, [], 'only the join button starts the timer');
  container.click('Rejoindre le cours');
  await tick(60);
  await roomSettled();
  await tick();
  assert.deepEqual(calls, ['page:onClosing', 'leave', 'destroy:start', 'destroy:end', 'page:onError:join_timeout']);

  const calls2 = [], toolkit2 = fakeToolkit(calls2);
  const second = open(toolkit2, calls2, logs, { joinTimeoutMs: 30 });
  await second.room.ready;
  second.container.click('Rejoindre le cours');
  toolkit2.connect();
  await tick(60);
  assert.ok(!calls2.some(c => c.startsWith('page:')), 'connected: no timeout');
  // The toolkit's leave button or the session ending: the page leaves once.
  toolkit2.close(); toolkit2.close();
  await tick(20);
  assert.deepEqual(calls2.filter(c => c.startsWith('page:')), ['page:onLeft']);
  await roomSettled();
}

// 5. A toolkit that cannot load is an error with a retry, after cleanup.
{
  const calls = [];
  const room = startZoomRoom({ loadToolkit: async () => { throw new Error('chunk failed'); }, container: fakeContainer(), win: fakeWindow(), config: { featuresOptions: FEATURES },
    onError: detail => calls.push(`page:onError:${detail.code}`), log() {} });
  await room.ready; await roomSettled(); await tick();
  assert.deepEqual(calls, ['page:onError:toolkit']);
}

// 6. Console diagnostics: connection states and participants with the display label only.
{
  const calls = [], logs = [], toolkit = fakeToolkit(calls);
  const { room } = open(toolkit, calls, logs);
  await room.ready;
  toolkit.connect();
  toolkit.emit('user-added', [{ userId: 1, displayName: 'Amal B.', isHost: false, userIdentity: 'pass-jti', userGuid: 'guid' }]);
  toolkit.emit('user-added', [{ userId: 2, displayName: 'Sara L.', isHost: true }]);
  toolkit.emit('user-removed', [{ userId: 2, displayName: 'Sara L.' }]);
  toolkit.emit('connection-change', { state: 'Reconnecting', reason: 'network' });
  await room.stop();
  const events = logs.map(([event]) => event);
  for (const expected of ['room opening', 'connection', 'participant added', 'participant removed', 'room closed']) assert.ok(events.includes(expected), expected);
  assert.deepEqual(logs.filter(([event]) => event.startsWith('participant')).map(([, d]) => d.total), [1, 2, 1]);
  const printed = JSON.stringify(logs);
  for (const secret of [SECRET.token, SECRET.sessionName, 'pass-jti', 'guid']) assert.ok(!printed.includes(secret), `diagnostics never carry ${secret}`);
}

// 7. Media chunks (reconnect loop of 2026-11-15): the room loads the SDK's lazy chunks as
//    plain scripts from the library host and version the pinned toolkit uses, before the
//    join; a chunk that does not load does not stop the room and may be tried again.
{
  // The toolkit builds its library URL from a version constant; ours must be the same.
  const bundle = readFileSync(TOOLKIT_BUNDLE, 'utf8');
  const versions = [...bundle.matchAll(/"https:\/\/source\.zoom\.us\/videosdk\/"\.concat\(([\w$]+), "\/lib"\)/g)]
    .map(([, name]) => new RegExp(`[ ,]${name.replace(/\$/g, '\\$')} = "([^"]+)"`).exec(bundle)?.[1]);
  assert.ok(versions.length > 0, 'toolkit bundle: media library URL found');
  for (const version of versions) assert.equal(ZOOM_MEDIA_LIB, `https://source.zoom.us/videosdk/${version}/lib`, 'media chunk version matches the pinned toolkit');
  assert.match(bundle, /const [\w$]+ = "js_media\.min\.js"/);
  // The host is one the room path's script-src already allows; no header changes for it.
  assert.ok(read('next.config.mjs').includes(`ZOOM_SCRIPT_HOSTS = ['${new URL(ZOOM_MEDIA_LIB).origin}']`));
  assert.deepEqual([...ZOOM_MEDIA_CHUNKS], ['wmsc', 'pako', 'annoter']);

  const fakeDoc = fail => {
    const added = [];
    return { added, head: { appendChild(el) { added.push(el); queueMicrotask(() => (fail(el.src) ? el.onerror : el.onload)?.()); } },
      createElement: () => ({ remove() { this.removed = true; } }) };
  };
  let doc = fakeDoc(src => src.includes('annoter'));
  let result = await preloadZoomMediaChunks({ doc });
  assert.deepEqual(result, { loaded: ['wmsc', 'pako'], failed: ['annoter'] });
  assert.deepEqual(doc.added.map(el => el.src), ZOOM_MEDIA_CHUNKS.map(name => `${ZOOM_MEDIA_LIB}/${name}.min.js`));
  assert.ok(doc.added.every(el => el.async === true) && doc.added[2].removed === true && !doc.added[0].removed);
  // A second room on the same page: loaded chunks are not loaded twice, the failed one is retried.
  doc = fakeDoc(() => false);
  result = await preloadZoomMediaChunks({ doc });
  assert.deepEqual(result, { loaded: ['wmsc', 'pako', 'annoter'], failed: [] });
  assert.deepEqual(doc.added.map(el => el.src), [`${ZOOM_MEDIA_LIB}/annoter.min.js`]);
  assert.deepEqual(await preloadZoomMediaChunks({ doc: null }), { loaded: [], failed: ['wmsc', 'pako', 'annoter'] }, 'no document: nothing loaded, nothing thrown');

  // In the room: asked for once, in place before joinSession, and traced by chunk name only.
  const calls = [], logs = [], toolkit = fakeToolkit(calls);
  const { room } = open(toolkit, calls, logs, { preloadMedia: async () => { await tick(15); calls.push('media'); return { loaded: ['wmsc', 'pako'], failed: ['annoter'] }; } });
  await room.ready;
  assert.deepEqual(calls.slice(0, 2), ['media', 'join#1'], 'chunks are in place before the join');
  assert.deepEqual(logs.find(([event]) => event === 'media chunks')?.[1], { loaded: 'wmsc,pako', failed: 'annoter' });
  await room.stop();
  // A preload that throws does not stop the room.
  const calls2 = [], logs2 = [], toolkit2 = fakeToolkit(calls2);
  const second = open(toolkit2, calls2, logs2, { preloadMedia: () => { throw new Error('no network'); } });
  await second.room.ready;
  assert.equal(calls2[0], 'join#1');
  assert.deepEqual(logs2.find(([event]) => event === 'media chunks')?.[1], { loaded: '', failed: 'all' });
  assert.ok(!calls2.some(c => c.startsWith('page:')));
  await second.room.stop();
  assert.match(read('src/components/online/ZoomRoom.jsx'), /preloadMedia: preloadZoomMediaChunks,/);
}

// 8. Whiteboard (plan online-classroom-tools.md, PR A): the read-only line follows the
//    capability the SDK reports, never the window width; a device without the canvas
//    learns that a whiteboard is open from the presenter's marker only; the presenter
//    sends that marker; and a refused address becomes one trace line, directive and host.
{
  // The SDK client the toolkit exposes, as far as the room reads it.
  const sdk = ({ capable, users = [], sent = [] }) => ({ sent,
    getWhiteboardClient: () => ({ isWhiteboardEnabled: () => capable }),
    getAllUser: () => users, getCommandClient: () => ({ send: async text => { sent.push(text); } }) });
  const HOST = { userId: 16778240, displayName: 'Sara L.', isHost: true }, LEARNER = { userId: 16781312, displayName: 'Amal B.', isHost: false };
  const start = async (client, extra = {}) => {
    const calls = [], logs = [], board = [], toolkit = fakeToolkit(calls);
    const { room, win } = open(toolkit, calls, logs, { onWhiteboard: state => board.push(state), ...extra });
    if (client !== undefined) win.zmClient = client;
    await room.ready;
    toolkit.connect();
    return { calls, logs, board, toolkit, room, win };
  };
  const lines = logs => logs.filter(([event]) => event === 'whiteboard').map(([, d]) => `${d.open}/${d.readonly || 'no'}`);

  // A device without the canvas (phone, tablet, two cores): Zoom sends it no whiteboard
  // event; the host's marker opens the line and closes it.
  {
    const r = await start(sdk({ capable: false, users: [HOST, LEARNER] }));
    assert.deepEqual(r.logs.find(([event]) => event === 'whiteboard available')?.[1], { available: 'no', source: 'sdk' });
    r.toolkit.emit('command-channel-message', { senderId: String(HOST.userId), text: WHITEBOARD_SIGNAL.open });
    assert.deepEqual(r.board, [{ open: true, readOnly: true }]);
    r.toolkit.emit('command-channel-message', { senderId: String(HOST.userId), text: WHITEBOARD_SIGNAL.open });
    assert.equal(r.board.length, 1, 'a repeated marker (sent again when somebody joins) changes nothing');
    r.toolkit.emit('command-channel-message', { senderId: String(HOST.userId), text: WHITEBOARD_SIGNAL.closed });
    assert.deepEqual(r.board.at(-1), { open: false, readOnly: false });
    // Only the host or a manager is believed; any other text is ignored.
    r.toolkit.emit('command-channel-message', { senderId: String(LEARNER.userId), text: WHITEBOARD_SIGNAL.open });
    r.toolkit.emit('command-channel-message', { senderId: '999', text: WHITEBOARD_SIGNAL.open });
    r.toolkit.emit('command-channel-message', { senderId: String(HOST.userId), text: 'eh-whiteboard:open ' });
    r.toolkit.emit('command-channel-message', { senderId: String(HOST.userId), text: 'anything else' });
    assert.equal(r.board.length, 2, 'markers from a learner, an unknown sender or with another text are ignored');
    // A presenter who leaves without closing takes the line away; so does the session closing.
    r.toolkit.emit('command-channel-message', { senderId: String(HOST.userId), text: WHITEBOARD_SIGNAL.open });
    r.toolkit.emit('user-removed', [{ userId: HOST.userId, displayName: HOST.displayName }]);
    assert.deepEqual(r.board.slice(2), [{ open: true, readOnly: true }, { open: false, readOnly: false }]);
    r.toolkit.emit('command-channel-message', { senderId: String(HOST.userId), text: WHITEBOARD_SIGNAL.open });
    r.toolkit.emit('connection-change', { state: 'Closed', reason: 'ended by host' });
    assert.deepEqual(r.board.at(-1), { open: false, readOnly: false });
    assert.deepEqual(lines(r.logs), ['yes/yes', 'no/no', 'yes/yes', 'no/no', 'yes/yes', 'no/no']);
    assert.deepEqual(r.calls.filter(c => c.startsWith('page:')), [], 'a whiteboard never ends or fails the room');
    assert.ok(r.win.zmClient.sent.every(text => text === WHITEBOARD_SIGNAL.ask), 'a viewer never sends « open » or « closed »');
    await r.room.stop();
  }
  // Arriving late (review B3 of 2026-11-16): a participant asks once it is in the session
  // and again when its command channel connects; a marker from a sender who is not in
  // its list yet waits for that sender; after a reconnection the line is dropped and
  // asked for again (N1), so a stale line never stays.
  {
    const users = [LEARNER];
    const r = await start(sdk({ capable: false, users }));
    assert.deepEqual(r.win.zmClient.sent, [WHITEBOARD_SIGNAL.ask], 'asked at the join');
    r.toolkit.emit('command-channel-status', 'Connecting');
    r.toolkit.emit('command-channel-status', 'Connected');
    assert.deepEqual(r.win.zmClient.sent, [WHITEBOARD_SIGNAL.ask, WHITEBOARD_SIGNAL.ask], 'asked again when the command channel connects');
    // The answer arrives before the host is in this participant's list.
    r.toolkit.emit('command-channel-message', { senderId: String(HOST.userId), text: WHITEBOARD_SIGNAL.open });
    assert.deepEqual(r.board, [], 'not believed before the sender is known');
    users.push({ userId: 3, displayName: 'Nour K.', isHost: false });
    r.toolkit.emit('user-added', [{ userId: 3, displayName: 'Nour K.' }]);
    assert.deepEqual(r.board, [], 'another participant appearing changes nothing');
    users.push(HOST);
    r.toolkit.emit('user-added', [HOST]);
    assert.deepEqual(r.board, [{ open: true, readOnly: true }], 'believed once the sender is listed as the host');
    // A waiting marker from somebody who turns out to be a learner is dropped.
    const users2 = [HOST];
    const r2 = await start(sdk({ capable: false, users: users2 }));
    r2.toolkit.emit('command-channel-message', { senderId: String(LEARNER.userId), text: WHITEBOARD_SIGNAL.open });
    users2.push(LEARNER);
    r2.toolkit.emit('user-added', [LEARNER]);
    assert.deepEqual(r2.board, []);
    // A waiting « open » followed by « closed » from the same sender is cancelled.
    r2.toolkit.emit('command-channel-message', { senderId: '777', text: WHITEBOARD_SIGNAL.open });
    r2.toolkit.emit('command-channel-message', { senderId: '777', text: WHITEBOARD_SIGNAL.closed });
    users2.push({ userId: 777, isHost: true });
    r2.toolkit.emit('user-added', [{ userId: 777, displayName: 'X' }]);
    assert.deepEqual(r2.board, []);
    await r2.room.stop();
    // Review note N2 of 2026-11-16: a learner's early marker does not take the place of
    // the host's. Both wait; the host's is believed when the host is listed, in either
    // order of arrival, and the learner's is dropped.
    for (const order of [[HOST, LEARNER], [LEARNER, HOST]]) {
      const users3 = [{ userId: 9, displayName: 'Moi', isHost: false }];
      const r3 = await start(sdk({ capable: false, users: users3 }));
      for (const sender of order) r3.toolkit.emit('command-channel-message', { senderId: String(sender.userId), text: WHITEBOARD_SIGNAL.open });
      assert.deepEqual(r3.board, []);
      users3.push(LEARNER);
      r3.toolkit.emit('user-added', [LEARNER]);
      assert.deepEqual(r3.board, [], 'the learner appearing first changes nothing');
      users3.push(HOST);
      r3.toolkit.emit('user-added', [HOST]);
      assert.deepEqual(r3.board, [{ open: true, readOnly: true }], `the host's marker survived the learner's (${order.map(u => u.displayName).join(' then ')})`);
      await r3.room.stop();
    }
    // A learner's « closed » does not cancel the host's waiting « open »; the host's does.
    {
      const users4 = [{ userId: 9, displayName: 'Moi', isHost: false }];
      const r4 = await start(sdk({ capable: false, users: users4 }));
      r4.toolkit.emit('command-channel-message', { senderId: String(HOST.userId), text: WHITEBOARD_SIGNAL.open });
      r4.toolkit.emit('command-channel-message', { senderId: String(LEARNER.userId), text: WHITEBOARD_SIGNAL.open });
      r4.toolkit.emit('command-channel-message', { senderId: String(LEARNER.userId), text: WHITEBOARD_SIGNAL.closed });
      users4.push(HOST, LEARNER);
      r4.toolkit.emit('user-added', [HOST, LEARNER]);
      assert.deepEqual(r4.board, [{ open: true, readOnly: true }]);
      // Many unknown senders: the list of waiting markers is bounded, and nothing breaks.
      for (let i = 0; i < 500; i++) r4.toolkit.emit('command-channel-message', { senderId: String(5000 + i), text: WHITEBOARD_SIGNAL.open });
      r4.toolkit.emit('user-added', [{ userId: 4, displayName: 'Nour K.' }]);
      assert.deepEqual(r4.board, [{ open: true, readOnly: true }]);
      await r4.room.stop();
    }
    // Reconnection: the line goes, the participant asks again, the presenter's answer restores it.
    const asked = r.win.zmClient.sent.length;
    r.toolkit.emit('connection-change', { state: 'Reconnecting', reason: 'failover' });
    assert.deepEqual(r.board.at(-1), { open: false, readOnly: false }, 'no stale line while reconnecting');
    r.toolkit.emit('connection-change', { state: 'Connected' });
    assert.equal(r.win.zmClient.sent.length, asked + 1, 'asked again after the reconnection');
    assert.equal(r.win.zmClient.sent.at(-1), WHITEBOARD_SIGNAL.ask);
    r.toolkit.emit('command-channel-message', { senderId: String(HOST.userId), text: WHITEBOARD_SIGNAL.open });
    assert.deepEqual(r.board.at(-1), { open: true, readOnly: true });
    // If the whiteboard was closed meanwhile, nobody answers and the line stays away.
    r.toolkit.emit('connection-change', { state: 'Reconnecting', reason: 'network' });
    r.toolkit.emit('connection-change', { state: 'Connected' });
    assert.deepEqual(r.board.at(-1), { open: false, readOnly: false });
    assert.deepEqual(r.calls.filter(c => c.startsWith('page:')), [], 'none of this ends or fails the room');
    await r.room.stop();
  }
  // A device with the canvas: the SDK's own events open the whiteboard, and the line
  // stays hidden whatever the window width is (the fake window has none at all).
  {
    const r = await start(sdk({ capable: true, users: [HOST, LEARNER] }));
    assert.deepEqual(r.logs.find(([event]) => event === 'whiteboard available')?.[1], { available: 'yes', source: 'sdk' });
    r.toolkit.emit('peer-whiteboard-state-change', { action: 'Start', userId: HOST.userId });
    r.toolkit.emit('whiteboard-status-change', 1);
    r.toolkit.emit('whiteboard-status-change', 2);
    r.toolkit.emit('command-channel-message', { senderId: String(HOST.userId), text: WHITEBOARD_SIGNAL.open });
    assert.deepEqual(r.board, [{ open: true, readOnly: false }]);
    // The presenter stops: Zoom raises the viewer's own status change too. A viewer never
    // sends the marker, at the start or at the stop.
    r.toolkit.emit('peer-whiteboard-state-change', { action: 'Stop', userId: HOST.userId });
    r.toolkit.emit('whiteboard-status-change', 0);
    r.toolkit.emit('command-channel-message', { senderId: String(HOST.userId), text: WHITEBOARD_SIGNAL.closed });
    assert.deepEqual(r.board.at(-1), { open: false, readOnly: false });
    r.toolkit.emit('user-added', [{ userId: 3, displayName: 'Nour K.' }]);
    r.toolkit.emit('command-channel-message', { senderId: '3', text: WHITEBOARD_SIGNAL.ask });
    assert.deepEqual(r.win.zmClient.sent, [WHITEBOARD_SIGNAL.ask], 'a viewer asks at the join and never sends « open », « closed » or an answer');
    await r.room.stop();
  }
  // The presenter: its own status change sends the marker, once per change. Arrivals
  // and questions are answered, at most once per interval (review note N1 of
  // 2026-11-16): a burst gets one answer at once and one when the interval is over.
  // Nothing but the fixed texts.
  {
    const r = await start(sdk({ capable: true, users: [HOST] }), { boardAnswerMs: 40 });
    const sent = () => r.win.zmClient.sent.slice(1); // after the question every participant asks at the join
    assert.deepEqual(r.win.zmClient.sent, [WHITEBOARD_SIGNAL.ask]);
    r.toolkit.emit('command-channel-message', { senderId: String(LEARNER.userId), text: WHITEBOARD_SIGNAL.ask });
    r.toolkit.emit('user-added', [{ userId: 5, displayName: 'Nour K.' }]);
    await tick(60);
    assert.deepEqual(sent(), [], 'no whiteboard: a question or an arrival gets no answer');
    r.toolkit.emit('whiteboard-status-change', 1);
    r.toolkit.emit('whiteboard-status-change', 2);
    assert.deepEqual(sent(), [WHITEBOARD_SIGNAL.open], 'pending then in progress: one marker');
    // A class comes back from its groups: everybody appears again and asks, at once.
    r.toolkit.emit('user-added', [{ userId: LEARNER.userId, displayName: LEARNER.displayName }]);
    for (let i = 0; i < 25; i++) r.toolkit.emit('command-channel-message', { senderId: String(LEARNER.userId + i), text: WHITEBOARD_SIGNAL.ask });
    for (let i = 0; i < 25; i++) r.toolkit.emit('user-added', [{ userId: 100 + i, displayName: 'X' }]);
    assert.deepEqual(sent(), [WHITEBOARD_SIGNAL.open], 'inside the interval nothing more is sent at once');
    await tick(70);
    assert.deepEqual(sent(), [WHITEBOARD_SIGNAL.open, WHITEBOARD_SIGNAL.open], 'the whole burst gets one answer when the interval is over');
    await tick(60);
    assert.equal(sent().length, 2, 'and only one');
    // After the interval a question is answered at once.
    r.toolkit.emit('command-channel-message', { senderId: String(LEARNER.userId), text: WHITEBOARD_SIGNAL.ask });
    assert.deepEqual(sent(), [WHITEBOARD_SIGNAL.open, WHITEBOARD_SIGNAL.open, WHITEBOARD_SIGNAL.open], 'the presenter answers a question');
    // The presenter does not ask while presenting (a reconnection of its own included).
    r.toolkit.emit('command-channel-status', 'Connected');
    assert.equal(sent().length, 3);
    // An answer that is still waiting is dropped when the whiteboard closes: « closed » is the last word.
    r.toolkit.emit('command-channel-message', { senderId: String(LEARNER.userId), text: WHITEBOARD_SIGNAL.ask });
    r.toolkit.emit('whiteboard-status-change', 0);
    r.toolkit.emit('user-added', [{ userId: 3, displayName: 'Nour K.' }]);
    r.toolkit.emit('command-channel-message', { senderId: '3', text: WHITEBOARD_SIGNAL.ask });
    await tick(70);
    assert.deepEqual(sent(), [WHITEBOARD_SIGNAL.open, WHITEBOARD_SIGNAL.open, WHITEBOARD_SIGNAL.open, WHITEBOARD_SIGNAL.closed]);
    // A new whiteboard is announced at once, whatever was answered just before.
    r.toolkit.emit('whiteboard-status-change', 2);
    assert.equal(sent().at(-1), WHITEBOARD_SIGNAL.open);
    assert.equal(sent().length, 5);
    r.toolkit.emit('whiteboard-status-change', 0);
    assert.deepEqual({ ...WHITEBOARD_SIGNAL }, { open: 'eh-whiteboard:open', closed: 'eh-whiteboard:closed', ask: 'eh-whiteboard:ask' }, 'three fixed texts and nothing else');
    assert.deepEqual(r.board, [{ open: true, readOnly: false }, { open: false, readOnly: false }, { open: true, readOnly: false }, { open: false, readOnly: false }]);
    // A room that stops with an answer waiting sends nothing afterwards.
    r.toolkit.emit('whiteboard-status-change', 2);
    r.toolkit.emit('command-channel-message', { senderId: '3', text: WHITEBOARD_SIGNAL.ask });
    const before = r.win.zmClient.sent.length;
    const client = r.win.zmClient;
    await r.room.stop();
    await tick(70);
    assert.equal(client.sent.length, before, 'no answer after the room has stopped');
  }
  {
    const r = await start(sdk({ capable: true, users: [HOST] }));
    // A command channel that throws or is missing never breaks the room.
    r.win.zmClient = { getWhiteboardClient: () => ({ isWhiteboardEnabled: () => true }), getCommandClient: () => { throw new Error('gone'); } };
    r.toolkit.emit('whiteboard-status-change', 2);
    r.win.zmClient = undefined;
    r.toolkit.emit('whiteboard-status-change', 0);
    assert.deepEqual(r.calls.filter(c => c.startsWith('page:')), []);
    await r.room.stop();
  }
  // The SDK client is not exposed: Zoom's own device rule decides (read in the bundle:
  // not an Android or iOS browser, and more than two cores), and the trace says so.
  {
    const desktop = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36', hardwareConcurrency: 8, maxTouchPoints: 0 };
    assert.equal(whiteboardDeviceRule(desktop), true);
    assert.equal(whiteboardDeviceRule({ ...desktop, hardwareConcurrency: 2 }), false, 'two cores');
    assert.equal(whiteboardDeviceRule({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/130.0.0.0 Mobile Safari/537.36', hardwareConcurrency: 8 }), false, 'Android');
    assert.equal(whiteboardDeviceRule({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile/15E148 Safari/604.1', hardwareConcurrency: 6 }), false, 'iPhone');
    assert.equal(whiteboardDeviceRule({ ...desktop, maxTouchPoints: 5 }), false, 'iPad presenting itself as a Mac');
    assert.equal(whiteboardDeviceRule(undefined), false);
    assert.deepEqual(whiteboardCapability({ navigator: desktop }), { capable: true, source: 'device' });
    assert.deepEqual(whiteboardCapability({ navigator: { ...desktop, hardwareConcurrency: 2 } }), { capable: false, source: 'device' });
    // The SDK's answer wins over the device rule, both ways.
    assert.deepEqual(whiteboardCapability({ navigator: desktop, zmClient: sdk({ capable: false }) }), { capable: false, source: 'sdk' });
    assert.deepEqual(whiteboardCapability({ navigator: { ...desktop, hardwareConcurrency: 2 }, zmClient: sdk({ capable: true }) }), { capable: true, source: 'sdk' });
    assert.deepEqual(whiteboardCapability({ navigator: desktop, zmClient: { getWhiteboardClient() { throw new Error('not ready'); } } }), { capable: true, source: 'device' });
    const r = await start(undefined);
    r.win.navigator = { ...desktop, hardwareConcurrency: 2 };
    r.toolkit.emit('peer-whiteboard-state-change', { action: 'Start', userId: HOST.userId });
    assert.deepEqual(r.board, [{ open: true, readOnly: true }], 'device rule used only when the SDK client is not exposed');
    assert.equal(r.logs.find(([event]) => event === 'whiteboard available')?.[1].source, 'device');
    await r.room.stop();
  }
  // Refused addresses: one line each, directive and host only.
  {
    const D = (directive, host, source, expected) => ({ directive, host, source, expected });
    assert.deepEqual(cspBlockedDetail({ effectiveDirective: 'script-src-elem', blockedURI: 'https://us06st1.zoom.us/web_client_whiteboard/mveoc7k9/dist/es/whiteboard-sdk.js?token=SECRET#frag' }), D('script-src-elem', 'us06st1.zoom.us'));
    assert.deepEqual(cspBlockedDetail({ effectiveDirective: 'script-src-elem', blockedURI: 'blob:https://admin.english-hills.com/6117af9a-0000-4000-8000-000000000000' }), D('script-src-elem', 'blob'));
    assert.deepEqual(cspBlockedDetail({ violatedDirective: "style-src 'self' 'unsafe-inline'", blockedURI: 'inline' }), D('style-src', 'inline'));
    assert.deepEqual(cspBlockedDetail({ effectiveDirective: 'connect-src', blockedURI: 'wss://rwcff.cloud.zoom.us:443/wc/media/123?jwt=SECRET' }), D('connect-src', 'rwcff.cloud.zoom.us'));
    assert.deepEqual(cspBlockedDetail({ effectiveDirective: 'img-src', blockedURI: 'data' }), D('img-src', 'data'));
    assert.deepEqual(cspBlockedDetail({ effectiveDirective: 'script-src', blockedURI: 'not a url / with a path' }), D('script-src', 'unknown'));
    assert.deepEqual(cspBlockedDetail(undefined), D('unknown', 'unknown'));
    assert.deepEqual(cspBlockedDetail({ effectiveDirective: 'frame-src', blockedURI: 'https://docs.zoomdev.us', sourceFile: 'https://admin.example/online/room/24040756?x=1' }), D('frame-src', 'docs.zoomdev.us', 'admin.example'));

    // The one named refusal (owner decision of 2026-11-16): script-src, « eval », raised by
    // a script under an approved whiteboard source. Everything else is unexpected: the
    // same refusal from the page's own script, from the Zoom library host, from another
    // Zoom host, from a look-alike path or host, and any other directive or value.
    assert.deepEqual([...WHITEBOARD_SOURCES], ['https://us04st1.zoom.us/web_client_whiteboard/', 'https://us05st1.zoom.us/web_client_whiteboard/']);
    assert.ok(read('next.config.mjs').includes(`ZOOM_WHITEBOARD_SOURCES = [${WHITEBOARD_SOURCES.map(source => `'${source}'`).join(', ')}];`), 'the same two sources as the header');
    assert.equal(EXPECTED_CSP_REFUSAL, 'whiteboard-eval-probe');
    const evalFrom = (sourceFile, extra = {}) => ({ effectiveDirective: 'script-src', blockedURI: 'eval', sourceFile, ...extra });
    for (const host of ['us04st1', 'us05st1']) {
      const event = evalFrom(`https://${host}.zoom.us/web_client_whiteboard/mwfe40q7/dist/es/pwa-Dj0eFPfC.js`);
      assert.equal(expectedCspRefusal(event), true, host);
      assert.deepEqual(cspBlockedDetail(event), D('script-src', 'eval', `${host}.zoom.us`, 'whiteboard-eval-probe'));
    }
    for (const sourceFile of ['https://admin.english-hills.com/_next/static/chunks/app.js', 'https://source.zoom.us/videosdk/2.5.0/lib/js_media.min.js', 'https://us06st1.zoom.us/web_client_whiteboard/x/pwa.js',
      'https://us05st1.zoom.us/other/pwa.js', 'https://us05st1.zoom.us/web_client_whiteboard', 'https://us05st1.zoom.us.evil.example/web_client_whiteboard/pwa.js', 'http://us05st1.zoom.us/web_client_whiteboard/pwa.js',
      'https://evil.example/?https://us05st1.zoom.us/web_client_whiteboard/', '', undefined]) {
      assert.equal(expectedCspRefusal(evalFrom(sourceFile)), false, String(sourceFile));
      assert.equal(cspBlockedDetail(evalFrom(sourceFile)).expected, undefined);
    }
    const good = 'https://us05st1.zoom.us/web_client_whiteboard/mwfe40q7/dist/es/pwa-Dj0eFPfC.js';
    assert.equal(expectedCspRefusal(evalFrom(good, { effectiveDirective: 'script-src-elem' })), false, 'another directive');
    assert.equal(expectedCspRefusal(evalFrom(good, { blockedURI: 'inline' })), false, 'another blocked value');
    assert.equal(expectedCspRefusal(evalFrom(good, { blockedURI: 'wasm-eval' })), false);
    assert.equal(expectedCspRefusal(evalFrom(good, { blockedURI: 'blob' })), false);
    assert.equal(expectedCspRefusal(undefined), false);

    const calls = [], logs = [], toolkit = fakeToolkit(calls);
    const { room, win } = open(toolkit, calls, logs);
    assert.equal(win.document.count('securitypolicyviolation'), 1, 'listening before the toolkit has loaded');
    await room.ready;
    const refused = 'https://us06st1.zoom.us/web_client_whiteboard/mveoc7k9/dist/es/whiteboard-sdk.js?token=SECRET';
    win.document.fire('securitypolicyviolation', { effectiveDirective: 'script-src-elem', blockedURI: refused, disposition: 'enforce', sourceFile: 'https://admin.example/online/room/24040756' });
    win.document.fire('securitypolicyviolation', { effectiveDirective: 'script-src-elem', blockedURI: refused.replace('whiteboard-sdk.js', 'other.js'), disposition: 'enforce' });
    win.document.fire('securitypolicyviolation', { effectiveDirective: 'style-src-elem', blockedURI: refused.replace('.js', '.css'), disposition: 'enforce' });
    win.document.fire('securitypolicyviolation', { effectiveDirective: 'script-src-elem', blockedURI: 'blob:https://admin.example/6117af9a', disposition: 'enforce' });
    win.document.fire('securitypolicyviolation', { effectiveDirective: 'img-src', blockedURI: 'https://elsewhere.example/x.png', disposition: 'report' });
    win.document.fire('securitypolicyviolation', { effectiveDirective: 'script-src', blockedURI: 'eval', disposition: 'enforce', sourceFile: 'https://us05st1.zoom.us/web_client_whiteboard/mwfe40q7/dist/es/pwa-Dj0eFPfC.js', lineNumber: 280802 });
    win.document.fire('securitypolicyviolation', { effectiveDirective: 'script-src', blockedURI: 'eval', disposition: 'enforce', sourceFile: 'https://us05st1.zoom.us/web_client_whiteboard/mwfe40q7/dist/es/pwa-Dj0eFPfC.js', lineNumber: 5 });
    win.document.fire('securitypolicyviolation', { effectiveDirective: 'script-src', blockedURI: 'eval', disposition: 'enforce', sourceFile: 'https://admin.example/_next/static/chunks/app.js' });
    const blocked = logs.filter(([event]) => event === 'csp blocked').map(([, detail]) => JSON.parse(JSON.stringify(detail)));
    assert.deepEqual(blocked, [{ directive: 'script-src-elem', host: 'us06st1.zoom.us', source: 'admin.example' }, { directive: 'script-src-elem', host: 'us06st1.zoom.us' }, { directive: 'style-src-elem', host: 'us06st1.zoom.us' },
      { directive: 'script-src-elem', host: 'blob' }, { directive: 'script-src', host: 'eval', source: 'us05st1.zoom.us', expected: 'whiteboard-eval-probe' }, { directive: 'script-src', host: 'eval', source: 'admin.example' }],
      'one line per directive, host and asking host; the named refusal is marked, the same refusal from the page itself is not; a report-only policy is not a refusal');
    // As printed: only the named refusal carries `expected=`.
    const printedLines = [];
    const realInfo = console.info; console.info = line => printedLines.push(line);
    try { for (const [event, detail] of logs.filter(([event]) => event === 'csp blocked')) (await import('../src/lib/online/zoom-room-session.mjs')).roomLog(event, detail); } finally { console.info = realInfo; }
    assert.deepEqual(printedLines.map(line => line.replace(/^\[online room\] \S+ /, '')).slice(-2), ['csp blocked directive=script-src host=eval source=us05st1.zoom.us expected=whiteboard-eval-probe', 'csp blocked directive=script-src host=eval source=admin.example']);
    const printed = JSON.stringify(logs);
    for (const secret of ['web_client_whiteboard', 'mveoc7k9', 'mwfe40q7', 'pwa-', '280802', 'SECRET', 'whiteboard-sdk', '24040756', '6117af9a', '/online/room', '_next']) assert.ok(!printed.includes(secret), `the trace never carries ${secret}`);
    await room.stop();
    assert.equal(win.document.count('securitypolicyviolation'), 0, 'listener removed with the room');
  }
  assert.equal(WHITEBOARD_READ_ONLY_TEXT, 'Le tableau blanc s’affiche en lecture seule sur cet appareil. Pour écrire au tableau, utilisez un ordinateur.');

  // The toolkit still reads the undocumented whiteboard key (N4): its default
  // configuration carries the three values and its code reads each of them. An upgrade
  // that drops or renames the key fails here.
  const bundle = readFileSync(TOOLKIT_BUNDLE, 'utf8');
  assert.ok(/whiteboard:\s*\{\s*enable:\s*!0,\s*enableExport:\s*!0,\s*enableViewerUserExport:\s*!0\s*\}/.test(bundle), 'toolkit default configuration has the whiteboard key');
  assert.ok(/featuresOptions\?\.whiteboard\?\.enable(?![\w$])/.test(bundle), 'toolkit reads whiteboard.enable');
  assert.ok(/featuresOptions\?\.whiteboard\?\.enableExport(?![\w$])/.test(bundle), 'toolkit reads whiteboard.enableExport');
  assert.ok(/whiteboard:\s*\{\s*enableExport:\s*[\w$]+,\s*enableViewerUserExport:\s*[\w$]+\s*\}/.test(bundle), 'toolkit reads whiteboard.enableViewerUserExport');
  // What the room relies on besides the key: the SDK client under window.zmClient, the
  // two whiteboard events, the command channel event and Zoom's device rule.
  assert.ok(bundle.includes('window.zmClient = '), 'toolkit exposes the SDK client');
  for (const event of ['"whiteboard-status-change"', '"peer-whiteboard-state-change"', '"command-channel-message"', '"command-channel-status"']) assert.ok(bundle.includes(event), event);
  assert.ok(/navigator\.hardwareConcurrency\s*>\s*2\s*&&\s*![\w$]+\)/.test(bundle), 'the device rule is still: more than two cores and not Android or iOS');
}

// 9. Groups (plan online-classroom-tools.md, PR B). A move into a group or back is
//    `Reconnecting` then `Connected`: never a leave, a failure or a closing, never the
//    join timer, whatever the reason says; the participant list starts again. `Closed`
//    still leaves and `Fail` still shows the error card.
{
  const REASONS = ['join breakout room', 'move to breakout room', 'back to main session', 'a reason this code has never seen', undefined];
  const calls = [], logs = [], toolkit = fakeToolkit(calls);
  const { room, container } = open(toolkit, calls, logs, { joinTimeoutMs: 40 });
  await room.ready;
  container.click('Rejoindre le cours');
  toolkit.connect();
  toolkit.emit('user-added', [{ userId: 1, displayName: 'Sara L.', isHost: true }, { userId: 2, displayName: 'Amal B.' }, { userId: 3, displayName: 'Nour K.' }]);
  calls.length = 0;
  for (const reason of REASONS) {
    logs.length = 0;
    toolkit.emit('connection-change', { state: 'Reconnecting', reason });
    // Zoom lists everybody again with new ids and sends no « removed » event.
    toolkit.emit('user-added', [{ userId: 100, displayName: 'Amal B.' }]);
    toolkit.emit('connection-change', { state: 'Connected' });
    toolkit.emit('user-added', [{ userId: 101, displayName: 'Nour K.' }]);
    assert.deepEqual(logs.filter(([event]) => event.startsWith('participant')).map(([, d]) => d.total), [1, 2], `the list starts again on a move (${reason})`);
    assert.deepEqual(logs.filter(([event]) => event === 'room move').map(([, d]) => d.reason), [reason]);
    await tick(60); // well past the join timeout: a move never starts the join timer
  }
  assert.deepEqual(calls, [], 'a move never calls onLeft, onError or onClosing, never leaves and never destroys');
  assert.ok(!logs.some(([event]) => event === 'join attempt' || event === 'room failed' || event === 'room left'));
  // The source never looks at the reason text.
  const source = read('src/lib/online/zoom-room-session.mjs').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/breakout|main session|subsession/i.test(source), 'no behaviour depends on the reason text');
  assert.equal((source.match(/payload\?\.reason/g) || []).length, 3, 'the reason is only printed (connection, room move) or handed to the error mapping (on Fail)');
  // Closed still leaves, once.
  toolkit.emit('connection-change', { state: 'Closed', reason: 'ended by host' });
  toolkit.close();
  await tick(10);
  assert.deepEqual(calls.filter(c => c.startsWith('page:')), ['page:onLeft']);
  await room.stop();
  // Fail after a move still shows the error card, after cleanup.
  const calls2 = [], logs2 = [], toolkit2 = fakeToolkit(calls2);
  const second = open(toolkit2, calls2, logs2);
  await second.room.ready;
  toolkit2.connect();
  toolkit2.emit('connection-change', { state: 'Reconnecting', reason: 'join breakout room' });
  toolkit2.emit('connection-change', { state: 'Fail', errorCode: 200, reason: 'network' });
  await tick(10);
  assert.deepEqual(calls2.filter(c => c.startsWith('page:') || c.startsWith('destroy')), ['page:onClosing', 'destroy:start', 'destroy:end', 'page:onError:200']);
  await second.room.stop();
}

// 10. The timer of the toolkit's groups window (owner decision of 2026-11-16). The
//     toolkit passes what the teacher typed as a string and never switches Zoom's timer
//     on; the room corrects the options on their way to Zoom and touches nothing else.
{
  // What the teacher typed is minutes; a number came from Zoom and is seconds.
  assert.equal(GROUP_TIMER_DEFAULT_SECONDS, 1800);
  assert.equal(groupTimerSeconds('10'), 600);
  assert.equal(groupTimerSeconds(' 2 '), 120);
  assert.equal(groupTimerSeconds('1.5'), 90);
  assert.equal(groupTimerSeconds('1,5'), 90);
  assert.equal(groupTimerSeconds(1800), 1800);
  assert.equal(groupTimerSeconds(600), 600);
  assert.equal(groupTimerSeconds('99999'), 24 * 60 * 60, 'capped at a day');
  for (const bad of ['', ' ', '0', '-5', 'abc', '1e999', 0, -1, NaN, Infinity, null, undefined, {}, []]) assert.equal(groupTimerSeconds(bad), 1800, `unusable value ${JSON.stringify(bad)} is Zoom's default`);
  // As the toolkit calls it (observed with Zoom, 2026-11-16): box ticked, value typed.
  const typed = { isAutoJoinSubsession: false, isSubsessionSelectionEnabled: false, isBackToMainSessionEnabled: true, isTimerEnabled: false, timerDuration: '90', isTimerAutoEnabled: true, waitSeconds: 0, isAutoMoveBackToMainSession: false };
  assert.deepEqual(groupOpenOptions(typed), { ...typed, isTimerEnabled: true, timerDuration: 5400 });
  assert.equal(typed.timerDuration, '90', 'the toolkit\'s own object is not changed');
  // Box ticked, nothing typed: Zoom's default duration, with the timer on.
  assert.deepEqual(groupOpenOptions({ ...typed, timerDuration: 1800 }), { ...typed, isTimerEnabled: true, timerDuration: 1800 });
  // Box not ticked: no timer, and a typed value can no longer make the call time out.
  assert.deepEqual(groupOpenOptions({ ...typed, isTimerAutoEnabled: false }), { ...typed, isTimerAutoEnabled: false, isTimerEnabled: false, timerDuration: 5400 });
  assert.deepEqual(groupOpenOptions({ ...typed, isTimerAutoEnabled: false, isTimerEnabled: true, timerDuration: 1800 }), { ...typed, isTimerAutoEnabled: false, isTimerEnabled: false, timerDuration: 1800 }, 'the timer follows the box only');
  // Every other option goes through untouched, in every combination.
  for (const back of [true, false]) for (const auto of [true, false]) {
    const out = groupOpenOptions({ ...typed, isBackToMainSessionEnabled: back, isAutoJoinSubsession: auto, waitSeconds: 30 });
    assert.deepEqual([out.isBackToMainSessionEnabled, out.isAutoJoinSubsession, out.waitSeconds, out.isAutoMoveBackToMainSession, out.isSubsessionSelectionEnabled], [back, auto, 30, false, false]);
  }
  assert.equal(groupOpenOptions(undefined), undefined);
  assert.equal(groupOpenOptions(null), null);

  // On the SDK client: once per client object, the list of groups untouched, the SDK's
  // own answer (or refusal) handed back as it is.
  const seen = [], opened = [];
  const subsession = { openSubsessions(list, options) { seen.push([list, options, this === subsession]); return options?.fail ? Promise.reject({ type: 'INVALID_OPERATION' }) : Promise.resolve('opened'); } };
  const win = { zmClient: { getSubsessionClient: () => subsession } };
  assert.equal(correctGroupTimer(win, seconds => opened.push(seconds)), true);
  const corrected = subsession.openSubsessions;
  assert.equal(correctGroupTimer(win, () => opened.push('twice')), true);
  assert.equal(subsession.openSubsessions, corrected, 'not wrapped twice');
  const list = [{ subsessionId: '{A}', subsessionName: 'Subsession 1', userList: [{ userId: 2, displayName: 'Amal B.' }] }];
  assert.equal(await subsession.openSubsessions(list, typed), 'opened');
  assert.equal(seen[0][0], list, 'the same list object');
  assert.deepEqual(seen[0][1], { ...typed, isTimerEnabled: true, timerDuration: 5400 });
  assert.equal(seen[0][2], true, 'called on the client itself');
  await subsession.openSubsessions(list, { ...typed, isTimerAutoEnabled: false });
  await assert.rejects(subsession.openSubsessions(list, { ...typed, fail: true }), { type: 'INVALID_OPERATION' });
  assert.deepEqual(opened, [5400, 0, 5400], 'the trace gets the timer in seconds, or 0 without one');
  // A trace that throws does not stop the call; a missing client is not an error.
  const other = { openSubsessions: async () => 'ok' };
  assert.equal(correctGroupTimer({ zmClient: { getSubsessionClient: () => other } }, () => { throw new Error('trace'); }), true);
  assert.equal(await other.openSubsessions([], typed), 'ok');
  for (const missing of [undefined, {}, { zmClient: {} }, { zmClient: { getSubsessionClient: () => null } }, { zmClient: { getSubsessionClient() { throw new Error('not ready'); } } }, { zmClient: { getSubsessionClient: () => ({}) } }])
    assert.equal(correctGroupTimer(missing), false);
  // Review N2 of #195: a client that refuses the assignment (frozen, or a setter that
  // throws) is not an error either; the call stays Zoom's own.
  const frozen = Object.freeze({ openSubsessions: async () => 'zoom' });
  assert.equal(correctGroupTimer({ zmClient: { getSubsessionClient: () => frozen } }), false);
  const guarded = {};
  Object.defineProperty(guarded, 'openSubsessions', { get: () => async () => 'zoom', set() { throw new Error('read-only'); } });
  assert.equal(correctGroupTimer({ zmClient: { getSubsessionClient: () => guarded } }), false);
  const sealed = Object.preventExtensions({ openSubsessions: async () => 'zoom' });
  assert.equal(correctGroupTimer({ zmClient: { getSubsessionClient: () => sealed } }), false, 'cannot be marked: not reported as corrected');
  // Review N5: never below one second (Zoom reads 0 as no timer).
  assert.equal(groupTimerSeconds('0.001'), 1);
  assert.equal(groupTimerSeconds('0,004'), 1);
  assert.equal(groupTimerSeconds(0.2), 1);
  assert.equal(groupTimerSeconds(1e-9), 1);

  // The room puts it on at every connection (a retry gets a new client), and traces the
  // timer only: never a group name or who is in a group.
  const calls = [], logs = [], toolkit = fakeToolkit(calls);
  const r = open(toolkit, calls, logs);
  const sub = { openSubsessions: async () => {} };
  r.win.zmClient = { getSubsessionClient: () => sub };
  await r.room.ready;
  toolkit.connect();
  const wrapped = sub.openSubsessions;
  toolkit.emit('connection-change', { state: 'Reconnecting', reason: 'join breakout room' });
  toolkit.emit('connection-change', { state: 'Connected' });
  assert.equal(sub.openSubsessions, wrapped);
  await sub.openSubsessions([{ subsessionId: '{A}', subsessionName: 'Les Lions', userList: [{ userId: 2, displayName: 'Amal B.' }] }], { ...typed, timerDuration: '10' });
  await sub.openSubsessions([], { ...typed, isTimerAutoEnabled: false });
  assert.deepEqual(logs.filter(([event]) => event === 'groups open').map(([, d]) => d), [{ timer: '600s' }, { timer: 'off' }]);
  assert.ok(!JSON.stringify(logs).includes('Les Lions') && !JSON.stringify(logs.filter(([event]) => event === 'groups open')).includes('Amal'), 'the trace never carries a group name');
  assert.deepEqual(logs.filter(([event]) => event === 'groups timer').map(([, d]) => d), [{ correction: 'on' }], 'traced once, at the first connection');
  await r.room.stop();
  // Without the SDK client (or with one that refuses the correction) the room still
  // connects, asks for the whiteboard and traces `correction=off`, once.
  for (const client of [undefined, { getSubsessionClient: () => Object.freeze({ openSubsessions: async () => {} }) }, { getSubsessionClient() { throw new Error('gone'); } }]) {
    const c2 = [], l2 = [], t2 = fakeToolkit(c2);
    const r2 = open(t2, c2, l2);
    const sent = [];
    r2.win.zmClient = client && { ...client, getCommandClient: () => ({ send: async text => sent.push(text) }) };
    await r2.room.ready;
    t2.connect();
    t2.emit('connection-change', { state: 'Reconnecting', reason: 'join breakout room' });
    t2.emit('connection-change', { state: 'Connected' });
    assert.deepEqual(l2.filter(([event]) => event === 'groups timer').map(([, d]) => d), [{ correction: 'off' }]);
    assert.ok(!c2.some(call => call.startsWith('page:')), 'nothing reaches the page');
    if (client) assert.deepEqual(sent, [WHITEBOARD_SIGNAL.ask, WHITEBOARD_SIGNAL.ask], 'the whiteboard question still goes out after each connection');
    await r2.room.stop();
  }

  // The facts the correction rests on, read in the installed bundle. An upgrade that
  // repairs the toolkit (or changes the call) fails here, and the correction is re-read.
  const bundle = readFileSync(TOOLKIT_BUNDLE, 'utf8');
  assert.ok(bundle.includes('window.zmClient = '), 'toolkit exposes the SDK client');
  assert.ok(/onChange: \(\w+\) => \w+\("timerDuration", \w+\.target\.value\)/.test(bundle), 'the toolkit still passes the typed value as a string');
  assert.ok(!/isTimerEnabled/.test(bundle.slice(bundle.indexOf('uikit-subsession-rooms-settings-dialog') - 6000, bundle.indexOf('uikit-subsession-rooms-settings-dialog') + 8000)), 'the toolkit\'s settings still never switch the timer on');
  assert.ok(/\.isTimerEnabled && \w+\.timerDuration > 0/.test(bundle), 'Zoom counts down only when isTimerEnabled is true');
  assert.ok(/await \w+\.openSubsessions\(\w+, \{\s*\.\.\.\w+,\s*waitSeconds:/.test(bundle), 'the toolkit opens the groups with openSubsessions(list, options)');
}

// ---- Tab guard ----
function fakeLocks() {
  const held = new Map(), queue = new Map();
  const grant = (name, callback, resolve) => {
    held.set(name, true);
    Promise.resolve(callback({ name })).then(value => {
      held.delete(name);
      resolve(value);
      const next = queue.get(name)?.shift();
      if (next) grant(name, next.callback, next.resolve);
    });
  };
  return { request(name, options, callback) {
    return new Promise((resolve, reject) => {
      if (!held.has(name)) return grant(name, callback, resolve);
      if (options.ifAvailable) return Promise.resolve(callback(null)).then(resolve);
      const entry = { callback, resolve };
      (queue.get(name) || queue.set(name, []).get(name)).push(entry);
      options.signal?.addEventListener('abort', () => { queue.set(name, queue.get(name).filter(e => e !== entry)); reject(new DOMException('aborted', 'AbortError')); });
      return undefined;
    });
  } };
}
function fakeChannels() {
  const all = new Set();
  return class Channel {
    constructor(name) { this.name = name; all.add(this); }
    postMessage(data) { for (const other of all) if (other !== this && other.name === this.name) queueMicrotask(() => other.onmessage?.({ data })); }
    close() { all.delete(this); }
  };
}
{
  assert.equal(roomGuardKey('lesson', 'person'), 'eh-online-room:lesson:person');
  assert.notEqual(roomGuardKey('lesson', 'a'), roomGuardKey('lesson', 'b'), 'a parent may open two children in two tabs');
  // Web Locks: the second tab is refused; « Utiliser cet onglet » makes the first leave.
  const locks = fakeLocks(), Channel = fakeChannels(), key = roomGuardKey('l1', 'p1');
  const events = [];
  const first = createTabGuard({ key, locks, Channel, retryMs: 5, onTakeover: () => { events.push('first asked to leave'); setTimeout(() => { events.push('first left the room'); first.release(); }, 20); } });
  const second = createTabGuard({ key, locks, Channel, retryMs: 5, onTakeover: () => events.push('second asked to leave') });
  assert.equal(await first.acquire(), 'held');
  assert.equal(await second.acquire(), 'busy');
  assert.equal(await createTabGuard({ key: roomGuardKey('l2', 'p1'), locks, Channel }).acquire(), 'held', 'another lesson is free');
  const taking = second.takeOver().then(result => { events.push(`second ${result}`); return result; });
  assert.equal(await taking, 'held');
  assert.deepEqual(events, ['first asked to leave', 'first left the room', 'second held'], 'the second tab enters only after the first has left');
  assert.equal(first.held, false);
  // A first tab that does not answer: the takeover gives up.
  const third = createTabGuard({ key, locks, Channel, retryMs: 5, takeoverMs: 30 });
  assert.equal(await third.acquire(), 'busy');
  second.close(); // closing releases
  assert.equal(await third.acquire(), 'held');
  const stuck = createTabGuard({ key, locks, Channel, retryMs: 5, takeoverMs: 30 });
  third.close = () => {}; // never answers
  const deaf = createTabGuard({ key: roomGuardKey('l3', 'p1'), locks, Channel: null, retryMs: 5 });
  assert.equal(await deaf.acquire(), 'held');
  assert.equal(await createTabGuard({ key: roomGuardKey('l3', 'p1'), locks, Channel: null, retryMs: 5, takeoverMs: 30 }).takeOver(), 'busy');
  assert.equal(await stuck.acquire(), 'busy');

  // No Web Locks: BroadcastChannel ping, takeover and release.
  const Channel2 = fakeChannels(), key2 = roomGuardKey('l4', 'p1');
  const a = createTabGuard({ key: key2, locks: null, Channel: Channel2, pingMs: 30, onTakeover: () => setTimeout(() => a.release(), 10) });
  const b = createTabGuard({ key: key2, locks: null, Channel: Channel2, pingMs: 30, takeoverMs: 200 });
  assert.equal(await a.acquire(), 'held');
  assert.equal(await b.acquire(), 'busy');
  assert.equal(await b.takeOver(), 'held');
  assert.equal(a.held, false);
  // Neither API: the tab is let in, as before this change.
  assert.equal(await createTabGuard({ key: key2, locks: null, Channel: null }).acquire(), 'unguarded');
}

// ---- Error mapping (R4 diagnosis table): by code, never by Zoom's text.
{
  const text = detail => roomErrorFor(detail).text, retry = detail => roomErrorFor(detail).retry;
  // Account or key refused.
  for (const code of [3004, 3620, 3627, 4007, 4011, 4012, 4013, 4014, 4015, 4017, 4018, 5013]) {
    assert.equal(text({ code }), 'La salle de cours n’est pas disponible pour le moment. Prévenez l’accueil.', String(code));
    assert.equal(retry({ code }), false);
  }
  // Session full: the existing capacity text.
  assert.equal(text({ code: 4005 }), 'Ce cours en ligne est complet.');
  // Network or timeout.
  for (const code of [200, 3621, 'join_timeout']) {
    assert.equal(text({ code }), 'Connexion instable. Vérifiez votre réseau, puis réessayez.', String(code));
    assert.equal(retry({ code }), true);
  }
  // Token expired or invalid: Zoom's own code, or code 200 once the platform knows the pass is past its expiry.
  assert.equal(text({ code: 4016 }), 'Votre accès a expiré. Rouvrez la salle depuis votre espace.');
  assert.equal(text({ code: 200, passExpired: true }), 'Votre accès a expiré. Rouvrez la salle depuis votre espace.');
  assert.equal(retry({ code: 200, passExpired: true }), true);
  assert.equal(roomErrorFor({ code: 4005, passExpired: true }).key, 'full', 'an expired pass only re-reads the catch-all code');
  assert.equal(roomErrorFor({ code: 'join_timeout', passExpired: true }).key, 'network');
  // Zoom's wording never decides: the same code with any reason gives the same text.
  assert.equal(text({ code: 200, reason: 'Verify JWT failed' }), text({ code: 200, reason: 'The token has expired' }));
  // Anything else: the existing provider_error text, with a retry.
  for (const code of [3000, 3008, 3009, 3625, 4004, 4006, 4008, 5012, 'toolkit', 987654, '__proto__', undefined]) {
    assert.equal(text({ code }), 'La salle de cours n’a pas pu être ouverte. Réessayez dans un instant.', String(code));
    assert.equal(retry({ code }), true);
  }
  assert.equal(roomErrorFor(undefined).key, 'other');
  assert.deepEqual(Object.keys(ROOM_ERRORS), ['account', 'pass', 'full', 'network', 'other']);
  assert.equal(roomErrorKey(200), 'network');
  // The pass expiry comes from the embed, on the participant's clock.
  const at = Date.parse('2026-11-14T10:00:00Z');
  assert.equal(passExpired({ tokenExpiresAt: '2026-11-14T10:00:00Z', expiresAt: '2026-11-14T09:00:00Z' }, at - 1), false);
  assert.equal(passExpired({ tokenExpiresAt: '2026-11-14T10:00:00Z' }, at), true);
  assert.equal(passExpired({ expiresAt: '2026-11-14T10:00:00Z' }, at + 1), true);
  assert.equal(passExpired({}, at), false);
  assert.equal(passExpired(undefined, at), false);
}

// ---- French resources against the installed toolkit bundle ----
{
  const english = toolkitEnglish();
  const french = JSON.parse(read('src/lib/online/zoom-fr-FR.json'));
  assert.ok(Object.keys(english).length > 1000, 'the bundle key list was read');
  const wanted = Object.keys(english).filter(reachable);
  const placeholders = text => (text.match(/\{\{\s*\w+\s*\}\}|<\/?\w+>/g) || []).map(p => p.replace(/\s/g, '')).sort().join(' ');
  for (const key of wanted) {
    assert.ok(Object.hasOwn(french, key), `fr-FR is missing ${key}`);
    assert.equal(typeof french[key], 'string', key);
    assert.equal(french[key].trim() === '', english[key].trim() === '', `fr-FR ${key} is empty`);
    assert.equal(placeholders(french[key]), placeholders(english[key]), `fr-FR ${key} keeps its placeholders`);
  }
  for (const key of Object.keys(french)) assert.ok(Object.hasOwn(english, key) && reachable(key), `fr-FR has an unknown or unreachable key: ${key}`);
  for (const prefix of UNREACHABLE_PREFIXES) assert.ok(Object.keys(english).some(key => key.startsWith(prefix)), `stale exclusion ${prefix}`);
  // Whiteboard strings are reachable since PR A (plan online-classroom-tools.md) and are
  // French: none is left equal to the English one, except the two file formats.
  assert.ok(!UNREACHABLE_PREFIXES.includes('whiteboard.'));
  const whiteboardKeys = Object.keys(english).filter(key => key.startsWith('whiteboard.'));
  assert.equal(whiteboardKeys.length, 29);
  for (const key of whiteboardKeys) assert.equal(french[key] === english[key], ['whiteboard.format_pdf', 'whiteboard.format_png'].includes(key), `${key} is French`);
  assert.equal(french['whiteboard.start_tooltip'], 'Ouvrir le tableau blanc');
  assert.equal(french['whiteboard.stop_button'], 'Fermer le tableau blanc');
  assert.equal(french['whiteboard.export_and_close'], 'Exporter et fermer');
  // Groups are reachable since PR B and are French, with the owner's words (D10):
  // « Groupes », « salle principale ». None is left equal to the English one except the
  // two words that are the same in both languages, and none says « sous-groupe ».
  assert.ok(!UNREACHABLE_PREFIXES.includes('subsession.'));
  const groupKeys = Object.keys(english).filter(key => key.startsWith('subsession.'));
  assert.equal(groupKeys.length, 174);
  for (const key of groupKeys) assert.equal(french[key] === english[key], ['subsession.minutes', 'subsession.options'].includes(key), `${key} is French`);
  for (const [key, value] of Object.entries(french)) assert.ok(!/sous-groupe|subsession|breakout/i.test(value.replace(/\{\{\s*\w+\s*\}\}/g, '')), `${key} uses the owner's word`);
  assert.equal(french['subsession.label'], 'Groupes');
  assert.equal(french['subsession.menu_title'], 'Groupes');
  assert.equal(french['subsession.ask_for_help'], 'Demander de l’aide');
  assert.equal(french['subsession.broadcast_message_title'], 'Message à tous les groupes');
  assert.equal(french['subsession.close_all_rooms'], 'Fermer tous les groupes');
  assert.equal(french['subsession.invite_join_room_tip_content'], 'Vous êtes invité à rejoindre le groupe :');
  // The toolkit's own leave menu inside a group: two choices that cannot be confused.
  assert.equal(french['leave.button_leave_subsession'], 'Revenir à la salle principale');
  assert.equal(french['leave.session'], 'Quitter le cours');
  assert.equal(french['subsession.return_to_main_session'], 'Revenir à la salle principale');
  assert.match(french['subsession.leave_room_tips'], /salle principale/);
  // Spot checks: the screens every participant sees.
  assert.equal(french['preview.join_button'], 'Rejoindre le cours');
  assert.equal(french['gallery.no_other_participants'], 'Aucun autre participant');
  assert.equal(french['settings.language.fr-FR'], 'Français');
  // The toolkit ships no French itself (if it ever does, revisit this file).
  assert.ok(!/"fr-FR":\s*\{\s*translation/.test(readFileSync(new URL('../node_modules/@zoom/videosdk-ui-toolkit/dist/videosdk-ui-toolkit.min.esm.js', import.meta.url), 'utf8')));
}

// ---- The approved room configuration and the component contract (source checks) ----
{
  const component = read('src/components/online/ZoomRoom.jsx');
  // Owner decision 2026-11-14: pre-join device screen on, name locked (T-P4 unchanged).
  assert.match(component, /preview: \{ enable: true, isAllowModifyName: false \}/);
  for (const off of ['recording', 'invite', 'phone', 'feedback', 'troubleshoot', 'caption', 'header', 'playback', 'virtualBackground'])
    assert.match(component, new RegExp(`${off}: \\{ enable: false`), `${off} stays off`);
  // Groups (PR B, D4): on; chat files and the emoji picker stay off (D7).
  assert.match(component, /\n  subsession: \{ enable: true \},\n/);
  assert.match(component, /chat: \{ enable: true, enableEmoji: false \}/);
  assert.match(component, /ROOM_LANGUAGE = 'fr-FR'/);
  // Whiteboard (D3): on, the teacher exports, learners draw but do not export. The
  // learner's enableExport is false as well: enableViewerUserExport alone leaves Zoom's
  // own « Exporter au format PNG » link in the learner's whiteboard.
  assert.match(component, /\n  whiteboard: \{ enable: true, enableExport: true, enableViewerUserExport: false \},\n/);
  assert.match(component, /LEARNER_WHITEBOARD = Object\.freeze\(\{ enable: true, enableExport: false, enableViewerUserExport: false \}\)/);
  assert.match(component, /featuresFor = role => \(role === 'host' \? FEATURES : Object\.freeze\(\{ \.\.\.FEATURES, whiteboard: LEARNER_WHITEBOARD \}\)\)/);
  assert.match(component, /featuresOptions: featuresFor\(role\), leaveOnPageUnload: true/);
  assert.match(component, /\{boardReadOnly && !closing && <p [^\n]*data-testid="room-whiteboard-readonly">\{WHITEBOARD_READ_ONLY_TEXT\}<\/p>\}/);
  assert.ok(!/innerWidth|matchMedia|sm:hidden[^\n]*whiteboard/.test(component), 'the read-only line is not keyed on the window width');
  // The room effect depends on the embed only; the page's callbacks are read through a ref.
  const deps = [...component.matchAll(/\}, \[([^\]]*)\]\);/g)].map(m => m[1]);
  assert.deepEqual(deps, ['token, sessionName, displayName, role'], 'one effect with dependencies, on the embed only');
  assert.ok(!/onLeft, onError\]/.test(component));
  assert.match(component, /callbacks\.current\.onLeft/);
  // French resources are inline: no language file is fetched from any host.
  assert.match(component, /import frFR from '@\/lib\/online\/zoom-fr-FR\.json'/);
  assert.ok(!/https?:\/\//.test(component) && !/https?:\/\//.test(read('src/lib/online/zoom-room-session.mjs')) && !/https?:\/\//.test(read('src/lib/online/zoom-groups.mjs')) && read('src/lib/online/zoom-whiteboard.mjs').match(/https?:\/\/[^\s'"`]+/g).every(url => WHITEBOARD_SOURCES.includes(url)), 'no URL in the room code but the two whiteboard sources');
  // The one URL the room adds is the Zoom library host, in zoom-media-chunks.mjs (checked above).
  assert.deepEqual(read('src/lib/online/zoom-media-chunks.mjs').match(/https?:\/\/[^\s'"`$)]+/g).filter(url => !url.startsWith('https://source.zoom.us/videosdk/')), []);
  // The empty-gallery pager rule is scoped to the room container.
  assert.match(component, /\[data-testid="zoom-room"\] \.flex-grow[^\n]*:has\(/);
  // The toolkit's leave menu stays visible once placed (it hides itself on every redraw,
  // every second while a group timer runs). The facts the rule rests on, in the bundle:
  // the menu layer's inline style, and the clean-up that hides it.
  assert.match(component, /\n\.zoom-ui-toolkit-root > div\[style\*="visibility: hidden"\]\[style\*="z-index: 1000"\]:not\(\[style\*="top: 0px"\]\) \{ visibility: visible !important; \}`;/);
  const toolkitBundle = readFileSync(TOOLKIT_BUNDLE, 'utf8');
  assert.ok(/visibility: \w+ \? "visible" : "hidden",\s*top: \w+\?\.top,\s*left: \w+\?\.left,\s*zIndex: 1e3/.test(toolkitBundle), 'the toolkit menu layer still has this inline style');
  assert.ok(/window\.removeEventListener\("orientationchange", \w+\), \w+\(!1\);\s*\};\s*\}, \[\w+, \w+, \w+\]\)/.test(toolkitBundle), 'the toolkit menu still hides itself in the clean-up of an effect that depends on its onClickOutside');
  assert.ok(/useState\(\{ top: 0, left: 0 \}\)/.test(toolkitBundle), 'an unplaced menu is at top 0');
  const page = read('src/app/(admin)/online/room/[id]/page.jsx');
  assert.match(page, /Vous êtes déjà connecté à ce cours dans un autre onglet\./);
  assert.match(page, /Utiliser cet onglet/);
  assert.match(page, /Touchez l’icône casque pour activer le son, puis le micro et la caméra\./);
  assert.match(page, /await roomSettled\(\);\n\s+if \(displaced\.current\) return;\n\s+const result = await onlinePost\('\/api\/online\/join'/, 'a retry waits for the previous room before asking for a pass');
  assert.ok(!/next\/link|useRouter/.test(page), 'the room page keeps full document navigation (A6)');
  // « Quitter le cours » (PR B): asks first whenever the participant is in the room, and
  // reads nothing from Zoom to decide; both ways out are plain anchors.
  assert.match(page, /<RoomLeaveLink href=\{back\} inRoom=\{state\.phase === 'in_room'\} \/>/);
  const leave = read('src/components/online/RoomLeaveLink.jsx');
  assert.match(leave, /<a href=\{href\} data-testid="room-leave" onClick=\{event => \{ if \(inRoom\) \{ event\.preventDefault\(\); setAsking\(true\); \} \}\}><LogOut \/> Quitter le cours<\/a>/);
  assert.match(leave, /<AlertDialogTitle>Quitter le cours \?<\/AlertDialogTitle>/);
  assert.match(leave, /<AlertDialogDescription>Vous sortirez de la salle pour tout le cours\.<\/AlertDialogDescription>/);
  assert.match(leave, /<AlertDialogAction asChild><a href=\{href\} data-testid="room-leave-yes">Quitter le cours<\/a><\/AlertDialogAction>/);
  assert.ok(!/zmClient|subsession|next\/link|useRouter|location/.test(leave), 'the leave link knows nothing about Zoom or groups and navigates by plain anchors');
  // Review B1: a takeover during a join in flight stops that join at every await.
  assert.match(page, /onTakeover: \(\) => \{ if \(live\) \{ displaced\.current = true; setState\(\{ phase: 'displaced' \}\); \} \}/);
  const joinBody = page.slice(page.indexOf('const join = useCallback'), page.indexOf('}, [id, student]);'));
  assert.equal((joinBody.match(/if \(displaced\.current\) return;/g) || []).length, 4, 'entry, after roomSettled, after the pass request, after the window check');
  assert.match(joinBody, /await roomSettled\(\);\n\s+if \(displaced\.current\) return;\n\s+const result = await onlinePost/);
  assert.match(joinBody, /await onlinePost\([^\n]+\n[^\n]*\n\s+if \(displaced\.current\) return;\n\s+if \(result\.ok\)/);
}

// 11. Toolkit messages (classroom polish, part C).
{
  // The decoded token payload is dropped; nothing else is.
  const printed = [];
  const out = { log(...args) { printed.push(args); } };
  const original = out.log;
  const win = { console: out };
  assert.equal(dropToolkitJwtLog(win), true);
  assert.equal(dropToolkitJwtLog(win), true, 'idempotent');
  const filtered = out.log;
  assert.notEqual(filtered, original);
  out.log(TOOLKIT_JWT_LOG, { tpc: 'eh-roomref.lesson-uuid', user_identity: 'ref' });
  out.log(`${TOOLKIT_JWT_LOG} again`);
  out.log('[online room] 2026-11-17T10:00:00Z connection state=Connected');
  out.log('other', TOOLKIT_JWT_LOG);
  out.log({ a: 1 });
  assert.deepEqual(printed, [['[online room] 2026-11-17T10:00:00Z connection state=Connected'], ['other', TOOLKIT_JWT_LOG], [{ a: 1 }]]);
  assert.equal(dropToolkitJwtLog(win), true);
  assert.equal(out.log, filtered, 'not wrapped twice');
  for (const bad of [undefined, {}, { console: {} }, { console: Object.freeze({ log() {} }) }]) assert.equal(dropToolkitJwtLog(bad), false);
  // In the room: installed before the join.
  const calls = [], logs = [], toolkit = fakeToolkit(calls);
  const roomWin = fakeWindow();
  roomWin.console = { log: () => calls.push('console.log') };
  const join = toolkit.joinSession;
  toolkit.joinSession = (...args) => { calls.push(roomWin.console.log(TOOLKIT_JWT_LOG, {}) === undefined && calls.at(-1) !== 'console.log' ? 'jwt-dropped' : 'jwt-printed'); return join.apply(toolkit, args); };
  const r = open(toolkit, calls, logs, { win: roomWin });
  await r.room.ready;
  assert.equal(calls[0], 'jwt-dropped');
  await r.room.stop();

  // The camera message: a French reason from the printed error name, else from the device.
  assert.equal(cameraReasonFromText('[object Object]'), null);
  assert.equal(cameraReasonFromText('NotReadableError: Could not start video source'), CAMERA_REASON.busy);
  assert.equal(cameraReasonFromText('NotAllowedError: Permission denied'), CAMERA_REASON.blocked);
  assert.equal(cameraReasonFromText('NotFoundError: Requested device not found'), CAMERA_REASON.missing);
  assert.equal(cameraReasonFromText('OverconstrainedError'), CAMERA_REASON.unsupported);
  assert.equal(cameraReasonFromText('VIDEO_CAMERA_IS_TAKEN'), CAMERA_REASON.busy);
  assert.equal(cameraReasonFromDevice({ permission: 'denied', cameras: 1 }), CAMERA_REASON.blocked);
  assert.equal(cameraReasonFromDevice({ permission: 'granted', cameras: 0 }), CAMERA_REASON.missing);
  assert.equal(cameraReasonFromDevice({ permission: 'granted', cameras: 1 }), CAMERA_REASON.busy);
  assert.equal(cameraReasonFromDevice({ permission: 'prompt', cameras: 2 }), CAMERA_REASON.other);
  assert.equal(cameraReasonFromDevice({ permission: 'unknown', cameras: null }), CAMERA_REASON.other);
  for (const reason of Object.values(CAMERA_REASON)) assert.ok(!/[A-Z]{3,}|Error|object/.test(reason) && /^[a-zé’]/.test(reason), `French, readable after the colon: ${reason}`);

  // The facts these rest on, read in the installed bundle (re-read on any upgrade, PR C).
  const bundle = readFileSync(TOOLKIT_BUNDLE, 'utf8');
  assert.equal(bundle.split(`console.log("${TOOLKIT_JWT_LOG}", `).length - 1, 1, 'the toolkit still writes the decoded payload with exactly this call');
  assert.ok(/\w+\(\w+\("preview\.error_start_camera"\) \+ \w+, \{ variant: "error" \}\)/.test(bundle), 'the camera message is still the key followed by the error, concatenated');
  const french = JSON.parse(read('src/lib/online/zoom-fr-FR.json'));
  assert.equal(french['preview.error_start_camera'], 'La caméra n’a pas pu démarrer : ');
  const session = read('src/lib/online/zoom-room-session.mjs');
  assert.match(session, /dropToolkitJwtLog\(win\);\n\s+s\.stopCameraWatch = watchCameraMessage\(win, resources\?\.\['preview\.error_start_camera'\][^\n]*\n\s+const joining = toolkit\.joinSession/, 'both are in place before the join');
}

// ---- « Guide de la salle » on the teacher's lesson list (static text) ----
{
  const guide = read('src/app/(admin)/teacher-portal/online/page.jsx');
  const text = guide.slice(guide.indexOf('data-testid="room-guide"'), guide.indexOf('</details>')).replace(/<[^>]+>/g, '');
  // Owner decision of 2026-11-16: teachers are told not to use « Zoom Canvas ».
  assert.match(text, /N’utilisez pas l’outil « Zoom Canvas » du tableau blanc : la salle le bloque et il ne fonctionne pas\./);
  // D4: always a timer, and the teacher visits each group; the duration is typed, in minutes.
  assert.match(text, /Toujours un minuteur\. Dans « Paramètres », cochez « Fermer automatiquement les groupes après » et saisissez vous-même la durée en minutes/);
  assert.match(text, /Passez dans chaque groupe\./);
  // Review N6 and N8 of #195: the field may show seconds after a first opening; a group not renamed reaches the learner as « Subsession 1 ».
  assert.match(text, /Après une première ouverture, le champ peut afficher la durée en secondes : retapez toujours le nombre de minutes avant d’ouvrir\./);
  assert.match(text, /Donnez un nom à chaque groupe avec « Renommer » : l’invitation que reçoit l’apprenant affiche ce nom, sinon elle dit « Subsession 1 »\./);
  // D11: a learner on a phone for whom a group fails stays in the main room.
  assert.match(text, /Si un groupe ne fonctionne pas pour l’un d’eux, laissez-le sans groupe : il reste avec vous dans la salle principale\./);
  assert.match(text, /Ne nommez jamais un apprenant animateur ou co-animateur\./);
  assert.match(text, /« Réessayer » ramène un apprenant dans la salle principale/);
  // The words of the guide are the words of the room.
  const french = JSON.parse(read('src/lib/online/zoom-fr-FR.json'));
  for (const key of ['whiteboard.start_tooltip', 'whiteboard.export_and_close', 'subsession.auto_close_after', 'subsession.open_all_rooms', 'subsession.unassigned_participants', 'subsession.assign', 'subsession.join', 'leave.button_leave_subsession',
    'subsession.broadcast', 'subsession.ask_for_help', 'subsession.close_all_rooms', 'subsession.rename_button'])
    assert.ok(text.includes(`« ${french[key]} »`), `the guide quotes the room's own label for ${key}: « ${french[key]} »`);
  // The one English word quoted on purpose is what Zoom shows the learner (N8).
  assert.ok(!/sous-groupe|breakout|subsession/i.test(text.replace('« Subsession 1 »', '')));
}

console.log('online room unit regressions passed');
