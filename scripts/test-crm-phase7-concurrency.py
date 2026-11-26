#!/usr/bin/env python3
"""Phase 7 local concurrent reconciliation tests. Removes this run's synthetic fixtures.

Uses separate PostgreSQL sessions, not simulated sequential retries. The fixture
must be committed to be visible across sessions. Cleanup locks CRM tables and
briefly disables only their append-only DELETE guards inside one transaction;
foreign keys stay enabled. No existing records are deleted or changed.

Follow-ups 142 (2026-11-26): rebuilt on the current commands and wired into CI. The fixture
is created through the screens' commands (crm_create_prospect; « On a parlé » →
« Inscrire maintenant » through crm_log_exchange, which qualifies the prospect, OD-11;
crm_enroll_and_collect, which confirms the enrollment at payment, EAP). The revoked
wrappers crm_qualify_lead, crm_start_enrollment and crm_create_manual_lead are not used.
The races themselves (reconcile against reconcile, reconcile against a real void) are
unchanged and run as authenticated in separate sessions.
"""
import concurrent.futures
import json
import os
from pathlib import Path
import subprocess
import uuid
from lib.local_stack import assert_local_stack
assert_local_stack(db_port='54322')  # follow-ups 142 (item 11): this checkout's stack only, before any statement

ROOT = Path(__file__).resolve().parents[1]
head = (ROOT / '.git/HEAD').read_text().strip()
assert head.startswith('ref: refs/heads/codex/') or head == 'ref: refs/heads/codex-migration' or (os.environ.get('CI') == 'true' and os.environ.get('GITHUB_EVENT_NAME') == 'pull_request' and os.environ.get('GITHUB_HEAD_REF') not in (None, '', 'main', 'master'))
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

def slot(from_days, hhmm, kind):
    # An explicit in-hours slot from the server (scripts/lib/centre-days.mjs), never now()+N.
    script = f"import {{ openSlotSql }} from './scripts/lib/centre-days.mjs'; process.stdout.write(openSlotSql({int(from_days)}, '{hhmm}', '{kind}'))"
    expression = subprocess.run(['node', '--input-type=module', '-e', script], cwd=ROOT, text=True, capture_output=True, check=True, timeout=60).stdout
    return sql(f"select to_json({expression})#>>'{{}}'").stdout.strip()

hours = {str(i): [['10:00','12:30'],['15:20','20:00']] for i in range(2,7)}
hours.update({'1':[['15:00','20:00']],'7':[]})
created=False
try:
    assert sql("select count(*) from supabase_migrations.schema_migrations where version='085'").stdout.strip()=='1'
    assert sql("select count(*) from vault.secrets where name in ('receipt_webhook_url','receipt_webhook_token')").stdout.strip()=='0'
    sql(f"insert into auth.users(id,email,aud,role,created_at,updated_at) values('{actor}','crm-phase7-{actor}@example.invalid','authenticated','authenticated',now(),now());update public.profiles set role='director' where id='{actor}';")
    created=True
    command('create_followup_policy',str(uuid.uuid4()),{'weekly_hours':hours,'opening_hours':hours})
    created_lead=command('create_prospect',str(uuid.uuid4()),{'display_name':'Revenue concurrency','learner_name':'Revenue learner','email':f'phase7-{actor}@example.invalid','source_label':'Manual'})
    assert 'lead' in created_lead,created_lead
    lead=created_lead['lead']['id']
    # « On a parlé » → « Inscrire maintenant »: qualifies the prospect at step enrollment (OD-11).
    result=command('log_exchange',str(uuid.uuid4()),{'lead_id':lead,'expected_version':created_lead['lead']['version'],'channel':'phone','result':'spoke','note':'Enrollment agreed','next':{'enrol':{'due_at':slot(2,'16:00','calling')}}})
    assert result.get('lead',{}).get('status')=='QUALIFIED',result
    token=sql(f"select crm_security.candidate_token('{lead}','Revenue learner',null)").stdout.strip()
    # Committed eligible backlog fixture: the enrollment confirmed at payment, with ONLY the two
    # revenue hooks (the financial event and the enrollment link, both deferred to commit, which
    # now fall in the same transaction) disabled inside it, restored before commit.
    enrol={'enrollment':{'lead_id':lead,'expected_version':result['lead']['version'],'student_choice':'new','learner_name':'Revenue learner','candidate_review':token,'confirm_new':True,'session_type':'Yearly','school_year':'2026/2027','level':'Child 2'},
        'payment':{'gross_amount':1500,'payment_amount':1500,'payment_method':'Espèces'}}
    r=sql(f"begin;alter table public.financial_events disable trigger crm_revenue_financial_event;alter table public.crm_leads disable trigger crm_revenue_enrollment_link;set local request.jwt.claim.sub='{actor}';set local role authenticated;select public.crm_enroll_and_collect({quote(uuid.uuid4())}::uuid,{quote(json.dumps(enrol))}::jsonb);reset role;set constraints all immediate;alter table public.financial_events enable trigger crm_revenue_financial_event;alter table public.crm_leads enable trigger crm_revenue_enrollment_link;commit;")
    paid=json.loads(r.stdout.strip())
    student=paid['enrollment']['student_id'];enrollment=paid['enrollment']['id'];charge=paid['charge_id'];extra_students.append(student)
    receipt=paid['receipt_id']
    assert sql(f"select status from crm_leads where id='{lead}'").stdout.strip()=='CONVERTED'
    assert sql(f"select count(*) from crm_revenue_entries where receipt_id='{receipt}'").stdout.strip()=='0'
    def reconcile(_):return sql(f"begin;set local request.jwt.claim.sub='{actor}';set local role authenticated;select public.crm_reconcile_receipt_revenue('{receipt}');commit;",False)
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool: outcomes=list(pool.map(reconcile,range(2)))
    assert all(r.returncode==0 for r in outcomes),[r.stderr for r in outcomes]
    assert sql(f"select count(*)||':'||sum(amount_delta) from crm_revenue_entries where receipt_id='{receipt}'").stdout.strip()=='1:1500.00'
    assert sorted(json.loads(r.stdout.strip())['entries_added'] for r in outcomes)==[0,1]
    print('PASS two workers reconcile same pending event: exactly one result',flush=True)
    def void(_):return sql(f"begin;set local request.jwt.claim.sub='{actor}';set local role authenticated;select public.void_financial_receipt('{receipt}','Synthetic concurrent reversal','{uuid.uuid4()}');commit;",False)
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        worker=pool.submit(reconcile,0);correction=pool.submit(void,0);outcomes=[worker.result(),correction.result()]
    assert all(r.returncode==0 for r in outcomes),[r.stderr for r in outcomes]
    assert sql(f"select sum(amount_delta) from crm_revenue_entries where receipt_id='{receipt}'").stdout.strip()=='0.00'
    sql(f"begin;set local request.jwt.claim.sub='{actor}';select public.delete_mistaken_receipt('{receipt}','Synthetic later deletion','{uuid.uuid4()}');commit;")
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:outcomes=list(pool.map(reconcile,range(2)))
    assert all(r.returncode==0 for r in outcomes),[r.stderr for r in outcomes]
    assert sql(f"select count(*)||':'||sum(amount_delta) from crm_revenue_entries where receipt_id='{receipt}'").stdout.strip()=='3:0.00'
    assert sql(f"select status from crm_leads where id='{lead}'").stdout.strip()=='CONVERTED'
    print('PASS reconciliation races actual void, later deletion remains zero and conversion is preserved',flush=True)
    # Ordinary committed payment uses the deferred hook without any caller action.
    money={'student_id':student,'enrollment_id':enrollment,'session_type':'Yearly','school_year':'2026/2027','level':'Child 2','gross_amount':1500,'payment_amount':500,'payment_method':'Espèces','idempotency_key':str(uuid.uuid4())}
    r=sql(f"begin;set local request.jwt.claim.sub='{actor}';set local role authenticated;select public.create_charge_payment({quote(json.dumps(money))}::jsonb);commit;")
    second=json.loads(r.stdout.strip())['receipt_id']
    assert sql(f"select sum(amount_delta) from crm_revenue_entries where receipt_id='{second}'").stdout.strip()=='500.00'
    print('PASS real commit automatically sees outer-wrapper enrollment links',flush=True)
finally:
    if created:
        student_list=','.join(quote(s) for s in extra_students) or 'null'
        sql(f"""begin;
-- Receipts are never hard-deleted outside this sanctioned local clean-up (Batch E, P2.3a).
set local english_hills.receipt_test_cleanup = 'on';
lock table public.crm_revenue_entries,public.crm_activities,public.crm_command_requests,public.crm_contacts,public.crm_followup_policies,public.crm_leads,public.crm_submission_attribution,public.crm_submissions,public.crm_tasks in access exclusive mode;
alter table public.crm_revenue_entries disable trigger crm_revenue_immutable;
delete from public.crm_revenue_entries where financial_event_id in(select id from public.financial_events where actor_id='{actor}');
alter table public.crm_revenue_entries enable trigger crm_revenue_immutable;
delete from public.financial_events where actor_id='{actor}';delete from public.financial_requests where actor_id='{actor}';
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
-- Receipts and charges after the CRM history that references them (142: the payment now runs in
-- crm_enroll_and_collect, so the conversion activities point at the receipt).
delete from public.receipts where student_id in({student_list});delete from public.charges where student_id in({student_list});
set local eh.enrollment_command = on; delete from public.enrollments where student_id in({student_list});delete from public.students where id in({student_list});delete from auth.users where id='{actor}';commit;""")
        print('PASS synthetic revenue fixtures removed; all guards restored',flush=True)
