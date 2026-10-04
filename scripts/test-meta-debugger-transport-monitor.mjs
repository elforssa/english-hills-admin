import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const toolDir = path.join(root, 'tools', 'meta-debugger-transport-monitor');

const readText = name => readFile(path.join(toolDir, name), 'utf8');
const readJson = async name => JSON.parse(await readText(name));

const expectedToolFiles = [
  'README.md',
  'manifest.json',
  'monitor-controller.mjs',
  'monitor-core.mjs',
  'monitor.css',
  'monitor.html',
  'monitor.js',
  'rules.json',
];

const toolFiles = (await readdir(toolDir)).sort();
assert.deepEqual(
  toolFiles,
  expectedToolFiles,
  'extension file inventory must remain closed and reviewable',
);

const [
  manifest,
  rules,
  monitorSource,
  controllerSource,
  coreSource,
  htmlSource,
  cssSource,
  packageJson,
] = await Promise.all([
  readJson('manifest.json'),
  readJson('rules.json'),
  readText('monitor.js'),
  readText('monitor-controller.mjs'),
  readText('monitor-core.mjs'),
  readText('monitor.html'),
  readText('monitor.css'),
  readFile(path.join(root, 'package.json'), 'utf8').then(JSON.parse),
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
  'optional_permissions',
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

const calibration = byId.get(9001);
const markerLeak = byId.get(9002);
const endpoint = byId.get(9003);

assert.equal(calibration.priority, 100);
assert.equal(markerLeak.priority, 300);
assert.equal(endpoint.priority, 200);

for (const rule of rules) {
  assert.deepEqual(
    [...rule.condition.resourceTypes].sort(),
    [...expectedResourceTypes].sort(),
    `rule ${rule.id} must explicitly cover all reviewed ResourceTypes`,
  );
  assert.equal(
    rule.condition.isUrlFilterCaseSensitive,
    true,
    `rule ${rule.id} URL matching must be explicitly case-sensitive`,
  );
}

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
for (const unsupported of ['(?=', '(?!', '(?<=', '(?<!', '\\1', '\\2', '\\k<']) {
  assert.equal(
    endpoint.condition.regexFilter.includes(unsupported),
    false,
    `Rule 9003 regex must avoid known unsupported RE2 construct ${unsupported}`,
  );
}

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
  'https://graph.facebook.com/DEBUG_TOKEN',
  'https://graph.facebook.com/v26.0/DEBUG_TOKEN',
]) {
  assert.equal(endpointRegex.test(url), false, `Rule 9003 regex must reject ${url}`);
}

function domainConditionMatches(host, domain) {
  const candidate = host.toLowerCase();
  const expected = domain.toLowerCase();
  return candidate === expected || candidate.endsWith(`.${expected}`);
}

function staticRuleMatches(rule, {
  url,
  resourceType,
  method = 'get',
  initiatorHost = 'developers.facebook.com',
}) {
  const condition = rule.condition;
  if (!condition.resourceTypes.includes(resourceType)) return false;

  if (condition.requestMethods && !condition.requestMethods.includes(method.toLowerCase())) {
    return false;
  }

  if (
    condition.initiatorDomains
    && !condition.initiatorDomains.some(domain => domainConditionMatches(initiatorHost, domain))
  ) {
    return false;
  }

  if (condition.urlFilter) {
    if (condition.isUrlFilterCaseSensitive) return url.includes(condition.urlFilter);
    return url.toLowerCase().includes(condition.urlFilter.toLowerCase());
  }

  if (condition.regexFilter) {
    const flags = condition.isUrlFilterCaseSensitive ? '' : 'i';
    return new RegExp(condition.regexFilter, flags).test(url);
  }

  return false;
}

for (const type of expectedResourceTypes) {
  assert.equal(
    staticRuleMatches(markerLeak, {
      url: `https://example.invalid/path?marker=${markerLeak.condition.urlFilter}`,
      resourceType: type,
    }),
    true,
    `Rule 9002 must cover resource type ${type}`,
  );
}

for (const request of [
  {
    url: `https://redirect.example/final?${markerLeak.condition.urlFilter}`,
    resourceType: 'main_frame',
  },
  {
    url: `https://redirect.example/background/${markerLeak.condition.urlFilter}`,
    resourceType: 'xmlhttprequest',
  },
]) {
  assert.equal(
    staticRuleMatches(markerLeak, request),
    true,
    'redirected marker request must remain covered by Rule 9002',
  );
}

assert.equal(
  staticRuleMatches(endpoint, {
    url: 'https://graph.facebook.com/v26.0/debug_token?x=1',
    resourceType: 'xmlhttprequest',
    method: 'GET',
    initiatorHost: 'developers.facebook.com',
  }),
  true,
);
assert.equal(
  staticRuleMatches(endpoint, {
    url: 'https://graph.facebook.com/v26.0/DEBUG_TOKEN?x=1',
    resourceType: 'xmlhttprequest',
    method: 'GET',
    initiatorHost: 'developers.facebook.com',
  }),
  false,
  'Rule 9003 endpoint matching must remain case-sensitive',
);
assert.equal(
  staticRuleMatches(endpoint, {
    url: 'https://graph.facebook.com/debug_token',
    resourceType: 'xmlhttprequest',
    method: 'GET',
    initiatorHost: 'sub.developers.facebook.com',
  }),
  true,
  'Chrome initiatorDomains is a domain condition that includes subdomains; do not model it as exact origin',
);

const executableSources = new Map();
for (const filename of toolFiles.filter(name => /\.(?:m?js)$/.test(name))) {
  executableSources.set(filename, await readText(filename));
}
assert.deepEqual(
  [...executableSources.keys()].sort(),
  ['monitor-controller.mjs', 'monitor-core.mjs', 'monitor.js'],
  'all executable extension source files must be explicitly inventoried',
);

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

for (const [filename, source] of executableSources) {
  for (const [name, pattern] of forbiddenSourcePatterns) {
    assert.equal(pattern.test(source), false, `${filename} must not use ${name}`);
  }
}

const getMatchedRulesCall = controllerSource.match(
  /getMatchedRules\s*\(\s*\{([\s\S]*?)\}\s*\)/,
);
assert.ok(getMatchedRulesCall, 'controller must call getMatchedRules with an object');
const normalizedQueryBody = getMatchedRulesCall[1]
  .replace(/\s+/g, '')
  .replace(/,+$/, '');
assert.equal(
  normalizedQueryBody,
  'minTimeStamp:snapshot.startTime',
  'match query object must contain only minTimeStamp and omit tabId or other filters',
);
assert.equal(/tabId\s*:/.test(controllerSource), false, 'controller query code must not add a tabId filter');

assert.equal(/https?:\/\//.test(htmlSource), false, 'monitor page must not load remote content');
assert.equal(/<script[^>]+src="monitor\.js"/.test(htmlSource), true);
assert.equal(/url\s*\(/i.test(cssSource), false, 'monitor CSS must not load remote or local URL resources');

assert.equal(
  packageJson.scripts['test:inspector-monitor'],
  'node scripts/test-meta-debugger-transport-monitor.mjs',
);
assert.match(packageJson.scripts.test, /npm run test:inspector-monitor/);

const coreUrl = pathToFileURL(path.join(toolDir, 'monitor-core.mjs')).href;
const controllerUrl = pathToFileURL(path.join(toolDir, 'monitor-controller.mjs')).href;
const core = await import(coreUrl);
const { createMonitorController } = await import(controllerUrl);

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

assert.deepEqual(
  core.extractMatchedRules({
    rulesMatchedInfo: [{ rule: { ruleId: 9001, rulesetId: 'eh_inspector_transport_rules' }, tabId: 1, timeStamp: start + 1 }],
  }),
  {
    ok: true,
    matches: [{ rule: { ruleId: 9001, rulesetId: 'eh_inspector_transport_rules' }, tabId: 1, timeStamp: start + 1 }],
  },
);
for (const malformed of [
  [],
  null,
  {},
  { rulesMatchedInfo: null },
  { rulesMatchedInfo: {} },
]) {
  assert.deepEqual(
    core.extractMatchedRules(malformed),
    { ok: false, reason: 'malformed_match_response' },
  );
}

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
], start, now).matches;

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
    matches: [{ rule: { ruleId: 9001, rulesetId: 'eh_inspector_transport_rules' }, tabId: 1, timeStamp: start + 1 }],
  }).state,
  'pass',
);
assert.equal(
  core.assessCalibration({
    start,
    now,
    querySucceeded: true,
    matches: [
      { rule: { ruleId: 9001, rulesetId: 'eh_inspector_transport_rules' }, tabId: 1, timeStamp: start + 1 },
      { rule: { ruleId: 9002, rulesetId: 'eh_inspector_transport_rules' }, tabId: 1, timeStamp: start + 2 },
    ],
  }).state,
  'fail',
  'fresh Rule 9002 must override calibration PASS',
);
assert.equal(
  core.assessCalibration({
    start,
    now,
    querySucceeded: true,
    matches: [{ rule: { ruleId: 9001, rulesetId: 'eh_inspector_transport_rules' }, tabId: 1, timeStamp: start - 1 }],
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
    matches: [{ rule: { ruleId: 9002, rulesetId: 'eh_inspector_transport_rules' }, tabId: -1, timeStamp: start + 1 }],
  }).state,
  'fail',
  'fresh Rule 9002 must override idle PASS',
);
assert.equal(
  core.assessIdleBaseline({
    start,
    now,
    querySucceeded: true,
    matches: [{ rule: { ruleId: 9003, rulesetId: 'eh_inspector_transport_rules' }, tabId: -1, timeStamp: start + 1 }],
  }).state,
  'inconclusive',
);

const leak = core.assessSyntheticSubmission({
  start,
  now,
  querySucceeded: true,
  matches: [
    { rule: { ruleId: 9002, rulesetId: 'eh_inspector_transport_rules' }, tabId: 2, timeStamp: start + 1 },
    { rule: { ruleId: 9003, rulesetId: 'eh_inspector_transport_rules' }, tabId: 2, timeStamp: start + 2 },
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
  matches: [{ rule: { ruleId: 9003, rulesetId: 'eh_inspector_transport_rules' }, tabId: -1, timeStamp: start + 1 }],
});
assert.equal(endpointObserved.state, 'pass');
assert.equal(endpointObserved.markerLeakCount, 0);
assert.equal(endpointObserved.endpointRequestCount, 1);
assert.match(endpointObserved.limitation, /does not prove request completion/i);

const malformedAssessment = core.assessSyntheticSubmission({
  start,
  now,
  querySucceeded: true,
  matches: null,
});
assert.equal(malformedAssessment.state, 'inconclusive');
assert.equal(malformedAssessment.reason, 'malformed_match_response');

const expiredAssessment = core.assessSyntheticSubmission({
  start,
  now: start + core.MAX_OBSERVATION_MS + 1,
  querySucceeded: true,
  matches: [{ rule: { ruleId: 9003, rulesetId: 'eh_inspector_transport_rules' }, tabId: 1, timeStamp: start + 1 }],
});
assert.equal(expiredAssessment.state, 'inconclusive');
assert.equal(expiredAssessment.reason, 'observation_window_expired');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeController({
  initialNow = start,
  getMatchedRules,
} = {}) {
  let currentNow = initialNow;
  const rendered = [];
  const controller = createMonitorController({
    getMatchedRules,
    now: () => currentNow,
    render: value => rendered.push(value),
  });
  return {
    controller,
    rendered,
    setNow(value) {
      currentNow = value;
    },
  };
}

async function runEnvelopeCase(kind, rulesMatchedInfo, checkedAt = start + 10) {
  const harness = makeController({
    getMatchedRules: async () => ({ rulesMatchedInfo }),
  });
  harness.controller.start(kind);
  harness.setNow(checkedAt);
  return harness.controller.query(kind);
}

const assessors = {
  calibration: core.assessCalibration,
  idle: core.assessIdleBaseline,
  assessment: core.assessSyntheticSubmission,
};
function match(ruleId, timeStamp = start + 1) {
  return { rule: { ruleId, rulesetId: 'eh_inspector_transport_rules' }, tabId: -1, timeStamp };
}

assert.deepEqual(
  core.projectMatchedRules([match(9003)], start),
  { ok: false, reason: 'invalid_observation_window' },
  'projection requires the actual check time',
);

const malformedEntries = [
  null,
  [],
  'not a match object',
  {},
  { tabId: -1, timeStamp: start + 1 },
  { ...match(9002), rule: null },
  { ...match(9002), rule: [] },
  ...['9002', 9002.5, NaN, Infinity, 0, -1].map(ruleId => match(ruleId)),
  { ...match(9002), rule: { ruleId: 9002 } },
  { ...match(9002), rule: { ruleId: 9002, rulesetId: 42 } },
  { ...match(9002), rule: { ruleId: 9002, rulesetId: '' } },
  ...[undefined, null, '1000001', NaN, Infinity, 0, -1].map(timeStamp => ({ ...match(9002), timeStamp })),
  ...[undefined, null, '-1', -2, 1.5, NaN, Infinity].map(tabId => ({ ...match(9002), tabId })),
  // Even malformed stale records must invalidate the array before stale filtering.
  { ...match(9002, start - 1), tabId: null },
];
for (const malformedEntry of malformedEntries) {
  assert.deepEqual(
    core.extractMatchedRules({ rulesMatchedInfo: [malformedEntry] }),
    { ok: false, reason: 'malformed_match_response' },
  );
  for (const [kind, assess] of Object.entries(assessors)) {
    const matches = [malformedEntry];
    const unit = assess({ start, now, querySucceeded: true, matches });
    const controller = await runEnvelopeCase(kind, matches);
    for (const result of [unit, controller]) {
      assert.equal(result.state, 'inconclusive', `${kind} must reject a malformed entry`);
      assert.equal(result.reason, 'malformed_match_response');
    }
    assert.deepEqual(unit.matches, []);
  }
}
for (const matches of [
  [match(9003), { ...match(9002), timeStamp: String(start + 2) }],
  [match(9002), { ...match(9003), timeStamp: String(start + 2) }],
]) {
  const unit = core.assessSyntheticSubmission({ start, now, querySucceeded: true, matches });
  const controller = await runEnvelopeCase('assessment', matches);
  for (const result of [unit, controller]) {
    assert.equal(result.state, 'inconclusive', 'partially malformed evidence must yield neither PASS nor FAIL');
    assert.equal(result.reason, 'malformed_match_response');
    assert.equal(JSON.stringify(result).includes('timeStamp'), false, 'untrusted entries must not escape');
  }
}

for (const matches of [
  [match(9003, start + 11)],
  [match(9002, start + 11)],
  [match(9003, start + 120_000)],
  [match(9002, start + core.MAX_OBSERVATION_MS + 1)],
  [match(9003), match(9002, start + 11)],
  [match(9002), match(9003, start + 11)],
]) {
  for (const [kind, assess] of Object.entries(assessors)) {
    const unit = assess({ start, now: start + 10, querySucceeded: true, matches });
    const controller = await runEnvelopeCase(kind, matches);
    for (const result of [unit, controller]) {
      assert.equal(result.state, 'inconclusive', `${kind} must reject inconsistent timestamps`);
      assert.equal(result.reason, 'match_timestamp_out_of_window');
      assert.deepEqual(result.matches, []);
    }
  }
}

for (const checkedAt of [start, start + 10, start + core.MAX_OBSERVATION_MS]) {
  for (const timeStamp of [start, checkedAt]) {
    for (const [kind, ruleId, expected] of [
      ['calibration', 9001, 'pass'],
      ['idle', 9003, 'inconclusive'],
      ['assessment', 9003, 'pass'],
      ['assessment', 9002, 'fail'],
    ]) {
      const matches = [match(ruleId, timeStamp)];
      assert.equal(assessors[kind]({ start, now: checkedAt, querySucceeded: true, matches }).state, expected);
      assert.equal((await runEnvelopeCase(kind, matches, checkedAt)).state, expected);
    }
  }
}
for (const [kind, expected, reason] of [
  ['calibration', 'fail', 'fresh_calibration_match_missing'],
  ['idle', 'pass', 'clean_endpoint_idle_baseline'],
  ['assessment', 'inconclusive', 'endpoint_request_observation_missing'],
]) {
  const matches = [match(9001, start - 1), match(9002, start - 1), match(9003, start - 1)];
  const unit = assessors[kind]({ start, now, querySucceeded: true, matches });
  const controller = await runEnvelopeCase(kind, matches);
  for (const result of [unit, controller]) {
    assert.equal(result.state, expected);
    assert.equal(result.reason, reason);
    assert.deepEqual(result.matches, []);
  }
}

assert.equal(
  (await runEnvelopeCase('calibration', [
    { rule: { ruleId: 9001, rulesetId: 'eh_inspector_transport_rules' }, tabId: 1, timeStamp: start + 1 },
  ])).state,
  'pass',
  'actual Chrome RulesMatchedDetails envelope must produce calibration PASS',
);
assert.equal(
  (await runEnvelopeCase('idle', [
    { rule: { ruleId: 9003, rulesetId: 'eh_inspector_transport_rules' }, tabId: -1, timeStamp: start + 1 },
  ])).state,
  'inconclusive',
  'actual Chrome envelope must preserve idle Rule 9003 INCONCLUSIVE',
);
assert.equal(
  (await runEnvelopeCase('assessment', [
    { rule: { ruleId: 9002, rulesetId: 'eh_inspector_transport_rules' }, tabId: 2, timeStamp: start + 1 },
  ])).state,
  'fail',
  'actual Chrome envelope must preserve Rule 9002 FAIL',
);
const pageEndpointObserved = await runEnvelopeCase('assessment', [
  { rule: { ruleId: 9003, rulesetId: 'eh_inspector_transport_rules' }, tabId: -1, timeStamp: start + 1 },
]);
assert.equal(pageEndpointObserved.state, 'pass');
assert.match(pageEndpointObserved.limitation, /does not prove request completion/i);

for (const malformed of [[], {}, { rulesMatchedInfo: null }]) {
  const harness = makeController({
    getMatchedRules: async () => malformed,
  });
  harness.controller.start('assessment');
  const result = await harness.controller.query('assessment');
  assert.equal(result.state, 'inconclusive');
  assert.equal(result.reason, 'malformed_match_response');
}

{
  const pending = deferred();
  const harness = makeController({
    getMatchedRules: () => pending.promise,
  });
  harness.controller.start('calibration');
  const queryPromise = harness.controller.query('calibration');
  harness.setNow(start + core.MAX_OBSERVATION_MS + 1);
  pending.resolve({
    rulesMatchedInfo: [
      { rule: { ruleId: 9001, rulesetId: 'eh_inspector_transport_rules' }, tabId: 1, timeStamp: start + 1 },
    ],
  });
  const result = await queryPromise;
  assert.equal(result.state, 'inconclusive');
  assert.equal(result.reason, 'observation_window_expired');
}

{
  const pending = deferred();
  const harness = makeController({
    getMatchedRules: () => pending.promise,
  });
  harness.controller.start('idle');
  const queryPromise = harness.controller.query('idle');
  harness.controller.reset();
  assert.deepEqual(harness.rendered.at(-1), { state: 'reset' });
  pending.resolve({ rulesMatchedInfo: [] });
  const result = await queryPromise;
  assert.equal(result.state, 'inconclusive');
  assert.equal(result.reason, 'observation_superseded');
  assert.deepEqual(
    harness.rendered.at(-1),
    { state: 'reset' },
    'a stale pending query must not overwrite Reset',
  );
}

{
  const pending = deferred();
  const harness = makeController({
    getMatchedRules: () => pending.promise,
  });
  harness.controller.start('calibration');
  const oldQuery = harness.controller.query('calibration');
  harness.controller.start('calibration');
  harness.setNow(start + 1);
  pending.resolve({
    rulesMatchedInfo: [
      { rule: { ruleId: 9001, rulesetId: 'eh_inspector_transport_rules' }, tabId: 1, timeStamp: start + 1 },
    ],
  });
  const oldResult = await oldQuery;
  assert.equal(oldResult.state, 'inconclusive');
  assert.equal(oldResult.reason, 'observation_superseded');
}

{
  const first = deferred();
  const second = deferred();
  let call = 0;
  const harness = makeController({
    getMatchedRules: () => (++call === 1 ? first.promise : second.promise),
  });
  harness.controller.start('assessment');
  const firstQuery = harness.controller.query('assessment');
  const secondQuery = harness.controller.query('assessment');

  harness.setNow(start + 1);
  first.resolve({
    rulesMatchedInfo: [
      { rule: { ruleId: 9002, rulesetId: 'eh_inspector_transport_rules' }, tabId: 1, timeStamp: start + 1 },
    ],
  });
  const firstResult = await firstQuery;
  assert.equal(firstResult.state, 'inconclusive');
  assert.equal(firstResult.reason, 'observation_superseded');

  harness.setNow(start + 2);
  second.resolve({
    rulesMatchedInfo: [
      { rule: { ruleId: 9003, rulesetId: 'eh_inspector_transport_rules' }, tabId: -1, timeStamp: start + 2 },
    ],
  });
  const secondResult = await secondQuery;
  assert.equal(secondResult.state, 'pass');
  assert.equal(harness.rendered.at(-1).state, 'pass');
}

for (const [oldKind, newerKind, oldRuleId, newerRuleId] of [
  ['calibration', 'idle', 9001, null],
  ['idle', 'assessment', null, 9003],
]) {
  for (const newerOperation of ['start', 'start-and-query', 'query', 'missing-start-query']) {
    for (const completion of ['resolve', 'reject']) {
      const pending = deferred();
      const queries = [];
      const harness = makeController({
        getMatchedRules: query => {
          queries.push(query);
          if (queries.length === 1) return pending.promise;
          return Promise.resolve({
            rulesMatchedInfo: newerRuleId === null ? [] : [
              { rule: { ruleId: newerRuleId, rulesetId: 'eh_inspector_transport_rules' }, tabId: -1, timeStamp: start + 11 },
            ],
          });
        },
      });
      // A later query of an already-started different kind must also supersede.
      if (newerOperation === 'query') harness.controller.start(newerKind);
      harness.controller.start(oldKind);
      const oldQuery = harness.controller.query(oldKind);
      harness.setNow(start + 10);

      if (newerOperation === 'start' || newerOperation === 'start-and-query') {
        const started = harness.controller.start(newerKind);
        // Reproduce monitor.js rendering immediately after controller.start().
        harness.rendered.push({ state: 'started', kind: newerKind, startedAt: started.startTime });
      }
      if (newerOperation !== 'start') {
        harness.setNow(start + 11);
        const newerResult = await harness.controller.query(newerKind);
        assert.equal(newerResult.kind, newerKind);
        assert.equal(newerResult.state, newerOperation === 'missing-start-query' ? 'inconclusive' : 'pass');
        if (newerOperation === 'missing-start-query') {
          assert.equal(newerResult.reason, 'observation_start_missing');
        } else {
          assert.equal(newerResult.startedAt, newerOperation === 'query' ? start : start + 10);
        }
      }
      const newerRenders = [...harness.rendered];
      assert.equal(newerRenders.at(-1).kind, newerKind);
      assert.deepEqual(queries[0], { minTimeStamp: start });
      if (queries.length > 1) {
        assert.deepEqual(queries[1], { minTimeStamp: newerOperation === 'query' ? start : start + 10 });
      }

      if (completion === 'reject') {
        pending.reject(new Error('synthetic query failure'));
      } else {
        pending.resolve({
          rulesMatchedInfo: oldRuleId === null ? [] : [
            { rule: { ruleId: oldRuleId, rulesetId: 'eh_inspector_transport_rules' }, tabId: 1, timeStamp: start + 1 },
          ],
        });
      }
      const oldResult = await oldQuery;
      assert.equal(oldResult.state, 'inconclusive');
      assert.equal(oldResult.reason, 'observation_superseded');
      assert.deepEqual(
        harness.rendered,
        newerRenders,
        `${oldKind} ${completion} must not render over newer ${newerKind} ${newerOperation}`,
      );
    }
  }
}

process.stdout.write('meta debugger transport monitor tests passed\n');
