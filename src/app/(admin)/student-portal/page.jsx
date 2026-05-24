'use client';

import { useEffect, useState } from 'react';
import { entities, auth } from '@/lib/entities';
import { BookOpen, FileText, TrendingUp } from 'lucide-react';

const STATUS_COLORS = {
  'Présent': 'bg-green-100 text-green-700', 'Absent': 'bg-red-100 text-red-700',
  'Retard': 'bg-yellow-100 text-yellow-700', 'Justifié': 'bg-blue-100 text-blue-700',
};

export default function StudentPortal() {
  const [user, setUser] = useState(null);
  const [student, setStudent] = useState(null);
  const [attendance, setAttendance] = useState([]);
  const [assessments, setAssessments] = useState([]);
  const [portfolios, setPortfolios] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('progress');

  useEffect(() => {
    auth.me().then(async (u) => {
      setUser(u);
      const allStudents = await entities.Student.list('full_name', 200);
      const me = allStudents.find(s => s.email === u?.email);
      setStudent(me || null);
      if (me) {
        const [att, ass, port] = await Promise.all([
          entities.Attendance.filter({ student_id: me.id }),
          entities.Assessment.filter({ student_id: me.id }),
          entities.Portfolio.filter({ student_id: me.id }),
        ]);
        setAttendance(att); setAssessments(ass);
        setPortfolios(port.filter(p => p.visible_to_student));
      }
      const ann = await entities.Announcement.list('-created_date', 5);
      setAnnouncements(ann.filter(a => a.audience === 'all'));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8 text-center text-muted-foreground text-sm">Chargement...</div>;

  const presentCount = attendance.filter(a => a.status === 'Présent').length;
  const rate = attendance.length > 0 ? Math.round((presentCount / attendance.length) * 100) : 0;
  const lastAssessment = assessments[0];

  const TABS = [{ id: 'progress', label: 'Ma progression' }, { id: 'attendance', label: 'Présences' }, { id: 'portfolio', label: 'Portfolio' }];

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Mon espace</h1>
        <p className="text-muted-foreground text-sm mt-1">Bienvenue, {user?.full_name}</p>
      </div>

      {announcements.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-5">
          <p className="text-xs font-semibold text-blue-700 mb-1">ANNONCES</p>
          {announcements.slice(0, 2).map(a => (
            <div key={a.id}><p className="text-sm font-semibold">{a.title}</p><p className="text-xs text-blue-800">{a.body}</p></div>
          ))}
        </div>
      )}

      {student && (
        <div className="bg-card border border-border rounded-xl p-5 mb-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0 bg-primary">
            {student.full_name?.[0]}
          </div>
          <div>
            <p className="font-bold">{student.full_name}</p>
            <p className="text-sm text-muted-foreground">Niveau {student.niveau_cefr || '—'} · {student.age_category}</p>
          </div>
        </div>
      )}

      <div className="flex gap-1 border border-border rounded-lg p-1 bg-muted w-fit mb-6">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${tab === t.id ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
            {t.label}
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
        <div className="bg-card border border-border rounded-lg overflow-hidden divide-y divide-border">
          {attendance.slice(0, 30).map(a => (
            <div key={a.id} className="flex items-center justify-between px-4 py-3">
              <p className="text-sm">{a.session_date}</p>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[a.status] || 'bg-gray-100 text-gray-500'}`}>{a.status}</span>
            </div>
          ))}
          {attendance.length === 0 && <div className="p-8 text-center text-muted-foreground text-sm">Aucune donnée de présence.</div>}
        </div>
      )}

      {tab === 'portfolio' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {portfolios.map(p => (
            <div key={p.id} className="bg-card border border-border rounded-xl p-4">
              <p className="font-semibold text-sm">{p.title}</p>
              <p className="text-xs text-muted-foreground">{p.project_type} · {p.terme} {p.annee}</p>
              {p.file_url && <a href={p.file_url} target="_blank" rel="noreferrer" className="text-xs font-medium mt-2 inline-block" style={{ color: 'var(--brand)' }}>Voir →</a>}
            </div>
          ))}
          {portfolios.length === 0 && <div className="col-span-2 p-8 text-center text-muted-foreground text-sm">Aucun projet portfolio.</div>}
        </div>
      )}
    </div>
  );
}
