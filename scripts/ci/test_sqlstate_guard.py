"""Regression fixtures for the SQLSTATE 40001 migration guard (audit REL-1)."""
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import sqlstate_guard as guard  # noqa: E402


def fixture(files):
    root = Path(tempfile.mkdtemp())
    migrations = root / 'supabase' / 'migrations'
    migrations.mkdir(parents=True)
    for name, text in files.items():
        (migrations / name).write_text(text)
    return root


class SqlstateGuardTests(unittest.TestCase):
    def test_repository_matches_baseline(self):
        self.assertEqual(guard.check(Path(__file__).resolve().parents[2]), [])

    def test_new_raise_forms_fail(self):
        for body in (
            "raise exception 'stale' using errcode='40001';",
            "RAISE EXCEPTION 'stale' USING ERRCODE = '40001', HINT = 'refresh';",
            "raise sqlstate '40001';",
            "perform online_security.fail('stale', '40001', 'refresh');",
            "raise exception 'stale' using errcode = 'serialization_failure';",
            "raise serialization_failure using message = 'stale';",
            "raise exception serialization_failure;",
            "if stale then raise exception 'x' using errcode='40001'; end if;",
            "raise exception 'retry' using errcode='40001'; -- ci-allow-40001: no per-line exceptions",
        ):
            with self.subTest(body=body):
                errors = guard.check(fixture({'119_new.sql': body + '\n'}))
                self.assertEqual(len(errors), 1)
                self.assertIn('119_new.sql', errors[0])

    def test_non_raises_pass(self):
        for body in (
            "-- this used to raise errcode='40001'",
            "/* errcode='40001'\n   still a comment */ select 1;",
            "exception when serialization_failure then return null;",
            "exception when sqlstate '40001' then perform pg_sleep(0);",
            "raise exception 'stale' using errcode='PT409', hint='refresh';",
            "select 140001, 'x40001y';",
        ):
            with self.subTest(body=body):
                self.assertEqual(guard.check(fixture({'119_new.sql': body + '\n'})), [])

    def test_baseline_cannot_grow_but_may_shrink(self):
        name = '080_crm_commands_and_followup_engine.sql'
        limit = guard.BASELINE[name]
        raise_line = "raise exception 'stale' using errcode='40001';\n"
        self.assertEqual(guard.check(fixture({name: raise_line * limit})), [])
        self.assertEqual(guard.check(fixture({name: raise_line * (limit - 1)})), [])
        errors = guard.check(fixture({name: raise_line * (limit + 1)}))
        self.assertEqual(len(errors), 1)
        self.assertIn(f'baseline {limit}', errors[0])
        # An old migration without a baseline entry is held to zero.
        self.assertEqual(len(guard.check(fixture({'001_initial_schema.sql': raise_line}))), 1)

    def test_main_exit_codes(self):
        old = sys.argv
        try:
            sys.argv = ['sqlstate_guard.py', '--root', str(fixture({'119_ok.sql': 'select 1;\n'}))]
            self.assertEqual(guard.main(), 0)
            sys.argv = ['sqlstate_guard.py', '--root', str(fixture({'119_bad.sql': "raise sqlstate '40001';\n"}))]
            with open('/dev/null', 'w') as sink:
                stderr, sys.stderr = sys.stderr, sink
                try:
                    self.assertEqual(guard.main(), 1)
                finally:
                    sys.stderr = stderr
        finally:
            sys.argv = old


if __name__ == '__main__':
    unittest.main()
