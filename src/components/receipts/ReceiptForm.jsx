'use client';

import { useEffect, useState } from 'react';
import { entities } from '@/lib/entities';
import { toast } from 'sonner';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';
import { Check, ChevronsUpDown, UserX, UserPlus, UsersRound, Clock3, Link2 } from 'lucide-react';
import { ALL_LEVELS, SESSION_TYPES, getLevelsForSession, groupMatchesSelection } from '@/lib/academicPrograms';

const categories = ['Enfants', 'Ados', 'Adultes', 'Business', 'Particulier', 'Préparation aux examens'];
const typesCours = ['Standard', 'Intensif'];
const modesPaiement = ['Espèces', 'Carte bancaire', 'Virement', 'Chèque'];
const statutsPaiement = ['Soldé', 'Acompte versé', 'En attente', 'En retard'];
const PHOTO_CONSENTS = ['Non demandé', 'Accepte', 'Refuse'];
const SOURCES = [
  'Réseaux sociaux (Facebook / Instagram)',
  'Recherche Google',
  'Famille / Ami(e)',
  'Passage devant le centre (walk-in)',
  'Ancien élève / Réinscription',
];

// Maps the student's age_category (used across the app) to the receipt's
// own `categorie` vocabulary. Kept in sync with receipts/new/page.jsx.
const AGE_TO_CATEGORIE = {
  'Young Learners (6-12)': 'Enfants',
  'Teens (13-17)': 'Ados',
  'Adults (18+)': 'Adultes',
  'Corporate': 'Business',
};

// Reverse map: receipt `categorie` -> student age_category, used when a student
// is created inline from a receipt.
const CATEGORIE_TO_AGE = {
  'Enfants': 'Young Learners (6-12)',
  'Ados': 'Teens (13-17)',
  'Adultes': 'Adults (18+)',
  'Business': 'Corporate',
  'Particulier': 'Adults (18+)',
  'Préparation aux examens': 'Adults (18+)',
};

const today = new Date().toISOString().split('T')[0];
const normName = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
const normPhone = s => (s || '').replace(/\D/g, '');
const ACTIVE_ENROLLMENT_STATUSES = ['Validated', 'Trial'];

function suggestAcademicLink(student, groups, enrollments, sessionType, level) {
  if (!student) return { group_id: '', enrollment_id: '' };

  const matchingGroup = (groupId) => {
    const group = groups.find((item) => item.id === groupId);
    return group && groupMatchesSelection(group, sessionType, level) ? group : null;
  };

  if (student.groupe_id && matchingGroup(student.groupe_id)) {
    const enrollment = enrollments.find((item) =>
      item.student_id === student.id
      && item.group_id === student.groupe_id
      && ACTIVE_ENROLLMENT_STATUSES.includes(item.status),
    );
    return { group_id: student.groupe_id, enrollment_id: enrollment?.id || '' };
  }

  const candidates = enrollments.filter((item) =>
    item.student_id === student.id
    && ACTIVE_ENROLLMENT_STATUSES.includes(item.status)
    && matchingGroup(item.group_id),
  );
  const groupIds = [...new Set(candidates.map((item) => item.group_id))];
  if (groupIds.length !== 1) return { group_id: '', enrollment_id: '' };

  const enrollment = candidates.find((item) => item.group_id === groupIds[0]);
  return { group_id: groupIds[0], enrollment_id: enrollment?.id || '' };
}

export default function ReceiptForm({ onSubmit, onCancel, saving, initialData }) {
  const [form, setForm] = useState({
    student_id: '',
    group_id: '',
    enrollment_id: '',
    date: today,
    nom_prenom: '',
    telephone: '',
    email: '',
    parent_email: '',
    date_naissance: '',
    categorie: 'Adultes',
    session_type: '',
    photo_consent: 'Non demandé',
    referral_source: '',
    niveau: '',
    duree_cours: '',
    type_cours: 'Standard',
    jours: '',
    plage_horaire: '',
    montant_total: '',
    remise: 0,
    montant_paye: '',
    mode_paiement: 'Espèces',
    statut_paiement: 'En attente',
    observation: '',
    ...initialData,
  });

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  // ── Linked student ────────────────────────────────────────────────────────
  // A receipt MUST point at a real student row via `student_id`, so the payer
  // always appears in the students list. Staff either link an existing student
  // or create one inline before the receipt can be saved.
  const [students, setStudents] = useState([]);
  const [groups, setGroups] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [studentPickerOpen, setStudentPickerOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    Promise.all([
      entities.Student.list('full_name', 500),
      entities.Group.list('name', 500),
      entities.Enrollment.list('-created_date', 1000),
    ]).then(([studentRows, groupRows, enrollmentRows]) => {
      setStudents(studentRows);
      setGroups(groupRows);
      setEnrollments(enrollmentRows);

      if (initialData?.student_id && !initialData?.group_id && !initialData?.enrollment_id) {
        const student = studentRows.find((item) => item.id === initialData.student_id);
        const suggestion = suggestAcademicLink(
          student,
          groupRows,
          enrollmentRows,
          initialData.session_type || student?.session_type || '',
          initialData.niveau || student?.niveau_cefr || '',
        );
        if (suggestion.group_id) setForm((current) => ({ ...current, ...suggestion }));
      }
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedStudent = students.find((s) => s.id === form.student_id);

  // Attach the receipt to a student AND copy their identity fields onto the
  // receipt so the printed reçu matches the student's record.
  const selectStudent = (student) => {
    const sessionType = student.session_type || form.session_type;
    const level = student.niveau_cefr || form.niveau;
    const suggestion = suggestAcademicLink(student, groups, enrollments, sessionType, level);
    setForm((f) => ({
      ...f,
      student_id: student.id,
      nom_prenom: student.full_name || f.nom_prenom,
      telephone: student.telephone || f.telephone,
      email: student.email || f.email,
      parent_email: student.parent_email || f.parent_email,
      date_naissance: student.date_naissance || f.date_naissance,
      niveau: level,
      categorie: AGE_TO_CATEGORIE[student.age_category] || f.categorie,
      session_type: sessionType,
      photo_consent: student.photo_consent || f.photo_consent,
      referral_source: student.referral_source || f.referral_source,
      ...suggestion,
    }));
    setStudentPickerOpen(false);
  };

  const clearStudent = () => setForm((f) => ({ ...f, student_id: '', group_id: '', enrollment_id: '' }));

  // Create a student from the receipt's fields and link it, with a duplicate
  // guard so slightly-different spellings don't spawn a second record.
  const createAndLink = async () => {
    const nm = (form.nom_prenom || '').trim();
    if (nm.length < 2) { toast.error('Renseignez d’abord le nom et prénom.'); return; }
    // Everything else (email, session, phone…) is optional and can be completed
    // later — see the "À compléter" filter on the students list.
    const dup = students.find((s) =>
      normName(s.full_name) === normName(nm) ||
      (normPhone(form.telephone) && normPhone(s.telephone) === normPhone(form.telephone)),
    );
    if (dup) {
      toast.error(`Apprenant similaire : « ${dup.full_name} ». Utilisez la recherche pour le lier.`);
      return;
    }
    setCreating(true);
    try {
      const created = await entities.Student.create({
        full_name: nm,
        telephone: form.telephone || null,
        email: form.email?.trim() || null,
        parent_email: form.parent_email?.trim() || null,
        date_naissance: form.date_naissance || null,
        age_category: CATEGORIE_TO_AGE[form.categorie] || null,
        niveau_cefr: ALL_LEVELS.includes(form.niveau) ? form.niveau : null,
        session_type: form.session_type || 'Yearly',
        photo_consent: form.photo_consent || 'Non demandé',
        referral_source: form.referral_source || null,
        status: 'Enrolled',
      });
      setStudents((prev) => [created, ...prev]);
      setForm((f) => ({ ...f, student_id: created.id, group_id: '', enrollment_id: '' }));
      toast.success(`Apprenant créé et lié : ${created.full_name}`);
    } catch {
      // entities.js already toasted.
    } finally {
      setCreating(false);
    }
  };

  // Total defaults to the amount paid when left blank (quick receipt).
  const base = parseFloat(form.montant_total) || parseFloat(form.montant_paye) || 0;
  const remisePct = parseFloat(form.remise) || 0;
  const effectiveTotal = base * (1 - remisePct / 100);
  const montantRestant = effectiveTotal - (parseFloat(form.montant_paye) || 0);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.student_id) {
      toast.error('Liez un apprenant existant ou créez-en un avant d’enregistrer le reçu.');
      return;
    }
    const autoStatus = montantRestant <= 0 ? 'Soldé' : form.statut_paiement;
    // parent_email is not a receipt column — strip before saving.
    const { parent_email, ...receiptFields } = form;
    onSubmit({
      ...receiptFields,
      student_id: form.student_id || null,
      group_id: form.group_id || null,
      enrollment_id: form.enrollment_id || null,
      session_type: form.session_type || null,
      referral_source: form.referral_source || null,
      // Empty strings break date/typed columns — coerce to null (or today for the required date).
      date: form.date || today,
      date_naissance: form.date_naissance || null,
      email: form.email?.trim() || null,
      montant_total: base,
      remise: remisePct,
      montant_paye: parseFloat(form.montant_paye) || 0,
      statut_paiement: autoStatus,
    });
  };

  const inputClass = "w-full border border-border rounded-xl px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-muted-foreground/50";
  const labelClass = "block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5";

  const SectionTitle = ({ children }) => (
    <div className="flex items-center gap-3 mb-5">
      <span className="text-xs font-bold tracking-widest uppercase" style={{ color: 'var(--brand)' }}>{children}</span>
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

  const matchingGroups = groups.filter((group) => groupMatchesSelection(group, form.session_type, form.niveau));
  const selectedGroup = groups.find((group) => group.id === form.group_id);
  const selectedEnrollment = enrollments.find((item) => item.id === form.enrollment_id);

  const changeGroup = (groupId) => {
    if (!groupId) {
      setForm((current) => ({ ...current, group_id: '', enrollment_id: '' }));
      return;
    }
    const enrollment = enrollments.find((item) =>
      item.student_id === form.student_id
      && item.group_id === groupId
      && ACTIVE_ENROLLMENT_STATUSES.includes(item.status),
    );
    setForm((current) => ({
      ...current,
      group_id: groupId,
      enrollment_id: enrollment?.id || '',
    }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <div>
        <SectionTitle>Apprenant lié</SectionTitle>
        <div className="max-w-md space-y-3">
          <div>
            <label className={labelClass}>Rechercher un apprenant existant</label>
            <Popover open={studentPickerOpen} onOpenChange={setStudentPickerOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={`${inputClass} flex items-center justify-between text-left ${selectedStudent ? '' : 'text-muted-foreground/70'}`}
                >
                  <span className="truncate">
                    {selectedStudent ? selectedStudent.full_name : 'Aucun apprenant lié — rechercher…'}
                  </span>
                  <ChevronsUpDown size={15} className="shrink-0 opacity-50" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)]" align="start">
                <Command>
                  <CommandInput placeholder="Nom de l'apprenant…" />
                  <CommandList>
                    <CommandEmpty>Aucun apprenant trouvé — utilisez « Créer un nouvel apprenant » ci-dessous.</CommandEmpty>
                    <CommandGroup>
                      {students.map((s) => (
                        <CommandItem
                          key={s.id}
                          value={`${s.full_name} ${s.telephone || ''} ${s.email || ''}`}
                          onSelect={() => selectStudent(s)}
                        >
                          <Check size={15} className={`mr-2 ${form.student_id === s.id ? 'opacity-100' : 'opacity-0'}`} />
                          <span className="flex-1 truncate">{s.full_name}</span>
                          {s.telephone && <span className="text-xs text-muted-foreground ml-2">{s.telephone}</span>}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {selectedStudent ? (
            <div className="flex items-center justify-between rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-800">
              <span>Lié à <strong>{selectedStudent.full_name}</strong> — ce reçu apparaîtra sur sa fiche.</span>
              <button type="button" onClick={clearStudent} className="flex items-center gap-1 text-emerald-700 hover:text-emerald-900 font-medium">
                <UserX size={13} /> Détacher
              </button>
            </div>
          ) : (
            <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-800">
              Aucun apprenant lié. Recherchez ci-dessus pour lier un apprenant existant, ou remplissez les infos plus bas et cliquez <strong>« Créer et lier l’apprenant »</strong>. Un apprenant est obligatoire.
            </div>
          )}
        </div>
      </div>

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
            <label htmlFor="rf-tel" className={labelClass}>Téléphone</label>
            <input id="rf-tel" type="tel" className={inputClass} placeholder="ex. 0661 234 567" value={form.telephone} onChange={(e) => set('telephone', e.target.value)} />
          </div>
          <div>
            <label htmlFor="rf-email" className={labelClass}>Email (apprenant)</label>
            <input id="rf-email" type="email" className={inputClass} placeholder="ex. client@email.com" value={form.email} onChange={(e) => set('email', e.target.value)} />
          </div>
          <div>
            <label htmlFor="rf-pemail" className={labelClass}>Email parent / tuteur</label>
            <input id="rf-pemail" type="email" className={inputClass} placeholder="Pour un jeune apprenant" value={form.parent_email} onChange={(e) => set('parent_email', e.target.value)} />
          </div>
          <div>
            <label htmlFor="rf-dob" className={labelClass}>Date de naissance</label>
            <input id="rf-dob" type="date" className={inputClass} value={form.date_naissance} onChange={(e) => set('date_naissance', e.target.value)} />
          </div>
          <div>
            <label htmlFor="rf-session" className={labelClass}>Session / Programme</label>
            <select id="rf-session" className={inputClass} value={form.session_type || ''} onChange={(e) => setForm(f => ({ ...f, session_type: e.target.value, niveau: '', group_id: '', enrollment_id: '' }))}>
              <option value="">— Choisir —</option>
              {SESSION_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="rf-consent" className={labelClass}>Autorisation d&apos;image (réseaux sociaux)</label>
            <select id="rf-consent" className={inputClass} value={form.photo_consent || 'Non demandé'} onChange={(e) => set('photo_consent', e.target.value)}>
              {PHOTO_CONSENTS.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="rf-source" className={labelClass}>Comment avez-vous connu le centre ? (non imprimé)</label>
            <select id="rf-source" className={inputClass} value={form.referral_source || ''} onChange={(e) => set('referral_source', e.target.value)}>
              <option value="">— Non renseigné —</option>
              {SOURCES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-2">Seuls le <strong>nom</strong> et le <strong>paiement</strong> sont requis. Le reste (email, téléphone, session…) peut être complété plus tard — l’email parent activera l’accès portail dès qu’il sera renseigné.</p>
        {!selectedStudent && (
          <button
            type="button"
            onClick={createAndLink}
            disabled={creating}
            className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-primary hover:opacity-90 disabled:opacity-50"
          >
            <UserPlus size={14} /> {creating ? 'Création…' : 'Créer et lier l’apprenant'}
          </button>
        )}
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
              <label htmlFor="rf-niveau" className={labelClass}>Niveau (NIV) <span className="text-red-400">*</span></label>
              <select id="rf-niveau" className={inputClass} value={form.niveau || ''} onChange={(e) => setForm((f) => ({ ...f, niveau: e.target.value, group_id: '', enrollment_id: '' }))} required>
                <option value="">— Choisir —</option>
                {getLevelsForSession(form.session_type || 'Yearly', form.niveau).map(level => <option key={level}>{level}</option>)}
              </select>
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
        <SectionTitle>Affectation académique</SectionTitle>
        <div className="rounded-2xl border border-border bg-slate-50/70 p-4 sm:p-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-xl bg-primary/10 p-2 text-primary"><UsersRound size={18} /></div>
            <div>
              <p className="text-sm font-semibold text-foreground">Groupe du reçu</p>
              <p className="text-xs text-muted-foreground mt-0.5">Facultatif — enregistrez immédiatement et affectez le groupe plus tard si nécessaire.</p>
            </div>
          </div>

          <div>
            <label htmlFor="rf-group" className={labelClass}>Groupe</label>
            <select
              id="rf-group"
              className={inputClass}
              value={form.group_id || ''}
              onChange={(event) => changeGroup(event.target.value)}
              disabled={!form.student_id || !form.session_type || !form.niveau}
            >
              <option value="">— Aucun groupe pour le moment —</option>
              {matchingGroups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}{group.jours ? ` · ${group.jours}` : ''}{group.horaire ? ` · ${group.horaire}` : ''}
                </option>
              ))}
            </select>
            {!form.student_id && <p className="mt-1.5 text-xs text-muted-foreground">Liez d’abord un apprenant.</p>}
            {form.student_id && (!form.session_type || !form.niveau) && <p className="mt-1.5 text-xs text-muted-foreground">Choisissez la session et le niveau pour afficher les groupes correspondants.</p>}
            {form.student_id && form.session_type && form.niveau && matchingGroups.length === 0 && <p className="mt-1.5 text-xs text-amber-700">Aucun groupe disponible pour cette session et ce niveau. Le reçu peut être enregistré sans groupe.</p>}
          </div>

          {selectedGroup ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-900">
              <div className="flex items-center gap-2 text-sm font-semibold"><Link2 size={15} /> {selectedGroup.name}</div>
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-emerald-800">
                <span>{selectedGroup.session_type || 'Yearly'} · {selectedGroup.niveau}</span>
                {(selectedGroup.jours || selectedGroup.horaire) && <span className="inline-flex items-center gap-1"><Clock3 size={12} /> {[selectedGroup.jours, selectedGroup.horaire].filter(Boolean).join(' · ')}</span>}
              </div>
              <p className="mt-2 text-xs text-emerald-700">
                {selectedEnrollment ? 'Inscription existante liée automatiquement.' : 'Le reçu sera lié au groupe; une inscription validée sera créée lors du premier enregistrement.'}
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-800">
              À affecter plus tard — le reçu restera visible et pourra être lié depuis « Modifier ».
            </div>
          )}
        </div>
      </div>

      <div>
        <SectionTitle>Détails du paiement</SectionTitle>
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="rf-total" className={labelClass}>
                {remisePct > 0 ? 'Prix de base (MAD)' : 'Montant total du cours (MAD)'}
              </label>
              <input id="rf-total" type="number" className={inputClass} placeholder="= montant payé si vide" value={form.montant_total} onChange={(e) => set('montant_total', e.target.value)} min="0" />
            </div>
            <div>
              <label htmlFor="rf-remise" className={labelClass}>Remise (%)</label>
              <input
                id="rf-remise"
                type="number"
                className={inputClass}
                placeholder="0"
                value={form.remise || ''}
                onChange={(e) => set('remise', e.target.value)}
                min="0"
                max="100"
                step="0.5"
              />
            </div>
          </div>

          {remisePct > 0 && (
            <div className="flex items-center justify-between rounded-xl px-4 py-3 border border-violet-200 bg-violet-50">
              <span className="text-sm font-semibold text-violet-800">Prix après remise ({remisePct}%)</span>
              <span className="text-base font-bold text-violet-700">{effectiveTotal.toLocaleString('fr-MA')} MAD</span>
            </div>
          )}

          <div>
            <label htmlFor="rf-paye" className={labelClass}>Montant payé ce jour (MAD) <span className="text-red-400">*</span></label>
            <input id="rf-paye" type="number" className={inputClass} placeholder="ex. 750" value={form.montant_paye} onChange={(e) => set('montant_paye', e.target.value)} required min="0" />
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
