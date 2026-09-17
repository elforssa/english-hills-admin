// Centralized status → Tailwind className mapping for payment / enrollment
// status badges. Import and use instead of per-page inline maps.

export const PAYMENT_STATUS_COLORS = {
  'Soldé':         'bg-emerald-50 text-emerald-700',
  'Acompte versé': 'bg-amber-50   text-amber-700',
  'En attente':    'bg-blue-50    text-blue-700',
  'En retard':     'bg-red-50     text-red-700',
};

export const ENROLLMENT_STATUS_COLORS = {
  'Submitted':    'bg-blue-100   text-blue-700',
  'Under Review': 'bg-yellow-100 text-yellow-700',
  'Validated':    'bg-green-100  text-green-700',
  'Rejected':     'bg-red-100    text-red-700',
  'Trial':        'bg-purple-100 text-purple-700',
};

export const ATTENDANCE_STATUS_COLORS = {
  'Présent':  'bg-green-100  text-green-700',
  'Absent':   'bg-red-100    text-red-700',
  'Retard':   'bg-yellow-100 text-yellow-700',
  'Justifié': 'bg-blue-100   text-blue-700',
};

export const STUDENT_STATUS_COLORS = {
  'Enrolled':  'bg-green-100  text-green-700',
  'Trial':     'bg-blue-100   text-blue-700',
  'Prospect':  'bg-yellow-100 text-yellow-700',
  'Inactive':  'bg-gray-100   text-gray-500',
  'Alumni':    'bg-purple-100 text-purple-700',
};

export const SESSION_TYPE_COLORS = {
  'Yearly':               'bg-slate-100  text-slate-600',
  'Adults':               'bg-violet-100 text-violet-700',
  'Summer Camp':          'bg-amber-100  text-amber-700',
  'Communication Junior': 'bg-indigo-100 text-indigo-700',
  'Communication Adult':  'bg-teal-100   text-teal-700',
  'One-to-One':           'bg-rose-100   text-rose-700',
  'Mise à niveau':        'bg-cyan-100   text-cyan-700',
  'Other':                 'bg-gray-100   text-gray-600',
};

export const PREMIUM_SESSION_STATUS_COLORS = {
  'Scheduled': 'bg-blue-100 text-blue-700',
  'Confirmed': 'bg-cyan-100 text-cyan-700',
  'Completed': 'bg-emerald-100 text-emerald-700',
  'Cancelled': 'bg-gray-100 text-gray-500',
  'Missed': 'bg-red-100 text-red-700',
};

export const PREMIUM_ATTENDANCE_STATUS_COLORS = {
  Present: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  Absent: 'bg-rose-100 text-rose-800 border-rose-200',
  Late: 'bg-amber-100 text-amber-800 border-amber-200',
  Excused: 'bg-sky-100 text-sky-800 border-sky-200',
};

export const PREMIUM_HOMEWORK_STATUS_COLORS = {
  'Submitted': 'bg-amber-100 text-amber-800',
  'Reviewed': 'bg-blue-100 text-blue-700',
  'Prepared': 'bg-emerald-100 text-emerald-700',
};

export const PAYROLL_STATUS_COLORS = {
  'Brouillon': 'bg-slate-100 text-slate-700',
  'Validé': 'bg-blue-100 text-blue-700',
  'Payé': 'bg-emerald-100 text-emerald-700',
};
