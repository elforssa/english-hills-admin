'use client';
import { Children, cloneElement, useEffect, useId, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { SESSION_TYPES, getLevelsForSession, groupMatchesEnrollment } from '@/lib/academicPrograms';
import { crmRpc, useCrmRead, useCrmRefresh } from '@/lib/crm/queries';
import { retryKey, casablancaInstant } from '@/lib/crm/presentation.mjs';
import { ENROLLMENT_STATUS, PROGRAMS, enrollmentSchoolYear } from '@/lib/crm/enrollment.mjs';
import { ENROLLMENT_REASONS, discardsRequestKey, enrollmentFailure } from '@/lib/crm/enrollmentErrors.mjs';
import { birthDateReason, casablancaNowInput, casablancaToday, enrollmentSuccess, followupNotice, followupReason } from '@/lib/crm/enrollmentActions.mjs';
import { Pager, ReadState } from './CrmShared';
const input = 'min-h-11 w-full rounded-md border bg-white px-3 py-2 text-sm';
const DEFAULT_FOLLOWUP = 'Suivi « Finaliser l’inscription » : demain, au prochain créneau d’appel autorisé.';
// A field reason marks its control invalid and describes it with the inline message.
function Field({ label, name, failure, children }) { const id = useId(); const [control, ...help] = Children.toArray(children); const invalid = !!name && failure?.field === name; return <div className="space-y-1 text-sm"><label htmlFor={id} className="block font-medium">{label}</label>{cloneElement(control, { id, ...(name ? { 'data-field': name } : {}), 'aria-invalid': invalid || undefined, 'aria-describedby': invalid ? `${id}-error` : undefined })}{help}{invalid && <p id={`${id}-error`} className="text-sm text-red-800">{failure.message}</p>}</div>; }
const reasonFailure = reason => ({ definite: false, reason, ...ENROLLMENT_REASONS[reason] });
function EnrollmentForm({ lead, context, refetchContext, onClose, setBusy }) {
  const session = context.session_type || 'Yearly';
  // linked_student is authoritative: that learner only, no candidates, no new learner.
  const linked = context.linked_student || null, linkedActive = linked?.available === true;
  const kept = lead.open_tasks?.find(t => t.task_type === 'enrollment_followup') || null;
  const [form, setForm] = useState(() => ({ name: context.learner_name || '', birth: context.birth_date || '', choice: linkedActive ? 'existing' : '', student: linkedActive ? { id: linked.id, name: linked.name, birth_date: linked.birth_date } : null,
    session, year: enrollmentSchoolYear(), level: getLevelsForSession(session).includes(context.recommended_level) ? context.recommended_level : '',
    group: '', status: 'Submitted', enrollment: null, confirmNew: false, customDue: false, due: '', notes: '' }));
  const [step, setStep] = useState(1), [offset, setOffset] = useState(0), [enrollmentOffset, setEnrollmentOffset] = useState(0), [groupOffset, setGroupOffset] = useState(0);
  const [failure, setFailure] = useState(null), [blocked, setBlocked] = useState(null), [saving, setSaving] = useState(false), [result, setResult] = useState(null), [version, setVersion] = useState(lead.version);
  const pending = useRef(null), locked = useRef(false), formRef = useRef(null), refresh = useCrmRefresh();
  const candidates = useCrmRead('crm_find_student_candidates', { p_lead: lead.id, p_name: form.name.trim(), p_birth_date: form.birth || null, p_limit: 5, p_offset: offset }, !linked && form.name.trim().length >= 2);
  const enrollments = useCrmRead('crm_find_enrollment_candidates', { p_student: form.student?.id, p_session: form.session, p_year: form.year, p_limit: 5, p_offset: enrollmentOffset }, form.choice === 'existing' && !!form.student && step >= 2);
  const groups = useCrmRead('crm_enrollment_groups', { p_session: form.session, p_level: form.level || null, p_limit: 50, p_offset: groupOffset }, step >= 2);
  const linkedId = linkedActive ? linked.id : null, linkedName = linked?.name, linkedBirth = linked?.birth_date;
  // A linkage discovered after a rejection moves the dialog to the linked presentation.
  useEffect(() => { if (linkedId) setForm(f => f.choice === 'existing' && f.student?.id === linkedId ? f : { ...f, choice: 'existing', student: { id: linkedId, name: linkedName, birth_date: linkedBirth }, confirmNew: false, enrollment: null }); }, [linkedId, linkedName, linkedBirth]);
  useEffect(() => { if (failure?.field) formRef.current?.querySelector(`[data-field="${failure.field}"]`)?.focus(); }, [failure, step]);
  const set = (key, value) => { setForm(f => ({ ...f, [key]: value })); setFailure(null); };
  const birthIssue = linkedActive ? null : birthDateReason(form.birth);
  const followupShown = !['Confirmed', 'Validated'].includes(form.enrollment?.status);
  // An empty custom date keeps the server default; only a chosen value is sent.
  const customDue = followupShown && !kept && form.customDue && !!form.due;
  const dueIssue = customDue ? followupReason(form.due) : null;
  const shown = failure?.field ? failure : birthIssue ? reasonFailure(birthIssue) : dueIssue ? reasonFailure(dueIssue) : failure;
  const validIdentity = linked ? linkedActive : !birthIssue && form.name.trim().length >= 2 && (form.choice === 'existing' && form.student || form.choice === 'new' && candidates.isSuccess && (!candidates.data.total || form.confirmNew));
  const existingReady = form.choice !== 'existing' || enrollments.isSuccess && (!enrollments.data.total || form.enrollment);
  const linkedElsewhere = form.choice === 'existing' && !form.enrollment && enrollments.isSuccess && enrollments.data.total > 0 && enrollments.data.rows.length === enrollments.data.total && enrollments.data.rows.every(en => en.already_linked);
  const selectedGroup = groups.data?.rows.find(g => g.id === form.group);
  const levels = getLevelsForSession(form.session, form.level);
  const isBlocked = !!blocked && (blocked.intent === null || blocked.intent === JSON.stringify(form));
  const fail = (next, target) => { setFailure(next);if (next.field === 'due') setForm(f => ({ ...f, customDue: true }));if (target) setStep(target); };
  async function submit(e) {
    e.preventDefault();
    if (locked.current) return;
    if (step === 1 && birthIssue) return fail(reasonFailure(birthIssue), 1);
    if (step === 2 && dueIssue) return fail(reasonFailure(dueIssue), 2);
    if (step < 3) { setFailure(null);setStep(x => x + 1); return; }
    const intent = JSON.stringify(form);
    // An uncertain outcome is resent byte-identically with the same key, even if
    // the chosen follow-up time has passed meanwhile: the server replays first.
    const replay = pending.current?.intent === intent && pending.current.uncertain;
    if (!replay) {
      // Re-evaluated now, not at the last render: a value may have gone stale meanwhile.
      const birthNow = linkedActive ? null : birthDateReason(form.birth), dueNow = customDue ? followupReason(form.due) : null;
      if (birthNow) return fail(reasonFailure(birthNow), 1);
      if (dueNow) return fail(reasonFailure(dueNow), 2);
    }
    locked.current = true;setSaving(true);setBusy(true);setFailure(null);
    try {
      if (pending.current?.intent !== intent) {
        const payload = { lead_id: lead.id, expected_version: version, student_choice: form.choice,
          ...(linkedActive ? {} : { learner_name: form.name.trim(), birth_date: form.birth || null }), session_type: form.session, school_year: form.year,
          ...(form.choice === 'new' ? { candidate_review: candidates.data?.review_token, confirm_new: form.confirmNew }
            : { student_id: form.student.id }),
          ...(form.enrollment ? { enrollment_id: form.enrollment.id, expected_enrollment_updated_at: form.enrollment.updated_at }
            : { level: form.level || null, group_id: form.group || null, initial_status: form.status, notes: form.notes || null }),
          ...(customDue ? { followup_at: casablancaInstant(form.due) } : {}) };
        pending.current = { ...retryKey(null, 'crm_start_enrollment', payload), payload, intent, uncertain: false };
      }
      const saved = await crmRpc('crm_start_enrollment', { p_request_key: pending.current.key, p_data: pending.current.payload });
      setResult({ data: saved, origin: 'request' });await refresh();
    } catch (err) {
      const next = enrollmentFailure(err);
      if (!next.definite) { if (pending.current) pending.current.uncertain = true;setFailure(next);return; }
      if (discardsRequestKey(err)) pending.current = null;
      if (next.submit === false) setBlocked({ intent: null });else if (next.submit === 'until-change') setBlocked({ intent });
      let target = next.step || (!next.reason && ['22023', '42501'].includes(err.code) ? 2 : null);
      if (next.recovery === 'discovered' || err.code === '40001' || next.recovery === 'linked') {
        const latest = await crmRpc('crm_get_workspace_detail', { p_lead: lead.id }).catch(() => null);
        if (latest?.enrollment) { setResult({ data: { lead: latest, enrollment: latest.enrollment }, origin: 'discovered' });await refresh();return; }
        if (latest) setVersion(latest.version);
        if (next.recovery === 'linked') await refetchContext();
        else if (next.recovery === 'enrollments') { await enrollments.refetch();setForm(f => ({ ...f, enrollment: null })); }
        else if (err.code === '40001' && next.recovery !== 'retry') {
          if (!linked) await candidates.refetch();if (form.choice === 'existing') await enrollments.refetch();
          setForm(f => linkedActive ? { ...f, enrollment: null } : { ...f, choice: '', student: null, enrollment: null, confirmNew: false });target = 1;
        }
        await refresh();
      } else if (next.recovery === 'enrollments' || next.recovery === 'reselect') {
        if (form.choice === 'existing' && form.student) await enrollments.refetch();
        setForm(f => next.recovery === 'reselect' ? { ...f, choice: '', student: null, enrollment: null } : { ...f, enrollment: next.reason === 'enrollment_changed' || next.reason === 'enrollment_incompatible' || next.reason === 'enrollment_already_linked' ? null : f.enrollment });
      }
      fail(next, target);
    } finally { locked.current = false;setSaving(false);setBusy(false); }
  }
  if (result) { const view = enrollmentSuccess(result.data, result.origin); return <div className="space-y-4"><div role="status" className="space-y-2"><p className="font-semibold">{view.heading}</p>{view.intro && <p className="text-sm">{view.intro}</p>}{view.status && <p className="text-sm">{view.status}</p>}<p className="text-sm">{view.learner}</p>{view.lead && <p className="text-sm text-slate-500">{view.lead}</p>}{view.followup && <p className="text-sm">{view.followup}</p>}</div><Button onClick={onClose}>Terminé</Button></div>; }
  const learnerName = form.student?.name || form.name;
  const followupLine = kept ? followupNotice(kept) : customDue && !dueIssue ? `Suivi « Finaliser l’inscription » demandé le ${form.due.slice(8, 10)}/${form.due.slice(5, 7)}/${form.due.slice(0, 4)} à ${form.due.slice(11)}, ajusté au prochain créneau d’appel autorisé si nécessaire.` : DEFAULT_FOLLOWUP;
  return <form ref={formRef} onSubmit={submit} className="space-y-4"><p className="text-xs font-semibold uppercase tracking-wider text-blue-800">{step} / 3 · {['Apprenant', 'Inscription', 'Vérification'][step - 1]}</p>
    <fieldset disabled={saving} className="space-y-4">
      {step === 1 && <><div className="rounded-lg bg-slate-50 p-3 text-sm"><p className="font-medium">{context.contact_name}</p><p>{context.phone}{context.email ? ` · ${context.email}` : ''}</p>{context.age != null && <p>Âge connu : {context.age} ans</p>}</div>
        {linked ? linkedActive ? <div className="space-y-1 rounded-lg border p-3 text-sm"><p className="font-semibold">Apprenant rattaché à ce prospect : {linked.name}{linked.birth_date ? ` · ${linked.birth_date}` : ''}</p><p className="text-slate-500">Ce prospect est déjà rattaché à cet apprenant ; l’inscription sera créée pour lui. Pour changer d’apprenant, contactez la direction.</p></div>
          : <p className="rounded-lg border p-3 text-sm">{ENROLLMENT_REASONS.linked_learner_unavailable.message}</p> : <>
        <Field label="Nom de l’apprenant" name="name" failure={shown}><input className={input} required minLength={2} maxLength={120} value={form.name} onChange={e => { setForm(f => ({ ...f, name: e.target.value, choice: '', student: null, confirmNew: false, enrollment: null }));setOffset(0);setFailure(null); }} /></Field>
        <Field label="Date de naissance (si connue)" name="birth" failure={shown}><input className={input} type="date" max={casablancaToday()} value={form.birth} onChange={e => { setForm(f => ({ ...f, birth: e.target.value, choice: '', student: null, confirmNew: false, enrollment: null }));setOffset(0);setFailure(null); }} /></Field>
        {form.name.trim().length >= 2 && <ReadState query={candidates} empty="Aucun apprenant existant trouvé."><div className="space-y-2">{candidates.data?.rows.map(s => <div key={s.id} className="rounded-lg border p-3 text-sm"><p className="text-xs text-slate-500">Apprenant existant possible</p><p className="font-semibold">{s.name}</p><p>{s.birth_date || 'Date de naissance non renseignée'}{s.group_name ? ` · ${s.group_name}` : ''}</p>{s.phone && <p className="text-slate-500">{s.phone}</p>}<Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => { setForm(f => ({ ...f, choice: 'existing', student: s, enrollment: null }));setFailure(null); }}>{form.student?.id === s.id && form.choice === 'existing' ? 'Apprenant sélectionné' : 'Utiliser cet apprenant'}</Button></div>)}{!candidates.data?.total && <p className="text-sm text-slate-500">Aucun apprenant existant trouvé.</p>}</div></ReadState>}
        <Pager offset={offset} total={candidates.data?.total || 0} size={5} onChange={setOffset} />
        <Button type="button" variant="outline" disabled={!candidates.isSuccess} onClick={() => { setForm(f => ({ ...f, choice: 'new', student: null, enrollment: null, confirmNew: false }));setFailure(null); }}>{form.choice === 'new' ? 'Nouvel apprenant sélectionné' : 'Créer un nouvel apprenant'}</Button>
        {form.choice === 'new' && candidates.data?.total > 0 && <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" data-field="confirmNew" aria-invalid={shown?.field === 'confirmNew' || undefined} checked={form.confirmNew} onChange={e => set('confirmNew', e.target.checked)} />J’ai vérifié les correspondances : il s’agit d’un autre apprenant.</label>}
      </>}</>}
      {step === 2 && <><p className="text-sm font-medium">{learnerName}</p>{context.program_interest && <p className="text-sm text-slate-500">Projet : {context.program_interest}</p>}{context.recommended_level && <p className="text-sm text-slate-500">Résultat du test : {context.recommended_level}. Choisissez un niveau compatible avec le programme.</p>}
        <div className="grid gap-3 sm:grid-cols-2"><Field label="Programme" name="session" failure={shown}><select className={input} value={form.session} onChange={e => { setForm(f => ({ ...f, session: e.target.value, level: '', group: '', enrollment: null }));setGroupOffset(0);setEnrollmentOffset(0);setFailure(null); }}>{SESSION_TYPES.map(s => <option key={s} value={s}>{PROGRAMS[s]}</option>)}</select></Field><Field label="Année scolaire" name="year" failure={shown}><input className={input} required pattern="[0-9]{4}/[0-9]{4}" value={form.year} onChange={e => { setForm(f => ({ ...f, year: e.target.value, enrollment: null }));setEnrollmentOffset(0);setFailure(null); }} /></Field></div>
        {form.choice === 'existing' && <ReadState query={enrollments}><div className="space-y-2">{enrollments.data?.rows.map(en => <div key={en.id} className="rounded-lg border p-3 text-sm"><p className="font-medium">{ENROLLMENT_STATUS[en.status]}</p><p>{en.school_year}{en.level ? ` · ${en.level}` : ''}{en.group_name ? ` · ${en.group_name}` : ''}</p><Button type="button" size="sm" variant="outline" className="mt-2" disabled={en.already_linked} onClick={() => set('enrollment', en)}>{en.already_linked ? 'Déjà rattachée à un prospect' : form.enrollment?.id === en.id ? 'Inscription sélectionnée' : 'Rattacher cette inscription'}</Button></div>)}{enrollments.data?.total > 0 && !form.enrollment && <p className="text-sm">{linkedElsewhere ? ENROLLMENT_REASONS.existing_enrollment_linked_elsewhere.message : 'Choisissez l’inscription existante pour éviter un doublon.'}</p>}</div></ReadState>}
        <Pager offset={enrollmentOffset} total={enrollments.data?.total || 0} size={5} onChange={setEnrollmentOffset} />
        {!form.enrollment && <><Field label="Niveau proposé" name="level" failure={shown}><select className={input} value={form.level} onChange={e => { setForm(f => ({ ...f, level: e.target.value, group: '' }));setGroupOffset(0);setFailure(null); }}><option value="">À définir</option>{levels.map(l => <option key={l}>{l}</option>)}</select></Field>
          <Field label="Groupe" name="group" failure={shown}><select className={input} value={form.group} required={form.status === 'Trial'} onChange={e => { const g = groups.data?.rows.find(x => x.id === e.target.value);setForm(f => ({ ...f, group: e.target.value, level: g?.niveau || f.level }));setFailure(null); }}><option value="">À affecter plus tard</option>{groups.data?.rows.filter(g => groupMatchesEnrollment(g, { session_type: form.session, level: form.level }, null)).map(g => <option key={g.id} value={g.id}>{g.name} · {g.niveau}</option>)}</select></Field>
          {groups.isError && <p role="alert" className="text-sm">Groupes indisponibles. <button type="button" onClick={() => groups.refetch()}>Réessayer</button></p>}<Pager offset={groupOffset} total={groups.data?.total || 0} size={50} onChange={setGroupOffset} />
          <Field label="Démarrage" name="status" failure={shown}><select className={input} value={form.status} onChange={e => set('status', e.target.value)}><option value="Submitted">Pré-inscription</option><option value="Trial">Essai (groupe requis)</option></select></Field>
          <Field label="Note (facultatif)" name="notes" failure={shown}><textarea className={input} maxLength={2000} value={form.notes} onChange={e => set('notes', e.target.value)} /></Field>
        </>}
        {followupShown && (kept ? <p className="rounded-lg border p-3 text-sm">{followupNotice(kept)}</p> : form.customDue ? <div className="space-y-2"><Field label="Prochain suivi · Casablanca" name="due" failure={shown}><input className={input} type="datetime-local" min={casablancaNowInput()} value={form.due} onChange={e => set('due', e.target.value)} /><span className="block text-xs text-slate-500">L’heure est ajustée au prochain créneau d’appel autorisé si nécessaire.</span></Field><Button type="button" size="sm" variant="ghost" onClick={() => { setForm(f => ({ ...f, customDue: false, due: '' }));setFailure(null); }}>Garder la date par défaut</Button></div>
          : <div className="space-y-2 rounded-lg border p-3 text-sm"><p>{DEFAULT_FOLLOWUP}</p><Button type="button" size="sm" variant="outline" onClick={() => setForm(f => ({ ...f, customDue: true }))}>Choisir une autre date</Button></div>)}
      </>}
      {step === 3 && <div className="space-y-2 rounded-lg border p-4 text-sm"><p className="font-semibold">{learnerName}</p><p>{form.choice === 'new' ? 'Création d’un nouvel apprenant' : linkedActive ? 'Apprenant rattaché à ce prospect' : 'Utilisation de l’apprenant sélectionné'}</p><p>{PROGRAMS[form.session]} · {form.year}</p><p>{ENROLLMENT_STATUS[form.enrollment?.status || form.status]}</p>{(form.enrollment?.level || form.level) && <p>Niveau : {form.enrollment?.level || form.level}</p>}{selectedGroup && <p>{selectedGroup.name}</p>}{followupShown && <p>{followupLine}</p>}<p className="pt-2 text-slate-500">{['Confirmed', 'Validated'].includes(form.enrollment?.status) ? 'Cette inscription est déjà confirmée. Son rattachement terminera le suivi commercial de ce prospect.' : 'La création ne confirme pas l’inscription. Le suivi se poursuit jusqu’à sa confirmation.'}</p></div>}
    </fieldset>
    {shown && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{shown.message}</p>}
    <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="ghost" disabled={saving} onClick={onClose}>Annuler</Button>{step > 1 && <Button type="button" variant="outline" disabled={saving} onClick={() => setStep(s => s - 1)}>Retour</Button>}<Button type="submit" disabled={saving || isBlocked || step === 1 && !validIdentity || step === 2 && (!existingReady || !!dueIssue)}>{saving ? 'Enregistrement…' : step === 3 ? form.enrollment ? 'Rattacher cette inscription' : form.status === 'Trial' ? 'Démarrer l’essai' : 'Créer la pré-inscription' : 'Continuer'}</Button></div>
  </form>;
}
export default function CrmEnrollmentDialog({ lead, onClose }) {
  const [busy, setBusy] = useState(false), returnFocus = useRef(typeof document !== 'undefined' ? document.activeElement : null);
  const context = useCrmRead('crm_get_enrollment_context', { p_lead: lead.id });
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-xl" onEscapeKeyDown={e => { if (busy) e.preventDefault(); }} onInteractOutside={e => { if (busy) e.preventDefault(); }} onCloseAutoFocus={e => { e.preventDefault();if (returnFocus.current?.isConnected) returnFocus.current.focus(); }}><DialogHeader><DialogTitle>Commencer l&apos;inscription</DialogTitle><DialogDescription>Choisissez l’apprenant, puis vérifiez son inscription.</DialogDescription></DialogHeader><ReadState query={context}>{context.data && <EnrollmentForm lead={lead} context={context.data} refetchContext={() => context.refetch()} onClose={onClose} setBusy={setBusy} />}</ReadState></DialogContent></Dialog>;
}
