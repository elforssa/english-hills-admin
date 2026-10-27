-- Read-only journal for D3 (ids and amounts only). Save the JSON output privately.
set transaction read only;
select json_agg(json_build_object('id', c.id, 'gross_amount', c.gross_amount, 'discount_amount', c.discount_amount,
  'net_amount', b.net_amount, 'paid_amount', b.paid_amount, 'balance', b.balance) order by c.id)
from public.charges c join public.charge_balances b on b.id = c.id
where c.legacy and c.voided_at is null and (b.paid_amount > b.net_amount or (b.balance > 0 and b.balance < 1));
