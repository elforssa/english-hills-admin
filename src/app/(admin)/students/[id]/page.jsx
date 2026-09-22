'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { entities, auth } from '@/lib/entities';
import { getBrowserClient } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import EnrollmentModal from '@/components/students/EnrollmentModal';
import { useQueryClient } from '@tanstack/react-query';
import StorageImage from '@/components/StorageImage';
import { ArrowLeft, Edit, FileText, Plus, Trash2, Crown, CalendarDays, Clock3 } from 'lucide-react';
import { toast } from 'sonner';
import { STUDENT_STATUS_COLORS, PAYMENT_STATUS_COLORS, PREMIUM_SESSION_STATUS_COLORS } from '@/lib/statusColors';
import { money, receiptAmounts, receiptStatus } from '@/lib/receiptFinance';
import { studentPaymentSummary } from '@/lib/studentPayment';

const PREMIUM_STATUS_LABELS = {
  Scheduled: 'Planifiée', Confirmed: 'Confirmée', Completed: 'Terminée',
  Cancelled: 'Annulée', Missed: 'Absence',
};

export default function StudentDetail() {
  const { role } = useAuth();
  const canManage = ['admin', 'director'].includes(role);
  const params = useParams();
  const id = params?.id;
  const router = useRouter();
  const queryClient = useQueryClient();
  const [enrollments, setEnrollments] = useState([]);
  const [groups, setGroups] = useState([]);
  const [enrollmentModal, setEnrollmentModal] = useState(null);
  const [student, setStudent] = useState(null);
  const [payments, setPayments] = useState([]);
  const [charges, setCharges] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [assessments, setAssessments] = useState([]);
  const [adults, setAdults] = useState([]);
  const [premiumSessions, setPremiumSessions] = useState([]);
  const [premiumMemberships, setPremiumMemberships] = useState([]);
  const [premiumGroups, setPremiumGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reload, setReload] = useState(0);

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
      entities.PremiumSession.listAll('-scheduled_date'),
      entities.PremiumMembership.filterAll({ student_id: id }, '-created_at'),
      entities.PremiumGroup.listAll('name'),
      getBrowserClient().from('charge_balances').select('*').eq('student_id', id),
      entities.Enrollment.filterAll({ student_id: id }, '-created_at'),
      entities.Group.listAll('name'),
    ]).then(([s, p, a, as_, adults, premium, memberships, premiumGroupRows, chargeResult, enrollmentRows, groupRows]) => {
      if (!active) return;
      if (chargeResult.error) throw chargeResult.error;
      setStudent(s[0]);
      setEnrollments(enrollmentRows);
      setGroups(groupRows);
      setPayments(p);
      setAttendance(a);
      setAssessments(as_);
      setAdults(adults);
      const sharedGroupIds = new Set(memberships.filter((item) => item.active).map((item) => item.premium_group_id));
      setPremiumSessions(premium.filter((item) => item.student_id === id || sharedGroupIds.has(item.premium_group_id)));
      setPremiumMemberships(memberships);
      setPremiumGroups(premiumGroupRows);
      setCharges(chargeResult.data || []);
    }).catch(() => { if (active) setLoadError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, reload]);

  const handleDelete = async () => {
    if (!confirm('Archiver cet apprenant ? Son historique sera conservé.')) return;
    const sb = getBrowserClient();
    const { error } = await sb.rpc('soft_delete_student', { p_student_id: id });
    if (error) { toast.error('Erreur : ' + error.message); return; }
    toast.success('Apprenant archivé');
    router.push('/students');
  };

  if (loading) return <div className="p-8 text-muted-foreground">Chargement...</div>;
  if (loadError) return <div className="p-8" role="alert">Impossible de charger la fiche complète. <button className="text-primary underline" onClick={() => setReload((value) => value + 1)}>Réessayer</button></div>;
  if (!student) return <div className="p-8 text-muted-foreground">Apprenant introuvable.</div>;

  const totalPaye = payments.reduce((sum, payment) => sum + (payment.voided_at ? 0 : Number(payment.montant_paye || 0)), 0);
  const paymentSummary = studentPaymentSummary(charges);
  const present = attendance.filter(a => a.status === 'Présent').length;
  const presenceRate = attendance.length ? Math.round((present / attendance.length) * 100) : null;

  const Section = ({ title, children }) => (
    <div className="bg-card border border-border rounded-lg overflow-hidden mb-5">
      <div className="px-5 py-3 border-b border-border bg-muted/30">
        <h3 className="font-semibold text-sm text-foreground">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );

  return (
    <div className="mx-auto max-w-5xl p-4 lg:p-8">
      <div className="mb-6 flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
        <button aria-label="Retour à la liste des apprenants" onClick={() => router.push('/students')} className="flex items-center gap-2 rounded-lg border border-border p-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
          <ArrowLeft size={15} />
        </button>
        <div className="w-12 h-12 rounded-full overflow-hidden bg-muted flex items-center justify-center flex-shrink-0">
          {student.photo_url
            // eslint-disable-next-line @next/next/no-img-element
            ? <StorageImage src={student.photo_url} alt="" className="w-full h-full object-cover" />
            : <span className="text-lg font-bold text-muted-foreground">{student.full_name?.[0] || '?'}</span>}
        </div>
        <div className="flex-1">
          <p className="text-xs font-bold uppercase tracking-widest text-primary">Fiche apprenant</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">{student.full_name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-xs font-medium px-2 py-1 rounded-full ${STUDENT_STATUS_COLORS[student.status]}`}>{student.status}</span>
            {student.plan_type === 'Premium' && <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full bg-amber-100 text-amber-800"><Crown size={12} /> Premium</span>}
          </div>
        </div>
        <Link href={`/students/${id}/edit`} className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-border rounded-md hover:bg-muted">
          <Edit size={14} /> Modifier
        </Link>
        <button onClick={handleDelete} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-md hover:bg-red-50">
          <Trash2 size={14} /> Supprimer
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-5">
        {[
          { label: 'Niveau', value: student.niveau_cefr || '—' },
          { label: 'Taux de présence', value: presenceRate !== null ? `${presenceRate}%` : '—' },
          { label: 'Solde restant', value: `${money(paymentSummary.balance)} MAD` },
        ].map(({ label, value }) => (
          <div key={label} className="bg-card border border-border rounded-lg p-4">
            <p className="text-xs text-muted-foreground mb-1">{label}</p>
            <p className="text-xl font-bold text-foreground">{value}</p>
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
                  {canManage && Number(charge.balance) > 0 && <Link href={`/receipts/new?student_id=${student.id}&charge_id=${charge.id}`} className="text-xs font-semibold text-primary hover:underline">Encaisser</Link>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Informations personnelles">
        <div className="grid grid-cols-2 gap-4 text-sm">
          {[
            ['Date de naissance', student.date_naissance],
            ['Téléphone', student.telephone],
            ['Email', student.email],
            ['Catégorie', student.age_category],
            ['Session', student.session_type],
            ['Comment connu le centre', student.referral_source || '—'],
          ].map(([label, val]) => (
            <div key={label}>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="font-medium">{val || '—'}</p>
            </div>
          ))}
          {student.notes && (
            <div className="col-span-2">
              <p className="text-xs text-muted-foreground">Notes</p>
              <p className="font-medium">{student.notes}</p>
            </div>
          )}
        </div>
      </Section>

      <Section title="Inscriptions et groupes">
        {student.groupe_id && <p className="mb-3 text-sm">Groupe du dossier : {groups.find(g => g.id === student.groupe_id)?.name || 'Groupe affecté'}</p>}
        {enrollments.length === 0 ? <p className="text-sm text-muted-foreground">Aucune inscription de session enregistrée. <Link href={`/students/${id}/edit`} className="text-primary underline">Modifier le groupe du dossier</Link></p> : (
          <div className="space-y-3">{enrollments.map(enrollment => (
            <div key={enrollment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm">
              <div><p className="font-semibold">{enrollment.session_type || student.session_type || 'Session'} · {enrollment.school_year || 'Année non renseignée'}</p>
                <p className="text-xs text-muted-foreground">{enrollment.level || 'Niveau à définir'} · {enrollment.group_id ? groups.find(g => g.id === enrollment.group_id)?.name || 'Groupe affecté' : 'Groupe à affecter'}</p>
                <p className="text-xs">{enrollment.status === 'Confirmed' ? 'Inscrit — groupe à affecter' : enrollment.status}</p>
              </div>
              <button disabled={!canManage} className="text-xs font-semibold text-primary hover:underline disabled:hidden" onClick={() => setEnrollmentModal(enrollment)}>Modifier l’inscription</button>
            </div>
          ))}</div>
        )}
      </Section>
      {enrollmentModal && <EnrollmentModal key={enrollmentModal.id} enrollment={enrollmentModal} students={[student]} groups={groups}
        onClose={() => setEnrollmentModal(null)} onSave={() => {
          setEnrollmentModal(null);
          queryClient.invalidateQueries({ queryKey: ['Student'] });
          queryClient.invalidateQueries({ queryKey: ['Enrollment'] });
          setReload(value => value + 1);
        }} />}

      {student.plan_type === 'Premium' && (
        <Section title="Programme Premium">
          <div className="mb-4 flex flex-col justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 sm:flex-row sm:items-center">
            <div>
              <p className="flex items-center gap-2 font-semibold text-primary"><Crown size={16} /> Un atelier partagé supplémentaire chaque week-end</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {student.premium_start_date ? `Du ${student.premium_start_date}` : 'Début non limité'}{student.premium_end_date ? ` au ${student.premium_end_date}` : ' · sans date de fin'}
                {premiumMemberships.find((item) => item.active) && ` · ${premiumGroups.find((group) => group.id === premiumMemberships.find((item) => item.active)?.premium_group_id)?.name || 'Atelier affecté'}`}
              </p>
            </div>
            <Link href="/premium-sessions" className="shrink-0 rounded-md bg-primary px-3 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90">Gérer les séances</Link>
          </div>
          {premiumSessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune heure Premium planifiée.</p>
          ) : (
            <div className="space-y-2">
              {premiumSessions.slice(0, 6).map((session) => (
                <div key={session.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2.5 text-sm">
                  <span className="flex items-center gap-2 font-medium"><CalendarDays size={14} className="text-muted-foreground" /> {session.scheduled_date}</span>
                  <span className="flex items-center gap-1 text-muted-foreground"><Clock3 size={13} /> {String(session.start_time).slice(0, 5)} · 60 min</span>
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full ${PREMIUM_SESSION_STATUS_COLORS[session.status]}`}>{PREMIUM_STATUS_LABELS[session.status]}</span>
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

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
        <div className="flex justify-end mb-3">
          <Link href={`/receipts/new?student_id=${student.id}&student_name=${encodeURIComponent(student.full_name)}`} className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-md border border-border hover:bg-muted" style={{ color: 'var(--brand)' }}>
            <FileText size={12} /> Nouveau reçu
          </Link>
        </div>
        {payments.length === 0 ? (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Aucun paiement enregistré.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-muted-foreground border-b border-border">
              <th className="pb-2">Date</th><th className="pb-2">Total</th><th className="pb-2">Payé</th><th className="pb-2">Restant</th><th className="pb-2">Statut</th><th className="pb-2"></th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {payments.map(p => {
                const amounts = receiptAmounts(p);
                const status = receiptStatus(p);
                return (
                <tr key={p.id}>
                  <td className="py-2">{p.date || '—'}</td>
                  <td className="py-2">
                    {money(amounts.net)} MAD
                  </td>
                  <td className="py-2">{money(amounts.payment)} MAD</td>
                  <td className="py-2">{money(amounts.balance)} MAD</td>
                  <td className="py-2"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${p.voided_at ? 'bg-rose-100 text-rose-700' : PAYMENT_STATUS_COLORS[status] || 'bg-yellow-100 text-yellow-700'}`}>{status}</span></td>
                  <td className="py-2"><Link href={`/receipts/${p.id}/print`} className="text-xs text-muted-foreground hover:text-primary"><FileText size={13} /></Link></td>
                </tr>
              );})}
            </tbody>
          </table>
        )}
      </Section>

      <Section title={`Notes & évaluations (${assessments.length})`}>
        {assessments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune évaluation.</p>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-muted-foreground border-b border-border">
              <th className="pb-2">Terme</th><th className="pb-2">Oral</th><th className="pb-2">Écrit</th><th className="pb-2">Devoirs</th><th className="pb-2">Finale</th>
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
          </table>
        )}
      </Section>
    </div>
  );
}
