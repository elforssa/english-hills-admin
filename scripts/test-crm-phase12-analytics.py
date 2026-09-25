#!/usr/bin/env python3
"""Repeat the full existing analytics contract with EUR and a non-center timezone.
Run serially through the Phase 12 regression runner. Original SQL is unchanged.
All fixture writes and the legacy email-trigger fixture control roll back.
"""
import os,subprocess,argparse
p=argparse.ArgumentParser();p.add_argument("--disposable",action="store_true");args=p.parse_args()
from pathlib import Path
assert Path('.git/HEAD').read_text().startswith('ref: refs/heads/codex/')
s=Path('scripts/test-crm-phase11.sql').read_text()
for old,new in [('"timezone":"Africa/Casablanca"','"timezone":"America/New_York"'),('"USD"','"EUR"'),('2025-12-31 23:30Z','2026-01-03 04:30Z'),('Casablanca account date rather than UTC acquisition date','New York Jan 2 acquisition despite UTC/Casablanca Jan 3')]:
 assert old in s,old
 s=s.replace(old,new)
s=s.replace('rollback;', "select pg_temp.ok((select bool_and(timezone='Africa/Casablanca') from crm_followup_policies),'operational policy remains Casablanca while reporting is New York');\nrollback;")
command=['docker','exec','-i','supabase_db_hills-phase12-platform','psql','-X','-q','-U','postgres','-d','phase12_upgrade','-v','ON_ERROR_STOP=1'] if args.disposable else ['psql','-X','-q','-h','127.0.0.1','-p','54322','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1']
subprocess.run(command,input=s,text=True,env={**os.environ,'PGPASSWORD':'postgres'},check=True)
print('PASS Phase12 EUR/MAD suppression, New York cohort midnight boundary, unchanged Casablanca operations, full analytics reconciliation')
