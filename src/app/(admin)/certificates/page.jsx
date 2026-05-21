'use client';

import { useEffect, useState, useRef } from 'react';
import { entities, auth } from '@/lib/entities';
import { Plus, Award, Printer, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const inputClass = "w-full border border-border rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-primary";
const labelClass = "block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1";
const NIVEAUX = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const TERMES = ['Sept–Déc', 'Jan–Mar', 'Avr–Juin', 'Été'];

function CertificateModal({ students, onSave, onClose }) {
  const [form, setForm] = useState({
    student_id: '', student_name: '', niveau_complete: 'A1',
    terme: 'Sept–Déc', annee: '2025-2026',
    date_emission: new Date().toISOString().split('T')[0],
    directeur: 'Direction English Hills', notes: '', issued: true,
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleStudentChange = (id) => {
    const s = students.find(s => s.id === id);
    set('student_id', id);
    set('student_name', s?.full_name || '');
    if (s?.niveau_cefr) set('niveau_complete', s.niveau_cefr);
  };

  const handleSubmit = async (e) => {
    e.preventDefault(); setSaving(true);
    await entities.Certificate.create(form);
    toast.success('Certificat créé'); onSave();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-semibold">Générer un certificat</h2>
          <button onClick={onClose} className="text-muted-foreground text-xl">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className={labelClass}>Apprenant *</label>
            <select className={inputClass} value={form.student_id} onChange={e => handleStudentChange(e.target.value)} required>
              <option value="">— Choisir —</option>
              {students.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Niveau complété</label>
              <select className={inputClass} value={form.niveau_complete} onChange={e => set('niveau_complete', e.target.value)}>
                {NIVEAUX.map(n => <option key={n}>{n}</option>)}
              </select>
            </div>
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
              <label className={labelClass}>Date d&apos;émission</label>
              <input type="date" className={inputClass} value={form.date_emission} onChange={e => set('date_emission', e.target.value)} />
            </div>
          </div>
          <div>
            <label className={labelClass}>Signataire / Directeur</label>
            <input className={inputClass} value={form.directeur} onChange={e => set('directeur', e.target.value)} />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving} className="px-5 py-2 text-sm font-semibold text-white rounded-md hover:opacity-90" style={{ backgroundColor: '#1E4D8B' }}>
              {saving ? '...' : 'Créer le certificat'}
            </button>
            <button type="button" onClick={onClose} className="px-5 py-2 text-sm text-muted-foreground">Annuler</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CertificatePrintView({ cert }) {
  const handlePrint = () => window.print();
  return (
    <div>
      <style>{`@media print { .no-print { display: none !important; } body { margin: 0; } }`}</style>
      <div className="no-print flex gap-2 mb-4">
        <button onClick={handlePrint} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white rounded-md" style={{ backgroundColor: '#1E4D8B' }}>
          <Printer size={14} /> Imprimer
        </button>
      </div>
      <div className="border-8 rounded-2xl p-12 text-center max-w-2xl mx-auto" style={{ borderColor: '#1E4D8B' }}>
        <img src="/eh-logo.png" alt="English Hills" className="h-16 mx-auto mb-4" />
        <p className="text-xs tracking-widest uppercase text-muted-foreground mb-6" style={{ color: '#B91C2E' }}>English Hills Language Center</p>
        <p className="text-sm uppercase tracking-widest text-muted-foreground mb-2">Certificat de réussite</p>
        <h1 className="text-3xl font-bold mb-6" style={{ color: '#1E4D8B' }}>Certificate of Achievement</h1>
        <p className="text-muted-foreground mb-2">This is to certify that</p>
        <p className="text-2xl font-bold mb-4">{cert.student_name}</p>
        <p className="text-muted-foreground mb-2">has successfully completed</p>
        <p className="text-xl font-bold mb-1" style={{ color: '#1E4D8B' }}>Level {cert.niveau_complete}</p>
        <p className="text-muted-foreground mb-8">{cert.terme} {cert.annee}</p>
        <div className="border-t border-border pt-6 mt-6">
          <p className="text-sm font-semibold">{cert.directeur}</p>
          <p className="text-xs text-muted-foreground">Direction — English Hills Language Center</p>
          <p className="text-xs text-muted-foreground mt-1">Bouskoura / Sidi Maarouf, Casablanca</p>
          <p className="text-xs text-muted-foreground">contact@english-hills.com</p>
          <p className="text-xs text-muted-foreground mt-4">Émis le {cert.date_emission}</p>
        </div>
      </div>
    </div>
  );
}

export default function Certificates() {
  const [certs, setCerts] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [printing, setPrinting] = useState(null);

  const load = () => Promise.all([
    entities.Certificate.list('-created_date', 200),
    entities.Student.list('full_name', 200),
  ]).then(([c, s]) => { setCerts(c); setStudents(s); setLoading(false); });

  useEffect(() => { load(); }, []);

  const handleDelete = async (id) => {
    if (!confirm('Supprimer ce certificat ?')) return;
    await entities.Certificate.delete(id);
    toast.success('Supprimé'); load();
  };

  if (printing) return (
    <div className="p-4 lg:p-8">
      <button onClick={() => setPrinting(null)} className="no-print mb-4 text-sm text-muted-foreground hover:text-foreground">← Retour</button>
      <CertificatePrintView cert={printing} />
    </div>
  );

  return (
    <div className="p-4 lg:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Certificats de réussite</h1>
          <p className="text-muted-foreground text-sm mt-1">{certs.length} certificats émis</p>
        </div>
        <button onClick={() => setModal(true)} className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white rounded-md hover:opacity-90 self-start sm:self-auto" style={{ backgroundColor: '#1E4D8B' }}>
          <Plus size={15} /> Nouveau certificat
        </button>
      </div>

      {loading ? (
        <div className="p-8 text-center text-muted-foreground text-sm">Chargement...</div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="sm:hidden divide-y divide-border">
            {certs.map(c => (
              <div key={c.id} className="p-4 flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-sm">{c.student_name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Niveau {c.niveau_complete} · {c.terme} {c.annee}</p>
                  <p className="text-xs text-muted-foreground">Émis le {c.date_emission}</p>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => setPrinting(c)} className="p-1.5 rounded hover:bg-muted text-muted-foreground"><Printer size={15} /></button>
                  <button onClick={() => handleDelete(c.id)} className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600"><Trash2 size={15} /></button>
                </div>
              </div>
            ))}
          </div>
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted border-b border-border text-xs font-semibold text-muted-foreground">
                  {['Apprenant','Niveau','Terme','Année','Date émission','Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {certs.map(c => (
                  <tr key={c.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{c.student_name}</td>
                    <td className="px-4 py-3"><span className="text-xs font-bold text-white px-2 py-0.5 rounded" style={{ backgroundColor: '#1E4D8B' }}>{c.niveau_complete}</span></td>
                    <td className="px-4 py-3 text-muted-foreground">{c.terme}</td>
                    <td className="px-4 py-3 text-muted-foreground">{c.annee}</td>
                    <td className="px-4 py-3 text-muted-foreground">{c.date_emission}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => setPrinting(c)} className="flex items-center gap-1 text-xs font-medium hover:underline" style={{ color: '#1E4D8B' }}><Printer size={13} /> Imprimer</button>
                        <button onClick={() => handleDelete(c.id)} className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {certs.length === 0 && <div className="p-8 text-center text-muted-foreground text-sm">Aucun certificat émis.</div>}
        </div>
      )}
      {modal && <CertificateModal students={students} onSave={() => { setModal(false); load(); }} onClose={() => setModal(false)} />}
    </div>
  );
}
