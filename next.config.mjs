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
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.resend.com https://challenges.cloudflare.com",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  // Turnstile renders its challenge inside an iframe from this origin.
  "frame-src 'self' https://challenges.cloudflare.com",
  isProd ? 'upgrade-insecure-requests' : '',
].filter(Boolean).join('; ');

const nextConfig = {
  reactStrictMode: true,
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

export default nextConfig;
