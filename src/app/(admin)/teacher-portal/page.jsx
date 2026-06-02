'use client';

import { useEffect, useState } from 'react';
import { entities, auth } from '@/lib/entities';
import { Users, CheckCircle, XCircle, Clock, AlertCircle, Plus, Edit, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import MessagesTab from '@/components/portals/MessagesTab';

// Build a unique recipient list from rows like {email, name}, dropping blanks.
function uniqueRecipients(list) {
  const seen = new Set();
  return list.filter(r => r.email && !seen.has(r.email) && seen.add(r.email));
}

const inputClass = "w-full border border-border rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-primary";
const labelClass = "block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1";

function AssessmentModal({ assessment, students, groups, onSave, onClose }) {
  const [form, setForm] = useState(assessment || {
    student_id: '', group_id: '', terme: 'Sept–Déc', note_oral: '', note_ecrit: '', note_devoirs: '',
    poids_oral: 40, poids_ecrit: 30, poids_devoirs: 30, niveau_actuel: 'A1', commentaire: '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const noteFinale = () => {
    const o = parseFloat(form.note_oral) || 0;
    const e = parseFloat(form.note_ecrit) || 0;
    const d = parseFloat(form.note_devoirs) || 0;
    return ((o * form.poids_oral + e * form.poids_ecrit + d * form.poids_devoirs) / 100).toFixed(1);
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    setSaving(true);
    const data = { ...form, student_id: form.student_id || null, group_id: form.group_id || null, note_oral: parseFloat(form.note_oral)||null, note_ecrit: parseFloat(form.note_ecrit)||null, note_devoirs: parseFloat(form.note_devoirs)||null, note_finale: parseFloat(noteFinale()) };
    try {
      if (form.id) {
        await entities.Assessment.update(form.id, data);
        toast.success('Note mise à jour');
      } else {
        await entities.Assessment.create(data);
        toast.success('Note créée');
      }
      onSave();
    } catch {
      // entities.js already toasted — keep modal open for retry.
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{form.id ? 'Modifier' : 'Nouvelle évaluation'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Apprenant *</label>
              <select className={inputClass} value={form.student_id} onChange={e => set('student_id', e.target.value)} required>
                <option value="">— Choisir —</option>
                {students.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Groupe</label>
              <select className={inputClass} value={form.group_id || ''} onChange={e => set('group_id', e.target.value)}>
                <option value="">— Choisir —</option>
                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Terme</label>
              <select className={inputClass} value={form.terme} onChange={e => set('terme', e.target.value)}>
                {['Sept–Déc','Jan–Mar','Avr–Juin','Été'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Niveau actuel</label>
              <select className={inputClass} value={form.niveau_actuel || ''} onChange={e => set('niveau_actuel', e.target.value)}>
                {['A1','A2','B1','B2','C1','C2'].map(n => <option key={n}>{n}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Oral ({form.poids_oral}%)</label>
              <input type="number" min="0" max="20" className={inputClass} value={form.note_oral || ''} onChange={e => set('note_oral', e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Écrit ({form.poids_ecrit}%)</label>
              <input type="number" min="0" max="20" className={inputClass} value={form.note_ecrit || ''} onChange={e => set('note_ecrit', e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Devoirs ({form.poids_devoirs}%)</label>
              <input type="number" min="0" max="20" className={inputClass} value={form.note_devoirs || ''} onChange={e => set('note_devoirs', e.target.value)} />
            </div>
            <div className="flex items-end pb-1">
              <div className="w-full px-4 py-2 rounded-md text-center font-bold text-lg bg-primary/10 text-primary">
                Finale: {noteFinale()} / 20
              </div>
            </div>
            <div className="col-span-2">
              <label className={labelClass}>Commentaire</label>
              <textarea className={`${inputClass} h-16 resize-none`} value={form.commentaire || ''} onChange={e => set('commentaire', e.target.value)} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={saving}>{saving ? '...' : 'Enregistrer'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NotesTab({ groups, students, assessments: initialAssessments, setAssessments }) {
  const [modal, setModal] = useState(null);
  const [localAssessments, setLocalAssessments] = useState(initialAssessments);

  useEffect(() => { setLocalAssessments(initialAssessments); }, [initialAssessments]);

  const reload = async () => {
    if (!groups.length) return;
    const groupIds = groups.map(g => g.id);
    const all = await entities.Assessment.list('-created_date', 200);
    const filtered = all.filter(a => groupIds.includes(a.group_id));
    setLocalAssessments(filtered);
    setAssessments(filtered);
  };

  const handleDelete = async (id) => {
    if (!confirm('Supprimer ?')) return;
    await entities.Assessment.delete(id);
    toast.success('Supprimé');
    reload();
  };

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button onClick={() => setModal({})} className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-white rounded-md bg-primary hover:opacity-90">
          <Plus size={14} /> Saisir une note
        </button>
      </div>
      <div className="bg-card border border-border rounded-lg overflow-hidden divide-y divide-border">
        {localAssessments.map(a => (
          <div key={a.id} className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm font-medium">{students.find(s => s.id === a.student_id)?.full_name || '—'}</p>
              <p className="text-xs text-muted-foreground">{a.terme} · {groups.find(g => g.id === a.group_id)?.name || '—'}</p>
            </div>
            <div className="flex items-center gap-3">
              <p className="font-bold text-primary">{a.note_finale ?? '—'}/20</p>
              <button onClick={() => setModal(a)} className="p-1 rounded hover:bg-muted text-muted-foreground"><Edit size={13} /></button>
              <button onClick={() => handleDelete(a.id)} className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600"><Trash2 size={13} /></button>
            </div>
          </div>
        ))}
        {localAssessments.length === 0 && (
          <div className="p-12 text-center text-muted-foreground text-sm">
            <div className="text-4xl mb-3">📝</div>
            <p>Aucune note enregistrée pour vos groupes.</p>
          </div>
        )}
      </div>
      {modal !== null && (
        <AssessmentModal
          assessment={modal.id ? modal : null}
          students={students}
          groups={groups}
          onSave={() => { setModal(null); reload(); }}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

const KOLB_COLORS = {
  Diverging: 'bg-purple-50 text-purple-700', Assimilating: 'bg-blue-50 text-blue-700',
  Converging: 'bg-green-50 text-green-700', Accommodating: 'bg-orange-50 text-orange-700',
};

function LearningTab({ groups, students }) {
  const [assessments, setLearning] = useState([]);
  const [filterGroup, setFilterGroup] = useState('');
  useEffect(() => { entities.LearningAssessment.list('-created_date', 200).then(setLearning); }, []);

  const groupStudentIds = filterGroup ? students.filter(s => s.groupe_id === filterGroup).map(s => s.id) : null;
  const filtered = assessments.filter(a => !groupStudentIds || groupStudentIds.includes(a.student_id));

  return (
    <div className="space-y-4">
      <div className="max-w-xs">
        <select className="w-full border border-border rounded-md px-3 py-2 text-sm bg-white" value={filterGroup} onChange={e => setFilterGroup(e.target.value)}>
          <option value="">Tous mes groupes</option>
          {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </div>
      {filtered.length === 0 ? (
        <div className="p-8 text-center text-muted-foreground text-sm bg-card border border-border rounded-lg">Aucune évaluation disponible.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filtered.map(a => (
            <div key={a.id} className="bg-card border border-border rounded-xl p-4">
              <p className="font-semibold text-sm">{a.student_name}</p>
              <p className="text-xs text-muted-foreground mb-2">{a.date_assessment}</p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {a.kolb_style && <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${KOLB_COLORS[a.kolb_style] || 'bg-gray-50 text-gray-600'}`}>{a.kolb_style}</span>}
                {a.dominant_intelligence && <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{a.dominant_intelligence}</span>}
              </div>
              {a.intelligences && (
                <div className="space-y-1 mt-2">
                  {Object.entries(a.intelligences).sort((x,y) => y[1]-x[1]).slice(0,3).map(([k,v]) => (
                    <div key={k} className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-36 flex-shrink-0 truncate">{k}</span>
                      <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
                        <div className="h-1.5 rounded-full bg-primary" style={{ width: `${Math.min(100, v*10)}%` }} />
                      </div>
                      <span className="text-xs font-bold w-3">{v}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const LEAVE_STATUS_COLORS = {
  'En attente': 'bg-yellow-100 text-yellow-700',
  'Approuvé': 'bg-green-100 text-green-700',
  'Refusé': 'bg-red-100 text-red-700',
};

function LeaveTab({ teacher }) {
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ date_debut: '', date_fin: '', type_conge: 'Congé annuel', notes: '' });
  const [saving, setSaving] = useState(false);

  const load = () => {
    if (!teacher) { setLoading(false); return; }
    entities.LeaveRequest.filter({ teacher_id: teacher.id }, '-created_date')
      .then(setLeaves)
      .catch(() => { /* entities.js already toasted */ })
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacher]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!teacher) return;
    if (!form.date_debut || !form.date_fin) { toast.error('Veuillez renseigner les dates.'); return; }
    if (form.date_fin < form.date_debut) { toast.error('La date de fin doit être après la date de début.'); return; }
    setSaving(true);
    try {
      await entities.LeaveRequest.create({
        teacher_id:   teacher.id,
        teacher_name: teacher.full_name,
        date_debut:   form.date_debut,
        date_fin:     form.date_fin,
        type_conge:   form.type_conge,
        status:       'En attente',
        notes:        form.notes || null,
      });
      toast.success('Demande de congé envoyée');
      setForm({ date_debut: '', date_fin: '', type_conge: 'Congé annuel', notes: '' });
      load();
    } catch {
      // entities.js already toasted — keep the form filled for retry.
    } finally {
      setSaving(false);
    }
  };

  if (!teacher) {
    return (
      <div className="p-8 text-center text-muted-foreground text-sm bg-card border border-border rounded-lg">
        Aucune fiche enseignant n&apos;est liée à votre compte.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="bg-card border border-border rounded-xl p-5 space-y-4 max-w-lg">
        <h2 className="font-semibold text-sm">Nouvelle demande de congé</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Du *</label>
            <input type="date" className={inputClass} value={form.date_debut} onChange={e => set('date_debut', e.target.value)} required />
          </div>
          <div>
            <label className={labelClass}>Au *</label>
            <input type="date" className={inputClass} value={form.date_fin} onChange={e => set('date_fin', e.target.value)} required />
          </div>
        </div>
        <div>
          <label className={labelClass}>Type de congé</label>
          <select className={inputClass} value={form.type_conge} onChange={e => set('type_conge', e.target.value)}>
            {['Congé annuel','Maladie','Personnel','Formation'].map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Notes</label>
          <textarea className={`${inputClass} h-16 resize-none`} value={form.notes} onChange={e => set('notes', e.target.value)} />
        </div>
        <button type="submit" disabled={saving} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white rounded-md bg-primary hover:opacity-90 disabled:opacity-50">
          <Plus size={14} /> {saving ? 'Envoi...' : 'Envoyer la demande'}
        </button>
      </form>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border"><p className="font-semibold text-sm">Mes demandes</p></div>
        {loading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Chargement...</div>
        ) : leaves.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Aucune demande de congé.</div>
        ) : (
          <div className="divide-y divide-border">
            {leaves.map(l => (
              <div key={l.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{l.type_conge}</p>
                  <p className="text-xs text-muted-foreground">{l.date_debut} → {l.date_fin}{l.remplacant ? ` · Remplaçant: ${l.remplacant}` : ''}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${LEAVE_STATUS_COLORS[l.status] || 'bg-gray-100 text-gray-500'}`}>{l.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const STATUS_CONFIG = {
  'Présent': 'bg-green-100 text-green-700',
  'Absent': 'bg-red-100 text-red-700',
  'Retard': 'bg-yellow-100 text-yellow-700',
  'Justifié': 'bg-blue-100 text-blue-700',
};
const ICONS = { 'Présent': CheckCircle, 'Absent': XCircle, 'Retard': Clock, 'Justifié': AlertCircle };

export default function TeacherPortal() {
  const [user, setUser] = useState(null);
  const [teacher, setTeacher] = useState(null);
  const [groups, setGroups] = useState([]);
  const [students, setStudents] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [assessments, setAssessments] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().split('T')[0]);
  const [attendance, setAttendance] = useState([]);
  const [statuses, setStatuses] = useState({});
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState('groups');
  const TABS = [{ id: 'groups', label: 'Mes groupes' }, { id: 'attendance', label: 'Présences' }, { id: 'notes', label: 'Notes' }, { id: 'learning', label: "Styles d'apprentissage" }, { id: 'leave', label: 'Congés' }, { id: 'messages', label: 'Messages' }];
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    auth.me().then(async (u) => {
      setUser(u);
      const allTeachers = await entities.Teacher.list('full_name', 100);
      const me = allTeachers.find(t => t.email === u?.email);
      setTeacher(me);
      const allGroups = await entities.Group.list('name', 100);
      const myGroups = me ? allGroups.filter(g => g.teacher_id === me.id) : allGroups;
      setGroups(myGroups);
      const allStudents = await entities.Student.list('full_name', 200);
      setStudents(allStudents);
      // Validated enrollments let us include students enrolled in a group even
      // if their student.groupe_id wasn't set — matches the /attendance roster.
      const validatedEnrollments = await entities.Enrollment.filter({ status: 'Validated' });
      setEnrollments(validatedEnrollments);
      // RLS scopes announcements to what this teacher may see (audience 'all',
      // 'teachers', and their groups). No client-side audience filter needed.
      const ann = await entities.Announcement.list('-created_date', 10);
      setAnnouncements(ann);
      if (myGroups.length > 0) {
        const groupIds = myGroups.map(g => g.id);
        const allAssessments = await entities.Assessment.list('-created_date', 200);
        setAssessments(allAssessments.filter(a => groupIds.includes(a.group_id)));
      }
      setLoading(false);
    }).catch(() => setLoading(false));
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
  const groupStudents = students
    .filter(s => s.groupe_id === selectedGroup || enrolledStudentIds.includes(s.id))
    .filter((s, i, arr) => arr.findIndex(x => x.id === s.id) === i);

  const handleSave = async () => {
    if (!selectedGroup) return;
    setSaving(true);
    try {
      for (const student of groupStudents) {
        const status = statuses[student.id] || 'Présent';
        const existing = attendance.find(a => a.student_id === student.id);
        if (existing) await entities.Attendance.update(existing.id, { status });
        else await entities.Attendance.create({ student_id: student.id, group_id: selectedGroup, session_date: sessionDate, status });
      }
      toast.success('Présences enregistrées');
    } catch {
      // entities.js already toasted the failing row.
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4 lg:p-8 max-w-5xl mx-auto animate-pulse">
        <div className="h-6 w-48 bg-muted rounded mb-2" />
        <div className="h-3 w-64 bg-muted/70 rounded mb-6" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-xl p-5 h-32" />
          ))}
        </div>
      </div>
    );
  }

  const wasDirector = user?.role === 'director' && teacher === null;

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Espace Enseignant</h1>
          <p className="text-muted-foreground text-sm mt-1">Bienvenue, {user?.full_name}</p>
        </div>
        {wasDirector && (
          <a
            href="/settings"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-border bg-card hover:bg-muted transition text-muted-foreground"
          >
            ⚙️ Paramètres (changer de rôle)
          </a>
        )}
      </div>

      {announcements.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-5">
          <p className="text-xs font-semibold text-blue-700 mb-2">ANNONCES</p>
          {announcements.slice(0, 2).map(a => (
            <div key={a.id} className="mb-1">
              <p className="text-sm font-semibold">{a.title}</p>
              <p className="text-xs text-blue-800">{a.body}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-1 border border-border rounded-lg p-1 bg-muted w-fit mb-6">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${tab === t.id ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'groups' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {groups.map(g => {
            const count = students.filter(s => s.groupe_id === g.id).length;
            return (
              <div key={g.id} className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-start justify-between mb-3">
                  <span className="text-xs font-bold text-white px-2 py-0.5 rounded bg-primary">{g.niveau}</span>
                  <span className="text-xs text-muted-foreground">{g.terme}</span>
                </div>
                <p className="font-semibold">{g.name}</p>
                <p className="text-xs text-muted-foreground mt-1">{g.jours} {g.horaire}</p>
                <p className="text-xs text-muted-foreground">{g.salle || '—'}</p>
                <div className="flex items-center gap-1 mt-3 text-xs text-muted-foreground">
                  <Users size={12} /> {count} apprenants
                </div>
              </div>
            );
          })}
          {groups.length === 0 && <div className="col-span-3 p-8 text-center text-muted-foreground text-sm">Aucun groupe assigné.</div>}
        </div>
      )}

      {tab === 'attendance' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Groupe</label>
              <select className="w-full border border-border rounded-md px-3 py-2 text-sm bg-white" value={selectedGroup} onChange={e => setSelectedGroup(e.target.value)}>
                <option value="">— Choisir un groupe —</option>
                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Date</label>
              <input type="date" className="w-full border border-border rounded-md px-3 py-2 text-sm bg-white" value={sessionDate} onChange={e => setSessionDate(e.target.value)} max={new Date().toISOString().split('T')[0]} />
            </div>
          </div>
          {selectedGroup && (
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="divide-y divide-border">
                {groupStudents.map(student => {
                  const status = statuses[student.id] || 'Présent';
                  return (
                    <div key={student.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-3">
                      <p className="text-sm font-medium">{student.full_name}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {Object.keys(STATUS_CONFIG).map(s => {
                          const Icon = ICONS[s];
                          return (
                            <button key={s} onClick={() => setStatuses(prev => ({ ...prev, [student.id]: s }))}
                              className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border transition-colors ${status === s ? STATUS_CONFIG[s] + ' border-transparent' : 'bg-white text-muted-foreground border-border hover:bg-muted'}`}>
                              <Icon size={11} />{s}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
              {groupStudents.length > 0 && (
                <div className="px-4 py-3 border-t border-border">
                  <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm font-semibold text-white rounded-md bg-primary hover:opacity-90 disabled:opacity-50">
                    {saving ? 'Enregistrement...' : 'Enregistrer'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'notes' && (
        <NotesTab groups={groups} students={students} assessments={assessments} setAssessments={setAssessments} />
      )}

      {tab === 'learning' && (
        <LearningTab groups={groups} students={students} />
      )}

      {tab === 'leave' && (
        <LeaveTab teacher={teacher} />
      )}

      {tab === 'messages' && (
        <MessagesTab
          me={{ email: user?.email, name: user?.full_name }}
          recipients={uniqueRecipients(
            students.flatMap(s => [
              { email: s.parent_email, name: `Parent de ${s.full_name}` },
              { email: s.email, name: s.full_name },
            ]),
          )}
        />
      )}

    </div>
  );
}
