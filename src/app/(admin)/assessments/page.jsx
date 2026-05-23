'use client';

import { useEffect, useState } from 'react';
import { entities, auth } from '@/lib/entities';
import { Plus, Edit, Trash2, Printer, Download } from 'lucide-react';
import { toast } from 'sonner';
import ReportCardPrint from '@/components/ReportCardPrint';
import SkeletonTable from '@/components/ui/SkeletonTable';
import { exportToCsv } from '@/utils/exportCsv';

const inputClass = "w-full border border-border rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-primary";
const labelClass = "block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1";

function AssessmentModal({ assessment, students, groups, onSave, onClose }) {
  const [form, setForm] = useState(assessment || {
    student_id: '', group_id: '', terme: 'Sept–Déc', note_oral: '', note_ecrit: '', note_devoirs: '',
    poids_oral: 40, poids_ecrit: 30, poids_devoirs: 30, niveau_actuel: 'A1', niveau_cible: 'A2', commentaire: '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const noteFinale = () => {
    const o = parseFloat(form.note_oral) || 0;
    const e = parseFloat(form.note_ecrit) || 0;
    const d = parseFloat(form.note_devoirs) || 0;
    return ((o * form.poids_oral + e * form.poids_ecrit + d * form.poids_devoirs) / 100).toFixed(1);
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    setSaving(true);
    const data = {
      ...form,
      student_id: form.student_id || null,
      group_id: form.group_id || null,
      note_oral: parseFloat(form.note_oral) || null,
      note_ecrit: parseFloat(form.note_ecrit) || null,
      note_devoirs: parseFloat(form.note_devoirs) || null,
      note_finale: parseFloat(noteFinale()),
    };
    try {
      if (form.id) {
        await entities.Assessment.update(form.id, data);
        toast.success('Note mise à jour');
      } else {
        await entities.Assessment.create(data);
        toast.success('Note créée');
      }
      onSave();
    } catch {
      // entities.js already toasted the error — keep the modal open so the
      // user can correct the form and retry.
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-lg shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-semibold">{form.id ? "Modifier l'évaluation" : 'Nouvelle évaluation'}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Apprenant *</label>
              <select className={inputClass} value={form.student_id || ''} onChange={e => set('student_id', e.target.value)} required>
                <option value="">— Choisir —</option>
                {students.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Groupe</label>
              <select className={inputClass} value={form.group_id || ''} onChange={e => set('group_id', e.target.value)}>
                <option value="">— Choisir —</option>
                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Terme</label>
              <select className={inputClass} value={form.terme} onChange={e => set('terme', e.target.value)}>
                {['Sept–Déc','Jan–Mar','Avr–Juin','Été'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Niveau actuel</label>
              <select className={inputClass} value={form.niveau_actuel || ''} onChange={e => set('niveau_actuel', e.target.value)}>
                {['A1','A2','B1','B2','C1','C2'].map(n => <option key={n}>{n}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Note oral ({form.poids_oral}%)</label>
              <input type="number" min="0" max="20" className={inputClass} value={form.note_oral || ''} onChange={e => set('note_oral', e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Note écrit ({form.poids_ecrit}%)</label>
              <input type="number" min="0" max="20" className={inputClass} value={form.note_ecrit || ''} onChange={e => set('note_ecrit', e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Devoirs ({form.poids_devoirs}%)</label>
              <input type="number" min="0" max="20" className={inputClass} value={form.note_devoirs || ''} onChange={e => set('note_devoirs', e.target.value)} />
            </div>
            <div className="flex items-end pb-1">
              <div className="w-full px-4 py-2 rounded-md text-center font-bold text-lg bg-primary/10 text-primary">
                Finale: {noteFinale()} / 20
              </div>
            </div>
            <div className="col-span-2">
              <label className={labelClass}>Commentaire</label>
              <textarea className={`${inputClass} h-16 resize-none`} value={form.commentaire || ''} onChange={e => set('commentaire', e.target.value)} />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving} className="px-5 py-2 text-sm font-semibold text-white rounded-md bg-primary hover:opacity-90">
              {saving ? '...' : 'Enregistrer'}
            </button>
            <button type="button" onClick={onClose} className="px-5 py-2 text-sm text-muted-foreground">Annuler</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Assessments() {
  const [assessments, setAssessments] = useState([]);
  const [students, setStudents] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [printing, setPrinting] = useState(null);
  const [search, setSearch] = useState('');
  const [filterTerme, setFilterTerme] = useState('');

  const load = () => Promise.all([
    entities.Assessment.list('-created_date', 200),
    entities.Student.list('full_name', 200),
    entities.Group.list('name', 100),
  ]).then(([a, s, g]) => { setAssessments(a); setStudents(s); setGroups(g); setLoading(false); });

  useEffect(() => { load(); }, []);

  const studentName = id => students.find(s => s.id === id)?.full_name || '—';
  const groupName = id => groups.find(g => g.id === id)?.name || '—';

  const filteredAssessments = assessments.filter(a => {
    const name = studentName(a.student_id).toLowerCase();
    const matchSearch = !search || name.includes(search.toLowerCase());
    const matchTerme = !filterTerme || a.terme === filterTerme;
    return matchSearch && matchTerme;
  });

  const handleDelete = async (id) => {
    if (!confirm('Supprimer ?')) return;
    await entities.Assessment.delete(id); toast.success('Supprimé'); load();
  };

  const exportAssessmentsCsv = () => {
    exportToCsv(filteredAssessments.map(a => ({
      Apprenant: studentName(a.student_id),
      Groupe: groupName(a.group_id),
      Terme: a.terme,
      Oral: a.note_oral ?? '',
      Écrit: a.note_ecrit ?? '',
      Devoirs: a.note_devoirs ?? '',
      Finale: a.note_finale ?? '',
      Niveau: a.niveau_actuel,
      Commentaire: a.commentaire || '',
    })), `evaluations-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  return (
    <div className="p-4 lg:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold">Notes & évaluations</h1>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setModal({})} className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white rounded-md bg-primary hover:opacity-90 self-start sm:self-auto">
            <Plus size={15} /> Nouvelle note
          </button>
          <button onClick={exportAssessmentsCsv} className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium border border-border rounded-md hover:bg-muted self-start sm:self-auto">
            <Download size={15} /> Export CSV
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-3 mb-5">
        <input
          className="border border-border rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-primary flex-1 min-w-48"
          placeholder="Rechercher un apprenant..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className="border border-border rounded-md px-3 py-2 text-sm bg-white" value={filterTerme} onChange={e => setFilterTerme(e.target.value)}>
          <option value="">Tous les termes</option>
          {['Sept–Déc','Jan–Mar','Avr–Juin','Été'].map(t => <option key={t}>{t}</option>)}
        </select>
      </div>
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {loading ? <SkeletonTable rows={8} cols={8} /> : (
          <>
            <div className="sm:hidden divide-y divide-border">
              {filteredAssessments.map(a => (
                <div key={a.id} className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <p className="font-semibold text-sm">{studentName(a.student_id)}</p>
                      <p className="text-xs text-muted-foreground">{groupName(a.group_id)} · {a.terme}</p>
                    </div>
                    <span className="text-xs font-bold text-white px-2 py-0.5 rounded flex-shrink-0 bg-primary">{a.niveau_actuel}</span>
                  </div>
                  <div className="flex gap-4 text-xs mt-2">
                    <span>Oral: <b>{a.note_oral ?? '—'}</b></span>
                    <span>Écrit: <b>{a.note_ecrit ?? '—'}</b></span>
                    <span>Devoirs: <b>{a.note_devoirs ?? '—'}</b></span>
                    <span className="font-bold text-primary">Finale: {a.note_finale ?? '—'}</span>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => setModal(a)} className="p-1.5 rounded hover:bg-muted text-muted-foreground"><Edit size={15} /></button>
                    <button onClick={() => setPrinting(a)} className="p-1.5 rounded hover:bg-blue-50 text-muted-foreground hover:text-blue-600"><Printer size={15} /></button>
                    <button onClick={() => handleDelete(a.id)} className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600"><Trash2 size={15} /></button>
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted border-b border-border text-xs font-semibold text-muted-foreground">
                    {['Apprenant','Groupe','Terme','Oral','Écrit','Devoirs','Finale','Niveau',''].map(h => (
                      <th key={h} className="text-left px-4 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredAssessments.length === 0 && (
                    <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground text-sm">Aucune évaluation trouvée.</td></tr>
                  )}
                  {filteredAssessments.map(a => (
                    <tr key={a.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{studentName(a.student_id)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{groupName(a.group_id)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{a.terme}</td>
                      <td className="px-4 py-3">{a.note_oral ?? '—'}</td>
                      <td className="px-4 py-3">{a.note_ecrit ?? '—'}</td>
                      <td className="px-4 py-3">{a.note_devoirs ?? '—'}</td>
                      <td className="px-4 py-3 font-bold text-primary">{a.note_finale ?? '—'}</td>
                      <td className="px-4 py-3"><span className="text-xs font-bold text-white px-2 py-0.5 rounded bg-primary">{a.niveau_actuel}</span></td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button onClick={() => setModal(a)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"><Edit size={14} /></button>
                          <button onClick={() => setPrinting(a)} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"><Printer size={12} /> Bulletin</button>
                          <button onClick={() => handleDelete(a.id)} className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600"><Trash2 size={14} /></button>
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
      {modal !== null && <AssessmentModal assessment={modal.id ? modal : null} students={students} groups={groups} onSave={() => { setModal(null); load(); }} onClose={() => setModal(null)} />}
      {printing && <ReportCardPrint student={students.find(s => s.id === printing.student_id)} assessment={printing} groupName={groupName(printing.group_id)} onClose={() => setPrinting(null)} />}
    </div>
  );
}
