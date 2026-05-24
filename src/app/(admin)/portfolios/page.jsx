'use client';

import { useEffect, useState } from 'react';
import { entities, integrations } from '@/lib/entities';
import { Plus, Upload, FileText, Video, Mic, Trash2, Eye, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const PROJECT_TYPES = ['Oral Presentation', 'Written Essay', 'Audio Recording', 'Video Project', 'PDF Document', 'Other'];
const TERMES = ['Sept–Déc', 'Jan–Mar', 'Avr–Juin', 'Été'];
const NIVEAUX = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

const inputClass = "w-full border border-border rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-primary";
const labelClass = "block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1";

const TYPE_ICONS = {
  'Oral Presentation': Mic,
  'Audio Recording': Mic,
  'Video Project': Video,
  'PDF Document': FileText,
  'Written Essay': FileText,
  'Other': FileText,
};

function PortfolioModal({ students, onSave, onClose }) {
  const [form, setForm] = useState({
    student_id: '', student_name: '', terme: 'Sept–Déc', annee: '2025-2026',
    niveau: 'A1', project_type: 'Oral Presentation', title: '', description: '',
    file_url: '', teacher_note: '', visible_to_parent: true, visible_to_student: true,
  });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleStudentChange = (id) => {
    const s = students.find(s => s.id === id);
    set('student_id', id);
    set('student_name', s?.full_name || '');
    if (s?.niveau_cefr) set('niveau', s.niveau_cefr);
  };

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await integrations.Core.UploadFile({ file, bucket: 'portfolios' });
      set('file_url', file_url);
      set('file_name', file.name);
      toast.success('Fichier uploadé');
    } catch (err) {
      toast.error(err?.message || "Échec de l'upload du fichier.");
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await entities.Portfolio.create(form);
      toast.success('Portfolio ajouté');
      onSave();
    } catch {
      // entities.js already toasted — keep modal open for retry.
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ajouter un projet portfolio</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={labelClass}>Apprenant *</label>
            <select className={inputClass} value={form.student_id} onChange={e => handleStudentChange(e.target.value)} required>
              <option value="">— Choisir —</option>
              {students.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Terme</label>
              <select className={inputClass} value={form.terme} onChange={e => set('terme', e.target.value)}>
                {TERMES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Année</label>
              <input className={inputClass} value={form.annee} onChange={e => set('annee', e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Niveau</label>
              <select className={inputClass} value={form.niveau} onChange={e => set('niveau', e.target.value)}>
                {NIVEAUX.map(n => <option key={n}>{n}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Type de projet</label>
              <select className={inputClass} value={form.project_type} onChange={e => set('project_type', e.target.value)}>
                {PROJECT_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={labelClass}>Titre *</label>
            <input className={inputClass} value={form.title} onChange={e => set('title', e.target.value)} required />
          </div>
          <div>
            <label className={labelClass}>Description</label>
            <textarea className={`${inputClass} h-16 resize-none`} value={form.description} onChange={e => set('description', e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Fichier</label>
            <input type="file" onChange={handleFile} className="w-full text-sm text-muted-foreground" />
            {uploading && <p className="text-xs text-primary mt-1">Upload en cours...</p>}
            {form.file_url && <p className="text-xs text-green-600 mt-1 flex items-center gap-1"><Check size={12} /> {form.file_name}</p>}
          </div>
          <div>
            <label className={labelClass}>Note enseignant</label>
            <textarea className={`${inputClass} h-16 resize-none`} value={form.teacher_note} onChange={e => set('teacher_note', e.target.value)} />
          </div>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.visible_to_parent} onChange={e => set('visible_to_parent', e.target.checked)} />
              Visible aux parents
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.visible_to_student} onChange={e => set('visible_to_student', e.target.checked)} />
              Visible à l&apos;apprenant
            </label>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={saving || uploading}>{saving ? '...' : 'Enregistrer'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Portfolios() {
  const [portfolios, setPortfolios] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [filterStudent, setFilterStudent] = useState('');
  const [filterTerme, setFilterTerme] = useState('');
  const [filterSearch, setFilterSearch] = useState('');

  const load = () => Promise.all([
    entities.Portfolio.list('-created_date', 200),
    entities.Student.list('full_name', 200),
  ])
    .then(([p, s]) => { setPortfolios(p); setStudents(s); })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[portfolios] load failed:', err);
    })
    .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const handleDelete = async (id) => {
    if (!confirm('Supprimer ?')) return;
    await entities.Portfolio.delete(id);
    toast.success('Supprimé'); load();
  };

  // Hoisted ABOVE `filtered` (fixes TDZ bug in the Vite source).
  const studentName = id => students.find(s => s.id === id)?.full_name || '—';

  const filtered = portfolios.filter(p => {
    const name = studentName(p.student_id).toLowerCase();
    return (!filterStudent || p.student_id === filterStudent) &&
      (!filterTerme || p.terme === filterTerme) &&
      (!filterSearch || name.includes(filterSearch.toLowerCase()) || p.title?.toLowerCase().includes(filterSearch.toLowerCase()));
  });

  return (
    <div className="p-4 lg:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Portfolios numériques</h1>
          <p className="text-muted-foreground text-sm mt-1">{portfolios.length} projets au total</p>
        </div>
        <Button onClick={() => setModal(true)} className="self-start sm:self-auto">
          <Plus size={15} /> Ajouter un projet
        </Button>
      </div>

      <div className="flex flex-wrap gap-3 mb-5">
        <input
          className="border border-border rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-primary flex-1 min-w-40"
          placeholder="Rechercher..."
          value={filterSearch}
          onChange={e => setFilterSearch(e.target.value)}
        />
        <select className="border border-border rounded-md px-3 py-2 text-sm bg-white flex-1 sm:flex-none" value={filterStudent} onChange={e => setFilterStudent(e.target.value)}>
          <option value="">Tous les apprenants</option>
          {students.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
        </select>
        <select className="border border-border rounded-md px-3 py-2 text-sm bg-white flex-1 sm:flex-none" value={filterTerme} onChange={e => setFilterTerme(e.target.value)}>
          <option value="">Tous les termes</option>
          {TERMES.map(t => <option key={t}>{t}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="p-8 text-center text-muted-foreground text-sm">Chargement...</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(p => {
            const Icon = TYPE_ICONS[p.project_type] || FileText;
            return (
              <div key={p.id} className="bg-card border border-border rounded-xl p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'var(--brand-tint)' }}>
                    <Icon size={16} style={{ color: 'var(--brand)' }} />
                  </div>
                  <div className="flex gap-1">
                    {p.file_url && (
                      <a href={p.file_url} target="_blank" rel="noreferrer" className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-primary">
                        <Eye size={14} />
                      </a>
                    )}
                    <button onClick={() => handleDelete(p.id)} className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <p className="font-semibold text-sm mb-1 truncate">{p.title}</p>
                <p className="text-xs text-muted-foreground mb-2">{studentName(p.student_id)}</p>
                <div className="flex flex-wrap gap-1.5">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">{p.niveau}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{p.terme}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-700">{p.project_type}</span>
                </div>
                {p.teacher_note && <p className="text-xs text-muted-foreground mt-2 italic truncate">&quot;{p.teacher_note}&quot;</p>}
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="col-span-3 p-12 text-center text-muted-foreground text-sm">
              <div className="text-4xl mb-3">📁</div>
              <p className="mb-3">Aucun projet trouvé.</p>
              <button onClick={() => setModal(true)} className="text-sm font-semibold" style={{ color: 'var(--brand)' }}>
                Ajouter le premier projet →
              </button>
            </div>
          )}
        </div>
      )}

      {modal && <PortfolioModal students={students} onSave={() => { setModal(false); load(); }} onClose={() => setModal(false)} />}
    </div>
  );
}
