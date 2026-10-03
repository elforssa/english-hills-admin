import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateAudit, validateRuntimeSource, advisoryURL } from './check-dependency-audit.mjs';

const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url)));
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
const versions = ['1.0.0', '2.3.2', '3.0.3'];
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
const check = (r = report, l = lock, m = manifest, v = versions) => validateAudit(r, l, m, v);
assert.equal(check().permitted, 7);
const reject = (description, mutate) => {
  const inputs = structuredClone({ report, lock, manifest, versions });
  mutate(inputs);
  assert.throws(() => check(inputs.report, inputs.lock, inputs.manifest, inputs.versions), undefined, description);
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

console.log('Audit policy: exact advisory accepted; new advisories, path/classification drift, compatible fixes, release drift and invalid metadata rejected.');
