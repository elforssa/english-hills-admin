'use client';

import { useAuth } from '@/context/AuthContext';
import ContextLink from '@/components/ContextLink';
import { hasCapability } from '@/lib/roleAccess.mjs';

export default function PersonLink({ kind = 'student', id, children, className = '' }) {
  const { role } = useAuth();
  const capability = kind === 'teacher' ? 'canManageTeacherOperations' : 'canManageStudents';
  if (!id || !hasCapability(role, capability)) return <span className={className}>{children}</span>;
  const route = kind === 'teacher' ? 'teachers' : 'students';
  return <ContextLink href={`/${route}/${id}`} className={`inline-flex min-h-11 items-center rounded text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${className}`}>{children}</ContextLink>;
}
