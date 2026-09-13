import { chmodSync, readFileSync, writeFileSync } from 'node:fs';

const [input, output, mode] = process.argv.slice(2);
if (!input || !output) throw new Error('Usage: node scripts/to-management-query.mjs input.sql output.sql');

let sql = readFileSync(input, 'utf8');
sql = sql.replace(/^begin;\n+/, '').replace(/\ncommit;\n?$/, '\n');

const functionMatch = sql.match(/create or replace function pg_temp\.sync_norm[\s\S]*?\n\$\$;\n/);
if (!functionMatch) throw new Error('Temporary normalization function not found');
sql = sql.replace(functionMatch[0], () => `execute $fn$${functionMatch[0]}$fn$;\n`);

sql = sql.replace(/do \$\$\ndeclare\n  ambiguous_count integer;\n  match_count integer;\n  other_count integer;\n  existing_marker_count integer;\nbegin\n/, '');
sql = sql.replace(/end \$\$;\n\nupdate public\.students s set/, 'update public.students s set');
sql = sql.replace(/do \$\$ begin\n  if \(select count\(\*\) from payment_tracking_resolved\) <> 54 then\n    raise exception 'Expected 54 resolved students, found %', \(select count\(\*\) from payment_tracking_resolved\);\n  end if;\nend \$\$;/, `if (select count(*) from payment_tracking_resolved) <> 54 then
    raise exception 'Expected 54 resolved students, found %', (select count(*) from payment_tracking_resolved);
  end if;`);
sql = sql.replace(/do \$\$ begin\n  if \(select count\(\*\) from public\.receipts r where r\.observation like 'payment-tracking-2026:%'\) <> 54 then\n    raise exception 'Expected 54 imported receipts';\n  end if;\nend \$\$;/, `if (select count(*) from public.receipts r where r.observation like 'payment-tracking-2026:%') <> 54 then
    raise exception 'Expected 54 imported receipts';
  end if;`);

sql = sql.replace(/select\n  \(select count\(\*\) from payment_tracking_matches\) as matched_students,[\s\S]*?as imported_paid;\n/, `select count(*) into final_other from public.students where deleted_at is null and session_type = 'Other';
select count(*) into final_mise from public.students where deleted_at is null and session_type = 'Mise à niveau';
select count(*), sum(montant_paye) into final_receipts, final_paid from public.receipts where observation like 'payment-tracking-2026:%';
raise notice 'PAYMENT_SYNC_COMPLETE matched=9 new=45 other=% mise_a_niveau=% receipts=% paid=%', final_other, final_mise, final_receipts, final_paid;
`);

if (mode === '--diagnostic') {
  sql = `${sql.slice(0, sql.indexOf('  if (select count(*) from payment_tracking_stage'))}
select string_agg(m.external_key || '=>' || s.full_name, ',' order by m.external_key) into diagnostic_keys
from payment_tracking_matches m join public.students s on s.id = m.student_id;
raise exception 'DIAGNOSTIC matches=% other=% keys=%', match_count, other_count, diagnostic_keys;
`;
}

const wrapped = `do $batch$
declare
  ambiguous_count integer;
  match_count integer;
  other_count integer;
  existing_marker_count integer;
  final_other integer;
  final_mise integer;
  final_receipts integer;
  final_paid numeric;
  diagnostic_keys text;
begin
${sql}
end
$batch$;
`;

writeFileSync(output, wrapped, { mode: 0o600, flag: 'wx' });
chmodSync(output, 0o600);
console.log(JSON.stringify({ output }));
