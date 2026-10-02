// Load the actual server wrapper with only its service-client dependency replaced.
import { build } from 'esbuild';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
export async function loadMetaRpc(client) {
  globalThis.__repairClient = client;
  const built = await build({ entryPoints: ['src/lib/crm/meta/server.js'], bundle: true, write: false,
    platform: 'node', format: 'esm', plugins: [{ name: 'local-client', setup(b) {
      // Share the real MetaError class with the worker, rather than bundling a copy.
      b.onResolve({ filter: /protocol\.mjs$/ }, () => ({ path: pathToFileURL(resolve('src/lib/crm/meta/protocol.mjs')).href, external: true }));
      b.onResolve({ filter: /^(server-only|@\/lib\/supabase-admin)$/ }, a => ({ path: a.path, namespace: 'fixture' }));
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, a => ({ contents: a.path === 'server-only' ? ''
        : 'export const getServiceRoleClient = () => globalThis.__repairClient;', loader: 'js' }));
    } }] });
  return (await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`)).metaRpc;
}
