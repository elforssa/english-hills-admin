#!/usr/bin/env bash
set -euo pipefail
node "$(cd "$(dirname "$0")" && pwd)/lib/local-stack.mjs" assert --db-port 54322 >/dev/null  # follow-ups 142 (item 11): this checkout's stack only, before any statement

if [[ "${1:-}" != '--confirm-disposable-local' ]]; then
  echo 'Refusing to reset a database. Re-run with --confirm-disposable-local after confirming local Supabase is disposable.' >&2
  exit 2
fi

project_root=$(cd "$(dirname "$0")/.." && pwd)
db_url='postgresql://postgres:postgres@127.0.0.1:54322/postgres'

branch=$(git -C "$project_root" branch --show-current)
if [[ "$branch" != 'codex-migration' && "$branch" != codex/* ]]; then
  echo 'Refusing migration rehearsal outside a Codex feature branch.' >&2
  exit 2
fi

database_identity=$(psql "$db_url" -XAtq -v ON_ERROR_STOP=1 -c "select current_database() || ':' || inet_server_port()")
if [[ "$database_identity" != 'postgres:5432' ]]; then
  echo "Refusing unexpected database target: $database_identity" >&2
  exit 2
fi

restore_local() {
  status=$?
  trap - EXIT
  node "$project_root/scripts/lib/local-stack.mjs" db-reset --no-seed >/dev/null
  exit "$status"
}
trap restore_local EXIT

cd "$project_root"
node "$project_root/scripts/lib/local-stack.mjs" db-reset --version 054 --no-seed
psql "$db_url" -X -v ON_ERROR_STOP=1 -f scripts/fixtures/receipt-migration-pre055.sql
psql "$db_url" -X -v ON_ERROR_STOP=1 -f supabase/migrations/055_receipt_charge_payments.sql
psql "$db_url" -X -v ON_ERROR_STOP=1 -f scripts/fixtures/receipt-migration-post055.sql
