import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Exercise real Git branch discovery without touching the working repository.
const root = mkdtempSync(join(tmpdir(), 'hills-branch-guard-'));
const env = { ...process.env };
for (const key of Object.keys(env)) {
  if (key.startsWith('GIT_') || key.startsWith('GITHUB_') || key === 'CI') delete env[key];
}
const git = (...args) => execFileSync('git', args, { cwd: root, env, stdio: 'pipe' });
const helper = new URL('./lib/assert-local-feature-branch.mjs', import.meta.url).href;
const probe = `import { assertLocalFeatureBranch } from ${JSON.stringify(helper)};
console.log(assertLocalFeatureBranch(process.cwd()));`;
let cases = 0;
function check(label, overrides, expected) {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', probe], {
    cwd: root, env: { ...env, ...overrides }, encoding: 'utf8',
  });
  assert.ifError(result.error);
  if (expected) {
    assert.equal(result.status, 0, `${label}: ${result.stderr}`);
    assert.equal(result.stdout.trim(), expected, label);
  } else {
    assert.notEqual(result.status, 0, `${label}: unsafe checkout accepted`);
    assert.match(result.stderr, /Refusing/, label);
  }
  cases++;
}
try {
  git('init', '--initial-branch=feature/fixture');
  git('-c', 'user.name=Local Test', '-c', 'user.email=local@example.invalid',
    '-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-m', 'Synthetic branch fixture');
  for (const branch of ['codex/foo', 'codex-migration', 'astra/foo', 'sol/foo', 'claude/foo', 'feature/foo', 'main', 'master']) {
    git('checkout', '-b', branch);
    check(branch, {}, ['main', 'master'].includes(branch) ? null : branch);
    if (['main', 'master'].includes(branch)) {
      check(`${branch} cannot be overridden by PR metadata`,
        { CI: 'true', GITHUB_EVENT_NAME: 'pull_request', GITHUB_HEAD_REF: 'feature/foo' }, null);
    }
  }
  git('checkout', '--detach');
  check('detached local', {}, null);
  check('PR metadata without CI', { GITHUB_EVENT_NAME: 'pull_request', GITHUB_HEAD_REF: 'feature/foo' }, null);
  for (const event of ['push', 'workflow_dispatch', 'pull_request_target', '']) {
    check(`detached ${event || 'unspecified'} CI`, { CI: 'true', GITHUB_EVENT_NAME: event, GITHUB_HEAD_REF: 'feature/foo' }, null);
  }
  for (const head of ['codex/foo', 'astra/foo', 'sol/foo', 'claude/foo', 'feature/foo', '', '   ', 'main', 'master']) {
    check(`detached PR head ${JSON.stringify(head)}`,
      { CI: 'true', GITHUB_EVENT_NAME: 'pull_request', GITHUB_HEAD_REF: head },
      head.trim() && !['main', 'master'].includes(head) ? head : null);
  }
  check('detached PR missing head', { CI: 'true', GITHUB_EVENT_NAME: 'pull_request' }, null);
  console.log(`PASS local feature-branch guard (${cases} cases)`);
} finally {
  rmSync(root, { recursive: true, force: true });
}
