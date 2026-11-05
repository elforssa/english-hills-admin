import assert from 'node:assert/strict';
import semver from 'semver';
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Temporary exact advisory exception for an upstream issue with no patched release.
// This is not a general vulnerability waiver. Retire it when a compatible fix ships.
export const advisoryURL = 'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm';
const approvedNodes = {
  'node_modules/braces': '3.0.3',
  'node_modules/chokidar': '3.6.0',
  'node_modules/micromatch': '4.0.8',
  'node_modules/fast-glob': '3.3.3',
  'node_modules/tailwindcss': '3.4.19',
  'node_modules/tailwindcss-animate': '1.0.7',
  'node_modules/eslint-config-next': '15.5.24',
  'node_modules/@next/eslint-plugin-next': '15.5.24',
  'node_modules/@next/eslint-plugin-next/node_modules/fast-glob': '3.3.1',
};
const node = (name) => `node_modules/${name}`;
const approvedEdges = [
  ['', 'devDependencies', 'tailwindcss', node('tailwindcss')],
  ['', 'devDependencies', 'tailwindcss-animate', node('tailwindcss-animate')],
  ['', 'devDependencies', 'eslint-config-next', node('eslint-config-next')],
  [node('tailwindcss-animate'), 'peerDependencies', 'tailwindcss', node('tailwindcss')],
  ...['chokidar', 'fast-glob', 'micromatch'].map((name) => [node('tailwindcss'), 'dependencies', name, node(name)]),
  [node('chokidar'), 'dependencies', 'braces', node('braces')],
  [node('micromatch'), 'dependencies', 'braces', node('braces')],
  [node('fast-glob'), 'dependencies', 'micromatch', node('micromatch')],
  [node('@next/eslint-plugin-next/node_modules/fast-glob'), 'dependencies', 'micromatch', node('micromatch')],
  [node('eslint-config-next'), 'dependencies', '@next/eslint-plugin-next', node('@next/eslint-plugin-next')],
  [node('@next/eslint-plugin-next'), 'dependencies', 'fast-glob', node('@next/eslint-plugin-next/node_modules/fast-glob')],
];
// Second temporary exact advisory exception, owner-approved 2026-11-03 ("approve audit
// exception") and narrowed 2026-11-05 (owner approval: "narrow the existing minimatch
// exception to the advisory's new range and remaining node only"). npm's data for
// GHSA-g3hv-75wg-m249 changed overnight from <11.0.1 to >=7.0.0 <11.0.1, so minimatch
// 3.1.5 (node_modules/minimatch, under ESLint 8 / rimraf) is no longer affected and is
// no longer an exception. The one remaining affected copy is 10.2.5 under the dev-only
// typescript-eslint tooling of eslint-config-next. The production copy under
// @sentry/bundler-plugins is 11.0.4, outside the range. Not a general waiver: a
// production node, a new consumer, a severity or range change, any other advisory, a
// compatible (non-major) fix or an unassessed newer stable 10.x release fails.
export const minimatchAdvisoryURL = 'https://github.com/advisories/GHSA-g3hv-75wg-m249';
export const minimatchAffectedRange = '>=7.0.0 <11.0.1';
const minimatchNodes = {
  'node_modules/@typescript-eslint/typescript-estree/node_modules/minimatch': '10.2.5',
};
const minimatchConsumers = {
  ...minimatchNodes,
  'node_modules/@typescript-eslint/eslint-plugin': '8.59.3',
  'node_modules/@typescript-eslint/parser': '8.59.3',
  'node_modules/@typescript-eslint/type-utils': '8.59.3',
  'node_modules/@typescript-eslint/typescript-estree': '8.59.3',
  'node_modules/@typescript-eslint/utils': '8.59.3',
  'node_modules/eslint-config-next': '15.5.24',
};
const minimatchEdges = [
  ['', 'devDependencies', 'eslint-config-next', node('eslint-config-next')],
  [node('@typescript-eslint/eslint-plugin'), 'dependencies', '@typescript-eslint/type-utils', node('@typescript-eslint/type-utils')],
  [node('@typescript-eslint/eslint-plugin'), 'dependencies', '@typescript-eslint/utils', node('@typescript-eslint/utils')],
  [node('@typescript-eslint/eslint-plugin'), 'peerDependencies', '@typescript-eslint/parser', node('@typescript-eslint/parser')],
  [node('@typescript-eslint/parser'), 'dependencies', '@typescript-eslint/typescript-estree', node('@typescript-eslint/typescript-estree')],
  [node('@typescript-eslint/type-utils'), 'dependencies', '@typescript-eslint/typescript-estree', node('@typescript-eslint/typescript-estree')],
  [node('@typescript-eslint/type-utils'), 'dependencies', '@typescript-eslint/utils', node('@typescript-eslint/utils')],
  [node('@typescript-eslint/typescript-estree'), 'dependencies', 'minimatch', node('@typescript-eslint/typescript-estree/node_modules/minimatch')],
  [node('@typescript-eslint/utils'), 'dependencies', '@typescript-eslint/typescript-estree', node('@typescript-eslint/typescript-estree')],
  [node('eslint-config-next'), 'dependencies', '@typescript-eslint/eslint-plugin', node('@typescript-eslint/eslint-plugin')],
  [node('eslint-config-next'), 'dependencies', '@typescript-eslint/parser', node('@typescript-eslint/parser')],
];
// npm's fix metadata on 2026-11-03: the "fixes" it reported were major DOWNGRADE
// suggestions of the dev root (eslint-config-next 0.2.4 or 12.0.4, the version varies
// between runs of the same npm) and do not count. Such metadata is accepted only for
// that root and only when the suggested major is below the installed one; an upgrade
// suggestion or any other package requires reassessment. ESLint itself no longer
// reaches the affected copy and is no longer accepted as a fix root (2026-11-05).
// npm also marks propagated entries `fixAvailable: true` although `npm audit fix
// --dry-run` changes nothing, so a bare `true` is accepted only on a propagated entry
// and only while that dry-run plan is empty; a real compatible fix shows up in the plan
// and retires the exception.
const minimatchFixRoots = ['eslint-config-next'];
// Stable releases newer than the approved copy in its line that were assessed and found
// still inside the advisory range (10.2.6, assessed 2026-11-03). Any other newer stable
// 10.x release requires reassessment and fails closed.
const minimatchAssessedReleases = ['10.2.6'];
const sorted = (values) => values.map((value) => JSON.stringify(value)).sort();
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function resolveDependency(packages, from, name) {
  for (let location = from; ; location = posix.dirname(location) === '.' ? '' : posix.dirname(location)) {
    const candidate = location ? `${location}/node_modules/${name}` : node(name);
    if (packages[candidate]) return candidate;
    if (!location) return undefined;
  }
}

export function validateToolingPaths(lock, manifest) {
  assert.equal(lock.lockfileVersion, 3, 'Unsupported lockfile format');
  assert.ok(object(lock.packages) && object(lock.packages['']), 'Missing lockfile packages');
  for (const kind of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    assert.deepEqual(lock.packages[''][kind] ?? {}, manifest[kind] ?? {}, 'Manifest and lockfile differ');
  }
  // Inspect every incoming dependency/optional/peer edge, including hoisted consumers.
  // Checking only npm audit.nodes or dev flags would miss an additional runtime path.
  assert.deepEqual(Object.keys(lock.packages).filter((path) => path.split('node_modules/').at(-1) === 'braces'), [node('braces')], 'Additional braces installation requires assessment');
  const edges = lockEdges(lock.packages);
  const ancestors = ancestorsOf(edges, [node('braces')]);
  assert.deepEqual([...ancestors].sort(), ['', ...Object.keys(approvedNodes)].sort(), 'Unapproved braces consumer path');
  assert.deepEqual(sorted(edges.filter((edge) => ancestors.has(edge[3]))), sorted(approvedEdges), 'Braces dependency paths changed');
  for (const [path, version] of Object.entries(approvedNodes)) {
    assert.equal(lock.packages[path]?.version, version, 'Approved tooling version changed');
    assert.equal(lock.packages[path]?.dev, true, 'Braces consumer is not exclusively dev tooling');
    assert.ok(!lock.packages[path]?.link, 'Linked tooling package is not approved');
  }
}

function lockEdges(packages) {
  const edges = [];
  for (const [from, entry] of Object.entries(packages)) {
    for (const kind of ['dependencies', 'optionalDependencies', 'peerDependencies', ...(from === '' ? ['devDependencies'] : [])]) {
      for (const name of Object.keys(entry[kind] ?? {})) {
        const to = resolveDependency(packages, from, name);
        if (to) edges.push([from, kind, name, to]);
      }
    }
  }
  return edges;
}

function ancestorsOf(edges, roots) {
  const ancestors = new Set(roots);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [from, , , to] of edges) {
      if (ancestors.has(to) && !ancestors.has(from)) {
        ancestors.add(from);
        changed = true;
      }
    }
  }
  return ancestors;
}

export function validateMinimatchPaths(lock) {
  // Every installed minimatch inside the affected range must be the approved dev-only
  // copy at its recorded version; copies outside the range (3.1.5 since 2026-11-05, and
  // the production one under @sentry/bundler-plugins) are not exceptions here.
  for (const path of Object.keys(lock.packages).filter((candidate) => candidate.split('node_modules/').at(-1) === 'minimatch')) {
    const version = lock.packages[path]?.version;
    assert.ok(semver.valid(version), 'Invalid installed minimatch version');
    if (!semver.satisfies(version, minimatchAffectedRange)) continue;
    assert.ok(Object.hasOwn(minimatchNodes, path), 'Additional affected minimatch installation requires assessment');
  }
  for (const [path, version] of Object.entries(minimatchNodes)) {
    assert.equal(lock.packages[path]?.version, version, 'Approved affected minimatch version changed');
  }
  const edges = lockEdges(lock.packages);
  const ancestors = ancestorsOf(edges, Object.keys(minimatchNodes));
  assert.deepEqual([...ancestors].sort(), ['', ...Object.keys(minimatchConsumers)].sort(), 'Unapproved minimatch consumer path');
  assert.deepEqual(sorted(edges.filter((edge) => ancestors.has(edge[3]))), sorted(minimatchEdges), 'Minimatch dependency paths changed');
  for (const [path, version] of Object.entries(minimatchConsumers)) {
    assert.equal(lock.packages[path]?.version, version, 'Approved minimatch tooling version changed');
    assert.equal(lock.packages[path]?.dev, true, 'Minimatch consumer is not exclusively dev tooling');
    assert.ok(!lock.packages[path]?.link, 'Linked minimatch tooling package is not approved');
  }
}

export function validateAudit(report, lock, manifest, publishedBracesVersions, publishedMinimatchVersions, fixPlan) {
  validateToolingPaths(lock, manifest);
  validateMinimatchPaths(lock);
  // Like the braces rule: a stable minimatch release newer than the approved copy in its
  // own line (10.x) requires reassessment even before advisory metadata catches
  // up, unless it was already assessed as still affected. Prereleases alone do not
  // retire the exception; releases in other lines (11.x) are not compatible fixes.
  assert.ok(Array.isArray(publishedMinimatchVersions) && Object.values(minimatchNodes).every((version) => publishedMinimatchVersions.includes(version)), 'Invalid minimatch registry version metadata');
  const approvedLines = Object.values(minimatchNodes).map((version) => semver.parse(version));
  for (const version of publishedMinimatchVersions) {
    assert.equal(typeof version, 'string', 'Invalid minimatch registry version entry');
    const parsed = semver.parse(version);
    assert.ok(parsed, 'Invalid minimatch registry SemVer entry');
    if (parsed.prerelease.length > 0 || minimatchAssessedReleases.includes(parsed.version)) continue;
    assert.ok(!approvedLines.some((approved) => approved.major === parsed.major && semver.gt(parsed, approved)),
      'New stable minimatch release available; reassess and retire the exception');
  }
  for (const release of minimatchAssessedReleases) {
    assert.ok(semver.valid(release) && semver.satisfies(release, minimatchAffectedRange), 'Assessed minimatch release is outside the affected range');
  }
  assert.ok(Array.isArray(publishedBracesVersions) && publishedBracesVersions.includes('3.0.3'), 'Invalid registry version metadata');
  const parsedVersions = publishedBracesVersions.map((version) => {
    assert.equal(typeof version, 'string', 'Invalid registry version entry');
    const parsed = semver.parse(version);
    assert.ok(parsed, 'Invalid registry SemVer entry');
    return parsed;
  });
  // Validate every entry before comparison. Prereleases are not stable fixes;
  // build metadata follows SemVer precedence and does not mark a prerelease.
  // A new stable release requires assessment even before advisory metadata updates.
  assert.ok(!parsedVersions.some((version) => version.prerelease.length === 0 && semver.gt(version, '3.0.3')),
    'New stable braces release available; reassess and retire the exception');
  assert.equal(report.auditReportVersion, 2, 'Unsupported audit report format');
  assert.ok(!report.error && object(report.vulnerabilities) && object(report.metadata?.vulnerabilities), 'Incomplete audit report');
  const vulnerabilities = report.vulnerabilities;
  const counts = { info: 0, low: 0, moderate: 0, high: 0, critical: 0 };
  let permitted = 0;
  function check(name, visiting = new Set()) {
    assert.ok(!visiting.has(name), 'Cyclic audit advisory chain');
    const entry = vulnerabilities[name];
    assert.ok(object(entry) && entry.name === name && entry.severity === 'high', 'Allowlisted package/severity changed');
    assert.ok(Array.isArray(entry.nodes) && entry.nodes.length > 0, 'Missing audit dependency paths');
    const expectedNodes = Object.keys(approvedNodes).filter((path) => path.endsWith(`/node_modules/${name}`) || path === node(name));
    assert.deepEqual([...entry.nodes].sort(), expectedNodes.sort(), 'Unapproved audit dependency paths');
    assert.ok(entry.fixAvailable === false || (object(entry.fixAvailable) && entry.fixAvailable.isSemVerMajor === true), 'Compatible advisory fix available; remove exception');
    if (object(entry.fixAvailable)) {
      const fix = entry.fixAvailable;
      assert.ok((fix.name === 'tailwindcss' && /^4\.\d+\.\d+$/.test(fix.version)) ||
        (fix.name === 'eslint-config-next' && /^14\.\d+\.\d+$/.test(fix.version)), 'Unassessed fix metadata changed');
    }
    assert.ok(Array.isArray(entry.via) && entry.via.length > 0, 'Missing advisory provenance');
    const next = new Set([...visiting, name]);
    for (const via of entry.via) {
      if (typeof via === 'string') {
        check(via, next);
      } else {
        assert.ok(object(via) && name === 'braces' && via.name === 'braces' && via.dependency === 'braces', 'Unapproved advisory package');
        assert.equal(via.url, advisoryURL, 'Unapproved advisory');
        assert.equal(via.severity, 'high', 'Allowlisted advisory severity changed');
        assert.equal(via.range, '<=3.0.3', 'Allowlisted advisory affected range changed');
      }
    }
  }
  // Minimatch exception: moderate only, exact nodes among the approved dev-only graph,
  // provenance leading exclusively to the one advisory, no compatible fix.
  // ESLint peer edges make npm's provenance cyclic (eslint ↔ eslint-utils), so a name
  // already checked in this walk is skipped instead of rejected; every entry is still
  // checked once from the loop below.
  function checkMinimatch(name, visited = new Set()) {
    if (visited.has(name)) return;
    visited.add(name);
    const entry = vulnerabilities[name];
    assert.ok(object(entry) && entry.name === name && entry.severity === 'moderate', 'Allowlisted minimatch package/severity changed');
    assert.ok(Array.isArray(entry.nodes) && entry.nodes.length > 0, 'Missing audit dependency paths');
    const expectedNodes = Object.keys(minimatchConsumers).filter((path) => path.endsWith(`/node_modules/${name}`) || path === node(name));
    assert.ok(expectedNodes.length > 0, 'Unapproved minimatch consumer');
    assert.deepEqual([...entry.nodes].sort(), expectedNodes.sort(), 'Unapproved minimatch audit dependency paths');
    if (entry.fixAvailable === true) {
      assert.ok(name !== 'minimatch', 'Compatible minimatch advisory fix available; remove exception');
      assert.ok(object(fixPlan) && object(fixPlan.audit) && fixPlan.audit.auditReportVersion === 2
        && [fixPlan.added, fixPlan.removed, fixPlan.changed].every((count) => Number.isInteger(count)), 'Invalid npm fix plan');
      assert.ok(fixPlan.added === 0 && fixPlan.removed === 0 && fixPlan.changed === 0, 'Compatible minimatch advisory fix available; remove exception');
    } else {
      assert.ok(entry.fixAvailable === false || (object(entry.fixAvailable) && entry.fixAvailable.isSemVerMajor === true), 'Compatible minimatch advisory fix available; remove exception');
      if (object(entry.fixAvailable)) {
        const fix = entry.fixAvailable;
        const installed = minimatchFixRoots.includes(fix.name) ? minimatchConsumers[node(fix.name)] : undefined;
        assert.ok(installed && typeof fix.version === 'string' && semver.valid(fix.version) && semver.major(fix.version) < semver.major(installed), 'Unassessed minimatch fix metadata changed');
      }
    }
    assert.ok(Array.isArray(entry.via) && entry.via.length > 0, 'Missing advisory provenance');
    for (const via of entry.via) {
      if (typeof via === 'string') {
        checkMinimatch(via, visited);
      } else {
        assert.ok(object(via) && name === 'minimatch' && via.name === 'minimatch' && via.dependency === 'minimatch', 'Unapproved advisory package');
        assert.equal(via.url, minimatchAdvisoryURL, 'Unapproved advisory');
        assert.equal(via.severity, 'moderate', 'Allowlisted minimatch advisory severity changed');
        assert.equal(via.range, minimatchAffectedRange, 'Allowlisted minimatch advisory affected range changed');
      }
    }
  }
  // Which exception an entry belongs to is decided by the advisory at the root of its
  // provenance; an entry reaching both, neither or an unknown advisory is rejected.
  function rootAdvisories(name, visited = new Set(), urls = new Set()) {
    if (visited.has(name)) return urls;
    visited.add(name);
    const entry = vulnerabilities[name];
    assert.ok(object(entry) && Array.isArray(entry.via) && entry.via.length > 0, 'Unknown provenance');
    for (const via of entry.via) {
      if (typeof via === 'string') rootAdvisories(via, visited, urls);
      else urls.add(object(via) ? via.url : undefined);
    }
    return urls;
  }
  const accepted = new Set();
  for (const [name, entry] of Object.entries(vulnerabilities)) {
    assert.ok(object(entry) && entry.name === name && Object.hasOwn(counts, entry.severity), 'Invalid audit vulnerability entry');
    counts[entry.severity] += 1;
    assert.ok(Array.isArray(entry.via) && entry.via.length > 0, 'Missing advisory provenance');
    // Detect exception metadata drift even if npm lowers the aggregate severity.
    const mentionsException = entry.via.some((via) => object(via) && [advisoryURL, minimatchAdvisoryURL].includes(via.url));
    if (['moderate', 'high', 'critical'].includes(entry.severity) || mentionsException || ['braces', 'minimatch'].includes(name)) {
      const roots = rootAdvisories(name);
      assert.equal(roots.size, 1, 'Audit entry does not reach exactly one advisory');
      const [root] = roots;
      if (root === advisoryURL) check(name);
      else if (root === minimatchAdvisoryURL) checkMinimatch(name);
      else assert.fail('Unapproved advisory package');
      accepted.add(root.split('/').at(-1));
      permitted += 1;
    }
  }
  assert.deepEqual(report.metadata.vulnerabilities, { ...counts, total: Object.keys(vulnerabilities).length }, 'Audit summary mismatch');
  return { permitted, low: counts.low, advisory: permitted ? [...accepted].sort().join(',') : 'none' };
}

export function validateRuntimeSource(source) {
  // Conservative literal-specifier guard; also rejects non-import string references.
  // Human source inspection remains necessary for indirect/computed imports.
  const names = [...new Set([...Object.keys(approvedNodes), ...Object.keys(minimatchConsumers)].map((path) => path.split('node_modules/').at(-1)))];
  for (const [, value] of source.matchAll(/['"`]([^'"`\r\n]+)['"`]/g)) {
    assert.ok(!names.some((name) => value === name || value.startsWith(`${name}/`)), 'Build/lint dependency referenced in application source');
  }
}

function validateApplicationSources(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    assert.ok(!entry.isSymbolicLink(), 'Application source symlink requires audit assessment');
    if (entry.isDirectory()) validateApplicationSources(path);
    else if (/\.(?:[cm]?[jt]sx?)$/.test(entry.name)) validateRuntimeSource(readFileSync(path, 'utf8'));
  }
}

function npmJSON(args, acceptedStatuses) {
  const result = spawnSync('npm', args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 120000 });
  assert.ok(!result.error && !result.signal && acceptedStatuses.includes(result.status), 'npm metadata command failed');
  try { return JSON.parse(result.stdout); } catch { throw new Error('Invalid npm JSON response'); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    process.chdir(root);
    validateApplicationSources(resolve(root, 'src'));
    const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
    const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
    const report = npmJSON(['audit', '--json', '--include=dev', '--include=optional', '--include=peer'], [0, 1]);
    const versions = npmJSON(['view', 'braces', 'versions', '--json'], [0]);
    const minimatchVersions = npmJSON(['view', 'minimatch', 'versions', '--json'], [0]);
    // Dry run only: computes what `npm audit fix` would change without touching any file.
    const fixPlan = npmJSON(['audit', 'fix', '--dry-run', '--package-lock-only', '--json', '--include=dev', '--include=optional', '--include=peer'], [0, 1]);
    const result = validateAudit(report, lock, manifest, versions, minimatchVersions, fixPlan);
    console.log(`Full audit policy passed: ${result.permitted} propagated findings; temporary advisory ${result.advisory}; ${result.low} low findings.`);
  } catch (error) {
    // Never print npm stderr, raw JSON, registry credentials, or advisory body text.
    console.error(`Full audit policy failed: ${error instanceof assert.AssertionError ? error.message.split('\n')[0] : 'metadata unavailable or invalid'}`);
    process.exitCode = 1;
  }
}
