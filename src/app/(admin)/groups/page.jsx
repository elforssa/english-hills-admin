'use client';

import { currentSchoolYear, groupMemberIds, groupYear, isSchoolYear } from '@/lib/enrollmentWorkflow.mjs';
import { EGC_REASON_TEXT, groupDeleteErrorMessage, membershipErrorMessage } from '@/lib/academic/membershipActions.mjs';
import {
  GROUP_VIEWS, courseDatesError, courseDatesLabel, courseDatesRequired, courseEndedSuffix, fetchClosedOnlineGroupIds,
  formatCourseDate, isClosedCourse, listCoursesToClose, oneToOneGroupName,
} from '@/lib/academic/courseClose.mjs';
import CloseCourseDialog from '@/components/groups/CloseCourseDialog';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getTeacherDirectory } from '@/lib/teacher-directory';
import ContextLink from '@/components/ContextLink';
import { entities, auth } from '@/lib/entities';
import { Plus, Edit, Trash2, Users, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ALL_LEVELS, SESSION_TYPES, getLevelsForSession, isOnlineSessionType } from '@/lib/academicPrograms';
import PersonLink from '@/components/PersonLink';
import ProgrammePill from '@/components/operational/ProgrammePill';
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
  // The year is edited as 2026/2027 and stored as 2026-2027 (D-H5a: a new group
  // proposes the school year of today's centre date).
  const [form, setForm] = useState(() => {
    const initial = group || { name: '', session_type: 'Yearly', niveau: 'Pre-Child', categorie: 'Enfants', teacher_id: '', salle: '', jours: '', horaire: '', capacite_max: 12, terme: 'Sept–Déc', annee: groupYear(currentSchoolYear()), date_debut: '', date_fin: '' };
    return { ...initial, school_year: (initial.annee || '').replace('-', '/'), date_debut: initial.date_debut || '', date_fin: initial.date_fin || '' };
  });
  const levelLocked = Boolean(form.id) && memberCount > 0;
  // CDC (128, D4): a closed course keeps its dates, year, programme, level and capacity until reopened.
  const closed = Boolean(group?.closed_at);
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  // An online group never carries a group teacher (migration 117): the teacher,
  // schedule and capacity are set on the online course page.
  const online = isOnlineSessionType(form.session_type);
  // CDC (Q4 = A): an in-person One-to-One is a course of one with a neutral name (OA3).
  const oneToOne = form.session_type === 'One-to-One';
  const proposedName = (f) => oneToOneGroupName(f.niveau, f.date_debut);
  const withProposal = (before, after) => (after.session_type === 'One-to-One' && (!before.name || before.name === proposedName(before))
    ? { ...after, name: proposedName(after) } : after);
  const setCourse = (k, v) => setForm(f => withProposal(f, { ...f, [k]: v }));
  const changeSession = (sessionType) => {
    const [firstLevel] = getLevelsForSession(sessionType);
    setForm(f => withProposal(f, {
      ...f,
      session_type: sessionType,
      niveau: firstLevel,
      ...(sessionType === 'Adults' ? { categorie: 'Adultes' } : {}),
      ...(sessionType === 'One-to-One' ? { capacite_max: 1, categorie: 'Particulier' } : {}),
      ...(isOnlineSessionType(sessionType) ? { teacher_id: '', salle: '', date_debut: '', date_fin: '' } : {}),
    }));
  };
  const handleSubmit = async (e) => {
    e.preventDefault();
    // H5: the same rule as the database (two consecutive years).
    if (!isSchoolYear(form.school_year.trim())) {
      toast.error('Année scolaire invalide : utilisez le format 2026/2027 (deux années consécutives).');
      return;
    }
    // CDC (D1): the course dates, as the database checks them.
    const datesError = courseDatesError({ sessionType: form.session_type, schoolYear: form.school_year.trim(),
      dateDebut: form.date_debut, dateFin: form.date_fin });
    if (datesError) { toast.error(datesError); return; }
    setSaving(true);
    const payload = { name: form.name, langue: form.langue || 'Anglais', session_type: form.session_type,
      niveau: form.niveau, teacher_id: online ? null : form.teacher_id || null, salle: online ? null : form.salle || null,
      jours: form.jours || null, horaire: form.horaire || null, capacite_max: oneToOne ? 1 : form.capacite_max,
      terme: form.terme || null, annee: groupYear(form.school_year.trim()) || null, categorie: form.categorie || null,
      date_debut: online ? null : form.date_debut || null, date_fin: online ? null : form.date_fin || null };
    if (levelLocked) { delete payload.session_type; delete payload.niveau; }
    if (closed) for (const key of ['session_type', 'niveau', 'capacite_max', 'annee', 'date_debut', 'date_fin']) delete payload[key];
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
            {closed && <p className="col-span-2 rounded-md border border-border bg-muted p-3 text-sm">
              <Lock size={13} className="mr-1 inline" /> Cours clôturé : les dates, l’année, le programme, le niveau et la capacité ne changent plus. Rouvrez le cours pour les modifier.
            </p>}
            <div className="col-span-2"><label htmlFor="group-name" className={labelClass}>Nom du groupe *</label><input id="group-name" className={inputClass} value={form.name} onChange={e => set('name', e.target.value)} required />
              {/* OA3: a group name never contains a learner's name. */}
              <p className="mt-1 text-xs text-muted-foreground">N’indiquez jamais le nom d’un apprenant dans le nom du groupe.</p></div>
            <div><label className={labelClass}>Session *</label>
              <select className={inputClass} value={form.session_type || 'Yearly'} onChange={e => changeSession(e.target.value)} required disabled={levelLocked || closed}>
                {SESSION_TYPES.map(session => <option key={session}>{session}</option>)}
              </select>
            </div>
            <div><label className={labelClass}>Niveau</label>
              <select className={inputClass} value={form.niveau} onChange={e => setCourse('niveau', e.target.value)} disabled={levelLocked || closed}>
                {getLevelsForSession(form.session_type || 'Yearly', form.niveau).map(n => <option key={n}>{n}</option>)}
              </select>
            </div>
            {levelLocked && <p className="col-span-2 -mt-2 text-xs text-muted-foreground">{reassignFirst}</p>}
            {/* CDC (D1, Q1 = A): course dates, required for the short programmes. */}
            {!online && <>
              <div><label htmlFor="group-date-debut" className={labelClass}>Date de début{courseDatesRequired(form.session_type) ? ' *' : ''}</label>
                <input id="group-date-debut" type="date" className={inputClass} value={form.date_debut} disabled={closed}
                  required={courseDatesRequired(form.session_type)} onChange={e => setCourse('date_debut', e.target.value)} /></div>
              <div><label htmlFor="group-date-fin" className={labelClass}>Date de fin{courseDatesRequired(form.session_type) ? ' *' : ''}</label>
                <input id="group-date-fin" type="date" className={inputClass} value={form.date_fin} disabled={closed}
                  required={courseDatesRequired(form.session_type)} onChange={e => set('date_fin', e.target.value)} /></div>
              <p className="col-span-2 -mt-2 text-xs text-muted-foreground">
                {courseDatesRequired(form.session_type)
                  ? 'Obligatoires pour ce programme. Entre le 1er juin et le 31 août de l’année scolaire du groupe. Le cours apparaît « à clôturer » après sa date de fin.'
                  : 'Facultatives (Annuel : « Clôturer l’année » le termine). Entre le 1er juin et le 31 août de l’année scolaire du groupe.'}
                {oneToOne ? ' Cours individuel : la date de fin est la fin prévue du forfait, repoussable tant que le cours est ouvert.' : ''}
              </p>
            </>}
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
            <div><label htmlFor="group-capacity" className={labelClass}>Capacité max</label><input id="group-capacity" type="number" className={inputClass} value={oneToOne ? 1 : form.capacite_max} disabled={oneToOne || closed} onChange={e => set('capacite_max', parseInt(e.target.value))} />
              {oneToOne && <p className="mt-1 text-xs text-muted-foreground">Un cours individuel a une capacité de 1.</p>}</div>
            <div><label className={labelClass}>Terme</label>
              <select className={inputClass} value={form.terme} onChange={e => set('terme', e.target.value)}>
                {['Sept–Déc','Jan–Mar','Avr–Juin','Été'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            {/* H5: the school year (1 September to 31 August); placement checks it. */}
            <div><label htmlFor="group-school-year" className={labelClass}>Année scolaire *</label>
              <input id="group-school-year" required className={inputClass} placeholder="2026/2027" pattern="[0-9]{4}/[0-9]{4}"
                value={form.school_year} disabled={closed} onChange={e => set('school_year', e.target.value)} />
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
  // CDC (D8): « En cours » (default), « À clôturer » (director) and « Clôturés ».
  const [view, setView] = useState('en-cours');
  const [closedOnline, setClosedOnline] = useState(() => new Set());
  const [toClose, setToClose] = useState([]);
  const [closeTarget, setCloseTarget] = useState(null);
  const director = role === 'director';
  const views = GROUP_VIEWS.filter(v => v.value !== 'a-cloturer' || director);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setFilterSession(params.get('session') || '');
    setFilterLevel(params.get('level') || '');
    setFilterTerme(params.get('term') || '');
    setView(GROUP_VIEWS.some(v => v.value === params.get('vue')) ? params.get('vue') : 'en-cours');
    setUrlReady(true);
  }, []);
  useEffect(() => {
    if (!urlReady) return;
    const params = new URLSearchParams();
    if (view !== 'en-cours') params.set('vue', view);
    if (filterSession) params.set('session', filterSession);
    if (filterLevel) params.set('level', filterLevel);
    if (filterTerme) params.set('term', filterTerme);
    window.history.replaceState(window.history.state, '', `/groups${params.size ? `?${params}` : ''}`);
  }, [urlReady, view, filterSession, filterLevel, filterTerme]);

  // A teacher sees the groups assigned to them, counted from their class list;
  // the directory returns only their own row (plan PRF-r2 D7).
  const load = () => Promise.all([
    entities.Group.listAll('-created_date'),
    getTeacherDirectory(),
    role === 'teacher' ? loadTeacherAcademicRows() : Promise.all([
      entities.Student.listAll('full_name'),
      entities.Enrollment.listAll('-created_at'),
    ]).then(([students, enrollments]) => ({ students, enrollments })),
    role === 'teacher' ? Promise.resolve(new Set()) : fetchClosedOnlineGroupIds(getBrowserClient()),
    // D2/D7: the finished-course list is the director's only.
    role === 'director' ? listCoursesToClose(getBrowserClient()).then(({ data, error }) => {
      if (error) toast.error(membershipErrorMessage(error));
      return data || [];
    }) : Promise.resolve([]),
  ]).then(([allGroups, t, { students: s, enrollments: e }, closedOnlineIds, finished]) => {
    const g = role === 'teacher' ? allGroups.filter(group => group.teacher_id && group.teacher_id === t[0]?.id) : allGroups;
    setGroups(g);
    setTeachers(t);
    setClosedOnline(closedOnlineIds);
    setToClose(finished);
    const c = {};
    g.forEach(group => { c[group.id] = groupMemberIds(s, e, group.id).size; });
    setCounts(c);
    setLoading(false);
  });

  // The role comes from AuthContext, resolved before render; teachers load their class list.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [role]);

  const handleDelete = async (group) => {
    if (!confirm('Supprimer ce groupe ?')) return;
    // A group with enrollment history (current or ended) cannot be deleted.
    const { error } = await getBrowserClient().from('groups').delete().eq('id', group.id);
    if (error) { toast.error(groupDeleteErrorMessage(error, group)); return; }
    toast.success('Groupe supprimé');
    invalidate();
    load();
  };

  const teacherName = (tid) => teachers.find(t => t.id === tid)?.full_name || '—';
  const finishedById = new Map(toClose.map(row => [row.group_id, row]));
  const inView = (g) => view === 'a-cloturer' ? finishedById.has(g.id)
    : view === 'clotures' ? isClosedCourse(g, closedOnline) : !isClosedCourse(g, closedOnline);
  const filtered = groups.filter(g => (
    inView(g)
    && (!filterTerme || g.terme === filterTerme)
    && (!filterSession || (g.session_type || 'Yearly') === filterSession)
    && (!filterLevel || g.niveau === filterLevel)
  ));
  const datesOf = (g) => {
    if (g.closed_at) return `${courseDatesLabel(g) || 'Sans dates'} · clôturé le ${formatCourseDate(g.closed_at)}`;
    const finished = finishedById.get(g.id);
    if (finished?.kind === 'online') return `Terme terminé le ${formatCourseDate(finished.date_fin)}`;
    return (courseDatesLabel(g) || '—') + courseEndedSuffix(g);
  };
  // OA2: the director closes a finished course, or an empty in-person group at any time.
  const closeAction = (g, compact = false) => {
    if (!director || isClosedCourse(g, closedOnline)) return null;
    const finished = finishedById.get(g.id);
    if (finished?.kind === 'online' || (isOnlineSessionType(g.session_type) && finished)) {
      return <ContextLink href={`/online/${g.id}`} className="text-xs font-semibold text-primary hover:underline">Ouvrir le cours en ligne</ContextLink>;
    }
    if (isOnlineSessionType(g.session_type)) return null;
    if (!finished && (counts[g.id] || 0) > 0) return null;
    return <button type="button" onClick={() => setCloseTarget(g.id)} className={`${compact ? '' : 'whitespace-nowrap '}text-xs font-semibold text-primary hover:underline`}>
      {finished && !finished.empty ? 'Clôturer le cours' : 'Clôturer'}</button>;
  };

  return (
    <div className="p-4 lg:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Groupes & niveaux</h1>
          <p className="text-muted-foreground text-sm mt-1">{filtered.length} groupe{filtered.length > 1 ? 's' : ''}{view === 'a-cloturer' ? ' à clôturer' : view === 'clotures' ? ' clôturés' : ' en cours'}</p>
        </div>
        {role !== 'teacher' && <Button onClick={() => setModal({})} className="self-start sm:self-auto">
          <Plus size={15} /> Nouveau groupe
        </Button>}
      </div>

      <div className="mb-5 flex flex-wrap gap-3">
        <select aria-label="Vue des groupes" className="border border-border rounded-md px-3 py-2 text-sm bg-white" value={view} onChange={e => setView(e.target.value)}>
          {views.map(v => <option key={v.value} value={v.value}>{v.label}{v.value === 'a-cloturer' && toClose.length ? ` (${toClose.length})` : ''}</option>)}
        </select>
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
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1"><Users size={11} /> {counts[g.id] || 0} apprenant{(counts[g.id] || 0) > 1 ? 's' : ''} · <ProgrammePill sessionType={g.session_type || 'Yearly'} /> · {g.categorie}</p>
                      <PersonLink kind="teacher" id={g.teacher_id} className="text-xs">{teacherName(g.teacher_id)}</PersonLink>
                      <p className="text-xs text-muted-foreground">{g.jours} {g.horaire} {g.salle ? `· ${g.salle}` : ''}</p>
                      <p className="text-xs text-muted-foreground">{datesOf(g)}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className="inline-block whitespace-nowrap rounded-full px-2 py-1 text-xs font-bold text-white bg-primary">{g.niveau}</span>
                      <span className="text-xs text-muted-foreground">{g.terme}</span>
                    </div>
                  </div>
                  {role !== 'teacher' && <div className="flex items-center gap-2 mt-3">
                    <button onClick={() => setModal(g)} className="p-1.5 rounded hover:bg-muted text-muted-foreground"><Edit size={15} /></button>
                    {role !== 'receptionist' && <button onClick={() => handleDelete(g)} className="p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600"><Trash2 size={15} /></button>}
                    {closeAction(g, true)}
                  </div>}
                </div>
              ))}
            </div>
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted border-b border-border">
                    {['Groupe','Apprenants','Session','Niveau','Dates','Catégorie','Enseignant','Horaire','Salle','Terme',''].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.length === 0 && (
                    <tr><td colSpan={11} className="px-4 py-8 text-center text-muted-foreground text-sm">
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
                      <td className="px-4 py-3 text-muted-foreground"><ProgrammePill sessionType={g.session_type || 'Yearly'} /></td>
                      <td className="px-4 py-3"><span className="inline-block whitespace-nowrap rounded-full px-2 py-1 text-xs font-bold text-white bg-primary">{g.niveau}</span></td>
                      <td className="px-4 py-3 text-muted-foreground">{datesOf(g)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{g.categorie}</td>
                      <td className="px-4 py-3 text-muted-foreground"><PersonLink kind="teacher" id={g.teacher_id}>{teacherName(g.teacher_id)}</PersonLink></td>
                      <td className="px-4 py-3 text-muted-foreground">{g.jours} {g.horaire}</td>
                      <td className="px-4 py-3 text-muted-foreground">{g.salle || '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{g.terme}</td>
                      <td className="px-4 py-3">
                        {role !== 'teacher' && <div className="flex items-center gap-2">
                          <button onClick={() => setModal(g)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"><Edit size={14} /></button>
                          {role !== 'receptionist' && <button onClick={() => handleDelete(g)} className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600"><Trash2 size={14} /></button>}
                          {closeAction(g)}
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
      {closeTarget && <CloseCourseDialog groupId={closeTarget} onClose={() => setCloseTarget(null)}
        onClosed={() => { setCloseTarget(null); invalidate(); load(); }} />}
    </div>
  );
}
