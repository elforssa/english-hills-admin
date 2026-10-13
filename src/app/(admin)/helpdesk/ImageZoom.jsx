'use client';

import { useEffect, useRef, useState } from 'react';

// Click (or Enter/Space) on a guide screenshot to see it at full size.
export default function ImageZoom({ children }) {
  const [shot, setShot] = useState(null);
  const closeRef = useRef(null);

  useEffect(() => {
    if (!shot) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setShot(null); };
    document.addEventListener('keydown', onKey);
    closeRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [shot]);

  const pick = (e) => {
    const img = e.target instanceof HTMLImageElement && e.target.closest('figure.fig') ? e.target : null;
    if (!img) return;
    if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    setShot({ src: img.currentSrc || img.src, alt: img.alt });
  };

  return (
    <>
      {/* The wrapper only delegates events; every image is itself keyboard-focusable. */}
      <div onClick={pick} onKeyDown={pick}>{children}</div>
      {shot && (
        <div className="lb on" role="dialog" aria-modal="true" aria-label="Image agrandie" onClick={() => setShot(null)}>
          <button type="button" ref={closeRef} onClick={() => setShot(null)}>Fermer</button>
          {/* Natural-size preview of an already loaded static screenshot; next/image needs fixed dimensions. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shot.src} alt={shot.alt} />
        </div>
      )}
    </>
  );
}
