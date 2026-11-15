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
  return { reloaded: 0, document: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} },
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
    'onSessionClosed#1', 'onSessionDestroyed#1', 'on:connection-change#1', 'on:user-added#1', 'on:user-removed#1'], 'registration order');
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
  for (const off of ['recording', 'invite', 'phone', 'feedback', 'troubleshoot', 'caption', 'subsession', 'header', 'playback', 'virtualBackground'])
    assert.match(component, new RegExp(`${off}: \\{ enable: false`), `${off} stays off`);
  assert.match(component, /ROOM_LANGUAGE = 'fr-FR'/);
  // The room effect depends on the embed only; the page's callbacks are read through a ref.
  const deps = [...component.matchAll(/\}, \[([^\]]*)\]\);/g)].map(m => m[1]);
  assert.deepEqual(deps, ['token, sessionName, displayName'], 'one effect with dependencies, on the embed only');
  assert.ok(!/onLeft, onError\]/.test(component));
  assert.match(component, /callbacks\.current\.onLeft/);
  // French resources are inline: no language file is fetched from any host.
  assert.match(component, /import frFR from '@\/lib\/online\/zoom-fr-FR\.json'/);
  assert.ok(!/https?:\/\//.test(component) && !/https?:\/\//.test(read('src/lib/online/zoom-room-session.mjs')), 'no URL in the room code');
  // The one URL the room adds is the Zoom library host, in zoom-media-chunks.mjs (checked above).
  assert.deepEqual(read('src/lib/online/zoom-media-chunks.mjs').match(/https?:\/\/[^\s'"`$)]+/g).filter(url => !url.startsWith('https://source.zoom.us/videosdk/')), []);
  // The empty-gallery pager rule is scoped to the room container.
  assert.match(component, /\[data-testid="zoom-room"\] \.flex-grow[^\n]*:has\(/);
  const page = read('src/app/(admin)/online/room/[id]/page.jsx');
  assert.match(page, /Vous êtes déjà connecté à ce cours dans un autre onglet\./);
  assert.match(page, /Utiliser cet onglet/);
  assert.match(page, /Touchez l’icône casque pour activer le son, puis le micro et la caméra\./);
  assert.match(page, /await roomSettled\(\);\n\s+if \(displaced\.current\) return;\n\s+const result = await onlinePost\('\/api\/online\/join'/, 'a retry waits for the previous room before asking for a pass');
  assert.ok(!/next\/link|useRouter/.test(page), 'the room page keeps full document navigation (A6)');
  // Review B1: a takeover during a join in flight stops that join at every await.
  assert.match(page, /onTakeover: \(\) => \{ if \(live\) \{ displaced\.current = true; setState\(\{ phase: 'displaced' \}\); \} \}/);
  const joinBody = page.slice(page.indexOf('const join = useCallback'), page.indexOf('}, [id, student]);'));
  assert.equal((joinBody.match(/if \(displaced\.current\) return;/g) || []).length, 4, 'entry, after roomSettled, after the pass request, after the window check');
  assert.match(joinBody, /await roomSettled\(\);\n\s+if \(displaced\.current\) return;\n\s+const result = await onlinePost/);
  assert.match(joinBody, /await onlinePost\([^\n]+\n[^\n]*\n\s+if \(displaced\.current\) return;\n\s+if \(result\.ok\)/);
}

console.log('online room unit regressions passed');
