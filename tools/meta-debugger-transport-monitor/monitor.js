import {
  MAX_OBSERVATION_MS,
  assessCalibration,
  assessIdleBaseline,
  assessSyntheticSubmission,
} from './monitor-core.mjs';

const observation = {
  calibration: null,
  idle: null,
  assessment: null,
};

const output = document.querySelector('#result');

function nowUtc(timestamp = Date.now()) {
  return new Date(timestamp).toISOString();
}

function render(value) {
  output.textContent = JSON.stringify(value, null, 2);
}

function start(kind) {
  const startedAt = Date.now();
  observation[kind] = startedAt;
  render({
    state: 'started',
    kind,
    startedAt,
    startedAtUtc: nowUtc(startedAt),
    maxObservationMs: MAX_OBSERVATION_MS,
  });
}

async function query(kind, assessor) {
  const startTime = observation[kind];
  const now = Date.now();

  if (!Number.isFinite(startTime)) {
    render({ state: 'inconclusive', reason: 'observation_start_missing', kind });
    return;
  }

  let matches;
  try {
    matches = await chrome.declarativeNetRequest.getMatchedRules({
      minTimeStamp: startTime,
    });
  } catch {
    render({
      state: 'inconclusive',
      reason: 'match_query_error',
      kind,
      startedAt: startTime,
      checkedAt: now,
    });
    return;
  }

  const result = assessor({
    start: startTime,
    now,
    querySucceeded: true,
    matches,
  });

  render({
    kind,
    startedAt: startTime,
    startedAtUtc: nowUtc(startTime),
    checkedAt: now,
    checkedAtUtc: nowUtc(now),
    ...result,
  });
}

document.querySelector('#start-calibration').addEventListener('click', () => start('calibration'));
document.querySelector('#check-calibration').addEventListener('click', () => query('calibration', assessCalibration));
document.querySelector('#start-idle').addEventListener('click', () => start('idle'));
document.querySelector('#check-idle').addEventListener('click', () => query('idle', assessIdleBaseline));
document.querySelector('#start-assessment').addEventListener('click', () => start('assessment'));
document.querySelector('#check-assessment').addEventListener('click', () => query('assessment', assessSyntheticSubmission));
document.querySelector('#reset').addEventListener('click', () => {
  observation.calibration = null;
  observation.idle = null;
  observation.assessment = null;
  render({ state: 'reset' });
});
