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
//   1. no Content-Security-Policy refusal is reported for any participant, over the
//      whole run (the browser's securitypolicyviolation event, its console message, and
//      the room's own `csp blocked` trace line), EXCEPT the one refusal the owner named
//      on 2026-11-16: directive script-src, blocked value « eval », raised by a script
//      under an approved whiteboard source (Zoom's whiteboard probes whether it may
//      compile code and carries on without). The same refusal from any other source, and
//      any other refusal, fails the run;
//   2. the teacher starts the whiteboard with the toolkit's own button and it reaches
//      « in progress » for the teacher and the learner;
//   3. the teacher draws a real stroke (the whiteboard's keyboard shortcut for the pen,
//      then a pointer drag): the whiteboard's undo control becomes available to the
//      teacher and the learner's canvas changes;
//   4. the learner draws a real stroke: the same, the other way round;
//   5. the phone reports isWhiteboardEnabled() false, receives the whiteboard as a share
//      stream, has no canvas or drawing tool, and shows the read-only line; a second
//      phone that joins while the whiteboard is open shows it too, and so does the first
//      phone after a reload of its page;
//   6. the learner has no export control; the teacher's PDF export downloads a file;
//   7. after the stop everyone is back on the camera view, and the connection never left
//      Connected.
//
// Groups half (PR B, « Groupes »). The same session, with the second phone left without a
// group (the teacher rule of D11). Every step is a click in the toolkit's OWN groups
// window and dialogs; the SDK is only read, to know where each participant is. The whole
// sequence runs twice, with « Autoriser les participants à revenir à la salle principale
// à tout moment » ticked, then not ticked. In each pass:
//   G1. the teacher creates two groups, sets the timer in the settings, assigns the
//       learner and the phone by hand and opens the groups (first pass: assigned, then
//       opened; second pass: opened, then assigned); the room's trace shows the timer it
//       sent to Zoom (the toolkit's own timer is broken; zoom-groups.mjs corrects it);
//   G2. each of the two accepts the toolkit's invitation and arrives in its group; the
//       teacher's message to all groups reaches both;
//   G3. the learner asks for help; the teacher gets the dialog, joins that group, then
//       comes back through the toolkit's leave control;
//   G4. ONE tap on the toolkit's own leave control inside a group leaves nobody out of
//       the lesson, on the computer and on the phone, and the computer's menu is still
//       visible three seconds later, while the timer counts down; with the return allowed the second
//       tap, on « Revenir à la salle principale », brings the participant back to the
//       main room; without it the toolkit offers no return, and the participant is still
//       in the lesson and in the group; « Quitter le cours » at the top of the page asks
//       first and « Rester dans le cours » keeps the room;
//   G5. first pass: the teacher closes all groups; second pass: nobody closes them, the
//       timer does. Everybody is back in the main room;
//   G6. over the whole pass, for every participant: the page phase is in_room, the
//       address is the room, the room never reported « left » or « failed », the
//       connection states are only Reconnecting and Connected, the participant without a
//       group never moved, and after each return the toolbar has the controls it had
//       before the move (none missing; one that appears in addition is reported);
//   G7. (review N1 of #195) audio: after every arrival in a group, every return to the
//       main room and the teacher's visit, each participant who had computer audio has
//       it again, with the microphone in the state it had before the move (a working
//       microphone control, never « join audio »), within AUDIO_BACK_MS. Zoom's SDK
//       rejoins the audio by itself a few seconds after the move, without a tap (found
//       2026-11-17 in installed Chrome without the autoplay switch; the toolkit does not
//       rejoin it and the room does not either); how long it took is in the report.
// Then whiteboard and groups together: the read-only line of a phone follows it into a
// group (no whiteboard there: no line) and back (the phone asks, the presenter answers:
// the line returns), and the phone that stayed keeps it.
// Media part (classroom polish: existing features that had no proof). The teacher runs in
// its own Chrome, which picks a tab titled TONE_TITLE when a share is started (a page of
// the teacher's that plays a 440 Hz tone; Chrome's audio output is disabled, so nothing
// is heard on the test machine). Every step clicks the toolkit's own controls:
//   M1. the teacher mutes the learner (participants panel, « Couper le micro »): the
//       learner is muted; whether the learner can unmute themself is recorded;
//   M2. « Couper tous les micros »: both learners are muted, the teacher is not; whether
//       each can unmute themself is recorded;
//   M3. share with computer sound: the SDK asks the browser for the shared tab's sound
//       (the « share tab audio » box of Chrome's picker), the browser hands back an
//       audio track, Zoom lists the teacher as sharing sound for each learner, and with
//       every microphone muted the learners receive audio while the share runs and none
//       before it; the teacher's own microphone during the share is recorded;
//   M4. annotation on the shared tab: a pencil stroke by the teacher appears on the
//       learner's screen, and a pencil stroke by the learner appears on the teacher's
//       (pixels counted in screenshots of the shared area); the phone's annotation
//       controls are recorded;
//   M5. no Content-Security-Policy refusal during the media part (stop condition S2).
// Over the whole run: no participant's console has the toolkit's decoded-token line, and
// each participant's trace says once per join that the groups timer correction is on.
// OL_CLASSROOM_PART=whiteboard|groups|media runs one part only, for repairs; such a run is
// reported as PARTIAL and is not a proof.
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
import { WHITEBOARD_READ_ONLY_TEXT, WHITEBOARD_SOURCES, EXPECTED_CSP_REFUSAL } from '../src/lib/online/zoom-whiteboard.mjs';

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
setTimeout(() => { console.error('FAIL zoom classroom stalled'); process.exit(1); }, 25 * 60_000).unref();
const PART = ['whiteboard', 'groups', 'media'].includes(process.env.OL_CLASSROOM_PART) ? process.env.OL_CLASSROOM_PART : 'all';

const git = args => { try { return execFileSync('git', args, { encoding: 'utf8' }).trim(); } catch { return null; } };
const zoom = createZoomVideoProvider(env);
const run = `ehtest-${randomBytes(6).toString('hex')}`;
const LABEL = { teacher: 'Test P.', learner: 'Test D.', phone: 'Test T.', phone2: 'Test U.' };
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
// The teacher's Chrome: a share picks the tab titled TONE_TITLE (Chrome's picker cannot be
// clicked headless; the fake picker would share a silent fake screen), and its sound is
// captured without being played on the test machine.
const TONE_TITLE = 'EH classroom tone';
const teacherBrowser = await chromium.launch({ headless: true, channel, ignoreDefaultArgs: ['--mute-audio'],
  args: ['--use-fake-device-for-media-stream', `--auto-select-tab-capture-source-by-title=${TONE_TITLE}`, '--autoplay-policy=no-user-gesture-required', '--disable-audio-output'] });
// Chrome's audio output is only disabled when the browser itself is not muted; both are checked in the report.
report.teacherBrowser = { tabCaptureByTitle: TONE_TITLE, audioOutput: 'disabled' };
const contexts = [];
const people = ['teacher', 'learner', 'phone'];
const everyone = [...people, 'phone2'];
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36' };
// The one named refusal: script-src, « eval », from a script under an approved whiteboard source.
const underWhiteboard = url => WHITEBOARD_SOURCES.some(prefix => String(url || '').startsWith(prefix));

async function enter(page) {
  const join = page.getByRole('button', { name: 'Rejoindre le cours' });
  await join.waitFor({ timeout: 60000 });
  await page.locator('[data-testid="zoom-room"] button.bg-red-500, [data-testid="zoom-room"] button:has(svg)').first().click();
  await page.waitForTimeout(1500);
  await join.click();
  await page.waitForFunction(() => window.zmClient?.getSessionInfo?.().isInMeeting === true, null, { timeout: 90000 });
}
async function open(label, role, options, { from = role === 'host' ? teacherBrowser : browser, permissions = ['camera', 'microphone'], join = true } = {}) {
  const seen = report.people[label] = { connection: [], csp: [], expectedRefusals: [], trace: [], whiteboardHosts: [], whiteboardBuilds: [], elsewhere: [], jwtLines: 0, cameraMessages: [] };
  const context = await from.newContext({ permissions, acceptDownloads: true, ...options });
  contexts.push(context);
  // Every refusal is recorded; only the named one goes to `expectedRefusals`.
  const refused = entry => (entry.expected ? seen.expectedRefusals : seen.csp).push(entry);
  await context.exposeFunction('__cspBlocked', entry => refused({ via: 'event', directive: entry.directive, blocked: entry.blocked, source: entry.source.replace(/^(https:\/\/[^/]+\/web_client_whiteboard\/)[^/]+\//, '$1<build>/'),
    expected: entry.directive === 'script-src' && entry.blocked === 'eval' && underWhiteboard(entry.source) }));
  await context.addInitScript(() => document.addEventListener('securitypolicyviolation', e =>
    window.__cspBlocked({ directive: e.effectiveDirective, blocked: String(e.blockedURI).split('?')[0].slice(0, 120), source: String(e.sourceFile || '').split('?')[0].slice(0, 160) })));
  const page = await context.newPage();
  page.on('console', message => {
    const text = message.text();
    const line = text.match(/^\[online room\] \S+ (.*)$/)?.[1];
    if (line) {
      const state = line.match(/^connection state=(\w+)(?: code=(\S+))?(?: reason=(.*))?/);
      if (state) seen.connection.push({ state: state[1], reason: state[3] });
      if (/^(whiteboard|csp blocked|room (left|failed|closed|move)|groups (open|timer)|camera message)/.test(line)) seen.trace.push(line);
      if (line.startsWith('csp blocked')) refused({ via: 'trace', line, expected: /^csp blocked directive=script-src host=eval source=us0[45]st1\.zoom\.us expected=whiteboard-eval-probe$/.test(line) && line.endsWith(`expected=${EXPECTED_CSP_REFUSAL}`) });
    } else if (text.startsWith('[JWT]')) {
      seen.jwtLines++;
    } else if (/Content Security Policy/.test(text)) {
      refused({ via: 'console', text: text.replace(/\?[^'"\s]*/g, '').slice(0, 220), expected: /'unsafe-eval'/.test(text) && /script-src/.test(text) && underWhiteboard(message.location()?.url) });
    }
  });
  page.on('request', request => {
    const url = request.url();
    if (!url.includes('/web_client_whiteboard/')) return;
    const host = new URL(url).host, build = url.split('/web_client_whiteboard/')[1].split('/')[0];
    if (!seen.whiteboardHosts.includes(host)) seen.whiteboardHosts.push(host);
    if (!seen.whiteboardBuilds.includes(build)) seen.whiteboardBuilds.push(build);
  });
  // Any document other than the room (the stand-in portal of the harness, for instance).
  page.on('framenavigated', frame => { if (frame === page.mainFrame() && new URL(frame.url()).pathname !== '/') seen.elsewhere.push(new URL(frame.url()).pathname); });
  await page.goto(`${origin}/?lesson=l1&person=${label}&role=${role}`);
  if (join) await enter(page);
  return page;
}

const BOARD = '#uikit-whiteboard-container';
const boardState = page => page.evaluate(() => {
  const board = window.zmClient?.getWhiteboardClient?.();
  const labels = [...document.querySelectorAll('button, [role="button"], [role="menuitem"], a')].map(el => (el.getAttribute('aria-label') || el.title || el.textContent || '').trim()).filter(Boolean);
  return { status: board?.getWhiteboardStatus?.(), enabled: board?.isWhiteboardEnabled?.(), canvas: !!document.querySelector('#uikit-whiteboard-container canvas'),
    drawingTools: labels.filter(l => /^(Stylo|Pense-bête|Tous les outils|Effacer la page|Annuler|Rétablir)$/.test(l)), exportControls: labels.filter(l => /export/i.test(l)).map(l => l.slice(0, 40)),
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
// The undo control, by its accessible name (French interface; English as a fallback).
const UNDO = '#uikit-whiteboard-container button[aria-label="Annuler"], #uikit-whiteboard-container button[aria-label="Undo"]';
const undoState = page => page.evaluate(selector => { const b = document.querySelector(selector); return b ? (!b.disabled && b.getAttribute('aria-disabled') !== 'true') : null; }, UNDO);
const boardControls = page => page.evaluate(() => [...document.querySelectorAll('#uikit-whiteboard-container button')].filter(b => b.offsetParent !== null).map(b => (b.getAttribute('aria-label') || b.title || b.textContent || '').trim().slice(0, 30)).filter(Boolean).slice(0, 40));
// A pointer drag with the pen, in a free part of the canvas. The pen is chosen with the
// whiteboard's own keyboard shortcut (« p »), which does not depend on where Zoom puts
// the pen in its toolbar or on what it is called; the toolbar moved between two Zoom
// builds on 2026-11-16. When the stroke does not register, the error says what the
// whiteboard offers now, so the step can be repaired quickly.
async function stroke(page, who, yFraction) {
  await clearOverlays(page);
  const canvas = page.locator(`${BOARD} canvas.upper-canvas, ${BOARD} canvas`).last();
  const box = await canvas.boundingBox({ timeout: 15000 }).catch(() => null);
  if (!box) throw new Error(`${who} stroke: no whiteboard canvas found under ${BOARD} (Zoom changed the whiteboard markup?)`);
  const undoBefore = await undoState(page);
  if (undoBefore === null) throw new Error(`${who} stroke: the undo control (aria-label « Annuler » or « Undo ») is not in the whiteboard any more; controls now: ${JSON.stringify(await boardControls(page))}`);
  // A click on an empty part of the canvas gives it the keyboard; then the pen shortcut.
  await page.mouse.click(box.x + box.width * 0.9, box.y + box.height * (yFraction - 0.12));
  await page.keyboard.press('p');
  await page.waitForTimeout(500);
  const y = box.y + box.height * yFraction, x0 = box.x + box.width * 0.42, x1 = box.x + box.width * 0.72;
  await page.mouse.move(x0, y);
  await page.mouse.down();
  for (let step = 1; step <= 24; step++) await page.mouse.move(x0 + (x1 - x0) * step / 24, y + Math.sin(step / 3) * 18);
  await page.mouse.up();
  await page.waitForTimeout(800);
  const undoAfter = await undoState(page);
  if (!undoAfter) throw new Error(`${who} stroke: the pen shortcut « p » and a drag did not make undo available (shortcut changed, or the canvas did not take the keyboard); controls now: ${JSON.stringify(await boardControls(page))}`);
  await page.keyboard.press('Escape');
  return { undoBefore, undoAfter, pen: 'keyboard shortcut p' };
}
const changedWithin = async (page, ms = 20000) => { let changed = 0; for (const end = Date.now() + ms; Date.now() < end;) { changed = await changedPixels(page); if (changed > 150) break; await page.waitForTimeout(500); } return changed; };

async function whiteboardHalf(pages) {
  const { teacher, learner, phone } = pages;
  const before = { teacher: await boardState(teacher), learner: await boardState(learner), phone: await boardState(phone) };

  // 2. Start, through the toolkit's own button.
  await teacher.getByRole('button', { name: 'Ouvrir le tableau blanc' }).first().click({ timeout: 15000 });
  const started = { teacher: await until(teacher, s => s.status === 2 && s.canvas, 60000), learner: await until(learner, s => s.status === 2 && s.canvas, 60000) };
  pass('2. the teacher starts the whiteboard with the toolkit button; in progress for teacher and learner', started.teacher && started.learner,
    { started, button: 'Ouvrir le tableau blanc', hostsLoaded: Object.fromEntries(people.map(p => [p, report.people[p].whiteboardHosts])), builds: [...new Set(people.flatMap(p => report.people[p].whiteboardBuilds))] });
  const hosts = [...new Set(people.flatMap(p => report.people[p].whiteboardHosts))];
  pass('the whiteboard program came from a source the shipped header lists', hosts.length > 0 && hosts.every(host => ZOOM_WHITEBOARD_SOURCES.includes(`https://${host}/web_client_whiteboard/`)), { hosts });
  await teacher.waitForTimeout(4000);
  await clearOverlays(teacher); await clearOverlays(learner);

  // 3. A real stroke by the teacher reaches the learner.
  await snapshot(learner);
  const teacherStroke = await stroke(teacher, 'teacher', 0.45);
  const learnerSaw = await changedWithin(learner);
  pass('3. teacher stroke: undo becomes available to the teacher and the learner\'s canvas changes', !teacherStroke.undoBefore && teacherStroke.undoAfter && learnerSaw > 150, { ...teacherStroke, learnerCanvasPixelsChanged: learnerSaw });

  // 4. A real stroke by the learner reaches the teacher (D3: learners on a computer draw).
  await snapshot(teacher);
  const learnerStroke = await stroke(learner, 'learner', 0.7);
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
  // 5c. A phone that joins while the whiteboard is already open (review B3).
  const phone2 = await open('phone2', 'participant', PHONE);
  pages.phone2 = phone2;
  const lateShare = await until(phone2, s => s.sharers.includes(LABEL.teacher), 20000);
  const lateLine = await until(phone2, s => s.readOnlyLine === WHITEBOARD_READ_ONLY_TEXT, 20000);
  pass('5c. a phone that joins while the whiteboard is open gets the share stream and the read-only line', lateShare && lateLine, { share: lateShare, line: (await boardState(phone2)).readOnlyLine });
  // 5d. The first phone reloads its page while the whiteboard is open.
  await phone.reload();
  await enter(phone);
  const reloadShare = await until(phone, s => s.sharers.includes(LABEL.teacher), 20000);
  const reloadLine = await until(phone, s => s.readOnlyLine === WHITEBOARD_READ_ONLY_TEXT, 20000);
  pass('5d. the phone shows the read-only line again after a reload of its page', reloadShare && reloadLine, { share: reloadShare, line: (await boardState(phone)).readOnlyLine });
  const desktopLines = { teacher: (await boardState(teacher)).readOnlyLine, learner: (await boardState(learner)).readOnlyLine };
  pass('the read-only line is not shown on a device that has the canvas', desktopLines.teacher === null && desktopLines.learner === null, desktopLines);
  pass('whiteboard capability traced at each join, from the SDK', ['yes', 'yes', 'no'].every((want, i) => { const lines = report.people[people[i]].trace.filter(l => l.startsWith('whiteboard available')); return lines.length >= 1 && lines.every(l => l === `whiteboard available available=${want} source=sdk`); }),
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
    phone: await until(phone, s => s.sharers.length === 0 && s.readOnlyLine === null, 30000), phone2: await until(phone2, s => s.sharers.length === 0 && s.readOnlyLine === null, 30000) };
  const after = Object.fromEntries(await Promise.all(everyone.map(async p => [p, await boardState(pages[p])])));
  pass('7. stop: everyone is back on the camera view and still in the room', Object.values(stopped).every(Boolean) && everyone.every(p => after[p].inMeeting && after[p].phase === 'in_room' && after[p].readOnlyLine === null),
    { stopped, after: Object.fromEntries(everyone.map(p => [p, { status: after[p].status, canvas: after[p].canvas, sharers: after[p].sharers, phase: after[p].phase }])) });
  pass('7. the connection never left Connected', everyone.every(p => report.people[p].connection.length > 0 && report.people[p].connection.every(c => c.state === 'Connected')),
    Object.fromEntries(everyone.map(p => [p, report.people[p].connection.map(c => c.state).join(' ')])));
}

// ---- Groups half ----
const ROOM = '[data-testid="zoom-room"]';
const where = page => page.evaluate(() => {
  const sub = window.zmClient?.getSubsessionClient?.();
  const current = sub?.getCurrentSubsession?.() || {};
  const shown = el => el.offsetParent !== null;
  return { status: sub?.getSubsessionStatus?.(), inGroup: current.userStatus === 'in room', invited: current.userStatus === 'invited', group: current.subsessionId || '',
    // The audio control is one place in the toolbar whose button changes with the audio
    // state (join audio, then the microphone): it is reported apart, not as a control.
    toolbar: [...document.querySelectorAll('[data-testid="zoom-room"] button[id]')].filter(shown).map(b => b.id).filter(id => /^(uikit-footer-|footer-more-button$|leave-button$)/.test(id) && id !== 'uikit-footer-audio-button').sort(),
    // Review N1 of #195: what the audio control offers, read from Zoom and from the
    // toolkit's button together. « unmuted »: computer audio, microphone open, the
    // toolkit shows its microphone button; « muted »: computer audio, microphone closed,
    // the toolkit shows the crossed microphone; « join »: no computer audio, the toolkit
    // offers to join it (its headset button).
    audio: (() => {
      const user = window.zmClient?.getCurrentUserInfo?.() || {};
      const icon = [...document.querySelectorAll('#uikit-footer-audio svg')].map(svg => svg.getAttribute('class') || '').find(c => /lucide-(mic|mic-off|headphones|headset)\b/.test(c))?.match(/lucide-([\w-]+)/)?.[1] || 'none';
      const unmutedButton = !!document.querySelector('#audio-unmuted-button') && shown(document.querySelector('#audio-unmuted-button'));
      if (user.audio === 'computer' && user.muted === false && unmutedButton && icon === 'mic') return 'unmuted';
      if (user.audio === 'computer' && user.muted === true && icon === 'mic-off') return 'muted';
      if (!user.audio) return 'join';
      return `other(${user.audio},${user.muted},${icon})`;
    })(),
    headerButtons: document.querySelectorAll('#uikit-mobile-header button').length,
    phase: window.__phase, path: location.pathname, inMeeting: !!window.zmClient?.getSessionInfo?.().isInMeeting,
    readOnlyLine: document.querySelector('[data-testid="room-whiteboard-readonly"]')?.textContent || null,
    boardStatus: window.zmClient?.getWhiteboardClient?.()?.getWhiteboardStatus?.() };
});
const untilWhere = async (page, test, ms = 30000) => { for (const end = Date.now() + ms; Date.now() < end;) { if (test(await where(page))) return true; await page.waitForTimeout(500); } return false; };
// G7 (review N1 of #195): after a move, the audio control is back as it was before the
// move (« unmuted » or « muted », never « join »), within AUDIO_BACK_MS of the arrival.
const AUDIO_BACK_MS = 30000;
async function audioBack(record, key, page, wanted) {
  const start = Date.now();
  const ok = (wanted === 'unmuted' || wanted === 'muted') && await untilWhere(page, w => w.audio === wanted, AUDIO_BACK_MS);
  const entry = { ok, wanted, now: (await where(page)).audio, seconds: Math.round((Date.now() - start) / 100) / 10 };
  (record.audioBack ||= {})[key] = entry;
  return entry.ok;
}
const audioPass = (tag, record) => pass(`${tag} G7. audio: after every move (into a group, back, the teacher's visit) each participant has a working microphone control again, in the state it had before the move, never « join audio », within ${AUDIO_BACK_MS / 1000} s, without a tap`,
  Object.keys(record.audioBack || {}).length > 0 && Object.values(record.audioBack).every(entry => entry.ok), { audioBack: record.audioBack });
const controls = page => page.evaluate(() => [...document.querySelectorAll('button, input[type="checkbox"], input[type="radio"]')].filter(b => b.offsetParent !== null).map(b => `${b.id ? '#' + b.id + ' ' : ''}${(b.getAttribute('aria-label') || b.title || b.textContent || '').trim().slice(0, 30)}`).filter(Boolean).slice(-30));
// A step in the toolkit's own interface; when Zoom's markup has moved, the error names the step and what is on screen now.
const step = async (page, what, action) => { try { return await action(); } catch (error) { throw new Error(`groups: ${what} — ${String(error?.message || error).split('\n')[0].slice(0, 700)}; controls now: ${JSON.stringify(await controls(page).catch(() => []))}`); } };
const POPPER = '#uikit-subsession-popper';
const groupsWindow = async teacher => { if (!(await teacher.locator(POPPER).count())) await teacher.locator('#uikit-footer-subsession-button').click({ timeout: 10000 }); await teacher.locator(POPPER).waitFor({ timeout: 10000 }); };
// The body text of a page, for what the toolkit shows (messages, dialogs).
const textOf = page => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
const dialogOf = (page, id) => page.evaluate(selector => { const el = document.querySelector(selector); const box = el?.closest('div.fixed') || el?.parentElement?.parentElement; return box ? box.innerText.replace(/\s+/g, ' ').trim().slice(0, 200) : null; }, id);
// The phone's leave control is the red button of the toolkit's phone header. The harness
// has no page chrome above the room, so its phase line covers that header: the button is
// clicked through the DOM, which is what a tap does on the real page.
const phoneLeaveControl = page => page.locator('#uikit-mobile-header button.bg-red-500').evaluate(button => button.click());
const phoneLeaveDialog = page => page.evaluate(() => {
  const root = [...document.querySelectorAll('body > .zoom-ui-toolkit-root')].find(el => /Leave|Quitter|principale|Main/i.test(el.innerText));
  return root ? { text: root.innerText.replace(/\s+/g, ' ').trim().slice(0, 200), buttons: [...root.querySelectorAll('button')].map(b => ({ text: b.textContent.trim(), title: b.title })) } : null;
});
const phoneDialogButton = (page, test) => page.evaluate(source => {
  const wanted = new Function('b', `return (${source})(b)`);
  const root = [...document.querySelectorAll('body > .zoom-ui-toolkit-root')].find(el => /Leave|Quitter|principale|Main/i.test(el.innerText));
  const button = [...(root?.querySelectorAll('button') || [])].find(b => wanted({ text: b.textContent.trim(), title: b.title }));
  if (button) button.click();
  return !!button;
}, test.toString());

// Create two groups for assignment by hand and set the options, in the toolkit's window.
async function prepareGroups(teacher, record, { allowReturn, minutes }) {
  await step(teacher, 'open the groups window', () => groupsWindow(teacher));
  await step(teacher, 'create two groups, assigned by hand', async () => {
    if (await teacher.locator('#uikit-subsession-recreate-button').count()) {
      await teacher.locator('#uikit-subsession-recreate-button').click();
      await teacher.waitForTimeout(600);
      const confirm = teacher.locator('#uikit-subsession-room-confirm-confirm-button');
      if (await confirm.count()) await confirm.click();
    }
    await teacher.locator('#uikit-subsession-choice-room-count-input').fill('2', { timeout: 10000 });
    await teacher.locator('#uikit-subsession-choice-manually-radio').check();
    await teacher.locator('#uikit-subsession-choice-create-button').click();
    await teacher.locator('#uikit-subsession-open-all-rooms-button').waitFor({ timeout: 15000 });
  });
  await step(teacher, 'set the options (return to the main room, timer)', async () => {
    await teacher.locator('#uikit-subsession-settings-button').click();
    const dialog = '#uikit-subsession-rooms-settings-dialog';
    await teacher.locator(dialog).waitFor({ timeout: 10000 });
    await teacher.locator(`${dialog}-back-to-main-session-checkbox`).setChecked(allowReturn);
    await teacher.locator(`${dialog}-auto-join-subsession-checkbox`).setChecked(false);
    await teacher.locator(`${dialog}-auto-close-subsession-rooms-checkbox`).setChecked(minutes > 0);
    if (minutes > 0) await teacher.locator(`${dialog}-auto-close-subsession-rooms-input`).fill(String(minutes));
    record.options = { allowReturn: await teacher.locator(`${dialog}-back-to-main-session-checkbox`).isChecked(), timerTicked: await teacher.locator(`${dialog}-auto-close-subsession-rooms-checkbox`).isChecked(),
      timerField: await teacher.locator(`${dialog}-auto-close-subsession-rooms-input`).inputValue() };
    // A click elsewhere in the window closes the settings: on its title, or on a tab when the title is under the whiteboard's banner.
    for (const elsewhere of [`${POPPER} h2`, '#uikit-subsession-rooms-view-expand-tab', '#uikit-subsession-rooms-view-collapse-tab']) {
      if (!(await teacher.locator(dialog).count())) break;
      await teacher.locator(elsewhere).click({ timeout: 2500 }).catch(() => {});
      await teacher.waitForTimeout(400);
    }
    await teacher.locator(dialog).waitFor({ state: 'detached', timeout: 5000 });
  });
}
const assignTo = (teacher, index, label) => step(teacher, `assign ${label} to group ${index + 1}`, async () => {
  await groupsWindow(teacher);
  await teacher.locator('#uikit-subsession-rooms-view button', { hasText: 'Répartir' }).nth(index).click();
  const modal = '#uikit-subsession-assign-participants-modal';
  await teacher.locator(`${modal} input[role="combobox"]`).click({ timeout: 10000 });
  await teacher.locator('[role="option"]', { hasText: LABEL[label] }).first().click({ timeout: 10000 });
  await teacher.locator(`${modal}-assign-button`).click();
  await teacher.locator(modal).waitFor({ state: 'detached', timeout: 5000 });
});

// A toolbar is complete when no control it had before is missing afterwards. A control
// that is there in addition is reported, not failed: the toolkit shows some (the arrow
// of the share options, for instance) a moment later than the others.
const missing = (before, after) => before.toolbar.filter(id => !after.toolbar.includes(id)).concat(after.headerButtons < before.headerButtons ? ['a button of the phone header'] : []);
const added = (before, after) => after.toolbar.filter(id => !before.toolbar.includes(id));
const leaveMenu = page => page.evaluate(() => [...document.querySelectorAll('#end-for-all-button, #leave-meeting-button, #leave-subsession-button')].filter(b => b.offsetParent !== null).map(b => ({ id: b.id, text: b.textContent.trim() })));

async function groupsPass(pages, { name, allowReturn, minutes, closedBy, assignFirst }) {
  const { teacher, learner, phone, phone2 } = pages;
  const movers = { learner, phone }, all = { teacher, learner, phone, phone2 };
  const tag = `groups (${name})`;
  const marks = Object.fromEntries(everyone.map(p => [p, { connection: report.people[p].connection.length, trace: report.people[p].trace.length }]));
  const record = report.groups[name] = { allowReturn, timerMinutes: minutes, closedBy };
  const before = Object.fromEntries(await Promise.all(Object.entries(all).map(async ([p, page]) => [p, await where(page)])));
  const everyoneStill = async when => {
    const now = Object.fromEntries(await Promise.all(Object.entries(all).map(async ([p, page]) => [p, await where(page)])));
    const bad = Object.entries(now).filter(([p, w]) => w.phase !== 'in_room' || w.path !== '/' || !w.inMeeting || report.people[p].elsewhere.length > 0).map(([p, w]) => ({ who: p, when, phase: w.phase, path: w.path, inMeeting: w.inMeeting }));
    return bad;
  };
  const strays = [];

  // G1. Create two groups, set the options, assign by hand, open.
  await prepareGroups(teacher, record, { allowReturn, minutes });
  const assign = (index, label) => assignTo(teacher, index, label);
  // How many participants the toolkit's window shows in each group.
  const counts = () => teacher.evaluate(() => [...(document.querySelector('#uikit-subsession-rooms-view')?.innerText.replace(/\s+/g, ' ').matchAll(/Groupe \d+ (\d+)/g) || [])].map(m => Number(m[1])));
  const plan = [[0, 'learner'], [1, 'phone']];
  // The toolkit keeps an assignment made before the opening in its own window only, and
  // forgets it whenever a participant's state changes (read in the bundle and observed):
  // the first pass assigns then opens, and assigns again if the window forgot; the
  // second pass opens first and assigns afterwards, which goes to Zoom at once.
  record.assignment = { order: assignFirst ? 'assigned, then opened' : 'opened, then assigned', forgottenBeforeOpening: 0, assignedAgainAfterOpening: [] };
  if (assignFirst) {
    for (let round = 0; round < 4; round++) {
      const shown = await counts();
      if (shown[0] === 1 && shown[1] === 1) break;
      if (round > 0) record.assignment.forgottenBeforeOpening++;
      for (const [index, label] of plan) if ((await counts())[index] !== 1) await assign(index, label);
    }
  }
  const openedAt = Date.now();
  await step(teacher, 'open all groups', () => teacher.locator('#uikit-subsession-open-all-rooms-button').click());
  const opened = await untilWhere(teacher, w => w.status === 2, 20000);
  const invited = {};
  for (const [index, label] of plan) {
    invited[label] = assignFirst && await untilWhere(pages[label], w => w.invited, 8000);
    if (!invited[label]) {
      if (assignFirst) record.assignment.assignedAgainAfterOpening.push(label);
      await assign(index, label);
      invited[label] = await untilWhere(pages[label], w => w.invited, 20000);
    }
  }
  const timerLine = report.people.teacher.trace.slice(marks.teacher.trace).filter(l => l.startsWith('groups open'));
  pass(`${tag} G1. the teacher creates two groups, sets the timer, ${assignFirst ? 'assigns by hand and opens them' : 'opens them and assigns by hand'}, all in the toolkit's groups window; both get the invitation`,
    opened && invited.learner && invited.phone && timerLine.length === 1 && timerLine[0] === `groups open timer=${minutes * 60}s` && record.options.allowReturn === allowReturn && record.options.timerTicked,
    { opened, invited, options: record.options, sentToZoom: timerLine, assignment: record.assignment });
  strays.push(...await everyoneStill('opened'));

  // G2. The invitation, the arrival, the message to all groups.
  const atInvitation = { learner: await where(learner), phone: await where(phone) };
  record.invitation = { learner: await dialogOf(learner, '#uikit-subsession-join-subsession-join'), phone: await dialogOf(phone, '#uikit-subsession-join-subsession-join') };
  for (const [p, page] of Object.entries(movers)) await step(page, `${p} accepts the invitation`, () => page.locator('#uikit-subsession-join-subsession-join').click({ timeout: 10000 }));
  const arrived = { learner: await untilWhere(learner, w => w.inGroup, 40000), phone: await untilWhere(phone, w => w.inGroup, 40000) };
  for (const p of ['learner', 'phone']) await audioBack(record, `${p} arrives in its group`, movers[p], before[p].audio);
  const inGroups = { learner: await where(learner), phone: await where(phone), phone2: await where(phone2) };
  pass(`${tag} G2a. each accepts the toolkit's invitation and arrives in its own group; the participant without a group stays in the main room`,
    arrived.learner && arrived.phone && inGroups.learner.group !== inGroups.phone.group && !inGroups.phone2.inGroup, { arrived, invitation: record.invitation, differentGroups: inGroups.learner.group !== inGroups.phone.group });
  strays.push(...await everyoneStill('in groups'));
  const message = `Encore une minute ${name}`;
  await step(teacher, 'send a message to all groups', async () => {
    await groupsWindow(teacher);
    await teacher.locator('#uikit-subsession-broadcast-button').click({ timeout: 10000 });
    await teacher.locator('#uikit-subsession-broadcast-dialog-message-input').fill(message);
    await teacher.locator('#uikit-subsession-broadcast-dialog-send-button').click();
  });
  const received = {};
  for (const end = Date.now() + 15000; Date.now() < end && !(received.learner && received.phone);) { for (const [p, page] of Object.entries(movers)) received[p] = received[p] || (await textOf(page)).includes(message); await teacher.waitForTimeout(400); }
  pass(`${tag} G2b. the teacher's message to all groups reaches both groups`, !!received.learner && !!received.phone, received);

  // G3. Ask for help; the teacher joins that group and comes back.
  const teacherBefore = await where(teacher);
  await step(learner, 'the learner asks for help', async () => {
    await learner.locator('#uikit-footer-subsession-help-button').click({ timeout: 10000 });
    await learner.locator('button#uikit-subsession-ask-for-help-confirm').click({ timeout: 10000 });
  });
  await step(teacher, 'the teacher gets the help request', () => teacher.locator('#uikit-subsession-ask-for-help-confirm-message').waitFor({ timeout: 20000 }));
  record.helpRequest = (await teacher.locator('#uikit-subsession-ask-for-help-confirm-message').innerText()).replace(/\s+/g, ' ');
  await step(teacher, 'the teacher joins the group that asked', () => teacher.locator('button#uikit-subsession-ask-for-help-confirm').click());
  const visiting = await untilWhere(teacher, w => w.inGroup, 40000);
  if (visiting) await audioBack(record, 'teacher visits the group', teacher, teacherBefore.audio);
  const together = (await where(teacher)).group === (await where(learner)).group;
  await step(teacher, 'the teacher comes back through the leave control', async () => {
    // The toolbar is drawn again just after the arrival, which closes a menu opened too early.
    const seen = [];
    for (let attempt = 0; attempt < 6; attempt++) {
      if (!(await teacher.locator('#leave-meeting-button').isVisible())) await teacher.locator('#leave-button').click({ timeout: 10000 });
      await teacher.waitForTimeout(1200);
      seen.push((await leaveMenu(teacher)).map(item => item.id).join('+') || 'no menu');
      if (await teacher.locator('#leave-subsession-button').isVisible()) break;
      await teacher.waitForTimeout(1500);
    }
    if (!(await teacher.locator('#leave-subsession-button').isVisible())) throw new Error(`the teacher's leave menu never offered a visible return to the main room (seen: ${seen.join(', ')})`);
    await teacher.locator('#leave-subsession-button').click({ timeout: 10000 });
  });
  const teacherBack = await untilWhere(teacher, w => !w.inGroup && w.status === 2 && w.toolbar.length >= teacherBefore.toolbar.length, 40000);
  await audioBack(record, 'teacher back from the visit', teacher, teacherBefore.audio);
  const teacherAfter = await where(teacher);
  pass(`${tag} G3. a learner asks for help; the teacher gets the dialog, joins that group and returns with a complete toolbar`,
    visiting && together && teacherBack && missing(teacherBefore, teacherAfter).length === 0,
    { request: record.helpRequest, visiting, together, teacherBack, toolbarMissing: missing(teacherBefore, teacherAfter), toolbarAdded: added(teacherBefore, teacherAfter), toolbarAfter: teacherAfter.toolbar });
  strays.push(...await everyoneStill('after the visit'));

  // G4. The toolkit's own leave control inside a group: one tap takes nobody out of the lesson.
  await learner.locator('#leave-button').click({ timeout: 10000 });
  await learner.waitForTimeout(800);
  const menu = await leaveMenu(learner);
  // The timer counts down: the toolkit redraws its leave button every second. The menu must still be there.
  await learner.waitForTimeout(3000);
  const menuStays = await learner.locator('#leave-meeting-button').isVisible();
  const learnerAfterTap = await where(learner);
  await phoneLeaveControl(phone);
  await phone.waitForTimeout(800);
  const phoneDialog = await phoneLeaveDialog(phone);
  const phoneAfterTap = await where(phone);
  record.leaveControl = { computer: menu, phone: phoneDialog };
  record.leaveControl.computerMenuStillVisibleAfter3s = menuStays;
  const oneTapSafe = menuStays && learnerAfterTap.inGroup && learnerAfterTap.phase === 'in_room' && learnerAfterTap.inMeeting && phoneAfterTap.inGroup && phoneAfterTap.phase === 'in_room' && phoneAfterTap.inMeeting;
  const offersReturn = { computer: menu.some(item => item.id === 'leave-subsession-button'), phone: !!phoneDialog?.buttons.some(b => /principale/.test(b.title)) };
  if (allowReturn) {
    await step(learner, 'the learner returns with « Revenir à la salle principale »', () => learner.locator('#leave-subsession-button').click({ timeout: 10000 }));
    const phoneTapped = await phoneDialogButton(phone, b => /principale/.test(b.title));
    const back = { learner: await untilWhere(learner, w => !w.inGroup, 40000), phone: phoneTapped && await untilWhere(phone, w => !w.inGroup, 40000) };
    for (const p of ['learner', 'phone']) await audioBack(record, `${p} returns with « Revenir à la salle principale »`, movers[p], before[p].audio);
    // Still assigned, so the toolkit invites again: the toolbar must have every control it had before the groups and at the first invitation.
    await untilWhere(learner, w => w.toolbar.length >= atInvitation.learner.toolbar.length, 20000);
    await untilWhere(phone, w => w.toolbar.length >= atInvitation.phone.toolbar.length, 20000);
    const after = { learner: await where(learner), phone: await where(phone) };
    pass(`${tag} G4. with the return allowed: one tap on the toolkit's leave control leaves nobody out of the lesson; it offers « Revenir à la salle principale », which brings each back to the main room with a complete toolbar`,
      oneTapSafe && offersReturn.computer && offersReturn.phone && menu.find(item => item.id === 'leave-subsession-button')?.text === 'Revenir à la salle principale' && menu.find(item => item.id === 'leave-meeting-button')?.text === 'Quitter le cours'
        && back.learner && back.phone && ['learner', 'phone'].every(p => missing(atInvitation[p], after[p]).length === 0 && missing(before[p], after[p]).length === 0),
      { oneTapSafe, leaveControl: record.leaveControl, back, toolbarMissing: Object.fromEntries(['learner', 'phone'].map(p => [p, [...new Set([...missing(atInvitation[p], after[p]), ...missing(before[p], after[p])])]])),
        toolbarAdded: Object.fromEntries(['learner', 'phone'].map(p => [p, added(before[p], after[p])])), toolbarAfter: { learner: after.learner.toolbar, phone: after.phone.toolbar } });
  } else {
    // Nothing to return with: close what the tap opened, and check that both are still there.
    await learner.keyboard.press('Escape');
    await learner.mouse.click(640, 300);
    await phoneDialogButton(phone, b => b.text === 'Fermer');
    await learner.waitForTimeout(1500);
    const after = { learner: await where(learner), phone: await where(phone) };
    pass(`${tag} G4. with the return NOT allowed: one tap on the toolkit's leave control leaves nobody out of the lesson, and the toolkit offers no return to the main room; both are still in their group`,
      oneTapSafe && !offersReturn.computer && !offersReturn.phone && after.learner.inGroup && after.phone.inGroup && after.learner.phase === 'in_room' && after.phone.phase === 'in_room',
      { oneTapSafe, leaveControl: record.leaveControl, stillInGroup: { learner: after.learner.inGroup, phone: after.phone.inGroup } });
  }
  // The page's own « Quitter le cours »: it asks, and staying keeps the room (asked from
  // inside a group when the return is not allowed, from the main room otherwise).
  const asker = allowReturn ? learner : phone, askerName = allowReturn ? 'learner' : 'phone';
  const askerBefore = await where(asker);
  await asker.getByTestId('room-leave').evaluate(link => link.click());
  const asked = await asker.getByTestId('room-leave-confirm').waitFor({ timeout: 5000 }).then(() => true, () => false);
  const askedText = asked ? (await asker.getByTestId('room-leave-confirm').innerText()).replace(/\s+/g, ' ') : null;
  const afterTap = await where(asker);
  if (asked) await asker.getByTestId('room-leave-stay').evaluate(button => button.click());
  await asker.waitForTimeout(800);
  const afterStay = await where(asker);
  pass(`${tag} G4. « Quitter le cours » at the top of the page asks first (${askerBefore.inGroup ? 'inside a group' : 'in the main room, groups open'}); « Rester dans le cours » keeps the room`,
    asked && /Quitter le cours \?/.test(askedText) && afterTap.phase === 'in_room' && afterTap.path === '/' && afterStay.phase === 'in_room' && afterStay.inMeeting && afterStay.inGroup === askerBefore.inGroup && (await asker.getByTestId('room-leave-confirm').count()) === 0,
    { who: askerName, inGroup: askerBefore.inGroup, askedText });
  strays.push(...await everyoneStill('after the leave controls'));

  // G5. The end of the groups: closed by the teacher, or by the timer.
  if (closedBy === 'teacher') {
    await step(teacher, 'the teacher closes all groups', async () => { await groupsWindow(teacher); await teacher.locator('#uikit-subsession-close-all-rooms-button').click({ timeout: 10000 }); });
  }
  const waitMs = closedBy === 'timer' ? Math.max(0, minutes * 60000 - (Date.now() - openedAt)) + 100000 : 100000;
  const closed = await untilWhere(teacher, w => w.status !== 2 && w.status !== 3, waitMs);
  const closedAfterSeconds = Math.round((Date.now() - openedAt) / 1000);
  const home = Object.fromEntries(await Promise.all(Object.entries(all).map(async ([p, page]) => [p, await untilWhere(page, w => !w.inGroup && !w.invited && w.inMeeting, 60000)])));
  for (const p of ['learner', 'phone']) await audioBack(record, `${p} back after the groups closed (${closedBy})`, movers[p], before[p].audio);
  await teacher.waitForTimeout(3000);
  const after = Object.fromEntries(await Promise.all(Object.entries(all).map(async ([p, page]) => [p, await where(page)])));
  const toolbars = Object.fromEntries(Object.keys(all).map(p => [p, missing(before[p], after[p]).length === 0]));
  record.toolbarAddedAfterTheGroups = Object.fromEntries(Object.keys(all).map(p => [p, added(before[p], after[p])]));
  const timed = closedBy !== 'timer' || (closedAfterSeconds >= minutes * 60 - 5 && closedAfterSeconds <= minutes * 60 + 45);
  pass(`${tag} G5. ${closedBy === 'timer' ? `nobody closes the groups: the timer does, ${minutes} minute(s) after the opening` : 'the teacher closes all groups'}; everybody is back in the main room with every control they had before the groups`,
    closed && timed && Object.values(home).every(Boolean) && Object.values(toolbars).every(Boolean),
    { closed, closedAfterSeconds, home, toolbars, ...(Object.values(toolbars).every(Boolean) ? {} : { before: Object.fromEntries(Object.keys(all).map(p => [p, before[p].toolbar])), after: Object.fromEntries(Object.keys(all).map(p => [p, after[p].toolbar])) }) });
  strays.push(...await everyoneStill('after the groups'));

  // G6. Over the whole pass.
  const since = Object.fromEntries(everyone.map(p => [p, { states: report.people[p].connection.slice(marks[p].connection), trace: report.people[p].trace.slice(marks[p].trace) }]));
  record.moves = Object.fromEntries(everyone.map(p => [p, since[p].states.filter(c => c.state === 'Reconnecting').map(c => c.reason)]));
  record.audio = Object.fromEntries(Object.keys(all).map(p => [p, { before: before[p].audio, after: after[p].audio }]));
  pass(`${tag} G6. nobody reached the portal: the phase stayed in_room, the address stayed the room, and the room never reported « left », « failed » or « closed », for every participant at every step`,
    strays.length === 0 && everyone.every(p => report.people[p].elsewhere.length === 0 && !since[p].trace.some(l => /^room (left|failed|closed)/.test(l))), { strays, elsewhere: Object.fromEntries(everyone.map(p => [p, report.people[p].elsewhere])) });
  pass(`${tag} G6. the connection states were only Reconnecting and Connected; each move is a Reconnecting with Zoom's reason; the participant without a group never moved`,
    everyone.every(p => since[p].states.every(c => ['Reconnecting', 'Connected'].includes(c.state))) && ['teacher', 'learner', 'phone'].every(p => record.moves[p].length >= 2) && record.moves.phone2.length === 0
      && everyone.every(p => since[p].states.length === 0 || since[p].states.at(-1).state === 'Connected'), { moves: record.moves });
  audioPass(tag, record);
}

// Whiteboard and groups together: the read-only line of a device without the canvas
// is shown exactly while a whiteboard is open in the room where that device is.
async function boardAcrossGroups(pages) {
  const { teacher, learner, phone, phone2 } = pages;
  const tag = 'whiteboard and groups';
  const record = report.groups[tag] = {};
  const lineOf = async page => (await where(page)).readOnlyLine === WHITEBOARD_READ_ONLY_TEXT;
  const lineBecomes = async (page, wanted, ms = 25000) => { for (const end = Date.now() + ms; Date.now() < end;) { if (await lineOf(page) === wanted) return true; await page.waitForTimeout(500); } return false; };
  const boardOpen = async () => (await where(teacher)).boardStatus === 2;
  await teacher.getByRole('button', { name: 'Ouvrir le tableau blanc' }).first().click({ timeout: 15000 });
  const started = await untilWhere(teacher, w => w.boardStatus === 2, 60000);
  const shownAtStart = { phone: await lineBecomes(phone, true), phone2: await lineBecomes(phone2, true) };
  pass(`${tag}: a whiteboard is open in the main room; both phones show the read-only line`, started && shownAtStart.phone && shownAtStart.phone2, { started, shownAtStart });
  await clearOverlays(teacher);

  // Groups opened while the whiteboard is open; the first phone goes into a group.
  await prepareGroups(teacher, record, { allowReturn: true, minutes: 10 });
  await step(teacher, 'open all groups', () => teacher.locator('#uikit-subsession-open-all-rooms-button').click());
  const opened = await untilWhere(teacher, w => w.status === 2, 20000);
  record.whiteboardStillOpenAfterOpeningGroups = await boardOpen();
  await assignTo(teacher, 0, 'phone');
  const invited = await untilWhere(phone, w => w.invited, 20000);
  await step(phone, 'the phone accepts the invitation', () => phone.locator('#uikit-subsession-join-subsession-join').click({ timeout: 10000 }));
  const arrived = await untilWhere(phone, w => w.inGroup, 40000);
  const goneInGroup = await lineBecomes(phone, false);
  await phone.waitForTimeout(4000); // past the presenter's answer interval: no late marker brings it back
  record.whiteboardStillOpenWithPhoneInGroup = await boardOpen();
  const inGroup = { phoneLine: await lineOf(phone), phone2Line: await lineOf(phone2), learnerLine: await lineOf(learner) };
  pass(`${tag}: in its group, where no whiteboard is open, the phone has no read-only line; the phone that stayed in the main room keeps it while the whiteboard is open there`,
    opened && invited && arrived && goneInGroup && !inGroup.phoneLine && inGroup.phone2Line === record.whiteboardStillOpenWithPhoneInGroup && !inGroup.learnerLine,
    { opened, invited, arrived, ...inGroup, whiteboardOpenInMainRoom: record.whiteboardStillOpenWithPhoneInGroup });

  // Back to the main room: the phone asks, the presenter answers, the line returns.
  await phoneLeaveControl(phone);
  await phone.waitForTimeout(800);
  const tapped = await phoneDialogButton(phone, b => /principale/.test(b.title));
  const back = tapped && await untilWhere(phone, w => !w.inGroup, 40000);
  record.whiteboardStillOpenAfterReturn = await boardOpen();
  const lineBack = await lineBecomes(phone, record.whiteboardStillOpenAfterReturn);
  pass(`${tag}: back in the main room, the phone asks and the presenter answers: the read-only line follows the whiteboard again`,
    back && lineBack && (await lineOf(phone2)) === record.whiteboardStillOpenAfterReturn, { back, whiteboardOpen: record.whiteboardStillOpenAfterReturn, phoneLine: await lineOf(phone), phone2Line: await lineOf(phone2) });

  // Close the groups, then the whiteboard: no line is left anywhere.
  await step(teacher, 'the teacher closes all groups', async () => { await groupsWindow(teacher); await teacher.locator('#uikit-subsession-close-all-rooms-button').click({ timeout: 10000 }); });
  const closed = await untilWhere(teacher, w => w.status !== 2 && w.status !== 3, 100000);
  await teacher.locator(`${POPPER}-close-button`).click({ timeout: 5000 }).catch(() => {});
  if (await boardOpen()) {
    await clearOverlays(teacher);
    const download = teacher.waitForEvent('download', { timeout: 60000 }).catch(() => null);
    await teacher.getByRole('button', { name: 'Fermer le tableau blanc' }).first().click({ timeout: 10000 });
    await teacher.getByRole('button', { name: 'Exporter et fermer' }).first().click({ timeout: 10000 });
    await download;
  }
  const boardClosed = await untilWhere(teacher, w => w.boardStatus === 0, 30000);
  const cleared = { phone: await lineBecomes(phone, false), phone2: await lineBecomes(phone2, false) };
  const end = Object.fromEntries(await Promise.all(Object.entries(pages).map(async ([p, page]) => [p, await where(page)])));
  pass(`${tag}: groups and whiteboard closed: no read-only line is left, and everybody is in the main room, in the lesson`,
    closed && boardClosed && cleared.phone && cleared.phone2 && Object.values(end).every(w => w.phase === 'in_room' && w.inMeeting && !w.inGroup && w.readOnlyLine === null && w.path === '/'), { closed, boardClosed, cleared });
}

// Every participant has computer audio before the groups. A phone-shaped participant
// joins without it (the room's page tells phones to touch the headset icon): it taps.
async function audioBaseline(pages) {
  const baseline = {};
  for (const [p, page] of Object.entries(pages)) {
    if (!(await untilWhere(page, w => w.audio === 'unmuted' || w.audio === 'muted', 10000))) {
      await page.locator('#uikit-footer-audio-button').evaluate(button => button.click()).catch(() => {});
      await untilWhere(page, w => w.audio === 'unmuted' || w.audio === 'muted', 20000);
    }
    baseline[p] = (await where(page)).audio;
  }
  pass('G0. before the groups, every participant has computer audio with a working microphone control', Object.values(baseline).every(a => a === 'unmuted'), { baseline });
}

async function groupsHalf(pages) {
  report.groups = {};
  await audioBaseline(pages);
  await groupsPass(pages, { name: 'return allowed', allowReturn: true, minutes: 10, closedBy: 'teacher', assignFirst: true });
  await groupsPass(pages, { name: 'return not allowed', allowReturn: false, minutes: 2, closedBy: 'timer', assignFirst: false });
  await boardAcrossGroups(pages);
}

// ---- Media part (classroom polish, part B) ----
const micState = page => page.evaluate(() => { const u = window.zmClient?.getCurrentUserInfo?.() || {}; return { audio: u.audio, muted: u.muted }; });
const untilMic = async (page, test, ms = 15000) => { for (const end = Date.now() + ms; Date.now() < end;) { if (test(await micState(page))) return true; await page.waitForTimeout(400); } return false; };
// The participant's own microphone button in the toolkit's footer (a tap: a DOM click on the phone, whose footer the harness does not cover).
const tapOwnMic = page => page.locator('#uikit-footer-audio-button, #audio-unmuted-button button').first().evaluate(button => button.click());
const PANEL = '#zoom-ui-toolkit-users-popper';
async function participantsPanel(teacher) {
  if (!(await teacher.locator(PANEL).count())) await teacher.locator('#uikit-footer-participants-button').click({ timeout: 10000 });
  await teacher.locator(PANEL).waitFor({ timeout: 10000 });
}
// A participant's row menu shows its « … » button only while the pointer is over the row.
async function rowMenu(teacher, label, item) {
  await participantsPanel(teacher);
  const row = teacher.locator(`${PANEL} div.py-2.px-3.relative.flex.items-center`, { hasText: label });
  await row.hover();
  await teacher.waitForTimeout(400);
  await row.locator('button').last().click({ timeout: 5000 });
  await teacher.waitForTimeout(500);
  const clicked = await teacher.evaluate(text => { const button = [...document.querySelectorAll('button')].find(b => b.offsetParent !== null && b.textContent.trim() === text); button?.click(); return !!button; }, item);
  if (!clicked) throw new Error(`the row menu of ${label} has no « ${item} »`);
}
const panelButton = (teacher, text) => teacher.evaluate(t => { const button = [...document.querySelectorAll('button')].find(b => b.offsetParent !== null && b.textContent.trim() === t); button?.click(); return !!button; }, text);
// What a participant's page plays: Zoom plays each received audio channel in its own
// <audio> element (a WebRTC track); the microphones and a shared sound arrive on separate
// ones. Zoom's audio statistics only describe the microphone channel, so the shared sound is
// measured here, on what the page would play: the loudest track and its main frequency.
const TONE_HZ = 440;
const heard = page => page.evaluate(async () => {
  const ctx = window.__ehListen ||= new AudioContext();
  await ctx.resume().catch(() => {});
  const tracks = [];
  for (const el of document.querySelectorAll('audio[id^="zoom-audio-tag"]')) {
    if (!el.srcObject?.getAudioTracks().length) continue;
    const an = ctx.createAnalyser(); an.fftSize = 8192;
    const source = ctx.createMediaStreamSource(el.srcObject); source.connect(an);
    const wave = new Float32Array(an.fftSize), bins = new Float32Array(an.frequencyBinCount);
    let peak = 0;
    for (let i = 0; i < 10; i++) { await new Promise(r => setTimeout(r, 150)); an.getFloatTimeDomainData(wave); for (const v of wave) peak = Math.max(peak, Math.abs(v)); }
    an.getFloatFrequencyData(bins); let top = 1; for (let i = 2; i < bins.length; i++) if (bins[i] > bins[top]) top = i;
    source.disconnect();
    tracks.push({ peak: Math.round(peak * 1000) / 1000, hz: Math.round(top * ctx.sampleRate / an.fftSize) });
  }
  return tracks;
});
const toneIn = tracks => tracks.some(t => t.peak > 0.3 && Math.abs(t.hz - TONE_HZ) <= 10);
// Dark pixels in a screenshot of an area, counted in a blank page (the room's policy is not involved).
let pixelPage = null;
async function darkPixels(page, box) {
  pixelPage ||= await (await browser.newContext()).newPage();
  const png = (await page.screenshot({ clip: box })).toString('base64');
  return pixelPage.evaluate(async src => {
    const img = new Image(); img.src = `data:image/png;base64,${src}`; await img.decode();
    const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height;
    const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let dark = 0; for (let i = 0; i < data.length; i += 4) if (data[i] < 60 && data[i + 1] < 60 && data[i + 2] < 60) dark++;
    return dark;
  }, png);
}
// The biggest visible picture: the teacher's own share preview, or the share view of a learner.
const shareArea = async page => {
  for (const end = Date.now() + 20000; Date.now() < end; await page.waitForTimeout(500)) {
    const box = await page.evaluate(() => {
      const seen = [...document.querySelectorAll('#ZOOM_VIDEO_SDK_SELF_SHARE_CANVAS, video-player, canvas, video')].map(e => e.getBoundingClientRect()).filter(r => r.width > 300 && r.height > 200);
      const r = seen.sort((x, y) => y.width * y.height - x.width * x.height)[0];
      return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
    });
    if (box) return { x: Math.round(box.x + box.width * 0.2), y: Math.round(box.y + box.height * 0.2), width: Math.round(box.width * 0.6), height: Math.round(box.height * 0.6) };
  }
  return null;
};
async function pencilStroke(page, area, yFraction) {
  await page.locator('#uikit-annotation-toolbar-button').click({ timeout: 10000 });
  await page.waitForTimeout(700);
  await page.locator('#uikit-annotation-pencil').click({ timeout: 5000 });
  await page.waitForTimeout(500);
  const y = area.y + area.height * yFraction, x0 = area.x + area.width * 0.1, x1 = area.x + area.width * 0.9;
  await page.mouse.move(x0, y); await page.mouse.down();
  for (let i = 1; i <= 24; i++) await page.mouse.move(x0 + (x1 - x0) * i / 24, y + Math.sin(i / 3) * 25);
  await page.mouse.up();
  await page.waitForTimeout(800);
  return page.evaluate(() => { const undo = document.querySelector('#uikit-annotation-undo'); return undo ? !undo.disabled : null; });
}
const presenterInk = page => page.evaluate(() => { const c = document.querySelector('canvas[id^="__ZOOM_SDK_ANNOTATION_CANVAS"]'); if (!c) return null; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; });
const growsWithin = async (read, from, by, ms = 15000) => { let now = from; for (const end = Date.now() + ms; Date.now() < end;) { now = await read(); if (now !== null && now - from >= by) break; await new Promise(r => setTimeout(r, 500)); } return now; };

async function mediaPart(pages) {
  const { teacher, learner, phone } = pages;
  const tag = 'media';
  const record = report.media = {};
  const marks = Object.fromEntries(Object.keys(pages).map(p => [p, report.people[p].csp.length]));
  // After the groups part the teacher's groups window is still open over the footer.
  if (await teacher.locator(POPPER).count()) await teacher.locator('#uikit-subsession-popper-close-button').click({ timeout: 5000 }).catch(() => {});
  await teacher.locator(POPPER).waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
  for (const page of [learner, phone]) if ((await micState(page)).muted !== false) { await tapOwnMic(page).catch(() => {}); await untilMic(page, m => m.audio === 'computer' && m.muted === false, 20000); }
  record.start = Object.fromEntries(await Promise.all(Object.entries(pages).map(async ([p, page]) => [p, await micState(page)])));

  // M1. The teacher mutes one learner from the participants panel.
  await step(teacher, 'mute the learner from the participants panel', () => rowMenu(teacher, LABEL.learner, 'Couper le micro'));
  const learnerMuted = await untilMic(learner, m => m.muted === true);
  const phoneUntouched = (await micState(phone)).muted === false;
  await tapOwnMic(learner).catch(() => {});
  record.learnerCanUnmuteAfterMute = await untilMic(learner, m => m.muted === false, 8000);
  pass(`${tag} M1. the teacher mutes one learner with « Couper le micro »: that learner is muted, the other is not; the learner ${record.learnerCanUnmuteAfterMute ? 'CAN' : 'CANNOT'} unmute themself (recorded)`,
    learnerMuted && phoneUntouched, { learnerMuted, otherLearnerStillOpen: phoneUntouched, learnerCanUnmuteThemself: record.learnerCanUnmuteAfterMute });

  // M2. « Couper tous les micros ».
  await untilMic(learner, m => m.muted === false, 5000);
  await step(teacher, 'mute all from the participants panel', async () => { await participantsPanel(teacher); if (!(await panelButton(teacher, 'Couper tous les micros'))) throw new Error('no « Couper tous les micros »'); });
  const allMuted = { learner: await untilMic(learner, m => m.muted === true), phone: await untilMic(phone, m => m.muted === true) };
  const teacherOpen = (await micState(teacher)).muted === false;
  record.canUnmuteAfterMuteAll = {};
  for (const [p, page] of [['learner', learner], ['phone', phone]]) {
    await tapOwnMic(page).catch(() => {});
    record.canUnmuteAfterMuteAll[p] = await untilMic(page, m => m.muted === false, 8000);
  }
  pass(`${tag} M2. « Couper tous les micros » mutes both learners and not the teacher; unmuting themselves afterwards: learner ${record.canUnmuteAfterMuteAll.learner ? 'CAN' : 'CANNOT'}, phone ${record.canUnmuteAfterMuteAll.phone ? 'CAN' : 'CANNOT'} (recorded)`,
    allMuted.learner && allMuted.phone && teacherOpen, { allMuted, teacherStillOpen: teacherOpen, canUnmuteThemselves: record.canUnmuteAfterMuteAll });
  await teacher.locator(`${PANEL}-close-button`).click({ timeout: 3000 }).catch(() => {});

  // M3. Share a tab with its sound: a tab titled TONE_TITLE plays a 440 Hz tone; Chrome picks it (see teacherBrowser).
  const tone = await teacher.context().newPage();
  await tone.setContent(`<!doctype html><title>${TONE_TITLE}</title><body style="margin:0;background:#fff"><p style="font:40px sans-serif;padding:40px">Listen</p></body>`);
  record.toneContext = await tone.evaluate(async hz => { const ctx = new AudioContext(); const osc = ctx.createOscillator(); osc.frequency.value = hz; osc.connect(ctx.destination); osc.start(); window.__tone = ctx; await new Promise(r => setTimeout(r, 300)); return ctx.state; }, TONE_HZ);
  await teacher.evaluate(() => {
    window.__displayMedia = [];
    const devices = navigator.mediaDevices, original = devices.getDisplayMedia.bind(devices);
    devices.getDisplayMedia = async constraints => { const entry = { asked: { video: !!constraints?.video, audio: !!constraints?.audio } }; window.__displayMedia.push(entry);
      try { const stream = await original(constraints); entry.tracks = stream.getTracks().map(t => ({ kind: t.kind, label: t.label })); return stream; } catch (error) { entry.error = error.name; throw error; } };
  });
  const before = { learner: await heard(learner), phone: await heard(phone) };
  const micBefore = await micState(teacher);
  // Chrome refuses a screen share from a page that does not have the focus (InvalidStateError).
  await teacher.bringToFront();
  await step(teacher, 'share the tab with its sound', () => teacher.locator('#uikit-footer-share-screen-button').click({ timeout: 10000 }));
  const sharing = await teacher.waitForFunction(() => window.zmClient.getCurrentUserInfo()?.sharerOn === true, null, { timeout: 20000 }).then(() => true, () => false);
  await teacher.waitForTimeout(3000);
  record.displayMedia = await teacher.evaluate(() => window.__displayMedia);
  const listed = Object.fromEntries(await Promise.all([['learner', learner], ['phone', phone]].map(async ([p, page]) => [p, await page.evaluate(name => { const u = (window.zmClient.getAllUser() || []).find(x => x.displayName === name); return { sharerOn: !!u?.sharerOn, bShareAudioOn: !!u?.bShareAudioOn }; }, LABEL.teacher)])));
  const during = { learner: await heard(learner), phone: await heard(phone) };
  const micDuring = await micState(teacher);
  // The teacher closes the microphone during the share: the shared sound goes on.
  if (micDuring.muted === false) await tapOwnMic(teacher).catch(() => {});
  const micClosed = await untilMic(teacher, m => m.muted === true, 8000);
  const whileMuted = { learner: await heard(learner), phone: await heard(phone) };
  await tapOwnMic(teacher).catch(() => {});
  const micReopened = await untilMic(teacher, m => m.muted === false, 8000);
  record.shareAudio = { toneHz: TONE_HZ, before, during, whileTeacherMuted: whileMuted, listed, teacherMic: { before: micBefore, during: micDuring, closedWithTheToolkitButton: micClosed, reopenedWithTheToolkitButton: micReopened } };
  const asked = record.displayMedia.at(-1);
  pass(`${tag} M3. share with computer sound: Chrome is asked for the tab's sound and gives the « Tab audio » track; Zoom lists the teacher as sharing sound; both learners' pages receive the ${TONE_HZ} Hz tone during the share and not before, also while the teacher's microphone is closed`,
    sharing && asked?.asked.audio === true && asked.tracks?.some(t => t.kind === 'audio' && t.label === 'Tab audio') && listed.learner.bShareAudioOn && listed.phone.bShareAudioOn
      && !toneIn(before.learner) && !toneIn(before.phone) && toneIn(during.learner) && toneIn(during.phone) && toneIn(whileMuted.learner) && toneIn(whileMuted.phone),
    { sharing, asked, ...record.shareAudio });
  pass(`${tag} M3b. the teacher's microphone keeps its state when the share with sound starts, and the toolkit's button closes and reopens it during the share`,
    micBefore.muted === micDuring.muted && micClosed && micReopened, record.shareAudio.teacherMic);

  // M4. Annotation on the shared tab, teacher then learner.
  const teacherArea = await shareArea(teacher), learnerArea = await shareArea(learner);
  record.annotation = { areas: { teacher: teacherArea, learner: learnerArea } };
  if (!teacherArea || !learnerArea) throw new Error(`media: no share area on screen (teacher ${!!teacherArea}, learner ${!!learnerArea})`);
  const learnerDark0 = await darkPixels(learner, learnerArea);
  const teacherUndo = await step(teacher, 'the teacher draws on the shared tab', () => pencilStroke(teacher, teacherArea, 0.35));
  const teacherInk = await presenterInk(teacher);
  const learnerDark1 = await growsWithin(() => darkPixels(learner, learnerArea), learnerDark0, 300);
  record.annotation.teacher = { undo: teacherUndo, presenterInk: teacherInk, learnerDarkPixels: [learnerDark0, learnerDark1] };
  pass(`${tag} M4a. annotation: the teacher's pencil stroke on the shared tab appears on the learner's screen`, teacherUndo === true && teacherInk > 0 && learnerDark1 - learnerDark0 >= 300, record.annotation.teacher);
  const teacherDark0 = await darkPixels(teacher, teacherArea), ink0 = await presenterInk(teacher);
  const learnerUndo = await step(learner, 'the learner draws on the shared tab', () => pencilStroke(learner, learnerArea, 0.7));
  const ink1 = await growsWithin(() => presenterInk(teacher), ink0, 300);
  const teacherDark1 = await darkPixels(teacher, teacherArea);
  record.annotation.learner = { undo: learnerUndo, presenterInk: [ink0, ink1], teacherDarkPixels: [teacherDark0, teacherDark1] };
  pass(`${tag} M4b. annotation: the learner's pencil stroke on the shared tab appears on the teacher's screen`, learnerUndo === true && ink1 - ink0 >= 300 && teacherDark1 - teacherDark0 >= 300, record.annotation.learner);
  record.annotation.phoneControls = await phone.evaluate(() => [...document.querySelectorAll('[id^="uikit-annotation-"]')].filter(b => b.offsetParent !== null).map(b => b.id));

  // Stop the share with the toolkit's own control; the microphone comes back as it was.
  await step(teacher, 'stop the share', () => teacher.locator('#stop-screen-share-btn').click({ timeout: 10000 }));
  const stopped = await teacher.waitForFunction(() => window.zmClient.getCurrentUserInfo()?.sharerOn !== true, null, { timeout: 20000 }).then(() => true, () => false);
  record.teacherMicAfterShare = await micState(teacher);
  await tone.close();
  // M5. Over the media part.
  const refusals = Object.fromEntries(Object.keys(pages).map(p => [p, report.people[p].csp.slice(marks[p])]));
  pass(`${tag} M5. no Content-Security-Policy refusal while muting, sharing with sound and annotating (S2); the share stopped`, stopped && Object.values(refusals).every(list => list.length === 0), { stopped, refusals });
  // Everybody's microphone open again for what follows.
  for (const page of [teacher, learner, phone]) if ((await micState(page)).muted === true) await tapOwnMic(page).catch(() => {});
}

try {
  const teacher = await open('teacher', 'host', { viewport: { width: 1280, height: 900 } });
  const learner = await open('learner', 'participant', { viewport: { width: 1280, height: 900 } });
  const phone = await open('phone', 'participant', PHONE);
  const pages = { teacher, learner, phone };
  await teacher.waitForTimeout(3000);
  if (PART === 'all' || PART === 'whiteboard') await whiteboardHalf(pages);
  else if (PART === 'groups') pages.phone2 = await open('phone2', 'participant', PHONE);
  if (PART === 'all' || PART === 'groups') await groupsHalf(pages);
  if (PART === 'all' || PART === 'media') await mediaPart({ teacher, learner, phone });

  // 1. Over the whole run.
  await teacher.waitForTimeout(2000);
  const joined = Object.keys(report.people);
  pass('2. the toolkit never prints the decoded join token to the console, and every participant traces once per join that the groups timer correction is on',
    joined.every(p => report.people[p].jwtLines === 0 && report.people[p].trace.filter(l => l.startsWith('groups timer')).length >= 1 && report.people[p].trace.filter(l => l.startsWith('groups timer')).every(l => l === 'groups timer correction=on')),
    Object.fromEntries(joined.map(p => [p, { jwtLines: report.people[p].jwtLines, timerTrace: report.people[p].trace.filter(l => l.startsWith('groups timer')) }])));
  pass('1. no Content-Security-Policy refusal other than the named one (script-src, eval, from the approved whiteboard path) for any participant over the whole run',
    joined.every(p => report.people[p].csp.length === 0),
    Object.fromEntries(joined.map(p => [p, { unexpected: report.people[p].csp.length, first: report.people[p].csp.slice(0, 4), namedRefusals: report.people[p].expectedRefusals.length }])));
  report.namedRefusal = { rule: 'directive script-src, blocked value eval, source under an approved whiteboard source', seen: joined.some(p => report.people[p].expectedRefusals.length > 0),
    examples: joined.flatMap(p => report.people[p].expectedRefusals.slice(0, 3).map(e => ({ who: p, ...e }))).slice(0, 6) };
  console.log(`NOTE named refusal (${EXPECTED_CSP_REFUSAL}) ${report.namedRefusal.seen ? 'seen' : 'not seen in this run'}: ${JSON.stringify(Object.fromEntries(joined.map(p => [p, report.people[p].expectedRefusals.length])))}`);
  await teacher.evaluate(() => window.zmClient?.leave?.(true)).catch(() => {});
  await learner.waitForTimeout(2000);
} catch (error) {
  if (process.env.OL_CLASSROOM_SHOTS) for (const [i, context] of contexts.entries()) await context.pages()[0]?.screenshot({ path: `${process.env.OL_CLASSROOM_SHOTS}/fail-${Object.keys(report.people)[i] || i}.png` }).catch(() => {});
  pass('the run completed', false, { error: String(error?.message || error).slice(0, 1200) });
} finally {
  for (const context of contexts) await context.close().catch(() => {});
  await browser.close();
  await teacherBrowser.close();
  await new Promise(resolve => server.close(resolve));
  report.part = PART;
  report.verdict = process.exitCode ? 'FAIL' : (PART === 'all' ? 'PASS' : `PARTIAL (${PART} part only, not a proof)`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`${report.verdict} zoom classroom (${PART === 'all' ? 'whiteboard, groups and media' : PART + ' part'}) at ${report.head}${report.workingTreeClean ? '' : ' + uncommitted changes'}; report written to ${reportPath}`);
}
