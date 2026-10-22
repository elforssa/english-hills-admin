'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Video, CalendarX2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { civilDate, casablancaTime, joinWindowState } from '@/lib/online/queries';
import { onlineErrorText } from '@/lib/online/reasons.mjs';

// Upcoming online lessons for an adult learner or a parent's children (D6). The join
// button is enabled only inside the server-computed window; the server re-checks it.
export default function FamilyLessons({ title, query, showLearner = false, backHref }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);
  const lessons = (query.data || []).filter(l => Date.parse(l.join_closes_at) > now - 6 * 3600 * 1000);
  return (
    <div className="mx-auto max-w-2xl p-4 lg:p-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{title}</h1>
        <Link href={backHref} className="text-sm text-primary hover:underline">Retour à mon espace</Link>
      </div>
      {query.isPending && <p className="text-sm text-muted-foreground">Chargement…</p>}
      {query.isError && <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{onlineErrorText(query.error)}</p>}
      {query.data && lessons.length === 0 && <p className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">Aucun cours en ligne prévu.</p>}
      <ul className="space-y-3">
        {lessons.map(lesson => {
          const state = joinWindowState(lesson, now);
          // A plain anchor: the room path carries its own security headers, so entering it
          // must be a full document navigation, never a client-side transition (OL-r6 A6).
          const href = `/online/room/${lesson.id}${showLearner ? `?student=${lesson.student_id}` : ''}`;
          return (
            <li key={`${lesson.id}:${lesson.student_id}`} className="rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  {showLearner && <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{lesson.student_name}</p>}
                  <p className="font-semibold">{lesson.course_name}</p>
                  <p className="text-sm text-muted-foreground">
                    {civilDate(lesson.local_date)} · {lesson.local_time}–{lesson.local_end_time} · {lesson.teacher_label}
                  </p>
                  {lesson.consent_missing && <p className="mt-1 text-xs text-amber-800">Consentement vidéo à enregistrer à l’accueil avant le premier cours.</p>}
                </div>
                {state === 'cancelled'
                  ? <span className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-800"><CalendarX2 size={14} /> Annulé</span>
                  : state === 'open'
                    ? <Button asChild size="lg" className="min-h-11 w-full sm:w-auto"><a href={href} data-room-entry><Video /> Rejoindre le cours</a></Button>
                    : <Button size="lg" className="min-h-11 w-full sm:w-auto" disabled>
                        <Video /> {state === 'upcoming' ? `Ouvre à ${casablancaTime(lesson.join_opens_at)}` : 'Terminé'}
                      </Button>}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-6 text-xs text-muted-foreground">Le bouton s’active 15 minutes avant le cours. Pour toute absence, contactez l’accueil.</p>
    </div>
  );
}
