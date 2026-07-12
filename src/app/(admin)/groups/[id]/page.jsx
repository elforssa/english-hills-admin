'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { entities } from '@/lib/entities';
import { ArrowLeft, Users, Pencil, UserSearch } from 'lucide-react';
import { STUDENT_STATUS_COLORS, SESSION_TYPE_COLORS } from '@/lib/statusColors';

export default function GroupDetail() {
  const params = useParams();
  const id = params?.id;
  const router = useRouter();
  const [group, setGroup] = useState(null);
  const [teacher, setTeacher] = useState(null);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [g] = await entities.Group.filter({ id });
      setGroup(g || null);
      if (g?.teacher_id) {
        const [t] = await entities.Teacher.filter({ id: g.teacher_id });
        setTeacher(t || null);
      }
      const roster = await entities.Student.filter({ groupe_id: id }, 'full_name', 500);
      setStudents(roster);
      setLoading(false);
    })().catch(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="p-8 text-center text-muted-foreground text-sm">Chargement...</div>;
  if (!group) return <div className="p-8 text-center text-muted-foreground text-sm">Groupe introuvable.</div>;

  const meta = [
    ['Niveau', group.niveau],
    ['Catégorie', group.categorie],
    ['Enseignant', teacher?.full_name || '—'],
    ['Horaire', `${group.jours || ''} ${group.horaire || ''}`.trim() || '—'],
    ['Salle', group.salle || '—'],
    ['Terme', `${group.terme || '—'}${group.annee ? ` · ${group.annee}` : ''}`],
  ];

  return (
    <div className="p-4 lg:p-8">
      <button onClick={() => router.push('/groups')} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft size={15} /> Retour aux groupes
      </button>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{group.name}</h1>
          <p className="text-muted-foreground text-sm mt-1 flex items-center gap-1.5">
            <Users size={14} /> {students.length} apprenant{students.length > 1 ? 's' : ''}
            {group.capacite_max ? ` / ${group.capacite_max}` : ''}
          </p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg p-5 mb-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          {meta.map(([label, val]) => (
            <div key={label}>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="font-medium">{val || '—'}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-4 lg:px-6 py-4 border-b border-border">
          <h2 className="font-semibold">Apprenants du groupe</h2>
        </div>
        {students.length === 0 ? (
          <div className="p-10 text-center">
            <UserSearch size={32} className="mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium text-foreground">Aucun apprenant assigné à ce groupe</p>
            <p className="text-xs text-muted-foreground mt-1">Assignez un groupe depuis la fiche d&apos;un apprenant.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted border-b border-border">
                  {['Nom', 'Catégorie', 'Session', 'Niveau', 'Téléphone', 'Statut', ''].map(hd => (
                    <th key={hd} className="text-left px-4 py-3 font-semibold text-muted-foreground">{hd}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {students.map(s => (
                  <tr key={s.id} className="hover:bg-muted/40 transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground">{s.full_name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{s.age_category || '—'}</td>
                    <td className="px-4 py-3">
                      {s.session_type
                        ? <span className={`text-xs font-medium px-2 py-0.5 rounded ${SESSION_TYPE_COLORS[s.session_type] || 'bg-gray-100 text-gray-600'}`}>{s.session_type}</span>
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {s.niveau_cefr ? <span className="inline-block text-xs font-bold text-white px-2 py-0.5 rounded bg-primary">{s.niveau_cefr}</span> : '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{s.telephone || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${STUDENT_STATUS_COLORS[s.status] || 'bg-gray-100 text-gray-500'}`}>{s.status || '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/students/${s.id}`} className="text-xs font-medium text-primary hover:underline">Voir</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
