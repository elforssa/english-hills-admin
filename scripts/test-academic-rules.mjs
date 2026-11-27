// RWR-r5 PR C2 (migration 141): the client twins of the academic rules.
//   node scripts/test-academic-rules.mjs
// Class days against the fixture the SQL suite also reads (test-attendance-rules.sql);
// learner-file rules against the trigger's bounds; the level-test helpers.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseClassDays, classDaysText, isoWeekday, meetsOn, initialClassDays, normalizeClassDays } from '../src/lib/academic/classDays.mjs';
import { ageOn, birthDateProblem, categoryFits, isAdultsProgramme, latestBirthDate, programmeAllowsAge } from '../src/lib/academic/learnerRules.mjs';
import { displayStatus, levelsForTest, placementError, studentTestActions, testChanges, testStarts } from '../src/lib/academic/placement.mjs';
import { PROGRAMMES } from '../src/lib/programCatalog.mjs';

// 1. Class days: the shared fixture.
const cases = JSON.parse(readFileSync(new URL('./fixtures/class-days-cases.json', import.meta.url), 'utf8'));
for (const { input, days } of cases) assert.deepEqual(parseClassDays(input), days, `parse ${JSON.stringify(input)}`);
assert.equal(classDaysText([5, 1, 3, 3]), 'Lun, Mer, Ven');
assert.equal(classDaysText([]), '');
assert.deepEqual(normalizeClassDays([]), null);
assert.equal(isoWeekday('2026-11-30'), 1, 'a Monday');
assert.equal(isoWeekday('2026-11-29'), 7, 'a Sunday');
assert.ok(meetsOn({ class_days: [1, 3] }, '2026-12-02'), 'Wednesday');
assert.ok(!meetsOn({ class_days: [1, 3] }, '2026-12-03'), 'Thursday');
assert.ok(meetsOn({ class_days: null, jours: 'Lun' }, '2026-12-03'), 'no class days yet: not restricted, as the server');
assert.deepEqual(initialClassDays({ class_days: null, jours: 'Mardi et Jeudi' }), [2, 4], 'the form starts from what « jours » reads as');
assert.deepEqual(initialClassDays({ class_days: null, jours: 'Lun-Ven' }), [], 'unreadable text: nothing ticked');
console.log(`PASS class days: ${cases.length} fixture cases, text, weekdays, meets on`);

// 2. Learner files.
assert.equal(birthDateProblem('2026-11-27', '2026-11-26'), 'student.birth_date_future');
assert.equal(birthDateProblem('2026-11-26', '2026-11-26'), 'student.birth_date_too_recent', 'today is too recent');
assert.equal(birthDateProblem('2025-11-27', '2026-11-26'), 'student.birth_date_too_recent');
assert.equal(birthDateProblem('2025-11-26', '2026-11-26'), null, 'exactly a year ago');
assert.equal(latestBirthDate('2028-02-29'), '2027-02-28', 'as date - interval 1 year');
assert.equal(birthDateProblem('', '2026-11-26'), null);
assert.equal(ageOn('2017-11-27', '2026-11-26'), 8);
assert.equal(ageOn('2017-11-26', '2026-11-26'), 9);
assert.ok(!categoryFits('Adults (18+)', 'Yearly') && !categoryFits('Teens (13-17)', 'Adults') && !categoryFits('Corporate', 'Communication Junior'));
assert.ok(categoryFits('Young Learners (6-12)', 'Yearly') && categoryFits('Teens (13-17)', 'Yearly') && categoryFits('Corporate', 'Adults') && categoryFits('Young Learners (6-12)', 'Other'));
assert.ok(categoryFits('', 'Yearly') && categoryFits('Adults (18+)', ''), 'an empty side fits');
assert.deepEqual(PROGRAMMES.filter(p => isAdultsProgramme(p.code)).map(p => p.code), ['Adults', 'Communication Adult']);
assert.ok(!programmeAllowsAge('Adults', 15) && programmeAllowsAge('Adults', 18) && !programmeAllowsAge('Yearly', 18) && programmeAllowsAge('One-to-One', 40) && programmeAllowsAge('Yearly', null));
console.log('PASS learner files: birth date bounds, age, category vs programme, adults programmes');

// 3. Level tests.
const at = iso => new Date(iso);
const planned = { status: 'Planifié', date_test: '2026-12-01', heure: '10:00' };
assert.equal(testStarts(planned).toISOString(), '2026-12-01T10:00:00.000Z', 'UTC+0 centre clock');
assert.equal(testStarts({ date_test: '2026-12-01', heure: null }).toISOString(), '2026-12-01T00:00:00.000Z', 'no time: midnight, as the server');
assert.equal(displayStatus(planned, at('2026-12-01T09:59:00Z')), 'Planifié');
assert.equal(displayStatus(planned, at('2026-12-01T10:00:00Z')), 'Passé', '« Passé » is derived');
assert.equal(displayStatus({ ...planned, status: 'Absent' }, at('2026-12-02T00:00:00Z')), 'Absent');
assert.deepEqual(studentTestActions(planned, at('2026-11-30T12:00:00Z')), { move: true, cancel: true, absent: false, result: false }, 'before the test: move or cancel');
assert.deepEqual(studentTestActions(planned, at('2026-12-01T10:05:00Z')), { move: false, cancel: true, absent: true, result: true }, 'after the start');
assert.deepEqual(studentTestActions({ ...planned, status: 'Résultat saisi' }, at('2026-12-02T00:00:00Z')), { move: false, cancel: false, absent: false, result: true }, 'a result can be corrected');
assert.deepEqual(studentTestActions({ ...planned, status: 'Annulé' }, at('2026-12-02T00:00:00Z')), { move: false, cancel: false, absent: false, result: false }, 'cancelled: book a new one');
assert.ok(levelsForTest('Yearly', 9).includes('Child 1') && !levelsForTest('Yearly', 9).includes('A1'));
assert.deepEqual(levelsForTest('Adults', 15), [], 'an adults programme offers nothing to a 15-year-old');
assert.deepEqual(levelsForTest('Adults', 15, 'Beginning 1'), ['Beginning 1'], 'an old value stays shown');
assert.deepEqual(testChanges({ heure: '10:00', score: null, notes: 'a' }, { heure: '11:00', score: '', notes: 'a ' }), { heure: '11:00' });
assert.deepEqual(testChanges({ status: 'Planifié' }, { status: 'Annulé', cancel_reason: ' Famille absente ' }), { status: 'Annulé', cancel_reason: 'Famille absente' });
assert.deepEqual(testChanges({ status: 'Planifié', score: null }, { status: 'Résultat saisi', score: '42', niveau_recommande: 'Child 2' }), { status: 'Résultat saisi', score: 42, niveau_recommande: 'Child 2' });
assert.equal(placementError({ code: '22023', hint: 'placement.already_planned' }), 'Un test est déjà planifié pour cette personne : ouvrez-le pour le déplacer.');
assert.equal(placementError({ code: 'PT409' }), 'Ce test a été modifié entre-temps. Rechargez puis réessayez.');
assert.equal(placementError({ code: '22023', message: 'Valid test edit required' }), 'Enregistrement impossible. Réessayez.', 'no English server text on screen');
console.log('PASS level tests: start time, derived « Passé », actions, levels by programme and age, changes, messages');
