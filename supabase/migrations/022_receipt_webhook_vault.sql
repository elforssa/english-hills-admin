-- =============================================================================
-- 022_receipt_webhook_vault.sql
--
-- Migration 005 wired the receipt-email webhook to read its auth token and
-- target URL from `app.settings.*` database parameters. That requires
-- `ALTER DATABASE` (superuser), which Supabase managed projects block. The
-- net effect: the webhook never fired in production — receipts were inserted
-- but no email was ever sent.
--
-- This migration moves those values into Supabase Vault (encrypted at rest)
-- and rewrites `handle_new_receipt()` to read from `vault.decrypted_secrets`.
--
-- ─── Operator step (run ONCE, not part of this migration) ────────────────────
-- The webhook token and URL are NOT seeded by this migration to avoid
-- committing secrets to source control. After applying this migration, run
-- the following in the Supabase SQL Editor (or via psql with a privileged
-- connection), substituting the real values:
--
--     select vault.create_secret(
--       '<service-role-key-or-shared-secret>',
--       'receipt_webhook_token',
--       'Shared secret presented as Bearer to sendReceiptEmail Edge Function.'
--     );
--     select vault.create_secret(
--       'https://<project-ref>.supabase.co/functions/v1/sendReceiptEmail',
--       'receipt_webhook_url',
--       'Edge Function endpoint that handle_new_receipt() POSTs to.'
--     );
--
-- The token MUST match the Edge Function's `FUNCTION_AUTH_TOKEN` secret. If
-- you rotate it, update BOTH the vault entry and the Edge Function secret.
--
-- If the vault entries are missing the trigger short-circuits with a NOTICE
-- (receipt insert still succeeds), so the migration is safe to run before
-- the operator seeds the values.
-- =============================================================================


-- ── Rewrite trigger to read from Vault ──────────────────────────────────────
create or replace function public.handle_new_receipt()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  edge_url    text;
  auth_token  text;
begin
  -- Read from the encrypted vault view. NULL values short-circuit the
  -- webhook with a NOTICE so receipt inserts still succeed even if the
  -- vault entries are missing (e.g. fresh dev DB or pre-seed).
  select decrypted_secret into auth_token
    from vault.decrypted_secrets where name = 'receipt_webhook_token';
  select decrypted_secret into edge_url
    from vault.decrypted_secrets where name = 'receipt_webhook_url';

  if auth_token is null or auth_token = '' then
    raise notice 'vault secret receipt_webhook_token unset; skipping email for receipt %', new.id;
    return new;
  end if;
  if edge_url is null or edge_url = '' then
    raise notice 'vault secret receipt_webhook_url unset; skipping email for receipt %', new.id;
    return new;
  end if;

  perform net.http_post(
    url     := edge_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || auth_token
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

-- Trigger itself was created in 005 — leaving it in place. No need to
-- drop/recreate since the function body is what changed.
