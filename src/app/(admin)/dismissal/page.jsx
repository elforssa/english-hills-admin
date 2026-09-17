'use client';

import { useEffect, useState } from 'react';
import { entities, integrations } from '@/lib/entities';
import { Plus, CheckCircle, ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { getBrowserClient } from '@/lib/supabase';

const inputClass = "w-full border border-border rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-primary";
const labelClass = "block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1";
const schoolDate = (value) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
const schoolTime = (value) => new Intl.DateTimeFormat('fr-MA', { timeZone: 'Africa/Casablanca', hour: '2-digit', minute: '2-digit' }).format(new Date(value));

export default function Dismissal() {
  const [logs, setLogs] = useState([]);
  const [todayCount, setTodayCount] = useState(null);
  const [students, setStudents] = useState([]);
  const [adults, setAdults] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState('');
  const [studentAdults, setStudentAdults] = useState([]);
  const [form, setForm] = useState({ student_id: '', student_name: '', adult_id: '', adult_name: '', staff_name: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const load = () => Promise.all([
    entities.DismissalLog.listAll('-created_date'),
    entities.Student.filter({ age_category: 'Young Learners (6-12)', status: 'Enrolled' }),
    getBrowserClient().rpc('count_today_dismissals'),
  ])
    .then(async ([l, s, countResult]) => {
      if (countResult.error) throw countResult.error;
      const adultIds = [...new Set(l.map(row => row.adult_id).filter(Boolean))];
      const a = adultIds.length ? await entities.AuthorizedAdult.filter({ id: adultIds }, 'full_name') : [];
      setAdults(a);
      setLogs(l); setStudents(s); setTodayCount(Number(countResult.data));
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[dismissal] load failed:', err?.message, err?.code);
      setTodayCount(null);
      toast.error('Journal des sorties indisponible. Rechargez la page pour réessayer.');
    })
    .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  useEffect(() => {
    let cancelled = false;
    if (selectedStudent) {
      setStudentAdults([]);
      const student = students.find(s => s.id === selectedStudent);
      setForm(f => ({ ...f, student_id: selectedStudent, student_name: student?.full_name || '', adult_id: '', adult_name: '' }));
      entities.AuthorizedAdult.filter({ student_id: selectedStudent }, 'full_name')
        .then(rows => { if (!cancelled) setStudentAdults(rows); })
        .catch(() => { if (!cancelled) toast.error('Adultes autorisés indisponibles. Réessayez.'); });
    } else {
      setStudentAdults([]);
      setForm(f => ({ ...f, student_id: '', student_name: '', adult_id: '', adult_name: '' }));
    }
    return () => { cancelled = true; };
  }, [selectedStudent, students]);

  // Lockdown: a young learner can only be dismissed once per day. Subsequent
  // This is only a UI shortcut; the database trigger enforces uniqueness even
  // when a pickup falls outside the 50 entries shown here.
  const todayKey = schoolDate(Date.now());
  const alreadyDismissedToday = (studentId) =>
    logs.some(l =>
      l.student_id === studentId
      && l.timestamp
      && schoolDate(l.timestamp) === todayKey
      && l.confirmed !== false
    );

  const handleLog = async (e) => {
    e.preventDefault();
    if (alreadyDismissedToday(form.student_id)) {
      toast.error('Cet apprenant a déjà été récupéré aujourd’hui. Voir le directeur pour une dérogation.');
      return;
    }
    setSaving(true);
    const adult = studentAdults.find(a => a.id === form.adult_id);
    const student = students.find(s => s.id === form.student_id);
    try {
      const saved = await entities.DismissalLog.create({
        ...form,
        student_id: form.student_id || null,
        adult_id: form.adult_id || null,
        adult_name: adult?.full_name || form.adult_name,
        timestamp: new Date().toISOString(),
        confirmed: true,
      });

      // Notify the parent so an unauthorized later attempt would be caught
      // immediately. Best-effort — never block dismissal confirmation on a
      // failed email.
      const recipients = [];
      if (student?.parent_email) recipients.push(student.parent_email);
      let parentNotified = false;
      if (recipients.length > 0) {
        try {
          await integrations.Core.SendEmail({
            to: recipients,
            subject: `[English Hills] Sortie confirmée — ${student.full_name}`,
            body:
              `Bonjour,\n\n` +
              `Nous vous confirmons que ${student.full_name} a été récupéré(e) ` +
              `à ${schoolTime(saved.timestamp)} par ` +
              `${adult?.full_name || form.adult_name} (${adult?.relation || '—'}).\n\n` +
              `Responsable English Hills : ${saved.staff_name}\n\n` +
              `Si cette information vous semble incorrecte, contactez le centre immédiatement.\n\n` +
              `— English Hills Language Center`,
          });
          parentNotified = true;
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('[dismissal] parent notification failed:', err);
        }
      }

      toast.success('Sortie enregistrée' + (parentNotified ? ' — Notification envoyée' : ' — Notification non confirmée'));
      setShowForm(false);
      setSelectedStudent('');
      setForm({ student_id: '', student_name: '', adult_id: '', adult_name: '', staff_name: '' });
      load();
    } catch {
      // entities.js already toasted — keep the form open for retry.
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Sortie des jeunes apprenants</h1>
          <p className="text-muted-foreground text-sm mt-1">{todayCount ?? '—'} sorties enregistrées aujourd&apos;hui</p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus size={15} /> Enregistrer une sortie
        </Button>
      </div>

      {showForm && (
        <div className="bg-card border border-border rounded-lg p-6 mb-6 max-w-lg">
          <h2 className="font-semibold mb-4">Nouvelle sortie</h2>
          <form onSubmit={handleLog} className="space-y-4">
            <div>
              <label htmlFor="dismissal-student" className={labelClass}>Apprenant *</label>
              <select id="dismissal-student" className={inputClass} value={selectedStudent} onChange={e => setSelectedStudent(e.target.value)} required>
                <option value="">— Choisir —</option>
                {students.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
              </select>
            </div>
            {selectedStudent && (
              <div>
                <label htmlFor="dismissal-adult" className={labelClass}>Adulte autorisé *</label>
                {studentAdults.length === 0 ? (
                  <p className="text-sm text-red-500">Aucun adulte autorisé pour cet apprenant.</p>
                ) : (
                  <select id="dismissal-adult" className={inputClass} value={form.adult_id} onChange={e => setForm(f => ({ ...f, adult_id: e.target.value }))} required>
                    <option value="">— Choisir —</option>
                    {studentAdults.map(a => <option key={a.id} value={a.id}>{a.full_name} ({a.relation})</option>)}
                  </select>
                )}
              </div>
            )}
            <div>
              <p className={labelClass}>Responsable : identité du compte connecté</p>
            </div>
            <div className="flex gap-3">
              <button type="submit" disabled={saving || studentAdults.length === 0} className="px-5 py-2 text-sm font-semibold text-white rounded-md hover:opacity-90 disabled:opacity-50 bg-primary">
                {saving ? '...' : 'Confirmer la sortie'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="px-5 py-2 text-sm text-muted-foreground">Annuler</button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-muted/30">
          <h3 className="font-semibold text-sm">Journal des sorties (50 dernières entrées)</h3>
        </div>
        {loading ? <div className="p-8 text-center text-muted-foreground text-sm">Chargement...</div> :
          logs.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground text-sm">
              <ClipboardList size={36} className="mx-auto mb-3 text-muted-foreground/40" />
              <p>Aucune sortie enregistrée aujourd&apos;hui.</p>
            </div>
          ) : (
            <>
              <div className="sm:hidden divide-y divide-border">
                {logs.map(l => {
                  const adult = adults.find(a => a.id === l.adult_id);
                  return (
                    <div key={l.id} className="p-4">
                      <div className="flex items-start justify-between mb-1">
                        <p className="font-semibold text-sm">{l.student_name}</p>
                        <span className="text-xs text-muted-foreground">{l.timestamp ? schoolTime(l.timestamp) : '—'}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{l.adult_name} · {adult?.relation || '—'}</p>
                      <p className="text-xs text-muted-foreground">Staff : {l.staff_name}</p>
                    </div>
                  );
                })}
              </div>
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted border-b border-border text-xs font-semibold text-muted-foreground">
                      {['Apprenant','Adulte','Relation','Responsable','Heure'].map(h => <th key={h} className="text-left px-4 py-3">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {logs.map(l => {
                      const adult = adults.find(a => a.id === l.adult_id);
                      return (
                        <tr key={l.id} className="hover:bg-muted/30">
                          <td className="px-4 py-3 font-medium">{l.student_name}</td>
                          <td className="px-4 py-3">{l.adult_name}</td>
                          <td className="px-4 py-3 text-muted-foreground">{adult?.relation || '—'}</td>
                          <td className="px-4 py-3 text-muted-foreground">{l.staff_name}</td>
                          <td className="px-4 py-3 text-muted-foreground">{l.timestamp ? schoolTime(l.timestamp) : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )
        }
      </div>
    </div>
  );
}
