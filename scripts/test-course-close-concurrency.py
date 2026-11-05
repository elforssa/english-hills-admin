#!/usr/bin/env python3
"""Courses with dates — close a finished course (plan CDC-r3, migration 128): local-only
cross-session races.

Separate PostgreSQL sessions hold real row and advisory locks. Every case checks that
the second session waits for the first, then ends without deadlock (40P01) or the
retryable code (40001):

- N-1, both placement paths (the director's place_learner_in_group and reception's
  assign_receptionist_student_group) and a direct management write (an admin's insert
  through RLS for a learner the close does not hold; R3-1), both orders: a placement in
  flight makes the close refuse its count (PT409 course.count_changed); a close in
  flight makes the placement refuse the closed course (23514 course.closed).
- « A suivi ce cours » (attach), both orders: the close holds the learner, a
  placement elsewhere refuses its stale learner; a placement of the listed row makes
  the close refuse its count.
- Two closes of one course: the second replays the first run.
- « Rouvrir le cours » against a placement, « Rouvrir l'inscription » and a leaver.
- Lock order, three sessions (review S2): a blocker holds the listed learner and its
  enrollment row while « Clôturer le cours » (attach) or « Rouvrir le cours » waits on it.
  A placement into the same course must not wait behind the command (it takes its
  learners before the group row), the blocker then places the listed row (or reopens the
  course) and commits, and the command refuses with PT409 without deadlock. Taking the
  group row before the learners makes the placement wait and the blocker deadlock, so
  either check fails.
- S3: an online course closed on its page while a placement waits on the online
  course row: the placement refuses the closed course.
- N-3, through place_learner_in_group and a direct management write, both orders, on a
  dedicated far school year: a placement in flight keeps its group open (left open by
  the year close); a year close in flight makes the placement refuse the group it
  marked.

Lock-order scope (R3-1): deadlock-freedom is claimed through place, or a direct write of
a learner the command does not hold. A direct API update of enrollments.group_id for a
learner the command already holds can still deadlock with it: a known, pre-existing,
out-of-scope limitation (the application never writes enrollments.group_id directly).
- « Clôturer l'année » of the current year against « Clôturer le cours », both
  orders; the year close always rolls back (it would touch every enrollment of the
  year in this database).

Removes this run's synthetic fixtures.
"""
import concurrent.futures
import datetime
import json
import os
from pathlib import Path
import re
import subprocess
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
branch = subprocess.run(['git', 'branch', '--show-current'], cwd=ROOT, capture_output=True, text=True).stdout.strip()
if not branch:
    assert os.environ.get('CI') == 'true' and os.environ.get('GITHUB_EVENT_NAME') == 'pull_request', 'Refusing detached HEAD outside pull-request CI'
    branch = os.environ.get('GITHUB_HEAD_REF', '').strip()
assert branch and branch not in ('main', 'master'), 'Refusing main or master; use an isolated feature branch'
PORT = os.environ.get('CDC_CONCURRENCY_PORT', os.environ.get('EGC_CONCURRENCY_PORT', '54322'))
ARGS = ['psql', '-X', '-qAt', '-h', '127.0.0.1', '-p', PORT, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']
ENV = {**os.environ, 'PGPASSWORD': 'postgres'}
run = uuid.uuid4().hex[:8]
users = {role: str(uuid.uuid4()) for role in ('director', 'admin', 'receptionist')}
DIRECTOR, ADMIN, RECEPTION = users['director'], users['admin'], users['receptionist']
groups, students, enrollments = {}, {}, {}


def sql(text, check=True, app=None):
    env = {**ENV, 'PGAPPNAME': app} if app else ENV
    result = subprocess.run(ARGS, input=text, text=True, capture_output=True, env=env, timeout=90)
    if check and result.returncode:
        raise AssertionError(result.stderr)
    return result


def value(text):
    return sql(text).stdout.strip()


def quote(item):
    return "'" + str(item).replace("'", "''") + "'"


def wrap(user, statement, end='commit'):
    return f"begin;set local request.jwt.claim.sub={quote(user)};set local role authenticated;{statement};{end};"


def attempt(user, statement, end='commit', app=None):
    result = sql('\\set VERBOSITY verbose\n' + wrap(user, statement, end), False, app)
    if result.returncode:
        code = re.search(r'ERROR:\s+([0-9A-Z]{5}):', result.stderr)
        hint = re.search(r'HINT:\s+(\S+)', result.stderr)
        return {'error': result.stderr, 'code': code and code.group(1), 'hint': hint and hint.group(1)}
    return {'ok': result.stdout.strip()}


class Holder:
    """A second session that runs a statement and keeps its transaction open."""
    def __init__(self, user, statement):
        self.proc = subprocess.Popen(ARGS, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=ENV)
        self.proc.stdin.write(f"begin;set local request.jwt.claim.sub={quote(user)};set local role authenticated;{statement};"
                              "reset role;select 'LOCK_READY';\n")
        self.proc.stdin.flush()
        self.output = []
        while True:
            line = self.proc.stdout.readline()
            if line.strip() == 'LOCK_READY':
                break
            if self.proc.poll() is not None or line == '':
                raise AssertionError('lock holder failed: ' + self.proc.stderr.read())
            if line.strip():
                self.output.append(line.strip())

    def finish(self, verb='commit'):
        self.proc.stdin.write(f'{verb};\n')
        self.proc.stdin.close()
        self.proc.wait(timeout=60)
        assert self.proc.returncode == 0, self.proc.stderr.read()


class Blocker:
    """A third session, as the database owner, that holds row locks, then finishes as a user."""
    def __init__(self, statement):
        self.proc = subprocess.Popen(ARGS, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=ENV)
        self.proc.stdin.write(f"begin;{statement};select 'LOCK_READY';\n")
        self.proc.stdin.flush()
        while True:
            line = self.proc.stdout.readline()
            if line.strip() == 'LOCK_READY':
                break
            if self.proc.poll() is not None or line == '':
                raise AssertionError('blocker failed: ' + self.proc.stderr.read())

    def finish_as(self, user, statement):
        out, err = self.proc.communicate(f"set local request.jwt.claim.sub={quote(user)};set local role authenticated;"
                                         f"{statement};reset role;commit;\n", timeout=60)
        assert self.proc.returncode == 0, err
        return out.strip().splitlines()

    def abort(self):
        if self.proc.poll() is None:
            self.proc.communicate('rollback;\n', timeout=60)


def waits_on_lock(app, seconds=15):
    deadline = time.time() + seconds
    while time.time() < deadline:
        if value(f"select count(*) from pg_stat_activity where application_name={quote(app)} and wait_event_type='Lock'") == '1':
            return True
        time.sleep(0.1)
    return False


def three_sessions(label, locks, command, placement, finish):
    """S1 holds `locks`; the director's `command` (S2) must wait on them; a `placement` (S3)
    into the same course must end without waiting behind S2; S1 then runs `finish` as the
    director and commits. Returns the results of S3, S1 and S2."""
    app = f'cdc-race-{label}-{run}'
    blocker = Blocker(locks)
    pool = concurrent.futures.ThreadPoolExecutor(max_workers=2)
    try:
        waiter = pool.submit(attempt, DIRECTOR, command, 'commit', app)
        assert waits_on_lock(app), f'{label}: the command must wait on the blocked learner'
        third = pool.submit(attempt, DIRECTOR, placement)
        try:
            third_result = third.result(timeout=15)
        except concurrent.futures.TimeoutError:
            raise AssertionError(f'{label}: a placement waited behind a command that waits on a learner: '
                                 'the command holds the group row before its learners') from None
        assert not waiter.done(), f'{label}: the command must still wait: {waiter.result()}'
        blocker_output = blocker.finish_as(DIRECTOR, finish)
    except BaseException:
        blocker.abort()
        raise
    result = waiter.result(timeout=60)
    pool.shutdown()
    for item in (third_result, result):
        assert item.get('code') not in ('40P01', '40001'), item
    return third_result, blocker_output, result


def race(holder_user, holder_statement, waiter_user, waiter_statement, holder_end='commit', waiter_end='commit'):
    """The holder runs first and keeps its locks; the waiter must block until it ends."""
    holder = Holder(holder_user, holder_statement)
    pool = concurrent.futures.ThreadPoolExecutor(max_workers=1)
    future = pool.submit(attempt, waiter_user, waiter_statement, waiter_end)
    time.sleep(1.5)
    assert not future.done(), 'the second session must wait for the first: ' + str(future.result() if future.done() else '')
    holder.finish(holder_end)
    result = future.result(timeout=60)
    pool.shutdown()
    assert result.get('code') not in ('40P01', '40001'), result
    return holder.output, result


def refused(result, code, hint):
    assert result.get('code') == code and result.get('hint') == hint, result


def updated(student):
    return f"(select updated_at from public.students where id={quote(student)})"


def place(student, group):
    return f"select public.place_learner_in_group({quote(student)},{quote(group)},{updated(student)})"


def place_new(student, group):
    return (f"select public.place_learner_in_group(p_student=>{quote(student)},p_group=>{quote(group)},"
            f"p_student_updated_at=>{updated(student)},p_without_enrollment_reason=>'Course de test CDC')")


def assign(name, group):
    student, enrollment = students[name], enrollments[name]
    return (f"select public.assign_receptionist_student_group({quote(student)},{quote(enrollment)},{quote(group)},{updated(student)},"
            f"(select updated_at from public.enrollments where id={quote(enrollment)}))")


def direct(name, group, session='Mise à niveau', year=None, level='A1'):
    # A direct management write (RLS insert) of a learner without a row of that programme and year.
    return (f"insert into public.enrollments(student_id,group_id,status,session_type,school_year,level) values "
            f"({quote(students[name])},{quote(groups[group])},'Validated',{quote(session)},{quote(year or YEAR)},{quote(level)})")


def rows_of(name):
    return value(f"select coalesce(string_agg(status||':'||coalesce(group_id::text,'-'),',' order by created_at),'none') "
                 f"from public.enrollments where student_id={quote(students[name])}")


def close(group, count, attach=(), end=()):
    arr = lambda ids: 'array[' + ','.join(quote(enrollments[s]) for s in ids) + ']::uuid[]' if ids else "'{}'::uuid[]"
    return f"select public.close_course({quote(groups[group])},{count},'Cours terminé',{arr(attach)},{arr(end)})"


def reopen(group):
    return f"select public.reopen_course({quote(groups[group])},(select closed_at from public.groups where id={quote(groups[group])}))"


def enrollment_of(student):
    return value(f"select status||':'||coalesce(group_id::text,'-')||':'||coalesce(ended_group_id::text,'-') from public.enrollments "
                 f"where id={quote(enrollments[student])}")


def closed_at(group):
    return value(f"select coalesce(closed_at::text,'open') from public.groups where id={quote(groups[group])}")


today = datetime.date.fromisoformat(value('select public.business_date()'))
YEAR = value('select public.centre_school_year(public.business_date()+1)')
AN = YEAR.replace('/', '-')
FAR_FIRST = int(YEAR[:4]) + 5
FAR_YEAR, FAR_AN = f'{FAR_FIRST}/{FAR_FIRST + 1}', f'{FAR_FIRST}-{FAR_FIRST + 1}'
d = lambda n: (today + datetime.timedelta(days=n)).isoformat()
# Review S3: the last day of the course year's window (31 August of its second year). The
# course year is the school year of tomorrow, so this day is always after today, and d(n)
# for n > 1 is never used: near 31 August it would fall in the next school year.
WINDOW_END = f'{int(YEAR[:4]) + 1}-08-31'

# Finished in-person courses (Mise à niveau A1, ended yesterday), an open one, an online one
# and two undated Yearly groups of a far school year (N-3).
FINISHED = ['n1a', 'n1b', 'r1a', 'r1b', 'd1a', 'd1b', 'at_a', 'at_b', 'two', 'ro_p', 'ro_e', 'ro_l', 'yc_a', 'yc_b', 'lo_c', 'lo_r']
for name in FINISHED + ['open']:
    groups[name] = str(uuid.uuid4())
for name in ('online', 'far1', 'far2', 'far3', 'far4'):
    groups[name] = str(uuid.uuid4())
MEMBERS = {'n1a': ['m_n1a'], 'n1b': ['m_n1b'], 'r1a': ['m_r1a'], 'r1b': ['m_r1b'], 'd1a': ['m_d1a'], 'd1b': ['m_d1b'],
           'at_a': ['m_at_a'], 'at_b': ['m_at_b'],
           'two': ['m_two'], 'ro_p': ['m_ro_p1', 'm_ro_p2'], 'ro_e': ['m_ro_e1', 'm_ro_e2'], 'ro_l': ['m_ro_l'],
           'yc_a': ['m_yc_a'], 'yc_b': ['m_yc_b'], 'lo_r': ['m_lo_r']}
WAITING = ['x_n1a', 'x_n1b', 'x_r1a', 'x_r1b', 'u_at_a', 'u_at_b', 'x_ro_p', 'u_lo_c', 'x_lo_c', 'x_lo_r']
# Learners without any row, entered by a direct management write.
DIRECT = ['x_d1a', 'x_d1b', 'y_far3', 'y_far4']
OTHERS = ['x_online', 'y_far1', 'y_far2'] + DIRECT
for name in [m for ms in MEMBERS.values() for m in ms] + WAITING + OTHERS:
    students[name] = str(uuid.uuid4())
for name in [m for ms in MEMBERS.values() for m in ms] + WAITING:
    enrollments[name] = str(uuid.uuid4())
teacher = str(uuid.uuid4())

created = False
try:
    group_rows = ',\n'.join(f"({quote(groups[g])},'CDC race {g} {run}','Mise à niveau','A1',{quote(AN)},3,{quote(d(-30))},{quote(d(-1))})"
                            for g in FINISHED)
    student_rows = ',\n'.join(f"({quote(students[s])},'CDC race {s} {run}','Enrolled','Mise à niveau')"
                              for s in students if s not in OTHERS)
    enrollment_rows = ',\n'.join(f"({quote(enrollments[s])},{quote(students[s])},'Confirmed','Mise à niveau',{quote(YEAR)},'A1')"
                                 for s in enrollments)
    sql(f"""begin;
insert into auth.users(id,email,aud,role,email_confirmed_at,created_at,updated_at)
select id::uuid,'cdc-race-'||role||'-{run}@example.test','authenticated','authenticated',now(),now(),now()
from (values ({quote(DIRECTOR)},'director'),({quote(ADMIN)},'admin'),({quote(RECEPTION)},'receptionist')) u(id,role);
update public.profiles p set role=u.role from (values ({quote(DIRECTOR)},'director'),({quote(ADMIN)},'admin'),
  ({quote(RECEPTION)},'receptionist')) u(id,role) where p.id=u.id::uuid;
insert into public.teachers(id,full_name,email,contract_type) values({quote(teacher)},'CDC race teacher {run}','cdc-race-t-{run}@example.test','Freelance');
insert into public.groups(id,name,session_type,niveau,annee,capacite_max,date_debut,date_fin) values
{group_rows},
({quote(groups['open'])},'CDC race open {run}','Mise à niveau','A1',{quote(AN)},10,{quote(d(-5))},{quote(WINDOW_END)});
insert into public.groups(id,name,session_type,niveau,annee) values
({quote(groups['online'])},'CDC race online {run}','Online','B1',{quote(AN)}),
({quote(groups['far1'])},'CDC race far one {run}','Yearly','Child 1',{quote(FAR_AN)}),
({quote(groups['far2'])},'CDC race far two {run}','Yearly','Child 1',{quote(FAR_AN)}),
({quote(groups['far3'])},'CDC race far three {run}','Yearly','Child 1',{quote(FAR_AN)}),
({quote(groups['far4'])},'CDC race far four {run}','Yearly','Child 1',{quote(FAR_AN)});
insert into public.students(id,full_name,status,session_type) values
{student_rows},
({quote(students['x_online'])},'CDC race online learner {run}','Prospect','Online'),
({quote(students['y_far1'])},'CDC race far one {run}','Prospect','Yearly'),
({quote(students['y_far2'])},'CDC race far two {run}','Prospect','Yearly'),
({quote(students['x_d1a'])},'CDC race direct one {run}','Prospect','Mise à niveau'),
({quote(students['x_d1b'])},'CDC race direct two {run}','Prospect','Mise à niveau'),
({quote(students['y_far3'])},'CDC race far three {run}','Prospect','Yearly'),
({quote(students['y_far4'])},'CDC race far four {run}','Prospect','Yearly');
insert into public.enrollments(id,student_id,status,session_type,school_year,level) values
{enrollment_rows};
commit;""")
    created = True
    # The members join their course through the director's command.
    for group, members in MEMBERS.items():
        for member in members:
            result = attempt(DIRECTOR, place(students[member], groups[group]))
            assert 'ok' in result, result
    # Two courses are closed before their reopen races; the third one too.
    for group in ('ro_p', 'ro_e', 'ro_l', 'lo_r'):
        assert 'ok' in attempt(DIRECTOR, close(group, len(MEMBERS[group])))

    # N-1, director path, the placement first: the close waits, then refuses its count.
    _, result = race(DIRECTOR, place(students['x_n1a'], groups['n1a']), DIRECTOR, close('n1a', 1))
    refused(result, 'PT409', 'course.count_changed')
    assert closed_at('n1a') == 'open' and enrollment_of('x_n1a').startswith('Validated:' + groups['n1a'])
    # The close first: the placement waits, then refuses the closed course.
    _, result = race(DIRECTOR, close('n1b', 1), DIRECTOR, place(students['x_n1b'], groups['n1b']))
    refused(result, '23514', 'course.closed')
    assert closed_at('n1b') != 'open' and enrollment_of('x_n1b') == 'Confirmed:-:-'
    print('PASS N-1 (director): placement and close serialize on the group row in both orders')

    # N-1, reception path, both orders.
    _, result = race(RECEPTION, assign('x_r1a', groups['r1a']), DIRECTOR, close('r1a', 1))
    refused(result, 'PT409', 'course.count_changed')
    assert closed_at('r1a') == 'open' and enrollment_of('x_r1a').startswith('Validated:' + groups['r1a'])
    _, result = race(DIRECTOR, close('r1b', 1), RECEPTION, assign('x_r1b', groups['r1b']))
    refused(result, '23514', 'course.closed')
    assert enrollment_of('x_r1b') == 'Confirmed:-:-'
    print('PASS N-1 (reception): assignment and close serialize on the group row in both orders')

    # N-1, a direct management write of a learner the close does not hold (R3-1), both orders.
    _, result = race(ADMIN, direct('x_d1a', 'd1a'), DIRECTOR, close('d1a', 1))
    refused(result, 'PT409', 'course.count_changed')
    assert closed_at('d1a') == 'open' and rows_of('x_d1a') == 'Validated:' + groups['d1a'], rows_of('x_d1a')
    _, result = race(DIRECTOR, close('d1b', 1), ADMIN, direct('x_d1b', 'd1b'))
    refused(result, '23514', 'course.closed')
    assert closed_at('d1b') != 'open' and rows_of('x_d1b') == 'none', rows_of('x_d1b')
    print('PASS N-1 (direct write): a direct management insert and the close serialize on the group row in both orders')

    # Attach: the close holds the listed learner; a placement elsewhere refuses its stale learner.
    _, result = race(DIRECTOR, close('at_a', 1, attach=['u_at_a']), DIRECTOR, place(students['u_at_a'], groups['open']))
    assert result.get('code') in ('PT409', '23514'), result
    assert enrollment_of('u_at_a') == f"Ended:-:{groups['at_a']}", enrollment_of('u_at_a')
    # The listed row is placed in the course first: the close waits, then refuses its count.
    _, result = race(DIRECTOR, place(students['u_at_b'], groups['at_b']), DIRECTOR, close('at_b', 1, attach=['u_at_b']))
    refused(result, 'PT409', 'course.count_changed')
    assert closed_at('at_b') == 'open'
    print('PASS attach: the close and a placement of the listed learner serialize on the learner in both orders')

    # Two closes of one course: the second waits on the learners, then replays the first run.
    first, result = race(DIRECTOR, close('two', 1), DIRECTOR, close('two', 1))
    assert 'ok' in result, result
    replay = json.loads(result['ok'].splitlines()[-1]); original = json.loads(first[-1])
    assert replay['replayed'] is True and replay['run_id'] == original['run_id'], (replay, original)
    print('PASS two closes of one course: the second replays the first run')

    # Reopen against a placement: the placement waits for the group row, then joins the reopened course.
    _, result = race(DIRECTOR, reopen('ro_p'), DIRECTOR, place(students['x_ro_p'], groups['ro_p']))
    assert 'ok' in result, result
    assert closed_at('ro_p') == 'open'
    assert value(f"select count(*) from public.enrollments where group_id={quote(groups['ro_p'])} and status='Validated'") == '3'
    # « Rouvrir l'inscription » first: the reopen waits on the learner, then leaves that row as changed.
    reopened = enrollments['m_ro_e1']
    output, result = race(DIRECTOR, f"select public.reopen_enrollment({quote(reopened)},"
                          f"(select updated_at from public.enrollments where id={quote(reopened)}))", DIRECTOR, reopen('ro_e'))
    assert 'ok' in result, result
    outcome = json.loads(result['ok'].splitlines()[-1])
    assert outcome['restored'] == 1 and outcome['skipped'] == [{'enrollment_id': reopened, 'reason': 'changed'}], outcome
    # The reopen first: a leaver for a restored learner waits, then refuses its stale learner or ends the row.
    _, result = race(DIRECTOR, reopen('ro_l'), DIRECTOR,
                     f"select public.remove_learner_from_group({quote(students['m_ro_l'])},{quote(groups['ro_l'])},{updated(students['m_ro_l'])})")
    assert 'ok' in result or result.get('code') == 'PT409', result
    assert closed_at('ro_l') == 'open'
    print('PASS reopen against a placement, « Rouvrir l’inscription » and a leaver: serialized, no deadlock')

    # Lock order, three sessions (review S2). The close (attach) waits on the listed learner
    # held by S1; a placement into the same course is not held behind it; S1 places the
    # listed row and commits; the close refuses its count.
    hold = lambda name: (f"select 1 from public.students where id={quote(students[name])} for update;"
                         f"select 1 from public.enrollments where id={quote(enrollments[name])} for update")
    third, blocker, result = three_sessions('close', hold('u_lo_c'), close('lo_c', 0, attach=['u_lo_c']),
                                            place(students['x_lo_c'], groups['lo_c']), place(students['u_lo_c'], groups['lo_c']))
    assert 'ok' in third, third
    refused(result, 'PT409', 'course.count_changed')
    assert closed_at('lo_c') == 'open', closed_at('lo_c')
    assert enrollment_of('u_lo_c').startswith('Validated:' + groups['lo_c']) and enrollment_of('x_lo_c').startswith('Validated:' + groups['lo_c'])
    # The reopen waits on the member held by S1; a placement into the closed course is refused
    # at once; S1 reopens the course and commits; the waiting reopen refuses its stale mark.
    third, blocker, result = three_sessions('reopen', hold('m_lo_r'), reopen('lo_r'),
                                            place(students['x_lo_r'], groups['lo_r']), reopen('lo_r'))
    refused(third, '23514', 'course.closed')
    assert json.loads(blocker[-1])['restored'] == 1, blocker
    refused(result, 'PT409', 'egc.stale')
    assert closed_at('lo_r') == 'open' and enrollment_of('m_lo_r').startswith('Validated:' + groups['lo_r'])
    assert enrollment_of('x_lo_r') == 'Confirmed:-:-'
    print('PASS lock order: a blocked close or reopen holds no group row; it then refuses with PT409, no deadlock')

    # S3: the online close holds the online course row; the placement waits in the guard, then refuses.
    sql(wrap(ADMIN, f"""select public.online_save_course({quote(groups['online'])},null,
      jsonb_build_object('teacher_id',{quote(teacher)},'audience','adult','term_start',current_date-7,'term_end',current_date+60))"""))
    sql(wrap(ADMIN, f"""select public.online_activate_course({quote(groups['online'])},
      (select version from public.online_courses where group_id={quote(groups['online'])}),'fake','fake-cdc-race-{run}')"""))
    payment = json.dumps({'student_id': students['x_online'], 'session_type': 'Online', 'school_year': YEAR, 'level': 'B1',
                          'gross_amount': 1000, 'payment_amount': 100, 'payment_method': 'Espèces', 'idempotency_key': str(uuid.uuid4())})
    assert 'ok' in attempt(ADMIN, f"select public.create_charge_payment({quote(payment)}::jsonb)")
    _, result = race(ADMIN, f"""select public.online_close_course({quote(groups['online'])},
      (select version from public.online_courses where group_id={quote(groups['online'])}))""", DIRECTOR,
                     place(students['x_online'], groups['online']))
    refused(result, '23514', 'course.closed')
    assert value(f"select count(*) from public.enrollments where group_id={quote(groups['online'])}") == '0'
    print('PASS S3: a placement waiting on a closing online course refuses the closed course')

    # N-3 on a far school year (only this run's rows): a placement in flight keeps its group open.
    year_close = f"select public.close_school_year({quote(FAR_YEAR)},0,'Fin d''année (test CDC)')"
    _, result = race(DIRECTOR, place_new(students['y_far1'], groups['far1']), DIRECTOR, year_close)
    assert 'ok' in result and result['ok'].splitlines()[-1] == '0', result
    assert value(f"select closed_at is null from public.groups where id={quote(groups['far1'])}") == 't'
    assert value(f"select string_agg(status,',') from public.enrollments where student_id={quote(students['y_far1'])}") == 'Validated'
    log = json.loads(value(f"""select after from public.activity_log where changed_columns=array['close_school_year']
      and after->>'school_year'={quote(FAR_YEAR)} order by created_at desc limit 1"""))
    assert log['groups_left_open'] >= 1 and log['groups_marked'] >= 1, log
    assert value(f"select closed_at is not null from public.groups where id={quote(groups['far2'])}") == 't'
    # The year close first: a placement in a group it marks waits, then refuses the closed course.
    sql(f"""begin;set local eh.course_command = on;
update public.groups set closed_at=null, closed_by=null where id={quote(groups['far2'])};
delete from maintenance.course_close_journal where group_id={quote(groups['far2'])};
commit;""")
    # y_far1's placed row now ends with the year: the holder counts it from its preview.
    far_close = (f"select public.close_school_year({quote(FAR_YEAR)},"
                 f"(public.close_school_year_preview({quote(FAR_YEAR)})->>'to_end')::integer,'Fin d''année (test CDC)')")
    _, result = race(DIRECTOR, far_close, DIRECTOR, place_new(students['y_far2'], groups['far2']))
    refused(result, '23514', 'course.closed')
    assert value(f"select count(*) from public.enrollments where student_id={quote(students['y_far2'])}") == '0'
    print('PASS N-3: the year close and a placement serialize on the group row in both orders')

    # N-3 through a direct management write (R3-1): the insert in flight keeps its group open.
    # The two year closes above also marked this run's empty far3 and far4: reopen them first.
    sql(f"""begin;set local eh.course_command = on;
update public.groups set closed_at=null, closed_by=null where id in ({quote(groups['far3'])},{quote(groups['far4'])});
delete from maintenance.course_close_journal where group_id in ({quote(groups['far3'])},{quote(groups['far4'])});
commit;""")
    _, result = race(ADMIN, direct('y_far3', 'far3', 'Yearly', FAR_YEAR, 'Child 1'), DIRECTOR, far_close)
    assert 'ok' in result, result
    assert value(f"select closed_at is null from public.groups where id={quote(groups['far3'])}") == 't'
    assert rows_of('y_far3') == 'Validated:' + groups['far3'], rows_of('y_far3')
    assert value(f"select closed_at is not null from public.groups where id={quote(groups['far4'])}") == 't'
    sql(f"""begin;set local eh.course_command = on;
update public.groups set closed_at=null, closed_by=null where id={quote(groups['far4'])};
delete from maintenance.course_close_journal where group_id={quote(groups['far4'])};
commit;""")
    # The year close first: the direct insert into a group it marks waits, then refuses the closed course.
    _, result = race(DIRECTOR, far_close, ADMIN, direct('y_far4', 'far4', 'Yearly', FAR_YEAR, 'Child 1'))
    refused(result, '23514', 'course.closed')
    assert rows_of('y_far4') == 'none' and rows_of('y_far3') == 'Ended:-', (rows_of('y_far4'), rows_of('y_far3'))
    print('PASS N-3 (direct write): the year close and a direct management insert serialize on the group row in both orders')

    # « Clôturer l'année » of the current year against « Clôturer le cours » (the year close rolls back).
    current_close = (f"select public.close_school_year({quote(YEAR)},"
                     f"(public.close_school_year_preview({quote(YEAR)})->>'to_end')::integer,'Fin d''année (test CDC)')")
    _, result = race(DIRECTOR, current_close, DIRECTOR, close('yc_a', 1), holder_end='rollback')
    assert 'ok' in result and json.loads(result['ok'].splitlines()[-1])['replayed'] is False, result
    _, result = race(DIRECTOR, close('yc_b', 1), DIRECTOR, current_close, waiter_end='rollback')
    refused(result, 'PT409', 'egc.stale')
    assert closed_at('yc_a') != 'open' and closed_at('yc_b') != 'open'
    print('PASS the year close and a course close serialize on the learners in both orders')
finally:
    if created:
        all_students = ','.join(quote(s) for s in students.values())
        all_groups = ','.join(quote(g) for g in groups.values())
        actors = ','.join(quote(u) for u in users.values())
        all_enrollments = ','.join(quote(e) for e in enrollments.values())
        sql(f"""begin;
set local eh.enrollment_command = on;
-- Receipts are never hard-deleted outside this sanctioned local clean-up (Batch E, P2.3a).
set local english_hills.receipt_test_cleanup = 'on';
delete from public.financial_events where actor_id in ({actors});
delete from public.financial_requests where actor_id in ({actors});
delete from public.receipts where student_id in ({all_students});
delete from public.charges where student_id in ({all_students});
delete from public.activity_log where target_id in (select id from public.enrollments where student_id in ({all_students}));
delete from public.enrollments where student_id in ({all_students});
delete from maintenance.course_close_journal where group_id in ({all_groups});
delete from public.online_join_tokens where lesson_id in (select id from public.online_lessons where group_id={quote(groups['online'])});
delete from public.online_lessons where group_id={quote(groups['online'])};
delete from public.online_courses where group_id={quote(groups['online'])};
delete from public.students where id in ({all_students});
delete from public.groups where id in ({all_groups});
delete from public.teachers where id={quote(teacher)};
delete from public.activity_log where actor_id in ({actors}) or target_id in ({all_students}) or target_id in ({all_enrollments});
-- The synthetic director may be the database's only one: removed under the local teardown guard.
alter table public.profiles disable trigger role_security_guard;
delete from auth.users where id in ({actors});
update role_security.director_guard set director_count=(select count(*) from public.profiles where role='director');
alter table public.profiles enable trigger role_security_guard;
commit;""")
