'use client';

import { useEffect, useState } from 'react';
import { entities, auth } from '@/lib/entities';
import { Plus, Calculator, CheckCircle, Printer, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const inputClass = "w-full border border-border rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-primary";
const labelClass = "block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1";

const MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const STATUS_COLORS = { 'Brouillon': 'bg-gray-100 text-gray-600', 'Validé': 'bg-blue-100 text-blue-700', 'Payé': 'bg-green-100 text-green-700' };

// CNSS 2024 Morocco rates
const CNSS_EMPLOYEE_RATE = 0.0448; // 4.48% employee share
const AMO_EMPLOYEE_RATE = 0.0226;  // 2.26% AMO employee
const IR_BRACKETS = [
  { max: 2500, rate: 0 }, { max: 4166.67, rate: 0.10 }, { max: 5000, rate: 0.20 },
  { max: 6666.67, rate: 0.30 }, { max: 15000, rate: 0.34 }, { max: Infinity, rate: 0.38 },
];

function calcIR(brut) {
  let tax = 0, prev = 0;
  for (const b of IR_BRACKETS) {
    if (brut <= prev) break;
    const taxable = Math.min(brut, b.max) - prev;
    tax += taxable * b.rate;
    prev = b.max;
  }
  return Math.round(tax);
}

function calcPayroll(teacher, heures) {
  const isEmployee = teacher.contract_type === 'Employé';
  const taux = teacher.taux_horaire || 0;
  const brut = isEmployee ? (teacher.salaire_mensuel || taux * heures) : taux * heures;
  if (isEmployee) {
    const cnss = Math.round(brut * CNSS_EMPLOYEE_RATE);
    const amo = Math.round(brut * AMO_EMPLOYEE_RATE);
    const ir = calcIR(brut - cnss - amo);
    return { brut, cnss, amo, ir, net: brut - cnss - amo - ir };
  } else {
    return { brut, cnss: 0, amo: 0, ir: Math.round(brut * 0.20), net: Math.round(brut * 0.80) };
  }
}

function PayrollModal({ teachers, onSave, onClose }) {
  const [teacherId, setTeacherId] = useState('');
  const [mois, setMois] = useState(MONTHS[new Date().getMonth()]);
  const [annee, setAnnee] = useState(String(new Date().getFullYear()));
  const [heures, setHeures] = useState(0);
  const [saving, setSaving] = useState(false);

  const teacher = teachers.find(t => t.id === teacherId);
  const calc = teacher ? calcPayroll(teacher, parseFloat(heures) || 0) : null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!teacher || !calc) return;
    setSaving(true);
    await entities.Payroll.create({
      teacher_id: teacher.id,
      teacher_name: teacher.full_name,
      contract_type: teacher.contract_type,
      mois, annee,
      heures_travaillees: parseFloat(heures) || 0,
      taux_horaire: teacher.taux_horaire || 0,
      salaire_brut: calc.brut,
      cotisation_cnss: calc.cnss,
      cotisation_amo: calc.amo,
      ir_retenu: calc.ir,
      salaire_net: calc.net,
      statut: 'Brouillon',
    });
    toast.success('Fiche de paie créée');
    onSave();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-lg shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-semibold">Nouvelle fiche de paie</h2>
          <button onClick={onClose} aria-label="Fermer" className="text-muted-foreground text-xl">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className={labelClass}>Enseignant *</label>
            <select className={inputClass} value={teacherId} onChange={e => setTeacherId(e.target.value)} required>
              <option value="">— Choisir —</option>
              {teachers.map(t => <option key={t.id} value={t.id}>{t.full_name} ({t.contract_type})</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Mois</label>
              <select className={inputClass} value={mois} onChange={e => setMois(e.target.value)}>
                {MONTHS.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Année</label>
              <input className={inputClass} value={annee} onChange={e => setAnnee(e.target.value)} />
            </div>
          </div>
          {teacher?.contract_type === 'Freelance' && (
            <div>
              <label className={labelClass}>Heures travaillées</label>
              <input type="number" className={inputClass} value={heures} onChange={e => setHeures(e.target.value)} min="0" step="0.5" />
            </div>
          )}
          {calc && (
            <div className="bg-muted rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Salaire brut</span><span className="font-semibold">{calc.brut.toLocaleString('fr-MA')} MAD</span></div>
              {calc.cnss > 0 && <div className="flex justify-between"><span className="text-muted-foreground">CNSS (4.48%)</span><span className="text-red-600">-{calc.cnss.toLocaleString('fr-MA')} MAD</span></div>}
              {calc.amo > 0 && <div className="flex justify-between"><span className="text-muted-foreground">AMO (2.26%)</span><span className="text-red-600">-{calc.amo.toLocaleString('fr-MA')} MAD</span></div>}
              <div className="flex justify-between"><span className="text-muted-foreground">IR retenu</span><span className="text-red-600">-{calc.ir.toLocaleString('fr-MA')} MAD</span></div>
              <div className="flex justify-between border-t border-border pt-2 font-bold"><span>Salaire net</span><span style={{ color: '#1E4D8B' }}>{calc.net.toLocaleString('fr-MA')} MAD</span></div>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving} className="px-5 py-2 text-sm font-semibold text-white rounded-md hover:opacity-90 bg-primary">
              {saving ? '...' : 'Créer la fiche'}
            </button>
            <button type="button" onClick={onClose} className="px-5 py-2 text-sm text-muted-foreground">Annuler</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function PayrollPage() {
  const [payrolls, setPayrolls] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);

  const load = () => Promise.all([
    entities.Payroll.list('-created_date', 200),
    entities.Teacher.list('full_name', 100),
  ]).then(([p, t]) => { setPayrolls(p); setTeachers(t); setLoading(false); });

  useEffect(() => { load(); }, []);

  const handleValidate = async (id) => {
    await entities.Payroll.update(id, { statut: 'Validé' });
    toast.success('Validé'); load();
  };

  const handlePay = async (id) => {
    await entities.Payroll.update(id, { statut: 'Payé' });
    toast.success('Marqué comme payé'); load();
  };

  const handleDelete = async (id) => {
    if (!confirm('Supprimer ?')) return;
    await entities.Payroll.delete(id);
    toast.success('Supprimé'); load();
  };

  const currentMonth = MONTHS[new Date().getMonth()];
  const currentYear = String(new Date().getFullYear());
  const totalNet = payrolls.filter(p => p.statut === 'Payé' && p.mois === currentMonth && p.annee === currentYear).reduce((s, p) => s + (p.salaire_net || 0), 0);
  const totalPending = payrolls.filter(p => p.statut !== 'Payé').reduce((s, p) => s + (p.salaire_net || 0), 0);

  return (
    <div className="p-4 lg:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold">Paie & RH</h1>
        <button onClick={() => setModal(true)} className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white rounded-md hover:opacity-90 self-start sm:self-auto bg-primary">
          <Plus size={15} /> Nouvelle fiche de paie
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-1">Total payé (ce mois)</p>
          <p className="text-xl font-bold" style={{ color: '#1E4D8B' }}>{totalNet.toLocaleString('fr-MA')} MAD</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground mb-1">En attente de paiement</p>
          <p className="text-xl font-bold text-amber-600">{totalPending.toLocaleString('fr-MA')} MAD</p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Chargement...</div>
        ) : (
          <>
            <div className="sm:hidden divide-y divide-border">
              {payrolls.map(p => (
                <div key={p.id} className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="font-semibold text-sm">{p.teacher_name}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${STATUS_COLORS[p.statut]}`}>{p.statut}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{p.mois} {p.annee} · {p.contract_type}</p>
                  <p className="text-sm font-bold mt-1" style={{ color: '#1E4D8B' }}>Net: {(p.salaire_net || 0).toLocaleString('fr-MA')} MAD</p>
                  <div className="flex gap-2 mt-2">
                    {p.statut === 'Brouillon' && <button onClick={() => handleValidate(p.id)} className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded">Valider</button>}
                    {p.statut === 'Validé' && <button onClick={() => handlePay(p.id)} className="text-xs px-2 py-1 bg-green-50 text-green-700 rounded">Marquer payé</button>}
                    <button onClick={() => handleDelete(p.id)} className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600"><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted border-b border-border text-xs font-semibold text-muted-foreground">
                    {['Enseignant','Contrat','Mois','Brut','CNSS+AMO','IR','Net','Statut','Actions'].map(h => (
                      <th key={h} className="text-left px-4 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {payrolls.map(p => (
                    <tr key={p.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{p.teacher_name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{p.contract_type}</td>
                      <td className="px-4 py-3 text-muted-foreground">{p.mois} {p.annee}</td>
                      <td className="px-4 py-3">{(p.salaire_brut || 0).toLocaleString('fr-MA')}</td>
                      <td className="px-4 py-3 text-red-600">{((p.cotisation_cnss || 0) + (p.cotisation_amo || 0)).toLocaleString('fr-MA')}</td>
                      <td className="px-4 py-3 text-red-600">{(p.ir_retenu || 0).toLocaleString('fr-MA')}</td>
                      <td className="px-4 py-3 font-bold" style={{ color: '#1E4D8B' }}>{(p.salaire_net || 0).toLocaleString('fr-MA')}</td>
                      <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[p.statut]}`}>{p.statut}</span></td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          {p.statut === 'Brouillon' && <button onClick={() => handleValidate(p.id)} className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100">Valider</button>}
                          {p.statut === 'Validé' && <button onClick={() => handlePay(p.id)} className="text-xs px-2 py-1 bg-green-50 text-green-700 rounded hover:bg-green-100">Payé</button>}
                          <button onClick={() => handleDelete(p.id)} className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600"><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {payrolls.length === 0 && <div className="p-8 text-center text-muted-foreground text-sm">Aucune fiche de paie.</div>}
          </>
        )}
      </div>
      {modal && <PayrollModal teachers={teachers} onSave={() => { setModal(false); load(); }} onClose={() => setModal(false)} />}
    </div>
  );
}
