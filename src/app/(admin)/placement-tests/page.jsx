'use client';

import { useEffect, useState } from 'react';
import { entities, auth } from '@/lib/entities';
import { Plus, Edit, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const inputClass = "w-full border border-border rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-primary";
const labelClass = "block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1";

const STATUS_COLORS = {
  'Planifié': 'bg-blue-100 text-blue-700',
  'Passé': 'bg-yellow-100 text-yellow-700',
  'Résultat saisi': 'bg-purple-100 text-purple-700',
  'Affecté': 'bg-green-100 text-green-700',
};

function TestModal({ test, groups, students, onSave, onClose }) {
  const [form, setForm] = useState(test || { student_id: '', student_name: '', date_test: new Date().toISOString().split('T')[0], heure: '', examinateur: '', score: '', niveau_recommande: 'A1', status: 'Planifié', notes: '' });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleStudentChange = (id) => {
    const s = students.find(s => s.id === id);
    set('student_id', id);
    set('student_name', s?.full_name || '');
  };
  const handleSubmit = async (e) => {
    e.preventDefault(); setSaving(true);
    const data = { ...form, score: form.score !== '' ? parseFloat(form.score) : null };
    if (form.id) { await entities.PlacementTest.update(form.id, data); toast.success('Test mis à jour'); }
    else { await entities.PlacementTest.create(data); toast.success('Test créé'); }
    onSave();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-lg shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-semibold">{form.id ? 'Modifier le test' : 'Nouveau test de niveau'}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
            <label className={labelClass}>Apprenant *</label>
            <select className={inputClass} value={form.student_id || ''} onChange={e => handleStudentChange(e.target.value)}>
              <option value="">— Choisir un apprenant ou saisir manuellement —</option>
              {students.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </select>
            {!form.student_id && (
              <input className={`${inputClass} mt-2`} placeholder="Ou saisir le nom manuellement..." value={form.student_name} onChange={e => set('student_name', e.target.value)} required={!form.student_id} />
            )}
          </div>
            <div><label className={labelClass}>Date *</label><input type="date" className={inputClass} value={form.date_test} onChange={e => set('date_test', e.target.value)} required /></div>
            <div><label className={labelClass}>Heure</label><input type="time" className={inputClass} value={form.heure || ''} onChange={e => set('heure', e.target.value)} /></div>
            <div><label className={labelClass}>Examinateur</label><input className={inputClass} value={form.examinateur || ''} onChange={e => set('examinateur', e.target.value)} /></div>
            <div><label className={labelClass}>Statut</label>
              <select className={inputClass} value={form.status} onChange={e => set('status', e.target.value)}>
                {['Planifié','Passé','Résultat saisi','Affecté'].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div><label className={labelClass}>Score</label><input type="number" className={inputClass} value={form.score || ''} onChange={e => set('score', e.target.value)} min="0" max="100" /></div>
            <div><label className={labelClass}>Niveau recommandé</label>
              <select className={inputClass} value={form.niveau_recommande} onChange={e => set('niveau_recommande', e.target.value)}>
                {['A1','A2','B1','B2','C1','C2'].map(n => <option key={n}>{n}</option>)}
              </select>
            </div>
            <div className="col-span-2"><label className={labelClass}>Groupe affecté</label>
              <select className={inputClass} value={form.groupe_affecte_id || ''} onChange={e => set('groupe_affecte_id', e.target.value)}>
                <option value="">— Choisir —</option>
                {groups.map(g => <option key={g.id} value={g.id}>{g.name} ({g.niveau})</option>)}
              </select>
            </div>
            <div className="col-span-2"><label className={labelClass}>Notes</label><textarea className={`${inputClass} h-16 resize-none`} value={form.notes || ''} onChange={e => set('notes', e.target.value)} /></div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving} className="px-5 py-2 text-sm font-semibold text-white rounded-md hover:opacity-90" style={{ backgroundColor: '#1E4D8B' }}>
              {saving ? '...' : 'Enregistrer'}
            </button>
            <button type="button" onClick={onClose} className="px-5 py-2 text-sm text-muted-foreground">Annuler</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function PlacementTests() {
  const [tests, setTests] = useState([]);
  const [groups, setGroups] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);

  const load = () => Promise.all([
    entities.PlacementTest.list('-date_test', 100),
    entities.Group.list('name', 100),
    entities.Student.list('full_name', 200),
  ]).then(([t, g, s]) => { setTests(t); setGroups(g); setStudents(s); setLoading(false); });

  useEffect(() => { load(); }, []);

  const handleDelete = async (id) => {
    if (!confirm('Supprimer ce test ?')) return;
    await entities.PlacementTest.delete(id);
    toast.success('Supprimé'); load();
  };

  return (
    <div className="p-4 lg:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold">Tests de niveau</h1>
        <button onClick={() => setModal({})} className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white rounded-md hover:opacity-90 self-start sm:self-auto" style={{ backgroundColor: '#1E4D8B' }}>
          <Plus size={15} /> Planifier un test
        </button>
      </div>
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {loading ? <div className="p-8 text-center text-muted-foreground text-sm">Chargement...</div> : (
          <>
            <div className="sm:hidden divide-y divide-border">
              {tests.map(t => (
                <div key={t.id} className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="font-semibold text-sm">{t.student_name}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${STATUS_COLORS[t.status] || 'bg-gray-100 text-gray-500'}`}>{t.status}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{t.date_test} {t.heure ? `à ${t.heure}` : ''} {t.examinateur ? `· ${t.examinateur}` : ''}</p>
                  <div className="flex items-center gap-3 mt-2">
                    {t.score != null && <span className="text-xs font-semibold">Score: {t.score}</span>}
                    {t.niveau_recommande && <span className="text-xs font-bold text-white px-2 py-0.5 rounded" style={{ backgroundColor: '#1E4D8B' }}>{t.niveau_recommande}</span>}
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => setModal(t)} className="p-1.5 rounded hover:bg-muted text-muted-foreground"><Edit size={15} /></button>
                    <button onClick={() => handleDelete(t.id)} className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600"><Trash2 size={15} /></button>
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted border-b border-border text-xs font-semibold text-muted-foreground">
                    {['Apprenant','Date','Heure','Examinateur','Score','Niveau','Statut',''].map(h => (
                      <th key={h} className="text-left px-4 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {tests.map(t => (
                    <tr key={t.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{t.student_name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{t.date_test}</td>
                      <td className="px-4 py-3 text-muted-foreground">{t.heure || '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{t.examinateur || '—'}</td>
                      <td className="px-4 py-3 font-semibold">{t.score ?? '—'}</td>
                      <td className="px-4 py-3">
                        {t.niveau_recommande ? <span className="text-xs font-bold text-white px-2 py-0.5 rounded" style={{ backgroundColor: '#1E4D8B' }}>{t.niveau_recommande}</span> : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[t.status] || 'bg-gray-100 text-gray-500'}`}>{t.status}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button onClick={() => setModal(t)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"><Edit size={14} /></button>
                          <button onClick={() => handleDelete(t.id)} className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600"><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
      {modal !== null && <TestModal test={modal.id ? modal : null} groups={groups} students={students} onSave={() => { setModal(null); load(); }} onClose={() => setModal(null)} />}
    </div>
  );
}
