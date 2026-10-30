import Link from 'next/link';
import { SESSION_TYPE_COLORS } from '@/lib/statusColors';
import { programmeLabel } from '@/lib/ui/presentation.mjs';
import { PILL_CLASS } from '@/lib/ui/pill.mjs';

export function programmePillClass(sessionType) {
  return `${PILL_CLASS} ${SESSION_TYPE_COLORS[sessionType] || 'bg-slate-100 text-slate-700'}`;
}

// The programme as a pill, like the status and payment pills (plan AFU-r1, H2). A
// link keeps its touch target on the wrapper, so the pill itself never grows.
export default function ProgrammePill({ sessionType, href, title }) {
  const pill = <span className={programmePillClass(sessionType)}>{programmeLabel(sessionType)}</span>;
  if (!href) return title ? <span title={title}>{pill}</span> : pill;
  return <Link data-touch-target href={href} title={title} className="hover:underline focus-visible:outline-none">{pill}</Link>;
}
