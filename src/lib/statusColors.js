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
  'Summer Camp':          'bg-amber-100  text-amber-700',
  'Communication Junior': 'bg-indigo-100 text-indigo-700',
  'Communication Adult':  'bg-teal-100   text-teal-700',
  'One-to-One':           'bg-rose-100   text-rose-700',
};
