import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { safeReturnTo } from '../src/lib/navigation.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const bundle = await build({
  stdin: { contents: "export { default as PersonLink } from './src/components/PersonLink.jsx'; export { default as ContextLink } from './src/components/ContextLink.jsx';", resolveDir: root, sourcefile: 'navigation-fixture.jsx' },
  bundle: true, write: false, format: 'cjs', platform: 'node', packages: 'external', jsx: 'automatic',
  alias: { '@': root + 'src' },
  plugins: [{ name: 'navigation-context-fixture', setup(b) {
    b.onResolve({ filter: /^(next\/link|next\/navigation|@\/context\/AuthContext)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({
      contents: args.path === 'next/link'
        ? "import React from 'react'; export default function Link({ href, children, ...props }) { return React.createElement('a', { href, ...props }, children); }"
        : args.path === 'next/navigation'
          ? 'export const usePathname = () => globalThis.__navFixture.path; export const useSearchParams = () => new URLSearchParams(globalThis.__navFixture.search);'
          : 'export const useAuth = () => ({ role: globalThis.__navFixture.role });',
      loader: 'js', resolveDir: root,
    }));
  } }],
});
const module = { exports: {} };
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(require, module, module.exports);
const { PersonLink, ContextLink } = module.exports;
const id = '00000000-0000-4000-8000-000000000001';
const receiptId = '00000000-0000-4000-8000-000000000002';
function href(Component, props, path, search = '', role = 'admin') {
  globalThis.__navFixture = { path, search, role };
  const html = renderToStaticMarkup(React.createElement(Component, props, 'Record'));
  return html.match(/href="([^"]+)"/)?.[1].replaceAll('&amp;', '&') || null;
}
const list = '/students?status=all_shown&payment=due&page=3&q=Amal';
const profile = href(PersonLink, { id }, '/students', 'status=all_shown&payment=due&page=3&q=Amal');
assert.equal(new URL(profile, 'https://english-hills.local').searchParams.get('returnTo'), list);
const receipt = href(ContextLink, { href: `/receipts/${receiptId}/print` }, `/students/${id}`, new URL(profile, 'https://english-hills.local').searchParams.toString());
assert.equal(new URL(receipt, 'https://english-hills.local').searchParams.get('returnTo'), profile);
assert.equal(safeReturnTo(new URL(receipt, 'https://english-hills.local').searchParams.get('returnTo')), profile);
const finance = href(PersonLink, { id }, '/finance', 'view=unpaid');
assert.equal(new URL(finance, 'https://english-hills.local').searchParams.get('returnTo'), '/finance?view=unpaid');
for (const source of ['/attendance?group=morning', '/assessments?term=Sept%E2%80%93D%C3%A9c', '/activity-log?q=receipt']) {
  const url = new URL(source, 'https://english-hills.local');
  const destination = href(PersonLink, { id }, url.pathname, url.search.slice(1));
  assert.equal(new URL(destination, 'https://english-hills.local').searchParams.get('returnTo'), source);
}
const teacher = href(PersonLink, { kind: 'teacher', id }, '/payroll', 'year=2026');
assert.equal(new URL(teacher, 'https://english-hills.local').searchParams.get('returnTo'), '/payroll?year=2026');
const group = href(ContextLink, { href: `/groups/${id}` }, '/timetable', 'term=Et%C3%A9');
assert.equal(new URL(group, 'https://english-hills.local').searchParams.get('returnTo'), '/timetable?term=Et%C3%A9');
const filteredGroup = href(ContextLink, { href: `/groups/${id}` }, '/groups', 'session=Yearly&level=A1&term=Et%C3%A9');
assert.equal(new URL(filteredGroup, 'https://english-hills.local').searchParams.get('returnTo'), '/groups?session=Yearly&level=A1&term=Et%C3%A9');
assert.equal(href(PersonLink, { id }, '/groups', '', 'teacher'), null);
console.log('Navigation component context and role regressions passed');
