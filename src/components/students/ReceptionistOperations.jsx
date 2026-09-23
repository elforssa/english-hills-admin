'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { entities, auth } from '@/lib/entities';
import { getBrowserClient } from '@/lib/supabase';
import EnrollmentModal from './EnrollmentModal';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

// These operational views intentionally do not fetch receipts, financial
// summaries, HR, academic assessments or storage assets.
export function ReceptionistStudents() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    setResult(null); setError(false);
    const timer = setTimeout(() => {
      getBrowserClient().from('students')
        .select('id,full_name,telephone,status,session_type,niveau_cefr', { count: 'exact' })
        .ilike('full_name', `%${search}%`).order('full_name').order('id').range((page - 1) * 20, page * 20 - 1)
        .then(({ data, count, error }) => { if (active) { setError(Boolean(error)); setResult({ rows: data || [], count }); } });
    }, 150);
    return () => { active = false; clearTimeout(timer); };
  }, [search, page]);
  return <main className="mx-auto max-w-5xl p-4 lg:p-8 space-y-5">
    <h1 className="text-2xl font-bold">Apprenants</h1>
    <label className="block">Rechercher un apprenant
      <input className="mt-2 block w-full rounded-md border p-2" value={search} maxLength={120}
        onChange={e => { setSearch(e.target.value); setPage(1); }} />
    </label>
    {error ? <p role="alert">Impossible de charger les apprenants. Réessayez la recherche.</p>
      : !result ? <p role="status">Chargement…</p>
      : <><ul className="divide-y rounded-lg border bg-card">{result.rows.map(s => <li key={s.id} className="p-4">
        <Link className="font-semibold text-primary underline" href={`/students/${s.id}`}>{s.full_name}</Link>
        <p className="text-sm text-muted-foreground">{s.telephone || '—'} · {s.status} · {s.session_type || '—'} · {s.niveau_cefr || '—'}</p>
      </li>)}</ul>{!result.rows.length && <p>Aucun apprenant trouvé.</p>}
      <div className="flex items-center gap-3"><Button variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Précédent</Button>
        <span>Page {page}</span><Button variant="outline" disabled={page * 20 >= result.count} onClick={() => setPage(p => p + 1)}>Suivant</Button></div></>}
  </main>;
}

export function ReceptionistStudentDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const [modal, setModal] = useState(null);
  useEffect(() => {
    let active = true; setData(null); setError(false);
    Promise.all([entities.Student.filter({ id }), entities.Enrollment.filterAll({ student_id: id }), entities.Group.listAll('name')])
      .then(([students, enrollments, groups]) => { if (active) setData({ student: students[0], enrollments, groups }); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [id, revision]);
  if (error) return <main className="p-8" role="alert">Impossible de charger la fiche. <Button onClick={() => setRevision(v => v + 1)}>Réessayer</Button></main>;
  if (!data) return <p className="p-8" role="status">Chargement…</p>;
  if (!data.student) return <main className="p-8">Apprenant introuvable. <Link href="/students">Retour aux apprenants</Link></main>;
  const { student, enrollments, groups } = data;
  return <main className="mx-auto max-w-4xl p-4 lg:p-8 space-y-5">
    <Link href="/students" className="text-primary underline">Retour aux apprenants</Link>
    <h1 className="text-2xl font-bold">{student.full_name}</h1>
    <section className="rounded-lg border bg-card p-5"><h2 className="font-semibold mb-3">Informations de contact</h2>
      <p>{student.telephone || 'Téléphone non renseigné'} · {student.email || 'Email non renseigné'}</p>
      <p>Parent : {student.parent_email || '—'}</p>
      <p>{student.status} · {student.session_type || '—'} · {student.niveau_cefr || '—'}</p>
    </section>
    <section className="rounded-lg border bg-card p-5 space-y-3"><h2 className="font-semibold">Inscriptions et groupes</h2>
      <Button onClick={() => setModal({ student_id: id, status: 'Submitted', date_inscription: new Date().toISOString().slice(0, 10) })}>Nouvelle pré-inscription</Button>
      {enrollments.map(e => <div key={e.id} className="border-t pt-3">
        <p>{e.session_type || student.session_type} · {e.school_year || 'Année non renseignée'} · {e.status}</p>
        <p>{groups.find(g => g.id === e.group_id)?.name || 'Groupe à affecter'}</p>
        {['Submitted','Under Review','Trial','Confirmed','Validated'].includes(e.status)
          && <Button variant="outline" onClick={() => setModal(e)}>{['Confirmed','Validated'].includes(e.status) ? 'Affecter un groupe' : 'Modifier la pré-inscription'}</Button>}
      </div>)}
    </section>
    {modal && <EnrollmentModal enrollment={modal} students={[student]} groups={groups}
      assignmentOnly={['Confirmed','Validated'].includes(modal.status)}
      onClose={() => setModal(null)} onSave={() => { setModal(null); setRevision(v => v + 1); }} />}
  </main>;
}

export function ReceptionistAccount() {
  const { user, reload } = useAuth();
  const [name, setName] = useState(user?.full_name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [saving, setSaving] = useState(false);
  return <main className="mx-auto max-w-lg p-4 lg:p-8"><h1 className="text-2xl font-bold mb-5">Mon compte</h1>
    <p className="mb-4">{user?.email}</p>
    <form className="space-y-4" onSubmit={async e => { e.preventDefault(); setSaving(true);
      try { await auth.updateMe({ full_name: name, phone }); await reload(); toast.success('Compte mis à jour'); }
      catch { /* auth.updateMe reports errors */ } finally { setSaving(false); }
    }}>
      <label className="block">Nom<input className="block w-full border rounded-md p-2" value={name} onChange={e => setName(e.target.value)} /></label>
      <label className="block">Téléphone<input className="block w-full border rounded-md p-2" value={phone} onChange={e => setPhone(e.target.value)} /></label>
      <Button disabled={saving} type="submit">{saving ? 'Enregistrement…' : 'Enregistrer'}</Button>
    </form>
  </main>;
}
