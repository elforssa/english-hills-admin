#!/usr/bin/env bash
set -euo pipefail

db_url='postgresql://postgres:postgres@127.0.0.1:54322/postgres'
actor='11000000-0000-0000-0000-000000000001'
student='21000000-0000-0000-0000-000000000001'
charge='41000000-0000-0000-0000-000000000001'
retry_charge='41000000-0000-0000-0000-000000000002'

cleanup() {
  psql "$db_url" -v ON_ERROR_STOP=1 -q -c "delete from public.financial_events where actor_id='$actor'; delete from public.financial_requests where actor_id='$actor'; delete from public.receipts where charge_id in ('$charge','$retry_charge'); delete from public.charges where id in ('$charge','$retry_charge'); delete from public.students where id='$student';" || true
}
trap cleanup EXIT
cleanup

psql "$db_url" -v ON_ERROR_STOP=1 -q -c "insert into auth.users(id,email,aud,role,created_at,updated_at) values('$actor','concurrency@example.test','authenticated','authenticated',now(),now()) on conflict(id) do nothing; update public.profiles set role='director' where id='$actor'; insert into public.students(id,full_name,status) values('$student','Concurrent Synthetic','Prospect'); insert into public.charges(id,student_id,session_type,service_description,plan_type,gross_amount,created_by) values('$charge','$student','Yearly','Concurrency','Standard',100,'$actor'),('$retry_charge','$student','Yearly','Idempotency','Standard',20,'$actor');"

call_payment() {
  local target_charge="$1" amount="$2" request_key="$3" output_file="$4"
  psql "$db_url" -v ON_ERROR_STOP=1 -Atq -c "begin; select set_config('request.jwt.claim.sub','$actor',true); set local role authenticated; select public.create_charge_payment(jsonb_build_object('student_id','$student','charge_id','$target_charge','payment_amount','$amount','payment_date',current_date,'payment_method','Espèces','idempotency_key','$request_key')); commit;" >"$output_file" 2>&1
}

first_output=$(mktemp)
second_output=$(mktemp)
set +e
call_payment "$charge" 80 '51000000-0000-0000-0000-000000000001' "$first_output" & first_pid=$!
call_payment "$charge" 80 '51000000-0000-0000-0000-000000000002' "$second_output" & second_pid=$!
wait "$first_pid"; first_status=$?
wait "$second_pid"; second_status=$?
set -e
if [[ $((first_status + second_status)) -eq 0 || $first_status -ne 0 && $second_status -ne 0 ]]; then
  echo 'Expected exactly one competing 80 MAD payment to succeed' >&2; exit 1
fi
psql "$db_url" -v ON_ERROR_STOP=1 -Atq -c "select case when paid_amount=80 and balance=20 then 'ok' else 'bad' end from public.charge_balances where id='$charge'" | grep -q '^ok$'

retry_one=$(mktemp)
retry_two=$(mktemp)
call_payment "$retry_charge" 20 '51000000-0000-0000-0000-000000000003' "$retry_one" & retry_pid_one=$!
call_payment "$retry_charge" 20 '51000000-0000-0000-0000-000000000003' "$retry_two" & retry_pid_two=$!
wait "$retry_pid_one"
wait "$retry_pid_two"
psql "$db_url" -v ON_ERROR_STOP=1 -Atq -c "select case when count(*)=1 and sum(montant_paye)=20 then 'ok' else 'bad' end from public.receipts where charge_id='$retry_charge'" | grep -q '^ok$'

echo 'receipt concurrency tests passed'
