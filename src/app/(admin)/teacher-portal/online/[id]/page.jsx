'use client';

// Roster, attendance and the two-line lesson report for one online lesson (D8). The
// roster is a projection: first name + initial, level, attendance and a guest flag.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useOnlineRead, useOnlineRefresh, onlineRpc, civilDate } from '@/lib/online/queries';
import { onlineErrorText } from '@/lib/online/reasons.mjs';

const STATUSES = ['Présent', 'Absent', 'Retard', 'Justifié'];
const input = 'w-full rounded-md border border-border bg-white px-3 py-2 text-sm';

export default function TeacherOnlineLesson() {
  const { id } = useParams();
  const roster = useOnlineRead('online_get_lesson_roster', { p_lesson: id }, { roles: ['teacher'] });
  const refresh = useOnlineRefresh();
  const [rows, setRows] = useState({});
  const [report, setReport] = useState('');
  const [saving, setSaving] = useState(false);
  const data = roster.data;
  useEffect(() => {
    if (!data) return;
    setRows(Object.fromEntries(data.roster.map(r => [r.student_id, { status: r.attendance_status || '', note: r.attendance_note || '' }])));
    setReport(data.lesson.report || '');
  }, [data]);

  const save = async () => {
    setSaving(true);
    try {
      await onlineRpc('online_save_attendance', {
        p_lesson: id, p_expected_version: data.lesson.version, p_report: report,
        p_rows: Object.entries(rows).filter(([, r]) => r.status).map(([student_id, r]) => ({ student_id, status: r.status, note: r.note || null })),
      });
      toast.success('Présences enregistrées');
      await refresh();
    } catch (error) { toast.error(onlineErrorText(error)); }
    setSaving(false);
  };

  return (
    <div className="mx-auto max-w-3xl p-4 lg:p-8">
      <Link href="/teacher-portal/online" className="text-sm text-primary hover:underline">← Mes cours en ligne</Link>
      {roster.isPending && <p className="mt-4 text-sm text-muted-foreground">Chargement…</p>}
      {roster.isError && <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{onlineErrorText(roster.error)}</p>}
      {roster.isSuccess && !data && <p className="mt-4 rounded-lg border bg-card p-6 text-sm">Ce cours n’est pas disponible. La liste s’ouvre 24 heures avant le cours et reste visible 7 jours après.</p>}
      {data && <>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{data.lesson.course_name}</h1>
            <p className="text-sm text-muted-foreground">{civilDate(data.lesson.local_date)} · {data.lesson.local_time}–{data.lesson.local_end_time}{data.lesson.status === 'cancelled' ? ' · Annulé' : ''}</p>
          </div>
          {data.lesson.i_am_host && data.lesson.status !== 'cancelled' && <Button asChild className="min-h-11"><a href={`/online/room/${id}`} data-room-entry><Video /> Ouvrir la salle</a></Button>}
        </div>
        <div className="mt-6 divide-y overflow-hidden rounded-xl border bg-card">
          {data.roster.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">Aucun apprenant pour ce cours.</p>}
          {data.roster.map(r => (
            <div key={r.student_id} className="grid gap-2 p-3 sm:grid-cols-[1fr_10rem_1fr] sm:items-center">
              <div><p className="font-medium">{r.display_label}{r.is_guest && <span className="ml-2 rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-900">Invité</span>}</p><p className="text-xs text-muted-foreground">{r.niveau_cefr || 'Niveau à préciser'}</p></div>
              <select aria-label={`Présence de ${r.display_label}`} className={input} disabled={!data.lesson.can_write} value={rows[r.student_id]?.status || ''}
                onChange={e => setRows(x => ({ ...x, [r.student_id]: { ...x[r.student_id], status: e.target.value } }))}>
                <option value="">—</option>{STATUSES.map(s => <option key={s}>{s}</option>)}
              </select>
              <input aria-label={`Note pour ${r.display_label}`} className={input} maxLength={200} disabled={!data.lesson.can_write} placeholder="Note (facultatif)" value={rows[r.student_id]?.note || ''}
                onChange={e => setRows(x => ({ ...x, [r.student_id]: { ...x[r.student_id], note: e.target.value } }))} />
            </div>
          ))}
        </div>
        <label className="mt-6 block text-sm font-medium" htmlFor="online-report">Compte rendu (deux lignes)</label>
        <textarea id="online-report" className={`${input} mt-1`} rows={2} maxLength={400} disabled={!data.lesson.can_write} value={report} onChange={e => setReport(e.target.value)} />
        {data.lesson.can_write
          ? <Button className="mt-4 min-h-11" onClick={save} disabled={saving || data.lesson.status === 'cancelled'}>{saving ? 'Enregistrement…' : 'Enregistrer les présences'}</Button>
          : <p className="mt-4 text-sm text-muted-foreground">Ce cours est assuré par un remplaçant : seules ses présences sont modifiables.</p>}
      </>}
    </div>
  );
}
