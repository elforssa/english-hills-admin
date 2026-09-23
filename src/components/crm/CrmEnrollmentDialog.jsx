'use client';
import { Children, cloneElement, useId, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { SESSION_TYPES, getLevelsForSession, groupMatchesEnrollment } from '@/lib/academicPrograms';
import { crmRpc, useCrmRead, useCrmRefresh } from '@/lib/crm/queries';
import { retryKey, commandError, casablancaInstant } from '@/lib/crm/presentation.mjs';
import { ENROLLMENT_STATUS, PROGRAMS, enrollmentSchoolYear } from '@/lib/crm/enrollment.mjs';
import { Pager, ReadState } from './CrmShared';
const input = 'min-h-11 w-full rounded-md border bg-white px-3 py-2 text-sm';
function Field({ label, children }) { const id = useId(); const [control, ...help] = Children.toArray(children); return <div className="space-y-1 text-sm"><label htmlFor={id} className="block font-medium">{label}</label>{cloneElement(control, { id })}{help}</div>; }
function EnrollmentForm({ lead, context, onClose, setBusy }) {
  const session = context.session_type || 'Yearly';
  const [form, setForm] = useState({ name: context.learner_name || '', birth: context.birth_date || '', choice: '', student: null,
    session, year: enrollmentSchoolYear(), level: getLevelsForSession(session).includes(context.recommended_level) ? context.recommended_level : '',
    group: '', status: 'Submitted', enrollment: null, confirmNew: false, due: '', notes: '' });
  const [step, setStep] = useState(1), [offset, setOffset] = useState(0), [enrollmentOffset, setEnrollmentOffset] = useState(0), [groupOffset, setGroupOffset] = useState(0);
  const [error, setError] = useState(''), [saving, setSaving] = useState(false), [result, setResult] = useState(null), [version, setVersion] = useState(lead.version);
  const pending = useRef(null), locked = useRef(false), refresh = useCrmRefresh();
  const candidates = useCrmRead('crm_find_student_candidates', { p_lead: lead.id, p_name: form.name.trim(), p_birth_date: form.birth || null, p_limit: 5, p_offset: offset }, form.name.trim().length >= 2);
  const enrollments = useCrmRead('crm_find_enrollment_candidates', { p_student: form.student?.id, p_session: form.session, p_year: form.year, p_limit: 5, p_offset: enrollmentOffset }, form.choice === 'existing' && !!form.student && step >= 2);
  const groups = useCrmRead('crm_enrollment_groups', { p_session: form.session, p_level: form.level || null, p_limit: 50, p_offset: groupOffset }, step >= 2);
  const set = (key, value) => { setForm(f => ({ ...f, [key]: value })); setError(''); };
  const validIdentity = form.name.trim().length >= 2 && (form.choice === 'existing' && form.student || form.choice === 'new' && candidates.isSuccess && (!candidates.data.total || form.confirmNew));
  const existingReady = form.choice !== 'existing' || enrollments.isSuccess && (!enrollments.data.total || form.enrollment);
  const selectedGroup = groups.data?.rows.find(g => g.id === form.group);
  const levels = getLevelsForSession(form.session, form.level);
  async function submit(e) {
    e.preventDefault();
    if (locked.current) return;
    if (step < 3) { setStep(x => x + 1); return; }
    locked.current = true;setSaving(true);setBusy(true);setError('');
    try {
      const intent = JSON.stringify(form);
      if (pending.current?.intent !== intent) {
        const payload = { lead_id: lead.id, expected_version: version, student_choice: form.choice,
          learner_name: form.name.trim(), birth_date: form.birth || null, session_type: form.session, school_year: form.year,
          ...(form.choice === 'new' ? { candidate_review: candidates.data?.review_token, confirm_new: form.confirmNew }
            : { student_id: form.student.id }),
          ...(form.enrollment ? { enrollment_id: form.enrollment.id, expected_enrollment_updated_at: form.enrollment.updated_at }
            : { level: form.level || null, group_id: form.group || null, initial_status: form.status, notes: form.notes || null }),
          ...(form.due ? { followup_at: casablancaInstant(form.due) } : {}) };
        pending.current = { ...retryKey(null, 'crm_start_enrollment', payload), payload, intent };
      }
      const saved = await crmRpc('crm_start_enrollment', { p_request_key: pending.current.key, p_data: pending.current.payload });
      setResult(saved);await refresh();
    } catch (err) {
      setError(commandError(err));
      if (err?.code === '40001') {
        pending.current = null;
        const latest = await crmRpc('crm_get_workspace_detail', { p_lead: lead.id }).catch(() => null);
        if (latest?.enrollment) { setResult({ lead: latest, enrollment: latest.enrollment }); }
        else {
          if (latest) setVersion(latest.version);
          await candidates.refetch();if (form.choice === 'existing') await enrollments.refetch();
          setForm(f => ({ ...f, choice: '', student: null, enrollment: null, confirmNew: false }));setStep(1);
        }
        await refresh();
      } else if (['22023', '42501'].includes(err?.code)) { pending.current = null;setStep(2); }
    } finally { locked.current = false;setSaving(false);setBusy(false); }
  }
  if (result) return <div className="space-y-4"><p role="status" className="font-semibold">{ENROLLMENT_STATUS[result.enrollment.status]}</p><p className="text-sm">{result.enrollment.student_name} · {PROGRAMS[result.enrollment.session_type]}</p><p className="text-sm text-slate-500">{result.lead.status === 'CONVERTED' ? 'La confirmation de l’inscription a été vérifiée. Le suivi commercial est terminé.' : 'Le prospect reste qualifié. La prochaine action permet de poursuivre son inscription.'}</p><Button onClick={onClose}>Terminé</Button></div>;
  return <form onSubmit={submit} className="space-y-4"><p className="text-xs font-semibold uppercase tracking-wider text-blue-800">{step} / 3 · {['Apprenant', 'Inscription', 'Vérification'][step - 1]}</p>
    <fieldset disabled={saving} className="space-y-4">
      {step === 1 && <><div className="rounded-lg bg-slate-50 p-3 text-sm"><p className="font-medium">{context.contact_name}</p><p>{context.phone}{context.email ? ` · ${context.email}` : ''}</p>{context.age != null && <p>Âge connu : {context.age} ans</p>}</div>
        <Field label="Nom de l’apprenant"><input className={input} required minLength={2} maxLength={120} value={form.name} onChange={e => { setForm(f => ({ ...f, name: e.target.value, choice: '', student: null, confirmNew: false, enrollment: null }));setOffset(0); }} /></Field>
        <Field label="Date de naissance (si connue)"><input className={input} type="date" value={form.birth} onChange={e => { setForm(f => ({ ...f, birth: e.target.value, choice: '', student: null, confirmNew: false, enrollment: null }));setOffset(0); }} /></Field>
        {form.name.trim().length >= 2 && <ReadState query={candidates} empty="Aucun apprenant existant trouvé."><div className="space-y-2">{candidates.data?.rows.map(s => <div key={s.id} className="rounded-lg border p-3 text-sm"><p className="text-xs text-slate-500">Apprenant existant possible</p><p className="font-semibold">{s.name}</p><p>{s.birth_date || 'Date de naissance non renseignée'}{s.group_name ? ` · ${s.group_name}` : ''}</p>{s.phone && <p className="text-slate-500">{s.phone}</p>}<Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => setForm(f => ({ ...f, choice: 'existing', student: s, enrollment: null }))}>{form.student?.id === s.id && form.choice === 'existing' ? 'Apprenant sélectionné' : 'Utiliser cet apprenant'}</Button></div>)}{!candidates.data?.total && <p className="text-sm text-slate-500">Aucun apprenant existant trouvé.</p>}</div></ReadState>}
        <Pager offset={offset} total={candidates.data?.total || 0} size={5} onChange={setOffset} />
        <Button type="button" variant="outline" disabled={!candidates.isSuccess} onClick={() => setForm(f => ({ ...f, choice: 'new', student: null, enrollment: null, confirmNew: false }))}>{form.choice === 'new' ? 'Nouvel apprenant sélectionné' : 'Créer un nouvel apprenant'}</Button>
        {form.choice === 'new' && candidates.data?.total > 0 && <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={form.confirmNew} onChange={e => set('confirmNew', e.target.checked)} />J’ai vérifié les correspondances : il s’agit d’un autre apprenant.</label>}
      </>}
      {step === 2 && <><p className="text-sm font-medium">{form.student?.name || form.name}</p>{context.program_interest && <p className="text-sm text-slate-500">Projet : {context.program_interest}</p>}{context.recommended_level && <p className="text-sm text-slate-500">Résultat du test : {context.recommended_level}. Choisissez un niveau compatible avec le programme.</p>}
        <div className="grid gap-3 sm:grid-cols-2"><Field label="Programme"><select className={input} value={form.session} onChange={e => { setForm(f => ({ ...f, session: e.target.value, level: '', group: '', enrollment: null }));setGroupOffset(0);setEnrollmentOffset(0); }}>{SESSION_TYPES.map(s => <option key={s} value={s}>{PROGRAMS[s]}</option>)}</select></Field><Field label="Année scolaire"><input className={input} required pattern="[0-9]{4}/[0-9]{4}" value={form.year} onChange={e => { setForm(f => ({ ...f, year: e.target.value, enrollment: null }));setEnrollmentOffset(0); }} /></Field></div>
        {form.choice === 'existing' && <ReadState query={enrollments}><div className="space-y-2">{enrollments.data?.rows.map(en => <div key={en.id} className="rounded-lg border p-3 text-sm"><p className="font-medium">{ENROLLMENT_STATUS[en.status]}</p><p>{en.school_year}{en.level ? ` · ${en.level}` : ''}{en.group_name ? ` · ${en.group_name}` : ''}</p><Button type="button" size="sm" variant="outline" className="mt-2" disabled={en.already_linked} onClick={() => set('enrollment', en)}>{en.already_linked ? 'Déjà rattachée à un prospect' : form.enrollment?.id === en.id ? 'Inscription sélectionnée' : 'Rattacher cette inscription'}</Button></div>)}{enrollments.data?.total > 0 && !form.enrollment && <p className="text-sm">Choisissez l’inscription existante pour éviter un doublon.</p>}</div></ReadState>}
        <Pager offset={enrollmentOffset} total={enrollments.data?.total || 0} size={5} onChange={setEnrollmentOffset} />
        {!form.enrollment && <><Field label="Niveau proposé"><select className={input} value={form.level} onChange={e => { setForm(f => ({ ...f, level: e.target.value, group: '' }));setGroupOffset(0); }}><option value="">À définir</option>{levels.map(l => <option key={l}>{l}</option>)}</select></Field>
          <Field label="Groupe"><select className={input} value={form.group} required={form.status === 'Trial'} onChange={e => { const g = groups.data?.rows.find(x => x.id === e.target.value);setForm(f => ({ ...f, group: e.target.value, level: g?.niveau || f.level })); }}><option value="">À affecter plus tard</option>{groups.data?.rows.filter(g => groupMatchesEnrollment(g, { session_type: form.session, level: form.level }, null)).map(g => <option key={g.id} value={g.id}>{g.name} · {g.niveau}</option>)}</select></Field>
          {groups.isError && <p role="alert" className="text-sm">Groupes indisponibles. <button type="button" onClick={() => groups.refetch()}>Réessayer</button></p>}<Pager offset={groupOffset} total={groups.data?.total || 0} size={50} onChange={setGroupOffset} />
          <Field label="Démarrage"><select className={input} value={form.status} onChange={e => set('status', e.target.value)}><option value="Submitted">Pré-inscription</option><option value="Trial">Essai (groupe requis)</option></select></Field>
          <Field label="Note (facultatif)"><textarea className={input} maxLength={2000} value={form.notes} onChange={e => set('notes', e.target.value)} /></Field>
        </>}
        {!['Confirmed', 'Validated'].includes(form.enrollment?.status) && <Field label="Prochain suivi · Casablanca (facultatif)"><input className={input} type="datetime-local" value={form.due} onChange={e => set('due', e.target.value)} /><span className="block text-xs text-slate-500">Par défaut : dans un jour, au prochain créneau d’appel autorisé. Un suivi d’inscription déjà prévu est conservé.</span></Field>}
      </>}
      {step === 3 && <div className="space-y-2 rounded-lg border p-4 text-sm"><p className="font-semibold">{form.student?.name || form.name}</p><p>{form.choice === 'new' ? 'Création d’un nouvel apprenant' : 'Utilisation de l’apprenant sélectionné'}</p><p>{PROGRAMS[form.session]} · {form.year}</p><p>{ENROLLMENT_STATUS[form.enrollment?.status || form.status]}</p>{(form.enrollment?.level || form.level) && <p>Niveau : {form.enrollment?.level || form.level}</p>}{selectedGroup && <p>{selectedGroup.name}</p>}<p className="pt-2 text-slate-500">{['Confirmed', 'Validated'].includes(form.enrollment?.status) ? 'Cette inscription est déjà confirmée. Son rattachement terminera le suivi commercial de ce prospect.' : 'La création ne confirme pas l’inscription. Le suivi se poursuit jusqu’à sa confirmation.'}</p></div>}
    </fieldset>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="ghost" disabled={saving} onClick={onClose}>Annuler</Button>{step > 1 && <Button type="button" variant="outline" disabled={saving} onClick={() => setStep(s => s - 1)}>Retour</Button>}<Button type="submit" disabled={saving || step === 1 && !validIdentity || step === 2 && !existingReady}>{saving ? 'Enregistrement…' : step === 3 ? form.enrollment ? 'Rattacher cette inscription' : form.status === 'Trial' ? 'Démarrer l’essai' : 'Créer la pré-inscription' : 'Continuer'}</Button></div>
  </form>;
}
export default function CrmEnrollmentDialog({ lead, onClose }) {
  const [busy, setBusy] = useState(false), returnFocus = useRef(typeof document !== 'undefined' ? document.activeElement : null);
  const context = useCrmRead('crm_get_enrollment_context', { p_lead: lead.id });
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-xl" onEscapeKeyDown={e => { if (busy) e.preventDefault(); }} onInteractOutside={e => { if (busy) e.preventDefault(); }} onCloseAutoFocus={e => { e.preventDefault();if (returnFocus.current?.isConnected) returnFocus.current.focus(); }}><DialogHeader><DialogTitle>Commencer l&apos;inscription</DialogTitle><DialogDescription>Choisissez l’apprenant, puis vérifiez son inscription.</DialogDescription></DialogHeader><ReadState query={context}>{context.data && <EnrollmentForm lead={lead} context={context.data} onClose={onClose} setBusy={setBusy} />}</ReadState></DialogContent></Dialog>;
}
