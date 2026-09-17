begin;

-- Payroll creation must use the server endpoint, which reads contract terms
-- from the database. Staff may still advance the existing status workflow.
-- Historical rows and their amounts are not changed.
revoke insert, update on public.payroll from public, anon, authenticated;
grant update (statut) on public.payroll to authenticated;

commit;
