// Explicitly local, synthetic and rollback-only. Never reads Production credentials.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const args = ['-X','-qAt','-h','127.0.0.1','-p',process.argv.includes('--replay') ? '55322' : '54322','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'];
const sql = input => execFileSync(process.argv.includes('--plans') ? 'docker' : 'psql',process.argv.includes('--plans') ? ['exec','-i',process.argv.includes('--replay') ? 'supabase_db_hills-o3-replay' : 'supabase_db_hills-admin-next','psql','-X','-qAt','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1'] : args,{input,encoding:'utf8',env:{...process.env,PGPASSWORD:'postgres'},maxBuffer:50*1024*1024,stdio:['pipe','pipe','inherit']});
const directory = process.env.O3_EVIDENCE_DIR || '/tmp/o3-evidence'; mkdirSync(directory,{recursive:true});
const files = process.argv.includes('--regressions') ? ['test-crm-phase4.sql','test-crm-phase5.sql','test-crm-phase6.sql','test-crm-phase7.sql','test-crm-opportunities.sql'] : ['test-crm-opportunities.sql'];
for (const file of files) {
 let input = readFileSync(`scripts/${file}`,'utf8');
 if(process.argv.includes('--plans')) { input="load 'auto_explain';set role postgres;\n"+input.slice(0,input.indexOf('do $$ declare r jsonb;'))+`
set local statement_timeout='60s';
reset role;set auto_explain.log_min_duration=5;set auto_explain.log_analyze=on;set auto_explain.log_buffers=on;set auto_explain.log_nested_statements=on;set client_min_messages=log;set role postgres;
explain (analyze,buffers) select public.crm_get_opportunities();
explain (analyze,buffers) select public.crm_get_opportunities(p_view=>'attention');
explain (analyze,buffers) select public.crm_get_opportunities(p_view=>'no_response');
explain (analyze,buffers) select public.crm_get_opportunities(p_layout=>'list',p_query=>'O3 learner 99',p_owner_mode=>'unassigned',p_program_kind=>'interest',p_program=>'English');
explain (analyze,buffers) select public.crm_get_opportunity_filter_options('source');
explain (analyze,buffers) select public.crm_get_timeline((select lead from fixture where i=1));
reset role;set auto_explain.log_min_duration=0;set role postgres;
explain (analyze,buffers) select crm_security.opportunity_card((select lead from fixture where i=1));
rollback;
`; }
 if (file === 'test-crm-opportunities.sql' && process.argv.includes('--performance')) {
  const perf = `
-- The aggregate benchmark contains hundreds of reads; each read retains its measured 2s/500ms gates.
set local statement_timeout='5min';
set local request.jwt.claim.sub='a3000000-0000-0000-0000-000000000003';
create temp table timings(kind text,n int,ms numeric);
do $$ declare v text; i int; started timestamptz; r jsonb; c jsonb; begin
 for v in select unnest(array['all','mine','new_today','attention','follow_up_today','placement','qualified','no_response','closed']) loop
  for i in 0..20 loop
   started:=clock_timestamp();r:=public.crm_get_opportunities(p_view=>v,p_layout=>case when v='closed' then 'list' else 'board' end);
   insert into timings values(v,i,extract(epoch from clock_timestamp()-started)*1000);
  end loop;
 end loop;
 c:=public.crm_get_opportunities()->'pages'->'NEW'->'next_cursor';
 for v in select unnest(array['list','search','intersection','source','column_cursor']) loop
  for i in 0..20 loop
   started:=clock_timestamp();
   if v='list' then r:=public.crm_get_opportunities(p_layout=>'list');
   elsif v='search' then r:=public.crm_get_opportunities(p_query=>'O3 learner 99');
   elsif v='intersection' then r:=public.crm_get_opportunities(p_layout=>'list',p_query=>'O3 learner 99',p_owner_mode=>'unassigned',p_program_kind=>'unspecified');
   elsif v='source' then r:=public.crm_get_opportunities(p_channel=>'website',p_source_label=>'O3 first 1');
   else r:=public.crm_get_opportunities(p_stage=>'NEW',p_cursor=>c);end if;
   insert into timings values(v,i,extract(epoch from clock_timestamp()-started)*1000);
  end loop;
 end loop;
 for v in select unnest(array['facet','program_facet','acquisition','timeline']) loop
  for i in 0..20 loop
   started:=clock_timestamp();
   if v='facet' then r:=public.crm_get_opportunity_filter_options('source');
   elsif v='program_facet' then r:=public.crm_get_opportunity_filter_options('program');
   elsif v='acquisition' then r:=public.crm_get_operational_acquisition_summary((select lead from fixture f where f.i=1));
   else r:=public.crm_get_timeline((select lead from fixture f where f.i=1)); end if;
   insert into timings values(v,i,extract(epoch from clock_timestamp()-started)*1000);
  end loop;
 end loop;
end $$;
select jsonb_agg(to_jsonb(x)) from (select kind,min(ms) filter(where n=0) first_sample_ms,percentile_cont(.95) within group(order by ms) filter(where n>0) warm_p95_ms,max(ms) max_ms from timings group by kind order by kind)x;
select pg_temp.ok((select max(ms)<2000 from timings),'no read above 2 seconds');
select pg_temp.ok((select max(p95)<=500 from (select percentile_cont(.95) within group(order by ms) p95 from timings where n>0 group by kind)x),'warm p95 <=500ms');
set local statement_timeout='45s';
`;
  input = input.replace('do $$ declare r jsonb;',() => perf+'\ndo $$ declare r jsonb;');
 }
 try { writeFileSync(`${directory}/${file}.log`,sql(input)); console.log(`PASS ${file}`); }
 catch(e) { writeFileSync(`${directory}/${file}.log`,`${e.stdout || ''}\n${e.stderr || ''}`); throw e; }
}
assert.equal(sql("select count(*) from public.crm_leads where learner_name like 'O3 learner %';").trim(),'0');
console.log('PASS no persisted O3 fixtures');
