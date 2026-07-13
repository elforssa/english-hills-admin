-- Finance aggregation done in the DB so totals cover ALL receipts, not just the
-- most recent page loaded in the browser. Fixes the silent under-count once the
-- receipt count grows past the old client-side 200-row limit.
--
-- Both functions are SECURITY INVOKER (default) so the caller's RLS applies:
-- admins/directors see all receipts (per the "receipts admin select" policy),
-- other roles see nothing.

-- Global finance KPIs + per-program breakdown, over every receipt.
create or replace function public.get_finance_summary()
returns json
language sql
stable
as $$
  select json_build_object(
    'total_encaisse',  coalesce(sum(montant_paye), 0),
    'total_du',        coalesce(sum(montant_total * (1 - coalesce(remise, 0) / 100)), 0),
    'total_restant',   coalesce(sum(greatest(0, montant_total * (1 - coalesce(remise, 0) / 100) - montant_paye)), 0),
    'count_total',     count(*),
    'count_en_retard', count(*) filter (where statut_paiement = 'En retard'),
    'count_solde',     count(*) filter (where statut_paiement = 'Soldé'
                          or (montant_total * (1 - coalesce(remise, 0) / 100) - montant_paye) <= 0),
    'by_program', (
      select coalesce(json_agg(json_build_object('program', prog, 'encaisse', enc, 'restant', rest) order by enc desc), '[]'::json)
      from (
        select coalesce(session_type, '(non défini)') as prog,
               sum(montant_paye) as enc,
               sum(greatest(0, montant_total * (1 - coalesce(remise, 0) / 100) - montant_paye)) as rest
        from public.receipts
        group by 1
      ) g
    )
  )
  from public.receipts;
$$;

-- Unpaid receipts (balance > 0), overdue first then largest owed. For the
-- "À relancer" widget — always accurate regardless of total receipt count.
create or replace function public.get_unpaid_receipts(lim int default 50)
returns setof public.receipts
language sql
stable
as $$
  select *
  from public.receipts
  where (montant_total * (1 - coalesce(remise, 0) / 100) - montant_paye) > 0.5
  order by (statut_paiement = 'En retard') desc,
           (montant_total * (1 - coalesce(remise, 0) / 100) - montant_paye) desc
  limit lim;
$$;

grant execute on function public.get_finance_summary() to authenticated;
grant execute on function public.get_unpaid_receipts(int) to authenticated;
