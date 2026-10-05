"""Focused regression fixtures for CI routing and documentation verification."""
import contextlib
import io
import itertools
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import verify


class VerificationTests(unittest.TestCase):
    def test_allowlist(self):
        for path in ('docs/a.md', 'docs/ai/plans/a.md'):
            self.assertTrue(verify.safe_doc_path(path))
        for path in ('AGENTS.md', '.github/workflows/verify.yml', 'scripts/a.md', 'package.json',
                     'docs/a.sql', 'src/a.md', 'docs/a.MD', 'docs/../AGENTS.md', '/docs/a.md', 'docs//a.md'):
            self.assertFalse(verify.safe_doc_path(path), path)

        reviewed_monitor_files = (
            'tools/meta-debugger-transport-monitor/README.md',
            'tools/meta-debugger-transport-monitor/manifest.json',
            'tools/meta-debugger-transport-monitor/rules.json',
            'tools/meta-debugger-transport-monitor/monitor.html',
            'tools/meta-debugger-transport-monitor/monitor.css',
            'tools/meta-debugger-transport-monitor/monitor.js',
            'tools/meta-debugger-transport-monitor/monitor-core.mjs',
            'tools/meta-debugger-transport-monitor/monitor-controller.mjs',
            'scripts/test-meta-debugger-transport-monitor.mjs',
        )
        self.assertEqual(set(reviewed_monitor_files), set(verify.TOOLING_ALLOWLIST))
        for path in reviewed_monitor_files:
            self.assertTrue(verify.safe_tooling_path(path), path)
        for path in (
            'tools/meta-debugger-transport-monitor/new-helper.mjs',
            'tools/database/test-crm.sql',
            'tools/migrations/107.sql',
            'tools/unknown-tool/config.json',
            'tools/x/readme.txt',
            'scripts/ci/verify.py',
            'scripts/test-crm-batch2.sql',
            'src/tool.js',
            'supabase/migrations/107.sql',
            '.github/workflows/verify.yml',
            'package.json',
            'package-lock.json',
            'tools/../src/a.js',
            '/tools/a.js',
            'tools//a.js',
        ):
            self.assertFalse(verify.safe_tooling_path(path), path)

    def test_gate_matrix(self):
        states = ('success', 'skipped', 'failure', 'cancelled', '')
        accepted = {
            ('pull_request', 'docs'): ('success', 'skipped', 'skipped', 'skipped'),
            ('pull_request', 'policy'): ('success', 'skipped', 'skipped', 'skipped'),
            ('pull_request', 'tooling'): ('success', 'success', 'skipped', 'skipped'),
            ('pull_request', 'full'): ('success', 'skipped', 'success', 'success'),
            ('push', 'full'): ('skipped', 'skipped', 'success', 'skipped'),
        }
        for event, mode in itertools.product(('pull_request', 'push', 'unknown', ''),
                                             ('docs', 'policy', 'tooling', 'full', 'unknown', '')):
            for classifier, *jobs in itertools.product(states, repeat=5):
                expected = classifier == 'success' and tuple(jobs) == accepted.get((event, mode))
                self.assertEqual(verify.gate(event, mode, classifier, *jobs), expected)

    def test_links_and_anchors(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'docs').mkdir()
            target = root / 'docs/target (v1).md'
            target.write_text('# Heading `code`\n# Repeat\n# Repeat\n## Français\n')
            source = root / 'docs/source.md'
            source.write_text('[inline](target%20(v1).md#heading-code)\n[ref][ok]\n'
                              '[ok]: <target (v1).md#repeat-1>\n[unicode](target%20(v1).md#français)\n'
                              '`[ignored](absent.md)`\n```md\n[ignored](absent.md)\n```\n')
            self.assertEqual(verify.check_links(root, Path('docs/source.md')), [])
            for content in ('[bad](absent.md)', '[bad](target%20(v1).md#absent)',
                            '[bad](../../outside.md)', '[bad][missing]'):
                source.write_text(content)
                try:
                    self.assertTrue(verify.check_links(root, Path('docs/source.md')))
                except ValueError:
                    pass

    def test_multiple_inline_links(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'ok.md').write_text('# First\n# Second\n')
            (root / 'target(v1).md').write_text('# Heading\n')
            source = root / 'source.md'
            fixtures = (
                ('[first](ok.md) [second](ok.md)', 0),
                ('[first](ok.md) [broken](missing.md)', 1),
                ('[broken](missing.md) [second](ok.md)', 1),
                ('[first](ok.md#first) [second](ok.md#second)', 0),
                ('[first](ok.md#first) [broken](ok.md#missing)', 1),
                ('[broken](ok.md#missing) [second](ok.md#second)', 1),
                ('[one](target(v1).md#heading) [two](target(v1).md)', 0),
                ('[one](target(v1).md) [broken](missing(v2).md)', 1),
            )
            for content, count in fixtures:
                with self.subTest(content=content):
                    source.write_text(content)
                    self.assertEqual(len(verify.check_links(root, Path('source.md'))), count)

    def test_added_machine_local_paths(self):
        fixtures = (
            'Local path /Users/name/project/report.md',
            'Local path /home/name/report.md',
            '```sh\ncat /home/name/report.md\n```',
            r'C:\Users\name\report.md',
            'file:///Users/name/report.md',
            'file:///home/name/report.md',
            'file:///C:/Users/name/report.md',
            'file://localhost/private/report.md',
            '[local](/Users/name/report.md)',
            '[local](file:///home/name/report.md)',
        )
        for content in fixtures:
            with self.subTest(content=content):
                self.assertIn('machine-local path', verify.sensitive_added(content))
        for content in ('docs/ai/CURRENT_STATE.md', '../architecture/plans/a.md',
                        'docs/home/name/report.md', 'docs/Users/name/report.md'):
            self.assertEqual(verify.sensitive_added(content), [])

    def test_sensitive_patterns(self):
        for content in ('-----BEGIN PRIVATE KEY-----', 'ghp_' + 'a' * 30,
                        'eyJ' + 'a'*20 + '.' + 'b'*20 + '.' + 'c'*20,
                        'person@school.test', '+212 612 345 678', '0612345678', 'password=' + 'a'*24,
                        'postgresql://owner:password@host'):
            self.assertTrue(verify.sensitive_added(content))
        self.assertEqual(verify.sensitive_added('person@example.com 2026-10-03 `TOKEN_REFERENCE`'), [])

    def test_actual_git_diffs_and_docs(self):
        with tempfile.TemporaryDirectory() as directory:
            old = Path.cwd()
            checker = Path(verify.__file__).resolve()
            try:
                os.chdir(directory)
                def run(*args):
                    return subprocess.check_output(['git', *args], stderr=subprocess.DEVNULL).decode().strip()
                run('init')
                run('config', 'user.email', 'fixture@example.com')
                run('config', 'user.name', 'Fixture')
                Path('docs').mkdir()
                Path('docs/a.md').write_text('# Fixture\n')
                Path('AGENTS.md').write_text('# Root\n')
                run('add', 'docs/a.md', 'AGENTS.md')
                run('commit', '-m', 'base')
                base = run('rev-parse', 'HEAD')
                def commit(*paths):
                    run('add', *paths)
                    run('commit', '-m', 'fixture')
                    return run('rev-parse', 'HEAD')
                with contextlib.redirect_stderr(io.StringIO()):
                    self.assertEqual(verify.classify(base, base), 'full')
                    self.assertEqual(verify.classify('0'*40, base), 'full')
                Path('docs/a.md').write_text('# Fixture\n[self](#fixture)\n')
                docs = commit('docs/a.md')
                self.assertEqual(verify.classify(base, docs), 'docs')
                verify.check_docs(base, docs)
                Path('AGENTS.md').write_text('# Changed\n')
                mixed = commit('AGENTS.md')
                self.assertEqual(verify.classify(docs, mixed), 'policy')
                self.assertEqual(verify.classify(base, mixed), 'policy')

                run('reset', '--hard', docs)
                monitor_dir = Path('tools/meta-debugger-transport-monitor')
                monitor_dir.mkdir(parents=True, exist_ok=True)
                Path(monitor_dir / 'manifest.json').write_text('{}\n')
                tooling = commit('tools/meta-debugger-transport-monitor/manifest.json')
                self.assertEqual(verify.classify(docs, tooling), 'tooling')

                Path('docs/tooling.md').write_text('# Tooling\n')
                tooling_with_docs = commit('docs/tooling.md')
                self.assertEqual(verify.classify(docs, tooling_with_docs), 'tooling')

                run('reset', '--hard', docs)
                Path('scripts').mkdir(exist_ok=True)
                Path('scripts/test-meta-debugger-transport-monitor.mjs').write_text('process.exit(0);\n')
                monitor_test = commit('scripts/test-meta-debugger-transport-monitor.mjs')
                self.assertEqual(verify.classify(docs, monitor_test), 'tooling')

                for tool_path in (
                    'tools/database/test-crm.sql',
                    'tools/migrations/107.sql',
                    'tools/unknown-tool/config.json',
                    'tools/meta-debugger-transport-monitor/new-helper.mjs',
                ):
                    run('reset', '--hard', docs)
                    candidate = Path(tool_path)
                    candidate.parent.mkdir(parents=True, exist_ok=True)
                    candidate.write_text('fixture\n')
                    tool_unknown = commit(tool_path)
                    self.assertEqual(verify.classify(docs, tool_unknown), 'full', tool_path)

                for mixed_path in (
                    'src/runtime.js',
                    'supabase/migrations/107.sql',
                    'package.json',
                ):
                    run('reset', '--hard', docs)
                    monitor_dir = Path('tools/meta-debugger-transport-monitor')
                    monitor_dir.mkdir(parents=True, exist_ok=True)
                    Path(monitor_dir / 'manifest.json').write_text('{}\n')
                    mixed_candidate = Path(mixed_path)
                    mixed_candidate.parent.mkdir(parents=True, exist_ok=True)
                    mixed_candidate.write_text('fixture\n')
                    mixed_change = commit(
                        'tools/meta-debugger-transport-monitor/manifest.json',
                        mixed_path,
                    )
                    self.assertEqual(verify.classify(docs, mixed_change), 'full', mixed_path)

                run('reset', '--hard', docs)
                Path('scripts').mkdir(exist_ok=True)
                Path('scripts/test-crm-batch2.sql').write_text('select 1;\n')
                db_test = commit('scripts/test-crm-batch2.sql')
                self.assertEqual(verify.classify(docs, db_test), 'full')

                run('reset', '--hard', docs)
                monitor_dir = Path('tools/meta-debugger-transport-monitor')
                monitor_dir.mkdir(parents=True, exist_ok=True)
                Path(monitor_dir / 'manifest.json').symlink_to('../../AGENTS.md')
                tooling_symlink = commit('tools/meta-debugger-transport-monitor/manifest.json')
                self.assertEqual(verify.classify(docs, tooling_symlink), 'full')

                run('reset', '--hard', docs)
                Path('src').mkdir(exist_ok=True)
                Path('src/runtime.js').write_text('export const runtime = true;\n')
                runtime = commit('src/runtime.js')
                monitor_dir = Path('tools/meta-debugger-transport-monitor')
                monitor_dir.mkdir(parents=True, exist_ok=True)
                run('mv', 'src/runtime.js', 'tools/meta-debugger-transport-monitor/monitor.js')
                runtime_to_tool = commit('tools/meta-debugger-transport-monitor/monitor.js')
                self.assertEqual(verify.classify(runtime, runtime_to_tool), 'full')
                run('reset', '--hard', docs)
                Path('unknown.config').write_text('fixture\n')
                unknown = commit('unknown.config')
                self.assertEqual(verify.classify(docs, unknown), 'full')
                run('reset', '--hard', docs)
                Path('docs/new.md').write_text('# New\n')
                added = commit('docs/new.md')
                self.assertEqual(verify.classify(docs, added), 'docs')
                run('mv', 'docs/new.md', 'docs/renamed.md')
                doc_rename = commit('docs/renamed.md')
                self.assertEqual(verify.classify(added, doc_rename), 'docs')
                run('reset', '--hard', docs)
                run('mv', 'AGENTS.md', 'docs/root.md')
                renamed = commit('docs/root.md')
                self.assertEqual(verify.classify(docs, renamed), 'policy')
                run('reset', '--hard', docs)
                Path('docs/a.md').unlink()
                deleted = commit('docs/a.md')
                self.assertEqual(verify.classify(docs, deleted), 'docs')
                verify.check_docs(docs, deleted)
                run('reset', '--hard', docs)
                Path('docs/symlink.md').symlink_to('../AGENTS.md')
                symlink = commit('docs/symlink.md')
                self.assertEqual(verify.classify(docs, symlink), 'full')
                run('reset', '--hard', docs)
                Path('docs/a.md').write_text('# Fixture\n[bad](missing.md)\n++person@school.test\n')
                bad = commit('docs/a.md')
                with self.assertRaises(ValueError) as error:
                    verify.check_docs(docs, bad)
                self.assertIn('Missing', str(error.exception))
                self.assertIn('personal email', str(error.exception))
                # Removed historical sensitive content must not trigger added-content checks.
                Path('docs/a.md').write_text('# Fixture\n')
                removed = commit('docs/a.md')
                verify.check_docs(bad, removed)
                # Added paths are checked in prose, code and destinations; removals pass.
                for content in ('/Users/name/report.md', '```sh\n/home/name/report.md\n```',
                                r'C:\Users\name\report.md', '[local](file:///Users/name/report.md)'):
                    Path('docs/a.md').write_text('# Fixture\n' + content + '\n')
                    local = commit('docs/a.md')
                    with self.assertRaisesRegex(ValueError, 'machine-local path'):
                        verify.check_docs(removed, local)
                    Path('docs/a.md').write_text('# Fixture\n')
                    cleaned = commit('docs/a.md')
                    verify.check_docs(local, cleaned)
                    removed = cleaned
                # Exercise real CLI diagnostics, including path/query/fragment material.
                token = 'ghp_' + 'syntheticTokenValue' * 3
                for destination, closed in ((f'missing-{token}.md?token={token}#{token}', True),
                                            (f'a.md#{token}', True), (f'missing.md?token={token}', True),
                                            (f'missing.md%00{token}', True), (f'missing-{token}.md', False)):
                    Path('docs/a.md').write_text('# Fixture\n[broken](' + destination + (')' if closed else '') + '\n')
                    failing = commit('docs/a.md')
                    result = subprocess.run([sys.executable, str(checker), 'docs',
                                             '--base', removed, '--head', failing],
                                            capture_output=True, text=True)
                    self.assertNotEqual(result.returncode, 0)
                    self.assertNotIn(token, result.stdout + result.stderr)
                    self.assertIn('link 1 (destination redacted)' if closed else 'Invalid Markdown link syntax', result.stderr)
                    self.assertIn('docs/a.md', result.stderr)
                    Path('docs/a.md').write_text('# Fixture\n')
                    removed = commit('docs/a.md')
                Path('docs/a.md').write_text('# Fixture  \n')
                whitespace = commit('docs/a.md')
                with self.assertRaisesRegex(ValueError, "git diff --check failed"):
                    verify.check_docs(removed, whitespace)
            finally:
                os.chdir(old)

    def test_workflow_unknown_mode_runs_database(self):
        root = Path(__file__).resolve().parents[2]
        workflow = (root / '.github/workflows/verify.yml').read_text()
        expected = (
            "if: always() && github.event_name == 'pull_request' && "
            "(needs.classify.result != 'success' || "
            "(needs.classify.outputs.mode != 'docs' && needs.classify.outputs.mode != 'policy' && needs.classify.outputs.mode != 'tooling'))"
        )
        self.assertIn(expected, workflow)
        self.assertNotIn(
            "needs.classify.result != 'success' || needs.classify.outputs.mode == 'full'",
            workflow,
        )

    def test_all_lane_paths_and_modes(self):
        self.assertEqual(verify.POLICY_ALLOWLIST, {'AGENTS.md'})
        groups = {
            'docs': ['docs/a.md', 'docs/ai/templates/task.md'],
            'policy': ['AGENTS.md'],
            'tooling': sorted(verify.TOOLING_ALLOWLIST),
            'full': ['README.md', 'AGENT.md', 'src/a.js', 'supabase/migrations/107.sql',
                     'scripts/test-crm.sql', 'package.json', 'package-lock.json',
                     'scripts/ci/verify.py', '.github/workflows/verify.yml', 'next.config.js',
                     'unknown', 'tools/other.js', 'tools/meta-debugger-transport-monitor/new.js',
                     'docs/../a.md', 'docs//a.md', '/docs/a.md'],
        }
        for lane, paths in groups.items():
            for path, status in itertools.product(paths, ('A', 'M', 'D')):
                with self.subTest(path=path, status=status):
                    with patch.object(verify, 'changes', return_value=('a'*40, [(status, path)])), patch.object(verify, 'regular_blob_at', return_value=True):
                        self.assertEqual(verify.classify('a'*40, 'b'*40), lane)
        for lane in ('docs', 'policy', 'tooling'):
            path = groups[lane][0]
            for mode in ('100755 blob', '120000 blob', '160000 commit', '040000 tree'):
                with patch.object(verify, 'changes', return_value=('a'*40, [('M', path)])), patch.object(verify, 'git', return_value=(mode + ' deadbeef\t' + path + '\n').encode()):
                    self.assertEqual(verify.classify('a'*40, 'b'*40), 'full')
            for status in ('R100', 'C100', 'T', 'U', 'X', ''):
                with patch.object(verify, 'changes', return_value=('a'*40, [(status, path)])):
                    self.assertEqual(verify.classify('a'*40, 'b'*40), 'full')
        for first, second in itertools.product(groups, repeat=2):
            paths = [('M', groups[first][0]), ('M', groups[second][0])]
            expected = first if first == second else second if first == 'docs' else first if second == 'docs' else 'full'
            with patch.object(verify, 'changes', return_value=('a'*40, paths)), patch.object(verify, 'regular_blob_at', return_value=True):
                self.assertEqual(verify.classify('a'*40, 'b'*40), expected)

    def test_mixed_sensitive_paths(self):
        for eligible, sensitive in itertools.product(
                ('docs/a.md', 'AGENTS.md', *verify.TOOLING_ALLOWLIST),
                ('src/a.js', 'supabase/migrations/107.sql', 'scripts/test-crm.sql',
                 'package.json', 'package-lock.json', '.github/workflows/verify.yml',
                 'scripts/ci/test_verify.py')):
            for entries in ([('M', eligible), ('M', sensitive)], [('D', sensitive), ('A', eligible)]):
                with patch.object(verify, 'changes', return_value=('a'*40, entries)), patch.object(verify, 'regular_blob_at', return_value=True):
                    self.assertEqual(verify.classify('a'*40, 'b'*40), 'full')

    def test_exact_shas_and_malformed_diff(self):
        for ref in ('main', 'HEAD', 'a'*39, 'a'*41, 'G'*40, ''):
            with self.assertRaises(ValueError):
                verify.changes(ref, 'b'*40)
        for raw in (b'', b'M\0docs/a.md', b'M\0', b'\xff\0docs/a.md\0'):
            with patch.object(verify, 'git', side_effect=[b'', b'', b'a'*40 + b'\n', raw]):
                with self.assertRaises((ValueError, UnicodeError)):
                    verify.changes('a'*40, 'b'*40)

    def test_policy_and_workflow_contract(self):
        root = Path(__file__).resolve().parents[2]
        agents = (root / 'AGENTS.md').read_text()
        for anchor in ('risk-based-lifecycle', 'independent-review', 'implementation-handoff',
                       'ci-selection-and-remote-ci-handoff', 'outcome-based-batching'):
            self.assertIn(anchor, verify.anchors(agents))
        for name in ('ARCHITECTURE_TASK', 'IMPLEMENTATION_TASK', 'REVIEW_TASK', 'PRODUCTION_ROLLOUT'):
            path = Path('docs/ai/templates') / (name + '.md')
            self.assertEqual(verify.check_links(root, path), [])
            self.assertIn('../../../AGENTS.md', (root / path).read_text())
            self.assertNotIn('proposed v2', (root / path).read_text())
        workflow = (root / '.github/workflows/verify.yml').read_text()
        self.assertIn('needs: [classify, docs, tooling, app, local-database]', workflow)
        self.assertIn('TOOLING: ${{ needs.tooling.result }}', workflow)
        docs_job = workflow.split('  docs:\n')[1].split('  tooling:\n')[0]
        self.assertIn("if: always() && github.event_name == 'pull_request'", docs_job)
        tooling_job = workflow.split('  tooling:\n')[1].split('  app:\n')[0]
        self.assertIn('node scripts/test-meta-debugger-transport-monitor.mjs', tooling_job)
        self.assertNotIn('npm ci', tooling_job)
        self.assertNotIn('cache: npm', tooling_job)
        app_job = workflow.split('  app:\n')[1].split('  local-database:\n')[0]
        self.assertIn("if: always() && (needs.classify.result != 'success' || (needs.classify.outputs.mode != 'docs' && needs.classify.outputs.mode != 'policy' && needs.classify.outputs.mode != 'tooling'))", app_job)

    def test_classifier_edge_cases_fail_closed(self):
        allowed = 'tools/meta-debugger-transport-monitor/manifest.json'
        with patch.object(verify, 'changes', return_value=('a'*40, [('R100', allowed)])):
            self.assertEqual(verify.classify('a'*40, 'b'*40), 'full')
        with patch.object(verify, 'changes', return_value=('a'*40, [('T', allowed)])):
            self.assertEqual(verify.classify('a'*40, 'b'*40), 'full')
        for tree_entry in (
            b'100755 blob deadbeef\t' + allowed.encode() + b'\n',
            b'160000 commit deadbeef\t' + allowed.encode() + b'\n',
        ):
            with patch.object(verify, 'git', return_value=tree_entry):
                self.assertFalse(verify.regular_blob_at('a'*40, allowed, True))
        with patch.object(verify, 'changes', side_effect=ValueError('Malformed diff')):
            with contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(verify.classify('a'*40, 'b'*40), 'full')

    def test_classifier_errors_close_to_full(self):
        with patch.object(verify, 'changes', side_effect=ValueError('Uncertainty')):
            with contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(verify.classify('a'*40, 'b'*40), 'full')


if __name__ == '__main__':
    unittest.main()
