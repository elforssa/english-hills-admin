#!/usr/bin/env python3
"""Batch E (plan PCR-r2) races and the owner-level session-user guard. Local only.

Uses separate PostgreSQL sessions; fixtures must be committed to be visible across
them, and are removed at the end (receipts through the sanctioned local clean-up,
CRM history with its append-only guards briefly disabled inside one transaction,
as the phase 6 suite does). Covers:
- two receipts issued at once commit with consecutive numbers; a rolled-back one
  gives its number back (no gap);
- a void and a payment on the same learner, in both orders: no deadlock, and the
  end state never has a review flag while the enrollment has a live receipt;
- a void or deletion meeting an exclusive enrollment-intent lock (a CRM linkage
  command) is refused at once with PT409;
- the two clean-up/numbering exceptions accept a session user that is a member of
  postgres (like cli_login_postgres) and refuse one that is not (like PostgREST's
  authenticator), also after SET ROLE service_role or authenticated.
"""
import concurrent.futures
import json
import os
import secrets
import subprocess
import time
import uuid

if os.environ.get('CI') != 'true':
    branch = subprocess.run(['git', 'branch', '--show-current'], capture_output=True, text=True).stdout.strip()
    assert branch and branch not in ('main', 'master'), 'Refusing main or master; use an isolated feature branch'
HOST, PORT, CONTAINER = '127.0.0.1', '54322', 'supabase_db_hills-admin-next'
ENV = {**os.environ, 'PGPASSWORD': 'postgres'}
actor = str(uuid.uuid4())
students = {k: str(uuid.uuid4()) for k in ['num_a', 'num_b', 'num_c', 'num_d', 'race', 'lock']}
member_role, outsider_role = 'batch_e_member_' + secrets.token_hex(4), 'batch_e_outsider_' + secrets.token_hex(4)
member_password, outsider_password = secrets.token_urlsafe(18), secrets.token_urlsafe(18)


def args(user='postgres'):
    return ['psql', '-X', '-qAt', '-h', HOST, '-p', PORT, '-U', user, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']


def sql(text, check=True, user='postgres', password='postgres'):
    result = subprocess.run(args(user), input=text, text=True, capture_output=True,
                            env={**ENV, 'PGPASSWORD': password}, timeout=60)
    if check and result.returncode:
        raise AssertionError(result.stderr)
    return result


def admin_sql(text):
    """supabase_admin inside the container: only it may grant membership in postgres."""
    result = subprocess.run(['docker', 'exec', '-i', CONTAINER, 'psql', '-X', '-qAt', '-U', 'supabase_admin', '-d', 'postgres',
                             '-v', 'ON_ERROR_STOP=1'], input=text, text=True, capture_output=True, timeout=60)
    if result.returncode:
        raise AssertionError(result.stderr)
    return result


def quote(value):
    return "'" + str(value).replace("'", "''") + "'"


def value(text):
    return sql(text).stdout.strip()


def as_actor(statement):
    return f"begin;set local request.jwt.claim.sub={quote(actor)};set local role authenticated;{statement}commit;"


def command(name, payload):
    out = sql(as_actor(f"select public.crm_{name}({quote(uuid.uuid4())}::uuid,{quote(json.dumps(payload))}::jsonb);"))
    return json.loads(out.stdout.strip())


def pay(payload, check=True):
    body = {'payment_method': 'Espèces', 'idempotency_key': str(uuid.uuid4()), **payload}
    result = sql(as_actor(f"select public.create_charge_payment({quote(json.dumps(body))}::jsonb);"), check)
    return json.loads(result.stdout.strip()) if result.returncode == 0 else {'error': result.stderr}


def void(receipt, action='void_financial_receipt', check=True):
    result = sql(as_actor(f"select public.{action}({quote(receipt)}::uuid,'Synthetic race',{quote(uuid.uuid4())}::uuid);"), check)
    return json.loads(result.stdout.strip()) if result.returncode == 0 else {'error': result.stderr}


class Held:
    """One session that runs a statement inside an open transaction until told to finish."""

    def __init__(self, statement):
        self.proc = subprocess.Popen(args(), stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                     text=True, env=ENV)
        self.proc.stdin.write(f"begin;set local request.jwt.claim.sub={quote(actor)};set local role authenticated;"
                              f"{statement}\nselect 'HELD_READY';\n")
        self.proc.stdin.flush()
        self.output = []
        while True:
            line = self.proc.stdout.readline()
            assert line, self.proc.stderr.read()
            if line.strip() == 'HELD_READY':
                break
            self.output.append(line.strip())

    def finish(self, how='commit'):
        out, err = self.proc.communicate(f"{how};\n", timeout=30)
        assert self.proc.returncode == 0, err
        return self.output


def waiting(future, seconds=1.5):
    time.sleep(seconds)
    return not future.done()


def counter():
    return int(value("select last_value from public.receipt_number_counters where series='EH'"))


def number(receipt):
    return value(f"select receipt_number from public.receipts where id={quote(receipt)}")


def suffix(receipt_number):
    return int(receipt_number.rsplit('-', 1)[1])


def lead_state(lead):
    return value(f"select conversion_review_required::text||':'||status from public.crm_leads where id={quote(lead)}")


def live_receipts(enrollment):
    return int(value(f"""select count(*) from public.receipts r where r.voided_at is null and r.deleted_at is null
      and (r.enrollment_id={quote(enrollment)} or r.charge_id in (select id from public.charges where enrollment_id={quote(enrollment)}))"""))


hours = {str(i): [['00:00', '23:59']] for i in range(1, 8)}
created = roles_created = False
bare_receipts = []
try:
    assert value("select count(*) from pg_proc where proname='review_enrollment_without_live_payment'") == '1'
    sql(f"""insert into auth.users(id,email,aud,role,created_at,updated_at)
values({quote(actor)},'batch-e-race-{actor}@example.invalid','authenticated','authenticated',now(),now());
update public.profiles set role='director' where id={quote(actor)};
insert into public.students(id,full_name,status,session_type) select v::uuid,'Batch E race '||k,'Prospect','Adults'
from jsonb_each_text({quote(json.dumps(students))}::jsonb) x(k,v);""")
    created = True

    # Numbering: two receipts at once commit with consecutive numbers.
    start = counter()
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        held = Held(f"select public.create_charge_payment({quote(json.dumps({'student_id': students['num_a'], 'session_type': 'Adults', 'school_year': '2026/2027', 'gross_amount': 100, 'payment_amount': 10, 'payment_method': 'Espèces', 'idempotency_key': str(uuid.uuid4())}))}::jsonb);")
        second = pool.submit(pay, {'student_id': students['num_b'], 'session_type': 'Adults', 'school_year': '2026/2027',
                                   'gross_amount': 100, 'payment_amount': 10})
        assert waiting(second), 'the second receipt must wait for the counter row'
        first = json.loads(held.finish('commit')[-1])
        second = second.result(timeout=30)
    assert suffix(number(first['receipt_id'])) == start + 1 and suffix(number(second['receipt_id'])) == start + 2, \
        (start, number(first['receipt_id']), number(second['receipt_id']))
    # A rolled-back receipt gives its number back to the waiting one.
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        held = Held(f"select public.create_charge_payment({quote(json.dumps({'student_id': students['num_c'], 'session_type': 'Adults', 'school_year': '2026/2027', 'gross_amount': 100, 'payment_amount': 10, 'payment_method': 'Espèces', 'idempotency_key': str(uuid.uuid4())}))}::jsonb);")
        waiter = pool.submit(pay, {'student_id': students['num_d'], 'session_type': 'Adults', 'school_year': '2026/2027',
                                   'gross_amount': 100, 'payment_amount': 10})
        assert waiting(waiter)
        held.finish('rollback')
        waiter = waiter.result(timeout=30)
    assert suffix(number(waiter['receipt_id'])) == start + 3 and counter() == start + 3, (number(waiter['receipt_id']), counter())
    print('PASS concurrent receipts: consecutive numbers; a rollback leaves no gap', flush=True)

    # A converted CRM enrollment with one live payment.
    command('create_followup_policy', {'weekly_hours': hours})
    lead = command('create_manual_lead', {'display_name': 'Batch E race', 'learner_name': 'Batch E race learner',
                                          'source_label': 'Manual'})['lead']['id']
    version = command('qualify_lead', {'lead_id': lead, 'expected_version': 1, 'conversation_channel': 'phone',
                                       'note': 'Enrollment agreed', 'qualification_step': 'enrollment',
                                       'next_task': {'task_type': 'enrollment_followup',
                                                     'due_at': value("select (now()+interval '1 day')::text")}})['lead']['version']
    command('start_enrollment', {'lead_id': lead, 'expected_version': version, 'student_choice': 'existing',
                                 'student_id': students['race'], 'session_type': 'Adults', 'school_year': '2026/2027',
                                 'initial_status': 'Submitted'})
    enrollment = value(f"select enrollment_id from public.crm_leads where id={quote(lead)}")
    p1 = pay({'student_id': students['race'], 'enrollment_id': enrollment, 'session_type': 'Adults', 'school_year': '2026/2027',
              'gross_amount': 1000, 'payment_amount': 100})
    assert lead_state(lead) == 'false:CONVERTED'

    # Order 1: the payment holds its transaction while the void starts; the void then sees it.
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        held = Held(f"select public.create_charge_payment({quote(json.dumps({'student_id': students['race'], 'charge_id': p1['charge_id'], 'payment_amount': 100, 'payment_method': 'Espèces', 'idempotency_key': str(uuid.uuid4())}))}::jsonb);")
        voided = pool.submit(void, p1['receipt_id'])
        assert waiting(voided), 'the void must wait for the payment (student lock)'
        p2 = json.loads(held.finish('commit')[-1])
        voided = voided.result(timeout=30)
    assert voided.get('enrollment_without_live_payment') is False, voided
    assert lead_state(lead) == 'false:CONVERTED' and live_receipts(enrollment) == 1
    # Order 2: the void of the last live payment holds its transaction while a payment starts.
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        held = Held(f"select public.void_financial_receipt({quote(p2['receipt_id'])}::uuid,'Synthetic race',{quote(uuid.uuid4())}::uuid);")
        replacement = pool.submit(pay, {'student_id': students['race'], 'charge_id': p1['charge_id'], 'payment_amount': 100})
        assert waiting(replacement), 'the payment must wait for the void (student lock)'
        held_result = json.loads(held.finish('commit')[-1])
        replacement = replacement.result(timeout=30)
    assert held_result['enrollment_without_live_payment'] is True and 'receipt_id' in replacement, (held_result, replacement)
    assert lead_state(lead) == 'false:CONVERTED' and live_receipts(enrollment) == 1, 'a live receipt and no flag at the end'
    assert value(f"select count(*) from public.crm_activities where lead_id={quote(lead)} and event_type='conversion_review_cleared'") == '1'
    print('PASS void and payment in both orders: serialised, no deadlock, no flag with a live receipt', flush=True)

    # An exclusive enrollment-intent lock (CRM linkage) refuses a void or deletion at once.
    lock_payment = pay({'student_id': students['lock'], 'session_type': 'Adults', 'school_year': '2026/2027',
                        'gross_amount': 100, 'payment_amount': 10})
    held = Held(f"select pg_advisory_xact_lock(hashtextextended('crm:enrollment-intent:'||{quote(students['lock'])},0));")
    try:
        for action in ['void_financial_receipt', 'delete_mistaken_receipt']:
            began = time.monotonic()
            refused = sql(f"""set statement_timeout='5s';
do $$ begin
  perform set_config('request.jwt.claim.sub',{quote(actor)},true);
  execute 'set local role authenticated';
  perform public.{action}({quote(lock_payment['receipt_id'])}::uuid,'Synthetic race',gen_random_uuid());
  raise exception 'not refused';
exception when sqlstate 'PT409' then raise notice 'PT409 %', sqlerrm;
end $$;""", check=False)
            assert refused.returncode == 0 and 'PT409 Inscription ou paiement en cours.' in refused.stderr, refused.stderr
            assert time.monotonic() - began < 4, 'PT409 must be immediate, not a wait'
    finally:
        held.finish('rollback')
    print('PASS void and deletion meet an exclusive CRM linkage lock: PT409 at once', flush=True)

    # Owner-level session user (P2.3b): a member of postgres may use the two exceptions; another login may not.
    admin_sql(f"""create role {member_role} login password {quote(member_password)};
grant postgres to {member_role};
-- Like PostgREST's authenticator: NOINHERIT, granted the API roles it switches to.
create role {outsider_role} login noinherit password {quote(outsider_password)};
grant service_role, authenticated to {outsider_role};""")
    roles_created = True
    for _ in range(2):
        bare_receipts.append(value("""begin;
alter table public.receipts disable trigger set_receipt_number_t;
insert into public.receipts(nom_prenom,date,montant_total,montant_paye,mode_paiement,email_delivery_status)
values('Batch E historical synthetic','2026-09-10',50,50,'Espèces','unknown') returning id;
alter table public.receipts enable trigger set_receipt_number_t;
commit;""").splitlines()[0])
    target = bare_receipts[0]
    numbering = f"begin;set local english_hills.historical_receipt_numbering='on';update public.receipts set receipt_number='EH-HIST-2026-0999' where id={quote(target)};rollback;"
    cleanup = f"begin;set local english_hills.receipt_test_cleanup='on';delete from public.receipts where id={quote(target)};rollback;"
    for statement in (numbering, cleanup):
        assert sql(statement, False, member_role, member_password).returncode == 0, 'a member of postgres uses the exception'
        for prefix in ('', 'set role service_role;', 'set role authenticated;'):
            refused = sql(prefix + statement, False, outsider_role, outsider_password)
            assert refused.returncode != 0, ('outsider', prefix, statement)
            if prefix == 'set role service_role;':
                assert ('Receipt numbers cannot be changed.' in refused.stderr
                        or 'Receipts are never deleted: void them instead.' in refused.stderr), refused.stderr
    # Without the setting even a member is refused.
    assert 'Receipts are never deleted' in sql(f"delete from public.receipts where id={quote(target)};", False, member_role, member_password).stderr
    print('PASS owner-level session user: member of postgres allowed, other logins refused (also as service_role and authenticated)', flush=True)
finally:
    if roles_created:
        admin_sql(f"drop role if exists {member_role}; drop role if exists {outsider_role};")
    if created:
        student_list = ','.join(quote(s) for s in students.values())
        bare_list = ','.join(quote(r) for r in bare_receipts) or 'null'
        sql(f"""begin;
-- Receipts are never hard-deleted outside this sanctioned local clean-up (Batch E, P2.3a).
set local english_hills.receipt_test_cleanup = 'on';
lock table public.crm_revenue_entries,public.crm_activities,public.crm_command_requests,public.crm_contacts,public.crm_followup_policies,public.crm_leads,public.crm_submission_attribution,public.crm_submissions,public.crm_tasks in access exclusive mode;
alter table public.crm_revenue_entries disable trigger crm_revenue_immutable;
delete from public.crm_revenue_entries where financial_event_id in(select id from public.financial_events where actor_id={quote(actor)});
alter table public.crm_revenue_entries enable trigger crm_revenue_immutable;
alter table public.crm_activities disable trigger crm_activities_immutable;
alter table public.crm_submissions disable trigger crm_submission_immutable;
alter table public.crm_command_requests disable trigger crm_requests_immutable;
alter table public.crm_followup_policies disable trigger crm_policy_immutable;
with removed_tasks as(delete from public.crm_tasks where lead_id in(select id from public.crm_leads where contact_id in(select id from public.crm_contacts where created_by={quote(actor)})) returning id),
removed_activities as(delete from public.crm_activities where lead_id in(select id from public.crm_leads where contact_id in(select id from public.crm_contacts where created_by={quote(actor)})) returning id),
removed_submissions as(delete from public.crm_submissions where resolved_by={quote(actor)} returning id),
removed_leads as(delete from public.crm_leads where contact_id in(select id from public.crm_contacts where created_by={quote(actor)}) returning id)
select count(*) from removed_leads;
delete from public.crm_contacts where created_by={quote(actor)};
delete from public.crm_command_requests where actor_scope={quote(actor)};
delete from public.crm_followup_policies where created_by={quote(actor)};
alter table public.crm_activities enable trigger crm_activities_immutable;
alter table public.crm_submissions enable trigger crm_submission_immutable;
alter table public.crm_command_requests enable trigger crm_requests_immutable;
alter table public.crm_followup_policies enable trigger crm_policy_immutable;
delete from public.financial_events where actor_id={quote(actor)};
delete from public.financial_requests where actor_id={quote(actor)};
delete from public.receipts where student_id in({student_list}) or id in({bare_list});
delete from public.charges where student_id in({student_list});
set local eh.enrollment_command = on;
delete from public.enrollments where student_id in({student_list});
delete from public.students where id in({student_list});
alter table public.profiles disable trigger role_security_guard;
delete from public.activity_log where actor_id={quote(actor)} or target_id in({bare_list});
delete from auth.users where id={quote(actor)};
update role_security.director_guard set director_count=(select count(*) from public.profiles where role='director');
alter table public.profiles enable trigger role_security_guard;
commit;""")
        print('PASS synthetic race fixtures removed; guards restored', flush=True)
