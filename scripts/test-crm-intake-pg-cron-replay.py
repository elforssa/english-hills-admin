#!/usr/bin/env python3
"""Local-only fresh 001-095 and 094-to-095 replay in disposable databases."""
from pathlib import Path
import subprocess
import sys

platform = Path(sys.argv[1]).read_text()
assert 'CREATE TABLE auth.users' in platform and 'CREATE TABLE storage.objects' in platform
assert 'CREATE TABLE public.' not in platform and '\nCOPY ' not in platform
files = sorted(Path('supabase/migrations').glob('*.sql'))
assert [f.name[:3] for f in files] == [f'{i:03}' for i in range(1, 96)]
container = 'supabase_db_hills-admin-next'


def run(args, data=''):
    result = subprocess.run(
        ['docker', 'exec', '-i', '-e', 'PGPASSWORD=postgres', container, *args],
        input=data,
        text=True,
        capture_output=True,
        timeout=180,
    )
    if result.returncode:
        raise AssertionError(result.stderr)
    return result.stdout.strip()


def sql(db, data, user='postgres'):
    return run(['psql', '-X', '-qAt', '-vON_ERROR_STOP=1', '-U', user, '-d', db], data)


for db in ('scheduler95_fresh', 'scheduler95_upgrade'):
    run(['createdb', '-U', 'supabase_admin', '-O', 'postgres', '-T', 'template0', db])
    try:
        sql(db, platform, 'supabase_admin')
        apply_files = files if db.endswith('fresh') else files[:-1]
        for migration in apply_files:
            sql(db, migration.read_text())

        if db.endswith('upgrade'):
            sql(db, """
insert into auth.users(id,email,aud,role)
values('95000000-0000-0000-0000-000000000001','scheduler-upgrade@example.invalid','authenticated','authenticated');
update profiles set role='director' where id='95000000-0000-0000-0000-000000000001';
""")
            before = sql(db, "select count(*) from auth.users where id='95000000-0000-0000-0000-000000000001'")
            sql(db, files[-1].read_text())
            assert before == '1'
            assert sql(db, "select count(*) from auth.users where id='95000000-0000-0000-0000-000000000001'") == '1'
            print('PASS 094 to 095 retained application data', flush=True)

        # Replay is intentional: CREATE OR REPLACE plus named cron scheduling must
        # remain safe. pg_cron itself is confined to its configured postgres DB,
        # so disposable databases verify the function and skip the global job.
        sql(db, files[-1].read_text())
        assert sql(db, "select to_regprocedure('crm_security.invoke_crm_intake_scheduler()') is not null") == 't'
        assert sql(db, "select count(*) from pg_extension where extname='pg_cron'") == '0'
        assert sql(db, "select count(*) from vault.secrets where name like 'crm_intake_scheduler_%'") == '0'
        print(f'PASS {db} migration replay without secrets or external requests', flush=True)
    finally:
        run(['dropdb', '-U', 'supabase_admin', db])
        print(f'PASS removed disposable database {db}', flush=True)
