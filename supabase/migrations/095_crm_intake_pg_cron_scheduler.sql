-- Phase 14: Supabase Cron is the primary trigger for the existing bounded CRM
-- intake endpoint. Runtime configuration is read from Vault; no secret value or
-- deployment URL is stored in this migration.
begin;

-- pg_cron can only be installed in the database selected by cron.database_name.
-- Disposable replay databases deliberately skip the extension/job while still
-- compiling the private invoker. The project database installs it normally.
do $$
declare
  cron_database text := current_setting('cron.database_name', true);
begin
  if cron_database is null or cron_database = current_database() then
    execute 'create extension if not exists pg_cron with schema pg_catalog';
  else
    raise notice 'Skipping pg_cron job in %, configured cron database is %', current_database(), cron_database;
  end if;
end
$$;

create or replace function crm_security.invoke_crm_intake_scheduler()
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  scheduler_url text;
  scheduler_token text;
  request_id bigint;
begin
  select decrypted_secret
    into scheduler_url
    from vault.decrypted_secrets
   where name = 'crm_intake_scheduler_url';

  select decrypted_secret
    into scheduler_token
    from vault.decrypted_secrets
   where name = 'crm_intake_scheduler_token';

  if scheduler_url is null or btrim(scheduler_url) = ''
     or scheduler_token is null or btrim(scheduler_token) = '' then
    raise exception 'CRM intake scheduler Vault configuration is missing'
      using errcode = '22023';
  end if;

  if scheduler_url !~ '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?/api/cron/crm-intake$' then
    raise exception 'CRM intake scheduler URL is invalid'
      using errcode = '22023';
  end if;

  if octet_length(scheduler_token) > 4096 then
    raise exception 'CRM intake scheduler token is invalid'
      using errcode = '22023';
  end if;

  select net.http_get(
    url => scheduler_url,
    headers => jsonb_build_object(
      'Accept', 'application/json',
      'Authorization', 'Bearer ' || scheduler_token
    ),
    timeout_milliseconds => 65000
  ) into request_id;

  return request_id;
end
$$;

revoke all on function crm_security.invoke_crm_intake_scheduler()
  from public, anon, authenticated, service_role;

-- cron.schedule replaces a job with the same case-sensitive name, so replay
-- updates the single stable job rather than creating duplicates.
do $$
begin
  if to_regnamespace('cron') is not null then
    perform cron.schedule(
      'crm-intake-primary',
      '*/5 * * * *',
      'select crm_security.invoke_crm_intake_scheduler()'
    );
  end if;
end
$$;

commit;
