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
// Run by CI (browser suites) and locally: node scripts/test-online-room-lifecycle-browser.mjs
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { chromium } from '@playwright/test';
import { buildRoomHarness, serveRoomHarness } from './lib/online-room-harness.mjs';

setTimeout(() => { console.error('FAIL online room lifecycle browser test stalled'); process.exit(1); }, 4 * 60_000).unref();
const harness = await buildRoomHarness({ fake: true });
let passes = 0;
const { server, origin } = await serveRoomHarness({ ...harness, embed: async query => ({ kind: 'zoom-video', token: `pass-${++passes}-${randomBytes(4).toString('hex')}`, sessionName: `room.${query.lesson}`, displayName: 'Amal B.' }) });
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

  assert.deepEqual(errors, [], 'no page error');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
console.log('online room lifecycle browser regressions passed');
