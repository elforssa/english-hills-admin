import { createClient } from '@supabase/supabase-js';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadSource, parseCsv, prepareSources, reconcile, receiptPayload, studentPayload } from './lib/payment-tracking-sync.mjs';

class SyncError extends Error {}

function parseArgs(argv) {
  const options = { apply: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply-production') options.apply = true;
    else if (arg.startsWith('--')) options[arg.slice(2)] = argv[++i];
    else throw new SyncError(`Unexpected argument: ${arg}`);
  }
  for (const key of ['annual', 'mise-a-niveau', 'report-dir']) {
    if (!options[key]) throw new SyncError(`Missing --${key}`);
  }
  if (!options['students-export'] && !options['confirm-project']) throw new SyncError('Missing --confirm-project');
  if (options.apply && options['students-export']) throw new SyncError('An exported snapshot can only be used for a dry run');
  if (options.apply && options['confirm-write'] !== 'APPLY_PAYMENT_TRACKING_2026') {
    throw new SyncError('Production writes require --confirm-write APPLY_PAYMENT_TRACKING_2026');
  }
  return options;
}

function studentsFromExport(path) {
  return parseCsv(readFileSync(path, 'utf8')).map((row, index) => ({
    id: `export-row-${index + 2}`,
    full_name: row.Nom,
    telephone: row['Téléphone'] || null,
    age_category: row['Catégorie'] || null,
    session_type: row.Session || null,
    status: row.Statut || null,
    notes: null,
    deleted_at: null,
  }));
}

function loadEnvFile(path) {
  if (!path) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[match[1]] = value.replace(/\\n/g, '\n');
  }
}

function openClient(options) {
  loadEnvFile(options['env-file']);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new SyncError('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  const host = new URL(url).hostname;
  const project = host.split('.')[0];
  if (project !== options['confirm-project']) throw new SyncError(`Project confirmation mismatch (${project})`);
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function allRows(client, table, columns) {
  const output = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await client.from(table).select(columns).range(from, from + 499).order('id');
    if (error) throw new SyncError(`Could not read ${table}: ${error.message}`);
    output.push(...data);
    if (data.length < 500) return output;
  }
}

function summaryOf(plan, prepared) {
  const receiptCandidates = [...plan.matches, ...plan.newStudents].filter(item => item.child.payment);
  return {
    sourceRows: {
      annual: prepared.children.filter(child => child.source === 'annual').length,
      miseANiveau: prepared.children.filter(child => child.source === 'mise-a-niveau').length,
    },
    matchedStudents: plan.matches.length,
    newStudents: plan.newStudents.length,
    ambiguousStudents: plan.ambiguous.length,
    proposedMoveFromYearlyToOther: plan.moveToOther.length,
    proposedReceipts: receiptCandidates.filter(item => !item.receiptExists).length,
    existingReceiptsSkipped: receiptCandidates.filter(item => item.receiptExists).length,
    sourceIssues: plan.sourceIssues.length,
  };
}

function safePlan(plan) {
  return {
    matches: plan.matches.map(({ child, student, receiptExists }) => ({ child, student, receiptExists })),
    newStudents: plan.newStudents,
    ambiguous: plan.ambiguous,
    moveToOther: plan.moveToOther,
    sourceIssues: plan.sourceIssues,
  };
}

async function applyPlan(client, plan) {
  if (plan.ambiguous.length || plan.sourceIssues.length) {
    throw new SyncError('Apply blocked: resolve every ambiguous match and source issue first');
  }
  const journal = { createdStudents: [], createdReceipts: [], updatedStudents: [] };
  const resolved = [];
  try {
    for (const item of plan.matches) {
      const patch = { session_type: item.child.sessionType };
      if (!item.student.telephone && item.child.phone) patch.telephone = item.child.phone;
      if (!item.student.age_category && item.child.ageCategory) patch.age_category = item.child.ageCategory;
      const sourceNote = item.child.notes;
      if (!String(item.student.notes || '').includes(`Source: ${item.child.sourceLabel}, row ${item.child.sourceRow}`)) {
        patch.notes = [item.student.notes, sourceNote].filter(Boolean).join('\n');
      }
      journal.updatedStudents.push({ id: item.student.id, before: item.student });
      const { data, error } = await client.from('students').update(patch).eq('id', item.student.id).select().single();
      if (error) throw error;
      resolved.push({ ...item, student: data });
    }
    for (const item of plan.newStudents) {
      const { data, error } = await client.from('students').insert(studentPayload(item.child)).select().single();
      if (error) throw error;
      journal.createdStudents.push(data.id);
      resolved.push({ ...item, student: data, receiptExists: false });
    }
    for (const student of plan.moveToOther) {
      journal.updatedStudents.push({ id: student.id, before: student });
      const { error } = await client.from('students').update({ session_type: 'Other' }).eq('id', student.id);
      if (error) throw error;
    }
    for (const item of resolved) {
      if (!item.child.payment || item.receiptExists) continue;
      const { data, error } = await client.from('receipts').insert(receiptPayload(item.child, item.student.id)).select().single();
      if (error) throw error;
      journal.createdReceipts.push(data.id);
    }
    return journal;
  } catch (error) {
    for (const id of journal.createdReceipts.reverse()) await client.from('receipts').delete().eq('id', id);
    for (const { id, before } of journal.updatedStudents.reverse()) {
      const { created_at, updated_at, id: ignored, ...restore } = before;
      await client.from('students').update(restore).eq('id', id);
    }
    for (const id of journal.createdStudents.reverse()) await client.from('students').delete().eq('id', id);
    throw new SyncError(`Apply failed and rollback was attempted: ${error.message}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const reportDir = resolve(options['report-dir']);
  if (existsSync(reportDir)) throw new SyncError('Report directory must not already exist');
  const client = options['students-export'] ? null : openClient(options);
  const sources = [
    loadSource(resolve(options.annual), 'annual', 'Annual payment tracking 2026', 'Yearly'),
    loadSource(resolve(options['mise-a-niveau']), 'mise-a-niveau', 'Mise à niveau payment tracking 2026', 'Mise à niveau'),
  ];
  const prepared = prepareSources(sources);
  const [students, receipts] = options['students-export']
    ? [studentsFromExport(resolve(options['students-export'])), []]
    : await Promise.all([
      allRows(client, 'students', 'id,full_name,telephone,age_category,session_type,status,notes,deleted_at,created_at,updated_at'),
      allRows(client, 'receipts', 'id,observation'),
    ]);
  const plan = reconcile(prepared, students, receipts);
  const summary = summaryOf(plan, prepared);
  mkdirSync(reportDir, { mode: 0o700 });
  writeFileSync(`${reportDir}/summary.json`, `${JSON.stringify(summary, null, 2)}\n`, { mode: 0o600 });
  writeFileSync(`${reportDir}/reconciliation-private.json`, `${JSON.stringify(safePlan(plan), null, 2)}\n`, { mode: 0o600 });
  chmodSync(reportDir, 0o700);
  let journal = null;
  if (options.apply) {
    journal = await applyPlan(client, plan);
    writeFileSync(`${reportDir}/apply-journal-private.json`, `${JSON.stringify(journal, null, 2)}\n`, { mode: 0o600 });
  }
  console.log(JSON.stringify({ mode: options.apply ? 'applied' : 'dry-run', summary, reportDir }));
}

main().catch(error => {
  console.error(error instanceof SyncError ? error.message : 'Unexpected sync failure; sensitive details suppressed');
  process.exitCode = 1;
});
