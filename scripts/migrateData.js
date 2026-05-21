#!/usr/bin/env node
// Base44 legacy import — run once for initial data migration.
//
// Usage:
//   node --env-file=.env.local scripts/migrateData.js
//
// Reads ./base44-export/<Entity>.json (one file per entity), maps each record
// to the Supabase schema, and upserts on `id` so the script is safe to re-run.
//
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.
// NEXT_PUBLIC_SUPABASE_URL is accepted as a fallback for the URL.

import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const EXPORT_DIR = join(ROOT, 'base44-export');
const BATCH_SIZE = 500;

// Fallback .env.local loader so the script also works on Node < 20.6
// where `node --env-file=` is unavailable.
function loadEnvLocal() {
  const path = join(ROOT, '.env.local');
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    const [, k, rawV] = m;
    if (process.env[k]) continue;
    const v = rawV.replace(/^['"]|['"]$/g, '');
    process.env[k] = v;
  }
}
loadEnvLocal();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and/or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Foreign-key-respecting insert order.
const ENTITIES = [
  'User',
  'Teacher',
  'Student',
  'Group',
  'Enrollment',
  'Attendance',
  'Assessment',
  'LearningAssessment',
  'PlacementTest',
  'Portfolio',
  'Certificate',
  'Receipt',
  'Payment',
  'Payroll',
  'LeaveRequest',
  'Notification',
  'Message',
  'Announcement',
  'AuthorizedAdult',
  'DismissalLog',
  'AppConfig',
  'PendingRole',
];

// Entity -> Supabase table name. `User` maps to `profiles` (auth-linked);
// the orphan `public.users` table was dropped in migration 007.
const TABLE = {
  User: 'profiles',
  Teacher: 'teachers',
  Student: 'students',
  Group: 'groups',
  Enrollment: 'enrollments',
  Attendance: 'attendance',
  Assessment: 'assessments',
  LearningAssessment: 'learning_assessments',
  PlacementTest: 'placement_tests',
  Portfolio: 'portfolios',
  Certificate: 'certificates',
  Receipt: 'receipts',
  Payment: 'payments',
  Payroll: 'payroll',
  LeaveRequest: 'leave_requests',
  Notification: 'notifications',
  Message: 'messages',
  Announcement: 'announcements',
  AuthorizedAdult: 'authorized_adults',
  DismissalLog: 'dismissal_logs',
  AppConfig: 'app_config',
  PendingRole: 'pending_roles',
};

// Legacy-system internal fields that don't exist in the Supabase schema.
const LEGACY_INTERNAL = new Set([
  'created_by',
  'created_by_id',
  'updated_date',
  'updated_by',
  'updated_by_id',
  'is_sample',
  '_id',
  '__v',
]);

// Per-entity field renames. Portfolio uses the only documented rename pair.
const RENAMES = {
  Portfolio: { titre: 'title', projet_type: 'project_type' },
};

function mapRecord(entity, raw) {
  const renames = RENAMES[entity] || {};
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    if (LEGACY_INTERNAL.has(key)) continue;
    if (key === 'created_date') {
      out.created_at = value;
      continue;
    }
    const mapped = renames[key] || key;
    out[mapped] = value;
  }
  return out;
}

async function migrateEntity(entity) {
  const file = join(EXPORT_DIR, `${entity}.json`);
  if (!existsSync(file)) {
    console.log(`  [skip] ${entity}: ${file} not found`);
    return { entity, inserted: 0, errors: [] };
  }

  let parsed;
  try {
    parsed = JSON.parse(await readFile(file, 'utf8'));
  } catch (err) {
    return { entity, inserted: 0, errors: [`Failed to parse ${file}: ${err.message}`] };
  }

  const records = Array.isArray(parsed) ? parsed : (parsed.records || parsed.data || []);
  if (!Array.isArray(records)) {
    return { entity, inserted: 0, errors: [`Expected an array in ${file}`] };
  }

  const table = TABLE[entity];
  const mapped = records.map((r) => mapRecord(entity, r));

  let inserted = 0;
  const errors = [];
  for (let i = 0; i < mapped.length; i += BATCH_SIZE) {
    const batch = mapped.slice(i, i + BATCH_SIZE);
    const { error, count } = await supabase
      .from(table)
      .upsert(batch, { onConflict: 'id', count: 'exact' });
    if (error) {
      errors.push(`batch ${i}-${i + batch.length - 1}: ${error.message}`);
    } else {
      inserted += count ?? batch.length;
    }
  }
  return { entity, table, inserted, errors };
}

async function main() {
  console.log(`Migrating from ${EXPORT_DIR} to ${SUPABASE_URL}`);
  const summary = [];
  for (const entity of ENTITIES) {
    process.stdout.write(`-> ${entity}... `);
    const result = await migrateEntity(entity);
    summary.push(result);
    if (result.errors.length === 0) {
      console.log(`ok (${result.inserted})`);
    } else {
      console.log(`done with ${result.errors.length} error(s) (${result.inserted} ok)`);
      for (const e of result.errors) console.log(`     - ${e}`);
    }
  }

  console.log('\nSummary:');
  let totalOk = 0;
  let totalErr = 0;
  for (const r of summary) {
    totalOk += r.inserted;
    totalErr += r.errors.length;
    console.log(`  ${r.entity.padEnd(22)} ${String(r.inserted).padStart(6)} upserted  ${r.errors.length} errors`);
  }
  console.log(`\nTotal: ${totalOk} upserted, ${totalErr} errors`);
  process.exit(totalErr > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
