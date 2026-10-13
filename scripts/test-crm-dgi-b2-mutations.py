#!/usr/bin/env python3
"""DGI-B B2 falsifiability check (local only, rolled back).

Replaces crm_get_marketing_cohort with a deliberately wrong body inside one psql
transaction, runs scripts/test-crm-dgi-b2.sql in that same transaction and requires the
suite to fail on the named assertion for that mutation (never on a compile error). The suite's own ROLLBACK (or the aborted session) discards the mutation,
so the database always keeps the migration-116 body. A final unmutated run must pass.
"""
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MIGRATION = os.path.join(ROOT, 'supabase/migrations/116_crm_marketing_funnel_program.sql')
SUITE = os.path.join(ROOT, 'scripts/test-crm-dgi-b2.sql')

source = open(MIGRATION, encoding='utf-8').read()
start = source.index('create function public.crm_get_marketing_cohort')
end = source.index('end $$;', start) + len('end $$;')
body = source[start:end].replace('create function', 'create or replace function', 1)

# name: (anchor in the 116 body, wrong replacement, the suite assertion that must fail).
MUTATIONS = {
    'contacted counts events instead of leads': (
        "exists(select 1 from public.crm_activities a where a.lead_id=c.id and a.event_type in ('contact_attempted','conversation_recorded','whatsapp_sent','whatsapp_conversation') and a.occurred_at<=cutoff)::int as contacted",
        "(select count(*) from public.crm_activities a where a.lead_id=c.id and a.event_type in ('contact_attempted','conversation_recorded','whatsapp_sent','whatsapp_conversation') and a.occurred_at<=cutoff)::int as contacted",
        'FAIL: contacted: attempt, conversation or WhatsApp, each lead once'),
    'contacted without whatsapp_sent': (
        "event_type in ('contact_attempted','conversation_recorded','whatsapp_sent','whatsapp_conversation')",
        "event_type in ('contact_attempted','conversation_recorded','whatsapp_conversation')",
        'FAIL: contacted: attempt, conversation or WhatsApp, each lead once'),
    'reached includes whatsapp_sent': (
        "event_type in ('conversation_recorded','whatsapp_conversation')",
        "event_type in ('conversation_recorded','whatsapp_conversation','whatsapp_sent')",
        'FAIL: reached: recorded conversation only'),
    'contacted ignores the cutoff': (
        "'whatsapp_sent','whatsapp_conversation') and a.occurred_at<=cutoff)::int as contacted",
        "'whatsapp_sent','whatsapp_conversation'))::int as contacted",
        'FAIL: stages respect the outcome cutoff'),
    'converted_paid ignores revenue': (
        "(f.converted=1 and f.revenue>0)::int as converted_paid", "(f.converted=1)::int as converted_paid",
        'FAIL: converted_paid needs collected revenue'),
    'converted_paid ignores converted': (
        "(f.converted=1 and f.revenue>0)::int as converted_paid", "(f.revenue>0)::int as converted_paid",
        'FAIL: paid unconfirmed lead: converted_paid requires the trusted conversion'),
    'booked_leads counts tests': (
        "(f.tests_booked>0)::int as booked_leads", "f.tests_booked::int as booked_leads",
        'FAIL: booked_leads counts leads, not tests'),
    'attended_leads counts tests': (
        "(f.tests_attended>0)::int as attended_leads", "f.tests_attended::int as attended_leads",
        'FAIL: attended_leads counts leads, not tests'),
    'merged leads included': (
        "where l.merged_into_lead_id is null and s.occurred_at", "where s.occurred_at",
        'FAIL: distinct canonical first-touch leads'),
    'trusted row spend kept under the filter': (
        "like 'meta:%' and complete and suppressed is null then coalesce(s.spend,0)", "like 'meta:%' and complete then coalesce(s.spend,0)",
        'FAIL: a trusted row under the filter has NULL spend, never 0'),
    'spend rows kept under suppression': (
        "where suppressed is null and d.connection_id=p_connection", "where d.connection_id=p_connection",
        'FAIL: one row per program and the NULL bucket; no spend-only row'),
    'summary spend kept under suppression': (
        "case when complete and suppressed is null and (p_channel", "case when complete and (p_channel",
        'FAIL: program level suppresses summary spend and ratios'),
    'none matches nothing': (
        "(p_session_type='none' and l.session_type is null) or ", "",
        'FAIL: none selects leads without a session type'),
    'program level not suppressed': (
        "when p_level='program' then 'program_level' end", "end",
        'FAIL: program level suppresses summary spend and ratios'),
    'program rows typed unattributed': (
        "like 'program:%' then 'program' when", "like 'program:%' then 'unattributed' when",
        'FAIL: program rows never carry spend, delivery or ratios'),
    'NULL program unnamed': (
        "coalesce(x.object_key,'Sans programme')", "x.object_key",
        'FAIL: NULL session_type bucket'),
    'program value unchecked': (
        ",'Mise à niveau','Other','none')) then raise", ",'Mise à niveau','Other','none','yearly','')) then raise",
        "Unexpected success: select pg_temp.report('campaign','yearly')"),
    'attributed_contacted over all leads': (
        "coalesce(sum(contacted) filter(where attribution_bucket like 'meta:%'),0) as attributed_contacted", "coalesce(sum(contacted),0) as attributed_contacted",
        'FAIL: Meta-only denominators include attributed_contacted'),
    'pending_leads read from the program bucket': (
        "count(*) filter(where attribution_bucket like 'pending:%') as pending_leads", "count(*) filter(where bucket like 'pending:%') as pending_leads",
        'FAIL: pending_leads at program level counts the pending lead'),
    'uncovered spend shown as 0': (
        "like 'meta:%' and complete and suppressed is null then coalesce(s.spend,0) end", "like 'meta:%' and suppressed is null then coalesce(s.spend,0) end",
        'FAIL: an uncovered date gives NULL spend, never 0'),
}


def run(prefix):
    command = ['psql', '-X', '-q', '-h', '127.0.0.1', '-p', '54322', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']
    script = prefix + '\n\\i ' + SUITE + '\n'
    return subprocess.run(command, input=script, capture_output=True, text=True, env={**os.environ, 'PGPASSWORD': 'postgres'}, timeout=300)


def body_hash():
    return subprocess.run(['psql', '-X', '-qAt', '-h', '127.0.0.1', '-p', '54322', '-U', 'postgres', '-d', 'postgres', '-c', "select string_agg(md5(prosrc),',') from pg_proc where proname='crm_get_marketing_cohort'"],
                          capture_output=True, text=True, env={**os.environ, 'PGPASSWORD': 'postgres'}, check=True).stdout.strip()


installed = body_hash()
missed = []
for name, (old, new, expected) in MUTATIONS.items():
    if body.count(old) < 1:
        sys.exit(f'mutation anchor not found: {name}')
    # The mutated body must install cleanly; only the named suite assertion may reject it.
    result = run('begin;\n' + body.replace(old, new) + '\n')
    errors = [line.split('ERROR:', 1)[1].strip() for line in result.stderr.splitlines() if 'ERROR:' in line]
    caught = result.returncode != 0 and len(errors) == 1 and errors[0].startswith(expected)
    if not caught:
        missed.append(name)
    print(('caught ' if caught else 'MISSED ') + name + ': ' + (errors[0][:140] if errors else 'suite passed'), flush=True)
clean = run('')
if clean.returncode != 0 or 'PASS DGI-B B2 SQL' not in clean.stdout + clean.stderr:
    sys.exit('unmutated suite failed:\n' + clean.stderr[-2000:])
if body_hash() != installed:
    sys.exit('the installed cohort body changed')
if missed:
    sys.exit('mutations not detected by their named assertion: ' + ', '.join(missed))
print(f'PASS DGI-B B2 falsifiability: {len(MUTATIONS)} wrong cohort bodies each fail their named suite assertion; the migration-116 body passes and is never left replaced')
