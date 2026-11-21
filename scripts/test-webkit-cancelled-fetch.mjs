#!/usr/bin/env node
// The shared WebKit cancelled-fetch rule (scripts/lib/webkit-cancelled-fetch.mjs), fed synthetic
// page events with a fake clock (independent review of PR #204, B1). A real cross-origin failure
// must fail the run; only an exact-URL cancellation in the same short window, or a prefetch / REST
// read just before a new document, is excused.
import assert from 'node:assert/strict';
import { cancelledFetches, reportedUrl } from './lib/webkit-cancelled-fetch.mjs';

const API = 'http://127.0.0.1:54321', APP = 'http://127.0.0.1:3101';
function harness() {
  let t = 1_000_000;
  const handlers = {};
  const page = { on: (event, fn) => { (handlers[event] ||= []).push(fn); } };
  const emit = (event, value) => (handlers[event] || []).forEach(fn => fn(value));
  const fetches = cancelledFetches(page, { now: () => t });
  return {
    fetches,
    at: ms => { t = 1_000_000 + ms; },
    cancel: url => emit('requestfailed', { url: () => url, failure: () => ({ errorText: 'cancelled' }) }),
    fail: url => emit('requestfailed', { url: () => url, failure: () => ({ errorText: 'net::ERR_FAILED' }) }),
    load: () => emit('domcontentloaded'),
    // Playwright splits WebKit's text at the scheme: name '… http', message '://host/path … checks.'
    error: (url, label) => fetches.take({ name: 'Fetch API cannot load http', message: url.replace(/^http/, '').replace(/^:/, '') + ' due to access control checks.' }, label),
  };
}
let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log(`  ok ${name}`); };

check('the URL is read from the message', () => {
  assert.equal(reportedUrl('//127.0.0.1:54321/rest/v1/groups?select=id due to access control checks.'), '127.0.0.1:54321/rest/v1/groups?select=id');
  assert.equal(reportedUrl('/127.0.0.1:54321/rest/v1/rpc/x due to access control checks.'), '127.0.0.1:54321/rest/v1/rpc/x');
  assert.equal(reportedUrl('anything else'), null);
});

check('another page error is not taken', () => {
  const h = harness();
  assert.equal(h.fetches.take({ name: 'TypeError', message: 'x is undefined' }), false);
  assert.equal(h.fetches.take({ name: 'Fetch API cannot load http', message: '//a/b due to CORS policy.' }), false);
  assert.equal(h.fetches.count, 0);
});

check('a cancellation of the exact URL in the same window is excused', () => {
  const h = harness();
  h.at(0); h.cancel(`${API}/rest/v1/groups?select=id`);
  h.at(300); assert.equal(h.error(`${API}/rest/v1/groups?select=id`, 'groups'), true);
  assert.deepEqual(h.fetches.uncancelled(), []);
});

check('a real CORS failure (different URL, outside every window) fails the run', () => {
  const h = harness();
  h.at(0); h.cancel(`${API}/rest/v1/students?select=id`); h.load();
  h.at(10_000); h.error(`${API}/rest/v1/rpc/get_dashboard_counts`, 'real CORS failure');
  assert.deepEqual(h.fetches.uncancelled(), ['real CORS failure']);
});

check('a cancellation of the same URL 4 s earlier does not excuse it', () => {
  const h = harness();
  h.at(0); h.cancel(`${APP}/students?_rsc=abc`);
  h.at(4000); h.error(`${APP}/students?_rsc=abc`, 'late');
  assert.deepEqual(h.fetches.uncancelled(), ['late']);
});

check('a cancelled prefix does not excuse a longer URL', () => {
  const h = harness();
  h.at(0); h.cancel(`${API}/rest/v1/groups`);
  h.at(100); h.error(`${API}/rest/v1/groups?select=id`, 'longer');
  assert.deepEqual(h.fetches.uncancelled(), ['longer']);
});

check('a failure that is not a cancellation excuses nothing', () => {
  const h = harness();
  h.at(0); h.fail(`${API}/rest/v1/groups?select=id`);
  h.at(100); h.error(`${API}/rest/v1/groups?select=id`, 'failed');
  h.at(5000); h.load();
  assert.deepEqual(h.fetches.uncancelled(), ['failed']);
});

check('one cancellation excuses one error', () => {
  const h = harness();
  h.at(0); h.cancel(`${APP}/groups?_rsc=1`);
  h.at(10); h.error(`${APP}/groups?_rsc=1`, 'first'); h.error(`${APP}/groups?_rsc=1`, 'second');
  assert.deepEqual(h.fetches.uncancelled(), ['second']);
});

check('a REST read or a prefetch 2 s before a new document is excused', () => {
  const h = harness();
  h.at(0); h.error(`${API}/rest/v1/rpc/list_staff_recipients`, 'rest'); h.error(`${APP}/reports?_rsc=x1`, 'rsc');
  h.at(2000); h.load();
  assert.deepEqual(h.fetches.uncancelled(), []);
});

check('another kind of request is never excused by a page load', () => {
  const h = harness();
  h.at(0); h.error(`${API}/auth/v1/user`, 'auth'); h.error(`${APP}/api/email/send`, 'route'); h.error('http://cdn.example.test/x.js', 'external');
  h.at(500); h.load();
  assert.deepEqual(h.fetches.uncancelled(), ['auth', 'route', 'external']);
});

check('a page load before the error, or more than 3 s after it, excuses nothing', () => {
  const h = harness();
  h.at(0); h.load();
  h.at(400); h.error(`${API}/rest/v1/groups?select=id`, 'after load');
  h.at(1000); h.error(`${API}/rest/v1/students?select=id`, 'too early');
  h.at(4500); h.load();
  assert.deepEqual(h.fetches.uncancelled(), ['after load', 'too early']);
});

check('each page has its own record', () => {
  const a = harness(), b = harness();
  a.at(0); a.cancel(`${API}/rest/v1/groups?select=id`);
  b.at(100); b.error(`${API}/rest/v1/groups?select=id`, 'other page');
  assert.deepEqual(b.fetches.uncancelled(), ['other page']);
});

console.log(`PASS WebKit cancelled-fetch rule (${checks} checks): exact URL in a 1 s window, prefetch/REST reads only in the 3 s before a new document, real CORS failures fail the run`);
