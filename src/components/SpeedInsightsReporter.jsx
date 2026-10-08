'use client';

// Vercel Speed Insights (Web Vitals) for Production deployments only. Preview,
// local and CI builds render nothing, so no script or beacon is requested there.
// Every event passes through the privacy filter before it leaves the browser.
import { SpeedInsights } from '@vercel/speed-insights/next';
import { scrubVitalEvent } from '@/lib/rumScrub.mjs';

export default function SpeedInsightsReporter() {
  if (process.env.NEXT_PUBLIC_VERCEL_ENV !== 'production') return null;
  return <SpeedInsights beforeSend={scrubVitalEvent} />;
}
