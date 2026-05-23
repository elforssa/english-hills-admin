'use client';

import { useEffect, useState } from 'react';
import { entities, integrations } from '@/lib/entities';
import { Plus, Edit, Trash2, CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import Pagination from '@/components/ui/pagination';

const PAGE_SIZE = 20;

const STATUS_COLORS = {
  'Submitted': 'bg-blue-100 text-blue-700',
  'Under Review': 'bg-yellow-100 text-yellow-700',
  'Validated': 'bg-green-100 text-green-700',
  'Rejected': 'bg-red-100 text-red-700',
  'Trial': 'bg-purple-100 text-purple-700',
};

const inputClass = "w-full border border-border rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-primary";
const labelClass = "block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1";

function EnrollmentModal({ enrollment, students, groups, onSave, onClose }) {
  const [form, setForm] = useState(enrollment || { student_id: '', group_id: '', status: 'Submitted', date_inscription: new Date().toISOString().split('T')[0], notes: '' });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const selectedStudent = students.find(s => s.id === form.student_id);
  const selectedGroup = groups.find(g => g.id === form.group_id);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, student_id: form.student_id || null, group_id: form.group_id || null };
      if (form.id) {
        await entities.Enrollment.update(form.id, payload);
        const statusMap = { 'Validated': 'Enrolled', 'Rejected': 'Inactive', 'Trial': 'Trial', 'Submitted': 'Prospect', 'Under Review': 'Prospect' };
        const studentStatus = statusMap[form.status];
        if (form.student_id && studentStatus) {
          const updateData = { status: studentStatus };
          if (form.status === 'Validated' && form.group_id) {
            updateData.groupe_id = form.group_id;
          }
          await entities.Student.update(form.student_id, updateData);
        }
        toast.success('Mis à jour');
      } else {
        await entities.Enrollment.create(payload);
        toast.success('Inscription créée');
      }
      onSave();
    } catch {
      // entities.js already toasted — keep modal open for retry.
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-md shadow-xl max-h-[calc(100vh-2rem)] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-semibold">{form.id ? 'Modifier' : 'Nouvelle pré-inscription'}</h2>
          <button onClick={onClose} className="text-muted-foreground text-xl">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className={labelClass}>Apprenant *</label>
            <select className={inputClass} value={form.student_id} onChange={e => set('student_id', e.target.value)} required>
              <option value="">— Choisir un apprenant —</option>
              {students.map(s => (
                <option key={s.id} value={s.id}>
                  {s.full_name}{s.telephone ? ` · ${s.telephone}` : ''}{s.age_category ? ` · ${s.age_category}` : ''}
                </option>
              ))}
            </select>
            {selectedStudent && (
              <div className="mt-2 p-2.5 bg-blue-50 rounded-md text-xs text-blue-800 space-y-0.5">
                {selectedStudent.telephone && <div>📞 {selectedStudent.telephone}</div>}
                {selectedStudent.email && <div>✉️ {selectedStudent.email}</div>}
                {selectedStudent.age_category && <div>👤 {selectedStudent.age_category}</div>}
                {selectedStudent.niveau_cefr && <div>📚 Niveau : {selectedStudent.niveau_cefr}</div>}
                <div className="text-blue-600 font-medium">Statut : {selectedStudent.status}</div>
              </div>
            )}
          </div>
          <div>
            <label className={labelClass}>Groupe</label>
            <select className={inputClass} value={form.group_id || ''} onChange={e => set('group_id', e.target.value)}>
              <option value="">— Choisir un groupe —</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name} · {g.niveau}{g.horaire ? ` · ${g.horaire}` : ''}{g.jours ? ` (${g.jours})` : ''}</option>)}
            </select>
            {selectedGroup && (
              <div className="mt-2 p-2.5 bg-green-50 rounded-md text-xs text-green-800 space-y-0.5">
                {selectedGroup.horaire && <div>🕐 {selectedGroup.horaire}</div>}
                {selectedGroup.jours && <div>📅 {selectedGroup.jours}</div>}
                {selectedGroup.salle && <div>🏫 Salle : {selectedGroup.salle}</div>}
                {selectedGroup.capacite_max && <div>👥 Capacité max : {selectedGroup.capacite_max}</div>}
              </div>
            )}
          </div>
          <div>
            <label className={labelClass}>Statut</label>
            <select className={inputClass} value={form.status} onChange={e => set('status', e.target.value)}>
              {['Submitted','Under Review','Validated','Rejected','Trial'].map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Date</label>
            <input type="date" className={inputClass} value={form.date_inscription || ''} onChange={e => set('date_inscription', e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Notes</label>
            <textarea className={`${inputClass} h-16 resize-none`} value={form.notes || ''} onChange={e => set('notes', e.target.value)} />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving} className="px-5 py-2 text-sm font-semibold text-white rounded-md hover:opacity-90" style={{ backgroundColor: '#1E4D8B' }}>{saving ? '...' : 'Enregistrer'}</button>
            <button type="button" onClick={onClose} className="px-5 py-2 text-sm text-muted-foreground">Annuler</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Enrollments() {
  const [enrollments, setEnrollments] = useState([]);
  const [students, setStudents] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [page, setPage] = useState(1);

  const load = async () => {
    setLoading(true);
    const [e, s, g] = await Promise.all([
      entities.Enrollment.list('-created_date', 200),
      entities.Student.list('full_name', 200),
      entities.Group.list('name', 100),
    ]);
    setEnrollments(e);
    setStudents(s);
    setGroups(g);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const getStudent = id => students.find(s => s.id === id);
  const studentName = id => getStudent(id)?.full_name || '—';
  const groupName = id => {
    const g = groups.find(g => g.id === id);
    return g ? `${g.name} (${g.niveau})` : '—';
  };

  const ENROLLMENT_TO_STUDENT_STATUS = {
    'Validated': 'Enrolled',
    'Rejected': 'Inactive',
    'Trial': 'Trial',
    'Submitted': 'Prospect',
    'Under Review': 'Prospect',
  };

  const syncStudentStatus = async (enrollmentId, enrollmentStatus) => {
    const enrollment = enrollments.find(e => e.id === enrollmentId);
    const studentStatus = ENROLLMENT_TO_STUDENT_STATUS[enrollmentStatus];
    if (enrollment?.student_id && studentStatus) {
      const updateData = { status: studentStatus };
      if (enrollmentStatus === 'Validated' && enrollment.group_id) {
        updateData.groupe_id = enrollment.group_id;
      }
      await entities.Student.update(enrollment.student_id, updateData);
    }
  };

  const handleValidate = async (id) => {
    await entities.Enrollment.update(id, { status: 'Validated' });
    await syncStudentStatus(id, 'Validated');
    const enrollment = enrollments.find(e => e.id === id);
    const student = enrollment ? students.find(s => s.id === enrollment.student_id) : null;
    if (student?.email) {
      integrations.Core.SendEmail({
        to: student.email,
        subject: '[English Hills] Inscription confirmée',
        body: `Bonjour ${student.full_name},\n\nVotre inscription à English Hills Language Center a été confirmée.\n\nNous vous souhaitons la bienvenue !\n\n— English Hills Language Center\nBouskoura / Sidi Maarouf, Casablanca`,
      });
    }
    toast.success('Validée' + (student?.email ? ' — Email de confirmation envoyé' : ''));
    load();
  };
  const handleReject = async (id) => {
    await entities.Enrollment.update(id, { status: 'Rejected' });
    await syncStudentStatus(id, 'Rejected');
    toast.success('Refusée');
    load();
  };
  const handleDelete = async (id) => { if (!confirm('Supprimer ?')) return; await entities.Enrollment.delete(id); load(); };

  const PENDING_STATUSES = ['Submitted', 'Under Review', 'Rejected', 'Trial'];
  const filtered = enrollments.filter(e => {
    if (filterStatus === 'all') return true;
    if (filterStatus) return e.status === filterStatus;
    return PENDING_STATUSES.includes(e.status);
  });

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="p-4 lg:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold">Pré-inscriptions</h1>
        <button onClick={() => setModal({})} className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white rounded-md hover:opacity-90 self-start sm:self-auto" style={{ backgroundColor: '#1E4D8B' }}>
          <Plus size={15} /> Nouvelle inscription
        </button>
      </div>
      <div className="mb-5">
        <select className="border border-border rounded-md px-3 py-2 text-sm bg-white" value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }}>
          <option value="">En attente (défaut)</option>
          <option value="all">Tous les statuts</option>
          {['Submitted','Under Review','Validated','Rejected','Trial'].map(s => <option key={s}>{s}</option>)}
        </select>
      </div>
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {loading ? <div className="p-8 text-center text-muted-foreground text-sm">Chargement...</div> : (
          <>
            <div className="sm:hidden divide-y divide-border">
              {paged.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">Aucune inscription trouvée.</p>}
              {paged.map(e => {
                const st = getStudent(e.student_id);
                return (
                  <div key={e.id} className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div>
                        <p className="font-semibold text-sm">{studentName(e.student_id)}</p>
                        {st?.telephone && <p className="text-xs text-muted-foreground">{st.telephone}</p>}
                        {st?.age_category && <p className="text-xs text-muted-foreground">{st.age_category}</p>}
                        <p className="text-xs text-muted-foreground mt-1">{groupName(e.group_id)} · {e.date_inscription}</p>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full font-medium flex-shrink-0 ${STATUS_COLORS[e.status] || ''}`}>{e.status}</span>
                    </div>
                    <div className="flex gap-2 mt-3">
                      {e.status !== 'Validated' && <button onClick={() => handleValidate(e.id)} className="p-1.5 rounded hover:bg-green-50 text-muted-foreground hover:text-green-600"><CheckCircle size={15} /></button>}
                      {e.status !== 'Rejected' && <button onClick={() => handleReject(e.id)} className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600"><XCircle size={15} /></button>}
                      <button onClick={() => setModal(e)} className="p-1.5 rounded hover:bg-muted text-muted-foreground"><Edit size={15} /></button>
                      <button onClick={() => handleDelete(e.id)} className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600"><Trash2 size={15} /></button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted border-b border-border text-xs font-semibold text-muted-foreground">
                    {['Apprenant','Tél / Catégorie','Groupe','Date','Statut','Actions'].map(h => <th key={h} className="text-left px-4 py-3">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paged.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground text-sm">Aucune inscription trouvée.</td></tr>
                  )}
                  {paged.map(e => {
                    const st = getStudent(e.student_id);
                    return (
                      <tr key={e.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 font-medium">{studentName(e.student_id)}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          <div>{st?.telephone || '—'}</div>
                          {st?.age_category && <div className="text-muted-foreground/70">{st.age_category}</div>}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{groupName(e.group_id)}</td>
                        <td className="px-4 py-3 text-muted-foreground">{e.date_inscription}</td>
                        <td className="px-4 py-3"><span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[e.status] || ''}`}>{e.status}</span></td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            {e.status !== 'Validated' && <button onClick={() => handleValidate(e.id)} title="Valider" className="p-1 rounded hover:bg-green-50 text-muted-foreground hover:text-green-600"><CheckCircle size={14} /></button>}
                            {e.status !== 'Rejected' && <button onClick={() => handleReject(e.id)} title="Refuser" className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600"><XCircle size={14} /></button>}
                            <button onClick={() => setModal(e)} title="Modifier" className="p-1 rounded hover:bg-muted text-muted-foreground"><Edit size={14} /></button>
                            <button onClick={() => handleDelete(e.id)} title="Supprimer" className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600"><Trash2 size={14} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
      <Pagination page={page} total={filtered.length} pageSize={PAGE_SIZE} onChange={setPage} />
      {modal !== null && <EnrollmentModal enrollment={modal.id ? modal : null} students={students} groups={groups} onSave={() => { setModal(null); load(); }} onClose={() => setModal(null)} />}
    </div>
  );
}
