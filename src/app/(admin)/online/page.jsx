'use client';

// Online courses for operations staff (D13). An online group is created in the group
// form with an online programme; its course record, teacher, pattern and activation
// are management actions on the course page.
import { useState } from 'react';
import Link from 'next/link';
import { Video, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { hasCapability } from '@/lib/roleAccess.mjs';
import { useOnlineRead, civilDate } from '@/lib/online/queries';
import { onlineErrorText } from '@/lib/online/reasons.mjs';
import { ONLINE_COURSE_STATUS_COLORS } from '@/lib/statusColors';

const STATUS = { draft: 'En préparation', active: 'Actif', closed: 'Clôturé' };

function casablancaMonth() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit' })
    .formatToParts(new Date()).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}`;
}

function TeacherCounts() {
  const [month, setMonth] = useState(casablancaMonth);
  const counts = useOnlineRead('online_teacher_lesson_counts', { p_month: `${month}-01` }, { roles: ['director', 'admin'] });
  return (
    <section className="mt-10">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold">Cours faits par enseignant</h2>
        <input type="month" aria-label="Mois" className="rounded-md border px-2 py-1 text-sm" value={month} onChange={e => setMonth(e.target.value || casablancaMonth())} />
      </div>
      <p className="mb-3 text-xs text-muted-foreground">Base de la paie manuelle : cours marqués faits et durée prévue (heure de Casablanca).</p>
      {counts.isError && <p className="text-sm text-red-800">{onlineErrorText(counts.error)}</p>}
      <div className="overflow-hidden rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground"><tr><th className="p-3">Enseignant</th><th className="p-3">Cours</th><th className="p-3">Minutes</th></tr></thead>
          <tbody>
            {(counts.data || []).map(row => <tr key={row.teacher_id} className="border-t"><td className="p-3">{row.teacher_name}</td><td className="p-3">{row.lessons}</td><td className="p-3">{row.minutes}</td></tr>)}
            {counts.data?.length === 0 && <tr><td colSpan={3} className="p-4 text-center text-muted-foreground">Aucun cours fait ce mois-ci.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function OnlineCourses() {
  const { role } = useAuth();
  const courses = useOnlineRead('online_list_courses', {}, { roles: ['director', 'admin', 'receptionist'] });
  const management = hasCapability(role, 'canManageOnlineCourses');
  return (
    <div className="mx-auto max-w-5xl p-4 lg:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Cours en ligne</h1>
          <p className="text-sm text-muted-foreground">Groupes au programme « Online » ou « Online One-to-One ».</p>
        </div>
        <Button asChild variant="outline"><Link href="/groups"><Plus /> Nouveau groupe en ligne</Link></Button>
      </div>
      {courses.isPending && <p className="text-sm text-muted-foreground">Chargement…</p>}
      {courses.isError && <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{onlineErrorText(courses.error)}</p>}
      {courses.data?.length === 0 && <p className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">Aucun groupe en ligne. Créez un groupe avec le programme « Online » depuis Groupes & niveaux.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {(courses.data || []).map(item => (
          <Link key={item.group_id} href={`/online/${item.group_id}`} className="block rounded-xl border bg-card p-4 transition hover:border-primary">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="flex items-center gap-2 font-semibold"><Video size={16} aria-hidden /> {item.name}</p>
                <p className="text-sm text-muted-foreground">{item.session_type} · {item.niveau}{item.jours ? ` · ${item.jours}` : ''}{item.horaire ? ` ${item.horaire}` : ''}</p>
              </div>
              <span className={`rounded px-2 py-0.5 text-xs ${item.course ? ONLINE_COURSE_STATUS_COLORS[item.course.status] : 'bg-slate-100 text-slate-700'}`}>
                {item.course ? STATUS[item.course.status] : 'Fiche à créer'}
              </span>
            </div>
            <p className="mt-2 text-sm">
              {item.course ? `${item.course.teacher_name} · ${item.seats_taken}/${item.course.capacity} places` : `${item.seats_taken} inscription(s)`}
            </p>
            {item.next_lesson && <p className="text-xs text-muted-foreground">Prochain cours : {civilDate(item.next_lesson.local_date)} à {item.next_lesson.local_time}</p>}
          </Link>
        ))}
      </div>
      {management && <TeacherCounts />}
    </div>
  );
}
