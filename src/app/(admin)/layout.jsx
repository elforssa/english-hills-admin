'use client';

import ProtectedRoute from '@/components/ProtectedRoute';
import Sidebar from '@/components/layout/Sidebar';

export default function AdminLayout({ children }) {
  return (
    <ProtectedRoute>
      <div className="flex min-h-screen bg-background">
        <Sidebar />
        <main id="main-content" className="flex-1 overflow-auto min-w-0 lg:ml-0">
          <div className="pt-16 lg:pt-0">{children}</div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
