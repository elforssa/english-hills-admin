import { withSentryConfig } from '@sentry/nextjs';

/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production';

// Content-Security-Policy — locks down what scripts, styles, images, and
// network destinations the browser will accept. Tighten further once we move
// inline styles into Tailwind-only classes and inline scripts out of Next's
// hydration shim.
//
// connect-src: Supabase (REST + Realtime + Storage) and Resend (rare client
// fetches) — adjust if a new third-party API is added.
// frame-ancestors 'none' replaces / hardens X-Frame-Options: DENY.
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  // Next.js needs 'unsafe-inline' for its hydration runtime; 'unsafe-eval'
  // only in dev for fast refresh. Strip it in prod.
  // Cloudflare Turnstile script loads from challenges.cloudflare.com.
  isProd
    ? "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com"
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com",
  // Tailwind ships static CSS, but Radix / shadcn / chart.jsx use inline style
  // attributes — those need 'unsafe-inline' until we move them to CSS vars.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  // Supabase project + Resend API + Cloudflare Turnstile siteverify
  // (server fetches it; the browser does not, but keeping connect-src loose
  // for the iframe is harmless).
  // Sentry events are tunnelled through /monitoring (same-origin), so 'self'
  // covers the browser; the ingest hosts are listed as a fallback.
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.resend.com https://challenges.cloudflare.com https://*.ingest.de.sentry.io https://*.sentry.io",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  // Turnstile renders its challenge inside an iframe from this origin.
  "frame-src 'self' https://challenges.cloudflare.com",
  isProd ? 'upgrade-insecure-requests' : '',
].filter(Boolean).join('; ');

const nextConfig = {
  reactStrictMode: true,
  // Required on Next 14 so instrumentation.js (Sentry server/edge init) loads.
  experimental: { instrumentationHook: true },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          // HSTS — only meaningful over HTTPS, harmless on http://localhost.
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        ],
      },
    ];
  },
};

// Wrap with Sentry. Build-time source-map upload only runs when an auth token
// is present (i.e. in CI / Vercel), so local builds stay quiet. Runtime error
// reporting is gated separately by the DSN env vars in the sentry.*.config.js
// files, so this is a no-op until you set NEXT_PUBLIC_SENTRY_DSN.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  // Same-origin tunnel: keeps events flowing past ad-blockers and a strict CSP.
  tunnelRoute: '/monitoring',
  widenClientFileUpload: true,
  // Skip source-map upload entirely when there's no auth token (local dev).
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
});
