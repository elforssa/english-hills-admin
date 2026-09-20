'use client';

import { useEffect, useState } from 'react';
import { entities, integrations } from '@/lib/entities';
import { Plus, Edit, Trash2, CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import EnrollmentModal from '@/components/students/EnrollmentModal';
import { isPreEnrollment, isPendingPreEnrollment } from '@/lib/enrollmentWorkflow.mjs';
import { Button } from '@/components/ui/button';
import Pagination from '@/components/ui/pagination';
import { ENROLLMENT_STATUS_COLORS } from '@/lib/statusColors';

const PAGE_SIZE = 20;
const enrollmentLabel = (status) => status === 'Confirmed' ? 'Inscrit — groupe à affecter' : status;

export default function Enrollments() {
  const [enrollments, setEnrollments] = useState([]);
  const [students, setStudents] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [modal, setModal] = useState(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [page, setPage] = useState(1);

  const load = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [e, s, g] = await Promise.all([
        entities.Enrollment.listAll('-created_date'),
        entities.Student.listAll('full_name'),
        entities.Group.listAll('name'),
      ]);
      setEnrollments(e); setStudents(s); setGroups(g);
    } catch { setLoadError(true); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const getStudent = id => students.find(s => s.id === id);
  const studentName = id => getStudent(id)?.full_name || '—';
  const groupName = id => {
    const g = groups.find(g => g.id === id);
    return g ? `${g.name} (${g.niveau})` : '—';
  };

  const handleValidate = async (id) => {
    const enrollment = enrollments.find(e => e.id === id);
    if (!enrollment?.group_id) { toast.error('Choisissez un groupe avant de valider cette inscription.'); return; }
    try { await entities.Enrollment.update(id, { status: 'Validated' }); }
    catch { return; }
    const student = enrollment ? students.find(s => s.id === enrollment.student_id) : null;

    // Notify both the student (if they have an email) AND the parent. For
    // young learners the parent email is the primary contact — the student
    // may not have one of their own.
    const recipients = [];
    if (student?.parent_email) recipients.push(student.parent_email);
    if (student?.email && student.email !== student.parent_email) {
      recipients.push(student.email);
    }
    let emailSent = false;
    if (recipients.length > 0) {
      try {
        await integrations.Core.SendEmail({
          to: recipients,
          subject: '[English Hills] Inscription confirmée',
          body: `Bonjour,\n\nL'inscription de ${student.full_name} à English Hills Language Center a été confirmée.\n\nNous vous souhaitons la bienvenue !\n\n— English Hills Language Center\nAlmaz 2, Hills Business Center, Bâtiment B, Bureau 6, Casablanca`,
        });
        emailSent = true;
      } catch (err) {
        // integrations.SendEmail already toasted; carry on with validation.
        // eslint-disable-next-line no-console
        console.error('[enrollments] confirmation email failed:', err);
      }
    }
    toast.success('Validée' + (emailSent ? ' — Email de confirmation envoyé' : ''));
    load();
  };
  const handleReject = async (id) => {
    try { await entities.Enrollment.update(id, { status: 'Rejected' }); }
    catch { return; }
    toast.success('Refusée');
    load();
  };
  const handleDelete = async (id) => { if (!confirm('Supprimer ?')) return; try { await entities.Enrollment.delete(id); await load(); } catch { /* entities already reported the error */ } };

  const filtered = enrollments.filter(e => {
    if (!isPreEnrollment(e)) return false;
    if (filterStatus === 'all') return true;
    if (filterStatus) return e.status === filterStatus;
    return isPendingPreEnrollment(e);
  });

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="mx-auto max-w-7xl p-4 lg:p-8">
      <header className="mb-6 flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-xs font-bold uppercase tracking-widest text-primary">Parcours apprenant</p><h1 className="mt-1 text-2xl font-bold tracking-tight">Pré-inscriptions</h1></div>
        <Button onClick={() => setModal({})} className="self-start sm:self-auto">
          <Plus size={15} /> Nouvelle inscription
        </Button>
      </header>
      <div className="mb-5">
        <select className="border border-border rounded-md px-3 py-2 text-sm bg-white" value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }}>
          <option value="">En attente (défaut)</option>
          <option value="all">Toutes les pré-inscriptions</option>
          {['Submitted','Under Review','Rejected','Trial'].map(s => <option key={s}>{s}</option>)}
        </select>
      </div>
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {loading ? <div className="p-8 text-center text-muted-foreground text-sm">Chargement...</div> : loadError ? <div role="alert" className="p-8 text-center text-sm">Impossible de charger les inscriptions. <button onClick={load} className="text-primary underline">Réessayer</button></div> : (
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
                        {(e.session_type || e.school_year) && <p className="text-xs text-muted-foreground">{e.session_type || 'Session non renseignée'} · {e.school_year || 'Année non renseignée'} · {e.level || 'Niveau à définir'}</p>}
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full font-medium flex-shrink-0 ${ENROLLMENT_STATUS_COLORS[e.status] || ''}`}>{enrollmentLabel(e.status)}</span>
                    </div>
                    <div className="flex gap-2 mt-3">
                      {e.status !== 'Validated' && <button aria-label={`Valider l'inscription de ${studentName(e.student_id)}`} onClick={() => handleValidate(e.id)} className="p-1.5 rounded hover:bg-green-50 text-muted-foreground hover:text-green-600"><CheckCircle size={15} /></button>}
                      {e.status !== 'Rejected' && <button aria-label={`Refuser l'inscription de ${studentName(e.student_id)}`} onClick={() => handleReject(e.id)} className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600"><XCircle size={15} /></button>}
                      <button aria-label={`Modifier l'inscription de ${studentName(e.student_id)}`} onClick={() => setModal(e)} className="p-1.5 rounded hover:bg-muted text-muted-foreground"><Edit size={15} /></button>

                      <button aria-label={`Supprimer l'inscription de ${studentName(e.student_id)}`} onClick={() => handleDelete(e.id)} className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600"><Trash2 size={15} /></button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted border-b border-border text-xs font-semibold text-muted-foreground">
                    {['Apprenant','Tél / Catégorie','Session / année','Groupe','Date','Statut','Actions'].map(h => <th key={h} className="text-left px-4 py-3">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paged.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground text-sm">Aucune inscription trouvée.</td></tr>
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
                        <td className="px-4 py-3 text-muted-foreground text-xs">{e.session_type || '—'} · {e.school_year || '—'} · {e.level || 'Niveau à définir'}</td>
                        <td className="px-4 py-3 text-muted-foreground">{groupName(e.group_id)}</td>
                        <td className="px-4 py-3 text-muted-foreground">{e.date_inscription}</td>
                        <td className="px-4 py-3"><span className={`text-xs px-2 py-1 rounded-full font-medium ${ENROLLMENT_STATUS_COLORS[e.status] || ''}`}>{enrollmentLabel(e.status)}</span></td>
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
