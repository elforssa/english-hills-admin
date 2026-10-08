// Speed Insights privacy filter: no query, fragment or record ID leaves the browser.
import assert from 'node:assert/strict';
import { scrubVitalEvent } from '../src/lib/rumScrub.mjs';

const origin = 'https://admin.english-hills.com';
const uuid = '3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b';
const cases = [
  [`${origin}/crm/leads?lead=${uuid}&q=Amal%20Bennani`, `${origin}/crm/leads`],
  [`${origin}/students/${uuid}`, `${origin}/students/[id]`],
  [`${origin}/receipts/${uuid.toUpperCase()}/print#top`, `${origin}/receipts/[id]/print`],
  [`${origin}/finance/charges/12345/edit`, `${origin}/finance/charges/[id]/edit`],
  [`${origin}/receipts?q=0612345678&page=2`, `${origin}/receipts`],
  [`${origin}/`, `${origin}/`],
  [`${origin}/teachers/new`, `${origin}/teachers/new`],
];
for (const [input, expected] of cases) {
  const event = { type: 'vital', url: input, route: '/students/[id]' };
  const scrubbed = scrubVitalEvent(event);
  assert.equal(scrubbed.url, expected, input);
  assert.equal(scrubbed.type, 'vital');
  assert.equal(scrubbed.route, '/students/[id]', 'route pattern is kept');
  assert.ok(!scrubbed.url.includes('?') && !scrubbed.url.includes('#'));
}
for (const bad of [undefined, null, {}, { url: 'not a url' }, { url: 'javascript:alert(1)' }, { url: 'data:text/plain,x' }]) {
  assert.equal(scrubVitalEvent(bad), null, 'unparseable or non-web URL is dropped: ' + JSON.stringify(bad));
}
console.log(`PASS Speed Insights privacy filter (${cases.length} URLs, 6 dropped inputs)`);
