'use client';
import { useEffect, useRef } from 'react';

// Presentational wrapper keeping a dialog's error alert and buttons visible while its
// body scrolls. Its height becomes the dialog's scroll padding, so a field focused by
// an error contract scrolls into view above the footer. Sticky insets stop at the
// scroll container's padding, so the dialog drops its bottom padding while it holds
// this footer (STICKY_DIALOG) and the footer carries it instead (p-4 / sm:p-6).
export default function DialogStickyFooter({ children }) {
  const ref = useRef(null);
  useEffect(() => {
    const footer = ref.current, dialog = footer?.closest('[role="dialog"]');
    if (!footer || !dialog || typeof ResizeObserver === 'undefined') return undefined;
    const write = () => dialog.style.setProperty('--crm-dialog-footer', `${footer.offsetHeight}px`);
    write();
    const observer = new ResizeObserver(write);
    observer.observe(footer);
    return () => { observer.disconnect(); dialog.style.removeProperty('--crm-dialog-footer'); };
  }, []);
  return <div ref={ref} data-dialog-footer className="sticky bottom-0 z-10 -mx-4 space-y-3 border-t bg-background px-4 pb-4 pt-3 sm:-mx-6 sm:px-6 sm:pb-6">{children}</div>;
}
// Call-site classes for the dialog's single scroll container.
export const STICKY_DIALOG = 'max-h-[calc(100dvh-2rem)] overflow-y-auto [scroll-padding-bottom:var(--crm-dialog-footer,0px)] has-[[data-dialog-footer]]:pb-0 sm:has-[[data-dialog-footer]]:pb-0';
// The alert part of the footer never pushes the buttons off-screen.
export const FOOTER_ALERT = 'max-h-[35dvh] overflow-y-auto';
