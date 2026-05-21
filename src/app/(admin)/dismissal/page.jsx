'use client';

import { useEffect, useState } from 'react';
import { entities, auth } from '@/lib/entities';
import { Plus, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

const inputClass = "w-full border border-border rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-primary";
const labelClass = "block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1";

export default function Dismissal() {
  const [logs, setLogs] = useState([]);
  const [students, setStudents] = useState([]);
  const [adults, setAdults] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState('');
  const [studentAdults, setStudentAdults] = useState([]);
  const [form, setForm] = useState({ student_id: '', student_name: '', adult_id: '', adult_name: '', staff_name: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const load = () => Promise.all([
    entities.DismissalLog.list('-created_date', 50),
    entities.Student.filter({ age_category: 'Young Learners (6-12)', status: 'Enrolled' }),
    entities.AuthorizedAdult.list('full_name', 200),
  ]).then(([l, s, a]) => { setLogs(l); setStudents(s); setAdults(a); setLoading(false); });

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (selectedStudent) {
      const sa = adults.filter(a => a.student_id === selectedStudent);
      setStudentAdults(sa);
      const student = students.find(s => s.id === selectedStudent);
      setForm(f => ({ ...f, student_id: selectedStudent, student_name: student?.full_name || '' }));
    }
  }, [selectedStudent, adults, students]);

  const handleLog = async (e) => {
    e.preventDefault();
    setSaving(true);
    const adult = adults.find(a => a.id === form.adult_id);
    await entities.DismissalLog.create({
      ...form,
      adult_name: adult?.full_name || form.adult_name,
      timestamp: new Date().toISOString(),
      confirmed: true,
    });
    toast.success('Sortie enregistrée');
    setShowForm(false);
    setSelectedStudent('');
    setForm({ student_id: '', student_name: '', adult_id: '', adult_name: '', staff_name: '' });
    setSaving(false);
    load();
  };

  const today = new Date().toLocaleDateString('fr-MA');
  const todayLogs = logs.filter(l => new Date(l.timestamp).toLocaleDateString('fr-MA') === today);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Sortie des jeunes apprenants</h1>
          <p className="text-muted-foreground text-sm mt-1">{todayLogs.length} sorties enregistrées aujourd&apos;hui</p>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white rounded-md hover:opacity-90" style={{ backgroundColor: '#1E4D8B' }}>
          <Plus size={15} /> Enregistrer une sortie
        </button>
      </div>

      {showForm && (
        <div className="bg-card border border-border rounded-lg p-6 mb-6 max-w-lg">
          <h2 className="font-semibold mb-4">Nouvelle sortie</h2>
          <form onSubmit={handleLog} className="space-y-4">
            <div>
              <label className={labelClass}>Apprenant *</label>
              <select className={inputClass} value={selectedStudent} onChange={e => setSelectedStudent(e.target.value)} required>
                <option value="">— Choisir —</option>
                {students.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
              </select>
            </div>
            {selectedStudent && (
              <div>
                <label className={labelClass}>Adulte autorisé *</label>
                {studentAdults.length === 0 ? (
                  <p className="text-sm text-red-500">Aucun adulte autorisé pour cet apprenant.</p>
                ) : (
                  <select className={inputClass} value={form.adult_id} onChange={e => setForm(f => ({ ...f, adult_id: e.target.value }))} required>
                    <option value="">— Choisir —</option>
                    {studentAdults.map(a => <option key={a.id} value={a.id}>{a.full_name} ({a.relation})</option>)}
                  </select>
                )}
              </div>
            )}
            <div>
              <label className={labelClass}>Responsable (staff) *</label>
              <input className={inputClass} value={form.staff_name} onChange={e => setForm(f => ({ ...f, staff_name: e.target.value }))} required />
            </div>
            <div className="flex gap-3">
              <button type="submit" disabled={saving || studentAdults.length === 0} className="px-5 py-2 text-sm font-semibold text-white rounded-md hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: '#1E4D8B' }}>
                {saving ? '...' : 'Confirmer la sortie'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="px-5 py-2 text-sm text-muted-foreground">Annuler</button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-muted/30">
          <h3 className="font-semibold text-sm">Journal des sorties</h3>
        </div>
        {loading ? <div className="p-8 text-center text-muted-foreground text-sm">Chargement...</div> :
          logs.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground text-sm">
              <div className="text-4xl mb-3">📋</div>
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
                        <span className="text-xs text-muted-foreground">{l.timestamp ? new Date(l.timestamp).toLocaleTimeString('fr-MA') : '—'}</span>
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
                          <td className="px-4 py-3 text-muted-foreground">{l.timestamp ? new Date(l.timestamp).toLocaleTimeString('fr-MA') : '—'}</td>
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
