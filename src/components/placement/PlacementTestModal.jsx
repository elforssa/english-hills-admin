'use client';
import { useState, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { entities, integrations } from '@/lib/entities';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ALL_LEVELS, getLevelsForSession, groupMatchesSelection } from '@/lib/academicPrograms';
import { crmRpc, useCrmRefresh } from '@/lib/crm/queries';
import { retryKey, commandError } from '@/lib/crm/presentation.mjs';
const inputClass = "w-full border border-border rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-primary";
const labelClass = "block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1";

// Wraps the placement-test save with an outbound notification email when
// the test transitions into "Résultat saisi" or "Affecté" — the two states
// in which the student/parent can act on the outcome.
async function notifyPlacementResult({ before, after, students }) {
  const RESULT_STATES = new Set(['Résultat saisi', 'Affecté']);
  const justEnteredResultState =
    RESULT_STATES.has(after?.status) && !RESULT_STATES.has(before?.status);
  if (!justEnteredResultState) return false;

  const student = students.find(s => s.id === after.student_id);
  const recipients = [];
  if (student?.parent_email) recipients.push(student.parent_email);
  if (student?.email && student.email !== student?.parent_email) {
    recipients.push(student.email);
  }
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

export default function PlacementTestModal({ test, groups = [], students = [], crmLead, onSave, onClose }) {
  const { role } = useAuth();
  const booking = !!crmLead && !test?.id;
  const linked = booking || !!test?.is_crm || !!test?.crm_lead_id;
  const request = useRef(null), locked = useRef(false), returnFocus = useRef(typeof document !== 'undefined' ? document.activeElement : null);
  const refresh = useCrmRefresh();
  const [error, setError] = useState('');
  const [expected, setExpected] = useState({ lead: crmLead?.version, task: crmLead?.confirm_placement_task, updated: test?.updated_at });
  const [form, setForm] = useState({ student_id: '', student_name: '', date_test: new Date().toISOString().split('T')[0], heure: '', examinateur: '', score: '', niveau_recommande: 'A1', status: 'Planifié', notes: '', ...(linked ? { niveau_recommande: '', student_name: crmLead?.learner_name || test?.student_name || '' } : {}), ...test });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const selectedStudent = students.find(student => student.id === form.student_id);
  const availableLevels = selectedStudent
    ? getLevelsForSession(selectedStudent.session_type || 'Yearly', form.niveau_recommande)
    : ALL_LEVELS;
  const availableGroups = groups.filter(group => (
    !selectedStudent
    || groupMatchesSelection(group, selectedStudent.session_type || 'Yearly', form.niveau_recommande)
    || group.id === form.groupe_affecte_id
  ));

  const handleStudentChange = (id) => {
    const s = students.find(s => s.id === id);
    set('student_id', id);
    set('student_name', s?.full_name || '');
    if (s?.niveau_cefr) set('niveau_recommande', s.niveau_cefr);
    set('groupe_affecte_id', '');
  };
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (locked.current) return;
    locked.current = true;
    setSaving(true);
    setError('');
    const { crm_lead_id: ignoredLink, is_crm: ignoredFlag, scheduled_for: ignoredTime, ...fields } = form;
    const data = { ...fields, student_id: form.student_id || null, groupe_affecte_id: form.groupe_affecte_id || null, score: form.score !== '' ? parseFloat(form.score) : null };
    try {
      let saved;
      if (linked) {
        const command = booking ? 'crm_book_placement_test' : 'crm_update_placement_test';
        const intent = JSON.stringify(form);
        if (request.current?.intent !== intent) {
          const payload = { date_test: form.date_test, heure: form.heure, examinateur: form.examinateur || null, notes: form.notes || null,
            ...(booking ? { lead_id: crmLead.id, expected_version: expected.lead,
              ...(expected.task ? { task_id: expected.task.id, expected_task_version: expected.task.version } : {}) }
            : { placement_id: test.id, expected_updated_at: expected.updated, status: form.status, score: form.score === '' || form.score == null ? null : Number(form.score), niveau_recommande: form.niveau_recommande || null }) };
          request.current = { ...retryKey(null, command, payload), intent, command, payload };
        }
        const result = await crmRpc(request.current.command, { p_request_key: request.current.key, p_data: request.current.payload });
        saved = result.placement;
        await refresh();
      } else if (form.id) {
        saved = await entities.PlacementTest.update(form.id, data);
      } else {
        saved = await entities.PlacementTest.create(data);
      }

      // Fire notification email if the result/affectation was just published.
      let notified = false;
      try {
        notified = role !== 'receptionist' && await notifyPlacementResult({
          before: test || null,
          after: saved,
          students,
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[placement-tests] notification email failed:', err);
        // integrations.SendEmail already toasted; carry on.
      }

      toast.success((form.id ? 'Test mis à jour' : 'Test créé') + (notified ? ' — Email envoyé' : ''));
      onSave();
    } catch (err) {
      if (linked) {
        setError(commandError(err));
        if (err?.code === '40001') {
          const latest = await crmRpc(booking ? 'crm_get_workspace_detail' : 'crm_get_placement', booking ? { p_lead: crmLead.id } : { p_test: test.id }).catch(() => null);
          if (latest) setExpected({ lead: latest.version, task: latest.confirm_placement_task, updated: latest.updated_at });
          request.current = null;
          await refresh();
        } else if (['22023', '42501'].includes(err?.code)) request.current = null;
      }
      // Non-CRM entity errors are already toasted; preserve the form for retry.
    } finally {
      locked.current = false;
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent onCloseAutoFocus={e => { e.preventDefault(); if (returnFocus.current?.isConnected) returnFocus.current.focus(); }} onEscapeKeyDown={e => { if (saving) e.preventDefault(); }} onInteractOutside={e => { if (saving) e.preventDefault(); }} className="max-w-lg max-h-[calc(100vh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{booking ? 'Réserver un test de niveau' : form.id ? 'Modifier le test' : 'Nouveau test de niveau'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <fieldset disabled={saving} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
            {linked ? <p className="font-medium">{form.student_name}<span className="ml-2 text-xs font-normal text-muted-foreground">Prospect CRM</span></p> : <>
            <label className={labelClass}>Apprenant *</label>
            <select className={inputClass} value={form.student_id || ''} onChange={e => handleStudentChange(e.target.value)}>
              <option value="">— Choisir un apprenant ou saisir manuellement —</option>
              {students.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </select>
            {!form.student_id && (
              <input className={`${inputClass} mt-2`} placeholder="Ou saisir le nom manuellement..." value={form.student_name} onChange={e => set('student_name', e.target.value)} required={!form.student_id} />
            )}</>}
          </div>
            <div><label htmlFor="placement-date" className={labelClass}>Date *</label><input id="placement-date" type="date" className={inputClass} value={form.date_test} onChange={e => set('date_test', e.target.value)} required /></div>
            <div><label htmlFor="placement-time" className={labelClass}>Heure</label><input id="placement-time" required={linked} type="time" className={inputClass} value={form.heure || ''} onChange={e => set('heure', e.target.value)} /></div>
            <div><label htmlFor="placement-examiner" className={labelClass}>Examinateur</label><input id="placement-examiner" maxLength={linked ? 200 : undefined} className={inputClass} value={form.examinateur || ''} onChange={e => set('examinateur', e.target.value)} /></div>
            <>{!booking && <><div><label htmlFor="placement-status" className={labelClass}>Statut</label>
              <select id="placement-status" className={inputClass} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value, ...(linked && e.target.value === 'Planifié' ? { niveau_recommande: '', score: '' } : {}) }))}>
                {['Planifié','Passé','Résultat saisi','Affecté'].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div><label htmlFor="placement-score" className={labelClass}>Score</label><input id="placement-score" type="number" className={inputClass} value={form.score || ''} onChange={e => set('score', e.target.value)} min="0" max="100" /></div>
            <div><label htmlFor="placement-level" className={labelClass}>Niveau recommandé</label>
              <select id="placement-level" disabled={linked && form.status === 'Planifié'} required={linked && ['Résultat saisi', 'Affecté'].includes(form.status)} className={inputClass} value={form.niveau_recommande || ''} onChange={e => set('niveau_recommande', e.target.value)}>
                {linked && <option value="">— À renseigner après le test —</option>}{availableLevels.map(n => <option key={n}>{n}</option>)}
              </select>
            </div>
            </>}{!linked && <div className="sm:col-span-2"><label className={labelClass}>Groupe affecté</label>
              <select className={inputClass} value={form.groupe_affecte_id || ''} onChange={e => {
                const group = groups.find(item => item.id === e.target.value);
                setForm(f => ({ ...f, groupe_affecte_id: e.target.value, niveau_recommande: group?.niveau || f.niveau_recommande }));
              }}>
                <option value="">— Choisir —</option>
                {availableGroups.map(g => <option key={g.id} value={g.id}>{g.name} ({g.niveau})</option>)}
              </select>
            </div>
            }</><div className="sm:col-span-2"><label htmlFor="placement-notes" className={labelClass}>Notes</label><textarea id="placement-notes" maxLength={linked ? 4000 : undefined} className={`${inputClass} h-16 resize-none`} value={form.notes || ''} onChange={e => set('notes', e.target.value)} /></div>
          </fieldset>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" disabled={saving} onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={saving}>{saving ? '...' : 'Enregistrer'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
