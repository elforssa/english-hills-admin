'use client';

import { useEffect, useState } from 'react';
import { entities, auth } from '@/lib/entities';
import { BookOpen, CreditCard, GraduationCap, MessageSquare, FileText } from 'lucide-react';
import MessagesTab from '@/components/portals/MessagesTab';

const STATUS_COLORS = {
  'Présent': 'bg-green-100 text-green-700', 'Absent': 'bg-red-100 text-red-700',
  'Retard': 'bg-yellow-100 text-yellow-700', 'Justifié': 'bg-blue-100 text-blue-700',
};
const PAY_COLORS = {
  'Soldé': 'bg-green-100 text-green-700', 'En attente': 'bg-blue-100 text-blue-700',
  'En retard': 'bg-red-100 text-red-700', 'Acompte versé': 'bg-amber-100 text-amber-700',
};

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
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');

  useEffect(() => {
    auth.me().then(async (u) => {
      setUser(u);
      const allStudents = await entities.Student.list('full_name', 200);
      const myStudents = allStudents.filter(s => s.parent_email === u?.email || s.email === u?.email);
      setStudents(myStudents);
      if (myStudents.length > 0) setSelectedStudent(myStudents[0]);
      const [annParents, annAll] = await Promise.all([
        entities.Announcement.filter({ audience: 'parents' }),
        entities.Announcement.filter({ audience: 'all' }),
      ]);
      const seen = new Set();
      const ann = [...annParents, ...annAll].filter(a => seen.has(a.id) ? false : seen.add(a.id));
      setAnnouncements(ann);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedStudent) return;
    Promise.all([
      entities.Attendance.filter({ student_id: selectedStudent.id }),
      entities.Assessment.filter({ student_id: selectedStudent.id }),
      entities.Receipt.filter({ student_id: selectedStudent.id }),
      entities.Portfolio.filter({ student_id: selectedStudent.id }),
      entities.LearningAssessment.filter({ student_id: selectedStudent.id }),
    ]).then(([att, ass, rec, port, la]) => {
      setAttendance(att); setAssessments(ass); setReceipts(rec); setPortfolios(port); setLearningAssessments(la);
    });
  }, [selectedStudent]);

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

  const presentCount = attendance.filter(a => a.status === 'Présent').length;
  const absentCount = attendance.filter(a => a.status === 'Absent').length;
  const attendanceRate = attendance.length > 0 ? Math.round((presentCount / attendance.length) * 100) : 0;

  const TABS = [
    { id: 'overview', label: "Vue d'ensemble" },
    { id: 'attendance', label: 'Présences' },
    { id: 'grades', label: 'Notes' },
    { id: 'finance', label: 'Paiements' },
    { id: 'portfolio', label: 'Portfolio' },
    { id: 'learning', label: "Style d'apprentissage" },
    { id: 'messages', label: 'Messages' },
  ];

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Espace Parents</h1>
        <p className="text-muted-foreground text-sm mt-1">Bienvenue, {user?.full_name}</p>
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

      <div className="flex gap-1 border border-border rounded-lg p-1 bg-muted w-full overflow-x-auto mb-6">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap ${tab === t.id ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && selectedStudent && (
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0" style={{ backgroundColor: '#1E4D8B' }}>
                {selectedStudent.full_name?.[0]}
              </div>
              <div>
                <p className="font-bold text-lg">{selectedStudent.full_name}</p>
                <p className="text-muted-foreground text-sm">{selectedStudent.age_category} · Niveau {selectedStudent.niveau_cefr || '—'}</p>
                <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">{selectedStudent.status}</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Taux de présence', value: `${attendanceRate}%`, color: '#059669' },
              { label: 'Absences', value: absentCount, color: '#B91C2E' },
              { label: 'Notes enregistrées', value: assessments.length, color: '#1E4D8B' },
              { label: 'Projets portfolio', value: portfolios.length, color: '#7c3aed' },
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
          <div className="divide-y divide-border">
            {attendance.slice(0, 30).map(a => (
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
                <span className="text-lg font-bold" style={{ color: '#1E4D8B' }}>{a.note_finale ?? '—'}/20</span>
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
        <div className="bg-card border border-border rounded-lg overflow-hidden divide-y divide-border">
          {receipts.map(r => (
            <div key={r.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium">{r.date}</p>
                <p className="text-xs text-muted-foreground">{r.mode_paiement}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold">{(r.montant_paye || 0).toLocaleString('fr-MA')} MAD</p>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PAY_COLORS[r.statut_paiement] || 'bg-gray-100 text-gray-500'}`}>{r.statut_paiement || '—'}</span>
              </div>
            </div>
          ))}
          {receipts.length === 0 && <div className="p-8 text-center text-muted-foreground text-sm">Aucun paiement enregistré.</div>}
        </div>
      )}

      {tab === 'portfolio' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {portfolios.filter(p => p.visible_to_parent).map(p => (
            <div key={p.id} className="bg-card border border-border rounded-xl p-4">
              <p className="font-semibold text-sm">{p.title}</p>
              <p className="text-xs text-muted-foreground">{p.project_type} · {p.terme} {p.annee}</p>
              {p.file_url && <a href={p.file_url} target="_blank" rel="noreferrer" className="text-xs font-medium mt-2 inline-block" style={{ color: '#1E4D8B' }}>Voir le fichier →</a>}
              {p.teacher_note && <p className="text-xs text-muted-foreground mt-2 italic">&quot;{p.teacher_note}&quot;</p>}
            </div>
          ))}
          {portfolios.length === 0 && <div className="col-span-2 p-8 text-center text-muted-foreground text-sm">Aucun projet portfolio.</div>}
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
                      <div className="flex-1 bg-muted rounded-full h-1.5">
                        <div className="h-1.5 rounded-full" style={{ width: `${v * 10}%`, backgroundColor: '#1E4D8B' }} />
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

      {tab === 'messages' && user && (
        <MessagesTab
          me={{ email: user.email, name: user.full_name }}
          recipients={[]}
        />
      )}
    </div>
  );
}
