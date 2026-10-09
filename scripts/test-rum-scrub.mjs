// Speed Insights privacy filter: no query, fragment or record ID leaves the browser,
// in either the event URL or its route.
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { scrubRoute, scrubVitalEvent } from '../src/lib/rumScrub.mjs';

const origin = 'https://admin.english-hills.com';
const uuid = '3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b';
const urlCases = [
  [`${origin}/crm/leads?lead=${uuid}&q=Amal%20Bennani`, `${origin}/crm/leads`],
  [`${origin}/students/${uuid}`, `${origin}/students/[id]`],
  [`${origin}/receipts/${uuid.toUpperCase()}/print#top`, `${origin}/receipts/[id]/print`],
  [`${origin}/finance/charges/12345/edit`, `${origin}/finance/charges/[id]/edit`],
  [`${origin}/receipts?q=0612345678&page=2`, `${origin}/receipts`],
  [`${origin}/`, `${origin}/`],
  [`${origin}/teachers/new`, `${origin}/teachers/new`],
  // Only whole segments are IDs: a segment that merely contains digits is kept.
  [`${origin}/a1`, `${origin}/a1`],
];
for (const [input, expected] of urlCases) {
  const event = { type: 'vital', url: input, route: '/students/[id]' };
  const scrubbed = scrubVitalEvent(event);
  assert.equal(scrubbed.url, expected, input);
  assert.equal(scrubbed.type, 'vital');
  assert.equal(scrubbed.route, '/students/[id]', 'a route pattern is kept');
  assert.ok(!scrubbed.url.includes('?') && !scrubbed.url.includes('#'));
}

// The Next.js wrapper falls back to the raw pathname when it cannot map params, so
// the route is scrubbed like the URL path.
const routeCases = [
  [`/students/${uuid}`, '/students/[id]'],
  [`/receipts/${uuid.toUpperCase()}/print`, '/receipts/[id]/print'],
  ['/finance/charges/12345/edit', '/finance/charges/[id]/edit'],
  [`/no-such-page/${uuid}/details`, '/no-such-page/[id]/details'],
  [`/crm/leads?lead=${uuid}&q=test#drawer`, '/crm/leads'],
  [`/students/${uuid}#notes`, '/students/[id]'],
  [`${origin}/groups/42?tab=members`, '/groups/[id]'],
  ['/a1', '/a1'],
  ['/students/[id]', '/students/[id]'],
  ['/', '/'],
];
for (const [route, expected] of routeCases) {
  assert.equal(scrubRoute(route), expected, route);
  const scrubbed = scrubVitalEvent({ type: 'vital', url: `${origin}/dashboard`, route });
  assert.equal(scrubbed.route, expected, 'event route: ' + route);
  assert.ok(!scrubbed.route.includes('?') && !scrubbed.route.includes('#') && !scrubbed.route.includes(uuid));
}
for (const absent of [undefined, null]) {
  const scrubbed = scrubVitalEvent({ type: 'vital', url: `${origin}/dashboard`, route: absent });
  assert.equal(scrubbed.route, absent, 'an absent route stays absent');
}
for (const badRoute of [42, {}, '', 'students/x', 'javascript:alert(1)']) {
  assert.equal(scrubVitalEvent({ type: 'vital', url: `${origin}/dashboard`, route: badRoute }), null, 'unparseable route drops the event: ' + JSON.stringify(badRoute));
}
for (const notPath of [null, undefined, 42]) {
  assert.equal(scrubRoute(notPath), null, 'no explicit route without a pathname: ' + notPath);
}

for (const bad of [undefined, null, {}, { url: 'not a url' }, { url: 'javascript:alert(1)' }, { url: 'data:text/plain,x' }]) {
  assert.equal(scrubVitalEvent(bad), null, 'unparseable or non-web URL is dropped: ' + JSON.stringify(bad));
}

// The scrub is a denylist of ID shapes, sound only while every dynamic route segment
// is an [id] holding a UUID or number. A new dynamic segment needs its own review.
const dynamic = [];
const walk = dir => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('[')) dynamic.push(entry.name);
    walk(dir + '/' + entry.name);
  }
};
walk(fileURLToPath(new URL('../src/app', import.meta.url)));
assert.ok(dynamic.length > 0, 'dynamic segments found');
assert.deepEqual([...new Set(dynamic)], ['[id]'], 'every dynamic app segment is [id]; review the RUM scrub before adding another: ' + dynamic.join(', '));

console.log(`PASS Speed Insights privacy filter (${urlCases.length} URLs, ${routeCases.length} routes, ${dynamic.length} [id] segments, dropped inputs)`);
