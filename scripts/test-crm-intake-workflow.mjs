import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Runs the backup workflow's own step scripts with a stubbed `curl` on PATH (no
// network), so the status branching and the public log lines are what ships.
const workflow = readFileSync(new URL('../.github/workflows/crm-intake-scheduler.yml', import.meta.url), 'utf8');
const lines = workflow.split('\n');

function stepScript(name) {
  const start = lines.findIndex(line => line === `      - name: ${name}`);
  assert(start >= 0, `step ${name}`);
  const run = lines.findIndex((line, index) => index > start && line === '        run: |');
  assert(run > start, `run block of ${name}`);
  const body = [];
  for (const line of lines.slice(run + 1)) {
    if (line && !line.startsWith('          ')) break;
    body.push(line.slice(10));
  }
  return body.join('\n');
}

// Unchanged schedule, permissions and concurrency: `elforssa` stays the scheduled actor.
assert.match(workflow, /^on:\n {2}schedule:\n {4}- cron: '2-57\/5 \* \* \* \*'\n {2}workflow_dispatch:\n/m);
assert.match(workflow, /^permissions:\n {2}contents: read\n\n/m);
assert.match(workflow, /^concurrency:\n {2}group: crm-intake-scheduler\n {2}cancel-in-progress: false\n/m);
assert.match(workflow, / {6}alert_test:\n {8}description: .+\n {8}type: boolean\n {8}default: false\n/);
assert.match(workflow, / {6}- name: Alert test\n {8}if: \$\{\{ inputs\.alert_test \}\}\n {8}run: \|\n/);
assert.match(workflow, / {6}- name: Invoke protected CRM intake worker\n {8}if: \$\{\{ !inputs\.alert_test \}\}\n/);
const alertTest = stepScript('Alert test');
assert(!alertTest.includes('curl') && !alertTest.includes('CRM_INTAKE_SCHEDULER_TOKEN'));
const invoke = stepScript('Invoke protected CRM intake worker');
assert(!/--fail\b/.test(invoke));
for (const flag of ['--retry 2', "--write-out '%{http_code}'", '--output /dev/null', '--show-error', '--max-time 70']) {
  assert(invoke.includes(flag), flag);
}

const token = 'synthetic-scheduler-token-never-printed';
const dir = mkdtempSync(join(tmpdir(), 'crm-intake-workflow-'));
try {
  const callLog = join(dir, 'calls');
  const curl = join(dir, 'curl');
  // The stub records its arguments, prints the stubbed status like --write-out
  // and exits with the stubbed curl exit code.
  writeFileSync(curl, `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "${callLog}"
printf '%s' "\${STUB_STATUS}"
exit "\${STUB_RC:-0}"
`);
  chmodSync(curl, 0o755);
  const run = (script, { status = '200', rc = '0' } = {}) => {
    rmSync(callLog, { force: true });
    const result = spawnSync('bash', ['-c', script], {
      env: { PATH: `${dir}:${process.env.PATH}`, CRM_INTAKE_SCHEDULER_TOKEN: token, STUB_STATUS: status, STUB_RC: rc },
      encoding: 'utf8',
    });
    const calls = existsSync(callLog) ? readFileSync(callLog, 'utf8').trim().split('\n') : [];
    const output = `${result.stdout}${result.stderr}`;
    assert(!output.includes(token), 'the bearer is never printed');
    return { code: result.status, output: output.trim(), calls };
  };

  const ok = run(invoke, { status: '200' });
  assert.equal(ok.code, 0);
  assert.equal(ok.output, '');
  assert.equal(ok.calls.length, 1);
  assert(ok.calls[0].endsWith('https://admin.english-hills.com/api/cron/crm-intake'));
  assert(!ok.calls[0].includes('--fail'));

  assert.equal(run(invoke, { status: '204' }).code, 0);

  const alert = run(invoke, { status: '424' });
  assert.equal(alert.code, 1);
  assert.equal(alert.output, 'CRM intake reported a lead-intake problem. Open Analyse marketing > Réception des leads.');

  for (const status of ['503', '401', '500', '302']) {
    const failed = run(invoke, { status });
    assert.equal(failed.code, 1);
    assert.equal(failed.output, 'CRM intake scheduler returned a non-2xx status.');
  }

  const network = run(invoke, { status: '000', rc: '7' });
  assert.equal(network.code, 1);
  assert.equal(network.output, 'CRM intake scheduler request failed before an HTTP status was received.');

  const timeout = run(invoke, { status: '000', rc: '28' });
  assert.equal(timeout.code, 1);
  assert.equal(timeout.output, network.output);

  const missingToken = spawnSync('bash', ['-c', invoke], {
    env: { PATH: `${dir}:${process.env.PATH}`, CRM_INTAKE_SCHEDULER_TOKEN: '', STUB_STATUS: '200' }, encoding: 'utf8',
  });
  assert.notEqual(missingToken.status, 0);

  const test = run(alertTest, { status: '200' });
  assert.equal(test.code, 1);
  assert.equal(test.output, 'Alert test');
  assert.equal(test.calls.length, 0, 'alert_test never calls the endpoint');
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log('PASS backup workflow script: 2xx only succeeds, generic 424 line, non-2xx and curl-failure messages, alert_test without a call, unchanged schedule/permissions/concurrency');
