// Batch H (plan AFU-r1): pure rules and source contracts for H1–H6 and H8 that need
// no browser. The browser suites check the rendered pills and labels.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { PILL_CLASS, PILL_SELECT_CLASS } from '../src/lib/ui/pill.mjs';
import { DOSSIER_LABELS, displayLabel } from '../src/lib/ui/presentation.mjs';
import { fileAwaitsGroup, groupMemberIds, schoolYearOfGroup, studentNeedsGroup } from '../src/lib/enrollmentWorkflow.mjs';
import { EGC_REASON_TEXT, membershipErrorMessage } from '../src/lib/academic/membershipActions.mjs';

const read = path => readFileSync(path, 'utf8');

// H2: one pill shape, never wrapped.
for (const token of ['inline-block', 'whitespace-nowrap', 'rounded-full', 'px-2', 'py-1', 'text-xs', 'font-medium']) {
  assert.ok(PILL_CLASS.split(' ').includes(token), token);
}
for (const token of ['rounded-full', 'whitespace-nowrap', 'text-xs']) assert.ok(PILL_SELECT_CLASS.split(' ').includes(token), token);
const pill = read('src/components/operational/ProgrammePill.jsx');
assert.match(pill, /SESSION_TYPE_COLORS\[sessionType\]/, 'same programme colours');
assert.match(pill, /<Link data-touch-target href=\{href\} title=\{title\}/, 'the touch target wraps the pill');
const students = read('src/app/(admin)/students/page.jsx');
assert.match(students, /<ProgrammePill sessionType=\{s\.session_type\}\s+href=\{canEditProgramme \? studentHref\(s\.id\) : undefined\}\s+title=\{canEditProgramme \? 'Le programme suit le groupe : modifiez l’inscription' : undefined\} \/>/);
assert.match(students, /base=\{PILL_SELECT_CLASS\}/, 'the editable select is a pill');
assert.doesNotMatch(students, /max-w-28 break-words/, 'the status pill no longer wraps');
for (const page of ['students/[id]', 'enrollments', 'groups', 'groups/[id]']) {
  assert.match(read(`src/app/(admin)/${page}/page.jsx`), /<ProgrammePill /, page);
}

// H3: « Inscrit » only.
assert.equal(displayLabel(DOSSIER_LABELS, 'Enrolled'), 'Inscrit');
assert.equal(displayLabel(DOSSIER_LABELS, 'Trial'), 'Essai (dossier)');
assert.doesNotMatch(read('src/app/(admin)/helpdesk/GuideContent.jsx'), /Inscrit \(dossier\)/);

// H4: « Groupe à affecter » only for an active file; the same rule as the filter.
const file = (status, groupe_id = null) => ({ id: 's', status, groupe_id, session_type: 'Yearly' });
for (const status of ['Alumni', 'Inactive', 'Prospect']) {
  assert.equal(fileAwaitsGroup(file(status)), false, status);
  assert.equal(studentNeedsGroup(file(status), []), false, `${status}: the filter agrees`);
}
for (const status of ['Enrolled', 'Trial']) {
  assert.equal(fileAwaitsGroup(file(status)), true, status);
  assert.equal(studentNeedsGroup(file(status), []), true, `${status}: the filter agrees`);
}
assert.equal(fileAwaitsGroup(file('Enrolled', 'g')), false, 'a placed file awaits nothing');
assert.equal((students.match(/fileAwaitsGroup\(student\)/g) || []).length, 2, 'both Groupe column branches');

// H5: a group's year as an enrollment year; refusals in French.
assert.equal(schoolYearOfGroup({ annee: '2026-2027' }), '2026/2027');
assert.equal(schoolYearOfGroup({ annee: ' 2026/2027 ' }), '2026/2027');
assert.equal(schoolYearOfGroup({ annee: '2026' }), '');
assert.equal(schoolYearOfGroup(null), '');
const mismatch = 'L’année scolaire de l’inscription (2025/2026) ne correspond pas à celle du groupe (2026/2027).';
assert.equal(membershipErrorMessage({ code: '23514', hint: 'egc.school_year_mismatch', message: mismatch }), mismatch);
assert.equal(membershipErrorMessage({ code: '23514', hint: 'egc.school_year_mismatch', message: 'x' }), EGC_REASON_TEXT.school_year_mismatch);
assert.equal(membershipErrorMessage({ code: '23514', hint: 'egc.group_year_missing' }), 'Renseignez l’année scolaire du groupe.');
assert.equal(membershipErrorMessage({ code: '23514', hint: 'egc.group_year_locked' }), 'Réaffectez les apprenants avant de changer l’année scolaire du groupe.');
assert.equal(membershipErrorMessage({ code: '22023', hint: 'egc.group_year_invalid' }), 'Année scolaire du groupe invalide : utilisez le format 2026-2027.');
const migration = read('supabase/migrations/125_audit_follow_ups.sql');
for (const text of ['Renseignez l’année scolaire du groupe.', 'Réaffectez les apprenants avant de changer l’année scolaire du groupe.',
  'Année scolaire du groupe invalide : utilisez le format 2026-2027.', 'L’année scolaire de l’inscription (%) ne correspond pas à celle du groupe (%).']) {
  assert.ok(migration.includes(text), text);
}
const groups = read('src/app/(admin)/groups/page.jsx');
assert.match(groups, /id="group-school-year" required/, 'the group form shows the year, required');
assert.match(groups, /annee: groupYear\(form\.school_year\.trim\(\)\) \|\| null/);
assert.match(read('src/components/students/EnrollmentModal.jsx'), /school_year: schoolYearOfGroup\(group\)/);
assert.match(read('src/components/crm/CrmEnrollmentDialog.jsx'), /year: schoolYearOfGroup\(g\)/);

// H1: no cap anywhere on the client.
assert.doesNotMatch(read('src/lib/financeCorrections.mjs'), /RECEPTION_DISCOUNT_CAP|Remise supérieure/);

// H6: the instrumentation hook is where Next.js reads it with src/, and the configs keep scrubbing.
assert.ok(existsSync('src/instrumentation.js') && !existsSync('instrumentation.js'), 'src/instrumentation.js only');
const hook = read('src/instrumentation.js');
assert.match(hook, /import\('\.\.\/sentry\.server\.config'\)/);
assert.match(hook, /import\('\.\.\/sentry\.edge\.config'\)/);
assert.match(hook, /captureRequestError as onRequestError/);
for (const config of ['sentry.server.config.js', 'sentry.edge.config.js', 'sentry.client.config.js']) {
  const text = read(config);
  assert.match(text, /sendDefaultPii: false/, config);
  assert.match(text, /beforeSend: scrubEvent/, config);
  assert.match(text, /beforeBreadcrumb: scrubBreadcrumb/, config);
  assert.match(text, /enabled: Boolean\(/, `${config}: inert without a DSN`);
  assert.doesNotMatch(text, /replayIntegration|tracesSampleRate: [1-9]/, `${config}: no Replay, no tracing`);
}

// H8: enrollment-only roster.
assert.equal(groupMemberIds([{ id: 's', groupe_id: 'g' }], [], 'g').size, 0);
assert.deepEqual([...groupMemberIds([{ id: 's' }], [{ student_id: 's', group_id: 'g', status: 'Trial' }], 'g')], ['s']);

console.log('PASS audit follow-ups: pills, Inscrit, Groupe column, group year, no cap, Sentry hook, roster');
