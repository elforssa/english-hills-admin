'use client';
import { useEffect, useSyncExternalStore } from 'react';
import { BAND_QUERIES, resolveBand } from '@/lib/crm/presentation.mjs';

// The same media queries as the sm:/lg: CSS variants, so JS and CSS share one band.
function subscribe(update) {
  const queries = Object.values(BAND_QUERIES).map(query => window.matchMedia(query));
  queries.forEach(media => media.addEventListener('change', update));
  return () => queries.forEach(media => media.removeEventListener('change', update));
}
const snapshot = () => resolveBand({ sm: window.matchMedia(BAND_QUERIES.sm).matches, lg: window.matchMedia(BAND_QUERIES.lg).matches });
// Unknown until the browser answers; callers wait instead of guessing a band.
const serverSnapshot = () => null;

export default function useResponsiveBand() {
  // Engines with classic scrollbars (WebKit) measure the width queries without the page
  // scrollbar. The band changes page height, so a scrollbar that came and went with it
  // would flip the band back and forth at an exact edge. Keep it present while mounted.
  useEffect(() => {
    const root = document.documentElement, previous = root.style.overflowY;
    root.style.overflowY = 'scroll';
    return () => { root.style.overflowY = previous; };
  }, []);
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
