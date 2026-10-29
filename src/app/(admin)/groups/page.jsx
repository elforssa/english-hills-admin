'use client';

import { currentSchoolYear, groupMemberIds, groupYear } from '@/lib/enrollmentWorkflow.mjs';
import { EGC_REASON_TEXT, groupDeleteErrorMessage, membershipErrorMessage } from '@/lib/academic/membershipActions.mjs';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getTeacherDirectory } from '@/lib/teacher-directory';
import ContextLink from '@/components/ContextLink';
import { entities, auth } from '@/lib/entities';
import { Plus, Edit, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ALL_LEVELS, SESSION_TYPES, getLevelsForSession, isOnlineSessionType } from '@/lib/academicPrograms';
import PersonLink from '@/components/PersonLink';
import { useAuth } from '@/context/AuthContext';
import { getBrowserClient } from '@/lib/supabase';
import { isRecordConflict, recordConflictMessage } from '@/lib/conflictErrors.mjs';
import { loadTeacherAcademicRows } from '@/lib/portal';
import { invalidateAfterLearnerSave } from '@/lib/cacheInvalidation.mjs';

const inputClass = "w-full border border-border rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-primary";
const labelClass = "block text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1";

// A populated group keeps its programme and level (ACA-1, D7-A): the selects are
// locked while it has learners, and the database refuses the change for every role.
const reassignFirst = 'Réaffectez les apprenants avant de changer le programme ou le niveau.';
function groupSaveErrorMessage(error) {
  // The reception command (096) refuses a populated group with its own English text.
  if (error?.code === '23514' && /Reassign learners/.test(error.message || '')) return EGC_REASON_TEXT.group_level_locked;
  return membershipErrorMessage(error);
}

function GroupModal({ group, teachers, onSave, onClose, receptionist, memberCount = 0 }) {
  const [form, setForm] = useState(group || { name: '', session_type: 'Yearly', niveau: 'Pre-Child', categorie: 'Enfants', teacher_id: '', salle: '', jours: '', horaire: '', capacite_max: 12, terme: 'Sept–Déc', annee: groupYear(currentSchoolYear()) });
  const levelLocked = Boolean(form.id) && memberCount > 0;
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  // An online group never carries a group teacher (migration 117): the teacher,
  // schedule and capacity are set on the online course page.
  const online = isOnlineSessionType(form.session_type);
  const changeSession = (sessionType) => {
    const [firstLevel] = getLevelsForSession(sessionType);
    setForm(f => ({
      ...f,
      session_type: sessionType,
      niveau: firstLevel,
      ...(sessionType === 'Adults' ? { categorie: 'Adultes' } : {}),
      ...(isOnlineSessionType(sessionType) ? { teacher_id: '', salle: '' } : {}),
    }));
  };
  const handleSubmit = async (e) => {
    e.preventDefault(); setSaving(true);
    const payload = { name: form.name, langue: form.langue || 'Anglais', session_type: form.session_type,
      niveau: form.niveau, teacher_id: online ? null : form.teacher_id || null, salle: online ? null : form.salle || null,
      jours: form.jours || null, horaire: form.horaire || null, capacite_max: form.capacite_max,
      terme: form.terme || null, annee: form.annee || null, categorie: form.categorie || null };
    if (levelLocked) { delete payload.session_type; delete payload.niveau; }
    const { error } = receptionist
      ? await getBrowserClient().rpc('save_receptionist_group', {
        p_group: form.id || crypto.randomUUID(), p_expected_updated_at: form.id ? form.updated_at : null,
        p_changes: payload,
      })
      : form.id ? await getBrowserClient().from('groups').update(payload).eq('id', form.id)
        : await getBrowserClient().from('groups').insert(payload);
    // Changed in the meantime (ADR-009): close and reload the list for review.
    if (error && isRecordConflict(error)) { toast.error(recordConflictMessage()); onSave(); return; }
    if (error) { toast.error(groupSaveErrorMessage(error)); setSaving(false); return; }
    toast.success(form.id ? 'Groupe mis à jour' : 'Groupe créé');
    onSave();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[calc(100vh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{form.id ? 'Modifier le groupe' : 'Nouveau groupe'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="col-span-2"><label className={labelClass}>Nom du groupe *</label><input className={inputClass} value={form.name} onChange={e => set('name', e.target.value)} required /></div>
            <div><label className={labelClass}>Session *</label>
              <select className={inputClass} value={form.session_type || 'Yearly'} onChange={e => changeSession(e.target.value)} required disabled={levelLocked}>
                {SESSION_TYPES.map(session => <option key={session}>{session}</option>)}
              </select>
            </div>
            <div><label className={labelClass}>Niveau</label>
              <select className={inputClass} value={form.niveau} onChange={e => set('niveau', e.target.value)} disabled={levelLocked}>
                {getLevelsForSession(form.session_type || 'Yearly', form.niveau).map(n => <option key={n}>{n}</option>)}
              </select>
            </div>
            {levelLocked && <p className="col-span-2 -mt-2 text-xs text-muted-foreground">{reassignFirst}</p>}
            <div><label className={labelClass}>Catégorie</label>
              <select className={inputClass} value={form.categorie} onChange={e => set('categorie', e.target.value)}>
                {['Enfants','Ados','Adultes','Business','Particulier','Préparation aux examens'].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            {online ? <p className="col-span-2 rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
              Cours en ligne : l’enseignant, l’horaire hebdomadaire et la capacité se règlent sur la fiche du cours en ligne
              {form.id ? <> (<ContextLink href={`/online/${form.id}`} className="underline">ouvrir la fiche</ContextLink>)</> : ' après la création du groupe'}.
            </p> : <>
            <div><label className={labelClass}>Enseignant *</label>
              <select className={inputClass} value={form.teacher_id || ''} onChange={e => set('teacher_id', e.target.value)} required>
                <option value="">— Choisir —</option>
                {teachers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
              </select>
            </div>
            <div><label className={labelClass}>Salle</label><input className={inputClass} value={form.salle || ''} onChange={e => set('salle', e.target.value)} /></div>
            <div><label className={labelClass}>Jours</label><input className={inputClass} placeholder="Lun, Mer, Ven" value={form.jours || ''} onChange={e => set('jours', e.target.value)} /></div>
            <div><label className={labelClass}>Horaire</label><input className={inputClass} placeholder="18h – 19h30" value={form.horaire || ''} onChange={e => set('horaire', e.target.value)} /></div>
            </>}
            <div><label className={labelClass}>Capacité max</label><input type="number" className={inputClass} value={form.capacite_max} onChange={e => set('capacite_max', parseInt(e.target.value))} /></div>
            <div><label className={labelClass}>Terme</label>
              <select className={inputClass} value={form.terme} onChange={e => set('terme', e.target.value)}>
                {['Sept–Déc','Jan–Mar','Avr–Juin','Été'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
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

export default function Groups() {
  const queryClient = useQueryClient();
  // N7: other screens' cached groups, learners and enrollments follow a group change.
  const invalidate = () => invalidateAfterLearnerSave(queryClient);
  const { role } = useAuth();
  const [groups, setGroups] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [filterTerme, setFilterTerme] = useState('');
  const [filterSession, setFilterSession] = useState('');
  const [filterLevel, setFilterLevel] = useState('');
  const [urlReady, setUrlReady] = useState(false);
  const [counts, setCounts] = useState({});

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setFilterSession(params.get('session') || '');
    setFilterLevel(params.get('level') || '');
    setFilterTerme(params.get('term') || '');
    setUrlReady(true);
  }, []);
  useEffect(() => {
    if (!urlReady) return;
    const params = new URLSearchParams();
    if (filterSession) params.set('session', filterSession);
    if (filterLevel) params.set('level', filterLevel);
    if (filterTerme) params.set('term', filterTerme);
    window.history.replaceState(window.history.state, '', `/groups${params.size ? `?${params}` : ''}`);
  }, [urlReady, filterSession, filterLevel, filterTerme]);

  // A teacher sees the groups assigned to them, counted from their class list;
  // the directory returns only their own row (plan PRF-r2 D7).
  const load = () => Promise.all([
    entities.Group.listAll('-created_date'),
    getTeacherDirectory(),
    role === 'teacher' ? loadTeacherAcademicRows() : Promise.all([
      entities.Student.listAll('full_name'),
      entities.Enrollment.listAll('-created_at'),
    ]).then(([students, enrollments]) => ({ students, enrollments })),
  ]).then(([allGroups, t, { students: s, enrollments: e }]) => {
    const g = role === 'teacher' ? allGroups.filter(group => group.teacher_id && group.teacher_id === t[0]?.id) : allGroups;
    setGroups(g);
    setTeachers(t);
    const c = {};
    g.forEach(group => { c[group.id] = groupMemberIds(s, e, group.id).size; });
    setCounts(c);
    setLoading(false);
  });

  // The role comes from AuthContext, resolved before render; teachers load their class list.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [role]);

  const handleDelete = async (id) => {
    if (!confirm('Supprimer ce groupe ?')) return;
    // A group with enrollment history (current or ended) cannot be deleted.
    const { error } = await getBrowserClient().from('groups').delete().eq('id', id);
    if (error) { toast.error(groupDeleteErrorMessage(error)); return; }
    toast.success('Groupe supprimé');
    invalidate();
    load();
  };

  const teacherName = (tid) => teachers.find(t => t.id === tid)?.full_name || '—';
  const filtered = groups.filter(g => (
    (!filterTerme || g.terme === filterTerme)
    && (!filterSession || (g.session_type || 'Yearly') === filterSession)
    && (!filterLevel || g.niveau === filterLevel)
  ));

  return (
    <div className="p-4 lg:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Groupes & niveaux</h1>
          <p className="text-muted-foreground text-sm mt-1">{groups.length} groupes</p>
        </div>
        {role !== 'teacher' && <Button onClick={() => setModal({})} className="self-start sm:self-auto">
          <Plus size={15} /> Nouveau groupe
        </Button>}
      </div>

      <div className="mb-5 flex flex-wrap gap-3">
        <select className="border border-border rounded-md px-3 py-2 text-sm bg-white" value={filterSession} onChange={e => { setFilterSession(e.target.value); setFilterLevel(''); }}>
          <option value="">Toutes les sessions</option>
          {SESSION_TYPES.map(session => <option key={session}>{session}</option>)}
        </select>
        <select className="border border-border rounded-md px-3 py-2 text-sm bg-white" value={filterLevel} onChange={e => setFilterLevel(e.target.value)}>
          <option value="">Tous les niveaux</option>
          {(filterSession ? getLevelsForSession(filterSession) : ALL_LEVELS).map(level => <option key={level}>{level}</option>)}
        </select>
        <select className="border border-border rounded-md px-3 py-2 text-sm bg-white" value={filterTerme} onChange={e => setFilterTerme(e.target.value)}>
          <option value="">Tous les termes</option>
          {['Sept–Déc','Jan–Mar','Avr–Juin','Été'].map(t => <option key={t}>{t}</option>)}
        </select>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {loading ? <div className="p-8 text-center text-muted-foreground text-sm">Chargement...</div> : (
          <>
            <div className="sm:hidden divide-y divide-border">
              {filtered.length === 0 && (
                <div className="p-8 text-center text-muted-foreground text-sm">
                  Aucun groupe.{' '}
                  {role !== 'teacher' && <button onClick={() => setModal({})} className="text-primary font-medium hover:underline">Créer le premier →</button>}
                </div>
              )}
              {filtered.map(g => (
                <div key={g.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <ContextLink href={`/groups/${g.id}`} className="font-semibold text-sm text-primary hover:underline">{g.name}</ContextLink>
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1"><Users size={11} /> {counts[g.id] || 0} apprenant{(counts[g.id] || 0) > 1 ? 's' : ''} · {g.session_type || 'Yearly'} · {g.categorie}</p>
                      <PersonLink kind="teacher" id={g.teacher_id} className="text-xs">{teacherName(g.teacher_id)}</PersonLink>
                      <p className="text-xs text-muted-foreground">{g.jours} {g.horaire} {g.salle ? `· ${g.salle}` : ''}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className="text-xs font-bold text-white px-2 py-0.5 rounded bg-primary">{g.niveau}</span>
                      <span className="text-xs text-muted-foreground">{g.terme}</span>
                    </div>
                  </div>
                  {role !== 'teacher' && <div className="flex gap-2 mt-3">
                    <button onClick={() => setModal(g)} className="p-1.5 rounded hover:bg-muted text-muted-foreground"><Edit size={15} /></button>
                    {role !== 'receptionist' && <button onClick={() => handleDelete(g.id)} className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600"><Trash2 size={15} /></button>}
                  </div>}
                </div>
              ))}
            </div>
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted border-b border-border">
                    {['Groupe','Apprenants','Session','Niveau','Catégorie','Enseignant','Horaire','Salle','Terme',''].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.length === 0 && (
                    <tr><td colSpan={10} className="px-4 py-8 text-center text-muted-foreground text-sm">
                      Aucun groupe.{' '}
                      {role !== 'teacher' && <button onClick={() => setModal({})} className="text-primary font-medium hover:underline">Créer le premier →</button>}
                    </td></tr>
                  )}
                  {filtered.map(g => (
                    <tr key={g.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">
                        <ContextLink href={`/groups/${g.id}`} className="text-primary hover:underline">{g.name}</ContextLink>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <span className="inline-flex items-center gap-1"><Users size={13} /> {counts[g.id] || 0}</span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{g.session_type || 'Yearly'}</td>
                      <td className="px-4 py-3"><span className="text-xs font-bold text-white px-2 py-0.5 rounded bg-primary">{g.niveau}</span></td>
                      <td className="px-4 py-3 text-muted-foreground">{g.categorie}</td>
                      <td className="px-4 py-3 text-muted-foreground"><PersonLink kind="teacher" id={g.teacher_id}>{teacherName(g.teacher_id)}</PersonLink></td>
                      <td className="px-4 py-3 text-muted-foreground">{g.jours} {g.horaire}</td>
                      <td className="px-4 py-3 text-muted-foreground">{g.salle || '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{g.terme}</td>
                      <td className="px-4 py-3">
                        {role !== 'teacher' && <div className="flex gap-2">
                          <button onClick={() => setModal(g)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"><Edit size={14} /></button>
                          {role !== 'receptionist' && <button onClick={() => handleDelete(g.id)} className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600"><Trash2 size={14} /></button>}
                        </div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
      {modal !== null && <GroupModal group={modal.id ? modal : null} teachers={teachers} receptionist={role === 'receptionist'}
        memberCount={modal.id ? counts[modal.id] || 0 : 0} onSave={() => { setModal(null); invalidate(); load(); }} onClose={() => setModal(null)} />}
    </div>
  );
}
