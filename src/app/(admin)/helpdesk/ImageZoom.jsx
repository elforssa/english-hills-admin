'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// Click (or Enter/Space) on a guide screenshot to see it at full size.
export default function ImageZoom({ children }) {
  const [shot, setShot] = useState(null);
  const closeRef = useRef(null);
  const openerRef = useRef(null);

  const close = useCallback(() => {
    setShot(null);
    // Give keyboard users their place back once the overlay is gone.
    requestAnimationFrame(() => openerRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!shot) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'Tab') { e.preventDefault(); closeRef.current?.focus(); } // Close is the only control
    };
    document.addEventListener('keydown', onKey);
    closeRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [shot, close]);

  const pick = (e) => {
    const img = e.target instanceof HTMLImageElement && e.target.closest('figure.fig') ? e.target : null;
    if (!img) return;
    if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    openerRef.current = img;
    setShot({ src: img.currentSrc || img.src, alt: img.alt });
  };

  return (
    <>
      {/* The wrapper only delegates events; every image is itself keyboard-focusable. */}
      <div onClick={pick} onKeyDown={pick}>{children}</div>
      {shot && (
        <div className="lb on" role="dialog" aria-modal="true" aria-label="Image agrandie" onClick={close}>
          <button type="button" ref={closeRef} onClick={close}>Fermer</button>
          {/* Natural-size preview of an already loaded static screenshot; next/image needs fixed dimensions. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shot.src} alt={shot.alt} />
        </div>
      )}
    </>
  );
}
