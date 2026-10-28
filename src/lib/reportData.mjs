// Report computations (plan SCG-r1, REL-3 and REL-6). The database returns small
// totals; these helpers shape them without any date arithmetic in the browser, so
// a stale browser time-zone table cannot move a Casablanca day.
import {
  ACTIVE_STUDENT_STATUSES, LIVE_ENROLLMENT_STATUSES, groupMemberIds, isPendingPreEnrollment, studentNeedsGroup,
} from './enrollmentWorkflow.mjs';

export const ATTENDANCE_STATUSES = ['Présent', 'Absent', 'Retard', 'Justifié'];

// report_attendance_daily rows (day, status, n) → one chart row per Casablanca day,
// oldest first, with the day key exactly as the database wrote it.
export function attendanceSeries(rows = []) {
  const days = new Map();
  for (const row of rows) {
    const day = String(row.day);
    if (!days.has(day)) days.set(day, { date: day, ...Object.fromEntries(ATTENDANCE_STATUSES.map(s => [s, 0])) });
    if (ATTENDANCE_STATUSES.includes(row.status)) days.get(day)[row.status] = Number(row.n || 0);
  }
  return [...days.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function attendanceTotals(series) {
  const totals = Object.fromEntries(ATTENDANCE_STATUSES.map(s => [s, 0]));
  for (const row of series) for (const s of ATTENDANCE_STATUSES) totals[s] += row[s];
  const total = ATTENDANCE_STATUSES.reduce((sum, s) => sum + totals[s], 0);
  const rate = total > 0 ? Math.round(((totals['Présent'] + totals['Justifié']) / total) * 100) : 0;
  return { ...totals, total, rate };
}

// report_years rows (year, is_current) → newest-first year strings and the current one.
export function reportYears(rows = []) {
  const years = rows.map(r => String(r.year)).filter(y => /^\d{4}$/.test(y));
  return { years, current: String(rows.find(r => r.is_current)?.year ?? years[0] ?? '') };
}

// The academic-operations report needs only these rows (no whole-table read):
// live enrollments, active learners, the learners those enrollments name and the
// learners whose file group is one of the groups. academicOperationsData returns
// the same result from this subset as from every learner and enrollment.
export const ACADEMIC_ENROLLMENT_STATUSES = LIVE_ENROLLMENT_STATUSES;
export function isAcademicSourceStudent(student, liveStudentIds, groupIds) {
  return ACTIVE_STUDENT_STATUSES.includes(student.status) || liveStudentIds.has(student.id)
    || (student.groupe_id != null && groupIds.has(student.groupe_id));
}

const chunks = (values, size) => Array.from({ length: Math.ceil(values.length / size) }, (_, i) => values.slice(i * size, (i + 1) * size));

// Reads only those rows through an entities-like reader (filterAll(criteria, orderBy)):
// live enrollments, active learners (in name order), then the learners the
// enrollments name and those filed in a group, in id lists of at most 100.
export async function loadAcademicSources(entities, groups, chunkSize = 100) {
  const [enrollments, active] = await Promise.all([
    entities.Enrollment.filterAll({ status: ACADEMIC_ENROLLMENT_STATUSES }, '-created_date'),
    entities.Student.filterAll({ status: ACTIVE_STUDENT_STATUSES }, 'full_name'),
  ]);
  const have = new Set(active.map(s => s.id));
  const named = [...new Set(enrollments.map(e => e.student_id).filter(id => id && !have.has(id)))];
  const extra = (await Promise.all([
    ...chunks(named, chunkSize).map(ids => entities.Student.filterAll({ id: ids }, 'full_name')),
    ...chunks(groups.map(g => g.id), chunkSize).map(ids => entities.Student.filterAll({ groupe_id: ids }, 'full_name')),
  ])).flat();
  const liveIds = new Set(enrollments.map(e => e.student_id));
  const groupIds = new Set(groups.map(g => g.id));
  const students = [...active];
  for (const student of extra) {
    if (have.has(student.id) || !isAcademicSourceStudent(student, liveIds, groupIds)) continue;
    have.add(student.id);
    students.push(student);
  }
  return { students, enrollments };
}

export function academicOperationsData({ students, teachers, groups, enrollments, sessionFilter = '', sessionTypes }) {
  const active = new Set(ACTIVE_STUDENT_STATUSES);
  const studentsById = new Map(students.map((student) => [student.id, student]));
  const membersByGroup = new Map(groups.map((group) => [group.id, groupMemberIds(students, enrollments, group.id)]));

  const sessionGroups = groups.filter((group) => !sessionFilter || (group.session_type || 'Yearly') === sessionFilter);
  const activeStudents = students.filter((student) => active.has(student.status));
  const sessionStudents = activeStudents.filter((student) => !sessionFilter || (student.session_type || 'Yearly') === sessionFilter);
  const unassignedGroups = sessionGroups
    .filter((group) => !group.teacher_id)
    .map((group) => ({ id: group.id, label: `${group.name} · ${group.session_type || 'Yearly'} · ${group.niveau}` }));
  const studentsWithoutGroup = activeStudents
    .filter((student) => studentNeedsGroup(student, enrollments, sessionFilter))
    .map((student) => {
      const pending = enrollments.filter(e => e.student_id === student.id && e.status === 'Confirmed' && !e.group_id
        && (!sessionFilter || (e.session_type || student.session_type || 'Yearly') === sessionFilter));
      const sessions = pending.map(e => [e.session_type || student.session_type || 'Yearly', e.school_year].filter(Boolean).join(' · '));
      return { id: student.id, label: `${student.full_name} · ${sessions.length ? sessions.join(' / ') : student.session_type || 'Yearly'}` };
    });
  const enrollmentsToReview = enrollments
    .filter(isPendingPreEnrollment)
    .filter((enrollment) => !sessionFilter || (enrollment.session_type || studentsById.get(enrollment.student_id)?.session_type || 'Yearly') === sessionFilter)
    .map((enrollment) => ({ id: enrollment.id, label: `${studentsById.get(enrollment.student_id)?.full_name || 'Apprenant'} · ${enrollment.status}` }));

  const sessionRows = sessionTypes.map((sessionType) => {
    const rowGroups = groups.filter((group) => (group.session_type || 'Yearly') === sessionType);
    const rowStudents = activeStudents.filter((student) => (student.session_type || 'Yearly') === sessionType);
    const assigned = rowGroups.filter((group) => group.teacher_id).length;
    const capacity = rowGroups.reduce((sum, group) => sum + Number(group.capacite_max || 0), 0);
    const occupied = rowGroups.reduce((sum, group) => sum + (membersByGroup.get(group.id)?.size || 0), 0);
    return { sessionType, groups: rowGroups.length, students: rowStudents.length, assigned, capacity, occupied };
  }).filter((row) => row.groups || row.students);

  const teacherRows = teachers.map((teacher) => {
    const teacherGroups = sessionGroups.filter((group) => group.teacher_id === teacher.id);
    const regularStudents = new Set(teacherGroups.flatMap((group) => [...(membersByGroup.get(group.id) || [])]));
    return { id: teacher.id, name: teacher.full_name, groups: teacherGroups.length, students: regularStudents.size };
  }).filter((row) => row.groups).sort((a, b) => b.students - a.students);

  return {
    sessionGroups, sessionStudents, unassignedGroups, studentsWithoutGroup, enrollmentsToReview,
    sessionRows, teacherRows,
  };
}
