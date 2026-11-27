'use client';

// Online courses for operations staff (D13). An online group is created in the group
// form with an online programme; its course record, teacher, pattern and activation
// are management actions on the course page.
// Director and admin also see the status line (plan online-room-reliability.md, section 2,
// reliability PR): whether the room provider's keys are correct, show a paste mistake or
// are missing, from GET /api/online/status — words only, never a value.
// Webhook PR (section 3, D7, D9): the status line adds the webhook rows (route open or
// closed, secret present or not — never its value —, last event received, refused writes
// since the deploy), and « Minutes connectées » shows the month's minutes per course
// (online_usage_month) to compare with Zoom's usage report. Never attendance.
import { programmeName } from '@/lib/programCatalog.mjs';
import { centreMonth, formatCentre } from '@/lib/centreClock.mjs';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Video, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { hasCapability } from '@/lib/roleAccess.mjs';
import { useOnlineRead, civilDate, casablancaTime } from '@/lib/online/queries';
import { onlineErrorText } from '@/lib/online/reasons.mjs';
import { ONLINE_COURSE_STATUS_COLORS } from '@/lib/statusColors';

const STATUS = { draft: 'En préparation', active: 'Actif', closed: 'Clôturé' };

function casablancaMonth() {
  return centreMonth();
}

const STATUS_KEYS_TEXT = { correctes: 'correctes', incorrectes: 'incorrectes', absentes: 'absentes' };
const STATUS_SECRET_TEXT = { présent: 'présent', absent: 'absent', incorrect: 'incorrect' };

// The usage month is UTC, like the figure it is compared with (plan section 3, rule 5).
function utcMonth() {
  return new Date().toISOString().slice(0, 7);
}

function StatusLine() {
  const status = useQuery({
    queryKey: ['online', 'status'],
    queryFn: async () => {
      const response = await fetch('/api/online/status', { cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw body;
      return body;
    },
    staleTime: 60000,
    retry: false,
  });
  const keys = STATUS_KEYS_TEXT[status.data?.keys];
  const data = status.data || {};
  const secret = STATUS_SECRET_TEXT[data.webhook_secret];
  const refused = data.refused ? data.refused.rate_limited + data.refused.unavailable : null;
  return (
    <div className={`mb-4 rounded-lg border p-3 text-sm ${keys === 'correctes' ? 'bg-card' : keys ? 'border-red-200 bg-red-50 text-red-800' : 'bg-card text-muted-foreground'}`} data-testid="online-status-line">
      <p>Salle de cours en ligne — clés : {keys || (status.isPending ? '…' : 'état indisponible')}</p>
      {keys && (
        <p className="mt-1 text-xs text-muted-foreground" data-testid="online-webhook-status">
          Événements Zoom : {data.webhook === 'ouvert' ? 'ouverts' : 'fermés'} · secret du webhook : {secret || 'état indisponible'}
          {' · '}dernier événement reçu : {data.last_event_at ? `${formatCentre(data.last_event_at, 'fr-FR', { day: '2-digit', month: '2-digit' })} à ${casablancaTime(data.last_event_at)}` : 'aucun'}
          {' · '}écritures refusées depuis le dernier déploiement : {refused === null ? 'état indisponible' : refused}
        </p>
      )}
    </div>
  );
}

function UsageMinutes() {
  const [month, setMonth] = useState(utcMonth);
  const usage = useOnlineRead('online_usage_month', { p_month: `${month}-01` }, { roles: ['director', 'admin'] });
  const courses = usage.data?.courses || [];
  return (
    <section className="mt-10">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold">Minutes connectées (Zoom)</h2>
        <input type="month" aria-label="Mois des minutes" className="rounded-md border px-2 py-1 text-sm" value={month} onChange={e => setMonth(e.target.value || utcMonth())} />
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Somme par connexion, comme Zoom la facture, mois en temps universel (UTC), à comparer avec le rapport d’utilisation de Zoom.
        Une durée « estimée » remplace un événement manquant. Ces chiffres ne servent jamais aux présences.
      </p>
      {usage.isError && <p className="text-sm text-red-800">{onlineErrorText(usage.error)}</p>}
      <div className="overflow-hidden rounded-xl border bg-card">
        <table className="w-full text-sm" data-testid="online-usage-minutes">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground"><tr><th className="p-3">Cours</th><th className="p-3">Minutes</th><th className="p-3">Dont estimées</th><th className="p-3">Connexions</th></tr></thead>
          <tbody>
            {courses.map(row => (
              <tr key={row.group_id} className="border-t">
                <td className="p-3">{row.name}</td><td className="p-3">{row.minutes}</td>
                <td className="p-3">{row.estimated_minutes}{row.estimated_intervals ? ` (${row.estimated_intervals})` : ''}</td><td className="p-3">{row.passes}</td>
              </tr>
            ))}
            {usage.data && courses.length === 0 && <tr><td colSpan={4} className="p-4 text-center text-muted-foreground">Aucune minute reçue de Zoom ce mois-ci.</td></tr>}
            {courses.length > 0 && (
              <tr className="border-t font-medium"><td className="p-3">Total</td><td className="p-3">{usage.data.totals.minutes}</td><td className="p-3">{usage.data.totals.estimated_minutes}</td><td className="p-3">{courses.reduce((sum, row) => sum + (row.passes ?? 0), 0)}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
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
          <p className="text-sm text-muted-foreground">Groupes au programme « Cours en ligne » ou « Cours individuel en ligne ».</p>
        </div>
        {/* RWR-r5 §6.5 (OD-9 A, NF-16): only management creates online groups. */}
        {management && <Button asChild variant="outline"><Link href="/groups"><Plus /> Nouveau groupe en ligne</Link></Button>}
      </div>
      {management && <StatusLine />}
      {courses.isPending && <p className="text-sm text-muted-foreground">Chargement…</p>}
      {courses.isError && <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{onlineErrorText(courses.error)}</p>}
      {courses.data?.length === 0 && <p className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">Aucun groupe en ligne. Créez un groupe avec le programme « Cours en ligne » depuis Groupes & niveaux.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {(courses.data || []).map(item => (
          <Link key={item.group_id} href={`/online/${item.group_id}`} className="block rounded-xl border bg-card p-4 transition hover:border-primary">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="flex items-center gap-2 font-semibold"><Video size={16} aria-hidden /> {item.name}</p>
                <p className="text-sm text-muted-foreground">{programmeName(item.session_type)} · {item.niveau}{item.jours ? ` · ${item.jours}` : ''}{item.horaire ? ` ${item.horaire}` : ''}</p>
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
      {management && <UsageMinutes />}
    </div>
  );
}
