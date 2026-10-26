#!/usr/bin/env python3
"""Portal readiness (plan PRF-r2, T-22) local-only cross-session invitation race.

Two separate PostgreSQL sessions invite the same address. The first holds its
transaction open after prepare_family_invitation; the second is refused at once
with PT409 portal.stale (never a wait, never the retryable code), and the address
ends with exactly the first invitation's pending links. A re-invitation after the
first commits replaces them. Removes this run's synthetic fixtures.
"""
import os
from pathlib import Path
import re
import subprocess
import uuid

ROOT = Path(__file__).resolve().parents[1]
branch = subprocess.run(['git', 'branch', '--show-current'], cwd=ROOT, capture_output=True, text=True).stdout.strip()
if not branch:
    assert os.environ.get('CI') == 'true' and os.environ.get('GITHUB_EVENT_NAME') == 'pull_request', 'Refusing detached HEAD outside pull-request CI'
    branch = os.environ.get('GITHUB_HEAD_REF', '').strip()
assert branch and branch not in ('main', 'master'), 'Refusing main or master; use an isolated feature branch'
PORT = os.environ.get('PORTAL_CONCURRENCY_PORT', '54322')
ARGS = ['psql', '-X', '-qAt', '-h', '127.0.0.1', '-p', PORT, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']
ENV = {**os.environ, 'PGPASSWORD': 'postgres'}
run = uuid.uuid4().hex[:8]
admin = str(uuid.uuid4())
learners = [str(uuid.uuid4()) for _ in range(2)]
address = f'pr-race-{run}@example.test'


def sql(text, check=True):
    result = subprocess.run(ARGS, input=text, text=True, capture_output=True, env=ENV, timeout=60)
    if check and result.returncode:
        raise AssertionError(result.stderr)
    return result


def value(text):
    return sql(text).stdout.strip()


def quote(item):
    return "'" + str(item).replace("'", "''") + "'"


def invite(student):
    return f"select public.prepare_family_invitation({quote(address)},'parent',array[{quote(student)}]::uuid[])"


def attempt(statement):
    result = sql('\\set VERBOSITY verbose\n' + f"begin;set local request.jwt.claim.sub={quote(admin)};"
                 f"set local role authenticated;{statement};commit;", False)
    if result.returncode:
        code = re.search(r'ERROR:\s+([0-9A-Z]{5}):', result.stderr)
        hint = re.search(r'HINT:\s+(\S+)', result.stderr)
        return {'error': result.stderr, 'code': code and code.group(1), 'hint': hint and hint.group(1)}
    return {'ok': result.stdout.strip()}


def pending_for(student=None):
    where = f" and fl.student_id={quote(student)}" if student else ''
    return int(value(f"select count(*) from public.family_links fl join public.pending_roles pr on pr.id=fl.pending_role_id "
                     f"where lower(pr.email)={quote(address)} and fl.status='pending'{where};"))


class Holder:
    """A session that runs a statement and keeps its transaction open."""
    def __init__(self, statement):
        self.proc = subprocess.Popen(ARGS, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=ENV)
        self.proc.stdin.write(f"begin;set local request.jwt.claim.sub={quote(admin)};set local role authenticated;{statement};"
                              "reset role;select 'LOCK_READY';\n")
        self.proc.stdin.flush()
        while True:
            line = self.proc.stdout.readline()
            if line.strip() == 'LOCK_READY':
                break
            if self.proc.poll() is not None or line == '':
                raise AssertionError('holder failed: ' + self.proc.stderr.read())

    def finish(self, verb='commit'):
        self.proc.stdin.write(f'{verb};\n')
        self.proc.stdin.close()
        self.proc.wait(timeout=30)
        assert self.proc.returncode == 0, self.proc.stderr.read()


try:
    sql(f"""begin;
insert into auth.users(id,email,aud,role,email_confirmed_at,created_at,updated_at)
values({quote(admin)},'pr-race-admin-{run}@example.test','authenticated','authenticated',now(),now(),now());
update public.profiles set role='admin' where id={quote(admin)};
insert into public.students(id,full_name,parent_email,status,age_category,session_type) values
  ({quote(learners[0])},'Race Child One {run}',{quote(address)},'Prospect','Young Learners (6-12)','Yearly'),
  ({quote(learners[1])},'Race Child Two {run}',{quote(address)},'Prospect','Young Learners (6-12)','Yearly');
commit;""")

    holder = Holder(invite(learners[0]))
    second = attempt(invite(learners[1]))
    assert second.get('code') == 'PT409' and second.get('hint') == 'portal.stale', second
    holder.finish('commit')
    assert pending_for() == 1 and pending_for(learners[0]) == 1, 'exactly the first invitation\'s links remain'
    print('PASS T-22 concurrent invitations: one set of links and one PT409 portal.stale')

    again = attempt(invite(learners[1]))
    assert 'ok' in again, again
    assert pending_for() == 1 and pending_for(learners[1]) == 1, 'a later re-invitation replaces the pending links'
    print('PASS T-22 a re-invitation after commit replaces the pending links')
finally:
    students = ','.join(quote(s) for s in learners)
    sql(f"""begin;
delete from public.family_links where student_id in ({students});
delete from public.pending_roles where lower(email)={quote(address)};
delete from public.students where id in ({students});
delete from public.activity_log where actor_id={quote(admin)} or target_id in ({students});
delete from auth.users where id={quote(admin)};
commit;""", False)
print('Synthetic fixtures removed.')
