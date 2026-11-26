// Local-stack guard (RWR-r5 follow-ups 142, owner item 11).
//
// Every script that resets or writes to a local Supabase stack calls this guard before its
// first statement. It refuses unless:
//   1. HILLS_LOCAL_STACK names the stack the Supabase CLI uses here (project_id in this
//      checkout's supabase/config.toml), so a script never writes to a stack by accident;
//   2. every target the script hard-codes (database port, API URL, database container) is the
//      one that config declares: the fixed container « supabase_db_<project_id> » and the
//      [db] / [api] ports (54322 / 54321 in the repository);
//   3. the running containers of that stack publish exactly those ports (docker inspect), so
//      a port that belongs to another stack on the same machine is refused.
// « supabase db reset » goes through resetLocalDatabase(), which runs the guard first.
//
// From JavaScript:  import { assertLocalStack } from './lib/local-stack.mjs';
//                   assertLocalStack({ dbPort: '54322', apiUrl: 'http://127.0.0.1:54321' });
// From a shell:     node scripts/lib/local-stack.mjs assert --db-port 54322 [--api-url URL] [--container NAME]
//                   node scripts/lib/local-stack.mjs db-reset --version 140 --no-seed
// From Python:      scripts/lib/local_stack.py (calls this file).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);

export class LocalStackRefusal extends Error {
  constructor(message) { super(`Local-stack guard: ${message}`); this.name = 'LocalStackRefusal'; }
}
const refuse = message => { throw new LocalStackRefusal(message); };

// The three values the guard needs from supabase/config.toml: top-level project_id and the
// port of the [api] and [db] tables. A small reader; the file is the CLI's own config.
export function readStackConfig(root = REPO_ROOT) {
  const text = readFileSync(join(root, 'supabase', 'config.toml'), 'utf8');
  let table = '';
  const values = {};
  for (const raw of text.split('\n')) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const header = /^\[([^\]]+)\]$/.exec(line);
    if (header) { table = header[1].trim(); continue; }
    const pair = /^([A-Za-z0-9_]+)\s*=\s*(.+)$/.exec(line);
    if (pair) values[`${table}.${pair[1]}`] = pair[2].trim().replace(/^"(.*)"$/, '$1');
  }
  const projectId = values['.project_id'], apiPort = values['api.port'], dbPort = values['db.port'];
  if (!projectId || !/^[A-Za-z0-9_.-]+$/.test(projectId)) refuse('supabase/config.toml has no valid project_id');
  if (!/^\d+$/.test(apiPort || '') || !/^\d+$/.test(dbPort || '')) refuse('supabase/config.toml has no [api] or [db] port');
  return { projectId, apiPort, dbPort, apiUrl: `http://127.0.0.1:${apiPort}`, container: `supabase_db_${projectId}`, apiContainer: `supabase_kong_${projectId}` };
}

function apiPortOf(url) {
  let parsed;
  try { parsed = new URL(url); } catch { refuse(`API URL ${JSON.stringify(url)} is not a URL`); }
  if (!LOOPBACK.has(parsed.hostname)) refuse(`API URL ${url} is not a loopback address`);
  return parsed.port || (parsed.protocol === 'https:' ? '443' : '80');
}

const defaultInspect = name => execFileSync('docker', ['inspect', '-f', '{{json .NetworkSettings.Ports}}', name], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

function published(inspect, container, inner) {
  let ports;
  try { ports = JSON.parse(inspect(container)); } catch { refuse(`container ${container} is not running (docker inspect failed); start this checkout's stack with « supabase start »`); }
  return [...new Set((ports?.[inner] || []).map(binding => String(binding.HostPort)))];
}

// Returns the stack's config. Throws LocalStackRefusal (before any write) on any mismatch.
export function assertLocalStack({ dbPort, apiUrl, container, root = REPO_ROOT, env = process.env, inspect = defaultInspect } = {}) {
  const stack = readStackConfig(root);
  const named = (env.HILLS_LOCAL_STACK || '').trim();
  if (!named) refuse(`HILLS_LOCAL_STACK is not set; export HILLS_LOCAL_STACK=${stack.projectId} to confirm this checkout's stack (supabase/config.toml project_id)`);
  if (named !== stack.projectId) refuse(`HILLS_LOCAL_STACK=${named} but the Supabase CLI here uses stack ${stack.projectId} (supabase/config.toml)`);
  if (dbPort !== undefined && String(dbPort) !== stack.dbPort) refuse(`database port ${dbPort} is not stack ${stack.projectId}'s [db] port ${stack.dbPort}`);
  if (apiUrl !== undefined && apiPortOf(apiUrl) !== stack.apiPort) refuse(`API URL ${apiUrl} is not stack ${stack.projectId}'s [api] port ${stack.apiPort}`);
  if (container !== undefined && container !== stack.container) refuse(`container ${container} is not stack ${stack.projectId}'s database container ${stack.container}`);
  // One docker check per process tree for the same stack and ports.
  const verified = `${stack.projectId}:${stack.dbPort}:${stack.apiPort}`;
  if (env.HILLS_LOCAL_STACK_VERIFIED !== verified) {
    const db = published(inspect, stack.container, '5432/tcp');
    if (!db.includes(stack.dbPort)) refuse(`container ${stack.container} publishes ${db.join(', ') || 'no port'}, not the [db] port ${stack.dbPort}`);
    const api = published(inspect, stack.apiContainer, '8000/tcp');
    if (!api.includes(stack.apiPort)) refuse(`container ${stack.apiContainer} publishes ${api.join(', ') || 'no port'}, not the [api] port ${stack.apiPort}`);
    if (env === process.env) process.env.HILLS_LOCAL_STACK_VERIFIED = verified;
  }
  return stack;
}

// « supabase db reset --local … » for this checkout's stack only, after the guard.
export function resetLocalDatabase(args = [], { root = REPO_ROOT, stdio = 'inherit', env = process.env, timeout = 600000 } = {}) {
  if (args.some(arg => ['--linked', '--db-url', '--project-ref', '--workdir'].includes(String(arg).split('=')[0]))) refuse('db reset targets this checkout\'s local stack only (no --linked, --db-url, --project-ref or --workdir)');
  assertLocalStack({ root, env });
  return execFileSync('supabase', ['db', 'reset', '--local', '--workdir', root, ...args.filter(arg => arg !== '--local')],
    { cwd: root, stdio, env, timeout, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
}

function parseOptions(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = { '--db-port': 'dbPort', '--api-url': 'apiUrl', '--container': 'container' }[argv[i]];
    if (!key || argv[i + 1] === undefined) refuse(`unknown or incomplete option ${argv[i]}`);
    options[key] = argv[i + 1];
  }
  return options;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...rest] = process.argv.slice(2);
  try {
    if (command === 'assert') {
      const stack = assertLocalStack(parseOptions(rest));
      console.log(`PASS local-stack guard: ${stack.projectId} (db ${stack.dbPort}, api ${stack.apiPort})`);
    } else if (command === 'db-reset') {
      resetLocalDatabase(rest);
    } else {
      refuse('usage: local-stack.mjs assert [--db-port N] [--api-url URL] [--container NAME] | db-reset [supabase db reset options]');
    }
  } catch (error) {
    console.error(error.message);
    process.exit(error instanceof LocalStackRefusal ? 3 : (error.status || 1));
  }
}
