'use client';
import { useCallback, useEffect, useState } from 'react';
import { createGuardedEntry, createLayerStack, nestedEscapeAction } from '@/lib/crm/presentation.mjs';

// Radix Menu/Tooltip/Select/Popover bundle their own dismissable-layer stack, so the
// sheet also believes it is topmost. These selectors identify a nested non-Dialog popup.
const POPUP_SURFACE = '[role="menu"],[role="listbox"],[role="tooltip"],[data-radix-popper-content-wrapper]';
const OPEN_POPUP = '[data-radix-popper-content-wrapper],[role="menu"][data-state="open"],[role="listbox"][data-state="open"],[role="tooltip"]';

// Page-local Escape guard for a modal Sheet. Pass onEscapeKeyDown to SheetContent and
// layers to every controlled popup rendered inside it (useGuardedLayer).
export function useNestedLayerEscapeGuard(active = true) {
  const [layers] = useState(createLayerStack);
  const [nested] = useState(() => new WeakSet());
  useEffect(() => {
    if (!active) return undefined;
    // Window capture runs before every Radix document listener: the DOM is unchanged.
    const snapshot = event => {
      if (event.key !== 'Escape') return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(POPUP_SURFACE) || document.querySelector(OPEN_POPUP)) nested.add(event);
    };
    window.addEventListener('keydown', snapshot, true);
    return () => window.removeEventListener('keydown', snapshot, true);
  }, [active, nested]);
  const onEscapeKeyDown = useCallback(event => {
    const action = nestedEscapeAction({ defaultPrevented: event.defaultPrevented, nestedDetected: nested.has(event), openCount: layers.size() });
    if (action !== 'close-top') return;
    // Block the sheet, then close exactly one popup; its own listener sees the prevented event.
    event.preventDefault();
    layers.closeTop();
  }, [layers, nested]);
  return { layers, onEscapeKeyDown };
}

// Controlled open state for one popup inside a guarded sheet.
export function useGuardedLayer(layers) {
  const [open, setOpen] = useState(false);
  const [entry] = useState(() => createGuardedEntry(() => setOpen(false)));
  const onOpenChange = useCallback(next => {
    if (next) { entry.opened(); layers.push(entry); } else { entry.closed(); layers.remove(entry); }
    setOpen(next);
  }, [entry, layers]);
  useEffect(() => () => { entry.closed(); layers.remove(entry); }, [entry, layers]);
  return { open, onOpenChange };
}
