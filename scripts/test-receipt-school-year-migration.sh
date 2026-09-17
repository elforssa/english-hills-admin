#!/usr/bin/env bash
set -euo pipefail

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
  supabase db reset --local --no-seed >/dev/null
  exit "$status"
}
trap restore_local EXIT

cd "$project_root"
supabase db reset --local --version 056 --no-seed
psql "$db_url" -X -v ON_ERROR_STOP=1 <<'SQL'
insert into public.students(id,full_name,status)
values ('91000000-0000-0000-0000-000000000001','Synthetic legacy year fixture','Prospect');
insert into public.charges(id,student_id,session_type,service_description,gross_amount,discount_amount,legacy)
values ('92000000-0000-0000-0000-000000000001','91000000-0000-0000-0000-000000000001','Adults','Libellé historique 2024 libre',100,0,true);
insert into public.receipts(id,student_id,charge_id,date,nom_prenom,session_type,service_description,
  montant_total,montant_paye,mode_paiement,legacy,email_delivery_status)
values ('93000000-0000-0000-0000-000000000001','91000000-0000-0000-0000-000000000001',
  '92000000-0000-0000-0000-000000000001',current_date,'Synthetic legacy year fixture','Adults',
  'Libellé historique 2024 libre',100,40,'Espèces',true,'unknown');
SQL
psql "$db_url" -X -v ON_ERROR_STOP=1 -f supabase/migrations/057_receipt_school_year_workflow.sql
psql "$db_url" -X -v ON_ERROR_STOP=1 <<'SQL'
do $$ begin
  if (select school_year from public.charges where id='92000000-0000-0000-0000-000000000001') is not null then
    raise exception 'Migration guessed a historical charge year';
  end if;
  if (select school_year_snapshot from public.receipts where id='93000000-0000-0000-0000-000000000001') is not null then
    raise exception 'Migration guessed a historical receipt year';
  end if;
  if (select service_description from public.charges where id='92000000-0000-0000-0000-000000000001') <> 'Libellé historique 2024 libre' then
    raise exception 'Migration rewrote a historical description';
  end if;
end $$;
SQL
echo 'receipt school-year migration rehearsal passed'
