'use client';

// One online course for operations staff (D2–D12): course record, weekly pattern,
// dated lessons with this-only / following edits, cancellations, substitutes, guests,
// consent, attendance and join evidence. Management-only actions are hidden from the
// receptionist and refused by the database for any other caller.
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Plus, Trash2, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/context/AuthContext';
import { hasCapability } from '@/lib/roleAccess.mjs';
import { getBrowserClient } from '@/lib/supabase';
import { getTeacherDirectory } from '@/lib/teacher-directory';
import { useOnlineRead, useOnlineRefresh, onlineRpc, onlinePost, civilDate, casablancaTime, WEEKDAYS } from '@/lib/online/queries';
import { onlineErrorText } from '@/lib/online/reasons.mjs';
import { ATTENDANCE_STATUS_COLORS, ENROLLMENT_STATUS_COLORS, ONLINE_COURSE_STATUS_COLORS, ONLINE_LESSON_STATUS_COLORS } from '@/lib/statusColors';

const input = 'w-full rounded-md border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary';
const label = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground';
const COURSE_STATUS = { draft: 'En préparation', active: 'Actif', closed: 'Clôturé' };
const LESSON_STATUS = { scheduled: 'Prévu', cancelled: 'Annulé', completed: 'Fait' };
const ATTENDANCE = ['Présent', 'Absent', 'Retard', 'Justifié'];
const MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0];

function useCommand(refresh) {
  const [busy, setBusy] = useState(false);
  const run = async (fn, success) => {
    setBusy(true);
    try {
      const result = await fn();
      if (result && result.ok === false) { toast.error(onlineErrorText(result.body)); return false; }
      if (success) toast.success(success);
      await refresh();
      return true;
    } catch (error) { toast.error(onlineErrorText(error)); return false; }
    finally { setBusy(false); }
  };
  return [busy, run];
}

function CourseForm({ group, course, teachers, onDone, run, busy }) {
  const [form, setForm] = useState(() => ({
    teacher_id: course?.teacher_id || '', audience: course?.audience || 'adult',
    capacity: course?.capacity ?? (group.session_type === 'Online One-to-One' ? 1 : 10),
    lesson_minutes: course?.lesson_minutes ?? 90, term_start: course?.term_start || '', term_end: course?.term_end || '',
  }));
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const submit = async e => {
    e.preventDefault();
    const ok = await run(() => onlineRpc('online_save_course', { p_group: group.id, p_expected_version: course?.version ?? null,
      p_course: { ...form, capacity: Number(form.capacity), lesson_minutes: Number(form.lesson_minutes) } }), course ? 'Cours mis à jour' : 'Fiche de cours créée');
    if (ok) onDone();
  };
  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <div><label className={label} htmlFor="course-teacher">Enseignant du cours</label>
        <select id="course-teacher" className={input} required value={form.teacher_id} onChange={e => set('teacher_id', e.target.value)}>
          <option value="">— Choisir —</option>{teachers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
        </select></div>
      <div><label className={label} htmlFor="course-audience">Public</label>
        <select id="course-audience" className={input} value={form.audience} onChange={e => set('audience', e.target.value)}>
          <option value="adult">Adultes</option><option value="child">Enfants (consentement vidéo requis)</option>
        </select></div>
      <div><label className={label} htmlFor="course-capacity">Capacité (places)</label>
        <input id="course-capacity" type="number" min={1} max={12} className={input} value={form.capacity} onChange={e => set('capacity', e.target.value)} /></div>
      <div><label className={label} htmlFor="course-minutes">Durée d’un cours (minutes)</label>
        <input id="course-minutes" type="number" min={15} max={240} className={input} value={form.lesson_minutes} onChange={e => set('lesson_minutes', e.target.value)} /></div>
      <div><label className={label} htmlFor="course-start">Début de la période</label>
        <input id="course-start" type="date" required className={input} value={form.term_start} onChange={e => set('term_start', e.target.value)} /></div>
      <div><label className={label} htmlFor="course-end">Fin de la période (26 semaines au plus)</label>
        <input id="course-end" type="date" required className={input} value={form.term_end} onChange={e => set('term_end', e.target.value)} /></div>
      <div className="sm:col-span-2 flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onDone}>Annuler</Button><Button type="submit" disabled={busy}>Enregistrer</Button></div>
    </form>
  );
}

function PatternEditor({ group, course, run, busy }) {
  const [rows, setRows] = useState(() => course.patterns.filter(p => p.valid_from <= p.valid_to)
    .map(p => ({ weekday: p.weekday, start_time: p.start_time, minutes: p.minutes })));
  const [from, setFrom] = useState('');
  const set = (i, k, v) => setRows(r => r.map((x, j) => j === i ? { ...x, [k]: v } : x));
  const save = () => run(() => onlineRpc('online_save_pattern', { p_group: group.id, p_expected_version: course.version, p_from_date: from || null,
    p_patterns: rows.map(r => ({ weekday: Number(r.weekday), start_time: r.start_time, minutes: Number(r.minutes) })) }), 'Horaire enregistré, cours générés');
  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[1fr_7rem_6rem_auto] items-end gap-2">
          <div><label className={label} htmlFor={`pattern-day-${i}`}>Jour</label>
            <select id={`pattern-day-${i}`} className={input} value={r.weekday} onChange={e => set(i, 'weekday', e.target.value)}>
              {MONDAY_FIRST.map(d => <option key={d} value={d}>{WEEKDAYS[d]}</option>)}
            </select></div>
          <div><label className={label} htmlFor={`pattern-time-${i}`}>Heure</label><input id={`pattern-time-${i}`} type="time" step={60} className={input} value={r.start_time} onChange={e => set(i, 'start_time', e.target.value)} /></div>
          <div><label className={label} htmlFor={`pattern-minutes-${i}`}>Minutes</label><input id={`pattern-minutes-${i}`} type="number" min={15} max={240} className={input} value={r.minutes} onChange={e => set(i, 'minutes', e.target.value)} /></div>
          <Button type="button" variant="ghost" size="icon" aria-label="Retirer ce créneau" onClick={() => setRows(x => x.filter((_, j) => j !== i))}><Trash2 /></Button>
        </div>
      ))}
      <div className="flex flex-wrap items-end gap-3">
        <Button type="button" variant="outline" size="sm" onClick={() => setRows(x => [...x, { weekday: 1, start_time: '18:00', minutes: course.lesson_minutes }])} disabled={rows.length >= 7}><Plus /> Ajouter un créneau</Button>
        <div><label className={label} htmlFor="pattern-from">À partir du (Casablanca)</label><input id="pattern-from" type="date" className={input} value={from} onChange={e => setFrom(e.target.value)} /></div>
        <Button type="button" onClick={save} disabled={busy}>Enregistrer et générer les cours</Button>
      </div>
      <p className="text-xs text-muted-foreground">Les cours passés, annulés, faits ou modifiés individuellement sont conservés.</p>
    </div>
  );
}

function LessonDialog({ mode, lesson, management, teachers, onClose, run, busy }) {
  const [form, setForm] = useState({ date: lesson.local_date, start_time: lesson.local_time,
    minutes: Math.round((Date.parse(lesson.ends_at) - Date.parse(lesson.starts_at)) / 60000), scope: 'this', reason: '', teacher: lesson.teacher_id });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const submit = async e => {
    e.preventDefault();
    const ok = mode === 'cancel'
      ? await run(() => onlinePost('/api/online/lessons/cancel', { lesson: lesson.id, version: lesson.version, scope: form.scope, reason: form.reason }), 'Cours annulé, familles prévenues')
      : mode === 'reschedule'
        ? await run(() => onlinePost('/api/online/lessons/reschedule', { lesson: lesson.id, version: lesson.version, scope: form.scope,
            changes: { date: form.date, start_time: form.start_time, minutes: Number(form.minutes) } }), 'Cours déplacé, familles prévenues')
        : await run(() => onlineRpc('online_set_lesson_teacher', { p_lesson: lesson.id, p_expected_version: lesson.version, p_teacher: form.teacher }), 'Enseignant du cours mis à jour');
    if (ok) onClose();
  };
  const title = mode === 'cancel' ? 'Annuler le cours' : mode === 'reschedule' ? 'Déplacer le cours' : 'Remplaçant pour ce cours';
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-muted-foreground">{civilDate(lesson.local_date)} · {lesson.local_time}–{lesson.local_end_time}</p>
          {mode === 'reschedule' && <div className="grid grid-cols-3 gap-2">
            <div className="col-span-3 sm:col-span-1"><label className={label} htmlFor="move-date">Date</label><input id="move-date" type="date" className={input} value={form.date} onChange={e => set('date', e.target.value)} /></div>
            <div><label className={label} htmlFor="move-time">Heure</label><input id="move-time" type="time" step={60} className={input} value={form.start_time} onChange={e => set('start_time', e.target.value)} /></div>
            <div><label className={label} htmlFor="move-minutes">Minutes</label><input id="move-minutes" type="number" min={15} max={240} className={input} value={form.minutes} onChange={e => set('minutes', e.target.value)} /></div>
          </div>}
          {mode === 'cancel' && <div><label className={label} htmlFor="cancel-reason">Motif (envoyé aux familles)</label><input id="cancel-reason" className={input} required maxLength={200} value={form.reason} onChange={e => set('reason', e.target.value)} /></div>}
          {mode === 'teacher' && <div><label className={label} htmlFor="sub-teacher">Enseignant</label>
            <select id="sub-teacher" className={input} value={form.teacher} onChange={e => set('teacher', e.target.value)}>{teachers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}</select></div>}
          {mode !== 'teacher' && <fieldset className="space-y-1 text-sm">
            <legend className={label}>Portée</legend>
            <label className="flex items-center gap-2"><input type="radio" name="scope" checked={form.scope === 'this'} onChange={() => set('scope', 'this')} /> Ce cours uniquement</label>
            {(mode === 'cancel' || management) && <label className="flex items-center gap-2"><input type="radio" name="scope" checked={form.scope === 'following'} onChange={() => set('scope', 'following')} /> Ce cours et les suivants</label>}
          </fieldset>}
          <DialogFooter className="gap-2"><Button type="button" variant="ghost" onClick={onClose}>Fermer</Button><Button type="submit" disabled={busy}>Valider</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function GuestPicker({ lesson, run, busy }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [kind, setKind] = useState('trial');
  const [note, setNote] = useState('');
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); return undefined; }
    const t = setTimeout(async () => {
      const { data } = await getBrowserClient().from('students').select('id, full_name').is('deleted_at', null)
        .ilike('full_name', `%${q.replace(/[%_,()]/g, ' ')}%`).order('full_name').limit(8);
      setResults(data || []);
    }, 250);
    return () => clearTimeout(t);
  }, [query]);
  const add = id => run(() => onlineRpc('online_add_guest', { p_lesson: lesson.id, p_student: id, p_kind: kind, p_note: note || null }), 'Invité ajouté');
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <p className="text-sm font-medium">Ajouter un invité à ce cours</p>
      <div className="grid gap-2 sm:grid-cols-[1fr_9rem]">
        <input aria-label="Rechercher un apprenant" className={input} placeholder="Nom de l’apprenant" value={query} onChange={e => setQuery(e.target.value)} />
        <select aria-label="Type d’invitation" className={input} value={kind} onChange={e => setKind(e.target.value)}><option value="trial">Essai</option><option value="override">Exception</option></select>
      </div>
      <input aria-label="Note de l’accueil" className={input} maxLength={200} placeholder="Note (visible par l’équipe uniquement)" value={note} onChange={e => setNote(e.target.value)} />
      {results.map(s => <div key={s.id} className="flex items-center justify-between text-sm"><span>{s.full_name}</span><Button size="sm" variant="outline" disabled={busy} onClick={() => add(s.id)}>Inviter</Button></div>)}
    </div>
  );
}

function LessonDetail({ groupId, lessonId, run, busy }) {
  const detail = useOnlineRead('online_get_course', { p_group: groupId, p_lesson: lessonId }, { roles: ['director', 'admin', 'receptionist'] });
  const lesson = detail.data?.lesson;
  const [rows, setRows] = useState({});
  useEffect(() => { if (lesson) setRows(Object.fromEntries(lesson.attendance.map(a => [a.student_id, a.status || '']))); }, [lesson]);
  if (!lesson) return detail.isError ? <p className="text-sm text-red-800">{onlineErrorText(detail.error)}</p> : <p className="text-sm text-muted-foreground">Chargement…</p>;
  const save = () => run(() => onlineRpc('online_save_attendance', { p_lesson: lesson.id, p_expected_version: lesson.version, p_report: null,
    p_rows: Object.entries(rows).filter(([, s]) => s).map(([student_id, status]) => ({ student_id, status })) }), 'Présences enregistrées');
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">{civilDate(lesson.local_date)} · {lesson.local_time}–{lesson.local_end_time} · {lesson.teacher_name}</p>
        {lesson.status !== 'cancelled' && <Button asChild size="sm" variant="outline"><a href={`/online/room/${lesson.id}`} data-room-entry><Video /> Salle</a></Button>}
      </div>
      {lesson.report && <p className="rounded-md bg-muted/50 p-3 text-sm">Compte rendu : {lesson.report}</p>}
      <div className="divide-y overflow-hidden rounded-lg border">
        {lesson.attendance.length === 0 && <p className="p-4 text-sm text-muted-foreground">Aucun apprenant confirmé ou invité.</p>}
        {lesson.attendance.map(a => (
          <div key={a.student_id} className="grid gap-2 p-3 sm:grid-cols-[1fr_9rem] sm:items-center">
            <div>
              <Link href={`/students/${a.student_id}`} className="font-medium hover:underline">{a.full_name}</Link>
              {a.is_guest && <span className="ml-2 rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-900">Invité</span>}
              {a.status && <span className={`ml-2 rounded px-2 py-0.5 text-xs ${ATTENDANCE_STATUS_COLORS[a.status]}`}>{a.status}</span>}
              <p className="text-xs text-muted-foreground">
                {a.joined_at ? `A rejoint à ${casablancaTime(a.joined_at)}` : a.first_pass_at ? `Accès ouvert à ${casablancaTime(a.first_pass_at)}` : 'Pas encore connecté'}
                {a.note ? ` · ${a.note}` : ''}
              </p>
            </div>
            <select aria-label={`Présence de ${a.full_name}`} className={input} value={rows[a.student_id] || ''} disabled={lesson.status === 'cancelled'}
              onChange={e => setRows(x => ({ ...x, [a.student_id]: e.target.value }))}><option value="">—</option>{ATTENDANCE.map(s => <option key={s}>{s}</option>)}</select>
          </div>
        ))}
      </div>
      {lesson.status !== 'cancelled' && <Button size="sm" onClick={save} disabled={busy}>Enregistrer les présences</Button>}
      <div className="space-y-2">
        <p className="text-sm font-medium">Invités</p>
        {lesson.guests.length === 0 && <p className="text-sm text-muted-foreground">Aucun invité.</p>}
        {lesson.guests.map(g => <div key={g.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
          <span>{g.full_name} · {g.kind === 'trial' ? 'Essai' : 'Exception'}{g.note ? ` · ${g.note}` : ''}</span>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => onlineRpc('online_remove_guest', { p_guest: g.id }), 'Invité retiré')}>Retirer</Button>
        </div>)}
        {lesson.status === 'scheduled' && Date.parse(lesson.ends_at) > Date.now() && <GuestPicker lesson={lesson} run={run} busy={busy} />}
      </div>
    </div>
  );
}

export default function OnlineCourse() {
  const { id } = useParams();
  const { role } = useAuth();
  const management = hasCapability(role, 'canManageOnlineCourses');
  const course = useOnlineRead('online_get_course', { p_group: id }, { roles: ['director', 'admin', 'receptionist'] });
  const refresh = useOnlineRefresh();
  const [busy, run] = useCommand(refresh);
  const [teachers, setTeachers] = useState([]);
  const [editing, setEditing] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [selected, setSelected] = useState(null);
  useEffect(() => { getTeacherDirectory().then(setTeachers).catch(() => setTeachers([])); }, []);
  const data = course.data, c = data?.course;
  const lessons = useMemo(() => c?.lessons || [], [c]);
  const child = c?.audience === 'child';

  if (course.isPending) return <p className="p-8 text-sm text-muted-foreground">Chargement…</p>;
  if (course.isError) return <p className="m-8 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{onlineErrorText(course.error)}</p>;
  const g = data.group;
  const courseAction = action => run(() => onlinePost(`/api/online/courses/${action}`, { group: g.id, version: c.version }),
    action === 'activate' ? 'Cours activé : salle créée' : 'Cours clôturé : accès révoqués');
  return (
    <div className="mx-auto max-w-6xl space-y-8 p-4 lg:p-8">
      <div>
        <Link href="/online" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={15} /> Cours en ligne</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">{g.name}</h1>
          <span className="text-sm text-muted-foreground">{g.session_type} · {g.niveau}</span>
          {c && <span className={`rounded px-2 py-0.5 text-xs ${ONLINE_COURSE_STATUS_COLORS[c.status]}`}>{COURSE_STATUS[c.status]}</span>}
        </div>
      </div>

      <section className="rounded-xl border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Fiche du cours</h2>
          {management && c && !editing && c.status !== 'closed' && <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Modifier</Button>
            {c.status === 'draft' && <Button size="sm" onClick={() => courseAction('activate')} disabled={busy}>Activer le cours</Button>}
            {c.status === 'active' && <Button size="sm" variant="destructive" onClick={() => window.confirm('Clôturer ce cours ? Tous les accès en cours seront révoqués.') && courseAction('close')} disabled={busy}>Clôturer</Button>}
          </div>}
        </div>
        {(!c || editing) && (management
          ? <CourseForm group={g} course={c} teachers={teachers} run={run} busy={busy} onDone={() => setEditing(false)} />
          : <p className="text-sm text-muted-foreground">La fiche de ce cours est créée par la direction.</p>)}
        {c && !editing && <dl className="grid gap-3 text-sm sm:grid-cols-4">
          <div><dt className="text-muted-foreground">Enseignant</dt><dd>{c.teacher_name}</dd></div>
          <div><dt className="text-muted-foreground">Public</dt><dd>{child ? 'Enfants' : 'Adultes'}</dd></div>
          <div><dt className="text-muted-foreground">Places</dt><dd>{data.roster.length}/{c.capacity}</dd></div>
          <div><dt className="text-muted-foreground">Période</dt><dd>{c.term_start} → {c.term_end}</dd></div>
        </dl>}
      </section>

      {c && <section className="rounded-xl border bg-card p-4">
        <h2 className="mb-3 font-semibold">Horaire hebdomadaire <span className="text-sm font-normal text-muted-foreground">(heure de Casablanca)</span></h2>
        {management && c.status !== 'closed'
          ? <PatternEditor key={c.version} group={g} course={c} run={run} busy={busy} />
          : <p className="text-sm">{g.jours ? `${g.jours} · ${g.horaire || ''}` : 'Aucun horaire défini.'}</p>}
      </section>}

      {c && <section>
        <h2 className="mb-3 font-semibold">Cours</h2>
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[44rem] text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground"><tr><th className="p-3">Date</th><th className="p-3">Heure</th><th className="p-3">Enseignant</th><th className="p-3">Statut</th><th className="p-3">Suivi</th><th className="p-3" /></tr></thead>
            <tbody>
              {lessons.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">Aucun cours : enregistrez l’horaire hebdomadaire.</td></tr>}
              {lessons.map(l => {
                const future = Date.parse(l.starts_at) > Date.now();
                return <tr key={l.id} className={`border-t ${selected === l.id ? 'bg-muted/40' : ''}`}>
                  <td className="p-3">{civilDate(l.local_date)}</td>
                  <td className="p-3">{l.local_time}–{l.local_end_time}</td>
                  <td className="p-3">{l.teacher_name}{l.is_substitute && <span className="ml-1 rounded bg-violet-50 px-1.5 py-0.5 text-xs text-violet-800">remplaçant</span>}</td>
                  <td className="p-3"><span className={`rounded px-2 py-0.5 text-xs ${ONLINE_LESSON_STATUS_COLORS[l.status]}`}>{LESSON_STATUS[l.status]}</span>{l.detached && <span className="ml-1 text-xs text-muted-foreground">modifié</span>}{l.cancel_reason && <p className="text-xs text-muted-foreground">{l.cancel_reason}</p>}</td>
                  <td className="p-3 text-xs text-muted-foreground">{l.attendance_count} présence(s) · {l.guest_count} invité(s)</td>
                  <td className="p-3"><div className="flex flex-wrap justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setSelected(selected === l.id ? null : l.id)}>Détails</Button>
                    {l.status === 'scheduled' && future && c.status !== 'closed' && <Button size="sm" variant="ghost" onClick={() => setDialog({ mode: 'reschedule', lesson: l })}>Déplacer</Button>}
                    {l.status === 'scheduled' && Date.parse(l.ends_at) > Date.now() && c.status !== 'closed' && <Button size="sm" variant="ghost" onClick={() => setDialog({ mode: 'cancel', lesson: l })}>Annuler</Button>}
                    {management && l.status === 'scheduled' && Date.parse(l.ends_at) > Date.now() && c.status !== 'closed' && <Button size="sm" variant="ghost" onClick={() => setDialog({ mode: 'teacher', lesson: l })}>Remplaçant</Button>}
                  </div></td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
        {selected && <div className="mt-4 rounded-xl border bg-card p-4"><LessonDetail groupId={g.id} lessonId={selected} run={run} busy={busy} /></div>}
      </section>}

      <section>
        <h2 className="mb-3 font-semibold">Apprenants inscrits</h2>
        <div className="divide-y overflow-hidden rounded-xl border bg-card">
          {data.roster.length === 0 && <p className="p-4 text-sm text-muted-foreground">Aucune inscription. Inscrivez les apprenants depuis leur fiche ou depuis le CRM, comme pour un groupe en présentiel.</p>}
          {data.roster.map(s => (
            <div key={s.enrollment_id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/students/${s.student_id}`} className="font-medium hover:underline">{s.full_name}</Link>
                <span className={`rounded px-2 py-0.5 text-xs ${ENROLLMENT_STATUS_COLORS[s.enrollment_status] || ''}`}>{s.enrollment_status}</span>
                {s.unpaid && <span className="rounded bg-red-50 px-2 py-0.5 text-xs font-medium text-red-800">Impayé</span>}
                {child && (s.has_consent ? <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800">Consentement vidéo</span>
                  : <span className="rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-900">Consentement manquant</span>)}
              </div>
              {child && (s.has_consent
                ? management && <Button size="sm" variant="ghost" disabled={busy} onClick={() => window.confirm('Retirer le consentement vidéo ? L’enfant ne pourra plus rejoindre la salle.') && run(() => onlineRpc('online_revoke_consent', { p_student: s.student_id }), 'Consentement retiré')}>Retirer le consentement</Button>
                : <Button size="sm" variant="outline" disabled={busy} onClick={() => window.confirm('Confirmez que la ligne de consentement vidéo signée a été reçue.') && run(() => onlineRpc('online_record_consent', { p_student: s.student_id, p_note: null }), 'Consentement enregistré')}>Enregistrer le consentement</Button>)}
            </div>
          ))}
        </div>
      </section>

      {dialog && <LessonDialog key={`${dialog.mode}:${dialog.lesson.id}`} mode={dialog.mode} lesson={dialog.lesson} management={management} teachers={teachers}
        onClose={() => setDialog(null)} run={run} busy={busy} />}
    </div>
  );
}
