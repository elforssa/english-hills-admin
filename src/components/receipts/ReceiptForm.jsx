'use client';

import { useEffect, useMemo, useState } from 'react';
import { getBrowserClient } from '@/lib/supabase';
import { SESSION_TYPES, getLevelsForSession } from '@/lib/academicPrograms';
import { PAYMENT_METHODS, localBusinessDate, money } from '@/lib/receiptFinance';
import { toast } from 'sonner';
import { ChevronRight, CircleDollarSign, Search, UserPlus, X } from 'lucide-react';

const emptyStudent = { student_id: '', student_name: '', phone: '', student_email: '', parent_email: '' };

export default function ReceiptForm({ onSubmit, onCancel, saving, initialData = {} }) {
  const [form, setForm] = useState({
    ...emptyStudent,
    charge_id: '', session_type: '', service_description: '', plan_type: 'Standard', level: '',
    gross_amount: '', discount_amount: '', due_date: '', payment_amount: '',
    payment_date: localBusinessDate(), payment_method: 'Espèces', transaction_reference: '', note: '',
    update_contacts: false, ...initialData,
  });
  const [search, setSearch] = useState(initialData.student_name || '');
  const [students, setStudents] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [charges, setCharges] = useState([]);
  const [duplicateWarning, setDuplicateWarning] = useState('');
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    if (!initialData.student_id) return;
    getBrowserClient().from('students')
      .select('id,full_name,telephone,email,parent_email,niveau_cefr,session_type,plan_type,status')
      .eq('id', initialData.student_id).single().then(({ data }) => data && selectStudent(data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialData.student_id]);

  useEffect(() => {
    const term = search.trim();
    if (term.length < 2 || form.student_id) { setStudents([]); return undefined; }
    const timer = setTimeout(async () => {
      setSearching(true);
      const safe = term.replace(/[,%()]/g, ' ');
      const { data, error } = await getBrowserClient().from('students')
        .select('id,full_name,telephone,email,parent_email,niveau_cefr,session_type,plan_type,status')
        .is('deleted_at', null)
        .or(`full_name.ilike.%${safe}%,telephone.ilike.%${safe}%,email.ilike.%${safe}%,parent_email.ilike.%${safe}%`)
        .order('full_name').range(0, 19);
      if (!error) setStudents(data || []);
      setSearching(false);
    }, 250);
    return () => clearTimeout(timer);
  }, [search, form.student_id]);

  useEffect(() => {
    if (!form.student_id) { setCharges([]); return; }
    getBrowserClient().from('charge_balances').select('*').eq('student_id', form.student_id)
      .is('voided_at', null).gt('balance', 0).order('created_at', { ascending: false })
      .then(({ data }) => setCharges(data || []));
  }, [form.student_id]);

  useEffect(() => {
    if (!initialData.charge_id || !charges.length || form.charge_id === initialData.charge_id) return;
    const charge = charges.find((item) => item.id === initialData.charge_id);
    if (charge) setForm((current) => ({ ...current, charge_id: charge.id, session_type: charge.session_type,
      service_description: charge.service_description, plan_type: charge.plan_type || 'Standard',
      level: charge.level || '', gross_amount: charge.gross_amount, discount_amount: charge.discount_amount,
      due_date: charge.due_date || '', payment_amount: '' }));
  }, [charges, form.charge_id, initialData.charge_id]);

  const selectStudent = (student) => {
    setShowCreate(false); setStudents([]); setSearch(student.full_name || ''); setDuplicateWarning('');
    setForm((current) => ({
      ...current, ...emptyStudent,
      student_id: student.id, student_name: student.full_name || '', phone: student.telephone || '',
      student_email: student.email || '', parent_email: student.parent_email || '',
      session_type: student.session_type || '', level: student.niveau_cefr || '',
      plan_type: student.session_type === 'Yearly' ? (student.plan_type || 'Standard') : 'Standard',
      charge_id: '', service_description: '', gross_amount: '', discount_amount: '', due_date: '',
      update_contacts: false,
    }));
  };

  const clearStudent = () => {
    setSearch(''); setShowCreate(false); setStudents([]); setCharges([]); setDuplicateWarning('');
    setForm((current) => ({ ...current, ...emptyStudent, charge_id: '', service_description: '',
      gross_amount: '', discount_amount: '', due_date: '', update_contacts: false }));
  };

  const beginCreate = async () => {
    const name = search.trim();
    if (name.length < 2) return toast.error('Saisissez au moins deux caractères pour le nom.');
    const { data } = await getBrowserClient().from('students')
      .select('id,full_name,telephone,email,parent_email,niveau_cefr,session_type,plan_type,status')
      .ilike('full_name', name).is('deleted_at', null).limit(5);
    if (data?.length) { setStudents(data); return toast.error('Un dossier porte déjà ce nom. Sélectionnez-le ou vérifiez l’identité.'); }
    setForm((current) => ({ ...current, ...emptyStudent, student_name: name }));
    setShowCreate(true); setStudents([]);
  };

  const checkSharedPhone = async (phone) => {
    set('phone', phone); setDuplicateWarning('');
    const normalized = phone.replace(/\D/g, '');
    if (normalized.length < 8) return;
    const { data } = await getBrowserClient().from('students').select('id,full_name,telephone')
      .ilike('telephone', `%${normalized.slice(-8)}%`).limit(5);
    if (data?.length) setDuplicateWarning(`Téléphone déjà utilisé par ${data.map((row) => row.full_name).join(', ')}. Les fratries restent autorisées.`);
  };

  const selectCharge = (id) => {
    const charge = charges.find((item) => item.id === id);
    if (!charge) { set('charge_id', ''); return; }
    setForm((current) => ({ ...current, charge_id: id, session_type: charge.session_type,
      service_description: charge.service_description, plan_type: charge.plan_type || 'Standard',
      level: charge.level || '', gross_amount: charge.gross_amount, discount_amount: charge.discount_amount,
      due_date: charge.due_date || '', payment_amount: '' }));
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

  const submit = (event) => {
    event.preventDefault();
    if (!form.student_id && !showCreate) return toast.error('Sélectionnez ou créez un apprenant.');
    if (!form.charge_id && (!form.session_type || !form.service_description.trim())) return toast.error('La session et le service/période sont obligatoires.');
    if (form.session_type === 'Other' && form.service_description.trim().length < 3) return toast.error('Décrivez brièvement le service « Other ».');
    if (!form.charge_id && (!Number.isFinite(gross) || gross < 0 || discount < 0 || discount > gross)) return toast.error('Vérifiez le prix convenu et la remise.');
    if (!Number.isFinite(todayPayment) || todayPayment < 0) return toast.error('Le paiement ne peut pas être négatif.');
    if (todayPayment > net - paidBefore) return toast.error(`Le paiement dépasse le solde de ${money(net - paidBefore)} MAD.`);
    onSubmit({ ...form, idempotency_key: crypto.randomUUID() });
  };

  const input = 'w-full rounded-xl border border-border bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10 disabled:bg-muted disabled:text-muted-foreground';

  return <form onSubmit={submit} className="space-y-5">
    <Step number="1" title="Apprenant" subtitle="Un dossier existant ou une création minimale">
      {!form.student_id && !showCreate ? <div className="relative">
        <Search className="absolute left-3.5 top-3 text-muted-foreground" size={17} />
        <input className={`${input} pl-10`} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nom, téléphone ou email…" autoComplete="off" />
        {(searching || students.length > 0) && <div className="absolute z-20 mt-2 max-h-72 w-full overflow-auto rounded-xl border bg-white p-1 shadow-xl">
          {searching ? <p className="p-3 text-sm text-muted-foreground">Recherche…</p> : students.map((student) =>
            <button type="button" key={student.id} onClick={() => selectStudent(student)} className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left hover:bg-muted">
              <span><b className="block text-sm">{student.full_name}</b><span className="text-xs text-muted-foreground">{student.telephone || student.email || 'Aucun contact'} · {student.status || 'Prospect'}</span></span><ChevronRight size={15} />
            </button>)}
        </div>}
        <button type="button" onClick={beginCreate} className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-primary"><UserPlus size={15} /> Créer « {search || 'nouvel apprenant'} »</button>
      </div> : <div className="rounded-2xl border border-primary/20 bg-primary/[0.04] p-4">
        <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-primary">{showCreate ? 'Nouveau prospect' : 'Dossier sélectionné'}</p><p className="mt-1 text-lg font-bold">{form.student_name}</p><p className="text-sm text-muted-foreground">{form.phone || form.student_email || form.parent_email || 'Contacts non renseignés'}</p></div><button type="button" onClick={clearStudent} className="rounded-full p-2 hover:bg-white" aria-label="Changer d’apprenant"><X size={17} /></button></div>
        {(showCreate || form.update_contacts) && <div className="mt-4 grid gap-3 sm:grid-cols-3"><Field label="Téléphone (facultatif)"><input className={input} value={form.phone} onChange={(e) => checkSharedPhone(e.target.value)} /></Field><Field label="Email apprenant"><input type="email" className={input} value={form.student_email} onChange={(e) => set('student_email', e.target.value)} /></Field><Field label="Email parent"><input type="email" className={input} value={form.parent_email} onChange={(e) => set('parent_email', e.target.value)} /></Field></div>}
        {duplicateWarning && <p className="mt-2 text-xs font-medium text-amber-700">{duplicateWarning}</p>}
        {!showCreate && <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={form.update_contacts} onChange={(e) => set('update_contacts', e.target.checked)} /> Mettre à jour explicitement les contacts du dossier</label>}
      </div>}
    </Step>

    <Step number="2" title="Session ou service" subtitle="Choisissez un solde existant ou créez un nouvel engagement">
      {charges.length > 0 && <Field label="Solde existant"><select className={input} value={form.charge_id} onChange={(e) => selectCharge(e.target.value)}><option value="">Nouveau service / nouvelle période</option>{charges.map((charge) => <option key={charge.id} value={charge.id}>{charge.session_type} · {charge.service_description} · reste {money(charge.balance)} MAD</option>)}</select>{selectedCharge && <p className="mt-2 text-xs text-muted-foreground">Prix net {money(selectedCharge.net_amount)} MAD · déjà payé {money(selectedCharge.paid_amount)} MAD · solde {money(selectedCharge.balance)} MAD{selectedCharge.due_date ? ` · échéance ${selectedCharge.due_date}` : ''}</p>}</Field>}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Session"><select disabled={lockedCharge} required className={input} value={form.session_type} onChange={(e) => setForm((c) => ({ ...c, session_type: e.target.value, plan_type: 'Standard', level: '' }))}><option value="">Choisir…</option>{SESSION_TYPES.map((session) => <option key={session}>{session}</option>)}</select></Field>
        <Field label="Service / période couverte"><input disabled={lockedCharge} required className={input} value={form.service_description} onChange={(e) => set('service_description', e.target.value)} placeholder={form.session_type === 'Other' ? 'Description courte obligatoire' : 'Ex. année 2026–2027, module 1…'} /></Field>
        {form.session_type === 'Yearly' && <Field label="Formule"><div className="flex gap-2">{['Standard','Premium'].map((plan) => <button disabled={lockedCharge} type="button" key={plan} onClick={() => set('plan_type', plan)} className={`flex-1 rounded-xl border px-3 py-2.5 text-sm font-bold ${form.plan_type === plan ? 'border-primary bg-primary text-white' : 'bg-white'}`}>{plan}</button>)}</div><p className="mt-1 text-[11px] text-muted-foreground">Premium inclut un atelier collectif partagé d’une heure le week-end. L’activation reste une action académique séparée.</p></Field>}
        <Field label="Niveau (facultatif)"><select disabled={lockedCharge} className={input} value={form.level} onChange={(e) => set('level', e.target.value)}><option value="">À déterminer</option>{levels.map((value) => <option key={value}>{value}</option>)}</select></Field>
      </div>
    </Step>

    <Step number="3" title="Paiement" subtitle="Les montants déterminent automatiquement le statut">
      <div className="grid gap-4 sm:grid-cols-3">
        {!lockedCharge && <><Field label="Prix brut convenu"><input required type="number" min="0" step="0.01" className={input} value={form.gross_amount} onChange={(e) => set('gross_amount', e.target.value)} placeholder="Aucun prix implicite" /></Field><Field label="Remise (MAD)"><input type="number" min="0" step="0.01" className={input} value={form.discount_amount} onChange={(e) => set('discount_amount', e.target.value)} /></Field><Field label="Échéance (facultative)"><input type="date" className={input} value={form.due_date} onChange={(e) => set('due_date', e.target.value)} /></Field></>}
        <Field label="Reçu aujourd’hui"><input required type="number" min="0" step="0.01" className={input} value={form.payment_amount} onChange={(e) => set('payment_amount', e.target.value)} /></Field><Field label="Date du paiement"><input required type="date" className={input} value={form.payment_date} onChange={(e) => set('payment_date', e.target.value)} /></Field><Field label="Mode"><select className={input} value={form.payment_method} onChange={(e) => set('payment_method', e.target.value)}>{PAYMENT_METHODS.map((method) => <option key={method}>{method}</option>)}</select></Field><Field label="Référence (facultative)"><input className={input} value={form.transaction_reference} onChange={(e) => set('transaction_reference', e.target.value)} /></Field><div className="sm:col-span-2"><Field label="Note (facultative)"><input className={input} value={form.note} onChange={(e) => set('note', e.target.value)} /></Field></div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border bg-border sm:grid-cols-4"><Amount label="Prix net" value={net} /><Amount label="Déjà payé" value={paidBefore} /><Amount label="Aujourd’hui" value={todayPayment} accent /><Amount label="Solde après" value={balanceAfter} warning={balanceAfter > 0} /></div>
      {todayPayment === 0 && <p className="mt-3 text-xs font-medium text-amber-700">L’engagement sera enregistré comme dû. Aucun reçu ne sera émis puisqu’aucun argent n’est encaissé.</p>}
    </Step>

    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button type="button" onClick={onCancel} className="rounded-xl border px-5 py-2.5 text-sm font-semibold">Annuler</button><button disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-primary/20 disabled:opacity-60"><CircleDollarSign size={17} />{saving ? 'Enregistrement…' : todayPayment > 0 ? 'Enregistrer et imprimer' : 'Enregistrer le solde'}</button></div>
  </form>;
}

function Step({ number, title, subtitle, children }) { return <section className="overflow-visible rounded-2xl border bg-card shadow-sm"><header className="flex gap-3 border-b bg-muted/40 px-5 py-4"><span className="grid h-8 w-8 place-items-center rounded-full bg-primary text-sm font-black text-white">{number}</span><div><h2 className="font-bold">{title}</h2><p className="text-xs text-muted-foreground">{subtitle}</p></div></header><div className="p-5">{children}</div></section>; }
function Field({ label, children }) { return <label><span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</span>{children}</label>; }
function Amount({ label, value, accent, warning }) { return <div className={`bg-white p-4 ${accent ? 'text-emerald-700' : warning ? 'text-rose-700' : ''}`}><p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-1 text-lg font-black">{money(value)} <span className="text-xs">MAD</span></p></div>; }
