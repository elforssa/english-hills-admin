#!/usr/bin/env bash
# RWR-r5 task T-R0: run Q01–Q30 against a LOCAL database and check the read-only proof.
#
# Usage: supabase/manual/rwr_r0/run_local.sh [--seed] <local-postgres-url> <lead-id-for-Q23> [out-dir]
#   --seed  first loads local_fixture.sql (synthetic data; needs a clean build) in one transaction.
#
# Local stacks only. The URL must point at 127.0.0.1 or localhost; Production R0 uses
#   supabase db query --linked --project-ref <ref> -f <file>
# one file at a time, under its own owner approval (plan RWR-r5 §10, step R0).
#
# Each file is sent as ONE multi-statement request (psql -c), like the Management API, so
# its leading `set transaction read only;` governs the query. The script fails when a file
# errors, returns no row, or returns a row whose first column (read_only) is not `on`.
# A negative control then proves the wrapper really refuses a write.
set -euo pipefail

seed=0
if [[ ${1:-} == --seed ]]; then seed=1; shift; fi
url=${1:?local postgres url}
lead=${2:?lead id for Q23}
out=${3:-}
case "$url" in
  *@127.0.0.1:*|*@localhost:*) ;;
  *) echo "refused: $url is not a local database" >&2; exit 2 ;;
esac
[[ $lead =~ ^[0-9a-f-]{36}$ ]] || { echo "refused: lead id must be a uuid" >&2; exit 2; }

dir=$(cd "$(dirname "$0")" && pwd)
if (( seed )); then
  psql -X -q -1 -v ON_ERROR_STOP=1 -d "$url" -c "set eh.rwr_r0_fixture = 'local'" -f "$dir/local_fixture.sql"
  echo "seeded local_fixture.sql"
fi
fail=0
for f in "$dir"/q[0-3][0-9]_*.sql; do
  q=$(basename "$f" .sql)
  sql=$(sed "s/:'lead_id'/'$lead'/" "$f")
  if ! res=$(psql -X -q -v ON_ERROR_STOP=1 --csv -d "$url" -c "$sql" 2>&1); then
    echo "FAIL $q: $res"; fail=1; continue
  fi
  rows=$(printf '%s\n' "$res" | tail -n +2)
  n=$(printf '%s\n' "$rows" | grep -c . || true)
  bad=$(printf '%s\n' "$rows" | grep -vc '^on,' || true)
  if [[ $(printf '%s\n' "$res" | head -1) != read_only,* || $n -lt 1 || $bad -ne 0 ]]; then
    echo "FAIL $q: rows=$n not_read_only=$bad"; fail=1; continue
  fi
  echo "ok   $q rows=$n"
  if [[ -n $out ]]; then mkdir -p "$out"; printf '%s\n' "$res" > "$out/$q.csv"; fi
done

# Negative control: the same wrapper must refuse a write.
if neg=$(psql -X -q -v ON_ERROR_STOP=1 -d "$url" -c "set transaction read only; create temporary table t_r0_probe(x int);" 2>&1); then
  echo "FAIL negative control: a write succeeded under set transaction read only"; fail=1
elif [[ $neg == *"read-only transaction"* ]]; then
  echo "ok   negative control: write refused (read-only transaction)"
else
  echo "FAIL negative control: unexpected error: $neg"; fail=1
fi
exit $fail
