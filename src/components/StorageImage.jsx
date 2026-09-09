'use client';
import { useEffect, useState } from 'react';
import { resolveSignedUrl } from '@/lib/storage';

export default function StorageImage({ src, alt = '', ...props }) {
  const [resolved, setResolved] = useState(null);
  useEffect(() => {
    let alive = true;
    let objectUrl;
    const abort = new AbortController();
    setResolved(null);
    const refresh = async () => {
      try {
        let url = await resolveSignedUrl(src);
        if (src?.startsWith('asset:')) {
          // Blob preview avoids exposing tokens in the DOM and works with the
          // existing local image CSP (which permits blob:, not HTTP Storage).
          const response = await fetch(url, { signal: abort.signal, cache: 'no-store' });
          if (!response.ok) throw new Error('Image unavailable');
          const blob = await response.blob();
          if (!alive) return;
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          objectUrl = URL.createObjectURL(blob); url = objectUrl;
        }
        if (alive) setResolved(url);
      } catch { if (alive) setResolved(null); }
    };
    refresh();
    const timer = src?.startsWith('asset:') ? setInterval(refresh, 240000) : null;
    return () => { alive = false; abort.abort(); if (timer) clearInterval(timer); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [src]);
  // No fallback from denied registry access to direct Storage signing.
  // eslint-disable-next-line @next/next/no-img-element
  return resolved ? <img src={resolved} alt={alt} {...props} /> : <span {...props} aria-label="Image indisponible" />;
}
