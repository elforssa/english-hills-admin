import { MAX_OBSERVATION_MS } from './monitor-core.mjs';
import { createMonitorController } from './monitor-controller.mjs';

const output = document.querySelector('#result');

function nowUtc(timestamp) {
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function render(value) {
  const enriched = {
    ...value,
    ...(Number.isFinite(value.startedAt) ? { startedAtUtc: nowUtc(value.startedAt) } : {}),
    ...(Number.isFinite(value.checkedAt) ? { checkedAtUtc: nowUtc(value.checkedAt) } : {}),
  };
  output.textContent = JSON.stringify(enriched, null, 2);
}

const controller = createMonitorController({
  getMatchedRules: (query) => chrome.declarativeNetRequest.getMatchedRules(query),
  now: () => Date.now(),
  render,
});

function start(kind) {
  const started = controller.start(kind);
  render({
    state: 'started',
    kind,
    startedAt: started.startTime,
    maxObservationMs: MAX_OBSERVATION_MS,
  });
}

document.querySelector('#start-calibration').addEventListener('click', () => start('calibration'));
document.querySelector('#check-calibration').addEventListener('click', () => controller.query('calibration'));
document.querySelector('#start-idle').addEventListener('click', () => start('idle'));
document.querySelector('#check-idle').addEventListener('click', () => controller.query('idle'));
document.querySelector('#start-assessment').addEventListener('click', () => start('assessment'));
document.querySelector('#check-assessment').addEventListener('click', () => controller.query('assessment'));
document.querySelector('#reset').addEventListener('click', () => controller.reset());
