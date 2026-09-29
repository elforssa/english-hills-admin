-- CRM Batch 2: independent lifecycle trigger. The job is deliberately created
-- inactive; release approval, verified provider/form contracts and operator
-- provisioning are required before activation.
begin;

do $$
declare cron_database text := current_setting('cron.database_name', true);
begin
  if cron_database is null or cron_database = current_database() then
    execute 'create extension if not exists pg_cron with schema pg_catalog';
  else
    raise notice 'Skipping pg_cron lifecycle job in %, configured cron database is %', current_database(), cron_database;
  end if;
end $$;

create or replace function crm_security.invoke_crm_lifecycle_scheduler()
returns bigint
language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare scheduler_url text;scheduler_token text;request_id bigint;
begin
  select decrypted_secret into scheduler_url from vault.decrypted_secrets where name='crm_lifecycle_scheduler_url';
  select decrypted_secret into scheduler_token from vault.decrypted_secrets where name='crm_lifecycle_scheduler_token';
  if scheduler_url is null or btrim(scheduler_url)='' or scheduler_token is null or btrim(scheduler_token)='' then
    raise exception 'CRM lifecycle scheduler Vault configuration is missing' using errcode='22023';
  end if;
  if scheduler_url is distinct from 'https://admin.english-hills.com/api/cron/crm-lifecycle' then
    raise exception 'CRM lifecycle scheduler URL is invalid' using errcode='22023';
  end if;
  if octet_length(scheduler_token)>4096 then raise exception 'CRM lifecycle scheduler token is invalid' using errcode='22023';end if;
  select net.http_get(url=>scheduler_url,headers=>jsonb_build_object('Accept','application/json','Authorization','Bearer '||scheduler_token),timeout_milliseconds=>55000) into request_id;
  return request_id;
end $$;
revoke all on function crm_security.invoke_crm_lifecycle_scheduler() from public,anon,authenticated,service_role;

do $$
declare lifecycle_job bigint;
begin
  if to_regnamespace('cron') is not null then
    select cron.schedule('crm-lifecycle-primary','*/5 * * * *','select crm_security.invoke_crm_lifecycle_scheduler()') into lifecycle_job;
    perform cron.alter_job(lifecycle_job, active => false);
  end if;
end $$;

commit;
