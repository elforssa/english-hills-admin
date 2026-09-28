-- Local-only scheduler checks. The synthetic pg_net request is rolled back, so
-- no HTTP request is dispatched and no external API is contacted.
\set ON_ERROR_STOP on
begin;

create function pg_temp.ok(v boolean, label text) returns void language plpgsql as $$
begin
  if v is not true then raise exception 'FAIL: %', label; end if;
end
$$;

select pg_temp.ok(
  exists(select 1 from pg_extension where extname = 'pg_cron'),
  'pg_cron installed'
);
select pg_temp.ok(
  (select count(*) = 1 from cron.job where jobname = 'crm-intake-primary'),
  'one stable scheduler job'
);
select pg_temp.ok(
  (select schedule = '*/5 * * * *'
      and command = 'select crm_security.invoke_crm_intake_scheduler()'
      and active
     from cron.job where jobname = 'crm-intake-primary'),
  'exact five-minute active schedule'
);
select pg_temp.ok(
  not has_function_privilege('service_role', 'crm_security.invoke_crm_intake_scheduler()', 'EXECUTE'),
  'private scheduler invoker'
);
select pg_temp.ok(
  position('crm_intake_scheduler_url' in pg_get_functiondef('crm_security.invoke_crm_intake_scheduler()'::regprocedure)) > 0
  and position('crm_intake_scheduler_token' in pg_get_functiondef('crm_security.invoke_crm_intake_scheduler()'::regprocedure)) > 0
  and position('net.http_get' in pg_get_functiondef('crm_security.invoke_crm_intake_scheduler()'::regprocedure)) > 0
  and position('admin.english-hills.com' in pg_get_functiondef('crm_security.invoke_crm_intake_scheduler()'::regprocedure)) = 0,
  'Vault-backed request without source URL or token'
);

select pg_temp.ok(
  not exists(select 1 from vault.secrets where name in ('crm_intake_scheduler_url', 'crm_intake_scheduler_token')),
  'clean scheduler Vault baseline'
);

do $$
declare
  rejected boolean := false;
begin
  begin
    perform crm_security.invoke_crm_intake_scheduler();
  exception when sqlstate '22023' then
    rejected := true;
  end;
  perform pg_temp.ok(rejected, 'missing Vault configuration fails before enqueue');
end
$$;

select vault.create_secret(
  'http://scheduler.example/api/cron/crm-intake',
  'crm_intake_scheduler_url',
  'Phase 14 local synthetic scheduler URL'
);
select vault.create_secret(
  'synthetic-scheduler-token',
  'crm_intake_scheduler_token',
  'Phase 14 local synthetic scheduler token'
);

do $$
declare
  rejected boolean := false;
begin
  begin
    perform crm_security.invoke_crm_intake_scheduler();
  exception when sqlstate '22023' then
    rejected := true;
  end;
  perform pg_temp.ok(rejected, 'non-HTTPS Vault URL fails before enqueue');
end
$$;

select vault.update_secret(
  id,
  'https://scheduler.example/api/cron/crm-intake',
  'crm_intake_scheduler_url',
  'Phase 14 local synthetic scheduler URL'
)
from vault.secrets
where name = 'crm_intake_scheduler_url';

create temp table scheduler_request(id bigint primary key);
insert into scheduler_request values(crm_security.invoke_crm_intake_scheduler());
select pg_temp.ok(
  exists(
    select 1
      from net.http_request_queue q
      join scheduler_request r on r.id = q.id
     where q.method = 'GET'
       and q.url = 'https://scheduler.example/api/cron/crm-intake'
       and q.headers->>'Authorization' = 'Bearer synthetic-scheduler-token'
       and q.timeout_milliseconds = 65000
       and q.body is null
  ),
  'bounded authenticated GET queued from Vault values'
);

rollback;
\echo 'PASS pg_cron job, exact cadence, private Vault configuration, safe missing/HTTP failure and rollback-only pg_net request'
