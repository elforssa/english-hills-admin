'use client';

import { useCrmRead } from '@/lib/crm/queries';
import { PROGRAMMES } from '@/lib/programCatalog.mjs';

// RWR-r5 §5.4 (migration 140): the live catalogue (programmes offered to prospects,
// prices, origins, close reasons) for reception, admin and the director.
export function useCatalogue(enabled = true) {
  return useCrmRead('get_catalogue', {}, enabled);
}

// The programmes a prospect form offers: the live « Proposé aux prospects » choice,
// the seed default until the catalogue has loaded. A current value no longer offered
// stays in the list so an edit never drops it silently.
export function prospectProgrammes(catalogue, current = '') {
  const live = catalogue?.programmes;
  const codes = live ? live.filter(p => p.active && p.crm_selectable).map(p => p.code)
    : PROGRAMMES.filter(p => p.crmSelectable).map(p => p.code);
  return current && !codes.includes(current) ? [current, ...codes] : codes;
}
