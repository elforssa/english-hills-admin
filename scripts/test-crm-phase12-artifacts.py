#!/usr/bin/env python3
"""Read-only local build/log secret scan. Prints key names/counts, never values.
This supplements source/import review; it is not a universal DLP guarantee.
"""
import json,re
from pathlib import Path

env={}
for line in Path('.env.local').read_text().splitlines():
 m=re.match(r'^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$',line)
 if m:env[m[1]]=m[2].strip().strip("'\"")
assert env.get('NEXT_PUBLIC_SUPABASE_URL')=='http://127.0.0.1:54321'
private={k:v.encode() for k,v in env.items() if not k.startswith('NEXT_PUBLIC_') and re.search(r'SECRET|TOKEN|SERVICE_ROLE|API_KEY|PASSWORD',k) and len(v)>=12}
assert private,'No configured private values available for meaningful scan'
bad_public=[k for k in env if k.startswith('NEXT_PUBLIC_') and re.search(r'SECRET|SERVICE_ROLE|WORKER_TOKEN|PAGE_TOKEN|INSIGHTS_TOKEN|LIFECYCLE_TOKEN',k)]
assert not bad_public,{'private_names_with_public_prefix':bad_public}
files=list(Path('.next/static').rglob('*'))
assert any(p.suffix=='.js' for p in files),'Build client artifacts first'
logs=list(Path('/private/tmp/phase12-regression').glob('*.log'))
hits=[]
for p in [x for x in files if x.is_file()]+logs:
 data=p.read_bytes()
 for k,v in private.items():
  if v in data:hits.append({'file':str(p),'key':k})
assert not hits,{'configured_secret_matches':hits}
# These server-only references/literals must not occur in browser artifacts.
markers=[b'CRM_META_APP_SECRET',b'CRM_META_WORKER_TOKEN',b'CRM_META_PAGE_TOKEN_',b'CRM_META_LIFECYCLE_TOKEN_',b'CRM_META_INSIGHTS_TOKEN_',b'SUPABASE_SERVICE_ROLE_KEY',b'TURNSTILE_SECRET_KEY']
for p in files:
 if p.is_file():
  data=p.read_bytes()
  assert not any(m in data for m in markers),f'Server marker in client artifact: {p}'
print(json.dumps({'passed':True,'private_keys_checked':sorted(private),'client_files':sum(p.is_file() for p in files),'runtime_logs':len(logs),'private_value_matches':0,'server_marker_matches':0}))
