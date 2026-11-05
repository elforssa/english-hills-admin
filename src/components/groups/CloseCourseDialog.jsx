'use client';

// « Clôturer le cours » (plan CDC-r3, D3 and D8; director only). The preview gives the
// numbers; every paid enrollment without a group that matches the course needs an
// explicit choice before the close is enabled (Q14 = A). A conflict (PT409) reloads
// the preview, never replays the close (ADR-009).
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { getBrowserClient } from '@/lib/supabase';
import { isRecordConflict } from '@/lib/conflictErrors.mjs';
import { membershipErrorMessage } from '@/lib/academic/membershipActions.mjs';
import {
  UNPLACED_CHOICES, allUnplacedChosen, closeCourse, closeCourseMessage, closeCoursePreview, courseDatesLabel, courseMoney as money,
  unplacedLists,
} from '@/lib/academic/courseClose.mjs';

const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;

export default function CloseCourseDialog({ groupId, onClose, onClosed }) {
  const [preview, setPreview] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [choices, setChoices] = useState({});
  const [reason, setReason] = useState('Cours terminé');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoadError('');
    const { data, error } = await closeCoursePreview(getBrowserClient(), groupId);
    if (error) { setLoadError(membershipErrorMessage(error)); return; }
    setPreview(data);
    // Keep the choices of the rows still listed.
    setChoices(current => Object.fromEntries((data?.unplaced || [])
      .filter(row => current[row.enrollment_id]).map(row => [row.enrollment_id, current[row.enrollment_id]])));
  }, [groupId]);
  useEffect(() => { load(); }, [load]);

  const unplaced = preview?.unplaced || [];
  const ready = preview && !preview.closed_at && allUnplacedChosen(unplaced, choices) && reason.trim().length > 0
    && reason.trim().length <= 200 && (preview.empty || preview.finished);

  const submit = async (event) => {
    event.preventDefault();
    if (!ready) return;
    setSaving(true);
    const { attach, end } = unplacedLists(unplaced, choices);
    const { data, error } = await closeCourse(getBrowserClient(), {
      groupId, expectedCount: preview.live_count, reason: reason.trim(), attach, endUnplaced: end,
    });
    setSaving(false);
    if (error) {
      toast.error(membershipErrorMessage(error));
      if (isRecordConflict(error)) load();
      return;
    }
    toast.success(closeCourseMessage(data));
    onClosed?.(data);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[calc(100vh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Clôturer le cours{preview?.name ? ` « ${preview.name} »` : ''}</DialogTitle>
        </DialogHeader>
        {loadError && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{loadError}</p>}
        {!preview && !loadError && <p className="text-sm text-muted-foreground">Chargement…</p>}
        {preview && (
          <form onSubmit={submit} className="space-y-4 text-sm">
            <p className="text-muted-foreground">
              {[preview.session_type, preview.niveau, preview.school_year].filter(Boolean).join(' · ')}
              {courseDatesLabel(preview) ? ` · ${courseDatesLabel(preview)}` : ''}
            </p>
            {preview.closed_at && <p className="rounded-md border border-border bg-muted p-3">Ce cours est déjà clôturé.</p>}
            {!preview.closed_at && !preview.empty && !preview.finished && (
              <p role="alert" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
                Ce cours n’est pas terminé : il se clôture après sa date de fin. Pour l’arrêter plus tôt, avancez d’abord sa date de fin.
              </p>
            )}
            {preview.empty
              ? <p>Aucun apprenant dans ce cours : la clôture ne termine aucune inscription.</p>
              : <div className="space-y-1">
                <p><strong>{plural(preview.live_count, 'apprenant', 'apprenants')}</strong> : {preview.become_alumni} deviennent Ancien apprenant, {preview.stay_enrolled} restent Inscrits (autre inscription en cours).</p>
                {Number(preview.open_balance_count) > 0 && <p>{plural(Number(preview.open_balance_count), 'a un solde', 'ont un solde')} à payer ({money(preview.open_balance_total)}) : il reste dû.</p>}
              </div>}
            {Number(preview.charges_to_link?.count) > 0 && (
              <p>{plural(Number(preview.charges_to_link.count), 'solde partiellement payé sera rattaché', 'soldes partiellement payés seront rattachés')} à l’inscription terminée ({money(preview.charges_to_link.total)}).</p>
            )}
            {Number(preview.engagements?.count) > 0 && (
              <p>{plural(Number(preview.engagements.count), 'engagement sans paiement', 'engagements sans paiement')} (total {money(preview.engagements.total)}) restent ouverts : un paiement ultérieur créera une nouvelle inscription.</p>
            )}
            {Number(preview.next_session_deposits?.count) > 0 && (
              <p role="alert" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
                {plural(Number(preview.next_session_deposits.count), 'paiement reçu après la fin du cours est rattaché', 'paiements reçus après la fin du cours sont rattachés')} à une inscription qui se termine ({money(preview.next_session_deposits.total)}) : s’il s’agit d’un acompte pour la session suivante, utilisez ensuite « Rouvrir l’inscription » sur la fiche de l’apprenant.
              </p>
            )}
            {unplaced.length > 0 && (
              <fieldset className="space-y-2 rounded-md border border-border p-3">
                <legend className="px-1 font-semibold">Inscriptions payées sans groupe pour ce cours</legend>
                <p className="text-xs text-muted-foreground">Choisissez pour chacune avant de clôturer.</p>
                {unplaced.map(row => (
                  <div key={row.enrollment_id} className="rounded-md border border-border p-2" data-testid="unplaced-row">
                    <p className="font-medium">{row.full_name}
                      <span className="font-normal text-muted-foreground"> · {row.level || 'sans niveau'} · payé {money(row.paid_total)}
                        {row.has_other_live ? ' · autre inscription en cours' : ''}
                        {row.created_after_end || row.next_session_deposit ? ' · inscrit ou payé après la fin du cours (session suivante ?)' : ''}</span></p>
                    <div className="mt-1 flex flex-wrap gap-3" role="radiogroup" aria-label={`Choix pour ${row.full_name}`}>
                      {UNPLACED_CHOICES.map(choice => (
                        <label key={choice.value} className="inline-flex items-center gap-1.5">
                          <input type="radio" name={`unplaced-${row.enrollment_id}`} value={choice.value}
                            checked={choices[row.enrollment_id] === choice.value}
                            onChange={() => setChoices(current => ({ ...current, [row.enrollment_id]: choice.value }))} />
                          {choice.label}
                        </label>
                      ))}
                    </div>
                    {choices[row.enrollment_id] === 'attach' && <p className="mt-1 text-xs text-muted-foreground">{UNPLACED_CHOICES[0].note}</p>}
                  </div>
                ))}
              </fieldset>
            )}
            {!preview.empty && <p className="text-muted-foreground">Vérifiez que les présences sont saisies : après la clôture, la liste d’appel du cours n’est plus proposée.</p>}
            <div>
              <label htmlFor="close-course-reason" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Motif *</label>
              <input id="close-course-reason" required maxLength={200} value={reason} onChange={(event) => setReason(event.target.value)}
                className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
              <Button type="submit" disabled={!ready || saving}>{saving ? '…' : 'Clôturer le cours'}</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
