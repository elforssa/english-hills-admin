'use client';

import { useEffect, useState } from 'react';
import { entities, auth } from '@/lib/entities';
import { Plus, Brain, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const inputClass = "w-full border border-border rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-primary";
const labelClass = "block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1";

const KOLB_STYLES = ['Diverging', 'Assimilating', 'Converging', 'Accommodating'];
const KOLB_DESC = {
  Diverging: 'Créatif, orienté personnes, imagination forte',
  Assimilating: 'Logique, analytique, préfère les concepts abstraits',
  Converging: 'Résolution de problèmes, décisions pratiques',
  Accommodating: 'Expérimentation pratique, intuitif, action',
};
const INTELLIGENCES = ['Linguistique','Logico-mathématique','Spatiale','Musicale','Corporelle-kinesthésique','Naturaliste','Interpersonnelle','Intrapersonnelle'];

const KOLB_COLORS = {
  Diverging: 'bg-purple-50 text-purple-700', Assimilating: 'bg-blue-50 text-blue-700',
  Converging: 'bg-green-50 text-green-700', Accommodating: 'bg-orange-50 text-orange-700',
};

function AssessmentModal({ students, onSave, onClose }) {
  const [form, setForm] = useState({
    student_id: '', student_name: '', date_assessment: new Date().toISOString().split('T')[0],
    kolb_style: 'Diverging', dominant_intelligence: 'Linguistique', teacher_notes: '',
  });
  const [intelligenceScores, setIntelligenceScores] = useState(
    Object.fromEntries(INTELLIGENCES.map(i => [i, 5]))
  );
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleStudentChange = (id) => {
    const s = students.find(s => s.id === id);
    set('student_id', id);
    set('student_name', s?.full_name || '');
  };

  const dominant = Object.entries(intelligenceScores).sort((a, b) => b[1] - a[1])[0]?.[0];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await entities.LearningAssessment.create({
        ...form,
        intelligences: intelligenceScores,
        dominant_intelligence: dominant,
      });
      toast.success('Évaluation enregistrée');
      onSave();
    } catch {
      // entities.js already toasted — keep modal open for retry.
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-semibold">Évaluation des styles d&apos;apprentissage</h2>
          <button onClick={onClose} aria-label="Fermer" className="text-muted-foreground text-xl">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className={labelClass}>Apprenant *</label>
            <select className={inputClass} value={form.student_id} onChange={e => handleStudentChange(e.target.value)} required>
              <option value="">— Choisir —</option>
              {students.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Date</label>
            <input type="date" className={inputClass} value={form.date_assessment} onChange={e => set('date_assessment', e.target.value)} />
          </div>

          <div>
            <label className={labelClass}>Style Kolb</label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {KOLB_STYLES.map(s => (
                <button key={s} type="button" onClick={() => set('kolb_style', s)}
                  className={`px-3 py-2 rounded-lg text-xs font-medium border text-left transition-all ${form.kolb_style === s ? 'border-primary bg-primary/5 text-primary' : 'border-border bg-white text-muted-foreground hover:bg-muted'}`}>
                  <span className="font-semibold block">{s}</span>
                  <span className="text-xs opacity-70">{KOLB_DESC[s]}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={labelClass}>Intelligences multiples (Howard Gardner) — Score sur 10</label>
            <div className="space-y-2 mt-1">
              {INTELLIGENCES.map(intel => (
                <div key={intel} className="flex items-center gap-3">
                  <span className="text-xs text-foreground w-40 flex-shrink-0">{intel}</span>
                  <input type="range" min="1" max="10" value={intelligenceScores[intel]}
                    onChange={e => setIntelligenceScores(prev => ({ ...prev, [intel]: parseInt(e.target.value) }))}
                    className="flex-1" />
                  <span className="text-xs font-bold w-6 text-right">{intelligenceScores[intel]}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">Intelligence dominante détectée: <strong>{dominant}</strong></p>
          </div>

          <div>
            <label className={labelClass}>Notes de l&apos;enseignant</label>
            <textarea className={`${inputClass} h-20 resize-none`} value={form.teacher_notes} onChange={e => set('teacher_notes', e.target.value)} />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving} className="px-5 py-2 text-sm font-semibold text-white rounded-md hover:opacity-90 bg-primary">
              {saving ? '...' : 'Enregistrer'}
            </button>
            <button type="button" onClick={onClose} className="px-5 py-2 text-sm text-muted-foreground">Annuler</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function LearningAssessments() {
  const [assessments, setAssessments] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);

  const load = () => Promise.all([
    entities.LearningAssessment.list('-created_date', 100),
    entities.Student.list('full_name', 200),
  ]).then(([a, s]) => { setAssessments(a); setStudents(s); setLoading(false); });

  useEffect(() => { load(); }, []);

  const handleDelete = async (id) => {
    if (!confirm('Supprimer ?')) return;
    await entities.LearningAssessment.delete(id);
    toast.success('Supprimé'); load();
  };

  return (
    <div className="p-4 lg:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Styles d&apos;apprentissage</h1>
          <p className="text-muted-foreground text-sm mt-1">Kolb + Intelligences multiples</p>
        </div>
        <button onClick={() => setModal(true)} className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white rounded-md hover:opacity-90 self-start sm:self-auto bg-primary">
          <Plus size={15} /> Nouvelle évaluation
        </button>
      </div>

      {loading ? (
        <div className="p-8 text-center text-muted-foreground text-sm">Chargement...</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {assessments.map(a => (
            <div key={a.id} className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#1E4D8B15' }}>
                  <Brain size={16} style={{ color: '#1E4D8B' }} />
                </div>
                <button onClick={() => handleDelete(a.id)} className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600"><Trash2 size={14} /></button>
              </div>
              <p className="font-semibold text-sm">{a.student_name}</p>
              <p className="text-xs text-muted-foreground mb-3">{a.date_assessment}</p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {a.kolb_style && <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${KOLB_COLORS[a.kolb_style]}`}>{a.kolb_style}</span>}
                {a.dominant_intelligence && <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{a.dominant_intelligence}</span>}
              </div>
              {a.teacher_notes && <p className="text-xs text-muted-foreground italic truncate">&quot;{a.teacher_notes}&quot;</p>}
            </div>
          ))}
          {assessments.length === 0 && (
            <div className="col-span-3 p-12 text-center text-muted-foreground text-sm">
              <div className="text-4xl mb-3">🧠</div>
              <p className="mb-3">Aucune évaluation enregistrée.</p>
              <button onClick={() => setModal(true)} className="text-sm font-semibold" style={{ color: '#1E4D8B' }}>
                Créer la première évaluation →
              </button>
            </div>
          )}
        </div>
      )}
      {modal && <AssessmentModal students={students} onSave={() => { setModal(false); load(); }} onClose={() => setModal(false)} />}
    </div>
  );
}
