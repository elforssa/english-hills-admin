// The toolkit facts the online room depends on, as one named list (plan
// online-room-reliability.md, ORR-r2, section 4, « static, every pull request »). Each fact
// names the module that depends on it and is read as text in the installed toolkit bundle
// (@zoom/videosdk-ui-toolkit, which carries the SDK inside it) or in the typings of
// @zoom/videosdk. The list stays owned by the online classroom tools plan; the
// reliability PR adds `userKey` (the token's user_key, B1), the deprecation of
// `userIdentity`, `removeUser` and the three `ClosedReason` values.
//
//   node scripts/check-zoom-toolkit-facts.mjs                 the installed packages (npm test)
//   node scripts/check-zoom-toolkit-facts.mjs 2.6.10-1        a packed tarball of that toolkit
//   node scripts/check-zoom-toolkit-facts.mjs 2.6.10-1 2.7.0  … and of that @zoom/videosdk
// With a version, the tarballs are fetched with `npm pack` into a temporary folder and read
// without installing anything: the first step of any toolkit upgrade. Every fact is
// printed with PASS or FAIL; the exit code is 1 when one fails. Nothing here prints a
// key, a secret or a token: the packages hold none.
import { readFileSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = new URL('../', import.meta.url);
const [toolkitVersion, sdkVersion] = process.argv.slice(2);

function packed(name, version) {
  const dir = mkdtempSync(join(tmpdir(), 'zoom-facts-'));
  const file = execFileSync('npm', ['pack', `${name}@${version}`, '--silent', '--pack-destination', dir], { encoding: 'utf8' }).trim().split('\n').at(-1);
  execFileSync('tar', ['-xzf', join(dir, file), '-C', dir]);
  return { dir: join(dir, 'package'), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

const cleanups = [];
let toolkitDir = new URL('node_modules/@zoom/videosdk-ui-toolkit/', root).pathname;
let sdkDir = new URL('node_modules/@zoom/videosdk/', root).pathname;
if (toolkitVersion) { const p = packed('@zoom/videosdk-ui-toolkit', toolkitVersion); toolkitDir = p.dir; cleanups.push(p.cleanup); }
if (sdkVersion) { const p = packed('@zoom/videosdk', sdkVersion); sdkDir = p.dir; cleanups.push(p.cleanup); }

const read = (dir, path) => readFileSync(join(dir, path), 'utf8');
const bundleName = readdirSync(join(toolkitDir, 'dist')).find(name => /\.min\.esm\.js$/.test(name));
const bundle = read(toolkitDir, `dist/${bundleName}`);
const toolkitPkg = JSON.parse(read(toolkitDir, 'package.json'));
const sdkPkg = JSON.parse(read(sdkDir, 'package.json'));
const common = read(sdkDir, 'dist/types/common.d.ts');
const client = read(sdkDir, 'dist/types/videoclient.d.ts');
const events = read(sdkDir, 'dist/types/event-callback.d.ts');
const count = (text, needle) => text.split(needle).length - 1;

// [name, dependent module, check]
export const FACTS = [
  // The pin itself (installed run only).
  ['toolkit version is the pinned 2.5.0-1', 'package.json', () => toolkitVersion ? true : toolkitPkg.version === '2.5.0-1'],
  // Lifecycle (zoom-room-session.mjs).
  ['the toolkit exposes the SDK client as window.zmClient', 'zoom-room-session.mjs, zoom-hands.mjs, zoom-whiteboard.mjs, zoom-room-leftovers.mjs', () => bundle.includes('window.zmClient = ')],
  ['connection states Connected, Reconnecting, Closed, Fail', 'zoom-room-session.mjs', () => /e\.Connected = "Connected", e\.Reconnecting = "Reconnecting", e\.Closed = "Closed", e\.Fail = "Fail"/.test(bundle)],
  ['the join rejects with « Timed out waiting for session to join »', 'zoom-room-session.mjs', () => bundle.includes('"Timed out waiting for session to join"')],
  ['the SDK leaves on page unload only when leaveOnPageUnload is set', 'ZoomRoom.jsx', () => bundle.includes('leaveOnPageUnload')],
  ['participant events user-added, user-removed, user-updated', 'zoom-room-session.mjs, zoom-hands.mjs, zoom-room-leftovers.mjs', () => ['"user-added"', '"user-removed"', '"user-updated"'].every(event => bundle.includes(event))],
  ['getAllUser entries carry userId, isHost and isManager', 'zoom-hands.mjs, zoom-room-session.mjs', () => /userId: number;/.test(common) && /isHost: boolean;/.test(common) && /isManager: boolean;/.test(common)],
  ['getCurrentUserInfo exists', 'zoom-hands.mjs, zoom-room-leftovers.mjs', () => /function getCurrentUserInfo\(\)/.test(client)],
  // Reliability PR (section 1, point 7; B1).
  ['the server field userIdentity reaches the participant as userKey', 'zoom-room-leftovers.mjs', () => count(bundle, '{ from: "userIdentity", to: "userKey" }') >= 1],
  ['userKey is the token\'s user_key', 'zoom-room-leftovers.mjs', () => /The `user_key` from the JWT payload\.\s*\*\/\s*userKey\?: string;/.test(common)],
  ['userIdentity is deprecated in favour of userKey (never read)', 'zoom-room-leftovers.mjs', () => /@deprecated use `userKey` instead\s*\*\/\s*userIdentity\?: string;/.test(common)],
  ['removeUser(userId) exists, host or manager only', 'zoom-room-leftovers.mjs', () => /Only the \*\*host\*\* or \*\*manager\*\* can remove others\.[\s\S]{0,80}function removeUser\(userId: number\): ExecutedResult;/.test(client) && bundle.includes('removeUser(')],
  ['ClosedReason is exactly kicked by host | ended by host | expeled by host', 'zoom-room-session.mjs (closedKind)', () => /type ClosedReason = 'kicked by host' \| 'ended by host' \| 'expeled by host';/.test(events)],
  ['the bundle sends the three closed reasons', 'zoom-room-session.mjs (closedKind)', () => ['"kicked by host"', '"ended by host"', '"expeled by host"'].every(reason => bundle.includes(reason))],
  // Command channel (whiteboard markers, raise hand, the newer-device marker).
  ['command channel events command-channel-message and command-channel-status', 'zoom-room-session.mjs, zoom-hands.mjs', () => ['"command-channel-message"', '"command-channel-status"'].every(event => bundle.includes(event))],
  ['getCommandClient exists', 'zoom-room-session.mjs, zoom-hands.mjs', () => bundle.includes('getCommandClient')],
  // Whiteboard (online classroom tools, PR A).
  ['whiteboard key with its two export options in the default configuration', 'ZoomRoom.jsx', () => /whiteboard:\s*\{\s*enable:\s*!0,\s*enableExport:\s*!0,\s*enableViewerUserExport:\s*!0\s*\}/.test(bundle)],
  ['the toolkit reads whiteboard.enable and whiteboard.enableExport', 'ZoomRoom.jsx', () => /featuresOptions\?\.whiteboard\?\.enable(?![\w$])/.test(bundle) && /featuresOptions\?\.whiteboard\?\.enableExport(?![\w$])/.test(bundle)],
  ['whiteboard events whiteboard-status-change and peer-whiteboard-state-change', 'zoom-room-session.mjs', () => ['"whiteboard-status-change"', '"peer-whiteboard-state-change"'].every(event => bundle.includes(event))],
  ['the canvas device rule: more than two cores, not Android or iOS', 'zoom-whiteboard.mjs', () => /navigator\.hardwareConcurrency\s*>\s*2\s*&&\s*![\w$]+\)/.test(bundle)],
  // Groups (PR B).
  ['the groups window passes the typed timer as a string', 'zoom-groups.mjs', () => /onChange: \(\w+\) => \w+\("timerDuration", \w+\.target\.value\)/.test(bundle)],
  ['Zoom counts down only when isTimerEnabled is true', 'zoom-groups.mjs', () => /\.isTimerEnabled && \w+\.timerDuration > 0/.test(bundle)],
  ['the toolkit opens the groups with openSubsessions(list, options)', 'zoom-groups.mjs', () => /await \w+\.openSubsessions\(\w+, \{\s*\.\.\.\w+,\s*waitSeconds:/.test(bundle)],
  ['group status values « in room » and « joining »', 'zoom-hands.mjs', () => bundle.includes('e.InRoom = "in room"') && bundle.includes('e.Joining = "joining"')],
  // Toolkit messages (classroom polish).
  ['the decoded token payload is written by exactly one console.log call', 'zoom-toolkit-messages.mjs', () => count(bundle, 'console.log("[JWT] participant decoded payload:", ') === 1],
  ['the camera message is the key followed by the error', 'zoom-toolkit-messages.mjs', () => /\w+\(\w+\("preview\.error_start_camera"\) \+ \w+, \{ variant: "error" \}\)/.test(bundle)],
  ['the « start devices » message is the key followed by the error', 'zoom-toolkit-messages.mjs', () => /\w+\(\w+\("preview\.error_start_devices"\) \+ [\w$]+, \{ variant: "error" \}\)/.test(bundle)],
  // Media chunks (blob: loader).
  ['the media library loads js_media.min.js from source.zoom.us', 'zoom-media-chunks.mjs', () => /"https:\/\/source\.zoom\.us\/videosdk\/"\.concat\(([\w$]+), "\/lib"\)/.test(bundle) && /const [\w$]+ = "js_media\.min\.js"/.test(bundle)],
  // French interface.
  ['the en-US resource table is inline', 'zoom-fr-FR.json', () => /"en-US":\s*\{\s*translation:\s*[\w$]+\s*\}/.test(bundle)],
];

let failed = 0;
const label = toolkitVersion ? `toolkit ${toolkitPkg.version} (packed)` : `toolkit ${toolkitPkg.version} (installed)`;
console.log(`Zoom toolkit facts — ${label}, @zoom/videosdk ${sdkPkg.version}${sdkVersion ? ' (packed)' : ''}`);
for (const [name, module, check] of FACTS) {
  let ok = false;
  try { ok = check() === true; } catch { ok = false; }
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} — ${module}`);
}
for (const cleanup of cleanups) cleanup();
if (failed) { console.error(`FAIL zoom toolkit facts: ${failed} of ${FACTS.length} no longer hold; re-read the dependent modules before any upgrade`); process.exit(1); }
console.log(`PASS zoom toolkit facts: ${FACTS.length} facts hold`);
