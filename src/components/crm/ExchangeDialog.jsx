'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import FormField from '@/components/operational/FormField';
import { useCrmRead } from '@/lib/crm/queries';
import { isRecordConflict } from '@/lib/conflictErrors.mjs';
import { CALL_RESULTS, CLOSE_KINDS, EXCHANGE_CHANNELS, FAILED_CALL_RESULTS, attemptGapLabel, exchangeResults, nextActionPayload, phoneLinks } from '@/lib/crm/presentation.mjs';
import { STICKY_DIALOG } from './DialogStickyFooter';
import { FormFooter, NextActionPicker, control, useDirtyClose, useSeenAction } from './NextActionDialog';
import { useCrmCommand } from './useCrmCommand';

const AGREED = ['keep', 'center_visit', 'callback', 'our_step', 'awaiting', 'enrol', 'lost', 'not_qualified'];
const AFTER_WRONG_NUMBER = ['keep', 'callback', 'our_step', 'awaiting', 'not_qualified'];

// « Noter un échange »: channel, result, then — when « On a parlé » — what was agreed.
// A failed call keeps the next action (the server moves a call to its next slot).
export default function ExchangeDialog({ lead, initial = {}, onClose }) {
  const [channel, setChannel] = useState(initial.channel || 'phone');
  const [result, setResult] = useState(initial.result || '');
  const [note, setNote] = useState('');
  const [override, setOverride] = useState(false);
  const [form, setForm] = useState({});
  const hours = useCrmRead('crm_get_centre_hours', {});
  const { seen, stale, setStale, reload, check } = useSeenAction(lead);
  const command = useCrmCommand();
  const links = phoneLinks(lead.contact);
  const failedCall = channel === 'phone' && FAILED_CALL_RESULTS.includes(result);
  const gap = failedCall ? attemptGapLabel(check.data) : null;
  const picks = result === 'spoke' ? AGREED.filter(k => k !== 'keep' || seen.action) : result === 'wrong_number' ? AFTER_WRONG_NUMBER : null;
  const dirty = !!result && result !== initial.result || !!note || Object.keys(form).length > 0;
  const closer = useDirtyClose(dirty, command.busy, onClose);
  // An error clears when the selection changes.
  const choose = setter => value => { command.clearError(); setter(value); };
  useEffect(() => { if (isRecordConflict(command.error)) setStale(true); }, [command.error, setStale]);
  async function submit(event) {
    event.preventDefault();
    const saved = await command.run('crm_log_exchange', () => {
      if (!result) throw new Error('Choisissez le résultat de l’échange.');
      if (result === 'note' && !note.trim()) throw new Error('Précisez la note.');
      const next = picks ? nextActionPayload(result === 'wrong_number' && !form.kind ? { kind: 'keep' } : form, seen.action) : 'keep';
      return {
        lead_id: lead.id, expected_version: seen.version, channel, result,
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(next !== 'keep' ? { next } : {}),
        ...(failedCall && override ? { real_attempt_override: true } : {})
      };
    }, [lead.id, seen.version, channel, result, note, override, form]);
    if (saved) {
      toast.success(result === 'no_answer' ? 'Pas de réponse enregistré' : CLOSE_KINDS.includes(form.kind) && picks ? 'Prospect clôturé' : 'Échange enregistré');
      onClose();
    }
  }
  return <Dialog open onOpenChange={value => { if (!value) closer.request(); }}><DialogContent className={`operational ${STICKY_DIALOG} sm:max-w-[640px]`}>
    <DialogHeader><DialogTitle>Noter un échange</DialogTitle><DialogDescription>{lead.contact_name}{lead.learner_name ? ` · ${lead.learner_name}` : ''}</DialogDescription></DialogHeader>
    <form noValidate onSubmit={submit} className="space-y-4"><fieldset disabled={command.busy} className="space-y-4">
      <p className="text-sm">Action actuelle : <span className="font-medium">{seen.action?.label || 'Aucune'}</span></p>
      <div role="tablist" aria-label="Canal" className="flex flex-wrap gap-1">{Object.entries(EXCHANGE_CHANNELS).map(([key, label]) => <Button key={key} type="button" role="tab" aria-selected={channel === key} variant={channel === key ? 'default' : 'outline'} className="min-h-9" onClick={() => { choose(setChannel)(key); setResult(''); setForm({}); }}>{label}</Button>)}</div>
      {channel === 'phone' && <p className="break-all text-sm">{lead.phone || 'Téléphone à préciser'}{links.tel && <a className="ml-3 hidden font-medium text-blue-800 underline max-sm:[@media(pointer:coarse)]:inline" href={links.tel}>Appeler</a>}</p>}
      {channel === 'whatsapp' && <p className="break-all text-sm">WhatsApp : {links.whatsapp ? <a className="font-medium text-blue-800 underline" href={links.whatsapp} target="_blank" rel="noopener noreferrer">{`+${links.whatsapp.split('/').at(-1)}`}</a> : 'Indisponible'}</p>}
      <fieldset><legend className="text-sm font-medium">Résultat</legend><div className="mt-2 flex flex-wrap gap-1">{Object.entries(exchangeResults(channel)).map(([key, label]) => <label key={key} className="flex min-h-9 items-center gap-2 rounded-md border px-3 text-sm has-[:checked]:border-blue-600 has-[:checked]:bg-blue-50"><input type="radio" name="exchange-result" value={key} checked={result === key} onChange={() => { choose(setResult)(key); setForm({}); }} />{label}</label>)}</div></fieldset>
      {gap && <div className="rounded-md bg-amber-50 p-3 text-sm"><p>{gap}</p><label className="mt-2 flex min-h-9 items-center gap-2"><input type="checkbox" checked={override} onChange={e => choose(setOverride)(e.target.checked)} />Tentative réelle (hors délai)</label></div>}
      {picks && <div className="rounded-lg border bg-slate-50 p-4"><p className="mb-2 text-sm font-semibold">{result === 'spoke' ? 'Ce qui a été convenu' : 'Et ensuite ?'}</p>
        <NextActionPicker form={result === 'wrong_number' && !form.kind ? { ...form, kind: 'keep' } : form} setForm={choose(setForm)} current={seen.action} lead={lead} hours={hours.data} kinds={picks} /></div>}
      <FormField label={result === 'note' ? 'Note' : 'Note (facultative)'}><textarea className={`${control} min-h-20`} maxLength={4000} value={note} onChange={e => choose(setNote)(e.target.value)} /></FormField>
      {result && CALL_RESULTS[result] && channel === 'phone' && result !== 'spoke' && <p className="text-xs text-slate-500">Une erreur se corrige par un nouvel échange : l’historique des appels n’est jamais modifié.</p>}
    </fieldset><FormFooter error={isRecordConflict(command.error) ? null : command.error} stale={stale} busy={command.busy} onReload={reload} onCancel={closer.request} cancelLabel="Annuler" /></form>
    {closer.guard}
  </DialogContent></Dialog>;
}
