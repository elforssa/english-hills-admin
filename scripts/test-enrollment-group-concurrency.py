#!/usr/bin/env python3
"""Enrollment and group consistency (plan EGC-r2) local-only cross-session races.

Separate PostgreSQL sessions hold real row and advisory locks. Covers: two
placements into the last seat of an in-person group serialize on the seat lock
(I6); a payment and a placement for the same learner serialize on the learner
row in both orders, without deadlock or the retryable code (shared lock order
learner, enrollments, group); an online course close cannot miss a placement
made while it runs (D8 = A). Removes this run's synthetic fixtures.
"""
import json
import os
from pathlib import Path
import re
import subprocess
import time
import uuid
import concurrent.futures

ROOT = Path(__file__).resolve().parents[1]
branch = subprocess.run(['git', 'branch', '--show-current'], cwd=ROOT, capture_output=True, text=True).stdout.strip()
if not branch:
    assert os.environ.get('CI') == 'true' and os.environ.get('GITHUB_EVENT_NAME') == 'pull_request', 'Refusing detached HEAD outside pull-request CI'
    branch = os.environ.get('GITHUB_HEAD_REF', '').strip()
assert branch and branch not in ('main', 'master'), 'Refusing main or master; use an isolated feature branch'
PORT = os.environ.get('EGC_CONCURRENCY_PORT', '54322')
ARGS = ['psql', '-X', '-qAt', '-h', '127.0.0.1', '-p', PORT, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']
ENV = {**os.environ, 'PGPASSWORD': 'postgres'}
run = uuid.uuid4().hex[:8]
admin = str(uuid.uuid4())
ids = {name: str(uuid.uuid4()) for name in ['group', 'online', 'l1', 'l2', 'l3', 'l4', 'l5']}

def sql(text, check=True):
    result = subprocess.run(ARGS, input=text, text=True, capture_output=True, env=ENV, timeout=60)
    if check and result.returncode:
        raise AssertionError(result.stderr)
    return result

def value(text):
    return sql(text).stdout.strip()

def quote(item):
    return "'" + str(item).replace("'", "''") + "'"

def as_admin(statement):
    return f"begin;set local request.jwt.claim.sub={quote(admin)};set local role authenticated;{statement};commit;"

def attempt(statement):
    result = sql('\\set VERBOSITY verbose\n' + as_admin(statement), False)
    if result.returncode:
        code = re.search(r'ERROR:\s+([0-9A-Z]{5}):', result.stderr)
        hint = re.search(r'HINT:\s+(\S+)', result.stderr)
        return {'error': result.stderr, 'code': code and code.group(1), 'hint': hint and hint.group(1)}
    return {'ok': result.stdout.strip()}

def place(student, group):
    return (f"select public.place_learner_in_group({quote(student)},{quote(group)},"
            f"(select updated_at from public.students where id={quote(student)}))")

def pay(student, key):
    payload = json.dumps({'student_id': student, 'session_type': 'Adults', 'school_year': '2026/2027', 'level': 'Beginning 1',
                          'gross_amount': 1000, 'payment_amount': 100, 'payment_method': 'Espèces', 'idempotency_key': key})
    return f"select public.create_charge_payment({quote(payload)}::jsonb)"

class Holder:
    """A second session that runs a statement and keeps its transaction open."""
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
                raise AssertionError('lock holder failed: ' + self.proc.stderr.read())
    def finish(self, verb='commit'):
        self.proc.stdin.write(f'{verb};\n')
        self.proc.stdin.close()
        self.proc.wait(timeout=30)
        assert self.proc.returncode == 0, self.proc.stderr.read()

def later(statement):
    pool = concurrent.futures.ThreadPoolExecutor(max_workers=1)
    future = pool.submit(attempt, statement)
    time.sleep(1.5)
    assert not future.done(), 'the second session must wait for the holder: ' + str(future.result() if future.done() else '')
    return pool, future

def no_retry_codes(result):
    assert result.get('code') not in ('40P01', '40001'), result

created = False
try:
    sql(f"""begin;
insert into auth.users(id,email,aud,role,email_confirmed_at,created_at,updated_at)
values({quote(admin)},'egc-race-{run}@example.test','authenticated','authenticated',now(),now(),now());
update public.profiles set role='admin' where id={quote(admin)};
insert into public.teachers(id,full_name,email,contract_type) values({quote(ids['l5'])},'EGC race teacher {run}','egc-race-t-{run}@example.test','Freelance');
insert into public.groups(id,name,session_type,niveau,annee,capacite_max) values
 ({quote(ids['group'])},'EGC race {run}','Adults','Beginning 1','2026-2027',1),
 ({quote(ids['online'])},'EGC race online {run}','Online','B1','2026-2027',null);
insert into public.students(id,full_name,status,session_type) values
 ({quote(ids['l1'])},'EGC race one {run}','Prospect','Adults'),({quote(ids['l2'])},'EGC race two {run}','Prospect','Adults'),
 ({quote(ids['l3'])},'EGC race three {run}','Prospect','Adults'),({quote(ids['l4'])},'EGC race four {run}','Prospect','Online');
commit;""")
    created = True

    # I6: two placements into the last seat serialize on the group seat lock.
    holder = Holder(place(ids['l1'], ids['group']))
    pool, future = later(place(ids['l2'], ids['group']))
    holder.finish()
    second = future.result(timeout=30); pool.shutdown()
    assert second.get('code') == '23514' and second.get('hint') == 'egc.capacity', second
    assert value(f"select count(*) from public.enrollments where group_id={quote(ids['group'])} and status<>'Rejected'") == '1'
    print('PASS concurrent placements into the last seat: the second waits, then the group is full')

    # Lock order: placement holds the learner, a payment for the same learner waits, both complete.
    sql(f"update public.groups set capacite_max=5 where id={quote(ids['group'])}")
    holder = Holder(place(ids['l3'], ids['group']))
    pool, future = later(pay(ids['l3'], str(uuid.uuid4())))
    holder.finish()
    paid = future.result(timeout=30); pool.shutdown()
    no_retry_codes(paid)
    assert 'ok' in paid, paid
    assert value(f"select string_agg(status,',') from public.enrollments where student_id={quote(ids['l3'])}") == 'Validated', 'the payment confirmed the placed enrollment'
    # And the reverse order: the payment holds the learner, the placement waits.
    holder = Holder(pay(ids['l2'], str(uuid.uuid4())))
    pool, future = later(place(ids['l2'], ids['group']))
    holder.finish()
    placed = future.result(timeout=30); pool.shutdown()
    no_retry_codes(placed)
    # The payment changed the learner file meanwhile: the waiting placement refuses
    # its stale precondition at once (PT409), and succeeds when resent.
    assert placed.get('code') == 'PT409' and placed.get('hint') == 'egc.stale', placed
    assert 'ok' in attempt(place(ids['l2'], ids['group']))
    assert value(f"select status from public.enrollments where student_id={quote(ids['l2'])}") == 'Validated'
    print('PASS payment and placement for one learner serialize in both orders, no deadlock and no retryable code')

    # D8 = A: a placement in flight when the course closes is ended by the close.
    sql(as_admin(f"""select public.online_save_course({quote(ids['online'])},null,
      jsonb_build_object('teacher_id',{quote(ids['l5'])},'audience','adult','term_start',current_date-7,'term_end',current_date+60))"""))
    sql(as_admin(f"""select public.online_activate_course({quote(ids['online'])},
      (select version from public.online_courses where group_id={quote(ids['online'])}),'fake','fake-race-{run}')"""))
    holder = Holder(place(ids['l4'], ids['online']))
    pool, future = later(f"""select public.online_close_course({quote(ids['online'])},
      (select version from public.online_courses where group_id={quote(ids['online'])}))""")
    holder.finish()
    closed = future.result(timeout=30); pool.shutdown()
    no_retry_codes(closed)
    assert 'ok' in closed and json.loads(closed['ok'])['ended'] == 1, closed
    assert value(f"select status||':'||end_reason from public.enrollments where student_id={quote(ids['l4'])}") == 'Ended:Cours en ligne clôturé'
    print('PASS a placement made while the course closes is ended by the close')
finally:
    if created:
        students = ','.join(quote(ids[k]) for k in ['l1', 'l2', 'l3', 'l4'])
        sql(f"""begin;
set local eh.enrollment_command = on;
delete from public.financial_events where actor_id={quote(admin)};
delete from public.financial_requests where actor_id={quote(admin)};
delete from public.receipts where student_id in ({students});
delete from public.charges where student_id in ({students});
delete from public.enrollments where student_id in ({students});
delete from public.online_join_tokens where lesson_id in (select id from public.online_lessons where group_id={quote(ids['online'])});
delete from public.online_lessons where group_id={quote(ids['online'])};
delete from public.online_courses where group_id={quote(ids['online'])};
delete from public.students where id in ({students});
delete from public.groups where id in ({quote(ids['group'])},{quote(ids['online'])});
delete from public.teachers where id={quote(ids['l5'])};
delete from public.activity_log where actor_id={quote(admin)} or target_id in ({students});
delete from auth.users where id={quote(admin)};
commit;""")
