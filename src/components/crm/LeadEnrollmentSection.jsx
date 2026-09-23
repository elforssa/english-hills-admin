'use client';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { isPreEnrollment } from '@/lib/enrollmentWorkflow.mjs';
import { ENROLLMENT_STATUS, PROGRAMS } from '@/lib/crm/enrollment.mjs';
export default function LeadEnrollmentSection({ lead, onStart }) {
  const enrollment = lead.enrollment;
  return <section className="space-y-3 border-t pt-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Inscription</h3>{!enrollment && lead.status === 'QUALIFIED' && <Button onClick={onStart}>Commencer l&apos;inscription</Button>}</div>
    {enrollment ? <div className="space-y-2 rounded-lg border p-3 text-sm"><p className="font-semibold">{ENROLLMENT_STATUS[enrollment.status] || 'Inscription en cours'}</p><p>{enrollment.student_name}</p><p className="text-slate-500">{PROGRAMS[enrollment.session_type] || 'Programme à préciser'} · {enrollment.school_year}{enrollment.level ? ` · ${enrollment.level}` : ''}{enrollment.group_name ? ` · ${enrollment.group_name}` : ''}</p>{isPreEnrollment(enrollment) && lead.status === 'QUALIFIED' && <p>Finaliser l&apos;inscription avec le parent.</p>}<Link className="inline-flex min-h-11 items-center font-medium text-blue-800 underline underline-offset-4" href={`/students/${enrollment.student_id}`}>Ouvrir l&apos;apprenant</Link></div> : <p className="text-sm text-slate-500">Aucune inscription commencée.</p>}
    {lead.conversion_review_required && <p role="status" className="rounded-lg border p-3 text-sm">Direction : cette conversion nécessite une vérification. L&apos;historique de confirmation est conservé.</p>}
  </section>;
}
