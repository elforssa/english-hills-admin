// Online room lifecycle in a real browser, with a fake toolkit (no Zoom, no network, no
// database): the real room component, session controller, tab guard and error mapping
// are bundled into a small page (scripts/lib/online-room-harness.mjs) and driven with
// headless Chromium. Checks:
//   - the room effect does not re-run when the page's callbacks or role change identity;
//   - a new pass destroys the old room completely before the new one joins, also over
//     five quick reload-like retries, and the handlers go on the new instance;
//   - a failed join closes the toolkit and shows the French text chosen by error code,
//     and « Réessayer » joins again only after that destroy;
//   - a second tab on the same lesson and person is refused (Web Locks), « Utiliser cet
//     onglet » makes the first tab leave before the second one joins, and another person
//     or lesson is not blocked;
//   - leaving the page (pagehide) leaves the session; hiding the tab does not;
//   - the scoped style hides the toolkit's « 1 / -1 » pager in an empty gallery only.
//   - a takeover that arrives while the first tab still waits for its pass leaves that
//     tab displaced: the late pass never opens the room there.
//   - whiteboard: the learner's toolkit configuration has export off; the read-only line
//     follows the capability the SDK reports and the presenter's marker, not the width.
//   - groups: a move into a group or back (Reconnecting then Connected, with any reason)
//     leaves the participant in the room; « Quitter le cours » asks first whenever the
//     participant is in the room, in a group or not: staying keeps the room, confirming
//     is a full navigation; outside the room it does not ask; a question left open when
//     the room fails does not come back after « Réessayer » (review N3 of #195).
//   - the toolkit's camera message on the pre-join screen gets a French reason in place
//     of « [object Object] » or an English error name; once in the room nothing is touched.
//   - the « start devices » message gets the same treatment (review note of #197);
//   - raise hand (PR D): the learner's « Lever la main » / « Baisser la main » (above the
//     room, on a phone too, hidden inside a group, lowered by the teacher with a line
//     saying so), the teacher's « Mains levées (n) » (order, cue, « Baisser », « Baisser
//     toutes les mains », a leave), and spoofed lowers from a learner change nothing.
//   - [Reliability PR] newest connection wins (plan online-room-reliability.md): a second
//     device that enters supersedes the first at confirmation; the first shows the card
//     at once on the marker, with no automatic retry, and « Utiliser cet appareil » takes
//     the room back; a device that never reaches the room takes nothing; a failed
//     confirmation is retried and changes nothing meanwhile; the parent's notice; the
//     removed and ended texts; the teacher's page never removes anybody (D15); the
//     token-log wrapper is gone once the room has ended.
// Run by CI (browser suites) and locally: node scripts/test-online-room-lifecycle-browser.mjs
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { chromium } from '@playwright/test';
import { buildRoomHarness, serveRoomHarness } from './lib/online-room-harness.mjs';
import { CAMERA_REASON, DEVICES_REASON } from '../src/lib/online/zoom-toolkit-messages.mjs';

setTimeout(() => { console.error('FAIL online room lifecycle browser test stalled'); process.exit(1); }, 4 * 60_000).unref();
const harness = await buildRoomHarness({ fake: true });
let passes = 0;
const { server, origin, model } = await serveRoomHarness({ ...harness, embed: async query => (await new Promise(resolve => setTimeout(resolve, Number(query.delay) || 0)), { kind: 'zoom-video', token: `pass-${++passes}-${randomBytes(4).toString('hex')}`, sessionName: `room.${query.lesson}`, displayName: 'Amal B.', role: query.role === 'host' ? 'host' : 'participant' }) });
const browser = await chromium.launch({ headless: true });
const ok = name => console.log(`PASS ${name}`);
const calls = page => page.evaluate(() => window.__zoom?.calls.slice() || []);
const phase = (page, wanted) => page.waitForFunction(p => window.__phase === p, wanted, { timeout: 15000 });
const joined = (page, n) => page.waitForFunction(count => (window.__zoom?.calls || []).filter(c => c.startsWith('join#')).length === count, n, { timeout: 15000 });
const order = list => list.filter(c => /^(join#|destroy:)/.test(c)).map(c => c.replace(/:pass-.*/, ''));

try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error?.message || error)));
  const consoleLines = [];
  page.on('console', message => consoleLines.push(message.text()));
  await page.goto(`${origin}/?lesson=l1&person=p1`);
  await phase(page, 'in_room');
  await joined(page, 1);

  // French is registered on the new instance before anything else; the pre-join button is French.
  let list = await calls(page);
  assert.match(list[0], /^join#1:pass-1-/);
  assert.match(list[1], /^resources:fr-FR:\d{3}$/);
  assert.deepEqual(list.slice(2, 5), ['languageList:fr-FR', 'setLanguage:fr-FR', 'onSessionClosed#1']);
  await page.getByRole('button', { name: 'Rejoindre le cours' }).waitFor();
  assert.equal(await page.evaluate(() => window.__zoom.config.language), 'fr-FR');
  assert.deepEqual(await page.evaluate(() => window.__zoom.config.featuresOptions.preview), { enable: true, isAllowModifyName: false });
  ok('French resources and handlers are attached to the new toolkit instance');

  // The empty-gallery pager (« 1 / -1 »): on the toolkit's own markup (class names read in
  // the pinned bundle), the pager columns are hidden only while the empty message shows.
  const pagerVisibility = await page.evaluate(() => {
    const room = document.querySelector('[data-testid="zoom-room"]');
    const gallery = empty => `<div class="flex-grow flex items-center justify-between p-4"><div class="flex flex-col items-center" style="visibility: hidden"><button class="p-1 rounded-full shadow-md"></button><span class="text-xs text-theme-text mt-1">1 / -1</span></div>
      <div class="flex flex-col items-center w-4/5 max-w-4xl"><div class="w-full overflow-hidden relative">${empty ? '<div class="flex justify-center text-center text-2xl font-semibold m-2 text-theme-text"><span>Aucun autre participant</span></div>' : '<div>video</div>'}</div></div>
      <div class="flex flex-col items-center" style="visibility: visible"><button class="p-1 rounded-full shadow-md"></button><span class="text-xs text-theme-text mt-1">1 / -1</span></div></div>`;
    const probe = document.createElement('div');
    room.appendChild(probe);
    const read = empty => { probe.innerHTML = gallery(empty); return [...probe.querySelectorAll('span.text-xs')].map(span => getComputedStyle(span).visibility).concat(getComputedStyle(probe.querySelector('.w-full')).visibility); };
    const result = { empty: read(true), filled: read(false) };
    probe.remove();
    return result;
  });
  assert.deepEqual(pagerVisibility, { empty: ['hidden', 'hidden', 'visible'], filled: ['hidden', 'visible', 'visible'] }, 'pager hidden only in the empty gallery');
  ok('the « 1 / -1 » pager is hidden while the gallery is empty, and only then');

  // The toolkit's leave menu (markup and inline style read in the pinned bundle): hidden
  // by the toolkit after a redraw, it stays visible once it has been placed; a menu that
  // is not placed yet (top 0) and any other hidden element stay hidden.
  const menuVisibility = await page.evaluate(() => {
    const layer = style => { const root = document.createElement('div'); root.className = 'zoom-ui-toolkit-root'; root.innerHTML = `<div style="${style}" class="min-w-[200px] w-auto shadow-lg"><button id="probe-menu-item">Quitter le cours</button></div>`; document.body.appendChild(root); const seen = getComputedStyle(root.querySelector('button')).visibility; root.remove(); return seen; };
    return { placedHidden: layer('position: absolute; visibility: hidden; top: 648px; left: 1057px; z-index: 1000;'), placedVisible: layer('position: absolute; visibility: visible; top: 648px; left: 1057px; z-index: 1000;'),
      unplaced: layer('position: absolute; visibility: hidden; top: 0px; left: 0px; z-index: 1000;'), otherLayer: layer('position: absolute; visibility: hidden; top: 648px; left: 1057px; z-index: 50;') };
  });
  assert.deepEqual(menuVisibility, { placedHidden: 'visible', placedVisible: 'visible', unplaced: 'hidden', otherLayer: 'hidden' }, 'the leave menu stays visible once placed, and only then');
  ok('the toolkit\'s leave menu stays visible once the toolkit has placed it');

  // Identity changes of onLeft / onError (new closures on every render) never restart the room.
  const rendersBefore = await page.evaluate(() => window.__renders);
  for (let i = 0; i < 5; i++) await page.evaluate(() => window.__rerender());
  await page.waitForFunction(n => window.__renders >= n + 5, rendersBefore);
  await page.waitForTimeout(200);
  list = await calls(page);
  assert.deepEqual(order(list), ['join#1'], 'no destroy and no second join after re-renders');
  // The current callbacks are still the ones called: a session that closes leaves once.
  await page.evaluate(() => { window.__zoom.connect(); window.__zoom.close(); window.__zoom.close(); });
  await phase(page, 'left');
  list = await calls(page);
  assert.deepEqual(order(list), ['join#1', 'destroy:start', 'destroy:end']);
  ok('the room effect does not re-run on callback identity changes; the latest callbacks are used');

  // A failed join: toolkit closed first, French text by code, retry only after the destroy.
  await page.goto(`${origin}/?lesson=l1&person=p1`);
  await joined(page, 1);
  await page.getByRole('button', { name: 'Rejoindre le cours' }).click();
  await page.evaluate(() => window.__zoom.emit('connection-change', { state: 'Fail', errorCode: 4008, reason: 'participant exist' }));
  await page.getByTestId('room-refused').waitFor();
  assert.equal(await page.getByTestId('room-refused').getAttribute('data-code'), '4008');
  assert.match(await page.getByTestId('room-refused').innerText(), /La salle de cours n’a pas pu être ouverte\. Réessayez dans un instant\./);
  assert.ok(!(await page.getByTestId('room-refused').innerText()).includes('participant exist'), 'Zoom text is never shown');
  list = await calls(page);
  assert.deepEqual(list.slice(-3), ['leave', 'destroy:start', 'destroy:end'], 'the card appears after leave and destroy');
  // Five quick retries (each a new pass): joins and destroys never overlap.
  for (let i = 0; i < 5; i++) {
    await page.getByRole('button', { name: 'Réessayer' }).click();
    await joined(page, i + 2);
    await page.evaluate(() => window.__zoom.emit('connection-change', { state: 'Fail', errorCode: 200 }));
    await page.getByTestId('room-refused').waitFor();
  }
  list = await calls(page);
  const sequence = order(list);
  assert.equal(sequence.filter(c => c.startsWith('join#')).length, 6);
  for (let i = 0; i < sequence.length; i += 3) assert.deepEqual(sequence.slice(i, i + 3).map(c => c.replace(/#\d+/, '')), ['join', 'destroy:start', 'destroy:end'], sequence.join(' '));
  assert.equal(new Set(list.filter(c => c.startsWith('join#')).map(c => c.split(':')[1])).size, 6, 'each retry used a new pass');
  assert.match(await page.getByTestId('room-refused').innerText(), /Connexion instable\. Vérifiez votre réseau, puis réessayez\./);
  ok('a failure closes the toolkit before « Réessayer »; retries never overlap');

  // Page exit leaves; hiding the tab does not.
  await page.getByRole('button', { name: 'Réessayer' }).click();
  await joined(page, 7);
  await page.evaluate(() => { window.__zoom.connect(); window.__zoom.calls.length = 0; document.dispatchEvent(new Event('visibilitychange')); });
  assert.deepEqual(await calls(page), [], 'visibilitychange does not leave');
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false })));
  assert.deepEqual(await calls(page), ['leave'], 'pagehide leaves the session');
  // Console diagnostics: dated lines, no pass.
  const trace = consoleLines.filter(line => line.startsWith('[online room] '));
  assert.ok(trace.some(line => /^\[online room\] \d{4}-\d\d-\d\dT[\d:.]+Z connection state=Fail code=4008/.test(line)), 'connection states are traced with a timestamp');
  assert.ok(trace.some(line => line.includes('page exit')));
  assert.ok(!consoleLines.some(line => /pass-\d+-|room\.l1/.test(line)), 'the trace carries no token and no session name');
  ok('pagehide leaves the session, a tab switch does not; the console trace is clean');

  // Second tab, same lesson and person, same browser.
  const first = await context.newPage();
  await first.goto(`${origin}/?lesson=l2&person=p1`);
  await joined(first, 1);
  const second = await context.newPage();
  await second.goto(`${origin}/?lesson=l2&person=p1`);
  await second.getByTestId('room-other-tab').waitFor();
  assert.match(await second.getByTestId('room-other-tab').innerText(), /Vous êtes déjà connecté à ce cours dans un autre onglet\./);
  assert.equal(await second.evaluate(() => window.__zoom), undefined, 'the second tab did not ask for a pass or load the room');
  const passesBefore = passes;
  // Another learner of the same parent, and another lesson, are not blocked.
  const sibling = await context.newPage();
  await sibling.goto(`${origin}/?lesson=l2&person=p2`);
  await joined(sibling, 1);
  await sibling.close();
  assert.equal(passes, passesBefore + 1);
  // Reloading the first tab keeps it in the room (its own lock is freed by the reload).
  await first.reload();
  await joined(first, 1);
  await second.reload();
  await second.getByTestId('room-other-tab').waitFor();
  // « Utiliser cet onglet »: the first tab leaves Zoom, then the second joins.
  await first.evaluate(() => { window.__zoom.connect(); window.__zoom.destroyMs = 400; });
  await second.getByRole('button', { name: 'Utiliser cet onglet' }).click();
  await first.getByTestId('room-displaced').waitFor();
  await joined(second, 1);
  const firstCalls = await calls(first);
  assert.deepEqual(firstCalls.slice(-3), ['leave', 'destroy:start', 'destroy:end'], 'the first tab had left before the second joined');
  await second.getByRole('button', { name: 'Rejoindre le cours' }).waitFor();
  // The displaced tab, reloaded, is now the second tab.
  await first.reload();
  await first.getByTestId('room-other-tab').waitFor();
  ok('second tab is refused; « Utiliser cet onglet » moves the room after the first tab has left');

  // Takeover while the first tab is still waiting for its pass (review B1): the late
  // answer must not put the displaced tab back into the room.
  const slow = await context.newPage();
  await slow.goto(`${origin}/?lesson=l5&person=p1&delay=2500`);
  await phase(slow, 'joining');
  const taker = await context.newPage();
  await taker.goto(`${origin}/?lesson=l5&person=p1`);
  await taker.getByTestId('room-other-tab').waitFor();
  await slow.evaluate(() => {
    window.__sawRoom = false;
    new MutationObserver(() => { if (document.querySelector('[data-testid="zoom-room"]')) window.__sawRoom = true; }).observe(document.body, { childList: true, subtree: true });
  });
  await taker.getByRole('button', { name: 'Utiliser cet onglet' }).click();
  await slow.getByTestId('room-displaced').waitFor();
  await joined(taker, 1);
  await slow.waitForTimeout(3500); // well past the delayed pass
  assert.equal(await slow.evaluate(() => window.__phase), 'displaced', 'the displaced tab stays displaced when its pass arrives late');
  assert.equal(await slow.getByTestId('room-displaced').count(), 1);
  assert.equal(await slow.evaluate(() => window.__sawRoom), false, 'the displaced tab never rendered the room');
  assert.equal(await slow.evaluate(() => window.__zoom), undefined, 'the displaced tab never loaded or joined the room');
  assert.deepEqual(order(await calls(taker)), ['join#1'], 'the taking tab is alone in the room');
  ok('a takeover during a slow pass request leaves the first tab displaced, never in the room');

  // Whiteboard (plan online-classroom-tools.md, PR A). The read-only line is shown while a
  // whiteboard is open on a device whose SDK says it cannot open the canvas, whatever the
  // window width; a device that can never shows it, however narrow.
  const board = async (width, capable, role) => {
    const boardContext = await browser.newContext({ viewport: { width, height: 800 } });
    const tab = await boardContext.newPage();
    tab.on('pageerror', error => errors.push(String(error?.message || error)));
    await tab.goto(`${origin}/?lesson=l7&person=wb-${width}-${capable}${role ? `&role=${role}` : ''}`);
    await joined(tab, 1);
    await tab.evaluate(can => {
      window.zmClient = { getWhiteboardClient: () => ({ isWhiteboardEnabled: () => can }), getAllUser: () => [{ userId: 7, isHost: true }, { userId: 8, isHost: false }],
        getCommandClient: () => ({ send: async text => { (window.__sent = window.__sent || []).push(text); } }) };
      window.__zoom.connect();
    }, capable);
    return tab;
  };
  const line = tab => tab.getByTestId('room-whiteboard-readonly');
  const READ_ONLY = 'Le tableau blanc s’affiche en lecture seule sur cet appareil. Pour écrire au tableau, utilisez un ordinateur.';
  // A wide window without the canvas (a tablet, a two-core laptop): the line shows.
  const wide = await board(1280, false);
  assert.deepEqual(await wide.evaluate(() => window.__zoom.config.featuresOptions.whiteboard), { enable: true, enableExport: false, enableViewerUserExport: false }, 'a learner cannot export');
  assert.equal(await line(wide).count(), 0, 'no line before a whiteboard is open');
  await wide.evaluate(() => window.__zoom.emit('command-channel-message', { senderId: '8', text: 'eh-whiteboard:open' }));
  await wide.waitForTimeout(200);
  assert.equal(await line(wide).count(), 0, 'a learner\'s marker is not believed');
  await wide.evaluate(() => window.__zoom.emit('command-channel-message', { senderId: '7', text: 'eh-whiteboard:open' }));
  await line(wide).waitFor();
  assert.equal(await line(wide).textContent(), READ_ONLY);
  assert.equal(await wide.evaluate(() => window.__phase), 'in_room');
  await wide.evaluate(() => window.__zoom.emit('command-channel-message', { senderId: '7', text: 'eh-whiteboard:closed' }));
  await line(wide).waitFor({ state: 'detached' });
  // A narrow window with the canvas (a small desktop window): never the line.
  const narrow = await board(390, true);
  await narrow.evaluate(() => { window.__zoom.emit('peer-whiteboard-state-change', { action: 'Start', userId: 7 }); window.__zoom.emit('command-channel-message', { senderId: '7', text: 'eh-whiteboard:open' }); });
  await narrow.waitForTimeout(400);
  assert.equal(await line(narrow).count(), 0, 'not keyed on the window width');
  // The teacher: export on; its own whiteboard sends the marker, and it never sees the line.
  const host = await board(1280, true, 'host');
  assert.deepEqual(await host.evaluate(() => window.__zoom.config.featuresOptions.whiteboard), { enable: true, enableExport: true, enableViewerUserExport: false }, 'the teacher exports');
  await host.evaluate(() => { window.__zoom.emit('whiteboard-status-change', 1); window.__zoom.emit('whiteboard-status-change', 2); window.__zoom.emit('whiteboard-status-change', 0); });
  await host.waitForTimeout(200);
  assert.deepEqual(await host.evaluate(() => window.__sent.filter(text => text.startsWith('eh-whiteboard:') && text !== 'eh-whiteboard:ask')), ['eh-whiteboard:open', 'eh-whiteboard:closed']);
  // A participant who arrives or reconnects asks; the presenter answers while its whiteboard is open.
  await host.evaluate(() => { window.__sent.length = 0; window.__zoom.emit('whiteboard-status-change', 2); window.__zoom.emit('command-channel-message', { senderId: '8', text: 'eh-whiteboard:ask' }); });
  assert.deepEqual(await host.evaluate(() => window.__sent), ['eh-whiteboard:open'], 'a question right after the marker is not answered at once (one answer per interval)');
  await host.waitForFunction(() => window.__sent.length === 2 && window.__sent[1] === 'eh-whiteboard:open', null, { timeout: 5000 });
  await host.waitForTimeout(2500);
  assert.equal(await host.evaluate(() => window.__sent.length), 2, 'and it is answered once');
  // On the device without the canvas: a reconnection drops the line and asks again.
  await wide.evaluate(() => { window.__sent = []; window.__zoom.emit('command-channel-message', { senderId: '7', text: 'eh-whiteboard:open' }); });
  await line(wide).waitFor();
  await wide.evaluate(() => window.__zoom.emit('connection-change', { state: 'Reconnecting', reason: 'failover' }));
  await line(wide).waitFor({ state: 'detached' });
  await wide.evaluate(() => window.__zoom.emit('connection-change', { state: 'Connected' }));
  assert.deepEqual(await wide.evaluate(() => window.__sent), ['eh-whiteboard:ask']);
  assert.equal(await wide.evaluate(() => window.__phase), 'in_room');
  assert.equal(await line(host).count(), 0);
  ok('whiteboard: learner export off, teacher export on; the read-only line follows capability and the presenter\'s marker, not the width; late arrivals and reconnections ask');

  // The camera message of the pre-join screen (classroom polish, part C). The toolkit
  // writes its French prefix followed by the error; the room replaces what follows.
  const camera = await context.newPage();
  camera.on('pageerror', error => errors.push(String(error?.message || error)));
  await camera.goto(`${origin}/?lesson=l9&person=p1`);
  await joined(camera, 1);
  const toast = (page, text) => page.evaluate(t => { const el = document.createElement('div'); el.className = 'fake-toast'; el.textContent = t; document.body.appendChild(el); return document.querySelectorAll('.fake-toast').length - 1; }, text);
  const toastText = (page, index) => page.evaluate(i => document.querySelectorAll('.fake-toast')[i].textContent, index);
  const settles = async (page, index) => { for (let i = 0; i < 20; i++) { const t = await toastText(page, index); if (!/object Object|Error/.test(t)) return t; await page.waitForTimeout(100); } return toastText(page, index); };
  const object = await toast(camera, 'La caméra n’a pas pu démarrer : [object Object]');
  const objectText = await settles(camera, object);
  assert.ok(Object.values(CAMERA_REASON).some(reason => objectText === `La caméra n’a pas pu démarrer : ${reason}`), `a French reason in place of [object Object]: ${objectText}`);
  const named = await toast(camera, 'La caméra n’a pas pu démarrer : NotReadableError: Could not start video source');
  assert.equal(await settles(camera, named), `La caméra n’a pas pu démarrer : ${CAMERA_REASON.busy}`);
  // Inside a toolkit element, as a text node added later.
  await camera.evaluate(() => { const box = document.createElement('div'); box.className = 'fake-toast'; document.body.appendChild(box); box.appendChild(document.createTextNode('La caméra n’a pas pu démarrer : NotAllowedError: Permission denied')); });
  assert.equal(await settles(camera, 2), `La caméra n’a pas pu démarrer : ${CAMERA_REASON.blocked}`);
  // The « start devices » message (review note of #197): the same, with reasons naming the camera or the microphone.
  const devices = await toast(camera, 'Les périphériques n’ont pas pu démarrer : [object Object]');
  const devicesText = await settles(camera, devices);
  assert.ok(Object.values(DEVICES_REASON).some(reason => devicesText === `Les périphériques n’ont pas pu démarrer : ${reason}`), `a French reason in place of [object Object]: ${devicesText}`);
  const devicesNamed = await toast(camera, 'Les périphériques n’ont pas pu démarrer : NotAllowedError: Permission denied');
  assert.equal(await settles(camera, devicesNamed), `Les périphériques n’ont pas pu démarrer : ${DEVICES_REASON.blocked}`);
  const unrelated = await toast(camera, 'Le micro n’a pas pu démarrer : [object Object]');
  await camera.waitForTimeout(300);
  assert.equal(await toastText(camera, unrelated), 'Le micro n’a pas pu démarrer : [object Object]', 'another message is not touched');
  // In the room the watcher is gone.
  await camera.getByRole('button', { name: 'Rejoindre le cours' }).click();
  await camera.evaluate(() => window.__zoom.connect());
  const late = await toast(camera, 'La caméra n’a pas pu démarrer : [object Object]');
  await camera.waitForTimeout(500);
  assert.equal(await toastText(camera, late), 'La caméra n’a pas pu démarrer : [object Object]', 'nothing is rewritten once in the room');
  await camera.close();
  ok('camera and « start devices » messages: a French reason in place of « [object Object] » or an English error name, on the pre-join screen only');

  // Groups (plan online-classroom-tools.md, PR B). A move is Reconnecting then Connected.
  const mover = await context.newPage();
  mover.on('pageerror', error => errors.push(String(error?.message || error)));
  const moverLines = [];
  mover.on('console', message => moverLines.push(message.text()));
  await mover.goto(`${origin}/?lesson=l8&person=p1`);
  await joined(mover, 1);
  assert.equal(await mover.evaluate(() => window.__zoom.config.featuresOptions.subsession.enable), true, 'groups are on');
  // Before the participant is in the room, the link is a plain link: it does not ask.
  assert.equal((await mover.getByTestId('room-leave').innerText()).trim(), 'Quitter le cours');
  await mover.getByRole('button', { name: 'Rejoindre le cours' }).click();
  await mover.evaluate(() => { window.__zoom.connect(); window.__zoom.calls.length = 0; window.__left = 0; addEventListener('pagehide', () => { window.__left++; }); });
  const address = mover.url();
  for (const reason of ['join breakout room', 'move to breakout room', 'back to main session', 'a reason nobody has seen']) {
    await mover.evaluate(why => { window.__zoom.emit('connection-change', { state: 'Reconnecting', reason: why }); window.__zoom.emit('user-added', [{ userId: 900, displayName: 'Amal B.' }]); window.__zoom.emit('connection-change', { state: 'Connected' }); }, reason);
    await mover.waitForTimeout(150);
    assert.equal(await mover.evaluate(() => window.__phase), 'in_room', `still in the room after « ${reason} »`);
  }
  assert.equal(mover.url(), address, 'the address is still the room');
  assert.deepEqual(await calls(mover), [], 'a move never leaves and never destroys the room');
  assert.equal(await mover.getByTestId('zoom-room').count(), 1);
  assert.equal(moverLines.filter(line => /^\[online room\] \S+ room move reason=/.test(line)).length, 4, 'each move is one trace line with its reason');
  assert.ok(moverLines.some(line => /participant added id=900 label=Amal B\. total=1$/.test(line)), 'the participant list starts again on a move');
  // « Quitter le cours »: in the room it asks; staying keeps the room.
  const ask = mover.getByTestId('room-leave-confirm');
  await mover.getByTestId('room-leave').click();
  await ask.waitFor();
  assert.match(await ask.innerText(), /Quitter le cours \?/);
  assert.match(await ask.innerText(), /Vous sortirez de la salle pour tout le cours\./);
  assert.equal(mover.url(), address, 'one tap does not leave');
  assert.equal(await mover.evaluate(() => window.__phase), 'in_room');
  await mover.getByTestId('room-leave-stay').click();
  await ask.waitFor({ state: 'detached' });
  assert.equal(mover.url(), address);
  assert.deepEqual(await calls(mover), [], 'staying keeps the room untouched');
  // « Escape » is staying too.
  await mover.getByTestId('room-leave').click();
  await ask.waitFor();
  await mover.keyboard.press('Escape');
  await ask.waitFor({ state: 'detached' });
  assert.equal(mover.url(), address);
  // In a group it asks exactly the same (it does not know about groups), and confirming
  // is a full document navigation to the portal.
  await mover.evaluate(() => { window.__zoom.emit('connection-change', { state: 'Reconnecting', reason: 'join breakout room' }); window.__zoom.emit('connection-change', { state: 'Connected' }); window.__eh_spa_marker = 'room'; });
  await mover.getByTestId('room-leave').click();
  await ask.waitFor();
  assert.equal(await mover.evaluate(() => window.__phase), 'in_room');
  await Promise.all([mover.waitForURL(`${origin}/portal`), mover.getByTestId('room-leave-yes').click()]);
  await mover.getByTestId('portal').waitFor();
  assert.equal(await mover.evaluate(() => window.__eh_spa_marker), undefined, 'leaving is a full document navigation');
  // Review N3 of #195: a question left open when the room fails is forgotten; after
  // « Réessayer » the participant is back in the room and nothing asks by itself.
  await mover.goto(`${origin}/?lesson=l8&person=p1`);
  await joined(mover, 1);
  await mover.getByRole('button', { name: 'Rejoindre le cours' }).click();
  await mover.evaluate(() => window.__zoom.connect());
  await phase(mover, 'in_room');
  await mover.getByTestId('room-leave').click();
  await ask.waitFor();
  await mover.evaluate(() => window.__zoom.emit('connection-change', { state: 'Fail', errorCode: 200 }));
  await mover.getByTestId('room-refused').waitFor();
  await ask.waitFor({ state: 'detached' });
  await mover.getByRole('button', { name: 'Réessayer' }).click();
  await joined(mover, 2);
  await mover.getByRole('button', { name: 'Rejoindre le cours' }).click();
  await mover.evaluate(() => window.__zoom.connect());
  await mover.waitForTimeout(600);
  assert.equal(await mover.evaluate(() => window.__phase), 'in_room');
  assert.equal(await ask.count(), 0, 'the question does not come back by itself after « Réessayer »');
  await mover.getByTestId('room-leave').click();
  await ask.waitFor();
  await mover.getByTestId('room-leave-stay').click();
  await ask.waitFor({ state: 'detached' });
  // Outside the room (here: a refused join) the link does not ask.
  await mover.goto(`${origin}/?lesson=l8&person=p1`);
  await joined(mover, 1);
  await mover.getByRole('button', { name: 'Rejoindre le cours' }).click();
  await mover.evaluate(() => window.__zoom.emit('connection-change', { state: 'Fail', errorCode: 200 }));
  await mover.getByTestId('room-refused').waitFor();
  await Promise.all([mover.waitForURL(`${origin}/portal`), mover.getByTestId('room-leave').click()]);
  ok('groups: a move keeps the participant in the room; « Quitter le cours » asks first in the room and in a group, and only there');

  // Raise hand « Lever la main » (PR D). A fake SDK client: the participant list, this
  // participant's id, its group state, and the command channel (recorded in __sent as
  // « text » or « text@target »).
  const handClient = (self, status = 'main session') => {
    window.__sent = [];
    window.__status = status;
    window.zmClient = { getAllUser: () => [{ userId: 7, displayName: 'Sara L.', isHost: true }, { userId: 8, displayName: 'Amal B.' }, { userId: 9, displayName: 'Nour K.' }],
      getCurrentUserInfo: () => ({ userId: self }), getSubsessionClient: () => ({ getUserStatus: () => window.__status }),
      getWhiteboardClient: () => ({ isWhiteboardEnabled: () => true }),
      getCommandClient: () => ({ send: async (text, target) => { window.__sent.push(target === undefined ? text : `${text}@${target}`); return { text }; } }) };
  };
  const handsSent = tab => tab.evaluate(() => window.__sent.filter(text => text.startsWith('eh-hand:')));
  const move = (tab, status) => tab.evaluate(s => { window.__zoom.emit('connection-change', { state: 'Reconnecting', reason: 'join breakout room' }); window.__status = s; window.__zoom.emit('connection-change', { state: 'Connected' }); }, status);
  // The learner.
  const learnerTab = await context.newPage();
  learnerTab.on('pageerror', error => errors.push(String(error?.message || error)));
  await learnerTab.goto(`${origin}/?lesson=l7&person=p1`);
  await joined(learnerTab, 1);
  const hand = learnerTab.getByTestId('room-hand');
  assert.equal(await hand.count(), 0, 'no button before the participant is in');
  await learnerTab.getByRole('button', { name: 'Rejoindre le cours' }).click();
  await learnerTab.evaluate(handClient, 8);
  await learnerTab.evaluate(() => window.__zoom.connect());
  await hand.waitFor();
  assert.equal((await hand.innerText()).trim(), 'Lever la main');
  assert.equal(await hand.getAttribute('aria-pressed'), 'false');
  // Above the room, outside the toolkit: it covers none of the toolkit's controls.
  const layout = await learnerTab.evaluate(() => ({ hand: document.querySelector('[data-testid="room-hand"]').getBoundingClientRect().bottom, room: document.querySelector('[data-testid="zoom-room"]').getBoundingClientRect().top,
    inside: !!document.querySelector('[data-testid="zoom-room"] [data-testid="room-hand"]') }));
  assert.ok(layout.hand <= layout.room && !layout.inside, `the button is above the room: ${JSON.stringify(layout)}`);
  await hand.click();
  await learnerTab.waitForFunction(() => document.querySelector('[data-testid="room-hand"]')?.textContent.trim() === 'Baisser la main');
  assert.equal(await hand.getAttribute('aria-pressed'), 'true');
  assert.deepEqual(await handsSent(learnerTab), ['eh-hand:raise']);
  // Spoofed lowers (another learner, no sender id): the hand stays up.
  await learnerTab.evaluate(() => { for (const p of [{ senderId: '9', text: 'eh-hand:lower' }, { senderId: '9', text: 'eh-hand:lower-all' }, { text: 'eh-hand:lower-all' }]) window.__zoom.emit('command-channel-message', p); });
  await learnerTab.waitForTimeout(200);
  assert.equal((await hand.innerText()).trim(), 'Baisser la main', 'a learner cannot lower another learner\'s hand');
  // The teacher lowers it: the button is back, with a line saying so, and « lower-self » goes out.
  await learnerTab.evaluate(() => window.__zoom.emit('command-channel-message', { senderId: '7', text: 'eh-hand:lower' }));
  await learnerTab.getByTestId('room-hand-lowered').waitFor();
  assert.equal(await learnerTab.getByTestId('room-hand-lowered').innerText(), 'Votre main a été baissée par l’enseignant.');
  assert.equal((await hand.innerText()).trim(), 'Lever la main');
  assert.deepEqual(await handsSent(learnerTab), ['eh-hand:raise', 'eh-hand:lower-self']);
  // Into a group: no button; back in the main room: the button, hand down.
  await hand.click();
  await move(learnerTab, 'in room');
  await hand.waitFor({ state: 'detached' });
  await move(learnerTab, 'main session');
  await hand.waitFor();
  assert.equal((await hand.innerText()).trim(), 'Lever la main', 'the hand went down with the move');
  // Its own « Baisser la main ».
  await hand.click();
  await learnerTab.waitForFunction(() => document.querySelector('[data-testid="room-hand"]')?.textContent.trim() === 'Baisser la main');
  await hand.click();
  await learnerTab.waitForFunction(() => document.querySelector('[data-testid="room-hand"]')?.textContent.trim() === 'Lever la main');
  assert.deepEqual((await handsSent(learnerTab)).slice(-2), ['eh-hand:raise', 'eh-hand:lower-self']);
  // On a phone: visible, above the room, within the screen.
  await learnerTab.setViewportSize({ width: 390, height: 844 });
  await learnerTab.waitForTimeout(200);
  const phoneBox = await hand.boundingBox();
  assert.ok(phoneBox && phoneBox.x >= 0 && phoneBox.x + phoneBox.width <= 390 && phoneBox.y >= 0 && phoneBox.y + phoneBox.height <= 844 && await hand.isVisible(), `visible within a phone's screen (the harness has no Tailwind: the 44 px height is a class, checked by the unit suite): ${JSON.stringify(phoneBox)}`);
  await learnerTab.close();
  // The teacher.
  const teacherTab = await context.newPage();
  teacherTab.on('pageerror', error => errors.push(String(error?.message || error)));
  await teacherTab.goto(`${origin}/?lesson=l6&person=t1&role=host`);
  await joined(teacherTab, 1);
  await teacherTab.getByRole('button', { name: 'Rejoindre le cours' }).click();
  await teacherTab.evaluate(handClient, 7);
  await teacherTab.evaluate(() => window.__zoom.connect());
  const panel = teacherTab.getByTestId('room-hands-panel');
  await panel.waitFor();
  assert.equal(await teacherTab.getByTestId('room-hand').count(), 0, 'the teacher has no « Lever la main »');
  assert.equal((await teacherTab.getByTestId('room-hands-badge').innerText()).trim(), 'Mains levées (0)');
  assert.deepEqual(await handsSent(teacherTab), ['eh-hand:ask'], 'the teacher asks for the hands already up');
  assert.equal(await panel.getAttribute('data-cue'), 'off');
  await teacherTab.evaluate(() => { window.__zoom.emit('command-channel-message', { senderId: '9', text: 'eh-hand:raise' }); window.__zoom.emit('command-channel-message', { senderId: '8', text: 'eh-hand:raise' }); });
  await teacherTab.waitForFunction(() => document.querySelector('[data-testid="room-hands-badge"]')?.textContent.trim() === 'Mains levées (2)');
  assert.deepEqual(await teacherTab.getByTestId('room-hands-name').allInnerTexts(), ['Nour K.', 'Amal B.'], 'names in the order raised');
  assert.equal(await panel.getAttribute('data-cue'), 'on', 'a brief cue when a hand goes up');
  assert.equal(await teacherTab.getByTestId('room-hands-live').innerText(), 'Amal B. lève la main');
  const above = await teacherTab.evaluate(() => document.querySelector('[data-testid="room-hands-panel"]').getBoundingClientRect().bottom <= document.querySelector('[data-testid="zoom-room"]').getBoundingClientRect().top);
  assert.ok(above, 'the panel is above the room');
  // A learner's spoofed « lower-all » changes nothing.
  await teacherTab.evaluate(() => window.__zoom.emit('command-channel-message', { senderId: '8', text: 'eh-hand:lower-all' }));
  await teacherTab.waitForTimeout(200);
  assert.equal(await teacherTab.getByTestId('room-hands-item').count(), 2);
  // « Baisser » on the first: gone at once, « lower » to that learner only.
  await teacherTab.getByTestId('room-hands-item').first().getByRole('button', { name: 'Baisser' }).click();
  await teacherTab.waitForFunction(() => document.querySelectorAll('[data-testid="room-hands-item"]').length === 1);
  assert.deepEqual(await teacherTab.getByTestId('room-hands-name').allInnerTexts(), ['Amal B.']);
  assert.deepEqual((await handsSent(teacherTab)).slice(-1), ['eh-hand:lower@9']);
  // The cue goes after a few seconds.
  await teacherTab.waitForFunction(() => document.querySelector('[data-testid="room-hands-panel"]')?.getAttribute('data-cue') === 'off', null, { timeout: 5000 });
  // « Baisser toutes les mains ».
  await teacherTab.getByTestId('room-hands-lower-all').click();
  await teacherTab.waitForFunction(() => document.querySelector('[data-testid="room-hands-badge"]')?.textContent.trim() === 'Mains levées (0)');
  assert.equal(await teacherTab.getByTestId('room-hands-list').count(), 0);
  assert.deepEqual((await handsSent(teacherTab)).slice(-1), ['eh-hand:lower-all']);
  // A learner who leaves (Zoom's « removed ») takes the hand along.
  await teacherTab.evaluate(() => { window.__zoom.emit('command-channel-message', { senderId: '8', text: 'eh-hand:raise' }); window.__zoom.emit('user-removed', [{ userId: 8, displayName: 'Amal B.' }]); });
  await teacherTab.waitForTimeout(200);
  assert.equal((await teacherTab.getByTestId('room-hands-badge').innerText()).trim(), 'Mains levées (0)');
  // The teacher visiting a group: no panel there; back: the panel, and a new question.
  await move(teacherTab, 'in room');
  await panel.waitFor({ state: 'detached' });
  await teacherTab.evaluate(() => { window.__sent.length = 0; });
  await move(teacherTab, 'main session');
  await panel.waitFor();
  assert.deepEqual(await handsSent(teacherTab), ['eh-hand:ask']);
  await teacherTab.close();
  ok('raise hand: the learner\'s button (states, hidden in a group, phone), the teacher\'s panel (order, cue, « Baisser », « Baisser toutes les mains »); spoofed lowers change nothing');

  // ---- [Reliability PR] ----
  {
  const device = async (query, { route } = {}) => {
    const ctx = await browser.newContext();
    const tab = await ctx.newPage();
    tab.on('pageerror', error => errors.push(String(error?.message || error)));
    const lines = [];
    tab.on('console', message => lines.push(message.text()));
    if (route) await tab.route('**/rpc/online_confirm_pass', route);
    await tab.goto(`${origin}/?${new URLSearchParams(query)}`);
    await phase(tab, 'in_room');
    await joined(tab, 1);
    return { ctx, tab, lines };
  };
  const passOf = tab => tab.evaluate(() => window.__pass);
  const passState = jti => model.passes.find(p => p.jti === jti);
  const inside = tab => tab.evaluate(() => window.__zoom.connect());
  const marker = tab => tab.evaluate(() => window.__zoom.emit('command-channel-message', { senderId: '55', text: 'eh-room:newer' }));
  const SUPERSEDED = 'Ce cours est ouvert sur un autre appareil ou dans un autre onglet.';

  // Two devices, one person: the newer one that reaches the room wins; the marker is
  // enough (the older device's own round is a minute away here).
  const first = await device({ lesson: 'r1', person: 'p9', passMs: '60000' });
  await inside(first.tab);
  const firstPass = await passOf(first.tab);
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.equal(passState(firstPass).confirmed, true, 'the first device confirmed once inside');
  // A second device that never reaches the room takes nothing.
  const stalled = await device({ lesson: 'r1', person: 'p9', passMs: '300' });
  await stalled.tab.waitForTimeout(800);
  assert.equal(passState(firstPass).superseded, false, 'a device that never entered supersedes nothing');
  assert.equal(await first.tab.evaluate(() => window.__phase), 'in_room');
  await stalled.ctx.close();
  // The second device enters: the first is superseded at its confirmation.
  const second = await device({ lesson: 'r1', person: 'p9', passMs: '60000' });
  await inside(second.tab);
  await second.tab.waitForFunction(() => window.__zoom.sent.includes('eh-room:newer'), null, { timeout: 5000 });
  assert.equal(passState(firstPass).superseded, true);
  assert.equal(await first.tab.evaluate(() => window.__phase), 'in_room', 'not before its check');
  await marker(first.tab);
  await phase(first.tab, 'superseded');
  assert.equal((await first.tab.getByTestId('room-superseded').locator('p').innerText()).trim(), SUPERSEDED);
  await first.tab.waitForFunction(() => window.__zoom.calls.includes('destroy:end'));
  await first.tab.waitForTimeout(1500);
  assert.equal((await calls(first.tab)).filter(c => c.startsWith('join#')).length, 1, 'no automatic retry');
  assert.equal(await second.tab.getByTestId('room-took-over').count(), 0, 'the same account is not told it took over');
  // « Utiliser cet appareil »: a new pass, which takes the room back once inside.
  await first.tab.getByRole('button', { name: 'Utiliser cet appareil' }).click();
  await phase(first.tab, 'in_room');
  await joined(first.tab, 2);
  await inside(first.tab);
  await first.tab.waitForFunction(() => window.__zoom.sent.includes('eh-room:newer'), null, { timeout: 5000 });
  await marker(second.tab);
  await phase(second.tab, 'superseded');
  ok('[Reliability PR] two devices: the newer one in the room wins on the marker, no automatic retry, « Utiliser cet appareil » takes it back; a device that never entered takes nothing');

  // D15: the teacher's page never removes anybody, not even the connection of a superseded
  // pass still in Zoom's list (Zoom would refuse that browser for the session, code 3009).
  const leftover = model.passes.find(p => p.lesson === 'r1' && p.superseded).jti;
  const teacher = await device({ lesson: 'r1', person: 't1', role: 'host', passMs: '60000' });
  await teacher.tab.evaluate(key => {
    window.__zoom.users = [{ userId: 1, self: true, isHost: true, displayName: 'Sara L.' }, { userId: 30, displayName: 'Amal B.', userKey: key },
      { userId: 32, displayName: 'Rim T.' }];
  }, leftover);
  await inside(teacher.tab);
  await teacher.tab.evaluate(() => window.__zoom.emit?.('user-added', [{ userId: 33, displayName: 'Nour K.' }]));
  await teacher.tab.waitForTimeout(2500);
  assert.deepEqual(await teacher.tab.evaluate(() => window.__zoom.removed), [], 'the teacher\'s page removes nobody');
  assert.equal(await second.tab.evaluate(() => window.__zoom.removed.length), 0, 'a learner\'s page removes nobody');
  assert.ok(!teacher.lines.some(line => /leftover/.test(line)), 'no sweep trace');
  ok('[Reliability PR] D15: no page removes a participant, not even a superseded connection still in Zoom\'s list');

  // A failed confirmation (network, then 503) keeps the room and supersedes nothing; the
  // next rounds retry and act on the answer.
  let refusals = 0;
  const retry = await device({ lesson: 'r1', person: 'p9', passMs: '300' }, { route: route => (refusals++ === 0 ? route.abort() : refusals <= 2 ? route.fulfill({ status: 503, body: '{}' }) : route.continue()) });
  const firstAgain = await passOf(first.tab);
  await inside(retry.tab);
  await retry.tab.waitForTimeout(150);
  assert.equal(passState(firstAgain).superseded, false, 'nothing superseded while the confirmation fails');
  assert.equal(await retry.tab.evaluate(() => window.__phase), 'in_room', 'the room stays');
  await retry.tab.waitForFunction(() => window.__zoom.sent.includes('eh-room:newer'), null, { timeout: 5000 });
  assert.ok(refusals >= 3);
  assert.equal(passState(firstAgain).superseded, true, 'acts on the answer once it comes');
  ok('[Reliability PR] a failed confirmation keeps the room, supersedes nothing, and is retried at the next round');

  // A parent opens the room for the child: the child's connection is replaced and the
  // parent is told once, with the pass's own label.
  const child = await device({ lesson: 'r2', person: 'kid1', account: 'kid1', passMs: '60000' });
  await inside(child.tab);
  await child.tab.waitForTimeout(150);
  const parent = await device({ lesson: 'r2', person: 'kid1', account: 'parent1', passMs: '60000' });
  await inside(parent.tab);
  await parent.tab.getByTestId('room-took-over').waitFor();
  assert.equal((await parent.tab.getByTestId('room-took-over').innerText()).trim(), 'Vous avez pris la place de Amal B. dans ce cours : son autre connexion a été fermée.');
  await marker(child.tab);
  await phase(child.tab, 'superseded');
  ok('[Reliability PR] a parent who takes the child\'s place is told once; the child\'s page shows the card');

  // Closed by the host: removed (both reasons) and ended for all.
  for (const reason of ['kicked by host', 'expeled by host']) {
    const learner = await device({ lesson: 'r3', person: `x-${reason.split(' ')[0]}`, passMs: '60000' });
    await inside(learner.tab);
    await learner.tab.waitForTimeout(100);
    await learner.tab.evaluate(r => window.__zoom.closeWith(r), reason);
    await phase(learner.tab, 'removed');
    assert.equal((await learner.tab.getByTestId('room-removed').locator('p').innerText()).trim(), 'L’enseignant vous a retiré du cours.');
    // D15: Zoom refuses that browser for the session (3009), so no « Rejoindre », « Quitter » only.
    assert.equal(await learner.tab.getByTestId('room-removed').getByRole('button').count(), 0, 'no « Rejoindre » or « Réessayer »');
    assert.equal(await learner.tab.getByTestId('room-removed').getByRole('link', { name: 'Quitter' }).count(), 1);
    await learner.ctx.close();
  }
  // A removal that follows a newer device's confirmation is that device's card.
  const replaced = await device({ lesson: 'r3', person: 'x-replaced', passMs: '60000' });
  await inside(replaced.tab);
  await replaced.tab.waitForTimeout(100);
  const replacing = await device({ lesson: 'r3', person: 'x-replaced', passMs: '60000' });
  await inside(replacing.tab);
  await replacing.tab.waitForFunction(() => window.__zoom.sent.includes('eh-room:newer'));
  await replaced.tab.evaluate(() => window.__zoom.closeWith('kicked by host'));
  await phase(replaced.tab, 'superseded');
  // Ended for all: no check, « Quitter » only.
  let checks = 0;
  const ended = await device({ lesson: 'r3', person: 'x-ended', passMs: '60000' });
  await ended.tab.route('**/rpc/online_check_pass', route => { checks++; return route.continue(); });
  await inside(ended.tab);
  await ended.tab.waitForTimeout(100);
  // The token line is dropped while the room lives.
  await ended.tab.evaluate(() => console.log('[JWT] participant decoded payload:', { probe: 1 }));
  await ended.tab.evaluate(() => window.__zoom.closeWith('ended by host'));
  await phase(ended.tab, 'ended');
  assert.equal((await ended.tab.getByTestId('room-ended').locator('p').innerText()).trim(), 'L’enseignant a terminé le cours pour tous.');
  assert.equal(await ended.tab.getByTestId('room-ended').getByRole('button').count(), 0, 'no « Rejoindre » or « Réessayer »');
  assert.equal(await ended.tab.getByTestId('room-ended').getByRole('link', { name: 'Quitter' }).count(), 1);
  assert.equal(checks, 0, 'no check after an end for all');
  // Once the room has ended, console.log is the browser's own again: the same line goes through.
  await ended.tab.waitForFunction(() => window.__zoom.calls.includes('destroy:end'));
  await ended.tab.evaluate(() => console.log('[JWT] participant decoded payload:', 'after'));
  await ended.tab.waitForTimeout(100);
  assert.equal(ended.lines.filter(line => line.startsWith('[JWT] participant decoded payload:')).length, 1, 'dropped in the room, through after it');
  assert.ok(ended.lines.some(line => line === '[JWT] participant decoded payload: after'));
  assert.equal(await ended.tab.evaluate(() => /native code/.test(Function.prototype.toString.call(console.log))), true, 'the original console.log is back');
  ok('[Reliability PR] « Retirer » (both reasons) shows the removed text with « Quitter » only; after a newer device it is the card; « Terminer pour tous » shows the ended text with « Quitter » only; the token-log wrapper is gone after the room');
  for (const d of [first, second, teacher, retry, child, parent, replaced, replacing, ended]) await d.ctx.close();
  }

  assert.deepEqual(errors, [], 'no page error');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
console.log('online room lifecycle browser regressions passed');
