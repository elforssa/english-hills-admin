// Two participants with cameras on, against Zoom Video SDK with the real UI Toolkit and
// the room path's real Content-Security-Policy. Local only, never in CI: it needs the
// owner's Zoom developer credentials in the git-ignored .env.local (OL_ENV_FILE points
// elsewhere, e.g. from a worktree) and a network path to Zoom. Touches no database.
//
// Why it exists (R4 test lesson of 2026-11-15): with a camera on, the Video SDK loads its
// WebRTC client (webpack chunk 557, wmsc.min.js) by fetching it and running it from a
// blob: URL. When that script cannot run, the SDK retries six times a second apart,
// raises WMSC_JS_LOAD_FAIL_FAILOVER and reconnects, and the same happens again after
// every reconnect: the room flickers every few seconds until it ends on « Connexion
// instable ». test-online-zoom-lifecycle.mjs never turned a camera on, so it never
// loaded that chunk.
//
// The run: a teacher (desktop) and a learner (phone) join the same throw-away session,
// both start their camera, and the room is watched for OL_TWO_PARTY_WATCH_MS (default
// 45 s, seven of the observed cycles). It passes when, for both:
//   - the connection never leaves Connected (no Reconnecting, Fail or Closed);
//   - no ChunkLoadError and no WMSC_JS_LOAD_FAIL_FAILOVER is logged;
//   - the browser reports no Content-Security-Policy violation;
//   - each sees the other, and receives the other's video, at the end.
// Writes a JSON report (OL_ZOOM_TWO_PARTY_REPORT, default
// scripts/.zoom-two-party-report.json, git-ignored).
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { chromium } from '@playwright/test';
import { buildRoomHarness, serveRoomHarness } from './lib/online-room-harness.mjs';
import { createZoomVideoProvider } from '../src/lib/online/provider/zoom-video.mjs';
import nextConfig from '../next.config.mjs';

const envFile = process.env.OL_ENV_FILE || '.env.local';
const file = existsSync(envFile) ? Object.fromEntries(readFileSync(envFile, 'utf8').split('\n').flatMap(line => {
  const m = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);
  return m ? [[m[1], m[2].trim().replace(/^['"]|['"]$/g, '')]] : [];
})) : {};
const env = { ONLINE_VIDEO_PROVIDER_API_KEY: process.env.ONLINE_VIDEO_PROVIDER_API_KEY || file.ONLINE_VIDEO_PROVIDER_API_KEY,
  ONLINE_VIDEO_PROVIDER_API_SECRET: process.env.ONLINE_VIDEO_PROVIDER_API_SECRET || file.ONLINE_VIDEO_PROVIDER_API_SECRET };
if (!env.ONLINE_VIDEO_PROVIDER_API_KEY || !env.ONLINE_VIDEO_PROVIDER_API_SECRET) {
  console.error('SKIP zoom two-party: set ONLINE_VIDEO_PROVIDER_API_KEY and ONLINE_VIDEO_PROVIDER_API_SECRET in .env.local');
  process.exit(2);
}
const reportPath = process.env.OL_ZOOM_TWO_PARTY_REPORT || 'scripts/.zoom-two-party-report.json';
const watchMs = Number(process.env.OL_TWO_PARTY_WATCH_MS) || 45000;
setTimeout(() => { console.error('FAIL zoom two-party stalled'); process.exit(1); }, 8 * 60_000).unref();

const zoom = createZoomVideoProvider(env);
const run = `ehtest-${randomBytes(6).toString('hex')}`;
const LABEL = { host: 'Test P.', participant: 'Test D.' };
const ref = () => `00000000-0000-4000-8000-${randomBytes(6).toString('hex')}`;
const embed = async query => (await zoom.mintJoinToken({ roomRef: run, displayName: LABEL[query.role] || LABEL.participant, role: query.role === 'host' ? 'host' : 'participant',
  expiresAt: new Date(Date.now() + 70 * 60000).toISOString(), participantRef: ref(), lessonRef: query.lesson })).embed;

const report = { run: new Date().toISOString(), watchMs, results: {}, people: {} };
const pass = (name, ok, detail = {}) => { report.results[name] = { ok, ...detail }; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`, JSON.stringify(detail)); if (!ok) process.exitCode = 1; };

const harness = await buildRoomHarness({ fake: false });
// The room path's headers, exactly as Next.js sends them (later rules win per key).
const roomHeaders = Object.entries(Object.fromEntries((await nextConfig.headers())
  .filter(rule => rule.source === '/(.*)' || rule.source === '/online/room/:path*').flatMap(rule => rule.headers.map(h => [h.key, h.value]))))
  .filter(([key]) => ['Content-Security-Policy', 'Permissions-Policy'].includes(key)).map(([key, value]) => ({ key, value }));
assert.equal(roomHeaders.length, 2, 'room CSP and Permissions-Policy found');
// Diagnosis only: OL_DIAG_SCRIPT_SRC_EXTRA="blob:" adds a source to the room's script-src for
// this run, to compare with the policy as shipped. The run is then marked as not a proof.
const diagScriptSrc = (process.env.OL_DIAG_SCRIPT_SRC_EXTRA || '').trim();
if (diagScriptSrc) {
  const header = roomHeaders.find(h => h.key === 'Content-Security-Policy');
  header.value = header.value.split('; ').map(d => d.startsWith('script-src ') ? `${d} ${diagScriptSrc}` : d).join('; ');
  report.diagnosis = { scriptSrcExtra: diagScriptSrc };
  console.log(`DIAGNOSIS RUN: script-src extended with ${diagScriptSrc}; this is not the shipped policy`);
}
const { server, origin } = await serveRoomHarness({ ...harness, embed, headers: roomHeaders });
// Playwright's Chromium has no H.264 and Zoom keeps it off WebRTC video, so it never loads
// the WebRTC client; installed Chrome (OL_BROWSER_CHANNEL=chrome, the default) does.
const channel = process.env.OL_BROWSER_CHANNEL === 'chromium' ? undefined : (process.env.OL_BROWSER_CHANNEL || 'chrome');
const browser = await chromium.launch({ headless: true, channel, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required', '--auto-select-desktop-capture-source=Entire screen'] });
const contexts = [];

const LOOP = /ChunkLoadError|Loading chunk \d+ failed|WMSC_JS_LOAD_FAIL|WMSCf_IMPORT_FAIL/;
async function open(label, role, options) {
  const seen = report.people[label] = { connection: [], loop: [], csp: [], chunkLoads: [], failedRequests: [], added: 0 };
  const context = await browser.newContext({ permissions: ['camera', 'microphone'], ...options });
  contexts.push(context);
  await context.exposeFunction('__cspBlocked', entry => seen.csp.push(entry));
  await context.addInitScript(() => document.addEventListener('securitypolicyviolation', e =>
    window.__cspBlocked({ directive: e.effectiveDirective, blocked: String(e.blockedURI).split('?')[0].slice(0, 120) })));
  const page = await context.newPage();
  page.on('console', message => {
    const text = message.text();
    const state = text.match(/^\[online room\] \S+ connection state=(\w+)(?: code=(\S+))?(?: reason=(.*))?/);
    if (state) seen.connection.push({ state: state[1], code: state[2], reason: state[3] });
    if (/^\[online room\] \S+ participant added/.test(text)) seen.added++;
    if (LOOP.test(text)) seen.loop.push(text.slice(0, 160));
    if (text.startsWith('[CustomChunkLoader]')) seen.chunkLoads.push(text.replace(/\?.*$/, '').slice(0, 160));
  });
  page.on('pageerror', error => { const text = String(error?.message || error); if (LOOP.test(text)) seen.loop.push(text.slice(0, 160)); });
  page.on('requestfailed', request => { if (/\.min\.js|\.wasm/.test(request.url())) seen.failedRequests.push(`${request.url().split('?')[0]} ${request.failure()?.errorText}`); });
  await page.goto(`${origin}/?lesson=l1&person=${label}&role=${role}`);
  const join = page.getByRole('button', { name: 'Rejoindre le cours' });
  await join.waitFor({ timeout: 60000 });
  // Headset on in the pre-join screen, then join; the camera is started in the session.
  await page.locator('[data-testid="zoom-room"] button.bg-red-500, [data-testid="zoom-room"] button:has(svg)').first().click();
  await page.waitForTimeout(1500);
  await join.click();
  await page.waitForFunction(() => window.zmClient?.getSessionInfo?.().isInMeeting === true, null, { timeout: 90000 });
  return page;
}
const startCamera = page => page.evaluate(async () => {
  try { await window.zmClient.getMediaStream().startVideo(); return 'started'; } catch (error) { return `failed: ${error?.reason || error?.message || JSON.stringify(error)}`; }
});
const view = page => page.evaluate(() => {
  const users = window.zmClient?.getAllUser?.() || [];
  return { inMeeting: !!window.zmClient?.getSessionInfo?.().isInMeeting, users: users.map(u => ({ label: u.displayName, video: !!u.bVideoOn })),
    alone: /Aucun autre participant/.test(document.querySelector('[data-testid="zoom-room"]')?.innerText || ''), phase: window.__phase };
});

try {
  const teacher = await open('teacher', 'host', { viewport: { width: 1280, height: 800 } });
  const learner = await open('learner', 'participant', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const cameras = { teacher: await startCamera(teacher), learner: await startCamera(learner) };
  // Sample both galleries while the room is watched: the loop empties them on every cycle.
  const samples = { teacher: { n: 0, alone: 0, out: 0 }, learner: { n: 0, alone: 0, out: 0 } };
  for (const end = Date.now() + watchMs; Date.now() < end;) {
    for (const [label, page] of [['teacher', teacher], ['learner', learner]]) {
      const now = await view(page).catch(() => ({ inMeeting: false, users: [] }));
      samples[label].n++;
      if (now.alone || now.users.length < 2) samples[label].alone++;
      if (!now.inMeeting) samples[label].out++;
    }
    await teacher.waitForTimeout(1000);
  }
  const final = { teacher: await view(teacher), learner: await view(learner) };
  const people = ['teacher', 'learner'];
  pass('cameras started for both', people.every(p => cameras[p] === 'started'), cameras);
  pass('connection stayed Connected for the whole watch (no Reconnecting, Fail or Closed)',
    people.every(p => report.people[p].connection.length > 0 && report.people[p].connection.every(c => c.state === 'Connected')),
    Object.fromEntries(people.map(p => [p, report.people[p].connection.map(c => c.state + (c.reason ? `:${c.reason}` : '')).join(' ')])));
  pass('no ChunkLoadError and no WMSC_JS_LOAD_FAIL_FAILOVER', people.every(p => report.people[p].loop.length === 0),
    Object.fromEntries(people.map(p => [p, { count: report.people[p].loop.length, first: report.people[p].loop.slice(0, 3) }])));
  pass('no Content-Security-Policy violation', people.every(p => report.people[p].csp.length === 0),
    Object.fromEntries(people.map(p => [p, { count: report.people[p].csp.length, first: report.people[p].csp.slice(0, 3) }])));
  pass('each sees the other, with video, and the gallery never emptied', people.every(p => final[p].inMeeting && final[p].users.length === 2 && final[p].users.every(u => u.video)
    && samples[p].alone === 0 && samples[p].out === 0), { final, samples, participantAddedEvents: Object.fromEntries(people.map(p => [p, report.people[p].added])) });
  // Recorded, not asserted: a screen share from the teacher (headless Chrome picks the fake screen).
  const share = await teacher.evaluate(async () => {
    try { const el = document.createElement('video'); document.body.appendChild(el); await window.zmClient.getMediaStream().startShareScreen(el); return 'started'; }
    catch (error) { return `failed: ${error?.reason || error?.message || JSON.stringify(error)}`; }
  }).catch(error => `failed: ${error.message}`);
  await teacher.waitForTimeout(share === 'started' ? 10000 : 0);
  report.results['screen share (recorded)'] = { share, learnerSeesShare: await learner.evaluate(() => (window.zmClient?.getAllUser?.() || []).some(u => u.sharerOn)).catch(() => false),
    cspAfter: Object.fromEntries(people.map(p => [p, report.people[p].csp])), connectionAfter: Object.fromEntries(people.map(p => [p, report.people[p].connection.map(c => c.state).join(' ')])) };
  console.log('RECORDED screen share', JSON.stringify(report.results['screen share (recorded)']));
  await teacher.evaluate(() => window.zmClient?.leave?.(true)).catch(() => {});
  await learner.waitForTimeout(2000);
} finally {
  for (const context of contexts) await context.close().catch(() => {});
  await browser.close();
  await new Promise(resolve => server.close(resolve));
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`Report written to ${reportPath}`);
}
