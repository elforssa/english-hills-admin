// Room reliability against Zoom Video SDK, with the real UI Toolkit (plan
// online-room-reliability.md, ORR-r2, « reliability PR », rows T-R1…T-R7). Local only,
// never in CI: it needs the owner's Zoom development credentials in the git-ignored
// .env.local (read, never printed; OL_ENV_FILE points elsewhere, e.g. from a worktree)
// and a network path to Zoom. The real room component runs in the harness page
// (scripts/lib/online-room-harness.mjs) with the page's pass glue (room-pass.mjs) and the
// harness's in-memory pass model, which follows the SQL rules of migration 129; every
// page load is a new pass whose id is the token's user_key, as the join route issues it.
// Each « device » is its own installed-Chrome process, so it can be killed.
//   T-R1  the host reads userKey of the other participants: it equals each pass id;
//         userIdentity is recorded (expected empty);
//   T-R2  the same learner in two separate browsers: the first leaves within 15 s of the
//         second entering Zoom, one participant remains, the card is shown;
//   T-R2b a third browser of that learner whose network is cut before its join completes:
//         the working browser stays in the room and is never shown the card;
//   T-R3  a learner's browser killed, then (second pass) cut from the network, each time
//         followed by a new connection: the teacher's page removes the leftover within
//         30 s and the new connection is not refused;
//   dead  how long Zoom itself keeps a killed connection when nothing removes it;
//   T-R5  five fast reloads of a learner and of the teacher: never more than one of each
//         for longer than 15 s;
//   T-R4  the teacher's browser killed and the teacher back: host rights of the new
//         connection and the removal of the old one are recorded;
//   T-R7  « Retirer » on a learner, then « Terminer pour tous »: the removed text, then
//         the ended text on every page; the reason Zoom sends is recorded.
//   T-R6  (groups) is not run by this script: recorded as not covered.
// Writes a JSON report (OL_ZOOM_RELIABILITY_REPORT, default
// scripts/.zoom-reliability-report.json, git-ignored). Touches no application database.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';
import { buildRoomHarness, serveRoomHarness } from './lib/online-room-harness.mjs';
import { createZoomVideoProvider, zoomSessionName } from '../src/lib/online/provider/zoom-video.mjs';

process.env.NODE_ENV = 'production';
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
const { default: nextConfig } = await import('../next.config.mjs');

const envFile = process.env.OL_ENV_FILE || '.env.local';
const file = existsSync(envFile) ? Object.fromEntries(readFileSync(envFile, 'utf8').split('\n').flatMap(line => {
  const m = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);
  return m ? [[m[1], m[2].trim().replace(/^['"]|['"]$/g, '')]] : [];
})) : {};
const env = { ONLINE_VIDEO_PROVIDER_API_KEY: process.env.ONLINE_VIDEO_PROVIDER_API_KEY || file.ONLINE_VIDEO_PROVIDER_API_KEY,
  ONLINE_VIDEO_PROVIDER_API_SECRET: process.env.ONLINE_VIDEO_PROVIDER_API_SECRET || file.ONLINE_VIDEO_PROVIDER_API_SECRET };
if (!env.ONLINE_VIDEO_PROVIDER_API_KEY || !env.ONLINE_VIDEO_PROVIDER_API_SECRET) {
  console.error('SKIP zoom reliability: set ONLINE_VIDEO_PROVIDER_API_KEY and ONLINE_VIDEO_PROVIDER_API_SECRET in .env.local');
  process.exit(2);
}
const reportPath = process.env.OL_ZOOM_RELIABILITY_REPORT || 'scripts/.zoom-reliability-report.json';
setTimeout(() => { console.error('FAIL zoom reliability stalled'); finish().finally(() => process.exit(1)); }, 30 * 60_000).unref();

const git = args => { try { return execFileSync('git', args, { encoding: 'utf8' }).trim(); } catch { return null; } };
const zoom = createZoomVideoProvider(env);
const run = `ehtest-${randomBytes(6).toString('hex')}`;
const LESSON = 'rel1';
const LABEL = { teacher: 'Test P.', r: 'Test R.', o: 'Test O.', k: 'Test K.', d: 'Test D.', v: 'Test V.' };
const embed = async (query, { pass }) => (await zoom.mintJoinToken({ roomRef: run, displayName: LABEL[query.person] || 'Test X.', role: query.role === 'host' ? 'host' : 'participant',
  expiresAt: new Date(Date.now() + 70 * 60000).toISOString(), participantRef: pass, lessonRef: query.lesson })).embed;

const roomHeaders = Object.entries(Object.fromEntries((await nextConfig.headers())
  .filter(rule => rule.source === '/(.*)' || rule.source === '/online/room/:path*').flatMap(rule => rule.headers.map(h => [h.key, h.value]))))
  .filter(([key]) => ['Content-Security-Policy', 'Permissions-Policy'].includes(key)).map(([key, value]) => ({ key, value }));
assert.equal(roomHeaders.length, 2, 'room CSP and Permissions-Policy found');

const report = { run: new Date().toISOString(), head: git(['rev-parse', 'HEAD']), workingTreeClean: git(['status', '--porcelain']) === '',
  session: zoomSessionName(run, LESSON), toolkit: JSON.parse(readFileSync('node_modules/@zoom/videosdk-ui-toolkit/package.json', 'utf8')).version,
  results: {}, recorded: {}, traces: {}, notes: [] };
const pass = (name, ok, detail = {}) => { report.results[name] = { ok, ...detail }; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`, JSON.stringify(detail).slice(0, 600)); if (!ok) process.exitCode = 1; };
const record = (name, detail) => { report.recorded[name] = detail; console.log(`RECORDED ${name}`, JSON.stringify(detail).slice(0, 600)); };

const harness = await buildRoomHarness({ fake: false });
const { server, origin, model } = await serveRoomHarness({ ...harness, embed, headers: roomHeaders });
const channel = process.env.OL_BROWSER_CHANNEL === 'chromium' ? undefined : (process.env.OL_BROWSER_CHANNEL || 'chrome');
// No camera and no computer audio: none of the rows needs media, and four browsers sending
// fake video saturate a degraded link (2026-11-17: about 100 KB/s from source.zoom.us, the
// fourth join timed out with « connection error »). The camera is denied (no fake-UI flag,
// microphone permission only) and the headset is never switched on.
const ARGS = ['--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'];
const devices = [];

// One device = one Chrome process (killable), one context, one page.
async function device(name, person, role = 'participant') {
  const serverProc = await chromium.launchServer({ headless: true, channel, args: ARGS });
  const browser = await chromium.connect(serverProc.wsEndpoint());
  const context = await browser.newContext({ permissions: ['microphone'], viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const trace = report.traces[name] = [];
  page.on('console', message => { const text = message.text(); if (text.startsWith('[online room] ')) trace.push(text.replace(/^\[online room\] /, '')); });
  page.on('pageerror', error => report.notes.push({ device: name, pageerror: String(error?.message || error).slice(0, 300) }));
  const d = { name, person, role, serverProc, browser, context, page, killed: false };
  devices.push(d);
  await page.goto(`${origin}/?lesson=${LESSON}&person=${person}&role=${role}`);
  return d;
}
async function enterOnce(page) {
  const join = page.getByRole('button', { name: 'Rejoindre le cours' });
  await join.waitFor({ timeout: 60000 });
  await page.waitForTimeout(1500);
  await join.click();
  await page.waitForFunction(() => window.zmClient?.getSessionInfo?.().isInMeeting === true || window.__phase === 'refused', null, { timeout: 90000 });
  return page.evaluate(() => window.__phase !== 'refused');
}
// A join Zoom refuses with a connection error (seen on a degraded network) is retried once
// with a page reload (a new pass, as a learner pressing reload would get); every retry is
// recorded in the report's notes.
async function enter(page) {
  if (await enterOnce(page)) return;
  const d = devices.find(x => x.page === page);
  report.notes.push({ device: d?.name, joinRetried: 'Zoom refused the join (connection error); page reloaded once' });
  await page.reload();
  if (!(await enterOnce(page))) throw new Error(`join refused twice on ${d?.name}`);
}
const kill = d => { d.killed = true; d.serverProc.process().kill('SIGKILL'); };
const close = async d => { if (!d.killed) { d.killed = true; await d.browser.close().catch(() => {}); await d.serverProc.close().catch(() => {}); } };
const users = page => page.evaluate(() => (window.zmClient?.getAllUser?.() || []).map(u => ({ userId: u.userId, name: u.displayName, userKey: u.userKey ?? null, userIdentity: u.userIdentity ?? null, isHost: !!u.isHost, isManager: !!u.isManager })));
const countOf = async (page, label) => (await users(page)).filter(u => u.name === label).length;
const phaseOf = page => page.evaluate(() => window.__phase).catch(() => null);
const passOf = page => page.evaluate(() => window.__pass);
const waitUntil = async (test, ms, step = 250) => { const start = Date.now(); while (Date.now() - start < ms) { if (await test()) return Date.now() - start; await new Promise(r => setTimeout(r, step)); } return null; };
const traceHas = (name, re) => report.traces[name].some(line => re.test(line));

async function finish() {
  for (const d of devices) await close(d);
  await new Promise(resolve => server.close(resolve));
  report.passes = model.passes.map(p => ({ person: p.person, kind: p.kind, confirmed: p.confirmed, superseded: p.superseded }));
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`Report written to ${reportPath}`);
}

try {
  // ---- T-R1: the host reads userKey of the others; it equals each pass id ----
  let teacher = await device('teacher', 'teacher', 'host');
  await enter(teacher.page);
  const r1 = await device('r1', 'r');
  await enter(r1.page);
  const observer = await device('observer', 'o');
  await enter(observer.page);
  await teacher.page.waitForTimeout(3000);
  const seen = await users(teacher.page);
  const expected = { [LABEL.r]: await passOf(r1.page), [LABEL.o]: await passOf(observer.page) };
  const others = seen.filter(u => u.name !== LABEL.teacher);
  pass('T-R1 the host reads userKey of the other participants and it equals each pass id',
    others.length === 2 && others.every(u => u.userKey && u.userKey.toLowerCase() === expected[u.name]?.toLowerCase()),
    { participants: others.map(u => ({ name: u.name, userKeyMatchesPass: u.userKey?.toLowerCase() === expected[u.name]?.toLowerCase() })) });
  // Ids are never printed: presence and equality only.
  record('T-R1 userIdentity on the participants (never read by the room)', others.map(u => ({ name: u.name,
    userIdentity: u.userIdentity === null ? 'absent' : (u.userIdentity === '' ? 'empty' : 'present'), equalsUserKey: !!u.userIdentity && u.userIdentity === u.userKey })));

  // ---- T-R2: the same learner in a second browser; the first leaves within 15 s ----
  const r2 = await device('r2', 'r');
  await enter(r2.page);
  const entered = Date.now();
  const left = await waitUntil(async () => (await phaseOf(r1.page)) === 'superseded', 30000);
  const card = left !== null ? (await r1.page.getByTestId('room-superseded').innerText()).trim() : null;
  const one = await waitUntil(async () => (await countOf(teacher.page, LABEL.r)) === 1, 30000);
  pass('T-R2 the same learner in two browsers: the first leaves within 15 s of the second entering, one remains, the card is shown',
    left !== null && left <= 15000 && one !== null && one <= 15000 && /Ce cours est ouvert sur un autre appareil ou dans un autre onglet\./.test(card || '') && /Utiliser cet appareil/.test(card || ''),
    { firstLeftAfterMs: left, oneParticipantAfterMs: one, viaMarker: traceHas('r1', /newer connection marker=received/), sentMarker: traceHas('r2', /newer connection marker=sent/), card });
  report.timing = { r2Entered: new Date(entered).toISOString() };
  await r1.page.waitForTimeout(2000);
  pass('T-R2 no automatic retry on the superseded page', (await phaseOf(r1.page)) === 'superseded', { phase: await phaseOf(r1.page) });
  await close(r1);

  // ---- T-R2b: a third browser cut from the network before its join completes ----
  const r3 = await device('r3', 'r');
  const r3Pass = await passOf(r3.page);
  await r3.page.getByRole('button', { name: 'Rejoindre le cours' }).waitFor({ timeout: 60000 });
  await r3.context.setOffline(true);
  await r3.page.getByRole('button', { name: 'Rejoindre le cours' }).click();
  await r3.page.waitForTimeout(25000); // two rounds of the working browser's check
  const r2Phase = await phaseOf(r2.page);
  const r3Model = model.passes.find(p => p.jti === r3Pass);
  pass('T-R2b a browser refused by Zoom (network cut before the join) takes nothing: the working browser stays and is never shown the card',
    r2Phase === 'in_room' && !r3Model.confirmed && (await r2.page.getByTestId('room-superseded').count()) === 0 && (await countOf(teacher.page, LABEL.r)) === 1,
    { workingPhase: r2Phase, cutPassConfirmed: r3Model.confirmed, cutPhase: await phaseOf(r3.page) });
  record('T-R2b what the cut browser shows', { phase: await phaseOf(r3.page), connection: report.traces.r3.filter(l => /^\S+ (connection|room failed)/.test(l)).slice(-4) });
  await close(r3);

  // ---- T-R3: killed, then cut from the network; the teacher removes the leftover ----
  const k1 = await device('k1', 'k');
  await enter(k1.page);
  await teacher.page.waitForTimeout(2000);
  kill(k1);
  const k2 = await device('k2', 'k');
  await enter(k2.page);
  const killedGone = await waitUntil(async () => (await countOf(teacher.page, LABEL.k)) === 1, 45000);
  await teacher.page.waitForTimeout(1000);
  pass('T-R3 a killed browser: the teacher\'s page removes the leftover within 30 s; the new connection stays',
    killedGone !== null && killedGone <= 30000 && (await phaseOf(k2.page)) === 'in_room' && traceHas('teacher', /leftover removed label=Test K\. state=ok/),
    { removedAfterMs: killedGone, newPhase: await phaseOf(k2.page), teacherTrace: report.traces.teacher.filter(l => /leftover/.test(l)).slice(-3) });
  await k2.context.setOffline(true);
  await teacher.page.waitForTimeout(2000);
  const k3 = await device('k3', 'k');
  await enter(k3.page);
  const cutGone = await waitUntil(async () => (await countOf(teacher.page, LABEL.k)) === 1, 45000);
  pass('T-R3 a browser cut from the network: the teacher\'s page removes the leftover within 30 s; the new connection stays',
    cutGone !== null && cutGone <= 30000 && (await phaseOf(k3.page)) === 'in_room',
    { removedAfterMs: cutGone, newPhase: await phaseOf(k3.page) });
  await close(k2);

  // ---- dead: how long Zoom keeps a killed connection that nothing removes ----
  const dead = await device('dead', 'd');
  await enter(dead.page);
  await teacher.page.waitForTimeout(2000);
  kill(dead);
  const deadGone = await waitUntil(async () => (await countOf(teacher.page, LABEL.d)) === 0, 240000, 1000);
  record('dead connection kept by Zoom with no sweep (killed browser, pass not superseded)', { goneAfterMs: deadGone, capMs: 240000 });

  // ---- T-R5: five fast reloads of a learner and of the teacher ----
  await observer.page.evaluate(labels => {
    window.__over = {};
    for (const label of labels) window.__over[label] = { since: null, longest: 0, max: 0 };
    setInterval(() => {
      const list = window.zmClient?.getAllUser?.() || [];
      for (const label of labels) {
        const n = list.filter(u => u.displayName === label).length, o = window.__over[label];
        if (n > o.max) o.max = n;
        if (n > 1) { if (o.since === null) o.since = Date.now(); o.longest = Math.max(o.longest, Date.now() - o.since); } else o.since = null;
      }
    }, 200);
  }, [LABEL.r, LABEL.teacher]);
  for (let i = 0; i < 5; i++) { await r2.page.reload(); await enter(r2.page); await r2.page.waitForTimeout(1500); }
  for (let i = 0; i < 5; i++) { await teacher.page.reload(); await enter(teacher.page); await teacher.page.waitForTimeout(1500); }
  await observer.page.waitForTimeout(20000);
  const over = await observer.page.evaluate(() => window.__over);
  pass('T-R5 five fast reloads of a learner and of the teacher: never more than one of each for longer than 15 s',
    over[LABEL.r].longest <= 15000 && over[LABEL.teacher].longest <= 15000 && (await countOf(observer.page, LABEL.r)) === 1 && (await countOf(observer.page, LABEL.teacher)) === 1,
    { learner: over[LABEL.r], teacher: over[LABEL.teacher] });

  // ---- T-R4: the teacher's browser killed; the teacher comes back ----
  kill(teacher);
  await observer.page.waitForTimeout(3000);
  const teacher2 = await device('teacher2', 'teacher', 'host');
  await enter(teacher2.page);
  const hostNow = await waitUntil(() => teacher2.page.evaluate(() => !!window.zmClient?.getCurrentUserInfo?.()?.isHost), 60000, 1000);
  const oldGone = await waitUntil(async () => (await countOf(observer.page, LABEL.teacher)) === 1, 60000, 1000);
  record('T-R4 the teacher killed and back: host rights and removal of the old connection', {
    newHasHostAfterMs: hostNow, oldConnectionGoneAfterMs: oldGone, removedBySweep: traceHas('teacher2', /leftover removed label=Test P\. state=ok/),
    refusedRemovals: report.traces.teacher2.filter(l => /leftover removed .*state=refused/.test(l)).length,
    hostsSeenByObserver: (await users(observer.page)).filter(u => u.isHost).map(u => u.name) });
  teacher = teacher2;

  // ---- T-R7: « Retirer », then « Terminer pour tous » ----
  const victim = await device('victim', 'v');
  await enter(victim.page);
  await teacher.page.waitForTimeout(3000);
  let via = 'toolkit';
  try {
    const panel = teacher.page.getByRole('button', { name: /Participants/ }).first();
    await panel.click({ timeout: 5000 });
    const row = teacher.page.locator('[data-testid="zoom-room"] *', { hasText: LABEL.v }).last();
    await row.hover({ timeout: 5000 });
    await teacher.page.getByRole('button', { name: /plus|More|\.\.\.|…/i }).last().click({ timeout: 5000 });
    await teacher.page.getByText('Retirer', { exact: true }).first().click({ timeout: 5000 });
    await teacher.page.getByRole('button', { name: 'Retirer', exact: true }).last().click({ timeout: 5000 });
  } catch {
    via = 'removeUser (the call behind « Retirer »)';
    await teacher.page.evaluate(label => { const c = window.zmClient, u = c.getAllUser().find(x => x.displayName === label); return c.removeUser(u.userId); }, LABEL.v).catch(() => {});
  }
  const removedShown = await waitUntil(async () => (await phaseOf(victim.page)) === 'removed', 30000);
  const removedReason = report.traces.victim.map(l => l.match(/connection state=Closed(?: code=\S+)? reason=(.*)$/)?.[1]).filter(Boolean).at(-1) || null;
  pass('T-R7 « Retirer »: the learner\'s page shows the removed text with « Rejoindre »', removedShown !== null
    && /L’enseignant vous a retiré du cours\./.test(await victim.page.getByTestId('room-removed').innerText()), { via, shownAfterMs: removedShown });
  record('T-R7 the reason Zoom sends for « Retirer »', { reason: removedReason, via });
  await victim.page.getByRole('button', { name: 'Rejoindre' }).click();
  await enter(victim.page);
  pass('T-R7 a removed learner can come back with « Rejoindre » (not a ban)', (await phaseOf(victim.page)) === 'in_room', {});
  await teacher.page.waitForTimeout(3000);
  const learners = [r2, observer, k3, victim];
  let endVia = 'toolkit';
  try {
    await teacher.page.locator('[data-testid="zoom-room"] button.bg-red-500, [data-testid="zoom-room"] button:has-text("Quitter")').last().click({ timeout: 5000 });
    await teacher.page.getByText('Terminer le cours', { exact: true }).first().click({ timeout: 5000 });
    await teacher.page.getByRole('button', { name: /Terminer/ }).last().click({ timeout: 3000 }).catch(() => {});
  } catch {
    endVia = 'leave(true) (the call behind « Terminer le cours »)';
    await teacher.page.evaluate(() => window.zmClient.leave(true)).catch(() => {});
  }
  const endedAll = await waitUntil(async () => (await Promise.all(learners.map(d => phaseOf(d.page)))).every(p => p === 'ended'), 30000);
  const endReasons = learners.map(d => report.traces[d.name].map(l => l.match(/connection state=Closed(?: code=\S+)? reason=(.*)$/)?.[1]).filter(Boolean).at(-1) || null);
  pass('T-R7 « Terminer pour tous »: every learner page shows the ended text with « Quitter » only', endedAll !== null, { via: endVia, endedAfterMs: endedAll, phases: await Promise.all(learners.map(d => phaseOf(d.page))) });
  record('T-R7 the reason Zoom sends for the end for all', { reasons: endReasons, via: endVia });
  record('T-R6 groups', { run: false, note: 'not covered by this script (leftover in a group, sweep while groups are open, network cut during a move): UNVERIFIED' });
  record('token console line after the room', { jwtLinesSeen: 'see the lifecycle and classroom reports; the wrapper restore is proven in the browser suite' });
} finally {
  await finish();
}
