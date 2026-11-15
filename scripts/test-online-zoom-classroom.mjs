// Classroom tools against Zoom Video SDK, with the real UI Toolkit and the room path's
// headers EXACTLY as next.config.mjs ships them in Production (plan
// online-classroom-tools.md, OCT-r3, Tests). Local only, never in CI: it needs the Zoom
// developer credentials in the git-ignored .env.local (OL_ENV_FILE points elsewhere, e.g.
// from a worktree) and a network path to Zoom. Installed Chrome. Touches no database.
//
// This script has NO option to widen or change the headers. A diagnosis under another
// policy needs a separate throw-away script; a run of this one is a proof of the policy
// in the repository at the head named in its report.
//
// Whiteboard half (PR A). A teacher (host, computer), a learner (computer) and a
// phone-shaped participant (390 px, touch, Android user agent) join one throw-away
// session. It passes when:
//   1. no Content-Security-Policy refusal is reported for any of the three, over the
//      whole run (the browser's securitypolicyviolation event, its console message, and
//      the room's own `csp blocked` trace line);
//   2. the teacher starts the whiteboard with the toolkit's own button and it reaches
//      « in progress » for the teacher and the learner;
//   3. the teacher draws a real stroke (pointer drag): the whiteboard's undo control
//      becomes available to the teacher and the learner's canvas changes;
//   4. the learner draws a real stroke: the same, the other way round;
//   5. the phone reports isWhiteboardEnabled() false, receives the whiteboard as a share
//      stream, has no canvas or drawing tool, and shows the read-only line;
//   6. the learner has no export control; the teacher's PDF export downloads a file;
//   7. after the stop everyone is back on the camera view, and the connection never left
//      Connected.
// The groups half belongs to PR B.
// OL_CLASSROOM_SHOTS=<directory> saves a screenshot per participant when the run breaks.
// Writes a JSON report (OL_ZOOM_CLASSROOM_REPORT, default
// scripts/.zoom-classroom-report.json, git-ignored). A failed assertion blocks the merge.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';
import { buildRoomHarness, serveRoomHarness } from './lib/online-room-harness.mjs';
import { createZoomVideoProvider } from '../src/lib/online/provider/zoom-video.mjs';
import { WHITEBOARD_READ_ONLY_TEXT } from '../src/lib/online/zoom-whiteboard.mjs';

// The Production policy: next.config.mjs adds 'unsafe-eval' and the local Supabase hosts
// outside Production, so the configuration is evaluated the way the Production build does.
process.env.NODE_ENV = 'production';
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
const { default: nextConfig, ZOOM_WHITEBOARD_SOURCES } = await import('../next.config.mjs');

const envFile = process.env.OL_ENV_FILE || '.env.local';
const file = existsSync(envFile) ? Object.fromEntries(readFileSync(envFile, 'utf8').split('\n').flatMap(line => {
  const m = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);
  return m ? [[m[1], m[2].trim().replace(/^['"]|['"]$/g, '')]] : [];
})) : {};
const env = { ONLINE_VIDEO_PROVIDER_API_KEY: process.env.ONLINE_VIDEO_PROVIDER_API_KEY || file.ONLINE_VIDEO_PROVIDER_API_KEY,
  ONLINE_VIDEO_PROVIDER_API_SECRET: process.env.ONLINE_VIDEO_PROVIDER_API_SECRET || file.ONLINE_VIDEO_PROVIDER_API_SECRET };
if (!env.ONLINE_VIDEO_PROVIDER_API_KEY || !env.ONLINE_VIDEO_PROVIDER_API_SECRET) {
  console.error('SKIP zoom classroom: set ONLINE_VIDEO_PROVIDER_API_KEY and ONLINE_VIDEO_PROVIDER_API_SECRET in .env.local');
  process.exit(2);
}
const reportPath = process.env.OL_ZOOM_CLASSROOM_REPORT || 'scripts/.zoom-classroom-report.json';
setTimeout(() => { console.error('FAIL zoom classroom stalled'); process.exit(1); }, 8 * 60_000).unref();

const git = args => { try { return execFileSync('git', args, { encoding: 'utf8' }).trim(); } catch { return null; } };
const zoom = createZoomVideoProvider(env);
const run = `ehtest-${randomBytes(6).toString('hex')}`;
const LABEL = { teacher: 'Test P.', learner: 'Test D.', phone: 'Test T.' };
const ref = () => `00000000-0000-4000-8000-${randomBytes(6).toString('hex')}`;
const embed = async query => (await zoom.mintJoinToken({ roomRef: run, displayName: LABEL[query.person] || LABEL.learner, role: query.role === 'host' ? 'host' : 'participant',
  expiresAt: new Date(Date.now() + 70 * 60000).toISOString(), participantRef: ref(), lessonRef: query.lesson })).embed;

// The room path's headers, exactly as Next.js sends them (later rules win per key).
const roomHeaders = Object.entries(Object.fromEntries((await nextConfig.headers())
  .filter(rule => rule.source === '/(.*)' || rule.source === '/online/room/:path*').flatMap(rule => rule.headers.map(h => [h.key, h.value]))))
  .filter(([key]) => ['Content-Security-Policy', 'Permissions-Policy'].includes(key)).map(([key, value]) => ({ key, value }));
assert.equal(roomHeaders.length, 2, 'room CSP and Permissions-Policy found');
const policy = roomHeaders.find(h => h.key === 'Content-Security-Policy').value;
assert.ok(!policy.includes("'unsafe-eval'") && !policy.includes('127.0.0.1'), 'the Production policy, not the development one');

const report = { run: new Date().toISOString(), head: git(['rev-parse', 'HEAD']), workingTreeClean: git(['status', '--porcelain']) === '',
  policy, permissionsPolicy: roomHeaders.find(h => h.key === 'Permissions-Policy').value, whiteboardSources: ZOOM_WHITEBOARD_SOURCES, results: {}, people: {} };
const pass = (name, ok, detail = {}) => { report.results[name] = { ok, ...detail }; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`, JSON.stringify(detail)); if (!ok) process.exitCode = 1; };

const harness = await buildRoomHarness({ fake: false });
const { server, origin } = await serveRoomHarness({ ...harness, embed, headers: roomHeaders });
const channel = process.env.OL_BROWSER_CHANNEL === 'chromium' ? undefined : (process.env.OL_BROWSER_CHANNEL || 'chrome');
const browser = await chromium.launch({ headless: true, channel, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const contexts = [];
const people = ['teacher', 'learner', 'phone'];

async function open(label, role, options) {
  const seen = report.people[label] = { connection: [], csp: [], trace: [], whiteboardHosts: [] };
  const context = await browser.newContext({ permissions: ['camera', 'microphone'], acceptDownloads: true, ...options });
  contexts.push(context);
  await context.exposeFunction('__cspBlocked', entry => seen.csp.push(entry));
  await context.addInitScript(() => document.addEventListener('securitypolicyviolation', e =>
    window.__cspBlocked({ via: 'event', directive: e.effectiveDirective, blocked: String(e.blockedURI).split('?')[0].slice(0, 120) })));
  const page = await context.newPage();
  page.on('console', message => {
    const text = message.text();
    const line = text.match(/^\[online room\] \S+ (.*)$/)?.[1];
    if (line) {
      const state = line.match(/^connection state=(\w+)(?: code=(\S+))?(?: reason=(.*))?/);
      if (state) seen.connection.push({ state: state[1], reason: state[3] });
      if (/^(whiteboard|csp blocked)/.test(line)) seen.trace.push(line);
      if (line.startsWith('csp blocked')) seen.csp.push({ via: 'trace', line });
    } else if (/Content Security Policy/.test(text)) seen.csp.push({ via: 'console', text: text.replace(/\?[^'"\s]*/g, '').slice(0, 220) });
  });
  page.on('request', request => {
    const url = request.url();
    if (url.includes('/web_client_whiteboard/')) { const host = new URL(url).host; if (!seen.whiteboardHosts.includes(host)) seen.whiteboardHosts.push(host); }
  });
  await page.goto(`${origin}/?lesson=l1&person=${label}&role=${role}`);
  const join = page.getByRole('button', { name: 'Rejoindre le cours' });
  await join.waitFor({ timeout: 60000 });
  await page.locator('[data-testid="zoom-room"] button.bg-red-500, [data-testid="zoom-room"] button:has(svg)').first().click();
  await page.waitForTimeout(1500);
  await join.click();
  await page.waitForFunction(() => window.zmClient?.getSessionInfo?.().isInMeeting === true, null, { timeout: 90000 });
  return page;
}

const BOARD = '#uikit-whiteboard-container';
const boardState = page => page.evaluate(() => {
  const board = window.zmClient?.getWhiteboardClient?.();
  const labels = [...document.querySelectorAll('button, [role="button"], [role="menuitem"], a')].map(el => (el.getAttribute('aria-label') || el.title || el.textContent || '').trim()).filter(Boolean);
  return { status: board?.getWhiteboardStatus?.(), enabled: board?.isWhiteboardEnabled?.(), canvas: !!document.querySelector('#uikit-whiteboard-container canvas'),
    drawingTools: labels.filter(l => /^(Stylo|Pense-bête|Tous les outils|Effacer la page)$/.test(l)), exportControls: labels.filter(l => /export/i.test(l)).map(l => l.slice(0, 40)),
    readOnlyLine: document.querySelector('[data-testid="room-whiteboard-readonly"]')?.textContent || null,
    sharers: (window.zmClient?.getAllUser?.() || []).filter(u => u.sharerOn).map(u => u.displayName), phase: window.__phase,
    inMeeting: !!window.zmClient?.getSessionInfo?.().isInMeeting };
});
const until = async (page, test, ms = 30000) => { for (const end = Date.now() + ms; Date.now() < end;) { if (test(await boardState(page))) return true; await page.waitForTimeout(500); } return false; };
// Zoom's whiteboard opens with a template chooser and a tool tip over the canvas.
async function clearOverlays(page) {
  for (let round = 0; round < 3; round++) {
    const close = page.locator(`${BOARD} [role="dialog"] button[aria-label="Fermer"], [role="dialog"] button[aria-label="Fermer"], ${BOARD} button[aria-label="Fermer"]`);
    for (let i = (await close.count()) - 1; i >= 0; i--) await close.nth(i).click({ timeout: 1500 }).catch(() => {});
    await page.getByRole('button', { name: 'OK', exact: true }).first().click({ timeout: 800 }).catch(() => {});
    await page.waitForTimeout(400);
  }
}
// The lower canvas holds the drawing. Remember it, then count the pixels that changed.
const snapshot = page => page.evaluate(() => {
  const canvas = document.querySelector('#uikit-whiteboard-container canvas.lower-canvas') || document.querySelector('#uikit-whiteboard-container canvas');
  if (!canvas) return false;
  window.__boardBefore = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  return true;
});
const changedPixels = page => page.evaluate(() => {
  const canvas = document.querySelector('#uikit-whiteboard-container canvas.lower-canvas') || document.querySelector('#uikit-whiteboard-container canvas');
  const before = window.__boardBefore;
  if (!canvas || !before) return -1;
  const now = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  if (now.length !== before.length) return now.length;
  let changed = 0;
  for (let i = 0; i < now.length; i += 4) if (Math.abs(now[i] - before[i]) + Math.abs(now[i + 1] - before[i + 1]) + Math.abs(now[i + 2] - before[i + 2]) > 60) changed++;
  return changed;
});
const undoEnabled = page => page.evaluate(() => { const b = document.querySelector('#uikit-whiteboard-container button[aria-label="Annuler"]'); return !!b && !b.disabled && b.getAttribute('aria-disabled') !== 'true'; });
// A pointer drag with the pen, in a free part of the canvas.
async function stroke(page, yFraction) {
  await clearOverlays(page);
  const undoBefore = await undoEnabled(page);
  // The pen is in the left toolbar, or behind « Tous les outils » when the board is short.
  const pen = page.locator(BOARD).getByRole('button', { name: /^Stylo/ }).first();
  if (!await pen.isVisible().catch(() => false)) await page.locator(BOARD).getByRole('button', { name: 'Tous les outils' }).first().click({ timeout: 8000 });
  await pen.click({ timeout: 8000 });
  await clearOverlays(page);
  await page.waitForTimeout(600);
  const box = await page.locator(`${BOARD} canvas.upper-canvas, ${BOARD} canvas`).last().boundingBox();
  const y = box.y + box.height * yFraction, x0 = box.x + box.width * 0.42, x1 = box.x + box.width * 0.72;
  await page.mouse.move(x0, y);
  await page.mouse.down();
  for (let step = 1; step <= 24; step++) await page.mouse.move(x0 + (x1 - x0) * step / 24, y + Math.sin(step / 3) * 18);
  await page.mouse.up();
  await page.waitForTimeout(800);
  return { undoBefore, undoAfter: await undoEnabled(page) };
}
const changedWithin = async (page, ms = 20000) => { let changed = 0; for (const end = Date.now() + ms; Date.now() < end;) { changed = await changedPixels(page); if (changed > 150) break; await page.waitForTimeout(500); } return changed; };

try {
  const teacher = await open('teacher', 'host', { viewport: { width: 1280, height: 900 } });
  const learner = await open('learner', 'participant', { viewport: { width: 1280, height: 900 } });
  const phone = await open('phone', 'participant', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36' });
  const pages = { teacher, learner, phone };
  await teacher.waitForTimeout(3000);
  const before = { teacher: await boardState(teacher), learner: await boardState(learner), phone: await boardState(phone) };

  // 2. Start, through the toolkit's own button.
  await teacher.getByRole('button', { name: 'Ouvrir le tableau blanc' }).first().click({ timeout: 15000 });
  const started = { teacher: await until(teacher, s => s.status === 2 && s.canvas), learner: await until(learner, s => s.status === 2 && s.canvas) };
  pass('2. the teacher starts the whiteboard with the toolkit button; in progress for teacher and learner', started.teacher && started.learner,
    { started, button: 'Ouvrir le tableau blanc', hostsLoaded: Object.fromEntries(people.map(p => [p, report.people[p].whiteboardHosts])) });
  const hosts = [...new Set(people.flatMap(p => report.people[p].whiteboardHosts))];
  pass('the whiteboard program came from a source the shipped header lists', hosts.length > 0 && hosts.every(host => ZOOM_WHITEBOARD_SOURCES.includes(`https://${host}/web_client_whiteboard/`)), { hosts });
  await teacher.waitForTimeout(4000);
  await clearOverlays(teacher); await clearOverlays(learner);

  // 3. A real stroke by the teacher reaches the learner.
  await snapshot(learner);
  const teacherStroke = await stroke(teacher, 0.45);
  const learnerSaw = await changedWithin(learner);
  pass('3. teacher stroke: undo becomes available to the teacher and the learner\'s canvas changes', !teacherStroke.undoBefore && teacherStroke.undoAfter && learnerSaw > 150, { ...teacherStroke, learnerCanvasPixelsChanged: learnerSaw });

  // 4. A real stroke by the learner reaches the teacher (D3: learners on a computer draw).
  await snapshot(teacher);
  const learnerStroke = await stroke(learner, 0.7);
  const teacherSaw = await changedWithin(teacher);
  pass('4. learner stroke: undo becomes available to the learner and the teacher\'s canvas changes', !learnerStroke.undoBefore && learnerStroke.undoAfter && teacherSaw > 150, { ...learnerStroke, teacherCanvasPixelsChanged: teacherSaw });

  // 5. The phone: no canvas, the whiteboard as a share stream, the read-only line.
  const phoneGotShare = await until(phone, s => s.sharers.includes(LABEL.teacher), 20000);
  const phoneLine = await until(phone, s => s.readOnlyLine === WHITEBOARD_READ_ONLY_TEXT, 10000);
  const phoneNow = await boardState(phone);
  pass('5a. phone: isWhiteboardEnabled() false, whiteboard received as a share stream, no canvas and no drawing tool',
    before.phone.enabled === false && phoneNow.enabled === false && phoneGotShare && !phoneNow.canvas && phoneNow.drawingTools.length === 0,
    { enabled: phoneNow.enabled, sharers: phoneNow.sharers, canvas: phoneNow.canvas, drawingTools: phoneNow.drawingTools });
  pass('5b. phone: the read-only line is shown while the whiteboard is open', phoneLine, { line: phoneNow.readOnlyLine });
  const desktopLines = { teacher: (await boardState(teacher)).readOnlyLine, learner: (await boardState(learner)).readOnlyLine };
  pass('the read-only line is not shown on a device that has the canvas', desktopLines.teacher === null && desktopLines.learner === null, desktopLines);
  pass('whiteboard capability traced once per participant', ['yes', 'yes', 'no'].every((want, i) => report.people[people[i]].trace.filter(l => l.startsWith('whiteboard available')).join('|') === `whiteboard available available=${want} source=sdk`),
    Object.fromEntries(people.map(p => [p, report.people[p].trace.filter(l => l.startsWith('whiteboard available'))])));

  // 6. Export: nothing for the learner (also inside Zoom's own menus); a PDF for the teacher.
  await clearOverlays(learner);
  const learnerExport = new Set((await boardState(learner)).exportControls);
  const menus = learner.locator(`${BOARD} button[aria-label="Plus d'options"]`);
  for (let i = 0; i < await menus.count(); i++) {
    await menus.nth(i).click({ timeout: 3000 }).catch(() => {});
    await learner.waitForTimeout(700);
    for (const label of (await boardState(learner)).exportControls) learnerExport.add(label);
    await learner.keyboard.press('Escape');
    await learner.waitForTimeout(300);
  }
  pass('6a. the learner has no export control (toolkit or whiteboard menus)', learnerExport.size === 0, { exportControls: [...learnerExport], menusOpened: await menus.count() });
  await clearOverlays(teacher);
  const download = teacher.waitForEvent('download', { timeout: 60000 }).then(async d => ({ name: d.suggestedFilename().replace(run, '<session>'), failure: await d.failure() }), error => ({ error: String(error.message).slice(0, 120) }));
  await teacher.getByRole('button', { name: 'Fermer le tableau blanc' }).first().click({ timeout: 10000 });
  await teacher.getByRole('button', { name: 'Exporter et fermer' }).first().click({ timeout: 10000 });
  const exported = await download;
  pass('6b. the teacher\'s PDF export downloads a file', /\.pdf$/i.test(exported.name || '') && !exported.failure, exported);

  // 7. Stop: everyone back on the camera view; the connection never left Connected.
  const stopped = { teacher: await until(teacher, s => s.status === 0 && !s.canvas, 30000), learner: await until(learner, s => s.status === 0 && !s.canvas, 30000),
    phone: await until(phone, s => s.sharers.length === 0 && s.readOnlyLine === null, 30000) };
  const after = Object.fromEntries(await Promise.all(people.map(async p => [p, await boardState(pages[p])])));
  pass('7. stop: everyone is back on the camera view and still in the room', Object.values(stopped).every(Boolean) && people.every(p => after[p].inMeeting && after[p].phase === 'in_room' && after[p].readOnlyLine === null),
    { stopped, after: Object.fromEntries(people.map(p => [p, { status: after[p].status, canvas: after[p].canvas, sharers: after[p].sharers, phase: after[p].phase }])) });
  pass('7. the connection never left Connected', people.every(p => report.people[p].connection.length > 0 && report.people[p].connection.every(c => c.state === 'Connected')),
    Object.fromEntries(people.map(p => [p, report.people[p].connection.map(c => c.state).join(' ')])));

  // 1. Over the whole run.
  await teacher.waitForTimeout(2000);
  pass('1. zero Content-Security-Policy refusals for all three participants over the whole run', people.every(p => report.people[p].csp.length === 0),
    Object.fromEntries(people.map(p => [p, { count: report.people[p].csp.length, first: report.people[p].csp.slice(0, 4) }])));
  await teacher.evaluate(() => window.zmClient?.leave?.(true)).catch(() => {});
  await learner.waitForTimeout(2000);
} catch (error) {
  if (process.env.OL_CLASSROOM_SHOTS) for (const [i, context] of contexts.entries()) await context.pages()[0]?.screenshot({ path: `${process.env.OL_CLASSROOM_SHOTS}/fail-${people[i]}.png` }).catch(() => {});
  pass('the run completed', false, { error: String(error?.message || error).slice(0, 300) });
} finally {
  for (const context of contexts) await context.close().catch(() => {});
  await browser.close();
  await new Promise(resolve => server.close(resolve));
  report.verdict = process.exitCode ? 'FAIL' : 'PASS';
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`${report.verdict} zoom classroom (whiteboard half) at ${report.head}${report.workingTreeClean ? '' : ' + uncommitted changes'}; report written to ${reportPath}`);
}
