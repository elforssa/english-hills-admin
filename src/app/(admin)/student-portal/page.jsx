'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { entities, auth, integrations } from '@/lib/entities';
import { Bell, Upload, Download } from 'lucide-react';
import { resolveSignedUrl } from '@/lib/storage';
import { exportToCsv } from '@/utils/exportCsv';
import { getOfficeRecipient } from '@/lib/centerInfo';
import { markMyNotificationsRead } from '@/lib/notifications';
import MessagesTab from '@/components/portals/MessagesTab';

// Re-sign a stored "bucket/path" ref on demand (legacy full URLs open as-is).
async function openStoredFile(stored) {
  try {
    const url = await resolveSignedUrl(stored);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  } catch {
    /* swallow — rare; the link simply won't open */
  }
}

const STATUS_COLORS = {
  'Présent': 'bg-green-100 text-green-700', 'Absent': 'bg-red-100 text-red-700',
  'Retard': 'bg-yellow-100 text-yellow-700', 'Justifié': 'bg-blue-100 text-blue-700',
};

const NOTIF_TYPE_LABELS = {
  absence: 'Absence', payment_reminder: 'Rappel paiement', report_card: 'Bulletin',
  enrollment_confirmed: 'Inscription confirmée', schedule_change: 'Changement horaire',
  class_reminder: 'Rappel de cours', general: 'Général',
};

const PROJECT_TYPES = ['Oral Presentation', 'Written Essay', 'Audio Recording', 'Video Project', 'PDF Document', 'Other'];

const KOLB_COLORS = {
  Diverging: 'bg-purple-50 text-purple-700', Assimilating: 'bg-blue-50 text-blue-700',
  Converging: 'bg-green-50 text-green-700', Accommodating: 'bg-orange-50 text-orange-700',
};

export default function StudentPortal() {
  const [user, setUser] = useState(null);
  const [student, setStudent] = useState(null);
  const [attendance, setAttendance] = useState([]);
  const [assessments, setAssessments] = useState([]);
  const [portfolios, setPortfolios] = useState([]);
  const [learning, setLearning] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [office, setOffice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('progress');
  // Portfolio upload form state
  const [pfTitle, setPfTitle] = useState('');
  const [pfType, setPfType] = useState('Other');
  const [pfUploading, setPfUploading] = useState(false);

  const loadPortfolios = (sid) =>
    entities.Portfolio.filter({ student_id: sid })
      .then(rows => setPortfolios(rows.filter(p => p.visible_to_student)))
      .catch(() => {});

  useEffect(() => {
    auth.me().then(async (u) => {
      setUser(u);
      const allStudents = await entities.Student.list('full_name', 200);
      const me = allStudents.find(s => s.email === u?.email);
      setStudent(me || null);
      if (me) {
        const [att, ass, la] = await Promise.all([
          entities.Attendance.filter({ student_id: me.id }, '-session_date'),
          entities.Assessment.filter({ student_id: me.id }, '-created_date'),
          entities.LearningAssessment.filter({ student_id: me.id }, '-date_assessment'),
        ]);
        setAttendance(att); setAssessments(ass); setLearning(la);
        loadPortfolios(me.id);
      }
      // RLS scopes announcements to what this student may see.
      const ann = await entities.Announcement.list('-created_date', 20);
      setAnnouncements(ann);
      entities.Notification.filter({ recipient_email: u?.email }, '-created_date', 50)
        .then(setNotifications).catch(() => {});
      entities.Message.filter({ to_user_email: u?.email, read: false })
        .then(rows => setUnreadMessages(rows.length)).catch(() => {});
      entities.Teacher.list('full_name', 100).then(setTeachers).catch(() => {});
      getOfficeRecipient().then(setOffice).catch(() => {});
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  // Mark notifications read when the tab is opened, then clear the badge.
  useEffect(() => {
    if (tab !== 'notifications') return;
    if (!notifications.some(n => !n.read_at)) return;
    markMyNotificationsRead().then(() => {
      setNotifications(prev => prev.map(n => (n.read_at ? n : { ...n, read_at: new Date().toISOString() })));
    });
  }, [tab, notifications]);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !student) return;
    if (!pfTitle.trim()) { toast.error('Donnez un titre à votre projet avant de téléverser.'); e.target.value = ''; return; }
    setPfUploading(true);
    try {
      const { file_url, file_name } = await integrations.Core.UploadFile({ file, bucket: 'portfolios' });
      await entities.Portfolio.create({
        student_id: student.id,
        student_name: student.full_name,
        title: pfTitle.trim(),
        project_type: pfType,
        file_url,
        file_name,
        visible_to_student: true,
      });
      toast.success('Projet ajouté à votre portfolio');
      setPfTitle('');
      setPfType('Other');
      loadPortfolios(student.id);
    } catch {
      // integrations / entities already toasted
    } finally {
      setPfUploading(false);
      e.target.value = '';
    }
  };

  if (loading) return <div className="p-8 text-center text-muted-foreground text-sm">Chargement...</div>;

  // No student record is linked to this login email — explain rather than show
  // an empty portal.
  if (!student) {
    return (
      <div className="p-4 lg:p-8 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">Mon espace</h1>
        <p className="text-muted-foreground text-sm mb-6">Bienvenue, {user?.full_name}</p>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
          <p className="font-semibold text-amber-800 mb-2">Aucun dossier apprenant lié à votre compte</p>
          <p className="text-sm text-amber-800/90">
            Nous n’avons trouvé aucun dossier rattaché à <strong>{user?.email}</strong>.
            L’email enregistré au centre est peut-être différent de celui utilisé pour vous connecter.
          </p>
          <p className="text-sm text-amber-800/90 mt-3">
            Merci de contacter l’administration
            {office?.email ? <> à <a className="font-semibold underline" href={`mailto:${office.email}`}>{office.email}</a></> : null}.
          </p>
        </div>
      </div>
    );
  }

  const presentCount = attendance.filter(a => a.status === 'Présent').length;
  const rate = attendance.length > 0 ? Math.round((presentCount / attendance.length) * 100) : 0;
  const lastAssessment = assessments[0];

  const recipients = [
    ...teachers.filter(t => t.email).map(t => ({ email: t.email, name: t.full_name })),
    ...(office ? [office] : []),
  ];

  const TABS = [
    { id: 'progress', label: 'Ma progression' },
    { id: 'attendance', label: 'Présences' },
    { id: 'portfolio', label: 'Portfolio' },
    { id: 'learning', label: "Mon style d'apprentissage" },
    { id: 'notifications', label: 'Notifications', badge: notifications.filter(n => !n.read_at).length },
    { id: 'messages', label: 'Messages', badge: unreadMessages },
  ];

  const exportBilan = () => {
    const rows = [
      ...attendance.map(a => ({ Type: 'Présence', Date: a.session_date, Détail: a.status, Note: '' })),
      ...assessments.map(a => ({ Type: 'Note', Date: a.terme, Détail: `Finale: ${a.note_finale ?? '—'}/20`, Note: a.commentaire || '' })),
    ];
    exportToCsv(rows, `bilan-${student.full_name}-${new Date().toISOString().slice(0,10)}.csv`);
  };

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Mon espace</h1>
          <p className="text-muted-foreground text-sm mt-1">Bienvenue, {user?.full_name}</p>
        </div>
        <button
          onClick={exportBilan}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium border border-border rounded-md hover:bg-muted self-start"
        >
          <Download size={14} /> Télécharger mon bilan
        </button>
      </div>

      {announcements.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-5">
          <p className="text-xs font-semibold text-blue-700 mb-1">ANNONCES</p>
          {announcements.slice(0, 2).map(a => (
            <div key={a.id}><p className="text-sm font-semibold">{a.title}</p><p className="text-xs text-blue-800">{a.body}</p></div>
          ))}
        </div>
      )}

      <div className="bg-card border border-border rounded-xl p-5 mb-5 flex items-center gap-4">
        <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0 bg-primary">
          {student.full_name?.[0]}
        </div>
        <div>
          <p className="font-bold">{student.full_name}</p>
          <p className="text-sm text-muted-foreground">Niveau {student.niveau_cefr || '—'} · {student.age_category}</p>
        </div>
      </div>

      <div className="flex gap-1 border border-border rounded-lg p-1 bg-muted w-full overflow-x-auto mb-6">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`px-3 py-2 text-sm font-medium rounded-md transition-all whitespace-nowrap inline-flex items-center gap-1.5 ${tab === t.id ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
            {t.label}
            {t.badge > 0 && (
              <span className="inline-flex items-center justify-center text-[10px] font-bold text-white bg-primary rounded-full min-w-4 h-4 px-1">{t.badge}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'progress' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="bg-card border border-border rounded-lg p-4 text-center">
              <p className="text-2xl font-bold" style={{ color: '#059669' }}>{rate}%</p>
              <p className="text-xs text-muted-foreground">Présence</p>
            </div>
            <div className="bg-card border border-border rounded-lg p-4 text-center">
              <p className="text-2xl font-bold" style={{ color: 'var(--brand)' }}>{lastAssessment?.note_finale ?? '—'}</p>
              <p className="text-xs text-muted-foreground">Dernière note /20</p>
            </div>
            <div className="bg-card border border-border rounded-lg p-4 text-center">
              <p className="text-2xl font-bold" style={{ color: '#7c3aed' }}>{portfolios.length}</p>
              <p className="text-xs text-muted-foreground">Projets</p>
            </div>
          </div>
          {assessments.length > 0 && (
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-border"><p className="font-semibold text-sm">Mes notes</p></div>
              <div className="divide-y divide-border">
                {assessments.map(a => (
                  <div key={a.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm font-medium">{a.terme}</p>
                      <p className="text-xs text-muted-foreground">Oral: {a.note_oral ?? '—'} · Écrit: {a.note_ecrit ?? '—'} · Devoirs: {a.note_devoirs ?? '—'}</p>
                    </div>
                    <p className="font-bold" style={{ color: 'var(--brand)' }}>{a.note_finale ?? '—'}/20</p>
                  </div>
                ))}
              </div>
            </div>
          )}
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

      {tab === 'portfolio' && (
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="font-semibold text-sm mb-3">Ajouter un projet</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <input
                value={pfTitle}
                onChange={e => setPfTitle(e.target.value)}
                placeholder="Titre du projet"
                maxLength={120}
                className="w-full border border-border rounded-md px-3 py-2 text-sm bg-white"
              />
              <select value={pfType} onChange={e => setPfType(e.target.value)} className="w-full border border-border rounded-md px-3 py-2 text-sm bg-white">
                {PROJECT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <label className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-md cursor-pointer ${pfUploading ? 'bg-muted text-muted-foreground' : 'bg-primary text-white hover:opacity-90'}`}>
              <Upload size={14} /> {pfUploading ? 'Téléversement…' : 'Téléverser un fichier'}
              <input type="file" className="hidden" onChange={handleUpload} disabled={pfUploading} accept="application/pdf,image/*,audio/*,video/*" />
            </label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {portfolios.map(p => (
              <div key={p.id} className="bg-card border border-border rounded-xl p-4">
                <p className="font-semibold text-sm">{p.title}</p>
                <p className="text-xs text-muted-foreground">{p.project_type} · {p.terme} {p.annee}</p>
                {p.file_url && <button type="button" onClick={() => openStoredFile(p.file_url)} className="text-xs font-medium mt-2 inline-block" style={{ color: 'var(--brand)' }}>Voir →</button>}
                {p.teacher_note && <p className="text-xs text-muted-foreground mt-2 italic">&quot;{p.teacher_note}&quot;</p>}
              </div>
            ))}
            {portfolios.length === 0 && <div className="col-span-2 p-8 text-center text-muted-foreground text-sm">Aucun projet portfolio.</div>}
          </div>
        </div>
      )}

      {tab === 'learning' && (
        <div className="space-y-4">
          {learning.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm bg-card border border-border rounded-lg">Aucune évaluation de style d&apos;apprentissage.</div>
          ) : learning.map(la => (
            <div key={la.id} className="bg-card border border-border rounded-xl p-5">
              <p className="font-semibold">{la.date_assessment}</p>
              <p className="text-xs text-muted-foreground mt-0.5 mb-3">Évaluation Kolb + Intelligences multiples</p>
              <div className="flex flex-wrap gap-2 mb-3">
                {la.kolb_style && <span className={`text-xs px-3 py-1 rounded-full font-medium ${KOLB_COLORS[la.kolb_style] || 'bg-purple-50 text-purple-700'}`}>Kolb: {la.kolb_style}</span>}
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
