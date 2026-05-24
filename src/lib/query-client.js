import { QueryClient } from '@tanstack/react-query';

// School data (students, groups, attendance, receipts) doesn't change minute
// by minute. Five-minute stale time keeps the UI snappy on tab switches
// without burning the DB on every parent-portal re-render.
const FIVE_MINUTES = 5 * 60 * 1000;

export const queryClientInstance = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: FIVE_MINUTES,
      gcTime: 10 * 60 * 1000,
    },
  },
});
