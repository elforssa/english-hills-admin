import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateAudit, validateRuntimeSource, advisoryURL, minimatchAdvisoryURL, minimatchAffectedRange } from './check-dependency-audit.mjs';

const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url)));
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
const versions = ['1.0.0', '2.3.2', '3.0.3'];
// minimatch registry on 2026-11-03: the two approved copies, the assessed 10.2.6 (still
// inside the affected range) and the 11.x line that the production Sentry copy uses.
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

// ===== minimatch GHSA-g3hv-75wg-m249: today's report (2026-11-03) is accepted exactly =====
const eslintFix = { name: 'eslint', version: '4.0.0', isSemVerMajor: true };
const nextFix = { name: 'eslint-config-next', version: '0.2.4', isSemVerMajor: true };
const mm = (name, via, fixAvailable = eslintFix, nodes = [node(name)]) => ({ name, severity: 'moderate', via, nodes, fixAvailable });
const minimatchEntries = {
  '@eslint-community/eslint-utils': mm('@eslint-community/eslint-utils', ['eslint']),
  '@eslint/eslintrc': mm('@eslint/eslintrc', ['minimatch']),
  '@humanwhocodes/config-array': mm('@humanwhocodes/config-array', ['minimatch']),
  '@typescript-eslint/eslint-plugin': mm('@typescript-eslint/eslint-plugin', ['@typescript-eslint/parser', '@typescript-eslint/type-utils', '@typescript-eslint/utils', 'eslint'], nextFix),
  '@typescript-eslint/parser': mm('@typescript-eslint/parser', ['@typescript-eslint/typescript-estree', 'eslint'], nextFix),
  '@typescript-eslint/type-utils': mm('@typescript-eslint/type-utils', ['@typescript-eslint/typescript-estree', '@typescript-eslint/utils', 'eslint'], nextFix),
  '@typescript-eslint/typescript-estree': mm('@typescript-eslint/typescript-estree', ['minimatch'], nextFix),
  '@typescript-eslint/utils': mm('@typescript-eslint/utils', ['@eslint-community/eslint-utils', '@typescript-eslint/typescript-estree', 'eslint'], true),
  eslint: mm('eslint', ['@eslint-community/eslint-utils', '@eslint/eslintrc', '@humanwhocodes/config-array', 'file-entry-cache', 'minimatch']),
  'eslint-config-next': mm('eslint-config-next', ['@typescript-eslint/eslint-plugin', 'eslint', 'eslint-plugin-import', 'eslint-plugin-jsx-a11y', 'eslint-plugin-react'], nextFix),
  'eslint-plugin-import': mm('eslint-plugin-import', ['minimatch'], nextFix),
  'eslint-plugin-jsx-a11y': mm('eslint-plugin-jsx-a11y', ['minimatch'], nextFix),
  'eslint-plugin-react': mm('eslint-plugin-react', ['minimatch'], true),
  'file-entry-cache': mm('file-entry-cache', ['flat-cache']),
  'flat-cache': mm('flat-cache', ['rimraf']),
  glob: mm('glob', ['minimatch'], eslintFix, [node('rimraf/node_modules/glob')]),
  minimatch: mm('minimatch', [{ name: 'minimatch', dependency: 'minimatch', url: minimatchAdvisoryURL, severity: 'moderate', range: minimatchAffectedRange }], eslintFix,
    [node('@typescript-eslint/typescript-estree/node_modules/minimatch'), node('minimatch')]),
  rimraf: mm('rimraf', ['glob']),
};
const minimatchReport = {
  auditReportVersion: 2,
  vulnerabilities: minimatchEntries,
  metadata: { vulnerabilities: { info: 0, low: 0, moderate: 18, high: 0, critical: 0, total: 18 } },
};
assert.equal(check(minimatchReport).permitted, 18);
assert.equal(check(minimatchReport).advisory, 'GHSA-g3hv-75wg-m249');
// npm moves its bare `true` between propagated entries from run to run; any of them is
// accepted while the dry-run fix plan is empty.
const movedBoolean = structuredClone(minimatchReport);
movedBoolean.vulnerabilities['eslint-plugin-react'].fixAvailable = nextFix;
movedBoolean.vulnerabilities['eslint-plugin-import'].fixAvailable = true;
movedBoolean.vulnerabilities.eslint.fixAvailable = true;
assert.equal(check(movedBoolean).permitted, 18);
const rejectMinimatch = (description, mutate) => reject(description, mutate, minimatchReport);
rejectMinimatch('production minimatch node in the report', ({ report: r }) => { r.vulnerabilities.minimatch.nodes.push(node('@sentry/bundler-plugins/node_modules/minimatch')); });
rejectMinimatch('production copy inside the affected range', ({ lock: l }) => { l.packages[node('@sentry/bundler-plugins/node_modules/minimatch')].version = '10.2.6'; });
rejectMinimatch('approved copy reclassified as runtime', ({ lock: l }) => { delete l.packages[node('minimatch')].dev; });
rejectMinimatch('consumer reclassified as runtime', ({ lock: l }) => { delete l.packages[node('eslint')].dev; });
rejectMinimatch('extra audit node', ({ report: r }) => { r.vulnerabilities.eslint.nodes.push(node('other/node_modules/eslint')); });
rejectMinimatch('extra affected installation', ({ lock: l }) => { l.packages[node('other/node_modules/minimatch')] = { version: '9.0.5', dev: true }; });
rejectMinimatch('new runtime consumer', ({ lock: l }) => { l.packages[node('next')].dependencies.minimatch = '^3.1.5'; });
rejectMinimatch('new dev consumer', ({ lock: l }) => { l.packages[node('tailwindcss')].dependencies.minimatch = '^3.1.5'; });
rejectMinimatch('unapproved consumer in the report', ({ report: r }) => { r.vulnerabilities.tailwindcss = mm('tailwindcss', ['minimatch']); r.metadata.vulnerabilities.moderate = 19; r.metadata.vulnerabilities.total = 19; });
rejectMinimatch('advisory severity change', ({ report: r }) => { r.vulnerabilities.minimatch.via[0].severity = 'high'; });
rejectMinimatch('aggregate severity change', ({ report: r }) => { r.vulnerabilities.minimatch.severity = 'high'; r.metadata.vulnerabilities.moderate = 17; r.metadata.vulnerabilities.high = 1; });
rejectMinimatch('affected range change', ({ report: r }) => { r.vulnerabilities.minimatch.via[0].range = '<11.0.2'; });
rejectMinimatch('other advisory on the same package', ({ report: r }) => { r.vulnerabilities.minimatch.via.push({ name: 'minimatch', dependency: 'minimatch', url: 'https://github.com/advisories/GHSA-other', severity: 'moderate', range: '<12' }); });
rejectMinimatch('other advisory package', ({ report: r }) => { r.vulnerabilities.minimatch.via[0].dependency = 'other'; });
rejectMinimatch('compatible fix', ({ report: r }) => { r.vulnerabilities.eslint.fixAvailable = { name: 'eslint', version: '8.57.2', isSemVerMajor: false }; });
rejectMinimatch('boolean fix on the advisory root', ({ report: r }) => { r.vulnerabilities.minimatch.fixAvailable = true; });
rejectMinimatch('boolean fix with a non-empty fix plan', ({ fixPlan: f }) => { f.changed = 1; });
rejectMinimatch('boolean fix with an invalid fix plan', (inputs) => { inputs.fixPlan = { added: 0, removed: 0, changed: 0 }; });
rejectMinimatch('unassessed major fix metadata', ({ report: r }) => { r.vulnerabilities.eslint.fixAvailable = { name: 'eslint', version: '9.0.0', isSemVerMajor: true }; });
rejectMinimatch('approved tooling version changed', ({ lock: l }) => { l.packages[node('eslint')].version = '8.57.2'; });
rejectMinimatch('approved copy version changed', ({ lock: l }) => { l.packages[node('minimatch')].version = '3.1.4'; });
rejectMinimatch('registry failure', (inputs) => { inputs.minimatchVersions = {}; });
rejectMinimatch('registry without the approved copies', (inputs) => { inputs.minimatchVersions = ['11.0.4']; });
rejectMinimatch('entry reaching both advisories', ({ report: r }) => { r.vulnerabilities.braces = structuredClone(report.vulnerabilities.braces); r.vulnerabilities.eslint.via.push('braces'); r.metadata.vulnerabilities.high = 1; r.metadata.vulnerabilities.total = 19; });
for (const source of ["import { ESLint } from 'eslint';", 'require("minimatch")', "import rimraf from 'rimraf';"]) {
  assert.throws(() => validateRuntimeSource(source));
}
const minimatchVersionCases = [
  ['10.2.6', 'accepted'],
  ['11.0.5', 'accepted'],
  ['12.0.0', 'accepted'],
  ['3.1.6-rc.1', 'accepted'],
  ['10.2.7-beta.1', 'accepted'],
  ['3.1.6', 'blocked'],
  ['3.2.0', 'blocked'],
  ['10.2.7', 'blocked'],
  ['10.3.0', 'blocked'],
  ['not-a-version', 'invalid'],
];
for (const [version, expected] of minimatchVersionCases) {
  const registry = [...minimatchVersions, version];
  if (expected === 'accepted') {
    assert.equal(check(minimatchReport, lock, manifest, versions, registry).permitted, 18, version);
  } else {
    assert.throws(() => check(minimatchReport, lock, manifest, versions, registry),
      expected === 'invalid' ? /Invalid minimatch registry SemVer entry/ : /New stable minimatch release available/, version);
  }
  console.log(`PASS minimatch registry version ${version}: ${expected}`);
}
console.log('Minimatch exception: today\'s dev-only report accepted; production nodes, new consumers, severity/range/fix drift, other advisories and new stable releases rejected.');
