import {
  assessCalibration,
  assessIdleBaseline,
  assessSyntheticSubmission,
  extractMatchedRules,
} from './monitor-core.mjs';

export const ASSESSORS = Object.freeze({
  calibration: assessCalibration,
  idle: assessIdleBaseline,
  assessment: assessSyntheticSubmission,
});

export function createMonitorController({
  getMatchedRules,
  now = () => Date.now(),
  render = () => {},
} = {}) {
  if (typeof getMatchedRules !== 'function') throw new TypeError('getMatchedRules required');
  if (typeof now !== 'function') throw new TypeError('now required');
  if (typeof render !== 'function') throw new TypeError('render required');

  let nextObservationId = 1;
  let resetGeneration = 0;
  const observations = {
    calibration: null,
    idle: null,
    assessment: null,
  };

  function snapshotIsCurrent(kind, snapshot) {
    const current = observations[kind];
    return resetGeneration === snapshot.resetGeneration
      && current !== null
      && current.id === snapshot.id
      && current.startTime === snapshot.startTime
      && current.queryId === snapshot.queryId;
  }

  function start(kind) {
    if (!Object.hasOwn(ASSESSORS, kind)) throw new TypeError('unknown observation kind');
    const startTime = now();
    observations[kind] = {
      id: nextObservationId++,
      startTime,
      queryId: 0,
    };
    return { id: observations[kind].id, startTime };
  }

  function reset() {
    resetGeneration += 1;
    observations.calibration = null;
    observations.idle = null;
    observations.assessment = null;
    render({ state: 'reset' });
  }

  async function query(kind) {
    if (!Object.hasOwn(ASSESSORS, kind)) throw new TypeError('unknown observation kind');

    const current = observations[kind];
    if (!current || !Number.isFinite(current.startTime)) {
      const result = { state: 'inconclusive', reason: 'observation_start_missing', kind };
      render(result);
      return result;
    }

    current.queryId += 1;
    const snapshot = {
      id: current.id,
      startTime: current.startTime,
      queryId: current.queryId,
      resetGeneration,
    };

    let details;
    try {
      details = await getMatchedRules({
        minTimeStamp: snapshot.startTime,
      });
    } catch {
      if (!snapshotIsCurrent(kind, snapshot)) {
        return { state: 'inconclusive', reason: 'observation_superseded', kind };
      }
      const result = {
        state: 'inconclusive',
        reason: 'match_query_error',
        kind,
        startedAt: snapshot.startTime,
        checkedAt: now(),
      };
      render(result);
      return result;
    }

    if (!snapshotIsCurrent(kind, snapshot)) {
      return { state: 'inconclusive', reason: 'observation_superseded', kind };
    }

    const checkedAt = now();
    const extracted = extractMatchedRules(details);
    if (!extracted.ok) {
      const result = {
        state: 'inconclusive',
        reason: extracted.reason,
        kind,
        startedAt: snapshot.startTime,
        checkedAt,
      };
      render(result);
      return result;
    }

    const result = ASSESSORS[kind]({
      start: snapshot.startTime,
      now: checkedAt,
      querySucceeded: true,
      matches: extracted.matches,
    });

    if (!snapshotIsCurrent(kind, snapshot)) {
      return { state: 'inconclusive', reason: 'observation_superseded', kind };
    }

    const rendered = {
      kind,
      startedAt: snapshot.startTime,
      checkedAt,
      ...result,
    };
    render(rendered);
    return rendered;
  }

  return {
    start,
    query,
    reset,
  };
}
