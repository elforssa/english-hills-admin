'use client';

// Vercel Speed Insights (Web Vitals) for Production deployments only. Preview,
// local and CI builds render nothing, so no script or beacon is requested there.
// Every event passes through the privacy filter before it leaves the browser.
import { usePathname } from 'next/navigation';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { scrubRoute, scrubVitalEvent } from '@/lib/rumScrub.mjs';

export default function SpeedInsightsReporter() {
  if (process.env.NEXT_PUBLIC_VERCEL_ENV !== 'production') return null;
  return <ScrubbedSpeedInsights />;
}

// The wrapper computes its own route from useParams() and falls back to the raw
// pathname when that fails; it hands the route to Vercel's script as the
// `data-route` attribute. An explicit `route` prop overrides that computed value, so
// the attribute is de-identified too, not only what beforeSend returns. A null route
// makes the wrapper inject no script at all, so an unknown pathname sends nothing.
function ScrubbedSpeedInsights() {
  const route = scrubRoute(usePathname());
  return <SpeedInsights beforeSend={scrubVitalEvent} route={route} />;
}
