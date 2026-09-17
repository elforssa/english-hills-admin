import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

export function assertLocalFeatureBranch(root) {
  const branch = execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' }).trim();
  if (!branch && process.env.CI === 'true' && process.env.GITHUB_EVENT_NAME === 'pull_request') {
    const head = process.env.GITHUB_HEAD_REF || '';
    assert.ok(head === 'codex-migration' || head.startsWith('codex/'), 'Refusing detached CI checkout from a non-Codex branch');
    return head;
  }
  assert.ok(branch === 'codex-migration' || branch.startsWith('codex/'), 'Refusing a non-Codex feature branch or detached HEAD');
  assert.notEqual(branch, 'main', 'Refusing main');
  return branch;
}
