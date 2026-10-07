'use client';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ENROLLMENT_LABELS, displayLabel } from '@/lib/ui/presentation.mjs';
import { PROGRAMS } from '@/lib/crm/enrollment.mjs';
import { continueHref, enrollmentAction, studentHref } from '@/lib/crm/enrollmentActions.mjs';
// At most one contextual action; conversion stays with the trusted server evaluator.
export default function LeadEnrollmentSection({ lead, onStart }) {
  const pathname = usePathname(), params = useSearchParams();
  const returnTo = `${pathname}?${params}`;
  const enrollment = lead.enrollment, { action, note } = enrollmentAction(lead);
  const link = 'inline-flex min-h-11 items-center font-medium text-blue-800 underline underline-offset-4';
  return <section id="crm-enrollment" tabIndex={-1} className="space-y-3 border-t pt-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-base leading-6 font-semibold">Inscription</h3>{action === 'start' && <Button onClick={onStart}>Commencer l&apos;inscription</Button>}</div>
    {enrollment ? <div className="space-y-2 rounded-lg border p-3 text-sm"><p className="font-semibold">{displayLabel(ENROLLMENT_LABELS,enrollment.status)}</p><p>{enrollment.student_name}</p><p className="text-slate-500">{PROGRAMS[enrollment.session_type] || 'Programme à préciser'} · {enrollment.school_year}{enrollment.level ? ` · ${enrollment.level}` : ''}{enrollment.group_name ? ` · ${enrollment.group_name}` : ''}</p>{note && <p>{note}</p>}{action === 'continue' ? <Button asChild><Link href={continueHref(enrollment, returnTo)}>Continuer l&apos;inscription</Link></Button> : action === 'open' && <Link className={link} href={studentHref(enrollment, returnTo)}>Ouvrir l&apos;apprenant</Link>}</div> : <><p className="text-sm text-slate-500">Aucune inscription commencée.</p>{note && <p className="text-sm">{note}</p>}</>}
    {lead.conversion_review_required && <p role="status" className="rounded-lg border p-3 text-sm">Direction : cette conversion nécessite une vérification. L&apos;historique de confirmation est conservé.</p>}
  </section>;
}
