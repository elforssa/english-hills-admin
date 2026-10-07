#!/usr/bin/env python3
"""RCC-A2 local-only cross-session races. Removes this run's synthetic fixtures.

Separate PostgreSQL sessions hold real row and advisory locks (no simulated
sequential retries). Covers the linkage races, the intent-lock reason with the
lock still held, and a same-key replay after the chosen follow-up time passed.
"""
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
ARGS = ['psql', '-X', '-qAt', '-h', '127.0.0.1', '-p', '54322', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']
ENV = {**os.environ, 'PGPASSWORD': 'postgres'}
actor = str(uuid.uuid4())
extra_students = []

def sql(text, check=True):
    result = subprocess.run(ARGS, input=text, text=True, capture_output=True, env=ENV, timeout=60)
    if check and result.returncode:
        raise AssertionError(result.stderr)
    return result

def value(text):
    return sql(text).stdout.strip()

def quote(item):
    return "'" + str(item).replace("'", "''") + "'"

def call(name, key, payload):
    # UUIDs and a locally serialized JSON object only; never shell interpolation.
    result = sql(f"""\\set VERBOSITY verbose
begin;
set local request.jwt.claim.sub={quote(actor)};
set local role authenticated;
select public.crm_{name}({quote(key)}::uuid,{quote(json.dumps(payload))}::jsonb);
commit;""", False)
    if result.returncode:
        code = re.search(r'ERROR:\s+([0-9A-Z]{5}):\s*(.*)', result.stderr)
        hint = re.search(r'HINT:\s+crm_enrollment\.([a-z_]+)', result.stderr)
        return {'error': result.stderr, 'code': code and code.group(1), 'message': code and code.group(2).strip(), 'reason': hint and hint.group(1)}
    return json.loads(result.stdout.strip())

class Holder:
    """A second session that runs a statement and keeps its transaction open."""
    def __init__(self, statement):
        self.proc = subprocess.Popen(ARGS, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=ENV)
        self.proc.stdin.write(f"begin;set local request.jwt.claim.sub={quote(actor)};set local role authenticated;{statement}reset role;select 'LOCK_READY';\n")
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
        self.proc.wait(timeout=20)
        assert self.proc.returncode == 0, self.proc.stderr.read()

def later(function, *args):
    # Starts a caller that will block on the holder's lock.
    import concurrent.futures
    pool = concurrent.futures.ThreadPoolExecutor(max_workers=1)
    future = pool.submit(function, *args)
    time.sleep(1)
    assert not future.done(), 'caller must wait for the holder lock'
    return pool, future

created = False
try:
    assert value("select count(*) from supabase_migrations.schema_migrations where version='112'") == '1'
    assert value('select count(*) from public.crm_followup_policies') == '0', 'clean policy baseline required'
    sql(f"insert into auth.users(id,email,aud,role,created_at,updated_at) values('{actor}','crm-rcc-a2-{actor}@example.invalid','authenticated','authenticated',now(),now());update public.profiles set role='director' where id='{actor}';")
    created = True
    # Every day open (00:00–23:59 Casablanca) so a few seconds ahead resolves to itself.
    call('create_followup_policy', str(uuid.uuid4()), {'weekly_hours': {str(d): [['00:00', '23:59']] for d in range(1, 8)}, 'attempt_offsets': [0, 0, 1, 3, 5]})
    def lead(name):
        result = call('create_manual_lead', str(uuid.uuid4()), {'display_name': 'A2 race ' + name, 'learner_name': name, 'phone': '06' + str(uuid.uuid4().int)[:8], 'source_label': 'Manual'})
        identifier = result['lead']['id']
        call('qualify_lead', str(uuid.uuid4()), {'lead_id': identifier, 'expected_version': 1, 'conversation_channel': 'phone', 'note': 'A2', 'qualification_step': 'placement_test',
             'next_task': {'task_type': 'confirm_placement_test', 'due_at': value("select (now()+interval '2 days')::text")}})
        return identifier
    def new(identifier, name, extra=None):
        return {'lead_id': identifier, 'expected_version': int(value(f"select version from public.crm_leads where id='{identifier}'")), 'student_choice': 'new', 'learner_name': name,
                'candidate_review': value(f"select crm_security.candidate_token('{identifier}',{quote(name)},null)"), 'session_type': 'Yearly', 'school_year': '2026/2027', **(extra or {})}
    def student(name):
        identifier = str(uuid.uuid4()); extra_students.append(identifier)
        sql(f"insert into public.students(id,full_name,status,session_type) values('{identifier}',{quote(name)},'Prospect','Yearly')")
        return identifier
    def named(name):
        return value(f"select count(*) from public.students where full_name={quote(name)}")

    # (a) Session A links the opportunity (enrollment initiation on an existing learner)
    # while session B submits a new learner: B waits, then gets lead_already_enrolled.
    target = lead('A2 race enrolled'); existing = student('A2 race existing'); name = 'A2 race new ' + str(uuid.uuid4())[:8]
    link = {'lead_id': target, 'expected_version': int(value(f"select version from public.crm_leads where id='{target}'")), 'student_choice': 'existing', 'student_id': existing, 'session_type': 'Yearly', 'school_year': '2026/2027'}
    contender = new(target, name)
    holder = Holder(f"select public.crm_start_enrollment('{uuid.uuid4()}',{quote(json.dumps(link))}::jsonb);")
    pool, future = later(call, 'start_enrollment', str(uuid.uuid4()), contender)
    holder.finish()
    loser = future.result(); pool.shutdown()
    assert (loser.get('code'), loser.get('message'), loser.get('reason')) == ('22023', 'Qualified unlinked lead required', 'lead_already_enrolled'), loser
    assert named(name) == '0' and value(f"select student_id from public.crm_leads where id='{target}'") == existing, 'exactly the linked learner; no new learner'
    # (a') A historical/manual link of student_id alone, committed while B waits.
    target = lead('A2 race linked'); existing = student('A2 race linked learner'); name = 'A2 race new ' + str(uuid.uuid4())[:8]
    contender = new(target, name)
    holder = Holder(f"reset role;update public.crm_leads set student_id='{existing}' where id='{target}';")
    pool, future = later(call, 'start_enrollment', str(uuid.uuid4()), contender)
    holder.finish()
    loser = future.result(); pool.shutdown()
    assert (loser.get('code'), loser.get('message'), loser.get('reason')) == ('22023', 'Invalid new learner', 'learner_already_linked'), loser
    assert named(name) == '0', 'no duplicate learner'
    print('PASS linkage races: lead_already_enrolled / learner_already_linked, exactly one learner, no duplicate', flush=True)

    # (b) Another actor completes the enrollment first with the same learner name.
    target = lead('A2 race same'); name = 'A2 race same ' + str(uuid.uuid4())[:8]
    first, second = new(target, name), new(target, name)
    holder = Holder(f"select public.crm_start_enrollment('{uuid.uuid4()}',{quote(json.dumps(first))}::jsonb);")
    pool, future = later(call, 'start_enrollment', str(uuid.uuid4()), second)
    holder.finish()
    loser = future.result(); pool.shutdown()
    assert loser.get('reason') == 'lead_already_enrolled', loser
    assert named(name) == '1', 'exactly one learner after the race'
    print('PASS completed-first race: the second request is rejected before any insert', flush=True)

    # (c) Held intent lock: unchanged 40001 message plus enrollment_in_progress, and the
    # lock taken inside RCC-A2's local block is still held by its transaction.
    held = student('A2 race intent')
    first, second = lead('A2 race intent one'), lead('A2 race intent two')
    def existing_payload(identifier):
        return {'lead_id': identifier, 'expected_version': int(value(f"select version from public.crm_leads where id='{identifier}'")), 'student_choice': 'existing', 'student_id': held, 'session_type': 'Yearly', 'school_year': '2026/2027'}
    holder = Holder(f"select public.crm_start_enrollment('{uuid.uuid4()}',{quote(json.dumps(existing_payload(first)))}::jsonb);")
    blocked = call('start_enrollment', str(uuid.uuid4()), existing_payload(second))
    assert (blocked.get('code'), blocked.get('message'), blocked.get('reason')) == ('40001', 'Inscription ou paiement en cours. Actualisez les inscriptions puis réessayez.', 'enrollment_in_progress'), blocked
    payment = value(f"begin;select pg_try_advisory_xact_lock_shared(hashtextextended('crm:enrollment-intent:'||'{held}',0));rollback;")
    assert payment == 'f', 'a concurrent payment still fails fast while the enrollment transaction is open'
    holder.finish()
    assert value(f"begin;select pg_try_advisory_xact_lock_shared(hashtextextended('crm:enrollment-intent:'||'{held}',0));rollback;") == 't', 'released at commit'
    print('PASS intent lock: enrollment_in_progress with the unchanged message; lock held until commit', flush=True)

    # (d) A committed request is replayed with the same key after its follow-up time passed.
    target = lead('A2 race replay'); name = 'A2 race replay ' + str(uuid.uuid4())[:8]
    chosen = value("select (now()+interval '3 seconds')::text")
    payload = new(target, name, {'followup_at': chosen}); key = str(uuid.uuid4())
    stored = call('start_enrollment', key, payload)
    assert stored['enrollment_followup']['created'] is True, stored
    time.sleep(4)
    assert value(f"select {quote(chosen)}::timestamptz<now()") == 't'
    counts = value(f"select (select count(*) from public.students where full_name={quote(name)})||','||(select count(*) from public.crm_tasks where lead_id='{target}' and task_type='enrollment_followup')||','||(select count(*) from public.crm_activities where lead_id='{target}' and event_type='enrollment_started')")
    assert call('start_enrollment', key, payload) == stored, 'same-key replay returns the stored result after the time passed'
    assert counts == '1,1,1' and value(f"select (select count(*) from public.students where full_name={quote(name)})||','||(select count(*) from public.crm_tasks where lead_id='{target}' and task_type='enrollment_followup')||','||(select count(*) from public.crm_activities where lead_id='{target}' and event_type='enrollment_started')") == '1,1,1'
    # A fresh request with that now-past time is validated afresh (when the window keeps it).
    fresh = lead('A2 race fresh')
    if value(f"select crm_security.next_window(followup_policy_id,{quote(chosen)}::timestamptz)={quote(chosen)}::timestamptz from public.crm_leads where id='{fresh}'") == 't':
        rejected = call('start_enrollment', str(uuid.uuid4()), new(fresh, 'A2 race fresh learner', {'followup_at': chosen}))
        assert rejected.get('reason') == 'followup_in_past', rejected
    print('PASS same-key replay after the follow-up time passed returns the stored result; a new key is validated afresh', flush=True)
finally:
    if created:
        ids = value(f"select coalesce(json_agg(student_id) filter(where student_id is not null),'[]') from public.crm_leads where contact_id in(select id from public.crm_contacts where created_by='{actor}')")
        student_list = ','.join(quote(s) for s in set(json.loads(ids)) | set(extra_students)) or 'null'
        sql(f"""begin;
lock table public.crm_activities,public.crm_command_requests,public.crm_contacts,public.crm_followup_policies,public.crm_leads,public.crm_submission_attribution,public.crm_submissions,public.crm_tasks in access exclusive mode;
alter table public.crm_activities disable trigger crm_activities_immutable;
alter table public.crm_submissions disable trigger crm_submission_immutable;
alter table public.crm_command_requests disable trigger crm_requests_immutable;
alter table public.crm_followup_policies disable trigger crm_policy_immutable;
with removed_tasks as(delete from public.crm_tasks where lead_id in(select id from public.crm_leads where contact_id in(select id from public.crm_contacts where created_by='{actor}')) returning id),
removed_activities as(delete from public.crm_activities where lead_id in(select id from public.crm_leads where contact_id in(select id from public.crm_contacts where created_by='{actor}')) returning id),
removed_submissions as(delete from public.crm_submissions where resolved_by='{actor}' returning id),
removed_leads as(delete from public.crm_leads where contact_id in(select id from public.crm_contacts where created_by='{actor}') returning id)
select count(*) from removed_leads;
delete from public.crm_contacts where created_by='{actor}';delete from public.crm_command_requests where actor_scope='{actor}';delete from public.crm_followup_policies where created_by='{actor}';
alter table public.crm_activities enable trigger crm_activities_immutable;alter table public.crm_submissions enable trigger crm_submission_immutable;alter table public.crm_command_requests enable trigger crm_requests_immutable;alter table public.crm_followup_policies enable trigger crm_policy_immutable;
delete from public.enrollments where student_id in({student_list});delete from public.students where id in({student_list});alter table public.profiles disable trigger role_security_guard;
delete from auth.users where id='{actor}';
update role_security.director_guard set director_count=(select count(*) from public.profiles where role='director');
alter table public.profiles enable trigger role_security_guard;commit;""")
        print('PASS synthetic concurrency fixtures removed; guards restored', flush=True)
