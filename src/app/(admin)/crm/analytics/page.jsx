'use client';
import ProtectedRoute from '@/components/ProtectedRoute';
import MarketingAnalytics from '@/components/crm/MarketingAnalytics';
export default function Page() {
  return <ProtectedRoute allowedRoles={['director']}><MarketingAnalytics /></ProtectedRoute>;
}
