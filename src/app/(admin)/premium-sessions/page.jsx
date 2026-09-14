'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { entities } from '@/lib/entities';
import { getMyTeacher, getTeacherDirectory } from '@/lib/teacher-directory';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import { CalendarDays, CheckCircle2, Clock3, Crown, UserRound, UsersRound } from 'lucide-react';
import { PREMIUM_SESSION_STATUS_COLORS } from '@/lib/statusColors';

const STATUS_LABELS = {
  Scheduled: 'Planifiée', Confirmed: 'Confirmée', Completed: 'Terminée',
  Cancelled: 'Annulée', Missed: 'Absence',
};

function dateString(date) {
  return date.toISOString().slice(0, 10);
}

function nextSaturday() {
  const date = new Date();
  const shift = (6 - date.getDay() + 7) % 7;
  date.setDate(date.getDate() + shift);
  return dateString(date);
}

function mondayOf(value = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  return dateString(date);
}

function isWeekend(value) {
  if (!value) return false;
  const day = new Date(`${value}T12:00:00`).getDay();
  return day === 0 || day === 6;
}

function displayDate(value) {
  return new Intl.DateTimeFormat('fr-MA', { weekday: 'long', day: 'numeric', month: 'long' })
    .format(new Date(`${value}T12:00:00`));
}

export default function PremiumSessionsPage() {
  const { role } = useAuth();
  const canSchedule = role === 'admin' || role === 'director';
  const [sessions, setSessions] = useState([]);
  const [students, setStudents] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [myTeacher, setMyTeacher] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState('upcoming');
  const [form, setForm] = useState({ student_id: '', teacher_id: '', scheduled_date: nextSaturday(), start_time: '10:00', focus_note: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sessionRows, studentRows, teacherRows, groupRows, teacher] = await Promise.all([
        entities.PremiumSession.list('-scheduled_date', 1000),
        entities.Student.filter({ plan_type: 'Premium' }, 'full_name', 1000),
        getTeacherDirectory(),
        entities.Group.list('name', 500),
        getMyTeacher().catch(() => null),
      ]);
      setSessions(sessionRows);
      setStudents(studentRows);
      setTeachers(teacherRows);
      setGroups(groupRows);
      setMyTeacher(teacher);
      if (!canSchedule && teacher?.id) setForm((current) => ({ ...current, teacher_id: teacher.id }));
    } catch (error) {
      toast.error(error?.message || 'Impossible de charger les séances Premium.');
    } finally {
      setLoading(false);
    }
  }, [canSchedule]);

  useEffect(() => { load(); }, [load]);

  const studentsById = useMemo(() => Object.fromEntries(students.map((student) => [student.id, student])), [students]);
  const teachersById = useMemo(() => Object.fromEntries(teachers.map((teacher) => [teacher.id, teacher])), [teachers]);
  const groupsById = useMemo(() => Object.fromEntries(groups.map((group) => [group.id, group])), [groups]);
  const today = dateString(new Date());
  const currentWeek = mondayOf();
  const usedThisWeek = new Set(sessions.filter((session) => session.week_start === currentWeek && session.status !== 'Cancelled').map((session) => session.student_id));
  const targetWeek = mondayOf(`${form.scheduled_date}T12:00:00`);
  const targetWeekUsed = new Set(sessions.filter((session) => session.week_start === targetWeek && session.status !== 'Cancelled').map((session) => session.student_id));
  const eligibleStudents = students.filter((student) => {
    const startOkay = !student.premium_start_date || form.scheduled_date >= student.premium_start_date;
    const endOkay = !student.premium_end_date || form.scheduled_date <= student.premium_end_date;
    return startOkay && endOkay && !targetWeekUsed.has(student.id);
  });
  const visibleSessions = sessions
    .filter((session) => filter === 'all' || (filter === 'upcoming' ? session.scheduled_date >= today && session.status !== 'Cancelled' : session.status === filter))
    .sort((a, b) => `${a.scheduled_date} ${a.start_time}`.localeCompare(`${b.scheduled_date} ${b.start_time}`));

  const createSession = async (event) => {
    event.preventDefault();
    if (!form.student_id || !form.teacher_id || !form.scheduled_date || !form.start_time) {
      toast.error('Choisissez l’apprenant, l’enseignant, la date et l’heure.');
      return;
    }
    if (!isWeekend(form.scheduled_date)) {
      toast.error('La séance Premium doit être planifiée samedi ou dimanche.');
      return;
    }
    const student = studentsById[form.student_id];
    if ((student?.premium_start_date && form.scheduled_date < student.premium_start_date)
      || (student?.premium_end_date && form.scheduled_date > student.premium_end_date)) {
      toast.error('Cette date est en dehors de la période Premium de l’apprenant.');
      return;
    }
    setSaving(true);
    try {
      await entities.PremiumSession.create({
        student_id: form.student_id,
        teacher_id: form.teacher_id,
        group_id: student?.groupe_id || null,
        scheduled_date: form.scheduled_date,
        start_time: form.start_time,
        duration_minutes: 60,
        status: 'Scheduled',
        focus_note: form.focus_note.trim() || null,
      });
      toast.success('Séance Premium d’une heure planifiée');
      setForm((current) => ({ ...current, student_id: '', focus_note: '' }));
      await load();
    } catch (error) {
      if (error?.code === '23505') toast.error('Cet apprenant possède déjà une séance Premium pour cette semaine.');
    } finally {
      setSaving(false);
    }
  };

  const chooseStudent = (studentId) => {
    const student = studentsById[studentId];
    const regularGroup = groupsById[student?.groupe_id];
    setForm((current) => ({
      ...current,
      student_id: studentId,
      teacher_id: regularGroup?.teacher_id || current.teacher_id,
    }));
  };

  const updateStatus = async (session, status) => {
    try {
      await entities.PremiumSession.update(session.id, {
        status,
        completed_at: status === 'Completed' ? new Date().toISOString() : null,
      });
      setSessions((current) => current.map((item) => item.id === session.id ? { ...item, status } : item));
      toast.success(`Séance ${STATUS_LABELS[status].toLowerCase()}`);
    } catch {
      // entities.js already reports the database error.
    }
  };

  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto">
      <div className="relative overflow-hidden rounded-2xl bg-slate-950 text-white px-6 py-6 mb-6">
        <div className="absolute -right-14 -top-20 h-56 w-56 rounded-full bg-amber-400/20 blur-3xl" />
        <div className="relative flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 text-amber-300 text-xs font-bold uppercase tracking-[0.2em] mb-3"><Crown size={15} /> Programme Premium</div>
            <h1 className="text-2xl font-bold">Heures Premium du week-end</h1>
            <p className="text-sm text-slate-300 mt-1">Une séance ciblée de 60 minutes par apprenant Premium, chaque semaine.</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-white/10 px-4 py-2"><p className="text-xl font-bold">{students.length}</p><p className="text-[10px] text-slate-300 uppercase">Premium</p></div>
            <div className="rounded-xl bg-white/10 px-4 py-2"><p className="text-xl font-bold">{usedThisWeek.size}</p><p className="text-[10px] text-slate-300 uppercase">Planifiées</p></div>
            <div className="rounded-xl bg-amber-400 px-4 py-2 text-slate-950"><p className="text-xl font-bold">{Math.max(0, students.length - usedThisWeek.size)}</p><p className="text-[10px] uppercase">À planifier</p></div>
          </div>
        </div>
      </div>

      {canSchedule && (
        <form onSubmit={createSession} className="bg-card border border-border rounded-xl p-5 mb-6">
          <div className="flex items-center gap-2 mb-4"><CalendarDays size={17} className="text-primary" /><h2 className="font-semibold">Planifier une heure Premium</h2></div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
            <label className="text-xs font-semibold text-muted-foreground">APPRENANT
              <select className="mt-1 w-full border border-border rounded-md px-3 py-2.5 text-sm bg-white" value={form.student_id} onChange={(event) => chooseStudent(event.target.value)}>
                <option value="">— Choisir —</option>
                {eligibleStudents.map((student) => <option key={student.id} value={student.id}>{student.full_name}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-muted-foreground">ENSEIGNANT
              <select className="mt-1 w-full border border-border rounded-md px-3 py-2.5 text-sm bg-white" value={form.teacher_id} onChange={(event) => setForm((current) => ({ ...current, teacher_id: event.target.value }))}>
                <option value="">— Choisir —</option>
                {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.full_name}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-muted-foreground">SAMEDI / DIMANCHE
              <input type="date" className="mt-1 w-full border border-border rounded-md px-3 py-2 text-sm bg-white" value={form.scheduled_date} onChange={(event) => setForm((current) => ({ ...current, scheduled_date: event.target.value, student_id: '' }))} />
            </label>
            <label className="text-xs font-semibold text-muted-foreground">HEURE
              <input type="time" className="mt-1 w-full border border-border rounded-md px-3 py-2 text-sm bg-white" value={form.start_time} onChange={(event) => setForm((current) => ({ ...current, start_time: event.target.value }))} />
            </label>
            <label className="text-xs font-semibold text-muted-foreground">OBJECTIF (FACULTATIF)
              <input className="mt-1 w-full border border-border rounded-md px-3 py-2 text-sm bg-white" maxLength={2000} placeholder="Conversation, examen…" value={form.focus_note} onChange={(event) => setForm((current) => ({ ...current, focus_note: event.target.value }))} />
            </label>
          </div>
          <div className="flex items-center justify-between gap-3 mt-4">
            <p className="text-xs text-muted-foreground">La plateforme empêche deux séances actives pour le même apprenant pendant la même semaine.</p>
            <button disabled={saving} className="shrink-0 px-5 py-2.5 rounded-md bg-primary text-white text-sm font-semibold disabled:opacity-50">{saving ? 'Planification…' : 'Planifier 60 min'}</button>
          </div>
        </form>
      )}

      {!canSchedule && myTeacher && <p className="text-sm text-muted-foreground mb-4">Séances confiées à <strong className="text-foreground">{myTeacher.full_name}</strong>.</p>}

      <div className="flex flex-wrap gap-2 mb-4">
        {[['upcoming', 'À venir'], ['Scheduled', 'Planifiées'], ['Confirmed', 'Confirmées'], ['Completed', 'Terminées'], ['all', 'Toutes']].map(([value, label]) => (
          <button key={value} onClick={() => setFilter(value)} className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${filter === value ? 'bg-primary text-white border-primary' : 'bg-white border-border text-muted-foreground hover:bg-muted'}`}>{label}</button>
        ))}
      </div>

      {loading ? (
        <div className="rounded-xl border border-border p-12 text-center text-sm text-muted-foreground">Chargement des séances…</div>
      ) : visibleSessions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-12 text-center">
          <Crown size={30} className="mx-auto text-amber-500 mb-3" />
          <p className="font-semibold">Aucune séance dans cette vue</p>
          <p className="text-sm text-muted-foreground mt-1">Les heures Premium planifiées apparaîtront ici.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {visibleSessions.map((session) => {
            const student = studentsById[session.student_id];
            const teacher = teachersById[session.teacher_id];
            const group = groupsById[session.group_id];
            return (
              <article key={session.id} className="bg-card border border-border rounded-xl p-5 hover:border-amber-300 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-amber-600 uppercase tracking-wider">{displayDate(session.scheduled_date)}</p>
                    <h3 className="font-bold text-lg mt-1">{student?.full_name || 'Apprenant'}</h3>
                  </div>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${PREMIUM_SESSION_STATUS_COLORS[session.status]}`}>{STATUS_LABELS[session.status]}</span>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-4 text-sm">
                  <p className="flex items-center gap-2"><Clock3 size={14} className="text-muted-foreground" /> {String(session.start_time).slice(0, 5)} · 60 min</p>
                  <p className="flex items-center gap-2"><UserRound size={14} className="text-muted-foreground" /> {teacher?.full_name || '—'}</p>
                  {group && <Link href={`/groups/${group.id}`} className="col-span-2 flex items-center gap-2 text-primary hover:underline"><UsersRound size={14} /> {group.name}</Link>}
                </div>
                {session.focus_note && <p className="mt-4 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-sm text-amber-950">Objectif : {session.focus_note}</p>}
                <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-border">
                  {session.status !== 'Completed' && session.status !== 'Cancelled' && (
                    <button onClick={() => updateStatus(session, 'Completed')} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-600 text-white text-xs font-semibold"><CheckCircle2 size={13} /> Terminée</button>
                  )}
                  {session.status === 'Scheduled' && <button onClick={() => updateStatus(session, 'Confirmed')} className="px-3 py-1.5 rounded-md border border-border text-xs font-semibold hover:bg-muted">Confirmer</button>}
                  {session.status !== 'Cancelled' && session.status !== 'Completed' && <button onClick={() => updateStatus(session, 'Missed')} className="px-3 py-1.5 rounded-md border border-red-200 text-red-600 text-xs font-semibold hover:bg-red-50">Absence</button>}
                  {canSchedule && session.status !== 'Cancelled' && session.status !== 'Completed' && <button onClick={() => updateStatus(session, 'Cancelled')} className="ml-auto px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-red-600">Annuler</button>}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
