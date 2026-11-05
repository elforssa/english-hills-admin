import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateAudit, validateRuntimeSource, advisoryURL, minimatchAdvisoryURL, minimatchAffectedRange } from './check-dependency-audit.mjs';

const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url)));
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
const versions = ['1.0.0', '2.3.2', '3.0.3'];
// minimatch registry on 2026-11-03: 3.1.5 (outside the range since 2026-11-05), the approved
// 10.2.5, the assessed 10.2.6 (still inside the range) and the production Sentry 11.x line.
const minimatchVersions = ['3.1.5', '10.2.5', '10.2.6', '11.0.0', '11.0.1', '11.0.4'];
// `npm audit fix --dry-run --package-lock-only --json` on 2026-11-03: nothing to change.
const fixPlan = { added: 0, removed: 0, changed: 0, audited: 868, funding: 192, audit: { auditReportVersion: 2 } };
const node = (name) => `node_modules/${name}`;
const makeEntry = (name, via, nodes = [node(name)]) => ({
  name, severity: 'high', via, nodes, fixAvailable: false,
});
const report = {
  auditReportVersion: 2,
  vulnerabilities: {
    braces: makeEntry('braces', [{ name: 'braces', dependency: 'braces', url: advisoryURL, severity: 'high', range: '<=3.0.3' }]),
    chokidar: makeEntry('chokidar', ['braces']),
    micromatch: makeEntry('micromatch', ['braces']),
    'fast-glob': makeEntry('fast-glob', ['micromatch'], [node('fast-glob'), node('@next/eslint-plugin-next/node_modules/fast-glob')]),
    '@next/eslint-plugin-next': makeEntry('@next/eslint-plugin-next', ['fast-glob']),
    'eslint-config-next': makeEntry('eslint-config-next', ['@next/eslint-plugin-next']),
    tailwindcss: makeEntry('tailwindcss', ['chokidar', 'fast-glob', 'micromatch']),
  },
  metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 7, critical: 0, total: 7 } },
};
const check = (r = report, l = lock, m = manifest, v = versions, mv = minimatchVersions, plan = fixPlan) => validateAudit(r, l, m, v, mv, plan);
assert.equal(check().permitted, 7);
assert.equal(check().advisory, 'GHSA-vfj7-8cjw-p6xm');
const reject = (description, mutate, base = report) => {
  const inputs = structuredClone({ report: base, lock, manifest, versions, minimatchVersions, fixPlan });
  mutate(inputs);
  assert.throws(() => check(inputs.report, inputs.lock, inputs.manifest, inputs.versions, inputs.minimatchVersions, inputs.fixPlan), undefined, description);
};
reject('other high advisory in existing chain', ({ report: r }) => { r.vulnerabilities.braces.via.push({ name: 'braces', url: 'https://github.com/advisories/GHSA-other', severity: 'high' }); });
reject('unrelated moderate dev advisory', ({ report: r }) => { r.vulnerabilities.eslint = { name: 'eslint', severity: 'moderate', nodes: [node('eslint')], via: [{ name: 'eslint', url: 'https://github.com/advisories/GHSA-other', severity: 'moderate' }] }; });
reject('exception package change', ({ report: r }) => { r.vulnerabilities.braces.via[0].dependency = 'other'; });
reject('exception severity change', ({ report: r }) => { r.vulnerabilities.braces.via[0].severity = 'critical'; });
reject('aggregate severity change', ({ report: r }) => { r.vulnerabilities.braces.severity = 'low'; });
reject('affected range change', ({ report: r }) => { r.vulnerabilities.braces.via[0].range = '<=3.0.4'; });
reject('audit node change', ({ report: r }) => { r.vulnerabilities.braces.nodes.push(node('other/node_modules/braces')); });
reject('compatible fix', ({ report: r }) => { r.vulnerabilities.tailwindcss.fixAvailable = { name: 'tailwindcss', version: '3.4.20', isSemVerMajor: false }; });
reject('boolean fix', ({ report: r }) => { r.vulnerabilities.braces.fixAvailable = true; });
reject('published stable patch before advisory catches up', ({ versions: v }) => { v.push('3.0.4'); });
reject('registry failure', (inputs) => { inputs.versions = {}; });
reject('audit error', ({ report: r }) => { r.error = { code: 'failure' }; });
reject('unsupported report', ({ report: r }) => { r.auditReportVersion = 3; });
reject('incomplete report', ({ report: r }) => { delete r.vulnerabilities; });
reject('summary mismatch', ({ report: r }) => { r.metadata.vulnerabilities.high = 0; });
reject('missing provenance', ({ report: r }) => { r.vulnerabilities.braces.via = []; });
reject('cyclic provenance', ({ report: r }) => { r.vulnerabilities.braces.via = ['tailwindcss']; });
reject('unknown provenance', ({ report: r }) => { r.vulnerabilities.braces.via = ['missing']; });
reject('runtime classification', ({ lock: l }) => { delete l.packages[node('braces')].dev; });
reject('additional runtime consumer despite dev flag', ({ lock: l }) => { l.packages[node('next')].dependencies.braces = '^3.0.3'; });
reject('new dev consumer', ({ lock: l }) => { l.packages[node('eslint')].dependencies.braces = '^3.0.3'; });
reject('move plugin back to production', ({ lock: l, manifest: m }) => {
  for (const root of [l.packages[''], m]) {
    root.dependencies['tailwindcss-animate'] = root.devDependencies['tailwindcss-animate'];
    delete root.devDependencies['tailwindcss-animate'];
  }
});
reject('lock/manifest inconsistency', ({ manifest: m }) => { m.dependencies.braces = '^3.0.3'; });
const clean = structuredClone(report);
clean.vulnerabilities = {};
clean.metadata.vulnerabilities = { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 };
assert.equal(check(clean).permitted, 0);
const low = structuredClone(clean);
low.vulnerabilities.dompurify = { name: 'dompurify', severity: 'low', via: [{ name: 'dompurify', url: 'https://github.com/advisories/GHSA-example', severity: 'low' }] };
low.metadata.vulnerabilities.low = 1;
low.metadata.vulnerabilities.total = 1;
assert.equal(check(low).low, 1);

for (const source of ["import plugin from 'tailwindcss-animate';", 'require("braces")', 'import(`micromatch`)', "import 'tailwindcss/lib/index.js';"]) {
  assert.throws(() => validateRuntimeSource(source));
}
validateRuntimeSource("import jsPDF from 'jspdf'; import './globals.css';");

const majorSuggestions = structuredClone(report);
majorSuggestions.vulnerabilities.braces.fixAvailable = { name: 'tailwindcss', version: '4.3.3', isSemVerMajor: true };
majorSuggestions.vulnerabilities['eslint-config-next'].fixAvailable = { name: 'eslint-config-next', version: '14.2.35', isSemVerMajor: true };
assert.equal(check(majorSuggestions).permitted, 7);
reject('unassessed major fix metadata', ({ report: r }) => { r.vulnerabilities.braces.fixAvailable = { name: 'braces', version: '4.0.0', isSemVerMajor: true }; });

reject('additional nested braces installation', ({ lock: l }) => { l.packages[node('other/node_modules/braces')] = { version: '3.0.3', dev: true }; });

const versionCases = [
  ['3.0.3', 'accepted'],
  ['3.0.3+build.1', 'accepted'],
  ['3.0.4', 'blocked'],
  ['3.0.4+build.1', 'blocked'],
  ['3.1.0', 'blocked'],
  ['4.0.0', 'blocked'],
  ['3.0.4-rc.1', 'accepted'],
  ['4.0.0-beta.1', 'accepted'],
  ['not-a-version', 'invalid'],
];
for (const [version, expected] of versionCases) {
  const registryVersions = [...versions, version];
  if (expected === 'accepted') {
    assert.equal(check(report, lock, manifest, registryVersions).permitted, 7, version);
  } else {
    assert.throws(() => check(report, lock, manifest, registryVersions),
      expected === 'invalid' ? /Invalid registry SemVer entry/ : /New stable braces release available/, version);
  }
  console.log(`PASS registry version ${version}: ${expected}`);
}
// Validate the entire list even when an earlier entry would already retire the exception.
assert.throws(() => check(report, lock, manifest, [...versions, '3.0.4', 'not-a-version']), /Invalid registry SemVer entry/);
console.log('Audit policy: exact advisory accepted; new advisories, path/classification drift, compatible fixes, release drift and invalid metadata rejected.');

// ===== minimatch GHSA-g3hv-75wg-m249, narrowed 2026-11-05 to >=7.0.0 <11.0.1 =====
// npm's report on 2026-11-05: only the typescript-eslint chain reaches the one affected
// copy (10.2.5); minimatch 3.1.5 under ESLint 8 / rimraf is outside the new range.
const nextFix = { name: 'eslint-config-next', version: '0.2.4', isSemVerMajor: true };
const mm = (name, via, fixAvailable = true, nodes = [node(name)]) => ({ name, severity: 'moderate', via, nodes, fixAvailable });
const minimatchEntries = {
  '@typescript-eslint/eslint-plugin': mm('@typescript-eslint/eslint-plugin', ['@typescript-eslint/parser', '@typescript-eslint/type-utils', '@typescript-eslint/utils']),
  '@typescript-eslint/parser': mm('@typescript-eslint/parser', ['@typescript-eslint/typescript-estree']),
  '@typescript-eslint/type-utils': mm('@typescript-eslint/type-utils', ['@typescript-eslint/typescript-estree', '@typescript-eslint/utils']),
  '@typescript-eslint/typescript-estree': mm('@typescript-eslint/typescript-estree', ['minimatch']),
  '@typescript-eslint/utils': mm('@typescript-eslint/utils', ['@typescript-eslint/typescript-estree']),
  minimatch: mm('minimatch', [{ name: 'minimatch', dependency: 'minimatch', url: minimatchAdvisoryURL, severity: 'moderate', range: minimatchAffectedRange }], nextFix,
    [node('@typescript-eslint/typescript-estree/node_modules/minimatch')]),
};
const minimatchReport = {
  auditReportVersion: 2,
  vulnerabilities: minimatchEntries,
  metadata: { vulnerabilities: { info: 0, low: 0, moderate: 6, high: 0, critical: 0, total: 6 } },
};
assert.equal(minimatchAffectedRange, '>=7.0.0 <11.0.1');
assert.equal(check(minimatchReport).permitted, 6);
assert.equal(check(minimatchReport).advisory, 'GHSA-g3hv-75wg-m249');
// npm's propagated entries carry a bare `true` or a downgrade of the dev root; either is
// accepted while the dry-run fix plan is empty.
const mixedFix = structuredClone(minimatchReport);
mixedFix.vulnerabilities['@typescript-eslint/parser'].fixAvailable = nextFix;
mixedFix.vulnerabilities['@typescript-eslint/utils'].fixAvailable = { name: 'eslint-config-next', version: '12.0.4', isSemVerMajor: true };
assert.equal(check(mixedFix).permitted, 6);
const rejectMinimatch = (description, mutate) => reject(description, mutate, minimatchReport);
// The narrowing itself: the former 3.1.5 node, a former consumer or the old range fail.
rejectMinimatch('former 3.1.5 node in the report', ({ report: r }) => { r.vulnerabilities.minimatch.nodes.push(node('minimatch')); });
rejectMinimatch('former consumer in the report', ({ report: r }) => { r.vulnerabilities.eslint = mm('eslint', ['minimatch']); r.metadata.vulnerabilities.moderate = 7; r.metadata.vulnerabilities.total = 7; });
rejectMinimatch('former range', ({ report: r }) => { r.vulnerabilities.minimatch.via[0].range = '<11.0.1'; });
rejectMinimatch('3.1.5 copy moved back inside the range', ({ lock: l }) => { l.packages[node('minimatch')].version = '7.4.9'; });
rejectMinimatch('production minimatch node in the report', ({ report: r }) => { r.vulnerabilities.minimatch.nodes.push(node('@sentry/bundler-plugins/node_modules/minimatch')); });
rejectMinimatch('production copy inside the affected range', ({ lock: l }) => { l.packages[node('@sentry/bundler-plugins/node_modules/minimatch')].version = '10.2.6'; });
rejectMinimatch('approved copy reclassified as runtime', ({ lock: l }) => { delete l.packages[node('@typescript-eslint/typescript-estree/node_modules/minimatch')].dev; });
rejectMinimatch('consumer reclassified as runtime', ({ lock: l }) => { delete l.packages[node('@typescript-eslint/parser')].dev; });
rejectMinimatch('extra audit node', ({ report: r }) => { r.vulnerabilities['@typescript-eslint/parser'].nodes.push(node('other/node_modules/@typescript-eslint/parser')); });
rejectMinimatch('extra affected installation', ({ lock: l }) => { l.packages[node('other/node_modules/minimatch')] = { version: '9.0.5', dev: true }; });
rejectMinimatch('new runtime consumer', ({ lock: l }) => { l.packages[node('next')].dependencies['@typescript-eslint/typescript-estree'] = '^8.59.3'; });
rejectMinimatch('new dev consumer', ({ lock: l }) => { l.packages[node('tailwindcss')].dependencies['@typescript-eslint/parser'] = '^8.59.3'; });
rejectMinimatch('unapproved consumer in the report', ({ report: r }) => { r.vulnerabilities.tailwindcss = mm('tailwindcss', ['minimatch']); r.metadata.vulnerabilities.moderate = 7; r.metadata.vulnerabilities.total = 7; });
rejectMinimatch('advisory severity change', ({ report: r }) => { r.vulnerabilities.minimatch.via[0].severity = 'high'; });
rejectMinimatch('aggregate severity change', ({ report: r }) => { r.vulnerabilities.minimatch.severity = 'high'; r.metadata.vulnerabilities.moderate = 5; r.metadata.vulnerabilities.high = 1; });
rejectMinimatch('affected range change', ({ report: r }) => { r.vulnerabilities.minimatch.via[0].range = '>=7.0.0 <11.0.2'; });
rejectMinimatch('other advisory on the same package', ({ report: r }) => { r.vulnerabilities.minimatch.via.push({ name: 'minimatch', dependency: 'minimatch', url: 'https://github.com/advisories/GHSA-other', severity: 'moderate', range: '<12' }); });
rejectMinimatch('other advisory package', ({ report: r }) => { r.vulnerabilities.minimatch.via[0].dependency = 'other'; });
rejectMinimatch('compatible fix', ({ report: r }) => { r.vulnerabilities['@typescript-eslint/parser'].fixAvailable = { name: 'eslint-config-next', version: '15.5.25', isSemVerMajor: false }; });
// 2026-11-05 (owner-approved): npm's bare `true` on the advisory root itself is accepted
// only while the dry-run fix plan is empty, as on its consumers; any planned change fails.
const rootBoolean = structuredClone(minimatchReport);
rootBoolean.vulnerabilities.minimatch.fixAvailable = true;
assert.equal(check(rootBoolean).permitted, 6, 'root boolean with an empty fix plan');
for (const count of ['added', 'removed', 'changed']) {
  assert.throws(() => check(rootBoolean, lock, manifest, versions, minimatchVersions, { ...fixPlan, [count]: 1 }),
    /Compatible minimatch advisory fix available; remove exception/, `root boolean with a planned ${count}`);
}
assert.throws(() => check(rootBoolean, lock, manifest, versions, minimatchVersions, { added: 0, removed: 0, changed: 0 }), /Invalid npm fix plan/, 'root boolean with an invalid fix plan');
assert.throws(() => check(rootBoolean, lock, manifest, versions, minimatchVersions, null), /Invalid npm fix plan/, 'root boolean without a fix plan');
rejectMinimatch('root fix metadata naming a compatible minimatch', ({ report: r }) => { r.vulnerabilities.minimatch.fixAvailable = { name: 'minimatch', version: '10.2.7', isSemVerMajor: false }; });
rejectMinimatch('boolean fix with a non-empty fix plan', ({ fixPlan: f }) => { f.changed = 1; });
rejectMinimatch('boolean fix with an invalid fix plan', (inputs) => { inputs.fixPlan = { added: 0, removed: 0, changed: 0 }; });
for (const fix of [{ name: 'eslint-config-next', version: '15.6.0', isSemVerMajor: true }, { name: 'eslint-config-next', version: '16.0.0', isSemVerMajor: true },
  { name: 'eslint', version: '4.0.0', isSemVerMajor: true }, { name: 'minimatch', version: '11.0.4', isSemVerMajor: true }, { name: 'eslint-config-next', version: 'not-a-version', isSemVerMajor: true },
  { name: 'eslint-config-next', version: '12.0.4', isSemVerMajor: false }, { name: 'eslint-config-next', isSemVerMajor: true }]) {
  rejectMinimatch(`fix metadata ${fix.name} ${fix.version} ${fix.isSemVerMajor}`, ({ report: r }) => { r.vulnerabilities['@typescript-eslint/parser'].fixAvailable = fix; });
}
rejectMinimatch('approved tooling version changed', ({ lock: l }) => { l.packages[node('@typescript-eslint/parser')].version = '8.59.4'; });
rejectMinimatch('approved copy version changed', ({ lock: l }) => { l.packages[node('@typescript-eslint/typescript-estree/node_modules/minimatch')].version = '10.2.4'; });
rejectMinimatch('registry failure', (inputs) => { inputs.minimatchVersions = {}; });
rejectMinimatch('registry without the approved copy', (inputs) => { inputs.minimatchVersions = ['3.1.5', '11.0.4']; });
rejectMinimatch('entry reaching both advisories', ({ report: r }) => { r.vulnerabilities.braces = structuredClone(report.vulnerabilities.braces); r.vulnerabilities['@typescript-eslint/parser'].via.push('braces'); r.metadata.vulnerabilities.high = 1; r.metadata.vulnerabilities.total = 7; });
for (const source of ["import { parse } from '@typescript-eslint/parser';", 'require("minimatch")', "import next from 'eslint-config-next';"]) {
  assert.throws(() => validateRuntimeSource(source));
}
const minimatchVersionCases = [
  ['10.2.6', 'accepted'],
  ['11.0.5', 'accepted'],
  ['12.0.0', 'accepted'],
  ['3.1.6', 'accepted'],
  ['10.2.7-beta.1', 'accepted'],
  ['10.2.7', 'blocked'],
  ['10.3.0', 'blocked'],
  ['not-a-version', 'invalid'],
];
for (const [version, expected] of minimatchVersionCases) {
  const registry = [...minimatchVersions, version];
  if (expected === 'accepted') {
    assert.equal(check(minimatchReport, lock, manifest, versions, registry).permitted, 6, version);
  } else {
    assert.throws(() => check(minimatchReport, lock, manifest, versions, registry),
      expected === 'invalid' ? /Invalid minimatch registry SemVer entry/ : /New stable minimatch release available/, version);
  }
  console.log(`PASS minimatch registry version ${version}: ${expected}`);
}
console.log('Minimatch exception: today\'s dev-only report accepted; the former 3.1.5 node and consumers, production nodes, new consumers, severity/range/fix drift, other advisories and new stable 10.x releases rejected.');
