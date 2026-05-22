'use client';

import { useEffect, useState } from 'react';
import { entities, auth } from '@/lib/entities';
import { toast } from 'sonner';
import { CheckCircle, XCircle, Clock, AlertCircle, Download } from 'lucide-react';
import { exportToCsv } from '@/utils/exportCsv';

const STATUS_CONFIG = {
  'Présent': { color: 'bg-green-100 text-green-700', icon: CheckCircle },
  'Absent': { color: 'bg-red-100 text-red-700', icon: XCircle },
  'Retard': { color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  'Justifié': { color: 'bg-blue-100 text-blue-700', icon: AlertCircle },
};

export default function Attendance() {
  const [groups, setGroups] = useState([]);
  const [students, setStudents] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);
  const [statuses, setStatuses] = useState({});

  const [enrollments, setEnrollments] = useState([]);

  useEffect(() => {
    Promise.all([
      entities.Group.list('name', 100),
      entities.Student.list('full_name', 200),
      entities.Enrollment.filter({ status: 'Validated' }),
    ]).then(([g, s, e]) => { setGroups(g); setStudents(s); setEnrollments(e); });
  }, []);

  useEffect(() => {
    if (!selectedGroup) return;
    entities.Attendance.filter({ group_id: selectedGroup, session_date: sessionDate }).then(a => {
      setAttendance(a);
      const s = {};
      a.forEach(r => { s[r.student_id] = r.status; });
      setStatuses(s);
    });
  }, [selectedGroup, sessionDate]);

  const enrolledStudentIds = enrollments.filter(e => e.group_id === selectedGroup).map(e => e.student_id);
  const groupStudents = students.filter(s => s.groupe_id === selectedGroup || enrolledStudentIds.includes(s.id))
    .filter((s, i, arr) => arr.findIndex(x => x.id === s.id) === i);

  const setStatus = (studentId, status) => {
    setStatuses(prev => ({ ...prev, [studentId]: status }));
  };

  const handleSave = async () => {
    if (!selectedGroup) return;
    setSaving(true);
    try {
      for (const student of groupStudents) {
        const status = statuses[student.id] || 'Présent';
        const existing = attendance.find(a => a.student_id === student.id);
        if (existing) {
          await entities.Attendance.update(existing.id, { status });
        } else {
          await entities.Attendance.create({ student_id: student.id, group_id: selectedGroup, session_date: sessionDate, status });
        }
      }
      toast.success('Présences enregistrées');
    } catch {
      // entities.js already toasted the failing row.
    } finally {
      setSaving(false);
    }
  };

  const groupName = (gid) => groups.find(g => g.id === gid)?.name || gid;

  const exportAttendanceCsv = () => {
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
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div>
          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Groupe</label>
          <select className="w-full border border-border rounded-md px-3 py-2 text-sm bg-white" value={selectedGroup} onChange={e => setSelectedGroup(e.target.value)}>
            <option value="">— Choisir un groupe —</option>
            {groups.map(g => <option key={g.id} value={g.id}>{g.name} ({g.niveau})</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Date de séance</label>
          <input type="date" className="w-full border border-border rounded-md px-3 py-2 text-sm bg-white" value={sessionDate} onChange={e => setSessionDate(e.target.value)} />
        </div>
      </div>

      {!selectedGroup ? (
        <div className="bg-card border border-border rounded-lg p-12 text-center text-muted-foreground">
          Sélectionnez un groupe pour marquer les présences.
        </div>
      ) : groupStudents.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-12 text-center text-muted-foreground">
          Aucun apprenant dans ce groupe. Assignez des apprenants depuis leur fiche.
        </div>
      ) : (
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
                        <button key={s} onClick={() => setStatus(student.id, s)}
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
            <button onClick={handleSave} disabled={saving} className="px-5 py-2 text-sm font-semibold text-white rounded-md bg-primary hover:opacity-90 disabled:opacity-50">
              {saving ? 'Enregistrement...' : 'Enregistrer les présences'}
            </button>
            <button onClick={exportAttendanceCsv} className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-border rounded-md hover:bg-muted">
              <Download size={14} /> Export CSV
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
