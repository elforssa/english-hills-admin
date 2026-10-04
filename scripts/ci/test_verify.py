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

        for path in (
            'tools/meta-debugger-transport-monitor/manifest.json',
            'tools/x/readme.txt',
            'scripts/test-meta-debugger-transport-monitor.mjs',
        ):
            self.assertTrue(verify.safe_tooling_path(path), path)
        for path in (
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
        for event, mode in itertools.product(('pull_request', 'push'), ('docs', 'tooling', 'full', '')):
            for classifier, docs, app, database in itertools.product(states, repeat=4):
                expected = classifier == 'success' and (
                    event == 'pull_request' and mode == 'docs'
                    and docs == 'success' and app == database == 'skipped'
                    or event == 'pull_request' and mode == 'tooling'
                    and docs == app == 'success' and database == 'skipped'
                    or mode == 'full' and docs == 'skipped' and app == 'success'
                    and database == ('success' if event == 'pull_request' else 'skipped'))
                self.assertEqual(verify.gate(event, mode, classifier, docs, app, database), expected)

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
                self.assertEqual(verify.classify(base, mixed), 'full')

                run('reset', '--hard', docs)
                Path('tools').mkdir()
                Path('tools/fixture').mkdir()
                Path('tools/fixture/tool.js').write_text('export const fixture = true;\n')
                tooling = commit('tools/fixture/tool.js')
                self.assertEqual(verify.classify(docs, tooling), 'tooling')

                Path('docs/tooling.md').write_text('# Tooling\n')
                tooling_with_docs = commit('docs/tooling.md')
                self.assertEqual(verify.classify(docs, tooling_with_docs), 'tooling')

                run('reset', '--hard', docs)
                Path('scripts').mkdir(exist_ok=True)
                Path('scripts/test-meta-debugger-transport-monitor.mjs').write_text('process.exit(0);\n')
                monitor_test = commit('scripts/test-meta-debugger-transport-monitor.mjs')
                self.assertEqual(verify.classify(docs, monitor_test), 'tooling')

                run('reset', '--hard', docs)
                Path('scripts/test-crm-batch2.sql').write_text('select 1;\n')
                db_test = commit('scripts/test-crm-batch2.sql')
                self.assertEqual(verify.classify(docs, db_test), 'full')
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
                self.assertEqual(verify.classify(docs, renamed), 'full')
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

    def test_classifier_errors_close_to_full(self):
        with patch.object(verify, 'changes', side_effect=ValueError('Uncertainty')):
            with contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(verify.classify('a'*40, 'b'*40), 'full')


if __name__ == '__main__':
    unittest.main()
