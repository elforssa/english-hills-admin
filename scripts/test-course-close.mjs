// Courses with dates — close a finished course (plan CDC-r3, migration 128): the shared
// course rules, the French texts (kept equal to the server's), the director commands'
// wrappers, the result toasts, the closed-course exclusions in every picker, the
// director-only dashboard call, cache invalidation, and the R0 count query embedded in
// scripts/test-course-dates-close.sql (equal to supabase/manual/course_close_r0_counts.sql).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  COURSE_DATE_PROGRAMMES, COURSE_PLACEMENT_DATES_TEXT, COURSE_REASON_TEXT, GROUP_VIEWS, UNPLACED_CHOICES,
  allUnplacedChosen, capacityAfterProgrammeChange, closeCourse, closeCourseMessage, closeCoursePreview, closeSchoolYearPreview, courseDatesError,
  courseDatesLabel, courseDatesRequired, courseEndedSuffix, courseErrorMessage, courseFinished, courseReason, courseWindow,
  coursesToCloseCount, fetchClosedOnlineGroupIds, formatCourseDate, isClosedCourse, listCoursesToClose, oneToOneGroupName,
  effectiveUnplacedChoices, openCourses, programmeBreakdown, reopenCourse, reopenCourseMessage, unplacedChoicesFor, unplacedLists,
  yearCloseHasWork,
} from '../src/lib/academic/courseClose.mjs';
import {
  CLOSED_GROUP_HISTORY_MESSAGE, GROUP_HISTORY_MESSAGE, groupDeleteErrorMessage, membershipErrorMessage,
} from '../src/lib/academic/membershipActions.mjs';
import { PROGRAMMES_WITHOUT_GROUPS, programmeUsesGroups } from '../src/lib/programCatalog.mjs';
import { LEARNER_KEYS } from '../src/lib/cacheInvalidation.mjs';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const migration = await read('supabase/migrations/128_course_dates_close.sql');

// ── Programmes (Q1 = A, OA5) ──────────────────────────────────────────────────
assert.deepEqual(COURSE_DATE_PROGRAMMES, ['Mise à niveau', 'Adults', 'Summer Camp', 'One-to-One']);
assert.match(migration, /p_session in \('Mise à niveau', 'Adults', 'Summer Camp', 'One-to-One'\)/, 'the client list equals the server list');
for (const programme of COURSE_DATE_PROGRAMMES) assert.equal(courseDatesRequired(programme), true, programme);
for (const programme of ['Yearly', 'Other', 'Communication Junior', 'Communication Adult', 'Online', 'Online One-to-One', '', null]) {
  assert.equal(courseDatesRequired(programme), false, String(programme));
}
assert.deepEqual(PROGRAMMES_WITHOUT_GROUPS, ['Other']);
assert.equal(programmeUsesGroups('Other'), false);
assert.equal(programmeUsesGroups(''), false);
for (const programme of ['Yearly', 'Mise à niveau', 'Online', 'Online One-to-One', 'Summer Camp']) assert.equal(programmeUsesGroups(programme), true);

// ── Dates and their window (D1, Q3 = A) ───────────────────────────────────────
assert.deepEqual(courseWindow('2026/2027'), { from: '2026-06-01', to: '2027-08-31' });
assert.equal(courseWindow('2026-2027'), null, 'only a school year in the canonical form');
assert.equal(courseWindow(''), null);
const ok = { sessionType: 'Mise à niveau', schoolYear: '2026/2027', dateDebut: '2026-10-01', dateFin: '2026-12-20' };
assert.equal(courseDatesError(ok), '');
assert.equal(courseDatesError({ ...ok, dateDebut: '2026-06-01', dateFin: '2027-08-31' }), '', 'the bounds are inside');
assert.equal(courseDatesError({ ...ok, dateFin: '' }), COURSE_REASON_TEXT.dates_required);
assert.equal(courseDatesError({ ...ok, dateDebut: '' }), COURSE_REASON_TEXT.dates_required);
assert.equal(courseDatesError({ ...ok, dateDebut: '2026-05-31' }),
  'Les dates du cours doivent être comprises dans l’année scolaire du groupe (du 1er juin 2026 au 31 août 2027).');
assert.equal(courseDatesError({ ...ok, dateFin: '2027-09-01' }),
  'Les dates du cours doivent être comprises dans l’année scolaire du groupe (du 1er juin 2026 au 31 août 2027).');
assert.match(migration, /Les dates du cours doivent être comprises dans l’année scolaire du groupe \(du 1er juin % au 31 août %\)\./,
  'the form says what the server says');
assert.equal(courseDatesError({ ...ok, dateDebut: '2026-12-21' }), 'La date de fin doit suivre la date de début.');
assert.equal(courseDatesError({ sessionType: 'Yearly', schoolYear: '2026/2027', dateDebut: '', dateFin: '' }), '', 'Yearly may stay undated');
// Never stricter than the database: an optional programme may carry one date.
assert.equal(courseDatesError({ sessionType: 'Yearly', schoolYear: '2026/2027', dateDebut: '2026-09-01', dateFin: '' }), '',
  'Yearly may carry its start date alone');
assert.equal(courseDatesError({ sessionType: 'Yearly', schoolYear: '2026/2027', dateDebut: '', dateFin: '2027-06-30' }), '',
  'Yearly may carry its end date alone');
assert.equal(courseDatesError({ sessionType: 'Yearly', schoolYear: '2026/2027', dateDebut: '', dateFin: '2027-09-01' }),
  'Les dates du cours doivent être comprises dans l’année scolaire du groupe (du 1er juin 2026 au 31 août 2027).');
// Editing: like the database, an undated short-programme group (closed, or created
// before 128) can change its name or teacher without dates; a date or programme change
// re-checks them, and only a date or year change re-checks the window.
const saved = { sessionType: 'Mise à niveau', schoolYear: '2026/2027', dateDebut: '', dateFin: '' };
assert.equal(courseDatesError({ ...saved, previous: saved }), '', 'an unchanged undated group saves');
assert.equal(courseDatesError({ ...saved, dateDebut: '2026-10-01', previous: saved }), COURSE_REASON_TEXT.dates_required);
assert.equal(courseDatesError({ ...saved, sessionType: 'Adults', previous: saved }), COURSE_REASON_TEXT.dates_required);
assert.equal(courseDatesError({ ...saved, sessionType: 'Yearly', previous: saved }), '');
assert.equal(courseDatesError({ sessionType: 'Yearly', schoolYear: '2026/2027', dateDebut: '', dateFin: '',
  previous: { ...saved, sessionType: 'Yearly' } }), '');
const dated = { ...ok, previous: { ...ok } };
assert.equal(courseDatesError({ ...dated, schoolYear: '2027/2028' }),
  'Les dates du cours doivent être comprises dans l’année scolaire du groupe (du 1er juin 2027 au 31 août 2028).', 'a year change re-checks the window');
assert.equal(courseDatesError({ ...dated, dateFin: '' }), COURSE_REASON_TEXT.dates_required, 'a date is never cleared');
// Q4 = A: One-to-One forces capacity 1; leaving it gives a capacity back.
assert.equal(capacityAfterProgrammeChange({ from: 'Mise à niveau', to: 'One-to-One', capacity: 8 }), 1);
assert.equal(capacityAfterProgrammeChange({ from: 'One-to-One', to: 'Mise à niveau', capacity: 1 }), 12, 'a new group gets the default');
assert.equal(capacityAfterProgrammeChange({ from: 'One-to-One', to: 'Yearly', capacity: 1, savedCapacity: 8, savedProgramme: 'Adults' }), 8,
  'an edited group gets its own capacity back');
assert.equal(capacityAfterProgrammeChange({ from: 'One-to-One', to: 'Yearly', capacity: 1, savedCapacity: 1, savedProgramme: 'One-to-One' }), 12);
assert.equal(capacityAfterProgrammeChange({ from: 'Yearly', to: 'Adults', capacity: 9 }), 9);
assert.equal(courseDatesError({ sessionType: 'Online', schoolYear: '2026/2027', dateDebut: '2026-09-01', dateFin: '2026-12-01' }),
  COURSE_REASON_TEXT.online_dates, 'an online course keeps its term on its own page');
assert.equal(courseDatesError({ sessionType: 'Online', schoolYear: '2026/2027' }), '');

assert.equal(formatCourseDate('2026-11-04'), '04/11/2026');
assert.equal(formatCourseDate('2026-11-04T00:00:00Z'), '04/11/2026');
assert.equal(formatCourseDate(null), '');
assert.equal(courseDatesLabel({ date_debut: '2026-10-06', date_fin: '2026-11-04' }), 'Du 06/10/2026 au 04/11/2026');
assert.equal(courseDatesLabel({ date_debut: null, date_fin: null }), '');
assert.equal(courseDatesLabel(null), '');

// Q4 = A, OA3: a neutral One-to-One name, never the learner's.
assert.equal(oneToOneGroupName('B1', '2026-11-10'), 'Cours individuel · B1 · 10/11/2026');
assert.equal(oneToOneGroupName('', ''), 'Cours individuel');

// ── Closed and finished courses (D4) ──────────────────────────────────────────
const closedOnline = new Set(['o2']);
const groups = [
  { id: 'g1', session_type: 'Mise à niveau', closed_at: null, date_fin: '2026-11-04' },
  { id: 'g2', session_type: 'Mise à niveau', closed_at: '2026-11-05T10:00:00Z', date_fin: '2026-11-01' },
  { id: 'o1', session_type: 'Online', closed_at: null },
  { id: 'o2', session_type: 'Online', closed_at: null },
  { id: 'y1', session_type: 'Yearly', closed_at: null, date_fin: null },
];
assert.equal(isClosedCourse(groups[1]), true);
assert.equal(isClosedCourse(groups[3], closedOnline), true, 'an online course closed on its page');
assert.equal(isClosedCourse(groups[3]), false, 'without the set the database guard decides');
assert.equal(isClosedCourse({ id: 'o2', session_type: 'Yearly' }, closedOnline), false, 'the online set applies to online groups only');
assert.equal(isClosedCourse(null), false);
assert.deepEqual(openCourses(groups, closedOnline).map(g => g.id), ['g1', 'o1', 'y1']);
assert.deepEqual(openCourses(null), []);
assert.equal(courseFinished(groups[0], '2026-11-05'), true);
assert.equal(courseFinished(groups[0], '2026-11-04'), false, 'the end date itself is still a course day');
assert.equal(courseFinished(groups[1], '2026-11-05'), false, 'a closed course is closed, not finished');
assert.equal(courseFinished(groups[4], '2026-11-05'), false);
assert.equal(courseEndedSuffix(groups[0], '2026-11-05'), ' · terminé le 04/11/2026');
assert.equal(courseEndedSuffix(groups[0], '2026-11-04'), '');

// ── Server refusals → French (course.* hints) ─────────────────────────────────
assert.equal(courseReason('course.closed'), 'closed');
assert.equal(courseReason('course.unknown'), null);
assert.equal(courseReason('egc.capacity'), null);
assert.equal(courseReason(undefined), null);
for (const [hint, text] of Object.entries({
  'course.dates_required': 'Renseignez les dates du cours : date de début et date de fin.',
  'course.mark_protected': 'Utilisez « Clôturer le cours » ou « Rouvrir le cours ».',
  'course.online': 'Clôturez ce cours depuis sa page Cours en ligne.',
  'course.online_dates': 'Les dates d’un cours en ligne se modifient sur sa page Cours en ligne.',
  'course.one_to_one_capacity': 'Un cours individuel (One-to-One) a une capacité de 1.',
  'course.closed': 'Ce cours est clôturé.',
})) {
  assert.equal(courseErrorMessage({ hint, message: 'raw' }), text, hint);
  assert(migration.includes(text), `the server raises the same text for ${hint}`);
}
assert.equal(courseErrorMessage({ hint: 'course.closed', message: 'Ce cours est clôturé. Rouvrez le cours pour le modifier.' }),
  'Ce cours est clôturé. Rouvrez le cours pour le modifier.', 'the frozen-field refusal keeps its own words');
assert(migration.includes('Ce cours est clôturé. Rouvrez le cours pour le modifier.'));
assert.equal(courseErrorMessage({ hint: 'course.dates_required', message: 'Renseignez les dates du cours avant d’y affecter un apprenant.' }),
  COURSE_PLACEMENT_DATES_TEXT);
assert(migration.includes(COURSE_PLACEMENT_DATES_TEXT));
assert.equal(courseErrorMessage({ hint: 'course.not_finished', message: 'Ce cours n’est pas terminé : sa date de fin est le 06/11/2026.' }),
  'Ce cours n’est pas terminé : sa date de fin est le 06/11/2026.');
assert.equal(courseErrorMessage({ hint: 'course.dates_outside_year', message: 'Les dates du cours doivent être comprises dans l’année scolaire du groupe (du 1er juin 2026 au 31 août 2027).' }),
  'Les dates du cours doivent être comprises dans l’année scolaire du groupe (du 1er juin 2026 au 31 août 2027).');
assert.equal(courseErrorMessage({ hint: 'egc.capacity', message: 'Ce groupe est complet.' }), null);
// The membership messages take the course words first, conflicts (PT409) included.
assert.equal(membershipErrorMessage({ code: 'PT409', hint: 'course.count_changed', message: 'x' }), COURSE_REASON_TEXT.count_changed);
assert.equal(membershipErrorMessage({ code: 'PT409', hint: 'course.unplaced_changed', message: 'x' }), COURSE_REASON_TEXT.unplaced_changed);
assert.equal(membershipErrorMessage({ code: '23514', hint: 'course.closed', message: 'Ce cours est clôturé.' }), 'Ce cours est clôturé.');
assert.equal(groupDeleteErrorMessage({ code: '23503' }, { closed_at: '2026-11-05T10:00:00Z' }), CLOSED_GROUP_HISTORY_MESSAGE);
assert.equal(groupDeleteErrorMessage({ code: '23503' }, { closed_at: null }), GROUP_HISTORY_MESSAGE);
assert.equal(groupDeleteErrorMessage({ code: '23503' }), GROUP_HISTORY_MESSAGE);

// ── The close dialog and the result toasts ────────────────────────────────────
assert.deepEqual(UNPLACED_CHOICES.map(c => c.label), ['A suivi ce cours', 'Terminer sans groupe', 'Laisser en attente']);
const unplaced = [{ enrollment_id: 'e1' }, { enrollment_id: 'e2' }, { enrollment_id: 'e3' }];
assert.equal(allUnplacedChosen(unplaced, { e1: 'attach', e2: 'end' }), false, 'Q14 = A: every row needs an explicit choice');
assert.equal(allUnplacedChosen(unplaced, { e1: 'attach', e2: 'end', e3: 'wait' }), true);
assert.equal(allUnplacedChosen([], {}), true);
// Before its end date only an empty course closes: « Laisser en attente » only, already chosen.
assert.deepEqual(unplacedChoicesFor({ finished: true }).map(c => c.value), ['attach', 'end', 'wait']);
assert.deepEqual(unplacedChoicesFor({ finished: false }).map(c => c.value), ['wait']);
assert.deepEqual(unplacedChoicesFor(null).map(c => c.value), ['wait']);
const early = { finished: false, unplaced };
assert.deepEqual(effectiveUnplacedChoices(early, { e1: 'attach', e2: 'end' }), { e1: 'wait', e2: 'wait', e3: 'wait' });
assert.deepEqual(unplacedLists(unplaced, effectiveUnplacedChoices(early, { e1: 'attach' })), { attach: [], end: [] },
  'an early close sends no paid enrollment (course.not_finished otherwise)');
assert.deepEqual(effectiveUnplacedChoices({ finished: true, unplaced }, { e1: 'attach' }), { e1: 'attach' });
assert.match(migration, /if not v_empty and \(g\.date_fin is null or g\.date_fin >= v_today\) then/,
  'the server refuses lists on a course that is not finished');
assert.deepEqual(unplacedLists(unplaced, { e1: 'attach', e2: 'end', e3: 'wait', ghost: 'end' }), { attach: ['e1'], end: ['e2'] },
  'only listed rows are sent; « Laisser en attente » sends nothing');
assert.equal(closeCourseMessage({ total_ended: 4, alumni: 3, charges_linked: 2 }),
  'Cours clôturé : 4 inscriptions terminées, 3 anciens apprenants, 2 soldes rattachés.');
assert.equal(closeCourseMessage({ total_ended: 1, alumni: 0, charges_linked: 0 }), 'Cours clôturé : 1 inscription terminée.');
assert.equal(closeCourseMessage({ total_ended: 0 }), 'Cours clôturé : 0 inscription terminée.');
assert.equal(closeCourseMessage({ replayed: true, total_ended: 4 }), 'Ce cours était déjà clôturé.');
// reopen_course returns the rows it left ended as a list of {enrollment_id, reason}.
assert.equal(reopenCourseMessage({ restored: 5, skipped: [{ enrollment_id: 'e', reason: 'changed' }] }),
  'Cours rouvert : 5 inscriptions rétablies, 1 laissée terminée (modifiée depuis la clôture).');
assert.equal(reopenCourseMessage({ restored: 1, skipped: [] }), 'Cours rouvert : 1 inscription rétablie.');
assert.equal(reopenCourseMessage({ restored: 0, skipped: [{}, {}] }),
  'Cours rouvert : 0 inscription rétablie, 2 laissées terminées (modifiées depuis la clôture).');

// ── The Groups views and the dashboard card (D2, D7, D8) ──────────────────────
assert.deepEqual(GROUP_VIEWS.map(v => v.value), ['en-cours', 'a-cloturer', 'clotures']);
assert.deepEqual(GROUP_VIEWS.map(v => v.label), ['En cours', 'À clôturer', 'Clôturés']);
assert.equal(coursesToCloseCount([
  { kind: 'in_person', live_count: 3 }, { kind: 'in_person', live_count: 0 }, { kind: 'online', live_count: 1 },
]), 2, 'an empty finished course is listed but not counted on the card');
assert.equal(coursesToCloseCount(null), 0);
// « Clôturer l'année »: enabled when it ends enrollments or only marks groups; waiting rows by programme.
assert.equal(yearCloseHasWork({ to_end: 0, groups_to_mark: 2 }), true, 'a close that only marks groups');
assert.equal(yearCloseHasWork({ to_end: 3, groups_to_mark: 0 }), true);
assert.equal(yearCloseHasWork({ to_end: 0, groups_to_mark: 0 }), false);
assert.equal(yearCloseHasWork(null), false);
assert.equal(programmeBreakdown({ 'Summer Camp': 1, 'Mise à niveau': 3, Adults: 0 }), 'Mise à niveau 3, Summer Camp 1');
assert.equal(programmeBreakdown(null), '');

// ── The director commands' wrappers ───────────────────────────────────────────
const calls = [];
const rpcClient = { rpc: (name, params) => { calls.push([name, params]); return Promise.resolve({ data: null, error: null }); } };
await listCoursesToClose(rpcClient);
await closeCoursePreview(rpcClient, 'g1');
await closeCourse(rpcClient, { groupId: 'g1', expectedCount: 2, reason: 'Cours terminé', attach: ['e1'], endUnplaced: ['e2'] });
await closeCourse(rpcClient, { groupId: 'g3', expectedCount: 0, reason: 'Cours terminé' });
await reopenCourse(rpcClient, { groupId: 'g1', closedAt: '2026-11-05T10:00:00Z' });
await closeSchoolYearPreview(rpcClient, '2026/2027');
assert.deepEqual(calls, [
  ['list_courses_to_close', undefined],
  ['close_course_preview', { p_group: 'g1' }],
  ['close_course', { p_group: 'g1', p_expected_count: 2, p_reason: 'Cours terminé', p_attach: ['e1'], p_end_unplaced: ['e2'] }],
  ['close_course', { p_group: 'g3', p_expected_count: 0, p_reason: 'Cours terminé', p_attach: [], p_end_unplaced: [] }],
  ['reopen_course', { p_group: 'g1', p_expected_closed_at: '2026-11-05T10:00:00Z' }],
  ['close_school_year_preview', { p_school_year: '2026/2027' }],
]);
for (const [name] of calls) assert.match(migration, new RegExp(`create function public\\.${name}\\(`), `${name} exists in 128`);

// The closed online courses: staff read them; any other answer is an empty set.
const tableClient = (result) => ({
  from(table) {
    assert.equal(table, 'online_courses');
    return { select(columns) { assert.equal(columns, 'group_id'); return { eq(column, value) {
      assert.deepEqual([column, value], ['status', 'closed']);
      return typeof result === 'function' ? result() : Promise.resolve(result);
    } }; } };
  },
});
assert.deepEqual([...await fetchClosedOnlineGroupIds(tableClient({ data: [{ group_id: 'o2' }, { group_id: 'o3' }], error: null }))], ['o2', 'o3']);
assert.equal((await fetchClosedOnlineGroupIds(tableClient({ data: null, error: { code: '42501' } }))).size, 0);
assert.equal((await fetchClosedOnlineGroupIds(tableClient(() => { throw new Error('offline'); }))).size, 0);

// ── Cache: the closed-online key is refreshed with every learner save ─────────
assert(LEARNER_KEYS.includes('Group'), "['Group', 'closed-online'] is invalidated by the 'Group' prefix");
const queriesSource = await read('src/lib/queries.js');
assert.match(queriesSource, /queryKey: \['Group', 'closed-online'\]/);

// ── Every picker that starts something new leaves closed courses out (D4) ─────
const pickers = {
  'src/components/students/EnrollmentModal.jsx': [/isClosedCourse\(group, closedOnline\)/, /useClosedOnlineGroupIds\(\)/, /courseEndedSuffix\(g\)/],
  'src/components/students/StudentForm.jsx': [/isClosedCourse\(group, closedOnline\)/, /useClosedOnlineGroupIds\(\)/, /courseEndedSuffix\(g\)/],
  'src/components/placement/LegacyPlacementEditor.jsx': [/\.is\('closed_at', ?null\)/, /useClosedOnlineGroupIds\(\)/],
  'src/app/(admin)/attendance/page.jsx': [/isClosedCourse\(g, closedOnline\)/],
  'src/app/(admin)/timetable/page.jsx': [/isClosedCourse\(g, closedOnline\)/],
  'src/app/(admin)/teacher-portal/page.jsx': [/isClosedCourse\(g, closedOnline\)/],
  'src/app/(admin)/assessments/page.jsx': [/isClosedCourse\(g, closedOnline\)/],
  'src/app/(admin)/placement-tests/page.jsx': [/isClosedCourse\(g, closedOnline\)/],
  'src/app/(admin)/communications/page.jsx': [/openCourses\(groups, closedOnline\)/],
  'src/components/crm/CrmEnrollmentDialog.jsx': [/courseEndedSuffix\(g\)/],
  'src/components/receipts/ReceiptForm.jsx': [/courseEndedSuffix\(group\)/],
  'src/lib/receiptGroupChoices.mjs': [/\.is\('closed_at', null\)/, /eq\('status', 'closed'\)/],
  'src/lib/reportData.mjs': [/openCourses\(allGroups, closedOnlineIds\)/],
};
for (const [path, patterns] of Object.entries(pickers)) {
  const source = await read(path);
  for (const pattern of patterns) assert.match(source, pattern, `${path}: ${pattern}`);
}
// The CRM picker reads crm_enrollment_groups, which 128 re-creates without closed courses.
assert.match(migration, /closed_at is null and not exists\(select 1 from public\.online_courses c where c\.group_id=groups\.id and c\.status='closed'\)/);

// ── Director-only calls and the dashboard card rule (D2, OA5) ─────────────────
const dashboard = await read('src/app/(admin)/dashboard/page.jsx');
assert.match(dashboard, /userRole === 'director' \? listCoursesToClose\(/, 'only the director asks for the finished courses');
assert.match(dashboard, /Cours terminés à clôturer/);
assert.match(dashboard, /\.is\('group_id', null\)\.not\('session_type', 'in', `\(\$\{PROGRAMMES_WITHOUT_GROUPS\.map/,
  '« Inscrits — groupe à affecter » counts every programme but Other');
const groupsPage = await read('src/app/(admin)/groups/page.jsx');
assert.match(groupsPage, /CloseCourseDialog/);
assert.match(groupsPage, /Vue des groupes/);
assert.match(groupsPage, /La liste « À clôturer » est réservée à la direction/, '?vue=a-cloturer opened by another role says so');
assert.match(groupsPage, /previous: group \?/, 'the form re-checks dates as the database does');
assert.match(groupsPage, /capacityAfterProgrammeChange\(/);
const studentsPage = await read('src/app/(admin)/students/page.jsx');
assert.match(studentsPage, /disabled=\{saving \|\| !yearCloseHasWork\(preview\)/);
assert.match(studentsPage, /programmeBreakdown\(preview\.kept_waiting_unplaced\?\.by_programme\)/);
const groupPage = await read('src/app/(admin)/groups/[id]/page.jsx');
assert.match(groupPage, /reopenCourseMessage\(data\)/, 'the reopen toast reads the skipped list');
assert.doesNotMatch(groupPage, /Number\(data\?\.skipped/);
assert.match(groupPage, /Anciens apprenants du cours/);
assert.match(groupPage, /const canPlace = canManage && !closed && !onlineClosed;/, 'a closed online course takes no learner (S3)');
assert.match(groupPage, /isClosedCourse\(group, closedOnline\)/);
const dialog = await read('src/components/groups/CloseCourseDialog.jsx');
assert.match(dialog, /closeCourseMessage\(data\)/);
assert.match(dialog, /isRecordConflict\(error\)\) load\(\)/, 'a conflict reloads the preview, never replays the close');
assert.match(dialog, /Rouvrir l’inscription/, 'reviewer point: a next-session deposit names « Rouvrir l’inscription »');
assert.match(dialog, /unplacedChoicesFor\(preview\)/, 'a course before its end date offers « Laisser en attente » only');

// ── The R0 count query: the suite embeds the reviewed file verbatim ───────────
const r0 = await read('supabase/manual/course_close_r0_counts.sql');
const [firstLine, ...r0Body] = r0.split('\n');
assert.equal(firstLine, 'set transaction read only;');
const suite = await read('scripts/test-course-dates-close.sql');
const embedded = /create function pg_temp\.r0\(\) returns table\(category text, n bigint\) language sql as \$r0\$\n([\s\S]*?)\n\$r0\$;/.exec(suite);
assert(embedded, 'the suite defines pg_temp.r0()');
assert.equal(embedded[1], r0Body.join('\n').trimEnd(), 'the embedded R0 query equals supabase/manual/course_close_r0_counts.sql');
assert.match(r0, /T7b3a candidates with a partly paid open unlinked tuition charge without a year, created during the candidate/,
  'reviewer point: the T7b3a line is kept');

console.log('course close: all checks passed');
