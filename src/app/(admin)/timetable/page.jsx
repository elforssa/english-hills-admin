'use client';

import ContextLink from '@/components/ContextLink';
import PersonLink from '@/components/PersonLink';
import { useEffect, useState } from 'react';
import { getTeacherDirectory, getMyTeacher } from '@/lib/teacher-directory';
import { entities, auth } from '@/lib/entities';
import { getBrowserClient } from '@/lib/supabase';

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const COLORS = [
  'bg-blue-100 text-blue-800 border-blue-200',
  'bg-green-100 text-green-800 border-green-200',
  'bg-purple-100 text-purple-800 border-purple-200',
  'bg-orange-100 text-orange-800 border-orange-200',
  'bg-pink-100 text-pink-800 border-pink-200',
  'bg-teal-100 text-teal-800 border-teal-200',
];

export default function Timetable() {
  const [groups, setGroups] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterTerme, setFilterTerme] = useState('');
  const [urlReady, setUrlReady] = useState(false);
  const [role, setRole] = useState(null);
  const [myTeacherId, setMyTeacherId] = useState(null);
  const [premiumSessions, setPremiumSessions] = useState([]);
  const [premiumGroups, setPremiumGroups] = useState([]);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    setFilterTerme(new URLSearchParams(window.location.search).get('term') || '');
    setUrlReady(true);
  }, []);
  useEffect(() => {
    if (urlReady) window.history.replaceState(window.history.state, '', `/timetable${filterTerme ? `?term=${encodeURIComponent(filterTerme)}` : ''}`);
  }, [urlReady, filterTerme]);

  useEffect(() => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const until = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);
    Promise.all([
      entities.Group.listAll('name'),
      getTeacherDirectory(),
      auth.me().catch(() => null),
      getMyTeacher(),
      getBrowserClient().from('premium_sessions').select('id,premium_group_id,teacher_id,scheduled_date,start_time,status')
        .gte('scheduled_date', today).lte('scheduled_date', until)
        .neq('status', 'Cancelled').order('scheduled_date', { ascending: true }),
      entities.PremiumGroup.listAll('name'),
    ]).then(([g, t, u, me, premiumResult, premiumGroupRows]) => {
      if (premiumResult.error) throw premiumResult.error;
      setGroups(g);
      setTeachers(t);
      setPremiumSessions(premiumResult.data || []);
      setPremiumGroups(premiumGroupRows);
      setRole(u?.role || null);
      // Resolve the teacher with the same database helper used by RLS.
      if (u?.role === 'teacher') {
        setMyTeacherId(me?.id || null);
      }
      setLoading(false);
    }).catch(() => { setLoadError('Impossible de charger l’emploi du temps. Réessayez en actualisant la page.'); setLoading(false); });
  }, []);

  const teacherName = (tid) => teachers.find(t => t.id === tid)?.full_name || '';
  // Scope the schedule to the teacher's own groups; admins/directors see all.
  const visibleGroups = role === 'teacher'
    ? groups.filter(g => g.teacher_id === myTeacherId)
    : groups;
  const filtered = visibleGroups.filter(g => !filterTerme || g.terme === filterTerme);

  const groupsByDay = DAYS.reduce((acc, day) => {
    acc[day] = filtered.filter(g => g.jours?.toLowerCase().includes(day.toLowerCase().slice(0, 3)));
    return acc;
  }, {});

  const hasAny = Object.values(groupsByDay).some(arr => arr.length > 0);
  const visiblePremium = premiumSessions.filter(s => role !== 'teacher' || s.teacher_id === myTeacherId);
  const premiumGroupName = (id) => premiumGroups.find(g => g.id === id)?.name || 'Séance Premium';

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Emploi du temps</h1>
        <select className="border border-border rounded-md px-3 py-2 text-sm bg-white" value={filterTerme} onChange={e => setFilterTerme(e.target.value)}>
          <option value="">Tous les termes</option>
          {['Sept–Déc','Jan–Mar','Avr–Juin','Été'].map(t => <option key={t}>{t}</option>)}
        </select>
      </div>

      {loadError && <div role="alert" className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{loadError}</div>}
      {loading ? (
        <div className="p-8 text-center text-muted-foreground">Chargement...</div>
      ) : !hasAny ? (
        <div className="bg-card border border-border rounded-lg p-12 text-center text-muted-foreground">
          Aucun groupe avec horaires définis. Ajoutez des groupes avec jours et horaires depuis la page Groupes.
        </div>
      ) : (
        <>
          <div className="hidden lg:grid grid-cols-7 gap-3">
            {DAYS.map((day) => (
              <div key={day}>
                <div className="text-center text-xs font-bold uppercase tracking-wide text-muted-foreground pb-2 mb-2 border-b border-border">{day}</div>
                <div className="space-y-2">
                  {groupsByDay[day].length === 0 ? (
                    <div className="h-8 rounded border border-dashed border-border" />
                  ) : (
                    groupsByDay[day].map((g, i) => (
                      <div key={g.id} className={`p-2 rounded border text-xs ${COLORS[i % COLORS.length]}`}>
                        <ContextLink href={`/groups/${g.id}`} className="inline-flex min-h-9 items-center font-semibold underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary rounded">{g.name}</ContextLink>
                        <p className="opacity-75">{g.horaire}</p>
                        <PersonLink kind="teacher" id={g.teacher_id} className="opacity-75">{teacherName(g.teacher_id)}</PersonLink>
                        {g.salle && <p className="opacity-60">Salle {g.salle}</p>}
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="lg:hidden space-y-4">
            {DAYS.filter(day => groupsByDay[day].length > 0).map((day) => (
              <div key={day} className="bg-card border border-border rounded-lg overflow-hidden">
                <div className="px-4 py-2 bg-muted border-b border-border">
                  <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{day}</span>
                </div>
                <div className="p-3 space-y-2">
                  {groupsByDay[day].map((g, i) => (
                    <div key={g.id} className={`p-2.5 rounded border text-xs ${COLORS[i % COLORS.length]}`}>
                      <ContextLink href={`/groups/${g.id}`} className="inline-flex min-h-9 items-center font-semibold underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary rounded">{g.name}</ContextLink>
                      {g.horaire && <p className="opacity-75 mt-0.5">{g.horaire}</p>}
                      {g.teacher_id && <PersonLink kind="teacher" id={g.teacher_id} className="opacity-75">{teacherName(g.teacher_id)}</PersonLink>}
                      {g.salle && <p className="opacity-60">Salle {g.salle}</p>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      {!loading && !loadError && visiblePremium.length > 0 && (
        <section className="mt-8" aria-labelledby="premium-timetable-heading">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 id="premium-timetable-heading" className="text-lg font-semibold text-[var(--brand-deep)]">Séances Premium à venir</h2>
            <span className="text-xs text-muted-foreground">30 prochains jours</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visiblePremium.map(session => (
              <article key={session.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Premium · {session.status}</p>
                <h3 className="mt-1 font-semibold">{premiumGroupName(session.premium_group_id)}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{session.scheduled_date} · {String(session.start_time).slice(0,5)}</p>
                <p className="text-sm text-muted-foreground">{teacherName(session.teacher_id)}</p>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
