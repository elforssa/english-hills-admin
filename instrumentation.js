// Next.js instrumentation hook — loads the right Sentry server/edge config for
// the current runtime. Enabled via experimental.instrumentationHook (Next 14).
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

// Captures errors thrown in nested React Server Components (Next.js >= 15;
// harmless no-op on 14). Available on @sentry/nextjs >= 8.
export { captureRequestError as onRequestError } from '@sentry/nextjs';
