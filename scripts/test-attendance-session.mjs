import assert from 'node:assert/strict';
import { createAttendanceSessionManager } from '../src/lib/attendanceSession.mjs';

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
