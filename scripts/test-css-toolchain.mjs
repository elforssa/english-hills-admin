// Exercise the actual Tailwind 3 and postcss-nested consumers of the parser override.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const postcss = require('postcss');
const tailwind = require('tailwindcss');
const nested = require('postcss-nested');
const autoprefixer = require('autoprefixer');
const config = require('../tailwind.config.js');
const parser = require('postcss-selector-parser');
const results = {};
// Preserve a pre-override differential baseline only when explicitly requested.
if (!process.env.CSS_BASELINE_WRITE) {
  assert.equal(require('postcss-selector-parser/package.json').version, '7.1.6');
  for (const consumer of ['tailwindcss', 'postcss-nested']) {
    const consumerRequire = createRequire(require.resolve(consumer));
    assert.equal(consumerRequire.resolve('postcss-selector-parser'), require.resolve('postcss-selector-parser'));
  }
}
for (const api of ['className', 'attribute', 'pseudo', 'root', 'selector', 'combinator', 'comment', 'universal']) assert.equal(typeof parser[api], 'function', api);
const unesc = require('postcss-selector-parser/dist/util/unesc');
assert.equal(typeof (unesc.default || unesc), 'function');
const compile = async (css, plugins) => (await postcss(plugins).process(css, { from: undefined })).css;
results.app = await compile(readFileSync('src/app/globals.css', 'utf8'), [tailwind(config), autoprefixer]);
const classes = ['flex', 'grid', 'hidden', 'md:grid', 'hover:bg-primary', 'focus-visible:ring-2', 'dark:bg-background', 'group-hover:text-primary', 'peer-checked:block', 'group-hover:focus:bg-primary', 'group-aria-expanded:block', 'peer-disabled:opacity-50', 'data-[state=open]:animate-in', 'aria-[selected=true]:bg-accent', '[&>svg]:h-4', '[&:is(:hover,:focus)]:text-primary', 'w-[calc(100%-2rem)]', '-translate-x-1/2', 'bg-red-500/50', '!p-4', 'sm:hover:!mt-2', 'rtl:space-x-reverse', 'before:content-["→"]'];
for (const [name, extra] of Object.entries({normal:{}, prefix:{prefix:'eh-',content:[{raw:'eh-flex hover:eh-bg-primary group-hover:eh-text-primary -eh-translate-x-1/2',extension:'html'}]}, important:{important:'#app'}, universal:{important:true}})) {
 const testConfig = {...config, content:[{raw:classes.join(' '),extension:'html'}], ...extra};
 results[name] = await compile('@tailwind base; @tailwind components; @tailwind utilities; ' + (name === 'prefix' ? '.probe { @apply eh-flex eh-p-4; }' : '.probe { @apply flex p-4; }'), [tailwind(testConfig), autoprefixer]);
}
const ast = postcss.parse(results.normal);
const rules = []; ast.walkRules(rule => rules.push(rule));
const generated = new Set();
for (const rule of rules) parser(root => root.walkClasses(node => generated.add(node.value))).processSync(rule.selector);
for (const value of classes) assert(generated.has(value), `Variant was not generated: ${value}`);
function utility(value, property, expected) {
 const rule = rules.find(rule => {
  let found = false; parser(root => root.walkClasses(node => { if (node.value === value) found = true; })).processSync(rule.selector); return found;
 });
 assert(rule, `Missing ${value}`);
 assert(rule.nodes.some(node => node.prop === property && node.value === expected), `${value}: ${property}`);
}
utility('flex','display','flex'); utility('grid','display','grid'); utility('hidden','display','none'); utility('md:grid','display','grid'); utility('!p-4','padding','1rem'); utility('[&>svg]:h-4','height','1rem');
assert(results.normal.includes(':merge') === false, 'group/peer merge placeholders must be expanded');
assert(results.important.includes('#app')); assert(results.prefix.includes('.eh-flex'));
const nestedCases = [
 ['.a, .b { & > .child { color: red } }', ['.a > .child', '.b > .child']],
 ['.a { &:is(:hover, :focus) { color: red } }', ['.a:is(:hover, :focus)']],
 ['.a { .child { color: red } @media (min-width: 768px) { &:hover { color: blue } } }', ['.a .child', '.a:hover']],
 ['.a { & + &, &:not(&) { color: red } }', ['.a + .a', '.a:not(.a)']],
 ['.a { @at-root .outside { color: red } }', ['.outside']],
 ['.a { @supports (display: grid) { & > [data-state="open"] { display:grid } } }', ['.a > [data-state="open"]']],
 ['.escaped\\:name { &::before { content: "x" } }', ['.escaped\\:name::before']],
];
for (const [index, [css, expected]] of nestedCases.entries()) {
 results['nested'+index] = await compile(css,[nested()]);
 const selectors=[]; postcss.parse(results['nested'+index]).walkRules(rule => selectors.push(...rule.selectors)); assert.deepEqual(selectors,expected);
}
if (process.env.CSS_EXTRA_ROOT) {
 const root=process.env.CSS_EXTRA_ROOT;
 results.uiFoundation=await compile(readFileSync(root+'/src/app/globals.css','utf8'),[tailwind({...require(root+'/tailwind.config.js'),content:[root+'/src/**/*.{ts,tsx,js,jsx}']}),autoprefixer]);
}
if (process.env.CSS_BASELINE_WRITE) writeFileSync(process.env.CSS_BASELINE_WRITE,JSON.stringify(results));
if (process.env.CSS_BASELINE_COMPARE) assert.deepEqual(results,JSON.parse(readFileSync(process.env.CSS_BASELINE_COMPARE,'utf8')),'Generated CSS changed from parser 6.1.4 baseline');
console.log(`PASS CSS toolchain: actual app CSS, ${classes.length} utility/variant probes, prefix/important/apply and ${nestedCases.length} nested selector fixtures${results.uiFoundation ? ', UI Foundation CSS' : ''}${process.env.CSS_BASELINE_COMPARE ? '; all CSS byte-identical to 6.1.4' : ''}`);
