'use client';
import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { integrations } from '@/lib/entities';
import { getBrowserClient } from '@/lib/supabase';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ALL_LEVELS } from '@/lib/academicPrograms';
import { crmRpc, useCrmRefresh } from '@/lib/crm/queries';
import { retryKey, commandError, actionErrorMessage, placementStatusOptions } from '@/lib/crm/presentation.mjs';
import { isRecordConflict } from '@/lib/conflictErrors.mjs';
import DialogStickyFooter, { FOOTER_ALERT, STICKY_DIALOG } from '@/components/crm/DialogStickyFooter';
import { useDirtyClose } from '@/components/crm/NextActionDialog';
import { localBusinessDate } from '@/lib/receiptFinance';
import { hasCapability } from '@/lib/roleAccess.mjs';
import { displayStatus, levelsForTest, PLACEMENT_MESSAGES } from '@/lib/academic/placement.mjs';
const inputClass = "w-full border border-border rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-primary";
const labelClass = "block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1";

// The result e-mail, once, when a test first enters « Résultat saisi » or « Affecté » and
// the prospect already has a learner file with a family address.
async function notifyPlacementResult({ before, after }) {
  const RESULT_STATES = new Set(['Résultat saisi', 'Affecté']);
  if (!RESULT_STATES.has(after?.status) || RESULT_STATES.has(before?.status) || !after?.student_id) return false;
  const { data: student } = await getBrowserClient().from('students').select('full_name,parent_email,email').eq('id', after.student_id).maybeSingle();
  const recipients = [...new Set([student?.parent_email, student?.email].filter(Boolean))];
  if (recipients.length === 0) return false;
  await integrations.Core.SendEmail({
    to: recipients,
    subject: '[English Hills] Résultat de test de niveau',
    body:
      `Bonjour,\n\n` +
      `Le test de niveau de ${after.student_name || student?.full_name || ''} est disponible.\n\n` +
      `Niveau recommandé : ${after.niveau_recommande || '—'}\n` +
      (after.score != null ? `Score : ${after.score}\n` : '') +
      (after.notes ? `\nNotes de l'examinateur :\n${after.notes}\n` : '') +
      `\nVous serez contacté(e) pour la suite (affectation à un groupe).\n\n` +
      `— English Hills Language Center`,
  });
  return true;
}

// A prospect's level test (RWR-r5 §6.2): booked with its appointment and edited through
// the CRM commands only. A learner's own test is StudentTestDialog.
export default function PlacementTestModal({ test, crmLead, onSave, onClose }) {
  const { role } = useAuth();
  const booking = !!crmLead && !test?.id;
  const request = useRef(null), locked = useRef(false), returnFocus = useRef(typeof document !== 'undefined' ? document.activeElement : null);
  const refresh = useCrmRefresh();
  const [error, setError] = useState('');
  const [expected, setExpected] = useState({ lead: crmLead?.version, task: crmLead?.confirm_placement_task, updated: test?.updated_at });
  // NF-2: an edit sends the prospect version seen when the form opened. Opened
  // from the placement list there is no prospect in hand, so read it once.
  const needsLeadVersion = !booking && expected.lead == null;
  useEffect(() => {
    if (!needsLeadVersion || !test?.id) return undefined;
    let live = true;
    crmRpc('crm_get_placement', { p_test: test.id }).then(seen => { if (live && seen) setExpected(e => ({ ...e, lead: seen.lead_version, updated: e.updated ?? seen.updated_at })); else if (live) setError('Prospect lié indisponible. Rechargez la page.'); }).catch(() => { if (live) setError('Prospect lié indisponible. Rechargez la page.'); });
    return () => { live = false; };
  }, [needsLeadVersion, test?.id]);
  // No level pre-filled (§6.2): the level stays empty until the result.
  const [start] = useState(() => ({ date_test: localBusinessDate(), heure: '', examinateur: '', score: '', status: 'Planifié', notes: '', ...test, niveau_recommande: test?.niveau_recommande || '', student_name: crmLead?.learner_name || test?.student_name || '' }));
  const [form, setForm] = useState(start);
  const [saving, setSaving] = useState(false);
  const set = (k, v) => { setError(''); setForm(f => ({ ...f, [k]: v })); };
  const dirty = ['date_test', 'heure', 'examinateur', 'score', 'status', 'notes', 'niveau_recommande'].some(k => String(form[k] ?? '') !== String(start[k] ?? ''));
  const closer = useDirtyClose(dirty, saving, onClose);
  // Levels of the prospect's programme for its age when the prospect is in hand; the
  // server checks it in every case (placement.level_not_offered).
  const availableLevels = crmLead ? levelsForTest(crmLead.session_type, crmLead.learner_age, form.niveau_recommande) : ALL_LEVELS;
  const status = test?.id ? displayStatus(test) : 'Planifié';
  const resultStatus = ['Résultat saisi', 'Affecté'].includes(form.status);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (locked.current) return;
    if (!form.date_test) { setError('Choisissez la date du test.'); return; }
    if (!form.heure) { setError('Indiquez l’heure du test.'); return; }
    if (resultStatus && !form.niveau_recommande) { setError('Choisissez le niveau recommandé.'); return; }
    if (form.score !== '' && form.score != null && (Number.isNaN(Number(form.score)) || Number(form.score) < 0 || Number(form.score) > 100)) { setError('Le score est un nombre de 0 à 100.'); return; }
    locked.current = true;
    setSaving(true);
    setError('');
    try {
      const command = booking ? 'crm_book_placement_test' : 'crm_update_placement_test';
      const intent = JSON.stringify(form);
      if (request.current?.intent !== intent) {
        const payload = { date_test: form.date_test, heure: form.heure, examinateur: form.examinateur || null, notes: form.notes || null,
          ...(booking ? { lead_id: crmLead.id, expected_version: expected.lead,
            ...(expected.task ? { task_id: expected.task.id, expected_task_version: expected.task.version } : {}) }
          : { placement_id: test.id, expected_version: expected.lead, expected_updated_at: expected.updated, status: form.status, score: form.score === '' || form.score == null ? null : Number(form.score), niveau_recommande: form.niveau_recommande || null }) };
        request.current = { ...retryKey(null, command, payload), intent, command, payload };
      }
      const result = await crmRpc(request.current.command, { p_request_key: request.current.key, p_data: request.current.payload });
      const saved = result.placement;
      await refresh();
      let notified = false;
      try {
        notified = hasCapability(role, 'canEmailFamilies') && await notifyPlacementResult({ before: test || null, after: saved });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[placement-tests] notification email failed:', err);
      }
      toast.success((form.id ? 'Test mis à jour' : 'Test créé') + (notified ? ' — Email envoyé' : ''));
      onSave();
    } catch (err) {
      setError(PLACEMENT_MESSAGES[err?.hint] || (err?.hint === 'crm_placement.not_replannable' ? actionErrorMessage(err) : commandError(err)));
      if (isRecordConflict(err)) {
        const latest = await crmRpc(booking ? 'crm_get_workspace_detail' : 'crm_get_placement', booking ? { p_lead: crmLead.id } : { p_test: test.id }).catch(() => null);
        if (latest) setExpected({ lead: booking ? latest.version : latest.lead_version, task: latest.confirm_placement_task, updated: latest.updated_at });
        request.current = null;
        await refresh();
      } else if (['22023', '42501'].includes(err?.code)) request.current = null;
    } finally {
      locked.current = false;
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && closer.request()}>
      <DialogContent onCloseAutoFocus={e => { e.preventDefault(); if (returnFocus.current?.isConnected) returnFocus.current.focus(); }} onEscapeKeyDown={e => { e.preventDefault(); closer.request(); }} onInteractOutside={e => { e.preventDefault(); closer.request(); }} className={`max-w-lg ${STICKY_DIALOG}`}>
        <DialogHeader>
          <DialogTitle>{booking ? 'Réserver un test de niveau' : 'Modifier le test'}</DialogTitle>
        </DialogHeader>
        <form noValidate onSubmit={handleSubmit} className="space-y-4">
          <fieldset disabled={saving} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <p className="font-medium">{form.student_name}<span className="ml-2 text-xs font-normal text-muted-foreground">Prospect CRM</span>{test?.id && <span className="ml-2 text-xs font-normal text-muted-foreground">· {status}</span>}</p>
            </div>
            <div><label htmlFor="placement-date" className={labelClass}>Date</label><input id="placement-date" type="date" className={inputClass} value={form.date_test} onChange={e => set('date_test', e.target.value)} /></div>
            <div><label htmlFor="placement-time" className={labelClass}>Heure</label><input id="placement-time" type="time" className={inputClass} value={form.heure || ''} onChange={e => set('heure', e.target.value)} /></div>
            <div><label htmlFor="placement-examiner" className={labelClass}>Examinateur</label><input id="placement-examiner" maxLength={200} className={inputClass} value={form.examinateur || ''} onChange={e => set('examinateur', e.target.value)} /></div>
            {!booking && <><div><label htmlFor="placement-status" className={labelClass}>Statut</label>
              <select id="placement-status" className={inputClass} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value, ...(e.target.value === 'Planifié' ? { niveau_recommande: '', score: '' } : {}) }))}>
                {/* « Passé » is derived from the time (§6.2); a cancelled or absent test is never planned again. */}
                {placementStatusOptions(test).map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div><label htmlFor="placement-score" className={labelClass}>Score</label><input id="placement-score" inputMode="decimal" disabled={form.status === 'Planifié'} className={inputClass} value={form.score ?? ''} onChange={e => set('score', e.target.value)} /></div>
            <div><label htmlFor="placement-level" className={labelClass}>Niveau recommandé</label>
              <select id="placement-level" disabled={form.status === 'Planifié'} className={inputClass} value={form.niveau_recommande || ''} onChange={e => set('niveau_recommande', e.target.value)}>
                <option value="">— À renseigner après le test —</option>{availableLevels.map(n => <option key={n}>{n}</option>)}
              </select>
            </div>
            </>}
            <div className="sm:col-span-2"><label htmlFor="placement-notes" className={labelClass}>Notes</label><textarea id="placement-notes" maxLength={4000} className={`${inputClass} h-16 resize-none`} value={form.notes || ''} onChange={e => set('notes', e.target.value)} /></div>
          </fieldset>
          <DialogStickyFooter>
          {error && <p role="alert" className={`text-sm text-red-700 ${FOOTER_ALERT}`}>{error}</p>}
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" disabled={saving} onClick={closer.request}>Fermer</Button>
            <Button type="submit" disabled={saving || needsLeadVersion}>{saving ? '...' : 'Enregistrer'}</Button>
          </DialogFooter>
          </DialogStickyFooter>
        </form>
        {closer.guard}
      </DialogContent>
    </Dialog>
  );
}
