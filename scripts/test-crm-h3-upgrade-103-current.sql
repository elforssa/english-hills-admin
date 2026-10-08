\set ON_ERROR_STOP on
\ir test-crm-h3-04-manifest.sql
begin;
create function pg_temp.ok(v boolean,label text) returns void language plpgsql as $$ begin if v is not true then raise exception 'FAIL: %',label;end if;end $$;
create function pg_temp.denied(q text,code text default '42501') returns void language plpgsql as $$ begin begin execute q;exception when others then if sqlstate=code then return;end if;raise exception 'Expected %, got %: %',code,sqlstate,sqlerrm;end;raise exception 'Unexpected success: %',q;end $$;
set local request.jwt.claim.role='service_role';set local request.jwt.claim.sub='';
select pg_temp.ok((select max(version::integer)=113 from supabase_migrations.schema_migrations),'upgraded to current 113');
do $$declare t text;got jsonb;begin
 for t in select k from public.h3_upgrade_snapshot where k<>'acl' loop
  execute format('select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),''[]'') from public.%I t where %s',t,case when t='crm_lifecycle_provider_contracts' then 'id <> ''7cf9833e-4f77-4335-b1ec-c047d9353f54''' else 'true' end) into got;
  perform pg_temp.ok(got=(select data from public.h3_upgrade_snapshot where k=t),'migration leaves all inventory unchanged: '||t);
 end loop;
end $$;
select pg_temp.ok((select jsonb_agg(jsonb_build_object('name',p.oid::regprocedure::text,'acl',p.proacl,'owner',p.proowner,'definer',p.prosecdef,'config',p.proconfig) order by p.oid::regprocedure::text)
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','crm_security') and p.proname in
 ('lifecycle_hold','crm_reconcile_external_deliveries','crm_get_external_delivery','crm_prepare_external_delivery','crm_begin_external_attempt','crm_retry_external_delivery'))=
 (select data from public.h3_upgrade_snapshot where k='acl'),'owners/ACLs/definer/search paths unchanged');
select pg_temp.ok((select active=false from cron.job where jobname='crm-lifecycle-primary'),'scheduler remains disabled');
create temp table equal_delivery as select d.* from public.crm_external_deliveries d join public.crm_submission_attribution a on a.submission_id=d.attribution_submission_id
 where a.external_submission_id='886801' and d.event_kind='intake';
select pg_temp.ok((select crm_security.lifecycle_hold(d)='provider_time_not_after_source' from public.crm_external_deliveries d where id=(select id from equal_delivery)),'pre-104 frozen equality held');
select pg_temp.denied(format('select public.crm_get_external_delivery(%L,%L)',id,lease_token)) from equal_delivery;
select pg_temp.denied(format('select public.crm_prepare_external_delivery(%L,%L,%L::jsonb)',id,lease_token,payload)) from equal_delivery;
select pg_temp.denied(format('select public.crm_begin_external_attempt(%L,%L)',id,lease_token)) from equal_delivery;
select pg_temp.ok((select crm_security.lifecycle_hold(d)='unattempted_predecessor' from public.crm_external_deliveries d where lead_id=(select lead_id from equal_delivery) and event_kind='qualified'),'existing successor remains held');
-- Waiting / ordinary lease recovery cannot fix a frozen source-second equality.
update public.crm_external_deliveries set lease_until=now()-interval '1 second' where id=(select id from equal_delivery);
select public.crm_claim_external_deliveries(3,true);
select pg_temp.ok((select status='blocked' and last_error_code='provider_time_not_after_source' and attempt_count=0 and attempt_boundary_state='not_started'
 from public.crm_external_deliveries where id=(select id from equal_delivery)),'expired prepared lease returns to timestamp hold with zero attempts');
set local request.jwt.claim.role='authenticated';set local request.jwt.claim.sub='8c000000-0000-0000-0000-000000000001';
select pg_temp.denied(format('select public.crm_retry_external_delivery(%L)',id),'22023') from equal_delivery;
set local request.jwt.claim.role='service_role';set local request.jwt.claim.sub='';
select public.crm_begin_external_attempt(d.id,d.lease_token) from public.crm_external_deliveries d join public.crm_submission_attribution a on a.submission_id=d.attribution_submission_id
 where a.external_submission_id='886802' and d.event_kind='intake';
select pg_temp.ok((select count(*)=1 from public.crm_external_delivery_attempts),'only genuinely +1s prepared payload crosses begin');
rollback;
\echo PASS stateful 103 to 104 prepared equality rejection, valid begin, retry/predecessor and inventory/ACL preservation
