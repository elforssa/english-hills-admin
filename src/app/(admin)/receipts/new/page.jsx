'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { entities } from '@/lib/entities';
import { toast } from 'sonner';
import ReceiptForm from '@/components/receipts/ReceiptForm';
import { ArrowLeft } from 'lucide-react';

const AGE_TO_CATEGORIE = {
  'Young Learners (6-12)': 'Enfants',
  'Teens (13-17)': 'Ados',
  'Adults (18+)': 'Adultes',
  'Corporate': 'Business',
};

// A paid receipt means the linked student has committed → promote them to
// Enrolled. Only lifts a not-yet-enrolled student; an already-Enrolled or
// Alumni record is left untouched.
const PROMOTABLE_STATUSES = ['Prospect', 'Trial', 'Inactive'];

export default function ReceiptNew() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);

  const studentId = searchParams.get('student_id') || '';
  const [prefill, setPrefill] = useState({ student_id: studentId });
  const [loadingStudent, setLoadingStudent] = useState(Boolean(studentId));

  useEffect(() => {
    if (!studentId) return;
    entities.Student.filter({ id: studentId }).then(([student]) => {
      if (!student) return;
      const mapped = {
        student_id: studentId,
        nom_prenom: student.full_name || '',
        telephone: student.telephone || '',
        email: student.email || '',
        parent_email: student.parent_email || '',
        date_naissance: student.date_naissance || '',
        session_type: student.session_type || '',
      };
      if (student.niveau_cefr) mapped.niveau = student.niveau_cefr;
      if (AGE_TO_CATEGORIE[student.age_category]) mapped.categorie = AGE_TO_CATEGORIE[student.age_category];
      setPrefill(mapped);
    }).finally(() => setLoadingStudent(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (data) => {
    setSaving(true);
    try {
      const receipt = await entities.Receipt.create(data);
      toast.success('Reçu enregistré avec succès');

      // Payment = enrollment. Promote the linked student if they aren't already
      // Enrolled/Alumni. Non-blocking: a failure here never loses the receipt.
      if (data.student_id) {
        try {
          const [student] = await entities.Student.filter({ id: data.student_id });
          if (student) {
            const upd = {};
            if (!student.status || PROMOTABLE_STATUSES.includes(student.status)) upd.status = 'Enrolled';
            // Keep the student's standing image-consent in sync with the desk choice.
            if (data.photo_consent && data.photo_consent !== student.photo_consent) upd.photo_consent = data.photo_consent;
            if (Object.keys(upd).length) {
              await entities.Student.update(data.student_id, upd);
              qc.invalidateQueries({ queryKey: ['Student'] });
              if (upd.status) toast.success(`${student.full_name} marqué(e) comme inscrit(e)`);
            }
          }
        } catch {
          // Receipt is saved; status/consent can still be set manually.
        }
      }

      router.push(`/receipts/${receipt.id}/print`);
    } catch {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto">
      <button onClick={() => router.push('/finance')} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
        <ArrowLeft size={15} /> Retour
      </button>
      <div className="mb-8">
        <h1 className="text-xl font-bold text-foreground">Nouveau reçu de paiement</h1>
        <p className="text-muted-foreground text-sm mt-1">Remplissez les informations pour générer un reçu imprimable.</p>
      </div>
      {loadingStudent ? (
        <p className="text-sm text-muted-foreground">Chargement des données du dossier...</p>
      ) : (
        <ReceiptForm onSubmit={handleSubmit} onCancel={() => router.push('/finance')} saving={saving} initialData={prefill} />
      )}
    </div>
  );
}
