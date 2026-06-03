'use client';

// Route-level error boundary for the (admin) group. Catches render errors
// + uncaught promise rejections thrown from any page inside (admin)/.
// The user gets a friendly recovery UI; the original error is logged for
// the developer in non-production and forwarded to console in production
// where a real error tracker (e.g. Sentry) would pick it up.

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import Link from 'next/link';
import * as Sentry from '@sentry/nextjs';

export default function AdminError({ error, reset }) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('[admin error boundary]', error);
    Sentry.captureException(error); // no-op until a DSN is configured
  }, [error]);

  // `digest` is set by Next when the error originated in a server component;
  // surface it so support requests can be tied back to server logs.
  const digest = error?.digest;

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-card border border-border rounded-2xl p-6 text-center">
        <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle size={22} />
        </div>
        <h1 className="text-lg font-bold mb-1">Une erreur est survenue</h1>
        <p className="text-sm text-muted-foreground mb-5">
          La page n&apos;a pas pu se charger. Vous pouvez réessayer, ou revenir au
          tableau de bord.
        </p>

        {digest && (
          <p className="text-xs text-muted-foreground/70 mb-4 font-mono">
            Réf: {digest}
          </p>
        )}

        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <button
            onClick={() => reset()}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white rounded-md bg-primary hover:opacity-90"
          >
            <RefreshCw size={14} /> Réessayer
          </button>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium border border-border rounded-md hover:bg-muted"
          >
            <Home size={14} /> Tableau de bord
          </Link>
        </div>
      </div>
    </div>
  );
}
