'use client';

import { useEffect, useState } from 'react';
import { entities, auth } from '@/lib/entities';
import { Plus, Edit, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';

const inputClass = "w-full border border-border rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-primary";
const labelClass = "block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1";

function GroupModal({ group, teachers, onSave, onClose }) {
  const [form, setForm] = useState(group || { name: '', niveau: 'A1', categorie: 'Adultes', teacher_id: '', salle: '', jours: '', horaire: '', capacite_max: 12, terme: 'Sept–Déc', annee: '2025-2026' });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const handleSubmit = async (e) => {
    e.preventDefault(); setSaving(true);
    const payload = { ...form, teacher_id: form.teacher_id || null };
    if (form.id) { await entities.Group.update(form.id, payload); toast.success('Groupe mis à jour'); }
    else { await entities.Group.create(payload); toast.success('Groupe créé'); }
    onSave();
  };
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-lg shadow-xl max-h-[calc(100vh-2rem)] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-semibold">{form.id ? 'Modifier le groupe' : 'Nouveau groupe'}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="col-span-2"><label className={labelClass}>Nom du groupe *</label><input className={inputClass} value={form.name} onChange={e => set('name', e.target.value)} required /></div>
            <div><label className={labelClass}>Niveau</label>
              <select className={inputClass} value={form.niveau} onChange={e => set('niveau', e.target.value)}>
                {['A1','A2','B1','B2','C1','C2'].map(n => <option key={n}>{n}</option>)}
              </select>
            </div>
            <div><label className={labelClass}>Catégorie</label>
              <select className={inputClass} value={form.categorie} onChange={e => set('categorie', e.target.value)}>
                {['Enfants','Ados','Adultes','Business','Particulier','Préparation aux examens'].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div><label className={labelClass}>Enseignant</label>
              <select className={inputClass} value={form.teacher_id || ''} onChange={e => set('teacher_id', e.target.value)}>
                <option value="">— Choisir —</option>
                {teachers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
              </select>
            </div>
            <div><label className={labelClass}>Salle</label><input className={inputClass} value={form.salle || ''} onChange={e => set('salle', e.target.value)} /></div>
            <div><label className={labelClass}>Jours</label><input className={inputClass} placeholder="Lun, Mer, Ven" value={form.jours || ''} onChange={e => set('jours', e.target.value)} /></div>
            <div><label className={labelClass}>Horaire</label><input className={inputClass} placeholder="18h – 19h30" value={form.horaire || ''} onChange={e => set('horaire', e.target.value)} /></div>
            <div><label className={labelClass}>Capacité max</label><input type="number" className={inputClass} value={form.capacite_max} onChange={e => set('capacite_max', parseInt(e.target.value))} /></div>
            <div><label className={labelClass}>Terme</label>
              <select className={inputClass} value={form.terme} onChange={e => set('terme', e.target.value)}>
                {['Sept–Déc','Jan–Mar','Avr–Juin','Été'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving} className="px-5 py-2 text-sm font-semibold text-white rounded-md hover:opacity-90 bg-primary">
              {saving ? '...' : 'Enregistrer'}
            </button>
            <button type="button" onClick={onClose} className="px-5 py-2 text-sm text-muted-foreground hover:text-foreground">Annuler</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Groups() {
  const [groups, setGroups] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [filterTerme, setFilterTerme] = useState('');

  const load = () => Promise.all([
    entities.Group.list('-created_date', 100),
    entities.Teacher.list('full_name', 100),
  ]).then(([g, t]) => { setGroups(g); setTeachers(t); setLoading(false); });

  useEffect(() => { load(); }, []);

  const handleDelete = async (id) => {
    if (!confirm('Supprimer ce groupe ?')) return;
    await entities.Group.delete(id);
    toast.success('Groupe supprimé');
    load();
  };

  const teacherName = (tid) => teachers.find(t => t.id === tid)?.full_name || '—';
  const filtered = groups.filter(g => !filterTerme || g.terme === filterTerme);

  return (
    <div className="p-4 lg:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Groupes & niveaux</h1>
          <p className="text-muted-foreground text-sm mt-1">{groups.length} groupes</p>
        </div>
        <button onClick={() => setModal({})} className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white rounded-md hover:opacity-90 self-start sm:self-auto bg-primary">
          <Plus size={15} /> Nouveau groupe
        </button>
      </div>

      <div className="mb-5">
        <select className="border border-border rounded-md px-3 py-2 text-sm bg-white" value={filterTerme} onChange={e => setFilterTerme(e.target.value)}>
          <option value="">Tous les termes</option>
          {['Sept–Déc','Jan–Mar','Avr–Juin','Été'].map(t => <option key={t}>{t}</option>)}
        </select>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {loading ? <div className="p-8 text-center text-muted-foreground text-sm">Chargement...</div> : (
          <>
            <div className="sm:hidden divide-y divide-border">
              {filtered.length === 0 && (
                <div className="p-8 text-center text-muted-foreground text-sm">
                  Aucun groupe.{' '}
                  <button onClick={() => setModal({})} className="text-primary font-medium hover:underline">Créer le premier →</button>
                </div>
              )}
              {filtered.map(g => (
                <div key={g.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm">{g.name}</p>
                      <p className="text-xs text-muted-foreground mt-1">{g.categorie} · {teacherName(g.teacher_id)}</p>
                      <p className="text-xs text-muted-foreground">{g.jours} {g.horaire} {g.salle ? `· ${g.salle}` : ''}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className="text-xs font-bold text-white px-2 py-0.5 rounded bg-primary">{g.niveau}</span>
                      <span className="text-xs text-muted-foreground">{g.terme}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => setModal(g)} className="p-1.5 rounded hover:bg-muted text-muted-foreground"><Edit size={15} /></button>
                    <button onClick={() => handleDelete(g.id)} className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600"><Trash2 size={15} /></button>
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted border-b border-border">
                    {['Groupe','Niveau','Catégorie','Enseignant','Horaire','Salle','Terme',''].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground text-sm">
                      Aucun groupe.{' '}
                      <button onClick={() => setModal({})} className="text-primary font-medium hover:underline">Créer le premier →</button>
                    </td></tr>
                  )}
                  {filtered.map(g => (
                    <tr key={g.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{g.name}</td>
                      <td className="px-4 py-3"><span className="text-xs font-bold text-white px-2 py-0.5 rounded bg-primary">{g.niveau}</span></td>
                      <td className="px-4 py-3 text-muted-foreground">{g.categorie}</td>
                      <td className="px-4 py-3 text-muted-foreground">{teacherName(g.teacher_id)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{g.jours} {g.horaire}</td>
                      <td className="px-4 py-3 text-muted-foreground">{g.salle || '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{g.terme}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button onClick={() => setModal(g)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"><Edit size={14} /></button>
                          <button onClick={() => handleDelete(g.id)} className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600"><Trash2 size={14} /></button>
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
      {modal !== null && <GroupModal group={modal.id ? modal : null} teachers={teachers} onSave={() => { setModal(null); load(); }} onClose={() => setModal(null)} />}
    </div>
  );
}
