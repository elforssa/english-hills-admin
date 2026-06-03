'use client';

// Global error boundary — the last resort. Catches errors thrown in the root
// layout itself (which the route-level error.jsx boundaries can't reach). Must
// render its own <html>/<body>. Reports to Sentry (no-op until a DSN is set).

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('[global error boundary]', error);
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="fr">
      <body style={{ fontFamily: 'Inter, system-ui, sans-serif', margin: 0 }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ maxWidth: 420, width: '100%', textAlign: 'center', border: '1px solid #e5e7eb', borderRadius: 16, padding: 24 }}>
            <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Une erreur est survenue</h1>
            <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 20 }}>
              L&apos;application n&apos;a pas pu se charger. Veuillez réessayer.
            </p>
            <button
              onClick={() => reset()}
              style={{ padding: '8px 16px', fontSize: 14, fontWeight: 600, color: '#fff', background: '#1E4D8B', border: 0, borderRadius: 8, cursor: 'pointer' }}
            >
              Réessayer
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
