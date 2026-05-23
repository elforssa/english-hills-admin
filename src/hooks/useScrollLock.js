'use client';

import { useEffect } from 'react';

/**
 * Locks body scroll while a modal is mounted.
 * Prevents page scroll-through on iOS when a modal overlay is open.
 */
export function useScrollLock() {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
}
