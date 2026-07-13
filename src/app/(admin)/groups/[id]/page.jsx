'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { entities } from '@/lib/entities';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import { ArrowLeft, Users, UserSearch, UserPlus, X, Check } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';
import { STUDENT_STATUS_COLORS, SESSION_TYPE_COLORS } from '@/lib/statusColors';

export default function GroupDetail() {
  const params = useParams();
  const id = params?.id;
  const router = useRouter();
  const { role } = useAuth();
  const canManage = role === 'admin' || role === 'director';

  const [group, setGroup] = useState(null);
  const [teacher, setTeacher] = useState(null);
  const [students, setStudents] = useState([]); // roster (in this group)
  const [allStudents, setAllStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [g] = await entities.Group.filter({ id });
      setGroup(g || null);
      if (g?.teacher_id) {
        const [t] = await entities.Teacher.filter({ id: g.teacher_id });
        setTeacher(t || null);
      }
      const [roster, everyone] = await Promise.all([
        entities.Student.filter({ groupe_id: id }, 'full_name', 500),
        entities.Student.list('full_name', 1000),
      ]);
      setStudents(roster);
      setAllStudents(everyone);
      setLoading(false);
    })().catch(() => setLoading(false));
  }, [id]);

  const available = allStudents.filter(s => s.groupe_id !== id);

  const addToGroup = async (s) => {
    setBusyId(s.id);
    try {
      await entities.Student.update(s.id, { groupe_id: id });
      const updated = { ...s, groupe_id: id };
      setStudents(prev => [...prev, updated].sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '')));
      setAllStudents(prev => prev.map(x => (x.id === s.id ? updated : x)));
      toast.success(`${s.full_name} ajouté(e) au groupe`);
    } catch {
      // entities.js toasts on error
    } finally {
      setBusyId(null);
    }
  };

  const removeFromGroup = async (s) => {
    if (!confirm(`Retirer ${s.full_name} de ce groupe ?`)) return;
    setBusyId(s.id);
    try {
      await entities.Student.update(s.id, { groupe_id: null });
      setStudents(prev => prev.filter(x => x.id !== s.id));
      setAllStudents(prev => prev.map(x => (x.id === s.id ? { ...x, groupe_id: null } : x)));
      toast.success(`${s.full_name} retiré(e) du groupe`);
    } catch {
      // toasted
    } finally {
      setBusyId(null);
    }
  };

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
  const full = group.capacite_max && students.length >= group.capacite_max;

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
            {full && <span className="text-amber-600 font-medium">· complet</span>}
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => setPickerOpen(true)}
            className="self-start sm:self-auto flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white rounded-md bg-primary hover:opacity-90"
          >
            <UserPlus size={15} /> Ajouter des apprenants
          </button>
        )}
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
            <p className="text-sm font-medium text-foreground">Aucun apprenant dans ce groupe</p>
            {canManage && (
              <button onClick={() => setPickerOpen(true)} className="inline-flex items-center gap-1 text-sm font-semibold mt-3 hover:underline" style={{ color: 'var(--brand)' }}>
                <UserPlus size={14} /> Ajouter des apprenants
              </button>
            )}
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
                    <td className="px-4 py-3 font-medium text-foreground">
                      <Link href={`/students/${s.id}`} className="hover:underline">{s.full_name}</Link>
                    </td>
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
                    <td className="px-4 py-3 text-right">
                      {canManage && (
                        <button
                          onClick={() => removeFromGroup(s)}
                          disabled={busyId === s.id}
                          className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
                        >
                          <X size={13} /> Retirer
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pickerOpen && (
        <Dialog open onOpenChange={(o) => !o && setPickerOpen(false)}>
          <DialogContent className="max-w-md p-0">
            <DialogHeader className="px-4 pt-4">
              <DialogTitle>Ajouter des apprenants à « {group.name} »</DialogTitle>
            </DialogHeader>
            <Command>
              <CommandInput placeholder="Rechercher un apprenant…" />
              <CommandList className="max-h-80">
                <CommandEmpty>Aucun apprenant disponible.</CommandEmpty>
                <CommandGroup>
                  {available.map(s => (
                    <CommandItem
                      key={s.id}
                      value={`${s.full_name} ${s.telephone || ''}`}
                      onSelect={() => addToGroup(s)}
                      disabled={busyId === s.id}
                    >
                      <UserPlus size={14} className="mr-2 text-muted-foreground" />
                      <span className="flex-1 truncate">{s.full_name}</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        {s.groupe_id ? 'change de groupe' : (s.session_type || s.age_category || '')}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
            <div className="px-4 py-3 border-t border-border flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{students.length} dans le groupe{group.capacite_max ? ` / ${group.capacite_max}` : ''}</span>
              <button onClick={() => setPickerOpen(false)} className="inline-flex items-center gap-1 text-sm font-semibold px-3 py-1.5 rounded-md bg-primary text-white hover:opacity-90">
                <Check size={14} /> Terminé
              </button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
