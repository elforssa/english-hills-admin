'use client';
import { Children, cloneElement, useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { getBrowserClient } from '@/lib/supabase';
import { SESSION_TYPES, getLevelsForSession, groupMatchesEnrollment } from '@/lib/academicPrograms';
import { schoolYearOfGroup } from '@/lib/enrollmentWorkflow.mjs';
import { crmRpc, useCrmRead, useCrmRefresh } from '@/lib/crm/queries';
import { CLOSED_ENROLLMENT_STATUSES, ENROLLMENT_STATUS, PAID_ENROLLMENT_STATUSES, PROGRAMS, enrollmentSchoolYear } from '@/lib/crm/enrollment.mjs';
import { ENROLLMENT_REASONS, enrollmentFailure } from '@/lib/crm/enrollmentErrors.mjs';
import { isRecordConflict } from '@/lib/conflictErrors.mjs';
import { birthDateReason, casablancaToday, enrollmentSuccess } from '@/lib/crm/enrollmentActions.mjs';
import { PAYMENT_METHODS, localBusinessDate, money } from '@/lib/receiptFinance';
import { DISCOUNT_REASONS, DISCOUNT_REASON_MAX_LENGTH, FREE_ENROLLMENT_MESSAGE, addDays, deskGuardError, isFreeEnrollment, paymentBackdateDays } from '@/lib/financeCorrections.mjs';
import { invalidateAfterLearnerSave } from '@/lib/cacheInvalidation.mjs';
import { membershipErrorMessage, placeLearnerInGroup } from '@/lib/academic/membershipActions.mjs';
import { Pager, ReadState } from './CrmShared';
import DialogStickyFooter, { FOOTER_ALERT, STICKY_DIALOG } from './DialogStickyFooter';
const input = 'min-h-11 w-full rounded-md border bg-white px-3 py-2 text-sm';
// « Autre » is collected without an enrollment (eap.program_not_enrollable).
const ENROLLABLE = SESSION_TYPES.filter(s => s !== 'Other');
const PAYMENT_REQUIRED = 'L’inscription se confirme à l’encaissement : saisissez un paiement.';
// A field reason marks its control invalid and describes it with the inline message.
function Field({ label, name, failure, children }) { const id = useId(); const [control, ...help] = Children.toArray(children); const invalid = !!name && failure?.field === name; return <div className="space-y-1 text-sm"><label htmlFor={id} className="block font-medium">{label}</label>{cloneElement(control, { id, ...(name ? { 'data-field': name } : {}), 'aria-invalid': invalid || undefined, 'aria-describedby': invalid ? `${id}-error` : undefined })}{help}{invalid && <p id={`${id}-error`} className="text-sm text-red-800">{failure.message}</p>}</div>; }
function Amount({ label, value, accent }) { return <div className={`p-2 text-center ${accent ? 'bg-blue-50' : 'bg-white'}`}><p className="text-xs text-slate-500">{label}</p><p className="font-semibold">{money(value)} MAD</p></div>; }
const reasonFailure = reason => ({ definite: false, reason, ...ENROLLMENT_REASONS[reason] });
const localFailure = (message, field, step = 3) => ({ definite: false, reason: null, message, step, field, submit: true, recovery: 'correct' });
const amount = value => Number(value || 0);
// The payment step's own checks, in the receipt form's order; the server decides.
function paymentIssue(form, { role, today }) {
  const gross = amount(form.gross), discount = amount(form.discount), paid = amount(form.amount);
  if (form.gross === '' || !Number.isFinite(gross) || gross < 0) return localFailure('Indiquez le prix brut convenu.', 'gross');
  if (!Number.isFinite(discount) || discount < 0 || discount > gross) return localFailure('Vérifiez le prix convenu et la remise.', 'discount');
  if (!Number.isFinite(paid) || paid < 0) return localFailure('Le paiement ne peut pas être négatif.', 'amount');
  const guard = deskGuardError({ role, newCharge: true, gross, discount, reasonCode: form.reasonCode, reasonText: form.reasonText, payment: paid, paymentDate: form.paymentDate, today });
  if (guard) return localFailure(guard, /date du paiement/.test(guard) ? 'paymentDate' : /Précisez|ne doit pas/.test(guard) ? 'reasonText' : 'reasonCode');
  if (paid > gross - discount) return localFailure(`Le paiement dépasse le prix net de ${money(gross - discount)} MAD.`, 'amount');
  if (!(paid > 0) && !isFreeEnrollment({ newCharge: true, sessionType: form.session, gross, discount, reasonCode: form.reasonCode, payment: paid })) return localFailure(PAYMENT_REQUIRED, 'amount');
  if (paid > 0 && form.requestEmail && !/^\S+@\S+\.\S+$/.test(form.emailRecipient.trim())) return localFailure('Indiquez un destinataire e-mail valide ou désactivez l’envoi.', 'emailRecipient');
  return null;
}
function EnrollmentForm({ lead, context, refetchContext, onClose, setBusy }) {
  const { role } = useAuth();
  const session = context.session_type && ENROLLABLE.includes(context.session_type) ? context.session_type : 'Yearly';
  const today = localBusinessDate();
  // linked_student is authoritative: that learner only, no candidates, no new learner.
  const liveLinked = context.linked_student || null;
  const live = { linked: liveLinked, linkedActive: liveLinked?.available === true };
  // While an outcome is uncertain the submitted request is frozen: a refetched context
  // (which may already reflect its commit) never changes what is shown or resent.
  const [frozen, setFrozen] = useState(null);
  const { linked, linkedActive } = frozen?.view || live;
  const [form, setForm] = useState(() => ({ name: context.learner_name || '', birth: context.birth_date || '', choice: linkedActive ? 'existing' : '', student: linkedActive ? { id: linked.id, name: linked.name, birth_date: linked.birth_date } : null,
    session, year: enrollmentSchoolYear(), level: getLevelsForSession(session).includes(context.recommended_level) ? context.recommended_level : '',
    group: '', enrollment: null, mode: 'pay', confirmNew: false,
    gross: '', discount: '', reasonCode: '', reasonText: '', dueDate: '', amount: '', paymentDate: today, method: 'Espèces', reference: '', note: '',
    requestEmail: false, emailRecipient: context.email || '' }));
  const [step, setStep] = useState(1), [offset, setOffset] = useState(0), [enrollmentOffset, setEnrollmentOffset] = useState(0), [groupOffset, setGroupOffset] = useState(0);
  const [failure, setFailure] = useState(null), [blocked, setBlocked] = useState(null), [saving, setSaving] = useState(false), [result, setResult] = useState(null), [version, setVersion] = useState(lead.version);
  // One request key per dialog opening: every resend of this enrollment replays it, and
  // the server derives the payment's idempotency key from it (S4).
  const requestKey = useRef(null);
  if (!requestKey.current) requestKey.current = crypto.randomUUID();
  const pending = useRef(null), locked = useRef(false), formRef = useRef(null), refresh = useCrmRefresh(), queryClient = useQueryClient();
  const candidates = useCrmRead('crm_find_student_candidates', { p_lead: lead.id, p_name: form.name.trim(), p_birth_date: form.birth || null, p_limit: 5, p_offset: offset }, !linked && form.name.trim().length >= 2);
  const enrollments = useCrmRead('crm_find_enrollment_candidates', { p_student: form.student?.id, p_session: form.session, p_year: form.year, p_limit: 5, p_offset: enrollmentOffset }, form.choice === 'existing' && !!form.student && step >= 2);
  const groups = useCrmRead('crm_enrollment_groups', { p_session: form.session, p_level: form.level || null, p_limit: 50, p_offset: groupOffset }, step >= 2);
  const linkedId = live.linkedActive ? liveLinked.id : null, linkedName = liveLinked?.name, linkedBirth = liveLinked?.birth_date, isFrozen = !!frozen;
  // A linkage discovered after a rejection moves the dialog to the linked presentation,
  // never while an uncertain request is frozen.
  useEffect(() => { if (!isFrozen && linkedId) setForm(f => f.choice === 'existing' && f.student?.id === linkedId ? f : { ...f, choice: 'existing', student: { id: linkedId, name: linkedName, birth_date: linkedBirth }, confirmNew: false, enrollment: null, mode: 'pay' }); }, [linkedId, linkedName, linkedBirth, isFrozen]);
  useEffect(() => { if (failure?.field) formRef.current?.querySelector(`[data-field="${failure.field}"]`)?.focus(); }, [failure, step]);
  const set = (key, value) => { setForm(f => ({ ...f, [key]: value })); setFailure(null); };
  const birthIssue = linkedActive ? null : birthDateReason(form.birth);
  // Derived validation never replaces the uncertain-retry message.
  const shown = frozen ? failure : failure?.field ? failure : birthIssue ? reasonFailure(birthIssue) : failure;
  const validIdentity = linked ? linkedActive : !birthIssue && form.name.trim().length >= 2 && (form.choice === 'existing' && form.student || form.choice === 'new' && candidates.isSuccess && (!candidates.data.total || form.confirmNew));
  const rows = enrollments.data?.rows || [], completePage = enrollments.isSuccess && rows.length === enrollments.data.total;
  const liveRows = rows.filter(en => !CLOSED_ENROLLMENT_STATUSES.includes(en.status));
  // A live enrollment of this programme and year must be chosen (no duplicate); an ended one never blocks.
  const existingReady = form.choice !== 'existing' || enrollments.isSuccess && (!!form.enrollment || completePage && !liveRows.length);
  const linkedElsewhere = form.choice === 'existing' && !form.enrollment && completePage && liveRows.length > 0 && liveRows.every(en => en.already_linked);
  const selectedGroup = groups.data?.rows.find(g => g.id === form.group);
  const groupShown = !form.enrollment?.group_name;
  const levels = getLevelsForSession(form.session, form.level);
  const linking = form.mode === 'link' && !!form.enrollment;
  const isBlocked = !!blocked && (blocked.intent === null || blocked.intent === JSON.stringify(form));
  // Desk-guard preview, as the receipt form shows it.
  const gross = amount(form.gross), discount = amount(form.discount), paid = amount(form.amount), net = Math.max(0, gross - discount);
  const guardPreview = deskGuardError({ role, newCharge: true, gross, discount, reasonCode: form.reasonCode, reasonText: form.reasonText, payment: paid, paymentDate: form.paymentDate, today });
  const free = isFreeEnrollment({ newCharge: true, sessionType: form.session, gross, discount, reasonCode: form.reasonCode, payment: paid });
  const fail = (next, target) => { setFailure(next);if (target) setStep(target); };
  const choose = (en, mode) => { setForm(f => ({ ...f, enrollment: en, mode, group: en.group_name ? '' : f.group }));setFailure(null); };
  function payload(f, view) {
    const enrollment = { lead_id: lead.id, expected_version: version, student_choice: f.choice,
      ...(view.linkedActive ? {} : { learner_name: f.name.trim(), birth_date: f.birth || null }), session_type: f.session, school_year: f.year,
      ...(f.choice === 'new' ? { candidate_review: candidates.data?.review_token, confirm_new: f.confirmNew } : { student_id: f.student.id }),
      ...(f.enrollment ? { enrollment_id: f.enrollment.id, expected_enrollment_updated_at: f.enrollment.updated_at } : { level: f.level || null }) };
    if (f.mode === 'link' && f.enrollment) return { enrollment };
    const reduced = amount(f.discount) > 0, emailed = amount(f.amount) > 0 && f.requestEmail;
    return { enrollment, payment: { gross_amount: amount(f.gross), discount_amount: amount(f.discount), discount_reason_code: reduced ? f.reasonCode : null,
      discount_reason: reduced && f.reasonCode === 'other' ? f.reasonText.trim() : null, due_date: f.dueDate || null, payment_amount: amount(f.amount),
      payment_date: f.paymentDate, payment_method: f.method, transaction_reference: f.reference.trim() || null, note: f.note.trim() || null,
      request_email: emailed, email_recipient: emailed ? f.emailRecipient.trim() : null } };
  }
  // D3: the group is a second command on fresh versions of the learner and of the
  // enrollment the payment just changed; a refusal never undoes the payment.
  async function placeInGroup(saved, groupId) {
    const group = groups.data?.rows.find(g => g.id === groupId);
    if (!groupId || saved.enrollment?.group_name) return null;
    const client = getBrowserClient();
    try {
      const [{ data: student, error: studentError }, { data: enrollment, error: enrollmentError }] = await Promise.all([
        client.from('students').select('id,updated_at').eq('id', saved.enrollment.student_id).single(),
        client.from('enrollments').select('id,updated_at').eq('id', saved.enrollment.id).single()]);
      if (studentError || enrollmentError) throw studentError || enrollmentError;
      const { error } = await placeLearnerInGroup(client, { student, group: groupId, enrollment });
      if (error) return { status: 'failed', message: membershipErrorMessage(error) };
      await invalidateAfterLearnerSave(queryClient);
      return { status: 'placed', name: group?.name || 'groupe choisi' };
    } catch (error) { return { status: 'failed', message: membershipErrorMessage(error) }; }
  }
  async function submit(e) {
    e.preventDefault();
    if (locked.current) return;
    if (step === 1 && birthIssue) return fail(reasonFailure(birthIssue), 1);
    if (step < 3) { setFailure(null);setStep(x => x + 1); return; }
    // An uncertain request is resent byte-identically with the same key: the server replays it.
    const replay = !!pending.current?.uncertain;
    const checked = replay ? pending.current : { form, view: { linked, linkedActive } };
    // Re-evaluated now, not at the last render: the birth bound always applies.
    const birth = checked.view.linkedActive ? null : birthDateReason(checked.form.birth);
    if (birth) return fail(reasonFailure(birth), 1);
    if (!replay && !linking) { const issue = paymentIssue(form, { role, today }); if (issue) return fail(issue, 3); }
    locked.current = true;setSaving(true);setBusy(true);
    if (!replay) { setFailure(null);pending.current = { payload: payload(form, checked.view), form, view: checked.view, linkedPaid: linking, group: groupShown ? form.group : '', uncertain: false }; }
    const sent = pending.current;
    try {
      const saved = await crmRpc('crm_enroll_and_collect', { p_request_key: requestKey.current, p_data: sent.payload });
      setFrozen(null);
      const placement = sent.group ? await placeInGroup(saved, sent.group) : null;
      setResult({ data: saved, origin: 'request', linkedPaid: sent.linkedPaid, placement });await refresh();
    } catch (err) {
      const next = enrollmentFailure(err, { linkingPaid: sent.linkedPaid });
      if (!next.definite) { sent.uncertain = true;setFrozen({ view: sent.view });setFailure(next);return; }
      // A definite rejection rolled the whole request back (enrollment, lead link and payment).
      pending.current = null;setFrozen(null);
      if (next.submit === false) setBlocked({ intent: null });else if (next.submit === 'until-change') setBlocked({ intent: JSON.stringify(form) });
      let target = next.step || (!next.reason && ['22023', '42501'].includes(err.code) ? 2 : null);
      if (next.recovery === 'pay') setForm(f => ({ ...f, mode: 'pay' }));
      else if (next.recovery === 'discovered' || isRecordConflict(err) || next.recovery === 'linked') {
        const latest = await crmRpc('crm_get_workspace_detail', { p_lead: lead.id }).catch(() => null);
        if (latest?.enrollment) { setResult({ data: { lead: latest, enrollment: latest.enrollment }, origin: 'discovered' });await refresh();return; }
        if (latest) setVersion(latest.version);
        if (next.recovery === 'linked') await refetchContext();
        else if (next.recovery === 'enrollments') { await enrollments.refetch();setForm(f => ({ ...f, enrollment: null, mode: 'pay' })); }
        else if (isRecordConflict(err) && next.recovery !== 'retry') {
          if (!linked) await candidates.refetch();if (form.choice === 'existing') await enrollments.refetch();
          setForm(f => linkedActive ? { ...f, enrollment: null, mode: 'pay' } : { ...f, choice: '', student: null, enrollment: null, mode: 'pay', confirmNew: false });target = 1;
        }
        await refresh();
      } else if (next.recovery === 'enrollments' || next.recovery === 'reselect') {
        if (form.choice === 'existing' && form.student) await enrollments.refetch();
        setForm(f => next.recovery === 'reselect' ? { ...f, choice: '', student: null, enrollment: null, mode: 'pay' } : ['enrollment_changed', 'enrollment_incompatible', 'enrollment_already_linked'].includes(next.reason) ? { ...f, enrollment: null, mode: 'pay' } : f);
      }
      fail(next, target);
    } finally { locked.current = false;setSaving(false);setBusy(false); }
  }
  if (result) {
    const view = enrollmentSuccess(result.data, result.origin, { linkedPaid: result.linkedPaid, placement: result.placement }), receipt = result.data.receipt_id;
    return <div className="space-y-4"><div role="status" className="space-y-2"><p className="font-semibold">{view.heading}</p>{view.intro && <p className="text-sm">{view.intro}</p>}{view.status && <p className="text-sm">{view.status}</p>}<p className="text-sm">{view.learner}</p>{view.group && <p className="text-sm">{view.group}</p>}{view.lead && <p className="text-sm text-slate-500">{view.lead}</p>}</div>
      <div className="flex flex-wrap justify-end gap-2">{receipt && <Button asChild variant="outline"><Link href={`/receipts/${receipt}/print`}>Ouvrir le reçu</Link></Button>}<Button onClick={onClose}>Terminé</Button></div></div>;
  }
  const learnerName = form.student?.name || form.name;
  const summary = <div className="space-y-1 rounded-lg border p-3 text-sm"><p className="font-semibold">{learnerName}</p><p>{form.choice === 'new' ? 'Création d’un nouvel apprenant' : linkedActive ? 'Apprenant rattaché à ce prospect' : 'Utilisation de l’apprenant sélectionné'}</p><p>{PROGRAMS[form.session]} · {form.year}</p>{form.enrollment && <p>{ENROLLMENT_STATUS[form.enrollment.status] || 'Inscription existante'}</p>}{(form.enrollment?.level || form.level) && <p>Niveau : {form.enrollment?.level || form.level}</p>}{form.enrollment?.group_name ? <p>{form.enrollment.group_name}</p> : selectedGroup ? <p>Groupe après encaissement : {selectedGroup.name}</p> : <p>Groupe à affecter</p>}</div>;
  return <form ref={formRef} onSubmit={submit} className="space-y-4"><p className="text-xs font-semibold uppercase tracking-wider text-blue-800">{step} / 3 · {['Apprenant', 'Inscription', linking ? 'Vérification' : 'Paiement'][step - 1]}</p>
    <fieldset disabled={saving || isFrozen} className="space-y-4">
      {step === 1 && <><div className="rounded-lg bg-slate-50 p-3 text-sm"><p className="font-medium">{context.contact_name}</p><p>{context.phone}{context.email ? ` · ${context.email}` : ''}</p>{context.age != null && <p>Âge connu : {context.age} ans</p>}</div>
        {linked ? linkedActive ? <div className="space-y-1 rounded-lg border p-3 text-sm"><p className="font-semibold">Apprenant rattaché à ce prospect : {linked.name}{linked.birth_date ? ` · ${linked.birth_date}` : ''}</p><p className="text-slate-500">Ce prospect est déjà rattaché à cet apprenant ; l’inscription sera créée pour lui. Pour changer d’apprenant, contactez la direction.</p></div>
          : <p className="rounded-lg border p-3 text-sm">{ENROLLMENT_REASONS.linked_learner_unavailable.message}</p> : <>
        <Field label="Nom de l’apprenant" name="name" failure={shown}><input className={input} required minLength={2} maxLength={120} value={form.name} onChange={e => { setForm(f => ({ ...f, name: e.target.value, choice: '', student: null, confirmNew: false, enrollment: null, mode: 'pay' }));setOffset(0);setFailure(null); }} /></Field>
        <Field label="Date de naissance (si connue)" name="birth" failure={shown}><input className={input} type="date" max={casablancaToday()} value={form.birth} onChange={e => { setForm(f => ({ ...f, birth: e.target.value, choice: '', student: null, confirmNew: false, enrollment: null, mode: 'pay' }));setOffset(0);setFailure(null); }} /></Field>
        {form.name.trim().length >= 2 && <ReadState query={candidates} empty="Aucun apprenant existant trouvé."><div className="space-y-2">{candidates.data?.rows.map(s => <div key={s.id} className="rounded-lg border p-3 text-sm"><p className="text-xs text-slate-500">Apprenant existant possible</p><p className="font-semibold">{s.name}</p><p>{s.birth_date || 'Date de naissance non renseignée'}{s.group_name ? ` · ${s.group_name}` : ''}</p>{s.phone && <p className="text-slate-500">{s.phone}</p>}<Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => { setForm(f => ({ ...f, choice: 'existing', student: s, enrollment: null, mode: 'pay' }));setFailure(null); }}>{form.student?.id === s.id && form.choice === 'existing' ? 'Apprenant sélectionné' : 'Utiliser cet apprenant'}</Button></div>)}{!candidates.data?.total && <p className="text-sm text-slate-500">Aucun apprenant existant trouvé.</p>}</div></ReadState>}
        <Pager offset={offset} total={candidates.data?.total || 0} size={5} onChange={setOffset} />
        <Button type="button" variant="outline" disabled={!candidates.isSuccess} onClick={() => { setForm(f => ({ ...f, choice: 'new', student: null, enrollment: null, mode: 'pay', confirmNew: false }));setFailure(null); }}>{form.choice === 'new' ? 'Nouvel apprenant sélectionné' : 'Créer un nouvel apprenant'}</Button>
        {form.choice === 'new' && candidates.data?.total > 0 && <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" data-field="confirmNew" aria-invalid={shown?.field === 'confirmNew' || undefined} checked={form.confirmNew} onChange={e => set('confirmNew', e.target.checked)} />J’ai vérifié les correspondances : il s’agit d’un autre apprenant.</label>}
      </>}</>}
      {step === 2 && <><p className="text-sm font-medium">{learnerName}</p>{context.program_interest && <p className="text-sm text-slate-500">Projet : {context.program_interest}</p>}{context.recommended_level && <p className="text-sm text-slate-500">Résultat du test : {context.recommended_level}. Choisissez un niveau compatible avec le programme.</p>}
        <div className="grid gap-3 sm:grid-cols-2"><Field label="Programme" name="session" failure={shown}><select className={input} value={form.session} onChange={e => { setForm(f => ({ ...f, session: e.target.value, level: '', group: '', enrollment: null, mode: 'pay' }));setGroupOffset(0);setEnrollmentOffset(0);setFailure(null); }}>{ENROLLABLE.map(s => <option key={s} value={s}>{PROGRAMS[s]}</option>)}</select></Field><Field label="Année scolaire" name="year" failure={shown}><input className={input} required pattern="[0-9]{4}/[0-9]{4}" value={form.year} readOnly={Boolean(schoolYearOfGroup(selectedGroup))} title={schoolYearOfGroup(selectedGroup) ? 'L’année scolaire suit le groupe choisi.' : undefined} onChange={e => { setForm(f => ({ ...f, year: e.target.value, enrollment: null, mode: 'pay' }));setEnrollmentOffset(0);setFailure(null); }} /></Field></div>
        {form.choice === 'existing' && <ReadState query={enrollments}><div className="space-y-2">{rows.map(en => <div key={en.id} className="rounded-lg border p-3 text-sm"><p className="font-medium">{ENROLLMENT_STATUS[en.status] || 'Statut à vérifier'}</p><p>{en.school_year}{en.level ? ` · ${en.level}` : ''}{en.group_name ? ` · ${en.group_name}` : ''}</p>
          {CLOSED_ENROLLMENT_STATUSES.includes(en.status) ? <p className="mt-2 text-slate-500">Historique : une nouvelle inscription peut être encaissée.</p> : en.already_linked ? <Button type="button" size="sm" variant="outline" className="mt-2" disabled>Déjà rattachée à un prospect</Button>
            : <div className="mt-2 flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" onClick={() => choose(en, 'pay')}>{form.enrollment?.id === en.id && form.mode === 'pay' ? 'Encaissement sur cette inscription' : 'Encaisser sur cette inscription'}</Button>{PAID_ENROLLMENT_STATUSES.includes(en.status) && <Button type="button" size="sm" variant="outline" onClick={() => choose(en, 'link')}>{form.enrollment?.id === en.id && form.mode === 'link' ? 'Inscription payée sélectionnée' : 'Rattacher cette inscription payée'}</Button>}</div>}</div>)}
          {liveRows.length > 0 && !form.enrollment && <p className="text-sm">{linkedElsewhere ? ENROLLMENT_REASONS.existing_enrollment_linked_elsewhere.message : 'Choisissez l’inscription existante pour éviter un doublon.'}</p>}</div></ReadState>}
        <Pager offset={enrollmentOffset} total={enrollments.data?.total || 0} size={5} onChange={setEnrollmentOffset} />
        {!form.enrollment && <Field label="Niveau proposé" name="level" failure={shown}><select className={input} value={form.level} onChange={e => { setForm(f => ({ ...f, level: e.target.value, group: '' }));setGroupOffset(0);setFailure(null); }}><option value="">À définir</option>{levels.map(l => <option key={l}>{l}</option>)}</select></Field>}
        {groupShown && <><Field label="Groupe (facultatif)" name="group" failure={shown}><select className={input} value={form.group} onChange={e => { const g = groups.data?.rows.find(x => x.id === e.target.value);setForm(f => ({ ...f, group: e.target.value, level: f.enrollment ? f.level : g?.niveau || f.level, ...(schoolYearOfGroup(g) && !f.enrollment ? { year: schoolYearOfGroup(g) } : {}) }));setFailure(null); }}><option value="">À affecter plus tard</option>{groups.data?.rows.filter(g => groupMatchesEnrollment(g, { session_type: form.session, level: form.enrollment?.level || form.level }, null) && (!form.enrollment || !schoolYearOfGroup(g) || schoolYearOfGroup(g) === form.year)).map(g => <option key={g.id} value={g.id}>{g.name} · {g.niveau}</option>)}</select><span className="block text-xs text-slate-500">L’affectation suit l’encaissement ; un groupe complet ou refusé n’annule jamais le paiement.</span></Field>
          {groups.isError && <p role="alert" className="text-sm">Groupes indisponibles. <button type="button" onClick={() => groups.refetch()}>Réessayer</button></p>}<Pager offset={groupOffset} total={groups.data?.total || 0} size={50} onChange={setGroupOffset} /></>}
      </>}
      {step === 3 && linking && <>{summary}<p className="rounded-lg bg-slate-50 p-3 text-sm">Cette inscription est déjà payée. Son rattachement termine le suivi commercial de ce prospect ; aucun reçu n’est émis. Le serveur vérifie le paiement.</p></>}
      {step === 3 && !linking && <>{summary}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Prix brut convenu" name="gross" failure={shown}><input className={input} type="number" min="0" step="0.01" required value={form.gross} onChange={e => set('gross', e.target.value)} placeholder="Aucun prix implicite" /></Field>
          <Field label="Remise (MAD)" name="discount" failure={shown}><input className={input} type="number" min="0" step="0.01" value={form.discount} onChange={e => set('discount', e.target.value)} placeholder="0" /></Field>
          {discount > 0 && <Field label="Motif de la remise" name="reasonCode" failure={shown}><select className={input} required value={form.reasonCode} onChange={e => set('reasonCode', e.target.value)}><option value="">Choisir…</option>{DISCOUNT_REASONS.map(r => <option key={r.code} value={r.code}>{r.label}</option>)}</select></Field>}
          {discount > 0 && form.reasonCode === 'other' && <Field label="Précisez le motif" name="reasonText" failure={shown}><input className={input} required minLength={3} maxLength={DISCOUNT_REASON_MAX_LENGTH} value={form.reasonText} onChange={e => set('reasonText', e.target.value)} /></Field>}
          <Field label="Échéance (facultative)" name="dueDate" failure={shown}><input className={input} type="date" value={form.dueDate} onChange={e => set('dueDate', e.target.value)} /></Field>
          <Field label="Montant payé aujourd’hui" name="amount" failure={shown}><input className={input} type="number" min="0" step="0.01" required value={form.amount} onChange={e => set('amount', e.target.value)} /></Field>
          <Field label="Date du paiement" name="paymentDate" failure={shown}><input className={input} type="date" required min={addDays(today, -paymentBackdateDays(role))} max={today} value={form.paymentDate} onChange={e => set('paymentDate', e.target.value)} /><span className="block text-xs text-slate-500">Jamais dans le futur ; au plus {paymentBackdateDays(role)} jours en arrière.</span></Field>
          <Field label="Mode de paiement" name="method" failure={shown}><select className={input} value={form.method} onChange={e => set('method', e.target.value)}>{PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}</select></Field>
          <Field label="Référence (facultative)" name="reference" failure={shown}><input className={input} maxLength={120} value={form.reference} onChange={e => set('reference', e.target.value)} /></Field>
          <div className="sm:col-span-2"><Field label="Note interne (non imprimée)" name="note" failure={shown}><textarea className={input} maxLength={500} rows={2} value={form.note} onChange={e => set('note', e.target.value)} /></Field></div>
        </div>
        <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border bg-slate-200"><Amount label="Prix net" value={net} /><Amount label="Payé aujourd’hui" value={paid} accent /><Amount label="Solde restant" value={Math.max(0, net - paid)} /></div>
        {guardPreview ? <p role="note" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{guardPreview}</p>
          : free ? <p role="note" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{FREE_ENROLLMENT_MESSAGE}</p>
            : form.amount !== '' && !(paid > 0) && <p role="note" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{PAYMENT_REQUIRED}</p>}
        {paid > 0 && <div className="space-y-2 rounded-lg border bg-slate-50 p-3 text-sm"><label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={form.requestEmail} onChange={e => set('requestEmail', e.target.checked)} /><span>Envoyer aussi le reçu par e-mail<span className="block text-xs text-slate-500">Facultatif. L’absence d’e-mail ne bloque jamais le paiement ni l’impression.</span></span></label>{form.requestEmail && <Field label="Destinataire e-mail" name="emailRecipient" failure={shown}><input className={input} type="email" required value={form.emailRecipient} onChange={e => set('emailRecipient', e.target.value)} placeholder="famille@exemple.com" /></Field>}</div>}
      </>}
    </fieldset>
    <DialogStickyFooter>{shown && <p role="alert" className={`rounded-lg bg-red-50 p-3 text-sm text-red-800 ${FOOTER_ALERT}`}>{shown.message}</p>}
    <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="ghost" disabled={saving} onClick={onClose}>Annuler</Button>{step > 1 && <Button type="button" variant="outline" disabled={saving || isFrozen} onClick={() => setStep(s => s - 1)}>Retour</Button>}<Button type="submit" disabled={saving || isBlocked || step === 1 && !validIdentity || step === 2 && !existingReady}>{saving ? 'Enregistrement…' : step === 3 ? linking ? 'Rattacher cette inscription payée' : 'Inscrire et encaisser' : 'Continuer'}</Button></div></DialogStickyFooter>
  </form>;
}
export default function CrmEnrollmentDialog({ lead, onClose }) {
  const [busy, setBusy] = useState(false), returnFocus = useRef(typeof document !== 'undefined' ? document.activeElement : null);
  const context = useCrmRead('crm_get_enrollment_context', { p_lead: lead.id });
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent className={`${STICKY_DIALOG} sm:max-w-2xl`} onEscapeKeyDown={e => { if (busy) e.preventDefault(); }} onInteractOutside={e => { if (busy) e.preventDefault(); }} onCloseAutoFocus={e => { e.preventDefault();if (returnFocus.current?.isConnected) returnFocus.current.focus(); }}><DialogHeader><DialogTitle>Inscrire et encaisser</DialogTitle><DialogDescription>Choisissez l’apprenant et l’inscription, puis encaissez le paiement qui la confirme.</DialogDescription></DialogHeader><ReadState query={context}>{context.data && <EnrollmentForm lead={lead} context={context.data} refetchContext={() => context.refetch()} onClose={onClose} setBusy={setBusy} />}</ReadState></DialogContent></Dialog>;
}
