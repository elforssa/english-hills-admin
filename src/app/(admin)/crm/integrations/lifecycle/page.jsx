'use client';
import ProtectedRoute from '@/components/ProtectedRoute';
import LifecycleOperations from '@/components/crm/LifecycleOperations';

export default function Page() {
  return <ProtectedRoute allowedRoles={['director']}><LifecycleOperations /></ProtectedRoute>;
}
