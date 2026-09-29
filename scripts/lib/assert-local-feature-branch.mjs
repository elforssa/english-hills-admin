import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

export function assertLocalFeatureBranch(root) {
  let branch = execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' }).trim();
  if (!branch) {
    assert.ok(process.env.CI === 'true' && process.env.GITHUB_EVENT_NAME === 'pull_request',
      'Refusing detached HEAD outside pull-request CI');
    branch = (process.env.GITHUB_HEAD_REF || '').trim();
    assert.ok(branch, 'Refusing detached PR checkout without a head branch');
  }
  assert.ok(!['main', 'master'].includes(branch), 'Refusing main or master; use an isolated feature branch');
  return branch;
}
