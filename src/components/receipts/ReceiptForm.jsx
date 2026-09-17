'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getBrowserClient } from '@/lib/supabase';
import { SESSION_TYPES, getLevelsForSession } from '@/lib/academicPrograms';
import { PAYMENT_METHODS, localBusinessDate, money } from '@/lib/receiptFinance';
import { DEFAULT_SCHOOL_YEAR, SCHOOL_YEAR_OPTIONS, buildServiceDescription } from '@/lib/receiptPresentation';
import { createStableIdempotencyKey } from '@/lib/stableIdempotencyKey.mjs';
import { createInitialChargeCoordinator, createLatestRequestGate, emptyChargeTerms } from '@/lib/receiptInitialCharge.mjs';
import { toast } from 'sonner';
import { AlertCircle, ChevronRight, CircleDollarSign, LoaderCircle, Mail, Search, UserPlus, Users, X } from 'lucide-react';

const SEARCH_PAGE_SIZE = 20;
const emptyStudent = { student_id: '', student_name: '', phone: '', student_email: '', parent_email: '' };
const studentColumns = 'id,full_name,telephone,email,parent_email,niveau_cefr,session_type,plan_type,status';

export default function ReceiptForm({ onSubmit, onCancel, saving, initialData = {} }) {
  const idempotencyKey = useRef(null);
  if (!idempotencyKey.current) idempotencyKey.current = createStableIdempotencyKey();
  const initialCharge = useRef(null);
  if (!initialCharge.current) initialCharge.current = createInitialChargeCoordinator(initialData.student_id, initialData.charge_id);
  const studentLookupVersion = useRef(0);
  const searchGate = useRef(null);
  if (!searchGate.current) searchGate.current = createLatestRequestGate();
  const [mode, setMode] = useState('existing');
  const [form, setForm] = useState({
    ...emptyStudent, ...emptyChargeTerms(), school_year: DEFAULT_SCHOOL_YEAR,
    payment_date: localBusinessDate(), payment_method: 'Espèces', transaction_reference: '', note: '',
    update_contacts: false, request_email: false, email_recipient: '', ...initialData,
    student_id: '', charge_id: '',
  });
  const [search, setSearch] = useState(initialData.student_name || '');
  const [students, setStudents] = useState([]);
  const [searchState, setSearchState] = useState('idle');
  const [searchError, setSearchError] = useState('');
  const [searchLimit, setSearchLimit] = useState(SEARCH_PAGE_SIZE);
  const [searchTotal, setSearchTotal] = useState(0);
  const [charges, setCharges] = useState([]);
  const [chargesLoading, setChargesLoading] = useState(false);
  const [chargesError, setChargesError] = useState('');
  const [duplicateMatches, setDuplicateMatches] = useState([]);
  const [duplicateWarning, setDuplicateWarning] = useState('');
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    if (!initialData.student_id) return;
    const requestVersion = ++studentLookupVersion.current;
    getBrowserClient().from('students').select(studentColumns).eq('id', initialData.student_id).single().then(({ data, error }) => {
      if (requestVersion !== studentLookupVersion.current) return;
      if (data) selectStudent(data, { fromInitialLink: true });
      else {
        initialCharge.current.clearStudent();
        toast.error(error?.message || 'L’apprenant demandé est introuvable ou inaccessible.');
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialData.student_id]);

  useEffect(() => {
    const term = search.trim();
    const version = searchGate.current.begin();
    if (mode !== 'existing' || form.student_id || term.length < 2) {
      setStudents([]); setSearchTotal(0); setSearchError(''); setSearchState('idle');
      return undefined;
    }
    const timer = setTimeout(async () => {
      setSearchState('loading'); setSearchError('');
      const safe = term.replace(/[,%()]/g, ' ');
      try {
        const { data, error, count } = await getBrowserClient().from('students')
          .select(studentColumns, { count: 'exact' }).is('deleted_at', null)
          .or(`full_name.ilike.%${safe}%,telephone.ilike.%${safe}%,email.ilike.%${safe}%,parent_email.ilike.%${safe}%`)
          .order('full_name').range(0, searchLimit - 1);
        if (!searchGate.current.isCurrent(version)) return;
        if (error) {
          setStudents([]); setSearchTotal(0); setSearchError(error.message || 'Recherche indisponible.'); setSearchState('error');
          return;
        }
        setStudents(data || []); setSearchTotal(count || 0); setSearchState((data || []).length ? 'results' : 'empty');
      } catch (error) {
        if (!searchGate.current.isCurrent(version)) return;
        setStudents([]); setSearchTotal(0); setSearchError(error?.message || 'Recherche indisponible.'); setSearchState('error');
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [search, searchLimit, mode, form.student_id]);

  useEffect(() => {
    if (!form.student_id) { setCharges([]); setChargesError(''); setChargesLoading(false); return undefined; }
    const request = initialCharge.current.startChargeLoad(form.student_id);
    setCharges([]); setChargesError(''); setChargesLoading(true);
    getBrowserClient().from('charge_balances').select('*').eq('student_id', form.student_id)
      .is('voided_at', null).gt('balance', 0).order('created_at', { ascending: false })
      .then(({ data, error }) => {
        const rows = data || [];
        const resolution = initialCharge.current.resolveChargeLoad(request, rows);
        if (resolution.status === 'stale') return;
        setChargesLoading(false);
        if (error) { setChargesError(error.message || 'Impossible de charger les soldes.'); return; }
        setCharges(rows);
        if (resolution.status === 'apply') applyCharge(resolution.charge);
        if (resolution.status === 'missing') toast.error('Le solde demandé est introuvable, réglé ou inaccessible.');
      });
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.student_id]);

  useEffect(() => {
    if (mode !== 'new') return undefined;
    const name = form.student_name.trim();
    if (name.length < 2) { setDuplicateMatches([]); return undefined; }
    const version = searchGate.current.begin();
    const timer = setTimeout(async () => {
      const { data } = await getBrowserClient().from('students').select(studentColumns)
        .is('deleted_at', null).ilike('full_name', `%${name.replace(/[,%()]/g, ' ')}%`).order('full_name').limit(5);
      if (searchGate.current.isCurrent(version)) setDuplicateMatches(data || []);
    }, 350);
    return () => clearTimeout(timer);
  }, [mode, form.student_name]);

  const resetLearner = (nextMode) => {
    studentLookupVersion.current += 1; searchGate.current.invalidate(); initialCharge.current.clearStudent();
    setMode(nextMode); setSearch(''); setStudents([]); setSearchState('idle'); setSearchError(''); setSearchLimit(SEARCH_PAGE_SIZE);
    setCharges([]); setChargesError(''); setDuplicateMatches([]); setDuplicateWarning('');
    setForm((current) => ({
      ...current, ...emptyStudent, ...emptyChargeTerms(), payment_amount: '', transaction_reference: '', note: '',
      update_contacts: false, request_email: false, email_recipient: '',
    }));
  };

  const selectStudent = (student, { fromInitialLink = false } = {}) => {
    if (!fromInitialLink) studentLookupVersion.current += 1;
    searchGate.current.invalidate(); initialCharge.current.selectStudent(student.id, { fromInitialLink });
    setMode('existing'); setStudents([]); setSearch(student.full_name || ''); setSearchState('idle');
    setDuplicateMatches([]); setDuplicateWarning('');
    setForm((current) => ({
      ...current, ...emptyStudent, ...emptyChargeTerms(), student_id: student.id, student_name: student.full_name || '',
      phone: student.telephone || '', student_email: student.email || '', parent_email: student.parent_email || '',
      payment_amount: '', transaction_reference: '', note: '', update_contacts: false,
      request_email: false, email_recipient: student.parent_email || student.email || '',
    }));
  };

  const checkSharedPhone = async (phone) => {
    set('phone', phone); setDuplicateWarning('');
    const normalized = phone.replace(/\D/g, '');
    if (normalized.length < 8) return;
    const { data } = await getBrowserClient().from('students').select('id,full_name,telephone')
      .ilike('telephone', `%${normalized.slice(-8)}%`).limit(5);
    if (data?.length) setDuplicateWarning(`Téléphone partagé avec ${data.map((row) => row.full_name).join(', ')}. Cela reste autorisé, notamment pour une famille.`);
  };

  const selectCharge = (id) => {
    initialCharge.current.userSelectedCharge();
    const charge = charges.find((item) => item.id === id);
    if (!charge) { setForm((current) => ({ ...current, ...emptyChargeTerms() })); return; }
    applyCharge(charge);
  };

  const applyCharge = (charge) => {
    setForm((current) => ({
      ...current, charge_id: charge.id, session_type: charge.session_type, school_year: charge.school_year || '',
      service_detail: '', service_description: charge.service_description, plan_type: charge.plan_type || 'Standard',
      level: charge.level || '', gross_amount: charge.gross_amount, discount_amount: charge.discount_amount,
      due_date: charge.due_date || '', payment_amount: '',
    }));
  };

  const selectedCharge = charges.find((item) => item.id === form.charge_id);
  const gross = Number(form.gross_amount || 0);
  const discount = Number(form.discount_amount || 0);
  const net = selectedCharge ? Number(selectedCharge.net_amount) : Math.max(0, gross - discount);
  const paidBefore = selectedCharge ? Number(selectedCharge.paid_amount) : 0;
  const todayPayment = Number(form.payment_amount || 0);
  const balanceAfter = Math.max(0, net - paidBefore - todayPayment);
  const levels = useMemo(() => getLevelsForSession(form.session_type, form.level), [form.session_type, form.level]);
  const lockedCharge = Boolean(selectedCharge);
  const servicePreview = buildServiceDescription({ sessionType: form.session_type, planType: form.plan_type, schoolYear: form.school_year, serviceDetail: form.service_detail });

  const submit = (event) => {
    event.preventDefault();
    if (!form.student_id && mode !== 'new') return toast.error('Sélectionnez un apprenant existant.');
    if (mode === 'new' && form.student_name.trim().length < 2) return toast.error('Le nom complet du nouvel apprenant est obligatoire.');
    if (!form.charge_id && (!form.session_type || !form.school_year)) return toast.error('La session et l’année scolaire sont obligatoires.');
    if (!form.charge_id && form.session_type === 'Other' && form.service_detail.trim().length < 3) return toast.error('Décrivez brièvement le service « Autre ».');
    if (!form.charge_id && (!Number.isFinite(gross) || gross < 0 || discount < 0 || discount > gross)) return toast.error('Vérifiez le prix convenu et la remise.');
    if (!Number.isFinite(todayPayment) || todayPayment < 0) return toast.error('Le paiement ne peut pas être négatif.');
    if (todayPayment > net - paidBefore) return toast.error(`Le paiement dépasse le solde de ${money(net - paidBefore)} MAD.`);
    if (todayPayment > 0 && form.request_email && !/^\S+@\S+\.\S+$/.test(form.email_recipient.trim())) return toast.error('Indiquez un destinataire email valide ou désactivez l’envoi.');
    onSubmit({ ...form, service_description: servicePreview, idempotency_key: idempotencyKey.current() });
  };

  const input = 'w-full rounded-xl border border-border bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10 disabled:bg-muted disabled:text-muted-foreground';

  return <form onSubmit={submit} className="space-y-5">
    <Step number="1" title="Apprenant" subtitle="Recherchez un dossier ou créez un prospect minimal">
      <div className="mb-5 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1.5" role="tablist" aria-label="Mode de sélection de l’apprenant">
        <ModeButton active={mode === 'existing'} onClick={() => resetLearner('existing')} icon={Users}>Rechercher un apprenant</ModeButton>
        <ModeButton active={mode === 'new'} onClick={() => resetLearner('new')} icon={UserPlus}>Nouvel apprenant</ModeButton>
      </div>
      {mode === 'existing' && !form.student_id && <div>
        <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">Nom, téléphone, email apprenant ou parent</label>
        <div className="relative"><Search className="absolute left-3.5 top-3 text-muted-foreground" size={17} /><input className={`${input} pl-10`} value={search} onChange={(e) => { setSearch(e.target.value); setSearchLimit(SEARCH_PAGE_SIZE); }} placeholder="Saisir au moins 2 caractères…" autoComplete="off" /></div>
        <p className="mt-1.5 text-xs text-muted-foreground">La recherche interroge tous les dossiers actifs à partir de deux caractères.</p>
        {searchState === 'loading' && <SearchMessage icon={LoaderCircle} spin>Recherche dans les dossiers…</SearchMessage>}
        {searchState === 'error' && <SearchMessage icon={AlertCircle} tone="error">Échec de la recherche : {searchError}</SearchMessage>}
        {searchState === 'empty' && <SearchMessage icon={Search}>Aucun apprenant trouvé pour « {search.trim()} ».</SearchMessage>}
        {searchState === 'results' && <div className="mt-3 overflow-hidden rounded-2xl border bg-white shadow-sm"><p className="border-b bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-500">{students.length} résultat(s) affiché(s) sur {searchTotal}</p><div className="max-h-80 divide-y overflow-auto">{students.map((student) => <StudentResult key={student.id} student={student} onSelect={() => selectStudent(student)} />)}</div>{students.length < searchTotal && <button type="button" onClick={() => setSearchLimit((value) => value + SEARCH_PAGE_SIZE)} className="w-full border-t px-4 py-2.5 text-sm font-bold text-primary hover:bg-primary/5">Afficher {Math.min(SEARCH_PAGE_SIZE, searchTotal - students.length)} résultat(s) de plus</button>}</div>}
      </div>}
      {mode === 'new' && <div className="space-y-4">
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"><b>Avant de créer :</b> vérifiez les dossiers similaires ci-dessous. Un homonyme légitime peut toujours être créé.</div>
        <Field label="Nom complet *"><input required className={input} value={form.student_name} onChange={(e) => set('student_name', e.target.value)} placeholder="Nom et prénom du nouvel apprenant" /></Field>
        {duplicateMatches.length > 0 && <div className="overflow-hidden rounded-xl border border-amber-200"><p className="bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">Dossiers ressemblants — sélectionnez-en un s’il s’agit de la même personne</p>{duplicateMatches.map((student) => <StudentResult key={student.id} student={student} onSelect={() => selectStudent(student)} />)}</div>}
        <div className="grid gap-3 sm:grid-cols-3"><Field label="Téléphone (facultatif)"><input className={input} value={form.phone} onChange={(e) => checkSharedPhone(e.target.value)} /></Field><Field label="Email apprenant (facultatif)"><input type="email" className={input} value={form.student_email} onChange={(e) => set('student_email', e.target.value)} /></Field><Field label="Email parent (facultatif)"><input type="email" className={input} value={form.parent_email} onChange={(e) => set('parent_email', e.target.value)} /></Field></div>
        {duplicateWarning && <p className="text-xs font-medium text-amber-700">{duplicateWarning}</p>}
      </div>}
      {mode === 'existing' && form.student_id && <div className="rounded-2xl border-2 border-primary/20 bg-primary/[0.04] p-4">
        <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-primary">Apprenant sélectionné</p><p className="mt-1 text-xl font-black">{form.student_name}</p><p className="mt-1 text-sm text-muted-foreground">{[form.phone, form.student_email, form.parent_email].filter(Boolean).join(' · ') || 'Contacts non renseignés'}</p></div><button type="button" onClick={() => resetLearner('existing')} className="rounded-full p-2 hover:bg-white" aria-label="Changer d’apprenant"><X size={17} /></button></div>
        {!chargesLoading && !chargesError && <p className={`mt-3 rounded-xl px-3 py-2 text-sm font-bold ${charges.length ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900'}`}>{charges.length ? `${charges.length} engagement(s) avec un solde restant` : 'Aucun solde restant'}</p>}
        <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={form.update_contacts} onChange={(e) => set('update_contacts', e.target.checked)} /> Mettre à jour explicitement les contacts du dossier</label>
        {form.update_contacts && <div className="mt-3 grid gap-3 sm:grid-cols-3"><Field label="Téléphone"><input className={input} value={form.phone} onChange={(e) => checkSharedPhone(e.target.value)} /></Field><Field label="Email apprenant"><input type="email" className={input} value={form.student_email} onChange={(e) => set('student_email', e.target.value)} /></Field><Field label="Email parent"><input type="email" className={input} value={form.parent_email} onChange={(e) => set('parent_email', e.target.value)} /></Field></div>}
      </div>}
    </Step>

    <Step number="2" title="Solde existant ou nouvelle session" subtitle="Les conditions enregistrées d’un engagement existant restent inchangées">
      {chargesLoading && <SearchMessage icon={LoaderCircle} spin>Chargement des soldes…</SearchMessage>}
      {chargesError && <SearchMessage icon={AlertCircle} tone="error">Impossible de charger les soldes : {chargesError}</SearchMessage>}
      {form.student_id && charges.length > 0 && <div className="space-y-3"><Field label="Choisir un engagement"><select className={input} value={form.charge_id} onChange={(e) => selectCharge(e.target.value)}><option value="">Créer une nouvelle session</option>{charges.map((charge) => <option key={charge.id} value={charge.id}>{charge.session_type}{charge.school_year ? ` · ${charge.school_year}` : ''} · reste {money(charge.balance)} MAD</option>)}</select></Field>{selectedCharge && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><p className="font-black text-amber-950">{selectedCharge.service_description}</p><p className="mt-1 text-sm text-amber-900">{selectedCharge.session_type}{selectedCharge.school_year ? ` · année ${selectedCharge.school_year}` : ''}{selectedCharge.session_type === 'Yearly' && selectedCharge.plan_type ? ` · ${selectedCharge.plan_type}` : ''}</p><div className="mt-3 grid grid-cols-3 gap-2"><MiniAmount label="Prix net" value={selectedCharge.net_amount} /><MiniAmount label="Déjà payé" value={selectedCharge.paid_amount} /><MiniAmount label="Solde" value={selectedCharge.balance} /></div>{selectedCharge.due_date && <p className="mt-2 text-xs text-amber-800">Échéance : {selectedCharge.due_date}</p>}</div>}</div>}
      {!lockedCharge && <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Session *"><select required className={input} value={form.session_type} onChange={(e) => setForm((c) => ({ ...c, session_type: e.target.value, plan_type: 'Standard', level: '', service_detail: '' }))}><option value="">Choisir…</option>{SESSION_TYPES.map((session) => <option key={session}>{session}</option>)}</select></Field>
        <Field label="Année scolaire *"><select required className={input} value={form.school_year} onChange={(e) => set('school_year', e.target.value)}>{[...new Set([form.school_year, ...SCHOOL_YEAR_OPTIONS].filter(Boolean))].map((year) => <option key={year}>{year}</option>)}</select></Field>
        {form.session_type === 'Yearly' && <Field label="Formule *"><div className="flex gap-2">{['Standard','Premium'].map((plan) => <button type="button" key={plan} onClick={() => set('plan_type', plan)} className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-bold ${form.plan_type === plan ? 'border-primary bg-primary text-white' : 'bg-white'}`}>{plan}</button>)}</div><p className="mt-1 text-[11px] text-muted-foreground">Premium est disponible uniquement pour Yearly.</p></Field>}
        {form.session_type === 'Other' && <Field label="Description du service *"><input required minLength={3} maxLength={120} className={input} value={form.service_detail} onChange={(e) => set('service_detail', e.target.value)} placeholder="Description courte et précise" /></Field>}
        <Field label="Niveau (facultatif)"><select className={input} value={form.level} onChange={(e) => set('level', e.target.value)}><option value="">Non renseigné</option>{levels.map((value) => <option key={value}>{value}</option>)}</select></Field>
        {servicePreview && <div className="sm:col-span-2 rounded-xl border border-dashed bg-slate-50 px-4 py-3"><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Libellé généré</p><p className="mt-1 text-sm font-bold text-slate-800">{servicePreview}</p></div>}
      </div>}
    </Step>

    <Step number="3" title="Paiement" subtitle="Montant, date et mode d’encaissement">
      <div className="grid gap-4 sm:grid-cols-3">
        {!lockedCharge && <><Field label="Prix brut convenu *"><input required type="number" min="0" step="0.01" className={input} value={form.gross_amount} onChange={(e) => set('gross_amount', e.target.value)} placeholder="Aucun prix implicite" /></Field><Field label="Remise (MAD)"><input type="number" min="0" step="0.01" className={input} value={form.discount_amount} onChange={(e) => set('discount_amount', e.target.value)} placeholder="0" /></Field><Field label="Échéance (facultative)"><input type="date" className={input} value={form.due_date} onChange={(e) => set('due_date', e.target.value)} /></Field></>}
        <Field label="Montant payé aujourd’hui *"><input required type="number" min="0" step="0.01" className={input} value={form.payment_amount} onChange={(e) => set('payment_amount', e.target.value)} /></Field><Field label="Date du paiement *"><input required type="date" className={input} value={form.payment_date} onChange={(e) => set('payment_date', e.target.value)} /></Field><Field label="Mode de paiement *"><select required className={input} value={form.payment_method} onChange={(e) => set('payment_method', e.target.value)}>{PAYMENT_METHODS.map((method) => <option key={method}>{method}</option>)}</select><p className="mt-1 text-[11px] font-medium text-muted-foreground">Espèces est sélectionné par défaut.</p></Field><Field label="Référence (facultative)"><input maxLength={120} className={input} value={form.transaction_reference} onChange={(e) => set('transaction_reference', e.target.value)} /></Field><div className="sm:col-span-2"><Field label="Note interne (non imprimée)"><textarea maxLength={500} rows={2} className={input} value={form.note} onChange={(e) => set('note', e.target.value)} /></Field></div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border bg-border sm:grid-cols-4"><Amount label="Prix net" value={net} /><Amount label="Déjà payé" value={paidBefore} /><Amount label="Payé aujourd’hui" value={todayPayment} accent /><Amount label="Solde restant" value={balanceAfter} warning={balanceAfter > 0} /></div>
      {todayPayment === 0 ? <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">Vous enregistrez uniquement l’engagement. Aucun reçu ne sera émis et aucun email ne sera envoyé.</p> : <div className="mt-4 rounded-2xl border bg-slate-50 p-4"><label className="flex cursor-pointer items-start gap-3"><input type="checkbox" className="mt-1" checked={form.request_email} onChange={(e) => setForm((current) => ({ ...current, request_email: e.target.checked, email_recipient: e.target.checked && !current.email_recipient ? (current.parent_email || current.student_email || '') : current.email_recipient }))} /><span><span className="flex items-center gap-2 text-sm font-bold"><Mail size={15} /> Envoyer aussi le reçu par email</span><span className="mt-0.5 block text-xs text-muted-foreground">Facultatif. L’absence d’email ne bloque jamais le paiement ni l’impression.</span></span></label>{form.request_email && <div className="mt-3 max-w-md"><Field label="Destinataire email *"><input required type="email" className={input} value={form.email_recipient} onChange={(e) => set('email_recipient', e.target.value)} placeholder="famille@exemple.com" /></Field></div>}</div>}
    </Step>

    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" onClick={onCancel} className="rounded-xl border px-5 py-2.5 text-sm font-semibold">Annuler</button><button disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-primary/20 disabled:opacity-60"><CircleDollarSign size={17} />{saving ? 'Enregistrement…' : todayPayment > 0 ? 'Enregistrer et générer le reçu' : 'Enregistrer l’engagement'}</button></div>
  </form>;
}

function ModeButton({ active, onClick, icon: Icon, children }) { return <button type="button" role="tab" aria-selected={active} onClick={onClick} className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold transition ${active ? 'bg-white text-primary shadow-sm ring-1 ring-black/5' : 'text-slate-500 hover:text-slate-800'}`}><Icon size={16} /> {children}</button>; }
function SearchMessage({ icon: Icon, spin, tone, children }) { return <div className={`mt-3 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${tone === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'bg-slate-50 text-slate-600'}`}><Icon size={16} className={spin ? 'animate-spin' : ''} />{children}</div>; }
function StudentResult({ student, onSelect }) { return <button type="button" onClick={onSelect} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-primary/[0.04]"><span className="min-w-0"><b className="block truncate text-sm">{student.full_name}</b><span className="block truncate text-xs text-muted-foreground">{[student.telephone, student.email, student.parent_email].filter(Boolean).join(' · ') || 'Aucun contact'} · {student.status || 'Prospect'}</span></span><ChevronRight size={15} className="shrink-0 text-primary" /></button>; }
function Step({ number, title, subtitle, children }) { return <section className="overflow-visible rounded-2xl border bg-card shadow-sm"><div className="flex items-center gap-3 border-b px-5 py-4"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-black text-white">{number}</span><div><h2 className="font-black">{title}</h2><p className="text-xs text-muted-foreground">{subtitle}</p></div></div><div className="p-5">{children}</div></section>; }
function Field({ label, children }) { return <label className="block text-xs font-bold text-slate-600"><span className="mb-1.5 block">{label}</span>{children}</label>; }
function Amount({ label, value, accent, warning }) { return <div className={`${accent ? 'bg-primary text-white' : warning ? 'bg-rose-50 text-rose-800' : 'bg-white'} p-3 text-center`}><p className="text-[10px] font-bold uppercase tracking-wide opacity-70">{label}</p><p className="mt-1 text-base font-black">{money(value)} MAD</p></div>; }
function MiniAmount({ label, value }) { return <div className="rounded-lg bg-white/80 p-2"><p className="text-[10px] uppercase tracking-wide text-amber-700">{label}</p><p className="font-black text-amber-950">{money(value)} MAD</p></div>; }
