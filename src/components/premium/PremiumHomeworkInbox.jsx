'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { entities } from '@/lib/entities';
import { openStoredFile } from '@/lib/storage';
import { toast } from 'sonner';
import { BookOpenCheck, CalendarDays, CheckCircle2, Clock3, ExternalLink, FileText } from 'lucide-react';
import { PREMIUM_HOMEWORK_STATUS_COLORS } from '@/lib/statusColors';

const STATUS = {
  Submitted: 'À préparer',
  Reviewed: 'Consulté',
  Prepared: 'Prêt',
};

export default function PremiumHomeworkInbox({ submissions, setSubmissions, students }) {
  const [sessions, setSessions] = useState([]);
  const [notes, setNotes] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [filter, setFilter] = useState('pending');

  useEffect(() => {
    entities.PremiumSession.list('-scheduled_date', 500).then(setSessions).catch(() => {});
  }, []);

  useEffect(() => {
    setNotes(Object.fromEntries(submissions.map((item) => [item.id, item.teacher_note || ''])));
  }, [submissions]);

  const studentsById = useMemo(() => Object.fromEntries(students.map((student) => [student.id, student])), [students]);
  const sessionsById = useMemo(() => Object.fromEntries(sessions.map((session) => [session.id, session])), [sessions]);
  const visible = submissions.filter((item) => filter === 'all' || (filter === 'pending' ? item.status !== 'Prepared' : item.status === filter));

  const saveReview = async (submission, status) => {
    setSavingId(submission.id);
    try {
      const updated = await entities.PremiumHomework.update(submission.id, {
        status,
        teacher_note: notes[submission.id]?.trim() || null,
        reviewed_at: new Date().toISOString(),
      });
      setSubmissions((current) => current.map((item) => item.id === submission.id ? updated : item));
      toast.success(status === 'Prepared' ? 'Préparation marquée comme prête' : 'Devoir marqué comme consulté');
    } catch {
      // entities.js already shows the error.
    } finally {
      setSavingId(null);
    }
  };

  const openFile = async (fileUrl) => {
    try { await openStoredFile(fileUrl); }
    catch { toast.error('Impossible d’ouvrir ce fichier.'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl bg-slate-950 text-white px-5 py-4">
        <div>
          <p className="text-xs font-bold text-amber-300 uppercase tracking-[0.18em]">Préparation Premium</p>
          <p className="font-semibold mt-1">Les exercices envoyés avant les séances</p>
        </div>
        <Link href="/premium-sessions" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-200 hover:text-white">Voir mon planning <ExternalLink size={13} /></Link>
      </div>

      <div className="flex flex-wrap gap-2">
        {[['pending', 'À traiter'], ['Submitted', 'Nouveaux'], ['Reviewed', 'Consultés'], ['Prepared', 'Prêts'], ['all', 'Tous']].map(([value, label]) => (
          <button key={value} onClick={() => setFilter(value)} className={`px-3 py-1.5 rounded-full border text-xs font-semibold ${filter === value ? 'bg-primary text-white border-primary' : 'bg-white border-border text-muted-foreground hover:bg-muted'}`}>{label}</button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <BookOpenCheck size={28} className="mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-sm font-medium">Aucun devoir dans cette vue</p>
          <p className="text-xs text-muted-foreground mt-1">Les nouvelles demandes apparaîtront ici dès leur envoi.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {visible.map((submission) => {
            const session = sessionsById[submission.premium_session_id];
            const statusLabel = STATUS[submission.status] || STATUS.Submitted;
            return (
              <article key={submission.id} className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">{studentsById[submission.student_id]?.full_name || 'Apprenant Premium'}</p>
                      <h3 className="font-bold text-lg mt-0.5">{submission.title}</h3>
                    </div>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${PREMIUM_HOMEWORK_STATUS_COLORS[submission.status] || PREMIUM_HOMEWORK_STATUS_COLORS.Submitted}`}>{statusLabel}</span>
                  </div>
                  {session && (
                    <div className="flex flex-wrap gap-4 mt-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5"><CalendarDays size={13} /> {session.scheduled_date}</span>
                      <span className="inline-flex items-center gap-1.5"><Clock3 size={13} /> {String(session.start_time).slice(0, 5)} · 60 min</span>
                    </div>
                  )}
                  {submission.student_note && <p className="mt-4 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-sm text-amber-950 whitespace-pre-wrap">{submission.student_note}</p>}
                  {submission.file_url && (
                    <button onClick={() => openFile(submission.file_url)} className="mt-3 inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs font-semibold hover:bg-muted">
                      <FileText size={14} /> {submission.file_name || 'Ouvrir le fichier'}
                    </button>
                  )}
                  <div className="mt-4">
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Notes de préparation</label>
                    <textarea className="w-full min-h-20 resize-y rounded-lg border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" placeholder="Points à revoir, matériel à préparer…" value={notes[submission.id] || ''} onChange={(event) => setNotes((current) => ({ ...current, [submission.id]: event.target.value }))} maxLength={4000} />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 border-t border-border bg-muted/20 px-5 py-3">
                  {submission.status === 'Submitted' && <button disabled={savingId === submission.id} onClick={() => saveReview(submission, 'Reviewed')} className="px-3 py-1.5 rounded-md border border-border bg-white text-xs font-semibold hover:bg-muted disabled:opacity-50">Marquer consulté</button>}
                  {submission.status !== 'Prepared' && <button disabled={savingId === submission.id} onClick={() => saveReview(submission, 'Prepared')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-600 text-white text-xs font-semibold disabled:opacity-50"><CheckCircle2 size={13} /> Prêt pour le cours</button>}
                  {submission.status === 'Prepared' && <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700"><CheckCircle2 size={14} /> Préparation terminée</span>}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
