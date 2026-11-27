// Keeps an attendance draft bound to the exact group/date that loaded it.
// Each selection gets a generation number so late loads and post-save
// refreshes cannot write into a later selection's draft.
// RWR-r5 §6.3 (141): a learner without a saved or chosen status is « Non saisi »
// (statuses has no entry); « Tous présents » marks only those; « Enregistrer » sends
// only the rows whose status differs from the saved one.
export const NOT_RECORDED = 'Non saisi';
const savedStatuses = (rows) => Object.fromEntries(rows.map((row) => [row.student_id, row.status]));

export function createAttendanceSessionManager({ loadSession, loadHistory, saveRow }) {
  let generation = 0;
  let state = {
    key: '', group: '', date: '', phase: 'idle', attendance: [], statuses: {}, saved: {},
    history: [], historyPhase: 'idle', saving: false,
  };
  const listeners = new Set();
  const emit = (patch) => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener(state);
  };
  const current = (version, key) => generation === version && state.key === key;
  const keyFor = (group, date) => group && date ? `${group}|${date}` : '';

  async function select(group, date) {
    const key = keyFor(group, date);
    const version = ++generation;
    emit({ key, group, date, phase: key ? 'loading' : 'idle', attendance: [], statuses: {}, saved: {},
      history: [], historyPhase: key ? 'loading' : 'idle', saving: false });
    if (!key) return;
    const sessionRequest = Promise.resolve().then(() => loadSession(group, date))
      .then((rows) => {
        if (!current(version, key)) return;
        emit({ attendance: rows, statuses: savedStatuses(rows), saved: savedStatuses(rows), phase: 'ready' });
      })
      .catch(() => {
        if (current(version, key)) emit({ attendance: [], statuses: {}, saved: {}, phase: 'error' });
      });
    const historyRequest = Promise.resolve().then(() => loadHistory(group))
      .then((rows) => {
        if (!current(version, key)) return;
        const byDate = {};
        rows.forEach((row) => { (byDate[row.session_date] ??= []).push(row); });
        emit({ history: Object.entries(byDate).sort((a, b) => b[0].localeCompare(a[0])), historyPhase: 'ready' });
      })
      .catch(() => {
        if (current(version, key)) emit({ history: [], historyPhase: 'error' });
      });
    await Promise.all([sessionRequest, historyRequest]);
  }

  function setStatus(group, date, studentId, status) {
    if (state.key !== keyFor(group, date) || state.phase !== 'ready' || state.saving) return false;
    emit({ statuses: { ...state.statuses, [studentId]: status } });
    return true;
  }

  // « Tous présents »: every learner on screen still « Non saisi » becomes « Présent »;
  // an explicit mark is never overwritten.
  function markUnmarked(group, date, students, status = 'Présent') {
    if (state.key !== keyFor(group, date) || state.phase !== 'ready' || state.saving) return 0;
    const next = { ...state.statuses };
    let marked = 0;
    for (const { id } of students) if (!next[id]) { next[id] = status; marked += 1; }
    if (marked) emit({ statuses: next });
    return marked;
  }

  // The rows « Enregistrer » would send: marked, and different from the saved status.
  function pending(students) {
    return students.map((student) => student.id).filter((id) => state.statuses[id] && state.statuses[id] !== state.saved[id]);
  }

  async function save(group, date, students, options = {}) {
    const key = keyFor(group, date);
    if (!key || state.key !== key || state.phase !== 'ready' || state.saving || !students.length) {
      return { skipped: true };
    }
    const studentIds = pending(students);
    if (!studentIds.length) return { skipped: true, empty: true };
    const version = generation;
    const statuses = { ...state.statuses };
    emit({ saving: true });
    let failed = 0;
    const errors = [];
    for (const studentId of studentIds) {
      try { await saveRow(studentId, group, date, statuses[studentId], options); }
      catch (error) { failed += 1; errors.push({ studentId, error }); }
    }
    let refreshFailed = false;
    try {
      const rows = await loadSession(group, date);
      if (current(version, key)) {
        // A refused row keeps its unsaved mark on screen, so it can be corrected.
        const kept = Object.fromEntries(errors.map(({ studentId }) => [studentId, statuses[studentId]]));
        emit({ attendance: rows, statuses: { ...savedStatuses(rows), ...kept }, saved: savedStatuses(rows), phase: 'ready', saving: false });
      }
    } catch {
      refreshFailed = true;
      if (current(version, key)) emit({ attendance: [], statuses: {}, saved: {}, phase: 'error', saving: false });
    }
    return { failed, total: studentIds.length, refreshFailed, group, date, errors };
  }

  return {
    getState: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    select, setStatus, markUnmarked, pending, save,
  };
}
