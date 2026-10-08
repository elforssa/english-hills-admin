'use client';
import { useEffect, useRef, useState } from 'react';

// Which horizontal edges of a bounded scroll region currently clip content.
export function useOverflowEdges(ref) {
  const [edges, setEdges] = useState({ overflow: false, start: false, end: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      const next = { overflow: max > 1, start: el.scrollLeft > 1, end: el.scrollLeft < max - 1 };
      setEdges(old => old.overflow === next.overflow && old.start === next.start && old.end === next.end ? old : next);
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(el);
    if (el.firstElementChild) observer?.observe(el.firstElementChild);
    return () => { el.removeEventListener('scroll', update); observer?.disconnect(); };
  }, [ref]);
  return edges;
}
// Decorative fades marking a clipped side; the scrollbar itself stays visible.
export function EdgeFades({ edges }) {
  return <>{edges.start && <div aria-hidden data-edge-fade="start" className="pointer-events-none absolute inset-y-0 left-0 z-20 w-6 bg-gradient-to-r from-background to-transparent" />}{edges.end && <div aria-hidden data-edge-fade="end" className="pointer-events-none absolute inset-y-0 right-0 z-20 w-6 bg-gradient-to-l from-background to-transparent" />}</>;
}
// A single row that scrolls inside itself, never pushing the page wider.
export default function ScrollRow({ className = '', wrapperClassName = '', children, ...props }) {
  const ref = useRef(null), edges = useOverflowEdges(ref);
  return <div className={`relative min-w-0 max-w-full ${wrapperClassName}`}><div ref={ref} className={`flex max-w-full gap-1 overflow-x-auto ${className}`} {...props}>{children}</div><EdgeFades edges={edges} /></div>;
}
