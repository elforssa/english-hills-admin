import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const toolDir = path.join(root, 'tools', 'meta-debugger-transport-monitor');

const readText = name => readFile(path.join(toolDir, name), 'utf8');
const readJson = async name => JSON.parse(await readText(name));

const [manifest, rules, monitorSource, coreSource, htmlSource] = await Promise.all([
  readJson('manifest.json'),
  readJson('rules.json'),
  readText('monitor.js'),
  readText('monitor-core.mjs'),
  readText('monitor.html'),
]);

assert.equal(manifest.manifest_version, 3);
assert.deepEqual(
  [...manifest.permissions].sort(),
  ['declarativeNetRequest', 'declarativeNetRequestFeedback'].sort(),
  'manifest permissions must remain exactly the reviewed DNR pair',
);

for (const forbiddenKey of [
  'host_permissions',
  'optional_host_permissions',
  'content_scripts',
  'background',
]) {
  assert.equal(
    Object.hasOwn(manifest, forbiddenKey),
    false,
    `manifest must not define ${forbiddenKey}`,
  );
}

const forbiddenPermissions = new Set([
  'activeTab',
  'cookies',
  'debugger',
  'nativeMessaging',
  'proxy',
  'storage',
  'tabs',
  'webRequest',
  'webRequestBlocking',
]);
for (const permission of manifest.permissions) {
  assert.equal(
    forbiddenPermissions.has(permission),
    false,
    `forbidden permission present: ${permission}`,
  );
}

assert.equal(manifest.options_page, 'monitor.html');
assert.equal(manifest.declarative_net_request.rule_resources.length, 1);
assert.deepEqual(manifest.declarative_net_request.rule_resources[0], {
  id: 'eh_inspector_transport_rules',
  enabled: true,
  path: 'rules.json',
});

const expectedResourceTypes = [
  'main_frame',
  'sub_frame',
  'stylesheet',
  'script',
  'image',
  'font',
  'object',
  'xmlhttprequest',
  'ping',
  'csp_report',
  'media',
  'websocket',
  'webtransport',
  'webbundle',
  'other',
];

assert.equal(rules.length, 3, 'exactly three reviewed rules are allowed');

const byId = new Map(rules.map(rule => [rule.id, rule]));
assert.deepEqual([...byId.keys()].sort((a, b) => a - b), [9001, 9002, 9003]);

for (const rule of rules) {
  assert.deepEqual(
    [...rule.condition.resourceTypes].sort(),
    [...expectedResourceTypes].sort(),
    `rule ${rule.id} must explicitly cover all reviewed ResourceTypes`,
  );
}

const calibration = byId.get(9001);
const markerLeak = byId.get(9002);
const endpoint = byId.get(9003);

assert.equal(calibration.action.type, 'block');
assert.equal(calibration.condition.urlFilter, 'EHDNRCAL20261004A9F2B7C4');

assert.equal(markerLeak.action.type, 'block');
assert.equal(markerLeak.condition.urlFilter, 'EHDBGTRANSPORT20261004C4D7A9F2');

assert.equal(endpoint.action.type, 'allow');
assert.ok(markerLeak.priority > endpoint.priority, 'Rule 9002 must strictly outrank Rule 9003');
assert.notEqual(markerLeak.priority, endpoint.priority, 'Rule 9002 and 9003 may not share priority');
assert.deepEqual(endpoint.condition.initiatorDomains, ['developers.facebook.com']);
assert.deepEqual(endpoint.condition.requestMethods, ['get']);

const endpointRegex = new RegExp(endpoint.condition.regexFilter);
for (const url of [
  'https://graph.facebook.com/debug_token',
  'https://graph.facebook.com/debug_token?input_token=synthetic',
  'https://graph.facebook.com/v26.0/debug_token',
  'https://graph.facebook.com/v999.10/debug_token?x=1&y=2',
]) {
  assert.equal(endpointRegex.test(url), true, `Rule 9003 regex must match ${url}`);
}

for (const url of [
  'http://graph.facebook.com/debug_token',
  'https://www.graph.facebook.com/debug_token',
  'https://sub.graph.facebook.com/debug_token',
  'https://graph.facebook.com.evil.example/debug_token',
  'https://graph.facebook.com:443/debug_token',
  'https://graph.facebook.com/v26.0/debug_token/extra',
  'https://graph.facebook.com/v26.0/debug_token_extra',
  'https://graph.facebook.com/v26.0/other/debug_token',
  'https://graph.facebook.com/debug_token/anything',
]) {
  assert.equal(endpointRegex.test(url), false, `Rule 9003 regex must reject ${url}`);
}

for (const type of ['main_frame', 'xmlhttprequest', 'websocket', 'other']) {
  assert.ok(markerLeak.condition.resourceTypes.includes(type));
  assert.ok(endpoint.condition.resourceTypes.includes(type));
}

for (const redirectedUrl of [
  'https://redirect.example/path?next=EHDBGTRANSPORT20261004C4D7A9F2',
  'https://another.example/EHDBGTRANSPORT20261004C4D7A9F2/final',
]) {
  assert.equal(
    redirectedUrl.includes(markerLeak.condition.urlFilter),
    true,
    'redirected marker URL must still match the fixed substring rule',
  );
}

const forbiddenSourcePatterns = [
  ['onRuleMatchedDebug', /onRuleMatchedDebug/],
  ['webRequest API', /chrome\.webRequest/],
  ['fetch', /\bfetch\s*\(/],
  ['XMLHttpRequest', /XMLHttpRequest/],
  ['sendBeacon', /sendBeacon/],
  ['chrome.storage', /chrome\.storage/],
  ['localStorage', /localStorage/],
  ['sessionStorage', /sessionStorage/],
  ['indexedDB', /indexedDB/],
  ['console logging', /console\./],
  ['tabs API', /chrome\.tabs/],
  ['debugger API', /chrome\.debugger/],
  ['proxy API', /chrome\.proxy/],
];

for (const [name, pattern] of forbiddenSourcePatterns) {
  assert.equal(pattern.test(monitorSource), false, `monitor.js must not use ${name}`);
  assert.equal(pattern.test(coreSource), false, `monitor-core.mjs must not use ${name}`);
}

assert.equal(
  /getMatchedRules\s*\(\s*\{\s*minTimeStamp:\s*startTime\s*\}\s*\)/s.test(monitorSource),
  true,
  'match query must use only minTimeStamp and omit tabId',
);
assert.equal(/tabId\s*:/.test(monitorSource), false, 'monitor query code must not add a tabId filter');

assert.equal(/https?:\/\//.test(htmlSource), false, 'monitor page must not load remote content');
assert.equal(/<script[^>]+src="monitor\.js"/.test(htmlSource), true);

const coreUrl = pathToFileURL(path.join(toolDir, 'monitor-core.mjs')).href;
const core = await import(coreUrl);

const start = 1_000_000;
const now = start + 10_000;

assert.deepEqual(core.validateObservationWindow(start, now), { ok: true });
assert.deepEqual(
  core.validateObservationWindow(start, start + core.MAX_OBSERVATION_MS + 1),
  { ok: false, reason: 'observation_window_expired' },
);
assert.deepEqual(
  core.validateObservationWindow(undefined, now),
  { ok: false, reason: 'invalid_observation_window' },
);

const projected = core.projectMatchedRules([
  {
    rule: { ruleId: 9003, rulesetId: 'eh_inspector_transport_rules' },
    tabId: -1,
    timeStamp: start + 1,
    request: {
      url: 'https://graph.facebook.com/debug_token?should_never_escape=true',
      requestHeaders: [{ name: 'authorization', value: 'should_never_escape' }],
    },
  },
  {
    rule: { ruleId: 9002, rulesetId: 'eh_inspector_transport_rules' },
    tabId: 7,
    timeStamp: start - 1,
  },
], start);

assert.deepEqual(projected, [
  {
    ruleId: 9003,
    rulesetId: 'eh_inspector_transport_rules',
    tabId: -1,
    timeStamp: start + 1,
  },
]);
assert.equal(JSON.stringify(projected).includes('should_never_escape'), false);
assert.equal(projected[0].tabId, -1, 'unassociated tab -1 matches must be retained');

assert.equal(
  core.assessCalibration({
    start,
    now,
    querySucceeded: true,
    matches: [{ rule: { ruleId: 9001 }, tabId: 1, timeStamp: start + 1 }],
  }).state,
  'pass',
);
assert.equal(
  core.assessCalibration({
    start,
    now,
    querySucceeded: true,
    matches: [{ rule: { ruleId: 9001 }, tabId: 1, timeStamp: start - 1 }],
  }).state,
  'fail',
  'stale calibration must not satisfy a fresh window',
);
assert.equal(
  core.assessCalibration({
    start,
    now,
    querySucceeded: false,
    matches: [],
  }).state,
  'inconclusive',
  'query failure must never become zero-match PASS/FAIL evidence',
);

assert.equal(
  core.assessIdleBaseline({
    start,
    now,
    querySucceeded: true,
    matches: [],
  }).state,
  'pass',
);
assert.equal(
  core.assessIdleBaseline({
    start,
    now,
    querySucceeded: true,
    matches: [{ rule: { ruleId: 9003 }, tabId: -1, timeStamp: start + 1 }],
  }).state,
  'inconclusive',
);

const leak = core.assessSyntheticSubmission({
  start,
  now,
  querySucceeded: true,
  matches: [
    { rule: { ruleId: 9002 }, tabId: 2, timeStamp: start + 1 },
    { rule: { ruleId: 9003 }, tabId: 2, timeStamp: start + 2 },
  ],
});
assert.equal(leak.state, 'fail');
assert.equal(leak.reason, 'synthetic_marker_observed_in_request_url');

const noEndpoint = core.assessSyntheticSubmission({
  start,
  now,
  querySucceeded: true,
  matches: [],
});
assert.equal(noEndpoint.state, 'inconclusive');
assert.equal(noEndpoint.reason, 'endpoint_request_observation_missing');

const endpointObserved = core.assessSyntheticSubmission({
  start,
  now,
  querySucceeded: true,
  matches: [{ rule: { ruleId: 9003 }, tabId: -1, timeStamp: start + 1 }],
});
assert.equal(endpointObserved.state, 'pass');
assert.equal(endpointObserved.markerLeakCount, 0);
assert.equal(endpointObserved.endpointRequestCount, 1);
assert.match(endpointObserved.limitation, /does not prove request completion/i);

const expiredAssessment = core.assessSyntheticSubmission({
  start,
  now: start + core.MAX_OBSERVATION_MS + 1,
  querySucceeded: true,
  matches: [{ rule: { ruleId: 9003 }, tabId: 1, timeStamp: start + 1 }],
});
assert.equal(expiredAssessment.state, 'inconclusive');
assert.equal(expiredAssessment.reason, 'observation_window_expired');

process.stdout.write('meta debugger transport monitor tests passed\n');
