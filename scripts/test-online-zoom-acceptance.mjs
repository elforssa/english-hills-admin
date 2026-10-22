// Provider acceptance against Zoom Video SDK (plan OL-r6 adapter addendum): T-P1–T-P4 and
// T-P7, automated. Local only, never in CI: it needs the owner's Zoom developer
// credentials in the git-ignored .env.local (ONLINE_VIDEO_PROVIDER_API_KEY and
// ONLINE_VIDEO_PROVIDER_API_SECRET; values are read, never printed) and a network path to
// Zoom. It drives the real @zoom/videosdk web client in headless Chromium with fake media,
// against throw-away session names, using tokens minted by the zoom-video adapter:
//   T-P1  no token, a token for another session name, and a token signed with the wrong
//         secret are all refused;
//   T-P2  a token minted for lesson A's session cannot join lesson B's session (A2);
//   T-P3  a structurally valid token whose exp has passed is refused; what happens to a
//         connected participant whose token expires is recorded, not asserted;
//   T-P4  a participant's changeName on itself fails (code 5014 when the account setting is
//         off) while the host's rename of another participant succeeds;
//   T-P7  after the host removes a participant, a rejoin with the same token is recorded as
//         accepted or refused, not asserted.
// It also records the Zoom hosts the session contacted, whether anything reached the
// telemetry host, and where the session-end detailed log went (A7), and writes a JSON
// report to the path in OL_ZOOM_REPORT (default: scripts/.zoom-acceptance-report.json,
// git-ignored). Nothing here touches the application database.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { chromium } from '@playwright/test';
import { createZoomVideoProvider, signZoomJwt, zoomSessionName } from '../src/lib/online/provider/zoom-video.mjs';

const require = createRequire(import.meta.url);
const file = existsSync('.env.local') ? Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').flatMap(line => {
  const m = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);
  return m ? [[m[1], m[2].trim().replace(/^['"]|['"]$/g, '')]] : [];
})) : {};
const env = { ONLINE_VIDEO_PROVIDER_API_KEY: process.env.ONLINE_VIDEO_PROVIDER_API_KEY || file.ONLINE_VIDEO_PROVIDER_API_KEY,
  ONLINE_VIDEO_PROVIDER_API_SECRET: process.env.ONLINE_VIDEO_PROVIDER_API_SECRET || file.ONLINE_VIDEO_PROVIDER_API_SECRET };
if (!env.ONLINE_VIDEO_PROVIDER_API_KEY || !env.ONLINE_VIDEO_PROVIDER_API_SECRET) {
  console.error('SKIP zoom acceptance: set ONLINE_VIDEO_PROVIDER_API_KEY and ONLINE_VIDEO_PROVIDER_API_SECRET in .env.local');
  process.exit(2);
}
const reportPath = process.env.OL_ZOOM_REPORT || 'scripts/.zoom-acceptance-report.json';
const zoom = createZoomVideoProvider(env);
const run = `ehtest-${randomBytes(6).toString('hex')}`;
const lessonA = randomBytes(8).toString('hex'), lessonB = randomBytes(8).toString('hex');
const sessionA = zoomSessionName(run, lessonA), sessionB = zoomSessionName(run, lessonB);
const inMinutes = n => new Date(Date.now() + n * 60000).toISOString();
const mint = (lessonRef, role, ref, minutes = 70) => zoom.mintJoinToken({ roomRef: run, displayName: `${role === 'host' ? 'Host' : 'Learner'} ${ref.slice(0, 4)}`,
  role, expiresAt: inMinutes(minutes), participantRef: ref, lessonRef });
const uuid = () => `00000000-0000-4000-8000-${randomBytes(6).toString('hex')}`;
setTimeout(() => { console.error('FAIL zoom acceptance stalled'); process.exit(1); }, 10 * 60_000).unref();

// A tiny same-origin page that loads the SDK from node_modules and exposes join/leave/rename/remove.
const sdkPath = require.resolve('@zoom/videosdk/dist/index.umd.js');
const sdkLib = require.resolve('@zoom/videosdk/package.json').replace(/package\.json$/, 'dist/lib');
const html = `<!doctype html><meta charset="utf-8"><title>zoom acceptance</title><script src="/sdk.js"></script><script>
const client = window.WebVideoSDK.default.createClient();
let ready = null;
window.zoomReady = () => ready || (ready = client.init('en-US', '/lib', { patchJsMedia: true, leaveOnPageUnload: true }));
window.zoomJoin = async (topic, token, name) => { await window.zoomReady(); try { await client.join(topic, token, name); return { ok: true, userId: client.getCurrentUserInfo()?.userId }; }
  catch (e) { return { ok: false, type: e?.type, reason: e?.reason, code: e?.errorCode ?? e?.code ?? null, message: String(e?.message || e) }; } };
window.zoomLeave = async (end) => { try { await client.leave(!!end); return { ok: true }; } catch (e) { return { ok: false, reason: e?.reason, code: e?.errorCode }; } };
window.zoomRename = async (name, userId) => { try { await client.changeName(name, userId); return { ok: true }; } catch (e) { return { ok: false, type: e?.type, reason: e?.reason, code: e?.errorCode ?? null }; } };
window.zoomRemove = async (userId) => { try { await client.removeUser(userId); return { ok: true }; } catch (e) { return { ok: false, type: e?.type, reason: e?.reason, code: e?.errorCode ?? null }; } };
window.zoomUsers = () => client.getAllUser().map(u => ({ userId: u.userId, displayName: u.displayName, isHost: u.isHost }));
window.zoomSelf = () => client.getCurrentUserInfo();
window.zoomState = () => client.getSessionInfo();
const events = []; window.zoomEvents = () => events;
['connection-change', 'user-removed', 'user-updated', 'user-added'].forEach(ev => client.on(ev, p => events.push({ ev, p: JSON.parse(JSON.stringify(p ?? null)), at: Date.now() })));
</script><body>acceptance</body>`;
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/') { res.setHeader('content-type', 'text/html'); return res.end(html); }
  if (url.pathname === '/sdk.js') { res.setHeader('content-type', 'text/javascript'); return res.end(readFileSync(sdkPath)); }
  if (url.pathname.startsWith('/lib/')) {
    const target = `${sdkLib}/${url.pathname.slice(5).replace(/\.\./g, '')}`;
    if (!existsSync(target)) { res.statusCode = 404; return res.end(); }
    res.setHeader('content-type', target.endsWith('.wasm') ? 'application/wasm' : 'text/javascript'); return res.end(readFileSync(target));
  }
  res.statusCode = 404; res.end();
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

const report = { run: new Date().toISOString(), sessionA, sessionB, results: {}, hosts: new Set(), telemetryRequests: [], detailedLogRequests: [], notes: [] };
const browser = await chromium.launch({ headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const contexts = [];
async function participant(label) {
  const context = await browser.newContext({ permissions: ['camera', 'microphone'] });
  contexts.push(context);
  const page = await context.newPage();
  page.on('request', request => {
    const host = new URL(request.url()).host;
    if (host.endsWith('zoom.us') || host.endsWith('zoom.com')) {
      report.hosts.add(host);
      if (host.includes('telemetry')) report.telemetryRequests.push({ label, host, path: new URL(request.url()).pathname, method: request.method(), at: new Date().toISOString() });
      if (/log|report|lapl/i.test(new URL(request.url()).pathname) && !host.includes('telemetry')) report.detailedLogRequests.push({ label, host, path: new URL(request.url()).pathname, method: request.method(), at: new Date().toISOString() });
    }
  });
  await page.goto(origin + '/');
  await page.evaluate(() => window.zoomReady());
  return page;
}
const join = (page, topic, token, name) => page.evaluate(([t, k, n]) => window.zoomJoin(t, k, n), [topic, token, name]);
const pass = (name, ok, detail) => { report.results[name] = { ok, ...detail }; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`, JSON.stringify(detail)); if (!ok) process.exitCode = 1; };
const record = (name, detail) => { report.results[name] = { recorded: true, ...detail }; console.log(`RECORDED ${name}`, JSON.stringify(detail)); };

try {
  const hostRef = uuid(), learnerRef = uuid(), otherRef = uuid();
  const hostToken = await mint(lessonA, 'host', hostRef);
  const learnerToken = await mint(lessonA, 'participant', learnerRef);

  // T-P1: no token; a token for another session name; a token signed with another secret.
  const probe = await participant('t-p1');
  const noToken = await join(probe, sessionA, '', 'Nobody');
  const wrongSession = await join(probe, sessionB, learnerToken.token, 'Wrong S.');
  const wrongSecret = await join(probe, sessionA, signZoomJwt({ app_key: env.ONLINE_VIDEO_PROVIDER_API_KEY, tpc: sessionA, role_type: 0, version: 1,
    iat: Math.floor(Date.now() / 1000) - 30, exp: Math.floor(Date.now() / 1000) + 3600, user_key: learnerRef }, 'not-the-secret'), 'Forged F.');
  pass('T-P1 bare and foreign tokens refused', !noToken.ok && !wrongSession.ok && !wrongSecret.ok, { noToken, wrongSession, wrongSecret });

  // Host joins lesson A's session; learner joins; T-P2 learner's lesson-A token refused on lesson B's session.
  const host = await participant('host');
  const hostJoin = await join(host, sessionA, hostToken.token, hostToken.embed.displayName);
  assert.ok(hostJoin.ok, `host join failed: ${JSON.stringify(hostJoin)}`);
  const learner = await participant('learner');
  const learnerJoin = await join(learner, sessionA, learnerToken.token, learnerToken.embed.displayName);
  assert.ok(learnerJoin.ok, `learner join failed: ${JSON.stringify(learnerJoin)}`);
  const crosser = await participant('t-p2');
  const cross = await join(crosser, sessionB, learnerToken.token, 'Cross C.');
  pass('T-P2 lesson A token cannot join lesson B session', !cross.ok, { cross });

  // T-P3: expired but structurally valid token (iat three hours ago, exp = iat + 1800).
  const expiredIat = Math.floor(Date.now() / 1000) - 3 * 3600;
  const expired = await join(crosser, sessionA, signZoomJwt({ app_key: env.ONLINE_VIDEO_PROVIDER_API_KEY, tpc: sessionA, role_type: 0, version: 1,
    iat: expiredIat, exp: expiredIat + 1800, user_key: otherRef }, env.ONLINE_VIDEO_PROVIDER_API_SECRET), 'Expired E.');
  pass('T-P3 expired token refused at join', !expired.ok, { expired });

  // T-P4: the learner cannot rename itself; the host can rename the learner.
  await host.waitForFunction(() => window.zoomUsers().length >= 2, null, { timeout: 30000 });
  const selfRename = await learner.evaluate(() => window.zoomRename('Changed Name'));
  const learnerId = await learner.evaluate(() => window.zoomSelf()?.userId);
  const hostRename = await host.evaluate(id => window.zoomRename('Learner X.', id), learnerId);
  await new Promise(r => setTimeout(r, 2000));
  const nameAfter = (await host.evaluate(() => window.zoomUsers())).find(u => u.userId === learnerId)?.displayName;
  pass('T-P4 participant cannot rename itself; host can', !selfRename.ok && selfRename.code === 5014 && hostRename.ok, { selfRename, hostRename, nameAfter,
    note: selfRename.ok ? 'The Zoom account setting that allows participants to rename themselves is ON: turn it off (R3 setup item) and rerun.' : undefined });

  // T-P7: host removes the learner; rejoin with the same token is recorded.
  const removed = await host.evaluate(id => window.zoomRemove(id), learnerId);
  await new Promise(r => setTimeout(r, 4000));
  const learnerEvents = await learner.evaluate(() => window.zoomEvents());
  const rejoin = await join(learner, sessionA, learnerToken.token, learnerToken.embed.displayName);
  record('T-P7 rejoin after host removal with the same token', { removed, rejoinAccepted: rejoin.ok, rejoin, learnerEventsAfterRemoval: learnerEvents.slice(-5) });
  if (rejoin.ok) await learner.evaluate(() => window.zoomLeave(false));

  // T-P3 (second half, recorded): a participant whose token expires while connected. A
  // 30-minute floor makes this a 30-minute wait, so it runs only with OL_ZOOM_WAIT_EXPIRY=1.
  if (process.env.OL_ZOOM_WAIT_EXPIRY === '1') {
    const shortRef = uuid();
    const shortIat = Math.floor(Date.now() / 1000) - 1790;
    const shortToken = signZoomJwt({ app_key: env.ONLINE_VIDEO_PROVIDER_API_KEY, tpc: sessionA, role_type: 0, version: 1, iat: shortIat, exp: shortIat + 1800, user_key: shortRef }, env.ONLINE_VIDEO_PROVIDER_API_SECRET);
    const short = await participant('t-p3-expiry');
    const shortJoin = await join(short, sessionA, shortToken, 'Short S.');
    await new Promise(r => setTimeout(r, 90_000));
    record('T-P3 connected participant after token expiry', { shortJoin, stateAfter: await short.evaluate(() => window.zoomState()), events: await short.evaluate(() => window.zoomEvents()) });
  } else {
    report.notes.push('T-P3 mid-session expiry not observed (set OL_ZOOM_WAIT_EXPIRY=1 for the 30-minute run).');
  }

  // End the session for all, then let the SDKs send whatever they send at session end.
  await host.evaluate(() => window.zoomLeave(true));
  await new Promise(r => setTimeout(r, 5000));
} finally {
  for (const context of contexts) await context.close().catch(() => {});
  await browser.close();
  server.close();
  report.hosts = [...report.hosts].sort();
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log('Zoom hosts contacted:', report.hosts.join(', '));
  console.log(`Telemetry requests: ${report.telemetryRequests.length}; log-like requests: ${report.detailedLogRequests.length}; report written to ${reportPath}`);
  console.log('Note: this run is routed from the implementer\'s network; the Morocco-routed capture (A7) is the R4 run.');
}
