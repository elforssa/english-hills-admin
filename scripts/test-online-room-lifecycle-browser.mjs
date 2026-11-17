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
//     is a full navigation; outside the room it does not ask.
// Run by CI (browser suites) and locally: node scripts/test-online-room-lifecycle-browser.mjs
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { chromium } from '@playwright/test';
import { buildRoomHarness, serveRoomHarness } from './lib/online-room-harness.mjs';

setTimeout(() => { console.error('FAIL online room lifecycle browser test stalled'); process.exit(1); }, 4 * 60_000).unref();
const harness = await buildRoomHarness({ fake: true });
let passes = 0;
const { server, origin } = await serveRoomHarness({ ...harness, embed: async query => (await new Promise(resolve => setTimeout(resolve, Number(query.delay) || 0)), { kind: 'zoom-video', token: `pass-${++passes}-${randomBytes(4).toString('hex')}`, sessionName: `room.${query.lesson}`, displayName: 'Amal B.', role: query.role === 'host' ? 'host' : 'participant' }) });
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
  assert.deepEqual(await host.evaluate(() => window.__sent.filter(text => text !== 'eh-whiteboard:ask')), ['eh-whiteboard:open', 'eh-whiteboard:closed']);
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
  // Outside the room (here: a refused join) the link does not ask.
  await mover.goto(`${origin}/?lesson=l8&person=p1`);
  await joined(mover, 1);
  await mover.getByRole('button', { name: 'Rejoindre le cours' }).click();
  await mover.evaluate(() => window.__zoom.emit('connection-change', { state: 'Fail', errorCode: 200 }));
  await mover.getByTestId('room-refused').waitFor();
  await Promise.all([mover.waitForURL(`${origin}/portal`), mover.getByTestId('room-leave').click()]);
  ok('groups: a move keeps the participant in the room; « Quitter le cours » asks first in the room and in a group, and only there');

  assert.deepEqual(errors, [], 'no page error');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
console.log('online room lifecycle browser regressions passed');
