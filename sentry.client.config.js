// Sentry — browser runtime. Loaded into the client bundle by withSentryConfig.
// Inert until NEXT_PUBLIC_SENTRY_DSN is set, so this is safe to ship disabled.
//
// CNDP posture: no Session Replay (it records the screen = PII), no default PII,
// and every event/breadcrumb passes through the scrubber before transmission.
import * as Sentry from '@sentry/nextjs';
import { scrubEvent, scrubBreadcrumb } from '@/lib/sentry-scrub';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,

  // Errors only by default. Raise (and add beforeSendTransaction scrubbing)
  // if you later want performance tracing.
  tracesSampleRate: 0,

  // Do NOT attach IP / cookies / user identity automatically.
  sendDefaultPii: false,

  // CNDP scrubbers — strip student / financial PII before anything is sent.
  beforeSend: scrubEvent,
  beforeBreadcrumb: scrubBreadcrumb,
});
