'use client';

import { useMemo, useState } from 'react';
import { entities, integrations } from '@/lib/entities';
import { openStoredFile } from '@/lib/storage';
import { toast } from 'sonner';
import { BookOpen, CalendarDays, CheckCircle2, Clock3, FileText, Upload } from 'lucide-react';
import { PREMIUM_HOMEWORK_STATUS_COLORS } from '@/lib/statusColors';

const STATUS = {
  Submitted: 'Envoyé à l’enseignant',
  Reviewed: 'Consulté par l’enseignant',
  Prepared: 'Enseignant prêt',
};

export default function PremiumHomeworkSubmitter({ student, sessions, memberships = [], submissions, onChanged }) {
  const today = new Date().toISOString().slice(0, 10);
  const sharedGroupIds = new Set(memberships
    .filter((membership) => membership.student_id === student?.id && membership.active)
    .map((membership) => membership.premium_group_id));
  const eligibleSessions = sessions
    .filter((session) => (
      session.student_id === student?.id || sharedGroupIds.has(session.premium_group_id)
    ) && session.status !== 'Cancelled' && session.scheduled_date >= today)
    .sort((a, b) => `${a.scheduled_date} ${a.start_time}`.localeCompare(`${b.scheduled_date} ${b.start_time}`));
  const submissionsBySession = useMemo(() => Object.fromEntries(submissions.map((item) => [item.premium_session_id, item])), [submissions]);
  const [selectedSessionId, setSelectedSessionId] = useState(eligibleSessions[0]?.id || '');
  const selectedSession = eligibleSessions.find((session) => session.id === selectedSessionId) || eligibleSessions[0];
  const existing = selectedSession ? submissionsBySession[selectedSession.id] : null;
  const [drafts, setDrafts] = useState({});
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);

  const draft = drafts[selectedSession?.id] || {
    title: existing?.title || '',
    student_note: existing?.student_note || '',
  };
  const setDraft = (key, value) => setDrafts((current) => ({
    ...current,
    [selectedSession.id]: { ...draft, [key]: value },
  }));

  const submit = async (event) => {
    event.preventDefault();
    if (!selectedSession || !draft.title.trim()) {
      toast.error('Choisissez une séance et donnez un titre à votre demande.');
      return;
    }
    setSaving(true);
    try {
      let fileFields = {};
      if (file) {
        const uploaded = await integrations.Core.UploadFile({
          file,
          purpose: 'premium_homework',
          studentId: student.id,
          premiumSessionId: selectedSession.id,
        });
        fileFields = { file_url: uploaded.file_url, file_name: uploaded.file_name };
      }
      const payload = {
        premium_session_id: selectedSession.id,
        student_id: student.id,
        teacher_id: selectedSession.teacher_id,
        title: draft.title.trim(),
        student_note: draft.student_note.trim() || null,
        ...fileFields,
      };
      const saved = existing
        ? await entities.PremiumHomework.update(existing.id, payload)
        : await entities.PremiumHomework.create(payload);
      setFile(null);
      onChanged(saved);
      toast.success('Votre demande a été envoyée à l’enseignant');
    } catch {
      // Upload/entity helpers already explain the error.
    } finally {
      setSaving(false);
    }
  };

  const openFile = async () => {
    try { await openStoredFile(existing.file_url); }
    catch { toast.error('Impossible d’ouvrir ce fichier.'); }
  };

  if (student?.plan_type !== 'Premium') return null;

  return (
    <section className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-start gap-3">
        <div className="rounded-xl bg-primary/10 p-2 text-primary"><BookOpen size={18} /></div>
        <div>
          <h2 className="font-bold">Préparer mon heure Premium</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Envoyez votre exercice, devoir ou sujet avant l’atelier partagé afin que l’enseignant puisse préparer votre besoin.</p>
        </div>
      </div>

      {eligibleSessions.length === 0 ? (
        <div className="p-6 text-center text-sm text-muted-foreground">Aucun atelier Premium à venir. L’administration doit d’abord vous affecter et générer le planning.</div>
      ) : (
        <form onSubmit={submit} className="p-5 space-y-4">
          <div>
            <label htmlFor="premium-homework-session" className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Séance concernée</label>
            <select id="premium-homework-session" className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm" value={selectedSession?.id || ''} onChange={(event) => { setSelectedSessionId(event.target.value); setFile(null); }}>
              {eligibleSessions.map((session) => <option key={session.id} value={session.id}>{session.scheduled_date} · {String(session.start_time).slice(0, 5)}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><CalendarDays size={13} /> {selectedSession?.scheduled_date}</span>
            <span className="inline-flex items-center gap-1.5"><Clock3 size={13} /> {String(selectedSession?.start_time || '').slice(0, 5)} · 60 minutes</span>
          </div>

          {existing && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-white border border-border px-3 py-2">
              <span className={`text-xs font-semibold px-2 py-1 rounded-full ${PREMIUM_HOMEWORK_STATUS_COLORS[existing.status] || PREMIUM_HOMEWORK_STATUS_COLORS.Submitted}`}>{STATUS[existing.status] || STATUS.Submitted}</span>
              {existing.file_url && <button type="button" onClick={openFile} className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"><FileText size={13} /> {existing.file_name || 'Fichier envoyé'}</button>}
              {existing.teacher_note && <p className="w-full text-xs text-emerald-800 mt-1">Note de l’enseignant : {existing.teacher_note}</p>}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Titre *</label>
            <input className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm" maxLength={160} placeholder="Ex. Préparation entretien en anglais" value={draft.title} onChange={(event) => setDraft('title', event.target.value)} required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Ce que vous souhaitez travailler</label>
            <textarea className="w-full min-h-24 resize-y rounded-lg border border-border bg-white px-3 py-2.5 text-sm" maxLength={4000} placeholder="Expliquez le point difficile, les questions ou l’objectif de la séance…" value={draft.student_note} onChange={(event) => setDraft('student_note', event.target.value)} />
          </div>
          <label className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-primary/30 bg-white px-4 py-3 cursor-pointer hover:bg-primary/5 focus-within:ring-2 focus-within:ring-primary">
            <span className="inline-flex items-center gap-2 text-sm font-medium"><Upload size={15} /> {file ? file.name : existing?.file_name || 'Ajouter un PDF ou une image (facultatif)'}</span>
            <span className="text-[10px] text-muted-foreground">MAX 10 MO</span>
            <input type="file" className="sr-only" accept="application/pdf,image/jpeg,image/png" onChange={(event) => setFile(event.target.files?.[0] || null)} />
          </label>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-xs text-muted-foreground">Vous pouvez mettre à jour votre demande tant que l’atelier n’a pas commencé.</p>
            <button disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-5 py-2.5 text-sm font-semibold disabled:opacity-50">
              <CheckCircle2 size={15} /> {saving ? 'Envoi…' : existing ? 'Mettre à jour' : 'Envoyer au professeur'}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
