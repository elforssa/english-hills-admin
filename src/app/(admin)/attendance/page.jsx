'use client';

import { centreDate } from '@/lib/centreClock.mjs';
import { useEffect, useRef, useState } from 'react';
import { entities, auth } from '@/lib/entities';
import { toast } from 'sonner';
import { CheckCircle, XCircle, Clock, AlertCircle, Download } from 'lucide-react';
import { exportToCsv } from '@/utils/exportCsv';
import { getBrowserClient } from '@/lib/supabase';
import { createAttendanceSessionManager, NOT_RECORDED } from '@/lib/attendanceSession.mjs';
import { classDaysText, meetsOn } from '@/lib/academic/classDays.mjs';
import PersonLink from '@/components/PersonLink';
import { groupMemberIds } from '@/lib/enrollmentWorkflow.mjs';
import { useAuth } from '@/context/AuthContext';
import { loadTeacherAcademicRows } from '@/lib/portal';
import { getMyTeacher } from '@/lib/teacher-directory';
import { invalidateAfterLearnerSave } from '@/lib/cacheInvalidation.mjs';
import { queryClientInstance } from '@/lib/query-client';
import { isClosedCourse } from '@/lib/academic/courseClose.mjs';
import { useClosedOnlineGroupIds } from '@/lib/queries';

const todayInCasablanca = () => centreDate();

// RWR-r5 §6.3 (141): the server's refusals, in French.
const ATTENDANCE_MESSAGES = {
  'attendance.future_date': 'Une séance à venir ne se saisit pas encore.',
  'attendance.not_class_day': 'Ce groupe n’a pas cours ce jour-là.',
  'attendance.closed_date': 'Le centre est fermé ce jour-là. Seule la direction peut enregistrer une séance exceptionnelle.',
  'attendance.override_director': 'Seule la direction peut enregistrer une séance un jour de fermeture.',
};
const attendanceMessage = (error) => ATTENDANCE_MESSAGES[error?.hint] || (error?.code === '23514' ? 'Cet apprenant n’est plus dans ce groupe. Rechargez la séance.' : error?.code === '42501' ? 'Vous n’avez pas accès à cette séance.' : 'Enregistrement impossible. Réessayez.');

const STATUS_CONFIG = {
  'Présent': { color: 'bg-green-100 text-green-700', icon: CheckCircle },
  'Absent': { color: 'bg-red-100 text-red-700', icon: XCircle },
  'Retard': { color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  'Justifié': { color: 'bg-blue-100 text-blue-700', icon: AlertCircle },
};

export default function Attendance() {
  const { role } = useAuth();
  const [groups, setGroups] = useState([]);
  // CDC (D4): after the close, a course's roll call is no longer offered.
  const closedOnline = useClosedOnlineGroupIds();
  const [students, setStudents] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [sessionDate, setSessionDate] = useState(todayInCasablanca);
  const [showHistory, setShowHistory] = useState(false);
  // §6.3: the groups that meet on the chosen date, unless « Tous les groupes ».
  const [allGroups, setAllGroups] = useState(false);
  const [override, setOverride] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const sessionManager = useRef(null);
  if (!sessionManager.current) {
    sessionManager.current = createAttendanceSessionManager({
      loadSession: (group, date) => entities.Attendance.filter({ group_id: group, session_date: date }),
      loadHistory: (group) => entities.Attendance.filterAll({ group_id: group }, '-session_date'),
      saveRow: async (studentId, group, date, status, options = {}) => {
        const { error } = await getBrowserClient().rpc('save_attendance', {
          p_student: studentId, p_group: group, p_date: date, p_status: status,
          ...(options.overrideClosed ? { p_override_closed: true } : {}),
        });
        if (error) throw error;
      },
    });
  }
  const [sessionState, setSessionState] = useState(sessionManager.current.getState);

  const [enrollments, setEnrollments] = useState([]);

  useEffect(() => {
    // A teacher takes attendance for the groups assigned to them (an empty one
    // included), from the class list of those groups.
    Promise.all([
      entities.Group.listAll('name'),
      role === 'teacher' ? loadTeacherAcademicRows() : Promise.all([
        entities.Student.listAll('full_name'),
        entities.Enrollment.listAll('-created_date'),
      ]).then(([students, enrollments]) => ({ students, enrollments })),
      role === 'teacher' ? getMyTeacher() : null,
    ])
      .then(([g, { students: s, enrollments: e }, me]) => {
        setGroups(role === 'teacher' ? g.filter(group => me && group.teacher_id === me.id) : g);
        setStudents(s); setEnrollments(e);
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error('[attendance] initial load failed:', err);
        toast.error('Impossible de charger les groupes / apprenants.');
      });
  }, [role]);

  useEffect(() => sessionManager.current.subscribe(setSessionState), []);
  useEffect(() => { setSaveError(null); setOverride(false); sessionManager.current.select(selectedGroup, sessionDate); }, [selectedGroup, sessionDate]);

  const selectedKey = selectedGroup ? `${selectedGroup}|${sessionDate}` : '';
  const selectionMatches = sessionState.key === selectedKey;
  const sessionReady = selectionMatches && sessionState.phase === 'ready';
  const sessionError = selectionMatches && sessionState.phase === 'error';
  const statuses = sessionReady ? sessionState.statuses : {};
  const saving = selectionMatches && sessionState.saving;
  const history = selectionMatches ? sessionState.history : [];

  // One roster rule for the page, the groups list and the database (EGC).
  const memberIds = groupMemberIds(students, enrollments, selectedGroup);
  const groupStudents = students.filter(s => memberIds.has(s.id));

  const setStatus = (studentId, status) => {
    sessionManager.current.setStatus(selectedGroup, sessionDate, studentId, status);
  };

  const handleSave = async () => {
    setSaveError(null);
    const result = await sessionManager.current.save(selectedGroup, sessionDate, groupStudents, { overrideClosed: override });
    if (result.empty) { toast.info('Aucune présence à enregistrer : marquez au moins un apprenant.'); return; }
    if (result.skipped) return;
    invalidateAfterLearnerSave(queryClientInstance);
    const label = `${groupName(result.group)} — ${result.date}`;
    if (result.errors?.length) setSaveError(result.errors[0].error);
    if (result.failed === 0 && !result.refreshFailed) toast.success(`Présences enregistrées : ${label}`);
    else if (result.failed < result.total && !result.refreshFailed)
      toast.error(`Enregistrement partiel (${label}) : ${result.failed} apprenant(s) non sauvegardés.`);
    else if (!result.refreshFailed) toast.error(`Présences non enregistrées (${label}).`);
    else toast.error(`Présences non confirmées (${label}). Rechargez la séance avant une nouvelle saisie.`);
  };
  const markAllPresent = () => sessionManager.current.markUnmarked(selectedGroup, sessionDate, groupStudents, 'Présent');
  const counts = Object.fromEntries([...Object.keys(STATUS_CONFIG), NOT_RECORDED].map(k => [k, 0]));
  for (const s of groupStudents) counts[statuses[s.id] || NOT_RECORDED] += 1;
  const pendingCount = sessionReady ? sessionManager.current.pending(groupStudents).length : 0;
  const selected = groups.find(g => g.id === selectedGroup);
  const noClassThatDay = !!selected && !meetsOn(selected, sessionDate);
  const openGroups = groups.filter(g => !isClosedCourse(g, closedOnline));
  const dayGroups = allGroups ? openGroups : openGroups.filter(g => meetsOn(g, sessionDate) || g.id === selectedGroup);

  const groupName = (gid) => groups.find(g => g.id === gid)?.name || gid;

  const exportAttendanceCsv = () => {
    if (!sessionReady || saving) return;
    exportToCsv(groupStudents.map(s => ({
      Apprenant: s.full_name,
      Niveau: s.niveau_cefr || '',
      Statut: statuses[s.id] || NOT_RECORDED,
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
            <option value="">{dayGroups.length ? '— Choisir un groupe —' : 'Aucun groupe n’a cours ce jour-là'}</option>
            {dayGroups.map(g => <option key={g.id} value={g.id}>{g.name} ({g.niveau}){g.class_days?.length ? ` · ${classDaysText(g.class_days)}` : ''}</option>)}
          </select>
          <label className="mt-2 flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={allGroups} onChange={e => setAllGroups(e.target.checked)} />Tous les groupes (pas seulement ceux qui ont cours ce jour-là)</label>
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
          <div className="px-5 py-4 border-b border-border flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">{groupName(selectedGroup)} — {sessionDate}</h2>
            <div data-testid="attendance-counts" className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span className="text-green-600 font-medium">{counts['Présent']} présent{counts['Présent'] > 1 ? 's' : ''}</span>
              <span className="text-red-600 font-medium">{counts['Absent']} absent{counts['Absent'] > 1 ? 's' : ''}</span>
              <span className="text-yellow-700 font-medium">{counts['Retard']} en retard</span>
              <span className="text-blue-700 font-medium">{counts['Justifié']} justifié{counts['Justifié'] > 1 ? 's' : ''}</span>
              <span className="font-medium">{counts[NOT_RECORDED]} non saisi{counts[NOT_RECORDED] > 1 ? 's' : ''}</span>
            </div>
          </div>
          {noClassThatDay && <p role="status" className="border-b border-border bg-amber-50 px-5 py-3 text-sm text-amber-900">Ce groupe n’a pas cours ce jour-là ({classDaysText(selected.class_days)}) : la séance ne peut pas être enregistrée.</p>}
          <div className="divide-y divide-border">
            {groupStudents.map(student => {
              const status = statuses[student.id] || NOT_RECORDED;
              return (
                <div key={student.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium"><PersonLink id={student.id}>{student.full_name}</PersonLink></p>
                    <p className="text-xs text-muted-foreground">{student.niveau_cefr}{status === NOT_RECORDED && <span data-testid="not-recorded" className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700">{NOT_RECORDED}</span>}</p>
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
          {saveError && <div role="alert" className="border-t border-border bg-red-50 px-5 py-3 text-sm text-red-800">
            <p>{attendanceMessage(saveError)}</p>
            {saveError.hint === 'attendance.closed_date' && role === 'director' && <label className="mt-2 flex min-h-11 items-center gap-2"><input type="checkbox" checked={override} onChange={e => setOverride(e.target.checked)} />Séance exceptionnelle : enregistrer malgré la fermeture (direction)</label>}
          </div>}
          <div className="px-5 py-4 border-t border-border flex flex-wrap items-center gap-3">
            <button onClick={markAllPresent} disabled={!sessionReady || saving || noClassThatDay || counts[NOT_RECORDED] === 0} className="px-4 py-2 text-sm font-medium border border-border rounded-md hover:bg-muted disabled:opacity-50">
              Tous présents
            </button>
            <button onClick={handleSave} disabled={!sessionReady || saving || noClassThatDay || pendingCount === 0} className="px-5 py-2 text-sm font-semibold text-white rounded-md bg-primary hover:opacity-90 disabled:opacity-50">
              {saving ? 'Enregistrement...' : pendingCount > 0 ? `Enregistrer les présences (${pendingCount})` : 'Enregistrer les présences'}
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
