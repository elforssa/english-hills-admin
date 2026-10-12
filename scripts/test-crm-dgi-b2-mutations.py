#!/usr/bin/env python3
"""DGI-B B2 falsifiability check (local only, rolled back).

Replaces crm_get_marketing_cohort with a deliberately wrong body inside one psql
transaction, runs scripts/test-crm-dgi-b2.sql in that same transaction and requires the
suite to fail. The suite's own ROLLBACK (or the aborted session) discards the mutation,
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

MUTATIONS = {
    'contacted counts events instead of leads': (
        "exists(select 1 from public.crm_activities a where a.lead_id=c.id and a.event_type in ('contact_attempted','conversation_recorded','whatsapp_sent','whatsapp_conversation') and a.occurred_at<=cutoff)::int as contacted",
        "(select count(*) from public.crm_activities a where a.lead_id=c.id and a.event_type in ('contact_attempted','conversation_recorded','whatsapp_sent','whatsapp_conversation') and a.occurred_at<=cutoff)::int as contacted"),
    'contacted without whatsapp_sent': (
        "event_type in ('contact_attempted','conversation_recorded','whatsapp_sent','whatsapp_conversation')",
        "event_type in ('contact_attempted','conversation_recorded','whatsapp_conversation')"),
    'reached includes whatsapp_sent': (
        "event_type in ('conversation_recorded','whatsapp_conversation')",
        "event_type in ('conversation_recorded','whatsapp_conversation','whatsapp_sent')"),
    'contacted ignores the cutoff': (
        "'whatsapp_sent','whatsapp_conversation') and a.occurred_at<=cutoff)::int as contacted",
        "'whatsapp_sent','whatsapp_conversation'))::int as contacted"),
    'converted_paid ignores revenue': (
        "(f.converted=1 and f.revenue>0)::int as converted_paid", "(f.converted=1)::int as converted_paid"),
    'booked_leads counts tests': (
        "(f.tests_booked>0)::int as booked_leads", "f.tests_booked::int as booked_leads"),
    'merged leads included': (
        "where l.merged_into_lead_id is null and s.occurred_at", "where s.occurred_at"),
    'trusted row spend kept under the filter': (
        "like 'meta:%' and complete and suppressed is null then coalesce(s.spend,0)", "like 'meta:%' and complete then coalesce(s.spend,0)"),
    'spend rows kept under suppression': (
        "where suppressed is null and d.connection_id=p_connection", "where d.connection_id=p_connection"),
    'summary spend kept under suppression': (
        "case when complete and suppressed is null and (p_channel", "case when complete and (p_channel"),
    'none matches nothing': (
        "(p_session_type='none' and l.session_type is null) or ", ""),
    'program level not suppressed': (
        "when p_level='program' then 'program_level' end", "end"),
    'program rows typed unattributed': (
        "like 'program:%' then 'program' when", "like 'program:%' then 'unattributed' when"),
    'NULL program unnamed': (
        "coalesce(x.object_key,'Sans programme')", "x.object_key"),
    'program value unchecked': (
        ",'Mise à niveau','Other','none')) then raise", ",'Mise à niveau','Other','none','yearly','')) then raise"),
    'attributed_contacted over all leads': (
        "coalesce(sum(contacted) filter(where attribution_bucket like 'meta:%'),0) as attributed_contacted", "coalesce(sum(contacted),0) as attributed_contacted"),
    'uncovered spend shown as 0': (
        "like 'meta:%' and complete and suppressed is null then coalesce(s.spend,0) end", "like 'meta:%' and suppressed is null then coalesce(s.spend,0) end"),
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
for name, (old, new) in MUTATIONS.items():
    if body.count(old) < 1:
        sys.exit(f'mutation anchor not found: {name}')
    result = run('begin;\n' + body.replace(old, new) + '\n')
    if result.returncode == 0:
        missed.append(name)
    reason = next((line for line in result.stderr.splitlines() if 'FAIL' in line or 'Unexpected' in line or 'ERROR' in line), '')
    print(('caught ' if result.returncode else 'MISSED ') + name + (': ' + reason.split('ERROR:')[-1].strip()[:140] if reason else ''), flush=True)
clean = run('')
if clean.returncode != 0 or 'PASS DGI-B B2 SQL' not in clean.stdout + clean.stderr:
    sys.exit('unmutated suite failed:\n' + clean.stderr[-2000:])
if body_hash() != installed:
    sys.exit('the installed cohort body changed')
if missed:
    sys.exit('mutations not detected: ' + ', '.join(missed))
print(f'PASS DGI-B B2 falsifiability: {len(MUTATIONS)} wrong cohort bodies each fail the suite; the migration-116 body passes and is never left replaced')
