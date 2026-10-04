export const RULE_IDS = Object.freeze({
  calibration: 9001,
  markerLeak: 9002,
  endpointRequest: 9003,
});

export const MAX_OBSERVATION_MS = 60_000;

function finiteTimestamp(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function validMatchEntries(matches) {
  if (!Array.isArray(matches)) return false;
  // Validate the entire Chrome MatchedRuleInfo array before discarding stale records.
  for (const entry of matches) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)
      || !entry.rule || typeof entry.rule !== 'object' || Array.isArray(entry.rule)
      || !Number.isInteger(entry.rule.ruleId) || entry.rule.ruleId < 1
      || typeof entry.rule.rulesetId !== 'string' || entry.rule.rulesetId.length === 0
      || !finiteTimestamp(entry.timeStamp)
      || !Number.isInteger(entry.tabId) || entry.tabId < -1) return false;
  }
  return true;
}

export function validateObservationWindow(start, now = Date.now()) {
  if (!finiteTimestamp(start) || !finiteTimestamp(now) || start > now) {
    return { ok: false, reason: 'invalid_observation_window' };
  }
  if (now - start > MAX_OBSERVATION_MS) {
    return { ok: false, reason: 'observation_window_expired' };
  }
  return { ok: true };
}

export function extractMatchedRules(details) {
  if (!details || typeof details !== 'object' || Array.isArray(details)) {
    return { ok: false, reason: 'malformed_match_response' };
  }
  if (!validMatchEntries(details.rulesMatchedInfo)) {
    return { ok: false, reason: 'malformed_match_response' };
  }
  return { ok: true, matches: details.rulesMatchedInfo };
}

export function projectMatchedRules(matches, start, now) {
  if (!finiteTimestamp(now)) return { ok: false, reason: 'invalid_observation_window' };
  const window = validateObservationWindow(start, now);
  if (!window.ok) return window;
  if (!validMatchEntries(matches)) {
    return { ok: false, reason: 'malformed_match_response' };
  }
  if (matches.some(entry => entry.timeStamp > now || entry.timeStamp - start > MAX_OBSERVATION_MS)) {
    return { ok: false, reason: 'match_timestamp_out_of_window' };
  }
  const projected = matches
    .filter(entry => entry.timeStamp >= start)
    .map((entry) => ({
      ruleId: entry.rule.ruleId,
      rulesetId: entry.rule.rulesetId,
      tabId: entry.tabId,
      timeStamp: entry.timeStamp,
    }));
  return { ok: true, matches: projected };
}

function baseAssessment({ start, now, querySucceeded, matches }) {
  const window = validateObservationWindow(start, now);
  if (!window.ok) return { state: 'inconclusive', reason: window.reason, matches: [] };
  if (querySucceeded !== true) {
    return { state: 'inconclusive', reason: 'match_query_error', matches: [] };
  }
  const projected = projectMatchedRules(matches, start, now);
  if (!projected.ok) {
    return { state: 'inconclusive', reason: projected.reason, matches: [] };
  }
  return { state: 'ready', matches: projected.matches };
}

function countRule(matches, ruleId) {
  return matches.filter((entry) => entry.ruleId === ruleId).length;
}

function markerLeakFailure(matches) {
  const markerLeakCount = countRule(matches, RULE_IDS.markerLeak);
  if (markerLeakCount < 1) return null;
  return {
    state: 'fail',
    reason: 'synthetic_marker_observed_in_request_url',
    markerLeakCount,
    matches,
  };
}

export function assessCalibration(input) {
  const base = baseAssessment(input);
  if (base.state !== 'ready') return base;

  const markerFailure = markerLeakFailure(base.matches);
  if (markerFailure) return markerFailure;

  const count = countRule(base.matches, RULE_IDS.calibration);
  if (count < 1) {
    return { state: 'fail', reason: 'fresh_calibration_match_missing', matches: base.matches };
  }
  return { state: 'pass', reason: 'fresh_calibration_match_observed', count, matches: base.matches };
}

export function assessIdleBaseline(input) {
  const base = baseAssessment(input);
  if (base.state !== 'ready') return base;

  const markerFailure = markerLeakFailure(base.matches);
  if (markerFailure) return markerFailure;

  const count = countRule(base.matches, RULE_IDS.endpointRequest);
  if (count > 0) {
    return {
      state: 'inconclusive',
      reason: 'endpoint_request_seen_during_idle_baseline',
      count,
      matches: base.matches,
    };
  }
  return { state: 'pass', reason: 'clean_endpoint_idle_baseline', count: 0, matches: base.matches };
}

export function assessSyntheticSubmission(input) {
  const base = baseAssessment(input);
  if (base.state !== 'ready') return base;

  const markerFailure = markerLeakFailure(base.matches);
  const endpointRequestCount = countRule(base.matches, RULE_IDS.endpointRequest);

  if (markerFailure) {
    return {
      ...markerFailure,
      endpointRequestCount,
    };
  }

  if (endpointRequestCount < 1) {
    return {
      state: 'inconclusive',
      reason: 'endpoint_request_observation_missing',
      markerLeakCount: 0,
      endpointRequestCount: 0,
      matches: base.matches,
    };
  }

  return {
    state: 'pass',
    reason: 'endpoint_request_attempt_observed_without_marker_url_match',
    markerLeakCount: 0,
    endpointRequestCount,
    matches: base.matches,
    limitation: 'This observes a request attempt only; it does not prove request completion, Meta processing, input linkage, or completed evaluation.',
  };
}
