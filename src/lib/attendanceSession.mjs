// Keeps an attendance draft bound to the exact group/date that loaded it.
// Each selection gets a generation number so late loads and post-save
// refreshes cannot write into a later selection's draft.
export function createAttendanceSessionManager({ loadSession, loadHistory, saveRow }) {
  let generation = 0;
  let state = {
    key: '', group: '', date: '', phase: 'idle', attendance: [], statuses: {},
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
    emit({ key, group, date, phase: key ? 'loading' : 'idle', attendance: [], statuses: {},
      history: [], historyPhase: key ? 'loading' : 'idle', saving: false });
    if (!key) return;
    const sessionRequest = Promise.resolve().then(() => loadSession(group, date))
      .then((rows) => {
        if (!current(version, key)) return;
        const statuses = {};
        rows.forEach((row) => { statuses[row.student_id] = row.status; });
        emit({ attendance: rows, statuses, phase: 'ready' });
      })
      .catch(() => {
        if (current(version, key)) emit({ attendance: [], statuses: {}, phase: 'error' });
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

  async function save(group, date, students) {
    const key = keyFor(group, date);
    if (!key || state.key !== key || state.phase !== 'ready' || state.saving || !students.length) {
      return { skipped: true };
    }
    const version = generation;
    const statuses = { ...state.statuses };
    const studentIds = students.map((student) => student.id);
    emit({ saving: true });
    let failed = 0;
    for (const studentId of studentIds) {
      try { await saveRow(studentId, group, date, statuses[studentId] || 'Présent'); }
      catch { failed += 1; }
    }
    let refreshFailed = false;
    try {
      const rows = await loadSession(group, date);
      if (current(version, key)) {
        const freshStatuses = {};
        rows.forEach((row) => { freshStatuses[row.student_id] = row.status; });
        emit({ attendance: rows, statuses: freshStatuses, phase: 'ready', saving: false });
      }
    } catch {
      refreshFailed = true;
      if (current(version, key)) emit({ attendance: [], statuses: {}, phase: 'error', saving: false });
    }
    return { failed, total: studentIds.length, refreshFailed, group, date };
  }

  return {
    getState: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    select, setStatus, save,
  };
}
