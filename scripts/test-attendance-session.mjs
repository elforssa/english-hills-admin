import assert from 'node:assert/strict';
import { createAttendanceSessionManager, NOT_RECORDED } from '../src/lib/attendanceSession.mjs';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };
const requests = [];
const writes = [];
const manager = createAttendanceSessionManager({
  loadSession(group, date) {
    const pending = deferred(); requests.push({ group, date, ...pending });
    return pending.promise;
  },
  loadHistory: async (group) => [{ session_date: '2026-09-01', group_id: group }],
  saveRow(student, group, date, status) {
    const pending = deferred(); writes.push({ student, group, date, status, ...pending });
    return pending.promise;
  },
});

const a = manager.select('group-a', '2026-09-17');
await tick();
assert.equal(manager.getState().phase, 'loading');
assert.deepEqual(await manager.save('group-a', '2026-09-17', [{ id: 'student-a' }]), { skipped: true });
const b = manager.select('group-b', '2026-09-18');
await tick();
requests[0].resolve([{ student_id: 'student-a', status: 'Absent' }]);
await a;
assert.equal(manager.getState().key, 'group-b|2026-09-18');
assert.deepEqual(manager.getState().statuses, {});
requests[1].reject(new Error('slow failure'));
await b;
assert.equal(manager.getState().phase, 'error');
assert.deepEqual(await manager.save('group-b', '2026-09-18', [{ id: 'student-b' }]), { skipped: true });

const retry = manager.select('group-b', '2026-09-18');
await tick();
requests[2].resolve([{ student_id: 'student-b', status: 'Présent' }]);
await retry;
assert.equal(manager.getState().phase, 'ready');
assert.equal(manager.setStatus('group-a', '2026-09-17', 'student-a', 'Absent'), false);
assert.equal(manager.setStatus('group-b', '2026-09-18', 'student-b', 'Retard'), true);

const save = manager.save('group-b', '2026-09-18', [{ id: 'student-b' }]);
await tick();
assert.equal(writes[0].status, 'Retard');
assert.equal(manager.getState().saving, true);
const c = manager.select('group-c', '2026-09-19');
await tick();
requests[3].resolve([{ student_id: 'student-c', status: 'Justifié' }]);
await c;
writes[0].resolve();
await tick();
assert.equal(requests[4].group, 'group-b');
requests[4].resolve([{ student_id: 'student-b', status: 'Retard' }]);
await save;
assert.equal(manager.getState().key, 'group-c|2026-09-19');
assert.deepEqual(manager.getState().statuses, { 'student-c': 'Justifié' });
assert.equal(manager.getState().saving, false);

const d = manager.select('group-d', '2026-09-20');
await tick();
const e = manager.select('group-e', '2026-09-21');
await tick();
requests[6].resolve([]);
await e;
requests[5].resolve([{ student_id: 'student-d', status: 'Absent' }]);
await d;
assert.equal(manager.getState().key, 'group-e|2026-09-21');
assert.deepEqual(manager.getState().statuses, {});

console.log('PASS attendance session slow load, failure/retry, rapid switch and save-refresh isolation');

// RWR-r5 §6.3 (141): untouched rows are « Non saisi » and are never sent; « Tous présents »
// marks only those; « Enregistrer » sends only the changed rows; a refused row keeps its mark.
{
  assert.equal(NOT_RECORDED, 'Non saisi');
  const sent = [];
  let stored = [{ student_id: 's1', status: 'Absent' }];
  const m = createAttendanceSessionManager({
    loadSession: async () => stored,
    loadHistory: async () => [],
    saveRow: async (student, group, date, status, options) => {
      sent.push({ student, status, override: !!options?.overrideClosed });
      if (student === 's4') throw Object.assign(new Error('closed'), { code: '22023', hint: 'attendance.closed_date' });
      stored = [...stored.filter(r => r.student_id !== student), { student_id: student, status }];
    },
  });
  const roster = [{ id: 's1' }, { id: 's2' }, { id: 's3' }];
  await m.select('g', '2026-11-30');
  assert.deepEqual(m.getState().statuses, { s1: 'Absent' }, 's2 and s3 are « Non saisi »');
  assert.deepEqual(m.pending(roster), [], 'nothing to save on load');
  assert.deepEqual(await m.save('g', '2026-11-30', roster), { skipped: true, empty: true }, 'an untouched roll call writes nothing');
  assert.deepEqual(sent, []);
  assert.equal(m.setStatus('g', '2026-11-30', 's2', 'Retard'), true);
  assert.equal(m.markUnmarked('g', '2026-11-30', roster), 1, '« Tous présents »: only s3');
  assert.deepEqual(m.getState().statuses, { s1: 'Absent', s2: 'Retard', s3: 'Présent' }, 'explicit marks kept');
  assert.deepEqual(m.pending(roster), ['s2', 's3']);
  const result = await m.save('g', '2026-11-30', roster, { overrideClosed: true });
  assert.deepEqual(sent, [{ student: 's2', status: 'Retard', override: true }, { student: 's3', status: 'Présent', override: true }], 's1 unchanged: not sent');
  assert.equal(result.failed, 0);
  assert.deepEqual(m.pending(roster), [], 'saved');
  const four = [...roster, { id: 's4' }];
  m.setStatus('g', '2026-11-30', 's4', 'Présent');
  const refused = await m.save('g', '2026-11-30', four);
  assert.equal(refused.failed, 1);
  assert.equal(refused.errors[0].error.hint, 'attendance.closed_date');
  assert.equal(m.getState().statuses.s4, 'Présent', 'a refused row keeps its mark');
  assert.deepEqual(m.pending(four), ['s4']);
  console.log('PASS attendance session: « Non saisi », « Tous présents », changed rows only, refused rows kept, override passed');
}
