// A small page that mounts the real room component (src/components/online/ZoomRoom.jsx)
// with the real tab guard, error mapping and session controller, outside Next.js and
// without a database, so the room lifecycle can be driven in a browser:
//   - with a fake toolkit (CI: no Zoom, no network), or
//   - with the real UI Toolkit against Zoom (local acceptance only).
// The page mirrors the glue of src/app/(admin)/online/room/[id]/page.jsx: tab guard
// first, then an embed from GET /embed (a new pass, so a new Zoom identity, per call, as
// the join route does), « Réessayer » after the previous room has settled, and the
// page's own « Quitter le cours » link, which leads to a stand-in portal page (/portal).
// Reliability PR (plan online-room-reliability.md): the page's pass glue too — the pass
// watcher (room-pass.mjs) with `online_confirm_pass` / `online_check_pass` /
// `online_list_room_leftovers` answered at POST /rpc/<name> by an in-memory pass model
// that follows the SQL rules of migration 129 (supersede at confirmation only, earlier
// issued passes of the same lesson, person and kind; ids only for the leftovers), the
// cards « Utiliser cet appareil », the removed and ended texts, and the parent's notice.
// `embed(query, { pass })` may use the pass id as the token's user_key.
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../../', import.meta.url));

const ENTRY = `
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import ZoomRoom from './src/components/online/ZoomRoom.jsx';
import RoomLeaveLink from './src/components/online/RoomLeaveLink.jsx';
import { createTabGuard, roomGuardKey } from './src/lib/online/room-tab-guard.mjs';
import { roomSettled } from './src/lib/online/zoom-room-session.mjs';
import { roomErrorFor, passExpired } from './src/lib/online/zoom-room-errors.mjs';
import { createPassWatcher, closedOutcome, ROOM_PASS_TEXT } from './src/lib/online/room-pass.mjs';

const query = new URLSearchParams(location.search);
const lesson = query.get('lesson') || 'lesson', person = query.get('person') || 'person', role = query.get('role') || 'participant';
const account = query.get('account') || person;
window.__renders = 0;
const rpc = async (name, args) => {
  const response = await fetch('/rpc/' + name, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...args, account }) });
  if (!response.ok) throw new Error('rpc ' + response.status);
  return response.json();
};

function App() {
  const [state, setState] = useState({ phase: 'checking' });
  const [tookOver, setTookOver] = useState(null);
  const [, rerender] = useState(0);
  const guard = useRef(null);
  const displaced = useRef(false);
  const watcher = useRef(null);
  const roomLink = useRef(null);
  const passRef = useRef(null);
  window.__renders++;
  window.__rerender = () => rerender(n => n + 1);
  const join = useCallback(async () => {
    if (displaced.current) return;
    setState({ phase: 'joining' });
    setTookOver(null);
    await roomSettled();
    if (displaced.current) return;
    const body = await fetch('/embed?' + new URLSearchParams({ lesson, person, role, account, delay: query.get('delay') || '0' })).then(r => r.json());
    if (displaced.current) return;
    passRef.current = body.pass;
    window.__pass = body.pass;
    setState({ phase: 'in_room', embed: body.embed, pass: body.pass, display_label: body.display_label });
  }, []);
  useEffect(() => {
    let live = true;
    displaced.current = false;
    const tab = createTabGuard({ key: roomGuardKey(lesson, person), onTakeover: () => { if (live) { displaced.current = true; setState({ phase: 'displaced' }); } } });
    guard.current = tab;
    tab.acquire().then(result => { if (live) { if (result === 'busy') setState({ phase: 'other_tab' }); else join(); } });
    return () => { live = false; guard.current = null; tab.close(); };
  }, [join]);
  const takeThisTab = async () => {
    setState({ phase: 'checking' });
    const result = await guard.current?.takeOver();
    if (result === 'busy') setState({ phase: 'other_tab', stuck: true }); else join();
  };
  useEffect(() => {
    if (state.phase !== 'displaced') return;
    Promise.resolve().then(roomSettled).then(() => guard.current?.release());
  }, [state.phase]);
  const pass = state.phase === 'in_room' ? state.pass : null;
  const label = state.phase === 'in_room' ? state.display_label : null;
  useEffect(() => {
    if (!pass) return undefined;
    const watch = createPassWatcher({ pass, rpc, intervalMs: Number(query.get('passMs')) || undefined,
      onOutcome: outcome => setState(outcome.kind === 'superseded' ? { phase: 'superseded' } : { phase: 'left', reason: outcome.reason }),
      onTookOver: () => setTookOver(label || ''),
      onSupersededOthers: () => roomLink.current?.announceNewer() });
    watcher.current = watch;
    return () => { if (watcher.current === watch) watcher.current = null; watch.stop(); };
  }, [pass, label]);
  const onJoined = useCallback(() => watcher.current?.joined(), []);
  const onNewer = useCallback(() => watcher.current?.checkNow(), []);
  const listLeftovers = useCallback(() => rpc('online_list_room_leftovers', { p_lesson: lesson }).then(answer => answer?.ids || []), []);
  // New function identities on every render, like a page whose role or back link changes.
  const onLeft = async detail => {
    const outcome = await closedOutcome(detail?.closed, () => rpc('online_check_pass', { p_jti: passRef.current }));
    if (outcome.kind === 'portal') setState({ phase: 'left' });
    else if (outcome.kind === 'left') setState({ phase: 'left', reason: outcome.reason });
    else setState({ phase: outcome.kind });
  };
  const onError = detail => setState(previous => ({ phase: 'refused', room: roomErrorFor({ ...detail, passExpired: passExpired(previous.embed) }), code: detail?.code }));
  window.__phase = state.phase;
  return (
    <div>
      <p data-testid="phase">{state.phase}</p>
      <RoomLeaveLink href="/portal" inRoom={state.phase === 'in_room'} />
      {state.phase === 'other_tab' && <div data-testid="room-other-tab"><p>Vous êtes déjà connecté à ce cours dans un autre onglet.</p><button onClick={takeThisTab}>Utiliser cet onglet</button></div>}
      {state.phase === 'displaced' && <p data-testid="room-displaced">Ce cours est maintenant ouvert dans un autre onglet.</p>}
      {state.phase === 'superseded' && <div data-testid="room-superseded"><p>{ROOM_PASS_TEXT.superseded}</p><button onClick={join}>{ROOM_PASS_TEXT.useThisDevice}</button></div>}
      {state.phase === 'removed' && <div data-testid="room-removed"><p>{ROOM_PASS_TEXT.removed}</p><button onClick={join}>{ROOM_PASS_TEXT.rejoin}</button></div>}
      {state.phase === 'ended' && <div data-testid="room-ended"><p>{ROOM_PASS_TEXT.ended}</p><a href="/portal">{ROOM_PASS_TEXT.quit}</a></div>}
      {state.phase === 'left' && state.reason && <p data-testid="room-left-reason">{state.reason}</p>}
      {state.phase === 'in_room' && tookOver !== null && <p role="status" data-testid="room-took-over">{ROOM_PASS_TEXT.tookOver(tookOver)}</p>}
      {state.phase === 'in_room' && <ZoomRoom embed={state.embed} onLeft={onLeft} onError={onError} onJoined={onJoined} onNewer={onNewer}
        listLeftovers={state.embed.role === 'host' && query.get('sweep') !== 'off' ? listLeftovers : undefined} link={roomLink} />}
      {state.phase === 'refused' && <div data-testid="room-refused" data-code={String(state.code)}><p>{state.room.text}</p>{state.room.retry && <button onClick={join}>Réessayer</button>}</div>}
    </div>
  );
}
createRoot(document.getElementById('app')).render(<App />);
`;

// A stand-in for the toolkit singleton: records calls on window.__zoom.calls, shows a
// pre-join button, and lets the test raise SDK events.
const FAKE_TOOLKIT = `
const z = window.__zoom = window.__zoom || { calls: [], instance: 0, handlers: {}, closed: new Set(), destroyMs: 60 };
const log = text => z.calls.push(text);
let destroying = null;
const toolkit = {
  joinSession(container, config) {
    z.instance++; log('join#' + z.instance + ':' + config.videoSDKJWT);
    z.config = config; z.inSession = false;
    container.innerHTML = '<button type="button">' + (z.joinLabel || 'Rejoindre le cours') + '</button>';
    container.querySelector('button').addEventListener('click', () => { log('click-join'); });
    z.container = container;
    return new Promise(() => {});
  },
  onSessionClosed(fn) { log('onSessionClosed#' + z.instance); z.closed.add(fn); },
  onSessionDestroyed(fn) { z.closed.add(fn); },
  on(event, fn) { (z.handlers[event] = z.handlers[event] || new Set()).add(fn); },
  off(event, fn) { z.handlers[event] && z.handlers[event].delete(fn); },
  async leaveSession() { log('leave'); z.inSession = false; },
  destroy() {
    log('destroy:start');
    destroying = new Promise(resolve => setTimeout(() => { z.closed.clear(); z.handlers = {}; if (z.container) z.container.innerHTML = ''; log('destroy:end'); resolve(); }, z.destroyMs));
    return destroying;
  },
  i18n: {
    getInstance: () => ({ addResourceBundle(language, ns, resources) { z.joinLabel = resources['preview.join_button']; log('resources:' + language + ':' + Object.keys(resources).length); }, changeLanguage: async () => {} }),
    setLanguageList(list) { log('languageList:' + list.join(',')); },
    async setLanguage(language) { log('setLanguage:' + language); },
  },
};
z.emit = (event, payload) => { for (const fn of [...(z.handlers[event] || [])]) fn(payload); };
z.connect = () => { z.inSession = true; z.emit('connection-change', { state: 'Connected' }); };
// zmClient stand-in for the reliability glue: participants with userKey / userIdentity,
// removeUser, and the command channel (sent texts recorded on z.sent).
z.users = z.users || [];
z.sent = z.sent || [];
z.removed = z.removed || [];
window.zmClient = {
  getAllUser: () => z.users,
  getCurrentUserInfo: () => z.users.find(user => user.self) || { userId: 1 },
  removeUser: userId => { log('removeUser:' + userId); z.removed.push(userId); if (z.refuseRemove) return Promise.reject(new Error('refused')); z.users = z.users.filter(user => user.userId !== userId); return Promise.resolve(''); },
  getCommandClient: () => ({ send: text => { z.sent.push(text); return Promise.resolve(''); } }),
  getSubsessionClient: () => ({ getUserStatus: () => 'initial' }),
};
z.closeWith = reason => { z.inSession = false; z.emit('connection-change', { state: 'Closed', reason }); };
z.close = () => { for (const fn of [...z.closed]) fn(); };
export default toolkit;
`;

export async function buildRoomHarness({ fake }) {
  const plugins = [{ name: 'room-harness', setup(b) {
    if (fake) {
      b.onResolve({ filter: /^@zoom\/videosdk-ui-toolkit(\/.*\.css)?$/ }, args => ({ path: args.path, namespace: 'fake-toolkit' }));
      // No Zoom host is contacted with the fake toolkit: the media chunks are not loaded.
      b.onResolve({ filter: /zoom-media-chunks\.mjs$/ }, () => ({ path: 'media-chunks', namespace: 'fake-media' }));
      b.onLoad({ filter: /.*/, namespace: 'fake-media' }, () => ({ contents: 'export const preloadZoomMediaChunks = async () => ({ loaded: [], failed: [] });', loader: 'js' }));
      b.onLoad({ filter: /\.css$/, namespace: 'fake-toolkit' }, () => ({ contents: '', loader: 'css' }));
      b.onLoad({ filter: /.*/, namespace: 'fake-toolkit' }, () => ({ contents: FAKE_TOOLKIT, loader: 'js' }));
    }
  } }];
  const result = await build({
    stdin: { contents: ENTRY, resolveDir: root, sourcefile: 'room-harness.jsx', loader: 'jsx' },
    bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', outdir: 'out', logLevel: 'silent',
    alias: { '@': root + 'src' }, define: { 'process.env.NODE_ENV': '"production"' },
    loader: { '.png': 'dataurl', '.svg': 'dataurl', '.gif': 'dataurl', '.jpg': 'dataurl', '.woff': 'dataurl', '.woff2': 'dataurl', '.ttf': 'dataurl' },
    plugins,
  });
  const file = suffix => result.outputFiles.find(f => f.path.endsWith(suffix))?.text || '';
  return { js: file('.js'), css: file('.css') };
}

// Serves the harness on 127.0.0.1 (a secure context: Web Locks, camera and microphone).
// `embed(query)` returns the embed for one pass. `headers` are response headers for the
// page itself, e.g. the room path's own Content-Security-Policy and Permissions-Policy.
// The in-memory pass model (the SQL rules of migration 129, without roles or windows).
export function createPassModel() {
  const passes = [];
  let seq = 0;
  const find = jti => passes.find(p => p.jti === jti);
  const state = p => ({ ok: !p.revoked, reason: p.revoked ? 'pass_invalid' : null, superseded: !!p.superseded, revoked: !!p.revoked });
  return {
    passes,
    issue({ lesson, person, role, account }) {
      const p = { jti: randomUUID(), lesson, person, kind: role === 'host' ? 'host' : 'participant', account: account || person, seq: ++seq, superseded: false, revoked: false, confirmed: false };
      passes.push(p);
      return p;
    },
    confirm(jti, account) {
      const me = find(jti);
      if (!me || me.account !== account) return null;
      let others = 0, other = false;
      if (!me.superseded && !me.revoked) {
        for (const p of passes) {
          if (p === me || p.lesson !== me.lesson || p.person !== me.person || p.kind !== me.kind || p.superseded || p.revoked || p.seq > me.seq) continue;
          p.superseded = true; others++; if (p.account !== me.account) other = true;
        }
      }
      me.confirmed = true;
      return { ...state(me), superseded_others: others, took_over_other_account: other };
    },
    check(jti, account) { const me = find(jti); return me && me.account === account ? state(me) : null; },
    leftovers(lesson) { return { ids: passes.filter(p => p.lesson === lesson && (p.superseded || p.revoked)).map(p => p.jti).sort() }; },
    revoke(jti) { const p = find(jti); if (p) p.revoked = true; },
  };
}

export async function serveRoomHarness({ js, css, embed, headers = [], model = createPassModel(), rpcHook = null }) {
  const html = '<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>room harness</title><link rel="stylesheet" href="/room.css"><link rel="stylesheet" href="/harness.css"><body><div id="app"></div><script src="/room.js"></script></body></html>';
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    try {
      if (url.pathname === '/') {
        res.setHeader('content-type', 'text/html; charset=utf-8'); res.setHeader('cache-control', 'no-store');
        for (const { key, value } of headers) res.setHeader(key, value);
        return res.end(html);
      }
      if (url.pathname === '/portal') { res.setHeader('content-type', 'text/html; charset=utf-8'); return res.end('<!doctype html><html lang="fr"><meta charset="utf-8"><title>portal</title><body><p data-testid="portal">portal</p></body></html>'); }
      if (url.pathname === '/room.js') { res.setHeader('content-type', 'text/javascript; charset=utf-8'); return res.end(js); }
      // The harness has no Tailwind: give the room container the height its class gives it in the app.
      if (url.pathname === '/harness.css') { res.setHeader('content-type', 'text/css; charset=utf-8'); return res.end('[data-testid="zoom-room"] { height: 78vh; width: 100%; overflow: hidden; }'); }
      if (url.pathname === '/room.css') { res.setHeader('content-type', 'text/css; charset=utf-8'); return res.end(css); }
      if (url.pathname === '/embed') {
        const query = Object.fromEntries(url.searchParams);
        const issued = model.issue(query);
        const made = await embed(query, { pass: issued.jti });
        res.setHeader('content-type', 'application/json'); res.setHeader('cache-control', 'no-store');
        return res.end(JSON.stringify({ embed: made, pass: issued.jti, display_label: made?.displayName || '' }));
      }
      if (url.pathname.startsWith('/rpc/') && req.method === 'POST') {
        const name = url.pathname.slice(5);
        let raw = '';
        for await (const chunk of req) raw += chunk;
        const args = JSON.parse(raw || '{}');
        if (rpcHook) { const hooked = await rpcHook(name, args); if (hooked) { res.statusCode = hooked.status || 500; return res.end(JSON.stringify(hooked.body || {})); } }
        const answer = name === 'online_confirm_pass' ? model.confirm(args.p_jti, args.account)
          : name === 'online_check_pass' ? model.check(args.p_jti, args.account)
            : name === 'online_list_room_leftovers' ? model.leftovers(args.p_lesson) : undefined;
        res.setHeader('content-type', 'application/json');
        if (!answer) { res.statusCode = 403; return res.end(JSON.stringify({ reason: 'forbidden' })); }
        return res.end(JSON.stringify(answer));
      }
    } catch (error) { res.statusCode = 500; return res.end(String(error?.message || error)); }
    res.statusCode = 404; return res.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, model, origin: `http://127.0.0.1:${server.address().port}` };
}
