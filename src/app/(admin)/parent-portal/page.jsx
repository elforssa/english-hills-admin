'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { entities, auth } from '@/lib/entities';
import { Download, Bell, ShieldCheck, Phone, RefreshCw, FileDown, MessageSquare } from 'lucide-react';
import { exportToCsv } from '@/utils/exportCsv';
import { resolveSignedUrl } from '@/lib/storage';
import { downloadReceiptPDF } from '@/lib/receiptPdf';
import { getOfficeRecipient } from '@/lib/centerInfo';
import { markMyNotificationsRead } from '@/lib/notifications';
import MessagesTab from '@/components/portals/MessagesTab';
import { PAYMENT_STATUS_COLORS, ATTENDANCE_STATUS_COLORS } from '@/lib/statusColors';

// Re-sign a stored "bucket/path" ref on demand (legacy full URLs open as-is).
async function openStoredFile(stored) {
  try {
    const url = await resolveSignedUrl(stored);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  } catch {
    toast.error('Impossible d’ouvrir le fichier.');
  }
}

const STATUS_COLORS = ATTENDANCE_STATUS_COLORS;
const PAY_COLORS = PAYMENT_STATUS_COLORS;

const NOTIF_TYPE_LABELS = {
  absence: 'Absence', payment_reminder: 'Rappel paiement', report_card: 'Bulletin',
  enrollment_confirmed: 'Inscription confirmée', schedule_change: 'Changement horaire',
  class_reminder: 'Rappel de cours', general: 'Général',
};

// Effective amount owed for a receipt after its percentage discount.
const effectiveTotal = (r) => (r.montant_total || 0) * (1 - (r.remise || 0) / 100);

export default function ParentPortal() {
  const [user, setUser] = useState(null);
  const [students, setStudents] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [attendance, setAttendance] = useState([]);
  const [assessments, setAssessments] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [portfolios, setPortfolios] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [learningAssessments, setLearningAssessments] = useState([]);
  const [authorizedAdults, setAuthorizedAdults] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [office, setOffice] = useState(null);
  const [reEnrolling, setReEnrolling] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');

  useEffect(() => {
    (async () => {
      try {
        const u = await auth.me();
        setUser(u);
        const allStudents = await entities.Student.list('full_name', 200);
        const myStudents = allStudents.filter(s => (s.parent_email && s.parent_email === u?.email) || (s.email && s.email === u?.email));
        setStudents(myStudents);
        if (myStudents.length > 0) setSelectedStudent(myStudents[0]);
        // RLS scopes announcements to what this parent may see (audience 'all',
        // 'parents', and their child's group).
        const ann = await entities.Announcement.list('-created_date', 20);
        setAnnouncements(ann);
        // Personal notifications addressed to this parent (RLS scopes by email).
        entities.Notification.filter({ recipient_email: u?.email }, '-created_date', 50)
          .then(setNotifications).catch(() => {});
        // Unread direct messages — drives the tab badge.
        entities.Message.filter({ to_user_email: u?.email, read: false })
          .then(rows => setUnreadMessages(rows.length)).catch(() => {});
        // Teachers are messaging recipients; the office is added separately.
        entities.Teacher.list('full_name', 100).then(setTeachers).catch(() => {});
        getOfficeRecipient().then(setOffice).catch(() => {});
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[parent-portal] initial load failed:', err);
        toast.error('Impossible de charger votre espace. Veuillez réessayer.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedStudent) return;
    Promise.all([
      entities.Attendance.filter({ student_id: selectedStudent.id }, '-session_date'),
      entities.Assessment.filter({ student_id: selectedStudent.id }, '-created_date'),
      entities.Receipt.filter({ student_id: selectedStudent.id }, '-date'),
      entities.Portfolio.filter({ student_id: selectedStudent.id }),
      entities.LearningAssessment.filter({ student_id: selectedStudent.id }, '-date_assessment'),
      entities.AuthorizedAdult.filter({ student_id: selectedStudent.id }),
    ])
      .then(([att, ass, rec, port, la, adults]) => {
        setAttendance(att); setAssessments(ass); setReceipts(rec);
        setPortfolios(port); setLearningAssessments(la); setAuthorizedAdults(adults);
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error('[parent-portal] student detail load failed:', err);
        toast.error('Impossible de charger les données de l’apprenant.');
        setAttendance([]); setAssessments([]); setReceipts([]); setPortfolios([]); setLearningAssessments([]); setAuthorizedAdults([]);
      });
  }, [selectedStudent]);

  // Mark notifications read when the tab is opened, then clear the badge.
  useEffect(() => {
    if (tab !== 'notifications') return;
    if (!notifications.some(n => !n.read_at)) return;
    markMyNotificationsRead().then(() => {
      setNotifications(prev => prev.map(n => (n.read_at ? n : { ...n, read_at: new Date().toISOString() })));
    });
  }, [tab, notifications]);

  const handleReEnroll = async () => {
    if (!selectedStudent) return;
    if (!confirm(`Envoyer une demande de réinscription pour ${selectedStudent.full_name} ? Le centre vous recontactera pour finaliser.`)) return;
    setReEnrolling(true);
    try {
      await entities.Enrollment.create({
        student_id: selectedStudent.id,
        status: 'Submitted',
        date_inscription: new Date().toISOString().split('T')[0],
        notes: `Demande de réinscription envoyée par le parent (${user?.email}).`,
      });
      toast.success('Demande de réinscription envoyée. Le centre vous recontactera.');
    } catch {
      // entities.js already toasted
    } finally {
      setReEnrolling(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4 lg:p-8 max-w-5xl mx-auto animate-pulse">
        <div className="h-6 w-48 bg-muted rounded mb-2" />
        <div className="h-3 w-64 bg-muted/70 rounded mb-6" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-lg p-3 h-16" />
          ))}
        </div>
        <div className="bg-card border border-border rounded-lg p-8 h-64" />
      </div>
    );
  }

  // No learner is linked to this parent's email — give clear guidance instead
  // of a silent empty portal.
  if (students.length === 0) {
    return (
      <div className="p-4 lg:p-8 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">Espace Parents</h1>
        <p className="text-muted-foreground text-sm mb-6">Bienvenue, {user?.full_name}</p>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
          <p className="font-semibold text-amber-800 mb-2">Aucun apprenant lié à votre compte</p>
          <p className="text-sm text-amber-800/90">
            Nous n’avons trouvé aucun apprenant rattaché à l’adresse <strong>{user?.email}</strong>.
            Cela arrive généralement lorsque l’email enregistré au centre est différent de celui
            utilisé pour vous connecter.
          </p>
          <p className="text-sm text-amber-800/90 mt-3">
            Merci de contacter l’administration
            {office?.email ? <> à <a className="font-semibold underline" href={`mailto:${office.email}`}>{office.email}</a></> : null}
            {' '}pour mettre à jour votre dossier.
          </p>
        </div>
      </div>
    );
  }

  const presentCount = attendance.filter(a => a.status === 'Présent').length;
  const absentCount = attendance.filter(a => a.status === 'Absent').length;
  const attendanceRate = attendance.length > 0 ? Math.round((presentCount / attendance.length) * 100) : 0;
  const isYoungLearner = selectedStudent?.age_category === 'Young Learners (6-12)';

  // Outstanding balance across the selected child's receipts.
  const balanceDue = receipts.reduce((s, r) => s + Math.max(0, effectiveTotal(r) - (r.montant_paye || 0)), 0);

  // Recipients: each teacher + the front office (so parents can reach reception).
  const recipients = [
    ...teachers.filter(t => t.email).map(t => ({ email: t.email, name: t.full_name })),
    ...(office ? [office] : []),
  ];

  const TABS = [
    { id: 'overview', label: "Vue d'ensemble" },
    { id: 'attendance', label: 'Présences' },
    { id: 'grades', label: 'Notes' },
    { id: 'finance', label: 'Paiements' },
    { id: 'portfolio', label: 'Portfolio' },
    { id: 'learning', label: "Style d'apprentissage" },
    ...(isYoungLearner ? [{ id: 'pickup', label: 'Sortie / Pickup' }] : []),
    { id: 'notifications', label: 'Notifications', badge: notifications.filter(n => !n.read_at).length },
    { id: 'messages', label: 'Messages', badge: unreadMessages },
  ];

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Espace Parents</h1>
          <p className="text-muted-foreground text-sm mt-1">Bienvenue, {user?.full_name}</p>
        </div>
        {selectedStudent && (
          <button
            onClick={() => {
              const rows = [
                ...attendance.map(a => ({ Type: 'Présence', Date: a.session_date, Détail: a.status, Note: '' })),
                ...assessments.map(a => ({ Type: 'Note', Date: a.terme, Détail: `Finale: ${a.note_finale ?? '—'}/20`, Note: a.commentaire || '' })),
                ...receipts.map(r => ({ Type: 'Paiement', Date: r.date, Détail: r.statut_paiement, Note: `${(r.montant_paye || 0).toLocaleString('fr-MA')} MAD` })),
              ];
              exportToCsv(rows, `bilan-${selectedStudent.full_name}-${new Date().toISOString().slice(0,10)}.csv`);
            }}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium border border-border rounded-md hover:bg-muted"
          >
            <Download size={14} /> Télécharger le bilan
          </button>
        )}
      </div>

      {students.length > 1 && (
        <div className="mb-5">
          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Apprenant</label>
          <select className="border border-border rounded-md px-3 py-2 text-sm bg-white" value={selectedStudent?.id || ''} onChange={e => setSelectedStudent(students.find(s => s.id === e.target.value))}>
            {students.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </select>
        </div>
      )}

      {announcements.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-5">
          <p className="text-xs font-semibold text-amber-700 mb-2">ANNONCES</p>
          {announcements.slice(0, 2).map(a => (
            <div key={a.id} className="mb-1">
              <p className="text-sm font-semibold">{a.title}</p>
              <p className="text-xs text-amber-800">{a.body}</p>
            </div>
          ))}
        </div>
      )}

      {/* Mobile (≤sm): a native <select> is far easier to use than a horizontal
          scroll bar full of long French labels. Desktop keeps the tab bar. */}
      <div className="sm:hidden mb-6">
        <label htmlFor="parent-tab-mobile" className="sr-only">Section</label>
        <select
          id="parent-tab-mobile"
          value={tab}
          onChange={(e) => setTab(e.target.value)}
          className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-white"
        >
          {TABS.map((t) => (
            <option key={t.id} value={t.id}>{t.label}{t.badge ? ` (${t.badge})` : ''}</option>
          ))}
        </select>
      </div>
      <div className="hidden sm:flex gap-1 border border-border rounded-lg p-1 bg-muted w-full overflow-x-auto mb-6" role="tablist">
        {TABS.map(t => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap inline-flex items-center gap-1.5 ${tab === t.id ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {t.label}
            {t.badge > 0 && (
              <span className="inline-flex items-center justify-center text-[10px] font-bold text-white bg-primary rounded-full min-w-4 h-4 px-1">
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'overview' && selectedStudent && (
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0 bg-primary">
                  {selectedStudent.full_name?.[0]}
                </div>
                <div>
                  <p className="font-bold text-lg">{selectedStudent.full_name}</p>
                  <p className="text-muted-foreground text-sm">{selectedStudent.age_category} · Niveau {selectedStudent.niveau_cefr || '—'}</p>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">{selectedStudent.status}</span>
                </div>
              </div>
              <button
                onClick={handleReEnroll}
                disabled={reEnrolling}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium border border-border rounded-md hover:bg-muted disabled:opacity-50 self-start"
              >
                <RefreshCw size={14} /> {reEnrolling ? 'Envoi…' : 'Demander une réinscription'}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Taux de présence', value: `${attendanceRate}%`, color: '#059669' },
              { label: 'Absences', value: absentCount, color: '#B91C2E' },
              { label: 'Notes enregistrées', value: assessments.length, color: 'var(--brand)' },
              { label: 'Solde dû', value: `${balanceDue.toLocaleString('fr-MA')} MAD`, color: balanceDue > 0 ? '#B91C2E' : '#059669' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-card border border-border rounded-lg p-3 text-center">
                <p className="text-xl font-bold" style={{ color }}>{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'attendance' && (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-2 border-b border-border text-xs text-muted-foreground">
            {attendance.length} séance{attendance.length > 1 ? 's' : ''} enregistrée{attendance.length > 1 ? 's' : ''}
          </div>
          <div className="divide-y divide-border max-h-[60vh] overflow-y-auto">
            {attendance.map(a => (
              <div key={a.id} className="flex items-center justify-between px-4 py-3">
                <p className="text-sm">{a.session_date}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[a.status] || 'bg-gray-100 text-gray-500'}`}>{a.status}</span>
              </div>
            ))}
            {attendance.length === 0 && <div className="p-8 text-center text-muted-foreground text-sm">Aucune donnée de présence.</div>}
          </div>
        </div>
      )}

      {tab === 'grades' && (
        <div className="space-y-3">
          {assessments.map(a => (
            <div key={a.id} className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="font-semibold text-sm">{a.terme}</p>
                <span className="text-lg font-bold" style={{ color: 'var(--brand)' }}>{a.note_finale ?? '—'}/20</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                <span>Oral: {a.note_oral ?? '—'}</span>
                <span>Écrit: {a.note_ecrit ?? '—'}</span>
                <span>Devoirs: {a.note_devoirs ?? '—'}</span>
              </div>
              {a.commentaire && <p className="text-xs text-muted-foreground mt-2 italic">{a.commentaire}</p>}
            </div>
          ))}
          {assessments.length === 0 && <div className="p-8 text-center text-muted-foreground text-sm">Aucune note disponible.</div>}
        </div>
      )}

      {tab === 'finance' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-card border border-border rounded-lg p-4">
            <div>
              <p className="text-xs text-muted-foreground">Solde restant dû</p>
              <p className={`text-xl font-bold ${balanceDue > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                {balanceDue.toLocaleString('fr-MA')} MAD
              </p>
            </div>
            <button
              onClick={() => setTab('messages')}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium border border-border rounded-md hover:bg-muted self-start"
            >
              <MessageSquare size={14} /> Question / paiement à l’administration
            </button>
          </div>
          <div className="bg-card border border-border rounded-lg overflow-hidden divide-y divide-border">
            {receipts.map(r => (
              <div key={r.id} className="flex items-center justify-between px-4 py-3 gap-3">
                <div>
                  <p className="text-sm font-medium">{r.date}{r.receipt_number ? ` · ${r.receipt_number}` : ''}</p>
                  <p className="text-xs text-muted-foreground">{r.mode_paiement}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-sm font-bold">{(r.montant_paye || 0).toLocaleString('fr-MA')} MAD</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PAY_COLORS[r.statut_paiement] || 'bg-gray-100 text-gray-500'}`}>{r.statut_paiement || '—'}</span>
                  </div>
                  <button
                    onClick={() => downloadReceiptPDF(r)}
                    title="Télécharger le reçu (PDF)"
                    className="p-2 rounded-md border border-border hover:bg-muted text-muted-foreground"
                  >
                    <FileDown size={14} />
                  </button>
                </div>
              </div>
            ))}
            {receipts.length === 0 && <div className="p-8 text-center text-muted-foreground text-sm">Aucun paiement enregistré.</div>}
          </div>
        </div>
      )}

      {tab === 'portfolio' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {portfolios.filter(p => p.visible_to_parent).map(p => (
            <div key={p.id} className="bg-card border border-border rounded-xl p-4">
              <p className="font-semibold text-sm">{p.title}</p>
              <p className="text-xs text-muted-foreground">{p.project_type} · {p.terme} {p.annee}</p>
              {p.file_url && <button type="button" onClick={() => openStoredFile(p.file_url)} className="text-xs font-medium mt-2 inline-block" style={{ color: 'var(--brand)' }}>Voir le fichier →</button>}
              {p.teacher_note && <p className="text-xs text-muted-foreground mt-2 italic">&quot;{p.teacher_note}&quot;</p>}
            </div>
          ))}
          {portfolios.filter(p => p.visible_to_parent).length === 0 && <div className="col-span-2 p-8 text-center text-muted-foreground text-sm">Aucun projet portfolio.</div>}
        </div>
      )}

      {tab === 'learning' && (
        <div className="space-y-4">
          {learningAssessments.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm bg-card border border-border rounded-lg">Aucune évaluation de style d&apos;apprentissage.</div>
          ) : learningAssessments.map(la => (
            <div key={la.id} className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-semibold">{la.date_assessment}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Évaluation Kolb + Intelligences multiples</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mb-3">
                {la.kolb_style && <span className="text-xs px-3 py-1 rounded-full font-medium bg-purple-50 text-purple-700">Kolb: {la.kolb_style}</span>}
                {la.dominant_intelligence && <span className="text-xs px-3 py-1 rounded-full font-medium bg-blue-50 text-blue-700">Intelligence dominante: {la.dominant_intelligence}</span>}
              </div>
              {la.intelligences && (
                <div className="space-y-1.5 mt-3">
                  {Object.entries(la.intelligences).sort((a,b) => b[1]-a[1]).slice(0, 4).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-44 flex-shrink-0">{k}</span>
                      <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
                        <div className="h-1.5 rounded-full bg-primary" style={{ width: `${Math.min(100, v * 10)}%` }} />
                      </div>
                      <span className="text-xs font-bold w-4">{v}</span>
                    </div>
                  ))}
                </div>
              )}
              {la.teacher_notes && <p className="text-xs text-muted-foreground mt-3 italic">&quot;{la.teacher_notes}&quot;</p>}
            </div>
          ))}
        </div>
      )}

      {tab === 'pickup' && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800 flex items-start gap-2">
            <ShieldCheck size={16} className="mt-0.5 flex-shrink-0" />
            <p>
              Personnes autorisées à récupérer <strong>{selectedStudent?.full_name}</strong> à la sortie.
              Pour ajouter ou retirer une personne, contactez l’administration.
            </p>
          </div>
          <div className="bg-card border border-border rounded-lg overflow-hidden divide-y divide-border">
            {authorizedAdults.map(p => (
              <div key={p.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{p.full_name}</p>
                  <p className="text-xs text-muted-foreground">{p.relation}</p>
                </div>
                {p.telephone && (
                  <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                    <Phone size={12} /> {p.telephone}
                  </span>
                )}
              </div>
            ))}
            {authorizedAdults.length === 0 && (
              <div className="p-8 text-center text-muted-foreground text-sm">
                Aucune personne autorisée enregistrée. Contactez l’administration pour en ajouter.
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'notifications' && (
        <div className="bg-card border border-border rounded-lg overflow-hidden divide-y divide-border">
          {notifications.map(n => (
            <div key={n.id} className="px-4 py-3">
              <div className="flex items-center justify-between gap-3 mb-1">
                <p className="text-sm font-semibold">{n.subject}</p>
                <span className="text-xs text-muted-foreground flex-shrink-0">{(n.created_date || '').slice(0, 10)}</span>
              </div>
              <p className="text-xs text-muted-foreground mb-1">{NOTIF_TYPE_LABELS[n.type] || n.type}</p>
              <p className="text-sm text-foreground/90 whitespace-pre-wrap">{n.message}</p>
            </div>
          ))}
          {notifications.length === 0 && (
            <div className="p-10 text-center text-muted-foreground text-sm flex flex-col items-center gap-2">
              <Bell size={20} className="opacity-40" />
              Aucune notification pour le moment.
            </div>
          )}
        </div>
      )}

      {tab === 'messages' && (
        <MessagesTab
          me={{ email: user?.email, name: user?.full_name }}
          recipients={recipients}
        />
      )}

    </div>
  );
}
