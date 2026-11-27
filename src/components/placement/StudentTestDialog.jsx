'use client';
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { getBrowserClient } from '@/lib/supabase';
import { useClosedOnlineGroupIds } from '@/lib/queries';
import { isClosedCourse } from '@/lib/academic/courseClose.mjs';
import { integrations } from '@/lib/entities';
import { crmRpc } from '@/lib/crm/queries';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import DialogStickyFooter, { FOOTER_ALERT, STICKY_DIALOG } from '@/components/crm/DialogStickyFooter';
import { useDirtyClose } from '@/components/crm/NextActionDialog';
import { groupMatchesSelection } from '@/lib/academicPrograms';
import { hasCapability } from '@/lib/roleAccess.mjs';
import { programmeLabel } from '@/lib/ui/presentation.mjs';
import { ageOn } from '@/lib/academic/learnerRules.mjs';
import { defaultTestDate, displayStatus, levelsForTest, placementError, studentTestActions, testChanges } from '@/lib/academic/placement.mjs';
import { PLACEMENT_STATUS_COLORS } from '@/lib/statusColors';

const input = 'operational-control font-normal';
const label = 'mb-1 block text-sm font-medium';
const MODES = { move: 'Déplacer', result: 'Résultat', absent: 'Absent', cancel: 'Annuler le test' };

// The result e-mail to the family, once, when a learner's test first gets its result.
async function notifyResult(before, after, student) {
  const RESULT = ['Résultat saisi', 'Affecté'];
  if (!RESULT.includes(after?.status) || RESULT.includes(before?.status)) return false;
  const to = [...new Set([student?.parent_email, student?.email].filter(Boolean))];
  if (!to.length) return false;
  await integrations.Core.SendEmail({
    to, subject: '[English Hills] Résultat de test de niveau',
    body: `Bonjour,\n\nLe test de niveau de ${after.student_name || student?.full_name || ''} est disponible.\n\n`
      + `Niveau recommandé : ${after.niveau_recommande || '—'}\n` + (after.score != null ? `Score : ${after.score}\n` : '')
      + (after.notes ? `\nNotes de l'examinateur :\n${after.notes}\n` : '')
      + `\nVous serez contacté(e) pour la suite (affectation à un groupe).\n\n— English Hills Language Center`,
  });
  return true;
}

// RWR-r5 §6.2 (migration 141): a learner's own level test. `student` ({ id, name }) books a
// new one (book_student_placement_test); `testId` edits one (update_placement_test_result).
// A prospect's test is never edited here: it belongs to the prospect's appointment.
export default function StudentTestDialog({ student, testId, onClose, onSaved }) {
  const { user, role } = useAuth();
  const client = useQueryClient();
  const booking = !testId;
  const [bookingId] = useState(() => crypto.randomUUID());
  const [now] = useState(() => new Date());
  const data = useQuery({
    queryKey: ['placement', user?.id, role, 'student-test', testId || null, student?.id || null],
    enabled: !!user,
    retry: 1,
    queryFn: async () => {
      const sb = getBrowserClient();
      let test = null;
      if (testId) {
        const read = await sb.from('placement_tests').select('*').eq('id', testId).is('crm_lead_id', null).single();
        if (read.error) throw read.error;
        test = read.data;
      }
      const learnerId = test?.student_id || student?.id;
      const learner = learnerId ? await sb.from('students').select('id,full_name,session_type,niveau_cefr,date_naissance,parent_email,email').eq('id', learnerId).maybeSingle() : { data: null };
      if (learner.error) throw learner.error;
      return { test, learner: learner.data };
    },
  });
  const test = data.data?.test, learner = data.data?.learner;
  const actions = useMemo(() => (test ? studentTestActions(test, now) : null), [test, now]);
  const [mode, setMode] = useState(null);
  const [form, setForm] = useState(null);
  useEffect(() => {
    if (form || (testId && !test)) return;
    setForm(booking ? { date_test: defaultTestDate(now), heure: '', examinateur: '', notes: '' }
      : { date_test: test.date_test, heure: test.heure || '', examinateur: test.examinateur || '', notes: test.notes || '',
        status: test.status, score: test.score ?? '', niveau_recommande: test.niveau_recommande || '', groupe_affecte_id: test.groupe_affecte_id || '', cancel_reason: '' });
    if (!booking) setMode(actions.result ? 'result' : actions.move ? 'move' : actions.cancel ? 'cancel' : null);
  }, [booking, form, testId, test, actions, now]);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const set = (key, value) => { setError(''); setForm(old => ({ ...old, [key]: value })); };
  const dirty = !!form && (booking ? !!(form.heure || form.examinateur || form.notes) : Object.keys(testChanges(test, form)).length > 0);
  const closer = useDirtyClose(dirty, busy, onClose);

  const age = ageOn(learner?.date_naissance, form?.date_test || test?.date_test);
  const levels = levelsForTest(learner?.session_type, age, test?.niveau_recommande || '');
  // Groups are read only to assign one, for the chosen level, and bounded.
  // CDC (D4): a closed course is never offered (an in-person close sets closed_at; an online one closes its course).
  const closedOnline = useClosedOnlineGroupIds();
  const pickGroup = mode === 'result' && form?.status === 'Affecté' && !!form?.niveau_recommande;
  const groupRead = useQuery({
    queryKey: ['placement', user?.id, role, 'student-test-groups', form?.niveau_recommande || null, test?.groupe_affecte_id || null],
    enabled: !!user && pickGroup,
    queryFn: async () => {
      const read = await getBrowserClient().from('groups').select('id,name,session_type,niveau,closed_at')
        .or(`and(closed_at.is.null,niveau.eq."${form.niveau_recommande.replace(/"/g, '')}")${test?.groupe_affecte_id ? `,id.eq.${test.groupe_affecte_id}` : ''}`).order('name').limit(26);
      if (read.error) throw read.error;
      return read.data || [];
    },
  });
  const groups = (pickGroup ? groupRead.data || [] : []).filter(g => g.id === test?.groupe_affecte_id
    || (!isClosedCourse(g, closedOnline) && groupMatchesSelection(g, learner?.session_type || 'Yearly', form.niveau_recommande)));

  // The form a mode sends: only that mode's fields, plus the examiner and notes.
  function changes() {
    const base = { examinateur: form.examinateur, notes: form.notes };
    if (mode === 'move') return testChanges(test, { ...base, date_test: form.date_test, heure: form.heure });
    if (mode === 'absent') return testChanges(test, { ...base, status: 'Absent' });
    if (mode === 'cancel') return testChanges(test, { ...base, status: 'Annulé', cancel_reason: form.cancel_reason });
    if (mode === 'result') {
      const status = form.status === 'Affecté' ? 'Affecté' : 'Résultat saisi';
      return testChanges(test, { ...base, status, score: form.score, niveau_recommande: form.niveau_recommande, groupe_affecte_id: status === 'Affecté' ? form.groupe_affecte_id : test.groupe_affecte_id || '' });
    }
    return testChanges(test, base);
  }
  function check() {
    if (booking || mode === 'move') {
      if (!form.date_test) return 'Choisissez la date du test.';
      if (!form.heure) return 'Indiquez l’heure du test.';
    }
    if (mode === 'cancel' && !form.cancel_reason.trim()) return 'Indiquez le motif de l’annulation.';
    if (mode === 'result') {
      if (!form.niveau_recommande) return 'Choisissez le niveau recommandé.';
      if (form.score !== '' && (Number.isNaN(Number(form.score)) || Number(form.score) < 0 || Number(form.score) > 100)) return 'Le score est un nombre de 0 à 100.';
      if (form.status === 'Affecté' && !form.groupe_affecte_id) return 'Choisissez le groupe affecté.';
    }
    if (!booking && !Object.keys(changes()).length) return 'Aucun changement à enregistrer.';
    return '';
  }
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    const problem = check();
    if (problem) { setError(problem); return; }
    setBusy(true); setError('');
    try {
      let saved;
      if (booking) {
        saved = (await crmRpc('book_student_placement_test', { p_test: bookingId, p_data: {
          student_id: student.id, date_test: form.date_test, heure: form.heure,
          ...(form.examinateur.trim() ? { examinateur: form.examinateur.trim() } : {}), ...(form.notes.trim() ? { notes: form.notes.trim() } : {}) } })).placement;
      } else {
        saved = (await crmRpc('update_placement_test_result', { p_test: test.id, p_expected_updated_at: test.updated_at, p_changes: changes() })).placement;
      }
      let notified = false;
      try { notified = !booking && hasCapability(role, 'canEmailFamilies') && await notifyResult(test, saved, learner); }
      catch (err) { console.error('[placement-tests] notification email failed:', err); } // eslint-disable-line no-console
      toast.success((booking ? 'Test planifié' : 'Test mis à jour') + (notified ? ' — e-mail envoyé' : ''));
      await client.invalidateQueries({ queryKey: ['placement'] });
      onSaved?.(saved);
    } catch (err) {
      setError(placementError(err));
      // Changed in the meantime (ADR-009): reload the test and rebuild the form from it,
      // so nothing typed on the old version is sent again without review.
      if (err?.code === 'PT409') { await data.refetch(); setForm(null); }
    } finally { setBusy(false); }
  }

  const ready = !!form && (booking || !!test);
  const status = test ? displayStatus(test, now) : 'Planifié';
  return <Dialog open onOpenChange={open => { if (!open) closer.request(); }}>
    <DialogContent data-testid="student-test-dialog" className={`operational max-w-lg ${STICKY_DIALOG}`} onEscapeKeyDown={e => { e.preventDefault(); closer.request(); }} onInteractOutside={e => { e.preventDefault(); closer.request(); }}>
      <DialogHeader>
        <DialogTitle>{booking ? 'Planifier un test de niveau' : 'Test de niveau'}</DialogTitle>
        <DialogDescription>{learner?.full_name || student?.name || test?.student_name || 'Apprenant'}{learner?.session_type ? ` · ${programmeLabel(learner.session_type)}` : ''}{age != null ? ` · ${age} ans` : ''}</DialogDescription>
      </DialogHeader>
      {!ready ? <div role="status" className="text-sm">{data.isError ? <>Test indisponible. <Button variant="outline" onClick={() => data.refetch()}>Réessayer</Button></> : 'Chargement…'}</div>
        : <form noValidate onSubmit={submit} className="space-y-4">
          {!booking && <p className="text-sm">Test du {test.date_test}{test.heure ? ` à ${test.heure}` : ''} · <span data-testid="test-status" className={`rounded-full px-2 py-0.5 text-xs font-medium ${PLACEMENT_STATUS_COLORS[status] || 'bg-slate-100 text-slate-700'}`}>{status}</span>{test.cancel_reason ? ` · ${test.cancel_reason}` : ''}</p>}
          {!booking && <div role="radiogroup" aria-label="Que faire ?" className="flex flex-wrap gap-2">{Object.entries(MODES).filter(([key]) => actions[key]).map(([key, text]) =>
            <Button key={key} type="button" role="radio" aria-checked={mode === key} variant={mode === key ? 'secondary' : 'outline'} className="min-h-11" onClick={() => { setError(''); setMode(key); }}>{text}</Button>)}
            {!Object.values(actions).some(Boolean) && <p className="text-sm text-slate-600">Ce test est terminé : planifiez-en un nouveau si besoin.</p>}
          </div>}
          <fieldset disabled={busy} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {(booking || mode === 'move') && <>
              <div><label htmlFor="test-date" className={label}>Date</label><input id="test-date" type="date" className={input} value={form.date_test} onChange={e => set('date_test', e.target.value)} /></div>
              <div><label htmlFor="test-time" className={label}>Heure</label><input id="test-time" type="time" className={input} value={form.heure} onChange={e => set('heure', e.target.value)} /></div>
            </>}
            {mode === 'result' && <>
              <div><label htmlFor="test-level" className={label}>Niveau recommandé</label>
                <select id="test-level" className={input} value={form.niveau_recommande} onChange={e => { set('niveau_recommande', e.target.value); set('groupe_affecte_id', ''); }}>
                  <option value="">— Choisir —</option>{levels.map(level => <option key={level}>{level}</option>)}
                </select>
                {!levels.length && <p className="mt-1 text-xs text-amber-800">Aucun niveau du programme ne correspond à l’âge de l’apprenant : corrigez sa fiche.</p>}</div>
              <div><label htmlFor="test-score" className={label}>Score (facultatif)</label><input id="test-score" inputMode="decimal" className={input} value={form.score} onChange={e => set('score', e.target.value)} /></div>
              <div className="sm:col-span-2"><label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={form.status === 'Affecté'} onChange={e => set('status', e.target.checked ? 'Affecté' : 'Résultat saisi')} />Affecter à un groupe</label></div>
              {form.status === 'Affecté' && <div className="sm:col-span-2"><label htmlFor="test-group" className={label}>Groupe</label>
                <select id="test-group" className={input} value={form.groupe_affecte_id} onChange={e => set('groupe_affecte_id', e.target.value)}>
                  <option value="">— Choisir —</option>{groups.map(g => <option key={g.id} value={g.id}>{g.name} ({g.niveau})</option>)}
                </select></div>}
            </>}
            {mode === 'cancel' && <div className="sm:col-span-2"><label htmlFor="test-cancel-reason" className={label}>Motif de l’annulation</label><textarea id="test-cancel-reason" maxLength={500} className={`${input} h-16`} value={form.cancel_reason} onChange={e => set('cancel_reason', e.target.value)} /></div>}
            {mode === 'absent' && <p className="text-sm sm:col-span-2">L’apprenant ne s’est pas présenté. Le test ne pourra plus recevoir de résultat ; planifiez-en un nouveau si besoin.</p>}
            {(booking || mode) && <>
              <div className="sm:col-span-2"><label htmlFor="test-examiner" className={label}>Examinateur (facultatif)</label><input id="test-examiner" maxLength={200} className={input} value={form.examinateur} onChange={e => set('examinateur', e.target.value)} /></div>
              <div className="sm:col-span-2"><label htmlFor="test-notes" className={label}>Notes (facultatif)</label><textarea id="test-notes" maxLength={4000} className={`${input} h-16`} value={form.notes} onChange={e => set('notes', e.target.value)} /></div>
            </>}
          </fieldset>
          <DialogStickyFooter>
            {error && <p role="alert" className={`rounded-md bg-red-50 p-3 text-sm text-red-800 ${FOOTER_ALERT}`}>{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" disabled={busy} onClick={closer.request}>Fermer</Button>
              {(booking || mode) && <Button type="submit" disabled={busy}>{busy ? 'Enregistrement…' : booking ? 'Planifier le test' : mode === 'cancel' ? 'Annuler le test' : mode === 'absent' ? 'Noter absent' : 'Enregistrer'}</Button>}
            </div>
          </DialogStickyFooter>
        </form>}
      {closer.guard}
    </DialogContent>
  </Dialog>;
}
