'use client';

import { useState } from 'react';
import { entities } from '@/lib/entities';
import { Phone, Mail, User, BookOpen, Clock, Calendar, Building2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { getLevelsForSession, groupMatchesEnrollment } from '@/lib/academicPrograms';

const enrollmentLabel = (status) => status === 'Confirmed' ? 'Inscrit — groupe à affecter' : status;

const inputClass = "w-full border border-border rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-primary";
const labelClass = "block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1";

export default function EnrollmentModal({ enrollment, students, groups, onSave, onClose, assignmentOnly = false }) {
  const [form, setForm] = useState(enrollment || { student_id: '', group_id: '', status: 'Submitted', date_inscription: new Date().toISOString().split('T')[0], notes: '' });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const selectedStudent = students.find(s => s.id === form.student_id);
  const selectedGroup = groups.find(g => g.id === form.group_id);
  const effectiveSession = form.session_type || selectedStudent?.session_type || 'Yearly';
  const availableGroups = groups.filter(group => (
    !selectedStudent
    || groupMatchesEnrollment(group, form, selectedStudent)
    || group.id === form.group_id
  ));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, student_id: form.student_id || null, group_id: form.group_id || null,
        status: form.status === 'Confirmed' && form.group_id ? 'Validated'
          : form.status === 'Validated' && !form.group_id ? 'Confirmed' : form.status };

      if (form.id) {
        await entities.Enrollment.update(form.id, assignmentOnly
          ? { group_id: payload.group_id, level: payload.level } : payload);
        toast.success('Mis à jour');
      } else {
        await entities.Enrollment.create(payload);
        toast.success('Inscription créée');
      }
      onSave();
    } catch {
      // entities.js already toasted — keep modal open for retry.
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[calc(100vh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{assignmentOnly ? 'Affecter un groupe' : form.id ? 'Modifier' : 'Nouvelle pré-inscription'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {(form.session_type || form.school_year) && <p className="rounded-lg bg-slate-50 p-3 text-sm font-medium">Session : {form.session_type || 'Non renseignée'} · Année : {form.school_year || 'Non renseignée'} · Niveau : {form.level || 'À définir'}</p>}
          <div>
            <label htmlFor="enrollment-student" className={labelClass}>Apprenant *</label>
            <select id="enrollment-student" className={inputClass} value={form.student_id} onChange={e => setForm(f => ({ ...f, student_id: e.target.value, group_id: '' }))} required disabled={Boolean(form.id)}>
              <option value="">— Choisir un apprenant —</option>
              {students.map(s => (
                <option key={s.id} value={s.id}>
                  {s.full_name}{s.telephone ? ` · ${s.telephone}` : ''}{s.age_category ? ` · ${s.age_category}` : ''}
                </option>
              ))}
            </select>
            {selectedStudent && (
              <div className="mt-2 p-2.5 bg-blue-50 rounded-md text-xs text-blue-800 space-y-1">
                {selectedStudent.telephone && <div className="flex items-center gap-1.5"><Phone size={12} className="shrink-0" /> {selectedStudent.telephone}</div>}
                {selectedStudent.email && <div className="flex items-center gap-1.5"><Mail size={12} className="shrink-0" /> {selectedStudent.email}</div>}
                {selectedStudent.age_category && <div className="flex items-center gap-1.5"><User size={12} className="shrink-0" /> {selectedStudent.age_category}</div>}
                {!form.session_type && <div className="flex items-center gap-1.5"><Calendar size={12} className="shrink-0" /> Session du dossier&nbsp;: {selectedStudent.session_type || 'Yearly'}</div>}
                {!form.session_type && selectedStudent.niveau_cefr && <div className="flex items-center gap-1.5"><BookOpen size={12} className="shrink-0" /> Niveau du dossier&nbsp;: {selectedStudent.niveau_cefr}</div>}
                <div className="text-blue-600 font-medium">Statut&nbsp;: {selectedStudent.status}</div>
              </div>
            )}
          </div>
          {selectedStudent && <div>
            <label htmlFor="enrollment-level" className={labelClass}>Niveau de cette inscription</label>
            <select id="enrollment-level" className={inputClass} value={form.level || ''} onChange={e => setForm(f => ({ ...f, level: e.target.value || null,
              group_id: e.target.value && selectedGroup?.niveau !== e.target.value ? '' : f.group_id }))}>
              <option value="">— À définir lors de l’affectation —</option>
              {getLevelsForSession(effectiveSession, form.level).map(level => <option key={level} value={level}>{level}</option>)}
            </select>
          </div>}
          <div>
            <label htmlFor="enrollment-group" className={labelClass}>Groupe</label>
            <select id="enrollment-group" className={inputClass} value={form.group_id || ''} onChange={e => {
              const group = groups.find(g => g.id === e.target.value);
              setForm(f => ({ ...f, group_id: e.target.value, level: group?.niveau || f.level || null }));
            }} required={assignmentOnly || form.status === 'Trial'}>
              <option value="">— Choisir un groupe —</option>
              {availableGroups.map(g => <option key={g.id} value={g.id}>{g.name} · {g.niveau}{g.horaire ? ` · ${g.horaire}` : ''}{g.jours ? ` (${g.jours})` : ''}</option>)}
            </select>
            {selectedStudent && <p className="text-xs text-muted-foreground mt-1">Groupes filtrés par session et niveau de cette inscription.</p>}
            {selectedGroup && (
              <div className="mt-2 p-2.5 bg-green-50 rounded-md text-xs text-green-800 space-y-1">
                {selectedGroup.horaire && <div className="flex items-center gap-1.5"><Clock size={12} className="shrink-0" /> {selectedGroup.horaire}</div>}
                {selectedGroup.jours && <div className="flex items-center gap-1.5"><Calendar size={12} className="shrink-0" /> {selectedGroup.jours}</div>}
                {selectedGroup.salle && <div className="flex items-center gap-1.5"><Building2 size={12} className="shrink-0" /> Salle&nbsp;: {selectedGroup.salle}</div>}
                {selectedGroup.capacite_max && <div className="flex items-center gap-1.5"><Users size={12} className="shrink-0" /> Capacité max&nbsp;: {selectedGroup.capacite_max}</div>}
              </div>
            )}
          </div>
          <div hidden={assignmentOnly}>
            <label htmlFor="enrollment-status" className={labelClass}>Statut</label>
            <select id="enrollment-status" className={inputClass} value={form.status} onChange={e => set('status', e.target.value)}>
              {['Submitted','Under Review','Confirmed','Validated','Rejected','Trial'].map(s => <option key={s} value={s}>{enrollmentLabel(s)}</option>)}
            </select>
          </div>
          <div hidden={assignmentOnly}>
            <label htmlFor="enrollment-date" className={labelClass}>Date</label>
            <input id="enrollment-date" type="date" className={inputClass} value={form.date_inscription || ''} onChange={e => set('date_inscription', e.target.value)} />
          </div>
          <div hidden={assignmentOnly}>
            <label htmlFor="enrollment-notes" className={labelClass}>Notes</label>
            <textarea id="enrollment-notes" className={`${inputClass} h-16 resize-none`} value={form.notes || ''} onChange={e => set('notes', e.target.value)} />
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={saving}>{saving ? '...' : 'Enregistrer'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

