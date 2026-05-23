'use client';

'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { entities, auth } from '@/lib/entities';
import { getBrowserClient } from '@/lib/supabase';
import { ArrowLeft, Edit, FileText, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const STATUS_COLORS = {
  Enrolled: 'bg-green-100 text-green-700',
  Trial: 'bg-blue-100 text-blue-700',
  Prospect: 'bg-yellow-100 text-yellow-700',
  Inactive: 'bg-gray-100 text-gray-500',
  Alumni: 'bg-purple-100 text-purple-700',
};

export default function StudentDetail() {
  const params = useParams();
  const id = params?.id;
  const router = useRouter();
  const [student, setStudent] = useState(null);
  const [payments, setPayments] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [assessments, setAssessments] = useState([]);
  const [adults, setAdults] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      entities.Student.filter({ id }),
      entities.Receipt.filter({ student_id: id }),
      entities.Attendance.filter({ student_id: id }),
      entities.Assessment.filter({ student_id: id }),
      entities.AuthorizedAdult.filter({ student_id: id }),
    ]).then(([s, p, a, as_, adults]) => {
      setStudent(s[0]);
      setPayments(p);
      setAttendance(a);
      setAssessments(as_);
      setAdults(adults);
      setLoading(false);
    });
  }, [id]);

  const handleDelete = async () => {
    if (!confirm('Archiver cet apprenant ? Son historique sera conservé.')) return;
    const sb = getBrowserClient();
    const { error } = await sb.rpc('soft_delete_student', { p_student_id: id });
    if (error) { toast.error('Erreur : ' + error.message); return; }
    toast.success('Apprenant archivé');
    router.push('/students');
  };

  if (loading) return <div className="p-8 text-muted-foreground">Chargement...</div>;
  if (!student) return <div className="p-8 text-muted-foreground">Apprenant introuvable.</div>;

  const totalPaye = payments.reduce((s, p) => s + (p.montant_paye || 0), 0);
  const totalRestant = payments.reduce((s, p) => s + ((p.montant_total || 0) - (p.montant_paye || 0)), 0);
  const present = attendance.filter(a => a.status === 'Présent').length;
  const presenceRate = attendance.length ? Math.round((present / attendance.length) * 100) : null;

  const Section = ({ title, children }) => (
    <div className="bg-card border border-border rounded-lg overflow-hidden mb-5">
      <div className="px-5 py-3 border-b border-border bg-muted/30">
        <h3 className="font-semibold text-sm text-foreground">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => router.push('/students')} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft size={15} />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{student.full_name}</h1>
          <span className={`text-xs font-medium px-2 py-1 rounded-full ${STATUS_COLORS[student.status]}`}>{student.status}</span>
        </div>
        <Link href={`/students/${id}/edit`} className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-border rounded-md hover:bg-muted">
          <Edit size={14} /> Modifier
        </Link>
        <button onClick={handleDelete} className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-md hover:bg-red-50">
          <Trash2 size={14} /> Supprimer
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-5">
        {[
          { label: 'Niveau', value: student.niveau_cefr || '—' },
          { label: 'Taux de présence', value: presenceRate !== null ? `${presenceRate}%` : '—' },
          { label: 'Solde restant', value: totalRestant ? `${totalRestant.toLocaleString('fr-MA')} MAD` : '0 MAD' },
        ].map(({ label, value }) => (
          <div key={label} className="bg-card border border-border rounded-lg p-4">
            <p className="text-xs text-muted-foreground mb-1">{label}</p>
            <p className="text-xl font-bold text-foreground">{value}</p>
          </div>
        ))}
      </div>

      <Section title="Informations personnelles">
        <div className="grid grid-cols-2 gap-4 text-sm">
          {[
            ['Date de naissance', student.date_naissance],
            ['Téléphone', student.telephone],
            ['Email', student.email],
            ['Catégorie', student.age_category],
          ].map(([label, val]) => (
            <div key={label}>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="font-medium">{val || '—'}</p>
            </div>
          ))}
          {student.notes && (
            <div className="col-span-2">
              <p className="text-xs text-muted-foreground">Notes</p>
              <p className="font-medium">{student.notes}</p>
            </div>
          )}
        </div>
      </Section>

      <Section title="Adultes autorisés au retrait">
        {adults.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun adulte autorisé.</p>
        ) : (
          <div className="space-y-2">
            {adults.map(a => (
              <div key={a.id} className="flex items-center justify-between p-3 bg-muted/40 rounded-md text-sm">
                <div>
                  <p className="font-medium">{a.full_name}</p>
                  <p className="text-xs text-muted-foreground">{a.relation} · {a.telephone}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title={`Paiements (${payments.length})`}>
        <div className="flex justify-end mb-3">
          <Link href={`/receipts/new?student_id=${student.id}&student_name=${encodeURIComponent(student.full_name)}`} className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-md border border-border hover:bg-muted" style={{ color: '#1E4D8B' }}>
            <FileText size={12} /> Nouveau reçu
          </Link>
        </div>
        {payments.length === 0 ? (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Aucun paiement enregistré.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-muted-foreground border-b border-border">
              <th className="pb-2">Date</th><th className="pb-2">Total</th><th className="pb-2">Payé</th><th className="pb-2">Restant</th><th className="pb-2">Statut</th><th className="pb-2"></th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {payments.map(p => {
                const restant = (p.montant_total || 0) - (p.montant_paye || 0);
                return (
                <tr key={p.id}>
                  <td className="py-2">{p.date || '—'}</td>
                  <td className="py-2">{(p.montant_total || 0).toLocaleString('fr-MA')} MAD</td>
                  <td className="py-2">{(p.montant_paye || 0).toLocaleString('fr-MA')} MAD</td>
                  <td className="py-2">{restant.toLocaleString('fr-MA')} MAD</td>
                  <td className="py-2"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${p.statut_paiement === 'Soldé' ? 'bg-green-100 text-green-700' : p.statut_paiement === 'En retard' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>{p.statut_paiement || '—'}</span></td>
                  <td className="py-2"><Link href={`/receipts/${p.id}/print`} className="text-xs text-muted-foreground hover:text-primary"><FileText size={13} /></Link></td>
                </tr>
              );})}
            </tbody>
          </table>
        )}
      </Section>

      <Section title={`Notes & évaluations (${assessments.length})`}>
        {assessments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune évaluation.</p>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-muted-foreground border-b border-border">
              <th className="pb-2">Terme</th><th className="pb-2">Oral</th><th className="pb-2">Écrit</th><th className="pb-2">Devoirs</th><th className="pb-2">Finale</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {assessments.map(a => (
                <tr key={a.id}>
                  <td className="py-2">{a.terme || '—'}</td>
                  <td className="py-2">{a.note_oral ?? '—'}</td>
                  <td className="py-2">{a.note_ecrit ?? '—'}</td>
                  <td className="py-2">{a.note_devoirs ?? '—'}</td>
                  <td className="py-2 font-semibold">{a.note_finale ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  );
}
