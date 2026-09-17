'use client';

import { useEffect, useRef, useState } from 'react';
import { entities, auth } from '@/lib/entities';
import { toast } from 'sonner';
import { CheckCircle, XCircle, Clock, AlertCircle, Download } from 'lucide-react';
import { exportToCsv } from '@/utils/exportCsv';
import { getBrowserClient } from '@/lib/supabase';
import { createAttendanceSessionManager } from '@/lib/attendanceSession.mjs';

const todayInCasablanca = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Africa/Casablanca' });

const STATUS_CONFIG = {
  'Présent': { color: 'bg-green-100 text-green-700', icon: CheckCircle },
  'Absent': { color: 'bg-red-100 text-red-700', icon: XCircle },
  'Retard': { color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  'Justifié': { color: 'bg-blue-100 text-blue-700', icon: AlertCircle },
};

export default function Attendance() {
  const [groups, setGroups] = useState([]);
  const [students, setStudents] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [sessionDate, setSessionDate] = useState(todayInCasablanca);
  const [showHistory, setShowHistory] = useState(false);
  const sessionManager = useRef(null);
  if (!sessionManager.current) {
    sessionManager.current = createAttendanceSessionManager({
      loadSession: (group, date) => entities.Attendance.filter({ group_id: group, session_date: date }),
      loadHistory: (group) => entities.Attendance.filterAll({ group_id: group }, '-session_date'),
      saveRow: async (studentId, group, date, status) => {
        const { error } = await getBrowserClient().rpc('save_attendance', {
          p_student: studentId, p_group: group, p_date: date, p_status: status,
        });
        if (error) throw error;
      },
    });
  }
  const [sessionState, setSessionState] = useState(sessionManager.current.getState);

  const [enrollments, setEnrollments] = useState([]);

  useEffect(() => {
    Promise.all([
      entities.Group.listAll('name'),
      entities.Student.listAll('full_name'),
      entities.Enrollment.listAll('-created_date'),
    ])
      .then(([g, s, e]) => { setGroups(g); setStudents(s); setEnrollments(e); })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error('[attendance] initial load failed:', err);
        toast.error('Impossible de charger les groupes / apprenants.');
      });
  }, []);

  useEffect(() => sessionManager.current.subscribe(setSessionState), []);
  useEffect(() => { sessionManager.current.select(selectedGroup, sessionDate); }, [selectedGroup, sessionDate]);

  const selectedKey = selectedGroup ? `${selectedGroup}|${sessionDate}` : '';
  const selectionMatches = sessionState.key === selectedKey;
  const sessionReady = selectionMatches && sessionState.phase === 'ready';
  const sessionError = selectionMatches && sessionState.phase === 'error';
  const statuses = sessionReady ? sessionState.statuses : {};
  const saving = selectionMatches && sessionState.saving;
  const history = selectionMatches ? sessionState.history : [];

  const enrolledStudentIds = enrollments.filter(e => e.group_id === selectedGroup && ['Validated','Trial'].includes(e.status)).map(e => e.student_id);
  const groupStudents = students.filter(s => s.groupe_id === selectedGroup || enrolledStudentIds.includes(s.id))
    .filter((s, i, arr) => arr.findIndex(x => x.id === s.id) === i);

  const setStatus = (studentId, status) => {
    sessionManager.current.setStatus(selectedGroup, sessionDate, studentId, status);
  };

  const handleSave = async () => {
    const result = await sessionManager.current.save(selectedGroup, sessionDate, groupStudents);
    if (result.skipped) return;
    const label = `${groupName(result.group)} — ${result.date}`;
    if (result.failed === 0 && !result.refreshFailed) toast.success(`Présences enregistrées : ${label}`);
    else if (result.failed < result.total && !result.refreshFailed)
      toast.error(`Enregistrement partiel (${label}) : ${result.failed} apprenant(s) non sauvegardés.`);
    else toast.error(`Présences non confirmées (${label}). Rechargez la séance avant une nouvelle saisie.`);
  };

  const groupName = (gid) => groups.find(g => g.id === gid)?.name || gid;

  const exportAttendanceCsv = () => {
    if (!sessionReady || saving) return;
    exportToCsv(groupStudents.map(s => ({
      Apprenant: s.full_name,
      Niveau: s.niveau_cefr || '',
      Statut: statuses[s.id] || 'Présent',
      Date: sessionDate,
      Groupe: groupName(selectedGroup),
    })), `presences-${selectedGroup}-${sessionDate}.csv`);
  };

  return (
    <div className="p-4 lg:p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Gestion des présences</h1>
        {selectedGroup && (
          <button
            onClick={() => setShowHistory(h => !h)}
            className={`text-sm font-medium px-3 py-1.5 rounded-md border transition-colors ${showHistory ? 'bg-primary text-white border-transparent' : 'border-border hover:bg-muted'}`}
          >
            {showHistory ? 'Saisie du jour' : 'Historique'}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div>
          <label htmlFor="attendance-group" className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Groupe</label>
          <select id="attendance-group" className="w-full border border-border rounded-md px-3 py-2 text-sm bg-white" value={selectedGroup} onChange={e => setSelectedGroup(e.target.value)}>
            <option value="">— Choisir un groupe —</option>
            {groups.map(g => <option key={g.id} value={g.id}>{g.name} ({g.niveau})</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="attendance-date" className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Date de séance</label>
          <input id="attendance-date" type="date" className="w-full border border-border rounded-md px-3 py-2 text-sm bg-white" value={sessionDate} onChange={e => setSessionDate(e.target.value)} max={todayInCasablanca()} />
        </div>
      </div>

      {showHistory && selectedGroup ? (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-border">
            <h2 className="font-semibold text-sm">Historique des séances — {groupName(selectedGroup)}</h2>
          </div>
          {!selectionMatches || sessionState.historyPhase === 'loading' ? (
            <div className="p-8 text-center text-muted-foreground text-sm" role="status">Chargement de l’historique…</div>
          ) : sessionState.historyPhase === 'error' ? (
            <div className="p-8 text-center text-sm" role="alert">Impossible de charger l’historique. <button className="text-primary underline" onClick={() => sessionManager.current.select(selectedGroup, sessionDate)}>Réessayer</button></div>
          ) : history.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Aucune séance enregistrée.</div>
          ) : (
            <div className="divide-y divide-border">
              {history.map(([date, records]) => {
                const presentsCount = records.filter(r => r.status === 'Présent').length;
                const absentsCount  = records.filter(r => r.status === 'Absent').length;
                return (
                  <div key={date} className="flex items-center justify-between px-5 py-3">
                    <div>
                      <button
                        onClick={() => { setSessionDate(date); setShowHistory(false); }}
                        className="text-sm font-medium text-primary hover:underline"
                      >
                        {date}
                      </button>
                      <p className="text-xs text-muted-foreground mt-0.5">{records.length} apprenants</p>
                    </div>
                    <div className="flex gap-3 text-xs">
                      <span className="text-green-600 font-medium">{presentsCount} présents</span>
                      <span className="text-red-600 font-medium">{absentsCount} absents</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : !selectedGroup ? (
        <div className="bg-card border border-border rounded-lg p-12 text-center text-muted-foreground">
          Sélectionnez un groupe pour marquer les présences.
        </div>
      ) : !selectionMatches || sessionState.phase === 'loading' ? (
        <div className="bg-card border border-border rounded-lg p-12 text-center text-muted-foreground" role="status">
          Chargement de la séance…
        </div>
      ) : sessionError ? (
        <div className="bg-card border border-border rounded-lg p-12 text-center" role="alert">
          <p>Impossible de charger cette séance. Aucune saisie ne peut être enregistrée.</p>
          <button className="mt-3 text-primary underline" onClick={() => sessionManager.current.select(selectedGroup, sessionDate)}>Réessayer</button>
        </div>
      ) : groupStudents.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-12 text-center text-muted-foreground">
          Aucun apprenant dans ce groupe. Assignez des apprenants depuis leur fiche.
        </div>
      ) : !showHistory && (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="font-semibold">{groupName(selectedGroup)} — {sessionDate}</h2>
            <div className="flex gap-3 text-xs text-muted-foreground">
              <span className="text-green-600 font-medium">{Object.values(statuses).filter(s => s === 'Présent').length} présents</span>
              <span className="text-red-600 font-medium">{Object.values(statuses).filter(s => s === 'Absent').length} absents</span>
            </div>
          </div>
          <div className="divide-y divide-border">
            {groupStudents.map(student => {
              const status = statuses[student.id] || 'Présent';
              return (
                <div key={student.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">{student.full_name}</p>
                    <p className="text-xs text-muted-foreground">{student.niveau_cefr}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.keys(STATUS_CONFIG).map(s => {
                      const cfg = STATUS_CONFIG[s];
                      const Icon = cfg.icon;
                      return (
                        <button key={s} onClick={() => setStatus(student.id, s)} disabled={!sessionReady || saving} aria-pressed={status === s}
                          className={`flex items-center gap-1 px-2 py-1.5 rounded text-xs font-medium border transition-colors ${status === s ? cfg.color + ' border-transparent' : 'bg-white text-muted-foreground border-border hover:bg-muted'}`}>
                          <Icon size={11} />{s}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="px-5 py-4 border-t border-border flex items-center gap-3">
            <button onClick={handleSave} disabled={!sessionReady || saving} className="px-5 py-2 text-sm font-semibold text-white rounded-md bg-primary hover:opacity-90 disabled:opacity-50">
              {saving ? 'Enregistrement...' : 'Enregistrer les présences'}
            </button>
            <button onClick={exportAttendanceCsv} disabled={!sessionReady || saving} className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-border rounded-md hover:bg-muted disabled:opacity-50">
              <Download size={14} /> Export CSV
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
