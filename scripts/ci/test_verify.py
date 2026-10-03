"""Focused regression fixtures for CI routing and documentation verification."""
import contextlib
import io
import itertools
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import verify


class VerificationTests(unittest.TestCase):
    def test_allowlist(self):
        for path in ('docs/a.md', 'docs/ai/plans/a.md'):
            self.assertTrue(verify.safe_path(path))
        for path in ('AGENTS.md', '.github/workflows/verify.yml', 'scripts/a.md', 'package.json',
                     'docs/a.sql', 'src/a.md', 'docs/a.MD', 'docs/../AGENTS.md', '/docs/a.md', 'docs//a.md'):
            self.assertFalse(verify.safe_path(path), path)

    def test_gate_matrix(self):
        states = ('success', 'skipped', 'failure', 'cancelled', '')
        for event, mode in itertools.product(('pull_request', 'push'), ('docs', 'full', '')):
            for classifier, docs, app, database in itertools.product(states, repeat=4):
                expected = classifier == 'success' and (
                    event == 'pull_request' and mode == 'docs' and docs == 'success' and app == database == 'skipped'
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
