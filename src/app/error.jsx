'use client';

// Root error boundary — catches errors thrown from any page outside the
// (admin) group: /login, /inscription, /inscription-compte, /unauthorized,
// and any future top-level routes. The (admin) group has its own boundary
// at src/app/(admin)/error.jsx that gives a more contextual recovery UI.

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw, LogIn } from 'lucide-react';
import Link from 'next/link';
import * as Sentry from '@sentry/nextjs';

export default function RootError({ error, reset }) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('[root error boundary]', error);
    Sentry.captureException(error); // no-op until a DSN is configured
  }, [error]);

  const digest = error?.digest;

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="max-w-md w-full bg-card border border-border rounded-2xl p-6 text-center">
        <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle size={22} />
        </div>
        <h1 className="text-lg font-bold mb-1">Une erreur est survenue</h1>
        <p className="text-sm text-muted-foreground mb-5">
          La page n&apos;a pas pu se charger. Vous pouvez réessayer, ou revenir
          à l&apos;écran de connexion.
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
            href="/login"
            className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium border border-border rounded-md hover:bg-muted"
          >
            <LogIn size={14} /> Connexion
          </Link>
        </div>
      </div>
    </div>
  );
}
