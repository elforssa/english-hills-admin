import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { workCalendarFixture } from './lib/crm-work-calendar-fixture.mjs';
const directory=process.env.O3_WORK_EVIDENCE_DIR || join(tmpdir(),'hills-o3-work-evidence');mkdirSync(directory,{recursive:true});
const plans=process.argv.includes('--plans');
const sql=input=>{ const response=spawnSync(plans?'docker':'psql',plans?['exec','-i','supabase_db_hills-admin-next','psql','-X','-qAt','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1']:['-X','-qAt','-h','127.0.0.1','-p','54322','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input,encoding:'utf8',env:{...process.env,PGPASSWORD:'postgres'},maxBuffer:50*1024*1024});if(response.status!==0)throw Object.assign(new Error(response.stderr),response);return response.stdout+(plans ? response.stderr : '');};
let source=workCalendarFixture();
if(plans) {
 source="load 'auto_explain';set role postgres;\n"+source+`
reset role;set auto_explain.log_min_duration=0;set auto_explain.log_analyze=on;set auto_explain.log_buffers=on;set auto_explain.log_nested_statements=on;set client_min_messages=log;set role postgres;
explain (analyze,buffers) select public.crm_get_work_queue(p_assignee_mode=>'all');
explain (analyze,buffers) select public.crm_get_work_queue(p_bucket=>'overdue');
explain (analyze,buffers) select public.crm_get_admissions_calendar((now() at time zone 'Africa/Casablanca')::date,(now() at time zone 'Africa/Casablanca')::date+7);
rollback;`;
} else {
 if(process.argv.includes('--performance'))source+=`
set local statement_timeout='5min';
create temp table timings(kind text,n int,ms numeric);
do $$ declare v text;i int;started timestamptz;r jsonb;c jsonb;day date:=(now() at time zone 'Africa/Casablanca')::date;begin
 for v in select unnest(array['overdue','today','tomorrow','upcoming','all_staff','owner_and_assignee','unassigned','work_cursor','calendar','placement','completed','visits','calendar_cursor','max_range']) loop
  for i in 0..20 loop
   started:=clock_timestamp();
   if v in ('overdue','today','tomorrow','upcoming') then r:=public.crm_get_work_queue(p_bucket=>v);
   elsif v='all_staff' then r:=public.crm_get_work_queue(p_assignee_mode=>'all');
   elsif v='owner_and_assignee' then r:=public.crm_get_work_queue(p_owner_mode=>'me');
   elsif v='unassigned' then r:=public.crm_get_work_queue(p_assignee_mode=>'unassigned');
   elsif v='work_cursor' then c:=public.crm_get_work_queue()->'next_cursor';r:=public.crm_get_work_queue(p_cursor=>c);
   elsif v='calendar' then r:=public.crm_get_admissions_calendar(day,day+7);
   elsif v='placement' then r:=public.crm_get_admissions_calendar(day,day+7,p_kind=>'placement');
   elsif v='completed' then r:=public.crm_get_admissions_calendar(day,day+7,p_include_completed=>true);
   elsif v='visits' then r:=public.crm_get_admissions_calendar(day,day+7,p_kind=>'center_visit');
   elsif v='calendar_cursor' then c:=public.crm_get_admissions_calendar(day,day+7)->'next_cursor';r:=public.crm_get_admissions_calendar(day,day+7,p_cursor=>c);
   else r:=public.crm_get_admissions_calendar(day,day+42);end if;
   insert into timings values(v,i,extract(epoch from clock_timestamp()-started)*1000);
  end loop;
 end loop;
end $$;
select jsonb_agg(to_jsonb(x)) from (select kind,min(ms) filter(where n=0) first_sample_ms,percentile_cont(.95) within group(order by ms) filter(where n>0) warm_p95_ms,max(ms) max_ms from timings group by kind order by kind)x;
select pg_temp.ok((select max(ms)<2000 from timings),'no read >2s');
select pg_temp.ok((select max(p95)<=500 from (select percentile_cont(.95) within group(order by ms) p95 from timings where n>0 group by kind)x),'warm p95 <=500ms');
set local statement_timeout='45s';`;
 source+=readFileSync('scripts/test-crm-work-calendar.sql','utf8');
}
try {const output=sql(source);writeFileSync(join(directory,plans?'plans.log':'acceptance.log'),output);console.log(output.trim());}
catch(error){writeFileSync(join(directory,plans?'plans.log':'acceptance.log'),`${error.stdout || ''}\n${error.stderr || ''}`);throw error;}
assert.equal(sql("select count(*) from public.crm_leads where learner_name like 'O3 learner %'").trim(),'0');
console.log('PASS rollback-only Batch-2 SQL, no persisted synthetic fixture');
