'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { entities, integrations } from '@/lib/entities';
import { getBrowserClient } from '@/lib/supabase';
import { isRecordConflict, recordConflictMessage } from '@/lib/conflictErrors.mjs';
import { useAuth } from '@/context/AuthContext';
import EnrollmentModal from '@/components/students/EnrollmentModal';
import { useQueryClient } from '@tanstack/react-query';
import PageFrame from '@/components/operational/PageFrame';
import PageHeader from '@/components/operational/PageHeader';
import ReadState from '@/components/operational/ReadState';
import { Button } from '@/components/ui/button';
import { DOSSIER_LABELS, ENROLLMENT_LABELS, displayLabel, programmeLabel } from '@/lib/ui/presentation.mjs';
import { ArrowLeft, Edit, FileText, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { STUDENT_STATUS_COLORS, PAYMENT_STATUS_COLORS } from '@/lib/statusColors';
import { money, receiptAmounts, receiptStatus } from '@/lib/receiptFinance';
import { studentPaymentSummary } from '@/lib/studentPayment';
import { safeReturnTo } from '@/lib/navigation.mjs';
import ContextLink from '@/components/ContextLink';
import { hasCapability } from '@/lib/roleAccess.mjs';
import { openStoredFile } from '@/lib/storage';
import { enrollmentParam } from '@/lib/crm/enrollmentActions.mjs';
import { LIVE_ENROLLMENT_STATUSES } from '@/lib/enrollmentWorkflow.mjs';
import { endLearner, membershipErrorMessage, reopenEnrollment } from '@/lib/academic/membershipActions.mjs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

// Module scope keeps section DOM stable across renders (a focused row survives).
const Section = ({ title, children }) => (
  <div className="bg-card border border-border rounded-lg overflow-hidden mb-6">
    <div className="px-4 py-3 border-b border-border bg-muted/30">
      <h3 className="font-semibold text-base leading-6 text-foreground">{title}</h3>
    </div>
    <div className="p-4">{children}</div>
  </div>
);

// "Ancien apprenant" (ACA-3, D2): management ends the selected active enrollments
// with a reason; with none left the file becomes Ancien apprenant or Inactif and
// leaves every roster. Charges, receipts and attendance never change.
function LeaverDialog({ student, enrollments, groups, openBalance, onClose, onDone }) {
  const active = enrollments.filter(e => LIVE_ENROLLMENT_STATUSES.includes(e.status));
  const [selected, setSelected] = useState(() => active.map(e => e.id));
  const [finalStatus, setFinalStatus] = useState('Alumni');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const toggle = (enrollmentId) => setSelected(ids => ids.includes(enrollmentId) ? ids.filter(x => x !== enrollmentId) : [...ids, enrollmentId]);
  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    const { data, error } = await endLearner(getBrowserClient(), { student, finalStatus, reason: reason.trim(),
      enrollmentIds: selected.length === active.length ? null : selected });
    setSaving(false);
    if (error) { toast.error(membershipErrorMessage(error)); if (isRecordConflict(error)) onDone(); return; }
    toast.success(`${data.ended} inscription(s) terminée(s)${Number(data.open_balance) > 0 ? ` · solde restant ${money(data.open_balance)} MAD (inchangé)` : ''}`);
    onDone();
  };
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="max-w-md">
      <DialogHeader><DialogTitle>Ancien apprenant : {student.full_name}</DialogTitle></DialogHeader>
      <form className="space-y-3 text-sm" onSubmit={submit}>
        {active.length === 0 ? <p className="text-muted-foreground">Aucune inscription active : seul le statut du dossier change.</p>
          : <fieldset className="space-y-1"><legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Inscriptions à terminer</legend>
            {active.map(e => <label key={e.id} className="flex items-center gap-2">
              <input type="checkbox" checked={selected.includes(e.id)} onChange={() => toggle(e.id)} />
              {programmeLabel(e.session_type)} · {e.school_year || 'Année non renseignée'} · {e.group_id ? groups.find(g => g.id === e.group_id)?.name || 'Groupe' : displayLabel(ENROLLMENT_LABELS, e.status)}
            </label>)}</fieldset>}
        <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Statut du dossier (sans autre inscription active)
          <select className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm" value={finalStatus} onChange={e => setFinalStatus(e.target.value)}>
            <option value="Alumni">Ancien apprenant — a terminé son programme</option>
            <option value="Inactive">Inactif — a arrêté en cours de route</option>
          </select></label>
        <label className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Motif *
          <input className="mt-1 w-full rounded-md border border-border bg-white px-3 py-2 text-sm" required maxLength={200} value={reason} onChange={e => setReason(e.target.value)} /></label>
        {openBalance > 0 && <p className="rounded-md bg-amber-50 p-2 text-amber-900">Solde restant : {money(openBalance)} MAD. Il reste dû et visible ; aucun paiement n’est annulé.</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
          <Button type="submit" disabled={saving || !reason.trim() || (active.length > 0 && selected.length === 0)}>{saving ? '…' : 'Confirmer'}</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
}

export default function StudentDetailPage() {
  return <StudentDetail />;
}

function StudentDetail() {
  const { role, user } = useAuth();
  const canManage = hasCapability(role, 'canManageStudents');
  const params = useParams();
  const id = params?.id;
  const router = useRouter();
  const queryClient = useQueryClient();
  const [enrollments, setEnrollments] = useState([]);
  const [groups, setGroups] = useState([]);
  const [enrollmentModal, setEnrollmentModal] = useState(null);
  const [leaver, setLeaver] = useState(false);
  const isManagement = role === 'director' || role === 'admin';
  const [student, setStudent] = useState(null);
  const [payments, setPayments] = useState([]);
  const [charges, setCharges] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [assessments, setAssessments] = useState([]);
  const [adults, setAdults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [loadedScope, setLoadedScope] = useState(null);
  const scope = `${user?.id}:${role}:${id}`;
  const [reload, setReload] = useState(0);
  // CRM Continuer: highlight and focus the linked enrollment once loaded.
  const linkedEnrollment = enrollmentParam(useSearchParams()?.get('enrollment'));
  const [highlightedEnrollmentId, setHighlightedEnrollmentId] = useState(null);
  const highlightApplied = useRef(null);

  useEffect(() => {
    if (!id) return;
    let active = true;
    setLoading(true); setLoadError(false);
    Promise.all([
      entities.Student.filter({ id }),
      entities.Receipt.filter({ student_id: id }),
      entities.Attendance.filter({ student_id: id }),
      entities.Assessment.filter({ student_id: id }),
      entities.AuthorizedAdult.filter({ student_id: id }),
      getBrowserClient().from('charge_balances').select('*').eq('student_id', id),
      entities.Enrollment.filterAll({ student_id: id }, '-created_at'),
      entities.Group.listAll('name'),
    ]).then(([s, p, a, as_, adults, chargeResult, enrollmentRows, groupRows]) => {
      if (!active) return;
      if (chargeResult.error) throw chargeResult.error;
      if (!Array.isArray(chargeResult.data)) throw new Error('Unavailable balance read');
      setLoadedScope(scope);
      setStudent(s[0]);
      setEnrollments(enrollmentRows);
      setGroups(groupRows);
      setPayments(p);
      setAttendance(a);
      setAssessments(as_);
      setAdults(adults);
      setCharges(chargeResult.data || []);
    }).catch(() => { if (active) setLoadError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, reload, scope]);

  const handleDelete = async () => {
    if (!confirm('Archiver cet apprenant ? Ses inscriptions actives seront terminées (« Dossier archivé ») ; son historique et ses paiements sont conservés. La direction peut restaurer le dossier.')) return;
    const sb = getBrowserClient();
    const { error } = await sb.rpc('soft_delete_student', { p_student_id: id });
    if (error) { toast.error(membershipErrorMessage(error)); return; }
    toast.success('Apprenant archivé');
    router.push(safeReturnTo(new URLSearchParams(window.location.search).get('returnTo')));
  };

  const appendDocument = async (enrollment, file) => {
    if (!file) return;
    try {
      const { file_url } = await integrations.Core.UploadFile({ file, purpose: 'enrollment_document',
        studentId: id, enrollmentId: enrollment.id });
      const { error } = await getBrowserClient().rpc('append_receptionist_enrollment_document', {
        p_enrollment: enrollment.id, p_expected_updated_at: enrollment.updated_at, p_asset: file_url,
      });
      if (error) throw error;
      toast.success('Document ajouté');
      setReload(value => value + 1);
    } catch (error) {
      // Changed in the meantime (ADR-009): reload the record for review.
      if (isRecordConflict(error)) { toast.error(recordConflictMessage()); setReload(value => value + 1); }
      else toast.error(error.message);
    }
  };

  const reopen = async (enrollment) => {
    if (!confirm('Rouvrir cette inscription ? Elle redevient « Inscrit — groupe à affecter ».')) return;
    const { error } = await reopenEnrollment(getBrowserClient(), enrollment);
    if (error) { toast.error(membershipErrorMessage(error)); if (isRecordConflict(error)) setReload(value => value + 1); return; }
    toast.success('Inscription rouverte');
    queryClient.invalidateQueries({ queryKey: ['Student'] });
    setReload(value => value + 1);
  };

  const sameScope = loadedScope === scope;
  useEffect(() => {
    if (!linkedEnrollment || loading || !sameScope || highlightApplied.current === linkedEnrollment) return;
    if (!enrollments.some(enrollment => enrollment.id === linkedEnrollment)) return;
    highlightApplied.current = linkedEnrollment;
    setHighlightedEnrollmentId(linkedEnrollment);
  }, [linkedEnrollment, loading, sameScope, enrollments]);
  useEffect(() => {
    if (!highlightedEnrollmentId) return;
    const row = document.getElementById(`enrollment-${highlightedEnrollmentId}`);
    row?.scrollIntoView({ block: 'center' });
    row?.focus({ preventScroll: true });
  }, [highlightedEnrollmentId]);
  if ((loading || loadError) && !sameScope) return <PageFrame width="detail"><PageHeader title="Fiche apprenant"/><ReadState state={loading ? 'loading' : 'error'} message={loadError ? 'Impossible de charger la fiche complète.' : undefined} onRetry={loadError ? () => setReload(value=>value+1) : undefined}/></PageFrame>;
  if (!student || !sameScope) return <PageFrame width="detail"><PageHeader title="Fiche apprenant"/><ReadState state="unavailable" message="Apprenant introuvable ou archivé."/><Button variant="link" onClick={() => router.push(safeReturnTo(new URLSearchParams(window.location.search).get('returnTo')))}>Retour</Button></PageFrame>;

  const paymentSummary = studentPaymentSummary(charges);
  const present = attendance.filter(a => a.status === 'Présent').length;
  const presenceRate = attendance.length ? Math.round((present / attendance.length) * 100) : null;

  return (
    <PageFrame width="detail" className="break-words">
      <PageHeader title={student.full_name} breadcrumb={<Button variant="link" className="px-0" onClick={() => router.push(safeReturnTo(new URLSearchParams(window.location.search).get('returnTo')))}><ArrowLeft size={15}/>Retour</Button>} description={<div className="flex flex-wrap items-center gap-2"><span>Statut du dossier</span><span className={`rounded-full px-2 py-1 text-xs ${STUDENT_STATUS_COLORS[student.status] || 'bg-slate-100 text-slate-700'}`}>{displayLabel(DOSSIER_LABELS,student.status)}</span></div>} actions={<><Button asChild variant="outline"><ContextLink href={`/students/${id}/edit`}><Edit size={14}/>Modifier</ContextLink></Button>{isManagement && <Button variant="outline" onClick={() => setLeaver(true)}>Ancien apprenant</Button>}{hasCapability(role, 'canArchiveStudents') && <Button variant="destructive" onClick={handleDelete}><Trash2 size={14}/>Archiver</Button>}</>}/>
      <ReadState state={loading ? 'refreshing' : loadError ? 'stale' : 'ready'} onRetry={loadError ? () => setReload(value=>value+1) : undefined}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Niveau', value: student.niveau_cefr || '—' },
          { label: 'Taux de présence', value: presenceRate !== null ? `${presenceRate}%` : '—' },
          { label: 'Solde restant actuel', value: paymentSummary.status === 'Aucun engagement' ? 'Aucun engagement' : `${money(paymentSummary.balance)} MAD` },
        ].map(({ label, value }) => (
          <div key={label} className="bg-card border border-border rounded-lg p-4">
            <p className="text-xs text-muted-foreground mb-1">{label}</p>
            <p className="text-xl font-semibold tabular-nums text-foreground">{value}</p>
          </div>
        ))}
      </div>

      <Section title="Situation des paiements">
        <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${PAYMENT_STATUS_COLORS[paymentSummary.status] || PAYMENT_STATUS_COLORS['Aucun engagement']}`}>{paymentSummary.status}</span>
          {paymentSummary.balance > 0 && <span className="font-semibold">{money(paymentSummary.balance)} MAD restants</span>}
        </div>
        {charges.filter((charge) => !charge.voided_at).length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun engagement actif enregistré.</p>
        ) : (
          <div className="space-y-2">
            {charges.filter((charge) => !charge.voided_at).map((charge) => (
              <div key={charge.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3 text-sm">
                <div>
                  <p className="font-semibold">{charge.session_type || 'Session'}{charge.school_year ? ` · ${charge.school_year}` : ''}</p>
                  <p className="text-xs text-muted-foreground">{charge.service_description || 'Engagement'}{charge.due_date ? ` · échéance ${charge.due_date}` : ''}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${PAYMENT_STATUS_COLORS[charge.settlement_status] || PAYMENT_STATUS_COLORS['En attente']}`}>{charge.settlement_status}</span>
                  <span className="font-semibold">{money(charge.balance)} MAD restants</span>
                  {canManage && Number(charge.balance) > 0 && <Link data-touch-target href={`/receipts/new?student_id=${student.id}&charge_id=${charge.id}`} className="text-xs font-semibold text-primary hover:underline">Encaisser</Link>}
                  {role === 'director' && <Link data-touch-target href={`/finance/charges/${charge.id}/edit`} className="text-xs font-semibold text-rose-700 hover:underline">Corriger l’engagement</Link>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Informations personnelles">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          {[
            ['Date de naissance', student.date_naissance],
            ['Téléphone', student.telephone],
            ['Email', student.email],
            ['Catégorie', student.age_category],
            ['Programme du dossier', programmeLabel(student.session_type)],
            ['Comment connu le centre', student.referral_source || '—'],
          ].map(([label, val]) => (
            <div key={label}>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="font-medium">{val || '—'}</p>
            </div>
          ))}
          {student.notes && (
            <div className="sm:col-span-2">
              <p className="text-xs text-muted-foreground">Notes</p>
              <p className="font-medium">{student.notes}</p>
            </div>
          )}
        </div>
      </Section>

      <Section title="Inscriptions et groupes">
        {role === 'receptionist' && <p className="mb-3 text-xs text-muted-foreground">La réception prépare les pré-inscriptions. La confirmation suit le parcours autorisé ; contactez la direction pour les opérations restreintes.</p>}
        {(role === 'receptionist' || isManagement) && <button type="button" className="mb-3 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground" onClick={() => setEnrollmentModal({ student_id: id, status: 'Submitted', date_inscription: new Date().toISOString().slice(0, 10) })}>{role === 'receptionist' ? 'Nouvelle pré-inscription' : 'Nouvelle inscription'}</button>}
        {/* The main group is the database's copy of one membership; each enrollment shows its own group. */}
        {student.groupe_id && <p className="mb-3 text-sm">Groupe principal : {groups.find(g => g.id === student.groupe_id)?.name || 'Groupe affecté'}</p>}
        {enrollments.length === 0 ? <p className="text-sm text-muted-foreground">Aucune inscription enregistrée. Le statut du dossier ne confirme pas une inscription actuelle. Une affectation de groupe passe par une inscription.</p> : (
          <div className="space-y-3">{enrollments.map(enrollment => (
            <div key={enrollment.id} {...(enrollment.id === highlightedEnrollmentId ? { id: `enrollment-${enrollment.id}`, tabIndex: -1 } : {})} className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm ${enrollment.id === highlightedEnrollmentId ? 'border-primary bg-primary/5 ring-2 ring-primary' : 'border-border'}`}>
              <div>{enrollment.id === highlightedEnrollmentId && <p className="mb-1 text-xs font-semibold text-primary">Inscription liée au prospect CRM</p>}<p className="font-semibold">{programmeLabel(enrollment.session_type || student.session_type)} · {enrollment.school_year || 'Année non renseignée'}</p>
                <p className="text-xs text-muted-foreground">{enrollment.level || 'Niveau à définir'} · {enrollment.status === 'Ended'
                  ? `Ancien groupe : ${groups.find(g => g.id === enrollment.ended_group_id)?.name || '—'}`
                  : enrollment.group_id ? groups.find(g => g.id === enrollment.group_id)?.name || 'Groupe affecté' : 'Groupe à affecter'}</p>
                <p className="text-xs">{displayLabel(ENROLLMENT_LABELS,enrollment.status)}{enrollment.status === 'Ended' && <> · {enrollment.end_reason || 'Motif non renseigné'}{enrollment.ended_at ? ` · ${new Date(enrollment.ended_at).toLocaleDateString('fr-FR', { timeZone: 'Africa/Casablanca' })}` : ''}</>}</p>
              </div>
              <div className="flex items-center gap-3">
                {isManagement && enrollment.status === 'Ended' && <button className="text-xs font-semibold text-primary hover:underline" onClick={() => reopen(enrollment)}>Rouvrir l’inscription</button>}
                <button disabled={!canManage || (role === 'receptionist' && enrollment.status === 'Ended')} className="text-xs font-semibold text-primary hover:underline disabled:hidden" onClick={() => setEnrollmentModal(enrollment)}>Modifier l’inscription</button>
              </div>
              {role === 'receptionist' && <div className="w-full flex flex-wrap items-center gap-2">
                {(enrollment.documents_urls || []).map((ref, index) => <button key={ref} type="button"
                  className="text-xs text-primary underline" onClick={() => openStoredFile(ref).catch(error => toast.error(error.message))}>
                  Document {index + 1}</button>)}
                <label className="text-xs text-primary underline cursor-pointer">Ajouter un document
                  <input type="file" accept="image/jpeg,image/png,application/pdf" className="hidden"
                    onChange={event => appendDocument(enrollment, event.target.files?.[0])} /></label>
              </div>}
            </div>
          ))}</div>
        )}
      </Section>
      {leaver && <LeaverDialog student={student} enrollments={enrollments} groups={groups} openBalance={paymentSummary.balance}
        onClose={() => setLeaver(false)} onDone={() => {
          setLeaver(false);
          queryClient.invalidateQueries({ queryKey: ['Student'] });
          queryClient.invalidateQueries({ queryKey: ['Enrollment'] });
          setReload(value => value + 1);
        }} />}
      {enrollmentModal && <EnrollmentModal key={enrollmentModal.id} enrollment={enrollmentModal} students={[student]} groups={groups}
        onClose={() => setEnrollmentModal(null)} onSave={() => {
          setEnrollmentModal(null);
          queryClient.invalidateQueries({ queryKey: ['Student'] });
          queryClient.invalidateQueries({ queryKey: ['Enrollment'] });
          setReload(value => value + 1);
        }} />}

      <Section title="Adultes autorisés au retrait">
        {adults.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun adulte autorisé.</p>
        ) : (
          <div className="space-y-2">
            {adults.map(a => (
              <div key={a.id} className="flex items-center justify-between p-3 bg-muted/40 rounded-md text-sm">
                <div>
                  <p className="font-medium">{a.full_name}</p>
                  <p className="text-xs text-muted-foreground">{a.relation} · {a.telephone}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title={`Paiements (${payments.length})`}>
        <p className="mb-3 text-xs text-muted-foreground">Le restant historique est le solde après ce paiement, à la date du reçu. Pour corriger ou annuler un reçu, contactez la direction.</p>
        <div className="flex justify-end mb-3">
          <Link data-touch-target href={`/receipts/new?student_id=${student.id}&student_name=${encodeURIComponent(student.full_name)}`} className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-md border border-border hover:bg-muted" style={{ color: 'var(--brand)' }}>
            <FileText size={12} /> Nouveau reçu
          </Link>
        </div>
        {payments.length === 0 ? (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Aucun paiement enregistré.</p>
          </div>
        ) : (
          <div role="region" tabIndex={0} aria-label="Tableau, défilement horizontal" className="max-w-full overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-muted-foreground border-b border-border">
              <th scope="col" className="pb-2">Reçu</th><th scope="col" className="pb-2">Date</th><th scope="col" className="pb-2">Total</th><th scope="col" className="pb-2">Payé</th><th scope="col" className="pb-2">Restant historique</th><th scope="col" className="pb-2">Statut</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {payments.map(p => {
                const amounts = receiptAmounts(p);
                const status = receiptStatus(p);
                return (
                <tr key={p.id}>
                  <td className="py-2"><ContextLink href={`/receipts/${p.id}/print`} className="inline-flex min-h-11 items-center text-primary font-medium hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary rounded">{p.receipt_number || `#${p.id.slice(-8).toUpperCase()}`}</ContextLink></td>
                  <td className="py-2">{p.date || '—'}</td>
                  <td className="py-2">
                    {money(amounts.net)} MAD
                  </td>
                  <td className="py-2">{money(amounts.payment)} MAD</td>
                  <td className="py-2">{money(amounts.balance)} MAD</td>
                  <td className="py-2"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${p.voided_at ? 'bg-rose-100 text-rose-700' : PAYMENT_STATUS_COLORS[status] || 'bg-yellow-100 text-yellow-700'}`}>{status}</span></td>
                </tr>
              );})}
            </tbody>
          </table></div>
        )}
      </Section>

      <Section title={`Notes & évaluations (${assessments.length})`}>
        {assessments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune évaluation.</p>
        ) : (
          <div role="region" tabIndex={0} aria-label="Tableau, défilement horizontal" className="max-w-full overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-muted-foreground border-b border-border">
              <th scope="col" className="pb-2">Terme</th><th scope="col" className="pb-2">Oral</th><th scope="col" className="pb-2">Écrit</th><th scope="col" className="pb-2">Devoirs</th><th scope="col" className="pb-2">Finale</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {assessments.map(a => (
                <tr key={a.id}>
                  <td className="py-2">{a.terme || '—'}</td>
                  <td className="py-2">{a.note_oral ?? '—'}</td>
                  <td className="py-2">{a.note_ecrit ?? '—'}</td>
                  <td className="py-2">{a.note_devoirs ?? '—'}</td>
                  <td className="py-2 font-semibold">{a.note_finale ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </Section>
      </ReadState>
    </PageFrame>
  );
}
