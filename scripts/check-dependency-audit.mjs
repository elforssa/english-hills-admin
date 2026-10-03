import assert from 'node:assert/strict';
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
  const edges = [];
  for (const [from, entry] of Object.entries(lock.packages)) {
    for (const kind of ['dependencies', 'optionalDependencies', 'peerDependencies', ...(from === '' ? ['devDependencies'] : [])]) {
      for (const name of Object.keys(entry[kind] ?? {})) {
        const to = resolveDependency(lock.packages, from, name);
        if (to) edges.push([from, kind, name, to]);
      }
    }
  }
  const ancestors = new Set([node('braces')]);
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
  assert.deepEqual([...ancestors].sort(), ['', ...Object.keys(approvedNodes)].sort(), 'Unapproved braces consumer path');
  assert.deepEqual(sorted(edges.filter((edge) => ancestors.has(edge[3]))), sorted(approvedEdges), 'Braces dependency paths changed');
  for (const [path, version] of Object.entries(approvedNodes)) {
    assert.equal(lock.packages[path]?.version, version, 'Approved tooling version changed');
    assert.equal(lock.packages[path]?.dev, true, 'Braces consumer is not exclusively dev tooling');
    assert.ok(!lock.packages[path]?.link, 'Linked tooling package is not approved');
  }
}

export function validateAudit(report, lock, manifest, publishedBracesVersions) {
  validateToolingPaths(lock, manifest);
  assert.ok(Array.isArray(publishedBracesVersions) && publishedBracesVersions.includes('3.0.3'), 'Invalid registry version metadata');
  assert.ok(publishedBracesVersions.every((version) => typeof version === 'string'), 'Invalid registry version entry');
  // Conservative retirement trigger: a new stable upstream release requires assessment,
  // even if the advisory database has not yet updated its affected range/fix metadata.
  assert.ok(!publishedBracesVersions.some((version) => {
    const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
    return match && (Number(match[1]) > 3 || (Number(match[1]) === 3 && (Number(match[2]) > 0 || Number(match[3]) > 3)));
  }), 'New stable braces release available; reassess and retire the exception');
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
  for (const [name, entry] of Object.entries(vulnerabilities)) {
    assert.ok(object(entry) && entry.name === name && Object.hasOwn(counts, entry.severity), 'Invalid audit vulnerability entry');
    counts[entry.severity] += 1;
    assert.ok(Array.isArray(entry.via) && entry.via.length > 0, 'Missing advisory provenance');
    // Detect exception metadata drift even if npm lowers the aggregate severity.
    const mentionsException = entry.via.some((via) => object(via) && via.url === advisoryURL);
    if (['moderate', 'high', 'critical'].includes(entry.severity) || mentionsException || name === 'braces') {
      check(name);
      permitted += 1;
    }
  }
  assert.deepEqual(report.metadata.vulnerabilities, { ...counts, total: Object.keys(vulnerabilities).length }, 'Audit summary mismatch');
  return { permitted, low: counts.low, advisory: permitted ? 'GHSA-vfj7-8cjw-p6xm' : 'none' };
}

export function validateRuntimeSource(source) {
  // Conservative literal-specifier guard; also rejects non-import string references.
  // Human source inspection remains necessary for indirect/computed imports.
  const names = [...new Set(Object.keys(approvedNodes).map((path) => path.split('node_modules/').at(-1)))];
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
    const result = validateAudit(report, lock, manifest, versions);
    console.log(`Full audit policy passed: ${result.permitted} propagated findings; temporary advisory ${result.advisory}; ${result.low} low findings.`);
  } catch (error) {
    // Never print npm stderr, raw JSON, registry credentials, or advisory body text.
    console.error(`Full audit policy failed: ${error instanceof assert.AssertionError ? error.message.split('\n')[0] : 'metadata unavailable or invalid'}`);
    process.exitCode = 1;
  }
}
