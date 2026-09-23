#!/usr/bin/env python3
"""Local-only concurrent RPC tests. Removes this run's synthetic fixtures.

Uses separate PostgreSQL sessions, not simulated sequential retries. The fixture
must be committed to be visible across sessions. Cleanup locks CRM tables and
briefly disables only their append-only DELETE guards inside one transaction;
foreign keys stay enabled. No existing records are deleted or changed.
"""
import concurrent.futures
import json
import os
from pathlib import Path
import subprocess
import uuid

ROOT = Path(__file__).resolve().parents[1]
head = (ROOT / '.git/HEAD').read_text().strip()
assert head.startswith('ref: refs/heads/codex/') or head == 'ref: refs/heads/codex-migration'
ARGS = ['psql', '-X', '-qAt', '-h', '127.0.0.1', '-p', '54322', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']
ENV = {**os.environ, 'PGPASSWORD': 'postgres'}
actor = str(uuid.uuid4())
extra_students = []

def sql(text, check=True):
    result = subprocess.run(ARGS, input=text, text=True, capture_output=True, env=ENV, timeout=60)
    if check and result.returncode:
        raise AssertionError(result.stderr)
    return result

def quote(value):
    return "'" + str(value).replace("'", "''") + "'"

def command(name, key, payload):
    # UUIDs and a locally serialized JSON object only; never shell interpolation.
    statement = f"""begin;
set local request.jwt.claim.sub={quote(actor)};
set local role authenticated;
select public.crm_{name}({quote(key)}::uuid,{quote(json.dumps(payload))}::jsonb);
commit;"""
    result = sql(statement, False)
    if result.returncode:
        return {'error': result.stderr}
    return json.loads(result.stdout.strip())

def race(name, requests):
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        return list(pool.map(lambda item: command(name, *item), requests))

hours = {str(i): [['10:00','12:30'],['15:20','20:00']] for i in range(2,7)}
hours.update({'1':[['15:00','20:00']],'7':[]})
created=False
try:
    assert sql("select count(*) from supabase_migrations.schema_migrations where version='084'").stdout.strip()=='1'
    sql(f"insert into auth.users(id,email,aud,role,created_at,updated_at) values('{actor}','crm-phase6-{actor}@example.invalid','authenticated','authenticated',now(),now());update public.profiles set role='director' where id='{actor}';")
    created=True
    command('create_followup_policy',str(uuid.uuid4()),{'weekly_hours':hours})
    def qualified():
        lead=command('create_manual_lead',str(uuid.uuid4()),{'display_name':'Enrollment concurrency','learner_name':'Synthetic learner','source_label':'Manual'})['lead']['id']
        result=command('qualify_lead',str(uuid.uuid4()),{'lead_id':lead,'expected_version':1,'conversation_channel':'phone','note':'Enrollment agreed','qualification_step':'enrollment','next_task':{'task_type':'enrollment_followup','due_at':sql("select (now()+interval '2 days')::text").stdout.strip()}})
        return lead,result['lead']['version']
    def payload(lead,version,name):
        token=sql(f"select crm_security.candidate_token('{lead}',{quote(name)},null)").stdout.strip()
        return {'lead_id':lead,'expected_version':version,'student_choice':'new','learner_name':name,'candidate_review':token,'session_type':'Yearly','school_year':'2026/2027','level':'Child 2'}
    for same_key in (True,False):
        lead,version=qualified();data=payload(lead,version,'New learner '+str(uuid.uuid4()));key=str(uuid.uuid4())
        results=race('start_enrollment',[(key,data),(key if same_key else str(uuid.uuid4()),data)])
        if same_key: assert results[0]==results[1] and 'error' not in results[0],results
        else: assert sum('error' in r for r in results)==1,results
        result=next(r for r in results if 'enrollment' in r);enrollment=result['enrollment']['id']
        assert sql(f"select count(*) from public.students where full_name={quote(data['learner_name'])}").stdout.strip()=='1'
        assert sql(f"select count(*) from public.enrollments where student_id='{result['enrollment']['student_id']}'").stdout.strip()=='1'
        assert sql(f"select count(*) from public.crm_tasks where lead_id='{lead}' and task_type='enrollment_followup' and status='open'").stdout.strip()=='1'
        def confirm(_):return sql(f"begin;set local request.jwt.claim.sub='{actor}';update public.enrollments set status='Confirmed' where id='{enrollment}';commit;",False)
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool: outcomes=list(pool.map(confirm,range(2)))
        assert all(r.returncode==0 for r in outcomes),[r.stderr for r in outcomes]
        assert sql(f"select count(*) from public.crm_activities where lead_id='{lead}' and event_type='lead_converted'").stdout.strip()=='1'
        assert sql(f"select count(*) from public.crm_tasks where lead_id='{lead}' and status='open'").stdout.strip()=='0'
        print('PASS same/different-key enrollment race and concurrent confirmation; same_key='+str(same_key),flush=True)
    # Separate CRM opportunities cannot silently create the same reviewed identity.
    first=qualified();second=qualified();name='Shared identity '+str(uuid.uuid4())
    results=race('start_enrollment',[(str(uuid.uuid4()),payload(*first,name)),(str(uuid.uuid4()),payload(*second,name))])
    assert sum('error' in r for r in results)==1,results
    assert sql(f"select count(*) from public.students where full_name={quote(name)}").stdout.strip()=='1'
    print('PASS separate-lead duplicate identity race requires renewed explicit review',flush=True)
    # Linking and confirmation cross in separate sessions. A stale/deadlocked caller
    # retries using fresh authoritative versions, never silently overwrites fields.
    for i in range(3):
        lead,version=qualified();student=str(uuid.uuid4());enrollment=str(uuid.uuid4());extra_students.append(student)
        sql(f"insert into public.students(id,full_name,status,session_type) values('{student}','Link race','Prospect','Yearly');insert into public.enrollments(id,student_id,status,session_type,school_year) values('{enrollment}','{student}','Submitted','Yearly','2026/2027');")
        data={'lead_id':lead,'expected_version':version,'student_choice':'existing','student_id':student,'enrollment_id':enrollment,'session_type':'Yearly','school_year':'2026/2027','expected_enrollment_updated_at':sql(f"select updated_at::text from public.enrollments where id='{enrollment}'").stdout.strip()}
        key=str(uuid.uuid4())
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            link=pool.submit(command,'start_enrollment',key,data);confirmation=pool.submit(sql,f"begin;set local request.jwt.claim.sub='{actor}';update public.enrollments set status='Confirmed' where id='{enrollment}';commit;",False)
            result=link.result();confirmed=confirmation.result()
        if confirmed.returncode: sql(f"begin;set local request.jwt.claim.sub='{actor}';update public.enrollments set status='Confirmed' where id='{enrollment}';commit;")
        if 'error' in result:
            data['expected_enrollment_updated_at']=sql(f"select updated_at::text from public.enrollments where id='{enrollment}'").stdout.strip()
            data['expected_version']=int(sql(f"select version from public.crm_leads where id='{lead}'").stdout.strip())
            result=command('start_enrollment',key,data)
        assert 'error' not in result,result
        assert sql(f"select status from public.crm_leads where id='{lead}'").stdout.strip()=='CONVERTED'
        assert sql(f"select count(*) from public.crm_activities where lead_id='{lead}' and event_type='lead_converted'").stdout.strip()=='1'
    print('PASS concurrent confirmation/link: exactly one conversion and safe stale retries',flush=True)
    # Financial race transactions roll back after checking their actual effects.
    # Existing fixtures are committed; separate sessions exercise real locks.
    assert sql("select count(*) from vault.secrets where name in ('receipt_webhook_url','receipt_webhook_token')").stdout.strip()=='0'
    lead,version=qualified();data=payload(lead,version,'Payment race '+str(uuid.uuid4()))
    linked=command('start_enrollment',str(uuid.uuid4()),data);student=linked['enrollment']['student_id'];enrollment=linked['enrollment']['id']
    payment={'student_id':student,'session_type':'Yearly','school_year':'2026/2027','plan_type':'Standard','gross_amount':1000,'payment_amount':100,'payment_method':'Espèces'}
    def pay(extra=None, hold=False):
        body={**payment,'idempotency_key':str(uuid.uuid4()),**(extra or {})}
        # Count inside the successful transaction, then roll back every money row.
        return sql(f"begin;set local request.jwt.claim.sub='{actor}';set local role authenticated;select public.create_charge_payment({quote(json.dumps(body))}::jsonb);"+
          ("select pg_sleep(0.3);" if hold else "")+f"select count(*) from public.enrollments where student_id='{student}';rollback;",False)
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool: outcomes=list(pool.map(lambda _:pay(),range(2)))
    assert all(r.returncode and ('22023' in r.stderr or 'inscription CRM' in r.stderr or 'paiement en cours' in r.stderr) for r in outcomes),[r.stderr for r in outcomes]
    assert sql(f"select count(*) from public.enrollments where student_id='{student}'").stdout.strip()=='1'
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        explicit=pool.submit(pay,{'enrollment_id':enrollment},True);omitted=pool.submit(pay)
        good,bad=explicit.result(),omitted.result()
    assert bad.returncode,[good.stderr,bad.stderr]
    if good.returncode:
        assert 'paiement en cours' in good.stderr,good.stderr
        good=pay({'enrollment_id':enrollment})
    assert good.returncode==0 and 'enrollment_confirmed' in good.stdout,good.stderr
    assert sql(f"select count(*) from public.enrollments where student_id='{student}'").stdout.strip()=='1'
    print('PASS omitted/omitted and explicit/omitted payment races: no second enrollment',flush=True)
    # Same-key financial retries retain the pre-existing wait/replay contract:
    # both callers succeed, one receipt, one payment and one conversion.
    same_money={**payment,'enrollment_id':enrollment,'idempotency_key':str(uuid.uuid4())}
    def committed_payment(_):
        return sql(f"begin;set local request.jwt.claim.sub='{actor}';set local role authenticated;select public.create_charge_payment({quote(json.dumps(same_money))}::jsonb);commit;",False)
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool: same_results=list(pool.map(committed_payment,range(2)))
    assert all(r.returncode==0 for r in same_results),[r.stderr for r in same_results]
    ids=[json.loads(r.stdout.strip())['receipt_id'] for r in same_results];assert ids[0]==ids[1]
    assert sql(f"select count(*) from public.receipts where student_id='{student}'").stdout.strip()=='1'
    assert sql(f"select count(*) from public.crm_activities where lead_id='{lead}' and event_type='lead_converted'").stdout.strip()=='1'
    print('PASS simultaneous identical financial requests both succeed with one receipt/conversion',flush=True)

    # Force both overlap orders. The first transaction holds the shared lock;
    # the competing operation must fail with 40001 rather than commit divergence.
    import time
    for winner in ('link','payment'):
        pending_lead,pending_version=qualified();new_student=str(uuid.uuid4());pending_enrollment=str(uuid.uuid4());extra_students.append(new_student)
        sql(f"insert into public.students(id,full_name,status,session_type) values('{new_student}','Payment link race','Prospect','Yearly');insert into public.enrollments(id,student_id,status,session_type,school_year) values('{pending_enrollment}','{new_student}','Submitted','Yearly','2026/2027');")
        link_data={'lead_id':pending_lead,'expected_version':pending_version,'student_choice':'existing','student_id':new_student,'enrollment_id':pending_enrollment,'session_type':'Yearly','school_year':'2026/2027','expected_enrollment_updated_at':sql(f"select updated_at::text from public.enrollments where id='{pending_enrollment}'").stdout.strip()}
        money={**payment,'student_id':new_student,'idempotency_key':str(uuid.uuid4())}
        statement=(f"select public.crm_start_enrollment('{uuid.uuid4()}',{quote(json.dumps(link_data))}::jsonb);" if winner=='link' else f"select public.create_charge_payment({quote(json.dumps(money))}::jsonb);")
        proc=subprocess.Popen(ARGS,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,env=ENV)
        proc.stdin.write(f"begin;set local request.jwt.claim.sub='{actor}';{statement}select 'LOCK_READY';\n");proc.stdin.flush()
        while proc.stdout.readline().strip()!='LOCK_READY':
            if proc.poll() is not None:raise AssertionError('lock holder failed')
        if winner=='link':
            loser=sql(f"begin;set local request.jwt.claim.sub='{actor}';select public.create_charge_payment({quote(json.dumps(money))}::jsonb);rollback;",False)
            assert loser.returncode and 'paiement en cours' in loser.stderr,loser.stderr
        else:
            loser=command('start_enrollment',str(uuid.uuid4()),link_data)
            assert 'error' in loser and 'paiement en cours' in loser['error'],loser
        proc.stdin.write('rollback;\n');proc.stdin.close();proc.wait(timeout=10)
        assert proc.returncode==0,proc.stderr.read()
        assert sql(f"select count(*) from public.enrollments where student_id='{new_student}'").stdout.strip()=='1'
    print('PASS link/payment overlapping in both orders gives controlled retry, no committed divergence',flush=True)
finally:
    if created:
        # Collect only this run's official student IDs before deleting CRM links.
        ids=sql(f"select coalesce(json_agg(student_id) filter(where student_id is not null),'[]') from public.crm_leads where contact_id in(select id from public.crm_contacts where created_by='{actor}')").stdout.strip()
        students=set(json.loads(ids))|set(extra_students)
        student_list=','.join(quote(s) for s in students) or 'null'
        sql(f"""begin;
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
delete from public.enrollments where student_id in({student_list});delete from public.students where id in({student_list});delete from auth.users where id='{actor}';commit;""")
        print('PASS synthetic concurrency fixtures removed; guards restored',flush=True)
