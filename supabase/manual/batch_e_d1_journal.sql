-- Read-only journal for D1 (ids and dates only). Save the JSON output privately.
set transaction read only;
select json_agg(json_build_object('id', id, 'date', date, 'created_at', created_at) order by date, created_at, id)
from public.receipts where receipt_number is null;
