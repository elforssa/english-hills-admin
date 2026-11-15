// Room lifecycle and French against Zoom Video SDK, with the real UI Toolkit. Local only,
// never in CI: it needs the owner's Zoom developer credentials in the git-ignored
// .env.local (ONLINE_VIDEO_PROVIDER_API_KEY and ONLINE_VIDEO_PROVIDER_API_SECRET; read,
// never printed; OL_ENV_FILE points elsewhere, e.g. from a worktree) and a network path
// to Zoom. It mounts the real room component in the harness page
// (scripts/lib/online-room-harness.mjs) in headless Chromium with fake camera and
// microphone, against a throw-away session, with a new pass (a new Zoom identity) for
// every page load, as the join route issues them:
//   1. pre-join screen in French with the name locked, for the teacher (desktop) and the
//      learner (phone); the headset icon then « Rejoindre le cours » connects audio;
//   2. alone in the gallery, no page counter is visible;
//   3. five teacher reloads: the learner never sees more than one teacher;
//   4. a second teacher tab is refused; « Utiliser cet onglet » moves the room and the
//      learner still never sees two teachers;
//   5. a forged and an expired token: the French card appears, and the real
//      `connection-change` payload (state, errorCode, reason) is recorded;
//   6. the page is served with the room path's own Content-Security-Policy and
//      Permissions-Policy (next.config.mjs): the pre-join screen, its speaker test and the
//      session cause no CSP refusal.
// Writes a JSON report (OL_ZOOM_LIFECYCLE_REPORT, default
// scripts/.zoom-lifecycle-report.json, git-ignored). Touches no application database.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { chromium } from '@playwright/test';
import { buildRoomHarness, serveRoomHarness } from './lib/online-room-harness.mjs';
import { createZoomVideoProvider, signZoomJwt, zoomSessionName } from '../src/lib/online/provider/zoom-video.mjs';
import nextConfig from '../next.config.mjs';

const envFile = process.env.OL_ENV_FILE || '.env.local';
const file = existsSync(envFile) ? Object.fromEntries(readFileSync(envFile, 'utf8').split('\n').flatMap(line => {
  const m = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);
  return m ? [[m[1], m[2].trim().replace(/^['"]|['"]$/g, '')]] : [];
})) : {};
const env = { ONLINE_VIDEO_PROVIDER_API_KEY: process.env.ONLINE_VIDEO_PROVIDER_API_KEY || file.ONLINE_VIDEO_PROVIDER_API_KEY,
  ONLINE_VIDEO_PROVIDER_API_SECRET: process.env.ONLINE_VIDEO_PROVIDER_API_SECRET || file.ONLINE_VIDEO_PROVIDER_API_SECRET };
if (!env.ONLINE_VIDEO_PROVIDER_API_KEY || !env.ONLINE_VIDEO_PROVIDER_API_SECRET) {
  console.error('SKIP zoom lifecycle: set ONLINE_VIDEO_PROVIDER_API_KEY and ONLINE_VIDEO_PROVIDER_API_SECRET in .env.local');
  process.exit(2);
}
const reportPath = process.env.OL_ZOOM_LIFECYCLE_REPORT || 'scripts/.zoom-lifecycle-report.json';
setTimeout(() => { console.error('FAIL zoom lifecycle stalled'); process.exit(1); }, 12 * 60_000).unref();

const zoom = createZoomVideoProvider(env);
const run = `ehtest-${randomBytes(6).toString('hex')}`;
const LABEL = { host: 'Sara L.', participant: 'Amal B.' };
const ref = () => `00000000-0000-4000-8000-${randomBytes(6).toString('hex')}`;
const now = () => Math.floor(Date.now() / 1000);
let passes = 0;
async function embed(query) {
  passes++;
  const minted = await zoom.mintJoinToken({ roomRef: run, displayName: LABEL[query.role] || LABEL.participant, role: query.role === 'host' ? 'host' : 'participant',
    expiresAt: new Date(Date.now() + 70 * 60000).toISOString(), participantRef: ref(), lessonRef: query.lesson });
  if (query.person === 'forged') return { ...minted.embed, token: signZoomJwt({ app_key: env.ONLINE_VIDEO_PROVIDER_API_KEY, tpc: minted.embed.sessionName, role_type: 0, version: 1, iat: now() - 30, exp: now() + 3600, user_key: ref() }, 'not-the-secret') };
  if (query.person === 'expired') return { ...minted.embed, token: signZoomJwt({ app_key: env.ONLINE_VIDEO_PROVIDER_API_KEY, tpc: minted.embed.sessionName, role_type: 0, version: 1, iat: now() - 3 * 3600, exp: now() - 3 * 3600 + 1800, user_key: ref() }, env.ONLINE_VIDEO_PROVIDER_API_SECRET) };
  return minted.embed;
}

const report = { run: new Date().toISOString(), session: zoomSessionName(run, 'l1'), results: {}, trace: {}, notes: [] };
const pass = (name, ok, detail = {}) => { report.results[name] = { ok, ...detail }; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`, JSON.stringify(detail)); if (!ok) process.exitCode = 1; };
const record = (name, detail) => { report.results[name] = { recorded: true, ...detail }; console.log(`RECORDED ${name}`, JSON.stringify(detail)); };

const harness = await buildRoomHarness({ fake: false });
// The room path's headers, exactly as Next.js sends them (later rules win per key).
const roomHeaders = Object.entries(Object.fromEntries((await nextConfig.headers())
  .filter(rule => rule.source === '/(.*)' || rule.source === '/online/room/:path*').flatMap(rule => rule.headers.map(h => [h.key, h.value]))))
  .filter(([key]) => ['Content-Security-Policy', 'Permissions-Policy'].includes(key)).map(([key, value]) => ({ key, value }));
assert.equal(roomHeaders.length, 2, 'room CSP and Permissions-Policy found');
const { server, origin } = await serveRoomHarness({ ...harness, embed, headers: roomHeaders });
const cspBlocked = [];
const browser = await chromium.launch({ headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const contexts = [];
async function person(label, options) {
  const context = await browser.newContext({ permissions: ['camera', 'microphone'], ...options });
  contexts.push(context);
  await context.exposeFunction('__cspBlocked', entry => cspBlocked.push({ label, ...entry }));
  await context.addInitScript(() => document.addEventListener('securitypolicyviolation', e =>
    window.__cspBlocked({ directive: e.effectiveDirective, blocked: String(e.blockedURI).split('?')[0].slice(0, 160) })));
  return context;
}
function watch(page, label) {
  report.trace[label] = report.trace[label] || [];
  page.on('console', message => { const text = message.text(); if (text.startsWith('[online room] ')) report.trace[label].push(text); });
  page.on('pageerror', error => report.notes.push({ label, pageerror: String(error?.message || error).slice(0, 300) }));
  return page;
}
const self = page => page.evaluate(() => { const c = window.zmClient, u = c?.getCurrentUserInfo?.(); return { inMeeting: !!c?.getSessionInfo?.().isInMeeting, audio: u?.audio || '', name: u?.displayName, isHost: !!u?.isHost }; });
const inMeeting = page => page.waitForFunction(() => window.zmClient?.getSessionInfo?.().isInMeeting === true, null, { timeout: 90000 });
// Pre-join screen: French, name locked; headset on, then join.
async function enter(page, name, speakerTest = false) {
  const join = page.getByRole('button', { name: 'Rejoindre le cours' });
  await join.waitFor({ timeout: 60000 });
  const input = page.locator('[data-testid="zoom-room"] input').first();
  const prejoin = { name: await input.inputValue(), locked: await input.isDisabled(), text: (await page.locator('[data-testid="zoom-room"]').innerText()).slice(0, 300) };
  if (speakerTest) { await page.getByRole('button', { name: 'Tester le haut-parleur' }).click(); await page.waitForTimeout(2500); }
  // The two round icons under the preview: headset (audio), then camera.
  await page.locator('[data-testid="zoom-room"] button.bg-red-500, [data-testid="zoom-room"] button:has(svg)').first().click();
  await page.waitForTimeout(1500);
  await join.click();
  await inMeeting(page);
  assert.equal(prejoin.name, name);
  return prejoin;
}
const audioConnected = page => page.waitForFunction(() => window.zmClient?.getCurrentUserInfo?.()?.audio === 'computer', null, { timeout: 30000 }).then(() => true, () => false);

try {
  // 1. Teacher on a desktop, learner on a phone.
  const teacherContext = await person('teacher', { viewport: { width: 1280, height: 800 } });
  const teacher = watch(await teacherContext.newPage(), 'teacher');
  await teacher.goto(`${origin}/?lesson=l1&person=teacher&role=host`);
  const teacherPrejoin = await enter(teacher, LABEL.host);
  const teacherAudio = await audioConnected(teacher);
  const teacherText = await teacher.locator('[data-testid="zoom-room"]').innerText();
  // 2. Alone: « Aucun autre participant », and no visible « n / -1 » pager.
  const pager = await teacher.evaluate(() => [...document.querySelectorAll('[data-testid="zoom-room"] span')].filter(s => /^\d+ \/ -?\d+$/.test(s.textContent.trim()))
    .map(s => ({ text: s.textContent.trim(), visibility: getComputedStyle(s).visibility })));
  // The « 1 / -1 » state itself needs an empty participant list, which Zoom does not give
  // on demand; the scoped rule for it is checked on the toolkit's markup in
  // test-online-room-lifecycle-browser.mjs. Here: whatever pager exists is not visible.
  pass('pager: no page counter is visible while the teacher is alone', pager.every(p => p.visibility === 'hidden'), { pager, alone: /Aucun autre participant/.test(teacherText) });

  const learnerContext = await person('learner', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const learner = watch(await learnerContext.newPage(), 'learner');
  await learner.goto(`${origin}/?lesson=l1&person=learner&role=participant`);
  const learnerPrejoin = await enter(learner, LABEL.participant, true);
  const learnerAudio = await audioConnected(learner);
  pass('pre-join in French with the name locked, then audio connected, for both roles', teacherPrejoin.locked && learnerPrejoin.locked && teacherAudio && learnerAudio
    && /Rejoindre le cours/.test(teacherPrejoin.text) && !/Join Session/.test(teacherPrejoin.text + learnerPrejoin.text),
  { teacher: { ...teacherPrejoin, audio: teacherAudio, self: await self(teacher) }, learner: { ...learnerPrejoin, audio: learnerAudio, self: await self(learner) } });
  const english = /\b(Join Audio|No other participants|Not Now|Leave Session|Participants \(|Mute|Unmute|Start Video)\b/;
  record('English left on screen after joining', { teacher: (teacherText.match(english) || [null])[0], learner: ((await learner.locator('[data-testid="zoom-room"]').innerText()).match(english) || [null])[0] });

  // 3. The learner counts the teachers it sees, every 200 ms, from now on.
  await learner.evaluate(label => {
    window.__seen = { max: 0, samples: 0, over: [] };
    setInterval(() => {
      const users = window.zmClient?.getAllUser?.() || [];
      const teachers = users.filter(u => u.displayName === label).length;
      window.__seen.samples++;
      if (teachers > window.__seen.max) window.__seen.max = teachers;
      if (teachers > 1) window.__seen.over.push({ at: new Date().toISOString(), users: users.map(u => u.displayName) });
    }, 200);
  }, LABEL.host);
  for (let i = 1; i <= 5; i++) {
    await teacher.reload();
    await enter(teacher, LABEL.host);
    await teacher.waitForTimeout(2500);
  }
  await learner.waitForTimeout(3000);
  let seen = await learner.evaluate(() => window.__seen);
  const usersAfterReloads = await learner.evaluate(() => (window.zmClient.getAllUser() || []).map(u => u.displayName).sort());
  pass('five teacher reloads: the learner never sees more than one teacher', seen.max === 1 && usersAfterReloads.join() === [LABEL.participant, LABEL.host].sort().join(),
    { maxTeachersSeen: seen.max, samples: seen.samples, over: seen.over.slice(0, 3), usersAfterReloads, passesIssued: passes });

  // 4. Second tab for the same teacher and lesson.
  const second = watch(await teacherContext.newPage(), 'teacher-tab-2');
  await second.goto(`${origin}/?lesson=l1&person=teacher&role=host`);
  await second.getByTestId('room-other-tab').waitFor({ timeout: 20000 });
  const guardText = await second.getByTestId('room-other-tab').innerText();
  const passesBefore = passes;
  await second.getByRole('button', { name: 'Utiliser cet onglet' }).click();
  await teacher.getByTestId('room-displaced').waitFor({ timeout: 40000 });
  await enter(second, LABEL.host);
  await learner.waitForTimeout(4000);
  seen = await learner.evaluate(() => window.__seen);
  const usersAfterTakeover = await learner.evaluate(() => (window.zmClient.getAllUser() || []).map(u => u.displayName).sort());
  pass('second tab: guard shown, « Utiliser cet onglet » moves the room, still one teacher', /Vous êtes déjà connecté à ce cours dans un autre onglet\./.test(guardText)
    && passes === passesBefore + 1 && seen.max === 1 && usersAfterTakeover.length === 2, { guardText, maxTeachersSeen: seen.max, usersAfterTakeover });

  // 5. Refused tokens: our French card, by error code; the real payload is recorded.
  for (const kind of ['forged', 'expired']) {
    const context = await person(kind, { viewport: { width: 390, height: 844 } });
    const page = watch(await context.newPage(), kind);
    await page.goto(`${origin}/?lesson=l1&person=${kind}&role=participant`);
    const join = page.getByRole('button', { name: 'Rejoindre le cours' });
    await join.waitFor({ timeout: 60000 });
    await join.click();
    const refused = page.getByTestId('room-refused');
    const shown = await refused.waitFor({ timeout: 90000 }).then(() => true, () => false);
    const detail = shown ? { code: await refused.getAttribute('data-code'), text: await refused.innerText(), toolkitGone: (await page.locator('[data-testid="zoom-room"]').count()) === 0 } : { text: (await page.locator('body').innerText()).slice(0, 300) };
    pass(`refused token (${kind}): French card after the toolkit is closed`, shown && detail.toolkitGone && !/Join Session Failed|Error Code|JWT/i.test(detail.text),
      { ...detail, trace: report.trace[kind].filter(line => / connection | room failed /.test(line)) });
    await context.close();
  }

  // 6. Nothing was refused by the room path's CSP.
  pass('room CSP and Permissions-Policy: nothing refused on the pre-join screen or in the session', cspBlocked.length === 0, { blocked: cspBlocked.slice(0, 8) });

  // End the session for everyone.
  await second.evaluate(() => window.zmClient?.leave?.(true)).catch(() => {});
  await learner.waitForTimeout(3000);
  record('learner after the teacher ended the session', { phase: await learner.evaluate(() => window.__phase), trace: report.trace.learner.slice(-4) });
} finally {
  for (const context of contexts) await context.close().catch(() => {});
  await browser.close();
  await new Promise(resolve => server.close(resolve));
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`Report written to ${reportPath}`);
}
