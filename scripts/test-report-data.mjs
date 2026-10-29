// Reports (plan SCG-r1, REL-3 and REL-6): the chart days are the database's
// Casablanca days verbatim, whatever the browser time zone; and the academic
// report gives the same result from its reduced reads as from whole tables.
import assert from 'node:assert/strict';
import {
  ACADEMIC_ENROLLMENT_STATUSES, academicOperationsData, attendanceSeries, attendanceTotals, isAcademicSourceStudent, loadAcademicSources,
  reportYears,
} from '../src/lib/reportData.mjs';

// Day keys are copied, never recomputed: identical under any TZ the process runs in.
const rows = [
  { day: '2026-10-27', status: 'Présent', n: 3 }, { day: '2026-10-27', status: 'Absent', n: 1 },
  { day: '2026-10-27', status: 'Retard', n: 0 }, { day: '2026-10-27', status: 'Justifié', n: 2 },
  { day: '2026-10-28', status: 'Présent', n: 5 }, { day: '2026-10-28', status: 'Absent', n: 0 },
  { day: '2026-10-28', status: 'Retard', n: 1 }, { day: '2026-10-28', status: 'Justifié', n: 0 },
];
for (const tz of ['UTC', 'Africa/Casablanca', 'Asia/Shanghai', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
  process.env.TZ = tz;
  const series = attendanceSeries([...rows].reverse());
  assert.deepEqual(series.map(r => r.date), ['2026-10-27', '2026-10-28'], tz);
  assert.deepEqual(series[1], { date: '2026-10-28', 'Présent': 5, Absent: 0, Retard: 1, 'Justifié': 0 });
  assert.deepEqual(attendanceTotals(series), { 'Présent': 8, Absent: 1, Retard: 1, 'Justifié': 2, total: 12, rate: 83 });
}
assert.deepEqual(attendanceTotals([]), { 'Présent': 0, Absent: 0, Retard: 0, 'Justifié': 0, total: 0, rate: 0 });
assert.doesNotMatch(attendanceSeries.toString() + attendanceTotals.toString(), /new Date|toISOString|getTimezoneOffset|setHours/);
assert.deepEqual(reportYears([{ year: 2026, is_current: true }, { year: 2025, is_current: false }, { year: 2024, is_current: false }]),
  { years: ['2026', '2025', '2024'], current: '2026' });
assert.deepEqual(reportYears(undefined), { years: [], current: '' });

// Academic operations: random schools; the reduced read set equals the whole set.
let seed = 7;
const rand = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
const pick = list => list[rand(list.length)];
const SESSIONS = ['Yearly', 'Adults', 'Summer Camp', null];
const STUDENT_STATUSES = ['Prospect', 'Enrolled', 'Trial', 'Inactive', 'Alumni'];
const ENROLLMENT_STATUSES = ['Submitted', 'Under Review', 'Confirmed', 'Validated', 'Rejected', 'Trial', 'Ended'];
for (let school = 0; school < 200; school += 1) {
  const teachers = Array.from({ length: 4 }, (_, i) => ({ id: `t${i}`, full_name: `Teacher ${i}` }));
  const groups = Array.from({ length: 6 }, (_, i) => ({ id: `g${i}`, name: `G${i}`, niveau: 'A1', session_type: pick(SESSIONS),
    teacher_id: rand(4) ? pick(teachers).id : null, capacite_max: rand(12) }));
  const students = Array.from({ length: 40 }, (_, i) => ({ id: `s${String(i).padStart(2, '0')}`, full_name: `Learner ${i}`,
    status: pick(STUDENT_STATUSES), session_type: pick(SESSIONS), groupe_id: rand(3) ? null : pick(groups).id }));
  const enrollments = Array.from({ length: 50 }, (_, i) => {
    const status = pick(ENROLLMENT_STATUSES);
    return { id: `e${i}`, student_id: pick(students).id, status, session_type: pick(SESSIONS), school_year: '2026/2027',
      group_id: ['Validated', 'Trial'].includes(status) || rand(2) ? pick(groups).id : null };
  });
  const live = enrollments.filter(e => ACADEMIC_ENROLLMENT_STATUSES.includes(e.status));
  const liveIds = new Set(live.map(e => e.student_id));
  const groupIds = new Set(groups.map(g => g.id));
  const subset = students.filter(s => isAcademicSourceStudent(s, liveIds, groupIds));
  // The page's loader, against an entities-like reader over the same rows: every
  // read carries a filter, id lists stay small, and the result is the reduced set.
  const calls = [];
  const byName = (a, b) => (a.full_name < b.full_name ? -1 : a.full_name > b.full_name ? 1 : a.id < b.id ? -1 : 1);
  const reader = rows => ({ filterAll: async (criteria, orderBy) => {
    calls.push({ criteria, orderBy });
    const out = rows.filter(r => Object.entries(criteria).every(([k, v]) => (Array.isArray(v) ? v.includes(r[k]) : r[k] === v)));
    return orderBy === 'full_name' ? out.sort(byName) : out;
  } });
  const loaded = await loadAcademicSources({ Enrollment: reader(enrollments), Student: reader(students) }, groups, 7);
  assert.ok(calls.every(c => Object.keys(c.criteria).length === 1 && Object.values(c.criteria).every(v => Array.isArray(v) && v.length <= 7)),
    'every read is filtered, id lists chunked');
  assert.deepEqual(new Set(loaded.students.map(s => s.id)), new Set(subset.map(s => s.id)));
  assert.deepEqual(new Set(loaded.enrollments.map(e => e.id)), new Set(live.map(e => e.id)));
  for (const sessionFilter of ['', 'Yearly', 'Adults', 'Summer Camp']) {
    const full = academicOperationsData({ students, teachers, groups, enrollments, sessionFilter, sessionTypes: ['Yearly', 'Adults', 'Summer Camp'] });
    const reduced = academicOperationsData({ students: subset, teachers, groups, enrollments: live, sessionFilter, sessionTypes: ['Yearly', 'Adults', 'Summer Camp'] });
    assert.deepEqual(reduced, full, `school ${school}, session ${sessionFilter || 'all'}`);
    // Before this change the page read every learner in name order; the loader keeps
    // active learners in that order.
    const page = academicOperationsData({ students: [...students].sort(byName), teachers, groups, enrollments, sessionFilter,
      sessionTypes: ['Yearly', 'Adults', 'Summer Camp'] });
    const fromLoader = academicOperationsData({ students: loaded.students, teachers, groups, enrollments: loaded.enrollments, sessionFilter,
      sessionTypes: ['Yearly', 'Adults', 'Summer Camp'] });
    assert.deepEqual(fromLoader, page, `loader: school ${school}, session ${sessionFilter || 'all'}`);
  }
}
console.log('PASS report days verbatim under five time zones; academic report identical from the page loader’s reduced reads (200 random schools x 4 sessions)');
