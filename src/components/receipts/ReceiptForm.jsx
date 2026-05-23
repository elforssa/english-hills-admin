'use client';

import { useState } from 'react';

const categories = ['Enfants', 'Ados', 'Adultes', 'Business', 'Particulier', 'Préparation aux examens'];
const niveaux = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'CECRL'];
const typesCours = ['Standard', 'Intensif'];
const modesPaiement = ['Espèces', 'Carte bancaire', 'Virement', 'Chèque'];
const statutsPaiement = ['Soldé', 'Acompte versé', 'En attente', 'En retard'];

const today = new Date().toISOString().split('T')[0];

export default function ReceiptForm({ onSubmit, onCancel, saving, initialData }) {
  const [form, setForm] = useState({
    student_id: '',
    date: today,
    nom_prenom: '',
    telephone: '',
    email: '',
    date_naissance: '',
    categorie: 'Adultes',
    niveau: 'A1',
    duree_cours: '',
    type_cours: 'Standard',
    jours: '',
    plage_horaire: '',
    montant_total: '',
    montant_paye: '',
    mode_paiement: 'Espèces',
    statut_paiement: 'En attente',
    observation: '',
    ...initialData,
  });

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));
  const montantRestant = (parseFloat(form.montant_total) || 0) - (parseFloat(form.montant_paye) || 0);

  const handleSubmit = (e) => {
    e.preventDefault();
    const restant = (parseFloat(form.montant_total) || 0) - (parseFloat(form.montant_paye) || 0);
    const autoStatus = restant <= 0 ? 'Soldé' : form.statut_paiement;
    onSubmit({
      ...form,
      student_id: form.student_id || null,
      montant_total: parseFloat(form.montant_total) || 0,
      montant_paye: parseFloat(form.montant_paye) || 0,
      statut_paiement: autoStatus,
    });
  };

  const inputClass = "w-full border border-border rounded-xl px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-muted-foreground/50";
  const labelClass = "block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5";

  const SectionTitle = ({ children }) => (
    <div className="flex items-center gap-3 mb-5">
      <span className="text-xs font-bold tracking-widest uppercase" style={{ color: '#1E4D8B' }}>{children}</span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );

  const ToggleGroup = ({ options, value, onChange }) => (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
            value === opt ? 'bg-primary text-white border-transparent shadow-sm' : 'bg-white text-foreground border-border hover:border-primary/40 hover:bg-primary/5'
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );

  const STATUT_CONFIG = {
    'Soldé': 'bg-emerald-50 text-emerald-700 border-emerald-200',
    'Acompte versé': 'bg-amber-50 text-amber-700 border-amber-200',
    'En attente': 'bg-blue-50 text-blue-700 border-blue-200',
    'En retard': 'bg-red-50 text-red-700 border-red-200',
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <div>
        <SectionTitle>Reçu</SectionTitle>
        <div className="max-w-xs">
          <label htmlFor="rf-date" className={labelClass}>Date <span className="text-red-400">*</span></label>
          <input id="rf-date" type="date" className={inputClass} value={form.date} onChange={(e) => set('date', e.target.value)} required />
        </div>
      </div>

      <div>
        <SectionTitle>Données d&apos;inscription</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="rf-nom" className={labelClass}>Nom et prénom <span className="text-red-400">*</span></label>
            <input id="rf-nom" type="text" className={inputClass} placeholder="ex. Karim Benali" value={form.nom_prenom} onChange={(e) => set('nom_prenom', e.target.value)} required />
          </div>
          <div>
            <label htmlFor="rf-tel" className={labelClass}>Téléphone <span className="text-red-400">*</span></label>
            <input id="rf-tel" type="tel" className={inputClass} placeholder="ex. 0661 234 567" value={form.telephone} onChange={(e) => set('telephone', e.target.value)} required />
          </div>
          <div>
            <label htmlFor="rf-email" className={labelClass}>Email</label>
            <input id="rf-email" type="email" className={inputClass} placeholder="ex. client@email.com" value={form.email} onChange={(e) => set('email', e.target.value)} />
          </div>
          <div>
            <label htmlFor="rf-dob" className={labelClass}>Date de naissance</label>
            <input id="rf-dob" type="date" className={inputClass} value={form.date_naissance} onChange={(e) => set('date_naissance', e.target.value)} />
          </div>
        </div>
      </div>

      <div>
        <SectionTitle>Détails du cours</SectionTitle>
        <div className="space-y-5">
          <div>
            <label className={labelClass}>Catégorie <span className="text-red-400">*</span></label>
            <ToggleGroup options={categories} value={form.categorie} onChange={(v) => set('categorie', v)} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Niveau (CECRL) <span className="text-red-400">*</span></label>
              <ToggleGroup options={niveaux} value={form.niveau} onChange={(v) => set('niveau', v)} />
            </div>
            <div>
              <label htmlFor="rf-duree" className={labelClass}>Durée du cours (H/mois)</label>
              <input id="rf-duree" type="text" className={inputClass} placeholder="ex. 20h/mois" value={form.duree_cours} onChange={(e) => set('duree_cours', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>Type de cours <span className="text-red-400">*</span></label>
              <ToggleGroup options={typesCours} value={form.type_cours} onChange={(v) => set('type_cours', v)} />
            </div>
            <div>
              <label htmlFor="rf-jours" className={labelClass}>Jours</label>
              <input id="rf-jours" type="text" className={inputClass} placeholder="ex. Lun, Mer, Ven" value={form.jours} onChange={(e) => set('jours', e.target.value)} />
            </div>
            <div>
              <label htmlFor="rf-horaire" className={labelClass}>Plage horaire</label>
              <input id="rf-horaire" type="text" className={inputClass} placeholder="ex. 18h – 19h30" value={form.plage_horaire} onChange={(e) => set('plage_horaire', e.target.value)} />
            </div>
          </div>
        </div>
      </div>

      <div>
        <SectionTitle>Détails du paiement</SectionTitle>
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="rf-total" className={labelClass}>Montant total du cours (MAD) <span className="text-red-400">*</span></label>
              <input id="rf-total" type="number" className={inputClass} placeholder="ex. 1500" value={form.montant_total} onChange={(e) => set('montant_total', e.target.value)} required min="0" />
            </div>
            <div>
              <label htmlFor="rf-paye" className={labelClass}>Montant payé ce jour (MAD) <span className="text-red-400">*</span></label>
              <input id="rf-paye" type="number" className={inputClass} placeholder="ex. 750" value={form.montant_paye} onChange={(e) => set('montant_paye', e.target.value)} required min="0" />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl px-4 py-3 border" style={{ backgroundColor: montantRestant > 0 ? '#FFF7ED' : '#F0FDF4', borderColor: montantRestant > 0 ? '#FED7AA' : '#BBF7D0' }}>
            <span className="text-sm font-semibold" style={{ color: montantRestant > 0 ? '#92400e' : '#166534' }}>Montant restant</span>
            <span className="text-base font-bold" style={{ color: montantRestant > 0 ? '#B91C2E' : '#16a34a' }}>
              {montantRestant.toLocaleString('fr-MA')} MAD
            </span>
          </div>

          <div>
            <label className={labelClass}>Mode de paiement <span className="text-red-400">*</span></label>
            <ToggleGroup options={modesPaiement} value={form.mode_paiement} onChange={(v) => set('mode_paiement', v)} />
          </div>

          <div>
            <label className={labelClass}>Statut du paiement</label>
            <div className="flex flex-wrap gap-2">
              {statutsPaiement.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => set('statut_paiement', s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${form.statut_paiement === s ? STATUT_CONFIG[s] + ' shadow-sm' : 'bg-white text-muted-foreground border-border hover:bg-muted'}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div>
        <SectionTitle>Observation</SectionTitle>
        <textarea
          className={`${inputClass} h-24 resize-none`}
          placeholder="Remarques, commentaires..."
          value={form.observation}
          onChange={(e) => set('observation', e.target.value)}
        />
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="px-6 py-2.5 text-sm font-semibold text-white rounded-xl shadow-sm hover:shadow-md hover:opacity-95 transition-all disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #1E4D8B 0%, #1a3f75 100%)' }}
        >
          {saving ? 'Enregistrement...' : 'Enregistrer le reçu'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-6 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors rounded-xl hover:bg-muted"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}
