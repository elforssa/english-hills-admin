// A small page that mounts the real room component (src/components/online/ZoomRoom.jsx)
// with the real tab guard, error mapping and session controller, outside Next.js and
// without a database, so the room lifecycle can be driven in a browser:
//   - with a fake toolkit (CI: no Zoom, no network), or
//   - with the real UI Toolkit against Zoom (local acceptance only).
// The page mirrors the glue of src/app/(admin)/online/room/[id]/page.jsx: tab guard
// first, then an embed from GET /embed (a new pass, so a new Zoom identity, per call, as
// the join route does), « Réessayer » after the previous room has settled.
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../../', import.meta.url));

const ENTRY = `
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import ZoomRoom from './src/components/online/ZoomRoom.jsx';
import { createTabGuard, roomGuardKey } from './src/lib/online/room-tab-guard.mjs';
import { roomSettled } from './src/lib/online/zoom-room-session.mjs';
import { roomErrorFor, passExpired } from './src/lib/online/zoom-room-errors.mjs';

const query = new URLSearchParams(location.search);
const lesson = query.get('lesson') || 'lesson', person = query.get('person') || 'person', role = query.get('role') || 'participant';
window.__renders = 0;

function App() {
  const [state, setState] = useState({ phase: 'checking' });
  const [, rerender] = useState(0);
  const guard = useRef(null);
  window.__renders++;
  window.__rerender = () => rerender(n => n + 1);
  const join = useCallback(async () => {
    setState({ phase: 'joining' });
    await roomSettled();
    const embed = await fetch('/embed?' + new URLSearchParams({ lesson, person, role })).then(r => r.json());
    setState({ phase: 'in_room', embed });
  }, []);
  useEffect(() => {
    let live = true;
    const tab = createTabGuard({ key: roomGuardKey(lesson, person), onTakeover: () => { if (live) setState({ phase: 'displaced' }); } });
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
  // New function identities on every render, like a page whose role or back link changes.
  const onLeft = () => setState({ phase: 'left' });
  const onError = detail => setState(previous => ({ phase: 'refused', room: roomErrorFor({ ...detail, passExpired: passExpired(previous.embed) }), code: detail?.code }));
  window.__phase = state.phase;
  return (
    <div>
      <p data-testid="phase">{state.phase}</p>
      {state.phase === 'other_tab' && <div data-testid="room-other-tab"><p>Vous êtes déjà connecté à ce cours dans un autre onglet.</p><button onClick={takeThisTab}>Utiliser cet onglet</button></div>}
      {state.phase === 'displaced' && <p data-testid="room-displaced">Ce cours est maintenant ouvert dans un autre onglet.</p>}
      {state.phase === 'in_room' && <ZoomRoom embed={state.embed} onLeft={onLeft} onError={onError} />}
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
z.close = () => { for (const fn of [...z.closed]) fn(); };
export default toolkit;
`;

export async function buildRoomHarness({ fake }) {
  const plugins = [{ name: 'room-harness', setup(b) {
    if (fake) {
      b.onResolve({ filter: /^@zoom\/videosdk-ui-toolkit(\/.*\.css)?$/ }, args => ({ path: args.path, namespace: 'fake-toolkit' }));
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
export async function serveRoomHarness({ js, css, embed, headers = [] }) {
  const html = '<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>room harness</title><link rel="stylesheet" href="/room.css"><body><div id="app"></div><script src="/room.js"></script></body></html>';
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    try {
      if (url.pathname === '/') {
        res.setHeader('content-type', 'text/html; charset=utf-8'); res.setHeader('cache-control', 'no-store');
        for (const { key, value } of headers) res.setHeader(key, value);
        return res.end(html);
      }
      if (url.pathname === '/room.js') { res.setHeader('content-type', 'text/javascript; charset=utf-8'); return res.end(js); }
      if (url.pathname === '/room.css') { res.setHeader('content-type', 'text/css; charset=utf-8'); return res.end(css); }
      if (url.pathname === '/embed') { res.setHeader('content-type', 'application/json'); res.setHeader('cache-control', 'no-store'); return res.end(JSON.stringify(await embed(Object.fromEntries(url.searchParams)))); }
    } catch (error) { res.statusCode = 500; return res.end(String(error?.message || error)); }
    res.statusCode = 404; return res.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}
