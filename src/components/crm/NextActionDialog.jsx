'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import FormField from '@/components/operational/FormField';
import { useCrmRead } from '@/lib/crm/queries';
import { centreDate, centreDateTimeInput } from '@/lib/centreClock.mjs';
import { isRecordConflict } from '@/lib/conflictErrors.mjs';
import { CLOSE_KINDS, LOST, NEXT_KINDS, NOT_QUALIFIED, OUR_STEP_PRESETS, REMINDER_PRESETS, STALE_MESSAGE, actionErrorMessage, firstSlotDate, nextActionPayload, prefillFromAction, replaceRules, slotTimes } from '@/lib/crm/presentation.mjs';
import DialogStickyFooter, { FOOTER_ALERT, STICKY_DIALOG } from './DialogStickyFooter';
import { useCrmCommand } from './useCrmCommand';

export const control = 'operational-control font-normal';
const KIND_HELP = {
  center_visit: 'Date et heure convenues avec le contact, dans les horaires d’ouverture.',
  callback: 'Heure exacte convenue avec le contact, dans les horaires d’appel. Elle ne sera jamais déplacée.',
  our_step: 'Envoyer le prix, confirmer un groupe… L’heure est choisie par le calendrier de suivi.',
  reminder: 'Rappel pour l’équipe : aucune heure n’a été promise au contact.',
  awaiting: 'Le contact doit revenir vers nous. Relance par défaut dans 5 jours.',
  enrol: 'Prochaine action : « Finaliser l’inscription », demain.'
};

// The picker of « Noter un échange » (what was agreed) and « Changer » (what comes next).
// `suggestDate` (the create form) proposes the first day with a free slot for an appointment;
// the time is always chosen by the user.
export function NextActionPicker({ form, setForm, current, kinds, lead, hours, labels = NEXT_KINDS, suggestDate = false }) {
  const set = (key, value) => setForm(old => ({ ...old, [key]: value }));
  const kind = form.kind;
  const today = centreDate();
  const now = centreDateTimeInput();
  const slots = slotTimes(hours, kind === 'center_visit' ? 'opening' : 'calling', form.date, { now: { date: today, time: now.slice(11) }, keep: form.time });
  const rules = replaceRules(current, kind);
  // A new date keeps the chosen time when that slot exists on the new day; before the
  // hours have loaded it is kept as is (the server still refuses a time outside them).
  const changeDate = date => setForm(old => ({ ...old, date, time: old.time && !hours ? old.time : old.time && slotTimes(hours, old.kind === 'center_visit' ? 'opening' : 'calling', date, { now: { date: today, time: now.slice(11) }, keep: old.time }).includes(old.time) ? old.time : '' }));
  const dateField = (label, required = true, help) => <FormField label={label} help={help}><input type="date" className={control} min={today} required={required} value={form.date || ''} onChange={e => changeDate(e.target.value)} /></FormField>;
  const timeField = () => <FormField label="Heure" help={form.date && !slots.length ? 'Aucun créneau ce jour-là (centre fermé ou journée passée).' : 'Créneaux selon les horaires du centre.'}>
    <select className={control} required disabled={!form.date || !slots.length} value={form.time || ''} onChange={e => set('time', e.target.value)}><option value="">Choisir…</option>{slots.map(t => <option key={t} value={t}>{t}</option>)}</select></FormField>;
  return <div className="space-y-3">
    <fieldset><legend className="text-sm font-medium">Prochaine action</legend>
      <div className="mt-2 grid gap-1 sm:grid-cols-2">{kinds.map(key => <label key={key} className="flex min-h-9 items-center gap-2 rounded-md border px-3 text-sm has-[:checked]:border-blue-600 has-[:checked]:bg-blue-50">
        <input type="radio" name="next-kind" value={key} checked={kind === key} onChange={() => setForm(old => ({ ...old, kind: key, reason: '', time: '', ...(suggestDate && !old.date && ['center_visit', 'callback'].includes(key) ? { date: firstSlotDate(hours, key === 'center_visit' ? 'opening' : 'calling', today, { date: today, time: now.slice(11) }) } : {}) }))} />{labels[key]}</label>)}</div>
    </fieldset>
    {KIND_HELP[kind] && <p className="text-xs text-slate-600">{KIND_HELP[kind]}</p>}
    {(kind === 'center_visit' || kind === 'callback') && <div className="grid gap-3 sm:grid-cols-2">{dateField('Date')}{timeField()}</div>}
    {kind === 'center_visit' && <label className="flex min-h-9 items-center gap-2 text-sm"><input type="checkbox" checked={!!form.withTest} onChange={e => set('withTest', e.target.checked)} />Avec test de niveau</label>}
    {(kind === 'our_step' || kind === 'reminder') && <FormField label="Quand"><select className={control} value={form.preset || ''} onChange={e => set('preset', e.target.value)}><option value="">Choisir…</option>{Object.entries(kind === 'our_step' ? OUR_STEP_PRESETS : REMINDER_PRESETS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}{kind === 'our_step' && <option value="date">À une date précise</option>}</select></FormField>}
    {kind === 'our_step' && form.preset === 'date' && dateField('Date')}
    {kind === 'awaiting' && <>{!form.noRelance && dateField('Relancer le', false, 'Facultatif : sans date, la relance est prévue dans 5 jours.')}<label className="flex min-h-9 items-center gap-2 text-sm"><input type="checkbox" checked={!!form.noRelance} onChange={e => set('noRelance', e.target.checked)} />Sans date de relance</label></>}
    {CLOSE_KINDS.includes(kind) && <><FormField label="Motif"><select className={control} required value={form.reason || ''} onChange={e => set('reason', e.target.value)}><option value="">Choisir…</option>{Object.entries(kind === 'lost' ? LOST : NOT_QUALIFIED).map(([value, label]) => <option key={value} value={value} disabled={value === 'unreachable' && !lead?.unreachable_eligible}>{label}</option>)}</select></FormField>
      <FormField label={form.reason === 'other' ? 'Précisez le motif' : 'Précision (facultatif)'}><input className={control} maxLength={500} value={form.closeNote || ''} onChange={e => set('closeNote', e.target.value)} /></FormField></>}
    {kind && !CLOSE_KINDS.includes(kind) && !['enrol', 'keep', 'none'].includes(kind) && <FormField label="Précisions (facultatif)"><input className={control} maxLength={4000} value={form.instructions || ''} onChange={e => set('instructions', e.target.value)} /></FormField>}
    {current && kind && kind !== 'keep' && <div className="rounded-md bg-amber-50 p-3 text-sm">
      <p>{CLOSE_KINDS.includes(kind) ? 'Annule' : 'Remplace'} : {current.label}</p>
      {rules.confirmAppointment && <label className="mt-2 flex min-h-9 items-center gap-2 font-medium"><input type="checkbox" checked={!!form.replaceConfirmed} onChange={e => set('replaceConfirmed', e.target.checked)} />Remplace le rendez-vous</label>}
      {rules.enrollmentReason && <FormField label="Pourquoi l’inscription n’est plus à finaliser ?"><input className={control} maxLength={500} value={form.cancelEnrollmentReason || ''} onChange={e => set('cancelEnrollmentReason', e.target.value)} /></FormField>}
    </div>}
  </div>;
}

// Escape or a click outside on a changed form asks before discarding it.
// Built on the same Dialog primitive as its parent: AlertDialog bundles an older focus
// scope, and two unrelated focus traps re-focus each other forever.
export function DiscardGuard({ open, onKeep, onDiscard }) {
  return <Dialog open={open} onOpenChange={value => { if (!value) onKeep(); }}><DialogContent role="alertdialog" className="sm:max-w-[440px]"><DialogHeader><DialogTitle>Abandonner la saisie ?</DialogTitle>
    <DialogDescription>Les informations saisies ne seront pas enregistrées.</DialogDescription></DialogHeader>
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="outline" onClick={onKeep}>Continuer la saisie</Button><Button type="button" onClick={onDiscard}>Abandonner</Button></div></DialogContent></Dialog>;
}

// The version and action the user is looking at. On PT409 the draft stays, the save
// is disabled, and « Recharger » shows the new current action before it re-enables.
export function useSeenAction(lead) {
  const [seen, setSeen] = useState({ version: lead.version, action: lead.next_action || null });
  const [stale, setStale] = useState(false);
  const check = useCrmRead('crm_check_action', { p_lead: lead.id });
  async function reload() {
    const fresh = await check.refetch();
    if (fresh.data) { setSeen({ version: fresh.data.version, action: fresh.data.next_action || null }); setStale(false); }
  }
  return { seen, stale, setStale, reload, check };
}

export function FormFooter({ error, stale, busy, onReload, onCancel, submitLabel = 'Enregistrer', cancelLabel = 'Garder l’action actuelle' }) {
  return <DialogStickyFooter>
    {stale ? <div role="alert" className={`rounded-md bg-amber-50 p-3 text-sm text-amber-900 ${FOOTER_ALERT}`}><p>{STALE_MESSAGE}</p><Button type="button" size="sm" variant="outline" className="mt-2" onClick={onReload}>Recharger</Button></div>
      : error && <p role="alert" className={`rounded-md bg-red-50 p-3 text-sm text-red-800 ${FOOTER_ALERT}`}>{actionErrorMessage(error)}</p>}
    <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onCancel}>{cancelLabel}</Button><Button type="submit" disabled={busy || stale}>{busy ? 'Enregistrement…' : submitLabel}</Button></div>
  </DialogStickyFooter>;
}

// Closing returns focus to the control that opened the dialog (E2/E4), as CrmActionDialog does.
export function useReturnFocus() {
  const origin = useRef(typeof document !== 'undefined' ? document.activeElement : null);
  return event => { if (origin.current?.isConnected) { event.preventDefault(); origin.current.focus(); } };
}

export function useDirtyClose(dirty, busy, onClose) {
  const [asking, setAsking] = useState(false);
  const request = () => { if (busy) return; if (dirty) setAsking(true); else onClose(); };
  return { request, guard: <DiscardGuard open={asking} onKeep={() => setAsking(false)} onDiscard={() => { setAsking(false); onClose(); }} /> };
}

// « Changer la prochaine action »: the picker, « Remplace : … », and « Garder
// l’action actuelle » as the escape.
export default function NextActionDialog({ lead, onClose }) {
  const [initial] = useState(() => prefillFromAction(lead.next_action));
  const [form, setForm] = useState(initial);
  const hours = useCrmRead('crm_get_centre_hours', {});
  const { seen, stale, setStale, reload } = useSeenAction(lead);
  const command = useCrmCommand();
  const returnFocus = useReturnFocus();
  const dirty = JSON.stringify(form) !== JSON.stringify(initial) && Object.values(form).some(v => v !== '' && v !== undefined && v !== false);
  const closer = useDirtyClose(dirty, command.busy, onClose);
  const update = value => { command.clearError(); setForm(value); };
  async function submit(event) {
    event.preventDefault();
    const saved = await command.run('crm_change_next_action', () => ({
      lead_id: lead.id, expected_version: seen.version, expected_action_id: seen.action?.id ?? null,
      next: nextActionPayload(form, seen.action)
    }), [lead.id, seen.version, seen.action?.id, form]);
    if (saved) { toast.success(CLOSE_KINDS.includes(form.kind) ? 'Prospect clôturé' : 'Prochaine action enregistrée'); onClose(); }
  }
  const failed = command.error;
  useEffect(() => { if (isRecordConflict(failed)) setStale(true); }, [failed, setStale]);
  return <Dialog open onOpenChange={value => { if (!value) closer.request(); }}><DialogContent onCloseAutoFocus={returnFocus} className={`operational ${STICKY_DIALOG} sm:max-w-[600px]`}>
    <DialogHeader><DialogTitle>Changer la prochaine action</DialogTitle><DialogDescription>{lead.contact_name}{lead.learner_name ? ` · ${lead.learner_name}` : ''}</DialogDescription></DialogHeader>
    <form noValidate onSubmit={submit} className="space-y-4"><fieldset disabled={command.busy} className="space-y-4">
      <NextActionPicker form={form} setForm={update} current={seen.action} lead={lead} hours={hours.data}
        kinds={['center_visit', 'callback', 'our_step', 'reminder', 'awaiting', 'lost', 'not_qualified']} />
    </fieldset><FormFooter error={isRecordConflict(failed) ? null : failed} stale={stale} busy={command.busy} onReload={reload} onCancel={closer.request} /></form>
    {closer.guard}
  </DialogContent></Dialog>;
}
