// Per-route JavaScript weight from the production build manifests (run after `npm run build`).
// First load = root main files + the route's app chunks, gzip-compressed, as `next build` reports.
// `--check` compares against scripts/perf-budget.json ceilings (no-regression guard) and exits 1
// on any excess. Targets in the same file are goals for later phases and are reported, not enforced.
// Manual check: CI does not run it, and it does not confirm that .next was built from the current tree.
import { readFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const next = root + '.next/';
if (!existsSync(next + 'app-build-manifest.json')) throw new Error('Run `npm run build` first');
const appPages = JSON.parse(readFileSync(next + 'app-build-manifest.json', 'utf8')).pages;
const rootMain = JSON.parse(readFileSync(next + 'build-manifest.json', 'utf8')).rootMainFiles;
const gzCache = new Map();
const gz = file => {
  if (!gzCache.has(file)) gzCache.set(file, gzipSync(readFileSync(next + file)).length);
  return gzCache.get(file);
};
const kB = bytes => Math.round(bytes / 100) / 10; // decimal kB, as `next build` prints

const shared = new Set(rootMain);
const routes = {};
for (const [entry, files] of Object.entries(appPages)) {
  if (!entry.endsWith('/page')) continue;
  const route = entry.replace(/\/page$/, '').replace(/\/\([^)]+\)/g, '') || '/';
  const js = new Set([...rootMain, ...files.filter(file => file.endsWith('.js'))]);
  routes[route] = { firstLoadKB: kB([...js].reduce((sum, file) => sum + gz(file), 0)) };
}
const sharedKB = kB([...shared].reduce((sum, file) => sum + gz(file), 0));

const report = { sharedKB, routes };
if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 1));
} else {
  console.log(`shared by all: ${sharedKB} kB`);
  for (const [route, value] of Object.entries(routes).sort((a, b) => b[1].firstLoadKB - a[1].firstLoadKB)) {
    console.log(`${String(value.firstLoadKB).padStart(7)} kB  ${route}`);
  }
}

if (process.argv.includes('--check')) {
  const budget = JSON.parse(readFileSync(root + 'scripts/perf-budget.json', 'utf8'));
  const failures = [];
  if (sharedKB > budget.sharedKB.ceiling) failures.push(`shared ${sharedKB} kB > ceiling ${budget.sharedKB.ceiling} kB`);
  for (const [route, limit] of Object.entries(budget.routes)) {
    const actual = routes[route]?.firstLoadKB;
    if (actual === undefined) failures.push(`${route}: missing from build`);
    else if (actual > limit.ceiling) failures.push(`${route}: ${actual} kB > ceiling ${limit.ceiling} kB`);
    else if (limit.target && actual > limit.target) console.log(`note ${route}: ${actual} kB, target ${limit.target} kB`);
  }
  if (failures.length) {
    console.error('Bundle budget exceeded:\n  ' + failures.join('\n  '));
    process.exit(1);
  }
  console.log('PASS bundle budget ceilings');
}
