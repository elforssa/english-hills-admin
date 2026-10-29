'use client';

import { useAuth } from '@/context/AuthContext';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { entities, integrations } from '@/lib/entities';
import { Plus, Edit, Trash2, CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import EnrollmentModal from '@/components/students/EnrollmentModal';
import { currentSchoolYear, isPreEnrollment, isPendingPreEnrollment, LIVE_ENROLLMENT_STATUSES } from '@/lib/enrollmentWorkflow.mjs';
import { closeSchoolYear, membershipErrorMessage, saveEnrollmentChanges } from '@/lib/academic/membershipActions.mjs';
import { displayLabel, ENROLLMENT_LABELS } from '@/lib/ui/presentation.mjs';
import { getBrowserClient } from '@/lib/supabase';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import Pagination from '@/components/ui/pagination';
import { ENROLLMENT_STATUS_COLORS } from '@/lib/statusColors';
import ProgrammePill from '@/components/operational/ProgrammePill';
import PersonLink from '@/components/PersonLink';
import { invalidateAfterLearnerSave } from '@/lib/cacheInvalidation.mjs';

const PAGE_SIZE = 20;
const enrollmentLabel = (status) => status === 'Confirmed' ? 'Inscrit — groupe à affecter' : status === 'Ended' ? displayLabel(ENROLLMENT_LABELS, status) : status;

// Director (D2-B): ends every active enrollment of a finished school year; learners
// left with nothing active become Ancien apprenant. The live count is shown first
// and the database refuses if it changed meanwhile.
function YearCloseDialog({ onClose, onDone }) {
  const [year, setYear] = useState(() => { const [start] = currentSchoolYear().split('/'); return `${Number(start) - 1}/${start}`; });
  const [count, setCount] = useState(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const valid = /^[0-9]{4}\/[0-9]{4}$/.test(year);
  useEffect(() => {
    setCount(null);
    if (!valid) return;
    getBrowserClient().from('enrollments').select('id', { count: 'exact', head: true })
      .eq('school_year', year).in('status', LIVE_ENROLLMENT_STATUSES)
      .then(({ count: live, error }) => setCount(error ? undefined : live ?? 0));
  }, [year, valid]);
  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    const { data, error } = await closeSchoolYear(getBrowserClient(), { schoolYear: year, expectedCount: count, reason: reason.trim() });
    setSaving(false);
    if (error) { toast.error(membershipErrorMessage(error)); onDone(); return; }
    toast.success(`${data} inscription(s) de ${year} terminée(s).`);
    onDone();
  };
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="max-w-md">
      <DialogHeader><DialogTitle>Clôturer l’année scolaire</DialogTitle></DialogHeader>
      <form className="space-y-3" onSubmit={submit}>
        <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Année scolaire
          <input className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm" value={year} pattern="[0-9]{4}/[0-9]{4}" required onChange={e => setYear(e.target.value)} /></label>
        <p className="text-sm" role="status">{count === null ? 'Calcul…' : count === undefined ? 'Impossible de compter les inscriptions.'
          : `${count} inscription(s) active(s) seront terminées. Les apprenants sans autre inscription deviennent « Ancien apprenant ». Paiements et soldes ne changent pas.`}</p>
        <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Motif *
          <input className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm" maxLength={200} required value={reason} onChange={e => setReason(e.target.value)} /></label>
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
          <Button type="submit" disabled={saving || !count || !reason.trim()}>{saving ? '…' : 'Clôturer'}</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
}

export default function Enrollments() {
  const queryClient = useQueryClient();
  const { role } = useAuth();
  const isReceptionist = role === 'receptionist';
  const [enrollments, setEnrollments] = useState([]);
  const [students, setStudents] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [modal, setModal] = useState(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [page, setPage] = useState(1);
  const [yearClose, setYearClose] = useState(false);

  // After any save here, cached learners, groups and reports follow it (REL-8).
  const refreshAfterSave = () => { invalidateAfterLearnerSave(queryClient); return load(); };
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
    // ACA-5: a command with the loaded version; a placed pre-enrollment becomes Validated.
    const { error } = await saveEnrollmentChanges(getBrowserClient(), enrollment, { status: 'Validated' });
    if (error) { toast.error(membershipErrorMessage(error)); refreshAfterSave(); return; }
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
    refreshAfterSave();
  };
  const handleReject = async (id) => {
    const enrollment = enrollments.find(e => e.id === id);
    const { error } = await saveEnrollmentChanges(getBrowserClient(), enrollment, { status: 'Rejected' });
    if (error) { toast.error(membershipErrorMessage(error)); refreshAfterSave(); return; }
    toast.success('Refusée');
    refreshAfterSave();
  };
  // Only Submitted, Under Review and Rejected rows can be deleted (I10); the
  // database refuses the others with a French message.
  const handleDelete = async (id) => {
    if (!confirm('Supprimer ?')) return;
    const { error } = await getBrowserClient().from('enrollments').delete().eq('id', id);
    if (error) { toast.error(membershipErrorMessage(error)); return; }
    // N7: cached learners and groups follow the deleted enrollment.
    await refreshAfterSave();
  };

  const filtered = enrollments.filter(e => {
    if (filterStatus === 'Ended') return e.status === 'Ended';
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
          <option value="Ended">{displayLabel(ENROLLMENT_LABELS, 'Ended')}</option>
        </select>
        {role === 'director' && <Button variant="outline" className="ml-3" onClick={() => setYearClose(true)}>Clôturer l’année</Button>}
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
                        <p className="font-semibold text-sm"><PersonLink id={e.student_id}>{studentName(e.student_id)}</PersonLink></p>
                        {st?.telephone && <p className="text-xs text-muted-foreground">{st.telephone}</p>}
                        {st?.age_category && <p className="text-xs text-muted-foreground">{st.age_category}</p>}
                        <button disabled={isReceptionist && e.status === 'Rejected'} onClick={() => setModal(e)} className="block text-xs text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary rounded">Pré-inscription du {e.date_inscription || '—'}</button>
                        <p className="text-xs text-muted-foreground mt-1">{groupName(e.group_id)}</p>
                        {(e.session_type || e.school_year) && <p className="text-xs text-muted-foreground">{e.session_type ? <ProgrammePill sessionType={e.session_type} /> : 'Session non renseignée'} · {e.school_year || 'Année non renseignée'} · {e.level || 'Niveau à définir'}</p>}
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full font-medium flex-shrink-0 ${ENROLLMENT_STATUS_COLORS[e.status] || ''}`}>{enrollmentLabel(e.status)}</span>
                    </div>
                    <div className="flex gap-2 mt-3">
                      {!isReceptionist && !['Validated','Ended'].includes(e.status) && <button aria-label={`Valider l'inscription de ${studentName(e.student_id)}`} onClick={() => handleValidate(e.id)} className="p-1.5 rounded hover:bg-green-50 text-muted-foreground hover:text-green-600"><CheckCircle size={15} /></button>}
                      {!isReceptionist && !['Rejected','Ended'].includes(e.status) && <button aria-label={`Refuser l'inscription de ${studentName(e.student_id)}`} onClick={() => handleReject(e.id)} className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600"><XCircle size={15} /></button>}
                      <button aria-label={`Modifier l'inscription de ${studentName(e.student_id)}`} disabled={isReceptionist && e.status === 'Rejected'} onClick={() => setModal(e)} className="p-1.5 rounded hover:bg-muted text-muted-foreground"><Edit size={15} /></button>

                      {!isReceptionist && <button aria-label={`Supprimer l'inscription de ${studentName(e.student_id)}`} onClick={() => handleDelete(e.id)} className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600"><Trash2 size={15} /></button>}
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
                        <td className="px-4 py-3 font-medium"><PersonLink id={e.student_id}>{studentName(e.student_id)}</PersonLink></td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          <div>{st?.telephone || '—'}</div>
                          {st?.age_category && <div className="text-muted-foreground/70">{st.age_category}</div>}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{e.session_type ? <ProgrammePill sessionType={e.session_type} /> : '—'} · {e.school_year || '—'} · {e.level || 'Niveau à définir'}</td>
                        <td className="px-4 py-3 text-muted-foreground">{groupName(e.group_id)}</td>
                        <td className="px-4 py-3"><button disabled={isReceptionist && e.status === 'Rejected'} onClick={() => setModal(e)} className="text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary rounded">{e.date_inscription || '—'}</button></td>
                        <td className="px-4 py-3"><span className={`text-xs px-2 py-1 rounded-full font-medium ${ENROLLMENT_STATUS_COLORS[e.status] || ''}`}>{enrollmentLabel(e.status)}</span></td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            {!isReceptionist && !['Validated','Ended'].includes(e.status) && <button onClick={() => handleValidate(e.id)} title="Valider" className="p-1 rounded hover:bg-green-50 text-muted-foreground hover:text-green-600"><CheckCircle size={14} /></button>}
                            {!isReceptionist && !['Rejected','Ended'].includes(e.status) && <button onClick={() => handleReject(e.id)} title="Refuser" className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600"><XCircle size={14} /></button>}
                            <button disabled={isReceptionist && e.status === 'Rejected'} onClick={() => setModal(e)} title="Modifier" className="p-1 rounded hover:bg-muted text-muted-foreground"><Edit size={14} /></button>

                            {!isReceptionist && <button onClick={() => handleDelete(e.id)} title="Supprimer" className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600"><Trash2 size={14} /></button>}
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
      {modal !== null && <EnrollmentModal enrollment={modal.id ? modal : null} students={students} groups={groups} onSave={() => { setModal(null); refreshAfterSave(); }} onClose={() => setModal(null)} />}
      {yearClose && <YearCloseDialog onClose={() => setYearClose(false)} onDone={() => { setYearClose(false); refreshAfterSave(); }} />}
    </div>
  );
}
