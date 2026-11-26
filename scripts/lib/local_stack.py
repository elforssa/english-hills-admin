"""Local-stack guard for the Python scripts (RWR-r5 follow-ups 142, owner item 11).

Calls scripts/lib/local-stack.mjs so the JavaScript and Python scripts share one rule:
HILLS_LOCAL_STACK must name this checkout's Supabase stack (supabase/config.toml project_id),
and every hard-coded target (database port, API URL, container) must be that stack's.
Call it before the first statement:

    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from lib.local_stack import assert_local_stack
    assert_local_stack(db_port='54322')
"""
from pathlib import Path
import subprocess

GUARD = Path(__file__).resolve().parent / 'local-stack.mjs'


def assert_local_stack(db_port=None, api_url=None, container=None):
    args = ['node', str(GUARD), 'assert']
    for flag, value in (('--db-port', db_port), ('--api-url', api_url), ('--container', container)):
        if value is not None:
            args += [flag, str(value)]
    result = subprocess.run(args, text=True, capture_output=True, timeout=60)
    if result.returncode:
        raise SystemExit(result.stderr.strip() or 'Local-stack guard refused')


def reset_local_database(*args):
    subprocess.run(['node', str(GUARD), 'db-reset', *args], check=True, timeout=1800)
