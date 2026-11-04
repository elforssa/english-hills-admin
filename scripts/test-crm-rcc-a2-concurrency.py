#!/usr/bin/env python3
"""RCC-A2 local-only cross-session races. Removes this run's synthetic fixtures.

Separate PostgreSQL sessions hold real row and advisory locks (no simulated
sequential retries). Covers the linkage races, the intent-lock reason with the
lock still held, and a same-key replay after the chosen follow-up time passed.
EAP (127): crm_start_enrollment lost its API grant; every enrollment goes through
public.crm_enroll_and_collect (enrollment and payment in one transaction), which
adds two races: two wrappers on one lead, and the wrapper against the receipt form
on one existing learner.
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

def attempt(statement):
    # One API-role statement in its own committed transaction, with its SQLSTATE and hint.
    result = sql(f"""\\set VERBOSITY verbose
begin;
set local request.jwt.claim.sub={quote(actor)};
set local role authenticated;
{statement}
commit;""", False)
    if result.returncode:
        code = re.search(r'ERROR:\s+([0-9A-Z]{5}):\s*(.*)', result.stderr)
        hint = re.search(r'HINT:\s+(\S+)', result.stderr)
        return {'error': result.stderr, 'code': code and code.group(1), 'message': code and code.group(2).strip(), 'hint': hint and hint.group(1)}
    return json.loads(result.stdout.strip())

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
    # EAP (127): « Inscrire et encaisser » — the enrollment request plus its payment.
    def wrapped(enrollment, payment=True):
        return {'enrollment': enrollment, **({'payment': {'gross_amount': 1000, 'payment_amount': 100, 'payment_method': 'Espèces'}} if payment else {})}
    def enroll(key, enrollment):
        return f"select public.crm_enroll_and_collect('{key}',{quote(json.dumps(wrapped(enrollment)))}::jsonb);"

    # (a) Session A links the opportunity (enrollment initiation on an existing learner)
    # while session B submits a new learner: B waits, then gets lead_already_enrolled.
    target = lead('A2 race enrolled'); existing = student('A2 race existing'); name = 'A2 race new ' + str(uuid.uuid4())[:8]
    link = {'lead_id': target, 'expected_version': int(value(f"select version from public.crm_leads where id='{target}'")), 'student_choice': 'existing', 'student_id': existing, 'session_type': 'Yearly', 'school_year': '2026/2027'}
    contender = new(target, name)
    holder = Holder(enroll(uuid.uuid4(), link))
    pool, future = later(call, 'enroll_and_collect', str(uuid.uuid4()), wrapped(contender))
    holder.finish()
    loser = future.result(); pool.shutdown()
    assert (loser.get('code'), loser.get('message'), loser.get('reason')) == ('22023', 'Qualified unlinked lead required', 'lead_already_enrolled'), loser
    assert named(name) == '0' and value(f"select student_id from public.crm_leads where id='{target}'") == existing, 'exactly the linked learner; no new learner'
    # (a') A historical/manual link of student_id alone, committed while B waits.
    target = lead('A2 race linked'); existing = student('A2 race linked learner'); name = 'A2 race new ' + str(uuid.uuid4())[:8]
    contender = new(target, name)
    holder = Holder(f"reset role;update public.crm_leads set student_id='{existing}' where id='{target}';")
    pool, future = later(call, 'enroll_and_collect', str(uuid.uuid4()), wrapped(contender))
    holder.finish()
    loser = future.result(); pool.shutdown()
    assert (loser.get('code'), loser.get('message'), loser.get('reason')) == ('22023', 'Invalid new learner', 'learner_already_linked'), loser
    assert named(name) == '0', 'no duplicate learner'
    print('PASS linkage races: lead_already_enrolled / learner_already_linked, exactly one learner, no duplicate', flush=True)

    # (b) Another actor completes the enrollment first with the same learner name.
    target = lead('A2 race same'); name = 'A2 race same ' + str(uuid.uuid4())[:8]
    first, second = new(target, name), new(target, name)
    holder = Holder(enroll(uuid.uuid4(), first))
    pool, future = later(call, 'enroll_and_collect', str(uuid.uuid4()), wrapped(second))
    holder.finish()
    loser = future.result(); pool.shutdown()
    assert loser.get('reason') == 'lead_already_enrolled', loser
    assert named(name) == '1', 'exactly one learner after the race'
    # EAP (127): the loser's payment rolled back with it: one enrollment and one receipt.
    winner = value(f"select student_id from public.crm_leads where id='{target}'")
    assert value(f"select (select count(*) from public.enrollments where student_id='{winner}')||','||(select count(*) from public.receipts where student_id='{winner}')") == '1,1'
    print('PASS completed-first race: the second request is rejected before any insert', flush=True)

    # (c) Held intent lock: PT409 with the unchanged message plus enrollment_in_progress, and the
    # lock taken inside RCC-A2's local block is still held by its transaction.
    held = student('A2 race intent')
    first, second = lead('A2 race intent one'), lead('A2 race intent two')
    def existing_payload(identifier):
        return {'lead_id': identifier, 'expected_version': int(value(f"select version from public.crm_leads where id='{identifier}'")), 'student_choice': 'existing', 'student_id': held, 'session_type': 'Yearly', 'school_year': '2026/2027'}
    holder = Holder(enroll(uuid.uuid4(), existing_payload(first)))
    blocked = call('enroll_and_collect', str(uuid.uuid4()), wrapped(existing_payload(second)))
    assert (blocked.get('code'), blocked.get('message'), blocked.get('reason')) == ('PT409', 'Inscription ou paiement en cours. Actualisez les inscriptions puis réessayez.', 'enrollment_in_progress'), blocked
    payment = value(f"begin;select pg_try_advisory_xact_lock_shared(hashtextextended('crm:enrollment-intent:'||'{held}',0));rollback;")
    assert payment == 'f', 'a concurrent payment still fails fast while the enrollment transaction is open'
    holder.finish()
    assert value(f"begin;select pg_try_advisory_xact_lock_shared(hashtextextended('crm:enrollment-intent:'||'{held}',0));rollback;") == 't', 'released at commit'
    print('PASS intent lock: enrollment_in_progress with the unchanged message; lock held until commit', flush=True)

    # (d) A committed request is replayed with the same key after its follow-up time passed.
    # EAP (127): the enrollment is Confirmed at creation and the lead converts, so no
    # follow-up task is created and followup_at is not used (the time-based validation of
    # a fresh request belonged to the retired non-converting branch); the same-key replay
    # still returns the stored result, flagged as replayed, with no second learner,
    # activity or receipt.
    target = lead('A2 race replay'); name = 'A2 race replay ' + str(uuid.uuid4())[:8]
    chosen = value("select (now()+interval '3 seconds')::text")
    payload = wrapped(new(target, name, {'followup_at': chosen})); key = str(uuid.uuid4())
    stored = call('enroll_and_collect', key, payload)
    assert stored['enrollment_followup'] is None and stored['replayed_enrollment'] is False and stored['receipt_id'], stored
    time.sleep(4)
    assert value(f"select {quote(chosen)}::timestamptz<now()") == 't'
    def tally():
        return value(f"select (select count(*) from public.students where full_name={quote(name)})||','||(select count(*) from public.crm_tasks where lead_id='{target}' and task_type='enrollment_followup')||','||(select count(*) from public.crm_activities where lead_id='{target}' and event_type='enrollment_started')||','||(select count(*) from public.receipts r join public.crm_leads l on l.student_id=r.student_id where l.id='{target}')")
    counts = tally()
    replay = call('enroll_and_collect', key, payload)
    assert replay['replayed_enrollment'] is True and replay['replayed_payment'] is True, replay
    # The financial replay (create_charge_payment_financial) returns no balance; everything else is the stored result.
    same = lambda r: {k: v for k, v in r.items() if not k.startswith('replayed_') and k != 'balance'}
    assert same(replay) == same(stored), ('same-key replay returns the stored result after the time passed', stored, replay)
    assert counts == '1,0,1,1' and tally() == '1,0,1,1', counts
    print('PASS same-key replay after the follow-up time passed returns the stored result; no follow-up for a converted lead', flush=True)

    # (e) EAP (127): two « Inscrire et encaisser » requests on one lead at once. The loser
    # gets PT409 lead_changed or 22023 lead_already_enrolled; one enrollment and one receipt.
    import concurrent.futures
    target = lead('A2 race wrappers'); name = 'A2 race wrappers ' + str(uuid.uuid4())[:8]
    request = wrapped(new(target, name))
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: call('enroll_and_collect', str(uuid.uuid4()), request), range(2)))
    losers = [r for r in results if 'error' in r]
    assert len(losers) == 1 and (losers[0].get('code'), losers[0].get('reason')) in (('PT409', 'lead_changed'), ('22023', 'lead_already_enrolled')), results
    winner = next(r for r in results if 'error' not in r)
    assert winner['receipt_id'] and winner['enrollment']['status'] == 'Confirmed', winner
    assert value(f"select (select count(*) from public.students where full_name={quote(name)})||','||(select count(*) from public.enrollments e join public.students s on s.id=e.student_id where s.full_name={quote(name)})||','||(select count(*) from public.receipts r join public.students s on s.id=r.student_id where s.full_name={quote(name)})") == '1,1,1'
    assert value(f"select status from public.crm_leads where id='{target}'") == 'CONVERTED'
    print('PASS two wrappers on one lead: one wins, the loser lead_changed/lead_already_enrolled; one enrollment, one receipt', flush=True)

    # (f) EAP (127): the wrapper against the receipt form (create_charge_payment) on one existing
    # learner, both orders. The second meets the intent lock (PT409) while the first is open and
    # the duplicate conflict (22023) once it committed; never two live enrollments for one
    # programme and year, and one receipt.
    def receipt_form(learner):
        return "select public.create_charge_payment(" + quote(json.dumps({'student_id': learner, 'session_type': 'Yearly', 'school_year': '2026/2027',
            'plan_type': 'Standard', 'gross_amount': 1000, 'payment_amount': 100, 'payment_method': 'Espèces', 'idempotency_key': str(uuid.uuid4())})) + "::jsonb);"
    def live(learner):
        return value(f"select (select count(*) from public.enrollments where student_id='{learner}' and session_type='Yearly' and school_year='2026/2027' and status not in ('Rejected','Ended'))||','||(select count(*) from public.receipts where student_id='{learner}' and voided_at is null)")
    in_progress = 'Inscription ou paiement en cours. Actualisez les inscriptions puis réessayez.'
    # Wrapper first: the receipt form fails fast on the exclusive intent lock, then meets the CRM enrollment.
    racer = student('A2 race wrapper first'); target = lead('A2 race wrapper first')
    holder = Holder(enroll(uuid.uuid4(), existing_payload(target) | {'student_id': racer}))
    blocked = attempt(receipt_form(racer))
    assert (blocked.get('code'), blocked.get('message')) == ('PT409', in_progress), blocked
    holder.finish()
    after = attempt(receipt_form(racer))
    assert after.get('code') == '22023' and 'Une inscription CRM existe' in after.get('message', ''), after
    assert live(racer) == '1,1', live(racer)
    # Receipt form first: the wrapper fails fast on the shared intent lock, then meets the paid enrollment.
    racer = student('A2 race receipt first'); target = lead('A2 race receipt first')
    holder = Holder(receipt_form(racer))
    blocked = call('enroll_and_collect', str(uuid.uuid4()), wrapped(existing_payload(target) | {'student_id': racer}))
    assert (blocked.get('code'), blocked.get('message'), blocked.get('reason')) == ('PT409', in_progress, 'enrollment_in_progress'), blocked
    holder.finish()
    after = call('enroll_and_collect', str(uuid.uuid4()), wrapped(existing_payload(target) | {'student_id': racer}))
    assert after.get('code') == '22023' and after.get('reason') == 'existing_enrollment_requires_selection', after
    assert live(racer) == '1,1', live(racer)
    assert value(f"select enrollment_id is null and status='QUALIFIED' from public.crm_leads where id='{target}'") == 't'
    print('PASS wrapper against the receipt form on one learner, both orders: PT409 then the duplicate conflict; one live enrollment, one receipt', flush=True)
finally:
    if created:
        ids = value(f"select coalesce(json_agg(student_id) filter(where student_id is not null),'[]') from public.crm_leads where contact_id in(select id from public.crm_contacts where created_by='{actor}')")
        student_list = ','.join(quote(s) for s in set(json.loads(ids)) | set(extra_students)) or 'null'
        sql(f"""begin;
-- EAP (127): the races now take payments. Receipts are never hard-deleted outside this
-- sanctioned local clean-up (Batch E, P2.3a), as the phase 6 suite does.
set local english_hills.receipt_test_cleanup = 'on';
alter table public.crm_revenue_entries disable trigger crm_revenue_immutable;
delete from public.crm_revenue_entries where financial_event_id in(select id from public.financial_events where actor_id='{actor}');
alter table public.crm_revenue_entries enable trigger crm_revenue_immutable;
delete from public.financial_events where actor_id='{actor}';
delete from public.financial_requests where actor_id='{actor}';
delete from public.receipts where student_id in({student_list});
delete from public.charges where student_id in({student_list});
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
set local eh.enrollment_command = on; delete from public.enrollments where student_id in({student_list});delete from public.students where id in({student_list});alter table public.profiles disable trigger role_security_guard;
delete from auth.users where id='{actor}';
update role_security.director_guard set director_count=(select count(*) from public.profiles where role='director');
alter table public.profiles enable trigger role_security_guard;commit;""")
        print('PASS synthetic concurrency fixtures removed; guards restored', flush=True)
