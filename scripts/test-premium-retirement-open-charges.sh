#!/usr/bin/env bash
# Local rehearsal of supabase/manual/premium_retirement_open_charge_descriptions.sql (D5a)
# over the 112 -> 113 upgrade fixture. Local Supabase only; synthetic data only.
set -euo pipefail

project_root=$(cd "$(dirname "$0")/.." && pwd)
script="$project_root/supabase/manual/premium_retirement_open_charge_descriptions.sql"
check="$project_root/scripts/test-premium-retirement-open-charges-check.sql"
export PGPASSWORD=postgres
local_psql=(psql -X -q -h 127.0.0.1 -p 54322 -U postgres -d postgres -v ON_ERROR_STOP=1)

database_identity=$("${local_psql[@]}" -At -c "select current_database() || ':' || inet_server_port()")
if [[ "$database_identity" != 'postgres:5432' ]]; then
  echo "Refusing unexpected database target: $database_identity" >&2
  exit 2
fi

sha=$(printf 'synthetic open-charge export' | shasum -a 256 | cut -d' ' -f1)

# Each refused run must fail and leave every charge and receipt unchanged.
expect_refusal() {
  local label=$1 options=$2 output
  if output=$(PGOPTIONS="$options" "${local_psql[@]}" -f "$script" 2>&1); then
    echo "D5a ran without a valid declaration ($label)" >&2
    exit 1
  fi
  grep -q 'D5a refused' <<<"$output" || { echo "$output" >&2; exit 1; }
  "${local_psql[@]}" -v phase=unchanged -f "$check" >/dev/null
  echo "PASS D5a refused: $label"
}
expect_refusal 'no declaration' ''
expect_refusal 'missing checksum' '-c premium_retirement.open_charge_export_rows=4'
expect_refusal 'malformed checksum' "-c premium_retirement.open_charge_export_rows=4 -c premium_retirement.open_charge_export_sha256=not-a-checksum"
expect_refusal 'wrong declared count' "-c premium_retirement.open_charge_export_rows=3 -c premium_retirement.open_charge_export_sha256=$sha"

output=$(PGOPTIONS="-c premium_retirement.open_charge_export_rows=4 -c premium_retirement.open_charge_export_sha256=$sha" \
  "${local_psql[@]}" -f "$script" 2>&1)
grep -q 'D5a targets: 4 (Standard: 3, Premium: 1)' <<<"$output" || { echo "$output" >&2; exit 1; }
grep -q 'D5a: updated 4 open Yearly charge descriptions' <<<"$output" || { echo "$output" >&2; exit 1; }
"${local_psql[@]}" -v phase=first -f "$check"

# A second run finds nothing and needs no declaration.
output=$("${local_psql[@]}" -f "$script" 2>&1)
grep -q 'D5a targets: 0' <<<"$output" || { echo "$output" >&2; exit 1; }
"${local_psql[@]}" -v phase=second -f "$check" | grep '^PASS'
echo 'PASS D5a open-charge description rehearsal'
