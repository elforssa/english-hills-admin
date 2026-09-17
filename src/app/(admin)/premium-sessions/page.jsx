'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { entities } from '@/lib/entities';
import { getTeacherDirectory } from '@/lib/teacher-directory';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import {
  BookOpenCheck, CalendarDays, CheckCircle2, Crown, Plus,
  Sparkles, UserMinus, UserPlus, UserRound,
} from 'lucide-react';
import { PREMIUM_ATTENDANCE_STATUS_COLORS, PREMIUM_SESSION_STATUS_COLORS } from '@/lib/statusColors';

const STATUS_LABELS = {
  Scheduled: 'Planifiée', Confirmed: 'Confirmée', Completed: 'Terminée',
  Cancelled: 'Annulée', Missed: 'Non tenue',
};
const ATTENDANCE_LABELS = { Present: 'Présent', Absent: 'Absent', Late: 'Retard', Excused: 'Justifié' };

const dateString = (date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
};

function academicYear() {
  const now = new Date();
  const start = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return `${start}-${start + 1}`;
}

function nextDateForWeekday(weekday, offset = 0) {
  const value = new Date();
  value.setHours(12, 0, 0, 0);
  const jsTarget = Number(weekday) === 7 ? 0 : Number(weekday);
  let shift = (jsTarget - value.getDay() + 7) % 7;
  shift += offset * 7;
  value.setDate(value.getDate() + shift);
  return dateString(value);
}

function displayDate(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('fr-MA', { weekday: 'long', day: 'numeric', month: 'long' })
    .format(new Date(`${value}T12:00:00`));
}

function membershipCovers(membership, date) {
  return membership.start_date <= date && (!membership.end_date || membership.end_date >= date);
}

export default function PremiumSessionsPage() {
  const { role } = useAuth();
  const canManage = role === 'admin' || role === 'director';
  const [tab, setTab] = useState('groups');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [groups, setGroups] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [homework, setHomework] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [students, setStudents] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [memberChoice, setMemberChoice] = useState({});
  const [rescheduleDrafts, setRescheduleDrafts] = useState({});
  const [form, setForm] = useState({
    name: '', teacher_id: '', weekday: '6', start_time: '10:00', academic_year: academicYear(), notes: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [groupRows, membershipRows, sessionRows, homeworkRows, attendanceRows, studentRows, teacherRows] = await Promise.all([
        entities.PremiumGroup.listAll('name'),
        entities.PremiumMembership.listAll('-created_at'),
        entities.PremiumSession.listAll('-scheduled_date'),
        entities.PremiumHomework.listAll('-submitted_at'),
        entities.PremiumAttendance.listAll('-created_at'),
        entities.Student.listAll('full_name'),
        getTeacherDirectory(),
      ]);
      setGroups(groupRows);
      setMemberships(membershipRows);
      setSessions(sessionRows);
      setHomework(homeworkRows);
      setAttendance(attendanceRows);
      setStudents(studentRows);
      setTeachers(teacherRows);
    } catch (error) {
      setLoadError(true);
      toast.error(error?.message || 'Impossible de charger les ateliers Premium.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const studentsById = useMemo(() => Object.fromEntries(students.map((item) => [item.id, item])), [students]);
  const teachersById = useMemo(() => Object.fromEntries(teachers.map((item) => [item.id, item])), [teachers]);
  const groupsById = useMemo(() => Object.fromEntries(groups.map((item) => [item.id, item])), [groups]);
  const today = dateString(new Date());
  const activeMemberships = memberships.filter((item) => item.active);
  const assignedIds = new Set(activeMemberships.map((item) => item.student_id));
  const eligibleStudents = students.filter((student) => (
    student.plan_type === 'Premium'
    && student.session_type === 'Yearly'
    && !student.deleted_at
    && ['Enrolled', 'Trial'].includes(student.status)
    && (!student.premium_start_date || student.premium_start_date <= today)
    && (!student.premium_end_date || student.premium_end_date >= today)
  ));
  const unassignedStudents = eligibleStudents.filter((student) => !assignedIds.has(student.id));
  const sharedSessions = sessions.filter((session) => session.premium_group_id);
  const legacySessions = sessions.filter((session) => session.student_id && !session.premium_group_id);
  const recentCutoffDate = new Date();
  recentCutoffDate.setDate(recentCutoffDate.getDate() - 14);
  const recentCutoff = dateString(recentCutoffDate);
  const upcomingSessions = sharedSessions
    .filter((session) => session.scheduled_date >= today && session.status !== 'Cancelled')
    .sort((a, b) => `${a.scheduled_date} ${a.start_time}`.localeCompare(`${b.scheduled_date} ${b.start_time}`));
  const visibleSharedSessions = sharedSessions
    .filter((session) => session.scheduled_date >= recentCutoff)
    .sort((a, b) => `${a.scheduled_date} ${a.start_time}`.localeCompare(`${b.scheduled_date} ${b.start_time}`));

  const createGroup = async (event) => {
    event.preventDefault();
    if (!form.name.trim() || !form.teacher_id || !form.start_time) {
      toast.error('Renseignez le nom, l’enseignant et l’heure.');
      return;
    }
    setSaving(true);
    try {
      await entities.PremiumGroup.create({
        name: form.name.trim(), teacher_id: form.teacher_id, weekday: Number(form.weekday),
        start_time: form.start_time, duration_minutes: 60, academic_year: form.academic_year.trim() || null,
        target_size: 5, notes: form.notes.trim() || null, active: true,
      });
      setForm((current) => ({ ...current, name: '', notes: '' }));
      toast.success('Atelier Premium créé');
      await load();
    } finally {
      setSaving(false);
    }
  };

  const addMember = async (groupId) => {
    const studentId = memberChoice[groupId];
    if (!studentId) return;
    const student = studentsById[studentId];
    const startDate = [today, student?.premium_start_date].filter(Boolean).sort().at(-1);
    setSaving(true);
    try {
      await entities.PremiumMembership.create({
        premium_group_id: groupId, student_id: studentId, start_date: startDate,
        end_date: student?.premium_end_date || null, active: true,
      });
      setMemberChoice((current) => ({ ...current, [groupId]: '' }));
      toast.success(`${student?.full_name || 'Apprenant'} ajouté à l’atelier`);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const removeMember = async (membership) => {
    setSaving(true);
    try {
      await entities.PremiumMembership.update(membership.id, { active: false, end_date: today });
      toast.success('Apprenant retiré de l’atelier');
      await load();
    } finally {
      setSaving(false);
    }
  };

  const generateSessions = async (group) => {
    const existingDates = new Set(sharedSessions
      .filter((session) => session.premium_group_id === group.id && session.status !== 'Cancelled')
      .map((session) => session.scheduled_date));
    const dates = Array.from({ length: 6 }, (_, index) => nextDateForWeekday(group.weekday, index))
      .filter((date) => !existingDates.has(date));
    if (!dates.length) {
      toast.info('Les six prochaines semaines sont déjà planifiées.');
      return;
    }
    setSaving(true);
    try {
      await Promise.all(dates.map((scheduledDate) => entities.PremiumSession.create({
        premium_group_id: group.id, teacher_id: group.teacher_id, scheduled_date: scheduledDate,
        start_time: group.start_time, duration_minutes: 60, status: 'Scheduled',
      })));
      toast.success(`${dates.length} séance(s) ajoutée(s) au planning`);
      await load();
      setTab('sessions');
    } finally {
      setSaving(false);
    }
  };

  const updateSessionStatus = async (session, status) => {
    try {
      const updated = await entities.PremiumSession.update(session.id, {
        status, completed_at: status === 'Completed' ? new Date().toISOString() : null,
      });
      setSessions((current) => current.map((item) => item.id === session.id ? updated : item));
      toast.success(`Séance ${STATUS_LABELS[status].toLowerCase()}`);
    } catch { /* entities reports errors */ }
  };

  const rescheduleSession = async (session) => {
    const draft = rescheduleDrafts[session.id] || {};
    const scheduledDate = draft.scheduled_date || session.scheduled_date;
    const startTime = draft.start_time || String(session.start_time).slice(0, 5);
    const day = new Date(`${scheduledDate}T12:00:00`).getDay();
    if (day !== 0 && day !== 6) {
      toast.error('Une séance Premium doit rester le samedi ou le dimanche.');
      return;
    }
    setSaving(true);
    try {
      const updated = await entities.PremiumSession.update(session.id, { scheduled_date: scheduledDate, start_time: startTime });
      setSessions((current) => current.map((item) => item.id === session.id ? updated : item));
      setRescheduleDrafts((current) => ({ ...current, [session.id]: {} }));
      toast.success('Séance replanifiée');
    } finally {
      setSaving(false);
    }
  };

  const setStudentAttendance = async (session, studentId, status) => {
    const existing = attendance.find((item) => item.premium_session_id === session.id && item.student_id === studentId);
    try {
      const saved = existing
        ? await entities.PremiumAttendance.update(existing.id, { status })
        : await entities.PremiumAttendance.create({ premium_session_id: session.id, student_id: studentId, status });
      setAttendance((current) => existing
        ? current.map((item) => item.id === existing.id ? saved : item)
        : [...current, saved]);
    } catch { /* entities reports errors */ }
  };

  const tabs = [
    ['groups', 'Ateliers', groups.filter((item) => item.active).length],
    ['sessions', 'Séances & présences', upcomingSessions.length],
    ['legacy', 'Historique individuel', legacySessions.length],
  ];

  return (
    <div className="max-w-7xl mx-auto p-4 lg:p-8">
      <header className="relative overflow-hidden rounded-2xl bg-[var(--brand-sidebar)] text-white p-6 lg:p-8">
        <div className="absolute -right-12 -top-16 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
        <div className="relative flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-blue-100"><Crown size={15} /> Programme Premium</p>
            <h1 className="mt-3 text-2xl lg:text-3xl font-black tracking-tight">Ateliers partagés du week-end</h1>
            <p className="mt-2 text-sm text-slate-300">Une heure supplémentaire en petit groupe. Les niveaux peuvent être mélangés et le nombre d’apprenants reste flexible.</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-white/10 px-4 py-3"><p className="text-xl font-black">{eligibleStudents.length}</p><p className="text-[10px] text-slate-400">ÉLIGIBLES</p></div>
            <div className="rounded-xl bg-white/10 px-4 py-3"><p className="text-xl font-black">{activeMemberships.length}</p><p className="text-[10px] text-slate-400">AFFECTÉS</p></div>
            <div className="rounded-xl border border-white/20 bg-white px-4 py-3 text-primary"><p className="text-xl font-black">{unassignedStudents.length}</p><p className="text-[10px]">À AFFECTER</p></div>
          </div>
        </div>
      </header>

      <nav className="mt-5 flex gap-2 overflow-x-auto pb-1" aria-label="Vues Premium">
        {tabs.map(([value, label, count]) => (
          <button key={value} onClick={() => setTab(value)} aria-current={tab === value ? 'page' : undefined} className={`shrink-0 rounded-full border px-4 py-2 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${tab === value ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-white text-muted-foreground hover:bg-muted'}`}>{label} <span className="ml-1 opacity-70">{count}</span></button>
        ))}
      </nav>

      {loading ? <div className="mt-5 rounded-2xl border border-border p-14 text-center text-sm text-muted-foreground">Chargement des ateliers…</div> : null}

      {!loading && loadError && <div role="alert" className="mt-5 rounded-2xl border border-border bg-card p-8 text-center text-sm">Impossible de charger les ateliers. <button onClick={load} className="font-semibold text-primary underline">Réessayer</button></div>}

      {!loading && !loadError && tab === 'groups' && (
        <div className="mt-5 space-y-5">
          {canManage && (
            <form onSubmit={createGroup} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2"><Sparkles size={17} className="text-primary" /><h2 className="font-bold">Créer un atelier partagé</h2></div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
                <label className="xl:col-span-2 text-xs font-bold text-muted-foreground">NOM<input className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm" placeholder="Ex. Premium samedi 10h" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label>
                <label className="text-xs font-bold text-muted-foreground">ENSEIGNANT<select className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm" value={form.teacher_id} onChange={(event) => setForm((current) => ({ ...current, teacher_id: event.target.value }))}><option value="">— Choisir —</option>{teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.full_name}</option>)}</select></label>
                <label className="text-xs font-bold text-muted-foreground">JOUR<select className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm" value={form.weekday} onChange={(event) => setForm((current) => ({ ...current, weekday: event.target.value }))}><option value="6">Samedi</option><option value="7">Dimanche</option></select></label>
                <label className="text-xs font-bold text-muted-foreground">HEURE<input type="time" className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" value={form.start_time} onChange={(event) => setForm((current) => ({ ...current, start_time: event.target.value }))} /></label>
                <label className="text-xs font-bold text-muted-foreground">ANNÉE<input className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm" value={form.academic_year} onChange={(event) => setForm((current) => ({ ...current, academic_year: event.target.value }))} /></label>
              </div>
              <div className="mt-3 flex flex-col md:flex-row gap-3 md:items-end"><label className="flex-1 text-xs font-bold text-muted-foreground">NOTES (FACULTATIF)<input className="mt-1 w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm" maxLength={2000} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></label><button disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50"><Plus size={15} /> Créer</button></div>
            </form>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {groups.filter((group) => group.active).map((group) => {
              const roster = activeMemberships.filter((item) => item.premium_group_id === group.id);
              return (
                <article key={group.id} className="overflow-hidden rounded-2xl border border-border bg-card">
                  <div className="flex items-start justify-between gap-4 bg-slate-50 px-5 py-4 border-b border-border">
                    <div><p className="text-[10px] font-black uppercase tracking-widest text-primary">{Number(group.weekday) === 6 ? 'Samedi' : 'Dimanche'} · {String(group.start_time).slice(0, 5)}</p><h2 className="mt-1 text-lg font-black">{group.name}</h2><p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><UserRound size={12} /> {teachersById[group.teacher_id]?.full_name || 'Enseignant'}</p></div>
                    <div className={`rounded-xl border px-3 py-2 text-center ${roster.length > group.target_size ? 'border-amber-300 bg-amber-50' : 'border-border bg-white'}`}><p className="text-xl font-black">{roster.length}</p><p className="text-[9px] text-muted-foreground">REPÈRE {group.target_size}</p></div>
                  </div>
                  <div className="p-5">
                    <div className="space-y-2">
                      {roster.map((membership) => {
                        const student = studentsById[membership.student_id];
                        return <div key={membership.id} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"><div><p className="text-sm font-semibold">{student?.full_name || 'Apprenant'}</p><p className="text-[11px] text-muted-foreground">NIV {student?.niveau_cefr || 'non défini'}</p></div>{canManage && <button disabled={saving} onClick={() => removeMember(membership)} className="rounded-md p-2 text-muted-foreground hover:bg-rose-50 hover:text-rose-700" aria-label="Retirer"><UserMinus size={15} /></button>}</div>;
                      })}
                      {!roster.length && <p className="rounded-lg border border-dashed border-border p-5 text-center text-xs text-muted-foreground">Aucun apprenant affecté.</p>}
                    </div>
                    {canManage && (
                      <div className="mt-4 flex gap-2"><select value={memberChoice[group.id] || ''} onChange={(event) => setMemberChoice((current) => ({ ...current, [group.id]: event.target.value }))} className="min-w-0 flex-1 rounded-lg border border-border bg-white px-3 py-2 text-sm"><option value="">— Ajouter un apprenant Premium Yearly —</option>{unassignedStudents.map((student) => <option key={student.id} value={student.id}>{student.full_name} · NIV {student.niveau_cefr || '—'}</option>)}</select><button type="button" disabled={saving || !memberChoice[group.id]} onClick={() => addMember(group.id)} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><UserPlus size={14} /> Ajouter</button></div>
                    )}
                    {canManage && <button disabled={saving} onClick={() => generateSessions(group)} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold hover:bg-slate-50 disabled:opacity-50"><CalendarDays size={14} /> Planifier les 6 prochaines semaines</button>}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}

      {!loading && !loadError && tab === 'sessions' && (
        <div className="mt-5 space-y-4">
          {visibleSharedSessions.map((session) => {
            const group = groupsById[session.premium_group_id];
            const roster = memberships.filter((item) => item.premium_group_id === session.premium_group_id && membershipCovers(item, session.scheduled_date));
            const sessionHomework = homework.filter((item) => item.premium_session_id === session.id);
            return (
              <article key={session.id} className="overflow-hidden rounded-2xl border border-border bg-card">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 border-b border-border bg-slate-50 px-5 py-4">
                  <div><p className="text-xs font-black uppercase tracking-wide text-primary">{displayDate(session.scheduled_date)} · {String(session.start_time).slice(0, 5)}</p><h2 className="mt-1 text-lg font-black">{group?.name || 'Atelier Premium'}</h2><p className="mt-1 text-xs text-muted-foreground">{teachersById[session.teacher_id]?.full_name || 'Enseignant'} · {roster.length} apprenant(s) · {sessionHomework.length} demande(s) reçue(s)</p></div>
                  <div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${PREMIUM_SESSION_STATUS_COLORS[session.status]}`}>{STATUS_LABELS[session.status]}</span>{session.status === 'Scheduled' && <button onClick={() => updateSessionStatus(session, 'Confirmed')} className="rounded-md border border-border bg-white px-3 py-1.5 text-xs font-bold">Confirmer</button>}{session.status !== 'Completed' && session.status !== 'Cancelled' && <button onClick={() => updateSessionStatus(session, 'Completed')} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-white"><CheckCircle2 size={13} /> Terminer</button>}{canManage && session.status !== 'Cancelled' && session.status !== 'Completed' && <button onClick={() => updateSessionStatus(session, 'Cancelled')} className="px-2 py-1 text-xs font-bold text-rose-700">Annuler</button>}</div>
                </div>
                <div className="divide-y divide-border">
                  {roster.map((membership) => {
                    const student = studentsById[membership.student_id];
                    const submission = sessionHomework.find((item) => item.student_id === membership.student_id);
                    const marked = attendance.find((item) => item.premium_session_id === session.id && item.student_id === membership.student_id);
                    return <div key={membership.id} className="grid grid-cols-1 lg:grid-cols-[1fr_auto_auto] gap-3 lg:items-center px-5 py-3"><div><p className="text-sm font-bold">{student?.full_name || 'Apprenant'}</p><p className="text-[11px] text-muted-foreground">NIV {student?.niveau_cefr || '—'} · {submission ? `Devoir ${submission.status === 'Prepared' ? 'prêt' : 'reçu'}` : 'Aucun devoir envoyé'}</p></div><div className="flex flex-wrap gap-1">{Object.entries(ATTENDANCE_LABELS).map(([value, label]) => <button key={value} aria-label={`${student?.full_name || 'Apprenant'} : ${label}`} aria-pressed={marked?.status === value} onClick={() => setStudentAttendance(session, membership.student_id, value)} className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${marked?.status === value ? PREMIUM_ATTENDANCE_STATUS_COLORS[value] : 'border-border bg-white text-muted-foreground'}`}>{label}</button>)}</div>{submission && <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800"><BookOpenCheck size={13} /> {submission.title}</span>}</div>;
                  })}
                  {!roster.length && <p className="px-5 py-6 text-center text-xs text-muted-foreground">Aucun apprenant sur la liste à cette date.</p>}
                </div>
                {canManage && session.status !== 'Completed' && session.status !== 'Cancelled' && (
                  <div className="flex flex-col sm:flex-row sm:items-end gap-2 border-t border-border bg-muted/20 px-5 py-3">
                    <label className="text-[10px] font-bold uppercase text-muted-foreground">Nouvelle date<input type="date" value={rescheduleDrafts[session.id]?.scheduled_date || session.scheduled_date} onChange={(event) => setRescheduleDrafts((current) => ({ ...current, [session.id]: { ...current[session.id], scheduled_date: event.target.value } }))} className="mt-1 block rounded-md border border-border bg-white px-2 py-1.5 text-xs font-medium text-foreground" /></label>
                    <label className="text-[10px] font-bold uppercase text-muted-foreground">Nouvelle heure<input type="time" value={rescheduleDrafts[session.id]?.start_time || String(session.start_time).slice(0, 5)} onChange={(event) => setRescheduleDrafts((current) => ({ ...current, [session.id]: { ...current[session.id], start_time: event.target.value } }))} className="mt-1 block rounded-md border border-border bg-white px-2 py-1.5 text-xs font-medium text-foreground" /></label>
                    <button disabled={saving} onClick={() => rescheduleSession(session)} className="rounded-md border border-border bg-white px-3 py-2 text-xs font-bold hover:bg-muted disabled:opacity-50">Replanifier</button>
                  </div>
                )}
              </article>
            );
          })}
          {!visibleSharedSessions.length && <div className="rounded-2xl border border-dashed border-border p-12 text-center"><CalendarDays className="mx-auto text-muted-foreground/40" /><p className="mt-3 text-sm font-bold">Aucune séance partagée récente ou à venir</p><p className="mt-1 text-xs text-muted-foreground">Générez le planning depuis un atelier.</p></div>}
        </div>
      )}

      {!loading && !loadError && tab === 'legacy' && (
        <div className="mt-5 rounded-2xl border border-border bg-card overflow-hidden">
          <div className="border-b border-border px-5 py-4"><h2 className="font-bold">Anciennes séances individuelles</h2><p className="mt-1 text-xs text-muted-foreground">Conservées en lecture pour ne perdre aucun historique.</p></div>
          <div className="divide-y divide-border">{legacySessions.map((session) => <div key={session.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-5 py-3"><div><p className="text-sm font-bold">{studentsById[session.student_id]?.full_name || 'Apprenant'}</p><p className="text-xs text-muted-foreground">{displayDate(session.scheduled_date)} · {String(session.start_time).slice(0, 5)} · {teachersById[session.teacher_id]?.full_name || '—'}</p></div><span className={`self-start rounded-full px-2.5 py-1 text-xs font-bold ${PREMIUM_SESSION_STATUS_COLORS[session.status]}`}>{STATUS_LABELS[session.status]}</span></div>)}{!legacySessions.length && <p className="px-5 py-8 text-center text-xs text-muted-foreground">Aucun historique individuel.</p>}</div>
        </div>
      )}
    </div>
  );
}
