'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { entities } from '@/lib/entities';
import { getBrowserClient } from '@/lib/supabase';
import StorageImage from '@/components/StorageImage';
import { ArrowLeft, Edit, Archive } from 'lucide-react';
import { toast } from 'sonner';
import { safeReturnTo } from '@/lib/navigation.mjs';

export default function TeacherProfile() {
  const { id } = useParams();
  const router = useRouter();
  const [teacher, setTeacher] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    entities.Teacher.filter({ id }).then((rows) => setTeacher(rows[0] || null))
      .catch(() => setTeacher(null)).finally(() => setLoading(false));
  }, [id]);

  const archive = async () => {
    if (!confirm('Archiver cet enseignant ? Sa fiche sera masquée mais conservée.')) return;
    const { error } = await getBrowserClient().rpc('soft_delete_teacher', { p_teacher_id: id });
    if (error) { toast.error(error.message || "Échec de l’archivage de l’enseignant."); return; }
    toast.success('Enseignant archivé');
    router.push('/teachers');
  };

  if (loading) return <div className="p-8 text-muted-foreground">Chargement...</div>;
  if (!teacher || teacher.deleted_at) return <div className="p-8"><p>Enseignant introuvable ou archivé.</p><Link href="/teachers" className="text-primary underline">Retour aux enseignants</Link></div>;

  const fields = [
    ['Email', teacher.email], ['Téléphone', teacher.telephone],
    ['Type de contrat', teacher.contract_type],
    ['Niveaux autorisés', teacher.niveaux_autorises?.join(', ')],
    ['Certifications', teacher.certifications?.join(', ')],
  ];
  return <div className="p-4 lg:p-8 max-w-3xl">
    <button onClick={() => router.push(safeReturnTo(new URLSearchParams(window.location.search).get('returnTo'), '/teachers'))} className="inline-flex items-center gap-2 min-h-10 text-sm text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary rounded"><ArrowLeft size={16} /> Enseignants</button>
    <div className="flex flex-wrap items-center gap-4 mt-4 mb-6">
      <div className="w-16 h-16 rounded-full overflow-hidden bg-muted flex items-center justify-center">
        {teacher.photo_url ? <StorageImage src={teacher.photo_url} alt="" className="w-full h-full object-cover" /> : <span className="text-xl font-bold">{teacher.full_name?.[0] || '?'}</span>}
      </div>
      <h1 className="text-2xl font-bold flex-1 min-w-40">{teacher.full_name}</h1>
      <Link href={`/teachers/${id}/edit`} className="inline-flex items-center gap-2 min-h-10 px-4 border rounded-md hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"><Edit size={15} /> Modifier</Link>
      <button onClick={archive} className="inline-flex items-center gap-2 min-h-10 px-4 border border-red-200 rounded-md text-red-700 hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-700"><Archive size={15} /> Archiver</button>
    </div>
    <div className="bg-card border border-border rounded-lg p-5 grid grid-cols-1 sm:grid-cols-2 gap-5">
      {fields.map(([label, value]) => <div key={label}><p className="text-xs text-muted-foreground">{label}</p><p className="font-medium mt-1">{value || '—'}</p></div>)}
    </div>
  </div>;
}
