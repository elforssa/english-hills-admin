-- Read-only operator health inspection. Contains no secret values or customer rows.
-- Running against production still requires the normal access/approval process.
begin isolation level repeatable read read only;
select current_database() as database_name;
select min(version) as first_migration,max(version) as latest_migration,count(*) as migration_count from supabase_migrations.schema_migrations;
select c.relname as table_name,c.relrowsecurity as rls_enabled from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='r' and c.relname like 'crm_%' order by c.relname;
select c.relname as table_name,t.tgname,t.tgenabled from pg_trigger t join pg_class c on c.oid=t.tgrelid where not t.tgisinternal and c.relnamespace='public'::regnamespace and (c.relname like 'crm_%' or c.relname in ('profiles','pending_roles','placement_tests','enrollments','receipts','charges','financial_events')) order by c.relname,t.tgname;
select provider,enabled,count(*) as connections from crm_integration_connections group by provider,enabled order by provider,enabled;
select status,count(*) as jobs,min(created_at) as oldest_created from crm_ingestion_jobs group by status order by status;
select status,count(*) as deliveries,min(created_at) as oldest_created from crm_external_deliveries group by status order by status;
select status,count(*) as insight_runs,max(completed_at) as latest_completed from crm_meta_sync_runs group by status order by status;
select count(*) as conversion_reviews from crm_leads where conversion_review_required;
select count(*) as enabled_lifecycle_configs from crm_integration_connections where coalesce((lifecycle_settings->>'enabled')::boolean,false);
select count(*) as enabled_insights_configs from crm_integration_connections where coalesce((insights_settings->>'enabled')::boolean,false);
select name,count(*) as configured_count from vault.secrets where name in ('crm_meta_worker_url','crm_meta_worker_token') group by name;
rollback;
