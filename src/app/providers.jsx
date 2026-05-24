'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/context/AuthContext';
import { queryClientInstance } from '@/lib/query-client';

export default function Providers({ children }) {
  return (
    <QueryClientProvider client={queryClientInstance}>
      <AuthProvider>
        {children}
        <Toaster
          richColors
          position="top-right"
          toastOptions={{
            // Screen readers announce error toasts immediately, success/info
            // politely. Sonner sets role + aria-live on each toast.
            classNames: { toast: 'group' },
          }}
        />
      </AuthProvider>
    </QueryClientProvider>
  );
}
