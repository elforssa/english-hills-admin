-- =============================================================================
-- 005 — Receipt email webhook
--
-- Replaces the Base44-side trigger that fired `sendReceiptEmail` whenever a
-- Receipt was created. Uses pg_net to POST the new row to the Supabase Edge
-- Function at /functions/v1/sendReceiptEmail.
--
-- ⚠️ Prerequisites (configure ONCE, outside of this migration):
--
--   1. Deploy the Edge Function:
--        supabase functions deploy sendReceiptEmail
--
--   2. Set the function's secrets (used by Resend inside the function):
--        supabase secrets set RESEND_API_KEY=re_...
--        supabase secrets set RESEND_FROM_ADDRESS='English Hills <noreply@english-hills.com>'
--
--   3. Tell Postgres the settings it needs. Run ONCE as the postgres user:
--
--        alter database postgres
--          set app.settings.service_role_key
--          to '<paste the service_role JWT here>';
--
--        alter database postgres
--          set app.settings.edge_function_url
--          to 'https://<ref>.supabase.co/functions/v1/sendReceiptEmail';
--
--      Both values are at Settings → API in the Supabase dashboard.
--
-- If either setting is missing the trigger logs a NOTICE and returns NEW
-- without raising, so receipt INSERTs still succeed even before secrets are
-- wired.
-- =============================================================================

create extension if not exists pg_net with schema extensions;

create or replace function public.handle_new_receipt()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  edge_url    text := nullif(current_setting('app.settings.edge_function_url', true), '');
  service_key text := nullif(current_setting('app.settings.service_role_key', true), '');
begin
  if service_key is null then
    raise notice 'app.settings.service_role_key not set; receipt email webhook skipped for receipt %', new.id;
    return new;
  end if;
  if edge_url is null then
    raise notice 'app.settings.edge_function_url not set; receipt email webhook skipped for receipt %', new.id;
    return new;
  end if;

  perform net.http_post(
    url     := edge_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body    := jsonb_build_object(
      'type',   'INSERT',
      'table',  'receipts',
      'schema', 'public',
      'record', row_to_json(new)
    )
  );

  return new;
end;
$$;

drop trigger if exists on_receipt_created on public.receipts;

create trigger on_receipt_created
  after insert on public.receipts
  for each row
  execute function public.handle_new_receipt();
