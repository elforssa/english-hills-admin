// Batch H (plan AFU-r1, H7, decision D-TZ = A): one centre clock at UTC+0, never a
// time-zone table. Runs itself again under two machine zones to prove the result
// does not depend on the zone of the browser or server.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  CENTRE_UTC_OFFSET_MINUTES, centreDate, centreDateTimeInput, centreFormatter, centreInstant, centreMonth,
  centreMonthStart, centreParts, centreSchoolYear, formatCentre,
} from '../src/lib/centreClock.mjs';
import { businessMonthStart, localBusinessDate } from '../src/lib/receiptFinance.js';
import { currentSchoolYear } from '../src/lib/enrollmentWorkflow.mjs';
import { casablancaInstant, dateLabel } from '../src/lib/crm/presentation.mjs';
import { casablancaNowInput, casablancaToday } from '../src/lib/crm/enrollmentActions.mjs';
import { enrollmentSchoolYear } from '../src/lib/crm/enrollment.mjs';

assert.equal(CENTRE_UTC_OFFSET_MINUTES, 0, 'Morocco is UTC+0 since 2026-09-20');
const at = iso => new Date(iso);

// Day boundaries at midnight UTC, never 23:00.
assert.equal(centreDate(at('2026-10-29T22:59:00Z')), '2026-10-29');
assert.equal(centreDate(at('2026-10-29T23:30:00Z')), '2026-10-29', '23:30 is still today (UTC+1 tz data said tomorrow)');
assert.equal(centreDate(at('2026-10-30T00:00:00Z')), '2026-10-30');
assert.equal(centreDate(at('2026-12-31T23:30:00Z')), '2026-12-31', 'receipt year: still 2026');
assert.equal(centreMonth(at('2026-10-31T23:30:00Z')), '2026-10', 'dashboard month: still October');
assert.equal(centreMonthStart(at('2026-11-01T00:00:00Z')), '2026-11-01');
assert.deepEqual(centreParts(at('2026-10-29T09:05:00Z')), { year: 2026, month: 10, day: 29, hour: 9, minute: 5 });
assert.equal(centreDateTimeInput(at('2026-10-29T09:05:59Z')), '2026-10-29T09:05');

// School year: 1 September to 31 August.
assert.equal(centreSchoolYear(at('2026-08-31T23:30:00Z')), '2025/2026');
assert.equal(centreSchoolYear(at('2026-09-01T00:00:00Z')), '2026/2027');
assert.equal(centreSchoolYear(at('2027-05-15T12:00:00Z')), '2026/2027');
assert.equal(centreSchoolYear(at('2027-07-10T12:00:00Z')), '2026/2027', 'a July Summer Camp belongs to the ending year');

// An invalid date throws, as the former Intl helpers did.
for (const bad of [new Date('invalid'), 'not a date', NaN]) {
  assert.throws(() => centreDate(bad), RangeError);assert.throws(() => centreSchoolYear(bad), RangeError);
  assert.throws(() => formatCentre(bad, 'fr-FR'), RangeError);
}
assert.throws(() => localBusinessDate(new Date('invalid')), RangeError);

// Wall clock to instant and back: 10:00 on the centre clock is 10:00Z.
assert.equal(centreInstant('2026-10-29T10:00'), '2026-10-29T10:00:00.000Z');
assert.equal(centreInstant('2026-12-31T23:30'), '2026-12-31T23:30:00.000Z');
assert.throws(() => centreInstant('2026-02-30T10:00'), /heure locale n’existe pas/);
assert.throws(() => centreInstant('2026-10-29 10:00'), /Choisissez une date et une heure/);
assert.equal(formatCentre('2026-10-29T23:30:00Z', 'fr-FR', { hour: '2-digit', minute: '2-digit' }), '23:30');
assert.equal(formatCentre('2026-10-29T23:30:00Z', 'fr-FR'), '29/10/2026');
assert.equal(centreFormatter('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format('2026-10-29T23:30:00Z'), '2026-10-29');

// Every client helper agrees with the clock.
assert.equal(localBusinessDate(at('2026-12-31T23:30:00Z')), '2026-12-31');
assert.equal(businessMonthStart(at('2026-10-31T23:30:00Z')), '2026-10-01');
assert.equal(currentSchoolYear(at('2026-08-31T23:30:00Z')), '2025/2026');
assert.equal(enrollmentSchoolYear(at('2026-08-31T23:30:00Z')), '2025/2026');
assert.equal(casablancaToday(at('2026-10-29T23:30:00Z')), '2026-10-29');
assert.equal(casablancaNowInput(at('2026-10-29T23:30:00Z')), '2026-10-29T23:30');
assert.equal(casablancaInstant('2026-10-29T10:00'), '2026-10-29T10:00:00.000Z');
assert.match(dateLabel('2026-10-29T23:30:00Z'), /29 .*23:30/);

// No client code consults a time-zone table for Casablanca. Allowed: the Meta ad
// account's own time zone (Insights configuration and the attribution day).
const ALLOWED = new Set(['src/components/crm/MarketingInsightsPanels.jsx', 'src/lib/crm/intakeAdmin.mjs']);
const files = dir => readdirSync(dir).flatMap(name => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? files(path) : [path];
});
const offenders = files('src').filter(path => /\.(m?js|jsx)$/.test(path) && !ALLOWED.has(path)
  && readFileSync(path, 'utf8').includes('Africa/Casablanca'));
assert.deepEqual(offenders, [], 'Africa/Casablanca outside the Meta account time zone');

// The database mirror names this module, and this module names the database mirror.
const migration = readFileSync('supabase/migrations/125_audit_follow_ups.sql', 'utf8');
assert.match(migration, /create function public\.centre_utc_offset\(\) returns interval[\s\S]*?select interval '0 hours'/);
assert.match(migration, /CENTRE_UTC_OFFSET_MINUTES in\s*\n?-- src\/lib\/centreClock\.mjs/);
assert.match(readFileSync('src/lib/centreClock.mjs', 'utf8'), /public\.centre_utc_offset\(\)/);

if (!process.env.CENTRE_CLOCK_CHILD) {
  for (const zone of ['Asia/Shanghai', 'America/New_York']) {
    execFileSync(process.execPath, [process.argv[1]], { stdio: 'inherit', env: { ...process.env, TZ: zone, CENTRE_CLOCK_CHILD: zone } });
  }
}
console.log(`PASS centre clock (UTC+0, no time-zone table)${process.env.CENTRE_CLOCK_CHILD ? ` under TZ=${process.env.CENTRE_CLOCK_CHILD}` : ''}`);
