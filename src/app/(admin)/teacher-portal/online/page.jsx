'use client';

// The online teacher's space (D5): own lessons only, through projections that carry no
// learner contact data. Cancelling or moving a lesson is the office's job (Q5 = A).
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Video, ClipboardCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useOnlineRead, civilDate, joinWindowState, casablancaTime } from '@/lib/online/queries';
import { onlineErrorText } from '@/lib/online/reasons.mjs';
import { ONLINE_LESSON_STATUS_COLORS } from '@/lib/statusColors';

const STATUS = { scheduled: 'Prévu', cancelled: 'Annulé', completed: 'Fait' };

export default function TeacherOnlineLessons() {
  const lessons = useOnlineRead('online_list_my_lessons', {}, { roles: ['teacher'], refetchInterval: 60000 });
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);
  return (
    <div className="mx-auto max-w-3xl p-4 lg:p-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Mes cours en ligne</h1>
        <Link href="/teacher-portal" className="text-sm text-primary hover:underline">Espace enseignant</Link>
      </div>
      {lessons.isPending && <p className="text-sm text-muted-foreground">Chargement…</p>}
      {lessons.isError && <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{onlineErrorText(lessons.error)}</p>}
      {lessons.data?.length === 0 && <p className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">Aucun cours en ligne sur la période.</p>}
      <ul className="space-y-3">
        {(lessons.data || []).map(lesson => {
          const room = lesson.i_am_host ? joinWindowState({ ...lesson, join_opens_at: lesson.host_opens_at }, now) : 'closed';
          return (
            <li key={lesson.id} className="rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{lesson.course_name}</p>
                  <p className="text-sm text-muted-foreground">{civilDate(lesson.local_date)} · {lesson.local_time}–{lesson.local_end_time}</p>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs">
                    <span className={`rounded px-2 py-0.5 ${ONLINE_LESSON_STATUS_COLORS[lesson.status]}`}>{STATUS[lesson.status]}</span>
                    {lesson.is_substitute && <span className="rounded bg-violet-50 px-2 py-0.5 text-violet-800">{lesson.i_am_host ? 'Remplacement' : 'Remplacé'}</span>}
                    {lesson.report_present && <span className="rounded bg-emerald-50 px-2 py-0.5 text-emerald-800">Compte rendu saisi</span>}
                  </div>
                </div>
                <div className="flex w-full flex-col gap-2 sm:w-auto">
                  {lesson.i_am_host && lesson.status !== 'cancelled' && (room === 'open'
                    ? <Button asChild className="min-h-11"><a href={`/online/room/${lesson.id}`} data-room-entry><Video /> Ouvrir la salle</a></Button>
                    : <Button className="min-h-11" disabled><Video /> {room === 'upcoming' ? `Salle à ${casablancaTime(lesson.host_opens_at)}` : 'Salle fermée'}</Button>)}
                  {lesson.roster_open && <Button asChild variant="outline" className="min-h-11"><Link href={`/teacher-portal/online/${lesson.id}`}><ClipboardCheck /> Présences</Link></Button>}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-6 text-xs text-muted-foreground">Pour annuler ou déplacer un cours, ou pour inviter un apprenant, contactez l’accueil.</p>
    </div>
  );
}
