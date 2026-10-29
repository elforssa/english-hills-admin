// Next.js instrumentation hook — loads the Sentry server/edge config for the current
// runtime. With the app under src/, Next.js reads this file only from src/ (plan
// AFU-r1, H6); at the repository root it was never loaded and server errors were not
// reported. The configs keep their DSN gate and scrubbing (src/lib/sentry-scrub.js).
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config');
  }
}

// Captures errors thrown in nested React Server Components and route handlers.
export { captureRequestError as onRequestError } from '@sentry/nextjs';
